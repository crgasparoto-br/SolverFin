import { formatDateOnly } from "@solverfin/shared";

import type { ApiFailure, ApiSuccess } from "./api.js";
import {
  emptyScreen,
  errorScreen,
  successScreen,
  type MoneyViewModel,
  type ScreenDataProvenance,
  type ScreenViewModel,
} from "./screen-view-model.js";

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
  href: string;
  linkLabel: string;
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

export interface DashboardDataQualityViewModel {
  status: "complete" | "partial";
  title: string;
  description: string;
}

export interface DashboardDecisionModuleViewModel {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}

export interface DashboardContentViewModel {
  currencySummaries: readonly DashboardCurrencySummaryViewModel[];
  nextActions: readonly DashboardNextActionViewModel[];
  recentItems: readonly DashboardRecentItemViewModel[];
  dataQuality: DashboardDataQualityViewModel;
  decisionModules: readonly DashboardDecisionModuleViewModel[];
}

export type DashboardScreenViewModel = ScreenViewModel<DashboardContentViewModel>;

export interface DashboardPresenterInput {
  summary: ApiSuccess<DashboardFinancialSummary> | ApiFailure;
  pendingReview: ApiSuccess<{ messages: unknown[] }> | ApiFailure;
  openInvoices: ApiSuccess<{ invoices: DashboardOpenInvoice[] }> | ApiFailure;
  filters: Readonly<Record<string, string>>;
}

type DashboardDrilldownKind = "income" | "expense";
type DashboardDrilldownEvidence = "posted" | "planned";

interface DashboardDrilldownFilters {
  kind?: DashboardDrilldownKind;
  evidence?: DashboardDrilldownEvidence;
}

export function presentDashboard(input: DashboardPresenterInput): DashboardScreenViewModel {
  const context = {
    filters: input.filters,
    provenance: dashboardProvenance(input),
  };

  if (!input.summary.ok) {
    return errorScreen(context, { message: input.summary.error });
  }

  if (
    input.summary.data.currencyBlocks.length === 0 &&
    input.summary.data.recentItems.length === 0
  ) {
    return emptyScreen(context, {
      title: "Ainda não há dados financeiros para este perfil.",
      description: "Cadastre uma conta ou um lançamento para iniciar o cockpit financeiro.",
    });
  }

  return successScreen(context, {
    currencySummaries: input.summary.data.currencyBlocks.map(presentCurrencySummary),
    nextActions: presentNextActions(
      input.summary.data.currencyBlocks,
      input.pendingReview,
      input.openInvoices,
    ),
    recentItems: input.summary.data.recentItems.map((item) => ({
      description: item.description,
      kind: item.kind,
      status: item.status,
      occurredOnLabel: formatDateOnly(item.occurredOn),
      amount: money(item.amountMinor, item.currency),
    })),
    dataQuality: presentDataQuality(input.pendingReview, input.openInvoices),
    decisionModules: decisionModules(),
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
        href: currencyDrilldownHref(block.currency),
        linkLabel: `Ver extrato em ${block.currency}`,
      },
      {
        title: "Receitas do mês",
        subtitle: "Entradas postadas no mês atual",
        amount: money(block.incomeMinor, block.currency),
        href: currencyDrilldownHref(block.currency, { kind: "income", evidence: "posted" }),
        linkLabel: `Ver receitas postadas em ${block.currency}`,
      },
      {
        title: "Despesas do mês",
        subtitle: "Saídas postadas no mês atual",
        amount: money(block.expensesMinor, block.currency),
        href: currencyDrilldownHref(block.currency, { kind: "expense", evidence: "posted" }),
        linkLabel: `Ver despesas postadas em ${block.currency}`,
      },
      {
        title: "Compromissos previstos",
        subtitle: "Despesas planejadas no mês",
        amount: money(block.plannedCommitmentsMinor, block.currency),
        href: currencyDrilldownHref(block.currency, { kind: "expense", evidence: "planned" }),
        linkLabel: `Ver compromissos planejados em ${block.currency}`,
      },
    ],
  };
}

function presentNextActions(
  currencyBlocks: DashboardFinancialSummaryCurrencyBlock[],
  pendingReview: ApiSuccess<{ messages: unknown[] }> | ApiFailure,
  openInvoices: ApiSuccess<{ invoices: DashboardOpenInvoice[] }> | ApiFailure,
): DashboardNextActionViewModel[] {
  const reviewCount = pendingReview.ok ? pendingReview.data.messages.length : 0;
  const invoices = openInvoices.ok ? openInvoices.data.invoices : [];
  const reviewPlural = reviewCount === 1 ? "m" : "ns";
  const invoicePlural = invoices.length === 1 ? "" : "s";
  const actions: DashboardNextActionViewModel[] = currencyBlocks
    .filter((block) => block.plannedCommitmentsMinor > 0)
    .map((block) => ({
      title: `Compromissos previstos em ${block.currency}`,
      description: "Revise os lançamentos planejados desta moeda no Extrato.",
      href: currencyDrilldownHref(block.currency, { kind: "expense", evidence: "planned" }),
      linkLabel: `Ver compromissos planejados em ${block.currency}`,
    }));

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

function presentDataQuality(
  pendingReview: ApiSuccess<{ messages: unknown[] }> | ApiFailure,
  openInvoices: ApiSuccess<{ invoices: DashboardOpenInvoice[] }> | ApiFailure,
): DashboardDataQualityViewModel {
  if (!pendingReview.ok || !openInvoices.ok) {
    return {
      status: "partial",
      title: "Dados parciais",
      description:
        "Os indicadores financeiros estão disponíveis, mas alguns alertas operacionais não puderam ser carregados.",
    };
  }

  return {
    status: "complete",
    title: "Dados atualizados",
    description: "Os indicadores e alertas disponíveis preservam a moeda de origem.",
  };
}

function decisionModules(): DashboardDecisionModuleViewModel[] {
  return [
    {
      eyebrow: "Orçamento",
      title: "Planejamento financeiro",
      description: "Organize o horizonte financeiro sem converter valores entre moedas.",
      href: "/planejamento",
      linkLabel: "Abrir planejamento",
    },
    {
      eyebrow: "Projeções",
      title: "Tendências e períodos",
      description: "Compare a evolução observável dos dados financeiros por período.",
      href: "/relatorios",
      linkLabel: "Abrir relatórios",
    },
    {
      eyebrow: "Insights",
      title: "Assistente financeiro",
      description: "Use explicações e insights como apoio, mantendo os valores verificáveis.",
      href: "/assistente-financeiro",
      linkLabel: "Abrir assistente",
    },
  ];
}

function dashboardProvenance(input: DashboardPresenterInput): ScreenDataProvenance[] {
  return [
    provenance("/api/financial-summary", input.summary.ok),
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

function currencyDrilldownHref(currency: string, filters: DashboardDrilldownFilters = {}): string {
  const query = new URLSearchParams({ currency: currency.toUpperCase() });
  if (filters.kind) query.set("kind", filters.kind);
  if (filters.evidence) query.set("evidence", filters.evidence);
  return `/lancamentos?${query.toString()}`;
}

function nearestDueDate(dates: string[]): string {
  return dates.slice().sort((left, right) => left.localeCompare(right))[0] ?? "";
}

function money(amountMinor: number, currency: string): MoneyViewModel {
  return { amountMinor, currency };
}
