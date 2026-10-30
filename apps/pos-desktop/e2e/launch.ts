import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';

const require = createRequire(import.meta.url);

export interface RunningApp {
  app: ElectronApplication;
  page: Page;
  dbPath: string;
  close(): Promise<void>;
}

/** Launches the built app (out/) against a fresh temporary database. */
export async function launchApp(dbPath?: string): Promise<RunningApp> {
  const dir = dbPath ? undefined : mkdtempSync(join(tmpdir(), 'crumble-e2e-'));
  const path = dbPath ?? join(dir!, 'crumble.sqlite');
  const app = await electron.launch({
    executablePath: require('electron') as string,
    args: [resolve(__dirname, '..'), ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, CRUMBLE_DB_PATH: path, CRUMBLE_DATA_DIR: dirname(path) } as Record<string, string>,
  });
  const page = await app.firstWindow();
  await page.waitForSelector('.app');
  return {
    app,
    page,
    dbPath: path,
    close: async () => {
      await app.close();
      if (dir) rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const SEED_CSV = resolve(__dirname, '../../../crumble_menu_seed.csv');

/** Saves a screenshot when CRUMBLE_SCREENSHOTS points to a directory. */
export async function snap(page: Page, name: string): Promise<void> {
  const dir = process.env.CRUMBLE_SCREENSHOTS;
  if (dir) await page.screenshot({ path: join(dir, `${name}.png`) });
}

export const TEST_PASSWORD = '1010'; // the default POS password

/** Logs in. */
export async function unlock(page: Page, password = TEST_PASSWORD): Promise<void> {
  await page.getByLabel('Şifre', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Giriş' }).click();
  await page.getByRole('button', { name: 'Kilitle' }).waitFor();
}

/** Types on the on-screen keypad inside `scope` ("125,5" -> 1 2 5 , 5). */
export async function typeKeypad(scope: Page | ReturnType<Page['locator']>, text: string): Promise<void> {
  const pad = scope.getByRole('group', { name: 'Tuş takımı' });
  for (const ch of text) {
    await pad.getByRole('button', { name: ch, exact: true }).click();
  }
}
