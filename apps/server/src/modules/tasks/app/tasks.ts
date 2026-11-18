import type {
  AdminTask,
  AdminTaskSummary,
  MasterTask,
  MasterTaskSummary,
  PhotoLink,
  TaskPhoto,
} from '@cs/shared';
import {
  LIMITS,
  type AdminTaskTab,
  type MasterTaskTab,
  type TaskPhotoKind,
} from '@cs/shared/vocabulary';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../../../db/client';
import {
  bookings,
  boxes,
  orderItems,
  orders,
  receptionActs,
  receptionDefects,
  taskReports,
  tasks,
  userRoles,
  users,
} from '../../../db/schema';
import { presentInstant } from '../../../lib/time';
import { requirePermission, type MasterActor, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError, invalidAt } from '../../../platform/errors';
import type { Outbox } from '../../../platform/outbox';
import type { StaffDirectory } from '../../../platform/ports';
import { recordStatus } from '../../../platform/status-history';
import type { AuditService } from '../../audit';
import type { MediaService, Photo } from '../../media';
import type { TaskItem } from '../../orders';
import {
  ADMIN_TAB_STATUSES,
  MASTER_TAB_STATUSES,
  attemptOf,
  canAmend,
  canReassign,
  canSubmit,
  canTakePhotos,
  canTaskTransition,
  normOf,
} from '../domain/task-status';

/**
 * The masters' tasks (docs/PLAN.md, sections 7.10 and 9.2): the admin gives zones of an order that
 * is in work to a master, the master works and hands in a photo report, the admin accepts it or
 * sends it back. When the last task is accepted the order is ready (`orders.onTasksChanged`).
 */

/** What tasks need from the orders module, inside the caller's transaction. */
export interface OrdersForTasks {
  itemsForTask(tx: Tx, orderId: string, itemIds: readonly string[]): Promise<TaskItem[]>;
  attachItems(tx: Tx, itemIds: readonly string[], taskId: string): Promise<void>;
  onTasksChanged(tx: Tx, orderId: string): Promise<void>;
}

export interface TasksDeps extends PlatformDeps {
  audit: AuditService;
  outbox: Outbox;
  media: MediaService;
  orders: OrdersForTasks;
  /** The admins who are told when a report arrives. */
  staff: StaffDirectory;
}

export interface MasterRef {
  id: string;
  fullName: string;
  specialization: string | null;
}

export interface NewTask {
  masterId: string;
  assistantId?: string | null | undefined;
  itemIds: readonly string[];
  instruction: string;
}

export interface TaskPatch {
  masterId?: string | undefined;
  assistantId?: string | null | undefined;
  instruction?: string | undefined;
}

export interface TaskPhotoUpload {
  mediaId: string;
  kind: TaskPhotoKind;
  bytes: Uint8Array;
}

export interface TasksService {
  /** The masters the admin may give a task to. */
  masters(actor: StaffActor): Promise<MasterRef[]>;
  list(
    actor: StaffActor,
    query: { tab?: AdminTaskTab | undefined; orderId?: string | undefined },
  ): Promise<AdminTaskSummary[]>;
  get(actor: StaffActor, id: string): Promise<AdminTask>;
  create(actor: StaffActor, orderId: string, input: NewTask, ip?: string): Promise<AdminTask>;
  /** Another master, another helper or another instruction. */
  update(actor: StaffActor, id: string, patch: TaskPatch, ip?: string): Promise<AdminTask>;
  accept(actor: StaffActor, id: string, ip?: string): Promise<AdminTask>;
  rework(actor: StaffActor, id: string, remark: string, ip?: string): Promise<AdminTask>;

  forMaster(master: MasterActor, tab: MasterTaskTab): Promise<MasterTaskSummary[]>;
  taskForMaster(master: MasterActor, id: string): Promise<MasterTask>;
  /** Starting twice is harmless: the second answer is the task as it is. */
  start(master: MasterActor, id: string): Promise<MasterTask>;
  putPhoto(master: MasterActor, id: string, upload: TaskPhotoUpload): Promise<PhotoLink>;
  deletePhoto(master: MasterActor, id: string, mediaId: string): Promise<void>;
  /** Handing the report in twice is harmless too: a phone that was offline may repeat it. */
  submit(master: MasterActor, id: string, comment: string): Promise<MasterTask>;
}

