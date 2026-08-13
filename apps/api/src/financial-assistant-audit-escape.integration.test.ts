import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createAiProviderFromEnvironment } from "@solverfin/ai";
import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { resolveFinancialAssistantData } from "./financial-assistant-data.js";
import {
  claimFinancialAssistantTurn,
  finalizeFinancialAssistantTurn,
  getConversationById,
  startFinancialAssistantConversation,
} from "./financial-assistant-repository.js";
import { sendFinancialAssistantMessage } from "./financial-assistant-service.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
const PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const TEST_CURRENCY = "XTS";

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
  await cleanupAssistantState();
  try {
    await temporalBalanceCutoffsRespectRequestedHorizon();
    await retryAfterRestartRecoversInsideRepeatedEntrypoint();
  } finally {
    await cleanupAssistantState();
  }
}

async function temporalBalanceCutoffsRespectRequestedHorizon(): Promise<void> {
  const accountId = randomUUID();
  const transactionIds = Array.from({ length: 5 }, () => randomUUID());
  try {
    await query(
      `insert into "Account"
        ("id", "organizationId", "financialProfileId", "name", "kind", "currency", "openingBalanceMinor", "updatedAt")
       values ($1, $2, $3, 'Audit escape temporal account', 'CHECKING', $4, 100000, now())`,
      [accountId, ORGANIZATION_ID, PROFILE_ID, TEST_CURRENCY],
    );

    const transactions = [
      [
        transactionIds[0],
        "INCOME",
        "POSTED",
        10000,
        "2026-01-10",
        "2026-01-10",
        "January realized income",
      ],
      [
        transactionIds[1],
        "EXPENSE",
        "POSTED",
        3000,
        "2026-02-10",
        "2026-02-10",
        "February realized expense",
      ],
      [
        transactionIds[2],
        "INCOME",
        "RECONCILED",
        2000,
        "2026-08-10",
        "2026-08-10",
        "Current realized income",
      ],
      [
        transactionIds[3],
        "INCOME",
        "POSTED",
        5000,
        "2026-08-12",
        "2026-08-12",
        "After as-of realized income",
      ],
      [
        transactionIds[4],
        "EXPENSE",
        "PLANNED",
        4000,
        "2026-01-05",
        "2026-09-15",
        "Future planned expense",
      ],
    ] as const;

    for (const [
      id,
      kind,
      status,
      amountMinor,
      occurredOn,
      plannedOn,
      description,
    ] of transactions) {
      await query(
        `insert into "Transaction"
          ("id", "organizationId", "financialProfileId", "accountId", "kind", "status", "source",
           "amountMinor", "currency", "occurredOn", "plannedOn", "description", "updatedAt")
         values ($1, $2, $3, $4, $5::"TransactionKind", $6::"TransactionStatus", 'MANUAL',
                 $7, $8, $9::date, $10::date, $11, now())`,
        [
          id,
          ORGANIZATION_ID,
          PROFILE_ID,
          accountId,
          kind,
          status,
          amountMinor,
          TEST_CURRENCY,
          occurredOn,
          plannedOn,
          description,
        ],
      );
    }

    const now = new Date("2026-08-11T12:00:00Z");

    // TEMP-ASOF-001: a February event must not contaminate a January balance.
    const historical = await resolveFinancialAssistantData(
      context,
      "Qual meu saldo projetado em XTS em 2026-01?",
      now,
    );
    assert.equal(historical.kind, "evidence");
    if (historical.kind !== "evidence" || !historical.evidence) {
      assert.fail("expected historical evidence");
    }
    assert.equal(historical.evidence.period.startOn, "2026-01-01");
    assert.equal(historical.evidence.period.endOn, "2026-01-31");
    assert.equal(metricAmount(historical.evidence.metrics, "projected_balance"), 110000);
    assert.match(
      historical.evidence.assumptions.join(" "),
      /corte 2026-01-31.*nunca incluindo eventos posteriores/i,
    );

    // TEMP-CURRENT-001: an event dated tomorrow must not enter today's realized balance.
    const current = await resolveFinancialAssistantData(
      context,
      "Qual meu saldo projetado em XTS este mes?",
      now,
    );
    assert.equal(current.kind, "evidence");
    if (current.kind !== "evidence" || !current.evidence) {
      assert.fail("expected current evidence");
    }
    assert.equal(metricAmount(current.evidence.metrics, "projected_balance"), 109000);

    // TEMP-FUTURE-001 + TEMP-SOURCE-001: realized stays capped at today while PLANNED follows plannedOn.
    const future = await resolveFinancialAssistantData(
      context,
      "Qual meu saldo projetado em XTS em 2026-09?",
      now,
    );
    assert.equal(future.kind, "evidence");
    if (future.kind !== "evidence" || !future.evidence) {
      assert.fail("expected future evidence");
    }
    assert.equal(metricAmount(future.evidence.metrics, "planned_delta"), -4000);
    assert.equal(metricAmount(future.evidence.metrics, "projected_balance"), 105000);
  } finally {
    await query(`delete from "Transaction" where "id" = any($1::uuid[])`, [transactionIds]);
    await query(`delete from "Account" where "id" = $1`, [accountId]);
  }
}

