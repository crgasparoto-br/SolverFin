import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import {
  bindFinancialAssistantTurnResolution,
  cancelFinancialAssistantConversation,
  claimFinancialAssistantTurn,
  finalizeFinancialAssistantTurn,
  getConversationById,
  getFinancialAssistantConversationForContext,
  startFinancialAssistantConversation,
} from "./financial-assistant-repository.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
const PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const ALTERNATE_PROFILE_ID = "33333333-3333-4333-8333-333333333332";

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
    await idempotencyAndConcurrencyAreDurable();
    await cancellationWinsOverLateFinalization();
    await interruptedProcessingIsRecovered();
    await expiryAndTenantIsolationAreEnforced();
    await currencyChangeExpiresIncompatibleContext();
    await profileSwitchExpiresPreviousContext();
  } finally {
    await cleanup();
  }
}

async function idempotencyAndConcurrencyAreDurable(): Promise<void> {
  const view = await startFinancialAssistantConversation(context, new Date("2026-08-11T12:00:00Z"));
  const key = `test-${randomUUID()}`;
  const first = await claimFinancialAssistantTurn({
    context,
    conversationId: view.conversation.id,
    normalizedQuestion: "Resumo deste mes",
    idempotencyKey: key,
    intent: "monthly_summary",
    filters: {},
    now: new Date("2026-08-11T12:00:01Z"),
  });
  assert.equal(first.kind, "claimed");
  if (first.kind !== "claimed") assert.fail("expected claimed turn");

  const duplicate = await claimFinancialAssistantTurn({
    context,
    conversationId: view.conversation.id,
    normalizedQuestion: "Resumo deste mes",
    idempotencyKey: key,
    intent: "monthly_summary",
    filters: {},
    now: new Date("2026-08-11T12:00:02Z"),
  });
  assert.equal(duplicate.kind, "existing");
  assert.equal(duplicate.turn.id, first.turn.id);

  await assert.rejects(
    claimFinancialAssistantTurn({
      context,
      conversationId: view.conversation.id,
      normalizedQuestion: "Pergunta diferente",
      idempotencyKey: key,
      intent: "monthly_summary",
      filters: {},
      now: new Date("2026-08-11T12:00:02.500Z"),
    }),
    (error: unknown) => hasCode(error, "ASSISTANT_IDEMPOTENCY_CONFLICT"),
  );

  await assert.rejects(
    claimFinancialAssistantTurn({
      context,
      conversationId: view.conversation.id,
      normalizedQuestion: "Saldo projetado este mes",
      idempotencyKey: `test-${randomUUID()}`,
      intent: "balance_projection",
      filters: {},
      now: new Date("2026-08-11T12:00:03Z"),
    }),
    (error: unknown) => hasCode(error, "ASSISTANT_CONVERSATION_BUSY"),
  );

  const evidence = {
    currency: "BRL",
    period: { startOn: "2026-08-01", endOn: "2026-08-31" },
    filters: ["Moeda: BRL"],
    metrics: [{ key: "expense", label: "Despesas realizadas", amountMinor: 1000, count: 1 }],
    assumptions: [],
    limitations: [],
    sources: ["lancamentos"],
    confidence: "high" as const,
  };
  await bindFinancialAssistantTurnResolution({
    context,
    conversationId: view.conversation.id,
    turnId: first.turn.id,
    conversationVersion: first.turn.conversationVersion,
    intent: "monthly_summary",
    filters: { currency: "BRL" },
    currency: "BRL",
    evidence,
    now: new Date("2026-08-11T12:00:04Z"),
  });
  const finalized = await finalizeFinancialAssistantTurn({
    context,
    conversationId: view.conversation.id,
    turnId: first.turn.id,
    conversationVersion: first.turn.conversationVersion,
    status: "ANSWERED",
    evidence,
    safeResponse: {
      status: "answered",
      intent: "monthly_summary",
      confidence: "high",
      answer: "Resumo deterministico.",
      period: evidence.period,
      filters: evidence.filters,
      assumptions: [],
      sources: evidence.sources,
      limitations: [],
      safeLogCode: "ASSISTANT_DETERMINISTIC_ANSWERED",
    },
    now: new Date("2026-08-11T12:00:05Z"),
  });
  assert.equal(finalized.conversation.status, "ANSWERED");
  assert.equal(finalized.turns.length, 1);
  assert.equal(finalized.turns[0]?.safeResponse?.answer, "Resumo deterministico.");
}

