import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, Crop, Download, Image as ImageIcon, Images, ListChecks, Plus, RotateCcw, Save, SlidersHorizontal, Sparkles, Trash2, Upload } from 'lucide-react';
import type { CharacterSlot, ComboBasePreset, ComboChart, ComboIconMapping, ComboImageStyle, ComboPeriod, RectPercent } from '../combo-core';
import {
  chartToComboImageItems,
  capsuleEdgeSourceRange,
  comboImageItemSizeForText,
  comboTextParts,
  effectiveCapsuleImageFields,
  effectiveComboImageStyle,
  effectiveIconMappings,
  normalizeComboImageStyle,
  normalizeRectPercent
} from './combo-image/comboImage';
import { localizeCharacterName, localizeDefaultCharacterName, localizeEnglish, useI18n } from './i18n';
import type { AppLanguage } from './i18n';
import { NumericDraftInput } from './NumericDraftInput';
import './fullChartExport.css';

type ExportBlock = {
  id: string;
  sourceStepId?: string;
  sourcePeriodId?: string;
  axisKind?: 'startup_axis' | 'loop_axis';
  axisLoopIndex?: number;
  axisSourceLabel?: string;
  kind: 'action' | 'axis';
  role: CharacterSlot;
  text: string;
  showAvatar: boolean;
  hideAvatar: boolean;
  hideBackground: boolean;
  breakBefore: boolean;
  breakAfter: boolean;
  width?: number;
};

type ExportSettings = {
  width: number;
  height: number;
  paddingX: number;
  paddingY: number;
  columnGap: number;
  rowGap: number;
  transparent: boolean;
  backgroundColor: string;
};

type Placement = {
  block: ExportBlock;
  x: number;
  y: number;
  width: number;
  height: number;
  showAvatar: boolean;
};

type LayoutResult = {
  placements: Placement[];
  contentWidth: number;
  contentHeight: number;
};

type FullChartExportLabProps = {
  chart: ComboChart | null;
  library: ComboChart[];
  style: ComboImageStyle;
  basePresets: ComboBasePreset[];
  onSelectChart: (id: string) => void;
  onExit: () => void;
  onExport: (filename: string, bytes: Uint8Array) => Promise<void>;
};

const DEFAULT_SETTINGS: ExportSettings = {
  width: 1920,
  height: 1080,
  paddingX: 72,
  paddingY: 72,
  columnGap: 12,
  rowGap: 18,
  transparent: true,
  backgroundColor: '#101216'
};

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeFilename(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 80) || 'combo-axis';
}

function loadImage(src: string | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  const cached = imageCache.get(src);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    if (/^https?:/i.test(src)) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
  imageCache.set(src, pending);
  return pending;
}

function axisBlockLabel(period: Pick<ComboPeriod, 'kind' | 'label' | 'loopIndex'>, language: AppLanguage, loopAxisCount: number): string {
  const source = period.label.trim();
  if (period.kind === 'startup_axis') {
    if (source && !/^启动轴$|^startup axis$/i.test(source)) return source;
    return language === 'zh-CN' ? '启动轴' : localizeEnglish('Startup Axis', language);
  }
  if (source && !/^循环轴\s*\d*$|^loop axis\s*\d*$/i.test(source)) return source;
  const suffix = loopAxisCount > 1 ? String(period.loopIndex ?? 1) : '';
  return language === 'zh-CN' ? `循环轴${suffix}` : localizeEnglish(`Loop Axis${suffix ? ` ${suffix}` : ''}`, language);
}

function sortedLoopPeriods(chart: ComboChart | null): Array<ComboPeriod & { kind: 'loop_axis' }> {
  return (chart?.periods ?? [])
    .filter((period): period is ComboPeriod & { kind: 'loop_axis' } => period.kind === 'loop_axis')
    .sort((left, right) => left.startMs - right.startMs || (left.loopIndex ?? 1) - (right.loopIndex ?? 1) || left.id.localeCompare(right.id));
}

function defaultVisibleLoopIds(chart: ComboChart | null): string[] {
  const first = sortedLoopPeriods(chart)[0];
  return first ? [first.id] : [];
}

function mergeBasePresets(...sources: ComboBasePreset[][]): ComboBasePreset[] {
  const merged = new Map<string, ComboBasePreset>();
  sources.flat().forEach((preset) => merged.set(preset.id || preset.src, preset));
  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
}

function blocksFromChart(chart: ComboChart | null, style: ComboImageStyle, language: AppLanguage, visibleLoopIds: string[]): ExportBlock[] {
  if (!chart) return [];
  const loopPeriods = sortedLoopPeriods(chart);
  const visibleLoops = new Set(visibleLoopIds);
  const hiddenLoopPeriods = loopPeriods.filter((period) => !visibleLoops.has(period.id));
  const items = chartToComboImageItems(chart, style).filter((item) => !hiddenLoopPeriods.some((period) => item.step.startMin >= period.startMs && item.step.startMin < period.endMs));
  const events: Array<{ time: number; order: number; block: ExportBlock }> = items.map((item, order) => ({
    time: item.step.startMin,
    order: order * 2 + 1,
    block: {
      id: item.step.id,
      sourceStepId: item.step.id,
      kind: 'action',
      role: item.characterSlot,
      text: item.displayText,
      showAvatar: item.showAvatar,
      hideAvatar: false,
      hideBackground: false,
      breakBefore: false,
      breakAfter: false
    }
  }));

  (chart.periods ?? [])
    .filter((period): period is ComboPeriod & { kind: 'startup_axis' | 'loop_axis' } => period.kind === 'startup_axis' || period.kind === 'loop_axis')
    .filter((period) => period.kind === 'startup_axis' || visibleLoops.has(period.id))
    .forEach((period, periodIndex) => {
      const fallbackRole = items.find((item) => item.step.startMin >= period.startMs)?.characterSlot ?? 1;
      events.push({
        time: period.startMs,
        order: periodIndex * 2,
        block: {
          id: `axis-${period.id}`,
          sourcePeriodId: period.id,
          axisKind: period.kind,
          axisLoopIndex: period.loopIndex,
          axisSourceLabel: period.label,
          kind: 'axis',
          role: period.characterSlot ?? fallbackRole,
          text: axisBlockLabel(period, language, loopPeriods.length),
          showAvatar: false,
          hideAvatar: true,
          hideBackground: false,
          breakBefore: true,
          breakAfter: true
        }
      });
    });

  return events.sort((left, right) => left.time - right.time
    || (left.block.kind === right.block.kind ? left.order - right.order : left.block.kind === 'axis' ? -1 : 1))
    .map((event) => event.block);
}

function parseQuickBlocks(value: string): ExportBlock[] {
  const input = String(value || '');
  const marker = /i+/gi;
  const parsed: Array<Omit<ExportBlock, 'showAvatar'>> = [];
  let match = marker.exec(input);
  while (match) {
    const role = clamp(match[0].length, 1, 3) as CharacterSlot;
    const start = marker.lastIndex;
    const next = marker.exec(input);
    const end = next ? next.index : input.length;
    let text = input.slice(start, end).trim();
    let hideAvatar = false;
    let hideBackground = false;
    let breakAfter = false;
    while (text.length) {
      const tail = text.at(-1);
      if (tail === ':' || tail === '：') hideBackground = true;
      else if (tail === '.' || tail === '。') hideAvatar = true;
      else if (tail === ';' || tail === '；') breakAfter = true;
      else break;
      text = text.slice(0, -1).trimEnd();
    }
    if (text) parsed.push({ id: crypto.randomUUID(), kind: 'action', role, text, hideAvatar, hideBackground, breakBefore: false, breakAfter });
    match = next;
  }
  return parsed.map((block, index) => ({
    ...block,
    showAvatar: index === 0 || parsed[index - 1]?.role !== block.role
  }));
}

