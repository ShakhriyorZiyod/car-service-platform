import type { Logger } from '../logger';

/** A job that runs again and again until stopped (docs/PLAN.md, section 4.8). */
export interface Loop {
  /** Stops after the run in progress, if any, has finished. */
  stop(): Promise<void>;
}

export function startLoop(options: {
  name: string;
  intervalMs: number;
  logger: Logger;
  run: () => Promise<unknown>;
}): Loop {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();

  const tick = () => {
    running = (async () => {
      try {
        await options.run();
      } catch (err) {
        // One failed run must not end the loop: the next one tries again.
        options.logger.error({ err, job: options.name }, 'background job failed');
      }
    })().finally(() => {
      if (!stopped) timer = setTimeout(tick, options.intervalMs);
    });
  };
  timer = setTimeout(tick, options.intervalMs);

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await running;
    },
  };
}
