import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { Image as ImageIcon, Layers, Mic2, Music2, Play, Plus, RotateCcw, Square, Trash2, Upload } from 'lucide-react';
import type { CharacterSlot, ComboChart, ComboIconMapping, ComboImageStyle, ComboStep, KeyBinding, MoveDefinition, TrainerInputEvent } from '../combo-core';
import { normalizeInputCode, resolveActivation } from '../combo-core/input';
import { comboTextParts, effectiveIconMappings, maybeConvertTextToIconLabel, normalizeComboIconMappings } from './combo-image/comboImage';
import { assetUrl } from './keyMappingTypes';

export type AxisRhythmInputSignal = TrainerInputEvent & { id: string };

type AxisRhythmStatus = 'idle' | 'countdown' | 'running' | 'paused' | 'finished';
type AxisRhythmJudgement = 'perfect' | 'great' | 'good' | 'miss';
type AxisRhythmFeedback = { id: string; label: string; judgement: AxisRhythmJudgement; slot: CharacterSlot; createdAt: number };
type AxisRhythmSettings = { speed: number; perfectMs: number; greatMs: number; goodMs: number };
type AudioMeterState = { active: boolean; level: number; error?: string };
type AxisLayerTransform = { x: number; y: number; width: number; height: number; opacity: number; rotate: number };
type AxisRhythmLayer = { id: string; name: string; src?: string; transform: AxisLayerTransform };
type AxisRhythmLayout = { layers: AxisRhythmLayer[]; selectedLayerId?: string };
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
  style: ComboImageStyle;
  moves: MoveDefinition[];
  bindings: KeyBinding[];
  inputSignal: AxisRhythmInputSignal | null;
  iconStorageKey: string;
};

const CHARACTER_SLOTS: CharacterSlot[] = [1, 2, 3];
const DEFAULT_SETTINGS: AxisRhythmSettings = { speed: 0.42, perfectMs: 70, greatMs: 135, goodMs: 240 };
const COUNTDOWN_MS = 3200;
const INPUT_DEDUPE_MS = 90;
const AXIS_LAYOUT_STORAGE_KEY = 'ww-combo-axis-rhythm-layout-v1';
const DEFAULT_LAYER_TRANSFORM: AxisLayerTransform = { x: 0, y: 0, width: 100, height: 100, opacity: 1, rotate: 0 };
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

function normalizeAxisLayer(value: unknown, index: number): AxisRhythmLayer | null {
  const record = value as Partial<AxisRhythmLayer> | null;
  if (!record || typeof record !== 'object') return null;
  return {
    id: typeof record.id === 'string' && record.id ? record.id : crypto.randomUUID(),
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : `图层 ${index + 1}`,
    src: typeof record.src === 'string' ? record.src : undefined,
    transform: normalizeAxisLayerTransform(record.transform)
  };
}

function normalizeAxisLayout(value: unknown): AxisRhythmLayout {
  const record = value as Partial<AxisRhythmLayout> | null;
  const layers = Array.isArray(record?.layers)
    ? record.layers.map(normalizeAxisLayer).filter((item): item is AxisRhythmLayer => Boolean(item))
    : [];
  const selectedLayerId = layers.some((layer) => layer.id === record?.selectedLayerId) ? record?.selectedLayerId : layers[0]?.id;
  return { layers, selectedLayerId };
}

function loadAxisLayout(): AxisRhythmLayout {
  try {
    const raw = localStorage.getItem(AXIS_LAYOUT_STORAGE_KEY);
    return raw ? normalizeAxisLayout(JSON.parse(raw)) : { layers: [] };
  } catch {
    return { layers: [] };
  }
}

