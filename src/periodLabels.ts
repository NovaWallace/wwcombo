import type { ComboChart, ComboPeriod } from '../combo-core';
import { localizeEnglish } from './i18n';
import type { AppLanguage } from './i18n';

const DEFAULT_OPENER_LABEL = /^(?:启动轴|startup\s+axis|opener)$/iu;
const DEFAULT_LOOP_LABEL = /^(?:循环轴\s*\d*|loop(?:\s+axis)?\s*\d*)$/iu;

function numericSuffix(value: string): number | null {
  const match = /(\d+)\s*$/u.exec(value.trim());
  return match ? Number(match[1]) : null;
}

export function localizedPeriodLabel(
  period: Pick<ComboPeriod, 'kind' | 'label' | 'loopIndex'>,
  language: AppLanguage,
  loopCount = 1
): string {
  const source = period.label?.trim() ?? '';
  if (period.kind === 'startup_axis') {
    if (source && !DEFAULT_OPENER_LABEL.test(source)) return source;
    return language === 'zh-CN' ? '启动轴' : localizeEnglish('Opener', language);
  }
  if (period.kind === 'loop_axis') {
    if (source && !DEFAULT_LOOP_LABEL.test(source)) return source;
    const index = period.loopIndex ?? numericSuffix(source) ?? 1;
    if (language === 'zh-CN') return loopCount > 1 ? `循环轴${index}` : '循环轴';
    return localizeEnglish(loopCount > 1 ? `Loop ${index}` : 'Loop', language);
  }
  return source;
}

export function currentPeriodLabelAtTime(chart: ComboChart | null, timeMs: number, language: AppLanguage): string {
  if (!chart?.periods?.length) return '';
  const periods = chart.periods
    .filter((period) => period.kind === 'startup_axis' || period.kind === 'loop_axis')
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs || left.id.localeCompare(right.id));
  const period = periods.find((candidate) => timeMs >= candidate.startMs && timeMs <= candidate.endMs);
  if (!period) return '';
  const loopCount = periods.filter((candidate) => candidate.kind === 'loop_axis').length;
  return localizedPeriodLabel(period, language, loopCount);
}

export function currentPeriodLabelAtStep(chart: ComboChart | null, stepIndex: number, language: AppLanguage): string {
  if (!chart?.steps.length) return currentPeriodLabelAtTime(chart, 0, language);
  const safeIndex = Math.max(0, Math.min(stepIndex, chart.steps.length - 1));
  return currentPeriodLabelAtTime(chart, chart.steps[safeIndex]?.startMin ?? 0, language);
}
