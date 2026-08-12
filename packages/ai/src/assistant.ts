import { formatMinorCurrency } from "@solverfin/shared";

import {
  type AiConsentState,
  type AiProvider,
  type AiUsageContext,
  type AiUsagePolicy,
  maskSensitiveText,
  runAiTask,
  type SafeAiLogger,
} from "./index.js";

export type FinancialAssistantStatus = "answered" | "needs_review" | "blocked";
export type FinancialAssistantIntent =
  | "daily_availability"
  | "category_spending"
  | "balance_projection"
  | "subscriptions"
  | "monthly_summary"
  | "out_of_scope";
export type FinancialAssistantConfidence = "high" | "medium" | "low";
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

export interface AvailabilityComponent {
  label: string;
  kind: AvailabilityComponentKind;
  amountMinor: number;
  confidence?: FinancialAssistantConfidence;
  source: string;
}

export interface AvailabilityCalculationResult {
  availableTodayMinor: number;
  projectedBalanceMinor?: number;
  currency: string;
  horizonStartOn: string;
  horizonEndOn: string;
  confidence: FinancialAssistantConfidence;
  components: readonly AvailabilityComponent[];
  assumptions: readonly string[];
  appliedAssumptionIds?: readonly string[];
  limitations: readonly string[];
  calculatedAt: string;
}

export interface FinancialAssistantEvidenceMetric {
  key: string;
  label: string;
  amountMinor?: number;
  count?: number;
  text?: string;
}

export interface FinancialAssistantEvidence {
  currency: string;
  period: {
    startOn: string;
    endOn: string;
  };
  filters: readonly string[];
  metrics: readonly FinancialAssistantEvidenceMetric[];
  assumptions: readonly string[];
  limitations: readonly string[];
  sources: readonly string[];
  confidence: FinancialAssistantConfidence;
}

export interface FinancialAssistantAnswer {
  status: FinancialAssistantStatus;
  intent: FinancialAssistantIntent;
  confidence: FinancialAssistantConfidence;
  answer: string;
  period?: {
    startOn: string;
    endOn: string;
  };
  filters?: readonly string[];
  assumptions: readonly string[];
  sources: readonly string[];
  limitations: readonly string[];
  safeLogCode: string;
}

export interface FinancialAssistantInput {
  question: string;
  context: AiUsageContext;
  policy: AiUsagePolicy;
  provider?: AiProvider;
  resolveConsent?: () => AiConsentState | Promise<AiConsentState>;
  logger?: SafeAiLogger;
  availability?: AvailabilityCalculationResult;
  evidence?: FinancialAssistantEvidence;
}

const PROVIDER_QUANTITATIVE_CLAIM = new RegExp(
  [
    "\\d",
    "\\b(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\\b",
    "\\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\\b",
    "percent(?:ual|age)?",
    "por\\s+cento",
    "dobr\\w*",
    "triplic\\w*",
    "metade",
    "half",
    "double",
    "triple",
    "aument\\w*",
    "cres(?:c|ç)\\w*",
    "subi\\w*",
    "reduz\\w*",
    "diminui\\w*",
    "cai\\w*",
    "maior(?:es)?",
    "menor(?:es)?",
    "mais",
    "menos",
    "higher",
    "lower",
    "increase\\w*",
    "decrease\\w*",
    "grew",
    "fell",
  ].join("|"),
  "iu",
);

