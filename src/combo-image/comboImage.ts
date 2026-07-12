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
};

export type ComboContentPart = { kind: 'text'; value: string } | { kind: 'icon'; iconId: string; label: string };

const DEFAULT_CAPSULE_IMAGE = '/combo-assets/capsule-presets/default-capsule.png';

type RoleStyle = ComboImageStyle['roleStyles'][CharacterSlot];

export const DEFAULT_ROLE_COLORS: Record<CharacterSlot, string> = {
  1: '#3459a4',
  2: '#8f4b57',
  3: '#326d5d'
};

export const SKILL_ICON_MAP: Record<string, { id: string; label: string; src: string }> = {
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
    contentLabels: {}
  };
}

export function normalizeComboImageStyle(value: Partial<ComboImageStyle> | null | undefined): ComboImageStyle {
  const fallback = createDefaultComboImageStyle();
  const backgroundImage = sanitizeComboBackground(value?.backgroundImage, value?.capsuleImage ?? fallback.capsuleImage);
  const capsuleImage = limitEmbeddedImage(value?.capsuleImage ?? fallback.capsuleImage, 1_400_000);
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
    capsuleImageWidth: clampOptionalNumber(value?.capsuleImageWidth, 1, 5000),
    capsuleImageHeight: clampOptionalNumber(value?.capsuleImageHeight, 1, 5000),
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
    backgroundCrop: normalizeRectPercent(value?.backgroundCrop, fullRectPercent()),
    capsuleCrop: normalizeRectPercent(value?.capsuleCrop, fullRectPercent()),
    capsuleStretch: normalizeStretchPercent(value?.capsuleStretch),
    contentLabels: { ...(value?.contentLabels ?? {}) }
  };
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
  let currentSlot: CharacterSlot = steps[0]?.characterSlot ?? 1;
  return steps.map((step, index) => {
    const switchSlot = switchSlotForMove(step.moveId);
    if (switchSlot) currentSlot = switchSlot;
    const characterSlot = switchSlot ?? step.characterSlot ?? currentSlot;
    const displayText = style.contentLabels[step.id] ?? step.label;
    return {
      step,
      index,
      axisIndex: axisIndexForTime(step.startMin, axes),
      displayText,
      iconId: style.convertIcons && comboTextHasIcon(displayText) ? '__inline__' : undefined,
      isSwitch: Boolean(switchSlot),
      showAvatar: index === 0 || Boolean(switchSlot),
      characterSlot
    };
  });
}

export function visibleComboImageItems(items: ComboImageItem[], activeIndex: number, layout: 'horizontal' | 'vertical', bounds: { width: number; height: number }, style: ComboImageStyle): ComboImageItem[] {
  void activeIndex;
  void layout;
  void bounds;
  void style;
  return items;
}

export function comboImageItemSize(style: ComboImageStyle): { width: number; height: number } {
  if (style.blockMode === 'image' && style.capsuleImage && style.capsuleImageWidth && style.capsuleImageHeight) {
    const naturalWidth = clampNumber(style.capsuleImageWidth, 1, 5000, style.capsuleWidth);
    const naturalHeight = clampNumber(style.capsuleImageHeight, 1, 5000, style.capsuleHeight);
    const croppedWidth = Math.max(1, naturalWidth * ((style.capsuleCrop?.w ?? 100) / 100));
    const croppedHeight = Math.max(1, naturalHeight * ((style.capsuleCrop?.h ?? 100) / 100));
    return {
      width: Math.max(1, Math.round(croppedWidth * style.capsuleImageScale)),
      height: Math.max(1, Math.round(croppedHeight * style.capsuleImageScale))
    };
  }
  return { width: style.capsuleWidth, height: style.capsuleHeight };
}

export function comboImageItemSizeForText(style: ComboImageStyle, text: string, showAvatar = false): { width: number; height: number } {
  const base = comboImageItemSize(style);
  if (style.capsuleWidthMode !== 'auto') return base;
  const textLength = Array.from(String(text || '')).reduce((sum, char) => sum + (/[^\x00-\xff]/.test(char) ? 1 : 0.62), 0);
  const avatarSpace = showAvatar ? Math.max(24, base.height * 0.52) : 0;
  const width = Math.ceil(textLength * style.fontSize + style.autoWidthPadding + avatarSpace);
  const minWidth = style.blockMode === 'image' ? comboImageStretchMinWidth(style, base.height) : 64;
  return { width: Math.max(minWidth, Math.min(1800, width)), height: base.height };
}

