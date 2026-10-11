import { integer, object, refine, text, type Parsed, reject } from './validation.js';

export const MAX_MINOR_UNITS = 9223372036854775807n;
export const minorUnits = refine(text(1, 19), (value) => /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) <= MAX_MINOR_UNITS, 'Invalid nonnegative minor-unit amount');
export const moneyParser = object({
  currency: refine(text(3, 3), (value) => /^[A-Z]{3}$/.test(value), 'Expected uppercase currency code'),
  minorUnits,
  exponent: integer(0, 6),
});
export type Money = Parsed<typeof moneyParser>;

/** Exponent is explicit; provider/ruleset qualification determines allowed currencies. */
export function money(currency: string, amount: string | bigint, exponent: number): Money {
  if (typeof amount !== 'string' && typeof amount !== 'bigint') reject('Money must not enter through a floating-point number');
  return moneyParser({ currency, minorUnits: String(amount), exponent });
}
function compatible(left: Money, right: Money): void {
  if (left.currency !== right.currency || left.exponent !== right.exponent) reject('Incompatible monetary units');
}
export function addMoney(left: Money, right: Money): Money {
  const a = moneyParser(left); const b = moneyParser(right); compatible(a, b);
  return money(a.currency, BigInt(a.minorUnits) + BigInt(b.minorUnits), a.exponent);
}
export function compareMoney(left: Money, right: Money): -1 | 0 | 1 {
  const a = moneyParser(left); const b = moneyParser(right); compatible(a, b);
  return BigInt(a.minorUnits) < BigInt(b.minorUnits) ? -1 : BigInt(a.minorUnits) > BigInt(b.minorUnits) ? 1 : 0;
}
