import { buildDashboardViewModel } from "./calculations.js";
import { dashboardMockDataSet } from "./mock-data.js";

export const dashboardReadyExample = buildDashboardViewModel(dashboardMockDataSet);
export const dashboardLoadingExample = buildDashboardViewModel(undefined, "loading");
export const dashboardErrorExample = buildDashboardViewModel(undefined, "error");

export const dashboardEmptyExample = buildDashboardViewModel({
  context: dashboardMockDataSet.context,
  period: dashboardMockDataSet.period,
  openingBalanceInCents: 0,
  entries: [],
  upcomingBills: [],
});

export const dashboardExpectedTotals = {
  balanceInCents: 582250,
  incomeInCents: 700000,
  expenseInCents: 357750,
  resultInCents: 342250,
  expenseRatioPercent: 51.11,
  availableTodayInCents: 14320,
} as const;

export function isDashboardMockConsistent(): boolean {
  return (
    dashboardReadyExample.summary.balanceInCents === dashboardExpectedTotals.balanceInCents &&
    dashboardReadyExample.summary.incomeInCents === dashboardExpectedTotals.incomeInCents &&
    dashboardReadyExample.summary.expenseInCents === dashboardExpectedTotals.expenseInCents &&
    dashboardReadyExample.summary.resultInCents === dashboardExpectedTotals.resultInCents &&
    dashboardReadyExample.summary.expenseRatioPercent ===
      dashboardExpectedTotals.expenseRatioPercent &&
    dashboardReadyExample.availability.amountInCents ===
      dashboardExpectedTotals.availableTodayInCents
  );
}
