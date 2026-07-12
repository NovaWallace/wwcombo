import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Activity, Bug, Download, Eye, EyeOff, Keyboard, Palette, Plus, Play, Save, Settings, Square, Target, Trash2, Upload } from 'lucide-react';
import {
  CharacterSlot,
  ComboChart,
  ComboImageStyle,
  ComboPeriod,
  ComboPeriodKind,
  ComboRecorder,
  ComboStep,
  DEFAULT_BINDINGS,
  DEFAULT_MOVES,
  KeyBinding,
  LENIENT_PRACTICE,
  MoveDefinition,
  PracticeSession,
  PracticeSnapshot,
  RecordedUnit,
  RecordingSnapshot,
  SIMPLE_PRACTICE,
  STRICT_PRACTICE,
  normalizeDomKeyboardEvent,
  normalizeDomMouseEvent
} from '../combo-core';
import { normalizeInputCode } from '../combo-core/input';
import { createDesktopBridge } from './desktopBridge';
import {
  chartToComboImageItems,
  comboImageBackgroundSource,
  comboImageItemSize,
  comboImageItemSizeForText,
  comboTextParts,
  createDefaultComboImageStyle,
  iconSourceForId,
  maybeConvertTextToIconLabel,
  normalizeComboImageStyle,
  normalizeRectPercent,
  parseQuickInputText,
  visibleComboImageItems
} from './combo-image/comboImage';
import './styles.css';

type Page = 'record' | 'practice' | 'appearance' | 'settings';
type EditorTab = 'timeline' | 'content';
type PracticePreset = 'strict' | 'lenient' | 'simple';
type ComboLayout = 'horizontal' | 'vertical';
type LaneKind = 'main' | 'independent';
type DefaultAvatarEntry = { name: string; src: string };
type PendingPlacement = { kind: 'step' } | { kind: 'period' };
type SelectionBox = { x: number; y: number; width: number; height: number };

type OverlaySettings = {
  layout: ComboLayout;
  x: number;
  y: number;
  width: number;
  height: number;
};
type OverlayBounds = Omit<OverlaySettings, 'layout'>;
type OverlayLayoutBounds = Record<ComboLayout, OverlayBounds>;

const STORAGE_KEY = 'ww-combo-trainer-state-v2';
const MIN_EDITOR_DURATION = 35;
const CHARACTER_SLOTS: CharacterSlot[] = [1, 2, 3];
const HORIZONTAL_OVERLAY_SIZE = { width: 2000, height: 120 };
const VERTICAL_OVERLAY_SIZE = { width: 400, height: 1000 };
const DEFAULT_OVERLAY_LAYOUT_BOUNDS: OverlayLayoutBounds = {
  horizontal: { x: 160, y: 36, ...HORIZONTAL_OVERLAY_SIZE },
  vertical: { x: 160, y: 36, ...VERTICAL_OVERLAY_SIZE }
};
const DEFAULT_OVERLAY_SETTINGS: OverlaySettings = { layout: 'horizontal', ...DEFAULT_OVERLAY_LAYOUT_BOUNDS.horizontal };
const LOCAL_STORAGE_SOFT_LIMIT = 4_200_000;
const DRAFT_MOVE_ID = '__draft__';
const DEFAULT_FREE_FIRE_DURATION = 15_000;
const DEFAULT_AXIS_DURATION = 25_000;
const AXIS_PLACEMENT_WINDOW = 30_000;
const HEAVY_ATTACK_HOLD_MS = 300;
type ComboTrackMetric = { extent: number; start: number; center: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Number(value))) : fallback;
}

function nowEventTime() {
  return performance.now();
}

function createEmptySnapshot(): RecordingSnapshot {
  return { isRecording: false, startedAt: null, elapsed: 0, activeMain: null, activeIndependent: [], units: [] };
}

function createEmptyPractice(): PracticeSnapshot {
  return { status: 'idle', startedAt: null, currentStepIndex: 0, feedback: [], completedStepIds: [], errorStepIds: [] };
}

function normalizeBindings(bindings: KeyBinding[]): KeyBinding[] {
  const map = new Map(bindings.map((binding) => [binding.moveId, binding]));
  for (const binding of DEFAULT_BINDINGS) if (!map.has(binding.moveId)) map.set(binding.moveId, binding);
  return [...map.values()].map((binding) => ({
    moveId: binding.moveId,
    inputs: binding.inputs.map((input) => ({ ...input, code: normalizeInputCode(input.code) }))
  }));
}

function normalizeAvatarPresets(value: unknown): DefaultAvatarEntry[] {
  const objectValue = value as { avatars?: unknown[]; items?: unknown[]; data?: unknown[] } | null;
  const source = Array.isArray(value) ? value : Array.isArray(objectValue?.avatars) ? objectValue.avatars : Array.isArray(objectValue?.items) ? objectValue.items : Array.isArray(objectValue?.data) ? objectValue.data : [];
  return source.flatMap((item) => {
    const entry = item as Partial<DefaultAvatarEntry> | null;
    if (!entry || typeof entry.name !== 'string' || typeof entry.src !== 'string') return [];
    return [{ name: entry.name.replace(/\.(webp|png|jpe?g)$/i, ''), src: assetUrl(entry.src) }];
  });
}

function assetUrl(path: string): string {
  if (/^(data:|blob:|https?:)/i.test(path)) return path;
  const clean = path.replace(/^\/+/, '');
  return new URL(clean, window.location.href).toString();
}

function defaultPeriodLabel(kind: ComboPeriodKind, loopIndex = 1): string {
  if (kind === 'draft_period') return '待设置时段';
  if (kind === 'startup_axis') return '启动轴';
  if (kind === 'loop_axis') return `循环轴${loopIndex}`;
  return '自由开火';
}

function normalizePeriod(period: ComboPeriod): ComboPeriod {
  const startMs = clampNumber(period.startMs, 0, 10 * 60 * 1000, 0);
  const endMs = clampNumber(period.endMs, startMs + MIN_EDITOR_DURATION, 10 * 60 * 1000, startMs + 1000);
  const validKinds: ComboPeriodKind[] = ['draft_period', 'free_fire', 'startup_axis', 'loop_axis'];
  const kind: ComboPeriodKind = validKinds.includes(period.kind) ? period.kind : 'free_fire';
  const loopIndex = kind === 'loop_axis' ? Math.max(1, Math.round(period.loopIndex ?? 1)) : undefined;
  const label = period.label?.trim() || defaultPeriodLabel(kind, loopIndex);
  return { id: period.id || crypto.randomUUID(), kind, label, characterSlot: period.characterSlot, lane: period.lane, startMs, endMs, loopIndex };
}

function normalizePeriods(periods: ComboPeriod[] | undefined): ComboPeriod[] {
  if (!Array.isArray(periods)) return [];
  return periods.map((period) => normalizePeriod(period)).filter((period) => period.endMs > period.startMs);
}

function constrainAxisPeriods(periods: ComboPeriod[]): ComboPeriod[] {
  const normalized = normalizePeriods(periods);
  const floating = normalized.filter((period) => period.kind === 'free_fire' || period.kind === 'draft_period');
  const startup = normalized.find((period) => period.kind === 'startup_axis');
  const loops = normalized.filter((period) => period.kind === 'loop_axis').sort((a, b) => a.startMs - b.startMs || (a.loopIndex ?? 0) - (b.loopIndex ?? 0));
  const axis: ComboPeriod[] = [];
  let cursor = 0;
  if (startup) {
    const length = Math.max(MIN_EDITOR_DURATION, startup.endMs - startup.startMs);
    axis.push(normalizePeriod({ ...startup, startMs: 0, endMs: length, label: defaultPeriodLabel('startup_axis') }));
    cursor = length;
  }
  loops.forEach((period, index) => {
    const length = Math.max(MIN_EDITOR_DURATION, period.endMs - period.startMs);
    const loopIndex = index + 1;
    axis.push(normalizePeriod({ ...period, startMs: cursor, endMs: cursor + length, loopIndex, label: defaultPeriodLabel('loop_axis', loopIndex) }));
    cursor += length;
  });
  return [...floating, ...axis].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
}

function applyFreeFirePeriods(chart: ComboChart): ComboChart {
  const periods = constrainAxisPeriods(chart.periods ?? []);
  const freeRanges = periods.filter((period) => period.kind === 'free_fire');
  return {
    ...chart,
    periods,
    steps: chart.steps.map((step) => ({ ...step, free: Boolean(step.manualFree) || isStepInFreeFire(step, freeRanges) }))
  };
}

function isStepInFreeFire(step: ComboStep, freeRanges: ComboPeriod[]): boolean {
  const start = step.startMin;
  const end = step.startMin + step.durationMax;
  return freeRanges.some((period) => {
    const sameTime = end >= period.startMs && start <= period.endMs;
    const sameSlot = period.characterSlot === undefined || period.characterSlot === (step.characterSlot ?? 1);
    const sameLane = period.lane === undefined || period.lane === step.lane;
    return sameTime && sameSlot && sameLane;
  });
}

function normalizeStep(step: ComboStep): ComboStep {
  const startMin = Math.max(0, Math.round(step.startMin));
  const startMax = Math.max(startMin, Math.round(step.startMax));
  const durationMin = Math.max(MIN_EDITOR_DURATION, Math.round(step.durationMin));
  const durationMax = Math.max(durationMin, Math.round(step.durationMax));
  const preheatMs = clamp(Math.round(step.preheatMs ?? 0), 0, durationMax - MIN_EDITOR_DURATION);
  const recoveryMs = clamp(Math.round(step.recoveryMs ?? 0), 0, durationMax - preheatMs - MIN_EDITOR_DURATION);
  const manualFree = Boolean(step.manualFree ?? step.free);
  return { ...step, startMin, startMax, durationMin, durationMax, preheatMs, recoveryMs, manualFree, free: manualFree };
}

function createStepFromMove(move: MoveDefinition, startAt: number): ComboStep {
  return {
    id: crypto.randomUUID(),
    moveId: move.id,
    label: move.label,
    characterSlot: 1,
    lane: move.independent ? 'independent' : 'main',
    independent: move.independent,
    startMin: Math.max(0, Math.round(startAt)),
    startMax: Math.max(0, Math.round(startAt + 120)),
    durationMin: 35,
    durationMax: 300,
    color: move.color,
    advancesStep: move.advancesStep,
    free: false,
    samples: []
  };
}

function isReasonableChart(chart: ComboChart | null | undefined): chart is ComboChart {
  if (!chart || !Array.isArray(chart.steps)) return false;
  return chart.steps.every((step) => [step.startMin, step.startMax, step.durationMin, step.durationMax].every((value) => Number.isFinite(value) && value >= 0 && value < 10 * 60 * 1000));
}

function normalizeChart(chart: ComboChart): ComboChart {
  return applyFreeFirePeriods({ ...chart, periods: constrainAxisPeriods(chart.periods ?? []), steps: chart.steps.map(normalizeStep) });
}

function sortChartForPractice(chart: ComboChart | null): ComboChart | null {
  if (!chart) return null;
  const normalized = normalizeChart(chart);
  return {
    ...normalized,
    steps: [...normalized.steps].sort((a, b) => a.startMin - b.startMin || a.startMax - b.startMax || (a.characterSlot ?? 1) - (b.characterSlot ?? 1) || a.id.localeCompare(b.id))
  };
}

function createChartFromRecording(snapshot: RecordingSnapshot, recorder: ComboRecorder, title = `录制连段 ${new Date().toLocaleTimeString()}`): ComboChart | null {
  if (!snapshot.units.length) return null;
  return normalizeChart(recorder.toChart(title));
}

function normalizeOverlayBounds(value: unknown, fallback: OverlayBounds): OverlayBounds {
  const bounds = value as Partial<OverlayBounds> | null;
  return {
    x: clampNumber(bounds?.x, 0, 100000, fallback.x),
    y: clampNumber(bounds?.y, 0, 100000, fallback.y),
    width: clampNumber(bounds?.width, 1, 100000, fallback.width),
    height: clampNumber(bounds?.height, 1, 100000, fallback.height)
  };
}

function normalizeOverlayLayoutBounds(value: unknown, legacySettings?: unknown): OverlayLayoutBounds {
  const record = value as Partial<Record<ComboLayout, unknown>> | null;
  const legacy = legacySettings as Partial<OverlaySettings> | null;
  const legacyLayout = legacy?.layout === 'vertical' ? 'vertical' : 'horizontal';
  const defaults = DEFAULT_OVERLAY_LAYOUT_BOUNDS;
  return {
    horizontal: normalizeOverlayBounds(record?.horizontal ?? (legacyLayout === 'horizontal' ? legacy : null), defaults.horizontal),
    vertical: normalizeOverlayBounds(record?.vertical ?? (legacyLayout === 'vertical' ? legacy : null), defaults.vertical)
  };
}

function overlaySettingsForLayout(layout: ComboLayout, bounds: OverlayLayoutBounds): OverlaySettings {
  return { layout, ...bounds[layout] };
}

function loadSavedState() {
  const fallback = { moves: DEFAULT_MOVES, bindings: DEFAULT_BINDINGS, chart: null as ComboChart | null, library: [] as ComboChart[], startingCharacterSlot: 1 as CharacterSlot, overlaySettings: DEFAULT_OVERLAY_SETTINGS, overlayLayoutBounds: DEFAULT_OVERLAY_LAYOUT_BOUNDS, comboImageStyle: createDefaultComboImageStyle(), axisGateEnabled: true };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const layout = parsed.overlaySettings?.layout === 'vertical' ? 'vertical' : 'horizontal';
    const overlayLayoutBounds = normalizeOverlayLayoutBounds(parsed.overlayLayoutBounds, parsed.overlaySettings);
    return {
      moves: parsed.moves?.length ? parsed.moves : DEFAULT_MOVES,
      bindings: normalizeBindings(parsed.bindings?.length ? parsed.bindings : DEFAULT_BINDINGS),
      chart: isReasonableChart(parsed.chart) ? normalizeChart(parsed.chart) : null,
      library: parsed.library?.filter(isReasonableChart).map(normalizeChart) ?? [],
      startingCharacterSlot: CHARACTER_SLOTS.includes(parsed.startingCharacterSlot ?? 1) ? parsed.startingCharacterSlot ?? 1 : 1,
      overlaySettings: overlaySettingsForLayout(layout, overlayLayoutBounds),
      overlayLayoutBounds,
      comboImageStyle: normalizeComboImageStyle(parsed.comboImageStyle),
      axisGateEnabled: parsed.axisGateEnabled !== false
    };
  } catch {
    return fallback;
  }
}

function upsertLibraryChart(library: ComboChart[], chart: ComboChart): ComboChart[] {
  const next = [chart, ...library.filter((item) => item.id !== chart.id)];
  return next.slice(0, 30);
}

function currentPeriodLabel(chart: ComboChart | null, stepIndex: number): string {
  if (!chart) return '';
  const step = chart.steps[Math.max(0, Math.min(stepIndex, Math.max(0, chart.steps.length - 1)))];
  const time = step?.startMin ?? 0;
  const period = normalizePeriods(chart.periods).filter((candidate) => candidate.kind !== 'free_fire' && time >= candidate.startMs && time <= candidate.endMs).sort((a, b) => a.startMs - b.startMs)[0];
  return period ? `当前：${period.label}` : '';
}

