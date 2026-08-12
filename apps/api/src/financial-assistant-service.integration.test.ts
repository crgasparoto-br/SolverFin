import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  classifyFinancialAssistantIntent,
  createAiProviderFromEnvironment,
  financialAssistantQuestionRequestsCategoryFilter,
} from "@solverfin/ai";
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
    mixedSummaryCategoryPhrasesKeepCategoryIntent();
    await clarificationPeriodContinuesPendingQuestion();
    await subscriptionsWithoutPeriodRequiresClarification();
    await subscriptionsRespectExplicitHistoricalPeriod();
    await expiryWinsBeforeLateAnswerIsPersisted();
  } finally {
    await cleanup();
  }
}

function mixedSummaryCategoryPhrasesKeepCategoryIntent(): void {
  for (const question of [
    "Quanto gastei com Alimentação no resumo mensal de 2026-08?",
    "Despesas mensais com Transporte em 2026-08",
    "Resumo mensal dos gastos com Moradia em 2026-08",
  ]) {
    assert.equal(classifyFinancialAssistantIntent(question), "category_spending", question);
  }
  assert.equal(
    classifyFinancialAssistantIntent("Resumo mensal de receitas e despesas em 2026-08"),
    "monthly_summary",
  );
  assert.equal(
    classifyFinancialAssistantIntent("Resumo mensal do que gastei em BRL"),
    "monthly_summary",
  );
  assert.equal(
    financialAssistantQuestionRequestsCategoryFilter("Despesas mensais com Categoria Inexistente"),
    true,
  );
  assert.equal(
    financialAssistantQuestionRequestsCategoryFilter("Resumo mensal do que gastei em BRL"),
    false,
  );
}

async function clarificationPeriodContinuesPendingQuestion(): Promise<void> {
  const startedAt = new Date("2026-08-11T12:00:00Z");
  const view = await startFinancialAssistantConversation(context, startedAt);
  const disabledProvider = () => createAiProviderFromEnvironment({ AI_PROVIDER: "disabled" });
  const question = "Quanto gastei com Alimentação no resumo mensal em BRL?";

  const first = await sendFinancialAssistantMessage({
    context,
    conversationId: view.conversation.id,
    question,
    idempotencyKey: `test-${randomUUID()}`,
    runtime: {
      selectProvider: disabledProvider,
      resolveConsent: () => "missing",
      now: () => new Date("2026-08-11T12:00:01Z"),
    },
  });
  assert.equal(first.conversation.status, "AWAITING_CLARIFICATION");
  assert.equal(first.conversation.pendingQuestion, question);
  assert.equal(first.turns.at(-1)?.intent, "category_spending");

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
  assert.equal(lastTurn?.intent, "category_spending");
  assert.equal(lastTurn?.filters.categoryName, "Alimentação");
  assert.equal(lastTurn?.safeResponse?.intent, "category_spending");
  assert.equal(lastTurn?.safeResponse?.period?.startOn, "2026-08-01");
  assert.equal(lastTurn?.safeResponse?.period?.endOn, "2026-08-31");
}

