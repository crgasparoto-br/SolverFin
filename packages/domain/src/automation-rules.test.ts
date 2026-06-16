import type { TenantContext } from "./tenant.js";
import { TenantAuthorizationError } from "./tenant-authorization.js";
import {
  type AutomationRule,
  type AutomationRuleTarget,
  applyAutomationRules,
  matchesAutomationRule,
} from "./automation-rules.js";

const tenantA: TenantContext = {
  userId: "user-rules-a",
  organizationId: "org-rules-a",
  financialProfileId: "profile-rules-a",
  financialProfileKind: "personal",
};

const tenantB: TenantContext = {
  userId: "user-rules-b",
  organizationId: "org-rules-b",
  financialProfileId: "profile-rules-b",
  financialProfileKind: "business",
};

const now = "2026-06-16T13:00:00.000Z";

testRuleMatchAndExplanation();
testNoMatchKeepsTargetUnchanged();
testPriorityResolvesConflictingActions();
testInactiveRuleIsIgnored();
testTenantIsolation();

function testRuleMatchAndExplanation(): void {
  const target = buildTarget(tenantA, {
    description: "Compra Mercado Demo Centro",
    merchant: "Mercado Demo",
    amountMinor: 4250,
    kind: "expense",
    accountId: "account-card-a",
  });
  const rule = buildRule("rule-market", tenantA, {
    conditions: {
      descriptionIncludes: "mercado",
      merchantIncludes: "demo",
      amount: { minMinor: 1000, maxMinor: 10000 },
      accountId: "account-card-a",
      kind: "expense",
    },
    actions: {
      categoryId: "category-groceries",
      tagIds: ["tag-routine"],
      status: "pending_review",
    },
    explanation: "Mercado Demo costuma ser classificado como supermercado.",
  });

  assertEqual(matchesAutomationRule(rule, target), true, "rule match");

  const result = applyAutomationRules({
    context: tenantA,
    target,
    rules: [rule],
    now,
  });

  assertEqual(result.target.categoryId, "category-groceries", "matched category action");
  assertEqual(result.target.status, "pending_review", "matched status action");
  assertEqual(result.target.tagIds?.[0], "tag-routine", "matched tag action");
  assertEqual(result.appliedRules.length, 1, "applied rule count");
  assertEqual(
    result.appliedRules[0]?.reason,
    "Mercado Demo costuma ser classificado como supermercado.",
    "applied rule explanation",
  );
}

function testNoMatchKeepsTargetUnchanged(): void {
  const target = buildTarget(tenantA, {
    description: "Farmacia Demo",
    merchant: "Farmacia Demo",
  });
  const rule = buildRule("rule-market-no-match", tenantA, {
    conditions: { descriptionIncludes: "mercado" },
    actions: { categoryId: "category-groceries" },
  });

  const result = applyAutomationRules({
    context: tenantA,
    target,
    rules: [rule],
    now,
  });

  assertEqual(result.target.categoryId, undefined, "no match category remains empty");
  assertEqual(result.appliedRules.length, 0, "no match applied rule count");
}

function testPriorityResolvesConflictingActions(): void {
  const target = buildTarget(tenantA, {
    description: "Assinatura Streaming Demo",
    merchant: "Streaming Demo",
  });
  const lowPriorityRule = buildRule("rule-low-priority", tenantA, {
    priority: 10,
    conditions: { merchantIncludes: "streaming" },
    actions: { categoryId: "category-entertainment" },
  });
  const highPriorityRule = buildRule("rule-high-priority", tenantA, {
    priority: 90,
    conditions: { descriptionIncludes: "assinatura" },
    actions: { categoryId: "category-subscriptions" },
  });

  const result = applyAutomationRules({
    context: tenantA,
    target,
    rules: [lowPriorityRule, highPriorityRule],
    now,
  });

  assertEqual(result.target.categoryId, "category-subscriptions", "high priority category wins");
  assertEqual(result.appliedRules.length, 1, "conflicting lower priority rule is not applied");
  assertEqual(result.appliedRules[0]?.ruleId, highPriorityRule.id, "applied high priority rule id");
}

function testInactiveRuleIsIgnored(): void {
  const target = buildTarget(tenantA, {
    description: "Padaria Demo",
    merchant: "Padaria Demo",
  });
  const inactiveRule = buildRule("rule-inactive", tenantA, {
    status: "inactive",
    conditions: { descriptionIncludes: "padaria" },
    actions: { categoryId: "category-food" },
  });

  const result = applyAutomationRules({
    context: tenantA,
    target,
    rules: [inactiveRule],
    now,
  });

  assertEqual(result.target.categoryId, undefined, "inactive rule category remains empty");
  assertEqual(result.appliedRules.length, 0, "inactive rule count");
}

function testTenantIsolation(): void {
  const target = buildTarget(tenantA, { description: "Mercado Demo" });
  const otherTenantRule = buildRule("rule-other-tenant", tenantB, {
    conditions: { descriptionIncludes: "mercado" },
    actions: { categoryId: "category-other-tenant" },
  });

  const result = applyAutomationRules({
    context: tenantA,
    target,
    rules: [otherTenantRule],
    now,
  });

  assertEqual(result.target.categoryId, undefined, "other tenant rule ignored");
  assertEqual(result.appliedRules.length, 0, "other tenant applied count");

  try {
    applyAutomationRules({
      context: tenantA,
      target: buildTarget(tenantB, { id: "target-other-tenant" }),
      rules: [],
      now,
    });
  } catch (error) {
    if (error instanceof TenantAuthorizationError) {
      assertEqual(error.code, "TENANT_RESOURCE_NOT_FOUND", "other tenant target error code");
      return;
    }

    throw error;
  }

  throw new Error("Expected other tenant target to be rejected.");
}

function buildRule(
  id: string,
  context: TenantContext,
  overrides: Partial<AutomationRule> = {},
): AutomationRule {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    name: id,
    status: "active",
    priority: 50,
    conditions: { descriptionIncludes: "demo" },
    actions: { categoryId: "category-demo" },
    createdAt: now,
    updatedAt: now,
    createdByUserId: context.userId,
    updatedByUserId: context.userId,
    ...overrides,
  };
}

function buildTarget(
  context: TenantContext,
  overrides: Partial<AutomationRuleTarget> = {},
): AutomationRuleTarget {
  return {
    id: "target-automation-rule",
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    description: "Compra Demo",
    merchant: "Demo",
    amountMinor: 4250,
    kind: "expense",
    accountId: "account-a",
    status: "pending_review",
    ...overrides,
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
