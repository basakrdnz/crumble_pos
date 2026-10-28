// The API the renderer uses. Implemented in the main process (createApi) and
// called over IPC through window.crumble.invoke. Arguments and results must be
// structured-clone friendly (plain data).
import type { CatalogChange, Category, Product } from '@crumble/shared';
import type { ImportPreview } from '../catalog/menuCsv';
import type { NewProduct, ProductPatch } from '../db/catalog';
import type { ImportResult } from '../db/menuImport';

export interface PosApi {
  listCategories(): Category[];
  createCategory(name: string): Category;
  renameCategory(id: string, name: string): Category;
  reorderCategories(orderedIds: string[]): void;
  deleteCategory(id: string): void;

  listProducts(): Product[];
  createProduct(input: NewProduct): Product;
  updateProduct(id: string, patch: ProductPatch): Product;
  reorderProducts(orderedIds: string[]): void;
  deleteProduct(id: string): void;

  listCatalogChanges(limit?: number): CatalogChange[];

  previewMenuImport(csvText: string): ImportPreview;
  applyMenuImport(csvText: string): ImportResult;
}

export type PosApiMethod = keyof PosApi;

export type IpcResult = { ok: true; value: unknown } | { ok: false; error: string };

export const IPC_CHANNEL = 'pos-api';
