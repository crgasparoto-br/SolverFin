import {
  buildFutureCommitmentAgenda,
  type FutureCommitmentAgenda,
  type TenantContext,
} from "@solverfin/domain";

import { listCardsForContext, listInvoicesForContext } from "./cards.js";
import { listInstallmentsForContext } from "./installments.js";
import { listPayableReceivablesForContext } from "./payables-receivables.js";
import { listRecurrencesForContext } from "./recurrences.js";
import { listTransactionsForContext } from "./transactions.js";

export interface ListFutureCommitmentsFilters {
  from: string;
  to: string;
  currency?: string;
}

export async function listFutureCommitmentsForContext(
  context: TenantContext,
  filters: ListFutureCommitmentsFilters,
): Promise<FutureCommitmentAgenda> {
  const [transactions, invoices, cards, recurrences, installments, payablesReceivables] =
    await Promise.all([
      listTransactionsForContext(context, { status: "all" }),
      listInvoicesForContext(context, { status: "all" }),
      listCardsForContext(context, { status: "all" }),
      listRecurrencesForContext(context, { status: "all" }),
      listInstallmentsForContext(context, { status: "all" }),
      listPayableReceivablesForContext(context, { status: "all" }),
    ]);

  return buildFutureCommitmentAgenda({
    context,
    from: filters.from,
    to: filters.to,
    transactions,
    invoices,
    cards,
    recurrences,
    installments,
    payablesReceivables,
    ...(filters.currency ? { currency: filters.currency } : {}),
  });
}
