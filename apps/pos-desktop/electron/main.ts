import { join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { formatTL } from '@crumble/shared';
import { IPC_CHANNEL } from '../src/api/contract';
import { createApi, dispatch } from '../src/api/server';
import { createContext, openDatabase } from '../src/db/database';

// Smoke mode (scripts/smoke.mjs): load the window, report what rendered, then quit.
const isSmoke = process.env.CRUMBLE_SMOKE === '1';

function databasePath(): string {
  return process.env.CRUMBLE_DB_PATH ?? join(app.getPath('userData'), 'crumble.sqlite');
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    show: !isSmoke,
    title: 'Crumble POS',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

async function runSmoke(win: BrowserWindow, sqliteVersion: string): Promise<void> {
  const result: Record<string, unknown> = { mainShared: formatTL(123450), sqlite: sqliteVersion };
  try {
    await new Promise<void>((resolveLoad, rejectLoad) => {
      win.webContents.once('did-finish-load', () => resolveLoad());
      win.webContents.once('did-fail-load', (_e, code, desc) => rejectLoad(new Error(`${code} ${desc}`)));
    });
    result.rendererText = await win.webContents.executeJavaScript(
      `new Promise((r) => { const t = () => { const el = document.querySelector('[data-smoke]'); el ? r(el.textContent) : setTimeout(t, 50); }; t(); })`,
    );
    console.log(`SMOKE_RESULT ${JSON.stringify(result)}`);
    app.exit(0);
  } catch (error) {
    console.log(`SMOKE_RESULT ${JSON.stringify({ ...result, error: String(error) })}`);
    app.exit(1);
  }
}

void app.whenReady().then(() => {
  const db = openDatabase(databasePath());
  const api = createApi(createContext(db));
  ipcMain.handle(IPC_CHANNEL, (_event, method: string, args: unknown[]) => dispatch(api, method, args));

  const win = createWindow();
  if (isSmoke) {
    const { v } = db.prepare('select sqlite_version() as v').get() as { v: string };
    void runSmoke(win, v);
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
