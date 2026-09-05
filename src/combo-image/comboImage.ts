import type { CharacterSlot, ComboChart, ComboImageStyle, ComboStep, RectPercent, StretchPercent } from '../../combo-core';
import { characterTideIconSourceForMappingId, keyboardMouseIconSource, tideIconSourceForMappingId } from '../gamepadIcons';

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
  mergedMoveGroups?: ComboImageMergedMove[];
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

export type ComboImageMergedMove = {
  moveId: string;
  displayText: string;
  iconId?: string;
  iconLabel?: string;
  iconSrc?: string;
  iconScale?: number;
  iconWidthScale?: number;
  renderAsIcon: boolean;
  count: number;
  stepIds: string[];
  startMs: number;
  endMs: number;
};

type ComboImageMergeGroup = {
  items: ComboImageItem[];
  startMs: number;
  endMs: number;
  characterSlot: CharacterSlot;
};

export type ComboContentPart = { kind: 'text'; value: string } | { kind: 'icon'; iconId: string; label: string; src: string; iconScale: number; iconWidthScale: number };

const DEFAULT_CAPSULE_IMAGE = '/combo-assets/capsule-presets/default-capsule.png';
const DEFAULT_BASE_PRESET_IMAGE = '/combo-assets/base-presets/通用.png';
const FORWARD_KEY_ICON = keyboardMouseIconSource('KeyW') ?? '/combo-assets/button-icons/forward.png';
const GENERATED_SPECIAL_KEY_ICONS: Record<string, { generated: string | undefined; project: string }> = {
  finisher: { generated: keyboardMouseIconSource('KeyF', 'accent'), project: '/combo-assets/button-icons/finisher.png' },
  i: { generated: keyboardMouseIconSource('Digit1', 'accent'), project: '/combo-assets/button-icons/i.png' },
  ii: { generated: keyboardMouseIconSource('Digit2', 'accent'), project: '/combo-assets/button-icons/ii.png' },
  iii: { generated: keyboardMouseIconSource('Digit3', 'accent'), project: '/combo-assets/button-icons/iii.png' },
  iv: { generated: keyboardMouseIconSource('Digit4', 'accent'), project: '/combo-assets/button-icons/iii.png' }
};

type RoleStyle = ComboImageStyle['roleStyles'][CharacterSlot];
type CapsuleImageFields = {
  image?: string;
  width?: number;
  height?: number;
  crop?: RectPercent;
  stretch?: StretchPercent;
  edge: number;
};

export const DEFAULT_ROLE_COLORS: Record<CharacterSlot, string> = {
  1: '#3459a4',
  2: '#8f4b57',
  3: '#326d5d',
  4: '#8064a2'
};

export const DEFAULT_ICON_MAPPINGS: ComboImageStyle['iconMappings'] = [
  { id: 'mouse-right-hold', label: '长按闪避', src: '/combo-assets/button-icons/mouse-right-hold.png', triggers: ['S', 'D', '闪', '长按闪避'] },
  { id: 'mouse-left-hold', label: '长按普攻', src: '/combo-assets/button-icons/mouse-left-hold.png', triggers: ['A', 'z', 'Z', '长按普攻', '重击'] },
  { id: 'skill-hold', label: '长按技能', src: '/combo-assets/button-icons/skill-hold.png', triggers: ['E', '长按技能'] },
  { id: 'echo-hold', label: '长按声骸', src: '/combo-assets/button-icons/echo-hold.png', triggers: ['Q', '长按声骸'] },
  { id: 'liberation-hold', label: '长按解放', src: '/combo-assets/button-icons/liberation-hold.png', triggers: ['R', '长按解放', '长按共鸣解放'] },
  { id: 'jump-hold', label: '长按跳跃', src: '/combo-assets/button-icons/jump-hold.png', triggers: ['J', '长按跳跃'] },
  { id: 'mouse-left', label: '普攻', src: '/combo-assets/button-icons/mouse-left.png', triggers: ['a', '普攻'] },
  { id: 'skill', label: '技能', src: '/combo-assets/button-icons/skill.png', triggers: ['e', '技能'] },
  { id: 'echo', label: '声骸', src: '/combo-assets/button-icons/echo.png', triggers: ['q', '声骸'] },
  { id: 'tool', label: '工具', src: '/combo-assets/button-icons/tool.png', triggers: ['t', '工具'] },
  { id: 'liberation', label: '共鸣解放', src: '/combo-assets/button-icons/liberation.png', triggers: ['r', '共鸣解放'] },
  { id: 'mouse-right', label: '闪避', src: '/combo-assets/button-icons/mouse-right.png', triggers: ['s', 'd', '闪避'] },
  { id: 'jump', label: '跳跃', src: '/combo-assets/button-icons/jump.png', triggers: ['j', '跳跃', '跳'] },
  { id: 'intro', label: '变奏 / Intro', src: '/combo-assets/button-icons/intro.png', triggers: ['b', 'B', '变奏', '变奏切人', '变奏技能', '变奏技', 'intro', 'Intro', 'INTRO', 'intro skill', 'Intro Skill', 'Intro Character Switch'] },
  { id: 'outro', label: '延奏 / Outro', src: '/combo-assets/button-icons/outro.png', triggers: ['y', 'Y', '延奏', '延奏切人', '延奏技能', '延奏技', 'outro', 'Outro', 'OUTRO', 'outro skill', 'Outro Skill', 'Outro Character Switch'] },
  { id: 'finisher', label: '处决 / Tunebreak', src: '/combo-assets/button-icons/finisher.png', triggers: ['f'] },
  { id: 'forward', label: '前走 / Forward', src: FORWARD_KEY_ICON, triggers: ['w'] },
  { id: 'iii', label: '3', src: '/combo-assets/button-icons/iii.png', triggers: ['iii'] },
  { id: 'ii', label: '2', src: '/combo-assets/button-icons/ii.png', triggers: ['ii'] },
  { id: 'i', label: '1', src: '/combo-assets/button-icons/i.png', triggers: ['i'] },
  { id: 'iv', label: '4', src: GENERATED_SPECIAL_KEY_ICONS.iv.generated ?? GENERATED_SPECIAL_KEY_ICONS.iv.project, triggers: ['iv', 'iiii', '4'] }
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
  t: { id: 'tool', label: '工具', src: '/combo-assets/button-icons/tool.png' },
  T: { id: 'tool', label: '工具', src: '/combo-assets/button-icons/tool.png' },
  r: { id: 'liberation', label: '共鸣解放', src: '/combo-assets/button-icons/liberation.png' },
  R: { id: 'liberation-hold', label: '长按解放', src: '/combo-assets/button-icons/liberation-hold.png' },
  s: { id: 'mouse-right', label: '闪避', src: '/combo-assets/button-icons/mouse-right.png' },
  d: { id: 'mouse-right', label: '闪避', src: '/combo-assets/button-icons/mouse-right.png' },
  j: { id: 'jump', label: '跳跃', src: '/combo-assets/button-icons/jump.png' },
  b: { id: 'intro', label: '变奏 / Intro', src: '/combo-assets/button-icons/intro.png' },
  y: { id: 'outro', label: '延奏 / Outro', src: '/combo-assets/button-icons/outro.png' },
  f: { id: 'finisher', label: '处决 / Tunebreak', src: '/combo-assets/button-icons/finisher.png' },
  w: { id: 'forward', label: '前走 / Forward', src: FORWARD_KEY_ICON }
};

