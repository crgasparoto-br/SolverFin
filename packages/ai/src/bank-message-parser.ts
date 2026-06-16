import {
  type AiProvider,
  type AiUsageContext,
  type AiUsagePolicy,
  maskSensitiveText,
  runAiTask,
  type SafeAiLogger,
} from "./index.js";
import {
  type TransactionExtractionSuggestion,
  type TransactionExtractionValidationProblem,
  validateTransactionExtraction,
} from "./extraction.js";

export type BankMessageParserStatus = "suggested" | "needs_review";
export type BankMessageParserSourceKind = "rule" | "ai" | "none";

export interface BankMessageParserInput {
  text: string;
  provider?: AiProvider;
  context?: AiUsageContext;
  policy?: AiUsagePolicy;
  logger?: SafeAiLogger;
  minConfidenceForSuggestion?: number;
}

export interface BankMessageParsedSuggestion extends TransactionExtractionSuggestion {
  explanation: string;
  sourceKind: Exclude<BankMessageParserSourceKind, "none">;
  ruleId?: string;
  providerId?: string;
  model?: string;
  maskedText: string;
}

export interface BankMessageParserResult {
  status: BankMessageParserStatus;
  sourceKind: BankMessageParserSourceKind;
  normalizedText: string;
  maskedText: string;
  suggestion?: BankMessageParsedSuggestion;
  reviewReasons: readonly string[];
  problems: readonly TransactionExtractionValidationProblem[];
  code?:
    | "BANK_MESSAGE_TEXT_EMPTY"
    | "BANK_MESSAGE_RULE_NEEDS_REVIEW"
    | "BANK_MESSAGE_AI_NOT_CONFIGURED"
    | "BANK_MESSAGE_AI_BLOCKED"
    | "BANK_MESSAGE_AI_FAILED"
    | "BANK_MESSAGE_AI_INVALID_OUTPUT";
}

interface RuleMatch {
  id: string;
  output: Readonly<Record<string, unknown>>;
  explanation: string;
}

const DEFAULT_MIN_CONFIDENCE = 0.7;

export async function parseBankMessage(
  input: BankMessageParserInput,
): Promise<BankMessageParserResult> {
  const normalizedText = normalizeBankMessageText(input.text);
  const maskedText = maskSensitiveText(normalizedText);

  if (normalizedText.length === 0) {
    return {
      status: "needs_review",
      sourceKind: "none",
      normalizedText,
      maskedText,
      reviewReasons: ["Mensagem bancaria vazia."],
      problems: [],
      code: "BANK_MESSAGE_TEXT_EMPTY",
    };
  }

  const ruleMatch = matchBankMessageRule(normalizedText);

  if (ruleMatch !== undefined) {
    return buildRuleResult(ruleMatch, normalizedText, maskedText, input.minConfidenceForSuggestion);
  }

  if (!input.provider || !input.context || !input.policy) {
    return {
      status: "needs_review",
      sourceKind: "none",
      normalizedText,
      maskedText,
      reviewReasons: ["Nenhuma regra simples reconheceu a mensagem e a IA nao esta configurada."],
      problems: [],
      code: "BANK_MESSAGE_AI_NOT_CONFIGURED",
    };
  }

  const aiResult = await runAiTask({
    provider: input.provider,
    task: "extraction",
    context: input.context,
    policy: input.policy,
    payload: {
      prompt: buildExtractionPrompt(normalizedText),
      fields: {
        message: normalizedText,
      },
    },
    logger: input.logger,
  });

  if (aiResult.status === "blocked") {
    return {
      status: "needs_review",
      sourceKind: "ai",
      normalizedText,
      maskedText,
      reviewReasons: [`IA bloqueada por politica: ${aiResult.code}.`],
      problems: [],
      code: "BANK_MESSAGE_AI_BLOCKED",
    };
  }

  if (aiResult.status === "failed") {
    return {
      status: "needs_review",
      sourceKind: "ai",
      normalizedText,
      maskedText,
      reviewReasons: [`IA indisponivel ou resposta invalida: ${aiResult.code}.`],
      problems: [],
      code: "BANK_MESSAGE_AI_FAILED",
    };
  }

  const structured = aiResult.result.structured ?? parseStructuredJson(aiResult.result.text);
  const validation = validateTransactionExtraction(structured, {
    minConfidenceForSuggestion: input.minConfidenceForSuggestion ?? DEFAULT_MIN_CONFIDENCE,
  });

  if (!validation.suggestion) {
    return {
      status: "needs_review",
      sourceKind: "ai",
      normalizedText,
      maskedText,
      reviewReasons: ["Resposta da IA nao seguiu o schema de extracao."],
      problems: validation.problems,
      code: "BANK_MESSAGE_AI_INVALID_OUTPUT",
    };
  }

  return {
    status: validation.status === "valid" ? "suggested" : "needs_review",
    sourceKind: "ai",
    normalizedText,
    maskedText,
    suggestion: {
      ...validation.suggestion,
      explanation: validation.suggestion.reasons.join(" "),
      sourceKind: "ai",
      providerId: aiResult.providerId,
      model: aiResult.model,
      maskedText,
    },
    reviewReasons: validation.problems.map((problem) => problem.message),
    problems: validation.problems,
    code: validation.status === "valid" ? undefined : "BANK_MESSAGE_AI_INVALID_OUTPUT",
  };
}

