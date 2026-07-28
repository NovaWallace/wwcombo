import { Fragment, createElement } from 'react';

const JAPANESE_TERM_READINGS: Readonly<Record<string, string>> = {
  'キャラクター切り替え': 'きゃらくたーきりかえ',
  'キャラクター切替': 'きゃらくたーきりかえ',
  '最大持続時間': 'さいだいじぞくじかん',
  '共鳴解放長押し': 'きょうめいかいほうながおし',
  '通常攻撃': 'つうじょうこうげき',
  '共鳴解放': 'きょうめいかいほう',
  '記録停止': 'きろくていし',
  '記録開始': 'きろくかいし',
  '準備完了': 'じゅんびかんりょう',
  '一時停止': 'いちじていし',
  '再生位置': 'さいせいいち',
  '再生速度': 'さいせいそくど',
  '不透明度': 'ふとうめいど',
  '表示領域': 'ひょうじりょういき',
  '背景領域': 'はいけいりょういき',
  '背景画像': 'はいけいがぞう',
  '高品質': 'こうひんしつ',
  '固定幅': 'こていはば',
  '進行状況': 'しんこうじょうきょう',
  '応答時間': 'おうとうじかん',
  '外観設定': 'がいかんせってい',
  '開始待機中': 'かいしたいきちゅう',
  '入力待機中': 'にゅうりょくたいきちゅう',
  '長方形': 'ちょうほうけい',
  '拡大縮小': 'かくだいしゅくしょう',
  '読み込み': 'よみこみ',
  '書き出し': 'かきだし',
  '置き換え': 'おきかえ',
  '割り当て': 'わりあて',
  '切り替え': 'きりかえ',
  '貼り付け': 'はりつけ',
  '長押し': 'ながおし',
  '共鳴': 'きょうめい',
  '音骸': 'おんがい',
  '重撃': 'じゅうげき',
  '変奏': 'へんそう',
  '終奏': 'しゅうそう',
  '回避': 'かいひ',
  '前進': 'ぜんしん',
  '探索': 'たんさく',
  '鳴潮': 'めいちょう',
  '瑝瓏': 'こうりゅう',
  '群星': 'ぐんせい',
  '開始軸': 'かいしじく',
  '起動軸': 'きどうじく',
  '時間軸': 'じかんじく',
  '判定線': 'はんていせん',
  '補助線': 'ほじょせん',
  '方向パッド': 'ほうこうぱっど',
  '右側': 'みぎがわ',
  '左側': 'ひだりがわ',
  '上方': 'じょうほう',
  '下方': 'かほう',
  '垂直方向': 'すいちょくほうこう',
  '水平方向': 'すいへいほうこう',
  '持続時間': 'じぞくじかん',
  '表示内容': 'ひょうじないよう',
  '練習中': 'れんしゅうちゅう',
  '記録中': 'きろくちゅう',
  '作成中': 'さくせいちゅう',
  '実行中': 'じっこうちゅう',
  '選択中': 'せんたくちゅう',
  '選択済み': 'せんたくずみ',
  '未選択': 'みせんたく',
  '未設定': 'みせってい',
  '未割り当て': 'みわりあて',
  '利用可能': 'りようかのう',
  '利用不可': 'りようふか',
  '再起動': 'さいきどう',
  '初期化': 'しょきか',
  '非表示': 'ひひょうじ',
  '自動的': 'じどうてき',
  '現在': 'げんざい',
  '全体': 'ぜんたい',
  '基本': 'きほん',
  '標準': 'ひょうじゅん',
  '外観': 'がいかん',
  '設定': 'せってい',
  '表示': 'ひょうじ',
  '言語': 'げんご',
  '練習': 'れんしゅう',
  '実験': 'じっけん',
  '記録': 'きろく',
  '再生': 'さいせい',
  '停止': 'ていし',
  '開始': 'かいし',
  '終了': 'しゅうりょう',
  '準備': 'じゅんび',
  '完了': 'かんりょう',
  '保存': 'ほぞん',
  '削除': 'さくじょ',
  '復元': 'ふくげん',
  '追加': 'ついか',
  '変更': 'へんこう',
  '変換': 'へんかん',
  '置換': 'ちかん',
  '選択': 'せんたく',
  '編集': 'へんしゅう',
  '共有': 'きょうゆう',
  '生成': 'せいせい',
  '作成': 'さくせい',
  '管理': 'かんり',
  '適用': 'てきよう',
  '解除': 'かいじょ',
  '取得': 'しゅとく',
  '参照': 'さんしょう',
  '実行': 'じっこう',
  '圧縮': 'あっしゅく',
  '入力': 'にゅうりょく',
  '出力': 'しゅつりょく',
  '移動': 'いどう',
  '配置': 'はいち',
  '位置': 'いち',
  '順序': 'じゅんじょ',
  '調整': 'ちょうせい',
  '間隔': 'かんかく',
  '期間': 'きかん',
  '時間': 'じかん',
  '速度': 'そくど',
  '範囲': 'はんい',
  '反応': 'はんのう',
  '判定': 'はんてい',
  '操作': 'そうさ',
  '挑戦': 'ちょうせん',
  '失敗': 'しっぱい',
  '成功': 'せいこう',
  '必要': 'ひつよう',
  '可能': 'かのう',
  '有効': 'ゆうこう',
  '無効': 'むこう',
  '注意': 'ちゅうい',
  '情報': 'じょうほう',
  '説明': 'せつめい',
  '内容': 'ないよう',
  '項目': 'こうもく',
  '領域': 'りょういき',
  '環境': 'かんきょう',
  '品質': 'ひんしつ',
  '画像': 'がぞう',
  '動画': 'どうが',
  '音声': 'おんせい',
  '音量': 'おんりょう',
  '背景': 'はいけい',
  '背景色': 'はいけいしょく',
  '文字': 'もじ',
  '名前': 'なまえ',
  '形状': 'けいじょう',
  '寸法': 'すんぽう',
  '透明': 'とうめい',
  '比率': 'ひりつ',
  '回転': 'かいてん',
  '拡大': 'かくだい',
  '縮小': 'しゅくしょう',
  '固定': 'こてい',
  '水平': 'すいへい',
  '垂直': 'すいちょく',
  '方向': 'ほうこう',
  '中心': 'ちゅうしん',
  '最大': 'さいだい',
  '最小': 'さいしょう',
  '上限': 'じょうげん',
  '独立': 'どくりつ',
  '自由': 'じゆう',
  '自動': 'じどう',
  '軸': 'じく',
  '幅': 'はば',
  '縦': 'たて',
  '横': 'よこ',
  '右': 'みぎ',
  '左': 'ひだり'
};

