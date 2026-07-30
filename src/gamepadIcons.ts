import type { ComboImageStyle, KeyBinding } from '../combo-core';
import { normalizeInputCode } from '../combo-core/input';

export type GamepadIconSet = 'xbox' | 'playstation';
export type KeyboardIconMode = 'default' | 'actual';

const ICON_MAPPING_MOVE_IDS: Record<string, string> = {
  'mouse-left': 'basic_attack',
  'mouse-left-hold': 'heavy_attack',
  skill: 'skill',
  'skill-hold': 'skill_hold',
  echo: 'echo',
  'echo-hold': 'echo_hold',
  liberation: 'liberation',
  'liberation-hold': 'liberation_hold',
  'mouse-right': 'dodge',
  'mouse-right-hold': 'dodge_hold',
  jump: 'jump',
  'jump-hold': 'jump_hold',
  tool: 'tool',
  i: 'switch_1',
  ii: 'switch_2',
  iii: 'switch_3'
};

const KEYBOARD_LABELS: Record<string, string> = {
  Escape: 'ESC',
  Tab: 'TAB',
  CapsLock: 'CAPS',
  ShiftLeft: 'L SHIFT',
  ShiftRight: 'R SHIFT',
  ControlLeft: 'L CTRL',
  ControlRight: 'R CTRL',
  AltLeft: 'L ALT',
  AltRight: 'R ALT',
  MetaLeft: 'L WIN',
  MetaRight: 'R WIN',
  Space: 'SPACE',
  Enter: 'ENTER',
  NumpadEnter: 'NUM ENT',
  Backspace: 'BACK',
  Delete: 'DEL',
  Insert: 'INS',
  Home: 'HOME',
  End: 'END',
  PageUp: 'PG UP',
  PageDown: 'PG DN',
  ArrowUp: '↑',
  ArrowRight: '→',
  ArrowDown: '↓',
  ArrowLeft: '←',
  PrintScreen: 'PRT SC',
  ScrollLock: 'SCR LK',
  Pause: 'PAUSE',
  NumLock: 'NUM LK',
  ContextMenu: 'MENU',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  NumpadAdd: 'NUM +',
  NumpadSubtract: 'NUM -',
  NumpadMultiply: 'NUM *',
  NumpadDivide: 'NUM /',
  NumpadDecimal: 'NUM .'
};

const PLAYSTATION_LABELS: Record<string, string> = {
  A: 'Cross',
  B: 'Circle',
  X: 'Square',
  Y: 'Triangle',
  LB: 'L1',
  RB: 'R1',
  LT: 'L2',
  RT: 'R2',
  View: 'Create',
  Menu: 'Options',
  LeftStick: 'L3',
  RightStick: 'R3'
};

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeSvgText(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char] ?? char));
}

function keyboardCodeLabel(core: string): string {
  if (KEYBOARD_LABELS[core]) return KEYBOARD_LABELS[core];
  if (/^Key[A-Z]$/.test(core)) return core.slice(3);
  if (/^Digit\d$/.test(core)) return core.slice(5);
  if (/^Numpad\d$/.test(core)) return `NUM ${core.slice(6)}`;
  if (/^F(?:[1-9]|1\d|2[0-4])$/.test(core)) return core;
  return core.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^Intl\s*/, '').toUpperCase().slice(0, 10) || '?';
}

