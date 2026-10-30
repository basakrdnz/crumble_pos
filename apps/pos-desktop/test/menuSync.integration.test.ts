import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCategory, createProduct, listCatalogChanges, listProducts, updateProduct } from '../src/db/catalog';
import type { Context } from '../src/db/database';
import { pendingCount, pushPending } from '../src/sync/engine';
import { pullCatalog } from '../src/sync/pull';
import { findPgBin, type PgCluster, startCluster } from './pgCluster';
import { pgTransport } from './pgTransport';
import { testContext as baseContext } from './helpers';

// Telefondan menü (2026-10-30): the phone changes prices and adds/deletes
// products through the menu_* functions; the POS pulls them in.
const bin = findPgBin();
const PARTNER = '00000000-0000-0000-0000-00000000a001';

async function asPartner(client: pg.Client, sql: string, values: unknown[]) {
  await client.query('begin');
  try {
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: PARTNER, role: 'authenticated' })]);
    await client.query(sql, values);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  }
}

async function drain(ctx: Context, transport: ReturnType<typeof pgTransport>) {
  for (let i = 0; i < 20; i++) {
    const result = await pushPending(ctx, transport, 50);
    if (result.error) throw result.error;
    if (result.pending === 0) return;
  }
  throw new Error('outbox did not drain');
}

describe.skipIf(!bin)('telefondan menü: phone changes reach the POS', () => {
  let cluster: PgCluster;
  let admin: pg.Client;
  let device: pg.Client;
  let phone: pg.Client;

  beforeAll(async () => {
    cluster = await startCluster(bin!);
    admin = await cluster.connect();
    device = await cluster.connect();
    phone = await cluster.connect();
    await admin.query('insert into auth.users values ($1)', [PARTNER]);
    await admin.query("insert into public.partners (user_id, email) values ($1, 'ortak@example.com')", [PARTNER]);
  }, 60_000);

  afterAll(async () => {
    await phone?.end();
    await device?.end();
    await admin?.end();
    cluster?.stop();
  });

  it('applies price, new and deleted products without echoing them back', async () => {
    // The test clock advances 1 s per call, so start it in the past: the phone's changes are newer.
    const ctx = baseContext(new Date(Date.now() - 3_600_000).toISOString(), randomUUID);
    const transport = pgTransport(device);
    const kahve = createCategory(ctx, 'Kahve');
    const latte = createProduct(ctx, { category_id: kahve.id, name: 'Cafe Latte', price: 21500 });
    const mocha = createProduct(ctx, { category_id: kahve.id, name: 'Mocha', price: 24000 });
    await drain(ctx, transport);

    const pumpkin = randomUUID();
    await asPartner(phone, 'select public.menu_set_price($1, $2)', [latte.id, 22500]);
    await asPartner(phone, 'select public.menu_add_product($1, $2, $3, $4)', [pumpkin, kahve.id, 'Balkabağı Latte', 24500]);
    await asPartner(phone, 'select public.menu_delete_product($1)', [mocha.id]);

    const result = await pullCatalog(ctx, transport);
    expect(result).toEqual({ products: 3, changes: 3 });
    const products = listProducts(ctx);
    expect(products.find((p) => p.id === latte.id)?.price).toBe(22500);
    expect(products.find((p) => p.id === pumpkin)).toMatchObject({ name: 'Balkabağı Latte', is_active: true });
    expect(products.some((p) => p.id === mocha.id)).toBe(false); // soft deleted
    expect(listCatalogChanges(ctx, 10).filter((c) => c.source === 'mobile')).toHaveLength(3);
    // Pulled rows are not queued again, and a second round finds nothing new.
    expect(pendingCount(ctx)).toBe(0);
    expect(await pullCatalog(ctx, transport)).toEqual({ products: 0, changes: 0 });
  });

  it('last writer wins: an older POS change waiting offline does not undo the phone', async () => {
    const ctx = baseContext(new Date(Date.now() - 3_600_000).toISOString(), randomUUID); // POS clock: an hour ago
    const transport = pgTransport(device);
    const kahve = createCategory(ctx, 'Kahve');
    const latte = createProduct(ctx, { category_id: kahve.id, name: 'Cafe Latte', price: 21500 });
    await drain(ctx, transport);

    transport.online = false;
    updateProduct(ctx, latte.id, { price: 20000 }); // made offline, older than the phone's change
    await asPartner(phone, 'select public.menu_set_price($1, $2)', [latte.id, 23000]);

    transport.online = true;
    await drain(ctx, transport); // the old POS row reaches the cloud but loses
    expect((await admin.query('select price from public.products where id = $1', [latte.id])).rows[0].price).toBe(23000);
    await pullCatalog(ctx, transport);
    expect(listProducts(ctx).find((p) => p.id === latte.id)?.price).toBe(23000);
  });
});
