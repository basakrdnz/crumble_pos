import { describe, expect, it } from 'vitest';
import { testContext } from './helpers';

// Mirrors supabase/tests/db.test.sql for the local SQLite triggers (plan §4).
function seed() {
  const ctx = testContext();
  const run = (sql: string) => ctx.db.exec(sql);
  const t = "'2026-11-01T08:00:00.000Z'";
  run(`insert into categories values ('c1', 'Kahve', 0, ${t}, ${t}, null)`);
  run(`insert into products (id, category_id, name, price, created_at, updated_at) values ('p1', 'c1', 'Latte', 12000, ${t}, ${t})`);
  run(`insert into shifts (id, opened_at, opening_cash, created_at, updated_at) values ('s1', ${t}, 50000, ${t}, ${t})`);
  run(`insert into tabs (id, opened_shift_id, kind, opened_at, created_at, updated_at) values ('t1', 's1', 'quick', ${t}, ${t}, ${t})`);
  run(`insert into tab_items (id, tab_id, product_id, name_snapshot, list_price, unit_price, quantity, created_at, updated_at)
       values ('i1', 't1', 'p1', 'Latte', 12000, 12000, 1, ${t}, ${t})`);
  return { ctx, run, t };
}

describe('SQLite immutability triggers', () => {
  it('allows lifecycle changes while the tab is open', () => {
    const { run } = seed();
    run(`update tab_items set quantity = 2, unit_price = 11000, discount_percent = 10 where id = 'i1'`);
    run(`update tabs set discount_percent = 15, customer_name = 'Ali' where id = 't1'`);
  });

  it('protects snapshots and identity fields', () => {
    const { run } = seed();
    expect(() => run(`update tab_items set list_price = 1 where id = 'i1'`)).toThrow();
    expect(() => run(`update tab_items set name_snapshot = 'X' where id = 'i1'`)).toThrow();
    expect(() => run(`update tabs set kind = 'named' where id = 't1'`)).toThrow();
    expect(() => run(`update shifts set opening_cash = 1 where id = 's1'`)).toThrow();
  });

  it('freezes a closed tab and its items', () => {
    const { run, t } = seed();
    run(`insert into payments values ('pay1', 't1', 's1', 'cash', 12000, ${t}, ${t}, ${t})`);
    run(`update tabs set status = 'paid', closed_at = ${t}, closed_shift_id = 's1', total = 12000 where id = 't1'`);
    expect(() => run(`update tabs set customer_name = 'X' where id = 't1'`)).toThrow(/Kapanmış hesap/);
    expect(() => run(`update tab_items set note = 'x' where id = 'i1'`)).toThrow();
    expect(() =>
      run(`insert into tab_items (id, tab_id, product_id, name_snapshot, list_price, unit_price, quantity, created_at, updated_at)
           values ('i2', 't1', 'p1', 'Latte', 1, 1, 1, ${t}, ${t})`),
    ).toThrow(/Kapanmış hesaba/);
    run(`update tabs set status = status where id = 't1'`); // no-op is fine
  });

  it('keeps payments, refunds and history insert-only and never deletes', () => {
    const { run, t } = seed();
    run(`insert into payments values ('pay1', 't1', 's1', 'cash', 12000, ${t}, ${t}, ${t})`);
    expect(() => run(`update payments set amount = 1`)).toThrow();
    expect(() => run(`delete from payments`)).toThrow();
    expect(() => run(`delete from products`)).toThrow();
    expect(() => run(`delete from tab_items`)).toThrow();
  });

  it('freezes a voided item', () => {
    const { run, t } = seed();
    run(`update tab_items set voided_at = ${t}, void_reason = 'yanlış' where id = 'i1'`);
    expect(() => run(`update tab_items set quantity = 3 where id = 'i1'`)).toThrow();
  });

  it('allows one open shift and freezes a closed one', () => {
    const { run, t } = seed();
    expect(() =>
      run(`insert into shifts (id, opened_at, opening_cash, created_at, updated_at) values ('s2', ${t}, 0, ${t}, ${t})`),
    ).toThrow();
    expect(() =>
      run(`update shifts set closed_at = ${t}, counted_cash = 100, expected_cash = 100, cash_difference = 5`),
    ).toThrow();
    run(`update shifts set closed_at = ${t}, counted_cash = 105, expected_cash = 100, cash_difference = 5`);
    expect(() => run(`update shifts set notes = 'x'`)).toThrow(/Kapanmış vardiya/);
  });

  it('enforces tab kind and discount rules', () => {
    const { run, t } = seed();
    expect(() =>
      run(`insert into tabs (id, opened_shift_id, kind, opened_at, created_at, updated_at) values ('t2', 's1', 'named', ${t}, ${t}, ${t})`),
    ).toThrow();
    expect(() => run(`update tab_items set discount_percent = 0 where id = 'i1'`)).toThrow();
  });

  it('voids a tab with money only after it is refunded', () => {
    const { run, t } = seed();
    run(`insert into payments values ('pay1', 't1', 's1', 'cash', 5000, ${t}, ${t}, ${t})`);
    const voidIt = () => run(`update tabs set status = 'void', closed_at = ${t}, closed_shift_id = 's1' where id = 't1'`);
    expect(voidIt).toThrow(/iade/);
    run(`insert into refunds (id, tab_id, shift_id, amount, method, created_at, updated_at) values ('r1', 't1', 's1', 5000, 'cash', ${t}, ${t})`);
    voidIt();
  });

  it('migrates an existing v1 database forward', async () => {
    const Database = (await import('better-sqlite3')).default;
    const { MIGRATIONS } = await import('../src/db/schema');
    const { migrate } = await import('../src/db/database');
    const db = new Database(':memory:');
    db.exec(MIGRATIONS[0]!);
    db.pragma('user_version = 1');
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
    expect(db.prepare("select count(*) as n from sqlite_master where name = 'tabs_void_requires_refund'").get()).toEqual({ n: 1 });
  });
});

