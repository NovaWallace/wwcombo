import { resolveActivation } from './input';
import type {
  ComboChart,
  ComboStep,
  CharacterSlot,
  HoldConversionEvent,
  KeyBinding,
  MoveDefinition,
  RecordedUnit,
  RecordingSnapshot,
  TrainerInputEvent
} from './types';

const DEFAULT_GAP_MS = 300;
const MIN_UNIT_MS = 35;

export type RecorderOptions = {
  moves: MoveDefinition[];
  bindings: KeyBinding[];
  startTriggerMoveId: string;
  stopTriggerMoveId?: string;
  startingCharacterSlot?: CharacterSlot;
  mergeGapMs?: number;
};

export class ComboRecorder {
  private readonly options: RecorderOptions & { mergeGapMs: number; startingCharacterSlot: CharacterSlot };
  private startedAt: number | null = null;
  private activeMain: RecordedUnit | null = null;
  private activeIndependent = new Map<string, RecordedUnit>();
  private units: RecordedUnit[] = [];
  private sequence = 0;
  private currentCharacterSlot: CharacterSlot = 1;

  constructor(options: RecorderOptions) {
    this.options = {
      ...options,
      startingCharacterSlot: options.startingCharacterSlot ?? 1,
      mergeGapMs: options.mergeGapMs ?? DEFAULT_GAP_MS
    };
  }

  get isRecording(): boolean {
    return this.startedAt !== null;
  }

  start(time: number): RecordingSnapshot {
    this.startedAt = time;
    this.activeMain = null;
    this.activeIndependent.clear();
    this.units = [];
    this.sequence = 0;
    this.currentCharacterSlot = this.options.startingCharacterSlot;
    return this.snapshot(time);
  }

  stop(time: number): RecordingSnapshot {
    this.closeAll(time);
    this.startedAt = null;
    return this.snapshot(time);
  }

  toggle(time: number): RecordingSnapshot {
    return this.isRecording ? this.stop(time) : this.start(time);
  }

  accept(event: TrainerInputEvent): RecordingSnapshot {
    const activation = resolveActivation(event, this.options.moves, this.options.bindings);
    if (!activation) return this.snapshot(event.time);

    if (activation.move.id === this.options.startTriggerMoveId) {
      return this.isRecording ? this.snapshot(event.time) : this.start(event.time);
    }

    if (activation.move.id === this.options.stopTriggerMoveId) {
      return this.isRecording ? this.stop(event.time) : this.snapshot(event.time);
    }

    const nextSlot = characterSlotForMove(activation.move.id);

    if (!this.isRecording || this.startedAt === null) {
      return this.snapshot(event.time);
    }

    const relativeTime = Math.max(0, event.time - this.startedAt);
    const unitTimeEvent = { ...event, time: relativeTime };

    this.expireStaleMain(relativeTime);
    this.expireStaleIndependent(relativeTime);

    if (nextSlot) {
      this.currentCharacterSlot = nextSlot;
    }

    if (activation.move.independent) {
      this.upsertIndependent(activation.move, unitTimeEvent);
    } else {
      this.switchMain(activation.move, unitTimeEvent);
    }

    return this.snapshot(event.time);
  }

  convertHold(event: HoldConversionEvent): RecordingSnapshot {
    const sourceMove = resolveActivation({ type: 'keydown', code: event.sourceCode, time: event.pressTime }, this.options.moves, this.options.bindings)?.move;
    const holdMove = resolveActivation({ type: 'keydown', code: event.holdCode, time: event.holdStartTime }, this.options.moves, this.options.bindings)?.move;
    if (!sourceMove || !holdMove || !this.isRecording || this.startedAt === null) return this.snapshot(event.releaseTime);
    const pressTime = Math.max(0, event.pressTime - this.startedAt);
    const holdStartTime = Math.max(pressTime, event.holdStartTime - this.startedAt);
    const releaseTime = Math.max(holdStartTime, event.releaseTime - this.startedAt);
    this.convertActiveHold(sourceMove, holdMove, pressTime, holdStartTime, releaseTime);
    return this.snapshot(event.releaseTime);
  }

  finishPress(sourceCode: string, pressTime: number, releaseTime: number): RecordingSnapshot {
    const sourceMove = resolveActivation({ type: 'keydown', code: sourceCode, time: pressTime }, this.options.moves, this.options.bindings)?.move;
    if (!sourceMove || !this.isRecording || this.startedAt === null) return this.snapshot(releaseTime);
    const relativePressTime = Math.max(0, pressTime - this.startedAt);
    const relativeReleaseTime = Math.max(relativePressTime + MIN_UNIT_MS, releaseTime - this.startedAt);
    this.closePressedUnit(sourceMove, relativePressTime, relativeReleaseTime);
    return this.snapshot(releaseTime);
  }

