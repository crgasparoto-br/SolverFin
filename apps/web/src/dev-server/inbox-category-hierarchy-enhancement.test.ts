import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import {
  buildInboxCategoryChoices,
  enhanceInboxCategoryHierarchy,
  resolveInboxCategorySelection,
  type CategoryRecord,
} from "./inbox-category-hierarchy-enhancement.js";

const hierarchyPageSource = readFileSync(
  resolve(process.cwd(), "src/dev-server/inbox-category-hierarchy-page.ts"),
  "utf8",
);

const categories: CategoryRecord[] = [
  { id: "food", name: "Alimentação", kind: "expense", status: "active" },
  { id: "market", name: "Mercado", kind: "expense", status: "active", parentCategoryId: "food" },
  {
    id: "organic",
    name: "Orgânicos",
    kind: "expense",
    status: "active",
    parentCategoryId: "market",
  },
  { id: "housing", name: "Moradia", kind: "expense", status: "active" },
  {
    id: "utilities",
    name: "Utilidades",
    kind: "expense",
    status: "archived",
    parentCategoryId: "housing",
  },
  { id: "water", name: "Água", kind: "expense", status: "active", parentCategoryId: "utilities" },
  { id: "income-root", name: "Trabalho", kind: "income", status: "active" },
  {
    id: "income-market",
    name: "Mercado",
    kind: "income",
    status: "active",
    parentCategoryId: "income-root",
  },
  {
    id: "cross-kind-child",
    name: "Ajuste",
    kind: "expense",
    status: "active",
    parentCategoryId: "income-root",
  },
  { id: "transfer", name: "Transferências", kind: "transfer", status: "active" },
];

function inboxFixture(): string {
  return `<html><head><style>.base { display: block; }</style></head><body><main>
    <dialog id="csv-line-edit-dialog">
      <form id="csv-line-edit-form">
        <label for="csv-line-category">Categoria</label>
        <select id="csv-line-category" name="categoryId"></select>
      </form>
    </dialog>
    <script>
        function escapeHtml(value) { return String(value); }
        function categoryOptions(payload) {
          return '<option value="">Sem categoria</option>' + categories.filter((category) => category.status === "active" && category.kind === payload.kind).map((category) =>
            '<option value="' + escapeHtml(category.id) + '" ' + (payload.categoryId === category.id ? "selected" : "") + '>' + escapeHtml(category.name) + '</option>'
          ).join("");
        }
        function accountOptions(payload) { return payload.accountId; }
        function openLineEditDialog(item, trigger) {
          const payload = item.payload || {};
          setStatus(lineEditStatus, "Revise os campos e salve para executar uma nova análise de duplicidade.", "muted");
        }
        lineEditForm.elements.kind.addEventListener("change", () => {
          const current = state.detail?.suggestions.find((item) => item.id === state.editingSuggestionId);
          const payload = { ...(current?.payload || {}), kind: lineEditForm.elements.kind.value, categoryId: lineEditForm.elements.categoryId.value || undefined };
          lineEditForm.elements.categoryId.innerHTML = categoryOptions(payload);
          if (payload.categoryId) lineEditForm.elements.categoryId.value = payload.categoryId;
        });
    </script>
  </main></body></html>`;
}

