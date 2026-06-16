import {
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
  | "inferred"
  | "reserve"
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
  currency: string;
  horizonStartOn: string;
  horizonEndOn: string;
  confidence: FinancialAssistantConfidence;
  components: readonly AvailabilityComponent[];
  assumptions: readonly string[];
  limitations: readonly string[];
  calculatedAt: string;
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
  logger?: SafeAiLogger;
  availability?: AvailabilityCalculationResult;
}

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
        "Posso ajudar apenas com perguntas financeiras do SolverFin, usando dados autorizados e premissas visiveis.",
      limitations: ["Pergunta fora do escopo financeiro do app."],
    });
  }

  if (!input.provider) {
    return buildFallbackAnswer({
      intent,
      safeLogCode: "ASSISTANT_PROVIDER_NOT_CONFIGURED",
      answer:
        "Ainda nao ha um provedor de IA configurado para responder esta pergunta com seguranca.",
      limitations: ["Provider de IA indisponivel."],
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
      prompt: buildAssistantPrompt(question, intent),
      fields: {
        question: maskSensitiveText(question),
        intent,
      },
    },
    ...(input.logger ? { logger: input.logger } : {}),
  });

  if (aiResult.status !== "completed") {
    return buildFallbackAnswer({
      intent,
      safeLogCode: `ASSISTANT_${aiResult.code}`,
      answer:
        "Nao consegui gerar uma resposta confiavel agora. Revise os dados do periodo ou tente novamente mais tarde.",
      limitations: ["Provider indisponivel, bloqueado ou retornou resposta invalida."],
    });
  }

  return {
    status: "answered",
    intent,
    confidence: "medium",
    answer: aiResult.result.text.trim(),
    assumptions: ["Resposta gerada por IA com payload minimizado."],
    sources: ["provider", aiResult.providerId, aiResult.model],
    limitations: [
      "A resposta deve ser revisada quando os dados financeiros estiverem incompletos.",
    ],
    safeLogCode: "ASSISTANT_PROVIDER_ANSWERED",
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

  if (/categoria|gastei|despesa|gasto/.test(normalized)) {
    return "category_spending";
  }

  if (/saldo|projecao|projetado/.test(normalized)) {
    return "balance_projection";
  }

  if (/assinatura|recorrente|recorrencia/.test(normalized)) {
    return "subscriptions";
  }

  if (/resumo|mes|mensal/.test(normalized)) {
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
        "Ainda nao tenho um calculo estruturado de disponibilidade para hoje. Sem esse servico, nao vou estimar um valor livremente.",
      limitations: ["Servico de disponibilidade financeira indisponivel."],
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
      `Voce pode gastar hoje ${availableText} com base no calculo estruturado de disponibilidade.`,
      componentsText,
      assumptionsText,
      limitationsText,
    ].join(" "),
    period: {
      startOn: availability.horizonStartOn,
      endOn: availability.horizonEndOn,
    },
    assumptions: availability.assumptions,
    sources: availability.components.map((component) => component.source),
    limitations,
    safeLogCode: "ASSISTANT_AVAILABILITY_ANSWERED",
  };
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

function buildAssistantPrompt(question: string, intent: FinancialAssistantIntent): string {
  return [
    "Responda somente com base nos dados financeiros autorizados recebidos.",
    "Se faltar dado, explique a limitacao em vez de inventar valores.",
    "Nao ofereca conselho financeiro, juridico ou fiscal profissional.",
    `Intencao classificada: ${intent}.`,
    `Pergunta: ${question}`,
  ].join("\n");
}

function normalizeQuestion(question: string): string {
  return question
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}
