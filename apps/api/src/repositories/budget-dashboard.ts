import {
  summarizeBudgetDashboard,
  type BudgetUsageSummary,
  type TenantContext,
} from "@solverfin/domain";

import { listBudgetsForContext } from "./budgets.js";
import { listTransactionsForContext } from "./transactions.js";

export async function summarizeBudgetDashboardForContext(
  context: TenantContext,
  periodStartOn: string,
  periodEndOn: string,
  currency?: string,
): Promise<BudgetUsageSummary[]> {
  const input = {
    context,
    budgets: [],
    transactions: [],
    periodStartOn,
    periodEndOn,
    ...(currency ? { currency } : {}),
  };

  // Validate the public period/currency contract before issuing repository reads.
  summarizeBudgetDashboard(input);

  const [budgets, transactions] = await Promise.all([
    listBudgetsForContext(context, { status: "all", periodStartOn, periodEndOn }),
    listTransactionsForContext(context, { occurredFrom: periodStartOn, occurredTo: periodEndOn }),
  ]);

  return summarizeBudgetDashboard({
    ...input,
    budgets,
    transactions,
  });
}