export function comboImageBackgroundSource(style: ComboImageStyle): string | undefined {
  void style;
  return undefined;
}

export function parseQuickInputText(value: string): string[] {
  return String(value || '')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function iconIdForText(value: string): string | undefined {
  const trimmed = String(value || '').trim();
  if (!trimmed) return undefined;
  const direct = SKILL_ICON_MAP[trimmed];
  if (direct) return direct.id;
  const textIcon = TEXT_ICON_MAP[trimmed];
  return textIcon?.id;
}

export function iconSourceForId(iconId: string | undefined): string | undefined {
  if (!iconId) return undefined;
  return [...Object.values(SKILL_ICON_MAP), ...Object.values(TEXT_ICON_MAP)].find((icon) => icon.id === iconId)?.src;
}

export function comboTextParts(value: string, convertIcons: boolean): ComboContentPart[] {
  const text = String(value || '');
  if (!convertIcons || !text) return text ? [{ kind: 'text', value: text }] : [];
  const parts: ComboContentPart[] = [];
  let buffer = '';
  let index = 0;
  const textEntries = Object.entries(TEXT_ICON_MAP).sort((left, right) => right[0].length - left[0].length);
  const pushText = () => {
    if (buffer) parts.push({ kind: 'text', value: buffer });
    buffer = '';
  };
  while (index < text.length) {
    const textIcon = textEntries.find(([label]) => text.startsWith(label, index));
    if (textIcon) {
      pushText();
      parts.push({ kind: 'icon', iconId: textIcon[1].id, label: textIcon[1].label });
      index += textIcon[0].length;
      continue;
    }
    const direct = SKILL_ICON_MAP[text[index]];
    if (direct) {
      pushText();
      parts.push({ kind: 'icon', iconId: direct.id, label: direct.label });
      index += 1;
      continue;
    }
    buffer += text[index];
    index += 1;
  }
  pushText();
  return parts;
}

function comboTextHasIcon(value: string): boolean {
  return comboTextParts(value, true).some((part) => part.kind === 'icon');
}

export function convertTextToIconLabel(value: string): string {
  return value;
}

export function maybeConvertTextToIconLabel(value: string, enabled: boolean): string {
  void enabled;
  return value;
}

export function switchSlotForMove(moveId: string): CharacterSlot | null {
  if (moveId === 'switch_1') return 1;
  if (moveId === 'switch_2') return 2;
  if (moveId === 'switch_3') return 3;
  return null;
}

function normalizeRoleStyle(fallback: RoleStyle, value: Partial<RoleStyle> | undefined): RoleStyle {
  return {
    ...fallback,
    ...(value ?? {}),
    avatar: limitEmbeddedImage(value?.avatar ?? fallback.avatar, 800_000),
    avatarCrop: normalizeRectPercent(value?.avatarCrop),
    avatarSize: clampNumber(value?.avatarSize, 16, 240, fallback.avatarSize ?? 54),
    avatarOffsetX: clampNumber(value?.avatarOffsetX, -300, 300, fallback.avatarOffsetX ?? -18),
    avatarOffsetY: clampNumber(value?.avatarOffsetY, -300, 300, fallback.avatarOffsetY ?? 0)
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

function comboImageStretchMinWidth(style: ComboImageStyle, height: number): number {
  const naturalWidth = clampNumber(style.capsuleImageWidth, 1, 5000, style.capsuleWidth);
  const naturalHeight = clampNumber(style.capsuleImageHeight, 1, 5000, style.capsuleHeight);
  const crop = normalizeRectPercent(style.capsuleCrop, fullRectPercent());
  const cropWidth = Math.max(1, naturalWidth * (crop.w / 100));
  const cropHeight = Math.max(1, naturalHeight * (crop.h / 100));
  const stretch = normalizeStretchPercent(style.capsuleStretch);
  const cropX = naturalWidth * (crop.x / 100);
  const leftLine = clampNumber((stretch.left / 100) * naturalWidth - cropX, 1, Math.max(1, cropWidth - 2), 1);
  const rightLine = clampNumber((stretch.right / 100) * naturalWidth - cropX, leftLine + 1, Math.max(leftLine + 1, cropWidth - 1), cropWidth - 1);
  const leftSourceWidth = leftLine;
  const rightSourceWidth = Math.max(0, cropWidth - rightLine);
  const fixedWidth = (leftSourceWidth + rightSourceWidth) * (height / cropHeight);
  return Math.ceil(fixedWidth + Math.max(8, height * 0.16));
}
