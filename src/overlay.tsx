import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import ReactDOM from 'react-dom/client';
import type { CharacterSlot, ComboChart, ComboImageStyle, PracticeSnapshot, RectPercent } from '../combo-core';
import {
  chartToComboImageItems,
  capsuleEdgeSourceRange,
  comboImageBackgroundSource,
  comboImageContentCenterPercent,
  comboImageDisplayIndexForStep,
  comboImageItemContainsStep,
  comboImageItemSizeForDisplayItem,
  comboImageItemSizeForText,
  comboTextParts,
  createDefaultComboImageStyle,
  defaultComboContentLabelForMoveId,
  effectiveCapsuleImageFields,
  effectiveIconMappings,
  maybeConvertTextToIconLabel,
  normalizeComboImageStyle,
  effectiveComboImageStyle,
  normalizeRectPercent,
  verticalComboTrackClipCompensation,
  visibleComboImageItems
} from './combo-image/comboImage';
import { createOverlayBridge } from './desktopBridge';
import { I18nProvider, isAppLanguage, useI18n } from './i18n';
import type { AppLanguage } from './i18n';
import { localizedMovePrompt } from './moveLabels';
import { noteStepCompleted } from './noteDisplay';
import { currentPeriodLabelAtStep } from './periodLabels';
import { buildRhythmCrowdedGroups, rhythmNoteHeight, rhythmNoteOpacity, rhythmNoteTop, visibleRhythmCrowdedGroups } from './rhythmCrowding';
import { roundedTextOutlineShadow } from './textOutline';
import './overlay.css';

const STORAGE_KEY = 'ww-combo-trainer-state-v2';
const DEFAULT_BOUNDS: OverlayBounds = { x: 160, y: 36, width: 2000, height: 120 };
const DEFAULT_RHYTHM_UI: RhythmUiSettings = { width: 430, height: 700, scale: 1, laneGap: 7, roleSpacing: 120, fallSpeed: 0.18, judgeLineOffset: 200, ringStartScale: 1.78, ringEndScale: 1.25, ringOffsetX: 0, ringOffsetY: -9, ringDurationMs: 420 };

type OverlayBounds = { x: number; y: number; width: number; height: number };
type RhythmUiSettings = { width: number; height: number; scale: number; laneGap: number; roleSpacing: number; fallSpeed: number; judgeLineOffset: number; ringStartScale: number; ringEndScale: number; ringOffsetX: number; ringOffsetY: number; ringDurationMs: number; feedbackX?: number; feedbackY?: number };
type ComboTrackMetric = { extent: number; start: number; center: number };
type OverlayDragState = { startX: number; startY: number; bounds: OverlayBounds; frame: number | null; lastMoveAt: number; moved: boolean };
type OverlayResizeState = OverlayDragState & { edge: string };

const MIN_OVERLAY_WIDTH = 160;
const MIN_OVERLAY_HEIGHT = 64;

function resizeOverlayBounds(base: OverlayBounds, edge: string, dx: number, dy: number): OverlayBounds {
  let x = base.x;
  let y = base.y;
  let width = base.width;
  let height = base.height;
  if (edge.includes('e')) width = base.width + dx;
  if (edge.includes('s')) height = base.height + dy;
  if (edge.includes('w')) { x = base.x + dx; width = base.width - dx; }
  if (edge.includes('n')) { y = base.y + dy; height = base.height - dy; }
  if (width < MIN_OVERLAY_WIDTH) {
    if (edge.includes('w')) x = base.x + base.width - MIN_OVERLAY_WIDTH;
    width = MIN_OVERLAY_WIDTH;
  }
  if (height < MIN_OVERLAY_HEIGHT) {
    if (edge.includes('n')) y = base.y + base.height - MIN_OVERLAY_HEIGHT;
    height = MIN_OVERLAY_HEIGHT;
  }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}
type OverlayStep = ComboChart['steps'][number];

type OverlayPayload = {
  mode?: 'combo' | 'rhythm';
  language?: AppLanguage;
  chart: ComboChart | null;
  practice: PracticeSnapshot & { elapsedMs?: number | null };
  practicePreset?: 'strict' | 'lenient' | 'simple';
  visible: boolean;
  moveMode?: boolean;
  noteMoveMode?: boolean;
  noteBounds?: { x: number; y: number; width: number; height: number };
  settings?: OverlayBounds & { layout?: 'horizontal' | 'vertical' | 'stair' | 'waterfall' };
  comboImageStyle?: Partial<ComboImageStyle>;
  rhythmUiSettings?: Partial<RhythmUiSettings>;
};

function isPayload(value: unknown): value is OverlayPayload {
  return typeof value === 'object' && value !== null && 'practice' in value;
}

function customNoteNumberByStepId(chart: ComboChart | null): Map<string, number> {
  const result = new Map<string, number>();
  if (!chart) return result;
  const steps = chart.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => Boolean(step.note?.trim()))
    .sort((left, right) => left.step.startMin - right.step.startMin || left.index - right.index);
  if (!steps.length) return result;
  const periods = [...(chart.periods ?? [])]
    .filter((period) => period.kind === 'startup_axis' || period.kind === 'loop_axis')
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id));
  const loopPeriods = periods.filter((period) => period.kind === 'loop_axis');
  const counters = new Map<string, number>();
  const axisKeyForStep = (startMs: number): string => {
    const containing = periods
      .filter((period) => startMs >= period.startMs && (period.endMs <= period.startMs || startMs <= period.endMs))
      .sort((left, right) => right.startMs - left.startMs)[0];
    if (containing) return containing.kind === 'loop_axis' ? containing.id : `startup:${containing.id}`;
    const previousLoop = loopPeriods.filter((period) => startMs >= period.startMs).at(-1);
    if (previousLoop) return previousLoop.id;
    return 'startup:default';
  };
  for (const { step } of steps) {
    const key = axisKeyForStep(step.startMin);
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    result.set(step.id, next);
  }
  return result;
}

function isRhythmHoldStep(step: OverlayStep): boolean {
  return step.moveId === 'heavy_attack' || step.moveId.endsWith('_hold');
}

function rhythmActiveCharacterSlot(steps: OverlayStep[], elapsedMs: number): 1 | 2 | 3 | 4 | null {
  if (!steps.length) return null;
  const firstSlot = (steps[0].characterSlot ?? 1) as 1 | 2 | 3 | 4;
  return steps
    .filter((step) => step.startMin <= elapsedMs && /^switch_[1234]$/.test(step.moveId))
    .sort((left, right) => right.startMin - left.startMin || right.id.localeCompare(left.id))
    .map((step) => Number(step.moveId.slice(-1)) as 1 | 2 | 3 | 4)[0] ?? firstSlot;
}

function rhythmDisplayText(step: OverlayStep, style: ComboImageStyle, chart: ComboChart | null): string {
  return chart?.contentLabels?.[step.id]?.trim()
    || style.contentLabels[step.id]?.trim()
    || defaultComboContentLabelForMoveId(step.moveId)
    || displayMoveLabel(step);
}

function switchSlotForMoveId(moveId: string): 1 | 2 | 3 | 4 | null {
  return /^switch_[1234]$/.test(moveId) ? Number(moveId.slice(-1)) as 1 | 2 | 3 | 4 : null;
}

