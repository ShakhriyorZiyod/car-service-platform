/**
 * The tasks module (docs/PLAN.md, sections 4.2, 7.10 and 9.2): jobs given to masters, their photo
 * reports, the admin's check, and the order becoming ready when the last task is accepted.
 */
import { createTasksService, type TasksDeps, type TasksService } from './app/tasks';

export function createTasks(deps: TasksDeps): TasksService {
  return createTasksService(deps);
}

export type { TasksService } from './app/tasks';
export { tasksAdminRoutes, tasksMasterRoutes } from './http/routes';
