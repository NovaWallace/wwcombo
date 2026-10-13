import { strToU8, zipSync } from 'fflate';
import type { ComboChart, ComboStep } from '../combo-core/types';
import { buildOkwwReplayPlan } from './okwwReplay';
import type { OkwwReplayCheckpoint, OkwwReplayPlan } from './okwwReplay';
import { renderTimedOkwwCharacter } from './okwwTimedCodegen';

export type OkwwCharacter = { name: string; english: string; className: string };

// Names and class identifiers are checked against okww's CharFactory; the
// Chinese/English aliases follow okww-axis-converter's MIT-licensed catalog.
export const OKWW_CHARACTERS: OkwwCharacter[] = [
  ['秧秧·玄翎', 'Yangyang: Xuanling', 'YangYangSp'], ['吟霖', 'Yinlin', 'Yinlin'],
  ['维里奈', 'Verina', 'Verina'], ['守岸人', 'Shorekeeper', 'ShoreKeeper'],
  ['穗穗', 'Suisui', 'Suisui'], ['桃祈', 'Taoqi', 'Taoqi'],
  ['漂泊者', 'Rover', 'Rover'], ['安可', 'Encore', 'Encore'],
  ['鉴心', 'Jianxin', 'Jianxin'], ['散华', 'Sanhua', 'Sanhua'],
  ['今汐', 'Jinhsi', 'Jinhsi'], ['渊武', 'Yuanwu', 'Yuanwu'],
  ['长离', 'Changli', 'Changli'], ['炽霞', 'Chixia', 'Chixia'],
  ['丹瑾', 'Danjin', 'Danjin'], ['白芷', 'Baizhi', 'Baizhi'],
  ['卡卡罗', 'Calcharo', 'Calcharo'], ['忌炎', 'Jiyan', 'Jiyan'],
  ['莫特斐', 'Mortefi', 'Mortefi'], ['折枝', 'Zhezhi', 'Zhezhi'],
  ['相里要', 'Xiangli Yao', 'Xiangliyao'], ['椿', 'Camellya', 'Camellya'],
  ['釉瑚', 'Youhu', 'Youhu'], ['珂莱塔', 'Carlotta', 'Carlotta'],
  ['洛可可', 'Roccia', 'Roccia'], ['菲比', 'Phoebe', 'Phoebe'],
  ['布兰特', 'Brant', 'Brant'], ['坎特蕾拉', 'Cantarella', 'Cantarella'],
  ['赞妮', 'Zani', 'Zani'], ['夏空', 'Ciaccona', 'Ciaccona'],
  ['卡提希娅', 'Cartethyia', 'Cartethyia'], ['露帕', 'Lupa', 'Lupa'],
  ['弗洛洛', 'Phrolova', 'Phrolova'], ['奥古斯塔', 'Augusta', 'Augusta'],
  ['尤诺', 'Iuno', 'Iuno'], ['嘉贝莉娜', 'Galbrena', 'Galbrena'],
  ['仇远', 'Qiuyuan', 'Qiuyuan'], ['千咲', 'Chisa', 'Chisa'],
  ['达妮娅', 'Denia', 'Denia'], ['卜灵', 'Buling', 'Douling'],
  ['琳奈', 'Lynae', 'Linnai'], ['莫宁', 'Mornye', 'Mornye'],
  ['爱弥斯', 'Aemeath', 'Aemeath'], ['西格莉卡', 'Sigrika', 'Xigelika'],
  ['陆·赫森', 'Luuk Herssen', 'Luhesi'], ['绯雪', 'Hiyuki', 'Hiyuki'],
  ['洛瑟菈', 'Lucilla', 'Lucilla'], ['露西', 'Lucy', 'Lucy'],
  ['丽贝卡', 'Rebecca', 'Rebecca'], ['清宵', 'Qingxiao', 'Qingxiao'],
  ['心', 'Hsin', 'Hsin']
].map(([name, english, className]) => ({ name, english, className }));

const NAME_ALIASES: Record<string, string> = {
  岁岁: 'Suisui', 坎特雷拉: 'Cantarella', 洛瑟拉: 'Lucilla', 陆赫斯: 'Luhesi',
  漂泊者湮灭: 'Rover', 漂泊者衍射: 'Rover', 漂泊者导电: 'Rover'
};

function normalizedName(name: string): string {
  return name.trim().replace(/[·・\s\-]/g, '').toLowerCase();
}

