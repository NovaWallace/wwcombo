import { normalizeInputCode } from '../combo-core/input';

export type ShortcutAction =
  | 'timelineDelete'
  | 'timelineSplit'
  | 'timelineMerge'
  | 'timelineStartAdd'
  | 'timelineTogglePeriod'
  | 'timelineAdaptiveSwitch'
  | 'timelineAppendOutro'
  | 'timelinePlaceBasic'
  | 'timelinePlaceHeavy'
  | 'timelinePlaceHeavyAlternate'
  | 'timelinePlaceSkill'
  | 'timelinePlaceSkillHold'
  | 'timelinePlaceEcho'
  | 'timelinePlaceEchoHold'
  | 'timelinePlaceLiberation'
  | 'timelinePlaceLiberationHold'
  | 'timelinePlaceDodge'
  | 'timelinePlaceDodgeAlternate'
  | 'timelinePlaceDodgeHold'
  | 'timelinePlaceDodgeHoldAlternate'
  | 'timelinePlaceJump'
  | 'timelinePlaceJumpHold'
  | 'timelinePlaceFinisher'
  | 'timelinePlaceEmpty'
  | 'timelinePlaceIntroSwitch'
  | 'videoPlayPause'
  | 'videoSeekBackward'
  | 'videoSeekForward';

export type ShortcutSettings = Record<ShortcutAction, string>;

export type ShortcutDefinition = {
  id: ShortcutAction;
  group: 'timeline' | 'placement' | 'video';
  chinese: string;
  english: string;
};

export const DEFAULT_SHORTCUT_SETTINGS: ShortcutSettings = {
  timelineDelete: 'Delete',
  timelineSplit: 'KeyC',
  timelineMerge: 'KeyV',
  timelineStartAdd: 'Shift',
  timelineTogglePeriod: 'KeyX',
  timelineAdaptiveSwitch: 'Tab',
  timelineAppendOutro: 'KeyY',
  timelinePlaceBasic: 'KeyA',
  timelinePlaceHeavy: 'KeyZ',
  timelinePlaceHeavyAlternate: 'Shift+KeyA',
  timelinePlaceSkill: 'KeyE',
  timelinePlaceSkillHold: 'Shift+KeyE',
  timelinePlaceEcho: 'KeyQ',
  timelinePlaceEchoHold: 'Shift+KeyQ',
  timelinePlaceLiberation: 'KeyR',
  timelinePlaceLiberationHold: 'Shift+KeyR',
  timelinePlaceDodge: 'KeyD',
  timelinePlaceDodgeAlternate: 'KeyS',
  timelinePlaceDodgeHold: 'Shift+KeyD',
  timelinePlaceDodgeHoldAlternate: 'Shift+KeyS',
  timelinePlaceJump: 'KeyJ',
  timelinePlaceJumpHold: 'Shift+KeyJ',
  timelinePlaceFinisher: 'KeyF',
  timelinePlaceEmpty: 'KeyW',
  timelinePlaceIntroSwitch: 'KeyB',
  videoPlayPause: 'Space',
  videoSeekBackward: 'ArrowLeft',
  videoSeekForward: 'ArrowRight'
};

export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  { id: 'timelineDelete', group: 'timeline', chinese: '删除选择 / 删除模式', english: 'Delete Selection / Delete Mode' },
  { id: 'timelineSplit', group: 'timeline', chinese: '分割选择 / 分割模式', english: 'Split Selection / Split Mode' },
  { id: 'timelineMerge', group: 'timeline', chinese: '合并选中块', english: 'Merge Selected Blocks' },
  { id: 'timelineStartAdd', group: 'timeline', chinese: '进入添加模式', english: 'Enter Add Mode' },
  { id: 'timelineTogglePeriod', group: 'timeline', chinese: '切换时段放置', english: 'Toggle Period Placement' },
  { id: 'timelineAdaptiveSwitch', group: 'timeline', chinese: '自适应切人', english: 'Adaptive Character Switch' },
  { id: 'timelineAppendOutro', group: 'timeline', chinese: '为选中块追加延奏', english: 'Append Outro to Selected Blocks' },
  { id: 'timelinePlaceBasic', group: 'placement', chinese: '普攻', english: 'Basic Attack' },
  { id: 'timelinePlaceHeavy', group: 'placement', chinese: '重击', english: 'Heavy Attack' },
  { id: 'timelinePlaceHeavyAlternate', group: 'placement', chinese: '重击（备用）', english: 'Heavy Attack (Alternate)' },
  { id: 'timelinePlaceSkill', group: 'placement', chinese: '技能', english: 'Resonance Skill' },
  { id: 'timelinePlaceSkillHold', group: 'placement', chinese: '长按技能', english: 'Hold Resonance Skill' },
  { id: 'timelinePlaceEcho', group: 'placement', chinese: '声骸', english: 'Echo Skill' },
  { id: 'timelinePlaceEchoHold', group: 'placement', chinese: '长按声骸', english: 'Hold Echo Skill' },
  { id: 'timelinePlaceLiberation', group: 'placement', chinese: '解放', english: 'Resonance Liberation' },
  { id: 'timelinePlaceLiberationHold', group: 'placement', chinese: '长按解放', english: 'Hold Resonance Liberation' },
  { id: 'timelinePlaceDodge', group: 'placement', chinese: '闪避', english: 'Dodge' },
  { id: 'timelinePlaceDodgeAlternate', group: 'placement', chinese: '闪避（备用）', english: 'Dodge (Alternate)' },
  { id: 'timelinePlaceDodgeHold', group: 'placement', chinese: '长按闪避', english: 'Hold Dodge' },
  { id: 'timelinePlaceDodgeHoldAlternate', group: 'placement', chinese: '长按闪避（备用）', english: 'Hold Dodge (Alternate)' },
  { id: 'timelinePlaceJump', group: 'placement', chinese: '跳跃', english: 'Jump' },
  { id: 'timelinePlaceJumpHold', group: 'placement', chinese: '长按跳跃', english: 'Hold Jump' },
  { id: 'timelinePlaceFinisher', group: 'placement', chinese: '处决', english: 'Finisher' },
  { id: 'timelinePlaceEmpty', group: 'placement', chinese: '空招式', english: 'Empty Action' },
  { id: 'timelinePlaceIntroSwitch', group: 'placement', chinese: '变奏切人', english: 'Intro Character Switch' },
  { id: 'videoPlayPause', group: 'video', chinese: '播放 / 暂停视频', english: 'Play / Pause Video' },
  { id: 'videoSeekBackward', group: 'video', chinese: '后退 0.5 秒', english: 'Seek Backward 0.5s' },
  { id: 'videoSeekForward', group: 'video', chinese: '前进 0.5 秒', english: 'Seek Forward 0.5s' }
];

