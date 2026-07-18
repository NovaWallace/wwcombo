import type { CSSProperties } from 'react';

export type KeyMappingBounds = { x: number; y: number; width: number; height: number };
export type KeyMappingTransform = { x: number; y: number; width: number; height: number; opacity: number; rotate: number };

export type KeyMappingBinding = {
  id: string;
  name: string;
  code: string;
  src?: string;
  transform: KeyMappingTransform;
};

export type KeyMappingImageLayer = {
  id: string;
  kind: 'image';
  name: string;
  src?: string;
  transform: KeyMappingTransform;
};

export type KeyMappingKeysLayer = {
  id: string;
  kind: 'keys';
  name: string;
  transform: KeyMappingTransform;
  bindings: KeyMappingBinding[];
};

export type KeyMappingLayer = KeyMappingImageLayer | KeyMappingKeysLayer;

export type KeyMappingConfig = {
  bounds: KeyMappingBounds;
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
  layers: KeyMappingLayer[];
  selectedLayerId?: string;
  selectedBindingId?: string;
};

export type KeyMappingPayload = KeyMappingConfig & {
  visible: boolean;
  moveMode: boolean;
};

export const KEY_MAPPING_STORAGE_KEY = 'ww-combo-trainer-key-mapping-v1';
export const KEY_MAPPING_DEFAULT_CANVAS = { width: 620, height: 514 };
export const KEY_MAPPING_DEFAULT_BOUNDS: KeyMappingBounds = { x: 520, y: 220, width: 620, height: 514 };
export const KEY_MAPPING_MIN_BOUNDS = { width: 160, height: 120 };
export const KEY_MAPPING_MAX_BOUNDS = { width: 2400, height: 2000 };
export const KEY_MAPPING_MIN_SCALE = 0.3;
export const KEY_MAPPING_MAX_SCALE = 3;

export const DEFAULT_KEY_MAPPING_TRANSFORM: KeyMappingTransform = { x: 0, y: 0, width: 100, height: 100, opacity: 1, rotate: 0 };

