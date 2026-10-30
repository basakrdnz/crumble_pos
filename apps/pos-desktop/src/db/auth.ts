// The single shared POS password (plan §2), stored only as a bcrypt hash in
// the local settings table and changed by giving the old one. It starts as
// 1010 (2026-10-30): no first-run setup. A forgotten password is reset by
// the developer, so there is no reset flow.
import bcrypt from 'bcryptjs';
import type { Context } from './database';

const KEY = 'pos_password_hash';
const MIN_LENGTH = 4;
export const DEFAULT_PASSWORD = '1010';

function getHash(ctx: Context): string | null {
  const row = ctx.db.prepare('select value from settings where key = ?').get(KEY) as { value: string } | undefined;
  return row?.value ?? null;
}

function setHash(ctx: Context, password: string): void {
  if (password.length < MIN_LENGTH) throw new Error(`Şifre en az ${MIN_LENGTH} karakter olmalı.`);
  const hash = bcrypt.hashSync(password, 10);
  ctx.db
    .prepare('insert into settings (key, value) values (?, ?) on conflict (key) do update set value = excluded.value')
    .run(KEY, hash);
}

/** Sets the default password on a new POS (no hash yet). */
export function ensurePassword(ctx: Context): void {
  if (getHash(ctx) === null) setHash(ctx, DEFAULT_PASSWORD);
}

export function checkPassword(ctx: Context, password: string): boolean {
  const hash = getHash(ctx);
  return hash !== null && bcrypt.compareSync(password, hash);
}

export function changePassword(ctx: Context, current: string, next: string): void {
  if (!checkPassword(ctx, current)) throw new Error('Mevcut şifre yanlış.');
  setHash(ctx, next);
}
