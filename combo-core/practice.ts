import type {
  ComboChart,
  ComboStep,
  KeyBinding,
  MoveDefinition,
  PracticeFeedback,
  PracticeJudgement,
  PracticeSettings,
  PracticeSnapshot,
  TrainerInputEvent
} from './types';
import { resolveActivation } from './input';

const TEXT = {
  started: '\u7ec3\u4e60\u5f00\u59cb',
  armed: '\u7b49\u5f85\u8f74\u6bb5\u9996\u62db\u8f93\u5165',
  endedWithErrors: (count: number) => `\u7ec3\u4e60\u7ed3\u675f\uff1a\u53d1\u73b0 ${count} \u5904\u9519\u4f4d`,
  endedClean: '\u7ec3\u4e60\u7ed3\u675f\uff1a\u672a\u53d1\u73b0\u9519\u4f4d',
  wrongInputNeeds: (label: string) => `\u9519\u4f4d\u8f93\u5165\uff1a\u5f53\u524d\u9700\u8981 ${label}`,
  wrongInputEnded: '\u9519\u4f4d\u8f93\u5165\uff1a\u6d41\u7a0b\u5df2\u7ed3\u675f',
  hitWindow: (label: string) => `${label} \u547d\u4e2d\u7a97\u53e3`,
  judgement: (rank: string, label: string, offset: number) => `${rank} ${label} ${offset >= 0 ? '+' : ''}${Math.round(offset)}ms`,
  completedWithErrors: (count: number) => `\u6d41\u7a0b\u5b8c\u6210\uff1a${count} \u5904\u9519\u4f4d`,
  completed: '\u8fde\u6bb5\u5b8c\u6210',
  simple: '\u6f14\u793a\u6a21\u5f0f\uff1a\u6309\u65f6\u95f4\u5c55\u793a\u6d41\u7a0b',
  missed: (label: string) => `${label} \u672a\u5728\u7a97\u53e3\u5185\u8f93\u5165`
};

export const STRICT_PRACTICE: PracticeSettings = {
  mode: 'strict',
  allowEarlyMs: 120,
  allowLateMs: 180,
  requireDurationMin: true,
  requireDurationMax: true,
  allowExtraIndependentMoves: false,
  stopOnError: false,
  axisGateEnabled: true
};

export const LENIENT_PRACTICE: PracticeSettings = {
  mode: 'lenient',
  allowEarlyMs: 320,
  allowLateMs: 720,
  requireDurationMin: false,
  requireDurationMax: true,
  allowExtraIndependentMoves: true,
  stopOnError: false,
  axisGateEnabled: true
};

export const SIMPLE_PRACTICE: PracticeSettings = {
  mode: 'free',
  allowEarlyMs: 0,
  allowLateMs: 0,
  requireDurationMin: false,
  requireDurationMax: false,
  allowExtraIndependentMoves: true,
  stopOnError: false,
  axisGateEnabled: true
};

export class PracticeSession {
  private startedAt: number | null = null;
  private elapsedMs = 0;
  private currentStepIndex = 0;
  private status: PracticeSnapshot['status'] = 'idle';
  private feedback: PracticeFeedback[] = [];
  private completedStepIds: string[] = [];
  private errorStepIds: string[] = [];
  private matchedStepIds = new Set<string>();
  private judgements = new Map<string, PracticeJudgement>();
  private missedStepIds = new Set<string>();
  private startedFromElapsed = 0;
  private unlockedAxisStarts = new Set<number>();
  private waitingAxisStart: number | null = null;

  constructor(
    private readonly chart: ComboChart,
    private readonly moves: MoveDefinition[],
    private readonly bindings: KeyBinding[],
    private readonly settings: PracticeSettings
  ) {}

  start(time: number, elapsedOffset = 0): PracticeSnapshot {
    if (this.settings.axisGateEnabled && this.settings.mode !== 'lenient' && elapsedOffset <= 0) return this.arm();
    return this.startPlayback(time, elapsedOffset);
  }

  private arm(): PracticeSnapshot {
    this.startedAt = null;
    this.elapsedMs = 0;
    this.startedFromElapsed = 0;
    this.currentStepIndex = 0;
    this.status = 'armed';
    this.feedback = [{ level: 'info', message: TEXT.armed }];
    this.completedStepIds = [];
    this.errorStepIds = [];
    this.matchedStepIds.clear();
    this.judgements.clear();
    this.missedStepIds.clear();
    this.unlockedAxisStarts.clear();
    this.waitingAxisStart = null;
    return this.snapshot();
  }

