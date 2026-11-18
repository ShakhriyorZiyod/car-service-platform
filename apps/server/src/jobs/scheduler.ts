import type { Logger } from '../logger';
import type { Clock } from '../platform/clock';
import type { ScheduledTask } from '../platform/ports';
import { startLoop, type Loop } from './loop';

export type { ScheduledTask };

const MINUTE_MS = 60_000;

export function startScheduler(options: {
  tasks: readonly ScheduledTask[];
  clock: Clock;
  logger: Logger;
  intervalMs?: number;
}): Loop {
  return startLoop({
    name: 'scheduler',
    intervalMs: options.intervalMs ?? MINUTE_MS,
    logger: options.logger,
    run: async () => {
      for (const task of options.tasks) {
        try {
          await task.run(options.clock.now());
        } catch (err) {
          options.logger.error({ err, task: task.name }, 'scheduled task failed');
        }
      }
    },
  });
}