export async function answerFinancialQuestion(
  input: FinancialAssistantInput,
): Promise<FinancialAssistantAnswer> {
  const question = normalizeQuestion(input.question);
  const intent = classifyFinancialAssistantIntent(question);

  if (input.policy.consent !== "granted") {
    return buildFallbackAnswer({
      status: "blocked",
      intent,
      safeLogCode: "ASSISTANT_CONSENT_REQUIRED",
      answer:
        "Nao posso responder sem consentimento ativo para usar dados financeiros neste assistente.",
      limitations: ["Consentimento de IA ausente ou revogado."],
    });
  }

  if (question.length === 0) {
    return buildFallbackAnswer({
      intent: "out_of_scope",
      safeLogCode: "ASSISTANT_EMPTY_QUESTION",
      answer: "Envie uma pergunta financeira para que eu possa analisar o contexto autorizado.",
      limitations: ["Pergunta vazia."],
    });
  }

  if (intent === "daily_availability") {
    return answerDailyAvailability(input.availability);
  }

  if (intent === "out_of_scope") {
    return buildFallbackAnswer({
      intent,
      safeLogCode: "ASSISTANT_OUT_OF_SCOPE",
      answer:
        "Posso ajudar com saldo, gastos, faturas, recorrencias e resumos do SolverFin. Nao executo operacoes financeiras nem ofereco recomendacao profissional.",
      limitations: ["Pergunta fora do escopo financeiro somente leitura do app."],
    });
  }

  if (!input.evidence || input.evidence.metrics.length === 0) {
    return buildFallbackAnswer({
      intent,
      safeLogCode: "ASSISTANT_EVIDENCE_REQUIRED",
      answer:
        "Nao encontrei evidencia estruturada suficiente para responder sem inventar informacoes.",
      limitations: ["Dados autorizados insuficientes para esta pergunta."],
    });
  }

  const deterministicAnswer = buildEvidenceAnswer(intent, input.evidence);
  const baseAnswer: FinancialAssistantAnswer = {
    status: input.evidence.confidence === "low" ? "needs_review" : "answered",
    intent,
    confidence: input.evidence.confidence,
    answer: deterministicAnswer,
    period: input.evidence.period,
    filters: input.evidence.filters,
    assumptions: input.evidence.assumptions,
    sources: uniqueStrings(input.evidence.sources),
    limitations: input.evidence.limitations,
    safeLogCode: "ASSISTANT_DETERMINISTIC_ANSWERED",
  };

  if (!input.provider) {
    return baseAnswer;
  }

  if (!input.resolveConsent) {
    return buildFallbackAnswer({
      status: "blocked",
      intent,
      safeLogCode: "ASSISTANT_CONSENT_REVALIDATION_REQUIRED",
      answer:
        "Nao posso chamar o provedor sem revalidar o consentimento atual imediatamente antes da tentativa.",
      limitations: ["Resolvedor autoritativo de consentimento nao informado."],
    });
  }

  const aiResult = await runAiTask({
    provider: input.provider,
    task: "assistant",
    context: input.context,
    policy: {
      ...input.policy,
      allowRawFinancialText: false,
    },
    payload: {
      prompt: buildAssistantPrompt(intent, input.evidence),
      fields: { intent },
    },
    resolveConsent: input.resolveConsent,
    ...(input.logger ? { logger: input.logger } : {}),
  });

  if (aiResult.status !== "completed") {
    return {
      ...baseAnswer,
      limitations: [
        ...baseAnswer.limitations,
        "A narrativa por IA ficou indisponivel; a resposta usa apenas o calculo deterministico.",
      ],
      safeLogCode: `ASSISTANT_PROVIDER_FALLBACK_${aiResult.code}`,
    };
  }

  const narrative = sanitizeProviderNarrative(aiResult.result.text);
  if (narrative === undefined) {
    return {
      ...baseAnswer,
      limitations: [
        ...baseAnswer.limitations,
        "A narrativa por IA foi descartada por introduzir afirmacao quantitativa nao permitida.",
      ],
      safeLogCode: "ASSISTANT_PROVIDER_NARRATIVE_REJECTED",
    };
  }

  return {
    ...baseAnswer,
    answer: `${narrative} ${deterministicAnswer}`.trim(),
    safeLogCode: "ASSISTANT_PROVIDER_NARRATIVE_ANSWERED",
  };
}

export function classifyFinancialAssistantIntent(question: string): FinancialAssistantIntent {
  const normalized = normalizeQuestion(question);
  const asksAvailability =
    /quanto\s+(eu\s+)?posso\s+gastar\s+hoje/.test(normalized) ||
    /disponivel\s+hoje|disponibilidade/.test(normalized);

  if (asksAvailability) {
    return "daily_availability";
  }

  if (/resumo|mensal/.test(normalized)) {
    return "monthly_summary";
  }

  if (/categoria|gastei|despesa|gasto|receita/.test(normalized)) {
    return "category_spending";
  }

  if (/saldo|projecao|projetado/.test(normalized)) {
    return "balance_projection";
  }

  if (/assinatura|recorrente|recorrencia/.test(normalized)) {
    return "subscriptions";
  }

  if (/mes|fatura|parcela|compromisso/.test(normalized)) {
    return "monthly_summary";
  }

  return "out_of_scope";
}

function answerDailyAvailability(
  availability: AvailabilityCalculationResult | undefined,
): FinancialAssistantAnswer {
  if (!availability) {
    return buildFallbackAnswer({
      intent: "daily_availability",
      safeLogCode: "ASSISTANT_AVAILABILITY_SERVICE_MISSING",
      answer:
        "Ainda nao tenho base estruturada suficiente para calcular quanto pode ser gasto hoje. Sem essa base, nao vou estimar um valor livremente.",
      limitations: ["Calculo de disponibilidade financeira insuficiente ou indisponivel."],
    });
  }

  const currency = availability.currency;
  const availableText = formatMoney(availability.availableTodayMinor, currency);
  const components = buildComponentTexts(availability.components, currency);
  const ignoredCount = availability.components.filter((item) => item.kind === "ignored").length;
  const limitations = buildAvailabilityLimitations(availability.limitations, ignoredCount);
  const componentsText =
    components.length > 0
      ? `Principais componentes: ${components.join("; ")}.`
      : "Nao ha componentes detalhados no calculo.";
  const assumptionsText =
    availability.assumptions.length > 0
      ? `Premissas: ${availability.assumptions.join("; ")}.`
      : "Nenhuma premissa adicional foi informada.";
  const limitationsText =
    limitations.length > 0
      ? `Limitacoes: ${limitations.join("; ")}.`
      : "Sem limitacoes informadas.";

  return {
    status: availability.confidence === "low" ? "needs_review" : "answered",
    intent: "daily_availability",
    confidence: availability.confidence,
    answer: [
      `Disponibilidade estimada para hoje: ${availableText}.`,
      componentsText,
      assumptionsText,
      limitationsText,
    ].join(" "),
    period: {
      startOn: availability.horizonStartOn,
      endOn: availability.horizonEndOn,
    },
    filters: [`Moeda: ${availability.currency}`],
    assumptions: availability.assumptions,
    sources: uniqueStrings(availability.components.map((component) => component.source)),
    limitations,
    safeLogCode: "ASSISTANT_AVAILABILITY_ANSWERED",
  };
}