const TEXT_ICON_MAP: Record<string, { id: string; label: string; src: string }> = {
  长按闪避: { id: 'mouse-right-hold', label: '长按闪避', src: '/combo-assets/button-icons/mouse-right-hold.png' },
  长按技能: { id: 'skill-hold', label: '长按技能', src: '/combo-assets/button-icons/skill-hold.png' },
  长按声骸: { id: 'echo-hold', label: '长按声骸', src: '/combo-assets/button-icons/echo-hold.png' },
  长按共鸣解放: { id: 'liberation-hold', label: '长按共鸣解放', src: '/combo-assets/button-icons/liberation-hold.png' },
  长按跳跃: { id: 'jump-hold', label: '长按跳跃', src: '/combo-assets/button-icons/jump-hold.png' },
  工具: { id: 'tool', label: '工具', src: '/combo-assets/button-icons/tool.png' },
  iii: { id: 'iii', label: '3', src: '/combo-assets/button-icons/iii.png' },
  ii: { id: 'ii', label: '2', src: '/combo-assets/button-icons/ii.png' },
  i: { id: 'i', label: '1', src: '/combo-assets/button-icons/i.png' },
  跳: { id: 'jump', label: '跳跃', src: '/combo-assets/button-icons/jump.png' },
  变奏: { id: 'intro', label: '变奏 / Intro', src: '/combo-assets/button-icons/intro.png' },
  延奏: { id: 'outro', label: '延奏 / Outro', src: '/combo-assets/button-icons/outro.png' },
  intro: { id: 'intro', label: '变奏 / Intro', src: '/combo-assets/button-icons/intro.png' },
  Intro: { id: 'intro', label: '变奏 / Intro', src: '/combo-assets/button-icons/intro.png' },
  'intro skill': { id: 'intro', label: '变奏 / Intro', src: '/combo-assets/button-icons/intro.png' },
  'Intro Skill': { id: 'intro', label: '变奏 / Intro', src: '/combo-assets/button-icons/intro.png' },
  outro: { id: 'outro', label: '延奏 / Outro', src: '/combo-assets/button-icons/outro.png' },
  Outro: { id: 'outro', label: '延奏 / Outro', src: '/combo-assets/button-icons/outro.png' },
  'outro skill': { id: 'outro', label: '延奏 / Outro', src: '/combo-assets/button-icons/outro.png' },
  'Outro Skill': { id: 'outro', label: '延奏 / Outro', src: '/combo-assets/button-icons/outro.png' }
};

export const AVATAR_PRESETS: Array<{ name: string; src: string }> = [];
export const CAPSULE_PRESETS: Array<{ name: string; src: string }> = [
  { name: '默认底图', src: DEFAULT_CAPSULE_IMAGE }
];

