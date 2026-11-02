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
    // "×" on a line removes it at once.
    await pick(page, 'Kahve', 'Mocha');
    await page.getByRole('button', { name: 'Mocha sil' }).click();
    await expect.poll(() => page.locator('[data-line="Mocha"]').count()).toBe(0);
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
    await page.getByRole('button', { name: 'Masa', exact: true }).click();
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

    // Named tabs live on the same page (Hesaplar merged into Kroki).
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
    // The report day is visible: "2 Kasım 2026 Pazartesi · açılış 18:30".
    expect(await page.getByTestId('shift-day').textContent()).toMatch(/^\d{1,2} \S+ \d{4} \S+ · açılış \d\d:\d\d$/);
    const close = page.getByRole('button', { name: 'Gün sonunu al' });
    expect(await close.isDisabled()).toBe(true);
    await page.locator('[data-decision="Masa 5"]').getByRole('button', { name: 'Kart' }).click();
    await page.locator('[data-decision="Mehmet"]').getByRole('button', { name: 'Devret' }).click();
    // Week calendar: today is outlined and ticked (a shift was opened today).
    const today = page.locator('.cal-day.today');
    expect(await today.getAttribute('class')).toContain('worked');
    await page.getByRole('button', { name: 'Önceki hafta' }).click();
    expect(await page.locator('.cal-day.today').count()).toBe(0);
    await page.getByRole('button', { name: 'Bugün', exact: true }).click();
    await page.locator('.cal-day.today').waitFor();
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

    // One shift per day: the same day continues instead of opening a second shift.
    await page.getByRole('button', { name: 'Satış', exact: true }).click();
    await page.getByTestId('continue-shift').waitFor();
    expect(await page.getByRole('button', { name: 'Vardiyayı aç' }).count()).toBe(0);
    await snap(page, 'tasarim-6b-devam');
    await page.getByRole('button', { name: 'Bugünün vardiyasına devam et' }).click();
    await page.getByTestId('shift-status').filter({ hasText: 'Vardiya açık' }).waitFor();
    // The earlier sales are still in today's shift.
    await page.getByRole('button', { name: 'Vardiya', exact: true }).click();
    await expect.poll(() => page.locator('[data-stat="Nakit"]').textContent()).toBe('385,00 ₺');

    // Closing the window with the shift open asks first; "Gün sonuna git" keeps it open on the day end.
    await page.getByRole('button', { name: 'Satış', exact: true }).click();
    await run.app.evaluate(({ dialog, BrowserWindow }) => {
      process.env.CRUMBLE_CONFIRM_CLOSE = '1';
      const g = globalThis as unknown as { asked: string[] };
      g.asked = [];
      dialog.showMessageBox = (async (_win: unknown, options: { message: string }) => {
        g.asked.push(options.message);
        return { response: 0, checkboxChecked: false };
      }) as never;
      BrowserWindow.getAllWindows()[0]!.close();
    });
    await page.getByRole('heading', { name: 'Gün sonu', exact: true }).waitFor();
    expect(await run.app.evaluate(() => (globalThis as unknown as { asked: string[] }).asked)).toEqual(['Gün sonu alınmadı']);
    await run.app.evaluate(() => {
      process.env.CRUMBLE_CONFIRM_CLOSE = '0';
    });
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
