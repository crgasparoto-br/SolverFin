import assert from "node:assert/strict";

import {
  MAX_SUPPORTED_MONEY_MINOR,
  MoneyRangeError,
  parseSafeMoneyMinor,
} from "@solverfin/domain/money";

import { closePool, getPool } from "./db.js";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

// prettier-ignore
async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL);

  const expectedColumns = new Set([
    "Account.openingBalanceMinor",
    "AccountRemuneration.balanceBaseMinor",
    "AccountRemuneration.originalAmountMinor",
    "Budget.plannedAmountMinor",
    "Card.creditLimitMinor",
    "CardInstrument.creditLimitMinor",
    "Installment.amountMinor",
    "Invoice.totalAmountMinor",
    "PayableReceivable.amountMinor",
    "Recurrence.amountMinor",
    "Transaction.amountMinor",
  ]);
  const metadata = await getPool().query<{
    table_name: string;
    column_name: string;
    data_type: string;
  }>(
    `select table_name, column_name, data_type
       from information_schema.columns
      where (table_name, column_name) in (
        ('Account', 'openingBalanceMinor'),
        ('AccountRemuneration', 'balanceBaseMinor'),
        ('AccountRemuneration', 'originalAmountMinor'),
        ('Budget', 'plannedAmountMinor'),
        ('Card', 'creditLimitMinor'),
        ('CardInstrument', 'creditLimitMinor'),
        ('Installment', 'amountMinor'),
        ('Invoice', 'totalAmountMinor'),
        ('PayableReceivable', 'amountMinor'),
        ('Recurrence', 'amountMinor'),
        ('Transaction', 'amountMinor')
      )`,
  );

  assert.equal(metadata.rowCount, expectedColumns.size);
  for (const row of metadata.rows) {
    assert.equal(
      row.data_type,
      "bigint",
      `${row.table_name}.${row.column_name} must be BIGINT`,
    );
    expectedColumns.delete(`${row.table_name}.${row.column_name}`);
  }
  assert.deepEqual([...expectedColumns], []);

  const triggerMetadata = await getPool().query<{ trigger_name: string }>(
    `select trigger_name
       from information_schema.triggers
      where event_object_table = 'Transaction'
        and event_manipulation = 'UPDATE'
        and trigger_name = 'Transaction_account_remuneration_adjustment_trigger'`,
  );
  assert.equal(
    triggerMetadata.rowCount,
    1,
    "account-remuneration adjustment trigger must survive the monetary widening",
  );

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const accountResult = await client.query<{ id: string }>(
      `select "id" from "Account" order by "createdAt" asc limit 1`,
    );
    const account = accountResult.rows[0];
    assert.ok(account, "integration seed must provide at least one account");

    const aboveInt32 = 3_000_000_000;
    await client.query(
      `update "Account" set "openingBalanceMinor" = $1::bigint where "id" = $2`,
      [String(aboveInt32), account.id],
    );
    const persisted = await client.query<{ openingBalanceMinor: number }>(
      `select "openingBalanceMinor" from "Account" where "id" = $1`,
      [account.id],
    );
    assert.equal(persisted.rows[0]?.openingBalanceMinor, aboveInt32);
    assert.equal(typeof persisted.rows[0]?.openingBalanceMinor, "number");

    await client.query(
      `update "Account" set "openingBalanceMinor" = $1::bigint where "id" = $2`,
      [String(MAX_SUPPORTED_MONEY_MINOR), account.id],
    );
    const boundary = await client.query<{ openingBalanceMinor: number }>(
      `select "openingBalanceMinor" from "Account" where "id" = $1`,
      [account.id],
    );
    assert.equal(boundary.rows[0]?.openingBalanceMinor, MAX_SUPPORTED_MONEY_MINOR);

    await client.query("SAVEPOINT unsafe_money_range");
    await assert.rejects(
      client.query(
        `update "Account" set "openingBalanceMinor" = $1::bigint where "id" = $2`,
        [String(BigInt(MAX_SUPPORTED_MONEY_MINOR) + 1n), account.id],
      ),
      /AccountOpeningBalanceMinorSafeRange/,
    );
    await client.query("ROLLBACK TO SAVEPOINT unsafe_money_range");

    const aggregate = await client.query<{ total: string }>(
      `select sum(value)::text as total
         from (values
           (3000000000000000::bigint),
           (3000000000000000::bigint),
           (3000000000000000::bigint)
         ) as money(value)`,
    );
    assert.equal(parseSafeMoneyMinor(aggregate.rows[0]?.total ?? ""), 9_000_000_000_000_000);

    assert.throws(
      () => parseSafeMoneyMinor(String(BigInt(MAX_SUPPORTED_MONEY_MINOR) + 1n)),
      MoneyRangeError,
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}
