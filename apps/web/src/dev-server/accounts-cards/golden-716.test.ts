import assert from "node:assert/strict";
import test from "node:test";

import { renderResourceMaster, renderSelectedResourceDetail } from "./components.js";
import {
  renderAccountCdiConfigurationDialog,
  renderAccountDialog,
  renderCardDialog,
  renderCardEditDialog,
} from "./dialogs.js";
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
  assert.match(master, /R\$\s*1\.234,56/);
  assert.match(master, /US\$\s*2\.500,00/);
  assert.ok((master.match(/institution-badge-icon|institution-logo-img/g) ?? []).length >= 2);
  assert.match(master, /aria-current="page"/);
  const detail = renderSelectedResourceDetail(view.selectedResource, [account]);
  assert.match(detail, /data-resource-detail="card" data-resource-key="card:c-1"/);
  assert.doesNotMatch(detail, /resource-financial-summary/);
  assert.match(detail, /Limite total/);
  assert.match(detail, /US\$\s*2\.500,00/);
  assert.match(detail, /Visa/);
  assert.match(detail, /data-card-instrument/);
  assert.ok(
    detail.indexOf('class="resource-detail-actions"') <
      detail.indexOf('class="resource-instruments"'),
  );
  assert.doesNotMatch(detail, /data-financial-context="account"/);
});

