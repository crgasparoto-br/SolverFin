import assert from "node:assert/strict";

import { renderTransactionsPage } from "./transactions-page.js";

const LARGE_PERSISTED_AMOUNT_MINOR = 3_000_000_000;
const MEDIUM_AMOUNT_MINOR = 99_999_999;
const LARGE_AMOUNT_MINOR = 999_999_999;
const aggregateIncomeCount = 47;
const transactions = [
  transaction("max-income", "income", LARGE_PERSISTED_AMOUNT_MINOR, "2026-07-01"),
  transaction("balance-to-zero", "expense", LARGE_PERSISTED_AMOUNT_MINOR, "2026-07-02"),
  transaction("negative-balance", "expense", LARGE_PERSISTED_AMOUNT_MINOR, "2026-07-03"),
  transaction("back-to-zero", "income", LARGE_PERSISTED_AMOUNT_MINOR, "2026-07-04"),
  transaction("zero-value", "income", 0, "2026-07-05"),
  transaction("medium-income", "income", MEDIUM_AMOUNT_MINOR, "2026-07-06"),
  transaction("medium-expense", "expense", MEDIUM_AMOUNT_MINOR, "2026-07-07"),
  transaction("large-income", "income", LARGE_AMOUNT_MINOR, "2026-07-08"),
  transaction("large-expense", "expense", LARGE_AMOUNT_MINOR, "2026-07-09"),
  ...Array.from({ length: aggregateIncomeCount }, (_, index) =>
    transaction(
      `aggregate-income-${index + 1}`,
      "income",
      LARGE_PERSISTED_AMOUNT_MINOR,
      "2026-07-10",
    ),
  ),
];
const negativeSummaryTransactions = [
  transaction(
    "negative-summary",
    "expense",
    LARGE_PERSISTED_AMOUNT_MINOR,
    "2026-07-01",
    "account-negative",
  ),
];

assert.ok(
  transactions.every((item) => Number.isSafeInteger(item.amountMinor) && item.amountMinor >= 0),
  "every persisted fixture must remain inside the SolverFin safe JSON integer range",
);
assert.ok(
  transactions.some((item) => item.amountMinor > 2_147_483_647),
  "fixtures must prove values above the former signed 32-bit persistence ceiling",
);

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
  const url = new URL(String(input), "http://solverfin.test");

  if (url.pathname === "/api/accounts") {
    return jsonResponse({
      accounts: [
        {
          id: "account-long-values",
          name: "Conta de valores extensos",
          kind: "checking",
          status: "active",
          openingBalanceMinor: 0,
        },
        {
          id: "account-negative",
          name: "Conta negativa",
          kind: "checking",
          status: "active",
          openingBalanceMinor: 0,
        },
      ],
    });
  }

  if (url.pathname === "/api/categories") return jsonResponse({ categories: [] });
  if (url.pathname === "/api/recurrences") return jsonResponse({ recurrences: [] });
  if (url.pathname === "/api/transactions") {
    return jsonResponse({
      transactions:
        url.searchParams.get("accountId") === "account-negative"
          ? negativeSummaryTransactions
          : transactions,
    });
  }

  return jsonResponse({});
};

const html = await renderTransactionsPage(
  "session-token",
  new URL("http://solverfin.test/lancamentos?accountId=account-long-values&month=2026-07"),
);
const negativeSummaryHtml = await renderTransactionsPage(
  "session-token",
  new URL("http://solverfin.test/lancamentos?accountId=account-negative&month=2026-07"),
);
globalThis.fetch = originalFetch;

const maxIncomeRow = extractRow(html, "max-income");
const zeroBalanceRow = extractRow(html, "balance-to-zero");
const negativeBalanceRow = extractRow(html, "negative-balance");
const backToZeroRow = extractRow(html, "back-to-zero");
const zeroValueRow = extractRow(html, "zero-value");
const mediumIncomeRow = extractRow(html, "medium-income");
const largeIncomeRow = extractRow(html, "large-income");
const aggregateFinalRow = extractRow(html, `aggregate-income-${aggregateIncomeCount}`);

assert.match(maxIncomeRow, /col-amount[^>]*>R\$\s*30\.000\.000,00<\/strong>/);
assert.match(zeroBalanceRow, /data-balance-minor="0">R\$\s*0,00<\/strong>/);
assert.match(
  negativeBalanceRow,
  /data-balance-minor="-3000000000">(?:-R\$\s*30\.000\.000,00|R\$\s*-30\.000\.000,00)<\/strong>/,
);
assert.match(backToZeroRow, /data-balance-minor="0">R\$\s*0,00<\/strong>/);
assert.match(zeroValueRow, /col-amount[^>]*>R\$\s*0,00<\/strong>/);
assert.match(zeroValueRow, /data-balance-minor="0">R\$\s*0,00<\/strong>/);
assert.match(mediumIncomeRow, /col-amount[^>]*>R\$\s*999\.999,99<\/strong>/);
assert.match(largeIncomeRow, /col-amount[^>]*>R\$\s*9\.999\.999,99<\/strong>/);

