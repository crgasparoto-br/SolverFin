import assert from "node:assert/strict";

import { renderAccountsCardsPage } from "./dev-server/accounts-cards-page.js";

await accountsPageSeparatesAgencyAndAccount();

async function accountsPageSeparatesAgencyAndAccount(): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/api/accounts?status=all")) {
      return jsonResponse({
        accounts: [
          {
            id: "account-separated",
            name: "Conta separada",
            kind: "checking",
            status: "active",
            openingBalanceMinor: 0,
            currency: "BRL",
            institutionKey: "c6",
            agencyIdentifier: "0001",
            accountIdentifier: "12345-6",
          },
          {
            id: "account-legacy",
            name: "Conta legada",
            kind: "checking",
            status: "active",
            openingBalanceMinor: 0,
            currency: "USD",
            institutionKey: "c6",
            maskedIdentifier: "Ag **** · Conta **** 7788",
          },
          {
            id: "account-hybrid",
            name: "Conta híbrida",
            kind: "checking",
            status: "active",
            openingBalanceMinor: 0,
            currency: "EUR",
            institutionKey: "c6",
            agencyIdentifier: "4321",
            accountIdentifier: "99999-0",
            maskedIdentifier: "LEGADO **** 1111",
          },
        ],
      });
    }
    if (url.endsWith("/api/credit-card-accounts?status=all")) {
      return jsonResponse({ creditCardAccounts: [] });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const separated = await renderAccount("account-separated");
    const legacy = await renderAccount("account-legacy");
    const hybrid = await renderAccount("account-hybrid");
    const newDialog = sliceDialog(separated, "new-account-dialog");
    const separatedEdit = sliceDialog(separated, "edit-account-dialog-account-separated");
    const legacyEdit = sliceDialog(legacy, "edit-account-dialog-account-legacy");
    const hybridEdit = sliceDialog(hybrid, "edit-account-dialog-account-hybrid");

    assert.match(newDialog, /<label>Agência<input name="agencyIdentifier"/);
    assert.match(newDialog, /<label>Conta<input name="accountIdentifier"/);
    assert.doesNotMatch(newDialog, /name="maskedIdentifier"/);
    assert.match(separated, /Agência final 01 · Conta final 45-6/);
    assert.doesNotMatch(selectedDetail(separated), />0001</);
    assert.doesNotMatch(selectedDetail(separated), /12345-6/);
    assert.match(separatedEdit, /name="agencyIdentifier" value="0001"/);
    assert.match(separatedEdit, /name="accountIdentifier" value="12345-6"/);
    assert.match(legacy, /Ag \*\*\*\* · Conta \*\*\*\* 7788/);
    assert.match(legacyEdit, /Identificador legado: Ag \*\*\*\* · Conta \*\*\*\* 7788/);
    assert.match(legacyEdit, /name="agencyIdentifier" value=""/);
    assert.match(legacyEdit, /name="accountIdentifier" value=""/);
    assert.match(hybrid, /Agência final 21 · Conta final 99-0/);
    assert.doesNotMatch(selectedDetail(hybrid), /LEGADO \*\*\*\* 1111/);
    assert.match(hybridEdit, /name="agencyIdentifier" value="4321"/);
    assert.match(hybridEdit, /name="accountIdentifier" value="99999-0"/);
    assert.doesNotMatch(hybridEdit, /Identificador legado:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function renderAccount(accountId: string): Promise<string> {
  return renderAccountsCardsPage(
    "session-token",
    new URL(
      `https://solverfin.invalid/contas-cartoes?resource=${encodeURIComponent(`account:${accountId}`)}`,
    ),
  );
}

function selectedDetail(html: string): string {
  const start = html.indexOf('data-resource-detail="account"');
  assert.ok(start >= 0);
  const end = html.indexOf("</section>", start);
  return html.slice(start, end > start ? end : undefined);
}

function sliceDialog(html: string, id: string): string {
  const start = html.indexOf(`<dialog id="${id}"`);
  assert.ok(start >= 0, `dialog ${id} should exist`);
  const end = html.indexOf("</dialog>", start);
  assert.ok(end > start, `dialog ${id} should close`);
  return html.slice(start, end + "</dialog>".length);
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
