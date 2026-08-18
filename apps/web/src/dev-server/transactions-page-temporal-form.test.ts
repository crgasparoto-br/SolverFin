import assert from "node:assert/strict";

import { renderTransactionsPage } from "./transactions-page.js";

const originalFetch = globalThis.fetch;

globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
  const url = new URL(String(input), "http://solverfin.test");

  if (url.pathname === "/api/accounts") {
    return jsonResponse({
      accounts: [
        {
          id: "account-temporal-form",
          name: "Conta temporal",
          kind: "checking",
          status: "active",
          openingBalanceMinor: 0,
        },
      ],
    });
  }

  if (url.pathname === "/api/categories") return jsonResponse({ categories: [] });
  if (url.pathname === "/api/recurrences") return jsonResponse({ recurrences: [] });
  if (url.pathname === "/api/transactions") return jsonResponse({ transactions: [] });
  if (url.pathname === "/api/transaction-groups") return jsonResponse({ groups: [] });

  return jsonResponse({});
};

try {
  const html = await renderTransactionsPage(
    "session-token",
    new URL("http://solverfin.test/lancamentos?accountId=account-temporal-form&month=2035-01"),
  );

  assert.match(
    html,
    /Data do evento<input name="occurredOn" type="date" required/,
    "manual single-transaction form must collect the economic event date explicitly",
  );
  assert.match(
    html,
    /occurredOn: String\(data\.get\("occurredOn"\)\)/,
    "generic transaction payload must read the explicit economic date",
  );
  assert.doesNotMatch(
    html,
    /occurredOn: effectiveOn \|\| plannedOn/,
    "web producer must not derive economic date from planning or cash date",
  );
  assert.match(
    html,
    /form\.occurredOn\.value = transaction\.occurredOn/,
    "edit and clone hydration must preserve the stored economic date",
  );
  assert.match(
    html,
    /setFieldVisible\("occurredOn", usesGenericTemporalFields\)/,
    "economic date field visibility must follow the generic transaction path",
  );
} finally {
  globalThis.fetch = originalFetch;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
