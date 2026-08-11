import assert from "node:assert/strict";

import type { TenantContext } from "./tenant.js";
import {
  detectDuplicateTransactions,
  type DeduplicationCandidate,
} from "./deduplication.js";

const context: TenantContext = {
  userId: "user-dedup-currency",
  organizationId: "org-dedup-currency",
  financialProfileId: "profile-dedup-currency",
  financialProfileKind: "personal",
};
const now = "2026-08-11T11:00:00.000Z";

const candidate: DeduplicationCandidate = {
  id: "candidate-brl",
  organizationId: context.organizationId,
  financialProfileId: context.financialProfileId,
  candidateKind: "transaction",
  sourceKind: "import",
  kind: "expense",
  amountMinor: 10000,
  currency: "BRL",
  occurredOn: "2026-08-11",
  description: "Compra internacional",
  accountId: "account-a",
};

const differentCurrency: DeduplicationCandidate = {
  ...candidate,
  id: "existing-usd",
  sourceKind: "manual",
  currency: "USD",
};

assert.equal(
  detectDuplicateTransactions({
    context,
    now,
    candidate,
    existingCandidates: [differentCurrency],
  }).length,
  0,
  "movimentacoes em moedas diferentes nao podem ser candidatas a duplicidade",
);

const sameCurrencyDifferentCase: DeduplicationCandidate = {
  ...candidate,
  id: "existing-brl-lowercase",
  sourceKind: "manual",
  currency: "brl",
};

assert.equal(
  detectDuplicateTransactions({
    context,
    now,
    candidate,
    existingCandidates: [sameCurrencyDifferentCase],
  }).length,
  1,
  "a comparacao de moeda deve ser case-insensitive sem enfraquecer o matching",
);
