import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { emptyScreen, errorScreen, loadingScreen, successScreen } from "./screen-view-model.js";

const context = {
  filters: { month: "2026-08" },
  provenance: [
    {
      source: "api" as const,
      resource: "/api/example",
      availability: "available" as const,
    },
  ],
};

describe("screen view-model states", () => {
  it("keeps loading, success, empty and error explicit and carries screen context", () => {
    const loading = loadingScreen<{ value: string }>(context);
    const success = successScreen(context, { value: "ready" });
    const empty = emptyScreen<{ value: string }>(context, {
      title: "Sem dados",
      description: "Nenhum item foi encontrado.",
    });
    const error = errorScreen<{ value: string }>(context, { message: "Falha controlada" });

    assert.equal(loading.status, "loading");
    assert.equal(success.status, "success");
    assert.equal(empty.status, "empty");
    assert.equal(error.status, "error");

    assert.deepEqual(success.context.filters, { month: "2026-08" });
    assert.deepEqual(success.context.provenance, context.provenance);
  });
});
