import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderCategoryParentOptions, renderCategoryTree } from "./categories-page.js";

const fixtures = [
  { id: "root", name: "Alimentação", kind: "expense", status: "active" },
  { id: "child", name: "Restaurantes e lanchonetes", kind: "expense", status: "active", parentCategoryId: "root" },
  { id: "grandchild", name: "Refeições de trabalho com um nome realmente longo que precisa quebrar no mobile", kind: "expense", status: "archived", parentCategoryId: "child" },
  { id: "income", name: "Salário", kind: "income", status: "active" },
];

describe("Golden Screen categories hierarchy issue 717", () => {
  it("keeps three nested levels as native lists with explicit depth and item actions", () => {
    const html = renderCategoryTree(fixtures);
    assert.equal((html.match(/<li class="category-tree-node/g) ?? []).length, 4);
    assert.equal((html.match(/<ul id="category-children-/g) ?? []).length, 2);
    assert.match(html, /data-category-depth="0"/);
    assert.match(html, /data-category-depth="1"/);
    assert.match(html, /data-category-depth="2"/);
    assert.match(html, /Nível 3/);
    assert.match(html, /aria-expanded="true"/);
    assert.match(html, /aria-controls="category-children-child"/);
    assert.match(html, /role="menuitem"/);
    assert.match(html, /data-category-menu-action="edit"/);
    assert.match(html, /data-category-menu-action="request"/);
    assert.match(html, /Refeições de trabalho com um nome realmente longo/);
    assert.doesNotMatch(html, /category-summary-item|class="category-tree-node-card"/);
  });

  it("keeps hierarchy readable without relying on color, including orphaned parents", () => {
    const html = renderCategoryTree([
      { id: "orphan", name: "Filha sem pai carregado", kind: "expense", status: "active", parentCategoryId: "missing" },
      { id: "parent", name: "Transferências", kind: "transfer", status: "active" },
    ]);
    assert.match(html, /Categoria principal/);
    assert.match(html, /data-category-kind="expense"/);
    assert.match(html, /data-category-kind="transfer"/);
    assert.match(html, /Filha sem pai carregado/);
  });

  it("escapes names on nodes, labels and menu actions", () => {
    const html = renderCategoryTree([
      { id: "escaped", name: '<Compras> & "outras"', kind: "expense", status: "active" },
    ]);
    assert.match(html, /&lt;Compras&gt; &amp; &quot;outras&quot;/);
    assert.doesNotMatch(html, /<Compras>/);
  });

  it("avoids create-child action on archived categories without removing maintenance actions", () => {
    const html = renderCategoryTree([
      { id: "archived", name: "Antiga", kind: "expense", status: "archived" },
    ]);
    assert.doesNotMatch(html, /data-category-menu-action="create-child"/);
    assert.match(html, /Restaurar/);
    assert.match(html, /data-category-menu-action="edit"/);
  });

  it("exposes ancestor chains for the existing modal to reject cycles", () => {
    const html = renderCategoryParentOptions(fixtures);
    assert.match(html, /value="child" data-category-ancestor-ids="root"/);
    assert.match(html, /value="grandchild" data-category-ancestor-ids="child,root"/);
  });

  it("shows a meaningful catalogue empty state", () => {
    assert.match(renderCategoryTree([]), /Nenhuma categoria cadastrada/);
  });
});
