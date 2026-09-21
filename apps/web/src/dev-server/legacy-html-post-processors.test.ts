import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLegacyHtmlPostProcessorPipeline,
  LEGACY_HTML_POST_PROCESSOR_BUDGET,
  LEGACY_HTML_POST_PROCESSOR_INVENTORY,
  type LegacyHtmlPostProcessorOwner,
  type LegacyHtmlPostProcessorRoute,
} from "./legacy-html-post-processors.js";

test("legacy HTML post-processors have a canonical, reducing inventory", () => {
  assert.equal(LEGACY_HTML_POST_PROCESSOR_INVENTORY.length, LEGACY_HTML_POST_PROCESSOR_BUDGET);
  assert.equal(LEGACY_HTML_POST_PROCESSOR_BUDGET, 1);

  const ids = LEGACY_HTML_POST_PROCESSOR_INVENTORY.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);

  const routes = new Set<string>(LEGACY_HTML_POST_PROCESSOR_INVENTORY.map((entry) => entry.route));
  assert.equal(routes.has("/cartoes"), false);
  assert.equal(
    routes.has("/categorias"),
    false,
    "/categorias must stay off the legacy HTML pipeline after the issue #615 migration",
  );
  assert.equal(
    routes.has("/contas-cartoes"),
    false,
    "/contas-cartoes must stay off the legacy HTML pipeline after the A3 migration",
  );

  const expectedOwnerByRoute: Record<LegacyHtmlPostProcessorRoute, LegacyHtmlPostProcessorOwner> = {
    "/contas-cartoes": "web-accounts-cards",
    "/cartoes": "web-cards",
    "/lancamentos": "web-statement",
    "/inbox": "web-inbox",
  };

  for (const route of routes) {
    const routeEntries = LEGACY_HTML_POST_PROCESSOR_INVENTORY.filter(
      (entry) => entry.route === route,
    );
    assert.deepEqual(
      routeEntries.map((entry) => entry.order),
      routeEntries.map((_, index) => index + 1),
      `${route} must keep an explicit contiguous pipeline order`,
    );
  }

  for (const entry of LEGACY_HTML_POST_PROCESSOR_INVENTORY) {
    assert.equal(entry.owner, expectedOwnerByRoute[entry.route]);
    assert.match(entry.responsibility, /\S/);
    assert.match(entry.replacementCriterion, /\S/);
    assert.match(entry.fallbackAccessibility, /\S/);
  }
});

test("legacy HTML pipeline preserves the registered order including async adapters", async () => {
  const result = await applyLegacyHtmlPostProcessorPipeline("/lancamentos", "rendered", [
    {
      id: "account-remuneration-disclosure",
      transform: async (html) => `${html}|disclosure`,
    },
  ]);
  assert.equal(result, "rendered|disclosure");
});

test("legacy HTML pipeline rejects adapters for a route retired from the inventory", async () => {
  await assert.rejects(
    applyLegacyHtmlPostProcessorPipeline("/contas-cartoes", "rendered", [
      {
        id: "account-remuneration-disclosure",
        transform: (html) => html,
      },
    ]),
    /Legacy HTML post-processor order mismatch for \/contas-cartoes/,
  );
});

test("every route represented in the inventory has at least one residual adapter", () => {
  const expectedRoutes: LegacyHtmlPostProcessorRoute[] = ["/lancamentos"];
  assert.deepEqual(
    [...new Set(LEGACY_HTML_POST_PROCESSOR_INVENTORY.map((entry) => entry.route))],
    expectedRoutes,
  );
});
