// Error log (plan Faz 7 "hata günlüğü"): one text file per day in the app's
// log folder. Business messages shown to the cashier (e.g. "Şifre yanlış")
// are not logged; unexpected failures, renderer crashes and sync problems are.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { istanbulDay } from '@crumble/shared';

export type Level = 'info' | 'warn' | 'error';

export interface Logger {
  dir: string;
  log(level: Level, message: string, detail?: unknown): void;
  recent(lines?: number): string[];
}

function describe(detail: unknown): string {
  if (detail === undefined) return '';
  if (detail instanceof Error) return ` | ${detail.stack ?? detail.message}`;
  try {
    return ` | ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  } catch {
    return ` | ${String(detail)}`;
  }
}

export function createLogger(dir: string, keepDays = 30): Logger {
  mkdirSync(dir, { recursive: true });
  const fileFor = (iso: string) => join(dir, `crumble-${istanbulDay(iso)}.log`);
  const prune = () => {
    const files = readdirSync(dir).filter((f) => /^crumble-\d{4}-\d{2}-\d{2}\.log$/.test(f)).sort().reverse();
    for (const f of files.slice(keepDays)) rmSync(join(dir, f), { force: true });
  };
  prune();
  return {
    dir,
    log(level, message, detail) {
      const now = new Date().toISOString();
      // One entry per line (stack frames joined with ⏎) so the log reads newest-first cleanly.
      const line = `${now} ${level.toUpperCase()} ${message}${describe(detail)}`.replace(/\r?\n\s*/g, ' ⏎ ');
      try {
        appendFileSync(fileFor(now), `${line}\n`, 'utf8');
      } catch {
        // Logging must never break the POS.
      }
      if (level === 'error') console.error(line);
    },
    recent(lines = 200) {
      const files = readdirSync(dir).filter((f) => f.endsWith('.log')).sort().reverse();
      const out: string[] = [];
      for (const f of files) {
        const path = join(dir, f);
        if (!existsSync(path)) continue;
        const content = readFileSync(path, 'utf8').split('\n').filter(Boolean).reverse();
        out.push(...content);
        if (out.length >= lines) break;
      }
      return out.slice(0, lines);
    },
  };
}
