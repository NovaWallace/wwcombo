# Rhythm Main Scale Worklog

## 2026-07-15

- Added an overall rhythm main-image scale setting (`scale`) to rhythm UI settings.
- Kept the feedback window independent: feedback bounds and rendering are not multiplied by the main scale.
- Split rhythm main bounds semantics:
  - saved rhythm overlay bounds stay in base/unscaled coordinates;
  - Tauri overlay window receives display bounds (`base width/height * scale`).
- Converted live overlay window bounds back to base bounds when saving or when overlay bounds-change events arrive.
- Fixed both move-mode exit paths so they send scaled display bounds back to the overlay window.
- Updated rhythm preview and overlay rendering with scale frames so the main stage scales visually without changing feedback.
- Validation passed:
  - `npm.cmd run build`
  - `cargo check` in `src-tauri`

## Manual Test Still Useful

- Open rhythm settings and change `main scale x100`.
- Confirm the main rhythm overlay and preview scale together.
- Confirm the feedback window keeps its own size and position.
- Enter and exit move mode by both the button and blank-area click; confirm the main overlay does not drift or double-scale.
