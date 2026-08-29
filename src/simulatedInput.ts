import type { ComboChart, KeyBinding } from '../combo-core';
import { normalizeInputCode } from '../combo-core/input';

export type SimulatedInputEvent = {
  atMs: number;
  type: 'keydown' | 'keyup' | 'mousedown' | 'mouseup';
  code: string;
  cursorDx?: number;
  cursorDy?: number;
};

export type SimulatedInputSettings = {
  startDelayMs: number;
  globalDelayMs: number;
  mouseOffsetPx: number;
  keyFrequencyMs: number;
  holdDurationMs: number;
};

type DraftSimulatedInputEvent = SimulatedInputEvent & { order: number };
type RandomSource = () => number;
type SimulationBinding = { parts: string[]; hold: boolean };
type ClickWindow = {
  signature: string;
  parts: string[];
  startMs: number;
  endMs: number;
};
type SwitchWindow = ClickWindow & { moveId: string };

export const DEFAULT_SIMULATED_KEY_FREQUENCY_MS = 100;
const MIN_SIMULATED_KEY_FREQUENCY_MS = 50;
const MIN_SIMULATED_SWITCH_HOLD_MS = 2_000;

function randomInt(random: RandomSource, min: number, max: number): number {
  const sample = random();
  const normalized = Number.isFinite(sample) ? Math.min(1, Math.max(0, sample)) : 0.5;
  return Math.round(min + normalized * (max - min));
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function isGamepadCode(code: string): boolean {
  return /^Gamepad/u.test(code);
}

function isMouseCode(code: string): boolean {
  return /^Mouse(?:Left|Right|Middle|\d+)$/u.test(code);
}

function stripHoldSuffix(code: string): string {
  return code.replace(/Hold$/u, '');
}

function simulationBinding(bindings: KeyBinding[], moveId: string): SimulationBinding | null {
  const binding = bindings.find((item) => item.moveId === moveId);
  for (const input of binding?.inputs ?? []) {
    const normalized = normalizeInputCode(input.code);
    const rawParts = normalized.split('+').map((part) => part.trim()).filter(Boolean);
    if (!rawParts.length || rawParts.some(isGamepadCode)) continue;
    const parts = rawParts.map(stripHoldSuffix).filter(Boolean);
    if (parts.length) return { parts, hold: rawParts.some((part) => /Hold$/u.test(part)) };
  }
  return null;
}

function eventRank(type: SimulatedInputEvent['type']): number {
  return type === 'keyup' || type === 'mouseup' ? 0 : 1;
}

function inputOffset(parts: string[], settings: SimulatedInputSettings, random: RandomSource): Pick<SimulatedInputEvent, 'cursorDx' | 'cursorDy'> | undefined {
  if (!parts.some(isMouseCode)) return undefined;
  const radius = Math.round(finiteNonNegative(settings.mouseOffsetPx));
  return {
    cursorDx: randomInt(random, -radius, radius),
    cursorDy: randomInt(random, -radius, radius)
  };
}

function appendInputPulse(
  drafts: DraftSimulatedInputEvent[],
  parts: string[],
  startMs: number,
  endMs: number,
  mouseOffset: Pick<SimulatedInputEvent, 'cursorDx' | 'cursorDy'> | undefined,
  nextOrder: () => number
): void {
  parts.forEach((part) => {
    drafts.push({
      atMs: startMs,
      type: isMouseCode(part) ? 'mousedown' : 'keydown',
      code: part,
      ...(isMouseCode(part) ? mouseOffset : {}),
      order: nextOrder()
    });
  });
  [...parts].reverse().forEach((part) => {
    drafts.push({
      atMs: endMs,
      type: isMouseCode(part) ? 'mouseup' : 'keyup',
      code: part,
      ...(isMouseCode(part) ? mouseOffset : {}),
      order: nextOrder()
    });
  });
}

function canExtendClickWindow(window: ClickWindow | null, signature: string, startMs: number): window is ClickWindow {
  return window !== null && window.signature === signature && startMs <= window.endMs;
}

function isSwitchMove(moveId: string): boolean {
  return /^switch_[1-4]$/u.test(moveId);
}

export function buildSimulatedInputEvents(
  chart: ComboChart,
  bindings: KeyBinding[],
  settings: SimulatedInputSettings,
  random: RandomSource = Math.random
): { events: SimulatedInputEvent[]; skipped: number } {
  const drafts: DraftSimulatedInputEvent[] = [];
  let skipped = 0;
  let order = 0;
  const clickWindows: ClickWindow[] = [];
  const activeClickWindows = new Map<string, ClickWindow>();
  const holdWindows: ClickWindow[] = [];
  const switchWindows: SwitchWindow[] = [];
  let activeSwitchWindow: SwitchWindow | null = null;
  const nextOrder = () => order++;
  const frequencyMs = Math.max(MIN_SIMULATED_KEY_FREQUENCY_MS, Math.round(finiteNonNegative(settings.keyFrequencyMs) || DEFAULT_SIMULATED_KEY_FREQUENCY_MS));
  const tapPressMs = Math.max(16, Math.min(50, Math.floor(frequencyMs * 0.4)));

  const appendClickWindow = (window: ClickWindow) => {
    for (let tapStartMs = window.startMs; tapStartMs < window.endMs; tapStartMs += frequencyMs) {
      const tapEndMs = Math.min(window.endMs, tapStartMs + tapPressMs);
      appendInputPulse(drafts, window.parts, tapStartMs, Math.max(tapStartMs + 1, tapEndMs), inputOffset(window.parts, settings, random), nextOrder);
    }
  };

  const appendAllClickWindows = () => {
    clickWindows.forEach(appendClickWindow);
  };

  const breakActionsAtSwitch = (atMs: number) => {
    activeClickWindows.forEach((window) => {
      if (window.startMs < atMs && window.endMs > atMs) window.endMs = atMs;
    });
    activeClickWindows.clear();
    holdWindows.forEach((window) => {
      if (window.startMs < atMs && window.endMs > atMs) window.endMs = atMs;
    });
  };

  const steps = chart.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.moveId !== 'start_challenge' && step.moveId !== 'stop_recording')
    .sort((left, right) => finiteNonNegative(left.step.startMin) - finiteNonNegative(right.step.startMin)
      || Number(isSwitchMove(right.step.moveId)) - Number(isSwitchMove(left.step.moveId))
      || left.index - right.index);

  for (const [stepIndex, { step }] of steps.entries()) {
    if (step.free) {
      continue;
    }
    const binding = simulationBinding(bindings, step.moveId);
    if (!binding) {
      skipped += 1;
      continue;
    }

    const delayMs = finiteNonNegative(settings.startDelayMs) + stepIndex * finiteNonNegative(settings.globalDelayMs);
    const recordedStartMs = Math.round(finiteNonNegative(step.startMin));
    const recordedDurationMs = Math.max(1, Math.round(finiteNonNegative(step.durationMax)));
    const signature = `${step.moveId}:${binding.parts.join('+')}`;
    const startMs = recordedStartMs + delayMs;
    const endMs = startMs + (binding.hold && finiteNonNegative(settings.holdDurationMs) > 0
      ? Math.max(1, Math.round(settings.holdDurationMs))
      : recordedDurationMs);

    if (isSwitchMove(step.moveId)) {
      breakActionsAtSwitch(startMs);
      const switchEndMs = startMs + Math.max(MIN_SIMULATED_SWITCH_HOLD_MS, recordedDurationMs);
      const currentSwitchWindow = activeSwitchWindow as SwitchWindow | null;
      if (currentSwitchWindow?.moveId === step.moveId && startMs <= currentSwitchWindow.endMs) {
        currentSwitchWindow.endMs = Math.max(currentSwitchWindow.endMs, switchEndMs);
        continue;
      }
      if (currentSwitchWindow && currentSwitchWindow.moveId !== step.moveId && startMs < currentSwitchWindow.endMs) {
        currentSwitchWindow.endMs = Math.max(currentSwitchWindow.startMs + 1, startMs);
      }
      activeSwitchWindow = { signature, moveId: step.moveId, parts: binding.parts, startMs, endMs: switchEndMs };
      switchWindows.push(activeSwitchWindow);
      continue;
    }

    if (binding.hold) {
      holdWindows.push({ signature, parts: binding.parts, startMs, endMs });
      continue;
    }

    const currentClickWindow = activeClickWindows.get(signature) ?? null;
    if (canExtendClickWindow(currentClickWindow, signature, startMs)) {
      currentClickWindow.endMs = Math.max(currentClickWindow.endMs, endMs);
      continue;
    }
    const nextClickWindow = { signature, parts: binding.parts, startMs, endMs };
    clickWindows.push(nextClickWindow);
    activeClickWindows.set(signature, nextClickWindow);
  }
  appendAllClickWindows();
  holdWindows.forEach((window) => {
    if (window.endMs > window.startMs) appendInputPulse(drafts, window.parts, window.startMs, window.endMs, inputOffset(window.parts, settings, random), nextOrder);
  });
  switchWindows.forEach((window) => {
    if (window.endMs > window.startMs) appendInputPulse(drafts, window.parts, window.startMs, window.endMs, inputOffset(window.parts, settings, random), nextOrder);
  });

  drafts.sort((left, right) => left.atMs - right.atMs || eventRank(left.type) - eventRank(right.type) || left.order - right.order);
  return {
    events: drafts.map(({ order: _order, ...event }) => event),
    skipped
  };
}
