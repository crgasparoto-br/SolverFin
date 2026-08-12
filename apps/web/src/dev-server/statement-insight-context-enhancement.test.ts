import assert from "node:assert/strict";

import { enhanceStatementInsightContext } from "./statement-insight-context-enhancement.js";

const CATEGORY_ID = "88888888-8888-4888-8888-888888888888";
const OTHER_CATEGORY_ID = "99999999-9999-4999-8999-999999999999";

filtersCategoryAndMerchantWithoutExposingCategoryId();
preservesContextWhenStatementFiltersSubmit();

function filtersCategoryAndMerchantWithoutExposingCategoryId(): void {
  const rows = [
    transactionRow("matching", "Mercado São 123", CATEGORY_ID),
    transactionRow("other-category", "Mercado São 456", OTHER_CATEGORY_ID),
    transactionRow("other-merchant", "Farmácia Central", CATEGORY_ID),
    groupRow(),
  ];
  const enhanced = enhanceStatementInsightContext(documentHtml(rows), statementUrl("mercado sao"));

  assert.match(enhanced, /data-transaction="matching"/);
  assert.doesNotMatch(enhanced, /data-transaction="other-category"/);
  assert.doesNotMatch(enhanced, /data-transaction="other-merchant"/);
  assert.doesNotMatch(enhanced, /data-group-row=/);
  assert.match(enhanced, /Filtro do insight ativo/);
  assert.match(enhanced, /o estabelecimento mercado sao/);
  assert.match(enhanced, /O resumo da conta permanece completo/);

  const noticePattern = /<p class="insight-context-notice"[\s\S]*?<\/p>/;
  const notice = enhanced.match(noticePattern)?.[0] ?? "";
  assert.doesNotMatch(notice, new RegExp(CATEGORY_ID));
}

function preservesContextWhenStatementFiltersSubmit(): void {
  const rows = [transactionRow("matching", "Mercado São", CATEGORY_ID)];
  const enhanced = enhanceStatementInsightContext(
    documentHtml(rows),
    statementUrl("Mercado São 123"),
  );
  const categoryInput = `name="categoryId" value="${CATEGORY_ID}" data-insight-context-param`;

  assert.ok(enhanced.includes(categoryInput));
  assert.match(enhanced, /name="merchantKey" value="mercado sao" data-insight-context-param/);
}

function statementUrl(merchantKey: string): URL {
  const url = new URL("/lancamentos", "http://solverfin.test");
  url.searchParams.set("accountId", "account-1");
  url.searchParams.set("month", "2026-08");
  url.searchParams.set("categoryId", CATEGORY_ID);
  url.searchParams.set("merchantKey", merchantKey);
  return url;
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
  const payload = JSON.stringify({ id, description, categoryId });
  return `<article class="statement-row statement-body" role="row">
    <span>${description}</span>
    <script type="application/json" data-transaction="${id}">${payload}</script>
  </article>`;
}

function groupRow(): string {
  return `<article class="statement-row statement-body grouped-row" role="row" data-group-row="group-1">
    <span>Grupo</span><script type="application/json" data-group="group-1">{}</script>
  </article>`;
}
