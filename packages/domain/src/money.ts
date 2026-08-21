export const MIN_SUPPORTED_MONEY_MINOR = Number.MIN_SAFE_INTEGER;
export const MAX_SUPPORTED_MONEY_MINOR = Number.MAX_SAFE_INTEGER;

const MIN_SUPPORTED_MONEY_MINOR_BIGINT = BigInt(MIN_SUPPORTED_MONEY_MINOR);
const MAX_SUPPORTED_MONEY_MINOR_BIGINT = BigInt(MAX_SUPPORTED_MONEY_MINOR);

export class MoneyRangeError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "MoneyRangeError";
  }
}

/**
 * SolverFin exposes monetary minor units as JSON numbers. The exact supported
 * range therefore follows JavaScript safe integers, even though PostgreSQL
 * persists the values as BIGINT.
 */
export function assertSafeMoneyMinor(value: number, label = "money minor units"): number {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyRangeError(
      `${label} must be an integer between ${MIN_SUPPORTED_MONEY_MINOR} and ${MAX_SUPPORTED_MONEY_MINOR}.`,
    );
  }

  return value;
}

/**
 * Converts an exact integer representation from infrastructure boundaries into
 * the public number contract without allowing lossy coercion.
 */
export function parseSafeMoneyMinor(
  value: string | number | bigint,
  label = "money minor units",
): number {
  if (typeof value === "number") {
    return assertSafeMoneyMinor(value, label);
  }

  let exact: bigint;
  try {
    exact = typeof value === "bigint" ? value : parseIntegerString(value, label);
  } catch (error) {
    if (error instanceof MoneyRangeError) {
      throw error;
    }
    throw new MoneyRangeError(`${label} must be an exact integer.`);
  }

  if (exact < MIN_SUPPORTED_MONEY_MINOR_BIGINT || exact > MAX_SUPPORTED_MONEY_MINOR_BIGINT) {
    throw new MoneyRangeError(
      `${label} is outside the SolverFin safe JSON integer range (${MIN_SUPPORTED_MONEY_MINOR}..${MAX_SUPPORTED_MONEY_MINOR}).`,
    );
  }

  return Number(exact);
}

/**
 * Adds monetary values using BigInt internally and only returns to Number after
 * proving the aggregate is still representable exactly by the public contract.
 */
export function addSafeMoneyMinor(
  values: readonly (string | number | bigint)[],
  label = "money aggregate minor units",
): number {
  let total = 0n;

  for (const value of values) {
    const exact = BigInt(parseSafeMoneyMinor(value, label));
    total += exact;
  }

  if (total < MIN_SUPPORTED_MONEY_MINOR_BIGINT || total > MAX_SUPPORTED_MONEY_MINOR_BIGINT) {
    throw new MoneyRangeError(
      `${label} is outside the SolverFin safe JSON integer range (${MIN_SUPPORTED_MONEY_MINOR}..${MAX_SUPPORTED_MONEY_MINOR}).`,
    );
  }

  return Number(total);
}

function parseIntegerString(value: string, label: string): bigint {
  const normalized = value.trim();
  if (!/^[+-]?\d+$/.test(normalized)) {
    throw new MoneyRangeError(`${label} must be an exact integer.`);
  }

  return BigInt(normalized);
}
