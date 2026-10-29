import type { Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importMenu, openShiftUi, pick } from './helpers';
import { launchApp, type RunningApp, snap, typeKeypad, unlock } from './launch';

async function pay(page: Page, method: 'Nakit' | 'Kart', line: string) {
  await page.locator(`[data-line="${line}"]`).waitFor();
  await page.getByRole('button', { name: method === 'Nakit' ? /Nakit ödendi/ : /Kartla ödendi/ }).click();
  await page.getByText('Sepet boş', { exact: false }).first().waitFor();
}

// Faz 4: satır ve satış iadesi, kapanış toplamlarına yansıma.
describe('Faz 4: iptal ve iade', () => {
  let run: RunningApp;
  beforeAll(async () => {
    run = await launchApp();
    await unlock(run.page);
    await importMenu(run.page);
    await openShiftUi(run.page);
  });
  afterAll(async () => {
    await run?.close();
  });

  it('makes two sales', async () => {
    const { page } = run;
    await pick(page, 'Kahve', 'Cafe Latte');
    await pick(page, 'Yemek', 'Kaşarlı Tost');
    await pay(page, 'Nakit', 'Kaşarlı Tost'); // 465 nakit
    await pick(page, 'Soğuk İçecekler', 'Cool Lime');
    await pay(page, 'Kart', 'Cool Lime'); // 290 kart
  });

  it('refunds one line of the cash sale', async () => {
    const { page } = run;
    await page.getByRole('button', { name: 'Satışlar' }).click();
    await page.locator('tr', { hasText: '465,00 ₺' }).click();
    const detail = page.getByRole('dialog', { name: 'Satış detayı' });
    await detail.locator('tr', { hasText: 'Kaşarlı Tost' }).getByRole('button', { name: 'İade' }).click();
    const refund = page.getByRole('dialog', { name: 'İade' });
    expect(await refund.getByTestId('refund-amount').textContent()).toBe('250,00 ₺');
    await refund.getByLabel('İade nedeni').fill('soğuk geldi');
    await snap(page, 'faz4-refund');
    await refund.getByRole('button', { name: 'İade et' }).click();
    await expect.poll(() => detail.textContent()).toContain('soğuk geldi');
    await detail.getByRole('button', { name: 'Kapat' }).click();
    await expect.poll(() => page.locator('tr', { hasText: '465,00 ₺' }).textContent()).toContain('İade 250,00 ₺');
  });

  it('refunds the whole card sale', async () => {
    const { page } = run;
    await page.locator('tr', { hasText: '290,00 ₺' }).click();
    const detail = page.getByRole('dialog', { name: 'Satış detayı' });
    await detail.getByRole('button', { name: /Tamamını iade et/ }).click();
    await page.getByRole('dialog', { name: 'Tamamını iade et' }).getByRole('button', { name: 'İade et' }).click();
    await expect.poll(() => detail.textContent()).toContain('Kart 290,00 ₺');
    await detail.getByRole('button', { name: 'Kapat' }).click();
    await expect.poll(() => page.locator('tr', { hasText: '290,00 ₺' }).textContent()).toContain('İade edildi');
    await snap(page, 'faz4-sales');
  });

  it('cancels a named tab with a partial payment by refunding it', async () => {
    const { page } = run;
    await page.keyboard.press('F3');
    const dialog = page.getByRole('dialog', { name: 'İsimle hesap aç' });
    await dialog.getByLabel('İsim soyisim').fill('Deniz');
    await dialog.getByRole('button', { name: 'Hesap aç', exact: true }).click();
    await pick(page, 'Yemek', 'Köfte Kase');
    await page.locator('[data-line="Köfte Kase"]').waitFor();
    await page.getByTestId('pay-amount').click();
    await typeKeypad(page.getByRole('complementary', { name: 'İşlemler' }), '100');
    await page.getByRole('button', { name: 'Uygula (Enter)' }).click();
    await page.getByRole('button', { name: /Nakit ödendi/ }).click();
    await page.getByText('Ödenen').waitFor();

    page.once('dialog', (d) => {
      expect(d.message()).toContain('100,00 ₺ iade edilip');
      void d.accept();
    });
    await page.getByRole('button', { name: /Hesabı iptal et/ }).click();
    await page.getByText('Açık hesap yok.').waitFor();
  });

  it('refunds are reflected in the day end', async () => {
    const { page } = run;
    await page.getByRole('button', { name: 'Vardiya', exact: true }).click();
    await expect.poll(() => page.locator('[data-stat="İade"]').textContent()).toBe('640,00 ₺'); // 350 + 290
    await page.getByRole('button', { name: 'Gün sonunu al' }).click();
    const cell = (label: string) => page.locator(`[data-summary="${label}"]`).textContent();
    await expect.poll(() => cell('Nakit iadeler')).toBe('350,00 ₺'); // 250 + 100
    expect(await cell('Kart iadeler')).toBe('290,00 ₺');
    // 465 + 100 − 350 = 215 (no opening cash since 2026-10-29)
    expect(await cell('Beklenen nakit')).toBe('215,00 ₺');
    expect(await cell('İptal toplamı')).toBe('480,00 ₺ (1 hesap)');
  });
});
