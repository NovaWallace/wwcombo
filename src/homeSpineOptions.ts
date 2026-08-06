import type { AppLanguage } from './i18n';

export type HomeSpineId =
  | 'zani'
  | 'augusta'
  | 'lupa'
  | 'galbrena'
  | 'ciaccona'
  | 'cartethyia'
  | 'phrolova'
  | 'hiyuki'
  | 'yinlin'
  | 'jinhsi'
  | 'changli'
  | 'zhezhi'
  | 'xuanling'
  | 'suisui'
  | 'qiuyuan'
  | 'xiangli-yao'
  | 'luuk-herssen'
  | 'jiyan'
  | 'brant'
  | 'rover-spectro';

export type HomeSpineOption = {
  id: HomeSpineId;
  names: Record<AppLanguage, string>;
  skeletonUrl: string;
  scale: number;
  offsetX?: number;
  offsetY?: number;
};

export const DEFAULT_HOME_SPINE_ID: HomeSpineId = 'zani';

export const HOME_SPINE_OPTIONS: readonly HomeSpineOption[] = [
  { id: 'zani', names: { 'zh-CN': '赞妮', 'en-US': 'Zani', 'ja-JP': 'ザンニー', 'ko-KR': '잔니' }, skeletonUrl: '/theme/zanni-spine/zanni.skel', scale: 2.4, offsetX: -0.01, offsetY: 0 },
  { id: 'augusta', names: { 'zh-CN': '奥古斯塔', 'en-US': 'Augusta', 'ja-JP': 'オーガスタ', 'ko-KR': '아우구스타' }, skeletonUrl: '/theme/augusta-spine/aogusita.skel', scale: 3, offsetY: 0.09 },
  { id: 'lupa', names: { 'zh-CN': '露帕', 'en-US': 'Lupa', 'ja-JP': 'ルパ', 'ko-KR': '루파' }, skeletonUrl: '/theme/lupa-spine/lupa.skel', scale: 2, offsetY: 0 },
  { id: 'galbrena', names: { 'zh-CN': '嘉贝莉娜', 'en-US': 'Galbrena', 'ja-JP': 'ガルブレーナ', 'ko-KR': '갈브레나' }, skeletonUrl: '/theme/galbrena-spine/jiabeilina.skel', scale: 3, offsetY: 0.2 },
  { id: 'ciaccona', names: { 'zh-CN': '夏空', 'en-US': 'Ciaccona', 'ja-JP': 'シャコンヌ', 'ko-KR': '샤콘' }, skeletonUrl: '/theme/night-1407-spine/xiakong.skel', scale: 2, offsetY: 0 },
  { id: 'cartethyia', names: { 'zh-CN': '卡提希娅', 'en-US': 'Cartethyia', 'ja-JP': 'カルテジア', 'ko-KR': '카르테시아' }, skeletonUrl: '/theme/night-1409-spine/katixiya.skel', scale: 2, offsetY: 0.06 },
  { id: 'phrolova', names: { 'zh-CN': '弗洛洛', 'en-US': 'Phrolova', 'ja-JP': 'フローヴァ', 'ko-KR': '플로로' }, skeletonUrl: '/theme/phrolova-spine/fuluoluo.skel', scale: 2.2, offsetY: 0.1 },
  { id: 'hiyuki', names: { 'zh-CN': '绯雪', 'en-US': 'Hiyuki', 'ja-JP': '緋雪', 'ko-KR': '히유키' }, skeletonUrl: '/theme/hiyuki-spine/feixue.skel', scale: 2, offsetY: -0.2 },
  { id: 'yinlin', names: { 'zh-CN': '吟霖', 'en-US': 'Yinlin', 'ja-JP': 'インリン', 'ko-KR': '음림' }, skeletonUrl: '/theme/day-1302-spine/yinlin.skel', scale: 1.6, offsetX: -0.05, offsetY: 0.1 },
  { id: 'jinhsi', names: { 'zh-CN': '今汐', 'en-US': 'Jinhsi', 'ja-JP': 'コンシ', 'ko-KR': '금희' }, skeletonUrl: '/theme/day-1304-spine/jinxi.skel', scale: 2.9, offsetY: 0.05 },
  { id: 'changli', names: { 'zh-CN': '长离', 'en-US': 'Changli', 'ja-JP': 'チョウリ', 'ko-KR': '장리' }, skeletonUrl: '/theme/day-1205-spine/changli.skel', scale: 2, offsetY: 0 },
  { id: 'zhezhi', names: { 'zh-CN': '折枝', 'en-US': 'Zhezhi', 'ja-JP': 'ゼジ', 'ko-KR': '절지' }, skeletonUrl: '/theme/day-1105-spine/zhezhi.skel', scale: 2, offsetY: 0 },
  { id: 'xuanling', names: { 'zh-CN': '秧秧·玄翎', 'en-US': 'Yangyang: Xuanling', 'ja-JP': '秧秧・玄翎', 'ko-KR': '양양·현령' }, skeletonUrl: '/theme/day-1610-spine/xuanling.skel', scale: 2, offsetY: 0 },
  { id: 'suisui', names: { 'zh-CN': '穗穗', 'en-US': 'Suisui', 'ja-JP': 'スイスイ', 'ko-KR': '수이수이' }, skeletonUrl: '/theme/day-1110-spine/suisui.skel', scale: 2, offsetY: 0 },
  { id: 'qiuyuan', names: { 'zh-CN': '仇远', 'en-US': 'Qiuyuan', 'ja-JP': 'キュウエン', 'ko-KR': '구원' }, skeletonUrl: '/theme/day2-1411-spine/qiuyuan.skel', scale: 2, offsetY: 0 },
  { id: 'xiangli-yao', names: { 'zh-CN': '相里要', 'en-US': 'Xiangli Yao', 'ja-JP': 'シャンリ・ヤオ', 'ko-KR': '상리요' }, skeletonUrl: '/theme/day2-1305-spine/xiangliyao.skel', scale: 2, offsetY: 0.1 },
  { id: 'luuk-herssen', names: { 'zh-CN': '陆·赫森', 'en-US': 'Luuk Herssen', 'ja-JP': 'リューク・ヘルセン', 'ko-KR': '루크 헤르센' }, skeletonUrl: '/theme/day2-1510-spine/luhesi.skel', scale: 2, offsetY: 0 },
  { id: 'jiyan', names: { 'zh-CN': '忌炎', 'en-US': 'Jiyan', 'ja-JP': 'キエン', 'ko-KR': '기염' }, skeletonUrl: '/theme/day2-1404-spine/jiyan.skel', scale: 2, offsetY: 0.05 },
  { id: 'brant', names: { 'zh-CN': '布兰特', 'en-US': 'Brant', 'ja-JP': 'ブラント', 'ko-KR': '브랜트' }, skeletonUrl: '/theme/day2-1206-spine/bulante.skel', scale: 2, offsetY: 0.1 },
  { id: 'rover-spectro', names: { 'zh-CN': '漂泊者·星火永明', 'en-US': 'Rover: Everbright Spark', 'ja-JP': '漂泊者・星火永明', 'ko-KR': '방랑자·영원한 별불' }, skeletonUrl: '/theme/day2-1501-spine/PortraitsMale_Skin1.skel', scale: 1, offsetY: 0 }
];

const HOME_SPINE_IDS = new Set<HomeSpineId>(HOME_SPINE_OPTIONS.map((option) => option.id));

export function normalizeHomeSpineId(value: unknown): HomeSpineId {
  return typeof value === 'string' && HOME_SPINE_IDS.has(value as HomeSpineId) ? value as HomeSpineId : DEFAULT_HOME_SPINE_ID;
}

export function homeSpineOption(id: HomeSpineId): HomeSpineOption {
  return HOME_SPINE_OPTIONS.find((option) => option.id === id) ?? HOME_SPINE_OPTIONS[0];
}
