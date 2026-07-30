import { useEffect, useLayoutEffect, useMemo, useRef, useState  } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode  } from 'react';
import { createPortal  } from 'react-dom';
import { Activity, ArrowLeft, BookOpen, Bug, Check, ChevronLeft, ChevronRight, Download, Eye, EyeOff, FileVideo, FlaskConical, FolderOpen, Gamepad2, GraduationCap, GripVertical, History, Keyboard, Layers, Moon, Music2, Move, Palette, Pause, Pencil, Plus, Play, Repeat2, RotateCcw, Save, Scissors, Settings, Share2, Square, Stamp, Sun, Target, Trash2, Upload, X  } from 'lucide-react';
import {
  CharacterSlot,
  ComboChart,
  ComboCommunityMetadata,
  ComboBasePreset,
  ComboImageStyle,
  ComboPeriod,
  ComboPeriodKind,
  ComboRecorder,
  ComboStep,
  DEFAULT_BINDINGS,
  DEFAULT_GAMEPAD_BINDINGS,
  DEFAULT_MOVES,
  KeyBinding,
  LENIENT_PRACTICE,
  MoveDefinition,
  PracticeSession,
  PracticeSnapshot,
  RecordedUnit,
  RecordingSnapshot,
  SIMPLE_PRACTICE,
  STRICT_PRACTICE,
  normalizeDomKeyboardEvent,
  normalizeDomMouseEvent
 } from '../combo-core';
import { normalizeInputCode  } from '../combo-core/input';
import { createDesktopBridge  } from './desktopBridge';
import {
  chartToComboImageItems,
  capsuleEdgeSourceRange,
  comboImageBackgroundSource,
  comboImageContentCenterPercent,
  comboImageDisplayIndexForStep,
  comboImageItemContainsStep,
  comboImageItemSizeForDisplayItem,
  comboTextParts,
  createDefaultComboImageStyle,
  defaultComboContentLabelForMoveId,
  effectiveCapsuleImageFields,
  effectiveIconMappings,
  effectiveComboImageStyle,
  maybeConvertTextToIconLabel,
  normalizeComboImageStyle,
  normalizeRectPercent,
  parseQuickInputText,
  visibleComboImageItems
 } from './combo-image/comboImage';
import { AxisRhythmGame  } from './AxisRhythmGame';
import { FullChartExportLab  } from './FullChartExportLab';
import { gamepadCodeLabel, gamepadIconSource, keyboardMouseCodeLabel, keyboardMouseIconSource, withGamepadIconMappings, withKeyboardMouseIconMappings  } from './gamepadIcons';
import type { GamepadIconSet, KeyboardIconMode  } from './gamepadIcons';
import { HomeSpineStage  } from './HomeSpineStage';
import { HELP_CONTENT  } from './helpContent';
import type { HelpGuideGroup, HelpTab  } from './helpContent';
import { KeyMappingLab  } from './KeyMappingLab';
import { VideoAxisWorkbench  } from './VideoAxisWorkbench';
import { localizeCharacterName, localizeDefaultCharacterName, localizeEnglish, setRemoteCharacterNames, useI18n  } from './i18n';
import type { AppLanguage } from './i18n';
import { ENGLISH_MOVE_LABELS, localizedDefaultMoveLabel, localizedMovePrompt  } from './moveLabels';
import { NumericDraftInput  } from './NumericDraftInput';
import { DEFAULT_SHORTCUT_SETTINGS, SHORTCUT_DEFINITIONS, TIMELINE_PLACEMENT_SHORTCUT_MOVES, normalizeShortcutSettings, shortcutChordFromKeyboardEvent, shortcutDisplayLabel, shortcutMatches, shortcutMatchesCode  } from './shortcutSettings';
import type { ShortcutAction, ShortcutSettings  } from './shortcutSettings';
import './styles.css';

type Page = 'home' | 'record' | 'practice' | 'appearance' | 'experiment' | 'settings';
type ExperimentPage = 'home' | 'axis' | 'keymap' | 'export-axis';
type HomeDestination = 'record' | 'practice' | 'appearance' | 'keymap' | 'export-axis' | 'settings';
type HomeSpineDestination = Extract<HomeDestination, 'record' | 'practice' | 'appearance' | 'keymap' | 'export-axis' | 'settings'>;
const HOME_SPINE_DESTINATIONS: HomeSpineDestination[] = ['record', 'practice', 'appearance', 'keymap', 'export-axis', 'settings'];
type EditorTab = 'timeline' | 'content';
type PracticePreset = 'strict' | 'lenient' | 'simple';
type InputMode = 'keyboard' | 'gamepad';
type RecordingIndicatorCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
type AppearanceMode = 'night' | 'day' | 'night2';
type SettingsView = 'settings' | 'shortcuts' | 'help';
type ComboLayout = 'horizontal' | 'vertical' | 'waterfall';
type LaneKind = 'main' | 'independent';
type DefaultAvatarEntry = { name: string; src: string; remote?: boolean  };
type DefaultBasePresetEntry = ComboBasePreset;
type ProjectAssetCharacter = { id: string; names: Partial<Record<AppLanguage, string>>; basePreset?: Omit<ComboBasePreset, 'id' | 'name' | 'user'> | null  };
type ProjectAssetManifest = { schemaVersion: number; revision: number; updatedAt: string; characters: ProjectAssetCharacter[]  };
type AppReleaseManifest = { schemaVersion: number; version: string; title: string; notes: string; publishedAt: string; download: { url: string; fileName?: string; bytes?: number; sha256?: string  } | null  };
type AvatarPresetEntry = DefaultAvatarEntry | ComboImageStyle['avatarPresets'][number];
type TeamPresetEntry = { id: string; characters: string[]  };
type CopiedTimelineSelection = { steps: ComboStep[]; periods: ComboPeriod[]; contentLabels: Record<string, string>; anchorMs: number  };
type PendingPlacement = { kind: 'step'  } | { kind: 'period'  } | { kind: 'zoom'  } | { kind: 'move'; moveId: string; adaptiveSwitch?: boolean; contentLabel?: string; contentSuffix?: string  } | { kind: 'cut'  } | { kind: 'delete'  } | ({ kind: 'copy'  } & CopiedTimelineSelection);
type SelectionBox = { x: number; y: number; width: number; height: number  };
type CharacterSlotMap = Record<CharacterSlot, CharacterSlot>;
type LocalizedMessage = { chinese: string; english: string };
type InputSettingsPackage = {
  kind: 'wwcombo-input-settings';
  schemaVersion: 1 | 2;
  exportedAt: string;
  moves: MoveDefinition[];
  keyboardMouseBindings: KeyBinding[];
  gamepadBindings: KeyBinding[];
  shortcutSettings?: ShortcutSettings;
  preferences: { inputMode: InputMode; keyboardIconMode: KeyboardIconMode; gamepadIconSet: GamepadIconSet  };
};

function localizedMessage(chinese: string, english: string): LocalizedMessage {
  return { chinese, english };
}

function highlightMessageTerm(message: string, term: string): ReactNode {
  const index = message.indexOf(term);
  if (index < 0) return message;
  return <>{message.slice(0, index) }<strong className="debug-status-keyword">{term }</strong>{message.slice(index + term.length) }</>;
}

function parseInputSettingsPackage(value: unknown): InputSettingsPackage {
  const record = value as Partial<InputSettingsPackage> | null;
  if (!record || typeof record !== 'object' || record.kind !== 'wwcombo-input-settings' || (record.schemaVersion !== 1 && record.schemaVersion !== 2)) throw new Error('invalid-input-settings-format');
  if (!Array.isArray(record.moves) || !Array.isArray(record.keyboardMouseBindings) || !Array.isArray(record.gamepadBindings)) throw new Error('invalid-input-settings-format');

  const moves = record.moves.map((value) => {
    const move = value as Partial<MoveDefinition> | null;
    if (!move || typeof move !== 'object' || typeof move.id !== 'string' || !move.id.trim() || typeof move.label !== 'string' || typeof move.color !== 'string' || typeof move.independent !== 'boolean' || typeof move.priority !== 'number' || !Number.isFinite(move.priority) || typeof move.advancesStep !== 'boolean') throw new Error('invalid-input-settings-format');
    if (move.interruptibleBy !== undefined && (!Array.isArray(move.interruptibleBy) || move.interruptibleBy.some((id) => typeof id !== 'string'))) throw new Error('invalid-input-settings-format');
    return {
      id: move.id,
      label: move.label,
      color: move.color,
      icon: typeof move.icon === 'string' ? move.icon : undefined,
      displayOnly: move.displayOnly === true,
      independent: move.independent,
      priority: move.priority,
      advancesStep: move.advancesStep,
      interruptibleBy: move.interruptibleBy
     };
   });

  const parseBindings = (source: KeyBinding[]): KeyBinding[] => source.map((value) => {
    const binding = value as Partial<KeyBinding> | null;
    if (!binding || typeof binding !== 'object' || typeof binding.moveId !== 'string' || !binding.moveId.trim() || !Array.isArray(binding.inputs)) throw new Error('invalid-input-settings-format');
    const inputs = binding.inputs.map((value) => {
      const input = value as Partial<KeyBinding['inputs'][number]> | null;
      if (!input || typeof input !== 'object' || typeof input.code !== 'string' || typeof input.label !== 'string') throw new Error('invalid-input-settings-format');
      return { code: normalizeInputCode(input.code), label: input.label  };
     }).filter((input) => input.code);
    return { moveId: binding.moveId, inputs  };
   });

  const preferences = record.preferences;
  if (!preferences || (preferences.inputMode !== 'keyboard' && preferences.inputMode !== 'gamepad') || (preferences.keyboardIconMode !== 'default' && preferences.keyboardIconMode !== 'actual') || (preferences.gamepadIconSet !== 'xbox' && preferences.gamepadIconSet !== 'playstation')) throw new Error('invalid-input-settings-format');
  return {
    kind: 'wwcombo-input-settings',
    schemaVersion: record.schemaVersion,
    exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : '',
    moves,
    keyboardMouseBindings: parseBindings(record.keyboardMouseBindings),
    gamepadBindings: parseBindings(record.gamepadBindings),
    shortcutSettings: record.shortcutSettings ? normalizeShortcutSettings(record.shortcutSettings) : undefined,
    preferences
   };
}

type CommunityTag = '\u8f6e\u6905' | '\u57fa\u7840' | '\u6807\u51c6' | '\u8fdb\u9636' | '\u5192\u70df' | '\u9519\u8f6e';
type CommunityShareDraft = Omit<ComboCommunityMetadata, 'exportedAt'>;

type OverlaySettings = {
  layout: ComboLayout;
  x: number;
  y: number;
  width: number;
  height: number;
 };
type OverlayBounds = Omit<OverlaySettings, 'layout'>;
type OverlayLayoutBounds = Record<ComboLayout, OverlayBounds>;
type OverlayBoundsTransition = { layout: ComboLayout; target: OverlayBounds; expiresAt: number  };
type RhythmUiSettings = { width: number; height: number; scale: number; laneGap: number; roleSpacing: number; fallSpeed: number; judgeLineOffset: number; ringStartScale: number; ringEndScale: number; ringOffsetX: number; ringOffsetY: number; ringDurationMs: number; feedbackX: number; feedbackY: number  };
type TimelineHistorySnapshot = { chart: ComboChart | null; contentLabels: Record<string, string>  };
type TimelineHistoryControl = { canUndo: boolean; canRedo: boolean; onCaptureHistory: () => void; onUndo: () => void; onRedo: () => void  };

const STORAGE_KEY = 'ww-combo-trainer-state-v2';
const APPEARANCE_MODE_STORAGE_KEY = 'ww-combo-trainer-appearance-mode-v1';
const OVERLAY_LAYOUT_PRESET_STORAGE_KEY = 'ww-combo-trainer-overlay-layout-presets-v1';
const FIRST_RUN_HELP_PROMPT_STORAGE_KEY = 'ww-combo-trainer-help-prompt-v1';
const MIN_EDITOR_DURATION = 35;
const TIMELINE_PLAYBACK_RATES = [1, 0.5, 0.2] as const;
const COMMUNITY_TAGS: CommunityTag[] = ['\u8f6e\u6905', '\u57fa\u7840', '\u6807\u51c6', '\u8fdb\u9636', '\u5192\u70df', '\u9519\u8f6e'];
const SWITCH_MOVE_PATTERN = /^switch_[123]$/;
const MAX_TIMELINE_HISTORY = 80;
const CHARACTER_SLOTS: CharacterSlot[] = [1, 2, 3];
const HORIZONTAL_OVERLAY_SIZE = { width: 2000, height: 249  };
const VERTICAL_OVERLAY_SIZE = { width: 648, height: 852  };
const WATERFALL_OVERLAY_SIZE = { width: 767, height: 977  };
const DEFAULT_OVERLAY_LAYOUT_BOUNDS: OverlayLayoutBounds = {
  horizontal: { x: 160, y: 36, ...HORIZONTAL_OVERLAY_SIZE  },
  vertical: { x: 160, y: 36, ...VERTICAL_OVERLAY_SIZE  },
  waterfall: { x: 280, y: 63, ...WATERFALL_OVERLAY_SIZE  }
 };
const DEFAULT_OVERLAY_SETTINGS: OverlaySettings = { layout: 'horizontal', ...DEFAULT_OVERLAY_LAYOUT_BOUNDS.horizontal  };
const DEFAULT_RHYTHM_UI: RhythmUiSettings = { width: 1739, height: 240, scale: 1, laneGap: 7, roleSpacing: 120, fallSpeed: 0.18, judgeLineOffset: 200, ringStartScale: 1.78, ringEndScale: 1.25, ringOffsetX: 0, ringOffsetY: -9, ringDurationMs: 420, feedbackX: 50, feedbackY: 64  };
const VERTICAL_STYLE_DEFAULTS: Partial<ComboImageStyle> = { blockMode: 'image', capsuleShape: 'capsule', imageBlockWidth: 200, imageBlockHeight: 55, capsuleWidthMode: 'auto', capsuleHeight: 80, capsuleGap: 95, fontSize: 22, avatarSize: 70, avatarOffsetX: -20, avatarOffsetY: 0, scrollAnchor: 'center', fadeEnabled: false, fadeRange: 30, convertIcons: true, prePromptEnabled: true, mergeSameRoleSteps: true, mergeSameRoleLimit: 6  };
const WATERFALL_STYLE_DEFAULTS: Partial<ComboImageStyle> = { blockMode: 'image', capsuleShape: 'rect', imageBlockWidth: 400, imageBlockHeight: 55, capsuleWidthMode: 'fixed', capsuleWidth: 78, capsuleHeight: 34, capsuleGap: 6, fontSize: 20, avatarSize: 58, avatarOffsetX: 0, avatarOffsetY: 0, scrollAnchor: 'center', fadeEnabled: false, fadeRange: 2, convertIcons: true, prePromptEnabled: true, mergeSameRoleSteps: false, mergeSameRoleLimit: 6  };
const LOCAL_STORAGE_SOFT_LIMIT = 4_200_000;
const REMOTE_CHARACTER_AVATAR_API = 'https://wuwa-hpyg-tool.200503.xyz/api/v1/batch-icons/character';
const REMOTE_AVATAR_DB_NAME = 'ww-combo-remote-avatar-cache-v1';
const REMOTE_AVATAR_STORE = 'avatars';
const REMOTE_AVATAR_MANIFEST_KEY = 'ww-combo-remote-avatar-manifest-v1';
const REMOTE_AVATAR_PLACEHOLDER = '/remote-avatar-placeholder.webp';
const DEFAULT_PROJECT_ASSET_API = import.meta.env.DEV
  ? 'http://127.0.0.1:9884/api/project-assets/v1/manifest.json'
  : 'https://nova.fb520.site/api/project-assets/v1/manifest.json';
const CONFIGURED_PROJECT_ASSET_API = String(import.meta.env.VITE_PROJECT_ASSET_API || '').trim().replace(/[\s'"‘’]+$/g, '');
const REMOTE_PROJECT_ASSET_API = /^https?:\/\//i.test(CONFIGURED_PROJECT_ASSET_API) ? CONFIGURED_PROJECT_ASSET_API : DEFAULT_PROJECT_ASSET_API;
const REMOTE_PROJECT_ASSET_DB_NAME = 'ww-combo-project-asset-cache-v1';
const REMOTE_PROJECT_ASSET_STORE = 'images';
const REMOTE_PROJECT_ASSET_MANIFEST_KEY = 'ww-combo-project-asset-manifest-v1';
const REMOTE_APP_RELEASE_API = new URL('app-release.json', REMOTE_PROJECT_ASSET_API).toString();
const PROJECT_ASSET_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const APP_RELEASE_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const DRAFT_MOVE_ID = '__draft__';
const DEFAULT_FREE_FIRE_DURATION = 15_000;
const DEFAULT_AXIS_DURATION = 25_000;
const AXIS_PLACEMENT_WINDOW = 30_000;
const HEAVY_ATTACK_HOLD_MS = 200;
const GAMEPAD_BUTTON_CODES = ['GamepadA', 'GamepadB', 'GamepadX', 'GamepadY', 'GamepadLB', 'GamepadRB', 'GamepadLT', 'GamepadRT', 'GamepadView', 'GamepadMenu', 'GamepadLeftStick', 'GamepadRightStick', 'GamepadDPadUp', 'GamepadDPadDown', 'GamepadDPadLeft', 'GamepadDPadRight'];
const GAMEPAD_COMBO_MODIFIER = 'GamepadLB';
const DEFAULT_EXPORT_DIRECTORY = '';
type ComboTrackMetric = { extent: number; start: number; center: number  };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
 }

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Number(value))) : fallback;
 }

function nowEventTime() {
  return performance.now();
 }

function createEmptySnapshot(): RecordingSnapshot {
  return { isRecording: false, startedAt: null, elapsed: 0, activeMain: null, activeIndependent: [], units: []  };
 }

function createEmptyPractice(): PracticeSnapshot {
  return { status: 'idle', startedAt: null, currentStepIndex: 0, feedback: [], completedStepIds: [], errorStepIds: []  };
 }

function previewPracticeAtTime(chart: ComboChart | null, timeMs: number): PracticeSnapshot {
  if (!chart?.steps.length) return createEmptyPractice();
  const elapsedMs = Math.max(0, Math.round(timeMs));
  const currentStepIndex = chart.steps.reduce((best, step, index) => elapsedMs >= step.startMin && step.startMin >= chart.steps[best].startMin ? index : best, 0);
  const completedStepIds = chart.steps.filter((step) => step.startMin + step.durationMax < elapsedMs).map((step) => step.id);
  return { status: 'idle', startedAt: null, elapsedMs, currentStepIndex, feedback: [], matchedStepIds: completedStepIds, completedStepIds, errorStepIds: []  };
 }

function normalizeMoves(moves: MoveDefinition[]): MoveDefinition[] {
  const map = new Map(moves.map((move) => [move.id, move]));
  for (const move of DEFAULT_MOVES) if (!map.has(move.id)) map.set(move.id, move);
  return [...map.values()].map((move) => move.id === 'basic_attack'
    ? { ...move, independent: false  }
    : move.id === 'empty_action'
      ? { ...move, displayOnly: true, independent: false, advancesStep: false  }
      : move);
 }

function normalizeBindings(bindings: KeyBinding[], defaults: KeyBinding[] = DEFAULT_BINDINGS): KeyBinding[] {
  const map = new Map(bindings.map((binding) => [binding.moveId, binding]));
  for (const binding of defaults) if (!map.has(binding.moveId)) map.set(binding.moveId, binding);
  return [...map.values()].map((binding) => ({
    moveId: binding.moveId,
    inputs: binding.inputs.map((input) => ({ ...input, code: normalizeInputCode(input.code)  }))
   }));
 }

function mergeRuntimeBindings(...bindingSets: KeyBinding[][]): KeyBinding[] {
  const merged = new Map<string, KeyBinding['inputs']>();
  for (const bindings of bindingSets) {
    for (const binding of bindings) {
      const inputs = merged.get(binding.moveId) ?? [];
      const knownCodes = new Set(inputs.map((input) => normalizeInputCode(input.code)));
      for (const input of binding.inputs) {
        const code = normalizeInputCode(input.code);
        if (!code || knownCodes.has(code)) continue;
        inputs.push({ ...input, code });
        knownCodes.add(code);
      }
      merged.set(binding.moveId, inputs);
    }
  }
  return [...merged.entries()].map(([moveId, inputs]) => ({ moveId, inputs }));
 }

function normalizeAvatarPresets(value: unknown): DefaultAvatarEntry[] {
  const objectValue = value as { avatars?: unknown[]; items?: unknown[]; data?: unknown[]  } | null;
  const source = Array.isArray(value) ? value : Array.isArray(objectValue?.avatars) ? objectValue.avatars : Array.isArray(objectValue?.items) ? objectValue.items : Array.isArray(objectValue?.data) ? objectValue.data : [];
  return source.flatMap((item) => {
    const entry = item as Partial<DefaultAvatarEntry> | null;
    if (!entry || typeof entry.name !== 'string' || typeof entry.src !== 'string') return [];
    return [{ name: normalizeCharacterName(entry.name), src: assetUrl(entry.src), remote: entry.remote === true  }];
   });
 }

function normalizeTeamPresets(value: unknown): TeamPresetEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const entry = item as Partial<TeamPresetEntry>;
    const characters = Array.isArray(entry.characters)
      ? Array.from(new Set(entry.characters.flatMap((name) => typeof name === 'string' && name.trim() ? [normalizeCharacterName(name)] : []))).slice(0, CHARACTER_SLOTS.length)
      : [];
    if (!characters.length) return [];
    return [{ id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `team_preset_${index }`, characters  }];
   });
 }

function normalizeBasePresets(value: unknown, baseUrl = window.location.href): DefaultBasePresetEntry[] {
  const objectValue = value as { items?: unknown[]; data?: unknown[]  } | null;
  const source = Array.isArray(value) ? value : Array.isArray(objectValue?.items) ? objectValue.items : Array.isArray(objectValue?.data) ? objectValue.data : [];
  return source.flatMap((item) => {
    const entry = item as Partial<DefaultBasePresetEntry> | null;
    if (!entry || typeof entry.name !== 'string' || typeof entry.src !== 'string') return [];
    return [{
      id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `base_${entry.name }`,
      name: normalizeCharacterName(entry.name),
      src: assetUrl(entry.src, baseUrl),
      imageWidth: typeof entry.imageWidth === 'number' ? entry.imageWidth : undefined,
      imageHeight: typeof entry.imageHeight === 'number' ? entry.imageHeight : undefined,
      crop: entry.crop,
      stretch: entry.stretch,
      edge: typeof entry.edge === 'number' ? entry.edge : 0,
      user: entry.user !== false
   }];
 });
 }

function normalizeProjectAssetManifest(value: unknown): ProjectAssetManifest | null {
  const record = value as Partial<ProjectAssetManifest> | null;
  if (!record || record.schemaVersion !== 1 || !Array.isArray(record.characters)) return null;
  const characters = record.characters.flatMap((item) => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string') return [];
    const sourceNames = item.names && typeof item.names === 'object' ? item.names : {};
    const names = Object.fromEntries((['zh-CN', 'en-US', 'ja-JP', 'ko-KR'] as AppLanguage[]).map((language) => [
      language,
      typeof sourceNames[language] === 'string' ? sourceNames[language]!.trim().slice(0, 80) : ''
    ])) as Record<AppLanguage, string>;
    const chinese = normalizeCharacterName(names['zh-CN']);
    if (!chinese) return [];
    const basePreset = item.basePreset && typeof item.basePreset === 'object' ? item.basePreset : null;
    return [{ id: item.id.trim(), names: { ...names, 'zh-CN': chinese  }, basePreset  }];
   });
  return {
    schemaVersion: 1,
    revision: Math.max(1, Math.round(Number(record.revision) || 1)),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
    characters
   };
 }

function projectManifestBasePresets(manifest: ProjectAssetManifest): DefaultBasePresetEntry[] {
  return normalizeBasePresets({ items: manifest.characters.flatMap((character) => character.basePreset ? [{
    ...character.basePreset,
    id: character.id,
    name: character.names['zh-CN'],
    user: false
   }] : [])  }, REMOTE_PROJECT_ASSET_API);
 }

function mergeDefaultBasePresets(local: DefaultBasePresetEntry[], remote: DefaultBasePresetEntry[]): DefaultBasePresetEntry[] {
  const remoteNames = new Set(remote.map((preset) => normalizeCharacterName(preset.name)));
  const remoteIds = new Set(remote.map((preset) => preset.id));
  return sortBasePresets([...local.filter((preset) => !remoteIds.has(preset.id) && !remoteNames.has(normalizeCharacterName(preset.name))), ...remote]);
 }
const BASE_PRESET_COLLATOR = new Intl.Collator('zh-CN-u-co-pinyin', { sensitivity: 'base', numeric: true  });
const CHARACTER_NAME_ALIASES: Record<string, string> = {
  '风主': '漂泊者·气动',
  '雷主': '漂泊者·导电',
  '暗主': '漂泊者·湮灭',
  '光主': '漂泊者·衍射',
  '卡提': '卡提希娅',
  '嘉贝丽娜': '嘉贝莉娜',
  '洛瑟拉': '洛瑟菈',
  '陆赫斯': '陆·赫斯',
  '玄翎': '秧秧·玄翎',
  '茜格莉卡': '西格莉卡'
};

function normalizeCharacterName(name: string): string {
  const normalized = name.replace(/\.(webp|png|jpe?g)$/i, '').trim();
  return CHARACTER_NAME_ALIASES[normalized] ?? normalized;
}

function avatarPresetSortName(name: string): string {
  const normalized = normalizeCharacterName(name);
  if (normalized === '长离') return '昌离';
  if (normalized === '仇远') return '秋远';
  if (normalized === '西格莉卡' || normalized === '茜格莉卡') return '希格莉卡';
  return normalized;
}

function sortAvatarPresets<T extends { name: string  }>(presets: T[]): T[] {
  return presets
    .map((preset, index) => ({ preset, index  }))
    .sort((left, right) => BASE_PRESET_COLLATOR.compare(avatarPresetSortName(left.preset.name), avatarPresetSortName(right.preset.name)) || left.index - right.index)
    .map(({ preset  }) => preset);
}

function basePresetSortName(name: string): string {
  const normalized = name.trim();
  if (normalized === '长离') return '昌离';
  if (normalized === '仇远') return '秋远';
  return normalized;
 }

function sortBasePresets(presets: DefaultBasePresetEntry[]): DefaultBasePresetEntry[] {
  return presets
    .map((preset, index) => ({ preset, index  }))
    .sort((left, right) => {
      const leftIsCommon = left.preset.name.trim() === '通用';
      const rightIsCommon = right.preset.name.trim() === '通用';
      if (leftIsCommon !== rightIsCommon) return leftIsCommon ? -1 : 1;
      const nameOrder = BASE_PRESET_COLLATOR.compare(basePresetSortName(left.preset.name), basePresetSortName(right.preset.name));
      if (nameOrder) return nameOrder;
      const idOrder = BASE_PRESET_COLLATOR.compare(left.preset.id, right.preset.id);
      return idOrder || left.index - right.index;
     })
    .map(({ preset  }) => preset);
 }

function remoteAvatarCacheKey(name: string, url: string): string {
  return `${name.trim()}::${url.trim()}`;
 }

function isRemoteAvatarPlaceholder(src: string): boolean {
  return src.split(/[?#]/, 1)[0].endsWith(REMOTE_AVATAR_PLACEHOLDER);
 }

function travelerFormKey(name: string): string | null {
  const normalized = name.trim();
  if (!normalized.includes('漂泊者')) return null;
  const form = normalized.split('·')[1]?.trim() || '默认';
  return form;
 }

function normalizeRemoteAvatarList(value: unknown): DefaultAvatarEntry[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value)
      : [];
  const travelerGroups = new Map<string, DefaultAvatarEntry[]>();
  const regularItems: DefaultAvatarEntry[] = [];
  const seen = new Set<string>();
  source.forEach((item) => {
    if (!Array.isArray(item) || typeof item[0] !== 'string') return;
    const name = normalizeCharacterName(item[0]);
    const remoteSrc = typeof item[1] === 'string' ? item[1].trim() : '';
    const src = /^https?:\/\//i.test(remoteSrc) ? remoteSrc : REMOTE_AVATAR_PLACEHOLDER;
    if (!name) return;
    const key = remoteAvatarCacheKey(name, src);
    if (seen.has(key)) return;
    seen.add(key);
    const entry = { name, src, remote: true  };
    const formKey = travelerFormKey(name);
    if (formKey) travelerGroups.set(formKey, [...(travelerGroups.get(formKey) ?? []), entry]);
    else regularItems.push(entry);
   });
  const travelerItems = Array.from(travelerGroups.values()).map((items) => items[0]).filter(Boolean);
  return sortAvatarPresets([...regularItems, ...travelerItems]);
 }

function openRemoteAvatarDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(REMOTE_AVATAR_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(REMOTE_AVATAR_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
   });
 }

function readRemoteAvatarCache(db: IDBDatabase, key: string): Promise<string | null> {
  return new Promise((resolve) => {
    const request = db.transaction(REMOTE_AVATAR_STORE, 'readonly').objectStore(REMOTE_AVATAR_STORE).get(key);
    request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null);
    request.onerror = () => resolve(null);
   });
 }

function writeRemoteAvatarCache(db: IDBDatabase, key: string, value: string): Promise<void> {
  return new Promise((resolve) => {
    const request = db.transaction(REMOTE_AVATAR_STORE, 'readwrite').objectStore(REMOTE_AVATAR_STORE).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
   });
 }

async function imageUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: 'force-cache'  });
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

async function fetchRemoteAvatarPresets(): Promise<DefaultAvatarEntry[]> {
  const db = await openRemoteAvatarDb();
  let payload: unknown;
  if (window.trainerDesktop?.fetchRemoteCharacterAvatars) payload = await window.trainerDesktop.fetchRemoteCharacterAvatars();
  else {
    const response = await fetch(REMOTE_CHARACTER_AVATAR_API, { cache: 'no-cache'  });
    if (!response.ok) return [];
    payload = await response.json();
  }
  const remoteItems = normalizeRemoteAvatarList(payload);
  if (!remoteItems.length) return [];
  try {
    localStorage.setItem(REMOTE_AVATAR_MANIFEST_KEY, JSON.stringify(remoteItems.map((item) => ({ name: item.name, src: item.src  }))));
   } catch {
    // Cache is opportunistic; presets still work without a stored manifest.
   }
  return Promise.all(remoteItems.map(async (preset) => {
    if (isRemoteAvatarPlaceholder(preset.src)) return preset;
    if (!db) return preset;
    const key = remoteAvatarCacheKey(preset.name, preset.src);
    const cached = await readRemoteAvatarCache(db, key);
    if (cached) return { ...preset, src: cached  };
    const dataUrl = await imageUrlToDataUrl(preset.src);
    if (!dataUrl) return { ...preset, src: REMOTE_AVATAR_PLACEHOLDER  };
    await writeRemoteAvatarCache(db, key, dataUrl);
    return { ...preset, src: dataUrl  };
   }));
 }

async function loadCachedRemoteAvatarPresets(): Promise<DefaultAvatarEntry[]> {
  let manifest: DefaultAvatarEntry[] = [];
  try {
    manifest = normalizeAvatarPresets(JSON.parse(localStorage.getItem(REMOTE_AVATAR_MANIFEST_KEY) ?? '[]')).map((item) => ({ ...item, remote: true  }));
   } catch {
    manifest = [];
   }
  if (!manifest.length) return [];
  const db = await openRemoteAvatarDb();
  if (!db) return manifest;
  const cachedItems = await Promise.all(manifest.map(async (preset) => {
    if (isRemoteAvatarPlaceholder(preset.src)) return preset;
    const cached = await readRemoteAvatarCache(db, remoteAvatarCacheKey(preset.name, preset.src));
    return cached ? { ...preset, src: cached  } : { ...preset, src: REMOTE_AVATAR_PLACEHOLDER  };
   }));
  return sortAvatarPresets(cachedItems);
 }

function openProjectAssetDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(REMOTE_PROJECT_ASSET_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(REMOTE_PROJECT_ASSET_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
   });
 }

function readProjectAssetImage(db: IDBDatabase, key: string): Promise<string | null> {
  return new Promise((resolve) => {
    const request = db.transaction(REMOTE_PROJECT_ASSET_STORE, 'readonly').objectStore(REMOTE_PROJECT_ASSET_STORE).get(key);
    request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null);
    request.onerror = () => resolve(null);
   });
 }

function writeProjectAssetImage(db: IDBDatabase, key: string, value: string): Promise<void> {
  return new Promise((resolve) => {
    const request = db.transaction(REMOTE_PROJECT_ASSET_STORE, 'readwrite').objectStore(REMOTE_PROJECT_ASSET_STORE).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
   });
 }

async function hydrateProjectBasePresets(manifest: ProjectAssetManifest, bundled: DefaultBasePresetEntry[], download: boolean): Promise<DefaultBasePresetEntry[]> {
  const remote = projectManifestBasePresets(manifest);
  const db = await openProjectAssetDb();
  const hydrated = await Promise.all(remote.map(async (preset) => {
    const fallback = bundled.find((item) => item.id === preset.id || normalizeCharacterName(item.name) === normalizeCharacterName(preset.name));
    if (!db) return download ? preset : fallback;
    const key = `${preset.id}::${preset.src }`;
    const cached = await readProjectAssetImage(db, key);
    if (cached) return { ...preset, src: cached  };
    if (!download) return fallback;
    const dataUrl = await imageUrlToDataUrl(preset.src);
    if (!dataUrl) return fallback;
    await writeProjectAssetImage(db, key, dataUrl);
    return { ...preset, src: dataUrl  };
   }));
  return hydrated.filter((preset): preset is DefaultBasePresetEntry => Boolean(preset));
 }

function loadCachedProjectAssetManifest(): ProjectAssetManifest | null {
  try {
    return normalizeProjectAssetManifest(JSON.parse(localStorage.getItem(REMOTE_PROJECT_ASSET_MANIFEST_KEY) ?? 'null'));
   } catch {
    return null;
   }
 }

async function fetchProjectAssetManifest(): Promise<ProjectAssetManifest | null> {
  const response = await fetch(REMOTE_PROJECT_ASSET_API, { cache: 'no-cache'  });
  if (!response.ok) return null;
  const manifest = normalizeProjectAssetManifest(await response.json());
  if (!manifest) return null;
  try {
    localStorage.setItem(REMOTE_PROJECT_ASSET_MANIFEST_KEY, JSON.stringify(manifest));
  } catch {
    // IndexedDB still keeps downloaded images when localStorage is unavailable.
   }
  return manifest;
 }

function normalizeAppRelease(value: unknown): AppReleaseManifest | null {
  const record = value as Partial<AppReleaseManifest> | null;
  if (!record || record.schemaVersion !== 1 || typeof record.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(record.version)) return null;
  const resolvedDownloadUrl = record.download && typeof record.download.url === 'string' && record.download.url.trim()
    ? assetUrl(record.download.url, REMOTE_APP_RELEASE_API)
    : '';
  const download = record.download && /^https?:\/\//i.test(resolvedDownloadUrl)
    ? { ...record.download, url: resolvedDownloadUrl  }
    : null;
  return {
    schemaVersion: 1,
    version: record.version,
    title: typeof record.title === 'string' ? record.title : '',
    notes: typeof record.notes === 'string' ? record.notes : '',
    publishedAt: typeof record.publishedAt === 'string' ? record.publishedAt : '',
    download
   };
 }

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference) return difference;
   }
  return 0;
 }

function assetUrl(path: string, baseUrl = window.location.href): string {
  if (/^(data:|blob:|https?:)/i.test(path)) return path;
  const clean = path.replace(/^\/+/, '');
  if (/^https?:/i.test(baseUrl)) return new URL(path, baseUrl).toString();
  return new URL(clean, baseUrl).toString();
 }

function defaultPeriodLabel(kind: ComboPeriodKind, loopIndex = 1): string {
  if (kind === 'draft_period') return '待设置时段';
  if (kind === 'startup_axis') return '启动轴';
  if (kind === 'loop_axis') return `循环轴${loopIndex }`;
  return '自由开火';
 }

function normalizePeriod(period: ComboPeriod): ComboPeriod {
  const startMs = clampNumber(period.startMs, 0, 10 * 60 * 1000, 0);
  const endMs = clampNumber(period.endMs, startMs + MIN_EDITOR_DURATION, 10 * 60 * 1000, startMs + 1000);
  const validKinds: ComboPeriodKind[] = ['draft_period', 'free_fire', 'startup_axis', 'loop_axis'];
  const kind: ComboPeriodKind = validKinds.includes(period.kind) ? period.kind : 'free_fire';
  const loopIndex = kind === 'loop_axis' ? Math.max(1, Math.round(period.loopIndex ?? 1)) : undefined;
  const label = period.label?.trim() || defaultPeriodLabel(kind, loopIndex);
  return { id: period.id || crypto.randomUUID(), kind, label, characterSlot: period.characterSlot, lane: period.lane, startMs, endMs, loopIndex  };
 }

function normalizePeriods(periods: ComboPeriod[] | undefined): ComboPeriod[] {
  if (!Array.isArray(periods)) return [];
  return periods.map((period) => normalizePeriod(period)).filter((period) => period.endMs > period.startMs);
 }

function constrainAxisPeriods(periods: ComboPeriod[]): ComboPeriod[] {
  const normalized = normalizePeriods(periods);
  const floating = normalized.filter((period) => period.kind === 'free_fire' || period.kind === 'draft_period');
  const startup = normalized.find((period) => period.kind === 'startup_axis');
  const loops = normalized.filter((period) => period.kind === 'loop_axis').sort((a, b) => a.startMs - b.startMs || (a.loopIndex ?? 0) - (b.loopIndex ?? 0));
  const axis: ComboPeriod[] = [];
  let cursor = 0;
  if (startup) {
    const length = Math.max(MIN_EDITOR_DURATION, startup.endMs - startup.startMs);
    axis.push(normalizePeriod({ ...startup, startMs: 0, endMs: length, label: defaultPeriodLabel('startup_axis')  }));
    cursor = length;
   }
  loops.forEach((period, index) => {
    const length = Math.max(MIN_EDITOR_DURATION, period.endMs - period.startMs);
    const loopIndex = index + 1;
    axis.push(normalizePeriod({ ...period, startMs: cursor, endMs: cursor + length, loopIndex, label: defaultPeriodLabel('loop_axis', loopIndex)  }));
    cursor += length;
   });
  return [...floating, ...axis].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
 }

function applyFreeFirePeriods(chart: ComboChart): ComboChart {
  const periods = constrainAxisPeriods(chart.periods ?? []);
  const freeRanges = periods.filter((period) => period.kind === 'free_fire');
  return {
    ...chart,
    periods,
    steps: chart.steps.map((step) => ({ ...step, free: Boolean(step.manualFree) || isStepInFreeFire(step, freeRanges)  }))
   };
 }

function isStepInFreeFire(step: ComboStep, freeRanges: ComboPeriod[]): boolean {
  const start = step.startMin;
  const end = step.startMin + step.durationMax;
  return freeRanges.some((period) => {
    const sameTime = end >= period.startMs && start <= period.endMs;
    const sameSlot = period.characterSlot === undefined || period.characterSlot === (step.characterSlot ?? 1);
    const sameLane = period.lane === undefined || period.lane === step.lane;
    return sameTime && sameSlot && sameLane;
   });
 }

function normalizeStep(step: ComboStep): ComboStep {
  const startMin = Math.max(0, Math.round(step.startMin));
  const startMax = Math.max(startMin, Math.round(step.startMax));
  const durationMin = Math.max(MIN_EDITOR_DURATION, Math.round(step.durationMin));
  const durationMax = Math.max(durationMin, Math.round(step.durationMax));
  const preheatMs = clamp(Math.round(step.preheatMs ?? 0), 0, durationMax - MIN_EDITOR_DURATION);
  const recoveryMs = clamp(Math.round(step.recoveryMs ?? 0), 0, durationMax - preheatMs - MIN_EDITOR_DURATION);
  const manualFree = Boolean(step.manualFree ?? step.free);
  if (step.moveId === 'basic_attack') return { ...step, independent: false, startMin, startMax, durationMin, durationMax, preheatMs, recoveryMs, manualFree, free: manualFree  };
  return { ...step, startMin, startMax, durationMin, durationMax, preheatMs, recoveryMs, manualFree, free: manualFree  };
 }

function createStepFromMove(move: MoveDefinition, startAt: number): ComboStep {
  return {
    id: crypto.randomUUID(),
    moveId: move.id,
    label: move.label,
    characterSlot: 1,
    lane: move.id === 'basic_attack' || move.independent ? 'independent' : 'main',
    independent: move.independent,
    startMin: Math.max(0, Math.round(startAt)),
    startMax: Math.max(0, Math.round(startAt + 120)),
    durationMin: 35,
    durationMax: 300,
    color: move.color,
    advancesStep: move.advancesStep,
    free: false,
    samples: []
   };
 }

function isReasonableChart(chart: ComboChart | null | undefined): chart is ComboChart {
  if (!chart || !Array.isArray(chart.steps)) return false;
  return chart.steps.every((step) => [step.startMin, step.startMax, step.durationMin, step.durationMax].every((value) => Number.isFinite(value) && value >= 0 && value < 10 * 60 * 1000));
 }

function normalizeChart(chart: ComboChart): ComboChart {
  const normalized = applyFreeFirePeriods({ ...chart, periods: constrainAxisPeriods(chart.periods ?? []), steps: chart.steps.map(normalizeStep)  });
  return { ...normalized, community: normalizeCommunityMetadata(chart.community, normalized)  };
 }
function normalizeCommunityTags(value: unknown, wheelchairEligible: boolean): CommunityTag[] {
  if (!Array.isArray(value)) return [];
  const normalized = value.map((tag) => tag === '\u5168\u5c40' ? '\u9519\u8f6e' : tag);
  return COMMUNITY_TAGS.filter((tag) => normalized.includes(tag) && (tag !== '\u8f6e\u6905' || wheelchairEligible));
 }

function communityCharacters(chart: ComboChart, style: ComboImageStyle): string[] {
  const usedSlots = Array.from(new Set(chart.steps.map((step) => (step.characterSlot ?? 1) as CharacterSlot))).sort((left, right) => left - right);
  return usedSlots.map((slot) => style.roleStyles[slot].name.trim() || `\u89d2\u8272${slot}`);
 }

function chartCharacterAssignments(chart: ComboChart): Partial<Record<CharacterSlot, string>> {
  const communityCharacters = chart.community?.characters?.map((name) => normalizeCharacterName(name)).filter(Boolean) ?? [];
  const legacyCharacters = chart.character?.split(/\s*(?:\/|,|，|、|\|)\s*/).map((name) => normalizeCharacterName(name)).filter(Boolean) ?? [];
  const characters = communityCharacters.length ? communityCharacters : legacyCharacters;
  if (!characters.length) return {};
  const usedSlots = Array.from(new Set(chart.steps.map((step) => (step.characterSlot ?? 1) as CharacterSlot))).sort((left, right) => left - right);
  const targetSlots = usedSlots.length ? usedSlots : [...CHARACTER_SLOTS];
  return Object.fromEntries(characters.slice(0, targetSlots.length).map((name, index) => [targetSlots[index], name])) as Partial<Record<CharacterSlot, string>>;
 }

function comparableAssetSource(source: string | undefined): string {
  if (!source || source.startsWith('data:')) return source ?? '';
  try {
    return decodeURIComponent(new URL(source, 'http://local.invalid').pathname).replace(/^\/+/, '').toLowerCase();
  } catch {
    return source.split(/[?#]/, 1)[0].replace(/^\/+/, '').toLowerCase();
  }
 }

function sameAssetSource(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  return comparableAssetSource(left) === comparableAssetSource(right);
 }

function roleBasePresetPatch(preset: DefaultBasePresetEntry): Partial<ComboImageStyle['roleStyles'][CharacterSlot]> {
  return {
    capsuleImage: preset.src,
    capsuleImageWidth: preset.imageWidth,
    capsuleImageHeight: preset.imageHeight,
    capsuleCrop: normalizeRectPercent(preset.crop, { x: 0, y: 0, w: 100, h: 100  }),
    capsuleStretch: preset.stretch ?? { left: 25, right: 75  },
    capsuleEdge: preset.edge ?? 0
   };
 }

function clearRoleBasePatch(): Partial<ComboImageStyle['roleStyles'][CharacterSlot]> {
  return {
    capsuleImage: undefined,
    capsuleImageWidth: undefined,
    capsuleImageHeight: undefined,
    capsuleCrop: undefined,
    capsuleStretch: undefined,
    capsuleEdge: undefined
   };
 }

function synchronizeStyleCharacters(
  current: ComboImageStyle,
  assignments: Partial<Record<CharacterSlot, string>>,
  avatarPresets: DefaultAvatarEntry[],
  basePresets: DefaultBasePresetEntry[],
  roleBaseFollowsAvatar: boolean
): ComboImageStyle {
  const availableAvatars: Array<DefaultAvatarEntry | ComboImageStyle['avatarPresets'][number]> = [...avatarPresets, ...current.avatarPresets];
  const availableBases = [...basePresets, ...current.basePresets];
  const roleStyles = { ...current.roleStyles  };
  let changed = false;

  CHARACTER_SLOTS.forEach((slot) => {
    const assignedName = assignments[slot];
    if (!assignedName) return;
    const normalizedName = normalizeCharacterName(assignedName);
    const role = current.roleStyles[slot];
    const previousName = normalizeCharacterName(role.name);
    if (previousName === normalizedName) return;

    const avatarPreset = availableAvatars.find((item) => normalizeCharacterName(item.name) === normalizedName);
    const nextCharacterBase = roleBaseFollowsAvatar && current.blockMode === 'image' ? availableBases.find((preset) => normalizeCharacterName(preset.name) === normalizedName) : undefined;
    const nextRole: ComboImageStyle['roleStyles'][CharacterSlot] = {
      ...role,
      name: normalizedName,
      avatar: avatarPreset?.src ?? REMOTE_AVATAR_PLACEHOLDER,
      avatarCrop: normalizeRectPercent(avatarPreset && 'crop' in avatarPreset ? avatarPreset.crop : undefined, { x: 0, y: 0, w: 100, h: 100  })
     };
    Object.assign(nextRole, nextCharacterBase ? roleBasePresetPatch(nextCharacterBase) : clearRoleBasePatch());
    roleStyles[slot] = nextRole;
    changed = true;
   });

  return changed ? normalizeComboImageStyle({ ...current, roleStyles  }) : current;
 }

function chartWithCurrentCharacters(chart: ComboChart, style: ComboImageStyle): ComboChart {
  const characters = communityCharacters(chart, style);
  return characters.length ? { ...chart, character: characters.join(' / ')  } : chart;
 }

function communityRoundCount(chart: ComboChart): number {
  const periods = constrainAxisPeriods(chart.periods ?? []);
  const loopCount = periods.filter((period) => period.kind === 'loop_axis').length;
  return 1 + loopCount;
 }

function isWheelchairEligible(chart: ComboChart): boolean {
  const loopPeriods = constrainAxisPeriods(chart.periods ?? []).filter((period) => period.kind === 'loop_axis');
  if (!loopPeriods.length) return false;
  return loopPeriods.every((period) => chart.steps.filter((step) => step.startMin >= period.startMs && step.startMin < period.endMs && SWITCH_MOVE_PATTERN.test(step.moveId)).length <= 3);
 }

function uniqueCommunityId(existingIds: Iterable<string>): string {
  const existing = new Set(existingIds);
  let id = '';
  do id = `wwc_${crypto.randomUUID()}`;
  while (existing.has(id));
  return id;
 }

function communityShareDraft(chart: ComboChart, style: ComboImageStyle, existingIds: Iterable<string>): CommunityShareDraft {
  const wheelchairEligible = isWheelchairEligible(chart);
  const previous = chart.community;
  const reservedIds = new Set(existingIds);
  const previousId = previous?.id?.trim() ?? '';
  const id = previousId && !reservedIds.has(previousId) ? previousId : uniqueCommunityId(reservedIds);
  return {
    id,
    name: previous?.name?.trim() || chart.title.trim() || '\u672a\u547d\u540d\u8fde\u6bb5',
    tags: normalizeCommunityTags(previous?.tags ?? chart.tags, wheelchairEligible),
    description: previous?.description ?? '',
    link: previous?.link ?? '',
    characters: communityCharacters(chart, style),
    rounds: communityRoundCount(chart),
    wheelchairEligible
   };
 }

function normalizeCommunityMetadata(value: unknown, chart: ComboChart): ComboCommunityMetadata | undefined {
  const record = value as Partial<ComboCommunityMetadata> | null;
  if (!record || typeof record !== 'object') return undefined;
  const wheelchairEligible = isWheelchairEligible(chart);
  const characters = Array.isArray(record.characters) ? record.characters.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()) : [];
  return {
    id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : uniqueCommunityId([]),
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : chart.title,
    tags: normalizeCommunityTags(record.tags, wheelchairEligible),
    description: typeof record.description === 'string' ? record.description : '',
    link: typeof record.link === 'string' ? record.link : '',
    characters,
    rounds: Number.isFinite(record.rounds) ? Math.max(1, Math.round(record.rounds!)) : communityRoundCount(chart),
    wheelchairEligible,
    exportedAt: Number.isFinite(record.exportedAt) ? Number(record.exportedAt) : Date.now()
   };
 }

function normalizeCharacterOrder(value: unknown): CharacterSlot[] {
  if (!Array.isArray(value)) return [...CHARACTER_SLOTS];
  const order = value.map(Number) as CharacterSlot[];
  if (order.length !== CHARACTER_SLOTS.length || new Set(order).size !== CHARACTER_SLOTS.length || order.some((slot) => !CHARACTER_SLOTS.includes(slot))) return [...CHARACTER_SLOTS];
  return order;
 }

function characterPositionMap(previousOrder: CharacterSlot[], nextOrder: CharacterSlot[]): CharacterSlotMap | null {
  const previous = normalizeCharacterOrder(previousOrder);
  const next = normalizeCharacterOrder(nextOrder);
  const result: CharacterSlotMap = { 1: 1, 2: 2, 3: 3  };
  for (const roleSlot of CHARACTER_SLOTS) {
    const previousPosition = (previous.indexOf(roleSlot) + 1) as CharacterSlot;
    const nextPosition = (next.indexOf(roleSlot) + 1) as CharacterSlot;
    if (!CHARACTER_SLOTS.includes(previousPosition) || !CHARACTER_SLOTS.includes(nextPosition)) return null;
    result[previousPosition] = nextPosition;
   }
  return result;
 }

function switchSlotFromMoveId(moveId: string): CharacterSlot | null {
  if (moveId === 'switch_1') return 1;
  if (moveId === 'switch_2') return 2;
  if (moveId === 'switch_3') return 3;
  return null;
 }

function switchIconText(slot: CharacterSlot): string {
  if (slot === 1) return 'i';
  if (slot === 2) return 'ii';
  return 'iii';
 }

function remapSwitchText(value: string, previousSlot: CharacterSlot, nextSlot: CharacterSlot): string {
  const trimmed = value.trim();
  if (trimmed === `切人${previousSlot }`) return `切人${nextSlot }`;
  if (trimmed === String(previousSlot)) return String(nextSlot);
  if (trimmed.toLowerCase() === switchIconText(previousSlot)) return switchIconText(nextSlot);
  return value;
 }

function remapChartSwitchTargets(chart: ComboChart, slotMap: CharacterSlotMap, updatedAt: number): ComboChart {
  return {
    ...chart,
    updatedAt,
    steps: chart.steps.map((step) => {
      const previousSlot = switchSlotFromMoveId(step.moveId);
      if (!previousSlot) return step;
      const nextSlot = slotMap[previousSlot];
      return {
        ...step,
        moveId: `switch_${nextSlot }`,
        label: remapSwitchText(step.label, previousSlot, nextSlot),
        note: step.note ? remapSwitchText(step.note, previousSlot, nextSlot) : step.note
       };
     })
   };
 }

function remapSwitchContentLabels(contentLabels: ComboImageStyle['contentLabels'], charts: ComboChart[], slotMap: CharacterSlotMap): ComboImageStyle['contentLabels'] {
  const next = { ...contentLabels  };
  for (const chart of charts) {
    for (const step of chart.steps) {
      const previousSlot = switchSlotFromMoveId(step.moveId);
      const value = next[step.id];
      if (!previousSlot || typeof value !== 'string') continue;
      next[step.id] = remapSwitchText(value, previousSlot, slotMap[previousSlot]);
     }
   }
  return next;
 }
function sortChartForPractice(chart: ComboChart | null): ComboChart | null {
  if (!chart) return null;
  const normalized = normalizeChart(chart);
  return {
    ...normalized,
    steps: [...normalized.steps].sort((a, b) => a.startMin - b.startMin || a.startMax - b.startMax || (a.characterSlot ?? 1) - (b.characterSlot ?? 1) || a.id.localeCompare(b.id))
   };
 }

function createChartFromRecording(snapshot: RecordingSnapshot, recorder: ComboRecorder, title = `录制连段 ${new Date().toLocaleTimeString() }`): ComboChart | null {
  if (!snapshot.units.length) return null;
  return normalizeChart(recorder.toChart(title));
 }

function normalizeOverlayBounds(value: unknown, fallback: OverlayBounds): OverlayBounds {
  const bounds = value as Partial<OverlayBounds> | null;
  return {
    x: clampNumber(bounds?.x, 0, 100000, fallback.x),
    y: clampNumber(bounds?.y, 0, 100000, fallback.y),
    width: clampNumber(bounds?.width, 1, 100000, fallback.width),
    height: clampNumber(bounds?.height, 1, 100000, fallback.height)
   };
 }

function overlayBoundsMatch(left: OverlayBounds, right: OverlayBounds, tolerance = 2): boolean {
  return Math.abs(left.x - right.x) <= tolerance
    && Math.abs(left.y - right.y) <= tolerance
    && Math.abs(left.width - right.width) <= tolerance
    && Math.abs(left.height - right.height) <= tolerance;
 }

function createDefaultWaterfallComboImageStyle(source?: Partial<ComboImageStyle> | null): ComboImageStyle {
  const base = normalizeComboImageStyle(source ?? createDefaultComboImageStyle());
  return normalizeComboImageStyle({ ...base, ...WATERFALL_STYLE_DEFAULTS, roleStyles: base.roleStyles, contentLabels: base.contentLabels, iconMappings: base.iconMappings, basePresets: base.basePresets, avatarPresets: base.avatarPresets  });
 }

function createDefaultVerticalComboImageStyle(source?: Partial<ComboImageStyle> | null): ComboImageStyle {
  const base = normalizeComboImageStyle(source ?? createDefaultComboImageStyle());
  return normalizeComboImageStyle({ ...base, ...VERTICAL_STYLE_DEFAULTS, roleStyles: base.roleStyles, contentLabels: base.contentLabels, iconMappings: base.iconMappings, basePresets: base.basePresets, avatarPresets: base.avatarPresets  });
 }

function normalizeWaterfallComboImageStyle(value: unknown, fallbackSource?: Partial<ComboImageStyle> | null): ComboImageStyle {
  const normalized = value ? normalizeComboImageStyle(value as Partial<ComboImageStyle>) : createDefaultWaterfallComboImageStyle(fallbackSource);
  return normalized.mergeSameRoleSteps ? normalizeComboImageStyle({ ...normalized, mergeSameRoleSteps: false  }) : normalized;
 }

function normalizeVerticalComboImageStyle(value: unknown, fallbackSource?: Partial<ComboImageStyle> | null): ComboImageStyle {
  return value ? normalizeComboImageStyle(value as Partial<ComboImageStyle>) : createDefaultVerticalComboImageStyle(fallbackSource);
 }

function normalizeRhythmUiSettings(value: unknown): RhythmUiSettings {
  const settings = value as Partial<RhythmUiSettings> | null;
  return {
    width: clampNumber(settings?.width, 120, 6000, DEFAULT_RHYTHM_UI.width),
    height: clampNumber(settings?.height, 120, 4000, DEFAULT_RHYTHM_UI.height),
    scale: clampNumber(settings?.scale, 0.3, 3, DEFAULT_RHYTHM_UI.scale),
    laneGap: clampNumber(settings?.laneGap, 0, 120, DEFAULT_RHYTHM_UI.laneGap),
    roleSpacing: clampNumber(settings?.roleSpacing, 24, 1200, DEFAULT_RHYTHM_UI.roleSpacing),
    fallSpeed: clampNumber(settings?.fallSpeed, 0.03, 2, DEFAULT_RHYTHM_UI.fallSpeed),
    judgeLineOffset: clampNumber(settings?.judgeLineOffset, 20, 2000, DEFAULT_RHYTHM_UI.judgeLineOffset),
    ringStartScale: clampNumber(settings?.ringStartScale, 0.2, 5, DEFAULT_RHYTHM_UI.ringStartScale),
    ringEndScale: clampNumber(settings?.ringEndScale, 0.2, 5, DEFAULT_RHYTHM_UI.ringEndScale),
    ringOffsetX: clampNumber(settings?.ringOffsetX, -1000, 1000, DEFAULT_RHYTHM_UI.ringOffsetX),
    ringOffsetY: clampNumber(settings?.ringOffsetY, -1000, 1000, DEFAULT_RHYTHM_UI.ringOffsetY),
    ringDurationMs: clampNumber(settings?.ringDurationMs, 80, 3000, DEFAULT_RHYTHM_UI.ringDurationMs),
    feedbackX: clampNumber(settings?.feedbackX, 0, 100, DEFAULT_RHYTHM_UI.feedbackX),
    feedbackY: clampNumber(settings?.feedbackY, 0, 100, DEFAULT_RHYTHM_UI.feedbackY)
   };
 }

function normalizeOverlayLayoutBounds(value: unknown, legacySettings?: unknown): OverlayLayoutBounds {
  const record = value as Partial<Record<ComboLayout, unknown>> | null;
  const legacy = legacySettings as Partial<OverlaySettings> | null;
  const legacyLayout: ComboLayout = legacy?.layout === 'vertical' ? 'vertical' : legacy?.layout === 'waterfall' ? 'waterfall' : 'horizontal';
  const defaults = DEFAULT_OVERLAY_LAYOUT_BOUNDS;
  return {
    horizontal: normalizeOverlayBounds(record?.horizontal ?? (legacyLayout === 'horizontal' ? legacy : null), defaults.horizontal),
    vertical: normalizeOverlayBounds(record?.vertical ?? (legacyLayout === 'vertical' ? legacy : null), defaults.vertical),
    waterfall: normalizeOverlayBounds(record?.waterfall ?? (legacyLayout === 'waterfall' ? legacy : null), defaults.waterfall)
   };
 }

function overlaySettingsForLayout(layout: ComboLayout, bounds: OverlayLayoutBounds): OverlaySettings {
  return { layout, ...bounds[layout]  };
 }

function loadSavedState() {
  const fallback = { moves: DEFAULT_MOVES, bindings: DEFAULT_BINDINGS, gamepadBindings: DEFAULT_GAMEPAD_BINDINGS, inputMode: 'keyboard' as InputMode, gamepadIconSet: 'xbox' as GamepadIconSet, keyboardIconMode: 'default' as KeyboardIconMode, shortcutSettings: DEFAULT_SHORTCUT_SETTINGS, chart: null as ComboChart | null, library: [] as ComboChart[], startingCharacterSlot: 1 as CharacterSlot, practiceRoleOrder: [...CHARACTER_SLOTS], overlaySettings: DEFAULT_OVERLAY_SETTINGS, overlayLayoutBounds: DEFAULT_OVERLAY_LAYOUT_BOUNDS, comboImageStyle: createDefaultComboImageStyle(), verticalComboImageStyle: createDefaultVerticalComboImageStyle(), waterfallComboImageStyle: createDefaultWaterfallComboImageStyle(), roleBaseFollowsAvatar: false, rhythmUiSettings: DEFAULT_RHYTHM_UI, axisGateEnabled: false, resetPracticeProgressOnStop: false, exportDirectory: DEFAULT_EXPORT_DIRECTORY, recordingIndicatorEnabled: true, recordingIndicatorCorner: 'bottom-left' as RecordingIndicatorCorner, live2dEnabled: true, teamPresets: [] as TeamPresetEntry[]  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const layout: ComboLayout = parsed.overlaySettings?.layout === 'vertical' ? 'vertical' : parsed.overlaySettings?.layout === 'waterfall' ? 'waterfall' : 'horizontal';
    const savedOverlayLayoutBounds = normalizeOverlayLayoutBounds(parsed.overlayLayoutBounds, parsed.overlaySettings);
    const overlayPresetsInitialized = localStorage.getItem(OVERLAY_LAYOUT_PRESET_STORAGE_KEY) === '1';
    const overlayLayoutBounds: OverlayLayoutBounds = overlayPresetsInitialized ? savedOverlayLayoutBounds : {
      ...savedOverlayLayoutBounds,
      horizontal: { ...DEFAULT_OVERLAY_LAYOUT_BOUNDS.horizontal  },
      waterfall: { ...DEFAULT_OVERLAY_LAYOUT_BOUNDS.waterfall  }
     };
    const comboImageStyle = normalizeComboImageStyle(parsed.comboImageStyle);
    return {
      moves: normalizeMoves(parsed.moves?.length ? parsed.moves : DEFAULT_MOVES),
      bindings: normalizeBindings(parsed.bindings?.length ? parsed.bindings : DEFAULT_BINDINGS),
      gamepadBindings: normalizeBindings(parsed.gamepadBindings?.length ? parsed.gamepadBindings : DEFAULT_GAMEPAD_BINDINGS, DEFAULT_GAMEPAD_BINDINGS),
      inputMode: parsed.inputMode === 'gamepad' ? 'gamepad' as InputMode : 'keyboard' as InputMode,
      gamepadIconSet: parsed.gamepadIconSet === 'playstation' ? 'playstation' as GamepadIconSet : 'xbox' as GamepadIconSet,
      keyboardIconMode: parsed.keyboardIconMode === 'actual' ? 'actual' as KeyboardIconMode : 'default' as KeyboardIconMode,
      shortcutSettings: normalizeShortcutSettings(parsed.shortcutSettings),
      chart: isReasonableChart(parsed.chart) ? normalizeChart(parsed.chart) : null,
      library: parsed.library?.filter(isReasonableChart).map(normalizeChart) ?? [],
      startingCharacterSlot: CHARACTER_SLOTS.includes(parsed.startingCharacterSlot ?? 1) ? parsed.startingCharacterSlot ?? 1 : 1,
      practiceRoleOrder: normalizeCharacterOrder(parsed.practiceRoleOrder),
      overlaySettings: overlaySettingsForLayout(layout, overlayLayoutBounds),
      overlayLayoutBounds,
      comboImageStyle,
      verticalComboImageStyle: normalizeVerticalComboImageStyle(parsed.verticalComboImageStyle, comboImageStyle),
      waterfallComboImageStyle: normalizeWaterfallComboImageStyle(parsed.waterfallComboImageStyle, comboImageStyle),
      roleBaseFollowsAvatar: parsed.roleBaseFollowsAvatar === true,
      rhythmUiSettings: normalizeRhythmUiSettings(parsed.rhythmUiSettings),
      axisGateEnabled: parsed.axisGateEnabled === true,
      resetPracticeProgressOnStop: parsed.resetPracticeProgressOnStop === true,
      exportDirectory: typeof parsed.exportDirectory === 'string' ? parsed.exportDirectory : DEFAULT_EXPORT_DIRECTORY,
      recordingIndicatorEnabled: parsed.recordingIndicatorEnabled !== false,
      recordingIndicatorCorner: ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(parsed.recordingIndicatorCorner) ? parsed.recordingIndicatorCorner as RecordingIndicatorCorner : 'bottom-left' as RecordingIndicatorCorner,
      live2dEnabled: parsed.live2dEnabled !== false,
      teamPresets: normalizeTeamPresets(parsed.teamPresets)
     };
   } catch {
    return fallback;
   }
 }

function upsertLibraryChart(library: ComboChart[], chart: ComboChart): ComboChart[] {
  const next = [chart, ...library.filter((item) => item.id !== chart.id)];
  return next.slice(0, 30);
 }

function currentPeriodLabel(chart: ComboChart | null, stepIndex: number, language: AppLanguage): string {
  if (!chart) return '';
  const step = chart.steps[Math.max(0, Math.min(stepIndex, Math.max(0, chart.steps.length - 1)))];
  const time = step?.startMin ?? 0;
  const period = normalizePeriods(chart.periods).filter((candidate) => candidate.kind !== 'free_fire' && time >= candidate.startMs && time <= candidate.endMs).sort((a, b) => a.startMs - b.startMs)[0];
  if (!period) return '';
  return language === 'zh-CN' ? `当前：${period.label }` : localizeEnglish(`Current: ${period.label }`, language);
 }

function bindingCodesForMove(bindings: KeyBinding[], moveId: string): string[] {
  return bindings.find((binding) => binding.moveId === moveId)?.inputs.map((input) => normalizeInputCode(input.code)) ?? [];
 }

function holdBindingPairs(bindings: KeyBinding[]): Map<string, string> {
  const pairs = new Map<string, string>();
  const movePairs = [
    ['basic_attack', 'heavy_attack'],
    ['skill', 'skill_hold'],
    ['echo', 'echo_hold'],
    ['liberation', 'liberation_hold'],
    ['dodge', 'dodge_hold'],
    ['jump', 'jump_hold']
  ] as const;
  for (const [sourceMoveId, holdMoveId] of movePairs) {
    const sourceCodes = bindingCodesForMove(bindings, sourceMoveId);
    const holdCodes = bindingCodesForMove(bindings, holdMoveId);
    sourceCodes.forEach((sourceCode, index) => {
      const matchingHoldCode = holdCodes.find((holdCode) => holdCode === `${sourceCode}Hold`) ?? holdCodes[index] ?? holdCodes[0];
      if (sourceCode && matchingHoldCode) pairs.set(sourceCode, matchingHoldCode);
    });
  }
  return pairs;
 }

function isGamepadEvent(event: TrainerLikeInputEvent): boolean {
  return event.type === 'gamepadbuttondown' || event.type === 'gamepadbuttonup';
 }

function gamepadButtonCode(index: number): string {
  return GAMEPAD_BUTTON_CODES[index] ?? `GamepadButton${index }`;
 }

function readPressedGamepadCodes(): Set<string> {
  const current = new Set<string>();
  const pads = navigator.getGamepads?.() ?? [];
  for (const pad of pads) {
    if (!pad) continue;
    pad.buttons.forEach((button, index) => {
      if (button.pressed) current.add(gamepadButtonCode(index));
     });
   }
  return current;
 }

function loadAppearanceMode(): AppearanceMode {
  try {
    const stored = localStorage.getItem(APPEARANCE_MODE_STORAGE_KEY);
    if (stored === 'day2') return 'night2';
    return stored === 'day' || stored === 'night2' ? stored : 'night';
  } catch {
    return 'night';
  }
 }

function loadFirstRunHelpPrompted(): boolean {
  try {
    return localStorage.getItem(FIRST_RUN_HELP_PROMPT_STORAGE_KEY) === '1';
   } catch {
    return false;
   }
 }

function persistFirstRunHelpPrompted() {
  try {
    localStorage.setItem(FIRST_RUN_HELP_PROMPT_STORAGE_KEY, '1');
   } catch {
    // Keep the prompt dismissed for this session when persistent storage is unavailable.
   }
 }

function isPressEvent(event: TrainerLikeInputEvent): boolean {
  return event.type === 'keydown' || event.type === 'mousedown' || event.type === 'gamepadbuttondown';
 }

function isReleaseEvent(event: TrainerLikeInputEvent): boolean {
  return event.type === 'keyup' || event.type === 'mouseup' || event.type === 'gamepadbuttonup';
 }

function isPracticeUiControl(target: HTMLElement | null): boolean {
  return Boolean(target?.closest('button, input, textarea, select, label, a, [role="button"], [contenteditable="true"], [data-practice-input-block="true"]'));
 }

function isEditableBrowserTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
 }

function shouldPreventBrowserKeyDefault(event: KeyboardEvent): boolean {
  const code = normalizeInputCode(event.code);
  const commandModifier = event.ctrlKey || event.metaKey;
  if (commandModifier) {
    if (['KeyF', 'KeyL', 'KeyN', 'KeyO', 'KeyP', 'KeyR', 'KeyS', 'KeyT', 'KeyU', 'KeyW', 'Equal', 'Minus', 'Digit0', 'Tab'].includes(code)) return true;
    if (event.shiftKey && (code === 'KeyI' || code === 'KeyJ')) return true;
  }
  if (event.altKey && (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'Home')) return true;
  if (code === 'F5' || code === 'F11' || code === 'F12' || code === 'ContextMenu') return true;
  if (isEditableBrowserTarget(event.target)) return false;
  if (code === 'Space') {
    const element = event.target as HTMLElement | null;
    return !element?.closest('button, [role="button"]');
  }
  return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Backspace'].includes(code);
 }

type TrainerLikeInputEvent = { type: 'keydown' | 'keyup' | 'mousedown' | 'mouseup' | 'gamepadbuttondown' | 'gamepadbuttonup'; code: string; time: number; source?: 'dom' | 'desktop' | 'gamepad'; shiftKey?: boolean  };

export default function App() {
  const { language, text  } = useI18n();
  const saved = useMemo(loadSavedState, []);
  const desktop = useMemo(() => createDesktopBridge(), []);
  const getDisplaySize = useMemo(() => desktop?.getDisplaySize ? () => desktop.getDisplaySize!() : undefined, [desktop]);
  const [page, setPage] = useState<Page>('home');
  const [settingsView, setSettingsView] = useState<SettingsView>('settings');
  const [helpTab, setHelpTab] = useState<HelpTab>('learner');
  const [firstRunHelpPromptOpen, setFirstRunHelpPromptOpen] = useState(false);
  const firstRunHelpPromptedRef = useRef(loadFirstRunHelpPrompted());
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(loadAppearanceMode);
  const [experimentPage, setExperimentPage] = useState<ExperimentPage>('home');
  const [experimentOpenedFromHome, setExperimentOpenedFromHome] = useState(false);
  const [moves, setMoves] = useState<MoveDefinition[]>(saved.moves);
  const [bindings, setBindings] = useState<KeyBinding[]>(saved.bindings);
  const [gamepadBindings, setGamepadBindings] = useState<KeyBinding[]>(saved.gamepadBindings ?? DEFAULT_GAMEPAD_BINDINGS);
  const [inputMode, setInputMode] = useState<InputMode>(saved.inputMode ?? 'keyboard');
  const [gamepadIconSet, setGamepadIconSet] = useState<GamepadIconSet>(saved.gamepadIconSet ?? 'xbox');
  const [keyboardIconMode, setKeyboardIconMode] = useState<KeyboardIconMode>(saved.keyboardIconMode ?? 'default');
  const [shortcutSettings, setShortcutSettings] = useState<ShortcutSettings>(saved.shortcutSettings ?? DEFAULT_SHORTCUT_SETTINGS);
  const [chart, setChart] = useState<ComboChart | null>(saved.chart);
  const [library, setLibrary] = useState<ComboChart[]>(saved.library);
  const [startingCharacterSlot, setStartingCharacterSlot] = useState<CharacterSlot>(saved.startingCharacterSlot);
  const [practiceRoleOrder, setPracticeRoleOrder] = useState<CharacterSlot[]>(saved.practiceRoleOrder);
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>(saved.overlaySettings);
  const [overlayLayoutBounds, setOverlayLayoutBounds] = useState<OverlayLayoutBounds>(saved.overlayLayoutBounds);
  const [comboImageStyle, setComboImageStyle] = useState<ComboImageStyle>(saved.comboImageStyle);
  const [verticalComboImageStyle, setVerticalComboImageStyle] = useState<ComboImageStyle>(saved.verticalComboImageStyle);
  const [waterfallComboImageStyle, setWaterfallComboImageStyle] = useState<ComboImageStyle>(saved.waterfallComboImageStyle);
  const [roleBaseFollowsAvatar, setRoleBaseFollowsAvatar] = useState(saved.roleBaseFollowsAvatar);
  const [rhythmUiSettings, setRhythmUiSettings] = useState<RhythmUiSettings>(saved.rhythmUiSettings);
  const [editorTab, setEditorTab] = useState<EditorTab>('timeline');
  const [snapshot, setSnapshot] = useState<RecordingSnapshot>(createEmptySnapshot);
  const [debugSnapshot, setDebugSnapshot] = useState<RecordingSnapshot | null>(null);
  const [debugMessage, setDebugMessage] = useState(() => localizedMessage('开始录制前，请先开启左侧的“全局捕获”。', 'Before recording, enable Global Input Capture in the sidebar.'));
  const [globalInputEnabled, setGlobalInputEnabled] = useState(false);
  const [globalInputStatus, setGlobalInputStatus] = useState(() => localizedMessage('窗口内监听', 'In-window input'));
  const [practicePreset, setPracticePreset] = useState<PracticePreset>('simple');
  const [practice, setPractice] = useState<PracticeSnapshot>(createEmptyPractice);
  const [axisGateEnabled, setAxisGateEnabled] = useState(saved.axisGateEnabled);
  const [resetPracticeProgressOnStop, setResetPracticeProgressOnStop] = useState(saved.resetPracticeProgressOnStop);
  const [exportDirectory, setExportDirectory] = useState(saved.exportDirectory);
  const [recordingIndicatorEnabled, setRecordingIndicatorEnabled] = useState(saved.recordingIndicatorEnabled);
  const [recordingIndicatorCorner, setRecordingIndicatorCorner] = useState<RecordingIndicatorCorner>(saved.recordingIndicatorCorner);
  const [live2dEnabled, setLive2dEnabled] = useState(saved.live2dEnabled);
  const [teamPresets, setTeamPresets] = useState<TeamPresetEntry[]>(saved.teamPresets);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayMoveMode, setOverlayMoveMode] = useState(false);
  const [chartTitle, setChartTitle] = useState(chart?.title ?? '');
  const [quickInputOpen, setQuickInputOpen] = useState(false);
  const [quickInputStartStepId, setQuickInputStartStepId] = useState<string | null>(null);
  const [quickInputMemory, setQuickInputMemory] = useState<string[]>([]);
  const [videoWorkbenchOpen, setVideoWorkbenchOpen] = useState(false);
  const [videoWorkbenchMounted, setVideoWorkbenchMounted] = useState(false);
  const [experimentInputSignal, setExperimentInputSignal] = useState<(TrainerLikeInputEvent & { id: string  }) | null>(null);
  const [timelinePlacementInputSignal, setTimelinePlacementInputSignal] = useState<(TrainerLikeInputEvent & { id: string  }) | null>(null);
  const [keyMappingInputSignal, setKeyMappingInputSignal] = useState<(TrainerLikeInputEvent & { id: string  }) | null>(null);
  const [keyMappingVisible, setKeyMappingVisible] = useState(false);
  const [keyMappingPressedCodes, setKeyMappingPressedCodes] = useState<string[]>([]);
  const [editorZoom, setEditorZoom] = useState(0.46);
  const [editorPlaybackMs, setEditorPlaybackMs] = useState(0);
  const [editorPlaying, setEditorPlaying] = useState(false);
  const [editorPlaybackRate, setEditorPlaybackRate] = useState<(typeof TIMELINE_PLAYBACK_RATES)[number]>(1);
  const [editorAutoFollow, setEditorAutoFollow] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<AppReleaseManifest | null>(null);
  const [defaultAvatars, setDefaultAvatars] = useState<DefaultAvatarEntry[]>([]);
  const [defaultBasePresets, setDefaultBasePresets] = useState<DefaultBasePresetEntry[]>([]);
  const [timelineUndoStack, setTimelineUndoStack] = useState<TimelineHistorySnapshot[]>([]);
  const [shareDraft, setShareDraft] = useState<CommunityShareDraft | null>(null);
  const [timelineRedoStack, setTimelineRedoStack] = useState<TimelineHistorySnapshot[]>([]);

  const overlaySettingsRef = useRef(saved.overlaySettings);
  const overlayBoundsTransitionRef = useRef<OverlayBoundsTransition | null>(null);
  const activeBindings = inputMode === 'gamepad' ? gamepadBindings : bindings;
  const runtimeBindings = useMemo(() => mergeRuntimeBindings(bindings, gamepadBindings), [bindings, gamepadBindings]);
  const recorderRef = useRef(new ComboRecorder({ moves, bindings: runtimeBindings, startTriggerMoveId: 'start_challenge', stopTriggerMoveId: 'stop_recording', startingCharacterSlot  }));
  const practiceRef = useRef<PracticeSession | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRefs = useRef<Record<number, HTMLInputElement | null>>({ });
  const holdPressRef = useRef(new Map<string, { pressEvent: TrainerLikeInputEvent; holdCode: string; timer: number | null; holdTriggered: boolean  }>());
  const shareDialogOpenRef = useRef(Boolean(shareDraft));
  const resetPracticeProgressOnStopRef = useRef(resetPracticeProgressOnStop);
  const practiceInputSuppressedUntilRef = useRef(0);
  const recentInputTransitionsRef = useRef(new Map<string, { source: NonNullable<TrainerLikeInputEvent['source']>; receivedAt: number  }>());
  const toastTimerRef = useRef<number | null>(null);
  const dismissedUpdateVersionRef = useRef<string | null>(null);
  const chartRef = useRef<ComboChart | null>(chart);
  const comboImageStyleRef = useRef(comboImageStyle);
  shareDialogOpenRef.current = Boolean(shareDraft);
  resetPracticeProgressOnStopRef.current = resetPracticeProgressOnStop;

  const practiceChart = useMemo(() => sortChartForPractice(chart), [chart]);
  const displayComboImageStyle = useMemo(() => inputMode === 'gamepad' ? withGamepadIconMappings(comboImageStyle, gamepadBindings, gamepadIconSet) : keyboardIconMode === 'actual' ? withKeyboardMouseIconMappings(comboImageStyle, bindings) : comboImageStyle, [bindings, comboImageStyle, gamepadBindings, gamepadIconSet, inputMode, keyboardIconMode]);
  const displayVerticalComboImageStyle = useMemo(() => inputMode === 'gamepad' ? withGamepadIconMappings(verticalComboImageStyle, gamepadBindings, gamepadIconSet) : keyboardIconMode === 'actual' ? withKeyboardMouseIconMappings(verticalComboImageStyle, bindings) : verticalComboImageStyle, [bindings, gamepadBindings, gamepadIconSet, inputMode, keyboardIconMode, verticalComboImageStyle]);
  const displayWaterfallComboImageStyle = useMemo(() => inputMode === 'gamepad' ? withGamepadIconMappings(waterfallComboImageStyle, gamepadBindings, gamepadIconSet) : keyboardIconMode === 'actual' ? withKeyboardMouseIconMappings(waterfallComboImageStyle, bindings) : waterfallComboImageStyle, [bindings, gamepadBindings, gamepadIconSet, inputMode, keyboardIconMode, waterfallComboImageStyle]);
  const activeOverlayComboImageStyle = useMemo(
    () => overlaySettings.layout === 'waterfall' ? displayWaterfallComboImageStyle : overlaySettings.layout === 'vertical' ? displayVerticalComboImageStyle : displayComboImageStyle,
    [displayComboImageStyle, displayVerticalComboImageStyle, displayWaterfallComboImageStyle, overlaySettings.layout]
  );
  const activeRenderComboImageStyle = useMemo(() => effectiveComboImageStyle(activeOverlayComboImageStyle), [activeOverlayComboImageStyle]);
  const appearanceComboImageStyle = overlaySettings.layout === 'waterfall' ? waterfallComboImageStyle : overlaySettings.layout === 'vertical' ? verticalComboImageStyle : comboImageStyle;
  const activeStep = practiceChart?.steps[practice.currentStepIndex] ?? null;
  const editorPreviewPractice = useMemo(() => previewPracticeAtTime(chart, editorPlaybackMs), [chart, editorPlaybackMs]);
  const editorPlaybackDurationMs = useMemo(() => chart ? Math.max(0, ...chart.steps.map((step) => Math.max(step.startMin, step.startMax) + step.durationMax), ...(chart.periods ?? []).map((period) => period.endMs)) : 0, [chart]);
  const practiceSettings = useMemo(() => ({ ...(practicePreset === 'strict' ? STRICT_PRACTICE : practicePreset === 'lenient' ? LENIENT_PRACTICE : SIMPLE_PRACTICE), axisGateEnabled  }), [practicePreset, axisGateEnabled]);
  const holdBindings = useMemo(() => holdBindingPairs(runtimeBindings), [runtimeBindings]);
  const keyboardMouseInputSignal = experimentInputSignal && !isGamepadEvent(experimentInputSignal) ? experimentInputSignal as typeof experimentInputSignal & { type: 'keydown' | 'keyup' | 'mousedown' | 'mouseup'  } : null;

  useEffect(() => {
    const preventBrowserKeyboardAction = (event: KeyboardEvent) => {
      if (shouldPreventBrowserKeyDefault(event)) event.preventDefault();
     };
    const preventNativeContextMenu = (event: MouseEvent) => event.preventDefault();
    const preventNativeDrag = (event: DragEvent) => event.preventDefault();
    const preventMiddleButtonDefault = (event: MouseEvent) => {
      if (event.button === 1) event.preventDefault();
     };
    const preventBrowserZoom = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
     };
    window.addEventListener('keydown', preventBrowserKeyboardAction, true);
    window.addEventListener('contextmenu', preventNativeContextMenu, true);
    window.addEventListener('dragstart', preventNativeDrag, true);
    window.addEventListener('mousedown', preventMiddleButtonDefault, true);
    window.addEventListener('wheel', preventBrowserZoom, { capture: true, passive: false  });
    return () => {
      window.removeEventListener('keydown', preventBrowserKeyboardAction, true);
      window.removeEventListener('contextmenu', preventNativeContextMenu, true);
      window.removeEventListener('dragstart', preventNativeDrag, true);
      window.removeEventListener('mousedown', preventMiddleButtonDefault, true);
      window.removeEventListener('wheel', preventBrowserZoom, true);
     };
   }, []);

  useEffect(() => {
    overlaySettingsRef.current = overlaySettings;
   }, [overlaySettings]);

  useEffect(() => {
    try {
      localStorage.setItem(OVERLAY_LAYOUT_PRESET_STORAGE_KEY, '1');
     } catch {
      // The layout still works for this session when storage is unavailable.
     }
    void applyOverlayBounds(overlaySettingsRef.current);
   }, [desktop]);
  useEffect(() => {
    const isDay = appearanceMode === 'day';
    const visualTheme = isDay ? 'day' : 'night';
    document.documentElement.dataset.theme = visualTheme;
    document.body.dataset.theme = visualTheme;
    document.body.dataset.appearanceMode = appearanceMode;
    document.body.classList.toggle('theme-day', isDay && !videoWorkbenchOpen);
    try {
      localStorage.setItem(APPEARANCE_MODE_STORAGE_KEY, appearanceMode);
    } catch {
      // The selected appearance still works for this session when storage is unavailable.
    }
  }, [appearanceMode, videoWorkbenchOpen]);
  useEffect(() => { chartRef.current = chart;  }, [chart]);
  useEffect(() => { comboImageStyleRef.current = comboImageStyle;  }, [comboImageStyle]);

  useEffect(() => {
    recorderRef.current = new ComboRecorder({ moves, bindings: runtimeBindings, startTriggerMoveId: 'start_challenge', stopTriggerMoveId: 'stop_recording', startingCharacterSlot  });
   }, [moves, runtimeBindings, startingCharacterSlot]);

  useEffect(() => {
    if (!practiceChart) {
      practiceRef.current = null;
      setPractice(createEmptyPractice());
      return;
     }
    practiceRef.current = new PracticeSession(practiceChart, moves, runtimeBindings, practiceSettings);
    setPractice(createEmptyPractice());
   }, [practiceChart, moves, runtimeBindings, practiceSettings]);

  useEffect(() => {
    if (page === 'practice' && shareDraft) clearBasicAttackHoldState();
   }, [page, Boolean(shareDraft)]);

  useEffect(() => {
    const payload = JSON.stringify({ moves, bindings, gamepadBindings, inputMode, gamepadIconSet, keyboardIconMode, shortcutSettings, chart, library, startingCharacterSlot, practiceRoleOrder, overlaySettings, overlayLayoutBounds, comboImageStyle, verticalComboImageStyle, waterfallComboImageStyle, roleBaseFollowsAvatar, rhythmUiSettings, axisGateEnabled, resetPracticeProgressOnStop, exportDirectory, recordingIndicatorEnabled, recordingIndicatorCorner, live2dEnabled, teamPresets  });
    if (payload.length < LOCAL_STORAGE_SOFT_LIMIT) localStorage.setItem(STORAGE_KEY, payload);
   }, [moves, bindings, gamepadBindings, inputMode, gamepadIconSet, keyboardIconMode, shortcutSettings, chart, library, startingCharacterSlot, practiceRoleOrder, overlaySettings, overlayLayoutBounds, comboImageStyle, verticalComboImageStyle, waterfallComboImageStyle, roleBaseFollowsAvatar, rhythmUiSettings, axisGateEnabled, resetPracticeProgressOnStop, exportDirectory, recordingIndicatorEnabled, recordingIndicatorCorner, live2dEnabled, teamPresets]);

  useEffect(() => setChartTitle(chart?.title ?? ''), [chart?.id]);
  useEffect(() => {
    setTimelineUndoStack([]);
    setTimelineRedoStack([]);
   }, [chart?.id]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (page !== 'record' || videoWorkbenchOpen || !(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoTimeline();
       } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        redoTimeline();
       }
     };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
   }, [page, videoWorkbenchOpen, timelineUndoStack, timelineRedoStack]);
  useEffect(() => {
    setEditorPlaying(false);
    setEditorPlaybackMs(0);
   }, [chart?.id]);

  useEffect(() => {
    setEditorPlaybackMs((current) => clamp(current, 0, editorPlaybackDurationMs));
   }, [editorPlaybackDurationMs]);

  useEffect(() => {
    if (page !== 'record' || videoWorkbenchOpen) setEditorPlaying(false);
   }, [page, videoWorkbenchOpen]);

  useEffect(() => {
    if (!editorPlaying || editorPlaybackDurationMs <= 0) return;
    let frameId = 0;
    let previousTime = performance.now();
    const tick = (time: number) => {
      const delta = clamp(time - previousTime, 0, 100);
      previousTime = time;
      setEditorPlaybackMs((current) => Math.min(editorPlaybackDurationMs, current + delta * editorPlaybackRate));
      frameId = window.requestAnimationFrame(tick);
     };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
   }, [editorPlaying, editorPlaybackDurationMs, editorPlaybackRate]);

  useEffect(() => {
    if (editorPlaying && editorPlaybackMs >= editorPlaybackDurationMs) setEditorPlaying(false);
   }, [editorPlaying, editorPlaybackMs, editorPlaybackDurationMs]);

  function toggleEditorPlayback() {
    if (editorPlaybackDurationMs <= 0) return;
    if (editorPlaying) {
      setEditorPlaying(false);
      return;
    }
    if (editorPlaybackMs >= editorPlaybackDurationMs) setEditorPlaybackMs(0);
    setEditorPlaying(true);
   }

  useEffect(() => {
    let cancelled = false;
    const applyRemoteAvatars = (items: DefaultAvatarEntry[]) => {
      const avatars = sortAvatarPresets(items);
      setDefaultAvatars(avatars);
      const avatarByName = new Map(avatars.map((item) => [item.name.trim(), item]));
      const migrateStyle = (current: ComboImageStyle) => normalizeComboImageStyle({
        ...current,
        roleStyles: Object.fromEntries(CHARACTER_SLOTS.map((slot) => {
          const role = current.roleStyles[slot];
          const name = normalizeCharacterName(role.name);
          const apiAvatar = avatarByName.get(name);
          const usesReplaceableAvatar = Boolean(role.avatar && (role.avatar.includes('/combo-assets/default-avatars/') || isRemoteAvatarPlaceholder(role.avatar)));
          return [slot, { ...role, name, ...(apiAvatar && (usesReplaceableAvatar || !role.avatar) ? { avatar: apiAvatar.src, avatarCrop: { x: 0, y: 0, w: 100, h: 100  } } : { })  }];
        })) as ComboImageStyle['roleStyles'],
        avatarPresets: current.avatarPresets
          .map((preset) => ({ ...preset, name: normalizeCharacterName(preset.name)  }))
          .filter((preset) => !preset.src.includes('/combo-assets/default-avatars/'))
      });
      setComboImageStyle(migrateStyle);
      setVerticalComboImageStyle(migrateStyle);
      setWaterfallComboImageStyle((current) => normalizeWaterfallComboImageStyle(migrateStyle(current), current));
    };
    const load = async () => {
      const cachedRemote = await loadCachedRemoteAvatarPresets();
      if (!cancelled && cachedRemote.length) applyRemoteAvatars(cachedRemote);
      try {
        const remoteItems = await fetchRemoteAvatarPresets();
        if (!cancelled && remoteItems.length) applyRemoteAvatars(remoteItems);
       } catch {
        // Keep the last cached API manifest when the network is temporarily unavailable.
       }
     };
    void load();
    return () => { cancelled = true;  };
   }, []);

  useEffect(() => {
    let cancelled = false;
    let bundled: DefaultBasePresetEntry[] = [];
    let appliedRevision = 0;
    let appliedUpdatedAt = '';
    let lastRefreshAt = 0;
    let refreshInFlight: Promise<void> | null = null;

    const applyManifest = async (manifest: ProjectAssetManifest, downloadImages: boolean) => {
      if (cancelled) return;
      setRemoteCharacterNames(manifest.characters);
      appliedRevision = manifest.revision;
      appliedUpdatedAt = manifest.updatedAt;
      const presets = await hydrateProjectBasePresets(manifest, bundled, downloadImages);
      if (!cancelled) setDefaultBasePresets(mergeDefaultBasePresets(bundled, presets));
     };

    const refresh = (force = false) => {
      const now = Date.now();
      if (!force && now - lastRefreshAt < PROJECT_ASSET_REFRESH_INTERVAL_MS) return refreshInFlight ?? Promise.resolve();
      if (refreshInFlight) return refreshInFlight;
      lastRefreshAt = now;
      refreshInFlight = (async () => {
        try {
          const manifest = await fetchProjectAssetManifest();
          if (!manifest || cancelled) return;
          if (!force && manifest.revision === appliedRevision && manifest.updatedAt === appliedUpdatedAt) return;
          await applyManifest(manifest, true);
         } catch {
          // Bundled assets and the last complete cache remain available offline.
         }
       })().finally(() => { refreshInFlight = null;  });
      return refreshInFlight;
     };

    const load = async () => {
      try {
        const response = await fetch(assetUrl('/combo-assets/base-presets/index.json'));
        bundled = normalizeBasePresets(response.ok ? await response.json() : { items: []  });
       } catch {
        bundled = [];
       }
      if (!cancelled) setDefaultBasePresets(sortBasePresets(bundled));
      const cached = loadCachedProjectAssetManifest();
      if (cached) await applyManifest(cached, false);
      await refresh(true);
     };
    const refreshOnFocus = () => void refresh();
    const refreshTimer = window.setInterval(() => void refresh(), PROJECT_ASSET_REFRESH_INTERVAL_MS);
    window.addEventListener('focus', refreshOnFocus);
    void load();
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', refreshOnFocus);
     };
   }, []);

  useEffect(() => {
    if (chart && defaultBasePresets.length) synchronizeDisplayStyles(chart);
   }, [chart?.id, chart?.character, chart?.community?.characters?.join('\u0000'), defaultAvatars, defaultBasePresets, roleBaseFollowsAvatar]);

  useEffect(() => {
    let cancelled = false;
    let lastRefreshAt = 0;
    let refreshInFlight = false;
    const refresh = async (force = false) => {
      const now = Date.now();
      if (refreshInFlight || (!force && now - lastRefreshAt < APP_RELEASE_REFRESH_INTERVAL_MS)) return;
      refreshInFlight = true;
      lastRefreshAt = now;
      try {
        const response = await fetch(REMOTE_APP_RELEASE_API, { cache: 'no-cache'  });
        const release = normalizeAppRelease(response.ok ? await response.json() : null);
        if (!cancelled && release && compareVersions(release.version, __APP_VERSION__) > 0 && dismissedUpdateVersionRef.current !== release.version) {
          setAvailableUpdate(release);
         }
       } catch {
        // Version checks are optional and must never block the application.
       } finally {
        refreshInFlight = false;
       }
     };
    const refreshOnFocus = () => void refresh();
    const refreshTimer = window.setInterval(() => void refresh(), APP_RELEASE_REFRESH_INTERVAL_MS);
    window.addEventListener('focus', refreshOnFocus);
    void refresh(true);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', refreshOnFocus);
     };
   }, []);

  useEffect(() => {
    const emit = () => desktop?.updateOverlay({ chart: practiceChart, practice, practicePreset, language, visible: overlayVisible, moveMode: overlayMoveMode, settings: overlaySettings, comboImageStyle: activeOverlayComboImageStyle, rhythmUiSettings, mode: overlaySettings.layout === 'waterfall' ? 'rhythm' : 'combo'  });
    emit();
   }, [desktop, practiceChart, practice, practicePreset, language, overlaySettings, activeOverlayComboImageStyle, rhythmUiSettings, overlayVisible, overlayMoveMode]);

  useEffect(() => {
    if (!keyMappingVisible) return;
    void desktop?.updateKeyMapping?.({ visible: true, pressedCodes: keyMappingPressedCodes  });
   }, [desktop, keyMappingVisible, keyMappingPressedCodes]);

  useEffect(() => {
    void desktop?.updateRecordingIndicator?.({
      visible: recordingIndicatorEnabled && globalInputEnabled,
      recording: snapshot.isRecording,
      corner: recordingIndicatorCorner
    });
   }, [desktop, globalInputEnabled, recordingIndicatorEnabled, recordingIndicatorCorner, snapshot.isRecording]);

  useEffect(() => desktop?.onOverlayBoundsChanged?.((bounds) => {
    const transition = overlayBoundsTransitionRef.current;
    const normalized = normalizeOverlayBounds(bounds, transition?.target ?? overlaySettingsRef.current);
    let layout = overlaySettingsRef.current.layout;
    if (transition && Date.now() <= transition.expiresAt) {
      if (!overlayBoundsMatch(normalized, transition.target)) return;
      layout = transition.layout;
      overlayBoundsTransitionRef.current = null;
     } else if (transition) {
      overlayBoundsTransitionRef.current = null;
     }
    setOverlaySettings((current) => current.layout === layout ? { ...current, ...normalized  } : current);
    setOverlayLayoutBounds((savedBounds) => ({ ...savedBounds, [layout]: normalizeOverlayBounds(normalized, savedBounds[layout])  }));
   }), [desktop]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.type === 'keydown' && event.repeat) return;
      if (page === 'practice' && shareDialogOpenRef.current) return;
      const target = event.target as HTMLElement | null;
      if (page === 'practice' && target?.closest('[data-practice-input-block="true"]')) {
        practiceInputSuppressedUntilRef.current = performance.now() + 250;
        return;
       }
      const normalized = { ...normalizeDomKeyboardEvent(event, event.type as 'keydown' | 'keyup'), source: 'dom' as const, shiftKey: event.shiftKey  };
      if (event.type === 'keydown') {
        if (page === 'record' && normalized.code === 'Escape' && recorderRef.current.isRecording) {
          event.preventDefault();
          clearBasicAttackHoldState();
          stopRecording();
          return;
         }
        if (page === 'practice' && normalized.code === 'Escape') {
          event.preventDefault();
          clearBasicAttackHoldState();
          stopPractice();
          return;
         }
       }
      acceptTrainerInput(normalized);
    };
    const handleMouse = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (page === 'practice' && isPracticeUiControl(target)) {
        practiceInputSuppressedUntilRef.current = performance.now() + 250;
        clearBasicAttackHoldState();
        return;
       }
      acceptTrainerInput({ ...normalizeDomMouseEvent(event, event.type as 'mousedown' | 'mouseup'), source: 'dom'  });
     };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey, true);
    window.addEventListener('mousedown', handleMouse, true);
    window.addEventListener('mouseup', handleMouse, true);
    const disposeGlobal = desktop?.onGlobalInput((event) => {
      if (!globalInputEnabled) return;
      acceptTrainerInput(event);
     });
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKey, true);
      window.removeEventListener('mousedown', handleMouse, true);
      window.removeEventListener('mouseup', handleMouse, true);
      disposeGlobal?.();
      clearBasicAttackHoldState();
     };
   }, [page, experimentPage, desktop, holdBindings, globalInputEnabled]);

  useEffect(() => {
    let frame = 0;
    let timer = 0;
    let disposed = false;
    const pressed = new Set<string>();
    const schedule = (hasConnectedGamepad: boolean) => {
      if (disposed) return;
      if (hasConnectedGamepad) frame = requestAnimationFrame(tick);
      else timer = window.setTimeout(tick, 250);
    };
    const tick = () => {
      frame = 0;
      timer = 0;
      const hasConnectedGamepad = Array.from(navigator.getGamepads?.() ?? []).some(Boolean);
      const current = hasConnectedGamepad ? readPressedGamepadCodes() : new Set<string>();
      for (const code of current) {
        if (pressed.has(code)) continue;
        const comboCode = code !== GAMEPAD_COMBO_MODIFIER && current.has(GAMEPAD_COMBO_MODIFIER) ? `${GAMEPAD_COMBO_MODIFIER }+${code }` : code;
        acceptTrainerInput({ type: 'gamepadbuttondown', code: comboCode, time: performance.now(), source: 'gamepad'  });
      }
      for (const code of pressed) {
        if (current.has(code)) continue;
        if (code === GAMEPAD_COMBO_MODIFIER) {
          for (const modifiedCode of pressed) {
            if (modifiedCode === GAMEPAD_COMBO_MODIFIER || !current.has(modifiedCode)) continue;
            acceptTrainerInput({ type: 'gamepadbuttonup', code: `${GAMEPAD_COMBO_MODIFIER }+${modifiedCode }`, time: performance.now(), source: 'gamepad'  });
           }
         }
        const comboCode = code !== GAMEPAD_COMBO_MODIFIER && pressed.has(GAMEPAD_COMBO_MODIFIER) ? `${GAMEPAD_COMBO_MODIFIER }+${code }` : code;
        acceptTrainerInput({ type: 'gamepadbuttonup', code: comboCode, time: performance.now(), source: 'gamepad'  });
      }
      pressed.clear();
      current.forEach((code) => pressed.add(code));
      schedule(hasConnectedGamepad);
     };
    const wake = () => {
      if (timer) window.clearTimeout(timer);
      if (!frame) frame = requestAnimationFrame(tick);
     };
    window.addEventListener('gamepadconnected', wake);
    window.addEventListener('gamepaddisconnected', wake);
    wake();
    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('gamepadconnected', wake);
      window.removeEventListener('gamepaddisconnected', wake);
     };
   }, [holdBindings, page, experimentPage]);

  function acceptTrainerInput(event: TrainerLikeInputEvent) {
    if (page === 'practice' && (shareDialogOpenRef.current || performance.now() < practiceInputSuppressedUntilRef.current)) return;
    const normalizedCode = normalizeInputCode(event.code);
    const source = event.source ?? (isGamepadEvent(event) ? 'gamepad' : 'dom');
    const transitionKey = `${event.type}:${normalizedCode}`;
    const receivedAt = performance.now();
    const previousTransition = recentInputTransitionsRef.current.get(transitionKey);
    if (previousTransition && previousTransition.source !== source && receivedAt - previousTransition.receivedAt < 50) return;
    recentInputTransitionsRef.current.set(transitionKey, { source, receivedAt  });
    const normalizedEvent = { ...event, code: normalizedCode, id: crypto.randomUUID() };
    setKeyMappingInputSignal(normalizedEvent);
    if (isPressEvent(event)) setKeyMappingPressedCodes((current) => current.includes(normalizedCode) ? current : [...current, normalizedCode]);
    if (isReleaseEvent(event)) setKeyMappingPressedCodes((current) => current.filter((item) => item !== normalizedCode && !item.split('+').includes(normalizedCode)));
    const holdCode = holdBindings.get(normalizedCode);
    if (holdCode) {
      if (isPressEvent(event)) {
        if (holdPressRef.current.has(normalizedCode)) return;
        const pressEvent = { ...event, code: normalizedCode  };
        const hold = { pressEvent, holdCode, timer: null as number | null, holdTriggered: false  };
        holdPressRef.current.set(normalizedCode, hold);
        if (page === 'practice' || page === 'record') {
          hold.timer = window.setTimeout(() => {
            const current = holdPressRef.current.get(normalizedCode);
            if (!current || current.holdTriggered) return;
            if (page === 'record' && !recorderRef.current.isRecording) return;
            current.holdTriggered = true;
            const holdStartTime = current.pressEvent.time + HEAVY_ATTACK_HOLD_MS;
            if (page === 'record') {
              setSnapshot(recorderRef.current.convertHold({ sourceCode: normalizedCode, holdCode: current.holdCode, pressTime: current.pressEvent.time, holdStartTime, releaseTime: holdStartTime }));
            } else {
              routeTrainerInput({ ...current.pressEvent, code: current.holdCode, time: holdStartTime });
            }
           }, HEAVY_ATTACK_HOLD_MS);
         } else {
          routeTrainerInput(pressEvent);
         }
        return;
       }
      if (isReleaseEvent(event)) {
        const hold = holdPressRef.current.get(normalizedCode);
        if (!hold) return;
        holdPressRef.current.delete(normalizedCode);
        if (hold.timer !== null) window.clearTimeout(hold.timer);
        const heldMs = Math.max(0, event.time - hold.pressEvent.time, performance.now() - hold.pressEvent.time);
        if (page === 'record' && recorderRef.current.isRecording) {
          const holdStartTime = hold.pressEvent.time + HEAVY_ATTACK_HOLD_MS;
          const next = hold.holdTriggered
            ? recorderRef.current.extendPress(hold.holdCode, holdStartTime, event.time)
            : heldMs >= HEAVY_ATTACK_HOLD_MS
            ? recorderRef.current.convertHold({ sourceCode: normalizedCode, holdCode: hold.holdCode, pressTime: hold.pressEvent.time, holdStartTime: hold.pressEvent.time + HEAVY_ATTACK_HOLD_MS, releaseTime: event.time  })
            : recorderRef.current.finishPress(normalizedCode, hold.pressEvent.time, event.time);
          setSnapshot(next);
         } else if (page === 'practice' && !hold.holdTriggered) {
          routeTrainerInput(heldMs >= HEAVY_ATTACK_HOLD_MS ? { ...hold.pressEvent, code: hold.holdCode, time: hold.pressEvent.time + HEAVY_ATTACK_HOLD_MS  } : hold.pressEvent);
         }
        return;
       }
     }
    routeTrainerInput({ ...event, code: normalizedCode  });
   }

  function routeTrainerInput(event: TrainerLikeInputEvent) {
    if (page === 'practice' && shareDialogOpenRef.current) return;
    const signal = { ...event, id: crypto.randomUUID()  };
    setExperimentInputSignal(signal);
    if (isPressEvent(event)) setTimelinePlacementInputSignal(signal);
    if (page === 'record') {
      const before = recorderRef.current.isRecording;
      const next = recorderRef.current.accept(event);
      setSnapshot(next);
      if (before && !next.isRecording) {
        setDebugSnapshot(next);
        setDebugMessage(localizedMessage(`录制完成：捕获 ${next.units.length } 个指令。可以选择覆盖载入编辑区，或调试合并到当前连段。`, `Recording complete: captured ${next.units.length } actions. Replace the editor chart or merge them in Test.`));
       }
     }
    if (page === 'practice' && practiceRef.current) {
      setPractice(practiceRef.current.accept(event));
     }
   }

  function clearBasicAttackHoldState() {
    for (const hold of holdPressRef.current.values()) if (hold.timer !== null) window.clearTimeout(hold.timer);
    holdPressRef.current.clear();
   }

  function manualToggleRecording() {
    if (recorderRef.current.isRecording) stopRecording();
    else setSnapshot(recorderRef.current.start(nowEventTime()));
   }

  function stopRecording() {
    const next = recorderRef.current.stop(nowEventTime());
    setSnapshot(next);
    setDebugSnapshot(next);
    setDebugMessage(localizedMessage(`录制完成：捕获 ${next.units.length } 个指令。可以选择覆盖载入编辑区，或调试合并到当前连段。`, `Recording complete: captured ${next.units.length } actions. Replace the editor chart or merge them in Test.`));
   }

  function startPractice() {
    if (practice.status === 'running' || practice.status === 'armed') return;
    if (practiceRef.current) setPractice(practiceRef.current.start(nowEventTime()));
   }

  function stopPractice() {
    if (!practiceRef.current) return;
    setPractice(practiceRef.current.stop(resetPracticeProgressOnStopRef.current));
   }

  function tickPractice() {
    if (practiceRef.current) setPractice(practiceRef.current.tick(nowEventTime()));
   }

  useEffect(() => {
    if (practice.status !== 'running') return;
    const timer = window.setInterval(tickPractice, 50);
    return () => window.clearInterval(timer);
   }, [practice.status]);

  async function startGlobalInput() {
    if (!desktop) {
      setGlobalInputStatus(localizedMessage('网页模式：仅窗口聚焦可监听', 'Web mode: input is available while this window is focused'));
      setGlobalInputEnabled(false);
      return;
     }
    try {
      const result = await desktop.startGlobalInput();
      const status = result.ok ? await desktop.getGlobalInputStatus() : null;
      const enabled = Boolean(result.ok && status?.started);
      setGlobalInputEnabled(enabled);
      setGlobalInputStatus(enabled ? localizedMessage('全局监听已开启', 'Global input enabled') : localizedMessage(`全局监听不可用：${result.reason ?? status?.status ?? '未知原因' }`, `Global input unavailable: ${result.reason ?? status?.status ?? 'unknown reason' }`));
     } catch (error) {
      setGlobalInputEnabled(false);
      setGlobalInputStatus(localizedMessage(`全局监听启动失败：${error instanceof Error ? error.message : String(error) }`, `Global input failed to start: ${error instanceof Error ? error.message : String(error) }`));
     }
   }

  async function stopGlobalInput() {
    setGlobalInputEnabled(false);
    setGlobalInputStatus(localizedMessage('全局监听已关闭，保留窗口内监听', 'Global input disabled; in-window input remains active'));
    await desktop?.stopGlobalInput();
   }

  function overwriteChartWithRecording() {
    if (!debugSnapshot?.units.length) return;
    const recordedAt = new Date().toLocaleTimeString(language);
    const recordedChart = createChartFromRecording(debugSnapshot, recorderRef.current, chartTitle || text(`录制连段 ${recordedAt }`, `Recorded Combo ${recordedAt }`));
    if (!recordedChart) return;
    const nextChart = chartWithCurrentCharacters(recordedChart, comboImageStyle);
    setChart(nextChart);
    setDebugSnapshot(null);
    setDebugMessage(localizedMessage(`已覆盖编辑区：载入 ${nextChart.steps.length } 个指令。`, `Editor replaced: loaded ${nextChart.steps.length } actions.`));
   }

  function applyDebugSnapshot() {
    if (!chart || !debugSnapshot?.units.length) return;
    const result = mergeDebugRunIntoChart(chart, debugSnapshot);
    const nextChart = { ...result.chart, updatedAt: Date.now()  };
    setChart(nextChart);
    setLibrary((current) => current.some((item) => item.id === nextChart.id) ? upsertLibraryChart(current, nextChart) : current);
    setDebugSnapshot(null);
    setDebugMessage(localizedMessage(`已加入调试：匹配 ${result.matched }/${result.total } 个指令，提前窗口 ${result.preheated } 处，延后窗口 ${result.recovered } 处，跳过 ${result.rejected } 处疑似漏输入。`, `Test merged: matched ${result.matched }/${result.total } actions, adjusted ${result.preheated } early and ${result.recovered } late windows, and skipped ${result.rejected } likely missing inputs.`));
   }

  function updateStep(stepId: string, patch: Partial<ComboStep>) {
    setChart((current) => {
      if (!current) return current;
      const steps = stepId === '__insert__' ? [...current.steps, normalizeStep(patch as ComboStep)] : current.steps.map((step) => step.id === stepId ? normalizeStep({ ...step, ...patch  }) : step);
      return applyFreeFirePeriods({ ...current, updatedAt: Date.now(), steps  });
     });
   }

  function insertSteps(steps: ComboStep[]) {
    if (!steps.length) return;
    setChart((current) => current ? applyFreeFirePeriods({ ...current, updatedAt: Date.now(), steps: [...current.steps, ...steps.map(normalizeStep)]  }) : current);
   }

  function deleteStep(stepId: string) {
    if (!chart) return;
    setChart(applyFreeFirePeriods({ ...chart, updatedAt: Date.now(), steps: chart.steps.filter((step) => step.id !== stepId)  }));
   }

  function deleteSteps(stepIds: string[]) {
    if (!chart || !stepIds.length) return;
    const ids = new Set(stepIds);
    setChart(applyFreeFirePeriods({ ...chart, updatedAt: Date.now(), steps: chart.steps.filter((step) => !ids.has(step.id))  }));
   }

  function updatePeriods(periods: ComboPeriod[]) {
    setChart((current) => current ? applyFreeFirePeriods({ ...current, updatedAt: Date.now(), periods: constrainAxisPeriods(periods)  }) : current);
   }

  function applyVideoWorkbenchChart(nextChart: ComboChart) {
    const normalized = applyFreeFirePeriods({ ...nextChart, updatedAt: Date.now(), periods: constrainAxisPeriods(nextChart.periods ?? []), steps: nextChart.steps.map(normalizeStep)  });
    setChart(normalized);
    setLibrary((current) => current.some((item) => item.id === normalized.id) ? upsertLibraryChart(current, normalized) : current);
   }

  function synchronizeDisplayStyles(nextChart: ComboChart) {
    if (!defaultBasePresets.length) return;
    const assignments = chartCharacterAssignments(nextChart);
    if (!Object.keys(assignments).length) return;
    const synchronizeStyle = (current: ComboImageStyle) => synchronizeStyleCharacters(current, assignments, defaultAvatars, defaultBasePresets, roleBaseFollowsAvatar);
    setComboImageStyle(synchronizeStyle);
    setVerticalComboImageStyle(synchronizeStyle);
    setWaterfallComboImageStyle((current) => normalizeWaterfallComboImageStyle(synchronizeStyle(current), current));
   }

  function selectComboChart(nextChart: ComboChart | null) {
    setChart(nextChart);
    if (nextChart) synchronizeDisplayStyles(nextChart);
   }

  function saveCurrentChart() {
    if (!chart) return;
    const savedAt = new Date().toLocaleTimeString(language);
    const nextChart = chartWithCurrentCharacters({ ...chart, id: crypto.randomUUID(), community: undefined, title: chartTitle.trim() || chart.title || text(`连段 ${savedAt }`, `Combo ${savedAt }`), updatedAt: Date.now()  }, comboImageStyle);
    setChart(nextChart);
    setLibrary((current) => upsertLibraryChart(current, nextChart));
   }

  function deleteLibraryChart(chartId: string) {
    setLibrary((current) => {
      const next = current.filter((item) => item.id !== chartId);
      if (chart?.id === chartId) {
        const fallback = next[0] ?? null;
        selectComboChart(fallback);
        setChartTitle(fallback?.title ?? '');
       }
      return next;
     });
   }

  function updateMove(moveId: string, patch: Partial<MoveDefinition>) {
    setMoves((current) => normalizeMoves(current.map((move) => move.id === moveId ? { ...move, ...patch  } : move)));
   }

  function updateBindingList(setter: typeof setBindings, moveId: string, value: string) {
    const seen = new Set<string>();
    const inputs = value.split(',').map((part) => part.trim()).filter(Boolean).flatMap((label) => {
      const code = normalizeInputCode(label);
      if (!code || seen.has(code) || seen.size >= 2) return [];
      seen.add(code);
      return [{ code, label  }];
     });
    setter((current) => current.some((binding) => binding.moveId === moveId) ? current.map((binding) => binding.moveId === moveId ? { moveId, inputs  } : binding) : [...current, { moveId, inputs  }]);
   }

  function updateBinding(moveId: string, value: string) {
    updateBindingList(setBindings, moveId, value);
   }

  function updateGamepadBinding(moveId: string, value: string) {
    updateBindingList(setGamepadBindings, moveId, value);
   }

  function reorderPracticeRoles(order: CharacterSlot[]) {
    if (snapshot.isRecording || practice.status === 'armed' || practice.status === 'running') return;
    const nextOrder = normalizeCharacterOrder(order);
    const slotMap = characterPositionMap(practiceRoleOrder, nextOrder);
    if (!slotMap || CHARACTER_SLOTS.every((slot) => slotMap[slot] === slot)) return;
    const updatedAt = Date.now();
    const chartsForLabels = chart ? [chart] : [];
    setChart((current) => current ? remapChartSwitchTargets(current, slotMap, updatedAt) : current);
    setComboImageStyle((current) => normalizeComboImageStyle({
      ...current,
      contentLabels: remapSwitchContentLabels(current.contentLabels, chartsForLabels, slotMap)
     }));
    setPracticeRoleOrder(nextOrder);
   }

  function cloneTimelineChart(source: ComboChart | null): ComboChart | null {
    return source ? { ...source, steps: source.steps.map((step) => ({ ...step, samples: step.samples.map((sample) => ({ ...sample  }))  })), periods: source.periods?.map((period) => ({ ...period  }))  } : null;
   }

  function currentTimelineHistorySnapshot(): TimelineHistorySnapshot {
    return { chart: cloneTimelineChart(chartRef.current), contentLabels: { ...comboImageStyleRef.current.contentLabels  }  };
   }

  function restoreTimelineHistorySnapshot(snapshot: TimelineHistorySnapshot) {
    setChart(cloneTimelineChart(snapshot.chart));
    setComboImageStyle((current) => normalizeComboImageStyle({ ...current, contentLabels: { ...snapshot.contentLabels  }  }));
   }

  function captureTimelineHistory() {
    const snapshot = currentTimelineHistorySnapshot();
    setTimelineUndoStack((current) => [...current.slice(-MAX_TIMELINE_HISTORY + 1), snapshot]);
    setTimelineRedoStack([]);
   }

  function undoTimeline() {
    setTimelineUndoStack((current) => {
      const previous = current[current.length - 1];
      if (!previous) return current;
      setTimelineRedoStack((redo) => [...redo.slice(-MAX_TIMELINE_HISTORY + 1), currentTimelineHistorySnapshot()]);
      restoreTimelineHistorySnapshot(previous);
      return current.slice(0, -1);
     });
   }

  function redoTimeline() {
    setTimelineRedoStack((current) => {
      const next = current[current.length - 1];
      if (!next) return current;
      setTimelineUndoStack((undo) => [...undo.slice(-MAX_TIMELINE_HISTORY + 1), currentTimelineHistorySnapshot()]);
      restoreTimelineHistorySnapshot(next);
      return current.slice(0, -1);
     });
   }

  function updateComboImageStyle(patch: Partial<ComboImageStyle>) {
    setComboImageStyle((current) => normalizeComboImageStyle({ ...current, ...patch  }));
   }

  function updateVerticalComboImageStyle(patch: Partial<ComboImageStyle>) {
    setVerticalComboImageStyle((current) => normalizeComboImageStyle({ ...current, ...patch  }));
   }

  function updateWaterfallComboImageStyle(patch: Partial<ComboImageStyle>) {
    setWaterfallComboImageStyle((current) => normalizeWaterfallComboImageStyle({ ...current, ...patch, mergeSameRoleSteps: false  }, current));
   }

  function updateAppearanceComboImageStyle(patch: Partial<ComboImageStyle>) {
    const modePatch = { ...patch  };
    if (Object.prototype.hasOwnProperty.call(patch, 'avatarPresets')) {
      const avatarPresets = patch.avatarPresets ?? [];
      updateComboImageStyle({ avatarPresets  });
      updateVerticalComboImageStyle({ avatarPresets  });
      updateWaterfallComboImageStyle({ avatarPresets  });
      delete modePatch.avatarPresets;
     }
    if (!Object.keys(modePatch).length) return;
    (overlaySettings.layout === 'waterfall' ? updateWaterfallComboImageStyle : overlaySettings.layout === 'vertical' ? updateVerticalComboImageStyle : updateComboImageStyle)(modePatch);
   }

  function updateWaterfallRoleStyle(slot: CharacterSlot, patch: Partial<ComboImageStyle['roleStyles'][CharacterSlot]>) {
    setWaterfallComboImageStyle((current) => normalizeWaterfallComboImageStyle({ ...current, roleStyles: { ...current.roleStyles, [slot]: { ...current.roleStyles[slot], ...patch  }  }  }, current));
   }

  function updateRhythmUiSettings(patch: Partial<RhythmUiSettings>) {
    setRhythmUiSettings((current) => normalizeRhythmUiSettings({ ...current, ...patch  }));
   }

  function updateRoleStyle(slot: CharacterSlot, patch: Partial<ComboImageStyle['roleStyles'][CharacterSlot]>) {
    setComboImageStyle((current) => normalizeComboImageStyle({ ...current, roleStyles: { ...current.roleStyles, [slot]: { ...current.roleStyles[slot], ...patch  }  }  }));
   }

  function updateVerticalRoleStyle(slot: CharacterSlot, patch: Partial<ComboImageStyle['roleStyles'][CharacterSlot]>) {
    setVerticalComboImageStyle((current) => normalizeComboImageStyle({ ...current, roleStyles: { ...current.roleStyles, [slot]: { ...current.roleStyles[slot], ...patch  }  }  }));
   }

  function updateAppearanceRoleStyle(slot: CharacterSlot, patch: Partial<ComboImageStyle['roleStyles'][CharacterSlot]>) {
    const sharedPatch: Partial<ComboImageStyle['roleStyles'][CharacterSlot]> = { };
    const modePatch = { ...patch  };
    (['name', 'avatar', 'avatarCrop'] as const).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) return;
      Object.assign(sharedPatch, { [key]: patch[key]  });
      delete modePatch[key];
     });
    if (Object.keys(sharedPatch).length) {
      updateRoleStyle(slot, sharedPatch);
      updateVerticalRoleStyle(slot, sharedPatch);
      updateWaterfallRoleStyle(slot, sharedPatch);
     }
    if (!Object.keys(modePatch).length) return;
    (overlaySettings.layout === 'waterfall' ? updateWaterfallRoleStyle : overlaySettings.layout === 'vertical' ? updateVerticalRoleStyle : updateRoleStyle)(slot, modePatch);
   }

  function styleWithAvatarPreset(current: ComboImageStyle, slot: CharacterSlot, preset: AvatarPresetEntry): ComboImageStyle {
    const role = current.roleStyles[slot];
    const presetNames = presetMatchNames(preset.name);
    const availableBases = [...defaultBasePresets, ...current.basePresets];
    const characterChanged = normalizeCharacterName(role.name) !== normalizeCharacterName(preset.name);
    const matchingBasePreset = roleBaseFollowsAvatar && current.blockMode === 'image' ? availableBases.find((item) => presetNames.includes(item.name.trim())) : undefined;
    const rolePatch: Partial<ComboImageStyle['roleStyles'][CharacterSlot]> = {
      name: preset.name,
      avatar: preset.src,
      avatarCrop: normalizeRectPercent(avatarPresetCrop(preset), { x: 0, y: 0, w: 100, h: 100  })
    };
    if (matchingBasePreset) Object.assign(rolePatch, roleBasePresetPatch(matchingBasePreset));
    else if (characterChanged) Object.assign(rolePatch, clearRoleBasePatch());
    return normalizeComboImageStyle({ ...current, roleStyles: { ...current.roleStyles, [slot]: { ...role, ...rolePatch  }  }  });
   }

  function applySharedAvatarPreset(slot: CharacterSlot, preset: AvatarPresetEntry) {
    setComboImageStyle((current) => styleWithAvatarPreset(current, slot, preset));
    setVerticalComboImageStyle((current) => styleWithAvatarPreset(current, slot, preset));
    setWaterfallComboImageStyle((current) => normalizeWaterfallComboImageStyle(styleWithAvatarPreset(current, slot, preset), current));
   }

  async function pickSharedAvatar(slot: CharacterSlot, file: File | null) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    const avatarPatch = { avatar: dataUrl, avatarCrop: { x: 10, y: 10, w: 80, h: 80  }  };
    updateRoleStyle(slot, avatarPatch);
    updateVerticalRoleStyle(slot, avatarPatch);
    updateWaterfallRoleStyle(slot, avatarPatch);
   }

  function applyQuickInput(values: string[]) {
    if (!practiceChart) return;
    setQuickInputMemory(values);
    const labels = { ...comboImageStyle.contentLabels  };
    practiceChart.steps.forEach((step, index) => {
      if (values[index] !== undefined) labels[step.id] = values[index];
     });
    updateComboImageStyle({ contentLabels: labels  });
   }


  function openShareDialog() {
    if (!chart) return;
    const otherIds = library.filter((item) => item.id !== chart.id).flatMap((item) => item.community?.id ? [item.community.id] : []);
    setShareDraft(communityShareDraft(chart, comboImageStyle, otherIds));
   }

  async function chooseExportDirectory(): Promise<string | null> {
    if (!desktop?.pickExportDirectory) {
      showToast(text('文件夹选择仅在桌面版中可用。', 'Folder selection is available in the desktop app.'));
      return null;
    }
    try {
      const selected = (await desktop.pickExportDirectory(exportDirectory.trim(), text('选择导出文件夹', 'Select Folder')))?.trim() ?? '';
      if (!selected) return null;
      setExportDirectory(selected);
      return selected;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(text(`选择导出文件夹失败：${message}`, `Unable to select export folder: ${message}`));
      return null;
    }
   }

  async function ensureExportDirectory(): Promise<string | null> {
    const configured = exportDirectory.trim();
    return configured || chooseExportDirectory();
   }

  async function exportSharedChart(draft: CommunityShareDraft) {
    if (!chart) return;
    const link = draft.link.trim();
    if (link && !/^https?:\/\//i.test(link)) { showToast('\u94fe\u63a5\u9700\u8981\u4ee5 http:// \u6216 https:// \u5f00\u5934'); return;  }
    const metadata: ComboCommunityMetadata = { ...draft, name: draft.name.trim() || chart.title, description: draft.description.trim(), link, tags: normalizeCommunityTags(draft.tags, draft.wheelchairEligible), exportedAt: Date.now()  };
    const sharedChart = normalizeChart({ ...chart, title: metadata.name, character: metadata.characters.join(' / '), tags: [...metadata.tags], community: metadata, updatedAt: Date.now()  });
    const filename = `${safeFileName(metadata.name)}-${safeFileName(metadata.id)}.wwcombo.json`;
    const bytes = new TextEncoder().encode(stringifyPortableJson(createChartExportPackage(sharedChart, comboImageStyle.contentLabels, moves, bindings)));
    try {
      let path: string | null = null;
      if (desktop?.saveExportFile) {
        const targetDirectory = await ensureExportDirectory();
        if (!targetDirectory) {
          showToast(text('未选择导出文件夹，已取消导出。', 'No export folder was selected. Export cancelled.'));
          return;
        }
        path = (await desktop.saveExportFile(targetDirectory, filename, bytes)).path;
      } else downloadBytes(bytes, filename, 'application/json;charset=utf-8');
      setChart(sharedChart);
      setLibrary((current) => upsertLibraryChart(current, sharedChart));
      setChartTitle(sharedChart.title);
      setShareDraft(null);
      showToast(path ? `\u5df2\u5bfc\u51fa\u5230\uff1a${path}` : `\u5df2\u5bfc\u51fa\u5230\u6d4f\u89c8\u5668\u4e0b\u8f7d\u76ee\u5f55\uff1a${filename}`);
     } catch (error) {
      showToast(`\u5bfc\u51fa\u5931\u8d25\uff1a${error instanceof Error ? error.message : String(error)}`);
     }
   }

  async function exportInputSettings() {
    const now = new Date();
    const timestamp = [now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()].map((part) => String(part).padStart(2, '0')).join('');
    const filename = `wwcombo-input-settings-${timestamp}.wwkeys.json`;
    const payload = {
      kind: 'wwcombo-input-settings',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      moves,
      keyboardMouseBindings: bindings,
      gamepadBindings,
      shortcutSettings,
      preferences: { inputMode, keyboardIconMode, gamepadIconSet  }
     };
    const bytes = new TextEncoder().encode(stringifyPortableJson(payload));
    try {
      let path: string | null = null;
      if (desktop?.saveExportFile) {
        const targetDirectory = await ensureExportDirectory();
        if (!targetDirectory) {
          showToast(text('未选择导出文件夹，已取消导出。', 'No export folder was selected. Export cancelled.'));
          return;
        }
        path = (await desktop.saveExportFile(targetDirectory, filename, bytes)).path;
      } else downloadBytes(bytes, filename, 'application/json;charset=utf-8');
      showToast(path
        ? text(`按键设置已导出到：${path }`, `Input settings exported to: ${path }`)
        : text(`按键设置已下载为：${filename }`, `Input settings downloaded as: ${filename }`));
     } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(text(`导出按键设置失败：${message }`, `Unable to export input settings: ${message }`));
     }
   }

  async function importInputSettings(file: File | null) {
    if (!file) return;
    try {
      const source = await file.text();
      const imported = parseInputSettingsPackage(JSON.parse(source.replace(/^\uFEFF/, '')));
      setMoves(normalizeMoves(imported.moves));
      setBindings(normalizeBindings(imported.keyboardMouseBindings, DEFAULT_BINDINGS));
      setGamepadBindings(normalizeBindings(imported.gamepadBindings, DEFAULT_GAMEPAD_BINDINGS));
      setInputMode(imported.preferences.inputMode);
      setKeyboardIconMode(imported.preferences.keyboardIconMode);
      setGamepadIconSet(imported.preferences.gamepadIconSet);
      if (imported.shortcutSettings) setShortcutSettings(imported.shortcutSettings);
      showToast(text(`已导入按键设置：${file.name }`, `Input settings imported: ${file.name }`));
     } catch (error) {
      const detail = error instanceof SyntaxError
        ? text('JSON 格式无效。', 'Invalid JSON.')
        : error instanceof Error && error.message === 'invalid-input-settings-format'
          ? text('这不是有效的 WW Combo Trainer 按键设置文件。', 'This is not a valid WW Combo Trainer input settings file.')
          : error instanceof Error ? error.message : String(error);
      showToast(text(`导入按键设置失败：${detail }`, `Unable to import input settings: ${detail }`));
     }
   }

  async function exportAxisImage(filename: string, bytes: Uint8Array) {
    try {
      let path: string | null = null;
      if (desktop?.saveExportFile) {
        const targetDirectory = await ensureExportDirectory();
        if (!targetDirectory) {
          showToast(text('未选择导出文件夹，已取消导出。', 'No export folder was selected. Export cancelled.'));
          return;
        }
        path = (await desktop.saveExportFile(targetDirectory, filename, bytes)).path;
      } else downloadBytes(bytes, filename, 'image/png');
      showToast(path ? text(`已导出到：${path}`, `Exported to: ${path}`) : text(`已导出到浏览器下载目录：${filename}`, `Exported to the browser download folder: ${filename}`));
     } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(text(`导出失败：${message}`, `Export failed: ${message}`));
      throw error;
     }
   }

  function showToast(message: string) {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3200);
   }

  async function importCharts(file: File | null) {
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
    const imported = parseImportedComboPackage(parsed);
    const charts = imported.charts;
    if (!charts.length) return;
    setLibrary((current) => charts.reduce((next, item) => upsertLibraryChart(next, item), current));
    selectComboChart(charts[0]);
    if (Object.keys(imported.contentLabels).length) updateComboImageStyle({ contentLabels: { ...comboImageStyle.contentLabels, ...imported.contentLabels  }  });
    if (imported.moves.length) setMoves((current) => normalizeMoves(mergeMoves(current, imported.moves)));
    if (imported.bindings.length) setBindings((current) => normalizeBindings(mergeBindings(current, imported.bindings)));
   }

  async function toggleOverlay() {
    const visible = !overlayVisible;
    setOverlayVisible(visible);
    await desktop?.setOverlayVisible(visible);
     }

  async function applyOverlayBounds(settings: OverlaySettings) {
    if (!desktop?.setOverlayBounds) return;
    const target = { x: settings.x, y: settings.y, width: settings.width, height: settings.height  };
    overlayBoundsTransitionRef.current = { layout: settings.layout, target, expiresAt: Date.now() + 1200  };
    try {
      await desktop.setOverlayBounds(target);
     } catch (error) {
      overlayBoundsTransitionRef.current = null;
      throw error;
     }
   }

  async function toggleOverlayMoveMode() {
    const enabled = !overlayMoveMode;
    setOverlayMoveMode(enabled);
    let nextSettings = overlaySettings;
    if (enabled) {
      setOverlayVisible(true);
      const liveBounds = await desktop?.getOverlayBounds?.().catch(() => null);
      if (liveBounds) {
        nextSettings = { ...overlaySettings, ...liveBounds  };
        setOverlaySettings(nextSettings);
        overlaySettingsRef.current = nextSettings;
        setOverlayLayoutBounds((current) => ({ ...current, [overlaySettings.layout]: { x: nextSettings.x, y: nextSettings.y, width: nextSettings.width, height: nextSettings.height  }  }));
       } else {
        await applyOverlayBounds(nextSettings);
       }
      await desktop?.setOverlayVisible(true);
     }
    await desktop?.setOverlayClickThrough(!enabled);
    await desktop?.updateOverlay({ chart: practiceChart, practice, practicePreset, language, visible: enabled ? true : overlayVisible, moveMode: enabled, settings: nextSettings, comboImageStyle: nextSettings.layout === 'waterfall' ? displayWaterfallComboImageStyle : nextSettings.layout === 'vertical' ? displayVerticalComboImageStyle : displayComboImageStyle, rhythmUiSettings, mode: nextSettings.layout === 'waterfall' ? 'rhythm' : 'combo'  });
   }

  async function resetOverlayBounds() {
    const next = { layout: overlaySettings.layout, ...DEFAULT_OVERLAY_LAYOUT_BOUNDS[overlaySettings.layout]  };
    setOverlaySettings(next);
    overlaySettingsRef.current = next;
    setOverlayLayoutBounds((current) => ({ ...current, [next.layout]: { x: next.x, y: next.y, width: next.width, height: next.height  }  }));
    await applyOverlayBounds(next);
    await desktop?.updateOverlay({ chart: practiceChart, practice, practicePreset, language, visible: overlayVisible, moveMode: overlayMoveMode, settings: next, comboImageStyle: next.layout === 'waterfall' ? displayWaterfallComboImageStyle : next.layout === 'vertical' ? displayVerticalComboImageStyle : displayComboImageStyle, rhythmUiSettings, mode: next.layout === 'waterfall' ? 'rhythm' : 'combo'  });
   }

  async function setOverlayLayout(layout: ComboLayout) {
    const next = overlaySettingsForLayout(layout, overlayLayoutBounds);
    setOverlaySettings(next);
    overlaySettingsRef.current = next;
    await applyOverlayBounds(next);
    await desktop?.updateOverlay({ chart: practiceChart, practice, practicePreset, language, visible: overlayVisible, moveMode: overlayMoveMode, settings: next, comboImageStyle: layout === 'waterfall' ? displayWaterfallComboImageStyle : layout === 'vertical' ? displayVerticalComboImageStyle : displayComboImageStyle, rhythmUiSettings, mode: layout === 'waterfall' ? 'rhythm' : 'combo'  });
   }

  function exitExperimentSubpage() {
    if (experimentOpenedFromHome) {
      setExperimentOpenedFromHome(false);
      setPage('home');
      return;
     }
    setExperimentPage('home');
   }

  function navigateToPage(nextPage: Page) {
    const shouldPromptForHelp = page === 'home' && nextPage !== 'home' && !firstRunHelpPromptedRef.current;
    setPage(nextPage);
    if (!shouldPromptForHelp) return;
    firstRunHelpPromptedRef.current = true;
    persistFirstRunHelpPrompted();
    setFirstRunHelpPromptOpen(true);
   }

  const helpContent = HELP_CONTENT[language];

  return (
    <div className={`app-shell ${appearanceMode === 'night' ? 'theme-night' : '' } ${appearanceMode === 'day' ? 'theme-day' : '' } ${appearanceMode === 'night2' ? 'theme-night2' : '' } ${page === 'experiment' && experimentPage === 'axis' ? 'axis-game-open' : '' }` }>
      {toastMessage && <div className="app-toast" role="status">{toastMessage}</div>}
      {availableUpdate && <section className="app-update-notice" aria-label={text('客户端更新', 'Client Update') }>
        <div className="app-update-heading"><div><span>{text('发现新版本', 'New version available') }</span><strong>{availableUpdate.title || `WW Combo Trainer ${availableUpdate.version }`}</strong></div><button type="button" title={text('稍后提醒', 'Remind me later') } aria-label={text('关闭更新提示', 'Close update notice') } onClick={() => { dismissedUpdateVersionRef.current = availableUpdate.version; setAvailableUpdate(null);  } }><X size={17 } /></button></div>
        <p className="app-update-version">v{__APP_VERSION__ } <span>→</span> v{availableUpdate.version }</p>
        {availableUpdate.notes && <p className="app-update-notes">{availableUpdate.notes }</p>}
        {availableUpdate.download && <a href={availableUpdate.download.url } download={availableUpdate.download.fileName } target="_blank" rel="noopener noreferrer"><Download size={17 } />{text('下载新版本', 'Download Update') }</a>}
      </section>}
        <aside className="sidebar">
          <button className={`brand ${page === 'home' ? 'home-active' : '' }` } type="button" aria-label={text('返回主界面', 'Back to Home') } title={text('返回主界面', 'Back to Home') } onClick={() => setPage('home') }><div className="brand-mark"><img src="/app-icon-avatar.png" alt="" /></div><div><h1>{text('鸣潮训练场', 'Wuthering Waves Trainer') }</h1><span>Combo Trainer</span></div></button>
          <nav>
          <button className={page === 'record' ? 'active' : '' } onClick={() => navigateToPage('record') }><Activity size={18 } /><span>{language === 'zh-CN' ? <ruby className="sidebar-nav-ruby">记录<rt>Record</rt></ruby> : text('记录', 'Record') }</span></button>
          <button className={page === 'practice' ? 'active' : '' } onClick={() => navigateToPage('practice') }><Target size={18 } /><span>{language === 'zh-CN' ? <ruby className="sidebar-nav-ruby">练习<rt>Practice</rt></ruby> : text('练习', 'Practice') }</span></button>
          <button className={page === 'appearance' ? 'active' : '' } onClick={() => navigateToPage('appearance') }><Palette size={18 } /><span>{language === 'zh-CN' ? <ruby className="sidebar-nav-ruby">外观<rt>Appearance</rt></ruby> : text('外观', 'Appearance') }</span></button>
          <button className={page === 'experiment' ? 'active' : '' } onClick={() => { setExperimentOpenedFromHome(false); setExperimentPage('home'); navigateToPage('experiment');  } }><FlaskConical size={18 } /><span>{language === 'zh-CN' ? <ruby className="sidebar-nav-ruby">实验<rt>Labs</rt></ruby> : text('实验', 'Labs') }</span></button>
          <button className={page === 'settings' ? 'active' : '' } onClick={() => navigateToPage('settings') }><Settings size={18 } /><span>{language === 'zh-CN' ? <ruby className="sidebar-nav-ruby">设置<rt>Settings</rt></ruby> : text('设置', 'Settings') }</span></button>
        </nav>
        <button className={`sidebar-tool sidebar-global-listener ${globalInputEnabled ? 'active' : '' }` } title={text(globalInputStatus.chinese, globalInputStatus.english) } onClick={() => void (globalInputEnabled ? stopGlobalInput() : startGlobalInput()) }><Keyboard size={18 } /><span>{text('全局捕获', 'Global Input Capture') }</span></button>
        <div className="sidebar-illustration" aria-hidden="true" />
      </aside>

      <main className={`workspace ${page === 'home' ? 'workspace-home' : '' } ${page === 'experiment' && experimentPage !== 'home' ? 'workspace-experiment' : '' }` }>
        {page === 'home' && <HomePage appearanceMode={appearanceMode } live2dEnabled={live2dEnabled } onNavigate={(destination) => {
          if (destination === 'keymap' || destination === 'export-axis') {
            setExperimentOpenedFromHome(true);
            setExperimentPage(destination);
            navigateToPage('experiment');
            return;
           }
          navigateToPage(destination);
         } } />}
        {page === 'record' && (
          <section className="record-page-layout record-page-layout-v2">
            <div className="panel record-panel record-panel-v2">
              <div className="panel-title compact-title">
                <div><h2>{text('记录模式', 'Record Mode') }</h2><p>{text('F 开始录制，Esc 结束录制。结束后可选择覆盖编辑区或调试当前连段。', 'Press F to record and Esc to stop. You can then replace the editor chart or test the recording.') }</p></div>
                <div className="record-panel-actions"><div className={`record-dot ${snapshot.isRecording ? 'on' : '' }` } /></div>
              </div>
              <div className="record-actions">
                <button className="primary" onClick={manualToggleRecording }>{snapshot.isRecording ? <Square size={18 } /> : <Play size={18 } /> }{snapshot.isRecording ? text('结束录制 Esc', 'Stop Recording Esc') : text('开始记录 F', 'Start Recording F') }</button>
                <button className={`overwrite-button ${!snapshot.isRecording && debugSnapshot?.units.length ? 'needs-attention' : '' }` } onClick={overwriteChartWithRecording } disabled={snapshot.isRecording || !debugSnapshot?.units.length }><Upload size={18 } />{text('覆盖', 'Replace') }{!snapshot.isRecording && Boolean(debugSnapshot?.units.length) && <span className="overwrite-count-badge">{debugSnapshot!.units.length }</span> }</button>
                <button onClick={applyDebugSnapshot } disabled={snapshot.isRecording || !debugSnapshot?.units.length || !chart }><Bug size={18 } />{text('调试', 'Test') }</button>
                <button onClick={() => { setVideoWorkbenchMounted(true); setVideoWorkbenchOpen(true);  } } disabled={!chart }><FileVideo size={18 } />{text('视频辅助', 'Video Tools') }</button>
              </div>
              <div className={`debug-status ${debugSnapshot?.units.length ? 'on' : '' }` }>{highlightMessageTerm(text(debugMessage.chinese, debugMessage.english), text('全局捕获', 'Global Input Capture')) }</div>
            </div>

            <div className="panel combo-editor-panel combo-editor-panel-v2">
              <div className="panel-title combo-editor-title-v2">
                <div><h2>{text('连段谱编辑', 'Combo Chart Editor') }</h2><p>{text('时间轴用于调整操作时机；内容模式用于编辑连段图显示文字。', 'Use the timeline to adjust timing and Content mode to edit labels.') }</p></div>
                <div className="editor-title-actions editor-title-actions-v2">

                  <label>{text('名称', 'Name') } <input className="chart-title-input" value={chartTitle } onChange={(event) => setChartTitle(event.target.value) } /></label>
                  <StartingRolePicker value={startingCharacterSlot  } style={comboImageStyle } onChange={setStartingCharacterSlot } />
                </div>

              </div>
              {chart && <div className="editor-combo-preview"><ComboImagePreview chart={chart } practice={editorPreviewPractice } style={activeRenderComboImageStyle } layout="horizontal" bounds={overlaySettings } mergedHighlightMode="input" /></div> }
              {chart && <TimelineEditor chart={chart } moves={moves } bindings={activeBindings } shortcutSettings={shortcutSettings } inputSignal={timelinePlacementInputSignal } comboImageStyle={comboImageStyle } mode={editorTab } onModeChange={setEditorTab } zoom={editorZoom } onZoomChange={setEditorZoom } playheadControl={{ playbackMs: editorPlaybackMs, onSeek: setEditorPlaybackMs, isPlaying: editorPlaying, onTogglePlaying: toggleEditorPlayback, playbackRate: editorPlaybackRate, onPlaybackRateChange: (rate) => setEditorPlaybackRate(rate as (typeof TIMELINE_PLAYBACK_RATES)[number]), autoFollow: editorAutoFollow, onAutoFollowChange: setEditorAutoFollow  }} onUpdate={updateStep } onInsert={insertSteps } onDelete={deleteSteps } onPeriodsChange={updatePeriods } onContentChange={updateComboImageStyle } onQuickInput={(stepId) => { setQuickInputStartStepId(stepId); setQuickInputOpen(true);  } } onSave={saveCurrentChart } historyControl={{ canUndo: timelineUndoStack.length > 0, canRedo: timelineRedoStack.length > 0, onCaptureHistory: captureTimelineHistory, onUndo: undoTimeline, onRedo: redoTimeline  }} keyboardShortcutsEnabled={!videoWorkbenchOpen } /> }
              {!chart && <EmptyState text={text('暂无连段谱。先录制一遍并点击覆盖，或导入 JSON。', 'No combo chart yet. Record and replace one, or import a JSON file.') } /> }
            </div>
          </section>
        ) }

        {page === 'practice' && (
          <section className="practice-layout">
            <div className="panel practice-main-panel">
              <div className="panel-title practice-panel-title"><div><h2>{text('练习模式', 'Practice Mode') }</h2><p>{text('F 开始，Esc 结束；演示按时间展示流程，推进按正确输入前进。', 'Press F to start and Esc to stop. Demo follows time; Advance progresses on correct input.') }</p></div><div className="practice-title-actions"><PracticeRoleOrderPicker order={practiceRoleOrder  } style={comboImageStyle } disabled={snapshot.isRecording || practice.status === 'armed' || practice.status === 'running' } onReorder={reorderPracticeRoles } /><div className="segmented"><button className={practicePreset === 'simple' ? 'active' : '' } onClick={() => setPracticePreset('simple') }>{text('演示', 'Demo') }</button><button className={practicePreset === 'lenient' ? 'active' : '' } onClick={() => setPracticePreset('lenient') }>{text('推进', 'Advance') }</button><button className={practicePreset === 'strict' ? 'active' : '' } onClick={() => setPracticePreset('strict') }>{text('挑战', 'Challenge') }</button></div></div></div>
              {practiceChart ? <ComboImagePreview chart={practiceChart } practice={practice  } style={activeRenderComboImageStyle } layout="horizontal" bounds={overlaySettings } mergedHighlightMode={practicePreset === 'lenient' ? 'input' : 'time' } /> : <EmptyState text={text('暂无连段谱。', 'No combo chart available.') } /> }
              <div className="record-actions"><button className="primary" onClick={startPractice } disabled={practice.status === 'running' || practice.status === 'armed' }><Play size={18 } />{text('开始 F', 'Start F') }</button><button onClick={stopPractice }><Square size={18 } />{text('结束 Esc', 'Stop Esc') }</button><button className="icon-button" onClick={toggleOverlay }>{overlayVisible ? <EyeOff size={18 } /> : <Eye size={18 } /> }</button><label className="checkline axis-gate-toggle"><input type="checkbox" checked={axisGateEnabled } onChange={(event) => setAxisGateEnabled(event.target.checked) } />{text('轴首招启动', 'Start at First Action of Axis') }</label><label className="checkline"><input type="checkbox" checked={resetPracticeProgressOnStop } onChange={(event) => setResetPracticeProgressOnStop(event.target.checked) } />{text('复位', 'Reset') }</label></div>
              <div className="practice-feedback-row">{practice.feedback[0] ? <div className={`feedback ${practice.feedback[0].level }` }>{practice.feedback[0].message }</div> : <div className="feedback info">{text('等待输入提示', 'Waiting for input') }</div> }</div>
              {practiceChart && practice.errorStepIds.length > 0 && <PracticeErrorSummary chart={practiceChart } practice={practice } /> }
            </div>
            <LibraryPanel chart={chart } library={library } style={comboImageStyle } avatarPresets={defaultAvatars } onSelect={(id) => selectComboChart(library.find((item) => item.id === id) ?? chart) } onEdit={(id) => { const item = library.find((entry) => entry.id === id); if (item) { selectComboChart(item); setPage('record'); setEditorTab('timeline');  }  } } onDelete={deleteLibraryChart } onShare={openShareDialog } onImport={() => importInputRef.current?.click() } />
            <input ref={importInputRef } className="file-input" type="file" accept="application/json,.json" onChange={(event) => void importCharts(event.target.files?.[0] ?? null) } />
          </section>
        ) }

        {page === 'appearance' && (
          <section className="appearance-page-layout">
            <header className="topbar appearance-preview-bar"><ComboImagePreview chart={practiceChart } practice={practice  } style={activeRenderComboImageStyle } layout="horizontal" bounds={overlaySettings } manualHorizontalScroll /></header>
            <div className="panel appearance-page-panel">
              <div className="panel-title"><div><h2>{text('连段图外观', 'Combo Overlay Appearance') }</h2><p>{text('这里显示的效果会同步到全局置顶连段图。', 'Changes here are applied to the always-on-top combo overlay.') }</p></div><div className="overlay-settings-panel inline-overlay-controls"><div className="segmented"><button className={overlaySettings.layout === 'horizontal' ? 'active' : '' } onClick={() => void setOverlayLayout('horizontal') }>{text('横排', 'Horizontal') }</button><button className={overlaySettings.layout === 'vertical' ? 'active' : '' } onClick={() => void setOverlayLayout('vertical') }>{text('竖排', 'Vertical') }</button><button className={overlaySettings.layout === 'waterfall' ? 'active' : '' } onClick={() => void setOverlayLayout('waterfall') }>{text('瀑布', 'Waterfall') }</button></div><button className={overlayMoveMode ? 'active' : '' } onClick={toggleOverlayMoveMode }>{text('移动', 'Move') }</button><button onClick={resetOverlayBounds }>{text('复位', 'Reset') }</button><button className="icon-button" onClick={toggleOverlay }>{overlayVisible ? <EyeOff size={18 } /> : <Eye size={18 } /> }</button></div></div>
              <SimpleAppearanceEditor style={appearanceComboImageStyle } avatarPresets={defaultAvatars } basePresets={defaultBasePresets } teamPresets={teamPresets } roleBaseFollowsAvatar={roleBaseFollowsAvatar } onRoleBaseFollowsAvatarChange={setRoleBaseFollowsAvatar } onApplyAvatarPreset={applySharedAvatarPreset } onTeamPresetsChange={setTeamPresets } onChange={updateAppearanceComboImageStyle } onRoleChange={updateAppearanceRoleStyle } onPickAvatar={(slot, file) => void pickSharedAvatar(slot, file) } avatarInputRefs={avatarInputRefs } blockSettingsReplacement={overlaySettings.layout === 'waterfall' ? <RhythmBlockSettings settings={rhythmUiSettings } onChange={updateRhythmUiSettings } /> : null } />
            </div>
          </section>
        ) }

        {page === 'experiment' && (
          <section className="experiment-page-layout">
            {experimentPage === 'home' && (
              <div className="panel experiment-panel">
                <div className="panel-title"><div><h2>{text('实验', 'Labs') }</h2><p>{text('还在打磨中的玩法和工具入口。', 'Experimental modes and tools currently in development.') }</p></div></div>
                <div className="experiment-grid">
                  <button className="experiment-card" onClick={() => setExperimentPage('axis') }><span className="experiment-card-icon"><img src="/theme/experiment-axis.png" alt="" /></span><strong>{text('节奏合轴', 'Rhythm Axis') }</strong></button>
                  <button className="experiment-card" onClick={() => setExperimentPage('keymap') }><span className="experiment-card-icon"><img src={appearanceMode === 'day' ? '/theme/home-day-keymap-icon.png' : appearanceMode === 'night2' ? '/theme/home-night2-keymap-icon.png' : '/theme/home-keymap-icon.png' } alt="" /></span><strong>{text('按键映射', 'Key Mapping') }</strong></button>
                  <button className="experiment-card" onClick={() => setExperimentPage('export-axis') }><span className="experiment-card-icon"><img src={appearanceMode === 'day' ? '/theme/home-day-export-axis-icon.png' : appearanceMode === 'night2' ? '/theme/home-night2-export-axis-icon.png' : '/theme/experiment-export-axis.png' } alt="" /></span><strong>{text('导出轴图', 'Export Axis Image') }</strong></button>
                </div>
              </div>
            ) }
            {experimentPage === 'axis' && (
              <div className="experiment-axis-page">
                <AxisRhythmGame chart={practiceChart } library={library  } style={displayComboImageStyle } moves={moves } bindings={activeBindings } inputSignal={experimentInputSignal } iconStorageKey="ww-combo-axis-rhythm-icons-v1" onSelectChart={(id) => selectComboChart(library.find((item) => item.id === id) ?? chart) } onExit={exitExperimentSubpage } />
              </div>
            ) }
            {experimentPage === 'keymap' && (
              <div className="experiment-keymap-page">
                <div className="panel-title experiment-subtitle"><div><h2>{text('按键映射', 'Key Mapping') }</h2><p>{text('按下键位时显示对应图片。', 'Show the mapped image when a key is pressed.') }</p></div><button className="icon-button experiment-back-button" onClick={exitExperimentSubpage } title={text('返回', 'Back') }><ArrowLeft size={18 } /></button></div>
                <KeyMappingLab inputSignal={keyMappingInputSignal } inputMode={inputMode } bindings={activeBindings } visible={keyMappingVisible } onVisibleChange={setKeyMappingVisible } onRequestGlobalInput={startGlobalInput } />
              </div>
            ) }
            {experimentPage === 'export-axis' && (
              <FullChartExportLab chart={chart } library={library } style={displayComboImageStyle } basePresets={defaultBasePresets } onSelectChart={(id) => selectComboChart(library.find((item) => item.id === id) ?? chart) } onExit={exitExperimentSubpage } onExport={exportAxisImage } />
            ) }
          </section>
        ) }

        {page === 'settings' && <SettingsPanel view={settingsView } helpTab={helpTab } moves={moves } bindings={bindings } gamepadBindings={gamepadBindings } inputMode={inputMode } gamepadIconSet={gamepadIconSet } keyboardIconMode={keyboardIconMode } shortcutSettings={shortcutSettings } appearanceMode={appearanceMode } live2dEnabled={live2dEnabled } exportDirectory={exportDirectory } recordingIndicatorEnabled={recordingIndicatorEnabled } recordingIndicatorCorner={recordingIndicatorCorner } canChooseExportDirectory={Boolean(desktop?.pickExportDirectory) } onViewChange={setSettingsView } onHelpTabChange={setHelpTab } onInputModeChange={setInputMode } onGamepadIconSetChange={setGamepadIconSet } onKeyboardIconModeChange={setKeyboardIconMode } onShortcutSettingsChange={setShortcutSettings } onAppearanceModeChange={setAppearanceMode } onLive2dEnabledChange={setLive2dEnabled } onChooseExportDirectory={() => { void chooseExportDirectory();  } } onExportInputSettings={() => { void exportInputSettings();  } } onImportInputSettings={(file) => { void importInputSettings(file);  } } onRecordingIndicatorEnabledChange={setRecordingIndicatorEnabled } onRecordingIndicatorCornerChange={setRecordingIndicatorCorner } onMoveChange={updateMove } onBindingChange={updateBinding } onGamepadBindingChange={updateGamepadBinding } /> }
      </main>
      {quickInputOpen && practiceChart && <QuickInputDialog chart={practiceChart  } style={comboImageStyle } initialValues={quickInputMemory } startStepId={quickInputStartStepId } onApply={applyQuickInput } onClose={() => setQuickInputOpen(false) } /> }
      {shareDraft && chart && <CommunityShareDialog draft={shareDraft } onChange={setShareDraft } onExport={() => void exportSharedChart(shareDraft) } onClose={() => setShareDraft(null) } /> }
      {videoWorkbenchMounted && chart && <VideoAxisWorkbench open={videoWorkbenchOpen } desktop={desktop } chart={chart } comboImageStyle={activeRenderComboImageStyle } timelineContentLabels={comboImageStyle.contentLabels } overlaySettings={overlaySettings } rhythmUiSettings={rhythmUiSettings } shortcutSettings={shortcutSettings } exportDirectory={exportDirectory } ensureExportDirectory={ensureExportDirectory } timelineEditor={<TimelineEditor chart={chart } moves={moves } bindings={activeBindings } shortcutSettings={shortcutSettings } inputSignal={timelinePlacementInputSignal } comboImageStyle={comboImageStyle } mode={editorTab } onModeChange={setEditorTab } zoom={editorZoom } onZoomChange={setEditorZoom } onUpdate={updateStep } onInsert={insertSteps } onDelete={deleteSteps } onPeriodsChange={updatePeriods } onContentChange={updateComboImageStyle } onQuickInput={(stepId) => { setQuickInputStartStepId(stepId); setQuickInputOpen(true);  } } onSave={saveCurrentChart } historyControl={{ canUndo: timelineUndoStack.length > 0, canRedo: timelineRedoStack.length > 0, onCaptureHistory: captureTimelineHistory, onUndo: undoTimeline, onRedo: redoTimeline  }} /> } onApplyChart={applyVideoWorkbenchChart } onApplyContentLabels={(contentLabels) => setComboImageStyle((current) => normalizeComboImageStyle({ ...current, contentLabels })) } onClose={() => setVideoWorkbenchOpen(false) } onSave={saveCurrentChart } getDisplaySize={getDisplaySize } /> }
      {firstRunHelpPromptOpen && <div className="first-run-help-backdrop" role="presentation"><div className="first-run-help-dialog" role="alertdialog" aria-modal="true" aria-labelledby="first-run-help-title"><BookOpen size={28 } /><h3 id="first-run-help-title">{helpContent.firstRunTitle}</h3><p>{helpContent.firstRunDescription}</p><div><button type="button" onClick={() => setFirstRunHelpPromptOpen(false) }>{helpContent.continueWithoutHelp}</button><button className="primary" type="button" onClick={() => { setFirstRunHelpPromptOpen(false); setSettingsView('help'); setHelpTab('learner'); setPage('settings');  } }>{helpContent.openHelp}</button></div></div></div> }
    </div>
  );
 }

function HomePage({ appearanceMode, live2dEnabled, onNavigate  }: { appearanceMode: AppearanceMode; live2dEnabled: boolean; onNavigate: (destination: HomeDestination) => void  }) {
  const { text  } = useI18n();
  const [activeDestination, setActiveDestination] = useState<HomeDestination | null>(null);
  const [activeSpine, setActiveSpine] = useState<HomeSpineDestination>('record');
  const [navigationVisible, setNavigationVisible] = useState(true);
  const spineConfig = appearanceMode === 'night2' ? {
    record: { skeletonUrl: '/theme/day2-1411-spine/qiuyuan.skel', scale: 2, offsetY: 0  },
    practice: { skeletonUrl: '/theme/day2-1305-spine/xiangliyao.skel', scale: 2, offsetY: 0.1  },
    appearance: { skeletonUrl: '/theme/day2-1510-spine/luhesi.skel', scale: 2, offsetY: 0  },
    keymap: { skeletonUrl: '/theme/day2-1404-spine/jiyan.skel', scale: 2, offsetY: 0.05  },
    'export-axis': { skeletonUrl: '/theme/day2-1206-spine/bulante.skel', scale: 2, offsetY: 0.1  },
    settings: { skeletonUrl: '/theme/day2-1501-spine/PortraitsMale_Skin1.skel', scale: 1, offsetY: 0  }
  } : appearanceMode === 'day' ? {
    record: { skeletonUrl: '/theme/day-1302-spine/yinlin.skel', scale: 1.6, offsetX: -0.05, offsetY: 0.1  },
    practice: { skeletonUrl: '/theme/day-1304-spine/jinxi.skel', scale: 2.9, offsetY: 0.05  },
    appearance: { skeletonUrl: '/theme/day-1205-spine/changli.skel', scale: 2, offsetY: 0  },
    keymap: { skeletonUrl: '/theme/day-1105-spine/zhezhi.skel', scale: 2, offsetY: 0  },
    'export-axis': { skeletonUrl: '/theme/day-1610-spine/xuanling.skel', scale: 2, offsetY: 0  },
    settings: { skeletonUrl: '/theme/day-1110-spine/suisui.skel', scale: 2, offsetY: 0  }
  } : {
    record: { skeletonUrl: '/theme/zanni-spine/zanni.skel', scale: 2.4, offsetY: 0  },
    practice: { skeletonUrl: '/theme/augusta-spine/aogusita.skel', scale: 3, offsetY: 0.09  },
    appearance: { skeletonUrl: '/theme/lupa-spine/lupa.skel', scale: 2, offsetY: 0  },
    keymap: { skeletonUrl: '/theme/galbrena-spine/jiabeilina.skel', scale: 3, offsetY: 0.2  },
    'export-axis': { skeletonUrl: '/theme/night-1407-spine/xiakong.skel', scale: 2, offsetY: 0  },
    settings: { skeletonUrl: '/theme/night-1409-spine/katixiya.skel', scale: 2, offsetY: 0.06  }
  };
  const iconSet = appearanceMode === 'day' ? {
    record: '/theme/home-day-record-icon.png',
    practice: '/theme/home-day-practice-icon.png',
    appearance: '/theme/home-day-appearance-icon.png',
    keymap: '/theme/home-day-keymap-icon.png',
    exportAxis: '/theme/home-day-export-axis-icon.png',
    settings: '/theme/home-day-settings-icon.png'
  } : appearanceMode === 'night2' ? {
    record: '/theme/home-night2-record-icon.png',
    practice: '/theme/home-night2-practice-icon.png',
    appearance: '/theme/home-night2-appearance-icon.png',
    keymap: '/theme/home-night2-keymap-icon.png',
    exportAxis: '/theme/home-night2-export-axis-icon.png',
    settings: '/theme/home-night2-settings-icon.png'
  } : {
    record: '/theme/home-record-icon.png',
    practice: '/theme/home-practice-icon.png',
    appearance: '/theme/home-labs-icon.png',
    keymap: '/theme/home-keymap-icon.png',
    exportAxis: '/theme/home-night-export-axis-icon.png',
    settings: '/theme/home-night-settings-icon.png'
  };
  const entries: Array<{ destination: HomeDestination; icon: string; title: string; englishTitle: string; description: string  }> = [
    { destination: 'record', icon: iconSet.record, title: text('录制', 'Record'), englishTitle: 'RECORD', description: text('捕获键鼠或手柄输入，生成并编辑连段时间轴。', 'Capture keyboard, mouse, or gamepad inputs, then build and edit a combo timeline.')  },
    { destination: 'practice', icon: iconSet.practice, title: text('练习', 'Practice'), englishTitle: 'PRACTICE', description: text('载入连段谱，使用演示、推进或挑战模式完成输入。', 'Load a combo chart and complete it in Demo, Advance, or Challenge mode.')  },
    { destination: 'appearance', icon: iconSet.appearance, title: text('外观', 'Appearance'), englishTitle: 'APPEARANCE', description: text('调整全局置顶连段图的外观与布局。', 'Adjust the appearance and layout of the always-on-top combo display.')  },
    { destination: 'keymap', icon: iconSet.keymap, title: text('按键映射', 'Key Mapping'), englishTitle: 'KEY MAPPING', description: text('按下键盘、鼠标或手柄输入时显示映射图片。', 'Display mapped images when keyboard, mouse, or gamepad inputs are pressed.')  },
    { destination: 'export-axis', icon: iconSet.exportAxis, title: text('导出轴图', 'Export Axis'), englishTitle: 'EXPORT AXIS', description: text('自动缩放并导出完整连段轴图。', 'Export a complete combo axis image with automatic scaling.')  },
    { destination: 'settings', icon: iconSet.settings, title: text('设置', 'Settings'), englishTitle: 'SETTINGS', description: text('设置语言以及键盘、鼠标与手柄映射。', 'Configure language, keyboard, mouse, and gamepad mappings.')  }
  ];
  const activeEntry = entries.find((entry) => entry.destination === activeDestination) ?? null;
  const activateEntry = (destination: HomeDestination) => {
    setActiveDestination(destination);
    if (destination === 'record' || destination === 'practice' || destination === 'appearance' || destination === 'keymap' || destination === 'export-axis' || destination === 'settings') {
      setActiveSpine(destination);
    }
  };
  const homeTitle = text('鸣潮训练场', 'Wuthering Waves Trainer');
  const homeDescription = text('记录操作、练习连段，探索更多辅助工具。', 'Record inputs, practice combos, and explore specialized tools.');
  const navigationToggleLabel = navigationVisible
    ? text('隐藏入口按钮', 'Hide navigation buttons')
    : text('显示入口按钮', 'Show navigation buttons');

  const toggleNavigation = () => {
    setNavigationVisible((visible) => {
      if (visible) setActiveDestination(null);
      return !visible;
    });
  };

  return (
    <section className="home-page" aria-label={homeTitle }>
      {live2dEnabled && <div className="home-art-stage" aria-hidden="true">
        {HOME_SPINE_DESTINATIONS.map((destination) => <div key={destination } className={`home-spine-viewport ${activeSpine === destination ? 'visible' : '' }` } data-home-spine={destination }>
          <div className="home-spine-crop">
            <div className="home-spine-scene"><HomeSpineStage key={`${appearanceMode }:${destination }` } {...spineConfig[destination] } active={activeSpine === destination } /></div>
          </div>
        </div>) }
      </div> }
      <div className={`home-intro ${activeEntry ? 'has-selection' : '' }` } aria-live="polite">
        <div key={activeEntry?.destination ?? 'home' }>
          <span>{activeEntry ? activeEntry.englishTitle : 'WW COMBO TRAINER'}</span>
          <h2>{activeEntry?.title ?? homeTitle}</h2>
          <p>{activeEntry?.description ?? homeDescription}</p>
        </div>
      </div>
      <div className="home-nav-grid">
        <div id="home-navigation" className={`home-nav-cards ${navigationVisible ? '' : 'is-hidden' }` }>
          {entries.map((entry, index) => {
            const active = activeDestination === entry.destination;
            return <button key={entry.destination } className={`home-nav-card ${active ? 'active' : '' }` } data-home-destination={entry.destination } type="button" onMouseEnter={() => activateEntry(entry.destination) } onMouseLeave={() => setActiveDestination((current) => current === entry.destination ? null : current) } onFocus={() => activateEntry(entry.destination) } onBlur={() => setActiveDestination((current) => current === entry.destination ? null : current) } onClick={() => onNavigate(entry.destination) }><span className="home-nav-card-index">0{index + 1 }</span><span className="home-nav-card-icon"><img src={entry.icon } alt="" /></span><span className="home-nav-card-copy"><strong>{entry.title}</strong><small>{entry.englishTitle}</small></span></button>;
           }) }
        </div>
        <button className="home-nav-visibility-toggle" type="button" title={navigationToggleLabel } aria-label={navigationToggleLabel } aria-controls="home-navigation" aria-expanded={navigationVisible } onClick={toggleNavigation }>
          {navigationVisible ? <EyeOff size={22 } /> : <Eye size={22 } /> }
        </button>
      </div>
    </section>
  );
 }

function StartingRolePicker({ value, style, onChange  }: { value: CharacterSlot; style: ComboImageStyle; onChange: (slot: CharacterSlot) => void  }) {
  const { language, text  } = useI18n();
  return (
    <div className="starting-role-picker">
      <span>{text('首发角色', 'Starting Character') }</span>
      <div>
        {CHARACTER_SLOTS.map((slot) => {
          const role = style.roleStyles[slot];
          return (
            <button key={slot } type="button" className={value === slot ? 'active' : '' } onClick={() => onChange(slot) } title={localizeDefaultCharacterName(role.name, slot, language) }>
              <span className="starting-role-avatar" style={avatarBackgroundStyle(role.avatar) }>{role.avatar ? null : slot }</span>
            </button>
          );
         }) }
      </div>
    </div>
  );
 }

function PracticeRoleOrderPicker({ order, style, disabled, onReorder  }: { order: CharacterSlot[]; style: ComboImageStyle; disabled: boolean; onReorder: (order: CharacterSlot[]) => void  }) {
  const { language, text  } = useI18n();
  const [draggedSlot, setDraggedSlot] = useState<CharacterSlot | null>(null);
  const [dropSlot, setDropSlot] = useState<CharacterSlot | null>(null);
  const pointerDragRef = useRef<{ pointerId: number; sourceSlot: CharacterSlot  } | null>(null);
  const visibleOrder = normalizeCharacterOrder(order);

  function clearDragState() {
    pointerDragRef.current = null;
    setDraggedSlot(null);
    setDropSlot(null);
   }

  function reorderSlot(sourceSlot: CharacterSlot, targetSlot: CharacterSlot) {
    if (!CHARACTER_SLOTS.includes(sourceSlot) || sourceSlot === targetSlot) {
      clearDragState();
      return;
     }
    const nextOrder = [...visibleOrder];
    const sourceIndex = nextOrder.indexOf(sourceSlot);
    const targetIndex = nextOrder.indexOf(targetSlot);
    if (sourceIndex < 0 || targetIndex < 0) {
      clearDragState();
      return;
     }
    nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, sourceSlot);
    onReorder(nextOrder);
    clearDragState();
   }

  function roleSlotAtPoint(clientX: number, clientY: number): CharacterSlot | null {
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-practice-role-slot]');
    const slot = Number(target?.dataset.practiceRoleSlot) as CharacterSlot;
    return CHARACTER_SLOTS.includes(slot) ? slot : null;
   }

  function beginPointerDrag(event: ReactPointerEvent<HTMLButtonElement>, slot: CharacterSlot) {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    pointerDragRef.current = { pointerId: event.pointerId, sourceSlot: slot  };
    setDraggedSlot(slot);
    setDropSlot(null);
    event.currentTarget.setPointerCapture(event.pointerId);
   }

  function movePointerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const targetSlot = roleSlotAtPoint(event.clientX, event.clientY);
    setDropSlot(targetSlot && targetSlot !== drag.sourceSlot ? targetSlot : null);
   }

  function endPointerDrag(event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const targetSlot = cancelled ? null : roleSlotAtPoint(event.clientX, event.clientY);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (targetSlot && targetSlot !== drag.sourceSlot) reorderSlot(drag.sourceSlot, targetSlot);
    else clearDragState();
   }

  return (
    <div className={`practice-role-order ${disabled ? 'disabled' : '' }` }>
      <span>{text('角色顺序', 'Character Order') }</span>
      <div className="practice-role-order-list">
        {visibleOrder.map((roleSlot, index) => {
          const position = (index + 1) as CharacterSlot;
          const role = style.roleStyles[roleSlot];
          return (
            <button
              key={roleSlot }
              type="button"
              data-practice-role-slot={roleSlot }
              className={`${draggedSlot === roleSlot ? 'dragging' : '' } ${dropSlot === roleSlot ? 'drop-target' : '' }` }
              title={disabled ? text('练习进行中不可调整角色顺序', 'Character order cannot be changed during practice') : text(`${role.name || `角色 ${roleSlot }` }，拖动调整切人键位置`, `${localizeDefaultCharacterName(role.name, roleSlot, language) }; drag to change the switch position`) }
              aria-label={text(`${role.name || `角色 ${roleSlot }` }，当前切人键 ${position }`, `${localizeDefaultCharacterName(role.name, roleSlot, language) }; current switch position ${position }`) }
              onPointerDown={(event) => beginPointerDrag(event, roleSlot) }
              onPointerMove={movePointerDrag }
              onPointerUp={(event) => endPointerDrag(event) }
              onPointerCancel={(event) => endPointerDrag(event, true) }
              onLostPointerCapture={() => { if (pointerDragRef.current) clearDragState();  } }
            >
              <span className="starting-role-avatar" style={avatarBackgroundStyle(role.avatar) }>{role.avatar ? null : roleSlot }</span>
              <small>{position }</small>
              <GripVertical size={12 } aria-hidden="true" />
            </button>
          );
         }) }
      </div>
    </div>
  );
 }function avatarBackgroundStyle(src?: string): CSSProperties {
  return src ? { backgroundImage: `url(${src })`, backgroundSize: 'cover', backgroundPosition: 'center'  } : { };
 }

function ComboInlineContent({ parts, className, textStyle  }: { parts: ReturnType<typeof comboTextParts>; className: string; textStyle?: CSSProperties  }) {
  return <strong className={className } style={textStyle }>{parts.map((part, index) => part.kind === 'icon' ? <span key={`${part.iconId }-${index }` } className="combo-inline-icon-mark" style={{ '--icon-scale': part.iconScale  } as CSSProperties }><img className="combo-inline-icon" src={part.src } alt={part.label } title={part.label } /></span> : <span key={`text-${index }` }>{part.value }</span>) }</strong>;
 }

function RhythmBlockSettings({ settings, onChange  }: { settings: RhythmUiSettings; onChange: (patch: Partial<RhythmUiSettings>) => void  }) {
  const { text  } = useI18n();
  return (
    <>
      <div className="appearance-settings-group rhythm-settings-group"><span>{text('画面与轨道', 'Canvas & Lanes') }</span><div className="appearance-grid stable-number-grid">
        <NumberDraftInput label={text('宽度', 'Width') } value={settings.width } min={120 } onCommit={(value) => onChange({ width: value  }) } />
        <NumberDraftInput label={text('高度', 'Height') } value={settings.height } min={120 } onCommit={(value) => onChange({ height: value  }) } />
        <NumberDraftInput label={text('整体缩放 %', 'Scale %') } value={Math.round(settings.scale * 100) } min={30 } onCommit={(value) => onChange({ scale: value / 100  }) } />
        <NumberDraftInput label={text('角色间距', 'Character Spacing') } value={settings.roleSpacing } min={24 } onCommit={(value) => onChange({ roleSpacing: value  }) } />
        <NumberDraftInput label={text('轨道间距', 'Lane Gap') } value={settings.laneGap } onCommit={(value) => onChange({ laneGap: value  }) } />
      </div></div>
      <div className="appearance-settings-group rhythm-settings-group"><span>{text('下落与判定', 'Falling & Timing') }</span><div className="appearance-grid stable-number-grid">
        <NumberDraftInput label={text('下落速度', 'Fall Speed') } value={Math.round(settings.fallSpeed * 1000) } min={30 } onCommit={(value) => onChange({ fallSpeed: value / 1000  }) } />
        <NumberDraftInput label={text('判定线偏移', 'Judge Line Offset') } value={settings.judgeLineOffset } min={20 } onCommit={(value) => onChange({ judgeLineOffset: value  }) } />
        <NumberDraftInput label={text('反馈 X%', 'Feedback X%') } value={settings.feedbackX } onCommit={(value) => onChange({ feedbackX: value  }) } />
        <NumberDraftInput label={text('反馈 Y%', 'Feedback Y%') } value={settings.feedbackY } onCommit={(value) => onChange({ feedbackY: value  }) } />
      </div></div>
      <div className="appearance-settings-group rhythm-settings-group"><span>{text('切人反馈', 'Switch Feedback') }</span><div className="appearance-grid stable-number-grid">
        <NumberDraftInput label={text('起始缩放 %', 'Start Scale %') } value={Math.round(settings.ringStartScale * 100) } min={20 } onCommit={(value) => onChange({ ringStartScale: value / 100  }) } />
        <NumberDraftInput label={text('结束缩放 %', 'End Scale %') } value={Math.round(settings.ringEndScale * 100) } min={20 } onCommit={(value) => onChange({ ringEndScale: value / 100  }) } />
        <NumberDraftInput label={text('偏移 X', 'Offset X') } value={settings.ringOffsetX } min={-1000 } onCommit={(value) => onChange({ ringOffsetX: value  }) } />
        <NumberDraftInput label={text('偏移 Y', 'Offset Y') } value={settings.ringOffsetY } min={-1000 } onCommit={(value) => onChange({ ringOffsetY: value  }) } />
        <NumberDraftInput label={text('时长 ms', 'Duration ms') } value={settings.ringDurationMs } min={80 } onCommit={(value) => onChange({ ringDurationMs: value  }) } />
      </div></div>
    </>
  );
 }

function RhythmGameDemo({ chart, style, practice, settings  }: { chart: ComboChart | null; style: ComboImageStyle; practice: PracticeSnapshot; settings: RhythmUiSettings  }) {
  const { language, text  } = useI18n();
  const [clockNow, setClockNow] = useState(() => performance.now());

  useEffect(() => {
    if (practice.status !== 'running') return;
    let frame = 0;
    const tick = () => {
      setClockNow(performance.now());
      frame = requestAnimationFrame(tick);
     };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
   }, [practice.status, practice.startedAt]);

  const orderedSteps = useMemo(() => [...(chart?.steps ?? [])].sort((left, right) => left.startMin - right.startMin || (left.characterSlot ?? 1) - (right.characterSlot ?? 1) || left.id.localeCompare(right.id)), [chart]);
  const chartEndMs = Math.max(3000, ...(chart?.steps ?? []).map((step) => step.startMin + step.durationMax + 1000));
  const elapsedMs = practice.status === 'running' && practice.startedAt !== null ? Math.max(0, clockNow - practice.startedAt) : Math.max(0, practice.elapsedMs ?? 0);
  const judgeY = clamp(settings.height - settings.judgeLineOffset, 120, settings.height - 90);
  const lookAheadMs = Math.ceil((judgeY + 180) / Math.max(0.01, settings.fallSpeed));
  const visibleSteps = orderedSteps.filter((step) => step.startMin + Math.max(120, step.durationMax) >= elapsedMs && step.startMin <= elapsedMs + lookAheadMs);
  const matchedStepIds = new Set(practice.matchedStepIds ?? []);
  const activeSlot = orderedSteps.filter((step) => step.startMin <= elapsedMs && (step.moveId === 'switch_1' || step.moveId === 'switch_2' || step.moveId === 'switch_3')).sort((left, right) => right.startMin - left.startMin)[0]?.moveId.replace('switch_', '') ?? orderedSteps[0]?.characterSlot ?? 1;
  const latestFeedback = practice.feedback.find((item) => item.stepId && item.level !== 'info');
  const latestJudgement = latestFeedback?.stepId ? practice.judgements?.[latestFeedback.stepId] : undefined;

  if (!chart) return <div className="rhythm-empty"><Music2 size={44 } /><strong>{text('暂无连段谱', 'No Combo Chart') }</strong><span>{text('从右侧读取连段谱后，这里会生成下落式操作块。', 'Select a combo chart on the right to generate falling action blocks here.') }</span></div>;

  return (
    <div className="rhythm-demo-shell">
      <div className="rhythm-demo-status">
        <span><b>{text('时长', 'Duration') }</b>{(chartEndMs / 1000).toFixed(1) }s</span>
        <span><b>{text('进度', 'Progress') }</b>{(elapsedMs / 1000).toFixed(2) }s</span>
        <span><b>{text('指令', 'Actions') }</b>{orderedSteps.length }</span>
      </div>
      <div className="rhythm-demo-stage" style={{ '--rhythm-stage-width': `${settings.width }px`, '--rhythm-stage-height': `${settings.height }px`, '--rhythm-lane-gap': `${settings.laneGap }px`, '--rhythm-role-spacing': `${settings.roleSpacing }px`, '--rhythm-judge-y': `${judgeY }px`  } as CSSProperties }>
        <div className="rhythm-lanes">
          {CHARACTER_SLOTS.map((slot) => {
            const role = style.roleStyles[slot];
            return (
              <div key={slot } className="rhythm-lane">
                {Number(activeSlot) === slot && <div className="rhythm-active-role-gradient" /> }
                <div className="rhythm-lane-label">{localizeDefaultCharacterName(role.name, slot, language) }</div>
                {visibleSteps.filter((step) => (step.characterSlot ?? 1) === slot).map((step) => {
                  const top = judgeY - (step.startMin - elapsedMs) * settings.fallSpeed - 34;
                  const contentText = style.contentLabels[step.id]?.trim() || localizedMoveLabel(step, language);
                  const parts = comboTextParts(maybeConvertTextToIconLabel(contentText, style.convertIcons), style.convertIcons, style.iconMappings);
                  const active = elapsedMs >= step.startMin && elapsedMs <= step.startMin + step.durationMax;
                  const matched = matchedStepIds.has(step.id);
                  const judgement = practice.judgements?.[step.id];
                  const opacity = elapsedMs <= step.startMin ? 1 : clamp(1 - (elapsedMs - step.startMin) / Math.max(1, step.durationMax), 0, 1);
                  return <div key={step.id } className={`rhythm-note ${step.moveId === 'heavy_attack' || step.moveId.endsWith('_hold') ? 'hold' : 'normal' } ${parts.length > 1 ? 'stacked' : '' } ${active ? 'active' : '' } ${matched ? 'matched' : '' } ${judgement ? `judge-${judgement }` : '' }`  } style={{ top, opacity  } as CSSProperties }><ComboInlineContent parts={parts } className="rhythm-note-content" /></div>;
                 }) }
              </div>
            );
           }) }
        </div>
        <div className="rhythm-judgement-line" />
        {latestJudgement && <div className={`rhythm-floating-feedback judge-${latestJudgement }`  } style={{ left: `${settings.feedbackX }%`, top: `${settings.feedbackY }%`  } as CSSProperties }>{latestJudgement.toUpperCase() }</div> }
        <div className="rhythm-avatar-row">
          {CHARACTER_SLOTS.map((slot) => {
            const role = style.roleStyles[slot];
            const promptStep = orderedSteps.find((step) => (step.characterSlot ?? 1) === slot && elapsedMs <= step.startMin + step.durationMax);
            return <div key={slot } className={`rhythm-avatar-cell ${Number(activeSlot) === slot ? 'active' : '' }`}><span className="rhythm-lane-prompt">{promptTextForStep(promptStep, language, style) }</span><span className="rhythm-avatar" style={avatarBackgroundStyle(role.avatar) }>{role.avatar ? null : slot }</span></div>;
           }) }
        </div>
      </div>
    </div>
  );
 }

function CapsuleBlockBackground() {
  return <div className="capsule-bg" aria-hidden="true"><div className="capsule-bg-edge left top" /><div className="capsule-bg-edge left bottom" /><div className="capsule-bg-edge middle top" /><div className="capsule-bg-edge middle bottom" /><div className="capsule-bg-edge right top" /><div className="capsule-bg-edge right bottom" /><div className="capsule-bg-body"><div className="capsule-bg-piece left" /><div className="capsule-bg-piece middle" /><div className="capsule-bg-piece right" /></div></div>;
 }

function imageCropBackground(src: string | undefined, crop = { x: 0, y: 0, w: 100, h: 100  }): CSSProperties {
  if (!src) return { };
  const safe = normalizeRectPercent(crop, { x: 0, y: 0, w: 100, h: 100  });
  return {
    backgroundImage: `url(${src })`,
    backgroundSize: `${10000 / safe.w }% ${10000 / safe.h }%`,
    backgroundPosition: `${safe.x <= 0 ? 0 : (safe.x / Math.max(1, 100 - safe.w)) * 100 }% ${safe.y <= 0 ? 0 : (safe.y / Math.max(1, 100 - safe.h)) * 100 }%`,
    backgroundRepeat: 'no-repeat'
   };
 }

function capsuleImageStyle(style: ComboImageStyle, width: number, height: number, roleStyle?: ComboImageStyle['roleStyles'][CharacterSlot]): CSSProperties {
  const capsule = effectiveCapsuleImageFields(style, roleStyle);
  if (style.blockMode !== 'image' || !capsule.image) return { };
  return {
    backgroundImage: 'none',
    borderColor: 'transparent',
    ...capsuleBackgroundVars(style, width, height, roleStyle)
   } as CSSProperties;
 }

function cssImageUrl(src: string): string {
  return `url("${src.replace(/\\/g, '\\\\').replace(/"/g, '\\"') }")`;
 }

function cssPx(value: number): string {
  return `${Number(value.toFixed(3)) }px`;
 }

function capsuleBackgroundVars(style: ComboImageStyle, targetWidthInput: number, targetHeightInput: number, roleStyle?: ComboImageStyle['roleStyles'][CharacterSlot]): CSSProperties {
  const capsule = effectiveCapsuleImageFields(style, roleStyle);
  const source = capsule.image ?? '';
  const naturalWidth = Math.max(1, capsule.width ?? style.capsuleWidth ?? 200);
  const naturalHeight = Math.max(1, capsule.height ?? style.capsuleHeight ?? 80);
  const crop = normalizeRectPercent(capsule.crop, { x: 0, y: 0, w: 100, h: 100  });
  const cropX = Math.round((crop.x / 100) * naturalWidth);
  const cropY = Math.round((crop.y / 100) * naturalHeight);
  const cropWidth = Math.max(1, Math.round((crop.w / 100) * naturalWidth));
  const cropHeight = Math.max(1, Math.round((crop.h / 100) * naturalHeight));
  const stretch = capsule.stretch ?? { left: 25, right: 75  };
  const leftLine = Math.round(clamp(((stretch.left ?? 25) / 100) * naturalWidth - cropX, 1, cropWidth - 2));
  const rightLine = Math.round(clamp(((stretch.right ?? 75) / 100) * naturalWidth - cropX, leftLine + 1, cropWidth - 1));
  const targetWidth = Math.max(1, Math.round(targetWidthInput));
  const targetHeight = Math.max(1, Math.round(targetHeightInput));
  const heightScale = targetHeight / cropHeight;
  const rawDestLeft = Math.max(0, leftLine * heightScale);
  const rawDestRight = Math.max(0, (cropWidth - rightLine) * heightScale);
  const minMiddle = Math.min(targetWidth, Math.max(24, targetHeight * 0.42));
  const availableForEdges = Math.max(0, targetWidth - minMiddle);
  const edgeScale = rawDestLeft + rawDestRight > availableForEdges ? availableForEdges / (rawDestLeft + rawDestRight) : 1;
  const destLeft = Math.min(targetWidth, Math.max(0, Math.round(rawDestLeft * edgeScale)));
  const destRight = Math.max(0, Math.min(targetWidth - destLeft, Math.round(rawDestRight * edgeScale)));
  const destMiddle = Math.max(0, targetWidth - destLeft - destRight);
  const stretchWidth = Math.max(1, rightLine - leftLine);
  const leftScaleX = destLeft / Math.max(1, leftLine);
  const middleScaleX = destMiddle / stretchWidth;
  const rightSourceWidth = Math.max(1, cropWidth - rightLine);
  const rightScaleX = destRight / rightSourceWidth;
  const edgeSource = capsuleEdgeSourceRange(naturalHeight, cropY, cropHeight, capsule.edge);
  const edgeTopHeight = Math.max(0, (cropY - edgeSource.y) * heightScale);
  const edgeBottomHeight = Math.max(0, (edgeSource.y + edgeSource.height - cropY - cropHeight) * heightScale);
  return {
    '--capsule-bg-source': cssImageUrl(source),
    '--capsule-bg-left-width': cssPx(destLeft),
    '--capsule-bg-middle-left': cssPx(destLeft),
    '--capsule-bg-middle-width': cssPx(destMiddle),
    '--capsule-bg-right-left': cssPx(destLeft + destMiddle),
    '--capsule-bg-right-width': cssPx(destRight),
    '--capsule-bg-left-size': `${cssPx(naturalWidth * leftScaleX) } ${cssPx(naturalHeight * heightScale) }`,
    '--capsule-bg-left-position': `${cssPx(-cropX * leftScaleX) } ${cssPx(-cropY * heightScale) }`,
    '--capsule-bg-middle-size': `${cssPx(naturalWidth * middleScaleX) } ${cssPx(naturalHeight * heightScale) }`,
    '--capsule-bg-middle-position': `${cssPx(-(cropX + leftLine) * middleScaleX) } ${cssPx(-cropY * heightScale) }`,
    '--capsule-bg-right-size': `${cssPx(naturalWidth * rightScaleX) } ${cssPx(naturalHeight * heightScale) }`,
    '--capsule-bg-right-position': `${cssPx(-(cropX + rightLine) * rightScaleX) } ${cssPx(-cropY * heightScale) }`,
    '--capsule-bg-edge-top-top': cssPx(-edgeTopHeight),
    '--capsule-bg-edge-top-height': cssPx(edgeTopHeight),
    '--capsule-bg-edge-bottom-top': cssPx(targetHeight),
    '--capsule-bg-edge-bottom-height': cssPx(edgeBottomHeight),
    '--capsule-bg-edge-left-position-x': cssPx(-cropX * leftScaleX),
    '--capsule-bg-edge-middle-position-x': cssPx(-(cropX + leftLine) * middleScaleX),
    '--capsule-bg-edge-right-position-x': cssPx(-(cropX + rightLine) * rightScaleX),
    '--capsule-bg-edge-top-position-y': cssPx(-edgeSource.y * heightScale),
    '--capsule-bg-edge-bottom-position-y': cssPx(-(cropY + cropHeight) * heightScale)
   } as CSSProperties;
 }

function capsuleBorderImage(style: ComboImageStyle, targetWidthInput: number, targetHeightInput: number): { source: string  } {
  const source = style.capsuleImage ?? '';
  const naturalWidth = Math.max(1, style.capsuleImageWidth ?? style.capsuleWidth ?? 200);
  const naturalHeight = Math.max(1, style.capsuleImageHeight ?? style.capsuleHeight ?? 80);
  const crop = normalizeRectPercent(style.capsuleCrop, { x: 0, y: 0, w: 100, h: 100  });
  const cropX = Math.round((crop.x / 100) * naturalWidth);
  const cropY = Math.round((crop.y / 100) * naturalHeight);
  const cropWidth = Math.max(1, Math.round((crop.w / 100) * naturalWidth));
  const cropHeight = Math.max(1, Math.round((crop.h / 100) * naturalHeight));
  const stretch = style.capsuleStretch ?? { left: 25, right: 75  };
  const leftLine = Math.round(clamp(((stretch.left ?? 25) / 100) * naturalWidth - cropX, 1, cropWidth - 2));
  const rightLine = Math.round(clamp(((stretch.right ?? 75) / 100) * naturalWidth - cropX, leftLine + 1, cropWidth - 1));
  const targetWidth = Math.max(1, Math.round(targetWidthInput));
  const targetHeight = Math.max(1, Math.round(targetHeightInput));
  const heightScale = targetHeight / cropHeight;
  const destLeft = Math.max(0, Math.round(leftLine * heightScale));
  const destRight = Math.max(0, Math.round((cropWidth - rightLine) * heightScale));
  const destMiddle = Math.max(0, targetWidth - destLeft - destRight);
  const stretchWidth = Math.max(1, rightLine - leftLine);
  const imageAttrs = `x="0" y="0" width="${naturalWidth }" height="${naturalHeight }" preserveAspectRatio="none" style="image-rendering:pixelated;image-rendering:crisp-edges"`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth }" height="${targetHeight }" viewBox="0 0 ${targetWidth } ${targetHeight }" preserveAspectRatio="none" shape-rendering="crispEdges"><svg x="0" y="0" width="${destLeft }" height="${targetHeight }" viewBox="${cropX } ${cropY } ${leftLine } ${cropHeight }" preserveAspectRatio="none"><image href="${source }" ${imageAttrs }/></svg><svg x="${destLeft }" y="0" width="${destMiddle }" height="${targetHeight }" viewBox="${cropX + leftLine } ${cropY } ${stretchWidth } ${cropHeight }" preserveAspectRatio="none"><image href="${source }" ${imageAttrs }/></svg><svg x="${destLeft + destMiddle }" y="0" width="${destRight }" height="${targetHeight }" viewBox="${cropX + rightLine } ${cropY } ${cropWidth - rightLine } ${cropHeight }" preserveAspectRatio="none"><image href="${source }" ${imageAttrs }/></svg></svg>`;
  return { source: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg) }`  };
 }


function comboTrackMetrics(items: ReturnType<typeof chartToComboImageItems>, layout: ComboLayout, style: ComboImageStyle): ComboTrackMetric[] {
  let cursor = 0;
  return items.map((item, index) => {
    if (index > 0) cursor += style.capsuleGap;
    const roleStyle = style.roleStyles[item.characterSlot];
    const size = comboImageItemSizeForDisplayItem(style, item, roleStyle);
    const extent = layout === 'vertical' ? size.height : size.width;
    const metric = { extent, start: cursor, center: cursor + extent / 2  };
    cursor += extent;
    return metric;
   });
 }

function metricsExtentForItems(items: ReturnType<typeof chartToComboImageItems>, style: ComboImageStyle): number {
  const metrics = comboTrackMetrics(items, 'horizontal', style);
  const last = metrics.at(-1);
  return last ? last.start + last.extent : 0;
 }
function comboItemOpacity(metric: ComboTrackMetric | undefined, activeMetric: ComboTrackMetric | undefined, trackOffset: number, layout: ComboLayout, bounds: OverlaySettings, style: ComboImageStyle): number {
  if (!style.fadeEnabled || !metric || !activeMetric) return 1;
  const viewport = Math.max(1, layout === 'vertical' ? bounds.height : bounds.width);
  const position = metric.center + trackOffset;
  const activePosition = activeMetric.center + trackOffset;
  const distance = Math.abs(position - activePosition);
  const maxDistance = Math.max(1, viewport / 2);
  const ratio = clamp(distance / maxDistance, 0, 1);
  const strength = clamp(style.fadeRange / 100, 0, 1);
  return Number((1 - ratio * strength).toFixed(3));
 }

function comboTrackOffset(items: ReturnType<typeof chartToComboImageItems>, activeIndex: number, layout: ComboLayout, bounds: OverlaySettings, style: ComboImageStyle): number {
  if (!items.length) return 0;
  const current = clamp(activeIndex, 0, items.length - 1);
  const metrics = comboTrackMetrics(items, layout, style);
  const activeMetric = metrics[current];
  if (!activeMetric) return 0;
  const viewport = Math.max(1, layout === 'vertical' ? bounds.height : bounds.width);
  if (style.scrollAnchor === 'center') return Math.round(viewport / 2 - activeMetric.center);
  return Math.round(style.scrollStartOffsetPx - activeMetric.start);
 }

function timedStepIndexForPractice(chart: ComboChart | null, practice: PracticeSnapshot, floorIndex = 0): number | null {
  if (!chart?.steps.length) return 0;
  if (practice.status === 'running' && practice.startedAt !== null) {
    const elapsed = Math.max(0, practice.elapsedMs ?? performance.now() - practice.startedAt);
    const startedTimedStep = chart.steps
      .map((step, index) => ({ step, index  }))
      .filter(({ step  }) => elapsed >= step.startMin)
      .sort((left, right) => right.step.startMin - left.step.startMin || right.index - left.index)[0];
    if (startedTimedStep) return Math.max(floorIndex, startedTimedStep.index);
   }
  return null;
 }

function activeFrameVars(showAvatar: boolean, blockMode: ComboImageStyle['blockMode'], avatarLeft: number, avatarSize: number, avatarOffsetY: number, blockHeight: number, visualHeight = blockHeight): CSSProperties {
  if (blockMode !== 'image') return { };
  const bleed = 3;
  const frameHeight = Math.min(blockHeight, Math.max(1, visualHeight));
  const centeredInset = Math.max(-bleed, (blockHeight - frameHeight) / 2 - bleed);
  const avatarTop = blockHeight / 2 + avatarOffsetY - avatarSize / 2;
  const avatarBottom = blockHeight / 2 + avatarOffsetY + avatarSize / 2;
  return {
    '--active-frame-left': `${showAvatar ? Math.min(-bleed, avatarLeft - bleed) : -bleed }px`,
    '--active-frame-right': `${-bleed }px`,
    '--active-frame-top': `${showAvatar ? Math.min(centeredInset, avatarTop - bleed) : centeredInset }px`,
    '--active-frame-bottom': `${showAvatar ? Math.min(centeredInset, blockHeight - avatarBottom - bleed) : centeredInset }px`
   } as CSSProperties;
 }

function ComboItemContent({ item, parts, className, mappings, activeMergedStepId, textStyle  }: { item: ReturnType<typeof chartToComboImageItems>[number]; parts: ReturnType<typeof comboTextParts>; className: string; mappings: ComboImageStyle['iconMappings']; activeMergedStepId?: string; textStyle?: CSSProperties  }) {
  if (item.mergedParts?.length && activeMergedStepId) {
    return <strong className={className } style={textStyle }>{item.mergedParts.map((part) => {
      const active = part.stepId === activeMergedStepId;
      return <span key={part.stepId } className={active ? 'combo-merged-part active' : 'combo-merged-part' }>{comboTextParts(part.displayText, Boolean(part.iconId), mappings).map((piece, index) => piece.kind === 'icon' ? <span key={`${piece.iconId }-${index }` } className={active ? 'combo-inline-icon-mark active' : 'combo-inline-icon-mark'  } style={{ '--icon-scale': piece.iconScale  } as CSSProperties }><img className="combo-inline-icon" src={piece.src } alt={piece.label } title={piece.label } /></span> : <span key={`text-${index }` }>{piece.value }</span>) }</span>;
     }) }</strong>;
   }
  return <ComboInlineContent parts={parts } className={className } textStyle={textStyle } />;
 }

function comboTextStrokeStyle(style: ComboImageStyle): CSSProperties | undefined {
  if (!style.textStrokeEnabled || style.textStrokeWidth <= 0) return undefined;
  return { WebkitTextStroke: `${style.textStrokeWidth }px ${style.textStrokeColor }`, paintOrder: 'stroke fill'  };
 }

function shouldShowPromptForStep(step: ComboStep | null | undefined): step is ComboStep {
  return Boolean(step && !step.free && (step.moveId === 'empty_action' || step.moveId === 'basic_attack' || (!step.independent && step.advancesStep !== false)));
 }

function defaultPromptTextForStep(step: ComboStep | null | undefined, language: AppLanguage, style: ComboImageStyle): string {
  if (!step) return '';
  const contentText = style.contentLabels[step.id]?.trim() || defaultComboContentLabelForMoveId(step.moveId);
  return localizedMovePrompt(step.moveId, displayMoveLabel(step), contentText, language);
 }

function promptTextForStep(step: ComboStep | null | undefined, language: AppLanguage, style: ComboImageStyle): string {
  if (!step) return '';
  if (step.note?.trim()) return step.note.trim();
  return defaultPromptTextForStep(step, language, style);
 }

function ComboImagePreview({ chart, practice, style, layout, bounds, mergedHighlightMode = 'time', manualHorizontalScroll = false  }: { chart: ComboChart | null; practice: PracticeSnapshot; style: ComboImageStyle; layout: ComboLayout; bounds: OverlaySettings; mergedHighlightMode?: 'time' | 'input'; manualHorizontalScroll?: boolean  }) {
  const { language, text  } = useI18n();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef({ runKey: '', activeStepIndex: 0, indicatorStepIndex: 0  });
  const [measuredBounds, setMeasuredBounds] = useState<OverlaySettings | null>(null);
  const [nextIndicatorSide, setNextIndicatorSide] = useState<'above' | 'below' | 'left' | 'right'>('above');
  const [manualScrollPercent, setManualScrollPercent] = useState(0);
  const activeIndex = chart?.steps.length ? clamp(practice.currentStepIndex ?? 0, 0, chart.steps.length - 1) : 0;
  const timedIndex = timedStepIndexForPractice(chart, practice, activeIndex);
  const effectiveBounds = measuredBounds ?? bounds;
  const linearLayout = layout === 'waterfall' ? 'horizontal' : layout;
  const previewStyle = layout === 'waterfall' && style.mergeSameRoleSteps ? normalizeComboImageStyle({ ...style, mergeSameRoleSteps: false  }) : style;
  const allItems = chartToComboImageItems(chart, previewStyle, linearLayout, effectiveBounds);
  const activeStep = chart?.steps[activeIndex] ?? null;
  const rawIndicatorStepIndex = previewStyle.mergeSameRoleSteps ? Math.min(chart?.steps.length ?? 0, activeIndex + 1) : activeIndex + 1;
  const runKey = `${chart?.id ?? 'none' }:${practice.startedAt ?? 'idle' }:${practice.status }`;
  if (progressRef.current.runKey !== runKey || practice.status !== 'running') progressRef.current = { runKey, activeStepIndex: activeIndex, indicatorStepIndex: rawIndicatorStepIndex  };
  else progressRef.current = { runKey, activeStepIndex: Math.max(progressRef.current.activeStepIndex, activeIndex), indicatorStepIndex: Math.max(progressRef.current.indicatorStepIndex, rawIndicatorStepIndex)  };
  const activeStepIndex = clamp(progressRef.current.activeStepIndex, 0, Math.max(0, (chart?.steps.length ?? 1) - 1));
  const indicatorStepIndex = clamp(progressRef.current.indicatorStepIndex, 0, Math.max(0, (chart?.steps.length ?? 1) - 1));
  const timedStepId = timedIndex === null ? undefined : chart?.steps[Math.max(timedIndex, activeStepIndex)]?.id;
  const activeDisplayStepId = chart?.steps[activeStepIndex]?.id;
  const mergedHighlightStepId = mergedHighlightMode === 'input' ? activeDisplayStepId : timedStepId;
  const indicatorStepId = chart?.steps[indicatorStepIndex]?.id ?? activeDisplayStepId;
  const activeDisplayIndex = comboImageDisplayIndexForStep(allItems, activeDisplayStepId);
  const indicatorDisplayIndex = comboImageDisplayIndexForStep(allItems, indicatorStepId);
  const items = visibleComboImageItems(allItems, activeDisplayIndex, linearLayout, effectiveBounds, style);
  const automaticTrackOffset = comboTrackOffset(allItems, activeDisplayIndex, linearLayout, effectiveBounds, style);
  const horizontalTrackWidth = metricsExtentForItems(allItems, style);
  const manualScrollRange = Math.max(0, horizontalTrackWidth - effectiveBounds.width + 24);
  const trackOffset = manualHorizontalScroll && linearLayout === 'horizontal' ? -(manualScrollPercent / 100) * manualScrollRange : automaticTrackOffset;
  const metrics = comboTrackMetrics(allItems, linearLayout, style);
  const activeMetric = metrics[clamp(activeDisplayIndex, 0, Math.max(0, metrics.length - 1))];
  const background = comboImageBackgroundSource(style);
  const periodLabel = currentPeriodLabel(chart, activeStepIndex, language);
  const displayActiveStep = chart?.steps[activeStepIndex] ?? activeStep;
  const promptStep = style.prePromptEnabled && shouldShowPromptForStep(displayActiveStep) ? displayActiveStep : null;
  const promptSide = layout === 'horizontal' ? nextIndicatorSide : (nextIndicatorSide === 'right' ? 'left' : 'right');
  const promptText = promptTextForStep(promptStep, language, style);
  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setMeasuredBounds({ ...bounds, width: Math.max(1, rect.width), height: Math.max(1, rect.height)  });
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      setNextIndicatorSide(layout === 'vertical' ? (centerX < window.innerWidth / 2 ? 'right' : 'left') : (centerY > window.innerHeight / 2 ? 'above' : 'below'));
     };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
     };
   }, [bounds.x, bounds.y, bounds.width, bounds.height, layout]);
  return (
    <div ref={previewRef } className={`combo-preview ${layout } next-indicator-${nextIndicatorSide } ${manualHorizontalScroll ? 'manual-scroll' : '' } ${items.length ? '' : 'empty' }`  } style={{ backgroundImage: background ? `url(${background })` : undefined  } }>
      {periodLabel && <div className="combo-period-label">{periodLabel }</div> }
      {items.length ? <div className="combo-preview-track" style={{ gap: style.capsuleGap, transform: layout === 'vertical' ? `translateY(${trackOffset }px)` : `translateX(${trackOffset }px)`  } }>{items.map((item) => {
        const roleStyle = style.roleStyles[item.characterSlot];
        const chipSize = comboImageItemSizeForDisplayItem(style, item, roleStyle);
        const itemIconMappings = effectiveIconMappings(style, item.characterSlot);
        const contentParts = comboTextParts(item.displayText, Boolean(item.iconId), itemIconMappings);
        const blockColor = style.blockMode === 'capsule' ? roleStyle.color : 'transparent';
        const blockImageStyle = capsuleImageStyle(style, chipSize.width, chipSize.height, roleStyle);
        const avatarLeft = style.avatarOffsetX;
        const frameVisualHeight = style.blockMode === 'image' ? Math.min(chipSize.height, style.capsuleHeight) : chipSize.height;
        const triangleCenter = comboImageContentCenterPercent(item, indicatorStepId);
        const activeMergedStepId = previewStyle.mergeSameRoleSteps && comboImageItemContainsStep(item, mergedHighlightStepId) ? mergedHighlightStepId : undefined;
        const isNext = style.prePromptEnabled && comboImageItemContainsStep(item, indicatorStepId) && indicatorDisplayIndex !== activeDisplayIndex;
        const metricIndex = allItems.indexOf(item);
        const isError = Boolean(item.mergedStepIds?.some((stepId) => practice.errorStepIds.includes(stepId)) || practice.errorStepIds.includes(item.step.id));
        return (
          <div key={item.step.id } className={`combo-preview-chip ${style.blockMode === 'image' ? 'image-block' : '' } ${item.showAvatar ? 'with-avatar' : '' } ${comboImageItemContainsStep(item, activeDisplayStepId) ? 'active' : '' } ${isNext ? 'next' : '' } ${isError ? 'error' : '' }`  } style={{ width: chipSize.width, height: chipSize.height, color: style.textColor, fontSize: style.fontSize, fontFamily: style.fontFamily, opacity: isNext ? 1 : comboItemOpacity(metrics[metricIndex], activeMetric, trackOffset, layout, effectiveBounds, style), backgroundColor: blockColor, borderRadius: style.blockMode === 'capsule' && style.capsuleShape === 'capsule' ? 999 : 4, '--move-color': roleStyle.color, '--next-indicator-x': `${triangleCenter ?? 50 }%`, ...blockImageStyle, ...activeFrameVars(item.showAvatar, style.blockMode, avatarLeft, style.avatarSize, style.avatarOffsetY, chipSize.height, frameVisualHeight)  } as CSSProperties }>
            {style.blockMode === 'image' && <CapsuleBlockBackground /> }
            {item.showAvatar && <span className="avatar-slot preview-avatar" style={{ width: style.avatarSize, height: style.avatarSize, left: avatarLeft, transform: `translateY(calc(-50% + ${style.avatarOffsetY }px))`, ...imageCropBackground(roleStyle.avatar, roleStyle.avatarCrop)  } }>{roleStyle.avatar ? null : item.characterSlot }</span> }
            {layout === 'horizontal' && promptText && comboImageItemContainsStep(item, promptStep?.id) && <div className={`combo-preview-action-prompt horizontal ${promptSide }` }>{promptText }</div> }
            {layout === 'vertical' && promptText && comboImageItemContainsStep(item, activeDisplayStepId) && <div className={`combo-preview-action-prompt vertical ${nextIndicatorSide }` }>{promptText }</div> }
            <ComboItemContent item={item } parts={contentParts } className="combo-preview-content" mappings={itemIconMappings } activeMergedStepId={activeMergedStepId } textStyle={comboTextStrokeStyle(style) } />
          </div>
        );
       }) }</div> : text('暂无连段图', 'No Combo Chart') }
      {manualHorizontalScroll && layout === 'horizontal' && <div className="combo-preview-scrollbar"><input type="range" min="0" max="100" step="0.1" value={manualScrollPercent } disabled={manualScrollRange <= 0 } aria-label={text('连段图横向位置', 'Combo Chart Horizontal Position') } onChange={(event) => setManualScrollPercent(Number(event.target.value)) } /></div> }
    </div>
  );
 }

type TimelineContext = {
  x: number;
  y: number;
  stepId?: string;
  stepIds?: string[];
  periodId?: string;
  coveredSteps: ComboStep[];
  coveredPeriods: ComboPeriod[];
 };
type TimelineSubmenuKey = 'change';
type VideoLayerTransformControl = { active: boolean; onToggle: () => void; onScalePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void; onScalePointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void; onScalePointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;  };

type TimelineLane = {
  slot: CharacterSlot;
  lane: LaneKind;
  id: string;
  laneNumber: 1 | 2;
 };

type TimelineZoomFrame = { id: string; timeMs: number  };
type TimelinePlayheadControl = {
  playbackMs: number;
  onSeek: (timeMs: number) => void;
  disabled?: boolean;
  isPlaying?: boolean;
  onTogglePlaying?: () => void;
  playbackRate?: number;
  onPlaybackRateChange?: (rate: number) => void;
  autoFollow?: boolean;
  onAutoFollowChange?: (enabled: boolean) => void;
 };
type TimelineZoomFrameTrack = TimelineHistoryControl & {
  frames: TimelineZoomFrame[];
  playbackMs: number;
  onPlace: (timeMs: number) => void;
  onSeek: (timeMs: number) => void;
  onDelete: (frameId: string) => void;
  onBeginDrag: (event: ReactPointerEvent<HTMLButtonElement>, frameId: string, renderTotal: number) => void;
  onDragMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
 };


function createDraftStep(point: { slot: CharacterSlot; lane: LaneKind; startMs: number  }): ComboStep {
  return normalizeStep({
    id: crypto.randomUUID(),
    moveId: DRAFT_MOVE_ID,
    label: '待设置指令',
    characterSlot: point.slot,
    lane: point.lane,
    independent: false,
    startMin: Math.max(0, Math.round(point.startMs)),
    startMax: Math.max(0, Math.round(point.startMs + 120)),
    durationMin: 35,
    durationMax: 300,
    color: '#9099a3',
    advancesStep: false,
    manualFree: false,
    free: false,
    samples: []
   });
 }


function createPlacedMoveStep(move: MoveDefinition, point: { slot: CharacterSlot; lane: LaneKind; startMs: number  }): ComboStep {
  const startMs = Math.max(0, Math.round(point.startMs));
  return normalizeStep({
    id: crypto.randomUUID(),
    moveId: move.id,
    label: move.label,
    characterSlot: point.slot,
    lane: point.lane,
    independent: move.independent,
    startMin: startMs,
    startMax: startMs,
    durationMin: 500,
    durationMax: 500,
    color: move.color,
    advancesStep: move.advancesStep,
    manualFree: false,
    free: false,
    samples: []
   });
 }

function inferPeriodPlacementPreview(point: { slot?: CharacterSlot; lane?: LaneKind; startMs: number  }, periods: ComboPeriod[]): { kind: ComboPeriodKind; label: string } {
  const startMs = Math.max(0, Math.round(point.startMs));
  if (point.slot && point.lane) return { kind: 'free_fire', label: defaultPeriodLabel('free_fire') };
  const startup = periods.find((period) => period.kind === 'startup_axis');
  if (!startup) return { kind: 'startup_axis', label: defaultPeriodLabel('startup_axis') };
  const loopIndex = periods.filter((period) => period.kind === 'loop_axis').length + 1;
  return { kind: 'loop_axis', label: defaultPeriodLabel('loop_axis', loopIndex) };
}

function inferPeriodPlacement(point: { slot?: CharacterSlot; lane?: LaneKind; startMs: number  }, periods: ComboPeriod[]): ComboPeriod {
  const startMs = Math.max(0, Math.round(point.startMs));
  if (point.slot && point.lane) {
    return normalizePeriod({ id: crypto.randomUUID(), kind: 'free_fire', label: defaultPeriodLabel('free_fire'), characterSlot: point.slot, lane: point.lane, startMs, endMs: startMs + DEFAULT_FREE_FIRE_DURATION  });
   }
  const startup = periods.find((period) => period.kind === 'startup_axis');
  if (!startup) {
    return normalizePeriod({ id: crypto.randomUUID(), kind: 'startup_axis', label: defaultPeriodLabel('startup_axis'), startMs: 0, endMs: DEFAULT_AXIS_DURATION  });
   }
  const loopIndex = periods.filter((period) => period.kind === 'loop_axis').length + 1;
  const axisEnd = Math.max(startup?.endMs ?? 0, ...periods.filter((period) => period.kind === 'loop_axis').map((period) => period.endMs), 0);
  const axisStart = Math.abs(startMs - axisEnd) <= AXIS_PLACEMENT_WINDOW ? axisEnd : startMs;
  return normalizePeriod({ id: crypto.randomUUID(), kind: 'loop_axis', label: defaultPeriodLabel('loop_axis', loopIndex), startMs: axisStart, endMs: axisStart + DEFAULT_AXIS_DURATION, loopIndex  });
 }

function moveLabelForPeriodKind(kind: ComboPeriodKind, periods: ComboPeriod[]) {
  const loopIndex = periods.filter((period) => period.kind === 'loop_axis').length + 1;
  return defaultPeriodLabel(kind, loopIndex);
 }

function displayMoveDefinitionLabel(move: Pick<MoveDefinition, 'id' | 'label'>): string {
  if (move.id === 'switch_1') return '1';
  if (move.id === 'switch_2') return '2';
  if (move.id === 'switch_3') return '3';
  return move.label;
 }

function displayMoveLabel(step: ComboStep): string {
  return displayMoveDefinitionLabel({ id: step.moveId, label: step.label  });
 }

function localizedMoveDefinitionLabel(move: Pick<MoveDefinition, 'id' | 'label'>, language: AppLanguage): string {
  const displayLabel = displayMoveDefinitionLabel(move);
  return localizedDefaultMoveLabel(move.id, displayLabel, language);
 }

function localizedMoveLabel(step: ComboStep, language: AppLanguage): string {
  return localizedMoveDefinitionLabel({ id: step.moveId, label: step.label  }, language);
 }

function msToSeconds(value: number | undefined): number {
  return Number(((value ?? 0) / 1000).toFixed(3));
 }

function secondsToMs(value: string | number): number {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0;
 }

function formatTimelineMs(ms: number): string {
  return `${(ms / 1000).toFixed(3).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1') }s`;
 }

function TimelineEditor({ chart, moves, bindings, shortcutSettings, inputSignal, comboImageStyle, mode, onModeChange, zoom, onZoomChange, playheadControl, onUpdate, onInsert, onDelete, onPeriodsChange, onContentChange, onQuickInput, onSave, historyControl, zoomFrameTrack, videoLayerTransformControl, videoLaneHeight, inspectorPortalTarget, toolbarPortalTarget, renderTotalOverride, keyboardShortcutsEnabled = true, videoAutoFollow = false  }: { chart: ComboChart; moves: MoveDefinition[]; bindings: KeyBinding[]; shortcutSettings: ShortcutSettings; inputSignal?: (TrainerLikeInputEvent & { id: string  }) | null; comboImageStyle: ComboImageStyle; mode: EditorTab; onModeChange?: (mode: EditorTab) => void; zoom: number; onZoomChange: (value: number) => void; playheadControl?: TimelinePlayheadControl; onUpdate: (stepId: string, patch: Partial<ComboStep>) => void; onInsert: (steps: ComboStep[]) => void; onDelete: (stepIds: string[]) => void; onPeriodsChange: (periods: ComboPeriod[]) => void; onContentChange: (patch: Partial<ComboImageStyle>) => void; onQuickInput: (stepId: string | null) => void; onSave: () => void; historyControl?: TimelineHistoryControl; zoomFrameTrack?: TimelineZoomFrameTrack; videoLayerTransformControl?: VideoLayerTransformControl; videoLaneHeight?: number; inspectorPortalTarget?: HTMLElement | null; toolbarPortalTarget?: HTMLElement | null; renderTotalOverride?: number; keyboardShortcutsEnabled?: boolean; videoAutoFollow?: boolean  }) {
  const { language, text  } = useI18n();
  const [selectedId, setSelectedId] = useState(chart.steps[0]?.id ?? '');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [pending, setPending] = useState<PendingPlacement | null>(null);
  const [lastPlacementMoveId, setLastPlacementMoveId] = useState<string | null>(null);
  const [lastPlacementAdaptiveSwitch, setLastPlacementAdaptiveSwitch] = useState(false);
  const [lastPlacementContentLabel, setLastPlacementContentLabel] = useState<string | null>(null);
  const [lastPlacementContentSuffix, setLastPlacementContentSuffix] = useState<string | null>(null);
  const [compactAddMenuOpen, setCompactAddMenuOpen] = useState(false);
  const [playbackMenuOpen, setPlaybackMenuOpen] = useState(false);
  const [pendingPoint, setPendingPoint] = useState<{ slot?: CharacterSlot; lane?: LaneKind; startMs: number  } | null>(null);
  const [copiedSelection, setCopiedSelection] = useState<CopiedTimelineSelection | null>(null);
  const [context, setContext] = useState<TimelineContext | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0  });
  const [activeContextSubmenu, setActiveContextSubmenu] = useState<TimelineSubmenuKey | null>(null);
  const [contextSubmenuPosition, setContextSubmenuPosition] = useState({ x: 0, y: 0  });
  const [raisedStepId, setRaisedStepId] = useState<string | null>(null);
  const [raisedPeriodId, setRaisedPeriodId] = useState<string | null>(null);
  const [dragRenderTotal, setDragRenderTotal] = useState<number | null>(null);
  const [timelineViewport, setTimelineViewport] = useState({ scrollLeft: 0, clientWidth: 0  });
  const placementToggleRef = useRef<{ code: string; time: number  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const contextSubmenuRef = useRef<HTMLDivElement | null>(null);
  const contextSubmenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const playbackMenuRef = useRef<HTMLDivElement | null>(null);
  const pendingEdgeScrollerRef = useRef<{ update: (clientX: number) => void; stop: () => void  } | null>(null);
  const pendingEdgePointerRef = useRef({ x: 0, y: 0  });
  const playheadFollowRef = useRef<{ playbackMs: number; contentX: number  } | null>(null);
  const videoCompactMode = Boolean(zoomFrameTrack);
  const compactLaneHeight = Math.round(clamp(videoLaneHeight ?? 48, 24, 64));
  const compactLaneGap = Math.round(clamp(compactLaneHeight / 12, 2, 6));
  const compactBlockHeight = Math.round(clamp(compactLaneHeight - 14, 18, 50));
  const compactBlockTop = Math.round((compactLaneHeight - compactBlockHeight) / 2);
  const compactFontSize = Math.round(clamp((compactLaneHeight / 48) * 12, 10, 14));
  const compactDragScale = compactLaneHeight / 48;
  const timelineEditorStyle = videoCompactMode ? {
    '--video-timeline-row-height': `${compactLaneHeight }px`,
    '--video-timeline-row-gap': `${compactLaneGap }px`,
    '--video-timeline-block-height': `${compactBlockHeight }px`,
    '--video-timeline-block-top': `${compactBlockTop }px`,
    '--video-timeline-font-size': `${compactFontSize }px`,
    '--video-timeline-input-height': `${Math.max(14, compactBlockHeight - 6) }px`,
    '--video-timeline-drag-scale': compactDragScale,
    '--video-timeline-drag-top': `${Math.round(-10 * compactDragScale) }px`
  } as CSSProperties : undefined;
  const activeHistoryControl = zoomFrameTrack ?? historyControl;
  const actionMoves = moves.filter((move) => move.id !== 'start_challenge' && move.id !== 'stop_recording');
  const contextChangeMoves = actionMoves.filter((move) => move.id !== 'switch_2' && move.id !== 'switch_3');
  const placeableMoves = actionMoves;
  const activePlacedMove = pending?.kind === 'move' ? placeableMoves.find((move) => move.id === pending.moveId) ?? placeableMoves[0] ?? null : null;
  const activePlacementLabel = pending?.kind === 'move' && pending.contentLabel === 'f'
    ? text('处决', 'Finisher')
    : pending?.kind === 'move' && pending.adaptiveSwitch && pending.contentSuffix === 'b'
      ? text('变奏切人', 'Intro Character Switch')
      : pending?.kind === 'move' && pending.adaptiveSwitch
        ? text('切人', 'Switch Character')
        : activePlacedMove
          ? localizedMoveDefinitionLabel(activePlacedMove, language)
          : null;
  const periods = constrainAxisPeriods(chart.periods ?? []);
  const pendingPeriodPreview = pending?.kind === 'period' && pendingPoint ? inferPeriodPlacementPreview(pendingPoint, periods) : null;
  const selected = chart.steps.find((step) => step.id === selectedId) ?? chart.steps[0] ?? null;
  const selectedSteps = chart.steps.filter((step) => selectedIds.includes(step.id));
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId) ?? null;
  const copiedGhost = pending?.kind === 'copy' && pendingPoint ? pending : null;
  const copiedGhostPoint = copiedGhost ? pendingPoint : null;
  const total = Math.max(3000, renderTotalOverride ?? 0, ...chart.steps.map((step) => step.startMax + step.durationMax + 600), ...periods.map((period) => period.endMs + 600), ...(zoomFrameTrack?.frames.map((frame) => frame.timeMs + 600) ?? []));
  const renderTotal = dragRenderTotal ?? total;
  const trackWidth = Math.max(760, Math.ceil(renderTotal * zoom));
  const timelineBodyStyle = { width: trackWidth + 112, '--timeline-track-width': `${trackWidth }px`  } as CSSProperties;
  const activePlayheadControl = playheadControl ?? (zoomFrameTrack ? { playbackMs: zoomFrameTrack.playbackMs, onSeek: zoomFrameTrack.onSeek  } : undefined);
  const activeTimelineAutoFollow = activePlayheadControl?.autoFollow ?? videoAutoFollow;
  const activePlaybackRate = activePlayheadControl?.playbackRate ?? 1;
  const previousTrackGeometryRef = useRef({ trackWidth, renderTotal  });
  const playheadContentX = 112 + (clamp(activePlayheadControl?.playbackMs ?? 0, 0, renderTotal) / Math.max(1, renderTotal)) * trackWidth;
  const playheadOffscreenDirection = activePlayheadControl && timelineViewport.clientWidth > 0
    ? playheadContentX < timelineViewport.scrollLeft
      ? 'left'
      : playheadContentX > timelineViewport.scrollLeft + timelineViewport.clientWidth
        ? 'right'
        : null
    : null;
  useLayoutEffect(() => {
    const previous = previousTrackGeometryRef.current;
    previousTrackGeometryRef.current = { trackWidth, renderTotal  };
    const node = scrollRef.current;
    if (!node || (previous.trackWidth === trackWidth && previous.renderTotal === renderTotal)) return;
    const anchorMs = clamp(activePlayheadControl?.playbackMs ?? 0, 0, Math.max(previous.renderTotal, renderTotal));
    const previousX = 112 + (anchorMs / Math.max(1, previous.renderTotal)) * previous.trackWidth;
    const nextX = 112 + (anchorMs / Math.max(1, renderTotal)) * trackWidth;
    const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    node.scrollLeft = clamp(node.scrollLeft + nextX - previousX, 0, maxScrollLeft);
    setTimelineViewport({ scrollLeft: node.scrollLeft, clientWidth: node.clientWidth  });
   }, [trackWidth, renderTotal]);
  const timelineClientXToMs = (clientX: number, targetTotal = renderTotal) => {
    const node = scrollRef.current;
    if (!node) return 0;
    const rect = node.getBoundingClientRect();
    const trackX = clientX - rect.left + node.scrollLeft - 112;
    return Math.round(clamp((trackX / Math.max(1, trackWidth)) * targetTotal, 0, targetTotal));
   };
  function scrollToTimelineMs(timeMs: number) {
    const node = scrollRef.current;
    if (!node) return;
    const targetLeft = (clamp(timeMs, 0, renderTotal) / Math.max(1, renderTotal)) * trackWidth;
    node.scrollTo({ left: Math.max(0, targetLeft - node.clientWidth * 0.45), behavior: 'smooth'  });
   }
  function createTimelineEdgeScroller(onScroll?: () => void) {
    const node = scrollRef.current;
    let direction: -1 | 0 | 1 = 0;
    let lastClientX = 0;
    let delayTimer = 0;
    let frameId = 0;
    let lastFrameTime = 0;
    const stopTimers = () => {
      if (delayTimer) window.clearTimeout(delayTimer);
      if (frameId) window.cancelAnimationFrame(frameId);
      delayTimer = 0;
      frameId = 0;
      lastFrameTime = 0;
     };
    const stop = () => {
      stopTimers();
      direction = 0;
     };
    const step = (time: number) => {
      if (!node || !direction) {
        stop();
        return;
       }
      if (!lastFrameTime) lastFrameTime = time;
      const elapsed = Math.min(32, time - lastFrameTime);
      lastFrameTime = time;
      const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
      const pxPerSecond = Math.max(260, Math.min(720, node.clientWidth * 0.68));
      const nextScrollLeft = clamp(node.scrollLeft + direction * pxPerSecond * (elapsed / 1000), 0, maxScrollLeft);
      if (Math.abs(nextScrollLeft - node.scrollLeft) < 0.1) {
        frameId = window.requestAnimationFrame(step);
        return;
       }
      node.scrollLeft = nextScrollLeft;
      onScroll?.();
      frameId = window.requestAnimationFrame(step);
     };
    const arm = () => {
      if (delayTimer || frameId) return;
      delayTimer = window.setTimeout(() => {
        delayTimer = 0;
        frameId = window.requestAnimationFrame(step);
       }, 1000);
     };
    const update = (clientX: number) => {
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const edgeWidth = Math.min(82, Math.max(48, rect.width * 0.08));
      const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
      const nextDirection: -1 | 0 | 1 = clientX <= rect.left + edgeWidth && node.scrollLeft > 0
        ? -1
        : clientX >= rect.right - edgeWidth && node.scrollLeft < maxScrollLeft
          ? 1
          : 0;
      const returning = direction === -1 && clientX - lastClientX > 2 || direction === 1 && lastClientX - clientX > 2;
      lastClientX = clientX;
      if (!nextDirection || nextDirection !== direction || returning) {
        stopTimers();
        direction = nextDirection;
       }
      if (direction) arm();
     };
    return { update, stop  };
   }
  function updatePendingPointFromClient(clientX: number, clientY: number) {
    if (!pending || pending.kind === 'cut' || pending.kind === 'delete') return;
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const lane = laneHit(clientX, clientY);
    const onGlobalTrack = Boolean(element?.closest('.timeline-editor-period-track, .timeline-zoom-frame-track'));
    const startMs = timelineClientXToMs(clientX);
    if (lane) setPendingPoint({ slot: lane.slot, lane: lane.lane, startMs  });
    else if (onGlobalTrack || pending.kind === 'period' || pending.kind === 'copy' || pending.kind === 'zoom') setPendingPoint({ startMs  });
   }
  function stopPendingEdgeScroll() {
    pendingEdgeScrollerRef.current?.stop();
    pendingEdgeScrollerRef.current = null;
   }
  function handlePendingEdgeMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pending || pending.kind === 'cut' || pending.kind === 'delete') return;
    pendingEdgePointerRef.current = { x: event.clientX, y: event.clientY  };
    updatePendingPointFromClient(event.clientX, event.clientY);
    if (!pendingEdgeScrollerRef.current) {
      pendingEdgeScrollerRef.current = createTimelineEdgeScroller(() => {
        const point = pendingEdgePointerRef.current;
        updatePendingPointFromClient(point.x, point.y);
       });
     }
    pendingEdgeScrollerRef.current.update(event.clientX);
   }
  const lanes: TimelineLane[] = CHARACTER_SLOTS.flatMap((slot) => [
    { slot, lane: 'main' as const, id: `${slot }:main`, laneNumber: 1 as const  },
    { slot, lane: 'independent' as const, id: `${slot }:independent`, laneNumber: 2 as const  }
  ]);
  const globalPeriods = periods.filter((period) => period.characterSlot === undefined || period.kind !== 'free_fire');

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const updateViewport = () => setTimelineViewport({ scrollLeft: node.scrollLeft, clientWidth: node.clientWidth  });
    updateViewport();
    node.addEventListener('scroll', updateViewport, { passive: true  });
    const resizeObserver = new ResizeObserver(updateViewport);
    resizeObserver.observe(node);
    return () => {
      node.removeEventListener('scroll', updateViewport);
      resizeObserver.disconnect();
     };
   }, [trackWidth, videoCompactMode]);

  useEffect(() => {
    const playbackMs = activePlayheadControl?.playbackMs;
    if (playbackMs === undefined) {
      playheadFollowRef.current = null;
      return;
    }
    const current = { playbackMs, contentX: playheadContentX  };
    const previous = playheadFollowRef.current;
    playheadFollowRef.current = current;
    const node = scrollRef.current;
    if (!node || !activeTimelineAutoFollow || !previous || previous.playbackMs === playbackMs) return;
    const contentDelta = current.contentX - previous.contentX;
    if (Math.abs(contentDelta) < 0.1) return;
    const followMargin = clamp(node.clientWidth * 0.14, 72, 160);
    const leftBoundary = Math.min(node.clientWidth * 0.45, 112 + followMargin);
    const rightBoundary = Math.max(node.clientWidth * 0.55, node.clientWidth - followMargin);
    const previousVisibleX = previous.contentX - node.scrollLeft;
    const currentVisibleX = current.contentX - node.scrollLeft;
    let scrollDelta = 0;
    if (contentDelta > 0 && currentVisibleX >= rightBoundary) {
      scrollDelta = previousVisibleX >= rightBoundary ? contentDelta : currentVisibleX - rightBoundary;
    } else if (contentDelta < 0 && currentVisibleX <= leftBoundary) {
      scrollDelta = previousVisibleX <= leftBoundary ? contentDelta : currentVisibleX - leftBoundary;
    }
    if (Math.abs(scrollDelta) < 0.1) return;
    const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    node.scrollLeft = clamp(node.scrollLeft + scrollDelta, 0, maxScrollLeft);
   }, [activePlayheadControl?.playbackMs, playheadContentX, activeTimelineAutoFollow]);

  useEffect(() => {
    stopPendingEdgeScroll();
    return () => stopPendingEdgeScroll();
   }, [pending?.kind, pending?.kind === 'move' ? pending.moveId : null]);

  function switchPendingMoveByInput(code: string, shiftKey = false): boolean {
    const normalizedCode = normalizeInputCode(code);
    if (normalizedCode === 'ShiftLeft' || normalizedCode === 'ShiftRight') return false;
    if (shortcutMatchesCode(code, shiftKey, shortcutSettings.timelinePlaceIntroSwitch)) {
      const switchMove = placeableMoves.find((move) => move.id === 'switch_1');
      if (!switchMove) return false;
      setPending({ kind: 'move', moveId: switchMove.id, adaptiveSwitch: true, contentSuffix: 'b'  });
      setLastPlacementMoveId(switchMove.id);
      setLastPlacementAdaptiveSwitch(true);
      setLastPlacementContentLabel(null);
      setLastPlacementContentSuffix('b');
      return true;
    }
    if (shortcutMatchesCode(code, shiftKey, shortcutSettings.timelineAdaptiveSwitch)) {
      const switchMove = placeableMoves.find((move) => move.id === 'switch_1');
      if (!switchMove) return false;
      setPending({ kind: 'move', moveId: switchMove.id, adaptiveSwitch: true  });
      setLastPlacementMoveId(switchMove.id);
      setLastPlacementAdaptiveSwitch(true);
      setLastPlacementContentLabel(null);
      setLastPlacementContentSuffix(null);
      return true;
    }
    const shortcutMove = TIMELINE_PLACEMENT_SHORTCUT_MOVES.find(([action]) => shortcutMatchesCode(code, shiftKey, shortcutSettings[action]));
    const shortcutMoveId = shortcutMove?.[1] ?? null;
    const shortcutContentLabel = shortcutMove?.[2];
    const configuredMoveId = bindings.find((binding) => binding.inputs.some((input) => normalizeInputCode(input.code) === normalizedCode))?.moveId ?? null;
    const mappedMoveId = shortcutMoveId ?? (configuredMoveId && !['basic_attack', 'dodge', 'jump'].includes(configuredMoveId) ? configuredMoveId : null);
    const move = mappedMoveId ? placeableMoves.find((candidate) => candidate.id === mappedMoveId) : null;
    if (!move) return false;
    setPending({ kind: 'move', moveId: move.id, contentLabel: shortcutContentLabel  });
    setLastPlacementMoveId(move.id);
    setLastPlacementAdaptiveSwitch(false);
    setLastPlacementContentLabel(shortcutContentLabel ?? null);
    setLastPlacementContentSuffix(null);
    return true;
   }

  function togglePendingPeriodPlacement(sourceCode: string, sourceTime = performance.now()): boolean {
    if (pending?.kind !== 'move' && pending?.kind !== 'period') return false;
    const normalizedCode = normalizeInputCode(sourceCode);
    const previous = placementToggleRef.current;
    if (previous?.code === normalizedCode && sourceTime - previous.time < 80) return true;
    placementToggleRef.current = { code: normalizedCode, time: sourceTime  };
    if (pending.kind === 'period') {
      const moveId = lastPlacementMoveId ?? placeableMoves[0]?.id;
      if (moveId) setPending({ kind: 'move', moveId, adaptiveSwitch: lastPlacementAdaptiveSwitch || undefined, contentLabel: lastPlacementContentLabel ?? undefined, contentSuffix: lastPlacementContentSuffix ?? undefined  });
    } else {
      setLastPlacementMoveId(pending.moveId);
      setLastPlacementAdaptiveSwitch(Boolean(pending.adaptiveSwitch));
      setLastPlacementContentLabel(pending.contentLabel ?? null);
      setLastPlacementContentSuffix(pending.contentSuffix ?? null);
      setPending({ kind: 'period'  });
    }
    return true;
   }

  useEffect(() => {
    if (!keyboardShortcutsEnabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]') || event.repeat) return;
      const commandModifier = event.ctrlKey || event.metaKey;
      if (commandModifier && !event.altKey && !event.shiftKey && normalizeInputCode(event.code) === 'KeyC') {
        const selection = copiedSelectionFromStepIds(selectedIds);
        if (!selection) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setCopiedSelection(selection);
        setContext(null);
        return;
      }
      if (commandModifier && !event.altKey && !event.shiftKey && normalizeInputCode(event.code) === 'KeyV') {
        if (!copiedSelection) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        startCopyPlacement(copiedSelection);
        return;
      }
      if (shortcutMatches(event, shortcutSettings.timelineAppendOutro)) {
        if (!appendContentToSelectedSteps('y')) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      if (shortcutMatches(event, shortcutSettings.timelineDelete)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const existingStepIds = selectedIds.filter((stepId) => chart.steps.some((step) => step.id === stepId));
        if (existingStepIds.length) {
          activeHistoryControl?.onCaptureHistory();
          onDelete(existingStepIds);
          setSelectedIds([]);
          setSelectedId(chart.steps.find((step) => !existingStepIds.includes(step.id))?.id ?? '');
          setContext(null);
          return;
        }
        if (selectedPeriodId && periods.some((period) => period.id === selectedPeriodId)) {
          activeHistoryControl?.onCaptureHistory();
          onPeriodsChange(periods.filter((period) => period.id !== selectedPeriodId));
          setSelectedPeriodId('');
          setContext(null);
          return;
        }
        toggleContinuousDelete();
        return;
      }
      if (shortcutMatches(event, shortcutSettings.timelineSplit)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (pending?.kind === 'cut') endSpecialPlacement();
        else {
          setPending({ kind: 'cut' });
          setPendingPoint(null);
          setCompactAddMenuOpen(false);
        }
        return;
      }
      if (shortcutMatches(event, shortcutSettings.timelineMerge)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        mergeSteps(mergeableStepsFromIds(selectedIds));
        return;
      }
      if (commandModifier || event.altKey) return;
      if (videoCompactMode && shortcutMatches(event, shortcutSettings.videoPlayPause)) return;
      if (pending?.kind !== 'move' && pending?.kind !== 'period' && shortcutMatches(event, shortcutSettings.timelineStartAdd)) {
        const move = placeableMoves[0];
        if (!move) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setPending({ kind: 'move', moveId: move.id  });
        setLastPlacementMoveId(move.id);
        setLastPlacementAdaptiveSwitch(false);
        setLastPlacementContentLabel(null);
        setLastPlacementContentSuffix(null);
        setPendingPoint(null);
        setCompactAddMenuOpen(false);
        return;
      }
      if (pending?.kind !== 'move' && pending?.kind !== 'period') return;
      if (shortcutMatches(event, shortcutSettings.timelineTogglePeriod)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        togglePendingPeriodPlacement(event.code, performance.now());
        return;
      }
      if (pending?.kind !== 'move') return;
      if (!switchPendingMoveByInput(event.code, event.shiftKey)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
     };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
   }, [keyboardShortcutsEnabled, videoCompactMode, pending, bindings, shortcutSettings, placeableMoves, lastPlacementMoveId, lastPlacementAdaptiveSwitch, lastPlacementContentLabel, lastPlacementContentSuffix, selectedIds, selectedPeriodId, copiedSelection, chart.steps, periods, comboImageStyle.contentLabels, activeHistoryControl, onContentChange, onDelete, onPeriodsChange]);

  useEffect(() => {
    if (!keyboardShortcutsEnabled || !inputSignal || !isPressEvent(inputSignal)) return;
    if (videoCompactMode && shortcutMatchesCode(inputSignal.code, Boolean(inputSignal.shiftKey), shortcutSettings.videoPlayPause)) return;
    if (pending?.kind !== 'move' && pending?.kind !== 'period') {
      if (!shortcutMatchesCode(inputSignal.code, Boolean(inputSignal.shiftKey), shortcutSettings.timelineStartAdd)) return;
      const move = placeableMoves[0];
      if (!move) return;
      setPending({ kind: 'move', moveId: move.id  });
      setLastPlacementMoveId(move.id);
      setLastPlacementAdaptiveSwitch(false);
      setLastPlacementContentLabel(null);
      setLastPlacementContentSuffix(null);
      setPendingPoint(null);
      setCompactAddMenuOpen(false);
      return;
    }
    if (shortcutMatchesCode(inputSignal.code, Boolean(inputSignal.shiftKey), shortcutSettings.timelineTogglePeriod)) {
      togglePendingPeriodPlacement(inputSignal.code, inputSignal.time);
      return;
    }
    if (pending.kind === 'move') switchPendingMoveByInput(inputSignal.code, Boolean(inputSignal.shiftKey));
   }, [keyboardShortcutsEnabled, videoCompactMode, pending, inputSignal?.id, bindings, shortcutSettings, placeableMoves, lastPlacementMoveId, lastPlacementAdaptiveSwitch, lastPlacementContentLabel, lastPlacementContentSuffix]);

  useEffect(() => {
    if (!playbackMenuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!playbackMenuRef.current?.contains(event.target as Node)) setPlaybackMenuOpen(false);
     };
    window.addEventListener('pointerdown', closeMenu);
    return () => window.removeEventListener('pointerdown', closeMenu);
   }, [playbackMenuOpen]);

  useEffect(() => {
    if (!context) {
      setActiveContextSubmenu(null);
      return;
     }
    const margin = 8;
    const updatePosition = () => {
      const node = contextMenuRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      setContextMenuPosition({
        x: clamp(context.x, margin, Math.max(margin, window.innerWidth - rect.width - margin)),
        y: clamp(context.y, margin, Math.max(margin, window.innerHeight - rect.height - margin))
       });
     };
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
     };
   }, [context]);

  useEffect(() => {
    if (!context || !activeContextSubmenu) return;
    const margin = 8;
    const updatePosition = () => {
      const anchor = contextSubmenuAnchorRef.current;
      const submenu = contextSubmenuRef.current;
      if (!anchor || !submenu) return;
      const anchorRect = anchor.getBoundingClientRect();
      const submenuRect = submenu.getBoundingClientRect();
      const openRight = anchorRect.right + submenuRect.width + 12 <= window.innerWidth - margin;
      const rawX = openRight ? anchorRect.right + 6 : anchorRect.left - submenuRect.width - 6;
      const rawY = anchorRect.top - 6;
      setContextSubmenuPosition({
        x: clamp(rawX, margin, Math.max(margin, window.innerWidth - submenuRect.width - margin)),
        y: clamp(rawY, margin, Math.max(margin, window.innerHeight - submenuRect.height - margin))
       });
     };
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
     };
   }, [context, activeContextSubmenu, contextMenuPosition.x, contextMenuPosition.y]);

  useEffect(() => {
    if (!context) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (contextMenuRef.current?.contains(target) || contextSubmenuRef.current?.contains(target)) return;
      setContext(null);
      setActiveContextSubmenu(null);
     };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
   }, [context]);

  function updatePeriod(periodId: string, patch: Partial<ComboPeriod>) {
    onPeriodsChange(periods.map((period) => period.id === periodId ? normalizePeriod({ ...period, ...patch  }) : period));
   }

  function axisPeriodsFrom(source: ComboPeriod[]): ComboPeriod[] {
    return source.filter((period) => period.kind === 'startup_axis' || period.kind === 'loop_axis').sort((left, right) => left.startMs - right.startMs || (left.loopIndex ?? 0) - (right.loopIndex ?? 0));
   }

  function copyPlacementStartMs(selection: CopiedTimelineSelection, requestedStartMs: number): number {
    const copiedAxisPeriod = selection.periods.length === 1 && (selection.periods[0].kind === 'startup_axis' || selection.periods[0].kind === 'loop_axis');
    return copiedAxisPeriod ? axisPeriodsFrom(periods).at(-1)?.endMs ?? 0 : requestedStartMs;
   }

  function resizeAxisBoundary(source: ComboPeriod[], periodId: string, mode: 'start' | 'end', deltaMs: number, dragTotal: number): ComboPeriod[] {
    const axis = axisPeriodsFrom(source);
    const index = axis.findIndex((period) => period.id === periodId);
    if (index < 0) return source;
    const lengths = axis.map((period) => Math.max(MIN_EDITOR_DURATION, period.endMs - period.startMs));
    if (mode === 'start') {
      if (index === 0) return source;
      const previousLength = lengths[index - 1];
      const currentLength = lengths[index];
      const sharedDelta = clamp(deltaMs, -previousLength + MIN_EDITOR_DURATION, currentLength - MIN_EDITOR_DURATION);
      lengths[index - 1] = Math.round(previousLength + sharedDelta);
      lengths[index] = Math.round(currentLength - sharedDelta);
     } else {
      const currentLength = lengths[index];
      if (index < axis.length - 1) {
        const nextLength = lengths[index + 1];
        const sharedDelta = clamp(deltaMs, -currentLength + MIN_EDITOR_DURATION, nextLength - MIN_EDITOR_DURATION);
        lengths[index] = Math.round(currentLength + sharedDelta);
        lengths[index + 1] = Math.round(nextLength - sharedDelta);
       } else {
        lengths[index] = Math.round(clamp(currentLength + deltaMs, MIN_EDITOR_DURATION, Math.max(MIN_EDITOR_DURATION, dragTotal - axis[index].startMs)));
       }
     }
    let cursor = 0;
    const resized = new Map<string, ComboPeriod>();
    axis.forEach((period, axisIndex) => {
      const loopIndex = period.kind === 'loop_axis' ? axis.filter((candidate, candidateIndex) => candidateIndex <= axisIndex && candidate.kind === 'loop_axis').length : undefined;
      const next = normalizePeriod({ ...period, startMs: cursor, endMs: cursor + lengths[axisIndex], loopIndex, label: defaultPeriodLabel(period.kind, loopIndex)  });
      resized.set(period.id, next);
      cursor = next.endMs;
     });
    return source.map((period) => resized.get(period.id) ?? period);
   }

  function updateSelectedSteps(patch: Partial<ComboStep>) {
    selectedSteps.forEach((step) => onUpdate(step.id, patch));
   }

  function appendContentToSelectedSteps(suffix: string): boolean {
    const targets = chart.steps.filter((step) => selectedIds.includes(step.id));
    if (!targets.length) return false;
    activeHistoryControl?.onCaptureHistory();
    const contentLabels = { ...comboImageStyle.contentLabels  };
    targets.forEach((step) => {
      const currentContent = contentLabels[step.id]?.trim() || defaultComboContentLabelForMoveId(step.moveId) || '';
      contentLabels[step.id] = maybeConvertTextToIconLabel(`${currentContent }${suffix }`, comboImageStyle.convertIcons);
     });
    onContentChange({ contentLabels  });
    return true;
   }

  function setContentLabel(stepId: string, value: string) {
    onContentChange({ contentLabels: { ...comboImageStyle.contentLabels, [stepId]: maybeConvertTextToIconLabel(value, comboImageStyle.convertIcons)  }  });
   }

  function focusStepInput(stepId: string, field: 'content' | 'note') {
    window.requestAnimationFrame(() => {
      const input = scrollRef.current?.querySelector<HTMLInputElement>(`input[data-step-nav-id="${CSS.escape(stepId)}"][data-step-nav-field="${field}"]`) ?? document.querySelector<HTMLInputElement>(`input[data-step-nav-id="${CSS.escape(stepId)}"][data-step-nav-field="${field}"]`);
      input?.focus();
      const end = input?.value.length ?? 0;
      input?.setSelectionRange(end, end);
    });
   }

  function timelineLaneIndex(step: ComboStep): number {
    const slotIndex = Math.max(0, CHARACTER_SLOTS.indexOf((step.characterSlot ?? 1) as CharacterSlot));
    return slotIndex * 2 + (step.lane === 'independent' ? 1 : 0);
   }

  function nearestStepForInputNavigation(stepId: string, direction: 'left' | 'right' | 'up' | 'down'): ComboStep | null {
    const current = chart.steps.find((step) => step.id === stepId);
    if (!current) return null;
    const currentLane = timelineLaneIndex(current);
    const currentCenter = current.startMin + current.durationMax / 2;
    const sorted = [...chart.steps].sort((left, right) => left.startMin - right.startMin || left.startMax - right.startMax || left.id.localeCompare(right.id));
    if (direction === 'left') return [...sorted].reverse().find((step) => step.id !== stepId && timelineLaneIndex(step) === currentLane && step.startMin < current.startMin) ?? null;
    if (direction === 'right') return sorted.find((step) => step.id !== stepId && timelineLaneIndex(step) === currentLane && step.startMin > current.startMin) ?? null;
    const targetLane = direction === 'up' ? currentLane - 1 : currentLane + 1;
    const candidates = sorted.filter((step) => step.id !== stepId && timelineLaneIndex(step) === targetLane);
    return candidates.sort((left, right) => Math.abs(left.startMin + left.durationMax / 2 - currentCenter) - Math.abs(right.startMin + right.durationMax / 2 - currentCenter) || left.startMin - right.startMin)[0] ?? null;
   }

  function handleStepInputNavigation(event: ReactKeyboardEvent<HTMLInputElement>, stepId: string, field: 'content' | 'note') {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const input = event.currentTarget;
    const selectionStart = input.selectionStart ?? 0;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    if (event.key === 'Enter') {
      input.blur();
      return;
    }
    const direction = event.key === 'ArrowUp' ? 'up' : event.key === 'ArrowDown' ? 'down' : event.key === 'ArrowLeft' && selectionStart === 0 && selectionEnd === 0 ? 'left' : event.key === 'ArrowRight' && selectionStart === input.value.length && selectionEnd === input.value.length ? 'right' : null;
    if (!direction) return;
    const target = nearestStepForInputNavigation(stepId, direction);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(target.id);
    setSelectedIds([target.id]);
    setRaisedStepId(target.id);
    scrollToTimelineMs(target.startMin);
    focusStepInput(target.id, field);
   }

  function toggleStepSelection(stepId: string, additive: boolean) {
    setSelectedId(stepId);
    setSelectedIds((current) => additive ? (current.includes(stepId) ? current.filter((id) => id !== stepId) : [...current, stepId]) : [stepId]);
   }

  function setPeriodKind(periodId: string, kind: ComboPeriodKind) {
    const loopIndex = periods.filter((period) => period.kind === 'loop_axis').length + 1;
    updatePeriod(periodId, {
      kind,
      characterSlot: kind === 'free_fire' ? periods.find((period) => period.id === periodId)?.characterSlot : undefined,
      lane: kind === 'free_fire' ? periods.find((period) => period.id === periodId)?.lane : undefined,
      label: defaultPeriodLabel(kind, loopIndex),
      loopIndex: kind === 'loop_axis' ? loopIndex : undefined,
      startMs: kind === 'startup_axis' ? 0 : periods.find((period) => period.id === periodId)?.startMs
     });
   }

  function applyMoveToSteps(stepIds: string[], move: MoveDefinition, adaptiveSwitch = false) {
    if (!stepIds.length) return;
    activeHistoryControl?.onCaptureHistory();
    stepIds.forEach((stepId) => {
      const current = chart.steps.find((step) => step.id === stepId);
      if (!current) return;
      const targetMove = adaptiveSwitch
        ? moves.find((candidate) => candidate.id === `switch_${current.characterSlot ?? 1 }`) ?? move
        : move;
      onUpdate(stepId, {
        moveId: targetMove.id,
        label: targetMove.label,
        color: targetMove.color,
        advancesStep: targetMove.advancesStep,
        independent: targetMove.independent,
        lane: targetMove.id === 'basic_attack' || targetMove.independent ? 'independent' : 'main',
        manualFree: current.manualFree ?? false
       });
     });
    setContext(null);
    setActiveContextSubmenu(null);
   }

  function endSpecialPlacement() {
    setPending(null);
    setPendingPoint(null);
    setCompactAddMenuOpen(false);
   }

  function toggleContinuousDelete() {
    if (pending?.kind === 'delete') {
      endSpecialPlacement();
      return;
    }
    setPending({ kind: 'delete' });
    setPendingPoint(null);
    setCompactAddMenuOpen(false);
   }

  function copiedSelectionFromContext(scope: 'steps' | 'periods' | 'all' = 'all'): CopiedTimelineSelection | null {
    if (!context) return null;
    const steps = scope !== 'periods' ? (context.stepIds?.length ? context.stepIds : context.stepId ? [context.stepId] : [])
      .map((stepId) => chart.steps.find((step) => step.id === stepId))
      .filter((step): step is ComboStep => Boolean(step)) : [];
    const period = scope !== 'steps' && context.periodId ? periods.find((item) => item.id === context.periodId) : null;
    const selectedPeriods = period ? [period] : [];
    const periodSteps = period?.kind === 'loop_axis' && scope !== 'steps'
      ? stepsStartingInPeriod(period)
      : [];
    const copiedSteps = [...steps, ...periodSteps.filter((step) => !steps.some((candidate) => candidate.id === step.id))];
    if (!copiedSteps.length && !selectedPeriods.length) return null;
    const anchorMs = period?.kind === 'loop_axis'
      ? period.startMs
      : Math.min(...copiedSteps.map((step) => step.startMin), ...selectedPeriods.map((item) => item.startMs));
    const copiedLabels = Object.fromEntries(copiedSteps.map((step) => [step.id, comboImageStyle.contentLabels[step.id]]).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    return { steps: copiedSteps.map((step) => ({ ...step, samples: step.samples.map((sample) => ({ ...sample  }))  })), periods: selectedPeriods.map((item) => ({ ...item  })), contentLabels: copiedLabels, anchorMs: Math.max(0, anchorMs)  };
   }

  function copiedSelectionFromStepIds(stepIds: string[]): CopiedTimelineSelection | null {
    const ids = new Set(stepIds);
    const steps = chart.steps.filter((step) => ids.has(step.id));
    if (!steps.length) return null;
    const copiedLabels = Object.fromEntries(steps.map((step) => [step.id, comboImageStyle.contentLabels[step.id]]).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    return {
      steps: steps.map((step) => ({ ...step, samples: step.samples.map((sample) => ({ ...sample  }))  })),
      periods: [],
      contentLabels: copiedLabels,
      anchorMs: Math.max(0, Math.min(...steps.map((step) => step.startMin)))
     };
   }

  function placePending(point: { slot?: CharacterSlot; lane?: LaneKind; startMs: number  }) {
    if (!pending) return;
    if (pending.kind === 'cut') return;
    const isPeriodPlacement = pending.kind === 'period';
    if (pending.kind === 'step' && point.slot && point.lane) {
      activeHistoryControl?.onCaptureHistory();
      const step = createDraftStep({ slot: point.slot, lane: point.lane, startMs: point.startMs  });
      onInsert([step]);
      setSelectedId(step.id);
      setSelectedIds([step.id]);
    }
    if (pending.kind === 'move' && point.slot && point.lane) {
      const moveId = pending.adaptiveSwitch ? `switch_${point.slot }` : pending.moveId;
      const move = placeableMoves.find((candidate) => candidate.id === moveId);
      if (move) {
        activeHistoryControl?.onCaptureHistory();
        const step = createPlacedMoveStep(move, { slot: point.slot, lane: point.lane, startMs: point.startMs  });
        onInsert([step]);
        const defaultContent = defaultComboContentLabelForMoveId(move.id) ?? '';
        const contentLabel = pending.contentLabel ?? (pending.contentSuffix ? `${defaultContent }${pending.contentSuffix }` : '');
        if (contentLabel) onContentChange({ contentLabels: { ...comboImageStyle.contentLabels, [step.id]: maybeConvertTextToIconLabel(contentLabel, comboImageStyle.convertIcons)  }  });
        setSelectedId(step.id);
        setSelectedIds([step.id]);
       }
     }
    if (pending.kind === 'period') {
      activeHistoryControl?.onCaptureHistory();
      const period = inferPeriodPlacement(point, periods);
      onPeriodsChange([...periods, period]);
      setSelectedPeriodId(period.id);
     }
    if (isPeriodPlacement) setPending({ kind: 'period' });
    if (pending.kind === 'zoom') {
      zoomFrameTrack?.onPlace(point.startMs);
     }
    if (pending.kind === 'copy') {
      activeHistoryControl?.onCaptureHistory();
      const placementStartMs = copyPlacementStartMs(pending, point.startMs);
      const delta = Math.round(placementStartMs - pending.anchorMs);
      const singleStepTarget = pending.steps.length === 1 && point.slot && point.lane ? { characterSlot: point.slot, lane: point.lane  } : { };
      const stepIdMap = new Map<string, string>();
      const insertedSteps = pending.steps.map((step) => {
        const id = crypto.randomUUID();
        stepIdMap.set(step.id, id);
        return normalizeStep({ ...step, ...singleStepTarget, id, startMin: step.startMin + delta, startMax: step.startMax + delta, samples: step.samples.map((sample) => ({ ...sample, recordingId: id  }))  });
       });
      const insertedPeriods = pending.periods.map((period) => normalizePeriod({ ...period, ...(pending.periods.length === 1 && period.kind === 'free_fire' && point.slot && point.lane ? { characterSlot: point.slot, lane: point.lane  } : { }), id: crypto.randomUUID(), startMs: period.startMs + delta, endMs: period.endMs + delta  }));
      onInsert(insertedSteps);
      if (insertedPeriods.length) onPeriodsChange([...periods, ...insertedPeriods]);
      const insertedLabels = Object.fromEntries(Object.entries(pending.contentLabels).map(([stepId, label]) => [stepIdMap.get(stepId), label]).filter((entry): entry is [string, string] => typeof entry[0] === 'string'));
      if (Object.keys(insertedLabels).length) onContentChange({ contentLabels: { ...comboImageStyle.contentLabels, ...insertedLabels  }  });
      if (insertedSteps.length) {
        setSelectedId(insertedSteps[0].id);
        setSelectedIds(insertedSteps.map((step) => step.id));
       }
     }
    setCompactAddMenuOpen(false);
   }

  function cutStepAtPointer(event: ReactPointerEvent<HTMLElement>, step: ComboStep) {
    if (pending?.kind !== 'cut' || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const cutMs = pointerTimeInTrack(event, renderTotal);
    const startMs = step.startMin;
    const endMs = step.startMin + step.durationMax;
    if (endMs - startMs < MIN_EDITOR_DURATION * 2) return;
    const splitMs = Math.round(clamp(cutMs, startMs + MIN_EDITOR_DURATION, endMs - MIN_EDITOR_DURATION));
    activeHistoryControl?.onCaptureHistory();
    const left = normalizeStep({ ...step, id: crypto.randomUUID(), startMin: startMs, startMax: startMs, durationMin: splitMs - startMs, durationMax: splitMs - startMs  });
    const right = normalizeStep({ ...step, id: crypto.randomUUID(), startMin: splitMs, startMax: splitMs, durationMin: endMs - splitMs, durationMax: endMs - splitMs  });
    const originalLabel = comboImageStyle.contentLabels[step.id];
    if (originalLabel !== undefined) onContentChange({ contentLabels: { ...comboImageStyle.contentLabels, [left.id]: originalLabel, [right.id]: originalLabel  }  });
    onDelete([step.id]);
    onInsert([left, right]);
    setSelectedId(left.id);
    setSelectedIds([left.id, right.id]);
   }

  function laneHit(clientX: number, clientY: number) {
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const track = element?.closest('.timeline-editor-track') as HTMLElement | null;
    const row = element?.closest('.timeline-editor-row') as HTMLElement | null;
    if (!track || !row) return null;
    const slot = Number(row.dataset.slot) as CharacterSlot;
    const lane = row.dataset.lane as LaneKind;
    if (!CHARACTER_SLOTS.includes(slot) || (lane !== 'main' && lane !== 'independent')) return null;
    return { slot, lane  };
   }

  function beginDrag(event: ReactPointerEvent<HTMLElement>, stepId: string, mode: 'move' | 'start' | 'end' | 'preheat' | 'recovery' | 'preheat-divider' | 'recovery-divider') {
    if (pending) return;
    event.preventDefault();
    event.stopPropagation();
    activeHistoryControl?.onCaptureHistory();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(stepId);
    const selectedForDrag = mode === 'move' && selectedIds.includes(stepId) ? selectedIds : [stepId];
    if (!event.ctrlKey && mode === 'move' && !selectedIds.includes(stepId)) setSelectedIds([stepId]);
    if (mode !== 'move') setSelectedIds([stepId]);
    const track = event.currentTarget.closest('.timeline-editor-track') as HTMLElement | null;
    if (!track) return;
    const originals = new Map(chart.steps.filter((candidate) => selectedForDrag.includes(candidate.id)).map((candidate) => [candidate.id, { ...candidate  }]));
    const original = originals.get(stepId);
    if (!original) return;
    const startX = event.clientX;
    const dragTotal = total;
    const dragTrackWidth = Math.max(1, track.getBoundingClientRect().width);
    const scrollNode = scrollRef.current;
    const startScrollLeft = scrollNode?.scrollLeft ?? 0;
    let lastClientX = event.clientX;
    let lastClientY = event.clientY;
    setDragRenderTotal(dragTotal);
    const applyDrag = (clientX: number, clientY: number) => {
      const scrollDelta = (scrollNode?.scrollLeft ?? startScrollLeft) - startScrollLeft;
      const deltaMs = ((clientX - startX + scrollDelta) / dragTrackWidth) * dragTotal;
      if (mode === 'move') {
        const movingMultiple = originals.size > 1;
        const minDelta = Math.max(...Array.from(originals.values(), (snapshot) => -snapshot.startMin));
        const maxDelta = Math.min(...Array.from(originals.values(), (snapshot) => {
          const duration = snapshot.startMax - snapshot.startMin;
          return Math.max(0, dragTotal - duration) - snapshot.startMin;
         }));
        const sharedDeltaMs = clamp(deltaMs, minDelta, maxDelta);
        const lane = movingMultiple ? null : laneHit(clientX, clientY);
        originals.forEach((snapshot, id) => {
          const startMin = snapshot.startMin + sharedDeltaMs;
          const startMax = snapshot.startMax + sharedDeltaMs;
          onUpdate(id, { startMin: Math.round(startMin), startMax: Math.round(startMax), ...(lane ? { characterSlot: lane.slot, lane: lane.lane, independent: snapshot.independent  } : { })  });
         });
       }
      if (mode === 'start') {
        const originalEnd = original.startMin + original.durationMax;
        const startMin = clamp(original.startMin + deltaMs, 0, originalEnd - MIN_EDITOR_DURATION);
        const appliedDelta = startMin - original.startMin;
        const durationMax = originalEnd - startMin;
        onUpdate(stepId, {
          startMin: Math.round(startMin),
          startMax: Math.round(Math.max(startMin, original.startMax + appliedDelta)),
          durationMin: Math.round(clamp(original.durationMin - appliedDelta, MIN_EDITOR_DURATION, durationMax)),
          durationMax: Math.round(durationMax)
         });
       }
      if (mode === 'end') {
        const durationMax = clamp(original.durationMax + deltaMs, MIN_EDITOR_DURATION, dragTotal - original.startMin);
        const appliedDelta = durationMax - original.durationMax;
        onUpdate(stepId, {
          durationMin: Math.round(clamp(original.durationMin + appliedDelta, MIN_EDITOR_DURATION, durationMax)),
          durationMax: Math.round(durationMax)
         });
       }
      if (mode === 'preheat') {
        const originalPreheat = original.preheatMs ?? 0;
        const coreStart = original.startMin + originalPreheat;
        const originalEnd = original.startMin + original.durationMax;
        const preheatMs = clamp(originalPreheat - deltaMs, 0, coreStart);
        const startMin = coreStart - preheatMs;
        const appliedStartDelta = startMin - original.startMin;
        const durationMax = originalEnd - startMin;
        onUpdate(stepId, {
          startMin: Math.round(startMin),
          startMax: Math.round(Math.max(startMin, original.startMax + appliedStartDelta)),
          durationMin: Math.round(clamp(original.durationMin - appliedStartDelta, MIN_EDITOR_DURATION, durationMax)),
          durationMax: Math.round(durationMax),
          preheatMs: Math.round(preheatMs)
         });
       }
      if (mode === 'recovery') {
        const originalRecovery = original.recoveryMs ?? 0;
        const coreEnd = original.startMin + original.durationMax - originalRecovery;
        const recoveryMs = clamp(originalRecovery + deltaMs, 0, dragTotal - coreEnd);
        const durationMax = coreEnd + recoveryMs - original.startMin;
        const appliedDelta = recoveryMs - originalRecovery;
        onUpdate(stepId, {
          durationMin: Math.round(clamp(original.durationMin + appliedDelta, MIN_EDITOR_DURATION, durationMax)),
          durationMax: Math.round(durationMax),
          recoveryMs: Math.round(recoveryMs)
         });
       }
      if (mode === 'preheat-divider') onUpdate(stepId, { preheatMs: Math.round(clamp((original.preheatMs ?? 0) + deltaMs, 0, original.durationMax - (original.recoveryMs ?? 0) - MIN_EDITOR_DURATION))  });
      if (mode === 'recovery-divider') onUpdate(stepId, { recoveryMs: Math.round(clamp((original.recoveryMs ?? 0) - deltaMs, 0, original.durationMax - (original.preheatMs ?? 0) - MIN_EDITOR_DURATION))  });
    };
    const edgeScroller = createTimelineEdgeScroller(() => applyDrag(lastClientX, lastClientY));
    edgeScroller.update(lastClientX);
    const onMove = (moveEvent: PointerEvent) => {
      lastClientX = moveEvent.clientX;
      lastClientY = moveEvent.clientY;
      applyDrag(lastClientX, lastClientY);
      edgeScroller.update(lastClientX);
     };
    const onUp = () => {
      edgeScroller.stop();
      setDragRenderTotal(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
     };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
   }

  function beginPeriodDrag(event: ReactPointerEvent<HTMLElement>, periodId: string, mode: 'move' | 'start' | 'end') {
    if (pending) return;
    event.preventDefault();
    event.stopPropagation();
    activeHistoryControl?.onCaptureHistory();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedPeriodId(periodId);
    setRaisedPeriodId(periodId);
    const period = periods.find((candidate) => candidate.id === periodId);
    const track = event.currentTarget.closest('.timeline-editor-track, .timeline-editor-period-track') as HTMLElement | null;
    if (!period || !track) return;
    const startX = event.clientX;
    const original = { ...period  };
    const originalPeriods = periods.map((candidate) => ({ ...candidate  }));
    const dragTotal = total;
    const dragTrackWidth = Math.max(1, track.getBoundingClientRect().width);
    const scrollNode = scrollRef.current;
    const startScrollLeft = scrollNode?.scrollLeft ?? 0;
    let lastClientX = event.clientX;
    let lastClientY = event.clientY;
    setDragRenderTotal(dragTotal);
    const applyDrag = (clientX: number, clientY: number) => {
      const scrollDelta = (scrollNode?.scrollLeft ?? startScrollLeft) - startScrollLeft;
      const deltaMs = ((clientX - startX + scrollDelta) / dragTrackWidth) * dragTotal;
      if (mode === 'move' && period.kind !== 'startup_axis') {
        const length = original.endMs - original.startMs;
        const startMs = clamp(original.startMs + deltaMs, 0, Math.max(0, dragTotal - length));
        const lane = laneHit(clientX, clientY);
        updatePeriod(periodId, { startMs: Math.round(startMs), endMs: Math.round(startMs + length), ...(lane && original.kind === 'free_fire' ? { characterSlot: lane.slot, lane: lane.lane  } : { })  });
       }
      if (mode === 'start') {
        if (original.kind === 'startup_axis' || original.kind === 'loop_axis') onPeriodsChange(resizeAxisBoundary(originalPeriods, periodId, 'start', deltaMs, dragTotal));
        else updatePeriod(periodId, { startMs: Math.round(clamp(original.startMs + deltaMs, 0, original.endMs - MIN_EDITOR_DURATION))  });
       }
      if (mode === 'end') {
        if (original.kind === 'startup_axis' || original.kind === 'loop_axis') onPeriodsChange(resizeAxisBoundary(originalPeriods, periodId, 'end', deltaMs, dragTotal));
        else updatePeriod(periodId, { endMs: Math.round(clamp(original.endMs + deltaMs, original.startMs + MIN_EDITOR_DURATION, dragTotal))  });
       }
     };
    const edgeScroller = createTimelineEdgeScroller(() => applyDrag(lastClientX, lastClientY));
    edgeScroller.update(lastClientX);
    const onMove = (moveEvent: PointerEvent) => {
      lastClientX = moveEvent.clientX;
      lastClientY = moveEvent.clientY;
      applyDrag(lastClientX, lastClientY);
      edgeScroller.update(lastClientX);
     };
    const onUp = () => {
      edgeScroller.stop();
      setDragRenderTotal(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
     };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
   }

  function pointerTime(event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.round(clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * renderTotal, 0, renderTotal));
   }

  function seekFromTimelineClientX(clientX: number) {
    const node = scrollRef.current;
    if (!node || !activePlayheadControl || activePlayheadControl.disabled) return;
    const rect = node.getBoundingClientRect();
    const trackX = clientX - rect.left + node.scrollLeft - 112;
    activePlayheadControl.onSeek(Math.round(clamp((trackX / Math.max(1, trackWidth)) * renderTotal, 0, renderTotal)));
   }

  function beginPlayheadDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!activePlayheadControl || activePlayheadControl.disabled || pending) return;
    event.preventDefault();
    event.stopPropagation();
    seekFromTimelineClientX(event.clientX);
    let lastClientX = event.clientX;
    const edgeScroller = createTimelineEdgeScroller(() => seekFromTimelineClientX(lastClientX));
    edgeScroller.update(lastClientX);
    const onMove = (moveEvent: PointerEvent) => {
      lastClientX = moveEvent.clientX;
      seekFromTimelineClientX(lastClientX);
      edgeScroller.update(lastClientX);
     };
    const onUp = () => {
      edgeScroller.stop();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
     };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
   }

  function setTrackPendingPoint(event: ReactPointerEvent<HTMLElement>, slot?: CharacterSlot, lane?: LaneKind) {
    if (!pending) return;
    setPendingPoint({ slot, lane, startMs: pointerTime(event)  });
   }

  function handleSpecialContextMenu(event: ReactMouseEvent<HTMLElement>, fallback?: () => void) {
    if (pending) {
      event.preventDefault();
      event.stopPropagation();
      endSpecialPlacement();
      return;
     }
    fallback?.();
   }

  function deleteStepInContinuousMode(event: ReactPointerEvent<HTMLDivElement>, stepId: string) {
    if (pending?.kind !== 'delete' || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    activeHistoryControl?.onCaptureHistory();
    onDelete([stepId]);
    setSelectedIds((current) => current.filter((id) => id !== stepId));
    if (selectedId === stepId) setSelectedId(chart.steps.find((step) => step.id !== stepId)?.id ?? '');
   }

  function beginBoxSelect(event: ReactPointerEvent<HTMLDivElement>) {
    if (pending || event.button !== 0 || event.target !== event.currentTarget) return;
    const body = event.currentTarget.closest('.timeline-editor-body') as HTMLElement | null;
    const scrollNode = scrollRef.current;
    if (!body || !scrollNode) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const initialBodyRect = body.getBoundingClientRect();
    const startX = clamp(event.clientX - initialBodyRect.left, 0, initialBodyRect.width);
    const startY = clamp(event.clientY - initialBodyRect.top, 0, initialBodyRect.height);
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const additive = event.ctrlKey;
    let selecting = false;
    let lastClientX = event.clientX;
    let lastClientY = event.clientY;
    const updateBox = (clientX: number, clientY: number) => {
      lastClientX = clientX;
      lastClientY = clientY;
      const bodyRect = body.getBoundingClientRect();
      const currentX = clamp(clientX - bodyRect.left, 0, bodyRect.width);
      const currentY = clamp(clientY - bodyRect.top, 0, bodyRect.height);
      setSelectionBox({ x: Math.min(startX, currentX), y: Math.min(startY, currentY), width: Math.abs(currentX - startX), height: Math.abs(currentY - startY)  });
     };
    const edgeScroller = createTimelineEdgeScroller(() => updateBox(lastClientX, lastClientY));
    const onMove = (moveEvent: PointerEvent) => {
      if (!selecting && Math.hypot(moveEvent.clientX - startClientX, moveEvent.clientY - startClientY) >= 5) selecting = true;
      if (!selecting) return;
      updateBox(moveEvent.clientX, moveEvent.clientY);
      edgeScroller.update(moveEvent.clientX);
     };
    const finishSelection = (upEvent: PointerEvent) => {
      edgeScroller.stop();
      if (!selecting) {
        seekFromTimelineClientX(upEvent.clientX);
        setSelectionBox(null);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finishSelection);
        window.removeEventListener('pointercancel', finishSelection);
        return;
      }
      updateBox(upEvent.clientX, upEvent.clientY);
      const bodyRect = body.getBoundingClientRect();
      const endX = clamp(upEvent.clientX - bodyRect.left, 0, bodyRect.width);
      const endY = clamp(upEvent.clientY - bodyRect.top, 0, bodyRect.height);
      const selectionRect = {
        left: bodyRect.left + Math.min(startX, endX),
        right: bodyRect.left + Math.max(startX, endX),
        top: bodyRect.top + Math.min(startY, endY),
        bottom: bodyRect.top + Math.max(startY, endY)
       };
      const hitIds = Array.from(body.querySelectorAll<HTMLElement>('.timeline-editor-block[data-step-id]'))
        .filter((element) => {
          const blockRect = element.getBoundingClientRect();
          return blockRect.left <= selectionRect.right && blockRect.right >= selectionRect.left && blockRect.top <= selectionRect.bottom && blockRect.bottom >= selectionRect.top;
         })
        .map((element) => element.dataset.stepId)
        .filter((id): id is string => Boolean(id));
      const hits = chart.steps.filter((step) => hitIds.includes(step.id)).map((step) => step.id);
      setSelectedIds((current) => additive ? Array.from(new Set([...current, ...hits])) : hits);
      if (hits[0]) setSelectedId(hits[0]);
      setSelectionBox(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finishSelection);
      window.removeEventListener('pointercancel', finishSelection);
     };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finishSelection);
    window.addEventListener('pointercancel', finishSelection);
   }

  function hitPeriods(pointerMs: number, slot?: CharacterSlot, lane?: LaneKind) {
    return periods.filter((period) => {
      const sameTime = pointerMs >= period.startMs && pointerMs <= period.endMs;
      const sameScope = period.characterSlot === undefined || (period.characterSlot === slot && (!period.lane || period.lane === lane));
      return sameTime && sameScope;
     }).sort((a, b) => (b.endMs - b.startMs) - (a.endMs - a.startMs));
   }

  function openStepContext(event: ReactMouseEvent<HTMLDivElement>, step: ComboStep | null, laneSteps: ComboStep[]) {
    event.preventDefault();
    event.stopPropagation();
    const margin = 8;
    setContextMenuPosition({
      x: clamp(event.clientX, margin, Math.max(margin, window.innerWidth - 160)),
      y: clamp(event.clientY, margin, Math.max(margin, window.innerHeight - 184))
     });
    setActiveContextSubmenu(null);
    const pointerMs = pointerTimeInTrack(event, renderTotal);
    const hits = laneSteps.filter((candidate) => pointerMs >= candidate.startMin && pointerMs <= candidate.startMin + candidate.durationMax).sort((a, b) => b.durationMax - a.durationMax);
    const target = step ?? hits[0] ?? null;
    const lane = target ? { slot: target.characterSlot ?? 1, lane: target.lane  } : laneHit(event.clientX, event.clientY) ?? undefined;
    const periodHits = hitPeriods(pointerMs, lane?.slot, lane?.lane);
    const selectedContextIds = target ? [] : selectedIds.filter((stepId) => chart.steps.some((candidate) => candidate.id === stepId));
    if (!target && !periodHits.length && !selectedContextIds.length) return;
    if (target) setSelectedId(target.id);
    const contextStepIds = target && selectedIds.includes(target.id) ? selectedIds : target ? [target.id] : selectedContextIds;
    if (target && !selectedIds.includes(target.id)) setSelectedIds([target.id]);
    setContext({ x: event.clientX, y: event.clientY, stepId: target?.id ?? contextStepIds[0], stepIds: contextStepIds, periodId: contextStepIds.length ? undefined : periodHits[0]?.id, coveredSteps: hits, coveredPeriods: periodHits  });
   }

  function openPeriodContext(event: ReactMouseEvent<HTMLElement>, period: ComboPeriod | null, slot?: CharacterSlot, lane?: LaneKind) {
    event.preventDefault();
    event.stopPropagation();
    const margin = 8;
    setContextMenuPosition({
      x: clamp(event.clientX, margin, Math.max(margin, window.innerWidth - 160)),
      y: clamp(event.clientY, margin, Math.max(margin, window.innerHeight - 120))
     });
    setActiveContextSubmenu(null);
    const pointerMs = pointerTimeInTrack(event, renderTotal);
    const hits = hitPeriods(pointerMs, slot, lane);
    const target = period ?? hits[0] ?? null;
    if (!target) return;
    setSelectedPeriodId(target.id);
    setContext({ x: event.clientX, y: event.clientY, periodId: target.id, coveredSteps: [], coveredPeriods: hits  });
   }

  function startCopyPlacement(selection: CopiedTimelineSelection | null = copiedSelection) {
    if (!selection) return;
    setCopiedSelection(selection);
    setPending({ kind: 'copy', ...selection  });
    setPendingPoint(null);
    setContext(null);
    setCompactAddMenuOpen(false);
   }

  function copyContextStepsAndStartPlacement() {
    startCopyPlacement(copiedSelectionFromContext('steps'));
   }

  function copyContextPeriodsAndStartPlacement() {
    startCopyPlacement(copiedSelectionFromContext('periods'));
   }

  function cutContextStepsAndStartPlacement() {
    const selection = copiedSelectionFromContext('steps');
    const targetIds = contextStepIds();
    if (!selection || !targetIds.length) return;
    activeHistoryControl?.onCaptureHistory();
    onDelete(targetIds);
    setSelectedIds([]);
    setSelectedId(chart.steps.find((step) => !targetIds.includes(step.id))?.id ?? '');
    startCopyPlacement(selection);
   }

  function cutContextPeriodAndStartPlacement() {
    const selection = copiedSelectionFromContext('periods');
    if (!selection || !context?.periodId) return;
    activeHistoryControl?.onCaptureHistory();
    const copiedStepIds = selection.steps.map((step) => step.id);
    if (copiedStepIds.length) onDelete(copiedStepIds);
    onPeriodsChange(periods.filter((period) => period.id !== context.periodId));
    setSelectedPeriodId('');
    setSelectedIds((current) => current.filter((stepId) => !copiedStepIds.includes(stepId)));
    startCopyPlacement(selection);
   }

  function contextStepIds() {
    if (!context?.stepId) return [];
    return context.stepIds?.length ? context.stepIds : [context.stepId];
   }

  function mergeableStepsFromIds(stepIds: string[]): ComboStep[] {
    const ids = new Set(stepIds);
    const steps = chart.steps
      .filter((step) => ids.has(step.id))
      .sort((left, right) => left.startMin - right.startMin || left.startMax - right.startMax || left.id.localeCompare(right.id));
    if (steps.length < 2) return [];
    const first = steps[0];
    const firstSlot = first.characterSlot ?? 1;
    return steps.every((step) => step.moveId === first.moveId && (step.characterSlot ?? 1) === firstSlot && step.lane === first.lane) ? steps : [];
   }

  function mergeableContextSteps(): ComboStep[] {
    return mergeableStepsFromIds(contextStepIds());
   }

  function mergeSteps(steps: ComboStep[]) {
    if (steps.length < 2) return;
    const first = steps[0];
    const last = steps.reduce((latest, step) => step.startMin + step.durationMax >= latest.startMin + latest.durationMax ? step : latest, first);
    const mergedEndMax = Math.max(...steps.map((step) => step.startMin + step.durationMax));
    const mergedEndMin = Math.max(...steps.map((step) => step.startMin + step.durationMin));
    const removedIds = steps.slice(1).map((step) => step.id);
    const merged = normalizeStep({
      ...first,
      durationMin: Math.max(MIN_EDITOR_DURATION, mergedEndMin - first.startMin),
      durationMax: Math.max(MIN_EDITOR_DURATION, mergedEndMax - first.startMin),
      preheatMs: first.preheatMs ?? 0,
      recoveryMs: last.recoveryMs ?? 0,
      manualFree: steps.some((step) => Boolean(step.manualFree ?? step.free)),
      free: steps.some((step) => Boolean(step.free)),
      samples: steps.flatMap((step) => step.samples.map((sample) => ({ ...sample  })))
     });
    activeHistoryControl?.onCaptureHistory();
    onDelete(removedIds);
    onUpdate(first.id, merged);
    const contentLabels = { ...comboImageStyle.contentLabels  };
    removedIds.forEach((stepId) => delete contentLabels[stepId]);
    onContentChange({ contentLabels  });
    setSelectedId(first.id);
    setSelectedIds([first.id]);
    setRaisedStepId(first.id);
    setContext(null);
    endSpecialPlacement();
   }

  function mergeContextSteps() {
    mergeSteps(mergeableContextSteps());
   }

  function deleteContextSteps() {
    const targetIds = contextStepIds();
    if (!targetIds.length) return;
    activeHistoryControl?.onCaptureHistory();
    onDelete(targetIds);
    setSelectedIds([]);
    setContext(null);
   }

  function deleteContextPeriod() {
    if (!context?.periodId) return;
    activeHistoryControl?.onCaptureHistory();
    onPeriodsChange(periods.filter((period) => period.id !== context.periodId));
    setSelectedPeriodId('');
    setContext(null);
   }

  function showContextSubmenu(key: TimelineSubmenuKey, event: ReactMouseEvent<HTMLButtonElement>) {
    contextSubmenuAnchorRef.current = event.currentTarget;
    const rect = event.currentTarget.getBoundingClientRect();
    const estimatedWidth = 210;
    const margin = 8;
    const openRight = rect.right + estimatedWidth + 6 <= window.innerWidth - margin;
    setContextSubmenuPosition({
      x: clamp(openRight ? rect.right + 6 : rect.left - estimatedWidth - 6, margin, Math.max(margin, window.innerWidth - estimatedWidth - margin)),
      y: clamp(rect.top, margin, Math.max(margin, window.innerHeight - 240))
     });
    setActiveContextSubmenu(key);
   }

  function stepsStartingInPeriod(period: ComboPeriod): ComboStep[] {
    return [...chart.steps]
      .filter((step) => step.startMin >= period.startMs && step.startMin < period.endMs)
      .sort((left, right) => left.startMin - right.startMin || left.startMax - right.startMax || left.id.localeCompare(right.id));
   }

  function firstStepInPeriod(period: ComboPeriod): ComboStep | null {
    return stepsStartingInPeriod(period).find((step) => moves.find((move) => move.id === step.moveId)?.displayOnly !== true) ?? null;
   }


  function renderLoopBoundaryGuides() {
    const rowHeight = videoCompactMode ? compactLaneHeight : 68;
    const rowGap = videoCompactMode ? compactLaneGap : 12;
    const periodTrackHeight = videoCompactMode ? 26 : 42;
    const rulerHeight = videoCompactMode ? 22 : 28;
    const periodGap = videoCompactMode ? 4 : 6;
    const guideTop = (zoomFrameTrack ? periodTrackHeight + periodGap : 0) + periodTrackHeight + periodGap + rulerHeight;
    const stepCenterOffset = rowHeight / 2;
    const laneCenterY = (laneIndex: number) => guideTop + laneIndex * rowHeight + Math.floor(laneIndex / 2) * rowGap + stepCenterOffset;
    const guides = periods.filter((period) => period.kind === 'loop_axis').flatMap((period) => {
      const periodSteps = stepsStartingInPeriod(period);
      const first = periodSteps[0];
      const last = periodSteps[periodSteps.length - 1];
      if (!first || !last) return [];
      const periodStartX = 112 + (period.startMs / renderTotal) * trackWidth;
      const periodEndX = 112 + (period.endMs / renderTotal) * trackWidth;
      const firstX = 112 + (first.startMin / renderTotal) * trackWidth;
      const lastX = 112 + ((last.startMin + last.durationMax) / renderTotal) * trackWidth;
      const firstY = laneCenterY(timelineLaneIndex(first));
      const lastY = laneCenterY(timelineLaneIndex(last));
      const periodY = (zoomFrameTrack ? periodTrackHeight + periodGap : 0) + periodTrackHeight;
      const bendY = guideTop - 5;
      return [
        <polyline key={`${period.id}-start` } points={`${periodStartX},${periodY } ${periodStartX},${bendY } ${firstX},${bendY } ${firstX},${firstY }` } />,
        <polyline key={`${period.id}-end` } points={`${periodEndX},${periodY } ${periodEndX},${bendY } ${lastX},${bendY } ${lastX},${lastY }` } />
       ];
     });
    if (!guides.length) return null;
    return <svg className="timeline-loop-guides" width={trackWidth + 112 } height={guideTop + lanes.length * rowHeight + Math.floor(lanes.length / 2) * rowGap } aria-hidden="true">{guides }</svg>;
   }

  function isValidLoopStarter(step: ComboStep | null): boolean {
    return Boolean(step && (step.moveId === 'liberation' || step.moveId.startsWith('switch_')));
   }

  function renderPeriodBlock(period: ComboPeriod, roleScoped = false) {
    const invalidLoopStarter = period.kind === 'loop_axis' && !isValidLoopStarter(firstStepInPeriod(period));
    const periodClass = `timeline-period ${period.kind } ${invalidLoopStarter ? 'invalid-loop' : '' } ${roleScoped ? 'role-scoped' : '' } ${selectedPeriodId === period.id ? 'selected' : '' } ${raisedPeriodId === period.id ? 'raised' : '' }`;
    return <div key={period.id } className={periodClass  } style={{ left: `${(period.startMs / renderTotal) * 100 }%`, width: `${Math.max(1.8, ((period.endMs - period.startMs) / renderTotal) * 100) }%`, zIndex: raisedPeriodId === period.id || selectedPeriodId === period.id ? 7 : roleScoped ? 0 : 1  } } onPointerDown={(event) => beginPeriodDrag(event, period.id, 'move') } onContextMenu={(event) => handleSpecialContextMenu(event, () => openPeriodContext(event, period, period.characterSlot, period.lane)) }><span className="period-edge left" onPointerDown={(event) => beginPeriodDrag(event, period.id, 'start') } /><strong>{period.label }</strong><span>{((period.endMs - period.startMs) / 1000).toFixed(2) }s</span><span className="period-edge right" onPointerDown={(event) => beginPeriodDrag(event, period.id, 'end') } /></div>;
   }

  function renderStepLabel(step: ComboStep) {
    if (mode === 'content') {
      const defaultLabel = defaultComboContentLabelForMoveId(step.moveId) ?? localizedMoveLabel(step, language);
      return <label className="timeline-content-label" onPointerDown={(event) => event.stopPropagation() }><input data-step-nav-id={step.id } data-step-nav-field="content" value={comboImageStyle.contentLabels[step.id] ?? '' } placeholder={defaultLabel } onChange={(event) => onContentChange({ contentLabels: { ...comboImageStyle.contentLabels, [step.id]: event.target.value  }  }) } onBlur={(event) => setContentLabel(step.id, event.target.value) } onKeyDown={(event) => handleStepInputNavigation(event, step.id, 'content') } /><span>{defaultLabel }</span></label>;
     }
    return <strong>{localizedMoveLabel(step, language) }</strong>;
   }

  function renderZoomFrameTrack() {
    if (!zoomFrameTrack) return null;
    const frames = [...zoomFrameTrack.frames].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id));
    return (
      <div className="timeline-zoom-frame-track" style={{ width: trackWidth  } } onPointerMove={(event) => { if (pending?.kind === 'zoom') setTrackPendingPoint(event); zoomFrameTrack.onDragMove(event);  } } onClick={(event) => { if (pending?.kind === 'zoom') placePending({ startMs: pointerTime(event)  });  } } onContextMenu={(event) => handleSpecialContextMenu(event) } onPointerUp={zoomFrameTrack.onDragEnd } onPointerCancel={zoomFrameTrack.onDragEnd }>
         <div className="timeline-editor-lane period-lane-label">{text('缩放帧', 'Zoom Frames') }</div>
         {!videoCompactMode && <button className="timeline-zoom-frame-add" onClick={() => { setPending({ kind: 'zoom'  }); setPendingPoint(null);  } }><Plus size={14 } />{text('添加', 'Add') }</button> }
         {pending?.kind === 'zoom' && pendingPoint && <button className="timeline-zoom-placement-ghost" style={{ left: `${(pendingPoint.startMs / renderTotal) * 100 }%`  } }><span /><em>{frames.length + 1 }</em></button> }
        {frames.map((frame, index) => (
          <button key={frame.id } className="timeline-zoom-frame-marker" style={{ left: `${(frame.timeMs / renderTotal) * 100 }%`  } } title={text(`缩放帧 ${index + 1 } ${formatTimelineMs(frame.timeMs) }`, `Zoom Frame ${index + 1 } ${formatTimelineMs(frame.timeMs) }`) } onClick={() => { if (!pending) zoomFrameTrack.onSeek(frame.timeMs);  } } onPointerDown={(event) => { if (!pending) zoomFrameTrack.onBeginDrag(event, frame.id, renderTotal);  } }>
            <span />
            <em>{index + 1 }</em>
            {frames.length > 2 && <Trash2 size={13 } onPointerDown={(event) => event.stopPropagation() } onClick={(event) => { event.stopPropagation(); zoomFrameTrack.onDelete(frame.id);  } } /> }
          </button>
        )) }
      </div>
    );
   }

  const inspectorContent = (
    <>
      {selectedPeriod && (
        <div className="timeline-period-inspector">
          <strong>{selectedPeriod.label }</strong>
           <label>{text('类型', 'Type') }<select value={selectedPeriod.kind } onChange={(event) => setPeriodKind(selectedPeriod.id, event.target.value as ComboPeriodKind) }><option value="draft_period">{text('待设置', 'Unassigned') }</option><option value="free_fire">{text('自由开火', 'Free Action') }</option><option value="startup_axis">{text('启动轴', 'Startup Axis') }</option><option value="loop_axis">{text('循环轴', 'Loop Axis') }</option></select></label>
           <label>{text('名称', 'Name') }<input value={selectedPeriod.label } onChange={(event) => updatePeriod(selectedPeriod.id, { label: event.target.value  }) } /></label>
           {selectedPeriod.kind === 'loop_axis' && <NumberDraftInput label={text('编号', 'Index') } value={selectedPeriod.loopIndex ?? 1 } min={1 } onCommit={(value) => updatePeriod(selectedPeriod.id, { loopIndex: value  }) } /> }
           <NumberDraftInput label={text('开始 s', 'Start s') } value={msToSeconds(selectedPeriod.startMs) } min={0 } integer={false } disabled={selectedPeriod.kind === 'startup_axis' } onCommit={(value) => updatePeriod(selectedPeriod.id, { startMs: secondsToMs(value)  }) } />
           <NumberDraftInput label={text('结束 s', 'End s') } value={msToSeconds(selectedPeriod.endMs) } min={0 } integer={false } onCommit={(value) => updatePeriod(selectedPeriod.id, { endMs: secondsToMs(value)  }) } />
           <button onClick={() => onPeriodsChange(periods.filter((period) => period.id !== selectedPeriod.id)) }>{text('删除时段', 'Delete Period') }</button>
        </div>
      ) }
      {selected && (
        <div className="timeline-editor-inspector">
           <strong style={{ color: selected.color  } }>{selectedSteps.length > 1 ? text(`已选 ${selectedSteps.length } 个`, `${selectedSteps.length } selected`) : localizedMoveLabel(selected, language) }</strong>
           <label className="timeline-label-wide">{text('招式块文本', 'Block Text') }<input data-step-nav-id={selected.id } data-step-nav-field="content" value={comboImageStyle.contentLabels[selected.id] ?? '' } placeholder={defaultComboContentLabelForMoveId(selected.moveId) ?? localizedMoveLabel(selected, language) } onChange={(event) => setContentLabel(selected.id, event.target.value) } onKeyDown={(event) => handleStepInputNavigation(event, selected.id, 'content') } /></label>
           <label className="timeline-label-wide">{text('备注', 'Note') }<input data-step-nav-id={selected.id } data-step-nav-field="note" value={selectedSteps.length > 1 ? '' : selected.note ?? '' } placeholder={selectedSteps.length > 1 ? text('批量修改招式提示', 'Edit notes for selected actions') : defaultPromptTextForStep(selected, language, comboImageStyle) } onChange={(event) => selectedSteps.length > 1 ? updateSelectedSteps({ note: event.target.value  }) : onUpdate(selected.id, { note: event.target.value  }) } onKeyDown={(event) => handleStepInputNavigation(event, selected.id, 'note') } /></label>
           <label className="timeline-free-toggle"><input type="checkbox" checked={Boolean(selected.manualFree) } onChange={(event) => selectedSteps.length > 1 ? updateSelectedSteps({ manualFree: event.target.checked  }) : onUpdate(selected.id, { manualFree: event.target.checked  }) } />{text('自由', 'Free') }</label>
         <NumberDraftInput label={text('最早开始 s', 'Earliest Start s') } value={msToSeconds(selected.startMin) } min={0 } integer={false } onCommit={(value) => selectedSteps.length > 1 ? updateSelectedSteps({ startMin: secondsToMs(value)  }) : onUpdate(selected.id, { startMin: secondsToMs(value)  }) } />
         <NumberDraftInput label={text('最长持续 s', 'Max Duration s') } value={msToSeconds(selected.durationMax) } min={0 } integer={false } onCommit={(value) => selectedSteps.length > 1 ? updateSelectedSteps({ durationMax: secondsToMs(value)  }) : onUpdate(selected.id, { durationMax: secondsToMs(value)  }) } />
         <NumberDraftInput label={text('预热 s', 'Warm-up s') } value={msToSeconds(selected.preheatMs ?? 0) } min={0 } integer={false } onCommit={(value) => selectedSteps.length > 1 ? updateSelectedSteps({ preheatMs: secondsToMs(value)  }) : onUpdate(selected.id, { preheatMs: secondsToMs(value)  }) } />
         <NumberDraftInput label={text('后摇 s', 'Recovery s') } value={msToSeconds(selected.recoveryMs ?? 0) } min={0 } integer={false } onCommit={(value) => selectedSteps.length > 1 ? updateSelectedSteps({ recoveryMs: secondsToMs(value)  }) : onUpdate(selected.id, { recoveryMs: secondsToMs(value)  }) } />
        </div>
      ) }
    </>
  );
  const inspectorNode = inspectorPortalTarget ? createPortal(inspectorContent, inspectorPortalTarget) : inspectorContent;
  const toolbarNode = videoCompactMode ? (
    <div className="timeline-editor-video-tools" onPointerDown={(event) => event.stopPropagation()}>
       {onModeChange && <button className={`icon-button ${mode === 'content' ? 'active' : ''}`} title={mode === 'timeline' ? text('切换到内容编辑', 'Switch to content editing') : text('切换到时间编辑', 'Switch to timing editing')} onClick={() => onModeChange(mode === 'timeline' ? 'content' : 'timeline')}><Repeat2 size={16} /></button>}
       {zoomFrameTrack && <button className={`icon-button ${pending?.kind === 'delete' ? 'active' : ''}`} title={text('连续删除招式块；右键退出', 'Continuously delete action blocks; right-click to exit') } onClick={toggleContinuousDelete}><Trash2 size={16} /></button>}
       {zoomFrameTrack && <button className={`icon-button ${pending?.kind === 'cut' ? 'active' : ''}`} title={text('裁剪招式块', 'Split Action Block') } onClick={() => { if (pending?.kind === 'cut') endSpecialPlacement(); else { setPending({ kind: 'cut' }); setPendingPoint(null); setCompactAddMenuOpen(false); } }}><Scissors size={16} /></button>}
       {zoomFrameTrack && videoLayerTransformControl && <button className={`icon-button ${videoLayerTransformControl.active ? 'active' : ''}`} title={text('移动缩放', 'Move / Scale') } onClick={videoLayerTransformControl.onToggle} onPointerDown={videoLayerTransformControl.onScalePointerDown} onPointerMove={videoLayerTransformControl.onScalePointerMove} onPointerUp={videoLayerTransformControl.onScalePointerUp} onPointerCancel={videoLayerTransformControl.onScalePointerUp}><Move size={16} /></button>}
      <button className={`icon-button ${pending?.kind === 'move' || pending?.kind === 'period' ? 'active' : ''}`} title={activePlacementLabel ? text(`添加：${activePlacementLabel}；按 X 切时段`, `Add: ${activePlacementLabel}; press X for periods`) : text('添加', 'Add')} onClick={() => { if (pending?.kind === 'move' || pending?.kind === 'period') endSpecialPlacement(); else if (placeableMoves[0]) { setPending({ kind: 'move', moveId: placeableMoves[0].id }); setLastPlacementMoveId(placeableMoves[0].id); setLastPlacementAdaptiveSwitch(false); setLastPlacementContentLabel(null); setLastPlacementContentSuffix(null); setPendingPoint(null); setCompactAddMenuOpen(false); } }}><Plus size={16} /></button>
    </div>
  ) : (
    <div className="timeline-editor-toolbar"><div className="timeline-editor-add">
       {onModeChange && <div className="segmented timeline-mode-switch-inline"><button className={mode === 'timeline' ? 'active' : '' } onClick={() => onModeChange('timeline') }>{text('时间', 'Timing') }</button><button className={mode === 'content' ? 'active' : '' } onClick={() => onModeChange('content') }>{text('内容', 'Content') }</button></div>}
       {activePlayheadControl?.onTogglePlaying && <>
         <button className={`icon-button timeline-editor-play ${activePlayheadControl.isPlaying ? 'active' : '' }`} type="button" title={activePlayheadControl.isPlaying ? text('暂停', 'Pause') : text('播放', 'Play') } aria-label={activePlayheadControl.isPlaying ? text('暂停', 'Pause') : text('播放', 'Play') } onClick={activePlayheadControl.onTogglePlaying} disabled={activePlayheadControl.disabled }>{activePlayheadControl.isPlaying ? <Pause size={16 } /> : <Play size={16 } /> }</button>
         <div className="timeline-playback-menu" ref={playbackMenuRef }>
           <button className={`timeline-playback-rate ${activePlaybackRate < 1 ? 'active' : '' }`} type="button" title={text(`播放速度：${activePlaybackRate} 倍`, `Playback speed: ${activePlaybackRate}x`) } onClick={() => setPlaybackMenuOpen((open) => !open) } disabled={activePlayheadControl.disabled }>{activePlaybackRate }×</button>
           {playbackMenuOpen && <div className="timeline-playback-menu-panel">
             {TIMELINE_PLAYBACK_RATES.map((rate) => <button key={rate } className={activePlaybackRate === rate ? 'active' : '' } type="button" onClick={() => { activePlayheadControl.onPlaybackRateChange?.(rate); setPlaybackMenuOpen(false);  } }>{rate === 1 ? text('正常 1×', 'Normal 1x') : rate === 0.5 ? text('慢放 0.5×', 'Slow 0.5x') : text('慢放 0.2×', 'Slow 0.2x') }</button>) }
             {activePlayheadControl.onAutoFollowChange && <button className={`timeline-auto-follow-option ${activeTimelineAutoFollow ? 'active' : '' }`} type="button" aria-pressed={activeTimelineAutoFollow } onClick={() => activePlayheadControl.onAutoFollowChange?.(!activeTimelineAutoFollow) }><Check size={13 } />{text('自动跟随', 'Auto Follow') }</button> }
           </div> }
         </div>
       </> }
        <button className={`timeline-continuous-place icon-button ${pending?.kind === 'move' || pending?.kind === 'period' ? 'active' : ''}`} aria-label={text('添加', 'Add')} title={activePlacementLabel ? text(`添加：${activePlacementLabel}；按 X 切时段`, `Add: ${activePlacementLabel}; press X for periods`) : text('添加', 'Add')} onClick={() => { if (pending?.kind === 'move' || pending?.kind === 'period') endSpecialPlacement(); else if (placeableMoves[0]) { setPending({ kind: 'move', moveId: placeableMoves[0].id }); setLastPlacementMoveId(placeableMoves[0].id); setLastPlacementAdaptiveSwitch(false); setLastPlacementContentLabel(null); setLastPlacementContentSuffix(null); setPendingPoint(null); setCompactAddMenuOpen(false); } }}><Plus size={16} /></button>
       <button className={`icon-button ${pending?.kind === 'delete' ? 'active' : ''}`} title={text('连续删除招式块；右键退出', 'Continuously delete action blocks; right-click to exit') } onClick={toggleContinuousDelete}><Trash2 size={16} /></button>
       <button className={`icon-button ${pending?.kind === 'cut' ? 'active' : ''}`} title={text('裁剪招式块', 'Split Action Block') } onClick={() => { if (pending?.kind === 'cut') endSpecialPlacement(); else { setPending({ kind: 'cut' }); setPendingPoint(null); } }}><Scissors size={16} /></button>
       <label className="timeline-zoom-control">{text('缩放', 'Zoom') }<input type="range" min="0.05" max="1.6" step="0.01" value={zoom} onChange={(event) => onZoomChange(Number(event.target.value))} /></label>
       <button className="primary" onClick={onSave}><Save size={18} />{text('保存连段谱', 'Save Combo Chart') }</button>
       {pending && <button onClick={endSpecialPlacement}>{text('取消放置', 'Cancel Placement') }</button>}
       {pending && <span className="timeline-hint">{text('点击轨道放置，右键退出放置状态', 'Click a lane to place; right-click to exit placement mode') }</span>}
    </div></div>
  );
  const renderedToolbarNode = videoCompactMode && toolbarPortalTarget ? createPortal(toolbarNode, toolbarPortalTarget) : toolbarNode;
  const contextMenusContent = context ? <>
    <div className="timeline-context-menu" ref={contextMenuRef } style={{ left: contextMenuPosition.x, top: contextMenuPosition.y  } } onClick={(event) => event.stopPropagation() }>
      {context.stepId && <>
        <button className="context-menu-item" onMouseEnter={() => setActiveContextSubmenu(null) } onClick={copyContextStepsAndStartPlacement }>{text('复制', 'Copy') }</button>
        <button className="context-menu-item" onMouseEnter={() => setActiveContextSubmenu(null) } onClick={cutContextStepsAndStartPlacement }>{text('剪切', 'Cut') }</button>
        <button className="context-menu-item" disabled={mergeableContextSteps().length < 2 } title={mergeableContextSteps().length >= 2 ? text('合并选中的同类型块', 'Merge selected blocks of the same type') : text('至少选择两个同招式、同角色、同轨道的块', 'Select at least two blocks of the same action, character, and lane') } onMouseEnter={() => setActiveContextSubmenu(null) } onClick={mergeContextSteps }>{text('合并', 'Merge') }</button>
        <button className="context-menu-item danger-context-item" onMouseEnter={() => setActiveContextSubmenu(null) } onClick={deleteContextSteps }>{text('删除', 'Delete') }</button>
        <button className={activeContextSubmenu === 'change' ? 'context-menu-item has-submenu active' : 'context-menu-item has-submenu' } onMouseEnter={(event) => showContextSubmenu('change', event) } onClick={(event) => { event.preventDefault(); showContextSubmenu('change', event);  } }>{text('更改', 'Change') }</button>
      </> }
      {!context.stepId && context.periodId && <>
        <button className="context-menu-item" onMouseEnter={() => setActiveContextSubmenu(null) } onClick={copyContextPeriodsAndStartPlacement }>{text('复制', 'Copy') }</button>
        <button className="context-menu-item" onMouseEnter={() => setActiveContextSubmenu(null) } onClick={cutContextPeriodAndStartPlacement }>{text('剪切', 'Cut') }</button>
        <button className="context-menu-item danger-context-item" onMouseEnter={() => setActiveContextSubmenu(null) } onClick={deleteContextPeriod }>{text('删除', 'Delete') }</button>
      </> }
    </div>
    {activeContextSubmenu === 'change' && context.stepId && <div className="timeline-context-submenu" ref={contextSubmenuRef } style={{ left: contextSubmenuPosition.x, top: contextSubmenuPosition.y  } } onClick={(event) => event.stopPropagation() }>
      {contextChangeMoves.map((move) => {
        const adaptiveSwitch = move.id === 'switch_1';
        return <button key={move.id } onClick={() => applyMoveToSteps(contextStepIds(), move, adaptiveSwitch) }>{adaptiveSwitch ? text('切人', 'Switch Character') : localizedMoveDefinitionLabel(move, language) }</button>;
       }) }
    </div> }
  </> : null;
  const renderedContextMenus = contextMenusContent && typeof document !== 'undefined' ? createPortal(contextMenusContent, document.body) : contextMenusContent;

  return (
    <div className={`timeline-editor ${videoCompactMode ? 'video-compact-mode' : '' } ${pending?.kind === 'delete' ? 'continuous-delete-mode' : '' }` } style={timelineEditorStyle }>
      {renderedToolbarNode }
      <div className="timeline-editor-scroll" ref={scrollRef } onPointerMove={handlePendingEdgeMove } onPointerLeave={stopPendingEdgeScroll } onPointerUp={stopPendingEdgeScroll } onPointerCancel={stopPendingEdgeScroll } onContextMenu={(event) => { if (pending) handleSpecialContextMenu(event);  } }>
        {playheadOffscreenDirection && activePlayheadControl && <div className="timeline-playhead-offscreen-layer"><button className={`timeline-playhead-offscreen ${playheadOffscreenDirection }`  } title={playheadOffscreenDirection === 'left' ? text('当前播放位置在左侧', 'The current playback position is to the left') : text('当前播放位置在右侧', 'The current playback position is to the right') } onClick={(event) => { event.stopPropagation(); scrollToTimelineMs(activePlayheadControl.playbackMs);  } }>{playheadOffscreenDirection === 'left' ? <ChevronLeft size={16 } /> : <ChevronRight size={16 } /> }</button></div> }
        <div className="timeline-scroll-content" style={{ width: trackWidth + 112  } }>
          {activePlayheadControl && <div className={`timeline-playhead-overlay ${pending ? 'placement-active' : '' } ${activePlayheadControl.disabled ? 'disabled' : '' }`  } style={{ left: playheadContentX  } } onPointerDown={beginPlayheadDrag }><span /></div> }
        {renderLoopBoundaryGuides() }
        {renderZoomFrameTrack() }
        <div className={`timeline-editor-period-track ${pending ? 'placing' : '' }`  } style={{ width: trackWidth  } } onPointerMove={(event) => { if (!pending || (pending.kind !== 'period' && pending.kind !== 'copy')) return; setTrackPendingPoint(event);  } } onClick={(event) => { if (!pending || (pending.kind !== 'period' && pending.kind !== 'copy')) return; placePending({ startMs: pointerTime(event)  });  } } onContextMenu={(event) => handleSpecialContextMenu(event, () => openPeriodContext(event, null)) }>
           <div className="timeline-editor-lane period-lane-label">{text('时段', 'Periods') }</div>
          {globalPeriods.map((period) => renderPeriodBlock(period)) }
          {pending?.kind === 'period' && pendingPoint && pendingPoint.slot === undefined && pendingPeriodPreview && <div className={`timeline-placement-ghost period ${pendingPeriodPreview.kind}` } style={{ left: `${(pendingPoint.startMs / renderTotal) * 100 }%`, width: `${Math.max(1.8, ((pendingPeriodPreview.kind === 'startup_axis' || pendingPeriodPreview.kind === 'loop_axis' ? DEFAULT_AXIS_DURATION : DEFAULT_FREE_FIRE_DURATION) / renderTotal) * 100) }%`  } }>{pendingPeriodPreview.label}</div> }
          {copiedGhost && copiedGhostPoint?.slot === undefined && copiedGhost.periods.map((period) => {
            const delta = copyPlacementStartMs(copiedGhost, copiedGhostPoint!.startMs) - copiedGhost.anchorMs;
            return <div key={`ghost-${period.id }` } className={`timeline-placement-ghost copy period ${period.kind }`  } style={{ left: `${((period.startMs + delta) / renderTotal) * 100 }%`, width: `${Math.max(1.8, ((period.endMs - period.startMs) / renderTotal) * 100) }%`  } }><strong>{period.label }</strong></div>;
           }) }
        </div>
        <div className="timeline-editor-ruler" style={{ width: trackWidth  } }>{Array.from({ length: Math.ceil(renderTotal / 500) + 1  }, (_, index) => <span key={index  } style={{ left: `${((index * 500) / renderTotal) * 100 }%`  } }>{(index * 0.5).toFixed(index % 2 === 0 ? 0 : 1) }s</span>) }</div>
        <div className="timeline-editor-body" style={timelineBodyStyle }>
          {lanes.map((lane) => {
            const roleStyle = comboImageStyle.roleStyles[lane.slot];
            const laneSteps = chart.steps.filter((step) => (step.characterSlot ?? 1) === lane.slot && step.lane === lane.lane);
            const scopedPeriods = periods.filter((period) => period.characterSlot === lane.slot && period.lane === lane.lane && period.kind === 'free_fire');
            return <div className="timeline-editor-row" key={lane.id } data-slot={lane.slot } data-lane={lane.lane }>
              <div className="timeline-editor-lane avatar-lane-label">{lane.laneNumber === 1 && <><span className="lane-avatar" style={{ backgroundImage: roleStyle.avatar ? `url(${roleStyle.avatar })` : undefined, borderColor: roleStyle.color  } }>{roleStyle.avatar ? null : lane.slot }</span><span>{localizeDefaultCharacterName(roleStyle.name, lane.slot, language) }</span></> }</div>
              <div className={`timeline-editor-track ${pending ? 'placing' : '' }` } onPointerMove={(event) => setTrackPendingPoint(event, lane.slot, lane.lane) } onClick={(event) => { if (!pending) return; placePending({ slot: lane.slot, lane: lane.lane, startMs: pointerTime(event)  });  } } onContextMenu={(event) => handleSpecialContextMenu(event, () => openStepContext(event, null, laneSteps)) } onPointerDown={beginBoxSelect }>
                {scopedPeriods.map((period) => renderPeriodBlock(period, true)) }
                {laneSteps.map((step) => {
                  const preheatPercent = clamp(((step.preheatMs ?? 0) / step.durationMax) * 100, 0, 88);
                  const recoveryPercent = clamp(((step.recoveryMs ?? 0) / step.durationMax) * 100, 0, 88 - preheatPercent);
                  const isDraft = step.moveId === DRAFT_MOVE_ID;
                  const nearbyStartIndex = [...laneSteps].filter((candidate) => Math.abs(candidate.startMin - step.startMin) * zoom < 30).sort((left, right) => left.startMin - right.startMin || left.id.localeCompare(right.id)).findIndex((candidate) => candidate.id === step.id);
                  return <div key={step.id } data-step-id={step.id } className={`timeline-editor-block ${step.free ? 'free' : '' } ${isDraft ? 'draft' : '' } ${selectedIds.includes(step.id) ? 'selected' : '' } ${raisedStepId === step.id ? 'raised' : '' } ${pending?.kind === 'delete' ? 'delete-ready' : '' }`  } style={{ left: `${(step.startMin / renderTotal) * 100 }%`, width: `${Math.max(0.01, (step.durationMax / renderTotal) * 100) }%`, '--move-color': step.color, '--drag-tab-offset': `${Math.max(0, nearbyStartIndex) * 24 }px`, zIndex: pending?.kind === 'cut' || pending?.kind === 'delete' ? 120 : raisedStepId === step.id ? 8 : selectedIds.includes(step.id) ? 5 : 2  } as CSSProperties } onPointerDownCapture={(event) => deleteStepInContinuousMode(event, step.id) } onPointerDown={(event) => { if (pending?.kind === 'cut') { cutStepAtPointer(event, step); return;  } if (pending) return; if (event.ctrlKey) { event.preventDefault(); event.stopPropagation(); toggleStepSelection(step.id, true); return;  } beginDrag(event, step.id, 'move');  } } onContextMenu={(event) => handleSpecialContextMenu(event, () => openStepContext(event, step, laneSteps)) }><span className="timeline-block-drag-tab" title={text('拖动招式块', 'Drag Action Block') } onPointerDown={(event) => { event.stopPropagation(); setRaisedStepId(step.id); beginDrag(event, step.id, 'move');  } } /><div className="resize-handle left" onPointerDown={(event) => { event.stopPropagation(); beginDrag(event, step.id, event.altKey ? 'preheat' : 'start');  } } /><div className="warmup-zone left" style={{ width: `${preheatPercent }%`  } } /><div className="warmup-zone right" style={{ width: `${recoveryPercent }%`  } } /><div className="warmup-divider preheat" style={{ left: `${preheatPercent }%`  } } onPointerDown={(event) => { if (event.altKey) { event.stopPropagation(); beginDrag(event, step.id, 'preheat-divider');  }  } } /><div className="warmup-divider recovery" style={{ right: `${recoveryPercent }%`  } } onPointerDown={(event) => { if (event.altKey) { event.stopPropagation(); beginDrag(event, step.id, 'recovery-divider');  }  } } />{renderStepLabel(step) }{step.free && <em>{text('自由', 'Free') }</em> }{mode === 'content' && <div className="timeline-block-meta"><span className="move-type">{displayMoveLabel(step) }</span><span className="duration">{(step.durationMax / 1000).toFixed(2) }s</span></div> }<div className="resize-handle right" onPointerDown={(event) => { event.stopPropagation(); beginDrag(event, step.id, event.altKey ? 'recovery' : 'end');  } } /></div>;
                 }) }
                {pending && pending.kind !== 'copy' && pending.kind !== 'zoom' && pending.kind !== 'cut' && pending.kind !== 'delete' && pendingPoint?.slot === lane.slot && pendingPoint.lane === lane.lane && <div className={`timeline-placement-ghost ${pending.kind } ${pending.kind === 'period' && pendingPeriodPreview ? pendingPeriodPreview.kind : ''}`  } style={{ left: `${(pendingPoint.startMs / renderTotal) * 100 }%`, width: pending.kind === 'period' ? `${Math.max(1.8, (DEFAULT_FREE_FIRE_DURATION / renderTotal) * 100) }%` : pending.kind === 'move' ? `${Math.max(0.01, (500 / renderTotal) * 100) }%` : `${Math.max(1.8, (300 / renderTotal) * 100) }%`, ...(pending.kind === 'move' && activePlacedMove ? { '--move-color': activePlacedMove.color  } : { })  } as CSSProperties }>{pending.kind === 'move' && activePlacementLabel ? <strong>{activePlacementLabel }</strong> : pending.kind === 'period' && pendingPeriodPreview ? pendingPeriodPreview.label : pending.kind === 'step' ? text('待设置指令', 'Unassigned Action') : text('待设置时段', 'Unassigned Period') }</div> }
                {copiedGhost && copiedGhostPoint && copiedGhost.steps.filter((step) => (step.characterSlot ?? 1) === lane.slot && step.lane === lane.lane).map((step) => {
                  const delta = copyPlacementStartMs(copiedGhost, copiedGhostPoint!.startMs) - copiedGhost.anchorMs;
                  return <div key={`ghost-${step.id }` } className={`timeline-placement-ghost copy step ${step.free ? 'free' : '' }`  } style={{ left: `${((step.startMin + delta) / renderTotal) * 100 }%`, width: `${Math.max(0.01, (step.durationMax / renderTotal) * 100) }%`, '--move-color': step.color  } as CSSProperties }><strong>{displayMoveLabel(step) }</strong></div>;
                 }) }
              </div>
            </div>;
           }) }
          {selectionBox && <div className="timeline-selection-box" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height  } } /> }
        </div>
        </div>
      </div>
      {renderedContextMenus }
      {inspectorNode }
    </div>
  );
 }
function ComboContentEditor({ chart, style, onChange, onQuickInput  }: { chart: ComboChart; style: ComboImageStyle; onChange: (patch: Partial<ComboImageStyle>) => void; onQuickInput: () => void  }) {
  const { text  } = useI18n();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const items = chartToComboImageItems(chart, style);
  const total = Math.max(1000, ...chart.steps.map((step) => step.startMin + step.durationMax + 500));
  const pxPerMs = 0.16;
  const rows = CHARACTER_SLOTS.flatMap((slot) => ([
    { slot, lane: 'main' as LaneKind, id: `${slot }-main`  },
    { slot, lane: 'independent' as LaneKind, id: `${slot }-independent`  }
  ]));
  const setLabel = (stepId: string, value: string) => onChange({ contentLabels: { ...style.contentLabels, [stepId]: maybeConvertTextToIconLabel(value, style.convertIcons)  }  });
  const laneIndex = (step: ComboStep) => Math.max(0, CHARACTER_SLOTS.indexOf((step.characterSlot ?? 1) as CharacterSlot)) * 2 + (step.lane === 'independent' ? 1 : 0);
  function nearestStep(stepId: string, direction: 'left' | 'right' | 'up' | 'down'): ComboStep | null {
    const current = chart.steps.find((step) => step.id === stepId);
    if (!current) return null;
    const currentLane = laneIndex(current);
    const currentCenter = current.startMin + current.durationMax / 2;
    const sorted = [...chart.steps].sort((left, right) => left.startMin - right.startMin || left.startMax - right.startMax || left.id.localeCompare(right.id));
    if (direction === 'left') return [...sorted].reverse().find((step) => step.id !== stepId && laneIndex(step) === currentLane && step.startMin < current.startMin) ?? null;
    if (direction === 'right') return sorted.find((step) => step.id !== stepId && laneIndex(step) === currentLane && step.startMin > current.startMin) ?? null;
    const targetLane = direction === 'up' ? currentLane - 1 : currentLane + 1;
    return sorted.filter((step) => step.id !== stepId && laneIndex(step) === targetLane).sort((left, right) => Math.abs(left.startMin + left.durationMax / 2 - currentCenter) - Math.abs(right.startMin + right.durationMax / 2 - currentCenter) || left.startMin - right.startMin)[0] ?? null;
   }
  function handleContentNavigation(event: ReactKeyboardEvent<HTMLInputElement>, stepId: string) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const input = event.currentTarget;
    const selectionStart = input.selectionStart ?? 0;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    if (event.key === 'Enter') {
      input.blur();
      return;
    }
    const direction = event.key === 'ArrowUp' ? 'up' : event.key === 'ArrowDown' ? 'down' : event.key === 'ArrowLeft' && selectionStart === 0 && selectionEnd === 0 ? 'left' : event.key === 'ArrowRight' && selectionStart === input.value.length && selectionEnd === input.value.length ? 'right' : null;
    if (!direction) return;
    const target = nearestStep(stepId, direction);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const targetInput = panelRef.current?.querySelector<HTMLInputElement>(`input[data-content-nav-id="${CSS.escape(target.id)}"]`);
    targetInput?.focus();
    const end = targetInput?.value.length ?? 0;
    targetInput?.setSelectionRange(end, end);
   }
  return (
    <div ref={panelRef } className="combo-customizer-panel content-timeline-panel">
      <div className="combo-content-toolbar">
         <span>{text('点击块即可编辑连段图实际显示文字，底部浅色文字是默认招式名。', 'Select a block to edit its displayed text. The muted text below is the default action name.') }</span>
      </div>
      <div className="content-timeline-scroll">
        <div className="content-timeline-ruler" style={{ width: Math.max(960, total * pxPerMs)  } }>
          {Array.from({ length: Math.ceil(total / 1000) + 1  }, (_, index) => <span key={index  } style={{ left: index * 1000 * pxPerMs  } }>{index }s</span>) }
        </div>
        <div className="content-timeline-body" style={{ width: Math.max(960, total * pxPerMs)  } }>
          {rows.map((row) => {
            const role = style.roleStyles[row.slot];
            return (
              <div key={row.id } className={`content-timeline-row role-${row.slot }` }>
                <div className="content-timeline-lane"><span style={avatarBackgroundStyle(role.avatar) }>{role.avatar ? null : row.slot }</span></div>
                <div className="content-timeline-track">
                  {items.filter((item) => (item.step.characterSlot ?? 1) === row.slot && item.step.lane === row.lane).map((item) => {
                    const width = Math.max(92, item.step.durationMax * pxPerMs);
                    const custom = style.contentLabels[item.step.id] ?? '';
                    return (
                      <label key={item.step.id } className={`content-timeline-block ${item.isSwitch ? 'is-switch' : '' }`  } style={{ left: item.step.startMin * pxPerMs, width, '--move-color': role.color  } as CSSProperties }>
                        <input data-content-nav-id={item.step.id } value={custom } placeholder=" " onChange={(event) => onChange({ contentLabels: { ...style.contentLabels, [item.step.id]: event.target.value  }  }) } onBlur={(event) => setLabel(item.step.id, event.target.value) } onKeyDown={(event) => handleContentNavigation(event, item.step.id) } />
                        <span>{item.step.label }</span>
                      </label>
                    );
                   }) }
                </div>
              </div>
            );
           }) }
        </div>
      </div>
    </div>
  );
 }

function avatarPresetCrop(preset: DefaultAvatarEntry | ComboImageStyle['avatarPresets'][number]) {
  return 'crop' in preset ? preset.crop : undefined;
}

function presetMatchNames(name: string): string[] {
  const trimmed = name.trim();
  const names = [trimmed];
  if (trimmed.includes('·')) names.push(trimmed.split('·')[0].trim());
  if (trimmed.includes('.')) names.push(trimmed.split('.')[0].trim());
  return Array.from(new Set(names.filter(Boolean)));
}

function SimpleAppearanceEditor({ style, avatarPresets, basePresets, teamPresets, roleBaseFollowsAvatar, onRoleBaseFollowsAvatarChange, onApplyAvatarPreset, onTeamPresetsChange, onChange, onRoleChange, onPickAvatar, avatarInputRefs, blockSettingsReplacement  }: { style: ComboImageStyle; avatarPresets: DefaultAvatarEntry[]; basePresets: DefaultBasePresetEntry[]; teamPresets: TeamPresetEntry[]; roleBaseFollowsAvatar: boolean; onRoleBaseFollowsAvatarChange: (enabled: boolean) => void; onApplyAvatarPreset: (slot: CharacterSlot, preset: AvatarPresetEntry) => void; onTeamPresetsChange: (presets: TeamPresetEntry[]) => void; onChange: (patch: Partial<ComboImageStyle>) => void; onRoleChange: (slot: CharacterSlot, patch: Partial<ComboImageStyle['roleStyles'][CharacterSlot]>) => void; onPickAvatar: (slot: CharacterSlot, file: File | null) => void; avatarInputRefs: React.MutableRefObject<Record<number, HTMLInputElement | null>>; blockSettingsReplacement?: ReactNode  }) {
  const { language, text  } = useI18n();
  const englishLabels = {
    customBase: 'Custom Background',
    role: 'Character',
    roleHint: 'Character names are provided by the online character library',
    setting: 'Set',
    base: 'Background',
    blockStyle: 'Block Style',
    blockHint: 'Capsule, background, width, and scroll anchor',
    capsule: 'Capsule',
    capsuleShape: 'Capsule Shape',
    rect: 'Rectangle',
    autoWidth: 'Fit Content',
    fixedWidth: 'Fixed Width',
    globalBase: 'Global Background',
    start: 'Start',
    center: 'Center',
    fade: 'Fade',
    fadeStrength: 'Fade Strength',
    settings: 'Block Style Settings',
    close: 'Close',
    sizeLayout: 'Size & Layout',
    overallScale: 'Overall Scale %',
    height: 'Height px',
    gap: 'Gap px',
    startOffset: 'Start Offset px',
    fontSize: 'Font Size px',
    font: 'Font',
    avatarDisplay: 'Avatar & Display',
    prePrompt: 'Pre-prompt',
    iconConversion: 'Icon Conversion',
    mergeSameCharacter: 'Merge Same Character',
    avatarSize: 'Avatar Size',
    avatarX: 'Avatar X',
    avatarY: 'Avatar Y',
    textColor: 'Text Color',
    textOutline: 'Text Outline',
    outlineWidth: 'Outline Width px',
    outlineColor: 'Outline Color',
    baseScale: 'Background Scale',
    mergeLimit: 'Merge Limit',
    savePreset: 'Save Preset',
    crop: 'Crop',
    deleteUserPreset: 'Delete User Presets',
    baseHelp: 'Select a preset for the target. Delete mode only removes user presets.',
    all: 'All',
    addBase: 'Add Background',
    reuseGlobal: 'Use Global',
    customBaseHelp: 'Upload an image, then adjust its crop and stretch guides. Apply uses it for the current target; Save Preset also adds it to the preset list.',
    presetName: 'Preset Name',
    replaceImage: 'Replace Image',
    uploadImage: 'Upload Image',
    chooseBaseImage: 'Choose Background Image',
    cancel: 'Cancel',
    apply: 'Apply',
    avatarTitle: 'Avatar Settings',
    avatarHelp: 'Select a preset to change the character. Avatar changes are synchronized across all three modes.',
    importAvatar: 'Import Avatar',
    avatarCrop: 'Avatar Crop',
    avatarCropHelp: 'Drag the crop frame to adjust the visible area of the current character avatar.',
    teamPresets: 'Team Presets',
    teamPresetsHelp: 'Apply a saved team to all three character slots.',
    addTeam: 'Add Team',
    selectTeamHelp: 'Select up to three characters. Their selection order becomes slots 1-3.'
  };
  const chineseLabels: typeof englishLabels = {
    customBase: '\u81ea\u5b9a\u4e49\u5e95\u56fe',
    role: '\u89d2\u8272',
    roleHint: '\u89d2\u8272\u540d\u7531\u5728\u7ebf\u89d2\u8272\u5e93\u7edf\u4e00\u63d0\u4f9b',
    setting: '\u8bbe\u5b9a',
    base: '\u5e95\u56fe',
    blockStyle: '\u5757\u6837\u5f0f',
    blockHint: '\u80f6\u56ca\u3001\u5e95\u56fe\u3001\u5bbd\u5ea6\u4e0e\u6eda\u52a8\u951a\u70b9',
    capsule: '\u80f6\u56ca',
    capsuleShape: '\u80f6\u56ca\u578b',
    rect: '\u77e9\u5f62',
    autoWidth: '\u8ddf\u968f\u5185\u5bb9',
    fixedWidth: '\u56fa\u5b9a\u5bbd\u5ea6',
    globalBase: '\u5168\u5c40\u5e95\u56fe',
    start: '\u9876\u7aef',
    center: '\u5c45\u4e2d',
    fade: '\u6e10\u9690',
    fadeStrength: '\u6e10\u9690\u5f3a\u5ea6',
    settings: '\u5757\u6837\u5f0f\u8bbe\u7f6e',
    close: '\u5173\u95ed',
    sizeLayout: '\u5c3a\u5bf8\u4e0e\u6392\u7248',
    overallScale: '\u6574\u4f53\u7f29\u653e %',
    height: '\u9ad8\u5ea6 px',
    gap: '\u95f4\u8ddd px',
    startOffset: '\u8d77\u59cb\u4f4d\u7f6e px',
    fontSize: '\u5b57\u4f53 px',
    font: '\u5b57\u4f53',
    avatarDisplay: '\u5934\u50cf\u4e0e\u663e\u793a',
    prePrompt: '\u9884\u63d0\u793a',
    iconConversion: '\u56fe\u6807\u8f6c\u6362',
    mergeSameCharacter: '\u540c\u89d2\u8272\u5408\u5e76',
    avatarSize: '\u5934\u50cf\u5927\u5c0f',
    avatarX: '\u5934\u50cf X',
    avatarY: '\u5934\u50cf Y',
    textColor: '\u6587\u5b57\u989c\u8272',
    textOutline: '\u6587\u5b57\u63cf\u8fb9',
    outlineWidth: '\u63cf\u8fb9\u7c97\u7ec6 px',
    outlineColor: '\u63cf\u8fb9\u989c\u8272',
    baseScale: '\u5e95\u56fe\u7f29\u653e',
    mergeLimit: '\u5408\u5e76\u4e0a\u9650',
    savePreset: '\u4fdd\u5b58\u9884\u8bbe',
    crop: '\u88c1\u526a',
    deleteUserPreset: '\u5220\u9664\u7528\u6237\u9884\u8bbe',
    baseHelp: '\u70b9\u51fb\u9884\u8bbe\u5e94\u7528\u5230\u5e95\u56fe\u76ee\u6807\uff1b\u5220\u9664\u6a21\u5f0f\u53ea\u80fd\u5220\u9664\u7528\u6237\u4fdd\u5b58\u7684\u9884\u8bbe\u3002',
    all: '\u5168',
    addBase: '\u6dfb\u52a0\u5e95\u56fe',
    reuseGlobal: '\u590d\u7528\u5168\u5c40',
    customBaseHelp: '\u4e0a\u4f20\u56fe\u7247\u540e\u62d6\u52a8\u88c1\u526a\u6846\u548c\u84dd\u8272\u62c9\u4f38\u7ebf\u3002\u5e94\u7528\u53ea\u7528\u4e8e\u5f53\u524d\u76ee\u6807\uff0c\u4fdd\u5b58\u9884\u8bbe\u4f1a\u540c\u65f6\u52a0\u5165\u5e95\u56fe\u9884\u8bbe\u5217\u8868\u3002',
    presetName: '\u9884\u8bbe\u540d\u79f0',
    replaceImage: '\u66f4\u6362\u56fe\u7247',
    uploadImage: '\u4e0a\u4f20\u56fe\u7247',
    chooseBaseImage: '\u9009\u62e9\u5e95\u56fe\u56fe\u7247',
    cancel: '\u53d6\u6d88',
    apply: '\u5e94\u7528',
    avatarTitle: '\u5934\u50cf\u8bbe\u5b9a',
    avatarHelp: '\u70b9\u51fb\u9884\u8bbe\u5207\u6362\u89d2\u8272\uff0c\u65b0\u89d2\u8272\u7531\u5728\u7ebf\u89d2\u8272\u5e93\u66f4\u65b0\uff1b\u5934\u50cf\u66f4\u6539\u4f1a\u540c\u6b65\u5230\u6a2a\u5411\u3001\u7eb5\u5411\u548c\u7011\u5e03\u4e09\u79cd\u6a21\u5f0f\u3002',
    importAvatar: '\u5bfc\u5165\u5934\u50cf',
    avatarCrop: '\u5934\u50cf\u88c1\u526a',
    avatarCropHelp: '\u62d6\u52a8\u88c1\u526a\u6846\u8c03\u6574\u5f53\u524d\u89d2\u8272\u5934\u50cf\u663e\u793a\u8303\u56f4\u3002',
    teamPresets: '\u961f\u4f0d\u9884\u8bbe',
    teamPresetsHelp: '\u70b9\u51fb\u5df2\u4fdd\u5b58\u7684\u961f\u4f0d\u5373\u53ef\u6309\u987a\u5e8f\u66ff\u6362\u4e09\u4e2a\u89d2\u8272\u3002',
    addTeam: '\u6dfb\u52a0\u961f\u4f0d',
    selectTeamHelp: '\u6700\u591a\u9009\u62e9\u4e09\u4e2a\u89d2\u8272\uff0c\u9009\u62e9\u987a\u5e8f\u5c31\u662f\u89d2\u8272 1-3 \u7684\u987a\u5e8f\u3002'
  };
  const L = language === 'zh-CN'
    ? chineseLabels
    : Object.fromEntries(Object.entries(englishLabels).map(([key, value]) => [key, localizeEnglish(value, language)])) as typeof englishLabels;
  const safeAvatarPresets = normalizeAvatarPresets(avatarPresets);
  const safeBasePresets = sortBasePresets([...basePresets, ...style.basePresets]);
  const commonBasePreset = safeBasePresets.find((preset) => preset.name.trim() === '\u901a\u7528' || preset.name.trim() === '\u95ab\u6c13\u657c\u7528');
  const sortedBasePresets = safeBasePresets.filter((preset) => preset !== commonBasePreset);
  const [avatarPickerSlot, setAvatarPickerSlot] = useState<CharacterSlot | null>(null);
  const [basePresetOpen, setBasePresetOpen] = useState(false);
  const [basePresetTargets, setBasePresetTargets] = useState<Array<'global' | CharacterSlot>>(['global']);
  const [basePresetDeleteMode, setBasePresetDeleteMode] = useState(false);
  const [avatarPresetDeleteMode, setAvatarPresetDeleteMode] = useState(false);
  const [teamPresetOpen, setTeamPresetOpen] = useState(false);
  const [teamSelectionOpen, setTeamSelectionOpen] = useState(false);
  const [teamPresetDeleteMode, setTeamPresetDeleteMode] = useState(false);
  const [teamSelection, setTeamSelection] = useState<string[]>([]);
  const [customBaseDraft, setCustomBaseDraft] = useState<ComboImageStyle | null>(null);
  const [customBaseName, setCustomBaseName] = useState(L.customBase);
  const [avatarCropOpen, setAvatarCropOpen] = useState(false);
  const customBaseInputRef = useRef<HTMLInputElement | null>(null);
  const activeAvatarRole = avatarPickerSlot ? style.roleStyles[avatarPickerSlot] : null;
  const basePresetSingleRoleTarget = basePresetTargets.length === 1 && basePresetTargets[0] !== 'global' ? basePresetTargets[0] as CharacterSlot : null;
  const apiCharacterNames = new Set(safeAvatarPresets.map((preset) => preset.name.trim()));
  const combinedAvatarPresets: Array<DefaultAvatarEntry | ComboImageStyle['avatarPresets'][number]> = sortAvatarPresets([...safeAvatarPresets, ...style.avatarPresets.map((preset) => ({ ...preset, name: normalizeCharacterName(preset.name)  })).filter((preset) => apiCharacterNames.has(preset.name.trim()))]);
  const teamCharacterNames = new Set<string>();
  const teamCharacterPresets = combinedAvatarPresets.filter((preset) => {
    const name = normalizeCharacterName(preset.name);
    if (teamCharacterNames.has(name)) return false;
    teamCharacterNames.add(name);
    return true;
   });

  function avatarPresetByName(name: string) {
    const normalizedName = normalizeCharacterName(name);
    return combinedAvatarPresets.find((preset) => normalizeCharacterName(preset.name) === normalizedName);
  }

  function toggleTeamCharacter(preset: AvatarPresetEntry) {
    const name = normalizeCharacterName(preset.name);
    setTeamSelection((current) => {
      if (current.includes(name)) return current.filter((item) => item !== name);
      if (current.length >= CHARACTER_SLOTS.length) return current;
      return [...current, name];
     });
  }

  function openTeamSelection() {
    setTeamSelection([]);
    setTeamPresetDeleteMode(false);
    setTeamPresetOpen(false);
    setTeamSelectionOpen(true);
  }

  function saveTeamPreset() {
    if (!teamSelection.length) return;
    onTeamPresetsChange([...teamPresets, { id: `team_preset_${crypto.randomUUID() }`, characters: [...teamSelection]  }]);
    setTeamSelectionOpen(false);
    setTeamPresetOpen(true);
  }

  function applyTeamPreset(preset: TeamPresetEntry) {
    if (teamPresetDeleteMode) {
      onTeamPresetsChange(teamPresets.filter((item) => item.id !== preset.id));
      return;
    }
    const assignments = preset.characters.flatMap((name, index) => {
      const avatarPreset = avatarPresetByName(name);
      return avatarPreset && index < CHARACTER_SLOTS.length ? [{ slot: CHARACTER_SLOTS[index], avatarPreset  }] : [];
     });
    if (assignments.length !== preset.characters.length) return;
    assignments.forEach(({ slot, avatarPreset  }) => onApplyAvatarPreset(slot, avatarPreset));
    setTeamPresetOpen(false);
  }

  function applyAvatarPreset(slot: CharacterSlot, preset: DefaultAvatarEntry | ComboImageStyle['avatarPresets'][number]) {
    if (avatarPresetDeleteMode) {
      if (!('user' in preset) || !preset.user) return;
      onChange({ avatarPresets: style.avatarPresets.filter((item) => item.src !== preset.src)  });
      return;
    }
    onApplyAvatarPreset(slot, preset);
    setAvatarPickerSlot(null);
  }

  function toggleBasePresetTarget(target: 'global' | CharacterSlot) {
    setBasePresetTargets((current) => current.includes(target) ? (current.length > 1 ? current.filter((item) => item !== target) : current) : [...current, target]);
  }

  function basePresetPatch(preset: DefaultBasePresetEntry) {
    return {
      capsuleImage: preset.src,
      capsuleImageWidth: preset.imageWidth,
      capsuleImageHeight: preset.imageHeight,
      capsuleCrop: preset.crop ?? { x: 0, y: 0, w: 100, h: 100  },
      capsuleStretch: preset.stretch ?? { left: 25, right: 75  },
      capsuleEdge: preset.edge ?? 0
    };
  }

  function roleStylesWithoutBaseOverrides(): ComboImageStyle['roleStyles'] {
    const clearBaseOverride = {
      capsuleImage: undefined,
      capsuleImageWidth: undefined,
      capsuleImageHeight: undefined,
      capsuleCrop: undefined,
      capsuleStretch: undefined,
      capsuleEdge: undefined
    };
    return {
      1: { ...style.roleStyles[1], ...clearBaseOverride  },
      2: { ...style.roleStyles[2], ...clearBaseOverride  },
      3: { ...style.roleStyles[3], ...clearBaseOverride  }
    };
  }

  function clearRoleBaseOverride(slot: CharacterSlot) {
    onRoleChange(slot, { capsuleImage: undefined, capsuleImageWidth: undefined, capsuleImageHeight: undefined, capsuleCrop: undefined, capsuleStretch: undefined, capsuleEdge: undefined  });
    setBasePresetOpen(false);
  }

  function renderBasePresetTile(preset: DefaultBasePresetEntry) {
    const userPreset = preset.user === true;
    return <button key={`${preset.id }-${preset.src }` } className={`preset-tile base-preset-tile ${basePresetDeleteMode ? userPreset ? 'delete-mode' : 'locked-preset' : '' }` } onClick={() => applyBasePreset(preset) }><BasePresetPreview preset={preset } /><strong>{localizeCharacterName(preset.name, language) }</strong>{basePresetDeleteMode && userPreset && <span className="preset-delete-x" aria-hidden="true">?</span>}</button>;
  }

  function applyBasePreset(preset: DefaultBasePresetEntry) {
    if (basePresetDeleteMode) {
      if (!preset.user) return;
      onChange({ basePresets: style.basePresets.filter((item) => item.id !== preset.id && item.src !== preset.src)  });
      return;
    }
    const patch = basePresetPatch(preset);
    if (basePresetTargets.includes('global')) onChange({ blockMode: 'image', ...patch, roleStyles: roleStylesWithoutBaseOverrides()  });
    else onChange({ blockMode: 'image'  });
    basePresetTargets.filter((target): target is CharacterSlot => target !== 'global').forEach((slot) => onRoleChange(slot, patch));
    setBasePresetOpen(false);
  }

  function openBasePresetFor(target: 'global' | CharacterSlot) {
    setBasePresetTargets([target]);
    setBasePresetDeleteMode(false);
    setBasePresetOpen(true);
  }

  function openCustomBaseEditor() {
    setCustomBaseName(L.customBase);
    setCustomBaseDraft({ ...style, blockMode: 'image', capsuleImage: undefined, capsuleImageWidth: undefined, capsuleImageHeight: undefined, capsuleCrop: { x: 0, y: 0, w: 100, h: 100  }, capsuleStretch: { left: 25, right: 75  }, capsuleEdge: 0  });
  }

  async function pickCustomBase(file: File | null) {
    if (!file) return;
    const source = await readFileAsDataUrl(file);
    const optimized = await optimizePresetImage(source);
    setCustomBaseDraft((current) => normalizeComboImageStyle({ ...(current ?? style), blockMode: 'image', capsuleImage: optimized.src, capsuleImageWidth: optimized.width, capsuleImageHeight: optimized.height, capsuleCrop: { x: 0, y: 0, w: 100, h: 100  }, capsuleStretch: { left: 25, right: 75  }, capsuleEdge: 0  }));
  }

  function applyCustomBase(savePreset: boolean) {
    if (!customBaseDraft?.capsuleImage) return;
    const preset: DefaultBasePresetEntry = { id: `base_preset_${crypto.randomUUID() }`, name: customBaseName.trim() || L.customBase, src: customBaseDraft.capsuleImage, imageWidth: customBaseDraft.capsuleImageWidth, imageHeight: customBaseDraft.capsuleImageHeight, crop: normalizeRectPercent(customBaseDraft.capsuleCrop, { x: 0, y: 0, w: 100, h: 100  }), stretch: customBaseDraft.capsuleStretch ?? { left: 25, right: 75  }, edge: customBaseDraft.capsuleEdge, user: true  };
    const patch = basePresetPatch(preset);
    if (basePresetTargets.includes('global')) onChange({ blockMode: 'image', ...patch, roleStyles: roleStylesWithoutBaseOverrides(), ...(savePreset ? { basePresets: [...style.basePresets, preset]  } : { })  });
    else onChange({ blockMode: 'image', ...(savePreset ? { basePresets: [...style.basePresets, preset]  } : { })  });
    basePresetTargets.filter((target): target is CharacterSlot => target !== 'global').forEach((slot) => onRoleChange(slot, patch));
    setCustomBaseDraft(null);
    setBasePresetOpen(false);
  }

  function currentBaseSource() {
    return basePresetSingleRoleTarget ? style.roleStyles[basePresetSingleRoleTarget] : style;
  }

  function saveCurrentBasePreset() {
    const effective = currentBaseSource();
    if (!effective.capsuleImage) return;
    const preset: DefaultBasePresetEntry = { id: `base_preset_${crypto.randomUUID() }`, name: (basePresetSingleRoleTarget ? style.roleStyles[basePresetSingleRoleTarget].name : L.globalBase) || L.customBase, src: effective.capsuleImage, imageWidth: effective.capsuleImageWidth, imageHeight: effective.capsuleImageHeight, crop: normalizeRectPercent(effective.capsuleCrop, { x: 0, y: 0, w: 100, h: 100  }), stretch: effective.capsuleStretch ?? { left: 25, right: 75  }, edge: effective.capsuleEdge ?? 0, user: true  };
    onChange({ basePresets: [...style.basePresets, preset]  });
  }

  function saveCurrentAvatarPreset() {
    if (!avatarPickerSlot) return;
    const role = style.roleStyles[avatarPickerSlot];
    if (!role.avatar) return;
    const preset = { id: `avatar_preset_${crypto.randomUUID() }`, name: role.name || `${L.role} ${avatarPickerSlot }`, src: role.avatar, crop: normalizeRectPercent(role.avatarCrop, { x: 0, y: 0, w: 100, h: 100  }), user: true  };
    onChange({ avatarPresets: [...style.avatarPresets, preset]  });
  }

  function openAvatarCrop() {
    if (!avatarPickerSlot || !style.roleStyles[avatarPickerSlot].avatar) return;
    setAvatarCropOpen(true);
  }

  return (
    <div className="combo-appearance-editor rich-appearance-editor">
      <section className="appearance-section">
        <div className="appearance-section-head"><strong>{L.role}</strong><span>{L.roleHint}</span></div>
        <div className="role-list-editor compact-role-list">
          {CHARACTER_SLOTS.map((slot) => {
            const role = style.roleStyles[slot];
            const displayRoleName = localizeDefaultCharacterName(role.name, slot, language);
            return <div key={slot } className="role-editor-card compact-role-card"><div className="role-editor-head role-editor-head-v2"><div className="role-avatar-preview" style={avatarBackgroundStyle(role.avatar) }>{role.avatar ? null : slot }</div><div className="role-name-inline role-name-readonly" title={displayRoleName }>{displayRoleName}</div><button onClick={() => { setAvatarPresetDeleteMode(false); setAvatarPickerSlot(slot);  } }>{L.setting}</button><div className="role-mode-control">{style.blockMode === 'image' ? <button className="role-base-preset-trigger" onClick={() => openBasePresetFor(slot) }>{L.base}</button> : <label className="role-color-control" title={`${displayRoleName } ${L.capsule}`}><input type="color" value={role.color } onChange={(event) => onRoleChange(slot, { color: event.target.value  }) } /></label>}</div><input ref={(node) => { avatarInputRefs.current[slot] = node;  } } className="file-input" type="file" accept="image/*" onChange={(event) => onPickAvatar(slot, event.target.files?.[0] ?? null) } /></div></div>;
          }) }
          <button type="button" className="role-editor-card compact-role-card team-preset-trigger" onClick={() => { setTeamPresetDeleteMode(false); setTeamPresetOpen(true);  }}><span className="team-preset-trigger-avatars">{CHARACTER_SLOTS.map((slot) => { const role = style.roleStyles[slot]; return <span key={slot } style={avatarBackgroundStyle(role.avatar) }>{role.avatar ? null : slot }</span>;  }) }</span><strong>{L.teamPresets}</strong></button>
        </div>
      </section>

      <section className={`appearance-section block-style-section ${blockSettingsReplacement ? 'waterfall-block-settings' : '' }`}>
        <div className="appearance-section-head block-style-head"><div><strong>{blockSettingsReplacement ? '\u7011\u5e03\u53c2\u6570' : L.blockStyle}</strong><span>{blockSettingsReplacement ? '\u72ec\u7acb\u63a7\u5236\u7011\u5e03\u6a21\u5f0f\u7684\u7f6e\u9876\u8fde\u6bb5\u56fe\u4e0e\u89c6\u9891\u6a21\u5f0f\u3002' : L.blockHint}</span></div></div>
        <div className="appearance-switch-row"><div className="segmented appearance-mode-tabs"><button className={style.blockMode === 'capsule' ? 'active' : '' } onClick={() => onChange({ blockMode: 'capsule'  }) }>{L.capsule}</button><button className={style.blockMode === 'image' ? 'active' : '' } onClick={() => onChange({ blockMode: 'image'  }) }>{L.base}</button></div>{style.blockMode === 'capsule' && <div className="segmented appearance-mode-tabs"><button className={style.capsuleShape === 'capsule' ? 'active' : '' } onClick={() => onChange({ capsuleShape: 'capsule'  }) }>{L.capsuleShape}</button><button className={style.capsuleShape === 'rect' ? 'active' : '' } onClick={() => onChange({ capsuleShape: 'rect'  }) }>{L.rect}</button></div> }<div className="segmented appearance-mode-tabs"><button className={style.capsuleWidthMode === 'auto' ? 'active' : '' } onClick={() => onChange({ capsuleWidthMode: 'auto'  }) }>{L.autoWidth}</button><button className={style.capsuleWidthMode === 'fixed' ? 'active' : '' } onClick={() => onChange({ capsuleWidthMode: 'fixed'  }) }>{L.fixedWidth}</button></div>{style.blockMode === 'image' && <button className="base-preset-trigger" onClick={() => openBasePresetFor('global') }>{L.globalBase}</button> }<div className="segmented appearance-mode-tabs"><button className={style.scrollAnchor === 'start' ? 'active' : '' } onClick={() => onChange({ scrollAnchor: 'start'  }) }>{L.start}</button><button className={style.scrollAnchor === 'center' ? 'active' : '' } onClick={() => onChange({ scrollAnchor: 'center'  }) }>{L.center}</button></div><label className="checkline"><input type="checkbox" checked={style.fadeEnabled } onChange={(event) => onChange({ fadeEnabled: event.target.checked  }) } />{L.fade}</label><label className="checkline"><input type="checkbox" checked={style.prePromptEnabled } onChange={(event) => onChange({ prePromptEnabled: event.target.checked  }) } />{L.prePrompt}</label><label className="checkline"><input type="checkbox" checked={style.convertIcons } onChange={(event) => onChange({ convertIcons: event.target.checked  }) } />{L.iconConversion}</label>{!blockSettingsReplacement && <label className="checkline"><input type="checkbox" checked={style.mergeSameRoleSteps } onChange={(event) => onChange({ mergeSameRoleSteps: event.target.checked  }) } />{L.mergeSameCharacter}</label>}</div>
        <div className="block-style-parameters appearance-settings-inline">
          {blockSettingsReplacement}
          <div className="appearance-settings-group"><span>{L.sizeLayout}</span><div className="appearance-grid stable-number-grid">
            <NumberDraftInput label={L.overallScale} value={Math.round(style.overallScale * 100) } min={25 } onCommit={(value) => onChange({ overallScale: value / 100  }) } />
            <div className={style.capsuleWidthMode === 'fixed' ? '' : 'parameter-disabled'}><NumberDraftInput label={text('宽度', 'Width') } value={style.blockMode === 'image' ? style.imageBlockWidth : style.capsuleWidth } min={24 } onCommit={(value) => onChange(style.blockMode === 'image' ? { imageBlockWidth: value  } : { capsuleWidth: value  }) } /></div>
            <NumberDraftInput label={L.height} value={style.blockMode === 'image' ? style.imageBlockHeight : style.capsuleHeight } onCommit={(value) => onChange(style.blockMode === 'image' ? { imageBlockHeight: value  } : { capsuleHeight: value  }) } />
            <NumberDraftInput label={L.gap} value={style.capsuleGap } onCommit={(value) => onChange({ capsuleGap: value  }) } />
            <div className={style.scrollAnchor === 'start' ? '' : 'parameter-disabled'}><NumberDraftInput label={L.startOffset} value={style.scrollStartOffsetPx } min={-5000 } onCommit={(value) => onChange({ scrollStartOffsetPx: value  }) } /></div>
            <NumberDraftInput label={L.fontSize} value={style.fontSize } onCommit={(value) => onChange({ fontSize: value  }) } />
            <label>{L.font}<input value={style.fontFamily } onChange={(event) => onChange({ fontFamily: event.target.value  }) } placeholder="Microsoft YaHei, SimHei" /></label>
            {!blockSettingsReplacement && <div className={style.mergeSameRoleSteps ? '' : 'parameter-disabled'}><NumberDraftInput label={L.mergeLimit} value={style.mergeSameRoleLimit } min={1 } onCommit={(value) => onChange({ mergeSameRoleLimit: value  }) } /></div>}
          </div></div>
          <div className="appearance-settings-group"><span>{L.avatarDisplay}</span><div className="appearance-grid stable-number-grid">
            <NumberDraftInput label={L.avatarSize} value={style.avatarSize } min={16 } onCommit={(value) => onChange({ avatarSize: value  }) } />
            <NumberDraftInput label={L.avatarX} value={style.avatarOffsetX } min={-300 } onCommit={(value) => onChange({ avatarOffsetX: value  }) } />
            <NumberDraftInput label={L.avatarY} value={style.avatarOffsetY } min={-300 } onCommit={(value) => onChange({ avatarOffsetY: value  }) } />
            <div className={style.fadeEnabled ? '' : 'parameter-disabled'}><NumberDraftInput label={L.fadeStrength} value={style.fadeRange } onCommit={(value) => onChange({ fadeRange: value  }) } /></div>
            <label>{L.textColor}<input type="color" value={style.textColor } onChange={(event) => onChange({ textColor: event.target.value  }) } /></label>
            <label className="checkline"><input type="checkbox" checked={style.textStrokeEnabled } onChange={(event) => onChange({ textStrokeEnabled: event.target.checked  }) } />{L.textOutline}</label>
            <div className={style.textStrokeEnabled ? '' : 'parameter-disabled'}><NumberDraftInput label={L.outlineWidth} value={style.textStrokeWidth } min={0 } max={12 } integer={false } disabled={!style.textStrokeEnabled } onCommit={(value) => onChange({ textStrokeWidth: value  }) } /></div>
            <label className={style.textStrokeEnabled ? '' : 'parameter-disabled'}>{L.outlineColor}<input type="color" disabled={!style.textStrokeEnabled } value={style.textStrokeColor } onChange={(event) => onChange({ textStrokeColor: event.target.value  }) } /></label>
          </div></div>
        </div>
      </section>

      <section className="appearance-section role-base-link-section">
        <label className="checkline role-base-link-toggle"><input type="checkbox" checked={roleBaseFollowsAvatar } onChange={(event) => onRoleBaseFollowsAvatarChange(event.target.checked) } /><span><strong>{text('头像联动角色底图', 'Link Avatar to Character Base') }</strong><small>{text('关闭时，头像在三种模式间同步；换角色或导入连段时，该角色切回当前模式的全局底图。', 'When off, avatars stay synchronized across all three modes; switching characters or importing a combo returns that character to the current mode’s global base image.') }</small></span></label>
      </section>

      {basePresetOpen && <div className="preset-picker-backdrop" onMouseDown={() => setBasePresetOpen(false) }><div className="preset-picker-panel base-preset-panel" onMouseDown={(event) => event.stopPropagation() }><div className="preset-picker-head"><div><h3>{L.base}</h3><p>{L.baseHelp}</p></div><div className="base-preset-head-actions"><button onClick={saveCurrentBasePreset} disabled={!currentBaseSource().capsuleImage}><Save size={18 } /><span>{L.savePreset}</span></button><button onClick={() => setCustomBaseDraft(normalizeComboImageStyle(basePresetSingleRoleTarget ? { ...style, ...style.roleStyles[basePresetSingleRoleTarget] } : style)) } disabled={!currentBaseSource().capsuleImage}><Scissors size={18 } /><span>{L.crop}</span></button><button className={basePresetDeleteMode ? 'active danger' : '' } title={L.deleteUserPreset} onClick={() => setBasePresetDeleteMode((value) => !value) }><X size={19 } /></button></div></div><div className="preset-picker-grid base-preset-grid"><button className="preset-tile add-tile base-preset-add-tile" onClick={openCustomBaseEditor }><span>+</span><strong>{L.addBase}</strong></button>{basePresetSingleRoleTarget && <button className="preset-tile base-preset-reuse-tile" onClick={() => clearRoleBaseOverride(basePresetSingleRoleTarget) }><BanIcon /><strong>{L.reuseGlobal}</strong></button>}{commonBasePreset && renderBasePresetTile(commonBasePreset) }{sortedBasePresets.map(renderBasePresetTile) }</div></div></div> }
      {customBaseDraft && <div className="preset-picker-backdrop custom-base-editor-backdrop" onMouseDown={() => setCustomBaseDraft(null) }><div className="crop-dialog-panel custom-base-editor-panel" onMouseDown={(event) => event.stopPropagation() }><div className="preset-picker-head"><div><h3>{L.customBase}</h3><p>{L.customBaseHelp}</p></div><button onClick={() => setCustomBaseDraft(null) }>?</button></div><div className="custom-base-editor-toolbar"><label>{L.presetName}<input value={customBaseName } onChange={(event) => setCustomBaseName(event.target.value) } /></label><button onClick={() => customBaseInputRef.current?.click() }>{customBaseDraft.capsuleImage ? L.replaceImage : L.uploadImage}</button><input ref={customBaseInputRef } className="file-input" type="file" accept="image/*" onChange={(event) => { void pickCustomBase(event.target.files?.[0] ?? null); event.currentTarget.value = '';  } } /></div>{customBaseDraft.capsuleImage ? <CapsuleImageVisualEditor style={customBaseDraft } onChange={(patch) => setCustomBaseDraft((current) => current ? normalizeComboImageStyle({ ...current, ...patch  }) : current) } /> : <button className="custom-base-upload-stage" onClick={() => customBaseInputRef.current?.click() }><Plus size={32 } /><strong>{L.chooseBaseImage}</strong></button> }<div className="custom-base-editor-actions"><button onClick={() => setCustomBaseDraft(null) }>{L.cancel}</button><button disabled={!customBaseDraft.capsuleImage } onClick={() => applyCustomBase(false) }>{L.apply}</button><button className="primary" disabled={!customBaseDraft.capsuleImage } onClick={() => applyCustomBase(true) }>{L.savePreset}</button></div></div></div> }
      {avatarPickerSlot && <div className="preset-picker-backdrop" onMouseDown={() => setAvatarPickerSlot(null) }><div className="preset-picker-panel avatar-preset-panel" onMouseDown={(event) => event.stopPropagation() }><div className="preset-picker-head"><div><h3>{L.avatarTitle}</h3><p>{L.avatarHelp}</p></div><div className="base-preset-head-actions"><button onClick={saveCurrentAvatarPreset} disabled={!activeAvatarRole?.avatar}><Save size={18 } /><span>{L.savePreset}</span></button><button onClick={openAvatarCrop} disabled={!activeAvatarRole?.avatar}><Scissors size={18 } /><span>{L.crop}</span></button><button className={avatarPresetDeleteMode ? 'active danger' : '' } title={L.deleteUserPreset} onClick={() => setAvatarPresetDeleteMode((value) => !value) }><X size={19 } /></button></div></div><div className="preset-picker-grid avatar-preset-grid"><button className="preset-tile add-tile" onClick={() => avatarInputRefs.current[avatarPickerSlot]?.click() }><span>+</span><strong>{L.importAvatar}</strong></button>{combinedAvatarPresets.map((preset) => { const userPreset = 'user' in preset && preset.user === true; return <button key={`${preset.name }-${preset.src }` } className={`preset-tile avatar-preset-tile ${avatarPresetDeleteMode ? userPreset ? 'delete-mode' : 'locked-preset' : '' }` } onClick={() => applyAvatarPreset(avatarPickerSlot, preset) }><img src={preset.src } alt="" /><strong>{localizeCharacterName(preset.name, language) }</strong>{avatarPresetDeleteMode && userPreset && <span className="preset-delete-x" aria-hidden="true">?</span>}</button>;  }) }</div></div></div> }
      {teamPresetOpen && <div className="preset-picker-backdrop" onMouseDown={() => setTeamPresetOpen(false) }><div className="preset-picker-panel team-preset-panel" onMouseDown={(event) => event.stopPropagation() }><div className="preset-picker-head"><div><h3>{L.teamPresets}</h3><p>{L.teamPresetsHelp}</p></div><div className="base-preset-head-actions"><button className={teamPresetDeleteMode ? 'active danger' : '' } title={L.deleteUserPreset} disabled={!teamPresets.length } onClick={() => setTeamPresetDeleteMode((value) => !value) }><X size={19 } /></button></div></div><div className="preset-picker-grid team-preset-grid"><button className="preset-tile add-tile team-preset-tile" onClick={openTeamSelection }><span>+</span><strong>{L.addTeam}</strong></button>{teamPresets.map((preset) => { const avatars = preset.characters.map((name) => avatarPresetByName(name)); const unavailable = avatars.some((avatar) => !avatar); const localizedNames = preset.characters.map((name) => localizeCharacterName(name, language)); return <button key={preset.id } className={`preset-tile team-preset-tile ${teamPresetDeleteMode ? 'delete-mode' : '' } ${unavailable ? 'locked-preset' : '' }` } disabled={unavailable && !teamPresetDeleteMode } title={localizedNames.join(' / ') } onClick={() => applyTeamPreset(preset) }><span className="team-preset-avatars">{preset.characters.map((name, index) => <span key={`${name }-${index }` } style={avatarBackgroundStyle(avatars[index]?.src) }>{avatars[index]?.src ? null : index + 1 }<i>{index + 1}</i></span>) }</span><strong>{localizedNames.join(' / ') }</strong>{teamPresetDeleteMode && <span className="preset-delete-x" aria-hidden="true">?</span>}</button>;  }) }</div></div></div> }
      {teamSelectionOpen && <div className="preset-picker-backdrop" onMouseDown={() => setTeamSelectionOpen(false) }><div className="preset-picker-panel avatar-preset-panel team-selection-panel" onMouseDown={(event) => event.stopPropagation() }><div className="preset-picker-head"><div><h3>{L.addTeam}</h3><p>{L.selectTeamHelp}</p></div><div className="base-preset-head-actions"><button onClick={saveTeamPreset} disabled={!teamSelection.length }><Save size={18 } /><span>{L.savePreset}{teamSelection.length ? ` ${teamSelection.length }/3` : ''}</span></button></div></div><div className="preset-picker-grid avatar-preset-grid team-character-grid">{teamCharacterPresets.map((preset) => { const selectionIndex = teamSelection.indexOf(normalizeCharacterName(preset.name)); const selected = selectionIndex >= 0; return <button key={`${preset.name }-${preset.src }` } className={`preset-tile avatar-preset-tile team-character-tile ${selected ? 'selected' : '' }` } onClick={() => toggleTeamCharacter(preset) }><img src={preset.src } alt="" /><strong>{localizeCharacterName(preset.name, language) }</strong>{selected && <span className="team-selection-order">{selectionIndex + 1}</span>}</button>;  }) }</div></div></div> }
      {avatarCropOpen && avatarPickerSlot && activeAvatarRole?.avatar && <div className="preset-picker-backdrop custom-base-editor-backdrop" onMouseDown={() => setAvatarCropOpen(false) }><div className="crop-dialog-panel square-crop-dialog" onMouseDown={(event) => event.stopPropagation() }><div className="preset-picker-head"><div><h3>{L.avatarCrop}</h3><p>{L.avatarCropHelp}</p></div><button onClick={() => setAvatarCropOpen(false) }>?</button></div><AvatarCropEditor src={activeAvatarRole.avatar } crop={normalizeRectPercent(activeAvatarRole.avatarCrop, { x: 0, y: 0, w: 100, h: 100  }) } onChange={(crop) => onRoleChange(avatarPickerSlot, { avatarCrop: crop  }) } /><div className="custom-base-editor-actions"><button className="primary" onClick={() => setAvatarCropOpen(false) }>{L.apply}</button></div></div></div> }
    </div>
  );
 }
function BanIcon() {
  return <span className="ban-icon" aria-hidden="true"><i /></span>;
}

function BasePresetPreview({ preset  }: { preset: DefaultBasePresetEntry  }) {
  const { text } = useI18n();
  const crop = normalizeRectPercent(preset.crop, { x: 0, y: 0, w: 100, h: 100  });
  const previewWidth = Math.max(0.001, crop.w / 2);
  const previewHeight = Math.max(0.001, crop.h);
  const naturalWidth = Math.max(1, preset.imageWidth ?? 1);
  const naturalHeight = Math.max(1, preset.imageHeight ?? 1);
  const backgroundPositionX = crop.x / Math.max(0.001, 100 - previewWidth) * 100;
  const backgroundPositionY = crop.y / Math.max(0.001, 100 - previewHeight) * 100;
  const previewAspect = naturalWidth * previewWidth / (naturalHeight * previewHeight);
  const previewStyle = {
    width: `${Math.min(170, 86 * previewAspect) }px`,
    aspectRatio: `${naturalWidth * previewWidth } / ${naturalHeight * previewHeight }`,
    backgroundImage: `url(${preset.src })`,
    backgroundSize: `${10000 / previewWidth }% ${10000 / previewHeight }%`,
    backgroundPosition: `${backgroundPositionX }% ${backgroundPositionY }%`
   } as CSSProperties;
  return <span className="base-preset-preview" role="img" aria-label={text(`${preset.name }底图预览`, `${preset.name } background preview`) } style={previewStyle } />;
 }

function AvatarCropEditor({ src, crop, onChange  }: { src: string; crop: ComboImageStyle['roleStyles'][CharacterSlot]['avatarCrop']; onChange: (crop: NonNullable<ComboImageStyle['roleStyles'][CharacterSlot]['avatarCrop']>) => void  }) {
  const { text } = useI18n();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const safeCrop = normalizeRectPercent(crop, { x: 0, y: 0, w: 100, h: 100  });
  function stagePoint(event: PointerEvent | ReactPointerEvent<HTMLElement>) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0  };
    return { x: clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * 100, 0, 100), y: clamp(((event.clientY - rect.top) / Math.max(1, rect.height)) * 100, 0, 100)  };
  }
  function beginCropDrag(event: ReactPointerEvent<HTMLElement>, mode: 'move' | 'nw' | 'se') {
    event.preventDefault();
    event.stopPropagation();
    const start = stagePoint(event);
    const original = { ...safeCrop  };
    const onMove = (moveEvent: PointerEvent) => {
      const point = stagePoint(moveEvent);
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      if (mode === 'move') onChange(normalizeRectPercent({ ...original, x: original.x + dx, y: original.y + dy  }, original));
      if (mode === 'nw') {
        const x = clamp(original.x + dx, 0, original.x + original.w - 5);
        const y = clamp(original.y + dy, 0, original.y + original.h - 5);
        onChange(normalizeRectPercent({ x, y, w: original.x + original.w - x, h: original.y + original.h - y  }, original));
      }
      if (mode === 'se') onChange(normalizeRectPercent({ ...original, w: original.w + dx, h: original.h + dy  }, original));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  return (
    <div className="capsule-visual-editor avatar-crop-editor">
      <div ref={stageRef } className="capsule-visual-stage avatar-crop-stage">
        <div className="capsule-visual-image" style={{ backgroundImage: `url(${src })`  } } />
        <div className="capsule-crop-box" style={{ left: `${safeCrop.x }%`, top: `${safeCrop.y }%`, width: `${safeCrop.w }%`, height: `${safeCrop.h }%`  } } onPointerDown={(event) => beginCropDrag(event, 'move') }>
          <span className="capsule-crop-handle nw" onPointerDown={(event) => beginCropDrag(event, 'nw') } />
          <span className="capsule-crop-handle se" onPointerDown={(event) => beginCropDrag(event, 'se') } />
        </div>
      </div>
      <div className="crop-dialog-actions">
        <NumberDraftInput label={text('裁剪 X%', 'Crop X%') } value={Math.round(safeCrop.x) } onCommit={(value) => onChange({ ...safeCrop, x: value  }) } />
        <NumberDraftInput label={text('裁剪 Y%', 'Crop Y%') } value={Math.round(safeCrop.y) } onCommit={(value) => onChange({ ...safeCrop, y: value  }) } />
        <NumberDraftInput label={text('裁剪 W%', 'Crop W%') } value={Math.round(safeCrop.w) } onCommit={(value) => onChange({ ...safeCrop, w: value  }) } />
        <NumberDraftInput label={text('裁剪 H%', 'Crop H%') } value={Math.round(safeCrop.h) } onCommit={(value) => onChange({ ...safeCrop, h: value  }) } />
      </div>
    </div>
  );
}

function CapsuleImageVisualEditor({ style, onChange  }: { style: ComboImageStyle; onChange: (patch: Partial<ComboImageStyle>) => void  }) {
  const { text } = useI18n();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const crop = normalizeRectPercent(style.capsuleCrop, { x: 0, y: 0, w: 100, h: 100  });
  const stretch = style.capsuleStretch ?? { left: 25, right: 75  };
  const edge = style.capsuleEdge ?? 0;
  const edgeHeight = Math.min(100, crop.h + edge);
  const edgeTop = clamp(crop.y - (edgeHeight - crop.h) / 2, 0, 100 - edgeHeight);
  const naturalWidth = Math.max(1, style.capsuleImageWidth || style.capsuleWidth || 200);
  const naturalHeight = Math.max(1, style.capsuleImageHeight || style.capsuleHeight || 80);
  const stageStyle = { aspectRatio: `${naturalWidth } / ${naturalHeight }`  } as CSSProperties;
  const imageStyle = style.capsuleImage ? { backgroundImage: `url(${style.capsuleImage })`  } : { };
  function stagePoint(event: PointerEvent | ReactPointerEvent<HTMLElement>) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0  };
    return { x: clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * 100, 0, 100), y: clamp(((event.clientY - rect.top) / Math.max(1, rect.height)) * 100, 0, 100)  };
   }
  function beginCropDrag(event: ReactPointerEvent<HTMLElement>, mode: 'move' | 'nw' | 'se') {
    event.preventDefault();
    event.stopPropagation();
    const start = stagePoint(event);
    const original = { ...crop  };
    const onMove = (moveEvent: PointerEvent) => {
      const point = stagePoint(moveEvent);
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      if (mode === 'move') onChange({ capsuleCrop: normalizeRectPercent({ ...original, x: original.x + dx, y: original.y + dy  }, original)  });
      if (mode === 'nw') {
        const x = clamp(original.x + dx, 0, original.x + original.w - 5);
        const y = clamp(original.y + dy, 0, original.y + original.h - 5);
        onChange({ capsuleCrop: normalizeRectPercent({ x, y, w: original.x + original.w - x, h: original.y + original.h - y  }, original)  });
       }
      if (mode === 'se') onChange({ capsuleCrop: normalizeRectPercent({ ...original, w: original.w + dx, h: original.h + dy  }, original)  });
     };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
     };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
   }
  function beginStretchDrag(event: ReactPointerEvent<HTMLElement>, side: 'left' | 'right') {
    event.preventDefault();
    event.stopPropagation();
    const onMove = (moveEvent: PointerEvent) => {
      const point = stagePoint(moveEvent);
      if (side === 'left') onChange({ capsuleStretch: { left: clamp(point.x, crop.x, Math.min(stretch.right - 1, crop.x + crop.w - 1)), right: stretch.right  }  });
      if (side === 'right') onChange({ capsuleStretch: { left: stretch.left, right: clamp(point.x, Math.max(stretch.left + 1, crop.x + 1), crop.x + crop.w)  }  });
     };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
     };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
   }
  return (
    <div className="capsule-visual-editor">
      <p>{text('拖动裁剪框选择底图范围；拖动两条蓝色竖线选择跟随内容时可拉伸的中段，两端保持固定。', 'Drag the crop frame to select the background area. Drag the two blue lines to define the stretchable center while keeping both ends fixed.') }</p>
      <div ref={stageRef } className="capsule-visual-stage" style={stageStyle }>
        {style.capsuleImage && <div className="capsule-visual-image" style={imageStyle } /> }
        {edge > 0 && <span className="capsule-edge-preview" style={{ left: `${crop.x }%`, top: `${edgeTop }%`, width: `${crop.w }%`, height: `${edgeHeight }%`  } } /> }
        <div className="capsule-crop-box" style={{ left: `${crop.x }%`, top: `${crop.y }%`, width: `${crop.w }%`, height: `${crop.h }%`  } } onPointerDown={(event) => beginCropDrag(event, 'move') }>
          <span className="capsule-crop-handle nw" onPointerDown={(event) => beginCropDrag(event, 'nw') } />
          <span className="capsule-crop-handle se" onPointerDown={(event) => beginCropDrag(event, 'se') } />
        </div>
        <span className="capsule-stretch-line left" style={{ left: `${stretch.left }%`  } } onPointerDown={(event) => beginStretchDrag(event, 'left') } />
        <span className="capsule-stretch-line right" style={{ left: `${stretch.right }%`  } } onPointerDown={(event) => beginStretchDrag(event, 'right') } />
      </div>
      <div className="crop-dialog-actions">
        <NumberDraftInput label={text('裁剪 X%', 'Crop X%') } value={Math.round(crop.x) } onCommit={(value) => onChange({ capsuleCrop: { ...crop, x: value  }  }) } />
        <NumberDraftInput label={text('裁剪 Y%', 'Crop Y%') } value={Math.round(crop.y) } onCommit={(value) => onChange({ capsuleCrop: { ...crop, y: value  }  }) } />
        <NumberDraftInput label={text('裁剪 W%', 'Crop W%') } value={Math.round(crop.w) } onCommit={(value) => onChange({ capsuleCrop: { ...crop, w: value  }  }) } />
        <NumberDraftInput label={text('裁剪 H%', 'Crop H%') } value={Math.round(crop.h) } onCommit={(value) => onChange({ capsuleCrop: { ...crop, h: value  }  }) } />
        <NumberDraftInput label={text('边缘%', 'Edge Height %') } value={Math.round(edge) } onCommit={(value) => onChange({ capsuleEdge: value  }) } />
        <NumberDraftInput label={text('左线%', 'Left Stretch Guide %') } value={Math.round(stretch.left) } onCommit={(value) => onChange({ capsuleStretch: { ...stretch, left: value  }  }) } />
        <NumberDraftInput label={text('右线%', 'Right Stretch Guide %') } value={Math.round(stretch.right) } onCommit={(value) => onChange({ capsuleStretch: { ...stretch, right: value  }  }) } />
      </div>
    </div>
  );
 }

function SettingsPanel({ view, helpTab, moves, bindings, gamepadBindings, inputMode, gamepadIconSet, keyboardIconMode, shortcutSettings, appearanceMode, live2dEnabled, exportDirectory, recordingIndicatorEnabled, recordingIndicatorCorner, canChooseExportDirectory, onViewChange, onHelpTabChange, onInputModeChange, onGamepadIconSetChange, onKeyboardIconModeChange, onShortcutSettingsChange, onAppearanceModeChange, onLive2dEnabledChange, onChooseExportDirectory, onExportInputSettings, onImportInputSettings, onRecordingIndicatorEnabledChange, onRecordingIndicatorCornerChange, onMoveChange, onBindingChange, onGamepadBindingChange  }: {
  view: SettingsView;
  helpTab: HelpTab;
  moves: MoveDefinition[];
  bindings: KeyBinding[];
  gamepadBindings: KeyBinding[];
  inputMode: InputMode;
  gamepadIconSet: GamepadIconSet;
  keyboardIconMode: KeyboardIconMode;
  shortcutSettings: ShortcutSettings;
  appearanceMode: AppearanceMode;
  live2dEnabled: boolean;
  exportDirectory: string;
  recordingIndicatorEnabled: boolean;
  recordingIndicatorCorner: RecordingIndicatorCorner;
  canChooseExportDirectory: boolean;
  onViewChange: (value: SettingsView) => void;
  onHelpTabChange: (value: HelpTab) => void;
  onInputModeChange: (value: InputMode) => void;
  onGamepadIconSetChange: (value: GamepadIconSet) => void;
  onKeyboardIconModeChange: (value: KeyboardIconMode) => void;
  onShortcutSettingsChange: (value: ShortcutSettings) => void;
  onAppearanceModeChange: (value: AppearanceMode) => void;
  onLive2dEnabledChange: (value: boolean) => void;
  onChooseExportDirectory: () => void;
  onExportInputSettings: () => void;
  onImportInputSettings: (file: File | null) => void;
  onRecordingIndicatorEnabledChange: (value: boolean) => void;
  onRecordingIndicatorCornerChange: (value: RecordingIndicatorCorner) => void;
  onMoveChange: (moveId: string, patch: Partial<MoveDefinition>) => void;
  onBindingChange: (moveId: string, value: string) => void;
  onGamepadBindingChange: (moveId: string, value: string) => void;
}) {
  const { language, setLanguage, text  } = useI18n();
  const [capture, setCapture] = useState<{ mode: InputMode; moveId: string; slot: 0 | 1  } | null>(null);
  const [bindingDrafts, setBindingDrafts] = useState<Record<string, string>>({ });
  const inputSettingsImportRef = useRef<HTMLInputElement | null>(null);
  const activeBindings = inputMode === 'gamepad' ? gamepadBindings : bindings;

  function draftKey(mode: InputMode, moveId: string, slot: 0 | 1) {
    return `${mode }:${moveId }:${slot }`;
   }

  function setBindingSlot(mode: InputMode, moveId: string, slot: 0 | 1, value: string) {
    const source = mode === 'gamepad' ? gamepadBindings : bindings;
    const binding = source.find((item) => item.moveId === moveId);
    const codes = [binding?.inputs[0]?.code ?? '', binding?.inputs[1]?.code ?? ''];
    codes[slot] = value;
    const seen = new Set<string>();
    const normalized = codes.map(normalizeInputCode).filter((code) => {
      if (!code || seen.has(code)) return false;
      seen.add(code);
      return true;
     });
    (mode === 'gamepad' ? onGamepadBindingChange : onBindingChange)(moveId, normalized.join(', '));
   }

  useEffect(() => {
    const next: Record<string, string> = { };
    for (const move of moves) {
      for (const mode of ['keyboard', 'gamepad'] as const) {
        const source = mode === 'gamepad' ? gamepadBindings : bindings;
        const binding = source.find((item) => item.moveId === move.id);
        next[draftKey(mode, move.id, 0)] = binding?.inputs[0]?.code ?? '';
        next[draftKey(mode, move.id, 1)] = binding?.inputs[1]?.code ?? '';
       }
     }
    setBindingDrafts(next);
   }, [bindings, gamepadBindings, moves]);

  useEffect(() => {
    if (!capture || capture.mode !== 'keyboard') return;
    const finishCapture = (code: string) => {
      setBindingSlot('keyboard', capture.moveId, capture.slot, code);
      setCapture(null);
     };
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Backspace' || event.code === 'Escape') {
        setCapture(null);
        return;
       }
      finishCapture(event.code);
     };
    const handleMouseDown = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      finishCapture(normalizeDomMouseEvent(event, 'mousedown').code);
     };
    const preventContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
     };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('contextmenu', preventContextMenu, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('contextmenu', preventContextMenu, true);
     };
   }, [capture]);

  useEffect(() => {
    if (!capture || capture.mode !== 'gamepad') return;
    let frame = 0;
    let previous = readPressedGamepadCodes();
    let modifierPressedAt: number | null = null;
    const finishCapture = (code: string) => {
      setBindingSlot('gamepad', capture.moveId, capture.slot, code);
      setCapture(null);
     };
    const tick = () => {
      const current = readPressedGamepadCodes();
      const newlyPressed = [...current].filter((code) => !previous.has(code));
      const modifierJustPressed = newlyPressed.includes(GAMEPAD_COMBO_MODIFIER);
      const primary = newlyPressed.find((code) => code !== GAMEPAD_COMBO_MODIFIER)
        ?? (modifierJustPressed ? [...current].find((code) => code !== GAMEPAD_COMBO_MODIFIER) : undefined);
      if (primary) {
        const captured = current.has(GAMEPAD_COMBO_MODIFIER) ? `${GAMEPAD_COMBO_MODIFIER }+${primary }` : primary;
        finishCapture(captured);
        return;
       }
      if (modifierJustPressed) modifierPressedAt = performance.now();
      if (!current.has(GAMEPAD_COMBO_MODIFIER)) modifierPressedAt = null;
      if (modifierPressedAt !== null && current.size === 1 && performance.now() - modifierPressedAt >= 280) {
        finishCapture(GAMEPAD_COMBO_MODIFIER);
        return;
       }
      previous = current;
      frame = requestAnimationFrame(tick);
     };
    frame = requestAnimationFrame(tick);
    const cancel = (event: KeyboardEvent) => {
      if (event.code !== 'Backspace' && event.code !== 'Escape') return;
      event.preventDefault();
      setCapture(null);
     };
    window.addEventListener('keydown', cancel, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', cancel, true);
    };
   }, [capture]);

  useEffect(() => {
    if (view !== 'settings') setCapture(null);
   }, [view]);

  return (
    <section className="panel settings-panel">
      <div className="segmented settings-view-tabs" role="tablist" aria-label={`${HELP_CONTENT[language].settingsTab } / ${text('快捷键设置', 'Shortcut Settings') } / ${HELP_CONTENT[language].helpTab }` }>
        <button className={view === 'settings' ? 'active' : '' } type="button" role="tab" aria-selected={view === 'settings' } onClick={() => onViewChange('settings') }><Settings size={16 } />{HELP_CONTENT[language].settingsTab}</button>
        <button className={view === 'shortcuts' ? 'active' : '' } type="button" role="tab" aria-selected={view === 'shortcuts' } onClick={() => onViewChange('shortcuts') }><Keyboard size={16 } />{text('快捷键设置', 'Shortcut Settings') }</button>
        <button className={view === 'help' ? 'active' : '' } type="button" role="tab" aria-selected={view === 'help' } onClick={() => onViewChange('help') }><BookOpen size={16 } />{HELP_CONTENT[language].helpTab}</button>
      </div>
      {view === 'settings' ? <>
      <div className="panel-title"><div><h2>{text('设置', 'Settings') }</h2><p>{text('管理语言、导出位置以及键鼠和手柄的招式绑定。', 'Manage language, export location, and keyboard, mouse, or gamepad bindings.') }</p></div><div className="settings-title-actions"><button type="button" title={text('导入按键设置文件', 'Import a .wwkeys.json input settings file') } onClick={() => inputSettingsImportRef.current?.click() }><Upload size={17 } />{text('导入按键设置', 'Import Input Settings') }</button><button type="button" title={text('导出用户的键鼠和手柄绑定', 'Export keyboard, mouse, and gamepad bindings') } onClick={onExportInputSettings }><Download size={17 } />{text('导出按键设置', 'Export Input Settings') }</button><Settings size={22 } /></div></div>
      <input ref={inputSettingsImportRef } className="file-input" type="file" accept=".wwkeys.json,application/json,.json" onChange={(event) => { const file = event.target.files?.[0] ?? null; event.currentTarget.value = ''; onImportInputSettings(file);  } } />
      <div className="settings-preference-row settings-language">
        <span>{text('语言', 'Language') }</span>
        <div className="segmented" role="group" aria-label={text('语言', 'Language') }>
          <button className={language === 'zh-CN' ? 'active' : '' } type="button" onClick={() => setLanguage('zh-CN') }>中文</button>
          <button className={language === 'en-US' ? 'active' : '' } type="button" onClick={() => setLanguage('en-US') }>English</button>
          <button className={language === 'ja-JP' ? 'active' : '' } type="button" onClick={() => setLanguage('ja-JP') }>日本語</button>
          <button className={language === 'ko-KR' ? 'active' : '' } type="button" onClick={() => setLanguage('ko-KR') }>한국어</button>
        </div>
      </div>
      <div className="settings-preference-row settings-appearance-mode">
        <span className="settings-preference-label">{appearanceMode === 'night' ? <Moon size={18 } /> : <Sun size={18 } /> }{text('\u663e\u793a\u6a21\u5f0f', 'Display Mode') }</span>
        <div className="segmented settings-theme-options" role="group" aria-label={text('\u663e\u793a\u6a21\u5f0f', 'Display Mode') }>
          <button className={appearanceMode === 'night' ? 'active' : '' } type="button" onClick={() => onAppearanceModeChange('night') }><Moon size={16 } />{text('黎那汐塔', 'Rinascita') }</button>
          <button className={appearanceMode === 'day' ? 'active' : '' } type="button" onClick={() => onAppearanceModeChange('day') }><Sun size={16 } />{text('瑝珑', 'Huanglong') }</button>
          <button className={appearanceMode === 'night2' ? 'active' : '' } type="button" onClick={() => onAppearanceModeChange('night2') }><Moon size={16 } />{text('群星', 'Stars') }</button>
        </div>
      </div>
      <div className="settings-preference-row settings-live2d">
        <span className="settings-preference-label">Live2D</span>
        <label className="checkline"><input type="checkbox" checked={live2dEnabled } onChange={(event) => onLive2dEnabledChange(event.target.checked) } />{text('启用 Live2D', 'Enable Live2D') }</label>
      </div>
      <div className="settings-preference-row settings-recording-indicator">
        <span className="settings-preference-label"><span className="settings-recording-dot-preview" />{text('录制提示点', 'Recording Indicator') }</span>
        <div className="settings-recording-indicator-controls">
          <label className="checkline"><input type="checkbox" checked={recordingIndicatorEnabled } onChange={(event) => onRecordingIndicatorEnabledChange(event.target.checked) } />{text('显示', 'Show') }</label>
          <div className="segmented" role="group" aria-label={text('提示点位置', 'Indicator Position') }>
            <button className={recordingIndicatorCorner === 'top-left' ? 'active' : '' } type="button" disabled={!recordingIndicatorEnabled } onClick={() => onRecordingIndicatorCornerChange('top-left') }>{text('左上', 'Top Left') }</button>
            <button className={recordingIndicatorCorner === 'top-right' ? 'active' : '' } type="button" disabled={!recordingIndicatorEnabled } onClick={() => onRecordingIndicatorCornerChange('top-right') }>{text('右上', 'Top Right') }</button>
            <button className={recordingIndicatorCorner === 'bottom-left' ? 'active' : '' } type="button" disabled={!recordingIndicatorEnabled } onClick={() => onRecordingIndicatorCornerChange('bottom-left') }>{text('左下', 'Bottom Left') }</button>
            <button className={recordingIndicatorCorner === 'bottom-right' ? 'active' : '' } type="button" disabled={!recordingIndicatorEnabled } onClick={() => onRecordingIndicatorCornerChange('bottom-right') }>{text('右下', 'Bottom Right') }</button>
          </div>
        </div>
      </div>
      <div className="settings-export-path">
        <label>
          <span>{text('导出文件夹', 'Export Folder') }</span>
          <input value={exportDirectory } readOnly placeholder={text('首次导出前必须选择文件夹', 'A folder must be selected before the first export.') } />
        </label>
        <button type="button" disabled={!canChooseExportDirectory } title={canChooseExportDirectory ? text('通过文件资源管理器选择导出文件夹', 'Select an export folder in File Explorer') : text('文件夹选择仅在桌面版中可用。', 'Folder selection is available in the desktop app.')} onClick={onChooseExportDirectory }><FolderOpen size={16 } />{text('选择文件夹', 'Select Folder') }</button>
      </div>
      <div className="settings-input-mode">
        <span>{text('输入模式', 'Input Mode') }</span>
        <div className="settings-input-mode-controls">
          <div className="segmented"><button className={inputMode === 'keyboard' ? 'active' : '' } type="button" onClick={() => { setCapture(null); onInputModeChange('keyboard');  } }><Keyboard size={16 } />{text('键鼠', 'Keyboard & Mouse') }</button><button className={inputMode === 'gamepad' ? 'active' : '' } type="button" onClick={() => { setCapture(null); onInputModeChange('gamepad');  } }><Gamepad2 size={16 } />{text('手柄', 'Gamepad') }</button></div>
          {inputMode === 'keyboard' && <div className="settings-input-icon-set settings-keyboard-icon-set"><span>{text('键鼠图标', 'Keyboard & Mouse Icons') }</span><div className="segmented" role="group" aria-label={text('键鼠图标', 'Keyboard & Mouse Icons') }><button className={keyboardIconMode === 'default' ? 'active' : '' } type="button" onClick={() => onKeyboardIconModeChange('default') }>{text('默认', 'Default') }</button><button className={keyboardIconMode === 'actual' ? 'active' : '' } type="button" onClick={() => onKeyboardIconModeChange('actual') }>{text('实际', 'Actual') }</button></div></div> }
          {inputMode === 'gamepad' && <div className="settings-input-icon-set settings-gamepad-icon-set"><span>{text('手柄图标', 'Controller Icons') }</span><div className="segmented" role="group" aria-label={text('手柄图标', 'Controller Icons') }><button className={gamepadIconSet === 'xbox' ? 'active' : '' } type="button" onClick={() => onGamepadIconSetChange('xbox') }>Xbox</button><button className={gamepadIconSet === 'playstation' ? 'active' : '' } type="button" onClick={() => onGamepadIconSetChange('playstation') }>PlayStation</button></div></div> }
        </div>
      </div>
      <div className="settings-table">
        <div className="settings-head"><span>{text('招式', 'Action') }</span><span>{text('按键 1', 'Binding 1') }</span><span>{text('按键 2', 'Binding 2') }</span><span>{text('独立', 'Independent') }</span><span>{text('推进', 'Advances Practice Step') }</span></div>
        {moves.filter((move) => !move.displayOnly).map((move) => {
          const binding = activeBindings.find((item) => item.moveId === move.id);
          const rowCapturing = capture?.mode === inputMode && capture.moveId === move.id;
          const englishMoveLabel = ENGLISH_MOVE_LABELS[move.id] ?? move.label;
          const moveLabel = localizedDefaultMoveLabel(move.id, move.label, language, false);
          return (
            <div className={`settings-row ${rowCapturing ? 'capturing' : '' }` } key={move.id }>
              <strong style={{ color: move.color  } }>{moveLabel}</strong>
              {([0, 1] as const).map((slot) => {
                const isCapturing = capture?.mode === inputMode && capture.moveId === move.id && capture.slot === slot;
                const key = draftKey(inputMode, move.id, slot);
                const inputLabel = text(`${move.label } 按键 ${slot + 1 }`, `${moveLabel } Binding ${slot + 1 }`);
                const captureLabel = isCapturing
                  ? text(`取消捕获${move.label }按键 ${slot + 1 }`, `Cancel ${moveLabel } Binding ${slot + 1 } Capture`)
                  : text(`捕获${move.label }按键 ${slot + 1 }`, `Capture ${moveLabel } Binding ${slot + 1 }`);
                const capturePrompt = inputMode === 'gamepad'
                  ? text('按下手柄按钮', 'Press a gamepad button')
                  : text('按下键盘或鼠标键', 'Press a key or mouse button');
                const displayCode = bindingDrafts[key] ?? binding?.inputs[slot]?.code ?? '';
                const bindingPreview = !isCapturing
                  ? inputMode === 'gamepad'
                    ? { src: gamepadIconSource(displayCode, gamepadIconSet), label: gamepadCodeLabel(displayCode, gamepadIconSet) }
                    : keyboardIconMode === 'actual'
                      ? { src: keyboardMouseIconSource(displayCode), label: keyboardMouseCodeLabel(displayCode) }
                      : null
                  : null;
                return <div className={`settings-binding-slot ${bindingPreview?.src ? 'has-input-preview' : '' }` } key={slot }>{bindingPreview?.src && <span className={`settings-input-binding-preview ${inputMode === 'keyboard' && keyboardIconMode === 'actual' ? 'actual-keyboard' : ''}` } title={bindingPreview.label }><img src={bindingPreview.src } alt={bindingPreview.label } /></span> }<input aria-label={inputLabel } value={isCapturing ? capturePrompt : displayCode } readOnly={isCapturing } placeholder={text('未绑定', 'Unbound') } onChange={(event) => setBindingDrafts((current) => ({ ...current, [key]: event.target.value  })) } onBlur={() => { if (!isCapturing) setBindingSlot(inputMode, move.id, slot, bindingDrafts[key] ?? '');  } } onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setBindingDrafts((current) => ({ ...current, [key]: binding?.inputs[slot]?.code ?? ''  })); event.currentTarget.blur();  }  } } /><button className={`binding-capture-button icon-button ${isCapturing ? 'active' : '' }` } type="button" title={captureLabel } aria-label={captureLabel } onClick={() => setCapture(isCapturing ? null : { mode: inputMode, moveId: move.id, slot  }) }>{inputMode === 'gamepad' ? <Gamepad2 size={16 } /> : <Target size={16 } />}</button></div>;
               }) }
              <label><input type="checkbox" checked={move.independent } disabled={move.id === 'basic_attack' } onChange={(event) => onMoveChange(move.id, { independent: event.target.checked  }) } />{text('独立', 'Independent') }</label>
              <label><input type="checkbox" checked={move.advancesStep } onChange={(event) => onMoveChange(move.id, { advancesStep: event.target.checked  }) } />{text('推进', 'Advances Practice Step') }</label>
            </div>
          );
         }) }
      </div>
      </> : view === 'shortcuts' ? <ShortcutSettingsPanel settings={shortcutSettings } onChange={onShortcutSettingsChange } /> : <HelpPanel tab={helpTab } onTabChange={onHelpTabChange } /> }
    </section>
  );
 }

function ShortcutSettingsPanel({ settings, onChange  }: { settings: ShortcutSettings; onChange: (value: ShortcutSettings) => void  }) {
  const { text  } = useI18n();
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);
  const [feedback, setFeedback] = useState('');
  const groups = [
    { id: 'timeline' as const, chinese: '时间轴工具', english: 'Timeline Tools'  },
    { id: 'placement' as const, chinese: '添加模式招式', english: 'Add Mode Actions'  },
    { id: 'video' as const, chinese: '视频辅助', english: 'Video Tools'  }
  ];

  useEffect(() => {
    if (!capturing) return;
    const captureShortcut = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      const chord = shortcutChordFromKeyboardEvent(event);
      if (!chord) {
        setFeedback(text('Ctrl 和 Alt 起手的组合键保持固定，不能在这里修改。', 'Shortcuts beginning with Ctrl or Alt remain fixed and cannot be changed here.'));
        return;
      }
      const conflict = SHORTCUT_DEFINITIONS.find((definition) => definition.id !== capturing && settings[definition.id] === chord);
      if (conflict) {
        setFeedback(text(`该按键已用于“${conflict.chinese }”。`, `This key is already used by "${conflict.english }".`));
        return;
      }
      onChange({ ...settings, [capturing]: chord  });
      setCapturing(null);
      setFeedback('');
     };
    const suppressKeyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
     };
    window.addEventListener('keydown', captureShortcut, true);
    window.addEventListener('keyup', suppressKeyUp, true);
    return () => {
      window.removeEventListener('keydown', captureShortcut, true);
      window.removeEventListener('keyup', suppressKeyUp, true);
     };
   }, [capturing, onChange, settings, text]);

  return <div className="shortcut-settings-panel">
    <div className="panel-title"><div><h2>{text('快捷键设置', 'Shortcut Settings') }</h2><p>{text('修改时间轴与视频工具的单键或 Shift 组合键。Ctrl 和 Alt 起手的编辑组合保持固定。', 'Customize single-key and Shift shortcuts for timeline and video tools. Editing combinations beginning with Ctrl or Alt remain fixed.') }</p></div><button type="button" onClick={() => { onChange({ ...DEFAULT_SHORTCUT_SETTINGS  }); setCapturing(null); setFeedback('');  }}><RotateCcw size={17 } />{text('恢复默认快捷键', 'Restore Default Shortcuts') }</button></div>
    {feedback && <div className="shortcut-settings-feedback" role="status">{feedback}</div>}
    <div className="shortcut-settings-groups">
      {groups.map((group) => <section className="shortcut-settings-group" key={group.id }>
        <h3>{text(group.chinese, group.english) }</h3>
        <div className="shortcut-settings-list">
          {SHORTCUT_DEFINITIONS.filter((definition) => definition.group === group.id).map((definition) => {
            const isCapturing = capturing === definition.id;
            return <div className="shortcut-settings-row" key={definition.id }><span>{text(definition.chinese, definition.english) }</span><button className={isCapturing ? 'shortcut-capture active' : 'shortcut-capture' } type="button" aria-label={text(`修改${definition.chinese }快捷键`, `Change ${definition.english } shortcut`) } onClick={(event) => { event.currentTarget.blur(); setCapturing(isCapturing ? null : definition.id); setFeedback('');  }}><kbd>{isCapturing ? text('请按键', 'Press a key') : shortcutDisplayLabel(settings[definition.id]) }</kbd></button></div>;
           }) }
        </div>
      </section>) }
    </div>
  </div>;
 }

function HelpPanel({ tab, onTabChange  }: { tab: HelpTab; onTabChange: (value: HelpTab) => void  }) {
  const { language  } = useI18n();
  const content = HELP_CONTENT[language];
  const article = content.articles[tab];
  const tabs: Array<{ value: HelpTab; label: string; icon: ReactNode  }> = [
    { value: 'learner', label: content.learnerTab, icon: <GraduationCap size={16 } />  },
    { value: 'author', label: content.authorTab, icon: <Pencil size={16 } />  },
    { value: 'reference', label: content.referenceTab, icon: <Keyboard size={16 } />  },
    { value: 'changelog', label: content.changelogTab, icon: <History size={16 } />  }
  ];
  const categorizedSections: Array<{ title: string; groups: HelpGuideGroup[]  }> | null = article.groups.every((group) => group.category)
    ? article.groups.reduce<Array<{ title: string; groups: HelpGuideGroup[]  }>>((sections, group) => {
      const title = group.category!;
      const existing = sections.find((section) => section.title === title);
      if (existing) existing.groups.push(group);
      else sections.push({ title, groups: [group]  });
      return sections;
     }, [])
    : null;

  function renderGroupBody(group: HelpGuideGroup, subsection = false) {
    return <div className={subsection ? 'help-guide-subsection-body' : 'help-guide-section-body'}>
      <div className="help-guide-section-title">{subsection ? <h5>{group.title}</h5> : <h4>{group.title}</h4>}{group.optional && <span className="help-guide-optional-tag">{content.optionalLabel}</span> }</div>
      {group.items.length > 0 && <ol>{group.items.map((item) => <li key={item }>{item}</li>) }</ol> }
      {group.shortcuts && <div className="help-guide-shortcuts">{group.shortcuts.map((shortcut) => <div className={`help-guide-shortcut-row ${shortcut.nested ? 'nested' : ''}` } key={`${shortcut.keys.join('+')}-${shortcut.action}` }><div className="help-guide-key-sequence">{shortcut.keys.map((key, keyIndex) => <span key={`${key}-${keyIndex}` }>{keyIndex > 0 && <i aria-hidden="true">+</i> }<kbd>{key}</kbd></span>) }</div><div><strong>{shortcut.action}</strong>{shortcut.note && <small>{shortcut.note}</small> }</div></div>) }</div> }
      {group.controls && <div className="help-guide-reference-table">{group.controls.map((control) => <div className={`help-guide-reference-row ${control.nested ? 'nested' : ''}` } key={control.name }><strong>{control.name}</strong><div><span>{control.effect}</span>{control.example && <small className="help-guide-example"><b>{content.exampleLabel}</b>{control.example}</small> }</div></div>) }</div> }
      {group.note && <p className="help-guide-note">{group.note}</p> }
    </div>;
  }

  return (
    <div className="help-guide">
      <div className="panel-title"><div><h2>{content.title}</h2><p>{content.description}</p></div><BookOpen size={22 } /></div>
      <div className="segmented help-guide-tabs" role="tablist" aria-label={content.title}>
        {tabs.map((item) => <button key={item.value } className={tab === item.value ? 'active' : '' } type="button" role="tab" aria-selected={tab === item.value } aria-controls="help-guide-article" onClick={() => onTabChange(item.value) }>{item.icon}{item.label}</button>) }
      </div>
      <article id="help-guide-article" className="help-guide-article" key={tab } role="tabpanel">
        <header className="help-guide-article-header"><h3>{article.title}</h3><p>{article.summary}</p></header>
        <div className="help-guide-sections">
          {categorizedSections ? categorizedSections.map((section, index) => <section className="help-guide-section help-guide-category-section" key={section.title }>
            <span className="help-guide-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <div className="help-guide-section-body">
              <div className="help-guide-category-title"><h4>{section.title}</h4></div>
              <div className="help-guide-category-subsections">{section.groups.map((group) => <div className="help-guide-subsection" key={group.title }>{renderGroupBody(group, true) }</div>) }</div>
            </div>
          </section>) : article.groups.map((group, index) => <section className={`help-guide-section ${group.optional ? 'optional' : '' }` } key={group.title }><span className="help-guide-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{renderGroupBody(group) }</section>) }
        </div>
      </article>
    </div>
  );
 }


function PracticeErrorSummary({ chart, practice  }: { chart: ComboChart; practice: PracticeSnapshot  }) {
  const { text  } = useI18n();
  const errorIds = new Set(practice.errorStepIds);
  if (!chart.steps.length || !practice.errorStepIds.length) return null;
  return (
    <div className="practice-error-summary">
      <strong>{text('错位记录', 'Timing Errors') }</strong>
      <div>{chart.steps.map((step, index) => <span key={step.id } className={errorIds.has(step.id) ? 'error' : ''  } style={{ '--move-color': step.color  } as CSSProperties }><b>{index + 1 }</b>{step.label }<em>{(step.startMin / 1000).toFixed(2) }s</em></span>) }</div>
    </div>
  );
 }
function LibraryPanel({ chart, library, style, avatarPresets, onSelect, onEdit, onDelete, onShare, onImport  }: { chart: ComboChart | null; library: ComboChart[]; style: ComboImageStyle; avatarPresets: DefaultAvatarEntry[]; onSelect: (id: string) => void; onEdit: (id: string) => void; onDelete: (id: string) => void; onShare: () => void; onImport: () => void  }) {
  const { language, text  } = useI18n();
  const [pendingDelete, setPendingDelete] = useState<ComboChart | null>(null);
  const presetAvatarByName = useMemo(() => new Map(avatarPresets.map((preset) => [preset.name.trim(), preset.src])), [avatarPresets]);

  function chartRoleAvatars(item: ComboChart) {
    const slots = Array.from(new Set(item.steps.map((step) => (step.characterSlot ?? 1) as CharacterSlot))).sort((left, right) => left - right);
    const assignments = chartCharacterAssignments(item);
    return slots.flatMap((slot) => {
      const role = style.roleStyles[slot];
      const name = assignments[slot] ?? role.name;
      const src = presetAvatarByName.get(normalizeCharacterName(name));
      return src ? [{ slot, name, src  }] : [];
    });
  }

  return (
    <div className="panel library-panel">
      <div className="panel-title library-panel-title"><div><h2>{text('连段列表', 'Combo Library') }</h2><p>{text('保存、导入和编辑后的连段谱会出现在这里。', 'Saved, imported, and edited combo charts appear here.') }</p></div><div className="library-title-actions"><button onClick={onImport}><Upload size={16 } />{text('导入', 'Import') }</button><button className="library-share-button" data-practice-input-block="true" onClick={onShare } disabled={!chart }><Share2 size={16 } />{text('分享', 'Share') }</button></div></div>
      <div className="library-list">{library.length ? library.map((item) => {
        const roleAvatars = chartRoleAvatars(item);
        return <div key={item.id } className={`library-item ${chart?.id === item.id ? 'active' : '' }`}><button className="library-item-main" onClick={() => onSelect(item.id) }><span className="library-item-title-row"><span className="library-role-avatars">{roleAvatars.map((role) => <span key={role.slot } className="library-role-avatar" title={role.name } style={avatarBackgroundStyle(role.src) } />)}</span><strong>{item.title }</strong></span><span>{item.steps.length } {text('指令', 'actions') } · {new Date(item.updatedAt).toLocaleString(language) }</span></button><div className="library-item-actions"><button className="icon-button" title={text('编辑连段', 'Edit combo') } aria-label={text(`编辑 ${item.title }`, `Edit ${item.title }`) } onClick={() => onEdit(item.id) }><Pencil size={16 } /></button><button className="icon-button danger" title={text('删除连段', 'Delete combo') } aria-label={text(`删除 ${item.title }`, `Delete ${item.title }`) } onClick={() => setPendingDelete(item) }><Trash2 size={16 } /></button></div></div>;
       }) : <EmptyState text={text('还没有连段谱。', 'No combo charts yet.') } /> }</div>
      {pendingDelete && <div className="library-confirm-backdrop" role="presentation" onMouseDown={() => setPendingDelete(null) }><div className="library-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="library-delete-title" onMouseDown={(event) => event.stopPropagation() }><Trash2 size={24 } /><h3 id="library-delete-title">{text('确认删除连段？', 'Delete this combo?') }</h3><p>{text(`“${pendingDelete.title }”删除后无法恢复。`, `“${pendingDelete.title }” cannot be recovered after deletion.`) }</p><div><button onClick={() => setPendingDelete(null) }>{text('取消', 'Cancel') }</button><button className="danger" onClick={() => { onDelete(pendingDelete.id); setPendingDelete(null);  } }>{text('确认删除', 'Delete') }</button></div></div></div> }
    </div>
  );
 }


function CommunityShareDialog({ draft, onChange, onExport, onClose  }: { draft: CommunityShareDraft; onChange: (draft: CommunityShareDraft) => void; onExport: () => void; onClose: () => void  }) {
  const { text  } = useI18n();
  const tagLabel = (tag: CommunityTag) => ({
    '\u8f6e\u6905': text('轮椅', 'Easy Loop'),
    '\u57fa\u7840': text('基础', 'Basic'),
    '\u6807\u51c6': text('标准', 'Standard'),
    '\u8fdb\u9636': text('进阶', 'Advanced'),
    '\u5192\u70df': text('冒烟', 'Extreme'),
    '\u9519\u8f6e': text('错轮', 'Staggered Rotation')
  })[tag];
  function patch(value: Partial<CommunityShareDraft>) {
    onChange({ ...draft, ...value  });
   }

  function toggleTag(tag: CommunityTag) {
    if (tag === '\u8f6e\u6905' && !draft.wheelchairEligible) return;
    patch({ tags: draft.tags.includes(tag) ? draft.tags.filter((item) => item !== tag) : [...draft.tags, tag]  });
   }

  return (
    <div className="community-share-backdrop" role="presentation" onMouseDown={onClose }>
      <div className="community-share-dialog" role="dialog" aria-modal="true" aria-labelledby="community-share-title" onMouseDown={(event) => event.stopPropagation() }>
        <div className="community-share-head"><div><h2 id="community-share-title">{text('分享连段', 'Share Combo') }</h2><p>{text('编辑社区检索信息并导出 JSON。', 'Add community metadata and export a JSON file.') }</p></div><button className="icon-button" type="button" title={text('关闭', 'Close') } onClick={onClose }><X size={18 } /></button></div>
        <div className="community-share-form">
          <label className="community-share-wide"><span>{text('名称', 'Name') }</span><input value={draft.name } maxLength={80 } onChange={(event) => patch({ name: event.target.value  }) } /></label>
          <div className="community-share-wide"><span className="community-share-label">{text('标签', 'Tags') }</span><div className="community-tag-list">{COMMUNITY_TAGS.map((tag) => {
            const disabled = tag === '\u8f6e\u6905' && !draft.wheelchairEligible;
            return <button key={tag } type="button" className={draft.tags.includes(tag) ? 'active' : '' } disabled={disabled } title={disabled ? text('需要存在循环轴，且所有循环轴内的切人操作总数不超过 3', 'Requires a loop axis with no more than three character switches') : tagLabel(tag) } onClick={() => toggleTag(tag) }>{tagLabel(tag) }</button>;
           }) }</div>{!draft.wheelchairEligible && <small>{text('“轮椅”需要存在循环轴，且循环轴内切人总数不超过 3。', '“Easy Loop” requires a loop axis with no more than three character switches.') }</small>}</div>
          <label className="community-share-wide"><span>{text('简介', 'Description') }</span><textarea value={draft.description } maxLength={800 } rows={4 } onChange={(event) => patch({ description: event.target.value  }) } /></label>
          <label className="community-share-wide"><span>{text('链接', 'Link') }</span><input type="url" value={draft.link } maxLength={500 } placeholder="https://" onChange={(event) => patch({ link: event.target.value  }) } /></label>
        </div>
        <div className="community-share-readonly">
          <div><span>{text('角色', 'Characters') }</span><strong>{draft.characters.join(' / ') || text('未设置', 'Not set') }</strong></div>
          <div><span>{text('轮数', 'Rounds') }</span><strong>{draft.rounds}</strong></div>
          <div className="community-share-id"><span>ID</span><strong>{draft.id}</strong></div>
        </div>
        <div className="community-share-actions"><button type="button" onClick={onClose }>{text('取消', 'Cancel') }</button><button className="library-share-button" type="button" disabled={!draft.name.trim() } onClick={onExport }><Share2 size={16 } />{text('导出分享 JSON', 'Export Share JSON') }</button></div>
      </div>
    </div>
  );
 }

function QuickInputDialog({ chart, style, initialValues, startStepId, onApply, onClose  }: { chart: ComboChart; style: ComboImageStyle; initialValues: string[]; startStepId: string | null; onApply: (values: string[]) => void; onClose: () => void  }) {
  const { text  } = useI18n();
  const items = chartToComboImageItems(chart, style);
  const startIndex = Math.max(0, items.findIndex((item) => item.step.id === startStepId));
  const initial = items.map((item, index) => initialValues[index] ?? style.contentLabels[item.step.id] ?? item.displayText);
  const [values, setValues] = useState(initial);
  const [bulkText, setBulkText] = useState(initialValues.length ? initialValues.join(' ') : '');
  const [position, setPosition] = useState({ x: 360, y: 160  });
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number  } | null>(null);
  function focusInput(index: number) {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('.quick-input-grid input'));
    inputs[Math.max(0, Math.min(index, inputs.length - 1))]?.focus();
   }
  function fillFromBulk() {
    const parsed = parseQuickInputText(bulkText).map((part) => maybeConvertTextToIconLabel(part, style.convertIcons));
    setValues((current) => current.map((value, index) => index >= startIndex && parsed[index - startIndex] !== undefined ? parsed[index - startIndex] : value));
   }
  function applyAndClose() {
    onApply(values.map((value) => maybeConvertTextToIconLabel(value, style.convertIcons)));
    onClose();
   }
  function beginDrag(event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault();
    dragRef.current = { startX: event.clientX, startY: event.clientY, x: position.x, y: position.y  };
    const onMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setPosition({ x: Math.max(8, drag.x + moveEvent.clientX - drag.startX), y: Math.max(8, drag.y + moveEvent.clientY - drag.startY)  });
     };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
     };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
   }
  return (
    <div className="quick-input-layer">
      <div className="quick-input-panel floating" style={{ left: position.x, top: position.y  } }>
        <div className="quick-input-head" onPointerDown={beginDrag }><strong>{text(`快捷输入 · 从第 ${startIndex + 1 } 块开始`, `Quick Input · Start at block ${startIndex + 1 }`) }</strong><div><button onPointerDown={(event) => event.stopPropagation() } onClick={fillFromBulk }>{text('填入', 'Fill') }</button><button onPointerDown={(event) => event.stopPropagation() } onClick={onClose }>{text('取消', 'Cancel') }</button><button onPointerDown={(event) => event.stopPropagation() } className="primary" onClick={applyAndClose }>{text('应用', 'Apply') }</button><button onPointerDown={(event) => event.stopPropagation() } onClick={onClose }>×</button></div></div>
        <textarea value={bulkText } onChange={(event) => setBulkText(event.target.value) } placeholder={style.convertIcons ? text('可粘贴大量内容，空格或换行分隔。开启图标转换时，e/E/q/Q/r/R/a/A/j/J 等会转成对应图标。', 'Paste multiple entries separated by spaces or line breaks. With icon conversion enabled, e/E/q/Q/r/R/a/A/j/J are converted to icons.') : text('可粘贴大量内容，空格或换行分隔。', 'Paste multiple entries separated by spaces or line breaks.') } />
        <div className="quick-input-grid">
          {items.map((item, index) => <label key={item.step.id } className={item.isSwitch ? 'is-switch' : '' }><span>{index + 1 }</span><input value={values[index] ?? '' } onKeyDown={(event) => { if (event.key === 'Enter' || event.key === 'ArrowRight') { event.preventDefault(); focusInput(index + 1);  } if (event.key === 'ArrowLeft') { event.preventDefault(); focusInput(index - 1);  }  } } onChange={(event) => setValues((current) => current.map((value, i) => i === index ? event.target.value : value)) } /></label>) }
        </div>
      </div>
    </div>
  );
 }
function NumberDraftInput({ label, value, onCommit, min = 0, max, integer = true, disabled  }: { label: string; value: number; onCommit: (value: number) => void; min?: number; max?: number; integer?: boolean; disabled?: boolean  }) {
  return <label>{label }<NumericDraftInput value={value } min={min } max={max } integer={integer } disabled={disabled } onCommit={onCommit } /></label>;
 }

function EmptyState({ text  }: { text: string  }) {
  return <div className="empty-state">{text }</div>;
 }

function Metric({ label, value  }: { label: string; value: string  }) {
  return <div className="metric"><span>{label }</span><strong>{value }</strong></div>;
 }

function mergeDebugRunIntoChart(chart: ComboChart, snapshot: RecordingSnapshot) {
  const usedUnitIds = new Set<string>();
  let matched = 0;
  let preheated = 0;
  let recovered = 0;
  let rejected = 0;
  const orderedSteps = [...chart.steps].sort((a, b) => a.startMin - b.startMin || a.id.localeCompare(b.id));
  const updatedById = new Map<string, ComboStep>();
  const recordingId = `debug_${Date.now() }`;
  orderedSteps.forEach((step, index) => {
    const match = findDebugMatch(step, snapshot.units, usedUnitIds, orderedSteps[index - 1], orderedSteps[index + 1]);
    if (!match) {
      rejected += 1;
      updatedById.set(step.id, step);
      return;
     }
    usedUnitIds.add(match.id);
    matched += 1;
    const nextPreheat = Math.max(step.preheatMs ?? 0, Math.max(0, step.startMin - match.startTime + 40));
    const nextDurationMax = Math.max(step.durationMax, Math.ceil(match.duration + 60));
    const observedEnd = match.startTime + match.duration;
    const expectedEnd = step.startMin + nextDurationMax;
    const nextRecovery = Math.max(step.recoveryMs ?? 0, Math.max(0, observedEnd - expectedEnd + 40));
    if (nextPreheat > (step.preheatMs ?? 0)) preheated += 1;
    if (nextRecovery > (step.recoveryMs ?? 0) || nextDurationMax > step.durationMax) recovered += 1;
    updatedById.set(step.id, normalizeStep({ ...step, durationMax: nextDurationMax + nextRecovery, preheatMs: nextPreheat, recoveryMs: nextRecovery, samples: [...(step.samples ?? []), { recordingId, startTime: match.startTime, duration: match.duration  }]  }));
   });
  const updated = chart.steps.map((step) => updatedById.get(step.id) ?? step);
  return { chart: normalizeChart({ ...chart, steps: updated  }), matched, total: chart.steps.length, preheated, recovered, rejected  };
 }

function findDebugMatch(step: ComboStep, units: RecordedUnit[], usedUnitIds: Set<string>, previousStep?: ComboStep, nextStep?: ComboStep): RecordedUnit | null {
  const expected = (step.startMin + step.startMax) / 2;
  const maxDrift = debugMatchMaxDrift(step);
  const previousBoundary = previousStep ? (previousStep.startMin + step.startMin) / 2 : step.startMin - maxDrift;
  const nextBoundary = nextStep ? (step.startMin + nextStep.startMin) / 2 : step.startMin + maxDrift;
  const windowStart = Math.max(previousBoundary, expected - maxDrift);
  const windowEnd = Math.min(nextBoundary, expected + maxDrift);
  const candidates = units.filter((unit) => {
    if (usedUnitIds.has(unit.id)) return false;
    if (unit.moveId !== step.moveId) return false;
    if ((unit.characterSlot ?? 1) !== (step.characterSlot ?? 1) || unit.lane !== step.lane) return false;
    if (unit.startTime < windowStart || unit.startTime > windowEnd) return false;
    return unit.startTime + unit.duration <= step.startMin + step.durationMax + (step.recoveryMs ?? 0) + maxDrift;
   });
  if (!candidates.length) return null;
  return candidates.reduce((best, unit) => Math.abs(unit.startTime - expected) < Math.abs(best.startTime - expected) ? unit : best);
 }

function debugMatchMaxDrift(step: ComboStep): number {
  const currentWindow = step.durationMax + (step.preheatMs ?? 0) + (step.recoveryMs ?? 0);
  return clamp(Math.max(900, currentWindow * 2 + 500), 900, 3500);
 }

type ImportedComboPackage = { charts: ComboChart[]; contentLabels: Record<string, string>; moves: MoveDefinition[]; bindings: KeyBinding[]  };

function createChartExportPackage(chart: ComboChart, contentLabels: Record<string, string>, moves: MoveDefinition[], bindings: KeyBinding[]) {
  const usedMoveIds = new Set(chart.steps.map((step) => step.moveId));
  return {
    type: 'wwcombo-chart',
    version: 3,
    chart,
    contentLabels: filterContentLabelsForChart(chart, contentLabels),
    moves: moves.filter((move) => usedMoveIds.has(move.id) || move.id === chart.startTriggerMoveId || move.id === (chart.stopTriggerMoveId ?? 'stop_recording')),
    bindings: bindings.filter((binding) => usedMoveIds.has(binding.moveId) || binding.moveId === chart.startTriggerMoveId || binding.moveId === (chart.stopTriggerMoveId ?? 'stop_recording'))
   };
 }

function filterContentLabelsForCharts(charts: ComboChart[], contentLabels: Record<string, string>): Record<string, string> {
  return charts.reduce((next, chart) => ({ ...next, ...filterContentLabelsForChart(chart, contentLabels)  }), { } as Record<string, string>);
 }

function filterContentLabelsForChart(chart: ComboChart, contentLabels: Record<string, string>): Record<string, string> {
  const stepIds = new Set(chart.steps.map((step) => step.id));
  return Object.fromEntries(Object.entries(contentLabels).filter(([stepId, label]) => stepIds.has(stepId) && typeof label === 'string' && label.trim()));
 }

function parseImportedComboPackage(value: unknown): ImportedComboPackage {
  const record = value as { chart?: ComboChart; charts?: ComboChart[]; contentLabels?: Record<string, string>; moves?: MoveDefinition[]; bindings?: KeyBinding[]  };
  const candidates = Array.isArray(value) ? value : Array.isArray(record.charts) ? record.charts : record.chart ? [record.chart] : [value as ComboChart];
  const charts = candidates.filter(isReasonableChart).map((item) => normalizeChart({ ...item, id: item.id || crypto.randomUUID(), updatedAt: Date.now()  }));
  const stepIds = new Set(charts.flatMap((chart) => chart.steps.map((step) => step.id)));
  const contentLabels = Object.fromEntries(Object.entries(record.contentLabels ?? { }).filter(([stepId, label]) => stepIds.has(stepId) && typeof label === 'string' && label.trim()));
  return {
    charts,
    contentLabels,
    moves: Array.isArray(record.moves) ? record.moves.filter(isReasonableMove) : [],
    bindings: Array.isArray(record.bindings) ? record.bindings.filter(isReasonableBinding) : []
   };
 }

function isReasonableMove(move: MoveDefinition): move is MoveDefinition {
  return Boolean(move && typeof move.id === 'string' && typeof move.label === 'string' && typeof move.color === 'string');
 }

function isReasonableBinding(binding: KeyBinding): binding is KeyBinding {
  return Boolean(binding && typeof binding.moveId === 'string' && Array.isArray(binding.inputs));
 }

function mergeMoves(current: MoveDefinition[], imported: MoveDefinition[]): MoveDefinition[] {
  const map = new Map(current.map((move) => [move.id, move]));
  imported.forEach((move) => map.set(move.id, { ...map.get(move.id), ...move  }));
  return [...map.values()];
 }

function mergeBindings(current: KeyBinding[], imported: KeyBinding[]): KeyBinding[] {
  const map = new Map(current.map((binding) => [binding.moveId, binding]));
  imported.forEach((binding) => map.set(binding.moveId, binding));
  return [...map.values()];
 }

function downloadBytes(bytes: Uint8Array, filename: string, type: string) {
  const blobBytes = Uint8Array.from(bytes);
  const blob = new Blob([blobBytes.buffer], { type  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
 }



function stringifyPortableJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/[\u007F-\uFFFF]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
 }

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'));
    reader.onerror = () => reject(reader.error ?? new Error('图片读取失败'));
    reader.readAsDataURL(file);
   });
 }

function readImageSize(src: string): Promise<{ width: number; height: number  }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1  });
    image.onerror = () => reject(new Error('图片读取失败'));
    image.src = src;
   });
 }

function optimizePresetImage(src: string): Promise<{ src: string; width: number; height: number  }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(1, image.naturalWidth), 800 / Math.max(1, image.naturalHeight));
      let width = Math.max(1, Math.round(image.naturalWidth * scale));
      let height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('\u56fe\u7247\u5904\u7406\u5931\u8d25'));
        return;
       }
      for (;;) {
        canvas.width = width;
        canvas.height = height;
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const webp = canvas.toDataURL('image/webp', 0.82);
        if (webp.length <= 1_350_000) {
          resolve({ src: webp, width, height  });
          return;
         }
        const jpeg = canvas.toDataURL('image/jpeg', 0.76);
        if (jpeg.length <= 1_350_000) {
          resolve({ src: jpeg, width, height  });
          return;
         }
        width = Math.max(160, Math.round(width * 0.82));
        height = Math.max(80, Math.round(height * 0.82));
       }
     };
    image.onerror = () => reject(new Error('\u56fe\u7247\u8bfb\u53d6\u5931\u8d25'));
    image.src = src;
   });
 }

function safeFileName(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 48) || 'wwcombo';
 }

function pointerTimeInTrack(event: { clientX: number; currentTarget: HTMLElement  }, total: number): number {
  const track = event.currentTarget.closest('.timeline-editor-track') as HTMLElement | null;
  if (!track) return 0;
  const rect = track.getBoundingClientRect();
  return clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1) * total;
 }
