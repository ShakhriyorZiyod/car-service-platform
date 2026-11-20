/**
 * The panel inside Telegram (docs/PLAN.md, section 22, 2026-11-20). The panel is an ordinary web
 * page that a staff member may also open in Telegram's own app: from the Mini App's "Panelni
 * ochish" or a bot message's "Panelda ochish". Sign-in and everything else work as in a browser;
 * this file only asks Telegram's window to behave (full height, no swipe-to-close, our colours).
 * The only file of the panel that talks to Telegram.
 */

interface WebviewProxy {
  postEvent(eventType: string, eventData: string): void;
}

type Receive = (eventType: string, eventData?: unknown) => void;

/** The places Telegram's apps call with an event (Android and iOS, desktop, older desktop). */
interface EventSinks {
  Telegram?: { WebView?: { receiveEvent?: Receive } };
  TelegramGameProxy?: { receiveEvent?: Receive };
  TelegramGameProxy_receiveEvent?: Receive;
}

/** Telegram's apps (Android, iOS, desktop) put this object into the page they show. */
const proxy = (): WebviewProxy | undefined =>
  (window as unknown as { TelegramWebviewProxy?: WebviewProxy }).TelegramWebviewProxy;

/** Inside Telegram's own app, where the panel fills the window and the session cookie works. */
export const inTelegramApp = (): boolean => proxy() !== undefined;

/**
 * Shown inside another page's frame: Telegram Web (web.telegram.org) opens a bot's web_app button
 * that way. A framed panel gets no session cookie (SameSite=Strict), so it only offers a new tab.
 */
export const inFrame = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

function post(eventType: string, eventData: object = {}): void {
  try {
    proxy()?.postEvent(eventType, JSON.stringify(eventData));
  } catch {
    // Only comfort: the panel works without it.
  }
}

const listeners = new Map<string, Set<() => void>>();

const receive: Receive = (eventType) => {
  for (const listener of listeners.get(eventType) ?? []) listener();
};

/** Telegram tells the page about its buttons by calling these; the Mini App's SDK does the same. */
function listenToTelegram(): void {
  const sinks = window as unknown as EventSinks;
  sinks.Telegram ??= {};
  sinks.Telegram.WebView ??= {};
  sinks.Telegram.WebView.receiveEvent = receive;
  sinks.TelegramGameProxy ??= {};
  sinks.TelegramGameProxy.receiveEvent = receive;
  sinks.TelegramGameProxy_receiveEvent = receive;
}

/**
 * Telegram's back button (the arrow in its header; on Android the system "back" too). While it is
 * hidden, "back" closes the whole window, so the panel shows it whenever there is somewhere to go
 * back to. Returns the way to stop listening. A no-op outside Telegram's app.
 */
export function onTelegramBack(listener: () => void): () => void {
  if (!inTelegramApp()) return () => undefined;
  const set = listeners.get('back_button_pressed') ?? new Set();
  listeners.set('back_button_pressed', set);
  set.add(listener);
  return () => set.delete(listener);
}

export function showTelegramBack(visible: boolean): void {
  if (inTelegramApp()) post('web_app_setup_back_button', { is_visible: visible });
}

/** Once at start: the panel is ready, takes the whole height and is not closed by a swipe down. */
export function startTelegram(): void {
  if (!inTelegramApp()) return;
  listenToTelegram();
  post('web_app_ready');
  post('web_app_expand');
  // Scrolling a long list or the board must not close the window.
  post('web_app_setup_swipe_behavior', { allow_vertical_swipe: false });
}

/** Telegram's header and background take the page's colour, after every change of the theme. */
export function paintTelegramFrame(): void {
  if (!inTelegramApp()) return;
  const styles = getComputedStyle(document.documentElement);
  const background = styles.getPropertyValue('--bg').trim();
  const surface = styles.getPropertyValue('--surface').trim();
  if (background) {
    post('web_app_set_background_color', { color: background });
    post('web_app_set_bottom_bar_color', { color: background });
  }
  if (surface) post('web_app_set_header_color', { color: surface });
}
