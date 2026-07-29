import type { AppLanguage } from './i18n';
import { annotateJapaneseTerminology } from './japaneseTerminology';
import { annotateKoreanTerminology } from './koreanTerminology';

export type MoveLabelLanguage = AppLanguage;

export const ENGLISH_MOVE_LABELS: Record<string, string> = {
  start_challenge: 'Start',
  stop_recording: 'Stop Recording',
  basic_attack: 'Basic Attack',
  heavy_attack: 'Heavy Attack',
  skill: 'Resonance Skill',
  skill_hold: 'Hold Resonance Skill',
  echo: 'Echo Skill',
  echo_hold: 'Hold Echo Skill',
  tool: 'Utility',
  liberation: 'Resonance Liberation',
  liberation_hold: 'Hold Resonance Liberation',
  dodge: 'Dodge',
  dodge_hold: 'Hold Dodge',
  jump: 'Jump',
  jump_hold: 'Hold Jump',
  finisher: 'Finisher',
  empty_action: 'Empty Action',
  switch_1: 'Switch 1',
  switch_2: 'Switch 2',
  switch_3: 'Switch 3'
};

const JAPANESE_MOVE_LABELS: Record<string, string> = {
  start_challenge: '開始',
  stop_recording: '記録停止',
  basic_attack: '通常攻撃',
  heavy_attack: '重撃',
  skill: '共鳴スキル',
  skill_hold: '共鳴スキル長押し',
  echo: '音骸スキル',
  echo_hold: '音骸スキル長押し',
  tool: '探索モジュール',
  liberation: '共鳴解放',
  liberation_hold: '共鳴解放長押し',
  dodge: '回避',
  dodge_hold: '回避長押し',
  jump: 'ジャンプ',
  jump_hold: 'ジャンプ長押し',
  finisher: 'フィニッシャー',
  empty_action: '空アクション',
  switch_1: 'キャラクター切替 1',
  switch_2: 'キャラクター切替 2',
  switch_3: 'キャラクター切替 3'
};

const KOREAN_MOVE_LABELS: Record<string, string> = {
  start_challenge: '시작',
  stop_recording: '기록 중지',
  basic_attack: '일반 공격',
  heavy_attack: '강공격',
  skill: '공명 스킬',
  skill_hold: '공명 스킬 길게 누르기',
  echo: '에코 어빌리티',
  echo_hold: '에코 어빌리티 길게 누르기',
  tool: '탐색 도구',
  liberation: '공명 해방',
  liberation_hold: '공명 해방 길게 누르기',
  dodge: '회피',
  dodge_hold: '회피 길게 누르기',
  jump: '점프',
  jump_hold: '점프 길게 누르기',
  finisher: '피니셔',
  empty_action: '빈 동작',
  switch_1: '캐릭터 전환 1',
  switch_2: '캐릭터 전환 2',
  switch_3: '캐릭터 전환 3'
};

const MOVE_LABELS: Partial<Record<MoveLabelLanguage, Record<string, string>>> = {
  'en-US': ENGLISH_MOVE_LABELS,
  'ja-JP': JAPANESE_MOVE_LABELS,
  'ko-KR': KOREAN_MOVE_LABELS
};