  private startPlayback(time: number, elapsedOffset = 0): PracticeSnapshot {
    const safeOffset = Math.max(0, Math.round(elapsedOffset));
    this.startedAt = time - safeOffset;
    this.elapsedMs = safeOffset;
    this.startedFromElapsed = safeOffset;
    this.currentStepIndex = 0;
    this.status = 'running';
    this.feedback = [{ level: 'info', message: TEXT.started }];
    this.completedStepIds = [];
    this.errorStepIds = [];
    this.matchedStepIds.clear();
    this.judgements.clear();
    this.missedStepIds.clear();
    this.unlockedAxisStarts.add(safeOffset);
    this.waitingAxisStart = null;
    if (this.settings.mode === 'lenient') this.advanceLenientByElapsed(safeOffset);
    else if (safeOffset > 0) this.currentStepIndex = this.findActiveIndex(safeOffset);
    return this.snapshot();
  }

  stop(): PracticeSnapshot {
    if (this.status === 'running' && this.settings.mode !== 'free') {
      if (this.settings.mode === 'strict') this.finalizeMissedSteps(Number.POSITIVE_INFINITY);
      this.feedback.unshift(
        this.errorStepIds.length
          ? { level: 'warning', message: TEXT.endedWithErrors(this.errorStepIds.length) }
          : { level: 'success', message: TEXT.endedClean }
      );
      this.feedback = this.feedback.slice(0, 8);
    }
    this.status = 'idle';
    this.startedAt = null;
    this.elapsedMs = 0;
    this.startedFromElapsed = 0;
    this.waitingAxisStart = null;
    return this.snapshot();
  }

  accept(event: TrainerInputEvent): PracticeSnapshot {
    const activation = resolveActivation(event, this.moves, this.bindings);
    if (!activation) return this.snapshot();

    if (activation.move.id === this.chart.startTriggerMoveId) {
      return this.status === 'running' || this.status === 'armed' ? this.snapshot() : this.start(event.time);
    }

    if (activation.move.id === (this.chart.stopTriggerMoveId ?? 'stop_recording')) {
      return this.stop();
    }

    if (this.settings.axisGateEnabled && (this.status === 'idle' || this.status === 'armed') && this.settings.mode !== 'lenient') {
      const offset = this.waitingAxisStart !== null ? this.axisStartOffsetForMove(activation.move.id, this.waitingAxisStart) : this.axisStartOffsetForMove(activation.move.id);
      if (offset !== null) {
        this.startPlayback(event.time, offset);
        if (this.settings.mode === 'free') return this.snapshot();
      }
    }

    if (this.status !== 'running' || this.startedAt === null) return this.snapshot();

    const inputElapsed = Math.max(0, event.time - this.startedAt);
    const playbackElapsed = Math.max(this.elapsedMs, inputElapsed);
    this.elapsedMs = playbackElapsed;
    if (this.settings.mode === 'lenient') {
      this.advanceLenientByElapsed(playbackElapsed);
      return this.acceptLenientInput(activation.move.id, inputElapsed);
    }

    this.advanceByElapsed(playbackElapsed);

    if (this.settings.mode === 'free') {
      return this.snapshot();
    }

    const target = this.findInputTarget(activation.move.id, inputElapsed);
    if (!target) {
      const active = this.chart.steps[this.currentStepIndex];
      const feedback: PracticeFeedback = active
        ? { level: 'error', stepId: active.id, message: TEXT.wrongInputNeeds(active.label) }
        : { level: 'error', message: TEXT.wrongInputEnded };
      this.recordError(active?.id, feedback);
      return this.snapshot();
    }

    this.matchedStepIds.add(target.id);
    if (!this.completedStepIds.includes(target.id)) this.completedStepIds.push(target.id);
    const offsetMs = inputElapsed - target.startMin;
    const judgement = this.judgeHit(offsetMs);
    this.judgements.set(target.id, judgement);
    this.feedback.unshift({ level: 'success', stepId: target.id, message: TEXT.judgement(this.judgementLabel(judgement), target.label, offsetMs) });
    this.feedback = this.feedback.slice(0, 8);
    return this.snapshot();
  }

