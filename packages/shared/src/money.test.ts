import { describe, expect, it } from 'vitest';
import { formatTL, parseTL, sumKurus } from './money';

describe('formatTL', () => {
  it('formats kuruş with Turkish separators', () => {
    expect(formatTL(123450)).toBe('1.234,50 ₺');
    expect(formatTL(0)).toBe('0,00 ₺');
    expect(formatTL(5)).toBe('0,05 ₺');
    expect(formatTL(100)).toBe('1,00 ₺');
    expect(formatTL(123456789)).toBe('1.234.567,89 ₺');
  });

  it('formats negative amounts', () => {
    expect(formatTL(-150)).toBe('-1,50 ₺');
  });

  it('rejects non-integer kuruş', () => {
    expect(() => formatTL(1.5)).toThrow();
  });
});

describe('parseTL', () => {
  it('parses whole and decimal TL into kuruş', () => {
    expect(parseTL('65')).toBe(6500);
    expect(parseTL('65.5')).toBe(6550);
    expect(parseTL('65,50')).toBe(6550);
    expect(parseTL(' 0.05 ')).toBe(5);
    expect(parseTL('-12,30')).toBe(-1230);
  });

  it('avoids floating point error', () => {
    // 0.1 + 0.2 style traps: 19.99 * 100 = 1998.9999999999998 in floats
    expect(parseTL('19.99')).toBe(1999);
    expect(parseTL('1.15')).toBe(115);
  });

  it('rejects ambiguous or invalid input', () => {
    for (const bad of ['', 'abc', '1.234,50', '12.345', '1,5,0', '₺10']) {
      expect(() => parseTL(bad)).toThrow();
    }
  });
});

describe('sumKurus', () => {
  it('sums integer kuruş', () => {
    expect(sumKurus([100, 250, -50])).toBe(300);
    expect(sumKurus([])).toBe(0);
  });

  it('rejects non-integers', () => {
    expect(() => sumKurus([1, 0.5])).toThrow();
  });
});
