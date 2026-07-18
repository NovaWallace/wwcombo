import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import ReactDOM from 'react-dom/client';
import { createRhythmFeedbackBridge } from './desktopBridge';
import './rhythmFeedback.css';

type FeedbackBounds = { x: number; y: number; width: number; height: number };
type FeedbackPayload = {
  visible: boolean;
  moveMode?: boolean;
  label?: string;
  judgement?: string;
  bounds?: Partial<FeedbackBounds>;
};

const MIN_SIZE = { width: 160, height: 64 };
const MAX_SIZE = { width: 520, height: 180 };
const DEFAULT_BOUNDS: FeedbackBounds = { x: 520, y: 320, width: 260, height: 96 };

function isPayload(value: unknown): value is FeedbackPayload {
  return typeof value === 'object' && value !== null && 'visible' in value;
}

function normalizeBounds(value: Partial<FeedbackBounds> | undefined, fallback: FeedbackBounds): FeedbackBounds {
  return {
    x: Math.round(Number.isFinite(value?.x) ? Number(value?.x) : fallback.x),
    y: Math.round(Number.isFinite(value?.y) ? Number(value?.y) : fallback.y),
    width: Math.round(Math.min(MAX_SIZE.width, Math.max(MIN_SIZE.width, Number.isFinite(value?.width) ? Number(value?.width) : fallback.width))),
    height: Math.round(Math.min(MAX_SIZE.height, Math.max(MIN_SIZE.height, Number.isFinite(value?.height) ? Number(value?.height) : fallback.height)))
  };
}

function sameBounds(a: FeedbackBounds, b: FeedbackBounds): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function FeedbackApp() {
  const bridge = useMemo(createRhythmFeedbackBridge, []);
  const [payload, setPayload] = useState<FeedbackPayload>({ visible: false, moveMode: false, bounds: DEFAULT_BOUNDS });
  const boundsRef = useRef<FeedbackBounds>(DEFAULT_BOUNDS);
  const syncTimersRef = useRef<number[]>([]);

  const applyPayload = useCallback((next: unknown) => {
    if (!isPayload(next)) return;
    setPayload((current) => {
      const bounds = normalizeBounds(next.bounds, boundsRef.current || normalizeBounds(current.bounds, DEFAULT_BOUNDS));
      boundsRef.current = bounds;
      return { ...next, bounds };
    });
  }, []);

  const clearSyncTimers = useCallback(() => {
    syncTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    syncTimersRef.current = [];
  }, []);

  const syncLiveBounds = useCallback(async () => {
    const liveBounds = await bridge?.getBounds?.().catch(() => null);
    if (!liveBounds) return;
    const normalized = normalizeBounds(liveBounds, boundsRef.current);
    const previous = boundsRef.current;
    boundsRef.current = normalized;
    setPayload((current) => ({ ...current, bounds: normalized }));
    if (!sameBounds(previous, normalized)) void bridge?.notifyBoundsChanged(normalized);
  }, [bridge]);

  const scheduleLiveSync = useCallback(() => {
    clearSyncTimers();
    [80, 220, 520, 1000, 1800, 3000, 4500].forEach((delay) => {
      const timer = window.setTimeout(() => {
        void syncLiveBounds();
      }, delay);
      syncTimersRef.current.push(timer);
    });
  }, [clearSyncTimers, syncLiveBounds]);

  useEffect(() => bridge?.onUpdate((next) => {
    applyPayload(next);
  }), [bridge, applyPayload]);

  useEffect(() => {
    let disposed = false;
    bridge?.getState?.().then((next) => {
      if (!disposed) applyPayload(next);
    }).catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [bridge, applyPayload]);

  useEffect(() => {
    const sync = () => {
      void syncLiveBounds();
    };
    window.addEventListener('pointerup', sync, true);
    window.addEventListener('mouseup', sync, true);
    window.addEventListener('blur', sync);
    return () => {
      clearSyncTimers();
      window.removeEventListener('pointerup', sync, true);
      window.removeEventListener('mouseup', sync, true);
      window.removeEventListener('blur', sync);
    };
  }, [clearSyncTimers, syncLiveBounds]);

  const shown = Boolean(payload.visible || payload.moveMode);
  const label = payload.visible ? payload.label || '' : '\u53cd\u9988\u533a\u57df';
  const judgement = payload.visible ? payload.judgement || '' : 'placeholder';

  const beginMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!payload.moveMode || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    void bridge?.startDrag?.().catch(() => undefined);
    scheduleLiveSync();
  };

  const beginResize = (edge: string) => (event: ReactPointerEvent<HTMLElement>) => {
    if (!payload.moveMode || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    void bridge?.startResize?.(edge).catch(() => undefined);
    scheduleLiveSync();
  };

  return (
    <div className={`feedback-root ${shown ? 'shown' : 'hidden'} ${payload.moveMode ? 'move-mode' : ''}`}>
      {shown && <div className={`feedback-box judge-${judgement}`} onPointerDown={beginMove} style={{ '--feedback-opacity': payload.visible ? 0.76 : 0.38 } as CSSProperties}>
        <span>{label}</span>
        {payload.moveMode && ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'].map((edge) => <i key={edge} className={`resize-handle ${edge}`} onPointerDown={beginResize(edge)} />)}
      </div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('rhythm-feedback-root')!).render(<React.StrictMode><FeedbackApp /></React.StrictMode>);
