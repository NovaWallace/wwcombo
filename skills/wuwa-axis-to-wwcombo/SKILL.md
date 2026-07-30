---
name: wuwa-axis-to-wwcombo
description: This skill converts Wuthering Waves (鸣潮) community text-based combo axes into valid wwcombo chart JSON. Use it when the user pastes or shares a highly unstructured Chinese text axis (e.g. "秧E，穗a234E下落a，千aEa3…变奏千QRE…EZREFW（方向键，往前走一步）EZ") and wants it turned into an importable wwcombo .wwcombo.json file, or asks to "convert a 鸣潮 axis / 轮椅轴 / 连招文字轴 into JSON". The skill parses the axis into a structured intermediate representation via LLM, then runs a bundled Node script to emit a legal wwcombo-chart (version 3) JSON.
---

# 鸣潮文字轴 → wwcombo JSON 转换器

## Overview

把社区里流传的鸣潮连段"文字轴"（B 站 / 库街区）转换成 wwcombo 连段训练器能直接导入的 chart JSON。

文字轴高度非结构化（角色前缀连写、无分隔缩写串、中文括号注释、`a234` 段数表示、`变奏X` 切人），必须先由 LLM 理解成结构化"中间表示"，再用 `scripts/convert_axis.cjs` 生成合法 JSON 并校验。

## Workflow

### Step 1 — 解析文字轴为中间表示
阅读用户提供的文字轴，按 `references/schema.md` 的规则拆成中间表示 JSON：
- 按"启动 / 循环"等标记分段（segments）。
- 每段内按角色前缀 + 缩写 token 拆解成 step 数组。
- 每个 step = `[characterSlot, moveId, label, free?]`。
- **段数展开**：`a234` / `a123` / `a4` / `aaa` 等段数标记要拆成独立的 `basic_attack` 步，每步一输入、带段数 label（如 `普攻(2段)`），不能只合并成一步。
- 严格遵循边界项处理规则（处决忽略、移动 free、下落→普攻、长按标注、变奏仅切槽位）。
- **昵称→角色解析**：轴里单字/缩写角色名（爱/千/达/秧/穗…）必须解析成项目真实角色全名，依据见 `references/nicknames.md`。**不写括号昵称**，解析到的真实名按槽位 1/2/3 用 ` / ` 分隔写入 `character`（如 `爱弥斯 / 千咲 / 达妮娅`）。
- **槽位**：按轴内角色出场顺序暂定 1/2/3；交付时标注"槽位按出场顺序假设，请按实际队伍调整"。

### Step 2 — 校验中间表示
确认每个 step 的 `moveId` 都属于 `references/schema.md` 的 moveId 字典；`free` 步只能是 `move`（移动）。把中间表示写成临时 `.json` 文件。

### Step 3 — 运行转换脚本
```
node scripts/convert_axis.cjs <intermediate.json> <output.json>
```
脚本生成合法 `wwcombo-chart` JSON，并打印步数与 moveId 分布。

### Step 4 — 交付
把生成的 `.wwcombo.json` 交给用户（可直接在 wwcombo 内导入）。

## 关键规则（详见 references/schema.md）
- 处决技(F)：**忽略**，不生成步。
- 移动/走位(W/方向键)：生成 `free` 自由步（`moveId=move, free:true`），练习模式跳过判定。
- 下落攻击：归入 `basic_attack`。
- 长按：技能长按→`skill_hold`、声骸长按→`echo_hold`、共鸣解放长按→`liberation_hold`；点按用不带 `_hold` 的版本。
- 切人（变奏X）：仅切换后续步的 `characterSlot`，不生成独立 `switch` 步。

## Resources
- `scripts/convert_axis.cjs` — 通用转换脚本（中间表示 → chart JSON），含完整 moveId 字典与时间戳估算。
- `references/schema.md` — 完整 moveId 字典、社区缩写映射、边界项规则、角色映射、时间戳策略、chart JSON schema。
- `references/example_yangsuiqian.json` — few-shot：一份「秧穗千轮椅轴」文字轴对应的已验证中间表示（启动+循环两段，67 步，处决已忽略、移动为 free 步）。
