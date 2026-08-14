import assert from "node:assert/strict";

import { protectAccountIdentifierPrivacy } from "./dev-server/account-identifier-privacy.js";

testShortIdentifiersAreRemovedFromSummaryAndSearch();
testMixedIdentifiersKeepOnlySafeSuffix();
testEscapedShortIdentifierIsNotExposed();

function testShortIdentifiersAreRemovedFromSummaryAndSearch(): void {
  const protectedHtml = protectAccountIdentifierPrivacy(
    accountDocument({
      search: "conta teste c6 brl agência final 1 conta final 1234",
      summary: "Conta corrente · C6 Bank · BRL · Agência final 1 · Conta final 1234",
      agencyIdentifier: "1",
      accountIdentifier: "1234",
    }),
  );
  const summary = accountSummary(protectedHtml);
  const search = accountSearch(protectedHtml);
  const editDialog = accountEditDialog(protectedHtml);

  assert.equal(summary, "Conta corrente · C6 Bank · BRL");
  assert.doesNotMatch(search, /agência final 1|conta final 1234/);
  assert.match(editDialog, /name="agencyIdentifier" value="1"/);
  assert.match(editDialog, /name="accountIdentifier" value="1234"/);
}

function testMixedIdentifiersKeepOnlySafeSuffix(): void {
  const protectedHtml = protectAccountIdentifierPrivacy(
    accountDocument({
      search: "conta teste c6 brl agência final 1 conta final 45-6",
      summary: "Conta corrente · C6 Bank · BRL · Agência final 1 · Conta final 45-6",
      agencyIdentifier: "1",
      accountIdentifier: "12345-6",
    }),
  );
  const summary = accountSummary(protectedHtml);
  const search = accountSearch(protectedHtml);

  assert.equal(summary, "Conta corrente · C6 Bank · BRL · Conta final 45-6");
  assert.doesNotMatch(search, /agência final 1/);
  assert.match(search, /conta final 45-6/);
  assert.doesNotMatch(summary, /12345-6/);
}

function testEscapedShortIdentifierIsNotExposed(): void {
  const protectedHtml = protectAccountIdentifierPrivacy(
    accountDocument({
      search: "conta teste c6 brl agência final &amp;",
      summary: "Conta corrente · C6 Bank · BRL · Agência final &amp;",
      agencyIdentifier: "&amp;",
      accountIdentifier: "",
    }),
  );
  const summary = accountSummary(protectedHtml);
  const search = accountSearch(protectedHtml);
  const editDialog = accountEditDialog(protectedHtml);

  assert.equal(summary, "Conta corrente · C6 Bank · BRL");
  assert.doesNotMatch(search, /agência final/);
  assert.match(editDialog, /name="agencyIdentifier" value="&amp;"/);
}

function accountDocument(input: {
  search: string;
  summary: string;
  agencyIdentifier: string;
  accountIdentifier: string;
}): string {
  return `
    <section data-tab-panel="accounts">
      <article class="master-item" data-master-item data-search="${input.search}">
        <div class="item-main"><p>${input.summary}</p></div>
        <dialog id="edit-account-dialog-account-test">
          <form>
            <input name="agencyIdentifier" value="${input.agencyIdentifier}" autocomplete="off" />
            <input name="accountIdentifier" value="${input.accountIdentifier}" autocomplete="off" />
          </form>
        </dialog>
      </article>
    </section>`;
}

function accountSummary(html: string): string {
  const value = html.match(/<div class="item-main"><p>([^<]*)<\/p><\/div>/)?.[1];
  assert.ok(value !== undefined);

  return value;
}

function accountSearch(html: string): string {
  const value = html.match(/data-search="([^"]*)"/)?.[1];
  assert.ok(value !== undefined);

  return value;
}

function accountEditDialog(html: string): string {
  const value = html.match(/<dialog id="edit-account-dialog-account-test">([\s\S]*?)<\/dialog>/)?.[1];
  assert.ok(value !== undefined);

  return value;
}
