import assert from "node:assert/strict";

import { apiGet, withRequestedApiFinancialProfile } from "./api.js";

const originalFetch = globalThis.fetch;
const urls: string[] = [];
globalThis.fetch = (async (input: string | URL | Request) => {
  urls.push(String(input));
  return new Response(JSON.stringify({ items: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

try {
  const profileA = "33333333-3333-4333-8333-333333333331";
  const profileB = "44444444-4444-4444-8444-444444444441";
  const result = await Promise.all([
    withRequestedApiFinancialProfile(
      new URL(`https://solverfin.invalid/inbox?profileId=${profileA}`),
      () => apiGet("demo", "/api/financial-insights?state=active"),
    ),
    withRequestedApiFinancialProfile(
      new URL(`https://solverfin.invalid/cartoes?profileId=${profileB}`),
      () => apiGet("demo", "/api/invoices?status=all"),
    ),
    withRequestedApiFinancialProfile(
      new URL(`https://solverfin.invalid/orcamentos?profileId=${profileA}`),
      () => apiGet("demo", "/api/budgets/dashboard?periodStartOn=2026-11-01"),
    ),
  ]);
  assert.ok(result.every((item) => item.ok));
  assert.equal(new URL(urls[0] as string).searchParams.get("profileId"), profileA);
  assert.equal(new URL(urls[1] as string).searchParams.get("profileId"), profileB);
  assert.equal(new URL(urls[2] as string).searchParams.get("profileId"), profileA);
  assert.equal(new URL(urls[0] as string).searchParams.get("state"), "active");
  assert.equal(new URL(urls[1] as string).searchParams.get("status"), "all");

  await withRequestedApiFinancialProfile(
    new URL(`https://solverfin.invalid/inbox?profileId=${profileA}`),
    () => apiGet("demo", "/api/financial-insights?profileId=already-selected"),
  );
  assert.deepEqual(new URL(urls[3] as string).searchParams.getAll("profileId"), [
    "already-selected",
  ]);
  await apiGet("demo", "/api/invoices?status=all");
  assert.equal(new URL(urls[4] as string).searchParams.has("profileId"), false);

  await withRequestedApiFinancialProfile(
    new URL("https://solverfin.invalid/cartoes?profileId=not-authorized"),
    () => apiGet("demo", "/api/invoices"),
  );
  assert.equal(new URL(urls[5] as string).searchParams.get("profileId"), "not-authorized");
  // Scope data is forwarded, never trusted here; the authenticated API rejects an unauthorized ID.
  console.log("Issue 693: concurrent SSR profile scope does not leak between requests.");
} finally {
  globalThis.fetch = originalFetch;
}
