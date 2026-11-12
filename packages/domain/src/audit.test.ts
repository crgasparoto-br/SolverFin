import {
  buildRedactedTransactionChanges,
  buildTransactionAuditEntry,
  type Transaction,
} from "./index.js";

const baseTransaction: Transaction = {
  id: "tx-demo-1",
  organizationId: "org-demo-1",
  financialProfileId: "profile-demo-1",
  kind: "expense",
  status: "posted",
  source: "manual",
  amountMinor: 12990,
  currency: "BRL",
  occurredOn: "2026-06-15",
  plannedOn: "2026-06-15",
  description: "Compra ficticia de teste",
  accountId: "account-demo-1",
  categoryId: "category-demo-1",
  createdAt: "2026-06-15T10:00:00.000Z",
  updatedAt: "2026-06-15T10:00:00.000Z",
  createdByUserId: "user-demo-1",
  updatedByUserId: "user-demo-1",
};

testCreateAudit();
testUpdateAudit();
testSoftDeleteAudit();
testTenantIsolation();
testSensitivePayloadIsNotStored();

function testCreateAudit(): void {
  const audit = buildTransactionAuditEntry({
    action: "create",
    actorKind: "user",
    actorId: "user-demo-1",
    after: baseTransaction,
    occurredAt: "2026-06-15T10:00:01.000Z",
    correlationId: "request-demo-1",
  });

  assertEqual(audit.entityKind, "transaction", "create audit should target transactions");
  assertEqual(
    audit.entityId,
    baseTransaction.id,
    "create audit should reference the transaction id",
  );
  assertEqual(
    audit.organizationId,
    baseTransaction.organizationId,
    "create audit should keep organization scope",
  );
  assertEqual(
    audit.financialProfileId,
    baseTransaction.financialProfileId,
    "create audit should keep financial profile scope",
  );
  assertEqual(
    audit.redactedChanges?.amountMinor,
    "added",
    "create audit should mark amount as added",
  );
  assertEqual(
    audit.redactedChanges?.description,
    "added",
    "create audit should mark description as added",
  );
}

function testUpdateAudit(): void {
  const updatedTransaction: Transaction = {
    ...baseTransaction,
    amountMinor: 15990,
    categoryId: "category-demo-2",
    status: "reconciled",
    reconciledAt: "2026-06-15T11:00:00.000Z",
    updatedAt: "2026-06-15T11:00:00.000Z",
  };

  const changes = buildRedactedTransactionChanges(baseTransaction, updatedTransaction);

  assertEqual(changes?.amountMinor, "changed", "update audit should mark amount changes");
  assertEqual(changes?.categoryId, "changed", "update audit should mark category changes");
  assertEqual(changes?.status, "changed", "update audit should mark status changes");
  assertEqual(
    changes?.reconciledAt,
    "added",
    "update audit should mark reconciliation date as added",
  );
}

function testSoftDeleteAudit(): void {
  const voidedTransaction: Transaction = {
    ...baseTransaction,
    status: "voided",
    voidedAt: "2026-06-15T12:00:00.000Z",
    updatedAt: "2026-06-15T12:00:00.000Z",
  };

  const audit = buildTransactionAuditEntry({
    action: "soft_delete",
    actorKind: "user",
    actorId: "user-demo-1",
    before: baseTransaction,
    after: voidedTransaction,
    occurredAt: "2026-06-15T12:00:01.000Z",
    reason: "Teste ficticio de exclusao logica",
  });

  assertEqual(
    audit.redactedChanges?.status,
    "changed",
    "soft delete audit should mark status changes",
  );
  assertEqual(
    audit.redactedChanges?.voidedAt,
    "added",
    "soft delete audit should mark voided timestamp",
  );
}

function testTenantIsolation(): void {
  const otherTenantTransaction: Transaction = {
    ...baseTransaction,
    organizationId: "org-demo-2",
  };

  assertThrows(
    () =>
      buildTransactionAuditEntry({
        action: "update",
        actorKind: "user",
        before: baseTransaction,
        after: otherTenantTransaction,
        occurredAt: "2026-06-15T13:00:00.000Z",
      }),
    "same tenant",
  );
}

function testSensitivePayloadIsNotStored(): void {
  const updatedTransaction: Transaction = {
    ...baseTransaction,
    amountMinor: 999999,
    description: "Texto financeiro ficticio que nao deve aparecer na auditoria",
    updatedAt: "2026-06-15T14:00:00.000Z",
  };

  const audit = buildTransactionAuditEntry({
    action: "update",
    actorKind: "system",
    before: baseTransaction,
    after: updatedTransaction,
    occurredAt: "2026-06-15T14:00:01.000Z",
    correlationId: "job-demo-1",
  });

  const serializedChanges = JSON.stringify(audit.redactedChanges);

  assertEqual(
    audit.redactedChanges?.amountMinor,
    "changed",
    "audit should mark amount without the value",
  );
  assertEqual(
    audit.redactedChanges?.description,
    "changed",
    "audit should mark description without text",
  );
  assert(!serializedChanges.includes("999999"), "audit must not store raw amount values");
  assert(!serializedChanges.includes("Texto financeiro"), "audit must not store raw descriptions");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrows(action: () => void, expectedMessagePart: string): void {
  try {
    action();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessagePart)) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected action to throw an error containing "${expectedMessagePart}".`);
}
