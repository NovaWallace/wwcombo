import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, RefObject, WheelEvent as ReactWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock3, Download, FileVideo, Move, PanelBottomClose, PanelBottomOpen, Pause, Play, Redo2, Save, ScanSearch, Scissors, Undo2, Upload, Volume2, VolumeX, X } from 'lucide-react';
import { ALL_CHARACTER_SLOTS, DEFAULT_CHARACTER_SLOTS } from '../combo-core';
import type { CharacterSlot, ComboChart, ComboImageStyle, ComboPeriod, ComboStep, MoveDefinition } from '../combo-core';
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
  verticalComboTrackClipCompensation,
  visibleComboImageItems
} from './combo-image/comboImage';
import type { ComboImageMergedMove } from './combo-image/comboImage';
import { useI18n } from './i18n';
import type { AppLanguage } from './i18n';
import { localizedMovePrompt } from './moveLabels';
import { noteStepVisibleAtTime } from './noteDisplay';
import { DecoratedNoteRow, noteOperationIcon } from './noteRowDecoration';
import { NumericDraftInput } from './NumericDraftInput';
import { currentPeriodLabelAtTime } from './periodLabels';
import { buildRhythmCrowdedGroups, rhythmNoteHeight, rhythmNoteOpacity, rhythmNoteTop, visibleRhythmCrowdedGroups } from './rhythmCrowding';
import { shortcutMatches } from './shortcutSettings';
import type { ShortcutSettings } from './shortcutSettings';
import { roundedTextOutlineShadow } from './textOutline';
import { HoldDragFeedback } from './HoldDragFeedback';
import { keyMappingDisplayBounds, loadStoredKeyMappingConfig } from './keyMappingTypes';
import {
  buildVideoRecognitionRequest,
  combineVideoRecognitionWithExistingChart,
  DEFAULT_VIDEO_RECOGNITION_HOTSPOTS,
  normalizeVideoRecognitionBounds,
  recognitionHeightForWidth,
  recognizedChartFromVideo
} from './videoKeyMappingRecognition';
import type {
  VideoRecognitionBounds,
  VideoRecognitionProgress,
  VideoRecognitionResult
} from './videoKeyMappingRecognition';

type ComboLayout = 'horizontal' | 'vertical' | 'stair' | 'waterfall';
type LinearComboLayout = 'horizontal' | 'vertical';
type RhythmUiSettings = { width: number; height: number; scale: number; laneGap: number; roleSpacing: number; fallSpeed: number; judgeLineOffset: number; ringStartScale: number; ringEndScale: number; ringOffsetX: number; ringOffsetY: number; ringDurationMs: number; feedbackX?: number; feedbackY?: number };
type VideoLayerBounds = { x: number; y: number; width: number; height: number };
type DisplayMetrics = { width: number; height: number; scaleFactor: number };
type LayerInsets = { left: number; top: number; right: number; bottom: number };
type VideoLayerTransform = { offsetX: number; offsetY: number; scale: number; cropLeft: number; cropTop: number; cropRight: number; cropBottom: number };
type VideoLayerMoveDrag = { pointerId: number; startX: number; startY: number; viewScale: number; origin: VideoLayerTransform; moved: boolean; historyCaptured: boolean };
type VideoLayerScaleDrag = { pointerId: number; startX: number; origin: VideoLayerTransform; moved: boolean; historyCaptured: boolean; longPressTimer: number | null; resetTriggered: boolean };
type VideoLayerCropEdge = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
type VideoTrimMode = 'video' | 'flowchart';
type VideoLayerCropDrag = { pointerId: number; edge: VideoLayerCropEdge; startX: number; startY: number; viewScale: number; origin: VideoLayerTransform; moved: boolean; historyCaptured: boolean };
type VideoNoteBounds = { x: number; y: number; width: number; height: number; scale: number };
type VideoNoteDrag = { pointerId: number; edge: VideoLayerCropEdge | ''; startX: number; startY: number; hostWidth: number; hostHeight: number; origin: VideoNoteBounds };
type VideoNoteScaleDrag = { pointerId: number; startX: number; origin: VideoNoteBounds; moved: boolean; longPressTimer: number | null; resetTriggered: boolean };
type VideoTrimDrag = { pointerId: number; edge: 'start' | 'end'; trackLeft: number; trackWidth: number };
type OverlaySettings = { layout: ComboLayout; x: number; y: number; width: number; height: number };
type WorkbenchHistorySnapshot = {
  chart: ComboChart;
  contentLabels: Record<string, string>;
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
  longPressTimer: number | null;
  resetTriggered: boolean;
};

type RecognitionBoundsDrag = {
  pointerId: number;
  mode: 'move' | VideoLayerCropEdge;
  startX: number;
  startY: number;
  origin: VideoRecognitionBounds;
  hostWidth: number;
  hostHeight: number;
};

type VideoWorkbenchDesktopBridge = Pick<NonNullable<Window['trainerDesktop']>, 'pickVideoFile' | 'analyzeVideoKeyMapping' | 'cancelVideoKeyMappingRecognition' | 'onVideoKeyMappingRecognitionProgress' | 'exportVideoWithOverlay' | 'cancelVideoExport' | 'onVideoExportProgress'>;

type VideoAxisWorkbenchProps = {
  open: boolean;
  desktop?: VideoWorkbenchDesktopBridge | null;
  chart: ComboChart;
  moves: MoveDefinition[];
  startingCharacterSlot: CharacterSlot;
  recognitionBasedOnTextAxis: boolean;
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
  getDisplaySize?: () => Promise<{ width: number; height: number; scaleFactor?: number }>;
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

type RecognitionStatus = {
  state: 'idle' | 'running' | 'done' | 'error';
  message: string;
};

type ImageCache = Map<string, HTMLImageElement | null>;

const CHARACTER_SLOTS: CharacterSlot[] = [1, 2, 3];
const MIN_STEP_DURATION = 35;
const MIN_VIDEO_TIMELINE_HEIGHT = 88;
const MAX_VIDEO_TIMELINE_HEIGHT_RATIO = 0.52;
const TIMELINE_TOGGLE_DRAG_THRESHOLD = 4;
const MIN_VIDEO_TIMELINE_LANE_HEIGHT = 24;
const MAX_VIDEO_TIMELINE_LANE_HEIGHT = 64;
const DEFAULT_VIDEO_NOTE_BOUNDS: VideoNoteBounds = { x: 4, y: 8, width: 28, height: 48, scale: 1 };
const DEFAULT_VIDEO_LAYER_TRANSFORM: VideoLayerTransform = { offsetX: 0, offsetY: 0, scale: 1, cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 };
const MAX_VIDEO_LAYER_HORIZONTAL_CROP_WIDTH_FACTOR = 4;
const MOVE_BUTTON_RESET_HOLD_MS = 3000;
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

function currentScreenSize(settings: OverlaySettings): DisplayMetrics {
  const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  const cssWidth = Math.max(1, Math.round(window.screen?.width || window.screen?.availWidth || window.innerWidth || 1920));
  const cssHeight = Math.max(1, Math.round(window.screen?.height || window.screen?.availHeight || window.innerHeight || 1080));
  const scaledWidth = Math.max(1, Math.round(cssWidth * dpr));
  const scaledHeight = Math.max(1, Math.round(cssHeight * dpr));
  const overlayRight = Math.max(settings.width, settings.x + settings.width);
  const overlayBottom = Math.max(settings.height, settings.y + settings.height);
  const cssLooksTooSmall = overlayRight > cssWidth * 1.04 || overlayBottom > cssHeight * 1.04;
  const scaledCanContainOverlay = overlayRight <= scaledWidth * 1.12 && overlayBottom <= scaledHeight * 1.12;
  return cssLooksTooSmall && scaledCanContainOverlay
    ? { width: scaledWidth, height: scaledHeight, scaleFactor: dpr }
    : { width: cssWidth, height: cssHeight, scaleFactor: 1 };
}

function normalizeDisplaySize(value: { width: number; height: number; scaleFactor?: number } | null | undefined): DisplayMetrics | null {
  const width = Math.round(value?.width ?? 0);
  const height = Math.round(value?.height ?? 0);
  const scaleFactor = Number.isFinite(value?.scaleFactor) && Number(value?.scaleFactor) > 0 ? Number(value?.scaleFactor) : 1;
  return width > 0 && height > 0 ? { width, height, scaleFactor } : null;
}

function storedRecognitionBounds(screenSize: { width: number; height: number }): VideoRecognitionBounds {
  const mapping = keyMappingDisplayBounds(loadStoredKeyMappingConfig());
  return normalizeVideoRecognitionBounds({
    x: (mapping.x / Math.max(1, screenSize.width)) * 100,
    y: (mapping.y / Math.max(1, screenSize.height)) * 100,
    width: (mapping.width / Math.max(1, screenSize.width)) * 100,
    height: (mapping.height / Math.max(1, screenSize.height)) * 100
  });
}

function recognitionBoundsWithCanvasAspect(value: VideoRecognitionBounds, videoWidth: number, videoHeight: number): VideoRecognitionBounds {
  const normalized = normalizeVideoRecognitionBounds(value);
  let width = normalized.width;
  let height = recognitionHeightForWidth(width, videoWidth, videoHeight);
  if (height > 100) {
    width *= 100 / height;
    height = recognitionHeightForWidth(width, videoWidth, videoHeight);
  }
  return normalizeVideoRecognitionBounds({
    x: clamp(normalized.x, 0, 100 - width),
    y: clamp(normalized.y, 0, 100 - height),
    width,
    height
  });
}

function recognitionHoldCount(result: VideoRecognitionResult): number {
  const hotspots = new Map(DEFAULT_VIDEO_RECOGNITION_HOTSPOTS.map((hotspot) => [hotspot.id, hotspot]));
  return result.events.filter((event) => {
    const hotspot = hotspots.get(event.hotspotId);
    return Boolean(hotspot?.holdMoveId && hotspot.holdThresholdMs && event.durationMs >= hotspot.holdThresholdMs);
  }).length;
}

function localizedRecognitionError(error: unknown, text: (chinese: string, english: string) => string): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes('已取消')) return text('视频按键识别已取消。', 'Video key recognition was cancelled.');
  if (raw.includes('视频文件不存在')) return text('视频原文件不存在，请重新导入后再试。', 'The original video file is missing. Re-import it and try again.');
  if (raw.includes('ffmpeg')) return text('ffmpeg 无法完成视频识别，请检查安装文件后重试。', 'FFmpeg could not complete video recognition. Check the application files and try again.');
  if (raw.includes('识别区域') || raw.includes('按键位置')) return text('识别区域无效，请调整识别框后重试。', 'The recognition region is invalid. Adjust the frame and try again.');
  return `${text('视频识别失败', 'Video recognition failed')}: ${raw}`;
}

function overlayBoundsToVideoPercent(settings: OverlaySettings, screenSize: { width: number; height: number }): VideoLayerBounds {
  return {
    x: (settings.x / screenSize.width) * 100,
    y: (settings.y / screenSize.height) * 100,
    width: (settings.width / screenSize.width) * 100,
    height: (settings.height / screenSize.height) * 100
  };
}

function overlaySourceBounds(settings: OverlaySettings, screenSize: DisplayMetrics): { width: number; height: number } {
  const scaleFactor = Math.max(0.1, screenSize.scaleFactor);
  return {
    width: Math.max(1, settings.width / scaleFactor),
    height: Math.max(1, settings.height / scaleFactor)
  };
}

function overlayShellInsets(settings: OverlaySettings, screenSize: DisplayMetrics): LayerInsets {
  if (settings.layout !== 'vertical') return { left: 0, top: 0, right: 0, bottom: 0 };
  const indicatorOnRight = settings.x + settings.width / 2 < screenSize.width / 2;
  return indicatorOnRight
    ? { left: 72, top: 10, right: 42, bottom: 10 }
    : { left: 58, top: 10, right: 48, bottom: 10 };
}

function fitLayerInsets(bounds: { width: number; height: number }, insets: LayerInsets): LayerInsets {
  const horizontalInset = insets.left + insets.right;
  const verticalInset = insets.top + insets.bottom;
  const horizontalScale = horizontalInset > 0 ? Math.max(0, (bounds.width - 24) / horizontalInset) : 1;
  const verticalScale = verticalInset > 0 ? Math.max(0, (bounds.height - 24) / verticalInset) : 1;
  const scale = Math.min(1, horizontalScale, verticalScale);
  return {
    left: insets.left * scale,
    top: insets.top * scale,
    right: insets.right * scale,
    bottom: insets.bottom * scale
  };
}

function insetSourceBounds(bounds: { width: number; height: number }, insets: LayerInsets): { width: number; height: number } {
  return {
    width: Math.max(1, bounds.width - insets.left - insets.right),
    height: Math.max(1, bounds.height - insets.top - insets.bottom)
  };
}

