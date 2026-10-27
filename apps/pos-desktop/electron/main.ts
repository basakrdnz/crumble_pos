import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import Database from 'better-sqlite3';
import { formatTL } from '@crumble/shared';

// Smoke mode (scripts/smoke.mjs): load the window, report what rendered, then quit.
const isSmoke = process.env.CRUMBLE_SMOKE === '1';

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: !isSmoke,
    title: 'Crumble POS',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

function sqliteVersion(): string {
  const db = new Database(':memory:');
  try {
    return (db.prepare('select sqlite_version() as v').get() as { v: string }).v;
  } finally {
    db.close();
  }
}

async function runSmoke(win: BrowserWindow): Promise<void> {
  const result: Record<string, unknown> = { mainShared: formatTL(123450) };
  try {
    await new Promise<void>((resolveLoad, rejectLoad) => {
      win.webContents.once('did-finish-load', () => resolveLoad());
      win.webContents.once('did-fail-load', (_e, code, desc) => rejectLoad(new Error(`${code} ${desc}`)));
    });
    result.rendererText = await win.webContents.executeJavaScript(
      `new Promise((r) => { const t = () => { const el = document.querySelector('[data-smoke]'); el ? r(el.textContent) : setTimeout(t, 50); }; t(); })`,
    );
    result.sqlite = sqliteVersion();
    console.log(`SMOKE_RESULT ${JSON.stringify(result)}`);
    app.exit(0);
  } catch (error) {
    console.log(`SMOKE_RESULT ${JSON.stringify({ ...result, error: String(error) })}`);
    app.exit(1);
  }
}

void app.whenReady().then(() => {
  const win = createWindow();
  if (isSmoke) void runSmoke(win);
});

app.on('window-all-closed', () => {
  app.quit();
});
