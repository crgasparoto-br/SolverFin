import {
  type AiConsentState,
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
  resolveConsent?: () => AiConsentState | Promise<AiConsentState>;
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
const SAFE_AI_EXTRACTION_REASON = "Sugestao estruturada produzida pelo provider para revisao.";
const PROVIDER_EXTRACTION_PROMPT = [
  "Extraia uma sugestao de lancamento financeiro seguindo estritamente o schema configurado.",
  "Responda com JSON estruturado e sem texto adicional.",
  "O campo message foi minimizado: use apenas os sinais financeiros presentes e nao tente reconstruir trechos redigidos.",
].join("\n");

const PROVIDER_SAFE_WORDS = new Set([
  "agencia",
  "aprovada",
  "aprovado",
  "banco",
  "boleto",
  "cartao",
  "chave",
  "compra",
  "conta",
  "credito",
  "da",
  "data",
  "de",
  "debito",
  "deposito",
  "despesa",
  "dia",
  "doc",
  "do",
  "em",
  "entrada",
  "enviada",
  "enviado",
  "estorno",
  "fatura",
  "final",
  "hora",
  "moeda",
  "na",
  "no",
  "pagamento",
  "para",
  "pix",
  "por",
  "realizada",
  "realizado",
  "recebida",
  "recebido",
  "receita",
  "r",
  "saldo",
  "saida",
  "saque",
  "ted",
  "transferencia",
  "valor",
  "via",
]);

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
  let partialRuleResult: BankMessageParserResult | undefined;

  if (ruleMatch !== undefined) {
    const ruleResult = buildRuleResult(
      ruleMatch,
      normalizedText,
      maskedText,
      input.minConfidenceForSuggestion,
    );

    if (ruleResult.suggestion !== undefined) {
      return ruleResult;
    }

    partialRuleResult = ruleResult;
  }

  if (!input.provider || !input.context || !input.policy) {
    if (partialRuleResult !== undefined) {
      return partialRuleResult;
    }

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

  if (!input.resolveConsent) {
    return {
      status: "needs_review",
      sourceKind: "ai",
      normalizedText,
      maskedText,
      reviewReasons: [
        "IA bloqueada porque o consentimento atual nao pode ser revalidado imediatamente antes da tentativa.",
      ],
      problems: [],
      code: "BANK_MESSAGE_AI_BLOCKED",
    };
  }

  const minimizedMessage = minimizeBankMessageForProvider(normalizedText);
  const aiTaskInput: Parameters<typeof runAiTask>[0] = {
    provider: input.provider,
    task: "extraction",
    context: input.context,
    policy: input.policy,
    payload: {
      prompt: PROVIDER_EXTRACTION_PROMPT,
      fields: {
        message: minimizedMessage,
      },
    },
    resolveConsent: input.resolveConsent,
  };

  if (input.logger !== undefined) {
    aiTaskInput.logger = input.logger;
  }

  const aiResult = await runAiTask(aiTaskInput);

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
    if (aiResult.code === "AI_PROVIDER_INVALID_RESPONSE") {
      const validation = validateTransactionExtraction(undefined, {
        minConfidenceForSuggestion: input.minConfidenceForSuggestion ?? DEFAULT_MIN_CONFIDENCE,
      });

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

  const result: BankMessageParserResult = {
    status: validation.status === "valid" ? "suggested" : "needs_review",
    sourceKind: "ai",
    normalizedText,
    maskedText,
    suggestion: {
      ...validation.suggestion,
      reasons: [SAFE_AI_EXTRACTION_REASON],
      explanation: SAFE_AI_EXTRACTION_REASON,
      sourceKind: "ai",
      providerId: aiResult.providerId,
      model: aiResult.model,
      maskedText,
    },
    reviewReasons: validation.problems.map((problem) => problem.message),
    problems: validation.problems,
  };

  if (validation.status !== "valid") {
    result.code = "BANK_MESSAGE_AI_INVALID_OUTPUT";
  }

  return result;
}

export function normalizeBankMessageText(text: string): string {
  return text
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

export function minimizeBankMessageForProvider(text: string): string {
  const masked = maskSensitiveText(normalizeBankMessageText(text))
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/https?:\/\/\S+/gi, "[link]");
  const tokens =
    masked.match(
      /R\$\s*[0-9.*]+,[0-9]{2}|\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\[[a-z]+\]|\*+[0-9]{0,4}|[A-Za-zÀ-ÿ]+|\d+[.,]?\d*|[^\s]/g,
    ) ?? [];
  const output: string[] = [];

  for (const token of tokens) {
    const normalized = normalizeKeyword(token);
    const safeToken =
      isFinancialValueToken(token) ||
      token.startsWith("[") ||
      PROVIDER_SAFE_WORDS.has(normalized)
        ? token
        : "[texto]";

    if (safeToken === "[texto]" && output.at(-1) === "[texto]") {
      continue;
    }
    output.push(safeToken);
  }

  return output.join(" ").replace(/\s+([,.;:])/g, "$1").trim() || "[texto]";
}

function normalizeKeyword(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isFinancialValueToken(value: string): boolean {
  return (
    /^R\$\s*[0-9.*]+,[0-9]{2}$/i.test(value) ||
    /^\d{4}-\d{2}-\d{2}$/.test(value) ||
    /^\d{2}\/\d{2}\/\d{4}$/.test(value) ||
    /^\*+[0-9]{0,4}$/.test(value)
  );
}

function buildRuleResult(
  ruleMatch: RuleMatch,
  normalizedText: string,
  maskedText: string,
  minConfidenceForSuggestion = DEFAULT_MIN_CONFIDENCE,
): BankMessageParserResult {
  const validation = validateTransactionExtraction(ruleMatch.output, {
    minConfidenceForSuggestion,
  });

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

  const result: BankMessageParserResult = {
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
  };

  if (validation.status !== "valid") {
    result.code = "BANK_MESSAGE_RULE_NEEDS_REVIEW";
  }

  return result;
}

function matchBankMessageRule(text: string): RuleMatch | undefined {
  return matchCardPurchase(text) ?? matchPixReceived(text) ?? matchPixSent(text);
}

function matchCardPurchase(text: string): RuleMatch | undefined {
  if (!/\b(compra|cartao|cart[aã]o)\b/i.test(text)) return undefined;
  const amount = extractCurrencyAmount(text);
  if (!amount) return undefined;

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
  if (!/\bpix\s+recebido\b/i.test(text)) return undefined;
  const amount = extractCurrencyAmount(text);
  if (!amount) return undefined;

  const merchant = extractMerchant(
    text,
    /\bpix\s+recebido\s+de\s+(.+?)(?:\s+em\s+|\s+no\s+valor|\s+valor|$)/i,
  );

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
  if (!amount) return undefined;

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
    if (item !== undefined) output[key] = item;
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
