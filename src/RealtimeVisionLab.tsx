import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, Bell, BellOff, Camera, Crosshair, Eye, ImagePlus, MonitorUp, Play, Plus, RotateCcw, ScanLine, Square, Trash2, Upload } from 'lucide-react';
import { useI18n } from './i18n';
import {
  BUILTIN_FEIXUE_BUFF_TEMPLATE_URL,
  BuffRuntimeTracker,
  CountdownTimerTracker,
  DEFAULT_BUFF_ROI,
  DEFAULT_BUFF_SEARCH_ROI,
  UPSTREAM_TIMER_ROI,
  formatChallengeTimerSeconds,
  normalizeRealtimeVisionSettings,
  normalizeVisionRect,
  shouldScanRealtimeBuff,
  visualTemplateFromDataUrl
} from './realtimeVision';
import type {
  BuffRuntimeSnapshot,
  RealtimeBuffDefinition,
  RealtimeVisionSettings,
  StableTimerSnapshot,
  VisionRect,
  VisualTemplate
} from './realtimeVision';
import type {
  RealtimeVisionWorkerImage,
  RealtimeVisionWorkerRequest,
  RealtimeVisionWorkerResponse
} from './realtimeVisionWorker';
import type { ComboChart, PracticeSnapshot } from '../combo-core/types';
import './RealtimeVisionLab.css';

const STORAGE_KEY = 'wwcombo-realtime-vision-v1';
const SETTINGS_SCHEMA_VERSION = 7;
const ANALYSIS_MAX_WIDTH = 1280;
const OVERLAY_UPDATE_INTERVAL_MS = 250;

type CaptureState = 'idle' | 'selecting' | 'running' | 'error';
type RegionId = 'timer' | string;
type RegionResizeMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';
type RegionDrag = {
  pointerId: number;
  regionId: RegionId;
  mode: RegionResizeMode;
  startX: number;
  startY: number;
  startRect: VisionRect;
};

type RealtimeVisionLabProps = {
  desktop: NonNullable<Window['trainerDesktop']> | null;
  chart: ComboChart | null;
  practice: PracticeSnapshot;
  visible: boolean;
  comboOverlayVisible: boolean;
  stopRequestToken: number;
  onActiveChange: (active: boolean) => void;
  onStartPractice: () => void;
  onStopPractice: () => void;
  onToggleComboOverlay: () => void | Promise<void>;
  onExit: () => void;
};

type WarningLogEntry = {
  id: string;
  name: string;
  at: number;
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
  if (schemaVersion < 4) {
    migrated.buffs = migrated.buffs?.map((buff) => {
      const builtInFeixue = buff.id === 'buff-1'
        && (!buff.templateDataUrl || buff.templateDataUrl === BUILTIN_FEIXUE_BUFF_TEMPLATE_URL);
      return builtInFeixue && Number(buff.durationSeconds) === 20
        ? { ...buff, durationSeconds: 30 }
        : buff;
    });
  }
  if (schemaVersion < 5) {
    migrated.buffs = migrated.buffs?.map((buff) => {
      const builtInFeixue = buff.id === 'buff-1'
        && (!buff.templateDataUrl || buff.templateDataUrl === BUILTIN_FEIXUE_BUFF_TEMPLATE_URL);
      return builtInFeixue && Math.abs(Number(buff.matchThreshold) - 0.88) < 0.0001
        ? { ...buff, matchThreshold: 0.9 }
        : buff;
    });
  }
  if (schemaVersion < 6) {
    migrated.buffs = migrated.buffs?.map((buff) => {
      const builtInFeixue = buff.id === 'buff-1'
        && (!buff.templateDataUrl || buff.templateDataUrl === BUILTIN_FEIXUE_BUFF_TEMPLATE_URL);
      return builtInFeixue && Math.abs(Number(buff.matchThreshold) - 0.9) < 0.0001
        ? { ...buff, matchThreshold: 0.93 }
        : buff;
    });
  }
  if (schemaVersion < 7) {
    migrated.buffs = migrated.buffs?.map((buff) => {
      const builtInFeixue = buff.id === 'buff-1'
        && (!buff.templateDataUrl || buff.templateDataUrl === BUILTIN_FEIXUE_BUFF_TEMPLATE_URL);
      const threshold = Number(buff.matchThreshold);
      return builtInFeixue && (Math.abs(threshold - 0.9) < 0.0001 || Math.abs(threshold - 0.93) < 0.0001)
        ? { ...buff, matchThreshold: 0.86 }
        : buff;
    });
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

function formatRemaining(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--';
  return `${Math.max(0, seconds).toFixed(seconds < 10 ? 1 : 0)}s`;
}

function formatElapsed(milliseconds: number): string {
  return `${(Math.max(0, milliseconds) / 1000).toFixed(1)}s`;
}

function boundedNumber(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('invalid-image'));
    reader.onerror = () => reject(reader.error ?? new Error('image-read-failed'));
    reader.readAsDataURL(file);
  });
}

function workerImage(image: ImageData): RealtimeVisionWorkerImage {
  return {
    width: image.width,
    height: image.height,
    buffer: image.data.buffer as ArrayBuffer
  };
}

