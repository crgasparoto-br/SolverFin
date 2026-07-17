export interface AccountRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
  openingBalanceMinor: number;
  institutionKey?: string;
}

export interface TransactionRecord {
  id: string;
  description: string;
  kind: string;
  status: string;
  source?: string;
  amountMinor: number;
  occurredOn: string;
  plannedOn: string;
  effectiveOn?: string;
  accountId?: string;
  destinationAccountId?: string;
  categoryId?: string;
  cardId?: string;
  invoiceId?: string;
  recurrenceId?: string;
  accountRemuneration?: {
    indexKind: "cdi";
    competenceOn: string;
    processedOn: string;
    balanceBaseMinor: number;
    dailyRatePercent: number;
    remunerationPercent: number;
    appliedDailyRatePercent: number;
    originalAmountMinor: number;
    manuallyAdjusted: boolean;
    adjustedAt?: string;
  };
}

export interface StatementFilters {
  accountId?: string;
  month: string;
  day?: string;
  startsOn: string;
  endsOn: string;
}

export interface StatementRow {
  transaction: TransactionRecord;
  amountMinor: number;
  balanceAfterMinor: number;
}

export interface StatementSummary {
  openingMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  plannedBalanceMinor: number;
  effectiveBalanceMinor: number;
  reconciledMinor: number;
  unreconciledMinor: number;
  pendingMinor: number;
  pendingCount: number;
  reconciledCount: number;
  unreconciledCount: number;
}

export function resolveFilters(
  url: URL | undefined,
  accounts: AccountRecord[],
  currentMonth = getCurrentMonth(),
): StatementFilters {
  const month = resolveSelectedMonth(url, currentMonth);
  const day = resolveSelectedDay(url, month);
  const period = day ? dayToPeriod(day) : monthToPeriod(month);
  const accountId = url?.searchParams.get("accountId") ?? accounts[0]?.id;

  return {
    ...(accountId ? { accountId } : {}),
    month,
    ...(day ? { day } : {}),
    startsOn: period.startsOn,
    endsOn: period.endsOn,
  };
}

export function monthToPeriod(month: string): Pick<StatementFilters, "startsOn" | "endsOn"> {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const startsOn = new Date(Date.UTC(year, monthIndex, 1));
  const endsOn = new Date(Date.UTC(year, monthIndex + 1, 0));

  return {
    startsOn: startsOn.toISOString().slice(0, 10),
    endsOn: endsOn.toISOString().slice(0, 10),
  };
}

export function dayToPeriod(day: string): Pick<StatementFilters, "startsOn" | "endsOn"> {
  return { startsOn: day, endsOn: day };
}

export function buildTransactionQuery(filters: StatementFilters): string {
  return new URLSearchParams({
    status: "all",
    accountId: filters.accountId ?? "",
    plannedTo: filters.endsOn,
  }).toString();
}

export function isAccountStatementTransaction(transaction: TransactionRecord): boolean {
  return (
    transaction.accountId !== undefined ||
    (transaction.cardId === undefined && transaction.invoiceId === undefined)
  );
}

export function filterStatementPeriodTransactions(
  transactions: TransactionRecord[],
  filters: StatementFilters,
): TransactionRecord[] {
  return transactions.filter((transaction) => {
    const date = statementDate(transaction);

    return date >= filters.startsOn && date <= filters.endsOn;
  });
}

export function calculateOpeningBalance(
  transactions: TransactionRecord[],
  selectedAccount: AccountRecord | undefined,
  startsOn: string,
): number {
  let balance = selectedAccount?.openingBalanceMinor ?? 0;

  for (const transaction of transactions
    .filter((candidate) => candidate.status !== "voided")
    .sort((left, right) => statementDate(left).localeCompare(statementDate(right)))) {
    if (statementDate(transaction) >= startsOn) continue;
    if (transaction.effectiveOn === undefined) continue;

    balance += signedAmount(transaction, selectedAccount?.id);
  }

  return balance;
}

export function buildRows(
  transactions: TransactionRecord[],
  selectedAccount: AccountRecord | undefined,
  openingMinor: number,
): StatementRow[] {
  let balance = openingMinor;

  return transactions
    .filter((transaction) => transaction.status !== "voided")
    .sort((left, right) => statementDate(left).localeCompare(statementDate(right)))
    .map((transaction) => {
      const amountMinor = signedAmount(transaction, selectedAccount?.id);
      balance += amountMinor;

      return {
        transaction,
        amountMinor,
        balanceAfterMinor: balance,
      };
    });
}

export function summarize(rows: StatementRow[], openingMinor: number): StatementSummary {
  return rows.reduce<StatementSummary>(
    (summary, row) => {
      const absolute = Math.abs(row.amountMinor);

      if (row.amountMinor >= 0) summary.incomeMinor += row.amountMinor;
      if (row.amountMinor < 0) summary.expenseMinor += absolute;
      summary.plannedBalanceMinor += row.amountMinor;

      if (row.transaction.effectiveOn === undefined) {
        summary.pendingMinor += absolute;
        summary.pendingCount += 1;
        return summary;
      }

      summary.effectiveBalanceMinor += row.amountMinor;
      if (row.transaction.status === "reconciled") {
        summary.reconciledMinor += absolute;
        summary.reconciledCount += 1;
      } else {
        summary.unreconciledMinor += absolute;
        summary.unreconciledCount += 1;
      }

      return summary;
    },
    {
      openingMinor,
      incomeMinor: 0,
      expenseMinor: 0,
      plannedBalanceMinor: openingMinor,
      effectiveBalanceMinor: openingMinor,
      reconciledMinor: 0,
      unreconciledMinor: 0,
      pendingMinor: 0,
      pendingCount: 0,
      reconciledCount: 0,
      unreconciledCount: 0,
    },
  );
}

export function signedAmount(
  transaction: TransactionRecord,
  selectedAccountId: string | undefined,
): number {
  if (transaction.kind === "income") return transaction.amountMinor;
  if (transaction.kind === "expense") return -transaction.amountMinor;
  if (transaction.kind === "transfer" && transaction.destinationAccountId === selectedAccountId) {
    return transaction.amountMinor;
  }
  if (transaction.kind === "transfer" && transaction.accountId === selectedAccountId) {
    return -transaction.amountMinor;
  }
  return 0;
}

export function statementDate(transaction: TransactionRecord): string {
  return transaction.effectiveOn ?? transaction.plannedOn ?? transaction.occurredOn;
}

function resolveSelectedMonth(url: URL | undefined, currentMonth: string): string {
  const queryMonth = url?.searchParams.get("month");
  if (isValidMonth(queryMonth)) return queryMonth;

  const startsOn = url?.searchParams.get("startsOn");
  const legacyMonth = startsOn?.slice(0, 7);
  if (isValidMonth(legacyMonth)) return legacyMonth;

  return currentMonth;
}

function resolveSelectedDay(url: URL | undefined, month: string): string | undefined {
  const queryDay = url?.searchParams.get("day");
  if (!isValidDateOnly(queryDay)) return undefined;
  if (!queryDay.startsWith(`${month}-`)) return undefined;

  return queryDay;
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function isValidMonth(value: string | null | undefined): value is string {
  if (!/^\d{4}-\d{2}$/.test(value ?? "")) return false;

  const month = Number(value?.slice(5, 7));
  return month >= 1 && month <= 12;
}

function isValidDateOnly(value: string | null | undefined): value is string {
  const normalized = value ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;

  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
