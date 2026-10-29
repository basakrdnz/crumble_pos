import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, safeStorage, shell } from 'electron';
import { formatTL } from '@crumble/shared';
import { IPC_CHANNEL } from '../src/api/contract';
import { createApi, dispatch } from '../src/api/server';
import { createContext, openDatabase } from '../src/db/database';
import { dailyBackup } from '../src/maintenance/backup';
import { createLogger } from '../src/maintenance/logger';
import { CloudManager, plainBox, type SecretBox } from '../src/sync/cloud';
import { SyncService, type SyncState } from '../src/sync/service';

// Smoke mode (scripts/smoke.mjs): load the window, report what rendered, then quit.
const isSmoke = process.env.CRUMBLE_SMOKE === '1';

// One fixed data folder for dev and installed builds: %APPDATA%\Crumble POS
// (database, backups/, logs/). CRUMBLE_DATA_DIR overrides it (tests). Must be
// set before the app is ready.
app.setName('Crumble POS');
app.setPath('userData', process.env.CRUMBLE_DATA_DIR ?? join(app.getPath('appData'), 'Crumble POS'));

const dataDir = () => app.getPath('userData');
const databasePath = () => process.env.CRUMBLE_DB_PATH ?? join(dataDir(), 'crumble.sqlite');
const logger = createLogger(join(dataDir(), 'logs'));
const backupDir = join(dataDir(), 'backups');

process.on('uncaughtException', (error) => logger.log('error', 'Yakalanmamış hata (ana süreç)', error));
process.on('unhandledRejection', (reason) => logger.log('error', 'Yakalanmamış söz (ana süreç)', reason));

/** Encrypts the stored cloud session with the OS keychain (DPAPI on Windows) when available. */
function secretBox(): SecretBox {
  if (!safeStorage.isEncryptionAvailable()) return plainBox;
  return {
    encrypt: (plain) => `enc:${safeStorage.encryptString(plain).toString('base64')}`,
    decrypt: (stored) =>
      stored.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64')) : stored,
  };
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'Crumble POS',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // No application menu: its hidden accelerators would take F11 (tam ekran)
  // and Ctrl+R, but F11 is "Nakit ödendi" on the sale screen.
  Menu.setApplicationMenu(null);
  if (!isSmoke) {
    win.once('ready-to-show', () => {
      win.maximize();
      win.show();
    });
  }
  win.webContents.on('render-process-gone', (_e, details) =>
    logger.log('error', 'Ekran süreci kapandı', details),
  );

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

// Only one POS window/process may own the database.
if (!isSmoke && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(() => {
    logger.log('info', `Crumble POS ${app.getVersion()} başladı`);
    const db = openDatabase(databasePath());
    const ctx = createContext(db);
    let lastState: SyncState = 'disabled';
    const sync = new SyncService(ctx, (status) => {
      if (status.state !== lastState && (status.state === 'error' || status.state === 'offline')) {
        logger.log(status.state === 'error' ? 'error' : 'warn', `Senkron: ${status.state}`, status.lastError);
      }
      lastState = status.state;
    });
    const cloud = new CloudManager(ctx, sync, secretBox());
    const server = createApi(ctx, { sync, cloud }, { backupDir, logger, openPath: (p) => void shell.openPath(p) });
    ipcMain.handle(IPC_CHANNEL, (_event, method: string, args: unknown[]) => dispatch(server, method, args));

    const win = createWindow();
    if (isSmoke) {
      const { v } = db.prepare('select sqlite_version() as v').get() as { v: string };
      void runSmoke(win, v);
      return;
    }

    void cloud.start().catch((error) => logger.log('error', 'Bulut başlatılamadı', error));
    const backup = () =>
      dailyBackup(db, backupDir)
        .then((made) => made && logger.log('info', `Günlük yedek alındı: ${made.name}`))
        .catch((error) => logger.log('error', 'Günlük yedek alınamadı', error));
    void backup();
    const timer = setInterval(() => void backup(), 60 * 60 * 1000);

    app.on('before-quit', () => {
      clearInterval(timer);
      sync.stop();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