  extendPress(sourceCode: string, pressTime: number, releaseTime: number): RecordingSnapshot {
    const sourceMove = resolveActivation({ type: 'keydown', code: sourceCode, time: pressTime }, this.options.moves, this.options.bindings)?.move;
    if (!sourceMove || !this.isRecording || this.startedAt === null) return this.snapshot(releaseTime);
    const relativePressTime = Math.max(0, pressTime - this.startedAt);
    const relativeReleaseTime = Math.max(relativePressTime + MIN_UNIT_MS, releaseTime - this.startedAt);
    this.extendPressedUnit(sourceMove, relativePressTime, relativeReleaseTime);
    return this.snapshot(releaseTime);
  }

  toChart(title = 'Untitled Combo'): ComboChart {
    const now = Date.now();
    const chartId = crypto.randomUUID();
    const steps = this.units.map((unit): ComboStep => {
      const move = this.options.moves.find((candidate) => candidate.id === unit.moveId);
      return {
        id: `${chartId}_${unit.id}`,
        moveId: unit.moveId,
        label: unit.label,
        characterSlot: unit.characterSlot ?? 1,
        lane: unit.lane,
        independent: unit.independent,
        startMin: Math.max(0, unit.startTime - 120),
        startMax: unit.startTime + 180,
        durationMin: Math.max(MIN_UNIT_MS, Math.floor(unit.duration * 0.55)),
        durationMax: Math.max(MIN_UNIT_MS, Math.ceil(unit.duration * 1.35)),
        preheatMs: 0,
        recoveryMs: 0,
        color: move?.color ?? '#8aa1b5',
        advancesStep: move?.advancesStep ?? !unit.independent,
        samples: [
          {
            recordingId: 'initial',
            startTime: unit.startTime,
            duration: unit.duration
          }
        ]
      };
    });

    return {
      id: chartId,
      title,
      tags: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
      startTriggerMoveId: this.options.startTriggerMoveId,
      stopTriggerMoveId: this.options.stopTriggerMoveId,
      steps,
      periods: []
    };
  }

  snapshot(now: number): RecordingSnapshot {
    const elapsed = this.startedAt === null ? 0 : Math.max(0, now - this.startedAt);
    const liveUnits = [...this.units, ...(this.activeMain ? [this.activeMain] : []), ...this.activeIndependent.values()].map((unit) => ({ ...unit, sourceCodes: [...unit.sourceCodes] }));
    return {
      isRecording: this.isRecording,
      startedAt: this.startedAt,
      elapsed,
      activeMain: this.activeMain,
      activeIndependent: [...this.activeIndependent.values()],
      units: liveUnits
    };
  }

  private switchMain(move: MoveDefinition, event: TrainerInputEvent): void {
    if (this.activeMain?.moveId === move.id) {
      this.extendUnit(this.activeMain, event);
      return;
    }

    if (this.activeMain) {
      this.closeUnit(this.activeMain, this.activeMain.endTime);
      this.activeMain = null;
    }

    this.activeMain = this.createUnit(move, event, 'main');
  }

  private upsertIndependent(move: MoveDefinition, event: TrainerInputEvent): void {
    const current = this.activeIndependent.get(move.id);
    if (current) {
      this.extendUnit(current, event);
      return;
    }
    this.activeIndependent.set(move.id, this.createUnit(move, event, 'independent'));
  }

  private extendUnit(unit: RecordedUnit, event: TrainerInputEvent): void {
    unit.endTime = event.time;
    unit.duration = Math.max(MIN_UNIT_MS, unit.endTime - unit.startTime);
    addSourceCode(unit, event.code);
  }

  private expireStaleMain(relativeTime: number): void {
    if (!this.activeMain) return;
    if (relativeTime - this.activeMain.endTime >= this.options.mergeGapMs) {
      this.closeUnit(this.activeMain, this.activeMain.endTime);
      this.activeMain = null;
    }
  }

  private expireStaleIndependent(relativeTime: number): void {
    for (const [moveId, unit] of this.activeIndependent) {
      if (relativeTime - unit.endTime >= this.options.mergeGapMs) {
        this.closeUnit(unit, unit.endTime);
        this.activeIndependent.delete(moveId);
      }
    }
  }

  private closeAll(_time: number): void {
    if (this.activeMain) {
      this.closeUnit(this.activeMain, this.activeMain.endTime);
      this.activeMain = null;
    }
    for (const unit of this.activeIndependent.values()) {
      this.closeUnit(unit, unit.endTime);
    }
    this.activeIndependent.clear();
  }

  private convertActiveHold(sourceMove: MoveDefinition, holdMove: MoveDefinition, pressTime: number, holdStartTime: number, releaseTime: number): void {
    if (sourceMove.independent) {
      const unit = this.activeIndependent.get(sourceMove.id) ?? this.findOpenUnit(sourceMove.id, pressTime);
      if (unit) this.splitUnitForHold(unit, holdMove, holdStartTime, releaseTime);
      return;
    }
    const unit = this.activeMain?.moveId === sourceMove.id ? this.activeMain : this.findOpenUnit(sourceMove.id, pressTime);
    if (unit) this.splitUnitForHold(unit, holdMove, holdStartTime, releaseTime);
  }

