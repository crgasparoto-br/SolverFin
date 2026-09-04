import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { renderReportsRoutePage } from "./reports-route-page.js";
import { renderReportState } from "./reports-route-page-shared.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("issue 611 report state hierarchy", () => {
  for (const state of ["loading", "empty", "filter-error", "api-error"] as const) {
    it(`preserves summary, visualization, highlights and detail in ${state}`, () => {
      const html = renderReportState(state, "Estado do relatório", "Contexto preservado.");

      assert.match(html, new RegExp(`data-report-state="${state}"`));
      assertAnalysisLayerOrder(html);
    });
  }

  it("uses the same hierarchy for an empty installments report", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname === "/api/installments") return jsonResponse({ installments: [] });
      if (url.pathname === "/api/cards") return jsonResponse({ cards: [] });
      if (url.pathname === "/api/categories") return jsonResponse({ categories: [] });
      return jsonResponse({});
    };

    const html = await renderReportsRoutePage(
      "token",
      new URL("http://localhost/relatorios?view=installments&month=2026-07"),
    );

    assert.match(html, /data-report-state="empty"/);
    assert.match(html, /Nenhuma parcela em Julho de 2026/);
    assertAnalysisLayerOrder(html);
  });

  it("uses the same hierarchy when the installments API fails", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname === "/api/installments") {
        return new Response(JSON.stringify({ error: "Falha controlada" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.pathname === "/api/cards") return jsonResponse({ cards: [] });
      if (url.pathname === "/api/categories") return jsonResponse({ categories: [] });
      return jsonResponse({});
    };

    const html = await renderReportsRoutePage(
      "token",
      new URL("http://localhost/relatorios?view=installments&month=2026-07"),
    );

    assert.match(html, /data-report-state="api-error"/);
    assertAnalysisLayerOrder(html);
  });
});

function assertAnalysisLayerOrder(html: string): void {
  const summary = html.indexOf('data-analysis-layer="summary"');
  const visualization = html.indexOf('data-analysis-layer="visualization"');
  const highlights = html.indexOf('data-analysis-layer="highlights"');
  const detail = html.indexOf('data-analysis-layer="detail"');

  assert.ok(summary >= 0, "summary layer should be rendered");
  assert.ok(summary < visualization, "visualization should follow summary");
  assert.ok(visualization < highlights, "highlights should follow visualization");
  assert.ok(highlights < detail, "detail should follow highlights");
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
