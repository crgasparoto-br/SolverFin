import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { handleBudgetDashboardApiRequest } from "./budget-dashboard-router.js";
import type { ApiRequest } from "./router.js";

describe("budget dashboard router issue 613", () => {
  it("does not claim sibling budget routes", async () => {
    const result = await handleBudgetDashboardApiRequest(request("/api/budgets/budget-1/usage"));
    assert.equal(result, undefined);
  });

  it("claims the dashboard route before dynamic budget id routing", async () => {
    const result = await handleBudgetDashboardApiRequest(
      request("/api/budgets/dashboard?periodStartOn=2026-09-01&periodEndOn=2026-09-30"),
    );
    assert.ok(result);
    assert.notEqual(result.statusCode, 404);
  });
});

function request(path: string): ApiRequest {
  const url = new URL(path, "http://solverfin.test");
  return {
    method: "GET",
    pathname: url.pathname,
    query: url.searchParams,
    headers: {},
    body: undefined,
  };
}