function createImageLayer(name = '图片图层'): AxisRhythmLayer {
  return { id: crypto.randomUUID(), name, src: undefined, transform: { ...DEFAULT_LAYER_TRANSFORM } };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

function layerTransformStyle(transform: AxisLayerTransform): CSSProperties {
  return {
    left: `${transform.x}%`,
    top: `${transform.y}%`,
    width: `${transform.width}%`,
    height: `${transform.height}%`,
    opacity: transform.opacity,
    transform: `rotate(${transform.rotate}deg)`
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

function lanePerspectiveVars(slot: CharacterSlot): CSSProperties {
  const index = slot - 1;
  const bottomX = [20, 50, 80][index];
  const topX = [42, 50, 58][index];
  return {
    '--lane-bottom-x': `${bottomX}%`,
    '--lane-top-x': `${topX}%`,
    '--lane-index': index
  } as CSSProperties;
}

function notePerspectiveVars(slot: CharacterSlot, progress: number, width = 92): CSSProperties {
  const index = slot - 1;
  const bottomX = [20, 50, 80][index];
  const topX = [42, 50, 58][index];
  const bottomY = 91;
  const topY = 10;
  const x = bottomX + (topX - bottomX) * progress;
  const y = bottomY + (topY - bottomY) * progress;
  const scale = 1.18 - progress * 0.68;
  return {
    left: `${x}%`,
    top: `${y}%`,
    width: `${width}px`,
    '--axis-note-scale': scale,
    '--axis-note-skew': `${(index - 1) * (4 + progress * 5)}deg`
  } as CSSProperties;
}

function AxisInlineContent({ step, style, mappings }: { step: ComboStep; style: ComboImageStyle; mappings: ComboIconMapping[] }) {
  const contentText = style.contentLabels[step.id]?.trim() || displayMoveLabel(step);
  const iconText = maybeConvertTextToIconLabel(contentText, style.convertIcons);
  const parts = comboTextParts(iconText, style.convertIcons, mappings);
  return <strong className="axis-note-content">{parts.map((part, index) => part.kind === 'icon' ? <span key={`${part.iconId}-${index}`} className="axis-icon-mark"><img src={part.src} alt={part.label} title={part.label} /></span> : <span key={`text-${index}`}>{part.value}</span>)}</strong>;
}

function useAudioMeter(): [AudioMeterState, () => Promise<void>] {
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
      setMeter({ active: false, level: 0, error: error instanceof Error ? error.message : '无法捕捉系统音频' });
    }
  }

  return [meter, start];
}

export function AxisRhythmGame({ chart, style, moves, bindings, inputSignal, iconStorageKey }: Props) {
  const [iconMappings, setIconMappings] = useState<ComboIconMapping[]>(() => loadAxisMappings(iconStorageKey, style));
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
  const [meter, startMeter] = useAudioMeter();
  const settings = DEFAULT_SETTINGS;
  const lastInputRef = useRef(new Map<string, number>());
  const transformDragRef = useRef<TransformDrag | null>(null);

  const orderedSteps = useMemo(() => [...(chart?.steps ?? [])].sort((left, right) => left.startMin - right.startMin || (left.characterSlot ?? 1) - (right.characterSlot ?? 1) || left.id.localeCompare(right.id)), [chart]);
  const chartEndMs = Math.max(3000, ...(chart?.steps ?? []).map((step) => step.startMin + step.durationMax + 900));
  const elapsedMs = status === 'running' && startedAt !== null ? Math.max(0, clockNow - startedAt) : pausedElapsed;
  const activeSlot = activeCharacterSlot(orderedSteps, elapsedMs);
  const matchedSet = new Set(matchedIds);
  const missedSet = new Set(missedIds);
  const selectedLayer = layout.layers.find((layer) => layer.id === layout.selectedLayerId) ?? layout.layers[0] ?? null;
  const visibleSteps = orderedSteps.filter((step) => {
    const distance = step.startMin - elapsedMs;
    return distance >= -420 && distance <= 2300;
  });

  useEffect(() => {
    localStorage.setItem(iconStorageKey, JSON.stringify(iconMappings));
  }, [iconMappings, iconStorageKey]);

  useEffect(() => {
    localStorage.setItem(AXIS_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

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
    if (status !== 'running' || (inputSignal.type !== 'keydown' && inputSignal.type !== 'mousedown')) return;
    const code = normalizeInputCode(inputSignal.code);
    const last = lastInputRef.current.get(code);
    if (last !== undefined && Math.abs(inputSignal.time - last) < INPUT_DEDUPE_MS) return;
    lastInputRef.current.set(code, inputSignal.time);
    const activation = resolveActivation(inputSignal, moves, bindings);
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
  }, [inputSignal?.id]);

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

  function addImageLayer() {
    const layer = createImageLayer();
    patchLayout((current) => ({ ...current, layers: [layer, ...current.layers], selectedLayerId: layer.id }));
  }

  async function pickImageForLayer(layerId: string, file: File | null) {
    if (!file) return;
    const src = await readFileAsDataUrl(file);
    updateLayer(layerId, { src });
  }

  function deleteSelectedLayer() {
    if (!selectedLayer) return;
    patchLayout((current) => {
      const layers = current.layers.filter((layer) => layer.id !== selectedLayer.id);
      return { layers, selectedLayerId: layers[0]?.id };
    });
  }

  function resetLayout() {
    setLayout({ layers: [] });
  }

  function selectLayer(layerId: string) {
    patchLayout((current) => ({ ...current, selectedLayerId: layerId }));
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
    setCombo(0);
    setPausedElapsed(0);
    setStartedAt(null);
    setCountdownStartedAt(performance.now());
    setStatus('countdown');
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
  const statusLabel = status === 'countdown' ? '倒计时' : status === 'running' ? '进行中' : status === 'paused' ? '已暂停' : status === 'finished' ? '已结束' : '待开始';

  if (!chart) return <div className="axis-rhythm-empty"><Music2 size={44} /><strong>暂无连段谱</strong><span>先在右侧读取或选择一个连段谱，再进入节奏合轴。</span></div>;

  return <div className="axis-rhythm-shell">
    <div className="axis-rhythm-topbar">
      <div><strong>{chart.title || '未命名连段谱'}</strong><span>{statusLabel}</span></div>
      <div className="axis-rhythm-actions"><button className="primary" onClick={startGame}><Play size={16} />F 启动</button><button onClick={pauseGame} disabled={status !== 'running' && status !== 'paused'}><Square size={16} />Esc 暂停</button><button onClick={() => void startMeter()}><Mic2 size={16} />音频捕捉</button></div>
    </div>

    <div className="axis-rhythm-workbench">
      <section className="axis-rhythm-stage-card">
        <div className="axis-rhythm-stage">
          <div className="axis-rhythm-bg" />
          <div className="axis-rhythm-design-layer-plane">
            {layout.layers.map((layer, index) => (
              <div
                key={layer.id}
                className={`axis-rhythm-design-layer ${layer.id === selectedLayer?.id ? 'selected' : ''}`}
                style={{ ...layerTransformStyle(layer.transform), zIndex: layout.layers.length - index }}
                onPointerDown={(event) => { selectLayer(layer.id); beginLayerTransformDrag(event, layer.id, 'move'); }}
              >
                {layer.src ? <img src={assetUrl(layer.src)} alt="" /> : <div className="axis-rhythm-layer-placeholder"><ImageIcon size={22} />上传图片</div>}
                {layer.id === selectedLayer?.id && <EditFrame onBeginTransformDrag={(event, kind, edge) => beginLayerTransformDrag(event, layer.id, kind, edge)} />}
              </div>
            ))}
          </div>
          <div className="axis-rhythm-score"><b>{scoreText}</b><span>{combo} COMBO</span></div>
          <div className="axis-rhythm-highway">
            <div className="axis-rhythm-grid" />
            {CHARACTER_SLOTS.map((slot) => <div key={slot} className={`axis-lane-line ${activeSlot === slot ? 'active' : ''}`} style={lanePerspectiveVars(slot)} />)}
            {CHARACTER_SLOTS.map((slot) => <div key={`audio-${slot}`} className={`axis-audio-strip ${activeSlot === slot ? 'active' : ''}`} style={{ ...lanePerspectiveVars(slot), '--audio-level': activeSlot === slot ? meter.level : 0.12 } as CSSProperties} />)}
            {visibleSteps.map((step) => {
              const slot = (step.characterSlot ?? 1) as CharacterSlot;
              const progress = clamp((step.startMin - elapsedMs) / 2300, 0, 1);
              const state = matchedSet.has(step.id) ? 'matched' : missedSet.has(step.id) ? 'missed' : Math.abs(elapsedMs - step.startMin) <= settings.goodMs ? 'hot' : '';
              return <div key={step.id} className={`axis-note ${state}`} style={notePerspectiveVars(slot, progress)}><AxisInlineContent step={step} style={style} mappings={iconMappings} /></div>;
            })}
            <div className="axis-judge-zone" />
            <div className="axis-avatar-row">
              {CHARACTER_SLOTS.map((slot) => {
                const role = style.roleStyles[slot];
                return <div key={slot} className={`axis-avatar-card ${activeSlot === slot ? 'active' : ''}`}><span style={role.avatar ? { backgroundImage: `url(${role.avatar})` } : undefined}>{role.avatar ? null : slot}</span><b>{role.name || `角色${slot}`}</b></div>;
              })}
            </div>
            {countdownValue && <div className="axis-countdown">{countdownValue}</div>}
            {feedback.slice(0, 3).map((item, index) => <div key={item.id} className={`axis-feedback ${item.judgement}`} style={{ left: `${[23, 50, 77][item.slot - 1]}%`, bottom: `${110 + index * 30}px` }}>{item.label}</div>)}
          </div>
          <div className="axis-rhythm-footer"><span>{(elapsedMs / 1000).toFixed(2)}s / {(chartEndMs / 1000).toFixed(1)}s</span><span>{meter.active ? `音频 ${Math.round(meter.level * 100)}%` : meter.error ? `音频未启用：${meter.error}` : '音频捕捉未启用'}</span></div>
        </div>
        <div className="axis-rhythm-icon-note"><span>图标映射已从全局复制为“节奏合轴”独立副本；之后全局图标修改不会自动覆盖本模式。</span><button onClick={resetIconSnapshot}>重新复制当前全局图标</button></div>
      </section>

      <aside className="axis-rhythm-layer-panel">
        <div className="axis-layer-panel-head"><div><strong>图层</strong><span>{layout.layers.length ? '左侧预览中拖动调整位置和大小' : '先添加图片层'}</span></div><Layers size={18} /></div>
        <div className="axis-layer-actions"><button onClick={addImageLayer}><Plus size={16} />图片层</button><button onClick={resetLayout}><RotateCcw size={16} />重置</button></div>
        <div className="axis-layer-strip">
          {layout.layers.map((layer, index) => <button key={layer.id} className={layer.id === selectedLayer?.id ? 'active' : ''} onClick={() => selectLayer(layer.id)}><span>{index + 1}</span><ImageIcon size={15} /><b>{layer.name}</b></button>)}
          {!layout.layers.length && <div className="axis-layer-empty">添加图片层后，可上传底图、判定线装饰、轨道遮罩或 HUD 素材。</div>}
        </div>
        {selectedLayer && <div className="axis-layer-inspector">
          <label>名称<input value={selectedLayer.name} onChange={(event) => updateLayer(selectedLayer.id, { name: event.target.value })} /></label>
          <label className="axis-layer-file-picker"><Upload size={16} />上传图片<input type="file" accept="image/*" onChange={(event) => void pickImageForLayer(selectedLayer.id, event.target.files?.[0] ?? null)} /></label>
          <div className="axis-layer-transform-grid">
            <NumberField label="X%" value={Math.round(selectedLayer.transform.x * 10) / 10} onCommit={(value) => updateSelectedTransform({ x: value })} />
            <NumberField label="Y%" value={Math.round(selectedLayer.transform.y * 10) / 10} onCommit={(value) => updateSelectedTransform({ y: value })} />
            <NumberField label="宽%" value={Math.round(selectedLayer.transform.width * 10) / 10} min={1} max={400} onCommit={(value) => updateSelectedTransform({ width: value })} />
            <NumberField label="高%" value={Math.round(selectedLayer.transform.height * 10) / 10} min={1} max={400} onCommit={(value) => updateSelectedTransform({ height: value })} />
            <NumberField label="透明%" value={Math.round(selectedLayer.transform.opacity * 100)} min={0} max={100} onCommit={(value) => updateSelectedTransform({ opacity: value / 100 })} />
            <NumberField label="旋转" value={Math.round(selectedLayer.transform.rotate)} onCommit={(value) => updateSelectedTransform({ rotate: value })} />
          </div>
          <button className="danger" onClick={deleteSelectedLayer}><Trash2 size={16} />删除图层</button>
        </div>}
      </aside>
    </div>
  </div>;
}

function EditFrame({ onBeginTransformDrag }: { onBeginTransformDrag: (event: ReactPointerEvent<HTMLElement>, kind: 'move' | 'resize', edge?: string) => void }) {
  return <div className="axis-layer-edit-frame" onPointerDown={(event) => onBeginTransformDrag(event, 'move')}>{PREVIEW_HANDLES.map((edge) => <i key={edge} className={`axis-layer-edit-handle ${edge}`} onPointerDown={(event) => onBeginTransformDrag(event, 'resize', edge)} />)}</div>;
}

function NumberField({ label, value, min, max, onCommit }: { label: string; value: number; min?: number; max?: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    let next = Number(draft);
    if (!Number.isFinite(next)) next = value;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    onCommit(next);
  };
  return <label>{label}<input inputMode="numeric" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}
