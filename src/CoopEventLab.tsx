import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { Eye, EyeOff, Image as ImageIcon, Music2, Plus, Trash2, Upload } from 'lucide-react';
import type { CharacterSlot, ComboChart, ComboImageStyle, ComboStep, KeyBinding, MoveDefinition } from '../combo-core';
import { normalizeInputCode } from '../combo-core/input';

export type CoopInputSignal = {
  id: string;
  type: 'keydown' | 'keyup' | 'mousedown' | 'mouseup';
  code: string;
  time: number;
};

type LaneKind = 'main' | 'independent';
type CoopAction = 'play' | 'stop' | 'show' | 'hide';
type CoopMediaKind = 'audio' | 'image';
type CoopBinding = { id: string; eventId: string; action: CoopAction; delayMs: number };
type CoopBlock = ComboStep & { eventOnly: boolean; bindings: CoopBinding[] };
type CoopDraft = { id: string; title: string; sourceChartId?: string; timelineDurationMs?: number; blocks: CoopBlock[] };
type CoopImageTransform = { x: number; y: number; width: number; height: number; opacity: number; rotate: number };
type CoopMediaEvent = {
  id: string;
  name: string;
  kind: CoopMediaKind;
  src?: string;
  assetKey?: string;
  fileName?: string;
  durationMs: number;
  volume: number;
  start: CoopImageTransform;
  end: CoopImageTransform;
};
type ActiveVisual = { eventId: string; startedAt: number; durationMs: number };
type CoopLane = { slot: CharacterSlot; lane: LaneKind; id: string; label: string };
type CoopPressGuardState = { heldAtByCode: Map<string, number>; lastAcceptedAtByCode: Map<string, number> };
type ImageDragState = { eventId: string; point: 'start' | 'end'; mode: 'move' | 'resize'; edge?: string; startX: number; startY: number; base: CoopImageTransform; rect: DOMRect };

type Props = {
  sourceChart: ComboChart | null;
  library: ComboChart[];
  moves: MoveDefinition[];
  bindings: KeyBinding[];
  comboImageStyle: ComboImageStyle;
  inputSignal: CoopInputSignal | null;
};

type RuntimeProps = {
  active: boolean;
  inputSignal: CoopInputSignal | null;
  bindings: KeyBinding[];
  startedAt: number | null;
};

const STORAGE_KEY = 'ww-combo-trainer-coop-events-v1';
const COOP_AUDIO_DB_NAME = 'ww-combo-trainer-coop-audio-v1';
const COOP_AUDIO_STORE = 'audio-assets';
const COOP_STORAGE_SOFT_LIMIT = 4_200_000;
const COOP_DUPLICATE_PRESS_GUARD_MS = 90;
const COOP_HELD_INPUT_STALE_MS = 240;
const CHARACTER_SLOTS: CharacterSlot[] = [1, 2, 3];
const MIN_DURATION = 35;
const DEFAULT_ZOOM = 0.42;
const DEFAULT_IMAGE_START: CoopImageTransform = { x: 36, y: 34, width: 28, height: 24, opacity: 1, rotate: 0 };
const DEFAULT_IMAGE_END: CoopImageTransform = { x: 36, y: 34, width: 28, height: 24, opacity: 1, rotate: 0 };

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(min, Math.min(max, numberValue));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function normalizeTransform(value: Partial<CoopImageTransform> | undefined, fallback: CoopImageTransform): CoopImageTransform {
  return {
    x: clampNumber(value?.x, -100, 200, fallback.x),
    y: clampNumber(value?.y, -100, 200, fallback.y),
    width: clampNumber(value?.width, 2, 200, fallback.width),
    height: clampNumber(value?.height, 2, 200, fallback.height),
    opacity: clampNumber(value?.opacity, 0, 1, fallback.opacity),
    rotate: clampNumber(value?.rotate, -720, 720, fallback.rotate)
  };
}

function normalizeBinding(value: Partial<CoopBinding> | undefined): CoopBinding | null {
  if (!value?.eventId) return null;
  const action = value.action === 'stop' || value.action === 'show' || value.action === 'hide' ? value.action : 'play';
  return {
    id: value.id || crypto.randomUUID(),
    eventId: value.eventId,
    action,
    delayMs: Math.max(0, Math.round(clampNumber(value.delayMs, 0, 600_000, 0)))
  };
}

function normalizeEvent(value: Partial<CoopMediaEvent> | undefined, index = 1): CoopMediaEvent {
  const kind = value?.kind === 'image' ? 'image' : 'audio';
  return {
    id: value?.id || crypto.randomUUID(),
    name: typeof value?.name === 'string' && value.name.trim() ? value.name.trim() : `Event ${index}`,
    kind,
    src: typeof value?.src === 'string' ? value.src : undefined,
    assetKey: typeof value?.assetKey === 'string' ? value.assetKey : undefined,
    fileName: typeof value?.fileName === 'string' ? value.fileName : undefined,
    durationMs: Math.max(0, Math.round(clampNumber(value?.durationMs, 0, 600_000, kind === 'audio' ? 0 : 2500))),
    volume: clampNumber(value?.volume, 0, 1, 0.85),
    start: normalizeTransform(value?.start, DEFAULT_IMAGE_START),
    end: normalizeTransform(value?.end, DEFAULT_IMAGE_END)
  };
}

function normalizeBlock(value: Partial<CoopBlock>, fallbackMove?: MoveDefinition): CoopBlock {
  const startMin = Math.max(0, Math.round(clampNumber(value.startMin, 0, 600_000, 0)));
  const startMax = Math.max(startMin, Math.round(clampNumber(value.startMax, startMin, 600_000, startMin + 300)));
  const durationMax = Math.max(MIN_DURATION, Math.round(clampNumber(value.durationMax, MIN_DURATION, 600_000, Math.max(MIN_DURATION, startMax - startMin || 300))));
  const durationMin = Math.max(MIN_DURATION, Math.round(clampNumber(value.durationMin, MIN_DURATION, durationMax, Math.min(durationMax, value.durationMin ?? durationMax))));
  const lane = value.lane === 'independent' ? 'independent' : 'main';
  const slot = CHARACTER_SLOTS.includes(value.characterSlot as CharacterSlot) ? value.characterSlot as CharacterSlot : 1;
  return {
    id: value.id || crypto.randomUUID(),
    moveId: value.moveId || fallbackMove?.id || '__coop_event__',
    label: value.label || fallbackMove?.label || 'Event move',
    characterSlot: slot,
    lane,
    independent: lane === 'independent' || Boolean(value.independent ?? fallbackMove?.independent),
    startMin,
    startMax,
    durationMin,
    durationMax,
    preheatMs: Math.max(0, Math.round(clampNumber(value.preheatMs, 0, durationMax, 0))),
    recoveryMs: Math.max(0, Math.round(clampNumber(value.recoveryMs, 0, durationMax, 0))),
    manualFree: Boolean(value.manualFree),
    free: Boolean(value.free || value.manualFree),
    note: typeof value.note === 'string' && value.note.trim() ? value.note.trim() : undefined,
    color: value.color || fallbackMove?.color || '#d50000',
    advancesStep: Boolean(value.advancesStep ?? fallbackMove?.advancesStep),
    samples: Array.isArray(value.samples) ? value.samples : [],
    eventOnly: Boolean(value.eventOnly),
    bindings: Array.isArray(value.bindings) ? value.bindings.flatMap((binding) => normalizeBinding(binding) ?? []) : []
  };
}

