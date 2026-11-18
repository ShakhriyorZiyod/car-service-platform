import { v7 } from 'uuid';

/**
 * Every id is a UUID v7 (docs/PLAN.md, section 7.1): it says nothing about how many records
 * exist, and it grows with time, so indexes stay compact and ids sort by creation.
 */
export const newId = (): string => v7();
