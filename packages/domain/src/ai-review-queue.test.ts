import type { Account, AiSuggestion, Category } from "./index.js";
import type { TenantContext } from "./tenant.js";
import { TenantAuthorizationError } from "./tenant-authorization.js";
import {
  adjustAiSuggestion,
  approveAiSuggestion,
  listPendingAiSuggestionReviews,
  rejectAiSuggestion,
  type ReviewableAiSuggestion,
} from "./ai-review-queue.js";

const tenantA: TenantContext = {
  userId: "user-review-a",
  organizationId: "org-review-a",
  financialProfileId: "profile-review-a",
  financialProfileKind: "personal",
};

const tenantB: TenantContext = {
  userId: "user-review-b",
  organizationId: "org-review-b",
  financialProfileId: "profile-review-b",
  financialProfileKind: "business",
};

const now = "2026-06-16T15:00:00.000Z";
const accountA = buildAccount(tenantA, "account-review-a");
const categoryA = buildCategory(tenantA, "category-review-a");
const reviewSuggestion = buildReviewSuggestion(tenantA, "suggestion-review-a", 0.91);

testListPendingSuggestions();
testApproveSuggestionCreatesAuditedTransaction();
testRejectSuggestionIsAudited();
testAdjustSuggestionIsAudited();
testTenantIsolation();

function testListPendingSuggestions(): void {
  const lowConfidence = buildReviewSuggestion(tenantA, "suggestion-low-confidence", 0.42);
  const otherTenant = buildReviewSuggestion(tenantB, "suggestion-other-tenant", 0.95);
  const approved = buildReviewSuggestion(tenantA, "suggestion-approved", 0.94, "approved");

  const visible = listPendingAiSuggestionReviews(tenantA, [
    lowConfidence,
    otherTenant,
    approved,
    reviewSuggestion,
  ]);

  assertEqual(visible.length, 1, "default list hides low confidence and other tenants");
  assertEqual(visible[0]?.id, reviewSuggestion.suggestion.id, "visible suggestion id");
  assertEqual(visible[0]?.origin, "ai", "origin is exposed");
  assertEqual(visible[0]?.confidence, 0.91, "confidence is exposed");
  assertEqual(visible[0]?.explanation, "Merchant recorrente identificado.", "explanation is exposed");
  assertEqual(visible[0]?.maskedSummary, "Compra em MERCADO *** no cartao final 1234", "masked summary");

  const withLowConfidence = listPendingAiSuggestionReviews(tenantA, [lowConfidence], {
    includeLowConfidence: true,
  });

  assertEqual(withLowConfidence[0]?.risk, "low_confidence", "low confidence risk");
}

function testApproveSuggestionCreatesAuditedTransaction(): void {
  const result = approveAiSuggestion({
    context: tenantA,
    suggestion: reviewSuggestion,
    transactionId: "transaction-from-ai",
    now,
    account: accountA,
    category: categoryA,
  });

  assertEqual(result.suggestion.status, "approved", "suggestion approved");
  assertEqual(result.suggestion.targetEntityId, "transaction-from-ai", "target transaction linked");
  assertEqual(result.transactionResult.transaction.source, "ai_suggestion", "transaction source");
  assertEqual(
    result.transactionResult.transaction.aiSuggestionId,
    reviewSuggestion.suggestion.id,
    "transaction links suggestion",
  );
  assertEqual(result.transactionResult.auditEntry.action, "create", "transaction audit action");
  assertEqual(result.transactionResult.auditEntry.redactedChanges?.aiSuggestionId, "added", "audit redacts link");
  assertEqual(result.auditEntries[0]?.action, "approve", "suggestion audit action");
}

function testRejectSuggestionIsAudited(): void {
  const result = rejectAiSuggestion({
    context: tenantA,
    suggestion: reviewSuggestion,
    now,
    reason: "Duplicada com lancamento importado.",
  });

  assertEqual(result.suggestion.status, "rejected", "suggestion rejected");
  assertEqual(result.auditEntry.action, "reject", "reject audit action");
  assertEqual(result.auditEntry.reason, "Duplicada com lancamento importado.", "reject reason");
}

function testAdjustSuggestionIsAudited(): void {
  const result = adjustAiSuggestion({
    context: tenantA,
    suggestion: reviewSuggestion,
    now,
    payload: {
      amountMinor: 6789,
      categoryId: "category-review-a",
      description: "Compra ajustada",
    },
  });

  assertEqual(result.suggestion.status, "edited", "suggestion edited");
  assertEqual(result.reviewItem?.proposedTransaction.amountMinor, 6789, "adjusted amount");
  assertEqual(result.reviewItem?.proposedTransaction.description, "Compra ajustada", "adjusted description");
  assertEqual(result.auditEntry.action, "update", "adjust audit action");
  assertEqual(result.auditEntry.redactedChanges?.amountMinor, "changed", "amount redacted change");
  assertEqual(result.auditEntry.redactedChanges?.description, "changed", "description redacted change");
}

function testTenantIsolation(): void {
  assertTenantError(() =>
    approveAiSuggestion({
      context: tenantB,
      suggestion: reviewSuggestion,
      transactionId: "transaction-forbidden",
      now,
      account: accountA,
      category: categoryA,
    }),
  );
}

function buildReviewSuggestion(
  context: TenantContext,
  id: string,
  confidence: number,
  status: AiSuggestion["status"] = "pending_review",
): ReviewableAiSuggestion {
  const suggestion: AiSuggestion = {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    kind: "transaction_extraction",
    status,
    confidence,
    explanation: "Merchant recorrente identificado.",
    provider: "mock-provider",
    model: "mock-model",
    createdAt: "2026-06-16T14:00:00.000Z",
    updatedAt: "2026-06-16T14:00:00.000Z",
    createdByUserId: "system-ai",
    updatedByUserId: "system-ai",
  };

  return {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    suggestion,
    origin: "ai",
    maskedSummary: "Compra em MERCADO *** no cartao final 1234",
    proposedTransaction: {
      kind: "expense",
      amountMinor: 4590,
      occurredOn: "2026-06-16",
      accountId: accountA.id,
      categoryId: categoryA.id,
      description: "Compra em MERCADO ***",
      currency: "BRL",
    },
    createdAt: suggestion.createdAt,
  };
}

function buildAccount(context: TenantContext, id: string): Account {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    name: "Conta Corrente",
    kind: "checking",
    status: "active",
    currency: "BRL",
    openingBalanceMinor: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function buildCategory(context: TenantContext, id: string): Category {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    name: "Mercado",
    kind: "expense",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

function assertTenantError(action: () => void): void {
  try {
    action();
  } catch (error) {
    if (error instanceof TenantAuthorizationError) {
      return;
    }

    throw error;
  }

  throw new Error("Expected tenant authorization error.");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
