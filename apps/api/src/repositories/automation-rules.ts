import { randomUUID } from "node:crypto";

import {
  applyAutomationRules,
  type AiSuggestion,
  type AutomationRule,
  type AutomationRuleActions,
  type AutomationRuleConditions,
  type AutomationRuleTarget,
  type EntityId,
  type TenantContext,
  type TransactionKind,
} from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import type { query as QueryFn } from "../db.js";

export interface AutomationRuleDraft {
  name: string;
  priority?: number;
  conditions: AutomationRuleConditions;
  actions: AutomationRuleActions;
  explanation?: string;
}

export interface ApplyAutomationRulesResult {
  createdSuggestions: AiSuggestion[];
  skipped: number;
}

interface AutomationRuleRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  name: string;
  status: string;
  priority: number;
  conditions: unknown;
  actions: unknown;
  explanation: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

interface AiSuggestionRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  kind: string;
  status: string;
  sourceEntityId: string | null;
  targetEntityId: string | null;
  confidence: string | number;
  explanation: string;
  provider: string | null;
  model: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AutomationRuleRepositoryError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "AutomationRuleRepositoryError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const AUTOMATION_RULE_SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "name", "status",
  "priority", "conditions", "actions", "explanation", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId"`;
const AI_SUGGESTION_SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "kind", "status",
  "sourceEntityId", "targetEntityId", "confidence", "explanation", "provider", "model", "reviewedByUserId",
  "reviewedAt", "createdAt", "updatedAt"`;

export async function listAutomationRulesForContext(
  context: TenantContext,
  status: "active" | "inactive" | "all" = "all",
): Promise<AutomationRule[]> {
  const rows = await query<AutomationRuleRow>(
    `select ${AUTOMATION_RULE_SELECT_COLUMNS} from "AutomationRule"
     where "organizationId" = $1 and "financialProfileId" = $2
     order by "priority" desc, "createdAt" asc`,
    [context.organizationId, context.financialProfileId],
  );

  return rows
    .map(mapAutomationRuleRow)
    .filter((rule) => status === "all" || rule.status === status);
}

export async function createAutomationRuleForContext(
  context: TenantContext,
  draft: AutomationRuleDraft,
): Promise<AutomationRule> {
  const now = new Date().toISOString();
  const rule = normalizeAutomationRule(context, {
    id: randomUUID(),
    name: draft.name,
    status: "active",
    priority: draft.priority ?? 100,
    conditions: draft.conditions,
    actions: draft.actions,
    explanation: draft.explanation,
    createdAt: now,
    updatedAt: now,
    createdByUserId: context.userId,
    updatedByUserId: context.userId,
  });

  await query(
    `insert into "AutomationRule"
      ("id", "organizationId", "financialProfileId", "name", "status", "priority", "conditions", "actions",
       "explanation", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13)`,
    buildAutomationRuleParams(rule),
  );

  return rule;
}

export async function updateAutomationRuleForContext(
  context: TenantContext,
  ruleId: EntityId,
  patch: Partial<AutomationRuleDraft> & { status?: "active" | "inactive" },
): Promise<AutomationRule> {
  const current = await findAutomationRuleForContext(context, ruleId);
  const now = new Date().toISOString();
  const updated = normalizeAutomationRule(context, {
    ...current,
    ...patch,
    updatedAt: now,
    updatedByUserId: context.userId,
  });

  await query(
    `update "AutomationRule" set
       "name" = $4, "status" = $5, "priority" = $6, "conditions" = $7::jsonb, "actions" = $8::jsonb,
       "explanation" = $9, "updatedByUserId" = $11, "updatedAt" = $13
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    buildAutomationRuleParams(updated),
  );

  return updated;
}

export async function archiveAutomationRuleForContext(
  context: TenantContext,
  ruleId: EntityId,
): Promise<AutomationRule> {
  return updateAutomationRuleForContext(context, ruleId, { status: "inactive" });
}

export async function applyAutomationRulesForContext(
  context: TenantContext,
): Promise<ApplyAutomationRulesResult> {
  const rules = await listAutomationRulesForContext(context, "active");
  const pendingSuggestions = await listPendingTransactionExtractionSuggestions(context);
  const createdSuggestions: AiSuggestion[] = [];
  let skipped = 0;

  if (rules.length === 0 || pendingSuggestions.length === 0) {
    return { createdSuggestions, skipped: pendingSuggestions.length };
  }

  await withTransaction(async (executeQuery) => {
    for (const sourceSuggestion of pendingSuggestions) {
      const target = buildAutomationTargetFromSuggestion(context, sourceSuggestion);

      if (target === undefined) {
        skipped += 1;
        continue;
      }

      const application = applyAutomationRules({
        context,
        target,
        rules,
        now: new Date().toISOString(),
      });

      if (application.appliedRules.length === 0) {
        skipped += 1;
        continue;
      }

      const alreadyExists = await hasAutomationSuggestionForSource(
        context,
        sourceSuggestion.id,
        executeQuery,
      );

      if (alreadyExists) {
        skipped += 1;
        continue;
      }

      const now = new Date().toISOString();
      const suggestion = buildAutomationSuggestion(
        context,
        sourceSuggestion,
        application.appliedRules.map((rule) => rule.reason),
        now,
      );
      await executeQuery(buildInsertAiSuggestionSql(), buildAiSuggestionParams(suggestion));
      createdSuggestions.push(suggestion);
    }
  });

  return { createdSuggestions, skipped };
}