function projectedTimerSeconds(snapshot: StableTimerSnapshot | null, now: number): number | null {
  if (!snapshot) return null;
  return Math.max(0, snapshot.seconds - Math.max(0, now - snapshot.observedAt) / 1000);
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

function regionRect(settings: RealtimeVisionSettings, regionId: RegionId): VisionRect | null {
  if (regionId === 'timer') return settings.timerRoi;
  return settings.buffs.find((buff) => buff.id === regionId)?.roi ?? null;
}

function resizedRect(start: VisionRect, mode: RegionResizeMode, dx: number, dy: number): VisionRect {
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
  if (right - left < minimumWidth) right = Math.min(1, left + minimumWidth);
  if (bottom - top < minimumHeight) bottom = Math.min(1, top + minimumHeight);
  return normalizeVisionRect({ x: left, y: top, width: right - left, height: bottom - top }, start);
}

function createBuff(index: number): RealtimeBuffDefinition {
  const offset = Math.min(0.25, index * 0.045);
  return {
    id: crypto.randomUUID(),
    name: `Buff ${index + 1}`,
    enabled: true,
    durationSeconds: 20,
    warningLeadSeconds: 3,
    matchThreshold: 0.9,
    roi: normalizeVisionRect({ ...DEFAULT_BUFF_ROI, x: DEFAULT_BUFF_ROI.x + offset }, DEFAULT_BUFF_ROI),
    detectionWindowSeconds: 5
  };
}

export function RealtimeVisionLab({
  desktop,
  chart,
  practice,
  visible,
  comboOverlayVisible,
  stopRequestToken,
  onActiveChange,
  onStartPractice,
  onStopPractice,
  onToggleComboOverlay,
  onExit
}: RealtimeVisionLabProps) {
  const { language, text } = useI18n();
  const [settings, setSettings] = useState(loadSettings);
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [captureError, setCaptureError] = useState('');
  const [sourceSize, setSourceSize] = useState({ width: 16, height: 9 });
  const [selectedRegionId, setSelectedRegionId] = useState<RegionId>('timer');
  const [timerSnapshot, setTimerSnapshot] = useState<StableTimerSnapshot | null>(null);
  const [buffSnapshots, setBuffSnapshots] = useState<BuffRuntimeSnapshot[]>([]);
  const [warningLog, setWarningLog] = useState<WarningLogEntry[]>([]);
  const [templateReadyIds, setTemplateReadyIds] = useState<Set<string>>(new Set());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const buffAnalysisCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const streamRef = useRef<MediaStream | null>(null);
  const startAttemptRef = useRef(0);
  const handledStopRequestRef = useRef(stopRequestToken);
  const analysisTimerRef = useRef<number | null>(null);
  const dragRef = useRef<RegionDrag | null>(null);
  const settingsRef = useRef(settings);
  const templatesRef = useRef<Map<string, VisualTemplate>>(new Map());
  const chartRef = useRef(chart);
  const practiceRef = useRef(practice);
  const timerTrackerRef = useRef(new CountdownTimerTracker());
  const buffTrackerRef = useRef(new BuffRuntimeTracker());
  const audioContextRef = useRef<AudioContext | null>(null);
  const desktopOverlayPendingRef = useRef<unknown | null>(null);
  const desktopOverlaySendingRef = useRef(false);
  const visibleRef = useRef(visible);
  const sourceSizeRef = useRef({ width: 16, height: 9 });
  const activeBuffIdsRef = useRef<Set<string>>(new Set());

  const running = captureState === 'running';
  const selectedBuff = selectedRegionId === 'timer' ? null : settings.buffs.find((buff) => buff.id === selectedRegionId) ?? null;
  chartRef.current = chart;
  practiceRef.current = practice;
  visibleRef.current = visible;

  useEffect(() => {
    let storedSchemaVersion = 0;
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as StoredRealtimeVisionSettings;
      storedSchemaVersion = stored.schemaVersion ?? 0;
    } catch {
      // The current in-memory settings can still be normalized.
    }
    setSettings((previous) => {
      const normalized = migrateSettings(previous, storedSchemaVersion);
      return JSON.stringify(normalized) === JSON.stringify(previous) ? previous : normalized;
    });
  }, []);

  useEffect(() => {
    onActiveChange(running);
  }, [onActiveChange, running]);

  useEffect(() => {
    settingsRef.current = settings;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: SETTINGS_SCHEMA_VERSION, ...settings }));
      } catch {
        // Recognition keeps working for the session if local storage is full.
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    const templates = settings.buffs.filter((buff) => Boolean(buff.templateDataUrl));
    void Promise.all(templates.map(async (buff) => {
      try {
        return [buff.id, await visualTemplateFromDataUrl(buff.templateDataUrl!)] as const;
      } catch {
        return null;
      }
    })).then((entries) => {
      if (cancelled) return;
      const next = new Map<string, VisualTemplate>();
      for (const entry of entries) if (entry) next.set(entry[0], entry[1]);
      templatesRef.current = next;
      setTemplateReadyIds(new Set(next.keys()));
    });
    return () => { cancelled = true; };
  }, [settings.buffs]);

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
          // Recognition remains active if the optional topmost window fails.
        }
      }
      desktopOverlaySendingRef.current = false;
    })();
  }, [desktop]);

  const hideDesktopOverlay = useCallback(() => {
    sendDesktopOverlay({ visible: false, corner: settingsRef.current.overlayCorner, timer: null, buffs: [] });
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
    buffTrackerRef.current.reset();
    activeBuffIdsRef.current.clear();
    buffAnalysisCanvasesRef.current.clear();
    setTimerSnapshot(null);
    setBuffSnapshots([]);
    setCaptureState('idle');
    hideDesktopOverlay();
  }, [hideDesktopOverlay]);

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

  function playTone(kind: 'detected' | 'warning') {
    if (!settingsRef.current.soundEnabled) return;
    try {
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      void context.resume();
      const startAt = context.currentTime;
      const frequencies = kind === 'detected' ? [1040] : [880, 1120];
      for (const [index, frequency] of frequencies.entries()) {
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
      }
    } catch {
      // Audio alerts are optional; the overlay remains available.
    }
  }

  async function startCapture() {
    const attemptId = startAttemptRef.current + 1;
    startAttemptRef.current = attemptId;
    setCaptureError('');
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
        video: { frameRate: { ideal: settings.sampleFps, max: 15 } },
        audio: false
      });
      if (attemptId !== startAttemptRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      const video = videoRef.current;
      if (!video) {
        for (const track of stream.getTracks()) track.stop();
        throw new Error('preview-unavailable');
      }
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      if (attemptId !== startAttemptRef.current) {
        for (const track of stream.getTracks()) track.stop();
        if (video.srcObject === stream) video.srcObject = null;
        return;
      }
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('video-track-missing');
      track.onended = stopCapture;
      const trackSettings = track.getSettings();
      const width = video.videoWidth || trackSettings.width || 1920;
      const height = video.videoHeight || trackSettings.height || 1080;
      sourceSizeRef.current = { width, height };
      setSourceSize({ width, height });
      timerTrackerRef.current.reset();
      buffTrackerRef.current.reset();
      activeBuffIdsRef.current.clear();
      setCaptureState('running');
    } catch (error) {
      if (attemptId !== startAttemptRef.current) return;
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCaptureState('error');
      const message = error instanceof DOMException && error.name === 'NotAllowedError'
        ? text('未选择画面，实时识别没有启动。', 'No source was selected. Real-time recognition did not start.')
        : text('无法启动实时画面识别。', 'Could not start real-time screen recognition.');
      setCaptureError(message);
      hideDesktopOverlay();
    }
  }

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let requestId = 0;
    let pendingContext: {
      id: number;
      settings: RealtimeVisionSettings;
      analysisFps: number;
      capturedAt: number;
    } | null = null;
    let lastOverlaySentAt = 0;
    let lastOverlayKey = '';
    const worker = new Worker(new URL('./realtimeVisionWorker.ts', import.meta.url), { type: 'module' });

    const scheduleNext = (analysisFps: number, capturedAt: number) => {
      if (cancelled) return;
      const interval = 1000 / Math.max(1, analysisFps);
      const elapsed = performance.now() - capturedAt;
      analysisTimerRef.current = window.setTimeout(analyze, Math.max(20, interval - elapsed));
    };

    const failWorker = () => {
      if (cancelled) return;
      cancelled = true;
      worker.terminate();
      stopCapture();
      setCaptureState('error');
      setCaptureError(text('识别线程启动失败，请停止后重新开启画面识别。', 'The recognition worker failed. Stop and restart screen recognition.'));
    };

    worker.addEventListener('message', (event: MessageEvent<RealtimeVisionWorkerResponse>) => {
      if (cancelled || !pendingContext || event.data.id !== pendingContext.id) return;
      const context = pendingContext;
      pendingContext = null;
      if (event.data.error) {
        failWorker();
        return;
      }

      const stableTimer = context.settings.timerEnabled
        ? timerTrackerRef.current.update(event.data.timerReading, context.capturedAt)
        : null;
      if (!context.settings.timerEnabled) timerTrackerRef.current.reset();
      const stableTimerSeconds = projectedTimerSeconds(stableTimer, context.capturedAt);
      const frameTimerSeconds = stableTimerSeconds ?? event.data.timerReading?.seconds ?? null;
      const runtime = buffTrackerRef.current.update(
        context.settings.buffs,
        new Map(event.data.matches),
        frameTimerSeconds,
        context.capturedAt,
        stableTimerSeconds !== null
      );

      if (visibleRef.current) {
        setTimerSnapshot(stableTimer);
        setBuffSnapshots(runtime.snapshots);
      }
      if (runtime.activations.length) {
        playTone('detected');
      }
      if (runtime.warnings.length) {
        playTone('warning');
        setWarningLog((previous) => [
          ...runtime.warnings.map((warning) => ({ id: crypto.randomUUID(), name: warning.name, at: Date.now() })),
          ...previous
        ].slice(0, 8));
      }

      const activeBuffs = runtime.snapshots.filter((buff) => buff.present);
      activeBuffIdsRef.current = new Set(activeBuffs.map((buff) => buff.id));
      const overlayKey = JSON.stringify({
        visible: context.settings.overlayEnabled,
        timer: stableTimer?.text ?? null,
        buffs: activeBuffs.map((buff) => [buff.id, buff.expiresAtTimerSeconds, buff.warning])
      });
      const overlayChanged = overlayKey !== lastOverlayKey;
      if (overlayChanged || context.capturedAt - lastOverlaySentAt >= OVERLAY_UPDATE_INTERVAL_MS) {
        lastOverlayKey = overlayKey;
        lastOverlaySentAt = context.capturedAt;
        sendDesktopOverlay({
          visible: context.settings.overlayEnabled,
          corner: context.settings.overlayCorner,
          timer: stableTimer ? { text: stableTimer.text, confidence: stableTimer.confidence, stale: stableTimer.stale } : null,
          buffs: activeBuffs.map((buff) => ({
            id: buff.id,
            name: buff.name,
            detectedAtTimerSeconds: buff.detectedAtTimerSeconds,
            expiresAtTimerSeconds: buff.expiresAtTimerSeconds,
            remainingSeconds: buff.remainingSeconds,
            warning: buff.warning
          })),
          language
        });
      }
      scheduleNext(context.analysisFps, context.capturedAt);
    });
    worker.addEventListener('error', failWorker);

    const analyze = () => {
      if (cancelled) return;
      const capturedAt = performance.now();
      let analysisFps = activeBuffIdsRef.current.size > 0
        ? Math.min(3, settingsRef.current.sampleFps)
        : 1;
      const video = videoRef.current;
      const canvas = analysisCanvasRef.current;
      const currentSettings = settingsRef.current;
      if (video && canvas && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
        const scale = Math.min(1, ANALYSIS_MAX_WIDTH / video.videoWidth);
        const height = Math.max(1, Math.round(video.videoHeight * scale));
        if (sourceSizeRef.current.width !== video.videoWidth || sourceSizeRef.current.height !== video.videoHeight) {
          sourceSizeRef.current = { width: video.videoWidth, height: video.videoHeight };
          setSourceSize({ width: video.videoWidth, height: video.videoHeight });
        }
        {
          const transfers: Transferable[] = [];
          const timerImage = currentSettings.timerEnabled
            ? imageDataForVideoRect(video, canvas, currentSettings.timerRoi, scale)
            : null;
          const timer = timerImage ? {
            image: workerImage(timerImage),
            luminanceThreshold: currentSettings.timerLuminanceThreshold
          } : null;
          if (timer) transfers.push(timer.image.buffer);
          const buffs: RealtimeVisionWorkerRequest['buffs'] = [];
          for (const buff of currentSettings.buffs) {
            const template = templatesRef.current.get(buff.id);
            if (!buff.enabled || !template) continue;
            if (activeBuffIdsRef.current.has(buff.id)) continue;
            const scanNow = shouldScanRealtimeBuff(buff, chartRef.current?.steps ?? [], practiceRef.current);
            if (!scanNow) continue;
            analysisFps = currentSettings.sampleFps;
            let buffCanvas = buffAnalysisCanvasesRef.current.get(buff.id);
            if (!buffCanvas) {
              buffCanvas = document.createElement('canvas');
              buffAnalysisCanvasesRef.current.set(buff.id, buffCanvas);
            }
            const image = imageDataForVideoRect(video, buffCanvas, buff.roi, scale);
            if (!image) continue;
            const packedImage = workerImage(image);
            transfers.push(packedImage.buffer);
            buffs.push({ id: buff.id, image: packedImage, template });
          }
          requestId += 1;
          pendingContext = { id: requestId, settings: currentSettings, analysisFps, capturedAt };
          const request: RealtimeVisionWorkerRequest = {
            id: requestId,
            capturedAt,
            sourceHeight: height,
            timer,
            buffs
          };
          worker.postMessage(request, transfers);
          return;
        }
      }
      scheduleNext(1, capturedAt);
    };
    analyze();
    return () => {
      cancelled = true;
      worker.terminate();
      if (analysisTimerRef.current !== null) window.clearTimeout(analysisTimerRef.current);
      analysisTimerRef.current = null;
    };
  }, [language, running, sendDesktopOverlay, stopCapture, text]);

  function updateRegion(regionId: RegionId, rect: VisionRect) {
    setSettings((previous) => regionId === 'timer'
      ? { ...previous, timerRoi: normalizeVisionRect(rect, previous.timerRoi) }
      : {
        ...previous,
        buffs: previous.buffs.map((buff) => buff.id === regionId ? { ...buff, roi: normalizeVisionRect(rect, buff.roi) } : buff)
      });
  }

  function beginRegionDrag(event: ReactPointerEvent, regionId: RegionId, mode: RegionResizeMode) {
    const current = regionRect(settingsRef.current, regionId);
    if (!current || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedRegionId(regionId);
    dragRef.current = {
      pointerId: event.pointerId,
      regionId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startRect: current
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
    updateRegion(drag.regionId, resizedRect(
      drag.startRect,
      drag.mode,
      (event.clientX - drag.startX) / bounds.width,
      (event.clientY - drag.startY) / bounds.height
    ));
  }

  function endRegionDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (stageRef.current?.hasPointerCapture(event.pointerId)) stageRef.current.releasePointerCapture(event.pointerId);
  }

  function updateBuff(id: string, patch: Partial<RealtimeBuffDefinition>) {
    setSettings((previous) => ({
      ...previous,
      buffs: previous.buffs.map((buff) => buff.id === id ? { ...buff, ...patch } : buff)
    }));
  }

  function addBuff() {
    setSettings((previous) => {
      const next = createBuff(previous.buffs.length);
      setSelectedRegionId(next.id);
      return { ...previous, buffs: [...previous.buffs, next] };
    });
  }

  function removeBuff(id: string) {
    setSettings((previous) => ({ ...previous, buffs: previous.buffs.filter((buff) => buff.id !== id) }));
    if (selectedRegionId === id) setSelectedRegionId('timer');
  }

  function captureBuffTemplate(id: string) {
    const video = videoRef.current;
    const buff = settingsRef.current.buffs.find((entry) => entry.id === id);
    if (!video || !buff || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    const sourceWidth = Math.max(1, Math.round(buff.roi.width * video.videoWidth));
    const sourceHeight = Math.max(1, Math.round(buff.roi.height * video.videoHeight));
    const scale = Math.min(1, 128 / Math.max(sourceWidth, sourceHeight));
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(
      video,
      buff.roi.x * video.videoWidth,
      buff.roi.y * video.videoHeight,
      buff.roi.width * video.videoWidth,
      buff.roi.height * video.videoHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );
    updateBuff(id, { templateDataUrl: canvas.toDataURL('image/png'), roi: { ...DEFAULT_BUFF_SEARCH_ROI } });
  }

  async function uploadBuffTemplate(id: string, file: File | null) {
    if (!file || !file.type.startsWith('image/') || file.size > 4 * 1024 * 1024) return;
    try {
      updateBuff(id, { templateDataUrl: await fileAsDataUrl(file), roi: { ...DEFAULT_BUFF_SEARCH_ROI } });
    } catch {
      setCaptureError(text('无法读取模板图片。', 'Could not read the template image.'));
    }
  }

  const statusText = captureState === 'running'
    ? text('识别中', 'Recognizing')
    : captureState === 'selecting'
      ? text('等待选择画面', 'Waiting for source')
      : captureState === 'error'
        ? text('启动失败', 'Could not start')
        : text('未启动', 'Stopped');
  const selectedSnapshot = selectedBuff ? buffSnapshots.find((snapshot) => snapshot.id === selectedBuff.id) ?? null : null;
  const timerConfidence = timerSnapshot ? `${Math.round(timerSnapshot.confidence * 100)}%` : '--';
  const captureAspectRatio = `${Math.max(1, sourceSize.width)} / ${Math.max(1, sourceSize.height)}`;
  const regionButtons = useMemo(() => [
    { id: 'timer', label: text('计时器', 'Timer') },
    ...settings.buffs.map((buff) => ({ id: buff.id, label: buff.name }))
  ], [settings.buffs, text]);
  const triggerSteps = useMemo(() => [...(chart?.steps ?? [])].sort((left, right) => left.startMin - right.startMin || left.id.localeCompare(right.id)), [chart]);
  const chartDurationMs = useMemo(() => Math.max(0, ...(chart?.steps ?? []).map((step) => Math.max(step.startMin, step.startMax) + Math.max(0, step.durationMax))), [chart]);
  const practiceElapsedMs = Math.max(0, practice.elapsedMs ?? 0);
  const practiceProgress = chartDurationMs > 0 ? Math.min(1, practiceElapsedMs / chartDurationMs) : 0;
  const currentPracticeStep = chart?.steps[Math.min(Math.max(0, practice.currentStepIndex), Math.max(0, (chart?.steps.length ?? 1) - 1))] ?? null;
  const practiceStatusText = practice.status === 'running'
    ? text('运行中', 'Running')
    : practice.status === 'armed'
      ? text('等待首招', 'Waiting for first action')
      : practice.status === 'passed'
        ? text('已完成', 'Complete')
        : practice.status === 'failed'
          ? text('已失败', 'Failed')
          : text('未启动', 'Stopped');
  const scheduledBuffs = settings.buffs.filter((buff) => buff.enabled && Boolean(buff.triggerStepId));
  const activeScheduledBuffs = scheduledBuffs.filter((buff) => shouldScanRealtimeBuff(buff, chart?.steps ?? [], practice));
  const scanWindowText = scheduledBuffs.length === 0
    ? text('全程识别', 'Always scanning')
    : practice.status !== 'running'
      ? text('等待连段进程', 'Waiting for combo process')
      : activeScheduledBuffs.length > 0
        ? text('节点窗口内', 'Inside node window')
        : text('节点窗口外', 'Outside node window');

  return (
    <section className="realtime-vision-lab" data-trainer-capture-suspend={visible ? 'true' : undefined} hidden={!visible}>
      <header className="panel-title experiment-subtitle realtime-vision-heading">
        <div>
          <h2>{text('实时画面识别', 'Real-time Vision')}</h2>
          <p>{text('实验功能：识别挑战计时器和自定义 Buff 图标。', 'Experimental challenge-timer and custom Buff icon recognition.')}</p>
        </div>
        <div className="realtime-vision-heading-actions">
          {!running
            ? <button className="primary" type="button" disabled={captureState === 'selecting'} onClick={() => void startCapture()}><MonitorUp size={18} />{text('选择游戏画面', 'Select Game View')}</button>
            : <button type="button" onClick={stopCapture}><Square size={17} />{text('停止识别', 'Stop')}</button>}
          <button className="icon-button experiment-back-button" type="button" onClick={onExit} title={text('返回', 'Back')}><ArrowLeft size={18} /></button>
        </div>
      </header>

      <div className="realtime-vision-status-strip">
        <span className={`realtime-vision-state ${captureState}`}><i />{statusText}</span>
        <span>{text('挑战时间', 'Challenge Time')} <strong>{timerSnapshot?.text ?? '--:--'}</strong></span>
        <span>{text('OCR 可信度', 'OCR Confidence')} <strong>{timerConfidence}</strong></span>
        <span>{text('活动 Buff', 'Active Buffs')} <strong>{buffSnapshots.filter((buff) => buff.present).length}</strong></span>
        {captureError && <span className="realtime-vision-error">{captureError}</span>}
      </div>

      <div className="realtime-vision-combo-clock">
        <div className="realtime-vision-combo-summary">
          <span><ScanLine size={16} />{text('连段识别进程', 'Combo Recognition Process')}</span>
          <strong className={practice.status}>{practiceStatusText}</strong>
          <time>{formatElapsed(practiceElapsedMs)} / {formatElapsed(chartDurationMs)}</time>
        </div>
        <div className="realtime-vision-combo-progress" role="progressbar" aria-valuemin={0} aria-valuemax={Math.max(0, chartDurationMs)} aria-valuenow={Math.min(practiceElapsedMs, chartDurationMs)}>
          <i style={{ width: `${practiceProgress * 100}%` }} />
        </div>
        <div className="realtime-vision-combo-details">
          <span>{text('当前招式', 'Current action')} <strong>{practice.status === 'running' && currentPracticeStep ? currentPracticeStep.label : '--'}</strong></span>
          <span>{text('节点识别', 'Node scan')} <strong>{scanWindowText}</strong></span>
          <div className="realtime-vision-combo-actions">
            <button className="primary" type="button" disabled={!chart || practice.status === 'running' || practice.status === 'armed'} onClick={onStartPractice}><Play size={16} />{text('开始 F', 'Start F')}</button>
            <button type="button" disabled={practice.status === 'idle'} onClick={onStopPractice}><Square size={15} />{text('结束 Esc', 'Stop Esc')}</button>
            <button className={comboOverlayVisible ? 'active' : ''} type="button" onClick={() => void onToggleComboOverlay()}><Eye size={16} />{text('连段图置顶', 'Keep Combo Overlay on Top')}</button>
          </div>
        </div>
      </div>

      <div className="realtime-vision-layout">
        <div className="realtime-vision-stage-column">
          <div className="realtime-vision-region-tabs" role="tablist" aria-label={text('识别区域', 'Recognition Regions')}>
            {regionButtons.map((region) => <button key={region.id} type="button" className={selectedRegionId === region.id ? 'active' : ''} onClick={() => setSelectedRegionId(region.id)}><Crosshair size={15} />{region.label}</button>)}
          </div>
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
            {settings.timerEnabled && <VisionRegionBox id="timer" label={text('计时器', 'Timer')} rect={settings.timerRoi} selected={selectedRegionId === 'timer'} tone="timer" onPointerDown={beginRegionDrag} />}
            {settings.buffs.filter((buff) => buff.enabled).map((buff) => <VisionRegionBox key={buff.id} id={buff.id} label={buff.name} rect={buff.roi} selected={selectedRegionId === buff.id} tone={buffSnapshots.find((snapshot) => snapshot.id === buff.id)?.present ? 'active' : 'buff'} onPointerDown={beginRegionDrag} />)}
          </div>
          <canvas ref={analysisCanvasRef} className="realtime-vision-analysis-canvas" aria-hidden="true" />
          <div className="realtime-vision-monitor-grid">
            {buffSnapshots.map((snapshot) => {
              const detectedAt = formatChallengeTimerSeconds(snapshot.detectedAtTimerSeconds);
              const expiresAt = formatChallengeTimerSeconds(snapshot.expiresAtTimerSeconds);
              return <div key={snapshot.id} className={`realtime-vision-monitor ${snapshot.present ? 'present' : ''} ${snapshot.warning ? 'warning' : ''}`}>
                <span>{snapshot.name}</span>
                <strong>{snapshot.configured ? `${Math.round(snapshot.similarity * 100)}%` : text('未取样', 'No template')}</strong>
                <div className="realtime-vision-monitor-timing">
                  <em>{snapshot.present ? (expiresAt ? `${text('到期时间', 'Expires at')} ${expiresAt}` : text('到期时间不可用', 'Expiry unavailable')) : '--'}</em>
                  {snapshot.present && <small>{detectedAt ? `${text('识别于', 'Detected at')} ${detectedAt} · ` : ''}{text('剩余', 'Remaining')} {formatRemaining(snapshot.remainingSeconds)}</small>}
                </div>
              </div>;
            })}
            {!buffSnapshots.length && <div className="realtime-vision-monitor empty">{text('添加 Buff 后会在这里显示识别结果。', 'Buff recognition results appear here.')}</div>}
          </div>
        </div>

        <aside className="realtime-vision-controls">
          <section className="realtime-vision-control-section">
            <div className="realtime-vision-section-heading"><div><ScanLine size={17} /><strong>{text('采样与提醒', 'Sampling and Alerts')}</strong></div></div>
            <div className="realtime-vision-field-grid">
              <label>{text('采样率', 'Sample Rate')}<select value={settings.sampleFps} onChange={(event) => setSettings((previous) => ({ ...previous, sampleFps: Number(event.target.value) }))}><option value={3}>3 FPS</option><option value={5}>5 FPS</option><option value={8}>8 FPS</option><option value={10}>10 FPS</option></select></label>
              <label>{text('提醒位置', 'Alert Corner')}<select value={settings.overlayCorner} onChange={(event) => setSettings((previous) => ({ ...previous, overlayCorner: event.target.value as RealtimeVisionSettings['overlayCorner'] }))}><option value="top-left">{text('左上', 'Top Left')}</option><option value="top-right">{text('右上', 'Top Right')}</option><option value="bottom-left">{text('左下', 'Bottom Left')}</option><option value="bottom-right">{text('右下', 'Bottom Right')}</option></select></label>
            </div>
            <div className="realtime-vision-toggle-row">
              <label><input type="checkbox" checked={settings.overlayEnabled} onChange={(event) => setSettings((previous) => ({ ...previous, overlayEnabled: event.target.checked }))} /><Eye size={16} />{text('置顶提醒', 'Topmost Alert')}</label>
              <label><input type="checkbox" checked={settings.soundEnabled} onChange={(event) => setSettings((previous) => ({ ...previous, soundEnabled: event.target.checked }))} />{settings.soundEnabled ? <Bell size={16} /> : <BellOff size={16} />}{text('提示音', 'Sound')}</label>
            </div>
          </section>

          <section className={`realtime-vision-control-section ${selectedRegionId === 'timer' ? 'selected' : ''}`}>
            <div className="realtime-vision-section-heading"><div><Crosshair size={17} /><strong>{text('挑战计时器', 'Challenge Timer')}</strong></div><label className="realtime-vision-switch"><input type="checkbox" checked={settings.timerEnabled} onChange={(event) => setSettings((previous) => ({ ...previous, timerEnabled: event.target.checked }))} /><span /></label></div>
            <div className="realtime-vision-field-grid">
              <label>{text('白色门槛', 'White Gate')}<input type="number" min={110} max={245} value={settings.timerLuminanceThreshold} onChange={(event) => setSettings((previous) => ({ ...previous, timerLuminanceThreshold: boundedNumber(event.target.value, 110, 245, previous.timerLuminanceThreshold) }))} /></label>
              <label>{text('当前结果', 'Current Result')}<output>{timerSnapshot?.text ?? '--:--'}</output></label>
            </div>
            <button type="button" onClick={() => { setSettings((previous) => ({ ...previous, timerRoi: { ...UPSTREAM_TIMER_ROI } })); setSelectedRegionId('timer'); }}><RotateCcw size={16} />{text('恢复默认计时器区域', 'Reset Timer Region')}</button>
          </section>

          <section className="realtime-vision-control-section realtime-vision-buff-section">
            <div className="realtime-vision-section-heading"><div><ImagePlus size={17} /><strong>{text('Buff 模板', 'Buff Templates')}</strong></div><button className="icon-button" type="button" onClick={addBuff} title={text('添加 Buff', 'Add Buff')}><Plus size={17} /></button></div>
            <div className="realtime-vision-buff-list">
              {settings.buffs.map((buff) => {
                const snapshot = buffSnapshots.find((entry) => entry.id === buff.id);
                const selected = selectedRegionId === buff.id;
                return <article key={buff.id} className={`realtime-vision-buff-row ${selected ? 'selected' : ''}`} onClick={() => setSelectedRegionId(buff.id)}>
                  <div className="realtime-vision-buff-main">
                    <button className="realtime-vision-template-preview" type="button" onClick={() => setSelectedRegionId(buff.id)} aria-label={text('选择 Buff 区域', 'Select Buff region')}>{buff.templateDataUrl ? <img src={buff.templateDataUrl} alt="" /> : <Crosshair size={22} />}</button>
                    <label className="realtime-vision-name-field"><span>{text('名称', 'Name')}</span><input value={buff.name} onChange={(event) => updateBuff(buff.id, { name: event.target.value.slice(0, 40) })} /></label>
                    <label className="realtime-vision-switch"><input type="checkbox" checked={buff.enabled} onChange={(event) => updateBuff(buff.id, { enabled: event.target.checked })} /><span /></label>
                    <button className="icon-button danger" type="button" onClick={(event) => { event.stopPropagation(); removeBuff(buff.id); }} title={text('删除 Buff', 'Delete Buff')}><Trash2 size={16} /></button>
                  </div>
                  <div className="realtime-vision-field-grid three">
                    <label>{text('持续秒数', 'Duration')}<input type="number" min={0.1} max={600} step={0.1} value={buff.durationSeconds} onChange={(event) => updateBuff(buff.id, { durationSeconds: boundedNumber(event.target.value, 0.1, 600, buff.durationSeconds) })} /></label>
                    <label>{text('提前提醒', 'Warn Before')}<input type="number" min={0} max={120} step={0.1} value={buff.warningLeadSeconds} onChange={(event) => updateBuff(buff.id, { warningLeadSeconds: boundedNumber(event.target.value, 0, 120, buff.warningLeadSeconds) })} /></label>
                    <label>{text('匹配门槛', 'Threshold')}<input type="number" min={0.35} max={0.99} step={0.01} value={buff.matchThreshold} onChange={(event) => updateBuff(buff.id, { matchThreshold: boundedNumber(event.target.value, 0.35, 0.99, buff.matchThreshold) })} /></label>
                  </div>
                  <div className="realtime-vision-field-grid realtime-vision-schedule-grid">
                    <label>{text('连段识别节点', 'Combo Trigger')}<select value={buff.triggerStepId ?? ''} onChange={(event) => updateBuff(buff.id, { triggerStepId: event.target.value || undefined })}>
                      <option value="">{text('全程识别', 'Always Scan')}</option>
                      {triggerSteps.map((step) => <option key={step.id} value={step.id}>{`${(step.startMin / 1000).toFixed(1)}s · ${step.characterSlot ? `P${step.characterSlot} · ` : ''}${step.label}`}</option>)}
                    </select></label>
                    <label>{text('节点前后秒数', 'Window Before / After')}<input type="number" min={0.5} max={30} step={0.5} value={buff.detectionWindowSeconds} onChange={(event) => updateBuff(buff.id, { detectionWindowSeconds: boundedNumber(event.target.value, 0.5, 30, buff.detectionWindowSeconds) })} /></label>
                  </div>
                  <div className="realtime-vision-template-actions">
                    <button type="button" disabled={!running} onClick={(event) => { event.stopPropagation(); captureBuffTemplate(buff.id); }}><Camera size={15} />{text('从框内取样', 'Capture ROI')}</button>
                    <label className="button-like" onClick={(event) => event.stopPropagation()}><Upload size={15} />{text('上传模板', 'Upload Template')}<input type="file" accept="image/*" onChange={(event) => { void uploadBuffTemplate(buff.id, event.target.files?.[0] ?? null); event.currentTarget.value = ''; }} /></label>
                    <span className={templateReadyIds.has(buff.id) ? 'ready' : ''}>{templateReadyIds.has(buff.id) ? text('模板就绪', 'Template Ready') : text('尚未取样', 'No template')}</span>
                    {snapshot && <strong>{Math.round(snapshot.similarity * 100)}%</strong>}
                  </div>
                </article>;
              })}
            </div>
          </section>

          {selectedBuff && <section className="realtime-vision-selection-summary"><Crosshair size={16} /><span>{text('当前区域', 'Selected Region')}</span><strong>{selectedBuff.name}</strong><em>{selectedSnapshot?.present ? text('已识别', 'Detected') : text('未识别', 'Not detected')}</em></section>}
          {warningLog.length > 0 && <section className="realtime-vision-warning-log"><strong>{text('最近提醒', 'Recent Alerts')}</strong>{warningLog.map((entry) => <span key={entry.id}><Bell size={14} />{entry.name}<time>{new Date(entry.at).toLocaleTimeString()}</time></span>)}</section>}
        </aside>
      </div>
    </section>
  );
}

type VisionRegionBoxProps = {
  id: RegionId;
  label: string;
  rect: VisionRect;
  selected: boolean;
  tone: 'timer' | 'buff' | 'active';
  onPointerDown: (event: ReactPointerEvent, regionId: RegionId, mode: RegionResizeMode) => void;
};

function VisionRegionBox({ id, label, rect, selected, tone, onPointerDown }: VisionRegionBoxProps) {
  return <div
    className={`realtime-vision-region ${selected ? 'selected' : ''} ${tone}`}
    style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}
    onPointerDown={(event) => onPointerDown(event, id, 'move')}
  >
    <span>{label}</span>
    {(['nw', 'ne', 'sw', 'se'] as const).map((edge) => <i key={edge} className={edge} onPointerDown={(event) => onPointerDown(event, id, edge)} />)}
  </div>;
}