const CONTENT_PROMPT_LABELS: Record<string, Record<MoveLabelLanguage, string>> = {
  a: { 'zh-CN': '普攻', 'en-US': 'Basic Attack', 'ja-JP': '通常攻撃', 'ko-KR': '일반 공격' },
  z: { 'zh-CN': '重击', 'en-US': 'Heavy Attack', 'ja-JP': '重撃', 'ko-KR': '강공격' },
  Z: { 'zh-CN': '重击', 'en-US': 'Heavy Attack', 'ja-JP': '重撃', 'ko-KR': '강공격' },
  e: { 'zh-CN': '技能', 'en-US': 'Resonance Skill', 'ja-JP': '共鳴スキル', 'ko-KR': '공명 스킬' },
  E: { 'zh-CN': '长按技能', 'en-US': 'Hold Resonance Skill', 'ja-JP': '共鳴スキル長押し', 'ko-KR': '공명 스킬 길게 누르기' },
  q: { 'zh-CN': '声骸', 'en-US': 'Echo Skill', 'ja-JP': '音骸スキル', 'ko-KR': '에코 어빌리티' },
  Q: { 'zh-CN': '长按声骸', 'en-US': 'Hold Echo Skill', 'ja-JP': '音骸スキル長押し', 'ko-KR': '에코 어빌리티 길게 누르기' },
  r: { 'zh-CN': '共鸣解放', 'en-US': 'Resonance Liberation', 'ja-JP': '共鳴解放', 'ko-KR': '공명 해방' },
  R: { 'zh-CN': '长按共鸣解放', 'en-US': 'Hold Resonance Liberation', 'ja-JP': '共鳴解放長押し', 'ko-KR': '공명 해방 길게 누르기' },
  s: { 'zh-CN': '闪避', 'en-US': 'Dodge', 'ja-JP': '回避', 'ko-KR': '회피' },
  d: { 'zh-CN': '闪避', 'en-US': 'Dodge', 'ja-JP': '回避', 'ko-KR': '회피' },
  S: { 'zh-CN': '长按闪避', 'en-US': 'Hold Dodge', 'ja-JP': '回避長押し', 'ko-KR': '회피 길게 누르기' },
  D: { 'zh-CN': '长按闪避', 'en-US': 'Hold Dodge', 'ja-JP': '回避長押し', 'ko-KR': '회피 길게 누르기' },
  j: { 'zh-CN': '跳跃', 'en-US': 'Jump', 'ja-JP': 'ジャンプ', 'ko-KR': '점프' },
  J: { 'zh-CN': '长按跳跃', 'en-US': 'Hold Jump', 'ja-JP': 'ジャンプ長押し', 'ko-KR': '점프 길게 누르기' },
  b: { 'zh-CN': '变奏', 'en-US': 'Intro Skill', 'ja-JP': '変奏スキル', 'ko-KR': '변주 스킬' },
  y: { 'zh-CN': '延奏', 'en-US': 'Outro Skill', 'ja-JP': '終奏スキル', 'ko-KR': '반주 스킬' },
  f: { 'zh-CN': '处决', 'en-US': 'Finisher', 'ja-JP': 'フィニッシャー', 'ko-KR': '피니셔' },
  w: { 'zh-CN': '前走', 'en-US': 'Move Forward', 'ja-JP': '前進', 'ko-KR': '앞으로 이동' },
  i: { 'zh-CN': '切换角色 1', 'en-US': 'Switch Character 1', 'ja-JP': 'キャラクター切替 1', 'ko-KR': '캐릭터 전환 1' },
  ii: { 'zh-CN': '切换角色 2', 'en-US': 'Switch Character 2', 'ja-JP': 'キャラクター切替 2', 'ko-KR': '캐릭터 전환 2' },
  iii: { 'zh-CN': '切换角色 3', 'en-US': 'Switch Character 3', 'ja-JP': 'キャラクター切替 3', 'ko-KR': '캐릭터 전환 3' }
};

export function localizedDefaultMoveLabel(moveId: string, fallback: string, language: MoveLabelLanguage, compactSwitch = true): string {
  if (language === 'zh-CN') return fallback;
  if (compactSwitch && /^switch_[123]$/.test(moveId)) return fallback;
  const label = MOVE_LABELS[language]?.[moveId] ?? fallback;
  if (language === 'ja-JP') return annotateJapaneseTerminology(label);
  return language === 'ko-KR' ? annotateKoreanTerminology(label) : label;
}

export function localizedMovePrompt(moveId: string, fallback: string, contentText: string | undefined, language: MoveLabelLanguage): string {
  const content = String(contentText ?? '').trim();
  const suffixKey = (['b', 'y', 'f', 'w'] as const).find((key) => content.endsWith(key));
  const prompt = CONTENT_PROMPT_LABELS[content] ?? (suffixKey ? CONTENT_PROMPT_LABELS[suffixKey] : undefined);
  if (prompt) {
    if (language === 'ja-JP') return annotateJapaneseTerminology(prompt[language]);
    return language === 'ko-KR' ? annotateKoreanTerminology(prompt[language]) : prompt[language];
  }
  return localizedDefaultMoveLabel(moveId, fallback, language);
}
