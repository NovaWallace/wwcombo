# wwcombo 0.61

Release date: 2026-08-02

This release is a Windows x64 portable build. Extract the ZIP completely and
keep the launcher shortcut beside the portable folder. The ZIP contains the
application, FFmpeg, documentation, license, build information, and a SHA-256
file. It does not contain the `scripts` directory.

## Changes

- Removed the deprecated video Zoom Keyframe track, red markers, and related
  placement, drag, and delete behavior. The normal timeline Zoom slider remains
  available, and Period block text is now left-aligned for longer labels.
- Fixed the Tab shortcut for Adaptive Character Switch in Add mode when focus
  remains inside a timeline content editor. Other input fields keep their normal
  Tab focus behavior.
- Completed Japanese and Korean coverage for the latest update notices, video
  trim and playback messages, timeline history actions, content icon controls,
  and Community upload errors.
- Fixed same-move merging so only consecutive compatible moves are grouped.
  Interleaved actions keep their original order, for example `Attack, Attack,
  Jump, Attack` remains `Attack x2, Jump, Attack`.
- Kept the practice preview and the always-on-top combo chart on the same merge
  data and rendering rules.
- Improved merged-move sizing so the count text and progress dots remain
  visible without changing the normal icon row height.
- Kept progress dots aligned with the first icon in a merged group and enlarged
  them for better visibility.
- Preserved the full timeline layout in narrow windows and kept the sidebar
  interaction independent from the main editing surface.
- Retained the system-browser update download path so a future release link is
  opened outside the embedded webview instead of being trapped in the app.

## Validation

- TypeScript typecheck passed.
- Vite production build passed.
- Tauri Windows build passed.
- Portable ZIP contents were checked to ensure that `scripts` is absent.

The software is free. If a third-party platform charges you for it, request a
refund and download only from the official project release page.
