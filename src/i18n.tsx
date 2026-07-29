import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { translationCatalogs } from './translations';
import { annotateJapaneseTerminology } from './japaneseTerminology';
import { annotateKoreanTerminology } from './koreanTerminology';
import './koreanRuby.css';

export type AppLanguage = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR';

type I18nContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  text: (chinese: string, english: string) => string;
};

const LANGUAGE_STORAGE_KEY = 'ww-combo-trainer-language-v1';
const I18nContext = createContext<I18nContextValue | null>(null);
const APP_LANGUAGES: readonly AppLanguage[] = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];
type CharacterNames = Record<AppLanguage, string>;
let remoteCharacterNames = new Map<string, CharacterNames>();

type TemplateTranslation = {
  expression: RegExp;
  indexes: number[];
  translation: string;
  specificity: number;
};

function compileTemplates(catalog: Record<string, string>): TemplateTranslation[] {
  return Object.entries(catalog).flatMap(([source, translation]) => {
    if (!translation || !/\{\d+\}/.test(source)) return [];
    const indexes: number[] = [];
    const expression = source
      .split(/(\{\d+\})/g)
      .map((part) => {
        const placeholder = /^\{(\d+)\}$/.exec(part);
        if (placeholder) {
          indexes.push(Number(placeholder[1]));
          return '(.*?)';
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    return [{ expression: new RegExp(`^${expression}$`, 's'), indexes, translation, specificity: source.replace(/\{\d+\}/g, '').length }];
  }).sort((left, right) => right.specificity - left.specificity);
}

const templateCatalogs: Partial<Record<AppLanguage, TemplateTranslation[]>> = {
  'ja-JP': compileTemplates(translationCatalogs['ja-JP']),
  'ko-KR': compileTemplates(translationCatalogs['ko-KR'])
};

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && APP_LANGUAGES.includes(value as AppLanguage);
}

export function localizeEnglish(english: string, language: AppLanguage): string {
  if (language === 'zh-CN' || language === 'en-US') return english;
  const exact = translationCatalogs[language][english];
  if (exact) return exact;

  for (const template of templateCatalogs[language] ?? []) {
    const match = template.expression.exec(english);
    if (!match) continue;
    const values = new Map<number, string>();
    template.indexes.forEach((index, captureIndex) => values.set(index, match[captureIndex + 1] ?? ''));
    const translated = template.translation.replace(/\{(\d+)\}/g, (placeholder, rawIndex: string) => values.get(Number(rawIndex)) ?? placeholder);
    if (language === 'ja-JP') return annotateJapaneseTerminology(translated);
    return language === 'ko-KR' ? annotateKoreanTerminology(translated) : translated;
  }
  return english;
}

export function setRemoteCharacterNames(characters: Array<{ names?: Partial<Record<AppLanguage, string>> }> | undefined): void {
  const next = new Map<string, CharacterNames>();
  for (const character of characters ?? []) {
    const chinese = character.names?.['zh-CN']?.trim() ?? '';
    if (!chinese) continue;
    const names = Object.fromEntries(APP_LANGUAGES.map((entry) => [entry, character.names?.[entry]?.trim() || chinese])) as CharacterNames;
    for (const alias of Object.values(names)) if (alias) next.set(alias, names);
  }
  remoteCharacterNames = next;
}

export function localizeCharacterName(name: string | undefined, language: AppLanguage): string {
  if (!name) return '';
  return remoteCharacterNames.get(name.trim())?.[language] || name;
}

export function localizeDefaultCharacterName(name: string | undefined, slot: number, language: AppLanguage): string {
  const chineseDefault = `角色${slot}`;
  if (language === 'zh-CN') return name || chineseDefault;
  if (!name || /^角色\s*[123]$/.test(name)) return localizeEnglish(`Character ${slot}`, language);
  return localizeCharacterName(name, language);
}

function loadLanguage(): AppLanguage {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isAppLanguage(stored) ? stored : 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>(loadLanguage);

  useEffect(() => {
    const syncLanguage = (event: StorageEvent) => {
      if (event.key === LANGUAGE_STORAGE_KEY && isAppLanguage(event.newValue)) setLanguage(event.newValue);
    };
    window.addEventListener('storage', syncLanguage);
    return () => window.removeEventListener('storage', syncLanguage);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // The selected language still works for this session when storage is unavailable.
    }
  }, [language]);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    text: (chinese, english) => language === 'zh-CN' ? chinese : localizeEnglish(english, language)
  }), [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
