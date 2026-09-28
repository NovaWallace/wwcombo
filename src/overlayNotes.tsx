import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import ReactDOM from 'react-dom/client';
import type { ComboChart, PracticeSnapshot } from '../combo-core';
import type { ComboImageStyle } from '../combo-core';
import { normalizeComboImageStyle } from './combo-image/comboImage';
import { createOverlayNotesBridge } from './desktopBridge';
import { noteNumberByStepId, noteStepCompleted } from './noteDisplay';
import { DecoratedNoteRow } from './noteRowDecoration';
import { roundedTextOutlineShadow } from './textOutline';
import './overlayNotes.css';

type NotesBounds = { x: number; y: number; width: number; height: number };
type NotesPayload = {
  chart: ComboChart | null;
  practice: PracticeSnapshot & { elapsedMs?: number | null };
  visible: boolean;
  noteMoveMode?: boolean;
  showNotesSeparately?: boolean;
  comboImageStyle?: Partial<ComboImageStyle>;
  visibleNoteStepIds?: string[];
};
type DragState = {
  kind: 'move' | 'resize';
  edge: string;
  pointerId: number;
  startX: number;
  startY: number;
  bounds: NotesBounds;
};

const DEFAULT_BOUNDS: NotesBounds = { x: 210, y: 140, width: 840, height: 300 };
const MIN_WIDTH = 120;
const MIN_HEIGHT = 48;

function isPayload(value: unknown): value is NotesPayload {
  return typeof value === 'object' && value !== null && 'practice' in value;
}

function normalizeBounds(value: Partial<NotesBounds> | undefined, fallback: NotesBounds): NotesBounds {
  return {
    x: Math.round(Number.isFinite(value?.x) ? Number(value?.x) : fallback.x),
    y: Math.round(Number.isFinite(value?.y) ? Number(value?.y) : fallback.y),
    width: Math.round(Math.max(MIN_WIDTH, Number.isFinite(value?.width) ? Number(value?.width) : fallback.width)),
    height: Math.round(Math.max(MIN_HEIGHT, Number.isFinite(value?.height) ? Number(value?.height) : fallback.height))
  };
}