describe('migration v3 (shift closes without a cash count)', () => {
  it('keeps existing shifts, references and triggers when upgrading a v2 database', async () => {
    const Database = (await import('better-sqlite3')).default;
    const { migrate } = await import('../src/db/database');
    const { MIGRATIONS } = await import('../src/db/schema');
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    // A database as Faz 7 left it (user_version 2), with a counted shift and a tab.
    for (const sql of MIGRATIONS.slice(0, 2)) db.exec(sql);
    db.pragma('user_version = 2');
    const t = "'2026-11-01T08:00:00.000Z'";
    db.exec(`insert into shifts (id, opened_at, opening_cash, created_at, updated_at) values ('s1', ${t}, 50000, ${t}, ${t})`);
    db.exec(`update shifts set closed_at = ${t}, counted_cash = 50000, expected_cash = 50000, cash_difference = 0 where id = 's1'`);
    db.exec(`insert into shifts (id, opened_at, opening_cash, created_at, updated_at) values ('s2', ${t}, 0, ${t}, ${t})`);
    db.exec(`insert into tabs (id, opened_shift_id, kind, customer_name, opened_at, created_at, updated_at)
             values ('t1', 's2', 'named', 'Ali', ${t}, ${t}, ${t})`);
    expect(() => db.exec(`update shifts set closed_at = ${t}, expected_cash = 0 where id = 's2'`)).toThrow();

    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.prepare('select counted_cash from shifts where id = ?').pluck().get('s1')).toBe(50000);
    // Close without a count now works; the old rules still hold.
    db.exec(`update shifts set closed_at = ${t}, expected_cash = 0 where id = 's2'`);
    expect(() => db.exec(`update shifts set notes = 'x' where id = 's2'`)).toThrow(/Kapanmış vardiya/);
    expect(() => db.exec(`delete from shifts where id = 's1'`)).toThrow(/silinemez/);
    expect(() => db.exec(`insert into shifts (id, opened_at, opening_cash, created_at, updated_at)
      values ('s3', ${t}, 0, ${t}, ${t}), ('s4', ${t}, 0, ${t}, ${t})`)).toThrow(/UNIQUE/);
    expect(() => db.exec(`insert into tabs (id, opened_shift_id, kind, customer_name, opened_at, created_at, updated_at)
             values ('t2', 'nope', 'named', 'X', ${t}, ${t}, ${t})`)).toThrow(/FOREIGN KEY/);
  });
});
