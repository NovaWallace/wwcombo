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
  const aliases: Record<string, string> = {
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
  if (/^[a-z]$/i.test(normalized)) return `Key${normalized.toUpperCase()}`;
  if (/^[0-9]$/.test(normalized)) return `Digit${normalized}`;
  return normalized;
}

export function resolveActivation(
  event: TrainerInputEvent,
  moves: MoveDefinition[],
  bindings: KeyBinding[]
): MoveActivation | null {
  if (event.type !== 'keydown' && event.type !== 'mousedown') return null;
  const moveId = buildBindingMap(bindings).get(normalizeInputCode(event.code));
  if (!moveId) return null;
  const move = buildMoveMap(moves).get(moveId);
  return move ? { move, input: event } : null;
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
