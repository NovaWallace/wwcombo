import type { CSSProperties } from 'react';
import type { KeyBinding } from '../combo-core/types';
import { normalizeInputCode } from '../combo-core/input';

export type KeyMappingBounds = { x: number; y: number; width: number; height: number };
export type KeyMappingTransform = { x: number; y: number; width: number; height: number; opacity: number; rotate: number };

export type KeyMappingBinding = {
  id: string;
  name: string;
  code: string;
  moveId?: string;
  codes?: string[];
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
  ['工具', 'KeyT', 'tool'],
  ['技能', 'KeyE', 'skill'],
  ['声骸', 'KeyQ', 'echo'],
  ['解放', 'KeyR', 'liberation'],
  ['跳跃', 'Space', 'jump'],
  ['普攻', 'MouseLeft', 'basic_attack'],
  ['闪避', 'MouseRight', 'dodge'],
  ['交互', 'KeyF', 'start_challenge'],
  ['W', 'KeyW', ''],
  ['A', 'KeyA', ''],
  ['S', 'KeyS', ''],
  ['D', 'KeyD', ''],
  ['1', 'Digit1', 'switch_1'],
  ['2', 'Digit2', 'switch_2'],
  ['3', 'Digit3', 'switch_3']
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

function defaultKeyImageSrc(index: number): string {
  return `/key-mapping/default/keyboard/${index}.png`;
}

function defaultKeyIndexFromId(id: string): number | null {
  const match = /^default-key-(\d+)$/.exec(id);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 0 && index < DEFAULT_CODES.length ? index : null;
}

function isLikelyBrokenKeyMappingSrc(src: string | undefined): boolean {
  if (!src) return true;
  return /^blob:/i.test(src);
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
  return DEFAULT_CODES.map(([name, code, moveId], index) => ({
    id: `default-key-${index}`,
    name,
    code,
    codes: [code],
    moveId: moveId || undefined,
    src: defaultKeyImageSrc(index),
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
        name: '鼠标底图',
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

  const storedCode = typeof record.code === 'string' && record.code.trim() ? record.code.trim() : '';
  const storedCodes = Array.isArray(record.codes)
    ? record.codes.map((item) => String(item || '').trim()).filter(Boolean)
    : undefined;
  const id = typeof record.id === 'string' && record.id ? record.id : crypto.randomUUID();
  const migratedDefaultDodge = id === 'default-key-6' && (
    storedCode === 'MouseLeftHold'
    || storedCodes?.includes('MouseLeftHold')
    || record.moveId === 'heavy_attack'
    || record.name === '重击'
    || record.name === '长按普攻'
  );
  const code = migratedDefaultDodge ? 'MouseRight' : storedCode;
  const defaultIndex = defaultKeyIndexFromId(id) ?? DEFAULT_CODES.findIndex(([, defaultCode]) => defaultCode === code);
  const fallbackSrc = defaultIndex >= 0 ? defaultKeyImageSrc(defaultIndex) : undefined;
  const defaultMoveId = migratedDefaultDodge ? 'dodge' : defaultIndex >= 0 ? (DEFAULT_CODES[defaultIndex][2] || undefined) : undefined;
  const moveId = typeof record.moveId === 'string' && record.moveId.trim()
    ? (migratedDefaultDodge ? 'dodge' : record.moveId.trim())
    : defaultMoveId || undefined;
  const codes = migratedDefaultDodge
    ? ['MouseRight']
    : [...new Set([code, ...(storedCodes ?? [])].filter(Boolean).map(normalizeInputCode))];
  const primaryCode = codes[0] || '';
  const defaultName = defaultIndex >= 0 ? DEFAULT_CODES[defaultIndex][0] : undefined;
  const storedName = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : '';
  const name = migratedDefaultDodge ? '闪避' : storedName || defaultName || primaryCode || `按键 ${index + 1}`;

  return {
    id,
    name,
    code: primaryCode,
    moveId,
    codes: codes?.length ? codes : primaryCode ? [primaryCode] : undefined,
    src: isLikelyBrokenKeyMappingSrc(record.src) ? fallbackSrc : typeof record.src === 'string' ? record.src : fallbackSrc,
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
  const imageSrc = typeof (record as Partial<KeyMappingImageLayer>).src === 'string' ? (record as Partial<KeyMappingImageLayer>).src : undefined;
  return { ...base, kind: 'image', src: base.id === 'default-mousebg' && isLikelyBrokenKeyMappingSrc(imageSrc) ? '/key-mapping/default/mousebg.png' : imageSrc };
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

type KeyMappingLabelTranslator = (chinese: string, english: string) => string;

export function keyMappingCodeLabel(code: string, translate?: KeyMappingLabelTranslator): string {
  const normalized = normalizeInputCode(code);
  const label = (chinese: string, english: string) => translate?.(chinese, english) ?? chinese;
  if (!normalized) return '';
  if (normalized.includes('+')) return normalized.split('+').map((part) => keyMappingCodeLabel(part, translate)).join('+');
  if (normalized === 'MouseLeft') return label('鼠标左键', 'Left Mouse Button');
  if (normalized === 'MouseRight') return label('鼠标右键', 'Right Mouse Button');
  if (normalized === 'MouseMiddle') return label('鼠标中键', 'Middle Mouse Button');
  if (normalized === 'Space') return label('空格', 'Space');
  if (normalized === 'ShiftLeft' || normalized === 'ShiftRight') return 'Shift';
  if (normalized === 'ControlLeft' || normalized === 'ControlRight') return 'Ctrl';
  if (normalized === 'AltLeft' || normalized === 'AltRight') return 'Alt';
  if (normalized.startsWith('Key')) return normalized.slice(3);
  if (normalized.startsWith('Digit')) return normalized.slice(5);
  if (normalized.startsWith('Gamepad')) {
    const body = normalized.slice('Gamepad'.length);
    const hold = body.endsWith('Hold');
    const core = hold ? body.slice(0, -4) : body;
    const map: Record<string, string> = {
      A: 'A',
      B: 'B',
      X: 'X',
      Y: 'Y',
      LB: 'LB',
      RB: 'RB',
      LT: 'LT',
      RT: 'RT',
      Menu: 'Menu',
      View: 'View',
      DPadUp: label('十字上', 'D-pad Up'),
      DPadDown: label('十字下', 'D-pad Down'),
      DPadLeft: label('十字左', 'D-pad Left'),
      DPadRight: label('十字右', 'D-pad Right')
    };
    const coreLabel = map[core] ?? core;
    return hold ? label(`${coreLabel}长按`, `${coreLabel} Hold`) : coreLabel;
  }
  if (normalized.endsWith('Hold')) {
    const coreLabel = keyMappingCodeLabel(normalized.slice(0, -4), translate);
    return label(`${coreLabel}长按`, `${coreLabel} Hold`);
  }
  return normalized;
}

export function keyMappingBindingCodes(binding: Pick<KeyMappingBinding, 'code' | 'codes'>): string[] {
  const raw = [binding.code, ...(binding.codes ?? [])];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    const normalized = normalizeInputCode(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function keyMappingBindingIsActive(binding: Pick<KeyMappingBinding, 'code' | 'codes'>, pressedCodes: Set<string>): boolean {
  return keyMappingBindingCodes(binding).some((code) => pressedCodes.has(code));
}

export function resolveMoveBindingCodes(bindings: KeyBinding[], moveId: string): string[] {
  const found = bindings.find((item) => item.moveId === moveId);
  if (!found) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const input of found.inputs) {
    const normalized = normalizeInputCode(input.code);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function keyMappingBindingLabel(binding: Pick<KeyMappingBinding, 'code' | 'codes'>, translate?: KeyMappingLabelTranslator): string {
  const codes = keyMappingBindingCodes(binding);
  if (!codes.length) return translate?.('未绑定', 'Unbound') ?? '未绑定';
  return codes.map((code) => keyMappingCodeLabel(code, translate)).join(' / ');
}

export function withSettingsSyncedKeyMappingBindings(
  config: KeyMappingConfig,
  settingsBindings: KeyBinding[],
  inputMode: 'keyboard' | 'gamepad' = 'keyboard'
): KeyMappingConfig {
  const layers = config.layers.map((layer) => {
    if (layer.kind !== 'keys') return layer;
    const bindings: KeyMappingBinding[] = [];
    for (const binding of layer.bindings) {
      if (!binding.moveId) {
        if (inputMode === 'gamepad') continue;
        const codes = keyMappingBindingCodes(binding);
        bindings.push({
          ...binding,
          code: codes[0] ?? binding.code,
          codes: codes.length ? codes : undefined
        });
        continue;
      }
      const ownCodes = keyMappingBindingCodes(binding);
      const settingsBinding = settingsBindings.find((item) => item.moveId === binding.moveId);
      const codes = settingsBinding ? resolveMoveBindingCodes(settingsBindings, binding.moveId) : ownCodes;
      if (!codes.length) continue;
      bindings.push({
        ...binding,
        code: codes[0],
        codes
      });
    }
    return { ...layer, bindings };
  });
  return { ...config, layers };
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
