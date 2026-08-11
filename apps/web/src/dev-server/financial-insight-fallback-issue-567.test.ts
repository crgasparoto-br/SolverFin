import assert from "node:assert/strict";

import { enhanceInboxWithStructuredPayloads } from "./inbox-structured-payload-enhancement.js";

const originalFetch = globalThis.fetch;

await rendersInsufficientDataWithoutCreatingFakeSuggestion();

globalThis.fetch = originalFetch;

async function rendersInsufficientDataWithoutCreatingFakeSuggestion(): Promise<void> {
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/api/ai-review-queue");
    return jsonResponse({
      suggestions: [],
      financialInsights: {
        insufficientData: [
          {
            currency: "BRL",
            title: "Dados insuficientes",
            explanation: "Ainda não há lançamentos realizados suficientes para gerar insights.",
            periodStartOn: "2026-08-01",
            periodEndOn: "2026-08-11",
            limitations: ["Nenhuma conclusão financeira foi criada."],
          },
        ],
      },
    });
  };

  const html = `<!doctype html><html><body>
    <section class="panel list-panel">
      <div class="section-heading"><h2>Outras sugestões</h2><span>0 pendentes</span></div>
      <div class="rows maintenance-rows"><div class="empty-state">Nenhuma sugestão.</div></div>
    </section>
  </body></html>`;

  const enhanced = await enhanceInboxWithStructuredPayloads(html, "session-token");

  assert.match(enhanced, /data-financial-insight-fallback="true"/);
  assert.match(enhanced, /Insights financeiros aguardando dados/);
  assert.match(enhanced, /BRL/);
  assert.match(enhanced, /Nenhum insight artificial foi criado/);
  assert.doesNotMatch(enhanced, /data-ai-structured-payload="true"/);
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
