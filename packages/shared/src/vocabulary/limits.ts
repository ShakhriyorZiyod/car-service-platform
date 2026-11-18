/** Input limits that the server checks and the clients show as hints. */
export const LIMITS = {
  fullName: { min: 1, max: 100 },
  login: { min: 3, max: 32 },
  password: { min: 8, max: 128 },
  specialization: { max: 100 },
  /** A sign-in code is six digits. */
  codeLength: 6,
} as const;

/** Telegram's signed contact string; real ones are a few hundred characters. */
export const MAX_CONTACT_LENGTH = 4096;
