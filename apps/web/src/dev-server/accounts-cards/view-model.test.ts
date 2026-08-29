import assert from "node:assert/strict";

import type { AccountRecord, CreditCardAccountRecord } from "./types.js";
import {
  buildAccountItemViewModel,
  buildAccountsCardsPageViewModel,
  buildCardItemViewModel,
  formatAccountIdentifier,
} from "./view-model.js";

preservesPageCollectionsAndCountsActiveItems();
preparesAccountPresentationWithoutExposingFullIdentifiers();
preparesCardPresentationAndSearchMetadata();

function preservesPageCollectionsAndCountsActiveItems(): void {
  const accounts: AccountRecord[] = [
    accountFixture("account-active", "active", "BRL"),
    accountFixture("account-archived", "archived", "USD"),
  ];
  const cards: CreditCardAccountRecord[] = [
    cardFixture("card-active", "active", "account-active"),
    cardFixture("card-archived", "archived", "account-archived"),
  ];

  const viewModel = buildAccountsCardsPageViewModel(accounts, cards);

  assert.equal(viewModel.accounts, accounts);
  assert.equal(viewModel.cards, cards);
  assert.equal(viewModel.activeAccountCount, 1);
  assert.equal(viewModel.activeCardCount, 1);
  assert.equal(viewModel.accounts[1]?.currency, "USD");
}

function preparesAccountPresentationWithoutExposingFullIdentifiers(): void {
  const account = accountFixture("account-1", "active", "BRL");
  account.agencyIdentifier = "0001";
  account.accountIdentifier = "12345-6";

  const identifier = formatAccountIdentifier(account);
  const viewModel = buildAccountItemViewModel(account);

  assert.equal(identifier, "Agência final 01 · Conta final 45-6");
  assert.equal(identifier?.includes("12345-6"), false);
  assert.equal(viewModel.editDialogId, "edit-account-dialog-account-1");
  assert.match(viewModel.search, /conta account-1/);
  assert.match(viewModel.search, /agência final 01/);
  assert.equal(viewModel.isArchived, false);
}

function preparesCardPresentationAndSearchMetadata(): void {
  const accounts = [accountFixture("payment-account", "active", "BRL")];
  accounts[0]!.name = "Conta principal";
  const card = cardFixture("card-1", "active", "payment-account");
  card.instruments = [
    {
      id: "instrument-1",
      type: "virtual",
      holder: "primary",
      status: "active",
      isDefault: true,
      name: "Virtual titular",
      maskedIdentifier: "**** 4321",
      creditLimitMinor: 50000,
    },
    {
      id: "instrument-2",
      type: "physical",
      holder: "additional",
      status: "archived",
      isDefault: false,
    },
  ];

  const viewModel = buildCardItemViewModel(card, accounts);

  assert.equal(viewModel.paymentAccountName, "Conta principal");
  assert.equal(viewModel.activeInstrumentCount, 1);
  assert.equal(viewModel.editDialogId, "edit-card-dialog-card-1");
  assert.equal(viewModel.newInstrumentDialogId, "new-card-instrument-dialog-card-1");
  assert.match(viewModel.search, /virtual titular/);
  assert.match(viewModel.search, /\*\*\*\* 4321/);
  assert.equal(viewModel.isArchived, false);
}

function accountFixture(id: string, status: string, currency: string): AccountRecord {
  return {
    id,
    name: `Conta ${id}`,
    kind: "checking",
    status,
    openingBalanceMinor: 10000,
    currency,
  };
}

function cardFixture(
  id: string,
  status: string,
  paymentAccountId: string,
): CreditCardAccountRecord {
  return {
    id,
    name: `Cartão ${id}`,
    status,
    closingDay: 10,
    dueDay: 17,
    creditLimitMinor: 100000,
    paymentAccountId,
    instruments: [],
  };
}
