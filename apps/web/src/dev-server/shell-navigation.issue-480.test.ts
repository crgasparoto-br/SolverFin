import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listNavigablePrivateShellRoutes } from "../app-shell/routes.js";
import { renderAuthenticatedShellDocument } from "./shell.js";

describe("issue #480 authenticated navigation", () => {
  it("serializes every navigable master route from the central route catalog", () => {
    const html = renderDashboardShell();
    const masterRoutes = listNavigablePrivateShellRoutes({ includeMaster: true }).filter(
      (route) => route.requiresMaster === true,
    );

    for (const route of masterRoutes) {
      assert.match(html, new RegExp(`\\"id\\":\\"${route.id}\\"`));
      assert.match(html, new RegExp(`\\"path\\":\\"${escapeRegExp(route.path)}\\"`));
      assert.match(html, new RegExp(`\\"label\\":\\"${escapeRegExp(route.label)}\\"`));
    }

    assert.match(html, /for \(const route of masterRoutes\)/);
    assert.doesNotMatch(html, /link\.href = "\/admin\/instituicoes"/);
  });

  it("renders an icon for every private navigation route included in the initial HTML", () => {
    for (const includeMaster of [false, true]) {
      const html = renderAuthenticatedShellDocument({
        activePathname: "/dashboard",
        content: "<section>Conteúdo</section>",
        currentLabel: "Dashboard",
        showAdminNavigation: includeMaster,
        styles: "",
      });

      for (const route of listNavigablePrivateShellRoutes({ includeMaster })) {
        const link = findNavigationLink(html, route.path);
        assert.match(link.content, /<svg[^>]*aria-hidden="true"/);
      }
    }
  });

  it("keeps brand and logout fixed while only desktop navigation scrolls", () => {
    const html = renderDashboardShell();

    assert.match(html, /@media \(min-width: 761px\)/);
    assert.match(html, /\.sidebar \{ overflow: hidden; \}/);
    assert.match(html, /\.sidebar > \.brand, \.sidebar > \.logout \{ flex: 0 0 auto; \}/);
    assert.match(html, /\.sidebar > nav \{[\s\S]*min-height: 0;[\s\S]*overflow-y: auto;/);
    assert.match(html, /@media \(max-width: 760px\)[\s\S]*overflow-y: visible/);
  });

  it("rebuilds aria-controls from all secondary links after adding master routes", () => {
    const html = renderDashboardShell();

    assert.match(html, /querySelectorAll\('a\[data-nav-priority="secondary"\]\[id\]'\)/);
    assert.match(html, /toggle\.setAttribute\("aria-controls", secondaryIds\.join\(" "\)\)/);
    assert.match(html, /data-nav-route-id=/);
    assert.match(html, /data-nav-group-label=/);
  });
});

function renderDashboardShell(): string {
  return renderAuthenticatedShellDocument({
    activePathname: "/dashboard",
    content: "<section>Conteúdo</section>",
    currentLabel: "Dashboard",
    styles: "",
  });
}

function findNavigationLink(html: string, path: string): { content: string } {
  const match = new RegExp(
    `<a href="${escapeRegExp(path)}"[^>]*>([\\s\\S]*?)<\\/a>`,
  ).exec(html);
  assert.ok(match, `Expected navigation link for ${path}`);
  return { content: match[1] ?? "" };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
