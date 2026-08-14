import { FINISHER_ICON_BINDING_MOVE_ID } from '../combo-core';
import type { ComboImageStyle, KeyBinding } from '../combo-core';
import { mouseButtonDisplayNumber, normalizeInputCode } from '../combo-core/input';
import youSheKeyFont from './assets/youshe-biaotihei-keys.ttf?inline';

export type GamepadIconSet = 'xbox' | 'playstation';
export type KeyboardIconMode = 'default' | 'actual';
export type KeyboardMouseIconTone = 'default' | 'accent';

const GAMEPAD_INPUT_ALIASES: Record<string, string> = {
  A: 'GamepadA', B: 'GamepadB', X: 'GamepadX', Y: 'GamepadY',
  LB: 'GamepadLB', RB: 'GamepadRB', LT: 'GamepadLT', RT: 'GamepadRT',
  L1: 'GamepadLB', R1: 'GamepadRB', L2: 'GamepadLT', R2: 'GamepadRT',
  CROSS: 'GamepadA', CIRCLE: 'GamepadB', SQUARE: 'GamepadX', TRIANGLE: 'GamepadY',
  MENU: 'GamepadMenu', OPTIONS: 'GamepadMenu', VIEW: 'GamepadView', CREATE: 'GamepadView'
};

export function normalizeGamepadBindingInput(value: string): string {
  const parts = String(value || '').split('+').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return '';
  return parts.map((part) => {
    const hold = /(?:\s*hold|长按)$/iu.test(part);
    const core = part.replace(/(?:\s*hold|长按)$/iu, '').trim();
    const mapped = GAMEPAD_INPUT_ALIASES[core.toUpperCase()] ?? normalizeInputCode(core);
    const normalized = mapped.startsWith('Gamepad') ? mapped : `Gamepad${core.toUpperCase()}`;
    return hold && !normalized.endsWith('Hold') ? `${normalized}Hold` : normalized;
  }).join('+');
}

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
  finisher: FINISHER_ICON_BINDING_MOVE_ID,
  i: 'switch_1',
  ii: 'switch_2',
  iii: 'switch_3',
  iv: 'switch_4'
};

const MOVE_ICON_MAPPING_IDS = Object.fromEntries(
  Object.entries(ICON_MAPPING_MOVE_IDS).map(([mappingId, moveId]) => [moveId, mappingId])
) as Record<string, string>;

const ORIGINAL_KEYBOARD_MOUSE_ICON_CODES: Record<string, string[]> = {
  'mouse-left': ['MouseLeft'],
  'mouse-left-hold': ['MouseLeftHold'],
  skill: ['KeyE'],
  'skill-hold': ['KeyEHold'],
  echo: ['KeyQ'],
  'echo-hold': ['KeyQHold'],
  tool: ['KeyT'],
  liberation: ['KeyR'],
  'liberation-hold': ['KeyRHold'],
  'mouse-right': ['MouseRight'],
  'mouse-right-hold': ['MouseRightHold'],
  jump: ['Space'],
  'jump-hold': ['SpaceHold'],
  i: ['Digit1'],
  ii: ['Digit2'],
  iii: ['Digit3'],
  iv: ['Digit4']
};

const DEFAULT_KEYBOARD_MOUSE_MOVE_ICONS: Record<string, string> = {
  basic_attack: '/combo-assets/button-icons/mouse-left.png',
  heavy_attack: '/combo-assets/button-icons/mouse-left-hold.png',
  skill: '/combo-assets/button-icons/skill.png',
  skill_hold: '/combo-assets/button-icons/skill-hold.png',
  echo: '/combo-assets/button-icons/echo.png',
  echo_hold: '/combo-assets/button-icons/echo-hold.png',
  tool: '/combo-assets/button-icons/tool.png',
  liberation: '/combo-assets/button-icons/liberation.png',
  liberation_hold: '/combo-assets/button-icons/liberation-hold.png',
  dodge: '/combo-assets/button-icons/mouse-right.png',
  dodge_hold: '/combo-assets/button-icons/mouse-right-hold.png',
  jump: '/combo-assets/button-icons/jump.png',
  jump_hold: '/combo-assets/button-icons/jump-hold.png',
  switch_1: '/combo-assets/button-icons/i.png',
  switch_2: '/combo-assets/button-icons/ii.png',
  switch_3: '/combo-assets/button-icons/iii.png'
};

