import type { ComboChart, ComboStep, PracticeSnapshot } from '../combo-core';

export function noteNumberByStepId(chart: ComboChart | null): Map<string, number> {
  const result = new Map<string, number>();
  if (!chart) return result;
  const steps = chart.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => Boolean(step.note?.trim()))
    .sort((left, right) => left.step.startMin - right.step.startMin || left.index - right.index);
  const periods = [...(chart.periods ?? [])]
    .filter((period) => period.kind === 'startup_axis' || period.kind === 'loop_axis')
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id));
  const loopPeriods = periods.filter((period) => period.kind === 'loop_axis');
  const counters = new Map<string, number>();
  const axisKeyForStep = (startMs: number): string => {
    const containing = periods
      .filter((period) => startMs >= period.startMs && (period.endMs <= period.startMs || startMs <= period.endMs))
      .sort((left, right) => right.startMs - left.startMs)[0];
    if (containing) return containing.kind === 'loop_axis' ? containing.id : `startup:${containing.id}`;
    const previousLoop = loopPeriods.filter((period) => startMs >= period.startMs).at(-1);
    return previousLoop?.id ?? 'startup:default';
  };
  for (const { step } of steps) {
    const key = axisKeyForStep(step.startMin);
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    result.set(step.id, next);
  }
  return result;
}

export function noteStepCompleted(
  step: ComboStep,
  practice: PracticeSnapshot,
  chart?: ComboChart | null
): boolean {
  if (practice.completedStepIds?.includes(step.id) || practice.matchedStepIds?.includes(step.id)) return true;

  const elapsedMs = Number(practice.elapsedMs);
  if (Number.isFinite(elapsedMs) && elapsedMs >= step.startMin + step.durationMax) return true;

  if (practice.status === 'passed') return true;
  if (practice.status !== 'running' && practice.status !== 'failed') return false;

  const stepIndex = chart?.steps.findIndex((candidate) => candidate.id === step.id) ?? -1;
  return stepIndex >= 0 && stepIndex < practice.currentStepIndex;
}

export function noteStepVisibleAtTime(step: ComboStep, timeMs: number): boolean {
  return timeMs >= step.startMin && timeMs < step.startMin + step.durationMax;
}
