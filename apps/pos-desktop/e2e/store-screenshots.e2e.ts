// App Store screenshots of the manager app (2026-11-04). Not a test: it only
// runs when CRUMBLE_STORE_SHOTS=<folder> is set, e.g.
//   CRUMBLE_STORE_SHOTS=$PWD/../manager-mobile/store/screenshots npx vitest run -c vitest.e2e.config.mts e2e/store-screenshots.e2e.ts
// Five weeks of made-up sales (demo data, no real numbers) go into a throwaway
// Postgres behind the fake Supabase; the phone's web build is shot at
// 440×956 @3x = 1320×2868, the App Store's 6.9" iPhone size (CRUMBLE_STORE_65=1:
// 428×926 @3x = 1284×2778, the 6.5" size).
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, resolve } from 'node:path';
import type pg from 'pg';
import { type Browser, chromium, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findPgBin, type PgCluster, startCluster } from '../test/pgCluster';
import { type FakeSupabase, fakeSupabase, PARTNER_USER } from './fakeSupabase';

const OUT = process.env.CRUMBLE_STORE_SHOTS;
const bin = findPgBin();
const MOBILE = resolve(__dirname, '../../manager-mobile');
const USERS = { device: 'kasa@crumble.test', partner: 'ortak@crumble.test' };
const CHROMIUM = '/opt/pw-browsers/chromium';
const HOUR = 3_600_000;
const IST = 3 * HOUR; // Europe/Istanbul, fixed UTC+3

const MENU: [string, [string, number][]][] = [
  ['Kahve', [['Americano', 140], ['Latte', 160], ['Flat White', 165], ['Cappuccino', 160], ['Filtre Kahve', 130], ['Türk Kahvesi', 110]]],
  ['Aromalı Kahve', [['Karamel Latte', 180], ['Mocha', 180], ['Fındıklı Latte', 180]]],
  ['Çay ve Diğer Sıcaklar', [['Çay', 40], ['Bitki Çayı (Büyük)', 150], ['Sıcak Çikolata', 170]]],
  ['Soğuk İçecekler', [['Iced Latte', 170], ['Ev Yapımı Limonata', 140], ['Soda', 50]]],
  ['Detox ve Matcha', [['Matcha Latte', 195], ['Cool Lime', 160], ['Berry Hibiskus', 160]]],
  ['Granola ve Çorba', [['Granola Kase', 220], ['Günün Çorbası', 170]]],
  ['Tost ve Baget', [['Kaşarlı Tost', 180], ['Karışık Tost', 210], ['Tavuklu Baget', 260]]],
  ['Teşhir', [['Brownie', 120], ['Mozaik Pasta', 140], ['Cheesecake', 190], ['Çıtır Kurabiye', 120], ['Waffle', 230], ['Çiçek Böreği', 150]]],
];
const NAMES = ['Elif', 'Can', 'Zeynep', 'Mert', 'Deniz', 'Ece'];

// Deterministic, so the screenshots look the same every run.
let seed = 20261104;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pickOne = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
/** Opening hour weights 9..21: a late-morning and an afternoon peak. */
const HOUR_WEIGHTS = [2, 4, 7, 8, 6, 5, 6, 8, 9, 7, 5, 3, 2];
const saleHour = () => {
  let r = rand() * HOUR_WEIGHTS.reduce((a, b) => a + b);
  for (let i = 0; i < HOUR_WEIGHTS.length; i++) if ((r -= HOUR_WEIGHTS[i]!) < 0) return 9 + i;
  return 21;
};

