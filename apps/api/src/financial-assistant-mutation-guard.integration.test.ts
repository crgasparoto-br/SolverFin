import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createAiProviderFromEnvironment } from "@solverfin/ai";
import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import {
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
    await mutationCommandsAreRefusedBeforeProviderSelection();
  } finally {
    await cleanup();
  }
}

async function mutationCommandsAreRefusedBeforeProviderSelection(): Promise<void> {
  const view = await startFinancialAssistantConversation(
    context,
    new Date("2026-08-13T12:00:00Z"),
  );
  let providerSelections = 0;
  const commands = [
    "Pague minha fatura este mes",
    "Exclua minha despesa deste mes",
    "Crie uma despesa de 100 reais",
    "Edite o valor desta parcela",
    "Concilie esta transacao",
    "Aprove este lancamento",
  ];

  for (const [index, question] of commands.entries()) {
    const result = await sendFinancialAssistantMessage({
      context,
      conversationId: view.conversation.id,
      question,
      idempotencyKey: `test-${randomUUID()}`,
      runtime: {
        selectProvider: () => {
          providerSelections += 1;
          return createAiProviderFromEnvironment({ AI_PROVIDER: "disabled" });
        },
        resolveConsent: () => "granted",
        now: () =>
          new Date(`2026-08-13T12:00:${String(index + 1).padStart(2, "0")}Z`),
      },
    });
    const turn = result.turns.at(-1);
    assert.equal(turn?.intent, "out_of_scope", question);
    assert.equal(turn?.safeResponse?.intent, "out_of_scope", question);
    assert.equal(turn?.safeResponse?.safeLogCode, "ASSISTANT_OUT_OF_SCOPE", question);
    assert.match(turn?.safeResponse?.answer ?? "", /Nao executo operacoes/i, question);
  }

  assert.equal(
    providerSelections,
    0,
    "mutation commands must not reach provider selection",
  );
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
