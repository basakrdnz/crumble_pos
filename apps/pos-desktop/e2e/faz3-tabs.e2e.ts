import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cartTotal, importMenu, openShiftUi, pick } from './helpers';
import { launchApp, type RunningApp, snap, typeKeypad, unlock } from './launch';

// Faz 3 kabul: masaya tıkla hesap aç, ürün ekle, kısmi ödeme al, kapat.
describe('Faz 3: hesap ve kroki', () => {
  let run: RunningApp;
  beforeAll(async () => {
    run = await launchApp();
    await unlock(run.page);
    await importMenu(run.page);
  });
  afterAll(async () => {
    await run?.close();
  });

  it('builds a floor plan with two sections in the editor', async () => {
    const { page } = run;
    await page.getByRole('button', { name: 'Kroki düzenle' }).click();
    for (const name of ['İç mekan', 'Bahçe']) {
      await page.getByRole('button', { name: '+ Bölüm ekle' }).click();
      const dialog = page.getByRole('dialog', { name: 'Yeni bölüm' });
      await dialog.getByLabel('Bölüm adı').fill(name);
      await dialog.getByRole('button', { name: 'Tamam' }).click();
      await page.getByRole('button', { name, exact: true }).waitFor();
    }
    await page.getByRole('button', { name: 'İç mekan', exact: true }).click();
    await page.getByRole('button', { name: '+ Kare' }).click();
    await page.locator('[data-table="1"]').waitFor();

    // Drag table 1 right/down: position is saved on release.
    const t1 = page.locator('[data-table="1"]');
    const box = (await t1.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 250, box.y + 150, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await t1.boundingBox())!.x).toBeGreaterThan(box.x + 150);

    await page.getByRole('button', { name: '+ Daire' }).click();
    await page.locator('[data-table="2"]').waitFor();
    await page.getByLabel('Etiket').fill('Pencere');
    await page.getByLabel('Etiket').press('Enter');
    await page.locator('[data-table="Pencere"]').waitFor();
    await page.getByRole('button', { name: '+ Kanepe / koltuk' }).click();
    // Next free number: "2" was renamed, so the sofa gets 2.
    await page.locator('[data-table="Kanepe 2"]').waitFor();
    await snap(page, 'faz3-editor');
  });

  it('opens a tab by clicking a table, takes a partial payment and keeps it open', async () => {
    const { page } = run;
    await openShiftUi(page, '0');
    await page.getByRole('button', { name: 'Kroki', exact: true }).click();
    await page.locator('[data-table="1"]').click();
    await pick(page, 'Kahve', 'Cafe Latte');
    await pick(page, 'Kahve', 'Cafe Latte');
    await pick(page, 'Yemek', 'Köfte Kase');
    await expect.poll(() => cartTotal(page)).toBe('910,00 ₺');

    await page.keyboard.press('F12');
    const dialog = page.getByRole('dialog', { name: 'Ödeme' });
    await dialog.getByText('Bu ödeme').click();
    await typeKeypad(dialog, '400');
    await dialog.getByRole('button', { name: 'Ödemeyi al (F12)' }).click();
    await dialog.waitFor({ state: 'detached' });
    await expect.poll(() => cartTotal(page)).toBe('510,00 ₺');

    await page.getByRole('button', { name: '← Geri' }).click();
    const busy = page.locator('[data-table="1"]');
    await expect.poll(() => busy.textContent()).toContain('510,00 ₺');
    await snap(page, 'faz3-floor');
  });

  it('moves the tab to another table and gives it a name', async () => {
    const { page } = run;
    await page.locator('[data-table="1"]').click();
    await page.getByRole('button', { name: 'Masa değiştir' }).click();
    await page.getByRole('dialog', { name: 'Masa değiştir' }).getByRole('button', { name: 'Pencere' }).click();
    await page.getByRole('button', { name: 'İsim', exact: true }).click();
    const nameDialog = page.getByRole('dialog', { name: 'Hesap ismi' });
    await nameDialog.getByLabel('İsim soyisim').fill('Zeynep');
    await nameDialog.getByRole('button', { name: 'Tamam' }).click();
    await page.getByText('Masa Pencere · Zeynep').waitFor();
    await page.getByRole('button', { name: '← Geri' }).click();
    await expect.poll(() => page.locator('[data-table="Pencere"]').textContent()).toContain('Zeynep');
    expect(await page.locator('[data-table="1"]').textContent()).toBe('1');
  });

  it('adds more and closes the tab with the rest (mixed)', async () => {
    const { page } = run;
    await page.locator('[data-table="Pencere"]').click();
    await pick(page, 'Çay ve Diğer Sıcaklar', 'Bardak Çay');
    await expect.poll(() => cartTotal(page)).toBe('575,00 ₺');
    await page.keyboard.press('F12');
    const dialog = page.getByRole('dialog', { name: 'Ödeme' });
    await dialog.getByRole('button', { name: 'Karma' }).click();
    await typeKeypad(dialog, '75');
    await dialog.getByRole('button', { name: 'Ödemeyi al (F12)' }).click();
    // Closing returns to the floor map with the table free again.
    await page.getByRole('tablist', { name: 'Bölümler' }).waitFor();
    await expect.poll(() => page.locator('[data-table="Pencere"]').textContent()).toBe('Pencere');
  });

  it('F3 opens a named tab from anywhere', async () => {
    const { page } = run;
    await page.getByRole('button', { name: 'Satış', exact: true }).click();
    await page.keyboard.press('F3');
    const dialog = page.getByRole('dialog', { name: 'İsimle hesap aç' });
    await dialog.getByLabel('İsim soyisim').fill('Mehmet Can');
    await dialog.getByRole('button', { name: 'Hesap aç', exact: true }).click();
    await pick(page, 'Kahve', 'Espresso');
    await expect.poll(() => cartTotal(page)).toBe('110,00 ₺');
    await page.getByRole('button', { name: '← Geri' }).click();
    const card = page.locator('[data-tab="Mehmet Can"]');
    await expect.poll(() => card.textContent()).toContain('110,00 ₺');
    await snap(page, 'faz3-tabs');
  });

  it('shift summary counts the partial payments', async () => {
    const { page } = run;
    await page.getByRole('button', { name: 'Vardiya', exact: true }).click();
    // cash 400 + 75
    await expect.poll(() => page.locator('[data-summary="Nakit satışlar"]').textContent()).toBe('475,00 ₺');
    expect(await page.locator('[data-summary="Kart satışlar"]').textContent()).toBe('500,00 ₺');
    expect(await page.locator('[data-summary="Satış adedi"]').textContent()).toBe('1');
  });
});
