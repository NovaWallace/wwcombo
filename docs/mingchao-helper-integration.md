# 鸣潮自助接入调研

## 位置与形态

源项目当前位于本项目同级目录：`C:\Users\Walla\Documents\鸣潮自助`。

它不是常规 React/Vite 项目，而是一个单文件网页应用：

- `index.html`：约 1.4MB，包含 HTML、CSS、全部业务 JS。
- `assets/default-preset.js`：内置默认预设，包含角色、技能、胶囊底图、头像等大量 base64 数据。
- `assets/button-icons/`：招式图标，如 `skill.png`、`mouse-left.png`、`echo.png` 和对应 hold 版本。
- `assets/basemap-image/`：胶囊底图原图。
- `assets/capsule-presets/`：胶囊预设裁剪图。
- `assets/avatar-image/`：角色头像素材。
- `assets/*.json`：大型用户/示例预设。

## 核心数据模型

`index.html` 约 1993 行定义全局 `state`：

```js
const state = {
  layoutMode: "vertical",
  roles: [],
  skills: [],
  singleRoleCapsuleMode: false,
  singleRoleCapsuleTarget: "",
  globalCapsuleStyleControls: null,
  capsuleImage: "",
  capsuleImageOriginal: "",
  capsuleCrop: null,
  capsuleStretch: null,
  capsuleStretchEditing: false,
  capsuleImageLabel: "",
  backgroundColor: ""
};
```

主要实体：

- `role`：角色名称、头像、头像裁剪、单角色胶囊配置。
- `skill`：归属角色、文本/富文本、隐藏头像、隐藏背景、强制换行、透明宽度等。
- `capsule`：胶囊底图、原图、矩形裁剪、九宫/三段拉伸参数、样式覆盖。
- `preset`：完整快照，包含 controls、roles、skills、胶囊图、背景色等。

## 关键功能模块

### 1. 预设存储与导入导出

关键函数：

- `normalizePresetSnapshot(data, fallbackName)`
- `readPresetStore()`
- `openPresetDatabase()`
- `readPresetStoreFromDatabase()`
- `writePresetStore(presets)`
- `saveCurrentPreset()`
- `exportCurrentPreset()`
- `loadSelectedPreset()`
- `importPresetFile(file)`

特点：

- 主要使用 IndexedDB 保存大体积 preset，localStorage 作为兼容方案。
- 预设中允许直接保存本地图片的 data URL。
- 对本项目很有价值，因为连段图自定义后也会变成大对象，不适合只塞 localStorage。

### 2. 快捷输入到技能列表

关键函数：

- `parseQuickInputSkills(value, options)`
- `quickInputTextToRichHtml(text, convertIcons)`
- `renderSkillIconHtml(iconId)`
- `applyQuickInput(mode)`

语法摘要：

- `/` 数量代表角色序号。
- `/` 之间内容代表一个胶囊/技能块。
- 特殊后缀控制隐藏头像、隐藏背景、直接换行。
- 单字母可转图标，例如普攻、重击、闪避、技能、声骸、解放等。

适配本项目时，可以把 `ComboChart.steps` 转成 `skills`：

- `characterSlot` -> role index。
- `label/moveId` -> skill text 或 icon rich text。
- `lane/directBreak` 可映射为换行、分组或透明块。

### 3. 胶囊底图与裁剪/拉伸

关键函数：

- `defaultRectCrop()`
- `defaultCapsuleStretch()`
- `normalizeRectCrop(cropInput)`
- `normalizeCapsuleStretch(stretchInput)`
- `getRectCropMetrics(imageWidth, imageHeight, cropInput)`
- `getCapsuleStretchMetrics(image, h, stretchInput)`
- `drawCapsuleBase(ctx, image, x, y, w, h, fallbackColor, stretchInput)`

特点：

- 胶囊图片使用横向三段拉伸，左右保形，中间拉伸。
- 没有图片时用圆角矩形渐变兜底。
- 裁剪和拉伸参数均用百分比，方便跨素材复用。

这部分适合优先迁移成纯 TS canvas 工具模块。

### 4. 布局计算

关键函数：

