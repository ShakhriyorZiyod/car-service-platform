import { hash, verify } from '@node-rs/argon2';

/** Staff passwords: Argon2id, the library's default (TZ 15.2). */
export const hashPassword = (password: string): Promise<string> => hash(password);

let timingHash: Promise<string> | undefined;

/**
 * False for a wrong password or a missing hash. When there is no hash (unknown login), a real
 * verification still runs, so the answer takes as long and does not reveal which logins exist.
 */
export async function verifyPassword(hashed: string | null, password: string): Promise<boolean> {
  if (!hashed) {
    timingHash ??= hash('no such account');
    await verify(await timingHash, password).catch(() => false);
    return false;
  }
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}
