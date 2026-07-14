import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";

import { closePool } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import {
  createTransactionForContext,
  getTransactionForContext,
  updateTransactionForContext,
} from "./repositories/transactions.js";

const PERSONAL_CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required. Run the integration database before this test.",
  );

  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const source = await createAccountForContext(PERSONAL_CONTEXT, {
    name: `Conta validação origem issue 473 ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  const destination = await createAccountForContext(PERSONAL_CONTEXT, {
    name: `Conta validação destino issue 473 ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });

  await assertMissingAccountIsRejected(source.id);
  await assertTransferCannotUseTheSameAccount(source.id, destination.id);
}

async function assertMissingAccountIsRejected(sourceAccountId: string): Promise<void> {
  const transaction = await createTransactionForContext(PERSONAL_CONTEXT, {
    accountId: sourceAccountId,
    kind: "expense",
    amountMinor: 8_750,
    occurredOn: "2028-12-10",
    plannedOn: "2028-12-10",
    status: "planned",
    description: "Conta inexistente issue 473",
  });
  const missingAccountId = randomUUID();

  await assertRejectCode(
    () =>
      updateTransactionForContext(PERSONAL_CONTEXT, transaction.id, {
        accountId: missingAccountId,
      }),
    "TENANT_RESOURCE_NOT_FOUND",
  );

  const after = await getTransactionForContext(PERSONAL_CONTEXT, transaction.id);
  assert.equal(after.accountId, sourceAccountId);
  assert.equal(after.destinationAccountId, undefined);
  assert.equal(after.description, transaction.description);
  assert.equal(after.amountMinor, transaction.amountMinor);
}

async function assertTransferCannotUseTheSameAccount(
  sourceAccountId: string,
  destinationAccountId: string,
): Promise<void> {
  const transfer = await createTransactionForContext(PERSONAL_CONTEXT, {
    accountId: sourceAccountId,
    destinationAccountId,
    kind: "transfer",
    amountMinor: 21_000,
    occurredOn: "2028-12-11",
    plannedOn: "2028-12-11",
    status: "posted",
    description: "Transferência conta igual issue 473",
  });

  await assertRejectCode(
    () =>
      updateTransactionForContext(PERSONAL_CONTEXT, transfer.id, {
        accountId: destinationAccountId,
      }),
    "TRANSACTION_TRANSFER_SAME_ACCOUNT",
  );

  const after = await getTransactionForContext(PERSONAL_CONTEXT, transfer.id);
  assert.equal(after.accountId, sourceAccountId);
  assert.equal(after.destinationAccountId, destinationAccountId);
  assert.equal(after.description, transfer.description);
  assert.equal(after.amountMinor, transfer.amountMinor);
}

async function assertRejectCode(
  action: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      String(error.code) === expectedCode
    );
  });
}
