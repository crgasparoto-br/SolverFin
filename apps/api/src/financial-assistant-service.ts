import {
  answerFinancialQuestion,
  classifyFinancialAssistantIntent,
  createAiProviderFromEnvironment,
  defaultAiUsagePolicy,
  financialAssistantQuestionRequestsCategoryFilter,
  type AiConsentState,
  type AiProviderSelection,
  type FinancialAssistantAnswer,
  type FinancialAssistantIntent,
} from "@solverfin/ai";
import type { TenantContext } from "@solverfin/domain";

import {
  resolveFinancialAssistantData,
  type FinancialAssistantDataResolution,
} from "./financial-assistant-data.js";
import {
  bindFinancialAssistantTurnResolution,
  claimFinancialAssistantTurn,
  finalizeFinancialAssistantTurn,
  getConversationById,
  getFinancialAssistantConversationForContext,
  startFinancialAssistantConversation,
  type FinancialAssistantConversationView,
} from "./financial-assistant-repository.js";

export interface FinancialAssistantRuntime {
  selectProvider: () => AiProviderSelection;
  resolveConsent: () => AiConsentState | Promise<AiConsentState>;
  now?: () => Date;
  correlationId?: string;
}

export class FinancialAssistantServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 500) {
    super(message);
    this.name = "FinancialAssistantServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const ASSISTANT_PURPOSE = "financial_assistant_read_only";
const QUESTION_MAX_CHARS = 1000;
const IDEMPOTENCY_KEY_MAX_CHARS = 160;

export async function getOrStartFinancialAssistantConversation(
  context: TenantContext,
): Promise<FinancialAssistantConversationView> {
  return (
    (await getFinancialAssistantConversationForContext(context)) ??
    startFinancialAssistantConversation(context)
  );
}

export async function sendFinancialAssistantMessage(input: {
  context: TenantContext;
  conversationId: string;
  question: string;
  idempotencyKey: string;
  runtime: FinancialAssistantRuntime;
}): Promise<FinancialAssistantConversationView> {
  const now = input.runtime.now?.() ?? new Date();
  const question = normalizeAndValidateFinancialAssistantMessage(
    input.question,
    input.idempotencyKey,
  );

  const before = await getConversationById(input.context, input.conversationId);
  if (!before) {
    throw new FinancialAssistantServiceError(
      "ASSISTANT_CONVERSATION_NOT_FOUND",
      "Conversa nao encontrada no perfil financeiro ativo.",
      404,
    );
  }
  const effectiveQuestion = resolveClarificationPrecedence(before, question);
  const tentativeIntent = classifyFinancialAssistantIntent(effectiveQuestion);
  const claim = await claimFinancialAssistantTurn({
    context: input.context,
    conversationId: input.conversationId,
    normalizedQuestion: question,
    idempotencyKey: input.idempotencyKey,
    intent: tentativeIntent,
    filters: {},
    now,
  });
  if (claim.kind === "existing") {
    const existing = await getConversationById(input.context, input.conversationId, true);
    if (!existing) throw new Error("Idempotent financial assistant turn lost its conversation.");
    return existing;
  }

  try {
    const resolution = guardFinancialAssistantPeriodResolution(
      guardFinancialAssistantCategoryResolution(
        await resolveFinancialAssistantData(
          input.context,
          effectiveQuestion,
          input.runtime.now?.() ?? new Date(),
        ),
        effectiveQuestion,
      ),
      effectiveQuestion,
    );

    if (resolution.kind === "clarification") {
      await bindFinancialAssistantTurnResolution({
        context: input.context,
        conversationId: input.conversationId,
        turnId: claim.turn.id,
        conversationVersion: claim.turn.conversationVersion,
        intent: resolution.intent,
        filters: { ...resolution.filters },
        ...(resolution.filters.currency ? { currency: resolution.filters.currency } : {}),
        now,
      });
      const response = clarificationAnswer(resolution.intent, resolution.message);
      const finalNow = input.runtime.now?.() ?? new Date();
      await getFinancialAssistantConversationForContext(input.context, finalNow);
      return finalizeFinancialAssistantTurn({
        context: input.context,
        conversationId: input.conversationId,
        turnId: claim.turn.id,
        conversationVersion: claim.turn.conversationVersion,
        status: "AWAITING_CLARIFICATION",
        safeResponse: response,
        pendingIntent: resolution.intent,
        pendingQuestion: effectiveQuestion,
        pendingFilters: resolution.filters,
        now: finalNow,
      });
    }

    if (resolution.kind === "out_of_scope") {
      const response = outOfScopeAnswer(resolution.message);
      await bindFinancialAssistantTurnResolution({
        context: input.context,
        conversationId: input.conversationId,
        turnId: claim.turn.id,
        conversationVersion: claim.turn.conversationVersion,
        intent: "out_of_scope",
        filters: {},
        now,
      });
      const finalNow = input.runtime.now?.() ?? new Date();
      await getFinancialAssistantConversationForContext(input.context, finalNow);
      return finalizeFinancialAssistantTurn({
        context: input.context,
        conversationId: input.conversationId,
        turnId: claim.turn.id,
        conversationVersion: claim.turn.conversationVersion,
        status: "ANSWERED",
        safeResponse: response,
        now: finalNow,
      });
    }

    await bindFinancialAssistantTurnResolution({
      context: input.context,
      conversationId: input.conversationId,
      turnId: claim.turn.id,
      conversationVersion: claim.turn.conversationVersion,
      intent: resolution.intent,
      filters: { ...resolution.filters },
      currency: resolution.filters.currency,
      ...(resolution.evidence ? { evidence: resolution.evidence } : {}),
      now,
    });

    const resolveAuthoritativeConsent = async (): Promise<AiConsentState> => {
      const lifecycleNow = input.runtime.now?.() ?? new Date();
      const latest = await getFinancialAssistantConversationForContext(input.context, lifecycleNow);
      if (
        !latest ||
        latest.conversation.id !== input.conversationId ||
        latest.conversation.status !== "PROCESSING" ||
        latest.conversation.version !== claim.turn.conversationVersion
      ) {
        return "revoked";
      }
      return input.runtime.resolveConsent();
    };
    const selection = safeSelectProvider(input.runtime.selectProvider);
    let consent: AiConsentState = "missing";
    if (selection.status === "ready" && selection.provider) {
      try {
        consent = await resolveAuthoritativeConsent();
      } catch {
        consent = "missing";
      }
    }
    const answer = await answerFinancialQuestion({
      question: effectiveQuestion,
      context: {
        organizationId: input.context.organizationId,
        financialProfileId: input.context.financialProfileId,
        userId: input.context.userId,
        ...(input.runtime.correlationId ? { correlationId: input.runtime.correlationId } : {}),
      },
      policy: {
        ...defaultAiUsagePolicy,
        consent,
        purpose: ASSISTANT_PURPOSE,
        maxPromptChars: 6000,
        maxRetries: 1,
        timeoutMs: 8000,
        allowRawFinancialText: false,
        allowedFieldNames: ["intent"],
      },
      ...(selection.status === "ready" && selection.provider
        ? { provider: selection.provider, resolveConsent: resolveAuthoritativeConsent }
        : {}),
      ...(resolution.evidence ? { evidence: resolution.evidence } : {}),
      ...(resolution.availability ? { availability: resolution.availability } : {}),
    });

    const finalNow = input.runtime.now?.() ?? new Date();
    await getFinancialAssistantConversationForContext(input.context, finalNow);
    return finalizeFinancialAssistantTurn({
      context: input.context,
      conversationId: input.conversationId,
      turnId: claim.turn.id,
      conversationVersion: claim.turn.conversationVersion,
      status: "ANSWERED",
      ...(resolution.evidence ? { evidence: resolution.evidence } : {}),
      safeResponse: answer,
      now: finalNow,
    });
  } catch (error) {
    const safe = failureAnswer(tentativeIntent);
    try {
      const finalNow = input.runtime.now?.() ?? new Date();
      await getFinancialAssistantConversationForContext(input.context, finalNow);
      await finalizeFinancialAssistantTurn({
        context: input.context,
        conversationId: input.conversationId,
        turnId: claim.turn.id,
        conversationVersion: claim.turn.conversationVersion,
        status: "FAILED",
        safeResponse: safe,
        failureCode: publicFailureCode(error),
        now: finalNow,
      });
    } catch {
      // Cancellation/profile/expiry may have won the race. Never overwrite the newer terminal state.
    }
    throw error;
  }
}

export function guardFinancialAssistantCategoryResolution(
  resolution: FinancialAssistantDataResolution,
  question: string,
): FinancialAssistantDataResolution {
  if (
    resolution.kind !== "evidence" ||
    resolution.intent !== "category_spending" ||
    resolution.filters.categoryId ||
    !financialAssistantQuestionRequestsCategoryFilter(question)
  ) {
    return resolution;
  }

  return {
    kind: "clarification",
    intent: "category_spending",
    message:
      "Nao encontrei a categoria solicitada neste perfil. Informe uma categoria existente para eu aplicar o filtro sem misturar outros gastos.",
    filters: {
      currency: resolution.filters.currency,
      periodStartOn: resolution.filters.periodStartOn,
      periodEndOn: resolution.filters.periodEndOn,
    },
  };
}

export function guardFinancialAssistantPeriodResolution(
  resolution: FinancialAssistantDataResolution,
  question: string,
): FinancialAssistantDataResolution {
  if (
    resolution.kind !== "evidence" ||
    resolution.intent !== "subscriptions" ||
    questionProvidesPeriod(question)
  ) {
    return resolution;
  }

  return {
    kind: "clarification",
    intent: "subscriptions",
    message:
      "Informe o periodo que deseja analisar, por exemplo: hoje, este mes, mes passado ou 2026-08.",
    filters: { currency: resolution.filters.currency },
  };
}

export function normalizeAndValidateFinancialAssistantMessage(
  question: string,
  idempotencyKey: string,
): string {
  const normalized = normalizeStoredQuestion(question);
  validateMessage(normalized, idempotencyKey);
  return normalized;
}

function resolveClarificationPrecedence(
  view: FinancialAssistantConversationView,
  incomingQuestion: string,
): string {
  const pending = view.conversation.pendingQuestion?.trim();
  if (
    view.conversation.status !== "AWAITING_CLARIFICATION" ||
    !pending ||
    !isClarificationFragment(incomingQuestion)
  ) {
    return incomingQuestion;
  }
  return normalizeStoredQuestion(`${pending} ${incomingQuestion}`);
}

function isClarificationFragment(question: string): boolean {
  const normalized = normalizeForMatching(question);
  const periodFragments = [
    "hoje",
    "este mes",
    "mes atual",
    "mes passado",
    "ultimo mes",
    "ultimos 30 dias",
  ];
  if (
    /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(normalized) ||
    /^(?:em\s+)?(?:brl|usd|eur|gbp)$/.test(normalized) ||
    periodFragments.includes(normalized)
  ) {
    return true;
  }
  return classifyFinancialAssistantIntent(question) === "out_of_scope" && normalized.length <= 40;
}

function questionProvidesPeriod(question: string): boolean {
  const normalized = normalizeForMatching(question);
  return (
    /\b20\d{2}-(?:0[1-9]|1[0-2])\b/.test(normalized) ||
    /\bhoje\b/.test(normalized) ||
    /mes\s+passado|ultimo\s+mes/.test(normalized) ||
    /este\s+mes|mes\s+atual|do\s+mes/.test(normalized) ||
    /ultimos\s+30\s+dias/.test(normalized)
  );
}

function clarificationAnswer(
  intent: FinancialAssistantIntent,
  message: string,
): FinancialAssistantAnswer {
  return {
    status: "needs_review",
    intent,
    confidence: "low",
    answer: message,
    assumptions: [],
    sources: [],
    limitations: ["Falta contexto necessario para calcular a resposta com seguranca."],
    safeLogCode: "ASSISTANT_CLARIFICATION_REQUIRED",
  };
}

function outOfScopeAnswer(message: string): FinancialAssistantAnswer {
  return {
    status: "needs_review",
    intent: "out_of_scope",
    confidence: "low",
    answer: message,
    assumptions: [],
    sources: [],
    limitations: ["O assistente e somente leitura e nao substitui orientacao profissional."],
    safeLogCode: "ASSISTANT_OUT_OF_SCOPE",
  };
}

function failureAnswer(intent: FinancialAssistantIntent): FinancialAssistantAnswer {
  return {
    status: "needs_review",
    intent,
    confidence: "low",
    answer:
      "Nao consegui concluir esta consulta. A conversa foi preservada e nenhum dado financeiro foi alterado.",
    assumptions: [],
    sources: [],
    limitations: ["Falha controlada durante a consulta somente leitura."],
    safeLogCode: "ASSISTANT_QUERY_FAILED",
  };
}

function safeSelectProvider(selectProvider: () => AiProviderSelection): AiProviderSelection {
  try {
    return selectProvider();
  } catch {
    return createAiProviderFromEnvironment({ AI_PROVIDER: "disabled" });
  }
}

function validateMessage(question: string, idempotencyKey: string): void {
  if (question.length === 0) {
    throw new FinancialAssistantServiceError(
      "ASSISTANT_QUESTION_REQUIRED",
      "Escreva uma pergunta financeira para continuar.",
      400,
    );
  }
  if (question.length > QUESTION_MAX_CHARS) {
    throw new FinancialAssistantServiceError(
      "ASSISTANT_QUESTION_TOO_LONG",
      `A pergunta deve ter no maximo ${QUESTION_MAX_CHARS} caracteres.`,
      400,
    );
  }
  const key = idempotencyKey.trim();
  if (key.length < 8 || key.length > IDEMPOTENCY_KEY_MAX_CHARS) {
    throw new FinancialAssistantServiceError(
      "ASSISTANT_IDEMPOTENCY_KEY_INVALID",
      "Identificador da mensagem invalido.",
      400,
    );
  }
}

function normalizeStoredQuestion(question: string): string {
  return question.trim().replace(/\s+/g, " ");
}

function normalizeForMatching(question: string): string {
  return question
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function publicFailureCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 120);
  }
  return "ASSISTANT_QUERY_FAILED";
}
