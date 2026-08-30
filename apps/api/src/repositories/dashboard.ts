import type { TenantContext } from "@solverfin/domain";
import { addSafeMoneyMinor } from "@solverfin/domain/money";

import { query } from "../db.js";
import { toDateOnly } from "./repository-date-utils.js";

export interface DashboardSummaryItem {
  id: string;
  description: string;
  kind: "income" | "expense" | "transfer";
  amountMinor: number;
  currency: string;
  occurredOn: string;
  status: string;
}

export interface DashboardAccountReference {
  id: string;
  name: string;
  status: string;
}

export interface DashboardCurrencyBlock {
  currency: string;
  availableBalanceMinor: number;
  incomeMinor: number;
  expensesMinor: number;
  netVariationMinor?: number;
  plannedCommitmentsMinor: number;
  accounts?: DashboardAccountReference[];
}

export interface DashboardSummary {
  currencyBlocks: DashboardCurrencyBlock[];
  recentItems: DashboardSummaryItem[];
  generatedAt: string;
  /**
   * Compatibility fields are emitted only when the summary has exactly one currency block.
   * Multi-currency and empty responses never expose a synthetic scalar aggregate.
   */
  currency?: string;
  availableBalanceMinor?: number;
  incomeMinor?: number;
  expensesMinor?: number;
  netVariationMinor?: number;
  plannedCommitmentsMinor?: number;
}

interface CurrencyTotalRow {
  currency: string;
  total: string | null;
}

interface KindTotalRow {
  currency: string;
  kind: string;
  status: string;
  total: string;
}

interface RecentTransactionRow {
  id: string;
  description: string;
  kind: string;
  amountMinor: number;
  currency: string;
  occurredOn: Date;
  status: string;
}

interface AccountReferenceRow {
  id: string;
  name: string;
  currency: string;
  status: string;
}

