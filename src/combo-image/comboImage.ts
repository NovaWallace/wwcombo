import type { CharacterSlot, ComboChart, ComboImageStyle, ComboStep, RectPercent, StretchPercent } from '../../combo-core';

export type ComboImageItem = {
  step: ComboStep;
  index: number;
  axisIndex: number;
  displayText: string;
  iconId?: string;
  isSwitch: boolean;
  showAvatar: boolean;
  characterSlot: CharacterSlot;
  mergedParts?: ComboImageMergedPart[];
  mergedStepIds?: string[];
  sourceStartIndex?: number;
  sourceEndIndex?: number;
};

export type ComboImageMergedPart = {
  stepId: string;
  displayText: string;
  startMs: number;
  endMs: number;
  iconId?: string;
  centerPercent: number;
  spanPercent: number;
};

type ComboImageMergeGroup = {
  items: ComboImageItem[];
  startMs: number;
  endMs: number;
  characterSlot: CharacterSlot;
};

export type ComboContentPart = { kind: 'text'; value: string } | { kind: 'icon'; iconId: string; label: string; src: string; iconScale: number };

const DEFAULT_CAPSULE_IMAGE = '/combo-assets/capsule-presets/default-capsule.png';
const SAME_ROLE_MERGE_GAP_MS = 180;
const SAME_ROLE_MERGE_SOFT_GAP_MS = 360;

type RoleStyle = ComboImageStyle['roleStyles'][CharacterSlot];
type CapsuleImageFields = {
  image?: string;
  width?: number;
  height?: number;
  crop?: RectPercent;
  stretch?: StretchPercent;
};

export const DEFAULT_ROLE_COLORS: Record<CharacterSlot, string> = {
  1: '#3459a4',
  2: '#8f4b57',
  3: '#326d5d'
};

export const DEFAULT_ICON_MAPPINGS: ComboImageStyle['iconMappings'] = [
  { id: 'mouse-right-hold', label: '长按闪避', src: '/combo-assets/button-icons/mouse-right-hold.png', triggers: ['S', 'D', '闪', '长按闪避'] },
  { id: 'mouse-left-hold', label: '长按普攻', src: '/combo-assets/button-icons/mouse-left-hold.png', triggers: ['z', 'Z', '长按普攻', '重击'] },
  { id: 'skill-hold', label: '长按技能', src: '/combo-assets/button-icons/skill-hold.png', triggers: ['E', '长按技能'] },
  { id: 'echo-hold', label: '长按声骸', src: '/combo-assets/button-icons/echo-hold.png', triggers: ['Q', '长按声骸'] },
  { id: 'liberation-hold', label: '长按解放', src: '/combo-assets/button-icons/liberation-hold.png', triggers: ['R', '长按解放', '长按共鸣解放'] },
  { id: 'jump-hold', label: '长按跳跃', src: '/combo-assets/button-icons/jump-hold.png', triggers: ['J', '长按跳跃'] },
  { id: 'mouse-left', label: '普攻', src: '/combo-assets/button-icons/mouse-left.png', triggers: ['a', '普攻'] },
  { id: 'skill', label: '技能', src: '/combo-assets/button-icons/skill.png', triggers: ['e', '技能'] },
  { id: 'echo', label: '声骸', src: '/combo-assets/button-icons/echo.png', triggers: ['q', '声骸'] },
  { id: 'liberation', label: '共鸣解放', src: '/combo-assets/button-icons/liberation.png', triggers: ['r', '共鸣解放'] },
  { id: 'mouse-right', label: '闪避', src: '/combo-assets/button-icons/mouse-right.png', triggers: ['s', 'd', '闪避'] },
  { id: 'jump', label: '跳跃', src: '/combo-assets/button-icons/jump.png', triggers: ['j', '跳'] },
  { id: 'intro', label: '变奏', src: '/combo-assets/button-icons/intro.png', triggers: ['b', '变奏'] },
  { id: 'outro', label: '延奏', src: '/combo-assets/button-icons/outro.png', triggers: ['y', '延奏'] },
  { id: 'iii', label: '3', src: '/combo-assets/button-icons/iii.png', triggers: ['iii'] },
  { id: 'ii', label: '2', src: '/combo-assets/button-icons/ii.png', triggers: ['ii'] },
  { id: 'i', label: '1', src: '/combo-assets/button-icons/i.png', triggers: ['i'] }
];

