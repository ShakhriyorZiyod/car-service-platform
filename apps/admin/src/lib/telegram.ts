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

/** Once at start: the panel is ready, takes the whole height and is not closed by a swipe down. */
export function startTelegram(): void {
  if (!inTelegramApp()) return;
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
