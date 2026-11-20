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

/** What the person chose in their profile: follow Telegram, or always light or dark. */
export type ThemeChoice = 'auto' | Theme;

export interface Launch {
  /** Signed init data for the API; absent in a plain browser. */
  initData: string | undefined;
  /** Telegram's `language_code`, the language until the user's profile has one. */
  languageCode: string | undefined;
}

/** The SDK was initialized; false in a plain browser. */
let insideTelegram = false;
/** Telegram Web (web.telegram.org) shows the app in a frame of its own page, not in a webview. */
let webClient = false;
const WEB_PLATFORMS: readonly string[] = ['web', 'weba', 'webk'];

/**
 * The design has its own palette for both themes (docs/DESIGN.md, section 5), so only the mode is
 * taken from Telegram; the colours come from tokens.css.
 */
function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** Where the choice is kept: Telegram's CloudStorage, and a copy here for the very first paint. */
const THEME_KEY = 'theme';
const isThemeChoice = (value: unknown): value is ThemeChoice =>
  value === 'auto' || value === 'light' || value === 'dark';

/** The mode Telegram (or, outside it, the system) uses now: what "auto" follows. */
let autoTheme: Theme = 'light';
let themeChoice: ThemeChoice = 'auto';
const themeListeners = new Set<() => void>();

function rememberedTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return isThemeChoice(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

function rememberTheme(choice: ThemeChoice): void {
  try {
    if (choice === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage may be off: the choice still holds until the app closes.
  }
}

/** Paints the page and Telegram's frame in the mode the choice gives. */
function renderTheme(): void {
  applyTheme(themeChoice === 'auto' ? autoTheme : themeChoice);
  if (insideTelegram) paintTelegramFrame();
  for (const listener of themeListeners) listener();
}

export const themeChoiceNow = (): ThemeChoice => themeChoice;

/** For the profile's switch (useSyncExternalStore); returns the way to stop listening. */
export function onThemeChoice(listener: () => void): () => void {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

/** The person picked a mode: shown at once, kept in Telegram's CloudStorage and here. */
export function chooseTheme(choice: ThemeChoice): void {
  themeChoice = choice;
  rememberTheme(choice);
  renderTheme();
  void writeStored(THEME_KEY, choice === 'auto' ? null : choice);
}

/**
 * The choice may have been made on another device: CloudStorage has the last word. It answers a
 * moment after start, so the first paint uses the copy kept here.
 */
function loadStoredTheme(): void {
  void readStored(THEME_KEY).then((stored) => {
    if (!isThemeChoice(stored) || stored === themeChoice) return;
    themeChoice = stored;
    rememberTheme(stored);
    renderTheme();
  });
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
  themeChoice = rememberedTheme();
  if (import.meta.env.DEV) {
    const params = new URLSearchParams(location.search);
    const requested = params.get('theme');
    const system = matchMedia('(prefers-color-scheme: dark)');
    const follow = () => {
      autoTheme =
        requested === 'dark' || (requested !== 'light' && system.matches) ? 'dark' : 'light';
      renderTheme();
    };
    follow();
    system.addEventListener('change', follow);
    return {
      initData: import.meta.env.VITE_DEV_INIT_DATA as string | undefined,
      languageCode: params.get('lang') ?? undefined,
    };
  }
  renderTheme();
  return { initData: undefined, languageCode: undefined };
}

/** Initializes the Telegram SDK once at startup. */
export function launch(): Launch {
  if (!isTMA()) return launchOutsideTelegram();

  init();
  insideTelegram = true;
  optional(() => themeParams.mount.ifAvailable());
  optional(() => miniApp.mount.ifAvailable());

  // "Auto" follows Telegram's theme, not miniApp.isDark: that one reads the app's background,
  // which paintTelegramFrame sets to our own colour, so it would never change again.
  themeChoice = rememberedTheme();
  renderTheme();
  optional(() => {
    const follow = () => {
      autoTheme = themeParams.isDark() ? 'dark' : 'light';
      renderTheme();
    };
    follow();
    themeParams.isDark.sub(follow);
  });
  loadStoredTheme();

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
    const params = retrieveLaunchParams();
    languageCode = params.tgWebAppData?.user?.language_code;
    webClient = WEB_PLATFORMS.includes(params.tgWebAppPlatform);
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

/**
 * Telegram's own apps (phone, desktop) can show the web panel in this same window, on the same
 * origin. Telegram Web cannot: a frame inside web.telegram.org gets no session cookie
 * (SameSite=Strict), so there and in a browser the panel needs a new tab.
 */
export const panelOpensHere = (): boolean => insideTelegram && !webClient;

/**
 * The web panel for the staff: in this window where it can be (it takes this page's place, so
 * "back" on the panel's first page closes Telegram's window), otherwise in a new tab.
 */
export function openPanel(url: string): void {
  if (panelOpensHere()) {
    window.location.replace(url);
    return;
  }
  openExternal(url);
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
