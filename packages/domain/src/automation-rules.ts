import type {
  EntityId,
  ISODateTime,
  TenantScoped,
  Traceable,
  TransactionKind,
  TransactionStatus,
} from "./index.js";
import type { ImportSuggestionStatus } from "./imports.js";
import type { TenantContext } from "./tenant.js";
import { getTenantScopedResource, listTenantScopedResources } from "./tenant-authorization.js";

export type AutomationRuleStatus = "active" | "inactive";
export type AutomationRuleActionStatus = TransactionStatus | ImportSuggestionStatus;

export interface AutomationRuleAmountCondition {
  equalsMinor?: number;
  minMinor?: number;
  maxMinor?: number;
}

export interface AutomationRuleConditions {
  descriptionIncludes?: string;
  merchantIncludes?: string;
  amount?: AutomationRuleAmountCondition;
  accountId?: EntityId;
  cardId?: EntityId;
  kind?: TransactionKind;
}

export interface AutomationRuleActions {
  categoryId?: EntityId;
  accountId?: EntityId;
  cardId?: EntityId;
  tagIds?: readonly EntityId[];
  status?: AutomationRuleActionStatus;
}

export interface AutomationRule extends Traceable, TenantScoped {
  name: string;
  status: AutomationRuleStatus;
  priority: number;
  conditions: AutomationRuleConditions;
  actions: AutomationRuleActions;
  explanation?: string;
}

export interface AutomationRuleTarget extends TenantScoped {
  id: EntityId;
  description: string;
  amountMinor: number;
  kind: TransactionKind;
  merchant?: string;
  accountId?: EntityId;
  cardId?: EntityId;
  categoryId?: EntityId;
  tagIds?: readonly EntityId[];
  status?: AutomationRuleActionStatus;
}

export interface AppliedAutomationRule {
  ruleId: EntityId;
  name: string;
  priority: number;
  reason: string;
  appliedFields: readonly string[];
}

export interface AutomationRuleAppliedFields {
  categoryId?: EntityId;
  accountId?: EntityId;
  cardId?: EntityId;
  tagIds?: readonly EntityId[];
  status?: AutomationRuleActionStatus;
}

export interface ApplyAutomationRulesInput<TTarget extends AutomationRuleTarget> {
  context: TenantContext;
  target: TTarget | undefined;
  rules: readonly AutomationRule[];
  now: ISODateTime;
}

export interface AutomationRuleApplicationResult<TTarget extends AutomationRuleTarget> {
  target: TTarget & AutomationRuleAppliedFields;
  appliedRules: readonly AppliedAutomationRule[];
}

export function applyAutomationRules<TTarget extends AutomationRuleTarget>(
  input: ApplyAutomationRulesInput<TTarget>,
): AutomationRuleApplicationResult<TTarget> {
  const target = { ...getTenantScopedResource(input.context, input.target) } as TTarget &
    AutomationRuleAppliedFields;
  const appliedFields = new Set<keyof AutomationRuleActions>();
  const appliedRules: AppliedAutomationRule[] = [];
  const matchingRules = listTenantScopedResources(input.context, input.rules)
    .filter((rule) => rule.status === "active" && matchesAutomationRule(rule, target))
    .sort(compareAutomationRules);

  for (const rule of matchingRules) {
    const appliedRuleFields = applyRuleActions(target, rule.actions, appliedFields);

    if (appliedRuleFields.length === 0) {
      continue;
    }

    appliedRules.push({
      ruleId: rule.id,
      name: rule.name,
      priority: rule.priority,
      reason: buildRuleExplanation(rule, target, appliedRuleFields),
      appliedFields: appliedRuleFields,
    });
  }

  return {
    target,
    appliedRules,
  };
}

export function matchesAutomationRule(rule: AutomationRule, target: AutomationRuleTarget): boolean {
  const conditions = rule.conditions;
  let hasCondition = false;

  if (conditions.descriptionIncludes !== undefined) {
    hasCondition = true;

    if (!containsNormalizedText(target.description, conditions.descriptionIncludes)) {
      return false;
    }
  }

  if (conditions.merchantIncludes !== undefined) {
    hasCondition = true;

    if (!containsNormalizedText(target.merchant, conditions.merchantIncludes)) {
      return false;
    }
  }

  if (conditions.amount !== undefined) {
    hasCondition = true;

    if (!matchesAmountCondition(conditions.amount, target.amountMinor)) {
      return false;
    }
  }

  if (conditions.accountId !== undefined) {
    hasCondition = true;

    if (target.accountId !== conditions.accountId) {
      return false;
    }
  }

  if (conditions.cardId !== undefined) {
    hasCondition = true;

    if (target.cardId !== conditions.cardId) {
      return false;
    }
  }

  if (conditions.kind !== undefined) {
    hasCondition = true;

    if (target.kind !== conditions.kind) {
      return false;
    }
  }

  return hasCondition;
}

function applyRuleActions(
  target: AutomationRuleTarget & AutomationRuleAppliedFields,
  actions: AutomationRuleActions,
  appliedFields: Set<keyof AutomationRuleActions>,
): string[] {
  const fields: string[] = [];

  if (actions.categoryId !== undefined && !appliedFields.has("categoryId")) {
    target.categoryId = actions.categoryId;
    appliedFields.add("categoryId");
    fields.push("categoryId");
  }

  if (actions.accountId !== undefined && !appliedFields.has("accountId")) {
    target.accountId = actions.accountId;
    appliedFields.add("accountId");
    fields.push("accountId");
  }

  if (actions.cardId !== undefined && !appliedFields.has("cardId")) {
    target.cardId = actions.cardId;
    appliedFields.add("cardId");
    fields.push("cardId");
  }

  if (actions.tagIds !== undefined && !appliedFields.has("tagIds")) {
    target.tagIds = [...actions.tagIds];
    appliedFields.add("tagIds");
    fields.push("tagIds");
  }

  if (actions.status !== undefined && !appliedFields.has("status")) {
    target.status = actions.status;
    appliedFields.add("status");
    fields.push("status");
  }

  return fields;
}

function compareAutomationRules(left: AutomationRule, right: AutomationRule): number {
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }

  return left.createdAt.localeCompare(right.createdAt);
}

function buildRuleExplanation(
  rule: AutomationRule,
  target: AutomationRuleTarget,
  fields: readonly string[],
): string {
  const configuredExplanation = rule.explanation?.trim();

  if (configuredExplanation !== undefined && configuredExplanation.length > 0) {
    return configuredExplanation;
  }

  return `Regra "${rule.name}" aplicada por corresponder aos criterios configurados para "${target.description}" e preencher ${fields.join(", ")}.`;
}

function matchesAmountCondition(
  condition: AutomationRuleAmountCondition,
  amountMinor: number,
): boolean {
  if (condition.equalsMinor !== undefined && amountMinor !== condition.equalsMinor) {
    return false;
  }

  if (condition.minMinor !== undefined && amountMinor < condition.minMinor) {
    return false;
  }

  if (condition.maxMinor !== undefined && amountMinor > condition.maxMinor) {
    return false;
  }

  return true;
}

function containsNormalizedText(value: string | undefined, expected: string): boolean {
  const normalizedValue = normalizeText(value);
  const normalizedExpected = normalizeText(expected);

  return normalizedExpected.length > 0 && normalizedValue.includes(normalizedExpected);
}

function normalizeText(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
