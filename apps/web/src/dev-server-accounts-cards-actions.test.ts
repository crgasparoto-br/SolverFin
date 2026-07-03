import assert from "node:assert/strict";

import { renderAccountsCardsPage } from "./dev-server/accounts-cards-page-dialog-only.js";

await accountsCardsPageRendersDialogOnlyInstrumentActions();

async function accountsCardsPageRendersDialogOnlyInstrumentActions(): Promise<void> {
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

    const expectedPatterns = [
      /data-api-method="DELETE" data-api-path="\/api\/accounts\/account-unused"/,
      /aria-label="Excluir Conta sem uso"/,
      /data-api-method="DELETE" data-api-path="\/api\/credit-card-accounts\/card-unused"/,
      /aria-label="Excluir Cartão sem uso"/,
      /Só é possível excluir contas sem lançamentos/,
      /Só é possível excluir cartões sem compras/,
      /Instrumentos do cartão/,
      /Dados dos instrumentos/,
      /class="edit-grid instrument-edit-form"/,
      /<strong>Físico titular<\/strong>/,
      /<button type="submit">Salvar instrumento<\/button>/,
      /data-toggle-instrument-create="new-card-instrument-form-card-unused"/,
      /id="new-card-instrument-form-card-unused" hidden data-api-form data-api-path="\/api\/credit-card-accounts\/card-unused\/instruments"/,
      /<button type="submit">Criar instrumento<\/button>/,
    ];

    const absentPatterns = [
      /<div class="instrument-list/,
      /data-card-instrument/,
      /data-open-dialog="new-card-instrument-dialog-card-unused"/,
      /id="new-card-instrument-dialog-card-unused"/,
    ];

    expectedPatterns.forEach((pattern) => assert.match(html, pattern));
    absentPatterns.forEach((pattern) => assert.doesNotMatch(html, pattern));
    assert.equal(
      (html.match(/data-api-path="\/api\/credit-card-instruments\/instrument-physical"/g) ?? [])
        .length,
      1,
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
