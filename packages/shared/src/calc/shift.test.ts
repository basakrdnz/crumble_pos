import { describe, expect, it } from 'vitest';
import { cashDifference, expectedCash } from './shift';

describe('expectedCash', () => {
  it('is opening cash when nothing happened', () => {
    expect(expectedCash(50000, [], [])).toBe(50000);
  });

  it('adds cash payments, ignores card, subtracts cash refunds', () => {
    const payments = [
      { method: 'cash' as const, amount: 12000 },
      { method: 'card' as const, amount: 30000 },
      { method: 'cash' as const, amount: 4550 },
    ];
    const refunds = [
      { method: 'cash' as const, amount: 2000 },
      { method: 'card' as const, amount: 9999 },
    ];
    expect(expectedCash(50000, payments, refunds)).toBe(50000 + 12000 + 4550 - 2000);
  });
});

describe('cashDifference', () => {
  it('is counted minus expected', () => {
    expect(cashDifference(64550, 64550)).toBe(0);
    expect(cashDifference(65000, 64550)).toBe(450);
    expect(cashDifference(64000, 64550)).toBe(-550);
  });
});
