import { ApiRequestError } from '../api';
import type { Texts } from '../i18n';

/** The API error code of a failed call, `network` or `internal` when there is none. */
export const errorCodeOf = (error: unknown): string =>
  error instanceof ApiRequestError ? error.code : 'internal';

/** Which request fields failed validation, as the server named them ("body.login" → "login"). */
export function invalidFields(error: unknown): Set<string> {
  if (!(error instanceof ApiRequestError) || error.code !== 'validation') return new Set();
  return new Set(error.paths.map((path) => path.split('.').at(1) ?? path));
}

/** A message for the errors every screen can meet. */
export function genericMessage(error: unknown, t: Texts): string {
  const code = errorCodeOf(error);
  if (code === 'network') return t.errors.network;
  if (code === 'forbidden') return t.errors.forbidden;
  if (code === 'validation') return t.errors.validation;
  return t.errors.generic;
}

/** Every field path the server named, whole ("body.rules.slotStepMin"), for nested forms. */
export function invalidPaths(error: unknown): ReadonlySet<string> {
  if (!(error instanceof ApiRequestError) || error.code !== 'validation') return new Set();
  return new Set(error.paths);
}

/** The message for a failed call: what the rule says when it has words, else the generic one. */
export function apiMessage(error: unknown, t: Texts): string {
  return t.apiErrors[errorCodeOf(error)] ?? genericMessage(error, t);
}