export const SKILL_ICON_MAP: Record<string, { id: string; label: string; src: string }> = {
  S: { id: 'mouse-right-hold', label: '长按闪避', src: '/combo-assets/button-icons/mouse-right-hold.png' },
  D: { id: 'mouse-right-hold', label: '长按闪避', src: '/combo-assets/button-icons/mouse-right-hold.png' },
  J: { id: 'jump-hold', label: '长按跳跃', src: '/combo-assets/button-icons/jump-hold.png' },
  a: { id: 'mouse-left', label: '普攻', src: '/combo-assets/button-icons/mouse-left.png' },
  A: { id: 'mouse-left-hold', label: '长按普攻', src: '/combo-assets/button-icons/mouse-left-hold.png' },
  z: { id: 'mouse-left-hold', label: '长按普攻', src: '/combo-assets/button-icons/mouse-left-hold.png' },
  Z: { id: 'mouse-left-hold', label: '长按普攻', src: '/combo-assets/button-icons/mouse-left-hold.png' },
  e: { id: 'skill', label: '技能', src: '/combo-assets/button-icons/skill.png' },
  E: { id: 'skill-hold', label: '长按技能', src: '/combo-assets/button-icons/skill-hold.png' },
  q: { id: 'echo', label: '声骸', src: '/combo-assets/button-icons/echo.png' },
  Q: { id: 'echo-hold', label: '长按声骸', src: '/combo-assets/button-icons/echo-hold.png' },
  r: { id: 'liberation', label: '共鸣解放', src: '/combo-assets/button-icons/liberation.png' },
  R: { id: 'liberation-hold', label: '长按解放', src: '/combo-assets/button-icons/liberation-hold.png' },
  s: { id: 'mouse-right', label: '闪避', src: '/combo-assets/button-icons/mouse-right.png' },
  d: { id: 'mouse-right', label: '闪避', src: '/combo-assets/button-icons/mouse-right.png' },
  j: { id: 'jump', label: '跳跃', src: '/combo-assets/button-icons/jump.png' },
  b: { id: 'intro', label: '变奏', src: '/combo-assets/button-icons/intro.png' },
  y: { id: 'outro', label: '延奏', src: '/combo-assets/button-icons/outro.png' }
};

const TEXT_ICON_MAP: Record<string, { id: string; label: string; src: string }> = {
  长按闪避: { id: 'mouse-right-hold', label: '长按闪避', src: '/combo-assets/button-icons/mouse-right-hold.png' },
  长按技能: { id: 'skill-hold', label: '长按技能', src: '/combo-assets/button-icons/skill-hold.png' },
  长按声骸: { id: 'echo-hold', label: '长按声骸', src: '/combo-assets/button-icons/echo-hold.png' },
  长按共鸣解放: { id: 'liberation-hold', label: '长按共鸣解放', src: '/combo-assets/button-icons/liberation-hold.png' },
  长按跳跃: { id: 'jump-hold', label: '长按跳跃', src: '/combo-assets/button-icons/jump-hold.png' },
  iii: { id: 'iii', label: '3', src: '/combo-assets/button-icons/iii.png' },
  ii: { id: 'ii', label: '2', src: '/combo-assets/button-icons/ii.png' },
  i: { id: 'i', label: '1', src: '/combo-assets/button-icons/i.png' },
  跳: { id: 'jump', label: '跳跃', src: '/combo-assets/button-icons/jump.png' },
  变奏: { id: 'intro', label: '变奏', src: '/combo-assets/button-icons/intro.png' },
  延奏: { id: 'outro', label: '延奏', src: '/combo-assets/button-icons/outro.png' }
};

export const AVATAR_PRESETS: Array<{ name: string; src: string }> = [];
export const CAPSULE_PRESETS: Array<{ name: string; src: string }> = [
  { name: '默认底图', src: DEFAULT_CAPSULE_IMAGE }
];

export function createDefaultComboImageStyle(): ComboImageStyle {
  return {
    roleStyles: {
      1: { name: '角色1', color: DEFAULT_ROLE_COLORS[1], avatarCrop: defaultRectPercent(), avatarSize: 54, avatarOffsetX: -18, avatarOffsetY: 0 },
      2: { name: '角色2', color: DEFAULT_ROLE_COLORS[2], avatarCrop: defaultRectPercent(), avatarSize: 54, avatarOffsetX: -18, avatarOffsetY: 0 },
      3: { name: '角色3', color: DEFAULT_ROLE_COLORS[3], avatarCrop: defaultRectPercent(), avatarSize: 54, avatarOffsetX: -18, avatarOffsetY: 0 }
    },
    blockMode: 'capsule',
    capsuleShape: 'capsule',
    backgroundCrop: fullRectPercent(),
    capsuleColor: '#33445c',
    useCustomCapsuleColor: false,
    capsuleImage: DEFAULT_CAPSULE_IMAGE,
    capsuleImageWidth: 418,
    capsuleImageHeight: 80,
    capsuleImageScale: 1,
    capsuleCrop: fullRectPercent(),
    capsuleStretch: { left: 25, right: 75 },
    textColor: '#eef3f7',
    fontSize: 22,
    fontFamily: 'Microsoft YaHei, Inter, system-ui, sans-serif',
    avatarSize: 54,
    avatarOffsetX: -18,
    avatarOffsetY: 0,
    capsuleWidth: 200,
    capsuleWidthMode: 'fixed',
    autoWidthPadding: 72,
    capsuleHeight: 80,
    capsuleGap: 12,
    edgePadding: 1,
    scrollAnchor: 'start',
    scrollStartOffsetPx: 0,
    fadeEnabled: false,
    fadeRange: 2,
    prePromptEnabled: true,
    convertIcons: false,
    mergeSameRoleSteps: false,
    iconMappings: DEFAULT_ICON_MAPPINGS,
    basePresets: [],
    contentLabels: {}
  };
}

