import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Clipboard, Copy, Diamond, Download, Plus, Redo2, Save, Scissors, Settings, Trash2, TriangleAlert, Undo2, Wrench, X } from 'lucide-react';
import type { ComboImageStyle, ComboStep, MoveDefinition } from '../combo-core/types';
import { comboTextParts, defaultComboContentLabelForMoveId, effectiveIconMappings } from './combo-image/comboImage';
import { useI18n } from './i18n';
import {
  analyzeOkwwProject, generateOkwwPackage, OKWW_CHARACTERS, OKWW_PROBES,
  type OkwwPostCheck, type OkwwProject, type OkwwRule
} from './okwwExport';

type Props = {
  project: OkwwProject;
  timeline: ReactNode;
  style: ComboImageStyle;
  moves: MoveDefinition[];
  avatarPresets: Array<{ name: string; src: string }>;
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  onClassChange: (slot: 1 | 2 | 3, className: string) => void;
  onAuthorChange: (author: string) => void;
  onAddRule: (step: ComboStep) => void;
  onRuleChange: (id: string, patch: Partial<OkwwRule>) => void;
  onRemoveRule: (id: string) => void;
  onAddPostCheck: (step: ComboStep) => void;
  onPostCheckChange: (id: string, patch: Partial<OkwwPostCheck>) => void;
  onRemovePostCheck: (id: string) => void;
  onReplaySettingsChange: (patch: Partial<NonNullable<OkwwProject['replaySettings']>>) => void;
  onInsertStep: (anchorId: string, moveId: string, template?: ComboStep, copiedContentLabel?: string) => void;
  onChangeMove: (stepId: string, moveId: string) => void;
  onMoveStep: (stepId: string, direction: -1 | 1) => void;
  onDeleteStep: (stepId: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  onExport: () => void;
  onExit: () => void;
  exporting: boolean;
};

export function OkwwExportPanel({ project, timeline, style, moves, avatarPresets, selectedStepId, onSelectStep, onClassChange, onAuthorChange, onAddRule, onRuleChange, onRemoveRule, onAddPostCheck, onPostCheckChange, onRemovePostCheck, onReplaySettingsChange, onInsertStep, onChangeMove, onMoveStep, onDeleteStep, onUndo, onRedo, canUndo, canRedo, onSave, onExport, onExit, exporting }: Props) {
  const { text } = useI18n();
  const [view, setView] = useState<'flow' | 'timeline' | 'code'>('flow');
  const [codeClass, setCodeClass] = useState<string>('');
  const [toolGroup, setToolGroup] = useState<'add' | 'modify' | 'edit' | null>(null);
  const [pressMode, setPressMode] = useState<'tap' | 'hold'>('tap');
  const [copiedStep, setCopiedStep] = useState<{ step: ComboStep; contentLabel?: string } | null>(null);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [rolePickerSlot, setRolePickerSlot] = useState<1 | 2 | 3 | null>(null);
  const [inspectorHint, setInspectorHint] = useState<'rule' | 'post' | null>(null);
  const analysis = useMemo(() => analyzeOkwwProject(project), [project]);
  const packagePreview = useMemo(() => {
    if (analysis.issues.some((issue) => issue.level === 'error')) return null;
    try { return generateOkwwPackage(project); } catch { return null; }
  }, [analysis, project]);
  const orderedSteps = useMemo(() => {
    const order = new Map(project.sequenceIds?.map((id, index) => [id, index]) ?? []);
    return [...project.chart.steps].filter((step) => !['start_challenge', 'stop_recording'].includes(step.moveId))
      .sort((a, b) => order.size ? (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity) : a.startMin - b.startMin || a.id.localeCompare(b.id));
  }, [project.chart.steps, project.sequenceIds]);
  const selectedStep = orderedSteps.find((step) => step.id === selectedStepId) ?? null;
  const selectedOrderIndex = selectedStep ? orderedSteps.findIndex((step) => step.id === selectedStep.id) : -1;
  const branchTargets = selectedOrderIndex >= 0 ? orderedSteps.slice(selectedOrderIndex + 1) : [];
  const selectedRun = analysis.runs.find((run) => run.switchStepId === selectedStepId || run.sourceStepIds.includes(selectedStepId ?? ''));
  const selectedClass = project.classes[selectedRun?.slot ?? ((selectedStep?.characterSlot ?? 1) as 1 | 2 | 3)];
  const probes = OKWW_PROBES.filter((probe) => !probe.className || probe.className === selectedClass);
  const rules = project.rules.filter((rule) => rule.stepId === selectedStepId);
  const postChecks = (project.postChecks ?? []).filter((check) => check.stepId === selectedStepId);
  const roleAvatar = (className: string) => {
    const character = OKWW_CHARACTERS.find((item) => item.className === className);
    return avatarPresets.find((preset) => preset.name.trim() === character?.name)?.src;
  };
  const errors = analysis.issues.filter((issue) => issue.level === 'error');
  const warnings = analysis.issues.filter((issue) => issue.level === 'warning');
  const groupedIssues = useMemo(() => {
    const groups = new Map<string, { issue: typeof analysis.issues[number]; count: number }>();
    for (const issue of analysis.issues) {
      const key = `${issue.level}:${issue.message}`;
      const previous = groups.get(key);
      groups.set(key, previous ? { ...previous, count: previous.count + 1 } : { issue, count: 1 });
    }
    return [...groups.values()].sort((a, b) => a.issue.level === b.issue.level ? 0 : a.issue.level === 'error' ? -1 : 1);
  }, [analysis]);
  const displayedCodeClass = packagePreview?.files[`${codeClass}.py`] ? codeClass : packagePreview?.analysis.characters[0]?.className;
  const editableMoves = moves.filter((move) => ['basic_attack', 'heavy_attack', 'skill', 'skill_hold', 'echo', 'echo_hold', 'liberation', 'liberation_hold', 'dodge', 'dodge_hold', 'jump', 'jump_hold', 'tool', 'empty_action', 'switch_1', 'switch_2', 'switch_3'].includes(move.id));
  const selectedPosition = selectedRun?.sourceStepIds.indexOf(selectedStepId ?? '') ?? -1;
  const toolbarMoves = (pressMode === 'tap'
    ? [['basic_attack', 'A'], ['skill', 'E'], ['echo', 'Q'], ['liberation', 'R'], ['dodge', 'D'], ['jump', 'J'], ['tool', 'T'], ['empty_action', 'F']]
    : [['heavy_attack', 'Z'], ['skill_hold', 'E'], ['echo_hold', 'Q'], ['liberation_hold', 'R'], ['dodge_hold', 'D'], ['jump_hold', 'J'], ['tool', 'T'], ['empty_action', 'F']]
  ).concat([['switch_1', '1'], ['switch_2', '2'], ['switch_3', '3']]);

  const renderFlowStep = (step: ComboStep, slot: 1 | 2 | 3) => {
    const roleStyle = style.roleStyles[slot];
    const content = project.chart.contentLabels?.[step.id]?.trim() || defaultComboContentLabelForMoveId(step.moveId) || step.label;
    const parts = comboTextParts(content, style.convertIcons, effectiveIconMappings(style, slot));
    const ruleCount = project.rules.filter((rule) => rule.stepId === step.id).length + (project.postChecks ?? []).filter((check) => check.stepId === step.id).length;
    return <button key={step.id} type="button" className={`combo-preview-chip okww-flow-chip ${selectedStepId === step.id ? 'selected' : ''} ${step.moveId.startsWith('switch_') ? 'is-switch' : ''}`} style={{ '--move-color': roleStyle.color } as CSSProperties} title={step.label} onClick={() => onSelectStep(step.id)}><span className="okww-flow-input">{parts.map((part, index) => part.kind === 'icon' ? <img key={`${part.iconId}-${index}`} src={part.src} alt={part.label} /> : <span key={`text-${index}`}>{part.value}</span>)}</span><strong>{step.label}</strong>{ruleCount > 0 && <em title={text(`${ruleCount} 条判定`, `${ruleCount} checks`)}><Diamond size={10} fill="currentColor" />{ruleCount > 1 ? ruleCount : ''}</em>}</button>;
  };

  return <section className="okww-export-page" data-trainer-capture-suspend="true">
    <header className="okww-export-header">
      <div className="okww-export-heading">
        <button className="icon-button" type="button" title={text('返回连段列表', 'Back to combo library')} aria-label={text('返回连段列表', 'Back to combo library')} onClick={onExit}><ArrowLeft size={18} /></button>
        <div className="okww-export-title"><h2>{text('导出', 'Export')}<span className="okww-corner-badge">okww</span></h2><span>{project.chart.title}</span></div>
      </div>
      <div className="okww-export-actions">
        <button type="button" onClick={onSave}><Save size={16} />{text('保存草稿', 'Save Draft')}</button>
        <button type="button" className="primary" disabled={Boolean(errors.length) || exporting || !packagePreview} onClick={onExport}><Download size={16} />{exporting ? text('正在导出', 'Exporting') : text('导出 ZIP', 'Export ZIP')}</button>
      </div>
    </header>
    <div className="okww-export-roster">
      {([1, 2, 3] as const).map((slot) => {
        const character = OKWW_CHARACTERS.find((item) => item.className === project.classes[slot]);
        const avatar = character ? roleAvatar(character.className) : undefined;
        return <button key={slot} type="button" className="okww-roster-character" onClick={() => setRolePickerSlot(slot)}>
          <span>{text(`${slot} 号角色`, `Slot ${slot}`)}</span>
          <span className="okww-roster-character-main"><span className="okww-roster-avatar" style={avatar ? { backgroundImage: `url(${avatar})` } : undefined}>{avatar ? null : slot}</span><span><strong>{character?.english ?? text('选择角色', 'Select character')}</strong><small>{character?.name ?? text('点击选择 OKWW 角色', 'Choose an OKWW character')}</small></span></span>
        </button>;
      })}
      <label className="okww-export-author"><span>{text('作者', 'Author')}</span><input value={project.author} maxLength={80} onChange={(event) => onAuthorChange(event.target.value)} /></label>
      <span className={`okww-export-summary ${errors.length ? 'has-errors' : ''}`}>{analysis.runs.length} {text('段', 'runs')} · {warnings.length} {text('提示', 'notices')} · {errors.length} {text('错误', 'errors')}</span>
    </div>
    <div className="okww-export-main">
      <div className="okww-export-workspace">
        <div className="okww-export-tabs"><div className="segmented okww-view-switch"><button type="button" className={view === 'flow' ? 'active' : ''} aria-pressed={view === 'flow'} onClick={() => setView('flow')}>{text('连段图', 'Combo Flow')}</button><button type="button" className={view === 'timeline' ? 'active' : ''} aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}>{text('时间轴', 'Timeline')}</button></div><button type="button" className={`okww-code-tab ${view === 'code' ? 'active' : ''}`} onClick={() => setView('code')}>{text('生成代码', 'Generated Code')}</button></div>
        {view === 'flow' ? <div className="okww-export-flow"><div className="timeline-editor-toolbar okww-flow-toolbar" role="toolbar" aria-label={text('连段图编辑工具', 'Combo flow tools')}>
          <button type="button" className={`timeline-toolbar-group-trigger ${toolGroup === 'add' ? 'active' : ''}`} title={text('新增招式', 'Add action')} aria-label={text('新增招式', 'Add action')} onClick={() => setToolGroup(toolGroup === 'add' ? null : 'add')}><Plus size={18} /></button>
          <button type="button" className={`timeline-toolbar-group-trigger ${toolGroup === 'modify' ? 'active' : ''}`} title={text('修改招式', 'Change action')} aria-label={text('修改招式', 'Change action')} onClick={() => setToolGroup(toolGroup === 'modify' ? null : 'modify')}><Wrench size={18} /></button>
          <button type="button" className={`timeline-toolbar-group-trigger ${toolGroup === 'edit' ? 'active' : ''}`} title={text('编辑工具', 'Edit tools')} aria-label={text('编辑工具', 'Edit tools')} onClick={() => setToolGroup(toolGroup === 'edit' ? null : 'edit')}><Settings size={18} /></button>
          {(toolGroup === 'add' || toolGroup === 'modify') && <><button type="button" className="timeline-toolbar-press-mode" title={pressMode === 'tap' ? text('切换为长按招式', 'Use hold actions') : text('切换为点按招式', 'Use tap actions')} onClick={() => setPressMode(pressMode === 'tap' ? 'hold' : 'tap')}><b>{pressMode === 'tap' ? text('点', 'Tap') : text('长', 'Hold')}</b></button>{toolbarMoves.map(([moveId, code]) => {
            const move = editableMoves.find((item) => item.id === moveId);
            return <button type="button" key={`${pressMode}-${moveId}`} className="icon-button timeline-toolbar-move-tool" title={move?.label ?? moveId} aria-label={`${toolGroup === 'add' ? text('新增', 'Add') : text('改为', 'Change to')} ${move?.label ?? moveId}`} disabled={!selectedStep} onClick={() => selectedStep && (toolGroup === 'add' ? onInsertStep(selectedStep.id, moveId) : onChangeMove(selectedStep.id, moveId))}><b>{code}</b></button>;
          })}</>}
          {toolGroup === 'edit' && <><button type="button" className="icon-button" title={text('复制', 'Copy')} aria-label={text('复制', 'Copy')} disabled={!selectedStep} onClick={() => selectedStep && setCopiedStep({ step: selectedStep, contentLabel: project.chart.contentLabels?.[selectedStep.id] })}><Copy size={17} /></button><button type="button" className="icon-button" title={text('剪切', 'Cut')} aria-label={text('剪切', 'Cut')} disabled={!selectedStep} onClick={() => { if (selectedStep) { setCopiedStep({ step: selectedStep, contentLabel: project.chart.contentLabels?.[selectedStep.id] }); onDeleteStep(selectedStep.id); } }}><Scissors size={17} /></button><button type="button" className="icon-button" title={text('粘贴', 'Paste')} aria-label={text('粘贴', 'Paste')} disabled={!selectedStep || !copiedStep} onClick={() => selectedStep && copiedStep && onInsertStep(selectedStep.id, copiedStep.step.moveId, copiedStep.step, copiedStep.contentLabel)}><Clipboard size={17} /></button><button type="button" className="icon-button" title={text('向前移动', 'Move earlier')} aria-label={text('向前移动', 'Move earlier')} disabled={!selectedStep || selectedPosition <= 0} onClick={() => selectedStep && onMoveStep(selectedStep.id, -1)}><ArrowLeft size={17} /></button><button type="button" className="icon-button" title={text('向后移动', 'Move later')} aria-label={text('向后移动', 'Move later')} disabled={!selectedStep || selectedPosition < 0 || selectedPosition >= (selectedRun?.sourceStepIds.length ?? 0) - 1} onClick={() => selectedStep && onMoveStep(selectedStep.id, 1)}><ArrowRight size={17} /></button><button type="button" className="icon-button" title={text('删除招式', 'Delete action')} aria-label={text('删除招式', 'Delete action')} disabled={!selectedStep} onClick={() => selectedStep && onDeleteStep(selectedStep.id)}><Trash2 size={17} /></button></>}
          <span className="timeline-toolbar-divider" aria-hidden="true" /><button type="button" className="icon-button" title={text('撤销', 'Undo')} aria-label={text('撤销', 'Undo')} disabled={!canUndo} onClick={onUndo}><Undo2 size={17} /></button><button type="button" className="icon-button" title={text('重做', 'Redo')} aria-label={text('重做', 'Redo')} disabled={!canRedo} onClick={onRedo}><Redo2 size={17} /></button>
</div><div className="okww-overview-counts"><strong>{packagePreview?.replay.events.length ?? 0} {text('输入事件', 'input events')}</strong><span>{analysis.runs.length} {text('站场段', 'runs')}</span><span>{project.rules.filter((rule) => rule.origin === 'auto').length} {text('变奏标记', 'intro markers')}</span><label className="okww-replay-setting">{text('点按间隔 ms', 'Tap interval ms')}<input type="number" min="50" max="1000" step="10" value={project.replaySettings?.keyFrequencyMs ?? 100} onChange={(event) => onReplaySettingsChange({ keyFrequencyMs: Math.max(50, Math.min(1000, Math.round(Number(event.target.value) || 50))) })} /></label><label className="okww-replay-setting">{text('起始延迟 ms', 'Start delay ms')}<input type="number" min="0" max="30000" step="10" value={project.replaySettings?.startDelayMs ?? 0} onChange={(event) => onReplaySettingsChange({ startDelayMs: Math.max(0, Math.min(30000, Math.round(Number(event.target.value) || 0))) })} /></label><label className="okww-replay-setting">{text('切人最短按住 ms', 'Minimum switch hold ms')}<input type="number" min="0" max="2000" step="10" value={project.replaySettings?.minSwitchHoldMs ?? 0} onChange={(event) => onReplaySettingsChange({ minSwitchHoldMs: Math.max(0, Math.min(2000, Math.round(Number(event.target.value) || 0))) })} /></label></div><div className="okww-flow-runs">{analysis.runs.map((run, index) => {
          const roleStyle = style.roleStyles[run.slot];
          const character = OKWW_CHARACTERS.find((item) => item.className === project.classes[run.slot]);
          const steps = run.sourceStepIds.flatMap((id) => { const step = project.chart.steps.find((entry) => entry.id === id); return step ? [step] : []; });
          const switchStep = project.chart.steps.find((step) => step.id === run.switchStepId);
          return <div className="okww-flow-run" key={`${index}-${run.slot}`}><div className="okww-flow-role"><span className="okww-flow-avatar" style={{ backgroundImage: roleStyle.avatar ? `url(${roleStyle.avatar})` : undefined, borderColor: roleStyle.color }} /><div><strong>{character?.name ?? roleStyle.name}</strong><small>{run.phase === 'startup' ? text('启动', 'Start') : text('循环', 'Loop')} {String(index + 1).padStart(2, '0')}</small></div></div><div className="okww-flow-chain">{steps.map((step) => renderFlowStep(step, run.slot))}{switchStep && renderFlowStep(switchStep, run.slot)}</div></div>;
        })}</div></div> : view === 'timeline' ? <div className="okww-export-timeline">{timeline}</div> : <div className="okww-export-code">
          <div className="okww-export-code-heading"><select value={displayedCodeClass ?? ''} onChange={(event) => setCodeClass(event.target.value)}>{analysis.characters.map((character) => <option key={character.className} value={character.className}>{character.name} · {character.className}.py</option>)}</select></div>
          <pre>{displayedCodeClass && packagePreview?.files[`${displayedCodeClass}.py`] || text('请先绑定三名不同角色。', 'Bind three different characters first.')}</pre>
        </div>}
      </div>
      <aside className="okww-export-inspector">
        <div className="okww-export-inspector-head">
          <div className="okww-inspector-head-main"><h3>{text('判定与补充', 'Conditions')}</h3><span className={inspectorHint ? 'is-hint' : ''}>{inspectorHint === 'rule' ? text('为步骤添加判定', 'Add a condition to this step') : inspectorHint === 'post' ? text('为步骤添加执行后确认', 'Add an outcome check to this step') : selectedStep ? selectedStep.label : text('选择招式', 'Select an action')}</span></div>
          <div className="okww-inspector-head-actions">
            <span className="okww-condition-count rule" title={text('判定数量', 'Condition count')}>{rules.length}</span>
            <span className="okww-condition-count post" title={text('确认数量', 'Outcome check count')}>{postChecks.length}</span>
            <button className="okww-inline-add" type="button" disabled={!selectedStep || !probes.length} onMouseEnter={() => setInspectorHint('rule')} onMouseLeave={() => setInspectorHint(null)} onFocus={() => setInspectorHint('rule')} onBlur={() => setInspectorHint(null)} onClick={() => selectedStep && onAddRule(selectedStep)}><Plus size={13} />{text('判定', 'Check')}</button>
            <button className="okww-inline-add" type="button" disabled={!selectedStep || selectedStep.moveId.startsWith('switch_')} onMouseEnter={() => setInspectorHint('post')} onMouseLeave={() => setInspectorHint(null)} onFocus={() => setInspectorHint('post')} onBlur={() => setInspectorHint(null)} onClick={() => selectedStep && onAddPostCheck(selectedStep)}><Plus size={13} />{text('确认', 'Confirm')}</button>
          </div>
        </div>
        {selectedStep && <>
          {rules.map((rule) => <div className="okww-rule-editor" key={rule.id}>
            <div className="okww-rule-title"><strong>{rule.origin === 'auto' ? text('变奏标记（不阻塞）', 'Intro marker (non-blocking)') : text('执行前检查', 'Before action')}</strong><button className="icon-button" type="button" title={text('删除判定', 'Delete condition')} aria-label={text('删除判定', 'Delete condition')} onClick={() => onRemoveRule(rule.id)}><Trash2 size={15} /></button></div>
            {rule.origin === 'auto' ? <button type="button" onClick={() => onRuleChange(rule.id, { origin: 'manual' })}>{text('启用视觉判定', 'Enable visual check')}</button> : <>
            <label>{text('状态', 'State')}<select value={rule.probe} onChange={(event) => onRuleChange(rule.id, { probe: event.target.value as OkwwRule['probe'] })}>{probes.map((probe) => <option key={probe.id} value={probe.id}>{probe.label}</option>)}</select></label>
            <label>{text('处理', 'Behavior')}<select value={rule.behavior} onChange={(event) => onRuleChange(rule.id, { behavior: event.target.value as OkwwRule['behavior'] })}><option value="wait">{text('等待状态成立', 'Wait until true')}</option><option value="skip">{text('不成立则跳过', 'Skip if false')}</option></select></label>
            {rule.behavior === 'wait' && <><label>{text('最长等待（秒）', 'Timeout (seconds)')}<input type="number" min="0.1" max="10" step="0.1" value={(rule.timeoutMs / 1000).toFixed(1)} onChange={(event) => onRuleChange(rule.id, { timeoutMs: Math.round(Math.max(100, Math.min(10_000, Number(event.target.value) * 1000 || 100))) })} /></label><label>{text('等待期间', 'While waiting')}<select value={rule.whileWaiting} onChange={(event) => onRuleChange(rule.id, { whileWaiting: event.target.value as OkwwRule['whileWaiting'] })}><option value="none">{text('不操作', 'No action')}</option><option value="basic_attack">{text('持续普攻', 'Basic attacks')}</option></select></label></>}
            <label>{text('条件不成立', 'If unavailable')}<select value={rule.onTimeout} onChange={(event) => onRuleChange(rule.id, { onTimeout: event.target.value as OkwwRule['onTimeout'] })}><option value="skip">{text('跳过此招／暂缓切人', 'Skip / defer switch')}</option><option value="continue">{text('仍执行', 'Continue anyway')}</option><option value="switch">{text('结束当前站场', 'End this run')}</option><option value="branch">{text('跳转到失败分支', 'Jump to failure branch')}</option></select></label>
            {rule.onTimeout === 'branch' && <label>{text('失败后跳转到', 'Failure branch target')}<select value={rule.failureTargetStepId ?? ''} onChange={(event) => onRuleChange(rule.id, { failureTargetStepId: event.target.value || undefined })}><option value="">{text('选择后续招式', 'Choose a later action')}</option>{branchTargets.map((target) => <option key={target.id} value={target.id}>{target.label} · {Math.round(target.startMin)} ms</option>)}</select></label>}
{selectedStep.moveId.startsWith('switch_') && rule.onTimeout === 'skip' && <><label>{text('最多尝试', 'Maximum checks')}<input type="number" min="1" max="6" step="1" value={rule.maxRetries ?? 3} onChange={(event) => onRuleChange(rule.id, { maxRetries: Math.max(1, Math.min(6, Math.round(Number(event.target.value) || 1))) })} /></label><label>{text('超限后', 'After limit')}<select value={rule.onExhausted ?? 'abort'} onChange={(event) => onRuleChange(rule.id, { onExhausted: event.target.value as OkwwRule['onExhausted'] })}><option value="abort">{text('中止本轮', 'Abort combat run')}</option><option value="switch">{text('记录并普通切人', 'Log and switch normally')}</option></select></label></>}
            </>}
          </div>)}
          {selectedStep.moveId.startsWith('switch_') && <div className="okww-rule-editor okww-post-check">
            <div className="okww-rule-title"><strong>{text('切人失败（全队）', 'Switch failure (team-wide)')}</strong></div>
            <label>{text('确认等待上限（秒）', 'Verify timeout (seconds)')}<input type="number" min="0.3" max="5" step="0.1" value={((project.replaySettings?.switchVerifyTimeoutMs ?? 1500) / 1000).toFixed(1)} onChange={(event) => onReplaySettingsChange({ switchVerifyTimeoutMs: Math.round(Math.max(300, Math.min(5000, Number(event.target.value) * 1000 || 300))) })} /></label>
            <label>{text('目标角色未出现', 'If target is absent')}<select value={project.replaySettings?.switchFailure ?? 'abort'} onChange={(event) => onReplaySettingsChange({ switchFailure: event.target.value as 'abort' | 'retry' })}><option value="abort">{text('中止本轮', 'Abort combat run')}</option><option value="retry">{text('重试切人', 'Retry switch')}</option></select></label>
            {project.replaySettings?.switchFailure === 'retry' && <label>{text('最多重试次数', 'Maximum retries')}<input type="number" min="1" max="3" step="1" value={project.replaySettings?.switchMaxRetries ?? 1} onChange={(event) => onReplaySettingsChange({ switchMaxRetries: Math.max(1, Math.min(3, Math.round(Number(event.target.value) || 1))) })} /></label>}
          </div>}
          {postChecks.map((check) => <div className="okww-rule-editor okww-post-check" key={check.id}>
            <div className="okww-rule-title"><strong>{text('执行后确认', 'Outcome check')}</strong><button className="icon-button" type="button" title={text('删除确认', 'Delete check')} aria-label={text('删除确认', 'Delete check')} onClick={() => onRemovePostCheck(check.id)}><Trash2 size={15} /></button></div>
            <label>{text('目标状态', 'Expected state')}<select value={check.probe} onChange={(event) => onPostCheckChange(check.id, { probe: event.target.value as OkwwPostCheck['probe'] })}>{probes.map((probe) => <option key={probe.id} value={probe.id}>{probe.label}</option>)}</select></label>
            <label>{text('最长等待（秒）', 'Timeout (seconds)')}<input type="number" min="0.1" max="10" step="0.1" value={(check.timeoutMs / 1000).toFixed(1)} onChange={(event) => onPostCheckChange(check.id, { timeoutMs: Math.round(Math.max(100, Math.min(10_000, Number(event.target.value) * 1000 || 100))) })} /></label>
            <label>{text('状态未出现', 'If absent')}<select value={check.onFailure} onChange={(event) => onPostCheckChange(check.id, { onFailure: event.target.value as OkwwPostCheck['onFailure'] })}><option value="retry">{text('重试当前招式', 'Retry action')}</option><option value="next_run">{text('转下一站场段', 'Next run')}</option><option value="abort">{text('中止本轮', 'Abort combat run')}</option><option value="branch">{text('跳转到失败分支', 'Jump to failure branch')}</option></select></label>
            {check.onFailure === 'branch' && <label>{text('失败后跳转到', 'Failure branch target')}<select value={check.failureTargetStepId ?? ''} onChange={(event) => onPostCheckChange(check.id, { failureTargetStepId: event.target.value || undefined })}><option value="">{text('选择后续招式', 'Choose a later action')}</option>{branchTargets.map((target) => <option key={target.id} value={target.id}>{target.label} · {Math.round(target.startMin)} ms</option>)}</select></label>}
          </div>)}
        </>}
      </aside>
    </div>
    {analysis.issues.length > 0 && <div className={`okww-export-issues ${issuesOpen ? 'expanded' : ''}`} role="status">
      <button type="button" className={`okww-issue-toggle ${errors.length ? 'has-errors' : ''}`} aria-expanded={issuesOpen} onClick={() => setIssuesOpen((open) => !open)}><TriangleAlert size={15} />{text(`${errors.length} 处错误 · ${warnings.length} 条提示`, `${errors.length} errors · ${warnings.length} notices`)}{issuesOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>
      {issuesOpen && <div className="okww-issue-list">{groupedIssues.map(({ issue, count }) => <button type="button" key={`${issue.level}:${issue.message}`} className={issue.level} onClick={() => issue.stepId && onSelectStep(issue.stepId)}><TriangleAlert size={14} /><span>{issue.message}</span>{count > 1 && <small>×{count}</small>}</button>)}</div>}
    </div>}
    {rolePickerSlot && <div className="preset-picker-backdrop okww-role-picker-backdrop" onMouseDown={() => setRolePickerSlot(null)}>
      <div className="preset-picker-panel avatar-preset-panel team-selection-panel okww-role-picker" onMouseDown={(event) => event.stopPropagation()}>
        <div className="preset-picker-head">
          <div><h3>{text(`选择 ${rolePickerSlot} 号角色`, `Choose slot ${rolePickerSlot}`)}</h3><p>{text('使用 OKWW 角色名单；导出包默认使用英文类名。', 'Uses the OKWW roster; exported packages use English class names.')}</p></div>
          <button className="icon-button" type="button" title={text('关闭', 'Close')} aria-label={text('关闭', 'Close')} onClick={() => setRolePickerSlot(null)}><X size={18} /></button>
        </div>
        <div className="preset-picker-grid avatar-preset-grid team-character-grid okww-role-picker-grid">
          {OKWW_CHARACTERS.map((character) => {
            const selected = project.classes[rolePickerSlot] === character.className;
            const usedElsewhere = ([1, 2, 3] as const).some((slot) => slot !== rolePickerSlot && project.classes[slot] === character.className);
            const avatar = roleAvatar(character.className);
            return <button key={character.className} type="button" disabled={usedElsewhere} className={`preset-tile avatar-preset-tile team-character-tile okww-role-tile ${selected ? 'selected' : ''}`} onClick={() => { onClassChange(rolePickerSlot, character.className); setRolePickerSlot(null); }}>
              {avatar ? <img src={avatar} alt="" /> : <span className="okww-role-tile-fallback">{character.english.slice(0, 2).toUpperCase()}</span>}
              <strong>{character.english}</strong><small>{character.name}</small>{selected && <span className="team-selection-order"><Check size={14} /></span>}
            </button>;
          })}
        </div>
      </div>
    </div>}
  </section>;
}
