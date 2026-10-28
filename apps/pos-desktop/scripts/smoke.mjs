// Faz 0 acceptance: launch the built app hidden, check the renderer and main
// process both used @crumble/shared and that better-sqlite3 loads in Electron.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const expected = { mainShared: '1.234,50 ₺', rendererText: '1.234,50 ₺' };

const args = ['.'];
let command = electronPath;
if (process.platform === 'linux') {
  // Containers run as root without a display.
  args.push('--no-sandbox');
  if (!process.env.DISPLAY) {
    args.unshift('-a', electronPath);
    command = 'xvfb-run';
  }
}

const dataDir = mkdtempSync(join(tmpdir(), 'crumble-smoke-'));
const child = spawn(command, args, {
  env: { ...process.env, CRUMBLE_SMOKE: '1', CRUMBLE_DB_PATH: join(dataDir, 'crumble.sqlite') },
  stdio: ['ignore', 'pipe', 'inherit'],
});

const timer = setTimeout(() => {
  console.error('Smoke testi zaman aşımına uğradı.');
  child.kill('SIGKILL');
}, 60_000);

let output = '';
child.stdout.on('data', (chunk) => {
  output += chunk;
});

child.on('exit', (code) => {
  clearTimeout(timer);
  rmSync(dataDir, { recursive: true, force: true });
  const line = output.split('\n').find((l) => l.startsWith('SMOKE_RESULT '));
  if (!line) {
    console.error(`SMOKE_RESULT bulunamadı (çıkış kodu ${code}).\n${output}`);
    process.exit(1);
  }
  const result = JSON.parse(line.slice('SMOKE_RESULT '.length));
  console.log(result);
  const ok =
    code === 0 &&
    result.mainShared === expected.mainShared &&
    result.rendererText === expected.rendererText &&
    typeof result.sqlite === 'string';
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED');
  process.exit(ok ? 0 : 1);
});
