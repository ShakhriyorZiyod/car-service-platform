import type {
  ActDraft,
  AdminAct,
  AdminOrder,
  ClientAct,
  PhotoLink,
  ReceptionAct,
} from '@cs/shared';
import { LIMITS, PHOTO_SIDES, type ActConfirmChannel, type PhotoSide } from '@cs/shared/vocabulary';
import { and, asc, eq } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../../../db/client';
import { orders, receptionActs, receptionDefects } from '../../../db/schema';
import { presentInstant } from '../../../lib/time';
import { requirePermission, type ClientActor, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError, invalidAt } from '../../../platform/errors';
import type { Outbox } from '../../../platform/outbox';
import type { AuditService } from '../../audit';
import type { MediaService, Photo } from '../../media';
import {
  actActions,
  canActTransition,
  canClientConfirm,
  missingForSend,
  type ActMissing,
} from '../domain/act';

/**
 * The reception act (docs/PLAN.md, sections 7.9 and 9.4): the admin fills it in when the car
 * arrives, sends it to the client, and the client (or the admin, for a verbal agreement) confirms.
 * Only then can the order go to work.
 */

/** What reception needs from the orders module. */
export interface OrdersForReception {
  get(actor: StaffActor, id: string): Promise<AdminOrder>;
  startWorkInside(tx: Tx, actor: StaffActor, id: string): Promise<void>;
}

export interface ReceptionDeps extends PlatformDeps {
  audit: AuditService;
  outbox: Outbox;
  media: MediaService;
  orders: OrdersForReception;
}

export interface ActPhotoUpload {
  mediaId: string;
  purpose: 'side' | 'defect';
  side?: PhotoSide | undefined;
  bytes: Uint8Array;
}

export interface ReceptionService {
  /** The order's act (none yet) and what may be done with it; read-only roles may look. */
  get(actor: StaffActor, orderId: string): Promise<AdminAct>;
  /** Saves the draft; the defects are the whole list. Changing a sent act takes it back to a draft. */
  save(actor: StaffActor, orderId: string, draft: ActDraft): Promise<AdminAct>;
  /** A photo of a side or of a defect, sent as bytes; sending it again keeps one. */
  putPhoto(actor: StaffActor, orderId: string, upload: ActPhotoUpload): Promise<PhotoLink>;
  send(actor: StaffActor, orderId: string, ip?: string): Promise<AdminAct>;
  /** The client agreed in person or by phone, and the admin writes it down. */
  confirmVerbal(actor: StaffActor, orderId: string, ip?: string): Promise<AdminAct>;
  /** The act is confirmed: the order goes to "in work" and the masters get their tasks. */
  startWork(actor: StaffActor, orderId: string, ip?: string): Promise<AdminOrder>;
  /** The act as the client sees it: only once it has been sent. */
  forClient(client: ClientActor, orderId: string): Promise<ClientAct>;
  /** The client confirms (in the bot or in the app); repeating it is harmless. */
  confirmByClient(
    client: ClientActor,
    orderId: string,
    via: Exclude<ActConfirmChannel, 'verbal'>,
  ): Promise<ClientAct>;
}

type OrderRow = typeof orders.$inferSelect;
type ActRow = typeof receptionActs.$inferSelect;

