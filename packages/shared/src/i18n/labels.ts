import type { Role } from '../vocabulary/roles';
import type { Lang } from './index';

/** Names the Mini App, the panel and the bot show the same way. */

export const ROLE_LABELS: Readonly<Record<Lang, Readonly<Record<Role, string>>>> = {
  uz: { master: 'Usta', admin: 'Administrator', director: 'Rahbar', owner: 'Egasi' },
  ru: { master: 'Мастер', admin: 'Администратор', director: 'Руководитель', owner: 'Владелец' },
};

/** Each language named in itself, for the language switch. */
export const LANG_NAMES: Readonly<Record<Lang, string>> = { uz: 'O‘zbekcha', ru: 'Русский' };
