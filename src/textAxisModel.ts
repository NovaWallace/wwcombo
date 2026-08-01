import type { CharacterSlot, ComboChart, ComboStep } from '../combo-core';
import type { AppLanguage } from './i18n';
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
    }, { 1: '1', 2: '2', 3: '3' } as Record<CharacterSlot, string>);
  }
  const chineseInitials = characters.map((character) => firstChineseCharacter(character.names.find((name) => firstChineseCharacter(name)) ?? ''));
  const counts = new Map<string, number>();
  chineseInitials.filter(Boolean).forEach((initial) => counts.set(initial, (counts.get(initial) ?? 0) + 1));
  return characters.reduce((result, character, index) => {
    const names = character.names.map((name) => name.trim()).filter(Boolean);
    const initial = chineseInitials[index];
    const fullName = names.find((name) => !/^角色\s*[123]$/u.test(name)) ?? names[0];
    result[character.slot] = initial && counts.get(initial) === 1 ? initial : fullName || String(character.slot);
    return result;
  }, { 1: '1', 2: '2', 3: '3' } as Record<CharacterSlot, string>);
}

function switchSlot(step: ComboStep): CharacterSlot | null {
  const match = /^switch_([123])$/u.exec(step.moveId);
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
  const hasOutro = custom.endsWith('y');
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
      const label = period.kind === 'startup_axis'
        ? (chinese ? '启动轴：' : 'Startup Axis:')
        : chinese
          ? `${period.label || (loopAxisCount === 1 ? '循环轴' : `循环轴${period.loopIndex ?? 1 }`) }：`
          : `${loopAxisCount === 1 ? 'Loop Axis' : `Loop Axis ${period.loopIndex ?? 1 }` }:`;
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
