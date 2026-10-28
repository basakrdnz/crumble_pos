// The single shared POS password (plan §2): set on first run, stored only as
// a bcrypt hash in the local settings table, changed by giving the old one.
import bcrypt from 'bcryptjs';
import type { Context } from './database';

const KEY = 'pos_password_hash';
const MIN_LENGTH = 4;

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

export function isPasswordSet(ctx: Context): boolean {
  return getHash(ctx) !== null;
}

/** First run only. */
export function setInitialPassword(ctx: Context, password: string): void {
  if (isPasswordSet(ctx)) throw new Error('Şifre zaten belirlenmiş.');
  setHash(ctx, password);
}

export function checkPassword(ctx: Context, password: string): boolean {
  const hash = getHash(ctx);
  return hash !== null && bcrypt.compareSync(password, hash);
}

export function changePassword(ctx: Context, current: string, next: string): void {
  if (!checkPassword(ctx, current)) throw new Error('Mevcut şifre yanlış.');
  setHash(ctx, next);
}