function insetLayerBounds(bounds: VideoLayerBounds, sourceBounds: { width: number; height: number }, insets: LayerInsets): VideoLayerBounds {
  const scaleX = bounds.width / Math.max(1, sourceBounds.width);
  const scaleY = bounds.height / Math.max(1, sourceBounds.height);
  return {
    x: bounds.x + insets.left * scaleX,
    y: bounds.y + insets.top * scaleY,
    width: Math.max(0.1, bounds.width - (insets.left + insets.right) * scaleX),
    height: Math.max(0.1, bounds.height - (insets.top + insets.bottom) * scaleY)
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
    '--combo-avatar-content-inset': `${showAvatar ? Math.max(0, avatarLeft + avatarSize + 4) : 44}px`,
    '--active-frame-left': `${showAvatar ? Math.min(-bleed, avatarLeft - bleed) : -bleed}px`,
    '--active-frame-right': `${-bleed}px`,
    '--active-frame-top': `${showAvatar ? Math.min(-bleed, avatarTop - bleed) : -bleed}px`,
    '--active-frame-bottom': `${showAvatar ? Math.min(-bleed, blockHeight - avatarBottom - bleed) : -bleed}px`
  } as CSSProperties;
}

function CapsuleBlockBackground() {
  return <div className="capsule-bg" aria-hidden="true"><div className="capsule-bg-edge left top" /><div className="capsule-bg-edge left bottom" /><div className="capsule-bg-edge middle top" /><div className="capsule-bg-edge middle bottom" /><div className="capsule-bg-edge right top" /><div className="capsule-bg-edge right bottom" /><div className="capsule-bg-body"><div className="capsule-bg-piece left" /><div className="capsule-bg-piece middle" /><div className="capsule-bg-piece right" /></div></div>;
}

function ComboInlineContent({ parts, className, hideIconAlt = false, textStyle, inline = false }: { parts: ReturnType<typeof comboTextParts>; className: string; hideIconAlt?: boolean; textStyle?: CSSProperties; inline?: boolean }) {
  const content = parts.map((part, index) => part.kind === 'icon' ? <span key={`${part.iconId}-${index}`} className="combo-inline-icon-mark" style={{ '--icon-scale': part.iconScale, '--icon-width-scale': part.iconWidthScale } as CSSProperties}><img className="combo-inline-icon" alt={hideIconAlt ? '' : part.label} title={part.label} src={part.src} /></span> : <span key={`text-${index}`}>{part.value}</span>);
  return inline ? <span className={className} style={textStyle}>{content}</span> : <strong className={className} style={textStyle}>{content}</strong>;
}

function ComboMergedMoveContent({ groups, mappings, convertIcons, className, activeStepId, textStyle }: { groups: ComboImageMergedMove[]; mappings: ComboImageStyle['iconMappings']; convertIcons: boolean; className: string; activeStepId?: string; textStyle?: CSSProperties }) {
  return <strong className={className} style={textStyle}>{groups.map((group) => {
    const activeIndex = activeStepId ? group.stepIds.indexOf(activeStepId) : -1;
    return <span key={group.stepIds[0]} className="combo-merged-move">
      {group.renderAsIcon && group.iconSrc ? <><span className="combo-merged-move-body">
        <span className={`combo-inline-icon-mark ${activeIndex >= 0 ? 'active' : ''}`} style={{ '--icon-scale': group.iconScale ?? 1, '--icon-width-scale': group.iconWidthScale ?? 1 } as CSSProperties}><img className="combo-inline-icon" src={group.iconSrc} alt={group.iconLabel ?? ''} title={group.iconLabel ?? ''} /></span>
        {group.count > 1 && <span className="combo-merged-move-count">{`x${group.count}`}</span>}
      </span>
      {group.count > 1 && <span className="combo-merged-move-progress" aria-hidden="true">{Array.from({ length: group.count }, (_, index) => <span key={index} className={`combo-merged-move-marker dot ${activeIndex >= index ? 'active' : ''}`} />)}</span>}</> : <ComboInlineContent parts={comboTextParts(group.displayText, convertIcons, mappings)} className={`combo-merged-move-fallback ${activeIndex >= 0 ? 'active' : ''}`} inline />}
    </span>;
  })}</strong>;
}

function comboTextStrokeStyle(style: ComboImageStyle): CSSProperties | undefined {
  if (!style.textStrokeEnabled || style.textStrokeWidth <= 0) return undefined;
  const width = Math.max(1, style.textStrokeWidth);
  return {
    textShadow: roundedTextOutlineShadow(true, width, style.textStrokeColor)
  };
}