function bindingCodesForMove(bindings: KeyBinding[], moveId: string): string[] {
  return bindings.find((binding) => binding.moveId === moveId)?.inputs.map((input) => normalizeInputCode(input.code)) ?? [];
}

function isPressEvent(event: TrainerLikeInputEvent): boolean {
  return event.type === 'keydown' || event.type === 'mousedown';
}

function isReleaseEvent(event: TrainerLikeInputEvent): boolean {
  return event.type === 'keyup' || event.type === 'mouseup';
}

type TrainerLikeInputEvent = { type: 'keydown' | 'keyup' | 'mousedown' | 'mouseup'; code: string; time: number };

export default function App() {
  const saved = useMemo(loadSavedState, []);
  const desktop = useMemo(() => createDesktopBridge(), []);
  const [page, setPage] = useState<Page>('record');
  const [moves, setMoves] = useState<MoveDefinition[]>(saved.moves);
  const [bindings, setBindings] = useState<KeyBinding[]>(saved.bindings);
  const [chart, setChart] = useState<ComboChart | null>(saved.chart);
  const [library, setLibrary] = useState<ComboChart[]>(saved.library);
  const [startingCharacterSlot, setStartingCharacterSlot] = useState<CharacterSlot>(saved.startingCharacterSlot);
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>(saved.overlaySettings);
  const [overlayLayoutBounds, setOverlayLayoutBounds] = useState<OverlayLayoutBounds>(saved.overlayLayoutBounds);
  const [comboImageStyle, setComboImageStyle] = useState<ComboImageStyle>(saved.comboImageStyle);
  const [editorTab, setEditorTab] = useState<EditorTab>('timeline');
  const [snapshot, setSnapshot] = useState<RecordingSnapshot>(createEmptySnapshot);
  const [debugSnapshot, setDebugSnapshot] = useState<RecordingSnapshot | null>(null);
  const [debugMessage, setDebugMessage] = useState('录制结束后，可以选择覆盖当前编辑区或调试当前连段。');
  const [globalInputEnabled, setGlobalInputEnabled] = useState(false);
  const [globalInputStatus, setGlobalInputStatus] = useState('窗口内监听');
  const [practicePreset, setPracticePreset] = useState<PracticePreset>('strict');
  const [practice, setPractice] = useState<PracticeSnapshot>(createEmptyPractice);
  const [axisGateEnabled, setAxisGateEnabled] = useState(saved.axisGateEnabled);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayMoveMode, setOverlayMoveMode] = useState(false);
  const [chartTitle, setChartTitle] = useState(chart?.title ?? '');
  const [quickInputOpen, setQuickInputOpen] = useState(false);
  const [quickInputStartStepId, setQuickInputStartStepId] = useState<string | null>(null);
  const [quickInputMemory, setQuickInputMemory] = useState<string[]>([]);
  const [editorZoom, setEditorZoom] = useState(0.46);
  const [defaultAvatars, setDefaultAvatars] = useState<DefaultAvatarEntry[]>([]);

  const overlaySettingsRef = useRef(saved.overlaySettings);
  const recorderRef = useRef(new ComboRecorder({ moves, bindings, startTriggerMoveId: 'start_challenge', stopTriggerMoveId: 'stop_recording', startingCharacterSlot }));
  const practiceRef = useRef<PracticeSession | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const capsuleInputRef = useRef<HTMLInputElement | null>(null);
  const basicAttackHoldRef = useRef(new Map<string, { pressEvent: TrainerLikeInputEvent; heavyCode: string; timer: number; fired: boolean }>());

  const practiceChart = useMemo(() => sortChartForPractice(chart), [chart]);
  const activeStep = practiceChart?.steps[practice.currentStepIndex] ?? null;
  const practiceSettings = useMemo(() => ({ ...(practicePreset === 'strict' ? STRICT_PRACTICE : practicePreset === 'lenient' ? LENIENT_PRACTICE : SIMPLE_PRACTICE), axisGateEnabled }), [practicePreset, axisGateEnabled]);
  const basicAttackCodes = useMemo(() => new Set(bindingCodesForMove(bindings, 'basic_attack')), [bindings]);
  const heavyAttackCode = useMemo(() => bindingCodesForMove(bindings, 'heavy_attack')[0] ?? 'MouseLeftHold', [bindings]);

  useEffect(() => {
    overlaySettingsRef.current = overlaySettings;
  }, [overlaySettings]);

  useEffect(() => {
    recorderRef.current = new ComboRecorder({ moves, bindings, startTriggerMoveId: 'start_challenge', stopTriggerMoveId: 'stop_recording', startingCharacterSlot });
  }, [moves, bindings, startingCharacterSlot]);

  useEffect(() => {
    if (!practiceChart) {
      practiceRef.current = null;
      setPractice(createEmptyPractice());
      return;
    }
    practiceRef.current = new PracticeSession(practiceChart, moves, bindings, practiceSettings);
    setPractice(createEmptyPractice());
  }, [practiceChart, moves, bindings, practiceSettings]);

  useEffect(() => {
    const payload = JSON.stringify({ moves, bindings, chart, library, startingCharacterSlot, overlaySettings, overlayLayoutBounds, comboImageStyle, axisGateEnabled });
    if (payload.length < LOCAL_STORAGE_SOFT_LIMIT) localStorage.setItem(STORAGE_KEY, payload);
  }, [moves, bindings, chart, library, startingCharacterSlot, overlaySettings, overlayLayoutBounds, comboImageStyle, axisGateEnabled]);

  useEffect(() => setChartTitle(chart?.title ?? ''), [chart?.id]);

  useEffect(() => {
    fetch(assetUrl('/combo-assets/default-avatars/index.json')).then((res) => res.ok ? res.json() : []).then((items: unknown) => setDefaultAvatars(normalizeAvatarPresets(items))).catch(() => setDefaultAvatars([]));
  }, []);

  useEffect(() => {
    const emit = () => desktop?.updateOverlay({ chart: practiceChart, practice, visible: overlayVisible, moveMode: overlayMoveMode, settings: overlaySettings, comboImageStyle });
    emit();
  }, [desktop, practiceChart, practice, overlaySettings, comboImageStyle, overlayVisible, overlayMoveMode]);

  useEffect(() => desktop?.onOverlayBoundsChanged?.((bounds) => {
    const layout = overlaySettingsRef.current.layout;
    setOverlaySettings((current) => current.layout === layout ? { ...current, ...bounds } : current);
    setOverlayLayoutBounds((savedBounds) => ({ ...savedBounds, [layout]: normalizeOverlayBounds(bounds, savedBounds[layout]) }));
  }), [desktop]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const normalized = normalizeDomKeyboardEvent(event, event.type as 'keydown' | 'keyup');
      if (event.type === 'keydown') {
        if (page === 'record' && normalized.code === 'Escape' && recorderRef.current.isRecording) {
          event.preventDefault();
          clearBasicAttackHoldState();
          stopRecording();
          return;
        }
        if (page === 'practice' && normalized.code === 'Escape') {
          event.preventDefault();
          clearBasicAttackHoldState();
          stopPractice();
          return;
        }
      }
      acceptTrainerInput(normalized);
    };
    const handleMouse = (event: MouseEvent) => acceptTrainerInput(normalizeDomMouseEvent(event, event.type as 'mousedown' | 'mouseup'));
    window.addEventListener('keydown', handleKey, true);
    window.addEventListener('keyup', handleKey, true);
    window.addEventListener('mousedown', handleMouse, true);
    window.addEventListener('mouseup', handleMouse, true);
    const disposeGlobal = desktop?.onGlobalInput((event) => acceptTrainerInput(event));
    return () => {
      window.removeEventListener('keydown', handleKey, true);
      window.removeEventListener('keyup', handleKey, true);
      window.removeEventListener('mousedown', handleMouse, true);
      window.removeEventListener('mouseup', handleMouse, true);
      disposeGlobal?.();
      clearBasicAttackHoldState();
    };
  }, [page, desktop, basicAttackCodes, heavyAttackCode]);

  function acceptTrainerInput(event: TrainerLikeInputEvent) {
    const normalizedCode = normalizeInputCode(event.code);
    if (basicAttackCodes.has(normalizedCode)) {
      if (isPressEvent(event)) {
        if (basicAttackHoldRef.current.has(normalizedCode)) return;
        const hold = {
          pressEvent: { ...event, code: normalizedCode },
          heavyCode: heavyAttackCode,
          timer: window.setTimeout(() => {
            const current = basicAttackHoldRef.current.get(normalizedCode);
            if (!current || current.fired) return;
            current.fired = true;
            routeTrainerInput({ ...current.pressEvent, code: current.heavyCode, time: current.pressEvent.time + HEAVY_ATTACK_HOLD_MS });
          }, HEAVY_ATTACK_HOLD_MS),
          fired: false
        };
        basicAttackHoldRef.current.set(normalizedCode, hold);
        return;
      }
      if (isReleaseEvent(event)) {
        const hold = basicAttackHoldRef.current.get(normalizedCode);
        if (!hold) return;
        window.clearTimeout(hold.timer);
        basicAttackHoldRef.current.delete(normalizedCode);
        const heldMs = event.time - hold.pressEvent.time;
        if (!hold.fired && heldMs < HEAVY_ATTACK_HOLD_MS) routeTrainerInput(hold.pressEvent);
        return;
      }
    }
    routeTrainerInput(event);
  }

  function routeTrainerInput(event: TrainerLikeInputEvent) {
    if (page === 'record') {
      const before = recorderRef.current.isRecording;
      const next = recorderRef.current.accept(event);
      setSnapshot(next);
      if (before && !next.isRecording) {
        setDebugSnapshot(next);
        setDebugMessage(`录制完成：捕获 ${next.units.length} 个指令。可以选择覆盖载入编辑区，或调试合并到当前连段。`);
      }
    }
    if (page === 'practice' && practiceRef.current) {
      setPractice(practiceRef.current.accept(event));
    }
  }

  function clearBasicAttackHoldState() {
    for (const hold of basicAttackHoldRef.current.values()) window.clearTimeout(hold.timer);
    basicAttackHoldRef.current.clear();
  }

  function manualToggleRecording() {
    if (recorderRef.current.isRecording) stopRecording();
    else setSnapshot(recorderRef.current.start(nowEventTime()));
  }

  function stopRecording() {
    const next = recorderRef.current.stop(nowEventTime());
    setSnapshot(next);
    setDebugSnapshot(next);
    setDebugMessage(`录制完成：捕获 ${next.units.length} 个指令。可以选择覆盖载入编辑区，或调试合并到当前连段。`);
  }

  function startPractice() {
    if (practice.status === 'running' || practice.status === 'armed') return;
    if (practiceRef.current) setPractice(practiceRef.current.start(nowEventTime()));
  }

  function stopPractice() {
    if (practiceRef.current) setPractice(practiceRef.current.stop());
  }

  function tickPractice() {
    if (practiceRef.current) setPractice(practiceRef.current.tick(nowEventTime()));
  }

  useEffect(() => {
    if (practice.status !== 'running') return;
    const timer = window.setInterval(tickPractice, 50);
    return () => window.clearInterval(timer);
  }, [practice.status]);

  async function startGlobalInput() {
    if (!desktop) {
      setGlobalInputStatus('网页模式：仅窗口聚焦可监听');
      setGlobalInputEnabled(false);
      return;
    }
    const result = await desktop.startGlobalInput();
    setGlobalInputEnabled(result.ok);
    setGlobalInputStatus(result.ok ? '全局监听已开启' : `全局监听不可用：${result.reason ?? '未知原因'}`);
  }

  async function stopGlobalInput() {
    setGlobalInputEnabled(false);
    setGlobalInputStatus('全局监听已关闭，保留窗口内监听');
    await desktop?.stopGlobalInput();
  }

  function overwriteChartWithRecording() {
    if (!debugSnapshot?.units.length) return;
    const nextChart = createChartFromRecording(debugSnapshot, recorderRef.current, chartTitle || `录制连段 ${new Date().toLocaleTimeString()}`);
    if (!nextChart) return;
    setChart(nextChart);
    setDebugSnapshot(null);
    setDebugMessage(`已覆盖编辑区：载入 ${nextChart.steps.length} 个指令。`);
  }

  function applyDebugSnapshot() {
    if (!chart || !debugSnapshot?.units.length) return;
    const result = mergeDebugRunIntoChart(chart, debugSnapshot);
    const nextChart = { ...result.chart, updatedAt: Date.now() };
    setChart(nextChart);
    setLibrary((current) => current.some((item) => item.id === nextChart.id) ? upsertLibraryChart(current, nextChart) : current);
    setDebugSnapshot(null);
    setDebugMessage(`已加入调试：匹配 ${result.matched}/${result.total} 个指令，提前窗口 ${result.preheated} 处，延后窗口 ${result.recovered} 处，跳过 ${result.rejected} 处疑似漏输入。`);
  }

  function updateStep(stepId: string, patch: Partial<ComboStep>) {
    if (!chart) return;
    const steps = stepId === '__insert__' ? [...chart.steps, normalizeStep(patch as ComboStep)] : chart.steps.map((step) => step.id === stepId ? normalizeStep({ ...step, ...patch }) : step);
    setChart(applyFreeFirePeriods({ ...chart, updatedAt: Date.now(), steps }));
  }

  function deleteStep(stepId: string) {
    if (!chart) return;
    setChart(applyFreeFirePeriods({ ...chart, updatedAt: Date.now(), steps: chart.steps.filter((step) => step.id !== stepId) }));
  }

  function updatePeriods(periods: ComboPeriod[]) {
    if (!chart) return;
    setChart(applyFreeFirePeriods({ ...chart, updatedAt: Date.now(), periods: constrainAxisPeriods(periods) }));
  }

  function saveCurrentChart() {
    if (!chart) return;
    const nextChart = { ...chart, title: chartTitle.trim() || chart.title || `连段 ${new Date().toLocaleTimeString()}`, updatedAt: Date.now() };
    setChart(nextChart);
    setLibrary((current) => upsertLibraryChart(current, nextChart));
  }

  function deleteLibraryChart(chartId: string) {
    setLibrary((current) => {
      const next = current.filter((item) => item.id !== chartId);
      if (chart?.id === chartId) {
        const fallback = next[0] ?? null;
        setChart(fallback);
        setChartTitle(fallback?.title ?? '');
      }
      return next;
    });
  }

  function updateMove(moveId: string, patch: Partial<MoveDefinition>) {
    setMoves((current) => current.map((move) => move.id === moveId ? { ...move, ...patch } : move));
  }

  function updateBinding(moveId: string, value: string) {
    const inputs = value.split(',').map((part) => part.trim()).filter(Boolean).map((code) => ({ code: normalizeInputCode(code), label: code }));
    setBindings((current) => current.some((binding) => binding.moveId === moveId) ? current.map((binding) => binding.moveId === moveId ? { moveId, inputs } : binding) : [...current, { moveId, inputs }]);
  }

  function updateComboImageStyle(patch: Partial<ComboImageStyle>) {
    setComboImageStyle((current) => normalizeComboImageStyle({ ...current, ...patch }));
  }

  function updateRoleStyle(slot: CharacterSlot, patch: Partial<ComboImageStyle['roleStyles'][CharacterSlot]>) {
    setComboImageStyle((current) => normalizeComboImageStyle({ ...current, roleStyles: { ...current.roleStyles, [slot]: { ...current.roleStyles[slot], ...patch } } }));
  }

  async function pickAvatar(slot: CharacterSlot, file: File | null) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    updateRoleStyle(slot, { avatar: dataUrl, avatarCrop: { x: 10, y: 10, w: 80, h: 80 } });
  }

  async function pickCapsuleImage(file: File | null) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    const size = await readImageSize(dataUrl);
    updateComboImageStyle({
      blockMode: 'image',
      capsuleImage: dataUrl,
      capsuleImageWidth: size.width,
      capsuleImageHeight: size.height,
      capsuleCrop: { x: 0, y: 0, w: 100, h: 100 },
      capsuleStretch: { left: 25, right: 75 }
    });
  }

  function applyQuickInput(values: string[]) {
    if (!practiceChart) return;
    setQuickInputMemory(values);
    const labels = { ...comboImageStyle.contentLabels };
    practiceChart.steps.forEach((step, index) => {
      if (values[index] !== undefined) labels[step.id] = values[index];
    });
    updateComboImageStyle({ contentLabels: labels });
  }

  function exportCurrentChart() {
    if (!chart) return;
    downloadJson(createChartExportPackage(chart, comboImageStyle.contentLabels, moves, bindings), `${safeFileName(chart.title)}.wwcombo.json`);
  }

  function exportLibrary() {
    downloadJson({ type: 'wwcombo-library', version: 2, charts: library, contentLabels: filterContentLabelsForCharts(library, comboImageStyle.contentLabels), moves, bindings }, 'wwcombo-library.json');
  }

  async function importCharts(file: File | null) {
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text);
    const imported = parseImportedComboPackage(parsed);
    const charts = imported.charts;
    if (!charts.length) return;
    setLibrary((current) => charts.reduce((next, item) => upsertLibraryChart(next, item), current));
    setChart(charts[0]);
    if (Object.keys(imported.contentLabels).length) updateComboImageStyle({ contentLabels: { ...comboImageStyle.contentLabels, ...imported.contentLabels } });
    if (imported.moves.length) setMoves((current) => mergeMoves(current, imported.moves));
    if (imported.bindings.length) setBindings((current) => normalizeBindings(mergeBindings(current, imported.bindings)));
  }

  async function toggleOverlay() {
    const visible = !overlayVisible;
    setOverlayVisible(visible);
    await desktop?.setOverlayVisible(visible);
  }

  async function toggleOverlayMoveMode() {
    const enabled = !overlayMoveMode;
    setOverlayMoveMode(enabled);
    let nextSettings = overlaySettings;
    if (enabled) {
      setOverlayVisible(true);
      const liveBounds = await desktop?.getOverlayBounds?.().catch(() => null);
      if (liveBounds) {
        nextSettings = { ...overlaySettings, ...liveBounds };
        setOverlaySettings(nextSettings);
        overlaySettingsRef.current = nextSettings;
        setOverlayLayoutBounds((current) => ({ ...current, [overlaySettings.layout]: { x: nextSettings.x, y: nextSettings.y, width: nextSettings.width, height: nextSettings.height } }));
      } else {
        await desktop?.setOverlayBounds(nextSettings);
      }
      await desktop?.setOverlayVisible(true);
    }
    await desktop?.setOverlayClickThrough(!enabled);
    await desktop?.updateOverlay({ chart: practiceChart, practice, visible: enabled ? true : overlayVisible, moveMode: enabled, settings: nextSettings, comboImageStyle });
  }

  async function resetOverlayBounds() {
    const next = { layout: overlaySettings.layout, ...DEFAULT_OVERLAY_LAYOUT_BOUNDS[overlaySettings.layout] };
    setOverlaySettings(next);
    overlaySettingsRef.current = next;
    setOverlayLayoutBounds((current) => ({ ...current, [next.layout]: { x: next.x, y: next.y, width: next.width, height: next.height } }));
    await desktop?.setOverlayBounds(next);
    await desktop?.updateOverlay({ chart: practiceChart, practice, visible: overlayVisible, moveMode: overlayMoveMode, settings: next, comboImageStyle });
  }

  async function setOverlayLayout(layout: ComboLayout) {
    const next = overlaySettingsForLayout(layout, overlayLayoutBounds);
    setOverlaySettings(next);
    overlaySettingsRef.current = next;
    await desktop?.setOverlayBounds(next);
    await desktop?.updateOverlay({ chart: practiceChart, practice, visible: overlayVisible, moveMode: overlayMoveMode, settings: next, comboImageStyle });
  }

  return (
    <div className="app-shell">
        <aside className="sidebar">
          <div className="brand"><div className="brand-mark"><img src="/app-icon-avatar.png" alt="" /></div><div><h1>{'鸣潮训练场'}</h1><span>Combo Trainer</span></div></div>
          <nav>
          <button className={page === 'record' ? 'active' : ''} onClick={() => setPage('record')}><Activity size={18} /><span>{'记录'}</span></button>
          <button className={page === 'practice' ? 'active' : ''} onClick={() => setPage('practice')}><Target size={18} /><span>{'练习'}</span></button>
          <button className={page === 'appearance' ? 'active' : ''} onClick={() => setPage('appearance')}><Palette size={18} /><span>{'外观'}</span></button>
          <button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}><Settings size={18} /><span>{'设置'}</span></button>
        </nav>
        <button className={`sidebar-tool sidebar-global-listener ${globalInputEnabled ? 'active' : ''}`} title={globalInputStatus} onClick={() => void (globalInputEnabled ? stopGlobalInput() : startGlobalInput())}><Keyboard size={18} /><span>{'全局监听'}</span></button>
        <div className="sidebar-illustration" aria-hidden="true" />
      </aside>

      <main className="workspace">
        {page === 'record' && (
          <section className="record-page-layout record-page-layout-v2">
            <div className="panel record-panel record-panel-v2">
              <div className="panel-title compact-title">
                <div><h2>{'记录模式'}</h2><p>{'F 开始录制，Esc 结束录制。结束后可选择覆盖编辑区或调试当前连段。'}</p></div>
                <div className="record-panel-actions"><div className={`record-dot ${snapshot.isRecording ? 'on' : ''}`} /></div>
              </div>
              <div className="record-actions">
                <button className="primary" onClick={manualToggleRecording}>{snapshot.isRecording ? <Square size={18} /> : <Play size={18} />}{snapshot.isRecording ? '结束录制 Esc' : '开始记录 F'}</button>
                <button onClick={overwriteChartWithRecording} disabled={snapshot.isRecording || !debugSnapshot?.units.length}><Upload size={18} />{'覆盖'}</button>
                <button onClick={applyDebugSnapshot} disabled={snapshot.isRecording || !debugSnapshot?.units.length || !chart}><Bug size={18} />{'调试'}</button>
              </div>
              <div className={`debug-status ${debugSnapshot?.units.length ? 'on' : ''}`}>{debugMessage}</div>
            </div>

            <div className="panel combo-editor-panel combo-editor-panel-v2">
              <div className="panel-title combo-editor-title-v2">
                <div><h2>{'连段谱编辑'}</h2><p>{'时间轴用于调整操作时机；内容模式用于编辑连段图显示文字。'}</p></div>
                <div className="editor-title-actions editor-title-actions-v2">
                  <div className="segmented editor-mode-tabs"><button className={editorTab === 'timeline' ? 'active' : ''} onClick={() => setEditorTab('timeline')}>{'时间'}</button><button className={editorTab === 'content' ? 'active' : ''} onClick={() => setEditorTab('content')}>{'内容'}</button></div>
                  <label>{'名称'} <input className="chart-title-input" value={chartTitle} onChange={(event) => setChartTitle(event.target.value)} /></label>
                  <StartingRolePicker value={startingCharacterSlot} style={comboImageStyle} onChange={setStartingCharacterSlot} />
                </div>
              </div>
              {chart && <TimelineEditor chart={chart} moves={moves} comboImageStyle={comboImageStyle} mode={editorTab} zoom={editorZoom} onZoomChange={setEditorZoom} onUpdate={updateStep} onDelete={deleteStep} onPeriodsChange={updatePeriods} onContentChange={updateComboImageStyle} onQuickInput={(stepId) => { setQuickInputStartStepId(stepId); setQuickInputOpen(true); }} onSave={saveCurrentChart} />}
              {!chart && <EmptyState text="暂无连段谱。先录制一遍并点击覆盖，或导入 JSON。" />}
            </div>
          </section>
        )}

        {page === 'practice' && (
          <section className="practice-layout">
            <div className="panel practice-main-panel">
              <div className="panel-title"><div><h2>{'练习模式'}</h2><p>{'F 开始，Esc 结束；演示按时间展示流程，练习按正确输入推进。'}</p></div><div className="segmented"><button className={practicePreset === 'simple' ? 'active' : ''} onClick={() => setPracticePreset('simple')}>{'演示'}</button><button className={practicePreset === 'lenient' ? 'active' : ''} onClick={() => setPracticePreset('lenient')}>{'练习'}</button><button className={practicePreset === 'strict' ? 'active' : ''} onClick={() => setPracticePreset('strict')}>{'挑战'}</button></div></div>
              {practiceChart ? <ComboImagePreview chart={practiceChart} practice={practice} style={comboImageStyle} layout="horizontal" bounds={overlaySettings} /> : <EmptyState text="暂无连段谱。" />}
              <div className="record-actions"><button className="primary" onClick={startPractice} disabled={practice.status === 'running' || practice.status === 'armed'}><Play size={18} />{'开始 F'}</button><button onClick={stopPractice}><Square size={18} />{'结束 Esc'}</button><button onClick={() => { setQuickInputStartStepId(null); setQuickInputOpen(true); }} disabled={!practiceChart}>{'快捷输入'}</button><button className="icon-button" onClick={toggleOverlay}>{overlayVisible ? <EyeOff size={18} /> : <Eye size={18} />}</button><label className="checkline axis-gate-toggle"><input type="checkbox" checked={axisGateEnabled} onChange={(event) => setAxisGateEnabled(event.target.checked)} />轴首招启动</label></div>
              <div className="practice-feedback-row">{practice.feedback[0] ? <div className={`feedback ${practice.feedback[0].level}`}>{practice.feedback[0].message}</div> : <div className="feedback info">{'等待输入提示'}</div>}</div>
              {practiceChart && practice.errorStepIds.length > 0 && <PracticeErrorSummary chart={practiceChart} practice={practice} />}
            </div>
            <LibraryPanel chart={chart} library={library} onSelect={(id) => setChart(library.find((item) => item.id === id) ?? chart)} onEdit={(id) => { const item = library.find((entry) => entry.id === id); if (item) { setChart(item); setPage('record'); setEditorTab('timeline'); } }} onDelete={deleteLibraryChart} onExportCurrent={exportCurrentChart} onExportLibrary={exportLibrary} onImport={() => importInputRef.current?.click()} />
            <input ref={importInputRef} className="file-input" type="file" accept="application/json,.json" onChange={(event) => void importCharts(event.target.files?.[0] ?? null)} />
          </section>
        )}

        {page === 'appearance' && (
          <section className="appearance-page-layout">
            <header className="topbar appearance-preview-bar"><ComboImagePreview chart={practiceChart} practice={practice} style={comboImageStyle} layout="horizontal" bounds={overlaySettings} /></header>
            <div className="panel appearance-page-panel">
              <div className="panel-title"><div><h2>{'连段图外观'}</h2><p>{'这里显示的效果会同步到全局置顶连段图。'}</p></div><div className="overlay-settings-panel inline-overlay-controls"><div className="segmented"><button className={overlaySettings.layout === 'horizontal' ? 'active' : ''} onClick={() => void setOverlayLayout('horizontal')}>{'横排'}</button><button className={overlaySettings.layout === 'vertical' ? 'active' : ''} onClick={() => void setOverlayLayout('vertical')}>{'竖排'}</button></div><button className={overlayMoveMode ? 'active' : ''} onClick={toggleOverlayMoveMode}>{'移动'}</button><button onClick={resetOverlayBounds}>{'复位'}</button><button className="icon-button" onClick={toggleOverlay}>{overlayVisible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
              <SimpleAppearanceEditor style={comboImageStyle} avatarPresets={defaultAvatars} onChange={updateComboImageStyle} onRoleChange={updateRoleStyle} onPickAvatar={(slot, file) => void pickAvatar(slot, file)} onPickCapsule={(file) => void pickCapsuleImage(file)} avatarInputRefs={avatarInputRefs} capsuleInputRef={capsuleInputRef} />
            </div>
          </section>
        )}

        {page === 'settings' && <SettingsPanel moves={moves} bindings={bindings} onMoveChange={updateMove} onBindingChange={updateBinding} />}
      </main>
      {quickInputOpen && practiceChart && <QuickInputDialog chart={practiceChart} style={comboImageStyle} initialValues={quickInputMemory} startStepId={quickInputStartStepId} onApply={applyQuickInput} onClose={() => setQuickInputOpen(false)} />}
    </div>
  );
}

