import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, ArrowLeft, Eye, EyeOff, GripVertical, Image as ImageIcon, Layers, Mic2, Music2, Play, Plus, RotateCcw, Settings, Square, Trash2, Upload, UserRound } from 'lucide-react';
import type { CharacterSlot, ComboChart, ComboIconMapping, ComboImageStyle, ComboStep, KeyBinding, MoveDefinition, TrainerInputEvent } from '../combo-core';
import { normalizeInputCode, resolveActivation } from '../combo-core/input';
import { comboTextParts, defaultComboContentLabelForMoveId, effectiveIconMappings, maybeConvertTextToIconLabel, normalizeComboIconMappings } from './combo-image/comboImage';
import { assetUrl } from './keyMappingTypes';
import { localizeDefaultCharacterName, useI18n } from './i18n';
import { NumericDraftInput } from './NumericDraftInput';
import defaultAxisRhythmLayout from '../public/axis-rhythm-preset/layout.json';

export type AxisRhythmInputSignal = TrainerInputEvent & { id: string };

type AxisRhythmStatus = 'idle' | 'countdown' | 'running' | 'paused' | 'finished';
type AxisRhythmJudgement = 'perfect' | 'great' | 'good' | 'miss';
type AxisRhythmFeedback = { id: string; label: string; judgement: AxisRhythmJudgement; slot: CharacterSlot; createdAt: number };
type AxisRhythmSettings = { speed: number; perfectMs: number; greatMs: number; goodMs: number };
type AudioMeterState = { active: boolean; level: number; error?: string };
type AxisLayerTransform = { x: number; y: number; width: number; height: number; opacity: number; rotate: number };
type AxisRhythmLayerKind = 'image' | 'audio' | 'feedback';
type AxisFeedbackMode = 'show' | 'hide';
type AxisRhythmLayer = { id: string; name: string; kind: AxisRhythmLayerKind; src?: string; assetKey?: string; transform: AxisLayerTransform; audioAmplitude: number; feedbackSlot?: CharacterSlot; feedbackMode?: AxisFeedbackMode; feedbackDurationMs?: number };
type AxisLaneGeometry = { startX: number; startY: number; endX: number; endY: number };
type AxisJudgeZone = { x: number; y: number; width: number; height: number };
type AxisAvatarLayout = { x: number; y: number; width: number; height: number; gap: number };
type AxisRhythmLayout = { layers: AxisRhythmLayer[]; layerOrder: string[]; lanes: Record<CharacterSlot, AxisLaneGeometry>; judgeZone: AxisJudgeZone; avatars: AxisAvatarLayout; selectedLayerId?: string };
type TransformDrag = {
  kind: 'move' | 'resize';
  edge?: string;
  layerId: string;
  startX: number;
  startY: number;
  base: AxisLayerTransform;
  rect: DOMRect;
};

type Props = {
  chart: ComboChart | null;
  library: ComboChart[];
  style: ComboImageStyle;
  moves: MoveDefinition[];
  bindings: KeyBinding[];
  inputSignal: AxisRhythmInputSignal | null;
  iconStorageKey: string;
  onSelectChart: (id: string) => void;
  onExit: () => void;
};

const CHARACTER_SLOTS: CharacterSlot[] = [1, 2, 3];
const DEFAULT_SETTINGS: AxisRhythmSettings = { speed: 0.42, perfectMs: 70, greatMs: 135, goodMs: 240 };
const COUNTDOWN_MS = 3200;
const INPUT_DEDUPE_MS = 90;
const AXIS_LAYOUT_STORAGE_KEY = 'ww-combo-axis-rhythm-layout-v1';
const AXIS_ASSET_DB_NAME = 'ww-combo-axis-rhythm-assets-v1';
const AXIS_ASSET_STORE = 'images';
const AXIS_SYSTEM_NOTES_LAYER_ID = 'axis-system-falling-notes';
const AXIS_SYSTEM_AVATARS_LAYER_ID = 'axis-system-character-avatars';
const AXIS_SYSTEM_LAYER_IDS = [AXIS_SYSTEM_NOTES_LAYER_ID, AXIS_SYSTEM_AVATARS_LAYER_ID] as const;
const DEFAULT_LAYER_TRANSFORM: AxisLayerTransform = { x: 0, y: 0, width: 100, height: 100, opacity: 1, rotate: 0 };
const DEFAULT_LANES: Record<CharacterSlot, AxisLaneGeometry> = {
  1: { startX: 42, startY: 10, endX: 20, endY: 91 },
  2: { startX: 50, startY: 10, endX: 50, endY: 91 },
  3: { startX: 58, startY: 10, endX: 80, endY: 91 }
};
const DEFAULT_JUDGE_ZONE: AxisJudgeZone = { x: 5, y: 79, width: 90, height: 14 };
const DEFAULT_AVATAR_LAYOUT: AxisAvatarLayout = { x: 4, y: 84, width: 92, height: 16, gap: 2 };
const PREVIEW_HANDLES = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];

function cloneMappings(mappings: ComboIconMapping[]): ComboIconMapping[] {
  return mappings.map((mapping) => ({ ...mapping, triggers: [...mapping.triggers] }));
}