test("#716 mostra CDI ativo apenas para contas BRL com configuração habilitada", () => {
  const disabled: AccountRecord = { ...account, id: "a-disabled", name: "Conta sem CDI" };
  const usd: AccountRecord = {
    ...account,
    id: "a-usd",
    name: "Conta em dólar",
    currency: "USD",
  };
  const archived: AccountRecord = {
    ...account,
    id: "a-archived",
    name: "Conta arquivada",
    status: "archived",
  };
  const view = buildAccountsCardsPageViewModel(
    [account, disabled, usd, archived],
    [card],
    "account:a-1",
    [
      { accountId: account.id, accountCurrency: "BRL", enabled: true, indexKind: "cdi" },
      { accountId: disabled.id, accountCurrency: "BRL", enabled: false, indexKind: "cdi" },
      { accountId: usd.id, accountCurrency: "USD", enabled: true, indexKind: "cdi" },
      { accountId: archived.id, accountCurrency: "BRL", enabled: true, indexKind: "cdi" },
      { accountId: card.id, accountCurrency: "BRL", enabled: true, indexKind: "cdi" },
    ],
  );
  assert.equal(view.resources.filter((resource) => resource.cdiActive).length, 1);
  assert.equal(view.resources[0]?.cdiActive, true);
  assert.match(view.resources[0]?.search ?? "", /cdi ativo/);
  assert.equal(view.resources[1]?.cdiActive, false);
  assert.equal(view.resources[2]?.cdiActive, false);
  assert.equal(view.resources[3]?.cdiActive, false);
  assert.equal(view.resources[4]?.cdiActive, undefined);
  const master = renderResourceMaster(view.resources);
  assert.equal((master.match(/class="resource-master-cdi-column"/g) ?? []).length, 5);
  assert.equal(
    (master.match(/class="resource-master-cdi-compact(?: is-active)?"/g) ?? []).length,
    4,
  );
  assert.deepEqual(
    view.resources.map((resource) => resource.cdiStatus),
    ["active", "inactive", "ineligible", "ineligible", undefined],
  );
  assert.match(master, /Sem CDI ativo/);
  assert.match(master, /Não elegível/);
  assert.match(master, /<span>CDI<\/span><span>Situação<\/span>/);
  assert.match(master, /data-cdi-active="true"/);
  assert.match(master, /Conta corrente.*CDI ativo/s);
  assert.match(master, /data-kind="card"[^>]*data-cdi-active="false"/);
  assert.match(
    accountsCardsPageStyles(),
    /\.resource-master-cdi-compact\.is-active \{ color: var\(--sf-color-success\)/,
  );
  const noConfiguration = buildAccountsCardsPageViewModel([account], [card]);
  assert.equal(noConfiguration.resources[0]?.cdiStatus, "inactive");
  assert.match(renderResourceMaster(noConfiguration.resources), /Sem CDI ativo/);
  const failedQuery = buildAccountsCardsPageViewModel([account], [card], "account:a-1", [], false);
  assert.equal(failedQuery.resources[0]?.cdiStatus, "unavailable");
  assert.match(renderResourceMaster(failedQuery.resources), /Não verificado/);
  assert.doesNotMatch(renderResourceMaster(failedQuery.resources), />Sem CDI ativo</);
});

test("#716 identifica conta com saldo inicial, nunca soma saldos BRL e USD", () => {
  const view = buildAccountsCardsPageViewModel([account], [card], "account:a-1");
  const html = renderSelectedResourceDetail(view.selectedResource, [account]);
  assert.doesNotMatch(html, /resource-financial-summary/);
  assert.match(html, /Saldo inicial/);
  assert.match(html, /R\$\s*1\.234,56/);
  assert.doesNotMatch(html, /Limite total · USD/);
  assert.match(html, /Editar conta/);
  assert.match(html, /data-confirm="Inativar/);
});

test("#716 moedas ausentes e ausencia de recursos sao estados explicitos", () => {
  const withoutCurrency: CreditCardAccountRecord = { ...card, instruments: [] };
  delete withoutCurrency.currency;
  const view = buildAccountsCardsPageViewModel([], [withoutCurrency], "card:c-1");
  const html = renderSelectedResourceDetail(view.selectedResource, []);
  assert.match(renderResourceMaster(view.resources), /Moeda indisponível/);
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
    assert.match(
      html,
      /class="sf-button sf-button-secondary" data-button-variant="neutral" type="button" data-sf-dialog-close>Cancelar/,
    );
    assert.match(html, /class="sf-button sf-button-primary" type="submit" title=/);
    assert.match(html, /<label>Moeda<select name="currency"/);
  }
  const styles = accountsCardsPageStyles();
  assert.match(styles, /resource-form-actions/);
  assert.doesNotMatch(styles, /\\.master-dialog\\s*\\{/);
  assert.match(styles, /max-width: 360px/);
  assert.match(styles, /resource-master-link:focus-visible/);
  assert.match(styles, /grid-template-columns: minmax\(0, 2\.55fr\) minmax\(288px, 1fr\)/);
  assert.match(styles, /resource-master-columns/);
  assert.match(styles, /--sf-color-neutral-control-hover/);
  assert.match(styles, /resource-master-filters.sf-filter-bar/);
  assert.doesNotMatch(styles, /filter: brightness/);
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

test("#716 aplica variantes de Golden Screen no mestre e mantém edição secundária", () => {
  const view = buildAccountsCardsPageViewModel([account], [card], "account:a-1");
  const master = renderResourceMaster(view.resources);
  const detail = renderSelectedResourceDetail(view.selectedResource, [account]);
  assert.match(master, /resource-master-filters sf-filter-bar/);
  assert.match(detail, /sf-button-secondary/);
  assert.doesNotMatch(detail, /resource-primary-action/);
  assert.match(detail, /data-button-variant="neutral"/);
});

test("#716 controla CDI por conta e ações somente com ícones nomeados", () => {
  const configured = buildAccountsCardsPageViewModel([account], [], "account:a-1", [
    { accountId: account.id, accountCurrency: "BRL", enabled: true, indexKind: "cdi" },
  ]);
  const active = renderSelectedResourceDetail(configured.selectedResource, configured.accounts, {
    accountId: account.id,
    accountCurrency: "BRL",
    enabled: true,
    indexKind: "cdi",
  });
  assert.match(active, /role="switch" aria-label="Remuneração CDI de Conta de exemplo"/);
  assert.match(active, /aria-checked="true" data-cdi-toggle data-account-id="a-1"/);
  assert.match(active, /data-cdi-state>Ativo</);
  assert.match(active, /aria-live="polite" data-cdi-feedback/);
  assert.doesNotMatch(active, /href="\/remuneracao-contas"/);
  for (const label of ["Editar conta", "Arquivar conta", "Excluir conta"]) {
    assert.match(active, new RegExp('title="' + label + '" aria-label="' + label + '"'));
  }
  assert.doesNotMatch(active, /sf-button-label">Editar conta/);
  const unverified = renderSelectedResourceDetail(
    configured.selectedResource,
    configured.accounts,
    undefined,
    false,
  );
  assert.match(unverified, /data-cdi-toggle data-account-id="a-1" disabled/);
  assert.match(unverified, /data-cdi-state>Não verificado</);
  const ineligibleAccount = { ...account, status: "archived" };
  const ineligibleView = buildAccountsCardsPageViewModel([ineligibleAccount], []);
  const ineligible = renderSelectedResourceDetail(ineligibleView.selectedResource, [
    ineligibleAccount,
  ]);
  assert.match(ineligible, /data-cdi-toggle data-account-id="a-1" disabled/);
  assert.match(ineligible, /data-cdi-state>Não elegível</);
  const cardView = buildAccountsCardsPageViewModel([], [card], "card:c-1");
  const cardDetail = renderSelectedResourceDetail(cardView.selectedResource, []);
  assert.doesNotMatch(cardDetail, /data-cdi-toggle/);
  for (const label of [
    "Editar cartão",
    "Adicionar instrumento",
    "Arquivar cartão",
    "Excluir cartão",
  ]) {
    assert.match(cardDetail, new RegExp('title="' + label + '" aria-label="' + label + '"'));
  }
});

test("#716 restaura a configuração CDI via modal na própria tela", () => {
  const dialog = renderAccountCdiConfigurationDialog(
    account,
    {
      accountId: account.id,
      accountCurrency: "BRL",
      enabled: true,
      indexKind: "cdi",
      remunerationPercent: 95.25,
      startsOn: "2026-10-15",
      categoryId: "receita-1",
    },
    [
      { id: "receita-1", name: "Rendimentos", kind: "income", status: "active" },
      { id: "saida-1", name: "Despesa", kind: "expense", status: "active" },
      { id: "inativa-1", name: "Desativada", kind: "income", status: "archived" },
    ],
  );
  assert.match(dialog, /id="account-cdi-dialog-a-1"/);
  assert.match(dialog, /data-cdi-configuration-form data-account-id="a-1"/);
  assert.match(dialog, /name="remunerationPercent"[^>]+value="95.25"/);
  assert.match(dialog, /name="startsOn"[^>]+value="2026-10-15"/);
  assert.match(dialog, /value="receita-1" selected/);
  assert.doesNotMatch(dialog, /value="saida-1"/);
  assert.doesNotMatch(dialog, /value="inativa-1"/);
  assert.match(dialog, /data-sf-dialog-close>Cancelar/);
  assert.match(dialog, /data-cdi-form-status/);
});

test("#716 aplica Golden Screen aos grupos de ação das subtelas de contas e cartões", () => {
  const accountView = buildAccountsCardsPageViewModel([account], [], "account:a-1");
  const accountDetail = renderSelectedResourceDetail(accountView.selectedResource, [account]);
  assert.match(accountDetail, /class="resource-account-cdi-row"/);
  assert.match(accountDetail, /class="resource-action-toolbar" role="group" aria-label="Manutenção da conta"/);
  assert.match(accountDetail, /class="resource-action-toolbar-separator"/);
  assert.equal((accountDetail.match(/class="sf-button sf-button-secondary[^"]*resource-action-button/g) ?? []).length, 2);
  assert.match(accountDetail, /aria-label="Configurar remuneração CDI"/);
  assert.match(accountDetail, /aria-label="Excluir conta"/);
  assert.match(accountDetail, /danger-icon-button"/);
  assert.equal((accountDetail.match(/resource-action-button/g) ?? []).length, 4);

  const cardView = buildAccountsCardsPageViewModel([], [card], "card:c-1");
  const cardDetail = renderSelectedResourceDetail(cardView.selectedResource, []);
  assert.match(cardDetail, /class="resource-action-toolbar" role="group" aria-label="Manutenção do cartão"/);
  assert.doesNotMatch(cardDetail, /class="resource-account-cdi-row"/);
  assert.match(cardDetail, /aria-label="Adicionar instrumento"/);
  assert.match(cardDetail, /aria-label="Excluir cartão"/);

  const css = accountsCardsPageStyles();
  assert.match(css, /\.resource-detail-actions button\.resource-action-button \{/);
  assert.match(css, /height: var\(--sf-density-interactive-target-min\)/);
  assert.match(css, /width: var\(--sf-density-interactive-target-min\)/);
  assert.match(css, /\.resource-detail-actions button\.resource-action-button:hover:not\(:disabled\)/);
  assert.match(css, /\.resource-detail-actions button\.danger-icon-button:focus-visible/);
  assert.match(css, /\.resource-detail-actions button\.resource-cdi-switch\[aria-checked="true"\]/);
  assert.match(css, /\.resource-account-cdi-row \{ flex-wrap: wrap; \}/);
});
