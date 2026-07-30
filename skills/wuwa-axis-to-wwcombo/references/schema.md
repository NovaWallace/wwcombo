# 鸣潮文字轴 → wwcombo chart JSON 参考规范

本文件供 `wuwa-axis-to-wwcombo` skill 的 LLM 在解析文字轴时使用。所有结论基于对 wwcombo 仓库 `combo-core/defaults.ts`（`DEFAULT_MOVES` / `DEFAULT_BINDINGS`）与 `combo-core/practice.ts`（`free` 步跳过判定）的实测核对。

---

## 一、文字轴的典型特征（必须靠 LLM 理解，无法正则硬切）

1. **角色前缀连写**：`秧E` = 角色"秧"的技能步，前缀与招式缩写之间无分隔符。
2. **无分隔缩写串**：`EZREFW` = 连续多个招式（技能→重击→共鸣解放→声骸→处决→移动）。
3. **中文括号注释**：`（方向键，往前走一步）`、`（满协奏切人）` 是旁注，不是招式。
4. **段数表示（绝对段数，不延续上文）**：`a` 后跟的数字串，**每一位都是一次独立的普攻输入**，label 为 `普攻(N段)`，N 即该数字本身。**数字串是绝对段数，与前面打到第几段无关**——例如 `a1234` = 第1、2、3、4下平a（拆成 4 步），`a234` = 第2、3、4下（3 步），`a123` = 第1、2、3下（3 步），`a34` = 第3、4下（2 步）。**常见错误**：把 `a1234` 当成"接着上一段继续"只补第4下；这是错的，必须完整拆 1~4 下。`aaa`（无数字）= 3 个普通 `普攻` 步（label 不带段数）。只有在轴里明确写成"a234连打/长按"等合并语义时才保留为一步。
5. **分段标记**：`启动：` / `循环：` / `启动轴` / `循环轴` 把轴分成多段（对应 chart 的 periods）。
6. **切人标记**：`变奏X`（X=角色名）= 切换操作角色，后续步归属 X。

---

## 二、moveId 字典（最终可生成，必须属于此集合）

来源 `combo-core/defaults.ts`（与 `DEFAULT_MOVES` / `DEFAULT_BINDINGS` 对齐），并追加本 skill 自定义的 move（见末尾 ⭐）。**转换器实际产出集合如下**：

| moveId | 含义 | 默认按键 | 备注 |
|--------|------|----------|------|
| start_challenge | 开始 | F | 触发器，轴内一般省略 |
| stop_recording | 结束记录 | Esc | 触发器 |
| basic_attack | 普攻 | 鼠标左键 | 含段数、下落攻击都归此 |
| heavy_attack | 重击 | 鼠标左键长按 | Z |
| skill | 技能 | E | |
| skill_hold | 长按技能 | E长按 | 长按 E 用此 |
| echo | 声骸 | Q | |
| echo_hold | 长按声骸 | Q长按 | |
| liberation | 共鸣解放 | R | 大招 |
| liberation_hold | 长按共鸣解放 | R长按 | |
| dodge | 闪避 | Shift / 鼠标右键 | |
| dodge_hold | 长按闪避 | Shift长按 | |
| jump | 跳跃 | 空格 | |
| jump_hold | 长按跳跃 | 空格长按 | |
| switch_1 / switch_2 / switch_3 | 切人 1/2/3 | 1/2/3 | 本规则不生成（见边界项） |
| **move** ⭐自定义 | 移动/走位 | 无 | 自由步 `free:true`，练习跳过判定 |

> 仓库没有处决技 F、`walk`/`movement`（移动）的原生招式。处决按规则忽略；移动用上面自定义的 `move`（free 步）。

---

## 三、社区缩写 → moveId 映射（LLM 解析用）

| 文字轴写法 | moveId | 说明 |
|-----------|--------|------|
| A / 平A / 普攻 / a / a234 / 下落a / 空中a | basic_attack | 段数写进 label |
| Z / 重击 / 重A | heavy_attack | |
| E / 技能 / 共鸣技能 | skill | 点按 |
| E长按 / 长按E / 蓄力E | skill_hold | |
| Q / 声骸 / 共鸣 | echo | |
| Q长按 / 长按Q | echo_hold | |
| R / 大招 / 共鸣解放 | liberation | |
| R长按 | liberation_hold | |
| 闪避 / 平闪 / 空中闪避 | dodge | ；长按闪避→`dodge_hold` |
| 跳 / 跳跃 | jump | 罕见 |
| F / 处决技 | **忽略** | 见边界项 |
| W / 方向键 / 走位 / 往前一步 | **move（free 步）** | 见边界项 |
| 变奏X / 协奏X / 切X | 仅切 characterSlot | 不生成步 |

*注意：社区轴缩写会有细微差别。结合游戏默认键位（E=技能/Z=重击/R=大招/Q=声骸/A=普攻）优先，歧义时按上下文判断，并在 label 标注原字。

---

