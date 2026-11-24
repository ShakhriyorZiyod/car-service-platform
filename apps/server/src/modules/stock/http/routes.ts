import type { AdminRoutes } from '../../../http/contexts';
import type { DocumentsService } from '../app/documents';
import type { LevelsService } from '../app/levels';
import type { ProductsService } from '../app/products';

/** Thin adapters: each handler only passes the validated input to a use case. */

export const stockAdminRoutes = (stock: {
  products: ProductsService;
  documents: DocumentsService;
  levels: LevelsService;
}): Pick<
  AdminRoutes,
  | 'admin.stock'
  | 'admin.stockMovements'
  | 'admin.lowStock'
  | 'admin.stockDocuments'
  | 'admin.createStockDocument'
  | 'admin.stockDocument'
  | 'admin.updateStockDocument'
  | 'admin.deleteStockDocument'
  | 'admin.postStockDocument'
  | 'admin.putStockInvoicePhoto'
  | 'admin.products'
  | 'admin.createProduct'
  | 'admin.updateProduct'
  | 'admin.putProductPhoto'
  | 'admin.deleteProductPhoto'
  | 'admin.productCategories'
  | 'admin.createProductCategory'
  | 'admin.updateProductCategory'
  | 'admin.suppliers'
  | 'admin.createSupplier'
  | 'admin.updateSupplier'
> => {
  const { products, documents, levels } = stock;
  return {
    'admin.stock': async ({ query }, { actor }) => ({ items: await levels.list(actor, query) }),
    'admin.stockMovements': ({ query }, { actor }) => levels.movements(actor, query),
    'admin.lowStock': async (_input, { actor }) => ({ items: await levels.low(actor) }),

    'admin.stockDocuments': ({ query }, { actor }) => documents.list(actor, query),
    'admin.createStockDocument': ({ body }, { actor, ip }) => documents.create(actor, body, ip),
    'admin.stockDocument': ({ params }, { actor }) => documents.get(actor, params.id),
    'admin.updateStockDocument': ({ params, body }, { actor, ip }) =>
      documents.update(actor, params.id, body, ip),
    'admin.deleteStockDocument': async ({ params }, { actor, ip }) => {
      await documents.remove(actor, params.id, ip);
      return { ok: true };
    },
    'admin.postStockDocument': ({ params }, { actor, ip }) => documents.post(actor, params.id, ip),
    'admin.putStockInvoicePhoto': ({ params, body }, { actor }) =>
      documents.putInvoicePhoto(actor, params.id, { mediaId: params.mediaId, bytes: body }),

    'admin.products': async (_input, { actor }) => ({ items: await products.list(actor) }),
    'admin.createProduct': ({ body }, { actor, ip }) => products.create(actor, body, ip),
    'admin.updateProduct': ({ params, body }, { actor, ip }) =>
      products.update(actor, params.id, body, ip),
    'admin.putProductPhoto': ({ params, body }, { actor }) =>
      products.putPhoto(actor, params.id, { mediaId: params.mediaId, bytes: body }),
    'admin.deleteProductPhoto': async ({ params }, { actor }) => {
      await products.removePhoto(actor, params.id, params.mediaId);
      return { ok: true };
    },

    'admin.productCategories': async (_input, { actor }) => ({
      items: await products.categories(actor),
    }),
    'admin.createProductCategory': ({ body }, { actor, ip }) =>
      products.createCategory(actor, body, ip),
    'admin.updateProductCategory': ({ params, body }, { actor, ip }) =>
      products.updateCategory(actor, params.id, body, ip),

    'admin.suppliers': async (_input, { actor }) => ({ items: await products.suppliers(actor) }),
    'admin.createSupplier': ({ body }, { actor, ip }) => products.createSupplier(actor, body, ip),
    'admin.updateSupplier': ({ params, body }, { actor, ip }) =>
      products.updateSupplier(actor, params.id, body, ip),
  };
};