const SHORTCUT_ACTIONS = SHORTCUT_DEFINITIONS.map((definition) => definition.id);

export function normalizeShortcutSettings(value: unknown): ShortcutSettings {
  const source = value && typeof value === 'object' ? value as Partial<Record<ShortcutAction, unknown>> : {};
  return Object.fromEntries(SHORTCUT_ACTIONS.map((action) => {
    const chord = typeof source[action] === 'string' ? source[action]!.trim() : '';
    return [action, chord && !/^(Control|Alt|Meta)(Left|Right)?(?:\+|$)/.test(chord) ? chord : DEFAULT_SHORTCUT_SETTINGS[action]];
  })) as ShortcutSettings;
}

export function shortcutChordFromCode(code: string, shiftKey = false): string {
  const normalized = normalizeInputCode(code);
  if (normalized === 'ShiftLeft' || normalized === 'ShiftRight') return 'Shift';
  return shiftKey ? `Shift+${normalized}` : normalized;
}

export function shortcutChordFromKeyboardEvent(event: KeyboardEvent): string | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  return shortcutChordFromCode(event.code, event.shiftKey);
}

export function shortcutMatchesCode(code: string, shiftKey: boolean, configured: string): boolean {
  return shortcutChordFromCode(code, shiftKey) === configured;
}

export function shortcutMatches(event: KeyboardEvent, configured: string): boolean {
  return shortcutChordFromKeyboardEvent(event) === configured;
}

export function shortcutDisplayLabel(chord: string): string {
  return chord.split('+').map((part) => {
    if (part === 'Shift') return 'Shift';
    if (part === 'Delete') return 'Del';
    if (part === 'Space') return 'Space';
    if (part === 'Tab') return 'Tab';
    if (part === 'ArrowLeft') return 'Left';
    if (part === 'ArrowRight') return 'Right';
    if (part === 'ArrowUp') return 'Up';
    if (part === 'ArrowDown') return 'Down';
    if (part.startsWith('Key')) return part.slice(3);
    if (part.startsWith('Digit')) return part.slice(5);
    return part;
  }).join(' + ');
}

export const TIMELINE_PLACEMENT_SHORTCUT_MOVES: readonly [ShortcutAction, string, string?][] = [
  ['timelinePlaceBasic', 'basic_attack'],
  ['timelinePlaceHeavy', 'heavy_attack'],
  ['timelinePlaceHeavyAlternate', 'heavy_attack'],
  ['timelinePlaceSkill', 'skill'],
  ['timelinePlaceSkillHold', 'skill_hold'],
  ['timelinePlaceEcho', 'echo'],
  ['timelinePlaceEchoHold', 'echo_hold'],
  ['timelinePlaceLiberation', 'liberation'],
  ['timelinePlaceLiberationHold', 'liberation_hold'],
  ['timelinePlaceDodge', 'dodge'],
  ['timelinePlaceDodgeAlternate', 'dodge'],
  ['timelinePlaceDodgeHold', 'dodge_hold'],
  ['timelinePlaceDodgeHoldAlternate', 'dodge_hold'],
  ['timelinePlaceJump', 'jump'],
  ['timelinePlaceJumpHold', 'jump_hold'],
  ['timelinePlaceFinisher', 'empty_action', 'f'],
  ['timelinePlaceEmpty', 'empty_action']
];
