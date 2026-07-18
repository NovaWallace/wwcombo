import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import ReactDOM from 'react-dom/client';
import { normalizeInputCode } from '../combo-core/input';
import { createKeyMappingBridge } from './desktopBridge';
import {
  KEY_MAPPING_DEFAULT_BOUNDS,
  assetUrl,
  keyMappingDisplayBounds,
  normalizeKeyMappingPayload,
  transformStyle,
  type KeyMappingPayload
} from './keyMappingTypes';
import './keyMappingOverlay.css';

type PayloadPatch = Partial<KeyMappingPayload> & { pressedCodes?: string[] };

function KeyMappingOverlayApp() {
  const bridge = useMemo(createKeyMappingBridge, []);
  const [payload, setPayload] = useState<KeyMappingPayload>(() => normalizeKeyMappingPayload({ bounds: KEY_MAPPING_DEFAULT_BOUNDS }));
  const [pressedCodes, setPressedCodes] = useState<Set<string>>(() => new Set());
  const [viewportSize, setViewportSize] = useState(() => ({ width: window.innerWidth || KEY_MAPPING_DEFAULT_BOUNDS.width, height: window.innerHeight || KEY_MAPPING_DEFAULT_BOUNDS.height }));
  const payloadRef = useRef(payload);

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  useEffect(() => {
    const updateViewport = () => setViewportSize({
      width: Math.max(1, window.innerWidth || KEY_MAPPING_DEFAULT_BOUNDS.width),
      height: Math.max(1, window.innerHeight || KEY_MAPPING_DEFAULT_BOUNDS.height)
    });
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const notifyLivePosition = useCallback(async () => {
    const liveBounds = await bridge?.getBounds?.().catch(() => null);
    if (!liveBounds) return;
    const current = payloadRef.current;
    const displayBounds = keyMappingDisplayBounds(current);
    void bridge?.notifyBoundsChanged?.({
      ...displayBounds,
      width: Math.max(1, Math.round(window.innerWidth || displayBounds.width)),
      height: Math.max(1, Math.round(window.innerHeight || displayBounds.height)),
      x: Math.round(Number.isFinite(liveBounds.x) ? liveBounds.x : displayBounds.x),
      y: Math.round(Number.isFinite(liveBounds.y) ? liveBounds.y : displayBounds.y)
    });
  }, [bridge]);

  const applyPatch = useCallback((patch: unknown) => {
    if (!patch || typeof patch !== 'object') return;
    const record = patch as PayloadPatch;
    if (Array.isArray(record.pressedCodes)) setPressedCodes(new Set(record.pressedCodes.map(normalizeInputCode)));
    const hasConfig = 'layers' in record || 'visible' in record || 'moveMode' in record || 'bounds' in record || 'canvasWidth' in record || 'canvasHeight' in record || 'scale' in record;
    if (!hasConfig) return;
    setPayload((current) => normalizeKeyMappingPayload({ ...current, ...record }));
  }, []);

  useEffect(() => bridge?.onUpdate((next) => applyPatch(next)), [bridge, applyPatch]);

  useEffect(() => {
    let disposed = false;
    bridge?.getState?.().then((next) => {
      if (!disposed) applyPatch(next);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [bridge, applyPatch]);

  useEffect(() => {
    const sync = () => void notifyLivePosition();
    window.addEventListener('pointerup', sync, true);
    window.addEventListener('mouseup', sync, true);
    window.addEventListener('blur', sync);
    return () => {
      window.removeEventListener('pointerup', sync, true);
      window.removeEventListener('mouseup', sync, true);
      window.removeEventListener('blur', sync);
    };
  }, [notifyLivePosition]);

  const shown = Boolean(payload.visible || payload.moveMode);
  const displayBounds = keyMappingDisplayBounds(payload);
  const stageScale = payload.moveMode
    ? Math.min(viewportSize.width / Math.max(1, payload.canvasWidth), viewportSize.height / Math.max(1, payload.canvasHeight))
    : displayBounds.width / Math.max(1, payload.canvasWidth);
  const scaleStyle = {
    width: `${payload.canvasWidth}px`,
    height: `${payload.canvasHeight}px`,
    transform: `scale(${stageScale})`
  } as CSSProperties;

  const beginMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!payload.moveMode || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    void bridge?.startDrag?.().catch(() => undefined);
    [100, 300, 700].forEach((delay) => window.setTimeout(() => void notifyLivePosition(), delay));
  };

  return (
    <div className={`keymap-overlay-root ${shown ? 'shown' : 'hidden'} ${payload.moveMode ? 'move-mode' : ''}`}>
      {shown && <div className="keymap-overlay-stage-shell" onPointerDown={beginMove}>
        <div className="keymap-overlay-stage" style={scaleStyle}>
          {payload.layers.map((layer, index) => (
            <div key={layer.id} className="keymap-overlay-layer" style={{ ...transformStyle(layer.transform), zIndex: payload.layers.length - index }}>
              {layer.kind === 'image' && layer.src && <img src={assetUrl(layer.src)} alt="" />}
              {layer.kind === 'keys' && layer.bindings.map((binding) => pressedCodes.has(normalizeInputCode(binding.code)) && binding.src ? <img key={binding.id} className="keymap-overlay-key" src={assetUrl(binding.src)} alt="" style={transformStyle(binding.transform)} /> : null)}
            </div>
          ))}
        </div>
        {payload.moveMode && <div className="keymap-overlay-frame"><span>按键映射区域</span></div>}
      </div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('key-mapping-root')!).render(<React.StrictMode><KeyMappingOverlayApp /></React.StrictMode>);
