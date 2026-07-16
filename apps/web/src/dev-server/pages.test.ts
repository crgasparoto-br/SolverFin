import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listNavigablePrivateShellRoutes } from "../app-shell/routes.js";
import { renderPrivatePage } from "./pages.js";

describe("dev-server private placeholder pages", () => {
  it("renders placeholder pages with canonical private navigation", async () => {
    const html = await renderPrivatePage("/relatorios", "demo-token");

    assert.match(html, /<title>Relatórios - SolverFin<\/title>/);
    assert.match(html, /<h1>Relatórios<\/h1>/);

    const reportsLink = html.match(/<a href="\/relatorios"[^>]*>[\s\S]*?Relatórios<\/a>/)?.[0];
    assert.ok(reportsLink, "expected the reports navigation link to be rendered");
    assert.match(reportsLink, /id="nav-secondary-reports"/);
    assert.match(reportsLink, /data-nav-route-id="reports"/);
    assert.match(reportsLink, /data-nav-group="review"/);
    assert.match(reportsLink, /data-nav-priority="secondary"/);
    assert.match(reportsLink, /title="[^"]+"/);
    assert.match(reportsLink, /aria-current="page"/);

    for (const route of listNavigablePrivateShellRoutes()) {
      assert.ok(html.includes(`<a href="${route.path}"`));
      assert.ok(html.includes(`>${route.label}</a>`));
    }

    assert.doesNotMatch(html, /href="\/remuneracao-contas"/);
  });
});
