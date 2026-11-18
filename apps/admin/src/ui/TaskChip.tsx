import type { TaskStatus } from '@cs/shared/vocabulary';
import { useT } from '../i18n';

/** A task's status as a dot and a word (docs/DESIGN.md, section 2.3). */
export function TaskChip({ status }: { status: TaskStatus }) {
  const t = useT();
  return (
    <span className={`status status--task-${status}`}>
      <span className="status__dot" aria-hidden="true" />
      {t.taskStatus[status]}
    </span>
  );
}
