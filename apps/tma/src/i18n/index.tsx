import { DEFAULT_LANG, type Dictionary, type Lang } from '@cs/shared/i18n';
import { createContext, use, type ReactNode } from 'react';
import { ru } from './ru';
import { uz } from './uz';

export type Texts = Dictionary<typeof uz>;

const DICTIONARIES: Readonly<Record<Lang, Texts>> = { uz, ru };

const LangContext = createContext<Lang>(DEFAULT_LANG);

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext value={lang}>{children}</LangContext>;
}

export function useLang(): Lang {
  return use(LangContext);
}

/** The texts of the current language. */
export function useT(): Texts {
  return DICTIONARIES[useLang()];
}
