import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { CSSProperties } from 'react';
import ReactDOM from 'react-dom/client';
import { createRealtimeVisionOverlayBridge } from './desktopBridge';
import type { AppLanguage } from './i18n';
import { formatChallengeTimerSeconds } from './realtimeVision';
import './realtimeVisionOverlay.css';

type RealtimeVisionOverlayPayload = {
  visible: boolean;
  moveMode?: boolean;
  language?: AppLanguage;
  timer: { text: string; confidence: number; stale?: boolean } | null;
  buffs: Array<{
    id: string;
    name: string;
    triggerCode: string;
    triggerMode: 'press' | 'hold-release';
    triggeredAtTimerSeconds: number | null;
    expiresAtTimerSeconds: number | null;
    remainingSeconds: number | null;
    warning: boolean;
    pending?: boolean;
  }>;
};

const EMPTY_PAYLOAD: RealtimeVisionOverlayPayload = {
  visible: false,
  moveMode: false,
  language: 'zh-CN',
  timer: null,
  buffs: []
};

type OverlayBounds = { x: number; y: number; width: number; height: number };
type OverlayDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  origin: OverlayBounds;
  latest: OverlayBounds;
  frame: number | null;
};

const DEFAULT_BOUNDS: OverlayBounds = { x: 40, y: 80, width: 360, height: 76 };

function normalizeBounds(value: Partial<OverlayBounds> | null | undefined, fallback = DEFAULT_BOUNDS): OverlayBounds {
  return {
    x: Number.isFinite(value?.x) ? Number(value!.x) : fallback.x,
    y: Number.isFinite(value?.y) ? Number(value!.y) : fallback.y,
    width: Number.isFinite(value?.width) ? Math.min(1440, Math.max(180, Number(value!.width))) : fallback.width,
    height: Number.isFinite(value?.height) ? Math.min(1000, Math.max(64, Number(value!.height))) : fallback.height
  };
}

function isPayload(value: unknown): value is RealtimeVisionOverlayPayload {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<RealtimeVisionOverlayPayload>;
  return typeof record.visible === 'boolean' && Array.isArray(record.buffs);
}

function RealtimeVisionOverlayApp() {
  const bridge = useMemo(createRealtimeVisionOverlayBridge, []);
  const [payload, setPayload] = useState<RealtimeVisionOverlayPayload>(EMPTY_PAYLOAD);
  const [windowSize, setWindowSize] = useState(() => ({
    width: typeof window === 'undefined' ? DEFAULT_BOUNDS.width : window.innerWidth,
    height: typeof window === 'undefined' ? DEFAULT_BOUNDS.height : window.innerHeight
  }));
  const boundsRef = useRef<OverlayBounds>(DEFAULT_BOUNDS);
  const dragRef = useRef<OverlayDrag | null>(null);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    const applyPayload = (next: unknown) => {
      if (!disposed && isPayload(next)) setPayload(next);
    };
    void (async () => {
      if (!bridge) return;
      stopListening = await bridge.onUpdate(applyPayload);
      applyPayload(await bridge.getState().catch(() => null));
    })();
    return () => {
      disposed = true;
      stopListening?.();
    };
  }, [bridge]);

  useEffect(() => {
    let disposed = false;
    const updateSize = () => {
      if (disposed) return;
      setWindowSize({ width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    const root = document.documentElement;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateSize);
    observer?.observe(root);
    void bridge?.getBounds().then((next) => {
      if (disposed || !next) return;
      boundsRef.current = normalizeBounds(next);
    }).catch(() => undefined);
    return () => {
      disposed = true;
      window.removeEventListener('resize', updateSize);
      observer?.disconnect();
      if (dragRef.current?.frame !== null && dragRef.current?.frame !== undefined) cancelAnimationFrame(dragRef.current.frame);
      dragRef.current = null;
    };
  }, [bridge]);

  if (!payload.visible) return null;
  const moveMode = payload.moveMode === true;
  const scale = Math.min(4, Math.max(0.5, windowSize.width / DEFAULT_BOUNDS.width));
  const overlayStyle = {
    '--realtime-vision-scale': scale,
    width: `${100 / scale}%`,
    minHeight: `${100 / scale}%`
  } as CSSProperties;

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!moveMode || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = boundsRef.current;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.screenX,
      startY: event.screenY,
      origin,
      latest: origin,
      frame: null
    };
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    drag.latest = {
      ...drag.origin,
      x: Math.round(drag.origin.x + event.screenX - drag.startX),
      y: Math.round(drag.origin.y + event.screenY - drag.startY)
    };
    boundsRef.current = drag.latest;
    if (drag.frame !== null) return;
    drag.frame = requestAnimationFrame(() => {
      const current = dragRef.current;
      if (!current) return;
      current.frame = null;
      void bridge?.setPosition(current.latest).catch(() => undefined);
    });
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.frame !== null) cancelAnimationFrame(drag.frame);
    drag.frame = null;
    boundsRef.current = drag.latest;
    void bridge?.setPosition(drag.latest).catch(() => undefined);
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <main className={`realtime-vision-overlay ${payload.buffs.some((buff) => buff.warning) ? 'has-warning' : ''} ${moveMode ? 'move-mode' : ''}`} style={overlayStyle} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
    <div className="realtime-vision-current-time">
      <strong className={payload.timer?.stale ? 'stale' : ''}>{payload.timer?.text ?? '--:--'}</strong>
    </div>
    <div className="realtime-vision-overlay-buffs">
      {payload.buffs.map((buff) => {
        const expiresAt = formatChallengeTimerSeconds(buff.expiresAtTimerSeconds);
        const triggeredAt = formatChallengeTimerSeconds(buff.triggeredAtTimerSeconds);
        return <div key={buff.id} className={buff.warning ? 'warning' : buff.pending ? 'pending' : ''}>
          <strong className="realtime-vision-buff-name">{buff.name}</strong>
          <time><span>{triggeredAt ?? '--:--'}</span><b>→</b><span>{expiresAt ?? '--:--'}</span></time>
        </div>;
      })}
    </div>
  </main>;
}

ReactDOM.createRoot(document.getElementById('realtime-vision-root')!).render(<StrictMode><RealtimeVisionOverlayApp /></StrictMode>);
