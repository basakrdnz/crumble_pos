import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildImportPreview, parseCsv } from '../src/catalog/menuCsv';

const seed = readFileSync(resolve(__dirname, '../../../crumble_menu_seed.csv'), 'utf8');
const empty = { categories: [], products: [] };

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas, CRLF and BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
  });

  it('keeps empty fields', () => {
    expect(parseCsv('a,,c\n')).toEqual([['a', '', 'c']]);
  });

  it('rejects an unclosed quote', () => {
    expect(() => parseCsv('"abc')).toThrow();
  });
});

describe('buildImportPreview with crumble_menu_seed.csv', () => {
  const preview = buildImportPreview(seed, empty);

  it('reads every row without errors', () => {
    expect(preview.errors).toEqual([]);
    expect(preview.products).toHaveLength(84);
    expect(preview.categories.map((c) => c.name)).toEqual([
      'Kahve',
      'Kış İçecekleri',
      'Çay ve Diğer Sıcaklar',
      'Soğuk İçecekler',
      'Detox ve Matcha',
      'Kahvaltılık',
      'Yemek',
      'Varsa Kap! (Vitrin)',
    ]);
  });

  it('converts TL to kuruş', () => {
    const espresso = preview.products.find((p) => p.name === 'Espresso')!;
    expect(espresso.price).toBe(11000);
    expect(espresso.isActive).toBe(true);
    expect(espresso.needsPriceCheck).toBe(false);
  });

  it('imports fiyat_belirlenecek as inactive with price 0', () => {
    const pending = preview.products.filter((p) => p.status === 'fiyat_belirlenecek');
    expect(pending.map((p) => p.name)).toEqual(['Çıtır Kurabiye', 'Vişneli Parmak Kurabiye']);
    expect(pending.every((p) => p.price === 0 && !p.isActive)).toBe(true);
  });

  it('marks teyit_edilecek as active with the badge', () => {
    const check = preview.products.filter((p) => p.needsPriceCheck);
    expect(check.map((p) => p.name)).toEqual([
      'Elmalı Kurabiye',
      'Patatesli Börek',
      'Peynirli Börek',
      'Tavuklu Sebzeli Börek',
    ]);
    expect(check.every((p) => p.isActive)).toBe(true);
  });

  it('keeps variant names and quoted notes as description', () => {
    const latte = preview.products.find((p) => p.name === 'Balkabağı Latte (Buzlu)')!;
    expect(latte.price).toBe(26000);
    expect(latte.description).toBe('Yeni. 3 pompa pumpkin spice + 1 pompa karamel, tek shot, sweet cream köpük');
    expect(preview.products.find((p) => p.name === 'Espresso')!.description).toBeNull();
  });

  it('flags products that already exist', () => {
    const again = buildImportPreview(seed, {
      categories: [{ name: 'Kahve' }],
      products: [{ categoryName: 'Kahve', name: 'Espresso' }],
    });
    expect(again.categories[0]).toMatchObject({ name: 'Kahve', exists: true });
    expect(again.products.filter((p) => p.exists).map((p) => p.name)).toEqual(['Espresso']);
  });
});

describe('buildImportPreview errors', () => {
  const header = 'kategori,urun,fiyat_tl,durum,not\n';

  it('rejects a wrong header', () => {
    expect(buildImportPreview('a,b,c\n', empty).errors[0]!.line).toBe(1);
  });

  it('reports bad rows with line numbers', () => {
    const preview = buildImportPreview(
      header + 'Kahve,Espresso,abc,tamam,\nKahve,Latte,100,bilinmiyor,\n,Boş,10,tamam,\nKahve,Mocha,,tamam,\nKahve,Mocha2,10,tamam,\nKahve,Mocha2,10,tamam,\n',
      empty,
    );
    expect(preview.errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 7]);
    expect(preview.products.map((p) => p.name)).toEqual(['Mocha2']);
  });
});