- `buildDrawSettings(overrides)`
- `getSkillPlacements(ctx, settings, canvasWidth, skills)`
- `scaleLayoutSettings(settings, factor)`
- `solveFlowLockedScale(ctx, settings, width, height)`
- `fitCanvasToContent()`

支持模式：

- `vertical`：竖排。
- `horizontal`：横排。
- `flow`：自动换行流式布局。

输出 `placements`，每个 placement 包含：

- skill、role。
- x/y。
- capsuleWidth。
- itemSettings。
- hasAvatar。

本项目的覆盖层应复用这个布局层，替代当前 DOM flex 的简陋连段条。

### 5. Canvas 绘制

关键函数链：

- `draw()`
- `getSkillPlacements()`
- `drawSkillPlacement(ctx, placement, settings, capsuleImage, avatarSize)`
- `drawCapsuleBase()`
- `fitText()`
- `loadImage()`

渲染能力：

- 角色头像圆形裁剪。
- 胶囊底图/渐变兜底。
- 富文本技能名。
- 招式内联图标。
- 字体、字号、颜色、字重、对齐。
- 内容尺寸自适应。
- PNG 导出。

### 6. 富文本和图标

关键函数：

- `richHtmlToTokens(html)`
- `sanitizeSkillRichText(html)`
- `fitText(ctx, html, x, y, maxWidth, fontSize, align, settings)`
- `getSkillIconMetrics(settings)`
- `measureRichTextMaxLineWidth(ctx, html, settings)`

富文本支持：

- 内联招式图标。
- 换行。
- 上标/下标。
- 下划线/删除线。
- 自动缩放或换行。

后续迁移时，不建议直接复用 contenteditable DOM 编辑器；应优先复用 token 化和 canvas 绘制。

## 建议迁移路线

### 阶段 1：复制素材与定义模型

在本项目新增：

- `src/combo-image/types.ts`
- `src/combo-image/defaultStyle.ts`
- `src/combo-image/iconCatalog.ts`
- `src/combo-image/convertChart.ts`

把 `assets/button-icons`、`assets/capsule-presets` 或必要素材复制到 `public/combo-image/`。

### 阶段 2：抽纯 canvas 渲染器

新增：

- `src/combo-image/render/capsule.ts`
- `src/combo-image/render/layout.ts`
- `src/combo-image/render/richText.ts`
- `src/combo-image/render/draw.ts`

从 `鸣潮自助/index.html` 抽这些纯函数：

- clamp/color/image cache。
- crop/stretch。
- getSkillPlacements。
- drawSkillPlacement。
- fitText。

注意去掉对 DOM id 的依赖，把 settings/state 全部改成参数。

### 阶段 3：替换覆盖层显示

当前 `src/overlay.tsx` 使用 DOM `.combo-chip` 显示。后续可替换为：

- 一个 `<canvas>` 负责绘制连段图。
- 根据 overlay payload 的 `chart` 和 `practice` 生成 `ComboImageDocument`。
- 当前进行中的 step 可传入 renderer 做高亮。
- 移动/框选工具继续沿用当前 overlay window 控制。

### 阶段 4：设置页接入自定义面板

把原项目的编辑能力拆成 React 控件：

- 图标映射设置。
- 胶囊底图选择/上传。
- 头像设置。
- 横排/竖排/flow 布局参数。
- 字体/字号/颜色。
- 预设导入导出。

### 阶段 5：导出与社区

本项目已有连段谱 JSON 导入导出。后续可以扩展为：

```ts
{
  chart: ComboChart,
  imageStyle: ComboImageDocument,
  assets?: embedded data URLs or asset refs
}
```

这样别的用户导入后能同时得到连段谱和漂亮连段图样式。

## 当前覆盖层修复记录

本次已修覆盖层移动问题：

- 拖动过程中只更新覆盖层窗口和本地输入框，不持续回写主窗口状态。
- 鼠标松开时再向主窗口提交最终 bounds。
- 用 `latestBoundsRef` 避免 React 闭包拿到旧 bounds 导致松手回弹。
- 工具框阻止 pointer 事件冒泡，避免点击输入框时触发窗口拖动。
- 工具框固定到覆盖层左上角，提升 z-index。

如果仍有轻微抖动，下一步应考虑节流 `set_overlay_bounds` 调用，或改为使用 Tauri 原生窗口拖动 API。