  tick(time: number): PracticeSnapshot {
    if (this.status !== 'running' || this.startedAt === null) return this.snapshot();
    this.elapsedMs = Math.max(this.elapsedMs, time - this.startedAt, 0);
    if (this.settings.mode === 'lenient') this.advanceLenientByElapsed(this.elapsedMs);
    else this.advanceByElapsed(this.elapsedMs);
    return this.snapshot();
  }

  snapshot(): PracticeSnapshot {
    return {
      status: this.status,
      startedAt: this.startedAt,
      elapsedMs: this.elapsedMs,
      currentStepIndex: this.currentStepIndex,
      feedback: [...this.feedback],
      judgements: Object.fromEntries(this.judgements),
      matchedStepIds: [...this.matchedStepIds],
      completedStepIds: [...this.completedStepIds],
      errorStepIds: [...this.errorStepIds]
    };
  }

  private advanceByElapsed(elapsed: number): void {
    if (this.settings.mode === 'lenient') {
      this.advanceLenientByElapsed(elapsed);
      return;
    }
    const lockedAxis = this.nextLockedLoopAxis(elapsed);
    if (this.settings.axisGateEnabled && lockedAxis) {
      this.pauseForAxis(lockedAxis.startMs);
      return;
    }
    const nextIndex = this.findActiveIndex(elapsed);
    const completed = this.chart.steps
      .filter((step) => elapsed >= this.stepEnd(step))
      .map((step) => step.id);

    this.completedStepIds = Array.from(new Set([...completed, ...this.completedStepIds.filter((id) => this.matchedStepIds.has(id))]));
    this.finalizeMissedSteps(elapsed);
    this.currentStepIndex = nextIndex;

    if (nextIndex >= this.chart.steps.length) {
      this.status = 'passed';
      this.feedback.unshift(
        this.errorStepIds.length
          ? { level: 'warning', message: TEXT.completedWithErrors(this.errorStepIds.length) }
          : { level: 'success', message: TEXT.completed }
      );
      this.feedback = this.feedback.slice(0, 8);
      return;
    }

    if (this.settings.mode === 'free') {
      this.feedback = [{ level: 'info', message: TEXT.simple }];
    }
  }

  private findActiveIndex(elapsed: number): number {
    if (this.settings.mode === 'lenient') return this.findNextLenientIndex(this.currentStepIndex, elapsed);
    const startIndex = Math.max(0, Math.min(this.currentStepIndex, this.chart.steps.length));
    let futureIndex = this.chart.steps.length;
    let activeIndex = -1;

    for (let index = startIndex; index < this.chart.steps.length; index += 1) {
      const step = this.chart.steps[index];
      if (elapsed < step.startMin) {
        if (futureIndex === this.chart.steps.length) futureIndex = index;
        continue;
      }
      if (elapsed < this.stepEnd(step) || index > activeIndex) {
        activeIndex = index;
      }
    }

    return Math.max(startIndex, activeIndex >= 0 ? activeIndex : futureIndex);
  }

  private acceptLenientInput(moveId: string, elapsed: number): PracticeSnapshot {
    this.currentStepIndex = this.findNextLenientIndex(this.currentStepIndex, elapsed);
    const active = this.chart.steps[this.currentStepIndex];

    const target = this.findLenientInputTarget(moveId, active);
    if (!target) {
      const feedback: PracticeFeedback = active
        ? { level: 'error', stepId: active.id, message: TEXT.wrongInputNeeds(active.label) }
        : { level: 'error', message: TEXT.wrongInputEnded };
      this.recordError(active?.id, feedback);
      return this.snapshot();
    }

    if (active && this.isInterruptibleTimedStep(active) && active.id !== target.id) this.markStepMatched(active, false);
    this.markStepMatched(target);
    if (this.isBlockingPracticeStep(target)) {
      const targetIndex = this.chart.steps.findIndex((step) => step.id === target.id);
      this.currentStepIndex = this.findNextLenientIndex(targetIndex + 1, elapsed);
    } else {
      this.currentStepIndex = this.findNextLenientIndex(this.currentStepIndex, elapsed);
    }
    this.completeIfLenientFinished();
    return this.snapshot();
  }

  private advanceLenientByElapsed(elapsed: number): void {
    this.currentStepIndex = this.findNextLenientIndex(this.currentStepIndex, elapsed);
    this.completeIfLenientFinished();
  }

