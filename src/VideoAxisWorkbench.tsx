import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, WheelEvent as ReactWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Download, File as FileIcon, FileVideo, Pause, Play, Save, Upload, X } from 'lucide-react';
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
  exportDirectory?: string;
  timelineEditor: ReactNode;
  onApplyChart: (chart: ComboChart) => void;
  onClose: () => void;
  onSave: () => void;
  getDisplaySize?: () => Promise<{ width: number; height: number }>;
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

function currentScreenSize(settings: OverlaySettings): { width: number; height: number } {
  const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  const cssWidth = Math.max(1, Math.round(window.screen?.width || window.screen?.availWidth || window.innerWidth || 1920));
  const cssHeight = Math.max(1, Math.round(window.screen?.height || window.screen?.availHeight || window.innerHeight || 1080));
  const scaledWidth = Math.max(1, Math.round(cssWidth * dpr));
  const scaledHeight = Math.max(1, Math.round(cssHeight * dpr));
  const overlayRight = Math.max(settings.width, settings.x + settings.width);
  const overlayBottom = Math.max(settings.height, settings.y + settings.height);
  const cssLooksTooSmall = overlayRight > cssWidth * 1.04 || overlayBottom > cssHeight * 1.04;
  const scaledCanContainOverlay = overlayRight <= scaledWidth * 1.12 && overlayBottom <= scaledHeight * 1.12;
  return cssLooksTooSmall && scaledCanContainOverlay ? { width: scaledWidth, height: scaledHeight } : { width: cssWidth, height: cssHeight };
}

function normalizeDisplaySize(value: { width: number; height: number } | null | undefined): { width: number; height: number } | null {
  const width = Math.round(value?.width ?? 0);
  const height = Math.round(value?.height ?? 0);
  return width > 0 && height > 0 ? { width, height } : null;
}

function overlayBoundsToVideoPercent(settings: OverlaySettings, screenSize: { width: number; height: number }): VideoLayerBounds {
  return {
    x: (settings.x / screenSize.width) * 100,
    y: (settings.y / screenSize.height) * 100,
    width: (settings.width / screenSize.width) * 100,
    height: (settings.height / screenSize.height) * 100
  };
}

function overlaySourceBounds(settings: OverlaySettings): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(settings.width)),
    height: Math.max(1, Math.round(settings.height))
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
  return period ? `褰撳墠锛?{period.label}` : '';
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

async function exportBlob(blob: Blob, filename: string, directory?: string): Promise<{ path: string | null; format: 'mp4' | 'webm' }> {
  const targetDirectory = directory?.trim();
  if (targetDirectory && window.trainerDesktop?.saveExportMp4) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const result = await window.trainerDesktop.saveExportMp4(targetDirectory, filename.replace(/\.webm$/i, '.mp4'), bytes);
    return { path: result.path, format: 'mp4' };
  }
  downloadBlob(blob, filename);
  return { path: null, format: 'webm' };
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
  const sources = new Set<string>();
  if (style.backgroundImage) sources.add(style.backgroundImage);
  if (style.capsuleImage) sources.add(style.capsuleImage);
  CHARACTER_SLOTS.forEach((slot) => {
    const role = style.roleStyles[slot];
    if (role?.avatar) sources.add(role.avatar);
    if (role?.capsuleImage) sources.add(role.capsuleImage);
  });
  return Promise.all(Array.from(sources).map((src) => preloadCanvasImage(src, cache)));
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

function drawCroppedCircleImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, size: number, cropInput?: ComboImageStyle['roleStyles'][CharacterSlot]['avatarCrop']) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  const sourceWidth = Math.max(1, image.naturalWidth || image.width);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height);
  const crop = normalizeRectPercent(cropInput, { x: 0, y: 0, w: 100, h: 100 });
  const sx = (crop.x / 100) * sourceWidth;
  const sy = (crop.y / 100) * sourceHeight;
  const sw = Math.max(1, (crop.w / 100) * sourceWidth);
  const sh = Math.max(1, (crop.h / 100) * sourceHeight);
  ctx.drawImage(image, sx, sy, sw, sh, x, y, size, size);
  ctx.restore();
}

