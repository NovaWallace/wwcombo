import type { ComboImageStyle, KeyBinding } from '../combo-core';
import { normalizeInputCode } from '../combo-core/input';

export type GamepadIconSet = 'xbox' | 'playstation';

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
    ? parsed.parts.slice(0, 2).map((part, index) => `<g transform="translate(${index * 90 + 3} 19) scale(.7)">${singleGlyph(part.core, iconSet)}${part.hold ? '<circle cx="64" cy="64" r="57" fill="none" stroke="#ffd43b" stroke-width="6" stroke-dasharray="62 18"/>' : ''}</g>`).join('')
    : `${singleGlyph(parsed.parts[0].core, iconSet)}${parsed.parts[0].hold ? '<circle cx="64" cy="64" r="57" fill="none" stroke="#ffd43b" stroke-width="6" stroke-dasharray="62 18"/>' : ''}`;
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

export function withGamepadIconMappings(style: ComboImageStyle, bindings: KeyBinding[], iconSet: GamepadIconSet): ComboImageStyle {
  const roleStyles = { ...style.roleStyles };
  ([1, 2, 3] as const).forEach((slot) => {
    const role = style.roleStyles[slot];
    roleStyles[slot] = role.iconMappings?.length ? { ...role, iconMappings: adaptMappings(role.iconMappings, bindings, iconSet) } : role;
  });
  return { ...style, iconMappings: adaptMappings(style.iconMappings, bindings, iconSet), roleStyles };
}
