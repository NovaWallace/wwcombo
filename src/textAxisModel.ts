import type { CharacterSlot, ComboChart, ComboStep } from '../combo-core';
import type { AppLanguage } from './i18n';
import { localizedPeriodLabel } from './periodLabels';
import { defaultTextAxisCodeForMove } from './textAxisParser';
import type { TextAxisCharacter, TextAxisParseResult } from './textAxisParser';

export type TextAxisDisplaySegment = {
  key: string;
  kind: 'marker' | 'role' | 'step' | 'separator' | 'linebreak';
  text: string;
  displayText?: string;
  stepId?: string;
  spaced?: boolean;
  intro?: boolean;
  outro?: boolean;
};

export type SerializedTextAxis = {
  source: string;
  segments: TextAxisDisplaySegment[];
};

type TextAxisStepMatch = {
  previousIndex: number;
  nextIndex: number;
};

function textAxisStepIdentity(step: ComboStep): string {
  return [
    step.moveId,
    step.characterSlot ?? 0,
    step.lane,
    step.workshopLane ?? ''
  ].join('|');
}

function normalizedTextAxisContent(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? '';
}

function hasOwnProperty<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function alignTextAxisSteps(previous: TextAxisParseResult, next: TextAxisParseResult): TextAxisStepMatch[] {
  const previousSteps = previous.chart.steps;
  const nextSteps = next.chart.steps;
  const width = nextSteps.length + 1;
  const gapPenalty = -36;
  const impossible = Number.NEGATIVE_INFINITY;
  const scores = Array.from({ length: previousSteps.length + 1 }, () => Array<number>(width).fill(impossible));
  const choices = Array.from({ length: previousSteps.length + 1 }, () => Array<'match' | 'delete' | 'insert' | null>(width).fill(null));
  scores[0][0] = 0;
  for (let previousIndex = 1; previousIndex <= previousSteps.length; previousIndex += 1) {
    scores[previousIndex][0] = scores[previousIndex - 1][0] + gapPenalty;
    choices[previousIndex][0] = 'delete';
  }
  for (let nextIndex = 1; nextIndex <= nextSteps.length; nextIndex += 1) {
    scores[0][nextIndex] = scores[0][nextIndex - 1] + gapPenalty;
    choices[0][nextIndex] = 'insert';
  }

  for (let previousIndex = 1; previousIndex <= previousSteps.length; previousIndex += 1) {
    for (let nextIndex = 1; nextIndex <= nextSteps.length; nextIndex += 1) {
      const previousStep = previousSteps[previousIndex - 1];
      const nextStep = nextSteps[nextIndex - 1];
      const identityMatches = textAxisStepIdentity(previousStep) === textAxisStepIdentity(nextStep);
      const contentMatches = normalizedTextAxisContent(previous.contentLabels[previousStep.id])
        === normalizedTextAxisContent(next.contentLabels[nextStep.id]);
      const timeDistance = Math.abs(previousStep.startMin - nextStep.startMin);
      const matchScore = identityMatches
        ? 100 + (contentMatches ? 24 : 0) + Math.max(0, 8 - timeDistance / 1000)
        : impossible;
      const candidates: Array<{ score: number; choice: 'match' | 'delete' | 'insert'; priority: number }> = [
        { score: scores[previousIndex - 1][nextIndex - 1] + matchScore, choice: 'match', priority: 3 },
        { score: scores[previousIndex - 1][nextIndex] + gapPenalty, choice: 'delete', priority: 2 },
        { score: scores[previousIndex][nextIndex - 1] + gapPenalty, choice: 'insert', priority: 1 }
      ];
      const best = candidates.reduce((current, candidate) => candidate.score > current.score || (candidate.score === current.score && candidate.priority > current.priority) ? candidate : current);
      scores[previousIndex][nextIndex] = best.score;
      choices[previousIndex][nextIndex] = best.choice;
    }
  }

  const matches: TextAxisStepMatch[] = [];
  let previousIndex = previousSteps.length;
  let nextIndex = nextSteps.length;
  while (previousIndex > 0 || nextIndex > 0) {
    const choice = choices[previousIndex][nextIndex];
    if (choice === 'match') {
      matches.push({ previousIndex: previousIndex - 1, nextIndex: nextIndex - 1 });
      previousIndex -= 1;
      nextIndex -= 1;
    } else if (choice === 'delete') {
      previousIndex -= 1;
    } else if (choice === 'insert') {
      nextIndex -= 1;
    } else {
      break;
    }
  }
  return matches.reverse();
}