  private findNextLenientIndex(startIndex: number, elapsed: number): number {
    for (let index = Math.max(0, startIndex); index < this.chart.steps.length; index += 1) {
      const step = this.chart.steps[index];
      if (this.matchedStepIds.has(step.id)) continue;
      if (this.isTimedPracticeStep(step)) {
        if (this.isInterruptibleTimedStep(step) && elapsed < this.stepEnd(step)) return index;
        this.markStepMatched(step, false);
        continue;
      }
      if (!this.isBlockingPracticeStep(step)) continue;
      return index;
    }
    return this.chart.steps.length;
  }

  private findLenientInputTarget(moveId: string, active: ComboStep | undefined): ComboStep | null {
    if (active && this.isBlockingPracticeStep(active) && !this.matchedStepIds.has(active.id) && active.moveId === moveId) return active;
    const activeIndex = active ? this.chart.steps.findIndex((step) => step.id === active.id) : this.currentStepIndex;
    const searchStart = active && this.isInterruptibleTimedStep(active) ? activeIndex + 1 : Math.max(0, activeIndex - 2);
    const searchEnd = Math.min(this.chart.steps.length, Math.max(activeIndex + 4, this.currentStepIndex + 4));
    for (let index = searchStart; index < searchEnd; index += 1) {
      const step = this.chart.steps[index];
      if (!this.isBlockingPracticeStep(step) || this.matchedStepIds.has(step.id)) continue;
      if (step.moveId === moveId) return step;
      if (index >= this.currentStepIndex && step.moveId !== moveId) break;
    }
    return null;
  }

  private isTimedPracticeStep(step: ComboStep): boolean {
    return step.free || !this.isBlockingPracticeStep(step);
  }

  private isInterruptibleTimedStep(step: ComboStep): boolean {
    const move = this.moves.find((item) => item.id === step.moveId);
    return Boolean(step.independent || step.lane === 'independent' || move?.independent);
  }

  private isBlockingPracticeStep(step: ComboStep): boolean {
    const move = this.moves.find((item) => item.id === step.moveId);
    return !step.free && !step.independent && step.lane !== 'independent' && step.advancesStep !== false && move?.independent !== true && move?.advancesStep !== false;
  }

  private markStepMatched(step: ComboStep, pushFeedback = true): void {
    this.matchedStepIds.add(step.id);
    if (!this.completedStepIds.includes(step.id)) this.completedStepIds.push(step.id);
    this.judgements.set(step.id, 'good');
    if (pushFeedback) {
      this.feedback.unshift({ level: 'success', stepId: step.id, message: TEXT.hitWindow(step.label) });
      this.feedback = this.feedback.slice(0, 8);
    }
  }

  private completeIfLenientFinished(): void {
    if (this.currentStepIndex < this.chart.steps.length || this.status !== 'running') return;
    this.status = 'passed';
    this.feedback.unshift(
      this.errorStepIds.length
        ? { level: 'warning', message: TEXT.completedWithErrors(this.errorStepIds.length) }
        : { level: 'success', message: TEXT.completed }
    );
    this.feedback = this.feedback.slice(0, 8);
  }