function cloneChartAsDraft(chart: ComboChart): CoopDraft {
  return {
    id: crypto.randomUUID(),
    title: chart.title || 'Untitled combo',
    sourceChartId: chart.id,
    timelineDurationMs: chart.timelineDurationMs,
    blocks: chart.steps.map((step) => normalizeBlock({ ...step, eventOnly: false, bindings: [] }))
  };
}

function createDraftBlock(move: MoveDefinition, startMs: number, slot: CharacterSlot = 1, lane: LaneKind = 'main'): CoopBlock {
  const startMin = Math.max(0, Math.round(startMs));
  return normalizeBlock({
    id: crypto.randomUUID(),
    moveId: move.id,
    label: move.label,
    color: move.color,
    characterSlot: slot,
    lane,
    independent: lane === 'independent' || move.independent,
    advancesStep: move.advancesStep,
    startMin,
    startMax: startMin + 300,
    durationMin: 80,
    durationMax: 300,
    eventOnly: true,
    bindings: []
  }, move);
}

function displayMoveLabel(step: Pick<ComboStep, 'label' | 'moveId'>): string {
  return step.label || step.moveId;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

function openCoopAudioDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(COOP_AUDIO_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(COOP_AUDIO_STORE)) db.createObjectStore(COOP_AUDIO_STORE);
    };
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
  });
}

async function putCoopAudioAsset(key: string, dataUrl: string): Promise<boolean> {
  const db = await openCoopAudioDb();
  if (!db) return false;
  return new Promise((resolve) => {
    const tx = db.transaction(COOP_AUDIO_STORE, 'readwrite');
    tx.objectStore(COOP_AUDIO_STORE).put(dataUrl, key);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); resolve(false); };
  });
}

async function getCoopAudioAsset(key: string): Promise<string | undefined> {
  const db = await openCoopAudioDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const tx = db.transaction(COOP_AUDIO_STORE, 'readonly');
    const request = tx.objectStore(COOP_AUDIO_STORE).get(key);
    request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : undefined);
    request.onerror = () => resolve(undefined);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

function serializeCoopEventsForStorage(events: CoopMediaEvent[]): CoopMediaEvent[] {
  return events.map((event) => event.kind === 'audio' && event.assetKey ? { ...event, src: undefined } : event);
}

function parseImportedCharts(value: unknown): ComboChart[] {
  const record = value as { chart?: ComboChart; charts?: ComboChart[] } | null;
  const source = Array.isArray(value) ? value : Array.isArray(record?.charts) ? record.charts : record?.chart ? [record.chart] : [value as ComboChart];
  return source.filter((item): item is ComboChart => Boolean(item && typeof item === 'object' && Array.isArray((item as ComboChart).steps))).map((item) => ({
    ...item,
    id: item.id || crypto.randomUUID(),
    title: item.title || 'Imported combo',
    tags: Array.isArray(item.tags) ? item.tags : [],
    version: Number.isFinite(item.version) ? item.version : 1,
    createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
    updatedAt: Date.now(),
    startTriggerMoveId: item.startTriggerMoveId || 'start_challenge',
    steps: item.steps.map((step) => normalizeBlock(step))
  }));
}

function loadSavedState(): { draft: CoopDraft | null; events: CoopMediaEvent[]; zoom: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { draft: null, events: [], zoom: DEFAULT_ZOOM };
    const parsed = JSON.parse(raw) as { draft?: CoopDraft; events?: CoopMediaEvent[]; zoom?: number };
    const events = Array.isArray(parsed.events) ? parsed.events.map((event, index) => normalizeEvent(event, index + 1)) : [];
    const validEventIds = new Set(events.map((event) => event.id));
    const draft = parsed.draft && Array.isArray(parsed.draft.blocks) ? {
      id: parsed.draft.id || crypto.randomUUID(),
      title: parsed.draft.title || 'Coop event draft',
      sourceChartId: parsed.draft.sourceChartId,
      timelineDurationMs: parsed.draft.timelineDurationMs,
      blocks: parsed.draft.blocks.map((block) => normalizeBlock(block)).map((block) => ({ ...block, bindings: block.bindings.filter((binding) => validEventIds.has(binding.eventId)) }))
    } : null;
    return { draft, events, zoom: clampNumber(parsed.zoom, 0.08, 1.6, DEFAULT_ZOOM) };
  } catch {
    return { draft: null, events: [], zoom: DEFAULT_ZOOM };
  }
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function transformStyle(transform: CoopImageTransform): CSSProperties {
  return {
    left: `${transform.x}%`,
    top: `${transform.y}%`,
    width: `${transform.width}%`,
    height: `${transform.height}%`,
    opacity: transform.opacity,
    transform: `rotate(${transform.rotate}deg)`
  };
}

function stopCoopAudio(audio: HTMLAudioElement | null | undefined): void {
  if (!audio) return;
  audio.onended = null;
  audio.loop = false;
  audio.pause();
  try {
    audio.currentTime = 0;
  } catch {
    // Some backends reject seeking before metadata is ready.
  }
}

function restartCoopAudio(audio: HTMLAudioElement): void {
  try {
    audio.currentTime = 0;
  } catch {
    // Some backends reject seeking before metadata is ready.
  }
  void audio.play().catch(() => undefined);
}

