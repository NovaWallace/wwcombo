# Coop Audio Fix Worklog

Date: 2026-07-16

## Scope

- Fix coop event audio triggers being hard to hit.
- Fix audio events stopping at the source file length instead of the configured duration.
- Keep changes local to coop event trigger/audio flow plus the app input route feeding coop events.

## Changes

- `src/CoopEventLab.tsx`
  - Removed the old trigger window behavior that expanded around the block start time.
  - Event skill blocks now trigger during their actual active block range: `startMin` through `startMin + durationMax`.
  - Runtime and editor-preview block picking now prefer the candidate whose block center is closest to the current elapsed time.
  - Shortened stale held-input recovery from 2000ms to 240ms, so missed keyup/mouseup events do not make the same key feel unresponsive for two seconds.
  - Kept duplicate press suppression at 90ms to block duplicate local/global input pairs and key-repeat noise.
  - Added `stopCoopAudio` and routed all coop audio stop/unmount cleanup through it.
  - Audio events with `durationMs > 0` now set `audio.loop = true` and are stopped by the duration timer, so short source files keep playing until the configured duration ends.
  - Audio events with `durationMs === 0` still play the file once with no forced duration.
  - Stop/hide actions cancel looping, pause, and seek back to 0.

- `src/App.tsx`
  - Coop events now receive raw normalized input immediately on practice/coop pages before regular hold-conversion routing can delay it.
  - Converted hold inputs still pass through the coop signal route, so event blocks bound to hold moves can trigger too.

## Verification

- `npm.cmd run build` passed.
- `cargo check` in `src-tauri` passed.

## Manual Checks Still Needed

- Upload a short audio file, set a longer coop audio duration, trigger it, and confirm it loops until the configured duration.
- Bind a second event block to stop the same audio and confirm it stops only when that block is triggered during its own active block window.
- In practice mode, confirm pressing during any part of the event block duration triggers the event.

## Follow-up Fix: 2026-07-16 Late

User reported audio still did not last for the configured duration and trigger sensitivity was still poor.

Additional fixes:

- Rebuilt `src/CoopEventLab.tsx` after a patch-tool move error removed the untracked file from the workspace.
- `CoopEventRuntime` no longer stops already-triggered audio when practice status leaves `running`; audio now ends by duration timer or explicit stop/hide binding.
- Removed the one-trigger-per-block behavior from coop runtime/editor matching so the same event block can be triggered anywhere inside its whole active duration.
- Replaced reliance on `HTMLAudioElement.loop` with explicit `onended` restart plus a 250ms keepalive check until the configured duration deadline.
- The configured duration now defines the audio event lifetime; short source files are restarted until the deadline, and stop/hide still cancels immediately.

Verification after rebuild:

- `npm.cmd run build` passed.
- `cargo check` passed.
