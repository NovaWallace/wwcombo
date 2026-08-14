import { ComboRecorder } from '../combo-core';
import type { CharacterSlot, ComboChart, KeyBinding, MoveDefinition } from '../combo-core';

export type VideoRecognitionBounds = { x: number; y: number; width: number; height: number };

export type VideoRecognitionHotspot = {
  id: string;
  moveId: string;
  holdMoveId?: string;
  holdThresholdMs?: number;
  contentLabel?: string;
  x: number;
  y: number;
  radius: number;
};

export type VideoRecognitionRequestHotspot = {
  id: string;
  x: number;
  y: number;
  radius: number;
  mergeRepeatedHold: boolean;
  preserveTapGaps: boolean;
  sensitivity: number;
};

export type VideoRecognitionRequest = {
  sourcePath: string;
  startMs: number;
  durationMs: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  fps: number;
  hotspots: VideoRecognitionRequestHotspot[];
};

export type VideoRecognitionEvent = {
  hotspotId: string;
  startMs: number;
  durationMs: number;
  confidence: number;
};

export type VideoRecognitionResult = {
  events: VideoRecognitionEvent[];
  analyzedFrames: number;
  fps: number;
};

export type CombinedVideoRecognitionResult = {
  chart: ComboChart;
  contentLabels: Record<string, string>;
  matchedSteps: number;
};

export type VideoRecognitionProgress = {
  progress: number;
  processedFrames: number;
  totalFrames: number;
};

export const KEY_MAPPING_CANVAS_ASPECT = 620 / 514;
export const VIDEO_RECOGNITION_FPS = 30;

export const DEFAULT_VIDEO_RECOGNITION_HOTSPOTS: VideoRecognitionHotspot[] = [
  { id: 'switch-1', moveId: 'switch_1', x: 16.37, y: 18.77, radius: 5.56 },
  { id: 'switch-2', moveId: 'switch_2', x: 34.27, y: 18.77, radius: 5.56 },
  { id: 'switch-3', moveId: 'switch_3', x: 51.53, y: 18.77, radius: 5.56 },
  { id: 'basic-attack', moveId: 'basic_attack', holdMoveId: 'heavy_attack', holdThresholdMs: 200, x: 19.27, y: 45.33, radius: 8.84 },
  { id: 'jump', moveId: 'jump', holdMoveId: 'jump_hold', holdThresholdMs: 300, x: 43.23, y: 52.92, radius: 6.21 },
  { id: 'tool', moveId: 'tool', x: 63.23, y: 52.82, radius: 6.21 },
  { id: 'finisher', moveId: 'video_finisher', contentLabel: 'f', x: 83.87, y: 52.72, radius: 6.21 },
  { id: 'dodge', moveId: 'dodge', holdMoveId: 'dodge_hold', holdThresholdMs: 300, x: 19.27, y: 78.02, radius: 8.84 },
  { id: 'skill', moveId: 'skill', holdMoveId: 'skill_hold', holdThresholdMs: 300, x: 42.9, y: 77.72, radius: 6.21 },
  { id: 'liberation', moveId: 'liberation', holdMoveId: 'liberation_hold', holdThresholdMs: 300, x: 63.23, y: 77.72, radius: 6.21 },
  { id: 'echo', moveId: 'echo', holdMoveId: 'echo_hold', holdThresholdMs: 300, x: 83.71, y: 77.63, radius: 6.21 }
];

const VIDEO_FINISHER_MOVE: MoveDefinition = {
  id: 'video_finisher',
  label: '处决',
  color: '#f5c542',
  independent: false,
  priority: 0,
  advancesStep: false
};

