import type { ApiErrorCode } from '@cs/shared/vocabulary';

/**
 * Expected failures. Adapters turn `code` into an HTTP status (http/plugins/errors.ts) or a bot
 * message; anything that is not an AppError is a bug and becomes `internal`.
 */
export type AppErrorCode = Exclude<ApiErrorCode, 'internal'>;

export interface AppErrorDetails {
  /** Which request fields failed validation. */
  paths?: readonly string[];
}

export class AppError extends Error {
  override name = 'AppError';

  constructor(
    readonly code: AppErrorCode,
    message: string = code,
    readonly details?: Readonly<AppErrorDetails>,
  ) {
    super(message);
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

/** A request that failed validation in a use case, naming the field as "body.some.path". */
export const invalidAt = (path: string, message: string = 'invalid value'): AppError =>
  new AppError('validation', message, { paths: [path] });
