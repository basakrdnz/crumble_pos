import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCategory, createProduct, updateProduct } from '../src/db/catalog';
import type { Context } from '../src/db/database';
import { refundPart } from '../src/db/refunds';
import { addProduct, closeShift, getTab, openShift, openTab, pay, setTabDiscount, updateItem, voidItem, voidTab } from '../src/db/sales';
import { pendingCount, pushPending } from '../src/sync/engine';
import { isLocalEmpty, restoreFromCloud } from '../src/sync/restore';
import { SyncError, type SyncTransport } from '../src/sync/transport';
import { findPgBin, type PgCluster, startCluster } from './pgCluster';
import { pgTransport } from './pgTransport';
import { testContext as baseContext } from './helpers';

// Tests share one Postgres, so ids must be unique across them.
const testContext = () => baseContext(undefined, randomUUID);

const bin = findPgBin();

async function count(db: pg.Client, sql: string): Promise<number> {
  return Number((await db.query(sql)).rows[0].n);
}

/** Pushes until the outbox is empty or a non-offline error happens. */
async function drain(ctx: Context, transport: SyncTransport) {
  for (let i = 0; i < 20; i++) {
    const result = await pushPending(ctx, transport, 50);
    if (result.error) throw result.error;
    if (result.pending === 0) return;
  }
  throw new Error('outbox did not drain');
}

function day(ctx: Context, sales: number) {
  const kahve = createCategory(ctx, 'Kahve');
  const latte = createProduct(ctx, { category_id: kahve.id, name: 'Latte', price: 21500 });
  const cay = createProduct(ctx, { category_id: kahve.id, name: 'Çay', price: 6500 });
  openShift(ctx, 50000);
  const ids: string[] = [];
  for (let i = 0; i < sales; i++) {
    const tab = openTab(ctx, { kind: 'quick' });
    const line = addProduct(ctx, tab.id, latte.id);
    addProduct(ctx, tab.id, cay.id);
    if (i % 3 === 0) addProduct(ctx, tab.id, latte.id); // quantity 2
    if (i % 4 === 0) updateItem(ctx, line.id, { unit_price: 20000 });
    if (i % 5 === 0) setTabDiscount(ctx, tab.id, 15);
    if (i % 7 === 0) {
      const extra = addProduct(ctx, tab.id, cay.id);
      voidItem(ctx, extra.id, 'yanlış');
    }
    // Pay exactly what is due, alternating methods, sometimes mixed.
    const due = getTab(ctx, tab.id).remaining;
    if (i % 2 === 0) pay(ctx, tab.id, [{ method: 'cash', amount: due }]);
    else if (i % 3 === 0) pay(ctx, tab.id, [{ method: 'cash', amount: 1000 }, { method: 'card', amount: due - 1000 }]);
    else pay(ctx, tab.id, [{ method: 'card', amount: due }]);
    ids.push(tab.id);
  }
  return { latte, cay, ids };
}