export function createReceptionService(deps: ReceptionDeps): ReceptionService {
  const { db, clock, audit, outbox, media, orders: ordersService } = deps;

  async function lockOrder(tx: DbOrTx, id: string, clientId?: string): Promise<OrderRow> {
    const [row] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
    // Somebody else's order does not exist for them.
    if (!row || (clientId !== undefined && row.clientId !== clientId)) {
      throw new AppError('not_found');
    }
    return row;
  }

  async function actOf(from: DbOrTx, orderId: string): Promise<ActRow | null> {
    const [row] = await from.select().from(receptionActs).where(eq(receptionActs.orderId, orderId));
    return row ?? null;
  }

  async function ensureAct(tx: Tx, orderId: string, actorId: string): Promise<ActRow> {
    const existing = await actOf(tx, orderId);
    if (existing) return existing;
    const [created] = await tx
      .insert(receptionActs)
      .values({ orderId, createdBy: actorId, createdAt: clock.now() })
      .returning();
    if (!created) throw new Error('insert returned no row');
    return created;
  }

  const sidesOf = (photos: readonly Photo[]): PhotoSide[] =>
    photos.flatMap((photo) =>
      photo.purpose === 'reception_side' && photo.side ? [photo.side] : [],
    );

  async function missingOf(from: DbOrTx, act: ActRow): Promise<ActMissing[]> {
    return missingForSend({
      mileageKm: act.mileageKm,
      fuelLevel: act.fuelLevel,
      photographedSides: sidesOf(await media.ofAct(from, act.id)),
    });
  }

  /** The act with its photos as signed links. */
  async function view(from: DbOrTx, act: ActRow): Promise<ReceptionAct> {
    const photos = await media.ofAct(from, act.id);
    const defects = await from
      .select()
      .from(receptionDefects)
      .where(eq(receptionDefects.actId, act.id))
      .orderBy(asc(receptionDefects.sort), asc(receptionDefects.id));
    const link = (id: string): PhotoLink => ({ mediaId: id, url: media.link(id) });
    const checklist = act.checklist as ReceptionAct['checklist'];
    return {
      status: act.status,
      mileageKm: act.mileageKm,
      fuelLevel: act.fuelLevel,
      checklist,
      personalItems: act.personalItems,
      sides: PHOTO_SIDES.flatMap((side) => {
        const photo = photos.find((p) => p.purpose === 'reception_side' && p.side === side);
        return photo ? [{ side, ...link(photo.id) }] : [];
      }),
      defects: defects.map((defect) => ({
        id: defect.id,
        view: defect.view,
        x: defect.x,
        y: defect.y,
        kind: defect.kind,
        note: defect.note,
        photo: defect.mediaId ? link(defect.mediaId) : null,
      })),
      sentAt: act.sentAt ? presentInstant(act.sentAt) : null,
      confirmedAt: act.confirmedAt ? presentInstant(act.confirmedAt) : null,
      confirmedVia: act.confirmedVia,
      missing: sidesOfMissing(photos, act),
    };
  }

  const sidesOfMissing = (photos: readonly Photo[], act: ActRow): ActMissing[] =>
    missingForSend({
      mileageKm: act.mileageKm,
      fuelLevel: act.fuelLevel,
      photographedSides: sidesOf(photos),
    });

  /** `writer` false: who may only look is shown no buttons, the server says what may be done. */
  async function adminView(from: DbOrTx, order: OrderRow, writer = true): Promise<AdminAct> {
    const act = await actOf(from, order.id);
    const shown = act ? await view(from, act) : null;
    const actions = actActions({
      orderStatus: order.status,
      status: act?.status ?? null,
      missing: shown?.missing ?? [],
    });
    return {
      act: shown,
      ...(writer
        ? actions
        : { canEdit: false, canSend: false, canConfirmVerbal: false, canStartWork: false }),
    };
  }

  /** A change to a sent act makes it a draft again: what the client was asked to confirm is gone. */
  async function reopen(tx: Tx, act: ActRow): Promise<void> {
    if (act.status === 'sent') {
      await tx
        .update(receptionActs)
        .set({ status: 'draft', sentAt: null, updatedAt: clock.now() })
        .where(eq(receptionActs.id, act.id));
    }
  }

  /** The act can be changed: the car is here, and the client has not signed. */
  function requireEditable(order: OrderRow, act: ActRow | null): void {
    if (order.status !== 'confirmed' || act?.status === 'confirmed') {
      throw new AppError('invalid_transition');
    }
  }

  return {
    async get(actor, orderId) {
      requirePermission(actor, 'orders.read');
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) throw new AppError('not_found');
      return adminView(db, order, actor.permissions.has('reception.write'));
    },

    async save(actor, orderId, draft) {
      requirePermission(actor, 'reception.write');
      return db.transaction(async (tx) => {
        const now = clock.now();
        const order = await lockOrder(tx, orderId);
        requireEditable(order, await actOf(tx, orderId));
        const act = await ensureAct(tx, orderId, actor.userId);

        // Every photo of a defect must be one uploaded for this act, and used once.
        const photos = await media.ofAct(tx, act.id);
        const defectPhotos = new Set(
          photos.filter((photo) => photo.purpose === 'reception_defect').map((photo) => photo.id),
        );
        const used = new Set<string>();
        draft.defects.forEach((defect, index) => {
          if (defect.mediaId === null) return;
          if (!defectPhotos.has(defect.mediaId) || used.has(defect.mediaId)) {
            throw invalidAt(`body.defects.${index}.mediaId`, 'unknown or repeated photo');
          }
          used.add(defect.mediaId);
        });

        await tx.delete(receptionDefects).where(eq(receptionDefects.actId, act.id));
        if (draft.defects.length > 0) {
          await tx.insert(receptionDefects).values(
            draft.defects.map((defect, index) => ({
              actId: act.id,
              view: defect.view,
              x: defect.x,
              y: defect.y,
              kind: defect.kind,
              note: defect.note,
              mediaId: defect.mediaId,
              sort: index,
            })),
          );
        }
        // A photo of a defect that is no longer in the list goes with it.
        for (const id of defectPhotos) if (!used.has(id)) await media.remove(tx, id);

        const checklist = Object.fromEntries(
          Object.entries(draft.checklist).filter(([, present]) => present !== undefined),
        );
        await tx
          .update(receptionActs)
          .set({
            mileageKm: draft.mileageKm,
            fuelLevel: draft.fuelLevel,
            checklist,
            personalItems: draft.personalItems,
            ...(act.status === 'sent' && { status: 'draft' as const, sentAt: null }),
            updatedAt: now,
          })
          .where(eq(receptionActs.id, act.id));
        return adminView(tx, order);
      });
    },

    async putPhoto(actor, orderId, upload) {
      requirePermission(actor, 'reception.write');
      return db.transaction(async (tx) => {
        const order = await lockOrder(tx, orderId);
        requireEditable(order, await actOf(tx, orderId));
        const act = await ensureAct(tx, orderId, actor.userId);
        if (upload.purpose === 'defect') {
          const taken = (await media.ofAct(tx, act.id)).filter(
            (photo) => photo.purpose === 'reception_defect',
          );
          // A photo sent again does not count twice.
          if (taken.length >= LIMITS.defects.max && !taken.some((p) => p.id === upload.mediaId)) {
            throw new AppError('validation', 'too many photos');
          }
        }
        const photo = await media.put(tx, {
          id: upload.mediaId,
          purpose: upload.purpose === 'side' ? 'reception_side' : 'reception_defect',
          side: upload.purpose === 'side' ? (upload.side ?? null) : null,
          owner: { kind: 'act', actId: act.id },
          bytes: upload.bytes,
          uploadedBy: actor.userId,
        });
        await reopen(tx, act);
        return { mediaId: photo.id, url: media.link(photo.id) };
      });
    },

    async send(actor, orderId, ip) {
      requirePermission(actor, 'reception.write');
      return db.transaction(async (tx) => {
        const now = clock.now();
        const order = await lockOrder(tx, orderId);
        const act = await actOf(tx, orderId);
        requireEditable(order, act);
        if (!act || !canActTransition(act.status, 'sent', 'admin')) {
          throw new AppError('invalid_transition');
        }
        const photos = await media.ofAct(tx, act.id);
        const missing = sidesOfMissing(photos, act);
        if (missing.length > 0) {
          throw new AppError('act_incomplete', 'the act lacks something', {
            paths: missing.map((item) => `act.${item}`),
          });
        }
        await tx
          .update(receptionActs)
          .set({ status: 'sent', sentAt: now, updatedAt: now })
          .where(and(eq(receptionActs.id, act.id), eq(receptionActs.status, 'draft')));
        const car = order.carSnapshot as { label: string; plate: string };
        await outbox.tell(
          tx,
          order.clientId,
          {
            type: 'act.confirm_request',
            orderId: order.id,
            number: order.number,
            car: car.label,
            plate: car.plate,
            mileageKm: act.mileageKm ?? 0,
            fuelLevel: act.fuelLevel ?? 0,
            defects: (
              await tx.select().from(receptionDefects).where(eq(receptionDefects.actId, act.id))
            ).length,
            photos: photos.length,
          },
          `act:${act.id}:${now.toISOString()}`,
        );
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'act.send',
          entity: 'order',
          entityId: orderId,
          ip: ip ?? null,
        });
        return adminView(tx, order);
      });
    },

    async confirmVerbal(actor, orderId, ip) {
      requirePermission(actor, 'reception.write');
      return db.transaction(async (tx) => {
        const now = clock.now();
        const order = await lockOrder(tx, orderId);
        const act = await actOf(tx, orderId);
        requireEditable(order, act);
        if (!act || !canActTransition(act.status, 'confirmed', 'admin')) {
          throw new AppError('invalid_transition');
        }
        // A verbal agreement is to the same act: it must be complete.
        const missing = await missingOf(tx, act);
        if (missing.length > 0) {
          throw new AppError('act_incomplete', 'the act lacks something', {
            paths: missing.map((item) => `act.${item}`),
          });
        }
        await tx
          .update(receptionActs)
          .set({
            status: 'confirmed',
            sentAt: act.sentAt ?? now,
            confirmedAt: now,
            confirmedVia: 'verbal',
            confirmedBy: actor.userId,
            updatedAt: now,
          })
          .where(eq(receptionActs.id, act.id));
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'act.confirm_verbal',
          entity: 'order',
          entityId: orderId,
          ip: ip ?? null,
        });
        return adminView(tx, order);
      });
    },

    async startWork(actor, orderId, ip) {
      requirePermission(actor, 'reception.write');
      await db.transaction(async (tx) => {
        await lockOrder(tx, orderId);
        const act = await actOf(tx, orderId);
        if (act?.status !== 'confirmed') throw new AppError('act_not_confirmed');
        await ordersService.startWorkInside(tx, actor, orderId);
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'order.start_work',
          entity: 'order',
          entityId: orderId,
          ip: ip ?? null,
        });
      });
      return ordersService.get(actor, orderId);
    },

    async forClient(client, orderId) {
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order || order.clientId !== client.userId) throw new AppError('not_found');
      const act = await actOf(db, orderId);
      // The client sees an act only once it has been sent to them.
      if (!act || act.status === 'draft') return { act: null, canConfirm: false };
      return {
        act: await view(db, act),
        canConfirm: canClientConfirm(order.status, act.status),
      };
    },

    async confirmByClient(client, orderId, via) {
      return db.transaction(async (tx) => {
        const now = clock.now();
        const order = await lockOrder(tx, orderId, client.userId);
        const act = await actOf(tx, orderId);
        if (!act || act.status === 'draft') throw new AppError('invalid_transition');
        if (act.status === 'confirmed') {
          return { act: await view(tx, act), canConfirm: false };
        }
        if (!canClientConfirm(order.status, act.status)) throw new AppError('invalid_transition');
        const [updated] = await tx
          .update(receptionActs)
          .set({ status: 'confirmed', confirmedAt: now, confirmedVia: via, updatedAt: now })
          .where(and(eq(receptionActs.id, act.id), eq(receptionActs.status, 'sent')))
          .returning();
        if (!updated) throw new AppError('invalid_transition');
        return { act: await view(tx, updated), canConfirm: false };
      });
    },
  };
}
