import assert from "node:assert/strict";

import {
  enhanceCardListSorting,
  enhanceStatementListSorting,
  resolveListSort,
} from "./list-sorting-enhancement.js";

assert.equal(resolveListSort("amount_desc", "date_asc"), "amount_desc");
assert.equal(resolveListSort("invalid", "date_asc"), "date_asc");

const statementHtml = documentHtml(`
  <form class="filter-form" method="get" action="/lancamentos"><input name="month" value="2026-07" /></form>
  <div class="statement-table" role="table" aria-label="Extrato bancário">
    <div class="statement-row statement-head"></div>
    ${statementRow("a", "2026-07-02", "Zebra", 1000)}
    ${statementRow("b", "2026-07-01", "Aluguel", 5000)}
    ${statementRow("c", "2026-07-03", "Mercado", 3000)}
  </div>
`);

const statementSorted = enhanceStatementListSorting(
  statementHtml,
  new URL("http://solverfin.test/lancamentos?sort=amount_desc"),
);
assert.ok(
  statementSorted.indexOf('data-transaction="b"') < statementSorted.indexOf('data-transaction="c"'),
);
assert.ok(
  statementSorted.indexOf('data-transaction="c"') < statementSorted.indexOf('data-transaction="a"'),
);
assert.match(statementSorted, /name="sort" data-list-sort/);
assert.match(statementSorted, /value="amount_desc" selected/);
assert.match(
  statementSorted,
  /button\.account-select-trigger:hover:not\(:disabled\),button\.account-select-trigger:focus-visible,button\.account-select-trigger\[aria-expanded="true"\]\{background:var\(--primary-soft\);border-color:#c8dde5;color:var\(--text\)\}/,
);
assert.match(
  statementSorted,
  /\.purchase-row:hover,\.statement-row\.statement-body:hover\{background:#f6fafb\}/,
);
assert.match(
  statementSorted,
  /\.ghost-button:hover:not\(:disabled\),\.ghost-button:focus-visible,[^}]+background:var\(--primary-soft\)/,
);
assert.match(
  statementSorted,
  /\.actions-item:hover:not\(:disabled\),\.actions-item:focus-visible\{background:var\(--primary-soft\);color:var\(--text\)\}/,
);
assert.match(
  statementSorted,
  /@media\(max-width:900px\)\{form\.filter-form\[action="\/lancamentos"\]\{grid-template-columns:1fr\}form\.filter-form\[action="\/lancamentos"\] \.month-nav input\[type="month"\]\{min-width:10rem\}/,
);

const statementWithRemunerationHtml = documentHtml(`
  <form class="filter-form" method="get" action="/lancamentos"><input name="month" value="2026-07" /></form>
  <div class="statement-table" role="table" aria-label="Extrato bancário">
    <div class="statement-row statement-head"></div>
    ${statementRow("older", "2026-07-10", "Mercado", 3000)}
    ${statementRow("remuneracao", "2026-07-14", "Rendimento previsto — 100% do CDI", 551, " account-remuneration-row")}
    ${statementRow("newer", "2026-07-15", "Aluguel", 5000)}
  </div>
`);

const statementDefaultSorted = enhanceStatementListSorting(
  statementWithRemunerationHtml,
  new URL("http://solverfin.test/lancamentos"),
);
assert.ok(
  statementDefaultSorted.includes('data-transaction="remuneracao"'),
  "remuneration rows must survive statement sorting",
);
assert.ok(statementDefaultSorted.includes("account-remuneration-row"));
assert.ok(
  statementDefaultSorted.indexOf('data-transaction="older"') <
    statementDefaultSorted.indexOf('data-transaction="remuneracao"'),
);
assert.ok(
  statementDefaultSorted.indexOf('data-transaction="remuneracao"') <
    statementDefaultSorted.indexOf('data-transaction="newer"'),
);

const statementRemunerationDescSorted = enhanceStatementListSorting(
  statementWithRemunerationHtml,
  new URL("http://solverfin.test/lancamentos?sort=date_desc"),
);
assert.ok(
  statementRemunerationDescSorted.indexOf('data-transaction="newer"') <
    statementRemunerationDescSorted.indexOf('data-transaction="remuneracao"'),
);
assert.ok(
  statementRemunerationDescSorted.indexOf('data-transaction="remuneracao"') <
    statementRemunerationDescSorted.indexOf('data-transaction="older"'),
);

const statementCompactRemuneration = enhanceStatementListSorting(
  documentHtml(`
    <form class="filter-form" method="get" action="/lancamentos"><input name="month" value="2026-07" /></form>
    <div class="statement-table" role="table" aria-label="Extrato bancário">
      <div class="statement-row statement-head"></div>
      ${remunerationStatementRow()}
    </div>
  `),
  new URL("http://solverfin.test/lancamentos"),
);
assert.match(
  statementCompactRemuneration,
  /<strong>Remuneração CDI<span class="account-remuneration-badge">CDI<\/span><\/strong>/,
);
assert.match(statementCompactRemuneration, /Competência 15\/07\/2026 · 100% do CDI/);
assert.match(
  statementCompactRemuneration,
  /<details class="account-remuneration-audit">\s*<summary>Ver memória do cálculo<\/summary>/,
);
assert.doesNotMatch(
  statementCompactRemuneration,
  /<details class="account-remuneration-audit"[^>]* open/,
);
assert.match(statementCompactRemuneration, /Saldo-base/);
assert.match(statementCompactRemuneration, /R\$\s*9\.933,48/);
assert.match(statementCompactRemuneration, /CDI diário/);
assert.match(statementCompactRemuneration, /0,052531%/);
assert.doesNotMatch(statementCompactRemuneration, /<strong>Rendimento previsto/);
assert.doesNotMatch(statementCompactRemuneration, /<section class="account-remuneration-audit"/);
assert.match(
  statementCompactRemuneration,
  /grid-template-columns:repeat\(auto-fit,minmax\(7\.5rem,1fr\)\)/,
);

const cardHtml = documentHtml(`
  <form class="filter-form" method="get" action="/cartoes"><input name="month" value="2026-07" /></form>
  <button type="button" class="toggle-chip" aria-pressed="true">Conciliados</button>
  <div class="purchase-list" aria-label="Compras da fatura">
    ${purchaseRow("a", "2026-07-02", "Zebra", 1000)}
    ${purchaseRow("b", "2026-07-01", "Aluguel", 5000)}
    ${purchaseRow("c", "2026-07-03", "Mercado", 3000)}
  </div>
`);

const cardSorted = enhanceCardListSorting(
  cardHtml,
  new URL("http://solverfin.test/cartoes?sort=description_asc"),
);
assert.ok(cardSorted.indexOf('data-purchase="b"') < cardSorted.indexOf('data-purchase="c"'));
assert.ok(cardSorted.indexOf('data-purchase="c"') < cardSorted.indexOf('data-purchase="a"'));
assert.match(cardSorted, /value="description_asc" selected/);
assert.match(
  cardSorted,
  /button\.account-select-trigger:hover:not\(:disabled\),button\.account-select-trigger:focus-visible,button\.account-select-trigger\[aria-expanded="true"\]\{background:var\(--primary-soft\);border-color:#c8dde5;color:var\(--text\)\}/,
);
assert.match(
  cardSorted,
  /\.toggle-chip:hover:not\(:disabled\),\.toggle-chip:focus-visible\{background:#f1f7f9;border-color:#a5cbd6;color:var\(--primary\)\}/,
);
assert.match(
  cardSorted,
  /\.toggle-chip\[aria-pressed="true"\]:hover:not\(:disabled\)\{background:#dceef3\}/,
);

function statementRow(
  id: string,
  date: string,
  description: string,
  amountMinor: number,
  extraClasses = "",
): string {
  return `<article class="statement-row statement-body${extraClasses}" role="row"><script type="application/json" data-transaction="${id}">${escapedJson({ id, effectiveOn: date, plannedOn: date, occurredOn: date, description, amountMinor })}</script></article>`;
}

function remunerationStatementRow(): string {
  const accountRemuneration = {
    competenceOn: "2026-07-15",
    processedOn: "2026-07-16",
    balanceBaseMinor: 993348,
    dailyRatePercent: 0.052531,
    remunerationPercent: 100,
    appliedDailyRatePercent: 0.052531,
    originalAmountMinor: 522,
    manuallyAdjusted: false,
  };
  const transaction = {
    id: "remuneracao-compacta",
    effectiveOn: "2026-07-16",
    plannedOn: "2026-07-16",
    occurredOn: "2026-07-16",
    description:
      "Rendimento previsto — 100% do CDI · competência 2026-07-15 · saldo-base R$ 9.933,48 · CDI 0,052531% · valor original R$ 5,22",
    amountMinor: 522,
    source: "account_remuneration",
    accountRemuneration,
  };

  return `<article class="statement-row statement-body account-remuneration-row" role="row">
    <div class="description col-description">
      <strong>${transaction.description}<span class="account-remuneration-badge">Remuneração CDI</span></strong>
      <section class="account-remuneration-audit" aria-label="Memória do cálculo da remuneração">
        <div class="account-remuneration-audit-heading"><strong>Memória do cálculo</strong><span class="account-remuneration-adjustment original">Valor original</span></div>
        <dl><div><dt>Competência</dt><dd>15/07/2026</dd></div></dl>
      </section>
    </div>
    <script type="application/json" data-transaction="remuneracao-compacta">${escapedJson(transaction)}</script>
  </article>`;
}

function purchaseRow(id: string, date: string, description: string, amountMinor: number): string {
  return `<article class="purchase-row"><script type="application/json" data-purchase="${id}">${escapedJson({ id, occurredOn: date, description, amountMinor })}</script></article>`;
}

function escapedJson(value: unknown): string {
  return JSON.stringify(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function documentHtml(content: string): string {
  return `<!doctype html><html><head></head><body>${content}</body></html>`;
}
