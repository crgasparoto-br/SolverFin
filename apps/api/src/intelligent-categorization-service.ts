import { createHash, randomUUID } from "node:crypto";

import {
  createAiProviderFromEnvironment,
  defaultAiUsagePolicy,
  runAiTask,
  validateAiClassificationResult,
  type AiConsentState,
  type AiProvider,
  type AiUsagePolicy,
} from "@solverfin/ai";
import {
  applyAutomationRules,
  buildCategoryLearningKey,
  matchesAutomationRule,
  suggestCategory,
  type AutomationRule,
  type AutomationRuleTarget,
  type Category,
  type CategoryLearningEntry,
  type CategorySuggestionResult,
  type TenantContext,
  type Transaction,
} from "@solverfin/domain";
import {
  buildAiSuggestionPayload,
  readAiSuggestionPayload,
  type AiSuggestionPayloadOrigin,
  type CategorizationSuggestionPayloadV1,
  type TransactionExtractionSuggestionPayload,
} from "@solverfin/domain/ai-suggestion-payloads";

import { query, withTransaction, type QueryExecutor } from "./db.js";
import { resolveAiProcessingConsentForContext } from "./repositories/ai-consent.js";
import { listAutomationRulesForContext } from "./repositories/automation-rules.js";
import { listCategoryLearningForContext } from "./repositories/category-learning.js";

export type CategorizationProviderSelection =
  | { status: "disabled"; provider: undefined }
  | { status: "ready"; provider: AiProvider };

export interface IntelligentCategorizationRuntime {
  selectProvider: () => CategorizationProviderSelection;
  resolveConsent: (context: TenantContext) => AiConsentState | Promise<AiConsentState>;
  policy?: AiUsagePolicy;
  now?: () => string;
  correlationId?: string;
}

export interface IntelligentCategorizationResult {
  scanned: number;
  created: number;
  byOrigin: {
    rule: number;
    learning: number;
    history: number;
    ai: number;
    review: number;
  };
  skippedAlreadyCategorized: number;
  skippedIdempotent: number;
  skippedUnsupported: number;
}

interface SourceSuggestionRow {
  id: string;
  sourceEntityId: string | null;
  payload: unknown;
  provider: string | null;
  model: string | null;
  createdAt: Date;
}

interface CategoryRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  name: string;
  kind: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TransactionRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  kind: string;
  status: string;
  source: string;
  amountMinor: number;
  currency: string;
  occurredOn: Date | string;
  plannedOn: Date | string;
  description: string;
  categoryId: string | null;
  accountId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CategorizationDecision {
  provider: string;
  origin: AiSuggestionPayloadOrigin;
  confidence: number;
  reasons: readonly string[];
  proposedCategoryId?: string;
  proposedAccountId?: string;
  proposedCardId?: string;
  proposedStatus?: CategorizationSuggestionPayloadV1["proposedStatus"];
  resultOrigin: keyof IntelligentCategorizationResult["byOrigin"];
}

interface ProviderCategoryCandidates {
  prompt: string;
  tokenToCategoryId: ReadonlyMap<string, string>;
}

const ENGINE_VERSION = "intelligent-categorization-v1";
const CLASSIFICATION_PURPOSE = "transaction_categorization";
const PROVIDER_PROMPT_LIMIT = 5_500;
const FINGERPRINT_RULE_EVALUATED_AT = "1970-01-01T00:00:00.000Z";

export async function applyIntelligentCategorizationForContext(
  context: TenantContext,
  runtime: Partial<IntelligentCategorizationRuntime> = {},
): Promise<IntelligentCategorizationResult> {
  const [sources, rules, learningEntries, categories, history] = await Promise.all([
    listPendingExtractionSuggestions(context),
    listAutomationRulesForContext(context, "active"),
    listCategoryLearningForContext(context, "active"),
    listCategories(context),
    listHistory(context),
  ]);
  const result: IntelligentCategorizationResult = {
    scanned: sources.length,
    created: 0,
    byOrigin: { rule: 0, learning: 0, history: 0, ai: 0, review: 0 },
    skippedAlreadyCategorized: 0,
    skippedIdempotent: 0,
    skippedUnsupported: 0,
  };

  for (const source of sources) {
    const payload = readTransactionExtractionPayload(source.payload);
    if (payload === undefined) {
      result.skippedUnsupported += 1;
      continue;
    }

    if (payload.categoryId !== undefined) {
      result.skippedAlreadyCategorized += 1;
      continue;
    }

    const versionFingerprint = buildDecisionVersionFingerprint(
      context,
      source.id,
      payload,
      rules,
      learningEntries,
      categories,
      history,
    );
    const executionKey = buildExecutionKey(payload.fingerprint, versionFingerprint);
    const alreadyExists = await hasCategorizationExecution(context, source.id, executionKey);
    if (alreadyExists) {
      result.skippedIdempotent += 1;
      continue;
    }

    const decision = await resolveDecision({
      context,
      sourceId: source.id,
      payload,
      rules,
      learningEntries,
      categories,
      history,
      runtime,
    });
    const now = runtime.now?.() ?? new Date().toISOString();
    const created = await persistDecision(context, source, payload, decision, executionKey, now);

    if (created) {
      result.created += 1;
      result.byOrigin[decision.resultOrigin] += 1;
    } else {
      result.skippedIdempotent += 1;
    }
  }

  return result;
}

