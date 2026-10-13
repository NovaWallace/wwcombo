# WW Combo Trainer v0.7.0

## 中文更新日志

- 新增 OKWW 队伍包导出与编辑：连段图/时间轴编辑、视觉判定、失败分支、角色选择及 ZIP 信息填写。
- 按键 Buff 计时新增“不可刷新”与冷却时间；Buff 和冷却提醒均跟随游戏计时器。
- 全局键鼠捕获改为按需启动，打开主页时不再立即安装鼠标钩子。
- 修复 Windows 便携包在 Tauri 构建失败后误用旧 exe 的问题；打包时校验新构建及所需功能。
- 统一 npm、Rust/Tauri、程序和发行包版本为 `0.7.0`。
- Windows 分发为本体 ZIP 和完整 DLC ZIP 两包：先解压本体，再把 DLC 解压到 `wwcombo.exe` 所在目录；DLC 含 FFmpeg、模拟输入和 37 个 Live2D 角色。

## English Release Notes

- Added OKWW team export and editing with combo-flow/timeline views, visual checks, failure branches, character selection, and ZIP metadata.
- Added non-refreshable Buff cooldowns and game-timer-based expiry alerts.
- Global keyboard/mouse capture now starts on demand instead of installing a mouse hook on the home screen.
- Fixed Windows packaging silently reusing an old executable after a failed Tauri build; builds now validate the new binary and required features.
- Aligned npm, Rust/Tauri, executable, and package versions at `0.7.0`.
- Windows is distributed as two ZIPs: extract the core package, then extract the complete DLC archive into the directory containing `wwcombo.exe`. The DLC includes FFmpeg, simulation input, and 37 Live2D characters.
