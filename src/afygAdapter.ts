import type { CharacterSlot, ComboChart, ComboImageStyle, ComboStep } from '../combo-core';
import { afygTimingReferences, normalizeAfygTimingSettings } from './afygTiming';

export const AFYG_TOOL_URL = 'https://wuwa-afyg-tool.200503.xyz/';
export const AFYG_EMBED_URL = String(import.meta.env.VITE_AFYG_EMBED_URL || AFYG_TOOL_URL).trim() || AFYG_TOOL_URL;

const AFYG_PIXELS_PER_SECOND = 60;
const AFYG_SIDE_PADDING = 48;

export type AfygOperationKeyOverrides = Record<string, string>;

export type AfygRefLine = { id: string; time: string; pos: number };
export type AfygOpBlock = {
  id: string;
  trackIndex: number;
  pos: number;
  key: string;
  desc: string;
  intro: boolean;
  switchback: boolean;
};
export type AfygDamageBlock = {
  id: string;
  trackIndex: number;
  sourceType: 'op' | 'ref';
  sourceId: string;
  skillHits: Array<{ hitName: string; skillType: string; ratio: string; element: string; character: string; hits?: number }>;
  nonDirectEntries: Array<{ name: string; category: '处决' | '响应' | '效应'; layers: number; hits?: number; responders?: string[] }>;
};
export type AfygTimelineData = { refLines: AfygRefLine[]; opBlocks: AfygOpBlock[]; damageBlocks: AfygDamageBlock[] };
export type AfygAdapterReport = {
  sourceStepCount: number;
  exportedOperationCount: number;
  referenceLineCount: number;
  unresolvedDamageCount: number;
  omittedStepCount: number;
  warnings: Array<{
    code: 'character-four-omitted' | 'timeline-truncated' | 'unknown-moves' | 'character-name-missing' | 'damage-unresolved';
    detail?: string;
  }>;
};
export type AfygExportResult = {
  file: { version: 1; exportedAt: number; project: Record<string, unknown> };
  timeline: AfygTimelineData;
  report: AfygAdapterReport;
};
export type AfygExportOptions = {
  chart: ComboChart;
  style: ComboImageStyle;
  roleNames?: Partial<Record<CharacterSlot, string>>;
  operationKeyOverrides?: AfygOperationKeyOverrides;
  baseProject?: Record<string, unknown> | null;
  now?: number;
};

const DEFAULT_OPERATION_KEYS: Record<string, string> = {
  basic_attack: 'MouseLeft', heavy_attack: 'MouseLeft', skill: 'E', skill_hold: 'E', echo: 'Q', echo_hold: 'Q',
  tool: 'T', liberation: 'R', liberation_hold: 'R', dodge: 'MouseRight', dodge_hold: 'MouseRight', jump: 'SpaceBar',
  jump_hold: 'SpaceBar', empty_action: 'W', finisher: 'F', switch_1: '1', switch_2: '2', switch_3: '3', switch_4: '4'
};
const HOLD_MOVE_IDS = new Set(['heavy_attack', 'skill_hold', 'echo_hold', 'liberation_hold', 'dodge_hold', 'jump_hold']);

function safeId(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'item';
}

