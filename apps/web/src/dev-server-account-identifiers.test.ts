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
            currency: "BRL",
            institutionKey: "c6",
            maskedIdentifier: "Ag **** · Conta **** 7788",
          },
          {
            id: "account-hybrid",
            name: "Conta híbrida",
            kind: "checking",
            status: "active",
            openingBalanceMinor: 0,
            currency: "BRL",
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
    const html = await renderAccountsCardsPage("session-token");
    const newDialog = sliceDialog(html, "new-account-dialog");
    const separatedSummary = sliceAccountSummary(html, "account-separated");
    const separatedEdit = sliceDialog(html, "edit-account-dialog-account-separated");
    const legacySummary = sliceAccountSummary(html, "account-legacy");
    const legacyEdit = sliceDialog(html, "edit-account-dialog-account-legacy");
    const hybridSummary = sliceAccountSummary(html, "account-hybrid");
    const hybridEdit = sliceDialog(html, "edit-account-dialog-account-hybrid");

    assert.match(newDialog, /<label>Agência<input name="agencyIdentifier"/);
    assert.match(newDialog, /<label>Conta<input name="accountIdentifier"/);
    assert.doesNotMatch(newDialog, /name="maskedIdentifier"/);

    assert.match(separatedSummary, /Agência final 01 · Conta final 45-6/);
    assert.doesNotMatch(separatedSummary, />0001</);
    assert.doesNotMatch(separatedSummary, /12345-6/);
    assert.match(separatedEdit, /name="agencyIdentifier" value="0001"/);
    assert.match(separatedEdit, /name="accountIdentifier" value="12345-6"/);

    assert.match(legacySummary, /Ag \*\*\*\* · Conta \*\*\*\* 7788/);
    assert.match(legacyEdit, /Identificador legado: Ag \*\*\*\* · Conta \*\*\*\* 7788/);
    assert.match(legacyEdit, /name="agencyIdentifier" value=""/);
    assert.match(legacyEdit, /name="accountIdentifier" value=""/);

    assert.match(hybridSummary, /Agência final 21 · Conta final 99-0/);
    assert.doesNotMatch(hybridSummary, /LEGADO \*\*\*\* 1111/);
    assert.match(hybridEdit, /name="agencyIdentifier" value="4321"/);
    assert.match(hybridEdit, /name="accountIdentifier" value="99999-0"/);
    assert.doesNotMatch(hybridEdit, /Identificador legado:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function sliceDialog(html: string, id: string): string {
  const start = html.indexOf(`<dialog id="${id}"`);
  assert.ok(start >= 0, `dialog ${id} should exist`);
  const end = html.indexOf("</dialog>", start);
  assert.ok(end > start, `dialog ${id} should close`);
  return html.slice(start, end + "</dialog>".length);
}

function sliceAccountSummary(html: string, accountId: string): string {
  const dialogNeedle = `<dialog id="edit-account-dialog-${accountId}"`;
  const dialogStart = html.indexOf(dialogNeedle);
  assert.ok(dialogStart >= 0, `edit dialog for ${accountId} should exist`);
  const articleStart = html.lastIndexOf('<article class="master-item"', dialogStart);
  assert.ok(articleStart >= 0, `account article for ${accountId} should exist`);
  return html.slice(articleStart, dialogStart);
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
