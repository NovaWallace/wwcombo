# WW Combo Trainer

[中文](README.md) | [English](README_EN.md) | [日本語](README_JA.md) | [한국어](README_KO.md)

WW Combo Trainer is a Windows desktop tool for recording, editing, practicing, and exporting Wuthering Waves combos. It only reads input for recording and judgement; it never sends gameplay input for you. This is an unofficial fan project and is not affiliated with Kuro Games.

## v0.3.0 update (2026-07-30)

- Added built-in help in four languages, learner and guide-author tutorials, detailed shortcut reference, a full changelog, and first-run guidance.
- Settings now imports and exports `.wwkeys.json` binding backups and provides configurable single-key and Shift shortcuts; editing combinations beginning with Ctrl or Alt remain fixed.
- The Windows build now requires administrator privileges at launch. Global Input Capture, mouse side buttons, dual bindings, and the gamepad input path were improved.
- Fixed `Delete`, `Ctrl+C`, and `Ctrl+V`; added `C` for Split and `V` for Merge. Delete enters Continuous Delete with no selection, and conflicting browser defaults are suppressed.
- Add mode now supports `F` for Finisher and `B` for adaptive Intro switches. Press `Y` on selected blocks to append Outro, with default prompts for Finisher, Intro, Outro, and Move Forward.
- Action text supports literal square brackets such as `[Basic Attack]`: bracketed text bypasses icon conversion and the brackets are hidden when rendered.
- Added Change and Merge to the context menu, enabled selection actions from empty timeline space, and fixed block dragging plus `Alt`-drag warm-up/recovery editing.
- Appearance adds text outlines, protected background edges, team presets, and actual-key icons, with improved default crops and light-theme contrast.
- The Record timeline adds playback, speed, and Auto Follow, with zoom centered on the white playhead. Video trimming and the five-tool/multifunction layout were refined.
- Improved home backgrounds, icons, and Live2D across three themes, added a Live2D off switch, and fixed the navigation visibility eye background and position jump.
- Recording status is green while ready and red while recording; axis export, key mapping, and video output received further improvements.

## Installation and first setup

1. Download `WW Combo Trainer_*_x64-setup.exe` from GitHub Releases. MSI and portable ZIP packages with a shortcut and FFmpeg are also provided.
2. Install and launch the application. If Windows shows a source warning, continue only after confirming that the file came from this repository's Release page.
3. Open `Settings` and select Chinese, English, Japanese, or Korean.
4. Switch between `Keyboard & Mouse` and `Gamepad`, then match every action to your in-game controls.
5. Each action accepts two bindings. For example, Dodge can use both `Shift` and the right mouse button.
6. Enable Global Input at the bottom of the sidebar so the desktop build can receive input while the game is focused. The Windows build requests administrator privileges at launch; approve the UAC prompt.

Changing language only changes built-in interface text. It never rewrites custom combo names, character names, notes, or labels.

## Recommended workflow

1. Check bindings in Settings.
2. Open Record and perform the combo once.
3. Correct actions, characters, periods, and display text on the timeline.
4. Save the combo and export a JSON backup.
5. Learn it in Practice.
6. Configure the always-on-top chart in Appearance.
7. Use Export Axis for a PNG, or Video Tools for rendered footage.

## Recording

- The defaults are `F` to start and `Esc` to stop. Your Settings bindings take priority.
- `Replace` uses the new recording as the current chart.
- `Test` matches a new run against the current chart to refine timing windows.
- `Video Tools` opens synchronized video editing when a chart already exists.
- Holding Basic Attack, Skill, Echo, Liberation, Dodge, or Jump records the matching hold action.

### Timing mode

- `Add` enters placement mode. Pick an action and click a character lane. Press `X` while placing to switch between actions and periods where available.
- Drag a block to change its time or lane. Drag either edge to change start time or duration.
- Use the scissors tool to split a block at the clicked time.
- Ctrl-click actions or drag a selection rectangle to select several blocks.
- `Ctrl+Z` undoes; `Ctrl+Y` or `Ctrl+Shift+Z` redoes.
- Action fields include display text, note, independent lane, earliest start, maximum duration, warm-up, and recovery.

### Periods

- `Startup Axis` is the opening section and always starts at zero.
- `Loop Axis` is a repeating section. Add multiple loop axes when rounds differ.
- `Free Action` allows actions without normal main-axis progression.
- Deleting a period does not delete the action blocks inside it.

### Content mode

Content mode changes what the player sees, not action timing.

- `Block Text` is used by overlays and exported images.
- `Note` is the practice hint.
- Empty Action can only be inserted with Add. It is display-only and is ignored by Practice and Challenge judgement. If its text is a known mapping such as `w`, `f`, or `e`, the default hint becomes Move Forward, Finisher, or Resonance Skill.

