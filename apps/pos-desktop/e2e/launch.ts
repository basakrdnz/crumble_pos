import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
    env: { ...process.env, CRUMBLE_DB_PATH: path } as Record<string, string>,
  });
  const page = await app.firstWindow();
  await page.waitForSelector('.topbar');
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
