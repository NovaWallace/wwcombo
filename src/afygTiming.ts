import type { AfygTimingKeyframe, AfygTimingSettings, ComboChart } from '../combo-core';

export type AfygTimingBoundary = {
  id: string;
  timelineMs: number;
  gameTimeMs: number;
  kind: 'axis-boundary';
};

export type AfygTimingReference = {
  id: string;
  timelineMs: number;
  gameTimeMs: number;
  label: string;
  kind: AfygTimingKeyframe['kind'] | 'axis-boundary' | 'chart-end';
};

const MAX_TIMING_MS = 10 * 60 * 1000;

function finiteMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(MAX_TIMING_MS, Math.round(value)));
}

export function normalizeAfygTimingSettings(value: unknown): AfygTimingSettings | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as { keyframes?: unknown };
  if (!Array.isArray(source.keyframes)) return undefined;
  const ids = new Set<string>();
  const keyframes = source.keyframes.flatMap((raw): AfygTimingKeyframe[] => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const entry = raw as Partial<AfygTimingKeyframe>;
    const timelineMs = finiteMs(entry.timelineMs);
    const gameTimeMs = finiteMs(entry.gameTimeMs);
    const kind = entry.kind === 'pause-start' || entry.kind === 'pause-end' ? entry.kind : 'manual';
    const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : '';
    if (!id || ids.has(id) || timelineMs === null || gameTimeMs === null) return [];
    ids.add(id);
    return [{ id, timelineMs, gameTimeMs, kind, ...(typeof entry.pairId === 'string' && entry.pairId.trim() ? { pairId: entry.pairId.trim() } : {}) }];
  }).sort((left, right) => left.timelineMs - right.timelineMs || left.id.localeCompare(right.id));
  const validPairIds = new Set<string>();
  const pairGroups = new Map<string, AfygTimingKeyframe[]>();
  keyframes.forEach((entry) => {
    if (!entry.pairId) return;
    const group = pairGroups.get(entry.pairId) ?? [];
    group.push(entry);
    pairGroups.set(entry.pairId, group);
  });
  pairGroups.forEach((group, pairId) => {
    if (group.length === 2 && group.some((entry) => entry.kind === 'pause-start') && group.some((entry) => entry.kind === 'pause-end')) validPairIds.add(pairId);
  });
  const normalized = keyframes.map((entry): AfygTimingKeyframe => {
    if (!entry.pairId || !validPairIds.has(entry.pairId)) return { ...entry, kind: 'manual', pairId: undefined };
    return entry;
  });
  return normalized.length ? { version: 1, keyframes: normalized } : undefined;
}

export function mapTimelineToGameTime(timelineMs: number, settings: AfygTimingSettings | undefined): number {
  const target = Math.max(0, Math.round(timelineMs));
  const anchors = normalizeAfygTimingSettings(settings)?.keyframes ?? [];
  if (!anchors.length) return target;
  const first = anchors[0];
  if (target <= first.timelineMs) return Math.max(0, first.gameTimeMs - (first.timelineMs - target));
  for (let index = 1; index < anchors.length; index += 1) {
    const previous = anchors[index - 1];
    const next = anchors[index];
    if (target > next.timelineMs) continue;
    const span = next.timelineMs - previous.timelineMs;
    if (span <= 0) return Math.max(0, next.gameTimeMs);
    const ratio = (target - previous.timelineMs) / span;
    return Math.max(0, Math.round(previous.gameTimeMs + (next.gameTimeMs - previous.gameTimeMs) * ratio));
  }
  const last = anchors[anchors.length - 1];
  return Math.max(0, last.gameTimeMs + (target - last.timelineMs));
}

export function afygAxisBoundaries(chart: Pick<ComboChart, 'periods' | 'afygTiming'>): AfygTimingBoundary[] {
  const times = new Set<number>();
  const axes = (chart.periods ?? [])
    .filter((period) => period.kind === 'startup_axis' || period.kind === 'loop_axis')
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  axes.forEach((period, index) => {
    if (period.startMs > 0) times.add(Math.round(period.startMs));
    const next = axes[index + 1];
    if (next && Math.abs(period.endMs - next.startMs) <= 2) times.add(Math.round(period.endMs));
  });
  return [...times].sort((left, right) => left - right).map((timelineMs) => ({
    id: `wwcombo-axis-boundary-${timelineMs}`,
    timelineMs,
    gameTimeMs: mapTimelineToGameTime(timelineMs, chart.afygTiming),
    kind: 'axis-boundary'
  }));
}

