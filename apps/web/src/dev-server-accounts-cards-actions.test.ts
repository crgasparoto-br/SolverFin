import assert from "node:assert/strict";

import { enhanceAccountsCardsTabs } from "./dev-server/accounts-cards-enhancement.js";
import { renderAccountsCardsPage } from "./dev-server/accounts-cards-page.js";

await accountsCardsPageRendersDedicatedInstrumentDialog();

async function accountsCardsPageRendersDedicatedInstrumentDialog(): Promise<void> {
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
    const cardArticleStart = html.indexOf('<article class="master-item card-account-item"');
    const instrumentsDialogStart = html.indexOf(
      '<dialog id="card-instruments-dialog-card-unused"',
      cardArticleStart,
    );
    const cardDialogStart = html.indexOf(
      '<dialog id="edit-card-dialog-card-unused"',
      instrumentsDialogStart,
    );
    const cardDialogEnd = html.indexOf("</dialog>", cardDialogStart);
    const cardSummaryHtml = html.slice(cardArticleStart, instrumentsDialogStart);
    const instrumentsDialogHtml = html.slice(instrumentsDialogStart, cardDialogStart);
    const cardEditDialogHtml = html.slice(cardDialogStart, cardDialogEnd);

    assert.ok(cardArticleStart >= 0);
    assert.ok(instrumentsDialogStart > cardArticleStart);
    assert.ok(cardDialogStart > instrumentsDialogStart);
    assert.ok(cardDialogEnd > cardDialogStart);

    assert.doesNotMatch(cardSummaryHtml, /class="instrument-list/);
    assert.doesNotMatch(cardSummaryHtml, /data-card-instrument/);
    assert.doesNotMatch(cardEditDialogHtml, /class="instrument-list/);
    assert.doesNotMatch(cardEditDialogHtml, /data-card-instrument/);
    assert.doesNotMatch(cardEditDialogHtml, /Dados dos instrumentos/);

    assert.match(cardSummaryHtml, /data-view-instruments/);
    assert.match(
      cardSummaryHtml,
      /data-open-dialog="card-instruments-dialog-card-unused"[^>]*aria-label="Ver instrumentos" title="Ver instrumentos"/,
    );

    assert.match(instrumentsDialogHtml, /data-card-instruments-dedicated-dialog/);
    assert.match(instrumentsDialogHtml, /<h2[^>]*>Instrumentos do cartão<\/h2>/);
    assert.match(instrumentsDialogHtml, /<p class="muted">Cartão sem uso<\/p>/);
    assert.match(instrumentsDialogHtml, /class="instrument-list"/);
    assert.match(instrumentsDialogHtml, /data-card-instrument/);
    assert.match(instrumentsDialogHtml, /<strong>Físico titular<\/strong>/);
    assert.match(
      instrumentsDialogHtml,
      /Físico · Titular principal · \*\*\*\* 1111 · limite R\$[ \u00a0]3\.000,00/,
    );
    assert.match(instrumentsDialogHtml, /class="instrument-pill">Default<\/span>/);
    assert.match(
      instrumentsDialogHtml,
      /class="instrument-actions" aria-label="Ações de Físico titular"/,
    );
    assert.match(
      instrumentsDialogHtml,
      /data-open-dialog="edit-card-instrument-dialog-instrument-physical"/,
    );
    assert.match(
      instrumentsDialogHtml,
      /data-toggle-instrument-create="new-card-instrument-form-card-unused"/,
    );
    assert.match(
      instrumentsDialogHtml,
      /id="new-card-instrument-form-card-unused" hidden data-api-form data-api-path="\/api\/credit-card-accounts\/card-unused\/instruments"/,
    );
    assert.ok(
      instrumentsDialogHtml.indexOf("<strong>Físico titular</strong>") <
        instrumentsDialogHtml.indexOf('class="instrument-actions"'),
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
    assert.doesNotMatch(html, /data-open-dialog="new-card-instrument-dialog-card-unused"/);
    assert.doesNotMatch(html, /id="new-card-instrument-dialog-card-unused"/);
    assert.match(html, /data-card-instruments-dedicated-dialog-styles/);
    assert.match(html, /data-card-instruments-dedicated-dialog-script/);
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