/**
 * Reuses the IDs of steps that still represent the same action after a text-axis edit.
 * Notes and content labels are keyed by those IDs, so this keeps them attached to the
 * action instead of to its position in the parsed array.
 */
export function reconcileTextAxisResult(previous: TextAxisParseResult, next: TextAxisParseResult): TextAxisParseResult {
  const matches = alignTextAxisSteps(previous, next);
  const previousByNextIndex = new Map(matches.map((match) => [match.nextIndex, match.previousIndex]));
  const previousSteps = previous.chart.steps;
  const nextSteps = next.chart.steps;
  const contentLabels: Record<string, string> = {};
  const steps = nextSteps.map((step, nextIndex) => {
    const previousIndex = previousByNextIndex.get(nextIndex);
    if (previousIndex === undefined) {
      if (hasOwnProperty(next.contentLabels, step.id)) contentLabels[step.id] = next.contentLabels[step.id];
      return step;
    }
    const previousStep = previousSteps[previousIndex];
    const id = previousStep.id;
    if (hasOwnProperty(next.contentLabels, step.id)) contentLabels[id] = next.contentLabels[step.id];
    else if (hasOwnProperty(previous.contentLabels, previousStep.id)) contentLabels[id] = previous.contentLabels[previousStep.id];
    const note = hasOwnProperty(step, 'note') ? step.note : previousStep.note;
    return { ...step, id, ...(note === undefined ? { note: undefined } : { note }) };
  });
  return {
    ...next,
    chart: { ...next.chart, steps },
    contentLabels
  };
}

export function textAxisResultFromChart(
  chart: ComboChart,
  contentLabels: Record<string, string>,
  startingCharacterSlot: CharacterSlot
): TextAxisParseResult {
  const stepIds = new Set(chart.steps.map((step) => step.id));
  return {
    chart: {
      ...chart,
      steps: chart.steps.map((step) => ({ ...step, samples: [...step.samples] })),
      periods: (chart.periods ?? []).map((period) => ({ ...period }))
    },
    contentLabels: Object.fromEntries(Object.entries(contentLabels).filter(([stepId]) => stepIds.has(stepId))),
    startingCharacterSlot,
    warnings: []
  };
}

function firstChineseCharacter(value: string): string {
  return Array.from(value).find((character) => /[\u3400-\u9fff]/u.test(character)) ?? '';
}

function preferredRoleNames(characters: TextAxisCharacter[], language: AppLanguage): Record<CharacterSlot, string> {
  if (language !== 'zh-CN') {
    return characters.reduce((result, character) => {
      result[character.slot] = character.names.map((name) => name.trim()).find(Boolean) || String(character.slot);
      return result;
    }, { 1: '1', 2: '2', 3: '3', 4: '4' } as Record<CharacterSlot, string>);
  }
  const chineseInitials = characters.map((character) => firstChineseCharacter(character.names.find((name) => firstChineseCharacter(name)) ?? ''));
  const counts = new Map<string, number>();
  chineseInitials.filter(Boolean).forEach((initial) => counts.set(initial, (counts.get(initial) ?? 0) + 1));
  return characters.reduce((result, character, index) => {
    const names = character.names.map((name) => name.trim()).filter(Boolean);
    const initial = chineseInitials[index];
    const fullName = names.find((name) => !/^角色\s*[1234]$/u.test(name)) ?? names[0];
    result[character.slot] = initial && counts.get(initial) === 1 ? initial : fullName || String(character.slot);
    return result;
  }, { 1: '1', 2: '2', 3: '3', 4: '4' } as Record<CharacterSlot, string>);
}

function switchSlot(step: ComboStep): CharacterSlot | null {
  const match = /^switch_([1234])$/u.exec(step.moveId);
  return match ? Number(match[1]) as CharacterSlot : null;
}

