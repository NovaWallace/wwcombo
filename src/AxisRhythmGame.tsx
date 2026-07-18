import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Mic2, Music2, Play, Square } from 'lucide-react';
import type { CharacterSlot, ComboChart, ComboIconMapping, ComboImageStyle, ComboStep, KeyBinding, MoveDefinition, TrainerInputEvent } from '../combo-core';
import { normalizeInputCode, resolveActivation } from '../combo-core/input';
import { comboTextParts, effectiveIconMappings, maybeConvertTextToIconLabel, normalizeComboIconMappings } from './combo-image/comboImage';

export type AxisRhythmInputSignal = TrainerInputEvent & { id: string };

type AxisRhythmStatus = 'idle' | 'countdown' | 'running' | 'paused' | 'finished';
type AxisRhythmJudgement = 'perfect' | 'great' | 'good' | 'miss';
type AxisRhythmFeedback = { id: string; label: string; judgement: AxisRhythmJudgement; slot: CharacterSlot; createdAt: number };
type AxisRhythmSettings = { speed: number; perfectMs: number; greatMs: number; goodMs: number };
type AudioMeterState = { active: boolean; level: number; error?: string };

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

  const orderedSteps = useMemo(() => [...(chart?.steps ?? [])].sort((left, right) => left.startMin - right.startMin || (left.characterSlot ?? 1) - (right.characterSlot ?? 1) || left.id.localeCompare(right.id)), [chart]);
  const chartEndMs = Math.max(3000, ...(chart?.steps ?? []).map((step) => step.startMin + step.durationMax + 900));
  const elapsedMs = status === 'running' && startedAt !== null ? Math.max(0, clockNow - startedAt) : pausedElapsed;
  const activeSlot = activeCharacterSlot(orderedSteps, elapsedMs);
  const matchedSet = new Set(matchedIds);
  const missedSet = new Set(missedIds);
  const visibleSteps = orderedSteps.filter((step) => {
    const distance = step.startMin - elapsedMs;
    return distance >= -420 && distance <= 2300;
  });

  useEffect(() => {
    localStorage.setItem(iconStorageKey, JSON.stringify(iconMappings));
  }, [iconMappings, iconStorageKey]);

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

  if (!chart) return <div className="axis-rhythm-empty"><Music2 size={44} /><strong>暂无连段谱</strong><span>先在右侧读取或选择一个连段谱，再进入节奏合轴。</span></div>;

  return <div className="axis-rhythm-shell">
    <div className="axis-rhythm-topbar">
      <div><strong>{chart.title || '未命名连段谱'}</strong><span>{status === 'countdown' ? '倒计时' : status === 'running' ? '播放中' : status === 'paused' ? '已暂停' : status === 'finished' ? '已结束' : '待开始'}</span></div>
      <div className="axis-rhythm-actions"><button className="primary" onClick={startGame}><Play size={16} />F 启动</button><button onClick={pauseGame} disabled={status !== 'running' && status !== 'paused'}><Square size={16} />Esc 暂停</button><button onClick={() => void startMeter()}><Mic2 size={16} />音频捕捉</button></div>
    </div>
    <div className="axis-rhythm-stage">
      <div className="axis-rhythm-bg" />
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
  </div>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
