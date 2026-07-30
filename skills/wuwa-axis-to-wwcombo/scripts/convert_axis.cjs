#!/usr/bin/env node
// 鸣潮文字轴 -> wwcombo chart JSON 转换器（通用版）
// 输入：中间表示 JSON（由 LLM 从文字轴解析得到，见 references/schema.md）
// 输出：合法 wwcombo-chart (version 3) JSON，可直接被 wwcombo 导入
//
// 用法: node convert_axis.cjs <intermediate.json> <output.json>
//
// 中间表示格式：
// {
//   "title": "轴标题",
//   "character": "爱弥斯 / 千咲 / 达妮娅",   // ⚠️ 只写真实角色名，按槽位1/2/3顺序；昵称(如"爱")由 LLM 解析阶段解析，不要写进数据
//   "tags": ["进阶"],
//   "segments": [
//     { "label": "启动轴", "steps": [ [slot, moveId, label, free?], ... ] },
//     { "label": "循环轴", "steps": [ ... ] }
//   ]
// }
//   step 元素: [characterSlot:int, moveId:string, label:string, free?:bool]
//   - characterSlot: 1/2/3（由 LLM 按角色名映射）
//   - moveId: 必须是下方 MOVES 中的 id
//   - free: true 表示该步为"自由步"（移动/走位），练习模式跳过判定

const fs = require('fs');

// 招式字典（与 wwcombo combo-core/defaults.ts 对齐；追加自定义 move 见末尾）
const MOVES = [
  { id: 'start_challenge', label: '开始', color: '#f5c542', independent: false, priority: 100, advancesStep: false },
  { id: 'stop_recording', label: '结束记录', color: '#d7dee8', independent: false, priority: 100, advancesStep: false },
  { id: 'basic_attack', label: '普攻', color: '#7fd1ae', independent: false, priority: 10, advancesStep: false },
  { id: 'heavy_attack', label: '重击', color: '#62b6cb', independent: false, priority: 45, advancesStep: true },
  { id: 'skill', label: '技能', color: '#6c8cff', independent: false, priority: 60, advancesStep: true },
  { id: 'skill_hold', label: '长按技能', color: '#8aa2ff', independent: false, priority: 61, advancesStep: true },
  { id: 'echo', label: '声骸', color: '#b983ff', independent: false, priority: 55, advancesStep: true },
  { id: 'echo_hold', label: '长按声骸', color: '#c9a0ff', independent: false, priority: 56, advancesStep: true },
  { id: 'liberation', label: '共鸣解放', color: '#ff6b6b', independent: false, priority: 70, advancesStep: true },
  { id: 'liberation_hold', label: '长按共鸣解放', color: '#ff8e8e', independent: false, priority: 71, advancesStep: true },
  { id: 'dodge', label: '闪避', color: '#f8961e', independent: false, priority: 50, advancesStep: true },
  { id: 'dodge_hold', label: '长按闪避', color: '#ffad4a', independent: false, priority: 51, advancesStep: true },
  { id: 'jump', label: '跳跃', color: '#90be6d', independent: false, priority: 40, advancesStep: true },
  { id: 'jump_hold', label: '长按跳跃', color: '#a7d68a', independent: false, priority: 41, advancesStep: true },
  { id: 'switch_1', label: '1', color: '#43aa8b', independent: false, priority: 65, advancesStep: true },
  { id: 'switch_2', label: '2', color: '#4d908e', independent: false, priority: 65, advancesStep: true },
  { id: 'switch_3', label: '3', color: '#577590', independent: false, priority: 65, advancesStep: true },
  // 自定义：文字轴常见但 repo 无对应"判定招式"的项
  { id: 'move', label: '移动', color: '#999999', independent: false, priority: 1, advancesStep: false, free: true },
];
const moveById = Object.fromEntries(MOVES.map(m => [m.id, m]));

// 默认按键绑定（仅用于生成 bindings 数组；移动无标准按键 → inputs 为空）
const DEFAULT_BINDINGS = {
  start_challenge: 'KeyF', stop_recording: 'Escape', basic_attack: 'MouseLeft',
  heavy_attack: 'MouseLeftHold', skill: 'KeyE', skill_hold: 'KeyEHold', echo: 'KeyQ',
  echo_hold: 'KeyQHold',   liberation: 'KeyR', liberation_hold: 'KeyRHold', dodge: 'ShiftLeft', dodge_hold: 'ShiftLeftHold',
  jump: 'Space', jump_hold: 'SpaceHold', switch_1: 'Digit1', switch_2: 'Digit2', switch_3: 'Digit3',
};
function buildBindings() {
  return MOVES.map(m => ({
    moveId: m.id,
    inputs: m.id === 'move'
      ? []
      : [{ code: DEFAULT_BINDINGS[m.id], label: DEFAULT_BINDINGS[m.id]
          .replace('Key', '').replace('MouseLeft', '鼠标左键').replace('ShiftLeft', '左Shift')
          .replace('MouseLeftHold', '鼠标左键长按').replace('ShiftLeftHold', '左Shift长按') }],
  }));
}

