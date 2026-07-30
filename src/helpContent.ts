import type { AppLanguage } from './i18n';

export type HelpTab = 'learner' | 'author' | 'reference' | 'changelog';

export type HelpGuideShortcut = {
  keys: string[];
  action: string;
  note?: string;
  nested?: boolean;
};

export type HelpGuideControl = {
  name: string;
  effect: string;
  example?: string;
  nested?: boolean;
};

export type HelpGuideGroup = {
  title: string;
  category?: string;
  items: string[];
  note?: string;
  optional?: boolean;
  shortcuts?: HelpGuideShortcut[];
  controls?: HelpGuideControl[];
};

export type HelpArticle = {
  title: string;
  summary: string;
  groups: HelpGuideGroup[];
};

export type HelpContent = {
  settingsTab: string;
  helpTab: string;
  title: string;
  description: string;
  learnerTab: string;
  authorTab: string;
  referenceTab: string;
  changelogTab: string;
  optionalLabel: string;
  exampleLabel: string;
  firstRunTitle: string;
  firstRunDescription: string;
  firstRunFreeWarning: string;
  openHelp: string;
  continueWithoutHelp: string;
  articles: Record<HelpTab, HelpArticle>;
};

export const HELP_CONTENT: Record<AppLanguage, HelpContent> = {
  'zh-CN': {
    settingsTab: '设置',
    helpTab: '帮助',
    title: '使用帮助',
    description: '按你的使用目的查看完整流程；功能名称与软件界面保持一致。',
    learnerTab: '练习者',
    authorTab: '攻略作者',
    referenceTab: '详细说明',
    changelogTab: '更新日志',
    optionalLabel: '可选',
    exampleLabel: '示例',
    firstRunTitle: '第一次使用鸣潮训练场？',
    firstRunDescription: '建议先花一分钟查看帮助。教程会说明 JSON 导入、全局捕获、管理员运行、练习模式与攻略制作流程。',
    firstRunFreeWarning: '本软件完全免费。如果你在任何平台付费购买，说明你被骗了，请立即申请退款。',
    openHelp: '查看帮助',
    continueWithoutHelp: '先继续',
    articles: {
      learner: {
        title: '练习者快速上手',
        summary: '从拿到连段 JSON 开始，完成按键配置、全局捕获、模式选择和练习界面调整。',
        groups: [
          {
            title: '导入并选择连段',
            items: [
              '进入“练习”，在右侧“连段列表”点击“导入”，选择由本工具导出的 JSON 文件。',
              '导入成功后连段会加入列表并被选中；以后可直接点击列表中的连段切换。',
              '只导入来源可信的 JSON。导入不会替换你的按键设置和外观预设。'
            ]
          },
          {
            title: '设置键鼠或手柄',
            items: [
              '进入“设置”，在“输入模式”选择“键鼠”或“手柄”，只会显示当前模式的绑定。',
              '点击每个绑定框右侧的捕获按钮，再按下目标按键；同一招式可同时设置两个按键，例如 Shift 与鼠标右键。',
              '手柄可选择 Xbox 或 PlayStation 图标；键鼠可选择默认招式图标或实际按键图标。',
              '用“导出按键设置”备份键鼠与手柄绑定，之后可导入 .wwkeys.json 恢复；该文件与连段分享 JSON 相互独立。',
              '在“快捷键设置”中可修改时间轴与视频工具的单键或 Shift 组合；Ctrl、Alt 起手的编辑组合保持固定。'
            ]
          },
          {
            title: '开启全局捕获',
            items: [
              '练习前点击左侧栏的“全局捕获”，确认按钮进入启用状态。这样切回游戏后软件仍能接收输入。',
              'Windows 版启动时会自动请求管理员权限，请在系统 UAC 弹窗中选择“是”；这样可以避免因游戏权限更高而无法捕获输入。',
              '若仍无输入，请先核对输入模式与绑定，再关闭并重新开启全局捕获。'
            ],
            note: '请不要拒绝启动时的 UAC 请求。不要把“窗口内监听”误当成游戏后台输入已经可用。'
          },
          {
            title: '选择模式并开始',
            items: [
              '“演示”按时间自动播放连段，适合先观察顺序与节奏，不要求你正确输入。',
              '“推进”在正确输入后前进，判定较宽松，适合熟悉操作顺序。',
              '“挑战”同时检查顺序和时机，适合已经熟练后检验稳定性。',
              '选好连段与模式后按 F 开始，按 Esc 结束；需要时可开启“轴首招启动”或结束后自动复位。'
            ]
          },
          {
            title: '调整练习显示与节奏合轴',
            optional: true,
            items: [
              '进入“外观”选择横排、竖排或瀑布布局；可调整头像、角色底图、招式块、文字描边、图标转换、预提示、合并与淡出。',
              '用眼睛按钮显示或隐藏置顶连段图；“移动”用于调整游戏画面中的位置，“复位”恢复当前布局默认尺寸。',
              '“实验 > 节奏合轴”会把连段转换为节奏轨道。先选择连段，再根据屏幕调整尺寸、轨道间距、下落速度、判定线与角色间距。'
            ]
          }
        ]
      },
      author: {
        title: '攻略作者制作流程',
        summary: '从实战录制到时间轴精修、视频对齐、JSON 分享和轴图导出。',
        groups: [
          {
            title: '录制一遍操作',
            items: [
              '先在“设置”核对键鼠或手柄绑定，再开启左侧栏的“全局捕获”。',
              'Windows 版启动时会自动请求管理员权限，请确认系统 UAC 弹窗，确保可以捕获以管理员身份运行的游戏输入。',
              '进入“录制”，按 F 开始、Esc 结束。结束后点击“覆盖”，把本次输入载入连段谱编辑区；“调试”可用本次输入校正已有连段。'
            ],
            note: '开始正式录制前，建议先做一次短测试，确认切人、长按和鼠标按键都能被正确识别。'
          },
          {
            title: '编辑时间轴与显示内容',
            items: [
              '在“时间”模式拖动招式块调整开始时间和持续时间；可添加、裁剪、删除招式，并设置启动轴与循环轴。',
              '使用撤销、重做和播放头反复检查节奏；角色顺序变更会同步修正切人目标。',
              '切到“内容”模式修改招式块文字、提示和展示轮次；外观相关内容统一到“外观”页面调整。',
              '常用编辑键包括 Delete 删除、Ctrl+C / Ctrl+V 复制粘贴、C 分割、V 合并；添加状态中 F 放置处决、B 放置变奏切人，选中块后按 Y 可追加延奏内容。',
              '需要显示英文等纯文字时，用中括号包住内容，例如 [Basic Attack]；括号内不会转换为图标，括号本身也不会显示。处决、变奏、延奏和前走会自动使用对应的默认提示文本。',
              '编辑完成后点击保存，生成新的连段列表条目，避免覆盖仍需保留的旧版本。'
            ]
          },
          {
            title: '用视频辅助精修',
            items: [
              '在“录制”点击“视频辅助”，导入实战视频。视频只在当前会话引用，不会写进连段 JSON。',
              '裁剪视频的有效区间，让视频起点与连段起点一致；用播放头逐帧对齐招式块。',
              '视频时间轴可调整高度、缩放和轨道密度；导出前先选择导出文件夹并完整预览一次。',
              '可导出合成视频或透明连段图层。导出期间不要关闭视频辅助窗口。'
            ]
          },
          {
            title: '导出 JSON 并分享',
            items: [
              '在“练习”的连段列表选中目标连段，点击“分享”。',
              '填写名称、标签、简介和可选链接；角色、轮数与 ID 会由当前连段自动生成。',
              '点击“导出分享 JSON”后把文件发给他人。接收者在“练习 > 连段列表 > 导入”即可使用。',
              '分享前重新导入一次导出的 JSON 做自检，确认角色、轮次、内容文字和时间轴都正确。'
            ]
          },
          {
            title: '导出轴图与按键映射',
            optional: true,
            items: [
              '“实验 > 导出轴图”用于生成完整 PNG。选择连段和展示轮次，设置画布尺寸后，招式块会按数量自动缩放与换行。',
              '轴图模块有独立的外观、底图和图标设置，不会改动练习与录制使用的全局外观。',
              '“实验 > 按键映射”可把键盘、鼠标或手柄输入映射为自定义图片，适合录屏时展示按键。',
              '按键映射需要后台工作时同样要开启全局捕获；可先在模块内测试每个映射再开始录屏。'
            ]
          },
          {
            title: '连段网站介绍',
            optional: true,
            items: []
          }
        ]
      },
      reference: {
        title: '详细功能说明',
        summary: '按功能查找快捷键、按钮用途和参数效果。快捷键在输入框中不会触发，放置类快捷键只在时间轴添加状态下生效。',
        groups: [
          {
            category: '通用',
            title: '常用快捷键',
            items: [],
            shortcuts: [
              { keys: ['F'], action: '开始录制或开始练习', note: '在录制/练习页面且光标不在输入框时生效。' },
              { keys: ['Esc'], action: '结束录制或练习；退出当前放置状态' },
              { keys: ['Ctrl', 'Z'], action: '撤销录制时间轴中的上一步编辑' },
              { keys: ['Ctrl', 'Y'], action: '重做被撤销的编辑', note: '也可使用 Ctrl + Shift + Z；macOS 对应 Command。' },
            ],
            note: '正在输入名称、备注或数值时，字母键与删除键优先用于输入，不会误操作时间轴。'
          },
          {
            category: '录制',
            title: '时间轴编辑与添加',
            items: [],
            shortcuts: [
              { keys: ['Ctrl', '点击'], action: '多选或取消选择招式块' },
              { keys: ['Ctrl', 'C'], action: '复制选中的招式块' },
              { keys: ['Ctrl', 'V'], action: '进入副本放置状态，再点击目标轨道确定位置' },
              { keys: ['Delete'], action: '有选择时删除招式块或时段；无选择时进入连续删除模式' },
              { keys: ['C'], action: '进入或退出分割模式' },
              { keys: ['V'], action: '合并选中的同招式、同角色、同轨道块' },
              { keys: ['Y'], action: '在选中块现有内容末尾追加延奏 y', note: '支持单选和多选，例如普攻 a 会变成 ay。' },
              { keys: ['Shift'], action: '直接进入连续添加状态' },
              { keys: ['X'], action: '在添加状态中切换“招式 / 时段”', nested: true },
              { keys: ['A'], action: '添加状态切换为普攻', nested: true },
              { keys: ['Z / Shift+A'], action: '添加状态切换为重击', nested: true },
              { keys: ['E / Q / R'], action: '切换为技能 / 声骸 / 共鸣解放', note: '按住 Shift 使用对应长按版本。', nested: true },
              { keys: ['S / D / J'], action: 'S 或 D 切换为闪避，J 切换为跳跃', nested: true },
              { keys: ['F / W'], action: '切换为内容 f 的处决显示块 / 内容 w 的空招式', nested: true },
              { keys: ['Tab'], action: '切换为自适应切人招式', note: '本组非 Ctrl / Alt 快捷键可在“设置 > 快捷键设置”中修改。', nested: true },
              { keys: ['B'], action: '切换为变奏自适应切人块', note: '按落点角色生成 ib、iib 或 iiib。', nested: true },
              { keys: ['右键'], action: '退出放置状态或打开招式块菜单', nested: true }
            ],
            controls: [
              { name: '拖动招式块', effect: '改变招式开始时间，所属角色和轨道保持不变。', example: '整体晚 0.2 秒发生时，把整块向右拖。' },
              { name: '拖动左右边缘', effect: '分别改变开始位置或结束位置，也就是持续时间。' },
              { name: 'Alt + 拖动边缘/分界线', effect: '调整预热或后摇判定区，不改变招式块主时长。', example: '技能按下后 0.15 秒才可判定，可增加预热。' }
            ]
          },
          {
            category: '录制',
            title: '时间轴工具按钮',
            items: [],
            controls: [
              { name: '时间 / 内容', effect: '“时间”编辑位置、持续时间、预热和后摇；“内容”编辑招式块文字、备注和展示轮。' },
              { name: '播放与速度', effect: '预览连段推进；速度可选 1×、0.5×、0.2×，慢放只影响预览。' },
              { name: '自动跟随', effect: '播放头接近可视区边缘时自动滚动时间轴。' },
              { name: '添加（+）', effect: '连续点击轨道放置招式；按 X 可改放启动轴、循环轴等时段。', example: '按 +，再按 E，随后连续点击角色轨道放置多个技能。' },
              { name: '连续删除（垃圾桶）', effect: '开启后点击招式块即可连续删除；右键退出。' },
              { name: '拆分（剪刀）', effect: '在点击位置把一个招式块分成前后两块。' },
              { name: '缩放', effect: '改变时间轴的横向时间密度，不改变任何招式时间。' },
              { name: '保存连段谱', effect: '把当前编辑结果保存成新的连段列表项目。' }
            ]
          },
          {
            category: '录制',
            title: '视频模式',
            items: [],
            shortcuts: [
              { keys: ['Space'], action: '播放或暂停视频' },
              { keys: ['← / →'], action: '向前或向后移动 500 ms', note: '适合逐段寻找招式起点。' },
              { keys: ['Esc'], action: '关闭当前裁剪弹窗' }
            ],
            controls: [
              { name: '继承录制时间轴', effect: '招式块拖动、复制粘贴、删除、添加模式、撤销重做及时间/内容切换均与“录制 > 时间轴编辑与添加”一致。' },
              { name: '导入视频', effect: '加载实战视频作为本次编辑参照，不会写入 JSON。' },
              { name: '裁剪时长（最左侧）', effect: '设置导入视频的有效起点和终点，不修改源视频文件。' },
              { name: '移动 / 缩放', effect: '调整合成连段图层的位置和整体比例。' },
              { name: '多功能按钮（最右侧）', effect: '时间轴工具栏中的特殊工具。' },
              { name: '多功能按钮：点击', effect: '展开或收起下方时间轴。收起后按钮仍会保留，方便恢复。', nested: true },
              { name: '多功能按钮：拖动 / 滚轮', effect: '上下拖动改变面板高度，左右拖动改变横向缩放；悬浮滚轮改变轨道密度。', nested: true },
              { name: '导出 MP4 / WebM', effect: '把视频和连段图层合成为成片；也可导出透明连段图层供剪辑软件使用。' },
              { name: '关闭', effect: '退出视频工具；导出进行中不要关闭。' }
            ]
          },
          {
            category: '练习',
            title: '子模式与开始',
            items: [],
            controls: [
              { name: '演示', effect: '按时间自动播放连段，用于观察顺序和节奏，不检查输入。' },
              { name: '推进', effect: '正确输入后推进到下一步，判定较宽松，适合熟悉操作顺序。' },
              { name: '挑战', effect: '同时检查操作顺序和输入时机，适合熟练后检验稳定性。' },
              { name: 'F / Esc', effect: '分别开始和结束当前练习；后台游戏输入需要先开启全局捕获。' }
            ]
          },
          {
            category: '外观',
            title: '外观参数',
            items: [],
            controls: [
              { name: '块宽度 / 块高度', effect: '改变单个招式块的基础尺寸；固定宽度适合整齐排列，适应内容可避免长文字拥挤。' },
              { name: '文字大小 / 头像大小', effect: '分别改变招式文字和角色头像，不改变时间轴数据。' },
              { name: '文字描边 / 粗细 / 颜色', effect: '开启后为招式块文字添加描边；粗细控制边缘宽度，颜色决定描边颜色。' },
              { name: '裁剪 X / Y', effect: '移动底图取景区域；数值增大时取景向右或向下移动。' },
              { name: '裁剪 W / H', effect: '改变从原图取出的宽高范围；数值越小，视觉上越放大。', example: '人物太小时把 W、H 从 100% 降到约 70%，再用 X、Y 对准主体。' },
              { name: '边缘高度', effect: '决定底图上下两端保留、不参与中段拉伸的比例。' },
              { name: '左右拉伸线', effect: '划定底图中间可拉伸区域，保护两端装饰不变形。' },
              { name: '图标缩放', effect: '只改变招式图标大小，不改变块本身。' },
              { name: '预提示 / 同角色合并 / 图标转换', effect: '控制提前显示、连续同角色块的组合方式，以及输入文字是否替换成图标。用中括号包住的内容按纯文字显示，例如 [Basic Attack] 不会转换图标，括号本身不显示。' }
            ]
          },
          {
            category: '实验',
            title: '节奏合轴参数',
            items: [],
            controls: [
              { name: '宽度 / 高度', effect: '设置节奏画布尺寸。' },
              { name: '整体缩放', effect: '等比缩放所有轨道、头像、文字和反馈元素。' },
              { name: '角色间距', effect: '改变不同角色轨道组之间的距离。' },
              { name: '轨道间距', effect: '改变同一角色内各操作轨道之间的距离。' },
              { name: '下落速度', effect: '越大则音符移动越快，屏幕中可提前看到的时间越短。', example: '看不清后续操作时降低速度；想让节奏更紧凑时提高速度。' },
              { name: '判定线偏移', effect: '移动音符到达的判定线位置。' },
              { name: '反馈 X / Y', effect: '移动成功、失误等反馈文字。' },
              { name: '起始 / 结束缩放', effect: '控制判定反馈环动画开头和结尾的大小。' },
              { name: '反馈环偏移与持续时间', effect: '改变反馈环相对判定点的位置和停留时长。' }
            ]
          },
          {
            category: '实验',
            title: '导出轴图参数',
            items: [],
            controls: [
              { name: '画布宽度 / 高度', effect: '决定最终 PNG 的像素尺寸；输入完成后自动缩放会重新计算。' },
              { name: '水平 / 垂直边距', effect: '设置内容与图片四边之间的留白。' },
              { name: '横向 / 行间距', effect: '设置相邻招式块和换行后各行之间的距离。' },
              { name: '自动缩放', effect: '根据展示块数量、尺寸与画布空间自动缩小整图，确保内容放入画布。' },
              { name: '底图 / 纯色块', effect: '选择使用角色底图招式块，或使用纯色胶囊块。' },
              { name: '固定宽度 / 适应内容', effect: '固定宽度使所有块整齐；适应内容会按文字和图标长度调整每块宽度。' },
              { name: '单块：展示内容', effect: '决定该块显示默认招式、备注还是自定义文字。' },
              { name: '单块：自定义宽度', effect: '仅覆盖当前招式块宽度，适合特别长或特别短的标签。' },
              { name: '显示头像 / 隐藏底图', effect: '逐块控制头像和背景，不影响其他块。' },
              { name: '块后换行', effect: '强制下一块从新行开始。', example: '在每个角色最后一招启用，可让每名角色各占一行。' }
            ],
            note: '轴图模块的外观、底图、图标和映射都是独立配置，只影响轴图导出。'
          },
          {
            category: '设置',
            title: '输入与显示',
            items: [],
            controls: [
              { name: '输入模式', effect: '在键鼠和手柄之间切换；只显示当前模式的绑定。' },
              { name: '按键 1 / 按键 2', effect: '同一招式最多绑定两个输入，适配不同操作习惯。' },
              { name: '独立 / 推进', effect: '独立操作可与其他操作并行记录；推进决定该招式是否推动练习步骤。' },
              { name: '键鼠 / 手柄图标', effect: '切换实际键帽、默认招式图标或 Xbox、PlayStation 手柄图标。' },
              { name: '导入 / 导出按键设置', effect: '用独立的 .wwkeys.json 文件备份或恢复键鼠与手柄绑定，不会导入连段或外观。' },
              { name: '快捷键设置', effect: '修改时间轴与视频工具的单键或 Shift 组合；Ctrl、Alt 起手的固定编辑组合不会被覆盖。' },
              { name: 'Live2D / 录制提示点', effect: '分别控制主界面动态角色和录制状态提示点的显示。' }
            ]
          }
        ]
      },
      changelog: {
        title: '更新日志',
        summary: '记录公开版本和当前开发版的重要变化。',
        groups: [
          {
            title: '当前开发版 · 2026-07-31',
            items: [
              '“悬浮”改名为“连段图置顶”，使用黄色背景、黑色文字和眼睛图标；移动按钮改为十字移动图标。修正连段图跨越屏幕上下半区、提示箭头自动换边时，底图边缘被窗口裁剪的问题。全局捕获未开启时，左侧按钮上方会持续显示轻微移动的黄色指示三角。',
              '设置新增全局自定义图标。可逐个上传或恢复图标，覆盖键鼠、手柄和外观中的同名图标，并随 .wwkeys.json 按键设置一起导入导出。',
              '录制新增切人保护：已经处于目标角色时，再次按该角色的切人键不会生成无效切人块；下一个可记录切人必须切向其他角色。',
              '录制页新增“文字轴识别”。支持按当前角色中文名或首字简称确定角色，以字母和中文动作词生成招式块，大写生成长按；支持启动轴、循环轴、变奏、延奏、处决、跳跃、闪避和前走，并按解放 3 秒、切人 0.5 秒、其他动作 1 秒生成默认时长。',
              '分割快捷键 C 在已有选择时会按鼠标所在时间直接切开所选块，没有选择时仍进入连续分割模式。多选组会保持到点击组外块；双击组内块可退出多选并只选择该块。',
              '时间轴复制内容改为普通编辑器与视频编辑器共享，修复切换界面或组件重新挂载后 Ctrl+C / Ctrl+V 偶发失效。',
              '首次离开主界面的引导弹窗新增醒目防骗提示：软件完全免费，任何平台付费购买均应立即申请退款。'
            ]
          },
          {
            title: 'v0.3.0 · 2026-07-30',
            items: [
              '新增内置四语言帮助、练习者与攻略作者教程、详细功能说明，以及首次使用引导。',
              '完善三套主题的主界面背景、图标与 Live2D 角色展示，并新增关闭 Live2D 的选项。',
              '新增录制状态提示点：等待录制时显示绿色，录制进行中显示红色。',
              '底图新增边缘参数，保护两端装饰不被拉伸；同时优化多个默认底图的裁剪位置。',
              '新增队伍预设，可保存和快速切换角色组合。',
              '选中招式块后，在时间轴空白处打开右键菜单也可对当前选择执行删除等操作。',
              '精简招式块右键菜单并新增“更改”，可直接把选中块替换为其他操作；新增“合并”，可将多个同角色、同类型、同轨道的块合成一个大块。',
              '修复部分情况下招式块无法拖动的问题，并修复 Alt + 拖动无法调整预热与后摇的问题。',
              '修复鼠标侧键无法正确捕获或映射的问题，并继续排查手柄输入链路。',
              '排查并修正浅色主题中招式块文字、括号、连段卡片等对比度不足的问题。',
              '录制时间轴新增播放、倍速和自动跟随；缩放改为以白色播放进度线为中心。',
              '新增一套键盘实际按键图标，并完善键鼠与手柄的双键绑定显示。',
              '优化视频裁剪流程及工具栏布局：裁剪位于最左侧，五个编辑工具居中，多功能时间轴按钮位于最右侧。',
              '设置页新增按键设置导入/导出与“快捷键设置”；可修改单键和 Shift 组合，同时保留 Ctrl、Alt 起手的固定编辑组合。',
              '修复 Delete、Ctrl+C 和 Ctrl+V 未生效的问题；Delete 在未选择内容时会进入连续删除，C 进入分割，V 合并选中块，并屏蔽会干扰映射的浏览器默认快捷键。',
              '添加状态新增 F 处决块、B 变奏自适应切人；选中块后按 Y 可追加延奏 y，并补齐处决、变奏、延奏和前走的默认提示文本。',
              '招式内容支持中括号纯文字：例如 [Basic Attack] 不参与图标转换，显示时自动隐藏中括号。',
              '外观设置新增招式文字描边开关、粗细和颜色。',
              'Windows 版启动时强制请求管理员权限，确认 UAC 后可避免因游戏权限更高而无法全局捕获输入。',
              '移除主界面入口收起按钮的色块背景，并修复点击后按钮跳到另一端的问题。'
            ]
          },
          {
            title: 'v0.2.0 · 2026-07-28',
            items: [
              '加入视频辅助时间轴、裁剪和视频/透明图层导出。',
              '扩展轴图导出、按键映射、节奏合轴与键鼠/手柄绑定能力。',
              '完善多语言界面、录制提示点和外观自定义。'
            ]
          },
          {
            title: 'v0.1.0 · 2026-07-27',
            items: [
              '首个公开版本，包含录制、练习、连段外观与实验工具。',
              '支持 JSON 导入导出、连段列表、三种练习模式和全局输入捕获。',
              '提供中文、英语、日语和韩语界面。'
            ]
          }
        ]
      }
    }
  },
  'en-US': {
    settingsTab: 'Settings',
    helpTab: 'Help',
    title: 'Help',
    description: 'Follow the workflow that matches your goal. Feature names match the labels used in the app.',
    learnerTab: 'Learner',
    authorTab: 'Guide Author',
    referenceTab: 'Reference',
    changelogTab: 'Changelog',
    optionalLabel: 'Optional',
    exampleLabel: 'Example',
    firstRunTitle: 'New to Wuthering Waves Trainer?',
    firstRunDescription: 'Take a minute to read the help. It covers JSON import, Global Input Capture, administrator mode, practice modes, and guide creation.',
    firstRunFreeWarning: 'This software is completely free. If you paid for it on any platform, you were scammed. Request a refund immediately.',
    openHelp: 'View Help',
    continueWithoutHelp: 'Continue',
    articles: {
      learner: {
        title: 'Learner Quick Start',
        summary: 'Start with a combo JSON, then configure inputs, enable global capture, choose a mode, and tune the practice display.',
        groups: [
          {
            title: 'Import and select a combo',
            items: [
              'Open Practice. In the Combo Library on the right, click Import and choose a JSON exported by this app.',
              'A successful import is added to the library and selected. Click any library entry to switch combos later.',
              'Import JSON only from sources you trust. Importing does not replace your bindings or appearance presets.'
            ]
          },
          {
            title: 'Configure keyboard, mouse, or gamepad',
            items: [
              'Open Settings and choose Keyboard & Mouse or Gamepad under Input Mode. Only bindings for the active mode are shown.',
              'Click the capture button beside a binding, then press the desired input. One action can have two bindings, such as Shift and the right mouse button.',
              'Gamepad mode supports Xbox and PlayStation icons. Keyboard mode can use default action icons or actual key icons.',
              'Use Export Input Settings to back up keyboard, mouse, and gamepad bindings, then import the .wwkeys.json file to restore them. This format is separate from combo-share JSON.',
              'Shortcut Settings can customize single-key and Shift combinations for timeline and video tools. Editing combinations beginning with Ctrl or Alt remain fixed.'
            ]
          },
          {
            title: 'Enable Global Input Capture',
            items: [
              'Before practice, click Global Input Capture in the sidebar and confirm that it is active. The app can then receive input while the game is focused.',
              'The Windows build requests administrator privileges at launch. Approve the UAC prompt so it can capture input from a game running with elevated privileges.',
              'If input is still missing, verify the input mode and bindings, then disable and re-enable Global Input Capture.'
            ],
            note: 'Do not decline the UAC request at launch. In-window input does not mean background game input is available.'
          },
          {
            title: 'Choose a mode and start',
            items: [
              'Demo plays the combo by time. Use it to learn the order and rhythm without entering every action.',
              'Advance progresses after correct input with forgiving timing. Use it to learn the sequence.',
              'Challenge checks both order and timing. Use it after the sequence feels reliable.',
              'Select a combo and mode, press F to start, and press Esc to stop. Enable Start at First Action of Axis or automatic reset when useful.'
            ]
          },
          {
            title: 'Tune the practice display and Rhythm Axis',
            optional: true,
            items: [
              'Open Appearance and choose Horizontal, Vertical, or Waterfall. Adjust avatars, character backgrounds, action blocks, text outlines, icon conversion, pre-prompts, merging, and fading.',
              'Use the eye button to show or hide the always-on-top combo. Move changes its in-game position, and Reset restores the current layout defaults.',
              'Labs > Rhythm Axis turns a combo into rhythm lanes. Select a combo, then tune the canvas, lane gap, fall speed, judgement line, and character spacing for your screen.'
            ]
          }
        ]
      },
      author: {
        title: 'Guide Author Workflow',
        summary: 'Record gameplay inputs, refine the timeline, align video, share JSON, and export complete axis images.',
        groups: [
          {
            title: 'Record a clean run',
            items: [
              'Verify keyboard, mouse, or gamepad bindings in Settings, then enable Global Input Capture in the sidebar.',
              'The Windows build requests administrator privileges at launch. Approve the UAC prompt so background input can be captured from an elevated game.',
              'Open Record, press F to start, and press Esc to stop. Click Replace to load the run into the editor; Test can use the run to refine an existing combo.'
            ],
            note: 'Before a full recording, make a short test and confirm that character switches, holds, and mouse inputs are recognized.'
          },
          {
            title: 'Edit timing and displayed content',
            items: [
              'In Timing mode, drag action blocks to adjust start time and duration. Add, split, or delete actions, and define startup and loop axes.',
              'Use undo, redo, and the playhead to review timing. Changing character order also remaps character-switch targets.',
              'Switch to Content mode to edit block labels, prompts, and displayed rounds. Use Appearance for shared visual styling.',
              'Useful editing keys include Delete, Ctrl+C / Ctrl+V, C for Split, and V for Merge. In Add mode, F selects Finisher and B selects an adaptive Intro switch; press Y with blocks selected to append Outro content.',
              'Wrap literal English text in square brackets, such as [Basic Attack]. Bracketed text bypasses icon conversion and the brackets are hidden. Finisher, Intro, Outro, and Move Forward also receive their matching default prompts.',
              'Save when editing is complete. Saving creates a new library entry so an older version can remain available.'
            ]
          },
          {
            title: 'Refine with Video Tools',
            items: [
              'Click Video Tools in Record and import gameplay footage. The video is referenced for this session and is not embedded in the combo JSON.',
              'Trim the useful range so video time zero matches the combo start, then align blocks frame by frame.',
              'The video timeline supports panel height, zoom, and lane-density adjustment. Choose an export folder and preview the full result before export.',
              'Export either a composed video or a transparent combo layer. Keep Video Tools open until export finishes.'
            ]
          },
          {
            title: 'Export and share JSON',
            items: [
              'Select the target combo in the Practice library and click Share.',
              'Enter a name, tags, description, and optional link. Characters, rounds, and ID are generated from the combo.',
              'Click Export Share JSON and send the file to others. They can use it through Practice > Combo Library > Import.',
              'Re-import the exported JSON before publishing and verify characters, rounds, labels, and timing.'
            ]
          },
          {
            title: 'Export axis images and key mappings',
            optional: true,
            items: [
              'Labs > Export Axis Image creates a complete PNG. Choose the combo and displayed rounds, then set the canvas size; blocks scale and wrap automatically.',
              'Axis export has isolated appearance, background, and icon settings. It does not change the global appearance used by Record or Practice.',
              'Labs > Key Mapping maps keyboard, mouse, or gamepad inputs to custom images for input displays in recordings.',
              'Enable Global Input Capture when Key Mapping must work behind the game, and test every mapping before recording.'
            ]
          },
          {
            title: 'Combo Website',
            optional: true,
            items: []
          }
        ]
      },
      reference: {
        title: 'Detailed Reference',
        summary: 'Look up shortcuts, tool buttons, and parameter effects by feature. Shortcuts do not fire while typing, and placement shortcuts only work while adding on the timeline.',
        groups: [
          {
            category: 'General',
            title: 'Common shortcuts',
            items: [],
            shortcuts: [
              { keys: ['F'], action: 'Start recording or practice', note: 'Works on Record or Practice while focus is outside a text field.' },
              { keys: ['Esc'], action: 'Stop recording or practice; leave the current placement mode' },
              { keys: ['Ctrl', 'Z'], action: 'Undo the last Record timeline edit' },
              { keys: ['Ctrl', 'Y'], action: 'Redo an undone edit', note: 'Ctrl + Shift + Z also works; use Command on macOS.' },
            ],
            note: 'While entering a name, note, or number, letter and Delete keys are reserved for the field and will not edit the timeline.'
          },
          {
            category: 'Record',
            title: 'Timeline editing and placement',
            items: [],
            shortcuts: [
              { keys: ['Ctrl', 'Click'], action: 'Add or remove an action block from the selection' },
              { keys: ['Ctrl', 'C'], action: 'Copy selected action blocks' },
              { keys: ['Ctrl', 'V'], action: 'Begin placing the copy; click a destination lane to confirm' },
              { keys: ['Delete'], action: 'Delete selected blocks or period; with no selection, enter Continuous Delete mode' },
              { keys: ['C'], action: 'Enter or leave Split mode' },
              { keys: ['V'], action: 'Merge selected blocks with the same action, character, and lane' },
              { keys: ['Y'], action: 'Append Outro y to the selected blocks', note: 'Works with one or multiple blocks; Basic Attack a becomes ay.' },
              { keys: ['Shift'], action: 'Enter continuous Add mode immediately' },
              { keys: ['X'], action: 'Switch between Action and Period while adding', nested: true },
              { keys: ['A'], action: 'Choose Basic Attack for placement', nested: true },
              { keys: ['Z / Shift+A'], action: 'Choose Heavy Attack for placement', nested: true },
              { keys: ['E / Q / R'], action: 'Choose Skill / Echo / Resonance Liberation', note: 'Hold Shift for each hold variant.', nested: true },
              { keys: ['S / D / J'], action: 'S or D chooses Dodge; J chooses Jump', nested: true },
              { keys: ['F / W'], action: 'Choose a display-only Finisher with content f / Empty Action with content w', nested: true },
              { keys: ['Tab'], action: 'Choose an adaptive character switch', note: 'Change these non-Ctrl/Alt shortcuts under Settings > Shortcut Settings.', nested: true },
              { keys: ['B'], action: 'Choose an adaptive Intro character switch', note: 'Produces ib, iib, or iiib according to the destination character.', nested: true },
              { keys: ['Right click'], action: 'Leave placement mode or open an action-block menu', nested: true }
            ],
            controls: [
              { name: 'Drag an action block', effect: 'Changes its start time without changing its character or lane.', example: 'If the whole action occurs 0.2 s later, drag the block to the right.' },
              { name: 'Drag the left/right edge', effect: 'Changes the start or end respectively, thereby changing duration.' },
              { name: 'Alt + drag an edge/divider', effect: 'Adjusts the warm-up or recovery judgement region without changing the main block duration.', example: 'Add 0.15 s of warm-up when a skill becomes valid shortly after the button press.' }
            ]
          },
          {
            category: 'Record',
            title: 'Timeline tool buttons',
            items: [],
            controls: [
              { name: 'Timing / Content', effect: 'Timing edits position, duration, warm-up, and recovery. Content edits block text, notes, and displayed rounds.' },
              { name: 'Play and speed', effect: 'Previews the combo at 1x, 0.5x, or 0.2x. Slow playback does not modify timing data.' },
              { name: 'Auto Follow', effect: 'Scrolls the timeline when the playhead approaches the visible edge.' },
              { name: 'Add (+)', effect: 'Places actions continuously. Press X to place startup, loop, or other periods.', example: 'Click +, press E, then click a character lane several times to place skills.' },
              { name: 'Continuous Delete (trash)', effect: 'Click action blocks to delete them repeatedly; right-click to leave the mode.' },
              { name: 'Split (scissors)', effect: 'Splits one action block into two at the clicked point.' },
              { name: 'Zoom', effect: 'Changes horizontal timeline density without changing action timing.' },
              { name: 'Save Combo Chart', effect: 'Saves the current edit as a new combo-library entry.' }
            ]
          },
          {
            category: 'Record',
            title: 'Video mode',
            items: [],
            shortcuts: [
              { keys: ['Space'], action: 'Play or pause video' },
              { keys: ['Left / Right'], action: 'Seek backward or forward 500 ms', note: 'Useful for locating an action start.' },
              { keys: ['Esc'], action: 'Close the current trim dialog' }
            ],
            controls: [
              { name: 'Inherits the Record timeline', effect: 'Block dragging, copy/paste, deletion, Add mode, undo/redo, and Timing/Content work exactly as described under Record > Timeline editing and placement.' },
              { name: 'Import Video', effect: 'Loads gameplay footage for the current editing session; it is not stored in JSON.' },
              { name: 'Trim Video (leftmost)', effect: 'Sets the useful source-video start and end without modifying the source file.' },
              { name: 'Move / Scale', effect: 'Moves and scales the composed combo layer.' },
              { name: 'Multifunction (rightmost)', effect: 'A special tool at the end of the timeline toolbar.' },
              { name: 'Multifunction: click', effect: 'Collapses or expands the lower timeline. It remains available while collapsed.', nested: true },
              { name: 'Multifunction: drag / wheel', effect: 'Drag vertically for panel height, horizontally for timeline zoom, or scroll over it for lane density.', nested: true },
              { name: 'Export MP4 / WebM', effect: 'Composes video with the combo layer, or exports a transparent combo layer for an editor.' },
              { name: 'Close', effect: 'Leaves Video Tools. Do not close it while export is running.' }
            ]
          },
          {
            category: 'Practice',
            title: 'Modes and starting',
            items: [],
            controls: [
              { name: 'Demo', effect: 'Plays by time for studying order and rhythm without checking input.' },
              { name: 'Advance', effect: 'Moves to the next step after correct input with forgiving timing.' },
              { name: 'Challenge', effect: 'Checks both action order and timing for consistency testing.' },
              { name: 'F / Esc', effect: 'Starts and stops the current session. Enable Global Input Capture for background game input.' }
            ]
          },
          {
            category: 'Appearance',
            title: 'Appearance parameters',
            items: [],
            controls: [
              { name: 'Block Width / Height', effect: 'Changes the base action-block size. Fixed width aligns blocks; Fit Content gives long labels more room.' },
              { name: 'Font Size / Avatar Size', effect: 'Changes action text and character portraits without changing timeline data.' },
              { name: 'Text Outline / Width / Color', effect: 'Adds an outline to action-block text. Width controls its thickness, and Color sets the outline color.' },
              { name: 'Crop X / Y', effect: 'Moves the sampled background region right or down as the value increases.' },
              { name: 'Crop W / H', effect: 'Changes how much of the source image is sampled; lower values appear more zoomed in.', example: 'Reduce W and H from 100% to about 70%, then use X and Y to center a small character.' },
              { name: 'Edge Height', effect: 'Sets the protected top/bottom portion that is not stretched with the middle.' },
              { name: 'Left / Right Stretch', effect: 'Defines the stretchable center area so end decorations keep their shape.' },
              { name: 'Icon Scale', effect: 'Changes action-icon size only, not the block itself.' },
              { name: 'Pre-prompt / Merge Same Character / Icon Conversion', effect: 'Controls early prompts, grouping of consecutive same-character blocks, and text-to-icon replacement. Text inside square brackets stays literal: [Basic Attack] displays as Basic Attack without icon conversion or visible brackets.' }
            ]
          },
          {
            category: 'Labs',
            title: 'Rhythm Axis parameters',
            items: [],
            controls: [
              { name: 'Width / Height', effect: 'Sets the rhythm canvas size.' },
              { name: 'Scale', effect: 'Uniformly scales lanes, portraits, text, and feedback.' },
              { name: 'Character Spacing', effect: 'Changes the distance between character lane groups.' },
              { name: 'Lane Gap', effect: 'Changes the distance between action lanes within a character group.' },
              { name: 'Fall Speed', effect: 'Higher values move notes faster and show less upcoming time.', example: 'Lower it to see farther ahead; raise it for a tighter rhythm display.' },
              { name: 'Judge Line Offset', effect: 'Moves the line where notes arrive.' },
              { name: 'Feedback X / Y', effect: 'Moves success and error feedback text.' },
              { name: 'Start / End Scale', effect: 'Sets the feedback-ring size at the beginning and end of its animation.' },
              { name: 'Ring Offset and Duration', effect: 'Moves the feedback ring relative to the judgement point and changes how long it remains.' }
            ]
          },
          {
            category: 'Labs',
            title: 'Axis image export parameters',
            items: [],
            controls: [
              { name: 'Canvas Width / Height', effect: 'Sets final PNG dimensions. Auto Scale recalculates after the value is committed.' },
              { name: 'Horizontal / Vertical Padding', effect: 'Sets empty space between content and the four image edges.' },
              { name: 'Column Gap / Row Gap', effect: 'Sets spacing between adjacent blocks and wrapped rows.' },
              { name: 'Auto Scale', effect: 'Fits all displayed blocks into the canvas using their count, dimensions, and available space.' },
              { name: 'Image / Color Block', effect: 'Uses character background images or plain capsule colors.' },
              { name: 'Fixed / Fit Content', effect: 'Fixed keeps rows uniform; Fit Content sizes each block from its label and icons.' },
              { name: 'Per block: Display Content', effect: 'Chooses the default action, note, or custom text shown by that block.' },
              { name: 'Per block: Custom Width', effect: 'Overrides only this block, useful for unusually long or short labels.' },
              { name: 'Show Avatar / Hide Background', effect: 'Controls the portrait and background for one block without affecting others.' },
              { name: 'Line Break After', effect: 'Forces the next block onto a new row.', example: 'Enable it after each character’s last action to put every character on a separate row.' }
            ],
            note: 'Appearance, backgrounds, icons, and mappings in Axis Image Export are isolated and affect only this module.'
          },
          {
            category: 'Settings',
            title: 'Input and display',
            items: [],
            controls: [
              { name: 'Input Mode', effect: 'Switches between keyboard/mouse and gamepad, showing bindings for only the active mode.' },
              { name: 'Binding 1 / Binding 2', effect: 'Assigns up to two inputs to one action for different control habits.' },
              { name: 'Independent / Advances Step', effect: 'Independent actions can overlap others; Advances Step decides whether an action moves practice forward.' },
              { name: 'Keyboard / gamepad icons', effect: 'Selects actual keycaps, default action icons, or Xbox and PlayStation icons.' },
              { name: 'Import / Export Input Settings', effect: 'Backs up or restores keyboard, mouse, and gamepad bindings with a separate .wwkeys.json file; combos and appearance are not imported.' },
              { name: 'Shortcut Settings', effect: 'Customizes single-key and Shift combinations for timeline and video tools without replacing fixed Ctrl or Alt editing combinations.' },
              { name: 'Live2D / Recording Indicator', effect: 'Controls the animated home character and the recording status dot.' }
            ]
          }
        ]
      },
      changelog: {
        title: 'Changelog',
        summary: 'Important changes in public releases and the current development build.',
        groups: [
          {
            title: 'Current Development Build · 2026-07-31',
            items: [
              'Renamed Always on Top to Keep Combo Overlay on Top with a yellow background, black text, and an eye icon. The Move control now uses a four-way move icon. Fixed block artwork being clipped when the overlay crosses between the upper and lower halves of the screen and the prompt arrow changes sides. While Global Input Capture is off, a gently animated yellow triangle points to its sidebar button.',
              'Added global custom icons in Settings. Icons can be uploaded or restored individually, override matching keyboard, gamepad, and appearance icons, and travel with .wwkeys.json input-settings import and export.',
              'Added recording switch protection. Pressing the switch key for the character already on field no longer creates an invalid switch block; the next recorded switch must target another character.',
              'Added Text Axis Import to Record mode. It matches current Chinese character names or first-character abbreviations, creates actions from letters and Chinese action terms, treats uppercase as hold input, recognizes startup and loop axes, Intro, Outro, Finisher, Jump, Dodge, and Move Forward, and assigns default durations of 3 seconds for Liberation, 0.5 seconds for switches, and 1 second for other actions.',
              'C now splits selected blocks at the current pointer time, while still entering continuous Split mode when nothing is selected. A multiselection remains active until an unselected block is clicked; double-clicking a member collapses the group to that block.',
              'Shared the timeline clipboard between the normal and video editors, fixing intermittent Ctrl+C / Ctrl+V failures after switching views or remounting the editor.',
              'Added a prominent first-run anti-scam warning: the software is completely free, and users who paid on any platform should request a refund immediately.'
            ]
          },
          {
            title: 'v0.3.0 · 2026-07-30',
            items: [
              'Added built-in help in four languages, learner and guide-author workflows, a detailed reference, and a first-run prompt.',
              'Improved home backgrounds, icons, and Live2D presentation across all three themes, and added an option to disable Live2D.',
              'Added recording status dots: green while ready and red while recording.',
              'Added a protected edge parameter for block backgrounds and improved the default crop of multiple presets.',
              'Added team presets for saving and quickly switching character lineups.',
              'When action blocks are selected, opening the context menu on empty timeline space can now act on that selection.',
              'Streamlined the action-block context menu. Change can directly replace selected actions, while Merge combines blocks with the same character, type, and lane.',
              'Fixed action blocks becoming undraggable and fixed Alt-drag failing to adjust warm-up and recovery.',
              'Fixed capture and mapping of mouse side buttons, and continued reviewing the gamepad input path.',
              'Reviewed and corrected low-contrast text, parentheses, and combo cards in the light theme.',
              'Added playback, speed selection, and Auto Follow to the Record timeline; zoom now centers on the white playhead.',
              'Added a new actual-key keyboard icon set and improved display of dual keyboard/mouse and gamepad bindings.',
              'Improved video trimming and toolbar order: Trim is leftmost, the five edit tools stay together, and the multifunction timeline control is rightmost.',
              'Added input-settings import/export and Shortcut Settings. Single-key and Shift combinations are configurable while Ctrl- and Alt-based editing combinations remain fixed.',
              'Fixed Delete, Ctrl+C, and Ctrl+V. Delete enters Continuous Delete with no selection, C opens Split, V merges selected blocks, and conflicting native browser shortcuts are suppressed.',
              'Added F for Finisher placement, B for adaptive Intro switches, and Y to append Outro y to selected blocks; also added default prompts for Finisher, Intro, Outro, and Move Forward.',
              'Added literal text in square brackets: [Basic Attack] bypasses icon conversion and displays without the brackets.',
              'Added action-text outline controls for enablement, width, and color.',
              'The Windows build now requires administrator privileges at launch; approving UAC prevents elevated games from blocking Global Input Capture.',
              'Removed the colored background behind the home navigation visibility button and fixed it jumping across the row when clicked.'
            ]
          },
          {
            title: 'v0.2.0 · 2026-07-28',
            items: [
              'Added the video-assisted timeline, trimming, and video or transparent-layer export.',
              'Expanded axis image export, key mapping, Rhythm Axis, and keyboard/gamepad binding support.',
              'Improved multilingual UI, the recording indicator, and appearance customization.'
            ]
          },
          {
            title: 'v0.1.0 · 2026-07-27',
            items: [
              'First public release with Record, Practice, combo appearance, and Labs.',
              'Included JSON import/export, the combo library, three practice modes, and Global Input Capture.',
              'Provided Chinese, English, Japanese, and Korean interfaces.'
            ]
          }
        ]
      }
    }
  },
  'ja-JP': {
    settingsTab: '設定',
    helpTab: 'ヘルプ',
    title: '使い方',
    description: '目的に合う手順を選んでください。機能名はアプリ内の表記に合わせています。',
    learnerTab: '練習者',
    authorTab: '攻略作者',
    referenceTab: '詳細説明',
    changelogTab: '更新履歴',
    optionalLabel: '任意',
    exampleLabel: '例',
    firstRunTitle: '鳴潮トレーナーを初めて使いますか？',
    firstRunDescription: 'まず1分ほどヘルプをご覧ください。JSONの読み込み、グローバル入力監視、管理者実行、練習モード、攻略制作の流れを説明します。',
    firstRunFreeWarning: '本ソフトは完全無料です。どこかのプラットフォームで購入した場合は詐欺です。直ちに返金を申請してください。',
    openHelp: 'ヘルプを見る',
    continueWithoutHelp: '先に進む',
    articles: {
      learner: {
        title: '練習者向けクイックスタート',
        summary: '連段JSONの読み込みから、入力設定、グローバル監視、モード選択、表示調整までの流れです。',
        groups: [
          { title: '連段を読み込んで選ぶ', items: ['「練習」を開き、右側の「連段ライブラリ」で「インポート」を押し、このアプリから書き出されたJSONを選びます。', '読み込みに成功すると一覧へ追加され、その連段が選択されます。以後は一覧をクリックして切り替えられます。', '信頼できる配布元のJSONだけを読み込んでください。入力設定や外観プリセットは上書きされません。'] },
          { title: 'キーボード・マウス／ゲームパッドを設定', items: ['「設定」の「入力モード」でキーボード・マウスまたはゲームパッドを選びます。選択中のモードだけが表示されます。', '入力欄の右にあるキャプチャボタンを押してから割り当てたい入力を行います。1アクションにShiftと右クリックなど2つまで設定できます。', 'ゲームパッドはXbox／PlayStation表示、キーボードは既定アイコン／実キーアイコンを選べます。', '「入力設定を書き出す」でキーボード・マウス／ゲームパッド割り当てをバックアップし、.wwkeys.jsonを読み込んで復元できます。連段共有JSONとは別形式です。', '「ショートカット設定」ではタイムラインと動画ツールの単キー／Shift組み合わせを変更できます。CtrlまたはAltで始まる編集操作は固定です。'] },
          { title: 'グローバル入力監視を有効にする', items: ['練習前にサイドバーの「グローバル入力監視」を押し、有効表示になったことを確認します。ゲームが前面でも入力を受け取れます。', 'Windows版は起動時に管理者権限を自動で要求します。管理者として動作するゲームの入力を取得できるよう、UACダイアログで「はい」を選んでください。', '入力されない場合は入力モードと割り当てを確認し、グローバル入力監視を一度オフにして再度オンにします。'], note: '起動時のUAC要求を拒否しないでください。「ウィンドウ内入力」はバックグラウンド入力が有効という意味ではありません。' },
          { title: 'モードを選んで開始', items: ['「デモ」は時間に沿って自動再生され、順番とリズムの確認に向いています。正しい入力は不要です。', '「進行」は正しい入力で進み、タイミング判定は比較的緩めです。手順を覚えるときに使います。', '「チャレンジ」は順番とタイミングを同時に判定します。安定してからの確認に使います。', '連段とモードを選び、Fで開始、Escで終了します。必要に応じて「軸の最初のアクションで開始」や自動リセットを使います。'] },
          { title: '練習表示とリズム軸を調整', optional: true, items: ['「外観」で横・縦・ウォーターフォールを選び、アバター、キャラクター背景、アクションブロック、文字の縁取り、アイコン変換、事前表示、結合、フェードを調整します。', '目のボタンで最前面連段表示を切り替え、「移動」でゲーム上の位置を変更し、「リセット」で現在のレイアウトを初期値へ戻します。', '「実験 > リズム軸」は連段をリズムレーンへ変換します。連段を選び、画面サイズ、レーン間隔、落下速度、判定線、キャラクター間隔を調整します。'] }
        ]
      },
      author: {
        title: '攻略作者向け制作フロー',
        summary: '入力の録画、時間軸の調整、動画同期、JSON共有、軸画像の書き出しまでをまとめています。',
        groups: [
          { title: '操作を録画する', items: ['「設定」で入力割り当てを確認し、サイドバーの「グローバル入力監視」を有効にします。', 'Windows版は起動時に管理者権限を自動で要求します。UACダイアログを承認すると、管理者権限のゲームからもバックグラウンド入力を取得できます。', '「録画」でFを押して開始し、Escで終了します。「置換」で今回の入力を編集へ読み込み、「テスト」で既存連段の補正に利用できます。'], note: '本番前に短いテストを行い、キャラクター切替、長押し、マウス入力が認識されることを確認してください。' },
          { title: '時間軸と表示内容を編集', items: ['「タイミング」ではブロックをドラッグして開始時刻と長さを調整します。アクションの追加・分割・削除、開始軸・ループ軸の設定もできます。', '元に戻す、やり直す、再生ヘッドで確認します。キャラクター順の変更時は切替先も同期して変換されます。', '「内容」ではブロックの文字、ヒント、表示ラウンドを編集します。共通の見た目は「外観」で調整します。', 'Delete、Ctrl+C／Ctrl+V、Cの分割、Vの結合を利用できます。追加中はFでフィニッシャー、Bで変奏付き自動切替を選び、選択後にYを押すと終奏内容を追加します。', '[Basic Attack] のように角括弧で囲むと、アイコンへ変換せず文字だけを表示し、括弧自体は隠れます。フィニッシャー、変奏、終奏、前進には対応する既定ヒントも表示されます。', '完了後に保存すると新しい一覧項目が作られ、以前の版を残せます。'] },
          { title: '動画ツールで精密調整', items: ['「録画」の「動画ツール」から実戦動画を読み込みます。動画は現在のセッションだけで参照され、連段JSONには入りません。', '有効区間をトリミングして動画の開始と連段の開始を合わせ、フレーム単位でブロックを調整します。', '動画時間軸では高さ、ズーム、レーン密度を調整できます。先に出力フォルダーを選び、全体をプレビューしてください。', '合成動画または透明連段レイヤーを書き出せます。完了するまで動画ツールを閉じないでください。'] },
          { title: 'JSONを書き出して共有', items: ['「練習」の連段ライブラリで対象を選び、「共有」を押します。', '名前、タグ、説明、任意のリンクを入力します。キャラクター、ラウンド、IDは自動生成されます。', '「共有JSONを書き出す」で保存し、相手は「練習 > 連段ライブラリ > インポート」から利用できます。', '公開前に書き出したJSONを再度読み込み、キャラクター、ラウンド、文字、時間軸を確認してください。'] },
          { title: '軸画像とキー表示を書き出す', optional: true, items: ['「実験 > 軸画像を書き出す」で完全なPNGを作れます。連段と表示ラウンド、キャンバスサイズを選ぶと自動で縮小・改行されます。', '軸画像の外観、背景、アイコン設定は独立しており、録画・練習の共通外観は変更しません。', '「実験 > キーマッピング」はキーボード、マウス、ゲームパッド入力を任意の画像へ割り当て、録画中のキー表示に使えます。', 'ゲーム背面で使う場合はグローバル入力監視を有効にし、録画前に全マッピングをテストしてください。'] },
          { title: '連段サイトの紹介', optional: true, items: [] }
        ]
      },
      reference: {
        title: '機能の詳細説明',
        summary: 'ショートカット、ツールボタン、各パラメーターの効果を機能別に確認できます。入力欄ではショートカットは発動せず、配置用キーはタイムラインの追加状態でのみ有効です。',
        groups: [
          {
            category: '共通',
            title: 'よく使うショートカット',
            items: [],
            shortcuts: [
              { keys: ['F'], action: '録画または練習を開始', note: '録画／練習画面で入力欄にフォーカスしていないときに有効です。' },
              { keys: ['Esc'], action: '録画・練習を終了、または現在の配置状態を解除' },
              { keys: ['Ctrl', 'Z'], action: '録画タイムラインの直前の編集を元に戻す' },
              { keys: ['Ctrl', 'Y'], action: '元に戻した編集をやり直す', note: 'Ctrl + Shift + Zにも対応し、macOSではCommandを使います。' },
            ],
            note: '名前、メモ、数値の入力中は文字キーやDeleteが入力欄で使われ、タイムラインを誤操作しません。'
          },
          {
            category: '録画',
            title: 'タイムライン編集と配置',
            items: [],
            shortcuts: [
              { keys: ['Ctrl', 'クリック'], action: 'アクションブロックを複数選択／選択解除' },
              { keys: ['Ctrl', 'C'], action: '選択中のアクションブロックをコピー' },
              { keys: ['Ctrl', 'V'], action: 'コピー配置を開始し、対象レーンをクリックして確定' },
              { keys: ['Delete'], action: '選択中のブロックまたは期間を削除。未選択時は連続削除モードに入る' },
              { keys: ['C'], action: '分割モードを開始／終了' },
              { keys: ['V'], action: '同じアクション、キャラクター、レーンの選択ブロックを結合' },
              { keys: ['Y'], action: '選択ブロックの内容末尾に終奏 y を追加', note: '単一選択と複数選択に対応し、通常攻撃 a は ay になります。' },
              { keys: ['Shift'], action: '連続追加モードへ直接入る' },
              { keys: ['X'], action: '追加中に「アクション／期間」を切り替える', nested: true },
              { keys: ['A'], action: '配置するアクションを通常攻撃に変更', nested: true },
              { keys: ['Z / Shift+A'], action: '重撃に変更', nested: true },
              { keys: ['E / Q / R'], action: 'スキル／音骸／共鳴解放に変更', note: 'Shiftを押しながら入力すると各長押し版になります。', nested: true },
              { keys: ['S / D / J'], action: 'SまたはDで回避、Jでジャンプに変更', nested: true },
              { keys: ['F / W'], action: '内容 f の表示専用フィニッシャー／内容 w の空アクションに変更', nested: true },
              { keys: ['Tab'], action: '自動判定のキャラクター切替に変更', note: 'Ctrl／Alt以外のショートカットは「設定 > ショートカット設定」で変更できます。', nested: true },
              { keys: ['B'], action: '変奏付きの自動キャラクター切替に変更', note: '配置先キャラクターに応じて ib、iib、iiib を生成します。', nested: true },
              { keys: ['右クリック'], action: '配置状態を解除、またはブロックメニューを開く', nested: true }
            ],
            controls: [
              { name: 'ブロックをドラッグ', effect: 'キャラクターとレーンを保ったまま開始時刻を変更します。', example: '動作全体が0.2秒遅い場合はブロックを右へ移動します。' },
              { name: '左右端をドラッグ', effect: '開始または終了位置を変更し、持続時間を調整します。' },
              { name: 'Alt + 端／境界をドラッグ', effect: '本体の長さを変えずに予熱または後隙判定範囲を調整します。', example: '入力後0.15秒で有効になるスキルには予熱を追加します。' }
            ]
          },
          {
            category: '録画',
            title: 'タイムラインのツールボタン',
            items: [],
            controls: [
              { name: 'タイミング / 内容', effect: 'タイミングでは位置、長さ、予熱、後隙を編集し、内容では表示文字、メモ、表示ラウンドを編集します。' },
              { name: '再生と速度', effect: '1×、0.5×、0.2×で確認します。スロー再生は時間データを変更しません。' },
              { name: '自動追従', effect: '再生ヘッドが表示端へ近づくとタイムラインを自動スクロールします。' },
              { name: '追加（+）', effect: 'レーンへ連続配置します。Xで開始軸、ループ軸などの期間配置に切り替えます。', example: '+を押してEを入力し、キャラクターレーンを続けてクリックするとスキルを複数配置できます。' },
              { name: '連続削除（ごみ箱）', effect: '有効中はクリックしたブロックを連続削除します。右クリックで終了します。' },
              { name: '分割（はさみ）', effect: 'クリック位置で1つのアクションブロックを前後に分けます。' },
              { name: 'ズーム', effect: 'アクション時刻を変えず、横方向の時間密度だけを変更します。' },
              { name: '連段譜を保存', effect: '現在の編集結果を新しいライブラリ項目として保存します。' }
            ]
          },
          {
            category: '録画',
            title: '動画モード',
            items: [],
            shortcuts: [
              { keys: ['Space'], action: '動画を再生／一時停止' },
              { keys: ['← / →'], action: '500 ms戻る／進む', note: 'アクション開始位置の確認に便利です。' },
              { keys: ['Esc'], action: '現在のトリミング画面を閉じる' }
            ],
            controls: [
              { name: '録画タイムラインを継承', effect: 'ブロックのドラッグ、コピー、削除、追加モード、元に戻す／やり直す、タイミング／内容は「録画 > タイムライン編集と配置」と同じです。' },
              { name: '動画を読み込む', effect: '実戦動画を現在の編集参照として読み込みます。JSONには保存されません。' },
              { name: '動画をトリミング（左端）', effect: '元ファイルを変更せず使用する開始・終了位置を設定します。' },
              { name: '移動 / 拡大縮小', effect: '合成する連段レイヤーの位置と全体倍率を変更します。' },
              { name: '多機能ボタン（右端）', effect: 'タイムラインツールバー末尾の特殊ツールです。' },
              { name: '多機能ボタン：クリック', effect: '下部タイムラインを折りたたむ／展開します。折りたたみ中もボタンは残ります。', nested: true },
              { name: '多機能ボタン：ドラッグ／ホイール', effect: '上下ドラッグで高さ、左右ドラッグで横ズーム、ホイールでレーン密度を変更します。', nested: true },
              { name: 'MP4 / WebMを書き出す', effect: '動画と連段レイヤーを合成、または編集用の透明連段レイヤーを書き出します。' },
              { name: '閉じる', effect: '動画ツールを終了します。書き出し中は閉じないでください。' }
            ]
          },
          {
            category: '練習',
            title: 'サブモードと開始',
            items: [],
            controls: [
              { name: 'デモ', effect: '入力を判定せず、時間に沿って順番とリズムを表示します。' },
              { name: '進行', effect: '正しい入力で次へ進みます。判定は比較的緩めです。' },
              { name: 'チャレンジ', effect: '操作順とタイミングを同時に確認します。' },
              { name: 'F / Esc', effect: '現在の練習を開始／終了します。ゲームの背面入力にはグローバル監視が必要です。' }
            ]
          },
          {
            category: '外観',
            title: '外観パラメーター',
            items: [],
            controls: [
              { name: 'ブロック幅 / 高さ', effect: '各ブロックの基本サイズを変更します。固定幅は整列し、内容に合わせると長い文字に余裕ができます。' },
              { name: '文字サイズ / アバターサイズ', effect: '時間データを変えず、文字とキャラクター画像の大きさを変更します。' },
              { name: '文字の縁取り / 太さ / 色', effect: 'アクションブロックの文字に縁取りを追加します。太さで幅を、色で縁取り色を設定します。' },
              { name: 'クロップ X / Y', effect: '値を上げると背景の切り取り範囲が右／下へ移動します。' },
              { name: 'クロップ W / H', effect: '元画像から使う範囲を変更し、値を小さくすると拡大して見えます。', example: '人物が小さい場合はW、Hを100%から約70%へ下げ、X、Yで中央へ合わせます。' },
              { name: '端の高さ', effect: '中央の引き伸ばしから保護する上下端の割合を決めます。' },
              { name: '左右の伸縮線', effect: '中央の伸縮範囲を指定し、両端の装飾が崩れるのを防ぎます。' },
              { name: 'アイコン倍率', effect: 'ブロック本体を変えず、アクションアイコンだけを拡大縮小します。' },
              { name: '事前表示 / 同キャラ結合 / アイコン変換', effect: '先読み表示、同キャラ連続ブロックのまとめ方、文字からアイコンへの置換を設定します。角括弧内は文字のまま表示されます。たとえば [Basic Attack] はアイコンに変換されず、括弧自体も表示されません。' }
            ]
          },
          {
            category: '実験',
            title: 'リズム軸パラメーター',
            items: [],
            controls: [
              { name: '幅 / 高さ', effect: 'リズム画面のキャンバスサイズを設定します。' },
              { name: '全体倍率', effect: 'レーン、アバター、文字、フィードバックを一括で拡大縮小します。' },
              { name: 'キャラクター間隔', effect: 'キャラクターごとのレーン群の間隔を変更します。' },
              { name: 'レーン間隔', effect: '同じキャラクター内の各操作レーン間隔を変更します。' },
              { name: '落下速度', effect: '高いほどノーツが速く動き、先まで見える時間が短くなります。', example: '先の操作を見たいときは下げ、表示を引き締めたいときは上げます。' },
              { name: '判定ライン位置', effect: 'ノーツが到達する判定ラインを移動します。' },
              { name: 'フィードバック X / Y', effect: '成功・失敗などの表示位置を移動します。' },
              { name: '開始 / 終了倍率', effect: '判定リングのアニメーション開始時と終了時の大きさを設定します。' },
              { name: 'リング位置と時間', effect: '判定点からのずれと表示時間を変更します。' }
            ]
          },
          {
            category: '実験',
            title: '軸画像出力パラメーター',
            items: [],
            controls: [
              { name: 'キャンバス幅 / 高さ', effect: '最終PNGのピクセル寸法です。入力確定後に自動倍率を再計算します。' },
              { name: '水平 / 垂直余白', effect: '内容と画像四辺の空白を設定します。' },
              { name: '横 / 行間隔', effect: '隣接ブロックおよび折り返した行の間隔を設定します。' },
              { name: '自動倍率', effect: '表示ブロック数、寸法、空き領域から全体が収まる倍率を計算します。' },
              { name: '画像 / カラーブロック', effect: 'キャラクター背景付きブロックまたは単色カプセルを選びます。' },
              { name: '固定 / 内容に合わせる', effect: '固定は列を揃え、内容に合わせると文字とアイコンに応じて幅が変わります。' },
              { name: '個別：表示内容', effect: '既定アクション、メモ、カスタム文字から表示内容を選びます。' },
              { name: '個別：カスタム幅', effect: 'そのブロックだけ幅を上書きします。長短が特殊なラベルに向いています。' },
              { name: 'アバター表示 / 背景非表示', effect: '他のブロックに影響せず、1ブロックの画像を切り替えます。' },
              { name: '後で改行', effect: '次のブロックを新しい行から開始します。', example: '各キャラクターの最終アクションに設定すると、1キャラ1行にできます。' }
            ],
            note: '軸画像出力の外観、背景、アイコン、マッピングは独立しており、この機能だけに反映されます。'
          },
          {
            category: '設定',
            title: '入力と表示',
            items: [],
            controls: [
              { name: '入力モード', effect: 'キーボード・マウスとゲームパッドを切り替え、現在のモードの割り当てだけを表示します。' },
              { name: '割り当て 1 / 2', effect: '1アクションへ最大2つの入力を割り当てます。' },
              { name: '独立 / ステップ進行', effect: '独立は他操作との重なりを許可し、ステップ進行は練習を次へ進めるかを決めます。' },
              { name: 'キー / パッドアイコン', effect: '実キー、既定アクション、Xbox、PlayStation表示を選びます。' },
              { name: '入力設定の読み込み / 書き出し', effect: '独立した.wwkeys.jsonでキーボード・マウス／ゲームパッド割り当てを復元・保存します。連段や外観は含まれません。' },
              { name: 'ショートカット設定', effect: 'タイムラインと動画ツールの単キー／Shift組み合わせを変更します。固定のCtrl／Alt編集操作は上書きしません。' },
              { name: 'Live2D / 録画インジケーター', effect: 'ホームの動くキャラクターと録画状態ドットを切り替えます。' }
            ]
          }
        ]
      },
      changelog: {
        title: '更新履歴',
        summary: '公開版と現在の開発版における主な変更です。',
        groups: [
          {
            title: '現在の開発版 · 2026-07-31',
            items: [
              '「常に最前面」を「連段図を最前面に固定」へ変更し、黄色背景、黒文字、目のアイコンを使用しました。移動は4方向アイコンになり、画面の上下をまたいで矢印の向きが変わる際にブロック背景が切れる問題を修正しました。グローバル入力監視が無効な間は、サイドバーのボタンを示す黄色の三角形が軽く動き続けます。',
              '設定に全体カスタムアイコンを追加しました。個別に画像をアップロード／復元でき、キーボード、ゲームパッド、外観の同名アイコンを上書きします。.wwkeys.json の入力設定にも含まれます。',
              '録画のキャラクター切替保護を追加しました。現在のキャラクターと同じ切替キーを押しても無効な切替ブロックを記録せず、次の切替は別キャラクターだけを対象にします。',
              '録画に「文字軸の読み取り」を追加しました。現在の中国語キャラクター名または先頭文字、英字と中国語アクション語、大文字の長押し、開始軸／ループ軸、変奏、終奏、フィニッシャー、ジャンプ、回避、前進を認識します。既定時間は共鳴解放3秒、切替0.5秒、その他1秒です。',
              '選択がある場合、Cはマウス位置で選択ブロックを直接分割します。未選択時は従来どおり連続分割モードです。複数選択はグループ外をクリックするまで維持され、グループ内をダブルクリックするとそのブロックだけを選択します。',
              '通常編集と動画編集でタイムラインのクリップボードを共有し、画面切替や再マウント後に Ctrl+C／Ctrl+V が失敗する問題を修正しました。',
              '初回案内に、本ソフトは完全無料であり、有料購入した場合は直ちに返金申請するよう促す詐欺防止警告を追加しました。'
            ]
          },
          {
            title: 'v0.3.0 · 2026-07-30',
            items: [
              '4言語の内蔵ヘルプ、練習者／攻略作者向け手順、詳細リファレンス、初回案内を追加しました。',
              '3テーマのホーム背景、アイコン、Live2D表示を改善し、Live2Dを無効にする設定を追加しました。',
              '録画状態を示すドットを追加しました。待機中は緑、録画中は赤で表示されます。',
              'ブロック背景に端を保護するパラメーターを追加し、複数プリセットの既定クロップを改善しました。',
              'キャラクター編成を保存して素早く切り替えられるチームプリセットを追加しました。',
              'ブロック選択後、タイムラインの空白で右クリックしても現在の選択へ削除などを実行できるようにしました。',
              '右クリックメニューを整理し、操作を直接置換する「変更」と、同じキャラ・種類・レーンのブロックをまとめる「結合」を追加しました。',
              'ブロックをドラッグできなくなる問題と、Alt＋ドラッグで予熱／後隙を調整できない問題を修正しました。',
              'マウスのサイドボタンを取得・割り当てできない問題を修正し、ゲームパッド入力経路も引き続き確認しました。',
              'ライトテーマで文字、括弧、連段カードなどのコントラストが不足する箇所を修正しました。',
              '録画タイムラインに再生、速度、自動追従を追加し、白い再生ヘッドを中心にズームするよう変更しました。',
              '実際のキー形状を使う新しいキーボードアイコン一式を追加し、2つの入力割り当て表示を改善しました。',
              '動画トリミングとツール配置を改善しました。左端にトリミング、中央に5つの編集ツール、右端に多機能タイムラインボタンを配置します。',
              '入力設定の読み込み／書き出しと「ショートカット設定」を追加しました。単キーとShift組み合わせを変更でき、Ctrl／Altで始まる編集操作は固定されます。',
              'Delete、Ctrl+C、Ctrl+Vが動作しない問題を修正しました。未選択時のDeleteは連続削除、Cは分割、Vは選択ブロックの結合となり、競合するブラウザー既定操作も抑止します。',
              '追加中のFでフィニッシャー、Bで変奏付き自動切替を選べるようにし、Yで選択ブロックへ終奏yを追加しました。フィニッシャー、変奏、終奏、前進の既定ヒントも追加しました。',
              '[Basic Attack] のような角括弧内をアイコン変換せず、括弧を隠して文字表示する機能を追加しました。',
              'アクション文字の縁取りについて、有効化、太さ、色の設定を追加しました。',
              'Windows版は起動時に管理者権限を必須で要求します。UACを承認すると、管理者権限のゲームでもグローバル入力監視を利用できます。',
              'ホームの入口表示ボタンから色付き背景を削除し、クリック時に反対側へ移動する問題を修正しました。'
            ]
          },
          { title: 'v0.2.0 · 2026-07-28', items: ['動画補助時間軸、トリミング、動画／透明レイヤー出力を追加しました。', '軸画像出力、キーマッピング、リズム軸、キーボード／ゲームパッド割り当てを拡張しました。', '多言語UI、録画インジケーター、外観カスタマイズを改善しました。'] },
          { title: 'v0.1.0 · 2026-07-27', items: ['録画、練習、連段外観、実験機能を含む最初の公開版です。', 'JSON入出力、連段ライブラリ、3つの練習モード、グローバル入力監視に対応しました。', '中国語、英語、日本語、韓国語のUIを提供しました。'] }
        ]
      }
    }
  },
  'ko-KR': {
    settingsTab: '설정',
    helpTab: '도움말',
    title: '사용 도움말',
    description: '사용 목적에 맞는 흐름을 선택하세요. 기능 이름은 앱 화면의 표기와 같습니다.',
    learnerTab: '연습 사용자',
    authorTab: '공략 제작자',
    referenceTab: '상세 설명',
    changelogTab: '업데이트 기록',
    optionalLabel: '선택 사항',
    exampleLabel: '예시',
    firstRunTitle: '명조 트레이너를 처음 사용하시나요?',
    firstRunDescription: '먼저 1분 정도 도움말을 확인해 보세요. JSON 가져오기, 전역 입력 캡처, 관리자 실행, 연습 모드와 공략 제작 과정을 설명합니다.',
    firstRunFreeWarning: '이 소프트웨어는 완전히 무료입니다. 어떤 플랫폼에서든 돈을 내고 구매했다면 사기를 당한 것이므로 즉시 환불을 요청하세요.',
    openHelp: '도움말 보기',
    continueWithoutHelp: '계속하기',
    articles: {
      learner: {
        title: '연습 사용자 빠른 시작',
        summary: '콤보 JSON 가져오기부터 입력 설정, 전역 캡처, 모드 선택과 연습 화면 조정까지 안내합니다.',
        groups: [
          { title: '콤보 가져오기와 선택', items: ['“연습”을 열고 오른쪽 “콤보 라이브러리”에서 “가져오기”를 눌러 이 앱에서 내보낸 JSON을 선택합니다.', '가져오기에 성공하면 목록에 추가되고 자동으로 선택됩니다. 이후 목록의 항목을 눌러 콤보를 바꿀 수 있습니다.', '신뢰할 수 있는 출처의 JSON만 가져오세요. 입력 설정과 외형 프리셋은 덮어쓰지 않습니다.'] },
          { title: '키보드·마우스 또는 게임패드 설정', items: ['“설정”의 “입력 모드”에서 키보드·마우스 또는 게임패드를 선택합니다. 현재 모드의 바인딩만 표시됩니다.', '입력 칸 오른쪽의 캡처 버튼을 누른 뒤 원하는 입력을 누릅니다. 한 동작에 Shift와 마우스 오른쪽 버튼처럼 두 입력을 지정할 수 있습니다.', '게임패드는 Xbox/PlayStation 아이콘을, 키보드는 기본 동작 아이콘/실제 키 아이콘을 선택할 수 있습니다.', '“입력 설정 내보내기”로 키보드·마우스와 게임패드 바인딩을 백업하고 .wwkeys.json을 가져와 복원할 수 있습니다. 콤보 공유 JSON과는 별도 형식입니다.', '“단축키 설정”에서는 타임라인과 영상 도구의 단일 키 또는 Shift 조합을 바꿀 수 있습니다. Ctrl이나 Alt로 시작하는 편집 조합은 고정됩니다.'] },
          { title: '전역 입력 캡처 켜기', items: ['연습 전에 사이드바의 “전역 입력 캡처”를 눌러 활성 상태인지 확인합니다. 게임에 포커스가 있어도 앱이 입력을 받을 수 있습니다.', 'Windows 버전은 시작할 때 관리자 권한을 자동으로 요청합니다. 관리자 권한으로 실행되는 게임의 입력도 캡처할 수 있도록 UAC 창에서 “예”를 선택하세요.', '입력이 없다면 입력 모드와 바인딩을 확인한 뒤 전역 입력 캡처를 껐다가 다시 켜세요.'], note: '시작할 때 표시되는 UAC 요청을 거부하지 마세요. “창 내부 입력”은 백그라운드 게임 입력이 가능하다는 뜻이 아닙니다.' },
          { title: '모드 선택 후 시작', items: ['“데모”는 시간에 맞춰 자동 재생되며 순서와 리듬 확인에 적합합니다. 정확한 입력은 필요하지 않습니다.', '“진행”은 올바른 입력 후 진행되고 판정이 비교적 여유로워 순서를 익히기에 좋습니다.', '“도전”은 순서와 타이밍을 함께 검사하며 충분히 익숙해진 뒤 안정성을 확인할 때 사용합니다.', '콤보와 모드를 선택하고 F로 시작, Esc로 종료합니다. 필요하면 “축 첫 동작에서 시작” 또는 자동 초기화를 켜세요.'] },
          { title: '연습 표시와 리듬 축 조정', optional: true, items: ['“외형”에서 가로, 세로, 워터폴을 선택하고 아바타, 캐릭터 배경, 동작 블록, 문자 외곽선, 아이콘 변환, 사전 안내, 병합, 페이드를 조정합니다.', '눈 버튼으로 항상 위 콤보를 표시/숨기고, “이동”으로 게임 화면 위치를 바꾸며, “초기화”로 현재 레이아웃 기본값을 복원합니다.', '“실험 > 리듬 축”은 콤보를 리듬 레인으로 바꿉니다. 콤보를 선택한 뒤 화면 크기, 레인 간격, 낙하 속도, 판정선과 캐릭터 간격을 조정하세요.'] }
        ]
      },
      author: {
        title: '공략 제작자 작업 흐름',
        summary: '입력 녹화부터 타임라인 정리, 영상 동기화, JSON 공유와 축 이미지 내보내기까지 안내합니다.',
        groups: [
          { title: '플레이 입력 녹화', items: ['“설정”에서 키보드·마우스 또는 게임패드 바인딩을 확인한 뒤 사이드바의 “전역 입력 캡처”를 켭니다.', 'Windows 버전은 시작할 때 관리자 권한을 자동으로 요청합니다. UAC 창을 승인하면 관리자 권한 게임의 백그라운드 입력도 캡처할 수 있습니다.', '“녹화”에서 F로 시작하고 Esc로 종료합니다. “교체”로 이번 입력을 편집기에 불러오고, “테스트”로 기존 콤보를 보정할 수 있습니다.'], note: '본 녹화 전에 짧게 테스트하여 캐릭터 전환, 길게 누르기, 마우스 입력이 모두 인식되는지 확인하세요.' },
          { title: '타이밍과 표시 내용 편집', items: ['“타이밍” 모드에서 동작 블록을 드래그해 시작 시각과 지속 시간을 조정합니다. 동작 추가·분할·삭제와 시작 축·루프 축 설정도 가능합니다.', '실행 취소, 다시 실행, 재생 헤드로 리듬을 확인합니다. 캐릭터 순서를 바꾸면 전환 대상도 함께 다시 매핑됩니다.', '“내용” 모드에서 블록 문구, 안내와 표시 라운드를 수정합니다. 공통 시각 설정은 “외형”에서 조정합니다.', 'Delete, Ctrl+C/Ctrl+V, C 분할과 V 병합을 사용할 수 있습니다. 추가 중 F는 피니셔, B는 변주 자동 전환을 선택하며 선택한 블록에 Y를 누르면 반주 내용을 추가합니다.', '[Basic Attack]처럼 대괄호로 감싸면 아이콘으로 변환하지 않고 문자만 표시되며 괄호는 숨겨집니다. 피니셔, 변주, 반주와 앞으로 이동에는 해당 기본 안내도 표시됩니다.', '편집이 끝나면 저장하세요. 새 라이브러리 항목이 만들어져 이전 버전을 남길 수 있습니다.'] },
          { title: '영상 도구로 정밀 조정', items: ['“녹화”에서 “영상 도구”를 열고 실제 플레이 영상을 가져옵니다. 영상은 현재 세션에서만 참조되며 콤보 JSON에 저장되지 않습니다.', '유효 구간을 잘라 영상 시작과 콤보 시작을 맞추고 프레임 단위로 블록을 정렬합니다.', '영상 타임라인의 높이, 확대와 레인 밀도를 조정할 수 있습니다. 내보내기 폴더를 선택하고 전체를 한 번 미리 보세요.', '합성 영상 또는 투명 콤보 레이어를 내보낼 수 있습니다. 완료될 때까지 영상 도구를 닫지 마세요.'] },
          { title: 'JSON 내보내기와 공유', items: ['“연습”의 콤보 라이브러리에서 대상을 선택하고 “공유”를 누릅니다.', '이름, 태그, 설명과 선택 링크를 입력합니다. 캐릭터, 라운드와 ID는 현재 콤보에서 자동 생성됩니다.', '“공유 JSON 내보내기”로 저장해 전달하면 상대방은 “연습 > 콤보 라이브러리 > 가져오기”에서 사용할 수 있습니다.', '배포 전 내보낸 JSON을 다시 가져와 캐릭터, 라운드, 문구와 타이밍을 확인하세요.'] },
          { title: '축 이미지와 키 매핑', optional: true, items: ['“실험 > 축 이미지 내보내기”에서 전체 PNG를 만듭니다. 콤보와 표시 라운드, 캔버스 크기를 선택하면 블록이 자동으로 축소되고 줄바꿈됩니다.', '축 이미지 모듈의 외형, 배경과 아이콘 설정은 독립적이며 녹화·연습의 전역 외형을 바꾸지 않습니다.', '“실험 > 키 매핑”은 키보드, 마우스 또는 게임패드 입력을 사용자 이미지에 연결해 녹화용 입력 표시로 사용할 수 있습니다.', '게임 뒤에서도 키 매핑이 필요하면 전역 입력 캡처를 켜고 녹화 전에 모든 매핑을 테스트하세요.'] },
          { title: '콤보 웹사이트 소개', optional: true, items: [] }
        ]
      },
      reference: {
        title: '기능 상세 설명',
        summary: '기능별 단축키, 도구 버튼과 조절 항목의 효과를 찾아볼 수 있습니다. 입력 칸에서는 단축키가 실행되지 않으며 배치 단축키는 타임라인 추가 상태에서만 작동합니다.',
        groups: [
          {
            category: '공통',
            title: '자주 쓰는 단축키',
            items: [],
            shortcuts: [
              { keys: ['F'], action: '녹화 또는 연습 시작', note: '녹화/연습 화면에서 입력 칸에 포커스가 없을 때 작동합니다.' },
              { keys: ['Esc'], action: '녹화·연습 종료 또는 현재 배치 상태 나가기' },
              { keys: ['Ctrl', 'Z'], action: '녹화 타임라인의 마지막 편집 실행 취소' },
              { keys: ['Ctrl', 'Y'], action: '취소한 편집 다시 실행', note: 'Ctrl + Shift + Z도 가능하며 macOS에서는 Command를 사용합니다.' },
            ],
            note: '이름, 메모나 숫자를 입력하는 동안 문자 키와 Delete는 입력 칸에만 적용되어 타임라인을 잘못 편집하지 않습니다.'
          },
          {
            category: '녹화',
            title: '타임라인 편집과 배치',
            items: [],
            shortcuts: [
              { keys: ['Ctrl', '클릭'], action: '동작 블록 다중 선택 또는 선택 해제' },
              { keys: ['Ctrl', 'C'], action: '선택한 동작 블록 복사' },
              { keys: ['Ctrl', 'V'], action: '복사본 배치를 시작하고 대상 레인을 눌러 확정' },
              { keys: ['Delete'], action: '선택한 블록 또는 구간 삭제; 선택이 없으면 연속 삭제 모드 시작' },
              { keys: ['C'], action: '분할 모드 시작 또는 종료' },
              { keys: ['V'], action: '동작, 캐릭터와 레인이 같은 선택 블록 병합' },
              { keys: ['Y'], action: '선택 블록의 기존 내용 뒤에 반주 y 추가', note: '단일 및 다중 선택을 지원하며 기본 공격 a는 ay가 됩니다.' },
              { keys: ['Shift'], action: '연속 추가 모드로 바로 진입' },
              { keys: ['X'], action: '추가 중 “동작 / 구간” 전환', nested: true },
              { keys: ['A'], action: '배치 동작을 기본 공격으로 변경', nested: true },
              { keys: ['Z / Shift+A'], action: '강공격으로 변경', nested: true },
              { keys: ['E / Q / R'], action: '스킬 / 에코 / 공명 해방으로 변경', note: 'Shift와 함께 누르면 해당 길게 누르기 동작입니다.', nested: true },
              { keys: ['S / D / J'], action: 'S 또는 D는 회피, J는 점프로 변경', nested: true },
              { keys: ['F / W'], action: '내용 f의 표시 전용 피니셔 / 내용 w의 빈 동작으로 변경', nested: true },
              { keys: ['Tab'], action: '자동 대상 캐릭터 전환으로 변경', note: 'Ctrl/Alt가 아닌 단축키는 “설정 > 단축키 설정”에서 변경할 수 있습니다.', nested: true },
              { keys: ['B'], action: '변주 자동 캐릭터 전환으로 변경', note: '배치할 캐릭터에 따라 ib, iib 또는 iiib를 생성합니다.', nested: true },
              { keys: ['오른쪽 클릭'], action: '배치 상태 나가기 또는 동작 블록 메뉴 열기', nested: true }
            ],
            controls: [
              { name: '동작 블록 드래그', effect: '캐릭터와 레인을 유지하면서 시작 시각을 바꿉니다.', example: '전체 동작이 0.2초 늦다면 블록을 오른쪽으로 옮깁니다.' },
              { name: '좌우 가장자리 드래그', effect: '시작 또는 종료 지점을 바꿔 지속 시간을 조절합니다.' },
              { name: 'Alt + 가장자리/경계 드래그', effect: '본체 길이는 유지하고 준비 또는 후딜 판정 영역만 조절합니다.', example: '입력 0.15초 뒤 유효해지는 스킬에는 준비 시간을 추가합니다.' }
            ]
          },
          {
            category: '녹화',
            title: '타임라인 도구 버튼',
            items: [],
            controls: [
              { name: '타이밍 / 내용', effect: '타이밍은 위치, 길이, 준비와 후딜을 편집하고 내용은 블록 문구, 메모와 표시 라운드를 편집합니다.' },
              { name: '재생과 속도', effect: '1×, 0.5×, 0.2×로 미리 봅니다. 느린 재생은 타이밍 데이터를 바꾸지 않습니다.' },
              { name: '자동 따라가기', effect: '재생 헤드가 표시 영역 끝에 가까워지면 타임라인을 자동 스크롤합니다.' },
              { name: '추가 (+)', effect: '레인에 동작을 연속 배치합니다. X로 시작 축, 반복 축 등의 구간 배치로 바꿉니다.', example: '+를 누르고 E를 누른 뒤 캐릭터 레인을 여러 번 눌러 스킬을 배치합니다.' },
              { name: '연속 삭제 (휴지통)', effect: '활성화 중 누른 블록을 계속 삭제하며 오른쪽 클릭으로 종료합니다.' },
              { name: '분할 (가위)', effect: '누른 지점에서 하나의 동작 블록을 앞뒤 두 개로 나눕니다.' },
              { name: '확대', effect: '동작 시간은 유지하고 가로 타임라인 밀도만 바꿉니다.' },
              { name: '콤보 차트 저장', effect: '현재 편집 결과를 새 콤보 라이브러리 항목으로 저장합니다.' }
            ]
          },
          {
            category: '녹화',
            title: '영상 모드',
            items: [],
            shortcuts: [
              { keys: ['Space'], action: '영상 재생/일시 정지' },
              { keys: ['← / →'], action: '500 ms 뒤/앞으로 이동', note: '동작 시작 지점을 찾을 때 유용합니다.' },
              { keys: ['Esc'], action: '현재 자르기 창 닫기' }
            ],
            controls: [
              { name: '녹화 타임라인 상속', effect: '블록 드래그, 복사, 삭제, 추가 모드, 실행 취소/다시 실행과 타이밍/내용 전환은 “녹화 > 타임라인 편집과 배치”와 같습니다.' },
              { name: '영상 가져오기', effect: '실전 영상을 현재 편집 참고 자료로 불러오며 JSON에는 저장하지 않습니다.' },
              { name: '영상 자르기 (맨 왼쪽)', effect: '원본을 바꾸지 않고 사용할 시작과 종료 지점을 설정합니다.' },
              { name: '이동 / 확대', effect: '합성 콤보 레이어의 위치와 전체 배율을 바꿉니다.' },
              { name: '다기능 버튼 (맨 오른쪽)', effect: '타임라인 도구 모음 끝의 특수 도구입니다.' },
              { name: '다기능 버튼: 클릭', effect: '아래 타임라인을 접거나 펼칩니다. 접힌 상태에서도 버튼은 유지됩니다.', nested: true },
              { name: '다기능 버튼: 드래그 / 휠', effect: '위아래 드래그로 높이, 좌우 드래그로 가로 확대, 휠로 레인 밀도를 바꿉니다.', nested: true },
              { name: 'MP4 / WebM 내보내기', effect: '영상과 콤보 레이어를 합성하거나 편집용 투명 콤보 레이어를 내보냅니다.' },
              { name: '닫기', effect: '영상 도구에서 나갑니다. 내보내는 중에는 닫지 마세요.' }
            ]
          },
          {
            category: '연습',
            title: '하위 모드와 시작',
            items: [],
            controls: [
              { name: '데모', effect: '입력을 검사하지 않고 시간에 맞춰 순서와 리듬을 보여 줍니다.' },
              { name: '진행', effect: '올바른 입력 후 다음 단계로 진행하며 판정이 비교적 여유롭습니다.' },
              { name: '도전', effect: '동작 순서와 입력 타이밍을 함께 검사합니다.' },
              { name: 'F / Esc', effect: '현재 연습을 시작/종료합니다. 게임 뒤 입력에는 전역 캡처가 필요합니다.' }
            ]
          },
          {
            category: '외형',
            title: '외형 조절 항목',
            items: [],
            controls: [
              { name: '블록 너비 / 높이', effect: '각 동작 블록의 기본 크기를 바꿉니다. 고정 너비는 정렬되고 내용 맞춤은 긴 문구에 공간을 줍니다.' },
              { name: '글자 크기 / 아바타 크기', effect: '타임라인 데이터는 유지하고 문구와 캐릭터 이미지 크기만 바꿉니다.' },
              { name: '텍스트 외곽선 / 두께 / 색상', effect: '동작 블록 글자에 외곽선을 추가합니다. 두께는 외곽선 폭을, 색상은 외곽선 색을 정합니다.' },
              { name: '자르기 X / Y', effect: '값이 커질수록 배경의 선택 영역이 오른쪽/아래로 이동합니다.' },
              { name: '자르기 W / H', effect: '원본에서 선택하는 범위를 바꾸며 값이 작을수록 확대되어 보입니다.', example: '캐릭터가 작으면 W와 H를 100%에서 약 70%로 낮춘 뒤 X와 Y로 중앙을 맞춥니다.' },
              { name: '가장자리 높이', effect: '중앙 늘이기에서 보호할 위아래 끝부분 비율을 정합니다.' },
              { name: '좌우 늘이기 선', effect: '중앙의 늘어날 영역을 정해 양 끝 장식이 변형되지 않게 합니다.' },
              { name: '아이콘 배율', effect: '블록은 유지하고 동작 아이콘 크기만 바꿉니다.' },
              { name: '사전 안내 / 같은 캐릭터 병합 / 아이콘 변환', effect: '미리 보일 안내, 연속 같은 캐릭터 블록의 묶음 방식과 문구의 아이콘 치환을 설정합니다. 대괄호 안의 내용은 문자 그대로 표시됩니다. 예를 들어 [Basic Attack]은 아이콘으로 바뀌지 않으며 괄호도 표시되지 않습니다.' }
            ]
          },
          {
            category: '실험',
            title: '리듬 축 조절 항목',
            items: [],
            controls: [
              { name: '너비 / 높이', effect: '리듬 화면 캔버스 크기를 설정합니다.' },
              { name: '전체 배율', effect: '레인, 아바타, 문구와 피드백을 함께 확대/축소합니다.' },
              { name: '캐릭터 간격', effect: '캐릭터별 레인 그룹 사이 거리를 바꿉니다.' },
              { name: '레인 간격', effect: '같은 캐릭터 안의 각 조작 레인 간격을 바꿉니다.' },
              { name: '낙하 속도', effect: '높을수록 노트가 빨리 움직이고 미리 보이는 시간이 짧아집니다.', example: '다음 동작을 더 보고 싶으면 낮추고 화면을 빠듯하게 만들려면 높입니다.' },
              { name: '판정선 오프셋', effect: '노트가 도달하는 판정선 위치를 옮깁니다.' },
              { name: '피드백 X / Y', effect: '성공과 오류 피드백 문구 위치를 옮깁니다.' },
              { name: '시작 / 종료 배율', effect: '판정 링 애니메이션의 처음과 끝 크기를 설정합니다.' },
              { name: '링 오프셋과 지속 시간', effect: '판정 지점 대비 링 위치와 표시 시간을 바꿉니다.' }
            ]
          },
          {
            category: '실험',
            title: '축 이미지 내보내기 조절 항목',
            items: [],
            controls: [
              { name: '캔버스 너비 / 높이', effect: '최종 PNG 픽셀 크기이며 입력 확정 후 자동 배율을 다시 계산합니다.' },
              { name: '가로 / 세로 여백', effect: '내용과 이미지 네 면 사이 빈 공간을 설정합니다.' },
              { name: '가로 간격 / 행 간격', effect: '인접 블록과 줄바꿈된 각 행 사이 거리를 설정합니다.' },
              { name: '자동 배율', effect: '표시 블록 수, 크기와 캔버스 공간으로 전체가 들어갈 배율을 계산합니다.' },
              { name: '이미지 / 색상 블록', effect: '캐릭터 배경 이미지 블록 또는 단색 캡슐 블록을 선택합니다.' },
              { name: '고정 / 내용 맞춤', effect: '고정은 열을 맞추고 내용 맞춤은 문구와 아이콘 길이에 따라 너비가 변합니다.' },
              { name: '개별: 표시 내용', effect: '기본 동작, 메모 또는 사용자 문구 중 블록에 보일 내용을 선택합니다.' },
              { name: '개별: 사용자 너비', effect: '해당 블록 너비만 덮어쓰며 유난히 길거나 짧은 문구에 적합합니다.' },
              { name: '아바타 표시 / 배경 숨기기', effect: '다른 블록에 영향 없이 한 블록의 이미지 표시를 조절합니다.' },
              { name: '블록 뒤 줄바꿈', effect: '다음 블록을 새 줄에서 시작합니다.', example: '각 캐릭터의 마지막 동작에 켜면 캐릭터마다 한 줄을 사용할 수 있습니다.' }
            ],
            note: '축 이미지 내보내기의 외형, 배경, 아이콘과 매핑은 독립 설정이며 이 모듈에만 적용됩니다.'
          },
          {
            category: '설정',
            title: '입력과 표시',
            items: [],
            controls: [
              { name: '입력 모드', effect: '키보드·마우스와 게임패드를 전환하고 현재 모드의 바인딩만 보여 줍니다.' },
              { name: '바인딩 1 / 2', effect: '한 동작에 최대 두 입력을 지정합니다.' },
              { name: '독립 / 단계 진행', effect: '독립은 다른 동작과의 중첩을 허용하고 단계 진행은 연습을 다음으로 넘길지 결정합니다.' },
              { name: '키 / 패드 아이콘', effect: '실제 키, 기본 동작, Xbox 또는 PlayStation 아이콘을 선택합니다.' },
              { name: '입력 설정 가져오기 / 내보내기', effect: '별도의 .wwkeys.json으로 키보드·마우스와 게임패드 바인딩을 저장하거나 복원합니다. 콤보와 외형은 포함되지 않습니다.' },
              { name: '단축키 설정', effect: '타임라인과 영상 도구의 단일 키 또는 Shift 조합을 바꿉니다. 고정된 Ctrl/Alt 편집 조합은 덮어쓰지 않습니다.' },
              { name: 'Live2D / 녹화 표시점', effect: '홈의 동적 캐릭터와 녹화 상태 점 표시를 전환합니다.' }
            ]
          }
        ]
      },
      changelog: {
        title: '업데이트 기록',
        summary: '공개 버전과 현재 개발 빌드의 주요 변경 사항입니다.',
        groups: [
          {
            title: '현재 개발 빌드 · 2026-07-31',
            items: [
              '“항상 위”를 “콤보 오버레이 항상 위”로 바꾸고 노란 배경, 검은색 글자와 눈 아이콘을 적용했습니다. 이동은 4방향 아이콘으로 변경했으며 화면 상하를 넘을 때 안내 화살표 방향이 바뀌면서 블록 배경이 잘리던 문제를 수정했습니다. 전역 입력 감지가 꺼져 있으면 사이드바 버튼을 가리키는 노란 삼각형이 계속 가볍게 움직입니다.',
              '설정에 전역 사용자 아이콘을 추가했습니다. 아이콘별로 업로드하거나 복원할 수 있고 키보드, 게임패드와 외형의 같은 아이콘을 덮어씁니다. .wwkeys.json 입력 설정 가져오기/내보내기에도 포함됩니다.',
              '녹화 캐릭터 전환 보호를 추가했습니다. 현재 캐릭터와 같은 전환 키를 다시 눌러도 무효 전환 블록을 기록하지 않으며 다음 전환은 다른 캐릭터만 대상으로 합니다.',
              '녹화에 문자 축 인식을 추가했습니다. 현재 중국어 캐릭터 이름 또는 첫 글자 약칭, 영문자와 중국어 동작어, 대문자 길게 누르기, 시작 축/루프 축, 변주, 반주, 피니셔, 점프, 회피와 앞으로 이동을 인식합니다. 기본 시간은 공명 해방 3초, 전환 0.5초, 나머지 1초입니다.',
              '선택한 블록이 있으면 C가 현재 마우스 시간에서 바로 분할하고 선택이 없으면 연속 분할 모드로 들어갑니다. 다중 선택은 그룹 밖 블록을 누를 때까지 유지되며 그룹 안 블록을 두 번 누르면 해당 블록만 선택합니다.',
              '일반 편집기와 영상 편집기가 타임라인 클립보드를 공유하도록 해 화면 전환이나 재마운트 후 Ctrl+C/Ctrl+V가 간헐적으로 실패하던 문제를 수정했습니다.',
              '첫 실행 안내에 이 소프트웨어는 완전히 무료이며 유료로 구매했다면 즉시 환불을 요청해야 한다는 사기 방지 경고를 추가했습니다.'
            ]
          },
          {
            title: 'v0.3.0 · 2026-07-30',
            items: [
              '4개 언어 내장 도움말, 연습 사용자/공략 제작자 흐름, 상세 참고 설명과 첫 실행 안내를 추가했습니다.',
              '세 테마의 홈 배경, 아이콘과 Live2D 표시를 개선하고 Live2D를 끄는 설정을 추가했습니다.',
              '녹화 상태 표시점을 추가했습니다. 대기 중에는 녹색, 녹화 중에는 빨간색으로 표시됩니다.',
              '블록 배경 양 끝을 보호하는 가장자리 항목을 추가하고 여러 프리셋의 기본 자르기를 개선했습니다.',
              '캐릭터 조합을 저장하고 빠르게 전환하는 팀 프리셋을 추가했습니다.',
              '동작 블록을 선택한 뒤 타임라인 빈 곳에서 오른쪽 클릭해도 현재 선택에 삭제 등의 작업을 실행할 수 있습니다.',
              '오른쪽 클릭 메뉴를 정리하고 선택 동작을 바로 교체하는 “변경”과 같은 캐릭터·유형·레인의 블록을 합치는 “병합”을 추가했습니다.',
              '동작 블록을 드래그할 수 없던 문제와 Alt+드래그로 준비/후딜을 조절할 수 없던 문제를 수정했습니다.',
              '마우스 측면 버튼 캡처와 매핑을 수정하고 게임패드 입력 경로도 계속 점검했습니다.',
              '밝은 테마에서 문구, 괄호와 콤보 카드의 대비가 낮은 부분을 수정했습니다.',
              '녹화 타임라인에 재생, 배속과 자동 따라가기를 추가하고 흰색 재생 헤드를 중심으로 확대하도록 변경했습니다.',
              '실제 키 모양의 새 키보드 아이콘 세트를 추가하고 두 입력 바인딩 표시를 개선했습니다.',
              '영상 자르기와 도구 배치를 개선했습니다. 자르기는 맨 왼쪽, 편집 도구 5개는 중앙, 다기능 타임라인 버튼은 맨 오른쪽에 배치됩니다.',
              '입력 설정 가져오기/내보내기와 “단축키 설정”을 추가했습니다. 단일 키와 Shift 조합은 변경할 수 있고 Ctrl/Alt로 시작하는 편집 조합은 고정됩니다.',
              'Delete, Ctrl+C와 Ctrl+V가 작동하지 않던 문제를 수정했습니다. 선택이 없을 때 Delete는 연속 삭제, C는 분할, V는 선택 블록 병합이며 충돌하는 브라우저 기본 동작도 차단합니다.',
              '추가 중 F로 피니셔, B로 변주 자동 전환을 선택하고 Y로 선택 블록에 반주 y를 추가할 수 있습니다. 피니셔, 변주, 반주와 앞으로 이동의 기본 안내도 추가했습니다.',
              '[Basic Attack]처럼 대괄호 안의 문구를 아이콘으로 변환하지 않고 괄호를 숨겨 문자로 표시하는 기능을 추가했습니다.',
              '동작 문자 외곽선의 사용 여부, 두께와 색상 설정을 추가했습니다.',
              'Windows 버전은 시작할 때 관리자 권한을 필수로 요청합니다. UAC를 승인하면 관리자 권한 게임에서도 전역 입력 캡처를 사용할 수 있습니다.',
              '홈 진입 버튼 표시 토글의 색상 배경을 제거하고 클릭 시 반대편으로 이동하던 문제를 수정했습니다.'
            ]
          },
          { title: 'v0.2.0 · 2026-07-28', items: ['영상 보조 타임라인, 자르기와 영상/투명 레이어 내보내기를 추가했습니다.', '축 이미지 내보내기, 키 매핑, 리듬 축과 키보드/게임패드 바인딩을 확장했습니다.', '다국어 UI, 녹화 표시점과 외형 사용자 설정을 개선했습니다.'] },
          { title: 'v0.1.0 · 2026-07-27', items: ['녹화, 연습, 콤보 외형과 실험 도구를 포함한 첫 공개 버전입니다.', 'JSON 가져오기/내보내기, 콤보 라이브러리, 3가지 연습 모드와 전역 입력 캡처를 제공했습니다.', '중국어, 영어, 일본어와 한국어 UI를 제공했습니다.'] }
        ]
      }
    }
  }
};
