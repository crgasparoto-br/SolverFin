import assert from "node:assert/strict";

import { renderAccountsCardsPage } from "./dev-server/accounts-cards-page.js";

await accountsCardsPageRendersCardMaintenanceInsideSelectedDetail();

async function accountsCardsPageRendersCardMaintenanceInsideSelectedDetail(): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/api/accounts?status=all")) {
      return jsonResponse({
        accounts: [
          {
            id: "account-unused",
            name: "Conta sem uso",
            kind: "checking",
            status: "active",
            openingBalanceMinor: 0,
            currency: "EUR",
            institutionKey: "c6",
          },
        ],
      });
    }
    if (url.endsWith("/api/credit-card-accounts?status=all")) {
      return jsonResponse({
        creditCardAccounts: [
          {
            id: "card-unused",
            name: "Cartão sem uso",
            status: "active",
            closingDay: 20,
            dueDay: 10,
            creditLimitMinor: 500_000,
            institutionKey: "c6",
            brandKey: "mastercard",
            paymentAccountId: "account-unused",
            instruments: [
              {
                id: "instrument-physical",
                type: "physical",
                holder: "primary",
                status: "active",
                isDefault: true,
                name: "Físico titular",
                maskedIdentifier: "**** 1111",
                creditLimitMinor: 300_000,
              },
            ],
          },
        ],
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const html = await renderAccountsCardsPage(
      "session-token",
      new URL("https://solverfin.invalid/contas-cartoes?resource=card%3Acard-unused"),
    );
    assert.match(html, /data-accounts-cards-archetype="A3"/);
    assert.doesNotMatch(html, /data-tab-panel=/);
    assert.doesNotMatch(html, /data-card-instruments-dedicated-dialog/);
    assert.match(html, /data-resource-detail="card"/);
    assert.match(html, /Instrumentos do cartão/);
    assert.match(html, /Físico titular/);
    assert.match(html, /Físico · Titular principal · \*\*\*\* 1111/);
    assert.match(html, /EUR/);
    assert.match(html, /data-open-dialog="edit-card-dialog-card-unused"/);
    assert.match(html, /data-open-dialog="new-card-instrument-dialog-card-unused"/);
    assert.match(html, /data-open-dialog="edit-card-instrument-dialog-instrument-physical"/);
    assert.match(html, /data-api-path="\/api\/credit-card-accounts\/card-unused\/instruments"/);
    assert.match(
      html,
      /data-api-method="PATCH" data-api-path="\/api\/credit-card-instruments\/instrument-physical"/,
    );
    assert.doesNotMatch(html, /data-card-instruments-dedicated-dialog-styles/);
    assert.doesNotMatch(html, /data-card-instruments-dedicated-dialog-script/);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
