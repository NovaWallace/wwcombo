# WW Combo Trainer 0.63.0

## Compatibility Mode

- Added an optional four-character compatibility mode with matching lanes, adaptive switches, and a fourth switch binding.
- Character names can be edited without the online character-name lock while Compatibility Mode is active.
- Action names can be customized in Key Bindings and become the default action prompts throughout the app.

## Notes and Combo Presentation

- Added a separate note area for actions with user-authored notes. Its position, scale, font, color, rounded outline, and display order are configurable.
- Notes disappear when their corresponding action completes and are supported by the topmost overlay, Practice preview, video preview, and final video composition.
- Added the Stair layout with an adjustable per-character vertical offset.
- Added Merge Same Move presentation with an icon count and per-action progress markers. Special notes remain visible and receive a prominent red marker while merged.
- Timing / Notes now edits actual action notes in both the main timeline and Video mode. Default prompts are no longer converted into editable custom notes.

## Editing and Video

- Added Quick Team to the Record page for applying a selected character order or saving it as a team preset.
- Combo and note move controls support horizontal drag scaling and a three-second hold to reset.
- Expanded the Video combo layer's horizontal crop range and fixed drag jitter, unexpected transform resets, and edge clipping.
- Improved toolbar spacing and hover feedback for move, scale, and multifunction controls.

## Controller Support

- Added a dedicated PlayStation capture backend alongside keyboard/mouse and Xbox input.
- Only the currently selected input backend runs, reducing unnecessary capture work and avoiding cross-device input conflicts.
- Updated the default controller bindings for Dodge and Resonance Liberation.

## Live2D

- The core package no longer bundles any Live2D source assets.
- Every collected character is distributed as a clearly named individual package, so users can install only the character they want.
- Live2D packages extract beside `wwcombo.exe` as `wwcombo dlc/live2d/<character-id>/...` and can be rescanned from Settings.
- Leaving the home page still destroys the active Pixi/Spine instance and unloads its related assets.
- Added per-character Live2D scale, horizontal offset, and vertical offset controls in Settings.

## Optional Video Extension

- FFmpeg is no longer bundled with the core portable app or installer.
- Video recognition, composition, and MP4 export discover FFmpeg from `wwcombo dlc/ffmpeg/ffmpeg.exe`.
- Normal recording, practice, combo editing, JSON import/export, and appearance tools continue to work without the video extension.
- Legacy FFmpeg and Live2D locations remain supported for existing users.

## Workshop and AFYG

- Replaced the retired Experiment entry with Workshop and embedded Yeguo Toolbox as a full-screen workspace.
- Added the WWCombo timeline, synchronized damage-binding view, direct-damage editor, and effects/execution editor to the AFYG arrangement page.
- Added a Workshop-only Effects lane for actions that do not belong to a character.
- Entering Workshop now asks whether to load the currently selected combo. Cancelling performs no AFYG writes; confirming loads it once after an AFYG project is ready.
- Removed the redundant manual timeline-sync page from the floating Workshop tool.

## Reliability

- Removed the unfinished Real-time Vision entry from the distributed client while retaining the independent Video recognition workflow.
- Existing saved settings remain compatible; new Live2D transform settings use each character's existing defaults until changed.
- Optional characters fail visibly when their separate resource pack is not installed instead of replacing the selected character with another asset.
- Leaving Home destroys the active Live2D renderer and releases loaded character assets.
- Community combo downloads no longer overwrite global key bindings, custom action names, or practice behavior. Only an explicit `.wwkeys.json` import changes input settings.
- Advance mode now accepts a normal action's hold variant, treats detected Heavy Attack as a valid Basic Attack step, and immediately advances legacy normal actions that were incorrectly marked independent. Challenge mode remains exact.
- Text Axis consistently recognizes `z`, `Z`, and `A` as Heavy Attack.

## Mapping Compatibility

- Restored the default `b` and `y` mappings for Intro and Outro actions.
- Normalized older character-level icon mappings and merged them with the global mappings so saved combo data does not silently lose the Intro/Outro triggers.
- Preserved character-level custom icon sources, labels, and triggers while retaining the global fallback mappings.
- Fixed combined action icons overlapping or disappearing in some legacy combo data.

## Localization

- Added complete Japanese and Korean text for Compatibility Mode, Stair layout, separate Notes, recording-recognition windows, Quick Team, DLC status, controller selection, and move/scale/reset controls.
- Added complete Japanese and Korean text for Workshop controls, damage/effect binding, combo import, timeline locking, timing markers, and AFYG error states. The injected combo-import control now follows the app language without reloading Workshop.
- Added the full 0.63.0 changelog to the built-in Chinese, English, Japanese, and Korean help pages.
