/**
 * The parts of the one Mini App. The server decides which one a user gets (docs/PLAN.md,
 * section 4.7); the client only loads it.
 *   client  anyone without a staff role
 *   master  a master
 *   staff   admin, director or owner: a pointer to the web panel
 */
export const SHELLS = ['client', 'master', 'staff'] as const;

export type Shell = (typeof SHELLS)[number];
