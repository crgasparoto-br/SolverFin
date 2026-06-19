import assert from "node:assert/strict";

import { renderRecurrencesPage } from "./recurrences-page.js";

const originalFetch = globalThis.fetch;

await recurrencesPageExposesRecurringCommitmentsAndInstallments();

globalThis.fetch = originalFetch;

async function recurrencesPageExposesRecurringCommitmentsAndInstallments(): Promise<void> {
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));

    if (url.pathname === "/api/recurrences") {
      return jsonResponse({
        recurrences: [
          {
            id: "recurrence-active",
            status: "active",
            frequency: "monthly",
            startOn: "2026-06-10",
            amountMinor: 150000,
            currency: "BRL",
            description: "Aluguel",
            accountId: "account-1",
            categoryId: "category-1",
          },
          {
            id: "recurrence-paused",
            status: "paused",
            frequency: "weekly",
            startOn: "2026-06-12",
            amountMinor: 7000,
            currency: "BRL",
            description: "Transporte",
            accountId: "account-1",
          },
        ],
      });
    }

    if (url.pathname === "/api/accounts") {
      return jsonResponse({
        accounts: [
          {
            id: "account-1",
            name: "Conta principal",
            kind: "checking",
            status: "active",
          },
        ],
      });
    }

    if (url.pathname === "/api/categories") {
      return jsonResponse({
        categories: [
          {
            id: "category-1",
            name: "Moradia",
            kind: "expense",
            status: "active",
          },
        ],
      });
    }

    return jsonResponse({});
  };

  const html = await renderRecurrencesPage("session-token");

  assert.match(html, /Recorrências e parcelas/);
  assert.match(html, /Aluguel/);
  assert.match(html, /Conta principal/);
  assert.match(html, /Moradia/);
  assert.match(html, /data-api-path="\/api\/recurrences"/);
  assert.match(
    html,
    /data-api-method="PATCH" data-api-path="\/api\/recurrences\/recurrence-active"/,
  );
  assert.match(html, /\/api\/recurrences\/recurrence-active\/pause/);
  assert.match(html, /\/api\/recurrences\/recurrence-paused\/resume/);
  assert.match(html, /\/api\/recurrences\/recurrence-active\/cancel/);
  assert.match(html, /\/api\/recurrences\/recurrence-active\/generate-installments/);
  assert.match(html, /As parcelas geradas nesta ação aparecem aqui para conferência/);
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