function resizeBounds(base: NotesBounds, edge: string, dx: number, dy: number): NotesBounds {
  let { x, y, width, height } = base;
  if (edge.includes('e')) width = base.width + dx;
  if (edge.includes('s')) height = base.height + dy;
  if (edge.includes('w')) {
    x = base.x + dx;
    width = base.width - dx;
  }
  if (edge.includes('n')) {
    y = base.y + dy;
    height = base.height - dy;
  }
  if (width < MIN_WIDTH) {
    if (edge.includes('w')) x = base.x + base.width - MIN_WIDTH;
    width = MIN_WIDTH;
  }
  if (height < MIN_HEIGHT) {
    if (edge.includes('n')) y = base.y + base.height - MIN_HEIGHT;
    height = MIN_HEIGHT;
  }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

function pointerPosition(event: PointerEvent | ReactPointerEvent<HTMLElement>): { x: number; y: number } {
  const x = Number.isFinite(event.screenX) ? event.screenX : event.clientX;
  const y = Number.isFinite(event.screenY) ? event.screenY : event.clientY;
  return { x, y };
}

function NotesApp() {
  const bridge = useMemo(createOverlayNotesBridge, []);
  const [payload, setPayload] = useState<NotesPayload>({
    chart: null,
    practice: { status: 'idle', startedAt: null, elapsedMs: 0, currentStepIndex: 0, feedback: [], matchedStepIds: [], completedStepIds: [], errorStepIds: [] },
    visible: false,
    noteMoveMode: false
  });
  const [bounds, setBounds] = useState<NotesBounds>(DEFAULT_BOUNDS);
  const boundsRef = useRef(bounds);
  const latestBoundsRef = useRef(bounds);
  const dragRef = useRef<DragState | null>(null);
  const pendingBoundsRef = useRef<NotesBounds | null>(null);
  const frameRef = useRef<number | null>(null);
  const sendingBoundsRef = useRef(false);
  const notifyAfterFlushRef = useRef(false);

  const applyPayload = useCallback((value: unknown) => {
    if (!isPayload(value)) return;
    setPayload(value);
  }, []);

  const flushBounds = useCallback(async () => {
    frameRef.current = null;
    if (sendingBoundsRef.current) return;
    const next = pendingBoundsRef.current;
    if (!next) return;
    pendingBoundsRef.current = null;
    sendingBoundsRef.current = true;
    try {
      await bridge?.setBounds?.(next);
    } finally {
      sendingBoundsRef.current = false;
      if (pendingBoundsRef.current) {
        frameRef.current = window.requestAnimationFrame(() => { void flushBounds(); });
      } else if (notifyAfterFlushRef.current) {
        notifyAfterFlushRef.current = false;
        void bridge?.notifyBoundsChanged?.(next);
      }
    }
  }, [bridge]);

  const scheduleBoundsFlush = useCallback(() => {
    if (frameRef.current === null && !sendingBoundsRef.current) {
      frameRef.current = window.requestAnimationFrame(() => { void flushBounds(); });
    }
  }, [flushBounds]);

  const applyBounds = useCallback((next: NotesBounds) => {
    const normalized = normalizeBounds(next, latestBoundsRef.current);
    latestBoundsRef.current = normalized;
    pendingBoundsRef.current = normalized;
    scheduleBoundsFlush();
  }, [scheduleBoundsFlush]);

  const finishDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    const finalBounds = latestBoundsRef.current;
    boundsRef.current = finalBounds;
    setBounds(finalBounds);
    dragRef.current = null;
    pendingBoundsRef.current = finalBounds;
    notifyAfterFlushRef.current = true;
    scheduleBoundsFlush();
  }, [scheduleBoundsFlush]);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  useEffect(() => bridge?.onUpdate?.(applyPayload), [applyPayload, bridge]);

  useEffect(() => bridge?.onPracticeUpdate?.((practice) => {
    if (typeof practice !== 'object' || practice === null) return;
    setPayload((current) => ({ ...current, practice: practice as NotesPayload['practice'] }));
  }), [bridge]);

  useEffect(() => {
    let disposed = false;
    bridge?.getState?.().then((value) => {
      if (!disposed) applyPayload(value);
    }).catch(() => undefined);
    bridge?.getBounds?.().then((value) => {
      if (disposed || !value) return;
      const next = normalizeBounds(value, DEFAULT_BOUNDS);
      boundsRef.current = next;
      latestBoundsRef.current = next;
      setBounds(next);
    }).catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [applyPayload, bridge]);

  useEffect(() => bridge?.onBoundsChanged?.((value) => {
    if (dragRef.current) return;
    const next = normalizeBounds(value, boundsRef.current);
    boundsRef.current = next;
    latestBoundsRef.current = next;
    setBounds(next);
  }), [bridge]);

  const noteStyle = useMemo(() => normalizeComboImageStyle(payload.comboImageStyle), [payload.comboImageStyle]);
  const visibleNotes = useMemo(() => {
    const visibleIds = payload.visibleNoteStepIds;
    const notes = (payload.chart?.steps ?? [])
      .filter((step) => Boolean(step.note?.trim())
        && (payload.noteMoveMode === true || !Array.isArray(visibleIds) || visibleIds.includes(step.id))
        && !noteStepCompleted(step, payload.practice, payload.chart))
      .sort((left, right) => left.startMin - right.startMin || left.id.localeCompare(right.id));
    return noteStyle.noteOrder === 'oldest-top' ? notes : notes.reverse();
  }, [payload.chart, payload.practice, payload.noteMoveMode, payload.visibleNoteStepIds, noteStyle.noteOrder]);
  const noteNumbers = useMemo(() => noteNumberByStepId(payload.chart), [payload.chart]);

  const separateNotesEnabled = payload.showNotesSeparately !== false;
  const moveMode = separateNotesEnabled && payload.noteMoveMode === true;
  const shown = separateNotesEnabled && (payload.visible || moveMode);
  const scale = Math.max(0.1, window.devicePixelRatio || 1);

  const beginDrag = (event: ReactPointerEvent<HTMLElement>, kind: DragState['kind'], edge = '') => {
    if (!moveMode || event.button !== 0 || dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointerPosition(event);
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind,
      edge,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      bounds: latestBoundsRef.current
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = pointerPosition(event);
    const dx = (point.x - drag.startX) * scale;
    const dy = (point.y - drag.startY) * scale;
    const next = drag.kind === 'move'
      ? { ...drag.bounds, x: Math.round(drag.bounds.x + dx), y: Math.round(drag.bounds.y + dy) }
      : resizeBounds(drag.bounds, drag.edge, dx, dy);
    applyBounds(next);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    finishDrag();
  };

  const noteStrokeEnabled = noteStyle.noteTextStrokeEnabled !== false;
  const noteStroke = noteStyle.noteTextStrokeColor ?? '#050505';
  const noteStrokeWidth = Math.max(0, Number(noteStyle.noteTextStrokeWidth ?? 3));
  return <div className={`overlay-notes-root ${shown ? 'shown' : 'hidden'} ${moveMode ? 'move-mode' : ''}`} style={{
    '--overlay-note-font-family': noteStyle.noteFontFamily ?? 'Microsoft YaHei, Inter, system-ui, sans-serif',
    '--overlay-note-color': noteStyle.noteTextColor ?? '#ffffff',
    '--overlay-note-scale': noteStyle.noteScale ?? 1,
    '--overlay-note-order': noteStyle.noteOrder === 'oldest-top' ? 'flex-start' : 'flex-end'
  } as React.CSSProperties}>
    {shown && <div
      className="overlay-notes-editor"
      onPointerDown={(event) => beginDrag(event, 'move')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={finishDrag}
    >
      {moveMode && <div className="overlay-notes-frame" aria-label="Move and resize note area">
        {['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'].map((edge) => <button
          key={edge}
          type="button"
          aria-label={`Resize ${edge}`}
          className={`overlay-notes-resize-handle ${edge}`}
          onPointerDown={(event) => beginDrag(event, 'resize', edge)}
        />)}
      </div>}
      <div className="overlay-notes-content" style={{ textShadow: roundedTextOutlineShadow(noteStrokeEnabled, noteStrokeWidth, noteStroke, ['0 2px 5px rgba(0,0,0,.95)', '0 0 2px rgba(0,0,0,.9)']) }}>
        {visibleNotes.map((step) => <DecoratedNoteRow className="overlay-notes-row" key={step.id} step={step} style={noteStyle} number={noteNumbers.get(step.id)} />)}
      </div>
    </div>}
  </div>;
}

ReactDOM.createRoot(document.getElementById('overlay-notes-root')!).render(<NotesApp />);
