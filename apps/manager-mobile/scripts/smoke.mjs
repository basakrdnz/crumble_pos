// Faz 0 acceptance: export the web build, serve it, open it in headless
// Chromium (Playwright) and check the text rendered via @crumble/shared.
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const expected = '1.234,50 ₺';

execSync('npx expo export --platform web --output-dir dist', { cwd: root, stdio: 'inherit' });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer((req, res) => {
  let file = join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
  res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

let playwright;
try {
  playwright = require('playwright');
} catch {
  console.error('Bu smoke testi Playwright gerektirir (npm i -g playwright). Elle test için: pnpm mobile:web');
  server.close();
  process.exit(1);
}

const browser = await playwright.chromium.launch();
let ok = false;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  const text = await page.getByTestId('smoke').textContent({ timeout: 30_000 });
  console.log({ url, rendererText: text, pageErrors: errors });
  ok = text === expected && errors.length === 0;
} finally {
  await browser.close();
  server.close();
}
console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED');
process.exit(ok ? 0 : 1);
