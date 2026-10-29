import type { Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cartTotal, importMenu, pick } from './helpers';
import { launchApp, type RunningApp, snap, typeKeypad, unlock } from './launch';

const total = cartTotal;

async function payWith(page: Page, method: 'Nakit' | 'Kart') {
  await page.getByRole('button', { name: method === 'Nakit' ? /Nakit ödendi/ : /Kartla ödendi/ }).click();
  await page.getByText('Sepet boş. Soldan ürün seçin.').waitFor();
}

// Faz 2 kabul (2026-10-29 güncellemesi: ödeme penceresi, para üstü, karma,
// ikram, satır indirimi ve kasa sayımı yok): örnek bir gün arayüzden oynanır,
// gün sonundaki beklenen nakit elle hesapla aynıdır.
describe('Faz 2: vardiya ve hızlı satış', () => {
  let run: RunningApp;
  beforeAll(async () => {
    run = await launchApp();
    await unlock(run.page);
    await importMenu(run.page);
    await run.page.getByRole('button', { name: 'Satış', exact: true }).click();
  });
  afterAll(async () => {
    await run?.close();
  });

  it('opens the shift with one click before selling', async () => {
    const { page } = run;
    await page.getByRole('heading', { name: 'Vardiyayı aç' }).waitFor();
    await page.getByRole('button', { name: 'Vardiyayı aç' }).click();
    await page.getByTestId('shift-status').filter({ hasText: 'Vardiya açık' }).waitFor();
  });

  it('sale 1: 2 × Cafe Latte, F11 = nakit ödendi', async () => {
    const { page } = run;
    await pick(page, 'Kahve', 'Cafe Latte');
    await pick(page, 'Kahve', 'Cafe Latte');
    await expect.poll(() => page.locator('[data-line="Cafe Latte"] .qty-box').textContent()).toBe('2');
    expect(await page.locator('.cart-line').count()).toBe(1);
    expect(await total(page)).toBe('430,00 ₺');
    // The tile shows how many are in the cart.
    const tile = page.locator('.product[data-product="Cafe Latte"]');
    expect(await tile.getByLabel('Sepette 2').count()).toBe(1);
    // − / + on the tile change the quantity without opening the line panel.
    await tile.getByRole('button', { name: 'Cafe Latte artır' }).click();
    await expect.poll(() => total(page)).toBe('645,00 ₺');
    await tile.getByRole('button', { name: 'Cafe Latte azalt' }).click();
    await expect.poll(() => total(page)).toBe('430,00 ₺');
    await page.keyboard.press('F11');
    await expect.poll(() => page.getByTestId('last-sale').textContent()).toContain('430,00 ₺ · nakit');
  });

  it('sale 2: line panel — price change, void; cart %10', async () => {
    const { page } = run;
    await pick(page, 'Yemek', 'Kaşarlı Tost');
    await pick(page, 'Kahve', 'Americano');
    await pick(page, 'Çay ve Diğer Sıcaklar', 'Bardak Çay');
    await pick(page, 'Yemek', 'Karışık Tost');
    await expect.poll(() => page.locator('.cart-line').count()).toBe(4);
    const panel = page.getByRole('complementary', { name: 'İşlemler' });

    // Tost: price 250 -> 200 with the keypad
    await page.locator('[data-line="Kaşarlı Tost"]').click();
    await panel.getByRole('tab', { name: 'Fiyat' }).click();
    await typeKeypad(panel, '200');
    await panel.getByRole('button', { name: 'Uygula (Enter)' }).click();
    await expect.poll(() => page.locator('[data-line="Kaşarlı Tost"]').textContent()).toContain('Fiyat değişti');

    // Americano: quantity typed on the keyboard, then back to 1
    await page.locator('[data-line="Americano"]').click();
    await page.keyboard.type('3');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('[data-line="Americano"] .qty-box').textContent()).toBe('3');
    await typeKeypad(panel, '1');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('[data-line="Americano"] .qty-box').textContent()).toBe('1');

    // No line discount or ikram in the panel any more.
    expect(await panel.getByRole('button', { name: /İkram|İndirim/ }).count()).toBe(0);

    // Karışık tost: removed (void record)
    await page.locator('[data-line="Karışık Tost"]').click();
    await panel.getByRole('button', { name: 'Satırı çıkar' }).click();
    await page.getByLabel('İptal nedeni').fill('yanlış ürün');
    await page.getByRole('button', { name: 'Çıkar', exact: true }).click();
    await page.locator('[data-line="Karışık Tost"]').waitFor({ state: 'detached' });

    // − at quantity 1 removes the line (void record).
    await pick(page, 'Kahve', 'Espresso');
    await page.locator('[data-line="Espresso"]').waitFor();
    await page.getByRole('button', { name: 'Espresso azalt' }).click();
    await page.locator('[data-line="Espresso"]').waitFor({ state: 'detached' });
    expect(await page.locator('.product[data-product="Espresso"] .qty-ctrl').count()).toBe(0);

    // 200 + 215 + 65 = 480, sepet %10 = 48 -> 432
    await page.getByRole('button', { name: 'Sepet %10' }).click();
    await expect.poll(() => total(page)).toBe('432,00 ₺');
    await snap(page, 'faz2-sale');
    await payWith(page, 'Nakit');
  });

  it('sale 3: typed cart discount %12, card (F12)', async () => {
    const { page } = run;
    await pick(page, 'Yemek', 'Köfte Kase');
    await page.locator('[data-line="Köfte Kase"]').waitFor();
    await page.getByRole('button', { name: 'Sepet indirimi elle' }).click();
    await typeKeypad(page.getByRole('complementary', { name: 'İşlemler' }), '12');
    await page.keyboard.press('Enter');
    // 12% of 480 = 57,60 (rounded down to kuruş, here exact); 480 - 57,60 = 422,40
    await expect.poll(() => total(page)).toBe('422,40 ₺');
    expect(await page.getByRole('button', { name: 'Sepet indirimi elle' }).textContent()).toBe('%12');
    await page.keyboard.press('F12');
    await page.getByText('Sepet boş. Soldan ürün seçin.').waitFor();
  });

  it('sale 4: card only; sale 5: cancelled', async () => {
    const { page } = run;
    await pick(page, 'Soğuk İçecekler', 'Cool Lime');
    await page.locator('[data-line="Cool Lime"]').waitFor();
    await payWith(page, 'Kart');

    await pick(page, 'Kahve', 'Mocha');
    await page.locator('[data-line="Mocha"]').waitFor();
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: /Satışı iptal et/ }).click();
    await page.getByText('Sepet boş. Soldan ürün seçin.').waitFor();
  });

  it('ends the day with the hand-calculated expected cash', async () => {
    const { page } = run;
    await page.getByRole('button', { name: 'Vardiya', exact: true }).click();
    // Elle: 430 + 432 = 862 ₺ nakit
    await expect.poll(() => page.locator('[data-stat="Nakit"]').textContent()).toBe('862,00 ₺');
    expect(await page.getByText('Açık hesap yok.').count()).toBe(1);
    await page.getByRole('button', { name: 'Gün sonunu al' }).click();

    await page.getByRole('heading', { name: 'Gün sonu özeti' }).waitFor();
    const cell = (label: string) => page.locator(`[data-summary="${label}"]`).textContent();
    expect(await cell('Beklenen nakit')).toBe('862,00 ₺');
    expect(await page.locator('[data-summary="Sayılan nakit"]').count()).toBe(0);
    expect(await page.locator('[data-summary="İkram toplamı"]').count()).toBe(0);
    expect(await cell('Kart satışlar')).toBe('712,40 ₺'); // 422,40 + 290
    expect(await cell('Satış adedi')).toBe('4');
    expect(await cell('İndirim toplamı')).toBe('105,60 ₺'); // 48 + 57,60
    expect(await cell('İptal toplamı')).toBe('635,00 ₺ (1 hesap)'); // karışık tost 285 + espresso 110 + mocha 240
    expect(await cell('Fiyat değişikliği farkı')).toBe('50,00 ₺');
    await snap(page, 'faz2-end-of-day');
    await page.getByRole('button', { name: 'Tamam' }).click();
    await page.getByTestId('shift-status').filter({ hasText: 'Vardiya kapalı' }).waitFor();
  });

  it('locks and unlocks with the password', async () => {
    const { page } = run;
    await page.getByRole('button', { name: 'Kilitle' }).click();
    await page.getByLabel('Şifre', { exact: true }).fill('yanlis');
    await page.getByRole('button', { name: 'Giriş' }).click();
    await expect.poll(() => page.getByRole('alert').textContent()).toContain('Şifre yanlış');
    await unlock(page);
  });
});