export function scaleComboImageStyle(style: ComboImageStyle, scaleInput: number): ComboImageStyle {
  const scale = Math.min(4, Math.max(0.25, Number.isFinite(scaleInput) ? scaleInput : 1));
  if (Math.abs(scale - 1) < 0.001) return style;
  const scaleRole = (role: ComboImageStyle['roleStyles'][CharacterSlot]) => ({
    ...role,
    avatarSize: role.avatarSize === undefined ? role.avatarSize : role.avatarSize * scale,
    avatarOffsetX: role.avatarOffsetX === undefined ? role.avatarOffsetX : role.avatarOffsetX * scale,
    avatarOffsetY: role.avatarOffsetY === undefined ? role.avatarOffsetY : role.avatarOffsetY * scale
  });
  return {
    ...style,
    roleStyles: {
      4: scaleRole(style.roleStyles[4]),
      1: scaleRole(style.roleStyles[1]),
      2: scaleRole(style.roleStyles[2]),
      3: scaleRole(style.roleStyles[3])
    },
    fontSize: style.fontSize * scale,
    textStrokeWidth: style.textStrokeWidth * scale,
    avatarSize: style.avatarSize * scale,
    avatarOffsetX: style.avatarOffsetX * scale,
    avatarOffsetY: style.avatarOffsetY * scale,
    capsuleWidth: style.capsuleWidth * scale,
    autoWidthPadding: style.autoWidthPadding * scale,
    capsuleHeight: style.capsuleHeight * scale,
    imageBlockWidth: style.imageBlockWidth * scale,
    imageBlockHeight: style.imageBlockHeight * scale,
    capsuleImageScale: style.capsuleImageScale,
    overallScale: style.overallScale,
    capsuleGap: style.capsuleGap * scale,
    edgePadding: style.edgePadding * scale,
    scrollStartOffsetPx: style.scrollStartOffsetPx * scale
  };
}

export function createDefaultComboImageStyle(): ComboImageStyle {
  return {
    roleStyles: {
      4: { name: 'Character 4', color: DEFAULT_ROLE_COLORS[4], avatarCrop: defaultRectPercent(), avatarSize: 70, avatarOffsetX: -20, avatarOffsetY: 0 },
      1: { name: '角色1', color: DEFAULT_ROLE_COLORS[1], avatarCrop: defaultRectPercent(), avatarSize: 70, avatarOffsetX: -20, avatarOffsetY: 0 },
      2: { name: '角色2', color: DEFAULT_ROLE_COLORS[2], avatarCrop: defaultRectPercent(), avatarSize: 70, avatarOffsetX: -20, avatarOffsetY: 0 },
      3: { name: '角色3', color: DEFAULT_ROLE_COLORS[3], avatarCrop: defaultRectPercent(), avatarSize: 70, avatarOffsetX: -20, avatarOffsetY: 0 }
    },
    iconSet: 'classic',
    blockMode: 'image',
    capsuleShape: 'capsule',
    backgroundCrop: fullRectPercent(),
    capsuleColor: '#33445c',
    useCustomCapsuleColor: false,
    capsuleImage: DEFAULT_BASE_PRESET_IMAGE,
    capsuleImageWidth: 426,
    capsuleImageHeight: 426,
    imageBlockWidth: 600,
    imageBlockHeight: 55,
    capsuleImageScale: 1,
    overallScale: 1,
    capsuleCrop: { x: 4, y: 43, w: 93, h: 14 },
    capsuleStretch: { left: 11, right: 86 },
    capsuleEdge: 0,
    textColor: '#eef3f7',
    textStrokeEnabled: false,
    textStrokeWidth: 2,
    textStrokeColor: '#050505',
    fontSize: 22,
    fontFamily: 'Microsoft YaHei, Inter, system-ui, sans-serif',
    promptFontFamily: 'Microsoft YaHei, Inter, system-ui, sans-serif',
    avatarSize: 70,
    avatarOffsetX: -20,
    avatarOffsetY: 0,
    capsuleWidth: 200,
    capsuleWidthMode: 'auto',
    autoWidthPadding: 72,
    capsuleHeight: 80,
    capsuleGap: 20,
    edgePadding: 1,
    scrollAnchor: 'center',
    scrollStartOffsetPx: 0,
    fadeEnabled: false,
    fadeRange: 30,
    prePromptEnabled: true,
    convertIcons: true,
    mergeSameRoleSteps: true,
    mergeSameRoleLimit: 10,
    mergeSameMoveSteps: false,
    showNotesSeparately: true,
    noteScale: 1,
    noteFontFamily: 'Microsoft YaHei, Inter, system-ui, sans-serif',
    noteTextColor: '#ffffff',
    noteTextStrokeEnabled: true,
    noteTextStrokeWidth: 3,
    noteTextStrokeColor: '#050505',
    noteOrder: 'oldest-bottom',
    stairRoleOffset: 48,
    iconMappings: DEFAULT_ICON_MAPPINGS,
    basePresets: [],
    avatarPresets: [],
    contentLabels: {}
  };
}

function normalizeContentLabels(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([stepId, label]) => {
    if (typeof label !== 'string') return [];
    return stepId.trim() && label.trim() ? [[stepId, label]] : [];
  }));
}

