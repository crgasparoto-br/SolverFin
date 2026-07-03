import assert from "node:assert/strict";

import { renderAccountsCardsPage } from "./dev-server.js";

await accountsCardsPageRendersDeleteActionsAndInlineInstrumentEditing();

async function accountsCardsPageRendersDeleteActionsAndInlineInstrumentEditing(): Promise<void> {
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
            currency: "BRL",
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
    const html = await renderAccountsCardsPage("session-token");

    assert.match(html, /data-api-method="DELETE" data-api-path="\/api\/accounts\/account-unused"/);
    assert.match(html, /aria-label="Excluir Conta sem uso"/);
    assert.match(
      html,
      /data-api-method="DELETE" data-api-path="\/api\/credit-card-accounts\/card-unused"/,
    );
    assert.match(html, /aria-label="Excluir Cartão sem uso"/);
    assert.match(html, /Só é possível excluir contas sem lançamentos/);
    assert.match(html, /Só é possível excluir cartões sem compras/);
    assert.match(html, /Instrumentos do cartão/);
    assert.match(html, /Dados dos instrumentos/);
    assert.match(html, /class="edit-grid instrument-edit-form"/);
    assert.match(html, /<strong>Físico titular<\/strong>/);
    assert.match(html, /<button type="submit">Salvar instrumento<\/button>/);
    assert.equal(
      (html.match(/data-api-path="\/api\/credit-card-instruments\/instrument-physical"/g) ?? [])
        .length,
      2,
    );
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