async function resolveDecision(input: {
  context: TenantContext;
  sourceId: string;
  payload: TransactionExtractionSuggestionPayload;
  rules: readonly AutomationRule[];
  learningEntries: readonly CategoryLearningEntry[];
  categories: readonly Category[];
  history: readonly Transaction[];
  runtime: Partial<IntelligentCategorizationRuntime>;
}): Promise<CategorizationDecision> {
  const ruleTarget = buildAutomationRuleTarget(input.context, input.sourceId, input.payload);
  const ruleResult = applyAutomationRules({
    context: input.context,
    target: ruleTarget,
    rules: input.rules,
    now: new Date().toISOString(),
  });
  const categoryRule = ruleResult.appliedRules.find((rule) =>
    rule.appliedFields.includes("categoryId"),
  );

  if (categoryRule !== undefined) {
    const category = input.categories.find(
      (candidate) =>
        candidate.id === ruleResult.target.categoryId &&
        candidate.organizationId === input.context.organizationId &&
        candidate.financialProfileId === input.context.financialProfileId &&
        candidate.status === "active" &&
        candidate.kind === input.payload.kind,
    );

    if (category === undefined) {
      return mergeRuleEnrichment(
        reviewDecision(
          "Uma regra explicita aponta para uma categoria indisponivel neste perfil. Escolha outra categoria.",
        ),
        ruleResult,
      );
    }

    const reasons = ruleResult.appliedRules.map(
      (rule) => `Regra explicita: ${safeReason(rule.reason)}`,
    );
    const proposedStatus = normalizeProposedStatus(ruleResult.target.status);
    return {
      provider: "solverfin-automation",
      origin: { kind: "automation", ruleId: categoryRule.ruleId },
      confidence: 0.95,
      reasons,
      proposedCategoryId: category.id,
      ...(ruleResult.target.accountId === undefined
        ? {}
        : { proposedAccountId: ruleResult.target.accountId }),
      ...(ruleResult.target.cardId === undefined
        ? {}
        : { proposedCardId: ruleResult.target.cardId }),
      ...(proposedStatus === undefined ? {} : { proposedStatus }),
      resultOrigin: "rule",
    };
  }

  const target = {
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    transactionKind: input.payload.kind,
    description: input.payload.description,
    amountMinor: input.payload.amountMinor,
  };
  const localSuggestion = suggestCategory({
    context: input.context,
    target,
    categories: input.categories,
    learningEntries: input.learningEntries,
    history: input.history,
  });

  if (localSuggestion.source === "learning" || localSuggestion.source === "history") {
    return mergeRuleEnrichment(buildLocalDecision(localSuggestion), ruleResult);
  }

  const aiDecision = await requestAiDecision(
    input.context,
    input.payload,
    input.categories,
    input.runtime,
  );
  return mergeRuleEnrichment(aiDecision, ruleResult);
}

function mergeRuleEnrichment(
  decision: CategorizationDecision,
  ruleResult: {
    target: AutomationRuleTarget;
    appliedRules: readonly { reason: string; appliedFields: readonly string[] }[];
  },
): CategorizationDecision {
  if (ruleResult.appliedRules.length === 0) return decision;

  const appliedFields = new Set(ruleResult.appliedRules.flatMap((rule) => rule.appliedFields));
  const enriched: CategorizationDecision = {
    ...decision,
    reasons: [
      ...ruleResult.appliedRules.map((rule) => `Regra explicita: ${safeReason(rule.reason)}`),
      ...decision.reasons,
    ],
  };

  if (appliedFields.has("accountId") && ruleResult.target.accountId !== undefined) {
    enriched.proposedAccountId = ruleResult.target.accountId;
  }
  if (appliedFields.has("cardId") && ruleResult.target.cardId !== undefined) {
    enriched.proposedCardId = ruleResult.target.cardId;
  }
  if (appliedFields.has("status")) {
    const status = normalizeProposedStatus(ruleResult.target.status);
    if (status !== undefined) enriched.proposedStatus = status;
  }

  return enriched;
}

