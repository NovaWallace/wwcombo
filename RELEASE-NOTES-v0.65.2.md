# WW Combo Trainer v0.65.2

## 中文更新日志

### 发布与安装

- 发布 Windows x64 便携版，程序版本、Tauri 版本和更新检测版本统一为 `0.65.2`。
- 发布包拆分为三个同级文件夹：`wwcombo`、`live2d`、`ffmpeg`。
- `live2d` 和 `ffmpeg` 作为可选模块保留，用户可以只下载本体，或按需把对应文件夹放到 `wwcombo.exe` 同级目录。
- 本体会自动扫描 exe 同级的 `live2d` 和 `ffmpeg` 目录，保留轻量安装方式。

### 桌面端与时间轴

- 继续完善时间轴、视频时间轴和连段图预览的共用渲染链路。
- 优化备注独立显示：备注随对应招式进入可视区域出现，在招式完成后消失，并支持独立位置、缩放和序号显示。
- 改进备注移动模式退出后的坐标保持，避免窗口闪回或被旧布局覆盖。
- 保留键位映射、文字轴、视频编辑和练习模式之间的内容与备注区分。

### 视频与识别模块

- Windows 本体继续包含视频编辑界面和实时识别设置界面，FFmpeg 运行文件独立放入可选模块目录。
- 保留视频裁剪、连段图、提示区和备注区的独立布局设置。
- 实时 Buff 识别相关界面和资源路径继续按可选功能组织，避免默认安装强制占用全部资源。

### 其他

- 修正项目内部版本号与发布包名称不一致的问题。
- 更新三目录打包脚本：默认从 `package.json` 读取版本，并保证压缩包根目录只包含三个分发目录。

## English Release Notes

### Release and installation

- Released the Windows x64 portable build as version `0.65.2`. The npm, Rust/Tauri, executable, and update-check versions are now aligned.
- The portable package is split into three sibling folders: `wwcombo`, `live2d`, and `ffmpeg`.
- `live2d` and `ffmpeg` are optional modules. Users can install the core application alone, or place either optional folder next to `wwcombo.exe` when needed.
- The desktop application automatically scans the executable directory for the sibling `live2d` and `ffmpeg` folders, keeping the basic installation lightweight.

### Desktop and timeline improvements

- Continued to align the shared rendering paths used by the main timeline, video timeline, and combo previews.
- Improved independent notes: a note appears when its associated action enters the visible combo area and disappears when that action is completed. Independent position, scale, and sequence number settings are preserved.
- Fixed independent-note layout persistence when leaving move mode, preventing the note panel from flashing back or being overwritten by stale layout data.
- Kept the distinction between action content and notes across key mapping, Text Axis, video editing, and Practice mode.

### Video and recognition modules

- The Windows core package continues to include the video editing UI and realtime-recognition settings UI, while the FFmpeg executable is distributed separately as an optional module.
- Video trimming, combo overlays, hint areas, and independent note areas retain their separate layout controls.
- Realtime Buff recognition remains organized as an optional feature path so the default installation does not require every large resource module.

### Packaging

- Fixed the mismatch where the executable still reported `0.65.0` while the package name had already moved forward.
- Updated the three-folder packaging script to read the version from `package.json` by default and to create archives whose root contains only the three distribution folders.

## Notes

- This release is a portable Windows build. Keep the three folders together when using optional modules.
- The community website is not bundled into the desktop release.
