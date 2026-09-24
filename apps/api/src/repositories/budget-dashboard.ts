import {
  summarizeOperationalBudgetDashboard,
  type OperationalBudgetUsageSummary,
  type TenantContext,
} from "@solverfin/domain";

import { listBudgetsForContext } from "./budgets.js";
import { listFutureCommitmentsForContext } from "./future-commitments.js";
import { listTransactionsForContext } from "./transactions.js";

export async function summarizeBudgetDashboardForContext(
  context: TenantContext,
  periodStartOn: string,
  periodEndOn: string,
  currency?: string,
): Promise<OperationalBudgetUsageSummary[]> {
  const input = {
    context,
    budgets: [],
    transactions: [],
    commitments: [],
    periodStartOn,
    periodEndOn,
    ...(currency ? { currency } : {}),
  };

  // Validate the public period/currency contract before issuing repository reads.
  summarizeOperationalBudgetDashboard(input);

  const [budgets, transactions, agenda] = await Promise.all([
    listBudgetsForContext(context, { status: "all", periodStartOn, periodEndOn }),
    listTransactionsForContext(context, { status: "all" }),
    listFutureCommitmentsForContext(context, {
      from: periodStartOn,
      to: periodEndOn,
      ...(currency ? { currency } : {}),
    }),
  ]);

  return summarizeOperationalBudgetDashboard({
    ...input,
    budgets,
    transactions,
    commitments: agenda.commitments,
  });
}
