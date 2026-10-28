import type { Page } from 'playwright-core';
import { SEED_CSV, typeKeypad } from './launch';

export async function importMenu(page: Page) {
  await page.getByRole('button', { name: 'Ayarlar' }).click();
  await page.getByRole('button', { name: 'Menü içe aktar' }).click();
  await page.getByLabel('CSV dosyası').setInputFiles(SEED_CSV);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Onayla ve içe aktar' }).click();
  await page.getByTestId('import-summary').filter({ hasText: 'zaten var' }).waitFor();
}

export async function openShiftUi(page: Page, cash: string) {
  await page.getByRole('button', { name: 'Satış', exact: true }).click();
  await page.getByRole('heading', { name: 'Vardiyayı aç' }).waitFor();
  await typeKeypad(page, cash);
  await page.getByRole('button', { name: 'Vardiyayı aç' }).click();
  await page.getByTestId('shift-status').filter({ hasText: 'Vardiya açık' }).waitFor();
}

export async function pick(page: Page, category: string, product: string) {
  await page.getByRole('tab', { name: category }).click();
  await page.getByRole('button', { name: new RegExp(`^${product.replace(/[()]/g, '\\$&')}`) }).click();
}

export const cartTotal = (page: Page) => page.getByTestId('cart-total').textContent();
