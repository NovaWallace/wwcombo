import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import ReactDOM from 'react-dom/client';
import type { ComboChart, ComboImageStyle, PracticeSnapshot, RectPercent } from '../combo-core';
import {
  chartToComboImageItems,
  comboImageBackgroundSource,
  comboImageContentCenterPercent,
  comboImageDisplayIndexForStep,
  comboImageItemContainsStep,
  comboImageItemSizeForDisplayItem,
  comboImageItemSizeForText,
  comboTextParts,
  createDefaultComboImageStyle,
  effectiveCapsuleImageFields,
  effectiveIconMappings,
  maybeConvertTextToIconLabel,
  normalizeComboImageStyle,
  normalizeRectPercent,
  visibleComboImageItems
} from './combo-image/comboImage';
import { createOverlayBridge } from './desktopBridge';
import './overlay.css';

const STORAGE_KEY = 'ww-combo-trainer-state-v2';
const DEFAULT_BOUNDS: OverlayBounds = { x: 160, y: 36, width: 2000, height: 120 };
const DEFAULT_RHYTHM_UI: RhythmUiSettings = { width: 430, height: 700, scale: 1, laneGap: 7, fallSpeed: 0.18, judgeLineOffset: 200, ringStartScale: 1.78, ringEndScale: 1.25, ringOffsetX: 0, ringOffsetY: -9, ringDurationMs: 420 };

type OverlayBounds = { x: number; y: number; width: number; height: number };
type RhythmUiSettings = { width: number; height: number; scale: number; laneGap: number; fallSpeed: number; judgeLineOffset: number; ringStartScale: number; ringEndScale: number; ringOffsetX: number; ringOffsetY: number; ringDurationMs: number };
type ComboTrackMetric = { extent: number; start: number; center: number };
type OverlayDragState = { startX: number; startY: number; bounds: OverlayBounds; frame: number | null; lastMoveAt: number; moved: boolean };
type OverlayStep = ComboChart['steps'][number];

type OverlayPayload = {
  mode?: 'combo' | 'rhythm';
  chart: ComboChart | null;
  practice: PracticeSnapshot & { elapsedMs?: number | null };
  practicePreset?: 'strict' | 'lenient' | 'simple';
  visible: boolean;
  moveMode?: boolean;
  settings?: OverlayBounds & { layout?: 'horizontal' | 'vertical' };
  comboImageStyle?: Partial<ComboImageStyle>;
  rhythmUiSettings?: Partial<RhythmUiSettings>;
};

function isPayload(value: unknown): value is OverlayPayload {
  return typeof value === 'object' && value !== null && 'practice' in value;
}

function isRhythmHoldStep(step: OverlayStep): boolean {
  return step.moveId === 'heavy_attack' || step.moveId.endsWith('_hold');
}

function rhythmActiveCharacterSlot(steps: OverlayStep[], elapsedMs: number): 1 | 2 | 3 | null {
  if (!steps.length) return null;
  const firstSlot = (steps[0].characterSlot ?? 1) as 1 | 2 | 3;
  return steps
    .filter((step) => step.startMin <= elapsedMs && (step.moveId === 'switch_1' || step.moveId === 'switch_2' || step.moveId === 'switch_3'))
    .sort((left, right) => right.startMin - left.startMin || right.id.localeCompare(left.id))
    .map((step) => (step.moveId === 'switch_1' ? 1 : step.moveId === 'switch_2' ? 2 : 3) as 1 | 2 | 3)[0] ?? firstSlot;
}

