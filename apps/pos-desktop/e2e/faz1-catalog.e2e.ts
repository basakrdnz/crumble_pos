import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchApp, type RunningApp, SEED_CSV, snap, unlock } from './launch';

// Faz 1 kabul: menü yüklenir, fiyat değişince geçmiş satırı oluşur.
describe('Faz 1: katalog ve içe aktarma', () => {
  let run: RunningApp;
  beforeAll(async () => {
    run = await launchApp();
    await unlock(run.page);
  });
  afterAll(async () => {
    await run?.close();
  });

  it('imports the seed CSV after showing a preview', async () => {
    const { page } = run;
    await page.getByRole('button', { name: 'Ayarlar' }).click();
    await page.getByRole('button', { name: 'Menü içe aktar' }).click();
    await page.getByLabel('CSV dosyası').setInputFiles(SEED_CSV);
    await expect.poll(() => page.getByTestId('import-summary').textContent()).toContain('8 yeni kategori, 84 yeni ürün');
    expect(await page.getByRole('table', { name: 'Önizleme' }).locator('tbody tr').count()).toBe(84);
    await snap(page, 'faz1-import-preview');

    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Onayla ve içe aktar' }).click();
    await expect.poll(() => page.getByTestId('import-summary').textContent()).toContain('84 ürün zaten var');
  });

  it('shows the catalog with badges', async () => {
    const { page } = run;
    await page.getByRole('button', { name: 'Kategori ve ürünler' }).click();
    await page.locator('.list-item', { hasText: 'Varsa Kap! (Vitrin)' }).click();
    const table = page.getByRole('table', { name: 'Ürünler' });
    await expect.poll(() => table.locator('tbody tr').count()).toBe(14);
    expect(await table.locator('tr', { hasText: 'Çıtır Kurabiye' }).textContent()).toContain('Pasif');
    // "Teyit edilecek" is no longer shown in the POS (2026-10-29).
    expect(await table.locator('tr', { hasText: 'Peynirli Börek' }).textContent()).not.toContain('Teyit edilecek');
    await snap(page, 'faz1-catalog');
  });

  it('changing a price in the bulk table writes a history row', async () => {
    const { page } = run;
    await page.getByRole('button', { name: 'Toplu fiyat' }).click();
    const price = page.getByLabel('Mocha fiyatı', { exact: true });
    await price.fill('250');
    await price.press('Enter');
    await expect.poll(() => page.getByRole('alert').textContent()).toContain('250,00 ₺');

    // The "satışta" switch takes a product off the sale screen.
    await page.getByRole('button', { name: 'Pasif (2)' }).click();
    await expect.poll(() => page.locator('tr[data-product]').count()).toBe(2);
    await page.getByRole('button', { name: 'Tümü' }).click();
    await page.getByRole('switch', { name: 'Peynirli Börek satışta' }).click();
    await page.getByRole('button', { name: 'Pasif (3)' }).click();
    await expect.poll(() => page.locator('tr[data-product]').count()).toBe(3);
    await page.getByRole('switch', { name: 'Peynirli Börek satışta' }).click();
    await page.getByRole('button', { name: 'Pasif (2)' }).waitFor();

    await page.getByRole('button', { name: 'Değişiklik geçmişi' }).click();
    const firstRow = page.getByRole('table', { name: 'Değişiklik geçmişi' }).locator('tbody tr', { hasText: 'Mocha' }).first();
    await expect.poll(() => firstRow.textContent()).toContain('Mocha');
    expect(await firstRow.textContent()).toContain('240,00 ₺ → 250,00 ₺');
    await snap(page, 'faz1-history');
  });

  it('keeps data after restart', async () => {
    const dbPath = run.dbPath;
    await run.app.close();
    const again = await launchApp(dbPath);
    try {
      await unlock(again.page);
      await again.page.getByRole('button', { name: 'Ayarlar' }).click();
      await again.page.getByRole('button', { name: 'Toplu fiyat' }).click();
      expect(await again.page.getByLabel('Mocha fiyatı', { exact: true }).inputValue()).toBe('250,00');
    } finally {
      await again.app.close();
    }
  });
});
