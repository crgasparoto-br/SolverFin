import assert from "node:assert/strict";

import type { FinancialAssistantConversationView } from "./financial-assistant-repository.js";
import { presentFinancialAssistantConversation } from "./financial-assistant-router.js";

const now = new Date("2026-08-11T12:00:00.000Z");
const view: FinancialAssistantConversationView = {
  conversation: {
    id: "conversation-public",
    organizationId: "org-secret",
    financialProfileId: "profile-secret",
    userId: "user-secret",
    status: "ANSWERED",
    version: 3,
    currency: "BRL",
    pendingIntent: null,
    pendingQuestion: null,
    pendingFilters: {},
    expiresAt: new Date("2026-08-11T14:00:00.000Z"),
    createdAt: now,
    updatedAt: now,
  },
  turns: [
    {
      id: "turn-secret",
      conversationId: "conversation-public",
      organizationId: "org-secret",
      financialProfileId: "profile-secret",
      userId: "user-secret",
      sequence: 1,
      conversationVersion: 3,
      idempotencyKey: "idempotency-secret",
      status: "ANSWERED",
      normalizedQuestion: "quanto gastei com alimentacao este mes",
      intent: "category_spending",
      filters: {
        currency: "BRL",
        periodStartOn: "2026-08-01",
        periodEndOn: "2026-08-31",
        categoryId: "category-secret",
        categoryName: "Alimentacao",
      },
      evidence: {
        currency: "BRL",
        period: { startOn: "2026-08-01", endOn: "2026-08-31" },
        filters: ["Categoria: Alimentacao"],
        metrics: [],
        assumptions: [],
        limitations: [],
        sources: ["lancamentos"],
        confidence: "high",
      },
      safeResponse: {
        status: "answered",
        intent: "category_spending",
        confidence: "high",
        answer: "Resposta segura.",
        assumptions: [],
        sources: ["lancamentos"],
        limitations: [],
        safeLogCode: "ASSISTANT_DETERMINISTIC_ANSWERED",
      },
      failureCode: null,
      createdAt: now,
      answeredAt: now,
    },
  ],
};

const presented = presentFinancialAssistantConversation(view);
const serialized = JSON.stringify(presented);
const firstTurn = presented.turns[0];

assert.equal(firstTurn?.filters.categoryName, "Alimentacao");
assert.equal("categoryId" in (firstTurn?.filters ?? {}), false);
assert.equal("evidence" in (firstTurn ?? {}), false);
assert.equal("idempotencyKey" in (firstTurn ?? {}), false);
assert.equal("safeLogCode" in (firstTurn?.response ?? {}), false);
assert.equal("version" in presented, false);
assert.doesNotMatch(serialized, /ASSISTANT_DETERMINISTIC_ANSWERED/);
for (const secret of [
  "org-secret",
  "profile-secret",
  "user-secret",
  "turn-secret",
  "idempotency-secret",
  "category-secret",
]) {
  assert.doesNotMatch(serialized, new RegExp(secret));
}
