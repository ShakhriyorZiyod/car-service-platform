import type { PhotoLink, StockDocument, StockDocumentSummary } from '@cs/shared';
import type {
  ManualDocumentKind,
  StockDocumentKind,
  StockDocumentStatus,
  WriteOffReason,
} from '@cs/shared/vocabulary';
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOrTx, Tx } from '../../../db/client';
import {
  products,
  stockDocumentLines,
  stockDocuments,
  stockLevels,
  stockMovements,
  suppliers,
  users,
} from '../../../db/schema';
import { presentInstant } from '../../../lib/time';
import { requirePermission, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError, invalidAt } from '../../../platform/errors';
import type { AuditService } from '../../audit';
import type { MediaService } from '../../media';
import {
  averageCostAfterReceipt,
  lineProblems,
  lineSum,
  movementOf,
  postProblems,
  roundQty,
  type LineInput,
} from '../domain/stock';

/**
 * Warehouse documents (docs/PLAN.md, section 9.6): a receipt, a write-off or an inventory is
 * written as a draft and changes the stock only when it is posted. A posted document stays as it
 * is; a mistake is fixed with a new one.
 */

export interface DocumentsServiceDeps extends PlatformDeps {
  audit: AuditService;
  media: MediaService;
}

export interface DocumentInput {
  supplierId: string | null;
  invoiceNo: string | null;
  invoiceDate: string | null;
  reason: WriteOffReason | null;
  note: string | null;
  lines: LineInput[];
}

export interface DocumentQuery {
  kind?: StockDocumentKind | undefined;
  status?: StockDocumentStatus | undefined;
  cursor?: string | undefined;
  limit: number;
}

export interface DocumentsService {
  list(
    actor: StaffActor,
    query: DocumentQuery,
  ): Promise<{ items: StockDocumentSummary[]; nextCursor: string | null }>;
  get(actor: StaffActor, id: string): Promise<StockDocument>;
  create(
    actor: StaffActor,
    input: DocumentInput & { kind: ManualDocumentKind },
    ip?: string,
  ): Promise<StockDocument>;
  update(actor: StaffActor, id: string, input: DocumentInput, ip?: string): Promise<StockDocument>;
  remove(actor: StaffActor, id: string, ip?: string): Promise<void>;
  post(actor: StaffActor, id: string, ip?: string): Promise<StockDocument>;
  putInvoicePhoto(
    actor: StaffActor,
    id: string,
    upload: { mediaId: string; bytes: Uint8Array },
  ): Promise<PhotoLink>;
}

type DocumentRow = typeof stockDocuments.$inferSelect;

const creators = alias(users, 'creators');
const posters = alias(users, 'posters');

/** A receipt names its supplier and invoice; a write-off its reason; an inventory neither. */
function headerProblems(kind: StockDocumentKind, input: DocumentInput): string[] {
  const problems: string[] = [];
  if (kind !== 'receipt') {
    if (input.supplierId !== null) problems.push('body.supplierId');
    if (input.invoiceNo !== null) problems.push('body.invoiceNo');
    if (input.invoiceDate !== null) problems.push('body.invoiceDate');
  }
  if (kind !== 'write_off' && input.reason !== null) problems.push('body.reason');
  return problems;
}

