# wwcombo 0.63

Release date: 2026-08-06

This release is a Windows x64 portable build. Extract the ZIP completely and
keep the launcher shortcut beside the portable folder. The ZIP contains the
application, FFmpeg, documentation, license, build information, and a SHA-256
file. It does not contain the `scripts` directory.

## Changes

- Key Mapping now supports capturing gamepad buttons directly. After switching
  the input mode to Gamepad, click a key binding in Key Mapping and press a
  button on the controller to update the main gamepad bindings immediately.
  LB-key combinations and holding LB alone are captured the same way as in
  Settings.
- Single-click and long-press bindings are now kept in sync. Changing Dodge,
  Basic Attack, Skill, Echo, Liberation, or Jump also updates the matching
  long-press binding (for example, Dodge also updates Long Press Dodge).
  Long-press rows in Settings are display-only and follow their main binding.
  Existing saved and imported input settings are aligned automatically.
- Fixed the Live2D character option showing "岁岁" instead of "穗穗" (Suisui).
- Added a real-time visitor counter, a license badge, and License / Credits
  sections to the README in all supported languages.
- Added a GitHub Actions workflow that builds the Windows app on version tags
  and publishes the portable ZIP (with SHA-256) plus NSIS/MSI installers to the
  release page. It can also be run manually with a tag name to fill in a
  missing release.
- Added the missing `@tauri-apps/cli` development dependency and switched the
  Tauri scripts to use it, so `npm run tauri:build` works without a global
  Tauri CLI installation.

## Validation

- TypeScript typecheck passed.
- Vite production build passed.
- Hold-binding sync logic verified against keyboard, mouse, gamepad, and
  combination inputs.
- The GitHub Actions release workflow is new and will be exercised on the next
  tagged release.

The software is free. If a third-party platform charges you for it, request a
refund and download only from the official project release page.
