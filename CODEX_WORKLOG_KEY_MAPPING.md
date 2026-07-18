# 按键映射实验模式工作记录

## 目标

新增实验模式子模式“按键映射”：按下指定键位时，在独立置顶映射窗口中即时显示对应图片；支持静态图片层、按键层、图层顺序、上传素材、整体移动/缩放/尺寸调整，以及每个图层/图片的移动和尺寸调整。

## 原则

- 作为实验功能独立开发，尽量不改动录制、练习、外观等本体逻辑。
- 可以参考已有 overlay / rhythm-feedback / coop 的实现，但新窗口、新状态、新持久化 key 分开。
- 不制造全屏透明交互层；普通显示时鼠标穿透，移动模式时才接收鼠标。
- 不重置或覆盖用户已有工作树改动。

## 已完成

- [x] 读取实验页、Tauri 窗口、输入桥接和移动模式相关实现。
- [x] 确认可用素材：`Bongo Cat Mver鸣潮/img/standard/mousebg.png` 和 `keyboard/0.png` 到 `14.png` 均为 620x514 RGBA，同画布可直接对齐叠加。
- [x] 复制默认素材到 `public/key-mapping/default`，复制入口图标到 `public/theme/experiment-keymap.png`。
- [x] 新增共享配置类型 `src/keyMappingTypes.ts`，独立 localStorage key 为 `ww-combo-trainer-key-mapping-v1`。
- [x] 新增实验页组件 `src/KeyMappingLab.tsx`。
- [x] 新增独立置顶窗口入口 `key-mapping.html`、`src/keyMappingOverlay.tsx`、`src/keyMappingOverlay.css`。
- [x] `vite.config.ts` 增加 key-mapping 多页面入口。
- [x] `desktopBridge.ts`、`vite-env.d.ts` 增加 key-mapping 桥接接口。
- [x] `src-tauri/tauri.conf.json` 增加 `key-mapping` 窗口，默认隐藏、透明、置顶、无装饰、可调整大小。
- [x] `src-tauri/capabilities/default.json` 增加 `key-mapping` 窗口权限。
- [x] `src-tauri/src/lib.rs` 增加 key-mapping visible/update/bounds/drag/bounds-changed 命令和窗口事件同步。
- [x] 实验首页增加“按键映射”入口，子页接入 `KeyMappingLab`。
- [x] 主输入路由在 `experimentPage === 'keymap'` 时转发按键/鼠标按下和松开信号。
- [x] 按键映射输入在主输入入口提前分流，绕过招式长按转换，避免 E/Q/R/鼠标左键等键位出现长按判定延迟。
- [x] 前端构建：`npm.cmd run build` 通过。

## 2026-07-16 移动模式红框改为整体缩放

- [x] 按键映射置顶窗口的移动模式红框不再作为裁剪窗口使用，窗口 resize 会推导并保存 `scale`。
- [x] 覆盖层在移动模式中按当前窗口可视区实时等比缩放内容，红框变大/变小时内容同步放大/缩小。
- [x] `get_key_mapping_bounds` 和 `key-mapping:bounds-changed` 返回逻辑尺寸，避免 Windows DPI 缩放下把物理尺寸当成 CSS 尺寸导致退出后恢复或裁剪。
- [x] 前端构建：`npm.cmd run build` 通过。
- [x] Rust 检查：`cargo check` 通过。

## 2026-07-15 图层调整框改为缩放

- [x] 预览区大图层和按键小图层的调整框不再作为展示区域/裁剪框使用，拖动边和角都会等比缩放整个图层或按键图片。
- [x] 右侧“位置与尺寸”改为“位置与缩放”，宽/高输入合并为单个“缩放 x100”。
- [x] 旧配置里的非等比宽高会在归一化时合并为统一大小，避免继续出现裁剪式编辑框。
- [x] 前端构建：`npm.cmd run build` 通过。
- [x] Rust 检查：`cargo check` 通过。