export function normalizeComboImageStyle(value: Partial<ComboImageStyle> | null | undefined): ComboImageStyle {
  const fallback = createDefaultComboImageStyle();
  const capsuleImage = sanitizeCapsuleImage(value?.capsuleImage, fallback.capsuleImage);
  const backgroundImage = sanitizeComboBackground(value?.backgroundImage, capsuleImage);
  return {
    ...fallback,
    ...value,
    backgroundImage,
    capsuleImage,
    roleStyles: {
      1: normalizeRoleStyle(fallback.roleStyles[1], value?.roleStyles?.[1]),
      2: normalizeRoleStyle(fallback.roleStyles[2], value?.roleStyles?.[2]),
      3: normalizeRoleStyle(fallback.roleStyles[3], value?.roleStyles?.[3])
    },
    blockMode: value?.blockMode === 'image' ? 'image' : 'capsule',
    capsuleShape: value?.capsuleShape === 'rect' ? 'rect' : 'capsule',
    capsuleImageWidth: clampOptionalNumber(value?.capsuleImageWidth, 1, 5000) ?? fallback.capsuleImageWidth,
    capsuleImageHeight: clampOptionalNumber(value?.capsuleImageHeight, 1, 5000) ?? fallback.capsuleImageHeight,
    capsuleImageScale: clampNumber(value?.capsuleImageScale, 0.05, 8, fallback.capsuleImageScale),
    fontSize: clampNumber(value?.fontSize, 12, 72, fallback.fontSize),
    fontFamily: typeof value?.fontFamily === 'string' && value.fontFamily.trim() ? value.fontFamily.trim() : fallback.fontFamily,
    avatarSize: clampNumber(value?.avatarSize, 16, 240, fallback.avatarSize),
    avatarOffsetX: clampNumber(value?.avatarOffsetX, -300, 300, fallback.avatarOffsetX),
    avatarOffsetY: clampNumber(value?.avatarOffsetY, -300, 300, fallback.avatarOffsetY),
    capsuleWidth: clampNumber(value?.capsuleWidth, 32, 1000, fallback.capsuleWidth),
    capsuleWidthMode: value?.capsuleWidthMode === 'auto' ? 'auto' : 'fixed',
    autoWidthPadding: clampNumber(value?.autoWidthPadding, 16, 600, fallback.autoWidthPadding),
    capsuleHeight: clampNumber(value?.capsuleHeight, 24, 500, fallback.capsuleHeight),
    capsuleGap: clampNumber(value?.capsuleGap, 0, 96, fallback.capsuleGap),
    useCustomCapsuleColor: Boolean(value?.useCustomCapsuleColor),
    edgePadding: clampNumber(value?.edgePadding, 0, 12, fallback.edgePadding),
    scrollAnchor: value?.scrollAnchor === 'center' ? 'center' : 'start',
    scrollStartOffsetPx: clampNumber(value?.scrollStartOffsetPx, -5000, 5000, fallback.scrollStartOffsetPx),
    fadeEnabled: Boolean(value?.fadeEnabled),
    fadeRange: clampNumber(value?.fadeRange, 0, 100, fallback.fadeRange),
    prePromptEnabled: value?.prePromptEnabled !== false,
    convertIcons: Boolean(value?.convertIcons),
    mergeSameRoleSteps: Boolean(value?.mergeSameRoleSteps),
    iconMappings: normalizeIconMappings(value?.iconMappings),
    basePresets: normalizeStoredBasePresets(value?.basePresets),
    backgroundCrop: normalizeRectPercent(value?.backgroundCrop, fullRectPercent()),
    capsuleCrop: normalizeRectPercent(value?.capsuleCrop, fullRectPercent()),
    capsuleStretch: normalizeStretchPercent(value?.capsuleStretch),
    contentLabels: { ...(value?.contentLabels ?? {}) }
  };
}

function sanitizeCapsuleImage(value: string | undefined, fallback: string | undefined): string | undefined {
  const limited = limitEmbeddedImage(value, 8_000_000);
  if (!limited || isRetiredBasePresetImage(limited)) return fallback;
  return limited;
}