async function retryAfterRestartRecoversInsideRepeatedEntrypoint(): Promise<void> {
  await cleanupAssistantState();
  const startedAt = new Date("2026-08-11T12:00:00Z");
  const claimedAt = new Date("2026-08-11T12:00:01Z");
  const retryAt = new Date("2026-08-11T12:03:02Z");
  const view = await startFinancialAssistantConversation(context, startedAt);
  const idempotencyKey = `test-${randomUUID()}`;
  const question = "Qual meu saldo projetado este mes?";
  const first = await claimFinancialAssistantTurn({
    context,
    conversationId: view.conversation.id,
    normalizedQuestion: question,
    idempotencyKey,
    intent: "balance_projection",
    filters: {},
    now: claimedAt,
  });
  assert.equal(first.kind, "claimed");
  if (first.kind !== "claimed") assert.fail("expected initial claim");

  let providerSelections = 0;
  const repeated = await sendFinancialAssistantMessage({
    context,
    conversationId: view.conversation.id,
    question,
    idempotencyKey,
    runtime: {
      selectProvider: () => {
        providerSelections += 1;
        return createAiProviderFromEnvironment({ AI_PROVIDER: "disabled" });
      },
      resolveConsent: () => "granted",
      now: () => retryAt,
    },
  });

  const recoveredTurn = repeated.turns.find((turn) => turn.id === first.turn.id);
  assert.equal(repeated.conversation.status, "FAILED");
  assert.equal(recoveredTurn?.status, "FAILED");
  assert.equal(recoveredTurn?.failureCode, "ASSISTANT_PROCESS_INTERRUPTED");
  assert.equal(
    providerSelections,
    0,
    "same-key recovery must not reach provider selection/outbound",
  );

  // RESTART-IDEM-001 sibling: repeat the same public service entrypoint/key again, still no auxiliary GET.
  const repeatedAgain = await sendFinancialAssistantMessage({
    context,
    conversationId: view.conversation.id,
    question,
    idempotencyKey,
    runtime: {
      selectProvider: () => {
        providerSelections += 1;
        return createAiProviderFromEnvironment({ AI_PROVIDER: "disabled" });
      },
      resolveConsent: () => "granted",
      now: () => new Date("2026-08-11T12:03:03Z"),
    },
  });
  assert.equal(repeatedAgain.turns.length, 1);
  assert.equal(repeatedAgain.turns[0]?.id, first.turn.id);
  assert.equal(repeatedAgain.turns[0]?.status, "FAILED");
  assert.equal(providerSelections, 0);

  // Late completion from the crashed process is fenced by the recovered turn version.
  const afterLateFinalize = await finalizeFinancialAssistantTurn({
    context,
    conversationId: view.conversation.id,
    turnId: first.turn.id,
    conversationVersion: first.turn.conversationVersion,
    status: "ANSWERED",
    safeResponse: {
      status: "answered",
      intent: "balance_projection",
      confidence: "high",
      answer: "late answer that must be ignored",
      assumptions: [],
      sources: [],
      limitations: [],
      safeLogCode: "LATE_AFTER_RESTART",
    },
    now: new Date("2026-08-11T12:03:04Z"),
  });
  const fencedTurn = afterLateFinalize.turns.find((turn) => turn.id === first.turn.id);
  assert.equal(fencedTurn?.status, "FAILED");
  assert.equal(fencedTurn?.failureCode, "ASSISTANT_PROCESS_INTERRUPTED");
  assert.equal(fencedTurn?.safeResponse, null);

  // Sibling with a new key: stale recovery frees the conversation for controlled progress.
  const newKey = await claimFinancialAssistantTurn({
    context,
    conversationId: view.conversation.id,
    normalizedQuestion: "Resumo deste mes",
    idempotencyKey: `test-${randomUUID()}`,
    intent: "monthly_summary",
    filters: {},
    now: new Date("2026-08-11T12:03:05Z"),
  });
  assert.equal(newKey.kind, "claimed");
  assert.equal(newKey.turn.sequence, 2);
  assert.equal(newKey.conversation.status, "PROCESSING");

  const terminal = await getConversationById(context, view.conversation.id, true);
  assert.equal(terminal?.turns[0]?.failureCode, "ASSISTANT_PROCESS_INTERRUPTED");
  assert.equal(terminal?.turns[1]?.status, "PROCESSING");
}

function metricAmount(
  metrics: readonly { key: string; amountMinor?: number }[],
  key: string,
): number | undefined {
  return metrics.find((metric) => metric.key === key)?.amountMinor;
}

async function cleanupAssistantState(): Promise<void> {
  await query(
    `delete from "FinancialAssistantTurn" where "organizationId" = $1 and "financialProfileId" = $2 and "userId" = $3`,
    [ORGANIZATION_ID, PROFILE_ID, USER_ID],
  );
  await query(
    `delete from "FinancialAssistantConversation" where "organizationId" = $1 and "financialProfileId" = $2 and "userId" = $3`,
    [ORGANIZATION_ID, PROFILE_ID, USER_ID],
  );
}
