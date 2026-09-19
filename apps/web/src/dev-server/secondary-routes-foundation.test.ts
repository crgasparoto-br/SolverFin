import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const routeSources = [
  ["categories", "categories-page.ts"],
  ["settings", "settings-page.ts"],
  ["assistant", "financial-assistant-page.ts"],
  ["adminInstitutions", "admin-institutions-page.ts"],
  ["adminFinancialIndexes", "admin-financial-indexes-page.ts"],
  ["accountRemuneration", "account-remuneration-page.ts"],
] as const;

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("secondary route shared foundation issue 615", () => {
  it(
    "routes every scoped renderer through the existing page primitives and presentation model",
    () => {
      for (const [routeId, fileName] of routeSources) {
        const source = read(path.join("apps", "web", "src", "dev-server", fileName));
        assert.match(source, /renderPageContainer/);
        assert.match(source, /renderPageHeader/);
        assert.match(source, /getSecondaryRoutePageViewModel/);
        assert.match(source, new RegExp(`data-secondary-route-foundation=.*\\$\\{`));
        assert.match(
          source,
          new RegExp(`getSecondaryRoutePageViewModel\\("${routeId}"\\)`),
        );
      }
    },
  );

  it("retires the categories string post-processor from the runtime pipeline", () => {
    const server = read(path.join("apps", "web", "src", "dev-server.ts"));
    const inventory = read(
      path.join("apps", "web", "src", "dev-server", "legacy-html-post-processors.ts"),
    );
    const contract = read(
      path.join("apps", "web", "src", "dev-server", "ssr-style-contract.ts"),
    );

    assert.doesNotMatch(server, /enhanceCategoriesIconsAndTooltips/);
    assert.doesNotMatch(inventory, /id: "categories-icons-tooltips"/);
    assert.match(inventory, /LEGACY_HTML_POST_PROCESSOR_BUDGET = 1/);
    assert.match(contract, /data-secondary-route-foundation="categories"/);
    assert.doesNotMatch(contract, /runtime:categories-interface/);
  });

  it(
    "keeps assistant and remuneration modes explicit instead of creating new product journeys",
    () => {
      const assistant = read(
        path.join("apps", "web", "src", "dev-server", "financial-assistant-page.ts"),
      );
      const remuneration = read(
        path.join("apps", "web", "src", "dev-server", "account-remuneration-page.ts"),
      );

      assert.match(assistant, /Somente leitura/);
      assert.match(assistant, /data-operational-mode/);
      assert.match(remuneration, /data-operational-mode/);
      assert.match(remuneration, /Voltar para contas/);
    },
  );
});
