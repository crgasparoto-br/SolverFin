import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildInboxCategoryChoices,
  type CategoryRecord,
} from "./inbox-category-hierarchy-enhancement.js";

describe("Inbox category root selection", () => {
  it("keeps active root categories selectable alongside their descendants", () => {
    const categories: CategoryRecord[] = [
      {
        id: "expense-root",
        name: "Alimentação",
        kind: "expense",
        status: "active",
      },
      {
        id: "expense-child",
        name: "Mercado",
        kind: "expense",
        status: "active",
        parentCategoryId: "expense-root",
      },
    ];

    const choices = buildInboxCategoryChoices(categories);
    const root = choices.find((choice) => choice.id === "expense-root");

    assert.ok(root, "The active root category must be present in the Inbox choices");
    assert.equal(root.parentCategoryId, undefined);
    assert.equal(root.path, "Alimentação");
    assert.equal(root.selectable, true);
    assert.deepEqual(
      choices
        .filter((choice) => choice.kind === "expense" && choice.selectable)
        .map((choice) => choice.id),
      ["expense-root", "expense-child"],
    );
  });
});
