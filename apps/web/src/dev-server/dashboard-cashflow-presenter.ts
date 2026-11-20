import { formatDateOnly } from "@solverfin/shared";

import type {
  DashboardCashFlowProjection,
  DashboardCashFlowProjectionViewModel,
} from "./dashboard-presenter.js";

export function presentCashFlowProjection(
  projection: DashboardCashFlowProjection,
): DashboardCashFlowProjectionViewModel {
  return {
    referenceDateLabel: formatDateOnly(projection.referenceDate),
    horizonDays: projection.horizonDays,
    currencies: projection.currencyBlocks.map((block) => {
      const freeToSpend = projection.freeToSpend?.currencyBlocks.find(
        (candidate) => candidate.currency === block.currency,
      );

      return {
        currency: block.currency,
        closingBalance: money(block.closingBalanceMinor, block.currency),
        points: (block.points ?? []).map((point) => ({
          date: point.date,
          balance: money(point.closingBalanceMinor, block.currency),
        })),
        freeToSpend:
          freeToSpend?.status === "available"
            ? {
                status: "available" as const,
                amount: money(freeToSpend.freeToSpendMinor, block.currency),
                projectedDeficit: money(freeToSpend.projectedDeficitMinor, block.currency),
                minimumBalance: money(freeToSpend.minimumProjectedBalanceMinor, block.currency),
                minimumBalanceOnLabel: formatDateOnly(freeToSpend.minimumBalanceOn),
              }
            : { status: "unavailable" as const },
        href: `/relatorios?view=cash-flow&referenceDate=${encodeURIComponent(
          projection.referenceDate,
        )}&horizonDays=${projection.horizonDays}#cash-flow-${encodeURIComponent(
          block.currency.toLowerCase(),
        )}`,
      };
    }),
  };
}

function money(amountMinor: number, currency: string): { amountMinor: number; currency: string } {
  return { amountMinor, currency };
}