## 四、边界项处理规则（已与用户确认）

1. **处决技(F) → 忽略**：仓库无 execute 招式，直接从轴中丢弃，不生成步。
2. **移动/走位(W/方向键) → free 自由步**：`moveId='move'`, `free=true`。练习模式（`practice.ts` 中 `!step.free` 才参与判定）会跳过输入要求，但连段图仍显示"移动"。label 写"移动"或保留原注释（如"移动(往前一步)"）。
3. **下落攻击 → basic_attack**：仓库无下落攻击招式，归入普攻，label 注明"普攻(下落)"。
4. **长按 vs 点按**：带"长按/蓄力"字样的用 `_hold` 版本；否则用点按版本。
5. **切人（变奏X）→ 仅切 characterSlot**：后续步的 `characterSlot` 改为该角色对应槽位，**不**额外生成 `switch_1/2/3` 步（用户选择：切人只换槽位，练习时不要求按切人键）。

---

## 五、角色名 → characterSlot 映射

`characterSlot` 取值 1/2/3。文字轴用角色名前缀。规则：
- 能确认真实槽位时按确认值；
- 无法确认时，按轴内**出场顺序**暂定 1/2/3，并在交付时明确标注"槽位为按出场顺序假设，请按实际队伍调整"。
- 解析时维护一个 `角色名→slot` 映射表贯穿整个轴（变奏切人即查此表）。

---

## 六、时间戳估算策略

文字轴不含毫秒。用等间隔估算（见 `convert_axis.cjs`）：

- **严格顺序、零重叠（核心约束）**：每个 step 的时间窗必须与上一步首尾相接——下一个 step 的 `startMin` 必须 ≥ 上一个 step 的结束（`startMax + durationMax`），**禁止相邻步重叠**。否则练习模式下会出现「上一个动作还没打完、下一个就开始提示」的混乱。
  - 普通步：`startMax = startMin + 200`，`durationMin/Max = 120/300`，本步最晚结束 `startMax + 300`；下一步 `startMin` 从该结束时间起算（gap=0，紧接）。
  - free 步（移动）：`startMax = startMin + 150`，`durationMin/Max = 80/250`。
  - 跨段（segment）也首尾相接：循环段从启动段末步的结束时间开始。
- 每段（segment）生成对应 period（首段 `startup_axis`，其余 `loop_axis`），period 的 `endMs = 段尾 step 的 startMax + durationMax`。

> 说明：估算时间仅用于练习模式能正常铺轴；精度不足时，用户在 wwcombo 内用录制或拖拽微调即可。真实录制的招式之间存在取消窗口（步与步会重叠），但文字轴练习谱要求顺序衔接、不重叠。

---

## 七、中间表示格式（LLM 的输出，喂给 convert_axis.cjs）

```json
{
  "title": "轴标题",
  "character": "爱弥斯 / 千咲 / 达妮娅",
  "tags": ["进阶"],
  "segments": [
    {
      "label": "启动轴",
      "steps": [ [slot, "moveId", "label", free?], ... ]
    },
    {
      "label": "循环轴",
      "steps": [ ... ]
    }
  ]
}
```
- step 元素：`[characterSlot:int, moveId:string, label:string, free?:bool]`
- `free` 仅移动步为 `true`。
- `character` 字段：**只写真实角色名**，按槽位 1/2/3 顺序用 ` / ` 分隔（如 `爱弥斯 / 千咲 / 达妮娅`）。**禁止写括号昵称**（昵称只是 LLM 解析线索，解析完只留真名，详见 `references/nicknames.md`）。
- `convert_axis.cjs` 会自动从 `character` 生成现代匹配字段 `chart.community.characters`（字符串数组，按槽位顺序），无需手写。

---

## 八、最终 chart JSON schema（convert_axis.cjs 产出，供核对）

顶层：
```
{
  "type": "wwcombo-chart",
  "version": 3,
  "chart": {
    "id": string, "title": string, "character": string, "tags": string[],
    "version": 1, "createdAt": number, "updatedAt": number,
    "startTriggerMoveId": "start_challenge", "stopTriggerMoveId": "stop_recording",
    "steps": [ ComboStep, ... ],
    "periods": [ { id, kind: "startup_axis"|"loop_axis", label, startMs, endMs }, ... ]
  },
  "moves": [ MoveDefinition, ... ],   // 含上面 18 项
  "bindings": [ { moveId, inputs:[{code,label}] }, ... ]
}
```
ComboStep 关键字段（脚本自动填）：`id, moveId, label, characterSlot, lane:'main', independent, startMin, startMax, durationMin, durationMax, preheatMs, recoveryMs, color, advancesStep, samples[], free`。

---

## 九、Few-shot 示例

见 `references/example_yangsuiqian.json` —— 一份「秧穗千轮椅轴」（启动+循环两段）对应的已验证中间表示。转换后产出 67 步（处决已忽略，移动为 free 步），可被 wwcombo 正常导入。
