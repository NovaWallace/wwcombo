# Axis Rhythm UI Layer Worklog

## 2026-07-19

- Reworked the `节奏合轴` experiment into an editable rhythm workbench:
  - left side is the live rhythm stage;
  - right side is a compact layer panel and transform inspector.
- Added a rhythm-only image layer system inspired by the key-mapping editor:
  - add image layers;
  - upload image assets as data URLs;
  - select layers from a layer list;
  - drag layers directly on the stage;
  - resize with eight handles;
  - edit X/Y/width/height/opacity/rotation numerically;
  - rename/delete/reset layers.
- Layer state is persisted in localStorage under:
  - `ww-combo-axis-rhythm-layout-v1`
- Kept the existing rhythm gameplay behavior intact:
  - F starts;
  - Esc pauses/resumes;
  - audio capture meter;
  - judgement windows and combo scoring;
  - independent icon snapshot under the existing icon storage key.
- UI polish pass:
  - tighter top controls;
  - rhythm stage plus side inspector layout;
  - responsive single-column fallback below 1300px;
  - selected layer frames and resize handles match the existing key-mapping editor language.

## Validation

- Passed `npm run build`.

## Next Manual Step

- Use the new layer panel to upload and tune the desired rhythm UI artwork.
- Once the layout feels right, export or inspect `localStorage['ww-combo-axis-rhythm-layout-v1']`; I can then hard-code that JSON as the default rhythm UI framework.

## 2026-07-19 Video Workbench Follow-up

- Moved the file and close icon buttons out of the video preview HUD and into the right-side move inspector area.
- Compressed the video file menu so it uses less vertical space.
- Hid the normal timeline zoom slider when the timeline is embedded in video mode.
- Added a video-mode timeline button that scrolls the timeline editor to the current playback time.
- Increased compact video timeline lane height so the existing 3-role x 2-lane structure is readable as six tracks.
- Validation passed: `npm run build`.

## 2026-07-19 Default Combo Content Labels

- Added default content-label fallbacks for combo rendering and content editing placeholders.
- Defaults now follow icon-conversion triggers: basic attack `a`, heavy attack `z`, skill `e`, hold skill `E`, switch 1/2/3 as `i`/`ii`/`iii`, plus matching defaults for echo, liberation, dodge, and jump variants.
- Manual `contentLabels` still take priority over these defaults.
- Validation passed: `npm run build`.
