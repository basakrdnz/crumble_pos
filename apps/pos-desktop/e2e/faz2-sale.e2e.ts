import type { Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cartTotal, importMenu, pick } from './helpers';
import { launchApp, type RunningApp, snap, typeKeypad, unlock } from './launch';

const total = cartTotal;

async function payCash(page: Page, received?: string) {
  await page.keyboard.press('F12');
  const dialog = page.getByRole('dialog', { name: 'Ödeme' });
  await dialog.getByRole('button', { name: 'Nakit', exact: true }).click();
  if (received) await typeKeypad(dialog, received);
  await dialog.getByRole('button', { name: 'Ödemeyi al (F12)' }).click();
  await dialog.waitFor({ state: 'detached' });
}

// Faz 2 kabul: örnek bir gün arayüzden oynanır, kapanıştaki beklenen nakit elle hesapla aynıdır.
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

  it('asks for the opening cash before selling', async () => {
    const { page } = run;
    await page.getByRole('heading', { name: 'Vardiyayı aç' }).waitFor();
    await typeKeypad(page, '500');
    await page.getByRole('button', { name: 'Vardiyayı aç' }).click();
    await page.getByTestId('shift-status').filter({ hasText: 'Vardiya açık' }).waitFor();
  });

  it('sale 1: 2 × Cafe Latte, cash 500 ₺ -> change 70 ₺', async () => {
    const { page } = run;
    await pick(page, 'Kahve', 'Cafe Latte');
    await pick(page, 'Kahve', 'Cafe Latte');
    await expect.poll(() => page.locator('[data-line="Cafe Latte"]').textContent()).toContain('2 × 215,00 ₺');
    expect(await page.locator('.cart-line').count()).toBe(1);
    expect(await total(page)).toBe('430,00 ₺');

    await page.keyboard.press('F12');
    const dialog = page.getByRole('dialog', { name: 'Ödeme' });
    await typeKeypad(dialog, '500');
    expect(await dialog.getByTestId('pay-change').textContent()).toBe('70,00 ₺');
    await snap(page, 'faz2-payment');
    await dialog.getByRole('button', { name: 'Ödemeyi al (F12)' }).click();
    await expect.poll(() => page.getByTestId('last-sale').textContent()).toContain('Para üstü 70,00 ₺');
  });

  it('sale 2: line actions — price change, %10, comp, void with keypad', async () => {
    const { page } = run;
    await pick(page, 'Yemek', 'Kaşarlı Tost');
    await pick(page, 'Kahve', 'Americano');
    await pick(page, 'Çay ve Diğer Sıcaklar', 'Bardak Çay');
    await pick(page, 'Yemek', 'Karışık Tost');
    await expect.poll(() => page.locator('.cart-line').count()).toBe(4);

    // Tost: price 250 -> 200 with the keypad
    await page.locator('[data-line="Kaşarlı Tost"]').click();
    await page.getByRole('button', { name: 'Fiyatı değiştir' }).click();
    await typeKeypad(page.getByRole('complementary', { name: 'İşlemler' }), '200');
    await page.getByRole('button', { name: 'Tamam' }).click();
    await expect.poll(() => page.locator('[data-line="Kaşarlı Tost"]').textContent()).toContain('Fiyat değişti');

    // Americano %10
    await page.locator('[data-line="Americano"]').click();
    await page.getByRole('button', { name: 'İndirim %10' }).click();

    // Çay ikram
    await page.locator('[data-line="Bardak Çay"]').click();
    await page.getByRole('button', { name: 'İkram', exact: true }).click();

    // Karışık tost: removed (void record)
    await page.locator('[data-line="Karışık Tost"]').click();
    await page.getByRole('button', { name: 'İptal (çıkar)' }).click();
    await page.getByLabel('İptal nedeni').fill('yanlış ürün');
    await page.getByRole('button', { name: 'Çıkar', exact: true }).click();
    await page.locator('[data-line="Karışık Tost"]').waitFor({ state: 'detached' });

    // 200 + 193,50 + 0 = 393,50
    await expect.poll(() => total(page)).toBe('393,50 ₺');
    await snap(page, 'faz2-sale');
    await payCash(page);
  });

  it('sale 3: cart discount %15 and mixed payment', async () => {
    const { page } = run;
    await pick(page, 'Yemek', 'Köfte Kase');
    await page.locator('[data-line="Köfte Kase"]').waitFor();
    await page.getByRole('button', { name: 'Sepet %15' }).click();
    // 480 - 72 = 408
    await expect.poll(() => total(page)).toBe('408,00 ₺');
    await page.keyboard.press('F12');
    const dialog = page.getByRole('dialog', { name: 'Ödeme' });
    await dialog.getByRole('button', { name: 'Karma' }).click();
    await typeKeypad(dialog, '100');
    await dialog.getByRole('button', { name: 'Ödemeyi al (F12)' }).click();
    await dialog.waitFor({ state: 'detached' });
  });

  it('sale 4: card only; sale 5: cancelled', async () => {
    const { page } = run;
    await pick(page, 'Soğuk İçecekler', 'Cool Lime');
    await page.locator('[data-line="Cool Lime"]').waitFor();
    await page.keyboard.press('F12');
    const dialog = page.getByRole('dialog', { name: 'Ödeme' });
    await dialog.getByRole('button', { name: 'Kart' }).click();
    await dialog.getByRole('button', { name: 'Ödemeyi al (F12)' }).click();
    await dialog.waitFor({ state: 'detached' });

    await pick(page, 'Kahve', 'Mocha');
    await page.locator('[data-line="Mocha"]').waitFor();
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Satışı iptal et' }).click();
    await page.getByText('Sepet boş').waitFor();
  });

  it('closes the shift with the hand-calculated expected cash', async () => {
    const { page } = run;
    await page.getByRole('button', { name: 'Vardiya', exact: true }).click();
    // Elle: 500 + 430 + 393,50 + 100 = 1.423,50 ₺
    const expected = page.locator('[data-summary="Beklenen nakit"]');
    await expect.poll(() => expected.textContent()).toBe('1.423,50 ₺');

    await page.getByRole('button', { name: 'Vardiyayı kapat' }).click();
    const dialog = page.getByRole('dialog', { name: 'Vardiyayı kapat' });
    await typeKeypad(dialog, '1420');
    await dialog.getByRole('button', { name: 'Kapat ve özeti göster' }).click();

    await page.getByRole('heading', { name: 'Gün sonu özeti' }).waitFor();
    const cell = (label: string) => page.locator(`[data-summary="${label}"]`).textContent();
    expect(await cell('Beklenen nakit')).toBe('1.423,50 ₺');
    expect(await cell('Sayılan nakit')).toBe('1.420,00 ₺');
    expect(await cell('Fark')).toBe('-3,50 ₺');
    expect(await cell('Kart satışlar')).toBe('598,00 ₺'); // 308 + 290
    expect(await cell('Satış adedi')).toBe('4');
    expect(await cell('İndirim toplamı')).toBe('93,50 ₺'); // 21,50 + 72
    expect(await cell('İkram toplamı')).toBe('65,00 ₺');
    expect(await cell('İptal toplamı')).toBe('525,00 ₺ (1 hesap)'); // karışık tost 285 + mocha 240
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
