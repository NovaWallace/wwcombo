import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, WheelEvent as ReactWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock3, Download, FileVideo, PanelBottomClose, PanelBottomOpen, Pause, Play, Save, Scissors, Upload, Volume2, VolumeX, X } from 'lucide-react';
import type { CharacterSlot, ComboChart, ComboImageStyle, ComboPeriod, ComboStep } from '../combo-core';
import {
  chartToComboImageItems,
  capsuleEdgeSourceRange,
  comboImageDisplayIndexForStep,
  comboImageItemSizeForDisplayItem,
  comboImageItemContainsStep,
  comboTextParts,
  defaultComboContentLabelForMoveId,
  effectiveCapsuleImageFields,
  effectiveIconMappings,
  normalizeRectPercent,
  visibleComboImageItems
} from './combo-image/comboImage';
import { localizeEnglish, useI18n } from './i18n';
import type { AppLanguage } from './i18n';
import { localizedMovePrompt } from './moveLabels';
import { NumericDraftInput } from './NumericDraftInput';
import { buildRhythmCrowdedGroups, rhythmNoteHeight, rhythmNoteOpacity, rhythmNoteTop, visibleRhythmCrowdedGroups } from './rhythmCrowding';
import { shortcutMatches } from './shortcutSettings';
import type { ShortcutSettings } from './shortcutSettings';

type ComboLayout = 'horizontal' | 'vertical' | 'waterfall';
type LinearComboLayout = Exclude<ComboLayout, 'waterfall'>;
type RhythmUiSettings = { width: number; height: number; scale: number; laneGap: number; roleSpacing: number; fallSpeed: number; judgeLineOffset: number; ringStartScale: number; ringEndScale: number; ringOffsetX: number; ringOffsetY: number; ringDurationMs: number; feedbackX?: number; feedbackY?: number };
type VideoLayerBounds = { x: number; y: number; width: number; height: number };
type VideoLayerTransform = { offsetX: number; offsetY: number; scale: number; cropLeft: number; cropTop: number; cropRight: number; cropBottom: number };
type VideoLayerMoveDrag = { pointerId: number; startX: number; startY: number; origin: VideoLayerTransform; moved: boolean; historyCaptured: boolean };
type VideoLayerScaleDrag = { pointerId: number; startX: number; origin: VideoLayerTransform; moved: boolean; historyCaptured: boolean };
type VideoLayerCropEdge = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
type VideoLayerCropDrag = { pointerId: number; edge: VideoLayerCropEdge; startX: number; startY: number; origin: VideoLayerTransform; moved: boolean; historyCaptured: boolean };
type VideoTrimDrag = { pointerId: number; edge: 'start' | 'end'; trackLeft: number; trackWidth: number };
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

type WorkbenchHistorySnapshot = {
  chart: ComboChart;
  contentLabels: Record<string, string>;
  keyframes: ZoomKeyframe[];
  playbackMs: number;
  timelineHeight: number;
  timelineZoom: number;
  timelineCollapsed: boolean;
  layerTransform: VideoLayerTransform;
};

type TimelinePanelDragSnapshot = {
  pointerId: number;
  startX: number;
  startY: number;
  startHeight: number;
  startZoom: number;
  moved: boolean;
  historyCaptured: boolean;
  axis: 'horizontal' | 'vertical' | null;
};

type VideoWorkbenchDesktopBridge = Pick<NonNullable<Window['trainerDesktop']>, 'pickVideoFile' | 'exportVideoWithOverlay' | 'cancelVideoExport' | 'onVideoExportProgress'>;

type VideoAxisWorkbenchProps = {
  open: boolean;
  desktop?: VideoWorkbenchDesktopBridge | null;
  chart: ComboChart;
  comboImageStyle: ComboImageStyle;
  timelineContentLabels: Record<string, string>;
  overlaySettings: OverlaySettings;
  rhythmUiSettings: RhythmUiSettings;
  shortcutSettings: ShortcutSettings;
  exportDirectory?: string;
  ensureExportDirectory?: () => Promise<string | null>;
  timelineEditor: ReactNode;
  onApplyChart: (chart: ComboChart) => void;
  onApplyContentLabels: (contentLabels: Record<string, string>) => void;
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
const MIN_VIDEO_TIMELINE_HEIGHT = 88;
const MAX_VIDEO_TIMELINE_HEIGHT_RATIO = 0.52;
const TIMELINE_TOGGLE_DRAG_THRESHOLD = 4;
const MIN_VIDEO_TIMELINE_LANE_HEIGHT = 24;
const MAX_VIDEO_TIMELINE_LANE_HEIGHT = 64;
const VIDEO_TIMELINE_LANE_HEIGHT_STEP = 4;
const MAX_WORKBENCH_HISTORY = 80;
const VIDEO_PLAYBACK_RATES = [1, 0.5, 0.2] as const;
const MIN_VIDEO_TRIM_DURATION_MS = 100;
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

function comboTrackMetrics(items: ReturnType<typeof chartToComboImageItems>, layout: LinearComboLayout, style: ComboImageStyle): Array<{ extent: number; start: number; center: number }> {
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

function comboTrackOffset(items: ReturnType<typeof chartToComboImageItems>, activeIndex: number, layout: LinearComboLayout, bounds: { width: number; height: number }, style: ComboImageStyle): number {
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

function capsuleImageStyle(style: ComboImageStyle, width: number, height: number, roleStyle?: ComboImageStyle['roleStyles'][CharacterSlot]): CSSProperties {
  const capsule = effectiveCapsuleImageFields(style, roleStyle);
  if (style.blockMode !== 'image' || !capsule.image) return {};
  return {
    backgroundImage: 'none',
    borderColor: 'transparent',
    ...capsuleBackgroundVars(style, width, height, roleStyle)
  } as CSSProperties;
}

function comboItemOpacity(metric: { center: number } | undefined, activeMetric: { center: number } | undefined, trackOffset: number, layout: LinearComboLayout, bounds: { width: number; height: number }, style: ComboImageStyle): number {
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
  return <div className="capsule-bg" aria-hidden="true"><div className="capsule-bg-edge left top" /><div className="capsule-bg-edge left bottom" /><div className="capsule-bg-edge middle top" /><div className="capsule-bg-edge middle bottom" /><div className="capsule-bg-edge right top" /><div className="capsule-bg-edge right bottom" /><div className="capsule-bg-body"><div className="capsule-bg-piece left" /><div className="capsule-bg-piece middle" /><div className="capsule-bg-piece right" /></div></div>;
}

function ComboInlineContent({ parts, className, hideIconAlt = false }: { parts: ReturnType<typeof comboTextParts>; className: string; hideIconAlt?: boolean }) {
  return <strong className={className}>{parts.map((part, index) => part.kind === 'icon' ? <span key={`${part.iconId}-${index}`} className="combo-inline-icon-mark" style={{ '--icon-scale': part.iconScale } as CSSProperties}><img className="combo-inline-icon" src={part.src} alt={hideIconAlt ? '' : part.label} title={part.label} /></span> : <span key={`text-${index}`}>{part.value}</span>)}</strong>;
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

function displayMoveLabel(step: ComboStep): string {
  if (step.moveId === 'switch_1') return '1';
  if (step.moveId === 'switch_2') return '2';
  if (step.moveId === 'switch_3') return '3';
  return step.label.replace(/^切人(?=\d)/, '');
}

function shouldShowPromptForStep(step: ComboStep | null | undefined): step is ComboStep {
  return Boolean(step && !step.free && (step.moveId === 'empty_action' || step.moveId === 'basic_attack' || (!step.independent && step.advancesStep !== false)));
}

function promptTextForStep(step: ComboStep | null | undefined, style: ComboImageStyle, language: AppLanguage): string {
  if (!step) return '';
  if (step.note?.trim()) return step.note.trim();
  const contentText = style.contentLabels[step.id]?.trim() || defaultComboContentLabelForMoveId(step.moveId);
  return localizedMovePrompt(step.moveId, displayMoveLabel(step), contentText, language);
}

function currentPeriodLabel(chart: ComboChart, timeMs: number, language: AppLanguage): string {
  if (!chart.periods?.length) return '';
  const period = chart.periods
    .filter((candidate) => candidate.kind !== 'free_fire' && timeMs >= candidate.startMs && timeMs <= candidate.endMs)
    .sort((left, right) => left.startMs - right.startMs)[0];
  if (!period) return '';
  return language === 'zh-CN' ? `当前：${period.label}` : localizeEnglish(`Current: ${period.label}`, language);
}

function chooseMediaRecorderMime(): string {
  return VIDEO_MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? '';
}

function exportVideoBitrate(width: number, height: number, frameRate: number): number {
  const bitsPerPixel = 0.16;
  return Math.round(clamp(width * height * frameRate * bitsPerPixel, 20_000_000, 100_000_000));
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

type VideoText = (chinese: string, english: string) => string;

function readVideoMetadata(name: string, url: string, text: VideoText): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
    };
    video.onloadedmetadata = () => {
      const meta = {
        width: video.videoWidth || 1920,
        height: video.videoHeight || 1080,
        durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0,
        name
      };
      cleanup();
      resolve(meta);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error(text('视频元数据读取失败', 'Unable to read video metadata')));
    };
    video.src = url;
    video.load();
  });
}

function videoMediaError(video: HTMLVideoElement, text: VideoText): string | null {
  switch (video.error?.code) {
    case 1:
      return text('视频加载已中止', 'Video loading was aborted');
    case 2:
      return text('视频读取时发生网络或本地文件访问错误', 'A network or local file access error occurred while reading the video');
    case 3:
      return text('视频无法解码，请确认编码格式受系统支持', 'The video could not be decoded. Check that the codec is supported by the system');
    case 4:
      return text('视频格式或编码不受支持', 'The video format or codec is not supported');
    default:
      return video.error ? text('视频播放失败', 'Unable to play video') : null;
  }
}

function waitForVideoReady(video: HTMLVideoElement, text: VideoText, timeoutMs = 5000): Promise<void> {
  if (video.error) return Promise.reject(new Error(videoMediaError(video, text) ?? text('视频播放失败', 'Unable to play video')));
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(videoMediaError(video, text) ?? text('视频播放失败', 'Unable to play video')));
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(text('视频加载超时，请重新导入后再试', 'Video loading timed out. Re-import the video and try again')));
    }, timeoutMs);
    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('canplay', onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
    if (video.networkState === HTMLMediaElement.NETWORK_EMPTY) video.load();
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
  chart.steps.forEach((step) => {
    const slot = (step.characterSlot ?? 1) as CharacterSlot;
    const display = rhythmStepText(step, style);
    comboTextParts(display.text, display.useIcons, effectiveIconMappings(style, slot)).forEach((part) => {
      if (part.kind === 'icon') sources.add(part.src);
    });
  });
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
  const rawDestLeft = Math.max(0, leftLine * heightScale);
  const rawDestRight = Math.max(0, (cropWidth - rightLine) * heightScale);
  const minMiddle = Math.min(width, Math.max(24, height * 0.42));
  const availableForEdges = Math.max(0, width - minMiddle);
  const edgeScale = rawDestLeft + rawDestRight > availableForEdges ? availableForEdges / (rawDestLeft + rawDestRight) : 1;
  const destLeft = Math.min(width, Math.max(0, Math.round(rawDestLeft * edgeScale)));
  const destRight = Math.max(0, Math.min(width - destLeft, Math.round(rawDestRight * edgeScale)));
  const destMiddle = Math.max(0, width - destLeft - destRight);
  const middleSourceWidth = Math.max(1, rightLine - leftLine);
  const edgeSource = capsuleEdgeSourceRange(naturalHeight, cropY, cropHeight, capsule.edge);
  const topSourceHeight = Math.max(0, cropY - edgeSource.y);
  const bottomSourceY = cropY + cropHeight;
  const bottomSourceHeight = Math.max(0, edgeSource.y + edgeSource.height - bottomSourceY);
  const previousSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (topSourceHeight > 0 && destLeft > 0) ctx.drawImage(image, cropX, edgeSource.y, leftLine, topSourceHeight, x, y - topSourceHeight * heightScale, destLeft, topSourceHeight * heightScale);
  if (topSourceHeight > 0 && destMiddle > 0) ctx.drawImage(image, cropX + leftLine, edgeSource.y, middleSourceWidth, topSourceHeight, x + destLeft, y - topSourceHeight * heightScale, destMiddle, topSourceHeight * heightScale);
  if (topSourceHeight > 0 && destRight > 0) ctx.drawImage(image, cropX + rightLine, edgeSource.y, Math.max(1, cropWidth - rightLine), topSourceHeight, x + destLeft + destMiddle, y - topSourceHeight * heightScale, destRight, topSourceHeight * heightScale);
  if (bottomSourceHeight > 0 && destLeft > 0) ctx.drawImage(image, cropX, bottomSourceY, leftLine, bottomSourceHeight, x, y + height, destLeft, bottomSourceHeight * heightScale);
  if (bottomSourceHeight > 0 && destMiddle > 0) ctx.drawImage(image, cropX + leftLine, bottomSourceY, middleSourceWidth, bottomSourceHeight, x + destLeft, y + height, destMiddle, bottomSourceHeight * heightScale);
  if (bottomSourceHeight > 0 && destRight > 0) ctx.drawImage(image, cropX + rightLine, bottomSourceY, Math.max(1, cropWidth - rightLine), bottomSourceHeight, x + destLeft + destMiddle, y + height, destRight, bottomSourceHeight * heightScale);
  if (destLeft > 0) ctx.drawImage(image, cropX, cropY, leftLine, cropHeight, x, y, destLeft, height);
  if (destMiddle > 0) ctx.drawImage(image, cropX + leftLine, cropY, middleSourceWidth, cropHeight, x + destLeft, y, destMiddle, height);
  if (destRight > 0) ctx.drawImage(image, cropX + rightLine, cropY, Math.max(1, cropWidth - rightLine), cropHeight, x + destLeft + destMiddle, y, destRight, height);
  ctx.imageSmoothingEnabled = previousSmoothing;
}