function buildLocalDecision(suggestion: CategorySuggestionResult): CategorizationDecision {
  const isLearning = suggestion.source === "learning";
  const reasonPrefix = isLearning ? "Correcao anterior" : "Historico do perfil";
  return {
    provider: isLearning ? "solverfin-learning" : "solverfin-history",
    origin: {
      kind: "system",
      component: isLearning ? "category-learning" : "category-history",
    },
    confidence: suggestion.confidence,
    reasons: [`${reasonPrefix}: ${safeReason(suggestion.reason)}`],
    ...(suggestion.categoryId === undefined
      ? { proposedStatus: "pending_review" as const }
      : { proposedCategoryId: suggestion.categoryId }),
    resultOrigin:
      suggestion.status === "needs_review" ? "review" : isLearning ? "learning" : "history",
  };
}

async function requestAiDecision(
  context: TenantContext,
  payload: TransactionExtractionSuggestionPayload,
  categories: readonly Category[],
  runtime: Partial<IntelligentCategorizationRuntime>,
): Promise<CategorizationDecision> {
  const resolveConsent = runtime.resolveConsent ?? resolveAiProcessingConsentForContext;
  const consent = await resolveConsent(context);
  let selection: CategorizationProviderSelection;

  try {
    selection = runtime.selectProvider?.() ?? createAiProviderFromEnvironment(process.env);
  } catch {
    return reviewDecision(
      "A IA nao esta disponivel por configuracao. Escolha a categoria manualmente.",
    );
  }

  if (selection.status === "disabled" || selection.provider === undefined) {
    return reviewDecision("A IA esta desativada. Escolha a categoria manualmente.");
  }

  const providerCandidates = buildProviderCategoryCandidates(categories, payload.kind);
  if (providerCandidates.tokenToCategoryId.size === 0) {
    return reviewDecision("Nao ha categoria ativa compativel com este tipo de lancamento.");
  }

  const policy: AiUsagePolicy = runtime.policy ?? {
    ...defaultAiUsagePolicy,
    consent,
    purpose: CLASSIFICATION_PURPOSE,
    maxPromptChars: 6_000,
    maxRetries: 1,
    timeoutMs: 8_000,
    allowRawFinancialText: false,
    allowedFieldNames: ["amountMinor", "currency", "occurredOn", "description", "transactionType"],
  };
  const aiResult = await runAiTask({
    provider: selection.provider,
    task: "classification",
    context: {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      userId: context.userId,
      ...(runtime.correlationId === undefined ? {} : { correlationId: runtime.correlationId }),
    },
    policy,
    payload: {
      prompt: providerCandidates.prompt,
      fields: {
        amountMinor: payload.amountMinor,
        currency: payload.currency,
        occurredOn: payload.occurredOn,
        description: payload.description,
        transactionType: payload.kind,
      },
    },
    resolveConsent: () => resolveConsent(context),
    validateStructuredResult: (value) =>
      validateAiClassificationResult(value) &&
      typeof value.proposedCategoryId === "string" &&
      providerCandidates.tokenToCategoryId.has(value.proposedCategoryId),
  });

  if (aiResult.status !== "completed") {
    return reviewDecision(
      aiResult.status === "blocked"
        ? "A IA nao esta autorizada para este perfil. Escolha a categoria manualmente."
        : "A IA nao conseguiu classificar este lancamento. Escolha a categoria manualmente.",
    );
  }

  const structured = aiResult.result.structured;
  if (!validateAiClassificationResult(structured) || structured.proposedCategoryId === undefined) {
    return reviewDecision(
      "A IA nao retornou uma categoria valida. Escolha a categoria manualmente.",
    );
  }
  const proposedCategoryId = providerCandidates.tokenToCategoryId.get(
    structured.proposedCategoryId,
  );
  if (proposedCategoryId === undefined) {
    return reviewDecision(
      "A IA nao retornou uma categoria disponivel. Escolha a categoria manualmente.",
    );
  }

  const confidence = aiResult.result.confidence ?? 0.5;
  const categorySuggestion = suggestCategory({
    context,
    target: {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      transactionKind: payload.kind,
      description: payload.description,
      amountMinor: payload.amountMinor,
    },
    categories,
    aiSuggestion: {
      categoryId: proposedCategoryId,
      confidence,
      reason: "IA sugeriu uma categoria a partir de dados minimizados do lancamento.",
      provider: aiResult.providerId,
      model: aiResult.model,
    },
  });

  return {
    provider: aiResult.providerId,
    origin: {
      kind: "provider",
      provider: aiResult.providerId,
      model: aiResult.model,
    },
    confidence: categorySuggestion.confidence,
    reasons: [`IA: ${safeReason(categorySuggestion.reason)}`],
    ...(categorySuggestion.categoryId === undefined
      ? { proposedStatus: "pending_review" as const }
      : { proposedCategoryId: categorySuggestion.categoryId }),
    resultOrigin: categorySuggestion.status === "needs_review" ? "review" : "ai",
  };
}

