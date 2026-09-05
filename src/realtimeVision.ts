import type { ComboStep, PracticeSnapshot } from '../combo-core/types';

export type VisionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RealtimeBuffDefinition = {
  id: string;
  name: string;
  enabled: boolean;
  triggerCode: string;
  triggerMode: RealtimeBuffTriggerMode;
  triggerInputMode: RealtimeBuffInputMode;
  holdThresholdMs: number;
  durationSeconds: number;
  warningLeadSeconds: number;
  matchThreshold: number;
  roi: VisionRect;
  triggerStepId?: string;
  detectionWindowSeconds: number;
  templateDataUrl?: string;
};

export type RealtimeBuffTriggerMode = 'press' | 'hold-release';
export type RealtimeBuffInputMode = 'keyboard' | 'gamepad';

export type RealtimeVisionOverlayCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type RealtimeVisionTimerColorMode = 'white' | 'blue' | 'auto';

export type RealtimeVisionOverlayBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RealtimeVisionSettings = {
  sampleFps: number;
  timerEnabled: boolean;
  timerRoi: VisionRect;
  timerLuminanceThreshold: number;
  timerColorMode: RealtimeVisionTimerColorMode;
  overlayEnabled: boolean;
  overlayCorner: RealtimeVisionOverlayCorner;
  overlayBounds?: RealtimeVisionOverlayBounds;
  soundEnabled: boolean;
  buffs: RealtimeBuffDefinition[];
};

export type TimerRecognition = {
  seconds: number;
  text: string;
  confidence: number;
  whiteRatio: number;
};

export type StableTimerSnapshot = TimerRecognition & {
  observedAt: number;
  stale: boolean;
};

export type VisualSignature = {
  size: number;
  luma: Float32Array;
  edge: Float32Array;
  chromaR: Float32Array;
  chromaG: Float32Array;
};

export type VisualTemplate = {
  signature: VisualSignature;
  aspectRatio: number;
  luma?: {
    width: number;
    height: number;
    values: Float32Array;
  };
};

