import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { renderFinancialAssistantPage } from "./financial-assistant-page.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("financial assistant page", () => {
  it("renders an accessible read-only conversation without internal tenant identifiers", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      assert.equal(url.pathname, "/api/financial-assistant");
      assert.equal(url.searchParams.get("profileId"), "profile-web");
      return jsonResponse({
        conversation: {
          id: "conversation-opaque",
          status: "ANSWERED",
          version: 2,
          currency: "BRL",
          expiresAt: "2026-08-12T05:00:00.000Z",
          turns: [
            {
              sequence: 1,
              status: "ANSWERED",
              question: "Resumo deste mês",
              intent: "monthly_summary",
              filters: { currency: "BRL" },
              response: {
                status: "answered",
                intent: "monthly_summary",
                confidence: "high",
                answer: "Resumo financeiro calculado com dados estruturados.",
                period: { startOn: "2026-08-01", endOn: "2026-08-31" },
                filters: ["Moeda: BRL"],
                assumptions: ["Somente lançamentos realizados."],
                sources: ["lancamentos", "faturas"],
                limitations: ["Movimentações não registradas não aparecem."],
              },
              createdAt: "2026-08-12T02:00:00.000Z",
              answeredAt: "2026-08-12T02:00:01.000Z",
            },
          ],
        },
      });
    };

    const html = await renderFinancialAssistantPage(
      "session-token",
      new URL("http://localhost/assistente?profileId=profile-web"),
    );

    assert.match(html, /Assistente financeiro/);
    assert.match(html, /Somente leitura/);
    assert.match(html, /role="log"/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /Resumo deste mês/);
    assert.match(html, /Período: 2026-08-01 a 2026-08-31/);
    assert.match(html, /Confiança: Alta/);
    assert.match(html, /Como esta resposta foi calculada/);
    assert.match(html, /Fontes internas/);
    assert.match(html, /Limitações/);
    assert.match(html, /data-assistant-cancel/);
    assert.match(html, /data-assistant-clear/);
    assert.match(html, /data-assistant-new/);
    assert.match(html, /@media \(max-width: 620px\)/);
    assert.doesNotMatch(html, /organizationId/);
    assert.doesNotMatch(html, /financialProfileId/);
    assert.doesNotMatch(html, /userId/);
  });

  it("renders explicit empty and upstream-error states", async () => {
    globalThis.fetch = async (): Promise<Response> => jsonResponse({ conversation: null });
    const empty = await renderFinancialAssistantPage("session-token");
    assert.match(empty, /Nenhuma pergunta neste contexto/);
    assert.match(empty, /Pronto para iniciar uma consulta somente leitura/);

    globalThis.fetch = async (): Promise<Response> =>
      new Response(JSON.stringify({ error: { message: "API temporariamente indisponível." } }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    const failed = await renderFinancialAssistantPage("session-token");
    assert.match(failed, /API temporariamente indisponível/);
    assert.match(failed, /Não foi possível carregar a conversa/);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