type RecognitionOperation = {
  time: number;
  priority: number;
  kind: 'press' | 'hold' | 'release';
  hotspot: VideoRecognitionHotspot;
  event: VideoRecognitionEvent;
  sourceCode: string;
  holdCode?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function evenDimension(value: number, minimum: number, maximum: number): number {
  const bounded = clamp(value, minimum, maximum);
  const even = bounded - (bounded % 2);
  return Math.max(minimum, even);
}

export function normalizeVideoRecognitionBounds(value: VideoRecognitionBounds): VideoRecognitionBounds {
  const width = clamp(Number(value.width) || 26, 8, 100);
  const height = clamp(Number(value.height) || 22, 6, 100);
  return {
    x: clamp(Number(value.x) || 0, 0, Math.max(0, 100 - width)),
    y: clamp(Number(value.y) || 0, 0, Math.max(0, 100 - height)),
    width,
    height
  };
}

export function recognitionHeightForWidth(widthPercent: number, videoWidth: number, videoHeight: number): number {
  return widthPercent * (Math.max(1, videoWidth) / Math.max(1, videoHeight)) / KEY_MAPPING_CANVAS_ASPECT;
}

export function buildVideoRecognitionRequest(
  sourcePath: string,
  startMs: number,
  durationMs: number,
  videoWidth: number,
  videoHeight: number,
  boundsInput: VideoRecognitionBounds
): VideoRecognitionRequest {
  const bounds = normalizeVideoRecognitionBounds(boundsInput);
  const cropX = clamp(Math.round((bounds.x / 100) * videoWidth), 0, Math.max(0, videoWidth - 8)) & ~1;
  const cropY = clamp(Math.round((bounds.y / 100) * videoHeight), 0, Math.max(0, videoHeight - 8)) & ~1;
  const cropWidth = evenDimension(Math.round((bounds.width / 100) * videoWidth), 8, Math.max(8, videoWidth - cropX));
  const cropHeight = evenDimension(Math.round((bounds.height / 100) * videoHeight), 8, Math.max(8, videoHeight - cropY));
  return {
    sourcePath,
    startMs: Math.max(0, Math.round(startMs)),
    durationMs: Math.max(1, Math.round(durationMs)),
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    fps: VIDEO_RECOGNITION_FPS,
    hotspots: DEFAULT_VIDEO_RECOGNITION_HOTSPOTS.map((hotspot) => ({
      id: hotspot.id,
      x: (hotspot.x / 100) * cropWidth,
      y: (hotspot.y / 100) * cropHeight,
      radius: Math.max(3, (hotspot.radius / 100) * cropWidth),
      // Keyboard holds appear as repeated blue pulses in captured video. Mouse-left
      // basic attacks must stay unmerged so rapid "a..." strings remain separate taps.
      mergeRepeatedHold: Boolean(hotspot.holdMoveId && hotspot.id !== 'basic-attack'),
      preserveTapGaps: hotspot.id === 'basic-attack',
      sensitivity: hotspot.id.startsWith('switch-') ? 0.68 : 1
    }))
  };
}

function recognitionBindings(hotspots: VideoRecognitionHotspot[]): KeyBinding[] {
  const bindings = new Map<string, KeyBinding>();
  for (const hotspot of hotspots) {
    const sourceCode = `VideoRecognition:${hotspot.id}`;
    bindings.set(hotspot.moveId, { moveId: hotspot.moveId, inputs: [{ code: sourceCode, label: hotspot.id }] });
    if (hotspot.holdMoveId) {
      bindings.set(hotspot.holdMoveId, {
        moveId: hotspot.holdMoveId,
        inputs: [{ code: `${sourceCode}Hold`, label: `${hotspot.id} hold` }]
      });
    }
  }
  return [...bindings.values()];
}

function recognitionOperations(events: VideoRecognitionEvent[], hotspots: Map<string, VideoRecognitionHotspot>): RecognitionOperation[] {
  return events.flatMap((event) => {
    const hotspot = hotspots.get(event.hotspotId);
    if (!hotspot) return [];
    const sourceCode = `VideoRecognition:${hotspot.id}`;
    const duration = Math.max(35, event.durationMs);
    const releaseTime = event.startMs + duration;
    const isHold = Boolean(hotspot.holdMoveId && hotspot.holdThresholdMs && duration >= hotspot.holdThresholdMs);
    const operations: RecognitionOperation[] = [
      { time: event.startMs, priority: 2, kind: 'press', hotspot, event, sourceCode }
    ];
    if (isHold && hotspot.holdMoveId && hotspot.holdThresholdMs) {
      operations.push({
        time: event.startMs + hotspot.holdThresholdMs,
        priority: 1,
        kind: 'hold',
        hotspot,
        event,
        sourceCode,
        holdCode: `${sourceCode}Hold`
      });
    }
    operations.push({
      time: releaseTime,
      priority: 0,
      kind: 'release',
      hotspot,
      event,
      sourceCode,
      holdCode: isHold ? `${sourceCode}Hold` : undefined
    });
    return operations;
  }).sort((left, right) => {
    const leftSwitchPriority = left.kind === 'press' && left.hotspot.moveId.startsWith('switch_') ? 0 : 1;
    const rightSwitchPriority = right.kind === 'press' && right.hotspot.moveId.startsWith('switch_') ? 0 : 1;
    return left.time - right.time
      || left.priority - right.priority
      || leftSwitchPriority - rightSwitchPriority
      || left.hotspot.id.localeCompare(right.hotspot.id);
  });
}

export function recognizedChartFromVideo(
  sourceChart: ComboChart,
  moves: MoveDefinition[],
  startingCharacterSlot: CharacterSlot,
  result: VideoRecognitionResult,
  timelineDurationMs: number
): { chart: ComboChart; contentLabels: Record<string, string> } {
  const hotspots = new Map(DEFAULT_VIDEO_RECOGNITION_HOTSPOTS.map((hotspot) => [hotspot.id, hotspot]));
  const temporaryMoves = moves.some((move) => move.id === VIDEO_FINISHER_MOVE.id) ? moves : [...moves, VIDEO_FINISHER_MOVE];
  const recorder = new ComboRecorder({
    moves: temporaryMoves,
    bindings: recognitionBindings(DEFAULT_VIDEO_RECOGNITION_HOTSPOTS),
    startTriggerMoveId: 'start_challenge',
    stopTriggerMoveId: 'stop_recording',
    startingCharacterSlot
  });
  recorder.start(0);
  for (const operation of recognitionOperations(result.events, hotspots)) {
    if (operation.kind === 'press') {
      recorder.accept({ type: 'keydown', code: operation.sourceCode, time: operation.time });
      continue;
    }
    const holdThresholdMs = operation.hotspot.holdThresholdMs ?? 0;
    const holdStartTime = operation.event.startMs + holdThresholdMs;
    if (operation.kind === 'hold' && operation.holdCode) {
      recorder.convertHold({
        sourceCode: operation.sourceCode,
        holdCode: operation.holdCode,
        pressTime: operation.event.startMs,
        holdStartTime,
        releaseTime: holdStartTime
      });
      continue;
    }
    if (operation.holdCode) {
      recorder.extendPress(operation.holdCode, holdStartTime, operation.time);
    } else {
      recorder.finishPress(operation.sourceCode, operation.event.startMs, operation.time);
    }
  }
  recorder.stop(Math.max(0, timelineDurationMs));
  const recorded = recorder.toChart(sourceChart.title);
  const emptyMove = moves.find((move) => move.id === 'empty_action');
  const contentLabels: Record<string, string> = {};
  const steps = recorded.steps.map((step) => {
    if (step.moveId !== VIDEO_FINISHER_MOVE.id) return step;
    contentLabels[step.id] = 'f';
    return {
      ...step,
      moveId: 'empty_action',
      label: emptyMove?.label ?? '空招式',
      color: emptyMove?.color ?? '#f5c542',
      independent: emptyMove?.independent ?? false,
      advancesStep: emptyMove?.advancesStep ?? false,
      lane: 'main' as const
    };
  });
  return {
    chart: {
      ...sourceChart,
      steps,
      periods: [],
      timelineDurationMs: Math.max(0, Math.round(timelineDurationMs)),
      updatedAt: Date.now()
    },
    contentLabels
  };
}

function stepRecognitionKey(step: ComboChart['steps'][number], contentLabels: Record<string, string>): string {
  const content = (contentLabels[step.id] ?? '').trim().toLowerCase();
  if (step.moveId === 'empty_action') {
    if (content.startsWith('f')) return 'empty:f';
    if (content.startsWith('w')) return 'empty:w';
    return 'empty';
  }
  if (/^switch_[1234]$/.test(step.moveId)) return step.moveId;
  if (step.moveId === 'heavy_attack') return 'basic_attack_hold';
  return step.moveId;
}

function recognitionMatchCost(
  existing: ComboChart['steps'][number],
  recognized: ComboChart['steps'][number],
  existingLabels: Record<string, string>,
  recognizedLabels: Record<string, string>
): number | null {
  const existingKey = stepRecognitionKey(existing, existingLabels);
  const recognizedKey = stepRecognitionKey(recognized, recognizedLabels);
  if (existingKey === recognizedKey) return 0;
  if (existingKey === 'empty' || recognizedKey === 'empty') return existing.moveId === recognized.moveId ? 0.35 : null;
  const existingFamily = existingKey.replace(/_hold$/u, '');
  const recognizedFamily = recognizedKey.replace(/_hold$/u, '');
  return existingFamily === recognizedFamily ? 0.35 : null;
}

function interpolateRecognitionTime(value: number, anchors: Array<{ source: number; target: number }>): number {
  if (!anchors.length) return Math.max(0, value);
  if (anchors.length === 1) return Math.max(0, anchors[0].target + value - anchors[0].source);
  if (value <= anchors[0].source) return Math.max(0, anchors[0].target + value - anchors[0].source);
  const last = anchors[anchors.length - 1];
  if (value >= last.source) return Math.max(0, last.target + value - last.source);
  for (let index = 1; index < anchors.length; index += 1) {
    const right = anchors[index];
    const left = anchors[index - 1];
    if (value > right.source) continue;
    const span = Math.max(1, right.source - left.source);
    const ratio = (value - left.source) / span;
    return Math.max(0, left.target + (right.target - left.target) * ratio);
  }
  return Math.max(0, value);
}

export function combineVideoRecognitionWithExistingChart(
  existingChart: ComboChart,
  existingContentLabels: Record<string, string>,
  recognized: { chart: ComboChart; contentLabels: Record<string, string> },
  timelineDurationMs: number
): CombinedVideoRecognitionResult {
  const existingSteps = [...existingChart.steps].sort((left, right) => left.startMin - right.startMin || left.id.localeCompare(right.id));
  const recognizedSteps = [...recognized.chart.steps].sort((left, right) => left.startMin - right.startMin || left.id.localeCompare(right.id));
  const rows = existingSteps.length + 1;
  const columns = recognizedSteps.length + 1;
  const costs = Array.from({ length: rows }, () => Array<number>(columns).fill(Number.POSITIVE_INFINITY));
  const choices = Array.from({ length: rows }, () => Array<'match' | 'skip-existing' | 'skip-recognized' | null>(columns).fill(null));
  costs[0][0] = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const current = costs[row][column];
      if (!Number.isFinite(current)) continue;
      if (row < existingSteps.length && current + 1.25 < costs[row + 1][column]) {
        costs[row + 1][column] = current + 1.25;
        choices[row + 1][column] = 'skip-existing';
      }
      if (column < recognizedSteps.length && current + 0.85 < costs[row][column + 1]) {
        costs[row][column + 1] = current + 0.85;
        choices[row][column + 1] = 'skip-recognized';
      }
      if (row < existingSteps.length && column < recognizedSteps.length) {
        const matchCost = recognitionMatchCost(existingSteps[row], recognizedSteps[column], existingContentLabels, recognized.contentLabels);
        if (matchCost !== null && current + matchCost < costs[row + 1][column + 1]) {
          costs[row + 1][column + 1] = current + matchCost;
          choices[row + 1][column + 1] = 'match';
        }
      }
    }
  }

  const matches = new Map<string, ComboChart['steps'][number]>();
  const anchors: Array<{ source: number; target: number }> = [];
  let row = existingSteps.length;
  let column = recognizedSteps.length;
  while (row > 0 || column > 0) {
    const choice = choices[row][column];
    if (choice === 'match') {
      const existing = existingSteps[row - 1];
      const matched = recognizedSteps[column - 1];
      matches.set(existing.id, matched);
      anchors.push({ source: existing.startMin, target: matched.startMin });
      row -= 1;
      column -= 1;
    } else if (choice === 'skip-existing') {
      row -= 1;
    } else if (choice === 'skip-recognized') {
      column -= 1;
    } else if (row > 0) {
      row -= 1;
    } else {
      column -= 1;
    }
  }
  anchors.sort((left, right) => left.source - right.source);

  const steps = existingChart.steps.map((step) => {
    const matched = matches.get(step.id);
    if (matched) {
      return {
        ...step,
        startMin: matched.startMin,
        startMax: matched.startMax,
        durationMin: matched.durationMin,
        durationMax: matched.durationMax,
        preheatMs: matched.preheatMs,
        recoveryMs: matched.recoveryMs,
        samples: matched.samples.map((sample) => ({ ...sample }))
      };
    }
    const mappedStart = Math.round(interpolateRecognitionTime(step.startMin, anchors));
    const shift = mappedStart - step.startMin;
    return {
      ...step,
      startMin: mappedStart,
      startMax: Math.max(mappedStart, step.startMax + shift),
      samples: step.samples.map((sample) => ({ ...sample, startTime: Math.max(0, sample.startTime + shift) }))
    };
  });
  const mapPeriodTime = (value: number) => Math.round(interpolateRecognitionTime(value, anchors));
  const periods = (existingChart.periods ?? []).map((period) => ({
    ...period,
    startMs: mapPeriodTime(period.startMs),
    endMs: Math.max(mapPeriodTime(period.startMs), mapPeriodTime(period.endMs))
  }));
  const endMs = Math.max(
    timelineDurationMs,
    ...steps.map((step) => step.startMin + step.durationMax),
    ...periods.map((period) => period.endMs),
    0
  );
  return {
    chart: { ...existingChart, steps, periods, timelineDurationMs: Math.round(endMs), updatedAt: Date.now() },
    contentLabels: { ...existingContentLabels },
    matchedSteps: matches.size
  };
}