type ComboTextPartLayout = { left: number; width: number; iconSize?: number; markerSize?: number };

function measureComboTextParts(ctx: CanvasRenderingContext2D, parts: ReturnType<typeof comboTextParts>, fontSize: number): ComboTextPartLayout[] {
  const gap = fontSize * 0.18;
  let cursor = 0;
  return parts.map((part, index) => {
    if (part.kind === 'icon') {
      const markerSize = fontSize * 1.62 * part.iconScale;
      const iconSize = fontSize * 1.45 * part.iconScale;
      const layout = { left: cursor, width: markerSize, iconSize, markerSize };
      cursor += markerSize + (index < parts.length - 1 ? gap : 0);
      return layout;
    }
    const width = ctx.measureText(part.value).width;
    const layout = { left: cursor, width };
    cursor += width + (index < parts.length - 1 ? gap : 0);
    return layout;
  });
}

function comboTextPartsWidth(layout: ComboTextPartLayout[]): number {
  const last = layout.at(-1);
  return last ? last.left + last.width : 0;
}

function drawComboTextParts(ctx: CanvasRenderingContext2D, parts: ReturnType<typeof comboTextParts>, x: number, y: number, maxWidth: number, fontSize: number, imageCache: ImageCache, drawIconFallbackText = true) {
  const layout = measureComboTextParts(ctx, parts, fontSize);
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const partLayout = layout[index];
    const partX = x + partLayout.left;
    if (partX >= x + maxWidth) return;
    if (part.kind === 'icon') {
      const image = loadCanvasImage(part.src, imageCache);
      const markerSize = partLayout.markerSize ?? fontSize * 1.62 * part.iconScale;
      const size = partLayout.iconSize ?? fontSize * 1.45 * part.iconScale;
      if (image) {
        ctx.drawImage(image, partX + (markerSize - size) / 2, y - size / 2, size, size);
        continue;
      }
      if (drawIconFallbackText) ctx.fillText(part.label, partX, y, Math.max(1, x + maxWidth - partX));
      continue;
    }
    ctx.fillText(part.value, partX, y, Math.max(1, x + maxWidth - partX));
  }
}


function drawVideoPeriodLabel(ctx: CanvasRenderingContext2D, label: string, clipX: number, clipY: number, clipWidth: number, clipHeight: number) {
  if (!label || clipWidth < 20 || clipHeight < 14) return;
  const fontSize = Math.max(10, Math.min(18, Math.round(clipHeight * 0.22)));
  const paddingX = Math.max(4, Math.round(fontSize * 0.62));
  const paddingY = Math.max(2, Math.round(fontSize * 0.24));
  const boxHeight = fontSize + paddingY * 2;
  const labelX = Math.max(4, clipX);
  const labelY = Math.max(4, clipY - boxHeight - 6);
  const maxWidth = Math.max(8, Math.min(clipWidth, ctx.canvas.width - labelX - 4));
  ctx.save();
  ctx.font = `900 ${fontSize}px Microsoft YaHei, sans-serif`;
  ctx.textBaseline = 'middle';
  const textWidth = Math.min(Math.max(1, maxWidth - paddingX * 2), ctx.measureText(label).width);
  const boxWidth = Math.min(maxWidth, textWidth + paddingX * 2);
  roundedRect(ctx, labelX, labelY, boxWidth, boxHeight, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.58)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillText(label, labelX + paddingX, labelY + boxHeight / 2, Math.max(1, maxWidth - paddingX * 2));
  ctx.restore();
}
function drawRhythmLayerToCanvas(ctx: CanvasRenderingContext2D, chart: ComboChart, style: ComboImageStyle, timeMs: number, contentBounds: VideoLayerBounds, clipBounds: VideoLayerBounds, settings: RhythmUiSettings, sourceBounds: { width: number; height: number }, canvasWidth: number, canvasHeight: number, imageCache: ImageCache) {
  const clipX = (clipBounds.x / 100) * canvasWidth;
  const clipY = (clipBounds.y / 100) * canvasHeight;
  const clipWidth = (clipBounds.width / 100) * canvasWidth;
  const clipHeight = (clipBounds.height / 100) * canvasHeight;
  const contentX = (contentBounds.x / 100) * canvasWidth;
  const contentY = (contentBounds.y / 100) * canvasHeight;
  const contentWidth = (contentBounds.width / 100) * canvasWidth;
  const contentHeight = (contentBounds.height / 100) * canvasHeight;
  const rhythmScale = clamp(settings.scale, 0.3, 3);
  const sourceWidth = Math.max(1, sourceBounds.width);
  const sourceHeight = Math.max(1, sourceBounds.height);
  const stageWidth = Math.max(1, sourceWidth / rhythmScale);
  const stageHeight = Math.max(320, sourceHeight / rhythmScale);
  const fitScaleX = contentWidth / sourceWidth;
  const fitScaleY = contentHeight / sourceHeight;
  const originX = contentX;
  const originY = contentY;
  const judgeY = clamp(stageHeight - settings.judgeLineOffset, 120, stageHeight - 90);
  const ordered = [...chart.steps].sort((a, b) => a.startMin - b.startMin || (a.characterSlot ?? 1) - (b.characterSlot ?? 1) || a.id.localeCompare(b.id));
  const activeSlot = rhythmActiveSlotAt(ordered, timeMs);
  const notePartsByStepId = new Map(ordered.map((step) => {
    const slot = (step.characterSlot ?? 1) as CharacterSlot;
    const display = rhythmStepText(step, style);
    return [step.id, comboTextParts(display.text, display.useIcons, effectiveIconMappings(style, slot)).filter((part) => part.kind === 'icon')] as const;
  }));
  const crowdedGroups = buildRhythmCrowdedGroups(ordered.flatMap((step) => {
    const parts = notePartsByStepId.get(step.id) ?? [];
    return parts.length ? [{ step, height: rhythmNoteHeight(parts.length) }] : [];
  }), settings.fallSpeed);
  const visibleCrowdedGroups = visibleRhythmCrowdedGroups(crowdedGroups, timeMs, judgeY, stageHeight, settings.fallSpeed);
  const laneGap = settings.laneGap;
  const laneWidth = Math.min(96, Math.max(44, (stageWidth - 20 - laneGap * 2) / 3));
  const laneSpan = Math.min(stageWidth - 20, settings.roleSpacing * 2 + laneWidth);
  const laneStart = (stageWidth - laneSpan) / 2;
  const laneStep = (laneSpan - laneWidth) / 2;
  const avatarHeight = 78;
  ctx.save();
  ctx.beginPath();
  ctx.rect(clipX, clipY, clipWidth, clipHeight);
  ctx.clip();
  ctx.translate(originX, originY);
  ctx.scale(fitScaleX * rhythmScale, fitScaleY * rhythmScale);
  CHARACTER_SLOTS.forEach((slot, index) => {
    const laneX = laneStart + index * laneStep;
    if (activeSlot === slot) {
      const gradient = ctx.createLinearGradient(0, judgeY, 0, 0);
      gradient.addColorStop(0, 'rgba(255,224,55,.34)');
      gradient.addColorStop(1, 'rgba(255,224,55,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(laneX + 3, Math.max(0, judgeY * .24), laneWidth - 6, judgeY * .76);
    }
    ordered.filter((step) => (step.characterSlot ?? 1) === slot).forEach((step) => {
      const fallingTop = judgeY - (step.startMin - timeMs) * settings.fallSpeed;
      if (fallingTop < -100 || fallingTop > stageHeight + 100) return;
      const parts = notePartsByStepId.get(step.id) ?? [];
      const noteHeight = rhythmNoteHeight(parts.length);
      const active = timeMs >= step.startMin && timeMs <= step.startMin + step.durationMax;
      const top = rhythmNoteTop(step, noteHeight, timeMs, judgeY, settings.fallSpeed);
      const noteWidth = Math.min(78, laneWidth - 4);
      const noteX = laneX + (laneWidth - noteWidth) / 2;
      ctx.save();
      ctx.globalAlpha = rhythmNoteOpacity(step, timeMs);
      if (active) {
        ctx.fillStyle = 'rgba(255,224,55,.92)';
        roundedRect(ctx, noteX, top, noteWidth, noteHeight, 4);
        ctx.fill();
      }
      ctx.fillStyle = '#fff';
      ctx.font = '900 20px Microsoft YaHei, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      drawComboTextParts(ctx, parts, noteX + 4, top + noteHeight / 2, noteWidth - 8, 20, imageCache, false);
      ctx.restore();
    });
  });
  ctx.fillStyle = '#d50000';
  ctx.fillRect(0, judgeY, stageWidth, 5);
  CHARACTER_SLOTS.forEach((slot, index) => {
    const role = style.roleStyles[slot];
    const laneX = laneStart + index * laneStep;
    const avatarSize = 58;
    const avatarX = laneX + (laneWidth - avatarSize) / 2;
    const avatarY = stageHeight - avatarHeight + (avatarHeight - avatarSize) / 2;
    const avatar = loadCanvasImage(role.avatar, imageCache);
    if (avatar) drawCroppedCircleImage(ctx, avatar, avatarX, avatarY, avatarSize, role.avatarCrop);
    else {
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '900 20px Microsoft YaHei, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(slot), avatarX + avatarSize / 2, avatarY + avatarSize / 2);
    }
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = activeSlot === slot ? '#ffe037' : 'rgba(255,255,255,.8)';
    ctx.lineWidth = activeSlot === slot ? 3 : 2;
    ctx.stroke();
  });
  CHARACTER_SLOTS.forEach((slot, slotIndex) => {
    const crowdedPrompts = visibleCrowdedGroups
      .filter((group) => group.characterSlot === slot)
      .map((group) => ({
        group,
        parts: [...group.entries].reverse().flatMap((entry) => notePartsByStepId.get(entry.step.id) ?? [])
      }))
      .filter((prompt) => prompt.parts.length > 1);
    if (!crowdedPrompts.length) return;
    const laneX = laneStart + slotIndex * laneStep;
    const avatarSize = 58;
    const avatarX = laneX + (laneWidth - avatarSize) / 2;
    const avatarY = stageHeight - avatarHeight + (avatarHeight - avatarSize) / 2;
    const panelWidth = 48;
    const rowHeight = 40;
    crowdedPrompts.forEach(({ parts }, promptIndex) => {
      const panelHeight = parts.length * rowHeight + 8;
      const panelX = avatarX + avatarSize + 4 + promptIndex * (panelWidth + 4);
      const panelY = avatarY + avatarSize - panelHeight;
      roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 5);
      ctx.fillStyle = 'rgba(4,7,9,.9)';
      ctx.fill();
      ctx.strokeStyle = style.roleStyles[slot].color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '900 22px Microsoft YaHei, sans-serif';
      parts.forEach((part, index) => drawComboTextParts(ctx, [part], panelX + 6, panelY + 4 + rowHeight * index + rowHeight / 2, panelWidth - 12, 22, imageCache, false));
    });
  });
  ctx.restore();
}

