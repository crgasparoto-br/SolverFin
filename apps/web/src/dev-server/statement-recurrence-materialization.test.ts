import assert from "node:assert/strict";

import { materializeAccountStatementRecurrences } from "../dev-server.js";

const originalFetch = globalThis.fetch;

await materializesActiveAccountRecurrencesThroughSelectedMonth();
await usesFirstActiveAccountWhenStatementHasNoAccountFilter();

globalThis.fetch = originalFetch;

async function materializesActiveAccountRecurrencesThroughSelectedMonth(): Promise<void> {
  const generationRequests: Array<{ path: string; body: unknown; authorization: string | null }> = [];

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = resolveFetchUrl(input);

    if (url.pathname === "/api/accounts") {
      return jsonResponse({
        accounts: [{ id: "account-1", status: "active" }],
      });
    }

    if (url.pathname === "/api/recurrences") {
      assert.equal(url.searchParams.get("accountId"), "account-1");
      assert.equal(url.searchParams.get("status"), "all");

      return jsonResponse({
        recurrences: [
          { id: "recurrence-active", status: "active" },
          { id: "recurrence-paused", status: "paused" },
        ],
      });
    }

    if (url.pathname.endsWith("/generate-installments")) {
      generationRequests.push({
        path: url.pathname,
        body: JSON.parse(String(init?.body ?? "{}")),
        authorization: new Headers(init?.headers).get("authorization"),
      });

      return jsonResponse({ installments: [], transactions: [] }, 201);
    }

    throw new Error(`Unexpected request: ${url.pathname}${url.search}`);
  };

  await materializeAccountStatementRecurrences(
    "session-token",
    new URL("http://solverfin.test/lancamentos?accountId=account-1&month=2026-09"),
  );

  assert.deepEqual(generationRequests, [
    {
      path: "/api/recurrences/recurrence-active/generate-installments",
      body: { through: "2026-09-30" },
      authorization: "Bearer session-token",
    },
  ]);
}

async function usesFirstActiveAccountWhenStatementHasNoAccountFilter(): Promise<void> {
  let recurrenceAccountId = "";

  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = resolveFetchUrl(input);

    if (url.pathname === "/api/accounts") {
      return jsonResponse({
        accounts: [
          { id: "archived-account", status: "archived" },
          { id: "active-account", status: "active" },
        ],
      });
    }

    if (url.pathname === "/api/recurrences") {
      recurrenceAccountId = url.searchParams.get("accountId") ?? "";
      return jsonResponse({ recurrences: [] });
    }

    throw new Error(`Unexpected request: ${url.pathname}${url.search}`);
  };

  await materializeAccountStatementRecurrences(
    "session-token",
    new URL("http://solverfin.test/lancamentos?month=2026-10"),
  );

  assert.equal(recurrenceAccountId, "active-account");
}

function resolveFetchUrl(input: string | URL | Request): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
