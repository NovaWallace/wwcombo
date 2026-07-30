import type { CharacterSlot, ComboChart, ComboPeriod, ComboStep, MoveDefinition } from '../combo-core';

export const TEXT_AXIS_EXAMPLE = '启动轴：达 eqraa，爱a，露ra，爱ae，达aa，露aaa，达aae，爱aa，露a，达ar，爱 变奏 a，露e，达aaa，爱a，露跳eeq，爱 变奏r1efaaqezr';

export type TextAxisCharacter = {
  slot: CharacterSlot;
  names: string[];
};

export type TextAxisParseResult = {
  chart: ComboChart;
  contentLabels: Record<string, string>;
  startingCharacterSlot: CharacterSlot;
  warnings: string[];
};

type TextAxisParserOptions = {
  moves: MoveDefinition[];
  characters: TextAxisCharacter[];
  title?: string;
  now?: number;
  createId?: () => string;
};

type RoleAlias = { value: string; slot: CharacterSlot };
type LoopMarker = { stepIndex: number };
type PendingSwitch = { slot: CharacterSlot; intro: boolean };

const PHRASE_ACTIONS: Array<[string, string, string?]> = [
  ['长按共鸣解放', 'liberation_hold'],
  ['长按解放', 'liberation_hold'],
  ['共鸣解放', 'liberation'],
  ['长按声骸', 'echo_hold'],
  ['长按技能', 'skill_hold'],
  ['长按普攻', 'heavy_attack'],
  ['长按闪避', 'dodge_hold'],
  ['长按跳跃', 'jump_hold'],
  ['声骸', 'echo'],
  ['技能', 'skill'],
  ['普攻', 'basic_attack'],
  ['重击', 'heavy_attack'],
  ['解放', 'liberation'],
  ['跳跃', 'jump'],
  ['跳', 'jump'],
  ['闪避', 'dodge'],
  ['闪', 'dodge'],
  ['处决', 'empty_action', 'f'],
  ['前走', 'empty_action', 'w']
];

const LETTER_ACTIONS: Record<string, [string, string?]> = {
  a: ['basic_attack'],
  A: ['heavy_attack'],
  z: ['heavy_attack'],
  Z: ['heavy_attack'],
  e: ['skill'],
  E: ['skill_hold'],
  q: ['echo'],
  Q: ['echo_hold'],
  r: ['liberation'],
  R: ['liberation_hold'],
  s: ['dodge'],
  d: ['dodge'],
  S: ['dodge_hold'],
  D: ['dodge_hold'],
  j: ['jump'],
  J: ['jump_hold'],
  t: ['tool'],
  T: ['tool'],
  f: ['empty_action', 'f'],
  F: ['empty_action', 'f'],
  w: ['empty_action', 'w'],
  W: ['empty_action', 'w']
};

function firstChineseCharacter(value: string): string {
  return Array.from(value).find((character) => /[\u3400-\u9fff]/u.test(character)) ?? '';
}

function characterAliases(characters: TextAxisCharacter[]): RoleAlias[] {
  const candidates: RoleAlias[] = [];
  for (const character of characters) {
    const fullNames = Array.from(new Set(character.names.map((name) => name.trim()).filter(Boolean)));
    for (const name of fullNames) {
      if (!/^角色\s*[123]$/u.test(name)) candidates.push({ value: name, slot: character.slot });
      const first = firstChineseCharacter(name);
      if (first) candidates.push({ value: first, slot: character.slot });
    }
  }
  const slotsByAlias = new Map<string, Set<CharacterSlot>>();
  candidates.forEach((candidate) => {
    const slots = slotsByAlias.get(candidate.value) ?? new Set<CharacterSlot>();
    slots.add(candidate.slot);
    slotsByAlias.set(candidate.value, slots);
  });
  return candidates
    .filter((candidate, index) => slotsByAlias.get(candidate.value)?.size === 1 && candidates.findIndex((item) => item.value === candidate.value && item.slot === candidate.slot) === index)
    .sort((left, right) => right.value.length - left.value.length || left.slot - right.slot);
}

function switchSlotFromToken(token: string): CharacterSlot | null {
  const normalized = token.toLowerCase().replace(/b$/u, '');
  if (normalized === 'i' || normalized === '1') return 1;
  if (normalized === 'ii' || normalized === '2') return 2;
  if (normalized === 'iii' || normalized === '3') return 3;
  return null;
}

function switchContent(slot: CharacterSlot, intro: boolean): string {
  return `${'i'.repeat(slot) }${intro ? 'b' : '' }`;
}

