import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { buildInstallmentAnalysisViewModel } from "./reports-analysis-view-model.js";
import { renderReportsRoutePage } from "./reports-route-page.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("issue 611 report drilldown remediation", () => {
  it("keeps homonymous aggregates separated by canonical id", () => {
    const blocks = buildInstallmentAnalysisViewModel(
      [
        installment("first", "card-a", "category-a"),
        installment("second", "card-b", "category-b"),
        installment("synthetic"),
      ],
      "2026-07-01",
      (month) => month,
    );
    const block = blocks[0];

    assert.ok(block);
    assert.equal(block.groups.cards.length, 3);
    assert.equal(block.groups.cards[0]?.filterId, "card-a");
    assert.equal(block.groups.cards[1]?.filterId, "card-b");
    assert.equal(block.groups.cards[2]?.filterId, undefined);
    assert.equal(block.groups.categories.length, 3);
    assert.equal(block.groups.categories[0]?.filterId, "category-a");
    assert.equal(block.groups.categories[1]?.filterId, "category-b");
    assert.equal(block.groups.categories[2]?.filterId, undefined);
  });

  it("navigates to the exact id and preserves compatible filters", async () => {
    const installmentQueries: URL[] = [];
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname === "/api/installments") {
        installmentQueries.push(url);
        return jsonResponse({
          installments: [
            installment("first", "card-a", "category-a"),
            installment("second", "card-b", "category-b"),
            installment("synthetic"),
          ],
        });
      }
      if (url.pathname === "/api/cards") {
        return jsonResponse({ cards: cards() });
      }
      if (url.pathname === "/api/categories") {
        return jsonResponse({ categories: categories() });
      }
      return jsonResponse({});
    };

    const initialHtml = await renderReportsRoutePage("token", initialUrl());
    const cardLinks = extractDrilldowns(initialHtml, "card");
    const categoryLinks = extractDrilldowns(initialHtml, "category");

    assert.equal(cardLinks.length, 2);
    assert.equal(categoryLinks.length, 2);
    assert.equal(cardLinks[0]?.searchParams.get("cardId"), "card-a");
    assert.equal(cardLinks[1]?.searchParams.get("cardId"), "card-b");
    assert.equal(categoryLinks[0]?.searchParams.get("categoryId"), "category-a");
    assert.equal(categoryLinks[1]?.searchParams.get("categoryId"), "category-b");

    const cardBUrl = cardLinks[1];
    assert.ok(cardBUrl);
    assert.equal(cardBUrl.searchParams.get("month"), "2026-07");
    assert.equal(cardBUrl.searchParams.get("status"), "planned");
    assert.equal(cardBUrl.searchParams.get("profileId"), "profile-a");
    assert.equal(cardBUrl.searchParams.get("categoryId"), "category-a");

    const drilledHtml = await renderReportsRoutePage("token", cardBUrl);
    const lastQuery = installmentQueries.at(-1);

    assert.equal(lastQuery?.searchParams.get("cardId"), "card-b");
    assert.equal(lastQuery?.searchParams.get("categoryId"), "category-a");
    assert.match(drilledHtml, /<option value="card-b" selected>/);
    assert.match(initialHtml, /abrir recorte deste cartão/);
    assert.match(initialHtml, /abrir recorte desta categoria/);
  });
});

function initialUrl(): URL {
  const url = new URL("http://localhost/relatorios");
  url.searchParams.set("view", "installments");
  url.searchParams.set("month", "2026-07");
  url.searchParams.set("status", "planned");
  url.searchParams.set("profileId", "profile-a");
  url.searchParams.set("categoryId", "category-a");
  return url;
}

function extractDrilldowns(html: string, kind: "card" | "category"): URL[] {
  const pattern = new RegExp(`data-report-drilldown="${kind}" href="([^"]+)"`, "g");
  return Array.from(html.matchAll(pattern), (match) => {
    const href = (match[1] ?? "").replaceAll("&amp;", "&");
    return new URL(href, "http://localhost");
  });
}

function cards() {
  return [
    { id: "card-a", name: "Cartão compartilhado" },
    { id: "card-b", name: "Cartão compartilhado" },
  ];
}

function categories() {
  return [
    { id: "category-a", name: "Categoria compartilhada" },
    { id: "category-b", name: "Categoria compartilhada" },
  ];
}

function installment(id: string, cardId?: string, categoryId?: string) {
  const transaction = {
    id: `transaction-${id}`,
    description: `Parcela ${id}`,
    status: "planned",
  };
  return {
    id,
    status: "planned",
    sequenceNumber: 1,
    totalInstallments: 1,
    dueOn: "2026-07-15",
    amountMinor: 1000,
    currency: "BRL",
    transaction,
    ...(cardId ? { card: { id: cardId, name: "Cartão compartilhado", status: "active" } } : {}),
    ...(categoryId
      ? {
          category: {
            id: categoryId,
            name: "Categoria compartilhada",
            kind: "expense",
            status: "active",
          },
        }
      : {}),
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
