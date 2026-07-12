import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import ReactDOM from 'react-dom/client';
import type { ComboChart, ComboImageStyle, PracticeSnapshot, RectPercent } from '../combo-core';
import {
  chartToComboImageItems,
  comboImageBackgroundSource,
  comboImageItemSizeForText,
  comboTextParts,
  createDefaultComboImageStyle,
  iconSourceForId,
  normalizeComboImageStyle,
  normalizeRectPercent,
  visibleComboImageItems
} from './combo-image/comboImage';
import { createOverlayBridge } from './desktopBridge';
import './overlay.css';

const STORAGE_KEY = 'ww-combo-trainer-state-v2';
const DEFAULT_BOUNDS: OverlayBounds = { x: 160, y: 36, width: 2000, height: 120 };

type OverlayBounds = { x: number; y: number; width: number; height: number };
type ComboTrackMetric = { extent: number; start: number; center: number };

type OverlayPayload = {
  chart: ComboChart | null;
  practice: PracticeSnapshot;
  visible: boolean;
  moveMode?: boolean;
  settings?: OverlayBounds & { layout?: 'horizontal' | 'vertical' };
  comboImageStyle?: Partial<ComboImageStyle>;
};

function isPayload(value: unknown): value is OverlayPayload {
  return typeof value === 'object' && value !== null && 'practice' in value;
}

