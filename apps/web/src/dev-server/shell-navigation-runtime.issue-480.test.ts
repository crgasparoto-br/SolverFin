import assert from "node:assert/strict";
import { describe, it } from "node:test";
import vm from "node:vm";

import { isPrimaryMobileRoute } from "../app-shell/navigation.js";
import {
  listNavigablePrivateShellRoutes,
  type ShellRoute,
} from "../app-shell/routes.js";
import { renderAuthenticatedShellDocument } from "./shell.js";

describe("issue #480 navigation runtime", () => {
  it("executes the profile script and adds every catalog master route without duplicates", async () => {
    const expectedRoutes = listNavigableMasterRoutes();
    const harness = createHarness(renderShell("/dashboard", false));

    await executeProfileScript(harness, {
      ok: true,
      body: {
        user: {
          displayName: "Master User",
          email: "master@example.test",
          isMaster: true,
        },
      },
    });

    assert.equal(harness.userName.textContent, "Master User");
    assert.deepEqual(
      harness.nav
        .links()
        .filter((link) =>
          expectedRoutes.some((route) => route.id === link.dataset.navRouteId),
        )
        .map((link) => link.dataset.navRouteId),
      expectedRoutes.map((route) => route.id),
    );

    for (const route of expectedRoutes) {
      assertNavigationLinkMatchesRoute(
        requiredLink(harness.nav, route.id),
        route,
      );
    }

    for (const group of new Set(
      expectedRoutes.map((route) => route.navigationGroup),
    )) {
      assert.equal(harness.nav.groupLabels(group).length, 1);
    }

    const secondaryIds = harness.nav
      .querySelectorAll('a[data-nav-priority="secondary"][id]')
      .map((link) => link.id);
    const toggle = requiredToggle(harness.nav);
    assert.deepEqual(
      toggle.getAttribute("aria-controls").split(/\s+/),
      secondaryIds,
    );
    assert.equal(toggle.getAttribute("aria-expanded"), "false");

    await executeProfileScript(harness, {
      ok: true,
      body: { user: { isMaster: true } },
    });

    for (const route of expectedRoutes) {
      assert.equal(harness.nav.linksByRouteId(route.id).length, 1);
    }
    for (const group of new Set(
      expectedRoutes.map((route) => route.navigationGroup),
    )) {
      assert.equal(harness.nav.groupLabels(group).length, 1);
    }
  });

  it("keeps the common navigation for regular users and profile failures", async () => {
    const expectedRoutes = listNavigableMasterRoutes();

    for (const result of [
      {
        ok: true,
        body: { user: { displayName: "Regular User", isMaster: false } },
      },
      { ok: false, body: {} },
      { throws: true },
    ] satisfies ProfileResult[]) {
      const harness = createHarness(renderShell("/dashboard", false));
      const initialRouteIds = harness.nav
        .links()
        .map((link) => link.dataset.navRouteId);

      await executeProfileScript(harness, result);

      assert.deepEqual(
        harness.nav.links().map((link) => link.dataset.navRouteId),
        initialRouteIds,
      );
      for (const route of expectedRoutes) {
        assert.equal(harness.nav.linksByRouteId(route.id).length, 0);
      }
      if (expectedRoutes.some((route) => route.navigationGroup === "admin")) {
        assert.equal(harness.nav.groupLabels("admin").length, 0);
      }
    }
  });

  it("does not duplicate routes already rendered by the server", async () => {
    const expectedRoutes = listNavigableMasterRoutes();
    const harness = createHarness(
      renderShell(expectedRoutes[0]?.path ?? "/dashboard", true),
    );

    await executeProfileScript(harness, {
      ok: true,
      body: { user: { isMaster: true } },
    });

    for (const route of expectedRoutes) {
      assert.equal(harness.nav.linksByRouteId(route.id).length, 1);
      assertNavigationLinkMatchesRoute(
        requiredLink(harness.nav, route.id),
        route,
      );
    }
    for (const group of new Set(
      expectedRoutes.map((route) => route.navigationGroup),
    )) {
      assert.equal(harness.nav.groupLabels(group).length, 1);
    }
  });

  it("preserves active state for every dynamically included master route", async () => {
    for (const route of listNavigableMasterRoutes()) {
      const harness = createHarness(renderShell(route.path, false));

      await executeProfileScript(harness, {
        ok: true,
        body: { user: { isMaster: true } },
      });

      assert.equal(
        requiredLink(harness.nav, route.id).getAttribute("aria-current"),
        "page",
      );
    }
  });

  it("keeps the explicit financial-index icon and accessible label contract", async () => {
    const financialIndexes = listNavigableMasterRoutes().find(
      (route) => route.id === "adminFinancialIndexes",
    );
    assert.ok(
      financialIndexes,
      "Expected adminFinancialIndexes in the central route catalog",
    );

    const harness = createHarness(renderShell("/dashboard", false));
    await executeProfileScript(harness, {
      ok: true,
      body: { user: { isMaster: true } },
    });

    const link = requiredLink(harness.nav, financialIndexes.id);
    assert.match(link.innerHTML, /<svg[^>]*aria-hidden="true"/);
    assert.match(link.innerHTML, /Admin - \u00cdndices financeiros/);
    assert.equal(link.title, financialIndexes.description);
  });
});

