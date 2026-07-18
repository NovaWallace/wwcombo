import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { Eye, EyeOff, Image as ImageIcon, Keyboard, Layers, Move, Plus, RotateCcw, Settings, Trash2, Upload, X } from 'lucide-react';
import { normalizeInputCode } from '../combo-core/input';
import type { DesktopInputEvent } from './vite-env';
import { createDesktopBridge } from './desktopBridge';
import {
  DEFAULT_KEY_MAPPING_TRANSFORM,
  KEY_MAPPING_STORAGE_KEY,
  assetUrl,
  createDefaultKeyMappingConfig,
  keyMappingDisplayBounds,
  keyMappingCodeLabel,
  normalizeKeyMappingBounds,
  normalizeKeyMappingConfig,
  normalizeKeyMappingScale,
  normalizeKeyMappingTransform,
  transformStyle,
  type KeyMappingBinding,
  type KeyMappingConfig,
  type KeyMappingImageLayer,
  type KeyMappingKeysLayer,
  type KeyMappingLayer,
  type KeyMappingTransform
} from './keyMappingTypes';

export type KeyMappingInputSignal = {
  id: string;
  type: DesktopInputEvent['type'];
  code: string;
  time: number;
};

type Props = {
  inputSignal: KeyMappingInputSignal | null;
  onRequestGlobalInput?: () => void | Promise<void>;
};

type EditTarget = 'layer' | 'binding';
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

function isPress(type: DesktopInputEvent['type']): boolean {
  return type === 'keydown' || type === 'mousedown';
}

