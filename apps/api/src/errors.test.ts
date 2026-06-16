import { strict as assert } from "node:assert";

import { buildApiErrorResponse, logApiError, resolveCorrelationId, type ApiLogEvent } from "./errors.js";

returnsControlledErrorContract();
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