export function okwwCharacterForName(name: string): OkwwCharacter | undefined {
  const key = normalizedName(name);
  const alias = NAME_ALIASES[key];
  return OKWW_CHARACTERS.find((character) =>
    (alias && character.className === alias) ||
    [character.name, character.english, character.className].some((item) => normalizedName(item) === key)
  );
}

export type OkwwProbeId =
  | 'concerto_full' | 'intro' | 'liberation_ready' | 'resonance_ready'
  | 'echo_ready' | 'forte_full' | 'mouse_forte_full' | 'e_forte_full'
  | 'target_locked' | 'target_long' | 'airborne' | 'buff_estimated' | 'liberation_cast'
  | 'augusta_majesty' | 'augusta_prowess' | 'iuno_heavy' | 'iuno_jump'
  | 'hiyuki_liberation_phase' | 'hiyuki_heavy_ready' | 'hiyuki_execute_prompt'
  | 'break_prompt' | 'break_full' | 'suisui_e_ready' | 'suisui_forte2' | 'suisui_forte3'
  | 'aemeath_e1' | 'aemeath_e2' | 'aemeath_lib2'
  | 'camellya_budding' | 'camellya_ephemeral'
  | 'cartethyia_mid_air' | 'cartethyia_lib_big' | 'cartethyia_sword1' | 'cartethyia_sword2' | 'cartethyia_sword3'
  | 'denia_lib2_end' | 'denia_lib2'
  | 'hsin_lib1' | 'hsin_lib2' | 'hsin_heavy1' | 'hsin_heavy2' | 'hsin_enhanced_e'
  | 'hiyuki_left' | 'hiyuki_right'
  | 'luhesi_kick' | 'lupa_wolf1' | 'lupa_wolf2' | 'lupa_forte_two'
  | 'qingxiao_e' | 'qingxiao_h1' | 'qingxiao_h2'
  | 'phoebe_middle_star' | 'linnai_color_full' | 'xigelika_forte_full'
  | 'zani_nightfall';

export type OkwwProbe = { id: OkwwProbeId; label: string; expression: string; className?: string; estimated?: boolean };