export type VisualTemplateMatch = {
  score: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BuffRuntimeSnapshot = {
  id: string;
  name: string;
  configured: boolean;
  similarity: number;
  present: boolean;
  detectedAtTimerSeconds: number | null;
  expiresAtTimerSeconds: number | null;
  remainingSeconds: number | null;
  warning: boolean;
};

export type BuffRuntimeUpdate = {
  snapshots: BuffRuntimeSnapshot[];
  activations: BuffRuntimeSnapshot[];
  warnings: BuffRuntimeSnapshot[];
};

export const UPSTREAM_TIMER_ROI: VisionRect = {
  x: 0.455,
  y: 0.108,
  width: 0.105,
  height: 0.035
};

const LEGACY_UPSTREAM_TIMER_ROI: VisionRect = {
  x: 1820 / 3840,
  y: 266 / 2160,
  width: 280 / 3840,
  height: 74 / 2160
};

export const BUILTIN_FEIXUE_BUFF_TEMPLATE_URL = '/vision/feixue-intro-buff.png';

export const DEFAULT_BUFF_ROI: VisionRect = {
  x: 0.455,
  y: 0.805,
  width: 0.04,
  height: 0.072
};

export const DEFAULT_BUFF_SEARCH_ROI: VisionRect = {
  x: 0.34,
  y: 0.84,
  width: 0.34,
  height: 0.085
};

export const DEFAULT_REALTIME_VISION_SETTINGS: RealtimeVisionSettings = {
  sampleFps: 5,
  timerEnabled: true,
  timerRoi: UPSTREAM_TIMER_ROI,
  timerLuminanceThreshold: 200,
  timerColorMode: 'white',
  overlayEnabled: true,
  overlayCorner: 'top-left',
  soundEnabled: true,
  buffs: [{
    id: 'buff-1',
    name: 'Buff 1',
    enabled: true,
    triggerCode: '',
    triggerMode: 'press',
    triggerInputMode: 'keyboard',
    holdThresholdMs: 300,
    durationSeconds: 15,
    warningLeadSeconds: 3,
    matchThreshold: 0.86,
    roi: DEFAULT_BUFF_SEARCH_ROI,
    detectionWindowSeconds: 5
  }]
};

const GLYPH_WIDTH = 18;
const GLYPH_HEIGHT = 28;
const SIGNATURE_SIZE = 24;
const SEARCH_SIGNATURE_SIZE = 24;
const MIN_RECT_SIZE = 0.008;
const MIN_TIMER_RECOGNITION_CONFIDENCE = 0.84;
const MIN_LOW_RES_TIMER_RECOGNITION_CONFIDENCE = 0.83;
const MAX_CHALLENGE_TIMER_MINUTES = 9;

type BinaryGlyph = Uint8Array;
type DigitMatch = { digit: number; confidence: number };
type BuffTrackerState = {
  hits: number;
  misses: number;
  observing: boolean;
  armed: boolean;
  absenceFrames: number;
  backgroundSimilarity: number;
  lastSimilarity: number;
  present: boolean;
  suppressedUntilAbsent: boolean;
  warned: boolean;
  activatedAtWallMs: number;
  expiresAtWallMs: number;
  detectedAtTimerSeconds: number | null;
  expiresAtTimerSeconds: number | null;
  timerBindingConfirmed: boolean;
  candidateX: number | null;
  candidateY: number | null;
  candidateSize: number;
  candidateLastSeenAt: number;
};

let cachedDigitTemplates: Map<number, BinaryGlyph[]> | null = null;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeRealtimeVisionOverlayBounds(value: Partial<RealtimeVisionOverlayBounds> | null | undefined): RealtimeVisionOverlayBounds | undefined {
  if (!value || ![value.x, value.y, value.width, value.height].every(Number.isFinite)) return undefined;
  return {
    x: clamp(Number(value.x), -100000, 100000),
    y: clamp(Number(value.y), -100000, 100000),
    width: clamp(Number(value.width), 180, 1440),
    height: clamp(Number(value.height), 64, 1000)
  };
}

function rectApproximatelyEquals(value: Partial<VisionRect> | null | undefined, expected: VisionRect): boolean {
  return Boolean(value)
    && Math.abs(Number(value?.x) - expected.x) < 0.0005
    && Math.abs(Number(value?.y) - expected.y) < 0.0005
    && Math.abs(Number(value?.width) - expected.width) < 0.0005
    && Math.abs(Number(value?.height) - expected.height) < 0.0005;
}

function stepFingerprint(step: Pick<ComboStep, 'moveId' | 'characterSlot' | 'label'>): string {
  return [step.moveId, step.characterSlot ?? 0, step.label.trim().toLocaleLowerCase()].join('|');
}

export type RealtimeVisionDetectionWindow = {
  startMs: number;
  endMs: number;
};

export function realtimeVisionDetectionWindows(
  steps: readonly ComboStep[],
  triggerStepId: string | undefined,
  paddingSeconds: number
): RealtimeVisionDetectionWindow[] {
  if (!triggerStepId) return [];
  const selected = steps.find((step) => step.id === triggerStepId);
  if (!selected) return [];
  const fingerprint = stepFingerprint(selected);
  const paddingMs = clamp(paddingSeconds, 0, 30) * 1000;
  return steps
    .filter((step) => stepFingerprint(step) === fingerprint)
    .map((step) => {
      const startMin = Math.max(0, Math.min(step.startMin, step.startMax));
      const startMax = Math.max(startMin, step.startMin, step.startMax);
      const durationMax = Math.max(0, step.durationMax);
      return {
        startMs: Math.max(0, startMin - paddingMs),
        endMs: startMax + durationMax + paddingMs
      };
    })
    .sort((left, right) => left.startMs - right.startMs);
}

export function shouldScanRealtimeBuff(
  definition: RealtimeBuffDefinition,
  steps: readonly ComboStep[],
  practice: Pick<PracticeSnapshot, 'status' | 'elapsedMs'>
): boolean {
  if (!definition.triggerStepId) return true;
  if (practice.status !== 'running') return false;
  const elapsed = Math.max(0, practice.elapsedMs ?? 0);
  return realtimeVisionDetectionWindows(steps, definition.triggerStepId, definition.detectionWindowSeconds)
    .some((window) => elapsed >= window.startMs && elapsed <= window.endMs);
}

export function challengeTimerExpirySeconds(timerSeconds: number | null, durationSeconds: number): number | null {
  if (timerSeconds === null || !Number.isFinite(timerSeconds) || !Number.isFinite(durationSeconds)) return null;
  return Math.max(0, timerSeconds - Math.max(0, durationSeconds));
}

export function formatChallengeTimerSeconds(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function normalizeVisionRect(value: Partial<VisionRect> | null | undefined, fallback: VisionRect): VisionRect {
  const width = clamp(Number.isFinite(value?.width) ? Number(value?.width) : fallback.width, MIN_RECT_SIZE, 1);
  const height = clamp(Number.isFinite(value?.height) ? Number(value?.height) : fallback.height, MIN_RECT_SIZE, 1);
  const x = clamp(Number.isFinite(value?.x) ? Number(value?.x) : fallback.x, 0, 1 - width);
  const y = clamp(Number.isFinite(value?.y) ? Number(value?.y) : fallback.y, 0, 1 - height);
  return { x, y, width, height };
}

export function normalizeRealtimeVisionSettings(value: Partial<RealtimeVisionSettings> | null | undefined): RealtimeVisionSettings {
  const sourceBuffs = Array.isArray(value?.buffs) ? value.buffs : DEFAULT_REALTIME_VISION_SETTINGS.buffs;
  const buffs = sourceBuffs.slice(0, 12).map((entry, index) => {
    const id = typeof entry?.id === 'string' && entry.id.trim() ? entry.id : `buff-${index + 1}`;
    const builtInDefault = id === 'buff-1'
      && (!entry?.templateDataUrl || entry.templateDataUrl === BUILTIN_FEIXUE_BUFF_TEMPLATE_URL);
    const migrateDefaultRoi = builtInDefault
      && (!entry?.roi || rectApproximatelyEquals(entry.roi, DEFAULT_BUFF_ROI));
    const rawThreshold = Number(entry?.matchThreshold);
    const matchThreshold = rawThreshold || DEFAULT_REALTIME_VISION_SETTINGS.buffs[0].matchThreshold;
    const fallbackName = builtInDefault ? DEFAULT_REALTIME_VISION_SETTINGS.buffs[0].name : `Buff ${index + 1}`;
    const rawName = typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : fallbackName;
    const triggerMode: RealtimeBuffTriggerMode = entry?.triggerMode === 'hold-release' ? 'hold-release' : 'press';
    const triggerInputMode: RealtimeBuffInputMode = entry?.triggerInputMode === 'gamepad' ? 'gamepad' : 'keyboard';
    return {
      id,
      name: builtInDefault && rawName === 'Buff 1' ? fallbackName : rawName.slice(0, 40),
      enabled: entry?.enabled !== false,
      triggerCode: typeof entry?.triggerCode === 'string' ? entry.triggerCode.trim().slice(0, 80) : '',
      triggerMode,
      triggerInputMode,
      holdThresholdMs: clamp(Math.round(Number(entry?.holdThresholdMs) || 300), 100, 5000),
      durationSeconds: clamp(
        Number(entry?.durationSeconds) || DEFAULT_REALTIME_VISION_SETTINGS.buffs[0].durationSeconds,
        0.1,
        600
      ),
      warningLeadSeconds: clamp(Number(entry?.warningLeadSeconds) || 0, 0, 120),
      matchThreshold: clamp(matchThreshold, 0.35, 0.99),
      roi: normalizeVisionRect(migrateDefaultRoi ? DEFAULT_BUFF_SEARCH_ROI : entry?.roi, builtInDefault ? DEFAULT_BUFF_SEARCH_ROI : DEFAULT_BUFF_ROI),
      triggerStepId: typeof entry?.triggerStepId === 'string' && entry.triggerStepId.trim() ? entry.triggerStepId : undefined,
      detectionWindowSeconds: clamp(Number(entry?.detectionWindowSeconds) || 5, 0.5, 30)
    };
  });
  const migrateTimerRoi = rectApproximatelyEquals(value?.timerRoi, LEGACY_UPSTREAM_TIMER_ROI);
  const rawTimerThreshold = Number(value?.timerLuminanceThreshold);
  const timerLuminanceThreshold = migrateTimerRoi && rawTimerThreshold === 180
    ? DEFAULT_REALTIME_VISION_SETTINGS.timerLuminanceThreshold
    : rawTimerThreshold || DEFAULT_REALTIME_VISION_SETTINGS.timerLuminanceThreshold;
  const timerRoi = migrateTimerRoi
    ? UPSTREAM_TIMER_ROI
    : value?.timerRoi;
  return {
    sampleFps: clamp(Math.round(Number(value?.sampleFps) || DEFAULT_REALTIME_VISION_SETTINGS.sampleFps), 1, 12),
    timerEnabled: value?.timerEnabled !== false,
    timerRoi: normalizeVisionRect(timerRoi, UPSTREAM_TIMER_ROI),
    timerLuminanceThreshold: clamp(Math.round(timerLuminanceThreshold), 110, 245),
    timerColorMode: value?.timerColorMode === 'blue' || value?.timerColorMode === 'auto'
      ? value.timerColorMode
      : 'white',
    overlayEnabled: value?.overlayEnabled !== false,
    overlayCorner: value?.overlayCorner === 'top-right' || value?.overlayCorner === 'bottom-left' || value?.overlayCorner === 'bottom-right'
      ? value.overlayCorner
      : 'top-left',
    overlayBounds: normalizeRealtimeVisionOverlayBounds(value?.overlayBounds),
    soundEnabled: value?.soundEnabled !== false,
    buffs: buffs.length ? buffs : DEFAULT_REALTIME_VISION_SETTINGS.buffs.map((entry) => ({ ...entry, roi: { ...entry.roi } }))
  };
}

export function imageDataForRect(context: CanvasRenderingContext2D, rect: VisionRect): ImageData | null {
  const canvas = context.canvas;
  if (!canvas.width || !canvas.height) return null;
  const normalized = normalizeVisionRect(rect, rect);
  const x = clamp(Math.floor(normalized.x * canvas.width), 0, Math.max(0, canvas.width - 1));
  const y = clamp(Math.floor(normalized.y * canvas.height), 0, Math.max(0, canvas.height - 1));
  const width = clamp(Math.round(normalized.width * canvas.width), 1, canvas.width - x);
  const height = clamp(Math.round(normalized.height * canvas.height), 1, canvas.height - y);
  try {
    return context.getImageData(x, y, width, height);
  } catch {
    return null;
  }
}

function normalizedBinaryGlyph(mask: Uint8Array, width: number, height: number): BinaryGlyph | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  const sourceWidth = maxX - minX + 1;
  const sourceHeight = maxY - minY + 1;
  const scale = Math.min((GLYPH_WIDTH - 2) / sourceWidth, (GLYPH_HEIGHT - 2) / sourceHeight);
  const drawWidth = Math.max(1, sourceWidth * scale);
  const drawHeight = Math.max(1, sourceHeight * scale);
  const offsetX = (GLYPH_WIDTH - drawWidth) / 2;
  const offsetY = (GLYPH_HEIGHT - drawHeight) / 2;
  const result = new Uint8Array(GLYPH_WIDTH * GLYPH_HEIGHT);
  for (let targetY = 0; targetY < GLYPH_HEIGHT; targetY += 1) {
    for (let targetX = 0; targetX < GLYPH_WIDTH; targetX += 1) {
      const sourceX = Math.floor(minX + (targetX - offsetX) / scale);
      const sourceY = Math.floor(minY + (targetY - offsetY) / scale);
      if (sourceX < minX || sourceX > maxX || sourceY < minY || sourceY > maxY) continue;
      result[targetY * GLYPH_WIDTH + targetX] = mask[sourceY * width + sourceX];
    }
  }
  return result;
}

function binaryGlyphFromCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): BinaryGlyph | null {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const mask = new Uint8Array(canvas.width * canvas.height);
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = data[index * 4] > 64 ? 1 : 0;
  }
  return normalizedBinaryGlyph(mask, canvas.width, canvas.height);
}