function preferredTextAxisWord(step: ComboStep, custom: string, language: AppLanguage): string | undefined {
  const chinese = language === 'zh-CN';
  if (step.moveId === 'jump') return chinese ? '跳跃' : 'Jump';
  if (step.moveId === 'jump_hold') return chinese ? '长按跳跃' : 'Hold Jump';
  if (step.moveId === 'dodge') return chinese ? '闪' : 'Dodge';
  if (step.moveId === 'dodge_hold') return chinese ? '长按闪避' : 'Hold Dodge';
  if (step.moveId === 'finisher') return chinese ? '处决' : 'Tunebreak';
  if (step.moveId === 'empty_action') return /^[fF]/u.test(custom) ? (chinese ? '处决' : 'Tunebreak') : (chinese ? '前走' : 'Move Forward');
  return undefined;
}

function stepTimeCode(step: ComboStep, contentLabels: Record<string, string>, language: AppLanguage): { code: string; hasOutro: boolean } {
  const custom = contentLabels[step.id]?.trim() ?? '';
  const fallback = defaultTextAxisCodeForMove(step.moveId) ?? step.label;
  const code = preferredTextAxisWord(step, custom, language) ?? fallback;
  const hasOutro = /y$/iu.test(custom);
  return { code: hasOutro && code.endsWith('y') ? code.slice(0, -1) : code, hasOutro  };
}

export function serializeTextAxis(
  result: TextAxisParseResult,
  characters: TextAxisCharacter[],
  language: AppLanguage = 'zh-CN'
): SerializedTextAxis {
  const roleNames = preferredRoleNames(characters, language);
  const chinese = language === 'zh-CN';
  const steps = [...result.chart.steps].sort((left, right) => left.startMin - right.startMin || left.startMax - right.startMax || left.id.localeCompare(right.id));
  const periods = [...(result.chart.periods ?? [])]
    .filter((period) => period.kind === 'startup_axis' || period.kind === 'loop_axis')
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs || left.id.localeCompare(right.id));
  const segments: TextAxisDisplaySegment[] = [];
  const insertedPeriods = new Set<string>();
  let linebreakIndex = 0;
  let pendingIntro = false;

  const appendLinebreak = () => {
    if (!segments.length || segments[segments.length - 1].kind === 'linebreak') return;
    segments.push({ key: `linebreak-${linebreakIndex++ }`, kind: 'linebreak', text: '\n' });
  };
  const appendPeriodMarkers = (beforeMs: number) => {
    periods.forEach((period) => {
      if (insertedPeriods.has(period.id) || period.startMs > beforeMs) return;
      if (segments.length) appendLinebreak();
      const loopAxisCount = periods.filter((item) => item.kind === 'loop_axis').length;
      const label = `${localizedPeriodLabel(period, language, loopAxisCount) }${chinese ? '：' : ':' }`;
      segments.push({ key: `period-${period.id }`, kind: 'marker', text: label });
      appendLinebreak();
      insertedPeriods.add(period.id);
    });
  };

  appendPeriodMarkers(0);
  segments.push({ key: 'starting-role', kind: 'role', text: `${roleNames[result.startingCharacterSlot] } `, displayText: roleNames[result.startingCharacterSlot], spaced: true });

  steps.forEach((step) => {
    appendPeriodMarkers(step.startMin);
    const slot = switchSlot(step);
    if (slot) {
      const content = result.contentLabels[step.id]?.trim() || defaultTextAxisCodeForMove(step.moveId) || '';
      pendingIntro = /b/iu.test(content);
      segments.push({ key: `step-${step.id }`, kind: 'step', stepId: step.id, text: ` ${roleNames[slot] } `, displayText: roleNames[slot], spaced: true });
      return;
    }
    const timeCode = stepTimeCode(step, result.contentLabels, language);
    const intro = pendingIntro;
    pendingIntro = false;
    const sourceText = `${intro ? ` ${chinese ? '变奏' : 'Intro' } ` : '' }${timeCode.code }${timeCode.hasOutro ? ` ${chinese ? '延奏' : 'Outro' } ` : '' }`;
    segments.push({ key: `step-${step.id }`, kind: 'step', stepId: step.id, text: sourceText, displayText: timeCode.code, intro, outro: timeCode.hasOutro });
  });

  appendPeriodMarkers(Number.POSITIVE_INFINITY);
  if (pendingIntro) {
    const introText = chinese ? '变奏' : 'Intro';
    segments.push({ key: 'trailing-intro', kind: 'marker', text: ` ${introText } `, displayText: introText, spaced: true });
  }
  return { source: segments.map((segment) => segment.text).join(''), segments };
}