function loadAxisMappings(storageKey: string, style: ComboImageStyle): ComboIconMapping[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return normalizeComboIconMappings(JSON.parse(raw));
  } catch {
    // fall through to snapshot
  }
  return cloneMappings(effectiveIconMappings(style, undefined));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function numberOr(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeAxisLayerTransform(value: unknown, fallback: AxisLayerTransform = DEFAULT_LAYER_TRANSFORM): AxisLayerTransform {
  const record = value as Partial<AxisLayerTransform> | null;
  return {
    x: clamp(numberOr(record?.x, fallback.x), -200, 300),
    y: clamp(numberOr(record?.y, fallback.y), -200, 300),
    width: clamp(numberOr(record?.width, fallback.width), 1, 400),
    height: clamp(numberOr(record?.height, fallback.height), 1, 400),
    opacity: clamp(numberOr(record?.opacity, fallback.opacity), 0, 1),
    rotate: clamp(numberOr(record?.rotate, fallback.rotate), -720, 720)
  };
}

function normalizeLaneGeometry(value: unknown, fallback: AxisLaneGeometry): AxisLaneGeometry {
  const record = value as Partial<AxisLaneGeometry> | null;
  return {
    startX: clamp(numberOr(record?.startX, fallback.startX), -100, 200),
    startY: clamp(numberOr(record?.startY, fallback.startY), -100, 200),
    endX: clamp(numberOr(record?.endX, fallback.endX), -100, 200),
    endY: clamp(numberOr(record?.endY, fallback.endY), -100, 200)
  };
}

function normalizeJudgeZone(value: unknown): AxisJudgeZone {
  const record = value as Partial<AxisJudgeZone> | null;
  return {
    x: clamp(numberOr(record?.x, DEFAULT_JUDGE_ZONE.x), -100, 200),
    y: clamp(numberOr(record?.y, DEFAULT_JUDGE_ZONE.y), -100, 200),
    width: clamp(numberOr(record?.width, DEFAULT_JUDGE_ZONE.width), 1, 300),
    height: clamp(numberOr(record?.height, DEFAULT_JUDGE_ZONE.height), 1, 200)
  };
}

function normalizeAvatarLayout(value: unknown): AxisAvatarLayout {
  const record = value as Partial<AxisAvatarLayout> | null;
  return {
    x: clamp(numberOr(record?.x, DEFAULT_AVATAR_LAYOUT.x), -100, 200),
    y: clamp(numberOr(record?.y, DEFAULT_AVATAR_LAYOUT.y), -100, 200),
    width: clamp(numberOr(record?.width, DEFAULT_AVATAR_LAYOUT.width), 1, 300),
    height: clamp(numberOr(record?.height, DEFAULT_AVATAR_LAYOUT.height), 1, 200),
    gap: clamp(numberOr(record?.gap, DEFAULT_AVATAR_LAYOUT.gap), 0, 50)
  };
}

function normalizeAxisLayer(value: unknown, index: number): AxisRhythmLayer | null {
  const record = value as Partial<AxisRhythmLayer> | null;
  if (!record || typeof record !== 'object') return null;
  return {
    id: typeof record.id === 'string' && record.id ? record.id : crypto.randomUUID(),
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : `图层 ${index + 1}`,
    kind: record.kind === 'audio' || record.kind === 'feedback' ? record.kind : 'image',
    src: typeof record.src === 'string' ? record.src : undefined,
    assetKey: typeof record.assetKey === 'string' && record.assetKey ? record.assetKey : undefined,
    transform: normalizeAxisLayerTransform(record.transform),
    audioAmplitude: clamp(numberOr(record.audioAmplitude, 12), 0, 100),
    feedbackSlot: CHARACTER_SLOTS.includes(record.feedbackSlot as CharacterSlot) ? record.feedbackSlot as CharacterSlot : 1,
    feedbackMode: record.feedbackMode === 'hide' ? 'hide' : 'show',
    feedbackDurationMs: clamp(numberOr(record.feedbackDurationMs, 420), 80, 5000)
  };
}

function normalizeAxisLayout(value: unknown): AxisRhythmLayout {
  const record = value as Partial<AxisRhythmLayout> | null;
  const layers = Array.isArray(record?.layers)
    ? record.layers.map(normalizeAxisLayer).filter((item): item is AxisRhythmLayer => Boolean(item))
    : [];
  const validIds = new Set<string>([...AXIS_SYSTEM_LAYER_IDS, ...layers.map((layer) => layer.id)]);
  const storedOrder = Array.isArray(record?.layerOrder) ? record.layerOrder.filter((id): id is string => typeof id === 'string' && validIds.has(id)) : [];
  const legacyOrder = [AXIS_SYSTEM_NOTES_LAYER_ID, ...layers.map((layer) => layer.id), AXIS_SYSTEM_AVATARS_LAYER_ID];
  const layerOrder = storedOrder.length ? [...new Set([...storedOrder, ...legacyOrder])] : legacyOrder;
  const selectedLayerId = typeof record?.selectedLayerId === 'string' && validIds.has(record.selectedLayerId) ? record.selectedLayerId : layerOrder[0];
  const laneRecord = record?.lanes as Partial<Record<CharacterSlot, AxisLaneGeometry>> | undefined;
  const lanes = {
    1: normalizeLaneGeometry(laneRecord?.[1], DEFAULT_LANES[1]),
    2: normalizeLaneGeometry(laneRecord?.[2], DEFAULT_LANES[2]),
    3: normalizeLaneGeometry(laneRecord?.[3], DEFAULT_LANES[3])
  } as Record<CharacterSlot, AxisLaneGeometry>;
  return { layers, layerOrder, lanes, judgeZone: normalizeJudgeZone(record?.judgeZone), avatars: normalizeAvatarLayout(record?.avatars), selectedLayerId };
}

function loadAxisLayout(): AxisRhythmLayout {
  try {
    const raw = localStorage.getItem(AXIS_LAYOUT_STORAGE_KEY);
    return raw ? normalizeAxisLayout(JSON.parse(raw)) : normalizeAxisLayout(defaultAxisRhythmLayout);
  } catch {
    return normalizeAxisLayout(defaultAxisRhythmLayout);
  }
}

function createImageLayer(name = '图片图层', kind: AxisRhythmLayerKind = 'image'): AxisRhythmLayer {
  return { id: crypto.randomUUID(), name, kind, src: undefined, assetKey: undefined, transform: { ...DEFAULT_LAYER_TRANSFORM }, audioAmplitude: 12, feedbackSlot: 1, feedbackMode: 'show', feedbackDurationMs: 420 };
}

function axisSystemLayerName(layerId: string): string | null {
  if (layerId === AXIS_SYSTEM_NOTES_LAYER_ID) return '下落图标';
  if (layerId === AXIS_SYSTEM_AVATARS_LAYER_ID) return '角色头像';
  return null;
}

function isBackgroundLayer(layerId: string, order: string[]): boolean {
  const index = order.indexOf(layerId);
  return index >= 0 && AXIS_SYSTEM_LAYER_IDS.every((systemId) => index > order.indexOf(systemId));
}

function axisLayerZ(layerId: string, order: string[]): number {
  const index = order.indexOf(layerId);
  return 20 - Math.max(0, index);
}

function openAxisAssetDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(AXIS_ASSET_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AXIS_ASSET_STORE)) db.createObjectStore(AXIS_ASSET_STORE);
    };
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
  });
}

async function putAxisAsset(key: string, value: Blob): Promise<boolean> {
  const db = await openAxisAssetDb();
  if (!db) return false;
  return new Promise((resolve) => {
    const transaction = db.transaction(AXIS_ASSET_STORE, 'readwrite');
    transaction.objectStore(AXIS_ASSET_STORE).put(value, key);
    transaction.oncomplete = () => { db.close(); resolve(true); };
    transaction.onerror = () => { db.close(); resolve(false); };
    transaction.onabort = () => { db.close(); resolve(false); };
  });
}

async function getAxisAsset(key: string): Promise<Blob | undefined> {
  const db = await openAxisAssetDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const transaction = db.transaction(AXIS_ASSET_STORE, 'readonly');
    const request = transaction.objectStore(AXIS_ASSET_STORE).get(key);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : undefined);
    request.onerror = () => resolve(undefined);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  });
}

async function deleteAxisAsset(key: string): Promise<void> {
  const db = await openAxisAssetDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(AXIS_ASSET_STORE, 'readwrite');
    transaction.objectStore(AXIS_ASSET_STORE).delete(key);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); resolve(); };
  });
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  try {
    const bytes = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
    const array = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
    return new Blob([array], { type: match[1] || 'application/octet-stream' });
  } catch {
    return null;
  }
}

function axisLayoutForStorage(layout: AxisRhythmLayout): AxisRhythmLayout {
  return { ...layout, layers: layout.layers.map((layer) => ({ ...layer, src: layer.assetKey ? undefined : layer.src })) };
}

function layerTransformStyle(layer: AxisRhythmLayer, audioLevel: number): CSSProperties {
  const transform = layer.transform;
  const audioOffset = layer.kind === 'audio' ? clamp(audioLevel, 0, 1) * layer.audioAmplitude : 0;
  return {
    left: `${transform.x}%`,
    top: `${transform.y - audioOffset}%`,
    width: `${transform.width}%`,
    height: `${transform.height}%`,
    opacity: transform.opacity,
    transform: `rotate(${transform.rotate}deg)`
  };
}

function avatarLayoutStyle(layout: AxisAvatarLayout): CSSProperties {
  return {
    left: `${layout.x}%`,
    top: `${layout.y}%`,
    width: `${layout.width}%`,
    height: `${layout.height}%`,
    gap: `${layout.gap}%`
  };
}