  private findInputTarget(moveId: string, elapsed: number): ComboStep | null {
    if (elapsed <= this.startedFromElapsed + this.settings.allowLateMs) {
      const axisStarter = this.axisStarterAtElapsed(this.startedFromElapsed);
      if (axisStarter && axisStarter.moveId === moveId && !this.matchedStepIds.has(axisStarter.id)) return axisStarter;
    }
    const candidates = this.chart.steps
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => !step.free && !this.matchedStepIds.has(step.id) && step.moveId === moveId)
      .filter(({ step }) => elapsed >= this.inputStart(step) && elapsed <= this.inputEnd(step))
      .sort((left, right) => right.index - left.index);
    return candidates[0]?.step ?? null;
  }

  private axisStartOffsetForMove(moveId: string, requiredStart?: number): number | null {
    const periods = [...(this.chart.periods ?? [])]
      .filter((period) => period.kind === 'startup_axis' || period.kind === 'loop_axis')
      .sort((left, right) => left.startMs - right.startMs);
    if (requiredStart !== undefined) {
      const period = periods.find((item) => item.startMs === requiredStart);
      const first = period ? this.firstStepInRange(period.startMs, period.endMs) : null;
      return first?.moveId === moveId ? requiredStart : null;
    }
    const startupStart = periods.find((period) => period.kind === 'startup_axis')?.startMs ?? 0;
    const startupFirst = this.firstStepInRange(startupStart, periods.find((period) => period.kind === 'startup_axis')?.endMs ?? Number.POSITIVE_INFINITY);
    if (startupFirst?.moveId === moveId) return startupStart;
    for (const period of periods.filter((item) => item.kind === 'loop_axis')) {
      const first = this.firstStepInRange(period.startMs, period.endMs);
      if (first?.moveId === moveId) return period.startMs;
    }
    return null;
  }

  private axisStarterAtElapsed(elapsed: number): ComboStep | null {
    const period = [...(this.chart.periods ?? [])]
      .filter((item) => (item.kind === 'startup_axis' || item.kind === 'loop_axis') && elapsed >= item.startMs && elapsed <= item.endMs)
      .sort((left, right) => left.startMs - right.startMs)[0];
    return period ? this.firstStepInRange(period.startMs, period.endMs) : this.firstStepInRange(0, Number.POSITIVE_INFINITY);
  }

  private nextLockedLoopAxis(elapsed: number) {
    return [...(this.chart.periods ?? [])]
      .filter((period) => period.kind === 'loop_axis' && !this.unlockedAxisStarts.has(period.startMs) && elapsed >= period.startMs)
      .sort((left, right) => left.startMs - right.startMs)[0] ?? null;
  }

  private pauseForAxis(axisStart: number): void {
    this.status = 'armed';
    this.startedAt = null;
    this.elapsedMs = Math.max(0, axisStart);
    this.startedFromElapsed = axisStart;
    this.waitingAxisStart = axisStart;
    this.currentStepIndex = this.findActiveIndex(axisStart);
    this.feedback = [{ level: 'info', message: TEXT.armed }];
  }

  private firstStepInRange(startMs: number, endMs: number): ComboStep | null {
    return [...this.chart.steps]
      .filter((step) => step.startMin >= startMs && step.startMin <= endMs)
      .sort((left, right) => left.startMin - right.startMin || left.startMax - right.startMax || left.id.localeCompare(right.id))[0] ?? null;
  }

  private finalizeMissedSteps(elapsed: number): void {
    if (this.settings.mode === 'free') return;
    for (const step of this.chart.steps) {
    if (step.free || this.matchedStepIds.has(step.id) || this.missedStepIds.has(step.id)) continue;
      if (this.inputEnd(step) <= this.startedFromElapsed) continue;
      if (elapsed <= this.inputEnd(step)) continue;
      this.missedStepIds.add(step.id);
      this.judgements.set(step.id, 'miss');
      this.recordError(step.id, { level: 'error', stepId: step.id, message: TEXT.missed(step.label) }, false);
    }
  }

  private recordError(stepId: string | undefined, feedback: PracticeFeedback, pushFeedback = true): void {
    if (stepId && this.chart.steps.find((step) => step.id === stepId && this.inputEnd(step) <= this.startedFromElapsed)) return;
    if (stepId && !this.errorStepIds.includes(stepId)) this.errorStepIds.push(stepId);
    if (stepId && !this.judgements.has(stepId)) this.judgements.set(stepId, 'miss');
    if (pushFeedback) {
      this.feedback.unshift(feedback);
      this.feedback = this.feedback.slice(0, 8);
    }
    if (this.settings.stopOnError) this.status = 'failed';
  }

  private inputStart(step: ComboStep): number {
    return step.startMin - (step.preheatMs ?? 0) - this.settings.allowEarlyMs;
  }

  private judgeHit(offsetMs: number): PracticeJudgement {
    const distance = Math.abs(offsetMs);
    if (distance <= 45) return 'perfect';
    if (distance <= 90) return 'great';
    return 'good';
  }

  private judgementLabel(judgement: PracticeJudgement): string {
    if (judgement === 'perfect') return 'PERFECT';
    if (judgement === 'great') return 'GREAT';
    if (judgement === 'good') return 'GOOD';
    return 'MISS';
  }

  private inputEnd(step: ComboStep): number {
    return step.startMax + this.settings.allowLateMs;
  }

  private stepEnd(step: ComboStep): number {
    return step.startMax + step.durationMax + (step.recoveryMs ?? 0);
  }
}
