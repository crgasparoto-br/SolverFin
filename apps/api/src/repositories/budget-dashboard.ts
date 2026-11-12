import {
  summarizeOperationalBudgetDashboard,
  type OperationalBudgetUsageSummary,
  type TenantContext,
} from "@solverfin/domain";

import { listBudgetsForContext, listBudgetTransactionsForContext } from "./budgets.js";
import { listFutureCommitmentsForContext } from "./future-commitments.js";

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

  const [budgets, budgetTransactions, agenda] = await Promise.all([
    listBudgetsForContext(context, { status: "all", periodStartOn, periodEndOn }),
    listBudgetTransactionsForContext(context, periodStartOn, periodEndOn),
    listFutureCommitmentsForContext(context, {
      from: periodStartOn,
      to: periodEndOn,
      ...(currency ? { currency } : {}),
    }),
  ]);

  return summarizeOperationalBudgetDashboard({
    ...input,
    budgets,
    transactions: budgetTransactions.transactions,
    invoicePaymentTransactionIds: budgetTransactions.invoicePaymentTransactionIds,
    commitments: agenda.commitments,
  });
}