function OverlayApp() {
  const [payload, setPayload] = useState<OverlayPayload | null>(null);
  const [bounds, setBounds] = useState<OverlayBounds>(DEFAULT_BOUNDS);
  const [measuredBounds, setMeasuredBounds] = useState<OverlayBounds | null>(null);
  const overlay = useMemo(createOverlayBridge, []);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; bounds: OverlayBounds; frame: number | null } | null>(null);
  const latestBoundsRef = useRef<OverlayBounds>(DEFAULT_BOUNDS);
  const isDraggingRef = useRef(false);

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
  const activeIndex = practice?.currentStepIndex ?? 0;
  const activeStep = chart && practice ? chart.steps[activeIndex] : null;
  const nextStep = chart && practice ? chart.steps[activeIndex + 1] : null;
  const comboStyle = normalizeComboImageStyle(mergeOverlayStyleWithStorage(payload?.comboImageStyle));
  const promptStep = comboStyle.prePromptEnabled && activeStep && !activeStep.free && !activeStep.independent && activeStep.advancesStep !== false ? activeStep : null;
  const effectiveBounds = measuredBounds ?? bounds;
  const allItems = chartToComboImageItems(chart, comboStyle);
  const visibleItems = visibleComboImageItems(allItems, activeIndex, layout, effectiveBounds, comboStyle);
  const trackOffset = comboTrackOffset(allItems, activeIndex, layout, effectiveBounds, comboStyle);
  const metrics = comboTrackMetrics(allItems, layout, comboStyle);
  const activeMetric = metrics[Math.max(0, Math.min(activeIndex, Math.max(0, metrics.length - 1)))];
  const backgroundSource = comboImageBackgroundSource(comboStyle);
  const periodLabel = currentPeriodLabel(chart, activeIndex);
  const screenWidth = window.screen?.availWidth || window.innerWidth;
  const screenHeight = window.screen?.availHeight || window.innerHeight;
  const nextIndicatorSide = layout === 'vertical'
    ? (bounds.x + effectiveBounds.width / 2 < screenWidth / 2 ? 'right' : 'left')
    : (bounds.y + effectiveBounds.height / 2 > screenHeight / 2 ? 'above' : 'below');
  const promptSide = layout === 'horizontal' ? nextIndicatorSide : (bounds.x + effectiveBounds.width / 2 < screenWidth / 2 ? 'left' : 'right');
  const promptText = promptStep?.label ?? '';

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!moveMode) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.screenX, startY: event.screenY, bounds: latestBoundsRef.current, frame: null };
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
    setBounds(next);
    if (drag.frame !== null) cancelAnimationFrame(drag.frame);
    drag.frame = requestAnimationFrame(() => {
      void overlay?.setOverlayBounds(latestBoundsRef.current);
      drag.frame = null;
    });
  };

  const endDrag = () => {
    const drag = dragRef.current;
    if (drag?.frame !== null && drag?.frame !== undefined) cancelAnimationFrame(drag.frame);
    if (drag) {
      void overlay?.setOverlayBounds(latestBoundsRef.current);
      void overlay?.notifyOverlayBoundsChanged(latestBoundsRef.current);
    }
    dragRef.current = null;
    isDraggingRef.current = false;
  };

  return (
    <div className={`overlay-shell ${layout} next-indicator-${nextIndicatorSide} ${moveMode ? 'move-mode' : ''}`} onPointerMove={onPointerMove} onPointerUp={endDrag}>
      <div ref={surfaceRef} className="overlay-drag-surface" onPointerDown={beginDrag}>
        {backgroundSource && <div className="overlay-background" style={imageCropBackground(backgroundSource, normalizeRectPercent(comboStyle.backgroundCrop, { x: 0, y: 0, w: 100, h: 100 }))} />}
        {periodLabel && <div className="overlay-period-label">{periodLabel}</div>}
        {layout === 'vertical' && promptText && <div className={`overlay-action-prompt vertical ${promptSide}`}>{promptText}</div>}
        <div className="combo-row" style={{ gap: comboStyle.capsuleGap, transform: layout === 'vertical' ? `translateY(${trackOffset}px)` : `translateX(${trackOffset}px)` }}>
          {visibleItems.length ? visibleItems.map((item) => {
            const roleStyle = comboStyle.roleStyles[item.characterSlot];
            const chipSize = comboImageItemSizeForText(comboStyle, item.displayText, item.showAvatar);
            const contentParts = comboTextParts(item.displayText, Boolean(item.iconId));
            const blockImageStyle = comboStyle.blockMode === 'image' ? capsuleImageStyle(comboStyle, chipSize.width, chipSize.height) : {};
            const blockColor = comboStyle.blockMode === 'capsule' ? roleStyle.color : 'transparent';
            const avatarLeft = comboStyle.blockMode === 'image' ? comboStyle.avatarOffsetX - 12 : comboStyle.avatarOffsetX;
            return (
              <div
                key={item.step.id}
                className={`combo-chip ${comboStyle.blockMode === 'image' ? 'image-block' : ''} ${practice?.completedStepIds.includes(item.step.id) ? 'done' : ''} ${practice?.errorStepIds.includes(item.step.id) ? 'error' : ''} ${activeStep?.id === item.step.id ? 'active' : ''} ${comboStyle.prePromptEnabled && nextStep?.id === item.step.id ? 'next' : ''} ${item.showAvatar ? 'with-avatar' : ''}`}
                style={{
                  '--move-color': roleStyle.color,
                  width: chipSize.width,
                  height: chipSize.height,
                  color: comboStyle.textColor,
                  fontSize: comboStyle.fontSize,
                  fontFamily: comboStyle.fontFamily,
                  opacity: comboStyle.prePromptEnabled && nextStep?.id === item.step.id ? 1 : comboItemOpacity(metrics[item.index], activeMetric, trackOffset, layout, effectiveBounds, comboStyle),
                  backgroundColor: blockColor,
                  borderRadius: comboStyle.blockMode === 'capsule' && comboStyle.capsuleShape === 'capsule' ? 999 : 4,
                  ...blockImageStyle
                } as CSSProperties}
              >
                {item.showAvatar && <span className="avatar-slot" style={{ width: comboStyle.avatarSize, height: comboStyle.avatarSize, left: avatarLeft, transform: `translateY(calc(-50% + ${comboStyle.avatarOffsetY}px))`, ...imageCropBackground(roleStyle.avatar, normalizeSquareRectPercent(roleStyle.avatarCrop)) }}>{roleStyle.avatar ? null : item.characterSlot}</span>}
                {comboStyle.blockMode === 'image' && <CapsuleBlockBackground />}
                {layout === 'horizontal' && promptText && promptStep?.id === item.step.id && <div className={`overlay-action-prompt horizontal ${promptSide}`}>{promptText}</div>}
                <ComboInlineContent parts={contentParts} className="combo-chip-content" />
              </div>
            );
          }) : <div className="placeholder">暂无连段图</div>}
        </div>
        <div className="hint-line">
          <span>{activeStep ? `下一步：${activeStep.label}` : '等待开始'}</span>
          <strong>{practice?.feedback[0]?.message ?? ''}</strong>
        </div>
      </div>
    </div>
  );
}

