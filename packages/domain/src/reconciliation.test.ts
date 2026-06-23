import type { Transaction } from "./index.js";
import type { TenantContext } from "./tenant.js";
import { TenantAuthorizationError } from "./tenant-authorization.js";
import {
  type ReconciliationLink,
  type ReconciliationSource,
  ReconciliationError,
  previewReconciliation,
  reconcileTransaction,
  undoReconciliation,
} from "./reconciliation.js";

const tenantA: TenantContext = {
  userId: "user-reconciliation-a",
  organizationId: "org-reconciliation-a",
  financialProfileId: "profile-reconciliation-a",
  financialProfileKind: "personal",
};

const tenantB: TenantContext = {
  userId: "user-reconciliation-b",
  organizationId: "org-reconciliation-b",
  financialProfileId: "profile-reconciliation-b",
  financialProfileKind: "business",
};

const now = "2026-06-16T13:00:00.000Z";
const later = "2026-06-16T14:00:00.000Z";

testReadyPreviewAndReconciliation();
testRejectsConflictsWithoutReviewApproval();
testUndoReconciliation();
testRejectsAlreadyReconciledTransaction();
testTenantIsolation();

function testReadyPreviewAndReconciliation(): void {
  const transaction = buildTransaction("tx-reconcile-ready", tenantA);
  const source = buildSource(tenantA);

  const preview = previewReconciliation({
    context: tenantA,
    source,
    transaction,
  });

  assertEqual(preview.status, "ready", "ready preview status");
  assertEqual(preview.conflicts.length, 0, "ready preview conflict count");

  const result = reconcileTransaction({
    context: tenantA,
    linkId: "reconciliation-link-1",
    source,
    transaction,
    now,
  });

  assertEqual(result.transaction.status, "reconciled", "transaction status after reconciliation");
  assertEqual(result.transaction.reconciledAt, now, "transaction reconciliation timestamp");
  assertEqual(result.link.status, "active", "link status after reconciliation");
  assertEqual(result.link.sourceKind, source.entityKind, "link source kind");
  assertEqual(result.link.sourceEntityId, source.entityId, "link source id");
  assertEqual(result.movements.length, 1, "reconciled movement count");
  assertEqual(result.movements[0]?.direction, "debit", "reconciled movement direction");
  assertAuditEntity(result.auditEntries, "reconciliation_link");
  assertAuditEntity(result.auditEntries, "transaction");
}

function testRejectsConflictsWithoutReviewApproval(): void {
  const transaction = buildTransaction("tx-reconcile-conflict", tenantA);
  const source = buildSource(tenantA, {
    amountMinor: 5500,
    occurredOn: "2026-06-20",
    kind: "income",
    accountId: "account-b",
    categoryId: "category-other",
  });

  const preview = previewReconciliation({
    context: tenantA,
    source,
    transaction,
    dateToleranceDays: 1,
  });

  assertEqual(preview.status, "conflict", "conflict preview status");
  assertConflict(preview.conflicts, "RECONCILIATION_AMOUNT_CONFLICT");
  assertConflict(preview.conflicts, "RECONCILIATION_DATE_CONFLICT");
  assertConflict(preview.conflicts, "RECONCILIATION_ACCOUNT_CONFLICT");
  assertConflict(preview.conflicts, "RECONCILIATION_CATEGORY_CONFLICT");
  assertConflict(preview.conflicts, "RECONCILIATION_KIND_CONFLICT");

  assertThrowsReconciliationError(
    () =>
      reconcileTransaction({
        context: tenantA,
        linkId: "reconciliation-link-conflict",
        source,
        transaction,
        now,
        dateToleranceDays: 1,
      }),
    "RECONCILIATION_CONFLICT_REQUIRES_REVIEW",
    "conflict reconciliation rejection",
  );
}