describe("Inbox category hierarchy", () => {
  it("orders roots and descendants recursively with complete paths", () => {
    const choices = buildInboxCategoryChoices(categories);
    const expenseChoices = choices.filter((choice) => choice.kind === "expense");

    assert.deepEqual(
      expenseChoices.map((choice) => choice.id),
      ["food", "market", "organic", "housing", "utilities", "water", "cross-kind-child"],
    );
    assert.equal(
      choices.find((choice) => choice.id === "organic")?.path,
      "Alimentação › Mercado › Orgânicos",
    );
    assert.equal(
      choices.find((choice) => choice.id === "water")?.path,
      "Moradia › Utilidades › Água",
    );
    assert.equal(choices.find((choice) => choice.id === "utilities")?.selectable, false);
    assert.equal(choices.find((choice) => choice.id === "water")?.selectable, true);
    const crossKindChild = choices.find((choice) => choice.id === "cross-kind-child");
    assert.equal(crossKindChild?.path, "Trabalho › Ajuste");
    assert.equal(crossKindChild?.kind, "expense");
    assert.equal(crossKindChild?.selectable, true);
    assert.equal(choices.find((choice) => choice.id === "transfer")?.selectable, false);
  });

  it("sorts roots and siblings alphabetically in pt-BR", () => {
    const unordered: CategoryRecord[] = [
      { id: "z-root", name: "Zeladoria", kind: "expense", status: "active" },
      { id: "a-root", name: "Alimentação", kind: "expense", status: "active" },
      { id: "z-child", name: "Restaurante", kind: "expense", status: "active", parentCategoryId: "a-root" },
      { id: "a-child", name: "Açougue", kind: "expense", status: "active", parentCategoryId: "a-root" },
      { id: "m-child", name: "Mercado", kind: "expense", status: "active", parentCategoryId: "a-root" },
    ];

    assert.deepEqual(
      buildInboxCategoryChoices(unordered).map((choice) => choice.id),
      ["a-root", "a-child", "m-child", "z-child", "z-root"],
    );
  });

  it("distinguishes homonyms by full path and keeps kinds separate", () => {
    const choices = buildInboxCategoryChoices(categories);
    const markets = choices.filter((choice) => choice.name === "Mercado");

    assert.deepEqual(
      markets.map((choice) => [choice.kind, choice.path]),
      [
        ["expense", "Alimentação › Mercado"],
        ["income", "Trabalho › Mercado"],
      ],
    );
  });

  it("uses controlled paths for missing parents and cycles", () => {
    const malformed: CategoryRecord[] = [
      {
        id: "orphan",
        name: "Órfã",
        kind: "expense",
        status: "active",
        parentCategoryId: "missing",
      },
      { id: "a", name: "A", kind: "expense", status: "active", parentCategoryId: "b" },
      { id: "b", name: "B", kind: "expense", status: "active", parentCategoryId: "a" },
    ];
    const choices = buildInboxCategoryChoices(malformed);

    assert.equal(choices.find((choice) => choice.id === "orphan")?.path, "Sem grupo › Órfã");
    assert.equal(
      choices.find((choice) => choice.id === "orphan")?.hierarchyState,
      "missing_parent",
    );
    assert.match(choices.find((choice) => choice.id === "a")?.path ?? "", /^Hierarquia inválida ›/);
    assert.match(choices.find((choice) => choice.id === "b")?.path ?? "", /^Hierarquia inválida ›/);
    assert.equal(new Set(choices.map((choice) => choice.id)).size, 3);
  });

  it("preserves compatible IDs and clears incompatible or unavailable selections", () => {
    const choices = buildInboxCategoryChoices(categories);

    assert.deepEqual(resolveInboxCategorySelection(choices, "market", "expense"), {
      categoryId: "market",
      removedBecauseIncompatible: false,
      unavailable: false,
    });
    assert.deepEqual(resolveInboxCategorySelection(choices, "market", "income"), {
      categoryId: undefined,
      removedBecauseIncompatible: true,
      unavailable: false,
    });
    assert.deepEqual(resolveInboxCategorySelection(choices, "utilities", "expense"), {
      categoryId: "utilities",
      removedBecauseIncompatible: false,
      unavailable: true,
    });
    assert.deepEqual(resolveInboxCategorySelection(choices, "removed", "expense"), {
      categoryId: "removed",
      removedBecauseIncompatible: false,
      unavailable: true,
    });
    assert.deepEqual(resolveInboxCategorySelection(choices, "transfer", "transfer"), {
      categoryId: "transfer",
      removedBecauseIncompatible: false,
      unavailable: true,
    });
  });

  it("keeps the native labeled selector and recalculates without replacing the focused control", () => {
    const html = enhanceInboxCategoryHierarchy(inboxFixture(), categories);

    assert.match(html, /data-inbox-category-hierarchy-enhanced/);
    assert.match(html, /<label for="csv-line-category">Categoria<\/label>/);
    assert.match(html, /<select id="csv-line-category" name="categoryId"><\/select>/);
    assert.match(html, /const categorySelect = lineEditForm\.elements\.categoryId/);
    assert.match(html, /categorySelect\.innerHTML = categoryOptions/);
    assert.doesNotMatch(html, /categorySelect\.replaceWith|lineEditForm\.replaceChildren/);
    assert.match(html, /Alimentação › Mercado › Orgânicos/);
    assert.match(html, /Moradia › Utilidades › Água/);
    assert.match(html, /<option value="">Sem categoria<\/option>/);
    assert.match(html, /\(indisponível\)/);
    assert.match(html, /setCustomValidity/);
    assert.match(html, /A categoria foi removida porque não é compatível ou não está disponível/);
    assert.match(
      html,
      /const resolveInboxCategorySelection = function resolveInboxCategorySelection/,
    );
    assert.match(html, /select\[name="categoryId"\]/);
  });

  it("loads the complete tenant-scoped category hierarchy for the Inbox", () => {
    assert.match(hierarchyPageSource, /\/api\/categories\?status=all/);
    assert.match(hierarchyPageSource, /CategoryRecord\[\]/);
    assert.match(hierarchyPageSource, /enhanceInboxCategoryHierarchy/);
  });

  it("is idempotent and ignores unrelated pages", () => {
    const enhanced = enhanceInboxCategoryHierarchy(inboxFixture(), categories);

    assert.equal(enhanceInboxCategoryHierarchy(enhanced, categories), enhanced);
    assert.equal(
      enhanceInboxCategoryHierarchy("<main>Dashboard</main>", categories),
      "<main>Dashboard</main>",
    );
  });
});