interface ProfileResult {
  ok?: boolean;
  body?: unknown;
  throws?: boolean;
}

interface Harness {
  document: FakeDocument;
  nav: FakeNavigation;
  profileScript: string;
  userName: FakeElement;
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  className = "";
  href = "";
  id = "";
  innerHTML = "";
  textContent = "";
  title = "";

  constructor(readonly tagName: string) {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === "class") this.className = value;
    if (name === "href") this.href = value;
    if (name === "id") this.id = value;
    if (name === "title") this.title = value;
    if (name.startsWith("data-")) this.dataset[toDatasetKey(name)] = value;
  }

  getAttribute(name: string): string {
    if (name === "class") return this.className;
    if (name === "href") return this.href;
    if (name === "id") return this.id;
    if (name === "title") return this.title;
    return this.attributes.get(name) ?? "";
  }
}

class FakeNavigation extends FakeElement {
  private readonly children: FakeElement[];

  constructor(children: FakeElement[]) {
    super("nav");
    this.children = children;
  }

  insertBefore(element: FakeElement, reference: FakeElement | null): void {
    const referenceIndex = reference ? this.children.indexOf(reference) : -1;
    if (referenceIndex < 0) this.children.push(element);
    else this.children.splice(referenceIndex, 0, element);
  }

  querySelector(selector: string): FakeElement | null {
    const routeMatch = /^\[data-nav-route-id="([^"]+)"\]$/.exec(selector);
    if (routeMatch) return this.linksByRouteId(routeMatch[1] ?? "")[0] ?? null;

    const groupMatch = /^\[data-nav-group-label="([^"]+)"\]$/.exec(selector);
    if (groupMatch) return this.groupLabels(groupMatch[1] ?? "")[0] ?? null;

    if (selector === "[data-nav-more]") {
      return (
        this.children.find((element) => "navMore" in element.dataset) ?? null
      );
    }

    return null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector === 'a[data-nav-priority="secondary"][id]') {
      return this.links().filter(
        (link) =>
          link.dataset.navPriority === "secondary" && link.id.length > 0,
      );
    }
    return [];
  }

  links(): FakeElement[] {
    return this.children.filter((element) => element.tagName === "a");
  }

  linksByRouteId(routeId: string): FakeElement[] {
    return this.links().filter((link) => link.dataset.navRouteId === routeId);
  }

  groupLabels(group: string): FakeElement[] {
    return this.children.filter(
      (element) => element.dataset.navGroupLabel === group,
    );
  }
}

class FakeDocument {
  constructor(
    private readonly nav: FakeNavigation,
    private readonly userName: FakeElement,
  ) {}

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }

  querySelector(selector: string): FakeElement | null {
    if (selector === "[data-current-user-name]") return this.userName;
    if (selector === 'nav[aria-label="Menu principal"]') return this.nav;
    return null;
  }
}

