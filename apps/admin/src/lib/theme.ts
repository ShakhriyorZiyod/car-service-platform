import { useSyncExternalStore } from 'react';
import { paintTelegramFrame } from './telegram';

/**
 * The panel's light or dark mode (docs/DESIGN.md, section 6): "auto" follows the computer's own
 * setting. The choice is this browser's and stays here (localStorage); the colours are the same
 * tokens as the Mini App's (`data-theme` on <html>).
 */

export type ThemeChoice = 'auto' | 'light' | 'dark';
export const THEME_CHOICES: readonly ThemeChoice[] = ['auto', 'light', 'dark'];

const KEY = 'cs-admin-theme';
const isChoice = (value: unknown): value is ThemeChoice =>
  value === 'auto' || value === 'light' || value === 'dark';

let choice: ThemeChoice = 'auto';
const listeners = new Set<() => void>();
const system = matchMedia('(prefers-color-scheme: dark)');

function apply(): void {
  const dark = choice === 'dark' || (choice === 'auto' && system.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  paintTelegramFrame();
  for (const listener of listeners) listener();
}

/** Before the first paint, so the page never flashes in the other mode. */
export function startTheme(): void {
  try {
    const stored = localStorage.getItem(KEY);
    if (isChoice(stored)) choice = stored;
  } catch {
    // Storage is off (a private window): "auto" it is.
  }
  apply();
  system.addEventListener('change', apply);
}

export function chooseTheme(next: ThemeChoice): void {
  choice = next;
  try {
    if (next === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // The choice still holds until the page is closed.
  }
  apply();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useThemeChoice = (): ThemeChoice => useSyncExternalStore(subscribe, () => choice);
