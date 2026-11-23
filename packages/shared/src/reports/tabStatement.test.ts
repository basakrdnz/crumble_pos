import { describe, expect, it } from 'vitest';
import type { TabItem } from '../types';
import { tabStatement } from './tabStatement';

const item = (id: string, name: string, qty: number, price: number, at: string, extra: Partial<TabItem> = {}): TabItem => ({
  id, tab_id: 't', product_id: name, name_snapshot: name, list_price: price, unit_price: price, quantity: qty, discount_percent: null,
  is_comp: false, note: null, voided_at: null, void_reason: null, created_at: at, updated_at: at, ...extra,
});

describe('tabStatement (hesap dökümü)', () => {
  it('lists the days and products, leaves out removed lines and adds up to the tab', () => {
    const s = tabStatement({
      title: 'CİMNASTİK',
      openedAt: '2026-11-03T15:05:00.000Z',
      status: 'open',
      discountPercent: null,
      items: [
        item('a', 'Su (1 L)', 1, 7000, '2026-11-03T15:05:00.000Z'),
        item('b', 'Köfte Kase', 2, 48000, '2026-11-07T10:28:00.000Z'),
        item('c', 'Flat White', 1, 22500, '2026-11-05T17:22:00.000Z', { voided_at: '2026-11-05T17:23:00.000Z' }),
        item('d', 'Su (1 L)', 1, 7000, '2026-11-07T10:30:00.000Z'),
      ],
      payments: [{ method: 'card', amount: 10000, paid_at: '2026-11-07T11:00:00.000Z' }],
      now: '2026-11-23T09:00:00.000Z',
    });
    expect([s.total, s.paid, s.remaining]).toEqual([110000, 10000, 100000]);
    expect(s.html).toContain('3 Kasım 2026 Salı');
    expect(s.html).toContain('7 Kasım 2026 Cumartesi');
    expect(s.html).not.toContain('Flat White');
    expect(s.html).toContain('18:05'); // Istanbul time
    expect(s.html).toContain('1.100,00 ₺');
    expect(s.fileName).toBe('Cimnastik-hesap-dokumu-2026-11-23');
  });

  it('shows the cart discount and escapes names', () => {
    const s = tabStatement({
      title: 'Masa <5>',
      openedAt: '2026-11-03T15:05:00.000Z',
      status: 'open',
      discountPercent: 10,
      items: [item('a', 'A & B', 1, 10000, '2026-11-03T15:05:00.000Z')],
      payments: [],
      now: '2026-11-03T16:00:00.000Z',
    });
    expect(s.total).toBe(9000);
    expect(s.html).toContain('Sepet indirimi %10');
    expect(s.html).toContain('A &amp; B');
    expect(s.html).toContain('Masa &lt;5&gt;');
  });
});
