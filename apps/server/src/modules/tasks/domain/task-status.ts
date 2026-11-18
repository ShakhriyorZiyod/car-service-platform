import type { AdminTaskTab, MasterTaskTab, TaskStatus } from '@cs/shared/vocabulary';

/**
 * The master's task (docs/PLAN.md, section 9.2). Status changes only along these lines, by the
 * people named, and the use case that makes one also writes it to the history.
 */

export type TaskActor = 'admin' | 'master';

interface Transition {
  from: TaskStatus;
  to: TaskStatus;
  by: TaskActor;
}

export const TASK_TRANSITIONS: readonly Transition[] = [
  // Giving it to another master (it starts over for them).
  { from: 'assigned', to: 'assigned', by: 'admin' },
  { from: 'in_progress', to: 'assigned', by: 'admin' },
  { from: 'assigned', to: 'in_progress', by: 'master' },
  { from: 'in_progress', to: 'on_review', by: 'master' },
  { from: 'on_review', to: 'accepted', by: 'admin' },
  { from: 'on_review', to: 'rework', by: 'admin' },
  { from: 'rework', to: 'on_review', by: 'master' },
];

export const canTaskTransition = (from: TaskStatus, to: TaskStatus, by: TaskActor): boolean =>
  TASK_TRANSITIONS.some((t) => t.from === from && t.to === to && t.by === by);

/** The attempt a master is on: the first, and one more after each rework. */
export const attemptOf = (reworkCount: number): number => reworkCount + 1;

/** Photos can be taken and removed while the master is working, before handing the report in. */
export const canTakePhotos = (status: TaskStatus): boolean =>
  status === 'in_progress' || status === 'rework';

/** The report needs at least one photo of the work done, in the attempt being handed in. */
export const canSubmit = (status: TaskStatus, afterPhotos: number): boolean =>
  canTakePhotos(status) && afterPhotos >= 1;

/** The task may be given to another master, or its instruction changed. */
export const canReassign = (status: TaskStatus): boolean =>
  canTaskTransition(status, 'assigned', 'admin');

/** The instruction and the helper may change until the work is handed in. */
export const canAmend = (status: TaskStatus): boolean =>
  status === 'assigned' || status === 'in_progress' || status === 'rework';

/** Which of the master's lists a task is on (design U1). */
export function masterTab(status: TaskStatus): MasterTaskTab {
  if (status === 'rework') return 'rework';
  if (status === 'on_review' || status === 'accepted') return 'done';
  return 'today';
}

/** Which of the admin's lists a task is on (design A3). */
export function adminTab(status: TaskStatus): AdminTaskTab {
  if (status === 'on_review') return 'review';
  if (status === 'accepted') return 'done';
  return 'active';
}

export const MASTER_TAB_STATUSES: Record<MasterTaskTab, readonly TaskStatus[]> = {
  today: ['assigned', 'in_progress'],
  rework: ['rework'],
  done: ['on_review', 'accepted'],
};

export const ADMIN_TAB_STATUSES: Record<AdminTaskTab, readonly TaskStatus[]> = {
  review: ['on_review'],
  active: ['assigned', 'in_progress', 'rework'],
  done: ['accepted'],
};

/** A task's norm is its zones' norms added up. */
export const normOf = (items: readonly { durationMin: number }[]): number =>
  items.reduce((sum, item) => sum + item.durationMin, 0);
