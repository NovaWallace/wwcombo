import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, Bell, BellOff, Crosshair, Eye, Gamepad2, Keyboard, MonitorUp, Move, Plus, RotateCcw, ScanLine, Square, Target, TestTube2, Trash2 } from 'lucide-react';
import { gamepadCodeLabel, keyboardMouseCodeLabel } from './gamepadIcons';
import type { GamepadIconSet } from './gamepadIcons';
import { HoldDragFeedback } from './HoldDragFeedback';
import { useI18n } from './i18n';
import {
  CountdownTimerTracker,
  DEFAULT_BUFF_ROI,
  UPSTREAM_TIMER_ROI,
  challengeTimerExpirySeconds,
  formatChallengeTimerSeconds,
  normalizeRealtimeVisionSettings,
  normalizeVisionRect
} from './realtimeVision';
import type {
  RealtimeBuffDefinition,
  RealtimeVisionOverlayBounds,
  RealtimeVisionSettings,
  StableTimerSnapshot,
  VisionRect
} from './realtimeVision';
import type {
  RealtimeVisionWorkerImage,
  RealtimeVisionWorkerRequest,
  RealtimeVisionWorkerResponse
} from './realtimeVisionWorker';
import { subscribeRealtimeVisionInput } from './realtimeVisionInput';
import type { RealtimeVisionInputSignal } from './realtimeVisionInput';
import './RealtimeVisionLab.css';

const STORAGE_KEY = 'wwcombo-realtime-vision-v1';
const SETTINGS_SCHEMA_VERSION = 11;
const ANALYSIS_MAX_WIDTH = 1280;
const DEFAULT_REALTIME_VISION_OVERLAY_BOUNDS: RealtimeVisionOverlayBounds = {
  x: 40,
  y: 80,
  width: 360,
  height: 76
};

type CaptureState = 'idle' | 'selecting' | 'running' | 'error';
type InputMode = 'keyboard' | 'gamepad';
type TimerRegionDrag = {
  pointerId: number;
  mode: 'move' | 'nw' | 'ne' | 'sw' | 'se';
  startX: number;
  startY: number;
  startRect: VisionRect;
};
type TriggeredBuff = {
  id: string;
  name: string;
  triggerCode: string;
  triggerMode: RealtimeBuffDefinition['triggerMode'];
  triggeredAtTimerSeconds: number;
  expiresAtTimerSeconds: number;
  remainingSeconds: number;
  warning: boolean;
  timerCorrectionPending: boolean;
};
type PendingTrigger = {
  buff: RealtimeBuffDefinition;
  eventTime: number;
  attempts: number;
  samples: number[];
};
type RealtimeOverlayScaleDrag = {
  pointerId: number;
  startX: number;
  originBounds: RealtimeVisionOverlayBounds;
  moved: boolean;
};

type RealtimeVisionLabProps = {
  desktop: NonNullable<Window['trainerDesktop']> | null;
  visible: boolean;
  inputMode: InputMode;
  gamepadIconSet: GamepadIconSet;
  globalInputEnabled: boolean;
  stopRequestToken: number;
  onRequestGlobalInput: () => void | Promise<void>;
  onActiveChange: (active: boolean) => void;
  onExit: () => void;
};

type StoredRealtimeVisionSettings = Partial<RealtimeVisionSettings> & { schemaVersion?: number };

function migrateSettings(value: StoredRealtimeVisionSettings, schemaVersion: number): RealtimeVisionSettings {
  const migrated: StoredRealtimeVisionSettings = {
    ...value,
    buffs: value.buffs?.map((buff) => ({ ...buff }))
  };
  if (schemaVersion < 3 && migrated.timerLuminanceThreshold === 180) {
    migrated.timerLuminanceThreshold = 200;
  }
  if (schemaVersion < 8) {
    if (migrated.overlayCorner === 'top-right') migrated.overlayCorner = 'top-left';
    migrated.buffs = migrated.buffs?.map((buff, index) => {
      const legacyDefault = buff.id === 'buff-1';
      return {
        ...buff,
        name: legacyDefault && (buff.name === '绯雪变奏 Buff' || buff.name === 'Buff 1') ? 'Buff 1' : buff.name,
        durationSeconds: legacyDefault && (Number(buff.durationSeconds) === 20 || Number(buff.durationSeconds) === 30)
          ? 15
          : buff.durationSeconds,
        triggerCode: '',
        triggerMode: 'press',
        triggerInputMode: 'keyboard',
        holdThresholdMs: 300,
        templateDataUrl: undefined,
        id: buff.id || `buff-${index + 1}`
      };
    });
  }
  if (schemaVersion < 10 && migrated.overlayBounds) {
    const scale = Math.min(4, Math.max(0.5, Number(migrated.overlayBounds.width) / 360 || 1));
    const rowCount = Math.min(6, Math.max(1, migrated.buffs?.length ?? 1));
    migrated.overlayBounds = {
      ...migrated.overlayBounds,
      height: (40 + 36 * rowCount) * scale
    };
  }
  return normalizeRealtimeVisionSettings(migrated);
}

function loadSettings(): RealtimeVisionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizeRealtimeVisionSettings(null);
    const parsed = JSON.parse(raw) as StoredRealtimeVisionSettings;
    return migrateSettings(parsed, parsed.schemaVersion ?? 0);
  } catch {
    return normalizeRealtimeVisionSettings(null);
  }
}

