import assert from "node:assert/strict";

import { renderTransactionsPage } from "./transactions-page.js";

const originalFetch = globalThis.fetch;

globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
  const url = new URL(String(input), "http://solverfin.test");

  if (url.pathname === "/api/accounts") {
    return jsonResponse({
      accounts: [
        {
          id: "account-1",
          name: "Conta principal",
          kind: "checking",
          status: "active",
          openingBalanceMinor: 10000,
        },
      ],
    });
  }

  if (url.pathname === "/api/categories") {
    return jsonResponse({ categories: [] });
  }

  if (url.pathname === "/api/recurrences") {
    return jsonResponse({ recurrences: [] });
  }

  if (url.pathname === "/api/transactions") {
    assert.equal(url.searchParams.get("accountId"), "account-1");
    assert.equal(url.searchParams.get("plannedTo"), "2026-07-31");

    return jsonResponse({
      transactions: [
        transaction("posted-income", "income", "posted", 20000, "2026-07-01", {
          effectiveOn: "2026-07-01",
        }),
        transaction("planned-expense", "expense", "planned", 30000, "2026-07-02"),
        transaction("suggested-expense", "expense", "suggested", 1000, "2026-07-03"),
        transaction("reconciled-income", "income", "reconciled", 5000, "2026-07-04", {
          effectiveOn: "2026-07-04",
        }),
      ],
    });
  }

  return jsonResponse({});
};

const html = await renderTransactionsPage(
  "session-token",
  new URL("http://solverfin.test/lancamentos?accountId=account-1&month=2026-07"),
);

globalThis.fetch = originalFetch;

assertRowPresentation(html, "posted-income", {
  balanceMinor: 30000,
  balanceText: /R\$\s*300,00/,
  statusLabel: "Efetivado não conciliado",
  tone: "posted",
});
assertRowPresentation(html, "planned-expense", {
  balanceMinor: 0,
  balanceText: /R\$\s*0,00/,
  statusLabel: "Previsto",
  tone: "planned",
});
assertRowPresentation(html, "suggested-expense", {
  balanceMinor: -1000,
  balanceText: /-R\$\s*10,00|R\$\s*-10,00/,
  statusLabel: "Pendente",
  tone: "pending",
  negative: true,
});
assertRowPresentation(html, "reconciled-income", {
  balanceMinor: 4000,
  balanceText: /R\$\s*40,00/,
  statusLabel: "Conciliado",
  tone: "ok",
});

assert.match(html, /Saldo atual[\s\S]*R\$\s*350,00/);
assert.doesNotMatch(html, /<strong class="col-balance">Previsto<\/strong>/);
assert.doesNotMatch(html, /account-summary[\s\S]*<section class="quick-actions"/);
assert.match(html, /statement-heading-actions/);
assert.match(html, /grid-template-columns:\s*minmax\(260px, 320px\) minmax\(0,1fr\)/);
assert.match(html, /@media \(max-width: 1279px\)/);
assert.match(html, /font-variant-numeric:\s*tabular-nums/);
assert.match(html, /\.statement-status::after\s*\{\s*content:\s*none/);
assert.match(html, /\.statement-tooltip-layer\s*\{[\s\S]*position:\s*fixed/);
assert.match(html, /trigger\.setAttribute\("aria-describedby", tooltipId\)/);
assert.match(html, /activeTrigger\.getBoundingClientRect\(\)/);
assert.match(html, /document\.addEventListener\("scroll", positionTooltip, true\)/);
assert.match(html, /\.statement-layout \.summary-totals\s*\{\s*grid-template-columns:\s*1fr/);
assert.match(html, /\.statement-layout \.status-line strong\s*\{[\s\S]*grid-column:\s*1 \/ -1/);
assert.match(html, /\.statement-table \.statement-row\s*\{[\s\S]*min-width:\s*70rem/);
assert.match(html, /\.statement-table \.col-amount,[\s\S]*min-width:\s*max-content/);
assert.match(html, /\.main-area\s*>\s*main\s*\{[\s\S]*max-width:\s*1800px/);
assert.match(html, /body\s*\{[\s\S]*overflow-x:\s*hidden/);
assert.match(html, /@media \(min-width: 761px\) and \(max-width: 900px\)/);
assert.match(html, /\.account-filter \.filter-form\s*\{\s*grid-template-columns:\s*1fr/);
assert.match(html, /\.account-filter \.month-nav input\[type="month"\]\s*\{\s*min-width:\s*10rem/);

function assertRowPresentation(
  pageHtml: string,
  transactionId: string,
  expected: {
    balanceMinor: number;
    balanceText: RegExp;
    statusLabel: string;
    tone: string;
    negative?: boolean;
  },
): void {
  const row = extractRow(pageHtml, transactionId);

  assert.match(row, new RegExp(`statement-status statement-status-${expected.tone} col-status`));
  assert.match(row, /role="img"/);
  assert.match(row, /tabindex="0"/);
  assert.match(row, new RegExp(`aria-label="${expected.statusLabel}"`));
  assert.match(row, new RegExp(`title="${expected.statusLabel}"`));
  assert.match(row, new RegExp(`data-tooltip="${expected.statusLabel}"`));
  assert.match(row, /statement-status[\s\S]*<svg/);
  assert.match(row, new RegExp(`data-balance-minor="${expected.balanceMinor}"`));
  assert.match(row, expected.balanceText);

  if (expected.negative) {
    assert.match(row, /class="col-balance debit"/);
  } else {
    assert.doesNotMatch(row, /class="col-balance debit"/);
  }
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

function transaction(
  id: string,
  kind: string,
  status: string,
  amountMinor: number,
  date: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    description: id,
    kind,
    status,
    amountMinor,
    occurredOn: date,
    plannedOn: date,
    accountId: "account-1",
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