export const OKWW_PROBES: OkwwProbe[] = [
  { id: 'concerto_full', label: '协奏值已满（延奏就绪）', expression: 'self.is_con_full()' },
  { id: 'intro', label: '变奏入场', expression: 'self.has_intro' },
  { id: 'liberation_ready', label: '共鸣解放可用', expression: 'self.liberation_available()' },
  { id: 'resonance_ready', label: '共鸣技能可用', expression: 'self.resonance_available()' },
  { id: 'echo_ready', label: '声骸技能可用', expression: 'self.echo_available()' },
  { id: 'forte_full', label: '共鸣回路已满', expression: 'self.is_forte_full()' },
  { id: 'mouse_forte_full', label: '强化普攻提示', expression: 'self.is_mouse_forte_full()' },
  { id: 'e_forte_full', label: '强化技能提示', expression: 'self.is_e_forte_full()' },
  { id: 'target_locked', label: '目标已锁定', expression: 'self.task.has_target()' },
  { id: 'target_long', label: '目标长动作条', expression: 'bool(self.has_long_action())' },
  { id: 'airborne', label: '空中（控物图标推断）', expression: 'self.flying()', estimated: true },
  { id: 'buff_estimated', label: 'Buff 计时仍有效（估计）', expression: 'self.has_buff()', estimated: true },
  { id: 'liberation_cast', label: '解放图标进入冷却（推断）', expression: 'not self.liberation_available()', estimated: true },
  { id: 'break_prompt', label: '协度破坏处决提示', expression: "bool(self.task.find_one('f_break', box='target_box_short', target_height=720))" },
  { id: 'break_full', label: '协度破坏值已满', expression: "bool(self.task.find_one('f_break_full', threshold=0.92))" },
  { id: 'augusta_majesty', label: '奥古斯塔·第二段解放提示', expression: 'bool(self.check_majesty())', className: 'Augusta' },
  { id: 'augusta_prowess', label: '奥古斯塔·强化重击提示', expression: 'bool(self.check_prowess())', className: 'Augusta' },
  { id: 'iuno_heavy', label: '尤诺·特殊重击提示', expression: 'bool(self.task.find_feature("iuno_heavy", box="box_extra_action", threshold=0.6))', className: 'Iuno' },
  { id: 'iuno_jump', label: '尤诺·起跳提示', expression: 'bool(self.task.find_feature("iuno_jump", box="box_extra_action", threshold=0.6))', className: 'Iuno' },
  { id: 'hiyuki_liberation_phase', label: '绯雪·解放阶段目标框（推断）', expression: 'bool(self.has_long_action2())', className: 'Hiyuki', estimated: true },
  { id: 'hiyuki_heavy_ready', label: '绯雪·解放重击提示', expression: 'bool(self.lib_heavy_available())', className: 'Hiyuki' },
  { id: 'hiyuki_execute_prompt', label: '绯雪·处决提示', expression: 'bool(self.execute_available())', className: 'Hiyuki' },
  { id: 'suisui_e_ready', label: '穗穗·醒春潮可用', expression: "bool(self.task.find_one('suisui_e1', threshold=0.8))", className: 'Suisui' },
  { id: 'suisui_forte2', label: '穗穗·芳菲信达到两格', expression: "bool(self.task.find_one('suisui_forte2', threshold=0.75))", className: 'Suisui' },
  { id: 'suisui_forte3', label: '穗穗·芳菲信满三格', expression: "bool(self.task.find_one('suisui_forte3', threshold=0.75))", className: 'Suisui' },
  { id: 'aemeath_e1', label: '爱弥斯·强化技能一段提示', expression: "bool(self.task.find_one('aemeath_e1', threshold=0.7))", className: 'Aemeath' },
  { id: 'aemeath_e2', label: '爱弥斯·强化技能二段提示', expression: "bool(self.task.find_one('aemeath_e2', threshold=0.7))", className: 'Aemeath' },
  { id: 'aemeath_lib2', label: '爱弥斯·第二段解放提示', expression: 'bool(self.lib2_available())', className: 'Aemeath' },
  { id: 'camellya_budding', label: '椿·盛放状态提示', expression: "bool(self.task.find_one('camellya_budding', threshold=0.7))", className: 'Camellya' },
  { id: 'camellya_ephemeral', label: '椿·瞬刻技能提示', expression: 'bool(self.ephemeral_ready())', className: 'Camellya' },
  { id: 'cartethyia_mid_air', label: '卡提希娅·空中攻击提示', expression: 'bool(self.is_mid_air_attack_available())', className: 'Cartethyia' },
  { id: 'cartethyia_lib_big', label: '卡提希娅·大型解放提示', expression: "bool(self.task.find_one('lib_cartethyia_big', threshold=0.6))", className: 'Cartethyia' },
  { id: 'cartethyia_sword1', label: '卡提希娅·风之剑一层', expression: "bool(self.task.find_one('forte_cartethyia_sword1', threshold=0.9))", className: 'Cartethyia' },
  { id: 'cartethyia_sword2', label: '卡提希娅·风之剑二层', expression: "bool(self.task.find_one('forte_cartethyia_sword2', threshold=0.9))", className: 'Cartethyia' },
  { id: 'cartethyia_sword3', label: '卡提希娅·风之剑三层', expression: "bool(self.task.find_one('forte_cartethyia_sword3', threshold=0.9))", className: 'Cartethyia' },
  { id: 'denia_lib2_end', label: '达妮娅·第二段解放结束提示', expression: "bool(self.task.find_one('denia_end_lib', threshold=0.6))", className: 'Denia' },
  { id: 'denia_lib2', label: '达妮娅·第二段解放提示', expression: "bool(self.task.find_one('denia_lib2', threshold=0.6))", className: 'Denia' },
  { id: 'hsin_lib1', label: '心·第一段解放提示', expression: "bool(self.task.find_one('hsin_lib1', threshold=0.7))", className: 'Hsin' },
  { id: 'hsin_lib2', label: '心·第二段解放提示', expression: "bool(self.task.find_one('hsin_lib2', threshold=0.7))", className: 'Hsin' },
  { id: 'hsin_heavy1', label: '心·第一种强化重击提示', expression: "bool(self.task.find_one('hsin_h1', threshold=0.7))", className: 'Hsin' },
  { id: 'hsin_heavy2', label: '心·第二种强化重击提示', expression: "bool(self.task.find_one('hsin_h2', threshold=0.7))", className: 'Hsin' },
  { id: 'hsin_enhanced_e', label: '心·强化技能提示', expression: 'bool(self.enhanced_e_ready())', className: 'Hsin' },
  { id: 'hiyuki_left', label: '绯雪·左侧居合状态', expression: "bool(self.task.find_one('hiyuki_left', threshold=0.5))", className: 'Hiyuki' },
  { id: 'hiyuki_right', label: '绯雪·右侧居合状态', expression: "bool(self.task.find_one('hiyuki_right', threshold=0.5))", className: 'Hiyuki' },
  { id: 'luhesi_kick', label: '陆·赫森·踢击提示', expression: "bool(self.task.find_one('luhesi_kick', threshold=0.7))", className: 'Luhesi' },
  { id: 'lupa_wolf1', label: '露帕·狼魂一层', expression: "bool(self.task.find_one('lupa_wolf_icon1', threshold=0.85))", className: 'Lupa' },
  { id: 'lupa_wolf2', label: '露帕·狼魂二层', expression: "bool(self.task.find_one('lupa_wolf_icon2', threshold=0.85))", className: 'Lupa' },
  { id: 'lupa_forte_two', label: '露帕·两层回路提示', expression: 'bool(self.judge_forte() == 2)', className: 'Lupa' },
  { id: 'qingxiao_e', label: '清宵·强化技能提示', expression: 'bool(self.enhanced_resonance_available())', className: 'Qingxiao' },
  { id: 'qingxiao_h1', label: '清宵·第一种强化重击提示', expression: "bool(self.task.find_one('qingxiao_h1', threshold=0.7))", className: 'Qingxiao' },
  { id: 'qingxiao_h2', label: '清宵·第二种强化重击提示', expression: "bool(self.task.find_one('qingxiao_h2', threshold=0.7))", className: 'Qingxiao' },
  { id: 'phoebe_middle_star', label: '菲比·中间星提示', expression: 'bool(self.check_middle_star())', className: 'Phoebe' },
  { id: 'linnai_color_full', label: '琳奈·颜色资源已满', expression: 'bool(self.is_color_full())', className: 'Linnai' },
  { id: 'xigelika_forte_full', label: '西格莉卡·回路已满', expression: 'bool(self.is_forte_full())', className: 'Xigelika' },
  { id: 'zani_nightfall', label: '赞妮·夜幕资源提示', expression: 'bool(self.is_nightfall_ready())', className: 'Zani' }
];

