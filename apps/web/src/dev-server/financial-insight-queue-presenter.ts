import { formatDateOnly } from "@solverfin/shared";

import type { ApiFailure, ApiSuccess } from "./api.js";
import type { MoneyViewModel } from "./screen-view-model.js";

/**
 * View-model boundary for the actionable financial insight queue (#621).
 *
 * The API already delivers deduplicated, canonically ordered items; this presenter never
 * re-sorts, filters by heuristics or recalculates financial values. It only maps the public
 * contract to labels, money view-models and deep links.
 */
export type FinancialInsightSeverity = "info" | "warning" | "critical";
export type FinancialInsightKind =
  | "negative_balance_risk"
  | "budget_exceeded"
  | "category_spending_increase"
  | "merchant_spending_increase"
  | "probable_subscription"
  | "monthly_summary";

export interface FinancialInsightQueueApiItem {
  id: string;
  state: "active" | "snoozed" | "resolved";
  severity: FinancialInsightSeverity;
  fingerprint: string;
  confidence?: number;
  snoozedUntil?: string;
  resolvedAt?: string;
  proposal: {
    insightKind: FinancialInsightKind;
    title: string;
    summary: string;
    periodStartOn: string;
    periodEndOn: string;
    currency: string;
    filters: { currency: string; categoryId?: string; merchantKey?: string };
    evidence: ReadonlyArray<{
      label: string;
      value: number;
      unit: "minor_currency" | "percentage" | "count";
      currency?: string;
    }>;
    navigation?: {
      view: "transactions" | "budgets" | "cash_flow";
      categoryId?: string;
      merchantKey?: string;
      referenceDate?: string;
      horizonDays?: number;
    };
  };
}

export interface FinancialInsightQueueApiPage {
  state: "active" | "snoozed" | "resolved";
  total: number;
  offset: number;
  limit: number;
  nextOffset?: number;
  items: FinancialInsightQueueApiItem[];
}

export type FinancialInsightEvidenceValueViewModel =
  | { kind: "money"; money: MoneyViewModel }
  | { kind: "text"; text: string };

export interface FinancialInsightItemViewModel {
  id: string;
  fingerprint: string;
  severity: FinancialInsightSeverity;
  severityLabel: string;
  kindLabel: string;
  title: string;
  summary: string;
  currency: string;
  periodLabel: string;
  evidence: ReadonlyArray<{ label: string; value: FinancialInsightEvidenceValueViewModel }>;
  href?: string;
  hrefLabel: string;
}

export type FinancialInsightQueueViewModel =
  | { status: "unavailable"; message: string }
  | {
      status: "ready";
      total: number;
      items: readonly FinancialInsightItemViewModel[];
      hasMore: boolean;
    };

export const DASHBOARD_FINANCIAL_INSIGHT_LIMIT = 3;
export const FINANCIAL_INSIGHTS_INBOX_ANCHOR = "financial-insights";

const SEVERITY_LABELS: Readonly<Record<FinancialInsightSeverity, string>> = {
  critical: "Crítico",
  warning: "Atenção",
  info: "Informativo",
};

const KIND_LABELS: Readonly<Record<FinancialInsightKind, string>> = {
  negative_balance_risk: "Risco de saldo negativo",
  budget_exceeded: "Orçamento excedido",
  category_spending_increase: "Gasto maior por categoria",
  merchant_spending_increase: "Gasto maior por estabelecimento",
  probable_subscription: "Assinatura provável",
  monthly_summary: "Resumo do mês",
};

const EVIDENCE_LABELS: Readonly<Record<string, string>> = {
  receitas: "Receitas",
  despesas: "Despesas",
  saldo: "Saldo realizado",
  despesas_periodo_anterior: "Despesas no período anterior",
  variacao_despesas_percentual: "Variação das despesas",
  diferenca: "Diferença",
  menor_saldo_projetado: "Menor saldo projetado",
  deficit_projetado: "Déficit projetado",
  saldo_fim_horizonte: "Saldo no fim do horizonte",
  horizonte_dias: "Horizonte (dias)",
};

export function presentFinancialInsightQueue(
  result: ApiSuccess<FinancialInsightQueueApiPage> | ApiFailure,
  options: { evidenceLimit?: number } = {},
): FinancialInsightQueueViewModel {
  if (!result.ok) return { status: "unavailable", message: result.error };
  return {
    status: "ready",
    total: result.data.total,
    items: result.data.items.map((item) => presentFinancialInsightItem(item, options)),
    hasMore: result.data.nextOffset !== undefined,
  };
}

