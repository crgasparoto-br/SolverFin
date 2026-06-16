export type FinancialAvailabilityConfidence = "high" | "medium" | "low";
export type AvailabilityComponentKind =
  | "balance"
  | "income"
  | "known_expense"
  | "card"
  | "registered_recurrence"
  | "inferred"
  | "reserve"
  | "safety_margin"
  | "ignored";
export type AvailabilityCardState = "loading" | "empty" | "ready" | "low_confidence" | "error";
export type AvailabilityReviewAction =
  | "open_details"
  | "edit_assumptions"
  | "review_inferred_recurrences"
  | "retry";

export interface DailyAvailabilityComponent {
  label: string;
  kind: AvailabilityComponentKind;
  amountMinor: number;
  confidence: FinancialAvailabilityConfidence;
  source: string;
}

export interface DailyAvailabilityResult {
  availableTodayMinor: number;
  projectedBalanceMinor: number;
  currency: string;
  horizonStartOn: string;
  horizonEndOn: string;
  confidence: FinancialAvailabilityConfidence;
  components: readonly DailyAvailabilityComponent[];
  assumptions: readonly string[];
  appliedAssumptionIds: readonly string[];
  limitations: readonly string[];
  calculatedAt: string;
}

export interface AvailabilityDashboardCard {
  state: AvailabilityCardState;
  title: string;
  amountText?: string;
  subtitle: string;
  confidence?: FinancialAvailabilityConfidence;
  primaryAction: AvailabilityReviewAction;
  secondaryActions: readonly AvailabilityReviewAction[];
}

export interface AvailabilityDetailSection {
  title: string;
  rows: readonly AvailabilityDetailRow[];
}

export interface AvailabilityDetailRow {
  label: string;
  amountText: string;
  source: string;
  confidence: FinancialAvailabilityConfidence;
}

export interface AvailabilityReviewItem {
  id: string;
  label: string;
  description: string;
  action: AvailabilityReviewAction;
}

export interface BuildAvailabilityDashboardInput {
  result?: DailyAvailabilityResult;
  isLoading?: boolean;
  errorMessage?: string;
}

export interface AvailabilityDashboardViewModel {
  card: AvailabilityDashboardCard;
  detailSections: readonly AvailabilityDetailSection[];
  reviewItems: readonly AvailabilityReviewItem[];
}

export function buildAvailabilityDashboardViewModel(
  input: BuildAvailabilityDashboardInput,
): AvailabilityDashboardViewModel {
  if (input.isLoading === true) {
    return {
      card: {
        state: "loading",
        title: "Disponibilidade de hoje",
        subtitle: "Atualizando saldo, compromissos e premissas.",
        primaryAction: "open_details",
        secondaryActions: [],
      },
      detailSections: [],
      reviewItems: [],
    };
  }

  if (input.errorMessage !== undefined) {
    return {
      card: {
        state: "error",
        title: "Disponibilidade de hoje",
        subtitle: input.errorMessage,
        primaryAction: "retry",
        secondaryActions: [],
      },
      detailSections: [],
      reviewItems: [],
    };
  }

  if (input.result === undefined) {
    return {
      card: {
        state: "empty",
        title: "Disponibilidade de hoje",
        subtitle: "Cadastre saldo, compromissos ou premissas para calcular o valor com seguranca.",
        primaryAction: "edit_assumptions",
        secondaryActions: [],
      },
      detailSections: [],
      reviewItems: [],
    };
  }

  const state = input.result.confidence === "low" ? "low_confidence" : "ready";

  return {
    card: {
      state,
      title: "Disponibilidade de hoje",
      amountText: formatMoney(input.result.availableTodayMinor, input.result.currency),
      subtitle:
        state === "low_confidence"
          ? "Confira as premissas antes de decidir, pois ha dados incompletos ou inferidos com baixa confianca."
          : `Baseado nos dados ate ${formatDate(input.result.horizonEndOn)}.`,
      confidence: input.result.confidence,
      primaryAction: "open_details",
      secondaryActions: ["edit_assumptions", "review_inferred_recurrences"],
    },
    detailSections: buildDetailSections(input.result),
    reviewItems: buildReviewItems(input.result),
  };
}

function buildDetailSections(result: DailyAvailabilityResult): AvailabilityDetailSection[] {
  const knownRows = result.components
    .filter((component) => component.kind !== "inferred" && component.kind !== "ignored")
    .map((component) => buildDetailRow(component, result.currency));
  const inferredRows = result.components
    .filter((component) => component.kind === "inferred")
    .map((component) => buildDetailRow(component, result.currency));
  const ignoredRows = result.components
    .filter((component) => component.kind === "ignored")
    .map((component) => buildDetailRow(component, result.currency));
  const sections: AvailabilityDetailSection[] = [];

  if (knownRows.length > 0) {
    sections.push({ title: "Dados conhecidos", rows: knownRows });
  }

  if (inferredRows.length > 0) {
    sections.push({ title: "Recorrencias inferidas", rows: inferredRows });
  }

  if (ignoredRows.length > 0) {
    sections.push({ title: "Itens ignorados por premissa", rows: ignoredRows });
  }

  return sections;
}

function buildReviewItems(result: DailyAvailabilityResult): AvailabilityReviewItem[] {
  const items: AvailabilityReviewItem[] = [];

  if (result.appliedAssumptionIds.length > 0) {
    items.push({
      id: "assumptions",
      label: "Revisar premissas",
      description: "Ajuste horizonte, reserva, margem de seguranca e categorias ignoradas.",
      action: "edit_assumptions",
    });
  }

  if (result.components.some((component) => component.kind === "inferred")) {
    items.push({
      id: "inferred-recurrences",
      label: "Revisar recorrencias sugeridas",
      description: "Aceite, ignore ou ajuste gastos recorrentes encontrados por estatistica.",
      action: "review_inferred_recurrences",
    });
  }

  if (result.limitations.length > 0) {
    items.push({
      id: "limitations",
      label: "Conferir limitacoes",
      description: result.limitations.join(" "),
      action: "open_details",
    });
  }

  return items;
}

function buildDetailRow(
  component: DailyAvailabilityResult["components"][number],
  currency: string,
): AvailabilityDetailRow {
  return {
    label: component.label,
    amountText: formatMoney(component.amountMinor, currency),
    source: component.source,
    confidence: component.confidence,
  };
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${date}T00:00:00.000Z`));
}