function playCoopAudioForDuration(audio: HTMLAudioElement, eventId: string, durationMs: number, volume: number, tokens: Record<string, number>, schedule: (delayMs: number, run: () => void) => void): void {
  const playToken = (tokens[eventId] ?? 0) + 1;
  const stopAt = durationMs > 0 ? performance.now() + durationMs : Number.POSITIVE_INFINITY;
  tokens[eventId] = playToken;
  audio.volume = volume;
  audio.loop = false;
  audio.onended = durationMs > 0 ? () => {
    if (tokens[eventId] !== playToken) return;
    if (performance.now() < stopAt) restartCoopAudio(audio);
  } : null;
  restartCoopAudio(audio);
  if (durationMs <= 0) return;
  const keepAlive = () => {
    if (tokens[eventId] !== playToken) return;
    if (performance.now() >= stopAt) {
      tokens[eventId] = playToken + 1;
      stopCoopAudio(audio);
      return;
    }
    if (audio.paused || audio.ended) restartCoopAudio(audio);
    schedule(250, keepAlive);
  };
  schedule(250, keepAlive);
  schedule(durationMs, () => {
    if (tokens[eventId] !== playToken) return;
    tokens[eventId] = playToken + 1;
    stopCoopAudio(audio);
  });
}

function createMoveIdByCode(bindings: KeyBinding[]): Map<string, string> {
  const map = new Map<string, string>();
  bindings.forEach((binding) => binding.inputs.forEach((input) => map.set(normalizeInputCode(input.code), binding.moveId)));
  return map;
}

function eventBlocks(draft: CoopDraft | null): CoopBlock[] {
  return (draft?.blocks ?? []).filter((block) => block.eventOnly && block.bindings.length).sort((left, right) => left.startMin - right.startMin || left.id.localeCompare(right.id));
}

function isInputInsideBlockWindow(block: CoopBlock, elapsedMs: number): boolean {
  const start = Math.max(0, block.startMin);
  const end = block.startMin + Math.max(MIN_DURATION, block.durationMax);
  return elapsedMs >= start && elapsedMs <= end;
}

function blockWindowCenter(block: CoopBlock): number {
  return block.startMin + Math.max(MIN_DURATION, block.durationMax) / 2;
}

function pickActiveBlock(targets: CoopBlock[], elapsedMs: number): CoopBlock | null {
  const candidates = targets.filter((block) => isInputInsideBlockWindow(block, elapsedMs));
  if (!candidates.length) return null;
  return candidates.reduce((best, item) => Math.abs(blockWindowCenter(item) - elapsedMs) < Math.abs(blockWindowCenter(best) - elapsedMs) ? item : best);
}

function shouldAcceptCoopTriggerInput(input: CoopInputSignal, guard: CoopPressGuardState): boolean {
  const code = normalizeInputCode(input.code);
  const time = Number.isFinite(input.time) ? input.time : performance.now();
  if (input.type === 'keyup' || input.type === 'mouseup') {
    guard.heldAtByCode.delete(code);
    return false;
  }
  if (input.type !== 'keydown' && input.type !== 'mousedown') return false;
  const lastAcceptedAt = guard.lastAcceptedAtByCode.get(code);
  if (lastAcceptedAt !== undefined && Math.abs(time - lastAcceptedAt) <= COOP_DUPLICATE_PRESS_GUARD_MS) return false;
  guard.heldAtByCode.set(code, time);
  guard.lastAcceptedAtByCode.set(code, time);
  return true;
}

function resetStaleCoopHeldInputs(guard: CoopPressGuardState, now = performance.now()): void {
  for (const [code, heldAt] of guard.heldAtByCode) if (now - heldAt > COOP_HELD_INPUT_STALE_MS) guard.heldAtByCode.delete(code);
}

function CoopVisualOverlay({ events, activeVisuals, now }: { events: CoopMediaEvent[]; activeVisuals: Record<string, ActiveVisual>; now: number }) {
  const visuals = events.filter((event) => event.kind === 'image' && event.src && activeVisuals[event.id]);
  if (!visuals.length) return null;
  return createPortal(
    <div className="coop-runtime-layer" aria-hidden="true">
      {visuals.map((event) => <img key={event.id} src={event.src} alt="" className="coop-runtime-image" style={transformStyle(interpolateTransform(event, activeVisuals[event.id], now))} />)}
    </div>,
    document.body
  );
}

function interpolateTransform(event: CoopMediaEvent, active: ActiveVisual, now: number): CoopImageTransform {
  const progress = active.durationMs > 0 ? clampNumber((now - active.startedAt) / active.durationMs, 0, 1, 1) : 1;
  return {
    x: lerp(event.start.x, event.end.x, progress),
    y: lerp(event.start.y, event.end.y, progress),
    width: lerp(event.start.width, event.end.width, progress),
    height: lerp(event.start.height, event.end.height, progress),
    opacity: lerp(event.start.opacity, event.end.opacity, progress),
    rotate: lerp(event.start.rotate, event.end.rotate, progress)
  };
}

