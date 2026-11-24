// PostgreSQL NUMERIC remains an exact decimal string. Never install a pg NUMERIC
// -> Number parser; money must not lose precision during API serialization.
export function decimalAmount(value: string): string {
  if (!/^-?\d+\.\d{2}$/.test(value))
    throw new TypeError('Expected a decimal amount with two fractional digits');
  return value;
}

export function isoTimestamp(value: Date): string {
  return value.toISOString();
}
