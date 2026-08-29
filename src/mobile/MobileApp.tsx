import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clipboard,
  Copy,
  Diamond,
  Download,
  Edit3,
  FileJson,
  FileText,
  Gamepad2,
  Grip,
  Layers,
  Languages,
  Lock,
  Palette,
  PenLine,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  Scissors,
  Settings2,
  Share2,
  ShieldCheck,
  Square,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  UserRound,
  Users,
  Wrench,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { ComboChart, ComboCommunityMetadata, ComboPeriod, ComboPeriodKind, ComboStep } from '../../combo-core';
import { DEFAULT_BINDINGS, DEFAULT_MOVES } from '../../combo-core';
import { defaultTextAxisCodeForMove, parseTextAxis } from '../textAxisParser';
import type { TextAxisCharacter } from '../textAxisParser';
import { defaultComboContentLabelForMoveId } from '../combo-image/comboImage';
import './mobile.css';

const LIBRARY_KEY = 'wwcombo-mobile-library-v1';
const SELECTED_KEY = 'wwcombo-mobile-selected-v1';
const APPEARANCE_KEY = 'wwcombo-mobile-overlay-appearance-v1';
const AUTO_WIDTH_DEFAULT_MIGRATION_KEY = 'wwcombo-mobile-auto-width-default-v2';
const KEY_ZONE_DEFAULT_MIGRATION_KEY = 'wwcombo-mobile-key-zones-default-v3';
const SIZE_DEFAULT_MIGRATION_KEY = 'wwcombo-mobile-size-default-v5';
const MOBILE_LANGUAGE_KEY = 'wwcombo-mobile-language-v1';
const COMMUNITY_URL = 'https://nova.fb520.site/';
const COMMUNITY_ORIGIN = new URL(COMMUNITY_URL).origin;
const COMMUNITY_IMPORT_MAX_BYTES = 2_000_000;
const COMMUNITY_UPLOAD_MAX_BYTES = 1_048_576;
const COMMUNITY_TAGS = ['轮椅', '基础', '标准', '进阶', '冒烟', '错轮'] as const;
const MOBILE_AVATAR_API = 'https://wuwa-hpyg-tool.200503.xyz/api/v1/batch-icons/character';
const MOBILE_BASE_API = 'https://nova.fb520.site/api/project-assets/v1/manifest.json';
const MOBILE_RELEASE_API = 'https://nova.fb520.site/api/project-assets/v1/mobile-release.json';
const MOBILE_ASSET_CACHE_KEY = 'wwcombo-mobile-appearance-assets-v1';
const MOBILE_UPDATE_DISMISSED_KEY = 'wwcombo-mobile-update-dismissed-v1';
const MOBILE_QUERY_PARAMS = new URLSearchParams(window.location.search);
const IS_MOBILE_PREVIEW = MOBILE_QUERY_PARAMS.has('mobile-preview');
const IS_MOBILE_UPDATE_PREVIEW = IS_MOBILE_PREVIEW && MOBILE_QUERY_PARAMS.get('mobile-update-preview') === '1';

type MobileLanguage = 'zh-CN' | 'en-US';
type MobileIconSet = 'classic' | 'tide';

const MOBILE_EN_TEXT: Record<string, string> = {
  '手机连段助手': 'Mobile Combo Assistant', '刷新状态': 'Refresh status', '从社区选择一份连段': 'Choose a combo from Community',
  '装载后即可在游戏上方播放连段图': 'Import a combo to display it over the game', '播放模式': 'Playback mode', '演示': 'Demo', '推进': 'Progress', '代理': 'Agent',
  '停止辅助': 'Stop assistant', '启动并等待点击挑战': 'Start and wait for Challenge', '悬浮播放服务': 'Overlay playback service',
  '无障碍权限已开启': 'Accessibility enabled', '需要开启无障碍权限': 'Accessibility permission required', '设置': 'Settings',
  '连段图预览': 'Combo preview', '展开': 'Expand', '收起': 'Collapse', '模拟游戏': 'Game simulator', '退出模拟': 'Exit simulator', '启动轴': 'Opener', '循环轴': 'Loop', '该轴暂无操作': 'No actions in this axis', '实际外观可在“外观”中调整': 'Adjust the final appearance in Settings', '我的连段': 'My combos',
  '删除当前连段': 'Delete selected combo', '从手机文件导入': 'Import from phone', '空空如也，可以': 'Nothing here. You can ',
  '录制': 'Record', '或者右转': ' or visit ', '社区': 'Community', '哦': '.', '练习': 'Practice',
  '连段社区': 'Combo Community', '点击社区中的下载即可装载到手机': 'Tap download in Community to import a combo', '刷新社区': 'Refresh Community',
  '新建连段': 'New combo', '先命名，再设置队伍和文字轴': 'Name it, then configure the team and text timeline', '连段名字': 'Combo name', '新建': 'Create',
  '快捷编队': 'Quick team', '角色名和头像来自 API，点击头像记录选择顺序': 'Names and avatars come from the API; tap portraits in team order',
  '选择': 'Select', '首发': 'Starter', '选择编队角色': 'Choose team characters', '完成': 'Done',
  '按名字拼音排序；依次点击三个头像，关闭后保存编队。': 'Sorted by name. Tap three portraits in order, then finish to save.',
  '正在读取角色列表，请稍后重试。': 'Loading character list. Please try again shortly.', '文字轴': 'Text timeline', '结束录制': 'Stop recording',
  '开始录制': 'Start recording', '当前连段预览': 'Current combo preview', '输入文字轴，例如：1 a e q 2 a r 3 A': 'Enter a text timeline, e.g. 1 a e q 2 a r 3 A',
  '基于文字轴已强制开启，未输入文字轴不能录制': 'Text-timeline mode is required; recording is disabled until one is entered',
  '编辑': 'Edit', '分享': 'Share', '录制识别设置': 'Recording recognition', '持续点按合并为同一招式块，达到长按阈值转为长按招式': 'Repeated taps merge into one action; holding past the threshold creates a hold action',
  '点按合并': 'Tap merge', '普通长按': 'Standard hold', '重击长按': 'Heavy hold', '毫秒': 'ms', '连段列表': 'Combo list',
  '选择连段后会同步到上方时间轴': 'Selecting a combo syncs it to the timeline above', '连段图外观': 'Combo appearance',
  '控制游戏内悬浮连段图的显示效果': 'Control how the floating combo appears in game', '恢复默认外观与位置': 'Restore default appearance and position',
  '语言': 'Language', '界面语言': 'Interface language', '选择手机端界面的显示语言': 'Choose the display language for the mobile app', '中文': 'Chinese', '英文': 'English',
  '排版': 'Layout', '横排适合一行展示，文本适合像电脑端竖向排列。': 'Horizontal fits a single row; Text uses a compact vertical layout.', '外观': 'Appearance', '图标': 'Icons', '选择连段图使用的操作图标方案。': 'Choose the action icon set used by the combo.', '图标大小': 'Icon size', '缩放招式图标以及对应的黄色底块和合并下划点。': 'Scale action icons, their active yellow highlight, and merge markers.', '经典': 'Classic', '潮声': 'Tidecall', '位置与范围': 'Position & bounds', '显示': 'Display', '合并': 'Merging', '尺寸': 'Sizing', '颜色': 'Colors', '字体': 'Typography',
  '勾选': 'Options', '切换': 'Modes', '数值与样式': 'Values & styles', '从下方选择参数': 'Select a parameter below',
  '选择下方参数后，在这里调整它的具体数值。': 'Select a parameter below to adjust its value here.', '开启': 'On', '关闭': 'Off',
  '分享连段': 'Share combo', '填写社区信息后保存 JSON 或直接上传。': 'Enter Community details, then save JSON or upload directly.', '名称': 'Name',
  '标签': 'Tags', '简介': 'Description', '视频链接': 'Video link', '可选': 'Optional', '角色': 'Characters', '轮数': 'Rounds', '未设置': 'Not set',
  '保存 JSON 到本地': 'Save JSON locally', '上传到社区': 'Upload to Community', '“轮椅”需要存在循环轴，且循环轴内切人总数不超过 3。': 'The Easy tag requires a loop segment with no more than 3 switches.',
  '轮椅': 'Easy', '基础': 'Basic', '标准': 'Standard', '进阶': 'Advanced', '冒烟': 'Smoke test', '错轮': 'Off-cycle',
  '横屏编辑区域': 'Landscape editor', '拖动框内移动，边框调整显示范围': 'Drag inside to move; drag the border to resize', '导入游戏截图': 'Import game screenshot', '展开编辑菜单': 'Expand editor menu', '收起编辑菜单': 'Collapse editor menu',
  '编辑对象': 'Edit target', '开关': 'Triggers', '流程': 'Combo', '按键': 'Buttons', '开始挑战点击区域': 'Start Challenge tap area', '退出挑战点击区域': 'Exit Challenge tap area',
  '普攻': 'Basic ATK', '重击': 'Heavy ATK', '技能': 'Skill', '长按技能': 'Hold Skill', '声骸': 'Echo', '长按声骸': 'Hold Echo',
  '解放': 'Liberation', '长按解放': 'Hold Liberation', '闪避': 'Dodge', '长按闪避': 'Hold Dodge', '跳跃': 'Jump', '长按跳跃': 'Hold Jump',
  '工具': 'Utility', '处决': 'Finisher', '自适应切人': 'Adaptive switch', '切人': 'Switch',
  '需要授权': 'Permission required', '调整位置中': 'Editing overlay', '播放中': 'Playing', '等待点击开始': 'Waiting for start tap', '未运行': 'Idle',
  '正在读取服务状态': 'Reading service status', '块': 'steps', '个招式块': 'actions', '秒': 'sec', '份，社区下载后会直接出现在这里': ' combos; Community downloads appear here',
  '横排': 'Horizontal', '文本': 'Text', '招式底图': 'Action background', '选择角色底图招式块或纯色招式块。': 'Use character artwork or a solid-color action block.', '个': '', '级': 'level',
  '底图': 'Artwork', '纯色': 'Solid', '使用角色底图': 'Use character artwork', '开启时按角色使用对应底图，关闭时统一使用 API 中名为“通用”的默认底图。': 'Use each character’s artwork when enabled, or the API Generic artwork when disabled.',
  '宽度模式': 'Width mode', '跟随内容会按招式内容自动计算宽度。': 'Auto width follows the action content.', '跟随内容': 'Auto', '固定宽度': 'Fixed',
  '块形状': 'Block shape', '设置纯色招式块的圆角样式。': 'Set the corner style of solid-color blocks.', '圆角': 'Rounded', '矩形': 'Rectangle',
  '左右位置': 'Horizontal position', '控制连段图在屏幕上的水平中心位置。': 'Set the horizontal center of the combo overlay.', '上下位置': 'Vertical position', '控制连段图在屏幕上的顶部位置。': 'Set the top position of the combo overlay.',
  '显示宽度': 'Display width', '控制连段图可见区域的宽度。': 'Set the visible width of the combo overlay.', '显示高度': 'Display height', '控制连段图可见区域的高度。': 'Set the visible height of the combo overlay.',
  '内容比例': 'Content scale', '整体等比缩放所有轨道、头像、图标和文字。': 'Scale tracks, portraits, icons, and text together.', '整体缩放': 'Overall zoom', '以旧版最小值 0.4 为 0，向左可以继续缩小，向右放大。': 'The previous minimum 0.4 is shown as 0; move left to shrink further or right to enlarge.',
  '透明度': 'Opacity', '调整置顶连段图整体透明度。': 'Adjust the overall overlay opacity.', '文字大小': 'Text size', '调整招式文字的显示大小。': 'Adjust action text size.',
  '文本间距': 'Text spacing', '以旧版最小值 0 为 0，向左可减少间距，向右增加间距。': 'Move left to reduce spacing or right to increase it.', '招式间距': 'Action gap', '控制相邻招式块之间的间隔。': 'Set the gap between adjacent actions.',
  '底图高度': 'Artwork height', '调整底图招式块的高度。': 'Adjust artwork block height.', '固定宽度模式下设置每个招式块的宽度。': 'Set each action width in fixed-width mode.',
  '自动宽度留白': 'Auto-width padding', '以旧版最小值 8 为 0，向左减少留白，向右增加留白。': 'Move left to reduce padding or right to increase it.', '头像大小': 'Portrait size', '控制招式块内角色头像的大小。': 'Set portrait size inside action blocks.', '头像位置': 'Portrait position', '调整头像的左右位置，图标会始终从头像右侧开始排列。': 'Adjust the portrait horizontally. Action icons always begin to its right.', '招式字体': 'Action font', '选择招式文字和合并数字使用的字体。': 'Choose the font used by action text and merge counts.', '优设标题黑': 'Youshe Title Black', '系统无衬线': 'System sans-serif', '系统衬线': 'System serif', '等宽': 'Monospace',
  '合并上限': 'Merge limit', '限制同角色一次最多收纳的块数，同招式连续段不受此项限制。': 'Limit actions per same-character group; consecutive identical actions are unaffected.',
  '渐隐范围': 'Fade range', '控制已完成招式的淡出范围。': 'Set how completed actions fade out.', '描边宽度': 'Outline width', '调整文字描边的粗细。': 'Adjust text outline thickness.',
  '角色头像': 'Character portraits', '显示或隐藏招式块中的角色头像。': 'Show or hide character portraits in action blocks.', '招式图标': 'Action icons', '优先使用图标显示可识别的招式。': 'Use icons for recognized actions.',
  '同角色合并': 'Merge same character', '将同一角色连续招式收纳到一个块中。': 'Group consecutive actions by the same character.', '同招式合并': 'Merge same action', '将同一招式连续出现的块收纳到一个块中。': 'Combine consecutive identical actions.',
  '完成渐隐': 'Fade completed', '让已经完成的招式逐步降低透明度。': 'Gradually fade completed actions.', '文字描边': 'Text outline', '为招式文字启用描边。': 'Enable an outline around action text.',
  '预提示': 'Pre-prompt', '显示当前招式前方的提示信息。': 'Show upcoming action prompts.', '点击区边框': 'Tap-area guides', '在游戏中显示开始和退出点击区域边框。': 'Show Start and Exit tap-area borders in game.',
  '普通底色': 'Default background', '设置普通招式块的纯色底。': 'Set the solid background for normal actions.', '当前底色': 'Active background', '设置当前触发招式的黄色反馈底色。': 'Set the feedback color for the active action.',
  '文字颜色': 'Text color', '设置普通招式文字颜色。': 'Set normal action text color.', '块描边颜色': 'Block border color', '设置招式块边框颜色。': 'Set action block border color.',
  '文字描边颜色': 'Text outline color', '设置招式文字描边颜色。': 'Set action text outline color.'
  , '退出备注编辑': 'Exit note editing', '保存备注': 'Save note', '招式备注': 'Action note', '备注': 'Note', '备注已保存': 'Note saved',
  '快速添加': 'Quick add', '退出快速添加': 'Exit quick add', '修改': 'Modify', '退出修改': 'Exit modify', '追加变奏图标': 'Add Intro', '追加延奏图标': 'Add Outro',
  '编辑工具': 'Edit tools', '退出编辑工具': 'Exit edit tools', '多选': 'Multi-select', '复制': 'Copy', '剪切': 'Cut', '粘贴到白色进度线右侧': 'Paste to the right of the playhead',
  '删除；无选中时进入连续删除': 'Delete; without a selection, enter delete mode', '撤销': 'Undo', '重做': 'Redo', '重新锁定关键帧': 'Lock keyframe',
  '解锁选中关键帧': 'Unlock selected keyframe', '在白色进度线处添加关键帧': 'Add keyframe at the playhead', '关键帧时间': 'Keyframe time', '解锁后可调整关键帧时间': 'Unlock to adjust keyframe time',
  '招式起点': 'Action start', '招式持续时间': 'Action duration', '缩小时间轴': 'Zoom timeline out', '放大时间轴': 'Zoom timeline in', '返回并保存': 'Save and return', '播放位置': 'Playback position',
  '开始挑战': 'Start Challenge', '退出挑战': 'Exit Challenge', '正在进入': 'Opening', '已锁定': 'Locked', '已解锁': 'Unlocked', '首发角色': 'Starter character',
  '发现新版本': 'New version available', '更新说明': 'Release notes', '更新': 'Update', '已阅': 'Got it', '忽略本版本更新': 'Ignore this version',
  '检查更新': 'Check for updates', '检查更新中': 'Checking for updates', '当前已是最新版本': 'You are up to date', '更新地址暂未配置': 'No update link is configured',
  '检查更新失败': 'Could not check for updates', '已忽略本版本更新': 'This version has been ignored', '暂无更新说明': 'No release notes provided',
  '当前版本': 'Current version', '手机端更新': 'Mobile update', '检查手机端是否有新版本': 'Check for a new mobile version'
};

function mobileText(language: MobileLanguage, text: string): string {
  return language === 'en-US' ? MOBILE_EN_TEXT[text] ?? text : text;
}

function mobileMessage(language: MobileLanguage, value: string): string {
  if (language === 'zh-CN') return value;
  const direct = MOBILE_EN_TEXT[value];
  if (direct) return direct;
  const rules: Array<[RegExp, string]> = [
    [/^已新建「(.+)」，请设置快捷编队并输入文字轴$/u, 'Created "$1". Configure the team and enter a text timeline.'],
    [/^已识别 (\d+) 个招式块$/u, 'Recognized $1 actions'],
    [/^已复制 (\d+) 个招式块$/u, 'Copied $1 actions'],
    [/^已复制节点左侧时段（(\d+) 个招式块）$/u, 'Copied the segment left of the node ($1 actions)'],
    [/^已删除「(.+)」$/u, 'Deleted "$1"'],
    [/^已从社区装载「(.+)」$/u, 'Imported "$1" from Community'],
    [/^已导入 (\d+) 份连段谱$/u, 'Imported $1 combo(s)'],
    [/^录制完成，已保存 (\d+) 份连段谱$/u, 'Recording complete; saved $1 combo(s)'],
    [/^请选择 (\d+) 名角色后再完成快捷编队$/u, 'Choose $1 characters before finishing the team'],
    [/^开始录制失败：(.+)$/u, 'Could not start recording: $1'],
    [/^结束录制失败：(.+)$/u, 'Could not stop recording: $1'],
    [/^导入失败：(.+)$/u, 'Import failed: $1'],
    [/^社区装载失败：(.+)$/u, 'Community import failed: $1'],
    [/^保存失败：(.+)$/u, 'Save failed: $1'],
    [/^上传失败：(.+)$/u, 'Upload failed: $1'],
    [/^启动失败：(.+)$/u, 'Start failed: $1'],
    [/^停止辅助失败：(.+)$/u, 'Could not stop assistant: $1'],
    [/^已保存 (.+)$/u, 'Saved $1'],
    [/^正在交给社区上传$/u, 'Sending to Community for upload'],
    [/^头像和底图服务暂时不可用，已保留本地资源$/u, 'Avatar and artwork services are unavailable; local assets were kept'],
    [/^无法读取手机服务：(.+)$/u, 'Could not read mobile service: $1'],
    [/^请先输入连段名字$/u, 'Enter a combo name first'],
    [/^请先输入并确认文字轴$/u, 'Enter and confirm the text timeline first'],
    [/^请先开启无障碍权限，返回后再开始录制$/u, 'Enable Accessibility first, then return to start recording'],
    [/^请先开启无障碍权限，返回后再启动辅助$/u, 'Enable Accessibility first, then return to start the assistant'],
    [/^请选择要修改的招式块$/u, 'Select an action block to modify first'],
    [/^请先选择要修改的招式块$/u, 'Select an action block to modify first'],
    [/^请先选择招式块$/u, 'Select an action block first'],
    [/^当前位置已经有时间节点$/u, 'A time node already exists here'],
    [/^关键帧已锁定$/u, 'Keyframe locked'],
    [/^关键帧已解锁，可以拖动或输入时间$/u, 'Keyframe unlocked; drag it or enter a time'],
    [/^只能合并同角色、同轨道、同招式的块$/u, 'Only same-character, same-track, same-action blocks can be merged']
  ];
  for (const [pattern, replacement] of rules) if (pattern.test(value)) return value.replace(pattern, replacement);
  return value;
}

function readMobileLanguage(): MobileLanguage {
  return localStorage.getItem(MOBILE_LANGUAGE_KEY) === 'en-US' ? 'en-US' : 'zh-CN';
}

function normalizeAssetName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

// The avatar endpoint uses a few alternate Chinese names, while the base-art
// manifest keeps the canonical names used by combo files.
const MOBILE_CHARACTER_NAME_ALIASES: Record<string, string> = {
  '青霄': '清霄',
  '清宵': '清霄',
  '洛瑟菈': '洛瑟拉',
  '嘉贝莉娜': '嘉贝丽娜',
  '漂泊者·导电': '雷主',
  '漂泊者·气动': '风主',
  '漂泊者·衍射': '光主',
  '漂泊者·湮灭': '暗主',
  '秧秧·玄翎': '玄翎'
};

function canonicalMobileCharacterName(value: string): string {
  const trimmed = value.trim();
  return MOBILE_CHARACTER_NAME_ALIASES[trimmed] ?? trimmed;
}

function mobileAssetMatches(item: MobileAssetPreset, name: string): boolean {
  const requested = normalizeAssetName(canonicalMobileCharacterName(name));
  return [item.name, ...Object.values(item.names ?? {})].some((candidate) => normalizeAssetName(canonicalMobileCharacterName(candidate)) === requested);
}

function mobileAssetDisplayName(item: MobileAssetPreset, language: MobileLanguage): string {
  const name = item.names?.[language] ?? item.names?.['en-US'] ?? item.name;
  return language === 'zh-CN' ? canonicalMobileCharacterName(name) : name;
}

function mobileCharacterDisplayName(name: string, assets: { avatars: MobileAssetPreset[]; bases: MobileAssetPreset[] }, language: MobileLanguage): string {
  const item = [...assets.avatars, ...assets.bases].find((candidate) => mobileAssetMatches(candidate, name));
  return item ? mobileAssetDisplayName(item, language) : name;
}

const MOBILE_PINYIN_COLLATOR = new Intl.Collator('zh-CN-u-co-pinyin', { numeric: true, sensitivity: 'base' });

function mobileCharacterSortName(value: string): string {
  return value
    .trim()
    .replace(/^长离/u, '常离')
    .replace(/^長離/u, '常離')
    .replace(/^仇远/u, '丘远')
    .replace(/^仇遠/u, '丘遠');
}

function compareMobileCharacters(left: MobileAssetPreset, right: MobileAssetPreset, language: MobileLanguage = 'zh-CN'): number {
  return MOBILE_PINYIN_COLLATOR.compare(mobileCharacterSortName(mobileAssetDisplayName(left, language)), mobileCharacterSortName(mobileAssetDisplayName(right, language)));
}

async function imageToDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function fetchMobileAssets(): Promise<{ avatars: MobileAssetPreset[]; bases: MobileAssetPreset[] }> {
  let avatarJson: unknown;
  let baseJson: unknown;
  try {
    const native = await invoke<unknown>('mobile_fetch_assets');
    if (!native || typeof native !== 'object' || !('avatars' in native) || !('bases' in native)) throw new Error('native asset proxy returned an invalid payload');
    avatarJson = (native as { avatars: unknown }).avatars;
    baseJson = (native as { bases: unknown }).bases;
  } catch {
    const [avatarResponse, baseResponse] = await Promise.all([
      fetch(MOBILE_AVATAR_API, { cache: 'no-cache' }),
      fetch(MOBILE_BASE_API, { cache: 'no-cache' })
    ]);
    avatarJson = avatarResponse.ok ? await avatarResponse.json() as unknown : [];
    baseJson = baseResponse.ok ? await baseResponse.json() as unknown : { characters: [] };
  }
  const baseObject = baseJson && typeof baseJson === 'object' ? baseJson as { characters?: unknown[]; data?: unknown } : null;
  const baseData = baseObject?.data && typeof baseObject.data === 'object' ? baseObject.data as { characters?: unknown[] } : null;
  const characters = Array.isArray(baseObject?.characters)
    ? baseObject.characters
    : Array.isArray(baseData?.characters)
      ? baseData.characters
      : [];
  const bases = characters.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const value = item as { names?: Record<string, unknown>; basePreset?: { src?: unknown; imageWidth?: unknown; imageHeight?: unknown; crop?: MobileBaseCrop; stretch?: MobileBaseStretch; edge?: unknown } | null };
    const preset = value.basePreset;
    const name = typeof value.names?.['zh-CN'] === 'string' ? value.names['zh-CN'] as string : '';
    const names = Object.fromEntries(Object.entries(value.names ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    const src = typeof preset?.src === 'string' ? (/^https?:/iu.test(preset.src) ? preset.src : new URL(preset.src, MOBILE_BASE_API).toString()) : '';
    const size = typeof preset?.imageWidth === 'number' && typeof preset?.imageHeight === 'number' ? { width: preset.imageWidth, height: preset.imageHeight } : undefined;
    const edge = typeof preset?.edge === 'number' ? preset.edge : undefined;
    return name && /^https?:/iu.test(src) ? [{ name, names, src, crop: preset?.crop, stretch: preset?.stretch, size, edge }] : [];
  });
  const avatarSource = Array.isArray(avatarJson)
    ? avatarJson
    : avatarJson && typeof avatarJson === 'object' && Array.isArray((avatarJson as { items?: unknown[] }).items)
      ? (avatarJson as { items: unknown[] }).items
      : avatarJson && typeof avatarJson === 'object' && Array.isArray((avatarJson as { data?: unknown[] }).data)
        ? (avatarJson as { data: unknown[] }).data
        : avatarJson && typeof avatarJson === 'object'
          ? Object.entries(avatarJson as Record<string, unknown>).flatMap(([name, src]) => typeof src === 'string' ? [{ name, src }] : [])
          : [];
  const avatars = avatarSource.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const value = item as { name?: unknown; character?: unknown; src?: unknown; url?: unknown; image?: unknown; icon?: unknown };
    const rawName = typeof value.name === 'string' ? value.name : typeof value.character === 'string' ? value.character : '';
    const src = [value.src, value.url, value.image, value.icon].find((candidate): candidate is string => typeof candidate === 'string' && /^https?:/iu.test(candidate));
    const base = rawName ? bases.find((candidate) => mobileAssetMatches(candidate, rawName)) : undefined;
    const name = base?.name ?? canonicalMobileCharacterName(rawName);
    return name && src ? [{ name, names: base?.names ?? { 'zh-CN': name }, src }] : [];
  });
  return { avatars, bases };
}