function actionDuration(moveId: string): number {
  if (moveId === 'liberation' || moveId === 'liberation_hold') return 3000;
  if (/^switch_[123]$/u.test(moveId)) return 500;
  return 1000;
}

function laneForMove(moveId: string): ComboStep['lane'] {
  return moveId === 'basic_attack' ? 'independent' : 'main';
}

export function parseTextAxis(source: string, options: TextAxisParserOptions): TextAxisParseResult {
  const now = options.now ?? Date.now();
  const createId = options.createId ?? (() => crypto.randomUUID());
  const aliases = characterAliases(options.characters);
  const moveById = new Map(options.moves.map((move) => [move.id, move]));
  const warnings = new Set<string>();
  const steps: ComboStep[] = [];
  const contentLabels: Record<string, string> = {};
  const loopMarkers: LoopMarker[] = [];
  let startupMarkerSeen = false;
  let cursorMs = 0;
  let index = 0;
  let currentSlot: CharacterSlot | null = null;
  let startingCharacterSlot: CharacterSlot | null = null;
  let pendingSwitch: PendingSwitch | null = null;
  let nextSwitchIntro = false;

  const appendContent = (suffix: string) => {
    const step = steps[steps.length - 1];
    if (!step) {
      warnings.add(`“${suffix }”前没有可修改的招式块`);
      return;
    }
    const fallback = /^switch_[123]$/u.test(step.moveId)
      ? switchContent(Number(step.moveId.slice(-1)) as CharacterSlot, false)
      : defaultContentForMove(step.moveId);
    contentLabels[step.id] = `${contentLabels[step.id] ?? fallback ?? '' }${suffix }`;
  };

  const addMove = (moveId: string, contentLabel?: string) => {
    const move = moveById.get(moveId);
    if (!move) {
      warnings.add(`当前项目缺少招式：${moveId }`);
      return null;
    }
    const switchSlot = /^switch_[123]$/u.test(moveId) ? Number(moveId.slice(-1)) as CharacterSlot : null;
    const slot = switchSlot ?? currentSlot ?? startingCharacterSlot ?? 1;
    const duration = actionDuration(moveId);
    const id = createId();
    const step: ComboStep = {
      id,
      moveId,
      label: move.label,
      characterSlot: slot,
      lane: laneForMove(moveId),
      independent: move.independent,
      startMin: cursorMs,
      startMax: cursorMs,
      durationMin: duration,
      durationMax: duration,
      preheatMs: 0,
      recoveryMs: 0,
      color: move.color,
      advancesStep: move.advancesStep,
      samples: []
    };
    steps.push(step);
    if (contentLabel) contentLabels[id] = contentLabel;
    cursorMs += duration;
    if (switchSlot) currentSlot = switchSlot;
    return step;
  };

  const requestSwitch = (slot: CharacterSlot, intro = false) => {
    if (startingCharacterSlot === null && steps.length === 0 && currentSlot === null) {
      startingCharacterSlot = slot;
      currentSlot = slot;
      nextSwitchIntro = false;
      return;
    }
    if (pendingSwitch && pendingSwitch.slot !== slot) flushSwitch();
    if (slot === currentSlot) {
      pendingSwitch = null;
      nextSwitchIntro = false;
      return;
    }
    pendingSwitch = { slot, intro: intro || nextSwitchIntro };
    nextSwitchIntro = false;
  };

  const flushSwitch = () => {
    if (!pendingSwitch) return null;
    const next = pendingSwitch;
    pendingSwitch = null;
    if (next.slot === currentSlot) return null;
    return addMove(`switch_${next.slot }`, switchContent(next.slot, next.intro));
  };

  const addAction = (moveId: string, contentLabel?: string) => {
    flushSwitch();
    addMove(moveId, contentLabel);
  };

  const markPendingSwitchIntro = () => {
    if (!pendingSwitch) return false;
    pendingSwitch = { ...pendingSwitch, intro: true };
    return true;
  };

  const consume = (length: number) => {
    index += length;
  };

  while (index < source.length) {
    const rest = source.slice(index);
    const separator = /^[\s，,。；;、：:]+/u.exec(rest);
    if (separator) {
      consume(separator[0].length);
      continue;
    }
    if (rest.startsWith('启动轴')) {
      startupMarkerSeen = true;
      consume(3);
      continue;
    }
    if (rest.startsWith('启动')) {
      startupMarkerSeen = true;
      consume(2);
      continue;
    }
    const loopMatch = /^循环轴(?:\d+)?/u.exec(rest) ?? /^循环/u.exec(rest);
    if (loopMatch) {
      flushSwitch();
      loopMarkers.push({ stepIndex: steps.length });
      consume(loopMatch[0].length);
      continue;
    }
    const alias = aliases.find((candidate) => rest.startsWith(candidate.value));
    if (alias) {
      requestSwitch(alias.slot);
      consume(alias.value.length);
      continue;
    }
    if (rest.startsWith('变奏')) {
      if (!markPendingSwitchIntro()) {
        if (steps[steps.length - 1]?.moveId.startsWith('switch_')) appendContent('b');
        else nextSwitchIntro = true;
      }
      consume(2);
      continue;
    }
    if (rest.startsWith('延奏')) {
      appendContent('y');
      consume(2);
      continue;
    }
    const phraseAction = PHRASE_ACTIONS.find(([phrase]) => rest.startsWith(phrase));
    if (phraseAction) {
      addAction(phraseAction[1], phraseAction[2]);
      consume(phraseAction[0].length);
      continue;
    }
    const switchMatch = /^(iiib|iib|ib|iii|ii|i|[123]b?)/iu.exec(rest);
    if (switchMatch) {
      const slot = switchSlotFromToken(switchMatch[0]);
      if (slot) requestSwitch(slot, /b$/iu.test(switchMatch[0]));
      consume(switchMatch[0].length);
      continue;
    }
    const letter = rest[0];
    if (letter === 'b' || letter === 'B') {
      if (!markPendingSwitchIntro()) nextSwitchIntro = true;
      consume(1);
      continue;
    }
    if (letter === 'y' || letter === 'Y') {
      appendContent('y');
      consume(1);
      continue;
    }
    const letterAction = LETTER_ACTIONS[letter];
    if (letterAction) {
      addAction(letterAction[0], letterAction[1]);
      consume(1);
      continue;
    }
    const unknown = Array.from(rest)[0];
    if (/\S/u.test(unknown)) warnings.add(`无法识别的内容：${unknown }`);
    consume(unknown.length);
  }

  flushSwitch();
  const finalStartingSlot = startingCharacterSlot ?? (steps[0]?.characterSlot as CharacterSlot | undefined) ?? 1;
  const periods: ComboPeriod[] = [];
  const loopStarts = loopMarkers.map((marker) => {
    const switchStep = steps.slice(marker.stepIndex).find((step) => /^switch_[123]$/u.test(step.moveId));
    return switchStep?.startMin ?? steps[marker.stepIndex]?.startMin ?? cursorMs;
  });
  const startupEndMs = loopStarts[0] ?? cursorMs;
  if (startupMarkerSeen && startupEndMs > 0) {
    periods.push({ id: createId(), kind: 'startup_axis', label: '启动轴', startMs: 0, endMs: startupEndMs });
  }
  loopStarts.forEach((startMs, loopIndex) => {
    const endMs = loopStarts[loopIndex + 1] ?? cursorMs;
    if (endMs <= startMs) return;
    periods.push({
      id: createId(),
      kind: 'loop_axis',
      label: loopStarts.length === 1 ? '循环轴' : `循环轴${loopIndex + 1 }`,
      startMs,
      endMs,
      loopIndex: loopIndex + 1
    });
  });

  const chart: ComboChart = {
    id: createId(),
    title: options.title?.trim() || '文字轴',
    character: options.characters.map((character) => character.names.find(Boolean)).filter(Boolean).join(' / '),
    tags: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
    startTriggerMoveId: 'start_challenge',
    stopTriggerMoveId: 'stop_recording',
    steps,
    periods
  };
  return { chart, contentLabels, startingCharacterSlot: finalStartingSlot, warnings: [...warnings] };
}

function defaultContentForMove(moveId: string): string | undefined {
  if (moveId === 'basic_attack') return 'a';
  if (moveId === 'heavy_attack') return 'A';
  if (moveId === 'skill') return 'e';
  if (moveId === 'skill_hold') return 'E';
  if (moveId === 'echo') return 'q';
  if (moveId === 'echo_hold') return 'Q';
  if (moveId === 'liberation') return 'r';
  if (moveId === 'liberation_hold') return 'R';
  if (moveId === 'dodge') return 's';
  if (moveId === 'dodge_hold') return 'S';
  if (moveId === 'jump') return 'j';
  if (moveId === 'jump_hold') return 'J';
  if (moveId === 'empty_action') return 'w';
  if (moveId === 'switch_1') return 'i';
  if (moveId === 'switch_2') return 'ii';
  if (moveId === 'switch_3') return 'iii';
  return undefined;
}