function digitTemplates(): Map<number, BinaryGlyph[]> {
  if (cachedDigitTemplates) return cachedDigitTemplates;
  const result = new Map<number, BinaryGlyph[]>();
  const fonts = ['Arial', 'Arial Narrow', 'Segoe UI', 'Bahnschrift', 'DIN Alternate', 'Roboto Condensed', 'sans-serif', 'monospace'];
  const weights = [500, 600, 700, 800];
  for (let digit = 0; digit <= 9; digit += 1) {
    const templates: BinaryGlyph[] = [];
    for (const font of fonts) {
      for (const weight of weights) {
        const canvas = typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(72, 104)
          : typeof document !== 'undefined'
            ? document.createElement('canvas')
            : null;
        if (!canvas) continue;
        canvas.width = 72;
        canvas.height = 104;
        const context = canvas.getContext('2d');
        if (!context) continue;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#fff';
        context.font = `${weight} 86px ${JSON.stringify(font)}`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(String(digit), canvas.width / 2, canvas.height / 2 + 2);
        const template = binaryGlyphFromCanvas(canvas);
        if (template) templates.push(template);
      }
    }
    result.set(digit, templates);
  }
  cachedDigitTemplates = result;
  return result;
}

function hasNeighbor(glyph: BinaryGlyph, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const px = x + dx;
      const py = y + dy;
      if (px >= 0 && px < GLYPH_WIDTH && py >= 0 && py < GLYPH_HEIGHT && glyph[py * GLYPH_WIDTH + px]) return true;
    }
  }
  return false;
}

function glyphSimilarity(left: BinaryGlyph, right: BinaryGlyph): number {
  let leftCount = 0;
  let rightCount = 0;
  let leftMatches = 0;
  let rightMatches = 0;
  for (let y = 0; y < GLYPH_HEIGHT; y += 1) {
    for (let x = 0; x < GLYPH_WIDTH; x += 1) {
      const index = y * GLYPH_WIDTH + x;
      if (left[index]) {
        leftCount += 1;
        if (hasNeighbor(right, x, y)) leftMatches += 1;
      }
      if (right[index]) {
        rightCount += 1;
        if (hasNeighbor(left, x, y)) rightMatches += 1;
      }
    }
  }
  if (!leftCount || !rightCount) return 0;
  return (leftMatches / leftCount + rightMatches / rightCount) / 2;
}

function classifyDigit(glyph: BinaryGlyph): DigitMatch {
  const scores: Array<{ digit: number; score: number }> = [];
  for (const [digit, templates] of digitTemplates()) {
    let best = 0;
    for (const template of templates) best = Math.max(best, glyphSimilarity(glyph, template));
    scores.push({ digit, score: best });
  }
  scores.sort((left, right) => right.score - left.score);
  const best = scores[0] ?? { digit: 0, score: 0 };
  const second = scores[1]?.score ?? 0;
  const margin = clamp((best.score - second) * 2.5, 0, 1);
  return { digit: best.digit, confidence: best.score * 0.82 + margin * 0.18 };
}

