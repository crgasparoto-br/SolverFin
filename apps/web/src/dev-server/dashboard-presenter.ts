import { formatDateOnly } from "@solverfin/shared";

import type { ApiFailure, ApiSuccess } from "./api.js";
import {
  emptyScreen,
  errorScreen,
  loadingScreen,
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

export interface DashboardAccountReference {
  id: string;
  name: string;
  status: string;
}

export interface DashboardFinancialSummaryCurrencyBlock {
  currency: string;
  availableBalanceMinor: number;
  incomeMinor: number;
  expensesMinor: number;
  netVariationMinor: number;
  plannedCommitmentsMinor: number;
  accounts?: readonly DashboardAccountReference[];
}

export interface DashboardFinancialSummary {
  currencyBlocks: DashboardFinancialSummaryCurrencyBlock[];
  recentItems: DashboardFinancialSummaryItem[];
}

export interface DashboardMetricEvidenceLinkViewModel {
  label: string;
  href: string;
}

export interface DashboardMetricViewModel {
  title: string;
  subtitle: string;
  amount: MoneyViewModel;
  href: string;
  linkLabel: string;
  evidenceId: string;
  evidenceTitle: string;
  evidenceLinks: readonly DashboardMetricEvidenceLinkViewModel[];
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

type DashboardMetricKey = "available" | "variation" | "income" | "expense" | "planned";

interface DashboardDrilldownFilters {
  kind?: DashboardDrilldownKind;
  evidence?: DashboardDrilldownEvidence;
}

export function presentDashboardLoading(
  filters: Readonly<Record<string, string>> = {},
): DashboardScreenViewModel {
  return loadingScreen({ filters, provenance: [] });
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
  const accounts = block.accounts ?? [];

  return {
    currency: block.currency,
    metrics: [
      metric(
        block,
        "available",
        "Disponível estimado",
        "Saldo das contas ativas",
        block.availableBalanceMinor,
        {},
        accounts.filter((account) => account.status === "active"),
        `Contas ativas que compõem o disponível em ${block.currency}`,
      ),
      metric(
        block,
        "variation",
        "Variação líquida do mês",
        "Receitas postadas menos despesas postadas",
        block.netVariationMinor,
        { evidence: "posted" },
        accounts,
        `Contas com evidência da variação postada em ${block.currency}`,
      ),
      metric(
        block,
        "income",
        "Receitas do mês",
        "Entradas postadas no mês atual",
        block.incomeMinor,
        { kind: "income", evidence: "posted" },
        accounts,
        `Contas com receitas postadas em ${block.currency}`,
      ),
      metric(
        block,
        "expense",
        "Despesas do mês",
        "Saídas postadas no mês atual",
        block.expensesMinor,
        { kind: "expense", evidence: "posted" },
        accounts,
        `Contas com despesas postadas em ${block.currency}`,
      ),
      metric(
        block,
        "planned",
        "Compromissos previstos",
        "Despesas planejadas no mês",
        block.plannedCommitmentsMinor,
        { kind: "expense", evidence: "planned" },
        accounts,
        `Contas com compromissos planejados em ${block.currency}`,
      ),
    ],
  };
}

function metric(
  block: DashboardFinancialSummaryCurrencyBlock,
  key: DashboardMetricKey,
  title: string,
  subtitle: string,
  amountMinor: number,
  filters: DashboardDrilldownFilters,
  accounts: readonly DashboardAccountReference[],
  evidenceTitle: string,
): DashboardMetricViewModel {
  const evidenceId = evidenceAnchorId(block.currency, key);

  return {
    title,
    subtitle,
    amount: money(amountMinor, block.currency),
    href: `#${evidenceId}`,
    linkLabel: `Ver evidências em ${block.currency}`,
    evidenceId,
    evidenceTitle,
    evidenceLinks: accounts.map((account) => ({
      label: account.status === "active" ? account.name : `${account.name} (inativa)`,
      href: accountDrilldownHref(account.id, block.currency, filters),
    })),
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
      href: `#${evidenceAnchorId(block.currency, "planned")}`,
      linkLabel: `Ver evidências em ${block.currency}`,
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
      href: "/assistente",
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

function evidenceAnchorId(currency: string, key: DashboardMetricKey): string {
  return `dashboard-evidence-${currency.toLowerCase()}-${key}`;
}

function accountDrilldownHref(
  accountId: string,
  currency: string,
  filters: DashboardDrilldownFilters,
): string {
  const query = new URLSearchParams({
    currency: currency.toUpperCase(),
    accountId,
  });
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