function serveStatic(dir: string, port: number): Promise<Server> {
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf' };
  const server = createServer((req, res) => {
    let file = join(dir, decodeURIComponent(new URL(req.url!, 'http://x').pathname));
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
    res.setHeader('content-type', types[extname(file)] ?? 'application/octet-stream');
    createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}

interface Product { id: string; name: string; price: number; weight: number }

async function seedDemo(db: pg.Client, now: Date) {
  const products: Product[] = [];
  let order = 0;
  for (const [category, items] of MENU) {
    const catId = randomUUID();
    await db.query('insert into categories (id, name, sort_order) values ($1, $2, $3)', [catId, category, order++]);
    for (const [name, tl] of items) {
      const id = randomUUID();
      products.push({ id, name, price: tl * 100, weight: /Latte|Americano|Tost|Çay$|Brownie|Cheesecake/.test(name) ? 4 : 1 + rand() * 2 });
      await db.query('insert into products (id, category_id, name, price, sort_order) values ($1, $2, $3, $4, $5)', [id, catId, name, tl * 100, products.length]);
    }
  }
  const totalWeight = products.reduce((a, p) => a + p.weight, 0);
  const product = () => {
    let r = rand() * totalWeight;
    for (const p of products) if ((r -= p.weight) < 0) return p;
    return products[0]!;
  };

  const floor = randomUUID();
  await db.query("insert into floor_plans (id, name) values ($1, 'Salon')", [floor]);
  const tables: string[] = [];
  for (let n = 1; n <= 8; n++) {
    const id = randomUUID();
    tables.push(id);
    await db.query("insert into tables (id, floor_plan_id, label, shape, x, y, width, height, color) values ($1, $2, $3, 'rectangle', $4, 100, 210, 110, '#ffffff')", [id, floor, String(n), n * 130]);
  }

  const todayStart = new Date(Math.floor((now.getTime() + IST) / (24 * HOUR)) * 24 * HOUR - IST); // 00:00 Istanbul
  const at = (day: number, hour: number, minute: number) => new Date(todayStart.getTime() + day * 24 * HOUR + hour * HOUR + minute * 60_000);

  /** One sale: items, payment(s), closed unless keepOpen. Returns the cash taken. */
  async function sale(shift: string, opened: Date, closeAt: Date | null, opts: { name?: string; items?: [Product, number, Date][]; partial?: number } = {}) {
    const tab = randomUUID();
    const kind = opts.name ? 'named' : rand() < 0.55 ? 'table' : 'quick';
    await db.query('insert into tabs (id, opened_shift_id, kind, table_id, customer_name, opened_at) values ($1, $2, $3, $4, $5, $6)', [
      tab, shift, kind, kind === 'table' ? pickOne(tables) : null, opts.name ?? null, opened,
    ]);
    const lines = opts.items ?? Array.from({ length: 1 + Math.floor(rand() * 3.2) }, () => [product(), rand() < 0.15 ? 2 : 1, opened] as [Product, number, Date]);
    let total = 0;
    for (const [p, qty, added] of lines) {
      total += p.price * qty;
      await db.query('insert into tab_items (id, tab_id, product_id, name_snapshot, list_price, unit_price, quantity, created_at) values ($1, $2, $3, $4, $5, $5, $6, $7)', [
        randomUUID(), tab, p.id, p.name, p.price, qty, added,
      ]);
    }
    const discount = !opts.name && rand() < 0.06 ? 10 : null;
    if (discount) {
      total -= Math.floor((total * discount) / 100);
      await db.query('update tabs set discount_percent = $2 where id = $1', [tab, discount]);
    }
    const method = rand() < 0.38 ? 'cash' : 'card';
    const amount = closeAt ? total : (opts.partial ?? 0);
    if (amount > 0) {
      await db.query('insert into payments (id, tab_id, shift_id, method, amount, paid_at) values ($1, $2, $3, $4, $5, $6)', [
        randomUUID(), tab, shift, method, amount, closeAt ?? opened,
      ]);
    }
    if (closeAt) await db.query("update tabs set status = 'paid', closed_at = $2, closed_shift_id = $3, total = $4 where id = $1", [tab, closeAt, shift, total]);
    return method === 'cash' ? amount : 0;
  }

  // Past five weeks, closed on most Mondays like a real café might be.
  for (let day = -35; day <= 0; day++) {
    const date = at(day, 0, 0);
    const weekday = new Date(date.getTime() + IST).getUTCDay();
    if (day < -2 && weekday === 1 && day % 14 !== 0) continue;
    const shift = randomUUID();
    const opened = at(day, 9, 20 + Math.floor(rand() * 20));
    await db.query('insert into shifts (id, opened_at, opening_cash) values ($1, $2, 0)', [shift, opened]);
    const busy = (weekday === 0 || weekday === 6 ? 1.35 : 1) * (0.85 + rand() * 0.3) * (1 + (day + 35) / 140);
    const count = Math.round(34 * busy);
    let cash = 0;
    for (let i = 0; i < count; i++) {
      const start = at(day, saleHour(), Math.floor(rand() * 60));
      const close = new Date(start.getTime() + (15 + rand() * 60) * 60_000);
      if (day === 0 && close >= now) continue; // today: only what already happened
      cash += await sale(shift, start, close);
    }
    if (day === -2) {
      // A regular's tab that stays open across days (Açık hesaplar).
      const [latte, tost, brownie] = ['Latte', 'Kaşarlı Tost', 'Brownie'].map((n) => products.find((p) => p.name === n)!);
      await sale(shift, at(day, 15, 10), null, {
        name: 'Elif',
        items: [[latte!, 2, at(day, 15, 10)], [tost!, 1, at(day, 15, 12)], [brownie!, 1, at(-1, 16, 40)], [latte!, 1, at(-1, 16, 40)]],
        partial: 30000,
      });
    }
    if (day === 0) {
      for (const [i, name] of ['Masa', 'Masa', 'Masa', 'Masa', 'Masa', 'Can'].entries()) {
        const start = new Date(now.getTime() - (4 + i * 5) * 60_000); // fresh orders, so Bugün is not "Sakin"
        await sale(shift, start, null, name === 'Can' ? { name } : {});
      }
      break; // today's shift stays open
    }
    await db.query('update shifts set closed_at = $2, expected_cash = $3 where id = $1', [shift, at(day, 22, 5), cash]);
  }
  await db.query("insert into device_status (id, last_sync_at) values ('pos', $1)", [new Date(now.getTime() - 40_000)]);
}

describe.skipIf(!OUT || !bin || !existsSync(CHROMIUM))('App Store ekran görüntüleri', () => {
  let cluster: PgCluster;
  let admin: pg.Client;
  let pool: pg.Pool;
  let cloud: FakeSupabase;
  let web: Server;
  let browser: Browser;
  let phone: Page;
  const cloudPort = 56000 + Math.floor(Math.random() * 900);
  const webPort = cloudPort + 1000;
  // Shot at a lively hour of today so "Bugün" has numbers whatever time this runs.
  const now = new Date(Math.floor((Date.now() + IST) / (24 * HOUR)) * 24 * HOUR - IST + 17 * HOUR + 42 * 60_000);

  beforeAll(async () => {
    mkdirSync(OUT!, { recursive: true });
    cluster = await startCluster(bin!);
    admin = await cluster.connect();
    pool = cluster.pool();
    await admin.query('insert into auth.users (id) values ($1)', [PARTNER_USER]);
    await admin.query('insert into public.partners (user_id, email) values ($1, $2)', [PARTNER_USER, USERS.partner]);
    await seedDemo(admin, now);
    cloud = fakeSupabase(pool, cloudPort, USERS);
    await cloud.start();
    execSync('npx expo export --platform web --output-dir dist-store', {
      cwd: MOBILE,
      stdio: 'pipe',
      env: { ...process.env, EXPO_PUBLIC_SUPABASE_URL: cloud.url, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-test' },
    });
    web = await serveStatic(join(MOBILE, 'dist-store'), webPort);
    browser = await chromium.launch({ executablePath: CHROMIUM });
    phone = await browser.newPage({ viewport: process.env.CRUMBLE_STORE_65 ? { width: 428, height: 926 } : { width: 440, height: 956 }, deviceScaleFactor: 3, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    await phone.clock.setFixedTime(now);
    phone.on('pageerror', (e) => console.log('[telefon hata]', e.message));
  }, 240_000);

  afterAll(async () => {
    await browser?.close();
    web?.close();
    await cloud?.stop();
    await admin?.end();
    await pool?.end();
    cluster?.stop();
  });

  const nav = (name: string) => phone.locator('a[role="tab"]').filter({ hasText: name }).click();
  const shot = async (name: string) => {
    await phone.waitForTimeout(800); // fonts and layout settle
    await phone.screenshot({ path: join(OUT!, `${name}.png`) });
  };

  it('çeker', async () => {
    await phone.goto(`http://127.0.0.1:${webPort}/`);
    await phone.getByLabel('E-posta').fill(USERS.partner);
    await phone.getByLabel('Şifre').fill('x');
    await phone.getByRole('button', { name: 'Giriş' }).click();
    await expect.poll(() => phone.getByTestId('today-revenue').textContent(), { timeout: 30_000 }).not.toBe('0,00 ₺');
    await shot('1-bugun');

    await nav('Raporlar');
    await phone.getByTestId('reports-revenue').waitFor();
    await shot('2-raporlar');
    await phone.getByRole('tab', { name: 'Saatler', exact: true }).click();
    await phone.getByText('Yoğunluk haritası', { exact: false }).waitFor();
    await phone.getByText('Son 3 ay', { exact: true }).click(); // "Bu ay" is only four days old here
    await phone.waitForTimeout(500);
    await shot('3-saatler');

    await nav('Ürünler');
    await phone.getByTestId('product-row').first().waitFor();
    await shot('4-urunler');

    await nav('Satışlar');
    await phone.getByTestId('sale-row').first().waitFor();
    await shot('5-satislar');

    await nav('Bugün');
    await phone.getByTestId('today-open-tabs').click();
    await phone.getByTestId('open-tab-row').filter({ hasText: 'Elif' }).click();
    await phone.getByTestId('tab-remaining').waitFor();
    await shot('6-acik-hesap');
  }, 120_000);
});