function sanitizeRoleCapsuleImage(value: string | undefined): string | undefined {
  const limited = limitEmbeddedImage(value, 8_000_000);
  if (!limited || isRetiredBasePresetImage(limited)) return undefined;
  return limited;
}

function isRetiredBasePresetImage(src: string | undefined): boolean {
  return Boolean(src?.includes('/combo-assets/base-presets/') && /(?:鍏変富|鏆椾富|闆蜂富|椋庝富)\.(?:webp|png)(?:$|[?#])/i.test(src));
}

function sanitizeComboBackground(backgroundImage: string | undefined, capsuleImage: string | undefined): string | undefined {
  const background = backgroundImage?.trim();
  if (!background) return undefined;
  if (background.length > 1_400_000) return undefined;
  if (background === capsuleImage) return undefined;
  if (isDefaultCapsuleImage(background) || background.includes('/combo-assets/capsule-presets/')) return undefined;
  if (CAPSULE_PRESETS.some((preset) => preset.src === background)) return undefined;
  return background;
}

function isDefaultCapsuleImage(src: string | undefined): boolean {
  return src === DEFAULT_CAPSULE_IMAGE || Boolean(src?.endsWith('/combo-assets/capsule-presets/default-capsule.png'));
}

function comboAxisRanges(chart: ComboChart): Array<{ startMs: number; endMs: number; axisIndex: number }> {
  const startup = chart.periods?.find((period) => period.kind === 'startup_axis');
  const loops = [...(chart.periods ?? [])].filter((period) => period.kind === 'loop_axis').sort((left, right) => left.startMs - right.startMs || (left.loopIndex ?? 0) - (right.loopIndex ?? 0));
  const ranges: Array<{ startMs: number; endMs: number; axisIndex: number }> = [];
  if (startup) ranges.push({ startMs: startup.startMs, endMs: startup.endMs, axisIndex: 1 });
  loops.forEach((period, index) => ranges.push({ startMs: period.startMs, endMs: period.endMs, axisIndex: index + 2 }));
  return ranges;
}

function axisIndexForTime(time: number, ranges: Array<{ startMs: number; endMs: number; axisIndex: number }>): number {
  const match = ranges.find((range) => time >= range.startMs && time <= range.endMs);
  return match?.axisIndex ?? 1;
}

function sortStepsForDisplay(steps: ComboStep[]): ComboStep[] {
  return [...steps].sort((left, right) => left.startMin - right.startMin || left.startMax - right.startMax || (left.characterSlot ?? 1) - (right.characterSlot ?? 1) || left.id.localeCompare(right.id));
}

export function chartToComboImageItems(chart: ComboChart | null, style: ComboImageStyle): ComboImageItem[] {
  if (!chart) return [];
  const axes = comboAxisRanges(chart);
  const steps = sortStepsForDisplay(chart.steps);
  const items = steps.map((step, index) => {
    const switchSlot = switchSlotForMove(step.moveId);
    const characterSlot = switchSlot ?? step.characterSlot ?? 1;
    const displayText = style.contentLabels[step.id] ?? step.label;
    const mappings = effectiveIconMappings(style, characterSlot);
    return {
      step,
      index,
      axisIndex: axisIndexForTime(step.startMin, axes),
      displayText,
      iconId: style.convertIcons && comboTextHasIcon(displayText, mappings) ? '__inline__' : undefined,
      isSwitch: Boolean(switchSlot),
      showAvatar: index === 0 || Boolean(switchSlot),
      characterSlot
    };
  });
  return style.mergeSameRoleSteps ? mergeSameRoleComboItems(items, style) : items;
}

export function visibleComboImageItems(items: ComboImageItem[], activeIndex: number, layout: 'horizontal' | 'vertical', bounds: { width: number; height: number }, style: ComboImageStyle): ComboImageItem[] {
  void activeIndex;
  void layout;
  void bounds;
  void style;
  return items;
}

export function comboImageItemContainsStep(item: ComboImageItem, stepId: string | undefined): boolean {
  if (!stepId) return false;
  return item.step.id === stepId || Boolean(item.mergedStepIds?.includes(stepId));
}

export function comboImageDisplayIndexForStep(items: ComboImageItem[], stepId: string | undefined): number {
  const index = items.findIndex((item) => comboImageItemContainsStep(item, stepId));
  return index >= 0 ? index : 0;
}

export function comboImageStepCenterPercent(item: ComboImageItem, stepId: string | undefined): number | undefined {
  if (!stepId) return undefined;
  return item.mergedParts?.find((part) => part.stepId === stepId)?.centerPercent;
}

export function comboImageContentCenterPercent(item: ComboImageItem, stepId: string | undefined): number | undefined {
  const center = comboImageStepCenterPercent(item, stepId);
  if (center === undefined) return undefined;
  return center;
}

export function comboImageItemSizeForDisplayItem(style: ComboImageStyle, item: ComboImageItem, roleStyle?: RoleStyle): { width: number; height: number } {
  if (!item.mergedParts || item.mergedParts.length <= 1) return comboImageItemSizeForText(style, item.displayText, item.showAvatar, roleStyle);
  const base = comboImageItemSize(style, roleStyle);
  if (style.capsuleWidthMode !== 'auto') return base;
  const contentUnits = mergedItemDisplayUnits(item, style, roleStyle);
  const avatarSpace = item.showAvatar ? Math.max(30, base.height * 0.62) : 0;
  const sidePadding = style.blockMode === 'image' ? Math.max(52, style.autoWidthPadding * 0.84) : Math.max(36, style.autoWidthPadding * 0.66);
  const minWidth = style.blockMode === 'image' ? comboImageStretchMinWidth(style, base.height, roleStyle) : 64;
  const mergedIconBuffer = Math.max(0, (item.mergedParts?.length ?? 0) - 1) * style.fontSize * 0.22;
  const width = Math.ceil(contentUnits * style.fontSize + avatarSpace + sidePadding + mergedIconBuffer);
  return { width: Math.max(minWidth, Math.min(1800, width)), height: base.height };
}

function mergeSameRoleComboItems(items: ComboImageItem[], style: ComboImageStyle): ComboImageItem[] {
  return mergeSameRoleSegment(items, style).map((item, index) => ({ ...item, index, showAvatar: item.showAvatar || index === 0 }));
}

function mergeSameRoleSegment(segment: ComboImageItem[], style: ComboImageStyle): ComboImageItem[] {
  if (!segment.length) return [];
  const groups: ComboImageMergeGroup[] = [];
  let current: ComboImageMergeGroup | null = null;
  for (const item of segment) {
    const { startMs, endMs } = comboItemMergeRange(item);
    if (current && canMergeIntoGroup(current, item, startMs, endMs)) {
      current.items.push(item);
      current.startMs = Math.min(current.startMs, startMs);
      current.endMs = Math.max(current.endMs, endMs);
      continue;
    }
    current = { items: [item], startMs, endMs, characterSlot: item.characterSlot };
    groups.push(current);
  }
  return groups.map((group) => mergeGroupToItem(group, style));
}

function canMergeIntoGroup(group: ComboImageMergeGroup, item: ComboImageItem, startMs: number, endMs: number): boolean {
  if (group.characterSlot !== item.characterSlot) return false;
  const touching = startMs <= group.endMs + SAME_ROLE_MERGE_GAP_MS && endMs >= group.startMs - SAME_ROLE_MERGE_GAP_MS;
  if (touching) return true;
  const last = [...group.items].sort((left, right) => left.step.startMin - right.step.startMin || left.index - right.index).at(-1);
  if (!last) return false;
  const lastVisibleEnd = last.step.startMin + last.step.durationMax;
  return item.step.startMin >= last.step.startMin && item.step.startMin - lastVisibleEnd <= SAME_ROLE_MERGE_SOFT_GAP_MS;
}

function mergeGroupToItem(group: ComboImageMergeGroup, style: ComboImageStyle): ComboImageItem {
  const items = [...group.items].sort((left, right) => left.step.startMin - right.step.startMin || left.index - right.index);
  const base = items.find((item) => item.isSwitch) ?? items[0];
  if (items.length === 1) return { ...base, mergedStepIds: [base.step.id], mergedParts: createMergedParts(base), sourceStartIndex: base.index, sourceEndIndex: base.index };
  const labels = items.map((item) => item.displayText).filter(Boolean);
  const displayText = labels.join('');
  const mergedStepIds = items.map((item) => item.step.id);
  const mergedParts = normalizeMergedParts(items.map(createMergedPart), group.startMs, group.endMs);
  const startMax = Math.max(...items.map((item) => item.step.startMax));
  return {
    ...base,
    displayText,
    iconId: style.convertIcons && comboTextHasIcon(displayText, effectiveIconMappings(style, base.characterSlot)) ? '__inline__' : undefined,
    showAvatar: items.some((item) => item.showAvatar),
    mergedStepIds,
    mergedParts,
    sourceStartIndex: Math.min(...items.map((item) => item.index)),
    sourceEndIndex: Math.max(...items.map((item) => item.index)),
    step: {
      ...base.step,
      id: `${mergedStepIds[0]}__merged__${mergedStepIds[mergedStepIds.length - 1]}`,
      label: displayText,
      startMin: group.startMs,
      startMax,
      durationMin: Math.max(...items.map((item) => item.step.durationMin), group.endMs - group.startMs),
      durationMax: Math.max(1, group.endMs - group.startMs)
    }
  };
}

function createMergedPart(item: ComboImageItem): ComboImageMergedPart {
  const { startMs, endMs } = comboItemMergeRange(item);
  return {
    stepId: item.step.id,
    displayText: item.displayText,
    iconId: item.iconId,
    startMs,
    endMs,
    centerPercent: 50,
    spanPercent: 100
  };
}

function createMergedParts(item: ComboImageItem): ComboImageMergedPart[] {
  const { startMs, endMs } = comboItemMergeRange(item);
  return normalizeMergedParts([createMergedPart(item)], startMs, endMs);
}

function comboItemMergeRange(item: ComboImageItem): { startMs: number; endMs: number } {
  const preheat = Math.max(0, item.step.preheatMs ?? 0);
  const recovery = Math.max(0, item.step.recoveryMs ?? 0);
  const startMs = Math.max(0, Math.min(item.step.startMin, item.step.startMax) - preheat);
  const latestStart = Math.max(item.step.startMin, item.step.startMax);
  const endMs = Math.max(startMs + 1, latestStart + item.step.durationMax + recovery);
  return { startMs, endMs };
}

function normalizeMergedParts(parts: ComboImageMergedPart[], startMs: number, endMs: number): ComboImageMergedPart[] {
  const span = Math.max(1, endMs - startMs);
  const count = Math.max(1, parts.length);
  return parts.map((part, index) => ({
    ...part,
    centerPercent: count === 1 ? 50 : 50 + (index - (count - 1) / 2) * 14,
    spanPercent: clampNumber(((part.endMs - part.startMs) / span) * 100, 8, 100, 100)
  }));
}

export function effectiveCapsuleImageFields(style: ComboImageStyle, roleStyle?: RoleStyle): CapsuleImageFields {
  const useRoleCapsule = Boolean(roleStyle?.capsuleImage);
  return {
    image: useRoleCapsule ? roleStyle?.capsuleImage : style.capsuleImage,
    width: useRoleCapsule ? roleStyle?.capsuleImageWidth : style.capsuleImageWidth,
    height: useRoleCapsule ? roleStyle?.capsuleImageHeight : style.capsuleImageHeight,
    crop: useRoleCapsule ? roleStyle?.capsuleCrop : style.capsuleCrop,
    stretch: useRoleCapsule ? roleStyle?.capsuleStretch : style.capsuleStretch
  };
}

export function comboImageItemSize(style: ComboImageStyle, roleStyle?: RoleStyle): { width: number; height: number } {
  const capsule = effectiveCapsuleImageFields(style, roleStyle);
  if (style.blockMode === 'image' && capsule.image && capsule.width && capsule.height) {
    const naturalWidth = clampNumber(capsule.width, 1, 5000, style.capsuleWidth);
    const naturalHeight = clampNumber(capsule.height, 1, 5000, style.capsuleHeight);
    const crop = normalizeRectPercent(capsule.crop, fullRectPercent());
    const croppedWidth = Math.max(1, naturalWidth * (crop.w / 100));
    const croppedHeight = Math.max(1, naturalHeight * (crop.h / 100));
    return {
      width: Math.max(1, Math.round(croppedWidth * style.capsuleImageScale)),
      height: Math.max(1, Math.round(croppedHeight * style.capsuleImageScale))
    };
  }
  return { width: style.capsuleWidth, height: style.capsuleHeight };
}

export function comboImageItemSizeForText(style: ComboImageStyle, text: string, showAvatar = false, roleStyle?: RoleStyle): { width: number; height: number } {
  const base = comboImageItemSize(style, roleStyle);
  if (style.capsuleWidthMode !== 'auto') return base;
  const textLength = comboTextDisplayUnits(text, style.convertIcons, effectiveIconMappings(style, roleStyle));
  const avatarSpace = showAvatar ? Math.max(24, base.height * 0.52) : 0;
  const width = Math.ceil(textLength * style.fontSize + style.autoWidthPadding + avatarSpace);
  const minWidth = style.blockMode === 'image' ? comboImageStretchMinWidth(style, base.height, roleStyle) : 64;
  return { width: Math.max(minWidth, Math.min(1800, width)), height: base.height };
}

export function comboImageBackgroundSource(style: ComboImageStyle): string | undefined {
  void style;
  return undefined;
}

function comboTextDisplayUnits(value: string, convertIcons: boolean, mappings = DEFAULT_ICON_MAPPINGS): number {
  return comboTextParts(value, convertIcons, mappings).reduce((sum, part) => {
    if (part.kind === 'icon') return sum + 1.62 * part.iconScale;
    return sum + Array.from(part.value).reduce((inner, char) => inner + (/[^\x00-\xff]/.test(char) ? 1 : 0.62), 0);
  }, 0);
}

function mergedItemDisplayUnits(item: ComboImageItem, style: ComboImageStyle, roleStyle?: RoleStyle): number {
  const mappings = effectiveIconMappings(style, roleStyle ?? item.characterSlot);
  if (!item.mergedParts?.length) return comboTextDisplayUnits(item.displayText, Boolean(item.iconId), mappings);
  return item.mergedParts.reduce((sum, part) => sum + comboTextDisplayUnits(part.displayText, Boolean(part.iconId), mappings), 0);
}

export function parseQuickInputText(value: string): string[] {
  return String(value || '')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function iconIdForText(value: string, mappings = DEFAULT_ICON_MAPPINGS): string | undefined {
  const trimmed = String(value || '').trim();
  if (!trimmed) return undefined;
  return mappings.find((mapping) => mapping.triggers.includes(trimmed))?.id;
}

export function iconSourceForId(iconId: string | undefined, mappings = DEFAULT_ICON_MAPPINGS): string | undefined {
  if (!iconId) return undefined;
  return mappings.find((icon) => icon.id === iconId)?.src;
}

export function comboTextParts(value: string, convertIcons: boolean, mappings = DEFAULT_ICON_MAPPINGS): ComboContentPart[] {
  const text = String(value || '');
  if (!convertIcons || !text) return text ? [{ kind: 'text', value: text }] : [];
  const parts: ComboContentPart[] = [];
  let buffer = '';
  let index = 0;
  const triggers = mappings.flatMap((mapping) => mapping.triggers.filter(Boolean).map((trigger) => ({ trigger, mapping }))).sort((left, right) => right.trigger.length - left.trigger.length);
  const pushText = () => {
    if (buffer) parts.push({ kind: 'text', value: buffer });
    buffer = '';
  };
  while (index < text.length) {
    const match = triggers.find(({ trigger }) => text.startsWith(trigger, index));
    if (match) {
      pushText();
      parts.push({ kind: 'icon', iconId: match.mapping.id, label: match.mapping.label, src: match.mapping.src, iconScale: clampNumber(match.mapping.iconScale, 0.35, 3, 1) });
      index += match.trigger.length;
      continue;
    }
    buffer += text[index];
    index += 1;
  }
  pushText();
  return parts;
}

function comboTextHasIcon(value: string, mappings = DEFAULT_ICON_MAPPINGS): boolean {
  return comboTextParts(value, true, mappings).some((part) => part.kind === 'icon');
}

export function convertTextToIconLabel(value: string): string {
  return value;
}

export function maybeConvertTextToIconLabel(value: string, enabled: boolean): string {
  void enabled;
  return value;
}

function normalizeStoredBasePresets(value: unknown): ComboImageStyle['basePresets'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const entry = item as Partial<ComboImageStyle['basePresets'][number]>;
    if (typeof entry.src !== 'string' || !entry.src.trim()) return [];
    const src = limitEmbeddedImage(entry.src.trim(), 1_400_000);
    if (!src || isRetiredBasePresetImage(src)) return [];
    const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : createLocalPresetId();
    return [{
      id,
      name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : '自定义底图',
      src,
      imageWidth: clampOptionalNumber(entry.imageWidth, 1, 5000),
      imageHeight: clampOptionalNumber(entry.imageHeight, 1, 5000),
      crop: entry.crop ? normalizeRectPercent(entry.crop, fullRectPercent()) : undefined,
      stretch: entry.stretch ? normalizeStretchPercent(entry.stretch) : undefined,
      user: entry.user !== false
    }];
  });
}

function createLocalPresetId(): string {
  return `base_preset_${Math.random().toString(36).slice(2)}`;
}

function normalizeIconMappings(value: unknown): ComboImageStyle['iconMappings'] {
  
  const source = Array.isArray(value) ? value : [];
  const byId = new Map(DEFAULT_ICON_MAPPINGS.map((mapping) => [mapping.id, { ...mapping, triggers: [...mapping.triggers] }]));

  for (const item of source) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Partial<ComboImageStyle['iconMappings'][number]>;
    if (typeof entry.id !== 'string' || !entry.id.trim()) continue;
    if (typeof entry.src !== 'string' || !entry.src.trim()) continue;
    const triggers = Array.isArray(entry.triggers)
      ? entry.triggers.map((trigger) => String(trigger).trim()).filter(Boolean)
      : [];
    if (!triggers.length) continue;
    const src = limitEmbeddedImage(entry.src.trim(), 800_000);
    if (!src) continue;
    byId.set(entry.id.trim(), {
      id: entry.id.trim(),
      label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : entry.id.trim(),
      src,
      triggers,
      iconScale: clampNumber(entry.iconScale, 0.35, 3, 1)
    });
  }

  return [...byId.values()];
}

export function normalizeComboIconMappings(value: unknown): ComboImageStyle['iconMappings'] {
  return normalizeIconMappings(value);
}

export function effectiveIconMappings(style: ComboImageStyle, role: CharacterSlot | RoleStyle | undefined): ComboImageStyle['iconMappings'] {
  const roleStyle = typeof role === 'number' ? style.roleStyles[role] : role;
  return roleStyle?.iconMappings?.length ? roleStyle.iconMappings : style.iconMappings;
}

export function switchSlotForMove(moveId: string): CharacterSlot | null {
  if (moveId === 'switch_1') return 1;
  if (moveId === 'switch_2') return 2;
  if (moveId === 'switch_3') return 3;
  return null;
}

function normalizeRoleStyle(fallback: RoleStyle, value: Partial<RoleStyle> | undefined): RoleStyle {
  const capsuleImage = sanitizeRoleCapsuleImage(value?.capsuleImage ?? fallback.capsuleImage);
  return {
    ...fallback,
    ...(value ?? {}),
    avatar: limitEmbeddedImage(value?.avatar ?? fallback.avatar, 800_000),
    avatarCrop: normalizeRectPercent(value?.avatarCrop),
    avatarSize: clampNumber(value?.avatarSize, 16, 240, fallback.avatarSize ?? 54),
    avatarOffsetX: clampNumber(value?.avatarOffsetX, -300, 300, fallback.avatarOffsetX ?? -18),
    avatarOffsetY: clampNumber(value?.avatarOffsetY, -300, 300, fallback.avatarOffsetY ?? 0),
    capsuleImage,
    capsuleImageWidth: capsuleImage ? clampOptionalNumber(value?.capsuleImageWidth, 1, 5000) : undefined,
    capsuleImageHeight: capsuleImage ? clampOptionalNumber(value?.capsuleImageHeight, 1, 5000) : undefined,
    capsuleCrop: capsuleImage && value?.capsuleCrop ? normalizeRectPercent(value.capsuleCrop, fullRectPercent()) : undefined,
    capsuleStretch: capsuleImage && value?.capsuleStretch ? normalizeStretchPercent(value.capsuleStretch) : undefined,
    iconMappings: Array.isArray(value?.iconMappings) ? normalizeIconMappings(value.iconMappings) : undefined
  };
}

function limitEmbeddedImage(src: string | undefined, maxLength: number): string | undefined {
  if (!src) return undefined;
  if (!src.startsWith('data:')) return src;
  return src.length <= maxLength ? src : undefined;
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Number(value)));
}