export function presentFinancialInsightItem(
  item: FinancialInsightQueueApiItem,
  options: { evidenceLimit?: number } = {},
): FinancialInsightItemViewModel {
  const proposal = item.proposal;
  const href = buildFinancialInsightHref(proposal);
  return {
    id: item.id,
    fingerprint: item.fingerprint,
    severity: item.severity,
    severityLabel: SEVERITY_LABELS[item.severity],
    kindLabel: KIND_LABELS[proposal.insightKind],
    title: proposal.title,
    summary: proposal.summary,
    currency: proposal.currency,
    periodLabel: `${formatDateOnly(proposal.periodStartOn)} a ${formatDateOnly(proposal.periodEndOn)}`,
    evidence: proposal.evidence
      .slice(0, options.evidenceLimit ?? proposal.evidence.length)
      .map((evidence) => ({
        label: evidenceLabel(proposal.insightKind, evidence.label),
        value:
          evidence.unit === "minor_currency"
            ? {
                kind: "money" as const,
                money: {
                  amountMinor: evidence.value,
                  currency: evidence.currency ?? proposal.currency,
                },
              }
            : {
                kind: "text" as const,
                text:
                  evidence.unit === "percentage" ? `${evidence.value}%` : String(evidence.value),
              },
      })),
    ...(href === undefined ? {} : { href }),
    hrefLabel: hrefLabel(proposal.navigation?.view),
  };
}

/** Deep link that reproduces the canonical slice that justified the insight. */
export function buildFinancialInsightHref(
  proposal: FinancialInsightQueueApiItem["proposal"],
): string | undefined {
  const navigation = proposal.navigation;
  if (navigation === undefined) return undefined;
  if (navigation.view === "cash_flow") {
    if (navigation.referenceDate === undefined || navigation.horizonDays === undefined) {
      return "/relatorios?view=cash-flow";
    }
    const query = new URLSearchParams({
      view: "cash-flow",
      referenceDate: navigation.referenceDate,
      horizonDays: String(navigation.horizonDays),
    });
    return `/relatorios?${query.toString()}#cash-flow-${encodeURIComponent(
      proposal.currency.toLowerCase(),
    )}`;
  }
  if (navigation.view === "budgets") {
    const query = new URLSearchParams();
    if (navigation.categoryId) query.set("categoryId", navigation.categoryId);
    const search = query.toString();
    return search ? `/orcamentos?${search}` : "/orcamentos";
  }
  const query = new URLSearchParams();
  const month = proposal.periodStartOn.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(month)) query.set("month", month);
  if (navigation.categoryId) query.set("categoryId", navigation.categoryId);
  if (navigation.merchantKey) query.set("merchantKey", navigation.merchantKey);
  const search = query.toString();
  return search ? `/lancamentos?${search}` : "/lancamentos";
}

function hrefLabel(view: "transactions" | "budgets" | "cash_flow" | undefined): string {
  if (view === "cash_flow") return "Ver projeção de caixa";
  if (view === "budgets") return "Ver orçamento";
  return "Ver lançamentos";
}

function evidenceLabel(kind: FinancialInsightKind, label: string): string {
  const known = EVIDENCE_LABELS[label];
  if (known !== undefined) return known;
  if (label === "valor_atual") {
    if (kind === "probable_subscription") return "Valor médio mensal";
    if (kind === "budget_exceeded") return "Despesas realizadas";
    return "Gasto no período atual";
  }
  if (label === "valor_anterior_ou_planejado") {
    return kind === "budget_exceeded" ? "Orçamento planejado" : "Gasto no período anterior";
  }
  if (label === "variacao_percentual") {
    return kind === "probable_subscription"
      ? "Maior desvio em relação à média"
      : "Variação percentual";
  }
  if (label === "amostra") {
    return kind === "probable_subscription"
      ? "Meses consecutivos considerados"
      : "Lançamentos considerados";
  }
  if (label.startsWith("variacao_categoria:")) {
    return `Variação em ${label.slice("variacao_categoria:".length)}`;
  }
  const text = label.replaceAll("_", " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Evidência";
}
