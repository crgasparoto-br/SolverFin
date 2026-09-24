import {
  attachFreeToSpendIndicator,
  buildCashFlowProjection,
  FREE_TO_SPEND_HORIZON_DAYS,
  resolveCashFlowProjectionWindow,
  type CashFlowProjection,
  type CashFlowProjectionWithFreeToSpend,
  type TenantContext,
} from "@solverfin/domain";

import { buildFinancialSummary } from "./dashboard.js";
import { listFutureCommitmentsForContext } from "./future-commitments.js";

export interface CashFlowProjectionFilters {
  referenceDate: string;
  horizonDays: number;
  currency?: string;
}

export async function buildCashFlowProjectionForContext(
  context: TenantContext,
  filters: CashFlowProjectionFilters,
): Promise<CashFlowProjection | CashFlowProjectionWithFreeToSpend> {
  const window = resolveCashFlowProjectionWindow(filters.referenceDate, filters.horizonDays);
  const [summary, agenda] = await Promise.all([
    buildFinancialSummary(context, new Date(`${window.referenceDate}T00:00:00.000Z`)),
    listFutureCommitmentsForContext(context, {
      from: window.from,
      to: window.to,
      ...(filters.currency ? { currency: filters.currency } : {}),
    }),
  ]);

  const requestedCurrency = filters.currency?.trim().toUpperCase();
  const openingBalances = summary.currencyBlocks
    .filter((block) => requestedCurrency === undefined || block.currency === requestedCurrency)
    .map((block) => ({
      currency: block.currency,
      amountMinor: block.availableBalanceMinor,
    }));

  const projection = buildCashFlowProjection({
    window,
    openingBalances,
    commitments: agenda.commitments,
    ...(filters.currency ? { currency: filters.currency } : {}),
  });

  return window.horizonDays === FREE_TO_SPEND_HORIZON_DAYS
    ? attachFreeToSpendIndicator(projection)
    : projection;
}
