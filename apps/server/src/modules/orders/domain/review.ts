import type { OrderStatus } from '@cs/shared/vocabulary';

/**
 * The client's rating of finished work (docs/PLAN.md, sections 7.8 and 12). The stars are given
 * once, in the bot or in the app; words may follow the stars once, in the app. Pure.
 */

export interface StoredReview {
  rating: number;
  text: string | null;
}

export type ReviewStep =
  /** The first answer: the stars, with or without words. */
  | 'create'
  /** The stars came from the bot; now the words. */
  | 'add_text'
  /** The order is not finished. */
  | 'invalid_transition'
  /** Already rated (and, if words were given, already worded). */
  | 'already_decided';

export function reviewStep(
  status: OrderStatus,
  existing: StoredReview | null,
  input: { rating: number; text: string | null },
): ReviewStep {
  if (status !== 'completed') return 'invalid_transition';
  if (existing === null) return 'create';
  // The words go with the stars already given: a second answer cannot change the rating.
  if (existing.text === null && input.text !== null && input.rating === existing.rating) {
    return 'add_text';
  }
  return 'already_decided';
}

/** What the client may still do: rate, or add words to the stars given in the bot. */
export function reviewActions(
  status: OrderStatus,
  existing: StoredReview | null,
): { canRate: boolean; canComment: boolean } {
  return {
    canRate: status === 'completed' && existing === null,
    canComment: status === 'completed' && existing !== null && existing.text === null,
  };
}