function chartCharacterNames(chart: ComboChart): string[] {
  const fromCommunity = chart.community?.characters?.filter((name) => typeof name === 'string' && name.trim()) ?? [];
  if (fromCommunity.length) return fromCommunity;
  return typeof chart.character === 'string' ? chart.character.split(/\s*(?:\/|,|锛寍銆亅\|)\s*/u).filter(Boolean) : [];
}

function mobileCommunityRoundCount(chart: ComboChart): number {
  return 1 + (chart.periods ?? []).filter((period) => period.kind === 'loop_axis').length;
}

function isMobileWheelchairEligible(chart: ComboChart): boolean {
  const loops = (chart.periods ?? []).filter((period) => period.kind === 'loop_axis');
  return loops.length > 0 && loops.every((period) => chart.steps.filter((step) => step.startMin >= period.startMs && step.startMin < period.endMs && /^switch_[1-4]$/u.test(mobileMoveKey(step.moveId))).length <= 3);
}

function uniqueMobileCommunityId(library: ComboChart[]): string {
  const existing = new Set(library.flatMap((chart) => chart.community?.id ? [chart.community.id] : []));
  let id = '';
  do id = `wwc_${crypto.randomUUID()}`;
  while (existing.has(id));
  return id;
}

function mobileShareDraft(chart: ComboChart, library: ComboChart[]): MobileShareDraft {
  const wheelchairEligible = isMobileWheelchairEligible(chart);
  const previous = chart.community;
  const characters = chartCharacterNames(chart);
  return {
    id: previous?.id?.trim() || uniqueMobileCommunityId(library),
    name: previous?.name?.trim() || chart.title.trim() || '未命名连段',
    tags: COMMUNITY_TAGS.filter((tag) => (previous?.tags ?? chart.tags ?? []).includes(tag) && (tag !== '轮椅' || wheelchairEligible)),
    description: previous?.description ?? '',
    characters: characters.length ? characters : Array.from(new Set(chart.steps.map((step) => `角色${step.characterSlot ?? 1}`))),
    rounds: mobileCommunityRoundCount(chart),
    link: previous?.link ?? '',
    wheelchairEligible
  };
}

function safeMobileFileName(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/gu, '_').slice(0, 48) || 'wwcombo';
}