function transformPatchFromDrag(drag: TransformDrag, event: PointerEvent): AxisLayerTransform {
  const dx = ((event.clientX - drag.startX) / Math.max(1, drag.rect.width)) * 100;
  const dy = ((event.clientY - drag.startY) / Math.max(1, drag.rect.height)) * 100;
  const next = { ...drag.base };
  if (drag.kind === 'move') {
    next.x = drag.base.x + dx;
    next.y = drag.base.y + dy;
    return normalizeAxisLayerTransform(next, drag.base);
  }
  const edge = drag.edge ?? 'se';
  if (edge.includes('e')) next.width = drag.base.width + dx;
  if (edge.includes('s')) next.height = drag.base.height + dy;
  if (edge.includes('w')) {
    next.x = drag.base.x + dx;
    next.width = drag.base.width - dx;
  }
  if (edge.includes('n')) {
    next.y = drag.base.y + dy;
    next.height = drag.base.height - dy;
  }
  return normalizeAxisLayerTransform(next, drag.base);
}

function displayMoveLabel(step: ComboStep): string {
  return step.label || step.moveId;
}

function switchSlotForMoveId(moveId: string): CharacterSlot | null {
  if (moveId === 'switch_1') return 1;
  if (moveId === 'switch_2') return 2;
  if (moveId === 'switch_3') return 3;
  return null;
}

function activeCharacterSlot(steps: ComboStep[], elapsedMs: number): CharacterSlot {
  const firstSlot = (steps[0]?.characterSlot ?? 1) as CharacterSlot;
  return steps
    .filter((step) => step.startMin <= elapsedMs && switchSlotForMoveId(step.moveId) !== null)
    .sort((left, right) => right.startMin - left.startMin || right.id.localeCompare(left.id))
    .map((step) => switchSlotForMoveId(step.moveId) ?? firstSlot)[0] ?? firstSlot;
}

function judgementForOffset(offsetMs: number, settings: AxisRhythmSettings): AxisRhythmJudgement | null {
  const abs = Math.abs(offsetMs);
  if (abs <= settings.perfectMs) return 'perfect';
  if (abs <= settings.greatMs) return 'great';
  if (abs <= settings.goodMs) return 'good';
  return null;
}

function judgementLabel(judgement: AxisRhythmJudgement): string {
  if (judgement === 'perfect') return 'PERFECT';
  if (judgement === 'great') return 'GREAT';
  if (judgement === 'good') return 'GOOD';
  return 'MISS';
}

function lanePointAt(lane: AxisLaneGeometry, progress: number): { x: number; y: number } {
  return {
    x: lane.startX + (lane.endX - lane.startX) * progress,
    y: lane.startY + (lane.endY - lane.startY) * progress
  };
}

function lanePerspectiveVars(lane: AxisLaneGeometry): CSSProperties {
  const dx = lane.endX - lane.startX;
  const dy = lane.endY - lane.startY;
  return {
    left: `${lane.startX}%`,
    top: `${lane.startY}%`,
    width: `${Math.max(0.1, Math.hypot(dx, dy))}%`,
    transform: `rotate(${Math.atan2(dy, dx) * (180 / Math.PI)}deg)`
  };
}

function notePerspectiveVars(slot: CharacterSlot, progress: number, lane: AxisLaneGeometry, width = 92): CSSProperties {
  const index = slot - 1;
  const travel = 1 - progress;
  const { x, y } = lanePointAt(lane, travel);
  const scale = 0.5 + travel * 0.68;
  const angle = Math.atan2(lane.endY - lane.startY, lane.endX - lane.startX) * (180 / Math.PI);
  return {
    left: `${x}%`,
    top: `${y}%`,
    width: `${width}px`,
    '--axis-note-scale': scale,
    '--axis-note-rotate': `${angle - 90}deg`,
    '--axis-note-skew': `${(index - 1) * 4}deg`
  } as CSSProperties;
}

