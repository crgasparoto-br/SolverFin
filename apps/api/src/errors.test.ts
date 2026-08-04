import { strict as assert } from "node:assert";

import {
  buildApiErrorResponse,
  logApiError,
  resolveCorrelationId,
  type ApiLogEvent,
} from "./errors.js";

returnsControlledErrorContract();
preservesExplicitSafeServerErrorContracts();
redactsUnexpectedPersistenceErrors();
usesControlledMessagesForKnownDatabaseErrors();
usesControlledMessagesForAiSuggestionPayloadErrors();
propagatesOrCreatesCorrelationId();
logsWithoutSensitivePayload();

function returnsControlledErrorContract(): void {
  const response = buildApiErrorResponse({
    error: {
      code: "TENANT_ACCESS_DENIED",
      statusCode: 403,
      message: "Acesso negado ao contexto financeiro.",
    },
    correlationId: "corr-demo-123",
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error.code, "TENANT_ACCESS_DENIED");
  assert.equal(response.body.error.correlationId, "corr-demo-123");

  const unexpected = buildApiErrorResponse({
    error: new Error("stack token=abc123"),
    correlationId: "corr-demo-456",
  });

  assert.equal(unexpected.statusCode, 500);
  assert.equal(unexpected.body.error.message.includes("token"), false);
}

function preservesExplicitSafeServerErrorContracts(): void {
  const response = buildApiErrorResponse({
    error: {
      code: "INSTITUTION_LOGO_STORAGE_UNAVAILABLE",
      statusCode: 502,
      message: "Não foi possível salvar a logomarca no storage R2. Tente novamente.",
    },
    correlationId: "corr-controlled-server-error",
  });

  assert.deepEqual(response, {
    statusCode: 502,
    body: {
      error: {
        code: "INSTITUTION_LOGO_STORAGE_UNAVAILABLE",
        message: "Não foi possível salvar a logomarca no storage R2. Tente novamente.",
        correlationId: "corr-controlled-server-error",
      },
    },
  });
}

function redactsUnexpectedPersistenceErrors(): void {
  const sensitiveMessage =
    "fingerprint=0123456789abcdef idempotencyKey=550e8400-e29b-41d4-a716-446655440000 amountMinor=120000";
  const response = buildApiErrorResponse({
    error: Object.assign(new Error(sensitiveMessage), { code: "P0001" }),
    correlationId: "corr-persistence-redaction",
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body.error, {
    code: "API_UNEXPECTED_ERROR",
    message: "Não foi possível concluir a ação. Tente novamente.",
    correlationId: "corr-persistence-redaction",
  });
  assert.doesNotMatch(
    JSON.stringify(response.body),
    /fingerprint|idempotencyKey|amountMinor|P0001/,
  );
}

function usesControlledMessagesForKnownDatabaseErrors(): void {
  const response = buildApiErrorResponse({
    error: {
      constraint: "Transaction_group_member_update_blocked",
      code: "23514",
      message: "SQL interno com payload financeiro reservado",
    },
    correlationId: "corr-known-database-error",
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.error.code, "TRANSACTION_GROUP_MEMBER_UPDATE_BLOCKED");
  assert.equal(
    response.body.error.message,
    "Desagrupe os lançamentos antes de alterar conta, tipo, moeda ou situação.",
  );
  assert.doesNotMatch(JSON.stringify(response.body), /SQL interno|payload financeiro|23514/);
}

function usesControlledMessagesForAiSuggestionPayloadErrors(): void {
  const response = buildApiErrorResponse({
    error: Object.assign(
      new Error(
        "AI_SUGGESTION_PAYLOAD_OBSOLETE fingerprint=secret amountMinor=999999",
      ),
      { code: "P0001" },
    ),
    correlationId: "corr-ai-payload-obsolete",
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body.error, {
    code: "AI_SUGGESTION_PAYLOAD_OBSOLETE",
    message: "A sugestão ficou obsoleta porque sua origem ou proposta foi alterada.",
    correlationId: "corr-ai-payload-obsolete",
  });
  assert.doesNotMatch(JSON.stringify(response.body), /secret|999999|P0001/);
}

function propagatesOrCreatesCorrelationId(): void {
  assert.equal(
    resolveCorrelationId({ "x-correlation-id": "corr-existing-123" }),
    "corr-existing-123",
  );
  assert.equal(resolveCorrelationId({ "x-correlation-id": "bad" }).startsWith("corr-"), true);
}

function logsWithoutSensitivePayload(): void {
  const events: ApiLogEvent[] = [];

  logApiError({
    logger: (event) => events.push(event),
    error: {
      code: "VALIDATION_ERROR",
      statusCode: 400,
      message: "Campo obrigatorio ausente.",
    },
    correlationId: "corr-log-123",
    route: "/transactions",
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.correlationId, "corr-log-123");
  assert.equal("safeDetails" in (events[0] ?? {}), false);
}
