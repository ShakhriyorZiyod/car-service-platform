/**
 * Languages of every interface and message: Uzbek (Latin) first, Russian second (TZ 15.6).
 * No dependencies, safe for the Mini App bundle.
 */

export const LANGS = ['uz', 'ru'] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = 'uz';

/** Telegram's `language_code` ("ru", "ru-RU", "uz", "en", …): Russian or else Uzbek. */
export function langFromCode(code: string | null | undefined): Lang {
  return code?.toLowerCase().startsWith('ru') ? 'ru' : DEFAULT_LANG;
}

/**
 * The shape every translation must have: the same keys as the Uzbek dictionary, with strings
 * widened. `const ru: Dictionary<typeof uz> = { … }` fails to compile when a key is missing,
 * extra, or a function takes different arguments.
 */
export type Dictionary<T> = {
  readonly [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends (...args: infer A) => string
      ? (...args: A) => string
      : Dictionary<T[K]>;
};

export * from './labels';