export function CoopEventRuntime({ active, inputSignal, bindings, startedAt }: RuntimeProps) {
  const saved = useMemo(loadSavedState, []);
  const [state, setState] = useState(saved);
  const stateRef = useRef(saved);
  const [activeVisuals, setActiveVisuals] = useState<Record<string, ActiveVisual>>({});
  const [now, setNow] = useState(() => performance.now());
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const audioPlayTokensRef = useRef<Record<string, number>>({});
  const timersRef = useRef<number[]>([]);
  const lastStorageLoadRef = useRef(0);
  const loadingAudioKeysRef = useRef(new Set<string>());
  const inputGuardRef = useRef<CoopPressGuardState>({ heldAtByCode: new Map(), lastAcceptedAtByCode: new Map() });
  const moveIdByCode = useMemo(() => createMoveIdByCode(bindings), [bindings]);

  useEffect(() => {
    if (!active) {
      setActiveVisuals({});
      inputGuardRef.current.heldAtByCode.clear();
      inputGuardRef.current.lastAcceptedAtByCode.clear();
      return;
    }
    const next = loadSavedState();
    lastStorageLoadRef.current = performance.now();
    stateRef.current = next;
    setState(next);
    inputGuardRef.current.heldAtByCode.clear();
    inputGuardRef.current.lastAcceptedAtByCode.clear();
  }, [active, startedAt]);

  useEffect(() => {
    state.events.filter((event) => event.kind === 'audio' && event.assetKey && !event.src && !loadingAudioKeysRef.current.has(event.assetKey)).forEach((event) => {
      const assetKey = event.assetKey as string;
      loadingAudioKeysRef.current.add(assetKey);
      void getCoopAudioAsset(assetKey).then((src) => {
        loadingAudioKeysRef.current.delete(assetKey);
        if (!src) return;
        setState((current) => {
          const next = { ...current, events: current.events.map((item) => item.id === event.id && !item.src ? { ...item, src } : item) };
          stateRef.current = next;
          return next;
        });
      });
    });
  }, [state.events]);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    Object.values(audioRefs.current).forEach(stopCoopAudio);
    audioPlayTokensRef.current = {};
  }, []);

  useEffect(() => {
    if (!Object.keys(activeVisuals).length) return;
    const timer = window.setInterval(() => setNow(performance.now()), 50);
    return () => window.clearInterval(timer);
  }, [activeVisuals]);

  function schedule(delayMs: number, run: () => void) {
    const timer = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((item) => item !== timer);
      run();
    }, Math.max(0, delayMs));
    timersRef.current.push(timer);
  }

  function triggerBinding(binding: CoopBinding) {
    const event = stateRef.current.events.find((item) => item.id === binding.eventId);
    if (!event) return;
    schedule(binding.delayMs, () => {
      const currentEvent = stateRef.current.events.find((item) => item.id === binding.eventId) ?? event;
      if (currentEvent.kind === 'audio' && (binding.action === 'stop' || binding.action === 'hide')) {
        audioPlayTokensRef.current[currentEvent.id] = (audioPlayTokensRef.current[currentEvent.id] ?? 0) + 1;
        stopCoopAudio(audioRefs.current[currentEvent.id]);
        return;
      }
      if (currentEvent.kind === 'audio' && !currentEvent.src && currentEvent.assetKey) {
        void getCoopAudioAsset(currentEvent.assetKey).then((src) => {
          if (!src) return;
          const next = { ...stateRef.current, events: stateRef.current.events.map((item) => item.id === currentEvent.id ? { ...item, src } : item) };
          stateRef.current = next;
          setState(next);
          triggerBinding(binding);
        });
        return;
      }
      if (currentEvent.kind === 'audio') {
        const audio = audioRefs.current[currentEvent.id] ?? (currentEvent.src ? new Audio(currentEvent.src) : null);
        if (!audio) return;
        audioRefs.current[currentEvent.id] = audio;
        playCoopAudioForDuration(audio, currentEvent.id, currentEvent.durationMs, currentEvent.volume, audioPlayTokensRef.current, schedule);
        return;
      }
      if (binding.action === 'hide' || binding.action === 'stop') {
        setActiveVisuals((current) => {
          const next = { ...current };
          delete next[currentEvent.id];
          return next;
        });
        return;
      }
      setActiveVisuals((current) => ({ ...current, [currentEvent.id]: { eventId: currentEvent.id, startedAt: performance.now(), durationMs: currentEvent.durationMs } }));
      if (currentEvent.durationMs > 0) schedule(currentEvent.durationMs, () => setActiveVisuals((current) => {
        const next = { ...current };
        delete next[currentEvent.id];
        return next;
      }));
    });
  }

  useEffect(() => {
    if (!active || !inputSignal || startedAt === null) return;
    resetStaleCoopHeldInputs(inputGuardRef.current, inputSignal.time);
    if (!shouldAcceptCoopTriggerInput(inputSignal, inputGuardRef.current)) return;
    let runtimeTargets = eventBlocks(stateRef.current.draft);
    if (performance.now() - lastStorageLoadRef.current > 1000 || !runtimeTargets.length) {
      const next = loadSavedState();
      stateRef.current = next;
      setState(next);
      lastStorageLoadRef.current = performance.now();
      runtimeTargets = eventBlocks(next.draft);
    }
    const moveId = moveIdByCode.get(normalizeInputCode(inputSignal.code));
    if (!moveId) return;
    const eventTime = Number.isFinite(inputSignal.time) ? inputSignal.time : performance.now();
    const elapsedMs = Math.max(0, eventTime - startedAt);
    const picked = pickActiveBlock(runtimeTargets.filter((block) => block.moveId === moveId), elapsedMs);
    if (!picked) return;
    picked.bindings.forEach((binding) => triggerBinding(binding));
  }, [active, inputSignal?.id, startedAt, moveIdByCode]);

  return <>
    <CoopVisualOverlay events={state.events} activeVisuals={activeVisuals} now={now} />
    <div className="coop-audio-bank">{state.events.filter((event) => event.kind === 'audio' && event.src).map((event) => <audio key={event.id} ref={(node) => { audioRefs.current[event.id] = node; }} src={event.src} />)}</div>
  </>;
}

function CoopEventStatus({ active, hasConfig }: { active: boolean; hasConfig: boolean }) {
  const title = hasConfig ? (active ? 'Coop event listening' : 'Coop event ready') : 'No coop event config';
  return <span className={`coop-runtime-status ${active ? 'active' : ''}`} title={title} aria-label={title}>{hasConfig ? (active ? 'Coop listening' : 'Coop ready') : 'Coop empty'}</span>;
}

export function CoopRuntimeStatusLabel({ active }: { active: boolean }) {
  const [hasConfig, setHasConfig] = useState(false);
  useEffect(() => {
    const refresh = () => {
      const saved = loadSavedState();
      setHasConfig(eventBlocks(saved.draft).length > 0 && saved.events.length > 0);
    };
    refresh();
    const timer = window.setInterval(refresh, 1500);
    return () => window.clearInterval(timer);
  }, []);
  return <CoopEventStatus active={active && hasConfig} hasConfig={hasConfig} />;
}