export async function buildFinancialSummary(
  context: TenantContext,
  now: Date = new Date(),
): Promise<DashboardSummary> {
  const referenceDate = toDateOnly(now);
  const [
    openingBalanceRows,
    cashMovementRows,
    monthTotals,
    plannedTotals,
    recentRows,
    accountRows,
  ] = await Promise.all([
    query<CurrencyTotalRow>(
      `select upper("currency") as "currency", coalesce(sum("openingBalanceMinor"), 0)::text as total
         from "Account"
        where "organizationId" = $1 and "financialProfileId" = $2 and "status" = 'ACTIVE'
        group by upper("currency")`,
      [context.organizationId, context.financialProfileId],
    ),
    query<CurrencyTotalRow>(
      `select upper(movement."currency") as "currency", coalesce(sum(
         case
           when movement."kind" = 'INCOME' and source_account."id" is not null
             then movement."amountMinor"
           when movement."kind" = 'EXPENSE' and source_account."id" is not null
             then -movement."amountMinor"
           when movement."kind" = 'TRANSFER'
             then (case when destination_account."id" is not null then movement."amountMinor" else 0 end)
                - (case when source_account."id" is not null then movement."amountMinor" else 0 end)
           else 0
         end
       ), 0)::text as total
         from "Transaction" movement
         left join "Account" source_account
           on source_account."id" = movement."accountId"
          and source_account."organizationId" = movement."organizationId"
          and source_account."financialProfileId" = movement."financialProfileId"
          and source_account."status" = 'ACTIVE'
         left join "Account" destination_account
           on destination_account."id" = movement."destinationAccountId"
          and destination_account."organizationId" = movement."organizationId"
          and destination_account."financialProfileId" = movement."financialProfileId"
          and destination_account."status" = 'ACTIVE'
        where movement."organizationId" = $1
          and movement."financialProfileId" = $2
          and movement."status" in ('POSTED', 'RECONCILED')
          and movement."effectiveOn" is not null
          and movement."effectiveOn" <= $3::date
        group by upper(movement."currency")`,
      [context.organizationId, context.financialProfileId, referenceDate],
    ),
    query<KindTotalRow>(
      `select upper(movement."currency") as "currency", movement."kind", movement."status",
              sum(movement."amountMinor")::text as total
         from "Transaction" movement
        where movement."organizationId" = $1
          and movement."financialProfileId" = $2
          and movement."kind" in ('INCOME', 'EXPENSE')
          and movement."status" in ('POSTED', 'RECONCILED')
          and date_trunc('month', movement."occurredOn") = date_trunc('month', $3::date)
          and not exists (
            select 1
              from "Invoice" invoice
             where invoice."organizationId" = $1
               and invoice."financialProfileId" = $2
               and invoice."paymentTransactionId" = movement."id"
          )
        group by upper(movement."currency"), movement."kind", movement."status"`,
      [context.organizationId, context.financialProfileId, referenceDate],
    ),
    query<KindTotalRow>(
      `select upper(movement."currency") as "currency", movement."kind", movement."status",
              sum(movement."amountMinor")::text as total
         from "Transaction" movement
        where movement."organizationId" = $1
          and movement."financialProfileId" = $2
          and movement."kind" = 'EXPENSE'
          and movement."status" in ('PLANNED', 'SUGGESTED')
          and movement."effectiveOn" is null
          and date_trunc('month', movement."plannedOn") = date_trunc('month', $3::date)
        group by upper(movement."currency"), movement."kind", movement."status"`,
      [context.organizationId, context.financialProfileId, referenceDate],
    ),
    query<RecentTransactionRow>(
      `select "id", "description", "kind", "amountMinor", upper("currency") as "currency",
              "occurredOn", "status"
         from "Transaction"
        where "organizationId" = $1 and "financialProfileId" = $2 and "status" != 'VOIDED'
        order by "occurredOn" desc, "createdAt" desc
        limit 8`,
      [context.organizationId, context.financialProfileId],
    ),
    query<AccountReferenceRow>(
      `select "id", "name", upper("currency") as "currency", "status"
         from "Account"
        where "organizationId" = $1 and "financialProfileId" = $2
        order by lower("name"), "id"`,
      [context.organizationId, context.financialProfileId],
    ),
  ]);

  const currencies = new Set<string>();
  for (const row of openingBalanceRows) {
    currencies.add(normalizeCurrencyCode(row.currency));
  }
  for (const row of cashMovementRows) {
    currencies.add(normalizeCurrencyCode(row.currency));
  }
  for (const row of monthTotals) {
    currencies.add(normalizeCurrencyCode(row.currency));
  }
  for (const row of plannedTotals) {
    currencies.add(normalizeCurrencyCode(row.currency));
  }

  const currencyBlocks = [...currencies]
    .sort((left, right) => left.localeCompare(right))
    .map((currency) => {
      const openingBalance = sumCurrencyTotals(openingBalanceRows, currency);
      const cashMovement = sumCurrencyTotals(cashMovementRows, currency);
      const monthIncome = sumByKindAndStatus(monthTotals, currency, "INCOME", [
        "POSTED",
        "RECONCILED",
      ]);
      const monthExpense = sumByKindAndStatus(monthTotals, currency, "EXPENSE", [
        "POSTED",
        "RECONCILED",
      ]);
      const monthPlanned = sumByKindAndStatus(plannedTotals, currency, "EXPENSE", [
        "PLANNED",
        "SUGGESTED",
      ]);
      const netVariation = addSafeMoneyMinor(
        [monthIncome, -monthExpense],
        `dashboard monthly net variation for ${currency}`,
      );

      return {
        currency,
        availableBalanceMinor: addSafeMoneyMinor(
          [openingBalance, cashMovement],
          `dashboard available balance for ${currency}`,
        ),
        incomeMinor: monthIncome,
        expensesMinor: monthExpense,
        netVariationMinor: netVariation,
        plannedCommitmentsMinor: monthPlanned,
        accounts: accountRows
          .filter((account) => normalizeCurrencyCode(account.currency) === currency)
          .map((account) => ({
            id: account.id,
            name: account.name,
            status: account.status.toLowerCase(),
          })),
      };
    });

  const recentItems = recentRows.map((row) => ({
    id: row.id,
    description: row.description,
    kind: row.kind.toLowerCase() as DashboardSummaryItem["kind"],
    amountMinor: row.amountMinor,
    currency: normalizeCurrencyCode(row.currency),
    occurredOn: row.occurredOn.toISOString().slice(0, 10),
    status: row.status.toLowerCase(),
  }));
  const summary: DashboardSummary = {
    currencyBlocks,
    recentItems,
    generatedAt: now.toISOString(),
  };

  if (currencyBlocks.length === 1) {
    const [singleCurrency] = currencyBlocks;
    if (singleCurrency !== undefined) {
      summary.currency = singleCurrency.currency;
      summary.availableBalanceMinor = singleCurrency.availableBalanceMinor;
      summary.incomeMinor = singleCurrency.incomeMinor;
      summary.expensesMinor = singleCurrency.expensesMinor;
      summary.netVariationMinor = singleCurrency.netVariationMinor;
      summary.plannedCommitmentsMinor = singleCurrency.plannedCommitmentsMinor;
    }
  }

  return summary;
}

function sumCurrencyTotals(rows: readonly CurrencyTotalRow[], currency: string): number {
  return addSafeMoneyMinor(
    rows
      .filter((row) => normalizeCurrencyCode(row.currency) === currency)
      .map((row) => row.total ?? "0"),
    `dashboard aggregate for ${currency}`,
  );
}

function sumByKindAndStatus(
  rows: readonly KindTotalRow[],
  currency: string,
  kind: string,
  statuses: readonly string[],
): number {
  return addSafeMoneyMinor(
    rows
      .filter(
        (row) =>
          normalizeCurrencyCode(row.currency) === currency &&
          row.kind === kind &&
          statuses.includes(row.status),
      )
      .map((row) => row.total),
    `dashboard ${kind.toLowerCase()} aggregate for ${currency}`,
  );
}

function normalizeCurrencyCode(currency: string): string {
  return currency.trim().toUpperCase();
}