function prepareMobileCommunityShare(chart: ComboChart, draft: MobileShareDraft) {
  const link = draft.link.trim();
  if (link && !/^https?:\/\//iu.test(link)) throw new Error('视频链接需要以 http:// 或 https:// 开头');
  const metadata: ComboCommunityMetadata = {
    ...draft,
    name: draft.name.trim() || chart.title,
    description: draft.description.trim(),
    link,
    tags: COMMUNITY_TAGS.filter((tag) => draft.tags.includes(tag) && (tag !== '轮椅' || draft.wheelchairEligible)),
    exportedAt: Date.now()
  };
  const sharedChart = normalizeChart({
    ...chart,
    title: metadata.name,
    character: metadata.characters.join(' / '),
    tags: [...metadata.tags],
    community: metadata,
    updatedAt: Date.now()
  });
  const usedMoveIds = new Set(sharedChart.steps.map((step) => step.moveId));
  const contentLabels = { ...(sharedChart.contentLabels ?? {}) };
  const payload = {
    type: 'wwcombo-chart',
    version: 3,
    chart: { ...sharedChart, contentLabels },
    contentLabels,
    moves: DEFAULT_MOVES.filter((move) => usedMoveIds.has(move.id) || move.id === sharedChart.startTriggerMoveId || move.id === (sharedChart.stopTriggerMoveId ?? 'stop_recording')),
    bindings: DEFAULT_BINDINGS.filter((binding) => usedMoveIds.has(binding.moveId) || binding.moveId === sharedChart.startTriggerMoveId || binding.moveId === (sharedChart.stopTriggerMoveId ?? 'stop_recording'))
  };
  const filename = `${safeMobileFileName(metadata.name)}-${safeMobileFileName(metadata.id)}.wwcombo.json`;
  return { sharedChart, filename, payload };
}

function downloadMobileJson(payload: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type MobilePage = 'library' | 'community' | 'record' | 'appearance' | 'editor' | 'timeline';
type CommunityTag = typeof COMMUNITY_TAGS[number];
type MobileShareDraft = Omit<ComboCommunityMetadata, 'exportedAt'>;
type MobileCommunityUploadPackage = { chartId: string; filename: string; payload: unknown };
type OverlayLayout = 'horizontal' | 'text';
type BlockMode = 'capsule' | 'image';
type CapsuleShape = 'capsule' | 'rect';
type CapsuleWidthMode = 'auto' | 'fixed';
type MobilePlaybackMode = 'demo' | 'progress' | 'agent';
type MobileKeyAction = 'basic_attack' | 'skill' | 'echo' | 'liberation' | 'dodge' | 'jump' | 'tool' | 'finisher' | 'switch';
type MobileTimelineToolGroup = 'add' | 'modify' | 'edit' | null;
type MobileTimelineEditMode = 'multi' | 'delete' | null;
type MobileTimelinePressMode = 'tap' | 'hold';

const MOBILE_TIMELINE_MOVE_TOOLS: Array<{ moveId: string; code: string; label: string; adaptiveSwitch?: boolean }> = [
  { moveId: 'basic_attack', code: 'a', label: '普攻' },
  { moveId: 'heavy_attack', code: 'Z', label: '重击' },
  { moveId: 'skill', code: 'e', label: '技能' },
  { moveId: 'skill_hold', code: 'E', label: '长按技能' },
  { moveId: 'echo', code: 'q', label: '声骸' },
  { moveId: 'echo_hold', code: 'Q', label: '长按声骸' },
  { moveId: 'liberation', code: 'r', label: '解放' },
  { moveId: 'liberation_hold', code: 'R', label: '长按解放' },
  { moveId: 'dodge', code: 's', label: '闪避' },
  { moveId: 'dodge_hold', code: 'S', label: '长按闪避' },
  { moveId: 'jump', code: 'j', label: '跳跃' },
  { moveId: 'jump_hold', code: 'J', label: '长按跳跃' },
  { moveId: 'tool', code: 't', label: '工具' },
  { moveId: 'finisher', code: 'f', label: '处决' },
  { moveId: 'switch_1', code: '', label: '自适应切人', adaptiveSwitch: true }
];

const MOBILE_TIMELINE_PRESS_TOOL_IDS: Record<MobileTimelinePressMode, string[]> = {
  tap: ['basic_attack', 'skill', 'echo', 'liberation', 'dodge', 'jump', 'tool', 'finisher', 'switch_1'],
  hold: ['heavy_attack', 'skill_hold', 'echo_hold', 'liberation_hold', 'dodge_hold', 'jump_hold', 'tool', 'finisher', 'switch_1']
};

const MOBILE_KEY_ACTIONS: Array<{ key: MobileKeyAction; label: string; switch?: boolean }> = [
  { key: 'basic_attack', label: '普攻' },
  { key: 'skill', label: '技能' },
  { key: 'echo', label: '声骸' },
  { key: 'liberation', label: '解放' },
  { key: 'dodge', label: '闪避' },
  { key: 'jump', label: '跳跃' },
  { key: 'tool', label: '工具' },
  { key: 'finisher', label: '处决' },
  { key: 'switch', label: '切人', switch: true }
];

type TriggerZone = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MobileBaseCrop = { x: number; y: number; w: number; h: number };
type MobileBaseStretch = { left: number; right: number };
type MobileBaseSize = { width: number; height: number };
type MobileAssetPreset = { name: string; names?: Record<string, string>; src: string; crop?: MobileBaseCrop; stretch?: MobileBaseStretch; size?: MobileBaseSize; edge?: number };

function readCachedMobileAssets(): { avatars: MobileAssetPreset[]; bases: MobileAssetPreset[] } {
  try {
    const value = JSON.parse(localStorage.getItem(MOBILE_ASSET_CACHE_KEY) ?? 'null') as { avatars?: MobileAssetPreset[]; bases?: MobileAssetPreset[] } | null;
    return {
      avatars: Array.isArray(value?.avatars) ? value.avatars.filter((item) => item && typeof item.name === 'string' && typeof item.src === 'string') : [],
      bases: Array.isArray(value?.bases) ? value.bases.filter((item) => item && typeof item.name === 'string' && typeof item.src === 'string') : []
    };
  } catch {
    return { avatars: [], bases: [] };
  }
}

type MobileOverlaySettings = {
  layout: OverlayLayout;
  iconSet: MobileIconSet;
  iconScale: number;
  blockMode: BlockMode;
  useCharacterBase: boolean;
  playbackMode: MobilePlaybackMode;
  capsuleShape: CapsuleShape;
  capsuleWidthMode: CapsuleWidthMode;
  capsuleWidth: number;
  capsuleHeight: number;
  imageBlockWidth: number;
  imageBlockHeight: number;
  autoWidthPadding: number;
  capsuleGap: number;
  edgePadding: number;
  capsuleEdge: number;
  capsuleStretch: { left: number; right: number };
  avatarSources: Record<string, string>;
  baseSources: Record<string, string>;
  baseCrop: MobileBaseCrop;
  baseCrops: Record<string, MobileBaseCrop>;
  baseStretches: Record<string, MobileBaseStretch>;
  baseImageSizes: Record<string, MobileBaseSize>;
  baseEdges: Record<string, number>;
  overallScale: number;
  x: number;
  y: number;
  width: number;
  displayHeight: number;
  scale: number;
  opacity: number;
  fontSize: number;
  textSpacing: number;
  blockGap: number;
  backgroundColor: string;
  activeColor: string;
  textColor: string;
  borderColor: string;
  textStrokeEnabled: boolean;
  textStrokeWidth: number;
  textStrokeColor: string;
  fontFamily: string;
  promptFontFamily: string;
  avatarEnabled: boolean;
  avatarSize: number;
  avatarOffsetX: number;
  avatarOffsetY: number;
  fadeEnabled: boolean;
  fadeRange: number;
  prePromptEnabled: boolean;
  convertIcons: boolean;
  mergeSameRoleSteps: boolean;
  mergeSameRoleLimit: number;
  mergeSameMoveSteps: boolean;
  stairRoleOffset: number;
  showCharacterSlot: boolean;
  showTriggerGuides: boolean;
  startZone: TriggerZone;
  exitZone: TriggerZone;
  keyZones: Record<MobileKeyAction, TriggerZone>;
};

type MobileStatus = {
  accessibilityEnabled: boolean;
  serviceConnected: boolean;
  assistantActive: boolean;
  recordingActive?: boolean;
  recordingElapsed?: number;
  recordingChartJson?: string | null;
  overlayEditing?: boolean;
  settingsJson?: string;
  phase: 'idle' | 'pending' | 'playing' | string;
  message: string;
};

type CommunityImportMessage = {
  type: 'wwcombo:community-import';
  version: 1;
  requestId: string;
  filename?: string;
  payload: unknown;
};

type MobileReleaseManifest = {
  schemaVersion: 1;
  platform: 'mobile';
  version: string;
  title: string;
  notes: string;
  publishedAt: string;
  downloadUrl: string;
};

function normalizeMobileRelease(value: unknown): MobileReleaseManifest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as {
    schemaVersion?: unknown;
    platform?: unknown;
    version?: unknown;
    title?: unknown;
    notes?: unknown;
    publishedAt?: unknown;
    download?: { url?: unknown } | null;
    downloadLinks?: Record<string, unknown>;
  };
  if (record.schemaVersion !== 1 || (record.platform !== undefined && record.platform !== 'mobile')) return null;
  if (typeof record.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(record.version)) return null;
  const candidates = [
    record.downloadLinks?.android,
    record.download?.url,
    record.downloadLinks?.github,
    record.downloadLinks?.global
  ];
  const rawUrl = candidates.find((candidate): candidate is string => typeof candidate === 'string' && Boolean(candidate.trim()));
  let downloadUrl = '';
  if (rawUrl) {
    try {
      downloadUrl = new URL(rawUrl, MOBILE_RELEASE_API).toString();
    } catch {
      downloadUrl = '';
    }
  }
  return {
    schemaVersion: 1,
    platform: 'mobile',
    version: record.version,
    title: typeof record.title === 'string' ? record.title : '',
    notes: typeof record.notes === 'string' ? record.notes : '',
    publishedAt: typeof record.publishedAt === 'string' ? record.publishedAt : '',
    downloadUrl: /^https?:\/\//i.test(downloadUrl) ? downloadUrl : ''
  };
}

function compareMobileVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

const DEFAULT_APPEARANCE: MobileOverlaySettings = {
  layout: 'horizontal',
  iconSet: 'classic',
  iconScale: 1,
  blockMode: 'image',
  useCharacterBase: true,
  playbackMode: 'demo',
  capsuleShape: 'capsule',
  capsuleWidthMode: 'auto',
  capsuleWidth: 200,
  capsuleHeight: 80,
  imageBlockWidth: 200,
  imageBlockHeight: 55,
  // Keep the automatic width close to the API crop. Users can still add
  // extra room manually, but the first render should not double the base
  // image's already-cropped side space.
  autoWidthPadding: 8,
  capsuleGap: 20,
  edgePadding: 1,
  capsuleEdge: 0,
  capsuleStretch: { left: 11, right: 86 },
  avatarSources: {},
  baseSources: {},
  baseCrop: { x: 4, y: 43, w: 93, h: 14 },
  baseCrops: {},
  baseStretches: {},
  baseImageSizes: {},
  baseEdges: {},
  overallScale: 1,
  x: 0.5,
  y: 0.06,
  width: 0.9,
  displayHeight: 0.22,
  scale: .4,
  opacity: 0.94,
  fontSize: 15,
  textSpacing: 0,
  blockGap: 7,
  backgroundColor: '#ffffff',
  activeColor: '#f5c542',
  textColor: '#12304f',
  borderColor: '#245991',
  textStrokeEnabled: true,
  textStrokeWidth: 2,
  textStrokeColor: '#050505',
  fontFamily: '"优设标题黑", "Noto Sans SC", sans-serif',
  promptFontFamily: 'sans-serif',
  avatarEnabled: true,
  avatarSize: 70,
  avatarOffsetX: -20,
  avatarOffsetY: 0,
  fadeEnabled: false,
  fadeRange: 30,
  prePromptEnabled: true,
  convertIcons: true,
  mergeSameRoleSteps: true,
  mergeSameRoleLimit: 10,
  mergeSameMoveSteps: false,
  stairRoleOffset: 48,
  showCharacterSlot: false,
  showTriggerGuides: false,
  startZone: { x: 0.53, y: 0.3, width: 0.46, height: 0.48 },
  exitZone: { x: 0, y: 0, width: 0.3, height: 0.28 },
  // Landscape defaults follow the in-game touch layout: the attack cluster
  // sits at the lower-right instead of occupying a toolbar-like row.
  keyZones: {
    basic_attack: { x: 0.76, y: 0.73, width: 0.115, height: 0.115 },
    skill: { x: 0.80, y: 0.49, width: 0.08, height: 0.08 },
    echo: { x: 0.71, y: 0.49, width: 0.08, height: 0.08 },
    liberation: { x: 0.66, y: 0.73, width: 0.115, height: 0.115 },
    dodge: { x: 0.88, y: 0.73, width: 0.10, height: 0.10 },
    jump: { x: 0.88, y: 0.49, width: 0.08, height: 0.08 },
    tool: { x: 0.65, y: 0.49, width: 0.075, height: 0.075 },
    finisher: { x: 0.59, y: 0.26, width: 0.105, height: 0.105 },
    switch: { x: 0.895, y: 0.02, width: 0.08, height: 0.16 }
  }
};

const initialStatus: MobileStatus = {
  accessibilityEnabled: false,
  serviceConnected: false,
  assistantActive: false,
  recordingActive: false,
  recordingElapsed: 0,
  phase: 'idle',
  message: '正在读取服务状态'
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function normalizeZone(value: Partial<TriggerZone> | undefined, fallback: TriggerZone): TriggerZone {
  const width = clamp(value?.width, 0.08, 1, fallback.width);
  const height = clamp(value?.height, 0.08, 1, fallback.height);
  return {
    width,
    height,
    x: clamp(value?.x, 0, 1 - width, fallback.x),
    y: clamp(value?.y, 0, 1 - height, fallback.y)
  };
}

function normalizeKeyZones(value: Partial<Record<MobileKeyAction, Partial<TriggerZone>>> | undefined): Record<MobileKeyAction, TriggerZone> {
  const result = {} as Record<MobileKeyAction, TriggerZone>;
  MOBILE_KEY_ACTIONS.forEach(({ key }) => {
    const fallback = DEFAULT_APPEARANCE.keyZones[key];
    const isSwitch = key === 'switch';
    const width = clamp(value?.[key]?.width, 0.04, isSwitch ? 0.3 : 0.35, fallback.width);
    // Key zones are shape-defined controls: ordinary actions are circles and
    // the switch control is a 1:2 rectangle. Persist one size and derive the
    // other dimension so old settings cannot turn the editor into ellipses.
    const height = Math.min(1, width * (isSwitch ? 2 : 1));
    result[key] = {
      width,
      height,
      x: clamp(value?.[key]?.x, 0, 1 - width, fallback.x),
      y: clamp(value?.[key]?.y, 0, 1 - height, fallback.y)
    };
  });
  return result;
}

function normalizeAppearance(value: Partial<MobileOverlaySettings> | null | undefined): MobileOverlaySettings {
  const color = (candidate: unknown, fallback: string) => typeof candidate === 'string' && /^#[0-9a-f]{6}$/iu.test(candidate) ? candidate : fallback;
  return {
    layout: value?.layout === 'text' ? 'text' : 'horizontal',
    iconSet: value?.iconSet === 'tide' ? 'tide' : 'classic',
    iconScale: clamp(value?.iconScale, .35, 3, DEFAULT_APPEARANCE.iconScale),
    blockMode: value?.blockMode === 'capsule' ? 'capsule' : 'image',
    useCharacterBase: value?.useCharacterBase !== false,
    playbackMode: value?.playbackMode === 'progress' || value?.playbackMode === 'agent' ? value.playbackMode : 'demo',
    capsuleShape: value?.capsuleShape === 'rect' ? 'rect' : 'capsule',
    capsuleWidthMode: value?.capsuleWidthMode === 'fixed' ? 'fixed' : 'auto',
    capsuleWidth: clamp(value?.capsuleWidth, 32, 1000, DEFAULT_APPEARANCE.capsuleWidth),
    capsuleHeight: clamp(value?.capsuleHeight, 24, 500, DEFAULT_APPEARANCE.capsuleHeight),
    imageBlockWidth: clamp(value?.imageBlockWidth, 24, 1800, DEFAULT_APPEARANCE.imageBlockWidth),
    imageBlockHeight: clamp(value?.imageBlockHeight, 16, 500, DEFAULT_APPEARANCE.imageBlockHeight),
    autoWidthPadding: clamp(value?.autoWidthPadding, 0, 310, DEFAULT_APPEARANCE.autoWidthPadding),
    capsuleGap: clamp(value?.capsuleGap, 0, 96, DEFAULT_APPEARANCE.capsuleGap),
    edgePadding: clamp(value?.edgePadding, 0, 12, DEFAULT_APPEARANCE.edgePadding),
    capsuleEdge: clamp(value?.capsuleEdge, 0, 100, DEFAULT_APPEARANCE.capsuleEdge),
    capsuleStretch: {
      left: clamp(value?.capsuleStretch?.left, 0, 99, DEFAULT_APPEARANCE.capsuleStretch.left),
      right: clamp(value?.capsuleStretch?.right, 1, 100, DEFAULT_APPEARANCE.capsuleStretch.right)
    },
    avatarSources: value?.avatarSources && typeof value.avatarSources === 'object' ? Object.fromEntries(Object.entries(value.avatarSources).filter(([, src]) => typeof src === 'string' && src.length < 2_000_000)) : {},
    baseSources: value?.baseSources && typeof value.baseSources === 'object' ? Object.fromEntries(Object.entries(value.baseSources).filter(([, src]) => typeof src === 'string' && src.length < 2_000_000)) : {},
    baseCrop: {
      x: clamp(value?.baseCrop?.x, 0, 100, DEFAULT_APPEARANCE.baseCrop.x),
      y: clamp(value?.baseCrop?.y, 0, 100, DEFAULT_APPEARANCE.baseCrop.y),
      w: clamp(value?.baseCrop?.w, 1, 100, DEFAULT_APPEARANCE.baseCrop.w),
      h: clamp(value?.baseCrop?.h, 1, 100, DEFAULT_APPEARANCE.baseCrop.h)
    },
    baseCrops: value?.baseCrops && typeof value.baseCrops === 'object'
      ? Object.fromEntries(Object.entries(value.baseCrops).flatMap(([slot, crop]) => {
        if (!crop || typeof crop !== 'object') return [];
        const item = crop as Partial<MobileBaseCrop>;
        return [[slot, {
          x: clamp(item.x, 0, 100, DEFAULT_APPEARANCE.baseCrop.x),
          y: clamp(item.y, 0, 100, DEFAULT_APPEARANCE.baseCrop.y),
          w: clamp(item.w, 1, 100, DEFAULT_APPEARANCE.baseCrop.w),
          h: clamp(item.h, 1, 100, DEFAULT_APPEARANCE.baseCrop.h)
        }]];
      })) : {},
    baseStretches: value?.baseStretches && typeof value.baseStretches === 'object'
      ? Object.fromEntries(Object.entries(value.baseStretches).flatMap(([slot, stretch]) => {
        if (!stretch || typeof stretch !== 'object') return [];
        const item = stretch as Partial<MobileBaseStretch>;
        const left = clamp(item.left, 0, 99, DEFAULT_APPEARANCE.capsuleStretch.left);
        return [[slot, { left, right: clamp(item.right, left + 1, 100, DEFAULT_APPEARANCE.capsuleStretch.right) }]];
      })) : {},
    baseImageSizes: value?.baseImageSizes && typeof value.baseImageSizes === 'object'
      ? Object.fromEntries(Object.entries(value.baseImageSizes).flatMap(([slot, size]) => {
        if (!size || typeof size !== 'object') return [];
        const item = size as Partial<MobileBaseSize>;
        return [[slot, { width: clamp(item.width, 1, 5000, 426), height: clamp(item.height, 1, 5000, 426) }]];
      })) : {},
    baseEdges: value?.baseEdges && typeof value.baseEdges === 'object'
      ? Object.fromEntries(Object.entries(value.baseEdges).flatMap(([slot, edge]) => typeof edge === 'number' && Number.isFinite(edge) ? [[slot, Math.min(100, Math.max(0, edge))]] : [])) : {},
    overallScale: clamp(value?.overallScale, 0.25, 4, DEFAULT_APPEARANCE.overallScale),
    x: clamp(value?.x, 0.05, 0.95, DEFAULT_APPEARANCE.x),
    y: clamp(value?.y, 0, 0.88, DEFAULT_APPEARANCE.y),
    width: clamp(value?.width, 0.28, 1, DEFAULT_APPEARANCE.width),
    displayHeight: clamp(value?.displayHeight, 0.08, 0.8, DEFAULT_APPEARANCE.displayHeight),
    scale: clamp(value?.scale, 0.05, 3.75, DEFAULT_APPEARANCE.scale),
    opacity: clamp(value?.opacity, 0.25, 1, DEFAULT_APPEARANCE.opacity),
    fontSize: clamp(value?.fontSize, 10, 30, DEFAULT_APPEARANCE.fontSize),
    textSpacing: clamp(value?.textSpacing, -50, 146, DEFAULT_APPEARANCE.textSpacing),
    blockGap: clamp(value?.blockGap, 2, 24, DEFAULT_APPEARANCE.blockGap),
    backgroundColor: color(value?.backgroundColor, DEFAULT_APPEARANCE.backgroundColor),
    activeColor: color(value?.activeColor, DEFAULT_APPEARANCE.activeColor),
    textColor: color(value?.textColor, DEFAULT_APPEARANCE.textColor),
    borderColor: color(value?.borderColor, DEFAULT_APPEARANCE.borderColor),
    textStrokeEnabled: value?.textStrokeEnabled === true,
    textStrokeWidth: clamp(value?.textStrokeWidth, 0, 12, DEFAULT_APPEARANCE.textStrokeWidth),
    textStrokeColor: color(value?.textStrokeColor, DEFAULT_APPEARANCE.textStrokeColor),
    fontFamily: typeof value?.fontFamily === 'string' && value.fontFamily.trim() ? value.fontFamily.trim() : DEFAULT_APPEARANCE.fontFamily,
    promptFontFamily: typeof value?.promptFontFamily === 'string' && value.promptFontFamily.trim() ? value.promptFontFamily.trim() : DEFAULT_APPEARANCE.promptFontFamily,
    avatarEnabled: value?.avatarEnabled !== false,
    avatarSize: clamp(value?.avatarSize, 12, 360, DEFAULT_APPEARANCE.avatarSize),
    avatarOffsetX: clamp(value?.avatarOffsetX, -300, 300, DEFAULT_APPEARANCE.avatarOffsetX),
    avatarOffsetY: clamp(value?.avatarOffsetY, -300, 300, DEFAULT_APPEARANCE.avatarOffsetY),
    fadeEnabled: value?.fadeEnabled === true,
    fadeRange: clamp(value?.fadeRange, 0, 100, DEFAULT_APPEARANCE.fadeRange),
    prePromptEnabled: value?.prePromptEnabled !== false,
    convertIcons: value?.convertIcons !== false,
    mergeSameRoleSteps: value?.mergeSameRoleSteps !== false,
    mergeSameRoleLimit: clamp(value?.mergeSameRoleLimit, 1, 200, DEFAULT_APPEARANCE.mergeSameRoleLimit),
    mergeSameMoveSteps: value?.mergeSameMoveSteps === true,
    stairRoleOffset: clamp(value?.stairRoleOffset, 0, 1000, DEFAULT_APPEARANCE.stairRoleOffset),
    // Kept in the persisted shape for compatibility, but character numbers are
    // no longer part of the mobile overlay visual language.
    showCharacterSlot: false,
    showTriggerGuides: value?.showTriggerGuides === true,
    startZone: normalizeZone(value?.startZone, DEFAULT_APPEARANCE.startZone),
    exitZone: normalizeZone(value?.exitZone, DEFAULT_APPEARANCE.exitZone),
    keyZones: normalizeKeyZones(value?.keyZones)
  };
}

function readAppearance(): MobileOverlaySettings {
  try {
    const stored = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? 'null') as Partial<MobileOverlaySettings> | null;
    // 0.64 shipped 50px as the default. Migrate that untouched old default
    // once, while preserving a value the user has deliberately changed.
    if (!localStorage.getItem(AUTO_WIDTH_DEFAULT_MIGRATION_KEY)) {
      if (stored && Number(stored.autoWidthPadding) === 50) stored.autoWidthPadding = 8;
      localStorage.setItem(AUTO_WIDTH_DEFAULT_MIGRATION_KEY, '1');
    }
    if (!localStorage.getItem(KEY_ZONE_DEFAULT_MIGRATION_KEY)) {
      const saved = stored?.keyZones;
      const unchanged = saved
        && saved.basic_attack?.x === 0.77 && saved.basic_attack?.y === 0.73 && saved.basic_attack?.width === 0.12
        && saved.skill?.x === 0.82 && saved.skill?.y === 0.49 && saved.skill?.width === 0.09
        && saved.switch?.x === 0.91 && saved.switch?.y === 0.02 && saved.switch?.width === 0.055;
      if (unchanged && stored) delete stored.keyZones;
      localStorage.setItem(KEY_ZONE_DEFAULT_MIGRATION_KEY, '1');
    }
    if (!localStorage.getItem(SIZE_DEFAULT_MIGRATION_KEY)) {
      if (stored) {
        // Keep the independently controlled content ratio at its original neutral value.
        if (Number(stored.overallScale) === .25) stored.overallScale = 1;
        if (Number(stored.autoWidthPadding) === 50) stored.autoWidthPadding = 8;
        if (Number(stored.scale) === .8 || Number(stored.scale) === .55) stored.scale = .4;
        if (Number(stored.textSpacing) === 5) stored.textSpacing = 0;
      }
      localStorage.setItem(SIZE_DEFAULT_MIGRATION_KEY, '1');
    }
    return normalizeAppearance(stored);
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

function isComboChart(value: unknown): value is ComboChart {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ComboChart>;
  return typeof candidate.title === 'string' && Array.isArray(candidate.steps);
}

function normalizeChart(chart: ComboChart): ComboChart {
  const now = Date.now();
  const id = typeof chart.id === 'string' && chart.id ? chart.id : `mobile-${now}-${Math.random().toString(36).slice(2)}`;
  const steps = chart.steps
    .filter((step): step is ComboStep => Boolean(step && typeof step === 'object'))
    .map((step, index) => ({
      ...step,
      id: typeof step.id === 'string' && step.id ? step.id : `${id}-step-${index}`,
      moveId: typeof step.moveId === 'string' ? step.moveId : 'unknown',
      label: typeof step.label === 'string' && step.label.trim() ? step.label.trim() : String(step.moveId || '操作'),
      startMin: Math.max(0, Number(step.startMin) || 0),
      startMax: Math.max(0, Number(step.startMax ?? step.startMin) || 0),
      durationMin: Math.max(80, Number(step.durationMin) || 1000),
      durationMax: Math.max(80, Number(step.durationMax ?? step.durationMin) || 1000),
      characterSlot: step.characterSlot && step.characterSlot >= 1 && step.characterSlot <= 4 ? step.characterSlot : undefined,
      color: typeof step.color === 'string' ? step.color : '#3487e0',
      samples: Array.isArray(step.samples) ? step.samples : []
    }))
    .map((step, order) => ({ step, order }))
    .sort((left, right) => left.step.startMin - right.step.startMin || left.step.startMax - right.step.startMax || left.order - right.order)
    .map(({ step }) => step);
  return {
    ...chart,
    id,
    title: chart.title.trim() || '未命名连段',
    character: typeof chart.character === 'string'
      ? chart.character.split(/\s*(?:\/|／|,|，|、|\|)\s*/u).map(canonicalMobileCharacterName).filter(Boolean).join(' / ')
      : chart.character,
    community: chart.community ? {
      ...chart.community,
      characters: Array.isArray(chart.community.characters)
        ? Array.from(new Set(chart.community.characters.map(canonicalMobileCharacterName).filter(Boolean)))
        : chart.community.characters
    } : chart.community,
    tags: Array.isArray(chart.tags) ? chart.tags : [],
    version: Number(chart.version) || 1,
    createdAt: Number(chart.createdAt) || now,
    updatedAt: now,
    startTriggerMoveId: chart.startTriggerMoveId || 'manual',
    steps
  };
}

function chartsFromValue(value: unknown): ComboChart[] {
  const object = value && typeof value === 'object' ? value as { chart?: unknown; charts?: unknown[] } : null;
  const candidates = Array.isArray(value)
    ? value
    : Array.isArray(object?.charts)
      ? object.charts
      : object?.chart
        ? [object.chart]
        : [value];
  const charts = candidates.filter(isComboChart).map(normalizeChart).filter((chart) => chart.steps.length > 0);
  if (!charts.length) throw new Error('没有找到可播放的连段谱');
  return charts;
}

function chartsFromJson(text: string): ComboChart[] {
  return chartsFromValue(JSON.parse(text) as unknown);
}

function readLibrary(): ComboChart[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter(isComboChart).map(normalizeChart) : [];
  } catch {
    return [];
  }
}

function phaseLabel(status: MobileStatus, language: MobileLanguage): string {
  if (!status.accessibilityEnabled) return mobileText(language, '需要授权');
  if (status.overlayEditing) return mobileText(language, '调整位置中');
  if (status.phase === 'playing') return mobileText(language, '播放中');
  if (status.assistantActive) return mobileText(language, '等待点击开始');
  return mobileText(language, '未运行');
}

function communityEmbedUrl(language: MobileLanguage): string {
  const url = new URL(COMMUNITY_URL);
  url.searchParams.set('client', '1');
  url.searchParams.set('lang', language);
  url.searchParams.set('theme', 'day');
  return url.toString();
}

function isCommunityImportMessage(value: unknown): value is CommunityImportMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as Partial<CommunityImportMessage>;
  return message.type === 'wwcombo:community-import'
    && message.version === 1
    && typeof message.requestId === 'string'
    && message.requestId.length > 0
    && message.requestId.length <= 120;
}

function libraryItems(library: ComboChart[]) {
  return library.slice(0, 200).map((chart) => ({
    id: chart.community?.id?.trim() || chart.id,
    localId: chart.id,
    title: chart.title,
    characters: [],
    stepCount: chart.steps.length,
    updatedAt: chart.updatedAt
  }));
}

function mobileMoveKey(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase().replace(/[\s-]+/gu, '_');
  const hold = /(?:_hold|hold)$/u.test(raw);
  const base = raw.replace(/(?:_hold|hold)$/u, '');
  const aliases: Record<string, string> = {
    basic: 'basic_attack', attack: 'basic_attack', normal_attack: 'basic_attack', basic_attack: 'basic_attack',
    heavy: 'heavy_attack', heavy_attack: 'heavy_attack',
    resonance_skill: 'skill', skill: 'skill',
    ultimate: 'liberation', resonance_liberation: 'liberation', liberation: 'liberation',
    echo: 'echo', dodge: 'dodge', tool: 'tool', jump: 'jump',
    intro: 'intro', outro: 'outro', finisher: 'finisher', forward: 'forward', empty_action: 'forward',
    switch_1: 'switch_1', switch_2: 'switch_2', switch_3: 'switch_3', switch_4: 'switch_4',
    i: 'switch_1', ii: 'switch_2', iii: 'switch_3', iv: 'switch_4',
    '1': 'switch_1', '2': 'switch_2', '3': 'switch_3', '4': 'switch_4',
    a: 'basic_attack', z: 'heavy_attack', e: 'skill', q: 'echo', r: 'liberation',
    s: 'dodge', j: 'jump', t: 'tool', f: 'finisher', w: 'forward'
  };
  const canonical = aliases[base] ?? aliases[raw] ?? base;
  if (canonical === 'basic_attack' && hold) return 'heavy_attack';
  if (hold && ['skill', 'echo', 'liberation', 'dodge', 'jump'].includes(canonical)) return `${canonical}_hold`;
  return canonical;
}

function isMobileSwitchMove(value: unknown): boolean {
  return /^switch_[1-4]$/u.test(mobileMoveKey(value));
}

function alignRecordedChartToAxis(axis: ComboChart, recorded: ComboChart): ComboChart {
  let cursor = 0;
  const steps = axis.steps.map((axisStep) => {
    const expected = mobileMoveKey(axisStep.moveId);
    const matchIndex = recorded.steps.findIndex((item, index) => index >= cursor && mobileMoveKey(item.moveId) === expected);
    if (matchIndex < 0) return axisStep;
    cursor = matchIndex + 1;
    const sample = recorded.steps[matchIndex];
    const duration = Math.max(35, sample.durationMin);
    return {
      ...axisStep,
      startMin: sample.startMin,
      startMax: Math.max(sample.startMin, sample.startMax),
      durationMin: duration,
      durationMax: Math.max(duration, sample.durationMax),
      samples: sample.samples?.length ? sample.samples : axisStep.samples
    };
  });
  return { ...axis, updatedAt: Date.now(), steps };
}

function iconSourceForStep(step: ComboStep, iconSet: MobileIconSet = 'classic'): string | undefined {
  const moveId = mobileMoveKey(step.moveId);
  if (iconSet === 'tide') {
    const tideNames: Record<string, string> = {
      basic_attack: 'basic_attack', heavy_attack: 'heavy_attack',
      skill: 'skill', skill_hold: 'skill_hold',
      liberation: 'liberation', liberation_hold: 'liberation_hold',
      echo: 'echo', echo_hold: 'echo_hold',
      dodge: 'dodge', dodge_hold: 'dodge_hold',
      jump: 'jump', jump_hold: 'jump_hold', tool: 'tool',
      intro: 'intro', outro: 'outro', finisher: 'finisher', forward: 'forward',
      switch_1: 'switch', switch_2: 'switch', switch_3: 'switch', switch_4: 'switch'
    };
    const tideIcon = tideNames[moveId];
    return tideIcon ? `/combo-assets/button-icons/tide/${tideIcon}.png` : undefined;
  }
  const names: Record<string, string> = {
    basic_attack: 'mouse-left', heavy_attack: 'mouse-left-hold',
    skill: 'skill', skill_hold: 'skill-hold',
    liberation: 'liberation', liberation_hold: 'liberation-hold',
    echo: 'echo', echo_hold: 'echo-hold',
    dodge: 'mouse-right', dodge_hold: 'mouse-right-hold',
    jump: 'jump', jump_hold: 'jump-hold', tool: 'tool',
    intro: 'intro', outro: 'outro', finisher: 'finisher', forward: 'forward',
    switch_1: 'i', switch_2: 'ii', switch_3: 'iii', switch_4: 'iv'
  };
  const icon = names[moveId];
  if (!icon) return undefined;
  // Keep the existing fourth-switch fallback until a dedicated asset is added.
  return `/combo-assets/button-icons/${icon === 'iv' ? 'iii' : icon}.png`;
}

function timelineStepIconSources(step: ComboStep, contentLabels: Record<string, string> | undefined, iconSet: MobileIconSet = 'classic'): string[] {
  const content = contentLabels?.[step.id]?.trim() || defaultComboContentLabelForMoveId(step.moveId) || '';
  const sources: string[] = [];
  if (content.startsWith('b')) sources.push(iconSet === 'tide' ? '/combo-assets/button-icons/tide/intro.png' : '/combo-assets/button-icons/intro.png');
  const action = iconSourceForStep(step, iconSet);
  if (action) sources.push(action);
  if (content.endsWith('y')) sources.push(iconSet === 'tide' ? '/combo-assets/button-icons/tide/outro.png' : '/combo-assets/button-icons/outro.png');
  return sources;
}

function isTimelineAuxiliaryStep(step: ComboStep): boolean {
  const move = mobileMoveKey(step.moveId);
  return move === 'basic_attack' || move === 'heavy_attack' || isMobileSwitchMove(move);
}

function timelineAxisPeriods(periods: ComboPeriod[]): ComboPeriod[] {
  return periods
    .filter((period) => period.kind === 'startup_axis' || period.kind === 'loop_axis')
    .sort((left, right) => left.endMs - right.endMs || left.startMs - right.startMs);
}

function rebuildTimelineAxisPeriods(source: ComboPeriod[], nodes: ComboPeriod[]): ComboPeriod[] {
  const nonAxis = source.filter((period) => period.kind !== 'startup_axis' && period.kind !== 'loop_axis');
  let cursor = 0;
  const axis = [...nodes]
    .sort((left, right) => left.endMs - right.endMs)
    .map((node, index) => {
      const endMs = Math.max(cursor + 80, Math.round(node.endMs));
      const kind: ComboPeriodKind = index === 0 ? 'startup_axis' : 'loop_axis';
      const period: ComboPeriod = {
        ...node,
        kind,
        label: index === 0 ? '启动轴' : `循环轴 ${index}`,
        loopIndex: index === 0 ? undefined : index,
        startMs: cursor,
        endMs
      };
      cursor = endMs;
      return period;
    });
  return [...nonAxis, ...axis];
}

function chartToMobileTextAxis(chart: ComboChart): string {
  const steps = [...chart.steps].sort((left, right) => left.startMin - right.startMin || left.startMax - right.startMax || left.id.localeCompare(right.id));
  const axisPeriods = timelineAxisPeriods(chart.periods ?? []);
  const lines: string[] = [];
  const startup = axisPeriods.find((period) => period.kind === 'startup_axis');
  if (startup) lines.push('启动轴：');

  const switchToken = (slot: number, intro: boolean) => `${'i'.repeat(Math.max(1, Math.min(4, slot)))}${intro ? 'b' : ''}`;
  const stepCode = (step: ComboStep): string => {
    const raw = chart.contentLabels?.[step.id]?.trim();
    const fallback = defaultTextAxisCodeForMove(step.moveId);
    if (raw && /^[A-Za-z]+$/u.test(raw)) {
      const base = raw.replace(/^b/u, '').replace(/y$/u, '');
      if (base) return base;
    }
    return fallback ?? step.moveId;
  };

  let currentSlot: number | null = null;
  let periodIndex = 0;
  steps.forEach((step) => {
    while (periodIndex < axisPeriods.length && step.startMin >= axisPeriods[periodIndex].startMs) {
      const period = axisPeriods[periodIndex];
      if (period.kind === 'loop_axis' && period.startMs > 0) lines.push(`循环轴${period.loopIndex ?? periodIndex}`);
      periodIndex += 1;
    }
    const slot = step.characterSlot ?? currentSlot ?? 1;
    const isSwitch = /^switch_[1-4]$/u.test(step.moveId);
    const content = chart.contentLabels?.[step.id]?.trim() ?? '';
    const intro = content.startsWith('b');
    if (isSwitch) {
      const target = Number(step.moveId.slice(-1));
      lines.push(switchToken(target, intro));
      currentSlot = target;
      return;
    }
    if (currentSlot !== slot) {
      lines.push(switchToken(slot, false));
      currentSlot = slot;
    }
    if (intro) lines.push('变奏');
    lines.push(stepCode(step));
    if (content.endsWith('y')) lines.push('延奏');
  });
  while (periodIndex < axisPeriods.length) {
    const period = axisPeriods[periodIndex];
    if (period.kind === 'loop_axis' && period.startMs > 0) lines.push(`循环轴${period.loopIndex ?? periodIndex}`);
    periodIndex += 1;
  }
  return lines.join(' ').replace(/启动轴：\s+/u, '启动轴：\n');
}

function mergePreviewSteps(steps: ComboStep[], appearance: MobileOverlaySettings): ComboStep[][] {
  const sorted = steps
    .map((step, order) => ({ step, order }))
    .sort((left, right) => left.step.startMin - right.step.startMin || left.step.startMax - right.step.startMax || left.order - right.order)
    .map(({ step }) => step);
  if (!appearance.mergeSameRoleSteps && !appearance.mergeSameMoveSteps) return sorted.map((step) => [step]);
  const groups: ComboStep[][] = [];
  sorted.forEach((step) => {
    const previous = groups.at(-1);
    const isSwitch = isMobileSwitchMove(step.moveId);
    // Match the desktop grouping contract: a switch item starts the next
    // role group, and following actions belong to that group. In particular,
    // never split merely because the current group contains a switch item.
    if (!previous || isSwitch) {
      groups.push([step]);
      return;
    }
    const sameRole = appearance.mergeSameRoleSteps && previous.length < appearance.mergeSameRoleLimit;
    const sameMove = appearance.mergeSameMoveSteps && mobileMoveKey(previous.at(-1)?.moveId) === mobileMoveKey(step.moveId);
    if (sameRole || sameMove) previous.push(step);
    else groups.push([step]);
  });
  return groups;
}

function previewMoveSegments(group: ComboStep[], appearance: MobileOverlaySettings): ComboStep[][] {
  if (!appearance.mergeSameMoveSteps) return group.map((step) => [step]);
  const segments: ComboStep[][] = [];
  group.forEach((step) => {
    const previous = segments.at(-1);
    if (previous && mobileMoveKey(previous[0].moveId) === mobileMoveKey(step.moveId)) previous.push(step);
    else segments.push([step]);
  });
  return segments;
}

function previewBlockMetrics(step: ComboStep, appearance: MobileOverlaySettings, group: ComboStep[] = [step]): { width?: string; minHeight: string; flexBasis?: string } {
  const contentScale = appearance.overallScale * appearance.scale;
  const scale = Math.max(.05, contentScale);
  const height = (appearance.blockMode === 'image' ? appearance.imageBlockHeight : appearance.capsuleHeight) * scale;
  const avatarLayout = mobilePreviewAvatarLayout(appearance, scale);
  const avatarWidth = appearance.avatarEnabled ? avatarLayout.contentStart + 6 * scale : 0;
  const iconSize = mobilePreviewIconSize(appearance, height, scale);
  const moveSegments = previewMoveSegments(group, appearance);
  const iconCount = appearance.convertIcons ? moveSegments.length : 0;
  const countWidth = moveSegments.reduce((width, segment) => segment.length > 1 ? width + appearance.fontSize * .62 * scale * (String(segment.length).length + 1.5) : width, 0);
  const labelWidth = appearance.convertIcons
    ? countWidth
    : appearance.fontSize * .62 * scale * Math.max(1, group.map((item) => mobileMoveKey(item.moveId)).join(' ').length);
  const contentWidth = avatarWidth + iconCount * iconSize + Math.max(0, iconCount - 1) * 4 * scale + labelWidth + appearance.autoWidthPadding * scale + 16 * scale;
  if (appearance.layout === 'text') {
    const width = Math.max(110 * scale, contentWidth);
    return { width: `${width}px`, minHeight: `${Math.max(48, height)}px`, flexBasis: `${width}px` };
  }
  if (appearance.capsuleWidthMode === 'fixed') {
    const width = appearance.capsuleWidth * scale;
    return { width: `${width}px`, minHeight: `${height}px`, flexBasis: `${width}px` };
  }
  const slot = String(step.characterSlot ?? 1);
  const crop = appearance.baseCrops[slot] ?? appearance.baseCrop;
  const size = appearance.baseImageSizes[slot];
  const stretch = appearance.baseStretches[slot] ?? appearance.capsuleStretch;
  const naturalWidth = size?.width ?? 426;
  const naturalHeight = size?.height ?? 426;
  const cropWidth = Math.max(1, naturalWidth * crop.w / 100);
  const cropHeight = Math.max(1, naturalHeight * crop.h / 100);
  const cropX = naturalWidth * crop.x / 100;
  const left = Math.max(1, Math.min(cropWidth - 2, naturalWidth * stretch.left / 100 - cropX));
  const right = Math.max(left + 1, Math.min(cropWidth - 1, naturalWidth * stretch.right / 100 - cropX));
  const imageMinimum = appearance.blockMode === 'image'
    // Keep this in lockstep with the desktop comboImageStretchMinWidth helper.
    ? (left + Math.max(0, cropWidth - right)) * height / cropHeight + Math.max(24, height * .42)
    : 68 * scale;
  const iconWidth = appearance.convertIcons ? 42 * scale : 0;
  const width = Math.max(92 * scale, height * 1.45, imageMinimum, contentWidth);
  return { width: `${width}px`, minHeight: `${height}px`, flexBasis: `${width}px` };
}

function mobilePreviewAvatarSize(appearance: MobileOverlaySettings, contentScale: number): number {
  // Desktop lets portraits extend beyond the image block. Mirroring that
  // behavior makes the avatar-size control genuinely useful on mobile too.
  return Math.max(8, appearance.avatarSize * Math.max(.05, contentScale));
}

function mobilePreviewIconSize(appearance: MobileOverlaySettings, blockHeight: number, contentScale: number): number {
  const baseSize = Math.max(12, Math.min(blockHeight * .72, appearance.fontSize * 1.75 * Math.max(.05, contentScale)));
  return Math.max(5, baseSize * appearance.iconScale);
}

function mobilePreviewIconFeedbackVars(appearance: MobileOverlaySettings): React.CSSProperties {
  const scale = appearance.iconScale;
  const markerSize = Math.max(3, 5 * scale);
  const markerGap = Math.max(1.5, 3 * scale);
  return {
    '--preview-active-padding': `${Math.max(1, 3 * scale)}px`,
    '--preview-marker-size': `${markerSize}px`,
    '--preview-marker-gap': `${markerGap}px`,
    '--preview-marker-offset': `${markerSize + markerGap}px`
  } as React.CSSProperties;
}

function mobilePreviewTextVars(appearance: MobileOverlaySettings, contentScale: number): React.CSSProperties {
  return {
    '--preview-count-size': `${Math.max(8, appearance.fontSize * Math.max(.05, contentScale) * .82)}px`,
    '--preview-text-color': appearance.textColor,
    '--preview-text-font': appearance.fontFamily,
    '--preview-text-stroke-width': `${appearance.textStrokeEnabled ? appearance.textStrokeWidth : 0}px`,
    '--preview-text-stroke-color': appearance.textStrokeColor,
    '--preview-text-stroke': appearance.textStrokeEnabled ? `0 0 ${appearance.textStrokeWidth}px ${appearance.textStrokeColor}` : 'none'
  } as React.CSSProperties;
}

function mobilePreviewAvatarLayout(appearance: MobileOverlaySettings, contentScale: number) {
  const scale = Math.max(.05, contentScale);
  const avatarSize = mobilePreviewAvatarSize(appearance, scale);
  const avatarLeft = 4 * scale + appearance.avatarOffsetX * scale;
  return {
    avatarSize,
    avatarOffsetX: appearance.avatarOffsetX * scale,
    avatarOffsetY: appearance.avatarOffsetY * scale,
    // The action content starts after the portrait's right edge, even when
    // the portrait is enlarged or moved to the right.
    contentStart: appearance.avatarEnabled ? Math.max(4 * scale, avatarLeft + avatarSize + 6 * scale) : 6 * scale
  };
}

function mobileCssPx(value: number): string {
  return `${Number(value.toFixed(3))}px`;
}

/**
 * The mobile preview uses the same crop and three-slice mathematics as the
 * desktop overlay. The API stretch coordinates belong to the uncropped source
 * image, so they must be translated into crop-local coordinates first.
 */
function mobileCapsuleBackgroundStyle(appearance: MobileOverlaySettings, step: ComboStep, targetWidthInput: number, targetHeightInput: number) {
  const slot = String(step.characterSlot ?? 1);
  const source = appearance.layout !== 'text' && appearance.blockMode === 'image' ? appearance.baseSources[slot] : undefined;
  if (!source) return { source: undefined, style: undefined };

  const natural = appearance.baseImageSizes[slot] ?? { width: 426, height: 426 };
  const crop = appearance.baseCrops[slot] ?? appearance.baseCrop;
  const stretch = appearance.baseStretches[slot] ?? appearance.capsuleStretch;
  const naturalWidth = Math.max(1, natural.width);
  const naturalHeight = Math.max(1, natural.height);
  const cropX = Math.round(crop.x / 100 * naturalWidth);
  const cropY = Math.round(crop.y / 100 * naturalHeight);
  const cropWidth = Math.max(1, Math.round(crop.w / 100 * naturalWidth));
  const cropHeight = Math.max(1, Math.round(crop.h / 100 * naturalHeight));
  const leftLine = Math.round(Math.max(1, Math.min(cropWidth - 2, stretch.left / 100 * naturalWidth - cropX)));
  const rightLine = Math.round(Math.max(leftLine + 1, Math.min(cropWidth - 1, stretch.right / 100 * naturalWidth - cropX)));
  const targetWidth = Math.max(1, Math.round(targetWidthInput));
  const targetHeight = Math.max(1, Math.round(targetHeightInput));
  const heightScale = targetHeight / cropHeight;
  const rawDestLeft = Math.max(0, leftLine * heightScale);
  const rawDestRight = Math.max(0, (cropWidth - rightLine) * heightScale);
  const minMiddle = Math.min(targetWidth, Math.max(24, targetHeight * .42));
  const availableForEdges = Math.max(0, targetWidth - minMiddle);
  const edgeScale = rawDestLeft + rawDestRight > availableForEdges
    ? availableForEdges / Math.max(1, rawDestLeft + rawDestRight)
    : 1;
  const destLeft = Math.min(targetWidth, Math.max(0, Math.round(rawDestLeft * edgeScale)));
  const destRight = Math.max(0, Math.min(targetWidth - destLeft, Math.round(rawDestRight * edgeScale)));
  const destMiddle = Math.max(0, targetWidth - destLeft - destRight);
  const leftScaleX = destLeft / Math.max(1, leftLine);
  const middleScaleX = destMiddle / Math.max(1, rightLine - leftLine);
  const rightScaleX = destRight / Math.max(1, cropWidth - rightLine);
  const escapedSource = source.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  return {
    source,
    style: {
      '--mobile-base-image': `url("${escapedSource}")`,
      '--base-left-width': mobileCssPx(destLeft),
      '--base-right-width': mobileCssPx(destRight),
      '--base-left-bg-size': `${mobileCssPx(naturalWidth * leftScaleX)} ${mobileCssPx(naturalHeight * heightScale)}`,
      '--base-left-bg-position': `${mobileCssPx(-cropX * leftScaleX)} ${mobileCssPx(-cropY * heightScale)}`,
      '--base-middle-bg-size': `${mobileCssPx(naturalWidth * middleScaleX)} ${mobileCssPx(naturalHeight * heightScale)}`,
      '--base-middle-bg-position': `${mobileCssPx(-(cropX + leftLine) * middleScaleX)} ${mobileCssPx(-cropY * heightScale)}`,
      '--base-right-bg-size': `${mobileCssPx(naturalWidth * rightScaleX)} ${mobileCssPx(naturalHeight * heightScale)}`,
      '--base-right-bg-position': `${mobileCssPx(-(cropX + rightLine) * rightScaleX)} ${mobileCssPx(-cropY * heightScale)}`
    } as React.CSSProperties
  };
}

function MobileTimelineTextPreview({ chart, appearance, activeTimeMs, className = '' }: {
  chart: ComboChart;
  appearance: MobileOverlaySettings;
  activeTimeMs?: number;
  className?: string;
}) {
  const groups = mergePreviewSteps(chart.steps, appearance);
  return <div className={`mobile-timeline-preview-strip ${className}`.trim()}>
    {groups.map((group) => {
      const step = group[0];
      const active = activeTimeMs !== undefined && group.some((item) => activeTimeMs >= item.startMin && activeTimeMs <= item.startMin + item.durationMax);
      const moveSegments = previewMoveSegments(group, appearance);
      return <div key={step.id} className={`mobile-timeline-preview-item ${active ? 'active' : ''}`}>
        <img className="mobile-timeline-preview-avatar" src={appearance.avatarSources[String(step.characterSlot ?? 1)] || `/combo-assets/avatar-presets/role-${step.characterSlot ?? 1}.webp`} alt="" />
        <span className="mobile-timeline-preview-diamond">◆</span>
        <span className="mobile-timeline-preview-icons">{moveSegments.map((segment) => {
          const item = segment[0];
          const sources = timelineStepIconSources(item, chart.contentLabels, appearance.iconSet);
          return <span className="mobile-timeline-preview-move" key={item.id}>
            {sources.length ? sources.map((src, iconIndex) => <img key={`${item.id}-${src}-${iconIndex}`} src={src} alt="" />) : <b>{item.label}</b>}
            {segment.length > 1 && <em>x{segment.length}</em>}
          </span>;
        })}</span>
      </div>;
    })}
  </div>;
}

function mobileExpandedPreviewPeriods(chart: ComboChart): { periods: ComboPeriod[]; loopCount: number } {
  const axis = (chart.periods ?? [])
    .filter((period) => period.kind === 'startup_axis' || period.kind === 'loop_axis')
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs || left.id.localeCompare(right.id));
  const startup = axis.find((period) => period.kind === 'startup_axis');
  const loops = axis.filter((period) => period.kind === 'loop_axis');
  const visible = [startup, loops[0]].filter((period): period is ComboPeriod => Boolean(period));
  if (visible.length) return { periods: visible, loopCount: loops.length };
  const endMs = Math.max(1, ...chart.steps.map((step) => step.startMin + Math.max(step.durationMin, step.durationMax) + (step.recoveryMs ?? 0)));
  return {
    periods: [{ id: 'mobile-expanded-full-axis', kind: 'startup_axis', label: '启动轴', startMs: 0, endMs }],
    loopCount: 0
  };
}