async function findAutomationRuleForContext(
  context: TenantContext,
  ruleId: EntityId,
): Promise<AutomationRule> {
  const rows = await query<AutomationRuleRow>(
    `select ${AUTOMATION_RULE_SELECT_COLUMNS} from "AutomationRule"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [ruleId, context.organizationId, context.financialProfileId],
  );
  const rule = rows[0] ? mapAutomationRuleRow(rows[0]) : undefined;

  if (rule === undefined) {
    throw new AutomationRuleRepositoryError(
      "AUTOMATION_RULE_NOT_FOUND",
      "Regra automatica nao encontrada no perfil financeiro ativo.",
      404,
    );
  }

  return rule;
}

async function listPendingTransactionExtractionSuggestions(
  context: TenantContext,
): Promise<AiSuggestion[]> {
  const rows = await query<AiSuggestionRow>(
    `select ${AI_SUGGESTION_SELECT_COLUMNS} from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "kind" = 'TRANSACTION_EXTRACTION' and "status" = 'PENDING_REVIEW'
     order by "createdAt" asc`,
    [context.organizationId, context.financialProfileId],
  );

  return rows.map(mapAiSuggestionRow);
}

async function hasAutomationSuggestionForSource(
  context: TenantContext,
  sourceSuggestionId: EntityId,
  executeQuery: typeof QueryFn,
): Promise<boolean> {
  const rows = await executeQuery<{ id: string }>(
    `select "id" from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2 and "sourceEntityId" = $3
       and "provider" = 'solverfin-automation' and "model" = 'automation-rules-v1'
     limit 1`,
    [context.organizationId, context.financialProfileId, sourceSuggestionId],
  );

  return rows.length > 0;
}

function normalizeAutomationRule(
  context: TenantContext,
  input: Omit<AutomationRule, "organizationId" | "financialProfileId">,
): AutomationRule {
  const name = input.name.trim();

  if (!name) {
    throw new AutomationRuleRepositoryError(
      "AUTOMATION_RULE_NAME_REQUIRED",
      "Informe um nome para a regra automatica.",
    );
  }

  if (!hasAnyCondition(input.conditions)) {
    throw new AutomationRuleRepositoryError(
      "AUTOMATION_RULE_CONDITION_REQUIRED",
      "Configure pelo menos uma condicao para a regra automatica.",
    );
  }

  if (!hasAnyAction(input.actions)) {
    throw new AutomationRuleRepositoryError(
      "AUTOMATION_RULE_ACTION_REQUIRED",
      "Configure pelo menos uma acao sugerida para a regra automatica.",
    );
  }

  return {
    ...input,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    name,
    priority: Number.isFinite(input.priority) ? input.priority : 100,
    conditions: sanitizeConditions(input.conditions),
    actions: sanitizeActions(input.actions),
    ...(input.explanation?.trim() ? { explanation: input.explanation.trim() } : {}),
  };
}

function hasAnyCondition(conditions: AutomationRuleConditions): boolean {
  return Object.values(conditions).some((value) => value !== undefined && value !== "");
}

function hasAnyAction(actions: AutomationRuleActions): boolean {
  return Object.values(actions).some((value) => value !== undefined && value !== "");
}

function sanitizeConditions(conditions: AutomationRuleConditions): AutomationRuleConditions {
  return {
    ...(conditions.descriptionIncludes?.trim()
      ? { descriptionIncludes: conditions.descriptionIncludes.trim() }
      : {}),
    ...(conditions.merchantIncludes?.trim() ? { merchantIncludes: conditions.merchantIncludes.trim() } : {}),
    ...(conditions.amount !== undefined ? { amount: conditions.amount } : {}),
    ...(conditions.accountId !== undefined ? { accountId: conditions.accountId } : {}),
    ...(conditions.cardId !== undefined ? { cardId: conditions.cardId } : {}),
    ...(conditions.kind !== undefined ? { kind: conditions.kind } : {}),
  };
}

function sanitizeActions(actions: AutomationRuleActions): AutomationRuleActions {
  return {
    ...(actions.categoryId !== undefined ? { categoryId: actions.categoryId } : {}),
    ...(actions.accountId !== undefined ? { accountId: actions.accountId } : {}),
    ...(actions.cardId !== undefined ? { cardId: actions.cardId } : {}),
    ...(actions.status !== undefined ? { status: actions.status } : {}),
  };
}

function buildAutomationTargetFromSuggestion(
  context: TenantContext,
  suggestion: AiSuggestion,
): AutomationRuleTarget | undefined {
  const match =
    /^CSV linha (\d+): ([0-9-]+); ([a-z_]+); (\d+) centavos; (.*)\. Revise antes de criar o lancamento final\.$/.exec(
      suggestion.explanation,
    );

  if (match === null) {
    return undefined;
  }

  const details = parseDescriptionDetails(match[5] ?? "");

  return {
    id: suggestion.id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    description: details.description,
    amountMinor: Number(match[4]),
    kind: (match[3] ?? "expense") as TransactionKind,
    ...(details.accountId !== undefined ? { accountId: details.accountId } : {}),
    ...(details.categoryId !== undefined ? { categoryId: details.categoryId } : {}),
    status: suggestion.status,
  };
}

function parseDescriptionDetails(value: string): { description: string; accountId?: string; categoryId?: string } {
  const parts = value.split("; ");
  const description = parts[0]?.trim() ?? "";
  const accountPart = parts.find((part) => part.startsWith("conta "));
  const categoryPart = parts.find((part) => part.startsWith("categoria "));

  return {
    description,
    ...(accountPart !== undefined ? { accountId: accountPart.slice("conta ".length) } : {}),
    ...(categoryPart !== undefined ? { categoryId: categoryPart.slice("categoria ".length) } : {}),
  };
}

function buildAutomationSuggestion(
  context: TenantContext,
  sourceSuggestion: AiSuggestion,
  reasons: readonly string[],
  now: string,
): AiSuggestion {
  return {
    id: randomUUID(),
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    kind: "categorization",
    status: "pending_review",
    sourceEntityId: sourceSuggestion.id,
    targetEntityId: sourceSuggestion.id,
    confidence: 0.9,
    explanation: `Regra automatica sugeriu ajustes para a sugestao ${sourceSuggestion.id}. ${reasons.join(" ")}`.slice(
      0,
      500,
    ),
    provider: "solverfin-automation",
    model: "automation-rules-v1",
    createdAt: now,
    updatedAt: now,
  };
}

function buildInsertAiSuggestionSql(): string {
  return `insert into "AiSuggestion"
    ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId", "targetEntityId",
     "confidence", "explanation", "provider", "model", "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`;
}

function buildAiSuggestionParams(suggestion: AiSuggestion): unknown[] {
  return [
    suggestion.id,
    suggestion.organizationId,
    suggestion.financialProfileId,
    suggestion.kind.toUpperCase(),
    suggestion.status.toUpperCase(),
    suggestion.sourceEntityId ?? null,
    suggestion.targetEntityId ?? null,
    suggestion.confidence,
    suggestion.explanation,
    suggestion.provider ?? null,
    suggestion.model ?? null,
    suggestion.reviewedByUserId ?? null,
    suggestion.reviewedAt ?? null,
    suggestion.createdAt,
    suggestion.updatedAt,
  ];
}

function buildAutomationRuleParams(rule: AutomationRule): unknown[] {
  return [
    rule.id,
    rule.organizationId,
    rule.financialProfileId,
    rule.name,
    rule.status.toUpperCase(),
    rule.priority,
    JSON.stringify(rule.conditions),
    JSON.stringify(rule.actions),
    rule.explanation ?? null,
    rule.createdByUserId ?? null,
    rule.updatedByUserId ?? null,
    rule.createdAt,
    rule.updatedAt,
  ];
}

function mapAutomationRuleRow(row: AutomationRuleRow): AutomationRule {
  return {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    name: row.name,
    status: row.status.toLowerCase() as AutomationRule["status"],
    priority: row.priority,
    conditions: row.conditions as AutomationRuleConditions,
    actions: row.actions as AutomationRuleActions,
    ...(row.explanation !== null ? { explanation: row.explanation } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.createdByUserId !== null ? { createdByUserId: row.createdByUserId } : {}),
    ...(row.updatedByUserId !== null ? { updatedByUserId: row.updatedByUserId } : {}),
  };
}

function mapAiSuggestionRow(row: AiSuggestionRow): AiSuggestion {
  const suggestion: AiSuggestion = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    kind: row.kind.toLowerCase() as AiSuggestion["kind"],
    status: row.status.toLowerCase() as AiSuggestion["status"],
    confidence: Number(row.confidence),
    explanation: row.explanation,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.sourceEntityId !== null) suggestion.sourceEntityId = row.sourceEntityId;
  if (row.targetEntityId !== null) suggestion.targetEntityId = row.targetEntityId;
  if (row.provider !== null) suggestion.provider = row.provider;
  if (row.model !== null) suggestion.model = row.model;
  if (row.reviewedByUserId !== null) suggestion.reviewedByUserId = row.reviewedByUserId;
  if (row.reviewedAt !== null) suggestion.reviewedAt = row.reviewedAt.toISOString();

  return suggestion;
}