export type OkwwRule = {
  id: string;
  stepId: string;
  probe: OkwwProbeId;
  origin?: 'auto' | 'manual';
  behavior: 'skip' | 'wait';
  timeoutMs: number;
  onTimeout: 'skip' | 'continue' | 'switch' | 'branch';
  whileWaiting: 'none' | 'basic_attack';
  maxRetries?: number;
  onExhausted?: 'switch' | 'abort';
  failureTargetStepId?: string;
};

export type OkwwPostCheck = {
  id: string;
  stepId: string;
  probe: OkwwProbeId;
  timeoutMs: number;
  onFailure: 'retry' | 'next_run' | 'abort' | 'branch';
  failureTargetStepId?: string;
};

export type OkwwProject = {
  schemaVersion: 1;
  sourceChartId: string;
  chart: ComboChart;
  sequenceIds?: string[];
  classes: Record<1 | 2 | 3, string>;
  rules: OkwwRule[];
  postChecks?: OkwwPostCheck[];
  replaySettings?: { keyFrequencyMs: number; startDelayMs: number; minSwitchHoldMs?: number; switchFailure?: 'abort' | 'retry'; switchMaxRetries?: number; switchVerifyTimeoutMs?: number };
  author: string;
};

export type OkwwIssue = { level: 'error' | 'warning'; message: string; stepId?: string };
export type OkwwRun = { slot: 1 | 2 | 3; phase: 'startup' | 'loop'; steps: ComboStep[]; sourceStepIds: string[]; nextSlot?: 1 | 2 | 3; switchStepId?: string };
export type OkwwAnalysis = { runs: OkwwRun[]; loopStart: number; issues: OkwwIssue[]; characters: OkwwCharacter[] };

export function orderOkwwStepIds(chart: ComboChart): string[] {
  return chart.steps.map((step, index) => ({ step, index }))
    .sort((a, b) => a.step.startMin - b.step.startMin || Number(Boolean(SWITCH_MOVE.test(b.step.moveId))) - Number(Boolean(SWITCH_MOVE.test(a.step.moveId))) || a.index - b.index)
    .map(({ step }) => step.id);
}

export function alignOkwwChartToOrder(chart: ComboChart, sequenceIds: string[]): ComboChart {
  const times = chart.steps.map((step) => step.startMin).sort((a, b) => a - b);
  const timeById = new Map(sequenceIds.map((id, index) => [id, times[index]]));
  return {
    ...chart,
    updatedAt: Date.now(),
    steps: chart.steps.map((step) => {
      const startMin = timeById.get(step.id);
      if (startMin === undefined || startMin === step.startMin) return step;
      return { ...step, startMin, startMax: startMin + Math.max(0, step.startMax - step.startMin) };
    })
  };
}

