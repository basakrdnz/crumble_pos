import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importMenu, openShiftUi, pick } from './helpers';
import { launchApp, type RunningApp, snap, unlock } from './launch';

// Kullanıcı geri bildirimi (2026-11-04): açık hesap belli olsun, hızlı satış
// masaya/isme aktarılsın ve açık hesaplar hızlı satışta görünsün, yeni turda
// ürün sayacı 0'dan başlasın, gün sonunda iptal yerine "Hesabı gör".
describe('Kasa: açık hesaplar ve hızlı satış aktarma', () => {
  let run: RunningApp;
  beforeAll(async () => {
    run = await launchApp(undefined, { seedFloor: true });
    await run.app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      win.unmaximize();
      win.setContentSize(1366, 768);
    });
    await unlock(run.page);
    await importMenu(run.page);
    await openShiftUi(run.page);
  });
  afterAll(async () => {
    await run?.close();
  });

  it('moves a quick sale to a table; the open tab shows in the quick sale', async () => {
    const { page } = run;
    await pick(page, 'Kahve', 'Cafe Latte');
    await pick(page, 'Kahve', 'Americano');
    await page.keyboard.press('Escape'); // close the line panel
    await page.getByTestId('open-tabs').getByText('Açık masa ya da hesap yok.').waitFor();
    await page.getByRole('button', { name: 'Masaya aktar' }).click();
    await page.getByRole('dialog', { name: 'Hangi masaya aktarılsın?' }).getByRole('button', { name: '5', exact: true }).click();
    await page.getByText('Sepet boş. Soldan ürün seçin.').waitFor();
    const row = page.locator('[data-open-tab="Masa 5"]');
    await expect.poll(() => row.textContent()).toContain('2 ürün');
    await snap(page, 'hesap-1-hizli-satis-acik-hesaplar');
  });

  it('opens it with a green bar; this round counts from 0', async () => {
    const { page } = run;
    await page.locator('[data-open-tab="Masa 5"]').click();
    await expect.poll(() => page.getByTestId('tab-banner').textContent()).toContain('MASA 5 · AÇIK HESAP');
    // Lines of the earlier round are in the cart, but the tiles start at 0.
    await page.getByRole('tab', { name: 'Kahve' }).click();
    expect(await page.locator('[data-product="Cafe Latte"] .qty').count()).toBe(0);
    await pick(page, 'Kahve', 'Cafe Latte');
    await expect.poll(() => page.locator('[data-product="Cafe Latte"] .qty').textContent()).toBe('1');
    expect(await page.locator('[data-line="Cafe Latte"]').count()).toBe(2); // a new line, the old one kept
    await page.keyboard.press('Escape');
    await snap(page, 'hesap-2-acik-hesap-seridi');
  });

  it('cancelling a table tab asks twice', async () => {
    const { page } = run;
    await page.getByRole('button', { name: /Hesabı iptal et/ }).click();
    await page.getByRole('dialog', { name: 'Hesap iptal edilsin mi?' }).getByRole('button', { name: 'İptal et', exact: true }).click();
    const sure = page.getByRole('dialog', { name: 'Emin misin?' });
    await snap(page, 'hesap-3-iptal-emin-misin');
    await sure.getByRole('button', { name: 'Vazgeç' }).click();
    expect(await page.getByTestId('tab-banner').count()).toBe(1); // still open
    await page.getByRole('button', { name: '← Geri' }).click();
  });

  it('day end: "Hesabı gör" instead of cancelling', async () => {
    const { page } = run;
    await page.getByRole('button', { name: 'Vardiya', exact: true }).click();
    const card = page.locator('[data-decision="Masa 5"]');
    expect(await card.getByRole('button', { name: 'İptal' }).count()).toBe(0);
    expect(await page.getByText('yönetim uygulamasında').count()).toBe(0);
    await card.getByRole('button', { name: 'Hesabı gör' }).click();
    const view = page.getByRole('dialog', { name: 'Masa 5 hesabı' });
    await expect.poll(() => view.textContent()).toContain('Americano');
    await snap(page, 'hesap-4-gun-sonu-hesabi-gor');
    await view.getByRole('button', { name: 'Kapat' }).click();
  });
});
