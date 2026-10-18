import assert from "node:assert/strict";
import test from "node:test";

import { renderResourceMaster, renderSelectedResourceDetail } from "./components.js";
import { renderAccountDialog, renderCardDialog, renderCardEditDialog } from "./dialogs.js";
import { accountsCardsPageStyles } from "./styles.js";
import type { AccountRecord, CreditCardAccountRecord } from "./types.js";
import { buildAccountsCardsPageViewModel } from "./view-model.js";

const account: AccountRecord = {
  id: "a-1",
  name: "Conta de exemplo",
  kind: "checking",
  status: "active",
  currency: "BRL",
  openingBalanceMinor: 123456,
  institutionKey: "unknown-bank",
};
const card: CreditCardAccountRecord = {
  id: "c-1",
  name: "Cartao de exemplo",
  status: "active",
  closingDay: 12,
  dueDay: 20,
  currency: "USD",
  creditLimitMinor: 250000,
  institutionKey: "unknown-bank",
  brandKey: "visa",
  paymentAccountId: account.id,
  instruments: [
    {
      id: "i-1",
      type: "virtual",
      holder: "primary",
      status: "active",
      isDefault: true,
      maskedIdentifier: "**** 4567",
    },
  ],
};

test("#716 preserva master-detail, identidade institucional e moedas distintas", () => {
  const view = buildAccountsCardsPageViewModel([account], [card], "card:c-1");
  const master = renderResourceMaster(view.resources);
  assert.equal(view.resources.filter((resource) => resource.isSelected).length, 1);
  assert.equal(view.selectedResource?.kind, "card");
  assert.match(master, /data-kind="account" data-currency="BRL"/);
  assert.match(master, /data-kind="card" data-currency="USD"/);
  assert.equal((master.match(/class="resource-master-icon"/g) ?? []).length, 2);
  assert.match(master, /class="resource-master-columns"/);
  assert.match(master, /data-amount-label="Saldo inicial"/);
  assert.match(master, /data-amount-label="Limite total"/);
  assert.match(master, /R\\$\\s*1\\.234,56/);
  assert.match(master, /US\\$\\s*2\\.500,00/);
  assert.ok((master.match(/institution-badge-icon|institution-logo-img/g) ?? []).length >= 2);
  assert.match(master, /aria-current="page"/);
  const detail = renderSelectedResourceDetail(view.selectedResource, [account]);
  assert.match(detail, /data-resource-detail="card" data-resource-key="card:c-1"/);
  assert.doesNotMatch(detail, /resource-financial-summary/);
  assert.match(detail, /Limite total/);
  assert.match(detail, /US\\$\\s*2\\.500,00/);
  assert.match(detail, /Visa/);
  assert.match(detail, /data-card-instrument/);
  assert.ok(
    detail.indexOf('class="resource-detail-actions"') <
      detail.indexOf('class="resource-instruments"'),
  );
  assert.doesNotMatch(detail, /data-financial-context="account"/);
});

test("#716 identifica conta com saldo inicial, nunca soma saldos BRL e USD", () => {
  const view = buildAccountsCardsPageViewModel([account], [card], "account:a-1");
  const html = renderSelectedResourceDetail(view.selectedResource, [account]);
  assert.doesNotMatch(html, /resource-financial-summary/);
  assert.match(html, /Saldo inicial/);
  assert.match(html, /R\\$\\s*1\\.234,56/);
  assert.doesNotMatch(html, /Limite total · USD/);
  assert.match(html, /Editar conta/);
  assert.match(html, /data-confirm="Inativar/);
});

test("#716 moedas ausentes e ausencia de recursos sao estados explicitos", () => {
  const withoutCurrency: CreditCardAccountRecord = { ...card, instruments: [] };
  delete withoutCurrency.currency;
  const view = buildAccountsCardsPageViewModel([], [withoutCurrency], "card:c-1");
  const html = renderSelectedResourceDetail(view.selectedResource, []);
  assert.match(html, /Moeda não informada/);
  assert.match(html, /Moeda indisponível/);
  assert.match(html, /Nenhum instrumento cadastrado/);
  assert.match(renderResourceMaster([]), /Nenhuma conta ou cartão cadastrado/);
});

test("#716 formularios mantem labels, foco compartilhado e confirmacao neutra", () => {
  for (const html of [
    renderAccountDialog(),
    renderCardDialog([account]),
    renderCardEditDialog(card, [account], "edit-c-1"),
  ]) {
    assert.match(html, /class="sf-dialog master-dialog"/);
    assert.match(html, /data-sf-dialog-close/);
    assert.match(html, /class="resource-form-actions"/);
    assert.match(html, /class="secondary-button" data-sf-dialog-close>Cancelar/);
    assert.match(html, /button type="submit" title=/);
    assert.match(html, /<label>Moeda<select name="currency"/);
  }
  const styles = accountsCardsPageStyles();
  assert.match(styles, /resource-form-actions/);
  assert.doesNotMatch(styles, /\\.master-dialog\\s*\\{/);
  assert.match(styles, /max-width: 360px/);
  assert.match(styles, /resource-master-link:focus-visible/);
  assert.match(styles, /grid-template-columns: minmax\\(0, 2\\.55fr\\) minmax\\(288px, 1fr\\)/);
  assert.match(styles, /resource-master-columns/);
  assert.match(styles, /max-width: 1099px/);
});

test("#716 arquivamento nao permite novo instrumento, preserva edicao e confirmacao", () => {
  const archived = { ...card, status: "archived" };
  const view = buildAccountsCardsPageViewModel([], [archived], "card:c-1");
  const detail = renderSelectedResourceDetail(view.selectedResource, []);
  assert.match(detail, /data-sf-dialog-open="new-card-instrument-dialog-c-1"/);
  assert.match(detail, /disabled/);
  assert.match(detail, /data-confirm="Inativar/);
});
