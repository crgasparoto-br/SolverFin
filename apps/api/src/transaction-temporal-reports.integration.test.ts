import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { buildCategoryEvolutionReportForSourceContext } from "./category-evolution-account-filter.js";
import { parseCategoryEvolutionFilters } from "./category-evolution-report.js";
import { closePool } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import { createTransactionForContext } from "./repositories/transactions.js";

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
  const account = await createAccountForContext(PERSONAL_CONTEXT, {
    name: `Conta semântica temporal ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });

  await createTransactionForContext(PERSONAL_CONTEXT, {
    accountId: account.id,
    kind: "income",
    status: "posted",
    amountMinor: 12_345,
    occurredOn: "2032-01-10",
    plannedOn: "2032-02-15",
    effectiveOn: "2032-03-20",
    description: `Receita com datas distintas ${suffix}`,
  });

  const filters = parseCategoryEvolutionFilters(
    new URLSearchParams({ interval: "monthly", start: "2032-01", periods: "3" }),
  );
  const report = await buildCategoryEvolutionReportForSourceContext(PERSONAL_CONTEXT, filters, {
    kind: "account",
    id: account.id,
  });
  const brl = report.currencyBlocks.find((block) => block.currency === "BRL");

  assert.ok(brl);
  assert.deepEqual(
    brl.income.cells.map((cell) => cell.amountMinor),
    [12_345, 0, 0],
    "realized report must keep the economic period from occurredOn",
  );
}
