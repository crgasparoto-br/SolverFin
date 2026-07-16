import assert from "node:assert/strict";
import { describe, it } from "node:test";
import vm from "node:vm";

import { renderAuthenticatedShellDocument } from "./shell.js";

const MASTER_ROUTE_IDS = [
  "adminInstitutions",
  "adminFinancialIndexes",
] as const;

describe("issue #480 navigation runtime", () => {
  it("executes the profile script and adds every master route without duplicates", async () => {
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
          MASTER_ROUTE_IDS.some(
            (routeId) => routeId === link.dataset.navRouteId,
          ),
        )
        .map((link) => link.dataset.navRouteId),
      MASTER_ROUTE_IDS,
    );
    assert.equal(harness.nav.groupLabels("admin").length, 1);

    const institutions = requiredLink(harness.nav, "adminInstitutions");
    const indexes = requiredLink(harness.nav, "adminFinancialIndexes");
    assert.equal(institutions.href, "/admin/instituicoes");
    assert.equal(indexes.href, "/admin/indices-financeiros");
    assert.equal(institutions.dataset.navGroup, "admin");
    assert.equal(indexes.dataset.navGroup, "admin");
    assert.equal(institutions.dataset.navPriority, "secondary");
    assert.equal(indexes.dataset.navPriority, "secondary");
    assert.match(indexes.innerHTML, /<svg[^>]*aria-hidden="true"/);
    assert.match(indexes.innerHTML, /Admin - \u00cdndices financeiros/);

    const secondaryIds = harness.nav
      .querySelectorAll('a[data-nav-priority="secondary"][id]')
      .map((link) => link.id);
    assert.deepEqual(
      requiredToggle(harness.nav).getAttribute("aria-controls").split(/\s+/),
      secondaryIds,
    );

    await executeProfileScript(harness, {
      ok: true,
      body: { user: { isMaster: true } },
    });

    for (const routeId of MASTER_ROUTE_IDS) {
      assert.equal(harness.nav.linksByRouteId(routeId).length, 1);
    }
    assert.equal(harness.nav.groupLabels("admin").length, 1);
  });

  it("keeps the common navigation for regular users and profile failures", async () => {
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
      for (const routeId of MASTER_ROUTE_IDS) {
        assert.equal(harness.nav.linksByRouteId(routeId).length, 0);
      }
      assert.equal(harness.nav.groupLabels("admin").length, 0);
    }
  });

  it("does not duplicate routes already rendered by the server", async () => {
    const harness = createHarness(renderShell("/admin/instituicoes", true));

    await executeProfileScript(harness, {
      ok: true,
      body: { user: { isMaster: true } },
    });

    for (const routeId of MASTER_ROUTE_IDS) {
      assert.equal(harness.nav.linksByRouteId(routeId).length, 1);
    }
    assert.equal(harness.nav.groupLabels("admin").length, 1);
  });

  it("preserves active state for a dynamically included master route", async () => {
    const harness = createHarness(
      renderShell("/admin/indices-financeiros", false),
    );

    await executeProfileScript(harness, {
      ok: true,
      body: { user: { isMaster: true } },
    });

    assert.equal(
      requiredLink(harness.nav, "adminFinancialIndexes").getAttribute(
        "aria-current",
      ),
      "page",
    );
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
