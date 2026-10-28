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
});