function mouseCodeLabel(core: string): string {
  if (core === 'MouseLeft') return 'Left Mouse Button';
  if (core === 'MouseRight') return 'Right Mouse Button';
  if (core === 'MouseMiddle') return 'Middle Mouse Button';
  const button = /^Mouse(\d+)$/.exec(core)?.[1];
  return button ? `Mouse Button ${Number(button) + 1}` : core.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function keycapGlyph(core: string): string {
  const label = keyboardCodeLabel(core);
  const safeLabel = escapeSvgText(label);
  const fontSize = label.length <= 1 ? 54 : label.length <= 4 ? 34 : label.length <= 6 ? 26 : 20;
  const textY = label === '↑' || label === '→' || label === '↓' || label === '←' ? 79 : 77;
  return `<path d="M31 8H111Q121 8 121 18V110Q121 120 111 120H17Q7 120 7 110V32L31 8Z" fill="#111416"/><path d="M35 20H107Q110 20 110 24V105Q110 108 106 108H22Q19 108 19 104V37L35 20Z" fill="#f7f8f5"/><path d="M23 98H106V108H22Q19 108 19 104V93Z" fill="#e22e32"/><text x="64" y="${textY}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="${fontSize}" font-weight="900" fill="#111416">${safeLabel}</text>`;
}

function mouseGlyph(core: string): string {
  const sideButton = /^Mouse(\d+)$/.exec(core)?.[1];
  const leftActive = core === 'MouseLeft';
  const rightActive = core === 'MouseRight';
  const middleActive = core === 'MouseMiddle';
  const sideActive = sideButton !== undefined;
  const sideLabel = sideActive ? `M${Number(sideButton) + 1}` : '';
  return `<path d="M31 8H111Q121 8 121 18V110Q121 120 111 120H17Q7 120 7 110V32L31 8Z" fill="#111416"/><path d="M35 20H107Q110 20 110 24V105Q110 108 106 108H22Q19 108 19 104V37L35 20Z" fill="#f7f8f5"/><path d="M43 85V56Q43 35 64 35Q85 35 85 56V85Z" fill="#fff" stroke="#111416" stroke-width="6"/><path d="M46 57Q46 40 61 39V62H46Z" fill="${leftActive ? '#e22e32' : '#fff'}"/><path d="M67 39Q82 40 82 57V62H67Z" fill="${rightActive ? '#e22e32' : '#fff'}"/><path d="M64 36V64M44 64H84" stroke="#111416" stroke-width="5"/><rect x="59" y="43" width="10" height="17" rx="5" fill="${middleActive ? '#e22e32' : '#fff'}" stroke="#111416" stroke-width="4"/>${sideActive ? `<rect x="36" y="64" width="13" height="19" rx="4" fill="#e22e32" stroke="#111416" stroke-width="4"/><text x="64" y="103" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="16" font-weight="900" fill="#111416">${sideLabel}</text>` : ''}`;
}

function keyboardMouseGlyph(core: string): string {
  return core.startsWith('Mouse') ? mouseGlyph(core) : keycapGlyph(core);
}

function holdMarkerGlyph(): string {
  const corners = 'M8 39V8H39M89 8H120V39M120 89V120H89M39 120H8V89';
  return `<path d="${corners}" fill="none" stroke="#111416" stroke-width="15" stroke-linecap="square" stroke-linejoin="round"/><path d="${corners}" fill="none" stroke="#ffd43b" stroke-width="9" stroke-linecap="square" stroke-linejoin="round"/><rect x="37" y="96" width="54" height="28" rx="5" fill="#ffd43b" stroke="#111416" stroke-width="4"/><text x="64" y="116" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="15" font-weight="900" fill="#111416">HOLD</text>`;
}

function parseKeyboardMouseCode(code: string): { parts: Array<{ core: string; hold: boolean }>; normalized: string } | null {
  const normalized = normalizeInputCode(code);
  const parts = normalized.split('+').map((part) => {
    if (!part || part.startsWith('Gamepad')) return null;
    const hold = part.endsWith('Hold');
    return { core: hold ? part.slice(0, -4) : part, hold };
  });
  return parts.length && parts.every(Boolean) ? { parts: parts as Array<{ core: string; hold: boolean }>, normalized } : null;
}

export function keyboardMouseIconSource(code: string): string | undefined {
  const parsed = parseKeyboardMouseCode(code);
  if (!parsed?.parts.length) return undefined;
  const isCombo = parsed.parts.length > 1;
  const width = isCombo ? 210 : 128;
  const glyphs = isCombo
    ? parsed.parts.slice(0, 2).map((part, index) => `<g transform="translate(${index * 90 + 3} 19) scale(.7)">${keyboardMouseGlyph(part.core)}${part.hold ? holdMarkerGlyph() : ''}</g>`).join('')
    : `${keyboardMouseGlyph(parsed.parts[0].core)}${parsed.parts[0].hold ? holdMarkerGlyph() : ''}`;
  const plus = isCombo ? '<path d="M105 49V79M90 64H120" stroke="#fff" stroke-width="9" stroke-linecap="round"/><path d="M105 49V79M90 64H120" stroke="#171b1e" stroke-width="3" stroke-linecap="round"/>' : '';
  return svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 128">${glyphs}${plus}</svg>`);
}

export function keyboardMouseCodeLabel(code: string): string {
  const parsed = parseKeyboardMouseCode(code);
  if (!parsed?.parts.length) return code;
  return parsed.parts.map(({ core, hold }) => `${core.startsWith('Mouse') ? mouseCodeLabel(core) : keyboardCodeLabel(core)}${hold ? ' Hold' : ''}`).join(' + ');
}

function faceGlyph(core: string, iconSet: GamepadIconSet): string | null {
  const xboxColors: Record<string, string> = { A: '#67b843', B: '#df4b43', X: '#36a9db', Y: '#f2c443' };
  if (!(core in xboxColors)) return null;
  if (iconSet === 'xbox') {
    return `<circle cx="64" cy="64" r="45" fill="${xboxColors[core]}" stroke="#fff" stroke-width="7"/><circle cx="64" cy="64" r="51" fill="none" stroke="#15191c" stroke-width="4"/><text x="64" y="78" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="42" font-weight="900" fill="#171b1e">${core}</text>`;
  }
  const symbolColor: Record<string, string> = { A: '#5ba9e6', B: '#e35d6a', X: '#dd75c4', Y: '#62c99b' };
  const symbol = core === 'A'
    ? '<path d="M45 45L83 83M83 45L45 83"/>'
    : core === 'B'
      ? '<circle cx="64" cy="64" r="22"/>'
      : core === 'X'
        ? '<rect x="43" y="43" width="42" height="42" rx="2"/>'
        : '<path d="M64 39L88 82H40Z"/>';
  return `<circle cx="64" cy="64" r="50" fill="#252a2e" stroke="#fff" stroke-width="7"/><g fill="none" stroke="${symbolColor[core]}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">${symbol}</g>`;
}

function shoulderGlyph(core: string, iconSet: GamepadIconSet): string | null {
  const labels: Record<string, string> = iconSet === 'playstation'
    ? { LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2' }
    : { LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT' };
  const label = labels[core];
  if (!label) return null;
  const trigger = core === 'LT' || core === 'RT';
  const path = trigger ? 'M25 88L31 38Q33 25 47 23H81Q95 25 97 38L103 88Z' : 'M22 38Q22 25 35 25H93Q106 25 106 38V91H22Z';
  return `<path d="${path}" fill="#252a2e" stroke="#fff" stroke-width="7" stroke-linejoin="round"/><text x="64" y="73" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="34" font-weight="900" fill="#fff">${label}</text>`;
}

function dpadGlyph(core: string, iconSet: GamepadIconSet): string | null {
  if (!core.startsWith('DPad')) return null;
  const direction = core.slice(4);
  const rotations: Record<string, number> = { Up: 0, Right: 90, Down: 180, Left: 270 };
  if (!(direction in rotations)) return null;
  const accent = iconSet === 'playstation' ? '#5ba9e6' : '#df4b43';
  return `<path d="M49 17H79V47H109V81H79V111H49V81H19V47H49Z" fill="#252a2e" stroke="#fff" stroke-width="7" stroke-linejoin="round"/><g transform="rotate(${rotations[direction]} 64 64)"><path d="M50 48L64 29L78 48Z" fill="${accent}"/><rect x="51" y="46" width="26" height="20" rx="3" fill="${accent}"/></g>`;
}

function centerGlyph(core: string, iconSet: GamepadIconSet): string | null {
  if (core === 'LeftStick' || core === 'RightStick') {
    const label = iconSet === 'playstation' ? (core === 'LeftStick' ? 'L3' : 'R3') : (core === 'LeftStick' ? 'LS' : 'RS');
    return `<circle cx="64" cy="64" r="46" fill="#252a2e" stroke="#fff" stroke-width="7"/><circle cx="64" cy="58" r="27" fill="#343a3f" stroke="#bfc8ce" stroke-width="4"/><text x="64" y="72" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="27" font-weight="900" fill="#fff">${label}</text>`;
  }
  if (core === 'Menu') {
    const label = iconSet === 'playstation' ? 'OPT' : '';
    return label
      ? `<rect x="17" y="31" width="94" height="66" rx="15" fill="#252a2e" stroke="#fff" stroke-width="7"/><text x="64" y="75" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="25" font-weight="900" fill="#fff">${label}</text>`
      : `<circle cx="64" cy="64" r="47" fill="#252a2e" stroke="#fff" stroke-width="7"/><path d="M40 48H88M40 64H88M40 80H88" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`;
  }
  if (core === 'View') {
    if (iconSet === 'playstation') return `<rect x="17" y="31" width="94" height="66" rx="15" fill="#252a2e" stroke="#fff" stroke-width="7"/><text x="64" y="75" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="23" font-weight="900" fill="#fff">CREATE</text>`;
    return `<circle cx="64" cy="64" r="47" fill="#252a2e" stroke="#fff" stroke-width="7"/><rect x="35" y="42" width="37" height="31" rx="4" fill="none" stroke="#fff" stroke-width="6"/><rect x="55" y="56" width="37" height="31" rx="4" fill="#252a2e" stroke="#fff" stroke-width="6"/>`;
  }
  return null;
}

function unknownGlyph(core: string): string {
  const safe = core.replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || '?';
  return `<rect x="14" y="27" width="100" height="74" rx="22" fill="#252a2e" stroke="#fff" stroke-width="7"/><text x="64" y="75" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="24" font-weight="900" fill="#fff">${safe}</text>`;
}

function singleGlyph(core: string, iconSet: GamepadIconSet): string {
  return faceGlyph(core, iconSet) ?? shoulderGlyph(core, iconSet) ?? dpadGlyph(core, iconSet) ?? centerGlyph(core, iconSet) ?? unknownGlyph(core);
}

function parseGamepadCode(code: string): { parts: Array<{ core: string; hold: boolean }>; normalized: string } | null {
  const normalized = normalizeInputCode(code);
  const parts = normalized.split('+').map((part) => {
    if (!part.startsWith('Gamepad')) return null;
    const body = part.slice('Gamepad'.length);
    const hold = body.endsWith('Hold');
    return { core: hold ? body.slice(0, -4) : body, hold };
  });
  return parts.every(Boolean) ? { parts: parts as Array<{ core: string; hold: boolean }>, normalized } : null;
}

export function gamepadIconSource(code: string, iconSet: GamepadIconSet): string | undefined {
  const parsed = parseGamepadCode(code);
  if (!parsed?.parts.length) return undefined;
  const isCombo = parsed.parts.length > 1;
  const width = isCombo ? 210 : 128;
  const glyphs = isCombo
    ? parsed.parts.slice(0, 2).map((part, index) => `<g transform="translate(${index * 90 + 3} 19) scale(.7)">${singleGlyph(part.core, iconSet)}${part.hold ? holdMarkerGlyph() : ''}</g>`).join('')
    : `${singleGlyph(parsed.parts[0].core, iconSet)}${parsed.parts[0].hold ? holdMarkerGlyph() : ''}`;
  const plus = isCombo ? '<path d="M105 49V79M90 64H120" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M105 49V79M90 64H120" stroke="#171b1e" stroke-width="3" stroke-linecap="round"/>' : '';
  return svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 128">${glyphs}${plus}</svg>`);
}

export function gamepadCodeLabel(code: string, iconSet: GamepadIconSet): string {
  const parsed = parseGamepadCode(code);
  if (!parsed?.parts.length) return code;
  return parsed.parts.map(({ core, hold }) => {
    const base = iconSet === 'playstation' ? PLAYSTATION_LABELS[core] ?? core.replace(/^DPad/, 'D-pad ') : core.replace(/^DPad/, 'D-pad ');
    return hold ? `${base} Hold` : base;
  }).join(' + ');
}

function adaptMappings(mappings: ComboImageStyle['iconMappings'], bindings: KeyBinding[], iconSet: GamepadIconSet): ComboImageStyle['iconMappings'] {
  return mappings.map((mapping) => {
    const moveId = ICON_MAPPING_MOVE_IDS[mapping.id];
    const code = moveId
      ? bindings.find((binding) => binding.moveId === moveId)?.inputs.find((input) => input.code.trim())?.code
      : undefined;
    const src = code ? gamepadIconSource(code, iconSet) : undefined;
    return src ? { ...mapping, src } : mapping;
  });
}

function adaptKeyboardMouseMappings(mappings: ComboImageStyle['iconMappings'], bindings: KeyBinding[]): ComboImageStyle['iconMappings'] {
  return mappings.map((mapping) => {
    const moveId = ICON_MAPPING_MOVE_IDS[mapping.id];
    const code = moveId
      ? bindings.find((binding) => binding.moveId === moveId)?.inputs.find((input) => input.code.trim())?.code
      : undefined;
    const src = code ? keyboardMouseIconSource(code) : undefined;
    return src ? { ...mapping, src, iconScale: Math.min(3, Math.max(0.35, (mapping.iconScale ?? 1) * 1.15)) } : mapping;
  });
}

export function withGamepadIconMappings(style: ComboImageStyle, bindings: KeyBinding[], iconSet: GamepadIconSet): ComboImageStyle {
  const roleStyles = { ...style.roleStyles };
  ([1, 2, 3] as const).forEach((slot) => {
    const role = style.roleStyles[slot];
    roleStyles[slot] = role.iconMappings?.length ? { ...role, iconMappings: adaptMappings(role.iconMappings, bindings, iconSet) } : role;
  });
  return { ...style, iconMappings: adaptMappings(style.iconMappings, bindings, iconSet), roleStyles };
}

export function withKeyboardMouseIconMappings(style: ComboImageStyle, bindings: KeyBinding[]): ComboImageStyle {
  const roleStyles = { ...style.roleStyles };
  ([1, 2, 3] as const).forEach((slot) => {
    const role = style.roleStyles[slot];
    roleStyles[slot] = role.iconMappings?.length ? { ...role, iconMappings: adaptKeyboardMouseMappings(role.iconMappings, bindings) } : role;
  });
  return { ...style, iconMappings: adaptKeyboardMouseMappings(style.iconMappings, bindings), roleStyles };
}

export function withCustomIconSources(style: ComboImageStyle, sources: Record<string, string>): ComboImageStyle {
  if (!Object.keys(sources).length) return style;
  const applySources = (mappings: ComboImageStyle['iconMappings'] | undefined) => mappings?.map((mapping) => sources[mapping.id] ? { ...mapping, src: sources[mapping.id] } : mapping);
  const roleStyles = { ...style.roleStyles };
  ([1, 2, 3] as const).forEach((slot) => {
    const role = style.roleStyles[slot];
    const iconMappings = applySources(role.iconMappings);
    roleStyles[slot] = iconMappings ? { ...role, iconMappings } : role;
  });
  return { ...style, iconMappings: applySources(style.iconMappings) ?? style.iconMappings, roleStyles };
}
