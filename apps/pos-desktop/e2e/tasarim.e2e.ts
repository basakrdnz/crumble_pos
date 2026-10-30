import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cartTotal, importMenu, openShiftUi, pick } from './helpers';
import { launchApp, type RunningApp, snap, typeKeypad, unlock } from './launch';

// Tasarım yenileme (2026-10-29): walks every main screen at the cafe's screen
// size and saves screenshots (CRUMBLE_SCREENSHOTS) for review.
describe('Tasarım: G2 ekran turu', () => {
  let run: RunningApp;
  beforeAll(async () => {
    run = await launchApp(undefined, { seedFloor: true }); // Crumble salonu
    await run.app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      win.unmaximize();
      win.setContentSize(1366, 768);
    });
  });
  afterAll(async () => {
    await run?.close();
  });

  it('login, shift and quick sale with Nakit/Kart buttons', async () => {
    const { page } = run;
    await page.getByLabel('Şifre', { exact: true }).waitFor();
    await unlock(page);
    await page.getByRole('button', { name: 'Kilitle' }).click();
    await page.getByRole('heading', { name: 'Kasa şifresi' }).waitFor();
    await snap(page, 'tasarim-1-giris');
    await unlock(page);

    await importMenu(page);
    await openShiftUi(page);
    await pick(page, 'Kahve', 'Cafe Latte');
    await pick(page, 'Kahve', 'Cafe Latte');
    await pick(page, 'Kahve', 'Americano');
    await pick(page, 'Yemek', 'Kaşarlı Tost');
    await page.getByRole('tab', { name: 'Kahve' }).click();
    // Americano: price 215 -> 200 in the line panel
    await page.locator('[data-line="Americano"]').click();
    await page.getByRole('tab', { name: 'Fiyat' }).click();
    await typeKeypad(page.getByRole('complementary', { name: 'İşlemler' }), '200');
    await page.getByRole('button', { name: 'Uygula (Enter)' }).click();
    await expect.poll(() => page.locator('[data-line="Americano"]').textContent()).toContain('Fiyat değişti');
    await page.getByRole('button', { name: 'Sepet %10' }).click();
    // 430 + 200 + 250 = 880, -%10 = 792
    await expect.poll(() => cartTotal(page)).toBe('792,00 ₺');
    await page.locator('[data-line="Cafe Latte"]').click();
    await snap(page, 'tasarim-2-satis');

    // Bitki çayı: "i" opens the tea list (information only, the cart does not change).
    await page.getByRole('tab', { name: 'Çay ve Diğer Sıcaklar' }).click();
    expect(await page.locator('.product[data-product^="Adaçayı"]').count()).toBe(0);
    await page.getByRole('button', { name: 'Bitki Çayı (Küçük) bilgi' }).click();
    const teas = page.getByRole('dialog', { name: 'Bitki çayları' });
    await expect.poll(() => teas.textContent()).toContain('Calm Tea');
    expect(await teas.textContent()).toContain('Lavanta, tulsi');
    await snap(page, 'tasarim-2b-cay-bilgisi');
    await teas.getByRole('button', { name: 'Kapat' }).click();
    await page.getByRole('tab', { name: 'Kahve' }).click();
    await page.locator('[data-line="Cafe Latte"]').click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Kartla ödendi/ }).click();
    await expect.poll(() => page.getByTestId('last-sale').textContent()).toContain('792,00 ₺ · kart');
  });

  it('floor plan, table tab with partial payment and the tab cards', async () => {
    const { page } = run;
    // A new POS starts with the Crumble floor plan: 8 tables, 2 at the fireplace.
    await page.getByRole('button', { name: 'Kroki', exact: true }).click();
    await expect.poll(() => page.locator('.floor-table').count()).toBe(8);
    expect(await page.locator('[data-table="2"]').textContent()).toContain('Şömine');
    await page.getByRole('button', { name: 'Masa 2', exact: true }).click();
    await pick(page, 'Kahve', 'Türk Kahvesi');
    await pick(page, 'Kahve', 'Türk Kahvesi');
    await pick(page, 'Çay ve Diğer Sıcaklar', 'Bardak Çay');
    await page.getByTestId('pay-amount').click();
    await typeKeypad(page.getByRole('complementary', { name: 'İşlemler' }), '100');
    await page.getByRole('button', { name: 'Uygula (Enter)' }).click();
    await expect.poll(() => page.getByTestId('pay-amount').textContent()).toBe('100,00 ₺');
    await page.getByRole('button', { name: /Nakit ödendi/ }).click();
    await expect.poll(() => page.getByText('Ödenen').count()).toBe(1);
    await snap(page, 'tasarim-3-masa-hesabi');
    await page.getByRole('button', { name: '← Geri' }).click();

    await page.getByRole('button', { name: 'Masa 5', exact: true }).click();
    await pick(page, 'Kahve', 'Flat White');
    await page.getByRole('button', { name: '← Geri' }).click();
    await page.getByRole('button', { name: 'Masa 5', exact: true }).waitFor();
    await snap(page, 'tasarim-4-kroki');

    await page.getByRole('button', { name: 'Hesaplar', exact: true }).click();
    await page.getByRole('button', { name: /İsimle hesap aç/ }).click();
    await page.getByLabel('İsim soyisim').fill('Mehmet');
    await page.getByRole('button', { name: 'Hesap aç', exact: true }).click();
    await pick(page, 'Kahve', 'Filtre Kahve');
    await page.getByRole('button', { name: '← Geri' }).click();
    await page.locator('[data-tab="Mehmet"]').waitFor();
    await snap(page, 'tasarim-5-hesaplar');
  });

  it('day end needs a decision for every open tab', async () => {
    const { page } = run;
    await page.getByRole('button', { name: 'Vardiya', exact: true }).click();
    await page.getByRole('heading', { name: 'Gün sonu', exact: true }).waitFor();
    const close = page.getByRole('button', { name: 'Gün sonunu al' });
    expect(await close.isDisabled()).toBe(true);
    await page.locator('[data-decision="Masa 5"]').getByRole('button', { name: 'Kart' }).click();
    await page.locator('[data-decision="Mehmet"]').getByRole('button', { name: 'Devret' }).click();
    await snap(page, 'tasarim-6-gun-sonu');
    expect(await close.isDisabled()).toBe(true); // Masa 2 still open
    await page.locator('[data-decision="Masa 2"]').getByRole('button', { name: 'Nakit' }).click();
    await expect.poll(() => close.isDisabled()).toBe(false);
    await close.click();
    await page.getByRole('heading', { name: 'Gün sonu özeti' }).waitFor();
    const cell = (label: string) => page.locator(`[data-summary="${label}"]`).textContent();
    // Nakit: Masa 2 100 + kalan (2 × 160 + 65 − 100 = 285) = 385 ₺
    expect(await cell('Beklenen nakit')).toBe('385,00 ₺');
    expect(await page.getByText('1 açık hesap sonraki vardiyaya devredildi.').count()).toBe(1);
    await page.getByRole('button', { name: 'Tamam' }).click();
  });

  it('settings: prices without "teyit edilecek"', async () => {
    const { page } = run;
    await page.getByRole('button', { name: 'Ayarlar', exact: true }).click();
    await page.getByRole('button', { name: 'Toplu fiyat' }).click();
    await page.locator('[data-product="Cafe Latte"]').waitFor();
    expect(await page.getByText('Teyit edilecek').count()).toBe(0);
    await snap(page, 'tasarim-7-ayarlar');
  });
});
