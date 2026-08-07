import { createHash, randomUUID } from "node:crypto";

import {
  createAiProviderFromEnvironment,
  defaultAiUsagePolicy,
  runAiTask,
  validateAiClassificationResult,
  type AiConsentState,
  type AiProviderSelection,
  type AiUsagePolicy,
} from "@solverfin/ai";
import {
  applyAutomationRules,
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

export interface IntelligentCategorizationRuntime {
  selectProvider: () => AiProviderSelection;
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
  occurredOn: Date;
  plannedOn: Date;
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

const ENGINE_VERSION = "intelligent-categorization-v1";
const CLASSIFICATION_PURPOSE = "transaction_categorization";

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
  const versionFingerprint = buildDecisionVersionFingerprint(rules, learningEntries, categories, history);
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
  const ruleTarget: AutomationRuleTarget = {
    id: input.sourceId,
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    description: input.payload.description,
    amountMinor: input.payload.amountMinor,
    kind: input.payload.kind,
    ...(input.payload.accountId === undefined ? {} : { accountId: input.payload.accountId }),
    ...(input.payload.categoryId === undefined ? {} : { categoryId: input.payload.categoryId }),
  };
  const ruleResult = applyAutomationRules({
    context: input.context,
    target: ruleTarget,
    rules: input.rules,
    now: new Date().toISOString(),
  });

  if (ruleResult.appliedRules.length > 0) {
    const firstRule = ruleResult.appliedRules[0];
    const reasons = ruleResult.appliedRules.map(
      (rule) => `Regra explicita: ${safeReason(rule.reason)}`,
    );
    return {
      provider: "solverfin-automation",
      origin: { kind: "automation", ruleId: firstRule?.ruleId },
      confidence: 0.95,
      reasons,
      ...(ruleResult.target.categoryId === undefined
        ? {}
        : { proposedCategoryId: ruleResult.target.categoryId }),
      ...(ruleResult.target.accountId === undefined
        ? {}
        : { proposedAccountId: ruleResult.target.accountId }),
      ...(ruleResult.target.cardId === undefined ? {} : { proposedCardId: ruleResult.target.cardId }),
      ...(ruleResult.target.status === undefined ? {} : { proposedStatus: ruleResult.target.status }),
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
    return buildLocalDecision(localSuggestion);
  }

  return requestAiDecision(input.context, input.payload, input.categories, input.runtime);
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
    resultOrigin: suggestion.status === "needs_review" ? "review" : isLearning ? "learning" : "history",
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
  let selection: AiProviderSelection;

  try {
    selection = runtime.selectProvider?.() ?? createAiProviderFromEnvironment(process.env);
  } catch {
    return reviewDecision("A IA nao esta disponivel por configuracao. Escolha a categoria manualmente.");
  }

  if (selection.status === "disabled" || selection.provider === undefined) {
    return reviewDecision("A IA esta desativada. Escolha a categoria manualmente.");
  }

  const policy: AiUsagePolicy = runtime.policy ?? {
    ...defaultAiUsagePolicy,
    consent,
    purpose: CLASSIFICATION_PURPOSE,
    maxPromptChars: 2_000,
    maxRetries: 1,
    timeoutMs: 8_000,
    allowRawFinancialText: false,
    allowedFieldNames: [
      "amountMinor",
      "currency",
      "occurredOn",
      "description",
      "transactionType",
    ],
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
      prompt: "Sugira somente uma categoria existente para este lancamento.",
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
      value.proposedCategoryId.length > 0,
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
    return reviewDecision("A IA nao retornou uma categoria valida. Escolha a categoria manualmente.");
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
      categoryId: structured.proposedCategoryId,
      confidence,
      reason: "IA sugeriu uma categoria a partir de dados minimizados do lancamento.",
      provider: aiResult.providerId,
      model: aiResult.model,
    },
  });

  return {
    provider: aiResult.providerId,
    origin: { kind: "provider", provider: aiResult.providerId, model: aiResult.model },
    confidence: categorySuggestion.confidence,
    reasons: [`IA: ${safeReason(categorySuggestion.reason)}`],
    ...(categorySuggestion.categoryId === undefined
      ? { proposedStatus: "pending_review" as const }
      : { proposedCategoryId: categorySuggestion.categoryId }),
    resultOrigin: categorySuggestion.status === "needs_review" ? "review" : "ai",
  };
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

    const existing = await hasCategorizationExecution(context, source.id, executionKey, executeQuery);
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
      ...(decision.proposedAccountId === undefined ? {} : { proposedAccountId: decision.proposedAccountId }),
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
    categoryId: row.categoryId ?? undefined,
    accountId: row.accountId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

function readTransactionExtractionPayload(
  value: unknown,
): TransactionExtractionSuggestionPayload | undefined {
  const payload = readAiSuggestionPayload(value);
  return payload?.suggestionKind === "transaction_extraction" ? payload : undefined;
}

function buildDecisionVersionFingerprint(
  rules: readonly AutomationRule[],
  learningEntries: readonly CategoryLearningEntry[],
  categories: readonly Category[],
  history: readonly Transaction[],
): string {
  return stableHash({
    engine: ENGINE_VERSION,
    rules: [...rules]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((rule) => [rule.id, rule.status, rule.priority, rule.conditions, rule.actions, rule.updatedAt]),
    learning: [...learningEntries]
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
    categories: [...categories]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((category) => [category.id, category.kind, category.status, category.updatedAt]),
    history: [...history]
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
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
