import * as auth from '../db/auth';
import * as catalog from '../db/catalog';
import type { Context } from '../db/database';
import * as menuImport from '../db/menuImport';
import * as sales from '../db/sales';
import { type AuthStatus, type IpcResult, type PosApi, PUBLIC_METHODS } from './contract';

export interface ApiServer {
  api: PosApi;
  isUnlocked(): boolean;
}

export function createApi(ctx: Context): ApiServer {
  let unlocked = false;
  const status = (): AuthStatus => ({ passwordSet: auth.isPasswordSet(ctx), unlocked });
  const tabOf = (itemId: string) => sales.getTab(ctx, ctx.db.prepare('select tab_id from tab_items where id = ?').pluck().get(itemId) as string);

  const api: PosApi = {
    authStatus: status,
    setupPassword: (password) => {
      auth.setInitialPassword(ctx, password);
      unlocked = true;
      return status();
    },
    unlock: (password) => {
      if (!auth.checkPassword(ctx, password)) throw new Error('Şifre yanlış.');
      unlocked = true;
      return status();
    },
    lock: () => {
      unlocked = false;
      return status();
    },
    changePassword: (current, next) => auth.changePassword(ctx, current, next),

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

    getOpenShift: () => sales.getOpenShift(ctx),
    openShift: (cash) => sales.openShift(ctx, cash),
    getShiftSummary: (id) => sales.getShiftSummary(ctx, id),
    closeShift: (cash, notes) => sales.closeShift(ctx, cash, notes),
    listShifts: (limit) => sales.listShifts(ctx, limit),

    openTab: (input) => sales.openTab(ctx, input),
    getTab: (id) => sales.getTab(ctx, id),
    getOpenQuickTab: () => sales.getOpenQuickTab(ctx),
    listOpenTabs: () => sales.listOpenTabs(ctx),
    listClosedTabs: (shiftId) => sales.listClosedTabs(ctx, shiftId),
    addProduct: (tabId, productId) => {
      sales.addProduct(ctx, tabId, productId);
      return sales.getTab(ctx, tabId);
    },
    updateItem: (itemId, patch) => {
      sales.updateItem(ctx, itemId, patch);
      return tabOf(itemId);
    },
    voidItem: (itemId, reason) => {
      sales.voidItem(ctx, itemId, reason);
      return tabOf(itemId);
    },
    setTabDiscount: (tabId, percent) => {
      sales.setTabDiscount(ctx, tabId, percent);
      return sales.getTab(ctx, tabId);
    },
    pay: (tabId, parts) => sales.pay(ctx, tabId, parts),
    voidTab: (tabId) => sales.voidTab(ctx, tabId),
  };

  return { api, isUnlocked: () => unlocked };
}

/** Dispatches one IPC call; errors are returned as messages, not thrown across IPC. */
export function dispatch(server: ApiServer, method: string, args: unknown[]): IpcResult {
  const fn = (server.api as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
  if (typeof fn !== 'function') return { ok: false, error: `Bilinmeyen işlem: ${method}` };
  if (!server.isUnlocked() && !(PUBLIC_METHODS as readonly string[]).includes(method)) {
    return { ok: false, error: 'Kasa kilitli. Şifre ile giriş yapın.' };
  }
  try {
    return { ok: true, value: fn(...args) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
