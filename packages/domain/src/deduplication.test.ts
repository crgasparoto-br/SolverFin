import type { BankMessageInboxItem } from "./bank-message-inbox.js";
import type { ImportTransactionSuggestion } from "./imports.js";
import type { TenantContext } from "./tenant.js";
import type { Transaction } from "./index.js";
import {
  buildBankMessageDeduplicationCandidate,
  buildDeduplicationAuditEntry,
  buildImportSuggestionDeduplicationCandidate,
  buildTransactionDeduplicationCandidate,
  detectDuplicateTransactions,
} from "./deduplication.js";

const tenantA: TenantContext = {
  userId: "user-dedup-a",
  organizationId: "org-dedup-a",
  financialProfileId: "profile-dedup-a",
  financialProfileKind: "personal",
};

const tenantB: TenantContext = {
  userId: "user-dedup-b",
  organizationId: "org-dedup-b",
  financialProfileId: "profile-dedup-b",
  financialProfileKind: "business",
};

const now = "2026-06-16T13:00:00.000Z";

testClearDuplicate();
testFalsePositiveBelowThreshold();
testTenantIsolation();
testImportSuggestionDuplicate();
testBankMessageCandidate();
testAuditEntry();

function testClearDuplicate(): void {
  const candidate = buildTransactionDeduplicationCandidate(
    buildTransaction("tx-imported", tenantA, {
      source: "import",
      amountMinor: 4250,
      occurredOn: "2026-06-12",
      description: "Mercado Demo Centro",
      accountId: "account-a",
    }),
  );
  const existing = buildTransactionDeduplicationCandidate(
    buildTransaction("tx-manual", tenantA, {
      source: "manual",
      amountMinor: 4250,
      occurredOn: "2026-06-11",
      description: "Compra Mercado Demo Centro",
      accountId: "account-a",
    }),
  );

  const reviews = detectDuplicateTransactions({
    context: tenantA,
    now,
    candidate,
    existingCandidates: [existing],
  });

  assertEqual(reviews.length, 1, "clear duplicate review count");
  assertEqual(reviews[0]?.status, "needs_review", "clear duplicate status");
  assertEqual(reviews[0]?.possibleDuplicateId, existing.id, "clear duplicate target");
  assertEqual((reviews[0]?.score ?? 0) >= 70, true, "clear duplicate score");
  assertReason(reviews[0]?.reasons ?? [], "DEDUP_SAME_AMOUNT");
  assertReason(reviews[0]?.reasons ?? [], "DEDUP_CLOSE_DATE");
  assertReason(reviews[0]?.reasons ?? [], "DEDUP_SAME_ACCOUNT");
  assertReason(reviews[0]?.reasons ?? [], "DEDUP_SIMILAR_DESCRIPTION");
}

function testFalsePositiveBelowThreshold(): void {
  const candidate = buildTransactionDeduplicationCandidate(
    buildTransaction("tx-coffee", tenantA, {
      source: "manual",
      amountMinor: 1990,
      occurredOn: "2026-06-12",
      description: "Cafeteria Demo",
      accountId: "account-a",
    }),
  );
  const existing = buildTransactionDeduplicationCandidate(
    buildTransaction("tx-parking", tenantA, {
      source: "manual",
      amountMinor: 1990,
      occurredOn: "2026-06-12",
      description: "Estacionamento Demo",
      accountId: "account-b",
    }),
  );

  const reviews = detectDuplicateTransactions({
    context: tenantA,
    now,
    candidate,
    existingCandidates: [existing],
  });

  assertEqual(reviews.length, 0, "false positive ignored");
}

function testTenantIsolation(): void {
  const candidate = buildTransactionDeduplicationCandidate(
    buildTransaction("tx-tenant-a", tenantA, {
      source: "import",
      amountMinor: 10000,
      occurredOn: "2026-06-12",
      description: "Cliente Demo",
      accountId: "account-a",
    }),
  );
  const otherTenant = buildTransactionDeduplicationCandidate(
    buildTransaction("tx-tenant-b", tenantB, {
      source: "manual",
      amountMinor: 10000,
      occurredOn: "2026-06-12",
      description: "Cliente Demo",
      accountId: "account-a",
    }),
  );

  const reviews = detectDuplicateTransactions({
    context: tenantA,
    now,
    candidate,
    existingCandidates: [otherTenant],
  });

  assertEqual(reviews.length, 0, "tenant isolation review count");
}

