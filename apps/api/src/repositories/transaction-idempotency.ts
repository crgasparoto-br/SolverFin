import { createHash, randomUUID } from "node:crypto";
import type { TenantContext, Transaction } from "@solverfin/domain";

import { withSharedTransaction } from "../db.js";
import { createTransactionForContext } from "./transactions.js";

type CreatePayload = Parameters<typeof createTransactionForContext>[1];

export async function createTransactionIdempotentlyForContext(
  context: TenantContext,
  payload: CreatePayload,
  idempotencyKey: string,
): Promise<{ transaction: Transaction; idempotentReplay: boolean }> {
  const key = idempotencyKey.toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key)) {
    throw Object.assign(new Error("Informe uma chave de idempotência UUID válida."), {
      code: "TRANSACTION_IDEMPOTENCY_KEY_INVALID",
      statusCode: 400,
    });
  }
  const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

  return withSharedTransaction(async (executeQuery) => {
    await executeQuery("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      "manual-transaction:" + context.organizationId + ":" + context.financialProfileId + ":" + key,
    ]);
    const prior = await executeQuery<{ requestFingerprint: string; response: Transaction }>(
      `select "requestFingerprint", "response" from "TransactionCreationRequest"
       where "organizationId" = $1 and "financialProfileId" = $2 and "idempotencyKey" = $3
       for update`,
      [context.organizationId, context.financialProfileId, key],
    );
    if (prior[0]) {
      if (prior[0].requestFingerprint !== fingerprint) {
        throw Object.assign(new Error("Esta tentativa já foi utilizada com outros dados."), {
          code: "TRANSACTION_IDEMPOTENCY_CONFLICT",
          statusCode: 409,
        });
      }
      return { transaction: prior[0].response, idempotentReplay: true };
    }

    // Nested savepoint and same connection ensure that effects and request record are atomic.
    const transaction = await createTransactionForContext(context, payload);
    const now = new Date().toISOString();
    await executeQuery(
      `insert into "TransactionCreationRequest"
       ("id", "organizationId", "financialProfileId", "idempotencyKey", "requestFingerprint",
        "response", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $7)`,
      [
        randomUUID(),
        context.organizationId,
        context.financialProfileId,
        key,
        fingerprint,
        JSON.stringify(transaction),
        now,
      ],
    );
    return { transaction, idempotentReplay: false };
  });
}