function isTimerSeparator(mask: Uint8Array, width: number, height: number): boolean {
  if (width > height * 0.48) return false;
  const occupiedRows = new Uint8Array(height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      occupiedRows[y] = 1;
      break;
    }
  }
  const runs: Array<{ start: number; end: number }> = [];
  let start = -1;
  for (let y = 0; y <= height; y += 1) {
    const occupied = y < height && occupiedRows[y] === 1;
    if (occupied && start < 0) start = y;
    if (!occupied && start >= 0) {
      runs.push({ start, end: y - 1 });
      start = -1;
    }
  }
  if (runs.length !== 2) return false;
  return runs[1].start - runs[0].end - 1 >= Math.max(2, Math.round(height * 0.18));
}

function isTimerForegroundPixel(
  red: number,
  green: number,
  blue: number,
  luminance: number,
  luminanceThreshold: number,
  colorMode: RealtimeVisionTimerColorMode
): boolean {
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const spread = maximum - minimum;
  // The usual challenge timer is neutral white. Keep this branch strict so
  // bright combat effects in the timer ROI do not become digit strokes.
  const neutralWhite = luminance >= luminanceThreshold && spread <= 110;
  if (colorMode === 'white') return neutralWhite;

  // Some challenge layouts tint the timer cyan/blue. Its anti-aliased edge
  // can be much darker than the white centre while still being part of the
  // same glyph, so accept a cool high-luminance foreground separately.
  const coolTint = red >= 145
    && green >= 185
    && blue >= 215
    && blue >= red + 34
    && green >= red + 14
    && luminance >= Math.max(170, luminanceThreshold - 25);
  return neutralWhite || coolTint;
}

function recognizeChallengeTimerAtThreshold(
  image: ImageData,
  luminanceThreshold: number,
  colorMode: RealtimeVisionTimerColorMode
): TimerRecognition | null {
  const { width, height, data } = image;
  if (width < 12 || height < 8) return null;
  const mask = new Uint8Array(width * height);
  const columns = new Uint16Array(width);
  let whitePixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const offset = index * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      if (!isTimerForegroundPixel(red, green, blue, luminance, luminanceThreshold, colorMode)) continue;
      mask[index] = 1;
      columns[x] += 1;
      whitePixels += 1;
    }
  }
  const whiteRatio = whitePixels / (width * height);
  if (whiteRatio < 0.015) return null;

  const minimumColumnPixels = Math.max(1, Math.round(height * 0.025));
  const rawGroups: Array<{ start: number; end: number }> = [];
  let start = -1;
  for (let x = 0; x <= width; x += 1) {
    const occupied = x < width && columns[x] >= minimumColumnPixels;
    if (occupied && start < 0) start = x;
    if (!occupied && start >= 0) {
      rawGroups.push({ start, end: x - 1 });
      start = -1;
    }
  }
  const mergeGap = Math.max(1, Math.floor(width * 0.004));
  const groups: Array<{ start: number; end: number }> = [];
  for (const group of rawGroups) {
    const previous = groups.at(-1);
    if (previous && group.start - previous.end - 1 <= mergeGap) previous.end = group.end;
    else groups.push({ ...group });
  }

  const candidates: Array<{ x: number; match: DigitMatch }> = [];
  const separators: number[] = [];
  for (const group of groups) {
    let minY = height;
    let maxY = -1;
    let activePixels = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = group.start; x <= group.end; x += 1) {
        if (!mask[y * width + x]) continue;
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        activePixels += 1;
      }
    }
    if (maxY < minY) continue;
    const groupWidth = group.end - group.start + 1;
    const groupHeight = maxY - minY + 1;
    const groupMask = new Uint8Array(groupWidth * groupHeight);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = group.start; x <= group.end; x += 1) {
        groupMask[(y - minY) * groupWidth + x - group.start] = mask[y * width + x];
      }
    }
    if (isTimerSeparator(groupMask, groupWidth, groupHeight)) {
      separators.push(group.start);
      continue;
    }
    const aspect = groupWidth / groupHeight;
    if (groupHeight < height * 0.32 || aspect < 0.1 || aspect > 1.15 || activePixels < 4) continue;
    const glyph = normalizedBinaryGlyph(groupMask, groupWidth, groupHeight);
    if (!glyph) continue;
    const match = classifyDigit(glyph);
    if (match.confidence >= 0.38) candidates.push({ x: group.start, match });
  }
  if (candidates.length < 2) return null;
  const orderedCandidates = [...candidates].sort((left, right) => left.x - right.x);
  let selected: Array<{ x: number; match: DigitMatch }> | null = null;
  if (separators.length > 0) {
    const [minuteSeparator, secondSeparator] = separators.sort((left, right) => left - right);
    const minuteDigits = orderedCandidates.filter((entry) => entry.x < minuteSeparator).slice(-2);
    const secondDigits = orderedCandidates
      .filter((entry) => entry.x > minuteSeparator && (secondSeparator === undefined || entry.x < secondSeparator))
      .slice(0, 2);
    if (minuteDigits.length >= 1 && secondDigits.length === 2) selected = [...minuteDigits, ...secondDigits];
  }
  selected ??= orderedCandidates.length <= 4 ? orderedCandidates : orderedCandidates.slice(0, 4);
  const digits = selected.map((entry) => entry.match.digit);
  let minutes = 0;
  let seconds = 0;
  if (digits.length >= 4) {
    minutes = digits[0] * 10 + digits[1];
    seconds = digits[2] * 10 + digits[3];
  } else if (digits.length === 3) {
    minutes = digits[0];
    seconds = digits[1] * 10 + digits[2];
  } else {
    seconds = digits[0] * 10 + digits[1];
  }
  const confidence = selected.reduce((sum, entry) => sum + entry.match.confidence, 0) / selected.length;
  const requiredConfidence = height < 30
    ? MIN_LOW_RES_TIMER_RECOGNITION_CONFIDENCE
    : MIN_TIMER_RECOGNITION_CONFIDENCE;
  if (minutes > MAX_CHALLENGE_TIMER_MINUTES || seconds >= 60 || confidence < requiredConfidence) return null;
  return {
    seconds: minutes * 60 + seconds,
    text: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    confidence,
    whiteRatio
  };
}

