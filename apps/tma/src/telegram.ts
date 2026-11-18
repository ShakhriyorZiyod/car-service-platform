import {
  backButton,
  cloudStorage,
  init,
  isTMA,
  miniApp,
  openLink,
  requestContactComplete,
  retrieveLaunchParams,
  retrieveRawInitData,
  swipeBehavior,
  themeParams,
  viewport,
} from '@tma.js/sdk-react';

/**
 * The only file that talks to Telegram (ESLint enforces it). Everything here also works in a
 * plain browser during development, so the rest of the app never needs to know where it runs.
 */

export type Theme = 'light' | 'dark';

export interface Launch {
  /** Signed init data for the API; absent in a plain browser. */
  initData: string | undefined;
  /** Telegram's `language_code`, the language until the user's profile has one. */
  languageCode: string | undefined;
}

/** The SDK was initialized; false in a plain browser. */
let insideTelegram = false;

/**
 * The design has its own palette for both themes (docs/DESIGN.md, section 5), so only the mode is
 * taken from Telegram; the colours come from tokens.css.
 */
function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

const token = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * For what only makes the app feel at home. The SDK throws on some clients (an unsupported method
 * or colour is enough), and none of it is worth a blank page.
 */
function optional(step: () => unknown): void {
  try {
    step();
  } catch {
    // The app works without it.
  }
}

/** Telegram's own frame takes the page's colours, so nothing separates the two. */
function paintTelegramFrame(): void {
  const background = token('--bg');
  const surface = token('--surface');
  optional(() => miniApp.setHeaderColor.ifAvailable(background));
  optional(() => miniApp.setBgColor.ifAvailable(background));
  optional(() => miniApp.setBottomBarColor.ifAvailable(surface));
}

/**
 * Outside Telegram there is no signed init data. In development, `npm run dev:init-data` provides
 * some, and `?theme=dark` and `?lang=ru` preview the other theme and language. Vite removes this
 * branch from production builds.
 */
function launchOutsideTelegram(): Launch {
  if (import.meta.env.DEV) {
    const params = new URLSearchParams(location.search);
    const requested = params.get('theme');
    const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(requested === 'dark' || (requested !== 'light' && prefersDark) ? 'dark' : 'light');
    return {
      initData: import.meta.env.VITE_DEV_INIT_DATA as string | undefined,
      languageCode: params.get('lang') ?? undefined,
    };
  }
  applyTheme('light');
  return { initData: undefined, languageCode: undefined };
}

/** Initializes the Telegram SDK once at startup. */
export function launch(): Launch {
  if (!isTMA()) return launchOutsideTelegram();

  init();
  insideTelegram = true;
  optional(() => themeParams.mount.ifAvailable());
  optional(() => miniApp.mount.ifAvailable());

  // The mode comes from Telegram's theme, not from miniApp.isDark: that one reads the app's
  // background, which paintTelegramFrame sets to our own colour, so it would never change again.
  applyTheme('light');
  paintTelegramFrame();
  optional(() => {
    const follow = () => {
      applyTheme(themeParams.isDark() ? 'dark' : 'light');
      paintTelegramFrame();
    };
    follow();
    themeParams.isDark.sub(follow);
  });

  optional(() => {
    const mounting = viewport.mount.ifAvailable();
    if (mounting.ok) {
      // Failing here only costs the full height; the app still works.
      void mounting.data
        .then(() => {
          viewport.expand.ifAvailable();
          viewport.bindCssVars.ifAvailable();
        })
        .catch(() => undefined);
    }
  });
  // Scrolling a long list must not close the app.
  optional(() => swipeBehavior.mount.ifAvailable());
  optional(() => swipeBehavior.disableVertical.ifAvailable());

  let languageCode: string | undefined;
  optional(() => {
    languageCode = retrieveLaunchParams().tgWebAppData?.user?.language_code;
  });
  return { initData: retrieveRawInitData(), languageCode };
}

/** Tells Telegram the app has drawn something, so its loading placeholder can go. */
export function signalReady(): void {
  if (insideTelegram) optional(() => miniApp.ready.ifAvailable());
}

/**
 * Asks Telegram for the user's own number. Returns the raw signed answer, which only the server
 * reads (it checks the signature); null when the user says no or the client cannot ask.
 */
export async function requestPhone(): Promise<string | null> {
  if (!insideTelegram) {
    return import.meta.env.DEV
      ? ((import.meta.env.VITE_DEV_CONTACT as string | undefined) ?? null)
      : null;
  }
  const requested = requestContactComplete.ifAvailable({ timeout: 30_000 });
  if (!requested.ok) return null;
  try {
    return (await requested.data).raw;
  } catch {
    return null;
  }
}

/** Opens a link outside the Mini App, such as the web panel. */
export function openExternal(url: string): void {
  const opened = insideTelegram ? openLink.ifAvailable(url) : { ok: false as const };
  if (!opened.ok) window.open(url, '_blank', 'noopener');
}

/** True inside Telegram, where the native back button exists; elsewhere the page draws its own. */
export const hasNativeBack = (): boolean => insideTelegram;

/**
 * Shows Telegram's back button and calls `onBack` when it is pressed; the returned function takes
 * it away again. A no-op outside Telegram.
 */
export function showBackButton(onBack: () => void): () => void {
  if (!insideTelegram) return () => undefined;
  let off: () => void = () => undefined;
  optional(() => {
    backButton.mount.ifAvailable();
    backButton.show.ifAvailable();
    off = backButton.onClick(onBack);
  });
  return () => {
    optional(() => off());
    optional(() => backButton.hide.ifAvailable());
  };
}

/**
 * Small notes that should outlive the app (an unfinished booking): Telegram's CloudStorage, so they
 * follow the person to another device. Outside Telegram, in development, the browser's storage.
 * Nothing here may fail the app: a draft is a convenience.
 */
export async function readStored(key: string): Promise<string | null> {
  try {
    if (!insideTelegram) return localStorage.getItem(key);
    const read = cloudStorage.getItem.ifAvailable(key);
    return read.ok ? (await read.data) || null : null;
  } catch {
    return null;
  }
}

export async function writeStored(key: string, value: string | null): Promise<void> {
  try {
    if (!insideTelegram) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      return;
    }
    const done =
      value === null
        ? cloudStorage.deleteItem.ifAvailable(key)
        : cloudStorage.setItem.ifAvailable(key, value);
    if (done.ok) await done.data;
  } catch {
    // The draft is lost, the booking is not.
  }
}