async function cancellationWinsOverLateFinalization(): Promise<void> {
  await cleanup();
  const view = await startFinancialAssistantConversation(context, new Date("2026-08-11T13:00:00Z"));
  const claim = await claimFinancialAssistantTurn({
    context,
    conversationId: view.conversation.id,
    normalizedQuestion: "Resumo deste mes",
    idempotencyKey: `test-${randomUUID()}`,
    intent: "monthly_summary",
    filters: {},
    now: new Date("2026-08-11T13:00:01Z"),
  });
  assert.equal(claim.kind, "claimed");
  if (claim.kind !== "claimed") assert.fail("expected claimed turn");
  const cancelled = await cancelFinancialAssistantConversation(
    context,
    view.conversation.id,
    new Date("2026-08-11T13:00:02Z"),
  );
  assert.equal(cancelled.conversation.status, "CANCELLED");

  const late = await finalizeFinancialAssistantTurn({
    context,
    conversationId: view.conversation.id,
    turnId: claim.turn.id,
    conversationVersion: claim.turn.conversationVersion,
    status: "ANSWERED",
    safeResponse: {
      status: "answered",
      intent: "monthly_summary",
      confidence: "high",
      answer: "late result",
      assumptions: [],
      sources: [],
      limitations: [],
      safeLogCode: "LATE",
    },
    now: new Date("2026-08-11T13:00:03Z"),
  });
  assert.equal(late.conversation.status, "CANCELLED");
  assert.equal(late.turns[0]?.status, "CANCELLED");
  assert.notEqual(late.turns[0]?.safeResponse?.answer, "late result");
}

async function interruptedProcessingIsRecovered(): Promise<void> {
  await cleanup();
  const view = await startFinancialAssistantConversation(context, new Date());
  const claim = await claimFinancialAssistantTurn({
    context,
    conversationId: view.conversation.id,
    normalizedQuestion: "Saldo projetado este mes",
    idempotencyKey: `test-${randomUUID()}`,
    intent: "balance_projection",
    filters: {},
  });
  assert.equal(claim.kind, "claimed");
  await query(
    `update "FinancialAssistantConversation" set "updatedAt" = now() - interval '3 minutes' where "id" = $1`,
    [view.conversation.id],
  );
  const recovered = await getFinancialAssistantConversationForContext(context, new Date());
  assert.equal(recovered?.conversation.status, "FAILED");
  assert.equal(recovered?.turns[0]?.failureCode, "ASSISTANT_PROCESS_INTERRUPTED");
}

async function expiryAndTenantIsolationAreEnforced(): Promise<void> {
  await cleanup();
  const view = await startFinancialAssistantConversation(context, new Date());
  const foreignContext: TenantContext = { ...context, userId: randomUUID() };
  assert.equal(await getConversationById(foreignContext, view.conversation.id), undefined);
  await query(
    `update "FinancialAssistantConversation" set "expiresAt" = now() - interval '1 second' where "id" = $1`,
    [view.conversation.id],
  );
  assert.equal(await getFinancialAssistantConversationForContext(context, new Date()), undefined);
  const terminal = await getConversationById(context, view.conversation.id, true);
  assert.equal(terminal?.conversation.status, "EXPIRED");
}


