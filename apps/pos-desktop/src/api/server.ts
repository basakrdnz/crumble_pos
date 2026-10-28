import * as catalog from '../db/catalog';
import type { Context } from '../db/database';
import * as menuImport from '../db/menuImport';
import type { IpcResult, PosApi } from './contract';

export function createApi(ctx: Context): PosApi {
  return {
    listCategories: () => catalog.listCategories(ctx),
    createCategory: (name) => catalog.createCategory(ctx, name),
    renameCategory: (id, name) => catalog.renameCategory(ctx, id, name),
    reorderCategories: (ids) => catalog.reorderCategories(ctx, ids),
    deleteCategory: (id) => catalog.deleteCategory(ctx, id),

    listProducts: () => catalog.listProducts(ctx),
    createProduct: (input) => catalog.createProduct(ctx, input),
    updateProduct: (id, patch) => catalog.updateProduct(ctx, id, patch),
    reorderProducts: (ids) => catalog.reorderProducts(ctx, ids),
    deleteProduct: (id) => catalog.deleteProduct(ctx, id),

    listCatalogChanges: (limit) => catalog.listCatalogChanges(ctx, limit),

    previewMenuImport: (text) => menuImport.previewMenuImport(ctx, text),
    applyMenuImport: (text) => menuImport.applyMenuImport(ctx, text),
  };
}

/** Dispatches one IPC call; errors are returned as messages, not thrown across IPC. */
export function dispatch(api: PosApi, method: string, args: unknown[]): IpcResult {
  const fn = (api as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
  if (typeof fn !== 'function') return { ok: false, error: `Bilinmeyen işlem: ${method}` };
  try {
    return { ok: true, value: fn(...args) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