export function iconMappingIdForMove(moveId: string): string | undefined {
  return MOVE_ICON_MAPPING_IDS[moveId];
}

export function keyboardMouseIconToneForMove(moveId: string): KeyboardMouseIconTone {
  return moveId === 'finisher' || moveId.startsWith('switch_') ? 'accent' : 'default';
}

export function inputIconCustomizationKey(mode: 'keyboard' | 'gamepad', code: string): string | undefined {
  const normalized = normalizeInputCode(code);
  return normalized ? `input:${mode}:${normalized}` : undefined;
}

export function iconMappingCustomizationKey(mappingId: string): string | undefined {
  const normalized = mappingId.trim();
  return normalized ? `mapping:${normalized}` : undefined;
}

export function usesOriginalKeyboardMouseIcon(moveId: string, code: string): boolean {
  const mappingId = iconMappingIdForMove(moveId);
  if (!mappingId) return false;
  const normalizedCode = normalizeInputCode(code);
  return ORIGINAL_KEYBOARD_MOUSE_ICON_CODES[mappingId]?.some((candidate) => normalizeInputCode(candidate) === normalizedCode) ?? false;
}

export function defaultKeyboardMouseIconSource(moveId: string, code: string): string | undefined {
  if (!usesOriginalKeyboardMouseIcon(moveId, code)) return undefined;
  if (moveId === 'switch_4') return keyboardMouseIconSource(code, 'accent') ?? '/combo-assets/button-icons/iii.png';
  return DEFAULT_KEYBOARD_MOUSE_MOVE_ICONS[moveId];
}

const KEYBOARD_LABELS: Record<string, string> = {
  Escape: 'Esc',
  Tab: 'Tab',
  CapsLock: 'Caps',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  MetaLeft: 'Win',
  MetaRight: 'Win',
  Space: 'Space',
  Enter: 'Enter',
  NumpadEnter: 'Num Enter',
  Backspace: 'Back',
  Delete: 'Del',
  Insert: 'Ins',
  Home: 'Home',
  End: 'End',
  PageUp: 'Pg Up',
  PageDown: 'Pg Dn',
  ArrowUp: '↑',
  ArrowRight: '→',
  ArrowDown: '↓',
  ArrowLeft: '←',
  PrintScreen: 'Prt Sc',
  ScrollLock: 'Scr Lk',
  Pause: 'Pause',
  NumLock: 'Num Lk',
  ContextMenu: 'Menu',
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
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num -',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
  NumpadDecimal: 'Num .'
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
  return core.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^Intl\s*/, '').slice(0, 12) || '?';
}

