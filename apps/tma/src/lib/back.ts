import { useEffect } from 'react';
import { showBackButton } from '../telegram';

/** While a screen that can go back is shown, Telegram's back button goes back (TZ 4, DESIGN 5). */
export function useBack(onBack: (() => void) | null): void {
  useEffect(() => (onBack ? showBackButton(onBack) : undefined), [onBack]);
}