function mobileExpandedPeriodLabel(period: ComboPeriod, loopCount: number, language: MobileLanguage): string {
  if (period.kind === 'startup_axis') return mobileText(language, '启动轴');
  if (period.kind === 'loop_axis') {
    const index = period.loopIndex ?? 1;
    if (language === 'en-US') return loopCount > 1 ? `Loop ${index}` : mobileText(language, '循环轴');
    return loopCount > 1 ? `循环轴${index}` : mobileText(language, '循环轴');
  }
  return period.label;
}

function mobileExpandedPreviewBaseStyle(appearance: MobileOverlaySettings, step: ComboStep, width: number, height: number) {
  return mobileCapsuleBackgroundStyle(appearance, step, width, height);
}

function MobileExpandedPreviewBlock({ group, appearance, contentLabels, active }: { group: ComboStep[]; appearance: MobileOverlaySettings; contentLabels?: Record<string, string>; active: boolean }) {
  const step = group[0];
  const moveSegments = previewMoveSegments(group, appearance);
  const metrics = previewBlockMetrics(step, appearance, group);
  const width = Number.parseFloat(metrics.width ?? '110');
  const height = Number.parseFloat(metrics.minHeight);
  const base = mobileExpandedPreviewBaseStyle(appearance, step, width, height);
  const renderScale = Math.max(.05, appearance.overallScale * appearance.scale);
  const iconSize = mobilePreviewIconSize(appearance, height, renderScale);
  const avatarLayout = mobilePreviewAvatarLayout(appearance, renderScale);
  const iconFeedbackVars = mobilePreviewIconFeedbackVars(appearance);
  const textVars = mobilePreviewTextVars(appearance, renderScale);
  const slot = String(step.characterSlot ?? 1);
  const hasSameMoveMerge = moveSegments.some((segment) => segment.length > 1);
  return <div
    className={`mobile-preview-step mobile-expanded-preview-block ${active ? 'current' : ''} ${appearance.capsuleShape} ${hasSameMoveMerge ? 'merged' : ''} ${base.source ? 'has-base-slice' : ''}`}
    style={{
      ...metrics,
      ...base.style,
      height: metrics.minHeight,
      '--preview-icon-size': `${iconSize}px`,
      '--preview-avatar-size': `${avatarLayout.avatarSize}px`,
      '--preview-avatar-offset-x': `${avatarLayout.avatarOffsetX}px`,
      '--preview-avatar-offset-y': `${avatarLayout.avatarOffsetY}px`,
      '--preview-content-start': `${avatarLayout.contentStart}px`,
      '--preview-inner-gap': `${Math.max(1, 4 * renderScale)}px`,
      ...iconFeedbackVars,
      ...textVars,
      background: base.source ? undefined : (active ? appearance.activeColor : appearance.backgroundColor),
      borderColor: appearance.borderColor,
      color: '#ffffff',
      opacity: appearance.opacity,
      fontFamily: appearance.fontFamily,
      textShadow: appearance.textStrokeEnabled ? `0 0 ${appearance.textStrokeWidth}px ${appearance.textStrokeColor}` : undefined
    } as React.CSSProperties}
  >
    {base.source && <><i className="mobile-preview-base-slice left" /><i className="mobile-preview-base-slice middle" /><i className="mobile-preview-base-slice right" /></>}
    {appearance.avatarEnabled && <img className="mobile-preview-avatar" src={appearance.avatarSources[slot] || `/combo-assets/avatar-presets/role-${slot}.webp`} alt="" />}
    <span className="mobile-preview-content">
      {moveSegments.map((segment, segmentIndex) => {
        const item = segment[0];
        const sources = timelineStepIconSources(item, contentLabels, appearance.iconSet);
        return <span className="mobile-preview-move-segment" key={item.id}>
          {appearance.convertIcons
            ? (sources.length ? sources.map((source, sourceIndex) => <img className={`mobile-preview-icon ${active && segmentIndex === 0 && sourceIndex === sources.length - 1 ? 'active' : ''}`} key={`${item.id}-${source}-${sourceIndex}`} src={source} alt={item.moveId} />) : <strong style={{ fontSize: `${appearance.fontSize}px` }}>{item.moveId}</strong>)
            : <strong style={{ fontSize: `${appearance.fontSize}px` }}>{item.moveId}</strong>}
          {segment.length > 1 && <b className="mobile-preview-count">x{segment.length}</b>}
          {segment.length > 1 && <span className="mobile-preview-merge-markers">{segment.map((member, markerIndex) => <i className={active && markerIndex === 0 ? 'active' : ''} key={member.id} />)}</span>}
        </span>;
      })}
    </span>
  </div>;
}

function MobileExpandedAxisPreview({ chart, appearance, activeStepId, language, onClose }: {
  chart: ComboChart;
  appearance: MobileOverlaySettings;
  activeStepId?: string;
  language: MobileLanguage;
  onClose: () => void;
}) {
  const { periods, loopCount } = mobileExpandedPreviewPeriods(chart);
  return <div className="mobile-expanded-preview-backdrop" role="presentation">
    <section className="mobile-expanded-preview" role="dialog" aria-modal="true" aria-label={mobileText(language, '连段图预览')}>
      <header className="mobile-expanded-preview-head">
        <div><strong>{mobileText(language, '连段图预览')}</strong><span>{mobileText(language, '启动轴')} + {mobileText(language, '循环轴')}</span></div>
        <button type="button" className="mobile-icon-button" onClick={onClose} aria-label={mobileText(language, '收起')}><X size={19} />{mobileText(language, '收起')}</button>
      </header>
      <div className="mobile-expanded-preview-scroll">
        {periods.map((period) => {
          const steps = chart.steps
            .filter((step) => step.startMin >= period.startMs && step.startMin < period.endMs)
            .sort((left, right) => left.startMin - right.startMin || left.startMax - right.startMax || left.id.localeCompare(right.id));
          const groups = mergePreviewSteps(steps, appearance);
          return <section key={period.id} className="mobile-expanded-axis-section">
            <div className="mobile-expanded-axis-heading"><strong>{mobileExpandedPeriodLabel(period, loopCount, language)}</strong><span>{(period.startMs / 1000).toFixed(2)}s - {(period.endMs / 1000).toFixed(2)}s</span></div>
            <div className="mobile-expanded-axis-flow">
              {groups.length ? groups.map((group, index) => {
                const step = group[0];
                const content = chart.contentLabels?.[step.id]?.trim() || defaultComboContentLabelForMoveId(step.moveId) || '';
                const variation = content.startsWith('b');
                return <span className="mobile-expanded-axis-item" key={step.id}>
                  {(index > 0 || variation) && <span className="mobile-expanded-axis-arrow" aria-hidden="true">{variation ? <><ChevronRight /><ChevronRight /></> : <ChevronRight />}</span>}
                  <MobileExpandedPreviewBlock group={group} appearance={appearance} contentLabels={chart.contentLabels} active={Boolean(activeStepId && group.some((item) => item.id === activeStepId))} />
                </span>;
              }) : <span className="mobile-expanded-axis-empty">{mobileText(language, '该轴暂无操作')}</span>}
            </div>
          </section>;
        })}
      </div>
    </section>
  </div>;
}

function simulatorMoveMatchesKey(step: ComboStep, key: MobileKeyAction): boolean {
  const move = mobileMoveKey(step.moveId);
  if (key === 'switch') return isMobileSwitchMove(move);
  if (key === 'basic_attack') return move === 'basic_attack' || move === 'heavy_attack';
  if (key === 'skill') return move === 'skill' || move === 'skill_hold';
  if (key === 'echo') return move === 'echo' || move === 'echo_hold';
  if (key === 'liberation') return move === 'liberation' || move === 'liberation_hold';
  if (key === 'dodge') return move === 'dodge' || move === 'dodge_hold';
  if (key === 'jump') return move === 'jump' || move === 'jump_hold';
  return move === key;
}

function MobileDebugGamePreview({ chart, appearance, language, onClose }: {
  chart: ComboChart;
  appearance: MobileOverlaySettings;
  language: MobileLanguage;
  onClose: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [showZones, setShowZones] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [agentAction, setAgentAction] = useState<MobileKeyAction | null>(null);
  const steps = useMemo(() => [...chart.steps].sort((left, right) => left.startMin - right.startMin || left.startMax - right.startMax || left.id.localeCompare(right.id)), [chart.steps]);
  const groups = useMemo(() => mergePreviewSteps(steps, appearance), [steps, appearance.mergeSameRoleSteps, appearance.mergeSameMoveSteps, appearance.mergeSameRoleLimit]);
  const currentStep = steps[clamp(currentStepIndex, 0, Math.max(0, steps.length - 1), 0)];
  const currentGroupIndex = Math.max(0, groups.findIndex((group) => group.some((step) => step.id === currentStep?.id)));
  const visibleGroups = groups.slice(Math.max(0, currentGroupIndex - 1), Math.min(groups.length, currentGroupIndex + 6));

  useEffect(() => {
    if (!running || appearance.playbackMode === 'progress') return;
    const timer = window.setInterval(() => {
      setCurrentStepIndex((index) => {
        if (index >= steps.length - 1) {
          setRunning(false);
          setAgentAction(null);
          setFeedback(language === 'en-US'
            ? `${appearance.playbackMode === 'agent' ? 'Agent' : 'Demo'} complete`
            : `${appearance.playbackMode === 'agent' ? '代理' : '演示'}播放完成`);
          return index;
        }
        return index + 1;
      });
    }, 650);
    return () => window.clearInterval(timer);
  }, [appearance.playbackMode, language, running, steps.length]);

  useEffect(() => {
    if (!running || appearance.playbackMode !== 'agent' || !currentStep) {
      setAgentAction(null);
      return;
    }
    const action = MOBILE_KEY_ACTIONS.find(({ key }) => simulatorMoveMatchesKey(currentStep, key))?.key ?? null;
    setAgentAction(action);
    if (action) setFeedback(language === 'en-US' ? `Agent tap · ${currentStep.label}` : `代理点击 · ${currentStep.label}`);
    const timer = window.setTimeout(() => setAgentAction(null), 220);
    return () => window.clearTimeout(timer);
  }, [appearance.playbackMode, currentStep, language, running]);

  const playbackModeLabel = mobileText(language, appearance.playbackMode === 'progress' ? '推进' : appearance.playbackMode === 'agent' ? '代理' : '演示');

  function startSimulation() {
    setCurrentStepIndex(0);
    setRunning(true);
    setFeedback(language === 'en-US' ? `Started · ${playbackModeLabel}` : `已开始 · ${playbackModeLabel}`);
  }

  function stopSimulation() {
    setRunning(false);
    setCurrentStepIndex(0);
    setAgentAction(null);
    setFeedback(language === 'en-US' ? 'Stopped by Exit Challenge' : '已通过退出挑战区域停止');
  }

  function pressAction(key: MobileKeyAction) {
    if (!running) {
      setFeedback(language === 'en-US' ? 'Tap Start Challenge first' : '请先点击开始挑战区域');
      return;
    }
    if (appearance.playbackMode !== 'progress') {
      setFeedback(language === 'en-US'
        ? `${playbackModeLabel} follows its timer`
        : `${playbackModeLabel}模式按时间自动播放`);
      return;
    }
    if (!currentStep || !simulatorMoveMatchesKey(currentStep, key)) {
      setFeedback(language === 'en-US' ? `Wrong input · expected ${currentStep?.label ?? 'none'}` : `输入不匹配 · 当前需要 ${currentStep?.label ?? '无'}`);
      return;
    }
    if (currentStepIndex >= steps.length - 1) {
      setRunning(false);
      setFeedback(language === 'en-US' ? 'Progress complete' : '推进播放完成');
      return;
    }
    setCurrentStepIndex((index) => index + 1);
    setFeedback(language === 'en-US' ? `Accepted · ${currentStep.label}` : `已响应 · ${currentStep.label}`);
  }

  return <div className="mobile-debug-preview-backdrop">
    <section className="mobile-debug-preview" role="dialog" aria-modal="true" aria-label={mobileText(language, '模拟游戏')}>
      <header className="mobile-debug-preview-head">
        <div><strong>{mobileText(language, '模拟游戏')}</strong><span>16:9 · {playbackModeLabel}</span></div>
        <div className="mobile-debug-preview-head-actions"><button type="button" onClick={() => setShowZones((value) => !value)}>{showZones ? (language === 'en-US' ? 'Hide zones' : '隐藏区域') : (language === 'en-US' ? 'Show zones' : '显示区域')}</button><button type="button" className="mobile-icon-button" onClick={onClose} aria-label={mobileText(language, '退出模拟')}><X size={18} /></button></div>
      </header>
      <div className={`mobile-debug-game-stage ${running ? 'running' : ''}`}>
        <div className="mobile-debug-game-status"><span className={running ? 'running' : ''} />{running ? (language === 'en-US' ? 'Challenge active' : '挑战进行中') : (language === 'en-US' ? 'Waiting for Start Challenge' : '等待开始挑战')}<b>{feedback}</b></div>
        <div className="mobile-debug-game-overlay" style={{ left: `${(appearance.x - appearance.width / 2) * 100}%`, top: `${appearance.y * 100}%`, width: `${appearance.width * 100}%`, height: `${appearance.displayHeight * 100}%`, opacity: appearance.opacity }}>
          <div className={`mobile-debug-game-track ${appearance.layout}`}>
            {visibleGroups.map((group) => <MobileExpandedPreviewBlock key={group[0].id} group={group} appearance={appearance} contentLabels={chart.contentLabels} active={Boolean(currentStep && group.some((step) => step.id === currentStep.id))} />)}
          </div>
        </div>
        {showZones && <>
          <button type="button" className="mobile-debug-tap-zone mobile-debug-start-zone" style={{ left: `${appearance.startZone.x * 100}%`, top: `${appearance.startZone.y * 100}%`, width: `${appearance.startZone.width * 100}%`, height: `${appearance.startZone.height * 100}%` }} onClick={startSimulation}><span>{language === 'en-US' ? 'Start Challenge' : '开始挑战'}</span></button>
          <button type="button" className="mobile-debug-tap-zone mobile-debug-exit-zone" style={{ left: `${appearance.exitZone.x * 100}%`, top: `${appearance.exitZone.y * 100}%`, width: `${appearance.exitZone.width * 100}%`, height: `${appearance.exitZone.height * 100}%` }} onClick={stopSimulation}><span>{language === 'en-US' ? 'Exit Challenge' : '退出挑战'}</span></button>
          <div className="mobile-debug-key-zones">{MOBILE_KEY_ACTIONS.map(({ key, label, switch: isSwitch }) => { const zone = appearance.keyZones[key]; return <button type="button" key={key} className={`mobile-debug-key-zone ${isSwitch ? 'switch' : ''} ${agentAction === key ? 'agent-active' : ''}`} style={{ left: `${zone.x * 100}%`, top: `${zone.y * 100}%`, width: `${zone.width * 100}%`, height: `${zone.height * 100}%` }} onClick={() => pressAction(key)}><Gamepad2 size={isSwitch ? 16 : 18} /><span>{mobileText(language, label)}</span></button>; })}</div>
        </>}
      </div>
      <footer className="mobile-debug-preview-footer"><span>{language === 'en-US' ? `${currentStepIndex + 1} / ${steps.length} actions` : `${currentStepIndex + 1} / ${steps.length} 个招式块`}</span><button type="button" onClick={startSimulation}>{language === 'en-US' ? 'Start' : '开始'}</button><button type="button" onClick={stopSimulation}>{language === 'en-US' ? 'Stop' : '停止'}</button></footer>
    </section>
  </div>;
}

function EditorFrame({ label, zone, color, onChange }: {
  label: string;
  zone: TriggerZone;
  color: string;
  onChange: (patch: Partial<TriggerZone>) => void;
}) {
  const dragRef = useRef<{ x: number; y: number; zone: TriggerZone; resize: boolean } | null>(null);
  const handlePointerDown = (event: React.PointerEvent<HTMLElement>, resize = false) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, zone, resize };
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const stage = event.currentTarget.closest('.mobile-editor-stage') as HTMLElement | null;
    if (!stage) return;
    const dx = (event.clientX - drag.x) / Math.max(1, stage.clientWidth);
    const dy = (event.clientY - drag.y) / Math.max(1, stage.clientHeight);
    if (drag.resize) {
      onChange({ width: Math.min(1 - drag.zone.x, Math.max(0.08, drag.zone.width + dx)), height: Math.min(1 - drag.zone.y, Math.max(0.08, drag.zone.height + dy)) });
    } else {
      onChange({ x: Math.min(1 - drag.zone.width, Math.max(0, drag.zone.x + dx)), y: Math.min(1 - drag.zone.height, Math.max(0, drag.zone.y + dy)) });
    }
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY, zone: { ...drag.zone, ...(drag.resize ? { width: drag.zone.width + dx, height: drag.zone.height + dy } : { x: drag.zone.x + dx, y: drag.zone.y + dy }) } };
  };
  const stop = () => { dragRef.current = null; };
  return <div className="mobile-editor-frame" style={{ left: `${zone.x * 100}%`, top: `${zone.y * 100}%`, width: `${zone.width * 100}%`, height: `${zone.height * 100}%`, borderColor: color }} onPointerDown={(event) => handlePointerDown(event)} onPointerMove={handlePointerMove} onPointerUp={stop} onPointerCancel={stop}>
    <strong>{label}</strong><span className="mobile-editor-resize" style={{ background: color }} onPointerDown={(event) => { event.stopPropagation(); handlePointerDown(event, true); }} />
  </div>;
}

function KeyZoneFrame({ label, zone, color, vertical, onChange }: {
  label: string;
  zone: TriggerZone;
  color: string;
  vertical?: boolean;
  onChange: (patch: Partial<TriggerZone>) => void;
}) {
  const dragRef = useRef<{ x: number; y: number; zone: TriggerZone; resize: boolean } | null>(null);
  const handlePointerDown = (event: React.PointerEvent<HTMLElement>, resize = false) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, zone, resize };
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const stage = event.currentTarget.closest('.mobile-editor-stage') as HTMLElement | null;
    if (!stage) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    const dx = deltaX / Math.max(1, stage.clientWidth);
    const dy = deltaY / Math.max(1, stage.clientHeight);
    let nextZone: TriggerZone;
    if (drag.resize) {
      const shapeRatio = vertical ? 2 : 1;
      const resizePixels = Math.abs(deltaX) >= Math.abs(deltaY / shapeRatio) ? deltaX : deltaY / shapeRatio;
      const width = Math.min(1 - drag.zone.x, Math.max(0.04, drag.zone.width + resizePixels / Math.max(1, stage.clientWidth)));
      const height = Math.min(1 - drag.zone.y, width * stage.clientWidth / Math.max(1, stage.clientHeight) * shapeRatio);
      onChange({ width, height });
      nextZone = { ...drag.zone, width, height };
    } else {
      const y = Math.min(1 - event.currentTarget.offsetHeight / Math.max(1, stage.clientHeight), Math.max(0, drag.zone.y + dy));
      onChange({
        x: Math.min(1 - drag.zone.width, Math.max(0, drag.zone.x + dx)),
        y
      });
      nextZone = { ...drag.zone, x: drag.zone.x + dx, y };
    }
    dragRef.current = {
      ...drag,
      x: event.clientX,
      y: event.clientY,
      zone: nextZone
    };
  };
  const stop = () => { dragRef.current = null; };
  return <div
    className={`mobile-editor-key-frame ${vertical ? 'vertical' : 'round'}`}
    style={{ left: `${zone.x * 100}%`, top: `${zone.y * 100}%`, width: `${zone.width * 100}%`, height: 'auto', aspectRatio: vertical ? '1 / 2' : '1', borderColor: color, '--key-color': color } as React.CSSProperties}
    onPointerDown={(event) => handlePointerDown(event)}
    onPointerMove={handlePointerMove}
    onPointerUp={stop}
    onPointerCancel={stop}
  >
    <strong>{label}</strong>
    <span className="mobile-editor-resize" style={{ background: color }} onPointerDown={(event) => handlePointerDown(event, true)} />
  </div>;
}

function ChartFrame({ appearance, onChange, children }: {
  appearance: MobileOverlaySettings;
  onChange: (patch: Partial<Pick<MobileOverlaySettings, 'x' | 'y' | 'width' | 'displayHeight' | 'scale'>>) => void;
  children: ReactNode;
}) {
  type DragMode = 'move' | 'left' | 'right' | 'top' | 'bottom';
  const dragRef = useRef<{ x: number; y: number; mode: DragMode; snapshot: MobileOverlaySettings } | null>(null);
  const handlePointerDown = (event: React.PointerEvent<HTMLElement>, mode: DragMode = 'move') => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, mode, snapshot: appearance };
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const stage = event.currentTarget.closest('.mobile-editor-stage') as HTMLElement | null;
    if (!stage) return;
    const dx = (event.clientX - drag.x) / Math.max(1, stage.clientWidth);
    const dy = (event.clientY - drag.y) / Math.max(1, stage.clientHeight);
    const snapshot = drag.snapshot;
    if (drag.mode === 'move') {
      onChange({
        x: Math.min(1 - snapshot.width / 2, Math.max(snapshot.width / 2, snapshot.x + dx)),
        y: Math.min(1 - snapshot.displayHeight, Math.max(0, snapshot.y + dy))
      });
    } else if (drag.mode === 'left' || drag.mode === 'right') {
      const signed = drag.mode === 'left' ? -dx : dx;
      const width = Math.min(1, Math.max(0.12, snapshot.width + signed));
      onChange({ width, x: Math.min(1 - width / 2, Math.max(width / 2, snapshot.x + (snapshot.width - width) / 2 * (drag.mode === 'left' ? 1 : -1))) });
    } else if (appearance.layout === 'horizontal') {
      const scale = Math.min(2.5, Math.max(0.55, snapshot.scale + (drag.mode === 'top' ? -dy : dy)));
      onChange({ scale });
    } else {
      const signed = drag.mode === 'top' ? -dy : dy;
      const height = Math.min(0.8, Math.max(0.12, snapshot.displayHeight + signed));
      onChange({ displayHeight: height, y: Math.min(1 - height, Math.max(0, snapshot.y + (snapshot.displayHeight - height) / 2)) });
    }
  };
  const stop = () => { dragRef.current = null; };
  return <div
    className={`mobile-editor-chart ${appearance.layout}`}
    style={{ left: `${(appearance.x - appearance.width / 2) * 100}%`, top: `${appearance.y * 100}%`, width: `${appearance.width * 100}%`, height: `${appearance.displayHeight * 100}%`, transform: `scale(${appearance.scale})`, opacity: appearance.opacity }}
    onPointerDown={(event) => handlePointerDown(event)}
    onPointerMove={handlePointerMove}
    onPointerUp={stop}
    onPointerCancel={stop}
  >{children}
    {(['left', 'right', 'top', 'bottom'] as const).map((mode) => <span key={mode} className={`mobile-editor-chart-handle ${mode}`} onPointerDown={(event) => handlePointerDown(event, mode)} />)}
  </div>;
}

