import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderCategoryParentOptions, renderCategoryTree } from "./categories-page.js";

/**
 * Executable negative controls for #717.
 *
 * Each case starts with actual SSR output, changes one observable property,
 * and verifies that the corresponding assertion rejects the mutated output.
 * The run proves assertion sensitivity; it is not a production-build mutation.
 */
const categories = [
  { id: "root", name: "Alimentação", kind: "expense", status: "active" },
  {
    id: "child",
    name: "Restaurantes e lanchonetes",
    kind: "expense",
    status: "active",
    parentCategoryId: "root",
  },
  {
    id: "grandchild",
    name: "Refeições com descrição longa",
    kind: "expense",
    status: "archived",
    parentCategoryId: "child",
  },
  { id: "income", name: "Salário", kind: "income", status: "active" },
];

function assertKilled(
  id: string,
  original: string,
  mutant: string,
  oracle: (value: string) => void,
): void {
  assert.notEqual(mutant, original, `${id}: mutation must change its input`);
  oracle(original);
  assert.throws(() => oracle(mutant), { name: "AssertionError" });
  console.info(`[categories-negative] ${id} KILLED by executable assertion`);
}

describe("Issue 717 executed negative controls", () => {
  it("NC-717-01 rejects a situation without its accessible status icon", () => {
    const html = renderCategoryTree(categories);
    assertKilled(
      "NC-717-01",
      html,
      html.replace(
        'role="img" aria-label="Arquivado"',
        'role="presentation" aria-label="Arquivado"',
      ),
      (value) => assert.match(value, /role="img" aria-label="Arquivado"/),
    );
  });

  it("NC-717-02 rejects a flattened root/child list", () => {
    const html = renderCategoryTree(categories);
    assertKilled(
      "NC-717-02",
      html,
      html.replace('<ul id="category-children-root"', '<div id="category-children-root"'),
      (value) => assert.match(value, /<ul id="category-children-root"/),
    );
  });

  it("NC-717-03 rejects a descendant missing its ancestor chain", () => {
    const html = renderCategoryParentOptions(categories);
    assertKilled(
      "NC-717-03",
      html,
      html.replace(
        'value="grandchild" data-category-ancestor-ids="child,root"',
        'value="grandchild" data-category-ancestor-ids=""',
      ),
      (value) => assert.match(value, /value="grandchild" data-category-ancestor-ids="child,root"/),
    );
  });

  it("NC-717-04 rejects flat summary cards replacing native nodes", () => {
    const html = renderCategoryTree(categories);
    assertKilled(
      "NC-717-04",
      html,
      html.replace('<li class="category-tree-node', '<div class="category-summary-item'),
      (value) => assert.equal((value.match(/<li class="category-tree-node/g) ?? []).length, 4),
    );
  });

  it("NC-717-05 rejects unescaped names in SSR output", () => {
    const html = renderCategoryTree([
      {
        id: "danger",
        name: "<Compras> & outras",
        kind: "expense",
        status: "active",
      },
    ]);
    assertKilled("NC-717-05", html, html.replace("&lt;Compras&gt;", "<Compras>"), (value) => {
      assert.match(value, /&lt;Compras&gt;/);
      assert.doesNotMatch(value, /<Compras>/);
    });
  });

  it("NC-717-06 rejects a missing third hierarchy level", () => {
    const html = renderCategoryTree(categories);
    assertKilled(
      "NC-717-06",
      html,
      html.replace('data-category-depth="2"', 'data-category-depth="1"'),
      (value) => assert.match(value, /data-category-depth="2"/),
    );
  });

  it("NC-717-07 rejects create-child on archived categories", () => {
    const html = renderCategoryTree([
      { id: "archived", name: "Antiga", kind: "expense", status: "archived" },
    ]);
    assertKilled(
      "NC-717-07",
      html,
      html.replace('data-category-menu-action="edit"', 'data-category-menu-action="create-child"'),
      (value) => assert.doesNotMatch(value, /data-category-menu-action="create-child"/),
    );
  });

  it("NC-717-08 rejects a CI run from another material SHA", () => {
    const current = "a".repeat(40);
    const guard = (value: string) => assert.equal(value, current);
    assertKilled("NC-717-08", current, "b".repeat(40), guard);
  });

  it("NC-717-09 rejects a hierarchy without a non-color level label", () => {
    const html = renderCategoryTree(categories);
    assertKilled(
      "NC-717-09",
      html,
      html.replace('aria-label="Nível 3"', 'aria-label=""'),
      (value) => assert.match(value, /aria-label="Nível 3"/),
    );
  });

  it("NC-717-10 rejects an archived item with the wrong maintenance action", () => {
    const html = renderCategoryTree([
      { id: "archived", name: "Antiga", kind: "expense", status: "archived" },
    ]);
    assertKilled(
      "NC-717-10",
      html,
      html.replace(
        'data-api-path="/api/categories/archived/restore"',
        'data-api-path="/api/categories/archived/archive"',
      ),
      (value) => assert.match(value, /data-api-path="\/api\/categories\/archived\/restore"/),
    );
  });

  it("NC-717-11 rejects a blank empty-state explanation", () => {
    const html = renderCategoryTree([]);
    assertKilled("NC-717-11", html, html.replace("Nenhuma categoria cadastrada.", ""), (value) =>
      assert.match(value, /Nenhuma categoria cadastrada/),
    );
  });

  it("NC-717-12 rejects a visual report with failures", () => {
    const current = JSON.stringify({ failures: [], route: "/categorias" });
    const rejected = JSON.stringify({
      failures: ["category overflow"],
      route: "/categorias",
    });
    assertKilled("NC-717-12", current, rejected, (value) => {
      const report = JSON.parse(value) as { failures: string[]; route: string };
      assert.equal(report.route, "/categorias");
      assert.equal(report.failures.length, 0);
    });
  });

  it("NC-717-13 rejects a compact list missing its parent column", () => {
    const html = renderCategoryTree(categories);
    assertKilled(
      "NC-717-13",
      html,
      html.replaceAll("Categoria superior</span>", "Coluna ausente</span>"),
      (value) => assert.match(value, /Categoria superior<\/span>/),
    );
  });
});
