import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createCategory } from '../src/db/catalog';
import { createContext, migrate } from '../src/db/database';
import { backupNow, dailyBackup, listBackups } from '../src/maintenance/backup';
import { createLogger } from '../src/maintenance/logger';

const tmp = () => mkdtempSync(join(tmpdir(), 'crumble-test-'));

function fileDb() {
  const dir = tmp();
  const db = new Database(join(dir, 'crumble.sqlite'));
  migrate(db);
  return db;
}

describe('daily backup', () => {
  it('takes one backup per Istanbul day, readable as a database', async () => {
    const db = fileDb();
    createCategory(createContext(db), 'Kahve');
    const dir = tmp();
    const first = await dailyBackup(db, dir, new Date('2026-11-01T08:00:00Z'));
    expect(first?.name).toBe('crumble-2026-11-01.sqlite');
    expect(await dailyBackup(db, dir, new Date('2026-11-01T20:00:00Z'))).toBeNull(); // 23:00 Istanbul, same day
    expect((await dailyBackup(db, dir, new Date('2026-11-01T21:30:00Z')))?.day).toBe('2026-11-02'); // past midnight

    const copy = new Database(first!.path, { readonly: true });
    expect(copy.prepare('select name from categories').pluck().all()).toEqual(['Kahve']);
    copy.close();
  });

  it('keeps the newest N backups and replaces today’s on a manual backup', async () => {
    const db = fileDb();
    const dir = tmp();
    for (let d = 1; d <= 5; d++) await dailyBackup(db, dir, new Date(`2026-11-0${d}T08:00:00Z`), 3);
    expect(listBackups(dir).map((b) => b.day)).toEqual(['2026-11-05', '2026-11-04', '2026-11-03']);
    await backupNow(db, dir, new Date('2026-11-05T09:00:00Z'));
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect(listBackups(dir)).toHaveLength(3);
  });
});

describe('error log', () => {
  it('appends lines with stack traces and reads the newest first', () => {
    const dir = tmp();
    const logger = createLogger(dir);
    logger.log('info', 'Uygulama başladı');
    logger.log('error', 'Beklenmeyen hata', new Error('boom'));
    const recent = logger.recent(10);
    expect(recent[0]).toMatch(/ERROR Beklenmeyen hata \| Error: boom/);
    expect(recent.some((l) => l.includes('INFO Uygulama başladı'))).toBe(true);
  });

  it('keeps only the newest log files', () => {
    const dir = tmp();
    for (let d = 1; d <= 9; d++) writeFileSync(join(dir, `crumble-2026-10-0${d}.log`), 'x\n');
    createLogger(dir, 5);
    expect(readdirSync(dir).sort()).toEqual([
      'crumble-2026-10-05.log',
      'crumble-2026-10-06.log',
      'crumble-2026-10-07.log',
      'crumble-2026-10-08.log',
      'crumble-2026-10-09.log',
    ]);
  });
});
