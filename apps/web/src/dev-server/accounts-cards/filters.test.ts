import assert from "node:assert/strict";

import { renderResourceMaster } from "./components.js";
import { renderAccountsCardsRuntimeScript } from "./runtime.js";
import type { ResourceMasterViewModel } from "./view-model.js";

rendersTypeAndCurrencyFiltersWithExplicitResourceMetadata();
rendersCompactAccountTypeColumnWithTooltips();
keepsCombinedFilterControlsInTheRouteRuntime();
persistsAndRestoresTheFourFilterControls();
degradesUnsupportedPersistedSelectValuesToNeutralDefaults();
clearsSelectionWhenTheSelectedResourceIsFilteredOut();

function rendersTypeAndCurrencyFiltersWithExplicitResourceMetadata(): void {
  const resources: ResourceMasterViewModel[] = [
    resourceFixture({
      key: "account:usd-account",
      kind: "account",
      id: "usd-account",
      name: "Conta USD",
      currency: "USD",
      currencyLabel: "USD",
    }),
    resourceFixture({
      key: "card:no-currency",
      kind: "card",
      id: "no-currency",
      name: "Cartão sem moeda",
      currency: undefined,
      currencyLabel: "Moeda indisponível",
    }),
  ];

  const html = renderResourceMaster(resources);

  assert.match(html, /data-master-kind/);
  assert.match(html, /<option value="account">Contas<\/option>/);
  assert.match(html, /<option value="card">Cartões<\/option>/);
  assert.match(html, /data-master-currency/);
  assert.match(html, /<option value="all">Todas as moedas<\/option>/);
  assert.match(html, /<option value="USD">USD<\/option>/);
  assert.match(html, /<option value="unavailable">Moeda indisponível<\/option>/);
  assert.match(html, /data-kind="account" data-currency="USD"/);
  assert.match(html, /data-kind="card" data-currency="unavailable"/);
  assert.match(html, /Ajuste a busca ou os filtros de tipo, moeda e status/);
}

function rendersCompactAccountTypeColumnWithTooltips(): void {
  const account: ResourceMasterViewModel = {
    ...resourceFixture({
      key: "account:checking",
      kind: "account",
      id: "checking",
      name: "Conta principal",
      currency: "BRL",
      currencyLabel: "BRL",
    }),
    accountKind: "checking",
    institutionLabel: "Banco exemplo",
    secondaryLabel: "Conta corrente",
  };
  const card: ResourceMasterViewModel = {
    ...resourceFixture({
      key: "card:credit",
      kind: "card",
      id: "credit",
      name: "Cartão principal",
      currency: "BRL",
      currencyLabel: "BRL",
    }),
    secondaryLabel: "Visa · 2 instrumentos ativos",
  };
  const html = renderResourceMaster([account, card]);

  assert.match(html, /<span>Tipo<\/span><span>Conta ou cartão<\/span><span>Moeda<\/span>/);
  assert.match(html, /class="resource-master-type" role="img" aria-label="Conta corrente" title="Conta corrente"/);
  assert.match(html, /class="resource-master-type" role="img" aria-label="Cartão · Visa · 2 instrumentos ativos"/);
  assert.match(html, /<span class="resource-master-institution"[^>]*>Banco exemplo/);
  assert.doesNotMatch(html, /class="resource-master-context"/);
  const accountStart = html.indexOf('data-kind="account"');
  const accountRow = html.slice(accountStart, html.indexOf("</article>", accountStart));
  assert.ok(accountRow, "Account row must render");
  assert.ok(
    accountRow.indexOf('class="resource-master-type"') <
      accountRow.indexOf('class="resource-master-identity"'),
    "The type icon must precede account identity in document order",
  );
  assert.match(html, /data-kind="account"/);
  assert.match(html, /data-kind="card"/);
}

function keepsCombinedFilterControlsInTheRouteRuntime(): void {
  const script = renderAccountsCardsRuntimeScript();

  assert.match(script, /data-master-kind/);
  assert.match(script, /data-master-currency/);
  assert.match(script, /matchesKind/);
  assert.match(script, /matchesCurrency/);
  assert.match(script, /matchesSearch && matchesKind && matchesCurrency && matchesStatus/);
}

function persistsAndRestoresTheFourFilterControls(): void {
  const script = renderAccountsCardsRuntimeScript();

  assert.match(script, /solverfin:accounts-cards:filters:v1/);
  assert.match(script, /sessionStorage\.getItem\(filterStorageKey\)/);
  assert.match(
    script,
    /sessionStorage\.setItem\(filterStorageKey, JSON\.stringify\(currentFilterState\(\)\)\)/,
  );
  assert.match(script, /restorePersistedFilters\(\)/);
  assert.match(script, /search: String\(searchInput && searchInput\.value \|\| ""\)/);
  assert.match(script, /kind: String\(kindSelect && kindSelect\.value \|\| "all"\)/);
  assert.match(script, /currency: String\(currencySelect && currencySelect\.value \|\| "all"\)/);
  assert.match(script, /status: String\(statusSelect && statusSelect\.value \|\| "all"\)/);
  assert.match(script, /persistFilters\(\);\s*applyFilters\(\);/);
}

function degradesUnsupportedPersistedSelectValuesToNeutralDefaults(): void {
  const script = renderAccountsCardsRuntimeScript();

  assert.match(
    script,
    /selectSupportsValue\(kindSelect, persisted\.kind\) \? persisted\.kind : "all"/,
  );
  assert.match(
    script,
    /selectSupportsValue\(currencySelect, persisted\.currency\) \? persisted\.currency : "all"/,
  );
  assert.match(
    script,
    /selectSupportsValue\(statusSelect, persisted\.status\) \? persisted\.status : "all"/,
  );
  assert.match(script, /catch \{\s*return null;\s*\}/);
}

function clearsSelectionWhenTheSelectedResourceIsFilteredOut(): void {
  const script = renderAccountsCardsRuntimeScript();

  assert.match(script, /resource-master-link\[aria-current="page"\]/);
  assert.match(script, /selectedItem && selectedItem\.hidden/);
  assert.match(script, /removeAttribute\("aria-current"\)/);
  assert.match(script, /classList\.remove\("is-selected"\)/);
  assert.match(script, /data-filter-selection-empty/);
}

function resourceFixture(
  overrides: Pick<
    ResourceMasterViewModel,
    "key" | "kind" | "id" | "name" | "currency" | "currencyLabel"
  >,
): ResourceMasterViewModel {
  return {
    ...overrides,
    status: "active",
    institutionKey: "",
    institutionLabel: "Instituição",
    brandKey: undefined,
    secondaryLabel: "Contexto",
    amountMinor: 0,
    amountLabel: overrides.kind === "account" ? "Saldo inicial" : "Limite total",
    search: `${overrides.name} ${overrides.currencyLabel}`.toLowerCase(),
    href: `/contas-cartoes?resource=${encodeURIComponent(overrides.key)}`,
    isSelected: false,
  };
}