type TaskRow = typeof tasks.$inferSelect;

const PHOTO_KIND: Record<string, TaskPhotoKind> = { task_before: 'before', task_after: 'after' };

export function createTasksService(deps: TasksDeps): TasksService {
  const { db, clock, audit, outbox, media, orders: ordersService, staff } = deps;

  async function lockTask(tx: Tx, id: string, masterId?: string): Promise<TaskRow> {
    const [row] = await tx.select().from(tasks).where(eq(tasks.id, id)).for('update');
    // Another master's task does not exist for this one.
    if (!row || (masterId !== undefined && row.masterId !== masterId)) {
      throw new AppError('not_found');
    }
    return row;
  }

  async function taskOf(from: DbOrTx, id: string, masterId?: string): Promise<TaskRow> {
    const [row] = await from.select().from(tasks).where(eq(tasks.id, id));
    if (!row || (masterId !== undefined && row.masterId !== masterId)) {
      throw new AppError('not_found');
    }
    return row;
  }

  const itemsOf = (from: DbOrTx, taskIds: readonly string[]) =>
    taskIds.length === 0
      ? Promise.resolve([] as (typeof orderItems.$inferSelect)[])
      : from
          .select()
          .from(orderItems)
          .where(inArray(orderItems.taskId, [...taskIds]))
          .orderBy(asc(orderItems.createdAt), asc(orderItems.id));

  async function orderRef(from: DbOrTx, orderId: string) {
    const [order] = await from.select().from(orders).where(eq(orders.id, orderId));
    if (!order) throw new AppError('not_found');
    const snapshot = order.carSnapshot as { label: string; plate: string };
    return { orderId, number: order.number, car: snapshot.label, plate: snapshot.plate };
  }

  async function namesOf(from: DbOrTx, ids: readonly (string | null)[]) {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    const rows =
      wanted.length === 0
        ? []
        : await from
            .select({ id: users.id, fullName: users.fullName })
            .from(users)
            .where(inArray(users.id, wanted));
    return new Map(rows.map((row) => [row.id, row.fullName]));
  }

  /** An active master who can be given work. */
  async function requireMaster(from: DbOrTx, id: string, path: string): Promise<void> {
    const [row] = await from
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, 'master')))
      .where(and(eq(users.id, id), eq(users.isBlocked, false)));
    if (!row) throw invalidAt(path, 'not a master');
  }

  const toPhoto = (photo: Photo): TaskPhoto => ({
    mediaId: photo.id,
    url: media.link(photo.id),
    kind: PHOTO_KIND[photo.purpose] ?? 'after',
    attempt: photo.attempt ?? 1,
  });

  const afterCount = (photos: readonly Photo[]): number =>
    photos.filter((photo) => photo.purpose === 'task_after').length;

  // ---- the admin's view ------------------------------------------------------------------

  async function summaries(from: DbOrTx, rows: readonly TaskRow[]): Promise<AdminTaskSummary[]> {
    if (rows.length === 0) return [];
    const items = await itemsOf(
      from,
      rows.map((row) => row.id),
    );
    const orderIds = [...new Set(rows.map((row) => row.orderId))];
    const orderRows = await from.select().from(orders).where(inArray(orders.id, orderIds));
    const names = await namesOf(
      from,
      rows.flatMap((row) => [row.masterId, row.assistantId]),
    );
    return rows.map((row) => {
      const order = orderRows.find((candidate) => candidate.id === row.orderId);
      const snapshot = (order?.carSnapshot ?? { label: '', plate: '' }) as {
        label: string;
        plate: string;
      };
      return {
        id: row.id,
        orderId: row.orderId,
        orderNumber: order?.number ?? 0,
        status: row.status,
        car: { label: snapshot.label, plate: snapshot.plate },
        master: { id: row.masterId, fullName: names.get(row.masterId) ?? '' },
        assistant: row.assistantId
          ? { id: row.assistantId, fullName: names.get(row.assistantId) ?? '' }
          : null,
        items: items
          .filter((item) => item.taskId === row.id)
          .map((item) => ({
            id: item.id,
            nameUz: item.nameUz,
            nameRu: item.nameRu,
            durationMin: item.durationMin,
            comment: item.comment,
            price: item.price,
          })),
        instruction: row.instruction,
        normMinutes: row.normMinutes,
        startedAt: row.startedAt ? presentInstant(row.startedAt) : null,
        submittedAt: row.submittedAt ? presentInstant(row.submittedAt) : null,
        acceptedAt: row.acceptedAt ? presentInstant(row.acceptedAt) : null,
        reworkCount: row.reworkCount,
        lastRemark: row.lastRemark,
      };
    });
  }

  async function adminTask(from: DbOrTx, id: string): Promise<AdminTask> {
    const row = await taskOf(from, id);
    const [summary] = await summaries(from, [row]);
    if (!summary) throw new AppError('not_found');
    const photos = await media.ofTask(from, id);
    const reports = await from
      .select()
      .from(taskReports)
      .where(eq(taskReports.taskId, id))
      .orderBy(asc(taskReports.attempt));
    const attempts = Array.from({ length: attemptOf(row.reworkCount) }, (_, index) => {
      const attempt = index + 1;
      const report = reports.find((candidate) => candidate.attempt === attempt);
      return {
        attempt,
        photos: photos.filter((photo) => photo.attempt === attempt).map(toPhoto),
        comment: report?.comment ?? null,
        submittedAt: report ? presentInstant(report.submittedAt) : null,
        decision: report?.decision ?? null,
        remark: report?.remark ?? null,
        decidedAt: report?.decidedAt ? presentInstant(report.decidedAt) : null,
      };
    });
    return {
      ...summary,
      attempts,
      canAccept: row.status === 'on_review',
      canRework: row.status === 'on_review',
      canReassign: canReassign(row.status),
    };
  }

  // ---- the master's view -----------------------------------------------------------------

  async function masterSummaries(
    from: DbOrTx,
    rows: readonly TaskRow[],
  ): Promise<MasterTaskSummary[]> {
    const shown = await summaries(from, rows);
    const orderIds = [...new Set(rows.map((row) => row.orderId))];
    const held =
      orderIds.length === 0
        ? []
        : await from
            .select({ orderId: bookings.orderId, boxName: boxes.name })
            .from(bookings)
            .innerJoin(boxes, eq(boxes.id, bookings.boxId))
            .where(and(inArray(bookings.orderId, orderIds), isNull(bookings.releasedAt)));
    const now = clock.now();
    return shown.map((task) => ({
      id: task.id,
      orderNumber: task.orderNumber,
      status: task.status,
      car: task.car,
      // No prices: only what the master needs to know about each zone.
      items: task.items.map((item) => ({
        id: item.id,
        nameUz: item.nameUz,
        nameRu: item.nameRu,
        durationMin: item.durationMin,
        comment: item.comment,
      })),
      normMinutes: task.normMinutes,
      startedAt: task.startedAt,
      reworkCount: task.reworkCount,
      lastRemark: task.lastRemark,
      boxName: held.find((booking) => booking.orderId === task.orderId)?.boxName ?? null,
      elapsedSec:
        task.status === 'in_progress' && task.startedAt
          ? Math.max(0, Math.floor((now.getTime() - Date.parse(task.startedAt.at)) / 1000))
          : null,
    }));
  }

  async function masterTask(from: DbOrTx, row: TaskRow): Promise<MasterTask> {
    const [summary] = await masterSummaries(from, [row]);
    if (!summary) throw new AppError('not_found');
    const attempt = attemptOf(row.reworkCount);
    const photos = await media.ofTask(from, row.id, attempt);

    // What the client confirmed at reception, so the master is not blamed for it.
    const [act] = await from
      .select()
      .from(receptionActs)
      .where(eq(receptionActs.orderId, row.orderId));
    const confirmed = act?.status === 'confirmed';
    const defects = confirmed
      ? await from
          .select()
          .from(receptionDefects)
          .where(eq(receptionDefects.actId, act.id))
          .orderBy(asc(receptionDefects.sort), asc(receptionDefects.id))
      : [];

    return {
      ...summary,
      instruction: row.instruction,
      attempt,
      photos: photos.map(toPhoto),
      defects: defects.map((defect) => ({
        id: defect.id,
        view: defect.view,
        x: defect.x,
        y: defect.y,
        kind: defect.kind,
        note: defect.note,
        photo: defect.mediaId ? { mediaId: defect.mediaId, url: media.link(defect.mediaId) } : null,
      })),
      actConfirmedVia: confirmed ? act.confirmedVia : null,
      canStart: row.status === 'assigned',
      canPhoto: canTakePhotos(row.status),
      canSubmit: canSubmit(row.status, afterCount(photos)),
    };
  }

  async function tellMaster(
    tx: Tx,
    row: TaskRow,
    items: readonly TaskItem[],
    key: string,
  ): Promise<void> {
    await outbox.tell(
      tx,
      row.masterId,
      {
        type: 'staff.task_assigned',
        ...(await orderRef(tx, row.orderId)),
        taskId: row.id,
        items: items.map((item) => ({ uz: item.nameUz, ru: item.nameRu })),
        normMinutes: row.normMinutes,
        instruction: row.instruction,
      },
      key,
    );
  }

  return {
    async masters(actor) {
      requirePermission(actor, 'tasks.review');
      const rows = await db
        .select({ id: users.id, fullName: users.fullName, specialization: users.specialization })
        .from(users)
        .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, 'master')))
        .where(eq(users.isBlocked, false))
        .orderBy(asc(users.fullName), asc(users.id));
      return rows;
    },

    async list(actor, query) {
      requirePermission(actor, 'tasks.review');
      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            query.tab ? inArray(tasks.status, [...ADMIN_TAB_STATUSES[query.tab]]) : undefined,
            query.orderId ? eq(tasks.orderId, query.orderId) : undefined,
          ),
        )
        // The ones waiting longest to be checked come first.
        .orderBy(asc(tasks.submittedAt), desc(tasks.createdAt), asc(tasks.id))
        .limit(300);
      return summaries(db, rows);
    },

    async get(actor, id) {
      requirePermission(actor, 'tasks.review');
      return adminTask(db, id);
    },

    async create(actor, orderId, input, ip) {
      requirePermission(actor, 'tasks.review');
      await requireMaster(db, input.masterId, 'body.masterId');
      if (input.assistantId) {
        if (input.assistantId === input.masterId) {
          throw invalidAt('body.assistantId', 'the helper is not the master');
        }
        await requireMaster(db, input.assistantId, 'body.assistantId');
      }
      const id = await db.transaction(async (tx) => {
        const now = clock.now();
        const items = await ordersService.itemsForTask(tx, orderId, input.itemIds);
        const [created] = await tx
          .insert(tasks)
          .values({
            orderId,
            masterId: input.masterId,
            assistantId: input.assistantId ?? null,
            instruction: input.instruction,
            normMinutes: normOf(items),
            createdBy: actor.userId,
            createdAt: now,
          })
          .returning();
        if (!created) throw new Error('insert returned no row');
        await ordersService.attachItems(
          tx,
          items.map((item) => item.id),
          created.id,
        );
        await recordStatus(tx, {
          entity: 'task',
          entityId: created.id,
          from: null,
          to: 'assigned',
          actorId: actor.userId,
          at: now,
        });
        await tellMaster(tx, created, items, `task:${created.id}:assigned:${created.masterId}`);
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'task.create',
          entity: 'task',
          entityId: created.id,
          after: { masterId: input.masterId, items: items.length },
          ip: ip ?? null,
        });
        return created.id;
      });
      return adminTask(db, id);
    },

    async update(actor, id, patch, ip) {
      requirePermission(actor, 'tasks.review');
      if (patch.masterId !== undefined) await requireMaster(db, patch.masterId, 'body.masterId');
      if (patch.assistantId) await requireMaster(db, patch.assistantId, 'body.assistantId');
      await db.transaction(async (tx) => {
        const now = clock.now();
        const row = await lockTask(tx, id);
        const newMaster = patch.masterId !== undefined && patch.masterId !== row.masterId;
        if (newMaster && !canReassign(row.status)) throw new AppError('invalid_transition');
        if (!newMaster && !canAmend(row.status)) throw new AppError('invalid_transition');
        const masterId = patch.masterId ?? row.masterId;
        const assistantId = patch.assistantId === undefined ? row.assistantId : patch.assistantId;
        if (assistantId === masterId) {
          throw invalidAt('body.assistantId', 'the helper is not the master');
        }

        const [updated] = await tx
          .update(tasks)
          .set({
            masterId,
            assistantId,
            instruction: patch.instruction ?? row.instruction,
            // Given to someone else, the task starts over for them.
            ...(newMaster && { status: 'assigned' as const, startedAt: null }),
            updatedAt: now,
          })
          .where(eq(tasks.id, id))
          .returning();
        if (!updated) throw new AppError('not_found');
        if (newMaster) {
          await recordStatus(tx, {
            entity: 'task',
            entityId: id,
            from: row.status,
            to: 'assigned',
            actorId: actor.userId,
            comment: 'reassigned',
            at: now,
          });
          const items = (await itemsOf(tx, [id])).map((item) => ({
            id: item.id,
            nameUz: item.nameUz,
            nameRu: item.nameRu,
            durationMin: item.durationMin,
          }));
          await tellMaster(tx, updated, items, `task:${id}:assigned:${masterId}`);
        }
        await audit.record(tx, {
          actorId: actor.userId,
          action: newMaster ? 'task.reassign' : 'task.update',
          entity: 'task',
          entityId: id,
          before: { masterId: row.masterId, assistantId: row.assistantId },
          after: { masterId, assistantId },
          ip: ip ?? null,
        });
      });
      return adminTask(db, id);
    },

    async accept(actor, id, ip) {
      requirePermission(actor, 'tasks.review');
      await db.transaction(async (tx) => {
        const now = clock.now();
        const row = await lockTask(tx, id);
        if (!canTaskTransition(row.status, 'accepted', 'admin')) {
          throw new AppError('invalid_transition');
        }
        await tx
          .update(tasks)
          .set({ status: 'accepted', acceptedAt: now, updatedAt: now })
          .where(and(eq(tasks.id, id), eq(tasks.status, 'on_review')));
        await tx
          .update(taskReports)
          .set({ decision: 'accepted', decidedBy: actor.userId, decidedAt: now })
          .where(
            and(eq(taskReports.taskId, id), eq(taskReports.attempt, attemptOf(row.reworkCount))),
          );
        await recordStatus(tx, {
          entity: 'task',
          entityId: id,
          from: 'on_review',
          to: 'accepted',
          actorId: actor.userId,
          at: now,
        });
        // The last accepted task makes the order ready, in this same transaction.
        await ordersService.onTasksChanged(tx, row.orderId);
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'task.accept',
          entity: 'task',
          entityId: id,
          ip: ip ?? null,
        });
      });
      return adminTask(db, id);
    },

    async rework(actor, id, remark, ip) {
      requirePermission(actor, 'tasks.review');
      const text = remark.trim();
      if (text === '') throw invalidAt('body.remark', 'a remark is needed');
      await db.transaction(async (tx) => {
        const now = clock.now();
        const row = await lockTask(tx, id);
        if (!canTaskTransition(row.status, 'rework', 'admin')) {
          throw new AppError('invalid_transition');
        }
        const [updated] = await tx
          .update(tasks)
          .set({
            status: 'rework',
            reworkCount: row.reworkCount + 1,
            lastRemark: text,
            updatedAt: now,
          })
          .where(and(eq(tasks.id, id), eq(tasks.status, 'on_review')))
          .returning();
        if (!updated) throw new AppError('invalid_transition');
        await tx
          .update(taskReports)
          .set({ decision: 'rework', remark: text, decidedBy: actor.userId, decidedAt: now })
          .where(
            and(eq(taskReports.taskId, id), eq(taskReports.attempt, attemptOf(row.reworkCount))),
          );
        await recordStatus(tx, {
          entity: 'task',
          entityId: id,
          from: 'on_review',
          to: 'rework',
          actorId: actor.userId,
          comment: text,
          at: now,
        });
        await outbox.tell(
          tx,
          row.masterId,
          {
            type: 'staff.task_rework',
            ...(await orderRef(tx, row.orderId)),
            taskId: id,
            remark: text,
          },
          `task:${id}:rework:${updated.reworkCount}`,
        );
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'task.rework',
          entity: 'task',
          entityId: id,
          ip: ip ?? null,
        });
      });
      return adminTask(db, id);
    },

    async forMaster(master, tab) {
      const rows = await db
        .select()
        .from(tasks)
        // Only the master's own: the filter is in the query, not in the screen.
        .where(
          and(
            eq(tasks.masterId, master.userId),
            inArray(tasks.status, [...MASTER_TAB_STATUSES[tab]]),
          ),
        )
        .orderBy(desc(tasks.createdAt), asc(tasks.id))
        .limit(200);
      return masterSummaries(db, rows);
    },

    async taskForMaster(master, id) {
      return masterTask(db, await taskOf(db, id, master.userId));
    },

    async start(master, id) {
      await db.transaction(async (tx) => {
        const now = clock.now();
        const row = await lockTask(tx, id, master.userId);
        if (row.status === 'in_progress') return;
        if (!canTaskTransition(row.status, 'in_progress', 'master')) {
          throw new AppError('invalid_transition');
        }
        await tx
          .update(tasks)
          .set({ status: 'in_progress', startedAt: now, updatedAt: now })
          .where(and(eq(tasks.id, id), eq(tasks.status, 'assigned')));
        await recordStatus(tx, {
          entity: 'task',
          entityId: id,
          from: 'assigned',
          to: 'in_progress',
          actorId: master.userId,
          at: now,
        });
      });
      return masterTask(db, await taskOf(db, id, master.userId));
    },

    async putPhoto(master, id, upload) {
      return db.transaction(async (tx) => {
        const row = await lockTask(tx, id, master.userId);
        // A photo that is already kept (the phone sent it again) is answered as it was; the same id
        // for another meaning goes on to be refused by the media module.
        const known = await media.find(tx, upload.mediaId);
        const purpose = upload.kind === 'before' ? 'task_before' : 'task_after';
        if (known?.taskId === id && known.purpose === purpose) {
          return { mediaId: known.id, url: media.link(known.id) };
        }

        if (!canTakePhotos(row.status)) throw new AppError('invalid_transition');
        const attempt = attemptOf(row.reworkCount);
        if ((await media.ofTask(tx, id, attempt)).length >= LIMITS.taskPhotos.max) {
          throw new AppError('validation', 'too many photos');
        }
        const photo = await media.put(tx, {
          id: upload.mediaId,
          purpose: upload.kind === 'before' ? 'task_before' : 'task_after',
          side: null,
          owner: { kind: 'task', taskId: id, attempt },
          bytes: upload.bytes,
          uploadedBy: master.userId,
        });
        return { mediaId: photo.id, url: media.link(photo.id) };
      });
    },

    async deletePhoto(master, id, mediaId) {
      await db.transaction(async (tx) => {
        const row = await lockTask(tx, id, master.userId);
        const photo = await media.find(tx, mediaId);
        // Already gone, or not this task's: nothing to remove.
        if (!photo || photo.taskId !== id) return;
        if (!canTakePhotos(row.status) || photo.attempt !== attemptOf(row.reworkCount)) {
          throw new AppError('invalid_transition');
        }
        await media.remove(tx, mediaId);
      });
    },

    async submit(master, id, comment) {
      await db.transaction(async (tx) => {
        const now = clock.now();
        const row = await lockTask(tx, id, master.userId);
        // The phone may repeat it after a lost answer: the report is already in.
        if (row.status === 'on_review') return;
        if (!canTaskTransition(row.status, 'on_review', 'master')) {
          throw new AppError('invalid_transition');
        }
        const attempt = attemptOf(row.reworkCount);
        const photos = await media.ofTask(tx, id, attempt);
        if (afterCount(photos) < 1) throw new AppError('photo_required');

        await tx.insert(taskReports).values({
          taskId: id,
          attempt,
          comment: comment.trim(),
          submittedAt: now,
        });
        await tx
          .update(tasks)
          .set({ status: 'on_review', submittedAt: now, updatedAt: now })
          .where(and(eq(tasks.id, id), inArray(tasks.status, ['in_progress', 'rework'])));
        await recordStatus(tx, {
          entity: 'task',
          entityId: id,
          from: row.status,
          to: 'on_review',
          actorId: master.userId,
          at: now,
        });
        const ref = await orderRef(tx, row.orderId);
        for (const admin of await staff.recipients(tx, ['admin', 'owner'])) {
          await outbox.enqueue(tx, {
            to: admin,
            notification: {
              type: 'staff.report_submitted',
              ...ref,
              taskId: id,
              masterName: master.fullName,
              attempt,
            },
            dedupeKey: `task:${id}:report:${attempt}:${admin.userId}`,
          });
        }
      });
      return masterTask(db, await taskOf(db, id, master.userId));
    },
  };
}