function switchSlotForMoveId(moveId: string): 1 | 2 | 3 | null {
  return moveId === 'switch_1' ? 1 : moveId === 'switch_2' ? 2 : moveId === 'switch_3' ? 3 : null;
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
  const [payload, setPayload] = useState<OverlayPayload | null>(null);
  const [bounds, setBounds] = useState<OverlayBounds>(DEFAULT_BOUNDS);
  const [measuredBounds, setMeasuredBounds] = useState<OverlayBounds | null>(null);
  const overlay = useMemo(createOverlayBridge, []);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<OverlayDragState | null>(null);
  const latestBoundsRef = useRef<OverlayBounds>(DEFAULT_BOUNDS);
  const isDraggingRef = useRef(false);
  const progressRef = useRef({ runKey: '', activeStepIndex: 0, indicatorStepIndex: 0 });

  useEffect(() => {
    return overlay?.onUpdate((next) => {
      if (!isPayload(next)) return;
      setPayload(next);
      if (next.settings && !isDraggingRef.current) {
        const nextBounds = {
          x: next.settings.x ?? DEFAULT_BOUNDS.x,
          y: next.settings.y ?? DEFAULT_BOUNDS.y,
          width: next.settings.width ?? DEFAULT_BOUNDS.width,
          height: next.settings.height ?? DEFAULT_BOUNDS.height
        };
        setBounds(nextBounds);
        latestBoundsRef.current = nextBounds;
      }
    });
  }, [overlay]);

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
  const moveMode = payload?.moveMode ?? false;
  const layout = payload?.settings?.layout === 'vertical' ? 'vertical' : 'horizontal';
  const activeIndex = chart?.steps.length ? Math.max(0, Math.min(practice?.currentStepIndex ?? 0, chart.steps.length - 1)) : 0;
  const timedIndex = timedStepIndexForPractice(chart, practice, activeIndex);
  const activeStep = chart && practice ? chart.steps[activeIndex] : null;
  const comboStyle = normalizeComboImageStyle(mergeOverlayStyleWithStorage(payload?.comboImageStyle));
  const rhythmUiSettings = { ...DEFAULT_RHYTHM_UI, ...payload?.rhythmUiSettings };
  const effectiveBounds = measuredBounds ?? bounds;
  const allItems = chartToComboImageItems(chart, comboStyle);
  const metrics = comboTrackMetrics(allItems, layout, comboStyle);
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
  const visibleItems = visibleComboImageItems(allItems, activeDisplayIndex, layout, effectiveBounds, comboStyle);
  const trackOffset = comboTrackOffset(allItems, activeDisplayIndex, layout, effectiveBounds, comboStyle);
  const activeMetric = metrics[Math.max(0, Math.min(activeDisplayIndex, Math.max(0, metrics.length - 1)))];
  const backgroundSource = comboImageBackgroundSource(comboStyle);
  const periodLabel = currentPeriodLabel(chart, activeStepIndex);
  const screenWidth = window.screen?.availWidth || window.innerWidth;
  const screenHeight = window.screen?.availHeight || window.innerHeight;
  const windowLeft = window.screenX ?? bounds.x;
  const windowTop = window.screenY ?? bounds.y;
  const overlayCenterX = windowLeft + window.innerWidth / 2;
  const overlayCenterY = windowTop + window.innerHeight / 2;
  const nextIndicatorSide = layout === 'vertical'
    ? (overlayCenterX < screenWidth / 2 ? 'right' : 'left')
    : (overlayCenterY > screenHeight / 2 ? 'above' : 'below');
  const promptSide = layout === 'horizontal' ? nextIndicatorSide : (overlayCenterX < screenWidth / 2 ? 'left' : 'right');
  const promptStep = comboStyle.prePromptEnabled && shouldShowPromptForStep(displayActiveStep) ? displayActiveStep : null;
  const promptText = promptTextForStep(promptStep);
  const visualGap = comboRenderGap(layout, comboStyle);
  const verticalImageOverlap = comboVerticalImageOverlap(comboStyle);

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!moveMode) return;
    const target = event.target as HTMLElement | null;
    const hitCombo = payload?.mode === 'rhythm' ? Boolean(target?.closest('.rhythm-overlay-note, .rhythm-overlay-judge, .rhythm-overlay-avatars, .rhythm-overlay-lane-prompt, .rhythm-overlay-switch-ring')) : Boolean(target?.closest('.combo-row, .combo-chip, .overlay-background, .overlay-period-label, .overlay-action-prompt'));
    if (!hitCombo) {
      event.preventDefault();
      void overlay?.requestOverlayMoveMode(false);
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.screenX, startY: event.screenY, bounds: latestBoundsRef.current, frame: null, lastMoveAt: 0, moved: false };
    isDraggingRef.current = true;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = {
      ...drag.bounds,
      x: Math.max(0, Math.round(drag.bounds.x + event.screenX - drag.startX)),
      y: Math.max(0, Math.round(drag.bounds.y + event.screenY - drag.startY))
    };
    latestBoundsRef.current = next;
    drag.moved = drag.moved || Math.abs(event.screenX - drag.startX) > 2 || Math.abs(event.screenY - drag.startY) > 2;
    const now = performance.now();
    if (drag.frame !== null || now - drag.lastMoveAt < 24) return;
    drag.frame = requestAnimationFrame(() => {
      const latest = latestBoundsRef.current;
      drag.lastMoveAt = performance.now();
      if (overlay?.setOverlayPosition) void overlay.setOverlayPosition({ x: latest.x, y: latest.y });
      else void overlay?.setOverlayBounds(latest);
      drag.frame = null;
    });
  };

  const endDrag = () => {
    const drag = dragRef.current;
    if (drag?.frame !== null && drag?.frame !== undefined) cancelAnimationFrame(drag.frame);
    if (drag) {
      setBounds(latestBoundsRef.current);
      const finalBounds = latestBoundsRef.current;
      void (async () => {
        await overlay?.setOverlayBounds(finalBounds);
        await overlay?.notifyOverlayBoundsChanged(finalBounds);
      })();
    }
    dragRef.current = null;
    isDraggingRef.current = false;
  };

  return (
    <div className={`overlay-shell ${layout} next-indicator-${nextIndicatorSide} ${payload?.mode === 'rhythm' ? 'rhythm-mode' : ''} ${moveMode ? 'move-mode' : ''}`} onPointerMove={onPointerMove} onPointerUp={endDrag}>
      <div ref={surfaceRef} className="overlay-drag-surface" onPointerDown={beginDrag}>
        {payload?.mode === 'rhythm' ? <RhythmOverlay chart={chart} practice={practice} style={comboStyle} bounds={effectiveBounds} settings={rhythmUiSettings} /> : <>
        {backgroundSource && <div className="overlay-background" style={imageCropBackground(backgroundSource, normalizeRectPercent(comboStyle.backgroundCrop, { x: 0, y: 0, w: 100, h: 100 }))} />}
        {periodLabel && <div className="overlay-period-label">{periodLabel}</div>}
        <div className="combo-row" style={{ gap: visualGap, '--combo-vertical-image-overlap': `${verticalImageOverlap}px`, transform: layout === 'vertical' ? `translateY(${trackOffset}px)` : `translateX(${trackOffset}px)` } as CSSProperties}>
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
            const isDone = Boolean(practice && (practice.completedStepIds.includes(item.step.id) || item.mergedStepIds?.some((stepId) => practice.completedStepIds.includes(stepId))));
            const isError = Boolean(practice && (practice.errorStepIds.includes(item.step.id) || item.mergedStepIds?.some((stepId) => practice.errorStepIds.includes(stepId))));
            const triangleCenter = comboImageContentCenterPercent(item, indicatorStepId);
            return (
              <div
                key={item.step.id}
                className={`combo-chip ${comboStyle.blockMode === 'image' ? 'image-block' : ''} ${isDone ? 'done' : ''} ${isError ? 'error' : ''} ${isActive ? 'active' : ''} ${isNext ? 'next' : ''} ${item.showAvatar ? 'with-avatar' : ''}`}
                style={{
                  '--move-color': roleStyle.color,
                  '--next-indicator-x': `${triangleCenter ?? 50}%`,
                  width: chipSize.width,
                  height: chipSize.height,
                  color: comboStyle.textColor,
                  fontSize: comboStyle.fontSize,
                  fontFamily: comboStyle.fontFamily,
                  opacity: isNext ? 1 : comboItemOpacity(metrics[allItems.indexOf(item)], activeMetric, trackOffset, layout, effectiveBounds, comboStyle),
                  backgroundColor: blockColor,
                  borderRadius: comboStyle.blockMode === 'capsule' && comboStyle.capsuleShape === 'capsule' ? 999 : 4,
                  ...blockImageStyle,
                  ...activeFrameVars(item.showAvatar, comboStyle.blockMode, avatarLeft, comboStyle.avatarSize, comboStyle.avatarOffsetY, chipSize.height, frameVisualHeight)
                } as CSSProperties}
              >
                {item.showAvatar && <span className="avatar-slot" style={{ width: comboStyle.avatarSize, height: comboStyle.avatarSize, left: avatarLeft, transform: `translateY(calc(-50% + ${comboStyle.avatarOffsetY}px))`, ...imageCropBackground(roleStyle.avatar, normalizeSquareRectPercent(roleStyle.avatarCrop)) }}>{roleStyle.avatar ? null : item.characterSlot}</span>}
                {comboStyle.blockMode === 'image' && <CapsuleBlockBackground />}
                {layout === 'horizontal' && promptText && comboImageItemContainsStep(item, promptStep?.id) && <div className={`overlay-action-prompt horizontal ${promptSide}`}>{promptText}</div>}
                {layout === 'vertical' && promptText && isActive && <div className={`overlay-action-prompt vertical ${nextIndicatorSide}`}>{promptText}</div>}
                <ComboItemContent item={item} parts={contentParts} className="combo-chip-content" mappings={itemIconMappings} activeMergedStepId={activeMergedStepId} />
              </div>
            );
          }) : <div className="placeholder">暂无连段图</div>}
        </div>
        <div className="hint-line">
          <span>{activeStep ? `下一步：${promptTextForStep(activeStep)}` : '等待开始'}</span>
          <strong>{practice?.feedback[0]?.message ?? ''}</strong>
        </div>
        </>}
      </div>
    </div>
  );
}