type AppearanceParameterKey =
  | 'layout' | 'iconSet' | 'iconScale' | 'blockMode' | 'useCharacterBase' | 'capsuleWidthMode' | 'capsuleShape'
  | 'x' | 'y' | 'width' | 'displayHeight' | 'overallScale' | 'scale' | 'opacity'
  | 'fontFamily' | 'fontSize' | 'textSpacing' | 'blockGap' | 'imageBlockHeight' | 'capsuleWidth' | 'autoWidthPadding'
  | 'avatarSize' | 'avatarOffsetX' | 'mergeSameRoleLimit' | 'fadeRange' | 'textStrokeWidth'
  | 'avatarEnabled' | 'convertIcons' | 'mergeSameRoleSteps'
  | 'mergeSameMoveSteps' | 'fadeEnabled' | 'textStrokeEnabled' | 'prePromptEnabled' | 'showTriggerGuides'
  | 'backgroundColor' | 'activeColor' | 'textColor' | 'borderColor' | 'textStrokeColor';

type AppearanceParameter = {
  key: AppearanceParameterKey;
  name: string;
  description: string;
  kind: 'range' | 'segment' | 'toggle' | 'color';
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  offset?: number;
  options?: Array<{ label: string; value: string }>;
};

const APPEARANCE_PARAMETERS: AppearanceParameter[] = [
  { key: 'layout', name: '排版', description: '横排适合一行展示，文本适合像电脑端竖向排列。', kind: 'segment', options: [{ label: '横排', value: 'horizontal' }, { label: '文本', value: 'text' }] },
  { key: 'iconSet', name: '图标', description: '选择连段图使用的操作图标方案。', kind: 'segment', options: [{ label: '经典', value: 'classic' }, { label: '潮声', value: 'tide' }] },
  { key: 'iconScale', name: '图标大小', description: '缩放招式图标以及对应的黄色底块和合并下划点。', kind: 'range', min: .35, max: 3, step: .05, suffix: 'x' },
  { key: 'blockMode', name: '招式底图', description: '选择角色底图招式块或纯色招式块。', kind: 'segment', options: [{ label: '底图', value: 'image' }, { label: '纯色', value: 'capsule' }] },
  { key: 'useCharacterBase', name: '使用角色底图', description: '开启时按角色使用对应底图，关闭时统一使用 API 中名为“通用”的默认底图。', kind: 'toggle' },
  { key: 'capsuleWidthMode', name: '宽度模式', description: '跟随内容会按招式内容自动计算宽度。', kind: 'segment', options: [{ label: '跟随内容', value: 'auto' }, { label: '固定宽度', value: 'fixed' }] },
  { key: 'capsuleShape', name: '块形状', description: '设置纯色招式块的圆角样式。', kind: 'segment', options: [{ label: '圆角', value: 'capsule' }, { label: '矩形', value: 'rect' }] },
  { key: 'x', name: '左右位置', description: '控制连段图在屏幕上的水平中心位置。', kind: 'range', min: .05, max: .95, step: .01, suffix: '%' },
  { key: 'y', name: '上下位置', description: '控制连段图在屏幕上的顶部位置。', kind: 'range', min: 0, max: .88, step: .01, suffix: '%' },
  { key: 'width', name: '显示宽度', description: '控制连段图可见区域的宽度。', kind: 'range', min: .28, max: 1, step: .01, suffix: '%' },
  { key: 'displayHeight', name: '显示高度', description: '控制连段图可见区域的高度。', kind: 'range', min: .08, max: .8, step: .01, suffix: '%' },
  { key: 'overallScale', name: '内容比例', description: '整体等比缩放所有轨道、头像、图标和文字。', kind: 'range', min: .25, max: 4, step: .05, suffix: 'x' },
  { key: 'scale', name: '整体缩放', description: '以旧版最小值 0.4 为 0，向左可以继续缩小，向右放大。', kind: 'range', min: -.35, max: 3.35, step: .05, offset: .4, suffix: 'x' },
  { key: 'opacity', name: '透明度', description: '调整置顶连段图整体透明度。', kind: 'range', min: .25, max: 1, step: .05, suffix: '%' },
  { key: 'fontSize', name: '文字大小', description: '调整招式文字的显示大小。', kind: 'range', min: 10, max: 30, step: 1, suffix: 'px' },
  { key: 'textSpacing', name: '文本间距', description: '以旧版最小值 0 为 0，向左可减少间距，向右增加间距。', kind: 'range', min: -50, max: 146, step: 1, offset: 0, suffix: 'px' },
  { key: 'blockGap', name: '招式间距', description: '控制相邻招式块之间的间隔。', kind: 'range', min: 2, max: 24, step: 1, suffix: 'px' },
  { key: 'imageBlockHeight', name: '底图高度', description: '调整底图招式块的高度。', kind: 'range', min: 16, max: 180, step: 1, suffix: 'px' },
  { key: 'capsuleWidth', name: '固定宽度', description: '固定宽度模式下设置每个招式块的宽度。', kind: 'range', min: 32, max: 1000, step: 1, suffix: 'px' },
  { key: 'autoWidthPadding', name: '自动宽度留白', description: '以旧版最小值 8 为 0，向左减少留白，向右增加留白。', kind: 'range', min: -8, max: 302, step: 1, offset: 8, suffix: 'px' },
  { key: 'avatarSize', name: '头像大小', description: '控制招式块内角色头像的大小，可超出底图上下边缘。', kind: 'range', min: 12, max: 360, step: 1, suffix: 'px' },
  { key: 'avatarOffsetX', name: '头像位置', description: '调整头像的左右位置，图标会始终从头像右侧开始排列。', kind: 'range', min: -180, max: 180, step: 1, suffix: 'px' },
  { key: 'fontFamily', name: '招式字体', description: '选择招式文字和合并数字使用的字体。', kind: 'segment', options: [
    { label: '优设标题黑', value: '"优设标题黑", "Noto Sans SC", sans-serif' },
    { label: '系统无衬线', value: 'system-ui, "Noto Sans SC", sans-serif' },
    { label: '系统衬线', value: 'serif' },
    { label: '等宽', value: 'monospace' }
  ] },
  { key: 'mergeSameRoleLimit', name: '合并上限', description: '限制同角色一次最多收纳的块数，同招式连续段不受此项限制。', kind: 'range', min: 1, max: 200, step: 1, suffix: '个' },
  { key: 'fadeRange', name: '渐隐范围', description: '控制已完成招式的淡出范围。', kind: 'range', min: 0, max: 100, step: 1, suffix: '级' },
  { key: 'textStrokeWidth', name: '描边宽度', description: '调整文字描边的粗细。', kind: 'range', min: 0, max: 12, step: 1, suffix: 'px' },
  { key: 'avatarEnabled', name: '角色头像', description: '显示或隐藏招式块中的角色头像。', kind: 'toggle' },
  { key: 'convertIcons', name: '招式图标', description: '优先使用图标显示可识别的招式。', kind: 'toggle' },
  { key: 'mergeSameRoleSteps', name: '同角色合并', description: '将同一角色连续招式收纳到一个块中。', kind: 'toggle' },
  { key: 'mergeSameMoveSteps', name: '同招式合并', description: '将同一招式连续出现的块收纳到一个块中。', kind: 'toggle' },
  { key: 'fadeEnabled', name: '完成渐隐', description: '让已经完成的招式逐步降低透明度。', kind: 'toggle' },
  { key: 'textStrokeEnabled', name: '文字描边', description: '为招式文字启用描边。', kind: 'toggle' },
  { key: 'prePromptEnabled', name: '预提示', description: '显示当前招式前方的提示信息。', kind: 'toggle' },
  { key: 'showTriggerGuides', name: '点击区边框', description: '在游戏中显示开始和退出点击区域边框。', kind: 'toggle' },
  { key: 'backgroundColor', name: '普通底色', description: '设置普通招式块的纯色底。', kind: 'color' },
  { key: 'activeColor', name: '当前底色', description: '设置当前触发招式的黄色反馈底色。', kind: 'color' },
  { key: 'textColor', name: '文字颜色', description: '设置普通招式文字颜色。', kind: 'color' },
  { key: 'borderColor', name: '块描边颜色', description: '设置招式块边框颜色。', kind: 'color' },
  { key: 'textStrokeColor', name: '文字描边颜色', description: '设置招式文字描边颜色。', kind: 'color' }
];

function appearanceParameterCategory(key: AppearanceParameterKey): string {
  if (['x', 'y', 'width', 'displayHeight'].includes(key)) return '位置与范围';
  if (key === 'layout') return '排版';
  if (['iconSet', 'blockMode', 'useCharacterBase', 'capsuleWidthMode', 'capsuleShape'].includes(key)) return '外观';
  if (['fontFamily', 'fontSize', 'textStrokeWidth', 'textStrokeEnabled'].includes(key)) return '字体';
  if (['overallScale', 'scale', 'opacity', 'textSpacing', 'blockGap', 'imageBlockHeight', 'capsuleWidth', 'autoWidthPadding', 'avatarSize', 'avatarOffsetX', 'iconScale', 'fadeRange'].includes(key)) return '尺寸';
  if (['mergeSameRoleLimit', 'mergeSameRoleSteps', 'mergeSameMoveSteps'].includes(key)) return '合并';
  if (['avatarEnabled', 'convertIcons', 'fadeEnabled', 'textStrokeEnabled', 'prePromptEnabled', 'showTriggerGuides'].includes(key)) return '显示';
  return '颜色';
}

const APPEARANCE_CATEGORY_ORDER = ['排版', '外观', '位置与范围', '显示', '合并', '尺寸', '颜色', '字体'] as const;

function appearanceParameterValue(item: AppearanceParameter, value: unknown, language: MobileLanguage = 'zh-CN'): string {
  if (item.kind === 'toggle') return value ? '开启' : '关闭';
  if (item.kind === 'color') return String(value);
  if (item.kind === 'segment') return item.options?.find((option) => option.value === value)?.label ?? String(value);
  const displayValue = Number(value) - (item.offset ?? 0);
  if (item.suffix === '%') return `${Math.round(displayValue * 100)}%`;
  const suffix = language === 'en-US' ? ({ '个': '', '级': ' level', 'px': 'px', 'ms': 'ms', 'x': 'x' }[item.suffix ?? ''] ?? item.suffix ?? '') : item.suffix ?? '';
  return `${Math.round(displayValue * 100) / 100}${suffix}`;
}

function AppearanceInspector({ appearance, selectedKey, onSelect, onChange, language }: {
  appearance: MobileOverlaySettings;
  selectedKey: AppearanceParameterKey;
  onSelect: (key: AppearanceParameterKey) => void;
  onChange: (key: AppearanceParameterKey, value: unknown) => void;
  language: MobileLanguage;
}) {
  const t = (value: string) => mobileText(language, value);
  const selected = APPEARANCE_PARAMETERS.find((item) => item.key === selectedKey) ?? APPEARANCE_PARAMETERS[0];
  const selectedCategory = appearanceParameterCategory(selected.key);

  const renderControl = (item: AppearanceParameter) => {
    const value = appearance[item.key];
    if (item.kind === 'range') return <input type="range" min={item.min} max={item.max} step={item.step} value={Number(value) - (item.offset ?? 0)} onChange={(event) => onChange(item.key, Number(event.target.value) + (item.offset ?? 0))} />;
    if (item.kind === 'toggle') return <input className="mobile-param-checkbox" type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(item.key, event.target.checked)} />;
    if (item.kind === 'color') return <input className="mobile-param-color" type="color" value={String(value)} onChange={(event) => onChange(item.key, event.target.value)} />;
    return <div className="mobile-param-options">{item.options?.map((option) => <button type="button" key={option.value} className={String(value) === option.value ? 'active' : ''} onClick={() => onChange(item.key, option.value)}>{t(option.label)}</button>)}</div>;
  };

  return <div className="mobile-param-inspector">
    {APPEARANCE_CATEGORY_ORDER.map((category) => {
      const items = APPEARANCE_PARAMETERS.filter((item) => appearanceParameterCategory(item.key) === category);
      if (!items.length) return null;
      const toggleItems = items.filter((item) => item.kind === 'toggle');
      const segmentItems = items.filter((item) => item.kind === 'segment');
      const valueItems = items.filter((item) => item.kind === 'range' || item.kind === 'color');
      const active = selectedCategory === category && selected.kind !== 'toggle' ? selected : undefined;
      const renderSelectableGroup = (group: AppearanceParameter[], groupName: string) => {
        if (!group.length) return null;
        const groupActive = active && group.some((item) => item.key === active.key) ? active : undefined;
        return <div className="mobile-param-subgroup" key={groupName}>
           <h4>{t(groupName)}</h4>
           <div className="mobile-param-active">{groupActive ? <><strong>{t(groupActive.name)}</strong><b>{groupActive.kind === 'toggle' ? t(appearanceParameterValue(groupActive, appearance[groupActive.key])) : groupActive.kind === 'segment' ? t(groupActive.options?.find((option) => option.value === appearance[groupActive.key])?.label ?? '') : appearanceParameterValue(groupActive, appearance[groupActive.key], language)}</b>{renderControl(groupActive)}</> : <span className="mobile-param-placeholder">{t('从下方选择参数')}</span>}</div>
           <p>{groupActive ? t(groupActive.description) : t('选择下方参数后，在这里调整它的具体数值。')}</p>
           <div className="mobile-param-grid">{group.map((item) => <button type="button" key={item.key} className={item.key === selectedKey ? 'active' : ''} onClick={() => onSelect(item.key)}><span>{t(item.name)}</span><small>{item.kind === 'segment' ? t(item.options?.find((option) => option.value === appearance[item.key])?.label ?? '') : appearanceParameterValue(item, appearance[item.key], language)}</small></button>)}</div>
        </div>;
      };
      return <section className="mobile-section mobile-param-category" key={category}>
         <h3>{t(category)}</h3>
         {toggleItems.length > 0 && <div className="mobile-param-subgroup mobile-param-toggle-group"><h4>{t('勾选')}</h4>{toggleItems.map((item) => <label className="mobile-param-toggle-row" key={item.key}><input type="checkbox" checked={Boolean(appearance[item.key])} onChange={(event) => onChange(item.key, event.target.checked)} /><span><strong>{t(item.name)}</strong><small>{t(item.description)}</small></span><b>{t(appearanceParameterValue(item, appearance[item.key]))}</b></label>)}</div>}
         {category === '排版' && items.length === 1 ? <div className="mobile-param-subgroup mobile-param-layout-control"><h4>{t('切换')}</h4><strong>{t(items[0].name)}</strong>{renderControl(items[0])}<p>{t(items[0].description)}</p></div> : <>{renderSelectableGroup(segmentItems, '切换')}{renderSelectableGroup(valueItems, '数值与样式')}</>}
      </section>;
    })}
  </div>;
}

function MobileShareDialog({ draft, onChange, onSave, onUpload, onClose, language, characterName }: {
  draft: MobileShareDraft;
  onChange: (draft: MobileShareDraft) => void;
  onSave: () => void;
  onUpload: () => void;
  onClose: () => void;
  language: MobileLanguage;
  characterName: (name: string) => string;
}) {
  const t = (value: string) => mobileText(language, value);
  const patch = (value: Partial<MobileShareDraft>) => onChange({ ...draft, ...value });
  const toggleTag = (tag: CommunityTag) => {
    if (tag === '轮椅' && !draft.wheelchairEligible) return;
    patch({ tags: draft.tags.includes(tag) ? draft.tags.filter((item) => item !== tag) : [...draft.tags, tag] });
  };
  return <div className="mobile-share-backdrop" role="presentation" onPointerDown={onClose}>
    <section className="mobile-share-dialog" role="dialog" aria-modal="true" aria-labelledby="mobile-share-title" onPointerDown={(event) => event.stopPropagation()}>
      <header><div><h2 id="mobile-share-title">{t('分享连段')}</h2><p>{t('填写社区信息后保存 JSON 或直接上传。')}</p></div><button type="button" aria-label={t('关闭')} onClick={onClose}><X size={20} /></button></header>
      <div className="mobile-share-form">
        <label><span>{t('名称')}</span><input value={draft.name} maxLength={80} onChange={(event) => patch({ name: event.target.value })} /></label>
        <div className="mobile-share-tags"><span>{t('标签')}</span><div>{COMMUNITY_TAGS.map((tag) => <button type="button" key={tag} className={draft.tags.includes(tag) ? 'active' : ''} disabled={tag === '轮椅' && !draft.wheelchairEligible} onClick={() => toggleTag(tag)}>{t(tag)}</button>)}</div>{!draft.wheelchairEligible && <small>{t('“轮椅”需要存在循环轴，且循环轴内切人总数不超过 3。')}</small>}</div>
        <label><span>{t('简介')}</span><textarea value={draft.description} maxLength={800} rows={4} onChange={(event) => patch({ description: event.target.value })} /></label>
        <label><span>{t('视频链接')} <small>{t('可选')}</small></span><input type="url" value={draft.link} maxLength={500} placeholder="https://" onChange={(event) => patch({ link: event.target.value })} /></label>
      </div>
      <div className="mobile-share-summary"><span>{t('角色')}<strong>{draft.characters.map(characterName).join(' / ') || t('未设置')}</strong></span><span>{t('轮数')}<strong>{draft.rounds}</strong></span></div>
      <footer><button type="button" className="secondary" disabled={!draft.name.trim()} onClick={onSave}><Download size={17} />{t('保存 JSON 到本地')}</button><button type="button" className="primary" disabled={!draft.name.trim()} onClick={onUpload}><Upload size={17} />{t('上传到社区')}</button></footer>
    </section>
  </div>;
}

function MobileUpdateDialog({ release, language, ignoreChecked, onIgnoreChange, onAcknowledge, onUpdate }: {
  release: MobileReleaseManifest;
  language: MobileLanguage;
  ignoreChecked: boolean;
  onIgnoreChange: (checked: boolean) => void;
  onAcknowledge: () => void;
  onUpdate: () => void;
}) {
  const t = (value: string) => mobileText(language, value);
  return <div className="mobile-update-backdrop" role="presentation">
    <section className="mobile-update-dialog" role="dialog" aria-modal="true" aria-labelledby="mobile-update-title">
      <header>
        <div><span>{t('手机端更新')}</span><h2 id="mobile-update-title">{t('发现新版本')}</h2></div>
        <strong>v{release.version}</strong>
      </header>
      <div className="mobile-update-content">
        <p className="mobile-update-current">{t('当前版本')} v{__APP_VERSION__}</p>
        <h3>{t('更新说明')}</h3>
        <p className="mobile-update-notes">{release.notes || t('暂无更新说明')}</p>
        <label className="mobile-update-ignore"><input type="checkbox" checked={ignoreChecked} onChange={(event) => onIgnoreChange(event.target.checked)} /><span>{t('忽略本版本更新')}</span></label>
      </div>
      <footer>
        <button type="button" className="mobile-update-primary" disabled={!release.downloadUrl} onClick={onUpdate}><Download size={17} />{t('更新')}</button>
        <button type="button" className="mobile-update-secondary" onClick={onAcknowledge}><Check size={17} />{t('已阅')}</button>
      </footer>
    </section>
  </div>;
}