function drawComboLayerToCanvas(ctx: CanvasRenderingContext2D, chart: ComboChart, style: ComboImageStyle, timeMs: number, contentBounds: VideoLayerBounds, clipBounds: VideoLayerBounds, layout: LinearComboLayout, overlayBounds: { width: number; height: number }, canvasWidth: number, canvasHeight: number, imageCache: ImageCache, language: AppLanguage) {
  const x = (contentBounds.x / 100) * canvasWidth;
  const y = (contentBounds.y / 100) * canvasHeight;
  const width = (contentBounds.width / 100) * canvasWidth;
  const height = (contentBounds.height / 100) * canvasHeight;
  const clipX = (clipBounds.x / 100) * canvasWidth;
  const clipY = (clipBounds.y / 100) * canvasHeight;
  const clipWidth = (clipBounds.width / 100) * canvasWidth;
  const clipHeight = (clipBounds.height / 100) * canvasHeight;
  const sourceWidth = Math.max(1, overlayBounds.width);
  const sourceHeight = Math.max(1, overlayBounds.height);
  const activeStepId = activeStepIdAt(chart, timeMs);
  const allItems = chartToComboImageItems(chart, style, layout, overlayBounds);
  const activeIndex = comboImageDisplayIndexForStep(allItems, activeStepId);
  const activeStep = chart.steps.find((step) => step.id === activeStepId) ?? null;
  const actionPrompt = style.prePromptEnabled && shouldShowPromptForStep(activeStep) ? promptTextForStep(activeStep, style, language) : '';
  const trackOffset = comboTrackOffset(allItems, activeIndex, layout, overlayBounds, style);
  const metrics = comboTrackMetrics(allItems, layout, style);
  const activeMetric = metrics[clamp(activeIndex, 0, Math.max(0, metrics.length - 1))];

  ctx.save();
  ctx.beginPath();
  ctx.rect(clipX, clipY, clipWidth, clipHeight);
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
      const opacity = style.prePromptEnabled && index === activeIndex + 1 ? 1 : comboItemOpacity(metrics[index], activeMetric, trackOffset, layout, overlayBounds, style);
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
      const fontSize = Math.max(12, Math.round(style.fontSize));
      const mappings = role.iconMappings ?? style.iconMappings;
      const parts = comboTextParts(item.displayText || item.step.label, Boolean(item.iconId), mappings);
      const contentWidth = comboTextPartsWidth(measureComboTextParts(ctx, parts, fontSize));
      let textX = chipX + 14;
      if (style.blockMode === 'image') {
        if (item.showAvatar) {
          textX = chipX + 48;
        } else {
          const availableWidth = Math.max(24, chipWidth - 28);
          textX = chipX + 14 + Math.max(0, availableWidth - Math.min(contentWidth, availableWidth)) / 2;
        }
      }
      if (item.showAvatar) {
        const avatarSize = Math.max(1, style.avatarSize);
        const avatarLeft = style.avatarOffsetX;
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
        if (style.blockMode !== 'image') textX = Math.max(textX, avatarX + avatarSize + 10);
      }
      if (active && style.blockMode === 'image') {
        const avatarLeft = style.avatarOffsetX;
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
      const activeMergedPart = item.mergedParts?.find((part) => part.stepId === activeStepId);
      if (activeMergedPart && item.mergedParts) {
        const contentLeft = textX;
        const contentRight = chipX + chipWidth - 14;
        let mergedCursor = contentLeft;
        let activePartLeft = contentLeft;
        let activePartWidth = 0;
        let activeIconBounds: { left: number; width: number; highlightSize: number }[] = [];

        item.mergedParts.forEach((mergedPart, mergedIndex) => {
          const mergedTextParts = comboTextParts(mergedPart.displayText, Boolean(mergedPart.iconId), mappings);
          const mergedTextLayout = measureComboTextParts(ctx, mergedTextParts, fontSize);
          const mergedPartWidth = comboTextPartsWidth(mergedTextLayout);
          if (mergedPart.stepId === activeStepId) {
            activePartLeft = mergedCursor;
            activePartWidth = mergedPartWidth;
            activeIconBounds = mergedTextParts.flatMap((part, index) => {
              if (part.kind !== 'icon') return [];
              const markerSize = mergedTextLayout[index].markerSize ?? fontSize * 1.62 * part.iconScale;
              return [{ left: mergedCursor + mergedTextLayout[index].left, width: markerSize, highlightSize: markerSize }];
            });
          }
          mergedCursor += mergedPartWidth + (mergedIndex < item.mergedParts!.length - 1 ? fontSize * 0.18 : 0);
        });

        const clampedIcons = activeIconBounds.map((bounds) => {
          const left = clamp(bounds.left, contentLeft, contentRight);
          const right = clamp(bounds.left + bounds.width, contentLeft, contentRight);
          return { ...bounds, left, width: Math.max(0, right - left) };
        }).filter((bounds) => bounds.width > 0);
        const activeVisualLeft = clampedIcons.length ? clampedIcons[0].left : clamp(activePartLeft, contentLeft, contentRight);
        const activeVisualRight = clampedIcons.length
          ? clampedIcons[clampedIcons.length - 1].left + clampedIcons[clampedIcons.length - 1].width
          : clamp(activePartLeft + activePartWidth, contentLeft, contentRight);
        const highlightCenter = (activeVisualLeft + activeVisualRight) / 2;

        if (clampedIcons.length) {
          clampedIcons.forEach((bounds) => {
            const center = bounds.left + bounds.width / 2;
            const highlightSize = Math.max(18, bounds.highlightSize);
            roundedRect(ctx, center - highlightSize / 2, chipY + chipHeight / 2 - highlightSize / 2, highlightSize, highlightSize, Math.max(3, fontSize * 0.18));
            ctx.fillStyle = 'rgba(255,224,55,0.98)';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(0,0,0,0.92)';
            ctx.stroke();
          });
        }
        ctx.beginPath();
        if (layout === 'vertical') {
          ctx.moveTo(highlightCenter - 10, chipY - 18);
          ctx.lineTo(highlightCenter + 10, chipY - 18);
          ctx.lineTo(highlightCenter, chipY - 3);
        } else {
          ctx.moveTo(highlightCenter - 12, chipY - 20);
          ctx.lineTo(highlightCenter + 12, chipY - 20);
          ctx.lineTo(highlightCenter, chipY - 3);
        }
        ctx.closePath();
        ctx.fillStyle = '#ffe037';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#050505';
        ctx.stroke();
      }
      if (actionPrompt && comboImageItemContainsStep(item, activeStepId)) {
        const promptFontSize = Math.max(12, Math.round(style.fontSize * 0.9));
        ctx.save();
        ctx.font = `900 ${promptFontSize}px ${style.fontFamily || 'Microsoft YaHei, sans-serif'}`;
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(0,0,0,0.92)';
        ctx.shadowBlur = 6;
        if (layout === 'vertical') {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(actionPrompt, chipX + chipWidth + 26, chipY + chipHeight / 2, Math.max(40, sourceWidth - chipX - chipWidth - 30));
        } else {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(actionPrompt, chipX + chipWidth / 2, Math.max(promptFontSize, chipY - 28), Math.max(40, chipWidth * 1.4));
        }
        ctx.restore();
      }
      ctx.fillStyle = style.textColor || '#fff';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 6;
      if (style.blockMode === 'image') {
        drawComboTextParts(ctx, parts, textX, chipY + chipHeight / 2, Math.max(24, chipWidth - (textX - chipX) - 14), fontSize, imageCache);
      } else {
        drawComboTextParts(ctx, parts, textX, chipY + chipHeight / 2, Math.max(24, chipWidth - (textX - chipX) - 12), fontSize, imageCache);
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    cursor += (layout === 'vertical' ? chipHeight : chipWidth) + style.capsuleGap;
  });
  ctx.restore();
  const periodLabel = currentPeriodLabel(chart, timeMs, language);
  drawVideoPeriodLabel(ctx, periodLabel, clipX, clipY, clipWidth, clipHeight);
}

function VideoComboLayer({ chart, style, timeMs, layout, bounds }: { chart: ComboChart; style: ComboImageStyle; timeMs: number; layout: LinearComboLayout; bounds: { width: number; height: number } }) {
  const { language, text } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostSize, setHostSize] = useState(() => bounds);
  const activeStepId = activeStepIdAt(chart, timeMs);
  const allItems = chartToComboImageItems(chart, style, layout, bounds);
  const activeIndex = comboImageDisplayIndexForStep(allItems, activeStepId);
  const activeStep = chart.steps.find((step) => step.id === activeStepId) ?? null;
  const promptText = style.prePromptEnabled && shouldShowPromptForStep(activeStep) ? promptTextForStep(activeStep, style, language) : '';
  const visibleItems = visibleComboImageItems(allItems, activeIndex, layout, bounds, style);
  const trackOffset = comboTrackOffset(allItems, activeIndex, layout, bounds, style);
  const metrics = comboTrackMetrics(allItems, layout, style);
  const activeMetric = metrics[clamp(activeIndex, 0, Math.max(0, metrics.length - 1))];

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
        {visibleItems.length ? (
          <div className="combo-preview-track" style={{ gap: style.capsuleGap, transform: layout === 'vertical' ? `translateY(${trackOffset}px)` : `translateX(${trackOffset}px)` }}>
            {visibleItems.map((item, displayIndex) => {
              const role = style.roleStyles[item.characterSlot];
              const size = comboImageItemSizeForDisplayItem(style, item, role);
              const mappings = effectiveIconMappings(style, role);
              const parts = comboTextParts(item.displayText, Boolean(item.iconId), mappings);
              const blockColor = style.blockMode === 'capsule' ? role.color : 'transparent';
              const blockImageStyle = capsuleImageStyle(style, size.width, size.height, role);
              const avatarLeft = style.avatarOffsetX;
              const isActive = displayIndex === activeIndex;
              const isNext = style.prePromptEnabled && displayIndex === activeIndex + 1;
              return (
                <div key={item.step.id} className={`combo-preview-chip ${style.blockMode === 'image' ? 'image-block' : ''} ${item.showAvatar ? 'with-avatar' : ''} ${isActive ? 'active' : ''} ${isNext ? 'next' : ''}`} style={{ width: size.width, height: size.height, color: style.textColor, fontSize: style.fontSize, fontFamily: style.fontFamily, opacity: isNext ? 1 : comboItemOpacity(metrics[displayIndex], activeMetric, trackOffset, layout, bounds, style), backgroundColor: blockColor, borderRadius: style.blockMode === 'capsule' && style.capsuleShape === 'capsule' ? 999 : 4, '--move-color': role.color, ...activeFrameVars(item.showAvatar, style.blockMode, avatarLeft, style.avatarSize, style.avatarOffsetY, size.height), ...blockImageStyle } as CSSProperties}>
                  {style.blockMode === 'image' && <CapsuleBlockBackground />}
                  {item.showAvatar && <span className="avatar-slot preview-avatar" style={{ width: style.avatarSize, height: style.avatarSize, left: avatarLeft, transform: `translateY(calc(-50% + ${style.avatarOffsetY}px))`, ...imageCropBackground(role.avatar, role.avatarCrop) }}>{role.avatar ? null : item.characterSlot}</span>}
                  {promptText && comboImageItemContainsStep(item, activeStepId) && <div className={`combo-preview-action-prompt ${layout === 'vertical' ? 'vertical right' : 'horizontal above'}`}>{promptText}</div>}
                  <ComboItemContent item={item} parts={parts} className="combo-preview-content" mappings={mappings} activeStepId={activeStepId} />
                </div>
              );
            })}
          </div>
        ) : text('暂无连段图', 'No Combo Chart')}
      </div>
    </div>
  );
}
function rhythmStepText(step: ComboStep, style: ComboImageStyle): { text: string; useIcons: boolean } {
  const slot = step.moveId === 'switch_1' ? 1 : step.moveId === 'switch_2' ? 2 : step.moveId === 'switch_3' ? 3 : null;
  return {
    text: style.contentLabels[step.id]?.trim() || defaultComboContentLabelForMoveId(step.moveId) || displayMoveLabel(step),
    useIcons: style.convertIcons || slot !== null
  };
}

function rhythmActiveSlotAt(steps: ComboStep[], timeMs: number): CharacterSlot {
  const first = (steps[0]?.characterSlot ?? 1) as CharacterSlot;
  const latestSwitch = steps.filter((step) => step.startMin <= timeMs && /^switch_[123]$/.test(step.moveId)).sort((a, b) => b.startMin - a.startMin)[0];
  if (latestSwitch?.moveId === 'switch_2') return 2;
  if (latestSwitch?.moveId === 'switch_3') return 3;
  return latestSwitch ? 1 : first;
}