function buildProviderCategoryCandidates(
  categories: readonly Category[],
  transactionKind: TransactionExtractionSuggestionPayload["kind"],
): ProviderCategoryCandidates {
  const header =
    "Escolha exatamente um token de categoria da lista abaixo e devolva o token em proposedCategoryId. Nao invente categorias.\nCategorias:\n";
  let prompt = header;
  const tokenToCategoryId = new Map<string, string>();
  const eligible = categories
    .filter((category) => category.status === "active" && category.kind === transactionKind)
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, 100);

  for (const [index, category] of eligible.entries()) {
    const token = `c${index + 1}`;
    const line = `${token}|${safeReason(category.name)}\n`;
    if (prompt.length + line.length > PROVIDER_PROMPT_LIMIT) break;
    prompt += line;
    tokenToCategoryId.set(token, category.id);
  }

  return { prompt: prompt.trimEnd(), tokenToCategoryId };
}

function reviewDecision(reason: string): CategorizationDecision {
  return {
    provider: "solverfin-categorization",
    origin: { kind: "system", component: "intelligent-categorization" },
    confidence: 0,
    reasons: [safeReason(reason)],
    proposedStatus: "pending_review",
    resultOrigin: "review",
  };
}

async function persistDecision(
  context: TenantContext,
  source: SourceSuggestionRow,
  sourcePayload: TransactionExtractionSuggestionPayload,
  decision: CategorizationDecision,
  executionKey: string,
  now: string,
): Promise<boolean> {
  return withTransaction(async (executeQuery) => {
    await executeQuery(`select pg_advisory_xact_lock(hashtext($1), hashtext($2))`, [
      `${context.organizationId}:${context.financialProfileId}`,
      `${source.id}:${executionKey}`,
    ]);

    const existing = await hasCategorizationExecution(
      context,
      source.id,
      executionKey,
      executeQuery,
    );
    if (existing) return false;

    await executeQuery(
      `update "AiSuggestion"
       set "status" = 'EXPIRED', "reviewedAt" = $4, "updatedAt" = $4
       where "organizationId" = $1 and "financialProfileId" = $2
         and "sourceSuggestionId" = $3 and "kind" = 'CATEGORIZATION' and "status" = 'PENDING_REVIEW'`,
      [context.organizationId, context.financialProfileId, source.id, now],
    );

    const payload = buildCategorizationPayload(source.id, sourcePayload, decision, now);
    await executeQuery(
      `insert into "AiSuggestion"
        ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId", "targetEntityId",
         "confidence", "explanation", "payload", "sourceSuggestionId", "payloadFingerprint", "provider", "model",
         "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
       values ($1, $2, $3, 'CATEGORIZATION', 'PENDING_REVIEW', $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12,
               null, null, $13, $13)`,
      [
        randomUUID(),
        context.organizationId,
        context.financialProfileId,
        source.id,
        source.id,
        decision.confidence,
        decision.reasons.join(" ").slice(0, 1000),
        JSON.stringify(payload),
        source.id,
        payload.fingerprint,
        decision.provider,
        executionKey,
        now,
      ],
    );
    return true;
  });
}

