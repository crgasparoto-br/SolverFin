import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import {
  createCreditCardAccountForContext,
  updateCreditCardAccountForContext,
} from "./repositories/card-instruments.js";
import {
  createCardForContext,
  registerCardPurchaseForContext,
  updateCardForContext,
} from "./repositories/cards.js";

const CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};

type UnsafeCreate = (context: TenantContext, payload: Record<string, unknown>) => Promise<unknown>;

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for write-boundary tests.");

  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}`;

  await assertMissingCurrencyRejectedWithoutWrites(suffix);

  const brlAccount = await createAccountForContext(CONTEXT, {
    name: `Boundary BRL ${suffix}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 0,
  });
  const usdAccount = await createAccountForContext(CONTEXT, {
    name: `Boundary USD ${suffix}`,
    kind: "checking",
    currency: "USD",
    openingBalanceMinor: 0,
  });

  await assertCreateMismatchRejectedWithoutWrites(brlAccount.id, usdAccount.id, suffix);
  await assertCreditCardRepositoryGuards(brlAccount.id, usdAccount.id, suffix);
  await assertCardRepositoryGuards(brlAccount.id, usdAccount.id, suffix);
}

async function assertMissingCurrencyRejectedWithoutWrites(suffix: string): Promise<void> {
  const groupedName = `Boundary missing grouped ${suffix}`;
  const legacyName = `Boundary missing legacy ${suffix}`;
  const unsafeCreateGrouped = createCreditCardAccountForContext as unknown as UnsafeCreate;
  const unsafeCreateLegacy = createCardForContext as unknown as UnsafeCreate;

  await assert.rejects(
    () =>
      unsafeCreateGrouped(CONTEXT, {
        name: groupedName,
        closingDay: 20,
        dueDay: 10,
        instruments: [{ type: "physical", holder: "primary" }],
      }),
    hasCode("CARD_CURRENCY_REQUIRED"),
  );
  await assert.rejects(
    () =>
      unsafeCreateLegacy(CONTEXT, {
        name: legacyName,
        closingDay: 20,
        dueDay: 10,
      }),
    hasCode("CARD_CURRENCY_REQUIRED"),
  );

  assert.equal(await countCardsByName(groupedName), 0);
  assert.equal(await countCardsByName(legacyName), 0);
}

async function assertCreateMismatchRejectedWithoutWrites(
  brlAccountId: string,
  usdAccountId: string,
  suffix: string,
): Promise<void> {
  const groupedName = `Boundary grouped mismatch ${suffix}`;
  const legacyName = `Boundary legacy mismatch ${suffix}`;

  await assert.rejects(
    () =>
      createCreditCardAccountForContext(CONTEXT, {
        name: groupedName,
        closingDay: 20,
        dueDay: 10,
        currency: "BRL",
        paymentAccountId: usdAccountId,
        instruments: [{ type: "physical", holder: "primary" }],
      }),
    hasCode("CARD_CURRENCY_PAYMENT_ACCOUNT_MISMATCH"),
  );
  await assert.rejects(
    () =>
      createCardForContext(CONTEXT, {
        name: legacyName,
        closingDay: 20,
        dueDay: 10,
        currency: "USD",
        paymentAccountId: brlAccountId,
      }),
    hasCode("CARD_CURRENCY_PAYMENT_ACCOUNT_MISMATCH"),
  );

  assert.equal(await countCardsByName(groupedName), 0);
  assert.equal(await countCardsByName(legacyName), 0);
}

async function assertCreditCardRepositoryGuards(
  brlAccountId: string,
  usdAccountId: string,
  suffix: string,
): Promise<void> {
  const card = await createCreditCardAccountForContext(CONTEXT, {
    name: `Boundary grouped ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    currency: "BRL",
    paymentAccountId: brlAccountId,
    instruments: [{ type: "physical", holder: "primary", name: "Principal" }],
  });

  await assert.rejects(
    () => updateCreditCardAccountForContext(CONTEXT, card.id, { paymentAccountId: usdAccountId }),
    hasCode("CARD_CURRENCY_PAYMENT_ACCOUNT_MISMATCH"),
  );
  assert.deepEqual(await readCardCurrencyAndAccount(card.id), {
    currency: "BRL",
    paymentAccountId: brlAccountId,
  });

  const instrument = card.instruments[0];
  assert.ok(instrument);
  await registerCardPurchaseForContext(
    CONTEXT,
    card.id,
    {
      occurredOn: "2032-01-15",
      amountMinor: 1_500,
      description: `Boundary grouped history ${suffix}`,
      cardInstrumentId: instrument.id,
    },
    { requireInstrumentContext: true },
  );

  await assert.rejects(
    () => updateCreditCardAccountForContext(CONTEXT, card.id, { currency: "USD" }),
    hasCode("CARD_CURRENCY_LOCKED"),
  );
  assert.deepEqual(await readCardCurrencyAndAccount(card.id), {
    currency: "BRL",
    paymentAccountId: brlAccountId,
  });
}

async function assertCardRepositoryGuards(
  brlAccountId: string,
  usdAccountId: string,
  suffix: string,
): Promise<void> {
  const card = await createCardForContext(CONTEXT, {
    name: `Boundary legacy ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    currency: "BRL",
    paymentAccountId: brlAccountId,
  });

  await assert.rejects(
    () => updateCardForContext(CONTEXT, card.id, { paymentAccountId: usdAccountId }),
    hasCode("CARD_CURRENCY_PAYMENT_ACCOUNT_MISMATCH"),
  );
  assert.deepEqual(await readCardCurrencyAndAccount(card.id), {
    currency: "BRL",
    paymentAccountId: brlAccountId,
  });

  await registerCardPurchaseForContext(CONTEXT, card.id, {
    occurredOn: "2032-02-15",
    amountMinor: 2_500,
    description: `Boundary legacy history ${suffix}`,
  });

  await assert.rejects(
    () => updateCardForContext(CONTEXT, card.id, { currency: "USD" }),
    hasCode("CARD_CURRENCY_LOCKED"),
  );
  assert.deepEqual(await readCardCurrencyAndAccount(card.id), {
    currency: "BRL",
    paymentAccountId: brlAccountId,
  });
}

function hasCode(expectedCode: string): (error: unknown) => boolean {
  return (error: unknown) =>
    error instanceof Error && "code" in error && error.code === expectedCode;
}

async function countCardsByName(name: string): Promise<number> {
  const rows = await query<{ count: number | string }>(
    `select count(*)::int as "count" from "Card"
      where "organizationId" = $1 and "financialProfileId" = $2 and "name" = $3`,
    [CONTEXT.organizationId, CONTEXT.financialProfileId, name],
  );
  return Number(rows[0]?.count ?? 0);
}

async function readCardCurrencyAndAccount(
  cardId: string,
): Promise<{ currency: string | null; paymentAccountId: string | null }> {
  const rows = await query<{ currency: string | null; paymentAccountId: string | null }>(
    `select "currency", "paymentAccountId" from "Card"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [cardId, CONTEXT.organizationId, CONTEXT.financialProfileId],
  );
  const row = rows[0];
  assert.ok(row, `Expected card ${cardId}.`);
  return row;
}
