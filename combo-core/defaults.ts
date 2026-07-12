import type { KeyBinding, MoveDefinition } from './types';

export const DEFAULT_MOVES: MoveDefinition[] = [
  {
    id: 'start_challenge',
    label: '开始',
    color: '#f5c542',
    independent: false,
    priority: 100,
    advancesStep: false
  },
  {
    id: 'stop_recording',
    label: '结束记录',
    color: '#d7dee8',
    independent: false,
    priority: 100,
    advancesStep: false
  },
  {
    id: 'basic_attack',
    label: '普攻',
    color: '#7fd1ae',
    independent: true,
    priority: 10,
    advancesStep: false
  },
  {
    id: 'heavy_attack',
    label: '重击',
    color: '#62b6cb',
    independent: false,
    priority: 45,
    advancesStep: true
  },
  {
    id: 'skill',
    label: '技能',
    color: '#6c8cff',
    independent: false,
    priority: 60,
    advancesStep: true
  },
  {
    id: 'echo',
    label: '声骸',
    color: '#b983ff',
    independent: false,
    priority: 55,
    advancesStep: true
  },
  {
    id: 'liberation',
    label: '共鸣解放',
    color: '#ff6b6b',
    independent: false,
    priority: 70,
    advancesStep: true
  },
  {
    id: 'dodge',
    label: '闪避',
    color: '#f8961e',
    independent: false,
    priority: 50,
    advancesStep: true
  },
  {
    id: 'jump',
    label: '跳跃',
    color: '#90be6d',
    independent: false,
    priority: 40,
    advancesStep: true
  },
  {
    id: 'switch_1',
    label: '1',
    color: '#43aa8b',
    independent: false,
    priority: 65,
    advancesStep: true
  },
  {
    id: 'switch_2',
    label: '2',
    color: '#4d908e',
    independent: false,
    priority: 65,
    advancesStep: true
  },
  {
    id: 'switch_3',
    label: '3',
    color: '#577590',
    independent: false,
    priority: 65,
    advancesStep: true
  }
];

export const DEFAULT_BINDINGS: KeyBinding[] = [
  { moveId: 'start_challenge', inputs: [{ code: 'KeyF', label: 'F' }] },
  { moveId: 'stop_recording', inputs: [{ code: 'Escape', label: 'Esc' }] },
  { moveId: 'basic_attack', inputs: [{ code: 'MouseLeft', label: '鼠标左键' }] },
  { moveId: 'heavy_attack', inputs: [{ code: 'MouseLeftHold', label: '鼠标左键长按' }] },
  { moveId: 'skill', inputs: [{ code: 'KeyE', label: 'E' }] },
  { moveId: 'echo', inputs: [{ code: 'KeyQ', label: 'Q' }] },
  { moveId: 'liberation', inputs: [{ code: 'KeyR', label: 'R' }] },
  { moveId: 'dodge', inputs: [{ code: 'ShiftLeft', label: 'Shift' }, { code: 'MouseRight', label: '鼠标右键' }] },
  { moveId: 'jump', inputs: [{ code: 'Space', label: '空格' }] },
  { moveId: 'switch_1', inputs: [{ code: 'Digit1', label: '1' }] },
  { moveId: 'switch_2', inputs: [{ code: 'Digit2', label: '2' }] },
  { moveId: 'switch_3', inputs: [{ code: 'Digit3', label: '3' }] }
];