  private closePressedUnit(sourceMove: MoveDefinition, pressTime: number, releaseTime: number): void {
    if (sourceMove.independent) {
      const unit = this.activeIndependent.get(sourceMove.id) ?? this.findOpenUnit(sourceMove.id, pressTime);
      if (!unit) return;
      unit.endTime = releaseTime;
      unit.duration = Math.max(MIN_UNIT_MS, unit.endTime - unit.startTime);
      this.closeUnit(unit, unit.endTime);
      this.activeIndependent.delete(sourceMove.id);
      return;
    }
    const unit = this.activeMain?.moveId === sourceMove.id ? this.activeMain : this.findOpenUnit(sourceMove.id, pressTime);
    if (!unit) return;
    unit.endTime = releaseTime;
    unit.duration = Math.max(MIN_UNIT_MS, unit.endTime - unit.startTime);
    this.closeUnit(unit, unit.endTime);
    if (this.activeMain === unit) this.activeMain = null;
  }

  private extendPressedUnit(sourceMove: MoveDefinition, pressTime: number, releaseTime: number): void {
    const unit = sourceMove.independent ? this.activeIndependent.get(sourceMove.id) ?? this.findOpenUnit(sourceMove.id, pressTime) : this.activeMain?.moveId === sourceMove.id ? this.activeMain : this.findOpenUnit(sourceMove.id, pressTime);
    if (!unit) return;
    unit.endTime = Math.max(unit.endTime, releaseTime);
    unit.duration = Math.max(MIN_UNIT_MS, unit.endTime - unit.startTime);
  }

  private findOpenUnit(moveId: string, time: number): RecordedUnit | null {
    if (this.activeMain?.moveId === moveId && time >= this.activeMain.startTime && time <= Math.max(this.activeMain.endTime, time)) return this.activeMain;
    return [...this.activeIndependent.values()].find((unit) => unit.moveId === moveId && time >= unit.startTime && time <= Math.max(unit.endTime, time)) ?? null;
  }

  private splitUnitForHold(unit: RecordedUnit, holdMove: MoveDefinition, holdStartTime: number, releaseTime: number): void {
    const splitAt = Math.max(unit.startTime + MIN_UNIT_MS, holdStartTime);
    const holdEnd = Math.max(splitAt + MIN_UNIT_MS, releaseTime);
    const originalEnd = Math.max(unit.endTime, holdEnd);
    unit.endTime = Math.min(splitAt, originalEnd);
    unit.duration = Math.max(MIN_UNIT_MS, unit.endTime - unit.startTime);
    const holdLane: RecordedUnit['lane'] = holdMove.independent ? 'independent' : 'main';
    const holdUnit = this.createUnit(holdMove, { type: 'keydown', code: holdMove.id, time: splitAt }, holdLane);
    holdUnit.characterSlot = unit.characterSlot;
    holdUnit.startTime = splitAt;
    holdUnit.endTime = holdEnd;
    holdUnit.duration = Math.max(MIN_UNIT_MS, holdEnd - splitAt);
    holdUnit.sourceCodes = [...unit.sourceCodes];
    if (this.activeMain === unit) {
      this.closeUnit(unit, unit.endTime);
      if (holdMove.independent) this.activeIndependent.set(holdMove.id, holdUnit);
      else this.activeMain = holdUnit;
      return;
    }
    for (const [moveId, current] of this.activeIndependent) {
      if (current !== unit) continue;
      this.closeUnit(unit, unit.endTime);
      this.activeIndependent.delete(moveId);
      if (holdMove.independent) this.activeIndependent.set(holdMove.id, holdUnit);
      else {
        if (this.activeMain) {
          this.closeUnit(this.activeMain, Math.min(this.activeMain.endTime, splitAt));
          this.activeMain = null;
        }
        this.activeMain = holdUnit;
      }
      return;
    }
  }

  private createUnit(move: MoveDefinition, event: TrainerInputEvent, lane: RecordedUnit['lane']): RecordedUnit {
    return {
      id: `unit_${++this.sequence}`,
      moveId: move.id,
      label: move.label,
      characterSlot: this.currentCharacterSlot,
      lane,
      independent: move.independent,
      startTime: event.time,
      endTime: event.time,
      duration: MIN_UNIT_MS,
      sourceCodes: [event.code]
    };
  }

  private closeUnit(unit: RecordedUnit, endTime: number): void {
    const closed = {
      ...unit,
      endTime: Math.max(unit.endTime, endTime),
      sourceCodes: [...unit.sourceCodes]
    };
    closed.duration = Math.max(MIN_UNIT_MS, closed.endTime - closed.startTime);
    this.units.push(closed);
  }
}

function addSourceCode(unit: RecordedUnit, code: string): void {
  if (!unit.sourceCodes.includes(code)) unit.sourceCodes.push(code);
}

function characterSlotForMove(moveId: string): CharacterSlot | null {
  if (moveId === 'switch_1') return 1;
  if (moveId === 'switch_2') return 2;
  if (moveId === 'switch_3') return 3;
  return null;
}
