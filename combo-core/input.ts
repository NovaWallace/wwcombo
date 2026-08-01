import type { KeyBinding, MoveActivation, MoveDefinition, TrainerInputEvent } from './types';

export function buildMoveMap(moves: MoveDefinition[]): Map<string, MoveDefinition> {
  return new Map(moves.map((move) => [move.id, move]));
}

export function buildBindingMap(bindings: KeyBinding[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const binding of bindings) {
    for (const input of binding.inputs) {
      map.set(normalizeInputCode(input.code), binding.moveId);
    }
  }
  return map;
}

export function normalizeInputCode(code: string): string {
  const normalized = String(code || '').trim();
  const lower = normalized.toLowerCase();
  const compactLower = lower.replace(/[\s_-]+/g, '');
  const comboParts = normalized.split('+').map((part) => part.trim()).filter(Boolean);
  if (comboParts.length > 1) return comboParts.map((part) => normalizeInputCode(part)).join('+');
  const aliases: Record<string, string> = {
    gamepada: 'GamepadA',
    gamepadb: 'GamepadB',
    gamepadx: 'GamepadX',
    gamepady: 'GamepadY',
    gamepadlb: 'GamepadLB',
    gamepadrb: 'GamepadRB',
    gamepadlt: 'GamepadLT',
    gamepadrt: 'GamepadRT',
    gamepaddpadup: 'GamepadDPadUp',
    gamepaddpaddown: 'GamepadDPadDown',
    gamepaddpadleft: 'GamepadDPadLeft',
    gamepaddpadright: 'GamepadDPadRight',
    esc: 'Escape',
    escape: 'Escape',
    f: 'KeyF',
    space: 'Space',
    shift: 'ShiftLeft',
    lshift: 'ShiftLeft',
    rshift: 'ShiftRight',
    ctrl: 'ControlLeft',
    control: 'ControlLeft',
    alt: 'AltLeft',
    mouseleft: 'MouseLeft',
    mouseright: 'MouseRight',
    mousemiddle: 'MouseMiddle',
    '鼠标左键': 'MouseLeft',
    '鼠标右键': 'MouseRight',
    '鼠标中键': 'MouseMiddle',
    '空格': 'Space'
  };
  if (aliases[lower]) return aliases[lower];
  const sideButtonAliases: Record<string, string> = {
    xbutton1: 'Mouse3',
    mouseback: 'Mouse3',
    browserback: 'Mouse3',
    mousebutton4: 'Mouse3',
    xbutton2: 'Mouse4',
    mouseforward: 'Mouse4',
    browserforward: 'Mouse4',
    mousebutton5: 'Mouse4'
  };
  if (sideButtonAliases[compactLower]) return sideButtonAliases[compactLower];
  const mouseNumber = /^mouse(\d+)$/.exec(compactLower)?.[1];
  if (mouseNumber !== undefined) return `Mouse${Number(mouseNumber)}`;
  if (/^[a-z]$/i.test(normalized)) return `Key${normalized.toUpperCase()}`;
  if (/^[0-9]$/.test(normalized)) return `Digit${normalized}`;
  return normalized;
}

export function resolveActivation(
  event: TrainerInputEvent,
  moves: MoveDefinition[],
  bindings: KeyBinding[]
): MoveActivation | null {
  if (event.type !== 'keydown' && event.type !== 'mousedown' && event.type !== 'gamepadbuttondown') return null;
  const moveId = buildBindingMap(bindings).get(normalizeInputCode(event.code));
  if (!moveId) return null;
  const move = buildMoveMap(moves).get(moveId);
  return move && !move.displayOnly ? { move, input: event } : null;
}

export function normalizeDomKeyboardEvent(event: KeyboardEvent, type: 'keydown' | 'keyup'): TrainerInputEvent {
  return {
    type,
    code: event.code,
    time: performance.now()
  };
}

export function normalizeDomMouseEvent(event: MouseEvent, type: 'mousedown' | 'mouseup'): TrainerInputEvent {
  return {
    type,
    code: mouseButtonToCode(event.button),
    time: performance.now()
  };
}

export function mouseButtonToCode(button: number): string {
  if (button === 0) return 'MouseLeft';
  if (button === 1) return 'MouseMiddle';
  if (button === 2) return 'MouseRight';
  return `Mouse${button}`;
}

export function mouseButtonDisplayNumber(code: string): number | null {
  const normalized = normalizeInputCode(code).replace(/Hold$/, '');
  const button = /^Mouse(\d+)$/.exec(normalized)?.[1];
  if (button === undefined) return null;
  const number = Number(button) + 1;
  return Number.isFinite(number) ? number : null;
}
