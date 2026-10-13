import { DEFAULT_BINDINGS } from '../combo-core/defaults';
import type { ComboChart, KeyBinding } from '../combo-core/types';
import { buildSimulatedInputEvents, DEFAULT_SIMULATED_KEY_FREQUENCY_MS } from './simulatedInput';
import type { SimulatedInputEvent } from './simulatedInput';

const REPLAY_CODES = new Set([
  'MouseLeft', 'MouseRight', 'KeyE', 'KeyQ', 'KeyR', 'KeyT',
  'ShiftLeft', 'Space', 'Digit1', 'Digit2', 'Digit3', 'KeyF'
]);

const REPLAY_BINDINGS: KeyBinding[] = [
  ...DEFAULT_BINDINGS.filter((binding) => binding.moveId !== 'empty_action'),
  { moveId: 'empty_action', inputs: [{ code: 'KeyF', label: 'F' }] }
];

export type OkwwReplayEvent = Pick<SimulatedInputEvent, 'atMs' | 'type' | 'code'>;
export type OkwwReplayCheckpoint = {
  atMs: number;
  when: 'pre' | 'post';
  probe: string;
  slot: number;
  behavior: string;
  timeoutMs: number;
  failure: string;
  whileWaiting: string;
  inputCode: string;
  endMs: number;
  nextSwitchMs: number;
  maxRetries: number;
  failureTargetMs: number;
};
export type OkwwReplayPlan = {
  events: OkwwReplayEvent[];
  loopStartMs: number;
  totalMs: number;
  skipped: number;
  keyFrequencyMs: number;
  minSwitchHoldMs: number;
};

export function buildOkwwReplayPlan(chart: ComboChart, keyFrequencyMs = DEFAULT_SIMULATED_KEY_FREQUENCY_MS, minSwitchHoldMs = 0): OkwwReplayPlan {
  const replayChart = {
    ...chart,
    steps: chart.steps.filter((step) => step.moveId !== 'empty_action' ||
      /^f$/i.test(chart.contentLabels?.[step.id]?.trim() ?? ''))
  };
  const frequency = Math.max(50, Math.min(5000, Math.round(keyFrequencyMs) || DEFAULT_SIMULATED_KEY_FREQUENCY_MS));
  const switchHold = Math.max(0, Math.min(2000, Math.round(minSwitchHoldMs) || 0));
  const result = buildSimulatedInputEvents(replayChart, REPLAY_BINDINGS, {
    startDelayMs: 0,
    globalDelayMs: 0,
    mouseOffsetPx: 0,
    keyFrequencyMs: frequency,
    holdDurationMs: 0
  }, () => 0.5, { minSwitchHoldMs: switchHold });
  const events = result.events.filter((event): event is OkwwReplayEvent => REPLAY_CODES.has(event.code))
    .map(({ atMs, type, code }) => ({ atMs, type, code }));
  const loopStartMs = Math.min(Infinity, ...(chart.periods ?? []).filter((period) => period.kind === 'loop_axis').map((period) => period.startMs));
  const endMs = Math.max(0, ...events.map((event) => event.atMs), ...(chart.periods ?? []).filter((period) => period.kind === 'startup_axis' || period.kind === 'loop_axis').map((period) => period.endMs));
  return {
    events,
    loopStartMs: Number.isFinite(loopStartMs) ? loopStartMs : 0,
    totalMs: endMs,
    skipped: result.skipped + result.events.length - events.length,
    keyFrequencyMs: frequency,
    minSwitchHoldMs: switchHold
  };
}