function RhythmOverlay({ chart, practice, style, bounds, settings }: { chart: ComboChart | null; practice: (PracticeSnapshot & { elapsedMs?: number | null }) | null; style: ComboImageStyle; bounds: OverlayBounds; settings: RhythmUiSettings }) {
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
  const payloadElapsedMs = Math.max(0, typeof practice?.elapsedMs === 'number' ? practice.elapsedMs : 0);
  const clockKey = `${practice?.status ?? 'idle'}:${practice?.startedAt ?? 'idle'}:${payloadElapsedMs}`;
  if (localClockRef.current.key !== clockKey) localClockRef.current = { key: clockKey, receivedAt: clockNow, elapsedMs: payloadElapsedMs };
  const elapsedMs = practice?.status === 'running' ? localClockRef.current.elapsedMs + Math.max(0, clockNow - localClockRef.current.receivedAt) : payloadElapsedMs;
  const scale = rhythmMainScale(settings);
  const stageWidth = Math.max(1, settings.width || bounds.width / scale || DEFAULT_RHYTHM_UI.width);
  const stageHeight = Math.max(320, settings.height || bounds.height / scale || DEFAULT_RHYTHM_UI.height);
  const judgeY = Math.min(stageHeight - 90, Math.max(120, stageHeight - (settings.judgeLineOffset || DEFAULT_RHYTHM_UI.judgeLineOffset)));
  const speedPxPerMs = settings.fallSpeed || DEFAULT_RHYTHM_UI.fallSpeed;
  const lookAheadMs = Math.ceil((judgeY + 120) / speedPxPerMs);
  const visibleSteps = orderedSteps.filter((step) => step.startMin + Math.max(120, step.durationMax) >= elapsedMs && step.startMin <= elapsedMs + lookAheadMs);
  const activeCharacterSlot = rhythmActiveCharacterSlot(orderedSteps, elapsedMs);
  const switchRingSteps = rhythmSwitchRingSteps(orderedSteps, elapsedMs, settings.ringDurationMs);
  const matchedStepIds = new Set(practice?.matchedStepIds ?? []);
  const errorStepIds = new Set(practice?.errorStepIds ?? []);
  const judgements = practice?.judgements ?? {};
  const displayWidth = Math.round(stageWidth * scale);
  const displayHeight = Math.round(stageHeight * scale);
  return (
    <div className="rhythm-overlay-scale-frame" style={{ width: displayWidth, height: displayHeight } as CSSProperties}>
    <div className="rhythm-overlay-shell" style={{ width: stageWidth, height: stageHeight, transform: `scale(${scale})`, '--rhythm-judge-y': `${judgeY}px`, '--rhythm-lane-gap': `${settings.laneGap}px` } as CSSProperties}>
      <div className="rhythm-overlay-lanes">
        {[1, 2, 3].map((slot) => {
          const role = style.roleStyles[slot as 1 | 2 | 3];
          return (
            <div key={slot} className="rhythm-overlay-lane">
              {activeCharacterSlot === slot && <div className="rhythm-overlay-active-role-gradient" />}
              {visibleSteps.filter((step) => (step.characterSlot ?? 1) === slot).map((step) => {
                const fallingTop = judgeY - (step.startMin - elapsedMs) * speedPxPerMs;
                const contentText = style.contentLabels[step.id]?.trim() || displayMoveLabel(step);
                const iconText = maybeConvertTextToIconLabel(contentText, style.convertIcons);
                const parts = comboTextParts(iconText, style.convertIcons, effectiveIconMappings(style, slot as 1 | 2 | 3));
                const height = Math.max(34, parts.length > 1 ? parts.length * 36 + 6 : 34);
                const active = elapsedMs >= step.startMin && elapsedMs <= step.startMin + step.durationMax;
                const matched = matchedStepIds.has(step.id);
                const error = errorStepIds.has(step.id);
                const judgement = judgements[step.id];
                const fallingNoteTop = fallingTop - height;
                const stoppedTop = judgeY + 4;
                const top = active ? Math.min(fallingNoteTop, stoppedTop) : fallingNoteTop;
                return (
                  <div key={step.id} className={`rhythm-overlay-note ${isRhythmHoldStep(step) ? 'hold' : 'normal'} ${parts.length > 1 ? 'stacked' : ''} ${active ? 'active' : ''} ${matched ? 'matched' : ''} ${error ? 'error' : ''} ${judgement ? `judge-${judgement}` : ''}`} style={{ top, height } as CSSProperties}>
                    <ComboInlineContent parts={parts} className="rhythm-overlay-note-content" />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="rhythm-overlay-judge" />
      <div className="rhythm-overlay-avatars">
        {[1, 2, 3].map((slot) => {
          const role = style.roleStyles[slot as 1 | 2 | 3];
          const lanePromptStep = orderedSteps.find((step) => (step.characterSlot ?? 1) === slot && elapsedMs <= step.startMin + step.durationMax) ?? null;
          return <div key={slot} className="rhythm-overlay-avatar-cell"><span className="rhythm-overlay-lane-prompt">{promptTextForStep(lanePromptStep)}</span>{switchRingSteps.filter((step) => switchSlotForMoveId(step.moveId) === slot).map((step) => {
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
  return <div className="capsule-bg" aria-hidden="true"><div className="capsule-bg-piece left" /><div className="capsule-bg-piece middle" /><div className="capsule-bg-piece right" /></div>;
}

function ComboInlineContent({ parts, className }: { parts: ReturnType<typeof comboTextParts>; className: string }) {
  return <strong className={className}>{parts.map((part, index) => part.kind === 'icon' ? <span key={`${part.iconId}-${index}`} className="combo-inline-icon-mark" style={{ '--icon-scale': part.iconScale } as CSSProperties}><img className="combo-inline-icon" src={part.src} alt={part.label} title={part.label} /></span> : <span key={`text-${index}`}>{part.value}</span>)}</strong>;
}

function ComboItemContent({ item, parts, className, mappings, activeMergedStepId }: { item: ReturnType<typeof chartToComboImageItems>[number]; parts: ReturnType<typeof comboTextParts>; className: string; mappings: ComboImageStyle['iconMappings']; activeMergedStepId?: string }) {
  if (item.mergedParts?.length && activeMergedStepId) {
    return <strong className={className}>{item.mergedParts.map((part) => {
      const active = part.stepId === activeMergedStepId;
      return <span key={part.stepId} className={active ? 'combo-merged-part active' : 'combo-merged-part'}>{comboTextParts(part.displayText, Boolean(part.iconId), mappings).map((piece, index) => piece.kind === 'icon' ? <span key={`${piece.iconId}-${index}`} className={active ? 'combo-inline-icon-mark active' : 'combo-inline-icon-mark'} style={{ '--icon-scale': piece.iconScale } as CSSProperties}><img className="combo-inline-icon" src={piece.src} alt={piece.label} title={piece.label} /></span> : <span key={`text-${index}`}>{piece.value}</span>)}</span>;
    })}</strong>;
  }
  return <ComboInlineContent parts={parts} className={className} />;
}

function activeFrameVars(showAvatar: boolean, blockMode: ComboImageStyle['blockMode'], avatarLeft: number, avatarSize: number, avatarOffsetY: number, blockHeight: number, visualHeight = blockHeight): CSSProperties {
  if (blockMode !== 'image') return {};
  const bleed = 3;
  const frameHeight = Math.min(blockHeight, Math.max(1, visualHeight));
  const centeredInset = Math.max(-bleed, (blockHeight - frameHeight) / 2 - bleed);
  const avatarTop = blockHeight / 2 + avatarOffsetY - avatarSize / 2;
  const avatarBottom = blockHeight / 2 + avatarOffsetY + avatarSize / 2;
  return {
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
  return step.label.replace(/^切人(?=\d)/, '');
}

function shouldShowPromptForStep(step: OverlayStep | null | undefined): step is OverlayStep {
  return Boolean(step && !step.free && (step.moveId === 'basic_attack' || (!step.independent && step.advancesStep !== false)));
}

function promptTextForStep(step: OverlayStep | null | undefined): string {
  if (!step) return '';
  if (step.note?.trim()) return step.note.trim();
  return displayMoveLabel(step);
}

function currentPeriodLabel(chart: ComboChart | null, stepIndex: number): string {
  if (!chart?.periods?.length) return '';
  const step = chart.steps[Math.max(0, Math.min(stepIndex, Math.max(0, chart.steps.length - 1)))];
  const time = step?.startMin ?? 0;
  const period = chart.periods
    .filter((candidate) => candidate.kind !== 'free_fire' && Number.isFinite(candidate.startMs) && Number.isFinite(candidate.endMs) && time >= candidate.startMs && time <= candidate.endMs)
    .sort((left, right) => left.startMs - right.startMs)[0];
  return period ? `当前：${period.label}` : '';
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
  const gap = comboVisualGap(layout, style);
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
        3: { ...fallback.roleStyles[3], ...savedStyle.roleStyles?.[3], ...incoming?.roleStyles?.[3] }
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
  const destLeft = Math.max(0, Math.round(leftLine * heightScale));
  const destRight = Math.max(0, Math.round((cropWidth - rightLine) * heightScale));
  const destMiddle = Math.max(0, targetWidth - destLeft - destRight);
  const stretchWidth = Math.max(1, rightLine - leftLine);
  const leftScale = heightScale;
  const middleScaleX = destMiddle / stretchWidth;
  const rightScale = heightScale;
  return {
    '--capsule-bg-source': cssImageUrl(source),
    '--capsule-bg-left-width': cssPx(destLeft),
    '--capsule-bg-middle-left': cssPx(destLeft),
    '--capsule-bg-middle-width': cssPx(destMiddle),
    '--capsule-bg-right-left': cssPx(destLeft + destMiddle),
    '--capsule-bg-right-width': cssPx(destRight),
    '--capsule-bg-left-size': `${cssPx(naturalWidth * leftScale)} ${cssPx(naturalHeight * leftScale)}`,
    '--capsule-bg-left-position': `${cssPx(-cropX * leftScale)} ${cssPx(-cropY * leftScale)}`,
    '--capsule-bg-middle-size': `${cssPx(naturalWidth * middleScaleX)} ${cssPx(naturalHeight * heightScale)}`,
    '--capsule-bg-middle-position': `${cssPx(-(cropX + leftLine) * middleScaleX)} ${cssPx(-cropY * heightScale)}`,
    '--capsule-bg-right-size': `${cssPx(naturalWidth * rightScale)} ${cssPx(naturalHeight * rightScale)}`,
    '--capsule-bg-right-position': `${cssPx(-(cropX + rightLine) * rightScale)} ${cssPx(-cropY * rightScale)}`
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

ReactDOM.createRoot(document.getElementById('overlay-root')!).render(<OverlayApp />);