function buildCategorizationPayload(
  sourceId: string,
  sourcePayload: TransactionExtractionSuggestionPayload,
  decision: CategorizationDecision,
  now: string,
): CategorizationSuggestionPayloadV1 {
  return buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "categorization",
      payloadVersion: 1,
      origin: decision.origin,
      target: { entityKind: "import_suggestion", entityId: sourceId },
      confidence: decision.confidence,
      reasons: decision.reasons,
      audit: { createdAt: now, sourceFingerprint: sourcePayload.fingerprint },
      targetEntityId: sourceId,
      sourceSuggestionId: sourceId,
      ...(decision.proposedCategoryId === undefined
        ? {}
        : { proposedCategoryId: decision.proposedCategoryId }),
      ...(decision.proposedAccountId === undefined
        ? {}
        : { proposedAccountId: decision.proposedAccountId }),
      ...(decision.proposedCardId === undefined ? {} : { proposedCardId: decision.proposedCardId }),
      ...(decision.proposedStatus === undefined ? {} : { proposedStatus: decision.proposedStatus }),
    },
  }) as CategorizationSuggestionPayloadV1;
}

async function hasCategorizationExecution(
  context: TenantContext,
  sourceSuggestionId: string,
  executionKey: string,
  executeQuery: QueryExecutor = query,
): Promise<boolean> {
  const rows = await executeQuery<{ exists: boolean }>(
    `select exists (
       select 1 from "AiSuggestion"
       where "organizationId" = $1 and "financialProfileId" = $2
         and "sourceSuggestionId" = $3 and "kind" = 'CATEGORIZATION' and "model" = $4
     ) as exists`,
    [context.organizationId, context.financialProfileId, sourceSuggestionId, executionKey],
  );
  return rows[0]?.exists === true;
}

async function listPendingExtractionSuggestions(
  context: TenantContext,
): Promise<SourceSuggestionRow[]> {
  return query<SourceSuggestionRow>(
    `select "id", "sourceEntityId", "payload", "provider", "model", "createdAt"
     from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "kind" = 'TRANSACTION_EXTRACTION' and "status" = 'PENDING_REVIEW'
     order by "createdAt" asc`,
    [context.organizationId, context.financialProfileId],
  );
}