describe.skipIf(!bin)('sync to Postgres (Faz 5 entegrasyon testi)', () => {
  let cluster: PgCluster;
  let admin: pg.Client;
  let device: pg.Client;

  beforeAll(async () => {
    cluster = await startCluster(bin!);
    admin = await cluster.connect();
    device = await cluster.connect();
  }, 60_000);

  // Each test plays a fresh POS: start from an empty cloud. Replica mode skips
  // the no-delete triggers for this admin-only cleanup.
  beforeEach(async () => {
    await admin.query(`set session_replication_role = replica;
      truncate public.refunds, public.payments, public.tab_items, public.tabs, public.shifts,
        public.catalog_changes, public.products, public.categories, public.tables, public.floor_plans,
        public.device_status cascade;
      set session_replication_role = default;`);
  });

  afterAll(async () => {
    await device?.end();
    await admin?.end();
    cluster?.stop();
  });

  // Faz 5 kabul: internet kapalıyken 20 satış yapılıp açılınca hepsi bir kez buluta düşer.
  it('20 offline sales reach the cloud exactly once', async () => {
    const ctx = testContext();
    const transport = pgTransport(device);

    transport.online = false;
    const { ids } = day(ctx, 20);
    const local = {
      tabs: ctx.db.prepare("select count(*) from tabs where status = 'paid'").pluck().get() as number,
      items: ctx.db.prepare('select count(*) from tab_items').pluck().get() as number,
      payments: ctx.db.prepare('select count(*) from payments').pluck().get() as number,
      paid: ctx.db.prepare('select sum(amount) from payments').pluck().get() as number,
    };
    expect(local.tabs).toBe(20);

    // Offline: nothing leaves, nothing is lost, the queue waits.
    const pendingBefore = pendingCount(ctx);
    const offline = await pushPending(ctx, transport);
    expect(offline.error).toBeInstanceOf(SyncError);
    expect(offline.error!.offline).toBe(true);
    expect(offline.sent).toBe(0);
    expect(pendingCount(ctx)).toBe(pendingBefore);
    expect(await count(admin, 'select count(*) as n from public.tabs')).toBe(0);

    // Back online.
    transport.online = true;
    await drain(ctx, transport);
    expect(pendingCount(ctx)).toBe(0);

    expect(await count(admin, "select count(*) as n from public.tabs where status = 'paid'")).toBe(20);
    expect(await count(admin, 'select count(*) as n from public.tab_items')).toBe(local.items);
    expect(await count(admin, 'select count(*) as n from public.payments')).toBe(local.payments);
    expect(await count(admin, 'select coalesce(sum(amount), 0) as n from public.payments')).toBe(local.paid);
    expect(await count(admin, 'select count(distinct id) as n from public.tabs')).toBe(20);
    // Cloud totals match the POS.
    for (const id of ids.slice(0, 5)) {
      const cloud = (await admin.query('select total from public.tabs where id = $1', [id])).rows[0].total;
      expect(cloud).toBe(getTab(ctx, id).tab.total);
    }
    const voided = await count(admin, 'select count(*) as n from public.tab_items where voided_at is not null');
    expect(voided).toBe(ctx.db.prepare('select count(*) from tab_items where voided_at is not null').pluck().get());
  });

  it('a lost response is retried without duplicates (idempotent)', async () => {
    const ctx = testContext();
    const inner = pgTransport(device);
    let failNext = true;
    // The server commits, but the POS never hears back (e.g. connection drops).
    const lossy: SyncTransport = {
      push: async (table, rows, mode) => {
        await inner.push(table, rows, mode);
        if (failNext && table === 'payments') {
          failNext = false;
          throw new SyncError('connection reset', true);
        }
      },
      heartbeat: (s) => inner.heartbeat(s),
    };
    const { ids } = day(ctx, 3);
    const first = await pushPending(ctx, lossy);
    expect(first.error?.offline).toBe(true);
    await drain(ctx, lossy);
    for (const id of ids) {
      expect(await count(admin, `select count(*) as n from public.payments where tab_id = '${id}'`)).toBe(
        ctx.db.prepare('select count(*) from payments where tab_id = ?').pluck().get(id) as number,
      );
    }
  });

  it('syncs catalog changes, refunds, voids and the shift close', async () => {
    const ctx = testContext();
    const transport = pgTransport(device);
    const { latte, ids } = day(ctx, 2);
    updateProduct(ctx, latte.id, { price: 22500 });
    refundPart(ctx, ids[0]!, { amount: 1000, method: 'cash', reason: 'eksik' });
    const cancelled = openTab(ctx, { kind: 'named', customer_name: 'Ayşe' });
    addProduct(ctx, cancelled.id, latte.id);
    voidTab(ctx, cancelled.id);
    const closed = closeShift(ctx);
    await drain(ctx, transport);

    const cloudShift = (await admin.query('select * from public.shifts where id = $1', [closed.shift.id])).rows[0];
    expect(cloudShift).toMatchObject({ counted_cash: null, expected_cash: closed.shift.expected_cash });
    expect((await admin.query('select price from public.products where id = $1', [latte.id])).rows[0].price).toBe(22500);
    expect(await count(admin, `select count(*) as n from public.refunds where tab_id = '${ids[0]}'`)).toBe(1);
    expect((await admin.query('select status from public.tabs where id = $1', [cancelled.id])).rows[0].status).toBe('void');
    expect(
      await count(admin, `select count(*) as n from public.catalog_changes where entity_id = '${latte.id}' and field = 'price'`),
    ).toBe(1);
  });

  it('stops at a row the cloud refuses and keeps the order', async () => {
    const ctx = testContext();
    const transport = pgTransport(device);
    const { ids } = day(ctx, 1);
    await drain(ctx, transport);
    // Someone changed the closed tab in the cloud by hand (service role): the
    // POS copy is now different, and re-sending it is refused by the trigger.
    const local = getTab(ctx, ids[0]!).tab;
    ctx.db.prepare('insert into outbox (table_name, row_id, payload, created_at) values (?, ?, ?, ?)').run(
      'tabs',
      local.id,
      JSON.stringify({ ...local, customer_name: 'değiştirildi' }),
      new Date().toISOString(),
    );
    const result = await pushPending(ctx, transport);
    expect(result.error?.offline).toBe(false);
    expect(result.error?.message).toMatch(/Kapanmış hesap/);
    expect(result.pending).toBe(1);
  });

  it('heartbeat records the last sync time for the manager app', async () => {
    const transport = pgTransport(device);
    await transport.heartbeat({ last_sync_at: '2026-11-01T10:00:00.000Z', pending: 0 });
    const row = (await admin.query("select * from public.device_status where id = 'pos'")).rows[0];
    expect(row.last_sync_at.toISOString()).toBe('2026-11-01T10:00:00.000Z');
  });

  it('restores a new install from the cloud', async () => {
    const source = testContext();
    const transport = pgTransport(device);
    const { ids } = day(source, 4);
    refundPart(source, ids[1]!, { amount: 500, method: getTab(source, ids[1]!).payments[0]!.method });
    const v = openTab(source, { kind: 'quick' });
    addProduct(source, v.id, (source.db.prepare('select id from products limit 1').pluck().get() as string));
    voidTab(source, v.id);
    await drain(source, transport);

    const fresh = testContext();
    expect(isLocalEmpty(fresh)).toBe(true);
    const result = await restoreFromCloud(fresh, transport);
    expect(result.counts.tabs).toBe(5);
    for (const table of ['categories', 'products', 'shifts', 'tabs', 'tab_items', 'payments', 'refunds', 'catalog_changes']) {
      const dump = (c: Context) => c.db.prepare(`select * from ${table} order by id`).all();
      expect(dump(fresh), table).toEqual(dump(source));
    }
    // Restoring does not queue anything to push back.
    expect(pendingCount(fresh)).toBe(0);
    await expect(restoreFromCloud(fresh, transport)).rejects.toThrow(/boş/);
  });
});