export function recognizeChallengeTimer(
  image: ImageData,
  luminanceThreshold = 200,
  colorMode: RealtimeVisionTimerColorMode = 'white'
): TimerRecognition | null {
  const minimumThreshold = clamp(Math.round(luminanceThreshold), 110, 254);
  const thresholds = [254, 252, 250, 248, 246, 242, 236, 228, 218, minimumThreshold]
    .filter((threshold, index, values) => threshold >= minimumThreshold && values.indexOf(threshold) === index);
  const readings: TimerRecognition[] = [];
  const support = new Map<number, TimerRecognition[]>();

  for (const threshold of thresholds) {
    const reading = recognizeChallengeTimerAtThreshold(image, threshold, colorMode);
    if (!reading) continue;
    readings.push(reading);
    const matching = [...(support.get(reading.seconds) ?? []), reading];
    support.set(reading.seconds, matching);
    if (matching.length >= 2) {
      const best = matching.reduce((current, candidate) => candidate.confidence > current.confidence ? candidate : current);
      return { ...best, confidence: Math.min(1, best.confidence + 0.03) };
    }
  }

  return readings.reduce<TimerRecognition | null>((best, reading) => {
    if (!best || reading.confidence > best.confidence) return reading;
    return best;
  }, null);
}

export class CountdownTimerTracker {
  private accepted: StableTimerSnapshot | null = null;
  private pendingSeconds: number | null = null;
  private pendingCount = 0;
  private misses = 0;

  reset(): void {
    this.accepted = null;
    this.pendingSeconds = null;
    this.pendingCount = 0;
    this.misses = 0;
  }

  update(reading: TimerRecognition | null, now = performance.now()): StableTimerSnapshot | null {
    if (!reading) {
      this.misses += 1;
      if (!this.accepted) return null;
      return { ...this.accepted, stale: true };
    }
    const missesBeforeReading = this.misses;
    this.misses = 0;

    // Keep the original observation anchor while the on-screen integer is
    // unchanged. Re-anchoring every couple of identical OCR frames makes the
    // projected countdown pause and then jump when the next integer appears.
    if (this.accepted && reading.seconds === this.accepted.seconds) {
      this.pendingSeconds = null;
      this.pendingCount = 0;
      if (missesBeforeReading > 0) {
        // The game timer can be hidden and paused by an ultimate animation.
        // Re-anchor an unchanged value when OCR returns so the hidden interval
        // is not incorrectly subtracted from the game clock.
        this.accepted = { ...reading, observedAt: now, stale: false };
      }
      return { ...this.accepted, stale: false };
    }

    if (this.pendingSeconds === reading.seconds) this.pendingCount += 1;
    else {
      this.pendingSeconds = reading.seconds;
      this.pendingCount = 1;
    }

    let requiredMatches = this.accepted ? 2 : 2;
    if (this.accepted) {
      const elapsedSeconds = Math.max(0, (now - this.accepted.observedAt) / 1000);
      const expectedSeconds = Math.max(0, this.accepted.seconds - elapsedSeconds);
      const tooFarBackward = reading.seconds < this.accepted.seconds - Math.ceil(elapsedSeconds + 4);
      const timerReset = reading.seconds > this.accepted.seconds + 1;
      if (tooFarBackward) requiredMatches = 3;
      if (timerReset && missesBeforeReading < 3) requiredMatches = 4;
      // A normal countdown transition is already strongly constrained by the
      // previous value and its observation time. Accept it on the first good
      // frame so the trigger time is not delayed by another OCR sample.
      const normalCountdownStep = reading.seconds < this.accepted.seconds
        && Math.abs(reading.seconds - expectedSeconds) <= 1.1;
      if (normalCountdownStep && !tooFarBackward) requiredMatches = 1;
    }
    if (this.pendingCount >= requiredMatches) {
      this.accepted = { ...reading, observedAt: now, stale: false };
      this.pendingCount = 0;
      this.pendingSeconds = null;
    }
    return this.accepted ? { ...this.accepted, stale: this.accepted.seconds !== reading.seconds } : null;
  }
}

function signatureFromSampler(
  width: number,
  height: number,
  sample: (x: number, y: number) => [number, number, number],
  signatureSize = SIGNATURE_SIZE
): VisualSignature {
  width = Math.max(1, Math.round(Number.isFinite(width) ? width : 1));
  height = Math.max(1, Math.round(Number.isFinite(height) ? height : 1));
  signatureSize = Math.max(2, Math.round(Number.isFinite(signatureSize) ? signatureSize : SIGNATURE_SIZE));
  const count = signatureSize * signatureSize;
  const rawLuma = new Float32Array(count);
  const chromaR = new Float32Array(count);
  const chromaG = new Float32Array(count);
  let mean = 0;
  for (let targetY = 0; targetY < signatureSize; targetY += 1) {
    for (let targetX = 0; targetX < signatureSize; targetX += 1) {
      const sourceX = clamp(Math.floor(((targetX + 0.5) / signatureSize) * width), 0, width - 1);
      const sourceY = clamp(Math.floor(((targetY + 0.5) / signatureSize) * height), 0, height - 1);
      const sampled = sample(sourceX, sourceY);
      const red = clamp(Number(sampled[0]), 0, 255);
      const green = clamp(Number(sampled[1]), 0, 255);
      const blue = clamp(Number(sampled[2]), 0, 255);
      const index = targetY * signatureSize + targetX;
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const sum = Math.max(24, red + green + blue);
      rawLuma[index] = luminance;
      chromaR[index] = red / sum;
      chromaG[index] = green / sum;
      mean += luminance;
    }
  }
  mean /= count;
  let variance = 0;
  for (const value of rawLuma) variance += (value - mean) ** 2;
  const deviation = Math.max(8, Math.sqrt(variance / count));
  const luma = new Float32Array(count);
  const edge = new Float32Array(count);
  for (let y = 0; y < signatureSize; y += 1) {
    for (let x = 0; x < signatureSize; x += 1) {
      const index = y * signatureSize + x;
      luma[index] = clamp((rawLuma[index] - mean) / deviation, -3, 3);
      const right = rawLuma[y * signatureSize + Math.min(signatureSize - 1, x + 1)];
      const bottom = rawLuma[Math.min(signatureSize - 1, y + 1) * signatureSize + x];
      edge[index] = clamp((Math.abs(rawLuma[index] - right) + Math.abs(rawLuma[index] - bottom)) / 160, 0, 1);
    }
  }
  return { size: signatureSize, luma, edge, chromaR, chromaG };
}

