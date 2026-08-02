# wwcombo 0.62

Release date: 2026-08-02

This release is a Windows x64 portable build. Extract the ZIP completely and
keep the launcher shortcut beside the portable folder. The ZIP contains the
application, FFmpeg, documentation, license, build information, and a SHA-256
file. It does not contain the `scripts` directory.

## Changes

- Added a bundled avatar manifest and bundled character avatar images. The
  client now has a local avatar fallback when the hpyg avatar service is
  unavailable, blocked by browser CORS, or returns a changed response format.
- Added migration for old remote avatar URLs, placeholder avatars, and legacy
  bundled paths. User-uploaded `data:` and `blob:` avatars remain untouched.
- Avatar loading now prefers bundled assets, then the local avatar cache, and
  finally the online avatar service. A network outage no longer turns the
  whole character list into unloaded placeholders.
- Added Community iframe loading detection with a timeout, retry action, and
  a system-browser fallback. Community refresh and external-open actions now
  use the desktop opener path so they do not depend on an embedded webview
  link working correctly.

## Validation

- TypeScript typecheck passed.
- Vite production build passed.
- Tauri Windows build passed before packaging.
- Portable ZIP contents were checked to ensure that `scripts` is absent.

The software is free. If a third-party platform charges you for it, request a
refund and download only from the official project release page.