function ComboItemContent({ item, parts, mappings, convertIcons, className, activeStepId, textStyle }: { item: ReturnType<typeof chartToComboImageItems>[number]; parts: ReturnType<typeof comboTextParts>; mappings: ComboImageStyle['iconMappings']; convertIcons: boolean; className: string; activeStepId?: string; textStyle?: CSSProperties }) {
  if (item.mergedMoveGroups?.length) return <ComboMergedMoveContent groups={item.mergedMoveGroups} mappings={mappings} convertIcons={convertIcons} className={className} activeStepId={activeStepId} textStyle={textStyle} />;
  if (item.mergedParts?.length && activeStepId) {
    return <strong className={className} style={textStyle}>{item.mergedParts.map((part) => {
      const active = part.stepId === activeStepId;
      return <span key={part.stepId} className={active ? 'combo-merged-part active' : 'combo-merged-part'}>{comboTextParts(part.displayText, convertIcons, mappings).map((piece, index) => piece.kind === 'icon' ? <span key={`${piece.iconId}-${index}`} className={active ? 'combo-inline-icon-mark active' : 'combo-inline-icon-mark'} style={{ '--icon-scale': piece.iconScale, '--icon-width-scale': piece.iconWidthScale } as CSSProperties}><img className="combo-inline-icon" src={piece.src} alt={piece.label} title={piece.label} /></span> : <span key={`text-${index}`}>{piece.value}</span>)}</span>;
    })}</strong>;
  }
  return <ComboInlineContent parts={parts} className={className} textStyle={textStyle} />;
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
  if (!style.showNotesSeparately && step.note?.trim()) return step.note.trim();
  const contentText = style.contentLabels[step.id]?.trim() || defaultComboContentLabelForMoveId(step.moveId);
  return localizedMovePrompt(step.moveId, displayMoveLabel(step), contentText, language, step.customLabel === true);
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
  items.forEach((item) => comboTextParts(item.displayText, Boolean(item.iconId), effectiveIconMappings(style, item.characterSlot)).forEach((part) => {
    if (part.kind === 'icon') sources.add(part.src);
  }));
  chart.steps.forEach((step) => {
    const slot = (step.characterSlot ?? 1) as CharacterSlot;
    const display = rhythmStepText(step, style);
    comboTextParts(display.text, display.useIcons, effectiveIconMappings(style, slot)).forEach((part) => {
      if (part.kind === 'icon') sources.add(part.src);
    });
    const noteIcon = noteOperationIcon(step, style);
    if (noteIcon) sources.add(noteIcon.src);
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

type ComboTextPartLayout = { left: number; width: number; iconSize?: number; iconWidth?: number; markerSize?: number; markerHeight?: number };

function measureComboTextParts(ctx: CanvasRenderingContext2D, parts: ReturnType<typeof comboTextParts>, fontSize: number): ComboTextPartLayout[] {
  const gap = fontSize * 0.18;
  let cursor = 0;
  return parts.map((part, index) => {
    if (part.kind === 'icon') {
      const markerHeight = fontSize * 1.62 * part.iconScale;
      const markerSize = markerHeight * part.iconWidthScale;
      const iconSize = fontSize * 1.45 * part.iconScale;
      const iconWidth = iconSize * part.iconWidthScale;
      const layout = { left: cursor, width: markerSize, iconSize, iconWidth, markerSize, markerHeight };
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

function drawCanvasText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, maxWidth: number, style?: ComboImageStyle) {
  if (style?.textStrokeEnabled && style.textStrokeWidth > 0) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(1, style.textStrokeWidth * 2);
    ctx.strokeStyle = style.textStrokeColor;
    ctx.strokeText(value, x, y, maxWidth);
    ctx.restore();
  }
  ctx.fillText(value, x, y, maxWidth);
}

function drawComboTextParts(ctx: CanvasRenderingContext2D, parts: ReturnType<typeof comboTextParts>, x: number, y: number, maxWidth: number, fontSize: number, imageCache: ImageCache, drawIconFallbackText = true, style?: ComboImageStyle) {
  const layout = measureComboTextParts(ctx, parts, fontSize);
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const partLayout = layout[index];
    const partX = x + partLayout.left;
    if (partX >= x + maxWidth) return;
    if (part.kind === 'icon') {
      const image = loadCanvasImage(part.src, imageCache);
      const markerSize = partLayout.markerSize ?? fontSize * 1.62 * part.iconScale * part.iconWidthScale;
      const size = partLayout.iconSize ?? fontSize * 1.45 * part.iconScale;
      const imageWidth = partLayout.iconWidth ?? size * part.iconWidthScale;
      if (image) {
        ctx.drawImage(image, partX + (markerSize - imageWidth) / 2, y - size / 2, imageWidth, size);
        continue;
      }
      if (drawIconFallbackText) drawCanvasText(ctx, part.label, partX, y, Math.max(1, x + maxWidth - partX), style);
      continue;
    }
    drawCanvasText(ctx, part.value, partX, y, Math.max(1, x + maxWidth - partX), style);
  }
}

function drawMergedMoveGroups(ctx: CanvasRenderingContext2D, groups: ComboImageMergedMove[], x: number, y: number, maxWidth: number, fontSize: number, imageCache: ImageCache, mappings: ComboImageStyle['iconMappings'], activeStepId?: string, style?: ComboImageStyle) {
  const bodyGap = fontSize * 0.16;
  const groupGap = fontSize * 0.3;
  let cursor = x;
  groups.forEach((group) => {
    if (!group.renderAsIcon || !group.iconSrc) {
      if (cursor >= x + maxWidth) return;
      const fallbackParts = comboTextParts(group.displayText, true, mappings);
      const fallbackWidth = Math.max(fontSize, comboTextPartsWidth(measureComboTextParts(ctx, fallbackParts, fontSize)) + fontSize * 0.3);
      drawComboTextParts(ctx, fallbackParts, cursor, y, Math.max(1, Math.min(fallbackWidth, x + maxWidth - cursor)), fontSize, imageCache, true, style);
      cursor += fallbackWidth + groupGap;
      return;
    }
    const markerHeight = fontSize * 1.62 * (group.iconScale ?? 1);
    const markerWidth = markerHeight * (group.iconWidthScale ?? 1);
    const countText = group.count > 1 ? `x${group.count}` : '';
    const countWidth = countText ? ctx.measureText(countText).width : 0;
    const groupWidth = markerWidth + (countText ? bodyGap + countWidth : 0);
    if (cursor >= x + maxWidth) return;
    const activeIndex = activeStepId ? group.stepIds.indexOf(activeStepId) : -1;
    if (activeIndex >= 0) {
      roundedRect(ctx, cursor, y - markerHeight / 2, markerWidth, markerHeight, Math.max(3, fontSize * 0.18));
      ctx.fillStyle = 'rgba(255,224,55,0.98)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.92)';
      ctx.stroke();
    }
    const image = loadCanvasImage(group.iconSrc, imageCache);
    const iconSize = fontSize * 1.45 * (group.iconScale ?? 1);
    const iconWidth = iconSize * (group.iconWidthScale ?? 1);
    if (image) ctx.drawImage(image, cursor + (markerWidth - iconWidth) / 2, y - iconSize / 2, iconWidth, iconSize);
    else drawCanvasText(ctx, group.iconLabel ?? group.displayText, cursor, y, markerWidth, style);
    if (countText) {
      ctx.fillStyle = '#fff';
      drawCanvasText(ctx, countText, cursor + markerWidth + bodyGap, y, Math.max(1, maxWidth - (cursor - x) - markerWidth - bodyGap), style);
    }
    if (group.count > 1) {
      const dotSize = Math.max(2, fontSize * 0.22);
      const dotGap = fontSize * 0.12;
      const dotsWidth = group.count * dotSize + (group.count - 1) * dotGap;
      const dotsLeft = cursor + Math.max(0, (groupWidth - dotsWidth) / 2);
      for (let index = 0; index < group.count; index += 1) {
        const dotX = dotsLeft + index * (dotSize + dotGap);
        ctx.beginPath();
        ctx.arc(dotX + dotSize / 2, y + markerHeight * 0.58, dotSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = activeIndex >= index ? '#ffe037' : '#fff';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#050505';
        ctx.stroke();
      }
    }
    cursor += groupWidth + groupGap;
  });
}


function drawVideoPeriodLabel(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, maxWidth: number, align: CanvasTextAlign, baseline: CanvasTextBaseline, fontSize: number) {
  if (!label || maxWidth < 8) return;
  ctx.save();
  ctx.font = `900 ${fontSize}px Microsoft YaHei, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.22));
  ctx.strokeStyle = 'rgba(0,0,0,0.82)';
  ctx.strokeText(label, x, y, maxWidth);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, x, y, maxWidth);
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
      drawComboTextParts(ctx, parts, noteX + 4, top + noteHeight / 2, noteWidth - 8, 20, imageCache, false, style);
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
    parts.forEach((part, index) => drawComboTextParts(ctx, [part], panelX + 6, panelY + 4 + rowHeight * index + rowHeight / 2, panelWidth - 12, 22, imageCache, false, style));
    });
  });
  ctx.restore();
}

function drawComboLayerToCanvas(ctx: CanvasRenderingContext2D, chart: ComboChart, style: ComboImageStyle, timeMs: number, contentBounds: VideoLayerBounds, clipBounds: VideoLayerBounds, layout: LinearComboLayout, overlayBounds: { width: number; height: number }, canvasWidth: number, canvasHeight: number, imageCache: ImageCache, language: AppLanguage, stairMode = false) {
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
  const periodLabel = currentPeriodLabelAtTime(chart, timeMs, language);
  const visibleItems = visibleComboImageItems(allItems, activeIndex, layout, overlayBounds, style);
  const firstVisibleItem = visibleItems[0];
  const firstVisibleIndex = firstVisibleItem ? allItems.indexOf(firstVisibleItem) : -1;
  const verticalTopCompensation = layout === 'vertical' && firstVisibleIndex >= 0
    ? verticalComboTrackClipCompensation(style, firstVisibleItem, metrics[firstVisibleIndex]?.start ?? 0, trackOffset, periodLabel ? 26 : 0)
    : 0;
  const renderTrackOffset = trackOffset + verticalTopCompensation;

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
  let cursor = renderTrackOffset;
  allItems.forEach((item, index) => {
    const role = style.roleStyles[item.characterSlot];
    const size = comboImageItemSizeForDisplayItem(style, item, role);
    const chipHeight = Math.max(1, size.height);
    const chipWidth = Math.max(1, size.width);
    const chipX = layout === 'vertical' ? Math.max(0, (sourceWidth - chipWidth) / 2) : cursor;
    const chipY = layout === 'vertical' ? cursor : (sourceHeight - chipHeight) / 2 + (stairMode ? (item.characterSlot - 2) * style.stairRoleOffset : 0);
    const visible = layout === 'vertical' ? chipY + chipHeight >= -12 && chipY <= sourceHeight + 12 : chipX + chipWidth >= -12 && chipX <= sourceWidth + 12;
    if (visible) {
      const active = index === activeIndex;
      const opacity = style.prePromptEnabled && index === activeIndex + 1 ? 1 : comboItemOpacity(metrics[index], activeMetric, renderTrackOffset, layout, overlayBounds, style);
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
      const mappings = effectiveIconMappings(style, item.characterSlot);
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
      if (activeMergedPart && item.mergedParts && !item.mergedMoveGroups?.length) {
        const contentLeft = textX;
        const contentRight = chipX + chipWidth - 14;
        let mergedCursor = contentLeft;
        let activePartLeft = contentLeft;
        let activePartWidth = 0;
        let activeIconBounds: { left: number; width: number; highlightHeight: number }[] = [];

        item.mergedParts.forEach((mergedPart, mergedIndex) => {
          const mergedTextParts = comboTextParts(mergedPart.displayText, Boolean(mergedPart.iconId), mappings);
          const mergedTextLayout = measureComboTextParts(ctx, mergedTextParts, fontSize);
          const mergedPartWidth = comboTextPartsWidth(mergedTextLayout);
          if (mergedPart.stepId === activeStepId) {
            activePartLeft = mergedCursor;
            activePartWidth = mergedPartWidth;
            activeIconBounds = mergedTextParts.flatMap((part, index) => {
              if (part.kind !== 'icon') return [];
              const markerHeight = mergedTextLayout[index].markerHeight ?? fontSize * 1.62 * part.iconScale;
              const markerSize = mergedTextLayout[index].markerSize ?? markerHeight * part.iconWidthScale;
              return [{ left: mergedCursor + mergedTextLayout[index].left, width: markerSize, highlightHeight: markerHeight }];
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
            const highlightHeight = Math.max(18, bounds.highlightHeight);
            const highlightWidth = Math.max(18, bounds.width);
            roundedRect(ctx, center - highlightWidth / 2, chipY + chipHeight / 2 - highlightHeight / 2, highlightWidth, highlightHeight, Math.max(3, fontSize * 0.18));
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
      if (periodLabel && (layout === 'horizontal' ? comboImageItemContainsStep(item, activeStepId) : item === firstVisibleItem)) {
        const labelFontSize = Math.max(12, Math.round(style.fontSize * 0.82));
        if (layout === 'vertical') {
          drawVideoPeriodLabel(ctx, periodLabel, chipX, chipY - 7, Math.max(40, chipWidth), 'left', 'bottom', labelFontSize);
        } else {
          drawVideoPeriodLabel(ctx, periodLabel, chipX + chipWidth / 2, chipY + chipHeight + 9, Math.max(40, chipWidth * 1.4), 'center', 'top', labelFontSize);
        }
      }
      ctx.fillStyle = style.textColor || '#fff';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 6;
      if (item.mergedMoveGroups?.length) {
        drawMergedMoveGroups(ctx, item.mergedMoveGroups, textX, chipY + chipHeight / 2, Math.max(24, chipWidth - (textX - chipX) - 14), fontSize, imageCache, mappings, activeStepId, style);
      } else if (style.blockMode === 'image') {
        drawComboTextParts(ctx, parts, textX, chipY + chipHeight / 2, Math.max(24, chipWidth - (textX - chipX) - 14), fontSize, imageCache, true, style);
      } else {
        drawComboTextParts(ctx, parts, textX, chipY + chipHeight / 2, Math.max(24, chipWidth - (textX - chipX) - 12), fontSize, imageCache, true, style);
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    cursor += (layout === 'vertical' ? chipHeight : chipWidth) + style.capsuleGap;
  });
  ctx.restore();
}

function VideoComboLayer({ chart, style, timeMs, layout, bounds, stairMode = false }: { chart: ComboChart; style: ComboImageStyle; timeMs: number; layout: LinearComboLayout; bounds: { width: number; height: number }; stairMode?: boolean }) {
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
  const periodLabel = currentPeriodLabelAtTime(chart, timeMs, language);
  const firstVisibleItem = visibleItems[0];
  const firstVisibleIndex = firstVisibleItem ? allItems.indexOf(firstVisibleItem) : -1;
  const verticalTopCompensation = layout === 'vertical' && firstVisibleIndex >= 0
    ? verticalComboTrackClipCompensation(style, firstVisibleItem, metrics[firstVisibleIndex]?.start ?? 0, trackOffset, periodLabel ? 26 : 0)
    : 0;
  const renderTrackOffset = trackOffset + verticalTopCompensation;
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
      <div className={`combo-preview video-combo-layer-preview ${layout} next-indicator-above ${periodLabel && layout === 'horizontal' ? 'period-label-below' : ''} ${visibleItems.length ? '' : 'empty'}`} style={{ width: bounds.width, height: bounds.height, transform: `scale(${scaleX}, ${scaleY})`, '--combo-vertical-image-overlap': `${Math.max(0, Math.round(style.capsuleHeight * 0.42))}px` } as CSSProperties}>
        {visibleItems.length ? (
          <div className="combo-preview-track" style={{ gap: style.capsuleGap, transform: layout === 'vertical' ? `translateY(${renderTrackOffset}px)` : `translateX(${renderTrackOffset}px)` }}>
            {visibleItems.map((item) => {
              const role = style.roleStyles[item.characterSlot];
              const size = comboImageItemSizeForDisplayItem(style, item, role);
              const mappings = effectiveIconMappings(style, role);
              const parts = comboTextParts(item.displayText, Boolean(item.iconId), mappings);
              const blockColor = style.blockMode === 'capsule' ? role.color : 'transparent';
              const blockImageStyle = capsuleImageStyle(style, size.width, size.height, role);
              const avatarLeft = style.avatarOffsetX;
              const metricIndex = allItems.indexOf(item);
              const isActive = comboImageItemContainsStep(item, activeStepId);
              const isNext = style.prePromptEnabled && metricIndex === activeIndex + 1;
              return (
                <div key={item.step.id} className={`combo-preview-chip ${style.blockMode === 'image' ? 'image-block' : ''} ${item.showAvatar ? 'with-avatar' : ''} ${isActive ? 'active' : ''} ${isNext ? 'next' : ''}`} style={{ width: size.width, height: size.height, color: style.textColor, fontSize: style.fontSize, fontFamily: style.fontFamily, transform: stairMode ? `translateY(${(item.characterSlot - 2) * style.stairRoleOffset}px)` : undefined, opacity: isNext ? 1 : comboItemOpacity(metrics[metricIndex], activeMetric, renderTrackOffset, layout, bounds, style), backgroundColor: blockColor, borderRadius: style.blockMode === 'capsule' && style.capsuleShape === 'capsule' ? 999 : 4, '--move-color': role.color, ...activeFrameVars(item.showAvatar, style.blockMode, avatarLeft, style.avatarSize, style.avatarOffsetY, size.height), ...blockImageStyle } as CSSProperties}>
                  {style.blockMode === 'image' && <CapsuleBlockBackground />}
                  {item.showAvatar && <span className="avatar-slot preview-avatar" style={{ width: style.avatarSize, height: style.avatarSize, left: avatarLeft, transform: `translateY(calc(-50% + ${style.avatarOffsetY}px))`, ...imageCropBackground(role.avatar, role.avatarCrop) }}>{role.avatar ? null : item.characterSlot}</span>}
                  {promptText && comboImageItemContainsStep(item, activeStepId) && <div className={`combo-preview-action-prompt ${layout === 'vertical' ? 'vertical right' : 'horizontal above'}`}>{promptText}</div>}
                  {periodLabel && (layout === 'horizontal' ? isActive : item === firstVisibleItem) && <div className={`combo-period-label inline ${layout === 'vertical' ? 'vertical left' : 'horizontal below'}`}>{periodLabel}</div>}
                  <ComboItemContent item={item} parts={parts} mappings={mappings} convertIcons={style.convertIcons} className="combo-preview-content" activeStepId={activeStepId} textStyle={comboTextStrokeStyle(style)} />
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
  const slot = /^switch_[1234]$/.test(step.moveId) ? Number(step.moveId.slice(-1)) as CharacterSlot : null;
  return {
    text: style.contentLabels[step.id]?.trim() || defaultComboContentLabelForMoveId(step.moveId) || displayMoveLabel(step),
    useIcons: style.convertIcons || slot !== null
  };
}

function rhythmActiveSlotAt(steps: ComboStep[], timeMs: number): CharacterSlot {
  const first = (steps[0]?.characterSlot ?? 1) as CharacterSlot;
  const latestSwitch = steps.filter((step) => step.startMin <= timeMs && /^switch_[1234]$/.test(step.moveId)).sort((a, b) => b.startMin - a.startMin)[0];
  if (latestSwitch?.moveId === 'switch_2') return 2;
  if (latestSwitch?.moveId === 'switch_3') return 3;
  if (latestSwitch?.moveId === 'switch_4') return 4;
  return latestSwitch ? 1 : first;
}

function VideoRhythmLayer({ chart, style, timeMs, settings, bounds }: { chart: ComboChart; style: ComboImageStyle; timeMs: number; settings: RhythmUiSettings; bounds: { width: number; height: number } }) {
  const { language } = useI18n();
  const CHARACTER_SLOTS = chart.characterCount === 4 ? ALL_CHARACTER_SLOTS : DEFAULT_CHARACTER_SLOTS;
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

function videoNoteList(chart: ComboChart, style: ComboImageStyle, timeMs: number): ComboStep[] {
  const notes = chart.steps
    .filter((step) => Boolean(step.note?.trim()) && noteStepVisibleAtTime(step, timeMs))
    .sort((left, right) => left.startMin - right.startMin || left.id.localeCompare(right.id));
  return style.noteOrder === 'oldest-top' ? notes : notes.reverse();
}

function VideoNotesLayer({ chart, style, timeMs, bounds, moveMode, hostRef, onBoundsChange }: {
  chart: ComboChart;
  style: ComboImageStyle;
  timeMs: number;
  bounds: VideoNoteBounds;
  moveMode: boolean;
  hostRef: RefObject<HTMLElement | null>;
  onBoundsChange: (bounds: VideoNoteBounds) => void;
}) {
  const dragRef = useRef<VideoNoteDrag | null>(null);
  const notes = videoNoteList(chart, style, timeMs);
  if (!style.showNotesSeparately) return null;
  const beginDrag = (event: ReactPointerEvent<HTMLElement>, edge: VideoNoteDrag['edge'] = '') => {
    if (!moveMode || event.button !== 0 || dragRef.current) return;
    const host = hostRef.current;
    if (!host) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = host.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, edge, startX: event.clientX, startY: event.clientY, hostWidth: Math.max(1, rect.width), hostHeight: Math.max(1, rect.height), origin: { ...bounds } };
  };
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = (event.clientX - drag.startX) / drag.hostWidth * 100;
    const dy = (event.clientY - drag.startY) / drag.hostHeight * 100;
    const base = drag.origin;
    const next = { ...base };
    if (!drag.edge) { next.x = base.x + dx; next.y = base.y + dy; }
    if (drag.edge.includes('e')) next.width = Math.max(8, base.width + dx);
    if (drag.edge.includes('s')) next.height = Math.max(8, base.height + dy);
    if (drag.edge.includes('w')) { next.width = Math.max(8, base.width - dx); next.x = next.width === 8 ? base.x + base.width - 8 : base.x + dx; }
    if (drag.edge.includes('n')) { next.height = Math.max(8, base.height - dy); next.y = next.height === 8 ? base.y + base.height - 8 : base.y + dy; }
    onBoundsChange({ x: next.x, y: next.y, width: next.width, height: next.height, scale: next.scale });
  };
  const finishDrag = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event && dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
  };
  const visualScale = clamp(bounds.scale, 0.2, 4);
  return <div className={`video-note-layer ${moveMode ? 'move-mode' : ''}`} style={{ left: `${bounds.x}%`, top: `${bounds.y}%`, width: `${bounds.width}%`, height: `${bounds.height}%`, fontSize: `clamp(${14 * visualScale}px, ${2.2 * visualScale}vw, ${30 * visualScale}px)`, '--video-note-font-family': style.noteFontFamily, '--video-note-color': style.noteTextColor, '--video-note-order': style.noteOrder === 'oldest-top' ? 'flex-start' : 'flex-end' } as CSSProperties} onPointerDown={(event) => beginDrag(event)} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={() => finishDrag()}>
    {moveMode && <div className="video-note-frame">{(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as VideoLayerCropEdge[]).map((edge) => <button key={edge} type="button" aria-label={`Resize note area ${edge}`} className={`video-note-handle ${edge}`} onPointerDown={(event) => beginDrag(event, edge)} />)}</div>}
    <div className="video-note-content" style={{ textShadow: roundedTextOutlineShadow(style.noteTextStrokeEnabled, style.noteTextStrokeWidth, style.noteTextStrokeColor) }}>{notes.map((step) => <DecoratedNoteRow className="video-note-row" key={step.id} step={step} style={style} />)}</div>
  </div>;
}

function drawVideoNotesToCanvas(ctx: CanvasRenderingContext2D, chart: ComboChart, style: ComboImageStyle, timeMs: number, bounds: VideoNoteBounds, canvasWidth: number, canvasHeight: number, imageCache: ImageCache) {
  const notes = videoNoteList(chart, style, timeMs);
  if (!style.showNotesSeparately || !notes.length) return;
  const x = canvasWidth * bounds.x / 100;
  const y = canvasHeight * bounds.y / 100;
  const width = canvasWidth * bounds.width / 100;
  const height = canvasHeight * bounds.height / 100;
  const visualScale = clamp(bounds.scale, 0.2, 4);
  const fontSize = clamp(canvasWidth * .022, 14, 30) * visualScale;
  const lineHeight = fontSize * 1.25;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.font = `900 ${Math.max(4, Math.round(fontSize))}px ${style.noteFontFamily}`;
  ctx.fillStyle = style.noteTextColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = style.noteTextStrokeEnabled ? Math.max(0, style.noteTextStrokeWidth * 2) : 0;
  ctx.strokeStyle = style.noteTextStrokeColor;
  const startY = style.noteOrder === 'oldest-top' ? y + lineHeight / 2 : y + height - lineHeight / 2;
  const direction = style.noteOrder === 'oldest-top' ? 1 : -1;
  notes.forEach((step, index) => {
    const value = step.note?.trim() ?? '';
    const textY = startY + direction * index * lineHeight;
    const slot = (step.characterSlot ?? 1) as CharacterSlot;
    const role = style.roleStyles[slot];
    const operationIcon = noteOperationIcon(step, style);
    const operationHeight = fontSize * 1.2;
    const operationWidth = operationHeight * (operationIcon?.iconWidthScale ?? 1);
    const avatarSize = operationHeight;
    const gap = fontSize * .24;
    const diamondSlotWidth = fontSize;
    const outlineSpace = style.noteTextStrokeEnabled ? Math.max(1, style.noteTextStrokeWidth + 1) : 1;
    const rowX = x + 10 + outlineSpace;
    const avatarImage = role.avatar ? loadCanvasImage(role.avatar, imageCache) : null;
    if (avatarImage) drawCroppedCircleImage(ctx, avatarImage, rowX, textY - avatarSize / 2, avatarSize, role.avatarCrop);
    else {
      ctx.save();
      ctx.beginPath();
      ctx.arc(rowX + avatarSize / 2, textY, avatarSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = role.color;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${Math.max(4, Math.round(fontSize * .6))}px ${style.noteFontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(slot), rowX + avatarSize / 2, textY);
      ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(rowX + avatarSize / 2, textY, avatarSize / 2 - Math.max(1, fontSize * .03), 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, fontSize * .06);
    ctx.strokeStyle = role.color;
    ctx.stroke();
    ctx.restore();
    const operationX = rowX + avatarSize + gap;
    const iconImage = operationIcon ? loadCanvasImage(operationIcon.src, imageCache) : null;
    if (iconImage) ctx.drawImage(iconImage, operationX, textY - operationHeight / 2, operationWidth, operationHeight);
    const diamondCenterX = operationX + operationWidth + gap + diamondSlotWidth / 2;
    const diamondSize = fontSize * .38;
    ctx.save();
    ctx.translate(diamondCenterX, textY);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-diamondSize / 2, -diamondSize / 2, diamondSize, diamondSize);
    ctx.lineWidth = Math.max(1, fontSize * .14);
    ctx.strokeStyle = 'rgba(0,0,0,.92)';
    ctx.strokeRect(-diamondSize / 2, -diamondSize / 2, diamondSize, diamondSize);
    ctx.restore();
    const textX = operationX + operationWidth + gap + diamondSlotWidth + gap;
    const textWidth = Math.max(0, x + width - 10 - outlineSpace - textX);
    ctx.fillStyle = style.noteTextColor;
    if (style.noteTextStrokeEnabled && style.noteTextStrokeWidth > 0) ctx.strokeText(value, textX, textY, textWidth);
    ctx.fillText(value, textX, textY, textWidth);
  });
  ctx.restore();
}

export function VideoAxisWorkbench({ open, desktop, chart, moves, startingCharacterSlot, recognitionBasedOnTextAxis, comboImageStyle, timelineContentLabels, overlaySettings, rhythmUiSettings, shortcutSettings, exportDirectory, ensureExportDirectory, timelineEditor, onApplyChart, onApplyContentLabels, onClose, onSave, getDisplaySize }: VideoAxisWorkbenchProps) {
  const { language, text } = useI18n();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoSourcePath, setVideoSourcePath] = useState<string | null>(null);
  const [videoMeta, setVideoMeta] = useState<VideoMeta>(DEFAULT_VIDEO_META);
  const [trimStartMs, setTrimStartMs] = useState(0);
  const [trimEndMs, setTrimEndMs] = useState(0);
  const [flowchartStartMs, setFlowchartStartMs] = useState(0);
  const [flowchartEndMs, setFlowchartEndMs] = useState(0);
  const [trimDialogOpen, setTrimDialogOpen] = useState(false);
  const [trimMode, setTrimMode] = useState<VideoTrimMode>('video');
  const [trimDraftStartMs, setTrimDraftStartMs] = useState(0);
  const [trimDraftEndMs, setTrimDraftEndMs] = useState(0);
  const [trimPreviewMs, setTrimPreviewMs] = useState(0);
  const [playbackMs, setPlaybackMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<(typeof VIDEO_PLAYBACK_RATES)[number]>(1);
  const [playbackRateMenuOpen, setPlaybackRateMenuOpen] = useState(false);
  const [timelineAutoFollow, setTimelineAutoFollow] = useState(true);
  const [previewMuted, setPreviewMuted] = useState(false);
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
  const [layerTransform, setLayerTransform] = useState<VideoLayerTransform>(DEFAULT_VIDEO_LAYER_TRANSFORM);
  const [stageHudVisible, setStageHudVisible] = useState(true);
  const [recognitionDialogOpen, setRecognitionDialogOpen] = useState(false);
  const [recognitionBounds, setRecognitionBounds] = useState<VideoRecognitionBounds>({ x: 58, y: 10, width: 34, height: 28 });
  const [recognitionPreviewMs, setRecognitionPreviewMs] = useState(0);
  const [recognitionProgress, setRecognitionProgress] = useState<VideoRecognitionProgress>({ progress: 0, processedFrames: 0, totalFrames: 0 });
  const [recognitionStatus, setRecognitionStatus] = useState<RecognitionStatus>(() => ({ state: 'idle', message: text('调整识别框，使蓝色按键提示完整落在框内。', 'Adjust the frame so the blue key indicators fit inside it.') }));
  const [recognitionResult, setRecognitionResult] = useState<VideoRecognitionResult | null>(null);
  const [videoNoteMoveMode, setVideoNoteMoveMode] = useState(false);
  const [videoNoteBounds, setVideoNoteBounds] = useState<VideoNoteBounds>(DEFAULT_VIDEO_NOTE_BOUNDS);
  useEffect(() => {
    if (!comboImageStyle.showNotesSeparately) setVideoNoteMoveMode(false);
  }, [comboImageStyle.showNotesSeparately]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trimPreviewRef = useRef<HTMLVideoElement | null>(null);
  const recognitionPreviewRef = useRef<HTMLVideoElement | null>(null);
  const trimDragRef = useRef<VideoTrimDrag | null>(null);
  const playbackRateMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectVideoUrlRef = useRef<string | null>(null);
  const timelinePanelDragRef = useRef<TimelinePanelDragSnapshot | null>(null);
  const timelineToggleSuppressClickRef = useRef(false);
  const previewPanRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const layerMoveDragRef = useRef<VideoLayerMoveDrag | null>(null);
  const layerMoveCaptureRef = useRef<HTMLElement | null>(null);
  const layerScaleDragRef = useRef<VideoLayerScaleDrag | null>(null);
  const layerCropDragRef = useRef<VideoLayerCropDrag | null>(null);
  const videoNoteScaleDragRef = useRef<VideoNoteScaleDrag | null>(null);
  const recognitionBoundsDragRef = useRef<RecognitionBoundsDrag | null>(null);
  const recognitionRunRef = useRef(0);
  const layerScaleSuppressClickRef = useRef(false);
  const videoNoteScaleSuppressClickRef = useRef(false);
  const stageHudHideTimerRef = useRef<number | null>(null);
  const videoToastTimerRef = useRef<number | null>(null);
  const exportCancelRef = useRef(false);
  const activeExportRecorderRef = useRef<MediaRecorder | null>(null);
  const keyboardStateRef = useRef({ isExporting: false  });
  const togglePlayRef = useRef<() => void>(() => undefined);
  const seekByRef = useRef<(deltaMs: number) => void>(() => undefined);
  const undoWorkbenchRef = useRef<() => void>(() => undefined);
  const redoWorkbenchRef = useRef<() => void>(() => undefined);
  useEffect(() => () => {
    const layerTimer = layerScaleDragRef.current?.longPressTimer;
    const noteTimer = videoNoteScaleDragRef.current?.longPressTimer;
    const timelineTimer = timelinePanelDragRef.current?.longPressTimer;
    if (layerTimer !== null && layerTimer !== undefined) window.clearTimeout(layerTimer);
    if (noteTimer !== null && noteTimer !== undefined) window.clearTimeout(noteTimer);
    if (timelineTimer !== null && timelineTimer !== undefined) window.clearTimeout(timelineTimer);
  }, []);
  const imageCacheRef = useRef<ImageCache>(new Map());
  const stageShellRef = useRef<HTMLDivElement | null>(null);
  const stageFrameRef = useRef<HTMLDivElement | null>(null);
  const [displaySize, setDisplaySize] = useState<DisplayMetrics | null>(() => normalizeDisplaySize(currentScreenSize(overlaySettings)));
  const [inspectorPortalTarget, setInspectorPortalTarget] = useState<HTMLElement | null>(null);
  const [toolbarPortalTarget, setToolbarPortalTarget] = useState<HTMLElement | null>(null);
  const [stageShellSize, setStageShellSize] = useState({ width: 0, height: 0 });

  const chartTotal = chartExtentMs(chart);
  const trimDurationMs = videoUrl ? Math.max(0, trimEndMs - trimStartMs) : 0;
  const playbackDurationMs = trimDurationMs || chartTotal;
  const hasFlowchartRange = Boolean(videoUrl) && flowchartEndMs > flowchartStartMs;
  const effectiveFlowchartStartMs = hasFlowchartRange ? clamp(flowchartStartMs, 0, trimDurationMs) : 0;
  const effectiveFlowchartEndMs = hasFlowchartRange ? clamp(flowchartEndMs, effectiveFlowchartStartMs, trimDurationMs) : playbackDurationMs;
  const flowchartDurationMs = Math.max(0, effectiveFlowchartEndMs - effectiveFlowchartStartMs);
  const chartPlaybackMs = videoUrl ? clamp(playbackMs - effectiveFlowchartStartMs, 0, flowchartDurationMs) : playbackMs;
  const renderTotal = Math.max(chartTotal, flowchartDurationMs);
  const isExporting = exportStatus.state === 'running';
  const trimDialogDurationMs = Math.max(MIN_VIDEO_TRIM_DURATION_MS, trimMode === 'video' ? videoMeta.durationMs : trimDurationMs);
  const trimDraftStartPercent = (trimDraftStartMs / trimDialogDurationMs) * 100;
  const trimDraftEndPercent = (trimDraftEndMs / trimDialogDurationMs) * 100;
  const trimPreviewSourceMs = trimMode === 'video' ? trimPreviewMs : trimStartMs + trimPreviewMs;
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
  const flowchartRangeCustomized = videoUrl && (flowchartStartMs > 0 || flowchartEndMs < trimDurationMs - 1);
  const flowchartVisible = !videoUrl || (playbackMs >= effectiveFlowchartStartMs && playbackMs <= effectiveFlowchartEndMs);
  const layerContentStyle = { left: `${((layerContentBounds.x - layerBounds.x) / layerBounds.width) * 100}%`, top: `${((layerContentBounds.y - layerBounds.y) / layerBounds.height) * 100}%`, width: `${(layerContentBounds.width / layerBounds.width) * 100}%`, height: `${(layerContentBounds.height / layerBounds.height) * 100}%` } as CSSProperties;
  const layerFullSourceBounds = overlaySourceBounds(overlaySettings, screenSize);
  const layerShellInsets = fitLayerInsets(layerFullSourceBounds, overlayShellInsets(overlaySettings, screenSize));
  const layerSourceBounds = insetSourceBounds(layerFullSourceBounds, layerShellInsets);
  const layerSurfaceStyle = {
    left: `${(layerShellInsets.left / layerFullSourceBounds.width) * 100}%`,
    top: `${(layerShellInsets.top / layerFullSourceBounds.height) * 100}%`,
    width: `${(layerSourceBounds.width / layerFullSourceBounds.width) * 100}%`,
    height: `${(layerSourceBounds.height / layerFullSourceBounds.height) * 100}%`
  } as CSSProperties;
  const linearLayout: LinearComboLayout = overlaySettings.layout === 'vertical' ? 'vertical' : 'horizontal';
  const waterfallMode = overlaySettings.layout === 'waterfall';
  const previewTransformStyle = {
    transform: `translate(${previewTransform.x}px, ${previewTransform.y}px) scale(${previewTransform.scale})`
  } as CSSProperties;
  const workbenchMainStyle = {
    '--video-timeline-height': `${timelineHeight}px`
  } as CSSProperties;
  const recognitionAverageConfidence = recognitionResult?.events.length
    ? recognitionResult.events.reduce((sum, event) => sum + event.confidence, 0) / recognitionResult.events.length
    : 0;
  const recognitionHolds = recognitionResult ? recognitionHoldCount(recognitionResult) : 0;

  function cloneChartSnapshot(source: ComboChart): ComboChart {
    return { ...source, steps: source.steps.map((step) => ({ ...step })), periods: source.periods?.map((period) => ({ ...period })) };
  }

  function currentHistorySnapshot(): WorkbenchHistorySnapshot {
    return {
      chart: cloneChartSnapshot(chart),
      contentLabels: { ...timelineContentLabels },
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
    const captureTarget = event.currentTarget;
    captureTarget.setPointerCapture(event.pointerId);
    layerMoveCaptureRef.current = captureTarget;
    layerMoveDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, viewScale: Math.max(0.01, previewTransform.scale), origin: { ...layerTransform }, moved: false, historyCaptured: false };
  }

  function moveLayerMoveDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = layerMoveDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
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
    const measuredFrame = stageFrameRef.current?.getBoundingClientRect();
    const frameWidth = Math.max(1, (stageFrameSize?.width ?? measuredFrame?.width ?? 1) * drag.viewScale);
    const frameHeight = Math.max(1, (stageFrameSize?.height ?? measuredFrame?.height ?? 1) * drag.viewScale);
    setLayerTransform((current) => ({ ...current, offsetX: drag.origin.offsetX + (deltaX / frameWidth) * 100, offsetY: drag.origin.offsetY + (deltaY / frameHeight) * 100 }));
  }

  function endLayerMoveDrag(event: ReactPointerEvent<HTMLElement>) {
    if (layerMoveDragRef.current?.pointerId === event.pointerId) layerMoveDragRef.current = null;
    const captureTarget = layerMoveCaptureRef.current;
    if (captureTarget?.hasPointerCapture(event.pointerId)) captureTarget.releasePointerCapture(event.pointerId);
    layerMoveCaptureRef.current = null;
  }

  function beginLayerScaleDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const drag: VideoLayerScaleDrag = { pointerId: event.pointerId, startX: event.clientX, origin: { ...layerTransform }, moved: false, historyCaptured: false, longPressTimer: null, resetTriggered: false };
    drag.longPressTimer = window.setTimeout(() => {
      if (layerScaleDragRef.current !== drag || drag.moved) return;
      captureWorkbenchHistory();
      drag.historyCaptured = true;
      drag.resetTriggered = true;
      drag.moved = true;
      layerScaleSuppressClickRef.current = true;
      setLayerTransform({ ...DEFAULT_VIDEO_LAYER_TRANSFORM });
      showVideoToast(text('连段图位置、缩放和裁剪已复位。', 'Combo layer position, scale, and crop reset.'));
    }, MOVE_BUTTON_RESET_HOLD_MS);
    layerScaleDragRef.current = drag;
    layerScaleSuppressClickRef.current = false;
  }

  function moveLayerScaleDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = layerScaleDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    if (drag.resetTriggered) return;
    if (!drag.moved && Math.abs(deltaX) < 4) return;
    if (drag.longPressTimer !== null) {
      window.clearTimeout(drag.longPressTimer);
      drag.longPressTimer = null;
    }
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
    const drag = layerScaleDragRef.current;
    if (drag?.pointerId === event.pointerId) {
      if (drag.longPressTimer !== null) window.clearTimeout(drag.longPressTimer);
      layerScaleDragRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function toggleVideoNoteMoveMode() {
    if (videoNoteScaleSuppressClickRef.current) {
      videoNoteScaleSuppressClickRef.current = false;
      return;
    }
    setVideoNoteMoveMode((active) => !active);
  }

  function beginVideoNoteScaleDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const drag: VideoNoteScaleDrag = { pointerId: event.pointerId, startX: event.clientX, origin: { ...videoNoteBounds }, moved: false, longPressTimer: null, resetTriggered: false };
    drag.longPressTimer = window.setTimeout(() => {
      if (videoNoteScaleDragRef.current !== drag || drag.moved) return;
      drag.resetTriggered = true;
      drag.moved = true;
      videoNoteScaleSuppressClickRef.current = true;
      setVideoNoteBounds({ ...DEFAULT_VIDEO_NOTE_BOUNDS });
      showVideoToast(text('提示区位置和大小已复位。', 'Note area position and size reset.'));
    }, MOVE_BUTTON_RESET_HOLD_MS);
    videoNoteScaleDragRef.current = drag;
    videoNoteScaleSuppressClickRef.current = false;
  }

  function moveVideoNoteScaleDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = videoNoteScaleDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.resetTriggered) return;
    const deltaX = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaX) < 4) return;
    if (drag.longPressTimer !== null) {
      window.clearTimeout(drag.longPressTimer);
      drag.longPressTimer = null;
    }
    drag.moved = true;
    videoNoteScaleSuppressClickRef.current = true;
    event.preventDefault();
    event.stopPropagation();
    const scale = clamp(1 + deltaX / 240, 0.2, 4);
    const width = Math.max(8, drag.origin.width * scale);
    const height = Math.max(8, drag.origin.height * scale);
    setVideoNoteBounds({
      x: drag.origin.x + (drag.origin.width - width) / 2,
      y: drag.origin.y + (drag.origin.height - height) / 2,
      width,
      height,
      scale: clamp(drag.origin.scale * scale, 0.2, 4)
    });
  }

  function endVideoNoteScaleDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = videoNoteScaleDragRef.current;
    if (drag?.pointerId === event.pointerId) {
      if (drag.longPressTimer !== null) window.clearTimeout(drag.longPressTimer);
      videoNoteScaleDragRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function beginLayerCropDrag(event: ReactPointerEvent<HTMLButtonElement>, edge: VideoLayerCropEdge) {
    if (!layerTransformMode || event.button !== 0) return;
    const captureTarget = stageFrameRef.current;
    if (!captureTarget) return;
    event.preventDefault();
    event.stopPropagation();
    captureTarget.setPointerCapture(event.pointerId);
    layerCropDragRef.current = { pointerId: event.pointerId, edge, startX: event.clientX, startY: event.clientY, viewScale: Math.max(0.01, previewTransform.scale), origin: { ...layerTransform }, moved: false, historyCaptured: false };
  }

  function moveLayerCropDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = layerCropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !stageFrameSize) return;
    const pointerDeltaX = event.clientX - drag.startX;
    const pointerDeltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(pointerDeltaX, pointerDeltaY) < 3) return;
    drag.moved = true;
    if (!drag.historyCaptured) {
      captureWorkbenchHistory();
      drag.historyCaptured = true;
    }
    event.preventDefault();
    event.stopPropagation();
    const frameWidth = Math.max(1, stageFrameSize.width * drag.viewScale);
    const frameHeight = Math.max(1, stageFrameSize.height * drag.viewScale);
    const deltaX = (pointerDeltaX / frameWidth) * 100;
    const deltaY = (pointerDeltaY / frameHeight) * 100;
    const contentWidth = baseLayerBounds.width * drag.origin.scale;
    const contentHeight = baseLayerBounds.height * drag.origin.scale;
    const minWidth = Math.min(contentWidth, Math.max(0.1, (2 / frameWidth) * 100));
    const minHeight = Math.min(contentHeight, Math.max(1.2, (16 / frameHeight) * 100));
    const maxWidth = contentWidth * MAX_VIDEO_LAYER_HORIZONTAL_CROP_WIDTH_FACTOR;
    const next = { ...drag.origin };
    if (drag.edge.includes('w')) next.cropLeft = clamp(drag.origin.cropLeft + deltaX, contentWidth - drag.origin.cropRight - maxWidth, contentWidth - drag.origin.cropRight - minWidth);
    if (drag.edge.includes('e')) next.cropRight = clamp(drag.origin.cropRight - deltaX, contentWidth - drag.origin.cropLeft - maxWidth, contentWidth - drag.origin.cropLeft - minWidth);
    if (drag.edge.includes('n')) next.cropTop = clamp(drag.origin.cropTop + deltaY, 0, contentHeight - drag.origin.cropBottom - minHeight);
    if (drag.edge.includes('s')) next.cropBottom = clamp(drag.origin.cropBottom - deltaY, 0, contentHeight - drag.origin.cropTop - minHeight);
    setLayerTransform(next);
  }

  function endLayerCropDrag(event: ReactPointerEvent<HTMLElement>) {
    if (layerCropDragRef.current?.pointerId === event.pointerId) layerCropDragRef.current = null;
    const captureTarget = stageFrameRef.current;
    if (captureTarget?.hasPointerCapture(event.pointerId)) captureTarget.releasePointerCapture(event.pointerId);
  }

  function renderLayerCropHandle(edge: VideoLayerCropEdge) {
    return <button
      key={edge}
      type="button"
      className={`video-layer-crop-handle ${edge}`}
      aria-label={text(`裁剪 ${edge}`, `Crop ${edge}`)}
      onPointerDown={(event) => beginLayerCropDrag(event, edge)}
    />;
  }
  function beginTimelinePanelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const drag: TimelinePanelDragSnapshot = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startHeight: timelineHeight,
      startZoom: timelineZoom,
      moved: false,
      historyCaptured: false,
      axis: null,
      longPressTimer: null,
      resetTriggered: false
    };
    drag.longPressTimer = window.setTimeout(() => {
      if (timelinePanelDragRef.current !== drag || drag.moved) return;
      captureWorkbenchHistory();
      drag.historyCaptured = true;
      drag.resetTriggered = true;
      drag.moved = true;
      timelineToggleSuppressClickRef.current = true;
      setTimelineHeight(Math.round(Math.max(window.innerHeight * 0.25, MIN_VIDEO_TIMELINE_HEIGHT)));
      setTimelineZoom(1);
      setTimelineLaneHeight(48);
      showVideoToast(text('时间轴高度、横向缩放和轨道密度已复位。', 'Timeline height, horizontal zoom, and lane density reset.'));
    }, MOVE_BUTTON_RESET_HOLD_MS);
    timelinePanelDragRef.current = drag;
    timelineToggleSuppressClickRef.current = false;
    setTimelineToggleDragMoved(false);
  }

  function moveTimelinePanelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = timelinePanelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.resetTriggered) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.axis && Math.hypot(deltaX, deltaY) < TIMELINE_TOGGLE_DRAG_THRESHOLD) return;
    if (drag.longPressTimer !== null) {
      window.clearTimeout(drag.longPressTimer);
      drag.longPressTimer = null;
    }
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
      if (drag.longPressTimer !== null) window.clearTimeout(drag.longPressTimer);
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

  function openRecognitionDialog() {
    if (!videoUrl) {
      showVideoToast(text('请先导入视频。', 'Import a video first.'));
      return;
    }
    videoRef.current?.pause();
    const screen = displaySize ?? currentScreenSize(overlaySettings);
    let nextBounds = storedRecognitionBounds(screen);
    try {
      const stored = localStorage.getItem('ww-video-key-recognition-bounds-v1');
      if (stored) nextBounds = normalizeVideoRecognitionBounds(JSON.parse(stored));
    } catch {
      // Fall back to the current Key Mapping overlay bounds.
    }
    setRecognitionBounds(recognitionBoundsWithCanvasAspect(nextBounds, videoMeta.width, videoMeta.height));
    setRecognitionPreviewMs(clamp(playbackMs, 0, trimDurationMs));
    setRecognitionProgress({ progress: 0, processedFrames: 0, totalFrames: 0 });
    setRecognitionResult(null);
    setRecognitionStatus(videoSourcePath && desktop?.analyzeVideoKeyMapping
      ? { state: 'idle', message: text('调整识别框，使蓝色按键提示完整落在框内。', 'Adjust the frame so the blue key indicators fit inside it.') }
      : { state: 'error', message: text('请通过桌面端“导入视频”重新选择原视频文件后识别。', 'Re-import the original video through the desktop app before recognition.') });
    setRecognitionDialogOpen(true);
  }

  function closeRecognitionDialog() {
    recognitionBoundsDragRef.current = null;
    if (recognitionStatus.state === 'running') {
      recognitionRunRef.current += 1;
      void desktop?.cancelVideoKeyMappingRecognition?.();
    }
    setRecognitionDialogOpen(false);
  }

  function seekRecognitionPreview(nextMs: number) {
    const normalized = clamp(nextMs, 0, trimDurationMs);
    setRecognitionPreviewMs(normalized);
    if (recognitionPreviewRef.current) recognitionPreviewRef.current.currentTime = (trimStartMs + normalized) / 1000;
  }

  function beginRecognitionBoundsDrag(event: ReactPointerEvent<HTMLElement>, mode: RecognitionBoundsDrag['mode']) {
    if (recognitionStatus.state === 'running' || event.button !== 0) return;
    const host = event.currentTarget.closest('.video-recognition-preview') as HTMLElement | null;
    if (!host) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = host.getBoundingClientRect();
    recognitionBoundsDragRef.current = {
      pointerId: event.pointerId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...recognitionBounds },
      hostWidth: Math.max(1, rect.width),
      hostHeight: Math.max(1, rect.height)
    };
  }

  function moveRecognitionBoundsDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = recognitionBoundsDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = ((event.clientX - drag.startX) / drag.hostWidth) * 100;
    const dy = ((event.clientY - drag.startY) / drag.hostHeight) * 100;
    if (drag.mode === 'move') {
      setRecognitionBounds(normalizeVideoRecognitionBounds({
        ...drag.origin,
        x: clamp(drag.origin.x + dx, 0, 100 - drag.origin.width),
        y: clamp(drag.origin.y + dy, 0, 100 - drag.origin.height)
      }));
      return;
    }

    const fromLeft = drag.mode === 'nw' || drag.mode === 'sw';
    const fromTop = drag.mode === 'nw' || drag.mode === 'ne';
    const horizontalDelta = fromLeft ? -dx : dx;
    const heightFactor = recognitionHeightForWidth(1, videoMeta.width, videoMeta.height);
    const horizontalLimit = fromLeft ? drag.origin.x + drag.origin.width : 100 - drag.origin.x;
    const verticalLimit = fromTop ? drag.origin.y + drag.origin.height : 100 - drag.origin.y;
    const nextWidth = clamp(drag.origin.width + horizontalDelta, 8, Math.min(horizontalLimit, verticalLimit / Math.max(0.01, heightFactor)));
    const nextHeight = recognitionHeightForWidth(nextWidth, videoMeta.width, videoMeta.height);
    const right = drag.origin.x + drag.origin.width;
    const bottom = drag.origin.y + drag.origin.height;
    setRecognitionBounds(normalizeVideoRecognitionBounds({
      x: fromLeft ? right - nextWidth : drag.origin.x,
      y: fromTop ? bottom - nextHeight : drag.origin.y,
      width: nextWidth,
      height: nextHeight
    }));
  }

  function endRecognitionBoundsDrag(event: ReactPointerEvent<HTMLElement>) {
    if (recognitionBoundsDragRef.current?.pointerId !== event.pointerId) return;
    recognitionBoundsDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    localStorage.setItem('ww-video-key-recognition-bounds-v1', JSON.stringify(recognitionBounds));
  }

  async function runVideoRecognition() {
    if (!videoSourcePath || !desktop?.analyzeVideoKeyMapping || trimDurationMs <= 0) return;
    const runId = recognitionRunRef.current + 1;
    recognitionRunRef.current = runId;
    localStorage.setItem('ww-video-key-recognition-bounds-v1', JSON.stringify(recognitionBounds));
    setRecognitionResult(null);
    setRecognitionProgress({ progress: 0, processedFrames: 0, totalFrames: 0 });
    setRecognitionStatus({ state: 'running', message: text('正在逐帧识别蓝色按键提示...', 'Scanning blue key indicators frame by frame...') });
    try {
      const request = buildVideoRecognitionRequest(videoSourcePath, trimStartMs, trimDurationMs, videoMeta.width, videoMeta.height, recognitionBounds);
      const result = await desktop.analyzeVideoKeyMapping(request);
      if (recognitionRunRef.current !== runId) return;
      setRecognitionResult(result);
      setRecognitionProgress((current) => ({ ...current, progress: 1 }));
      setRecognitionStatus({
        state: 'done',
        message: result.events.length
          ? text(`识别到 ${result.events.length} 次操作，请选择应用方式后确认。`, `${result.events.length} inputs recognized. Choose how to apply the result.`)
          : text('没有识别到按键提示，请调整识别框后重试。', 'No key indicators were found. Adjust the frame and try again.')
      });
    } catch (error) {
      if (recognitionRunRef.current !== runId) return;
      const raw = error instanceof Error ? error.message : String(error);
      setRecognitionStatus({ state: raw.includes('已取消') ? 'idle' : 'error', message: localizedRecognitionError(error, text) });
    }
  }

  function cancelVideoRecognition() {
    void desktop?.cancelVideoKeyMappingRecognition?.();
    setRecognitionStatus({ state: 'running', message: text('正在取消识别...', 'Cancelling recognition...') });
  }

  function applyVideoRecognition() {
    if (!recognitionResult?.events.length) return;
    const generated = recognizedChartFromVideo(chart, moves, startingCharacterSlot, recognitionResult, trimDurationMs);
    if (recognitionBasedOnTextAxis) {
      const combined = combineVideoRecognitionWithExistingChart(chart, timelineContentLabels, generated, trimDurationMs);
      if (!combined.matchedSteps) {
        showVideoToast(text('没有找到可与现有时间轴对应的识别结果，未修改时间轴。', 'No recognized inputs matched the existing timeline. Nothing was changed.'));
        return;
      }
      captureWorkbenchHistory();
      onApplyChart(combined.chart);
      onApplyContentLabels(combined.contentLabels);
      setRecognitionDialogOpen(false);
      showVideoToast(text(`已匹配 ${combined.matchedSteps}/${chart.steps.length} 个现有招式，保留内容并更新时间。`, `Matched ${combined.matchedSteps} of ${chart.steps.length} existing actions. Kept the content and updated its timing.`));
      return;
    }
    captureWorkbenchHistory();
    onApplyChart(generated.chart);
    onApplyContentLabels(generated.contentLabels);
    setRecognitionDialogOpen(false);
    showVideoToast(text(`已用 ${generated.chart.steps.length} 个识别招式块替换时间轴。`, `Replaced the timeline with ${generated.chart.steps.length} recognized action blocks.`));
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
    if (!recognitionDialogOpen || !desktop?.onVideoKeyMappingRecognitionProgress) return;
    return desktop.onVideoKeyMappingRecognitionProgress((progress) => {
      setRecognitionProgress({
        progress: clamp(Number(progress.progress) || 0, 0, 1),
        processedFrames: Math.max(0, Math.round(Number(progress.processedFrames) || 0)),
        totalFrames: Math.max(0, Math.round(Number(progress.totalFrames) || 0))
      });
    });
  }, [desktop, recognitionDialogOpen]);

  useEffect(() => () => {
    recognitionRunRef.current += 1;
    void desktop?.cancelVideoKeyMappingRecognition?.();
  }, [desktop]);

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
      if (recognitionDialogOpen) {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeRecognitionDialog();
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
  }, [open, trimDialogOpen, recognitionDialogOpen, recognitionStatus.state, shortcutSettings]);

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
    setFlowchartStartMs(0);
    setFlowchartEndMs(0);
    setPlaybackMs(0);
    setIsPlaying(false);
    setVideoUrl(nextUrl);
    setImportMessage(text('正在读取视频信息...', 'Reading video information...'));
    try {
      const meta = await readVideoMetadata(file.name, nextUrl, text);
      setVideoMeta(meta);
      setTrimStartMs(0);
      setTrimEndMs(meta.durationMs);
      setFlowchartStartMs(0);
      setFlowchartEndMs(meta.durationMs);
      setPlaybackMs(0);
      setIsPlaying(false);
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
    setFlowchartStartMs(0);
    setFlowchartEndMs(0);
    setPlaybackMs(0);
    setIsPlaying(false);
    setVideoUrl(picked.url);
    setImportMessage(text('正在读取视频信息...', 'Reading video information...'));
    try {
      const meta = await readVideoMetadata(picked.name, picked.url, text);
      setVideoMeta(meta);
      setTrimStartMs(0);
      setTrimEndMs(meta.durationMs);
      setFlowchartStartMs(0);
      setFlowchartEndMs(meta.durationMs);
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
    if (!videoUrl || videoMeta.durationMs <= 0) return null;
    const sourceDurationMs = videoMeta.durationMs;
    const start = clamp(Math.round(nextStartMs), 0, Math.max(0, sourceDurationMs - MIN_VIDEO_TRIM_DURATION_MS));
    const end = clamp(Math.round(nextEndMs), start + MIN_VIDEO_TRIM_DURATION_MS, sourceDurationMs);
    const nextDuration = end - start;
    const nextPlayback = clamp(Math.round(preferredPlaybackMs), 0, nextDuration);
    const previousFlowchartSourceStart = trimStartMs + flowchartStartMs;
    const previousFlowchartSourceEnd = trimStartMs + flowchartEndMs;
    const overlapStart = clamp(previousFlowchartSourceStart - start, 0, nextDuration);
    const overlapEnd = clamp(previousFlowchartSourceEnd - start, 0, nextDuration);
    const canPreserveFlowchartRange = trimEndMs > trimStartMs && overlapEnd - overlapStart >= MIN_VIDEO_TRIM_DURATION_MS;
    setTrimStartMs(start);
    setTrimEndMs(end);
    setFlowchartStartMs(canPreserveFlowchartRange ? overlapStart : 0);
    setFlowchartEndMs(canPreserveFlowchartRange ? overlapEnd : nextDuration);
    setPlaybackMs(nextPlayback);
    const video = videoRef.current;
    if (video) video.currentTime = (start + nextPlayback) / 1000;
    if (video && nextPlayback >= nextDuration && !video.paused) video.pause();
    return { start, end, duration: nextDuration, flowchartStart: canPreserveFlowchartRange ? overlapStart : 0, flowchartEnd: canPreserveFlowchartRange ? overlapEnd : nextDuration };
  }

  function setTrimDraftRange(nextStartMs: number, nextEndMs: number, previewMs?: number) {
    const durationMs = trimDialogDurationMs;
    const start = clamp(Math.round(nextStartMs), 0, Math.max(0, durationMs - MIN_VIDEO_TRIM_DURATION_MS));
    const end = clamp(Math.round(nextEndMs), start + MIN_VIDEO_TRIM_DURATION_MS, durationMs);
    const nextPreview = clamp(Math.round(previewMs ?? trimPreviewMs), start, end);
    setTrimDraftStartMs(start);
    setTrimDraftEndMs(end);
    setTrimPreviewMs(nextPreview);
    if (trimPreviewRef.current) trimPreviewRef.current.currentTime = (trimMode === 'video' ? nextPreview : trimStartMs + nextPreview) / 1000;
  }

  function openTrimDialog() {
    if (!videoUrl || isExporting) return;
    videoRef.current?.pause();
    setTrimMode('video');
    setTrimDraftStartMs(trimStartMs);
    setTrimDraftEndMs(trimEndMs);
    setTrimPreviewMs(trimStartMs);
    setTrimDialogOpen(true);
  }

  function chooseTrimMode(nextMode: VideoTrimMode) {
    trimPreviewRef.current?.pause();
    trimDragRef.current = null;
    setTrimMode(nextMode);
    const start = nextMode === 'video' ? trimStartMs : flowchartStartMs;
    const end = nextMode === 'video' ? trimEndMs : flowchartEndMs;
    setTrimDraftStartMs(start);
    setTrimDraftEndMs(end);
    setTrimPreviewMs(start);
    if (trimPreviewRef.current) trimPreviewRef.current.currentTime = (nextMode === 'video' ? start : trimStartMs + start) / 1000;
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
    if (trimMode === 'video') {
      const applied = applyTrimRange(start, end, 0);
      if (!applied) return;
      setTrimMode('flowchart');
      setTrimDraftStartMs(applied.flowchartStart);
      setTrimDraftEndMs(applied.flowchartEnd);
      setTrimPreviewMs(applied.flowchartStart);
      if (trimPreviewRef.current) trimPreviewRef.current.currentTime = (applied.start + applied.flowchartStart) / 1000;
      showVideoToast(text('视频裁剪已保存，请继续设置流程图展示范围。', 'Video trim saved. Continue by setting the flowchart display range.'));
      return;
    } else {
      setFlowchartStartMs(start);
      setFlowchartEndMs(end);
      seekTo(start);
    }
    closeTrimDialog();
    showVideoToast(text(`已设置流程图展示：${formatMs(start)} - ${formatMs(end)}，流程图从 00:00.000 开始播放。`, `Flowchart display set: ${formatMs(start)} - ${formatMs(end)}. Flowchart playback starts at 00:00.000.`));
  }

  function commitTrimDraftStart(seconds: number) {
    setTrimDraftRange(seconds * 1000, trimDraftEndMs, seconds * 1000);
  }

  function commitTrimDraftEnd(seconds: number) {
    setTrimDraftRange(trimDraftStartMs, seconds * 1000, seconds * 1000);
  }

  function seekTrimPreview(clientX: number, trackLeft: number, trackWidth: number) {
    const ratio = clamp((clientX - trackLeft) / Math.max(1, trackWidth), 0, 1);
    const next = clamp(Math.round(ratio * trimDialogDurationMs), trimDraftStartMs, trimDraftEndMs);
    setTrimPreviewMs(next);
    if (trimPreviewRef.current) trimPreviewRef.current.currentTime = (trimMode === 'video' ? next : trimStartMs + next) / 1000;
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
    const rawMs = clamp(Math.round(((event.clientX - drag.trackLeft) / Math.max(1, drag.trackWidth)) * trimDialogDurationMs), 0, trimDialogDurationMs);
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
    const timelineTimeMs = trimMode === 'video' ? sourceTimeMs : sourceTimeMs - trimStartMs;
    if (timelineTimeMs >= trimDraftEndMs) {
      video.pause();
      video.currentTime = (trimMode === 'video' ? trimDraftStartMs : trimStartMs + trimDraftStartMs) / 1000;
      setTrimPreviewMs(trimDraftStartMs);
      return;
    }
    setTrimPreviewMs(clamp(timelineTimeMs, trimDraftStartMs, trimDraftEndMs));
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
    const nativeClipLeft = clamp(nativeOverlayExport && comboImageStyle.showNotesSeparately ? Math.min(layerBounds.x, videoNoteBounds.x) : layerBounds.x, 0, 100);
    const nativeClipTop = clamp(nativeOverlayExport && comboImageStyle.showNotesSeparately ? Math.min(layerBounds.y, videoNoteBounds.y) : layerBounds.y, 0, 100);
    const nativeClipRight = clamp(nativeOverlayExport && comboImageStyle.showNotesSeparately ? Math.max(layerBounds.x + layerBounds.width, videoNoteBounds.x + videoNoteBounds.width) : layerBounds.x + layerBounds.width, 0, 100);
    const nativeClipBottom = clamp(nativeOverlayExport && comboImageStyle.showNotesSeparately ? Math.max(layerBounds.y + layerBounds.height, videoNoteBounds.y + videoNoteBounds.height) : layerBounds.y + layerBounds.height, 0, 100);
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
    const nativeNoteBounds = {
      x: ((videoNoteBounds.x - nativeClipLeft) / nativeClipWidth) * 100,
      y: ((videoNoteBounds.y - nativeClipTop) / nativeClipHeight) * 100,
      width: (videoNoteBounds.width / nativeClipWidth) * 100,
      height: (videoNoteBounds.height / nativeClipHeight) * 100,
      scale: videoNoteBounds.scale
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
        const exportSurfaceBounds = insetLayerBounds(exportContentBounds, layerFullSourceBounds, layerShellInsets);
        if (timeMs >= effectiveFlowchartStartMs && timeMs <= effectiveFlowchartEndMs) {
          const flowchartTimeMs = clamp(timeMs - effectiveFlowchartStartMs, 0, flowchartDurationMs);
          if (waterfallMode) {
            drawRhythmLayerToCanvas(ctx, chart, comboImageStyle, flowchartTimeMs, exportSurfaceBounds, exportClipBounds, rhythmUiSettings, layerSourceBounds, canvas.width, canvas.height, imageCacheRef.current);
          } else {
            drawComboLayerToCanvas(ctx, chart, comboImageStyle, flowchartTimeMs, exportSurfaceBounds, exportClipBounds, linearLayout, layerSourceBounds, canvas.width, canvas.height, imageCacheRef.current, language, overlaySettings.layout === 'stair');
          }
        }
        const exportNoteBounds = nativeOverlayExport ? nativeNoteBounds : videoNoteBounds;
        const exportNoteTimeMs = clamp(timeMs - effectiveFlowchartStartMs, 0, flowchartDurationMs);
        if (timeMs >= effectiveFlowchartStartMs && timeMs <= effectiveFlowchartEndMs) drawVideoNotesToCanvas(ctx, chart, comboImageStyle, exportNoteTimeMs, exportNoteBounds, canvas.width, canvas.height, imageCacheRef.current);
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
    videoCompactMode: true,
    inspectorPortalTarget,
    toolbarPortalTarget,
    renderTotalOverride: renderTotal,
    playheadControl: { playbackMs: chartPlaybackMs, onSeek: (timeMs: number) => seekTo(effectiveFlowchartStartMs + timeMs), disabled: isExporting },
    zoom: timelineZoom,
    onZoomChange: setTimelineZoom,
    videoLayerTransformControl: {
      active: layerTransformMode,
      onToggle: toggleLayerTransformMode,
      onScalePointerDown: beginLayerScaleDrag,
      onScalePointerMove: moveLayerScaleDrag,
      onScalePointerUp: endLayerScaleDrag
    },
    videoNoteTransformControl: comboImageStyle.showNotesSeparately ? {
      active: videoNoteMoveMode,
      onToggle: toggleVideoNoteMoveMode,
      onScalePointerDown: beginVideoNoteScaleDrag,
      onScalePointerMove: moveVideoNoteScaleDrag,
      onScalePointerUp: endVideoNoteScaleDrag,
      disabled: isExporting
    } : undefined,
    historyControl: {
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      onCaptureHistory: captureWorkbenchHistory,
      onUndo: undoWorkbench,
      onRedo: redoWorkbench
    },
    videoLaneHeight: timelineLaneHeight,
    keyboardShortcutsEnabled: open,
    videoAutoFollow: timelineAutoFollow
   } as Record<string, unknown>) : timelineEditor;

  const panel = (
    <div className={`video-workbench ${open ? '' : 'hidden'}`} role="dialog" aria-modal="true" aria-hidden={!open} aria-label={text('视频辅助轴编辑', 'Video Timeline Editor') }>
      {videoToast && <div className="video-export-toast" role="status">{videoToast}</div>}
      <input ref={fileInputRef} className="file-input" type="file" accept="video/*" onChange={(event) => void importVideo(event.target.files?.[0] ?? null)} />
      {recognitionDialogOpen && videoUrl && <div className="video-recognition-dialog-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) closeRecognitionDialog(); }}>
        <section className="video-recognition-dialog" role="dialog" aria-modal="true" aria-label={text('视频按键识别', 'Video Key Recognition')} onPointerDown={(event) => event.stopPropagation()}>
          <header>
            <div><ScanSearch size={18} /><strong>{text('视频按键识别', 'Video Key Recognition')}</strong><span>{text('扫描当前裁剪范围', 'Scans the current trimmed range')}</span></div>
            <button className="icon-button" type="button" title={text('关闭', 'Close')} onClick={closeRecognitionDialog}><X size={17} /></button>
          </header>
          <div className="video-recognition-preview" style={{ aspectRatio: frameAspect, '--video-recognition-aspect': Math.max(1, videoMeta.width) / Math.max(1, videoMeta.height) } as CSSProperties}>
            <video ref={recognitionPreviewRef} src={videoUrl} muted playsInline preload="auto" onLoadedMetadata={(event) => { event.currentTarget.currentTime = (trimStartMs + recognitionPreviewMs) / 1000; }} />
            <div
              className={`video-recognition-frame ${recognitionStatus.state === 'running' ? 'locked' : ''}`}
              style={{ left: `${recognitionBounds.x}%`, top: `${recognitionBounds.y}%`, width: `${recognitionBounds.width}%`, height: `${recognitionBounds.height}%` }}
              onPointerDown={(event) => beginRecognitionBoundsDrag(event, 'move')}
              onPointerMove={moveRecognitionBoundsDrag}
              onPointerUp={endRecognitionBoundsDrag}
              onPointerCancel={endRecognitionBoundsDrag}
            >
              {DEFAULT_VIDEO_RECOGNITION_HOTSPOTS.map((hotspot) => <span key={hotspot.id} className="video-recognition-hotspot" style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%`, width: `${hotspot.radius * 2}%`, aspectRatio: '1' }} title={hotspot.id} />)}
              {(['nw', 'ne', 'se', 'sw'] as VideoLayerCropEdge[]).map((edge) => <button
                key={edge}
                className={`video-recognition-resize ${edge}`}
                type="button"
                aria-label={text('缩放识别框', 'Resize Recognition Frame')}
                onPointerDown={(event) => beginRecognitionBoundsDrag(event, edge)}
                onPointerMove={moveRecognitionBoundsDrag}
                onPointerUp={endRecognitionBoundsDrag}
                onPointerCancel={endRecognitionBoundsDrag}
              />)}
            </div>
          </div>
          <div className="video-recognition-seek">
            <span>{formatMs(recognitionPreviewMs)}</span>
            <input type="range" min="0" max={Math.max(1, trimDurationMs)} step="33" value={recognitionPreviewMs} onChange={(event) => seekRecognitionPreview(Number(event.target.value))} disabled={recognitionStatus.state === 'running'} />
            <span>{formatMs(trimDurationMs)}</span>
          </div>
          <div className={`video-recognition-status ${recognitionStatus.state}`} role="status">
            <div className="video-recognition-progress"><span style={{ width: `${Math.round(recognitionProgress.progress * 100)}%` }} /></div>
            <p>{recognitionStatus.message}</p>
            {recognitionStatus.state === 'running' && <small>{Math.round(recognitionProgress.progress * 100)}% · {recognitionProgress.processedFrames}/{recognitionProgress.totalFrames || '—'} {text('帧', 'Frames')}</small>}
            {recognitionResult && <div className="video-recognition-summary">
              <span><strong>{recognitionResult.events.length}</strong>{text('操作', 'Inputs')}</span>
              <span><strong>{recognitionHolds}</strong>{text('长按', 'Holds')}</span>
              <span><strong>{Math.round(recognitionAverageConfidence * 100)}%</strong>{text('平均置信度', 'Average Confidence')}</span>
            </div>}
          </div>
          <footer>
            <div className="video-recognition-apply-options">
              {recognitionBasedOnTextAxis && <p className="video-recognition-basis-active"><strong>{text('基于文字轴', 'Based on Text Axis')}</strong>{text('已开启：保留现有招式，只校准位置和持续时间，额外识别结果会被忽略。', 'Enabled: existing actions are preserved, only position and duration are aligned, and extra detections are ignored.')}</p>}
              <p>{text('当前版本识别默认按键映射中的蓝色圆形提示；变奏、延奏和白色方向提示不会自动推断。', 'This version recognizes the default blue circular indicators. Intro, Outro, and white direction indicators are not inferred automatically.')}</p>
            </div>
            <div className="video-recognition-actions">
              {recognitionStatus.state === 'running'
                ? <button type="button" className="danger" onClick={cancelVideoRecognition}>{text('取消识别', 'Cancel Recognition')}</button>
                : <button type="button" className="video-recognition-run" disabled={!videoSourcePath || !desktop?.analyzeVideoKeyMapping} onClick={() => void runVideoRecognition()}><ScanSearch size={16} />{recognitionResult ? text('重新识别', 'Scan Again') : text('开始识别', 'Start Recognition')}</button>}
              <button type="button" onClick={closeRecognitionDialog}>{text('取消', 'Cancel')}</button>
              <button type="button" className="primary" disabled={!recognitionResult?.events.length || recognitionStatus.state === 'running' || (recognitionBasedOnTextAxis && !chart.steps.length)} onClick={applyVideoRecognition}><Check size={16} />{recognitionBasedOnTextAxis ? text('校准现有时间', 'Align Existing Timing') : text('替换时间轴', 'Replace Timeline')}</button>
            </div>
          </footer>
        </section>
      </div>}
      {trimDialogOpen && videoUrl && <div className="video-trim-dialog-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) closeTrimDialog(); }}>
        <section className="video-trim-dialog" role="dialog" aria-modal="true" aria-label={trimMode === 'video' ? text('裁剪视频', 'Trim Video') : text('裁剪流程图', 'Trim Flowchart')} onPointerDown={(event) => event.stopPropagation()}>
          <header>
            <div><Scissors size={17} /><strong>{trimMode === 'video' ? text('裁剪视频', 'Trim Video') : text('裁剪流程图', 'Trim Flowchart')}</strong><span>{trimMode === 'video' ? text(`裁后时长 ${formatMs(trimDraftEndMs - trimDraftStartMs)}`, `Trimmed duration: ${formatMs(trimDraftEndMs - trimDraftStartMs)}`) : text(`展示时长 ${formatMs(trimDraftEndMs - trimDraftStartMs)}`, `Visible duration: ${formatMs(trimDraftEndMs - trimDraftStartMs)}`)}</span></div>
            <button className="icon-button" type="button" title={text('取消', 'Cancel')} onClick={closeTrimDialog}><X size={17} /></button>
          </header>
          <div className="video-trim-mode" role="group" aria-label={text('裁剪对象', 'Trim Target')}>
            <button type="button" className={trimMode === 'video' ? 'active' : ''} onClick={() => chooseTrimMode('video')}>{text('视频', 'Video')}</button>
            <button type="button" className={trimMode === 'flowchart' ? 'active' : ''} onClick={() => chooseTrimMode('flowchart')}>{text('流程图', 'Flowchart')}</button>
          </div>
          <div className="video-trim-preview">
            <video ref={trimPreviewRef} src={videoUrl} controls muted={previewMuted} playsInline onLoadedMetadata={(event) => { event.currentTarget.currentTime = trimPreviewSourceMs / 1000; }} onTimeUpdate={handleTrimPreviewTimeUpdate} />
          </div>
          <div className="video-trim-dialog-timeline">
            <div className="video-trim-time-labels"><span>{formatMs(0)}</span><span>{formatMs(trimDialogDurationMs)}</span></div>
            <div className="video-trim-track" onPointerDown={handleTrimTrackPointerDown}>
              <span className="video-trim-excluded before" style={{ width: `${trimDraftStartPercent}%` }} />
              <span className="video-trim-selection" style={{ left: `${trimDraftStartPercent}%`, width: `${Math.max(0, trimDraftEndPercent - trimDraftStartPercent)}%` }} />
              <span className="video-trim-excluded after" style={{ left: `${trimDraftEndPercent}%` }} />
              <span className="video-trim-playhead" style={{ left: `${(trimPreviewMs / trimDialogDurationMs) * 100}%` }} />
              <button className="video-trim-handle start" type="button" style={{ left: `${trimDraftStartPercent}%` }} aria-label={text('裁剪开始', 'Trim Start s')} onPointerDown={(event) => beginTrimDrag(event, 'start')} onPointerMove={moveTrimDrag} onPointerUp={endTrimDrag} onPointerCancel={endTrimDrag} />
              <button className="video-trim-handle end" type="button" style={{ left: `${trimDraftEndPercent}%` }} aria-label={text('裁剪结束', 'Trim End s')} onPointerDown={(event) => beginTrimDrag(event, 'end')} onPointerMove={moveTrimDrag} onPointerUp={endTrimDrag} onPointerCancel={endTrimDrag} />
            </div>
          </div>
          <footer>
            <div className="video-trim-fields">
              <label><span>{trimMode === 'video' ? text('裁剪开始 秒', 'Trim Start s') : text('展示开始 秒', 'Visible Start s')}</span><NumericDraftInput value={Number((trimDraftStartMs / 1000).toFixed(3))} onCommit={commitTrimDraftStart} /></label>
              <label><span>{trimMode === 'video' ? text('裁剪结束 秒', 'Trim End s') : text('展示结束 秒', 'Visible End s')}</span><NumericDraftInput value={Number((trimDraftEndMs / 1000).toFixed(3))} onCommit={commitTrimDraftEnd} /></label>
            </div>
            <div className="video-trim-dialog-actions">
              <button className="primary" type="button" onClick={saveTrimDraft}><Save size={16} />{trimMode === 'video' ? text('保存视频裁剪', 'Save Video Trim') : text('保存展示时间', 'Save Display Time')}</button>
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
              ref={stageFrameRef}
              className={`video-stage-frame ${previewTransform.scale > 1 ? 'is-zoomed' : ''}`}
              style={stageFrameStyle}
              onMouseEnter={revealStageHud}
              onMouseMove={revealStageHud}
              onMouseLeave={scheduleStageHudHide}
              onWheel={handlePreviewWheel}
              onPointerDown={layerTransformMode ? undefined : beginPreviewPan}
              onPointerMove={(event) => { movePreviewPan(event); moveLayerMoveDrag(event); moveLayerCropDrag(event); }}
              onPointerUp={(event) => { endLayerMoveDrag(event); endLayerCropDrag(event); endPreviewPan(event); }}
              onPointerCancel={(event) => { endLayerMoveDrag(event); endLayerCropDrag(event); endPreviewPan(event); }}
            >
              <div className="video-stage-content" style={previewTransformStyle}>
                {videoUrl ? <video ref={videoRef} src={videoUrl} preload="auto" playsInline onLoadedMetadata={(event) => { event.currentTarget.currentTime = trimStartMs / 1000; }} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onError={(event) => { const message = videoMediaError(event.currentTarget, text); if (message) { setIsPlaying(false); setImportMessage(message); } }} onEnded={() => { setPlaybackMs(trimDurationMs); setIsPlaying(false); }} /> : <div className="video-empty"><FileVideo size={38} /><strong>{text('导入实战视频', 'Import Gameplay Video') }</strong><span>{text('视频不会写入项目文件，只在当前会话中引用。', 'The video is referenced only for this session and is not stored in the project.') }</span></div>}
                <div className={`video-combo-layer-box synced ${layerTransformMode ? 'transform-active' : ''} ${flowchartVisible ? '' : 'flowchart-hidden'}`} style={{ left: `${layerBounds.x}%`, top: `${layerBounds.y}%`, width: `${layerBounds.width}%`, height: `${layerBounds.height}%` }} title={layerTransformMode ? text('拖动移动整个连段图层', 'Drag to move the entire combo layer') : text('位置和尺寸来自连段图外观设置', 'Position and size come from the combo appearance settings')} onPointerDownCapture={(event) => { if ((event.target as HTMLElement).closest('.video-layer-crop-handle')) return; beginLayerMoveDrag(event); }}>
                  <div className="video-combo-layer-viewport">
                    <div className="video-combo-layer-content" style={layerContentStyle}>
                      <div className="video-combo-layer-surface" style={layerSurfaceStyle}>
                  {flowchartVisible && (waterfallMode ? <VideoRhythmLayer chart={chart} style={comboImageStyle} timeMs={chartPlaybackMs} settings={rhythmUiSettings} bounds={layerSourceBounds} /> : <VideoComboLayer chart={chart} style={comboImageStyle} timeMs={chartPlaybackMs} layout={linearLayout} stairMode={overlaySettings.layout === 'stair'} bounds={layerSourceBounds} />)}
                      </div>
                    </div>
                  </div>
                  {layerTransformMode && (['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as VideoLayerCropEdge[]).map(renderLayerCropHandle)}
                </div>
                <VideoNotesLayer chart={chart} style={comboImageStyle} timeMs={chartPlaybackMs} bounds={videoNoteBounds} moveMode={videoNoteMoveMode} hostRef={stageFrameRef} onBoundsChange={setVideoNoteBounds} />
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
            <button className="icon-button video-recognition-trigger" title={text('从视频识别按键映射', 'Recognize Key Mapping from Video')} onClick={openRecognitionDialog} disabled={isExporting}><ScanSearch size={19} /></button>
            <div className="video-file-actions">
              <button className="icon-button" title={text('导入视频', 'Import Video') } onClick={() => void chooseVideo()} disabled={isExporting}><Upload size={18} /></button>
              <button className="icon-button" title={text('保存连段', 'Save Combo') } onClick={onSave} disabled={isExporting}><Save size={18} /></button>
              <button className="icon-button" title={desktop?.exportVideoWithOverlay ? text('导出 MP4', 'Export MP4') : text('下载 WebM（浏览器）', 'Download WebM (Browser)')} onClick={() => void exportVideo()} disabled={!videoUrl || isExporting}><Download size={18} /></button>
            </div>
            <button className="icon-button" title={text('关闭', 'Close') } onClick={onClose}><X size={18} /></button>
          </div>
        </aside>

        <section className={`video-edit-panel ${timelineCollapsed ? 'collapsed' : ''}`}>
          {timelineCollapsed && <button className="video-timeline-toggle floating icon-button hold-drag-control" title={text('展开时间轴；按住拖动：上下调高度，左右调时间轴缩放；悬浮滚轮调轨道密度；长按3秒复位', 'Expand timeline. Drag vertically to resize or horizontally to zoom; hover and scroll to change lane density; hold 3 seconds to reset.')} onPointerDown={beginTimelinePanelDrag} onPointerMove={moveTimelinePanelDrag} onPointerUp={endTimelinePanelDrag} onPointerCancel={endTimelinePanelDrag} onClick={toggleTimelineCollapsedFromButton} onWheel={changeTimelineLaneHeight}>
            <PanelBottomOpen size={16} /><HoldDragFeedback vertical wheel />
          </button>}
          {!timelineCollapsed && <div className="video-timeline-compact">
            <div className="video-timeline-topbar" onPointerDown={(event) => event.stopPropagation()}>
              <button className={`icon-button video-trim-trigger ${trimStartMs > 0 || trimEndMs < videoMeta.durationMs || flowchartRangeCustomized ? 'active' : ''}`} type="button" title={text('裁剪视频 / 流程图', 'Trim Video / Flowchart')} aria-label={text('裁剪视频 / 流程图', 'Trim Video / Flowchart')} onClick={openTrimDialog} disabled={!videoUrl || isExporting}><Clock3 size={16} /></button>
              <div className="video-timeline-tools-slot" ref={setToolbarPortalTarget} />
              <div className="video-timeline-history-actions" aria-label={text('时间轴历史', 'Timeline history')}>
                <button className="icon-button" type="button" title={text('撤销 (Ctrl+Z)', 'Undo (Ctrl+Z)')} aria-label={text('撤销 (Ctrl+Z)', 'Undo (Ctrl+Z)')} onClick={undoWorkbench} disabled={!undoStack.length || isExporting}>
                  <Undo2 size={16} />
                </button>
                <button className="icon-button" type="button" title={text('重做 (Ctrl+Y)', 'Redo (Ctrl+Y)')} aria-label={text('重做 (Ctrl+Y)', 'Redo (Ctrl+Y)')} onClick={redoWorkbench} disabled={!redoStack.length || isExporting}>
                  <Redo2 size={16} />
                </button>
              </div>
              <button className="video-timeline-toggle inline icon-button hold-drag-control" title={text('多功能：点击收起时间轴；按住拖动时，上下调高度、左右调时间轴缩放；悬浮滚轮调轨道密度；长按3秒复位', 'Multifunction: click to collapse the timeline; drag vertically to resize or horizontally to zoom; hover and scroll to change lane density; hold 3 seconds to reset.')} onPointerDown={beginTimelinePanelDrag} onPointerMove={moveTimelinePanelDrag} onPointerUp={endTimelinePanelDrag} onPointerCancel={endTimelinePanelDrag} onClick={toggleTimelineCollapsedFromButton} onWheel={changeTimelineLaneHeight}>
                <PanelBottomClose size={16} /><HoldDragFeedback vertical wheel />
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