function StartingRolePicker({ value, style, onChange }: { value: CharacterSlot; style: ComboImageStyle; onChange: (slot: CharacterSlot) => void }) {
  return (
    <div className="starting-role-picker">
      <span>首发角色</span>
      <div>
        {CHARACTER_SLOTS.map((slot) => {
          const role = style.roleStyles[slot];
          return (
            <button key={slot} type="button" className={value === slot ? 'active' : ''} onClick={() => onChange(slot)} title={role.name || `角色 ${slot}`}>
              <span className="starting-role-avatar" style={avatarBackgroundStyle(role.avatar)}>{role.avatar ? null : slot}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function avatarBackgroundStyle(src?: string): CSSProperties {
  return src ? { backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {};
}

function ComboInlineContent({ parts, className }: { parts: ReturnType<typeof comboTextParts>; className: string }) {
  return <strong className={className}>{parts.map((part, index) => part.kind === 'icon' ? <img key={`${part.iconId}-${index}`} className="combo-inline-icon" src={iconSourceForId(part.iconId)} alt={part.label} title={part.label} /> : <span key={`text-${index}`}>{part.value}</span>)}</strong>;
}

function CapsuleBlockBackground() {
  return <div className="capsule-bg" aria-hidden="true"><div className="capsule-bg-piece left" /><div className="capsule-bg-piece middle" /><div className="capsule-bg-piece right" /></div>;
}

function imageCropBackground(src: string | undefined, crop = { x: 0, y: 0, w: 100, h: 100 }): CSSProperties {
  if (!src) return {};
  const safe = normalizeRectPercent(crop, { x: 0, y: 0, w: 100, h: 100 });
  return {
    backgroundImage: `url(${src})`,
    backgroundSize: `${10000 / safe.w}% ${10000 / safe.h}%`,
    backgroundPosition: `${safe.x <= 0 ? 0 : (safe.x / Math.max(1, 100 - safe.w)) * 100}% ${safe.y <= 0 ? 0 : (safe.y / Math.max(1, 100 - safe.h)) * 100}%`,
    backgroundRepeat: 'no-repeat'
  };
}

function capsuleImageStyle(style: ComboImageStyle, width: number, height: number): CSSProperties {
  if (style.blockMode !== 'image' || !style.capsuleImage) return {};
  const image = capsuleBorderImage(style, width, height);
  return {
    backgroundImage: 'none',
    borderColor: 'transparent',
    '--capsule-render-source': `url("${image.source}")`
  } as CSSProperties;
}

function capsuleBorderImage(style: ComboImageStyle, targetWidthInput: number, targetHeightInput: number): { source: string } {
  const source = style.capsuleImage ?? '';
  const naturalWidth = Math.max(1, style.capsuleImageWidth ?? style.capsuleWidth ?? 200);
  const naturalHeight = Math.max(1, style.capsuleImageHeight ?? style.capsuleHeight ?? 80);
  const crop = normalizeRectPercent(style.capsuleCrop, { x: 0, y: 0, w: 100, h: 100 });
  const cropX = Math.round((crop.x / 100) * naturalWidth);
  const cropY = Math.round((crop.y / 100) * naturalHeight);
  const cropWidth = Math.max(1, Math.round((crop.w / 100) * naturalWidth));
  const cropHeight = Math.max(1, Math.round((crop.h / 100) * naturalHeight));
  const stretch = style.capsuleStretch ?? { left: 25, right: 75 };
  const leftLine = Math.round(clamp(((stretch.left ?? 25) / 100) * naturalWidth - cropX, 1, cropWidth - 2));
  const rightLine = Math.round(clamp(((stretch.right ?? 75) / 100) * naturalWidth - cropX, leftLine + 1, cropWidth - 1));
  const targetWidth = Math.max(1, Math.round(targetWidthInput));
  const targetHeight = Math.max(1, Math.round(targetHeightInput));
  const heightScale = targetHeight / cropHeight;
  const destLeft = Math.max(0, Math.round(leftLine * heightScale));
  const destRight = Math.max(0, Math.round((cropWidth - rightLine) * heightScale));
  const destMiddle = Math.max(0, targetWidth - destLeft - destRight);
  const stretchWidth = Math.max(1, rightLine - leftLine);
  const imageAttrs = `x="0" y="0" width="${naturalWidth}" height="${naturalHeight}" preserveAspectRatio="none" style="image-rendering:pixelated;image-rendering:crisp-edges"`; 
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${targetHeight}" viewBox="0 0 ${targetWidth} ${targetHeight}" preserveAspectRatio="none" shape-rendering="crispEdges"><svg x="0" y="0" width="${destLeft}" height="${targetHeight}" viewBox="${cropX} ${cropY} ${leftLine} ${cropHeight}" preserveAspectRatio="none"><image href="${source}" ${imageAttrs}/></svg><svg x="${destLeft}" y="0" width="${destMiddle}" height="${targetHeight}" viewBox="${cropX + leftLine} ${cropY} ${stretchWidth} ${cropHeight}" preserveAspectRatio="none"><image href="${source}" ${imageAttrs}/></svg><svg x="${destLeft + destMiddle}" y="0" width="${destRight}" height="${targetHeight}" viewBox="${cropX + rightLine} ${cropY} ${cropWidth - rightLine} ${cropHeight}" preserveAspectRatio="none"><image href="${source}" ${imageAttrs}/></svg></svg>`;
  return { source: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
}


function comboTrackMetrics(items: ReturnType<typeof chartToComboImageItems>, layout: ComboLayout, style: ComboImageStyle): ComboTrackMetric[] {
  let cursor = 0;
  return items.map((item, index) => {
    if (index > 0) cursor += style.capsuleGap;
    const size = comboImageItemSizeForText(style, item.displayText, item.showAvatar);
    const extent = layout === 'vertical' ? size.height : size.width;
    const metric = { extent, start: cursor, center: cursor + extent / 2 };
    cursor += extent;
    return metric;
  });
}

function comboItemOpacity(metric: ComboTrackMetric | undefined, activeMetric: ComboTrackMetric | undefined, trackOffset: number, layout: ComboLayout, bounds: OverlaySettings, style: ComboImageStyle): number {
  if (!style.fadeEnabled || !metric || !activeMetric) return 1;
  const viewport = Math.max(1, layout === 'vertical' ? bounds.height : bounds.width);
  const position = metric.center + trackOffset;
  const activePosition = activeMetric.center + trackOffset;
  const distance = Math.abs(position - activePosition);
  const maxDistance = Math.max(1, viewport / 2);
  const ratio = clamp(distance / maxDistance, 0, 1);
  const strength = clamp(style.fadeRange / 100, 0, 1);
  return Number((1 - ratio * strength).toFixed(3));
}

function comboTrackOffset(items: ReturnType<typeof chartToComboImageItems>, activeIndex: number, layout: ComboLayout, bounds: OverlaySettings, style: ComboImageStyle): number {
  if (!items.length) return 0;
  const current = clamp(activeIndex, 0, items.length - 1);
  const metrics = comboTrackMetrics(items, layout, style);
  const activeMetric = metrics[current];
  if (!activeMetric) return 0;
  const viewport = Math.max(1, layout === 'vertical' ? bounds.height : bounds.width);
  if (style.scrollAnchor === 'center') return Math.round(viewport / 2 - activeMetric.center);
  return Math.round(style.scrollStartOffsetPx - activeMetric.start);
}

function ComboImagePreview({ chart, practice, style, layout, bounds }: { chart: ComboChart | null; practice: PracticeSnapshot; style: ComboImageStyle; layout: ComboLayout; bounds: OverlaySettings }) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [measuredBounds, setMeasuredBounds] = useState<OverlaySettings | null>(null);
  const [nextIndicatorSide, setNextIndicatorSide] = useState<'above' | 'below' | 'left' | 'right'>('above');
  const activeIndex = practice.currentStepIndex ?? 0;
  const allItems = chartToComboImageItems(chart, style);
  const effectiveBounds = measuredBounds ?? bounds;
  const items = visibleComboImageItems(allItems, activeIndex, layout, effectiveBounds, style);
  const trackOffset = comboTrackOffset(allItems, activeIndex, layout, effectiveBounds, style);
  const metrics = comboTrackMetrics(allItems, layout, style);
  const activeMetric = metrics[clamp(activeIndex, 0, Math.max(0, metrics.length - 1))];
  const background = comboImageBackgroundSource(style);
  const periodLabel = currentPeriodLabel(chart, activeIndex);
  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setMeasuredBounds({ ...bounds, width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      setNextIndicatorSide(layout === 'vertical' ? (centerX < window.innerWidth / 2 ? 'right' : 'left') : (centerY > window.innerHeight / 2 ? 'above' : 'below'));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [bounds.x, bounds.y, bounds.width, bounds.height, layout]);
  return (
    <div ref={previewRef} className={`combo-preview ${layout} next-indicator-${nextIndicatorSide} ${items.length ? '' : 'empty'}`} style={{ backgroundImage: background ? `url(${background})` : undefined }}>
      {periodLabel && <div className="combo-period-label">{periodLabel}</div>}
      {items.length ? <div className="combo-preview-track" style={{ gap: style.capsuleGap, transform: layout === 'vertical' ? `translateY(${trackOffset}px)` : `translateX(${trackOffset}px)` }}>{items.map((item) => {
        const roleStyle = style.roleStyles[item.characterSlot];
        const chipSize = comboImageItemSizeForText(style, item.displayText, item.showAvatar);
        const contentParts = comboTextParts(item.displayText, Boolean(item.iconId));
        const blockColor = style.blockMode === 'capsule' ? roleStyle.color : 'transparent';
        const blockImageStyle = capsuleImageStyle(style, chipSize.width, chipSize.height);
        const avatarLeft = style.blockMode === 'image' ? style.avatarOffsetX - 12 : style.avatarOffsetX;
        return (
          <div key={item.step.id} className={`combo-preview-chip ${style.blockMode === 'image' ? 'image-block' : ''} ${item.showAvatar ? 'with-avatar' : ''} ${item.index === activeIndex ? 'active' : ''} ${style.prePromptEnabled && item.index === activeIndex + 1 ? 'next' : ''} ${practice.errorStepIds.includes(item.step.id) ? 'error' : ''}`} style={{ width: chipSize.width, height: chipSize.height, color: style.textColor, fontSize: style.fontSize, fontFamily: style.fontFamily, opacity: style.prePromptEnabled && item.index === activeIndex + 1 ? 1 : comboItemOpacity(metrics[item.index], activeMetric, trackOffset, layout, effectiveBounds, style), backgroundColor: blockColor, borderRadius: style.blockMode === 'capsule' && style.capsuleShape === 'capsule' ? 999 : 4, '--move-color': roleStyle.color, ...blockImageStyle } as CSSProperties}>
            {style.blockMode === 'image' && <CapsuleBlockBackground />}
            {item.showAvatar && <span className="avatar-slot preview-avatar" style={{ width: style.avatarSize, height: style.avatarSize, left: avatarLeft, transform: `translateY(calc(-50% + ${style.avatarOffsetY}px))`, ...imageCropBackground(roleStyle.avatar, roleStyle.avatarCrop) }}>{roleStyle.avatar ? null : item.characterSlot}</span>}
            <ComboInlineContent parts={contentParts} className="combo-preview-content" />
          </div>
        );
      })}</div> : '暂无连段图'}
    </div>
  );
}

type TimelineContext = {
  x: number;
  y: number;
  stepId?: string;
  stepIds?: string[];
  periodId?: string;
  coveredSteps: ComboStep[];
  coveredPeriods: ComboPeriod[];
};

type TimelineLane = {
  slot: CharacterSlot;
  lane: LaneKind;
  id: string;
  laneNumber: 1 | 2;
};


function createDraftStep(point: { slot: CharacterSlot; lane: LaneKind; startMs: number }): ComboStep {
  return normalizeStep({
    id: crypto.randomUUID(),
    moveId: DRAFT_MOVE_ID,
    label: '待设置指令',
    characterSlot: point.slot,
    lane: point.lane,
    independent: point.lane === 'independent',
    startMin: Math.max(0, Math.round(point.startMs)),
    startMax: Math.max(0, Math.round(point.startMs + 120)),
    durationMin: 35,
    durationMax: 300,
    color: '#9099a3',
    advancesStep: false,
    manualFree: false,
    free: false,
    samples: []
  });
}

function inferPeriodPlacement(point: { slot?: CharacterSlot; lane?: LaneKind; startMs: number }, periods: ComboPeriod[]): ComboPeriod {
  const startMs = Math.max(0, Math.round(point.startMs));
  if (point.slot && point.lane) {
    return normalizePeriod({ id: crypto.randomUUID(), kind: 'free_fire', label: defaultPeriodLabel('free_fire'), characterSlot: point.slot, lane: point.lane, startMs, endMs: startMs + DEFAULT_FREE_FIRE_DURATION });
  }
  const startup = periods.find((period) => period.kind === 'startup_axis');
  if (!startup && startMs <= AXIS_PLACEMENT_WINDOW) {
    return normalizePeriod({ id: crypto.randomUUID(), kind: 'startup_axis', label: defaultPeriodLabel('startup_axis'), startMs: 0, endMs: DEFAULT_AXIS_DURATION });
  }
  const loopIndex = periods.filter((period) => period.kind === 'loop_axis').length + 1;
  const axisEnd = Math.max(startup?.endMs ?? 0, ...periods.filter((period) => period.kind === 'loop_axis').map((period) => period.endMs), 0);
  const axisStart = Math.abs(startMs - axisEnd) <= AXIS_PLACEMENT_WINDOW ? axisEnd : startMs;
  return normalizePeriod({ id: crypto.randomUUID(), kind: 'loop_axis', label: defaultPeriodLabel('loop_axis', loopIndex), startMs: axisStart, endMs: axisStart + DEFAULT_AXIS_DURATION, loopIndex });
}

function moveLabelForPeriodKind(kind: ComboPeriodKind, periods: ComboPeriod[]) {
  const loopIndex = periods.filter((period) => period.kind === 'loop_axis').length + 1;
  return defaultPeriodLabel(kind, loopIndex);
}

function displayMoveLabel(step: ComboStep): string {
  if (step.moveId === 'switch_1') return '1';
  if (step.moveId === 'switch_2') return '2';
  if (step.moveId === 'switch_3') return '3';
  return step.label.replace(/^切人(?=\d)/, '');
}

function TimelineEditor({ chart, moves, comboImageStyle, mode, zoom, onZoomChange, onUpdate, onDelete, onPeriodsChange, onContentChange, onQuickInput, onSave }: { chart: ComboChart; moves: MoveDefinition[]; comboImageStyle: ComboImageStyle; mode: EditorTab; zoom: number; onZoomChange: (value: number) => void; onUpdate: (stepId: string, patch: Partial<ComboStep>) => void; onDelete: (stepId: string) => void; onPeriodsChange: (periods: ComboPeriod[]) => void; onContentChange: (patch: Partial<ComboImageStyle>) => void; onQuickInput: (stepId: string | null) => void; onSave: () => void }) {
  const [selectedId, setSelectedId] = useState(chart.steps[0]?.id ?? '');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [pending, setPending] = useState<PendingPlacement | null>(null);
  const [pendingPoint, setPendingPoint] = useState<{ slot?: CharacterSlot; lane?: LaneKind; startMs: number } | null>(null);
  const [copied, setCopied] = useState<ComboStep | null>(null);
  const [copiedPeriod, setCopiedPeriod] = useState<ComboPeriod | null>(null);
  const [context, setContext] = useState<TimelineContext | null>(null);
  const [raisedStepId, setRaisedStepId] = useState<string | null>(null);
  const [raisedPeriodId, setRaisedPeriodId] = useState<string | null>(null);
  const [dragRenderTotal, setDragRenderTotal] = useState<number | null>(null);
  const actionMoves = moves.filter((move) => move.id !== 'start_challenge');
  const periods = constrainAxisPeriods(chart.periods ?? []);
  const selected = chart.steps.find((step) => step.id === selectedId) ?? chart.steps[0] ?? null;
  const selectedSteps = chart.steps.filter((step) => selectedIds.includes(step.id));
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId) ?? null;
  const total = Math.max(3000, ...chart.steps.map((step) => step.startMax + step.durationMax + 600), ...periods.map((period) => period.endMs + 600));
  const renderTotal = dragRenderTotal ?? total;
  const trackWidth = Math.max(760, Math.ceil(renderTotal * zoom));
  const lanes: TimelineLane[] = CHARACTER_SLOTS.flatMap((slot) => [
    { slot, lane: 'main' as const, id: `${slot}:main`, laneNumber: 1 as const },
    { slot, lane: 'independent' as const, id: `${slot}:independent`, laneNumber: 2 as const }
  ]);
  const globalPeriods = periods.filter((period) => period.characterSlot === undefined || period.kind !== 'free_fire');

  function updatePeriod(periodId: string, patch: Partial<ComboPeriod>) {
    onPeriodsChange(periods.map((period) => period.id === periodId ? normalizePeriod({ ...period, ...patch }) : period));
  }

  function updateSelectedSteps(patch: Partial<ComboStep>) {
    selectedSteps.forEach((step) => onUpdate(step.id, patch));
  }

  function setContentLabel(stepId: string, value: string) {
    onContentChange({ contentLabels: { ...comboImageStyle.contentLabels, [stepId]: maybeConvertTextToIconLabel(value, comboImageStyle.convertIcons) } });
  }

  function toggleStepSelection(stepId: string, additive: boolean) {
    setSelectedId(stepId);
    setSelectedIds((current) => additive ? (current.includes(stepId) ? current.filter((id) => id !== stepId) : [...current, stepId]) : [stepId]);
  }

  function setPeriodKind(periodId: string, kind: ComboPeriodKind) {
    const loopIndex = periods.filter((period) => period.kind === 'loop_axis').length + 1;
    updatePeriod(periodId, {
      kind,
      characterSlot: kind === 'free_fire' ? periods.find((period) => period.id === periodId)?.characterSlot : undefined,
      lane: kind === 'free_fire' ? periods.find((period) => period.id === periodId)?.lane : undefined,
      label: defaultPeriodLabel(kind, loopIndex),
      loopIndex: kind === 'loop_axis' ? loopIndex : undefined,
      startMs: kind === 'startup_axis' ? 0 : periods.find((period) => period.id === periodId)?.startMs
    });
  }

  function applyMoveToSteps(stepIds: string[], move: MoveDefinition) {
    stepIds.forEach((stepId) => {
      const current = chart.steps.find((step) => step.id === stepId);
      if (!current) return;
      onUpdate(stepId, {
        moveId: move.id,
        label: move.label,
        color: move.color,
        advancesStep: move.advancesStep,
        independent: move.independent,
        lane: current.lane,
        manualFree: current.manualFree ?? false
      });
    });
    setContext(null);
  }

  function placePending(point: { slot?: CharacterSlot; lane?: LaneKind; startMs: number }) {
    if (!pending) return;
    if (pending.kind === 'step' && point.slot && point.lane) {
      const step = createDraftStep({ slot: point.slot, lane: point.lane, startMs: point.startMs });
      onUpdate('__insert__', step);
      setSelectedId(step.id);
      setSelectedIds([step.id]);
    }
    if (pending.kind === 'period') {
      const period = inferPeriodPlacement(point, periods);
      onPeriodsChange([...periods, period]);
      setSelectedPeriodId(period.id);
    }
    setPending(null);
    setPendingPoint(null);
  }

  function laneHit(clientX: number, clientY: number) {
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const track = element?.closest('.timeline-editor-track') as HTMLElement | null;
    const row = element?.closest('.timeline-editor-row') as HTMLElement | null;
    if (!track || !row) return null;
    const slot = Number(row.dataset.slot) as CharacterSlot;
    const lane = row.dataset.lane as LaneKind;
    if (!CHARACTER_SLOTS.includes(slot) || (lane !== 'main' && lane !== 'independent')) return null;
    return { slot, lane };
  }

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>, stepId: string, mode: 'move' | 'start' | 'end' | 'preheat' | 'recovery') {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(stepId);
    const selectedForDrag = mode === 'move' && selectedIds.includes(stepId) ? selectedIds : [stepId];
    if (!event.ctrlKey && mode === 'move' && !selectedIds.includes(stepId)) setSelectedIds([stepId]);
    if (mode !== 'move') setSelectedIds([stepId]);
    const track = event.currentTarget.closest('.timeline-editor-track') as HTMLElement | null;
    if (!track) return;
    const originals = new Map(chart.steps.filter((candidate) => selectedForDrag.includes(candidate.id)).map((candidate) => [candidate.id, { ...candidate }]));
    const original = originals.get(stepId);
    if (!original) return;
    const startX = event.clientX;
    const dragTotal = total;
    const dragTrackWidth = Math.max(1, track.getBoundingClientRect().width);
    setDragRenderTotal(dragTotal);
    const onMove = (moveEvent: PointerEvent) => {
      const deltaMs = ((moveEvent.clientX - startX) / dragTrackWidth) * dragTotal;
      if (mode === 'move') {
        const lane = laneHit(moveEvent.clientX, moveEvent.clientY);
        originals.forEach((snapshot, id) => {
          const duration = snapshot.startMax - snapshot.startMin;
          const startMin = clamp(snapshot.startMin + deltaMs, 0, Math.max(0, dragTotal - duration));
          const startMax = startMin + duration;
          onUpdate(id, { startMin: Math.round(startMin), startMax: Math.round(startMax), ...(lane ? { characterSlot: lane.slot, lane: lane.lane, independent: snapshot.independent } : {}) });
        });
      }
      if (mode === 'start') onUpdate(stepId, { startMin: Math.round(clamp(original.startMin + deltaMs, 0, original.startMax - MIN_EDITOR_DURATION)) });
      if (mode === 'end') onUpdate(stepId, { durationMax: Math.round(clamp(original.durationMax + deltaMs, MIN_EDITOR_DURATION, dragTotal - original.startMin)) });
      if (mode === 'preheat') onUpdate(stepId, { preheatMs: Math.round(clamp((original.preheatMs ?? 0) + deltaMs, 0, original.durationMax - MIN_EDITOR_DURATION)) });
      if (mode === 'recovery') onUpdate(stepId, { recoveryMs: Math.round(clamp((original.recoveryMs ?? 0) - deltaMs, 0, original.durationMax - (original.preheatMs ?? 0) - MIN_EDITOR_DURATION)) });
    };
    const onUp = () => {
      setDragRenderTotal(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function beginPeriodDrag(event: ReactPointerEvent<HTMLElement>, periodId: string, mode: 'move' | 'start' | 'end') {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedPeriodId(periodId);
    const period = periods.find((candidate) => candidate.id === periodId);
    const track = event.currentTarget.closest('.timeline-editor-track, .timeline-editor-period-track') as HTMLElement | null;
    if (!period || !track) return;
    const startX = event.clientX;
    const original = { ...period };
    const dragTotal = total;
    const dragTrackWidth = Math.max(1, track.getBoundingClientRect().width);
    setDragRenderTotal(dragTotal);
    const onMove = (moveEvent: PointerEvent) => {
      const deltaMs = ((moveEvent.clientX - startX) / dragTrackWidth) * dragTotal;
      if (mode === 'move' && period.kind !== 'startup_axis') {
        const length = original.endMs - original.startMs;
        const startMs = clamp(original.startMs + deltaMs, 0, Math.max(0, dragTotal - length));
        const lane = laneHit(moveEvent.clientX, moveEvent.clientY);
        updatePeriod(periodId, { startMs: Math.round(startMs), endMs: Math.round(startMs + length), ...(lane && original.kind === 'free_fire' ? { characterSlot: lane.slot, lane: lane.lane } : {}) });
      }
      if (mode === 'start' && period.kind !== 'startup_axis') updatePeriod(periodId, { startMs: Math.round(clamp(original.startMs + deltaMs, 0, original.endMs - MIN_EDITOR_DURATION)) });
      if (mode === 'end') updatePeriod(periodId, { endMs: Math.round(clamp(original.endMs + deltaMs, original.startMs + MIN_EDITOR_DURATION, dragTotal)) });
    };
    const onUp = () => {
      setDragRenderTotal(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function pointerTime(event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.round(clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * renderTotal, 0, renderTotal));
  }

  function beginBoxSelect(event: ReactPointerEvent<HTMLDivElement>) {
    if (pending || event.button !== 0 || event.target !== event.currentTarget) return;
    const body = event.currentTarget.closest('.timeline-editor-body') as HTMLElement | null;
    if (!body) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bodyRect = body.getBoundingClientRect();
    const startX = clamp(event.clientX - bodyRect.left, 0, bodyRect.width);
    const startY = clamp(event.clientY - bodyRect.top, 0, bodyRect.height);
    const additive = event.ctrlKey;
    const updateBox = (clientX: number, clientY: number) => {
      const currentX = clamp(clientX - bodyRect.left, 0, bodyRect.width);
      const currentY = clamp(clientY - bodyRect.top, 0, bodyRect.height);
      setSelectionBox({ x: Math.min(startX, currentX), y: Math.min(startY, currentY), width: Math.abs(currentX - startX), height: Math.abs(currentY - startY) });
    };
    const onMove = (moveEvent: PointerEvent) => updateBox(moveEvent.clientX, moveEvent.clientY);
    const onUp = (upEvent: PointerEvent) => {
      updateBox(upEvent.clientX, upEvent.clientY);
      const endX = clamp(upEvent.clientX - bodyRect.left, 0, bodyRect.width);
      const endY = clamp(upEvent.clientY - bodyRect.top, 0, bodyRect.height);
      const selectionRect = {
        left: bodyRect.left + Math.min(startX, endX),
        right: bodyRect.left + Math.max(startX, endX),
        top: bodyRect.top + Math.min(startY, endY),
        bottom: bodyRect.top + Math.max(startY, endY)
      };
      const hitIds = Array.from(body.querySelectorAll<HTMLElement>('.timeline-editor-block[data-step-id]'))
        .filter((element) => {
          const blockRect = element.getBoundingClientRect();
          return blockRect.left <= selectionRect.right && blockRect.right >= selectionRect.left && blockRect.top <= selectionRect.bottom && blockRect.bottom >= selectionRect.top;
        })
        .map((element) => element.dataset.stepId)
        .filter((id): id is string => Boolean(id));
      const hits = chart.steps.filter((step) => hitIds.includes(step.id)).map((step) => step.id);
      setSelectedIds((current) => additive ? Array.from(new Set([...current, ...hits])) : hits);
      if (hits[0]) setSelectedId(hits[0]);
      setSelectionBox(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function hitPeriods(pointerMs: number, slot?: CharacterSlot, lane?: LaneKind) {
    return periods.filter((period) => {
      const sameTime = pointerMs >= period.startMs && pointerMs <= period.endMs;
      const sameScope = period.characterSlot === undefined || (period.characterSlot === slot && (!period.lane || period.lane === lane));
      return sameTime && sameScope;
    }).sort((a, b) => (b.endMs - b.startMs) - (a.endMs - a.startMs));
  }

  function openStepContext(event: ReactMouseEvent<HTMLDivElement>, step: ComboStep | null, laneSteps: ComboStep[]) {
    event.preventDefault();
    event.stopPropagation();
    const pointerMs = pointerTimeInTrack(event, renderTotal);
    const hits = laneSteps.filter((candidate) => pointerMs >= candidate.startMin && pointerMs <= candidate.startMin + candidate.durationMax).sort((a, b) => b.durationMax - a.durationMax);
    const target = step ?? hits[0] ?? null;
    const lane = target ? { slot: target.characterSlot ?? 1, lane: target.lane } : laneHit(event.clientX, event.clientY) ?? undefined;
    const periodHits = hitPeriods(pointerMs, lane?.slot, lane?.lane);
    if (!target && !periodHits.length) return;
    if (target) setSelectedId(target.id);
    const contextStepIds = target && selectedIds.includes(target.id) ? selectedIds : target ? [target.id] : [];
    if (target && !selectedIds.includes(target.id)) setSelectedIds([target.id]);
    setContext({ x: event.clientX, y: event.clientY, stepId: target?.id, stepIds: contextStepIds, periodId: periodHits[0]?.id, coveredSteps: hits, coveredPeriods: periodHits });
  }

  function openPeriodContext(event: ReactMouseEvent<HTMLElement>, period: ComboPeriod | null, slot?: CharacterSlot, lane?: LaneKind) {
    event.preventDefault();
    event.stopPropagation();
    const pointerMs = pointerTimeInTrack(event, renderTotal);
    const hits = hitPeriods(pointerMs, slot, lane);
    const target = period ?? hits[0] ?? null;
    if (!target) return;
    setSelectedPeriodId(target.id);
    setContext({ x: event.clientX, y: event.clientY, periodId: target.id, coveredSteps: [], coveredPeriods: hits });
  }

  function pasteStep() {
    if (!copied) return;
    onUpdate('__insert__', normalizeStep({ ...copied, id: crypto.randomUUID(), startMin: copied.startMin + 160, startMax: copied.startMax + 160 }));
    setContext(null);
  }

  function pastePeriod() {
    if (!copiedPeriod) return;
    const length = copiedPeriod.endMs - copiedPeriod.startMs;
    onPeriodsChange([...periods, normalizePeriod({ ...copiedPeriod, id: crypto.randomUUID(), startMs: copiedPeriod.startMs + 160, endMs: copiedPeriod.startMs + 160 + length })]);
    setContext(null);
  }

  function firstStepInPeriod(period: ComboPeriod): ComboStep | null {
    return [...chart.steps]
      .filter((step) => step.startMin >= period.startMs && step.startMin <= period.endMs)
      .sort((left, right) => left.startMin - right.startMin || left.startMax - right.startMax || left.id.localeCompare(right.id))[0] ?? null;
  }

  function isValidLoopStarter(step: ComboStep | null): boolean {
    return Boolean(step && (step.moveId === 'liberation' || step.moveId.startsWith('switch_')));
  }

  function renderPeriodBlock(period: ComboPeriod, roleScoped = false) {
    const invalidLoopStarter = period.kind === 'loop_axis' && !isValidLoopStarter(firstStepInPeriod(period));
    const periodClass = `timeline-period ${period.kind} ${invalidLoopStarter ? 'invalid-loop' : ''} ${roleScoped ? 'role-scoped' : ''} ${selectedPeriodId === period.id ? 'selected' : ''} ${raisedPeriodId === period.id ? 'raised' : ''}`;
    return <div key={period.id} className={periodClass} style={{ left: `${(period.startMs / renderTotal) * 100}%`, width: `${Math.max(1.8, ((period.endMs - period.startMs) / renderTotal) * 100)}%`, zIndex: raisedPeriodId === period.id ? 7 : roleScoped ? 0 : 1 }} onPointerDown={(event) => beginPeriodDrag(event, period.id, 'move')} onContextMenu={(event) => openPeriodContext(event, period, period.characterSlot, period.lane)}><span className="period-edge left" onPointerDown={(event) => beginPeriodDrag(event, period.id, 'start')} /><strong>{period.label}</strong><span>{((period.endMs - period.startMs) / 1000).toFixed(2)}s</span><span className="period-edge right" onPointerDown={(event) => beginPeriodDrag(event, period.id, 'end')} /></div>;
  }

  function renderStepLabel(step: ComboStep) {
    if (mode === 'content') {
      return <label className="timeline-content-label" onPointerDown={(event) => event.stopPropagation()}><input value={comboImageStyle.contentLabels[step.id] ?? ''} placeholder={displayMoveLabel(step)} onChange={(event) => onContentChange({ contentLabels: { ...comboImageStyle.contentLabels, [step.id]: event.target.value } })} onBlur={(event) => setContentLabel(step.id, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><span>{displayMoveLabel(step)}</span></label>;
    }
    return <strong>{displayMoveLabel(step)}</strong>;
  }

  return (
    <div className="timeline-editor">
      <div className="timeline-editor-toolbar"><div className="timeline-editor-add">
        <button className={pending?.kind === 'step' ? 'active' : ''} onClick={() => setPending({ kind: 'step' })}><Plus size={16} />添加指令</button>
        <button className={pending?.kind === 'period' ? 'active' : ''} onClick={() => setPending({ kind: 'period' })}><Plus size={16} />添加时段</button>
        <label className="timeline-zoom-control">缩放<input type="range" min="0.05" max="1.6" step="0.01" value={zoom} onChange={(event) => onZoomChange(Number(event.target.value))} /><span>{Math.round(zoom * 100)}%</span></label>
        <button className="primary" onClick={onSave}><Save size={18} />{'保存连段谱'}</button>
        {mode === 'content' && <label className="checkline timeline-icon-convert"><input type="checkbox" checked={comboImageStyle.convertIcons} onChange={(event) => onContentChange({ convertIcons: event.target.checked })} />图标转换</label>}
        {mode === 'content' && <button className="danger" onClick={() => onQuickInput(selected?.id ?? null)}>快捷输入</button>}
        {pending && <button onClick={() => { setPending(null); setPendingPoint(null); }}>取消放置</button>}
        {pending && <span className="timeline-hint">点击轨道放置{pending.kind === 'step' ? '灰色指令块' : '黑色时段块'}，再右键选择内容</span>}
      </div></div>
      <div className="timeline-editor-scroll">
        <div className={`timeline-editor-period-track ${pending ? 'placing' : ''}`} style={{ width: trackWidth }} onPointerMove={(event) => { if (!pending || pending.kind !== 'period') return; setPendingPoint({ startMs: pointerTime(event) }); }} onClick={(event) => { if (!pending || pending.kind !== 'period') return; placePending({ startMs: pointerTime(event) }); }} onContextMenu={(event) => openPeriodContext(event, null)}>
          <div className="timeline-editor-lane period-lane-label">时段</div>
          {globalPeriods.map((period) => renderPeriodBlock(period))}
          {pending?.kind === 'period' && pendingPoint && pendingPoint.slot === undefined && <div className="timeline-placement-ghost period" style={{ left: `${(pendingPoint.startMs / renderTotal) * 100}%`, width: `${Math.max(1.8, (1000 / renderTotal) * 100)}%` }}>待设置时段</div>}
        </div>
        <div className="timeline-editor-ruler" style={{ width: trackWidth }}>{Array.from({ length: Math.ceil(renderTotal / 500) + 1 }, (_, index) => <span key={index} style={{ left: `${((index * 500) / renderTotal) * 100}%` }}>{(index * 0.5).toFixed(index % 2 === 0 ? 0 : 1)}s</span>)}</div>
        <div className="timeline-editor-body" style={{ width: trackWidth }}>
          {lanes.map((lane) => {
            const roleStyle = comboImageStyle.roleStyles[lane.slot];
            const laneSteps = chart.steps.filter((step) => (step.characterSlot ?? 1) === lane.slot && step.lane === lane.lane);
            const scopedPeriods = periods.filter((period) => period.characterSlot === lane.slot && period.lane === lane.lane && period.kind === 'free_fire');
            return <div className="timeline-editor-row" key={lane.id} data-slot={lane.slot} data-lane={lane.lane}>
              <div className="timeline-editor-lane avatar-lane-label">{lane.laneNumber === 1 && <><span className="lane-avatar" style={{ backgroundImage: roleStyle.avatar ? `url(${roleStyle.avatar})` : undefined, borderColor: roleStyle.color }}>{roleStyle.avatar ? null : lane.slot}</span><span>{roleStyle.name || `角色${lane.slot}`}</span></>}</div>
              <div className={`timeline-editor-track ${pending ? 'placing' : ''}`} onPointerMove={(event) => { if (!pending) return; setPendingPoint({ slot: lane.slot, lane: lane.lane, startMs: pointerTime(event) }); }} onClick={(event) => { if (!pending) return; placePending({ slot: lane.slot, lane: lane.lane, startMs: pointerTime(event) }); }} onContextMenu={(event) => openStepContext(event, null, laneSteps)} onPointerDown={beginBoxSelect}>
                {scopedPeriods.map((period) => renderPeriodBlock(period, true))}
                {laneSteps.map((step) => {
                  const preheatPercent = clamp(((step.preheatMs ?? 0) / step.durationMax) * 100, 0, 88);
                  const recoveryPercent = clamp(((step.recoveryMs ?? 0) / step.durationMax) * 100, 0, 88 - preheatPercent);
                  const isDraft = step.moveId === DRAFT_MOVE_ID;
                  return <div key={step.id} data-step-id={step.id} className={`timeline-editor-block ${step.free ? 'free' : ''} ${isDraft ? 'draft' : ''} ${selectedIds.includes(step.id) ? 'selected' : ''} ${raisedStepId === step.id ? 'raised' : ''}`} style={{ left: `${(step.startMin / renderTotal) * 100}%`, width: `${Math.max(1.8, (step.durationMax / renderTotal) * 100)}%`, '--move-color': step.color, zIndex: raisedStepId === step.id ? 8 : selectedIds.includes(step.id) ? 5 : 2 } as CSSProperties} onPointerDown={(event) => { if (event.ctrlKey) { event.preventDefault(); event.stopPropagation(); toggleStepSelection(step.id, true); return; } beginDrag(event, step.id, 'move'); }} onContextMenu={(event) => openStepContext(event, step, laneSteps)}><div className="resize-handle left" onPointerDown={(event) => { event.stopPropagation(); beginDrag(event, step.id, 'start'); }} /><div className="warmup-zone left" style={{ width: `${preheatPercent}%` }} /><div className="warmup-zone right" style={{ width: `${recoveryPercent}%` }} /><div className="warmup-divider preheat" style={{ left: `${preheatPercent}%` }} onPointerDown={(event) => { if (event.altKey) { event.stopPropagation(); beginDrag(event, step.id, 'preheat'); } }} /><div className="warmup-divider recovery" style={{ right: `${recoveryPercent}%` }} onPointerDown={(event) => { if (event.altKey) { event.stopPropagation(); beginDrag(event, step.id, 'recovery'); } }} />{renderStepLabel(step)}{step.free && <em>自由</em>}{mode === 'content' && <div className="timeline-block-meta"><span className="move-type">{displayMoveLabel(step)}</span><span className="duration">{(step.durationMax / 1000).toFixed(2)}s</span></div>}<div className="resize-handle right" onPointerDown={(event) => { event.stopPropagation(); beginDrag(event, step.id, 'end'); }} /></div>;
                })}
                {pending && pendingPoint?.slot === lane.slot && pendingPoint.lane === lane.lane && <div className={`timeline-placement-ghost ${pending.kind}`} style={{ left: `${(pendingPoint.startMs / renderTotal) * 100}%`, width: pending.kind === 'period' ? `${Math.max(1.8, (1000 / renderTotal) * 100)}%` : `${Math.max(1.8, (300 / renderTotal) * 100)}%` }}>{pending.kind === 'step' ? '待设置指令' : '待设置时段'}</div>}
              </div>
            </div>;
          })}
          {selectionBox && <div className="timeline-selection-box" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height }} />}
        </div>
      </div>
      {context && <div className="timeline-context-menu" style={{ left: context.x, top: context.y }} onClick={(event) => event.stopPropagation()}>
        {context.stepIds?.some((stepId) => chart.steps.find((step) => step.id === stepId)?.moveId === DRAFT_MOVE_ID) && <div className="context-menu-title">选择指令</div>}
        {context.stepIds?.some((stepId) => chart.steps.find((step) => step.id === stepId)?.moveId === DRAFT_MOVE_ID) && actionMoves.map((move) => <button key={move.id} onClick={() => applyMoveToSteps(context.stepIds!.filter((stepId) => chart.steps.find((step) => step.id === stepId)?.moveId === DRAFT_MOVE_ID), move)}>{move.label}</button>)}
        {context.periodId && <div className="context-menu-title">切换时段类型</div>}
        {context.periodId && (['free_fire', 'startup_axis', 'loop_axis'] as ComboPeriodKind[]).map((kind) => <button key={kind} onClick={() => { setPeriodKind(context.periodId!, kind); setContext(null); }}>{moveLabelForPeriodKind(kind, periods)}</button>)}
        {context.stepId && <><div className="context-menu-title">{(context.stepIds?.length ?? 0) > 1 ? `已选 ${context.stepIds!.length} 个指令` : '指令'}</div><button onClick={() => { const step = chart.steps.find((item) => item.id === context.stepId); if (step) setCopied(step); setContext(null); }}>复制指令</button><button onClick={pasteStep} disabled={!copied}>粘贴指令</button><button onClick={() => { const targetIds = context.stepIds?.length ? context.stepIds : [context.stepId!]; targetIds.forEach((stepId) => onUpdate(stepId, { manualFree: !chart.steps.find((item) => item.id === stepId)?.manualFree })); setContext(null); }}>切换自由标签</button><button onClick={() => { const targetIds = context.stepIds?.length ? context.stepIds : [context.stepId!]; targetIds.forEach((stepId) => onDelete(stepId)); setContext(null); }}>删除指令</button></>}
        {context.periodId && <><div className="context-menu-title">时段</div><button onClick={() => { const period = periods.find((item) => item.id === context.periodId); if (period) setCopiedPeriod(period); setContext(null); }}>复制时段</button><button onClick={pastePeriod} disabled={!copiedPeriod}>粘贴时段</button><button onClick={() => { onPeriodsChange(periods.filter((period) => period.id !== context.periodId)); setContext(null); }}>删除时段</button></>}
        {context.coveredSteps.length > 1 && <div className="context-menu-title">光标下的指令</div>}
        {context.coveredSteps.map((step) => <button key={step.id} onClick={() => { setSelectedId(step.id); setSelectedIds([step.id]); setRaisedStepId(step.id); setContext(null); }}>{step.label} 路 {(step.durationMax / 1000).toFixed(2)}s</button>)}
        {context.coveredPeriods.length > 1 && <div className="context-menu-title">光标下的时段</div>}
        {context.coveredPeriods.map((period) => <button key={period.id} onClick={() => { setSelectedPeriodId(period.id); setRaisedPeriodId(period.id); setContext(null); }}>{period.label} 路 {((period.endMs - period.startMs) / 1000).toFixed(2)}s</button>)}
      </div>}
      {selectedPeriod && (
        <div className="timeline-period-inspector">
          <strong>{selectedPeriod.label}</strong>
          <label>类型<select value={selectedPeriod.kind} onChange={(event) => setPeriodKind(selectedPeriod.id, event.target.value as ComboPeriodKind)}><option value="draft_period">待设置</option><option value="free_fire">自由开火</option><option value="startup_axis">启动轴</option><option value="loop_axis">循环轴</option></select></label>
          <label>名称<input value={selectedPeriod.label} onChange={(event) => updatePeriod(selectedPeriod.id, { label: event.target.value })} /></label>
          {selectedPeriod.kind === 'loop_axis' && <label>编号<input type="number" value={selectedPeriod.loopIndex ?? 1} onChange={(event) => updatePeriod(selectedPeriod.id, { loopIndex: Number(event.target.value) })} /></label>}
          <label>开始<input type="number" disabled={selectedPeriod.kind === 'startup_axis'} value={Math.round(selectedPeriod.startMs)} onChange={(event) => updatePeriod(selectedPeriod.id, { startMs: Number(event.target.value) })} /></label>
          <label>结束<input type="number" value={Math.round(selectedPeriod.endMs)} onChange={(event) => updatePeriod(selectedPeriod.id, { endMs: Number(event.target.value) })} /></label>
          <button onClick={() => onPeriodsChange(periods.filter((period) => period.id !== selectedPeriod.id))}>删除时段</button>
        </div>
      )}
      {selected && (
        <div className="timeline-editor-inspector">
          <strong style={{ color: selected.color }}>{selectedSteps.length > 1 ? `已选 ${selectedSteps.length} 个` : selected.label}</strong>
          <label>角色<select value={selected.characterSlot ?? 1} onChange={(event) => selectedSteps.length > 1 ? updateSelectedSteps({ characterSlot: Number(event.target.value) as CharacterSlot }) : onUpdate(selected.id, { characterSlot: Number(event.target.value) as CharacterSlot })}>{CHARACTER_SLOTS.map((slot) => <option key={slot} value={slot}>角色 {slot}</option>)}</select></label>
          <label>轨道<select value={selected.lane} onChange={(event) => selectedSteps.length > 1 ? updateSelectedSteps({ lane: event.target.value as LaneKind }) : onUpdate(selected.id, { lane: event.target.value as LaneKind })}><option value="main">轨道 1</option><option value="independent">轨道 2</option></select></label>
          <label><input type="checkbox" checked={Boolean(selected.manualFree)} onChange={(event) => selectedSteps.length > 1 ? updateSelectedSteps({ manualFree: event.target.checked }) : onUpdate(selected.id, { manualFree: event.target.checked })} />自由</label>
          <label>最早开始<input type="number" value={Math.round(selected.startMin)} onChange={(event) => selectedSteps.length > 1 ? updateSelectedSteps({ startMin: Number(event.target.value) }) : onUpdate(selected.id, { startMin: Number(event.target.value) })} /></label>
          <label>最长持续<input type="number" value={Math.round(selected.durationMax)} onChange={(event) => selectedSteps.length > 1 ? updateSelectedSteps({ durationMax: Number(event.target.value) }) : onUpdate(selected.id, { durationMax: Number(event.target.value) })} /></label>
          <label>预热<input type="number" value={Math.round(selected.preheatMs ?? 0)} onChange={(event) => selectedSteps.length > 1 ? updateSelectedSteps({ preheatMs: Number(event.target.value) }) : onUpdate(selected.id, { preheatMs: Number(event.target.value) })} /></label>
          <label>后摇<input type="number" value={Math.round(selected.recoveryMs ?? 0)} onChange={(event) => selectedSteps.length > 1 ? updateSelectedSteps({ recoveryMs: Number(event.target.value) }) : onUpdate(selected.id, { recoveryMs: Number(event.target.value) })} /></label>
        </div>
      )}
    </div>
  );
}
function ComboContentEditor({ chart, style, onChange, onQuickInput }: { chart: ComboChart; style: ComboImageStyle; onChange: (patch: Partial<ComboImageStyle>) => void; onQuickInput: () => void }) {
  const items = chartToComboImageItems(chart, style);
  const total = Math.max(1000, ...chart.steps.map((step) => step.startMin + step.durationMax + 500));
  const pxPerMs = 0.16;
  const rows = CHARACTER_SLOTS.flatMap((slot) => ([
    { slot, lane: 'main' as LaneKind, id: `${slot}-main` },
    { slot, lane: 'independent' as LaneKind, id: `${slot}-independent` }
  ]));
  const setLabel = (stepId: string, value: string) => onChange({ contentLabels: { ...style.contentLabels, [stepId]: maybeConvertTextToIconLabel(value, style.convertIcons) } });
  return (
    <div className="combo-customizer-panel content-timeline-panel">
      <div className="combo-content-toolbar">
        <button onClick={onQuickInput}>快捷输入</button>
        <label className="checkline"><input type="checkbox" checked={style.convertIcons} onChange={(event) => onChange({ convertIcons: event.target.checked })} />图标转换</label>
        <span>点击块即可编辑连段图实际显示文字，底部浅色文字是默认招式名。</span>
      </div>
      <div className="content-timeline-scroll">
        <div className="content-timeline-ruler" style={{ width: Math.max(960, total * pxPerMs) }}>
          {Array.from({ length: Math.ceil(total / 1000) + 1 }, (_, index) => <span key={index} style={{ left: index * 1000 * pxPerMs }}>{index}s</span>)}
        </div>
        <div className="content-timeline-body" style={{ width: Math.max(960, total * pxPerMs) }}>
          {rows.map((row) => {
            const role = style.roleStyles[row.slot];
            return (
              <div key={row.id} className={`content-timeline-row role-${row.slot}`}>
                <div className="content-timeline-lane"><span style={avatarBackgroundStyle(role.avatar)}>{role.avatar ? null : row.slot}</span></div>
                <div className="content-timeline-track">
                  {items.filter((item) => (item.step.characterSlot ?? 1) === row.slot && item.step.lane === row.lane).map((item) => {
                    const width = Math.max(92, item.step.durationMax * pxPerMs);
                    const custom = style.contentLabels[item.step.id] ?? '';
                    return (
                      <label key={item.step.id} className={`content-timeline-block ${item.isSwitch ? 'is-switch' : ''}`} style={{ left: item.step.startMin * pxPerMs, width, '--move-color': role.color } as CSSProperties}>
                        <input value={custom} placeholder=" " onChange={(event) => onChange({ contentLabels: { ...style.contentLabels, [item.step.id]: event.target.value } })} onBlur={(event) => setLabel(item.step.id, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
                        <span>{item.step.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SimpleAppearanceEditor({ style, avatarPresets, onChange, onRoleChange, onPickAvatar, onPickCapsule, avatarInputRefs, capsuleInputRef }: { style: ComboImageStyle; avatarPresets: DefaultAvatarEntry[]; onChange: (patch: Partial<ComboImageStyle>) => void; onRoleChange: (slot: CharacterSlot, patch: Partial<ComboImageStyle['roleStyles'][CharacterSlot]>) => void; onPickAvatar: (slot: CharacterSlot, file: File | null) => void; onPickCapsule: (file: File | null) => void; avatarInputRefs: React.MutableRefObject<Record<number, HTMLInputElement | null>>; capsuleInputRef: React.MutableRefObject<HTMLInputElement | null> }) {
  const safeAvatarPresets = normalizeAvatarPresets(avatarPresets);
  const [avatarPickerSlot, setAvatarPickerSlot] = useState<CharacterSlot | null>(null);
  const [capsuleEditorOpen, setCapsuleEditorOpen] = useState(false);
  const [styleSettingsOpen, setStyleSettingsOpen] = useState(false);
  const activeRole = avatarPickerSlot ? style.roleStyles[avatarPickerSlot] : null;
  function applyAvatarPreset(slot: CharacterSlot, preset: DefaultAvatarEntry) {
    onRoleChange(slot, { name: preset.name, avatar: preset.src, avatarCrop: { x: 0, y: 0, w: 100, h: 100 } });
    setAvatarPickerSlot(null);
  }
  return (
    <div className="combo-appearance-editor rich-appearance-editor">
      <section className="appearance-section">
        <div className="appearance-section-head"><strong>角色</strong><span>头像、名称与角色色</span></div>
        <div className="role-list-editor compact-role-list">
          {CHARACTER_SLOTS.map((slot) => {
            const role = style.roleStyles[slot];
            return (
              <div key={slot} className="role-editor-card compact-role-card">
                <div className="role-editor-head role-editor-head-v2">
                  <div className="role-avatar-preview" style={avatarBackgroundStyle(role.avatar)}>{role.avatar ? null : slot}</div>
                  <input className="role-name-inline" value={role.name} onChange={(event) => onRoleChange(slot, { name: event.target.value })} onBlur={(event) => { const preset = safeAvatarPresets.find((item) => item.name === event.target.value.trim()); if (preset && !role.avatar) applyAvatarPreset(slot, preset); }} />
                  <button onClick={() => setAvatarPickerSlot(slot)}>设定</button>
                  <button onClick={() => avatarInputRefs.current[slot]?.click()}>导入</button>
                  <input type="color" value={role.color} onChange={(event) => onRoleChange(slot, { color: event.target.value })} />
                  <input ref={(node) => { avatarInputRefs.current[slot] = node; }} className="file-input" type="file" accept="image/*" onChange={(event) => onPickAvatar(slot, event.target.files?.[0] ?? null)} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="appearance-section block-style-section">
        <div className="appearance-section-head block-style-head"><div><strong>块样式</strong><span>胶囊、底图、宽度与滚动锚点</span></div><button className={`appearance-settings-trigger ${styleSettingsOpen ? 'active' : ''}`} title="块样式设置" onClick={() => setStyleSettingsOpen((open) => !open)}><Settings size={18} /></button></div>
        <div className="appearance-switch-row">
          <div className="segmented appearance-mode-tabs">
            <button className={style.blockMode === 'capsule' ? 'active' : ''} onClick={() => onChange({ blockMode: 'capsule' })}>胶囊</button>
            <button className={style.blockMode === 'image' ? 'active' : ''} onClick={() => onChange({ blockMode: 'image' })}>底图</button>
          </div>
          {style.blockMode === 'capsule' && <div className="segmented appearance-mode-tabs">
            <button className={style.capsuleShape === 'capsule' ? 'active' : ''} onClick={() => onChange({ capsuleShape: 'capsule' })}>胶囊型</button>
            <button className={style.capsuleShape === 'rect' ? 'active' : ''} onClick={() => onChange({ capsuleShape: 'rect' })}>矩形</button>
          </div>}
          <div className="segmented appearance-mode-tabs">
            <button className={style.capsuleWidthMode === 'auto' ? 'active' : ''} onClick={() => onChange({ capsuleWidthMode: 'auto' })}>跟随内容</button>
            <button className={style.capsuleWidthMode === 'fixed' ? 'active' : ''} onClick={() => onChange({ capsuleWidthMode: 'fixed' })}>固定宽度</button>
          </div>
          <div className="segmented appearance-mode-tabs">
            <button className={style.scrollAnchor === 'start' ? 'active' : ''} onClick={() => onChange({ scrollAnchor: 'start' })}>顶端</button>
            <button className={style.scrollAnchor === 'center' ? 'active' : ''} onClick={() => onChange({ scrollAnchor: 'center' })}>居中</button>
          </div>
          <label className="checkline"><input type="checkbox" checked={style.fadeEnabled} onChange={(event) => onChange({ fadeEnabled: event.target.checked })} />渐隐</label>
        </div>
        {styleSettingsOpen && <div className="appearance-settings-popover" onMouseDown={(event) => event.stopPropagation()}>
          <div className="appearance-settings-head"><strong>块样式设置</strong><button title="关闭" onClick={() => setStyleSettingsOpen(false)}>&times;</button></div>
          <div className="appearance-settings-group"><span>尺寸与排版</span><div className="appearance-grid stable-number-grid">
            <NumberDraftInput label="高度 px" value={style.capsuleHeight} onCommit={(value) => onChange({ capsuleHeight: value })} />
            <NumberDraftInput label="间距 px" value={style.capsuleGap} onCommit={(value) => onChange({ capsuleGap: value })} />
            {style.scrollAnchor === 'start' && <NumberDraftInput label="起始位置 px" value={style.scrollStartOffsetPx} min={-5000} onCommit={(value) => onChange({ scrollStartOffsetPx: value })} />}
            <NumberDraftInput label="字体 px" value={style.fontSize} onCommit={(value) => onChange({ fontSize: value })} />
            <label>字体<input value={style.fontFamily} onChange={(event) => onChange({ fontFamily: event.target.value })} placeholder="Microsoft YaHei, SimHei" /></label>
          </div></div>
          <div className="appearance-settings-group"><span>头像与显示</span><div className="appearance-grid stable-number-grid">
            <label className="checkline"><input type="checkbox" checked={style.prePromptEnabled} onChange={(event) => onChange({ prePromptEnabled: event.target.checked })} />预提示</label>
            <NumberDraftInput label="头像大小" value={style.avatarSize} min={16} onCommit={(value) => onChange({ avatarSize: value })} />
            <NumberDraftInput label="头像 X" value={style.avatarOffsetX} min={-300} onCommit={(value) => onChange({ avatarOffsetX: value })} />
            <NumberDraftInput label="头像 Y" value={style.avatarOffsetY} min={-300} onCommit={(value) => onChange({ avatarOffsetY: value })} />
            {style.fadeEnabled && <NumberDraftInput label="渐隐强度" value={style.fadeRange} onCommit={(value) => onChange({ fadeRange: value })} />}
            <label>文字颜色<input type="color" value={style.textColor} onChange={(event) => onChange({ textColor: event.target.value })} /></label>
          </div></div>
          {style.blockMode === 'image' && <div className="appearance-settings-group"><span>底图</span><div className="appearance-grid stable-number-grid">
            <NumberDraftInput label="底图缩放" value={Math.round(style.capsuleImageScale * 100)} onCommit={(value) => onChange({ capsuleImageScale: value / 100 })} />
            <button onClick={() => capsuleInputRef.current?.click()}>导入底图</button>
            <input ref={capsuleInputRef} className="file-input" type="file" accept="image/*" onChange={(event) => onPickCapsule(event.target.files?.[0] ?? null)} />
            <button onClick={() => setCapsuleEditorOpen((open) => !open)}>{capsuleEditorOpen ? '收起底图编辑' : '可视化裁剪/拉伸'}</button>
          </div></div>}
          {style.blockMode === 'image' && capsuleEditorOpen && <CapsuleImageVisualEditor style={style} onChange={onChange} />}
        </div>}
      </section>

      {avatarPickerSlot && <div className="preset-picker-backdrop" onMouseDown={() => setAvatarPickerSlot(null)}><div className="preset-picker-panel avatar-preset-panel" onMouseDown={(event) => event.stopPropagation()}><div className="preset-picker-head"><div><h3>头像设定</h3><p>点击预设即可填入角色名和头像，左上角加号用于导入本地头像。</p></div><button onClick={() => setAvatarPickerSlot(null)}>×</button></div><div className="preset-picker-grid avatar-preset-grid"><button className="preset-tile add-tile" onClick={() => avatarInputRefs.current[avatarPickerSlot]?.click()}><span>+</span><strong>{activeRole?.name || '导入头像'}</strong></button>{safeAvatarPresets.map((preset) => <button key={preset.src} className="preset-tile avatar-preset-tile" onClick={() => applyAvatarPreset(avatarPickerSlot, preset)}><img src={preset.src} alt="" /><strong>{preset.name}</strong></button>)}</div></div></div>}
    </div>
  );
}

function CapsuleImageVisualEditor({ style, onChange }: { style: ComboImageStyle; onChange: (patch: Partial<ComboImageStyle>) => void }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const crop = normalizeRectPercent(style.capsuleCrop, { x: 0, y: 0, w: 100, h: 100 });
  const stretch = style.capsuleStretch ?? { left: 25, right: 75 };
  const naturalWidth = Math.max(1, style.capsuleImageWidth || style.capsuleWidth || 200);
  const naturalHeight = Math.max(1, style.capsuleImageHeight || style.capsuleHeight || 80);
  const stageStyle = { aspectRatio: `${naturalWidth} / ${naturalHeight}` } as CSSProperties;
  const imageStyle = style.capsuleImage ? { backgroundImage: `url(${style.capsuleImage})` } : {};
  function stagePoint(event: PointerEvent | ReactPointerEvent<HTMLElement>) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * 100, 0, 100), y: clamp(((event.clientY - rect.top) / Math.max(1, rect.height)) * 100, 0, 100) };
  }
  function beginCropDrag(event: ReactPointerEvent<HTMLElement>, mode: 'move' | 'nw' | 'se') {
    event.preventDefault();
    event.stopPropagation();
    const start = stagePoint(event);
    const original = { ...crop };
    const onMove = (moveEvent: PointerEvent) => {
      const point = stagePoint(moveEvent);
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      if (mode === 'move') onChange({ capsuleCrop: normalizeRectPercent({ ...original, x: original.x + dx, y: original.y + dy }, original) });
      if (mode === 'nw') {
        const x = clamp(original.x + dx, 0, original.x + original.w - 5);
        const y = clamp(original.y + dy, 0, original.y + original.h - 5);
        onChange({ capsuleCrop: normalizeRectPercent({ x, y, w: original.x + original.w - x, h: original.y + original.h - y }, original) });
      }
      if (mode === 'se') onChange({ capsuleCrop: normalizeRectPercent({ ...original, w: original.w + dx, h: original.h + dy }, original) });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  function beginStretchDrag(event: ReactPointerEvent<HTMLElement>, side: 'left' | 'right') {
    event.preventDefault();
    event.stopPropagation();
    const onMove = (moveEvent: PointerEvent) => {
      const point = stagePoint(moveEvent);
      if (side === 'left') onChange({ capsuleStretch: { left: clamp(point.x, crop.x, Math.min(stretch.right - 1, crop.x + crop.w - 1)), right: stretch.right } });
      if (side === 'right') onChange({ capsuleStretch: { left: stretch.left, right: clamp(point.x, Math.max(stretch.left + 1, crop.x + 1), crop.x + crop.w) } });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  return (
    <div className="capsule-visual-editor">
      <p>拖动裁剪框选择底图范围；拖动两条蓝色竖线选择跟随内容时可拉伸的中段，两端保持固定。</p>
      <div ref={stageRef} className="capsule-visual-stage" style={stageStyle}>
        {style.capsuleImage && <div className="capsule-visual-image" style={imageStyle} />}
        <div className="capsule-crop-box" style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.w}%`, height: `${crop.h}%` }} onPointerDown={(event) => beginCropDrag(event, 'move')}>
          <span className="capsule-crop-handle nw" onPointerDown={(event) => beginCropDrag(event, 'nw')} />
          <span className="capsule-crop-handle se" onPointerDown={(event) => beginCropDrag(event, 'se')} />
        </div>
        <span className="capsule-stretch-line left" style={{ left: `${stretch.left}%` }} onPointerDown={(event) => beginStretchDrag(event, 'left')} />
        <span className="capsule-stretch-line right" style={{ left: `${stretch.right}%` }} onPointerDown={(event) => beginStretchDrag(event, 'right')} />
      </div>
      <div className="crop-dialog-actions">
        <NumberDraftInput label="裁剪 X%" value={Math.round(crop.x)} onCommit={(value) => onChange({ capsuleCrop: { ...crop, x: value } })} />
        <NumberDraftInput label="裁剪 Y%" value={Math.round(crop.y)} onCommit={(value) => onChange({ capsuleCrop: { ...crop, y: value } })} />
        <NumberDraftInput label="裁剪 W%" value={Math.round(crop.w)} onCommit={(value) => onChange({ capsuleCrop: { ...crop, w: value } })} />
        <NumberDraftInput label="裁剪 H%" value={Math.round(crop.h)} onCommit={(value) => onChange({ capsuleCrop: { ...crop, h: value } })} />
        <NumberDraftInput label="左线%" value={Math.round(stretch.left)} onCommit={(value) => onChange({ capsuleStretch: { ...stretch, left: value } })} />
        <NumberDraftInput label="右线%" value={Math.round(stretch.right)} onCommit={(value) => onChange({ capsuleStretch: { ...stretch, right: value } })} />
      </div>
    </div>
  );
}

function SettingsPanel({ moves, bindings, onMoveChange, onBindingChange }: { moves: MoveDefinition[]; bindings: KeyBinding[]; onMoveChange: (moveId: string, patch: Partial<MoveDefinition>) => void; onBindingChange: (moveId: string, value: string) => void }) {
  const [capturingMoveId, setCapturingMoveId] = useState<string | null>(null);

  useEffect(() => {
    if (!capturingMoveId) return;
    const finishCapture = (code: string) => {
      onBindingChange(capturingMoveId, code);
      setCapturingMoveId(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Backspace') {
        setCapturingMoveId(null);
        return;
      }
      finishCapture(event.code);
    };
    const handleMouseDown = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      finishCapture(normalizeDomMouseEvent(event, 'mousedown').code);
    };
    const preventContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('contextmenu', preventContextMenu, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('contextmenu', preventContextMenu, true);
    };
  }, [capturingMoveId, onBindingChange]);

  return (
    <section className="panel settings-panel">
      <div className="panel-title"><div><h2>键位与招式设置</h2><p>连段谱保存招式而不是固定键位；开始默认 F，结束默认 Esc。</p></div><Keyboard size={22} /></div>
      <div className="settings-table">
        <div className="settings-head"><span>招式</span><span>输入代码</span><span>设置</span><span>独立</span><span>推进练习</span></div>
        {moves.map((move) => {
          const binding = bindings.find((item) => item.moveId === move.id);
          const isCapturing = capturingMoveId === move.id;
          return (
            <div className={`settings-row ${isCapturing ? 'capturing' : ''}`} key={move.id}>
              <strong style={{ color: move.color }}>{move.label}</strong>
              <input value={isCapturing ? '请按下要设置的键位或鼠标键，退格取消' : binding?.inputs.map((input) => input.code).join(', ') ?? ''} readOnly={isCapturing} onChange={(event) => onBindingChange(move.id, event.target.value)} />
              <button className={`binding-capture-button ${isCapturing ? 'active' : ''}`} type="button" onClick={() => setCapturingMoveId(isCapturing ? null : move.id)}><Settings size={16} /><span>{isCapturing ? '设置中' : '设置'}</span></button>
              <label><input type="checkbox" checked={move.independent} onChange={(event) => onMoveChange(move.id, { independent: event.target.checked })} />独立</label>
              <label><input type="checkbox" checked={move.advancesStep} onChange={(event) => onMoveChange(move.id, { advancesStep: event.target.checked })} />推进</label>
            </div>
          );
        })}
      </div>
    </section>
  );
}



function PracticeErrorSummary({ chart, practice }: { chart: ComboChart; practice: PracticeSnapshot }) {
  const errorIds = new Set(practice.errorStepIds);
  if (!chart.steps.length || !practice.errorStepIds.length) return null;
  return (
    <div className="practice-error-summary">
      <strong>错位记录</strong>
      <div>{chart.steps.map((step, index) => <span key={step.id} className={errorIds.has(step.id) ? 'error' : ''} style={{ '--move-color': step.color } as CSSProperties}><b>{index + 1}</b>{step.label}<em>{(step.startMin / 1000).toFixed(2)}s</em></span>)}</div>
    </div>
  );
}
function LibraryPanel({ chart, library, onSelect, onEdit, onDelete, onExportCurrent, onExportLibrary, onImport }: { chart: ComboChart | null; library: ComboChart[]; onSelect: (id: string) => void; onEdit: (id: string) => void; onDelete: (id: string) => void; onExportCurrent: () => void; onExportLibrary: () => void; onImport: () => void }) {
  return (
    <div className="panel library-panel">
      <div className="panel-title"><div><h2>历史连段谱</h2><p>保存、导入和编辑后的连段谱会出现在这里。</p></div></div>
      <div className="library-actions"><button className="danger" onClick={() => chart && onEdit(chart.id)} disabled={!chart}>编辑</button><button onClick={onExportCurrent} disabled={!chart}><Download size={16} />导出当前</button><button onClick={onExportLibrary} disabled={!library.length}><Download size={16} />导出全部</button><button onClick={onImport}><Upload size={16} />导入 JSON</button><button className="danger" onClick={() => chart && onDelete(chart.id)} disabled={!chart || !library.some((item) => item.id === chart.id)}><Trash2 size={16} />删除</button></div>
      <div className="library-list">{library.length ? library.map((item) => <button key={item.id} className={`library-item ${chart?.id === item.id ? 'active' : ''}`} onClick={() => onSelect(item.id)}><strong>{item.title}</strong><span>{item.steps.length} 指令 · {new Date(item.updatedAt).toLocaleString()}</span></button>) : <EmptyState text="还没有历史连段谱。" />}</div>
    </div>
  );
}


function QuickInputDialog({ chart, style, initialValues, startStepId, onApply, onClose }: { chart: ComboChart; style: ComboImageStyle; initialValues: string[]; startStepId: string | null; onApply: (values: string[]) => void; onClose: () => void }) {
  const items = chartToComboImageItems(chart, style);
  const startIndex = Math.max(0, items.findIndex((item) => item.step.id === startStepId));
  const initial = items.map((item, index) => initialValues[index] ?? style.contentLabels[item.step.id] ?? item.displayText);
  const [values, setValues] = useState(initial);
  const [bulkText, setBulkText] = useState(initialValues.length ? initialValues.join(' ') : '');
  const [position, setPosition] = useState({ x: 360, y: 160 });
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);
  function focusInput(index: number) {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('.quick-input-grid input'));
    inputs[Math.max(0, Math.min(index, inputs.length - 1))]?.focus();
  }
  function fillFromBulk() {
    const parsed = parseQuickInputText(bulkText).map((part) => maybeConvertTextToIconLabel(part, style.convertIcons));
    setValues((current) => current.map((value, index) => index >= startIndex && parsed[index - startIndex] !== undefined ? parsed[index - startIndex] : value));
  }
  function applyAndClose() {
    onApply(values.map((value) => maybeConvertTextToIconLabel(value, style.convertIcons)));
    onClose();
  }
  function beginDrag(event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault();
    dragRef.current = { startX: event.clientX, startY: event.clientY, x: position.x, y: position.y };
    const onMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setPosition({ x: Math.max(8, drag.x + moveEvent.clientX - drag.startX), y: Math.max(8, drag.y + moveEvent.clientY - drag.startY) });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  return (
    <div className="quick-input-layer">
      <div className="quick-input-panel floating" style={{ left: position.x, top: position.y }}>
        <div className="quick-input-head" onPointerDown={beginDrag}><strong>快捷输入 · 从第 {startIndex + 1} 块开始</strong><div><button onPointerDown={(event) => event.stopPropagation()} onClick={fillFromBulk}>填入</button><button onPointerDown={(event) => event.stopPropagation()} onClick={onClose}>取消</button><button onPointerDown={(event) => event.stopPropagation()} className="primary" onClick={applyAndClose}>应用</button><button onPointerDown={(event) => event.stopPropagation()} onClick={onClose}>×</button></div></div>
        <textarea value={bulkText} onChange={(event) => setBulkText(event.target.value)} placeholder={style.convertIcons ? '可粘贴大量内容，空格或换行分隔。开启图标转换时，e/E/q/Q/r/R/a/A/j/J 等会转成对应图标。' : '可粘贴大量内容，空格或换行分隔。'} />
        <div className="quick-input-grid">
          {items.map((item, index) => <label key={item.step.id} className={item.isSwitch ? 'is-switch' : ''}><span>{index + 1}</span><input value={values[index] ?? ''} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === 'ArrowRight') { event.preventDefault(); focusInput(index + 1); } if (event.key === 'ArrowLeft') { event.preventDefault(); focusInput(index - 1); } }} onChange={(event) => setValues((current) => current.map((value, i) => i === index ? event.target.value : value))} /></label>)}
        </div>
      </div>
    </div>
  );
}
function NumberDraftInput({ label, value, onCommit, min = 0 }: { label: string; value: number; onCommit: (value: number) => void; min?: number }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function commit() {
    const next = Number(draft);
    if (Number.isFinite(next)) onCommit(Math.max(min, Math.round(next)));
    else setDraft(String(value));
  }
  return <label>{label}<input inputMode="numeric" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function mergeDebugRunIntoChart(chart: ComboChart, snapshot: RecordingSnapshot) {
  const usedUnitIds = new Set<string>();
  let matched = 0;
  let preheated = 0;
  let recovered = 0;
  let rejected = 0;
  const orderedSteps = [...chart.steps].sort((a, b) => a.startMin - b.startMin || a.id.localeCompare(b.id));
  const updatedById = new Map<string, ComboStep>();
  const recordingId = `debug_${Date.now()}`;
  orderedSteps.forEach((step, index) => {
    const match = findDebugMatch(step, snapshot.units, usedUnitIds, orderedSteps[index - 1], orderedSteps[index + 1]);
    if (!match) {
      rejected += 1;
      updatedById.set(step.id, step);
      return;
    }
    usedUnitIds.add(match.id);
    matched += 1;
    const nextPreheat = Math.max(step.preheatMs ?? 0, Math.max(0, step.startMin - match.startTime + 40));
    const nextDurationMax = Math.max(step.durationMax, Math.ceil(match.duration + 60));
    const observedEnd = match.startTime + match.duration;
    const expectedEnd = step.startMin + nextDurationMax;
    const nextRecovery = Math.max(step.recoveryMs ?? 0, Math.max(0, observedEnd - expectedEnd + 40));
    if (nextPreheat > (step.preheatMs ?? 0)) preheated += 1;
    if (nextRecovery > (step.recoveryMs ?? 0) || nextDurationMax > step.durationMax) recovered += 1;
    updatedById.set(step.id, normalizeStep({ ...step, durationMax: nextDurationMax + nextRecovery, preheatMs: nextPreheat, recoveryMs: nextRecovery, samples: [...(step.samples ?? []), { recordingId, startTime: match.startTime, duration: match.duration }] }));
  });
  const updated = chart.steps.map((step) => updatedById.get(step.id) ?? step);
  return { chart: normalizeChart({ ...chart, steps: updated }), matched, total: chart.steps.length, preheated, recovered, rejected };
}

function findDebugMatch(step: ComboStep, units: RecordedUnit[], usedUnitIds: Set<string>, previousStep?: ComboStep, nextStep?: ComboStep): RecordedUnit | null {
  const expected = (step.startMin + step.startMax) / 2;
  const maxDrift = debugMatchMaxDrift(step);
  const previousBoundary = previousStep ? (previousStep.startMin + step.startMin) / 2 : step.startMin - maxDrift;
  const nextBoundary = nextStep ? (step.startMin + nextStep.startMin) / 2 : step.startMin + maxDrift;
  const windowStart = Math.max(previousBoundary, expected - maxDrift);
  const windowEnd = Math.min(nextBoundary, expected + maxDrift);
  const candidates = units.filter((unit) => {
    if (usedUnitIds.has(unit.id)) return false;
    if (unit.moveId !== step.moveId) return false;
    if ((unit.characterSlot ?? 1) !== (step.characterSlot ?? 1) || unit.lane !== step.lane) return false;
    if (unit.startTime < windowStart || unit.startTime > windowEnd) return false;
    return unit.startTime + unit.duration <= step.startMin + step.durationMax + (step.recoveryMs ?? 0) + maxDrift;
  });
  if (!candidates.length) return null;
  return candidates.reduce((best, unit) => Math.abs(unit.startTime - expected) < Math.abs(best.startTime - expected) ? unit : best);
}

function debugMatchMaxDrift(step: ComboStep): number {
  const currentWindow = step.durationMax + (step.preheatMs ?? 0) + (step.recoveryMs ?? 0);
  return clamp(Math.max(900, currentWindow * 2 + 500), 900, 3500);
}

type ImportedComboPackage = { charts: ComboChart[]; contentLabels: Record<string, string>; moves: MoveDefinition[]; bindings: KeyBinding[] };

function createChartExportPackage(chart: ComboChart, contentLabels: Record<string, string>, moves: MoveDefinition[], bindings: KeyBinding[]) {
  const usedMoveIds = new Set(chart.steps.map((step) => step.moveId));
  return {
    type: 'wwcombo-chart',
    version: 2,
    chart,
    contentLabels: filterContentLabelsForChart(chart, contentLabels),
    moves: moves.filter((move) => usedMoveIds.has(move.id) || move.id === chart.startTriggerMoveId || move.id === (chart.stopTriggerMoveId ?? 'stop_recording')),
    bindings: bindings.filter((binding) => usedMoveIds.has(binding.moveId) || binding.moveId === chart.startTriggerMoveId || binding.moveId === (chart.stopTriggerMoveId ?? 'stop_recording'))
  };
}

function filterContentLabelsForCharts(charts: ComboChart[], contentLabels: Record<string, string>): Record<string, string> {
  return charts.reduce((next, chart) => ({ ...next, ...filterContentLabelsForChart(chart, contentLabels) }), {} as Record<string, string>);
}

function filterContentLabelsForChart(chart: ComboChart, contentLabels: Record<string, string>): Record<string, string> {
  const stepIds = new Set(chart.steps.map((step) => step.id));
  return Object.fromEntries(Object.entries(contentLabels).filter(([stepId, label]) => stepIds.has(stepId) && typeof label === 'string' && label.trim()));
}

function parseImportedComboPackage(value: unknown): ImportedComboPackage {
  const record = value as { chart?: ComboChart; charts?: ComboChart[]; contentLabels?: Record<string, string>; moves?: MoveDefinition[]; bindings?: KeyBinding[] };
  const candidates = Array.isArray(value) ? value : Array.isArray(record.charts) ? record.charts : record.chart ? [record.chart] : [value as ComboChart];
  const charts = candidates.filter(isReasonableChart).map((item) => normalizeChart({ ...item, id: item.id || crypto.randomUUID(), updatedAt: Date.now() }));
  const stepIds = new Set(charts.flatMap((chart) => chart.steps.map((step) => step.id)));
  const contentLabels = Object.fromEntries(Object.entries(record.contentLabels ?? {}).filter(([stepId, label]) => stepIds.has(stepId) && typeof label === 'string' && label.trim()));
  return {
    charts,
    contentLabels,
    moves: Array.isArray(record.moves) ? record.moves.filter(isReasonableMove) : [],
    bindings: Array.isArray(record.bindings) ? record.bindings.filter(isReasonableBinding) : []
  };
}

function isReasonableMove(move: MoveDefinition): move is MoveDefinition {
  return Boolean(move && typeof move.id === 'string' && typeof move.label === 'string' && typeof move.color === 'string');
}

function isReasonableBinding(binding: KeyBinding): binding is KeyBinding {
  return Boolean(binding && typeof binding.moveId === 'string' && Array.isArray(binding.inputs));
}

function mergeMoves(current: MoveDefinition[], imported: MoveDefinition[]): MoveDefinition[] {
  const map = new Map(current.map((move) => [move.id, move]));
  imported.forEach((move) => map.set(move.id, { ...map.get(move.id), ...move }));
  return [...map.values()];
}

function mergeBindings(current: KeyBinding[], imported: KeyBinding[]): KeyBinding[] {
  const map = new Map(current.map((binding) => [binding.moveId, binding]));
  imported.forEach((binding) => map.set(binding.moveId, binding));
  return [...map.values()];
}

function downloadJson(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'));
    reader.onerror = () => reject(reader.error ?? new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function readImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    image.onerror = () => reject(new Error('图片读取失败'));
    image.src = src;
  });
}

function safeFileName(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 48) || 'wwcombo';
}

function pointerTimeInTrack(event: { clientX: number; currentTarget: HTMLElement }, total: number): number {
  const track = event.currentTarget.closest('.timeline-editor-track') as HTMLElement | null;
  if (!track) return 0;
  const rect = track.getBoundingClientRect();
  return clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1) * total;
}
