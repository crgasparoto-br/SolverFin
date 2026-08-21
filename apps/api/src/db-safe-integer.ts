import { parseSafeMoneyMinor } from "@solverfin/domain/money";

/** PostgreSQL OID for int8/BIGINT. */
export const POSTGRES_INT8_OID = 20;

/**
 * node-postgres returns BIGINT as text by default. SolverFin deliberately keeps
 * its public JSON contract as numbers, so the conversion is centralized and
 * rejects anything that cannot be represented exactly by JavaScript.
 */
export function parsePostgresBigIntAsSafeNumber(value: string): number {
  return parseSafeMoneyMinor(value, "PostgreSQL BIGINT");
}
