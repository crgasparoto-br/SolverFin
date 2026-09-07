import assert from "node:assert/strict";

import { renderResourceMaster } from "./components.js";
import { renderAccountsCardsRuntimeScript } from "./runtime.js";
import type { ResourceMasterViewModel } from "./view-model.js";

rendersTypeAndCurrencyFiltersWithExplicitResourceMetadata();
keepsCombinedFilterControlsInTheRouteRuntime();

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
  assert.match(html, /<option value="USD">USD<\/option>/);
  assert.match(html, /<option value="unavailable">Indisponível<\/option>/);
  assert.match(html, /data-kind="account" data-currency="USD"/);
  assert.match(html, /data-kind="card" data-currency="unavailable"/);
  assert.match(html, /Ajuste a busca ou os filtros de tipo, moeda e status/);
}

function keepsCombinedFilterControlsInTheRouteRuntime(): void {
  const script = renderAccountsCardsRuntimeScript();

  assert.match(script, /data-master-kind/);
  assert.match(script, /data-master-currency/);
  assert.match(script, /matchesKind/);
  assert.match(script, /matchesCurrency/);
  assert.match(script, /matchesSearch && matchesKind && matchesCurrency && matchesStatus/);
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
    search: `${overrides.name} ${overrides.currencyLabel}`.toLowerCase(),
    href: `/contas-cartoes?resource=${encodeURIComponent(overrides.key)}`,
    isSelected: false,
  };
}
