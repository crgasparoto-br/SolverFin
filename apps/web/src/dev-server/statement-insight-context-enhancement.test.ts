import assert from "node:assert/strict";

import { enhanceStatementInsightContext } from "./statement-insight-context-enhancement.js";

filtersCategoryAndMerchantWithoutExposingCategoryId();
preservesContextWhenStatementFiltersSubmit();

function filtersCategoryAndMerchantWithoutExposingCategoryId(): void {
  const categoryId = "88888888-8888-4888-8888-888888888888";
  const html = documentHtml([
    transactionRow("matching", "Mercado São 123", categoryId),
    transactionRow(
      "other-category",
      "Mercado São 456",
      "99999999-9999-4999-8999-999999999999",
    ),
    transactionRow("other-merchant", "Farmácia Central", categoryId),
    groupRow(),
  ]);
  const url = new URL(
    `http://solverfin.test/lancamentos?month=2026-08&categoryId=${categoryId}&merchantKey=mercado+sao`,
  );

  const enhanced = enhanceStatementInsightContext(html, url);

  assert.match(enhanced, /data-transaction="matching"/);
  assert.doesNotMatch(enhanced, /data-transaction="other-category"/);
  assert.doesNotMatch(enhanced, /data-transaction="other-merchant"/);
  assert.doesNotMatch(enhanced, /data-group-row=/);
  assert.match(enhanced, /Filtro do insight ativo/);
  assert.match(enhanced, /o estabelecimento mercado sao/);
  assert.match(enhanced, /O resumo da conta permanece completo/);
  const notice = enhanced.match(/<p class="insight-context-notice"[\s\S]*?<\/p>/)?.[0] ?? "";
  assert.doesNotMatch(notice, new RegExp(categoryId));
}

function preservesContextWhenStatementFiltersSubmit(): void {
  const categoryId = "88888888-8888-4888-8888-888888888888";
  const html = documentHtml([transactionRow("matching", "Mercado São", categoryId)]);
  const enhanced = enhanceStatementInsightContext(
    html,
    new URL(
      `http://solverfin.test/lancamentos?accountId=account-1&month=2026-08&categoryId=${categoryId}&merchantKey=Mercado%20S%C3%A3o%20123`,
    ),
  );

  assert.match(
    enhanced,
    new RegExp(`name="categoryId" value="${categoryId}" data-insight-context-param`),
  );
  assert.match(
    enhanced,
    /name="merchantKey" value="mercado sao" data-insight-context-param/,
  );
}

function documentHtml(rows: readonly string[]): string {
  return `<!doctype html><html><head><style>.existing { display: block; }</style></head><body>
    <form class="filter-form" method="get" action="/lancamentos" data-auto-submit>
      <input name="month" value="2026-08">
    </form>
    <section class="statement-layout">
      <aside class="account-summary">Resumo completo</aside>
      <section class="statement-table">${rows.join("")}</section>
    </section>
  </body></html>`;
}

function transactionRow(id: string, description: string, categoryId: string): string {
  return `<article class="statement-row statement-body" role="row">
    <span>${description}</span>
    <script type="application/json" data-transaction="${id}">${JSON.stringify({
      id,
      description,
      categoryId,
    })}</script>
  </article>`;
}

function groupRow(): string {
  return `<article class="statement-row statement-body grouped-row" role="row" data-group-row="group-1">
    <span>Grupo</span><script type="application/json" data-group="group-1">{}</script>
  </article>`;
}