const DEFAULT_CODES = [
  ['T', 'KeyT'],
  ['E', 'KeyE'],
  ['Q', 'KeyQ'],
  ['R', 'KeyR'],
  ['Space', 'Space'],
  ['Mouse L', 'MouseLeft'],
  ['Mouse R', 'MouseRight'],
  ['F', 'KeyF'],
  ['W', 'KeyW'],
  ['A', 'KeyA'],
  ['S', 'KeyS'],
  ['D', 'KeyD'],
  ['1', 'Digit1'],
  ['2', 'Digit2'],
  ['3', 'Digit3']
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numberOr(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function keyMappingScaleLimits(canvasWidth: number, canvasHeight: number): { min: number; max: number } {
  const safeWidth = Math.max(1, canvasWidth);
  const safeHeight = Math.max(1, canvasHeight);
  const min = Math.max(KEY_MAPPING_MIN_SCALE, KEY_MAPPING_MIN_BOUNDS.width / safeWidth, KEY_MAPPING_MIN_BOUNDS.height / safeHeight);
  const max = Math.min(KEY_MAPPING_MAX_SCALE, KEY_MAPPING_MAX_BOUNDS.width / safeWidth, KEY_MAPPING_MAX_BOUNDS.height / safeHeight);
  return min <= max ? { min, max } : { min: KEY_MAPPING_MIN_SCALE, max: KEY_MAPPING_MAX_SCALE };
}

export function normalizeKeyMappingScale(value: unknown, fallback = 1, canvasWidth = KEY_MAPPING_DEFAULT_CANVAS.width, canvasHeight = KEY_MAPPING_DEFAULT_CANVAS.height): number {
  const { min, max } = keyMappingScaleLimits(canvasWidth, canvasHeight);
  return clamp(numberOr(value, fallback), min, max);
}

function inferKeyMappingScaleFromBounds(value: unknown, canvasWidth: number, canvasHeight: number, fallback = 1): number {
  const record = value as Partial<KeyMappingBounds> | null;
  const scaleX = numberOr(record?.width, Number.NaN) / Math.max(1, canvasWidth);
  const scaleY = numberOr(record?.height, Number.NaN) / Math.max(1, canvasHeight);
  if (Number.isFinite(scaleX) && scaleX > 0 && Number.isFinite(scaleY) && scaleY > 0) return Math.min(scaleX, scaleY);
  if (Number.isFinite(scaleX) && scaleX > 0) return scaleX;
  if (Number.isFinite(scaleY) && scaleY > 0) return scaleY;
  return fallback;
}

export function keyMappingDisplayBounds(config: Pick<KeyMappingConfig, 'bounds' | 'canvasWidth' | 'canvasHeight' | 'scale'>): KeyMappingBounds {
  const bounds = normalizeKeyMappingBounds(config.bounds, KEY_MAPPING_DEFAULT_BOUNDS);
  const scale = normalizeKeyMappingScale(config.scale, 1, config.canvasWidth, config.canvasHeight);
  return {
    x: bounds.x,
    y: bounds.y,
    width: Math.round(clamp(config.canvasWidth * scale, KEY_MAPPING_MIN_BOUNDS.width, KEY_MAPPING_MAX_BOUNDS.width)),
    height: Math.round(clamp(config.canvasHeight * scale, KEY_MAPPING_MIN_BOUNDS.height, KEY_MAPPING_MAX_BOUNDS.height))
  };
}

export function assetUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (/^(data:|blob:|https?:)/i.test(path)) return path;
  const clean = path.replace(/^\/+/, '');
  return new URL(clean, window.location.href).toString();
}

export function normalizeKeyMappingBounds(value: unknown, fallback: KeyMappingBounds = KEY_MAPPING_DEFAULT_BOUNDS): KeyMappingBounds {
  const record = value as Partial<KeyMappingBounds> | null;
  return {
    x: Math.round(clamp(numberOr(record?.x, fallback.x), -100000, 100000)),
    y: Math.round(clamp(numberOr(record?.y, fallback.y), -100000, 100000)),
    width: Math.round(clamp(numberOr(record?.width, fallback.width), KEY_MAPPING_MIN_BOUNDS.width, KEY_MAPPING_MAX_BOUNDS.width)),
    height: Math.round(clamp(numberOr(record?.height, fallback.height), KEY_MAPPING_MIN_BOUNDS.height, KEY_MAPPING_MAX_BOUNDS.height))
  };
}

export function normalizeKeyMappingTransform(value: unknown, fallback: KeyMappingTransform = DEFAULT_KEY_MAPPING_TRANSFORM): KeyMappingTransform {
  const record = value as Partial<KeyMappingTransform> | null;
  const width = clamp(numberOr(record?.width, fallback.width), 1, 400);
  const height = clamp(numberOr(record?.height, fallback.height), 1, 400);
  const size = clamp((width + height) / 2, 1, 400);
  return {
    x: clamp(numberOr(record?.x, fallback.x), -200, 300),
    y: clamp(numberOr(record?.y, fallback.y), -200, 300),
    width: size,
    height: size,
    opacity: clamp(numberOr(record?.opacity, fallback.opacity), 0, 1),
    rotate: clamp(numberOr(record?.rotate, fallback.rotate), -720, 720)
  };
}

export function createDefaultKeyBindings(): KeyMappingBinding[] {
  return DEFAULT_CODES.map(([name, code], index) => ({
    id: `default-key-${index}`,
    name,
    code,
    src: `/key-mapping/default/keyboard/${index}.png`,
    transform: { ...DEFAULT_KEY_MAPPING_TRANSFORM }
  }));
}

export function createDefaultKeyMappingConfig(): KeyMappingConfig {
  return {
    bounds: { ...KEY_MAPPING_DEFAULT_BOUNDS },
    canvasWidth: KEY_MAPPING_DEFAULT_CANVAS.width,
    canvasHeight: KEY_MAPPING_DEFAULT_CANVAS.height,
    scale: 1,
    layers: [
      {
        id: 'default-mousebg',
        kind: 'image',
        name: 'mousebg',
        src: '/key-mapping/default/mousebg.png',
        transform: { ...DEFAULT_KEY_MAPPING_TRANSFORM }
      },
      {
        id: 'default-keys',
        kind: 'keys',
        name: '按键层',
        transform: { ...DEFAULT_KEY_MAPPING_TRANSFORM },
        bindings: createDefaultKeyBindings()
      }
    ],
    selectedLayerId: 'default-keys',
    selectedBindingId: 'default-key-0'
  };
}

function normalizeBinding(value: unknown, index: number): KeyMappingBinding | null {
  const record = value as Partial<KeyMappingBinding> | null;
  if (!record || typeof record !== 'object') return null;
  const code = typeof record.code === 'string' && record.code.trim() ? record.code.trim() : '';
  return {
    id: typeof record.id === 'string' && record.id ? record.id : crypto.randomUUID(),
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : code || `按键 ${index + 1}`,
    code,
    src: typeof record.src === 'string' ? record.src : undefined,
    transform: normalizeKeyMappingTransform(record.transform)
  };
}

function normalizeLayer(value: unknown, index: number): KeyMappingLayer | null {
  const record = value as Partial<KeyMappingLayer> | null;
  if (!record || typeof record !== 'object') return null;
  const base = {
    id: typeof record.id === 'string' && record.id ? record.id : crypto.randomUUID(),
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : `图层 ${index + 1}`,
    transform: normalizeKeyMappingTransform(record.transform)
  };
  if (record.kind === 'keys') {
    const bindings = Array.isArray((record as Partial<KeyMappingKeysLayer>).bindings)
      ? (record as Partial<KeyMappingKeysLayer>).bindings!.map(normalizeBinding).filter((item): item is KeyMappingBinding => Boolean(item))
      : [];
    return { ...base, kind: 'keys', bindings };
  }
  return { ...base, kind: 'image', src: typeof (record as Partial<KeyMappingImageLayer>).src === 'string' ? (record as Partial<KeyMappingImageLayer>).src : undefined };
}

export function normalizeKeyMappingConfig(value: unknown): KeyMappingConfig {
  const fallback = createDefaultKeyMappingConfig();
  const record = value as Partial<KeyMappingConfig> | null;
  const canvasWidth = Math.round(clamp(numberOr(record?.canvasWidth, fallback.canvasWidth), 160, 4000));
  const canvasHeight = Math.round(clamp(numberOr(record?.canvasHeight, fallback.canvasHeight), 120, 4000));
  const rawScale = record?.scale ?? inferKeyMappingScaleFromBounds(record?.bounds, canvasWidth, canvasHeight, fallback.scale);
  const scale = normalizeKeyMappingScale(rawScale, fallback.scale, canvasWidth, canvasHeight);
  const layers = Array.isArray(record?.layers)
    ? record.layers.map(normalizeLayer).filter((item): item is KeyMappingLayer => Boolean(item))
    : fallback.layers;
  const safeLayers = layers.length ? layers : fallback.layers;
  const selectedLayerId = safeLayers.some((layer) => layer.id === record?.selectedLayerId) ? record?.selectedLayerId : safeLayers[0]?.id;
  const selectedLayer = safeLayers.find((layer) => layer.id === selectedLayerId);
  const selectedBindingId = selectedLayer?.kind === 'keys' && selectedLayer.bindings.some((binding) => binding.id === record?.selectedBindingId) ? record?.selectedBindingId : undefined;
  const bounds = keyMappingDisplayBounds({
    bounds: normalizeKeyMappingBounds(record?.bounds, fallback.bounds),
    canvasWidth,
    canvasHeight,
    scale
  });
  return {
    bounds,
    canvasWidth,
    canvasHeight,
    scale,
    layers: safeLayers,
    selectedLayerId,
    selectedBindingId
  };
}

export function normalizeKeyMappingPayload(value: unknown): KeyMappingPayload {
  const record = value as Partial<KeyMappingPayload> | null;
  const config = normalizeKeyMappingConfig(value);
  return {
    ...config,
    visible: Boolean(record?.visible),
    moveMode: Boolean(record?.moveMode)
  };
}

export function keyMappingCodeLabel(code: string): string {
  if (code === 'MouseLeft') return '鼠标左键';
  if (code === 'MouseRight') return '鼠标右键';
  if (code === 'MouseMiddle') return '鼠标中键';
  if (code === 'Space') return '空格';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

export function transformStyle(transform: KeyMappingTransform): CSSProperties {
  return {
    left: `${transform.x}%`,
    top: `${transform.y}%`,
    width: `${transform.width}%`,
    height: `${transform.height}%`,
    opacity: transform.opacity,
    transform: `rotate(${transform.rotate}deg)`
  };
}
