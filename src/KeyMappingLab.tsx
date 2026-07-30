import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { Image as ImageIcon, Keyboard, Layers, Move, Plus, RotateCcw, Save, Settings, Trash2, Upload, X } from 'lucide-react';
import type { KeyBinding } from '../combo-core/types';
import { normalizeInputCode } from '../combo-core/input';
import { createDesktopBridge } from './desktopBridge';
import { useI18n } from './i18n';
import { NumericDraftInput } from './NumericDraftInput';
import {
  DEFAULT_KEY_MAPPING_TRANSFORM,
  KEY_MAPPING_STORAGE_KEY,
  assetUrl,
  createDefaultKeyMappingConfig,
  keyMappingBindingIsActive,
  keyMappingBindingLabel,
  keyMappingDisplayBounds,
  keyMappingCodeLabel,
  normalizeKeyMappingBounds,
  normalizeKeyMappingConfig,
  normalizeKeyMappingScale,
  normalizeKeyMappingTransform,
  transformStyle,
  withSettingsSyncedKeyMappingBindings,
  type KeyMappingBinding,
  type KeyMappingConfig,
  type KeyMappingImageLayer,
  type KeyMappingKeysLayer,
  type KeyMappingLayer,
  type KeyMappingTransform
} from './keyMappingTypes';

export type KeyMappingInputType = 'keydown' | 'keyup' | 'mousedown' | 'mouseup' | 'gamepadbuttondown' | 'gamepadbuttonup';

export type KeyMappingInputSignal = {
  id: string;
  type: KeyMappingInputType;
  code: string;
  time: number;
};

type Props = {
  inputSignal: KeyMappingInputSignal | null;
  inputMode: 'keyboard' | 'gamepad';
  bindings: KeyBinding[];
  onRequestGlobalInput?: () => void | Promise<void>;
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
};

type EditTarget = 'layer' | 'binding';
type KeyMappingPreset = { id: string; name: string; config: KeyMappingConfig; user?: boolean };
type LayerDrag = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
};
type TransformDrag = {
  kind: 'move' | 'resize';
  edge?: string;
  target: EditTarget;
  layerId: string;
  bindingId?: string;
  startX: number;
  startY: number;
  base: KeyMappingTransform;
  rect: DOMRect;
};

const PREVIEW_HANDLES = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];
const KEY_MAPPING_PRESETS_STORAGE_KEY = 'ww-combo-trainer-key-mapping-presets-v1';

function cloneKeyMappingConfig(config: KeyMappingConfig): KeyMappingConfig {
  return normalizeKeyMappingConfig(JSON.parse(JSON.stringify(config)));
}

function defaultKeyMappingPresets(): KeyMappingPreset[] {
  return [{ id: 'default-keymap-preset', name: '默认', config: createDefaultKeyMappingConfig() }];
}

function normalizeKeyMappingPresets(value: unknown): KeyMappingPreset[] {
  const items = Array.isArray(value) ? value : Array.isArray((value as { items?: unknown[] } | null)?.items) ? (value as { items: unknown[] }).items : [];
  return items.flatMap((item) => {
    const record = item as Partial<KeyMappingPreset> | null;
    if (!record || typeof record.name !== 'string' || !record.config) return [];
    return [{ id: typeof record.id === 'string' && record.id ? record.id : crypto.randomUUID(), name: record.name.trim() || '未命名', config: normalizeKeyMappingConfig(record.config), user: record.user === true }];
  });
}

function loadKeyMappingPresets(): KeyMappingPreset[] {
  try {
    const raw = localStorage.getItem(KEY_MAPPING_PRESETS_STORAGE_KEY);
    return [...defaultKeyMappingPresets(), ...normalizeKeyMappingPresets(raw ? JSON.parse(raw) : [])];
  } catch {
    return defaultKeyMappingPresets();
  }
}

