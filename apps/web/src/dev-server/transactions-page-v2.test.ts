import assert from "node:assert/strict";
import test from "node:test";

import { renderTransactionsPageV2 } from "./transactions-page-v2.js";

const originalFetch = globalThis.fetch;

test("A2 statement keeps account and USD currency explicit while sorting before render", async () => {
  globalThis.fetch = mockFetch([
    transaction("older", "Assinatura", 2500, "2026-08-02"),
    transaction("newer", "Receita exterior", 15000, "2026-08-20", "income"),
  ]);

  try {
    const html = await renderTransactionsPageV2(
      "session-token",
      new URL(
        "http://solverfin.test/lancamentos?accountId=account-usd&month=2026-08&sort=date_desc",
      ),
    );

    assert.match(html, /data-statement-archetype="A2"/);
    assert.match(html, /class="sf-page-header"/);
    assert.match(html, /class="sf-filter-bar"/);
    assert.match(html, /Conta internacional/);
    assert.match(html, /data-context="currency">USD</);
    assert.match(html, /US\$|USD/);
    assert.doesNotMatch(html, /Valor \(R\$\)/);
    assert.ok(html.indexOf("Receita exterior") < html.indexOf("Assinatura"));
    assert.match(html, /data-statement-date-group="2026-08-20"/);
    assert.match(html, /name="q" type="search"/);
    assert.match(html, /name="sort"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("A2 account picker allocates a wider responsive filter column (#708)", async () => {
  globalThis.fetch = mockFetch([]);

  try {
    const html = await renderTransactionsPageV2(
      "¶»§q«^