// 把中间表示的 character 字段解析成「干净的真实角色名数组」。
// 支持多种分隔符（/ , ， 、 |），并剥离 LLM 误带入的括号昵称（如 "爱弥斯(爱)" → "爱弥斯"）。
// 顺序即对应槽位 1 / 2 / 3（与 wwcombo chartCharacterAssignments 的映射规则一致）。
function parseCharacterNames(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/\s*(?:\/|,|，|、|\|)\s*/)
    .map(s => s.replace(/[（(][^()]*[）)]/g, '').trim()) // 去掉括号昵称
    .map(s => s.replace(/\s*\(.*\)\s*$/, '').trim())      // 兜底：去残余英文括号
    .filter(Boolean);
}

// 时间戳估算（文字轴无毫秒，按经验给每步时间窗）
// 关键约束：每个 step 必须「严格顺序衔接」——下一个 step 的 startMin 必须 ≥ 上一个 step 的结束
// (startMax + durationMax)，禁止相邻步重叠。否则练习模式下会出现「上一个动作还没打完、下一个就开始提示」的混乱。
function buildSteps(raw, offset, timeBase = 0) {
  const steps = [];
  let cursor = timeBase; // 每段从各自的时间基准开始累加（跨段不重叠）
  raw.forEach(([slot, moveId, label, free], i) => {
    const mv = moveById[moveId];
    if (!mv) throw new Error('未知 moveId: ' + moveId + ' @step ' + (offset + i) + '（请检查缩写映射，moveId 必须属于 MOVES 字典）');
    const startMin = Math.round(cursor);
    const startMax = free ? startMin + 150 : startMin + 200;
    const durationMin = free ? 80 : 120;
    const durationMax = free ? 250 : 300;
    const durMid = (durationMin + durationMax) / 2;
    const endMs = startMax + durationMax; // 本步最晚结束时间
    steps.push({
      id: String(steps.length + 1 + offset),
      moveId, label, characterSlot: slot,
      lane: 'main', independent: !!mv.independent,
      startMin, startMax, durationMin, durationMax,
      preheatMs: 0, recoveryMs: 0,
      color: mv.color, advancesStep: !!mv.advancesStep,
      samples: [{ recordingId: 'initial', startTime: startMin, duration: durMid }],
      free: !!free,
    });
    cursor = endMs; // 下一步必须在本步结束后才开始（严格顺序、不重叠）
  });
  return steps;
}

function main() {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) {
    console.error('用法: node convert_axis.cjs <intermediate.json> <output.json>');
    process.exit(1);
  }
  const spec = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const segments = spec.segments && spec.segments.length
    ? spec.segments
    : [{ label: spec.title || '轴', steps: spec.steps || [] }];

  const allSteps = [];
  const periods = [];
  let offset = 0;
  let segStartMs = 0;
  segments.forEach((seg, idx) => {
    const segSteps = buildSteps(seg.steps || [], offset, segStartMs);
    if (segSteps.length === 0) return;
    const startMs = segStartMs;
    const lastStep = segSteps[segSteps.length - 1];
    const endMs = lastStep.startMax + lastStep.durationMax; // 段尾 step 完整结束时间（含 duration）
    periods.push({
      id: 'seg_' + idx,
      kind: idx === 0 ? 'startup_axis' : 'loop_axis',
      label: seg.label || ('段' + (idx + 1)),
      startMs, endMs,
    });
    allSteps.push(...segSteps);
    offset += segSteps.length;
    segStartMs = endMs; // 下一段必须在本段结束后才开始
  });

  const charNames = parseCharacterNames(spec.character);
  const communityRounds = periods.filter(p => p.kind === 'loop_axis').length + 1;

  const chart = {
    id: 'axis-' + Date.now(),
    title: spec.title || '鸣潮连段轴',
    character: charNames.join(' / '),
    tags: spec.tags || ['进阶'],
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    startTriggerMoveId: 'start_challenge',
    stopTriggerMoveId: 'stop_recording',
    steps: allSteps,
    periods,
    // 现代匹配字段：角色名数组，按槽位 1/2/3 顺序；wwcombo 优先读这个（见 chartCharacterAssignments）
    community: {
      id: 'wwc_' + require('crypto').randomUUID(),
      name: spec.title || '鸣潮连段轴',
      tags: spec.tags || ['进阶'],
      description: '',
      characters: charNames,
      rounds: communityRounds,
      link: '',
      wheelchairEligible: false,
      exportedAt: Date.now(),
    },
  };
  const out = { type: 'wwcombo-chart', version: 3, chart, moves: MOVES, bindings: buildBindings() };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  JSON.parse(fs.readFileSync(outPath, 'utf8')); // 校验合法 JSON
  console.log('OK: ' + allSteps.length + ' steps -> ' + outPath);
  console.log('moveId 分布:', JSON.stringify(allSteps.reduce((a, s) => (a[s.moveId] = (a[s.moveId] || 0) + 1, a), {})));
}

main();