function clampOptionalNumber(value: number | undefined, min: number, max: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Number(value)));
}

export function defaultRectPercent(): RectPercent {
  return { x: 10, y: 10, w: 80, h: 80 };
}

export function fullRectPercent(): RectPercent {
  return { x: 0, y: 0, w: 100, h: 100 };
}

export function defaultStretchPercent(): StretchPercent {
  return { left: 33, right: 67 };
}

export function normalizeRectPercent(value: Partial<RectPercent> | undefined, fallback: RectPercent = defaultRectPercent()): RectPercent {
  const w = clampNumber(value?.w, 5, 100, fallback.w);
  const h = clampNumber(value?.h, 5, 100, fallback.h);
  return {
    x: clampNumber(value?.x, 0, 100 - w, fallback.x),
    y: clampNumber(value?.y, 0, 100 - h, fallback.y),
    w,
    h
  };
}

export function normalizeStretchPercent(value: Partial<StretchPercent> | undefined): StretchPercent {
  const fallback = defaultStretchPercent();
  const left = clampNumber(value?.left, 0, 100, fallback.left);
  return { left, right: clampNumber(value?.right, left, 100, fallback.right) };
}

function comboImageStretchMinWidth(style: ComboImageStyle, height: number, roleStyle?: RoleStyle): number {
  const capsule = effectiveCapsuleImageFields(style, roleStyle);
  const naturalWidth = clampNumber(capsule.width, 1, 5000, style.capsuleWidth);
  const naturalHeight = clampNumber(capsule.height, 1, 5000, style.capsuleHeight);
  const crop = normalizeRectPercent(capsule.crop, fullRectPercent());
  const cropWidth = Math.max(1, naturalWidth * (crop.w / 100));
  const cropHeight = Math.max(1, naturalHeight * (crop.h / 100));
  const stretch = normalizeStretchPercent(capsule.stretch);
  const cropX = naturalWidth * (crop.x / 100);
  const leftLine = clampNumber((stretch.left / 100) * naturalWidth - cropX, 1, Math.max(1, cropWidth - 2), 1);
  const rightLine = clampNumber((stretch.right / 100) * naturalWidth - cropX, leftLine + 1, Math.max(leftLine + 1, cropWidth - 1), cropWidth - 1);
  const leftSourceWidth = leftLine;
  const rightSourceWidth = Math.max(0, cropWidth - rightLine);
  const fixedWidth = (leftSourceWidth + rightSourceWidth) * (height / cropHeight);
  return Math.ceil(fixedWidth + Math.max(8, height * 0.16));
}
