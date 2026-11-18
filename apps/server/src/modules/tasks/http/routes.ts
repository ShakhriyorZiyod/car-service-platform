import type { AdminRoutes, MasterRoutes } from '../../../http/contexts';
import type { TasksService } from '../app/tasks';

/** Thin adapters: each handler only passes the validated input to a use case. */

export const tasksAdminRoutes = (
  tasks: TasksService,
): Pick<
  AdminRoutes,
  | 'admin.masters'
  | 'admin.tasks'
  | 'admin.task'
  | 'admin.createTask'
  | 'admin.updateTask'
  | 'admin.acceptTask'
  | 'admin.reworkTask'
> => ({
  'admin.masters': async (_input, { actor }) => ({ items: await tasks.masters(actor) }),
  'admin.tasks': async ({ query }, { actor }) => ({ items: await tasks.list(actor, query) }),
  'admin.task': ({ params }, { actor }) => tasks.get(actor, params.id),
  'admin.createTask': ({ params, body }, { actor, ip }) => tasks.create(actor, params.id, body, ip),
  'admin.updateTask': ({ params, body }, { actor, ip }) => tasks.update(actor, params.id, body, ip),
  'admin.acceptTask': ({ params }, { actor, ip }) => tasks.accept(actor, params.id, ip),
  'admin.reworkTask': ({ params, body }, { actor, ip }) =>
    tasks.rework(actor, params.id, body.remark, ip),
});

export const tasksMasterRoutes = (tasks: TasksService): MasterRoutes => ({
  'master.tasks': async ({ query }, { actor }) => ({
    items: await tasks.forMaster(actor, query.tab),
  }),
  'master.task': ({ params }, { actor }) => tasks.taskForMaster(actor, params.id),
  'master.startTask': ({ params }, { actor }) => tasks.start(actor, params.id),
  'master.putTaskPhoto': ({ params, query, body }, { actor }) =>
    tasks.putPhoto(actor, params.id, { mediaId: params.mediaId, kind: query.kind, bytes: body }),
  'master.deleteTaskPhoto': async ({ params }, { actor }) => {
    await tasks.deletePhoto(actor, params.id, params.mediaId);
    return { ok: true };
  },
  'master.submitTask': ({ params, body }, { actor }) =>
    tasks.submit(actor, params.id, body.comment),
});
