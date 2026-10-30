import { execSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, resolve } from 'node:path';
import type pg from 'pg';
import { type Browser, chromium, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findPgBin, type PgCluster, startCluster } from '../test/pgCluster';
import { type FakeSupabase, fakeSupabase, PARTNER_USER } from './fakeSupabase';
import { importMenu, openShiftUi, pick } from './helpers';
import { launchApp, type RunningApp, snap, unlock } from './launch';

const bin = findPgBin();
const MOBILE = resolve(__dirname, '../../manager-mobile');
const USERS = { device: 'kasa@crumble.test', partner: 'ortak@crumble.test' };
const CHROMIUM = '/opt/pw-browsers/chromium';

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

async function posSale(pos: Page, category: string, product: string, method: 'Nakit' | 'Kart') {
  await pos.getByRole('button', { name: 'Satış', exact: true }).click();
  await pick(pos, category, product);
  await pos.locator(`[data-line="${product}"]`).waitFor();
  await pos.getByRole('button', { name: method === 'Nakit' ? /Nakit ödendi/ : /Kartla ödendi/ }).click();
  await pos.getByText('Sepet boş. Soldan ürün seçin.').waitFor();
}

// Faz 6 kabul: kasadaki satış birkaç saniye içinde mobilde görünür.
describe.skipIf(!bin || !existsSync(CHROMIUM))('Faz 6: yönetim uygulaması (mobil web + kasa + bulut)', () => {
  let cluster: PgCluster;
  let admin: pg.Client;
  let pool: pg.Pool;
  let cloud: FakeSupabase;
  let web: Server;
  let browser: Browser;
  let phone: Page;
  let pos: RunningApp;
  const cloudPort = 54000 + Math.floor(Math.random() * 900);
  const webPort = cloudPort + 1000;

  beforeAll(async () => {
    cluster = await startCluster(bin!);
    admin = await cluster.connect();
    pool = cluster.pool();
    await admin.query('insert into auth.users (id) values ($1)', [PARTNER_USER]);
    await admin.query('insert into public.partners (user_id, email) values ($1, $2)', [PARTNER_USER, USERS.partner]);
    cloud = fakeSupabase(pool, cloudPort, USERS);
    await cloud.start();

    // The manager app's web build, pointed at the fake cloud. Poll faster in the
    // test because the fake has no Realtime socket.
    execSync('npx expo export --platform web --output-dir dist-e2e', {
      cwd: MOBILE,
      stdio: 'pipe',
      env: { ...process.env, EXPO_PUBLIC_SUPABASE_URL: cloud.url, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-test', EXPO_PUBLIC_POLL_MS: '3000' },
    });
    web = await serveStatic(join(MOBILE, 'dist-e2e'), webPort);
    browser = await chromium.launch({ executablePath: CHROMIUM });
    phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    phone.on('pageerror', (e) => console.log('[telefon hata]', e.message));
    phone.on('console', (m) => m.type() === 'error' && console.log('[telefon konsol]', m.text().slice(0, 300)));

    pos = await launchApp();
    await unlock(pos.page);
    await importMenu(pos.page);
    await pos.page.getByTestId('sync-status').click();
    await pos.page.getByLabel('Supabase adresi').fill(cloud.url);
    await pos.page.getByLabel('Anon key').fill('anon-test');
    await pos.page.getByLabel('Cihaz e-postası').fill(USERS.device);
    await pos.page.getByLabel('Cihaz şifresi').fill('x');
    await pos.page.getByRole('button', { name: 'Bağlan', exact: true }).click();
    await pos.page.getByTestId('sync-status').filter({ hasText: /Senkron ✓/ }).waitFor({ timeout: 20_000 });
    await openShiftUi(pos.page);
  }, 240_000);

  afterAll(async () => {
    await pos?.close();
    await browser?.close();
    web?.close();
    await cloud?.stop();
    await pool?.end();
    await admin?.end();
    cluster?.stop();
  });

  it('only partners can sign in', async () => {
    await phone.goto(`http://127.0.0.1:${webPort}/`);
    await phone.getByLabel('E-posta').fill(USERS.device);
    await phone.getByLabel('Şifre').fill('x');
    await phone.getByRole('button', { name: 'Giriş' }).click();
    await expect.poll(() => phone.getByTestId('login-error').textContent()).toContain('erişemez');

    await phone.getByLabel('E-posta').fill(USERS.partner);
    await phone.getByRole('button', { name: 'Giriş' }).click();
    await expect.poll(() => phone.getByTestId('today-revenue').textContent(), { timeout: 20_000 }).toBe('0,00 ₺');
  });

  it('a sale on the POS shows up on the phone within seconds', async () => {
    const started = Date.now();
    await posSale(pos.page, 'Kahve', 'Cafe Latte', 'Nakit');
    await expect.poll(() => phone.getByTestId('today-revenue').textContent(), { timeout: 15_000, interval: 250 }).toBe('215,00 ₺');
    const seconds = (Date.now() - started) / 1000;
    console.log(`satıştan telefona: ${seconds.toFixed(1)} sn`);
    expect(seconds).toBeLessThan(10);
    expect(await phone.getByTestId('today-cash').textContent()).toBe('215,00 ₺');
    expect(await phone.getByTestId('today-count').textContent()).toBe('1');
    expect(await phone.getByTestId('last-sync').textContent()).toMatch(/Son senkron: \d\d:\d\d/);
    await snap(phone, 'faz6-today');
  });

  it('lists the sale and its detail', async () => {
    await posSale(pos.page, 'Yemek', 'Kaşarlı Tost', 'Kart');
    await phone.getByRole('tab', { name: /Satışlar/ }).click();
    await expect.poll(() => phone.getByTestId('sale-row').count(), { timeout: 15_000 }).toBe(2);
    await phone.getByTestId('sale-row').filter({ hasText: '250,00 ₺' }).click();
    await phone.getByText('Kaşarlı Tost').waitFor();
    await snap(phone, 'faz6-sale');
    await phone.goBack();
  });

  it('product report and reports', async () => {
    await phone.getByRole('tab', { name: /Ürünler/ }).click();
    await expect.poll(() => phone.getByTestId('products-total').textContent(), { timeout: 15_000 }).toContain('465,00 ₺');
    expect(await phone.getByTestId('product-row').count()).toBe(2);
    await snap(phone, 'faz6-products');
    await phone.getByRole('tab', { name: /Raporlar/ }).click();
    await expect.poll(() => phone.getByTestId('reports-revenue').textContent(), { timeout: 15_000 }).toContain('465,00 ₺');
    await snap(phone, 'faz6-reports');
    await phone.getByRole('tab', { name: 'Saatler', exact: true }).click();
    await phone.getByText('Yoğunluk haritası', { exact: false }).waitFor();
    await snap(phone, 'faz6-reports-hours');
  });

  it('change history shows a POS price change (old -> new)', async () => {
    await pos.page.getByRole('button', { name: 'Ayarlar' }).click();
    await pos.page.getByRole('button', { name: 'Toplu fiyat' }).click();
    const price = pos.page.getByLabel('Mocha fiyatı', { exact: true });
    await price.fill('250');
    await price.press('Enter');
    await phone.getByRole('tab', { name: /Diğer/ }).click();
    await phone.getByText('Değişiklik geçmişi').click();
    await expect
      .poll(() => phone.getByTestId('change-row').first().textContent(), { timeout: 20_000 })
      .toContain('fiyat: 240,00 ₺ → 250,00 ₺');
    await phone.goBack();
  });

  it('telefondan menü: price, new product and removal reach the POS', async () => {
    await phone.getByRole('tab', { name: /Ürünler/ }).click();
    await phone.getByRole('tab', { name: 'Menü', exact: true }).click();
    await phone.getByLabel('Ürün ara').fill('Cafe Latte');
    await phone.getByTestId('menu-row').filter({ hasText: 'Cafe Latte' }).click();
    await phone.getByLabel('Yeni fiyat').fill('225');
    await phone.waitForTimeout(500); // let the sheet finish sliding in for the screenshot
    await snap(phone, 'faz6-menu-price');
    await phone.getByRole('button', { name: 'Fiyatı kaydet' }).click();
    await expect.poll(() => phone.getByTestId('menu-row').filter({ hasText: 'Cafe Latte' }).textContent()).toContain('225,00 ₺');

    await phone.getByLabel('Ürün ara').fill('Americano');
    await phone.getByTestId('menu-row').filter({ hasText: 'Americano' }).click();
    await phone.getByRole('button', { name: 'Ürünü menüden kaldır' }).click();
    await phone.getByRole('button', { name: 'Emin misin? Menüden kaldır' }).click();
    await expect.poll(() => phone.getByTestId('menu-row').count()).toBe(0);

    await phone.getByLabel('Ürün ara').fill('');
    await phone.getByRole('button', { name: '+ Ürün ekle' }).click();
    await phone.getByLabel('Ürün adı').fill('Fındıklı Latte');
    await phone.getByLabel('Yeni ürün').getByRole('button', { name: 'Kahve', exact: true }).click();
    await phone.getByLabel('Fiyat', { exact: true }).fill('245');
    await phone.getByRole('button', { name: 'Ürünü ekle' }).click();
    await phone.getByTestId('menu-row').filter({ hasText: 'Fındıklı Latte' }).waitFor();
    await snap(phone, 'faz6-menu');

    // The POS pulls product changes when idle (20 s) and the sale screen refreshes.
    const started = Date.now();
    await pos.page.getByRole('button', { name: 'Satış', exact: true }).click();
    await pos.page.getByRole('tab', { name: 'Kahve' }).click();
    const tile = (name: string) => pos.page.locator(`.product[data-product="${name}"]`);
    await expect.poll(() => tile('Fındıklı Latte').count(), { timeout: 45_000, interval: 500 }).toBe(1);
    console.log(`telefondan kasaya: ${((Date.now() - started) / 1000).toFixed(1)} sn`);
    expect(await tile('Fındıklı Latte').locator('.price').textContent()).toBe('245,00 ₺');
    expect(await tile('Cafe Latte').locator('.price').textContent()).toBe('225,00 ₺');
    expect(await tile('Americano').count()).toBe(0);
    await snap(pos.page, 'faz6-pos-menu');

    // Kasa → Değişiklik geçmişi marks them as coming from the phone.
    await pos.page.getByRole('button', { name: 'Ayarlar', exact: true }).click();
    await pos.page.getByRole('button', { name: 'Değişiklik geçmişi' }).click();
    await expect.poll(() => pos.page.getByText('Telefon', { exact: true }).count()).toBe(3);
  });

  it('the day end (no cash count) appears under Vardiyalar', async () => {
    await pos.page.getByRole('button', { name: 'Vardiya', exact: true }).click();
    await pos.page.getByRole('button', { name: 'Gün sonunu al' }).click();
    await pos.page.getByRole('heading', { name: 'Gün sonu özeti' }).waitFor();

    await phone.getByRole('tab', { name: /Diğer/ }).click();
    await phone.getByText('Vardiyalar').click();
    await expect
      .poll(() => phone.getByTestId('shift-expected').first().textContent(), { timeout: 20_000 })
      .toContain('Beklenen nakit 215,00 ₺');
    expect(await phone.getByTestId('shift-diff').count()).toBe(0);
    await snap(phone, 'faz6-shifts');
  });
});
