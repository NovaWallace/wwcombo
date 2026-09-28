import type { AppLanguage } from './i18n';

// IDs are supplied by the installed DLC packages. Keep this as a string so a
// newly dropped character does not require a frontend release.
export type HomeSpineId = string;

export type HomeSpineOption = {
  id: HomeSpineId;
  names: Record<AppLanguage, string>;
  skeletonUrl: string;
  scale: number;
  offsetX?: number;
  offsetY?: number;
};

export type HomeSpineTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export type HomeSpineTransforms = Partial<Record<HomeSpineId, HomeSpineTransform>>;

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
  { id: 'suisui', names: { 'zh-CN': '岁岁', 'en-US': 'Suisui', 'ja-JP': 'スイスイ', 'ko-KR': '수이수이' }, skeletonUrl: '/theme/day-1110-spine/suisui.skel', scale: 2, offsetY: 0 },
  { id: 'qiuyuan', names: { 'zh-CN': '仇远', 'en-US': 'Qiuyuan', 'ja-JP': 'キュウエン', 'ko-KR': '구원' }, skeletonUrl: '/theme/day2-1411-spine/qiuyuan.skel', scale: 2, offsetY: 0 },
  { id: 'xiangli-yao', names: { 'zh-CN': '相里要', 'en-US': 'Xiangli Yao', 'ja-JP': 'シャンリ・ヤオ', 'ko-KR': '상리요' }, skeletonUrl: '/theme/day2-1305-spine/xiangliyao.skel', scale: 2, offsetY: 0.1 },
  { id: 'luuk-herssen', names: { 'zh-CN': '陆·赫森', 'en-US': 'Luuk Herssen', 'ja-JP': 'リューク・ヘルセン', 'ko-KR': '루크 헤르센' }, skeletonUrl: '/theme/day2-1510-spine/luhesi.skel', scale: 2, offsetY: 0 },
  { id: 'jiyan', names: { 'zh-CN': '忌炎', 'en-US': 'Jiyan', 'ja-JP': 'キエン', 'ko-KR': '기염' }, skeletonUrl: '/theme/day2-1404-spine/jiyan.skel', scale: 2, offsetY: 0.05 },
  { id: 'brant', names: { 'zh-CN': '布兰特', 'en-US': 'Brant', 'ja-JP': 'ブラント', 'ko-KR': '브랜트' }, skeletonUrl: '/theme/day2-1206-spine/bulante.skel', scale: 2, offsetY: 0.1 },
  { id: 'carlotta', names: { 'zh-CN': '珂莱塔', 'en-US': 'Carlotta', 'ja-JP': 'カルロッタ', 'ko-KR': '카를로타' }, skeletonUrl: '/theme/carlotta-spine/kelaita.skel', scale: 2 },
  { id: 'lucilla', names: { 'zh-CN': '洛瑟菈', 'en-US': 'Lucilla', 'ja-JP': 'ルシラー', 'ko-KR': '루실라' }, skeletonUrl: '/theme/lucilla-spine/luosela.skel', scale: 2 },
  { id: 'mornye', names: { 'zh-CN': '莫宁', 'en-US': 'Mornye', 'ja-JP': 'モーニエ', 'ko-KR': '모니에' }, skeletonUrl: '/theme/mornye-spine/moning.skel', scale: 2 },
  { id: 'aemeath', names: { 'zh-CN': '爱弥斯', 'en-US': 'Aemeath', 'ja-JP': 'エイメス', 'ko-KR': '에이메스' }, skeletonUrl: '/theme/aemeath-spine/aimisi.skel', scale: 2 },
  { id: 'denia', names: { 'zh-CN': '达妮娅', 'en-US': 'Denia', 'ja-JP': 'ダーニャ', 'ko-KR': '데니아' }, skeletonUrl: '/theme/denia-spine/daniya.skel', scale: 2 },
  { id: 'rebecca', names: { 'zh-CN': '丽贝卡', 'en-US': 'Rebecca', 'ja-JP': 'レベッカ', 'ko-KR': '레베카' }, skeletonUrl: '/theme/rebecca-spine/libeika.skel', scale: 2 },
  { id: 'iuno', names: { 'zh-CN': '尤诺', 'en-US': 'Iuno', 'ja-JP': 'ユーノ', 'ko-KR': '유노' }, skeletonUrl: '/theme/iuno-spine/younuo.skel', scale: 2 },
  { id: 'sigrika', names: { 'zh-CN': '西格莉卡', 'en-US': 'Sigrika', 'ja-JP': 'シグリカ', 'ko-KR': '시그리카' }, skeletonUrl: '/theme/sigrika-spine/xigelika.skel', scale: 2 },
  { id: 'shorekeeper', names: { 'zh-CN': '守岸人', 'en-US': 'Shorekeeper', 'ja-JP': 'ショアキーパー', 'ko-KR': '파수인' }, skeletonUrl: '/theme/shorekeeper-spine/shouanren.skel', scale: 2 },
  { id: 'phoebe', names: { 'zh-CN': '菲比', 'en-US': 'Phoebe', 'ja-JP': 'フィービー', 'ko-KR': '페비' }, skeletonUrl: '/theme/phoebe-spine/feibi.skel', scale: 2 },
  { id: 'chisa', names: { 'zh-CN': '千咲', 'en-US': 'Chisa', 'ja-JP': '千咲', 'ko-KR': '치사' }, skeletonUrl: '/theme/chisa-spine/qianxiao.skel', scale: 2 },
  { id: 'lynae', names: { 'zh-CN': '琳奈', 'en-US': 'Lynae', 'ja-JP': 'リンネー', 'ko-KR': '린네' }, skeletonUrl: '/theme/lynae-spine/linnai.skel', scale: 2 },
  { id: 'lucy', names: { 'zh-CN': '露西', 'en-US': 'Lucy', 'ja-JP': 'ルーシー', 'ko-KR': '루시' }, skeletonUrl: '/theme/lucy-spine/luxi.skel', scale: 2 },
  { id: 'camellya', names: { 'zh-CN': '椿', 'en-US': 'Camellya', 'ja-JP': 'ツバキ', 'ko-KR': '카멜리아' }, skeletonUrl: '/theme/camellya-spine/chun.skel', scale: 2 },
  { id: 'roccia', names: { 'zh-CN': '洛可可', 'en-US': 'Roccia', 'ja-JP': 'ロココ', 'ko-KR': '로코코' }, skeletonUrl: '/theme/roccia-spine/luokeke.skel', scale: 2 },
  { id: 'cantarella', names: { 'zh-CN': '坎特蕾拉', 'en-US': 'Cantarella', 'ja-JP': 'カンタレラ', 'ko-KR': '칸타렐라' }, skeletonUrl: '/theme/cantarella-spine/kanteleila.skel', scale: 2 },
  { id: 'qingxiao', names: { 'zh-CN': '清宵', 'en-US': 'Qingxiao', 'ja-JP': 'Qingxiao', 'ko-KR': 'Qingxiao' }, skeletonUrl: '/theme/qingxiao-spine/qingxiao.skel', scale: 2 },
  { id: 'jingran', names: { 'zh-CN': '景燃', 'en-US': 'Jingran', 'ja-JP': 'Jingran', 'ko-KR': 'Jingran' }, skeletonUrl: '/theme/jingran-spine/jingran.skel', scale: 2 },
];

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function defaultHomeSpineTransform(id: HomeSpineId): HomeSpineTransform {
  const option = homeSpineOption(id);
  return {
    scale: option.scale,
    offsetX: option.offsetX ?? 0,
    offsetY: option.offsetY ?? 0
  };
}

export function normalizeHomeSpineTransforms(value: unknown): HomeSpineTransforms {
  if (!value || typeof value !== 'object') return {};
  const source = value as Record<string, unknown>;
  const result: HomeSpineTransforms = {};
  for (const [id, candidate] of Object.entries(source)) {
    if (!candidate || typeof candidate !== 'object') continue;
    const fallback = defaultHomeSpineTransform(id);
    const record = candidate as Record<string, unknown>;
    result[id] = {
      scale: Math.min(8, Math.max(0.25, finiteOr(record.scale, fallback.scale))),
      offsetX: Math.min(1, Math.max(-1, finiteOr(record.offsetX, fallback.offsetX))),
      offsetY: Math.min(1, Math.max(-1, finiteOr(record.offsetY, fallback.offsetY)))
    };
   }
  return result;
}

export function normalizeHomeSpineId(value: unknown): HomeSpineId {
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_HOME_SPINE_ID;
}

export function homeSpineOption(id: HomeSpineId): HomeSpineOption {
  return HOME_SPINE_OPTIONS.find((option) => option.id === id) ?? {
    id,
    names: { 'zh-CN': id, 'en-US': id, 'ja-JP': id, 'ko-KR': id },
    skeletonUrl: '',
    scale: 2
  };
}
