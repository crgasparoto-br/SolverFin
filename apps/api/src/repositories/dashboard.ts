import type { TenantContext } from "@solverfin/domain";

import { query } from "../db.js";

export interface DashboardSummaryItem {
  id: string;
  description: string;
  kind: "income" | "expense" | "transfer";
  amountMinor: number;
  occurredOn: string;
  status: string;
}

export interface DashboardSummary {
  currency: "BRL";
  availableBalanceMinor: number;
  incomeMinor: number;
  expensesMinor: number;
  plannedCommitmentsMinor: number;
  recentItems: DashboardSummaryItem[];
  generatedAt: string;
}

interface KindTotalRow {
  kind: string;
  status: string;
  total: string;
}

interface RecentTransactionRow {
  id: string;
  description: string;
  kind: string;
  amountMinor: number;
  occurredOn: Date;
  status: string;
}

export async function buildFinancialSummary(context: TenantContext): Promise<DashboardSummary> {
  const [openingBalanceRows, lifetimeTotals, monthTotals, recentRows] = await Promise.all([
    query<{ total: string | null }>(
      `select coalesce(sum("openingBalanceMinor"), 0) as total from "Account"
       where "organizationId" = $1 and "financialProfileId" = $2 and "status" = 'ACTIVE'`,
      [context.organizationId, context.financialProfileId],
    ),
    query<KindTotalRow>(
      `select "kind", "status", sum("amountMinor")::text as total from "Transaction"
       where "organizationId" = $1 and "financialProfileId" = $2 and "status" in ('POSTED', 'RECONCILED')
       group by "kind", "status"`,
      [context.organizationId, context.financialProfileId],
    ),
    query<KindTotalRow>(
      `select "kind", "status", sum("amountMinor")::text as total from "Transaction"
       where "organizationId" = $1 and "financialProfileId" = $2
         and date_trunc('month', "occurredOn") = date_trunc('month', current_date)
       group by "kind", "status"`,
      [context.organizationId, context.financialProfileId],
    ),
    query<RecentTransactionRow>(
      `select "id", "description", "kind", "amountMinor", "occurredOn", "status" from "Transaction"
       where "organizationId" = $1 and "financialProfileId" = $2 and "status" != 'VOIDED'
       order by "occurredOn" desc, "createdAt" desc
       limit 8`,
      [context.organizationId, context.financialProfileId],
    ),
  ]);

  const lifetimeIncome = sumByKind(lifetimeTotals, "INCOME");
  const lifetimeExpense = sumByKind(lifetimeTotals, "EXPENSE");
  const openingBalance = Number(openingBalanceRows[0]?.total ?? 0);

  const monthIncome = sumByKindAndStatus(monthTotals, "INCOME", ["POSTED", "RECONCILED"]);
  const monthExpense = sumByKindAndStatus(monthTotals, "EXPENSE", ["POSTED", "RECONCILED"]);
  const monthPlanned = sumByKindAndStatus(monthTotals, "EXPENSE", ["PLANNED", "SUGGESTED"]);

  return {
    currency: "BRL",
    availableBalanceMinor: openingBalance + lifetimeIncome - lifetimeExpense,
    incomeMinor: monthIncome,
    expensesMinor: monthExpense,
    plannedCommitmentsMinor: monthPlanned,
    recentItems: recentRows.map((row) => ({
      id: row.id,
      description: row.description,
      kind: row.kind.toLowerCase() as DashboardSummaryItem["kind"],
      amountMinor: row.amountMinor,
      occurredOn: row.occurredOn.toISOString().slice(0, 10),
      status: row.status.toLowerCase(),
    })),
    generatedAt: new Date().toISOString(),
  };
}

function sumByKind(rows: readonly KindTotalRow[], kind: string): number {
  return rows
    .filter((row) => row.kind === kind)
    .reduce((total, row) => total + Number(row.total), 0);
}

function sumByKindAndStatus(
  rows: readonly KindTotalRow[],
  kind: string,
  statuses: readonly string[],
): number {
  return rows
    .filter((row) => row.kind === kind && statuses.includes(row.status))
    .reduce((total, row) => total + Number(row.total), 0);
}
