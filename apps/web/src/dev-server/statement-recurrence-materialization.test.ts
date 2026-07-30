import assert from "node:assert/strict";

import {
  materializeAccountStatementRecurrences,
  materializeCardInvoiceRecurrences,
} from "../dev-server.js";

const originalFetch = globalThis.fetch;
const origin = "https://app.example.invalid";
const originalAppOrigin = process.env.APP_ORIGIN;
process.env.APP_ORIGIN = origin;

try {
  await materializesActiveAccountRecurrencesThroughSelectedMonth();
  await usesFirstActiveAccountWhenStatementHasNoAccountFilter();
  await materializesActiveCardRecurrencesThroughSelectedMonth();
  await serializesMultipleCardRecurrencesAndRetriesTransientFailure();
  await usesFirstActiveCardWhenInvoiceHasNoCardFilter();
  await forwardsProductiveCookieAndBrowserOrigin();
} finally {
  globalThis.fetch = originalFetch;
  if (originalAppOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = originalAppOrigin;
}

async function materializesActiveAccountRecurrencesThroughSelectedMonth(): Promise<void> {
  const generationRequests: Array<{
    path: string;
    body: unknown;
    authorization: string | null;
    origin: string | null;
  }> = [];

  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
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
      const headers = new Headers(init?.headers);
      generationRequests.push({
        path: url.pathname,
        body: JSON.parse(String(init?.body ?? "{}")),
        authorization: headers.get("authorization"),
        origin: headers.get("origin"),
      });

      return jsonResponse({ installments: [], transactions: [] }, 201);
    }

    throw new Error(`Unexpected request: ${url.pathname}${url.search}`);
  };

  await materializeAccountStatementRecurrences(
    "session-token",
    new URL("http://solverfin.test/lancamentos?accountId=account-1&month=2026-09"),
    origin,
  );

  assert.deepEqual(generationRequests, [
    {
      path: "/api/recurrences/recurrence-active/generate-installments",
      body: { through: "2026-09-30" },
      authorization: "Bearer session-token",
      origin,
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
    origin,
  );

  assert.equal(recurrenceAccountId, "active-account");
}

async function materializesActiveCardRecurrencesThroughSelectedMonth(): Promise<void> {
  const generationRequests: Array<{
    path: string;
    body: unknown;
    authorization: string | null;
    origin: string | null;
  }> = [];

  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = resolveFetchUrl(input);

    if (url.pathname === "/api/cards") {
      assert.equal(url.searchParams.get("status"), "all");
      return jsonResponse({ cards: [{ id: "card-1", status: "active" }] });
    }

    if (url.pathname === "/api/recurrences") {
      assert.equal(url.searchParams.get("cardId"), "card-1");
      assert.equal(url.searchParams.get("status"), "all");
      return jsonResponse({
        recurrences: [
          { id: "card-recurrence-active", status: "active" },
          { id: "card-recurrence-paused", status: "paused" },
        ],
      });
    }

    if (url.pathname.endsWith("/generate-installments")) {
      const headers = new Headers(init?.headers);
      generationRequests.push({
        path: url.pathname,
        body: JSON.parse(String(init?.body ?? "{}")),
        authorization: headers.get("authorization"),
        origin: headers.get("origin"),
      });
      return jsonResponse({ installments: [], transactions: [] }, 201);
    }

    throw new Error(`Unexpected request: ${url.pathname}${url.search}`);
  };

  await materializeCardInvoiceRecurrences(
    "session-token",
    new URL("http://solverfin.test/cartoes?cardId=card-1&month=2026-11"),
    origin,
  );

  assert.deepEqual(generationRequests, [
    {
      path: "/api/recurrences/card-recurrence-active/generate-installments",
      body: { through: "2026-11-30" },
      authorization: "Bearer session-token",
      origin,
    },
  ]);
}