function buildEvidenceAnswer(
  intent: Exclude<FinancialAssistantIntent, "daily_availability" | "out_of_scope">,
  evidence: FinancialAssistantEvidence,
): string {
  const values = evidence.metrics.map((metric) => formatEvidenceMetric(metric, evidence.currency));
  const period = `${evidence.period.startOn} a ${evidence.period.endOn}`;
  if (!hasEvidenceSignal(evidence)) {
    return `Nao ha dados suficientes no periodo de ${period} para responder com seguranca.`;
  }
  const prefix =
    intent === "balance_projection"
      ? `Projecao para ${period}`
      : intent === "subscriptions"
        ? `Recorrencias e assinaturas provaveis em ${period}`
        : intent === "monthly_summary"
          ? `Resumo financeiro de ${period}`
          : `Movimentacao financeira de ${period}`;
  return `${prefix}: ${values.join("; ")}.`;
}

function hasEvidenceSignal(evidence: FinancialAssistantEvidence): boolean {
  if (evidence.confidence !== "low") return true;
  return evidence.metrics.some(
    (metric) =>
      (metric.amountMinor !== undefined && metric.amountMinor !== 0) ||
      (metric.count !== undefined && metric.count > 0) ||
      (metric.text !== undefined && metric.text.trim().length > 0),
  );
}

function formatEvidenceMetric(metric: FinancialAssistantEvidenceMetric, currency: string): string {
  const parts: string[] = [];
  if (metric.amountMinor !== undefined) parts.push(formatMoney(metric.amountMinor, currency));
  if (metric.count !== undefined) parts.push(`${metric.count} item(ns)`);
  if (metric.text !== undefined && metric.text.trim().length > 0) parts.push(metric.text.trim());
  return `${metric.label}: ${parts.join(" / ") || "sem valor"}`;
}

function buildComponentTexts(
  components: readonly AvailabilityComponent[],
  currency: string,
): string[] {
  return components
    .filter((component) => component.kind !== "ignored")
    .map((component) => `${component.label}: ${formatMoney(component.amountMinor, currency)}`);
}

function buildAvailabilityLimitations(
  limitations: readonly string[],
  ignoredCount: number,
): string[] {
  if (ignoredCount === 0) {
    return [...limitations];
  }

  return [
    ...limitations,
    `${ignoredCount} item(ns) foram ignorados conforme premissas do calculo.`,
  ];
}

function buildFallbackAnswer(input: {
  status?: FinancialAssistantStatus;
  intent: FinancialAssistantIntent;
  safeLogCode: string;
  answer: string;
  limitations: readonly string[];
}): FinancialAssistantAnswer {
  return {
    status: input.status ?? "needs_review",
    intent: input.intent,
    confidence: "low",
    answer: input.answer,
    assumptions: [],
    sources: [],
    limitations: input.limitations,
    safeLogCode: input.safeLogCode,
  };
}

function buildAssistantPrompt(
  intent: FinancialAssistantIntent,
  evidence: FinancialAssistantEvidence,
): string {
  const metrics = evidence.metrics
    .map((metric) => `- ${formatEvidenceMetric(metric, evidence.currency)}`)
    .join("\n");
  return [
    "Escreva no maximo duas frases qualitativas e sem qualquer numero, quantidade ou comparacao de magnitude.",
    "Nao acrescente fatos. Os valores canonicamente calculados serao anexados pelo SolverFin depois da sua narrativa.",
    "Nao ofereca conselho financeiro, juridico, fiscal, contabil, de investimento ou credito.",
    `Intencao classificada: ${intent}.`,
    `Periodo autorizado: ${evidence.period.startOn} a ${evidence.period.endOn}.`,
    `Moeda: ${evidence.currency}.`,
    `Filtros: ${evidence.filters.map((item) => maskSensitiveText(item)).join("; ") || "nenhum adicional"}.`,
    "Evidencias agregadas e minimizadas:",
    metrics,
  ].join("\n");
}

function sanitizeProviderNarrative(value: string): string | undefined {
  const text = value.trim();
  if (text.length === 0 || text.length > 420 || PROVIDER_QUANTITATIVE_CLAIM.test(text)) {
    return undefined;
  }
  return text;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function normalizeQuestion(question: string): string {
  return question
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatMoney(amountMinor: number, currency: string): string {
  return formatMinorCurrency(amountMinor, { currency });
}