function rhythmSwitchRingSteps(steps: OverlayStep[], elapsedMs: number, durationMs = 420): OverlayStep[] {
  return steps
    .filter((step) => elapsedMs >= step.startMin - durationMs && elapsedMs <= step.startMin + 80 && switchSlotForMoveId(step.moveId) !== null)
    .sort((left, right) => left.startMin - right.startMin || left.id.localeCompare(right.id));
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rhythmMainScale(settings: Pick<RhythmUiSettings, 'scale'> | null | undefined): number {
  return clampValue(settings?.scale ?? DEFAULT_RHYTHM_UI.scale, 0.3, 3);
}

function rhythmRingVisual(step: OverlayStep, elapsedMs: number, settings: RhythmUiSettings): { progress: number; scale: number; opacity: number } {
  const duration = Math.max(1, settings.ringDurationMs);
  const progress = clampValue((elapsedMs - (step.startMin - duration)) / duration, 0, 1);
  const scale = settings.ringStartScale + (settings.ringEndScale - settings.ringStartScale) * progress;
  const opacity = 1;
  return { progress, scale, opacity };
}

function rhythmJudgementLabel(judgement: string | undefined): string {
  if (judgement === 'perfect') return 'PERFECT';
  if (judgement === 'great') return 'GREAT';
  if (judgement === 'good') return 'GOOD';
  if (judgement === 'miss') return 'MISS';
  return '';
}

function rhythmLatestJudgement(practice: PracticeSnapshot | null): { label: string; judgement: string } | null {
  const feedback = practice?.feedback.find((item) => item.stepId && item.level !== 'info');
  if (!feedback?.stepId) return null;
  const judgement = practice?.judgements?.[feedback.stepId];
  const label = rhythmJudgementLabel(judgement);
  if (label) return { label, judgement: judgement ?? '' };
  if (feedback.level === 'error') return { label: 'MISS', judgement: 'miss' };
  return null;
}

function OverlayApp() {
  const { language, text } = useI18n();
  const [payload, setPayload] = useState<OverlayPayload | null>(null);
  const [bounds, setBounds] = useState<OverlayBounds>(DEFAULT_BOUNDS);
  const [measuredBounds, setMeasuredBounds] = useState<OverlayBounds | null>(null);
  const overlay = useMemo(createOverlayBridge, []);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<OverlayDragState | null>(null);
  const resizeRef = useRef<OverlayResizeState | null>(null);
  const latestBoundsRef = useRef<OverlayBounds>(DEFAULT_BOUNDS);
  const isDraggingRef = useRef(false);
  const progressRef = useRef({ runKey: '', activeStepIndex: 0, indicatorStepIndex: 0 });

  const applyPayload = React.useCallback((next: unknown) => {
    if (!isPayload(next)) return;
    setPayload(next);
    // During pointer move/resize dragging, the live bounds are owned by the
    // drag loop. Do not apply an older React payload back to the window while
    // the pointer is moving or the visible crop frame can jump.
    if (next.settings && !next.moveMode && !isDraggingRef.current) {
      const nextBounds = {
        x: next.settings.x ?? DEFAULT_BOUNDS.x,
        y: next.settings.y ?? DEFAULT_BOUNDS.y,
        width: next.settings.width ?? DEFAULT_BOUNDS.width,
        height: next.settings.height ?? DEFAULT_BOUNDS.height
      };
      setBounds(nextBounds);
      latestBoundsRef.current = nextBounds;
    }
  }, []);

  useEffect(() => {
    return overlay?.onUpdate(applyPayload);
  }, [applyPayload, overlay]);

  useEffect(() => overlay?.onPracticeUpdate?.((practice) => {
    if (typeof practice !== 'object' || practice === null) return;
    setPayload((current) => current ? { ...current, practice: practice as OverlayPayload['practice'] } : current);
  }), [overlay]);

  useEffect(() => {
    return overlay?.onBoundsChanged?.((next) => {
      const current = latestBoundsRef.current;
      const normalized = {
        x: Number.isFinite(next.x) ? next.x : current.x,
        y: Number.isFinite(next.y) ? next.y : current.y,
        width: Number.isFinite(next.width) ? Math.max(1, next.width) : current.width,
        height: Number.isFinite(next.height) ? Math.max(1, next.height) : current.height
      };
      latestBoundsRef.current = normalized;
      if (!isDraggingRef.current) setBounds(normalized);
    });
  }, [overlay]);

  useEffect(() => {
    let disposed = false;
    overlay?.getOverlayBounds?.().then((next) => {
      if (disposed || !next) return;
      latestBoundsRef.current = next;
      if (!isDraggingRef.current) setBounds(next);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [overlay]);

  useEffect(() => {
    let disposed = false;
    overlay?.getState?.().then((next) => {
      if (!disposed) applyPayload(next);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [applyPayload, overlay]);

  useEffect(() => {
    const node = surfaceRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      const next = { ...latestBoundsRef.current, width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
      setMeasuredBounds((current) => current && current.width === next.width && current.height === next.height ? current : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [bounds.width, bounds.height]);

  const chart = payload?.chart ?? null;
  const practice = payload?.practice ?? null;
  const displayLanguage = isAppLanguage(payload?.language) ? payload.language : language;
  const moveMode = payload?.moveMode ?? false;
  const layout = payload?.settings?.layout === 'vertical' ? 'vertical' : payload?.settings?.layout === 'stair' ? 'stair' : payload?.settings?.layout === 'waterfall' ? 'waterfall' : 'horizontal';
  const activeIndex = chart?.steps.length ? Math.max(0, Math.min(practice?.currentStepIndex ?? 0, chart.steps.length - 1)) : 0;
  const timedIndex = timedStepIndexForPractice(chart, practice, activeIndex);
  const activeStep = chart && practice ? chart.steps[activeIndex] : null;
  const normalizedComboStyle = normalizeComboImageStyle(mergeOverlayStyleWithStorage(payload?.comboImageStyle));
  const comboOverallScale = payload?.mode === 'rhythm' ? 1 : Math.min(4, Math.max(0.25, normalizedComboStyle.overallScale));
  const comboStyle = payload?.mode === 'rhythm' ? effectiveComboImageStyle(normalizedComboStyle) : normalizedComboStyle;
  const rhythmUiSettings = { ...DEFAULT_RHYTHM_UI, ...payload?.rhythmUiSettings };
  const effectiveBounds = measuredBounds ?? bounds;
  const comboLayoutBounds = {
    ...effectiveBounds,
    width: effectiveBounds.width / comboOverallScale,
    height: effectiveBounds.height / comboOverallScale
  };
  const linearLayout = layout === 'vertical' ? 'vertical' : 'horizontal';
  const horizontalLikeLayout = layout === 'horizontal' || layout === 'stair';
  const allItems = chartToComboImageItems(chart, comboStyle, linearLayout, comboLayoutBounds);
  const metrics = comboTrackMetrics(allItems, linearLayout, comboStyle);
  const rawIndicatorStepIndex = comboStyle.mergeSameRoleSteps ? Math.min(chart?.steps.length ?? 0, activeIndex + 1) : activeIndex + 1;
  const runKey = `${chart?.id ?? 'none'}:${practice?.startedAt ?? 'idle'}:${practice?.status ?? 'idle'}`;
  if (progressRef.current.runKey !== runKey || practice?.status !== 'running') progressRef.current = { runKey, activeStepIndex: activeIndex, indicatorStepIndex: rawIndicatorStepIndex };
  else progressRef.current = { runKey, activeStepIndex: Math.max(progressRef.current.activeStepIndex, activeIndex), indicatorStepIndex: Math.max(progressRef.current.indicatorStepIndex, rawIndicatorStepIndex) };
  const activeStepIndex = Math.max(0, Math.min(progressRef.current.activeStepIndex, Math.max(0, (chart?.steps.length ?? 1) - 1)));
  const indicatorStepIndex = Math.max(0, Math.min(progressRef.current.indicatorStepIndex, Math.max(0, (chart?.steps.length ?? 1) - 1)));
  const timedStepId = timedIndex === null ? undefined : chart?.steps[Math.max(timedIndex, activeStepIndex)]?.id;
  const activeDisplayStepId = chart?.steps[activeStepIndex]?.id;
  const mergedHighlightStepId = payload?.practicePreset === 'lenient' ? activeDisplayStepId : timedStepId;
  const indicatorStepId = chart?.steps[indicatorStepIndex]?.id ?? activeDisplayStepId;
  const displayActiveStep = chart?.steps[activeStepIndex] ?? activeStep;
  const activeDisplayIndex = comboImageDisplayIndexForStep(allItems, activeDisplayStepId);
  const indicatorDisplayIndex = comboImageDisplayIndexForStep(allItems, indicatorStepId);
  const visibleItems = visibleComboImageItems(allItems, activeDisplayIndex, linearLayout, comboLayoutBounds, comboStyle);
  const trackOffset = comboTrackOffset(allItems, activeDisplayIndex, linearLayout, comboLayoutBounds, comboStyle);
  const activeMetric = metrics[Math.max(0, Math.min(activeDisplayIndex, Math.max(0, metrics.length - 1)))];
  const backgroundSource = comboImageBackgroundSource(comboStyle);
  const periodLabel = currentPeriodLabelAtStep(chart, activeStepIndex, displayLanguage);
  const screenWidth = window.screen?.availWidth || window.innerWidth;
  const screenHeight = window.screen?.availHeight || window.innerHeight;
  const windowLeft = window.screenX ?? bounds.x;
  const windowTop = window.screenY ?? bounds.y;
  const overlayCenterX = windowLeft + window.innerWidth / 2;
  const overlayCenterY = windowTop + window.innerHeight / 2;
  const nextIndicatorSide = layout === 'vertical'
    ? (overlayCenterX < screenWidth / 2 ? 'right' : 'left')
    : (overlayCenterY > screenHeight / 2 ? 'above' : 'below');
  const promptSide = horizontalLikeLayout ? nextIndicatorSide : (overlayCenterX < screenWidth / 2 ? 'left' : 'right');
  const promptStep = comboStyle.prePromptEnabled && shouldShowPromptForStep(displayActiveStep) ? displayActiveStep : null;
  const promptText = promptTextForStep(promptStep, displayLanguage, comboStyle, chart);
  const visualGap = comboRenderGap(linearLayout, comboStyle);
  const verticalImageOverlap = comboVerticalImageOverlap(comboStyle);
  const verticalTopClearance = Math.max(22, periodLabel ? 26 : 0);
  const activeVerticalItem = linearLayout === 'vertical' ? allItems[activeDisplayIndex] : undefined;
  const verticalTopCompensation = linearLayout === 'vertical' && comboStyle.scrollAnchor === 'start' && activeVerticalItem && activeMetric
    ? verticalComboTrackClipCompensation(comboStyle, activeVerticalItem, activeMetric.start, trackOffset, verticalTopClearance)
    : 0;
  const renderTrackOffset = trackOffset + verticalTopCompensation;
  const noteNumberByStepId = useMemo(() => {
    const numbered = customNoteNumberByStepId(chart);
    if (!chart || !practice) return numbered;
    const stepById = new Map(chart.steps.map((step) => [step.id, step]));
    return new Map([...numbered].filter(([stepId]) => {
      const step = stepById.get(stepId);
      return Boolean(step && !noteStepCompleted(step, practice, chart));
    }));
  }, [chart, practice]);
  const firstVisibleIndex = linearLayout === 'vertical'
    ? metrics.findIndex((metric) => metric.start + renderTrackOffset >= verticalTopClearance)
    : visibleItems.length ? allItems.indexOf(visibleItems[0]) : -1;
  const safeFirstVisibleIndex = firstVisibleIndex >= 0 ? firstVisibleIndex : 0;
  const firstVisibleItem = allItems[safeFirstVisibleIndex];
  const horizontalPeriodSide = promptSide === 'above' ? 'below' : 'above';
  const verticalPeriodSide = promptSide === 'right' ? 'left' : 'right';

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!moveMode) return;
    const target = event.target as HTMLElement | null;
    // The combo overlay's dashed move frame is itself the drag surface. In
    // move mode, requiring a hit on a rendered chip makes the border and empty
    // parts of the frame exit move mode instead of starting native dragging.
    const hitCombo = payload?.mode === 'rhythm'
      ? Boolean(target?.closest('.rhythm-overlay-note, .rhythm-overlay-judge, .rhythm-overlay-avatars, .rhythm-overlay-lane-prompt, .rhythm-overlay-switch-ring'))
      : true;
    if (!hitCombo) {
      event.preventDefault();
      void overlay?.requestOverlayMoveMode(false);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.screenX, startY: event.screenY, bounds: latestBoundsRef.current, frame: null, lastMoveAt: 0, moved: false };
    isDraggingRef.current = true;
  };

  const beginResize = (edge: string) => (event: ReactPointerEvent<HTMLElement>) => {
    if (!moveMode || payload?.mode !== 'rhythm' || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = { edge, startX: event.screenX, startY: event.screenY, bounds: latestBoundsRef.current, frame: null, lastMoveAt: 0, moved: false };
    isDraggingRef.current = true;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const resize = resizeRef.current;
    const active = drag ?? resize;
    if (!active) return;
    const pointerScale = Math.max(0.1, window.devicePixelRatio || 1);
    const dx = (event.screenX - active.startX) * pointerScale;
    const dy = (event.screenY - active.startY) * pointerScale;
    const next = drag
      ? { ...drag.bounds, x: Math.round(drag.bounds.x + dx), y: Math.round(drag.bounds.y + dy) }
      : resizeOverlayBounds(resize!.bounds, resize!.edge, dx, dy);
    latestBoundsRef.current = next;
    active.moved = active.moved || Math.abs(dx) > 2 || Math.abs(dy) > 2;
    const now = performance.now();
    if (active.frame !== null || now - active.lastMoveAt < 24) return;
    active.frame = requestAnimationFrame(() => {
      const latest = latestBoundsRef.current;
      active.lastMoveAt = performance.now();
      if (drag && overlay?.setOverlayPosition) void overlay.setOverlayPosition({ x: latest.x, y: latest.y });
      else void overlay?.setOverlayBounds(latest);
      active.frame = null;
    });
  };

  const endDrag = () => {
    const drag = dragRef.current;
    const resize = resizeRef.current;
    const active = drag ?? resize;
    if (active?.frame !== null && active?.frame !== undefined) cancelAnimationFrame(active.frame);
    if (active) {
      setBounds(latestBoundsRef.current);
      const finalBounds = latestBoundsRef.current;
      void (async () => {
        if (drag) await overlay?.setOverlayPosition?.({ x: finalBounds.x, y: finalBounds.y });
        else await overlay?.setOverlayBounds(finalBounds);
        await overlay?.notifyOverlayBoundsChanged(finalBounds);
      })();
    }
    dragRef.current = null;
    resizeRef.current = null;
    isDraggingRef.current = false;
  };

  return (
    <div className={`overlay-shell ${layout} next-indicator-${nextIndicatorSide} ${payload?.mode === 'rhythm' ? 'rhythm-mode' : ''} ${moveMode ? 'move-mode' : ''}`} onPointerDown={beginDrag} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <div ref={surfaceRef} className="overlay-drag-surface">
        {payload?.mode === 'rhythm' ? <RhythmOverlay chart={chart} practice={practice} style={comboStyle} bounds={effectiveBounds} settings={rhythmUiSettings} language={displayLanguage} /> : <div className="combo-overall-scale-frame" style={{ width: comboLayoutBounds.width, height: comboLayoutBounds.height, transform: `scale(${comboOverallScale})` }}>
        {backgroundSource && <div className="overlay-background" style={imageCropBackground(backgroundSource, normalizeRectPercent(comboStyle.backgroundCrop, { x: 0, y: 0, w: 100, h: 100 }))} />}
        <div className="combo-row" style={{ gap: visualGap, '--combo-vertical-image-overlap': `${verticalImageOverlap}px`, transform: layout === 'vertical' ? `translateY(${renderTrackOffset}px)` : `translateX(${renderTrackOffset}px)` } as CSSProperties}>
          {visibleItems.length ? visibleItems.map((item) => {
            const roleStyle = comboStyle.roleStyles[item.characterSlot];
            const chipSize = comboImageItemSizeForDisplayItem(comboStyle, item, roleStyle);
            const itemIconMappings = effectiveIconMappings(comboStyle, item.characterSlot);
            const contentParts = comboTextParts(item.displayText, Boolean(item.iconId), itemIconMappings);
            const blockImageStyle = comboStyle.blockMode === 'image' ? capsuleImageStyle(comboStyle, chipSize.width, chipSize.height, roleStyle) : {};
            const blockColor = comboStyle.blockMode === 'capsule' ? roleStyle.color : 'transparent';
            const avatarLeft = comboStyle.avatarOffsetX;
            const frameVisualHeight = comboStyle.blockMode === 'image' ? Math.min(chipSize.height, comboStyle.capsuleHeight) : chipSize.height;
            const isActive = comboImageItemContainsStep(item, activeDisplayStepId);
            const activeMergedStepId = comboStyle.mergeSameRoleSteps && comboImageItemContainsStep(item, mergedHighlightStepId) ? mergedHighlightStepId : undefined;
            const isNext = comboStyle.prePromptEnabled && comboImageItemContainsStep(item, indicatorStepId) && indicatorDisplayIndex !== activeDisplayIndex;
            const itemNoteNumbers = (item.mergedStepIds ?? [item.step.id]).flatMap((stepId) => { const number = noteNumberByStepId.get(stepId); return number === undefined ? [] : [number]; });
            const isDone = Boolean(practice && (practice.completedStepIds.includes(item.step.id) || item.mergedStepIds?.some((stepId) => practice.completedStepIds.includes(stepId))));
            const isError = Boolean(practice && (practice.errorStepIds.includes(item.step.id) || item.mergedStepIds?.some((stepId) => practice.errorStepIds.includes(stepId))));
            const triangleCenter = comboImageContentCenterPercent(item, indicatorStepId);
            return (
              <div
                key={item.step.id}
                className={`combo-chip ${comboStyle.blockMode === 'image' ? 'image-block' : ''} ${isDone ? 'done' : ''} ${isError ? 'error' : ''} ${isActive ? 'active' : ''} ${isNext ? 'next' : ''} ${itemNoteNumbers.length ? 'has-custom-note' : ''} ${item.showAvatar ? 'with-avatar' : ''}`}
                style={{
                  '--move-color': roleStyle.color,
                  '--next-indicator-x': `${triangleCenter ?? 50}%`,
                  width: chipSize.width,
                  height: chipSize.height,
                  color: comboStyle.textColor,
                  fontSize: comboStyle.fontSize,
                  fontFamily: comboStyle.fontFamily,
                  transform: layout === 'stair' ? `translateY(${(item.characterSlot - 2) * comboStyle.stairRoleOffset}px)` : undefined,
                  opacity: isNext ? 1 : comboItemOpacity(metrics[allItems.indexOf(item)], activeMetric, renderTrackOffset, linearLayout, comboLayoutBounds, comboStyle),
                  backgroundColor: blockColor,
                  borderRadius: comboStyle.blockMode === 'capsule' && comboStyle.capsuleShape === 'capsule' ? 999 : 4,
                  ...blockImageStyle,
                  ...activeFrameVars(item.showAvatar, comboStyle.blockMode, avatarLeft, comboStyle.avatarSize, comboStyle.avatarOffsetY, chipSize.height, frameVisualHeight)
                } as CSSProperties}
              >
                {item.showAvatar && <span className="avatar-slot" style={{ width: comboStyle.avatarSize, height: comboStyle.avatarSize, left: avatarLeft, transform: `translateY(calc(-50% + ${comboStyle.avatarOffsetY}px))`, ...imageCropBackground(roleStyle.avatar, normalizeSquareRectPercent(roleStyle.avatarCrop)) }}>{roleStyle.avatar ? null : item.characterSlot}</span>}
                {comboStyle.blockMode === 'image' && <CapsuleBlockBackground />}
                {horizontalLikeLayout && promptText && comboImageItemContainsStep(item, promptStep?.id) && <div className={`overlay-action-prompt horizontal ${promptSide}`} style={{ fontFamily: comboStyle.promptFontFamily }}>{promptText}</div>}
                {layout === 'vertical' && promptText && isActive && <div className={`overlay-action-prompt vertical ${nextIndicatorSide}`} style={{ fontFamily: comboStyle.promptFontFamily }}>
                  {periodLabel ? <ruby className="overlay-action-prompt-ruby"><span>{promptText}</span><rt>{periodLabel}</rt></ruby> : promptText}
                </div>}
                {periodLabel && (horizontalLikeLayout ? isActive : !promptText && item === firstVisibleItem) && <div className={`overlay-period-label inline ${horizontalLikeLayout ? `horizontal ${horizontalPeriodSide}` : `vertical ${verticalPeriodSide}`}`}>{periodLabel}</div>}
                <ComboItemContent item={item} parts={contentParts} mappings={itemIconMappings} convertIcons={comboStyle.convertIcons} className="combo-chip-content" activeMergedStepId={activeMergedStepId} noteNumberByStepId={noteNumberByStepId} textStyle={comboTextStrokeStyle(comboStyle)} />
              </div>
            );
          }) : <div className="placeholder">{text('暂无连段图', 'No Combo Chart') }</div>}
        </div>
        <div className="hint-line">
          <span>{activeStep ? text(`下一步：${promptTextForStep(activeStep, language, comboStyle, chart)}`, `Next: ${promptTextForStep(activeStep, language, comboStyle, chart)}`) : text('等待开始', 'Waiting to start')}</span>
          <strong>{practice?.feedback[0]?.message ?? ''}</strong>
        </div>
        </div>}
      </div>
        {payload?.mode === 'rhythm' && moveMode && ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'].map((edge) => <i key={edge} className={`rhythm-overlay-resize-handle ${edge}`} onPointerDown={beginResize(edge)} />)}
    </div>
  );
}

function RhythmOverlay({ chart, practice, style, bounds, settings, language }: { chart: ComboChart | null; practice: (PracticeSnapshot & { elapsedMs?: number | null }) | null; style: ComboImageStyle; bounds: OverlayBounds; settings: RhythmUiSettings; language: AppLanguage }) {
  const [clockNow, setClockNow] = useState(() => performance.now());
  const localClockRef = useRef({ key: '', receivedAt: performance.now(), elapsedMs: 0 });
  useEffect(() => {
    if (practice?.status !== 'running') return;
    let frame = 0;
    const tick = () => {
      setClockNow(performance.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [practice?.status, practice?.startedAt]);
  const orderedSteps = useMemo(() => [...(chart?.steps ?? [])].sort((left, right) => left.startMin - right.startMin || (left.characterSlot ?? 1) - (right.characterSlot ?? 1) || left.id.localeCompare(right.id)), [chart]);
  const characterSlots = chart?.characterCount === 4 ? [1, 2, 3, 4] as const : [1, 2, 3] as const;
  const payloadElapsedMs = Math.max(0, typeof practice?.elapsedMs === 'number' ? practice.elapsedMs : 0);
  const clockKey = `${practice?.status ?? 'idle'}:${practice?.startedAt ?? 'idle'}:${payloadElapsedMs}`;
  if (localClockRef.current.key !== clockKey) localClockRef.current = { key: clockKey, receivedAt: clockNow, elapsedMs: payloadElapsedMs };
  const elapsedMs = practice?.status === 'running' ? localClockRef.current.elapsedMs + Math.max(0, clockNow - localClockRef.current.receivedAt) : payloadElapsedMs;
  const scale = rhythmMainScale(settings);
  const stageWidth = Math.max(1, bounds.width / scale || settings.width || DEFAULT_RHYTHM_UI.width);
  const stageHeight = Math.max(320, bounds.height / scale || settings.height || DEFAULT_RHYTHM_UI.height);
  const judgeY = Math.min(stageHeight - 90, Math.max(120, stageHeight - (settings.judgeLineOffset || DEFAULT_RHYTHM_UI.judgeLineOffset)));
  const speedPxPerMs = settings.fallSpeed || DEFAULT_RHYTHM_UI.fallSpeed;
  const lookAheadMs = Math.ceil((judgeY + 120) / speedPxPerMs);
  const visibleSteps = orderedSteps.filter((step) => step.startMin + Math.max(120, step.durationMax) >= elapsedMs && step.startMin <= elapsedMs + lookAheadMs);
  const notePartsByStepId = useMemo(() => new Map(orderedSteps.map((step) => {
    const slot = (step.characterSlot ?? 1) as CharacterSlot;
    const contentText = rhythmDisplayText(step, style, chart);
    const iconText = maybeConvertTextToIconLabel(contentText, style.convertIcons);
    const parts = comboTextParts(iconText, style.convertIcons || switchSlotForMoveId(step.moveId) !== null, effectiveIconMappings(style, slot)).filter((part) => part.kind === 'icon');
    return [step.id, parts] as const;
  })), [language, orderedSteps, style]);
  const crowdedGroups = useMemo(() => buildRhythmCrowdedGroups(orderedSteps.flatMap((step) => {
    const parts = notePartsByStepId.get(step.id) ?? [];
    return parts.length ? [{ step, height: rhythmNoteHeight(parts.length) }] : [];
  }), speedPxPerMs), [notePartsByStepId, orderedSteps, speedPxPerMs]);
  const visibleCrowdedGroups = visibleRhythmCrowdedGroups(crowdedGroups, elapsedMs, judgeY, stageHeight, speedPxPerMs);
  const activeCharacterSlot = rhythmActiveCharacterSlot(orderedSteps, elapsedMs);
  const switchRingSteps = rhythmSwitchRingSteps(orderedSteps, elapsedMs, settings.ringDurationMs);
  const matchedStepIds = new Set(practice?.matchedStepIds ?? []);
  const errorStepIds = new Set(practice?.errorStepIds ?? []);
  const judgements = practice?.judgements ?? {};
  const displayWidth = Math.round(stageWidth * scale);
  const displayHeight = Math.round(stageHeight * scale);
  return (
    <div className="rhythm-overlay-scale-frame" style={{ width: displayWidth, height: displayHeight } as CSSProperties}>
    <div className="rhythm-overlay-shell" style={{ width: stageWidth, height: stageHeight, transform: `scale(${scale})`, '--rhythm-judge-y': `${judgeY}px`, '--rhythm-lane-gap': `${settings.laneGap}px`, '--rhythm-role-spacing': `${settings.roleSpacing}px` } as CSSProperties}>
      <div className="rhythm-overlay-lanes">
        {characterSlots.map((slot) => {
          const role = style.roleStyles[slot as 1 | 2 | 3];
          return (
            <div key={slot} className="rhythm-overlay-lane">
              {activeCharacterSlot === slot && <div className="rhythm-overlay-active-role-gradient" />}
              {visibleSteps.filter((step) => (step.characterSlot ?? 1) === slot).map((step) => {
                const parts = notePartsByStepId.get(step.id) ?? [];
                const height = rhythmNoteHeight(parts.length);
                const active = elapsedMs >= step.startMin && elapsedMs <= step.startMin + step.durationMax;
                const matched = matchedStepIds.has(step.id);
                const error = errorStepIds.has(step.id);
                const judgement = judgements[step.id];
                const top = rhythmNoteTop(step, height, elapsedMs, judgeY, speedPxPerMs);
                return (
                  <div key={step.id} className={`rhythm-overlay-note ${isRhythmHoldStep(step) ? 'hold' : 'normal'} ${parts.length > 1 ? 'stacked' : ''} ${active ? 'active' : ''} ${matched ? 'matched' : ''} ${error ? 'error' : ''} ${judgement ? `judge-${judgement}` : ''}`} style={{ top, height, opacity: rhythmNoteOpacity(step, elapsedMs) } as CSSProperties}>
                    <ComboInlineContent parts={parts} className="rhythm-overlay-note-content" hideIconAlt />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="rhythm-overlay-judge" />
      <div className="rhythm-overlay-avatars">
        {characterSlots.map((slot) => {
          const role = style.roleStyles[slot as 1 | 2 | 3];
          const lanePromptStep = orderedSteps.find((step) => (step.characterSlot ?? 1) === slot && elapsedMs <= step.startMin + step.durationMax) ?? null;
          const crowdedPrompts = visibleCrowdedGroups
            .filter((group) => group.characterSlot === slot)
            .map((group) => ({
              group,
              parts: [...group.entries].reverse().flatMap((entry) => notePartsByStepId.get(entry.step.id) ?? [])
            }))
            .filter((prompt) => prompt.parts.length > 1);

          return <div key={slot} className={`rhythm-overlay-avatar-cell ${activeCharacterSlot === slot ? 'active' : ''}`}><span className="rhythm-overlay-lane-prompt">{promptTextForStep(lanePromptStep, language, style, chart)}</span>{crowdedPrompts.length > 0 && <span className="rhythm-overlay-crowded-prompts">{crowdedPrompts.map(({ group, parts }) => <span key={group.id} className="rhythm-overlay-crowded-prompt" style={{ '--rhythm-crowded-color': role.color } as CSSProperties}><ComboInlineContent parts={parts} className="rhythm-overlay-crowded-prompt-content" hideIconAlt /></span>)}</span>}{switchRingSteps.filter((step) => switchSlotForMoveId(step.moveId) === slot).map((step) => {
            const visual = rhythmRingVisual(step, elapsedMs, settings);
            return <span key={step.id} className="rhythm-overlay-switch-ring" style={{ '--switch-ring-scale': visual.scale, '--switch-ring-opacity': visual.opacity, '--switch-ring-x': `${settings.ringOffsetX}px`, '--switch-ring-y': `${settings.ringOffsetY}px` } as CSSProperties} aria-hidden="true" />;
          })}<span className="rhythm-overlay-avatar" style={imageCropBackground(role.avatar, normalizeSquareRectPercent(role.avatarCrop))}>{role.avatar ? null : slot}</span></div>;
        })}
        </div>
      </div>
    </div>
  );
}

function CapsuleBlockBackground() {
  return <div className="capsule-bg" aria-hidden="true"><div className="capsule-bg-edge left top" /><div className="capsule-bg-edge left bottom" /><div className="capsule-bg-edge middle top" /><div className="capsule-bg-edge middle bottom" /><div className="capsule-bg-edge right top" /><div className="capsule-bg-edge right bottom" /><div className="capsule-bg-body"><div className="capsule-bg-piece left" /><div className="capsule-bg-piece middle" /><div className="capsule-bg-piece right" /></div></div>;
}

function ComboInlineContent({ parts, className, hideIconAlt = false, textStyle, inline = false }: { parts: ReturnType<typeof comboTextParts>; className: string; hideIconAlt?: boolean; textStyle?: CSSProperties; inline?: boolean }) {
  const content = parts.map((part, index) => part.kind === 'icon' ? <span key={`${part.iconId}-${index}`} className="combo-inline-icon-mark" style={{ '--icon-scale': part.iconScale, '--icon-width-scale': part.iconWidthScale } as CSSProperties}><img className="combo-inline-icon" src={part.src} alt={hideIconAlt ? '' : part.label} title={part.label} /></span> : <span key={`text-${index}`}>{part.value}</span>);
  return inline ? <span className={className} style={textStyle}>{content}</span> : <strong className={className} style={textStyle}>{content}</strong>;
}

function ComboNoteMarker({ number }: { number: number }) {
  return <span className="combo-note-marker" aria-label={`Note ${number}`}><span className="combo-note-marker-number">{number}</span></span>;
}

function comboMergedCountTextStyle(): CSSProperties {
  return { fontFamily: '"优设标题黑", Inter, system-ui, sans-serif', color: '#fff' };
}

function ComboMergedMoveContent({ groups, mappings, convertIcons, className, textStyle, activeStepId, noteNumberByStepId }: { groups: NonNullable<ReturnType<typeof chartToComboImageItems>[number]['mergedMoveGroups']>; mappings: ComboImageStyle['iconMappings']; convertIcons: boolean; className: string; textStyle?: CSSProperties; activeStepId?: string; noteNumberByStepId?: Map<string, number> }) {
  return <strong className={className} style={textStyle}>{groups.map((group) => {
    const activeIndex = activeStepId ? group.stepIds.indexOf(activeStepId) : -1;
    const noteStepIndexes = group.stepIds.flatMap((stepId, index) => noteNumberByStepId?.has(stepId) ? [index] : []);
    const noteNumbers = group.stepIds.flatMap((stepId, index) => { const number = noteNumberByStepId?.get(stepId); return number === undefined || (activeIndex > index) ? [] : [number]; });
    const hasPendingNote = noteStepIndexes.some((index) => activeIndex <= index);
    return <span key={group.stepIds[0]} className={`combo-merged-move ${noteStepIndexes.length ? 'has-special-note' : ''} ${noteStepIndexes.length && activeIndex >= 0 ? 'note-started' : ''}`}>
      {group.renderAsIcon && group.iconSrc ? <span className="combo-merged-move-body">
        <span className={`combo-inline-icon-mark ${activeIndex >= 0 ? 'active' : ''}`} style={{ '--icon-scale': group.iconScale ?? 1, '--icon-width-scale': group.iconWidthScale ?? 1 } as CSSProperties}><img className="combo-inline-icon" src={group.iconSrc} alt={group.iconLabel ?? ''} title={group.iconLabel ?? ''} /></span>
        {group.count > 1 && <span className="combo-merged-move-count" style={comboMergedCountTextStyle()}>{`x${group.count}`}</span>}
      </span> : <ComboInlineContent parts={comboTextParts(group.displayText, convertIcons, mappings)} className={`combo-merged-move-fallback ${activeIndex >= 0 ? 'active' : ''}`} inline />}
      {noteNumbers.map((number) => <ComboNoteMarker key={number} number={number} />)}
      {group.renderAsIcon && group.count > 1 && <span className="combo-merged-move-progress" aria-hidden="true">{Array.from({ length: group.count }, (_, index) => <span key={index} className={`combo-merged-move-marker dot ${activeIndex >= index ? 'active' : ''} ${hasPendingNote && noteStepIndexes.includes(index) ? 'special-note' : ''}`} />)}</span>}
    </span>;
  })}</strong>;
}

function ComboItemContent({ item, parts, mappings, convertIcons, className, activeMergedStepId, noteNumberByStepId, textStyle }: { item: ReturnType<typeof chartToComboImageItems>[number]; parts: ReturnType<typeof comboTextParts>; mappings: ComboImageStyle['iconMappings']; convertIcons: boolean; className: string; activeMergedStepId?: string; noteNumberByStepId?: Map<string, number>; textStyle?: CSSProperties }) {
  if (item.mergedMoveGroups?.length) return <ComboMergedMoveContent groups={item.mergedMoveGroups} mappings={mappings} convertIcons={convertIcons} className={className} textStyle={textStyle} activeStepId={activeMergedStepId} noteNumberByStepId={noteNumberByStepId} />;
  if (item.mergedParts?.length && activeMergedStepId) {
    return <strong className={className} style={textStyle}>{item.mergedParts.map((part) => {
      const active = part.stepId === activeMergedStepId;
      const noteNumber = noteNumberByStepId?.get(part.stepId);
      return <span key={part.stepId} className={active ? 'combo-merged-part active' : 'combo-merged-part'}>{noteNumber !== undefined && <ComboNoteMarker number={noteNumber} />}{comboTextParts(part.displayText, convertIcons, mappings).map((piece, index) => piece.kind === 'icon' ? <span key={`${piece.iconId}-${index}`} className={active ? 'combo-inline-icon-mark active' : 'combo-inline-icon-mark'} style={{ '--icon-scale': piece.iconScale, '--icon-width-scale': piece.iconWidthScale } as CSSProperties}><img className="combo-inline-icon" src={piece.src} alt={piece.label} title={piece.label} /></span> : <span key={`text-${index}`}>{piece.value}</span>)}</span>;
    })}</strong>;
  }
  const fallbackNoteNumbers = (item.mergedStepIds ?? [item.step.id]).flatMap((stepId) => { const number = noteNumberByStepId?.get(stepId); return number === undefined ? [] : [number]; });
  return <>{fallbackNoteNumbers.map((number) => <ComboNoteMarker key={number} number={number} />)}<ComboInlineContent parts={parts} className={className} textStyle={textStyle} /></>;
}

function comboTextStrokeStyle(style: ComboImageStyle): CSSProperties | undefined {
  if (!style.textStrokeEnabled || style.textStrokeWidth <= 0) return undefined;
  const width = Math.max(1, style.textStrokeWidth);
  const color = style.textStrokeColor;
  return {
    textShadow: roundedTextOutlineShadow(true, width, color)
  };
}

function activeFrameVars(showAvatar: boolean, blockMode: ComboImageStyle['blockMode'], avatarLeft: number, avatarSize: number, avatarOffsetY: number, blockHeight: number, visualHeight = blockHeight): CSSProperties {
  if (blockMode !== 'image') return {};
  const bleed = 3;
  const frameHeight = Math.min(blockHeight, Math.max(1, visualHeight));
  const centeredInset = Math.max(-bleed, (blockHeight - frameHeight) / 2 - bleed);
  const avatarTop = blockHeight / 2 + avatarOffsetY - avatarSize / 2;
  const avatarBottom = blockHeight / 2 + avatarOffsetY + avatarSize / 2;
  return {
    '--combo-avatar-content-inset': `${showAvatar ? Math.max(0, avatarLeft + avatarSize + 4) : 44}px`,
    '--active-frame-left': `${showAvatar ? Math.min(-bleed, avatarLeft - bleed) : -bleed}px`,
    '--active-frame-right': `${-bleed}px`,
    '--active-frame-top': `${showAvatar ? Math.min(centeredInset, avatarTop - bleed) : centeredInset}px`,
    '--active-frame-bottom': `${showAvatar ? Math.min(centeredInset, blockHeight - avatarBottom - bleed) : centeredInset}px`
  } as CSSProperties;
}

function displayMoveLabel(step: OverlayStep): string {
  if (step.moveId === 'switch_1') return '1';
  if (step.moveId === 'switch_2') return '2';
  if (step.moveId === 'switch_3') return '3';
  if (step.moveId === 'switch_4') return '4';
  return step.label.replace(/^切人(?=\d)/, '');
}

function shouldShowPromptForStep(step: OverlayStep | null | undefined): step is OverlayStep {
  return Boolean(step && !step.free && (step.moveId === 'empty_action' || step.moveId === 'basic_attack' || (!step.independent && step.advancesStep !== false)));
}

function promptTextForStep(step: OverlayStep | null | undefined, language: AppLanguage, style: ComboImageStyle, chart: ComboChart | null = null): string {
  if (!step) return '';
  if (!style.showNotesSeparately && step.note?.trim()) return step.note.trim();
  const contentText = chart?.contentLabels?.[step.id]?.trim()
    || style.contentLabels[step.id]?.trim()
    || defaultComboContentLabelForMoveId(step.moveId);
  return localizedMovePrompt(step.moveId, displayMoveLabel(step), contentText, language, step.customLabel === true);
}

function comboVisualGap(layout: 'horizontal' | 'vertical', style: ComboImageStyle): number {
  if (layout !== 'vertical') return style.capsuleGap;
  if (style.blockMode === 'image') return Math.round(style.capsuleGap) - comboVerticalImageOverlap(style);
  return Math.max(0, Math.round(style.capsuleGap * 0.08));
}

function comboRenderGap(layout: 'horizontal' | 'vertical', style: ComboImageStyle): number {
  return Math.max(0, comboVisualGap(layout, style));
}

function comboVerticalImageOverlap(style: ComboImageStyle): number {
  return style.blockMode === 'image' ? Math.max(0, Math.round(style.capsuleHeight * 0.42)) : 0;
}

function comboTrackMetrics(items: ReturnType<typeof chartToComboImageItems>, layout: 'horizontal' | 'vertical', style: ComboImageStyle): ComboTrackMetric[] {
  let cursor = 0;
  // Vertical image blocks also have a negative top margin for the image
  // overlap. Include that margin in the measured track gap, otherwise the
  // real block position drifts upward a little more on every item.
  const renderedGap = comboRenderGap(layout, style);
  const gap = renderedGap - (layout === 'vertical' && style.blockMode === 'image' ? comboVerticalImageOverlap(style) : 0);
  return items.map((item, index) => {
    if (index > 0) cursor += gap;
    const roleStyle = style.roleStyles[item.characterSlot];
    const size = comboImageItemSizeForDisplayItem(style, item, roleStyle);
    const extent = layout === 'vertical' ? size.height : size.width;
    const metric = { extent, start: cursor, center: cursor + extent / 2 };
    cursor += extent;
    return metric;
  });
}

function comboTrackOffset(items: ReturnType<typeof chartToComboImageItems>, activeIndex: number, layout: 'horizontal' | 'vertical', bounds: OverlayBounds, style: ComboImageStyle): number {
  if (!items.length) return 0;
  const current = Math.max(0, Math.min(activeIndex, items.length - 1));
  const metrics = comboTrackMetrics(items, layout, style);
  const activeMetric = metrics[current];
  if (!activeMetric) return 0;
  const viewport = Math.max(1, layout === 'vertical' ? bounds.height : bounds.width);
  if (style.scrollAnchor === 'center') return Math.round(viewport / 2 - activeMetric.center);
  return Math.round(style.scrollStartOffsetPx - activeMetric.start);
}

function timedStepIndexForPractice(chart: ComboChart | null, practice: (PracticeSnapshot & { elapsedMs?: number | null }) | null, floorIndex = 0): number | null {
  if (!chart?.steps.length) return 0;
  if (practice?.status === 'running' && practice.startedAt !== null) {
    const elapsed = Math.max(0, typeof practice.elapsedMs === 'number' ? practice.elapsedMs : performance.now() - practice.startedAt);
    const startedTimedStep = chart.steps
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => elapsed >= step.startMin)
      .sort((left, right) => right.step.startMin - left.step.startMin || right.index - left.index)[0];
    if (startedTimedStep) return Math.max(floorIndex, startedTimedStep.index);
  }
  return null;
}

function comboItemOpacity(metric: ComboTrackMetric | undefined, activeMetric: ComboTrackMetric | undefined, trackOffset: number, layout: 'horizontal' | 'vertical', bounds: OverlayBounds, style: ComboImageStyle): number {
  if (!style.fadeEnabled || !metric || !activeMetric) return 1;
  const viewport = Math.max(1, layout === 'vertical' ? bounds.height : bounds.width);
  const position = metric.center + trackOffset;
  const activePosition = activeMetric.center + trackOffset;
  const distance = Math.abs(position - activePosition);
  const maxDistance = Math.max(1, viewport / 2);
  const ratio = Math.max(0, Math.min(1, distance / maxDistance));
  const strength = Math.max(0, Math.min(1, style.fadeRange / 100));
  return Number((1 - ratio * strength).toFixed(3));
}

function mergeOverlayStyleWithStorage(incoming: Partial<ComboImageStyle> | undefined): Partial<ComboImageStyle> {
  const fallback = createDefaultComboImageStyle();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) as { comboImageStyle?: Partial<ComboImageStyle> } : null;
    const savedStyle = saved?.comboImageStyle ?? {};
    return {
      ...fallback,
      ...savedStyle,
      ...incoming,
      roleStyles: {
        1: { ...fallback.roleStyles[1], ...savedStyle.roleStyles?.[1], ...incoming?.roleStyles?.[1] },
        2: { ...fallback.roleStyles[2], ...savedStyle.roleStyles?.[2], ...incoming?.roleStyles?.[2] },
        3: { ...fallback.roleStyles[3], ...savedStyle.roleStyles?.[3], ...incoming?.roleStyles?.[3] },
        4: { ...fallback.roleStyles[4], ...savedStyle.roleStyles?.[4], ...incoming?.roleStyles?.[4] }
      }
    };
  } catch {
    return incoming ?? fallback;
  }
}

function imageCropBackground(src: string | undefined, crop: RectPercent): CSSProperties {
  if (!src) return {};
  const safe = normalizeRectPercent(crop, { x: 0, y: 0, w: 100, h: 100 });
  return {
    backgroundImage: `url(${src})`,
    backgroundSize: `${10000 / safe.w}% ${10000 / safe.h}%`,
    backgroundPosition: `${safe.x <= 0 ? 0 : (safe.x / Math.max(1, 100 - safe.w)) * 100}% ${safe.y <= 0 ? 0 : (safe.y / Math.max(1, 100 - safe.h)) * 100}%`,
    backgroundRepeat: 'no-repeat'
  };
}

function capsuleImageStyle(style: ComboImageStyle, width: number, height: number, roleStyle?: ComboImageStyle['roleStyles'][1 | 2 | 3]): CSSProperties {
  const capsule = effectiveCapsuleImageFields(style, roleStyle);
  if (!capsule.image) return {};
  return {
    backgroundImage: 'none',
    borderColor: 'transparent',
    ...capsuleBackgroundVars(style, width, height, roleStyle)
  } as CSSProperties;
}

function cssImageUrl(src: string): string {
  return `url("${src.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
}

function cssPx(value: number): string {
  return `${Number(value.toFixed(3))}px`;
}

function capsuleBackgroundVars(style: ComboImageStyle, targetWidthInput: number, targetHeightInput: number, roleStyle?: ComboImageStyle['roleStyles'][1 | 2 | 3]): CSSProperties {
  const capsule = effectiveCapsuleImageFields(style, roleStyle);
  const source = capsule.image ?? '';
  const naturalWidth = Math.max(1, capsule.width ?? style.capsuleWidth ?? 200);
  const naturalHeight = Math.max(1, capsule.height ?? style.capsuleHeight ?? 80);
  const crop = normalizeRectPercent(capsule.crop, { x: 0, y: 0, w: 100, h: 100 });
  const cropX = Math.round((crop.x / 100) * naturalWidth);
  const cropY = Math.round((crop.y / 100) * naturalHeight);
  const cropWidth = Math.max(1, Math.round((crop.w / 100) * naturalWidth));
  const cropHeight = Math.max(1, Math.round((crop.h / 100) * naturalHeight));
  const stretch = capsule.stretch ?? { left: 25, right: 75 };
  const leftLine = Math.round(clampNumber(((stretch.left ?? 25) / 100) * naturalWidth - cropX, 1, cropWidth - 2));
  const rightLine = Math.round(clampNumber(((stretch.right ?? 75) / 100) * naturalWidth - cropX, leftLine + 1, cropWidth - 1));
  const targetWidth = Math.max(1, Math.round(targetWidthInput));
  const targetHeight = Math.max(1, Math.round(targetHeightInput));
  const heightScale = targetHeight / cropHeight;
  const rawDestLeft = Math.max(0, leftLine * heightScale);
  const rawDestRight = Math.max(0, (cropWidth - rightLine) * heightScale);
  const minMiddle = Math.min(targetWidth, Math.max(24, targetHeight * 0.42));
  const availableForEdges = Math.max(0, targetWidth - minMiddle);
  const edgeScale = rawDestLeft + rawDestRight > availableForEdges ? availableForEdges / (rawDestLeft + rawDestRight) : 1;
  const destLeft = Math.min(targetWidth, Math.max(0, Math.round(rawDestLeft * edgeScale)));
  const destRight = Math.max(0, Math.min(targetWidth - destLeft, Math.round(rawDestRight * edgeScale)));
  const destMiddle = Math.max(0, targetWidth - destLeft - destRight);
  const stretchWidth = Math.max(1, rightLine - leftLine);
  const leftScaleX = destLeft / Math.max(1, leftLine);
  const middleScaleX = destMiddle / stretchWidth;
  const rightSourceWidth = Math.max(1, cropWidth - rightLine);
  const rightScaleX = destRight / rightSourceWidth;
  const edgeSource = capsuleEdgeSourceRange(naturalHeight, cropY, cropHeight, capsule.edge);
  const edgeTopHeight = Math.max(0, (cropY - edgeSource.y) * heightScale);
  const edgeBottomHeight = Math.max(0, (edgeSource.y + edgeSource.height - cropY - cropHeight) * heightScale);
  return {
    '--capsule-bg-source': cssImageUrl(source),
    '--capsule-bg-left-width': cssPx(destLeft),
    '--capsule-bg-middle-left': cssPx(destLeft),
    '--capsule-bg-middle-width': cssPx(destMiddle),
    '--capsule-bg-right-left': cssPx(destLeft + destMiddle),
    '--capsule-bg-right-width': cssPx(destRight),
    '--capsule-bg-left-size': `${cssPx(naturalWidth * leftScaleX)} ${cssPx(naturalHeight * heightScale)}`,
    '--capsule-bg-left-position': `${cssPx(-cropX * leftScaleX)} ${cssPx(-cropY * heightScale)}`,
    '--capsule-bg-middle-size': `${cssPx(naturalWidth * middleScaleX)} ${cssPx(naturalHeight * heightScale)}`,
    '--capsule-bg-middle-position': `${cssPx(-(cropX + leftLine) * middleScaleX)} ${cssPx(-cropY * heightScale)}`,
    '--capsule-bg-right-size': `${cssPx(naturalWidth * rightScaleX)} ${cssPx(naturalHeight * heightScale)}`,
    '--capsule-bg-right-position': `${cssPx(-(cropX + rightLine) * rightScaleX)} ${cssPx(-cropY * heightScale)}`,
    '--capsule-bg-edge-top-top': cssPx(-edgeTopHeight),
    '--capsule-bg-edge-top-height': cssPx(edgeTopHeight),
    '--capsule-bg-edge-bottom-top': cssPx(targetHeight),
    '--capsule-bg-edge-bottom-height': cssPx(edgeBottomHeight),
    '--capsule-bg-edge-left-position-x': cssPx(-cropX * leftScaleX),
    '--capsule-bg-edge-middle-position-x': cssPx(-(cropX + leftLine) * middleScaleX),
    '--capsule-bg-edge-right-position-x': cssPx(-(cropX + rightLine) * rightScaleX),
    '--capsule-bg-edge-top-position-y': cssPx(-edgeSource.y * heightScale),
    '--capsule-bg-edge-bottom-position-y': cssPx(-(cropY + cropHeight) * heightScale)
  } as CSSProperties;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeSquareRectPercent(value: Partial<RectPercent> | undefined): RectPercent {
  const rect = normalizeRectPercent(value);
  const size = Math.min(rect.w, rect.h, 100);
  return normalizeRectPercent({ x: rect.x, y: rect.y, w: size, h: size });
}

ReactDOM.createRoot(document.getElementById('overlay-root')!).render(<I18nProvider><OverlayApp /></I18nProvider>);