function roleAvatarSize(style: ComboImageStyle, role: CharacterSlot): number {
  return style.roleStyles[role].avatarSize ?? style.avatarSize;
}

function blockBaseSize(block: ExportBlock, style: ComboImageStyle): { width: number; height: number } {
  const roleStyle = style.roleStyles[block.role];
  const showAvatar = block.showAvatar && !block.hideAvatar;
  const measured = comboImageItemSizeForText(style, block.text, showAvatar, roleStyle);
  return { width: Math.max(32, block.width ?? measured.width), height: Math.max(24, measured.height) };
}

function layoutBlocks(blocks: ExportBlock[], style: ComboImageStyle, settings: ExportSettings, scale: number): LayoutResult {
  const paddingX = settings.paddingX * scale;
  const paddingY = settings.paddingY * scale;
  const gapX = settings.columnGap * scale;
  const gapY = settings.rowGap * scale;
  const rightEdge = Math.max(paddingX + 1, settings.width - paddingX);
  const placements: Placement[] = [];
  let cursorX = paddingX;
  let cursorY = paddingY;
  let rowHeight = 0;
  let maxRight = paddingX;
  let maxBottom = paddingY;

  blocks.forEach((block) => {
    const base = blockBaseSize(block, style);
    const width = base.width * scale;
    const height = base.height * scale;
    if (block.breakBefore && cursorX > paddingX) {
      cursorX = paddingX;
      cursorY += rowHeight + gapY;
      rowHeight = 0;
    }
    if (cursorX > paddingX && cursorX + width > rightEdge) {
      cursorX = paddingX;
      cursorY += rowHeight + gapY;
      rowHeight = 0;
    }
    const showAvatar = block.showAvatar && !block.hideAvatar;
    placements.push({ block, x: cursorX, y: cursorY, width, height, showAvatar });
    maxRight = Math.max(maxRight, cursorX + width);
    maxBottom = Math.max(maxBottom, cursorY + height);
    rowHeight = Math.max(rowHeight, height);
    if (block.breakAfter) {
      cursorX = paddingX;
      cursorY += rowHeight + gapY;
      rowHeight = 0;
    } else {
      cursorX += width + gapX;
    }
  });

  return {
    placements,
    contentWidth: maxRight + paddingX,
    contentHeight: maxBottom + paddingY
  };
}

function solveAutoScale(blocks: ExportBlock[], style: ComboImageStyle, settings: ExportSettings): number {
  if (!blocks.length) return 1;
  const fits = (scale: number) => {
    const metrics = layoutBlocks(blocks, style, settings, scale);
    return metrics.contentWidth <= settings.width + 0.5 && metrics.contentHeight <= settings.height + 0.5;
  };
  if (fits(1)) return 1;
  let low = 0.001;
  let high = 1;
  let best = low;
  for (let index = 0; index < 20; index += 1) {
    const middle = (low + high) / 2;
    if (fits(middle)) {
      best = middle;
      low = middle;
    } else {
      high = middle;
    }
  }
  return best;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

function sourceCrop(image: HTMLImageElement, cropValue: RectPercent | undefined) {
  const crop = normalizeRectPercent(cropValue, { x: 0, y: 0, w: 100, h: 100 });
  return {
    x: image.naturalWidth * crop.x / 100,
    y: image.naturalHeight * crop.y / 100,
    width: Math.max(1, image.naturalWidth * crop.w / 100),
    height: Math.max(1, image.naturalHeight * crop.h / 100)
  };
}

async function drawNineSlice(ctx: CanvasRenderingContext2D, image: HTMLImageElement, style: ComboImageStyle, role: CharacterSlot, x: number, y: number, width: number, height: number) {
  const fields = effectiveCapsuleImageFields(style, style.roleStyles[role]);
  const crop = sourceCrop(image, fields.crop);
  const naturalWidth = Math.max(1, fields.width ?? image.naturalWidth);
  const cropOffsetX = naturalWidth * (normalizeRectPercent(fields.crop, { x: 0, y: 0, w: 100, h: 100 }).x / 100);
  const stretch = fields.stretch ?? { left: 25, right: 75 };
  const leftSource = clamp(naturalWidth * stretch.left / 100 - cropOffsetX, 1, Math.max(1, crop.width - 2));
  const rightLine = clamp(naturalWidth * stretch.right / 100 - cropOffsetX, leftSource + 1, Math.max(leftSource + 1, crop.width - 1));
  const rightSource = Math.max(1, crop.width - rightLine);
  const heightScale = height / crop.height;
  const rawLeft = leftSource * heightScale;
  const rawRight = rightSource * heightScale;
  const minimumMiddle = Math.min(width, Math.max(12, height * 0.42));
  const availableEdges = Math.max(0, width - minimumMiddle);
  const edgeScale = rawLeft + rawRight > availableEdges ? availableEdges / Math.max(1, rawLeft + rawRight) : 1;
  const destinationLeft = Math.max(0, rawLeft * edgeScale);
  const destinationRight = Math.max(0, rawRight * edgeScale);
  const destinationMiddle = Math.max(0, width - destinationLeft - destinationRight);
  const edgeSource = capsuleEdgeSourceRange(image.naturalHeight, crop.y, crop.height, fields.edge);
  const topSourceHeight = Math.max(0, crop.y - edgeSource.y);
  const bottomSourceY = crop.y + crop.height;
  const bottomSourceHeight = Math.max(0, edgeSource.y + edgeSource.height - bottomSourceY);
  if (topSourceHeight > 0 && destinationLeft > 0) ctx.drawImage(image, crop.x, edgeSource.y, leftSource, topSourceHeight, x, y - topSourceHeight * heightScale, destinationLeft, topSourceHeight * heightScale);
  if (topSourceHeight > 0 && destinationMiddle > 0) ctx.drawImage(image, crop.x + leftSource, edgeSource.y, Math.max(1, rightLine - leftSource), topSourceHeight, x + destinationLeft, y - topSourceHeight * heightScale, destinationMiddle, topSourceHeight * heightScale);
  if (topSourceHeight > 0 && destinationRight > 0) ctx.drawImage(image, crop.x + rightLine, edgeSource.y, rightSource, topSourceHeight, x + destinationLeft + destinationMiddle, y - topSourceHeight * heightScale, destinationRight, topSourceHeight * heightScale);
  if (bottomSourceHeight > 0 && destinationLeft > 0) ctx.drawImage(image, crop.x, bottomSourceY, leftSource, bottomSourceHeight, x, y + height, destinationLeft, bottomSourceHeight * heightScale);
  if (bottomSourceHeight > 0 && destinationMiddle > 0) ctx.drawImage(image, crop.x + leftSource, bottomSourceY, Math.max(1, rightLine - leftSource), bottomSourceHeight, x + destinationLeft, y + height, destinationMiddle, bottomSourceHeight * heightScale);
  if (bottomSourceHeight > 0 && destinationRight > 0) ctx.drawImage(image, crop.x + rightLine, bottomSourceY, rightSource, bottomSourceHeight, x + destinationLeft + destinationMiddle, y + height, destinationRight, bottomSourceHeight * heightScale);
  ctx.drawImage(image, crop.x, crop.y, leftSource, crop.height, x, y, destinationLeft, height);
  ctx.drawImage(image, crop.x + leftSource, crop.y, Math.max(1, rightLine - leftSource), crop.height, x + destinationLeft, y, destinationMiddle, height);
  ctx.drawImage(image, crop.x + rightLine, crop.y, rightSource, crop.height, x + destinationLeft + destinationMiddle, y, destinationRight, height);
}

async function drawAvatar(ctx: CanvasRenderingContext2D, src: string | undefined, crop: RectPercent | undefined, x: number, y: number, size: number) {
  const image = await loadImage(src);
  ctx.save();
  roundedRect(ctx, x, y, size, size, size / 2);
  ctx.clip();
  if (image) {
    const source = sourceCrop(image, crop);
    ctx.drawImage(image, source.x, source.y, source.width, source.height, x, y, size, size);
  } else {
    ctx.fillStyle = '#242932';
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,.76)';
  ctx.lineWidth = Math.max(1, size * 0.035);
  roundedRect(ctx, x, y, size, size, size / 2);
  ctx.stroke();
}

async function drawInlineContent(ctx: CanvasRenderingContext2D, block: ExportBlock, style: ComboImageStyle, placement: Placement, scale: number) {
  const mappings = effectiveIconMappings(style, block.role);
  const parts = comboTextParts(block.text, style.convertIcons, mappings);
  const fontSize = style.fontSize * scale;
  const avatarSize = placement.showAvatar ? roleAvatarSize(style, block.role) * scale : 0;
  const avatarSpace = placement.showAvatar ? Math.max(0, avatarSize * 0.66) : 0;
  const availableWidth = Math.max(8, placement.width - 20 * scale - avatarSpace);
  ctx.font = `900 ${fontSize}px ${style.fontFamily}`;
  const measurements = parts.map((part) => part.kind === 'icon'
    ? { part, width: fontSize * 1.62 * part.iconScale }
    : { part, width: ctx.measureText(part.value).width });
  const naturalWidth = measurements.reduce((sum, item) => sum + item.width, 0) + Math.max(0, measurements.length - 1) * 2 * scale;
  const fit = Math.min(1, availableWidth / Math.max(1, naturalWidth));
  const fittedFontSize = fontSize * fit;
  const totalWidth = naturalWidth * fit;
  const centerOffset = placement.showAvatar ? avatarSpace * 0.28 : 0;
  let cursorX = placement.x + placement.width / 2 - totalWidth / 2 + centerOffset;
  const centerY = placement.y + placement.height / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = style.textColor;
  ctx.strokeStyle = style.textStrokeColor;
  ctx.lineWidth = Math.max(0, style.textStrokeWidth * scale);
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.font = `900 ${fittedFontSize}px ${style.fontFamily}`;
  ctx.shadowColor = 'rgba(0,0,0,.72)';
  ctx.shadowBlur = Math.max(1, 3 * scale);

  for (const measurement of measurements) {
    const width = measurement.width * fit;
    if (measurement.part.kind === 'icon') {
      const image = await loadImage(measurement.part.src);
      if (image) {
        const size = width;
        ctx.drawImage(image, cursorX, centerY - size / 2, size, size);
      }
    } else {
      if (style.textStrokeEnabled && ctx.lineWidth > 0) ctx.strokeText(measurement.part.value, cursorX, centerY);
      ctx.fillText(measurement.part.value, cursorX, centerY);
    }
    cursorX += width + 2 * scale * fit;
  }
  ctx.shadowBlur = 0;
}

async function drawPlacement(ctx: CanvasRenderingContext2D, placement: Placement, style: ComboImageStyle, scale: number) {
  const { block, x, y, width, height } = placement;
  const roleStyle = style.roleStyles[block.role];
  if (!block.hideBackground) {
    const fields = effectiveCapsuleImageFields(style, roleStyle);
    const image = style.blockMode === 'image' ? await loadImage(fields.image) : null;
    if (image) await drawNineSlice(ctx, image, style, block.role, x, y, width, height);
    else {
      ctx.fillStyle = style.useCustomCapsuleColor ? style.capsuleColor : roleStyle.color;
      roundedRect(ctx, x, y, width, height, style.capsuleShape === 'capsule' ? height / 2 : Math.max(2, 4 * scale));
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.28)';
      ctx.lineWidth = Math.max(1, scale);
      ctx.stroke();
    }
  }
  if (placement.showAvatar) {
    const avatarSize = roleAvatarSize(style, block.role) * scale;
    const offsetX = (roleStyle.avatarOffsetX ?? style.avatarOffsetX) * scale;
    const offsetY = (roleStyle.avatarOffsetY ?? style.avatarOffsetY) * scale;
    await drawAvatar(ctx, roleStyle.avatar, roleStyle.avatarCrop, x + offsetX, y + height / 2 - avatarSize / 2 + offsetY, avatarSize);
  }
  await drawInlineContent(ctx, block, style, placement, scale);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image read failed'));
    reader.onerror = () => reject(reader.error ?? new Error('Image read failed'));
    reader.readAsDataURL(file);
  });
}

