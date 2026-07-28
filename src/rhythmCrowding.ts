import type { CharacterSlot, ComboStep } from '../combo-core';

const RHYTHM_AVATAR_AREA_HEIGHT = 78;
const RHYTHM_CROWDING_CLEARANCE_PX = 6;

export type RhythmNoteEntry<TStep extends Pick<ComboStep, 'id' | 'startMin' | 'durationMax' | 'characterSlot'> = ComboStep> = {
  step: TStep;
  height: number;
};

export type RhythmCrowdedGroup<TStep extends Pick<ComboStep, 'id' | 'startMin' | 'durationMax' | 'characterSlot'> = ComboStep> = {
  id: string;
  characterSlot: CharacterSlot;
  entries: RhythmNoteEntry<TStep>[];
  startMs: number;
};

export function rhythmNoteHeight(iconCount: number): number {
  return Math.max(34, iconCount > 1 ? iconCount * 36 + 6 : 34);
}

export function rhythmNoteOpacity(step: Pick<ComboStep, 'startMin' | 'durationMax'>, timeMs: number): number {
  if (timeMs <= step.startMin) return 1;
  return clamp(1 - (timeMs - step.startMin) / Math.max(1, step.durationMax), 0, 1);
}

export function rhythmNoteTop(step: Pick<ComboStep, 'startMin' | 'durationMax'>, height: number, timeMs: number, judgeY: number, fallSpeed: number): number {
  const fallingTop = judgeY - (step.startMin - timeMs) * fallSpeed - height;
  const active = timeMs >= step.startMin && timeMs <= step.startMin + step.durationMax;
  return active ? Math.min(fallingTop, judgeY + 4) : fallingTop;
}

export function buildRhythmCrowdedGroups<TStep extends Pick<ComboStep, 'id' | 'startMin' | 'durationMax' | 'characterSlot'>>(
  entries: readonly RhythmNoteEntry<TStep>[],
  fallSpeed: number
): RhythmCrowdedGroup<TStep>[] {
  const speed = Math.max(0.03, fallSpeed);
  const groups: RhythmCrowdedGroup<TStep>[] = [];

  ([1, 2, 3] as CharacterSlot[]).forEach((characterSlot) => {
    const laneEntries = entries
      .filter((entry) => (entry.step.characterSlot ?? 1) === characterSlot && entry.height > 0)
      .sort((left, right) => left.step.startMin - right.step.startMin || left.step.id.localeCompare(right.step.id));
    let current: RhythmNoteEntry<TStep>[] = [];
    let crowdedTop = 0;

    const flush = () => {
      if (current.length > 1) {
        groups.push({
          id: current.map((entry) => entry.step.id).join(':'),
          characterSlot,
          entries: current,
          startMs: current[0].step.startMin
        });
      }
      current = [];
    };

    laneEntries.forEach((entry) => {
      const bottom = -entry.step.startMin * speed;
      const top = bottom - entry.height;
      if (!current.length) {
        current = [entry];
        crowdedTop = top;
        return;
      }
      if (bottom >= crowdedTop - RHYTHM_CROWDING_CLEARANCE_PX) {
        current.push(entry);
        crowdedTop = Math.min(crowdedTop, top);
        return;
      }
      flush();
      current = [entry];
      crowdedTop = top;
    });
    flush();
  });

  return groups.sort((left, right) => left.startMs - right.startMs || left.characterSlot - right.characterSlot || left.id.localeCompare(right.id));
}

export function firstVisibleRhythmCrowdedGroup<TStep extends Pick<ComboStep, 'id' | 'startMin' | 'durationMax' | 'characterSlot'>>(
  groups: readonly RhythmCrowdedGroup<TStep>[],
  timeMs: number,
  judgeY: number,
  stageHeight: number,
  fallSpeed: number
): RhythmCrowdedGroup<TStep> | null {
  return visibleRhythmCrowdedGroups(groups, timeMs, judgeY, stageHeight, fallSpeed)[0] ?? null;
}

export function visibleRhythmCrowdedGroups<TStep extends Pick<ComboStep, 'id' | 'startMin' | 'durationMax' | 'characterSlot'>>(
  groups: readonly RhythmCrowdedGroup<TStep>[],
  timeMs: number,
  judgeY: number,
  stageHeight: number,
  fallSpeed: number
): RhythmCrowdedGroup<TStep>[] {
  const laneHeight = Math.max(1, stageHeight - RHYTHM_AVATAR_AREA_HEIGHT);
  return groups.filter((group) => group.entries.some((entry) => {
    if (rhythmNoteOpacity(entry.step, timeMs) <= 0) return false;
    const top = rhythmNoteTop(entry.step, entry.height, timeMs, judgeY, fallSpeed);
    return top < laneHeight && top + entry.height > 0;
  }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