## 2026-07-15 图层轨道排序修复

- [x] 上方大图层块改为 pointer 拖拽排序，按住图层块横向拖过其他图层即可调整上下关系。
- [x] 左侧图层仍代表更上层，拖动排序会直接更新覆盖层渲染顺序。
- [x] 去掉图层块上的 HTML5 drag/drop 依赖，避免按钮内图标/文字导致拖拽体验不稳定。
- [x] 前端构建：`npm.cmd run build` 通过。

## 2026-07-15 退出移动后裁剪修复

- [x] 发现按键映射窗口在 Windows DPI 缩放下把 CSS 画布尺寸当作 `PhysicalSize` 设置，退出移动模式后会把 620x514 逻辑画布塞进更小的物理窗口，表现为只显示左上约四分之一。
- [x] `key-mapping` 窗口尺寸改用 `Size::Logical(LogicalSize)`，min/max size 同步改成逻辑尺寸。
- [x] 移动结束/窗口位置同步时只保存 x/y，不再读取 live outer size 参与缩放或 bounds 归一化。
- [x] 前端构建：`npm.cmd run build` 通过。
- [x] Rust 检查：`cargo check` 通过。

## 默认行为

- 默认静态图片层：`mousebg.png`，位于图层轨道最左侧，因此渲染在最上层。
- 默认按键层：映射 Bongo Cat standard 配置中的键位素材 0-14。
- 默认映射：T/E/Q/R/Space/MouseLeft/MouseRight/F/W/A/S/D/1/2/3。
- 图层轨道：左边图层在上，右边图层在下，可拖动图层 pill 改顺序。
- 图片层：可上传图片，可调整图层整体位置、尺寸、透明度、旋转。
- 按键层：有“按键设置”，每个按键可改名、捕获键位、上传对应图片、删除。
- 按键图片：按下显示，松开消失；编辑时会以半透明方式显示当前选中的按键图片方便调整。
- 置顶窗口：普通显示时鼠标穿透；移动模式时显示虚线框，可拖动和缩放整体窗口。

## 未实际窗口验收

## 2026-07-15 抽搐与压缩修复

- [x] 将按键映射整体窗口大小改为 `canvasWidth * scale` / `canvasHeight * scale` 的统一缩放模型。
- [x] 新增 `scale` 配置和“大小缩放 x100”设置项，旧的宽高配置会按较小比例迁移为等比缩放，避免素材被横向或纵向压扁。
- [x] 覆盖层渲染从 `scale(x, y)` 改为单一 `scale(n)`，显示比例与素材画布保持一致。
- [x] 移动模式中不再把窗口 live 宽高回写到 React 状态，只保存位置，断开“窗口事件 -> 主界面配置 -> 覆盖窗口重设”的循环。
- [x] 按键映射覆盖层移除原生 resize 手柄，整体大小统一通过设置里的缩放参数调整；图层和按键图片自身仍可在预览编辑器里移动、缩放、旋转。
- [x] 前端构建：`npm.cmd run build` 通过。
- [x] Rust 检查：`cargo check` 通过。


- 尚未运行 `npm.cmd run tauri dev` 亲眼验证置顶窗口拖动/缩放、鼠标穿透和全局监听在游戏窗口中的表现。
- 需要用户醒来后重点验收多屏/DPI 场景下窗口位置和大小是否保存正确。

## 待用户验收

- 进入实验页面后是否能看到“按键映射”。
- 打开置顶显示后，按下配置键位时图片是否快速出现，松手是否立即消失。
- 静态 mousebg 是否默认在最顶端，键位图片是否与素材画布对齐。
- 移动模式下整体窗口是否能拖动和缩放，退出后是否保存。
- 预览区内图层/按键图片的拖动、尺寸、透明度、旋转是否够用。
- 切到游戏或其他窗口后，需要确认全局监听已开启，按键映射是否仍响应。
