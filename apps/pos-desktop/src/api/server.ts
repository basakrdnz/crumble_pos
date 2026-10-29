import * as auth from '../db/auth';
import * as catalog from '../db/catalog';
import * as floor from '../db/floor';
import type { Context } from '../db/database';
import * as menuImport from '../db/menuImport';
import * as refunds from '../db/refunds';
import * as sales from '../db/sales';
import { backupNow, listBackups } from '../maintenance/backup';
import type { Logger } from '../maintenance/logger';
import type { CloudManager } from '../sync/cloud';
import { isLocalEmpty } from '../sync/restore';
import type { SyncService } from '../sync/service';
import { type AuthStatus, type IpcResult, type PosApi, PUBLIC_METHODS, READ_ONLY } from './contract';

export interface ApiServer {
  api: PosApi;
  isUnlocked(): boolean;
  /** Called after every successful write (pushes the outbox soon). */
  onWrite(): void;
  logger?: Logger;
}

export interface MaintenanceDeps {
  backupDir: string;
  logger: Logger;
  openPath(path: string): void;
}

export interface CloudDeps {
  sync: SyncService;
  cloud: CloudManager;
}

export function createApi(ctx: Context, deps?: CloudDeps, maintenance?: MaintenanceDeps): ApiServer {
  const need = () => {
    if (!deps) throw new Error('Bulut senkronu bu ortamda yok.');
    return deps;
  };
  const care = () => {
    if (!maintenance) throw new Error('Bakım işlemleri bu ortamda yok.');
    return maintenance;
  };
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
    openShift: () => sales.openShift(ctx),
    getShiftSummary: (id) => sales.getShiftSummary(ctx, id),
    closeShift: (input) => sales.closeShift(ctx, input),
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
    listOpenTabSummaries: (includeQuick) => sales.listOpenTabSummaries(ctx, includeQuick),
    moveTab: (tabId, tableId) => {
      sales.moveTab(ctx, tabId, tableId);
      return sales.getTab(ctx, tabId);
    },
    setCustomerName: (tabId, name) => {
      sales.setCustomerName(ctx, tabId, name);
      return sales.getTab(ctx, tabId);
    },

    listSales: (shiftId) => refunds.listSales(ctx, shiftId),
    getRefundInfo: (tabId) => refunds.getRefundInfo(ctx, tabId),
    refundAll: (tabId, reason) => refunds.refundAll(ctx, tabId, reason),
    refundPart: (tabId, input) => refunds.refundPart(ctx, tabId, input),
    refundAndVoid: (tabId, reason) => refunds.refundAndVoid(ctx, tabId, reason),

    listFloorPlans: () => floor.listFloorPlans(ctx),
    createFloorPlan: (name) => floor.createFloorPlan(ctx, name),
    renameFloorPlan: (id, name) => floor.renameFloorPlan(ctx, id, name),
    reorderFloorPlans: (ids) => floor.reorderFloorPlans(ctx, ids),
    deleteFloorPlan: (id) => floor.deleteFloorPlan(ctx, id),
    getFloorBackground: (id) => floor.getFloorBackground(ctx, id),
    setFloorBackground: (id, dataUrl) => floor.setFloorBackground(ctx, id, dataUrl),
    listTables: (planId) => floor.listTables(ctx, planId),
    createTable: (planId, shape, at) => floor.createTable(ctx, planId, shape, at),
    updateTable: (id, patch) => floor.updateTable(ctx, id, patch),
    deleteTable: (id) => floor.deleteTable(ctx, id),

    getSyncStatus: () => need().sync.getStatus(),
    syncNow: () => need().sync.syncNow(),
    getCloudInfo: () => need().cloud.info(),
    connectCloud: (input) => need().cloud.connect(input),
    disconnectCloud: () => need().cloud.disconnect(),
    isLocalEmpty: () => isLocalEmpty(ctx),
    restoreFromCloud: () => need().cloud.restore(),

    listBackups: () => listBackups(care().backupDir),
    backupNow: () => backupNow(ctx.db, care().backupDir),
    openBackupFolder: () => care().openPath(care().backupDir),
    readLog: (lines) => care().logger.recent(lines),
    openLogFolder: () => care().openPath(care().logger.dir),
    logRendererError: (message, detail) => maintenance?.logger.log('error', `Ekran hatası: ${message}`, detail),
  };

  return { api, isUnlocked: () => unlocked, onWrite: () => deps?.sync.nudge(), logger: maintenance?.logger };
}

/** Dispatches one IPC call; errors are returned as messages, not thrown across IPC. */
export async function dispatch(server: ApiServer, method: string, args: unknown[]): Promise<IpcResult> {
  const fn = (server.api as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
  if (typeof fn !== 'function') return { ok: false, error: `Bilinmeyen işlem: ${method}` };
  if (!server.isUnlocked() && !(PUBLIC_METHODS as readonly string[]).includes(method)) {
    return { ok: false, error: 'Kasa kilitli. Şifre ile giriş yapın.' };
  }
  try {
    const value = await fn(...args);
    if (!READ_ONLY.test(method)) server.onWrite();
    return { ok: true, value };
  } catch (error) {
    // Messages meant for the cashier are plain Errors; anything else
    // (SqliteError, TypeError, ...) is unexpected and goes to the error log.
    if (!(error instanceof Error) || error.name !== 'Error') {
      server.logger?.log('error', `İşlem başarısız: ${method}`, error);
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
