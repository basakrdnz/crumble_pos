import { sumKurus, type Kurus } from '../money';
import type { PaymentMethod } from '../types';

export interface MoneyMovement {
  method: PaymentMethod;
  amount: Kurus;
}

/**
 * Expected cash in the drawer at shift close:
 * opening cash + cash payments − cash refunds (both taken in this shift).
 */
export function expectedCash(
  openingCash: Kurus,
  payments: readonly MoneyMovement[],
  refunds: readonly MoneyMovement[],
): Kurus {
  const cashIn = sumKurus(payments.filter((p) => p.method === 'cash').map((p) => p.amount));
  const cashOut = sumKurus(refunds.filter((r) => r.method === 'cash').map((r) => r.amount));
  return sumKurus([openingCash, cashIn, -cashOut]);
}

/** Positive = more cash than expected, negative = cash short. */
export function cashDifference(countedCash: Kurus, expected: Kurus): Kurus {
  return sumKurus([countedCash, -expected]);
}