export function normalizeBankMessageText(text: string): string {
  return text
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

function buildRuleResult(
  ruleMatch: RuleMatch,
  normalizedText: string,
  maskedText: string,
  minConfidenceForSuggestion = DEFAULT_MIN_CONFIDENCE,
): BankMessageParserResult {
  const validation = validateTransactionExtraction(ruleMatch.output, { minConfidenceForSuggestion });

  if (!validation.suggestion) {
    return {
      status: "needs_review",
      sourceKind: "rule",
      normalizedText,
      maskedText,
      reviewReasons: validation.problems.map((problem) => problem.message),
      problems: validation.problems,
      code: "BANK_MESSAGE_RULE_NEEDS_REVIEW",
    };
  }

  return {
    status: validation.status === "valid" ? "suggested" : "needs_review",
    sourceKind: "rule",
    normalizedText,
    maskedText,
    suggestion: {
      ...validation.suggestion,
      explanation: ruleMatch.explanation,
      sourceKind: "rule",
      ruleId: ruleMatch.id,
      maskedText,
    },
    reviewReasons: validation.problems.map((problem) => problem.message),
    problems: validation.problems,
    code: validation.status === "valid" ? undefined : "BANK_MESSAGE_RULE_NEEDS_REVIEW",
  };
}

function matchBankMessageRule(text: string): RuleMatch | undefined {
  return matchCardPurchase(text) ?? matchPixReceived(text) ?? matchPixSent(text);
}

function matchCardPurchase(text: string): RuleMatch | undefined {
  if (!/\b(compra|cartao|cart[aã]o)\b/i.test(text)) {
    return undefined;
  }

  const amount = extractCurrencyAmount(text);

  if (!amount) {
    return undefined;
  }

  const merchant = extractMerchant(text, /\bem\s+(.+?)\s+(?:no\s+valor\s+de\s+)?r\$/i);
  const cardHint = /(?:cartao|cart[aã]o)(?:\s+final)?\s*(\d{4})/i.exec(text)?.[1];

  return {
    id: "card_purchase_v1",
    output: compactExtraction({
      amount,
      currency: "BRL",
      occurredOn: extractDate(text),
      type: "expense",
      merchant,
      cardHint: cardHint ? `final ${cardHint}` : undefined,
      confidence: 0.82,
      source: "bank_message",
      reasons: ["Regra identificou compra no cartao com valor em reais."],
    }),
    explanation: "Regra identificou compra no cartao com valor em reais.",
  };
}

function matchPixReceived(text: string): RuleMatch | undefined {
  if (!/\bpix\s+recebido\b/i.test(text)) {
    return undefined;
  }

  const amount = extractCurrencyAmount(text);

  if (!amount) {
    return undefined;
  }

  const merchant = extractMerchant(text, /\bpix\s+recebido\s+de\s+(.+?)(?:\s+em\s+|\s+no\s+valor|\s+valor|$)/i);

  return {
    id: "pix_received_v1",
    output: compactExtraction({
      amount,
      currency: "BRL",
      occurredOn: extractDate(text),
      type: "income",
      merchant,
      confidence: 0.84,
      source: "bank_message",
      reasons: ["Regra identificou pix recebido com valor em reais."],
    }),
    explanation: "Regra identificou pix recebido com valor em reais.",
  };
}

function matchPixSent(text: string): RuleMatch | undefined {
  if (!/\b(pix\s+enviado|transferencia\s+enviada|transferencia\s+realizada)\b/i.test(text)) {
    return undefined;
  }

  const amount = extractCurrencyAmount(text);

  if (!amount) {
    return undefined;
  }

  const merchant = extractMerchant(
    text,
    /\b(?:pix\s+enviado|transferencia\s+(?:enviada|realizada))\s+para\s+(.+?)(?:\s+em\s+|\s+no\s+valor|\s+valor|$)/i,
  );

  return {
    id: "pix_sent_v1",
    output: compactExtraction({
      amount,
      currency: "BRL",
      occurredOn: extractDate(text),
      type: "expense",
      merchant,
      confidence: 0.8,
      source: "bank_message",
      reasons: ["Regra identificou pix ou transferencia enviada com valor em reais."],
    }),
    explanation: "Regra identificou pix ou transferencia enviada com valor em reais.",
  };
}

function extractCurrencyAmount(text: string): string | undefined {
  return /r\$\s*([0-9.]+,[0-9]{2})/i.exec(text)?.[1];
}

function extractDate(text: string): string | undefined {
  return /(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/.exec(text)?.[1];
}

function extractMerchant(text: string, pattern: RegExp): string | undefined {
  const value = pattern.exec(text)?.[1]?.trim();
  return value && value.length > 0 ? value.replace(/[.,;:]$/g, "") : undefined;
}

function compactExtraction(
  value: Readonly<Record<string, string | number | readonly string[] | undefined>>,
): Readonly<Record<string, string | number | readonly string[]>> {
  const output: Record<string, string | number | readonly string[]> = {};

  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) {
      output[key] = item;
    }
  }

  return output;
}

function parseStructuredJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function buildExtractionPrompt(text: string): string {
  return [
    "Extraia uma sugestao de lancamento financeiro seguindo estritamente o schema configurado.",
    "Responda com JSON estruturado e sem texto adicional.",
    `Mensagem bancaria: ${text}`,
  ].join("\n");
}
