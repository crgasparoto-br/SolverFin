import { query } from "./db.js";

/**
 * Integration tests pin CDI rates on fixed future dates (2037 onwards) while
 * `FinancialIndexRate` and `AccountRemuneration` are global tables. Residue
 * from previous runs would change the latest stored rate and break the
 * incremental-import expectations, so each test resets that date space first.
 */
const TEST_RATE_HORIZON = "2037-01-01";

export async function resetAccountRemunerationTestData(): Promise<void> {
  const removedRemunerations = await query<{ transactionId: string | null }>(
    `delete from "AccountRemuneration"
      where "competenceOn" >= $1::date
      returning "transactionId"`,
    [TEST_RATE_HORIZON],
  );
  const transactionIds = removedRemunerations
    .map((row) => row.transactionId)
    .filter((transactionId): transactionId is string => transactionId !== null);

  if (transactionIds.length > 0) {
    await query(`delete from "Transaction" where "id" = any($1::uuid[])`, [transactionIds]);
  }

  await query(
    `delete from "FinancialIndexRate" where "kind" = 'CDI' and "referenceOn" >= $1::date`,
    [TEST_RATE_HORIZON],
  );
  await query(`delete from "AccountRemunerationConfiguration" where "startsOn" >= $1::date`, [
    TEST_RATE_HORIZON,
  ]);
}