export function createOkwwProject(chart: ComboChart, names: Partial<Record<1 | 2 | 3, string>>): OkwwProject {
  const classes = {} as OkwwProject['classes'];
  ([1, 2, 3] as const).forEach((slot) => { classes[slot] = okwwCharacterForName(names[slot] ?? '')?.className ?? ''; });
  const rules: OkwwRule[] = chart.steps.filter((step) => /^switch_[1-3]$/.test(step.moveId) &&
    /^(?:i{1,4}|[1-4])b(?:\[|y|$)/i.test(chart.contentLabels?.[step.id]?.trim() ?? '')).map((step) => ({
      id: `auto-intro-${step.id}`, stepId: step.id, probe: 'concerto_full', origin: 'auto',
      behavior: 'wait', timeoutMs: 1500, onTimeout: 'skip', whileWaiting: 'basic_attack', maxRetries: 3, onExhausted: 'switch'
    }));
  const sequenceIds = orderOkwwStepIds(chart);
  return { schemaVersion: 1, sourceChartId: chart.id, chart: structuredClone(chart), sequenceIds, classes, rules, postChecks: [], replaySettings: { keyFrequencyMs: 100, startDelayMs: 0, minSwitchHoldMs: 0, switchFailure: 'abort', switchMaxRetries: 1, switchVerifyTimeoutMs: 1500 }, author: 'wwcombo' };
}

const CONTROL_MOVES = new Set(['start_challenge', 'stop_recording']);
const SWITCH_MOVE = /^switch_([1-4])$/;
const SUPPORTED_MOVES = new Set([
  'basic_attack', 'heavy_attack', 'skill', 'skill_hold', 'echo', 'echo_hold',
  'liberation', 'liberation_hold', 'dodge', 'dodge_hold', 'jump', 'jump_hold',
  'tool', 'empty_action', 'switch_1', 'switch_2', 'switch_3'
]);

function phaseFor(chart: ComboChart, timeMs: number): OkwwRun['phase'] {
  const period = chart.periods?.find((item) => item.startMs <= timeMs && timeMs < item.endMs);
  return period?.kind === 'startup_axis' ? 'startup' : 'loop';
}

export function analyzeOkwwProject(project: OkwwProject): OkwwAnalysis {
  const issues: OkwwIssue[] = [];
  issues.push({ level: 'warning', message: '按绝对时间回放录制输入；游戏动画、窗口调度或切人识别仍可能造成迟到。' });
  issues.push({ level: 'warning', message: '队伍包会覆盖该队伍的角色动作流程；请在游戏中核对实际按键。' });
  issues.push({ level: 'warning', message: '普攻、普通重击、闪避与跳跃无通用命中确认，只能确认输入已发送。' });
  issues.push({ level: 'warning', message: '导入 OKWW 前请备份同一组三人的已有自定义脚本；队伍包会替换该队伍的代码。' });
  const characters = ([1, 2, 3] as const).map((slot) => {
    const character = OKWW_CHARACTERS.find((item) => item.className === project.classes[slot]);
    if (!character) issues.push({ level: 'error', message: `槽位 ${slot} 尚未绑定 OKWW 角色。` });
    return character;
  }).filter((value): value is OkwwCharacter => Boolean(value));
  if (new Set(characters.map((item) => item.className)).size !== characters.length) {
    issues.push({ level: 'error', message: 'OKWW 队伍必须是三名不同角色。' });
  }
  if (project.rules.some((rule) => rule.origin === 'auto')) {
    issues.push({ level: 'warning', message: '自动识别的变奏标签仅作提示，不会等待协奏而打乱原轴时间。' });
  }
  if (project.rules.some((rule) => rule.origin !== 'auto') || (project.postChecks?.length ?? 0) > 0) {
    issues.push({ level: 'warning', message: '手动视觉判定会暂停时间轴；后续输入按等待耗时整体顺延。' });
  }

  const order = new Map(project.sequenceIds?.map((id, index) => [id, index]) ?? []);
  const steps = project.chart.steps.map((step, index) => ({ step, index }))
    .filter(({ step }) => !CONTROL_MOVES.has(step.moveId))
    .sort((a, b) => order.size && order.has(a.step.id) && order.has(b.step.id)
      ? order.get(a.step.id)! - order.get(b.step.id)!
      : a.step.startMin - b.step.startMin || Number(Boolean(SWITCH_MOVE.test(b.step.moveId))) - Number(Boolean(SWITCH_MOVE.test(a.step.moveId))) || a.index - b.index)
    .map(({ step }) => step);
  const variableTiming = steps.filter((step) => step.startMin !== step.startMax || step.durationMin !== step.durationMax || step.preheatMs || step.recoveryMs);
  if (variableTiming.length) issues.push({ level: 'warning', message: `${variableTiming.length} 个招式含时间范围、预热或后摇；回放采用 startMin 与 durationMax，其他范围仅保存在草稿。` });
  const runs: OkwwRun[] = [];
  let run: OkwwRun | null = null;
  let pendingSlot: number | undefined;
  for (const step of steps) {
    if (step.free) {
      issues.push({ level: 'warning', message: `${step.label || step.moveId} 标记为自由操作，已跳过。`, stepId: step.id });
      continue;
    }
    const switchMatch = SWITCH_MOVE.exec(step.moveId);
    if (switchMatch) {
      const target = Number(switchMatch[1]);
      if (target > 3) issues.push({ level: 'error', message: 'OKWW 队伍只支持三人；轴中存在切到 4 号位。', stepId: step.id });
      if (run) {
        for (const action of run.steps) {
          if (action.startMin + action.durationMax > step.startMin) {
            action.durationMax = Math.max(35, step.startMin - action.startMin);
            issues.push({ level: 'warning', message: `${action.label || action.moveId} 的输入被切人截断。`, stepId: action.id });
          }
        }
        run.nextSlot = target as 1 | 2 | 3; run.switchStepId = step.id; runs.push(run); run = null;
      }
      pendingSlot = target;
      continue;
    }
    const slot = step.characterSlot ?? pendingSlot ?? 1;
    if (slot > 3) { issues.push({ level: 'error', message: '招式位于 4 号角色轨道。', stepId: step.id }); continue; }
    if (pendingSlot && pendingSlot !== slot) issues.push({ level: 'warning', message: '切人目标与下一招的角色轨道不一致，按招式所在轨道处理。', stepId: step.id });
    pendingSlot = undefined;
    if (!SUPPORTED_MOVES.has(step.moveId)) {
      issues.push({ level: 'warning', message: `不支持的招式 ${step.moveId} 已跳过。`, stepId: step.id });
      continue;
    }
    if (step.moveId === 'empty_action' && !/^f$/i.test(project.chart.contentLabels?.[step.id]?.trim() ?? '')) {
      issues.push({ level: 'warning', message: '空招式未转成按键；如需 F 击破请在 OKWW 内手动处理。', stepId: step.id });
      continue;
    }
    if (step.moveId === 'tool') issues.push({ level: 'warning', message: `${step.label || step.moveId} 使用 OKWW 当前的探索工具绑定，需在游戏中核对。`, stepId: step.id });
    const phase = phaseFor(project.chart, step.startMin);
    if (!run || run.slot !== slot || run.phase !== phase) {
      if (run) { run.nextSlot = slot as 1 | 2 | 3; runs.push(run); }
      run = { slot: slot as 1 | 2 | 3, phase, steps: [], sourceStepIds: [] };
    }
    run.sourceStepIds.push(step.id);
    const previous = run.steps[run.steps.length - 1];
    if (previous?.moveId === 'basic_attack' && step.moveId !== 'basic_attack' && previous.startMin + previous.durationMax > step.startMin) {
      previous.durationMax = Math.max(35, step.startMin - previous.startMin);
      issues.push({ level: 'warning', message: '连续普攻在下一招开始时截断；OKWW 无法并行保持普攻脉冲。', stepId: previous.id });
    }
    if (step.moveId === 'basic_attack' && previous?.moveId === step.moveId && previous.lane === step.lane &&
        step.startMin <= previous.startMin + previous.durationMax &&
        !project.rules.some((rule) => rule.stepId === step.id || rule.stepId === previous.id) &&
        !(project.postChecks ?? []).some((check) => check.stepId === step.id || check.stepId === previous.id)) {
      previous.durationMax = Math.max(previous.durationMax, step.startMin + step.durationMax - previous.startMin);
    } else run.steps.push({ ...step });
  }
  if (run) runs.push(run);
  if (!runs.length) issues.push({ level: 'error', message: '没有可转换的招式。' });
  if (!runs.some((item) => item.phase === 'loop')) issues.push({ level: 'warning', message: '没有循环轴；整条连段将作为循环执行。' });
  if (runs.some((item) => item.nextSlot && item.nextSlot !== runs[runs.indexOf(item) + 1]?.slot && runs.indexOf(item) + 1 < runs.length)) {
    issues.push({ level: 'warning', message: '部分切人目标与下一段不一致，按下一段的角色执行。' });
  }
  const routePosition = new Map(steps.map((item, index) => [item.id, index]));
  const validateBranchTarget = (sourceStep: ComboStep, targetStepId: string | undefined, enabled: boolean) => {
    if (!enabled) return;
    const target = targetStepId ? project.chart.steps.find((item) => item.id === targetStepId) : undefined;
    const sourcePosition = routePosition.get(sourceStep.id);
    const targetPosition = target ? routePosition.get(target.id) : undefined;
    if (!target || targetPosition === undefined || sourcePosition === undefined) {
      issues.push({ level: 'error', message: '失败分支必须绑定一个后续招式节点。', stepId: sourceStep.id });
      return;
    }
    if (targetPosition <= sourcePosition || target.startMin <= sourceStep.startMin) {
      issues.push({ level: 'error', message: '失败分支只能跳转到当前节点之后的招式，避免循环或倒放。', stepId: sourceStep.id });
    }
    if (target.free || CONTROL_MOVES.has(target.moveId)) {
      issues.push({ level: 'error', message: '失败分支不能跳转到自由操作或开始/结束控制节点。', stepId: sourceStep.id });
    }
  };
  for (const rule of project.rules) {
    const step = project.chart.steps.find((item) => item.id === rule.stepId);
    const probe = OKWW_PROBES.find((item) => item.id === rule.probe);
    if (!step || !probe || !runs.some((item) => item.steps.some((action) => action.id === rule.stepId) || item.switchStepId === rule.stepId)) {
      issues.push({ level: 'error', message: '一条判定的关联招式或探针已失效。', stepId: rule.stepId }); continue;
    }
    const run = runs.find((item) => item.switchStepId === rule.stepId || item.steps.some((action) => action.id === rule.stepId));
    if (probe.className && probe.className !== project.classes[run?.slot ?? ((step.characterSlot ?? 1) as 1 | 2 | 3)]) {
      issues.push({ level: 'error', message: `${probe.label} 不适用于当前角色。`, stepId: step.id });
    }
    validateBranchTarget(step, rule.failureTargetStepId, rule.onTimeout === 'branch');
  }
  for (const check of project.postChecks ?? []) {
    const run = runs.find((item) => item.steps.some((action) => action.id === check.stepId));
    const probe = OKWW_PROBES.find((item) => item.id === check.probe);
    const step = project.chart.steps.find((item) => item.id === check.stepId);
    if (!run || !probe) {
      issues.push({ level: 'error', message: '执行后确认必须绑定可执行招式与有效状态。', stepId: check.stepId });
    } else if (probe.className && probe.className !== project.classes[run.slot]) {
      issues.push({ level: 'error', message: `${probe.label} 不适用于当前角色。`, stepId: check.stepId });
    }
    if (step && project.chart.steps.some((item) => /^switch_[1-3]$/.test(item.moveId) && item.startMin > step.startMin && item.startMin < step.startMin + step.durationMax)) {
      issues.push({ level: 'warning', message: '执行后确认发生在下一次切人输入之后，可能读到离场角色状态。', stepId: check.stepId });
    }
    if (step) validateBranchTarget(step, check.failureTargetStepId, check.onFailure === 'branch');
  }
  const replay = buildOkwwReplayPlan(project.chart, project.replaySettings?.keyFrequencyMs, project.replaySettings?.minSwitchHoldMs);
  if (replay.skipped) issues.push({ level: 'warning', message: `${replay.skipped} 条输入事件缺少 OKWW 键盘映射，未进入回放。` });
  if (!replay.events.length) issues.push({ level: 'error', message: '没有可回放的输入事件。' });
  return { runs, loopStart: Math.max(0, runs.findIndex((item) => item.phase === 'loop')), issues, characters };
}

export type OkwwExportMetadata = { name?: string; description?: string; author?: string };
export type OkwwPackage = { files: Record<string, string>; bytes: Uint8Array; filename: string; analysis: OkwwAnalysis; replay: OkwwReplayPlan };

const REPLAY_MOVE_CODE: Record<string, string> = {
  basic_attack: 'MouseLeft', heavy_attack: 'MouseLeft', skill: 'KeyE', skill_hold: 'KeyE',
  echo: 'KeyQ', echo_hold: 'KeyQ', liberation: 'KeyR', liberation_hold: 'KeyR',
  dodge: 'ShiftLeft', dodge_hold: 'ShiftLeft', jump: 'Space', jump_hold: 'Space',
  tool: 'KeyT', empty_action: 'KeyF', switch_1: 'Digit1', switch_2: 'Digit2', switch_3: 'Digit3'
};

function replayCheckpoints(project: OkwwProject, analysis: OkwwAnalysis, replay: OkwwReplayPlan): OkwwReplayCheckpoint[] {
  const nextSwitch = (atMs: number) => project.chart.steps.filter((step) => /^switch_[1-3]$/.test(step.moveId) && step.startMin > atMs)
    .reduce((next, step) => Math.min(next, step.startMin), replay.totalMs);
  const dataFor = (stepId: string) => {
    const step = project.chart.steps.find((item) => item.id === stepId)!;
    const run = analysis.runs.find((item) => item.switchStepId === stepId || item.sourceStepIds.includes(stepId))!;
    return { step, run, inputCode: REPLAY_MOVE_CODE[step.moveId] ?? '' };
  };
  const targetTime = (stepId: string | undefined) => stepId
    ? project.chart.steps.find((item) => item.id === stepId)?.startMin ?? -1 : -1;
  const pre = project.rules.filter((rule) => rule.origin !== 'auto').map((rule): OkwwReplayCheckpoint => {
    const { step, run, inputCode } = dataFor(rule.stepId);
    return { atMs: step.startMin, when: 'pre', probe: rule.probe, slot: run.slot, behavior: rule.behavior,
      timeoutMs: rule.timeoutMs, failure: rule.onTimeout === 'skip' && step.moveId.startsWith('switch_')
        ? rule.onExhausted ?? 'abort' : rule.onTimeout,
      whileWaiting: rule.whileWaiting, inputCode, endMs: step.startMin + step.durationMax,
      nextSwitchMs: nextSwitch(step.startMin), maxRetries: Math.max(1, Math.min(6, rule.maxRetries ?? 3)),
      failureTargetMs: targetTime(rule.failureTargetStepId) };
  });
  const post = (project.postChecks ?? []).map((check): OkwwReplayCheckpoint => {
    const { step, run, inputCode } = dataFor(check.stepId);
    return { atMs: step.startMin + step.durationMax, when: 'post', probe: check.probe, slot: run.slot,
      behavior: 'wait', timeoutMs: check.timeoutMs, failure: check.onFailure, whileWaiting: 'none',
      inputCode, endMs: step.startMin + step.durationMax, nextSwitchMs: nextSwitch(step.startMin + step.durationMax),
      maxRetries: 3, failureTargetMs: targetTime(check.failureTargetStepId) };
  });
  return [...pre, ...post];
}

export function generateOkwwPackage(project: OkwwProject, metadata: OkwwExportMetadata = {}): OkwwPackage {
  const analysis = analyzeOkwwProject(project);
  if (analysis.issues.some((issue) => issue.level === 'error')) throw new Error(analysis.issues.filter((issue) => issue.level === 'error').map((issue) => issue.message).join(' '));
  const replay = buildOkwwReplayPlan(project.chart, project.replaySettings?.keyFrequencyMs, project.replaySettings?.minSwitchHoldMs);
  if (!replay.events.length) throw new Error('没有可回放的输入事件。');
  const checkpoints = replayCheckpoints(project, analysis, replay);
  const characters = [...analysis.characters].sort((a, b) => a.english.toLowerCase() < b.english.toLowerCase() ? -1 : 1);
  const manifest = {
    name: metadata.name?.trim() || project.chart.title.trim() || 'wwcombo rotation',
    description: metadata.description?.trim() || 'Timed wwcombo input replay (v5 branches, no catch-up). Game animation and OS scheduling may cause drift.',
    author: metadata.author?.trim() || project.author.trim() || 'wwcombo',
    version: '5',
    team: characters.map((item) => item.english).join(', ')
  };
  const files: Record<string, string> = { 'team.json': JSON.stringify(manifest, null, 2) + '\n' };
  for (const character of characters) files[`${character.className}.py`] = renderTimedOkwwCharacter(character, project, replay, checkpoints, OKWW_PROBES);
  const bytes = zipSync(Object.fromEntries(Object.entries(files).map(([name, content]) => [name, strToU8(content)])), { level: 6 });
  const safeTitle = (project.chart.title.trim() || 'wwcombo').replace(/[\\/:*?"<>|]/g, '_').slice(0, 75);
  return { files, bytes, filename: `${safeTitle}-okww.zip`, analysis, replay };
}