export function CoopEventLab({ sourceChart, library, moves, bindings, comboImageStyle, inputSignal }: Props) {
  const saved = useMemo(loadSavedState, []);
  const actionMoves = useMemo(() => moves.filter((move) => move.id !== 'start_challenge' && move.id !== 'stop_recording'), [moves]);
  const fallbackMove = actionMoves[0] ?? moves[0];
  const [draft, setDraft] = useState<CoopDraft | null>(saved.draft);
  const [events, setEvents] = useState<CoopMediaEvent[]>(saved.events);
  const [selectedBlockId, setSelectedBlockId] = useState(saved.draft?.blocks[0]?.id ?? '');
  const [selectedEventId, setSelectedEventId] = useState(saved.events[0]?.id ?? '');
  const [zoom, setZoom] = useState(saved.zoom);
  const [moveMode, setMoveMode] = useState(false);
  const [editPoint, setEditPoint] = useState<'start' | 'end'>('start');
  const [activeVisuals, setActiveVisuals] = useState<Record<string, ActiveVisual>>({});
  const [previewNow, setPreviewNow] = useState(() => performance.now());
  const [activity, setActivity] = useState('Waiting');
  const [runElapsedMs, setRunElapsedMs] = useState<number | null>(null);
  const [lastTriggeredBlockId, setLastTriggeredBlockId] = useState('');
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const audioPlayTokensRef = useRef<Record<string, number>>({});
  const timersRef = useRef<number[]>([]);
  const loadingAudioKeysRef = useRef(new Set<string>());
  const inputGuardRef = useRef<CoopPressGuardState>({ heldAtByCode: new Map(), lastAcceptedAtByCode: new Map() });
  const runRef = useRef<{ startedAt: number | null }>({ startedAt: null });
  const imageDragRef = useRef<ImageDragState | null>(null);

  const selectedBlock = draft?.blocks.find((block) => block.id === selectedBlockId) ?? draft?.blocks[0] ?? null;
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0] ?? null;
  const eventIndexById = useMemo(() => new Map(events.map((event, index) => [event.id, index + 1])), [events]);
  const moveById = useMemo(() => new Map(moves.map((move) => [move.id, move])), [moves]);
  const moveIdByCode = useMemo(() => createMoveIdByCode(bindings), [bindings]);
  const total = useMemo(() => Math.max(3000, draft?.timelineDurationMs ?? 0, ...(draft?.blocks.map((block) => block.startMin + block.durationMax + 600) ?? [0])), [draft]);
  const trackWidth = Math.max(780, Math.ceil(total * zoom));
  const lanes = useMemo<CoopLane[]>(() => CHARACTER_SLOTS.flatMap((slot) => [
    { slot, lane: 'main' as const, id: `${slot}:main`, label: comboImageStyle.roleStyles[slot]?.name || `Role ${slot}` },
    { slot, lane: 'independent' as const, id: `${slot}:independent`, label: `${comboImageStyle.roleStyles[slot]?.name || `Role ${slot}`} extra` }
  ]), [comboImageStyle.roleStyles]);

  useEffect(() => {
    const payload = JSON.stringify({ draft, events: serializeCoopEventsForStorage(events), zoom });
    if (payload.length < COOP_STORAGE_SOFT_LIMIT) localStorage.setItem(STORAGE_KEY, payload);
  }, [draft, events, zoom]);

  useEffect(() => {
    events.filter((event) => event.kind === 'audio' && event.assetKey && !event.src && !loadingAudioKeysRef.current.has(event.assetKey)).forEach((event) => {
      const assetKey = event.assetKey as string;
      loadingAudioKeysRef.current.add(assetKey);
      void getCoopAudioAsset(assetKey).then((src) => {
        loadingAudioKeysRef.current.delete(assetKey);
        if (!src) return;
        setEvents((current) => current.map((item) => item.id === event.id && !item.src ? { ...item, src } : item));
      });
    });
  }, [events]);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    Object.values(audioRefs.current).forEach(stopCoopAudio);
    audioPlayTokensRef.current = {};
  }, []);

  useEffect(() => {
    if (!Object.keys(activeVisuals).length) return;
    const timer = window.setInterval(() => setPreviewNow(performance.now()), 50);
    return () => window.clearInterval(timer);
  }, [activeVisuals]);

  useEffect(() => {
    if (!inputSignal) return;
    resetStaleCoopHeldInputs(inputGuardRef.current, inputSignal.time);
    if (!shouldAcceptCoopTriggerInput(inputSignal, inputGuardRef.current)) return;
    const moveId = moveIdByCode.get(normalizeInputCode(inputSignal.code));
    if (!moveId || !draft) return;
    const targets = draft.blocks.filter((block) => block.eventOnly && block.moveId === moveId && block.bindings.length).sort((left, right) => left.startMin - right.startMin || left.id.localeCompare(right.id));
    if (!targets.length) return;
    const eventTime = Number.isFinite(inputSignal.time) ? inputSignal.time : performance.now();
    const picked = pickTriggeredBlock(targets, eventTime);
    if (!picked) {
      const elapsed = runRef.current.startedAt === null ? null : Math.max(0, eventTime - runRef.current.startedAt);
      setRunElapsedMs(elapsed);
      setActivity(`${displayMoveLabel(targets[0])} not in event block${elapsed === null ? '' : ` at ${formatSeconds(elapsed)}`}`);
      return;
    }
    setRunElapsedMs(picked.elapsedMs);
    setLastTriggeredBlockId(picked.block.id);
    setSelectedBlockId(picked.block.id);
    setActivity(`${displayMoveLabel(picked.block)} @ ${formatSeconds(picked.elapsedMs)} triggered ${picked.block.bindings.length}`);
    picked.block.bindings.forEach((binding) => triggerBinding(binding));
  }, [inputSignal?.id]);

  function pickTriggeredBlock(targets: CoopBlock[], eventTime: number): { block: CoopBlock; elapsedMs: number } | null {
    if (runRef.current.startedAt !== null && eventTime - runRef.current.startedAt > total + 1500) runRef.current.startedAt = null;
    if (runRef.current.startedAt === null) {
      const block = targets[0];
      runRef.current.startedAt = eventTime - block.startMin;
      return { block, elapsedMs: block.startMin };
    }
    const elapsedMs = Math.max(0, eventTime - runRef.current.startedAt);
    const block = pickActiveBlock(targets, elapsedMs);
    return block ? { block, elapsedMs } : null;
  }

  function resetCoopRun() {
    runRef.current.startedAt = null;
    inputGuardRef.current.heldAtByCode.clear();
    inputGuardRef.current.lastAcceptedAtByCode.clear();
    setRunElapsedMs(null);
    setLastTriggeredBlockId('');
    setActivity('Reset');
  }

  function schedule(delayMs: number, run: () => void) {
    const timer = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((item) => item !== timer);
      run();
    }, Math.max(0, delayMs));
    timersRef.current.push(timer);
  }

  function triggerBinding(binding: CoopBinding) {
    const event = events.find((item) => item.id === binding.eventId);
    if (!event) return;
    schedule(binding.delayMs, () => {
      if (event.kind === 'audio' && (binding.action === 'stop' || binding.action === 'hide')) {
        audioPlayTokensRef.current[event.id] = (audioPlayTokensRef.current[event.id] ?? 0) + 1;
        stopCoopAudio(audioRefs.current[event.id]);
        setActivity(`Stop audio: ${event.name}`);
        return;
      }
      if (event.kind === 'audio' && !event.src && event.assetKey) {
        void getCoopAudioAsset(event.assetKey).then((src) => {
          if (!src) return;
          setEvents((current) => current.map((item) => item.id === event.id ? { ...item, src } : item));
          const audio = audioRefs.current[event.id] ?? new Audio(src);
          audioRefs.current[event.id] = audio;
          playCoopAudioForDuration(audio, event.id, event.durationMs, event.volume, audioPlayTokensRef.current, schedule);
        });
        return;
      }
      if (event.kind === 'audio') {
        const audio = audioRefs.current[event.id] ?? (event.src ? new Audio(event.src) : null);
        if (!audio) return;
        audioRefs.current[event.id] = audio;
        playCoopAudioForDuration(audio, event.id, event.durationMs, event.volume, audioPlayTokensRef.current, schedule);
        setActivity(`Play audio: ${event.name}`);
        return;
      }
      if (binding.action === 'hide' || binding.action === 'stop') {
        setActiveVisuals((current) => {
          const next = { ...current };
          delete next[event.id];
          return next;
        });
        setActivity(`Hide image: ${event.name}`);
        return;
      }
      setActiveVisuals((current) => ({ ...current, [event.id]: { eventId: event.id, startedAt: performance.now(), durationMs: event.durationMs } }));
      if (event.durationMs > 0) schedule(event.durationMs, () => setActiveVisuals((current) => {
        const next = { ...current };
        delete next[event.id];
        return next;
      }));
      setActivity(`Show image: ${event.name}`);
    });
  }

  function loadChart(chart: ComboChart | null) {
    if (!chart) return;
    const next = cloneChartAsDraft(chart);
    setDraft(next);
    setSelectedBlockId(next.blocks[0]?.id ?? '');
    resetCoopRun();
    setActivity(`Loaded: ${next.title}`);
  }

  async function importChartFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    const charts = parseImportedCharts(JSON.parse(text));
    if (charts.length) loadChart(charts[0]);
  }

  function updateDraftBlocks(updater: (blocks: CoopBlock[]) => CoopBlock[]) {
    setDraft((current) => current ? { ...current, blocks: updater(current.blocks), timelineDurationMs: Math.max(current.timelineDurationMs ?? 0, total) } : current);
  }

  function updateBlock(blockId: string, patch: Partial<CoopBlock>) {
    updateDraftBlocks((blocks) => blocks.map((block) => block.id === blockId ? normalizeBlock({ ...block, ...patch }, moveById.get(patch.moveId ?? block.moveId)) : block));
  }

  function deleteBlock(blockId: string) {
    updateDraftBlocks((blocks) => blocks.filter((block) => block.id !== blockId));
    setSelectedBlockId((current) => current === blockId ? '' : current);
  }

  function createEvent(kind: CoopMediaKind) {
    const next = normalizeEvent({ kind, name: kind === 'audio' ? `Audio event ${events.length + 1}` : `Image event ${events.length + 1}` }, events.length + 1);
    setEvents((current) => [...current, next]);
    setSelectedEventId(next.id);
  }

  function updateEvent(eventId: string, patch: Partial<CoopMediaEvent>) {
    setEvents((current) => current.map((event, index) => event.id === eventId ? normalizeEvent({ ...event, ...patch }, index + 1) : event));
  }

  function deleteEvent(eventId: string) {
    setEvents((current) => current.filter((event) => event.id !== eventId));
    setDraft((current) => current ? { ...current, blocks: current.blocks.map((block) => ({ ...block, bindings: block.bindings.filter((binding) => binding.eventId !== eventId) })) } : current);
    setSelectedEventId((current) => current === eventId ? events.find((event) => event.id !== eventId)?.id ?? '' : current);
  }

  async function pickEventFile(eventId: string, file: File | null) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    const event = events.find((item) => item.id === eventId);
    if (event?.kind === 'audio') {
      const assetKey = event.assetKey || `audio:${eventId}:${crypto.randomUUID()}`;
      const saved = await putCoopAudioAsset(assetKey, dataUrl);
      updateEvent(eventId, { src: saved ? undefined : dataUrl, assetKey: saved ? assetKey : undefined, fileName: file.name });
      return;
    }
    updateEvent(eventId, { src: dataUrl, assetKey: undefined, fileName: file.name });
  }

  function addBlock() {
    if (!draft || !fallbackMove) return;
    const lastEnd = Math.max(0, ...draft.blocks.map((block) => block.startMin + block.durationMax));
    const block = createDraftBlock(fallbackMove, lastEnd + 300);
    setDraft({ ...draft, blocks: [...draft.blocks, block], timelineDurationMs: Math.max(draft.timelineDurationMs ?? 0, lastEnd + 1200) });
    setSelectedBlockId(block.id);
  }

  function addBindingToSelected() {
    if (!selectedBlock || !selectedEvent) return;
    const action: CoopAction = selectedEvent.kind === 'audio' ? 'play' : 'show';
    const nextBinding: CoopBinding = { id: crypto.randomUUID(), eventId: selectedEvent.id, action, delayMs: 0 };
    updateBlock(selectedBlock.id, { eventOnly: true, bindings: [...selectedBlock.bindings, nextBinding] });
  }

  function updateBinding(blockId: string, bindingId: string, patch: Partial<CoopBinding>) {
    updateDraftBlocks((blocks) => blocks.map((block) => block.id === blockId ? {
      ...block,
      bindings: block.bindings.map((binding) => binding.id === bindingId ? { ...binding, ...patch, delayMs: Math.max(0, Math.round(patch.delayMs ?? binding.delayMs)) } : binding)
    } : block));
  }

  function removeBinding(blockId: string, bindingId: string) {
    updateDraftBlocks((blocks) => blocks.map((block) => block.id === blockId ? { ...block, bindings: block.bindings.filter((binding) => binding.id !== bindingId) } : block));
  }

  function pointerTime(event: ReactPointerEvent<HTMLElement>): number {
    const rect = event.currentTarget.closest('.coop-timeline-track')?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    return clampNumber(((event.clientX - rect.left) / Math.max(1, rect.width)) * total, 0, total, 0);
  }

  function beginBlockDrag(event: ReactPointerEvent<HTMLElement>, blockId: string, mode: 'move' | 'start' | 'end') {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const block = draft?.blocks.find((item) => item.id === blockId);
    if (!block) return;
    const startPointerMs = pointerTime(event);
    const original = { ...block };
    const track = event.currentTarget.closest('.coop-timeline-track') as HTMLElement | null;
    const move = (pointerEvent: PointerEvent) => {
      const rect = track?.getBoundingClientRect();
      if (!rect) return;
      const currentMs = clampNumber(((pointerEvent.clientX - rect.left) / Math.max(1, rect.width)) * total, 0, total, startPointerMs);
      const delta = currentMs - startPointerMs;
      if (mode === 'move') {
        const startMin = Math.max(0, Math.round(original.startMin + delta));
        updateBlock(blockId, { startMin, startMax: startMin + Math.max(MIN_DURATION, original.startMax - original.startMin) });
      } else if (mode === 'start') {
        const originalEnd = original.startMin + original.durationMax;
        const startMin = Math.round(clampNumber(original.startMin + delta, 0, originalEnd - MIN_DURATION, original.startMin));
        updateBlock(blockId, { startMin, startMax: Math.max(startMin, original.startMax), durationMax: Math.max(MIN_DURATION, originalEnd - startMin) });
      } else {
        updateBlock(blockId, { durationMax: Math.round(clampNumber(original.durationMax + delta, MIN_DURATION, total - original.startMin, original.durationMax)) });
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function updateImageTransform(eventId: string, point: 'start' | 'end', patch: Partial<CoopImageTransform>) {
    setEvents((current) => current.map((event) => event.id === eventId ? normalizeEvent({ ...event, [point]: { ...event[point], ...patch } }, current.indexOf(event) + 1) : event));
  }

  function beginImageDrag(event: ReactPointerEvent<HTMLElement>, eventId: string, point: 'start' | 'end', mode: 'move' | 'resize', edge?: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const mediaEvent = events.find((item) => item.id === eventId);
    const rect = event.currentTarget.closest('.coop-preview-stage')?.getBoundingClientRect();
    if (!mediaEvent || !rect) return;
    imageDragRef.current = { eventId, point, mode, edge, startX: event.clientX, startY: event.clientY, base: { ...mediaEvent[point] }, rect };
    const move = (pointerEvent: PointerEvent) => {
      const drag = imageDragRef.current;
      if (!drag) return;
      const dx = ((pointerEvent.clientX - drag.startX) / Math.max(1, drag.rect.width)) * 100;
      const dy = ((pointerEvent.clientY - drag.startY) / Math.max(1, drag.rect.height)) * 100;
      const next = { ...drag.base };
      if (drag.mode === 'move') {
        next.x = drag.base.x + dx;
        next.y = drag.base.y + dy;
      } else {
        if (drag.edge?.includes('e')) next.width = drag.base.width + dx;
        if (drag.edge?.includes('s')) next.height = drag.base.height + dy;
        if (drag.edge?.includes('w')) { next.x = drag.base.x + dx; next.width = drag.base.width - dx; }
        if (drag.edge?.includes('n')) { next.y = drag.base.y + dy; next.height = drag.base.height - dy; }
      }
      updateImageTransform(drag.eventId, drag.point, next);
    };
    const up = () => {
      imageDragRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return <div className="coop-lab">
    <section className="panel coop-main-panel">
      <div className="coop-toolbar">
        <button onClick={() => loadChart(sourceChart)} disabled={!sourceChart}>Read current combo</button>
        <select value="" onChange={(event) => { const chart = library.find((item) => item.id === event.target.value); if (chart) loadChart(chart); }}>
          <option value="">History combo...</option>
          {library.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <button onClick={() => importInputRef.current?.click()}><Upload size={16} /> Import</button>
        <input ref={importInputRef} className="file-input" type="file" accept="application/json,.json" onChange={(event) => void importChartFile(event.target.files?.[0] ?? null)} />
      </div>

      <div className="coop-meta-row">
        <Metric label="Draft" value={draft?.title ?? 'None'} />
        <Metric label="Blocks" value={`${draft?.blocks.length ?? 0}`} />
        <Metric label="Event blocks" value={`${draft?.blocks.filter((block) => block.eventOnly).length ?? 0}`} />
        <Metric label="Elapsed" value={runElapsedMs === null ? '-' : formatSeconds(runElapsedMs)} />
      </div>

      {draft ? <>
        <div className="coop-timeline-toolbar">
          <button onClick={addBlock}><Plus size={16} /> Add command</button>
          <button onClick={addBindingToSelected} disabled={!selectedBlock || !selectedEvent}>Bind selected event</button>
          <button onClick={resetCoopRun}>Reset trigger</button>
          <label>Zoom <input type="range" min="0.08" max="1.6" step="0.02" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
          <span>{activity}</span>
        </div>
        <div className="coop-timeline-scroll">
          <div className="coop-timeline-ruler" style={{ width: trackWidth }}>{Array.from({ length: Math.ceil(total / 1000) + 1 }, (_, index) => <span key={index} style={{ left: `${(index * 1000 / total) * 100}%` }}>{index}s</span>)}</div>
          <div className="coop-timeline-body" style={{ '--coop-track-width': `${trackWidth}px` } as CSSProperties}>
            {lanes.map((lane) => {
              const laneBlocks = draft.blocks.filter((block) => (block.characterSlot ?? 1) === lane.slot && (block.lane ?? 'main') === lane.lane);
              return <div key={lane.id} className="coop-timeline-row">
                <div className="coop-timeline-lane"><b>{lane.label}</b></div>
                <div className="coop-timeline-track">
                  {laneBlocks.map((block) => <div key={block.id} className={`coop-timeline-block ${block.eventOnly ? 'event-only' : ''} ${selectedBlock?.id === block.id ? 'selected' : ''} ${lastTriggeredBlockId === block.id ? 'triggered' : ''}`} style={{ left: `${(block.startMin / total) * 100}%`, width: `${Math.max(0.3, (block.durationMax / total) * 100)}%`, '--move-color': block.color } as CSSProperties} onPointerDown={(event) => beginBlockDrag(event, block.id, 'move')} onClick={() => setSelectedBlockId(block.id)}>
                    <span className="resize-handle left" onPointerDown={(event) => beginBlockDrag(event, block.id, 'start')} />
                    <strong>{displayMoveLabel(block)}</strong>
                    {block.eventOnly && <em>event</em>}
                    {block.bindings.length > 0 && <span className="coop-event-badge">{block.bindings.map((binding) => eventIndexById.get(binding.eventId)).filter(Boolean).join(',')}</span>}
                    <span className="resize-handle right" onPointerDown={(event) => beginBlockDrag(event, block.id, 'end')} />
                  </div>)}
                </div>
              </div>;
            })}
          </div>
        </div>

        {selectedBlock && <div className="coop-inspector">
          <label>Move <select value={selectedBlock.moveId} onChange={(event) => { const move = moveById.get(event.target.value); if (move) updateBlock(selectedBlock.id, { moveId: move.id, label: move.label, color: move.color, advancesStep: move.advancesStep, independent: selectedBlock.lane === 'independent' || move.independent, eventOnly: true }); }}>{actionMoves.map((move) => <option key={move.id} value={move.id}>{move.label}</option>)}</select></label>
          <label>Role <select value={selectedBlock.characterSlot ?? 1} onChange={(event) => updateBlock(selectedBlock.id, { characterSlot: Number(event.target.value) as CharacterSlot })}>{CHARACTER_SLOTS.map((slot) => <option key={slot} value={slot}>{slot}</option>)}</select></label>
          <label>Lane <select value={selectedBlock.lane} onChange={(event) => updateBlock(selectedBlock.id, { lane: event.target.value as LaneKind, independent: event.target.value === 'independent' })}><option value="main">main</option><option value="independent">extra</option></select></label>
          <label>Start <input type="number" value={Math.round(selectedBlock.startMin)} onChange={(event) => updateBlock(selectedBlock.id, { startMin: Number(event.target.value), startMax: Number(event.target.value) + Math.max(MIN_DURATION, selectedBlock.startMax - selectedBlock.startMin) })} /></label>
          <label>Duration <input type="number" value={Math.round(selectedBlock.durationMax)} onChange={(event) => updateBlock(selectedBlock.id, { durationMax: Number(event.target.value) })} /></label>
          <label><input type="checkbox" checked={selectedBlock.eventOnly} onChange={(event) => updateBlock(selectedBlock.id, { eventOnly: event.target.checked })} />Event block</label>
          <button className="danger" onClick={() => deleteBlock(selectedBlock.id)}><Trash2 size={16} /> Delete</button>
        </div>}

        {selectedBlock && <div className="coop-binding-list">
          {selectedBlock.bindings.length ? selectedBlock.bindings.map((binding) => <div key={binding.id} className="coop-binding-row">
            <select value={binding.eventId} onChange={(event) => updateBinding(selectedBlock.id, binding.id, { eventId: event.target.value })}>{events.map((event, index) => <option key={event.id} value={event.id}>{index + 1}. {event.name}</option>)}</select>
            <select value={binding.action} onChange={(event) => updateBinding(selectedBlock.id, binding.id, { action: event.target.value as CoopAction })}><option value="play">play</option><option value="stop">stop</option><option value="show">show</option><option value="hide">hide</option></select>
            <label>Delay <input type="number" value={binding.delayMs} onChange={(event) => updateBinding(selectedBlock.id, binding.id, { delayMs: Number(event.target.value) })} /></label>
            <button className="icon-button" onClick={() => removeBinding(selectedBlock.id, binding.id)}><Trash2 size={16} /></button>
          </div>) : <EmptyState text="No bindings for selected block." />}
        </div>}
      </> : <div className="coop-empty"><strong>Read a combo first</strong><span>Use current combo, history combo, or import JSON.</span></div>}
    </section>

    <aside className="coop-side">
      <section className="panel coop-panel">
        <div className="panel-title"><div><h2>Event Library</h2><p>One event can be bound by multiple blocks.</p></div></div>
        <div className="coop-event-actions"><button onClick={() => createEvent('audio')}><Music2 size={16} />Audio</button><button onClick={() => createEvent('image')}><ImageIcon size={16} />Image</button></div>
        <div className="coop-event-grid">
          {events.map((event, index) => <div key={event.id} className={`coop-event-card ${selectedEvent?.id === event.id ? 'active' : ''}`} onClick={() => setSelectedEventId(event.id)}>
            <span className="coop-event-index">{index + 1}</span>
            <strong>{event.name}</strong>
            <small>{event.kind} / {event.fileName || 'no file'}</small>
          </div>)}
        </div>
      </section>

      {selectedEvent && <section className="panel coop-panel coop-event-editor">
        <div className="panel-title"><div><h2>Event Settings</h2><p>{selectedEvent.kind === 'audio' ? 'Play or stop audio.' : 'Show, hide, or move image.'}</p></div><button className="icon-button danger" onClick={() => deleteEvent(selectedEvent.id)}><Trash2 size={16} /></button></div>
        <div className="coop-event-form">
          <label>Name<input value={selectedEvent.name} onChange={(event) => updateEvent(selectedEvent.id, { name: event.target.value })} /></label>
          <label>Duration(ms)<input type="number" value={selectedEvent.durationMs} onChange={(event) => updateEvent(selectedEvent.id, { durationMs: Number(event.target.value) })} /></label>
          {selectedEvent.kind === 'audio' && <label>Volume<input type="range" min="0" max="1" step="0.01" value={selectedEvent.volume} onChange={(event) => updateEvent(selectedEvent.id, { volume: Number(event.target.value) })} /></label>}
          <label className="coop-file-picker"><Upload size={16} />Upload<input type="file" accept={selectedEvent.kind === 'audio' ? 'audio/*' : 'image/*'} onChange={(event) => void pickEventFile(selectedEvent.id, event.target.files?.[0] ?? null)} /></label>
        </div>
        {selectedEvent.kind === 'audio' && <div className="coop-move-toolbar"><button onClick={() => triggerBinding({ id: 'preview', eventId: selectedEvent.id, action: 'play', delayMs: 0 })}>Preview</button><button onClick={() => triggerBinding({ id: 'preview-stop', eventId: selectedEvent.id, action: 'stop', delayMs: 0 })}>Stop</button></div>}
        {selectedEvent.kind === 'image' && <>
          <div className="coop-move-toolbar"><button className={moveMode ? 'active' : ''} onClick={() => setMoveMode((current) => !current)}>{moveMode ? <EyeOff size={16} /> : <Eye size={16} />}Move</button><div className="segmented"><button className={editPoint === 'start' ? 'active' : ''} onClick={() => setEditPoint('start')}>Start</button><button className={editPoint === 'end' ? 'active' : ''} onClick={() => setEditPoint('end')}>End</button></div><button onClick={() => triggerBinding({ id: 'preview', eventId: selectedEvent.id, action: 'show', delayMs: 0 })}>Preview</button></div>
          <div className="coop-transform-grid">
            {Object.entries(editPoint === 'start' ? selectedEvent.start : selectedEvent.end).map(([key, value]) => <label key={key}>{key}<input type="number" step={key === 'opacity' ? '0.05' : '1'} value={Math.round(Number(value) * (key === 'opacity' ? 100 : 1)) / (key === 'opacity' ? 100 : 1)} onChange={(event) => updateImageTransform(selectedEvent.id, editPoint, { [key]: Number(event.target.value) } as Partial<CoopImageTransform>)} /></label>)}
          </div>
        </>}
      </section>}

      <section className={`coop-preview-stage ${moveMode ? 'move-mode' : ''}`}>
        {events.filter((event) => event.kind === 'image' && activeVisuals[event.id] && event.src).map((event) => <img key={event.id} src={event.src} alt="" className="coop-preview-media" style={transformStyle(interpolateTransform(event, activeVisuals[event.id], previewNow))} />)}
        {moveMode && selectedEvent?.kind === 'image' && selectedEvent.src && <div className="coop-edit-frame" style={transformStyle(selectedEvent[editPoint])} onPointerDown={(event) => beginImageDrag(event, selectedEvent.id, editPoint, 'move')}>
          <img src={selectedEvent.src} alt="" />
          {['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'].map((edge) => <span key={edge} className={`coop-image-handle ${edge}`} onPointerDown={(event) => beginImageDrag(event, selectedEvent.id, editPoint, 'resize', edge)} />)}
        </div>}
      </section>
      <div className="coop-audio-bank">{events.filter((event) => event.kind === 'audio' && event.src).map((event) => <audio key={event.id} ref={(node) => { audioRefs.current[event.id] = node; }} src={event.src} />)}</div>
    </aside>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}