async function currencyChangeExpiresIncompatibleContext(): Promise<void> {
  await cleanup();
  const view = await startFinancialAssistantConversation(context, new Date("2026-08-11T14:00:00Z"));
  const first = await claimFinancialAssistantTurn({
    context,
    conversationId: view.conversation.id,
    normalizedQuestion: "Resumo deste mes",
    idempotencyKey: `test-${randomUUID()}`,
    intent: "monthly_summary",
    filters: {},
    now: new Date("2026-08-11T14:00:01Z"),
  });
  assert.equal(first.kind, "claimed");
  if (first.kind !== "claimed") assert.fail("expected claimed turn");

  const brlEvidence = {
    currency: "BRL",
    period: { startOn: "2026-08-01", endOn: "2026-08-31" },
    filters: ["Moeda: BRL"],
    metrics: [{ key: "expense", label: "Despesas realizadas", amountMinor: 1000, count: 1 }],
    assumptions: [],
    limitations: [],
    sources: ["lancamentos"],
    confidence: "high" as const,
  };
  await bindFinancialAssistantTurnResolution({
    context,
    conversationId: view.conversation.id,
    turnId: first.turn.id,
    conversationVersion: first.turn.conversationVersion,
    intent: "monthly_summary",
    filters: { currency: "BRL" },
    currency: "BRL",
    evidence: brlEvidence,
    now: new Date("2026-08-11T14:00:02Z"),
  });
  await finalizeFinancialAssistantTurn({
    context,
    conversationId: view.conversation.id,
    turnId: first.turn.id,
    conversationVersion: first.turn.conversationVersion,
    status: "ANSWERED",
    evidence: brlEvidence,
    safeResponse: {
      status: "answered",
      intent: "monthly_summary",
      confidence: "high",
      answer: "Resumo BRL.",
      period: brlEvidence.period,
      filters: brlEvidence.filters,
      assumptions: [],
      sources: brlEvidence.sources,
      limitations: [],
      safeLogCode: "ASSISTANT_DETERMINISTIC_ANSWERED",
    },
    now: new Date("2026-08-11T14:00:03Z"),
  });

  const second = await claimFinancialAssistantTurn({
    context,
    conversationId: view.conversation.id,
    normalizedQuestion: "Resumo em dolares",
    idempotencyKey: `test-${randomUUID()}`,
    intent: "monthly_summary",
    filters: {},
    now: new Date("2026-08-11T14:00:04Z"),
  });
  assert.equal(second.kind, "claimed");
  if (second.kind !== "claimed") assert.fail("expected second claimed turn");

  const usdEvidence = { ...brlEvidence, currency: "USD", filters: ["Moeda: USD"] };
  await assert.rejects(
    bindFinancialAssistantTurnResolution({
      context,
      conversationId: view.conversation.id,
      turnId: second.turn.id,
      conversationVersion: second.turn.conversationVersion,
      intent: "monthly_summary",
      filters: { currency: "USD" },
      currency: "USD",
      evidence: usdEvidence,
      now: new Date("2026-08-11T14:00:05Z"),
    }),
    (error: unknown) => hasCode(error, "ASSISTANT_CONTEXT_CURRENCY_CHANGED"),
  );
  const terminal = await getConversationById(context, view.conversation.id, true);
  assert.equal(terminal?.conversation.status, "EXPIRED");
}

async function profileSwitchExpiresPreviousContext(): Promise<void> {
  await cleanup();
  const original = await startFinancialAssistantConversation(context, new Date());
  const alternateContext: TenantContext = {
    ...context,
    financialProfileId: ALTERNATE_PROFILE_ID,
    financialProfileKind: "mei",
  };
  await getFinancialAssistantConversationForContext(alternateContext, new Date());
  const terminal = await getConversationById(context, original.conversation.id, true);
  assert.equal(terminal?.conversation.status, "EXPIRED");
}

async function cleanup(): Promise<void> {
  await query(
    `delete from "FinancialAssistantTurn" where "organizationId" = $1 and "financialProfileId" = any($2::uuid[]) and "userId" = $3`,
    [ORGANIZATION_ID, [PROFILE_ID, ALTERNATE_PROFILE_ID], USER_ID],
  );
  await query(
    `delete from "FinancialAssistantConversation" where "organizationId" = $1 and "financialProfileId" = any($2::uuid[]) and "userId" = $3`,
    [ORGANIZATION_ID, [PROFILE_ID, ALTERNATE_PROFILE_ID], USER_ID],
  );
}

function hasCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
