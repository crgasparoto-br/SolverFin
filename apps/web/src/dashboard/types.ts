export type DashboardCurrency = "BRL";
export type DashboardEntryType = "income" | "expense";
export type DashboardEntryStatus = "posted" | "scheduled";
export type DashboardAvailabilityConfidence = "high" | "medium" | "low";
export type DashboardStateKind = "loading" | "empty" | "error" | "ready";

export interface DashboardMoneyAmount {
  amountInCents: number;
  currency: DashboardCurrency;
}

export interface DashboardPeriod {
  startsOn: string;
  endsOn: string;
  label: string;
}

export interface DashboardTenantContext {
  tenantId: string;
  financialProfileId: string;
}

export interface DashboardEntry {
  id: string;
  tenantId: string;
  financialProfileId: string;
  postedOn: string;
  description: string;
  type: DashboardEntryType;
  status: DashboardEntryStatus;
  amountInCents: number;
  categoryName?: string;
}

export interface DashboardUpcomingBill {
  id: string;
  tenantId: string;
  financialProfileId: string;
  dueOn: string;
  description: string;
  amountInCents: number;
  status: "open" | "paid" | "overdue";
}

export interface DashboardDailyAvailability {
  availableTodayInCents: number;
  currency: DashboardCurrency;
  confidence: DashboardAvailabilityConfidence;
  calculatedAt: string;
  detailPath?: string;
  assumptions: readonly string[];
  limitations: readonly string[];
}

export interface DashboardDataSet {
  context: DashboardTenantContext;
  period: DashboardPeriod;
  openingBalanceInCents: number;
  entries: readonly DashboardEntry[];
  upcomingBills: readonly DashboardUpcomingBill[];
  dailyAvailability?: DashboardDailyAvailability;
}

export interface DashboardSummary {
  balanceInCents: number;
  incomeInCents: number;
  expenseInCents: number;
  resultInCents: number;
  expenseRatioPercent: number;
}

export interface DashboardCategoryExpense {
  categoryName: string;
  amountInCents: number;
  sharePercent: number;
}

export interface DashboardMonthlyCashFlow {
  month: string;
  incomeInCents: number;
  expenseInCents: number;
  resultInCents: number;
}

export interface DashboardAvailabilityCard {
  state: "available" | "pending";
  title: string;
  description: string;
  amountInCents?: number;
  confidence?: DashboardAvailabilityConfidence;
  detailPath?: string;
  assumptions: readonly string[];
  limitations: readonly string[];
}

export interface DashboardViewModel {
  state: DashboardStateKind;
  title: string;
  description: string;
  period: DashboardPeriod;
  summary: DashboardSummary;
  availability: DashboardAvailabilityCard;
  categoryExpenses: readonly DashboardCategoryExpense[];
  monthlyCashFlow: readonly DashboardMonthlyCashFlow[];
  upcomingBills: readonly DashboardUpcomingBill[];
}