function VideoRhythmLayer({ chart, style, timeMs, settings, bounds }: { chart: ComboChart; style: ComboImageStyle; timeMs: number; settings: RhythmUiSettings; bounds: { width: number; height: number } }) {
  const { language } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostSize, setHostSize] = useState(() => bounds);
  const orderedSteps = useMemo(() => [...chart.steps].sort((a, b) => a.startMin - b.startMin || (a.characterSlot ?? 1) - (b.characterSlot ?? 1) || a.id.localeCompare(b.id)), [chart]);
  const scale = clamp(settings.scale || 1, 0.3, 3);
  const stageWidth = Math.max(1, bounds.width / scale);
  const stageHeight = Math.max(320, bounds.height / scale);
  const judgeY = clamp(stageHeight - settings.judgeLineOffset, 120, stageHeight - 90);
  const visibleSteps = orderedSteps.filter((step) => step.startMin + Math.max(120, step.durationMax) >= timeMs && step.startMin <= timeMs + Math.ceil((judgeY + 120) / Math.max(0.03, settings.fallSpeed)));
  const activeSlot = rhythmActiveSlotAt(orderedSteps, timeMs);
  const notePartsByStepId = useMemo(() => new Map(orderedSteps.map((step) => {
    const slot = (step.characterSlot ?? 1) as CharacterSlot;
    const display = rhythmStepText(step, style);
    return [step.id, comboTextParts(display.text, display.useIcons, effectiveIconMappings(style, slot)).filter((part) => part.kind === 'icon')] as const;
  })), [orderedSteps, style]);
  const crowdedGroups = useMemo(() => buildRhythmCrowdedGroups(orderedSteps.flatMap((step) => {
    const parts = notePartsByStepId.get(step.id) ?? [];
    return parts.length ? [{ step, height: rhythmNoteHeight(parts.length) }] : [];
  }), settings.fallSpeed), [notePartsByStepId, orderedSteps, settings.fallSpeed]);
  const visibleCrowdedGroups = visibleRhythmCrowdedGroups(crowdedGroups, timeMs, judgeY, stageHeight, settings.fallSpeed);

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
    return () => observer.disconnect();
  }, [bounds.height, bounds.width]);

  const scaleX = hostSize.width / Math.max(1, bounds.width);
  const scaleY = hostSize.height / Math.max(1, bounds.height);
  return <div ref={hostRef} className="video-rhythm-scale-host"><div className="video-rhythm-shell" style={{ width: stageWidth, height: stageHeight, transform: `scale(${scaleX * scale}, ${scaleY * scale})`, '--rhythm-judge-y': judgeY + 'px', '--rhythm-lane-gap': settings.laneGap + 'px', '--rhythm-role-spacing': settings.roleSpacing + 'px' } as CSSProperties}><div className="rhythm-overlay-lanes">{CHARACTER_SLOTS.map((slot) => <div key={slot} className="rhythm-overlay-lane">{activeSlot === slot && <div className="rhythm-overlay-active-role-gradient" />}{visibleSteps.filter((step) => (step.characterSlot ?? 1) === slot).map((step) => { const parts = notePartsByStepId.get(step.id) ?? []; const height = rhythmNoteHeight(parts.length); const active = timeMs >= step.startMin && timeMs <= step.startMin + step.durationMax; return <div key={step.id} className={'rhythm-overlay-note ' + (step.moveId === 'heavy_attack' || step.moveId.endsWith('_hold') ? 'hold' : 'normal') + (parts.length > 1 ? ' stacked' : '') + (active ? ' active' : '')} style={{ top: rhythmNoteTop(step, height, timeMs, judgeY, settings.fallSpeed), height, opacity: rhythmNoteOpacity(step, timeMs) } as CSSProperties}><ComboInlineContent parts={parts} className="rhythm-overlay-note-content" hideIconAlt /></div>; })}</div>)}</div><div className="rhythm-overlay-judge" /><div className="rhythm-overlay-avatars">{CHARACTER_SLOTS.map((slot) => { const role = style.roleStyles[slot]; const prompt = orderedSteps.find((step) => (step.characterSlot ?? 1) === slot && timeMs <= step.startMin + step.durationMax); const crowdedPrompts = visibleCrowdedGroups.filter((group) => group.characterSlot === slot).map((group) => ({ group, parts: [...group.entries].reverse().flatMap((entry) => notePartsByStepId.get(entry.step.id) ?? []) })).filter((item) => item.parts.length > 1); return <div key={slot} className={`rhythm-overlay-avatar-cell ${activeSlot === slot ? 'active' : ''}`}><span className="rhythm-overlay-lane-prompt">{promptTextForStep(prompt, style, language)}</span>{crowdedPrompts.length > 0 && <span className="rhythm-overlay-crowded-prompts">{crowdedPrompts.map(({ group, parts }) => <span key={group.id} className="rhythm-overlay-crowded-prompt" style={{ '--rhythm-crowded-color': role.color } as CSSProperties}><ComboInlineContent parts={parts} className="rhythm-overlay-crowded-prompt-content" hideIconAlt /></span>)}</span>}<span className="rhythm-overlay-avatar" style={imageCropBackground(role.avatar, role.avatarCrop)}>{role.avatar ? null : slot}</span></div>; })}</div></div></div>;
}

