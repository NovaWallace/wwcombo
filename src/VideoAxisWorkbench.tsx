import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileVideo, Pause, Play, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import type { CharacterSlot, ComboChart, ComboImageStyle, ComboPeriod, ComboStep } from '../combo-core';
import {
  chartToComboImageItems,
  comboImageDisplayIndexForStep,
  comboImageItemSizeForDisplayItem,
  comboTextParts,
  effectiveCapsuleImageFields,
  effectiveIconMappings,
  normalizeRectPercent,
  visibleComboImageItems
} from './combo-image/comboImage';

type ComboLayout = 'horizontal' | 'vertical';
type VideoLayerBounds = { x: number; y: number; width: number; height: number };
type OverlaySettings = { layout: ComboLayout; x: number; y: number; width: number; height: number };
type ZoomKeyframe = { id: string; timeMs: number };
type ZoomDragSnapshot = {
  markerId: string;
  markerIndex: number;
  startX: number;
  trackWidth: number;
  renderTotal: number;
  chart: ComboChart;
  keyframes: ZoomKeyframe[];
};

type VideoAxisWorkbenchProps = {
  chart: ComboChart;
  comboImageStyle: ComboImageStyle;
  overlaySettings: OverlaySettings;
  timelineEditor: ReactNode;
  onApplyChart: (chart: ComboChart) => void;
  onClose: () => void;
  onSave: () => void;
};

type VideoMeta = {
  width: number;
  height: number;
  durationMs: number;
  name: string;
};

type ExportStatus = {
  state: 'idle' | 'running' | 'done' | 'error';
  message: string;
  progress: number;
};

type ImageCache = Map<string, HTMLImageElement | null>;

const CHARACTER_SLOTS: CharacterSlot[] = [1, 2, 3];
const MIN_STEP_DURATION = 35;
const MIN_FRAME_GAP_MS = 120;
const DEFAULT_VIDEO_META: VideoMeta = { width: 1920, height: 1080, durationMs: 0, name: '未导入视频' };
const VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  const millis = Math.floor(ms % 1000).toString().padStart(3, '0');
  return `${minutes}:${seconds}.${millis}`;
}

function safeFileName(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 72) || 'axis-video';
}

function chartExtentMs(chart: ComboChart): number {
  return Math.max(
    3000,
    chart.timelineDurationMs ?? 0,
    ...chart.steps.map((step) => step.startMin + step.durationMax + 600),
    ...(chart.periods ?? []).map((period) => period.endMs + 600)
  );
}

function activeStepIdAt(chart: ComboChart, timeMs: number): string | undefined {
  return [...chart.steps]
    .filter((step) => step.startMin <= timeMs)
    .sort((left, right) => right.startMin - left.startMin || right.startMax - left.startMax || left.id.localeCompare(right.id))[0]?.id;
}

function comboTrackMetrics(items: ReturnType<typeof chartToComboImageItems>, layout: ComboLayout, style: ComboImageStyle): Array<{ extent: number; start: number; center: number }> {
  let cursor = 0;
  return items.map((item, index) => {
    if (index > 0) cursor += style.capsuleGap;
    const roleStyle = style.roleStyles[item.characterSlot];
    const size = comboImageItemSizeForDisplayItem(style, item, roleStyle);
    const extent = layout === 'vertical' ? size.height : size.width;
    const metric = { extent, start: cursor, center: cursor + extent / 2 };
    cursor += extent;
    return metric;
  });
}

function comboTrackOffset(items: ReturnType<typeof chartToComboImageItems>, activeIndex: number, layout: ComboLayout, bounds: { width: number; height: number }, style: ComboImageStyle): number {
  if (!items.length) return 0;
  const current = clamp(activeIndex, 0, items.length - 1);
  const metrics = comboTrackMetrics(items, layout, style);
  const activeMetric = metrics[current];
  if (!activeMetric) return 0;
  const viewport = Math.max(1, layout === 'vertical' ? bounds.height : bounds.width);
  if (style.scrollAnchor === 'center') return Math.round(viewport / 2 - activeMetric.center);
  return Math.round(style.scrollStartOffsetPx - activeMetric.start);
}

function currentScreenSize(): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(window.screen?.width || window.screen?.availWidth || window.innerWidth || 1920)),
    height: Math.max(1, Math.round(window.screen?.height || window.screen?.availHeight || window.innerHeight || 1080))
  };
}

function overlayBoundsToVideoPercent(settings: OverlaySettings, screenSize: { width: number; height: number }): VideoLayerBounds {
  return {
    x: (settings.x / screenSize.width) * 100,
    y: (settings.y / screenSize.height) * 100,
    width: (settings.width / screenSize.width) * 100,
    height: (settings.height / screenSize.height) * 100
  };
}

function overlayPixelBounds(settings: OverlaySettings, videoMeta: VideoMeta, screenSize: { width: number; height: number }): { width: number; height: number } {
  const videoWidth = Math.max(1, videoMeta.width || 1920);
  const videoHeight = Math.max(1, videoMeta.height || 1080);
  return {
    width: Math.max(1, Math.round((settings.width / screenSize.width) * videoWidth)),
    height: Math.max(1, Math.round((settings.height / screenSize.height) * videoHeight))
  };
}

function imageCropBackground(src: string | undefined, crop = { x: 0, y: 0, w: 100, h: 100 }): CSSProperties {
  if (!src) return {};
  const safe = normalizeRectPercent(crop, { x: 0, y: 0, w: 100, h: 100 });
  return {
    backgroundImage: `url(${src})`,
    backgroundSize: `${10000 / safe.w}% ${10000 / safe.h}%`,
    backgroundPosition: `${safe.x <= 0 ? 0 : (safe.x / Math.max(1, 100 - safe.w)) * 100}% ${safe.y <= 0 ? 0 : (safe.y / Math.max(1, 100 - safe.h)) * 100}%`,
    backgroundRepeat: 'no-repeat'
  };
}

