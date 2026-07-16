import assert from "node:assert/strict";
import vm from "node:vm";

import { renderAuthenticatedShellDocument } from "./shell.js";

async function main(): Promise<void> {
  const commonHtml = renderShell(false);

  const masterHarness = createHarness(commonHtml);
  await executeProfileScript(masterHarness, {
    ok: true,
    body: {
      user: {
        displayName: "Usuário master",
        email: "master@example.test",
        isMaster: true,
      },
    },
  });

  assert.equal(masterHarness.userName.textContent, "Usuário master");
  assert.equal(masterHarness.nav.writeCount, 1);
  assert.equal(count(masterHarness.nav.innerHTML, 'href="/admin/instituicoes"'), 1);
  assert.equal(count(masterHarness.nav.innerHTML, 'href="/admin/indices-financeiros"'), 1);
  assert.equal(count(masterHarness.nav.innerHTML, 'data-nav-group="admin"'), 1);
  assert.ok(
    masterHarness.nav.innerHTML.indexOf('href="/admin/instituicoes"') <
      masterHarness.nav.innerHTML.indexOf('href="/admin/indices-financeiros"'),
  );
  assert.match(
    masterHarness.nav.innerHTML,
    /href="\/admin\/indices-financeiros"[^>]*>[\s\S]*?<svg[^>]*aria-hidden="true"/,
  );
  assert.match(
    masterHarness.nav.toggle.getAttribute("aria-controls"),
    /nav-secondary-adminInstitutions/,
  );
  assert.match(
    masterHarness.nav.toggle.getAttribute("aria-controls"),
    /nav-secondary-adminFinancialIndexes/,
  );

  await executeProfileScript(masterHarness, {
    ok: true,
    body: { user: { isMaster: true } },
  });
  assert.equal(masterHarness.nav.writeCount, 1);
  assert.equal(count(masterHarness.nav.innerHTML, 'data-nav-group="admin"'), 1);

  const commonUserHarness = createHarness(commonHtml);
  await executeProfileScript(commonUserHarness, {
    ok: true,
    body: { user: { displayName: "Usuário comum", isMaster: false } },
  });
  assert.equal(commonUserHarness.nav.writeCount, 0);
  assert.doesNotMatch(commonUserHarness.nav.innerHTML, /\/admin\/instituicoes/);
  assert.doesNotMatch(commonUserHarness.nav.innerHTML, /\/admin\/indices-financeiros/);

  const unsuccessfulResponseHarness = createHarness(commonHtml);
  await executeProfileScript(unsuccessfulResponseHarness, { ok: false, body: {} });
  assert.equal(unsuccessfulResponseHarness.nav.writeCount, 0);

  const failedRequestHarness = createHarness(commonHtml);
  await executeProfileScript(failedRequestHarness, { throws: true });
  assert.equal(failedRequestHarness.nav.writeCount, 0);

  const serverRenderedMasterHarness = createHarness(renderShell(true));
  await executeProfileScript(serverRenderedMasterHarness, {
    ok: true,
    body: { user: { isMaster: true } },
  });
  assert.equal(serverRenderedMasterHarness.nav.writeCount, 0);
  assert.equal(count(serverRenderedMasterHarness.nav.innerHTML, 'href="/admin/instituicoes"'), 1);
  assert.equal(
    count(serverRenderedMasterHarness.nav.innerHTML, 'href="/admin/indices-financeiros"'),
    1,
  );
}

interface FakeProfileResult {
  ok?: boolean;
  body?: unknown;
  throws?: boolean;
}

interface FakeHarness {
  nav: FakeNav;
  profileScript: string;
  userName: { textContent: string };
}

class FakeClassList {
  private readonly values: Set<string>;

  constructor(initialValues: string[]) {
    this.values = new Set(initialValues.filter(Boolean));
  }

  contains(value: string): boolean {
    return this.values.has(value);
  }

  toggle(value: string, force?: boolean): boolean {
    const shouldAdd = force ?? !this.values.has(value);
    if (shouldAdd) this.values.add(value);
    else this.values.delete(value);
    return shouldAdd;
  }
}

class FakeToggle {
  textContent: string;
  private readonly attributes = new Map<string, string>();

  constructor(html: string) {
    this.textContent = />([^<]*)<\/button>/.exec(html)?.[1] ?? "";
    this.attributes.set("aria-expanded", readAttribute(html, "aria-expanded"));
    this.attributes.set("aria-controls", readAttribute(html, "aria-controls"));
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string {
    return this.attributes.get(name) ?? "";
  }
}

class FakeNav {
  readonly classList: FakeClassList;
  writeCount = 0;
  toggle: FakeToggle;
  private html: string;

  constructor(html: string, className: string) {
    this.html = html;
    this.classList = new FakeClassList(className.split(/\s+/));
    this.toggle = new FakeToggle(findToggleHtml(html));
  }

  get innerHTML(): string {
    return this.html;
  }

  set innerHTML(value: string) {
    this.html = value;
    this.writeCount += 1;
    this.toggle = new FakeToggle(findToggleHtml(value));
  }

  querySelector(selector: string): unknown {
    const idMatch = /^\[id="([^"]+)"\]$/.exec(selector);
    if (idMatch) return this.html.includes(`id="${idMatch[1]}"`) ? {} : null;
    if (selector === "[data-nav-more]") return this.toggle;
    return null;
  }
}

function renderShell(showAdminNavigation: boolean): string {
  return renderAuthenticatedShellDocument({
    activePathname: "/dashboard",
    content: "<section>Conteúdo da página</section>",
    currentLabel: "Dashboard",
    styles: ".test-marker { color: #0f3d4c; }",
    showAdminNavigation,
  });
}

function createHarness(html: string): FakeHarness {
  const navMatch = /<nav aria-label="Menu principal" class="([^"]*)">([\s\S]*?)<\/nav>/.exec(html);
  assert.ok(navMatch, "Expected rendered main navigation");

  return {
    nav: new FakeNav(navMatch[2] ?? "", navMatch[1] ?? ""),
    profileScript: extractProfileScript(html),
    userName: { textContent: "Usuário" },
  };
}

async function executeProfileScript(
  harness: FakeHarness,
  result: FakeProfileResult,
): Promise<void> {
  const context = {
    document: {
      querySelector: (selector: string): unknown => {
        if (selector === "[data-current-user-name]") return harness.userName;
        if (selector === 'nav[aria-label="Menu principal"]') return harness.nav;
        return null;
      },
    },
    fetch: async (): Promise<{ ok: boolean; json(): Promise<unknown> }> => {
      if (result.throws) throw new Error("Falha simulada em /api/me");
      return {
        ok: result.ok === true,
        json: async () => result.body ?? {},
      };
    },
  };

  await Promise.resolve(vm.runInNewContext(harness.profileScript, context));
}

function extractProfileScript(html: string): string {
  const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).map(
    (match) => match[1] ?? "",
  );
  const profileScript = scripts.find((script) => script.includes("const masterNavigationHtml"));

  assert.ok(profileScript, "Expected current-user navigation script");
  return profileScript;
}

function findToggleHtml(html: string): string {
  const match = /<button[^>]*data-nav-more[^>]*>[\s\S]*?<\/button>/.exec(html);
  assert.ok(match, "Expected More/Less toggle");
  return match[0];
}

function readAttribute(html: string, name: string): string {
  return new RegExp(`${name}="([^"]*)"`).exec(html)?.[1] ?? "";
}

function count(value: string, fragment: string): number {
  return value.split(fragment).length - 1;
}

void main();