export function createDocumentsService(deps: DocumentsServiceDeps): DocumentsService {
  const { db, clock, audit, media: photos } = deps;

  async function documentView(from: DbOrTx, id: string): Promise<StockDocument> {
    const [row] = await from
      .select({
        document: stockDocuments,
        supplierName: suppliers.name,
        createdBy: creators.fullName,
        postedBy: posters.fullName,
      })
      .from(stockDocuments)
      .leftJoin(suppliers, eq(suppliers.id, stockDocuments.supplierId))
      .innerJoin(creators, eq(creators.id, stockDocuments.createdBy))
      .leftJoin(posters, eq(posters.id, stockDocuments.postedBy))
      .where(eq(stockDocuments.id, id));
    if (!row) throw new AppError('not_found');
    const { document } = row;
    const lines = await from
      .select({
        line: stockDocumentLines,
        product: {
          sku: products.sku,
          nameUz: products.nameUz,
          nameRu: products.nameRu,
          unit: products.unit,
        },
        level: { onHand: stockLevels.onHand, reserved: stockLevels.reserved },
      })
      .from(stockDocumentLines)
      .innerJoin(products, eq(products.id, stockDocumentLines.productId))
      .innerJoin(stockLevels, eq(stockLevels.productId, stockDocumentLines.productId))
      .where(eq(stockDocumentLines.documentId, id))
      .orderBy(asc(stockDocumentLines.id));
    const [invoice] =
      document.kind === 'receipt' ? await photos.ofStockDocument(from, document.id) : [];
    const isDraft = document.status === 'draft';
    return {
      id: document.id,
      number: document.number,
      kind: document.kind,
      status: document.status,
      supplier:
        document.supplierId && row.supplierName
          ? { id: document.supplierId, name: row.supplierName }
          : null,
      invoiceNo: document.invoiceNo,
      invoiceDate: document.invoiceDate,
      reason: document.reason,
      note: document.note,
      invoicePhoto: invoice ? { mediaId: invoice.id, url: photos.link(invoice.id) } : null,
      lines: lines.map(({ line, product, level }) => {
        // A draft shows what posting would do; a posted document is history and shows none.
        const after =
          isDraft && document.kind !== 'sale'
            ? roundQty(level.onHand + movementOf(document.kind, line.qty, level).delta)
            : null;
        return {
          productId: line.productId,
          sku: product.sku,
          nameUz: product.nameUz,
          nameRu: product.nameRu,
          unit: product.unit,
          qty: line.qty,
          unitCost: line.unitCost,
          expectedQty: line.expectedQty,
          onHandNow: isDraft ? level.onHand : null,
          onHandAfter: after,
        };
      }),
      total:
        document.kind === 'receipt'
          ? lines.reduce((sum, { line }) => sum + lineSum(line.qty, line.unitCost ?? 0), 0)
          : null,
      createdAt: presentInstant(document.createdAt),
      createdBy: row.createdBy,
      postedAt: document.postedAt ? presentInstant(document.postedAt) : null,
      postedBy: row.postedBy,
    };
  }

  /** What the audit log keeps of a document: its header and lines, not the links of the moment. */
  const auditOf = ({ invoicePhoto: _photo, lines, ...header }: StockDocument) => ({
    ...header,
    lines: lines.map(({ onHandNow: _now, onHandAfter: _after, ...line }) => line),
  });

  async function lockedDraft(tx: Tx, id: string): Promise<DocumentRow> {
    const [row] = await tx
      .select()
      .from(stockDocuments)
      .where(eq(stockDocuments.id, id))
      .for('update');
    if (!row) throw new AppError('not_found');
    if (row.status !== 'draft') throw new AppError('invalid_transition', 'the document is posted');
    return row;
  }

  /** Checks the lines against the products and writes them: the whole list every time. */
  async function writeLines(
    tx: Tx,
    documentId: string,
    kind: StockDocumentKind,
    lines: readonly LineInput[],
  ): Promise<void> {
    const ids = [...new Set(lines.map((line) => line.productId))];
    const known =
      ids.length === 0
        ? []
        : await tx
            .select({ id: products.id, unit: products.unit, isActive: products.isActive })
            .from(products)
            .where(inArray(products.id, ids));
    const problems = lineProblems(kind, lines, new Map(known.map((row) => [row.id, row])));
    if (problems.length > 0)
      throw new AppError('validation', 'document lines', { paths: problems });
    await tx.delete(stockDocumentLines).where(eq(stockDocumentLines.documentId, documentId));
    if (lines.length > 0) {
      await tx.insert(stockDocumentLines).values(
        lines.map((line) => ({
          documentId,
          productId: line.productId,
          qty: line.qty,
          unitCost: line.unitCost,
        })),
      );
    }
  }

  async function checkSupplier(tx: Tx, supplierId: string | null): Promise<void> {
    if (supplierId === null) return;
    const [row] = await tx
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId));
    if (!row) throw invalidAt('body.supplierId', 'no such supplier');
  }

  return {
    async list(actor, query) {
      requirePermission(actor, 'stock.read');
      const rows = await db
        .select({ document: stockDocuments, supplierName: suppliers.name })
        .from(stockDocuments)
        .leftJoin(suppliers, eq(suppliers.id, stockDocuments.supplierId))
        .where(
          and(
            query.kind ? eq(stockDocuments.kind, query.kind) : undefined,
            query.status ? eq(stockDocuments.status, query.status) : undefined,
            // UUID v7 ids grow with time, so the id is also the order.
            query.cursor ? lt(stockDocuments.id, query.cursor) : undefined,
          ),
        )
        .orderBy(desc(stockDocuments.id))
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      const ids = page.map((row) => row.document.id);
      const lines =
        ids.length === 0
          ? []
          : await db
              .select({
                documentId: stockDocumentLines.documentId,
                qty: stockDocumentLines.qty,
                unitCost: stockDocumentLines.unitCost,
              })
              .from(stockDocumentLines)
              .where(inArray(stockDocumentLines.documentId, ids));
      return {
        items: page.map(({ document, supplierName }) => {
          const own = lines.filter((line) => line.documentId === document.id);
          return {
            id: document.id,
            number: document.number,
            kind: document.kind,
            status: document.status,
            supplier:
              document.supplierId && supplierName
                ? { id: document.supplierId, name: supplierName }
                : null,
            invoiceNo: document.invoiceNo,
            reason: document.reason,
            total:
              document.kind === 'receipt'
                ? own.reduce((sum, line) => sum + lineSum(line.qty, line.unitCost ?? 0), 0)
                : null,
            createdAt: presentInstant(document.createdAt),
            postedAt: document.postedAt ? presentInstant(document.postedAt) : null,
            lineCount: own.length,
          };
        }),
        nextCursor: rows.length > query.limit ? (page.at(-1)?.document.id ?? null) : null,
      };
    },

    async get(actor, id) {
      requirePermission(actor, 'stock.read');
      return documentView(db, id);
    },

    async create(actor, input, ip) {
      requirePermission(actor, 'stock.write');
      const problems = headerProblems(input.kind, input);
      if (problems.length > 0) throw new AppError('validation', 'document', { paths: problems });
      return db.transaction(async (tx) => {
        await checkSupplier(tx, input.supplierId);
        const [row] = await tx
          .insert(stockDocuments)
          .values({
            kind: input.kind,
            supplierId: input.supplierId,
            invoiceNo: input.invoiceNo,
            invoiceDate: input.invoiceDate,
            reason: input.reason,
            note: input.note,
            createdBy: actor.userId,
          })
          .returning({ id: stockDocuments.id });
        if (!row) throw new Error('insert returned no row');
        await writeLines(tx, row.id, input.kind, input.lines);
        const document = await documentView(tx, row.id);
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'stock_document.create',
          entity: 'stock_document',
          entityId: row.id,
          after: auditOf(document),
          ip: ip ?? null,
        });
        return document;
      });
    },

    async update(actor, id, input, ip) {
      requirePermission(actor, 'stock.write');
      return db.transaction(async (tx) => {
        const row = await lockedDraft(tx, id);
        const problems = headerProblems(row.kind, input);
        if (problems.length > 0) throw new AppError('validation', 'document', { paths: problems });
        await checkSupplier(tx, input.supplierId);
        const before = auditOf(await documentView(tx, id));
        await tx
          .update(stockDocuments)
          .set({
            supplierId: input.supplierId,
            invoiceNo: input.invoiceNo,
            invoiceDate: input.invoiceDate,
            reason: input.reason,
            note: input.note,
            updatedAt: clock.now(),
          })
          .where(eq(stockDocuments.id, id));
        await writeLines(tx, id, row.kind, input.lines);
        const document = await documentView(tx, id);
        const after = auditOf(document);
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          await audit.record(tx, {
            actorId: actor.userId,
            action: 'stock_document.update',
            entity: 'stock_document',
            entityId: id,
            before,
            after,
            ip: ip ?? null,
          });
        }
        return document;
      });
    },

    async remove(actor, id, ip) {
      requirePermission(actor, 'stock.write');
      await db.transaction(async (tx) => {
        await lockedDraft(tx, id);
        const before = auditOf(await documentView(tx, id));
        for (const photo of await photos.ofStockDocument(tx, id)) await photos.remove(tx, photo.id);
        await tx.delete(stockDocumentLines).where(eq(stockDocumentLines.documentId, id));
        await tx.delete(stockDocuments).where(eq(stockDocuments.id, id));
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'stock_document.delete',
          entity: 'stock_document',
          entityId: id,
          before,
          ip: ip ?? null,
        });
      });
    },

    async post(actor, id, ip) {
      requirePermission(actor, 'stock.write');
      return db.transaction(async (tx) => {
        const document = await lockedDraft(tx, id);
        if (document.kind === 'sale')
          throw new AppError('invalid_transition', 'a sale posts itself');
        const kind = document.kind;
        const lines = await tx
          .select()
          .from(stockDocumentLines)
          .where(eq(stockDocumentLines.documentId, id))
          .orderBy(asc(stockDocumentLines.productId));
        const problems = postProblems({ kind, reason: document.reason, lineCount: lines.length });
        if (problems.length > 0) {
          throw new AppError('validation', 'document is not complete', {
            paths: problems.map((field) => `document.${field}`),
          });
        }

        // The products and their stock are locked in one order, so two posts cannot deadlock.
        const ids = lines.map((line) => line.productId);
        const levels = await tx
          .select()
          .from(stockLevels)
          .where(inArray(stockLevels.productId, ids))
          .orderBy(asc(stockLevels.productId))
          .for('update');
        const cards = await tx
          .select({ id: products.id, avgCost: products.avgCost, isActive: products.isActive })
          .from(products)
          .where(inArray(products.id, ids))
          .orderBy(asc(products.id))
          .for('update');
        const levelOf = new Map(levels.map((level) => [level.productId, level]));
        const cardOf = new Map(cards.map((card) => [card.id, card]));

        const now = clock.now();
        const short: string[] = [];
        for (const line of lines) {
          const level = levelOf.get(line.productId);
          const card = cardOf.get(line.productId);
          if (!level || !card) throw new Error(`no stock row for ${line.productId}`);
          const { delta, short: isShort } = movementOf(kind, line.qty, level);
          if (isShort) {
            short.push(line.productId);
            continue;
          }
          if (kind === 'inventory') {
            await tx
              .update(stockDocumentLines)
              .set({ expectedQty: level.onHand })
              .where(eq(stockDocumentLines.id, line.id));
          }
          if (delta === 0) continue;

          const unitCost = kind === 'receipt' ? (line.unitCost ?? 0) : card.avgCost;
          await tx.insert(stockMovements).values({
            documentId: id,
            productId: line.productId,
            delta,
            unitCost,
            at: now,
            actorId: actor.userId,
          });
          // In SQL, so the sum stays exact in numeric and not in floating point.
          await tx
            .update(stockLevels)
            .set({ onHand: sql`${stockLevels.onHand} + ${delta}::numeric`, updatedAt: now })
            .where(eq(stockLevels.productId, line.productId));
          if (kind === 'receipt') {
            await tx
              .update(products)
              .set({
                avgCost: averageCostAfterReceipt({
                  onHand: level.onHand,
                  avgCost: card.avgCost,
                  qty: line.qty,
                  unitCost,
                }),
                lastCost: unitCost,
                updatedAt: now,
              })
              .where(eq(products.id, line.productId));
          }
        }
        if (short.length > 0) {
          throw new AppError('insufficient_stock', 'not enough free stock', {
            paths: short.map((productId) => `lines.${productId}`),
          });
        }

        await tx
          .update(stockDocuments)
          .set({ status: 'posted', postedAt: now, postedBy: actor.userId, updatedAt: now })
          .where(and(eq(stockDocuments.id, id), eq(stockDocuments.status, 'draft')));
        const posted = await documentView(tx, id);
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'stock_document.post',
          entity: 'stock_document',
          entityId: id,
          after: auditOf(posted),
          ip: ip ?? null,
        });
        return posted;
      });
    },

    async putInvoicePhoto(actor, id, upload) {
      requirePermission(actor, 'stock.write');
      return db.transaction(async (tx) => {
        const row = await lockedDraft(tx, id);
        if (row.kind !== 'receipt') throw invalidAt('params.id', 'only a receipt has an invoice');
        const photo = await photos.put(tx, {
          id: upload.mediaId,
          purpose: 'stock_invoice',
          side: null,
          owner: { kind: 'stock_document', documentId: id },
          bytes: upload.bytes,
          uploadedBy: actor.userId,
        });
        return { mediaId: photo.id, url: photos.link(photo.id) };
      });
    },
  };
}