function drawCapsuleImageBlock(ctx: CanvasRenderingContext2D, image: HTMLImageElement, style: ComboImageStyle, role: ComboImageStyle['roleStyles'][CharacterSlot], x: number, y: number, width: number, height: number) {
  const capsule = effectiveCapsuleImageFields(style, role);
  const naturalWidth = Math.max(1, image.naturalWidth || image.width);
  const naturalHeight = Math.max(1, image.naturalHeight || image.height);
  const crop = normalizeRectPercent(capsule.crop, { x: 0, y: 0, w: 100, h: 100 });
  const stretch = capsule.stretch ?? { left: 25, right: 75 };
  const cropX = (crop.x / 100) * naturalWidth;
  const cropY = (crop.y / 100) * naturalHeight;
  const cropWidth = Math.max(1, (crop.w / 100) * naturalWidth);
  const cropHeight = Math.max(1, (crop.h / 100) * naturalHeight);
  const leftLine = clamp((stretch.left / 100) * naturalWidth - cropX, 1, Math.max(1, cropWidth - 2));
  const rightLine = clamp((stretch.right / 100) * naturalWidth - cropX, leftLine + 1, Math.max(leftLine + 1, cropWidth - 1));
  const heightScale = height / cropHeight;
  const destLeft = Math.max(0, Math.round(leftLine * heightScale));
  const destRight = Math.max(0, Math.round((cropWidth - rightLine) * heightScale));
  const destMiddle = Math.max(0, width - destLeft - destRight);
  const middleSourceWidth = Math.max(1, rightLine - leftLine);
  const previousSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (destLeft > 0) ctx.drawImage(image, cropX, cropY, leftLine, cropHeight, x, y, destLeft, height);
  if (destMiddle > 0) ctx.drawImage(image, cropX + leftLine, cropY, middleSourceWidth, cropHeight, x + destLeft, y, destMiddle, height);
  if (destRight > 0) ctx.drawImage(image, cropX + rightLine, cropY, Math.max(1, cropWidth - rightLine), cropHeight, x + destLeft + destMiddle, y, destRight, height);
  ctx.imageSmoothingEnabled = previousSmoothing;
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
  const sourceWidth = Math.max(1, overlayBounds.width);
  const sourceHeight = Math.max(1, overlayBounds.height);
  const activeStepId = activeStepIdAt(chart, timeMs);
  const allItems = chartToComboImageItems(chart, style);
  const activeIndex = comboImageDisplayIndexForStep(allItems, activeStepId);
  const trackOffset = comboTrackOffset(allItems, activeIndex, layout, overlayBounds, style);
  const metrics = comboTrackMetrics(allItems, layout, style);
  const activeMetric = metrics[clamp(activeIndex, 0, Math.max(0, metrics.length - 1))];

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.translate(x, y);
  ctx.scale(width / sourceWidth, height / sourceHeight);
  const background = loadCanvasImage(style.backgroundImage, imageCache);
  if (background) {
    const backgroundWidth = Math.max(1, background.naturalWidth || background.width);
    const backgroundHeight = Math.max(1, background.naturalHeight || background.height);
    const crop = normalizeRectPercent(style.backgroundCrop, { x: 0, y: 0, w: 100, h: 100 });
    ctx.drawImage(background, (crop.x / 100) * backgroundWidth, (crop.y / 100) * backgroundHeight, Math.max(1, (crop.w / 100) * backgroundWidth), Math.max(1, (crop.h / 100) * backgroundHeight), 0, 0, sourceWidth, sourceHeight);
  }
  ctx.font = `${Math.max(12, Math.round(style.fontSize))}px ${style.fontFamily || 'Microsoft YaHei, sans-serif'}`;
  ctx.textBaseline = 'middle';
  let cursor = trackOffset;
  allItems.forEach((item, index) => {
    const role = style.roleStyles[item.characterSlot];
    const size = comboImageItemSizeForDisplayItem(style, item, role);
    const chipHeight = Math.max(1, size.height);
    const chipWidth = Math.max(1, size.width);
    const chipX = layout === 'vertical' ? Math.max(0, (sourceWidth - chipWidth) / 2) : cursor;
    const chipY = layout === 'vertical' ? cursor : (sourceHeight - chipHeight) / 2;
    const visible = layout === 'vertical' ? chipY + chipHeight >= -12 && chipY <= sourceHeight + 12 : chipX + chipWidth >= -12 && chipX <= sourceWidth + 12;
    if (visible) {
      const active = index === activeIndex;
      const opacity = style.prePromptEnabled && index === activeIndex + 1 ? 1 : comboItemOpacity(metrics[item.index], activeMetric, trackOffset, layout, overlayBounds, style);
      ctx.save();
      ctx.globalAlpha = opacity;
      const capsule = effectiveCapsuleImageFields(style, role);
      const capsuleImage = style.blockMode === 'image' ? loadCanvasImage(capsule.image, imageCache) : null;
      if (style.blockMode === 'image' && capsuleImage) {
        drawCapsuleImageBlock(ctx, capsuleImage, style, role, chipX, chipY, chipWidth, chipHeight);
      } else {
        ctx.fillStyle = style.useCustomCapsuleColor ? style.capsuleColor : role.color || '#333';
        roundedRect(ctx, chipX, chipY, chipWidth, chipHeight, style.capsuleShape === 'capsule' ? chipHeight / 2 : 4);
        ctx.fill();
        ctx.lineWidth = active ? 4 : 2;
        ctx.strokeStyle = active ? '#ffffff' : 'rgba(255,255,255,0.5)';
        ctx.stroke();
      }
      let textX = style.blockMode === 'image' ? chipX + 14 : chipX + 14;
      if (item.showAvatar) {
        const avatarSize = Math.max(1, style.avatarSize);
        const avatarLeft = style.blockMode === 'image' ? style.avatarOffsetX - 12 : style.avatarOffsetX;
        const avatarX = chipX + avatarLeft;
        const avatarY = chipY + chipHeight / 2 + style.avatarOffsetY - avatarSize / 2;
        const avatar = loadCanvasImage(role.avatar, imageCache);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.fill();
        if (avatar) drawCroppedCircleImage(ctx, avatar, avatarX, avatarY, avatarSize, role.avatarCrop);
        ctx.strokeStyle = 'rgba(255,255,255,0.72)';
        ctx.lineWidth = 2;
        ctx.stroke();
        textX = style.blockMode === 'image' ? chipX + 44 : Math.max(textX, avatarX + avatarSize + 10);
      }
      if (active && style.blockMode === 'image') {
        const avatarLeft = style.avatarOffsetX - 12;
        const avatarTop = chipHeight / 2 + style.avatarOffsetY - style.avatarSize / 2;
        const avatarBottom = chipHeight / 2 + style.avatarOffsetY + style.avatarSize / 2;
        const frameLeft = item.showAvatar ? Math.min(-3, avatarLeft - 3) : -3;
        const frameTop = item.showAvatar ? Math.min(-3, avatarTop - 3) : -3;
        const frameBottom = item.showAvatar ? Math.min(-3, chipHeight - avatarBottom - 3) : -3;
        roundedRect(ctx, chipX + frameLeft, chipY + frameTop, chipWidth - frameLeft + 3, chipHeight - frameTop - frameBottom, 5);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.96)';
        ctx.stroke();
      }
      ctx.fillStyle = style.textColor || '#fff';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 6;
      const parts = comboTextParts(item.displayText || item.step.label, Boolean(item.iconId), role.iconMappings ?? style.iconMappings);
      if (style.blockMode === 'image') {
        drawComboTextParts(ctx, parts, textX, chipY + chipHeight / 2, Math.max(24, chipWidth - (textX - chipX) - 14), Math.max(12, Math.round(style.fontSize)), imageCache);
      } else {
        drawComboTextParts(ctx, parts, textX, chipY + chipHeight / 2, Math.max(24, chipWidth - (textX - chipX) - 12), Math.max(12, Math.round(style.fontSize)), imageCache);
      }
      ctx.shadowBlur = 0;
      ctx.restore();
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
export function VideoAxisWorkbench({ chart, comboImageStyle, overlaySettings, exportDirectory, timelineEditor, onApplyChart, onClose, onSave, getDisplaySize }: VideoAxisWorkbenchProps) {
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
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [previewTransform, setPreviewTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [stageHudVisible, setStageHudVisible] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const zoomDragRef = useRef<ZoomDragSnapshot | null>(null);
  const previewPanRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const stageHudHideTimerRef = useRef<number | null>(null);
  const imageCacheRef = useRef<ImageCache>(new Map());
  const stageShellRef = useRef<HTMLDivElement | null>(null);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(() => normalizeDisplaySize(currentScreenSize(overlaySettings)));
  const [inspectorPortalTarget, setInspectorPortalTarget] = useState<HTMLElement | null>(null);
  const [stageShellSize, setStageShellSize] = useState({ width: 0, height: 0 });

  const chartTotal = chartExtentMs(chart);
  const renderTotal = Math.max(chartTotal, videoMeta.durationMs || 0, ...keyframes.map((frame) => frame.timeMs + 600));
  const zoomTrackTotal = Math.max(renderTotal, videoMeta.durationMs || 0, chartTotal);
  const frameAspect = `${Math.max(1, videoMeta.width)} / ${Math.max(1, videoMeta.height)}`;
  const stageFrameSize = useMemo(() => {
    if (!stageShellSize.width || !stageShellSize.height) return null;
    const aspect = Math.max(1, videoMeta.width) / Math.max(1, videoMeta.height);
    let width = stageShellSize.width;
    let height = width / aspect;
    if (height > stageShellSize.height) {
      height = stageShellSize.height;
      width = height * aspect;
    }
    return { width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(height)) };
  }, [stageShellSize.height, stageShellSize.width, videoMeta.height, videoMeta.width]);
  const stageFrameStyle = { aspectRatio: frameAspect, ...(stageFrameSize ? { width: `${stageFrameSize.width}px`, height: `${stageFrameSize.height}px` } : {}) } as CSSProperties;
  const screenSize = displaySize ?? currentScreenSize(overlaySettings);
  const layerBounds = overlayBoundsToVideoPercent(overlaySettings, screenSize);
  const layerSourceBounds = overlaySourceBounds(overlaySettings);
  const sortedKeyframes = useMemo(() => [...keyframes].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id)), [keyframes]);
  const previewTransformStyle = {
    transform: `translate(${previewTransform.x}px, ${previewTransform.y}px) scale(${previewTransform.scale})`
  } as CSSProperties;

  function clearStageHudHideTimer() {
    if (stageHudHideTimerRef.current !== null) {
      window.clearTimeout(stageHudHideTimerRef.current);
      stageHudHideTimerRef.current = null;
    }
  }

  function revealStageHud() {
    clearStageHudHideTimer();
    setStageHudVisible(true);
  }

  function scheduleStageHudHide() {
    clearStageHudHideTimer();
    stageHudHideTimerRef.current = window.setTimeout(() => setStageHudVisible(false), 2000);
  }

  function clampPreviewTransform(next: { scale: number; x: number; y: number }) {
    const scale = clamp(next.scale, 1, 4);
    if (scale <= 1 || !stageFrameSize) return { scale: 1, x: 0, y: 0 };
    const maxX = Math.max(0, (stageFrameSize.width * (scale - 1)) / 2);
    const maxY = Math.max(0, (stageFrameSize.height * (scale - 1)) / 2);
    return { scale, x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
  }

  function handlePreviewWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!stageFrameSize) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointX = event.clientX - rect.left - rect.width / 2;
    const pointY = event.clientY - rect.top - rect.height / 2;
    setPreviewTransform((current) => {
      const nextScale = clamp(current.scale * (event.deltaY < 0 ? 1.12 : 0.88), 1, 4);
      if (nextScale <= 1.01) return { scale: 1, x: 0, y: 0 };
      const ratio = nextScale / Math.max(1, current.scale);
      return clampPreviewTransform({
        scale: nextScale,
        x: pointX - (pointX - current.x) * ratio,
        y: pointY - (pointY - current.y) * ratio
      });
    });
  }

  function beginPreviewPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (previewTransform.scale <= 1) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    previewPanRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: previewTransform.x, originY: previewTransform.y };
  }

  function movePreviewPan(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = previewPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    setPreviewTransform((current) => clampPreviewTransform({
      scale: current.scale,
      x: pan.originX + event.clientX - pan.startX,
      y: pan.originY + event.clientY - pan.startY
    }));
  }

  function endPreviewPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (previewPanRef.current?.pointerId === event.pointerId) previewPanRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  useEffect(() => {
    document.body.classList.add('video-workbench-open');
    return () => document.body.classList.remove('video-workbench-open');
  }, []);

  useEffect(() => () => clearStageHudHideTimer(), []);

  useEffect(() => {
    let disposed = false;
    const fallback = currentScreenSize(overlaySettings);
    setDisplaySize((current) => current ?? fallback);
    void getDisplaySize?.().then((next) => {
      if (disposed) return;
      setDisplaySize(normalizeDisplaySize(next) ?? fallback);
    }).catch(() => {
      if (!disposed) setDisplaySize(fallback);
    });
    return () => {
      disposed = true;
    };
  }, [getDisplaySize, overlaySettings.x, overlaySettings.y, overlaySettings.width, overlaySettings.height]);

  useEffect(() => {
    const node = stageShellRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      const next = { width: Math.max(0, rect.width), height: Math.max(0, rect.height) };
      setStageShellSize((current) => current.width === next.width && current.height === next.height ? current : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    setPreviewTransform({ scale: 1, x: 0, y: 0 });
    previewPanRef.current = null;
  }, [videoUrl]);

  useEffect(() => {
    setPreviewTransform((current) => clampPreviewTransform(current));
  }, [stageFrameSize?.height, stageFrameSize?.width]);

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
      setImportMessage(`宸插紩鐢?${meta.name}锛?{meta.width}x${meta.height}锛?{formatMs(meta.durationMs)}`);
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

  function beginZoomDrag(event: ReactPointerEvent<HTMLButtonElement>, frameId: string, trackRenderTotal = zoomTrackTotal) {
    event.preventDefault();
    event.stopPropagation();
    const track = event.currentTarget.closest('.timeline-zoom-frame-track') as HTMLElement | null;
    const markerIndex = sortedKeyframes.findIndex((frame) => frame.id === frameId);
    if (!track || markerIndex < 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    zoomDragRef.current = {
      markerId: frameId,
      markerIndex,
      startX: event.clientX,
      trackWidth: Math.max(1, track.getBoundingClientRect().width),
      renderTotal: trackRenderTotal,
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
    setExportStatus({ state: 'running', message: '姝ｅ湪瀵煎嚭 WebM...', progress: 0 });
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
        drawComboLayerToCanvas(ctx, chart, comboImageStyle, timeMs, layerBounds, overlaySettings.layout, layerSourceBounds, width, height, imageCacheRef.current);
        setExportStatus({ state: 'running', message: `姝ｅ湪瀵煎嚭 WebM ${formatMs(timeMs)} / ${formatMs(duration * 1000)}`, progress: clamp(timeMs / Math.max(1, duration * 1000), 0, 1) });
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
    });
    try {
      const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
      if (!blob.size) throw new Error('导出失败：没有生成视频数据');
      const filename = `${safeFileName(videoMeta.name.replace(/\.[^.]+$/, ''))}-带连段图.webm`;
      setExportStatus({ state: 'running', message: '正在转码 MP4...', progress: 0.98 });
      const saved = await exportBlob(blob, filename, exportDirectory);
      setExportStatus({ state: 'done', message: saved.path ? `导出完成：${saved.path}` : `导出完成：${(blob.size / 1024 / 1024).toFixed(1)} MB ${saved.format.toUpperCase()}`, progress: 1 });
    } catch (error) {
      setExportStatus({ state: 'error', message: error instanceof Error ? error.message : '导出失败', progress: 0 });
    }
  }

  const enhancedTimelineEditor = isValidElement(timelineEditor) ? cloneElement(timelineEditor, {
    zoomFrameTrack: {
      frames: sortedKeyframes,
      playbackMs,
      onAdd: addZoomKeyframe,
      onSeek: seekTo,
      onDelete: deleteZoomKeyframe,
      onBeginDrag: beginZoomDrag,
      onDragMove: onZoomDragMove,
      onDragEnd: endZoomDrag
    },
    inspectorPortalTarget,
    renderTotalOverride: zoomTrackTotal
  } as Record<string, unknown>) : timelineEditor;

  const panel = (
    <div className="video-workbench" role="dialog" aria-modal="true" aria-label="视频辅助轴编辑">
      <input ref={fileInputRef} className="file-input" type="file" accept="video/*" onChange={(event) => void importVideo(event.target.files?.[0] ?? null)} />
      <div className={`video-workbench-main ${timelineCollapsed ? 'timeline-collapsed' : ''}`}>
        <section className="video-preview-panel">
          <div className="video-info-row">
            <div><FileVideo size={17} /><strong>{videoMeta.name}</strong><span>{videoMeta.width}x{videoMeta.height}</span><span>{formatMs(videoMeta.durationMs || renderTotal)}</span></div>
            <span>{importMessage}</span>
          </div>
          <div ref={stageShellRef} className="video-stage-shell">
            <div
              className={`video-stage-frame ${previewTransform.scale > 1 ? 'is-zoomed' : ''}`}
              style={stageFrameStyle}
              onMouseEnter={revealStageHud}
              onMouseMove={revealStageHud}
              onMouseLeave={scheduleStageHudHide}
              onWheel={handlePreviewWheel}
              onPointerDown={beginPreviewPan}
              onPointerMove={movePreviewPan}
              onPointerUp={endPreviewPan}
              onPointerCancel={endPreviewPan}
            >
              <div className="video-stage-content" style={previewTransformStyle}>
                {videoUrl ? <video ref={videoRef} src={videoUrl} playsInline onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} /> : <div className="video-empty"><FileVideo size={38} /><strong>导入实战视频</strong><span>视频不会写入项目文件，只在当前会话中引用。</span></div>}
                <div className="video-combo-layer-box synced" style={{ left: `${layerBounds.x}%`, top: `${layerBounds.y}%`, width: `${layerBounds.width}%`, height: `${layerBounds.height}%` }} title="位置和尺寸来自连段图外观设置">
                  <VideoComboLayer chart={chart} style={comboImageStyle} timeMs={playbackMs} layout={overlaySettings.layout} bounds={layerSourceBounds} />
                </div>
              </div>
              <div className={`video-stage-hud ${stageHudVisible ? 'visible' : ''}`} onPointerDown={(event) => event.stopPropagation()} onMouseEnter={revealStageHud}>
                <div className="video-stage-hud-top">
                  {(exportStatus.state !== 'idle' || exportStatus.progress > 0) && <div className="video-export-status floating">
                    <div><span style={{ width: `${Math.round(exportStatus.progress * 100)}%` }} /></div>
                    <strong className={exportStatus.state}>{exportStatus.message}</strong>
                  </div>}
                </div>
                <div className="video-stage-hud-bottom">
                  <div className="video-preview-actions compact">
                    <button className="primary icon-button" title={isPlaying ? '暂停' : '播放'} onClick={togglePlay} disabled={!videoUrl}>{isPlaying ? <Pause size={17} /> : <Play size={17} />}</button>
                    <button className="icon-button" title="重置预览缩放" onClick={() => setPreviewTransform({ scale: 1, x: 0, y: 0 })} disabled={previewTransform.scale <= 1}>1x</button>
                    <span>{Math.round(previewTransform.scale * 100)}%</span>
                  </div>
                  <div className="video-workbench-actions compact">
                    <div className="video-file-menu">
                      <button className="icon-button" title="文件" onClick={() => setFileMenuOpen((open) => !open)}><FileIcon size={18} /></button>
                      {fileMenuOpen && <div className="video-file-menu-panel">
                        <button onClick={() => { setFileMenuOpen(false); fileInputRef.current?.click(); }}><Upload size={16} />导入视频</button>
                        <button onClick={() => { setFileMenuOpen(false); void togglePlay(); }} disabled={!videoUrl}>{isPlaying ? <Pause size={16} /> : <Play size={16} />}{isPlaying ? '暂停' : '播放'}</button>
                        <button onClick={() => { setFileMenuOpen(false); fitChartToVideoDuration(); }} disabled={!videoMeta.durationMs}>匹配视频长度</button>
                        <button onClick={() => { setFileMenuOpen(false); onSave(); }}><Save size={16} />保存轴</button>
                        <button onClick={() => { setFileMenuOpen(false); void exportVideo(); }} disabled={!videoUrl || exportStatus.state === 'running'}><Download size={16} />导出视频</button>
                      </div>}
                    </div>
                    <button className="icon-button" title="关闭" onClick={onClose}><X size={18} /></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="video-transport-row">
            <span>{formatMs(playbackMs)}</span>
            <input type="range" min="0" max={Math.max(1, renderTotal)} step="16" value={Math.min(playbackMs, renderTotal)} onChange={(event) => seekTo(Number(event.target.value))} />
            <span>{formatMs(renderTotal)}</span>
          </div>
        </section>
        <aside className="video-side-inspector" ref={setInspectorPortalTarget} />

        <section className={`video-edit-panel ${timelineCollapsed ? 'collapsed' : ''}`}>
          <button className="video-timeline-toggle icon-button" title={timelineCollapsed ? '展开时间轴' : '收起时间轴'} onClick={() => setTimelineCollapsed((collapsed) => !collapsed)}>
            {timelineCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {!timelineCollapsed && <div className="video-timeline-compact">
            {enhancedTimelineEditor}
          </div>}
        </section>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