function cssImageUrl(src: string): string {
  return `url("${src.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
}

function cssPx(value: number): string {
  return `${Number(value.toFixed(3))}px`;
}

function capsuleBackgroundVars(style: ComboImageStyle, targetWidthInput: number, targetHeightInput: number, roleStyle?: ComboImageStyle['roleStyles'][CharacterSlot]): CSSProperties {
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
  const leftLine = Math.round(clamp(((stretch.left ?? 25) / 100) * naturalWidth - cropX, 1, cropWidth - 2));
  const rightLine = Math.round(clamp(((stretch.right ?? 75) / 100) * naturalWidth - cropX, leftLine + 1, cropWidth - 1));
  const targetWidth = Math.max(1, Math.round(targetWidthInput));
  const targetHeight = Math.max(1, Math.round(targetHeightInput));
  const heightScale = targetHeight / cropHeight;
  const destLeft = Math.max(0, Math.round(leftLine * heightScale));
  const destRight = Math.max(0, Math.round((cropWidth - rightLine) * heightScale));
  const destMiddle = Math.max(0, targetWidth - destLeft - destRight);
  const stretchWidth = Math.max(1, rightLine - leftLine);
  const middleScaleX = destMiddle / stretchWidth;
  return {
    '--capsule-bg-source': cssImageUrl(source),
    '--capsule-bg-left-width': cssPx(destLeft),
    '--capsule-bg-middle-left': cssPx(destLeft),
    '--capsule-bg-middle-width': cssPx(destMiddle),
    '--capsule-bg-right-left': cssPx(destLeft + destMiddle),
    '--capsule-bg-right-width': cssPx(destRight),
    '--capsule-bg-left-size': `${cssPx(naturalWidth * heightScale)} ${cssPx(naturalHeight * heightScale)}`,
    '--capsule-bg-left-position': `${cssPx(-cropX * heightScale)} ${cssPx(-cropY * heightScale)}`,
    '--capsule-bg-middle-size': `${cssPx(naturalWidth * middleScaleX)} ${cssPx(naturalHeight * heightScale)}`,
    '--capsule-bg-middle-position': `${cssPx(-(cropX + leftLine) * middleScaleX)} ${cssPx(-cropY * heightScale)}`,
    '--capsule-bg-right-size': `${cssPx(naturalWidth * heightScale)} ${cssPx(naturalHeight * heightScale)}`,
    '--capsule-bg-right-position': `${cssPx(-(cropX + rightLine) * heightScale)} ${cssPx(-cropY * heightScale)}`
  } as CSSProperties;
}

function capsuleImageStyle(style: ComboImageStyle, width: number, height: number, roleStyle?: ComboImageStyle['roleStyles'][CharacterSlot]): CSSProperties {
  const capsule = effectiveCapsuleImageFields(style, roleStyle);
  if (style.blockMode !== 'image' || !capsule.image) return {};
  return {
    backgroundImage: 'none',
    borderColor: 'transparent',
    ...capsuleBackgroundVars(style, width, height, roleStyle)
  } as CSSProperties;
}

function comboItemOpacity(metric: { center: number } | undefined, activeMetric: { center: number } | undefined, trackOffset: number, layout: ComboLayout, bounds: { width: number; height: number }, style: ComboImageStyle): number {
  if (!style.fadeEnabled || !metric || !activeMetric) return 1;
  const viewport = Math.max(1, layout === 'vertical' ? bounds.height : bounds.width);
  const position = metric.center + trackOffset;
  const activePosition = activeMetric.center + trackOffset;
  const distance = Math.abs(position - activePosition);
  const ratio = clamp(distance / Math.max(1, viewport / 2), 0, 1);
  return Number((1 - ratio * clamp(style.fadeRange / 100, 0, 1)).toFixed(3));
}

function activeFrameVars(showAvatar: boolean, blockMode: ComboImageStyle['blockMode'], avatarLeft: number, avatarSize: number, avatarOffsetY: number, blockHeight: number): CSSProperties {
  if (blockMode !== 'image') return {};
  const bleed = 3;
  const avatarTop = blockHeight / 2 + avatarOffsetY - avatarSize / 2;
  const avatarBottom = blockHeight / 2 + avatarOffsetY + avatarSize / 2;
  return {
    '--active-frame-left': `${showAvatar ? Math.min(-bleed, avatarLeft - bleed) : -bleed}px`,
    '--active-frame-right': `${-bleed}px`,
    '--active-frame-top': `${showAvatar ? Math.min(-bleed, avatarTop - bleed) : -bleed}px`,
    '--active-frame-bottom': `${showAvatar ? Math.min(-bleed, blockHeight - avatarBottom - bleed) : -bleed}px`
  } as CSSProperties;
}

function CapsuleBlockBackground() {
  return <div className="capsule-bg" aria-hidden="true"><div className="capsule-bg-piece left" /><div className="capsule-bg-piece middle" /><div className="capsule-bg-piece right" /></div>;
}

function ComboInlineContent({ parts, className }: { parts: ReturnType<typeof comboTextParts>; className: string }) {
  return <strong className={className}>{parts.map((part, index) => part.kind === 'icon' ? <span key={`${part.iconId}-${index}`} className="combo-inline-icon-mark" style={{ '--icon-scale': part.iconScale } as CSSProperties}><img className="combo-inline-icon" src={part.src} alt={part.label} title={part.label} /></span> : <span key={`text-${index}`}>{part.value}</span>)}</strong>;
}

function ComboItemContent({ item, parts, className, mappings, activeStepId }: { item: ReturnType<typeof chartToComboImageItems>[number]; parts: ReturnType<typeof comboTextParts>; className: string; mappings: ComboImageStyle['iconMappings']; activeStepId?: string }) {
  if (item.mergedParts?.length && activeStepId) {
    return <strong className={className}>{item.mergedParts.map((part) => {
      const active = part.stepId === activeStepId;
      return <span key={part.stepId} className={active ? 'combo-merged-part active' : 'combo-merged-part'}>{comboTextParts(part.displayText, Boolean(part.iconId), mappings).map((piece, index) => piece.kind === 'icon' ? <span key={`${piece.iconId}-${index}`} className={active ? 'combo-inline-icon-mark active' : 'combo-inline-icon-mark'} style={{ '--icon-scale': piece.iconScale } as CSSProperties}><img className="combo-inline-icon" src={piece.src} alt={piece.label} title={piece.label} /></span> : <span key={`text-${index}`}>{piece.value}</span>)}</span>;
    })}</strong>;
  }
  return <ComboInlineContent parts={parts} className={className} />;
}

function currentPeriodLabel(chart: ComboChart, timeMs: number): string {
  if (!chart.periods?.length) return '';
  const period = chart.periods
    .filter((candidate) => candidate.kind !== 'free_fire' && timeMs >= candidate.startMs && timeMs <= candidate.endMs)
    .sort((left, right) => left.startMs - right.startMs)[0];
  return period ? `当前：${period.label}` : '';
}

function chooseMediaRecorderMime(): string {
  return VIDEO_MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? '';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeStepLike(step: ComboStep): ComboStep {
  const startMin = Math.max(0, Math.round(step.startMin));
  const startMax = Math.max(startMin, Math.round(step.startMax));
  const durationMin = Math.max(MIN_STEP_DURATION, Math.round(step.durationMin));
  const durationMax = Math.max(durationMin, Math.round(step.durationMax));
  const preheatMs = clamp(Math.round(step.preheatMs ?? 0), 0, Math.max(0, durationMax - MIN_STEP_DURATION));
  const recoveryMs = clamp(Math.round(step.recoveryMs ?? 0), 0, Math.max(0, durationMax - preheatMs - MIN_STEP_DURATION));
  return { ...step, startMin, startMax, durationMin, durationMax, preheatMs, recoveryMs };
}

function scaleNumberInRange(value: number, rangeStart: number, factor: number): number {
  return Math.round(rangeStart + (value - rangeStart) * factor);
}

function scaleStepForZoom(step: ComboStep, rangeStart: number, rangeEnd: number, nextRangeEnd: number): ComboStep {
  const stepStart = step.startMin;
  const stepEnd = step.startMin + step.durationMax;
  const delta = nextRangeEnd - rangeEnd;
  const span = Math.max(MIN_FRAME_GAP_MS, rangeEnd - rangeStart);
  const factor = Math.max(0.05, (nextRangeEnd - rangeStart) / span);
  if (stepStart >= rangeStart && stepStart < rangeEnd) {
    return normalizeStepLike({
      ...step,
      startMin: scaleNumberInRange(step.startMin, rangeStart, factor),
      startMax: scaleNumberInRange(step.startMax, rangeStart, factor),
      durationMin: Math.max(MIN_STEP_DURATION, Math.round(step.durationMin * factor)),
      durationMax: Math.max(MIN_STEP_DURATION, Math.round(step.durationMax * factor)),
      preheatMs: Math.round((step.preheatMs ?? 0) * factor),
      recoveryMs: Math.round((step.recoveryMs ?? 0) * factor)
    });
  }
  if (stepStart >= rangeEnd) {
    return normalizeStepLike({ ...step, startMin: step.startMin + delta, startMax: step.startMax + delta });
  }
  return step;
}

function scalePeriodForZoom(period: ComboPeriod, rangeStart: number, rangeEnd: number, nextRangeEnd: number): ComboPeriod {
  const delta = nextRangeEnd - rangeEnd;
  const span = Math.max(MIN_FRAME_GAP_MS, rangeEnd - rangeStart);
  const factor = Math.max(0.05, (nextRangeEnd - rangeStart) / span);
  if (period.startMs >= rangeStart && period.startMs < rangeEnd) {
    return {
      ...period,
      startMs: scaleNumberInRange(period.startMs, rangeStart, factor),
      endMs: Math.max(scaleNumberInRange(period.startMs, rangeStart, factor) + MIN_STEP_DURATION, scaleNumberInRange(period.endMs, rangeStart, factor))
    };
  }
  if (period.startMs >= rangeEnd) return { ...period, startMs: Math.max(0, Math.round(period.startMs + delta)), endMs: Math.max(0, Math.round(period.endMs + delta)) };
  return period;
}

function scaleChartBetweenZoomFrames(chart: ComboChart, rangeStart: number, rangeEnd: number, nextRangeEnd: number): ComboChart {
  const delta = nextRangeEnd - rangeEnd;
  return {
    ...chart,
    updatedAt: Date.now(),
    timelineDurationMs: Math.max(0, Math.round((chart.timelineDurationMs ?? chartExtentMs(chart)) + delta)),
    steps: chart.steps.map((step) => scaleStepForZoom(step, rangeStart, rangeEnd, nextRangeEnd)),
    periods: chart.periods?.map((period) => scalePeriodForZoom(period, rangeStart, rangeEnd, nextRangeEnd))
  };
}

function readVideoMetadata(file: File, url: string): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => resolve({
      width: video.videoWidth || 1920,
      height: video.videoHeight || 1080,
      durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0,
      name: file.name
    });
    video.onerror = () => reject(new Error('视频元数据读取失败'));
    video.src = url;
  });
}

function loadCanvasImage(src: string | undefined, cache: ImageCache): HTMLImageElement | null {
  if (!src) return null;
  if (cache.has(src)) return cache.get(src) ?? null;
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => cache.set(src, image);
  image.onerror = () => cache.set(src, null);
  cache.set(src, null);
  image.src = src;
  return null;
}

function preloadCanvasImage(src: string | undefined, cache: ImageCache): Promise<void> {
  if (!src || cache.get(src)) return Promise.resolve();
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      cache.set(src, image);
      resolve();
    };
    image.onerror = () => {
      cache.set(src, null);
      resolve();
    };
    image.src = src;
  });
}

function preloadComboLayerImages(style: ComboImageStyle, cache: ImageCache): Promise<void[]> {
  return Promise.all(CHARACTER_SLOTS.map((slot) => preloadCanvasImage(style.roleStyles[slot]?.avatar, cache)));
}

function preloadChartIconImages(chart: ComboChart, style: ComboImageStyle, cache: ImageCache): Promise<void[]> {
  const items = chartToComboImageItems(chart, style);
  const sources = new Set<string>();
  items.forEach((item) => comboTextParts(item.displayText, Boolean(item.iconId), style.roleStyles[item.characterSlot]?.iconMappings ?? style.iconMappings).forEach((part) => {
    if (part.kind === 'icon') sources.add(part.src);
  }));
  return Promise.all(Array.from(sources).map((src) => preloadCanvasImage(src, cache)));
}

async function preloadExportImages(chart: ComboChart, style: ComboImageStyle, cache: ImageCache): Promise<void> {
  await Promise.all([preloadComboLayerImages(style, cache), preloadChartIconImages(chart, style, cache)]);
}

function seekVideo(video: HTMLVideoElement, seconds: number): Promise<void> {
  const duration = Number.isFinite(video.duration) ? video.duration : Math.max(seconds, 0);
  const target = clamp(seconds, 0, Math.max(0, duration));
  if (Math.abs(video.currentTime - target) < 0.02 && video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const onSeeked = () => finish();
    const onError = () => {
      cleanup();
      reject(new Error('视频定位失败'));
    };
    const timeout = window.setTimeout(() => finish(), 4000);
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = target;
  });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawCroppedCircleImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, size: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  const side = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const sx = ((image.naturalWidth || image.width) - side) / 2;
  const sy = ((image.naturalHeight || image.height) - side) / 2;
  ctx.drawImage(image, sx, sy, side, side, x, y, size, size);
  ctx.restore();
}

function drawComboTextParts(ctx: CanvasRenderingContext2D, parts: ReturnType<typeof comboTextParts>, x: number, y: number, maxWidth: number, fontSize: number, imageCache: ImageCache) {
  let cursor = x;
  const gap = Math.max(3, fontSize * 0.12);
  for (const part of parts) {
    if (cursor >= x + maxWidth) return;
    if (part.kind === 'icon') {
      const image = loadCanvasImage(part.src, imageCache);
      const size = fontSize * 1.42 * part.iconScale;
      if (image) {
        ctx.drawImage(image, cursor, y - size / 2, size, size);
        cursor += size + gap;
        continue;
      }
      const fallbackWidth = ctx.measureText(part.label).width;
      ctx.fillText(part.label, cursor, y, Math.max(1, x + maxWidth - cursor));
      cursor += fallbackWidth + gap;
      continue;
    }
    const width = ctx.measureText(part.value).width;
    ctx.fillText(part.value, cursor, y, Math.max(1, x + maxWidth - cursor));
    cursor += width;
  }
}

function drawComboLayerToCanvas(ctx: CanvasRenderingContext2D, chart: ComboChart, style: ComboImageStyle, timeMs: number, bounds: VideoLayerBounds, layout: ComboLayout, overlayBounds: { width: number; height: number }, canvasWidth: number, canvasHeight: number, imageCache: ImageCache) {
  const x = (bounds.x / 100) * canvasWidth;
  const y = (bounds.y / 100) * canvasHeight;
  const width = (bounds.width / 100) * canvasWidth;
  const height = (bounds.height / 100) * canvasHeight;
  const activeStepId = activeStepIdAt(chart, timeMs);
  const allItems = chartToComboImageItems(chart, style);
  const activeIndex = comboImageDisplayIndexForStep(allItems, activeStepId);
  const trackOffset = comboTrackOffset(allItems, activeIndex, layout, overlayBounds, style);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(x, y, width, height);
  ctx.font = `${Math.max(18, Math.round(height * 0.28))}px Microsoft YaHei, sans-serif`;
  ctx.textBaseline = 'middle';
  let cursor = (layout === 'vertical' ? y : x) + trackOffset;
  allItems.forEach((item, index) => {
    const role = style.roleStyles[item.characterSlot];
    const size = comboImageItemSizeForDisplayItem(style, item, role);
    const chipHeight = Math.min(layout === 'vertical' ? height * 0.28 : height * 0.72, Math.max(28, size.height));
    const chipWidth = Math.min(layout === 'vertical' ? width * 0.9 : width * 0.72, Math.max(72, size.width));
    const chipX = layout === 'vertical' ? x + (width - chipWidth) / 2 : cursor;
    const chipY = layout === 'vertical' ? cursor : y + (height - chipHeight) / 2;
    const visible = layout === 'vertical' ? chipY + chipHeight >= y - 12 && chipY <= y + height + 12 : chipX + chipWidth >= x - 12 && chipX <= x + width + 12;
    if (visible) {
      const active = index === activeIndex;
      ctx.fillStyle = active ? '#b90000' : role.color || '#333';
      roundedRect(ctx, chipX, chipY, chipWidth, chipHeight, style.capsuleShape === 'capsule' ? chipHeight / 2 : 4);
      ctx.fill();
      ctx.lineWidth = active ? 4 : 2;
      ctx.strokeStyle = active ? '#ffffff' : 'rgba(255,255,255,0.5)';
      ctx.stroke();
      let textX = chipX + 14;
      if (item.showAvatar) {
        const avatarSize = Math.min(chipHeight * 0.78, 54);
        const avatarX = chipX + 8;
        const avatarY = chipY + (chipHeight - avatarSize) / 2;
        const avatar = loadCanvasImage(role.avatar, imageCache);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.fill();
        if (avatar) drawCroppedCircleImage(ctx, avatar, avatarX, avatarY, avatarSize);
        ctx.strokeStyle = 'rgba(255,255,255,0.72)';
        ctx.lineWidth = 2;
        ctx.stroke();
        textX += avatarSize + 10;
      }
      ctx.fillStyle = style.textColor || '#fff';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 6;
      const parts = comboTextParts(item.displayText || item.step.label, Boolean(item.iconId), role.iconMappings ?? style.iconMappings);
      drawComboTextParts(ctx, parts, textX, chipY + chipHeight / 2, Math.max(24, chipWidth - (textX - chipX) - 12), Math.max(18, Math.round(chipHeight * 0.34)), imageCache);
      ctx.shadowBlur = 0;
    }
    cursor += (layout === 'vertical' ? chipHeight : chipWidth) + style.capsuleGap;
  });
  ctx.restore();
}

function VideoComboLayer({ chart, style, timeMs, layout, bounds }: { chart: ComboChart; style: ComboImageStyle; timeMs: number; layout: ComboLayout; bounds: { width: number; height: number } }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostSize, setHostSize] = useState(() => bounds);
  const activeStepId = activeStepIdAt(chart, timeMs);
  const allItems = chartToComboImageItems(chart, style);
  const activeIndex = comboImageDisplayIndexForStep(allItems, activeStepId);
  const visibleItems = visibleComboImageItems(allItems, activeIndex, layout, bounds, style);
  const trackOffset = comboTrackOffset(allItems, activeIndex, layout, bounds, style);
  const metrics = comboTrackMetrics(allItems, layout, style);
  const activeMetric = metrics[clamp(activeIndex, 0, Math.max(0, metrics.length - 1))];
  const periodLabel = currentPeriodLabel(chart, timeMs);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setHostSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [bounds.width, bounds.height]);

  const scaleX = hostSize.width / Math.max(1, bounds.width);
  const scaleY = hostSize.height / Math.max(1, bounds.height);

  return (
    <div ref={hostRef} className="video-combo-layer-scale-host">
      <div className={`combo-preview video-combo-layer-preview ${layout} next-indicator-above ${visibleItems.length ? '' : 'empty'}`} style={{ width: bounds.width, height: bounds.height, transform: `scale(${scaleX}, ${scaleY})`, '--combo-vertical-image-overlap': `${Math.max(0, Math.round(style.capsuleHeight * 0.42))}px` } as CSSProperties}>
        {periodLabel && <div className="combo-period-label">{periodLabel}</div>}
        {visibleItems.length ? (
          <div className="combo-preview-track" style={{ gap: style.capsuleGap, transform: layout === 'vertical' ? `translateY(${trackOffset}px)` : `translateX(${trackOffset}px)` }}>
            {visibleItems.map((item) => {
              const role = style.roleStyles[item.characterSlot];
              const size = comboImageItemSizeForDisplayItem(style, item, role);
              const mappings = effectiveIconMappings(style, role);
              const parts = comboTextParts(item.displayText, Boolean(item.iconId), mappings);
              const blockColor = style.blockMode === 'capsule' ? role.color : 'transparent';
              const blockImageStyle = capsuleImageStyle(style, size.width, size.height, role);
              const avatarLeft = style.blockMode === 'image' ? style.avatarOffsetX - 12 : style.avatarOffsetX;
              const isActive = item.index === activeIndex;
              const isNext = style.prePromptEnabled && item.index === activeIndex + 1;
              return (
                <div key={item.step.id} className={`combo-preview-chip ${style.blockMode === 'image' ? 'image-block' : ''} ${item.showAvatar ? 'with-avatar' : ''} ${isActive ? 'active' : ''} ${isNext ? 'next' : ''}`} style={{ width: size.width, height: size.height, color: style.textColor, fontSize: style.fontSize, fontFamily: style.fontFamily, opacity: isNext ? 1 : comboItemOpacity(metrics[item.index], activeMetric, trackOffset, layout, bounds, style), backgroundColor: blockColor, borderRadius: style.blockMode === 'capsule' && style.capsuleShape === 'capsule' ? 999 : 4, '--move-color': role.color, ...activeFrameVars(item.showAvatar, style.blockMode, avatarLeft, style.avatarSize, style.avatarOffsetY, size.height), ...blockImageStyle } as CSSProperties}>
                  {style.blockMode === 'image' && <CapsuleBlockBackground />}
                  {item.showAvatar && <span className="avatar-slot preview-avatar" style={{ width: style.avatarSize, height: style.avatarSize, left: avatarLeft, transform: `translateY(calc(-50% + ${style.avatarOffsetY}px))`, ...imageCropBackground(role.avatar, role.avatarCrop) }}>{role.avatar ? null : item.characterSlot}</span>}
                  <ComboItemContent item={item} parts={parts} className="combo-preview-content" mappings={mappings} activeStepId={activeStepId} />
                </div>
              );
            })}
          </div>
        ) : '暂无连段图'}
      </div>
    </div>
  );
}
export function VideoAxisWorkbench({ chart, comboImageStyle, overlaySettings, timelineEditor, onApplyChart, onClose, onSave }: VideoAxisWorkbenchProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMeta, setVideoMeta] = useState<VideoMeta>(DEFAULT_VIDEO_META);
  const [playbackMs, setPlaybackMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [keyframes, setKeyframes] = useState<ZoomKeyframe[]>(() => {
    const extent = chartExtentMs(chart);
    return [
      { id: crypto.randomUUID(), timeMs: 0 },
      { id: crypto.randomUUID(), timeMs: Math.max(MIN_FRAME_GAP_MS, extent) }
    ];
  });
  const [exportStatus, setExportStatus] = useState<ExportStatus>({ state: 'idle', message: '等待导出', progress: 0 });
  const [importMessage, setImportMessage] = useState('引用本地视频文件，不写入项目存储。');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const zoomDragRef = useRef<ZoomDragSnapshot | null>(null);
  const imageCacheRef = useRef<ImageCache>(new Map());

  const chartTotal = chartExtentMs(chart);
  const renderTotal = Math.max(chartTotal, videoMeta.durationMs || 0, ...keyframes.map((frame) => frame.timeMs + 600));
  const zoomTrackTotal = Math.max(renderTotal, videoMeta.durationMs || 0, chartTotal);
  const frameAspect = `${Math.max(1, videoMeta.width)} / ${Math.max(1, videoMeta.height)}`;
  const screenSize = currentScreenSize();
  const layerBounds = overlayBoundsToVideoPercent(overlaySettings, screenSize);
  const layerPixelBounds = overlayPixelBounds(overlaySettings, videoMeta, screenSize);
  const sortedKeyframes = useMemo(() => [...keyframes].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id)), [keyframes]);

  useEffect(() => {
    document.body.classList.add('video-workbench-open');
    return () => document.body.classList.remove('video-workbench-open');
  }, []);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video) setPlaybackMs(Math.round(video.currentTime * 1000));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function importVideo(file: File | null) {
    if (!file) return;
    const nextUrl = URL.createObjectURL(file);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(nextUrl);
    setImportMessage('正在读取视频信息...');
    try {
      const meta = await readVideoMetadata(file, nextUrl);
      setVideoMeta(meta);
      setPlaybackMs(0);
      setIsPlaying(false);
      setKeyframes((current) => {
        const chartEnd = Math.max(MIN_FRAME_GAP_MS, chartExtentMs(chart));
        const normalized = current.length > 2 ? [...current].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id)) : [
          { id: crypto.randomUUID(), timeMs: 0 },
          { id: crypto.randomUUID(), timeMs: chartEnd }
        ];
        return normalized.map((frame, index) => {
          if (index === 0) return { ...frame, timeMs: 0 };
          if (index === normalized.length - 1) return { ...frame, timeMs: Math.max(chartEnd, frame.timeMs) };
          return { ...frame, timeMs: clamp(frame.timeMs, MIN_FRAME_GAP_MS * index, Math.max(MIN_FRAME_GAP_MS * index, chartEnd - MIN_FRAME_GAP_MS * (normalized.length - index - 1))) };
        });
      });
      setImportMessage(`已引用 ${meta.name}，${meta.width}x${meta.height}，${formatMs(meta.durationMs)}`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : '视频读取失败');
    }
  }

  async function togglePlay() {
    const video = videoRef.current;
    if (!videoUrl || !video) return;
    if (video.paused) {
      await video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }

  function seekTo(ms: number) {
    const video = videoRef.current;
    const next = clamp(ms, 0, renderTotal);
    setPlaybackMs(next);
    if (video) video.currentTime = next / 1000;
  }

  function addZoomKeyframe() {
    const timeMs = Math.round(clamp(playbackMs, 0, renderTotal));
    setKeyframes((current) => [...current, { id: crypto.randomUUID(), timeMs }].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id)));
  }

  function deleteZoomKeyframe(frameId: string) {
    setKeyframes((current) => current.length <= 2 ? current : current.filter((frame) => frame.id !== frameId));
  }

  function fitChartToVideoDuration() {
    const targetEnd = videoMeta.durationMs || renderTotal;
    if (targetEnd <= MIN_FRAME_GAP_MS) return;
    const frames = sortedKeyframes.length >= 2 ? sortedKeyframes : [
      { id: crypto.randomUUID(), timeMs: 0 },
      { id: crypto.randomUUID(), timeMs: chartExtentMs(chart) }
    ];
    const previous = frames[frames.length - 2];
    const axisEnd = Math.max(previous.timeMs + MIN_FRAME_GAP_MS, chartExtentMs(chart));
    const nextTime = Math.max(previous.timeMs + MIN_FRAME_GAP_MS, targetEnd);
    onApplyChart(scaleChartBetweenZoomFrames(chart, previous.timeMs, axisEnd, nextTime));
    setKeyframes(frames.map((frame, index) => index === frames.length - 1 ? { ...frame, timeMs: nextTime } : frame));
    seekTo(Math.min(playbackMs, nextTime));
  }

  function beginZoomDrag(event: ReactPointerEvent<HTMLButtonElement>, frameId: string) {
    event.preventDefault();
    event.stopPropagation();
    const track = event.currentTarget.closest('.video-zoom-track') as HTMLElement | null;
    const markerIndex = sortedKeyframes.findIndex((frame) => frame.id === frameId);
    if (!track || markerIndex < 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    zoomDragRef.current = {
      markerId: frameId,
      markerIndex,
      startX: event.clientX,
      trackWidth: Math.max(1, track.getBoundingClientRect().width),
      renderTotal: zoomTrackTotal,
      chart: { ...chart, steps: chart.steps.map((step) => ({ ...step })), periods: chart.periods?.map((period) => ({ ...period })) },
      keyframes: sortedKeyframes
    };
  }

  function onZoomDragMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = zoomDragRef.current;
    if (!drag) return;
    const original = drag.keyframes[drag.markerIndex];
    const previous = drag.keyframes[drag.markerIndex - 1];
    const next = drag.keyframes[drag.markerIndex + 1];
    const deltaMs = ((event.clientX - drag.startX) / drag.trackWidth) * drag.renderTotal;
    const minTime = previous ? previous.timeMs + MIN_FRAME_GAP_MS : 0;
    const maxTime = next ? next.timeMs - MIN_FRAME_GAP_MS : drag.renderTotal;
    const nextTime = Math.round(clamp(original.timeMs + deltaMs, minTime, maxTime));
    setPlaybackMs(nextTime);
    if (videoRef.current) videoRef.current.currentTime = nextTime / 1000;
    if (previous) {
      const scaledChart = scaleChartBetweenZoomFrames(drag.chart, previous.timeMs, original.timeMs, nextTime);
      onApplyChart(scaledChart);
      const shift = nextTime - original.timeMs;
      setKeyframes(drag.keyframes.map((frame, index) => {
        if (index === drag.markerIndex) return { ...frame, timeMs: nextTime };
        if (index > drag.markerIndex) return { ...frame, timeMs: Math.max(0, Math.round(frame.timeMs + shift)) };
        return frame;
      }));
      return;
    }
    setKeyframes(drag.keyframes.map((frame, index) => index === drag.markerIndex ? { ...frame, timeMs: nextTime } : frame));
  }

  function endZoomDrag() {
    zoomDragRef.current = null;
  }

  async function exportVideo() {
    const sourceVideo = videoRef.current;
    if (!videoUrl || !sourceVideo) {
      setExportStatus({ state: 'error', message: '请先导入视频。', progress: 0 });
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setExportStatus({ state: 'error', message: '当前浏览器不支持 MediaRecorder 导出。', progress: 0 });
      return;
    }
    const width = sourceVideo.videoWidth || videoMeta.width;
    const height = sourceVideo.videoHeight || videoMeta.height;
    const duration = Number.isFinite(sourceVideo.duration) ? sourceVideo.duration : videoMeta.durationMs / 1000;
    if (!width || !height || !duration) {
      setExportStatus({ state: 'error', message: '视频信息不完整，无法导出。', progress: 0 });
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setExportStatus({ state: 'error', message: 'Canvas 初始化失败。', progress: 0 });
      return;
    }
    const canvasStream = canvas.captureStream(30);
    const captureSource = sourceVideo as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
    const sourceStream = captureSource.captureStream?.() ?? captureSource.mozCaptureStream?.();
    sourceStream?.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
    const mimeType = chooseMediaRecorderMime();
    const recorder = new MediaRecorder(canvasStream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : { videoBitsPerSecond: 8_000_000 });
    const chunks: BlobPart[] = [];
    const originalTime = sourceVideo.currentTime;
    const wasMuted = sourceVideo.muted;
    const wasLooping = sourceVideo.loop;
    const wasPaused = sourceVideo.paused;
    await preloadExportImages(chart, comboImageStyle, imageCacheRef.current);
    setExportStatus({ state: 'running', message: '正在导出 WebM...', progress: 0 });
    await new Promise<void>((resolve, reject) => {
      let drawFrame = 0;
      const cleanup = () => {
        window.cancelAnimationFrame(drawFrame);
        sourceVideo.onerror = null;
        sourceVideo.pause();
        sourceVideo.loop = wasLooping;
        sourceVideo.muted = wasMuted;
        sourceVideo.currentTime = originalTime;
        if (!wasPaused) void sourceVideo.play().catch(() => undefined);
      };
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        cleanup();
        reject(new Error('录制器导出失败'));
      };
      recorder.onstop = () => {
        cleanup();
        resolve();
      };
      const draw = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(sourceVideo, 0, 0, width, height);
        const timeMs = Math.round(sourceVideo.currentTime * 1000);
        drawComboLayerToCanvas(ctx, chart, comboImageStyle, timeMs, layerBounds, overlaySettings.layout, layerPixelBounds, width, height, imageCacheRef.current);
        setExportStatus({ state: 'running', message: `正在导出 WebM ${formatMs(timeMs)} / ${formatMs(duration * 1000)}`, progress: clamp(timeMs / Math.max(1, duration * 1000), 0, 1) });
        if (sourceVideo.ended || sourceVideo.currentTime >= duration - 0.03) {
          recorder.stop();
          return;
        }
        drawFrame = window.requestAnimationFrame(draw);
      };
      sourceVideo.pause();
      sourceVideo.loop = false;
      sourceVideo.muted = wasMuted;
      const startRecording = async () => {
        recorder.start(500);
        await sourceVideo.play();
        draw();
      };
      void seekVideo(sourceVideo, 0).then(startRecording).catch((error) => {
        cleanup();
        reject(error instanceof Error ? error : new Error('视频播放失败'));
      });
      sourceVideo.onerror = () => {
        cleanup();
        reject(new Error('视频导出读取失败'));
      };
    }).then(() => {
      const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
      if (!blob.size) throw new Error('导出失败：没有生成视频数据');
      downloadBlob(blob, `${safeFileName(videoMeta.name.replace(/\.[^.]+$/, ''))}-带连段图.webm`);
      setExportStatus({ state: 'done', message: `导出完成：${(blob.size / 1024 / 1024).toFixed(1)} MB`, progress: 1 });
    }).catch((error) => {
      setExportStatus({ state: 'error', message: error instanceof Error ? error.message : '导出失败', progress: 0 });
    });
  }

  const panel = (
    <div className="video-workbench" role="dialog" aria-modal="true" aria-label="视频辅助轴编辑">
      <div className="video-workbench-head">
        <div>
          <h2>视频辅助轴编辑</h2>
          <p>本地视频仅引用播放；连段图作为视频图层同步预览，可导出合成后的 WebM。</p>
        </div>
        <div className="video-workbench-actions">
          <input ref={fileInputRef} className="file-input" type="file" accept="video/*" onChange={(event) => void importVideo(event.target.files?.[0] ?? null)} />
          <button onClick={() => fileInputRef.current?.click()}><Upload size={17} />导入视频</button>
          <button className="primary" onClick={togglePlay} disabled={!videoUrl}>{isPlaying ? <Pause size={17} /> : <Play size={17} />}{isPlaying ? '暂停' : '播放'}</button>
          <button onClick={fitChartToVideoDuration} disabled={!videoMeta.durationMs}>匹配视频长度</button>
          <button onClick={onSave}><Save size={17} />保存轴</button>
          <button onClick={() => void exportVideo()} disabled={!videoUrl || exportStatus.state === 'running'}><Download size={17} />导出视频</button>
          <button className="icon-button" title="关闭" onClick={onClose}><X size={18} /></button>
        </div>
      </div>

      <div className="video-workbench-main">
        <section className="video-preview-panel">
          <div className="video-info-row">
            <div><FileVideo size={17} /><strong>{videoMeta.name}</strong><span>{videoMeta.width}x{videoMeta.height}</span><span>{formatMs(videoMeta.durationMs || renderTotal)}</span></div>
            <span>{importMessage}</span>
          </div>
          <div className="video-stage-shell">
            <div className="video-stage-frame" style={{ aspectRatio: frameAspect }}>
              {videoUrl ? <video ref={videoRef} src={videoUrl} playsInline onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} /> : <div className="video-empty"><FileVideo size={38} /><strong>导入实战视频</strong><span>视频不会写入项目文件，只在当前会话中引用。</span></div>}
              <div className="video-combo-layer-box synced" style={{ left: `${layerBounds.x}%`, top: `${layerBounds.y}%`, width: `${layerBounds.width}%`, height: `${layerBounds.height}%` }} title="位置和尺寸来自连段图外观设置">
                <VideoComboLayer chart={chart} style={comboImageStyle} timeMs={playbackMs} layout={overlaySettings.layout} bounds={layerPixelBounds} />
              </div>
            </div>
          </div>
          <div className="video-transport-row">
            <span>{formatMs(playbackMs)}</span>
            <input type="range" min="0" max={Math.max(1, renderTotal)} step="16" value={Math.min(playbackMs, renderTotal)} onChange={(event) => seekTo(Number(event.target.value))} />
            <span>{formatMs(renderTotal)}</span>
          </div>
          <div className="video-export-status">
            <div><span style={{ width: `${Math.round(exportStatus.progress * 100)}%` }} /></div>
            <strong className={exportStatus.state}>{exportStatus.message}</strong>
          </div>
        </section>

        <section className="video-edit-panel">
          <div className="video-zoom-panel">
            <div className="video-zoom-head">
              <div><strong>缩放关键帧</strong><span>拖动右侧帧会等比缩放上一帧到该帧之间完整包含的招式，并平移后续内容。</span></div>
              <button onClick={addZoomKeyframe}><Plus size={16} />添加缩放帧</button>
            </div>
            <div className="video-zoom-track" onPointerMove={onZoomDragMove} onPointerUp={endZoomDrag} onPointerCancel={endZoomDrag}>
              <div className="video-zoom-playhead" style={{ left: `${(playbackMs / zoomTrackTotal) * 100}%` }} />
              {sortedKeyframes.map((frame, index) => (
                <button key={frame.id} className="video-zoom-marker" style={{ left: `${(frame.timeMs / zoomTrackTotal) * 100}%` }} title={`缩放帧 ${index + 1} ${formatMs(frame.timeMs)}`} onPointerDown={(event) => beginZoomDrag(event, frame.id)}>
                  <span />
                  <em>{index + 1}</em>
                </button>
              ))}
            </div>
            <div className="video-zoom-list">
              {sortedKeyframes.map((frame, index) => <button key={frame.id} className="video-zoom-pill" onClick={() => seekTo(frame.timeMs)}><span>帧 {index + 1}</span><strong>{formatMs(frame.timeMs)}</strong>{sortedKeyframes.length > 2 && <Trash2 size={14} onClick={(event) => { event.stopPropagation(); deleteZoomKeyframe(frame.id); }} />}</button>)}
            </div>
          </div>
          <div className="video-timeline-compact">
            {timelineEditor}
          </div>
        </section>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
