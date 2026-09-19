import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { solverFinShellRoutes } from "../app-shell/routes.js";
import {
  getSecondaryRoutePageViewModel,
  type SecondaryRouteId,
} from "./secondary-routes-view-model.js";

const expected = [
  ["categories", "/categorias", "financial-profile", "operational"],
  ["settings", "/configuracoes", "authenticated", "operational"],
  ["assistant", "/assistente", "financial-profile", "read-only"],
  ["adminInstitutions", "/admin/instituicoes", "master", "operational"],
  ["adminFinancialIndexes", "/admin/indices-financeiros", "master", "operational"],
  ["accountRemuneration", "/remuneracao-contas", "financial-profile", "legacy-renderer"],
] as const;

describe("secondary route foundation contract for issue 615", () => {
  it("covers every scoped route with explicit audience, archetype and operational mode", () => {
    for (const [id, path, audience, operationalMode] of expected) {
      const model = getSecondaryRoutePageViewModel(id as SecondaryRouteId);
      const route = solverFinShellRoutes.find((candidate) => candidate.id === id);

      assert.ok(route, `route ${id} should exist`);
      assert.equal(route.path, path);
      assert.equal(route.status, "available");
      assert.equal(model.audience, audience);
      assert.equal(model.operationalMode, operationalMode);
      assert.ok(model.archetype.length > 0);
      assert.ok(model.title.length > 0);
    }
  });

  it("preserves master-only administration and the hidden legacy remuneration journey", () => {
    const institutions = solverFinShellRoutes.find((route) => route.id === "adminInstitutions");
    const indexes = solverFinShellRoutes.find((route) => route.id === "adminFinancialIndexes");
    const remuneration = solverFinShellRoutes.find((route) => route.id === "accountRemuneration");
    const assistant = solverFinShellRoutes.find((route) => route.id === "assistant");

    assert.equal(institutions?.requiresMaster, true);
    assert.equal(indexes?.requiresMaster, true);
    assert.equal(remuneration?.showInNavigation, false);
    assert.equal(remuneration?.requiresFinancialProfile, true);
    assert.equal(assistant?.requiresFinancialProfile, true);
    assert.equal(getSecondaryRoutePageViewModel("assistant").operationalMode, "read-only");
  });
});
