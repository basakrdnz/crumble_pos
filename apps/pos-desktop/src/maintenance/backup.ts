// Daily local backup of the POS database (plan §7: Supabase backs up the
// cloud; the POS also keeps a daily .sqlite copy). Uses SQLite's online
// backup, so it is safe while the app is running.
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { istanbulDay } from '@crumble/shared';
import type { Db } from '../db/database';

const PREFIX = 'crumble-';
const SUFFIX = '.sqlite';

export interface BackupFile {
  name: string;
  path: string;
  day: string;
  size: number;
}

export function listBackups(dir: string): BackupFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(SUFFIX))
    .map((name) => {
      const path = join(dir, name);
      return { name, path, day: name.slice(PREFIX.length, -SUFFIX.length), size: statSync(path).size };
    })
    .sort((a, b) => b.day.localeCompare(a.day));
}

export async function backupNow(db: Db, dir: string, now: Date = new Date()): Promise<BackupFile> {
  mkdirSync(dir, { recursive: true });
  const day = istanbulDay(now.toISOString());
  const path = join(dir, `${PREFIX}${day}${SUFFIX}`);
  const tmp = `${path}.tmp`;
  rmSync(tmp, { force: true });
  await db.backup(tmp);
  rmSync(path, { force: true });
  // Rename only after a complete copy, so a crash never leaves a half backup.
  const { renameSync } = await import('node:fs');
  renameSync(tmp, path);
  return listBackups(dir).find((b) => b.path === path)!;
}

/** Takes today's backup if there is none yet and keeps the newest `keep`. */
export async function dailyBackup(db: Db, dir: string, now: Date = new Date(), keep = 30): Promise<BackupFile | null> {
  const day = istanbulDay(now.toISOString());
  const made = listBackups(dir).some((b) => b.day === day) ? null : await backupNow(db, dir, now);
  for (const old of listBackups(dir).slice(keep)) rmSync(old.path, { force: true });
  return made;
}
