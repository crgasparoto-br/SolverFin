import { strict as assert } from "node:assert";

import type { Category, Transaction } from "./index.js";
import type { TenantContext } from "./tenant.js";
import { AccountantExportError, generateAccountantCsvExport } from "./accountant-export.js";

const context: TenantContext = {
  userId: "user-export-demo",
  organizationId: "org-export-demo",
  financialProfileId: "profile-export-demo",
  financialProfileKind: "mei",
};

const otherContext: TenantContext = {
  userId: "user-other-demo",
  organizationId: "org-other-demo",
  financialProfileId: "profile-other-demo",
  financialProfileKind: "personal",
};

const category: Category = {
  id: "category-services",
  organizationId: context.organizationId,
  financialProfileId: context.financialProfileId,
  name: "Servicos",
  kind: "income",
  status: "active",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

const transactions: readonly Transaction[] = [
  buildTransaction("income-1", context, "income", 250000, "2026-06-10", category.id),
  buildTransaction("expense-1", context, "expense", 40000, "2026-06-12"),
  buildTransaction("income-other", otherContext, "income", 999999, "2026-06-10"),
  { ...buildTransaction("voided-1", context, "expense", 1000, "2026-06-11"), status: "voided" },
];

generatesCsvForAuthorizedTenantAndPeriod();
returnsHeaderForEmptyPeriod();
rejectsInvalidPeriod();

function generatesCsvForAuthorizedTenantAndPeriod(): void {
  const result = generateAccountantCsvExport({
    context,
    transactions,
    categories: [category],
    filters: {
      periodStartOn: "2026-06-01",
      periodEndOn: "2026-06-30",
    },
  });

  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0]?.categoria, "Servicos");
  assert.equal(result.rows[1]?.valor_centavos, -40000);
  assert.equal(result.csv.includes("income-other"), false);
  assert.equal(result.csv.startsWith("periodo_inicio;periodo_fim"), true);
}

function returnsHeaderForEmptyPeriod(): void {
  const result = generateAccountantCsvExport({
    context,
    transactions,
    filters: {
      periodStartOn: "2026-05-01",
      periodEndOn: "2026-05-31",
    },
  });

  assert.equal(result.rows.length, 0);
  assert.equal(
    result.csv,
    "periodo_inicio;periodo_fim;data_lancamento;tipo;categoria;descricao;valor_centavos;moeda;contexto_financeiro;status\n",
  );
}

function rejectsInvalidPeriod(): void {
  assert.throws(
    () =>
      generateAccountantCsvExport({
        context,
        transactions,
        filters: {
          periodStartOn: "2026-07-01",
          periodEndOn: "2026-06-01",
        },
      }),
    AccountantExportError,
  );
}

function buildTransaction(
  id: string,
  tenant: TenantContext,
  kind: Transaction["kind"],
  amountMinor: number,
  occurredOn: string,
  categoryId?: string,
): Transaction {
  const transaction: Transaction = {
    id,
    organizationId: tenant.organizationId,
    financialProfileId: tenant.financialProfileId,
    kind,
    status: "posted",
    source: "manual",
    amountMinor,
    currency: "BRL",
    occurredOn,
    plannedOn: occurredOn,
    description: `Lancamento ${id}`,
    accountId: "account-export-demo",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };

  if (categoryId !== undefined) {
    transaction.categoryId = categoryId;
  }

  return transaction;
}