export default function MobileApp() {
  const [page, setPage] = useState<MobilePage>('library');
  const [practicePreviewExpanded, setPracticePreviewExpanded] = useState(false);
  const [debugGamePreviewOpen, setDebugGamePreviewOpen] = useState(false);
  const [language, setLanguage] = useState<MobileLanguage>(readMobileLanguage);
  const [library, setLibrary] = useState<ComboChart[]>(readLibrary);
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem(SELECTED_KEY) ?? '');
  const [appearance, setAppearance] = useState<MobileOverlaySettings>(readAppearance);
  const [status, setStatus] = useState<MobileStatus>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [availableUpdate, setAvailableUpdate] = useState<MobileReleaseManifest | null>(() => IS_MOBILE_UPDATE_PREVIEW ? {
    schemaVersion: 1,
    platform: 'mobile',
    version: '0.65.0',
    title: 'WW Combo Trainer Mobile 0.65',
    notes: '优化更新检查、社区装载和悬浮连段图体验。\n这是更新弹窗预览内容。',
    publishedAt: new Date().toISOString(),
    downloadUrl: 'https://example.com/wwcombo-android.apk'
  } : null);
  const [updateIgnoreChecked, setUpdateIgnoreChecked] = useState(false);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [communityKey, setCommunityKey] = useState(0);
  const [mobileAssets, setMobileAssets] = useState<{ avatars: MobileAssetPreset[]; bases: MobileAssetPreset[] }>(readCachedMobileAssets);
  const [editorImage, setEditorImage] = useState<string | null>(null);
  const [editorTarget, setEditorTarget] = useState<'zones' | 'flow' | 'keys'>('zones');
  const [editorMenuOpen, setEditorMenuOpen] = useState(false);
  const [selectedParameter, setSelectedParameter] = useState<AppearanceParameterKey>('x');
  const [recordTitle, setRecordTitle] = useState('');
  const [recordTeam, setRecordTeam] = useState(['角色1', '角色2', '角色3']);
  const [recordTeamDraft, setRecordTeamDraft] = useState(['角色1', '角色2', '角色3']);
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const [recordStartingSlot, setRecordStartingSlot] = useState<1 | 2 | 3>(1);
  const [recordTextAxis, setRecordTextAxis] = useState('');
  const [recordAxisChart, setRecordAxisChart] = useState<ComboChart | null>(null);
  const [recordAxisError, setRecordAxisError] = useState('');
  const [shareTarget, setShareTarget] = useState<ComboChart | null>(null);
  const [shareDraft, setShareDraft] = useState<MobileShareDraft | null>(null);
  const [tapMergeMs, setTapMergeMs] = useState(500);
  const [standardHoldMs, setStandardHoldMs] = useState(300);
  const [heavyHoldMs, setHeavyHoldMs] = useState(300);
  const [timelineChart, setTimelineChart] = useState<ComboChart | null>(null);
  const [timelineSelectedId, setTimelineSelectedId] = useState<string | null>(null);
  const [timelineSelectedIds, setTimelineSelectedIds] = useState<string[]>([]);
  const [timelineTool, setTimelineTool] = useState<string | null>(null);
  const [timelineToolGroup, setTimelineToolGroup] = useState<MobileTimelineToolGroup>(null);
  const [timelinePressMode, setTimelinePressMode] = useState<MobileTimelinePressMode>('tap');
  const [timelineModifyTool, setTimelineModifyTool] = useState<string | null>(null);
  const [timelineEditMode, setTimelineEditMode] = useState<MobileTimelineEditMode>(null);
  const [timelineNoteOpen, setTimelineNoteOpen] = useState(false);
  const [timelineNoteDraft, setTimelineNoteDraft] = useState('');
  const [timelinePeriods, setTimelinePeriods] = useState<ComboPeriod[]>([]);
  const [timelineSelectedPeriodId, setTimelineSelectedPeriodId] = useState<string | null>(null);
  const [timelineNodeUnlocked, setTimelineNodeUnlocked] = useState(false);
  const [timelineMultiSelect, setTimelineMultiSelect] = useState(false);
  const [timelineClipboard, setTimelineClipboard] = useState<{ steps: ComboStep[]; periods: ComboPeriod[]; contentLabels: Record<string, string>; anchorMs: number } | null>(null);
  const [timelineHistory, setTimelineHistory] = useState<ComboChart[]>([]);
  const [timelineRedo, setTimelineRedo] = useState<ComboChart[]>([]);
  const [timelineZoom, setTimelineZoom] = useState(.8);
  const [timelinePlaybackMs, setTimelinePlaybackMs] = useState(0);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const t = (value: string) => mobileText(language, value);
  const tm = (value: string) => mobileMessage(language, value);
  const timelineDragRef = useRef<{ id: string; startX: number; originalStart: number; total: number; moved: boolean; originalChart: ComboChart | null } | null>(null);
  const timelineNodeDragRef = useRef<{ id: string; startX: number; originalEnd: number; total: number; moved: boolean; originalChart: ComboChart | null } | null>(null);
  const timelinePlayheadDragRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const editorImageRef = useRef<HTMLInputElement>(null);
  const communityRef = useRef<HTMLIFrameElement>(null);
  const pendingCommunityUploadRef = useRef<MobileCommunityUploadPackage | null>(null);
  const dismissedUpdateVersionRef = useRef<string | null>(localStorage.getItem(MOBILE_UPDATE_DISMISSED_KEY));
  const updateCheckInFlightRef = useRef(false);
  const startupUpdateCheckedRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(MOBILE_LANGUAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  async function checkForMobileUpdate(manual = false) {
    if (!manual && startupUpdateCheckedRef.current) return;
    if (!manual) startupUpdateCheckedRef.current = true;
    if (updateCheckInFlightRef.current) return;
    updateCheckInFlightRef.current = true;
    setUpdateChecking(true);
    try {
      const response = await fetch(MOBILE_RELEASE_API, { cache: 'no-cache' });
      const release = normalizeMobileRelease(response.ok ? await response.json() as unknown : null);
      if (!release) {
        if (manual) setNotice('检查更新失败');
        return;
      }
      if (compareMobileVersions(release.version, __APP_VERSION__) > 0) {
        if (dismissedUpdateVersionRef.current !== release.version) {
          setUpdateIgnoreChecked(false);
          setAvailableUpdate(release);
        } else if (manual) {
          setNotice('已忽略本版本更新');
        }
      } else if (manual) {
        setNotice('当前已是最新版本');
      }
    } catch {
      if (manual) setNotice('检查更新失败');
    } finally {
      updateCheckInFlightRef.current = false;
      setUpdateChecking(false);
    }
  }

  function acknowledgeMobileUpdate() {
    if (availableUpdate && updateIgnoreChecked) {
      dismissedUpdateVersionRef.current = availableUpdate.version;
      localStorage.setItem(MOBILE_UPDATE_DISMISSED_KEY, availableUpdate.version);
    }
    setAvailableUpdate(null);
    setUpdateIgnoreChecked(false);
  }

  function openMobileUpdate() {
    const release = availableUpdate;
    if (!release) return;
    if (!release.downloadUrl) {
      setNotice('更新地址暂未配置');
      return;
    }
    const opened = window.open(release.downloadUrl, '_blank', 'noopener,noreferrer');
    if (!opened) window.location.assign(release.downloadUrl);
    setAvailableUpdate(null);
  }

  useEffect(() => {
    void checkForMobileUpdate();
  }, []);

  const selected = useMemo(
    () => library.find((chart) => chart.id === selectedId) ?? library[0] ?? null,
    [library, selectedId]
  );
  const previewGroups = useMemo(
    () => selected ? mergePreviewSteps(selected.steps, appearance) : [],
    [selected, appearance.mergeSameRoleSteps, appearance.mergeSameMoveSteps, appearance.mergeSameRoleLimit]
  );
  const apiCharacters = useMemo(() => {
    const unique = new Map<string, MobileAssetPreset>();
    mobileAssets.avatars.forEach((item) => {
      const name = item.name.trim();
      if (name && !unique.has(normalizeAssetName(name))) unique.set(normalizeAssetName(name), item);
    });
    return [...unique.values()].sort((left, right) => compareMobileCharacters(left, right, language));
  }, [mobileAssets.avatars, language]);
  const displayCharacterName = (name: string) => mobileCharacterDisplayName(name, mobileAssets, language);
  const recordPreviewChart = recordTextAxis.trim() ? recordAxisChart : selected;
  const timelineTotalMs = useMemo(() => Math.max(1000, ...(timelineChart?.steps ?? []).map((step) => step.startMin + step.durationMax), ...timelinePeriods.map((period) => period.endMs)), [timelineChart, timelinePeriods]);
  const timelineTrackWidth = Math.max(760, timelineTotalMs * .12 * timelineZoom);
  const timelinePressTools = useMemo(() => MOBILE_TIMELINE_PRESS_TOOL_IDS[timelinePressMode].flatMap((moveId) => {
    const tool = MOBILE_TIMELINE_MOVE_TOOLS.find((item) => item.moveId === moveId);
    return tool ? [tool] : [];
  }), [timelinePressMode]);
  const timelineSelectedStep = timelineChart?.steps.find((step) => step.id === timelineSelectedId) ?? null;
  const timelineExpandedSlot = timelineSelectedStep?.characterSlot ?? null;
  const timelineCharacterSlots = useMemo(() => {
    const count = Math.max(3, timelineChart?.characterCount ?? 3, ...(timelineChart?.steps.map((step) => step.characterSlot ?? 1) ?? [1]));
    return Array.from({ length: Math.min(4, count) }, (_, index) => index + 1);
  }, [timelineChart]);

  useEffect(() => {
    const orientation = window.screen.orientation;
    if (page === 'editor' || page === 'timeline') {
      void orientation?.lock?.('landscape').catch(() => undefined);
    } else {
      orientation?.unlock?.();
    }
    return () => { if (page === 'editor' || page === 'timeline') orientation?.unlock?.(); };
  }, [page]);

  useEffect(() => {
    document.documentElement.classList.toggle('mobile-editor-flow-mode', page === 'editor' && editorTarget === 'flow');
    document.documentElement.classList.toggle('mobile-editor-zones-mode', page === 'editor' && editorTarget === 'zones');
    document.documentElement.classList.toggle('mobile-editor-keys-mode', page === 'editor' && editorTarget === 'keys');
    return () => {
      document.documentElement.classList.remove('mobile-editor-flow-mode', 'mobile-editor-zones-mode', 'mobile-editor-keys-mode');
    };
  }, [page, editorTarget]);

  useEffect(() => {
    let cancelled = false;
    void fetchMobileAssets().then((assets) => {
      if (!cancelled) {
        setMobileAssets(assets);
        try { localStorage.setItem(MOBILE_ASSET_CACHE_KEY, JSON.stringify(assets)); } catch { /* quota and private-mode storage are optional */ }
      }
    }).catch(() => {
      if (!cancelled) setNotice('头像和底图服务暂时不可用，已保留本地资源');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selected || (!mobileAssets.avatars.length && !mobileAssets.bases.length)) return;
    let cancelled = false;
    const names = chartCharacterNames(selected);
    const load = async () => {
      const avatarSources: Record<string, string> = {};
      const baseSources: Record<string, string> = {};
      const baseCrops: Record<string, MobileBaseCrop> = {};
      const baseStretches: Record<string, MobileBaseStretch> = {};
      const baseImageSizes: Record<string, MobileBaseSize> = {};
      const baseEdges: Record<string, number> = {};
      const genericBase = mobileAssets.bases.find((item) => mobileAssetMatches(item, '通用'));
      const roleBaseFallback = {
        baseCrop: genericBase?.crop ?? appearance.baseCrop,
        capsuleStretch: genericBase?.stretch ?? appearance.capsuleStretch,
        capsuleEdge: genericBase?.edge ?? appearance.capsuleEdge
      };
      for (let index = 0; index < Math.min(4, Math.max(3, selected.characterCount ?? 3)); index += 1) {
        const name = names[index];
        const avatar = name ? mobileAssets.avatars.find((item) => mobileAssetMatches(item, name)) : undefined;
        const roleBase = name ? mobileAssets.bases.find((item) => mobileAssetMatches(item, name)) : undefined;
        const base = appearance.useCharacterBase ? (roleBase ?? genericBase) : genericBase;
        const avatarUrl = avatar?.src ?? `/combo-assets/avatar-presets/role-${index + 1}.webp`;
        const avatarData = await imageToDataUrl(avatarUrl);
        if (avatarData) avatarSources[String(index + 1)] = avatarData;
        if (base) {
          const baseData = await imageToDataUrl(base.src);
          if (baseData) baseSources[String(index + 1)] = baseData;
          if (base.crop) baseCrops[String(index + 1)] = base.crop;
          if (base.stretch) baseStretches[String(index + 1)] = base.stretch;
          if (base.size) baseImageSizes[String(index + 1)] = base.size;
          if (base.edge !== undefined) baseEdges[String(index + 1)] = base.edge;
        }
      }
      if (!cancelled && (Object.keys(avatarSources).length || Object.keys(baseSources).length || genericBase)) {
        patchAppearance({ ...roleBaseFallback, avatarSources, baseSources, baseCrops, baseStretches, baseImageSizes, baseEdges });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [selected?.id, mobileAssets, appearance.useCharacterBase]);

  useEffect(() => {
    document.documentElement.classList.add('wwcombo-mobile-document');
    return () => document.documentElement.classList.remove('wwcombo-mobile-document');
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('wwcombo-mobile-record-team-v1') ?? 'null') as unknown;
      if (Array.isArray(saved) && saved.length >= 3) {
        const team = saved.slice(0, 3).map((item) => typeof item === 'string' && item.trim() ? item.trim() : '角色');
        setRecordTeam(team);
        setRecordTeamDraft(team);
      }
      const recognition = JSON.parse(localStorage.getItem('wwcombo-mobile-record-recognition-v1') ?? 'null') as Partial<{ tapMergeMs: number; standardHoldMs: number; heavyHoldMs: number }> | null;
      if (recognition) {
        if (Number.isFinite(recognition.tapMergeMs)) setTapMergeMs(Math.min(5000, Math.max(50, Number(recognition.tapMergeMs))));
        if (Number.isFinite(recognition.standardHoldMs)) setStandardHoldMs(Math.min(3000, Math.max(50, Number(recognition.standardHoldMs))));
        if (Number.isFinite(recognition.heavyHoldMs)) setHeavyHoldMs(Math.min(3000, Math.max(50, Number(recognition.heavyHoldMs))));
      }
    } catch { /* optional local preferences */ }
  }, []);

  useEffect(() => {
    if (!apiCharacters.length) return;
    const canonical = (name: string) => apiCharacters.find((item) => mobileAssetMatches(item, name))?.name;
    const valid = recordTeam.flatMap((name) => canonical(name) ?? []);
    if (valid.length >= 3 && valid.join('|') === recordTeam.join('|')) return;
    const fromChart = selected ? chartCharacterNames(selected).flatMap((name) => canonical(name) ?? []) : [];
    const next = [...new Set([...valid, ...fromChart, ...apiCharacters.map((item) => item.name)])].slice(0, 3);
    if (next.length === 3 && next.join('|') !== recordTeam.join('|')) {
      setRecordTeam(next);
      setRecordTeamDraft(next);
      localStorage.setItem('wwcombo-mobile-record-team-v1', JSON.stringify(next));
    }
  }, [apiCharacters, selected?.id]);

  useEffect(() => {
    localStorage.setItem('wwcombo-mobile-record-recognition-v1', JSON.stringify({ tapMergeMs, standardHoldMs, heavyHoldMs }));
  }, [tapMergeMs, standardHoldMs, heavyHoldMs]);

  function postCommunityState(frameWindow = communityRef.current?.contentWindow, targetOrigin = COMMUNITY_ORIGIN, sendPendingUpload = false) {
    if (!frameWindow) return;
    frameWindow.postMessage({ type: 'wwcombo:community-library', version: 1, items: libraryItems(library) }, targetOrigin);
    const pendingUpload = pendingCommunityUploadRef.current;
    if (sendPendingUpload && pendingUpload) {
      pendingCommunityUploadRef.current = null;
      frameWindow.postMessage({ type: 'wwcombo:community-upload', version: 1, package: pendingUpload }, targetOrigin);
    }
  }

  useEffect(() => {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
    postCommunityState();
  }, [library]);

  useEffect(() => {
    if (selected?.id) {
      setSelectedId(selected.id);
      localStorage.setItem(SELECTED_KEY, selected.id);
    }
  }, [selected?.id]);

  useEffect(() => {
    if (!recordTextAxis.trim() && selected && !status.recordingActive) {
      setTimelineChart(normalizeChart(selected));
      setTimelinePeriods([...(selected.periods ?? [])]);
    }
  }, [selected?.id, recordTextAxis, status.recordingActive]);

  useEffect(() => {
    if (!timelinePlaying || page !== 'timeline') return;
    const startedAt = performance.now() - timelinePlaybackMs;
    const timer = window.setInterval(() => {
      const next = performance.now() - startedAt;
      if (next >= timelineTotalMs) {
        setTimelinePlaybackMs(timelineTotalMs);
        setTimelinePlaying(false);
      } else setTimelinePlaybackMs(next);
    }, 33);
    return () => window.clearInterval(timer);
  }, [timelinePlaying, page, timelineTotalMs]);

  useEffect(() => {
    if (!timelineNoteOpen) setTimelineNoteDraft(timelineSelectedStep?.note ?? '');
  }, [timelineSelectedStep?.id, timelineSelectedStep?.note, timelineNoteOpen]);

  useEffect(() => {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
    const timer = window.setTimeout(() => {
      void invoke('mobile_update_overlay_settings', { settings: appearance }).catch(() => undefined);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [appearance]);

  async function refreshStatus() {
    try {
      const next = await invoke<MobileStatus>('mobile_status');
      setStatus(next);
      if (next.overlayEditing && next.settingsJson) {
        try {
          setAppearance(normalizeAppearance(JSON.parse(next.settingsJson) as Partial<MobileOverlaySettings>));
        } catch {
          // Keep the last valid local appearance if native state is incomplete.
        }
      }
    } catch (error) {
      if (!IS_MOBILE_PREVIEW) setNotice(`无法读取手机服务：${String(error)}`);
    }
  }

  useEffect(() => {
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 1200);
    const onVisible = () => { if (!document.hidden) void refreshStatus(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  function addCharts(charts: ComboChart[], source = '已导入') {
    setLibrary((current) => {
      const next = new Map(current.map((chart) => [chart.id, chart]));
      charts.forEach((chart) => next.set(chart.id, chart));
      return [...next.values()];
    });
    setSelectedId(charts[0].id);
    setNotice(`${source} ${charts.length} 份连段谱`);
  }

  function closeTeamPicker() {
    if (recordTeamDraft.length === 3) {
      setRecordTeam(recordTeamDraft);
      localStorage.setItem('wwcombo-mobile-record-team-v1', JSON.stringify(recordTeamDraft));
      setNotice('快捷编队已保存');
      if (recordTextAxis.trim()) window.setTimeout(() => void parseRecordingAxis(), 0);
    } else {
      setNotice('请选择 3 名角色后再完成快捷编队');
      return;
    }
    setTeamPickerOpen(false);
  }

  function toggleTeamCharacter(name: string) {
    setRecordTeamDraft((current) => {
      const canonical = apiCharacters.find((item) => mobileAssetMatches(item, name))?.name ?? canonicalMobileCharacterName(name);
      const existing = current.findIndex((item) => apiCharacters.some((candidate) => mobileAssetMatches(candidate, canonical) && mobileAssetMatches(candidate, item)));
      if (existing >= 0) return current.filter((_, index) => index !== existing);
      if (current.length >= 3) return current;
      return [...current, canonical];
    });
  }

  function parseRecordingAxis(source = recordTextAxis): ComboChart | null {
    const text = source.trim();
    if (!text) {
      setRecordAxisChart(null);
      setRecordAxisError('请输入文字轴后才能开始录制');
      return null;
    }
    try {
      const characters: TextAxisCharacter[] = recordTeam.map((name, index) => ({ slot: (index + 1) as 1 | 2 | 3, names: [name, String(index + 1)] }));
      const parsed = parseTextAxis(text, { moves: DEFAULT_MOVES, characters, title: recordTitle.trim() || '录制连段' });
      if (!parsed.chart.steps.length) throw new Error('没有识别到招式块');
      const chart = normalizeChart({ ...parsed.chart, character: recordTeam.join('/'), characterCount: 3, contentLabels: parsed.contentLabels });
      setRecordAxisChart(chart);
      setRecordAxisError(parsed.warnings.length ? parsed.warnings.join('；') : '');
      return chart;
    } catch (error) {
      setRecordAxisChart(null);
      setRecordAxisError(error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  function openTimeline(chart: ComboChart | null) {
    if (!chart) return;
    setTimelineChart(normalizeChart(chart));
    setTimelinePeriods(rebuildTimelineAxisPeriods([...(chart.periods ?? [])], timelineAxisPeriods(chart.periods ?? [])));
    setTimelineSelectedId(chart.steps[0]?.id ?? null);
    setTimelineSelectedIds(chart.steps[0] ? [chart.steps[0].id] : []);
    setTimelineSelectedPeriodId(null);
    setTimelineNodeUnlocked(false);
    setTimelineTool(null);
    setTimelineToolGroup(null);
    setTimelinePressMode('tap');
    setTimelineModifyTool(null);
    setTimelineEditMode(null);
    setTimelineMultiSelect(false);
    setTimelineNoteOpen(false);
    setTimelineNoteDraft(chart.steps[0]?.note ?? '');
    setTimelineHistory([]);
    setTimelineRedo([]);
    setPage('timeline');
  }

  function editLibraryChart(chart: ComboChart) {
    const normalized = normalizeChart(chart);
    setSelectedId(normalized.id);
    setRecordTitle(normalized.title);
    setRecordTextAxis(chartToMobileTextAxis(normalized));
    setRecordAxisChart(normalized);
    setRecordAxisError('');
    openTimeline(normalized);
  }

  function updateTimeline(mutator: (chart: ComboChart) => ComboChart) {
    setTimelineChart((current) => {
      if (!current) return current;
      const next = normalizeChart(mutator(current));
      setTimelineHistory((history) => [...history.slice(-39), current]);
      setTimelineRedo([]);
      return next;
    });
  }

  function beginNewRecording() {
    const title = recordTitle.trim();
    if (!title) {
      setNotice('请先输入连段名字');
      return;
    }
    setRecordTextAxis('');
    setRecordAxisChart(null);
    setRecordAxisError('');
    setNotice(`已新建「${title}」，请设置快捷编队并输入文字轴`);
  }

  async function startMobileRecording() {
    const axis = recordAxisChart ?? parseRecordingAxis();
    if (!axis || !recordTextAxis.trim()) {
      setNotice('请先输入并确认文字轴');
      return;
    }
    if (!status.accessibilityEnabled) {
      setNotice('请先开启无障碍权限，返回后再开始录制');
      await openAccessibilitySettings();
      return;
    }
    try {
      setStatus(await invoke<MobileStatus>('mobile_start_recording', {
        title: recordTitle.trim() || axis.title,
        settings: appearance,
        tapMergeMs,
        standardHoldMs,
        heavyHoldMs,
        startingSlot: recordStartingSlot
      }));
      setNotice('录制已开始，退出应用后点击游戏中的操作区域即可捕获');
    } catch (error) {
      setNotice(`开始录制失败：${String(error)}`);
    }
  }

  async function stopMobileRecording() {
    try {
      const next = await invoke<MobileStatus>('mobile_stop_recording');
      setStatus(next);
      if (next.recordingChartJson) {
        const measured = normalizeChart(JSON.parse(next.recordingChartJson));
        const chart = recordAxisChart ? alignRecordedChartToAxis(recordAxisChart, measured) : measured;
        setTimelineChart(chart);
        setRecordAxisChart(chart);
        addCharts([chart], '录制完成，已保存');
      }
    } catch (error) {
      setNotice(`结束录制失败：${String(error)}`);
    }
  }

  function openShareDialog(chart: ComboChart | null) {
    if (!chart) return;
    setShareTarget(chart);
    setShareDraft(mobileShareDraft(chart, library));
  }

  function applySharedChart(chart: ComboChart) {
    setLibrary((current) => current.map((item) => item.id === chart.id ? chart : item));
    setSelectedId(chart.id);
    if (timelineChart?.id === chart.id) setTimelineChart(chart);
  }

  function saveSharedChartJson() {
    if (!shareTarget || !shareDraft) return;
    try {
      const prepared = prepareMobileCommunityShare(shareTarget, shareDraft);
      downloadMobileJson(prepared.payload, prepared.filename);
      applySharedChart(prepared.sharedChart);
      setShareTarget(null);
      setShareDraft(null);
      setNotice(`已保存 ${prepared.filename}`);
    } catch (error) {
      setNotice(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function uploadSharedChartToCommunity() {
    if (!shareTarget || !shareDraft) return;
    try {
      const prepared = prepareMobileCommunityShare(shareTarget, shareDraft);
      if (new TextEncoder().encode(JSON.stringify(prepared.payload)).byteLength > COMMUNITY_UPLOAD_MAX_BYTES) throw new Error('连段包超过社区 1 MB 上传限制');
      pendingCommunityUploadRef.current = { chartId: prepared.sharedChart.id, filename: prepared.filename, payload: prepared.payload };
      applySharedChart(prepared.sharedChart);
      setShareTarget(null);
      setShareDraft(null);
      setPage('community');
      setCommunityKey((current) => current + 1);
      setNotice('正在交给社区上传');
    } catch (error) {
      setNotice(`上传失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function updateTimelineStep(id: string, patch: Partial<ComboStep>) {
    updateTimeline((current) => ({ ...current, updatedAt: Date.now(), steps: current.steps.map((step) => step.id === id ? { ...step, ...patch } : step) }));
  }

  function commitTimelinePeriods(next: ComboPeriod[]) {
    const rebuilt = rebuildTimelineAxisPeriods(next, timelineAxisPeriods(next));
    setTimelinePeriods(rebuilt);
    updateTimeline((current) => ({ ...current, periods: rebuilt }));
  }

  function addTimelineNode() {
    const endMs = Math.round(Math.max(80, timelinePlaybackMs));
    const nodes = timelineAxisPeriods(timelinePeriods);
    if (nodes.some((node) => Math.abs(node.endMs - endMs) < 80)) {
      setNotice('当前位置已经有时间节点');
      return;
    }
    const node: ComboPeriod = { id: `mobile-axis-node-${Date.now()}`, kind: 'loop_axis', label: '循环轴', startMs: 0, endMs };
    const next = rebuildTimelineAxisPeriods(timelinePeriods, [...nodes, node]);
    setTimelinePeriods(next);
    updateTimeline((current) => ({ ...current, periods: next }));
    setTimelineSelectedPeriodId(node.id);
    setTimelineNodeUnlocked(false);
    setTimelineSelectedId(null);
    setTimelineSelectedIds([]);
  }

  function beginTimelineNodeDrag(event: React.PointerEvent<HTMLButtonElement>, period: ComboPeriod) {
    event.stopPropagation();
    setTimelineSelectedPeriodId(period.id);
    setTimelineSelectedId(null);
    setTimelineSelectedIds([]);
    if (!timelineNodeUnlocked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    timelineNodeDragRef.current = { id: period.id, startX: event.clientX, originalEnd: period.endMs, total: timelineTotalMs, moved: false, originalChart: timelineChart };
  }

  function useTimelineNodeTool() {
    if (timelineNodeUnlocked) {
      setTimelineNodeUnlocked(false);
      setTimelineSelectedPeriodId(null);
      setNotice('关键帧已锁定');
      return;
    }
    if (timelineSelectedPeriodId) {
      setTimelineNodeUnlocked(true);
      setNotice('关键帧已解锁，可以拖动或输入时间');
      return;
    }
    addTimelineNode();
  }

  function moveTimelineNodeDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = timelineNodeDragRef.current;
    if (!drag) return;
    const grid = event.currentTarget.closest('.mobile-timeline-track-grid') as HTMLElement | null;
    const row = grid?.querySelector<HTMLElement>('.mobile-timeline-track-row') ?? null;
    if (!row) return;
    const nodes = timelineAxisPeriods(timelinePeriods);
    const index = nodes.findIndex((node) => node.id === drag.id);
    if (index < 0) return;
    const delta = ((event.clientX - drag.startX) / Math.max(1, row.clientWidth)) * drag.total;
    const minimum = (index > 0 ? nodes[index - 1].endMs : 0) + 80;
    const maximum = index < nodes.length - 1 ? nodes[index + 1].endMs - 80 : Math.max(minimum, timelineTotalMs + 40_000);
    const endMs = Math.round(Math.max(minimum, Math.min(maximum, drag.originalEnd + delta)));
    drag.moved = true;
    const next = rebuildTimelineAxisPeriods(timelinePeriods, nodes.map((node) => node.id === drag.id ? { ...node, endMs } : node));
    setTimelinePeriods(next);
    setTimelineChart((current) => current ? { ...current, periods: next, updatedAt: Date.now() } : current);
  }

  function endTimelineNodeDrag() {
    const drag = timelineNodeDragRef.current;
    if (drag?.moved && drag.originalChart) {
      setTimelineHistory((history) => [...history.slice(-39), drag.originalChart!]);
      setTimelineRedo([]);
    }
    timelineNodeDragRef.current = null;
  }

  function updateTimelineNodeEnd(periodId: string, requestedEndMs: number) {
    const nodes = timelineAxisPeriods(timelinePeriods);
    const index = nodes.findIndex((node) => node.id === periodId);
    if (index < 0) return;
    const minimum = (index > 0 ? nodes[index - 1].endMs : 0) + 80;
    const maximum = index < nodes.length - 1 ? nodes[index + 1].endMs - 80 : Math.max(minimum, timelineTotalMs + 40_000);
    const endMs = Math.max(minimum, Math.min(maximum, Math.round(requestedEndMs)));
    commitTimelinePeriods([
      ...timelinePeriods.filter((period) => period.kind !== 'startup_axis' && period.kind !== 'loop_axis'),
      ...nodes.map((node) => node.id === periodId ? { ...node, endMs } : node)
    ]);
  }

  function deleteTimelineSelection() {
    if (timelineSelectedPeriodId) {
      const id = timelineSelectedPeriodId;
      commitTimelinePeriods(timelinePeriods.filter((item) => item.id !== id));
      setTimelineSelectedPeriodId(null);
      setTimelineNodeUnlocked(false);
      return;
    }
    const ids = timelineSelectedIds.length ? timelineSelectedIds : timelineSelectedId ? [timelineSelectedId] : [];
    if (!ids.length) return;
    updateTimeline((current) => ({ ...current, steps: current.steps.filter((step) => !ids.includes(step.id)), contentLabels: Object.fromEntries(Object.entries(current.contentLabels ?? {}).filter(([id]) => !ids.includes(id))) }));
    setTimelineSelectedId(null);
    setTimelineSelectedIds([]);
  }

  function copyTimelineSelection() {
    if (!timelineChart) return;
    if (timelineSelectedPeriodId) {
      const period = timelineAxisPeriods(timelinePeriods).find((item) => item.id === timelineSelectedPeriodId);
      if (!period) return;
      const steps = timelineChart.steps.filter((step) => step.startMin >= period.startMs && step.startMin < period.endMs);
      const contentLabels = Object.fromEntries(steps.flatMap((step) => typeof timelineChart.contentLabels?.[step.id] === 'string' ? [[step.id, timelineChart.contentLabels[step.id]]] : []));
      setTimelineClipboard({ steps: steps.map((step) => ({ ...step, samples: [...step.samples] })), periods: [{ ...period }], contentLabels, anchorMs: period.startMs });
      setNotice(`已复制节点左侧时段（${steps.length} 个招式块）`);
      return;
    }
    const ids = timelineSelectedIds.length ? timelineSelectedIds : timelineSelectedId ? [timelineSelectedId] : [];
    const steps = timelineChart.steps.filter((step) => ids.includes(step.id));
    if (!steps.length) return;
    const anchorMs = Math.min(...steps.map((step) => step.startMin));
    const contentLabels = Object.fromEntries(steps.flatMap((step) => typeof timelineChart.contentLabels?.[step.id] === 'string' ? [[step.id, timelineChart.contentLabels[step.id]]] : []));
    setTimelineClipboard({ steps: steps.map((step) => ({ ...step, samples: [...step.samples] })), periods: [], contentLabels, anchorMs });
    setNotice(`已复制 ${steps.length} 个招式块`);
  }

  function pasteTimelineSelection() {
    if (!timelineClipboard || !timelineChart) return;
    const offset = Math.max(0, Math.round(timelinePlaybackMs));
    const ids = new Map<string, string>();
    const steps = timelineClipboard.steps.map((step, index) => {
      const id = `mobile-paste-${Date.now()}-${index}`;
      ids.set(step.id, id);
      const start = offset + step.startMin - timelineClipboard.anchorMs;
      return { ...step, id, startMin: start, startMax: start, samples: step.samples.map((sample) => ({ ...sample })) };
    });
    const insertedLabels = Object.fromEntries([...ids.entries()].flatMap(([oldId, newId]) => typeof timelineClipboard.contentLabels[oldId] === 'string' ? [[newId, timelineClipboard.contentLabels[oldId]]] : []));
    let nextPeriods = timelinePeriods;
    if (timelineClipboard.periods.length) {
      const duration = Math.max(80, timelineClipboard.periods[0].endMs - timelineClipboard.periods[0].startMs);
      const nodes = timelineAxisPeriods(timelinePeriods);
      const additions: ComboPeriod[] = [];
      if (offset >= 80 && !nodes.some((node) => Math.abs(node.endMs - offset) < 80)) additions.push({ id: `mobile-paste-node-start-${Date.now()}`, kind: 'loop_axis', label: '循环轴', startMs: 0, endMs: offset });
      const pastedEnd = offset + duration;
      if (!nodes.some((node) => Math.abs(node.endMs - pastedEnd) < 80)) additions.push({ id: `mobile-paste-node-end-${Date.now()}`, kind: 'loop_axis', label: '循环轴', startMs: 0, endMs: pastedEnd });
      nextPeriods = rebuildTimelineAxisPeriods(timelinePeriods, [...nodes, ...additions]);
    }
    updateTimeline((current) => ({ ...current, steps: [...current.steps, ...steps], periods: nextPeriods, contentLabels: { ...(current.contentLabels ?? {}), ...insertedLabels } }));
    setTimelinePeriods(nextPeriods);
    setTimelineSelectedIds(steps.map((step) => step.id));
    setTimelineSelectedId(steps[0]?.id ?? null);
  }

  function cutTimelineSelection() {
    copyTimelineSelection();
    deleteTimelineSelection();
  }

  function splitTimelineSelection() {
    if (!timelineChart) return;
    const id = timelineSelectedId ?? timelineSelectedIds[0];
    const step = timelineChart.steps.find((item) => item.id === id);
    if (!step || step.durationMax < 70) return;
    const leftDuration = Math.max(35, Math.round(step.durationMax / 2));
    const rightDuration = Math.max(35, step.durationMax - leftDuration);
    const rightId = `mobile-split-${Date.now()}`;
    const left = { ...step, durationMin: leftDuration, durationMax: leftDuration };
    const right = { ...step, id: rightId, startMin: step.startMin + leftDuration, startMax: step.startMin + leftDuration, durationMin: rightDuration, durationMax: rightDuration, samples: [] };
    updateTimeline((current) => ({ ...current, steps: current.steps.flatMap((item) => item.id === step.id ? [left, right] : [item]), contentLabels: current.contentLabels?.[step.id] ? { ...current.contentLabels, [rightId]: current.contentLabels[step.id] } : current.contentLabels }));
    setTimelineSelectedIds([left.id, right.id]);
  }

  function mergeTimelineSelection() {
    if (!timelineChart) return;
    const selectedSteps = timelineChart.steps.filter((step) => timelineSelectedIds.includes(step.id));
    if (selectedSteps.length < 2) return;
    const first = selectedSteps[0];
    if (!selectedSteps.every((step) => mobileMoveKey(step.moveId) === mobileMoveKey(first.moveId) && step.characterSlot === first.characterSlot && step.lane === first.lane)) {
      setNotice('只能合并同角色、同轨道、同招式的块');
      return;
    }
    const start = Math.min(...selectedSteps.map((step) => step.startMin));
    const end = Math.max(...selectedSteps.map((step) => step.startMin + step.durationMax));
    const ids = selectedSteps.map((step) => step.id);
    updateTimeline((current) => ({ ...current, steps: current.steps.filter((step) => !ids.includes(step.id) || step.id === first.id).map((step) => step.id === first.id ? { ...step, startMin: start, startMax: start, durationMin: end - start, durationMax: end - start } : step) }));
    setTimelineSelectedIds([first.id]);
    setTimelineSelectedId(first.id);
  }

  function undoTimeline() {
    setTimelineHistory((history) => {
      const previous = history.at(-1);
      if (!previous || !timelineChart) return history;
      setTimelineRedo((redo) => [...redo, timelineChart]);
      setTimelineChart(previous);
      setTimelinePeriods([...(previous.periods ?? [])]);
      setTimelineNodeUnlocked(false);
      return history.slice(0, -1);
    });
  }

  function redoTimeline() {
    setTimelineRedo((redo) => {
      const next = redo.at(-1);
      if (!next || !timelineChart) return redo;
      setTimelineHistory((history) => [...history, timelineChart]);
      setTimelineChart(next);
      setTimelinePeriods([...(next.periods ?? [])]);
      setTimelineNodeUnlocked(false);
      return redo.slice(0, -1);
    });
  }

  function timelineBeginDrag(event: React.PointerEvent<HTMLButtonElement>, step: ComboStep, total: number) {
    event.stopPropagation();
    if (timelineEditMode === 'delete' || timelineToolGroup === 'add') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    timelineDragRef.current = { id: step.id, startX: event.clientX, originalStart: step.startMin, total, moved: false, originalChart: timelineChart };
  }

  function timelineMoveDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = timelineDragRef.current;
    if (!drag || !timelineChart) return;
    const track = event.currentTarget.parentElement;
    if (!track) return;
    const delta = ((event.clientX - drag.startX) / Math.max(1, track.clientWidth)) * drag.total;
    const start = Math.max(0, Math.round(drag.originalStart + delta));
    drag.moved = true;
    setTimelineChart((current) => current ? { ...current, updatedAt: Date.now(), steps: current.steps.map((item) => item.id === drag.id ? { ...item, startMin: start, startMax: Math.max(start, start + 120) } : item) } : current);
  }

  function timelineEndDrag() {
    const drag = timelineDragRef.current;
    if (drag?.moved && drag.originalChart) {
      setTimelineHistory((history) => [...history.slice(-39), drag.originalChart!]);
      setTimelineRedo([]);
    }
    timelineDragRef.current = null;
  }

  function moveTimelinePlayhead(event: React.PointerEvent<HTMLButtonElement>) {
    if (!timelinePlayheadDragRef.current) return;
    const grid = event.currentTarget.closest('.mobile-timeline-track-grid') as HTMLElement | null;
    const track = grid?.querySelector<HTMLElement>('.mobile-timeline-track-row') ?? null;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    setTimelinePlaybackMs(Math.max(0, Math.min(timelineTotalMs, ((event.clientX - rect.left) / Math.max(1, rect.width)) * timelineTotalMs)));
  }

  function addTimelineStep(moveId: string, requestedStart: number, characterSlot: number, adaptiveSwitch = false) {
    updateTimeline((current) => {
      const start = Math.max(0, Math.round(requestedStart));
      const resolvedMoveId = adaptiveSwitch ? `switch_${Math.max(1, Math.min(4, characterSlot))}` : moveId;
      const move = DEFAULT_MOVES.find((item) => item.id === resolvedMoveId) ?? DEFAULT_MOVES.find((item) => item.id === moveId) ?? DEFAULT_MOVES[2];
      const step: ComboStep = {
        id: `mobile-edit-${Date.now()}-${current.steps.length}`,
        moveId: move.id,
        label: move.label,
        characterSlot: Math.max(1, Math.min(4, characterSlot)) as 1 | 2 | 3 | 4,
        lane: move.id === 'basic_attack' || move.id === 'heavy_attack' || isMobileSwitchMove(move.id) || move.independent ? 'independent' : 'main',
        independent: move.independent,
        startMin: start,
        startMax: start + 120,
        durationMin: move.id === 'liberation' ? 3000 : 1000,
        durationMax: move.id === 'liberation' ? 3000 : 1000,
        preheatMs: 0,
        recoveryMs: 0,
        color: move.color,
        advancesStep: move.advancesStep,
        samples: []
      };
      setTimelineSelectedId(step.id);
      setTimelineSelectedIds([step.id]);
      return { ...current, updatedAt: Date.now(), steps: [...current.steps, step] };
    });
  }

  function toggleTimelineToolGroup(group: Exclude<MobileTimelineToolGroup, null>) {
    setTimelineNoteOpen(false);
    setTimelineToolGroup((current) => {
      const next = current === group ? null : group;
      if (next === 'add') {
        setTimelinePressMode('tap');
        setTimelineTool('basic_attack');
      } else setTimelineTool(null);
      if (next === 'modify') setTimelinePressMode('tap');
      if (next !== 'modify') setTimelineModifyTool(null);
      if (next !== 'edit') {
        setTimelineEditMode(null);
        setTimelineMultiSelect(false);
      }
      return next;
    });
  }

  function toggleTimelinePressMode() {
    const next: MobileTimelinePressMode = timelinePressMode === 'tap' ? 'hold' : 'tap';
    setTimelinePressMode(next);
    if (timelineToolGroup === 'add') setTimelineTool(next === 'hold' ? 'heavy_attack' : 'basic_attack');
    if (timelineToolGroup === 'modify') setTimelineModifyTool(null);
  }

  function selectTimelineStep(step: ComboStep) {
    if (timelineEditMode === 'delete') {
      updateTimeline((current) => ({ ...current, steps: current.steps.filter((item) => item.id !== step.id), contentLabels: Object.fromEntries(Object.entries(current.contentLabels ?? {}).filter(([id]) => id !== step.id)) }));
      return;
    }
    if (timelineMultiSelect) {
      setTimelineSelectedIds((ids) => ids.includes(step.id) ? ids.filter((id) => id !== step.id) : [...ids, step.id]);
      setTimelineSelectedId(step.id);
    } else {
      setTimelineSelectedId(step.id);
      setTimelineSelectedIds([step.id]);
    }
    setTimelineSelectedPeriodId(null);
    setTimelineNoteDraft(step.note ?? '');
  }

  function placeTimelineTool(event: React.MouseEvent<HTMLDivElement>, characterSlot: number) {
    if (!timelineChart || event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const time = ((event.clientX - rect.left) / Math.max(1, rect.width)) * timelineTotalMs;
    const tool = MOBILE_TIMELINE_MOVE_TOOLS.find((item) => item.moveId === timelineTool);
    if (timelineToolGroup === 'add' && tool) addTimelineStep(tool.moveId, time, characterSlot, tool.adaptiveSwitch);
    else {
      setTimelinePlaybackMs(Math.max(0, Math.min(timelineTotalMs, time)));
      setTimelineSelectedId(null);
      setTimelineSelectedIds([]);
      setTimelineSelectedPeriodId(null);
    }
  }

  function applyTimelineMoveTool(tool: (typeof MOBILE_TIMELINE_MOVE_TOOLS)[number]) {
    if (!timelineChart) return;
    const ids = timelineSelectedIds.length ? timelineSelectedIds : timelineSelectedId ? [timelineSelectedId] : [];
    if (!ids.length) {
      setNotice('请先选择要修改的招式块');
      return;
    }
    setTimelineModifyTool(tool.moveId);
    updateTimeline((current) => ({
      ...current,
      steps: current.steps.map((step) => {
        if (!ids.includes(step.id)) return step;
        const resolvedMoveId = tool.adaptiveSwitch ? `switch_${step.characterSlot ?? 1}` : tool.moveId;
        const move = DEFAULT_MOVES.find((item) => item.id === resolvedMoveId) ?? DEFAULT_MOVES.find((item) => item.id === tool.moveId);
        if (!move) return step;
        return {
          ...step,
          moveId: move.id,
          label: move.label,
          color: move.color,
          advancesStep: move.advancesStep,
          independent: move.independent,
          lane: move.id === 'basic_attack' || move.id === 'heavy_attack' || isMobileSwitchMove(move.id) || move.independent ? 'independent' : 'main'
        };
      })
    }));
  }

  function applyTimelineIntroOutro(kind: 'intro' | 'outro') {
    if (!timelineChart) return;
    const ids = timelineSelectedIds.length ? timelineSelectedIds : timelineSelectedId ? [timelineSelectedId] : [];
    if (!ids.length) {
      setNotice('请先选择要修改的招式块');
      return;
    }
    updateTimeline((current) => {
      const contentLabels = { ...(current.contentLabels ?? {}) };
      current.steps.filter((step) => ids.includes(step.id)).forEach((step) => {
        const fallback = defaultComboContentLabelForMoveId(step.moveId) ?? '';
        const value = contentLabels[step.id]?.trim() || fallback;
        contentLabels[step.id] = kind === 'intro'
          ? (value.startsWith('b') ? value : `b${value}`)
          : (value.endsWith('y') ? value : `${value}y`);
      });
      return { ...current, contentLabels };
    });
    setTimelineModifyTool(kind);
  }

  function commitTimelineNote() {
    if (!timelineSelectedId) return;
    updateTimelineStep(timelineSelectedId, { note: timelineNoteDraft.trim() || undefined });
    setTimelineNoteOpen(false);
  }

  function saveTimeline() {
    if (!timelineChart) return;
    const next = normalizeChart({ ...timelineChart, periods: timelinePeriods });
    setRecordTitle(next.title);
    setRecordTextAxis(chartToMobileTextAxis(next));
    setRecordAxisChart(next);
    addCharts([next], '编辑已保存');
    setTimelineChart(next);
    setPage('record');
  }

  useEffect(() => {
    const onCommunityMessage = (event: MessageEvent<unknown>) => {
      const frameWindow = communityRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow || event.origin !== COMMUNITY_ORIGIN) return;
      const data = event.data as { type?: string; version?: number } | null;
      if (data?.type === 'wwcombo:community-library-request' && data.version === 1) {
        postCommunityState(frameWindow, event.origin, true);
        return;
      }
      if (!isCommunityImportMessage(event.data)) return;
      const message = event.data;
      let ok = false;
      let detail = '';
      try {
        const serialized = JSON.stringify(message.payload);
        if (new TextEncoder().encode(serialized).byteLength > COMMUNITY_IMPORT_MAX_BYTES) throw new Error('连段文件超过 2 MB');
        const charts = chartsFromValue(message.payload);
        addCharts(charts, `已从社区装载${message.filename ? `「${message.filename.slice(0, 48)}」` : ''}`);
        ok = true;
      } catch (error) {
        detail = error instanceof Error ? error.message : String(error);
        setNotice(`社区装载失败：${detail}`);
      }
      frameWindow.postMessage({ type: 'wwcombo:community-import-result', version: 1, requestId: message.requestId, ok, detail }, event.origin);
    };
    window.addEventListener('message', onCommunityMessage);
    return () => window.removeEventListener('message', onCommunityMessage);
  }, [library]);

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const charts: ComboChart[] = [];
      for (const file of Array.from(files)) charts.push(...chartsFromJson(await file.text()));
      addCharts(charts);
    } catch (error) {
      setNotice(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function importEditorImage(file: File | null) {
    if (!file || !file.type.startsWith('image/')) return;
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (dataUrl) setEditorImage(dataUrl);
  }

  async function openAccessibilitySettings() {
    try {
      await invoke('mobile_open_accessibility_settings');
    } catch (error) {
      setNotice(`无法打开设置：${String(error)}`);
    }
  }

  async function toggleAssistant() {
    if (status.assistantActive) {
      setBusy(true);
      try {
        await invoke('mobile_stop_assistant');
        setStatus((current) => ({ ...current, assistantActive: false, overlayEditing: false, phase: 'idle', message: '未运行' }));
        await refreshStatus();
      } catch (error) {
        setNotice(`停止辅助失败：${String(error)}`);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!selected) return;
    if (!status.accessibilityEnabled) {
      setNotice('请先开启无障碍权限，返回后再启动辅助');
      await openAccessibilitySettings();
      return;
    }
    setBusy(true);
    try {
      setStatus(await invoke<MobileStatus>('mobile_start_assistant', { chart: selected, settings: appearance }));
    } catch (error) {
      setNotice(`启动失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeChart(chartId: string) {
    const chart = library.find((item) => item.id === chartId);
    if (!chart) return;
    if (status.assistantActive && selected?.id === chartId) {
      try {
        await invoke('mobile_stop_assistant');
        setStatus((current) => ({ ...current, assistantActive: false, overlayEditing: false, phase: 'idle', message: '未运行' }));
      } catch {
        // Deleting the local chart must still work if the native service is unavailable.
      }
    }
    const next = library.filter((item) => item.id !== chartId);
    const nextSelectedId = selected?.id === chartId ? (next[0]?.id ?? '') : (selected?.id ?? next[0]?.id ?? '');
    setLibrary(next);
    setSelectedId(nextSelectedId);
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
    if (nextSelectedId) localStorage.setItem(SELECTED_KEY, nextSelectedId);
    else localStorage.removeItem(SELECTED_KEY);
    if (timelineChart?.id === chartId) {
      setTimelineChart(next[0] ? normalizeChart(next[0]) : null);
      setTimelinePeriods([...(next[0]?.periods ?? [])]);
    }
    setNotice(`已删除「${chart.title}」`);
  }

  function removeSelected() {
    if (selected) void removeChart(selected.id);
  }

  function patchAppearance(patch: Partial<MobileOverlaySettings>) {
    setAppearance((current) => normalizeAppearance({ ...current, ...patch }));
  }

  function patchZone(kind: 'startZone' | 'exitZone', patch: Partial<TriggerZone>) {
    setAppearance((current) => normalizeAppearance({ ...current, [kind]: { ...current[kind], ...patch } }));
  }

  function patchKeyZone(key: MobileKeyAction, patch: Partial<TriggerZone>) {
    setAppearance((current) => normalizeAppearance({
      ...current,
      keyZones: { ...current.keyZones, [key]: { ...current.keyZones[key], ...patch } }
    }));
  }

  function enterEditor() {
    setEditorTarget('zones');
    setEditorMenuOpen(false);
    setPage('editor');
  }

  function exitEditor() {
    setEditorMenuOpen(false);
    setPage('appearance');
  }

  return (
    <div className="mobile-shell">
      <main className={`mobile-page mobile-page-${page}`}>
        {page === 'library' && <>
          <section className="mobile-hero-panel">
            <div className="mobile-status-line">
              <span className={`mobile-status-dot ${status.assistantActive ? 'active' : ''}`} />
              <strong>{phaseLabel(status, language)}</strong>
              <span>{tm(status.message)}</span>
            </div>
            <div className="mobile-hero-title-row">
              <h1>{selected?.title ?? t('从社区选择一份连段')}</h1>
              <div className="mobile-playback-mode" role="group" aria-label={t('播放模式')}>
                <span>{t('播放模式')}</span>
                <button type="button" className={appearance.playbackMode === 'demo' ? 'active' : ''} onClick={() => patchAppearance({ playbackMode: 'demo' })}>{t('演示')}</button>
                <button type="button" className={appearance.playbackMode === 'progress' ? 'active' : ''} onClick={() => patchAppearance({ playbackMode: 'progress' })}>{t('推进')}</button>
                <button type="button" className={appearance.playbackMode === 'agent' ? 'active' : ''} onClick={() => patchAppearance({ playbackMode: 'agent' })}>{t('代理')}</button>
              </div>
            </div>
            <p>{selected ? (language === 'en-US' ? `${selected.steps.length} actions · ${Math.ceil(Math.max(...selected.steps.map((step) => step.startMin + step.durationMin), 0) / 1000)} sec` : `${selected.steps.length} 个招式块 · ${Math.ceil(Math.max(...selected.steps.map((step) => step.startMin + step.durationMin), 0) / 1000)} 秒`) : t('装载后即可在游戏上方播放连段图')}</p>
            <button type="button" className={`mobile-primary-action ${status.assistantActive ? 'stop' : ''}`} disabled={busy || (!selected && !status.assistantActive)} onClick={() => void toggleAssistant()}>
              {status.assistantActive ? <Square size={20} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
              {status.assistantActive ? t('停止辅助') : t('启动并等待点击挑战')}
            </button>
          </section>

          <section className="mobile-section mobile-permission-row">
            <div className={`mobile-permission-icon ${status.accessibilityEnabled ? 'ready' : ''}`}><ShieldCheck size={23} /></div>
            <div><strong>{t('悬浮播放服务')}</strong><span>{status.accessibilityEnabled ? t('无障碍权限已开启') : t('需要开启无障碍权限')}</span></div>
            <button type="button" onClick={() => void openAccessibilitySettings()}><Settings2 size={18} />{t('设置')}</button>
          </section>

          {selected && <section className="mobile-section mobile-preview-section">
            <div className="mobile-section-heading"><div><strong>{t('连段图预览')}</strong><span>{t('实际外观可在“外观”中调整')}</span></div><div className="mobile-preview-heading-actions"><button type="button" className="mobile-preview-expand-button" onClick={() => setPracticePreviewExpanded(true)}><ZoomIn size={16} />{t('展开')}</button>{IS_MOBILE_PREVIEW && <button type="button" className="mobile-preview-expand-button debug" onClick={() => setDebugGamePreviewOpen(true)}><Gamepad2 size={16} />{t('模拟游戏')}</button>}</div></div>
            <div className={`mobile-combo-preview ${appearance.layout} ${appearance.blockMode}`} style={{ '--preview-scale': 1, '--preview-gap': `${(appearance.layout === 'text' ? appearance.textSpacing : (appearance.capsuleGap || appearance.blockGap)) * appearance.overallScale * appearance.scale}px`, '--preview-active-color': appearance.activeColor } as React.CSSProperties}>
              {previewGroups.map((group, index) => {
                const step = group[0];
                const moveSegments = previewMoveSegments(group, appearance);
                const slot = String(step.characterSlot ?? 1);
                const baseSource = appearance.layout !== 'text' && appearance.blockMode === 'image'
                  ? appearance.baseSources[slot]
                  : undefined;
                const hasSameMoveMerge = moveSegments.some((segment) => segment.length > 1);
                const metrics = previewBlockMetrics(step, appearance, group);
                const blockWidth = Number.parseFloat(metrics.width ?? '80');
                const blockHeight = Number.parseFloat(metrics.minHeight);
                const renderScale = Math.max(.05, appearance.overallScale * appearance.scale);
                const iconSize = mobilePreviewIconSize(appearance, blockHeight, renderScale);
                const avatarLayout = mobilePreviewAvatarLayout(appearance, renderScale);
                const base = mobileExpandedPreviewBaseStyle(appearance, step, blockWidth, blockHeight);
                return <div className={`mobile-preview-step ${index === 0 ? 'current' : ''} ${appearance.capsuleShape} ${hasSameMoveMerge ? 'merged' : ''} ${base.source ? 'has-base-slice' : ''}`} key={step.id} style={{ ...metrics, ...base.style, ...mobilePreviewIconFeedbackVars(appearance), ...mobilePreviewTextVars(appearance, renderScale), height: metrics.minHeight, '--preview-icon-size': `${iconSize}px`, '--preview-avatar-size': `${avatarLayout.avatarSize}px`, '--preview-avatar-offset-x': `${avatarLayout.avatarOffsetX}px`, '--preview-avatar-offset-y': `${avatarLayout.avatarOffsetY}px`, '--preview-content-start': `${avatarLayout.contentStart}px`, '--preview-inner-gap': `${Math.max(1, 4 * renderScale)}px`, background: base.source ? undefined : (index === 0 && group.length === 1 ? appearance.activeColor : appearance.backgroundColor), borderColor: appearance.borderColor, color: '#ffffff', opacity: appearance.opacity, fontFamily: appearance.fontFamily, textShadow: appearance.textStrokeEnabled ? `0 0 ${appearance.textStrokeWidth}px ${appearance.textStrokeColor}` : undefined } as React.CSSProperties}>
                  {base.source && <><i className="mobile-preview-base-slice left" /><i className="mobile-preview-base-slice middle" /><i className="mobile-preview-base-slice right" /></>}
                  {appearance.avatarEnabled && <img className="mobile-preview-avatar" src={appearance.avatarSources[slot] || `/combo-assets/avatar-presets/role-${slot}.webp`} alt="" />}
                  <span className="mobile-preview-content">
                    {moveSegments.map((segment, segmentIndex) => {
                      const item = segment[0];
                      const iconSource = iconSourceForStep(item, appearance.iconSet);
                      const active = index === 0 && segmentIndex === 0;
                      return <span className="mobile-preview-move-segment" key={item.id}>
                        {appearance.convertIcons
                          ? (iconSource ? <img className={`mobile-preview-icon ${active ? 'active' : ''}`} src={iconSource} alt={item.moveId} /> : <strong style={{ fontSize: `${appearance.fontSize}px` }}>{item.moveId}</strong>)
                          : <strong style={{ fontSize: `${appearance.fontSize}px` }}>{item.moveId}</strong>}
                        {segment.length > 1 && <b className="mobile-preview-count">x{segment.length}</b>}
                        {segment.length > 1 && <span className="mobile-preview-merge-markers">{segment.map((member, markerIndex) => <i className={active && markerIndex === 0 ? 'active' : ''} key={member.id} />)}</span>}
                      </span>;
                    })}
                  </span>
                </div>;
              })}
            </div>
          </section>}

          {selected && practicePreviewExpanded && <MobileExpandedAxisPreview chart={selected} appearance={appearance} language={language} onClose={() => setPracticePreviewExpanded(false)} />}
          {selected && debugGamePreviewOpen && <MobileDebugGamePreview chart={selected} appearance={appearance} language={language} onClose={() => setDebugGamePreviewOpen(false)} />}

          <section className="mobile-section mobile-library-section">
            <div className="mobile-section-heading">
              <div><strong>{t('我的连段')}</strong><span>{language === 'en-US' ? `${library.length}${t('份，社区下载后会直接出现在这里')}` : `${library.length} ${t('份，社区下载后会直接出现在这里')}`}</span></div>
              <button type="button" className="mobile-icon-button danger" aria-label={t('删除当前连段')} disabled={!selected} onClick={removeSelected}><Trash2 size={18} /></button>
            </div>
            <div className="mobile-library-list">
              {library.map((chart) => <div key={chart.id} className={`mobile-library-item ${chart.id === selected?.id ? 'selected' : ''}`}><button type="button" className="mobile-library-item-main" onClick={() => setSelectedId(chart.id)}><strong>{chart.title}</strong><span>{chart.steps.length} {t('块')}</span></button><button type="button" className="mobile-library-item-edit" aria-label={`${language === 'en-US' ? 'Edit' : '编辑'} ${chart.title}`} onClick={() => editLibraryChart(chart)}><Edit3 size={16} /></button><button type="button" className="mobile-library-item-delete" aria-label={`${language === 'en-US' ? 'Delete' : '删除'} ${chart.title}`} onClick={() => void removeChart(chart.id)}><Trash2 size={16} /></button></div>)}
              {!library.length && <div className="mobile-library-empty-state"><img src="/mobile-empty-lingyang.png" alt="" /><p>{t('空空如也，可以')}<button type="button" onClick={() => setPage('record')}>{t('录制')}</button>{t('或者右转')}<button type="button" onClick={() => setPage('community')}>{t('社区')}</button>{t('哦')}</p></div>}
            </div>
            <input ref={fileRef} className="mobile-file-input" type="file" accept="application/json,.json,.wwcombo.json" multiple onChange={(event) => void importFiles(event.currentTarget.files)} />
            <button type="button" className="mobile-local-import" disabled={busy} onClick={() => fileRef.current?.click()}><FileJson size={17} />{t('从手机文件导入')}</button>
          </section>
        </>}

        {page === 'community' && <section className="mobile-community-page">
          <div className="mobile-community-toolbar"><strong>{t('连段社区')}</strong><span>{t('点击社区中的下载即可装载到手机')}</span><button type="button" aria-label={t('刷新社区')} onClick={() => setCommunityKey((current) => current + 1)}><RefreshCw size={18} /></button></div>
          <iframe
            key={`${communityKey}-${language}`}
            ref={communityRef}
            src={communityEmbedUrl(language)}
            title={t('连段社区')}
            sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => postCommunityState(communityRef.current?.contentWindow, COMMUNITY_ORIGIN, true)}
          />
        </section>}

        {page === 'record' && <section className="mobile-record-page">
          <section className="mobile-section mobile-record-create">
            <div className="mobile-section-heading"><div><strong>{t('新建连段')}</strong><span>{t('先命名，再设置队伍和文字轴')}</span></div></div>
            <div className="mobile-record-title-row"><input value={recordTitle} onChange={(event) => setRecordTitle(event.target.value)} placeholder={t('连段名字')} /><button type="button" onClick={beginNewRecording}><Plus size={17} />{t('新建')}</button></div>
           </section>

           <section className="mobile-section mobile-formation-section">
             <div className="mobile-section-heading"><div><strong>{t('快捷编队')}</strong><span>{t('角色名和头像来自 API，点击头像记录选择顺序')}</span></div><button type="button" onClick={() => { setRecordTeamDraft(recordTeam.every((name) => apiCharacters.some((item) => mobileAssetMatches(item, name))) ? recordTeam : []); setTeamPickerOpen(true); }}><Users size={16} />{t('选择')}</button></div>
             <div className="mobile-record-team-avatars">{recordTeam.map((name, index) => { const avatar = apiCharacters.find((item) => mobileAssetMatches(item, name)); return <button type="button" key={`${name}-${index}`} className={recordStartingSlot === index + 1 ? 'active' : ''} onClick={() => setRecordStartingSlot((index + 1) as 1 | 2 | 3)}><img src={avatar?.src || `/combo-assets/avatar-presets/role-${index + 1}.webp`} alt="" /><span>{displayCharacterName(name)}</span><small>{recordStartingSlot === index + 1 ? t('首发') : `${language === 'en-US' ? 'Slot' : '切'} ${index + 1}`}</small></button>; })}</div>
             {teamPickerOpen && <div className="mobile-team-picker" role="dialog" aria-label={t('快捷编队')}><div className="mobile-team-picker-head"><strong>{t('选择编队角色')}</strong><button type="button" onClick={closeTeamPicker}><Check size={17} />{t('完成')}</button></div><p>{t('按名字拼音排序；依次点击三个头像，关闭后保存编队。')}</p><div className="mobile-team-picker-grid">{apiCharacters.map((item) => { const index = recordTeamDraft.findIndex((name) => mobileAssetMatches(item, name)); return <button type="button" key={item.name} className={index >= 0 ? 'selected' : ''} onClick={() => toggleTeamCharacter(item.name)}><img src={item.src} alt="" /><strong>{mobileAssetDisplayName(item, language)}</strong>{index >= 0 && <b>{index + 1}</b>}</button>; })}</div>{!apiCharacters.length && <span className="mobile-team-picker-empty">{t('正在读取角色列表，请稍后重试。')}</span>}</div>}
           </section>

           <section className="mobile-section mobile-record-axis-section">
             <div className="mobile-record-action-row"><button type="button" className="mobile-record-axis-button" onClick={() => void parseRecordingAxis()}><FileText size={18} />{t('文字轴')}</button><button type="button" className={`mobile-primary-action mobile-record-start ${status.recordingActive ? 'stop' : ''}`} disabled={!recordAxisChart && !recordTextAxis.trim()} onClick={() => void (status.recordingActive ? stopMobileRecording() : startMobileRecording())}>{status.recordingActive ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}{status.recordingActive ? `${t('结束录制')} ${(status.recordingElapsed ?? 0) / 1000 | 0}s` : t('开始录制')}</button></div>
             {recordPreviewChart && <div className="mobile-record-axis-preview"><div className="mobile-record-list-label">{t('当前连段预览')}</div><MobileTimelineTextPreview chart={recordPreviewChart} appearance={appearance} activeTimeMs={0} className="mobile-record-text-preview" /></div>}
             <textarea className="mobile-record-axis-input" value={recordTextAxis} onChange={(event) => { setRecordTextAxis(event.target.value); setRecordAxisChart(null); setRecordAxisError(''); }} placeholder={t('输入文字轴，例如：1 a e q 2 a r 3 A')} />
            <div className={`mobile-record-axis-status ${recordAxisChart ? 'ready' : ''}`}>{recordAxisChart ? (language === 'en-US' ? `Recognized ${recordAxisChart.steps.length} actions` : `已识别 ${recordAxisChart.steps.length} 个招式块`) : t('基于文字轴已强制开启，未输入文字轴不能录制')}{recordAxisError && <span>{recordAxisError}</span>}</div>
             <div className="mobile-record-after-row"><button type="button" disabled={!timelineChart} onClick={() => openTimeline(timelineChart)}><Edit3 size={17} />{t('编辑')}</button><button type="button" disabled={!timelineChart} onClick={() => openShareDialog(timelineChart)}><Share2 size={17} />{t('分享')}</button></div>
          </section>

           <section className="mobile-section mobile-record-settings-section">
             <div className="mobile-section-heading"><div><strong>{t('录制识别设置')}</strong><span>{t('持续点按合并为同一招式块，达到长按阈值转为长按招式')}</span></div><Settings2 size={18} /></div>
              <div className="mobile-record-number-grid"><label>{t('点按合并')}<input type="number" min="50" max="5000" step="50" value={tapMergeMs} onChange={(event) => setTapMergeMs(Number(event.target.value))} /><small>{t('毫秒')}</small></label><label>{t('普通长按')}<input type="number" min="50" max="3000" step="50" value={standardHoldMs} onChange={(event) => setStandardHoldMs(Number(event.target.value))} /><small>{t('毫秒')}</small></label><label>{t('重击长按')}<input type="number" min="50" max="3000" step="50" value={heavyHoldMs} onChange={(event) => setHeavyHoldMs(Number(event.target.value))} /><small>{t('毫秒')}</small></label></div>
           </section>
            <section className="mobile-section mobile-record-library-bottom"><div className="mobile-section-heading"><div><strong>{t('连段列表')}</strong><span>{t('选择连段后会同步到上方时间轴')}</span></div></div><div className="mobile-library-list mobile-record-library-list">{library.map((chart) => <div key={chart.id} className={`mobile-library-item ${chart.id === selected?.id ? 'selected' : ''}`}><button type="button" className="mobile-library-item-main" onClick={() => { setSelectedId(chart.id); setRecordTitle(chart.title); setRecordAxisChart(null); setTimelineChart(normalizeChart(chart)); setTimelinePeriods([...(chart.periods ?? [])]); }}><strong>{chart.title}</strong><span>{chart.steps.length} {t('块')}</span></button><button type="button" className="mobile-library-item-edit" aria-label={`${language === 'en-US' ? 'Edit' : '编辑'} ${chart.title}`} onClick={() => editLibraryChart(chart)}><Edit3 size={16} /></button><button type="button" className="mobile-library-item-delete" aria-label={`${language === 'en-US' ? 'Delete' : '删除'} ${chart.title}`} onClick={() => void removeChart(chart.id)}><Trash2 size={16} /></button></div>)}</div></section>
         </section>}

        {page === 'appearance' && <section className="mobile-appearance-page">
          <section className="mobile-section mobile-language-setting">
            <div className="mobile-language-heading"><Languages size={21} /><div><strong>{t('界面语言')}</strong><span>{t('选择手机端界面的显示语言')}</span></div></div>
            <div className="mobile-language-options" role="group" aria-label={t('语言')}>
              <button type="button" className={language === 'zh-CN' ? 'active' : ''} onClick={() => setLanguage('zh-CN')}><span>中文</span><small>Chinese</small></button>
              <button type="button" className={language === 'en-US' ? 'active' : ''} onClick={() => setLanguage('en-US')}><span>English</span><small>英文</small></button>
            </div>
          </section>
          <section className="mobile-section mobile-update-setting">
            <div className="mobile-language-heading"><RefreshCw size={21} /><div><strong>{t('手机端更新')}</strong><span>{t('检查手机端是否有新版本')}</span></div></div>
            <div className="mobile-update-setting-row"><small>{t('当前版本')} v{__APP_VERSION__}</small><button type="button" onClick={() => void checkForMobileUpdate(true)} disabled={updateChecking}><RefreshCw size={16} className={updateChecking ? 'mobile-update-spinning' : ''} />{t(updateChecking ? '检查更新中' : '检查更新')}</button></div>
          </section>
           <div className="mobile-appearance-intro mobile-appearance-header"><Palette size={22} /><div><strong>{t('连段图外观')}</strong><span>{t('控制游戏内悬浮连段图的显示效果')}</span></div><button type="button" onClick={enterEditor}><Grip size={17} />{t('编辑')}</button></div>
          <AppearanceInspector appearance={appearance} selectedKey={selectedParameter} onSelect={setSelectedParameter} onChange={(key, value) => patchAppearance({ [key]: value } as Partial<MobileOverlaySettings>)} language={language} />
          <button type="button" className="mobile-reset-appearance" onClick={() => setAppearance(DEFAULT_APPEARANCE)}>{t('恢复默认外观与位置')}</button>
        </section>}
         {page === 'timeline' && timelineChart && <section className="mobile-timeline-page">
          <div className="mobile-timeline-preview-wrap">
            <MobileTimelineTextPreview chart={timelineChart} appearance={appearance} activeTimeMs={timelinePlaybackMs} />
          </div>

          <div className="mobile-timeline-tool-area">
            <div className="mobile-timeline-primary-tools">
              {timelineNoteOpen && timelineSelectedStep ? <>
                <button type="button" className="active" title="退出备注编辑" onClick={() => setTimelineNoteOpen(false)}><PenLine size={18} /></button>
                <input className="mobile-timeline-note-input" aria-label="招式备注" type="text" value={timelineNoteDraft} placeholder={`${timelineSelectedStep.label}备注`} onChange={(event) => setTimelineNoteDraft(event.target.value)} />
                <button type="button" title="保存备注" onClick={commitTimelineNote}><Check size={17} /></button>
              </> : timelineToolGroup === 'add' ? <>
                <button type="button" className="active" title="退出快速添加" onClick={() => toggleTimelineToolGroup('add')}><Plus size={19} /></button>
                <button type="button" className={timelinePressMode === 'hold' ? 'active press-mode' : 'press-mode'} title={timelinePressMode === 'tap' ? '切换为长按招式' : '切换为点按招式'} onClick={toggleTimelinePressMode}><b>长</b></button>
                {timelinePressTools.map((tool) => <button type="button" key={tool.moveId} className={timelineTool === tool.moveId ? 'active' : ''} title={tool.label} onClick={() => setTimelineTool(tool.moveId)}>{tool.adaptiveSwitch ? <UserRound size={18} /> : <b>{tool.code}</b>}</button>)}
              </> : timelineToolGroup === 'modify' ? <>
                <button type="button" className="active" title="退出修改" onClick={() => toggleTimelineToolGroup('modify')}><Wrench size={18} /></button>
                <button type="button" className={timelinePressMode === 'hold' ? 'active press-mode' : 'press-mode'} title={timelinePressMode === 'tap' ? '切换为长按招式' : '切换为点按招式'} onClick={toggleTimelinePressMode}><b>长</b></button>
                {timelinePressTools.map((tool) => <button type="button" key={tool.moveId} className={timelineModifyTool === tool.moveId ? 'active' : ''} title={tool.label} onClick={() => applyTimelineMoveTool(tool)}>{tool.adaptiveSwitch ? <UserRound size={18} /> : <b>{tool.code}</b>}</button>)}
                <button type="button" className={timelineModifyTool === 'intro' ? 'active' : ''} title="追加变奏图标" onClick={() => applyTimelineIntroOutro('intro')}><b>入</b></button>
                <button type="button" className={timelineModifyTool === 'outro' ? 'active' : ''} title="追加延奏图标" onClick={() => applyTimelineIntroOutro('outro')}><b>出</b></button>
              </> : timelineToolGroup === 'edit' ? <>
                <button type="button" className="active" title="退出编辑工具" onClick={() => toggleTimelineToolGroup('edit')}><Settings2 size={18} /></button>
                <button type="button" className={timelineMultiSelect ? 'active' : ''} title="多选" onClick={() => { const next = !timelineMultiSelect; setTimelineMultiSelect(next); setTimelineEditMode(next ? 'multi' : null); }}><Layers size={17} /></button>
                <button type="button" title="复制" onClick={copyTimelineSelection}><Copy size={17} /></button>
                <button type="button" title="剪切" onClick={cutTimelineSelection}><Scissors size={17} /></button>
                <button type="button" disabled={!timelineClipboard} title="粘贴到白色进度线右侧" onClick={pasteTimelineSelection}><Clipboard size={17} /></button>
                <button type="button" className={timelineEditMode === 'delete' ? 'active danger' : 'danger'} title="删除；无选中时进入连续删除" onClick={() => { const hasSelection = Boolean(timelineSelectedPeriodId || timelineSelectedIds.length || timelineSelectedId); if (hasSelection) deleteTimelineSelection(); else setTimelineEditMode((mode) => mode === 'delete' ? null : 'delete'); }}><Trash2 size={17} /></button>
              </> : <>
                <button type="button" title="备注" onClick={() => { if (!timelineSelectedId) setNotice('请先选择招式块'); else { setTimelineToolGroup(null); setTimelineNoteOpen(true); } }}><PenLine size={18} /></button>
                <button type="button" title="快速添加" onClick={() => toggleTimelineToolGroup('add')}><Plus size={19} /></button>
                <button type="button" title="修改" onClick={() => toggleTimelineToolGroup('modify')}><Wrench size={18} /></button>
                <button type="button" title="编辑" onClick={() => toggleTimelineToolGroup('edit')}><Settings2 size={18} /></button>
                <button type="button" disabled={!timelineHistory.length} title="撤销" onClick={undoTimeline}><Undo2 size={18} /></button>
                <button type="button" disabled={!timelineRedo.length} title="重做" onClick={redoTimeline}><Redo2 size={18} /></button>
                <button type="button" className={timelineNodeUnlocked ? 'active node-lock' : timelineSelectedPeriodId ? 'selected-node' : ''} title={timelineNodeUnlocked ? '重新锁定关键帧' : timelineSelectedPeriodId ? '解锁选中关键帧' : '在白色进度线处添加关键帧'} onClick={useTimelineNodeTool}>{timelineNodeUnlocked ? <Lock size={17} /> : timelineSelectedPeriodId ? <Unlock size={17} /> : <Diamond size={17} />}</button>
                <span className="mobile-timeline-tool-spacer" />
                {timelineSelectedPeriodId ? (() => {
                  const period = timelineAxisPeriods(timelinePeriods).find((item) => item.id === timelineSelectedPeriodId);
                  return period ? <label className="mobile-timeline-inline-field" title={timelineNodeUnlocked ? '关键帧时间' : '解锁后可调整关键帧时间'}><span>点</span><input aria-label="关键帧时间" type="number" min="80" disabled={!timelineNodeUnlocked} value={period.endMs} onChange={(event) => updateTimelineNodeEnd(period.id, Number(event.target.value))} /></label> : null;
                })() : timelineSelectedStep ? <>
                  <label className="mobile-timeline-inline-field" title="招式起点"><span>起</span><input aria-label="招式起点" type="number" min="0" value={timelineSelectedStep.startMin} onChange={(event) => { const start = Math.max(0, Number(event.target.value)); updateTimelineStep(timelineSelectedStep.id, { startMin: start, startMax: Math.max(start, timelineSelectedStep.startMax) }); }} /></label>
                  <label className="mobile-timeline-inline-field" title="招式持续时间"><span>长</span><input aria-label="招式持续时间" type="number" min="35" value={timelineSelectedStep.durationMin} onChange={(event) => { const duration = Math.max(35, Number(event.target.value)); updateTimelineStep(timelineSelectedStep.id, { durationMin: duration, durationMax: Math.max(duration, timelineSelectedStep.durationMax) }); }} /></label>
                </> : null}
                <button type="button" title="缩小时间轴" onClick={() => setTimelineZoom((value) => Math.max(.25, value - .15))}><ZoomOut size={17} /></button>
                <button type="button" title="放大时间轴" onClick={() => setTimelineZoom((value) => Math.min(3, value + .15))}><ZoomIn size={17} /></button>
                <button type="button" title="返回并保存" onClick={saveTimeline}><ArrowLeft size={18} /></button>
              </>}
            </div>
          </div>

          <div className="mobile-timeline-track-shell">
            <div className={`mobile-timeline-track-grid ${timelineToolGroup === 'add' && timelineTool ? 'placing' : ''} ${timelineEditMode === 'delete' ? 'deleting' : ''}`} style={{ width: `${timelineTrackWidth + 52}px` }}>
              <div className="mobile-timeline-ruler"><span />{Array.from({ length: 7 }, (_, index) => <b key={index} style={{ left: `${(index / 6) * 100}%` }}>{((timelineTotalMs * index / 6) / 1000).toFixed(1)}s</b>)}</div>
              {timelineAxisPeriods(timelinePeriods).map((period) => <button type="button" key={period.id} className={`mobile-timeline-node ${timelineSelectedPeriodId === period.id ? 'selected' : ''}`} style={{ left: `${52 + (period.endMs / timelineTotalMs) * timelineTrackWidth}px` }} title={`${period.label} ${(period.endMs / 1000).toFixed(2)} 秒`} onPointerDown={(event) => beginTimelineNodeDrag(event, period)} onPointerMove={moveTimelineNodeDrag} onPointerUp={endTimelineNodeDrag} onPointerCancel={endTimelineNodeDrag}><Diamond size={12} fill="currentColor" /></button>)}
              <button type="button" className="mobile-timeline-playhead" style={{ left: `${52 + (timelinePlaybackMs / timelineTotalMs) * timelineTrackWidth}px` }} aria-label="播放位置" onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); timelinePlayheadDragRef.current = true; setTimelinePlaying(false); moveTimelinePlayhead(event); }} onPointerMove={moveTimelinePlayhead} onPointerUp={() => { timelinePlayheadDragRef.current = false; }} onPointerCancel={() => { timelinePlayheadDragRef.current = false; }} />
              <div className="mobile-timeline-rows">
                {timelineCharacterSlots.flatMap((slot) => {
                  const expanded = timelineExpandedSlot === slot;
                  return [false, ...(expanded ? [true] : [])].map((auxiliary) => {
                    const laneSteps = timelineChart.steps.filter((step) => (step.characterSlot ?? 1) === slot && (!expanded || isTimelineAuxiliaryStep(step) === auxiliary));
                    return <div className={`mobile-timeline-row-shell ${auxiliary ? 'auxiliary' : ''}`} key={`${slot}-${auxiliary ? 'aux' : 'main'}`}>
                      <div className="mobile-timeline-role-cell">{!auxiliary && <img src={appearance.avatarSources[String(slot)] || `/combo-assets/avatar-presets/role-${slot}.webp`} alt={`角色 ${slot}`} />}</div>
                      <div className="mobile-timeline-track-row" onClick={(event) => placeTimelineTool(event, slot)}>
                        {laneSteps.map((step) => {
                          const selectedStep = timelineSelectedIds.includes(step.id) || timelineSelectedId === step.id;
                          const nearbyIndex = laneSteps.filter((candidate) => Math.abs(candidate.startMin - step.startMin) * timelineZoom < 260).sort((left, right) => left.startMin - right.startMin || left.id.localeCompare(right.id)).findIndex((candidate) => candidate.id === step.id);
                          const sources = timelineStepIconSources(step, timelineChart.contentLabels, appearance.iconSet);
                          return <button type="button" key={step.id} className={`mobile-timeline-step ${selectedStep ? 'selected' : ''}`} style={{ left: `${(step.startMin / timelineTotalMs) * 100}%`, width: `${Math.max(.25, (step.durationMin / timelineTotalMs) * 100)}%`, background: step.color, zIndex: 2 + Math.max(0, nearbyIndex) }} onPointerDown={(event) => timelineBeginDrag(event, step, timelineTotalMs)} onPointerMove={timelineMoveDrag} onPointerUp={timelineEndDrag} onPointerCancel={timelineEndDrag} onClick={(event) => { event.stopPropagation(); selectTimelineStep(step); }}>
                            <span className="mobile-timeline-step-tab" style={{ left: `${Math.max(0, nearbyIndex) * 13}px` }} />
                            <span className="mobile-timeline-step-icons">{sources.map((src, index) => <img key={`${src}-${index}`} src={src} alt="" />)}</span>
                            <b>{step.label}</b>
                          </button>;
                        })}
                      </div>
                    </div>;
                  });
                })}
              </div>
            </div>
          </div>

        </section>}
        {page === 'editor' && <section className="mobile-editor-page">
          <div className={`mobile-editor-toolbar ${editorMenuOpen ? 'open' : ''}`}>
            <button type="button" className="mobile-editor-menu-toggle" aria-label={t(editorMenuOpen ? '收起编辑菜单' : '展开编辑菜单')} title={t(editorMenuOpen ? '收起编辑菜单' : '展开编辑菜单')} onClick={() => setEditorMenuOpen((open) => !open)}>{editorMenuOpen ? <ChevronDown size={20} /> : <ChevronUp size={20} />}</button>
            <div className="mobile-editor-settings-panel">
              <button type="button" onClick={exitEditor}>{t('完成')}</button><strong>{t('横屏编辑区域')}</strong><span>{t('拖动框内移动，边框调整显示范围')}</span><button type="button" className="mobile-editor-image-button" onClick={() => editorImageRef.current?.click()}>{t('导入游戏截图')}</button><div className="mobile-editor-target-switch" role="group" aria-label={t('编辑对象')}><button type="button" className={editorTarget === 'zones' ? 'active' : ''} onClick={() => setEditorTarget('zones')}>{t('开关')}</button><button type="button" className={editorTarget === 'flow' ? 'active' : ''} onClick={() => setEditorTarget('flow')}>{t('流程')}</button><button type="button" className={editorTarget === 'keys' ? 'active' : ''} onClick={() => setEditorTarget('keys')}>{t('按键')}</button></div>
            </div>
          </div>
           <input ref={editorImageRef} className="mobile-file-input" type="file" accept="image/*" onChange={(event) => void importEditorImage(event.currentTarget.files?.[0] ?? null)} />
          <div className="mobile-editor-stage" style={editorImage ? { backgroundImage: `url(${editorImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
            <ChartFrame appearance={appearance} onChange={(patch) => patchAppearance(patch)}>
              <div className="mobile-editor-preview-row">
                {(selected?.steps ?? []).slice(0, 10).map((step) => <div className="mobile-editor-preview-step" key={step.id} style={appearance.blockMode === 'image' && appearance.baseSources[String(step.characterSlot ?? 1)] ? { backgroundImage: `url(${appearance.baseSources[String(step.characterSlot ?? 1)]})`, backgroundSize: '100% 100%' } : undefined}>
                  {appearance.avatarEnabled && <img src={appearance.avatarSources[String(step.characterSlot ?? 1)] || `/combo-assets/avatar-presets/role-${step.characterSlot ?? 1}.webp`} alt="" />}
                  <i>◆</i>
                  {appearance.convertIcons && iconSourceForStep(step, appearance.iconSet) ? <img src={iconSourceForStep(step, appearance.iconSet)} alt="" /> : <strong>{step.label}</strong>}
                </div>)}
              </div>
            </ChartFrame>
            <EditorFrame label={t('开始挑战点击区域')} zone={appearance.startZone} color="#2f80d9" onChange={(patch) => patchZone('startZone', patch)} />
            <EditorFrame label={t('退出挑战点击区域')} zone={appearance.exitZone} color="#cf6570" onChange={(patch) => patchZone('exitZone', patch)} />
            {editorTarget === 'keys' && MOBILE_KEY_ACTIONS.map(({ key, label, switch: isSwitch }) => <KeyZoneFrame key={key} label={t(label)} zone={appearance.keyZones[key]} color={isSwitch ? '#cf6570' : '#2f80d9'} vertical={isSwitch} onChange={(patch) => patchKeyZone(key, patch)} />)}
          </div>
        </section>}
      </main>

      <nav className={`mobile-bottom-nav ${page === 'editor' || page === 'timeline' ? 'hidden' : ''}`} aria-label={language === 'en-US' ? 'Mobile navigation' : '手机端导航'}>
        <button type="button" className={page === 'library' ? 'active' : ''} onClick={() => setPage('library')}><BookOpen size={21} />{language === 'zh-CN' ? <ruby>练习<rt>Practice</rt></ruby> : <span>Practice</span>}</button>
        <button type="button" className={page === 'record' ? 'active' : ''} onClick={() => setPage('record')}><Edit3 size={21} />{language === 'zh-CN' ? <ruby>录制<rt>Record</rt></ruby> : <span>Record</span>}</button>
        <button type="button" className={page === 'community' ? 'active' : ''} onClick={() => setPage('community')}><Users size={21} />{language === 'zh-CN' ? <ruby>社区<rt>Community</rt></ruby> : <span>Community</span>}</button>
        <button type="button" className={page === 'appearance' ? 'active' : ''} onClick={() => setPage('appearance')}><Palette size={21} />{language === 'zh-CN' ? <ruby>设置<rt>Settings</rt></ruby> : <span>Settings</span>}</button>
      </nav>

      {availableUpdate && <MobileUpdateDialog release={availableUpdate} language={language} ignoreChecked={updateIgnoreChecked} onIgnoreChange={setUpdateIgnoreChecked} onAcknowledge={acknowledgeMobileUpdate} onUpdate={openMobileUpdate} />}
      {shareDraft && <MobileShareDialog draft={shareDraft} onChange={setShareDraft} onSave={saveSharedChartJson} onUpload={uploadSharedChartToCommunity} onClose={() => { setShareTarget(null); setShareDraft(null); }} language={language} characterName={displayCharacterName} />}
      {notice && <button type="button" className="mobile-notice" onClick={() => setNotice('')}>{tm(notice)}</button>}
    </div>
  );
}