async function serializesMultipleCardRecurrencesAndRetriesTransientFailure(): Promise<void> {
  const requestOrder: string[] = [];
  const attempts = new Map<string, number>();
  let inFlight = 0;
  let maxInFlight = 0;

  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = resolveFetchUrl(input);

    if (url.pathname === "/api/cards") {
      return jsonResponse({ cards: [{ id: "card-1", status: "active" }] });
    }

    if (url.pathname === "/api/recurrences") {
      return jsonResponse({
        recurrences: [
          { id: "card-recurrence-1", status: "active" },
          { id: "card-recurrence-2", status: "active" },
          { id: "card-recurrence-3", status: "active" },
          { id: "card-recurrence-paused", status: "paused" },
        ],
      });
    }

    if (url.pathname.endsWith("/generate-installments")) {
      const recurrenceId = url.pathname.split("/").at(-2) ?? "";
      requestOrder.push(recurrenceId);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;

      const attempt = (attempts.get(recurrenceId) ?? 0) + 1;
      attempts.set(recurrenceId, attempt);

      if (recurrenceId === "card-recurrence-2" && attempt === 1) {
        return jsonResponse({ error: { code: "INVOICE_WRITE_CONFLICT" } }, 409);
      }

      return jsonResponse({ installments: [], transactions: [] }, 201);
    }

    throw new Error(`Unexpected request: ${url.pathname}${url.search}`);
  };

  await materializeCardInvoiceRecurrences(
    "session-token",
    new URL("http://solverfin.test/cartoes?cardId=card-1&month=2026-12"),
    origin,
  );

  assert.equal(maxInFlight, 1, "recurrences sharing an invoice must be materialized sequentially");
  assert.deepEqual(requestOrder, [
    "card-recurrence-1",
    "card-recurrence-2",
    "card-recurrence-2",
    "card-recurrence-3",
  ]);
  assert.equal(attempts.get("card-recurrence-1"), 1);
  assert.equal(attempts.get("card-recurrence-2"), 2);
  assert.equal(attempts.get("card-recurrence-3"), 1);
  assert.equal(attempts.has("card-recurrence-paused"), false);
}

async function usesFirstActiveCardWhenInvoiceHasNoCardFilter(): Promise<void> {
  let recurrenceCardId = "";

  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = resolveFetchUrl(input);

    if (url.pathname === "/api/cards") {
      return jsonResponse({
        cards: [
          { id: "archived-card", status: "archived" },
          { id: "active-card", status: "active" },
        ],
      });
    }

    if (url.pathname === "/api/recurrences") {
      recurrenceCardId = url.searchParams.get("cardId") ?? "";
      return jsonResponse({ recurrences: [] });
    }

    throw new Error(`Unexpected request: ${url.pathname}${url.search}`);
  };

  await materializeCardInvoiceRecurrences(
    "session-token",
    new URL("http://solverfin.test/cartoes?month=2026-12"),
    origin,
  );

  assert.equal(recurrenceCardId, "active-card");
}

async function forwardsProductiveCookieAndBrowserOrigin(): Promise<void> {
  const cookie = `__Host-solverfin_session=${"A".repeat(43)}`;
  let observedGetCookie: string | null = null;
  let observedPostCookie: string | null = null;
  let observedPostAuthorization: string | null = null;
  let observedOrigin: string | null = null;

  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = resolveFetchUrl(input);
    const headers = new Headers(init?.headers);

    if (url.pathname === "/api/accounts") {
      observedGetCookie = headers.get("cookie");
      return jsonResponse({ accounts: [{ id: "account-1", status: "active" }] });
    }

    if (url.pathname === "/api/recurrences") {
      return jsonResponse({ recurrences: [{ id: "recurrence-1", status: "active" }] });
    }

    if (url.pathname.endsWith("/generate-installments")) {
      observedPostCookie = headers.get("cookie");
      observedPostAuthorization = headers.get("authorization");
      observedOrigin = headers.get("origin");
      return jsonResponse({ installments: [], transactions: [] }, 201);
    }

    throw new Error(`Unexpected request: ${url.pathname}${url.search}`);
  };

  await materializeAccountStatementRecurrences(
    cookie,
    new URL("http://solverfin.test/lancamentos?accountId=account-1&month=2026-12"),
    origin,
  );

  assert.equal(observedGetCookie, cookie);
  assert.equal(observedPostCookie, cookie);
  assert.equal(observedPostAuthorization, null);
  assert.equal(observedOrigin, origin);
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
