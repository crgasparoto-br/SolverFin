import assert from "node:assert/strict";

import { enhanceAccountsCardsTabs } from "./dev-server/accounts-cards-enhancement.js";
import { renderAccountsCardsPage } from "./dev-server/accounts-cards-page.js";

await accountsCardsPageRendersDialogInstrumentList();

async function accountsCardsPageRendersDialogInstrumentList(): Promise<void> {
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
    const html = enhanceAccountsCardsTabs(await renderAccountsCardsPage("session-token"));
    const cardDialogStart = html.indexOf('<dialog id="edit-card-dialog-card-unused"');
    const cardDialogEnd = html.indexOf("</dialog>", cardDialogStart);
    const dialogHtml = html.slice(cardDialogStart, cardDialogEnd);
    const cardArticleStart = html.indexOf('<article class="master-item card-account-item"');
    const cardSummaryHtml = html.slice(cardArticleStart, cardDialogStart);

    assert.ok(cardDialogStart >= 0);
    assert.ok(cardDialogEnd > cardDialogStart);
    assert.doesNotMatch(cardSummaryHtml, /class="instrument-list/);
    assert.match(dialogHtml, /class="dialog-subsection dialog-instrument-list"/);
    assert.match(dialogHtml, /<h3>Lista de instrumentos<\/h3>/);
    assert.match(dialogHtml, /class="instrument-list"/);
    assert.match(dialogHtml, /data-card-instrument/);
    assert.match(dialogHtml, /<strong>Físico titular<\/strong>/);
    assert.match(dialogHtml, /Físico · Titular principal · \*\*\*\* 1111 · limite R\$ 3\.000,00/);
    assert.match(dialogHtml, /class="instrument-pill">Default<\/span>/);
    assert.match(dialogHtml, /class="instrument-actions" aria-label="Ações de Físico titular"/);
    assert.match(dialogHtml, /data-open-dialog="edit-card-instrument-dialog-instrument-physical"/);
    assert.ok(
      dialogHtml.indexOf("<strong>Físico titular</strong>") <
        dialogHtml.indexOf('class="instrument-actions"'),
      "os botões devem aparecer no fim da linha do instrumento",
    );

    assert.match(
      html,
      /id="edit-card-instrument-dialog-instrument-physical" class="master-dialog"/,
    );
    assert.match(
      html,
      /data-api-method="PATCH" data-api-path="\/api\/credit-card-instruments\/instrument-physical" class="edit-grid"/,
    );
    assert.doesNotMatch(dialogHtml, /class="edit-grid instrument-edit-form"/);
    assert.match(html, /data-toggle-instrument-create="new-card-instrument-form-card-unused"/);
    assert.match(
      html,
      /id="new-card-instrument-form-card-unused" hidden data-api-form data-api-path="\/api\/credit-card-accounts\/card-unused\/instruments"/,
    );
    assert.doesNotMatch(html, /data-open-dialog="new-card-instrument-dialog-card-unused"/);
    assert.doesNotMatch(html, /id="new-card-instrument-dialog-card-unused"/);
    assert.match(html, /data-card-instruments-dialog-list/);
    assert.match(
      html,
      /\.dialog-instrument-list \.instrument-actions \{ flex: 0 0 auto; margin-left: auto; \}/,
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
