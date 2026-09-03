import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { buildInstallmentAnalysisViewModel } from "./reports-analysis-view-model.js";
import { renderReportsRoutePage } from "./reports-route-page.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("issue 611 report drilldown remediation", () => {
  it("keeps homonymous card and category aggregates separated by canonical id", () => {
    const blocks = buildInstallmentAnalysisViewModel(
      [
        installment("first", "card-a", "category-a"),
        installment("second", "card-b", "category-b"),
        installment("without-dimension"),
      ],
      "2026-07-01",
      (month) => month,
    );

    assert.deepEqual(
      blocks[0]?.groups.cards.map((row) => [row.label, row.filterId ?? null]),
      [
        ["Cartão compartilhado", "card-a"],
        ["Cartão compartilhado", "card-b"],
        ["Sem cartão informado", null],
      ],
    );
    assert.deepEqual(
      blocks[0]?.groups.categories.map((row) => [row.label, row.filterId ?? null]),
      [
        ["Categoria compartilhada", "category-a"],
        ["Categoria compartilhada", "category-b"],
        ["Sem categoria", null],
      ],
    );
  });

  it("renders canonical drilldowns with exact ids and preserves compatible filters", async () => {
    const installmentQueries: URL[] = [];
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname === "/api/installments") {
        installmentQueries.push(url);
        return jsonResponse({
          installments: [
            installment("first", "card-a", "category-a"),
            installment("second", "card-b", "category-b"),
            installment("without-dimension"),
          ],
        });
      }
      if (url.pathname === "/api/cards") {
        return jsonResponse({
          cards: [
            { id: "card-a", name: "Cartão compartilhado" },
            { id: "card-b", name: "Cartão compartilhado" },
          ],
        });
      }
      if (url.pathname === "/api/categories") {
        return jsonResponse({
          categories: [
            { id: "category-a", name: "Categoria compartilhada" },
            { id: "category-b", name: "Categoria compartilhada" },
          ],
        });
      }
      return jsonResponse({});
    };

    const initialHtml = await renderReportsRoutePage(
      "token",
      new URL(
        "http://localhost/relatorios?view=installments&month=2026-07&status=planned&profileId=profile-a&categoryId=category-a",
      ),
    );

    const cardLinks = extractDrilldowns(initialHtml, "card");
    const categoryLinks = extractDrilldowns(initialHtml, "category");
    assert.equal(cardLinks.length, 2, "rows without a canonical card id must not invent drilldown");
    assert.equal(
      categoryLinks.length,
      2,
      "rows without a canonical category id must not invent drilldown",
    );
    assert.deepEqual(
      cardLinks.map((url) => url.searchParams.get("cardId")).sort(),
      ["card-a", "card-b"],
    );
    assert.deepEqual(
      categoryLinks.map((url) => url.searchParams.get("categoryId")).sort(),
      ["category-a", "category-b"],
    );
    for (const url of cardLinks) {
      assert.equal(url.searchParams.get("view"), "installments");
      assert.equal(url.searchParams.get("month"), "2026-07");
      assert.equal(url.searchParams.get("status"), "planned");
      assert.equal(url.searchParams.get("profileId"), "profile-a");
      assert.equal(url.searchParams.get("categoryId"), "category-a");
    }

    const cardBUrl = cardLinks.find((url) => url.searchParams.get("cardId") === "card-b");
    assert.ok(cardBUrl);
    const drilledHtml = await renderReportsRoutePage("token", cardBUrl);

    assert.equal(installmentQueries.at(-1)?.searchParams.get("cardId"), "card-b");
    assert.equal(installmentQueries.at(-1)?.searchParams.get("categoryId"), "category-a");
    assert.match(drilledHtml, /<option value="card-b" selected>Cartão compartilhado<\/option>/);
    assert.match(initialHtml, /abrir recorte deste cartão/);
    assert.match(initialHtml, /abrir recorte desta categoria/);
  });
});

function extractDrilldowns(html: string, kind: "card" | "category"): URL[] {
  const pattern = new RegExp(`data-report-drilldown="${kind}" href="([^"]+)"`, "g");
  return Array.from(html.matchAll(pattern), (match) => {
    const href = (match[1] ?? "").replaceAll("&amp;", "&");
    return new URL(href, "http://localhost");
  });
}

function installment(id: string, cardId?: string, categoryId?: string) {
  return {
    id,
    status: "planned",
    sequenceNumber: 1,
    totalInstallments: 1,
    dueOn: "2026-07-15",
    amountMinor: 1000,
    currency: "BRL",
    transaction: { id: `transaction-${id}`, description: `Parcela ${id}`, status: "planned" },
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