export function normalizeComboImageStyle(value: Partial<ComboImageStyle> | null | undefined): ComboImageStyle {
  const fallback = createDefaultComboImageStyle();
  const capsuleImage = sanitizeCapsuleImage(value?.capsuleImage, fallback.capsuleImage);
  const backgroundImage = sanitizeComboBackground(value?.backgroundImage, capsuleImage);
  const capsuleImageWidth = clampOptionalNumber(value?.capsuleImageWidth, 1, 5000) ?? fallback.capsuleImageWidth;
  const capsuleImageHeight = clampOptionalNumber(value?.capsuleImageHeight, 1, 5000) ?? fallback.capsuleImageHeight;
  const capsuleCrop = normalizeRectPercent(value?.capsuleCrop, fallback.capsuleCrop ?? fullRectPercent());
  const legacyImageScale = clampNumber(value?.capsuleImageScale, 0.05, 8, fallback.capsuleImageScale);
  const hasIndependentImageSize = Number.isFinite(value?.imageBlockWidth) && Number.isFinite(value?.imageBlockHeight);
  const legacyImageBlockWidth = Math.max(1, Math.round((capsuleImageWidth ?? fallback.imageBlockWidth) * capsuleCrop.w / 100 * legacyImageScale));
  const legacyImageBlockHeight = Math.max(1, Math.round((capsuleImageHeight ?? fallback.imageBlockHeight) * capsuleCrop.h / 100 * legacyImageScale));
  return {
    ...fallback,
    ...value,
    iconSet: value?.iconSet === 'tide' ? 'tide' : 'classic',
    backgroundImage,
    capsuleImage,
    roleStyles: {
      4: normalizeRoleStyle(fallback.roleStyles[4], value?.roleStyles?.[4]),
      1: normalizeRoleStyle(fallback.roleStyles[1], value?.roleStyles?.[1]),
      2: normalizeRoleStyle(fallback.roleStyles[2], value?.roleStyles?.[2]),
      3: normalizeRoleStyle(fallback.roleStyles[3], value?.roleStyles?.[3])
    },
    blockMode: value?.blockMode === 'image' || (value?.blockMode === undefined && fallback.blockMode === 'image') ? 'image' : 'capsule',
    capsuleShape: value?.capsuleShape === 'rect' ? 'rect' : 'capsule',
    capsuleImageWidth,
    capsuleImageHeight,
    imageBlockWidth: clampNumber(value?.imageBlockWidth, 24, 1800, hasIndependentImageSize ? fallback.imageBlockWidth : legacyImageBlockWidth),
    imageBlockHeight: clampNumber(value?.imageBlockHeight, 16, 500, hasIndependentImageSize ? fallback.imageBlockHeight : legacyImageBlockHeight),
    capsuleImageScale: 1,
    overallScale: clampNumber(value?.overallScale, 0.25, 4, fallback.overallScale),
    textStrokeEnabled: Boolean(value?.textStrokeEnabled),
    textStrokeWidth: clampNumber(value?.textStrokeWidth, 0, 12, fallback.textStrokeWidth),
    textStrokeColor: typeof value?.textStrokeColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.textStrokeColor) ? value.textStrokeColor : fallback.textStrokeColor,
    fontSize: clampNumber(value?.fontSize, 12, 72, fallback.fontSize),
    fontFamily: typeof value?.fontFamily === 'string' && value.fontFamily.trim() ? value.fontFamily.trim() : fallback.fontFamily,
    promptFontFamily: typeof value?.promptFontFamily === 'string' && value.promptFontFamily.trim() ? value.promptFontFamily.trim() : fallback.promptFontFamily,
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
    convertIcons: value?.convertIcons !== false,
    mergeSameRoleSteps: value?.mergeSameRoleSteps !== false,
    mergeSameRoleLimit: clampNumber(value?.mergeSameRoleLimit, 1, 30, fallback.mergeSameRoleLimit),
    mergeSameMoveSteps: Boolean(value?.mergeSameMoveSteps),
    showNotesSeparately: value?.showNotesSeparately !== false,
    noteScale: clampNumber(value?.noteScale, 0.25, 4, fallback.noteScale),
    noteFontFamily: typeof value?.noteFontFamily === 'string' && value.noteFontFamily.trim() ? value.noteFontFamily.trim() : fallback.noteFontFamily,
    noteTextColor: typeof value?.noteTextColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.noteTextColor) ? value.noteTextColor : fallback.noteTextColor,
    noteTextStrokeEnabled: value?.noteTextStrokeEnabled !== false,
    noteTextStrokeWidth: clampNumber(value?.noteTextStrokeWidth, 0, 16, fallback.noteTextStrokeWidth),
    noteTextStrokeColor: typeof value?.noteTextStrokeColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.noteTextStrokeColor) ? value.noteTextStrokeColor : fallback.noteTextStrokeColor,
    noteOrder: value?.noteOrder === 'oldest-top' ? 'oldest-top' : 'oldest-bottom',
    stairRoleOffset: clampNumber(value?.stairRoleOffset, 0, 1000, fallback.stairRoleOffset),
    iconMappings: normalizeIconMappings(value?.iconMappings),
    basePresets: normalizeStoredBasePresets(value?.basePresets),
    avatarPresets: normalizeStoredAvatarPresets(value?.avatarPresets),
    backgroundCrop: normalizeRectPercent(value?.backgroundCrop, fullRectPercent()),
    capsuleCrop,
    capsuleStretch: normalizeStretchPercent(value?.capsuleStretch ?? fallback.capsuleStretch),
    capsuleEdge: clampNumber(value?.capsuleEdge, 0, 100, fallback.capsuleEdge),
    contentLabels: normalizeContentLabels(value?.contentLabels)
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
  return Boolean(src?.includes('/combo-assets/base-presets/') && /(?:光主|暗主|雷主|风主)\.(?:webp|png)(?:$|[?#])/i.test(src));
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

export function chartToComboImageItems(chart: ComboChart | null, style: ComboImageStyle, layout: 'horizontal' | 'vertical' = 'horizontal', bounds?: { width: number; height: number }): ComboImageItem[] {
  if (!chart) return [];
  const axes = comboAxisRanges(chart);
  const steps = sortStepsForDisplay(chart.steps);
  const items = steps.map((step, index) => {
    const switchSlot = switchSlotForMove(step.moveId);
    const characterSlot = step.characterSlot ?? switchSlot ?? 1;
    // The style is the live editor state; chart labels are the import/export
    // fallback. Keeping both here prevents a stale style snapshot from
    // changing which b/y icon sequence is rendered after chart switching.
    const displayText = style.contentLabels[step.id]?.trim()
      || chart.contentLabels?.[step.id]?.trim()
      || defaultComboContentLabelForMoveId(step.moveId)
      || step.label;
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
  return style.mergeSameRoleSteps ? mergeSameRoleComboItems(items, style, layout, bounds) : items;
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
  const mappings = effectiveIconMappings(style, roleStyle ?? item.characterSlot);
  const mergedMoveGroups = item.mergedMoveGroups?.length ? item.mergedMoveGroups : undefined;
  const contentUnits = mergedMoveGroups
    ? mergedMoveGroups.reduce((sum, group) => sum + (group.renderAsIcon ? 1.62 * (group.iconScale ?? 1) * (group.iconWidthScale ?? 1) + (group.count > 1 ? 1.7 : 0.2) : comboTextDisplayUnits(group.displayText, style.convertIcons, mappings)), 0)
    : item.mergedParts.reduce((sum, part) => sum + comboTextDisplayUnits(part.displayText, Boolean(part.iconId), mappings), 0);
  const avatarSpace = item.showAvatar ? Math.max(30, base.height * 0.62) : 0;
  const sidePadding = style.blockMode === 'image' ? Math.max(52, style.autoWidthPadding * 0.84) : Math.max(36, style.autoWidthPadding * 0.66);
  const minWidth = style.blockMode === 'image' ? comboImageStretchMinWidth(style, base.height, roleStyle) : 64;
  const mergedIconBuffer = Math.max(0, item.mergedParts.length - 1) * style.fontSize * 0.22;
  const width = Math.ceil(contentUnits * style.fontSize + avatarSpace + sidePadding + mergedIconBuffer);
  return { width: Math.max(minWidth, Math.min(1800, width)), height: base.height };
}

function mergeSameRoleComboItems(items: ComboImageItem[], style: ComboImageStyle, layout: 'horizontal' | 'vertical', bounds?: { width: number; height: number }): ComboImageItem[] {
  const groups: ComboImageMergeGroup[] = [];
  let current: ComboImageMergeGroup | null = null;
  const configuredLimit = Math.max(1, Math.floor(style.mergeSameRoleLimit || 6));
  const roleStyleFor = (item: ComboImageItem) => style.roleStyles[item.characterSlot];
  for (const item of items) {
    const { startMs, endMs } = comboItemVisualMergeRange(item);
    const widthLimit = mergedItemWidthLimit(style, layout, roleStyleFor(item), bounds?.width);
    const widthLimitReached = current && widthLimit !== null ? !canAppendMergedItem(current, item, style, roleStyleFor(item), widthLimit) : false;
    if (!current || item.isSwitch || current.items.length >= configuredLimit || widthLimitReached) {
      current = { items: [item], startMs, endMs, characterSlot: item.characterSlot };
      groups.push(current);
      continue;
    }
    current.items.push(item);
    current.startMs = Math.min(current.startMs, startMs);
    current.endMs = Math.max(current.endMs, endMs);
  }
  return groups.map((group, index) => ({ ...mergeGroupToItem(group, style), index, showAvatar: true }));
}

function mergedItemWidthLimit(style: ComboImageStyle, layout: 'horizontal' | 'vertical', roleStyle: RoleStyle | undefined, viewportWidth?: number): number | null {
  const visibleWidth = viewportWidth === undefined ? null : Math.max(1, viewportWidth - style.edgePadding * 2);
  if (style.capsuleWidthMode === 'fixed') {
    const fixedWidth = comboImageItemSize(style, roleStyle).width;
    return visibleWidth === null || layout === 'horizontal' ? fixedWidth : Math.min(fixedWidth, visibleWidth);
  }
  return layout === 'vertical' ? visibleWidth : null;
}

function canAppendMergedItem(group: ComboImageMergeGroup, item: ComboImageItem, style: ComboImageStyle, roleStyle: RoleStyle | undefined, allowedWidth: number): boolean {
  const testGroup = { ...group, items: [...group.items, item] };
  const testItem = { ...mergeGroupToItem(testGroup, style), showAvatar: true  };
  const size = comboImageItemSizeForDisplayItem(style, testItem, roleStyle);
  return Math.max(size.width, estimatedMergedContentWidth(testItem, style, roleStyle)) <= allowedWidth;
}

function estimatedMergedContentWidth(item: ComboImageItem, style: ComboImageStyle, roleStyle?: RoleStyle): number {
  if (!item.mergedParts?.length) return comboImageItemSizeForText(style, item.displayText, item.showAvatar, roleStyle).width;
  const base = comboImageItemSize(style, roleStyle);
  const mappings = effectiveIconMappings(style, roleStyle ?? item.characterSlot);
  const mergedMoveGroups = item.mergedMoveGroups?.length ? item.mergedMoveGroups : undefined;
  const contentUnits = mergedMoveGroups
    ? mergedMoveGroups.reduce((sum, group) => sum + (group.renderAsIcon ? 1.62 * (group.iconScale ?? 1) * (group.iconWidthScale ?? 1) + (group.count > 1 ? 1.25 : 0.2) : comboTextDisplayUnits(group.displayText, style.convertIcons, mappings)), 0)
    : item.mergedParts.reduce((sum, part) => sum + comboTextDisplayUnits(part.displayText, Boolean(part.iconId), mappings), 0);
  const avatarSpace = item.showAvatar ? Math.max(30, base.height * 0.62) : 0;
  const sidePadding = style.blockMode === 'image' ? Math.max(52, style.autoWidthPadding * 0.84) : Math.max(36, style.autoWidthPadding * 0.66);
  const mergedIconBuffer = Math.max(0, item.mergedParts.length - 1) * style.fontSize * 0.22;
  return Math.ceil(contentUnits * style.fontSize + avatarSpace + sidePadding + mergedIconBuffer);
}

function mergeGroupToItem(group: ComboImageMergeGroup, style: ComboImageStyle): ComboImageItem {
  const items = [...group.items].sort((left, right) => left.step.startMin - right.step.startMin || left.index - right.index);
  const base = items.find((item) => item.isSwitch) ?? items[0];
  const mergedMoveGroups = style.mergeSameMoveSteps ? createMergedMoveGroups(items, style) : undefined;
  if (items.length === 1) return { ...base, mergedStepIds: [base.step.id], mergedParts: createMergedParts(base), mergedMoveGroups, sourceStartIndex: base.index, sourceEndIndex: base.index };
  const labels = items.map((item) => item.displayText).filter(Boolean);
  const displayText = labels.join('');
  const mergedStepIds = items.map((item) => item.step.id);
  const rawMergedParts = items.map(createMergedPart);
  const highlightStartMs = Math.min(...rawMergedParts.map((part) => part.startMs));
  const highlightEndMs = Math.max(...rawMergedParts.map((part) => part.endMs));
  const mergedParts = normalizeMergedParts(rawMergedParts, highlightStartMs, highlightEndMs);
  const startMax = Math.max(...items.map((item) => item.step.startMax));
  return {
    ...base,
    displayText,
    iconId: style.convertIcons && comboTextHasIcon(displayText, effectiveIconMappings(style, base.characterSlot)) ? '__inline__' : undefined,
    showAvatar: items.some((item) => item.showAvatar),
    mergedStepIds,
    mergedParts,
    mergedMoveGroups,
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

function createMergedMoveGroups(items: ComboImageItem[], style: ComboImageStyle): ComboImageMergedMove[] | undefined {
  const groups: ComboImageMergedMove[] = [];
  for (const item of items) {
    const mappings = effectiveIconMappings(style, item.characterSlot);
    const parts = comboTextParts(item.displayText, style.convertIcons, mappings);
    const iconParts = parts.filter((part): part is Extract<typeof part, { kind: 'icon' }> => part.kind === 'icon');
    const icon = iconParts.length > 0 && iconParts.length === parts.length && iconParts.every((part) => part.iconId === iconParts[0].iconId)
      ? iconParts[0]
      : undefined;
    const { startMs, endMs } = comboItemMergeRange(item);
    const previous = groups[groups.length - 1];
    if (icon && previous?.renderAsIcon && previous.moveId === item.step.moveId && previous.iconId === icon.iconId) {
      previous.count += 1;
      previous.stepIds.push(item.step.id);
      previous.endMs = Math.max(previous.endMs, endMs);
      continue;
    }
    groups.push({
      moveId: item.step.moveId,
      displayText: item.displayText,
      ...(icon ? {
        iconId: icon.iconId,
        iconLabel: icon.label,
        iconSrc: icon.src,
        iconScale: icon.iconScale,
        iconWidthScale: icon.iconWidthScale
      } : {}),
      renderAsIcon: Boolean(icon),
      count: 1,
      stepIds: [item.step.id],
      startMs,
      endMs
    });
  }
  return groups.some((group) => group.renderAsIcon && group.count > 1) ? groups : undefined;
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

function comboItemVisualMergeRange(item: ComboImageItem): { startMs: number; endMs: number } {
  const startMs = Math.max(0, item.step.startMin);
  const endMs = Math.max(startMs + 1, startMs + item.step.durationMax);
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
    stretch: useRoleCapsule ? roleStyle?.capsuleStretch : style.capsuleStretch,
    edge: useRoleCapsule ? (roleStyle?.capsuleEdge ?? 0) : style.capsuleEdge
  };
}

export function capsuleEdgeSourceRange(naturalHeightInput: number, cropYInput: number, cropHeightInput: number, edgePercentInput: number): { y: number; height: number } {
  const naturalHeight = Math.max(1, naturalHeightInput);
  const cropHeight = Math.min(naturalHeight, Math.max(1, cropHeightInput));
  const cropY = Math.min(naturalHeight - cropHeight, Math.max(0, cropYInput));
  const edgePercent = Number.isFinite(edgePercentInput) ? Math.min(100, Math.max(0, edgePercentInput)) : 0;
  const height = Math.min(naturalHeight, cropHeight + naturalHeight * edgePercent / 100);
  const centeredY = cropY - (height - cropHeight) / 2;
  return { y: Math.min(naturalHeight - height, Math.max(0, centeredY)), height };
}

export function capsuleImageVerticalOverflow(style: ComboImageStyle, targetHeightInput: number, roleStyle?: RoleStyle): { top: number; bottom: number } {
  const capsule = effectiveCapsuleImageFields(style, roleStyle);
  if (style.blockMode !== 'image' || !capsule.image) return { top: 0, bottom: 0 };
  const naturalHeight = Math.max(1, capsule.height ?? style.capsuleHeight ?? 80);
  const crop = normalizeRectPercent(capsule.crop, fullRectPercent());
  const cropY = (crop.y / 100) * naturalHeight;
  const cropHeight = Math.max(1, (crop.h / 100) * naturalHeight);
  const heightScale = Math.max(1, targetHeightInput) / cropHeight;
  const edgeSource = capsuleEdgeSourceRange(naturalHeight, cropY, cropHeight, capsule.edge);
  return {
    top: Math.max(0, (cropY - edgeSource.y) * heightScale),
    bottom: Math.max(0, (edgeSource.y + edgeSource.height - cropY - cropHeight) * heightScale)
  };
}

export function verticalComboTrackClipCompensation(
  style: ComboImageStyle,
  item: ComboImageItem | undefined,
  itemStart: number,
  trackOffset: number,
  minimumTopClearance = 0
): number {
  if (!item) return 0;
  const roleStyle = style.roleStyles[item.characterSlot];
  const size = comboImageItemSizeForDisplayItem(style, item, roleStyle);
  const overflow = capsuleImageVerticalOverflow(style, size.height, roleStyle).top;
  return Math.max(0, Math.ceil(Math.max(overflow, minimumTopClearance) - (itemStart + trackOffset)));
}

export function comboImageItemSize(style: ComboImageStyle, roleStyle?: RoleStyle): { width: number; height: number } {
  const capsule = effectiveCapsuleImageFields(style, roleStyle);
  if (style.blockMode === 'image' && capsule.image) {
    const width = Math.max(1, Math.round(style.imageBlockWidth));
    const height = Math.max(1, Math.round(style.imageBlockHeight));
    return {
      width: style.capsuleWidthMode === 'fixed' ? Math.max(width, comboImageStretchMinWidth(style, height, roleStyle)) : width,
      height
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
  const parts = comboTextParts(value, convertIcons, mappings);
  const contentUnits = parts.reduce((sum, part) => {
    if (part.kind === 'icon') return sum + 1.62 * part.iconScale * part.iconWidthScale;
    return sum + Array.from(part.value).reduce((inner, char) => inner + (/[^\x00-\xff]/.test(char) ? 1 : 0.62), 0);
  }, 0);
  return contentUnits + Math.max(0, parts.length - 1) * 0.18;
}


export function parseQuickInputText(value: string): string[] {
  return String(value || '')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function defaultComboContentLabelForMoveId(moveId: string): string | undefined {
  if (moveId === 'basic_attack') return 'a';
  if (moveId === 'heavy_attack') return 'z';
  if (moveId === 'skill') return 'e';
  if (moveId === 'skill_hold') return 'E';
  if (moveId === 'echo') return 'q';
  if (moveId === 'echo_hold') return 'Q';
  if (moveId === 'tool') return 't';
  if (moveId === 'liberation') return 'r';
  if (moveId === 'liberation_hold') return 'R';
  if (moveId === 'dodge') return 's';
  if (moveId === 'dodge_hold') return 'S';
  if (moveId === 'jump') return 'j';
  if (moveId === 'jump_hold') return 'J';
  if (moveId === 'finisher') return 'f';
  if (moveId === 'empty_action') return 'w';
  if (moveId === 'switch_1') return 'i';
  if (moveId === 'switch_2') return 'ii';
  if (moveId === 'switch_3') return 'iii';
  if (moveId === 'switch_4') return 'iiii';
  return undefined;
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
  if (!text) return [];
  const parts: ComboContentPart[] = [];
  let buffer = '';
  let index = 0;
  const triggers = convertIcons
    ? mappings.flatMap((mapping) => mapping.triggers.filter(Boolean).map((trigger) => ({ trigger, mapping }))).sort((left, right) => right.trigger.length - left.trigger.length)
    : [];
  const pushText = () => {
    if (buffer) parts.push({ kind: 'text', value: buffer });
    buffer = '';
  };
  while (index < text.length) {
    if (text[index] === '[') {
      const closingIndex = text.indexOf(']', index + 1);
      if (closingIndex >= 0) {
        pushText();
        const literalText = text.slice(index + 1, closingIndex);
        if (literalText) parts.push({ kind: 'text', value: literalText });
        index = closingIndex + 1;
        continue;
      }
    }
    const match = triggers.find(({ trigger }) => text.startsWith(trigger, index));
    if (match) {
      pushText();
      parts.push({ kind: 'icon', iconId: match.mapping.id, label: match.mapping.label, src: match.mapping.src, iconScale: clampNumber(match.mapping.iconScale, 0.35, 3, 1), iconWidthScale: clampNumber(match.mapping.iconWidthScale, 1, 4, 1) });
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
      edge: clampNumber(entry.edge, 0, 100, 0),
      user: entry.user !== false
    }];
  });
}

function normalizeStoredAvatarPresets(value: unknown): ComboImageStyle['avatarPresets'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const entry = item as Partial<ComboImageStyle['avatarPresets'][number]>;
    if (typeof entry.src !== 'string' || !entry.src.trim()) return [];
    const src = limitEmbeddedImage(entry.src.trim(), 800_000);
    if (!src) return [];
    const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : createLocalPresetId();
    return [{
      id,
      name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : '自定义头像',
      src,
      crop: entry.crop ? normalizeRectPercent(entry.crop, fullRectPercent()) : undefined,
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
    let triggers = Array.isArray(entry.triggers)
      ? entry.triggers.map((trigger) => String(trigger).trim()).filter(Boolean)
      : [];
    if (entry.id.trim() === 'jump' && triggers.includes('跳') && !triggers.includes('跳跃')) triggers.push('跳跃');
    if (entry.id.trim() === 'mouse-left-hold' && triggers.some((trigger) => ['A', 'z', 'Z', '长按普攻', '重击'].includes(trigger))) {
      triggers = triggers.filter((trigger) => trigger !== 'a');
      for (const trigger of ['A', 'z', 'Z']) if (!triggers.includes(trigger)) triggers.push(trigger);
    }
    const id = entry.id.trim();
    if (!triggers.length) continue;
    const defaultMapping = byId.get(id);
    if ((id === 'intro' || id === 'outro') && defaultMapping) {
      triggers = [...new Set([...defaultMapping.triggers, ...triggers])];
    }
    const storedSource = entry.src.trim();
    const builtInForwardSource = id === 'forward' && storedSource.endsWith('/combo-assets/button-icons/forward.png');
    const generatedSpecialIcon = GENERATED_SPECIAL_KEY_ICONS[id];
    const migratedSource = builtInForwardSource
      ? FORWARD_KEY_ICON
      : generatedSpecialIcon?.generated === storedSource
        ? generatedSpecialIcon.project
        : storedSource;
    const src = limitEmbeddedImage(migratedSource, 800_000);
    if (!src) continue;
    byId.set(id, {
      id,
      label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : id,
      src,
      triggers,
      iconScale: clampNumber(entry.iconScale, 0.35, 3, 1),
      iconWidthScale: clampNumber(entry.iconWidthScale, 1, 4, 1)
    });
  }

  return [...byId.values()];
}

export function normalizeComboIconMappings(value: unknown): ComboImageStyle['iconMappings'] {
  return normalizeIconMappings(value);
}

export function effectiveIconMappings(style: ComboImageStyle, role: CharacterSlot | RoleStyle | undefined): ComboImageStyle['iconMappings'] {
  const globalMappings = normalizeIconMappings(style.iconMappings);
  const roleStyle = typeof role === 'number' ? style.roleStyles[role] : role;
  const applyIconSet = (mappings: ComboImageStyle['iconMappings'], characterName?: string) => style.iconSet === 'tide'
    ? mappings.map((mapping) => {
      const classicSource = DEFAULT_ICON_MAPPINGS.find((item) => item.id === mapping.id)?.src;
      const genericSource = tideIconSourceForMappingId(mapping.id);
      const src = characterTideIconSourceForMappingId(mapping.id, characterName) ?? genericSource;
      const isBuiltInSource = mapping.src === classicSource || mapping.src === genericSource;
      return src && isBuiltInSource ? { ...mapping, src } : mapping;
    })
    : mappings;
  const roleMappings = roleStyle?.iconMappings;
  if (!roleMappings?.length) return applyIconSet(globalMappings, roleStyle?.name);

  // Role snapshots are still needed for per-character custom icons, but they
  // must not erase newer global triggers (especially Intro/Outro aliases).
  const explicitRoleIds = new Set(roleMappings.flatMap((mapping) => {
    if (!mapping || typeof mapping.id !== 'string' || !mapping.id.trim()) return [];
    return [mapping.id.trim()];
  }));
  const normalizedRoleMappings = normalizeIconMappings(roleMappings);
  const roleById = new Map(normalizedRoleMappings.map((mapping) => [mapping.id, mapping]));
  const merged = globalMappings.map((mapping) => {
    if (!explicitRoleIds.has(mapping.id)) return mapping;
    const roleMapping = roleById.get(mapping.id);
    if (!roleMapping) return mapping;
    return {
      ...mapping,
      ...roleMapping,
      triggers: [...new Set([...mapping.triggers, ...roleMapping.triggers])]
    };
  });
  const globalIds = new Set(globalMappings.map((mapping) => mapping.id));
  return applyIconSet([...merged, ...normalizedRoleMappings.filter((mapping) => !globalIds.has(mapping.id))], roleStyle?.name);
}

export function switchSlotForMove(moveId: string): CharacterSlot | null {
  if (moveId === 'switch_1') return 1;
  if (moveId === 'switch_2') return 2;
  if (moveId === 'switch_3') return 3;
  if (moveId === 'switch_4') return 4;
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
    capsuleEdge: capsuleImage ? clampNumber(value?.capsuleEdge, 0, 100, 0) : undefined,
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
  const naturalWidth = clampNumber(capsule.width, 1, 5000, style.imageBlockWidth);
  const naturalHeight = clampNumber(capsule.height, 1, 5000, style.imageBlockHeight);
  const crop = normalizeRectPercent(capsule.crop, fullRectPercent());
  const cropWidth = Math.max(1, naturalWidth * crop.w / 100);
  const cropHeight = Math.max(1, naturalHeight * crop.h / 100);
  const cropX = naturalWidth * crop.x / 100;
  const stretch = normalizeStretchPercent(capsule.stretch);
  const leftLine = clampNumber(naturalWidth * stretch.left / 100 - cropX, 1, Math.max(1, cropWidth - 2), 1);
  const rightLine = clampNumber(naturalWidth * stretch.right / 100 - cropX, leftLine + 1, Math.max(leftLine + 1, cropWidth - 1), cropWidth - 1);
  const fixedEdgesWidth = (leftLine + Math.max(0, cropWidth - rightLine)) * (height / cropHeight);
  const minimumStretchWidth = fixedEdgesWidth + Math.max(24, height * 0.42);
  return Math.min(1800, Math.max(24, Math.ceil(minimumStretchWidth)));
}


export function effectiveComboImageStyle(style: ComboImageStyle): ComboImageStyle {
  return scaleComboImageStyle(style, style.overallScale);
}
