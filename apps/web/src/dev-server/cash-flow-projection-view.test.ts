import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { renderReportsRoutePage } from "./reports-route-page.js";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("cash flow projection report", () => {
  it("renders the canonical daily series per currency without recalculating balances", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      assert.equal(url.pathname, "/api/cash-flow-projection");
      assert.equal(url.searchParams.get("referenceDate"), "2026-09-20");
      assert.equal(url.searchParams.get("horizonDays"), "30");
      assert.equal(url.searchParams.get("profileId"), "profile-1");
      return jsonResponse({
        referenceDate: "2026-09-20",
        horizonDays: 30,
        from: "2026-09-21",
        to: "2026-10-20",
        currencyBlocks: [
          {
            currency: "BRL",
            openingBalanceMinor: 100000,
            closingBalanceMinor: 77777,
            points: [
              {
                date: "2026-09-21",
                netMovementMinor: -53832,
                closingBalanceMinor: 77777,
                movements: [
                  {
                    commitmentId: "transaction:transfer-1",
                    effectId: "source",
                    description: "Transferência viagem",
                    source: { kind: "transaction", id: "transfer-1" },
                    amountMinor: -53832,
                    currency: "BRL",
                    accountId: "account-brl",
                  },
                ],
              },
              {
                date: "2026-09-22",
                netMovementMinor: 0,
                closingBalanceMinor: 77777,
                movements: [],
              },
            ],
          },
          {
            currency: "USD",
            openingBalanceMinor: 20000,
            closingBalanceMinor: 33333,
            points: [
              {
                date: "2026-09-21",
                netMovementMinor: 10000,
                closingBalanceMinor: 33333,
                movements: [
                  {
                    commitmentId: "transaction:transfer-1",
                    effectId: "destination",
                    description: "Transferência viagem",
                    source: { kind: "transaction", id: "transfer-1" },
                    amountMinor: 10000,
                    currency: "USD",
                    accountId: "account-usd",
                  },
                ],
              },
            ],
          },
        ],
      });
    };
    const html = await renderReportsRoutePage(
      "token",
      new URL(
        "http://localhost/relatorios?view=cash-flow&referenceDate=2026-09-20&horizonDays=30&profileId=profile-1",
      ),
      new Date("2026-09-20T12:00:00.000Z"),
    );
    assert.match(html, /Projeção de caixa/);
    assert.match(html, /data-report-state="ready"/);
    assert.match(html, /name="view" value="cash-flow"/);
    assert.match(html, /BRL/);
    assert.match(html, /USD/);
    assert.match(html, /R\$\s*777,77/);
    assert.match(html, /US\$\s*333,33/);
    assert.equal((html.match(/data-commitment-id="transaction:transfer-1"/g) ?? []).length, 2);
    assert.match(html, /currency=BRL&amp;accountId=account-brl&amp;evidence=planned/);
    assert.match(html, /currency=USD&amp;accountId=account-usd&amp;evidence=planned/);
    assert.match(html, /Sem movimento/);
  });

  it("rejects an invalid horizon before calling the API", async () => {
    let calls = 0;
    globalThis.fetch = async (): Promise<Response> => {
      calls += 1;
      return jsonResponse({});
    };
    const html = await renderReportsRoutePage(
      "token",
      new URL("http://localhost/relatorios?view=cash-flow&referenceDate=2026-09-20&horizonDays=45"),
    );
    assert.equal(calls, 0);
    assert.match(html, /data-report-state="filter-error"/);
    assert.match(html, /30, 60 ou 90 dias/);
  });
});
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