function boundedNumber(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeRealtimeOverlayBounds(
  value: Partial<RealtimeVisionOverlayBounds> | null | undefined,
  fallback = DEFAULT_REALTIME_VISION_OVERLAY_BOUNDS
): RealtimeVisionOverlayBounds {
  return {
    x: Number.isFinite(value?.x) ? Number(value!.x) : fallback.x,
    y: Number.isFinite(value?.y) ? Number(value!.y) : fallback.y,
    width: Number.isFinite(value?.width) ? Math.min(1440, Math.max(180, Number(value!.width))) : fallback.width,
    height: Number.isFinite(value?.height) ? Math.min(1000, Math.max(64, Number(value!.height))) : fallback.height
  };
}

function projectedTimerSeconds(snapshot: StableTimerSnapshot | null, now: number): number | null {
  if (!snapshot) return null;
  if (snapshot.stale) return snapshot.seconds;
  return Math.max(0, snapshot.seconds - Math.max(0, now - snapshot.observedAt) / 1000);
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function workerImage(image: ImageData): RealtimeVisionWorkerImage {
  return { width: image.width, height: image.height, buffer: image.data.buffer as ArrayBuffer };
}

function imageDataForVideoRect(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  rect: VisionRect,
  scale: number
): ImageData | null {
  const normalized = normalizeVisionRect(rect, rect);
  const sourceX = Math.floor(normalized.x * video.videoWidth);
  const sourceY = Math.floor(normalized.y * video.videoHeight);
  const sourceWidth = Math.max(1, Math.min(video.videoWidth - sourceX, Math.round(normalized.width * video.videoWidth)));
  const sourceHeight = Math.max(1, Math.min(video.videoHeight - sourceY, Math.round(normalized.height * video.videoHeight)));
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
  if (canvas.width !== targetWidth) canvas.width = targetWidth;
  if (canvas.height !== targetHeight) canvas.height = targetHeight;
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);
  try {
    return context.getImageData(0, 0, targetWidth, targetHeight);
  } catch {
    return null;
  }
}

function resizedRect(start: VisionRect, mode: TimerRegionDrag['mode'], dx: number, dy: number): VisionRect {
  const minimumWidth = 0.012;
  const minimumHeight = 0.018;
  if (mode === 'move') return normalizeVisionRect({ ...start, x: start.x + dx, y: start.y + dy }, start);
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (mode.includes('w')) left = Math.min(right - minimumWidth, left + dx);
  if (mode.includes('e')) right = Math.max(left + minimumWidth, right + dx);
  if (mode.includes('n')) top = Math.min(bottom - minimumHeight, top + dy);
  if (mode.includes('s')) bottom = Math.max(top + minimumHeight, bottom + dy);
  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(1, right);
  bottom = Math.min(1, bottom);
  return normalizeVisionRect({ x: left, y: top, width: right - left, height: bottom - top }, start);
}

function createBuff(index: number, inputMode: InputMode): RealtimeBuffDefinition {
  return {
    id: crypto.randomUUID(),
    name: `Buff ${index + 1}`,
    enabled: true,
    triggerCode: '',
    triggerMode: 'press',
    triggerInputMode: inputMode,
    holdThresholdMs: 300,
    durationSeconds: 15,
    warningLeadSeconds: 3,
    matchThreshold: 0.9,
    roi: { ...DEFAULT_BUFF_ROI },
    detectionWindowSeconds: 5
  };
}

function triggeredBuff(buff: RealtimeBuffDefinition, timerSeconds: number, timerCorrectionPending = false): TriggeredBuff | null {
  const expiresAt = challengeTimerExpirySeconds(timerSeconds, buff.durationSeconds);
  if (expiresAt === null) return null;
  return {
    id: buff.id,
    name: buff.name.trim() || 'Buff',
    triggerCode: buff.triggerCode,
    triggerMode: buff.triggerMode,
    triggeredAtTimerSeconds: timerSeconds,
    expiresAtTimerSeconds: expiresAt,
    remainingSeconds: Math.max(0, timerSeconds - expiresAt),
    warning: false,
    timerCorrectionPending
  };
}

function refreshTriggeredBuffs(
  entries: readonly TriggeredBuff[],
  timerSeconds: number | null,
  definitions: readonly RealtimeBuffDefinition[]
): TriggeredBuff[] {
  if (timerSeconds === null) return [...entries];
  const definitionsById = new Map(definitions.map((buff) => [buff.id, buff]));
  return entries.flatMap((entry) => {
    const definition = definitionsById.get(entry.id);
    if (!definition?.enabled) return [];
    if (timerSeconds > entry.triggeredAtTimerSeconds + 2) return [];
    const remainingSeconds = timerSeconds - entry.expiresAtTimerSeconds;
    if (remainingSeconds <= 0) return [];
    return [{
      ...entry,
      name: definition.name.trim() || entry.name,
      remainingSeconds,
      warning: remainingSeconds <= definition.warningLeadSeconds
    }];
  });
}

function correctTriggeredBuffs(
  entries: readonly TriggeredBuff[],
  timerSeconds: number,
  definitions: readonly RealtimeBuffDefinition[]
): TriggeredBuff[] {
  const definitionsById = new Map(definitions.map((buff) => [buff.id, buff]));
  return entries.map((entry) => {
    if (!entry.timerCorrectionPending) return entry;
    const definition = definitionsById.get(entry.id);
    return definition ? triggeredBuff(definition, timerSeconds, false) ?? entry : entry;
  });
}

function isPressSignal(signal: RealtimeVisionInputSignal): boolean {
  return signal.type === 'keydown' || signal.type === 'mousedown' || signal.type === 'gamepadbuttondown';
}

function isReleaseSignal(signal: RealtimeVisionInputSignal): boolean {
  return signal.type === 'keyup' || signal.type === 'mouseup' || signal.type === 'gamepadbuttonup';
}

export function RealtimeVisionLab({
  desktop,
  visible,
  inputMode,
  gamepadIconSet,
  globalInputEnabled,
  stopRequestToken,
  onRequestGlobalInput,
  onActiveChange,
  onExit
}: RealtimeVisionLabProps) {
  const { language, text } = useI18n();
  const [settings, setSettings] = useState(loadSettings);
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [captureError, setCaptureError] = useState('');
  const [sourceSize, setSourceSize] = useState({ width: 16, height: 9 });
  const [timerSnapshot, setTimerSnapshot] = useState<StableTimerSnapshot | null>(null);
  const [activeBuffs, setActiveBuffs] = useState<TriggeredBuff[]>([]);
  const [pendingBuffIds, setPendingBuffIds] = useState<Set<string>>(() => new Set());
  const [capturingBuffId, setCapturingBuffId] = useState<string | null>(null);
  const [overlayMoveMode, setOverlayMoveMode] = useState(false);
  const captureArmedAfterRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startAttemptRef = useRef(0);
  const handledStopRequestRef = useRef(stopRequestToken);
  const analysisTimerRef = useRef<number | null>(null);
  const requestAnalysisRef = useRef<() => void>(() => undefined);
  const resetTimerRef = useRef<() => void>(() => undefined);
  const dragRef = useRef<TimerRegionDrag | null>(null);
  const settingsRef = useRef(settings);
  const runningRef = useRef(false);
  const capturingBuffIdRef = useRef<string | null>(null);
  const timerResetAtRef = useRef(0);
  const activateBuffRef = useRef<(buff: RealtimeBuffDefinition, eventTime: number) => void>(() => undefined);
  const timerSnapshotRef = useRef<StableTimerSnapshot | null>(null);
  const timerTrackerRef = useRef(new CountdownTimerTracker());
  const pendingTriggersRef = useRef<PendingTrigger[]>([]);
  const pressedAtRef = useRef(new Map<string, number>());
  const lastPressAtRef = useRef(new Map<string, number>());
  const audioContextRef = useRef<AudioContext | null>(null);
  const warnedBuffIdsRef = useRef(new Set<string>());
  const desktopOverlayPendingRef = useRef<unknown | null>(null);
  const desktopOverlaySendingRef = useRef(false);
  const overlayMoveModeRef = useRef(false);
  const overlayScaleDragRef = useRef<RealtimeOverlayScaleDrag | null>(null);
  const overlayScaleSuppressClickRef = useRef(false);

  const running = captureState === 'running';
  settingsRef.current = settings;
  runningRef.current = running;
  capturingBuffIdRef.current = capturingBuffId;
  overlayMoveModeRef.current = overlayMoveMode;

  useEffect(() => {
    const initialBounds = settingsRef.current.overlayBounds;
    if (!initialBounds || !desktop?.setRealtimeVisionBounds) return;
    void desktop.setRealtimeVisionBounds(initialBounds).catch(() => undefined);
  }, [desktop]);

  useEffect(() => () => {
    overlayScaleDragRef.current = null;
    overlayMoveModeRef.current = false;
    void desktop?.setRealtimeVisionClickThrough?.(true).catch(() => undefined);
  }, [desktop]);

  useEffect(() => {
    if (!overlayMoveMode || (visible && settings.overlayEnabled)) return;
    setOverlayMoveMode(false);
    overlayMoveModeRef.current = false;
    void desktop?.setRealtimeVisionClickThrough?.(true).catch(() => undefined);
  }, [desktop, overlayMoveMode, settings.overlayEnabled, visible]);

  useEffect(() => {
    onActiveChange(running);
  }, [onActiveChange, running]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: SETTINGS_SCHEMA_VERSION, ...settings }));
      } catch {
        // Keep the current session usable if storage is unavailable.
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [settings]);

  const sendDesktopOverlay = useCallback((payload: unknown) => {
    const updateRealtimeVision = desktop?.updateRealtimeVision;
    if (!updateRealtimeVision) return;
    desktopOverlayPendingRef.current = payload;
    if (desktopOverlaySendingRef.current) return;
    desktopOverlaySendingRef.current = true;
    void (async () => {
      while (desktopOverlayPendingRef.current !== null) {
        const next = desktopOverlayPendingRef.current;
        desktopOverlayPendingRef.current = null;
        try {
          await updateRealtimeVision(next);
        } catch {
          // The in-app monitor remains available if the topmost window fails.
        }
      }
      desktopOverlaySendingRef.current = false;
    })();
  }, [desktop]);

  const playTone = useCallback((kind: 'detected' | 'warning') => {
    if (!settingsRef.current.soundEnabled) return;
    try {
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      void context.resume();
      const startAt = context.currentTime;
      const frequencies = kind === 'detected' ? [1040] : [880, 1120];
      frequencies.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const toneStart = startAt + index * 0.16;
        oscillator.type = 'square';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, toneStart);
        gain.gain.exponentialRampToValueAtTime(0.09, toneStart + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + 0.12);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(toneStart);
        oscillator.stop(toneStart + 0.13);
      });
    } catch {
      // Sound is optional.
    }
  }, []);

  const hideDesktopOverlay = useCallback(() => {
    sendDesktopOverlay({ visible: false, corner: settingsRef.current.overlayCorner, timer: null, buffs: [], moveMode: false });
  }, [sendDesktopOverlay]);

  const stopCapture = useCallback(() => {
    startAttemptRef.current += 1;
    if (analysisTimerRef.current !== null) window.clearTimeout(analysisTimerRef.current);
    analysisTimerRef.current = null;
    const stream = streamRef.current;
    streamRef.current = null;
    for (const track of stream?.getTracks() ?? []) {
      track.onended = null;
      track.stop();
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    timerTrackerRef.current.reset();
    timerSnapshotRef.current = null;
    pendingTriggersRef.current = [];
    pressedAtRef.current.clear();
    lastPressAtRef.current.clear();
    warnedBuffIdsRef.current.clear();
    setTimerSnapshot(null);
    setActiveBuffs([]);
    setPendingBuffIds(new Set());
    setCaptureState('idle');
    setOverlayMoveMode(false);
    overlayMoveModeRef.current = false;
    void desktop?.setRealtimeVisionClickThrough?.(true).catch(() => undefined);
    hideDesktopOverlay();
  }, [desktop, hideDesktopOverlay]);

  const resetTimer = useCallback(() => {
    timerResetAtRef.current = performance.now();
    timerTrackerRef.current.reset();
    timerSnapshotRef.current = null;
    pendingTriggersRef.current = [];
    warnedBuffIdsRef.current.clear();
    setTimerSnapshot(null);
    setActiveBuffs([]);
    setPendingBuffIds(new Set());
    requestAnalysisRef.current();
  }, []);

  resetTimerRef.current = resetTimer;

  useEffect(() => {
    if (handledStopRequestRef.current === stopRequestToken) return;
    handledStopRequestRef.current = stopRequestToken;
    stopCapture();
  }, [stopCapture, stopRequestToken]);

  useEffect(() => () => {
    startAttemptRef.current += 1;
    if (analysisTimerRef.current !== null) window.clearTimeout(analysisTimerRef.current);
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    hideDesktopOverlay();
    void audioContextRef.current?.close().catch(() => undefined);
  }, [hideDesktopOverlay]);

  async function startCapture() {
    const attemptId = startAttemptRef.current + 1;
    startAttemptRef.current = attemptId;
    setCaptureError('');
    await onRequestGlobalInput();
    const getDisplayMedia = navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices);
    if (!getDisplayMedia) {
      setCaptureState('error');
      setCaptureError(text('当前系统 WebView 不支持画面采集。', 'Screen capture is unavailable in this system WebView.'));
      return;
    }
    setCaptureState('selecting');
    try {
      if (settings.soundEnabled) {
        audioContextRef.current ??= new AudioContext();
        await audioContextRef.current.resume().catch(() => undefined);
      }
      const stream = await getDisplayMedia({
        video: { frameRate: { ideal: settings.sampleFps, max: 12 } },
        audio: false
      });
      if (attemptId !== startAttemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) throw new Error('preview-unavailable');
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('video-track-missing');
      track.onended = stopCapture;
      const trackSettings = track.getSettings();
      setSourceSize({ width: video.videoWidth || trackSettings.width || 1920, height: video.videoHeight || trackSettings.height || 1080 });
      timerTrackerRef.current.reset();
      timerSnapshotRef.current = null;
      pendingTriggersRef.current = [];
      setTimerSnapshot(null);
      setActiveBuffs([]);
      setCaptureState('running');
    } catch (error) {
      if (attemptId !== startAttemptRef.current) return;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCaptureState('error');
      setCaptureError(error instanceof DOMException && error.name === 'NotAllowedError'
        ? text('未选择游戏画面，Buff 计时没有启动。', 'No game view was selected. Buff timing did not start.')
        : text('无法启动游戏计时器识别。', 'Could not start game timer recognition.'));
      hideDesktopOverlay();
    }
  }

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let requestId = 0;
    let pendingRequestId = 0;
    const worker = new Worker(new URL('./realtimeVisionWorker.ts', import.meta.url), { type: 'module' });

    const scheduleNext = (capturedAt: number) => {
      if (cancelled) return;
      const interval = pendingTriggersRef.current.some((pending) => pending.attempts < 3)
        ? 90
        : 1000 / Math.max(1, settingsRef.current.sampleFps);
      analysisTimerRef.current = window.setTimeout(analyze, Math.max(20, interval - (performance.now() - capturedAt)));
    };

    const failWorker = () => {
      if (cancelled) return;
      cancelled = true;
      worker.terminate();
      stopCapture();
      setCaptureState('error');
      setCaptureError(text('计时器识别线程异常，请停止后重新选择游戏画面。', 'The timer worker failed. Stop and select the game view again.'));
    };

    worker.addEventListener('message', (event: MessageEvent<RealtimeVisionWorkerResponse>) => {
      if (cancelled || event.data.id !== pendingRequestId) return;
      if (event.data.error) {
        failWorker();
        return;
      }
      const responseAt = performance.now();
      const observedAt = Number.isFinite(event.data.capturedAt) ? event.data.capturedAt : responseAt;
      const readingAfterReset = event.data.capturedAt >= timerResetAtRef.current
        ? event.data.timerReading
        : null;
      const stableTimer = timerTrackerRef.current.update(readingAfterReset, observedAt);
      // Never expose an unconfirmed frame directly. Effects, motion blur, or
      // a partially rendered digit can otherwise shift the Buff deadline.
      const currentTimer = stableTimer;
      const confirmedTimer = stableTimer && !stableTimer.stale ? stableTimer : null;
      timerSnapshotRef.current = currentTimer;
      setTimerSnapshot(currentTimer);
      const frameTimerSeconds = projectedTimerSeconds(currentTimer, responseAt);

      if (pendingTriggersRef.current.length) {
        const activated: TriggeredBuff[] = [];
        const stillPending: PendingTrigger[] = [];
        for (const pending of pendingTriggersRef.current) {
          const samples = [...pending.samples];
          const capturedAfterTrigger = observedAt + 40 >= pending.eventTime;
          const attempts = pending.attempts + (capturedAfterTrigger ? 1 : 0);
          if (confirmedTimer && capturedAfterTrigger) {
            // Before the first usable reading we cannot know how long the game
            // clock was paused behind an animation. Bind to the recovered game
            // time instead of extrapolating from wall-clock time.
            samples.push(confirmedTimer.seconds);
          }
          const enoughFreshSamples = samples.length >= 2 || (attempts >= 3 && samples.length >= 1);
          const timerAtEvent = enoughFreshSamples ? median(samples.slice(-3)) : null;
          if (timerAtEvent === null) {
            stillPending.push({ ...pending, attempts, samples });
            continue;
          }
          const entry = triggeredBuff(pending.buff, timerAtEvent);
          if (entry) activated.push(entry);
        }
        pendingTriggersRef.current = stillPending;
        setPendingBuffIds(new Set(stillPending.map((item) => item.buff.id)));
        if (activated.length) {
          setActiveBuffs((current) => {
            const next = [...current];
            for (const entry of activated) {
              const index = next.findIndex((item) => item.id === entry.id);
              if (index >= 0) next[index] = entry;
              else next.push(entry);
            }
            return refreshTriggeredBuffs(next, frameTimerSeconds, settingsRef.current.buffs);
          });
          playTone('detected');
        }
      }
      setActiveBuffs((current) => {
        const corrected = confirmedTimer
          ? correctTriggeredBuffs(current, confirmedTimer.seconds, settingsRef.current.buffs)
          : current;
        return refreshTriggeredBuffs(corrected, frameTimerSeconds, settingsRef.current.buffs);
      });
      scheduleNext(responseAt);
    });
    worker.addEventListener('error', failWorker);

    const analyze = () => {
      if (cancelled) return;
      const capturedAt = performance.now();
      const video = videoRef.current;
      const canvas = analysisCanvasRef.current;
      const currentSettings = settingsRef.current;
      if (video && canvas && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
        const scale = Math.min(1, ANALYSIS_MAX_WIDTH / video.videoWidth);
        // Timer digits occupy only a small ROI. Keep them at source resolution;
        // downscaling the full frame to 1280 px merges the thin digit strokes.
        const timerImage = currentSettings.timerEnabled
          ? imageDataForVideoRect(video, canvas, currentSettings.timerRoi, 1)
          : null;
        const timer = timerImage ? {
          image: workerImage(timerImage),
          luminanceThreshold: currentSettings.timerLuminanceThreshold,
          colorMode: currentSettings.timerColorMode
        } : null;
        requestId += 1;
        pendingRequestId = requestId;
        const request: RealtimeVisionWorkerRequest = {
          id: requestId,
          capturedAt,
          sourceHeight: Math.max(1, Math.round(video.videoHeight * scale)),
          timer,
          buffs: []
        };
        worker.postMessage(request, timer ? [timer.image.buffer] : []);
        return;
      }
      scheduleNext(capturedAt);
    };
    requestAnalysisRef.current = () => {
      if (analysisTimerRef.current !== null) window.clearTimeout(analysisTimerRef.current);
      analysisTimerRef.current = null;
      analyze();
    };
    analyze();
    return () => {
      cancelled = true;
      requestAnalysisRef.current = () => undefined;
      worker.terminate();
      if (analysisTimerRef.current !== null) window.clearTimeout(analysisTimerRef.current);
      analysisTimerRef.current = null;
    };
  }, [playTone, running, stopCapture, text]);

  function activateBuff(buff: RealtimeBuffDefinition, eventTime: number) {
    const snapshot = timerSnapshotRef.current;
    const timerSeconds = projectedTimerSeconds(snapshot, eventTime);
    if (timerSeconds !== null) {
      const entry = triggeredBuff(buff, timerSeconds, Boolean(snapshot?.stale));
      if (entry) {
        pendingTriggersRef.current = pendingTriggersRef.current.filter((item) => item.buff.id !== buff.id);
        setPendingBuffIds((current) => {
          const next = new Set(current);
          next.delete(buff.id);
          return next;
        });
        setActiveBuffs((current) => {
          const next = current.filter((item) => item.id !== entry.id);
          return [...next, entry];
        });
        playTone('detected');
        return;
      }
    }
    pendingTriggersRef.current = [
      ...pendingTriggersRef.current.filter((item) => item.buff.id !== buff.id),
      { buff: { ...buff }, eventTime, attempts: 0, samples: [] }
    ];
    setPendingBuffIds((current) => new Set(current).add(buff.id));
    requestAnalysisRef.current();
  }

  activateBuffRef.current = activateBuff;

  useEffect(() => {
    return subscribeRealtimeVisionInput((signal) => {
      const code = signal.code;
      const capturingId = capturingBuffIdRef.current;
      if (capturingId && isPressSignal(signal)) {
        if (signal.time <= captureArmedAfterRef.current) return;
        if (code === 'Escape') {
          capturingBuffIdRef.current = null;
          setCapturingBuffId(null);
          return;
        }
        setSettings((previous) => ({
          ...previous,
          buffs: previous.buffs.map((buff) => buff.id === capturingId
            ? { ...buff, triggerCode: code, triggerInputMode: signal.inputMode }
            : buff)
        }));
        capturingBuffIdRef.current = null;
        setCapturingBuffId(null);
        return;
      }

      const previousPressAt = isPressSignal(signal) ? lastPressAtRef.current.get(code) : undefined;
      const duplicatePress = isPressSignal(signal)
        && previousPressAt !== undefined
        && signal.time - previousPressAt < 80;
      if (isPressSignal(signal)) lastPressAtRef.current.set(code, signal.time);
      if (isPressSignal(signal) && !duplicatePress) {
        const previousHoldAt = pressedAtRef.current.get(code);
        // A lost release event must not permanently disable a hold trigger.
        if (previousHoldAt === undefined || signal.time - previousHoldAt >= 10000) {
          pressedAtRef.current.set(code, signal.time);
        }
      }
      const pressedAt = isReleaseSignal(signal) ? pressedAtRef.current.get(code) : undefined;
      if (isReleaseSignal(signal)) pressedAtRef.current.delete(code);
      if (!runningRef.current) return;
      if (isPressSignal(signal) && signal.code === 'Escape') {
        resetTimerRef.current();
        return;
      }

      const matching = settingsRef.current.buffs.filter((buff) => {
        if (!buff.enabled || !buff.triggerCode || buff.triggerCode !== code || buff.triggerInputMode !== signal.inputMode) return false;
        if (buff.triggerMode === 'press') return isPressSignal(signal) && !duplicatePress;
        return isReleaseSignal(signal)
          && pressedAt !== undefined
          && signal.time - pressedAt >= buff.holdThresholdMs;
      });
      matching.forEach((buff) => activateBuffRef.current(buff, signal.time));
    });
  }, []);

  useEffect(() => {
    const nextWarningIds = new Set(activeBuffs.filter((buff) => buff.warning).map((buff) => buff.id));
    if ([...nextWarningIds].some((id) => !warnedBuffIdsRef.current.has(id))) playTone('warning');
    warnedBuffIdsRef.current = nextWarningIds;
  }, [activeBuffs, playTone]);

  useEffect(() => {
    const visibleOverlay = settings.overlayEnabled && (running || overlayMoveMode);
    const projectedTimerText = timerSnapshot
      ? formatChallengeTimerSeconds(projectedTimerSeconds(timerSnapshot, performance.now())) ?? timerSnapshot.text
      : null;
    sendDesktopOverlay({
      visible: visibleOverlay,
      corner: settings.overlayCorner,
      timer: timerSnapshot ? { text: projectedTimerText, confidence: timerSnapshot.confidence, stale: timerSnapshot.stale } : null,
      buffs: [
        ...activeBuffs.map((buff) => ({ ...buff })),
        ...settings.buffs.filter((buff) => buff.enabled && pendingBuffIds.has(buff.id) && !activeBuffs.some((active) => active.id === buff.id)).map((buff) => ({
          id: buff.id,
          name: buff.name.trim() || 'Buff',
          triggerCode: buff.triggerCode,
          triggerMode: buff.triggerMode,
          triggeredAtTimerSeconds: null,
          expiresAtTimerSeconds: null,
          remainingSeconds: null,
          warning: false,
          pending: true
        }))
      ],
      moveMode: overlayMoveMode,
      bounds: settings.overlayBounds,
      language
    });
  }, [activeBuffs, language, overlayMoveMode, pendingBuffIds, running, sendDesktopOverlay, settings.buffs, settings.overlayBounds, settings.overlayCorner, settings.overlayEnabled, timerSnapshot]);

  function updateBuff(id: string, patch: Partial<RealtimeBuffDefinition>) {
    setSettings((previous) => ({
      ...previous,
      buffs: previous.buffs.map((buff) => buff.id === id ? { ...buff, ...patch } : buff)
    }));
  }

  function removeBuff(id: string) {
    if (capturingBuffIdRef.current === id) capturingBuffIdRef.current = null;
    setCapturingBuffId((current) => current === id ? null : current);
    setSettings((previous) => ({ ...previous, buffs: previous.buffs.filter((buff) => buff.id !== id) }));
    setActiveBuffs((current) => current.filter((buff) => buff.id !== id));
    pendingTriggersRef.current = pendingTriggersRef.current.filter((item) => item.buff.id !== id);
    setPendingBuffIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function toggleBuffInputCapture(id: string) {
    const next = capturingBuffIdRef.current === id ? null : id;
    capturingBuffIdRef.current = next;
    setCapturingBuffId(next);
    captureArmedAfterRef.current = performance.now() + 120;
  }

  function beginRegionDrag(event: ReactPointerEvent, mode: TimerRegionDrag['mode']) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      pointerId: event.pointerId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startRect: settingsRef.current.timerRoi
    };
    stageRef.current?.setPointerCapture(event.pointerId);
  }

  function moveRegion(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !stage) return;
    event.preventDefault();
    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const next = resizedRect(
      drag.startRect,
      drag.mode,
      (event.clientX - drag.startX) / bounds.width,
      (event.clientY - drag.startY) / bounds.height
    );
    setSettings((previous) => ({ ...previous, timerRoi: next }));
  }

  function endRegionDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    stageRef.current?.releasePointerCapture(event.pointerId);
  }

  async function readRealtimeOverlayBounds(): Promise<RealtimeVisionOverlayBounds> {
    const fallback = normalizeRealtimeOverlayBounds(settingsRef.current.overlayBounds);
    const live = await desktop?.getRealtimeVisionBounds?.().catch(() => null);
    const next = normalizeRealtimeOverlayBounds(live, fallback);
    setSettings((previous) => ({ ...previous, overlayBounds: next }));
    return next;
  }

  function updateRealtimeOverlayBounds(value: RealtimeVisionOverlayBounds) {
    const next = normalizeRealtimeOverlayBounds(value);
    setSettings((previous) => ({ ...previous, overlayBounds: next }));
    const request = desktop?.setRealtimeVisionBounds?.(next);
    if (request) void request.catch(() => undefined);
  }

  async function toggleRealtimeOverlayMoveMode() {
    if (overlayScaleSuppressClickRef.current) {
      overlayScaleSuppressClickRef.current = false;
      return;
    }
    const enabled = !overlayMoveModeRef.current;
    await readRealtimeOverlayBounds();
    overlayMoveModeRef.current = enabled;
    setOverlayMoveMode(enabled);
    const request = desktop?.setRealtimeVisionClickThrough?.(!enabled);
    if (request) await request.catch(() => undefined);
  }

  function beginRealtimeOverlayScaleDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const originBounds = normalizeRealtimeOverlayBounds(settingsRef.current.overlayBounds);
    overlayScaleDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      originBounds,
      moved: false
    };
    overlayScaleSuppressClickRef.current = false;
  }

  function moveRealtimeOverlayScaleDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = overlayScaleDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaX) < 4) return;
    drag.moved = true;
    overlayScaleSuppressClickRef.current = true;
    event.preventDefault();
    event.stopPropagation();
    const width = Math.min(1440, Math.max(180, drag.originBounds.width + deltaX));
    const scale = width / Math.max(1, drag.originBounds.width);
    updateRealtimeOverlayBounds({
      ...drag.originBounds,
      width,
      height: Math.min(1000, Math.max(64, drag.originBounds.height * scale))
    });
  }

  function endRealtimeOverlayScaleDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = overlayScaleDragRef.current;
    if (drag?.pointerId === event.pointerId) overlayScaleDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    window.setTimeout(() => { overlayScaleSuppressClickRef.current = false; }, 0);
  }

  function inputLabel(buff: RealtimeBuffDefinition): string {
    if (!buff.triggerCode) return text('未设置', 'Not set');
    return buff.triggerInputMode === 'gamepad'
      ? gamepadCodeLabel(buff.triggerCode, gamepadIconSet)
      : keyboardMouseCodeLabel(buff.triggerCode);
  }

  const statusText = captureState === 'running'
    ? text('计时识别中', 'Reading timer')
    : captureState === 'selecting'
      ? text('等待选择画面', 'Waiting for source')
      : captureState === 'error'
        ? text('启动失败', 'Could not start')
        : text('未启动', 'Stopped');
  const timerConfidence = timerSnapshot ? `${Math.round(timerSnapshot.confidence * 100)}%` : '--';
  const displayedTimerText = timerSnapshot
    ? formatChallengeTimerSeconds(projectedTimerSeconds(timerSnapshot, performance.now())) ?? timerSnapshot.text
    : null;
  const captureAspectRatio = `${Math.max(1, sourceSize.width)} / ${Math.max(1, sourceSize.height)}`;

  return <section className="realtime-vision-lab" data-trainer-capture-suspend={visible ? 'true' : undefined} hidden={!visible}>
    <header className="panel-title experiment-subtitle realtime-vision-heading">
      <div>
        <h2>{text('按键 Buff 计时', 'Key-triggered Buff Timer')}</h2>
        <p>{text('只识别游戏计时器；按键触发后记录游戏时间，并显示 Buff 的结束时间。按 Esc 可复用结束练习的按键并直接重置计时。', 'Only the game timer is recognized. A configured input records game time and shows when the Buff ends. Press Esc to reuse the practice stop key and reset the timer.')}</p>
      </div>
      <div className="realtime-vision-heading-actions">
        <button type="button" onClick={resetTimer}><RotateCcw size={17} />{text('重置计时 Esc', 'Reset Timer Esc')}</button>
        {!running
          ? <button className="primary" type="button" disabled={captureState === 'selecting'} onClick={() => void startCapture()}><MonitorUp size={18} />{text('选择游戏画面', 'Select Game View')}</button>
          : <button type="button" onClick={stopCapture}><Square size={17} />{text('停止计时', 'Stop Timer')}</button>}
        <button className="icon-button experiment-back-button" type="button" onClick={onExit} title={text('返回', 'Back')}><ArrowLeft size={18} /></button>
      </div>
    </header>

    <div className="realtime-vision-status-strip">
      <span className={`realtime-vision-state ${captureState}`}><i />{statusText}</span>
      <span>{text('游戏时间', 'Game Time')} <strong>{displayedTimerText ?? '--:--'}</strong></span>
      <span>{text('OCR 可信度', 'OCR Confidence')} <strong>{timerConfidence}</strong></span>
      <span>{text('活动计时', 'Active Timers')} <strong>{activeBuffs.length + pendingBuffIds.size}</strong></span>
      {captureError && <span className="realtime-vision-error">{captureError}</span>}
    </div>

    <div className="realtime-vision-layout">
      <div className="realtime-vision-stage-column">
        <div
          ref={stageRef}
          className={`realtime-vision-stage ${running ? 'running' : ''}`}
          style={{ aspectRatio: captureAspectRatio }}
          onPointerMove={moveRegion}
          onPointerUp={endRegionDrag}
          onPointerCancel={endRegionDrag}
        >
          <video ref={videoRef} muted playsInline />
          {!running && <div className="realtime-vision-stage-empty"><ScanLine size={62} /><strong>{text('等待游戏画面', 'Waiting for game view')}</strong></div>}
          {settings.timerEnabled && <div
            className="realtime-vision-region selected timer"
            style={{ left: `${settings.timerRoi.x * 100}%`, top: `${settings.timerRoi.y * 100}%`, width: `${settings.timerRoi.width * 100}%`, height: `${settings.timerRoi.height * 100}%` }}
            onPointerDown={(event) => beginRegionDrag(event, 'move')}
          >
            <span>{text('游戏计时器', 'Game Timer')}</span>
            {(['nw', 'ne', 'sw', 'se'] as const).map((edge) => <i key={edge} className={edge} onPointerDown={(event) => beginRegionDrag(event, edge)} />)}
          </div>}
        </div>
        <canvas ref={analysisCanvasRef} className="realtime-vision-analysis-canvas" aria-hidden="true" />
        <div className="realtime-vision-monitor-grid">
          {activeBuffs.map((buff) => <div key={buff.id} className={`realtime-vision-monitor present ${buff.warning ? 'warning' : ''}`}>
            <span>{buff.name}</span>
            <strong>{buff.triggerMode === 'press' ? text('按下触发', 'On press') : text('长按松开', 'Hold and release')}</strong>
            <div className="realtime-vision-monitor-timing">
              <em>{text('结束', 'Ends')} {formatChallengeTimerSeconds(buff.expiresAtTimerSeconds)}</em>
              <small>{text('触发', 'Triggered')} {formatChallengeTimerSeconds(buff.triggeredAtTimerSeconds)} · {text('剩余', 'Remaining')} {Math.max(0, buff.remainingSeconds).toFixed(buff.remainingSeconds < 10 ? 1 : 0)}s</small>
            </div>
          </div>)}
          {settings.buffs.filter((buff) => pendingBuffIds.has(buff.id) && !activeBuffs.some((active) => active.id === buff.id)).map((buff) => <div key={`pending-${buff.id}`} className="realtime-vision-monitor pending"><span>{buff.name}</span><strong>{text('已收到按键', 'Input received')}</strong><small>{text('正在等待游戏计时器读数', 'Waiting for the game timer reading')}</small></div>)}
          {!activeBuffs.length && !pendingBuffIds.size && <div className="realtime-vision-monitor empty">{text('按下已配置的按键后，这里和左上角提示区会显示触发时间与结束时间。', 'Press a configured input to show its trigger and end times here and in the top-left alert.')}</div>}
        </div>
      </div>

      <aside className="realtime-vision-controls">
        <section className="realtime-vision-control-section">
          <div className="realtime-vision-section-heading"><div><ScanLine size={17} /><strong>{text('计时与提醒', 'Timer and Alerts')}</strong></div></div>
          <div className="realtime-vision-field-grid">
            <label>{text('计时器采样率', 'Timer Sample Rate')}<select value={settings.sampleFps} onChange={(event) => setSettings((previous) => ({ ...previous, sampleFps: Number(event.target.value) }))}><option value={2}>2 FPS</option><option value={3}>3 FPS</option><option value={5}>5 FPS</option><option value={8}>8 FPS</option></select></label>
            <div className="realtime-vision-overlay-position-field">
              <label>{text('提醒位置', 'Alert Corner')}<select value={settings.overlayCorner} onChange={(event) => setSettings((previous) => ({ ...previous, overlayCorner: event.target.value as RealtimeVisionSettings['overlayCorner'], overlayBounds: undefined }))}><option value="top-left">{text('左上', 'Top Left')}</option><option value="top-right">{text('右上', 'Top Right')}</option><option value="bottom-left">{text('左下', 'Bottom Left')}</option><option value="bottom-right">{text('右下', 'Bottom Right')}</option></select></label>
              <button className={`icon-button hold-drag-control realtime-vision-overlay-move-button ${overlayMoveMode ? 'active' : ''}`} type="button" disabled={!settings.overlayEnabled} aria-pressed={overlayMoveMode} aria-label={text('移动或缩放 Buff 提示区', 'Move or scale the Buff alert')} title={text('点击移动 Buff 提示区；左右拖动缩放', 'Click to move the Buff alert; drag horizontally to scale')} onClick={() => void toggleRealtimeOverlayMoveMode()} onPointerDown={beginRealtimeOverlayScaleDrag} onPointerMove={moveRealtimeOverlayScaleDrag} onPointerUp={endRealtimeOverlayScaleDrag} onPointerCancel={endRealtimeOverlayScaleDrag}><Move size={17} /><HoldDragFeedback /></button>
            </div>
          </div>
          <div className="realtime-vision-toggle-row">
            <label><input type="checkbox" checked={settings.overlayEnabled} onChange={(event) => setSettings((previous) => ({ ...previous, overlayEnabled: event.target.checked }))} /><Eye size={16} />{text('置顶提醒', 'Topmost Alert')}</label>
            <label><input type="checkbox" checked={settings.soundEnabled} onChange={(event) => setSettings((previous) => ({ ...previous, soundEnabled: event.target.checked }))} />{settings.soundEnabled ? <Bell size={16} /> : <BellOff size={16} />}{text('提示音', 'Sound')}</label>
          </div>
          <div className={`realtime-vision-global-input ${globalInputEnabled ? 'ready' : 'warning'}`}>
            {globalInputEnabled ? <Target size={16} /> : <Crosshair size={16} />}
            <span>{globalInputEnabled
              ? text('全局捕获已开启，切回游戏后仍可触发。', 'Global capture is enabled. Inputs still trigger while the game is focused.')
              : text('全局捕获未开启；切回游戏后无法收到按键。', 'Global capture is off. Inputs cannot be received while the game is focused.')}</span>
            {!globalInputEnabled && <button type="button" onClick={() => void onRequestGlobalInput()}>{text('开启', 'Enable')}</button>}
          </div>
        </section>

        <section className="realtime-vision-control-section selected">
          <div className="realtime-vision-section-heading"><div><Crosshair size={17} /><strong>{text('游戏计时器区域', 'Game Timer Region')}</strong></div><label className="realtime-vision-switch"><input type="checkbox" checked={settings.timerEnabled} onChange={(event) => setSettings((previous) => ({ ...previous, timerEnabled: event.target.checked }))} /><span /></label></div>
          <div className="realtime-vision-field-grid">
            <div className="realtime-vision-color-mode-field"><span>{text('计时器颜色', 'Timer Color')}</span><div className="segmented" role="group" aria-label={text('计时器颜色', 'Timer Color')}><button type="button" className={settings.timerColorMode === 'white' ? 'active' : ''} onClick={() => setSettings((previous) => ({ ...previous, timerColorMode: 'white' }))}>{text('白色', 'White')}</button><button type="button" className={settings.timerColorMode === 'blue' ? 'active' : ''} onClick={() => setSettings((previous) => ({ ...previous, timerColorMode: 'blue' }))}>{text('蓝色', 'Blue')}</button><button type="button" className={settings.timerColorMode === 'auto' ? 'active' : ''} onClick={() => setSettings((previous) => ({ ...previous, timerColorMode: 'auto' }))}>{text('自动', 'Auto')}</button></div></div>
            <label>{text('亮度门槛', 'Brightness Gate')}<input type="number" min={110} max={245} value={settings.timerLuminanceThreshold} onChange={(event) => setSettings((previous) => ({ ...previous, timerLuminanceThreshold: boundedNumber(event.target.value, 110, 245, previous.timerLuminanceThreshold) }))} /></label>
            <label>{text('当前结果', 'Current Result')}<output>{displayedTimerText ?? '--:--'}</output></label>
          </div>
          <button type="button" onClick={() => setSettings((previous) => ({ ...previous, timerRoi: { ...UPSTREAM_TIMER_ROI } }))}><RotateCcw size={16} />{text('恢复默认计时器区域', 'Reset Timer Region')}</button>
        </section>

        <section className="realtime-vision-control-section realtime-vision-buff-section">
          <div className="realtime-vision-section-heading"><div><Target size={17} /><strong>{text('按键计时项目', 'Key-triggered Timers')}</strong></div><button className="icon-button" type="button" onClick={() => setSettings((previous) => ({ ...previous, buffs: [...previous.buffs, createBuff(previous.buffs.length, inputMode)] }))} title={text('添加计时项目', 'Add Timer')}><Plus size={17} /></button></div>
          <div className="realtime-vision-buff-list">
            {settings.buffs.map((buff) => {
              const capturing = capturingBuffId === buff.id;
              return <article key={buff.id} className="realtime-vision-buff-row">
                <div className="realtime-vision-trigger-main">
                  <label className="realtime-vision-name-field"><span>{text('名称', 'Name')}</span><input value={buff.name} onChange={(event) => updateBuff(buff.id, { name: event.target.value.slice(0, 40) })} /></label>
                  <label className="realtime-vision-switch"><input type="checkbox" checked={buff.enabled} onChange={(event) => updateBuff(buff.id, { enabled: event.target.checked })} /><span /></label>
                  <button className="icon-button danger" type="button" onClick={() => removeBuff(buff.id)} title={text('删除计时项目', 'Delete Timer')}><Trash2 size={16} /></button>
                </div>
                <div className="realtime-vision-trigger-binding">
                  <button className={`realtime-vision-binding-button ${capturing ? 'active' : ''}`} type="button" onPointerDown={(event) => { event.preventDefault(); toggleBuffInputCapture(buff.id); }}>
                    {buff.triggerInputMode === 'gamepad' ? <Gamepad2 size={16} /> : <Keyboard size={16} />}
                    {capturing ? text('请按下目标按键', 'Press the target input') : inputLabel(buff)}
                  </button>
                  {buff.triggerCode && <button className="icon-button" type="button" title={text('清除按键', 'Clear Input')} onClick={() => updateBuff(buff.id, { triggerCode: '' })}><RotateCcw size={14} /></button>}
                  <div className="segmented realtime-vision-trigger-mode">
                    <button className={buff.triggerMode === 'press' ? 'active' : ''} type="button" onClick={() => updateBuff(buff.id, { triggerMode: 'press' })}>{text('按下', 'Press')}</button>
                    <button className={buff.triggerMode === 'hold-release' ? 'active' : ''} type="button" onClick={() => updateBuff(buff.id, { triggerMode: 'hold-release' })}>{text('长按松开', 'Hold & Release')}</button>
                  </div>
                </div>
                <div className={`realtime-vision-field-grid ${buff.triggerMode === 'hold-release' ? 'three' : ''}`}>
                  <label>{text('持续秒数', 'Duration')}<input type="number" min={0.1} max={600} step={0.1} value={buff.durationSeconds} onChange={(event) => updateBuff(buff.id, { durationSeconds: boundedNumber(event.target.value, 0.1, 600, buff.durationSeconds) })} /></label>
                  <label>{text('结束前警示', 'Warn Before')}<input type="number" min={0} max={120} step={0.1} value={buff.warningLeadSeconds} onChange={(event) => updateBuff(buff.id, { warningLeadSeconds: boundedNumber(event.target.value, 0, 120, buff.warningLeadSeconds) })} /></label>
                  {buff.triggerMode === 'hold-release' && <label>{text('长按门槛（秒）', 'Hold Threshold (s)')}<input type="number" min={0.1} max={5} step={0.05} value={buff.holdThresholdMs / 1000} onChange={(event) => updateBuff(buff.id, { holdThresholdMs: Math.round(boundedNumber(event.target.value, 0.1, 5, buff.holdThresholdMs / 1000) * 1000) })} /></label>}
                </div>
                <div className="realtime-vision-trigger-actions">
                  <small>{buff.triggerMode === 'press'
                    ? text('按下按键的时刻作为 Buff 起点。', 'The key-down moment is used as the Buff start.')
                    : text('按住达到门槛并松开，松开的时刻作为 Buff 起点。', 'Hold past the threshold and release; the release moment is used as the Buff start.')}</small>
                  <button type="button" disabled={!running || !timerSnapshot || !buff.triggerCode} onClick={() => activateBuff(buff, performance.now())}><TestTube2 size={15} />{text('测试', 'Test')}</button>
                </div>
              </article>;
            })}
          </div>
        </section>
      </aside>
    </div>
  </section>;
}
