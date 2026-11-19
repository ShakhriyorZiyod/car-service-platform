import { useSyncExternalStore } from 'react';
import { useT } from '../i18n';
import { chooseTheme, onThemeChoice, themeChoiceNow, type ThemeChoice } from '../telegram';
import { Segmented } from './Segmented';

const CHOICES: readonly ThemeChoice[] = ['auto', 'light', 'dark'];

/**
 * "Mavzu" in the client's and the master's profile: follow Telegram, or always light or dark. The
 * choice is kept in Telegram's CloudStorage, so it follows the person to another device.
 */
export function ThemeSwitch() {
  const t = useT().theme;
  const choice = useSyncExternalStore(onThemeChoice, themeChoiceNow);
  return (
    <div className="field">
      <span className="field__label">{t.label}</span>
      <Segmented
        label={t.label}
        value={choice}
        onChange={chooseTheme}
        options={CHOICES.map((value) => ({ value, label: t[value] }))}
      />
    </div>
  );
}
