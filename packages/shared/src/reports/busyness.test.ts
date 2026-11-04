import { describe, expect, it } from 'vitest';
import type { Category, Product, TabItem } from '../types';
import { busyLevel, busyness, busyWeight } from './busyness';

const base = { created_at: '2026-11-04T10:00:00.000Z', updated_at: '2026-11-04T10:00:00.000Z' };
const cat = (id: string, name: string): Category => ({ ...base, id, name, sort_order: 0, deleted_at: null });
const prod = (id: string, name: string, category_id: string): Product => ({
  ...base, id, name, category_id, description: null, price: 10000, is_active: true, needs_price_check: false, sort_order: 0, deleted_at: null,
});
const catalog = {
  categories: [cat('c1', 'Çay ve Diğer Sıcaklar'), cat('c2', 'Tost ve Baget'), cat('c3', 'Teşhir'), cat('c4', 'Kahve'), cat('c5', 'Soğuk İçecekler')],
  products: [prod('p1', 'Çay', 'c1'), prod('p2', 'Kaşarlı Tost', 'c2'), prod('p3', 'Mozaik Pasta', 'c3'), prod('p4', 'Latte', 'c4'), prod('p5', 'Su', 'c5')],
};
let n = 0;
const item = (product_id: string, name: string, minutesAgo: number, extra: Partial<TabItem> = {}): TabItem => ({
  ...base, id: `i${++n}`, tab_id: extra.tab_id ?? `t${n}`, product_id, name_snapshot: name, list_price: 10000, unit_price: 10000,
  quantity: 1, discount_percent: null, is_comp: false, note: null, voided_at: null, void_reason: null,
  created_at: new Date(Date.parse(NOW) - minutesAgo * 60_000).toISOString(), ...extra,
});
const NOW = '2026-11-04T14:00:00.000Z';

describe('busyWeight', () => {
  it('çay 1, kahve ve pasta 2, yemek 3, hazır içecek 1', () => {
    expect(busyWeight('Çay', 'Çay ve Diğer Sıcaklar')).toBe(1);
    expect(busyWeight('Bitki Çayı (Büyük)', 'Çay ve Diğer Sıcaklar')).toBe(1);
    expect(busyWeight('Sıcak Çikolata', 'Çay ve Diğer Sıcaklar')).toBe(2);
    expect(busyWeight('Latte', 'Kahve')).toBe(2);
    expect(busyWeight('Iced Latte', 'Soğuk İçecekler')).toBe(2);
    expect(busyWeight('Mozaik Pasta', 'Teşhir')).toBe(2);
    expect(busyWeight('Kaşarlı Tost', 'Tost ve Baget')).toBe(3);
    expect(busyWeight('Waffle', 'Teşhir')).toBe(3);
    expect(busyWeight('Su', 'Soğuk İçecekler')).toBe(1);
    expect(busyWeight('Bilinmeyen', undefined)).toBe(1);
  });
});

describe('busyness', () => {
  it('son 30 dakikadaki kalemleri ağırlıkla toplar', () => {
    const items = [
      item('p1', 'Çay', 5, { quantity: 3 }), // 3
      item('p2', 'Kaşarlı Tost', 10, { tab_id: 'a' }), // 3
      item('p4', 'Latte', 12, { tab_id: 'a' }), // 2
      item('p3', 'Mozaik Pasta', 29), // 2
      item('p2', 'Kaşarlı Tost', 31), // too old
      item('p2', 'Kaşarlı Tost', 3, { voided_at: NOW }), // removed from the cart
      item('p2', 'Kaşarlı Tost', 3, { tab_id: 'cancelled' }), // tab voided
    ];
    const b = busyness(items, catalog, [{ id: 'cancelled', status: 'void' }], NOW);
    expect(b.points).toBe(10);
    expect(b.orders).toBe(3);
    expect(b.label).toBe('Sakin');
  });

  it('eşikler: 12 hafif, 30 yoğun, 50 çok yoğun', () => {
    expect([0, 11, 12, 29, 30, 49, 50, 120].map(busyLevel)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});