Common icon text: `a` Basic Attack, `z` Heavy Attack, `e/E` Skill/Hold Skill, `q/Q` Echo/Hold Echo, `r/R` Liberation/Hold Liberation, `s` or `d` Dodge, `j` Jump, `f` Finisher, `w` Move Forward, and `i/ii/iii` character switches.

## Combo library, import, and sharing

- Click a combo to select it, use the pencil to edit it, and use Delete with confirmation to remove it.
- Import reads compatible JSON. Export Current/All creates backups and transferable files.
- Share JSON includes name, tags, description, and an optional link. Tags include Easy Loop, Basic, Standard, Advanced, Showcase, and Global.
- JSON stores action timing, characters, lanes, periods, content text, appearance, avatars, backgrounds, crops, icons, and related mappings.
- Export a backup before major character-order, loop-axis, or timeline changes.

## Practice

1. Open Practice and select a combo.
2. Choose Demo, Practice, or Challenge.
3. Use the configured Start and Stop actions.

- `Demo` plays by timeline and requires no input.
- `Practice` advances after the expected input and is best for learning order.
- `Challenge` uses stricter timing and error judgement.
- `Character Order` remaps switch targets by dragging portraits. It cannot change while a session is running.
- `Start at Axis Opener` waits for the first key action when entering a startup or loop axis.
- `Merge Same Character` combines adjacent display items; Appearance controls the merge limit.
- The yellow eye button shows or hides the always-on-top chart.

## Appearance

Appearance controls the chart shared by Record and Practice. Horizontal, Vertical, and Waterfall layouts keep separate window positions and settings.

- `Move` enables dragging and resizing. Turn it off afterward to restore click-through behavior.
- `Capsule/Background` selects color blocks or image backgrounds.
- `Avatar` chooses an online preset or custom image for each character and provides crop controls.
- `Global Background` is used by characters without an override.
- `Character Background` overrides only that character; Use Global removes the override.
- Background X/Y/W/H controls crop. Left and right stretch guides protect borders and decorative end caps while the center stretches.
- `Icons` manages text-to-image mappings, character-specific mappings, and icon size.
- Icon Conversion, Merge Same Character, and Pre-prompt affect display only, not judgement.
- Wrap action content in square brackets to keep it as literal text. For example, `[Basic Attack]` displays as `Basic Attack` without icon conversion or visible brackets.
- Overall scale, block height, gap, font, avatar size/offset, fade strength, and merge limit adjust presentation only.

## Export Axis

`Labs > Export Axis` produces a complete combo PNG.

1. Select a combo on the right.
2. Startup Axis and one Loop Axis are shown by default. A single loop is labeled `Loop Axis` without a number.
3. Use Content to include additional rounds and adjust individual block text.
4. Use Appearance, Background, and Icons for module-only customization. These settings do not overwrite global appearance.
5. Enter the target image width and height. The renderer wraps and scales automatically for the number of blocks; it does not force a larger image.
6. Check the large preview and export PNG.

Startup and loop axes are treated as continuous, automatically wrapping combo blocks. Character backgrounds, custom crops, presets, custom icons, and mappings are all available inside this module.

## Labs

### Rhythm Axis

Select a saved combo and start the challenge. Settings control stage layers, track start and judgement points, judgement regions, character feedback, and audio-reactive layers. Layers support position, size, opacity, rotation, and ordering. Rhythm Axis keeps an independent icon configuration that can be recopied from the global mapping.

### Key Mapping

Key Mapping shows custom images while keyboard, mouse, or gamepad inputs are held.

- Image layers are backgrounds or decoration; key layers contain input-responsive images.
- Action-linked images follow both binding slots from the main Settings page. Gamepad mode does not require duplicate entries.
- Presets save the complete layer, image, and position setup.
- Settings control desktop window position, canvas size, and overall scale.

## Video Tools

1. Create or select a combo, then open Video Tools from Record.
2. Import gameplay footage and align actions on the synchronized timeline.
3. Space plays or pauses. Playback speeds include 1x, 0.5x, and 0.2x.
4. The combo layer starts from Appearance and can be moved, scaled, or cropped independently in the video preview.
5. Zoom keyframes create camera push/pull effects. The timeline handle adjusts panel height and timeline zoom.
6. The desktop package exports MP4 when available; browser mode may fall back to WebM. Set the destination folder in Settings.

## Troubleshooting

- **No input while the game is focused:** verify bindings and input mode, enable Global Input, and match the game's privilege level.
- **Overlay cannot be dragged:** enable Move temporarily, then disable it after positioning.
- **Background looks distorted:** adjust crop first, then keep the left and right stretch guides from crossing.
- **MP4 export fails:** import a video in the current session, use a writable export folder, and run the complete packaged application.
- **Custom text does not change with language:** this is intentional; only built-in text is translated.

## Development build

Node.js, Rust, and the Windows requirements for Tauri 2 are required.

```powershell
npm install
npm run typecheck
npm run tauri:build
```

Installers are written to `src-tauri/target/release/bundle/`. `scripts` contains separate community-site tooling and is not part of the desktop application package.