function testImportSuggestionDuplicate(): void {
  const suggestion: ImportTransactionSuggestion = {
    id: "import-suggestion-1",
    organizationId: tenantA.organizationId,
    financialProfileId: tenantA.financialProfileId,
    status: "pending_review",
    sourceKind: "csv",
    sourceHash: "hash-import-1",
    sourceRowNumber: 2,
    occurredOn: "2026-06-12",
    description: "Compra Mercado Demo",
    kind: "expense",
    amountMinor: 4250,
    currency: "BRL",
    accountId: "account-a",
  };
  const existing = buildTransactionDeduplicationCandidate(
    buildTransaction("tx-existing-import", tenantA, {
      source: "manual",
      amountMinor: 4250,
      occurredOn: "2026-06-12",
      description: "Mercado Demo",
      accountId: "account-a",
    }),
  );

  const reviews = detectDuplicateTransactions({
    context: tenantA,
    now,
    candidate: buildImportSuggestionDeduplicationCandidate(suggestion),
    existingCandidates: [existing],
  });

  assertEqual(reviews.length, 1, "import suggestion duplicate count");
  assertEqual(reviews[0]?.candidateId, suggestion.id, "import suggestion candidate id");
}

function testBankMessageCandidate(): void {
  const item: BankMessageInboxItem = {
    id: "bank-message-1",
    organizationId: tenantA.organizationId,
    financialProfileId: tenantA.financialProfileId,
    origin: "pasted",
    status: "pending",
    rawText: "Banco Demo compra 42,50 Mercado Demo",
    maskedText: "Banco Demo compra 42,50 Mercado Demo",
    sourceHash: "hash-bank-message-1",
    receivedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const candidate = buildBankMessageDeduplicationCandidate({
    id: "bank-message-candidate-1",
    organizationId: tenantA.organizationId,
    financialProfileId: tenantA.financialProfileId,
    item,
    occurredOn: "2026-06-12",
    amountMinor: 4250,
    kind: "expense",
    accountId: "account-a",
  });

  assertEqual(candidate.sourceKind, "bank_message", "bank message source kind");
  assertEqual(candidate.sourceHash, item.sourceHash, "bank message source hash");
}

function testAuditEntry(): void {
  const review = detectDuplicateTransactions({
    context: tenantA,
    now,
    candidate: buildTransactionDeduplicationCandidate(
      buildTransaction("tx-audit-new", tenantA, {
        source: "import",
        amountMinor: 5000,
        occurredOn: "2026-06-12",
        description: "Padaria Demo",
        accountId: "account-a",
      }),
    ),
    existingCandidates: [
      buildTransactionDeduplicationCandidate(
        buildTransaction("tx-audit-existing", tenantA, {
          source: "manual",
          amountMinor: 5000,
          occurredOn: "2026-06-12",
          description: "Padaria Demo",
          accountId: "account-a",
        }),
      ),
    ],
  })[0];

  if (review === undefined) {
    throw new Error("Expected audit review candidate.");
  }

  const auditEntry = buildDeduplicationAuditEntry(tenantA, review, now);
  assertEqual(auditEntry.entityKind, "deduplication_review", "audit entity kind");
  assertEqual(auditEntry.redactedChanges?.score, "added", "audit score redacted");
}

function buildTransaction(
  id: string,
  context: TenantContext,
  overrides: {
    source: Transaction["source"];
    amountMinor: number;
    occurredOn: Transaction["occurredOn"];
    description: string;
    accountId: string;
  },
): Transaction {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    kind: "expense",
    status: "posted",
    source: overrides.source,
    amountMinor: overrides.amountMinor,
    currency: "BRL",
    occurredOn: overrides.occurredOn,
    description: overrides.description,
    accountId: overrides.accountId,
    createdAt: now,
    updatedAt: now,
  };
}

function assertReason(reasons: readonly { code: string }[], code: string): void {
  if (!reasons.some((reason) => reason.code === code)) {
    throw new Error(`Expected deduplication reason ${code}.`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