export function VideoAxisWorkbench({ open, desktop, chart, comboImageStyle, timelineContentLabels, overlaySettings, rhythmUiSettings, shortcutSettings, exportDirectory, ensureExportDirectory, timelineEditor, onApplyChart, onApplyContentLabels, onClose, onSave, getDisplaySize }: VideoAxisWorkbenchProps) {
  const { language, text } = useI18n();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoSourcePath, setVideoSourcePath] = useState<string | null>(null);
  const [videoMeta, setVideoMeta] = useState<VideoMeta>(DEFAULT_VIDEO_META);
  const [trimStartMs, setTrimStartMs] = useState(0);
  const [trimEndMs, setTrimEndMs] = useState(0);
  const [trimDialogOpen, setTrimDialogOpen] = useState(false);
  const [trimDraftStartMs, setTrimDraftStartMs] = useState(0);
  const [trimDraftEndMs, setTrimDraftEndMs] = useState(0);
  const [trimPreviewMs, setTrimPreviewMs] = useState(0);
  const [playbackMs, setPlaybackMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<(typeof VIDEO_PLAYBACK_RATES)[number]>(1);
  const [playbackRateMenuOpen, setPlaybackRateMenuOpen] = useState(false);
  const [timelineAutoFollow, setTimelineAutoFollow] = useState(true);
  const [previewMuted, setPreviewMuted] = useState(false);
  const [keyframes, setKeyframes] = useState<ZoomKeyframe[]>(() => {
    const extent = chartExtentMs(chart);
    return [
      { id: crypto.randomUUID(), timeMs: 0 },
      { id: crypto.randomUUID(), timeMs: Math.max(MIN_FRAME_GAP_MS, extent) }
    ];
  });
  const [exportStatus, setExportStatus] = useState<ExportStatus>(() => ({ state: 'idle', message: text('等待导出', 'Ready to Export'), progress: 0 }));
  const [videoToast, setVideoToast] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState(() => text('引用本地视频文件，不写入项目存储。', 'The local video file is referenced without being stored in the project.'));
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [timelineHeight, setTimelineHeight] = useState(() => Math.round(Math.max(window.innerHeight * 0.25, MIN_VIDEO_TIMELINE_HEIGHT)));
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [timelineLaneHeight, setTimelineLaneHeight] = useState(48);
  const [undoStack, setUndoStack] = useState<WorkbenchHistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<WorkbenchHistorySnapshot[]>([]);
  const [timelineToggleDragMoved, setTimelineToggleDragMoved] = useState(false);
  const [previewTransform, setPreviewTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [layerTransformMode, setLayerTransformMode] = useState(false);
  const [layerTransform, setLayerTransform] = useState<VideoLayerTransform>({ offsetX: 0, offsetY: 0, scale: 1, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 });
  const [stageHudVisible, setStageHudVisible] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trimPreviewRef = useRef<HTMLVideoElement | null>(null);
  const trimDragRef = useRef<VideoTrimDrag | null>(null);
  const playbackRateMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectVideoUrlRef = useRef<string | null>(null);
  const zoomDragRef = useRef<ZoomDragSnapshot | null>(null);
  const timelinePanelDragRef = useRef<TimelinePanelDragSnapshot | null>(null);
  const timelineToggleSuppressClickRef = useRef(false);
  const previewPanRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const layerMoveDragRef = useRef<VideoLayerMoveDrag | null>(null);
  const layerScaleDragRef = useRef<VideoLayerScaleDrag | null>(null);
  const layerCropDragRef = useRef<VideoLayerCropDrag | null>(null);
  const layerScaleSuppressClickRef = useRef(false);
  const stageHudHideTimerRef = useRef<number | null>(null);
  const videoToastTimerRef = useRef<number | null>(null);
  const exportCancelRef = useRef(false);
  const activeExportRecorderRef = useRef<MediaRecorder | null>(null);
  const keyboardStateRef = useRef({ isExporting: false  });
  const togglePlayRef = useRef<() => void>(() => undefined);
  const seekByRef = useRef<(deltaMs: number) => void>(() => undefined);
  const undoWorkbenchRef = useRef<() => void>(() => undefined);
  const redoWorkbenchRef = useRef<() => void>(() => undefined);
  const imageCacheRef = useRef<ImageCache>(new Map());
  const stageShellRef = useRef<HTMLDivElement | null>(null);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(() => normalizeDisplaySize(currentScreenSize(overlaySettings)));
  const [inspectorPortalTarget, setInspectorPortalTarget] = useState<HTMLElement | null>(null);
  const [toolbarPortalTarget, setToolbarPortalTarget] = useState<HTMLElement | null>(null);
  const [stageShellSize, setStageShellSize] = useState({ width: 0, height: 0 });

  const chartTotal = chartExtentMs(chart);
  const trimDurationMs = videoUrl ? Math.max(0, trimEndMs - trimStartMs) : 0;
  const playbackDurationMs = trimDurationMs || chartTotal;
  const renderTotal = Math.max(chartTotal, trimDurationMs, ...keyframes.map((frame) => frame.timeMs + 600));
  const isExporting = exportStatus.state === 'running';
  const zoomTrackTotal = Math.max(renderTotal, trimDurationMs, chartTotal);
  const trimSourceDurationMs = Math.max(MIN_VIDEO_TRIM_DURATION_MS, videoMeta.durationMs);
  const trimDraftStartPercent = (trimDraftStartMs / trimSourceDurationMs) * 100;
  const trimDraftEndPercent = (trimDraftEndMs / trimSourceDurationMs) * 100;
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
  const baseLayerBounds = overlayBoundsToVideoPercent(overlaySettings, screenSize);
  const layerContentBounds = {
    x: baseLayerBounds.x + layerTransform.offsetX - (baseLayerBounds.width * (layerTransform.scale - 1)) / 2,
    y: baseLayerBounds.y + layerTransform.offsetY - (baseLayerBounds.height * (layerTransform.scale - 1)) / 2,
    width: baseLayerBounds.width * layerTransform.scale,
    height: baseLayerBounds.height * layerTransform.scale
  };
  const layerBounds = {
    x: layerContentBounds.x + layerTransform.cropLeft,
    y: layerContentBounds.y + layerTransform.cropTop,
    width: Math.max(0.1, layerContentBounds.width - layerTransform.cropLeft - layerTransform.cropRight),
    height: Math.max(0.1, layerContentBounds.height - layerTransform.cropTop - layerTransform.cropBottom)
  };
  const layerPeriodLabel = currentPeriodLabel(chart, playbackMs, language);
  const layerContentStyle = { left: `${((layerContentBounds.x - layerBounds.x) / layerBounds.width) * 100}%`, top: `${((layerContentBounds.y - layerBounds.y) / layerBounds.height) * 100}%`, width: `${(layerContentBounds.width / layerBounds.width) * 100}%`, height: `${(layerContentBounds.height / layerBounds.height) * 100}%` } as CSSProperties;
  const layerSourceBounds = overlaySourceBounds(overlaySettings);
  const linearLayout: LinearComboLayout = overlaySettings.layout === 'vertical' ? 'vertical' : 'horizontal';
  const waterfallMode = overlaySettings.layout === 'waterfall';
  const sortedKeyframes = useMemo(() => [...keyframes].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id)), [keyframes]);
  const previewTransformStyle = {
    transform: `translate(${previewTransform.x}px, ${previewTransform.y}px) scale(${previewTransform.scale})`
  } as CSSProperties;
  const workbenchMainStyle = {
    '--video-timeline-height': `${timelineHeight}px`
  } as CSSProperties;

  function cloneChartSnapshot(source: ComboChart): ComboChart {
    return { ...source, steps: source.steps.map((step) => ({ ...step })), periods: source.periods?.map((period) => ({ ...period })) };
  }

  function currentHistorySnapshot(): WorkbenchHistorySnapshot {
    return {
      chart: cloneChartSnapshot(chart),
      contentLabels: { ...timelineContentLabels },
      keyframes: sortedKeyframes.map((frame) => ({ ...frame })),
      playbackMs,
      timelineHeight,
      timelineZoom,
      timelineCollapsed,
      layerTransform: { ...layerTransform }
    };
  }

  function restoreHistorySnapshot(snapshot: WorkbenchHistorySnapshot) {
    onApplyChart(cloneChartSnapshot(snapshot.chart));
    onApplyContentLabels({ ...snapshot.contentLabels });
    setKeyframes(snapshot.keyframes.map((frame) => ({ ...frame })).sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id)));
    const restoredPlaybackMs = clamp(snapshot.playbackMs, 0, playbackDurationMs);
    setPlaybackMs(restoredPlaybackMs);
    if (videoRef.current) videoRef.current.currentTime = (trimStartMs + restoredPlaybackMs) / 1000;
    setTimelineHeight(snapshot.timelineHeight);
    setTimelineZoom(snapshot.timelineZoom);
    setTimelineCollapsed(snapshot.timelineCollapsed);
    setLayerTransform({ ...snapshot.layerTransform });
  }

  function captureWorkbenchHistory() {
    const snapshot = currentHistorySnapshot();
    setUndoStack((current) => [...current.slice(-MAX_WORKBENCH_HISTORY + 1), snapshot]);
    setRedoStack([]);
  }

  function undoWorkbench() {
    setUndoStack((current) => {
      const previous = current[current.length - 1];
      if (!previous) return current;
      const remaining = current.slice(0, -1);
      setRedoStack((redo) => [...redo.slice(-MAX_WORKBENCH_HISTORY + 1), currentHistorySnapshot()]);
      restoreHistorySnapshot(previous);
      return remaining;
    });
  }

  function redoWorkbench() {
    setRedoStack((current) => {
      const next = current[current.length - 1];
      if (!next) return current;
      const remaining = current.slice(0, -1);
      setUndoStack((undo) => [...undo.slice(-MAX_WORKBENCH_HISTORY + 1), currentHistorySnapshot()]);
      restoreHistorySnapshot(next);
      return remaining;
    });
  }

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

  function toggleLayerTransformMode() {
    if (layerScaleSuppressClickRef.current) {
      layerScaleSuppressClickRef.current = false;
      return;
    }
    setLayerTransformMode((active) => !active);
  }

  function beginLayerMoveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!layerTransformMode || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    layerMoveDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: { ...layerTransform }, moved: false, historyCaptured: false };
  }

  function moveLayerMoveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = layerMoveDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !stageFrameSize) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 3) return;
    drag.moved = true;
    if (!drag.historyCaptured) {
      captureWorkbenchHistory();
      drag.historyCaptured = true;
    }
    event.preventDefault();
    event.stopPropagation();
    setLayerTransform((current) => ({ ...current, offsetX: drag.origin.offsetX + (deltaX / Math.max(1, stageFrameSize.width)) * 100, offsetY: drag.origin.offsetY + (deltaY / Math.max(1, stageFrameSize.height)) * 100 }));
  }

  function endLayerMoveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (layerMoveDragRef.current?.pointerId === event.pointerId) layerMoveDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function beginLayerScaleDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    layerScaleDragRef.current = { pointerId: event.pointerId, startX: event.clientX, origin: { ...layerTransform }, moved: false, historyCaptured: false };
    layerScaleSuppressClickRef.current = false;
  }

  function moveLayerScaleDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = layerScaleDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaX) < 4) return;
    drag.moved = true;
    if (!drag.historyCaptured) {
      captureWorkbenchHistory();
      drag.historyCaptured = true;
    }
    layerScaleSuppressClickRef.current = true;
    event.preventDefault();
    event.stopPropagation();
    const scale = clamp(drag.origin.scale + deltaX / 240, 0.25, 4);
    const cropScale = scale / drag.origin.scale;
    setLayerTransform((current) => ({ ...current, scale,
      cropLeft: drag.origin.cropLeft * cropScale, cropTop: drag.origin.cropTop * cropScale,
      cropRight: drag.origin.cropRight * cropScale, cropBottom: drag.origin.cropBottom * cropScale
    }));
  }

  function endLayerScaleDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (layerScaleDragRef.current?.pointerId === event.pointerId) layerScaleDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function beginLayerCropDrag(event: ReactPointerEvent<HTMLButtonElement>, edge: VideoLayerCropEdge) {
    if (!layerTransformMode || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    layerCropDragRef.current = { pointerId: event.pointerId, edge, startX: event.clientX, startY: event.clientY, origin: { ...layerTransform }, moved: false, historyCaptured: false };
  }

  function moveLayerCropDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = layerCropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !stageFrameSize) return;
    const deltaX = ((event.clientX - drag.startX) / Math.max(1, stageFrameSize.width)) * 100;
    const deltaY = ((event.clientY - drag.startY) / Math.max(1, stageFrameSize.height)) * 100;
    if (!drag.moved && Math.hypot(deltaX * stageFrameSize.width / 100, deltaY * stageFrameSize.height / 100) < 3) return;
    drag.moved = true;
    if (!drag.historyCaptured) {
      captureWorkbenchHistory();
      drag.historyCaptured = true;
    }
    event.preventDefault();
    event.stopPropagation();
    const contentWidth = baseLayerBounds.width * drag.origin.scale;
    const contentHeight = baseLayerBounds.height * drag.origin.scale;
    const minWidth = Math.min(contentWidth, Math.max(1.2, (16 / Math.max(1, stageFrameSize.width)) * 100));
    const minHeight = Math.min(contentHeight, Math.max(1.2, (16 / Math.max(1, stageFrameSize.height)) * 100));
    const next = { ...drag.origin };
    if (drag.edge.includes('w')) next.cropLeft = clamp(drag.origin.cropLeft + deltaX, 0, contentWidth - drag.origin.cropRight - minWidth);
    if (drag.edge.includes('e')) next.cropRight = clamp(drag.origin.cropRight - deltaX, 0, contentWidth - drag.origin.cropLeft - minWidth);
    if (drag.edge.includes('n')) next.cropTop = clamp(drag.origin.cropTop + deltaY, 0, contentHeight - drag.origin.cropBottom - minHeight);
    if (drag.edge.includes('s')) next.cropBottom = clamp(drag.origin.cropBottom - deltaY, 0, contentHeight - drag.origin.cropTop - minHeight);
    setLayerTransform(next);
  }

  function endLayerCropDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (layerCropDragRef.current?.pointerId === event.pointerId) layerCropDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function renderLayerCropHandle(edge: VideoLayerCropEdge) {
    return <button
      key={edge}
      type="button"
      className={`video-layer-crop-handle ${edge}`}
      aria-label={text(`裁剪 ${edge}`, `Crop ${edge}`)}
      onPointerDown={(event) => beginLayerCropDrag(event, edge)}
      onPointerMove={moveLayerCropDrag}
      onPointerUp={endLayerCropDrag}
      onPointerCancel={endLayerCropDrag}
    />;
  }
  function beginTimelinePanelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    timelinePanelDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startHeight: timelineHeight,
      startZoom: timelineZoom,
      moved: false,
      historyCaptured: false,
      axis: null
    };
    timelineToggleSuppressClickRef.current = false;
    setTimelineToggleDragMoved(false);
  }

  function moveTimelinePanelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = timelinePanelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.axis && Math.hypot(deltaX, deltaY) < TIMELINE_TOGGLE_DRAG_THRESHOLD) return;
    if (!drag.axis) drag.axis = Math.abs(deltaX) >= Math.abs(deltaY) ? 'horizontal' : 'vertical';
    drag.moved = true;
    if (!drag.historyCaptured) {
      captureWorkbenchHistory();
      drag.historyCaptured = true;
    }
    timelineToggleSuppressClickRef.current = true;
    event.preventDefault();
    setTimelineToggleDragMoved(true);
    if (drag.axis === 'vertical') {
      const maxHeight = Math.max(MIN_VIDEO_TIMELINE_HEIGHT, Math.round(window.innerHeight * MAX_VIDEO_TIMELINE_HEIGHT_RATIO));
      setTimelineHeight(Math.round(clamp(drag.startHeight - deltaY, MIN_VIDEO_TIMELINE_HEIGHT, maxHeight)));
    } else {
      setTimelineZoom(clamp(drag.startZoom + deltaX / 900, 0.05, 1.6));
    }
  }

  function endTimelinePanelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = timelinePanelDragRef.current;
    if (drag?.pointerId === event.pointerId) {
      timelinePanelDragRef.current = null;
      timelineToggleSuppressClickRef.current = drag.moved;
      setTimelineToggleDragMoved(drag.moved);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function toggleTimelineCollapsedFromButton() {
    if (timelineToggleSuppressClickRef.current) {
      timelineToggleSuppressClickRef.current = false;
      setTimelineToggleDragMoved(false);
      return;
    }
    if (timelineToggleDragMoved) {
      setTimelineToggleDragMoved(false);
      return;
    }
    captureWorkbenchHistory();
    setTimelineCollapsed((collapsed) => !collapsed);
  }

  function changeTimelineLaneHeight(event: ReactWheelEvent<HTMLButtonElement>) {
    if (timelineCollapsed || event.deltaY === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY > 0 ? -VIDEO_TIMELINE_LANE_HEIGHT_STEP : VIDEO_TIMELINE_LANE_HEIGHT_STEP;
    setTimelineLaneHeight((current) => Math.round(clamp(current + delta, MIN_VIDEO_TIMELINE_LANE_HEIGHT, MAX_VIDEO_TIMELINE_LANE_HEIGHT)));
  }

  useEffect(() => {
    if (!open) {
      videoRef.current?.pause();
      document.body.classList.remove('video-workbench-open');
      return;
    }
    document.body.classList.add('video-workbench-open');
    return () => document.body.classList.remove('video-workbench-open');
  }, [open]);

  useEffect(() => () => clearStageHudHideTimer(), []);

  useEffect(() => {
    if (!playbackRateMenuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!playbackRateMenuRef.current?.contains(event.target as Node)) setPlaybackRateMenuOpen(false);
    };
    window.addEventListener('pointerdown', closeMenu);
    return () => window.removeEventListener('pointerdown', closeMenu);
  }, [playbackRateMenuOpen]);

  keyboardStateRef.current.isExporting = isExporting;
  togglePlayRef.current = () => { void togglePlay();  };
  seekByRef.current = seekBy;
  undoWorkbenchRef.current = undoWorkbench;
  redoWorkbenchRef.current = redoWorkbench;

  useEffect(() => {
    if (!open) return;
    const isPlaybackEvent = (event: KeyboardEvent) => shortcutMatches(event, shortcutSettings.videoPlayPause);
    const isSeekBackwardEvent = (event: KeyboardEvent) => shortcutMatches(event, shortcutSettings.videoSeekBackward);
    const isSeekForwardEvent = (event: KeyboardEvent) => shortcutMatches(event, shortcutSettings.videoSeekForward);
    const isTypingTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (keyboardStateRef.current.isExporting) {
        if (isPlaybackEvent(event) || isSeekBackwardEvent(event) || isSeekForwardEvent(event)) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
        return;
      }
      if (trimDialogOpen) {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          trimPreviewRef.current?.pause();
          trimDragRef.current = null;
          setTrimDialogOpen(false);
          return;
        }
        if (isPlaybackEvent(event) || isSeekBackwardEvent(event) || isSeekForwardEvent(event)) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      const isTyping = isTypingTarget(event.target);
      if (!isTyping && isPlaybackEvent(event)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (!event.repeat) togglePlayRef.current();
        return;
      }
      if (!isTyping && (isSeekBackwardEvent(event) || isSeekForwardEvent(event))) {
        event.preventDefault();
        seekByRef.current(isSeekBackwardEvent(event) ? -500 : 500);
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoWorkbenchRef.current();
      }
      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        redoWorkbenchRef.current();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!isPlaybackEvent(event)) return;
      if (!keyboardStateRef.current.isExporting && (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('contextmenu', onContextMenu, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
    };
  }, [open, trimDialogOpen, shortcutSettings]);

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
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    video.pause();
    setIsPlaying(false);
    video.load();
  }, [videoUrl]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate, videoUrl]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = previewMuted;
  }, [previewMuted, videoUrl]);

  useEffect(() => {
    setPreviewTransform((current) => clampPreviewTransform(current));
  }, [stageFrameSize?.height, stageFrameSize?.width]);

  useEffect(() => () => {
    if (objectVideoUrlRef.current) URL.revokeObjectURL(objectVideoUrlRef.current);
  }, []);

  useEffect(() => {
    if (!open || !isPlaying) return;
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video) {
        const sourceTimeMs = Math.round(video.currentTime * 1000);
        if (trimDurationMs > 0 && sourceTimeMs >= trimEndMs - 16) {
          video.pause();
          video.currentTime = trimEndMs / 1000;
          setPlaybackMs(trimDurationMs);
          setIsPlaying(false);
          return;
        }
        setPlaybackMs(clamp(sourceTimeMs - trimStartMs, 0, playbackDurationMs));
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [isPlaying, open, playbackDurationMs, trimDurationMs, trimEndMs, trimStartMs, videoUrl]);

  async function importVideo(file: File | null) {
    if (!file) return;
    const nextUrl = URL.createObjectURL(file);
    if (objectVideoUrlRef.current) URL.revokeObjectURL(objectVideoUrlRef.current);
    objectVideoUrlRef.current = nextUrl;
    videoRef.current?.pause();
    setVideoSourcePath(null);
    setTrimStartMs(0);
    setTrimEndMs(0);
    setPlaybackMs(0);
    setIsPlaying(false);
    setVideoUrl(nextUrl);
    setImportMessage(text('正在读取视频信息...', 'Reading video information...'));
    try {
      const meta = await readVideoMetadata(file.name, nextUrl, text);
      setVideoMeta(meta);
      setTrimStartMs(0);
      setTrimEndMs(meta.durationMs);
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
      setImportMessage(text(`已导入 ${meta.name}，${meta.width}x${meta.height}，${formatMs(meta.durationMs)}`, `Imported ${meta.name}, ${meta.width}x${meta.height}, ${formatMs(meta.durationMs)}`));
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : text('视频读取失败', 'Unable to Read Video'));
    }
  }

  async function chooseVideo() {
    if (!desktop?.pickVideoFile) {
      fileInputRef.current?.click();
      return;
    }
    const picked = await desktop.pickVideoFile();
    if (!picked) return;
    if (objectVideoUrlRef.current) {
      URL.revokeObjectURL(objectVideoUrlRef.current);
      objectVideoUrlRef.current = null;
    }
    videoRef.current?.pause();
    setVideoSourcePath(picked.path);
    setTrimStartMs(0);
    setTrimEndMs(0);
    setPlaybackMs(0);
    setIsPlaying(false);
    setVideoUrl(picked.url);
    setImportMessage(text('正在读取视频信息...', 'Reading video information...'));
    try {
      const meta = await readVideoMetadata(picked.name, picked.url, text);
      setVideoMeta(meta);
      setTrimStartMs(0);
      setTrimEndMs(meta.durationMs);
      setPlaybackMs(0);
      setIsPlaying(false);
      setImportMessage(text(`已导入 ${meta.name}，${meta.width}x${meta.height}，${formatMs(meta.durationMs)}`, `Imported ${meta.name}, ${meta.width}x${meta.height}, ${formatMs(meta.durationMs)}`));
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : text('视频读取失败', 'Unable to Read Video'));
    }
  }

  async function togglePlay() {
    const video = videoRef.current;
    if (!videoUrl || !video) return;
    if (video.paused) {
      try {
        await waitForVideoReady(video, text);
        const sourceTimeMs = video.currentTime * 1000;
        const hasTrimRange = trimEndMs > trimStartMs;
        if (hasTrimRange && (playbackMs >= playbackDurationMs - 16 || sourceTimeMs < trimStartMs || sourceTimeMs >= trimEndMs - 16)) {
          await seekVideo(video, trimStartMs / 1000);
          setPlaybackMs(0);
        }
        await video.play();
      } catch (error) {
        video.pause();
        setIsPlaying(false);
        const message = error instanceof Error ? error.message : text('视频播放失败', 'Unable to Play Video');
        setImportMessage(message);
        showVideoToast(message);
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }

  function seekTo(ms: number) {
    const video = videoRef.current;
    const next = clamp(ms, 0, playbackDurationMs);
    setPlaybackMs(next);
    if (video) video.currentTime = (trimStartMs + next) / 1000;
  }

  function seekBy(deltaMs: number) {
    if (!videoUrl) return;
    const relativeTimeMs = videoRef.current ? videoRef.current.currentTime * 1000 - trimStartMs : playbackMs;
    seekTo(relativeTimeMs + deltaMs);
  }

  function applyTrimRange(nextStartMs: number, nextEndMs: number, preferredPlaybackMs = playbackMs) {
    if (!videoUrl || videoMeta.durationMs <= 0) return;
    const sourceDurationMs = videoMeta.durationMs;
    const start = clamp(Math.round(nextStartMs), 0, Math.max(0, sourceDurationMs - MIN_VIDEO_TRIM_DURATION_MS));
    const end = clamp(Math.round(nextEndMs), start + MIN_VIDEO_TRIM_DURATION_MS, sourceDurationMs);
    const nextDuration = end - start;
    const nextPlayback = clamp(Math.round(preferredPlaybackMs), 0, nextDuration);
    setTrimStartMs(start);
    setTrimEndMs(end);
    setPlaybackMs(nextPlayback);
    const video = videoRef.current;
    if (video) video.currentTime = (start + nextPlayback) / 1000;
    if (video && nextPlayback >= nextDuration && !video.paused) video.pause();
  }

  function setTrimDraftRange(nextStartMs: number, nextEndMs: number, previewMs?: number) {
    const sourceDurationMs = Math.max(MIN_VIDEO_TRIM_DURATION_MS, videoMeta.durationMs);
    const start = clamp(Math.round(nextStartMs), 0, Math.max(0, sourceDurationMs - MIN_VIDEO_TRIM_DURATION_MS));
    const end = clamp(Math.round(nextEndMs), start + MIN_VIDEO_TRIM_DURATION_MS, sourceDurationMs);
    const nextPreview = clamp(Math.round(previewMs ?? trimPreviewMs), start, end);
    setTrimDraftStartMs(start);
    setTrimDraftEndMs(end);
    setTrimPreviewMs(nextPreview);
    if (trimPreviewRef.current) trimPreviewRef.current.currentTime = nextPreview / 1000;
  }

  function openTrimDialog() {
    if (!videoUrl || isExporting) return;
    videoRef.current?.pause();
    setTrimDraftStartMs(trimStartMs);
    setTrimDraftEndMs(trimEndMs);
    setTrimPreviewMs(trimStartMs);
    setTrimDialogOpen(true);
  }

  function closeTrimDialog() {
    trimPreviewRef.current?.pause();
    trimDragRef.current = null;
    setTrimDialogOpen(false);
  }

  function saveTrimDraft() {
    const start = trimDraftStartMs;
    const end = trimDraftEndMs;
    videoRef.current?.pause();
    setIsPlaying(false);
    applyTrimRange(start, end, 0);
    closeTrimDialog();
    showVideoToast(text(`已应用裁剪：${formatMs(end - start)}`, `Trim applied: ${formatMs(end - start)}`));
  }

  function commitTrimDraftStart(seconds: number) {
    setTrimDraftRange(seconds * 1000, trimDraftEndMs, seconds * 1000);
  }

  function commitTrimDraftEnd(seconds: number) {
    setTrimDraftRange(trimDraftStartMs, seconds * 1000, seconds * 1000);
  }

  function seekTrimPreview(clientX: number, trackLeft: number, trackWidth: number) {
    const ratio = clamp((clientX - trackLeft) / Math.max(1, trackWidth), 0, 1);
    const next = clamp(Math.round(ratio * trimSourceDurationMs), trimDraftStartMs, trimDraftEndMs);
    setTrimPreviewMs(next);
    if (trimPreviewRef.current) trimPreviewRef.current.currentTime = next / 1000;
  }

  function beginTrimDrag(event: ReactPointerEvent<HTMLButtonElement>, edge: 'start' | 'end') {
    if (isExporting) return;
    const track = event.currentTarget.parentElement;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    trimDragRef.current = { pointerId: event.pointerId, edge, trackLeft: rect.left, trackWidth: rect.width };
  }

  function moveTrimDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = trimDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const rawMs = clamp(Math.round(((event.clientX - drag.trackLeft) / Math.max(1, drag.trackWidth)) * trimSourceDurationMs), 0, trimSourceDurationMs);
    if (drag.edge === 'start') {
      const start = Math.min(rawMs, trimDraftEndMs - MIN_VIDEO_TRIM_DURATION_MS);
      setTrimDraftRange(start, trimDraftEndMs, start);
    } else {
      const end = Math.max(rawMs, trimDraftStartMs + MIN_VIDEO_TRIM_DURATION_MS);
      setTrimDraftRange(trimDraftStartMs, end, end);
    }
  }

  function endTrimDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (trimDragRef.current?.pointerId !== event.pointerId) return;
    trimDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleTrimTrackPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('.video-trim-handle')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    seekTrimPreview(event.clientX, rect.left, rect.width);
  }

  function handleTrimPreviewTimeUpdate() {
    const video = trimPreviewRef.current;
    if (!video) return;
    const sourceTimeMs = Math.round(video.currentTime * 1000);
    if (sourceTimeMs >= trimDraftEndMs) {
      video.pause();
      video.currentTime = trimDraftStartMs / 1000;
      setTrimPreviewMs(trimDraftStartMs);
      return;
    }
    setTrimPreviewMs(clamp(sourceTimeMs, trimDraftStartMs, trimDraftEndMs));
  }

  function choosePlaybackRate(rate: (typeof VIDEO_PLAYBACK_RATES)[number]) {
    setPlaybackRate(rate);
    setPlaybackRateMenuOpen(false);
   }

  function togglePreviewMuted() {
    setPreviewMuted((muted) => {
      const nextMuted = !muted;
      if (videoRef.current) videoRef.current.muted = nextMuted;
      return nextMuted;
     });
   }

  function placeZoomKeyframe(timeMs: number) {
    const nextTime = Math.round(clamp(timeMs, 0, zoomTrackTotal));
    captureWorkbenchHistory();
    setKeyframes((current) => [...current, { id: crypto.randomUUID(), timeMs: nextTime }].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id)));
    seekTo(nextTime);
  }

  function deleteZoomKeyframe(frameId: string) {
    captureWorkbenchHistory();
    setKeyframes((current) => current.length <= 2 ? current : current.filter((frame) => frame.id !== frameId));
  }

  function beginZoomDrag(event: ReactPointerEvent<HTMLButtonElement>, frameId: string, trackRenderTotal = zoomTrackTotal) {
    event.preventDefault();
    event.stopPropagation();
    const track = event.currentTarget.closest('.timeline-zoom-frame-track') as HTMLElement | null;
    const markerIndex = sortedKeyframes.findIndex((frame) => frame.id === frameId);
    if (!track || markerIndex < 0) return;
    captureWorkbenchHistory();
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
    seekTo(nextTime);
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
    const cancelledMessage = text('视频导出已取消', 'Video export cancelled');
    const sourceVideo = videoRef.current;
    if (!videoUrl || !sourceVideo) {
      const message = text('请先导入视频。', 'Import a video first.');
      setExportStatus({ state: 'error', message, progress: 0 });
      showVideoToast(message);
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      const message = text('当前浏览器不支持 MediaRecorder 导出。', 'This browser does not support MediaRecorder export.');
      setExportStatus({ state: 'error', message, progress: 0 });
      showVideoToast(message);
      return;
    }
    const desktopOverlayExportAvailable = Boolean(desktop?.exportVideoWithOverlay);
    if (desktopOverlayExportAvailable && !videoSourcePath) {
      const message = text('当前视频缺少原文件路径，请通过“导入视频”重新选择后再导出 MP4。', 'The original file path is unavailable. Import the video again before exporting MP4.');
      setExportStatus({ state: 'error', message, progress: 0 });
      showVideoToast(message);
      return;
    }
    const width = sourceVideo.videoWidth || videoMeta.width;
    const height = sourceVideo.videoHeight || videoMeta.height;
    const sourceDurationMs = Number.isFinite(sourceVideo.duration) ? Math.round(sourceVideo.duration * 1000) : videoMeta.durationMs;
    const clipStartMs = clamp(trimStartMs, 0, Math.max(0, sourceDurationMs - MIN_VIDEO_TRIM_DURATION_MS));
    const clipEndMs = clamp(trimEndMs || sourceDurationMs, clipStartMs + MIN_VIDEO_TRIM_DURATION_MS, sourceDurationMs);
    const durationMs = clipEndMs - clipStartMs;
    if (!width || !height || !sourceDurationMs || durationMs < MIN_VIDEO_TRIM_DURATION_MS) {
      const message = text('视频信息不完整，无法导出。', 'The video information is incomplete and cannot be exported.');
      setExportStatus({ state: 'error', message, progress: 0 });
      showVideoToast(message);
      return;
    }
    const nativeOverlayExport = desktopOverlayExportAvailable && Boolean(videoSourcePath);
    let targetExportDirectory = exportDirectory?.trim() ?? '';
    if (nativeOverlayExport && !targetExportDirectory) {
      try {
        targetExportDirectory = (await ensureExportDirectory?.())?.trim() ?? '';
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setExportStatus({ state: 'error', message, progress: 0 });
        showVideoToast(message);
        return;
      }
      if (!targetExportDirectory) {
        const message = text('未选择导出文件夹，已取消导出。', 'No export folder was selected. Export cancelled.');
        setExportStatus({ state: 'idle', message, progress: 0 });
        showVideoToast(message);
        return;
      }
    }
    const nativeClipLeft = clamp(layerBounds.x, 0, 100);
    const nativeClipTop = clamp(layerBounds.y, 0, 100);
    const nativeClipRight = clamp(layerBounds.x + layerBounds.width, 0, 100);
    const nativeClipBottom = clamp(layerBounds.y + layerBounds.height, 0, 100);
    const nativeClipWidth = Math.max(0.1, nativeClipRight - nativeClipLeft);
    const nativeClipHeight = Math.max(0.1, nativeClipBottom - nativeClipTop);
    const nativeOverlayX = Math.round((nativeClipLeft / 100) * width);
    const nativeOverlayY = Math.round((nativeClipTop / 100) * height);
    const canvas = document.createElement('canvas');
    canvas.width = nativeOverlayExport ? Math.max(2, Math.ceil(((nativeClipWidth / 100) * width) / 2) * 2) : width;
    canvas.height = nativeOverlayExport ? Math.max(2, Math.ceil(((nativeClipHeight / 100) * height) / 2) * 2) : height;
    const nativeContentBounds = {
      x: ((layerContentBounds.x - nativeClipLeft) / nativeClipWidth) * 100,
      y: ((layerContentBounds.y - nativeClipTop) / nativeClipHeight) * 100,
      width: (layerContentBounds.width / nativeClipWidth) * 100,
      height: (layerContentBounds.height / nativeClipHeight) * 100
    };
    const nativeCanvasClipBounds = { x: 0, y: 0, width: 100, height: 100 };
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      const message = text('Canvas 初始化失败。', 'Unable to initialize the canvas.');
      setExportStatus({ state: 'error', message, progress: 0 });
      showVideoToast(message);
      return;
    }
    const exportFrameRate = 60;
    const canvasStream = canvas.captureStream(exportFrameRate);
    if (!nativeOverlayExport) {
      const captureSource = sourceVideo as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
      const sourceStream = captureSource.captureStream?.() ?? captureSource.mozCaptureStream?.();
      sourceStream?.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
    }
    const mimeType = chooseMediaRecorderMime();
    const videoBitsPerSecond = exportVideoBitrate(canvas.width, canvas.height, exportFrameRate);
    const recorder = new MediaRecorder(canvasStream, mimeType ? { mimeType, videoBitsPerSecond } : { videoBitsPerSecond });
    const chunks: BlobPart[] = [];
    const originalTime = sourceVideo.currentTime;
    const wasMuted = sourceVideo.muted;
    const wasLooping = sourceVideo.loop;
    const wasPaused = sourceVideo.paused;
    exportCancelRef.current = false;
    activeExportRecorderRef.current = recorder;
    sourceVideo.muted = true;
    sourceVideo.loop = false;
    setIsPlaying(true);
    setExportStatus({ state: 'running', message: nativeOverlayExport ? text('正在生成透明连段图层...', 'Generating the transparent combo layer...') : text('正在导出视频...', 'Exporting video...'), progress: 0 });
    try {
      await preloadExportImages(chart, comboImageStyle, imageCacheRef.current);
      if (exportCancelRef.current) throw new Error(cancelledMessage);
      await new Promise<void>((resolve, reject) => {
      let drawFrame = 0;
      let videoFrameCallback = 0;
      let lastProgressUpdate = 0;
      const frameVideo = sourceVideo as HTMLVideoElement & {
        requestVideoFrameCallback?: (callback: (now: number) => void) => number;
        cancelVideoFrameCallback?: (handle: number) => void;
      };
      const cleanup = () => {
        window.cancelAnimationFrame(drawFrame);
        if (videoFrameCallback) frameVideo.cancelVideoFrameCallback?.(videoFrameCallback);
        sourceVideo.onerror = null;
      };
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        cleanup();
        reject(new Error(text('录制器导出失败', 'MediaRecorder export failed')));
      };
      recorder.onstop = () => {
        cleanup();
        resolve();
      };
      const draw = () => {
        ctx.clearRect(0, 0, width, height);
        if (exportCancelRef.current) {
          if (recorder.state !== 'inactive') recorder.stop();
          return;
        }
        if (!nativeOverlayExport) ctx.drawImage(sourceVideo, 0, 0, width, height);
        const sourceTimeMs = Math.round(sourceVideo.currentTime * 1000);
        const timeMs = clamp(sourceTimeMs - clipStartMs, 0, durationMs);
        const exportContentBounds = nativeOverlayExport ? nativeContentBounds : layerContentBounds;
        const exportClipBounds = nativeOverlayExport ? nativeCanvasClipBounds : layerBounds;
        if (waterfallMode) {
          drawRhythmLayerToCanvas(ctx, chart, comboImageStyle, timeMs, exportContentBounds, exportClipBounds, rhythmUiSettings, layerSourceBounds, canvas.width, canvas.height, imageCacheRef.current);
        } else {
          drawComboLayerToCanvas(ctx, chart, comboImageStyle, timeMs, exportContentBounds, exportClipBounds, linearLayout, layerSourceBounds, canvas.width, canvas.height, imageCacheRef.current, language);
        }
        const now = performance.now();
        if (now - lastProgressUpdate >= 200 || sourceVideo.ended) {
          lastProgressUpdate = now;
          setExportStatus({ state: 'running', message: text(`${nativeOverlayExport ? '正在生成透明连段图层' : '正在导出视频'} ${formatMs(timeMs)} / ${formatMs(durationMs)}`, `${nativeOverlayExport ? 'Generating transparent combo layer' : 'Exporting video'} ${formatMs(timeMs)} / ${formatMs(durationMs)}`), progress: clamp(timeMs / Math.max(1, durationMs), 0, 1) * (nativeOverlayExport ? 0.7 : 1) });
        }
        if (sourceVideo.ended || sourceTimeMs >= clipEndMs - 30) {
          recorder.stop();
          return;
        }
        if (nativeOverlayExport && frameVideo.requestVideoFrameCallback) {
          videoFrameCallback = frameVideo.requestVideoFrameCallback(draw);
        } else {
          drawFrame = window.requestAnimationFrame(draw);
        }
      };
      sourceVideo.pause();
      sourceVideo.loop = false;
      sourceVideo.muted = true;
      const startRecording = async () => {
        recorder.start(500);
        if (exportCancelRef.current) {
          reject(new Error(cancelledMessage));
          return;
        }
        await sourceVideo.play();
        draw();
      };
      void seekVideo(sourceVideo, clipStartMs / 1000).then(startRecording).catch((error) => {
        cleanup();
        reject(error instanceof Error ? error : new Error(text('视频播放失败', 'Video playback failed')));
      });
      sourceVideo.onerror = () => {
        cleanup();
        reject(new Error(text('视频导出读取失败', 'Unable to read the video during export')));
      };
      });
      if (exportCancelRef.current) throw new Error(cancelledMessage);
      const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
      if (!blob.size) throw new Error(text('导出失败：没有生成视频数据', 'Export failed: no video data was generated'));
      const baseName = text(`${safeFileName(videoMeta.name.replace(/\.[^.]+$/, ''))}-带连段图`, `${safeFileName(videoMeta.name.replace(/\.[^.]+$/, ''))}-with-combo-chart`);
      setExportStatus({ state: 'running', message: nativeOverlayExport ? text('正在合成高质量 MP4...', 'Composing high-quality MP4...') : text('正在转码 MP4...', 'Transcoding MP4...'), progress: nativeOverlayExport ? 0.7 : 0.98 });
      const stopProgress = nativeOverlayExport && desktop?.onVideoExportProgress
        ? desktop.onVideoExportProgress((next) => {
            setExportStatus({
              state: 'running',
              message: text(`正在合成 MP4 ${formatMs(next.processedMs)} / ${formatMs(next.durationMs || durationMs)}`, `Composing MP4 ${formatMs(next.processedMs)} / ${formatMs(next.durationMs || durationMs)}`),
              progress: 0.7 + clamp(next.progress, 0, 1) * 0.29
            });
          })
        : null;
      let saved: { path: string | null; format: 'mp4' | 'webm' };
      try {
        saved = nativeOverlayExport && videoSourcePath && desktop?.exportVideoWithOverlay
          ? { ...(await desktop.exportVideoWithOverlay(targetExportDirectory, `${baseName}.mp4`, videoSourcePath, nativeOverlayX, nativeOverlayY, clipStartMs, durationMs, new Uint8Array(await blob.arrayBuffer()))), format: 'mp4' as const }
          : await exportBlob(blob, `${baseName}.webm`, targetExportDirectory);
      } finally {
        stopProgress?.();
      }
      if (exportCancelRef.current) throw new Error(cancelledMessage);
      revealStageHud();
      const message = saved.path ? text(`已导出到：${saved.path}`, `Exported to: ${saved.path}`) : text(`已下载：${baseName}.${saved.format}`, `Downloaded: ${baseName}.${saved.format}`);
      setExportStatus({ state: 'done', message, progress: 1 });
      showVideoToast(message);
    } catch (error) {
      const cancelled = exportCancelRef.current || error instanceof Error && error.message === cancelledMessage;
      const message = cancelled ? cancelledMessage : error instanceof Error ? error.message : typeof error === 'string' ? error : text('导出失败', 'Export Failed');
      setExportStatus({ state: cancelled ? 'idle' : 'error', message, progress: 0 });
      showVideoToast(message);
    } finally {
      activeExportRecorderRef.current = null;
      sourceVideo.pause();
      sourceVideo.loop = wasLooping;
      sourceVideo.muted = wasMuted;
      sourceVideo.currentTime = originalTime;
      setPlaybackMs(clamp(Math.round(originalTime * 1000) - trimStartMs, 0, playbackDurationMs));
      setIsPlaying(!wasPaused);
      if (!wasPaused) void sourceVideo.play().catch(() => undefined);
      exportCancelRef.current = false;
    }
  }

  function showVideoToast(message: string) {
    if (videoToastTimerRef.current !== null) window.clearTimeout(videoToastTimerRef.current);
    setVideoToast(message);
    videoToastTimerRef.current = window.setTimeout(() => {
      setVideoToast(null);
      videoToastTimerRef.current = null;
    }, 4200);
  }

  function cancelExport() {
    if (!isExporting) return;
    exportCancelRef.current = true;
    setExportStatus((current) => ({ ...current, message: '\u6b63\u5728\u53d6\u6d88\u5bfc\u51fa...' }));
    const recorder = activeExportRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    void desktop?.cancelVideoExport?.();
  }

  const enhancedTimelineEditor = isValidElement(timelineEditor) ? cloneElement(timelineEditor, {
    zoomFrameTrack: {
      frames: sortedKeyframes,
      playbackMs,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      onCaptureHistory: captureWorkbenchHistory,
      onUndo: undoWorkbench,
      onRedo: redoWorkbench,
      onPlace: placeZoomKeyframe,
      onSeek: seekTo,
      onDelete: deleteZoomKeyframe,
      onBeginDrag: beginZoomDrag,
      onDragMove: onZoomDragMove,
      onDragEnd: endZoomDrag
    },
    inspectorPortalTarget,
    toolbarPortalTarget,
    renderTotalOverride: zoomTrackTotal,
    playheadControl: { playbackMs, onSeek: seekTo, disabled: isExporting },
    zoom: timelineZoom,
    onZoomChange: setTimelineZoom,
    videoLayerTransformControl: {
      active: layerTransformMode,
      onToggle: toggleLayerTransformMode,
      onScalePointerDown: beginLayerScaleDrag,
      onScalePointerMove: moveLayerScaleDrag,
      onScalePointerUp: endLayerScaleDrag
    },
    videoLaneHeight: timelineLaneHeight,
    keyboardShortcutsEnabled: open,
    videoAutoFollow: timelineAutoFollow
   } as Record<string, unknown>) : timelineEditor;

  const panel = (
    <div className={`video-workbench ${open ? '' : 'hidden'}`} role="dialog" aria-modal="true" aria-hidden={!open} aria-label={text('视频辅助轴编辑', 'Video Timeline Editor') }>
      {videoToast && <div className="video-export-toast" role="status">{videoToast}</div>}
      <input ref={fileInputRef} className="file-input" type="file" accept="video/*" onChange={(event) => void importVideo(event.target.files?.[0] ?? null)} />
      {trimDialogOpen && videoUrl && <div className="video-trim-dialog-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) closeTrimDialog(); }}>
        <section className="video-trim-dialog" role="dialog" aria-modal="true" aria-label={text('裁剪时长', 'Trim Video')} onPointerDown={(event) => event.stopPropagation()}>
          <header>
            <div><Scissors size={17} /><strong>{text('裁剪时长', 'Trim Video')}</strong><span>{text(`裁后时长 ${formatMs(trimDraftEndMs - trimDraftStartMs)}`, `Trimmed duration: ${formatMs(trimDraftEndMs - trimDraftStartMs)}`)}</span></div>
            <button className="icon-button" type="button" title={text('取消', 'Cancel')} onClick={closeTrimDialog}><X size={17} /></button>
          </header>
          <div className="video-trim-preview">
            <video ref={trimPreviewRef} src={videoUrl} controls muted={previewMuted} playsInline onLoadedMetadata={(event) => { event.currentTarget.currentTime = trimPreviewMs / 1000; }} onTimeUpdate={handleTrimPreviewTimeUpdate} />
          </div>
          <div className="video-trim-dialog-timeline">
            <div className="video-trim-time-labels"><span>{formatMs(0)}</span><span>{formatMs(videoMeta.durationMs)}</span></div>
            <div className="video-trim-track" onPointerDown={handleTrimTrackPointerDown}>
              <span className="video-trim-excluded before" style={{ width: `${trimDraftStartPercent}%` }} />
              <span className="video-trim-selection" style={{ left: `${trimDraftStartPercent}%`, width: `${Math.max(0, trimDraftEndPercent - trimDraftStartPercent)}%` }} />
              <span className="video-trim-excluded after" style={{ left: `${trimDraftEndPercent}%` }} />
              <span className="video-trim-playhead" style={{ left: `${(trimPreviewMs / trimSourceDurationMs) * 100}%` }} />
              <button className="video-trim-handle start" type="button" style={{ left: `${trimDraftStartPercent}%` }} aria-label={text('裁剪开始', 'Trim Start s')} onPointerDown={(event) => beginTrimDrag(event, 'start')} onPointerMove={moveTrimDrag} onPointerUp={endTrimDrag} onPointerCancel={endTrimDrag} />
              <button className="video-trim-handle end" type="button" style={{ left: `${trimDraftEndPercent}%` }} aria-label={text('裁剪结束', 'Trim End s')} onPointerDown={(event) => beginTrimDrag(event, 'end')} onPointerMove={moveTrimDrag} onPointerUp={endTrimDrag} onPointerCancel={endTrimDrag} />
            </div>
          </div>
          <footer>
            <div className="video-trim-fields">
              <label><span>{text('开始 秒', 'Trim Start s')}</span><NumericDraftInput value={Number((trimDraftStartMs / 1000).toFixed(3))} onCommit={commitTrimDraftStart} /></label>
              <label><span>{text('结束 秒', 'Trim End s')}</span><NumericDraftInput value={Number((trimDraftEndMs / 1000).toFixed(3))} onCommit={commitTrimDraftEnd} /></label>
            </div>
            <div className="video-trim-dialog-actions">
              <button className="primary" type="button" onClick={saveTrimDraft}><Save size={16} />{text('保存裁剪', 'Save Trim')}</button>
              <button type="button" onClick={closeTrimDialog}>{text('取消', 'Cancel')}</button>
            </div>
          </footer>
        </section>
      </div>}
      <div className={`video-workbench-main ${timelineCollapsed ? 'timeline-collapsed' : ''}`} style={workbenchMainStyle}>
        <section className="video-preview-panel">
          <div className="video-info-row">
            <div><FileVideo size={17} /><strong>{videoMeta.name === DEFAULT_VIDEO_META.name ? text('未导入视频', 'No Video Imported') : videoMeta.name}</strong><span>{videoMeta.width}x{videoMeta.height}</span><span title={trimStartMs > 0 || trimEndMs < videoMeta.durationMs ? text(`源视频 ${formatMs(videoMeta.durationMs)}`, `Source ${formatMs(videoMeta.durationMs)}`) : undefined}>{trimStartMs > 0 || trimEndMs < videoMeta.durationMs ? text(`裁后 ${formatMs(trimDurationMs)}`, `Trimmed ${formatMs(trimDurationMs)}`) : formatMs(videoMeta.durationMs || renderTotal)}</span></div>
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
              onPointerDown={layerTransformMode ? undefined : beginPreviewPan}
              onPointerMove={movePreviewPan}
              onPointerUp={endPreviewPan}
              onPointerCancel={endPreviewPan}
            >
              <div className="video-stage-content" style={previewTransformStyle}>
                {videoUrl ? <video ref={videoRef} src={videoUrl} preload="auto" playsInline onLoadedMetadata={(event) => { event.currentTarget.currentTime = trimStartMs / 1000; }} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onError={(event) => { const message = videoMediaError(event.currentTarget, text); if (message) { setIsPlaying(false); setImportMessage(message); } }} onEnded={() => { setPlaybackMs(trimDurationMs); setIsPlaying(false); }} /> : <div className="video-empty"><FileVideo size={38} /><strong>{text('导入实战视频', 'Import Gameplay Video') }</strong><span>{text('视频不会写入项目文件，只在当前会话中引用。', 'The video is referenced only for this session and is not stored in the project.') }</span></div>}
                <div className={`video-combo-layer-box synced ${layerTransformMode ? 'transform-active' : ''}`} style={{ left: `${layerBounds.x}%`, top: `${layerBounds.y}%`, width: `${layerBounds.width}%`, height: `${layerBounds.height}%` }} title={layerTransformMode ? text('拖动移动整个连段图层', 'Drag to move the entire combo layer') : text('位置和尺寸来自连段图外观设置', 'Position and size come from the combo appearance settings')} onPointerDown={beginLayerMoveDrag} onPointerMove={moveLayerMoveDrag} onPointerUp={endLayerMoveDrag} onPointerCancel={endLayerMoveDrag}>
                  <div className="video-combo-layer-viewport">
                    <div className="video-combo-layer-content" style={layerContentStyle}>
                      {waterfallMode ? <VideoRhythmLayer chart={chart} style={comboImageStyle} timeMs={playbackMs} settings={rhythmUiSettings} bounds={layerSourceBounds} /> : <VideoComboLayer chart={chart} style={comboImageStyle} timeMs={playbackMs} layout={linearLayout} bounds={layerSourceBounds} />}
                    </div>
                  </div>
                  {layerTransformMode && (['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as VideoLayerCropEdge[]).map(renderLayerCropHandle)}
                  {!waterfallMode && layerPeriodLabel && <div className="video-combo-layer-period-label combo-period-label">{layerPeriodLabel}</div>}
                </div>
              </div>
              {isExporting && <div className="video-export-overlay" data-export-exclude="true" onPointerDown={(event) => event.stopPropagation()}>
                <div className="video-export-circle" style={{ '--video-export-progress': `${Math.round(clamp(exportStatus.progress, 0, 1) * 360)}deg` } as CSSProperties}><span>{Math.round(exportStatus.progress * 100)}%</span></div>
                <strong>{exportStatus.message}</strong>
                <button type="button" className="danger" onClick={cancelExport}>{text('取消导出', 'Cancel Export') }</button>
              </div>}
              <div className={`video-stage-hud ${stageHudVisible ? 'visible' : ''}`} onPointerDown={(event) => event.stopPropagation()} onMouseEnter={revealStageHud}>
                <div className="video-stage-hud-top">
                </div>
                <div className="video-stage-hud-bottom">
                </div>
              </div>
            </div>
          </div>
          <div className="video-transport-row">
            <button className="primary icon-button video-transport-play" title={isPlaying ? text('暂停（空格）', 'Pause (Space)') : text('播放（空格）', 'Play (Space)')} onClick={togglePlay} disabled={!videoUrl || isExporting}>{isPlaying ? <Pause size={14} /> : <Play size={14} />}</button>
            <div className="video-playback-menu" ref={playbackRateMenuRef}>
              <button className={`video-playback-rate ${playbackRate < 1 ? 'active' : ''}`} title={text(`播放速度：${playbackRate} 倍`, `Playback speed: ${playbackRate}x`) } onClick={() => setPlaybackRateMenuOpen((menuOpen) => !menuOpen)} disabled={!videoUrl || isExporting}>{playbackRate}×</button>
              {playbackRateMenuOpen && <div className="video-playback-menu-panel">
                <button className={playbackRate === 1 ? 'active' : ''} onClick={() => choosePlaybackRate(1)}>{text('正常 1×', 'Normal 1x') }</button>
                <button className={playbackRate === 0.5 ? 'active' : ''} onClick={() => choosePlaybackRate(0.5)}>{text('慢放 0.5×', 'Slow 0.5x') }</button>
                <button className={playbackRate === 0.2 ? 'active' : ''} onClick={() => choosePlaybackRate(0.2)}>{text('慢放 0.2×', 'Slow 0.2x') }</button>
                <button className={`video-auto-follow-option ${timelineAutoFollow ? 'active' : ''}`} type="button" aria-pressed={timelineAutoFollow} onClick={() => setTimelineAutoFollow((enabled) => !enabled)}><Check size={13} />{text('自动跟随', 'Auto Follow') }</button>
              </div>}
            </div>
            <button className={`icon-button video-preview-mute ${previewMuted ? 'active' : ''}`} type="button" aria-pressed={previewMuted} title={previewMuted ? text('取消静音', 'Unmute') : text('静音', 'Mute')} onClick={togglePreviewMuted} disabled={!videoUrl || isExporting}>{previewMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
            <span>{formatMs(playbackMs)}</span>
            <input type="range" min="0" max={Math.max(1, playbackDurationMs)} step="16" value={Math.min(playbackMs, playbackDurationMs)} onChange={(event) => seekTo(Number(event.target.value))} disabled={isExporting} />
            <span>{formatMs(playbackDurationMs)}</span>
          </div>
        </section>
        <aside className="video-side-inspector" ref={setInspectorPortalTarget}>
          <div className="video-side-toolbar" onPointerDown={(event) => event.stopPropagation()}>
            <div className="video-file-actions">
              <button className="icon-button" title={text('导入视频', 'Import Video') } onClick={() => void chooseVideo()} disabled={isExporting}><Upload size={18} /></button>
              <button className="icon-button" title={text('保存连段', 'Save Combo') } onClick={onSave} disabled={isExporting}><Save size={18} /></button>
              <button className="icon-button" title={desktop?.exportVideoWithOverlay ? text('导出 MP4', 'Export MP4') : text('下载 WebM（浏览器）', 'Download WebM (Browser)')} onClick={() => void exportVideo()} disabled={!videoUrl || isExporting}><Download size={18} /></button>
            </div>
            <button className="icon-button" title={text('关闭', 'Close') } onClick={onClose}><X size={18} /></button>
          </div>
        </aside>

        <section className={`video-edit-panel ${timelineCollapsed ? 'collapsed' : ''}`}>
          {timelineCollapsed && <button className="video-timeline-toggle floating icon-button" title={text('展开时间轴；按住拖动：上下调高度，左右调时间轴缩放；悬浮滚轮调轨道密度', 'Expand timeline. Drag vertically to resize or horizontally to zoom; hover and scroll to change lane density.')} onPointerDown={beginTimelinePanelDrag} onPointerMove={moveTimelinePanelDrag} onPointerUp={endTimelinePanelDrag} onPointerCancel={endTimelinePanelDrag} onClick={toggleTimelineCollapsedFromButton} onWheel={changeTimelineLaneHeight}>
            <PanelBottomOpen size={16} />
          </button>}
          {!timelineCollapsed && <div className="video-timeline-compact">
            <div className="video-timeline-topbar" onPointerDown={(event) => event.stopPropagation()}>
              <button className={`icon-button video-trim-trigger ${trimStartMs > 0 || trimEndMs < videoMeta.durationMs ? 'active' : ''}`} type="button" title={text('裁剪时长', 'Trim Video')} aria-label={text('裁剪时长', 'Trim Video')} onClick={openTrimDialog} disabled={!videoUrl || isExporting}><Clock3 size={16} /></button>
              <div className="video-timeline-tools-slot" ref={setToolbarPortalTarget} />
              <button className="video-timeline-toggle inline icon-button" title={text('多功能：点击收起时间轴；按住拖动时，上下调高度、左右调时间轴缩放；悬浮滚轮调轨道密度', 'Multifunction: click to collapse the timeline; drag vertically to resize or horizontally to zoom; hover and scroll to change lane density.')} onPointerDown={beginTimelinePanelDrag} onPointerMove={moveTimelinePanelDrag} onPointerUp={endTimelinePanelDrag} onPointerCancel={endTimelinePanelDrag} onClick={toggleTimelineCollapsedFromButton} onWheel={changeTimelineLaneHeight}>
                <PanelBottomClose size={16} />
              </button>
            </div>
            {enhancedTimelineEditor}
          </div>}
        </section>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