function testUndoReconciliation(): void {
  const transaction = buildTransaction("tx-reconcile-undo", tenantA);
  const source = buildSource(tenantA, { entityId: "source-undo" });
  const reconciled = reconcileTransaction({
    context: tenantA,
    linkId: "reconciliation-link-undo",
    source,
    transaction,
    now,
  });

  const undone = undoReconciliation({
    context: tenantA,
    link: reconciled.link,
    transaction: reconciled.transaction,
    now: later,
  });

  assertEqual(undone.transaction.status, "posted", "transaction status after undo");
  assertEqual(
    undone.transaction.reconciledAt,
    undefined,
    "transaction reconciliation timestamp removed",
  );
  assertEqual(undone.link.status, "undone", "link status after undo");
  assertEqual(undone.link.undoneAt, later, "link undo timestamp");
  assertEqual(undone.movements.length, 1, "undo movement count");
  assertAuditEntity(undone.auditEntries, "reconciliation_link");
  assertAuditEntity(undone.auditEntries, "transaction");

  assertThrowsReconciliationError(
    () =>
      undoReconciliation({
        context: tenantA,
        link: undone.link,
        transaction: undone.transaction,
        now: later,
      }),
    "RECONCILIATION_LINK_ALREADY_UNDONE",
    "second undo rejection",
  );
}

function testRejectsAlreadyReconciledTransaction(): void {
  const transaction = buildTransaction("tx-already-reconciled", tenantA, {
    status: "reconciled",
    reconciledAt: now,
  });
  const source = buildSource(tenantA, { entityId: "source-already-reconciled" });

  assertThrowsReconciliationError(
    () =>
      reconcileTransaction({
        context: tenantA,
        linkId: "reconciliation-link-already",
        source,
        transaction,
        now,
      }),
    "RECONCILIATION_TRANSACTION_ALREADY_RECONCILED",
    "already reconciled transaction rejection",
  );
}

function testTenantIsolation(): void {
  const source = buildSource(tenantA);
  const transaction = buildTransaction("tx-other-tenant", tenantB);

  try {
    previewReconciliation({
      context: tenantA,
      source,
      transaction,
    });
  } catch (error) {
    if (error instanceof TenantAuthorizationError) {
      assertEqual(error.code, "TENANT_RESOURCE_NOT_FOUND", "tenant isolation error code");
      return;
    }

    throw error;
  }

  throw new Error("Expected tenant isolation to reject a transaction from another profile.");
}

function buildTransaction(
  id: string,
  context: TenantContext,
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    kind: "expense",
    status: "posted",
    source: "manual",
    amountMinor: 4250,
    currency: "BRL",
    occurredOn: "2026-06-12",
    plannedOn: "2026-06-12",
    description: "Compra Mercado Demo",
    accountId: "account-a",
    categoryId: "category-food",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildSource(
  context: TenantContext,
  overrides: Partial<ReconciliationSource> = {},
): ReconciliationSource {
  return {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    entityKind: "payable_receivable",
    entityId: "source-payable-1",
    amountMinor: 4250,
    currency: "BRL",
    occurredOn: "2026-06-12",
    kind: "expense",
    accountId: "account-a",
    categoryId: "category-food",
    ...overrides,
  };
}

function assertAuditEntity(
  entries: readonly { entityKind: string }[],
  entityKind: ReconciliationLink["sourceKind"] | "reconciliation_link" | "transaction",
): void {
  if (!entries.some((entry) => entry.entityKind === entityKind)) {
    throw new Error(`Expected audit entity ${entityKind}.`);
  }
}

function assertConflict(conflicts: readonly { code: string }[], code: string): void {
  if (!conflicts.some((conflict) => conflict.code === code)) {
    throw new Error(`Expected reconciliation conflict ${code}.`);
  }
}

function assertThrowsReconciliationError(
  action: () => void,
  code: ReconciliationError["code"],
  message: string,
): void {
  try {
    action();
  } catch (error) {
    if (error instanceof ReconciliationError) {
      assertEqual(error.code, code, message);
      return;
    }

    throw error;
  }

  throw new Error(`Expected ${message} to throw ${code}.`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
