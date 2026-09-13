import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { handleFinancialProfilesApiRequest } from "./financial-profiles-router.js";
import { handleInstallmentsApiRequest } from "./installments-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { createCreditCardAccountForContext } from "./repositories/card-instruments.js";
import { updateCardPurchaseForContext } from "./repositories/card-invoice-contracts.js";
import { registerCardPurchaseForContext } from "./repositories/cards.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

const CONTEXT: TenantContext = {
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
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for issue 662 audit controls.");

  const suffix = Date.now().toString(36);
  const account = await createCreditCardAccountForContext(CONTEXT, {
    name: `Cartao controles issue 662 ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    currency: "BRL",
    creditLimitMinor: 120_000,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Fisico rollback 662",
        maskedIdentifier: "**** 6621",
      },
      {
        type: "virtual",
        holder: "primary",
        name: "Virtual rollback 662",
        maskedIdentifier: "**** 6622",
      },
    ],
  });
  const physical = account.instruments.find((item) => item.type === "physical");
  const virtual = account.instruments.find((item) => item.type === "virtual");
  assert.ok(physical);
  assert.ok(virtual);

  const purchase = await registerCardPurchaseForContext(CONTEXT, account.id, {
    occurredOn: "2029-05-08",
    amountMinor: 30_000,
    description: `Compra auditada issue 662 ${suffix}`,
    cardInstrumentId: physical.id,
    totalInstallments: 3,
  });
  const futureInvoice = purchase.futureInvoices[0];
  assert.ok(futureInvoice, "Expected a future invoice for the installment purchase.");

  const token = await loginAndReadToken();
  const otherProfileId = await createProfile(token, suffix);
  await assertPublicInvoiceBoundary(token, purchase.transaction.id, futureInvoice.id, otherProfileId);
  await assertAtomicRollback(account.id, purchase.transaction.id, physical.id, virtual.id, suffix);
  await assertConcurrentInstrumentConsistency(account.id, purchase.transaction.id, physical.id, virtual.id, suffix);
}

async function assertPublicInvoiceBoundary(
  token: string,
  transactionId: string,
  invoiceId: string,
  otherProfileId: string,
): Promise<void> {
  const response = await apiRequest(
    token,
    "GET",
    `/api/installments?profileId=${CONTEXT.financialProfileId}&invoiceId=${invoiceId}&status=all`,
  );
  assert.equal(response.statusCode, 200);
  const body = readBody<{ installments: ApiInstallmentOccurrence[] }>(response);
  assert.equal(body.installments.length, 1);
  assert.equal(body.installments[0]?.transaction?.id, transactionId);
  assert.equal(body.installments[0]?.invoice?.id, invoiceId);
  assert.equal(body.installments[0]?.sequenceNumber, 2);
  assert.equal(body.installments[0]?.totalInstallments, 3);
  assert.equal(body.installments[0]?.amountMinor, 10_000);

  const crossProfile = await apiRequest(
    token,
    "GET",
    `/api/installments?profileId=${otherProfileId}&invoiceId=${invoiceId}&status=all`,
  );
  assert.equal(crossProfile.statusCode, 200);
  assert.deepEqual(readBody<{ installments: ApiInstallmentOccurrence[] }>(crossProfile).installments, []);
}

async function assertAtomicRollback(
  cardId: string,
  transactionId: string,
  physicalInstrumentId: string,
  virtualInstrumentId: string,
  suffix: string,
): Promise<void> {
  assert.match(transactionId, /^[0-9a-f-]{36}$/i);
  const functionName = `solverfin_i662_rb_fn_${suffix}`;
  const triggerName = `solverfin_i662_rb_tr_${suffix}`;
  const original = await readPurchaseState(transactionId);
  const originalInstallments = await readInstallmentInstruments(transactionId);

  await query(`
    create function "${functionName}"() returns trigger language plpgsql as $$
    begin
      if new."transactionId" = '${transactionId}'::uuid then
        raise exception 'issue662 rollback probe';
      end if;
      return new;
    end;
    $$
  `);
  await query(`
    create trigger "${triggerName}"
    before update on "Installment"
    for each row execute function "${functionName}"()
  `);

  try {
    await assert.rejects(
      () =>
        updateCardPurchaseForContext(CONTEXT, cardId, transactionId, {
          description: `Nao pode persistir rollback ${suffix}`,
          cardInstrumentId: virtualInstrumentId,
        }),
      (error: unknown) => error instanceof Error && error.message.includes("issue662 rollback probe"),
    );

    const after = await readPurchaseState(transactionId);
    assert.deepEqual(after, original, "Transaction update must roll back when installment propagation fails.");
    assert.deepEqual(
      await readInstallmentInstruments(transactionId),
      originalInstallments,
      "Installment schedule must remain unchanged after the injected failure.",
    );
    assert.equal(after.cardInstrumentId, physicalInstrumentId);
  } finally {
    await query(`drop trigger if exists "${triggerName}" on "Installment"`);
    await query(`drop function if exists "${functionName}"()`);
  }
}

async function assertConcurrentInstrumentConsistency(
  cardId: string,
  transactionId: string,
  physicalInstrumentId: string,
  virtualInstrumentId: string,
  suffix: string,
): Promise<void> {
  await Promise.all([
    updateCardPurchaseForContext(CONTEXT, cardId, transactionId, {
      description: `Concorrente A ${suffix}`,
      cardInstrumentId: virtualInstrumentId,
    }),
    updateCardPurchaseForContext(CONTEXT, cardId, transactionId, {
      description: `Concorrente B ${suffix}`,
      cardInstrumentId: physicalInstrumentId,
    }),
  ]);

  const transaction = await readPurchaseState(transactionId);
  const installmentInstruments = await readInstallmentInstruments(transactionId);
  assert.ok(
    transaction.cardInstrumentId === physicalInstrumentId ||
      transaction.cardInstrumentId === virtualInstrumentId,
  );
  assert.equal(installmentInstruments.length, 3);
  assert.equal(
    installmentInstruments.every((value) => value === transaction.cardInstrumentId),
    true,
    "Concurrent edits must not leave Transaction and Installment instrument origins divergent.",
  );
}

async function readPurchaseState(transactionId: string): Promise<PurchaseState> {
  const rows = await query<PurchaseState>(
    `select "description", "cardInstrumentId" from "Transaction" where "id" = $1`,
    [transactionId],
  );
  const row = rows[0];
  if (!row) throw new Error(`Expected transaction ${transactionId}.`);
  return row;
}

async function readInstallmentInstruments(transactionId: string): Promise<string[]> {
  const rows = await query<{ cardInstrumentId: string }>(
    `select "cardInstrumentId" from "Installment" where "transactionId" = $1 order by "sequenceNumber"`,
    [transactionId],
  );
  return rows.map((row) => row.cardInstrumentId);
}

async function createProfile(token: string, suffix: string): Promise<string> {
  const response = await apiRequest(token, "POST", "/api/financial-profiles", {
    name: `Perfil isolamento issue 662 ${suffix}`,
    kind: "family",
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ profile: { id: string } }>(response).profile.id;
}

async function loginAndReadToken(): Promise<string> {
  const response = await handleMvpApiRequest({
    method: "POST",
    path: "/api/session",
    body: {
      email: "demo@solverfin.example.invalid",
      password: "SolverFinDemo!2026",
    },
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ session: { token: string } }>(response).session.token;
}

async function apiRequest(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse> {
  const url = new URL(path, "http://solverfin.integration.test");
  const request: ApiRequest = {
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: { authorization: `Bearer ${token}` },
    body,
  };

  return (
    (await handleFinancialProfilesApiRequest(request)) ??
    (await handleInstallmentsApiRequest(request)) ??
    (await handleApiRequest(request)) ?? {
      statusCode: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { error: { code: "API_ROUTE_NOT_FOUND" } },
    }
  );
}

function readBody<TBody>(response: Pick<ApiResponse, "body">): TBody {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);
  return response.body as TBody;
}

interface ApiInstallmentOccurrence {
  sequenceNumber: number;
  totalInstallments: number;
  amountMinor: number;
  transaction?: { id?: string };
  invoice?: { id?: string };
}

interface PurchaseState {
  description: string;
  cardInstrumentId: string;
}