function judgeZoneStyle(zone: AxisJudgeZone): CSSProperties {
  return { left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%` };
}

function feedbackPositionStyle(item: AxisRhythmFeedback, feedback: AxisRhythmFeedback[], lane: AxisLaneGeometry): CSSProperties {
  const slotIndex = feedback.slice(0, feedback.indexOf(item)).filter((entry) => entry.slot === item.slot).length;
  return {
    left: `${lane.endX}%`,
    top: `${lane.endY}%`,
    '--axis-feedback-offset': `${18 + slotIndex * 34}px`
  } as CSSProperties;
}

function AxisInlineContent({ step, style, mappings }: { step: ComboStep; style: ComboImageStyle; mappings: ComboIconMapping[] }) {
  const switchText = defaultComboContentLabelForMoveId(step.moveId);
  const contentText = switchSlotForMoveId(step.moveId) !== null ? switchText ?? displayMoveLabel(step) : style.contentLabels[step.id]?.trim() || displayMoveLabel(step);
  const convertIcons = switchSlotForMoveId(step.moveId) !== null || style.convertIcons;
  const iconText = maybeConvertTextToIconLabel(contentText, convertIcons);
  const parts = comboTextParts(iconText, convertIcons, mappings).filter((part) => part.kind === 'icon');
  return <strong className="axis-note-content">{parts.map((part, index) => part.kind === 'icon' ? <span key={`${part.iconId}-${index}`} className="axis-icon-mark"><img src={part.src} alt="" title={part.label} /></span> : null)}</strong>;
}

function useAudioMeter(): [AudioMeterState, () => Promise<void>] {
  const { text } = useI18n();
  const [meter, setMeter] = useState<AudioMeterState>({ active: false, level: 0 });
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const frameRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => () => {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void contextRef.current?.close();
  }, []);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      stream.getVideoTracks().forEach((track) => track.stop());
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      streamRef.current = stream;
      contextRef.current = context;
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      setMeter({ active: true, level: 0 });
      const tick = () => {
        const analyserNode = analyserRef.current;
        const data = dataRef.current;
        if (analyserNode && data) {
          analyserNode.getByteFrequencyData(data);
          const average = data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length);
          setMeter({ active: true, level: Math.min(1, average / 130) });
        }
        frameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (error) {
      setMeter({ active: false, level: 0, error: error instanceof Error ? error.message : text('无法捕捉系统音频', 'Unable to capture system audio') });
    }
  }

  return [meter, start];
}

export function AxisRhythmGame({ chart, library, style, moves, bindings, inputSignal, iconStorageKey, onSelectChart, onExit }: Props) {
  const { language, text } = useI18n();
  const [view, setView] = useState<'menu' | 'challenge' | 'settings'>('menu');
  const [iconMappings, setIconMappings] = useState<ComboIconMapping[]>(() => loadAxisMappings(iconStorageKey, style));
  const renderedIconMappings = useMemo(() => {
    const replacements = new Map(style.iconMappings.filter((mapping) => mapping.src.startsWith('data:image/svg+xml')).map((mapping) => [mapping.id, mapping.src]));
    return replacements.size ? iconMappings.map((mapping) => replacements.has(mapping.id) ? { ...mapping, src: replacements.get(mapping.id)! } : mapping) : iconMappings;
  }, [iconMappings, style.iconMappings]);
  const [layout, setLayout] = useState<AxisRhythmLayout>(loadAxisLayout);
  const [status, setStatus] = useState<AxisRhythmStatus>('idle');
  const [countdownStartedAt, setCountdownStartedAt] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pausedElapsed, setPausedElapsed] = useState(0);
  const [clockNow, setClockNow] = useState(() => performance.now());
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [missedIds, setMissedIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<AxisRhythmFeedback[]>([]);
  const [combo, setCombo] = useState(0);
  const [assetMessage, setAssetMessage] = useState('');
  const [runtimeSlot, setRuntimeSlot] = useState<CharacterSlot>(() => (chart?.steps[0]?.characterSlot ?? 1) as CharacterSlot);
  const [feedbackPulse, setFeedbackPulse] = useState<Partial<Record<CharacterSlot, number>>>({});
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [meter, startMeter] = useAudioMeter();
  const settings = DEFAULT_SETTINGS;
  const lastInputRef = useRef(new Map<string, number>());
  const transformDragRef = useRef<TransformDrag | null>(null);
  const layerOrderDragRef = useRef<{ layerId: string; startX: number; startY: number; moved: boolean } | null>(null);
  const objectUrlsRef = useRef(new Map<string, string>());

  function displayLayerName(name: string): string {
    const direct: Record<string, string> = {
      '图片图层': text('图片图层', 'Image Layer'),
      '音频律动层': text('音频律动层', 'Audio Reactive Layer'),
      '角色反馈层': text('角色反馈层', 'Character Feedback Layer')
    };
    const numbered = /^图层\s*(\d+)$/.exec(name);
    if (numbered) return text(`图层 ${numbered[1]}`, `Layer ${numbered[1]}`);
    return direct[name] ?? name;
  }

  const displayOnlyMoveIds = useMemo(() => new Set(moves.filter((move) => move.displayOnly).map((move) => move.id)), [moves]);
  const orderedSteps = useMemo(() => [...(chart?.steps ?? [])].filter((step) => !displayOnlyMoveIds.has(step.moveId)).sort((left, right) => left.startMin - right.startMin || (left.characterSlot ?? 1) - (right.characterSlot ?? 1) || left.id.localeCompare(right.id)), [chart, displayOnlyMoveIds]);
  const chartEndMs = Math.max(3000, ...orderedSteps.map((step) => step.startMin + step.durationMax + 900));
  const elapsedMs = status === 'running' && startedAt !== null ? Math.max(0, clockNow - startedAt) : pausedElapsed;
  const activeSlot = status === 'running' ? runtimeSlot : activeCharacterSlot(orderedSteps, elapsedMs);
  const matchedSet = new Set(matchedIds);
  const missedSet = new Set(missedIds);
  const selectedStackId = layout.selectedLayerId && layout.layerOrder.includes(layout.selectedLayerId) ? layout.selectedLayerId : layout.layerOrder[0];
  const selectedLayer = layout.layers.find((layer) => layer.id === selectedStackId) ?? null;
  const visibleSteps = orderedSteps.filter((step) => {
    const distance = step.startMin - elapsedMs;
    return distance >= -420 && distance <= 2300;
  });

  useEffect(() => {
    localStorage.setItem(iconStorageKey, JSON.stringify(iconMappings));
  }, [iconMappings, iconStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(AXIS_LAYOUT_STORAGE_KEY, JSON.stringify(axisLayoutForStorage(layout)));
    } catch {
      setAssetMessage(text('布局保存空间不足，图片已改存资源库；请稍后再试。', 'There is not enough space to save the layout. Images were kept in the asset library; please try again later.'));
    }
  }, [layout]);

  useEffect(() => {
    let cancelled = false;
    async function hydrateLayerAssets() {
      const layers = await Promise.all(layout.layers.map(async (layer) => {
        if (layer.assetKey) {
          if (layer.src) return layer;
          const blob = await getAxisAsset(layer.assetKey);
          if (!blob || cancelled) return layer;
          const objectUrl = URL.createObjectURL(blob);
          objectUrlsRef.current.set(layer.assetKey, objectUrl);
          return { ...layer, src: objectUrl };
        }
        if (!layer.src?.startsWith('data:')) return layer;
        const blob = dataUrlToBlob(layer.src);
        if (!blob) return layer;
        const assetKey = `axis-layer:${layer.id}`;
        const stored = await putAxisAsset(assetKey, blob);
        if (!stored || cancelled) return layer;
        const objectUrl = URL.createObjectURL(blob);
        objectUrlsRef.current.set(assetKey, objectUrl);
        return { ...layer, assetKey, src: objectUrl };
      }));
      if (!cancelled && layers.some((layer, index) => layer !== layout.layers[index])) {
        const migratedById = new Map(layers.map((layer) => [layer.id, layer]));
        setLayout((current) => normalizeAxisLayout({
          ...current,
          layers: current.layers.map((layer) => {
            const migrated = migratedById.get(layer.id);
            return migrated ? { ...layer, assetKey: migrated.assetKey, src: migrated.src } : layer;
          })
        }));
      }
    }
    void hydrateLayerAssets();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    setRuntimeSlot((chart?.steps[0]?.characterSlot ?? 1) as CharacterSlot);
  }, [chart?.id]);

  useEffect(() => {
    if (status !== 'running' && status !== 'countdown') return;
    let frame = 0;
    const tick = () => {
      setClockNow(performance.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status]);

  useEffect(() => {
    if (status !== 'countdown' || countdownStartedAt === null) return;
    const remaining = COUNTDOWN_MS - (clockNow - countdownStartedAt);
    if (remaining > 0) return;
    setStartedAt(performance.now());
    setPausedElapsed(0);
    setStatus('running');
  }, [status, countdownStartedAt, clockNow]);

  useEffect(() => {
    if (status !== 'running') return;
    const newlyMissed = orderedSteps.filter((step) => !matchedSet.has(step.id) && !missedSet.has(step.id) && elapsedMs > step.startMin + settings.goodMs);
    if (!newlyMissed.length) return;
    setMissedIds((current) => [...current, ...newlyMissed.map((step) => step.id)]);
    setCombo(0);
    setFeedback((current) => [...newlyMissed.map((step) => ({ id: `${step.id}:miss:${performance.now()}`, label: 'MISS', judgement: 'miss' as const, slot: (step.characterSlot ?? 1) as CharacterSlot, createdAt: performance.now() })), ...current].slice(0, 8));
  }, [status, elapsedMs, orderedSteps, matchedSet, missedSet, settings.goodMs]);

  useEffect(() => {
    if (status === 'running' && elapsedMs >= chartEndMs) setStatus('finished');
  }, [status, elapsedMs, chartEndMs]);

  useEffect(() => {
    if (!inputSignal) return;
    if (inputSignal.type === 'keydown' && normalizeInputCode(inputSignal.code) === 'Escape' && status === 'running') {
      setPausedElapsed(elapsedMs);
      setStatus('paused');
      return;
    }
    if (inputSignal.type === 'keydown' && normalizeInputCode(inputSignal.code) === 'KeyF' && (status === 'idle' || status === 'paused' || status === 'finished')) {
      startGame();
      return;
    }
    if (status !== 'running' || (inputSignal.type !== 'keydown' && inputSignal.type !== 'mousedown' && inputSignal.type !== 'gamepadbuttondown')) return;
    const code = normalizeInputCode(inputSignal.code);
    const last = lastInputRef.current.get(code);
    if (last !== undefined && Math.abs(inputSignal.time - last) < INPUT_DEDUPE_MS) return;
    lastInputRef.current.set(code, inputSignal.time);
    const activation = resolveActivation(inputSignal, moves, bindings);
    const switchSlot = activation ? switchSlotForMoveId(activation.move.id) : null;
    if (switchSlot !== null) {
      setRuntimeSlot(switchSlot);
      return;
    }
    setFeedbackPulse((current) => ({ ...current, [runtimeSlot]: performance.now() }));
    if (!activation) return;
    const candidates = orderedSteps.filter((step) => step.moveId === activation.move.id && !matchedSet.has(step.id) && !missedSet.has(step.id));
    const target = candidates.reduce<ComboStep | null>((best, step) => {
      if (!best) return step;
      return Math.abs(step.startMin - elapsedMs) < Math.abs(best.startMin - elapsedMs) ? step : best;
    }, null);
    if (!target) return;
    const offset = elapsedMs - target.startMin;
    const judgement = judgementForOffset(offset, settings);
    if (!judgement) return;
    setMatchedIds((current) => [...current, target.id]);
    setCombo((current) => current + 1);
    setFeedback((current) => [{ id: `${target.id}:${judgement}:${performance.now()}`, label: judgementLabel(judgement), judgement, slot: (target.characterSlot ?? 1) as CharacterSlot, createdAt: performance.now() }, ...current].slice(0, 8));
  }, [inputSignal?.id, runtimeSlot, status]);

  function patchLayout(updater: (current: AxisRhythmLayout) => AxisRhythmLayout) {
    setLayout((current) => normalizeAxisLayout(updater(current)));
  }

  function updateLayer(layerId: string, patch: Partial<AxisRhythmLayer> | ((layer: AxisRhythmLayer) => AxisRhythmLayer)) {
    patchLayout((current) => ({
      ...current,
      layers: current.layers.map((layer) => layer.id === layerId ? (typeof patch === 'function' ? patch(layer) : { ...layer, ...patch }) : layer)
    }));
  }

  function updateSelectedTransform(patch: Partial<AxisLayerTransform>) {
    if (!selectedLayer) return;
    updateLayer(selectedLayer.id, { transform: normalizeAxisLayerTransform({ ...selectedLayer.transform, ...patch }, selectedLayer.transform) });
  }

  function updateLane(slot: CharacterSlot, patch: Partial<AxisLaneGeometry>) {
    patchLayout((current) => ({ ...current, lanes: { ...current.lanes, [slot]: normalizeLaneGeometry({ ...current.lanes[slot], ...patch }, current.lanes[slot]) } }));
  }

  function updateJudgeZone(patch: Partial<AxisJudgeZone>) {
    patchLayout((current) => ({ ...current, judgeZone: normalizeJudgeZone({ ...current.judgeZone, ...patch }) }));
  }

  function updateAvatars(patch: Partial<AxisAvatarLayout>) {
    patchLayout((current) => ({ ...current, avatars: normalizeAvatarLayout({ ...current.avatars, ...patch }) }));
  }

  function insertCustomLayer(layer: AxisRhythmLayer) {
    patchLayout((current) => {
      const notesIndex = current.layerOrder.indexOf(AXIS_SYSTEM_NOTES_LAYER_ID);
      const layerOrder = [...current.layerOrder];
      layerOrder.splice(Math.max(0, notesIndex + 1), 0, layer.id);
      return { ...current, layers: [layer, ...current.layers], layerOrder, selectedLayerId: layer.id };
    });
  }

  function addImageLayer() {
    insertCustomLayer(createImageLayer(text('图片图层', 'Image Layer')));
  }

  function addAudioLayer() {
    insertCustomLayer(createImageLayer(text('音频律动层', 'Audio Reactive Layer'), 'audio'));
  }

  function addFeedbackLayer() {
    insertCustomLayer(createImageLayer(text('角色反馈层', 'Character Feedback Layer'), 'feedback'));
  }

  async function pickImageForLayer(layerId: string, file: File | null) {
    if (!file) return;
    const assetKey = `axis-layer:${layerId}`;
    const stored = await putAxisAsset(assetKey, file);
    if (!stored) {
      setAssetMessage(text('图片保存失败：浏览器资源库不可用或空间不足。', 'Unable to save the image: the browser asset library is unavailable or out of space.'));
      return;
    }
    const previousUrl = objectUrlsRef.current.get(assetKey);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    const src = URL.createObjectURL(file);
    objectUrlsRef.current.set(assetKey, src);
    updateLayer(layerId, { src, assetKey });
    setAssetMessage(text('图片已保存到节奏合轴资源库。', 'The image was saved to the Rhythm Axis asset library.'));
  }

  function deleteSelectedLayer() {
    if (!selectedLayer) return;
    if (selectedLayer.assetKey) {
      const objectUrl = objectUrlsRef.current.get(selectedLayer.assetKey);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrlsRef.current.delete(selectedLayer.assetKey);
      void deleteAxisAsset(selectedLayer.assetKey);
    }
    patchLayout((current) => {
      const layers = current.layers.filter((layer) => layer.id !== selectedLayer.id);
      const layerOrder = current.layerOrder.filter((layerId) => layerId !== selectedLayer.id);
      return { ...current, layers, layerOrder, selectedLayerId: layerOrder[0] };
    });
  }

  function resetLayout() {
    layout.layers.forEach((layer) => {
      if (!layer.assetKey) return;
      const objectUrl = objectUrlsRef.current.get(layer.assetKey);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrlsRef.current.delete(layer.assetKey);
      void deleteAxisAsset(layer.assetKey);
    });
    setLayout(normalizeAxisLayout(defaultAxisRhythmLayout));
    setAssetMessage(text('布局与自定义图层已重置。', 'The layout and custom layers were reset.'));
  }

  function selectLayer(layerId: string) {
    patchLayout((current) => ({ ...current, selectedLayerId: layerId }));
  }

  function reorderLayer(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    patchLayout((current) => {
      const fromIndex = current.layerOrder.indexOf(draggedId);
      const targetIndex = current.layerOrder.indexOf(targetId);
      if (fromIndex < 0 || targetIndex < 0) return current;
      const layerOrder = [...current.layerOrder];
      layerOrder.splice(fromIndex, 1);
      layerOrder.splice(targetIndex, 0, draggedId);
      return { ...current, layerOrder };
    });
  }

  function beginLayerOrderDrag(event: ReactPointerEvent<HTMLButtonElement>, layerId: string) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    layerOrderDragRef.current = { layerId, startX: event.clientX, startY: event.clientY, moved: false };
    setDraggedLayerId(layerId);
  }

  function moveLayerOrderDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = layerOrderDragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
    drag.moved = true;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>('[data-axis-layer-id]');
    const targetId = target?.dataset.axisLayerId;
    if (targetId) reorderLayer(drag.layerId, targetId);
  }

  function endLayerOrderDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    layerOrderDragRef.current = null;
    setDraggedLayerId(null);
  }

  function beginLayerTransformDrag(event: ReactPointerEvent<HTMLElement>, layerId: string, kind: 'move' | 'resize', edge?: string) {
    if (event.button !== 0) return;
    const layer = layout.layers.find((item) => item.id === layerId);
    const stage = event.currentTarget.closest('.axis-rhythm-stage') as HTMLElement | null;
    const rect = stage?.getBoundingClientRect();
    if (!layer || !rect) return;
    event.preventDefault();
    event.stopPropagation();
    transformDragRef.current = { kind, edge, layerId, startX: event.clientX, startY: event.clientY, base: layer.transform, rect };
    const onMove = (moveEvent: PointerEvent) => {
      const drag = transformDragRef.current;
      if (!drag) return;
      updateLayer(drag.layerId, { transform: transformPatchFromDrag(drag, moveEvent) });
    };
    const onUp = () => {
      transformDragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startGame() {
    if (!chart) return;
    lastInputRef.current.clear();
    setMatchedIds([]);
    setMissedIds([]);
    setFeedback([]);
    setFeedbackPulse({});
    setCombo(0);
    setRuntimeSlot((chart.steps[0]?.characterSlot ?? 1) as CharacterSlot);
    setPausedElapsed(0);
    setStartedAt(null);
    setCountdownStartedAt(performance.now());
    setStatus('countdown');
  }

  function changeView(nextView: 'menu' | 'challenge' | 'settings') {
    if (nextView !== 'challenge') {
      if (status === 'running') {
        setPausedElapsed(elapsedMs);
        setStatus('paused');
      } else if (status === 'countdown') {
        setCountdownStartedAt(null);
        setStatus('idle');
      }
    }
    setView(nextView);
  }

  function pauseGame() {
    if (status === 'running') {
      setPausedElapsed(elapsedMs);
      setStatus('paused');
    } else if (status === 'paused') {
      setStartedAt(performance.now() - pausedElapsed);
      setStatus('running');
    }
  }

  function resetIconSnapshot() {
    setIconMappings(cloneMappings(effectiveIconMappings(style, undefined)));
  }

  const countdownValue = status === 'countdown' && countdownStartedAt !== null ? Math.max(1, Math.ceil((COUNTDOWN_MS - (clockNow - countdownStartedAt)) / 1000)) : null;
  const scoreText = `${matchedIds.length}/${orderedSteps.length}`;
  const statusLabel = status === 'countdown' ? text('倒计时', 'Countdown') : status === 'running' ? text('进行中', 'Running') : status === 'paused' ? text('已暂停', 'Paused') : status === 'finished' ? text('已结束', 'Finished') : text('待开始', 'Ready');

  if (view === 'menu') return <div className="axis-game-menu">
    <section className="axis-game-menu-actions">
      <button className="axis-game-menu-back" onClick={onExit}><ArrowLeft size={18} />{text('返回实验室', 'Back to Labs') }</button>
      <div className="axis-game-menu-brand"><img src="/theme/experiment-axis.png" alt="" /><div><span>{text('实验玩法', 'Experimental Mode') }</span><h2>{text('节奏合轴', 'Rhythm Axis') }</h2><p>{text('在当前窗口内完成按键挑战。', 'Complete the input challenge in this window.') }</p></div></div>
      <div className="axis-game-menu-buttons">
        <button className="primary" disabled={!chart} onClick={() => { setView('challenge'); startGame(); }}><Play size={22} />{text('开启挑战', 'Start Challenge') }</button>
        <button onClick={() => changeView('settings')}><Settings size={22} />{text('设置', 'Settings') }</button>
      </div>
      <div className="axis-game-current-chart"><span>{text('当前连段谱', 'Current Combo Chart') }</span><strong>{chart?.title || text('尚未选择', 'Not Selected') }</strong><em>{chart ? text(`${chart.steps.length} 个招式块`, `${chart.steps.length} action blocks`) : text('请从右侧选择一份已保存连段谱', 'Select a saved combo chart from the right') }</em></div>
    </section>
    <section className="axis-game-library">
      <div className="axis-game-library-head"><div><span>{text('保存内容', 'Saved Content') }</span><h3>{text('连段谱', 'Combo Charts') }</h3></div><b>{library.length}</b></div>
      <div className="axis-game-library-list">{library.length ? library.map((item) => <button key={item.id} className={chart?.id === item.id ? 'active' : ''} onClick={() => onSelectChart(item.id)}><strong>{item.title || text('未命名连段谱', 'Untitled Combo') }</strong><span>{item.steps.length} {text('个招式块', 'action blocks') }</span><time>{new Date(item.updatedAt).toLocaleString(language)}</time></button>) : <div className="axis-game-library-empty">{text('还没有保存的连段谱', 'No saved combo charts yet') }</div>}</div>
    </section>
  </div>;

  if (!chart) return <div className="axis-rhythm-empty"><Music2 size={44} /><strong>{text('暂无连段谱', 'No Combo Chart') }</strong><span>{text('返回主界面选择一份已保存的连段谱。', 'Return to the main view and select a saved combo chart.') }</span><button onClick={() => changeView('menu')}><ArrowLeft size={16} />{text('返回主界面', 'Back to Main View') }</button></div>;

  return <div className={`axis-rhythm-shell axis-rhythm-view-${view}`}>
    <div className="axis-rhythm-topbar">
      <div className="axis-rhythm-title"><button className="icon-button" onClick={() => changeView('menu')} title={text('返回主界面', 'Back to Main View') }><ArrowLeft size={18} /></button><div><strong>{chart.title || text('未命名连段谱', 'Untitled Combo') }</strong><span>{view === 'settings' ? text('设置', 'Settings') : statusLabel}</span></div></div>
      <div className="axis-rhythm-actions">{view === 'settings' ? <><button className="primary" onClick={() => changeView('challenge')}><Play size={16} />{text('进入挑战', 'Enter Challenge') }</button><button onClick={() => void startMeter()}><Mic2 size={16} />{text('音频捕捉', 'Audio Capture') }</button></> : <><button className="primary" onClick={startGame}><Play size={16} />{text('F 启动', 'F Start') }</button><button onClick={pauseGame} disabled={status !== 'running' && status !== 'paused'}><Square size={16} />{text('Esc 暂停', 'Esc Pause') }</button><button onClick={() => changeView('settings')}><Settings size={16} />{text('设置', 'Settings') }</button></>}</div>
    </div>

    <div className="axis-rhythm-workbench">
      <section className="axis-rhythm-stage-card">
        <div className="axis-rhythm-stage">
          <div className="axis-rhythm-bg" />
          <div className="axis-rhythm-design-layer-plane">
            {layout.layers.map((layer) => {
              const pulseAge = clockNow - (feedbackPulse[layer.feedbackSlot ?? 1] ?? -10000);
              const feedbackResponding = layer.kind === 'feedback' && pulseAge >= 0 && pulseAge <= (layer.feedbackDurationMs ?? 420);
              const feedbackVisible = layer.kind !== 'feedback' || (layer.feedbackMode === 'hide' ? !feedbackResponding : feedbackResponding);
              return (
              <div
                key={layer.id}
                className={`axis-rhythm-design-layer ${layer.kind === 'audio' ? 'audio-reactive' : ''} ${layer.kind === 'feedback' ? 'feedback-reactive' : ''} ${feedbackResponding ? 'responding' : ''} ${layer.id === selectedLayer?.id ? 'selected' : ''}`}
                style={{ ...layerTransformStyle(layer, meter.active ? meter.level : 0), zIndex: axisLayerZ(layer.id, layout.layerOrder), visibility: feedbackVisible || view === 'settings' ? 'visible' : 'hidden', opacity: view === 'settings' && !feedbackVisible ? 0.34 : layer.transform.opacity }}
                onPointerDown={view === 'settings' ? (event) => { selectLayer(layer.id); beginLayerTransformDrag(event, layer.id, 'move'); } : undefined}
              >
                {layer.src ? <img src={assetUrl(layer.src)} alt="" /> : <div className="axis-rhythm-layer-placeholder">{layer.kind === 'audio' ? <Mic2 size={22} /> : layer.kind === 'feedback' ? <Eye size={22} /> : <ImageIcon size={22} />}{layer.kind === 'audio' ? text('上传律动图片', 'Upload Reactive Image') : layer.kind === 'feedback' ? text('上传反馈图片', 'Upload Feedback Image') : text('上传图片', 'Upload Image')}</div>}
                {view === 'settings' && layer.id === selectedLayer?.id && <EditFrame onBeginTransformDrag={(event, kind, edge) => beginLayerTransformDrag(event, layer.id, kind, edge)} />}
              </div>
            );})}
          </div>
          <div className="axis-rhythm-score"><b>{scoreText}</b><span>{combo} COMBO</span></div>
          <div className="axis-rhythm-highway axis-rhythm-base-layer">
            <div className="axis-rhythm-grid" />
            {CHARACTER_SLOTS.map((slot) => <div key={slot} className={`axis-lane-line ${activeSlot === slot ? 'active' : ''}`} style={lanePerspectiveVars(layout.lanes[slot])} />)}
            {CHARACTER_SLOTS.map((slot) => <div key={`audio-${slot}`} className={`axis-audio-strip ${activeSlot === slot ? 'active' : ''}`} style={{ ...lanePerspectiveVars(layout.lanes[slot]), '--audio-level': activeSlot === slot ? meter.level : 0.12 } as CSSProperties} />)}
            <div className="axis-judge-zone" style={judgeZoneStyle(layout.judgeZone)} />
          </div>
          <div className="axis-rhythm-system-layer" style={{ zIndex: axisLayerZ(AXIS_SYSTEM_NOTES_LAYER_ID, layout.layerOrder) }}>
            <div className="axis-rhythm-highway">
              {visibleSteps.map((step) => {
                const slot = (step.characterSlot ?? 1) as CharacterSlot;
                const progress = clamp((step.startMin - elapsedMs) / 2300, 0, 1);
                const state = matchedSet.has(step.id) ? 'matched' : missedSet.has(step.id) ? 'missed' : Math.abs(elapsedMs - step.startMin) <= settings.goodMs ? 'hot' : '';
                return <div key={step.id} className={`axis-note ${state}`} style={notePerspectiveVars(slot, progress, layout.lanes[slot])}><AxisInlineContent step={step} style={style} mappings={renderedIconMappings} /></div>;
              })}
            </div>
          </div>
          <div className="axis-rhythm-system-layer" style={{ zIndex: axisLayerZ(AXIS_SYSTEM_AVATARS_LAYER_ID, layout.layerOrder) }}>
            <div className="axis-rhythm-highway">
              <div className="axis-avatar-row" style={avatarLayoutStyle(layout.avatars)}>
                {CHARACTER_SLOTS.map((slot) => {
                  const role = style.roleStyles[slot];
                  return <div key={slot} className={`axis-avatar-card ${activeSlot === slot ? 'active' : ''}`}><span style={role.avatar ? { backgroundImage: `url(${role.avatar})` } : undefined}>{role.avatar ? null : slot}</span><b>{localizeDefaultCharacterName(role.name, slot, language)}</b></div>;
                })}
              </div>
            </div>
          </div>
          {countdownValue && <div className="axis-countdown">{countdownValue}</div>}
          <div className="axis-rhythm-system-layer axis-feedback-layer">
            <div className="axis-rhythm-highway">
              {feedback.slice(0, 2).map((item) => <div key={item.id} className={`axis-feedback ${item.judgement}`} style={feedbackPositionStyle(item, feedback, layout.lanes[item.slot])}>{item.label}</div>)}
            </div>
          </div>
          <div className="axis-rhythm-footer"><span>{(elapsedMs / 1000).toFixed(2)}s / {(chartEndMs / 1000).toFixed(1)}s</span><span>{meter.active ? text(`音频 ${Math.round(meter.level * 100)}%`, `Audio ${Math.round(meter.level * 100)}%`) : meter.error ? text(`音频未启用：${meter.error}`, `Audio unavailable: ${meter.error}`) : text('音频捕捉未启用', 'Audio capture is off')}</span></div>
        </div>
        <div className="axis-rhythm-icon-note"><span>{text('图标映射已从全局复制为“节奏合轴”独立副本；之后全局图标修改不会自动覆盖本模式。', 'Icon mappings are copied into an independent Rhythm Axis set. Later global icon changes do not overwrite this mode.') }</span><button onClick={resetIconSnapshot}>{text('重新复制当前全局图标', 'Copy Current Global Icons Again') }</button></div>
      </section>

      {view === 'settings' && <aside className="axis-rhythm-layer-panel">
        <div className="axis-layer-panel-head"><div><strong>{text('图层', 'Layers') }</strong><span>{text('从上到下为显示顺序，拖动直接换层', 'Display order runs from top to bottom; drag to reorder') }</span></div><Layers size={18} /></div>
        {assetMessage && <div className="axis-asset-message">{assetMessage}</div>}
        <div className="axis-layer-actions"><button onClick={addImageLayer}><Plus size={16} />{text('图片层', 'Image Layer') }</button><button onClick={addAudioLayer}><Mic2 size={16} />{text('音频层', 'Audio Layer') }</button><button onClick={addFeedbackLayer}><Eye size={16} />{text('反馈层', 'Feedback Layer') }</button><button onClick={resetLayout}><RotateCcw size={16} />{text('重置', 'Reset') }</button></div>
        <div className="axis-layer-strip">
          {layout.layerOrder.map((layerId, index) => {
            const layer = layout.layers.find((item) => item.id === layerId);
            const systemName = axisSystemLayerName(layerId);
            const isSystem = Boolean(systemName);
            const isAudio = layer?.kind === 'audio';
            const isFeedback = layer?.kind === 'feedback';
            const isBackground = Boolean(layer && isBackgroundLayer(layer.id, layout.layerOrder));
            return <button key={layerId} data-axis-layer-id={layerId} className={`${layerId === selectedStackId ? 'active' : ''} ${isSystem ? 'system' : ''} ${draggedLayerId === layerId ? 'dragging' : ''}`} onClick={() => selectLayer(layerId)} onPointerDown={(event) => beginLayerOrderDrag(event, layerId)} onPointerMove={moveLayerOrderDrag} onPointerUp={endLayerOrderDrag} onPointerCancel={endLayerOrderDrag}>
              <GripVertical size={15} className="axis-layer-grip" />
              <span>{index + 1}</span>
              {layerId === AXIS_SYSTEM_NOTES_LAYER_ID ? <ArrowDown size={15} /> : layerId === AXIS_SYSTEM_AVATARS_LAYER_ID ? <UserRound size={15} /> : isAudio ? <Mic2 size={15} /> : isFeedback ? <Eye size={15} /> : <ImageIcon size={15} />}
              <b>{systemName === '下落图标' ? text('下落图标', 'Falling Icons') : systemName === '角色头像' ? text('角色头像', 'Character Avatars') : layer ? displayLayerName(layer.name) : text('图层', 'Layer')}</b>
              <em>{isSystem ? text('系统', 'System') : isAudio ? text('音频', 'Audio') : isFeedback ? text(`反馈${layer?.feedbackSlot ?? 1}`, `Feedback ${layer?.feedbackSlot ?? 1}`) : isBackground ? text('背景', 'Background') : text('图片', 'Image')}</em>
            </button>;
          })}
        </div>
        {selectedLayer && <div className="axis-layer-inspector">
          <label>{text('名称', 'Name') }<input value={displayLayerName(selectedLayer.name)} onChange={(event) => updateLayer(selectedLayer.id, { name: event.target.value })} /></label>
          <label className="axis-layer-file-picker"><Upload size={16} />{selectedLayer.kind === 'audio' ? text('上传律动图片', 'Upload Reactive Image') : selectedLayer.kind === 'feedback' ? text('上传反馈图片', 'Upload Feedback Image') : text('上传图片', 'Upload Image')}<input type="file" accept="image/*" onChange={(event) => void pickImageForLayer(selectedLayer.id, event.target.files?.[0] ?? null)} /></label>
          {selectedLayer.kind === 'audio' && <div className="axis-layer-audio-note"><Mic2 size={15} /><span>{text('捕捉到系统音频后，该图层按音量沿 Y 轴向上律动。', 'When system audio is captured, this layer moves upward on the Y axis with the volume.') }</span></div>}
          {selectedLayer.kind === 'feedback' && <div className="axis-feedback-settings">
            <label>{text('响应角色', 'Target Character') }<select value={selectedLayer.feedbackSlot ?? 1} onChange={(event) => updateLayer(selectedLayer.id, { feedbackSlot: Number(event.target.value) as CharacterSlot })}>{CHARACTER_SLOTS.map((slot) => <option key={slot} value={slot}>{text(`角色 ${slot}`, `Character ${slot}`)}</option>)}</select></label>
            <label>{text('响应方式', 'Response Mode') }<select value={selectedLayer.feedbackMode ?? 'show'} onChange={(event) => updateLayer(selectedLayer.id, { feedbackMode: event.target.value as AxisFeedbackMode })}><option value="show">{text('输入时出现', 'Show on Input') }</option><option value="hide">{text('输入时消失', 'Hide on Input') }</option></select></label>
            <NumberField label={text('响应时长 ms', 'Response Duration ms') } value={selectedLayer.feedbackDurationMs ?? 420} min={80} max={5000} onCommit={(value) => updateLayer(selectedLayer.id, { feedbackDurationMs: value })} />
            <div className="axis-layer-audio-note">{selectedLayer.feedbackMode === 'hide' ? <EyeOff size={15} /> : <Eye size={15} />}<span>{text('切换到对应角色后，任意非切人输入会触发该图片。', 'After switching to the selected character, any non-switch input triggers this image.') }</span></div>
          </div>}
          <div className="axis-layer-transform-grid">
            <NumberField label="X%" value={Math.round(selectedLayer.transform.x * 10) / 10} onCommit={(value) => updateSelectedTransform({ x: value })} />
            <NumberField label="Y%" value={Math.round(selectedLayer.transform.y * 10) / 10} onCommit={(value) => updateSelectedTransform({ y: value })} />
            <NumberField label={text('宽%', 'Width %') } value={Math.round(selectedLayer.transform.width * 10) / 10} min={1} max={400} onCommit={(value) => updateSelectedTransform({ width: value })} />
            <NumberField label={text('高%', 'Height %') } value={Math.round(selectedLayer.transform.height * 10) / 10} min={1} max={400} onCommit={(value) => updateSelectedTransform({ height: value })} />
            <NumberField label={text('透明%', 'Opacity %') } value={Math.round(selectedLayer.transform.opacity * 100)} min={0} max={100} onCommit={(value) => updateSelectedTransform({ opacity: value / 100 })} />
            <NumberField label={text('旋转', 'Rotation') } value={Math.round(selectedLayer.transform.rotate)} onCommit={(value) => updateSelectedTransform({ rotate: value })} />
            {selectedLayer.kind === 'audio' && <NumberField label={text('律动幅度%', 'Reactive Range %') } value={Math.round(selectedLayer.audioAmplitude * 10) / 10} min={0} max={100} onCommit={(value) => updateLayer(selectedLayer.id, { audioAmplitude: clamp(value, 0, 100) })} />}
          </div>
          <button className="danger" onClick={deleteSelectedLayer}><Trash2 size={16} />{text('删除图层', 'Delete Layer') }</button>
        </div>}
        {!selectedLayer && selectedStackId === AXIS_SYSTEM_AVATARS_LAYER_ID && <div className="axis-layer-inspector"><div className="axis-layer-system-note"><strong>{text('角色头像', 'Character Avatars') }</strong><span>{text('调整三名角色头像整体在舞台中的位置、大小与间距。', 'Adjust the position, size, and spacing of all three character avatars on the stage.') }</span></div><div className="axis-layer-transform-grid"><NumberField label="X%" value={layout.avatars.x} onCommit={(value) => updateAvatars({ x: value })} /><NumberField label="Y%" value={layout.avatars.y} onCommit={(value) => updateAvatars({ y: value })} /><NumberField label={text('宽%', 'Width %') } value={layout.avatars.width} min={1} max={300} onCommit={(value) => updateAvatars({ width: value })} /><NumberField label={text('高%', 'Height %') } value={layout.avatars.height} min={1} max={200} onCommit={(value) => updateAvatars({ height: value })} /><NumberField label={text('间距%', 'Gap %') } value={layout.avatars.gap} min={0} max={50} onCommit={(value) => updateAvatars({ gap: value })} /></div></div>}
        {!selectedLayer && selectedStackId && selectedStackId !== AXIS_SYSTEM_AVATARS_LAYER_ID && <div className="axis-layer-system-note"><strong>{axisSystemLayerName(selectedStackId) === '下落图标' ? text('下落图标', 'Falling Icons') : axisSystemLayerName(selectedStackId)}</strong><span>{text('系统运行时图层，可拖动调整上下关系，但不能删除或修改内容。', 'Runtime system layer. It can be reordered, but its content cannot be edited or deleted.') }</span></div>}
        <div className="axis-geometry-panel">
          <div className="axis-geometry-head"><strong>{text('轨道与判定', 'Lanes & Judgement') }</strong><span>{text('每条轨道由起点指向判定点，可自由改变方向。', 'Each lane runs from its start to its judgement point and can face any direction.') }</span></div>
          {CHARACTER_SLOTS.map((slot) => <details key={slot} className="axis-lane-geometry" open={slot === 1}>
            <summary><span>{slot}</span><b>{text(`轨道 ${slot}`, `Lane ${slot}`) }</b></summary>
            <div className="axis-layer-transform-grid">
              <NumberField label={text('起点 X%', 'Start X%') } value={Math.round(layout.lanes[slot].startX * 10) / 10} min={-100} max={200} onCommit={(value) => updateLane(slot, { startX: value })} />
              <NumberField label={text('起点 Y%', 'Start Y%') } value={Math.round(layout.lanes[slot].startY * 10) / 10} min={-100} max={200} onCommit={(value) => updateLane(slot, { startY: value })} />
              <NumberField label={text('判定点 X%', 'Judge X%') } value={Math.round(layout.lanes[slot].endX * 10) / 10} min={-100} max={200} onCommit={(value) => updateLane(slot, { endX: value })} />
              <NumberField label={text('判定点 Y%', 'Judge Y%') } value={Math.round(layout.lanes[slot].endY * 10) / 10} min={-100} max={200} onCommit={(value) => updateLane(slot, { endY: value })} />
            </div>
          </details>)}
          <details className="axis-lane-geometry axis-judge-geometry" open>
            <summary><b>{text('判定区', 'Judgement Zone') }</b></summary>
            <div className="axis-layer-transform-grid">
              <NumberField label="X%" value={Math.round(layout.judgeZone.x * 10) / 10} min={-100} max={200} onCommit={(value) => updateJudgeZone({ x: value })} />
              <NumberField label="Y%" value={Math.round(layout.judgeZone.y * 10) / 10} min={-100} max={200} onCommit={(value) => updateJudgeZone({ y: value })} />
              <NumberField label={text('宽%', 'Width %') } value={Math.round(layout.judgeZone.width * 10) / 10} min={1} max={300} onCommit={(value) => updateJudgeZone({ width: value })} />
              <NumberField label={text('高%', 'Height %') } value={Math.round(layout.judgeZone.height * 10) / 10} min={1} max={200} onCommit={(value) => updateJudgeZone({ height: value })} />
            </div>
          </details>
        </div>
      </aside>}
    </div>
  </div>;
}

function EditFrame({ onBeginTransformDrag }: { onBeginTransformDrag: (event: ReactPointerEvent<HTMLElement>, kind: 'move' | 'resize', edge?: string) => void }) {
  return <div className="axis-layer-edit-frame" onPointerDown={(event) => onBeginTransformDrag(event, 'move')}>{PREVIEW_HANDLES.map((edge) => <i key={edge} className={`axis-layer-edit-handle ${edge}`} onPointerDown={(event) => onBeginTransformDrag(event, 'resize', edge)} />)}</div>;
}

function NumberField({ label, value, min, max, onCommit }: { label: string; value: number; min?: number; max?: number; onCommit: (value: number) => void }) {
  return <label>{label}<NumericDraftInput value={value} min={min} max={max} onCommit={onCommit} /></label>;
}