export function afygTimingReferences(chart: ComboChart, durationMs: number): AfygTimingReference[] {
  const settings = normalizeAfygTimingSettings(chart.afygTiming);
  const references: AfygTimingReference[] = [
    ...(settings?.keyframes ?? []).map((entry) => ({
      id: `wwcombo-timing-${entry.id}`,
      timelineMs: entry.timelineMs,
      gameTimeMs: entry.gameTimeMs,
      label: entry.kind === 'pause-start' ? 'Pause Start' : entry.kind === 'pause-end' ? 'Pause End' : 'Timing',
      kind: entry.kind
    })),
    ...afygAxisBoundaries({ ...chart, afygTiming: settings }).map((entry) => ({ ...entry, label: 'Axis Boundary' })),
    {
      id: 'wwcombo-chart-end',
      timelineMs: Math.max(1, Math.round(durationMs)),
      gameTimeMs: mapTimelineToGameTime(durationMs, settings),
      label: 'Chart End',
      kind: 'chart-end' as const
    }
  ];
  const byTimeAndKind = new Map<string, AfygTimingReference>();
  references.sort((left, right) => left.timelineMs - right.timelineMs).forEach((entry) => {
    const key = `${entry.timelineMs}:${entry.kind}`;
    if (!byTimeAndKind.has(key) || entry.kind === 'chart-end') byTimeAndKind.set(key, entry);
  });
  return [...byTimeAndKind.values()].sort((left, right) => left.timelineMs - right.timelineMs || left.id.localeCompare(right.id));
}

export function createAfygTimingKeyframe(timelineMs: number, settings: AfygTimingSettings | undefined): AfygTimingKeyframe {
  const normalized = normalizeAfygTimingSettings(settings);
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `timing-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    timelineMs: Math.max(0, Math.round(timelineMs)),
    gameTimeMs: mapTimelineToGameTime(timelineMs, normalized),
    kind: 'manual'
  };
}

export function pairAfygTimingKeyframe(settings: AfygTimingSettings | undefined, keyframeId: string, endTimelineMs: number): AfygTimingSettings | undefined {
  const normalized = normalizeAfygTimingSettings(settings);
  const source = normalized?.keyframes.find((entry) => entry.id === keyframeId);
  if (!source) return normalized;
  const endMs = Math.max(source.timelineMs + 1, Math.round(endTimelineMs));
  const pairId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `pair-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const end = createAfygTimingKeyframe(endMs, normalized);
  return normalizeAfygTimingSettings({
    version: 1,
    keyframes: normalized!.keyframes.map((entry) => entry.id === keyframeId
      ? { ...entry, kind: 'pause-start', pairId }
      : entry).concat({ ...end, gameTimeMs: source.gameTimeMs, kind: 'pause-end', pairId })
  });
}

export function updateAfygTimingKeyframe(settings: AfygTimingSettings | undefined, keyframeId: string, gameTimeMs: number): AfygTimingSettings | undefined {
  const normalized = normalizeAfygTimingSettings(settings);
  const source = normalized?.keyframes.find((entry) => entry.id === keyframeId);
  if (!source) return normalized;
  const nextTime = Math.max(0, Math.round(gameTimeMs));
  return normalizeAfygTimingSettings({
    version: 1,
    keyframes: normalized!.keyframes.map((entry) => entry.id === keyframeId || source.pairId && entry.pairId === source.pairId
      ? { ...entry, gameTimeMs: nextTime }
      : entry)
  });
}

export function moveAfygTimingKeyframe(settings: AfygTimingSettings | undefined, keyframeId: string, timelineMs: number): AfygTimingSettings | undefined {
  const normalized = normalizeAfygTimingSettings(settings);
  const source = normalized?.keyframes.find((entry) => entry.id === keyframeId);
  if (!source) return normalized;
  const pair = source.pairId
    ? normalized!.keyframes.find((entry) => entry.id !== source.id && entry.pairId === source.pairId)
    : undefined;
  let nextTimelineMs = Math.max(0, Math.round(timelineMs));
  if (pair && source.kind === 'pause-start') nextTimelineMs = Math.min(nextTimelineMs, Math.max(0, pair.timelineMs - 1));
  if (pair && source.kind === 'pause-end') nextTimelineMs = Math.max(nextTimelineMs, pair.timelineMs + 1);
  return normalizeAfygTimingSettings({
    version: 1,
    keyframes: normalized!.keyframes.map((entry) => entry.id === keyframeId
      ? { ...entry, timelineMs: nextTimelineMs }
      : entry)
  });
}

export function deleteAfygTimingKeyframe(settings: AfygTimingSettings | undefined, keyframeId: string): AfygTimingSettings | undefined {
  const normalized = normalizeAfygTimingSettings(settings);
  const source = normalized?.keyframes.find((entry) => entry.id === keyframeId);
  if (!source) return normalized;
  return normalizeAfygTimingSettings({
    version: 1,
    keyframes: normalized!.keyframes.filter((entry) => entry.id !== keyframeId && (!source.pairId || entry.pairId !== source.pairId))
  });
}
