import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchApp, type RunningApp, snap, unlock } from './launch';

// Faz 7: yerel günlük yedek, hata günlüğü, kısayol listesi.
describe('Faz 7: yedek, günlük, kısayollar', () => {
  let run: RunningApp;
  beforeAll(async () => {
    run = await launchApp();
    await unlock(run.page);
  });
  afterAll(async () => {
    await run?.close();
  });

  it('takes the daily backup on start and on demand', async () => {
    const dir = join(dirname(run.dbPath), 'backups');
    await expect.poll(() => existsSync(dir) && readdirSync(dir).filter((f) => f.endsWith('.sqlite')).length).toBe(1);
    const { page } = run;
    await page.getByRole('button', { name: 'Ayarlar' }).click();
    await page.getByRole('button', { name: 'Yedek ve günlük' }).click();
    await expect.poll(() => page.getByRole('table', { name: 'Yedekler' }).locator('tr').count()).toBe(1);
    await page.getByRole('button', { name: 'Şimdi yedekle' }).click();
    await expect.poll(() => page.getByRole('alert').textContent()).toContain('Yedek alındı');
  });

  it('writes renderer errors and startup to the error log', async () => {
    const { page } = run;
    await page.evaluate(() => setTimeout(() => {
      throw new Error('test: ekran hatası');
    }));
    await page.getByRole('button', { name: 'Yenile' }).click();
    await expect.poll(() => page.getByLabel('Hata günlüğü').textContent()).toContain('Ekran hatası: Uncaught Error: test: ekran hatası');
    expect(await page.getByLabel('Hata günlüğü').textContent()).toContain('Crumble POS');
    await snap(page, 'faz7-maintenance');
  });

  it('lists the keyboard shortcuts', async () => {
    const { page } = run;
    await page.getByRole('button', { name: 'Kısayollar' }).click();
    const text = await page.getByRole('table', { name: 'Kısayollar' }).textContent();
    for (const key of ['F12', 'Esc', 'F3']) expect(text).toContain(key);
  });
});
