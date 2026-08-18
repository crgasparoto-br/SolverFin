import {
  filterStatementPeriodTransactions,
  statementDate,
  type StatementFilters,
  type TransactionRecord,
} from "./transactions-statement.js";

const distinctDates: TransactionRecord = {
  id: "transaction-temporal-precedence",
  description: "Despesa com datas distintas",
  kind: "expense",
  status: "posted",
  amountMinor: 2500,
  currency: "BRL",
  occurredOn: "2026-06-10",
  plannedOn: "2026-07-15",
  effectiveOn: "2026-08-20",
  accountId: "account-temporal",
};

const juneFilters: StatementFilters = {
  accountId: "account-temporal",
  month: "2026-06",
  startsOn: "2026-06-01",
  endsOn: "2026-06-30",
};
const julyFilters: StatementFilters = {
  accountId: "account-temporal",
  month: "2026-07",
  startsOn: "2026-07-01",
  endsOn: "2026-07-31",
};
const augustFilters: StatementFilters = {
  accountId: "account-temporal",
  month: "2026-08",
  startsOn: "2026-08-01",
  endsOn: "2026-08-31",
};

testOperationalStatementUsesEffectiveDate();
testOperationalStatementFallsBackToPlannedDate();
testLegacyStatementFallsBackToOccurredDate();

function testOperationalStatementUsesEffectiveDate(): void {
  const june = filterStatementPeriodTransactions([distinctDates], juneFilters);
  const july = filterStatementPeriodTransactions([distinctDates], julyFilters);
  const august = filterStatementPeriodTransactions([distinctDates], augustFilters);

  assertEqual(statementDate(distinctDates), "2026-08-20", "effective date precedence");
  assertEqual(june.length, 0, "economic month ignored after cash effect");
  assertEqual(july.length, 0, "planned month ignored after cash effect");
  assertEqual(august.length, 1, "effective month drives account statement");
}

function testOperationalStatementFallsBackToPlannedDate(): void {
  const planned: TransactionRecord = { ...distinctDates, status: "planned" };
  delete planned.effectiveOn;
  const july = filterStatementPeriodTransactions([planned], julyFilters);

  assertEqual(statementDate(planned), "2026-07-15", "planned date precedence");
  assertEqual(july.length, 1, "planned commitment uses planned statement period");
}

function testLegacyStatementFallsBackToOccurredDate(): void {
  const legacy = {
    ...distinctDates,
    status: "posted",
    plannedOn: undefined,
    effectiveOn: undefined,
  } as unknown as TransactionRecord;

  assertEqual(statementDate(legacy), "2026-06-10", "legacy occurred date fallback");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