function mouseCodeLabel(core: string): string {
  if (core === 'MouseLeft') return 'Left Mouse Button';
  if (core === 'MouseRight') return 'Right Mouse Button';
  if (core === 'MouseMiddle') return 'Middle Mouse Button';
  const button = mouseButtonDisplayNumber(core);
  return button !== null ? `Mouse Button ${button}` : core.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function keyPlateGlyph(hold: boolean, width = 128, tone: KeyboardMouseIconTone = 'default'): string {
  const fill = hold ? '#a5f7f2' : tone === 'accent' ? '#ffd43b' : '#f8f9f7';
  const outerCurveStart = width - 17;
  const outerRight = width - 5;
  const innerCurveStart = width - 21;
  const innerRight = width - 14;
  return `<path d="M32 5H${outerCurveStart}Q${outerRight} 5 ${outerRight} 17V111Q${outerRight} 123 ${outerCurveStart} 123H17Q5 123 5 111V37L32 5Z" fill="#050708"/><path d="M38 14H${innerCurveStart}Q${innerRight} 14 ${innerRight} 21V107Q${innerRight} 114 ${innerCurveStart} 114H21Q14 114 14 107V42L38 14Z" fill="${fill}"/>`;
}

function holdArrowGlyph(width = 128): string {
  const center = width / 2;
  return `<path d="M${center - 22} 1H${center + 22}L${center} 28Z" fill="#050708"/><path d="M${center - 15} 6H${center + 15}L${center} 21Z" fill="#ff6400"/>`;
}

function specialKeyboardGlyph(core: string): string | null {
  if (core === 'ShiftLeft' || core === 'ShiftRight') return '<path d="M64 31L91 59H76V91H52V59H37Z" fill="#050708"/>';
  if (core === 'CapsLock') return '<path d="M64 27L90 54H76V75H52V54H38ZM49 84H79V94H49Z" fill="#050708"/>';
  if (core === 'Space') return '<path d="M34 73V89H94V73" fill="none" stroke="#050708" stroke-width="10" stroke-linecap="square" stroke-linejoin="round"/>';
  if (core === 'Enter' || core === 'NumpadEnter') return '<path d="M91 37V65H50L62 53L50 41M50 65L62 77L50 89" fill="none" stroke="#050708" stroke-width="9" stroke-linecap="square" stroke-linejoin="miter"/>';
  if (core === 'Backspace') return '<path d="M91 43H55L36 64L55 85H91ZM61 54L82 75M82 54L61 75" fill="none" stroke="#050708" stroke-width="8" stroke-linejoin="round"/>';
  if (core === 'Delete') return '<path d="M43 45H85V91H43ZM37 39H91M54 31H74M55 54V82M73 54V82" fill="none" stroke="#050708" stroke-width="7" stroke-linecap="square" stroke-linejoin="round"/>';
  if (core === 'Tab') return '<path d="M34 45H82L69 32M82 45L69 58M94 34V58M94 70H46L59 57M46 70L59 83M34 59V83" fill="none" stroke="#050708" stroke-width="7" stroke-linecap="square" stroke-linejoin="miter"/>';
  if (core === 'MetaLeft' || core === 'MetaRight') return '<path d="M38 39H61V62H38ZM67 39H90V62H67ZM38 68H61V91H38ZM67 68H90V91H67Z" fill="#050708"/>';
  const arrows: Record<string, string> = {
    ArrowUp: 'M64 32L92 62H76V94H52V62H36Z',
    ArrowRight: 'M96 64L66 92V76H34V52H66V36Z',
    ArrowDown: 'M64 96L36 66H52V34H76V66H92Z',
    ArrowLeft: 'M32 64L62 36V52H94V76H62V92Z'
  };
  return arrows[core] ? `<path d="${arrows[core]}" fill="#050708"/>` : null;
}

function keyboardCoreUsesWidePlate(core: string): boolean {
  return !core.startsWith('Mouse') && !specialKeyboardGlyph(core) && keyboardCodeLabel(core).length > 1;
}

function wideKeyboardFontSize(label: string): number {
  const visualUnits = Array.from(label).reduce((sum, character) => {
    if (/\s/.test(character)) return sum + 0.32;
    if (/[^A-Za-z0-9]/.test(character)) return sum + 0.5;
    return sum + 0.68;
  }, 0);
  return Math.max(36, Math.min(76, Math.floor(190 / Math.max(1, visualUnits))));
}

function keycapGlyph(core: string, width = 128): string {
  const special = specialKeyboardGlyph(core);
  if (special) return special;
  const label = keyboardCodeLabel(core);
  const safeLabel = escapeSvgText(label);
  const wide = width > 128;
  const fontSize = label.length <= 1 ? 100 : wide ? wideKeyboardFontSize(label) : label.length <= 3 ? 66 : label.length <= 5 ? 48 : 34;
  const textY = label.length <= 1 ? 104 : wide ? 100 : label.length <= 3 ? 97 : label.length <= 5 ? 93 : 90;
  return `<text x="${width / 2}" y="${textY}" text-anchor="middle" font-family="YouSheBiaoTiHeiKeys" font-size="${fontSize}" fill="#050708">${safeLabel}</text>`;
}

function mouseGlyph(core: string): string {
  const sideButton = mouseButtonDisplayNumber(core);
  const leftActive = core === 'MouseLeft';
  const rightActive = core === 'MouseRight';
  const middleActive = core === 'MouseMiddle';
  const sideActive = sideButton !== null;
  const sideLabel = sideActive ? `M${sideButton}` : '';
  return `<path d="M43 88V56Q43 35 64 35Q85 35 85 56V88Z" fill="#fff" stroke="#050708" stroke-width="6"/><path d="M46 57Q46 40 61 39V62H46Z" fill="${leftActive ? '#ff4a21' : '#fff'}"/><path d="M67 39Q82 40 82 57V62H67Z" fill="${rightActive ? '#ff4a21' : '#fff'}"/><path d="M64 36V64M44 64H84" stroke="#050708" stroke-width="5"/><rect x="59" y="43" width="10" height="17" rx="5" fill="${middleActive ? '#ff4a21' : '#fff'}" stroke="#050708" stroke-width="4"/>${sideActive ? `<rect x="36" y="64" width="13" height="19" rx="4" fill="#ff4a21" stroke="#050708" stroke-width="4"/><text x="64" y="105" text-anchor="middle" font-family="YouSheBiaoTiHeiKeys" font-size="19" fill="#050708">${sideLabel}</text>` : ''}`;
}

function keyboardMouseGlyph(core: string, hold: boolean, width = 128, tone: KeyboardMouseIconTone = 'default'): string {
  return `${keyPlateGlyph(hold, width, tone)}${core.startsWith('Mouse') ? mouseGlyph(core) : keycapGlyph(core, width)}${hold ? holdArrowGlyph(width) : ''}`;
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

export function keyboardMouseIconSource(code: string, tone: KeyboardMouseIconTone = 'default'): string | undefined {
  const parsed = parseKeyboardMouseCode(code);
  if (!parsed?.parts.length) return undefined;
  const parts = parsed.parts.slice(0, 2).map((part) => ({ ...part, width: keyboardCoreUsesWidePlate(part.core) ? 256 : 128 }));
  const isCombo = parts.length > 1;
  const scale = isCombo ? 0.7 : 1;
  const plusSpace = isCombo ? 30 : 0;
  const width = Math.round(parts.reduce((sum, part) => sum + part.width * scale, 0) + Math.max(0, parts.length - 1) * plusSpace);
  let cursor = 0;
  const glyphs: string[] = [];
  const pluses: string[] = [];
  parts.forEach((part, index) => {
    glyphs.push(isCombo
      ? `<g transform="translate(${cursor} 19) scale(${scale})">${keyboardMouseGlyph(part.core, part.hold, part.width, tone)}</g>`
      : keyboardMouseGlyph(part.core, part.hold, part.width, tone));
    cursor += part.width * scale;
    if (index < parts.length - 1) {
      const center = cursor + plusSpace / 2;
      pluses.push(`<path d="M${center} 49V79M${center - 15} 64H${center + 15}" stroke="#fff" stroke-width="9" stroke-linecap="round"/><path d="M${center} 49V79M${center - 15} 64H${center + 15}" stroke="#171b1e" stroke-width="3" stroke-linecap="round"/>`);
      cursor += plusSpace;
    }
  });
  const fontFace = `<style>@font-face{font-family:YouSheBiaoTiHeiKeys;src:url('${youSheKeyFont}') format('truetype')}</style>`;
  return svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 128">${fontFace}${glyphs.join('')}${pluses.join('')}</svg>`);
}

export function keyboardMouseIconWidthScale(code: string): number {
  const parsed = parseKeyboardMouseCode(code);
  if (!parsed?.parts.length) return 1;
  const parts = parsed.parts.slice(0, 2);
  const scale = parts.length > 1 ? 0.7 : 1;
  const width = parts.reduce((sum, part) => sum + (keyboardCoreUsesWidePlate(part.core) ? 256 : 128) * scale, 0) + Math.max(0, parts.length - 1) * 30;
  return Math.min(2, Math.max(1, width / 128));
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

function adaptMappings(mappings: ComboImageStyle['iconMappings'], bindings: KeyBinding[], iconSet: GamepadIconSet, customSources: Record<string, string>): ComboImageStyle['iconMappings'] {
  return mappings.map((mapping) => {
    const mappingCustomKey = iconMappingCustomizationKey(mapping.id);
    const mappingCustomSource = mappingCustomKey ? customSources[mappingCustomKey] : undefined;
    if (mappingCustomSource) return { ...mapping, src: mappingCustomSource };
    const moveId = ICON_MAPPING_MOVE_IDS[mapping.id];
    const code = moveId
      ? bindings.find((binding) => binding.moveId === moveId)?.inputs.find((input) => input.code.trim())?.code
      : undefined;
    const customSourceKey = code ? inputIconCustomizationKey('gamepad', code) : undefined;
    const customSource = customSourceKey ? customSources[customSourceKey] : undefined;
    if (customSource) return { ...mapping, src: customSource };
    const src = code ? gamepadIconSource(code, iconSet) : undefined;
    return src ? { ...mapping, src } : mapping;
  });
}

function adaptKeyboardMouseMappings(mappings: ComboImageStyle['iconMappings'], bindings: KeyBinding[], customSources: Record<string, string>): ComboImageStyle['iconMappings'] {
  return mappings.map((mapping) => {
    const mappingCustomKey = iconMappingCustomizationKey(mapping.id);
    const mappingCustomSource = mappingCustomKey ? customSources[mappingCustomKey] : undefined;
    if (mappingCustomSource) return { ...mapping, src: mappingCustomSource };
    const moveId = ICON_MAPPING_MOVE_IDS[mapping.id];
    const code = moveId
      ? bindings.find((binding) => binding.moveId === moveId)?.inputs.find((input) => input.code.trim())?.code
      : undefined;
    const customSourceKey = code ? inputIconCustomizationKey('keyboard', code) : undefined;
    const customSource = customSourceKey ? customSources[customSourceKey] : undefined;
    if (customSource && code) return { ...mapping, src: customSource, iconWidthScale: keyboardMouseIconWidthScale(code) };
    const defaultSource = moveId && code ? defaultKeyboardMouseIconSource(moveId, code) : undefined;
    if (defaultSource) return { ...mapping, src: defaultSource, iconWidthScale: 1 };
    const src = code ? keyboardMouseIconSource(code, keyboardMouseIconToneForMove(moveId ?? '')) : undefined;
    return src && code ? { ...mapping, src, iconScale: Math.min(3, Math.max(0.35, mapping.iconScale ?? 1)), iconWidthScale: keyboardMouseIconWidthScale(code) } : mapping;
  });
}

export function withGamepadIconMappings(style: ComboImageStyle, bindings: KeyBinding[], iconSet: GamepadIconSet, customSources: Record<string, string> = {}): ComboImageStyle {
  const roleStyles = { ...style.roleStyles };
  ([1, 2, 3, 4] as const).forEach((slot) => {
    const role = style.roleStyles[slot];
    roleStyles[slot] = role.iconMappings?.length ? { ...role, iconMappings: adaptMappings(role.iconMappings, bindings, iconSet, customSources) } : role;
  });
  return { ...style, iconMappings: adaptMappings(style.iconMappings, bindings, iconSet, customSources), roleStyles };
}

export function withKeyboardMouseIconMappings(style: ComboImageStyle, bindings: KeyBinding[], customSources: Record<string, string> = {}): ComboImageStyle {
  const roleStyles = { ...style.roleStyles };
  ([1, 2, 3, 4] as const).forEach((slot) => {
    const role = style.roleStyles[slot];
    roleStyles[slot] = role.iconMappings?.length ? { ...role, iconMappings: adaptKeyboardMouseMappings(role.iconMappings, bindings, customSources) } : role;
  });
  return { ...style, iconMappings: adaptKeyboardMouseMappings(style.iconMappings, bindings, customSources), roleStyles };
}