const expectedAggregateBalanceMinor = aggregateIncomeCount * LARGE_PERSISTED_AMOUNT_MINOR;
assert.equal(expectedAggregateBalanceMinor, 141_000_000_000);
assert.match(
  aggregateFinalRow,
  new RegExp(
    `data-balance-minor="${expectedAggregateBalanceMinor}">R\\$\\s*1\\.410\\.000\\.000,00<\\/strong>`,
  ),
);

const expectedIncomeMinor =
  (aggregateIncomeCount + 2) * LARGE_PERSISTED_AMOUNT_MINOR +
  MEDIUM_AMOUNT_MINOR +
  LARGE_AMOUNT_MINOR;
const expectedExpenseMinor =
  2 * LARGE_PERSISTED_AMOUNT_MINOR + MEDIUM_AMOUNT_MINOR + LARGE_AMOUNT_MINOR;
assert.equal(expectedIncomeMinor, 148_099_999_998);
assert.equal(expectedExpenseMinor, 7_099_999_998);

const summaryBalance = extractElement(html, "section", "summary-balance");
assert.match(summaryBalance, /Saldo atual/);
assert.match(summaryBalance, /R\$\s*1\.410\.000\.000,00/);

const receipts = extractSummaryTotal(html, "Receitas");
assert.match(receipts, /R\$\s*1\.480\.999\.999,98/);

const expenses = extractSummaryTotal(html, "Despesas");
assert.match(expenses, /(?:-R\$\s*70\.999\.999,98|R\$\s*-70\.999\.999,98)/);

const unreconciled = extractStatusLine(html, "Não conciliados");
assert.match(unreconciled, /<strong>R\$\s*1\.551\.999\.999,96<\/strong>/);

const negativeSummaryBalance = extractElement(negativeSummaryHtml, "section", "summary-balance");
assert.match(negativeSummaryBalance, /(?:-R\$\s*30\.000\.000,00|R\$\s*-30\.000\.000,00)/);

assert.match(
  html,
  /\.summary-balance strong, \.summary-total strong, \.status-line strong, \.col-amount, \.col-balance \{[^}]*white-space:\s*nowrap/,
);
assert.match(html, /\.statement-layout \.summary-totals\s*\{\s*grid-template-columns:\s*1fr/);
assert.match(html, /\.statement-layout \.status-line strong\s*\{[^}]*grid-column:\s*1 \/ -1/);
assert.match(html, /\.statement-table \.statement-row\s*\{[^}]*min-width:\s*70rem/);
assert.match(
  html,
  /@media \(max-width: 760px\)[\s\S]*\.statement-row\.statement-body \{ min-width:\s*0/,
);

function transaction(
  id: string,
  kind: "income" | "expense",
  amountMinor: number,
  date: string,
  accountId = "account-long-values",
): {
  id: string;
  description: string;
  kind: string;
  status: string;
  amountMinor: number;
  occurredOn: string;
  plannedOn: string;
  effectiveOn: string;
  accountId: string;
} {
  return {
    id,
    description: id,
    kind,
    status: "posted",
    amountMinor,
    occurredOn: date,
    plannedOn: date,
    effectiveOn: date,
    accountId,
  };
}

function extractRow(pageHtml: string, transactionId: string): string {
  const marker = `data-transaction="${transactionId}"`;
  const markerIndex = pageHtml.indexOf(marker);
  assert.notEqual(markerIndex, -1, `row ${transactionId} should be rendered`);

  const start = pageHtml.lastIndexOf('<article class="statement-row statement-body"', markerIndex);
  const end = pageHtml.indexOf("</article>", markerIndex);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  return pageHtml.slice(start, end + "</article>".length);
}

function extractElement(pageHtml: string, tag: string, className: string): string {
  const match = new RegExp(`<${tag} class="${className}"[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(
    pageHtml,
  );
  assert.ok(match, `${className} should be rendered`);
  return match[0];
}

function extractSummaryTotal(pageHtml: string, label: string): string {
  const match = new RegExp(
    `<div class="summary-total"><span>${label}<\\/span><strong[^>]*>([\\s\\S]*?)<\\/strong><\\/div>`,
  ).exec(pageHtml);
  assert.ok(match, `${label} total should be rendered`);
  return match[0];
}

function extractStatusLine(pageHtml: string, label: string): string {
  const match = new RegExp(
    `<div class="status-line">[\\s\\S]*?<p>${label}<\\/p><strong>[\\s\\S]*?<\\/strong><\\/div>`,
  ).exec(pageHtml);
  assert.ok(match, `${label} status line should be rendered`);
  return match[0];
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
