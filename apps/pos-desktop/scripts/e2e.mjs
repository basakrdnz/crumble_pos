// Runs the end-to-end tests against the built app (pnpm e2e builds first).
// On Linux without a display, wraps the run in xvfb-run.
import { spawnSync } from 'node:child_process';

const vitest = ['vitest', 'run', '-c', 'vitest.e2e.config.mts', ...process.argv.slice(2)];
const useXvfb = process.platform === 'linux' && !process.env.DISPLAY;
const [command, args] = useXvfb ? ['xvfb-run', ['-a', 'npx', ...vitest]] : ['npx', vitest];
const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
