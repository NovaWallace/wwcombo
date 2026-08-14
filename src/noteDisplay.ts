import type { ComboChart, ComboStep, PracticeSnapshot } from '../combo-core';

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
  return timeMs < step.startMin + step.durationMax;
}
