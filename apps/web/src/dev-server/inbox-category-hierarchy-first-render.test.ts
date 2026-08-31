import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderInboxPage } from "./inbox-page.js";

describe("Inbox category hierarchy first render", () => {
  it("uses one canonical category request and renders A6 directly on the first response", async () => {
    const requests: string[] = [];
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      const path = `${url.pathname}${url.search}`;
      requests.push(path);

      return new Response(JSON.stringify(responseFor(path)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const html = await renderInboxPage("first-render-token");
      const categoryRequests = requests.filter((path) => path.startsWith("/api/categories"));

      assert.equal(requests.length, 5);
      assert.equal(new Set(requests).size, 5);
      assert.deepEqual(
        new Set(requests),
        new Set([
          "/api/bank-message-inbox?status=all",
          "/api/ai-review-queue?status=pending_review&includeLowConfidence=true",
          "/api/accounts",
          "/api/categories?status=all",
          "/api/financial-profiles",
        ]),
      );
      assert.deepEqual(categoryRequests, ["/api/categories?status=all"]);
      assert.match(html, /data-inbox-review-archetype="A6"/);
      assert.match(html, /class="sf-detail-layout"/);
      assert.match(html, /data-inbox-category-hierarchy-enhanced/);
      assert.match(html, /<option value="">Sem categoria<\/option>/);
      assert.match(html, /Alimentação › Mercado/);
      assert.match(html, /data-financial-insight-fallback="true"/);
      assert.match(html, /Insights financeiros aguardando dados/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps the canonical A6 and OFX workflow available when categories fail to load", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      const path = `${url.pathname}${url.search}`;
      if (path === "/api/categories?status=all") {
        return new Response(JSON.stringify({ error: { message: "Categories unavailable" } }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(responseFor(path)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const html = await renderInboxPage("categories-unavailable-token");

      assert.match(html, /data-inbox-review-archetype="A6"/);
      assert.match(html, /class="sf-detail-layout"/);
      assert.match(html, /data-inbox-categories-unavailable="true"/);
      assert.match(html, /Categorias temporariamente indisponíveis/);
      assert.match(html, /data-inbox-ofx-import-enhanced/);
      assert.match(html, /accept="\.csv,\.ofx,text\/csv,text\/plain,application\/x-ofx"/);
      assert.match(html, /\/api\/import-batches\/" \+ fileData\.kind \+ "\/preview"/);
      assert.doesNotMatch(html, /data-inbox-category-hierarchy-enhanced/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function responseFor(path: string): unknown {
  if (path === "/api/bank-message-inbox?status=all") return { messages: [] };
  if (path === "/api/ai-review-queue?status=pending_review&includeLowConfidence=true") {
    return {
      suggestions: [],
      financialInsights: {
        insufficientData: [
          {
            currency: "BRL",
            title: "Dados insuficientes",
            explanation: "Ainda não há lançamentos realizados suficientes para gerar insights.",
            periodStartOn: "2026-08-01",
            periodEndOn: "2026-08-31",
            limitations: ["Nenhuma conclusão financeira foi criada."],
          },
        ],
      },
    };
  }
  if (path === "/api/accounts") return { accounts: [] };
  if (path === "/api/financial-profiles") return { profiles: [] };
  if (path === "/api/categories?status=all") {
    return {
      categories: [
        { id: "food", name: "Alimentação", kind: "expense", status: "active" },
        {
          id: "market",
          name: "Mercado",
          kind: "expense",
          status: "active",
          parentCategoryId: "food",
        },
      ],
    };
  }

  throw new Error(`Unexpected request: ${path}`);
}
