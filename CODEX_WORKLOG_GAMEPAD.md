# CODEX_WORKLOG_GAMEPAD.md

## 2026-07-19

- Added controller input support scaffold for the main trainer input path.
- Added `gamepadbuttondown` / `gamepadbuttonup` input event types and gamepad code normalization, including combo codes such as `GamepadLB+GamepadX`.
- Added default Xbox-style bindings:
  - X basic attack, Y skill, A jump, B challenge start
  - D-pad up/right/down switch 1/2/3
  - RB liberation, RT dodge, LT echo, LB+X tool
- Added a `tool` move so the LB+X tool binding has a real move target.
- Added Settings input mode toggle and a parallel gamepad binding column.
- In gamepad mode, keyboard/mouse move input is ignored while UI clicking still works.
- Fixed lenient/practice mode independent timed blocks: independent-tagged blocks now play by time and can be interrupted/skipped by the next correct non-independent input.
- Added temporary SVG placeholder gamepad icon assets under `public/combo-assets/gamepad-icons/`; these are intentionally not wired over existing combo icon mappings yet, so the user can replace the art without disturbing existing keyboard/mouse chart visuals.

## Verification

- `npm run build` passed.
