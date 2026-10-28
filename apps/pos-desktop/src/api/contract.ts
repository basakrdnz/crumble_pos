// The API the renderer uses. Implemented in the main process (createApi) and
// called over IPC through window.crumble.invoke. Arguments and results must be
// structured-clone friendly (plain data).
import type { CatalogChange, Category, FloorPlan, FloorTable, Product, Refund, Shift, ShiftSummary, Tab, TableShape } from '@crumble/shared';
import type { ImportPreview } from '../catalog/menuCsv';
import type { NewProduct, ProductPatch } from '../db/catalog';
import type { TablePatch } from '../db/floor';
import type { ImportResult } from '../db/menuImport';
import type { PartialRefund, RefundInfo, SaleRow } from '../db/refunds';
import type { BackupFile } from '../maintenance/backup';
import type { CloudInfo, ConnectInput } from '../sync/cloud';
import type { RestoreResult } from '../sync/restore';
import type { SyncStatus } from '../sync/service';
import type { CloseShiftResult, ItemPatch, NewTab, OpenTabSummary, PaymentPart, PayResult, TabDetail } from '../db/sales';

export interface AuthStatus {
  passwordSet: boolean;
  unlocked: boolean;
}

export interface PosApi {
  // Login (allowed while locked)
  authStatus(): AuthStatus;
  setupPassword(password: string): AuthStatus;
  unlock(password: string): AuthStatus;
  lock(): AuthStatus;
  changePassword(current: string, next: string): void;

  // Catalog
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

  // Shifts
  getOpenShift(): Shift | null;
  openShift(openingCash: number): Shift;
  getShiftSummary(shiftId: string): ShiftSummary;
  closeShift(countedCash: number, notes?: string | null): CloseShiftResult;
  listShifts(limit?: number): Shift[];

  // Tabs and sales
  openTab(input: NewTab): Tab;
  getTab(tabId: string): TabDetail;
  getOpenQuickTab(): Tab | null;
  listOpenTabs(): Tab[];
  listClosedTabs(shiftId: string): Tab[];
  addProduct(tabId: string, productId: string): TabDetail;
  updateItem(itemId: string, patch: ItemPatch): TabDetail;
  voidItem(itemId: string, reason?: string | null): TabDetail;
  setTabDiscount(tabId: string, percent: number | null): TabDetail;
  pay(tabId: string, parts: PaymentPart[]): PayResult;
  voidTab(tabId: string): Tab;
  listOpenTabSummaries(): OpenTabSummary[];
  moveTab(tabId: string, tableId: string): TabDetail;
  setCustomerName(tabId: string, name: string | null): TabDetail;

  // Sales list and refunds (iade)
  listSales(shiftId: string): SaleRow[];
  getRefundInfo(tabId: string): RefundInfo;
  refundAll(tabId: string, reason?: string | null): Refund[];
  refundPart(tabId: string, input: PartialRefund): Refund;
  refundAndVoid(tabId: string, reason?: string | null): void;

  // Floor plan (kroki)
  listFloorPlans(): FloorPlan[];
  createFloorPlan(name: string): FloorPlan;
  renameFloorPlan(id: string, name: string): FloorPlan;
  reorderFloorPlans(orderedIds: string[]): void;
  deleteFloorPlan(id: string): void;
  getFloorBackground(planId: string): string | null;
  setFloorBackground(planId: string, dataUrl: string | null): void;
  listTables(floorPlanId?: string): FloorTable[];
  createTable(floorPlanId: string, shape: TableShape, at?: { x: number; y: number }): FloorTable;
  updateTable(id: string, patch: TablePatch): FloorTable;
  deleteTable(id: string): void;

  // Cloud sync (Faz 5)
  getSyncStatus(): SyncStatus;
  syncNow(): Promise<SyncStatus>;
  getCloudInfo(): CloudInfo;
  connectCloud(input: ConnectInput): Promise<CloudInfo>;
  disconnectCloud(): Promise<CloudInfo>;
  isLocalEmpty(): boolean;
  restoreFromCloud(): Promise<RestoreResult>;

  // Maintenance (Faz 7)
  listBackups(): BackupFile[];
  backupNow(): Promise<BackupFile>;
  openBackupFolder(): void;
  readLog(lines?: number): string[];
  openLogFolder(): void;
  logRendererError(message: string, detail?: string): void;
}

/** Calls that only read; everything else is a write and nudges the sync. */
export const READ_ONLY = /^(get|list|auth|preview|is|read|open|log|backup)/;

export type PosApiMethod = keyof PosApi;

/** Methods that work while the POS is locked. */
export const PUBLIC_METHODS: readonly PosApiMethod[] = ['authStatus', 'setupPassword', 'unlock', 'lock', 'logRendererError'];

export type IpcResult = { ok: true; value: unknown } | { ok: false; error: string };

export const IPC_CHANNEL = 'pos-api';
