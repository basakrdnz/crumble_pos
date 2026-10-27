/**
 * All amounts are stored as integer kuruş (1 TL = 100 kuruş). Never use
 * floating point for money; convert only at the edges (input parsing, display).
 */
export type Kurus = number;

export function assertKurus(value: number): asserts value is Kurus {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Tutar tam sayı kuruş olmalı: ${value}`);
  }
}

/**
 * Parses a TL amount written as a plain decimal ("65", "65.5", "65,50") into kuruş.
 * Thousands separators are rejected on purpose: "1.234" would be ambiguous.
 */
export function parseTL(input: string): Kurus {
  const text = input.trim();
  const match = /^(-)?(\d+)(?:[.,](\d{1,2}))?$/.exec(text);
  if (!match) {
    throw new Error(`Geçersiz TL tutarı: "${input}"`);
  }
  const [, sign, lira, fraction = ''] = match;
  const kurus = Number(lira) * 100 + Number(fraction.padEnd(2, '0'));
  assertKurus(kurus);
  return sign ? -kurus : kurus;
}

/** Formats kuruş as Turkish lira, e.g. 123450 -> "1.234,50 ₺". */
export function formatTL(kurus: Kurus): string {
  assertKurus(kurus);
  const sign = kurus < 0 ? '-' : '';
  const abs = Math.abs(kurus);
  const lira = Math.trunc(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = (abs % 100).toString().padStart(2, '0');
  return `${sign}${lira},${fraction} ₺`;
}

export function sumKurus(values: readonly Kurus[]): Kurus {
  let total = 0;
  for (const value of values) {
    assertKurus(value);
    total += value;
  }
  assertKurus(total);
  return total;
}