export function visualSignatureFromImageData(image: ImageData): VisualSignature {
  return signatureFromSampler(image.width, image.height, (x, y) => {
    const offset = (y * image.width + x) * 4;
    return [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
  });
}

export function visualTemplateFromImageData(image: ImageData): VisualTemplate {
  const width = Math.max(1, image.width);
  const height = Math.max(1, image.height);
  const lumaScale = Math.min(1, 72 / Math.max(width, height));
  const lumaWidth = Math.max(2, Math.round(width * lumaScale));
  const lumaHeight = Math.max(2, Math.round(height * lumaScale));
  const lumaValues = new Float32Array(lumaWidth * lumaHeight);
  for (let y = 0; y < lumaHeight; y += 1) {
    const sourceY = clamp(Math.floor(((y + 0.5) / lumaHeight) * height), 0, height - 1);
    for (let x = 0; x < lumaWidth; x += 1) {
      const sourceX = clamp(Math.floor(((x + 0.5) / lumaWidth) * width), 0, width - 1);
      const offset = (sourceY * width + sourceX) * 4;
      lumaValues[y * lumaWidth + x] = image.data[offset] * 0.2126
        + image.data[offset + 1] * 0.7152
        + image.data[offset + 2] * 0.0722;
    }
  }
  return {
    signature: signatureFromSampler(width, height, (x, y) => {
      const offset = (y * width + x) * 4;
      return [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
    }, SEARCH_SIGNATURE_SIZE),
    aspectRatio: clamp(width / height, 0.45, 2.2),
    luma: { width: lumaWidth, height: lumaHeight, values: lumaValues }
  };
}

export function visualSignatureFromDataUrl(dataUrl: string): Promise<VisualSignature> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, image.naturalWidth);
      canvas.height = Math.max(1, image.naturalHeight);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        reject(new Error('canvas-unavailable'));
        return;
      }
      context.drawImage(image, 0, 0);
      resolve(visualSignatureFromImageData(context.getImageData(0, 0, canvas.width, canvas.height)));
    };
    image.onerror = () => reject(new Error('invalid-template-image'));
    image.src = dataUrl;
  });
}

export function visualTemplateFromDataUrl(dataUrl: string): Promise<VisualTemplate> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, image.naturalWidth);
      canvas.height = Math.max(1, image.naturalHeight);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        reject(new Error('canvas-unavailable'));
        return;
      }
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      resolve(visualTemplateFromImageData(pixels));
    };
    image.onerror = () => reject(new Error('invalid-template-image'));
    image.src = dataUrl;
  });
}

function vectorCorrelation(left: Float32Array, right: Float32Array): number {
  if (left.length !== right.length || !left.length) return 0;
  let dot = 0;
  let leftLength = 0;
  let rightLength = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return 0;
    dot += leftValue * rightValue;
    leftLength += leftValue ** 2;
    rightLength += rightValue ** 2;
  }
  if (!Number.isFinite(dot) || !Number.isFinite(leftLength) || !Number.isFinite(rightLength) || leftLength < 0.0001 || rightLength < 0.0001) return 0;
  return clamp((dot / Math.sqrt(leftLength * rightLength) + 1) / 2, 0, 1);
}

export function compareVisualSignatures(left: VisualSignature, right: VisualSignature): number {
  const expectedLength = left.size * left.size;
  if (
    left.size !== right.size
    || left.luma.length !== expectedLength
    || right.luma.length !== expectedLength
    || left.edge.length !== expectedLength
    || right.edge.length !== expectedLength
    || left.chromaR.length !== expectedLength
    || right.chromaR.length !== expectedLength
    || left.chromaG.length !== expectedLength
    || right.chromaG.length !== expectedLength
  ) return 0;
  const structure = vectorCorrelation(left.luma, right.luma);
  const edges = vectorCorrelation(left.edge, right.edge);
  let chromaDifference = 0;
  for (let index = 0; index < left.chromaR.length; index += 1) {
    const redDifference = Math.abs(left.chromaR[index] - right.chromaR[index]);
    const greenDifference = Math.abs(left.chromaG[index] - right.chromaG[index]);
    if (!Number.isFinite(redDifference) || !Number.isFinite(greenDifference)) return 0;
    chromaDifference += redDifference + greenDifference;
  }
  const color = clamp(1 - chromaDifference / (left.chromaR.length * 1.05), 0, 1);
  // Buff icons can keep their shape while the surrounding mode recolors
  // them. Give structure and edges priority so a palette shift does not
  // invalidate an otherwise good template match.
  return clamp(structure * 0.6 + edges * 0.32 + color * 0.08, 0, 1);
}