function isRelease(type: DesktopInputEvent['type']): boolean {
  return type === 'keyup' || type === 'mouseup';
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

export function KeyMappingLab({ inputSignal, onRequestGlobalInput }: Props) {
  const desktop = useMemo(createDesktopBridge, []);
  const [config, setConfig] = useState<KeyMappingConfig>(loadConfig);
  const [visible, setVisible] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [pressedCodes, setPressedCodes] = useState<Set<string>>(() => new Set());
  const [editTarget, setEditTarget] = useState<EditTarget>('binding');
  const [captureBindingId, setCaptureBindingId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const layerDragRef = useRef<LayerDrag | null>(null);
  const suppressLayerClickRef = useRef(false);
  const transformDragRef = useRef<TransformDrag | null>(null);
  const configRef = useRef(config);
  const visibleRef = useRef(visible);
  const moveModeRef = useRef(moveMode);

  const selectedLayer = config.layers.find((layer) => layer.id === config.selectedLayerId) ?? config.layers[0] ?? null;
  const selectedBinding = selectedLayer?.kind === 'keys' ? selectedLayer.bindings.find((binding) => binding.id === config.selectedBindingId) ?? selectedLayer.bindings[0] ?? null : null;
  const currentTransform = selectedTransform(config, editTarget) ?? selectedLayer?.transform ?? DEFAULT_KEY_MAPPING_TRANSFORM;

  useEffect(() => {
    configRef.current = config;
    localStorage.setItem(KEY_MAPPING_STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    moveModeRef.current = moveMode;
  }, [moveMode]);

  useEffect(() => {
    const payload = { ...config, bounds: keyMappingDisplayBounds(config), visible, moveMode };
    void desktop?.updateKeyMapping?.(payload);
    if (!visible && !moveMode) void desktop?.setKeyMappingVisible?.(false);
  }, [desktop, config, visible, moveMode]);

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
    void desktop?.updateKeyMapping?.({ visible: false, moveMode: false, pressedCodes: [] });
    void desktop?.setKeyMappingVisible?.(false);
  }, [desktop]);

  useEffect(() => {
    if (!inputSignal) return;
    const normalized = normalizeInputCode(inputSignal.code);
    setPressedCodes((current) => {
      const next = new Set(current);
      if (isPress(inputSignal.type)) next.add(normalized);
      if (isRelease(inputSignal.type)) next.delete(normalized);
      return next;
    });
  }, [inputSignal]);

  useEffect(() => {
    if (!captureBindingId) return;
    const commit = (code: string) => {
      const normalized = normalizeInputCode(code);
      updateBinding(captureBindingId, { code: normalized, name: keyMappingCodeLabel(normalized) });
      setCaptureBindingId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      commit(event.code);
    };
    const onMouseDown = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      commit(mouseButtonToCode(event.button));
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mousedown', onMouseDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mousedown', onMouseDown, true);
    };
  }, [captureBindingId]);

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
    const layer = imageLayer();
    patchConfig((current) => ({ ...current, layers: [layer, ...current.layers], selectedLayerId: layer.id, selectedBindingId: undefined }));
    setEditTarget('layer');
  }

  function addKeysLayer() {
    const layer = keysLayer();
    patchConfig((current) => ({ ...current, layers: [layer, ...current.layers], selectedLayerId: layer.id, selectedBindingId: undefined }));
    setEditTarget('layer');
  }

  function addBinding() {
    if (!selectedLayer || selectedLayer.kind !== 'keys') return;
    const binding = keyBinding();
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
    setVisible(next);
    if (!next) setMoveMode(false);
  }

  async function toggleMoveMode() {
    const next = !moveMode;
    if (next) {
      await onRequestGlobalInput?.();
      await desktop?.setKeyMappingBounds?.(keyMappingDisplayBounds(config));
      setVisible(true);
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
          <div><h2>按键映射</h2><p>按下键位时显示对应图片，适合做键鼠输入展示和趣味叠图。</p></div>
          <div className="keymap-toolbar">
            <button className="icon-button" onClick={toggleVisible} title="置顶显示">{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            <button className={moveMode ? 'active' : ''} onClick={toggleMoveMode}><Move size={16} />移动</button>
            <button onClick={() => setSettingsOpen(true)}><Settings size={16} />设置</button>
            <button onClick={resetConfig}><RotateCcw size={16} />复位</button>
          </div>
        </div>

        <div className="keymap-layer-strip" aria-label="图层轨道">
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
              title="左边图层在上，右边图层在下"
            >
              <span>{index + 1}</span>{layer.kind === 'image' ? <ImageIcon size={15} /> : <Keyboard size={15} />}<b>{layer.name}</b><em>{layerKindLabel(layer)}</em>
            </button>
          ))}
          <button className="keymap-layer-add" onClick={addImageLayer}><Plus size={16} />图片层</button>
          <button className="keymap-layer-add" onClick={addKeysLayer}><Plus size={16} />按键层</button>
        </div>

        <div className="keymap-workbench">
          <div className="keymap-preview-wrap">
            <div className="keymap-preview-stage" style={{ aspectRatio: `${config.canvasWidth} / ${config.canvasHeight}` } as CSSProperties}>
              {config.layers.map((layer, index) => (
                <KeyMappingPreviewLayer
                  key={layer.id}
                  layer={layer}
                  zIndex={config.layers.length - index}
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
              <strong>{selectedLayer?.name ?? '未选择图层'}</strong>
              <div className="segmented keymap-target-tabs"><button className={editTarget === 'layer' ? 'active' : ''} onClick={() => setEditTarget('layer')}>图层</button><button className={editTarget === 'binding' ? 'active' : ''} disabled={selectedLayer?.kind !== 'keys'} onClick={() => setEditTarget('binding')}>按键图片</button></div>
            </div>

            {selectedLayer && <div className="keymap-field-grid">
              <label>名称<input value={selectedLayer.name} onChange={(event) => updateLayer(selectedLayer.id, { name: event.target.value } as Partial<KeyMappingLayer>)} /></label>
              {selectedLayer.kind === 'image' && <label className="keymap-file-picker"><Upload size={16} />上传图片<input type="file" accept="image/*" onChange={(event) => void pickImageForLayer(selectedLayer.id, event.target.files?.[0] ?? null)} /></label>}
              <button className="danger" onClick={deleteSelectedLayer} disabled={config.layers.length <= 1}><Trash2 size={16} />删除图层</button>
            </div>}

            {selectedLayer?.kind === 'keys' && <div className="keymap-binding-panel">
              <div className="keymap-binding-head"><strong>按键设置</strong><button onClick={addBinding}><Plus size={16} />新增按键</button></div>
              <div className="keymap-binding-list">
                {selectedLayer.bindings.map((binding) => (
                  <div key={binding.id} className={`keymap-binding-row ${binding.id === selectedBinding?.id ? 'active' : ''}`} onClick={() => { patchConfig((current) => ({ ...current, selectedBindingId: binding.id })); setEditTarget('binding'); }}>
                    <img src={assetUrl(binding.src)} alt="" />
                    <input value={binding.name} onChange={(event) => updateBinding(binding.id, { name: event.target.value })} />
                    <button className={captureBindingId === binding.id ? 'active' : ''} onClick={(event) => { event.stopPropagation(); setCaptureBindingId(binding.id); }}>{captureBindingId === binding.id ? '按下键位' : keyMappingCodeLabel(binding.code)}</button>
                    <label className="keymap-file-mini"><Upload size={15} /><input type="file" accept="image/*" onChange={(event) => void pickImageForBinding(binding.id, event.target.files?.[0] ?? null)} /></label>
                    <button className="icon-button danger" onClick={(event) => { event.stopPropagation(); deleteBinding(binding.id); }}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            </div>}

            <TransformEditor transform={currentTransform} onChange={updateSelectedTransform} />
          </aside>
        </div>
      </section>

      {settingsOpen && <div className="appearance-floating-backdrop" onMouseDown={() => setSettingsOpen(false)}>
        <div className="appearance-settings-popover keymap-settings-popover" onMouseDown={(event) => event.stopPropagation()}>
          <div className="appearance-settings-head"><strong>按键映射设置</strong><button onClick={() => setSettingsOpen(false)}><X size={16} /></button></div>
          <div className="appearance-settings-group"><span>整体窗口</span><div className="appearance-grid">
            <NumberField label="X" value={config.bounds.x} onCommit={(value) => patchConfig((current) => ({ ...current, bounds: normalizeKeyMappingBounds({ ...current.bounds, x: value }, current.bounds) }))} />
            <NumberField label="Y" value={config.bounds.y} onCommit={(value) => patchConfig((current) => ({ ...current, bounds: normalizeKeyMappingBounds({ ...current.bounds, y: value }, current.bounds) }))} />
            <NumberField label="大小缩放 x100" value={Math.round(config.scale * 100)} min={30} max={300} onCommit={(value) => patchConfig((current) => ({ ...current, scale: value / 100 }))} />
            <NumberField label="画布宽" value={config.canvasWidth} min={160} onCommit={(value) => patchConfig((current) => ({ ...current, canvasWidth: value }))} />
            <NumberField label="画布高" value={config.canvasHeight} min={120} onCommit={(value) => patchConfig((current) => ({ ...current, canvasHeight: value }))} />
          </div></div>
        </div>
      </div>}
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
        const active = pressedCodes.has(normalizeInputCode(binding.code));
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
  const uniformScale = Math.round(((transform.width + transform.height) / 2) * 10) / 10;
  return (
    <div className="keymap-transform-editor">
      <strong>位置与缩放</strong>
      <div className="keymap-transform-grid">
        <NumberField label="X%" value={Math.round(transform.x * 10) / 10} onCommit={(value) => onChange({ x: value })} />
        <NumberField label="Y%" value={Math.round(transform.y * 10) / 10} onCommit={(value) => onChange({ y: value })} />
        <NumberField label="缩放 x100" value={uniformScale} min={1} max={400} onCommit={(value) => onChange({ width: value, height: value })} />
        <NumberField label="透明 x100" value={Math.round(transform.opacity * 100)} min={0} max={100} onCommit={(value) => onChange({ opacity: value / 100 })} />
        <NumberField label="旋转" value={Math.round(transform.rotate)} onCommit={(value) => onChange({ rotate: value })} />
      </div>
    </div>
  );
}

function NumberField({ label, value, min, max, onCommit }: { label: string; value: number; min?: number; max?: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    let next = Number(draft);
    if (!Number.isFinite(next)) next = value;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    onCommit(next);
  };
  return <label>{label}<input inputMode="numeric" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}