function listNavigableMasterRoutes(): ShellRoute[] {
  return listNavigablePrivateShellRoutes({ includeMaster: true }).filter(
    (route) => route.requiresMaster === true,
  );
}

function assertNavigationLinkMatchesRoute(
  link: FakeElement,
  route: ShellRoute,
): void {
  const priority = isPrimaryMobileRoute(route) ? "primary" : "secondary";

  assert.equal(link.href, route.path);
  assert.equal(link.dataset.navRouteId, route.id);
  assert.equal(link.dataset.navGroup, route.navigationGroup);
  assert.equal(link.dataset.navPriority, priority);
  assert.equal(link.title, route.description);
  assert.equal(
    link.id,
    priority === "secondary" ? `nav-secondary-${route.id}` : "",
  );
  assert.match(link.innerHTML, /<svg[^>]*aria-hidden="true"/);
  assert.ok(link.innerHTML.includes(route.label));
}

function renderShell(
  activePathname: string,
  showAdminNavigation: boolean,
): string {
  return renderAuthenticatedShellDocument({
    activePathname,
    content: "<section>Content</section>",
    currentLabel: "Runtime navigation test",
    showAdminNavigation,
    styles: "",
  });
}

function createHarness(html: string): Harness {
  const navMatch =
    /<nav aria-label="Menu principal"[^>]*>([\s\S]*?)<\/nav>/.exec(html);
  assert.ok(navMatch, "Expected rendered main navigation");

  const nav = new FakeNavigation(parseNavigationChildren(navMatch[1] ?? ""));
  const userName = new FakeElement("span");
  userName.textContent = "User";

  return {
    document: new FakeDocument(nav, userName),
    nav,
    profileScript: extractProfileScript(html),
    userName,
  };
}

async function executeProfileScript(
  harness: Harness,
  result: ProfileResult,
): Promise<void> {
  const context = {
    document: harness.document,
    fetch: async (): Promise<{ ok: boolean; json(): Promise<unknown> }> => {
      if (result.throws) throw new Error("Simulated /api/me failure");
      return {
        ok: result.ok === true,
        json: async () => result.body ?? {},
      };
    },
  };

  await Promise.resolve(vm.runInNewContext(harness.profileScript, context));
}

function parseNavigationChildren(html: string): FakeElement[] {
  return Array.from(
    html.matchAll(/<(span|a|button)\b([^>]*)>([\s\S]*?)<\/\1>/g),
  ).map((match) => {
    const element = new FakeElement(match[1] ?? "unknown");
    applyAttributes(element, match[2] ?? "");
    element.innerHTML = match[3] ?? "";
    element.textContent = element.innerHTML.replace(/<[^>]+>/g, "").trim();
    return element;
  });
}

function applyAttributes(element: FakeElement, attributes: string): void {
  for (const match of attributes.matchAll(/([:\w-]+)(?:="([^"]*)")?/g)) {
    const name = match[1];
    if (!name) continue;
    element.setAttribute(name, match[2] ?? "");
  }
}

function extractProfileScript(html: string): string {
  const scripts = Array.from(
    html.matchAll(/<script>([\s\S]*?)<\/script>/g),
  ).map((match) => match[1] ?? "");
  const profileScript = scripts.find((script) =>
    script.includes("const masterRoutes"),
  );
  assert.ok(profileScript, "Expected current-user navigation script");
  return profileScript;
}

function requiredLink(nav: FakeNavigation, routeId: string): FakeElement {
  const link = nav.linksByRouteId(routeId)[0];
  assert.ok(link, `Expected navigation link for ${routeId}`);
  return link;
}

function requiredToggle(nav: FakeNavigation): FakeElement {
  const toggle = nav.querySelector("[data-nav-more]");
  assert.ok(toggle, "Expected More/Less toggle");
  return toggle;
}

function toDatasetKey(attributeName: string): string {
  return attributeName
    .slice("data-".length)
    .replace(/-([a-z])/g, (_match, character: string) =>
      character.toUpperCase(),
    );
}