function signatureForImageWindow(image: ImageData, x: number, y: number, width: number, height: number): VisualSignature {
  const safeX = clamp(Math.round(x), 0, Math.max(0, image.width - 1));
  const safeY = clamp(Math.round(y), 0, Math.max(0, image.height - 1));
  const safeWidth = clamp(Math.round(width), 1, image.width - safeX);
  const safeHeight = clamp(Math.round(height), 1, image.height - safeY);
  return signatureFromSampler(safeWidth, safeHeight, (sampleX, sampleY) => {
    const offset = ((safeY + sampleY) * image.width + safeX + sampleX) * 4;
    return [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
  }, SEARCH_SIGNATURE_SIZE);
}

function scanPositions(limit: number, step: number): number[] {
  if (limit <= 0) return [0];
  const positions: number[] = [];
  for (let value = 0; value <= limit; value += step) positions.push(value);
  if (positions.at(-1) !== limit) positions.push(limit);
  return positions;
}

type NormalizedLumaTemplate = {
  values: Float32Array;
  squaredLength: number;
};

function resizedNormalizedTemplateLuma(
  template: NonNullable<VisualTemplate['luma']>,
  width: number,
  height: number
): NormalizedLumaTemplate {
  const values = new Float32Array(width * height);
  let mean = 0;
  for (let y = 0; y < height; y += 1) {
    const sourceY = ((y + 0.5) / height) * template.height - 0.5;
    const y0 = clamp(Math.floor(sourceY), 0, template.height - 1);
    const y1 = Math.min(template.height - 1, y0 + 1);
    const fy = clamp(sourceY - Math.floor(sourceY), 0, 1);
    for (let x = 0; x < width; x += 1) {
      const sourceX = ((x + 0.5) / width) * template.width - 0.5;
      const x0 = clamp(Math.floor(sourceX), 0, template.width - 1);
      const x1 = Math.min(template.width - 1, x0 + 1);
      const fx = clamp(sourceX - Math.floor(sourceX), 0, 1);
      const top = template.values[y0 * template.width + x0] * (1 - fx)
        + template.values[y0 * template.width + x1] * fx;
      const bottom = template.values[y1 * template.width + x0] * (1 - fx)
        + template.values[y1 * template.width + x1] * fx;
      const value = top * (1 - fy) + bottom * fy;
      values[y * width + x] = value;
      mean += value;
    }
  }
  mean /= values.length;
  let squaredLength = 0;
  for (let index = 0; index < values.length; index += 1) {
    values[index] -= mean;
    squaredLength += values[index] ** 2;
  }
  return { values, squaredLength };
}

function imageWindowLumaCorrelation(
  image: ImageData,
  x: number,
  y: number,
  width: number,
  height: number,
  template: NormalizedLumaTemplate
): number {
  if (template.squaredLength < 0.0001) return 0;
  let sum = 0;
  let squaredSum = 0;
  let dot = 0;
  for (let localY = 0; localY < height; localY += 1) {
    for (let localX = 0; localX < width; localX += 1) {
      const offset = ((y + localY) * image.width + x + localX) * 4;
      const value = image.data[offset] * 0.2126
        + image.data[offset + 1] * 0.7152
        + image.data[offset + 2] * 0.0722;
      const index = localY * width + localX;
      sum += value;
      squaredSum += value * value;
      dot += value * template.values[index];
    }
  }
  const candidateSquaredLength = squaredSum - (sum * sum) / (width * height);
  if (candidateSquaredLength < 0.0001) return 0;
  return clamp(dot / Math.sqrt(candidateSquaredLength * template.squaredLength), 0, 1);
}

export function findVisualTemplateMatchInImageData(
  image: ImageData,
  template: VisualTemplate,
  sourceHeight: number
): VisualTemplateMatch {
  const emptyMatch = { score: 0, x: 0, y: 0, width: 0, height: 0 };
  if (image.width < 4 || image.height < 4 || sourceHeight < 1 || !Number.isFinite(template.aspectRatio)) return emptyMatch;
  let bestMatch = emptyMatch;
  let bestWindow: {
    x: number;
    y: number;
    width: number;
    height: number;
    stepX: number;
    stepY: number;
    normalizedLuma: NormalizedLumaTemplate | null;
  } | null = null;
  for (const heightRatio of [0.032, 0.036, 0.04, 0.044]) {
    const height = Math.max(8, Math.round(sourceHeight * heightRatio));
    const width = Math.max(8, Math.round(height * template.aspectRatio));
    if (width > image.width || height > image.height) continue;
    const stepX = Math.max(2, Math.round(width * 0.12));
    const stepY = Math.max(2, Math.round(height * 0.1));
    const normalizedLuma = template.luma
      ? resizedNormalizedTemplateLuma(template.luma, width, height)
      : null;
    for (const y of scanPositions(image.height - height, stepY)) {
      for (const x of scanPositions(image.width - width, stepX)) {
        const score = normalizedLuma
          ? imageWindowLumaCorrelation(image, x, y, width, height, normalizedLuma)
          : compareVisualSignatures(template.signature, signatureForImageWindow(image, x, y, width, height));
        if (score <= bestMatch.score) continue;
        bestMatch = { score, x, y, width, height };
        bestWindow = { x, y, width, height, stepX, stepY, normalizedLuma };
      }
    }
  }
  if (!bestWindow) {
    const score = compareVisualSignatures(template.signature, signatureFromSampler(
      image.width,
      image.height,
      (x, y) => {
        const offset = (y * image.width + x) * 4;
        return [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
      },
      SEARCH_SIGNATURE_SIZE
    ));
    return { score, x: 0, y: 0, width: image.width, height: image.height };
  }
  const minX = Math.max(0, bestWindow.x - bestWindow.stepX);
  const maxX = Math.min(image.width - bestWindow.width, bestWindow.x + bestWindow.stepX);
  const minY = Math.max(0, bestWindow.y - bestWindow.stepY);
  const maxY = Math.min(image.height - bestWindow.height, bestWindow.y + bestWindow.stepY);
  for (let y = minY; y <= maxY; y += 2) {
    for (let x = minX; x <= maxX; x += 2) {
      const score = bestWindow.normalizedLuma
        ? imageWindowLumaCorrelation(image, x, y, bestWindow.width, bestWindow.height, bestWindow.normalizedLuma)
        : compareVisualSignatures(
          template.signature,
          signatureForImageWindow(image, x, y, bestWindow.width, bestWindow.height)
        );
      if (score > bestMatch.score) bestMatch = {
        score,
        x,
        y,
        width: bestWindow.width,
        height: bestWindow.height
      };
    }
  }
  if (bestWindow.normalizedLuma) {
    const visualScore = compareVisualSignatures(
      template.signature,
      signatureForImageWindow(image, bestMatch.x, bestMatch.y, bestMatch.width, bestMatch.height)
    );
    bestMatch.score = clamp(bestMatch.score * 0.72 + visualScore * 0.28, 0, 1);
  }
  return bestMatch;
}

export function findVisualTemplateInImageData(image: ImageData, template: VisualTemplate, sourceHeight: number): number {
  return findVisualTemplateMatchInImageData(image, template, sourceHeight).score;
}

export class BuffRuntimeTracker {
  private states = new Map<string, BuffTrackerState>();

  reset(): void {
    this.states.clear();
  }

  update(
    definitions: RealtimeBuffDefinition[],
    similarities: ReadonlyMap<string, number | VisualTemplateMatch>,
    timerSeconds: number | null,
    now = performance.now(),
    timerTrusted = true
  ): BuffRuntimeUpdate {
    const currentIds = new Set(definitions.map((definition) => definition.id));
    for (const id of this.states.keys()) if (!currentIds.has(id)) this.states.delete(id);
    const snapshots: BuffRuntimeSnapshot[] = [];
    const activatedIds = new Set<string>();
    const activations: BuffRuntimeSnapshot[] = [];
    const warnings: BuffRuntimeSnapshot[] = [];

    for (const definition of definitions) {
      const configured = Boolean(definition.templateDataUrl);
      let state = this.states.get(definition.id);
      if (!state) {
        state = {
          hits: 0,
          misses: 0,
          observing: false,
          armed: false,
          absenceFrames: 0,
          backgroundSimilarity: 0,
          lastSimilarity: 0,
          present: false,
          suppressedUntilAbsent: false,
          warned: false,
          activatedAtWallMs: 0,
          expiresAtWallMs: 0,
          detectedAtTimerSeconds: null,
          expiresAtTimerSeconds: null,
          timerBindingConfirmed: false,
          candidateX: null,
          candidateY: null,
          candidateSize: 0,
          candidateLastSeenAt: 0
        };
        this.states.set(definition.id, state);
      }

      const observedMatch = similarities.get(definition.id);
      const observedSimilarity = typeof observedMatch === 'number' ? observedMatch : observedMatch?.score;
      const observed = similarities.has(definition.id) && Number.isFinite(observedSimilarity);
      const similarity = observed ? clamp(Number(observedSimilarity), 0, 1) : state.lastSimilarity;
      if (observed) state.lastSimilarity = similarity;
      if (observed && !state.observing) {
        state.observing = true;
        state.hits = 0;
        state.misses = 0;
        state.armed = state.present;
        state.absenceFrames = 0;
        state.backgroundSimilarity = 0;
        state.candidateX = null;
        state.candidateY = null;
        state.candidateSize = 0;
        state.candidateLastSeenAt = 0;
      }
      if (observed && !state.present && similarity < definition.matchThreshold) {
        state.absenceFrames += 1;
        state.backgroundSimilarity = Math.max(similarity, state.backgroundSimilarity * 0.985);
        if (state.absenceFrames >= 2) state.armed = true;
      }
      const adaptiveThreshold = Math.min(
        definition.matchThreshold + 0.055,
        Math.max(definition.matchThreshold, state.backgroundSimilarity + 0.03)
      );
      const matched = observed && state.armed && similarity >= adaptiveThreshold;

      if (!definition.enabled || !configured) {
        state.hits = 0;
        state.misses = 0;
        state.observing = false;
        state.armed = false;
        state.absenceFrames = 0;
        state.backgroundSimilarity = 0;
        state.lastSimilarity = 0;
        state.present = false;
        state.suppressedUntilAbsent = false;
        state.detectedAtTimerSeconds = null;
        state.expiresAtTimerSeconds = null;
        state.timerBindingConfirmed = false;
        state.candidateX = null;
        state.candidateY = null;
        state.candidateSize = 0;
        state.candidateLastSeenAt = 0;
      } else if (!observed) {
        // A combo-gated detector is intentionally idle outside its trigger
        // window. Keep an active countdown alive without carrying partial hits
        // into a later window.
        state.hits = 0;
        state.misses = 0;
        state.observing = false;
        if (!state.present) {
          state.armed = false;
          state.absenceFrames = 0;
          state.backgroundSimilarity = 0;
        }
      } else if (matched) {
        state.misses = 0;
        if (!state.suppressedUntilAbsent) {
          const locatedMatch = typeof observedMatch === 'object' ? observedMatch : null;
          const centerX = locatedMatch ? locatedMatch.x + locatedMatch.width / 2 : null;
          const centerY = locatedMatch ? locatedMatch.y + locatedMatch.height / 2 : null;
          const candidateSize = locatedMatch ? Math.max(locatedMatch.width, locatedMatch.height) : 0;
          const recentlySeen = now - state.candidateLastSeenAt <= 800;
          const sameLocation = centerX === null || centerY === null || state.candidateX === null || state.candidateY === null
            ? recentlySeen
            : Math.hypot(centerX - state.candidateX, centerY - state.candidateY)
              <= Math.max(10, Math.max(candidateSize, state.candidateSize) * 1.35);
          state.hits = recentlySeen && sameLocation ? state.hits + 1 : 1;
          state.candidateX = centerX;
          state.candidateY = centerY;
          state.candidateSize = candidateSize;
          state.candidateLastSeenAt = now;
        }
        if (!state.present && !state.suppressedUntilAbsent && state.hits >= 2) {
          state.present = true;
          activatedIds.add(definition.id);
          state.warned = false;
          state.activatedAtWallMs = now;
          state.expiresAtWallMs = now + definition.durationSeconds * 1000;
          state.detectedAtTimerSeconds = timerSeconds;
          state.expiresAtTimerSeconds = challengeTimerExpirySeconds(timerSeconds, definition.durationSeconds);
          state.timerBindingConfirmed = timerSeconds !== null && timerTrusted;
        }
      } else {
        state.misses += 1;
        if (now - state.candidateLastSeenAt > 800) {
          state.hits = 0;
          state.candidateX = null;
          state.candidateY = null;
          state.candidateSize = 0;
        }
        if (!state.present && state.misses >= 3) {
          state.suppressedUntilAbsent = false;
          state.warned = false;
          state.detectedAtTimerSeconds = null;
          state.expiresAtTimerSeconds = null;
          state.timerBindingConfirmed = false;
        }
      }

      let remainingSeconds: number | null = null;
      if (state.present) {
        if (timerSeconds !== null && (state.detectedAtTimerSeconds === null || (!state.timerBindingConfirmed && timerTrusted))) {
          const elapsedSinceDetection = Math.max(0, (now - state.activatedAtWallMs) / 1000);
          state.detectedAtTimerSeconds = timerSeconds + elapsedSinceDetection;
          state.expiresAtTimerSeconds = challengeTimerExpirySeconds(
            state.detectedAtTimerSeconds,
            definition.durationSeconds
          );
          state.timerBindingConfirmed = timerTrusted;
        }
        remainingSeconds = timerSeconds !== null && state.expiresAtTimerSeconds !== null
          ? timerSeconds - state.expiresAtTimerSeconds
          : (state.expiresAtWallMs - now) / 1000;
        remainingSeconds = Math.max(0, remainingSeconds);
        if (remainingSeconds <= 0) {
          state.present = false;
          state.suppressedUntilAbsent = true;
          state.armed = false;
          state.absenceFrames = 0;
          remainingSeconds = 0;
        }
      }
      const warning = state.present && remainingSeconds !== null && remainingSeconds <= definition.warningLeadSeconds;
      const snapshot: BuffRuntimeSnapshot = {
        id: definition.id,
        name: definition.name,
        configured,
        similarity,
        present: state.present,
        detectedAtTimerSeconds: state.detectedAtTimerSeconds,
        expiresAtTimerSeconds: state.expiresAtTimerSeconds,
        remainingSeconds,
        warning
      };
      snapshots.push(snapshot);
      if (activatedIds.has(definition.id)) activations.push(snapshot);
      if (warning && !state.warned) {
        state.warned = true;
        warnings.push(snapshot);
      }
    }
    return { snapshots, activations, warnings };
  }
}
