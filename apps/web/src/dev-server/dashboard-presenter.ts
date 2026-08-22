import { formatDateOnly } from "@solverfin/shared";

import type { ApiFailure, ApiSuccess } from "./api.js";
import {
  errorScreen,
  successScreen,
  type MoneyViewModel,
  type ScreenDataProvenance,
  type ScreenViewModel,
} from "./screen-view-model.js";

export interface DashboardTransaction {
  id: string;
  description: string;
  kind: "income" | "expense" | "transfer";
  status: string;
  amountMinor: number;
  occurredOn: string;
  plannedOn?: string;
  invoiceId?: string;
  installmentId?: string;
}

export interface DashboardOpenInvoice {
  dueOn: string;
}

export interface DashboardFinancialSummaryItem {
  description: string;
  kind: string;
  amountMinor: number;
  currency: string;
  occurredOn: string;
  status: string;
}

export interface DashboardFinancialSummaryCurrencyBlock {
  currency: string;
  availableBalanceMinor: number;
  incomeMinor: number;
  expensesMinor: number;
  plannedCommitmentsMinor: number;
}

export interface DashboardFinancialSummary {
  currencyBlocks: DashboardFinancialSummaryCurrencyBlock[];
  recentItems: DashboardFinancialSummaryItem[];
}

export interface DashboardMetricViewModel {
  title: string;
  subtitle: string;
  amount: MoneyViewModel;
}

export interface DashboardCurrencySummaryViewModel {
  currency: string;
  metrics: readonly DashboardMetricViewModel[];
}

export interface DashboardNextActionViewModel {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}

export interface DashboardRecentItemViewModel {
  description: string;
  kind: string;
  status: string;
  occurredOnLabel: string;
  amount: MoneyViewModel;
}

export interface DashboardContentViewModel {
  currencySummaries: readonly DashboardCurrencySummaryViewModel[];
  nextActions: readonly DashboardNextActionViewModel[];
  recentItems: readonly DashboardRecentItemViewModel[];
}

export type DashboardScreenViewModel = ScreenViewModel<DashboardContentViewModel>;

export interface DashboardPresenterInput {
  summary: ApiSuccess<DashboardFinancialSummary> | ApiFailure;
  transactions: ApiSuccess<{ transactions: DashboardTransaction[] }> | ApiFailure;
  pendingReview: ApiSuccess<{ messages: unknown[] }> | ApiFailure;
  openInvoices: ApiSuccess<{ invoices: DashboardOpenInvoice[] }> | ApiFailure;
  filters: Readonly<Record<string, string>>;
}

export function presentDashboard(input: DashboardPresenterInput): DashboardScreenViewModel {
  const context = {
    filters: input.filters,
    provenance: dashboardProvenance(input),
  };

  if (!input.summary.ok) {
    return errorScreen(context, { message: input.summary.error });
  }

  return successScreen(context, {
    currencySummaries: input.summary.data.currencyBlocks.map(presentCurrencySummary),
    nextActions: presentNextActions(input.transactions, input.pendingReview, input.openInvoices),
    recentItems: input.summary.data.recentItems.map((item) => ({
      description: item.description,
      kind: item.kind,
      status: item.status,
      occurredOnLabel: formatDateOnly(item.occurredOn),
      amount: money(item.amountMinor, item.currency),
    })),
  });
}

function presentCurrencySummary(
  block: DashboardFinancialSummaryCurrencyBlock,
): DashboardCurrencySummaryViewModel {
  return {
    currency: block.currency,
    metrics: [
      {
        title: "Disponível estimado",
        subtitle: "Saldo das contas ativas",
        amount: money(block.availableBalanceMinor, block.currency),
      },
      {
        title: "Receitas do mês",
        subtitle: "Entradas postadas no mês atual",
        amount: money(block.incomeMinor, block.currency),
      },
      {
        title: "Despesas do mês",
        subtitle: "Saídas postadas no mês atual",
        amount: money(block.expensesMinor, block.currency),
      },
      {
        title: "Compromissos previstos",
        subtitle: "Lançamentos planejados no mês",
        amount: money(block.plannedCommitmentsMinor, block.currency),
      },
    ],
  };
}

function presentNextActions(
  transactionsResult: ApiSuccess<{ transactions: DashboardTransaction[] }> | ApiFailure,
  pendingReview: ApiSuccess<{ messages: unknown[] }> | ApiFailure,
  openInvoices: ApiSuccess<{ invoices: DashboardOpenInvoice[] }> | ApiFailure,
): DashboardNextActionViewModel[] {
  const plannedTransactions = transactionsResult.ok
    ? transactionsResult.data.transactions.filter(isPlannedCommitment)
    : [];
  const reviewCount = pendingReview.ok ? pendingReview.data.messages.length : 0;
  const invoices = openInvoices.ok ? openInvoices.data.invoices : [];
  const plannedCount = plannedTransactions.length;
  const reviewPlural = reviewCount === 1 ? "m" : "ns";
  const invoicePlural = invoices.length === 1 ? "" : "s";
  const plannedPlural = plannedCount === 1 ? "" : "s";
  const plannedDueDates = plannedTransactions.map(getTransactionDueDate);
  const actions: DashboardNextActionViewModel[] = [];

  if (plannedCount > 0) {
    actions.push({
      title: `${plannedCount} lançamento${plannedPlural} previsto${plannedPlural} no Extrato`,
      description: `Próximo vencimento em ${formatDateOnly(nearestDueDate(plannedDueDates))}.`,
      href: "/lancamentos",
      linkLabel: "Ver extrato",
    });
  }

  if (reviewCount > 0) {
    actions.push({
      title: `${reviewCount} ite${reviewPlural} aguardando revisão na inbox`,
      description: "Confirme ou ajuste as sugestões antes de usá-las como lançamento.",
      href: "/inbox",
      linkLabel: "Abrir inbox",
    });
  }

  if (invoices.length > 0) {
    actions.push({
      title: `${invoices.length} fatura${invoicePlural} de cartão em aberto`,
      description: `Próximo vencimento em ${formatDateOnly(nearestDueDate(invoices.map((item) => item.dueOn)))}.`,
      href: "/cartoes",
      linkLabel: "Ver cartões",
    });
  }

  return actions;
}

function dashboardProvenance(input: DashboardPresenterInput): ScreenDataProvenance[] {
  return [
    provenance("/api/financial-summary", input.summary.ok),
    provenance("/api/transactions?status=all", input.transactions.ok),
    provenance("/api/bank-message-inbox?status=pending_review", input.pendingReview.ok),
    provenance("/api/invoices?status=open", input.openInvoices.ok),
  ];
}

function provenance(resource: string, available: boolean): ScreenDataProvenance {
  return {
    source: "api",
    resource,
    availability: available ? "available" : "unavailable",
  };
}

function isPlannedCommitment(transaction: DashboardTransaction): boolean {
  return (
    (transaction.status === "planned" || transaction.status === "suggested") &&
    (transaction.kind === "income" || transaction.kind === "expense") &&
    transaction.invoiceId === undefined &&
    transaction.installmentId === undefined
  );
}

function getTransactionDueDate(transaction: DashboardTransaction): string {
  return transaction.plannedOn ?? transaction.occurredOn;
}

function nearestDueDate(dates: string[]): string {
  return dates.slice().sort((left, right) => left.localeCompare(right))[0] ?? "";
}

function money(amountMinor: number, currency: string): MoneyViewModel {
  return { amountMinor, currency };
}
