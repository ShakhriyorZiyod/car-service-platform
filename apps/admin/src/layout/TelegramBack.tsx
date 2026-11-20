import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { onTelegramBack, showTelegramBack } from '../lib/telegram';

/** How far into the panel this window has gone (React Router keeps it in the history state). */
const historyIndex = (): number => {
  const state = window.history.state as { idx?: unknown } | null;
  return typeof state?.idx === 'number' ? state.idx : 0;
};

/**
 * "Back" inside Telegram's window (PLAN 22, 2026-11-20): closes the open menu, else the previous
 * page; a page opened straight from a bot message goes back to "Bugun". Only on "Bugun", with
 * nothing behind it, does "back" close the window. Outside Telegram the browser's own back works.
 */
export function TelegramBack({
  menuOpen,
  closeMenu,
}: {
  menuOpen: boolean;
  closeMenu: () => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const visible = menuOpen || historyIndex() > 0 || pathname !== '/';

  // The listener reads the latest state; subscribing once keeps Telegram's events in order.
  const latest = useRef({ menuOpen, closeMenu });
  useEffect(() => {
    latest.current = { menuOpen, closeMenu };
  });

  useEffect(
    () =>
      onTelegramBack(() => {
        if (latest.current.menuOpen) latest.current.closeMenu();
        else if (historyIndex() > 0) void navigate(-1);
        else void navigate('/', { replace: true });
      }),
    [navigate],
  );

  useEffect(() => {
    showTelegramBack(visible);
  }, [visible]);
  // Leaving the panel (signing out): the sign-in screen has nowhere to go back to.
  useEffect(() => () => showTelegramBack(false), []);

  return null;
}