function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image decode failed'));
    image.src = src;
  });
}

async function prepareUploadedImage(file: File, maxDimension: number, maxDataLength: number): Promise<{ src: string; width: number; height: number }> {
  const source = await readFileAsDataUrl(file);
  const image = await decodeImage(source);
  const naturalWidth = Math.max(1, image.naturalWidth);
  const naturalHeight = Math.max(1, image.naturalHeight);
  if (source.length <= maxDataLength && Math.max(naturalWidth, naturalHeight) <= maxDimension) {
    return { src: source, width: naturalWidth, height: naturalHeight };
  }

  let scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image processing failed');
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const optimized = canvas.toDataURL('image/webp', 0.88);
    if (optimized.length <= maxDataLength || attempt === 7) return { src: optimized, width, height };
    scale *= 0.78;
  }
  throw new Error('Image processing failed');
}

function NumberControl({ label, value, min, max, disabled, onChange }: { label: string; value: number; min: number; max: number; disabled?: boolean; onChange: (value: number) => void }) {
  return <label className={disabled ? 'parameter-disabled' : undefined}><span>{label}</span><NumericDraftInput value={value} min={min} max={max} disabled={disabled} onCommit={onChange} /></label>;
}

function CanvasDimensionInput({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  return <label><span>{label}</span><NumericDraftInput value={value} min={1} max={8192} integer onCommit={onCommit} /></label>;
}

function parseMappingTriggers(value: string): string[] {
  return value.split(/[,，\n]+/).map((trigger) => trigger.trim()).filter(Boolean);
}

function MappingTriggersInput({ mapping, label, onCommit }: { mapping: ComboIconMapping; label: string; onCommit: (triggers: string[]) => void }) {
  const [draft, setDraft] = useState(mapping.triggers.join(', '));

  useEffect(() => setDraft(mapping.triggers.join(', ')), [mapping.id, mapping.triggers]);

  function commit() {
    const triggers = parseMappingTriggers(draft);
    if (triggers.length) onCommit(triggers);
    else setDraft(mapping.triggers.join(', '));
  }

  return <label className="full-chart-mapping-triggers"><span>{label}</span><input value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}

function BasePresetPreview({ preset }: { preset: ComboBasePreset }) {
  const crop = normalizeRectPercent(preset.crop, { x: 0, y: 0, w: 100, h: 100 });
  const previewWidth = Math.max(0.001, crop.w / 2);
  const previewHeight = Math.max(0.001, crop.h);
  const naturalWidth = Math.max(1, preset.imageWidth ?? 1);
  const naturalHeight = Math.max(1, preset.imageHeight ?? 1);
  const backgroundPositionX = crop.x / Math.max(0.001, 100 - previewWidth) * 100;
  const backgroundPositionY = crop.y / Math.max(0.001, 100 - previewHeight) * 100;
  const previewAspect = naturalWidth * previewWidth / (naturalHeight * previewHeight);
  return <span className="full-chart-base-preset-preview" role="img" aria-label={preset.name} style={{
    width: `${Math.min(170, 86 * previewAspect)}px`,
    aspectRatio: `${naturalWidth * previewWidth} / ${naturalHeight * previewHeight}`,
    backgroundImage: `url(${preset.src})`,
    backgroundSize: `${10000 / previewWidth}% ${10000 / previewHeight}%`,
    backgroundPosition: `${backgroundPositionX}% ${backgroundPositionY}%`
  }} />;
}

function BaseCropEditor({ src, width, height, crop, stretch, edge, emptyLabel, onCropChange, onStretchChange }: {
  src: string | undefined;
  width: number;
  height: number;
  crop: RectPercent;
  stretch: { left: number; right: number };
  edge: number;
  emptyLabel: string;
  onCropChange: (crop: RectPercent) => void;
  onStretchChange: (stretch: { left: number; right: number }) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);

  function stagePoint(event: PointerEvent | ReactPointerEvent<HTMLElement>) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / Math.max(1, rect.height)) * 100, 0, 100)
    };
  }

  function beginCropDrag(event: ReactPointerEvent<HTMLElement>, mode: 'move' | 'nw' | 'se') {
    event.preventDefault();
    event.stopPropagation();
    const start = stagePoint(event);
    const original = { ...crop };
    const onMove = (moveEvent: PointerEvent) => {
      const point = stagePoint(moveEvent);
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      if (mode === 'move') onCropChange(normalizeRectPercent({ ...original, x: original.x + dx, y: original.y + dy }, original));
      if (mode === 'nw') {
        const x = clamp(original.x + dx, 0, original.x + original.w - 5);
        const y = clamp(original.y + dy, 0, original.y + original.h - 5);
        onCropChange(normalizeRectPercent({ x, y, w: original.x + original.w - x, h: original.y + original.h - y }, original));
      }
      if (mode === 'se') onCropChange(normalizeRectPercent({ ...original, w: original.w + dx, h: original.h + dy }, original));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function beginStretchDrag(event: ReactPointerEvent<HTMLElement>, side: 'left' | 'right') {
    event.preventDefault();
    event.stopPropagation();
    const onMove = (moveEvent: PointerEvent) => {
      const point = stagePoint(moveEvent);
      if (side === 'left') onStretchChange({ left: clamp(point.x, crop.x, Math.min(stretch.right - 1, crop.x + crop.w - 1)), right: stretch.right });
      else onStretchChange({ left: stretch.left, right: clamp(point.x, Math.max(stretch.left + 1, crop.x + 1), crop.x + crop.w) });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  if (!src) return <div className="full-chart-empty"><Crop size={36} /><strong>{emptyLabel}</strong></div>;
  const edgeHeight = Math.min(100, crop.h + edge);
  const edgeTop = clamp(crop.y - (edgeHeight - crop.h) / 2, 0, 100 - edgeHeight);
  return <div ref={stageRef} className="full-chart-crop-stage" style={{ aspectRatio: `${Math.max(1, width)} / ${Math.max(1, height)}` }}>
    <img src={src} alt="" />
    {edge > 0 && <span className="full-chart-edge-preview" style={{ left: `${crop.x}%`, top: `${edgeTop}%`, width: `${crop.w}%`, height: `${edgeHeight}%` }} />}
    <div className="full-chart-crop-box" style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.w}%`, height: `${crop.h}%` }} onPointerDown={(event) => beginCropDrag(event, 'move')}>
      <span className="full-chart-crop-handle nw" onPointerDown={(event) => beginCropDrag(event, 'nw')} />
      <span className="full-chart-crop-handle se" onPointerDown={(event) => beginCropDrag(event, 'se')} />
    </div>
    <span className="full-chart-stretch-line left" style={{ left: `${stretch.left}%` }} onPointerDown={(event) => beginStretchDrag(event, 'left')} />
    <span className="full-chart-stretch-line right" style={{ left: `${stretch.right}%` }} onPointerDown={(event) => beginStretchDrag(event, 'right')} />
  </div>;
}

export function FullChartExportLab({ chart, library, style, basePresets, onSelectChart, onExit, onExport }: FullChartExportLabProps) {
  const { language, text } = useI18n();
  const sourceStyle = useMemo(() => normalizeComboImageStyle(style), [style]);
  const charts = useMemo(() => {
    const map = new Map<string, ComboChart>();
    if (chart) map.set(chart.id, chart);
    library.forEach((item) => map.set(item.id, item));
    return [...map.values()].sort((left, right) => right.updatedAt - left.updatedAt);
  }, [chart, library]);
  const [selectedId, setSelectedId] = useState(chart?.id ?? charts[0]?.id ?? '');
  const selectedChart = charts.find((item) => item.id === selectedId) ?? chart ?? charts[0] ?? null;
  const [draftStyle, setDraftStyle] = useState(sourceStyle);
  const [localMappings, setLocalMappings] = useState<ComboIconMapping[]>(() => sourceStyle.iconMappings.map((mapping) => ({ ...mapping, triggers: [...mapping.triggers] })));
  const [localBasePresets, setLocalBasePresets] = useState<ComboBasePreset[]>(() => mergeBasePresets(basePresets, sourceStyle.basePresets));
  const effectiveStyle = useMemo(() => effectiveComboImageStyle({
    ...draftStyle,
    iconMappings: localMappings,
    roleStyles: {
      1: { ...draftStyle.roleStyles[1], iconMappings: localMappings },
      2: { ...draftStyle.roleStyles[2], iconMappings: localMappings },
      3: { ...draftStyle.roleStyles[3], iconMappings: localMappings }
    }
  }), [draftStyle, localMappings]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [visibleLoopIds, setVisibleLoopIds] = useState<string[]>(() => defaultVisibleLoopIds(selectedChart));
  const loopPeriods = useMemo(() => sortedLoopPeriods(selectedChart), [selectedChart]);
  const hasStartupAxis = useMemo(() => (selectedChart?.periods ?? []).some((period) => period.kind === 'startup_axis'), [selectedChart]);
  const [blocks, setBlocks] = useState<ExportBlock[]>(() => blocksFromChart(selectedChart, effectiveStyle, language, defaultVisibleLoopIds(selectedChart)));
  const [selectedBlockId, setSelectedBlockId] = useState(blocks[0]?.id ?? '');
  const [editorTab, setEditorTab] = useState<'appearance' | 'base' | 'icons' | 'content'>('appearance');
  const [baseTarget, setBaseTarget] = useState<'global' | CharacterSlot>('global');
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [quickError, setQuickError] = useState('');
  const [renderError, setRenderError] = useState('');
  const [assetError, setAssetError] = useState('');
  const [customBaseNames, setCustomBaseNames] = useState<Partial<Record<'global' | CharacterSlot, string>>>({});
  const [exporting, setExporting] = useState(false);
  const [autoScale, setAutoScale] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderRevisionRef = useRef(0);

  useEffect(() => {
    setLocalBasePresets((current) => mergeBasePresets(basePresets, sourceStyle.basePresets, current.filter((preset) => preset.id.startsWith('export-base-'))));
  }, [basePresets, sourceStyle.basePresets]);

  useEffect(() => {
    if (!selectedChart) {
      setBlocks([]);
      setSelectedBlockId('');
      return;
    }
    const defaultLoops = defaultVisibleLoopIds(selectedChart);
    setVisibleLoopIds(defaultLoops);
    const next = blocksFromChart(selectedChart, effectiveStyle, language, defaultLoops);
    setBlocks(next);
    setSelectedBlockId(next[0]?.id ?? '');
  }, [selectedChart?.id]);

  useEffect(() => {
    setBlocks((current) => current.map((block) => {
      if (block.kind !== 'axis' || !block.axisKind) return block;
      return {
        ...block,
        text: axisBlockLabel({ kind: block.axisKind, label: block.axisSourceLabel ?? '', loopIndex: block.axisLoopIndex }, language, loopPeriods.length)
      };
    }));
  }, [language, loopPeriods.length]);

  useEffect(() => {
    const revision = ++renderRevisionRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = Math.round(settings.width);
    const height = Math.round(settings.height);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scale = solveAutoScale(blocks, effectiveStyle, settings);
    setAutoScale(scale);
    const layout = layoutBlocks(blocks, effectiveStyle, settings, scale);
    setRenderError('');
    void (async () => {
      ctx.clearRect(0, 0, width, height);
      if (!settings.transparent) {
        ctx.fillStyle = settings.backgroundColor;
        ctx.fillRect(0, 0, width, height);
      }
      for (const placement of layout.placements) {
        await drawPlacement(ctx, placement, effectiveStyle, scale);
        if (renderRevisionRef.current !== revision) return;
      }
    })().catch((error) => {
      if (renderRevisionRef.current === revision) setRenderError(error instanceof Error ? error.message : String(error));
    });
  }, [blocks, effectiveStyle, settings]);

  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) ?? blocks[0] ?? null;
  const baseTargetRole = baseTarget === 'global' ? null : draftStyle.roleStyles[baseTarget];
  const baseTargetHasOverride = Boolean(baseTargetRole?.capsuleImage);
  const baseSource = baseTargetRole && baseTargetHasOverride ? baseTargetRole : draftStyle;
  const baseSourceImage = baseSource.capsuleImage;
  const baseSourceCrop = normalizeRectPercent(baseSource.capsuleCrop, { x: 0, y: 0, w: 100, h: 100 });
  const baseSourceStretch = baseSource.capsuleStretch ?? { left: 25, right: 75 };
  const baseSourceEdge = baseSource.capsuleEdge ?? 0;

  function patchSettings(patch: Partial<ExportSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  function patchStyle(patch: Partial<ComboImageStyle>) {
    setDraftStyle((current) => normalizeComboImageStyle({ ...current, ...patch }));
  }

  function patchRole(role: CharacterSlot, patch: Partial<ComboImageStyle['roleStyles'][CharacterSlot]>) {
    setDraftStyle((current) => normalizeComboImageStyle({
      ...current,
      roleStyles: { ...current.roleStyles, [role]: { ...current.roleStyles[role], ...patch } }
    }));
  }

  function patchSelectedBlock(patch: Partial<ExportBlock>) {
    if (!selectedBlock) return;
    setBlocks((current) => current.map((block) => block.id === selectedBlock.id ? { ...block, ...patch } : block));
  }

  function resetBlocks() {
    const next = blocksFromChart(selectedChart, effectiveStyle, language, visibleLoopIds);
    setBlocks(next);
    setSelectedBlockId(next[0]?.id ?? '');
  }

  function toggleVisibleLoop(periodId: string) {
    if (loopPeriods[0]?.id === periodId) return;
    const nextIds = visibleLoopIds.includes(periodId)
      ? visibleLoopIds.filter((id) => id !== periodId)
      : [...visibleLoopIds, periodId];
    setVisibleLoopIds(nextIds);
    const next = blocksFromChart(selectedChart, effectiveStyle, language, nextIds);
    setBlocks(next);
    setSelectedBlockId(next[0]?.id ?? '');
  }

  function chooseChart(id: string) {
    setSelectedId(id);
    onSelectChart(id);
  }

  function applyQuickInput() {
    const parsed = parseQuickBlocks(quickText);
    if (!parsed.length) {
      setQuickError(text('未识别到内容，请以 i、ii 或 iii 开始每个招式块。', 'No blocks were found. Start each block with i, ii, or iii.'));
      return;
    }
    let actionIndex = 0;
    const next = blocks.flatMap((block) => {
      if (block.kind === 'axis') return [block];
      if (actionIndex >= parsed.length) return [];
      const replacement = parsed[actionIndex];
      actionIndex += 1;
      return [replacement];
    });
    next.push(...parsed.slice(actionIndex));
    setBlocks(next);
    setSelectedBlockId(next.find((block) => block.kind === 'action')?.id ?? next[0]?.id ?? '');
    setQuickError('');
    setQuickOpen(false);
  }

  async function exportPng() {
    const canvas = canvasRef.current;
    if (!canvas || !selectedChart || !blocks.length) return;
    setExporting(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG encoding failed')), 'image/png'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await onExport(`${safeFilename(selectedChart.title)}-axis-${settings.width}x${settings.height}.png`, bytes);
    } catch (error) {
      setRenderError(text(`导出失败：${error instanceof Error ? error.message : String(error)}`, `Export failed: ${error instanceof Error ? error.message : String(error)}`));
    } finally {
      setExporting(false);
    }
  }

  function applyBasePatch(patch: {
    capsuleImage?: string;
    capsuleImageWidth?: number;
    capsuleImageHeight?: number;
    capsuleCrop?: RectPercent;
    capsuleStretch?: { left: number; right: number };
    capsuleEdge?: number;
  }) {
    if (baseTarget === 'global') {
      setDraftStyle((current) => normalizeComboImageStyle({ ...current, blockMode: 'image', ...patch }));
      return;
    }
    patchRole(baseTarget, patch);
    patchStyle({ blockMode: 'image' });
  }

  function applyBasePreset(preset: ComboBasePreset) {
    applyBasePatch({
      capsuleImage: preset.src,
      capsuleImageWidth: preset.imageWidth,
      capsuleImageHeight: preset.imageHeight,
      capsuleCrop: normalizeRectPercent(preset.crop, { x: 0, y: 0, w: 100, h: 100 }),
      capsuleStretch: preset.stretch ?? { left: 25, right: 75 },
      capsuleEdge: preset.edge ?? 0
    });
    setCustomBaseNames((current) => ({ ...current, [baseTarget]: preset.name }));
  }

  function patchBaseCrop(patch: Partial<RectPercent>) {
    applyBasePatch({ capsuleCrop: normalizeRectPercent({ ...baseSourceCrop, ...patch }, baseSourceCrop) });
  }

  function patchBaseStretch(patch: Partial<{ left: number; right: number }>) {
    const left = clamp(patch.left ?? baseSourceStretch.left, 1, 98);
    const right = clamp(patch.right ?? baseSourceStretch.right, left + 1, 99);
    applyBasePatch({ capsuleStretch: { left: Math.min(left, right - 1), right } });
  }

  async function pickCustomBase(file: File | null) {
    if (!file) return;
    const target = baseTarget;
    setAssetError('');
    try {
      const uploaded = await prepareUploadedImage(file, 2400, 7_500_000);
      const patch = {
        capsuleImage: uploaded.src,
        capsuleImageWidth: uploaded.width,
        capsuleImageHeight: uploaded.height,
        capsuleCrop: { x: 0, y: 0, w: 100, h: 100 } as RectPercent,
        capsuleStretch: { left: 25, right: 75 },
        capsuleEdge: 0
      };
      if (target === 'global') {
        setDraftStyle((current) => normalizeComboImageStyle({ ...current, blockMode: 'image', ...patch }));
      } else {
        patchRole(target, patch);
        patchStyle({ blockMode: 'image' });
      }
      setCustomBaseNames((current) => ({ ...current, [target]: file.name }));
    } catch (error) {
      setAssetError(text(`底图读取失败：${error instanceof Error ? error.message : String(error)}`, `Base image failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  function reuseGlobalBase() {
    if (baseTarget === 'global') return;
    patchRole(baseTarget, { capsuleImage: undefined, capsuleImageWidth: undefined, capsuleImageHeight: undefined, capsuleCrop: undefined, capsuleStretch: undefined, capsuleEdge: undefined });
    setCustomBaseNames((current) => ({ ...current, [baseTarget]: '' }));
    setAssetError('');
  }

  function saveCurrentBasePreset() {
    if (!baseSourceImage) return;
    const preset: ComboBasePreset = {
      id: `export-base-${crypto.randomUUID()}`,
      name: customBaseNames[baseTarget] || (baseTarget === 'global' ? text('导出底图', 'Export Block Background') : localizeDefaultCharacterName(draftStyle.roleStyles[baseTarget].name, baseTarget, language)),
      src: baseSourceImage,
      imageWidth: baseSource.capsuleImageWidth,
      imageHeight: baseSource.capsuleImageHeight,
      crop: baseSourceCrop,
      stretch: baseSourceStretch,
      edge: baseSourceEdge,
      user: true
    };
    setLocalBasePresets((current) => mergeBasePresets(current, [preset]));
  }

  function patchMapping(id: string, patch: Partial<ComboIconMapping>) {
    setLocalMappings((current) => current.map((mapping) => mapping.id === id ? { ...mapping, ...patch } : mapping));
  }

  async function pickMappingIcon(mappingId: string | null, file: File | null) {
    if (!file) return;
    setAssetError('');
    try {
      const uploaded = await prepareUploadedImage(file, 256, 700_000);
      if (mappingId) {
        patchMapping(mappingId, { src: uploaded.src });
        return;
      }
      const name = file.name.replace(/\.[^.]+$/, '').trim() || text('自定义图标', 'Custom Icon');
      const mapping: ComboIconMapping = {
        id: `export-icon-${crypto.randomUUID()}`,
        label: name,
        src: uploaded.src,
        triggers: [name],
        iconScale: 1
      };
      setLocalMappings((current) => [...current, mapping]);
      patchStyle({ convertIcons: true });
    } catch (error) {
      setAssetError(text(`图标读取失败：${error instanceof Error ? error.message : String(error)}`, `Icon failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  return (
    <div className="full-chart-export-lab">
      <header className="full-chart-export-head">
        <div><h2>{text('导出轴图', 'Export Axis Image')}</h2><p>{text('设定 PNG 尺寸后，整套连段会自动换行并等比缩放到画布内。', 'Set the PNG dimensions and the full combo will wrap and scale to fit automatically.')}</p></div>
        <div className="full-chart-export-head-actions"><span>{text('自动缩放', 'Auto Scale')} {Math.round(autoScale * 100)}%</span><button className="primary" disabled={!selectedChart || !blocks.length || exporting} onClick={() => void exportPng()}><Download size={17} />{exporting ? text('导出中', 'Exporting') : text('导出 PNG', 'Export PNG')}</button><button className="icon-button" onClick={onExit} title={text('返回', 'Back')}><ArrowLeft size={18} /></button></div>
      </header>

      <div className="full-chart-export-main">
        <section className="full-chart-preview-panel">
          <div className="full-chart-preview-toolbar">
            <CanvasDimensionInput label={text('宽度', 'Width')} value={settings.width} onCommit={(value) => patchSettings({ width: value })} />
            <span>×</span>
            <CanvasDimensionInput label={text('高度', 'Height')} value={settings.height} onCommit={(value) => patchSettings({ height: value })} />
            <span className="full-chart-count">{blocks.length} {text('个招式块', 'blocks')}</span>
          </div>
          <div className="full-chart-canvas-stage">
            {blocks.length ? <canvas ref={canvasRef} aria-label={text('轴图预览', 'Axis image preview')} /> : <div className="full-chart-empty"><ImageIcon size={42} /><strong>{text('请选择连段或使用快捷输入', 'Select a combo or use Quick Input')}</strong></div>}
          </div>
          {renderError && <div className="full-chart-render-error">{text('预览失败：', 'Preview failed: ')}{renderError}</div>}
        </section>

        <aside className="full-chart-library">
          <div className="full-chart-library-title"><strong>{text('连段选择', 'Combo Selection')}</strong><span>{charts.length}</span></div>
          <div className="full-chart-library-list">{charts.length ? charts.map((item) => <button key={item.id} className={selectedChart?.id === item.id ? 'active' : ''} onClick={() => chooseChart(item.id)}><strong>{item.title}</strong><span>{item.steps.length} {text('个招式', 'actions')}</span></button>) : <div className="full-chart-library-empty">{text('连段库为空', 'Combo library is empty')}</div>}</div>
          <button className="full-chart-quick-button" onClick={() => setQuickOpen(true)}><Sparkles size={17} />{text('快捷输入', 'Quick Input')}</button>
          <button onClick={resetBlocks} disabled={!selectedChart}><RotateCcw size={16} />{text('从连段恢复', 'Restore from Combo')}</button>
        </aside>
      </div>

      <section className="full-chart-controls">
        <div className="full-chart-tabs">
          <button className={editorTab === 'appearance' ? 'active' : ''} onClick={() => setEditorTab('appearance')}><SlidersHorizontal size={16} />{text('外观', 'Appearance')}</button>
          <button className={editorTab === 'base' ? 'active' : ''} onClick={() => setEditorTab('base')}><Images size={16} />{text('底图', 'Block Background')}</button>
          <button className={editorTab === 'icons' ? 'active' : ''} onClick={() => setEditorTab('icons')}><ImageIcon size={16} />{text('图标', 'Icons')}</button>
          <button className={editorTab === 'content' ? 'active' : ''} onClick={() => setEditorTab('content')}><ListChecks size={16} />{text('内容', 'Content')}</button>
        </div>
        {editorTab === 'appearance' ? (
          <div className="full-chart-appearance-grid">
            <fieldset><legend>{text('画布', 'Canvas')}</legend><div className="full-chart-control-grid">
              <NumberControl label={text('水平边距', 'Horizontal Padding')} value={settings.paddingX} min={0} max={800} onChange={(value) => patchSettings({ paddingX: value })} />
              <NumberControl label={text('垂直边距', 'Vertical Padding')} value={settings.paddingY} min={0} max={800} onChange={(value) => patchSettings({ paddingY: value })} />
              <NumberControl label={text('横向间距', 'Column Gap')} value={settings.columnGap} min={0} max={300} onChange={(value) => patchSettings({ columnGap: value })} />
              <NumberControl label={text('行间距', 'Row Gap')} value={settings.rowGap} min={0} max={300} onChange={(value) => patchSettings({ rowGap: value })} />
              <label className="full-chart-check"><input type="checkbox" checked={settings.transparent} onChange={(event) => patchSettings({ transparent: event.target.checked })} /><span>{text('透明背景', 'Transparent Background')}</span></label>
              <label><span>{text('背景色', 'Background Color')}</span><input type="color" disabled={settings.transparent} value={settings.backgroundColor} onChange={(event) => patchSettings({ backgroundColor: event.target.value })} /></label>
            </div></fieldset>
            <fieldset><legend>{text('招式块', 'Blocks')}</legend><div className="full-chart-control-grid">
              <label><span>{text('底图模式', 'Block Mode')}</span><select value={draftStyle.blockMode} onChange={(event) => patchStyle({ blockMode: event.target.value as ComboImageStyle['blockMode'] })}><option value="image">{text('底图', 'Block Background')}</option><option value="capsule">{text('色块', 'Color')}</option></select></label>
              <label><span>{text('宽度模式', 'Width Mode')}</span><select value={draftStyle.capsuleWidthMode} onChange={(event) => patchStyle({ capsuleWidthMode: event.target.value as ComboImageStyle['capsuleWidthMode'] })}><option value="fixed">{text('固定', 'Fixed')}</option><option value="auto">{text('适应内容', 'Fit Content')}</option></select></label>
              <NumberControl label={text('块宽度', 'Block Width')} value={Math.round(draftStyle.blockMode === 'image' ? draftStyle.imageBlockWidth : draftStyle.capsuleWidth)} min={32} max={1600} disabled={draftStyle.capsuleWidthMode === 'auto'} onChange={(value) => patchStyle(draftStyle.blockMode === 'image' ? { imageBlockWidth: value } : { capsuleWidth: value })} />
              <NumberControl label={text('块高度', 'Block Height')} value={Math.round(draftStyle.blockMode === 'image' ? draftStyle.imageBlockHeight : draftStyle.capsuleHeight)} min={24} max={500} onChange={(value) => patchStyle(draftStyle.blockMode === 'image' ? { imageBlockHeight: value } : { capsuleHeight: value })} />
              <NumberControl label={text('文字大小', 'Font Size')} value={Math.round(draftStyle.fontSize)} min={12} max={120} onChange={(value) => patchStyle({ fontSize: value })} />
              <NumberControl label={text('头像大小', 'Avatar Size')} value={Math.round(draftStyle.avatarSize)} min={16} max={300} onChange={(value) => patchStyle({ avatarSize: value })} />
              <label><span>{text('文字颜色', 'Text Color')}</span><input type="color" value={draftStyle.textColor} onChange={(event) => patchStyle({ textColor: event.target.value })} /></label>
              <label className="full-chart-check"><input type="checkbox" checked={draftStyle.textStrokeEnabled} onChange={(event) => patchStyle({ textStrokeEnabled: event.target.checked })} /><span>{text('文字描边', 'Text Outline')}</span></label>
              <NumberControl label={text('描边粗细', 'Outline Width')} value={draftStyle.textStrokeWidth} min={0} max={12} disabled={!draftStyle.textStrokeEnabled} onChange={(value) => patchStyle({ textStrokeWidth: value })} />
              <label><span>{text('描边颜色', 'Outline Color')}</span><input type="color" disabled={!draftStyle.textStrokeEnabled} value={draftStyle.textStrokeColor} onChange={(event) => patchStyle({ textStrokeColor: event.target.value })} /></label>
              <label className="full-chart-check"><input type="checkbox" checked={draftStyle.convertIcons} onChange={(event) => patchStyle({ convertIcons: event.target.checked })} /><span>{text('图标转换', 'Icon Conversion')}</span></label>
            </div></fieldset>
            <fieldset><legend>{text('角色颜色', 'Character Colors')}</legend><div className="full-chart-role-colors">{([1, 2, 3] as CharacterSlot[]).map((role) => <label key={role}><span>{localizeDefaultCharacterName(draftStyle.roleStyles[role].name, role, language)}</span><input type="color" value={draftStyle.roleStyles[role].color} onChange={(event) => patchRole(role, { color: event.target.value })} /></label>)}</div></fieldset>
          </div>
        ) : editorTab === 'base' ? (
          <div className="full-chart-base-editor">
            <div className="full-chart-base-toolbar">
              <div className="segmented full-chart-base-targets">
                <button className={baseTarget === 'global' ? 'active' : ''} onClick={() => setBaseTarget('global')}>{text('全局', 'Global')}</button>
                {([1, 2, 3] as CharacterSlot[]).map((role) => <button key={role} className={baseTarget === role ? 'active' : ''} onClick={() => setBaseTarget(role)}>{localizeDefaultCharacterName(draftStyle.roleStyles[role].name, role, language)}</button>)}
              </div>
              <label className="full-chart-upload-button"><Upload size={15} />{text('上传底图', 'Upload Base')}<input className="full-chart-file-input" type="file" accept="image/*" onChange={(event) => { void pickCustomBase(event.target.files?.[0] ?? null); event.currentTarget.value = ''; }} /></label>
              {baseTarget !== 'global' && <button disabled={!baseTargetHasOverride} onClick={reuseGlobalBase}><RotateCcw size={15} />{text('复用全局底图', 'Use Global Block Background')}</button>}
              <button disabled={!baseSourceImage} onClick={saveCurrentBasePreset}><Save size={15} />{text('保存模块预设', 'Save Module Preset')}</button>
            </div>
            {assetError && <div className="full-chart-render-error">{assetError}</div>}
            <div className="full-chart-base-workspace">
              <div className="full-chart-crop-editor">
                <BaseCropEditor src={baseSourceImage} width={baseSource.capsuleImageWidth ?? 426} height={baseSource.capsuleImageHeight ?? 80} crop={baseSourceCrop} stretch={baseSourceStretch} edge={baseSourceEdge} emptyLabel={text('请选择预设或上传底图', 'Choose a preset or upload a base image')} onCropChange={(crop) => applyBasePatch({ capsuleCrop: crop })} onStretchChange={(stretch) => applyBasePatch({ capsuleStretch: stretch })} />
              </div>
              <div className="full-chart-base-parameters">
                <strong>{baseTarget === 'global' ? text('全局底图', 'Global Block Background') : localizeDefaultCharacterName(draftStyle.roleStyles[baseTarget].name, baseTarget, language)}</strong>
                <span>{baseTarget !== 'global' && !baseTargetHasOverride ? text('正在复用全局底图', 'Using global block background') : customBaseNames[baseTarget] || text('当前底图', 'Current block background')}</span>
                <div className="full-chart-control-grid">
                  <NumberControl label={text('裁剪 X %', 'Crop X %')} value={Math.round(baseSourceCrop.x)} min={0} max={95} onChange={(value) => patchBaseCrop({ x: value })} />
                  <NumberControl label={text('裁剪 Y %', 'Crop Y %')} value={Math.round(baseSourceCrop.y)} min={0} max={95} onChange={(value) => patchBaseCrop({ y: value })} />
                  <NumberControl label={text('裁剪宽度 %', 'Crop Width %')} value={Math.round(baseSourceCrop.w)} min={5} max={100} onChange={(value) => patchBaseCrop({ w: value })} />
                  <NumberControl label={text('裁剪高度 %', 'Crop Height %')} value={Math.round(baseSourceCrop.h)} min={5} max={100} onChange={(value) => patchBaseCrop({ h: value })} />
                  <NumberControl label={text('边缘 %', 'Edge Height %')} value={Math.round(baseSourceEdge)} min={0} max={100} onChange={(value) => applyBasePatch({ capsuleEdge: value })} />
                  <NumberControl label={text('左拉伸线 %', 'Left Stretch %')} value={Math.round(baseSourceStretch.left)} min={1} max={98} onChange={(value) => patchBaseStretch({ left: value })} />
                  <NumberControl label={text('右拉伸线 %', 'Right Stretch %')} value={Math.round(baseSourceStretch.right)} min={2} max={99} onChange={(value) => patchBaseStretch({ right: value })} />
                </div>
              </div>
            </div>
            <div className="full-chart-base-presets">{localBasePresets.map((preset) => <button key={`${preset.id}-${preset.src}`} className={preset.src === baseSourceImage ? 'active' : ''} onClick={() => applyBasePreset(preset)}><BasePresetPreview preset={preset} /><strong>{localizeCharacterName(preset.name, language)}</strong></button>)}</div>
          </div>
        ) : editorTab === 'icons' ? (
          <div className="full-chart-icons-editor">
            <div className="full-chart-mapping-actions">
              <label className="full-chart-check"><input type="checkbox" checked={draftStyle.convertIcons} onChange={(event) => patchStyle({ convertIcons: event.target.checked })} /><span>{text('启用图标转换', 'Enable Icon Conversion')}</span></label>
              <label className="full-chart-upload-button"><Plus size={15} />{text('添加自定义图标', 'Add Custom Icon')}<input className="full-chart-file-input" type="file" accept="image/*" onChange={(event) => { void pickMappingIcon(null, event.target.files?.[0] ?? null); event.currentTarget.value = ''; }} /></label>
              <button onClick={() => setLocalMappings(sourceStyle.iconMappings.map((mapping) => ({ ...mapping, triggers: [...mapping.triggers] })))}><RotateCcw size={15} />{text('恢复项目图标', 'Restore Project Icons')}</button>
            </div>
            {assetError && <div className="full-chart-render-error">{assetError}</div>}
            <div className="full-chart-mapping-list">
              {localMappings.map((mapping) => <div className="full-chart-mapping-row" key={mapping.id}>
                <img src={mapping.src} alt="" />
                <label><span>{text('图标名称', 'Icon Name')}</span><input value={mapping.label} onChange={(event) => patchMapping(mapping.id, { label: event.target.value })} /></label>
                <MappingTriggersInput mapping={mapping} label={text('映射输入（逗号分隔）', 'Triggers (comma-separated)')} onCommit={(triggers) => patchMapping(mapping.id, { triggers })} />
                <label><span>{text('图标倍率', 'Icon Scale')}</span><NumericDraftInput value={mapping.iconScale ?? 1} min={0.35} max={3} onCommit={(iconScale) => patchMapping(mapping.id, { iconScale })} /></label>
                <label className="full-chart-icon-button" title={text('替换图标', 'Replace Icon')}><Upload size={16} /><input className="full-chart-file-input" type="file" accept="image/*" onChange={(event) => { void pickMappingIcon(mapping.id, event.target.files?.[0] ?? null); event.currentTarget.value = ''; }} /></label>
                {mapping.id.startsWith('export-icon-') && <button className="icon-button danger" title={text('删除自定义图标', 'Delete Custom Icon')} onClick={() => setLocalMappings((current) => current.filter((item) => item.id !== mapping.id))}><Trash2 size={16} /></button>}
              </div>)}
            </div>
          </div>
        ) : (
          <div className="full-chart-content-editor">
            <div className="full-chart-round-selector"><strong>{text('展示轮', 'Displayed Rounds')}</strong><div>
              {hasStartupAxis ? <label><input type="checkbox" checked disabled /><span>{text('启动轴', 'Startup Axis')}</span></label> : <span>{text('没有启动轴', 'No startup axis')}</span>}
              {loopPeriods.length ? loopPeriods.map((period, index) => <label key={period.id}><input type="checkbox" checked={visibleLoopIds.includes(period.id)} disabled={index === 0} onChange={() => toggleVisibleLoop(period.id)} /><span>{axisBlockLabel(period, language, loopPeriods.length)}</span></label>) : <span>{text('没有循环轴', 'No loop axes')}</span>}
            </div></div>
            <div className="full-chart-block-editor">
            <div className="full-chart-block-strip">{blocks.map((block, index) => <button key={block.id} className={`${selectedBlock?.id === block.id ? 'active' : ''} ${block.kind === 'axis' ? 'axis' : ''}`} style={{ '--block-role-color': draftStyle.roleStyles[block.role].color } as React.CSSProperties} onClick={() => setSelectedBlockId(block.id)}><span>{block.kind === 'axis' ? text('轴', 'Axis') : index + 1}</span><strong>{block.text}</strong></button>)}</div>
            {selectedBlock ? <div className="full-chart-block-fields">
              <label className="wide"><span>{text('显示内容', 'Display Content')}</span><input value={selectedBlock.text} onChange={(event) => patchSelectedBlock({ text: event.target.value })} /></label>
              <label><span>{text('角色', 'Character')}</span><select value={selectedBlock.role} onChange={(event) => patchSelectedBlock({ role: Number(event.target.value) as CharacterSlot })}><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
              <label><span>{text('独立宽度', 'Custom Width')}</span><NumericDraftInput value={selectedBlock.width} min={32} max={1600} placeholder={text('自动', 'Auto')} onClear={() => patchSelectedBlock({ width: undefined })} onCommit={(width) => patchSelectedBlock({ width })} /></label>
              <label className="full-chart-check"><input type="checkbox" checked={selectedBlock.showAvatar && !selectedBlock.hideAvatar} onChange={(event) => patchSelectedBlock({ showAvatar: event.target.checked, hideAvatar: !event.target.checked })} /><span>{text('显示头像', 'Show Avatar')}</span></label>
              <label className="full-chart-check"><input type="checkbox" checked={selectedBlock.hideBackground} onChange={(event) => patchSelectedBlock({ hideBackground: event.target.checked })} /><span>{text('隐藏底图', 'Hide Background')}</span></label>
              <label className="full-chart-check"><input type="checkbox" checked={selectedBlock.breakAfter} disabled={selectedBlock.kind === 'axis'} onChange={(event) => patchSelectedBlock({ breakAfter: event.target.checked })} /><span>{selectedBlock.kind === 'axis' ? text('轴块自动换行', 'Axis Auto-Wrap') : text('此块后换行', 'Line Break After')}</span></label>
              <button className="danger" onClick={() => { const next = blocks.filter((block) => block.id !== selectedBlock.id); setBlocks(next); setSelectedBlockId(next[0]?.id ?? ''); }}><Trash2 size={16} />{text('删除此块', 'Delete Block')}</button>
            </div> : <div className="full-chart-library-empty">{text('没有可编辑的招式块', 'No action blocks to edit')}</div>}
            </div>
          </div>
        )}
      </section>

      {quickOpen && <div className="full-chart-quick-backdrop" role="presentation" onMouseDown={() => setQuickOpen(false)}><div className="full-chart-quick-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><h3>{text('快捷输入', 'Quick Input')}</h3><p>{text('用 i、ii、iii 指定角色；每段内容生成一个招式块。尾部“。”隐藏头像，“：”隐藏底图，“；”在此块后换行。', 'Use i, ii, or iii for the character. Each segment creates one block. Add . to hide the avatar, : to hide the background, or ; to break the row after it.')}</p><textarea autoFocus value={quickText} onChange={(event) => setQuickText(event.target.value)} placeholder={text('例如：iae；iiireq：；。iizzz', 'Example: iae; iiireq:;. iizzz')} />{quickError && <div className="full-chart-quick-error">{quickError}</div>}<label className="full-chart-check"><input type="checkbox" checked={draftStyle.convertIcons} onChange={(event) => patchStyle({ convertIcons: event.target.checked })} /><span>{text('使用当前项目的图标转换映射', 'Use this project’s icon conversion mappings')}</span></label><div><button onClick={() => setQuickOpen(false)}>{text('取消', 'Cancel')}</button><button className="primary" onClick={applyQuickInput}>{text('替换导出草稿', 'Replace Export Draft')}</button></div></div></div>}
    </div>
  );
}
