/**
 * What happens when a Telegram user shares a number that Telegram verified (docs/PLAN.md,
 * section 7.2). One person is one row, so a number that already has a row decides where the
 * Telegram account goes.
 *
 * - `unchanged`: the user already has this number.
 * - `set`:       nobody has it; it becomes the user's.
 * - `merge`:     a row without Telegram has it (a client the admin entered by phone, or staff the
 *                owner added). The Telegram account moves into that row and the fresh row goes.
 *                Only a user without a number yet can merge: such a row has nothing else of its
 *                own, since a garage and orders need a number first.
 * - `taken`:     the number belongs to another Telegram account, or this user already has a
 *                number and with it their own history. A person resolves this, not the system.
 */
export type PhoneLinkDecision =
  | { kind: 'unchanged' }
  | { kind: 'set' }
  | { kind: 'merge'; intoUserId: string }
  | { kind: 'taken' };

export function decidePhoneLink(
  user: { id: string; phone: string | null },
  holder: { id: string; telegramId: number | null } | null,
  phone: string,
): PhoneLinkDecision {
  if (user.phone === phone || holder?.id === user.id) return { kind: 'unchanged' };
  if (!holder) return { kind: 'set' };
  if (holder.telegramId === null && user.phone === null) {
    return { kind: 'merge', intoUserId: holder.id };
  }
  return { kind: 'taken' };
}
