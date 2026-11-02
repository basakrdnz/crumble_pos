import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findPgBin, type PgCluster, startCluster } from '../test/pgCluster';
import { type FakeSupabase, fakeSupabase } from './fakeSupabase';
import { importMenu, openShiftUi, pick } from './helpers';
import { launchApp, type RunningApp, snap, unlock } from './launch';

const bin = findPgBin();
const count = async (db: pg.Client, sql: string) => Number((await db.query(sql)).rows[0].n);

// Faz 5 kabul: internet kapalıyken 20 satış yapılıp açılınca hepsi bir kez buluta düşer.
describe.skipIf(!bin)('Faz 5: senkron (uygulama + sahte Supabase + gerçek Postgres)', () => {
  let cluster: PgCluster;
  let db: pg.Client;
  let pool: pg.Pool;
  let cloud: FakeSupabase;
  let run: RunningApp;

  beforeAll(async () => {
    cluster = await startCluster(bin!);
    db = await cluster.connect();
    pool = cluster.pool();
    cloud = fakeSupabase(pool, 54000 + Math.floor(Math.random() * 900), { device: 'kasa@crumble.test', partner: 'ortak@crumble.test' });
    await cloud.start();
    run = await launchApp();
    await unlock(run.page);
  }, 90_000);

  afterAll(async () => {
    await run?.close();
    await cloud?.stop();
    await pool?.end();
    await db?.end();
    cluster?.stop();
  });

  it('works without a cloud and queues everything', async () => {
    const { page } = run;
    await expect.poll(() => page.getByTestId('sync-status').textContent()).toBe('Bulut kurulmadı');
    await importMenu(page);
  });

  it('connects the device user and pushes the queue', async () => {
    const { page } = run;
    await page.getByTestId('sync-status').click();
    await page.getByLabel('Supabase adresi').fill('ftp://yanlis');
    await page.getByLabel('Publishable (anon) key').fill('anon-test-key');
    await page.getByLabel('Cihaz e-postası').fill('kasa@crumble.test');
    await page.getByLabel('Cihaz şifresi').fill('cihaz-sifresi');
    await page.getByRole('button', { name: 'Bağlan', exact: true }).click();
    await expect.poll(() => page.getByRole('alert').textContent()).toContain('https://');

    await page.getByLabel('Supabase adresi').fill(cloud.url);
    await page.getByRole('button', { name: 'Bağlan', exact: true }).click();
    await expect.poll(() => page.getByTestId('sync-status').textContent(), { timeout: 20_000 }).toMatch(/Senkron ✓/);
    expect(await count(db, 'select count(*) as n from public.products')).toBe(64);
    expect(await count(db, "select count(*) as n from public.device_status where id = 'pos'")).toBe(1);
    await snap(page, 'faz5-cloud');
  });

  it('keeps selling offline: 20 sales wait in the queue', async () => {
    const { page } = run;
    await cloud.stop(); // internet gone
    await openShiftUi(page);
    for (let i = 0; i < 20; i++) {
      await pick(page, 'Kahve', i % 2 ? 'Espresso' : 'Cafe Latte');
      await page.locator('.cart-line').first().waitFor();
      await page.keyboard.press(i % 3 ? 'F11' : 'F12');
      await page.getByText('Sepet boş. Soldan ürün seçin.').waitFor();
    }
    await expect.poll(() => page.getByTestId('sync-status').textContent(), { timeout: 20_000 }).toMatch(/Çevrimdışı · \d+ bekliyor/);
    await snap(page, 'faz5-offline');
    expect(await count(db, 'select count(*) as n from public.tabs')).toBe(0);
  });

  it('when the internet is back, every sale lands exactly once', async () => {
    const { page } = run;
    await cloud.start();
    await page.getByTestId('sync-status').click();
    await page.getByRole('button', { name: 'Şimdi senkronla' }).click();
    await expect.poll(() => page.getByTestId('sync-status').textContent(), { timeout: 20_000 }).toMatch(/Senkron ✓/);

    expect(await count(db, "select count(*) as n from public.tabs where status = 'paid'")).toBe(20);
    expect(await count(db, 'select count(distinct id) as n from public.tabs')).toBe(20);
    expect(await count(db, 'select count(*) as n from public.payments')).toBe(20);
    // 10 latte (215) + 10 espresso (110)
    expect(await count(db, 'select sum(amount) as n from public.payments')).toBe(10 * 21500 + 10 * 11000);
    expect(await count(db, 'select count(*) as n from public.shifts')).toBe(1);
  });
});
