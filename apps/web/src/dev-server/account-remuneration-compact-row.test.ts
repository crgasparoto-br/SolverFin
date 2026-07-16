import assert from "node:assert/strict";

import { enhanceStatementListSorting } from "./list-sorting-enhancement.js";

const transaction = {
  id: "remuneracao-ajustada",
  effectiveOn: "2026-07-16",
  plannedOn: "2026-07-16",
  occurredOn: "2026-07-16",
  description:
    "Rendimento previsto — 100% do CDI · competência 2026-07-15 · saldo-base R$ 9.933,48 · CDI 0,052531% · valor original R$ 5,22",
  amountMinor: 600,
  source: "account_remuneration",
  accountRemuneration: {
    competenceOn: "2026-07-15",
    processedOn: "2026-07-16",
    balanceBaseMinor: 993348,
    dailyRatePercent: 0.052531,
    remunerationPercent: 100,
    appliedDailyRatePercent: 0.052531,
    originalAmountMinor: 522,
    manuallyAdjusted: true,
    adjustedAt: "2026-07-16T12:00:00.000Z",
  },
};

const html = enhanceStatementListSorting(
  documentHtml(`
    <form class="filter-form" method="get" action="/lancamentos"><input name="month" value="2026-07" /></form>
    <div class="statement-table" role="table" aria-label="Extrato bancário">
      <div class="statement-row statement-head"></div>
      <article class="statement-row statement-body account-remuneration-row" role="row">
        <div class="description col-description">
          <strong>${transaction.description}<span class="account-remuneration-badge">Remuneração CDI</span></strong>
          <section class="account-remuneration-audit" aria-label="Memória do cálculo da remuneração">
            <div class="account-remuneration-audit-heading"><strong>Memória do cálculo</strong><span class="account-remuneration-adjustment adjusted">Ajustado manualmente</span></div>
            <dl><div><dt>Competência</dt><dd>15/07/2026</dd></div></dl>
          </section>
        </div>
        <script type="application/json" data-transaction="remuneracao-ajustada">${escapedJson(transaction)}</script>
      </article>
    </div>
  `),
  new URL("http://solverfin.test/lancamentos"),
);

assert.match(html, /<strong>Remuneração CDI<span class="account-remuneration-badge">CDI<\/span><\/strong>/);
assert.match(html, /Competência 15\/07\/2026 · 100% do CDI/);
assert.match(html, /<summary>Ver memória do cálculo<\/summary>/);
assert.match(html, /Ajustado manualmente/);
assert.match(html, /Valor original<\/dt><dd>R\$\s*5,22/);
assert.doesNotMatch(html, /<details class="account-remuneration-audit"[^>]* open/);
assert.doesNotMatch(html, /<strong>Rendimento previsto/);

function escapedJson(value: unknown): string {
  return JSON.stringify(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function documentHtml(content: string): string {
  return `<!doctype html><html><head></head><body>${content}</body></html>`;
}
