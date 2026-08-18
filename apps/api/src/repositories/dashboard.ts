import type { TenantContext } from "@solverfin/domain";

import { query } from "../db.js";
import { toDateOnly } from "./repository-date-utils.js";

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

interface TotalRow {
  total: string | null;
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

export async function buildFinancialSummary(
  context: TenantContext,
  now: Date = new Date(),
): Promise<DashboardSummary> {
  const referenceDate = toDateOnly(now);
  const [openingBalanceRows, cashMovementRows, monthTotals, plannedTotals, recentRows] =
    await Promise.all([
      query<TotalRow>(
        `select coalesce(sum("openingBalanceMinor"), 0)::text as total from "Account"
         where "organizationId" = $1 and "financialProfileId" = $2 and "status" = 'ACTIVE'`,
        [context.organizationId, context.financialProfileId],
      ),
      query<TotalRow>(
        `select coalesce(sum(
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
            and movement."effectiveOn" <= $3::date`,
        [context.organizationId, context.financialProfileId, referenceDate],
      ),
      query<KindTotalRow>(
        `select movement."kind", movement."status", sum(movement."amountMinor")::text as total
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
          group by movement."kind", movement."status"`,
        [context.organizationId, context.financialProfileId, referenceDate],
      ),
      query<KindTotalRow>(
        `select movement."kind", movement."status", sum(movement."amountMinor")::text as total
           from "Transaction" movement
          where movement."organizationId" = $1
            and movement."financialProfileId" = $2
            and movement."kind" = 'EXPENSE'
            and movement."status" in ('PLANNED', 'SUGGESTED')
            and movement."effectiveOn" is null
            and date_trunc('month', movement."plannedOn") = date_trunc('month', $3::date)
          group by movement."kind", movement."status"`,
        [context.organizationId, context.financialProfileId, referenceDate],
      ),
      query<RecentTransactionRow>(
        `select "id", "description", "kind", "amountMinor", "occurredOn", "status" from "Transaction"
         where "organizationId" = $1 and "financialProfileId" = $2 and "status" != 'VOIDED'
         order by "occurredOn" desc, "createdAt" desc
         limit 8`,
        [context.organizationId, context.financialProfileId],
      ),
    ]);

  const openingBalance = Number(openingBalanceRows[0]?.total ?? 0);
  const cashMovement = Number(cashMovementRows[0]?.total ?? 0);
  const monthIncome = sumByKindAndStatus(monthTotals, "INCOME", ["POSTED", "RECONCILED"]);
  const monthExpense = sumByKindAndStatus(monthTotals, "EXPENSE", ["POSTED", "RECONCILED"]);
  const monthPlanned = sumByKindAndStatus(plannedTotals, "EXPENSE", ["PLANNED", "SUGGESTED"]);

  return {
    currency: "BRL",
    availableBalanceMinor: openingBalance + cashMovement,
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
    generatedAt: now.toISOString(),
  };
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