function CapsuleBlockBackground() {
  return <div className="capsule-bg" aria-hidden="true"><div className="capsule-bg-piece left" /><div className="capsule-bg-piece middle" /><div className="capsule-bg-piece right" /></div>;
}

function ComboInlineContent({ parts, className }: { parts: ReturnType<typeof comboTextParts>; className: string }) {
  return <strong className={className}>{parts.map((part, index) => part.kind === 'icon' ? <img key={`${part.iconId}-${index}`} className="combo-inline-icon" src={iconSourceForId(part.iconId)} alt={part.label} title={part.label} /> : <span key={`text-${index}`}>{part.value}</span>)}</strong>;
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

function comboTrackMetrics(items: ReturnType<typeof chartToComboImageItems>, layout: 'horizontal' | 'vertical', style: ComboImageStyle): ComboTrackMetric[] {
  let cursor = 0;
  return items.map((item, index) => {
    if (index > 0) cursor += style.capsuleGap;
    const size = comboImageItemSizeForText(style, item.displayText, item.showAvatar);
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

function capsuleImageStyle(style: ComboImageStyle, width: number, height: number): CSSProperties {
  if (!style.capsuleImage) return {};
  const image = capsuleBorderImage(style, width, height);
  return {
    backgroundImage: 'none',
    borderColor: 'transparent',
    '--capsule-render-source': `url("${image.source}")`
  } as CSSProperties;
}

function capsuleBorderImage(style: ComboImageStyle, targetWidthInput: number, targetHeightInput: number): { source: string } {
  const source = style.capsuleImage ?? '';
  const naturalWidth = Math.max(1, style.capsuleImageWidth ?? style.capsuleWidth ?? 200);
  const naturalHeight = Math.max(1, style.capsuleImageHeight ?? style.capsuleHeight ?? 80);
  const crop = normalizeRectPercent(style.capsuleCrop, { x: 0, y: 0, w: 100, h: 100 });
  const cropX = Math.round((crop.x / 100) * naturalWidth);
  const cropY = Math.round((crop.y / 100) * naturalHeight);
  const cropWidth = Math.max(1, Math.round((crop.w / 100) * naturalWidth));
  const cropHeight = Math.max(1, Math.round((crop.h / 100) * naturalHeight));
  const stretch = style.capsuleStretch ?? { left: 25, right: 75 };
  const leftLine = Math.round(clampNumber(((stretch.left ?? 25) / 100) * naturalWidth - cropX, 1, cropWidth - 2));
  const rightLine = Math.round(clampNumber(((stretch.right ?? 75) / 100) * naturalWidth - cropX, leftLine + 1, cropWidth - 1));
  const targetWidth = Math.max(1, Math.round(targetWidthInput));
  const targetHeight = Math.max(1, Math.round(targetHeightInput));
  const heightScale = targetHeight / cropHeight;
  const destLeft = Math.max(0, Math.round(leftLine * heightScale));
  const destRight = Math.max(0, Math.round((cropWidth - rightLine) * heightScale));
  const destMiddle = Math.max(0, targetWidth - destLeft - destRight);
  const stretchWidth = Math.max(1, rightLine - leftLine);
  const imageAttrs = `x="0" y="0" width="${naturalWidth}" height="${naturalHeight}" preserveAspectRatio="none" style="image-rendering:pixelated;image-rendering:crisp-edges"`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${targetHeight}" viewBox="0 0 ${targetWidth} ${targetHeight}" preserveAspectRatio="none" shape-rendering="crispEdges"><svg x="0" y="0" width="${destLeft}" height="${targetHeight}" viewBox="${cropX} ${cropY} ${leftLine} ${cropHeight}" preserveAspectRatio="none"><image href="${source}" ${imageAttrs}/></svg><svg x="${destLeft}" y="0" width="${destMiddle}" height="${targetHeight}" viewBox="${cropX + leftLine} ${cropY} ${stretchWidth} ${cropHeight}" preserveAspectRatio="none"><image href="${source}" ${imageAttrs}/></svg><svg x="${destLeft + destMiddle}" y="0" width="${destRight}" height="${targetHeight}" viewBox="${cropX + rightLine} ${cropY} ${cropWidth - rightLine} ${cropHeight}" preserveAspectRatio="none"><image href="${source}" ${imageAttrs}/></svg></svg>`;
  return { source: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
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
