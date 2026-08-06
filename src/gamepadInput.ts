export const GAMEPAD_BUTTON_CODES = [
  'GamepadA',
  'GamepadB',
  'GamepadX',
  'GamepadY',
  'GamepadLB',
  'GamepadRB',
  'GamepadLT',
  'GamepadRT',
  'GamepadView',
  'GamepadMenu',
  'GamepadLeftStick',
  'GamepadRightStick',
  'GamepadDPadUp',
  'GamepadDPadDown',
  'GamepadDPadLeft',
  'GamepadDPadRight'
] as const;

export const GAMEPAD_COMBO_MODIFIER = 'GamepadLB';

export function gamepadButtonCode(index: number): string {
  return GAMEPAD_BUTTON_CODES[index] ?? `GamepadButton${index}`;
}

export function readPressedGamepadCodes(): Set<string> {
  const current = new Set<string>();
  const pads = navigator.getGamepads?.() ?? [];
  for (const pad of pads) {
    if (!pad) continue;
    pad.buttons.forEach((button, index) => {
      if (button.pressed) current.add(gamepadButtonCode(index));
    });
  }
  return current;
}