async function subscriptionsWithoutPeriodRequiresClarification(): Promise<void> {
  await cleanup();
  const startedAt = new Date("2026-08-11T12:30:00Z");
  const view = await startFinancialAssistantConversation(context, startedAt);
  const disabledProvider = () => createAiProviderFromEnvironment({ AI_PROVIDER: "disabled" });
  const question = "Tenho assinaturas recorrentes em BRL?";

  const first = await sendFinancialAssistantMessage({
    context,
    conversationId: view.conversation.id,
    question,
    idempotencyKey: `test-${randomUUID()}`,
    runtime: {
      selectProvider: disabledProvider,
      resolveConsent: () => "missing",
      now: () => new Date("2026-08-11T12:30:01Z"),
    },
  });
  const clarificationTurn = first.turns.at(-1);
  assert.equal(first.conversation.status, "AWAITING_CLARIFICATION");
  assert.equal(first.conversation.pendingQuestion, question);
  assert.equal(clarificationTurn?.intent, "subscriptions");
  assert.equal(clarificationTurn?.safeResponse?.intent, "subscriptions");
  assert.equal(clarificationTurn?.safeResponse?.safeLogCode, "ASSISTANT_CLARIFICATION_REQUIRED");
  assert.equal(clarificationTurn?.safeResponse?.period, undefined);

  const answered = await sendFinancialAssistantMessage({
    context,
    conversationId: view.conversation.id,
    question: "este mes",
    idempotencyKey: `test-${randomUUID()}`,
    runtime: {
      selectProvider: disabledProvider,
      resolveConsent: () => "missing",
      now: () => new Date("2026-08-11T12:30:02Z"),
    },
  });
  const lastTurn = answered.turns.at(-1);
  assert.equal(answered.conversation.status, "ANSWERED");
  assert.equal(lastTurn?.normalizedQuestion, "este mes");
  assert.equal(lastTurn?.intent, "subscriptions");
  assert.equal(lastTurn?.filters.periodStartOn, "2026-08-01");
  assert.equal(lastTurn?.filters.periodEndOn, "2026-08-31");
  assert.equal(lastTurn?.evidence?.period.startOn, "2026-08-01");
  assert.equal(lastTurn?.evidence?.period.endOn, "2026-08-31");
  assert.equal(lastTurn?.safeResponse?.intent, "subscriptions");
  assert.equal(lastTurn?.safeResponse?.period?.startOn, "2026-08-01");
  assert.equal(lastTurn?.safeResponse?.period?.endOn, "2026-08-31");
}

async function subscriptionsRespectExplicitHistoricalPeriod(): Promise<void> {
  await cleanup();
  const startedAt = new Date("2026-08-11T12:40:00Z");
  const view = await startFinancialAssistantConversation(context, startedAt);
  const disabledProvider = () => createAiProviderFromEnvironment({ AI_PROVIDER: "disabled" });

  const answered = await sendFinancialAssistantMessage({
    context,
    conversationId: view.conversation.id,
    question: "Tenho assinaturas recorrentes em BRL em 2026-01?",
    idempotencyKey: `test-${randomUUID()}`,
    runtime: {
      selectProvider: disabledProvider,
      resolveConsent: () => "missing",
      now: () => new Date("2026-08-11T12:40:01Z"),
    },
  });
  const lastTurn = answered.turns.at(-1);
  assert.equal(answered.conversation.status, "ANSWERED");
  assert.equal(lastTurn?.intent, "subscriptions");
  assert.equal(lastTurn?.filters.periodStartOn, "2026-01-01");
  assert.equal(lastTurn?.filters.periodEndOn, "2026-01-31");
  assert.equal(lastTurn?.evidence?.period.startOn, "2026-01-01");
  assert.equal(lastTurn?.evidence?.period.endOn, "2026-01-31");
  assert.equal(lastTurn?.safeResponse?.period?.startOn, "2026-01-01");
  assert.equal(lastTurn?.safeResponse?.period?.endOn, "2026-01-31");
  assert.ok(
    lastTurn?.evidence?.assumptions.some((item) =>
      item.includes("historico encerrados no periodo solicitado"),
    ),
  );

  const previousMonth = await sendFinancialAssistantMessage({
    context,
    conversationId: view.conversation.id,
    question: "Tenho assinaturas recorrentes em BRL no mes passado?",
    idempotencyKey: `test-${randomUUID()}`,
    runtime: {
      selectProvider: disabledProvider,
      resolveConsent: () => "missing",
      now: () => new Date("2026-08-11T12:40:02Z"),
    },
  });
  const previousTurn = previousMonth.turns.at(-1);
  assert.equal(previousTurn?.filters.periodStartOn, "2026-07-01");
  assert.equal(previousTurn?.filters.periodEndOn, "2026-07-31");
  assert.equal(previousTurn?.evidence?.period.startOn, "2026-07-01");
  assert.equal(previousTurn?.evidence?.period.endOn, "2026-07-31");
}

async function expiryWinsBeforeLateAnswerIsPersisted(): Promise<void> {
  await cleanup();
  const startedAt = new Date("2026-08-11T13:00:00Z");
  const view = await startFinancialAssistantConversation(context, startedAt);
  const expiresAt = new Date("2026-08-11T13:05:00Z");
  await query(`update "FinancialAssistantConversation" set "expiresAt" = $2 where "id" = $1`, [
    view.conversation.id,
    expiresAt,
  ]);

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