async function listCategories(context: TenantContext): Promise<Category[]> {
  const rows = await query<CategoryRow>(
    `select "id", "organizationId", "financialProfileId", "name", "kind", "status", "createdAt", "updatedAt"
     from "Category"
     where "organizationId" = $1 and "financialProfileId" = $2`,
    [context.organizationId, context.financialProfileId],
  );
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    name: row.name,
    kind: row.kind.toLowerCase() as Category["kind"],
    status: row.status.toLowerCase() as Category["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

async function listHistory(context: TenantContext): Promise<Transaction[]> {
  const rows = await query<TransactionRow>(
    `select "id", "organizationId", "financialProfileId", "kind", "status", "source", "amountMinor", "currency",
            "occurredOn", "plannedOn", "description", "categoryId", "accountId", "createdAt", "updatedAt"
     from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2 and "categoryId" is not null
       and "voidedAt" is null
     order by "updatedAt" desc
     limit 1000`,
    [context.organizationId, context.financialProfileId],
  );
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    kind: row.kind.toLowerCase() as Transaction["kind"],
    status: row.status.toLowerCase() as Transaction["status"],
    source: row.source.toLowerCase() as Transaction["source"],
    amountMinor: row.amountMinor,
    currency: row.currency,
    occurredOn: toDateOnly(row.occurredOn),
    plannedOn: toDateOnly(row.plannedOn),
    description: row.description,
    ...(row.categoryId === null ? {} : { categoryId: row.categoryId }),
    ...(row.accountId === null ? {} : { accountId: row.accountId }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

function readTransactionExtractionPayload(
  value: unknown,
): TransactionExtractionSuggestionPayload | undefined {
  const result = readAiSuggestionPayload(value, "transaction_extraction");
  if (result.state !== "current") return undefined;
  return result.payload.suggestionKind === "transaction_extraction" ? result.payload : undefined;
}

function buildAutomationRuleTarget(
  context: TenantContext,
  sourceId: string,
  payload: TransactionExtractionSuggestionPayload,
): AutomationRuleTarget {
  return {
    id: sourceId,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    description: payload.description,
    amountMinor: payload.amountMinor,
    kind: payload.kind,
    ...(payload.accountId === undefined ? {} : { accountId: payload.accountId }),
    ...(payload.categoryId === undefined ? {} : { categoryId: payload.categoryId }),
  };
}

function buildDecisionVersionFingerprint(
  context: TenantContext,
  sourceId: string,
  payload: TransactionExtractionSuggestionPayload,
  rules: readonly AutomationRule[],
  learningEntries: readonly CategoryLearningEntry[],
  categories: readonly Category[],
  history: readonly Transaction[],
): string {
  const ruleTarget = buildAutomationRuleTarget(context, sourceId, payload);
  const merchantKey = buildCategoryLearningKey({ description: payload.description });
  const sameKindCategories = categories.filter((category) => category.kind === payload.kind);
  const sameKindCategoryIds = new Set(sameKindCategories.map((category) => category.id));
  const matchingLearningEntries = learningEntries.filter(
    (entry) =>
      entry.status === "active" &&
      entry.transactionKind === payload.kind &&
      entry.merchantKey === merchantKey,
  );
  const matchingHistory = history.filter(
    (transaction) =>
      transaction.kind === payload.kind &&
      transaction.categoryId !== undefined &&
      sameKindCategoryIds.has(transaction.categoryId) &&
      buildCategoryLearningKey({ description: transaction.description }).includes(merchantKey),
  );
  const ruleResult = applyAutomationRules({
    context,
    target: ruleTarget,
    rules,
    now: FINGERPRINT_RULE_EVALUATED_AT,
  });
  const categoryRule = ruleResult.appliedRules.find((rule) =>
    rule.appliedFields.includes("categoryId"),
  );

  let fingerprintLearning = matchingLearningEntries;
  let fingerprintHistory = matchingHistory;
  const categoryDependencyIds = new Set<string>();
  let includeProviderCategoryNames = false;

  if (categoryRule !== undefined && ruleResult.target.categoryId !== undefined) {
    fingerprintLearning = [];
    fingerprintHistory = [];
    categoryDependencyIds.add(ruleResult.target.categoryId);
  } else {
    const localSuggestion = suggestCategory({
      context,
      target: {
        organizationId: context.organizationId,
        financialProfileId: context.financialProfileId,
        transactionKind: payload.kind,
        description: payload.description,
        amountMinor: payload.amountMinor,
      },
      categories,
      learningEntries,
      history,
    });

    if (localSuggestion.source === "learning") {
      fingerprintHistory = [];
      for (const entry of matchingLearningEntries) categoryDependencyIds.add(entry.categoryId);
    } else if (localSuggestion.source === "history") {
      for (const entry of matchingLearningEntries) categoryDependencyIds.add(entry.categoryId);
      for (const transaction of matchingHistory) {
        if (transaction.categoryId !== undefined) categoryDependencyIds.add(transaction.categoryId);
      }
    } else {
      includeProviderCategoryNames = true;
      for (const category of sameKindCategories) {
        if (category.status === "active") categoryDependencyIds.add(category.id);
      }
    }
  }

  const fingerprintCategories = sameKindCategories
    .filter((category) => categoryDependencyIds.has(category.id))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((category) =>
      includeProviderCategoryNames
        ? [category.id, category.kind, category.status, category.name]
        : [category.id, category.kind, category.status],
    );

  return stableHash({
    engine: ENGINE_VERSION,
    rules: rules
      .filter((rule) => rule.status === "active" && matchesAutomationRule(rule, ruleTarget))
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((rule) => [
        rule.id,
        rule.status,
        rule.priority,
        rule.conditions,
        rule.actions,
        rule.updatedAt,
      ]),
    learning: fingerprintLearning
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((entry) => [
        entry.id,
        entry.status,
        entry.merchantKey,
        entry.transactionKind,
        entry.categoryId,
        entry.correctionCount,
        entry.updatedAt,
      ]),
    categories: fingerprintCategories,
    history: fingerprintHistory
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((transaction) => [transaction.id, transaction.categoryId, transaction.updatedAt]),
  });
}

function buildExecutionKey(sourceFingerprint: string, versionFingerprint: string): string {
  return `${ENGINE_VERSION}-${stableHash([sourceFingerprint, versionFingerprint]).slice(0, 24)}`;
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeReason(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

function normalizeProposedStatus(
  value: AutomationRuleTarget["status"],
): CategorizationSuggestionPayloadV1["proposedStatus"] | undefined {
  if (
    value === "pending_review" ||
    value === "planned" ||
    value === "posted" ||
    value === "reconciled" ||
    value === "suggested" ||
    value === "voided"
  ) {
    return value;
  }
  return undefined;
}

function toDateOnly(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