function saveUserKeyMappingPresets(presets: KeyMappingPreset[]) {
  localStorage.setItem(KEY_MAPPING_PRESETS_STORAGE_KEY, JSON.stringify(presets.filter((preset) => preset.user)));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

function loadConfig(): KeyMappingConfig {
  try {
    const raw = localStorage.getItem(KEY_MAPPING_STORAGE_KEY);
    return raw ? normalizeKeyMappingConfig(JSON.parse(raw)) : createDefaultKeyMappingConfig();
  } catch {
    return createDefaultKeyMappingConfig();
  }
}

function mouseButtonToCode(button: number): string {
  if (button === 0) return 'MouseLeft';
  if (button === 1) return 'MouseMiddle';
  if (button === 2) return 'MouseRight';
  return `Mouse${button}`;
}

function isPress(type: KeyMappingInputType): boolean {
  return type === 'keydown' || type === 'mousedown' || type === 'gamepadbuttondown';
}

function isRelease(type: KeyMappingInputType): boolean {
  return type === 'keyup' || type === 'mouseup' || type === 'gamepadbuttonup';
}

function transformPatchFromDrag(drag: TransformDrag, event: PointerEvent): Partial<KeyMappingTransform> {
  const dx = ((event.clientX - drag.startX) / Math.max(1, drag.rect.width)) * 100;
  const dy = ((event.clientY - drag.startY) / Math.max(1, drag.rect.height)) * 100;
  const next = { ...drag.base };
  if (drag.kind === 'move') {
    next.x = drag.base.x + dx;
    next.y = drag.base.y + dy;
    return next;
  }
  const edge = drag.edge ?? 'se';
  const horizontalScale = edge.includes('e')
    ? (drag.base.width + dx) / Math.max(1, drag.base.width)
    : edge.includes('w')
      ? (drag.base.width - dx) / Math.max(1, drag.base.width)
      : null;
  const verticalScale = edge.includes('s')
    ? (drag.base.height + dy) / Math.max(1, drag.base.height)
    : edge.includes('n')
      ? (drag.base.height - dy) / Math.max(1, drag.base.height)
      : null;
  const rawScale = horizontalScale !== null && verticalScale !== null
    ? (Math.abs(horizontalScale - 1) >= Math.abs(verticalScale - 1) ? horizontalScale : verticalScale)
    : horizontalScale ?? verticalScale ?? 1;
  const minScale = Math.max(1 / Math.max(1, drag.base.width), 1 / Math.max(1, drag.base.height));
  const maxScale = Math.min(400 / Math.max(1, drag.base.width), 400 / Math.max(1, drag.base.height));
  const scale = Math.min(maxScale, Math.max(minScale, rawScale));
  const nextWidth = drag.base.width * scale;
  const nextHeight = drag.base.height * scale;
  const baseRight = drag.base.x + drag.base.width;
  const baseBottom = drag.base.y + drag.base.height;
  next.width = nextWidth;
  next.height = nextHeight;
  if (edge.includes('w')) next.x = baseRight - nextWidth;
  else if (!edge.includes('e')) next.x = drag.base.x + (drag.base.width - nextWidth) / 2;
  if (edge.includes('n')) next.y = baseBottom - nextHeight;
  else if (!edge.includes('s')) next.y = drag.base.y + (drag.base.height - nextHeight) / 2;
  return next;
}

function imageLayer(name = '图片层'): KeyMappingImageLayer {
  return { id: crypto.randomUUID(), kind: 'image', name, src: undefined, transform: { ...DEFAULT_KEY_MAPPING_TRANSFORM } };
}

function keysLayer(name = '按键层'): KeyMappingKeysLayer {
  return { id: crypto.randomUUID(), kind: 'keys', name, transform: { ...DEFAULT_KEY_MAPPING_TRANSFORM }, bindings: [] };
}

function keyBinding(): KeyMappingBinding {
  return { id: crypto.randomUUID(), name: '新按键', code: 'KeyE', src: '/key-mapping/default/keyboard/1.png', transform: { ...DEFAULT_KEY_MAPPING_TRANSFORM } };
}

function layerKindLabel(layer: KeyMappingLayer): string {
  return layer.kind === 'image' ? '图片' : '按键';
}

function selectedTransform(config: KeyMappingConfig, editTarget: EditTarget): KeyMappingTransform | null {
  const layer = config.layers.find((item) => item.id === config.selectedLayerId);
  if (!layer) return null;
  if (editTarget === 'binding' && layer.kind === 'keys') return layer.bindings.find((binding) => binding.id === config.selectedBindingId)?.transform ?? null;
  return layer.transform;
}

function scaleFromBounds(bounds: { width: number; height: number }, config: KeyMappingConfig): number {
  const scaleX = Number.isFinite(bounds.width) ? bounds.width / Math.max(1, config.canvasWidth) : config.scale;
  const scaleY = Number.isFinite(bounds.height) ? bounds.height / Math.max(1, config.canvasHeight) : config.scale;
  const rawScale = scaleX > 0 && scaleY > 0 ? Math.min(scaleX, scaleY) : scaleX > 0 ? scaleX : scaleY > 0 ? scaleY : config.scale;
  return normalizeKeyMappingScale(rawScale, config.scale, config.canvasWidth, config.canvasHeight);
}

function configFromLiveBounds(bounds: { x: number; y: number; width: number; height: number }, config: KeyMappingConfig): KeyMappingConfig {
  const scale = scaleFromBounds(bounds, config);
  const displayBounds = keyMappingDisplayBounds({ ...config, scale });
  return normalizeKeyMappingConfig({
    ...config,
    scale,
    bounds: {
      ...displayBounds,
      x: Math.round(Number.isFinite(bounds.x) ? bounds.x : displayBounds.x),
      y: Math.round(Number.isFinite(bounds.y) ? bounds.y : displayBounds.y)
    }
  });
}

export function KeyMappingLab({ inputSignal, inputMode, bindings, onRequestGlobalInput, visible: controlledVisible, onVisibleChange }: Props) {
  const { text } = useI18n();
  const desktop = useMemo(createDesktopBridge, []);
  const [config, setConfig] = useState<KeyMappingConfig>(loadConfig);
  const [localVisible, setLocalVisible] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [pressedCodes, setPressedCodes] = useState<Set<string>>(() => new Set());
  const [editTarget, setEditTarget] = useState<EditTarget>('binding');
  const [captureBindingId, setCaptureBindingId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetDeleteMode, setPresetDeleteMode] = useState(false);
  const [presetName, setPresetName] = useState(() => text('按键映射预设', 'Key Mapping Preset'));
  const [presets, setPresets] = useState<KeyMappingPreset[]>(loadKeyMappingPresets);
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const visible = controlledVisible ?? localVisible;
  const setVisibleState = (next: boolean) => {
    if (onVisibleChange) onVisibleChange(next);
    else setLocalVisible(next);
  };
  const layerDragRef = useRef<LayerDrag | null>(null);
  const suppressLayerClickRef = useRef(false);
  const transformDragRef = useRef<TransformDrag | null>(null);
  const configRef = useRef(config);
  const visibleRef = useRef(visible);
  const moveModeRef = useRef(moveMode);

  function displayStoredName(name: string): string {
    const direct: Record<string, string> = {
      '默认': text('默认', 'Default'),
      '未命名': text('未命名', 'Untitled'),
      '鼠标底图': text('鼠标底图', 'Mouse Background'),
      '图片层': text('图片层', 'Image Layer'),
      '按键层': text('按键层', 'Key Layer'),
      '新按键': text('新按键', 'New Key'),
      '按键映射预设': text('按键映射预设', 'Key Mapping Preset'),
      '工具': text('工具', 'Utility'),
      '技能': text('技能', 'Resonance Skill'),
      '声骸': text('声骸', 'Echo Skill'),
      '解放': text('解放', 'Resonance Liberation'),
      '跳跃': text('跳跃', 'Jump'),
      '普攻': text('普攻', 'Basic Attack'),
      '闪避': text('闪避', 'Dodge'),
      '交互': text('交互', 'Interact')
    };
    return direct[name] ?? name;
  }

  const selectedLayer = config.layers.find((layer) => layer.id === config.selectedLayerId) ?? config.layers[0] ?? null;
  const selectedBinding = selectedLayer?.kind === 'keys' ? selectedLayer.bindings.find((binding) => binding.id === config.selectedBindingId) ?? selectedLayer.bindings[0] ?? null : null;
  const currentTransform = selectedTransform(config, editTarget) ?? selectedLayer?.transform ?? DEFAULT_KEY_MAPPING_TRANSFORM;
  const displayConfig = useMemo(
    () => withSettingsSyncedKeyMappingBindings(config, bindings, inputMode),
    [config, bindings, inputMode]
  );
  const displaySelectedLayer = displayConfig.layers.find((layer) => layer.id === config.selectedLayerId) ?? displayConfig.layers[0] ?? null;
  const displaySelectedBinding = displaySelectedLayer?.kind === 'keys'
    ? displaySelectedLayer.bindings.find((binding) => binding.id === config.selectedBindingId) ?? displaySelectedLayer.bindings[0] ?? null
    : null;
  const displayBindingById = useMemo(() => {
    const map = new Map<string, KeyMappingBinding>();
    displayConfig.layers.forEach((layer) => {
      if (layer.kind !== 'keys') return;
      layer.bindings.forEach((binding) => map.set(binding.id, binding));
    });
    return map;
  }, [displayConfig]);

  useEffect(() => {
    configRef.current = config;
    localStorage.setItem(KEY_MAPPING_STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (displaySelectedLayer?.kind !== 'keys' || !displaySelectedLayer.bindings.length) return;
    if (displaySelectedLayer.bindings.some((binding) => binding.id === config.selectedBindingId)) return;
    patchConfig((current) => ({ ...current, selectedBindingId: displaySelectedLayer.bindings[0]?.id }));
  }, [displaySelectedLayer, config.selectedBindingId]);

  useEffect(() => {
    moveModeRef.current = moveMode;
  }, [moveMode]);

  useEffect(() => {
    const payload = { ...displayConfig, bounds: keyMappingDisplayBounds(displayConfig), visible, moveMode };
    void desktop?.updateKeyMapping?.(payload);
    if (!visible && !moveMode) void desktop?.setKeyMappingVisible?.(false);
  }, [desktop, displayConfig, visible, moveMode]);

  useEffect(() => {
    void desktop?.updateKeyMapping?.({ pressedCodes: [...pressedCodes] });
  }, [desktop, pressedCodes]);

  useEffect(() => desktop?.onKeyMappingBoundsChanged?.((bounds) => {
    const current = configRef.current;
    const nextConfig = configFromLiveBounds(bounds, current);
    if (moveModeRef.current) {
      configRef.current = nextConfig;
      localStorage.setItem(KEY_MAPPING_STORAGE_KEY, JSON.stringify(nextConfig));
      return;
    }
    setConfig(nextConfig);
  }), [desktop]);

  useEffect(() => () => {
    void desktop?.updateKeyMapping?.({ moveMode: false, pressedCodes: [] });
  }, [desktop]);

  useEffect(() => {
    if (!inputSignal) return;
    const normalized = normalizeInputCode(inputSignal.code);
    setPressedCodes((current) => {
      const next = new Set(current);
      if (isPress(inputSignal.type)) next.add(normalized);
      if (isRelease(inputSignal.type)) {
        next.delete(normalized);
        for (const pressed of next) {
          if (pressed.split('+').includes(normalized)) next.delete(pressed);
        }
      }
      return next;
    });
  }, [inputSignal]);

  useEffect(() => {
    if (!captureBindingId) return;
    const commit = (code: string) => {
      const normalized = normalizeInputCode(code);
      updateBinding(captureBindingId, { code: normalized, codes: [normalized], name: keyMappingCodeLabel(normalized, text) });
      setCaptureBindingId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      commit(event.code);
    };
    const onMouseDown = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest('[data-keymap-capture-button]')) return;
      event.preventDefault();
      event.stopPropagation();
      commit(mouseButtonToCode(event.button));
    };
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('contextmenu', onContextMenu, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
    };
  }, [captureBindingId, text]);

  function patchConfig(updater: (current: KeyMappingConfig) => KeyMappingConfig) {
    setConfig((current) => normalizeKeyMappingConfig(updater(current)));
  }

  function updateLayer(layerId: string, patch: Partial<KeyMappingLayer> | ((layer: KeyMappingLayer) => KeyMappingLayer)) {
    patchConfig((current) => ({
      ...current,
      layers: current.layers.map((layer) => layer.id === layerId ? (typeof patch === 'function' ? patch(layer) : { ...layer, ...patch } as KeyMappingLayer) : layer)
    }));
  }

  function updateBinding(bindingId: string, patch: Partial<KeyMappingBinding>) {
    if (!selectedLayer || selectedLayer.kind !== 'keys') return;
    updateLayer(selectedLayer.id, (layer) => layer.kind === 'keys' ? { ...layer, bindings: layer.bindings.map((binding) => binding.id === bindingId ? { ...binding, ...patch } : binding) } : layer);
  }

  function updateSelectedTransform(patch: Partial<KeyMappingTransform>) {
    if (!selectedLayer) return;
    if (editTarget === 'binding' && selectedLayer.kind === 'keys' && selectedBinding) {
      updateBinding(selectedBinding.id, { transform: normalizeKeyMappingTransform({ ...selectedBinding.transform, ...patch }, selectedBinding.transform) });
      return;
    }
    updateLayer(selectedLayer.id, { transform: normalizeKeyMappingTransform({ ...selectedLayer.transform, ...patch }, selectedLayer.transform) } as Partial<KeyMappingLayer>);
  }

  function addImageLayer() {
    const layer = imageLayer(text('图片层', 'Image Layer'));
    patchConfig((current) => ({ ...current, layers: [layer, ...current.layers], selectedLayerId: layer.id, selectedBindingId: undefined }));
    setEditTarget('layer');
  }

  function addKeysLayer() {
    const layer = keysLayer(text('按键层', 'Key Layer'));
    patchConfig((current) => ({ ...current, layers: [layer, ...current.layers], selectedLayerId: layer.id, selectedBindingId: undefined }));
    setEditTarget('layer');
  }

  function addBinding() {
    if (!selectedLayer || selectedLayer.kind !== 'keys') return;
    const binding = { ...keyBinding(), name: text('新按键', 'New Key') };
    updateLayer(selectedLayer.id, (layer) => layer.kind === 'keys' ? { ...layer, bindings: [...layer.bindings, binding] } : layer);
    patchConfig((current) => ({ ...current, selectedBindingId: binding.id }));
    setEditTarget('binding');
  }

  function deleteSelectedLayer() {
    if (!selectedLayer || config.layers.length <= 1) return;
    patchConfig((current) => {
      const layers = current.layers.filter((layer) => layer.id !== selectedLayer.id);
      return { ...current, layers, selectedLayerId: layers[0]?.id, selectedBindingId: undefined };
    });
  }

  function deleteBinding(bindingId: string) {
    if (!selectedLayer || selectedLayer.kind !== 'keys') return;
    updateLayer(selectedLayer.id, (layer) => layer.kind === 'keys' ? { ...layer, bindings: layer.bindings.filter((binding) => binding.id !== bindingId) } : layer);
    patchConfig((current) => ({ ...current, selectedBindingId: current.selectedBindingId === bindingId ? undefined : current.selectedBindingId }));
  }

  function moveLayer(sourceId: string, targetId: string) {
    if (!sourceId || sourceId === targetId) return;
    patchConfig((current) => {
      const layers = [...current.layers];
      const from = layers.findIndex((layer) => layer.id === sourceId);
      const to = layers.findIndex((layer) => layer.id === targetId);
      if (from < 0 || to < 0) return current;
      const [picked] = layers.splice(from, 1);
      layers.splice(to, 0, picked);
      return { ...current, layers };
    });
  }

  function beginLayerDrag(event: ReactPointerEvent<HTMLButtonElement>, layerId: string) {
    if (event.button !== 0) return;
    layerDragRef.current = { id: layerId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateLayerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = layerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active) {
      const moved = Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY);
      if (moved < 8) return;
      drag.active = true;
      setDraggingLayerId(drag.id);
      suppressLayerClickRef.current = true;
    }
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>('[data-keymap-layer-pill]');
    const targetId = target?.dataset.keymapLayerId;
    if (targetId && targetId !== drag.id) moveLayer(drag.id, targetId);
  }

  function endLayerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = layerDragRef.current;
    if (drag?.pointerId === event.pointerId) layerDragRef.current = null;
    setDraggingLayerId(null);
    if (drag?.active) window.setTimeout(() => { suppressLayerClickRef.current = false; }, 0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function pickImageForLayer(layerId: string, file: File | null) {
    if (!file) return;
    const src = await readFileAsDataUrl(file);
    updateLayer(layerId, { src } as Partial<KeyMappingLayer>);
  }

  async function pickImageForBinding(bindingId: string, file: File | null) {
    if (!file) return;
    const src = await readFileAsDataUrl(file);
    updateBinding(bindingId, { src });
  }

  async function toggleVisible() {
    const next = !visible;
    if (next) await onRequestGlobalInput?.();
    if (next) await desktop?.setKeyMappingBounds?.(keyMappingDisplayBounds(config));
    setVisibleState(next);
    if (!next) setMoveMode(false);
  }

  async function toggleMoveMode() {
    const next = !moveMode;
    if (next) {
      await onRequestGlobalInput?.();
      await desktop?.setKeyMappingBounds?.(keyMappingDisplayBounds(config));
      setVisibleState(true);
      setMoveMode(true);
      return;
    }
    const liveBounds = await desktop?.getKeyMappingBounds?.().catch(() => null);
    if (liveBounds) {
      const nextConfig = configFromLiveBounds(liveBounds, configRef.current);
      configRef.current = nextConfig;
      localStorage.setItem(KEY_MAPPING_STORAGE_KEY, JSON.stringify(nextConfig));
      setConfig(nextConfig);
    }
    setMoveMode(false);
  }

  async function resetConfig() {
    const next = createDefaultKeyMappingConfig();
    setConfig(next);
    setEditTarget('binding');
    await desktop?.setKeyMappingBounds?.(keyMappingDisplayBounds(next));
  }

  function applyPreset(preset: KeyMappingPreset) {
    if (presetDeleteMode) {
      if (!preset.user) return;
      setPresets((current) => {
        const next = current.filter((item) => item.id !== preset.id);
        saveUserKeyMappingPresets(next);
        return next;
      });
      return;
    }
    const next = cloneKeyMappingConfig(preset.config);
    setConfig(next);
    setEditTarget('binding');
    void desktop?.setKeyMappingBounds?.(keyMappingDisplayBounds(next));
    setPresetOpen(false);
  }

  function savePreset() {
    const preset: KeyMappingPreset = { id: `keymap_preset_${crypto.randomUUID()}`, name: presetName.trim() || '按键映射预设', config: cloneKeyMappingConfig(config), user: true };
    setPresets((current) => {
      const next = [...current, preset];
      saveUserKeyMappingPresets(next);
      return next;
    });
    setPresetName(preset.name);
  }

  function beginTransformDrag(event: ReactPointerEvent<HTMLElement>, kind: 'move' | 'resize', edge?: string) {
    if (!selectedLayer || event.button !== 0) return;
    const target = editTarget === 'binding' && selectedLayer.kind === 'keys' && selectedBinding ? 'binding' : 'layer';
    const parent = target === 'binding'
      ? document.querySelector(`[data-keymap-layer-id="${selectedLayer.id}"]`) as HTMLElement | null
      : event.currentTarget.closest('.keymap-preview-stage') as HTMLElement | null;
    const rect = parent?.getBoundingClientRect();
    const base = target === 'binding' && selectedBinding ? selectedBinding.transform : selectedLayer.transform;
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    transformDragRef.current = { kind, edge, target, layerId: selectedLayer.id, bindingId: selectedBinding?.id, startX: event.clientX, startY: event.clientY, base, rect };
    const onMove = (moveEvent: PointerEvent) => {
      const drag = transformDragRef.current;
      if (!drag) return;
      const patch = transformPatchFromDrag(drag, moveEvent);
      if (drag.target === 'binding' && drag.bindingId) updateBinding(drag.bindingId, { transform: normalizeKeyMappingTransform(patch, drag.base) });
      else updateLayer(drag.layerId, (layer) => ({ ...layer, transform: normalizeKeyMappingTransform(patch, drag.base) } as KeyMappingLayer));
    };
    const onUp = () => {
      transformDragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function selectLayer(layer: KeyMappingLayer) {
    patchConfig((current) => ({ ...current, selectedLayerId: layer.id, selectedBindingId: layer.kind === 'keys' ? (layer.bindings[0]?.id ?? undefined) : undefined }));
    setEditTarget(layer.kind === 'keys' && layer.bindings.length ? 'binding' : 'layer');
  }

  const pressedPreview = pressedCodes;

  return (
    <div className="keymap-lab">
      <section className="panel keymap-main-panel">
        <div className="panel-title experiment-subtitle">
          <div><h2>{text('按键映射', 'Key Mapping') }</h2><p>{text(`跟随总设置键位。当前为${inputMode === 'gamepad' ? '手柄' : '键鼠'}模式，有动作关联的图片会直接响应总设置绑定。`, `Uses the main bindings. Current mode: ${inputMode === 'gamepad' ? 'Gamepad' : 'Keyboard & Mouse'}. Action-linked images respond to those bindings.`) }</p></div>
          <div className="keymap-toolbar">
            <button onClick={toggleVisible}>{text('悬浮', 'Always on Top') }</button>
            <button className={moveMode ? 'active' : ''} onClick={toggleMoveMode}><Move size={16} />{text('移动', 'Move') }</button>
            <button onClick={() => setPresetOpen(true)}><Save size={16} />{text('预设', 'Presets') }</button>
            <button onClick={() => setSettingsOpen(true)}><Settings size={16} />{text('设置', 'Settings') }</button>
            <button onClick={resetConfig}><RotateCcw size={16} />{text('复位', 'Reset') }</button>
          </div>
        </div>

        <div className="keymap-layer-strip" aria-label={text('图层轨道', 'Layer Track') }>
          {config.layers.map((layer, index) => (
            <button
              key={layer.id}
              className={`keymap-layer-pill ${layer.id === selectedLayer?.id ? 'active' : ''} ${draggingLayerId === layer.id ? 'dragging' : ''}`}
              data-keymap-layer-pill="true"
              data-keymap-layer-id={layer.id}
              onClick={() => {
                if (suppressLayerClickRef.current) {
                  suppressLayerClickRef.current = false;
                  return;
                }
                selectLayer(layer);
              }}
              onPointerDown={(event) => beginLayerDrag(event, layer.id)}
              onPointerMove={updateLayerDrag}
              onPointerUp={endLayerDrag}
              onPointerCancel={endLayerDrag}
              title={text('左边图层在上，右边图层在下', 'Layers on the left appear above layers on the right') }
            >
              <span>{index + 1}</span>{layer.kind === 'image' ? <ImageIcon size={15} /> : <Keyboard size={15} />}<b>{displayStoredName(layer.name)}</b><em>{layer.kind === 'image' ? text('图片', 'Image') : text('按键', 'Keys') }</em>
            </button>
          ))}
          <button className="keymap-layer-add" onClick={addImageLayer}><Plus size={16} />{text('图片层', 'Image Layer') }</button>
          <button className="keymap-layer-add" onClick={addKeysLayer}><Plus size={16} />{text('按键层', 'Key Layer') }</button>
        </div>

        <div className="keymap-workbench">
          <div className="keymap-preview-wrap">
            <div className="keymap-preview-stage" style={{ aspectRatio: `${config.canvasWidth} / ${config.canvasHeight}` } as CSSProperties}>
              {displayConfig.layers.map((layer, index) => (
                <KeyMappingPreviewLayer
                  key={layer.id}
                  layer={layer}
                  zIndex={displayConfig.layers.length - index}
                  pressedCodes={pressedPreview}
                  selectedLayerId={selectedLayer?.id}
                  selectedBindingId={selectedBinding?.id}
                  editTarget={editTarget}
                  onSelectLayer={() => selectLayer(layer)}
                  onSelectBinding={(bindingId) => {
                    patchConfig((current) => ({ ...current, selectedLayerId: layer.id, selectedBindingId: bindingId }));
                    setEditTarget('binding');
                  }}
                  onBeginTransformDrag={beginTransformDrag}
                />
              ))}
            </div>
          </div>

          <aside className="keymap-inspector">
            <div className="keymap-inspector-head">
              <strong>{selectedLayer ? displayStoredName(selectedLayer.name) : text('未选择图层', 'No Layer Selected') }</strong>
              <div className="segmented keymap-target-tabs"><button className={editTarget === 'layer' ? 'active' : ''} onClick={() => setEditTarget('layer')}>{text('图层', 'Layer') }</button><button className={editTarget === 'binding' ? 'active' : ''} disabled={selectedLayer?.kind !== 'keys'} onClick={() => setEditTarget('binding')}>{text('按键图片', 'Key Image') }</button></div>
            </div>

            {selectedLayer && <div className="keymap-field-grid">
              <label>{text('名称', 'Name') }<input value={displayStoredName(selectedLayer.name)} onChange={(event) => updateLayer(selectedLayer.id, { name: event.target.value } as Partial<KeyMappingLayer>)} /></label>
              {selectedLayer.kind === 'image' && <label className="keymap-file-picker"><Upload size={16} />{text('上传图片', 'Upload Image') }<input type="file" accept="image/*" onChange={(event) => void pickImageForLayer(selectedLayer.id, event.target.files?.[0] ?? null)} /></label>}
              <button className="danger" onClick={deleteSelectedLayer} disabled={config.layers.length <= 1}><Trash2 size={16} />{text('删除图层', 'Delete Layer') }</button>
            </div>}

            {selectedLayer?.kind === 'keys' && <div className="keymap-binding-panel">
              <div className="keymap-binding-head"><strong>{inputMode === 'gamepad' ? text('手柄映射', 'Gamepad Mapping') : text('键鼠映射', 'Keyboard & Mouse Mapping')}</strong><button onClick={addBinding} disabled={inputMode === 'gamepad'} title={inputMode === 'gamepad' ? text('手柄映射跟随总设置，无需重复新增', 'Gamepad mappings follow the main settings and do not need to be added again') : undefined}><Plus size={16} />{text('新增按键', 'Add Key') }</button></div>
              <div className="keymap-binding-list">
                {(displaySelectedLayer?.kind === 'keys' ? displaySelectedLayer.bindings : []).map((displayBinding) => {
                  const binding = selectedLayer.bindings.find((item) => item.id === displayBinding.id) ?? displayBinding;
                  return (
                  <div key={binding.id} className={`keymap-binding-row ${binding.id === selectedBinding?.id ? 'active' : ''}`} onClick={() => { patchConfig((current) => ({ ...current, selectedBindingId: binding.id })); setEditTarget('binding'); }}>
                    <img src={assetUrl(binding.src)} alt="" />
                    <input value={displayStoredName(binding.name)} onChange={(event) => updateBinding(binding.id, { name: event.target.value })} />
                    <button
                      className={captureBindingId === binding.id ? 'active' : ''}
                      data-keymap-capture-button="true"
                      onClick={(event) => {
                        event.stopPropagation();
                        setCaptureBindingId(captureBindingId === binding.id ? null : binding.id);
                      }}
                    >{captureBindingId === binding.id ? text('按下键位', 'Press a Key') : keyMappingBindingLabel(displayBindingById.get(binding.id) ?? displayBinding, text)}</button>
                    <label className="keymap-file-mini"><Upload size={15} /><input type="file" accept="image/*" onChange={(event) => void pickImageForBinding(binding.id, event.target.files?.[0] ?? null)} /></label>
                    <button className="icon-button danger" onClick={(event) => { event.stopPropagation(); deleteBinding(binding.id); }}><Trash2 size={15} /></button>
                  </div>
                  );
                })}
              </div>
            </div>}

            <TransformEditor transform={currentTransform} onChange={updateSelectedTransform} />
          </aside>
        </div>
      </section>

      {settingsOpen && <div className="appearance-floating-backdrop" onMouseDown={() => setSettingsOpen(false)}>
        <div className="appearance-settings-popover keymap-settings-popover" onMouseDown={(event) => event.stopPropagation()}>
          <div className="appearance-settings-head"><strong>{text('按键映射设置', 'Key Mapping Settings') }</strong><button onClick={() => setSettingsOpen(false)}><X size={16} /></button></div>
          <div className="appearance-settings-group"><span>{text('整体窗口', 'Window') }</span><div className="appearance-grid">
            <NumberField label="X" value={config.bounds.x} onCommit={(value) => patchConfig((current) => ({ ...current, bounds: normalizeKeyMappingBounds({ ...current.bounds, x: value }, current.bounds) }))} />
            <NumberField label="Y" value={config.bounds.y} onCommit={(value) => patchConfig((current) => ({ ...current, bounds: normalizeKeyMappingBounds({ ...current.bounds, y: value }, current.bounds) }))} />
            <NumberField label={text('大小缩放 x100', 'Scale x100') } value={Math.round(config.scale * 100)} min={30} max={300} onCommit={(value) => patchConfig((current) => ({ ...current, scale: value / 100 }))} />
            <NumberField label={text('画布宽', 'Canvas Width') } value={config.canvasWidth} min={160} onCommit={(value) => patchConfig((current) => ({ ...current, canvasWidth: value }))} />
            <NumberField label={text('画布高', 'Canvas Height') } value={config.canvasHeight} min={120} onCommit={(value) => patchConfig((current) => ({ ...current, canvasHeight: value }))} />
          </div></div>
        </div>
      </div>}

      {presetOpen && <div className="preset-picker-backdrop" onMouseDown={() => setPresetOpen(false)}><div className="preset-picker-panel keymap-preset-panel" onMouseDown={(event) => event.stopPropagation()}>
        <div className="preset-picker-head"><div><h3>{text('按键映射预设', 'Key Mapping Presets') }</h3><p>{presetDeleteMode ? text('删除模式：只能删除自己保存的预设。', 'Delete mode: only presets you saved can be removed.') : text('保存和切换完整按键映射设置。', 'Save and switch complete key mapping setups.')}</p></div><div className="base-preset-head-actions"><button onClick={savePreset}><Save size={18} /><span>{text('保存预设', 'Save Preset') }</span></button><button className={presetDeleteMode ? 'active danger' : ''} title={text('删除用户预设', 'Delete User Presets') } onClick={() => setPresetDeleteMode((current) => !current)}><X size={19} /></button></div></div>
        <div className="custom-base-editor-toolbar"><label>{text('预设名称', 'Preset Name') }<input value={presetName} onChange={(event) => setPresetName(event.target.value)} /></label></div>
        <div className="preset-picker-grid keymap-preset-grid">{presets.map((preset) => <button key={preset.id} className={`preset-tile keymap-preset-tile ${presetDeleteMode && preset.user ? 'delete-mode' : ''} ${presetDeleteMode && !preset.user ? 'locked-preset' : ''}`} onClick={() => applyPreset(preset)}><span className="keymap-preset-preview"><Layers size={34} /><b>{preset.config.layers.length}</b></span><strong>{displayStoredName(preset.name)}</strong>{presetDeleteMode && preset.user && <span className="preset-delete-x" aria-hidden="true">×</span>}</button>)}</div>
      </div></div>}
    </div>
  );
}

function KeyMappingPreviewLayer({ layer, zIndex, pressedCodes, selectedLayerId, selectedBindingId, editTarget, onSelectLayer, onSelectBinding, onBeginTransformDrag }: {
  layer: KeyMappingLayer;
  zIndex: number;
  pressedCodes: Set<string>;
  selectedLayerId?: string;
  selectedBindingId?: string;
  editTarget: EditTarget;
  onSelectLayer: () => void;
  onSelectBinding: (bindingId: string) => void;
  onBeginTransformDrag: (event: ReactPointerEvent<HTMLElement>, kind: 'move' | 'resize', edge?: string) => void;
}) {
  const layerSelected = selectedLayerId === layer.id;
  return (
    <div className="keymap-preview-layer" data-keymap-layer-id={layer.id} style={{ ...transformStyle(layer.transform), zIndex }} onPointerDown={(event) => { event.stopPropagation(); onSelectLayer(); }}>
      {layer.kind === 'image' && layer.src && <img className="keymap-preview-image" src={assetUrl(layer.src)} alt="" />}
      {layer.kind === 'keys' && layer.bindings.map((binding) => {
        const active = keyMappingBindingIsActive(binding, pressedCodes);
        const editing = layerSelected && (editTarget === 'binding' ? selectedBindingId === binding.id : true);
        const opacity = active ? binding.transform.opacity : editing ? Math.min(binding.transform.opacity, 0.42) : 0;
        return <img key={binding.id} className={`keymap-preview-key ${active ? 'pressed' : ''} ${editing ? 'editing' : ''}`} src={assetUrl(binding.src)} alt="" style={{ ...transformStyle(binding.transform), opacity }} onPointerDown={(event) => { event.stopPropagation(); onSelectBinding(binding.id); }} />;
      })}
      {layerSelected && editTarget === 'layer' && <EditFrame onBeginTransformDrag={onBeginTransformDrag} />}
      {layer.kind === 'keys' && layerSelected && editTarget === 'binding' && layer.bindings.map((binding) => binding.id === selectedBindingId ? <div key={`frame-${binding.id}`} className="keymap-edit-frame binding-frame" style={transformStyle(binding.transform)} onPointerDown={(event) => onBeginTransformDrag(event, 'move')}>
        {PREVIEW_HANDLES.map((edge) => <i key={edge} className={`keymap-edit-handle ${edge}`} onPointerDown={(event) => onBeginTransformDrag(event, 'resize', edge)} />)}
      </div> : null)}
    </div>
  );
}

function EditFrame({ onBeginTransformDrag }: { onBeginTransformDrag: (event: ReactPointerEvent<HTMLElement>, kind: 'move' | 'resize', edge?: string) => void }) {
  return <div className="keymap-edit-frame" onPointerDown={(event) => onBeginTransformDrag(event, 'move')}>{PREVIEW_HANDLES.map((edge) => <i key={edge} className={`keymap-edit-handle ${edge}`} onPointerDown={(event) => onBeginTransformDrag(event, 'resize', edge)} />)}</div>;
}

function TransformEditor({ transform, onChange }: { transform: KeyMappingTransform; onChange: (patch: Partial<KeyMappingTransform>) => void }) {
  const { text } = useI18n();
  const uniformScale = Math.round(((transform.width + transform.height) / 2) * 10) / 10;
  return (
    <div className="keymap-transform-editor">
      <strong>{text('位置与缩放', 'Position & Scale') }</strong>
      <div className="keymap-transform-grid">
        <NumberField label="X%" value={Math.round(transform.x * 10) / 10} onCommit={(value) => onChange({ x: value })} />
        <NumberField label="Y%" value={Math.round(transform.y * 10) / 10} onCommit={(value) => onChange({ y: value })} />
        <NumberField label={text('缩放 x100', 'Scale x100') } value={uniformScale} min={1} max={400} onCommit={(value) => onChange({ width: value, height: value })} />
        <NumberField label={text('透明 x100', 'Opacity x100') } value={Math.round(transform.opacity * 100)} min={0} max={100} onCommit={(value) => onChange({ opacity: value / 100 })} />
        <NumberField label={text('旋转', 'Rotation') } value={Math.round(transform.rotate)} onCommit={(value) => onChange({ rotate: value })} />
      </div>
    </div>
  );
}

function NumberField({ label, value, min, max, onCommit }: { label: string; value: number; min?: number; max?: number; onCommit: (value: number) => void }) {
  return <label>{label}<NumericDraftInput value={value} min={min} max={max} onCommit={onCommit} /></label>;
}
