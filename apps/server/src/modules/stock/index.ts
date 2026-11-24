/**
 * The stock module (docs/PLAN.md, sections 4.2, 7.14 and 9.6): products and their categories,
 * suppliers, the warehouse documents and the stock they make, and what has fallen to its minimum.
 */
import type { PlatformDeps } from '../../platform/deps';
import type { Outbox } from '../../platform/outbox';
import type { StaffDirectory } from '../../platform/ports';
import type { AuditService } from '../audit';
import type { MediaService } from '../media';
import type { WorkshopService } from '../workshop';
import { createDocumentsService, type DocumentsService } from './app/documents';
import { createLevelsService, type LevelsService } from './app/levels';
import { createProductsService, type ProductsService } from './app/products';

export interface StockDeps extends PlatformDeps {
  audit: AuditService;
  media: MediaService;
  outbox: Outbox;
  staff: StaffDirectory;
  workshop: Pick<WorkshopService, 'hours'>;
}

export interface StockService {
  products: ProductsService;
  documents: DocumentsService;
  levels: LevelsService;
}

export function createStock(deps: StockDeps): StockService {
  return {
    products: createProductsService(deps),
    documents: createDocumentsService(deps),
    levels: createLevelsService(deps),
  };
}

export type { DocumentsService, DocumentInput } from './app/documents';
export type { LevelsService } from './app/levels';
export type { ProductInput, ProductsService } from './app/products';
export { stockAdminRoutes } from './http/routes';
