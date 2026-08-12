import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createAiProviderFromEnvironment } from "@solverfin/ai";
import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import {
  getConversationById,
  startFinancialAssistantConversation,
} from "./financial-assistant-repository.js";
import { sendFinancialAssistantMessage } from "./financial-assistant-service.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
const PROFILE_ID = "33333333-3333-4333-8333-333333333331";

const context: TenantContext = {
  userId: USER_ID,
  organizationId: ORGANIZATION_ID,
  financialProfileId: PROFILE_ID,
  financialProfileKind: "personal",
};

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");
  await cleanup();
  try {
    await clarificationPeriodContinuesPendingQuestion();
    await expiryWinsBeforeLateAnswerIsPersisted();
  } finally {
    await cleanup();
  }
}

async function clarificationPeriodContinuesPendingQuestion(): Promise<void> {
  const startedAt = new Date("2026-08-11T12:00:00Z");
  const view = await startFinancialAssistantConversation(context, startedAt);
  const disabledProvider = () => createAiProviderFromEnvironment({ AI_PROVIDER: "disabled" });

  const first = await sendFinancialAssistantMessage({
    context,
    conversationId: view.conversation.id,
    question: "Qual meu saldo projetado?",
    idempotencyKey: `test-${randomUUID()}`,
    runtime: {
      selectProvider: disabledProvider,
      resolveConsent: () => "missing",
      now: () => new Date("2026-08-11T12:00:01Z"),
    },
  });
  assert.equal(first.conversation.status, "AWAITING_CLARIFICATION");
  assert.equal(first.conversation.pendingQuestion, "Qual meu saldo projetado?");

  const answered = await sendFinancialAssistantMessage({
    context,
    conversationId: view.conversation.id,
    question: "este mes",
    idempotencyKey: `test-${randomUUID()}`,
    runtime: {
      selectProvider: disabledProvider,
      resolveConsent: () => "missing",
      now: () => new Date("2026-08-11T12:00:02Z"),
    },
  });
  const lastTurn = answered.turns.at(-1);
  assert.equal(answered.conversation.status, "ANSWERED");
  assert.equal(lastTurn?.normalizedQuestion, "este mes");
  assert.equal(lastTurn?.intent, "balance_projection");
  assert.equal(lastTurn?.safeResponse?.intent, "balance_projection");
  assert.equal(lastTurn?.safeResponse?.period?.startOn, "2026-08-01");
  assert.equal(lastTurn?.safeResponse?.period?.endOn, "2026-08-31");
}

async function expiryWinsBeforeLateAnswerIsPersisted(): Promise<void> {
  await cleanup();
  const startedAt = new Date("2026-08-11T13:00:00Z");
  const view = await startFinancialAssistantConversation(context, startedAt);
  const expiresAt = new Date("2026-08-11T13:05:00Z");
  await query(
    `update "FinancialAssistantConversation" set "expiresAt" = $2 where "id" = $1`,
    [view.conversation.id, expiresAt],
  );

  const times = [
    new Date("2026-08-11T13:04:50Z"),
    new Date("2026-08-11T13:04:51Z"),
    new Date("2026-08-11T13:05:01Z"),
    new Date("2026-08-11T13:05:01Z"),
  ];
  let timeIndex = 0;
  const result = await sendFinancialAssistantMessage({
    context,
    conversationId: view.conversation.id,
    question: "Qual meu saldo projetado este mes?",
    idempotencyKey: `test-${randomUUID()}`,
    runtime: {
      selectProvider: () => createAiProviderFromEnvironment({ AI_PROVIDER: "disabled" }),
      resolveConsent: () => "missing",
      now: () => times[Math.min(timeIndex++, times.length - 1)] ?? times[times.length - 1]!,
    },
  });

  const terminal = await getConversationById(context, view.conversation.id, true);
  const lastTurn = terminal?.turns.at(-1);
  assert.equal(result.conversation.status, "EXPIRED");
  assert.equal(terminal?.conversation.status, "EXPIRED");
  assert.equal(lastTurn?.status, "EXPIRED");
  assert.equal(lastTurn?.safeResponse, null);
  assert.equal(lastTurn?.failureCode, "ASSISTANT_CONTEXT_CHANGED");
}

async function cleanup(): Promise<void> {
  await query(
    `delete from "FinancialAssistantTurn" where "organizationId" = $1 and "financialProfileId" = $2 and "userId" = $3`,
    [ORGANIZATION_ID, PROFILE_ID, USER_ID],
  );
  await query(
    `delete from "FinancialAssistantConversation" where "organizationId" = $1 and "financialProfileId" = $2 and "userId" = $3`,
    [ORGANIZATION_ID, PROFILE_ID, USER_ID],
  );
}