const JAPANESE_TERM_PATTERN = new RegExp(
  Object.keys(JAPANESE_TERM_READINGS)
    .sort((left, right) => right.length - left.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'g'
);

export function annotateJapaneseTerminology(value: string): string {
  const plainValue = String(value);
  JAPANESE_TERM_PATTERN.lastIndex = 0;
  if (!JAPANESE_TERM_PATTERN.test(plainValue)) return plainValue;
  return new JapaneseRubyString(plainValue) as unknown as string;
}

type JapaneseRubySegment = {
  text: string;
  annotation?: string;
};

function splitJapaneseRubySegments(value: string): JapaneseRubySegment[] {
  const segments: JapaneseRubySegment[] = [];
  const pattern = new RegExp(JAPANESE_TERM_PATTERN.source, 'g');
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > cursor) segments.push({ text: value.slice(cursor, match.index) });
    const term = match[0];
    segments.push({ text: term, annotation: JAPANESE_TERM_READINGS[term] });
    cursor = match.index + term.length;
  }

  if (cursor < value.length) segments.push({ text: value.slice(cursor) });
  return segments;
}

function JapaneseRubyText({ value }: { value: string }) {
  return createElement(
    Fragment,
    null,
    ...splitJapaneseRubySegments(value).map((segment, index) => segment.annotation
      ? createElement('ruby', { key: `${index}-${segment.text}` }, segment.text, createElement('rt', null, segment.annotation))
      : segment.text)
  );
}

class JapaneseRubyString extends String {
  constructor(value: string) {
    super(value);
    Object.assign(this, createElement(JapaneseRubyText, { value }));
  }
}