export function afygOperationIdForStepId(stepId: string): string {
  return `wwcombo-op-${safeId(stepId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function phaseFromBase(baseProject: Record<string, unknown> | null | undefined, phase: string): unknown {
  const phases = isRecord(baseProject?.phases) ? baseProject.phases : null;
  return phases?.[phase];
}

function stepSort(left: ComboStep, right: ComboStep): number {
  return left.startMin - right.startMin || left.startMax - right.startMax || left.id.localeCompare(right.id);
}

function isSwitchStep(step: ComboStep): boolean {
  return /^switch_[1234]$/u.test(step.moveId);
}

function switchHasIntro(step: ComboStep, contentLabels: Record<string, string>): boolean {
  if (!isSwitchStep(step)) return false;
  const content = contentLabels[step.id]?.trim() ?? '';
  return /(?:^|[^a-z])i{1,4}b(?:$|[^a-z])/iu.test(content) || /\bintro\b/iu.test(content) || content.includes('变奏');
}

function operationDescription(step: ComboStep, contentLabels: Record<string, string>): string {
  const label = contentLabels[step.id]?.trim() || step.label || step.moveId;
  if (!HOLD_MOVE_IDS.has(step.moveId) || /hold|长按/iu.test(label)) return label;
  return `长按${label}`;
}

function positionForMs(ms: number): number {
  return AFYG_SIDE_PADDING + Math.max(0, ms) * AFYG_PIXELS_PER_SECOND / 1000;
}

function emptyEchoes() {
  return [0, 1, 2, 3, 4].map(() => ({ name: null, cost: 0 }));
}

function roleNameForSlot(options: AfygExportOptions, slot: CharacterSlot): string {
  return options.roleNames?.[slot]?.trim() || options.style.roleStyles[slot]?.name?.trim() || '';
}

function chartDurationMs(chart: ComboChart, exportedSteps: ComboStep[]): number {
  const stepEnd = exportedSteps.reduce((maximum, step) => Math.max(maximum, step.startMin + step.durationMax), 0);
  const periodEnd = (chart.periods ?? []).reduce((maximum, period) => Math.max(maximum, period.endMs), 0);
  return Math.max(1, chart.timelineDurationMs ?? 0, stepEnd, periodEnd);
}

export function defaultAfygOperationKey(moveId: string, fallbackLabel = ''): string {
  return DEFAULT_OPERATION_KEYS[moveId] || fallbackLabel.trim() || moveId;
}

export function buildAfygDirectImportUrl(file: AfygExportResult['file'], baseUrl = AFYG_EMBED_URL): string {
  const json = JSON.stringify(file);
  const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  return `${baseUrl.replace(/#.*$/u, '')}#import_project=${encodeURIComponent(dataUrl)}`;
}

export function buildAfygProject(options: AfygExportOptions): AfygExportResult {
  const { chart, style } = options;
  const now = options.now ?? Date.now();
  const warnings: AfygAdapterReport['warnings'] = [];
  const contentLabels = { ...(style.contentLabels ?? {}), ...(chart.contentLabels ?? {}) };
  const sortedSteps = [...chart.steps].sort(stepSort);
  const supportedSteps = sortedSteps.filter((step) => (step.characterSlot ?? 1) <= 3);
  const omittedStepCount = sortedSteps.length - supportedSteps.length;
  const durationMs = chartDurationMs(chart, supportedSteps);

  if (sortedSteps.some((step) => (step.characterSlot ?? 1) === 4)) warnings.push({ code: 'character-four-omitted' });

  const unknownMoves = new Set<string>();
  const seenTracks = new Set<number>();
  let previousTrack = -1;
  let activeCharacterTrack = 0;
  const opBlocks = supportedSteps.map<AfygOpBlock>((step) => {
    if (step.characterSlot !== undefined) activeCharacterTrack = Math.max(0, Math.min(2, step.characterSlot - 1));
    const trackIndex = step.characterSlot === undefined ? activeCharacterTrack : Math.max(0, Math.min(2, step.characterSlot - 1));
    const override = options.operationKeyOverrides?.[step.moveId]?.trim();
    if (!override && !DEFAULT_OPERATION_KEYS[step.moveId]) unknownMoves.add(step.moveId);
    const intro = switchHasIntro(step, contentLabels);
    const switchback = step.characterSlot !== undefined && !intro && previousTrack !== -1 && previousTrack !== trackIndex && seenTracks.has(trackIndex);
    if (step.characterSlot !== undefined) {
      seenTracks.add(trackIndex);
      previousTrack = trackIndex;
    }
    return {
      id: afygOperationIdForStepId(step.id),
      trackIndex,
      pos: positionForMs(step.startMin),
      key: override || defaultAfygOperationKey(step.moveId, step.label),
      desc: operationDescription(step, contentLabels),
      intro,
      switchback
    };
  });
  if (unknownMoves.size) warnings.push({ code: 'unknown-moves', detail: [...unknownMoves].join(', ') });

  const refs = afygTimingReferences(chart, durationMs);
  const refLines = refs.map<AfygRefLine>((entry) => ({ id: entry.id, time: `${entry.label} ${(entry.gameTimeMs / 1000).toFixed(2)}s`, pos: positionForMs(entry.timelineMs) }));
  const timeline: AfygTimelineData = { refLines, opBlocks, damageBlocks: [] };
  const roleNames = ([1, 2, 3] as CharacterSlot[]).map((slot) => roleNameForSlot(options, slot));
  roleNames.forEach((name, index) => {
    if (!name || /^(?:角色|character)\s*[1234]$/iu.test(name)) warnings.push({ code: 'character-name-missing', detail: String(index + 1) });
  });
  warnings.push({ code: 'damage-unresolved' });

  const baseProject = options.baseProject && isRecord(options.baseProject) ? options.baseProject : null;
  const generatedTeam = roleNames.map((character) => ({ character: character || null, weapon: null, triggerSets: [], echoes: emptyEchoes() }));
  const team = Array.isArray(baseProject?.team) && baseProject.team.length ? baseProject.team : generatedTeam;
  const timings = refs.map((entry) => ({ refLineId: entry.id, seconds: Number((entry.gameTimeMs / 1000).toFixed(3)) }));
  const baseResultAnalysis = isRecord(baseProject?.resultAnalysis) ? baseProject.resultAnalysis : {};
  const sourceProjectId = typeof baseProject?.id === 'string' ? baseProject.id : '';
  const sourceProjectName = typeof baseProject?.name === 'string' ? baseProject.name.trim() : '';
  const project = {
    ...(baseProject ?? {}),
    id: sourceProjectId ? `${safeId(sourceProjectId)}-wwcombo-${now}` : `wwcombo-afyg-${safeId(chart.id)}-${now}`,
    name: sourceProjectName ? `${sourceProjectName} - WWCombo` : `${chart.title || 'WWCombo'} - AFYG`,
    createdAt: now,
    team,
    customSkillHits: isRecord(baseProject?.customSkillHits) ? baseProject.customSkillHits : {},
    resultAnalysis: { ...baseResultAnalysis, timings },
    phases: {
      team: phaseFromBase(baseProject, 'team') ?? { locked: false, data: null },
      timeline: { locked: false, data: timeline },
      calculation: phaseFromBase(baseProject, 'calculation') ?? { locked: false, data: null },
      config: phaseFromBase(baseProject, 'config') ?? { locked: false, data: null }
    },
    wwcomboAdapter: {
      version: 2,
      sourceChartId: chart.id,
      sourceChartUpdatedAt: chart.updatedAt,
      baseProjectId: sourceProjectId || null,
      timings,
      timeMap: {
        version: 1,
        keyframes: normalizeAfygTimingSettings(chart.afygTiming)?.keyframes ?? [],
        samples: refs.map((entry) => ({ timelineMs: entry.timelineMs, gameTimeMs: entry.gameTimeMs, kind: entry.kind }))
      }
    }
  };
  return {
    file: { version: 1, exportedAt: now, project }, timeline,
    report: {
      sourceStepCount: sortedSteps.length, exportedOperationCount: opBlocks.length, referenceLineCount: refLines.length,
      unresolvedDamageCount: opBlocks.length, omittedStepCount, warnings
    }
  };
}
