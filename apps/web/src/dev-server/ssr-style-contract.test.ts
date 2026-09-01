import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { solverFinShellRoutes } from "../app-shell/routes.js";
import {
  removeStyleBlockByMarker,
  removeStyleProviderFromDocument,
  solverFinSsrStyleContracts,
  validateRenderedSsrStyleDocument,
  validateSsrStyleContractParity,
  type SsrRegisteredStyleProviderRequirement,
  type SsrStyleRouteContract,
} from "./ssr-style-contract.js";

const providers = {
  sharedShell: ":root { --primary: #0f3d4c; }",
  sharedDialog: "dialog { display: grid; }",
  statementPresentation: ".statement-layout .summary-totals { grid-template-columns: 1fr; }",
};

const navigationCss = `
  @media (min-width: 761px) {
    .sidebar > .brand, .sidebar > .logout { flex: 0 0 auto; }
    .sidebar > nav { overflow-y: auto; scrollbar-gutter: stable; }
  }
  @media (max-width: 760px) {
    .sidebar > nav { overflow-y: visible; }
  }
`;

const dashboardPageCss = ".dashboard-heading { display: grid; }";
const transactionsPageCss = ".statement-layout { display: grid; }";
const recurrenceAuxiliaryCss = ".recurrence-indicator{display:inline-flex;}";

describe("SSR style contract", () => {
  it("has exact parity with every available canonical route, including public, hidden and master routes", () => {
    assert.deepEqual(
      validateSsrStyleContractParity(solverFinShellRoutes, solverFinSsrStyleContracts),
      [],
    );

    const coveredPaths = new Set(solverFinSsrStyleContracts.map((contract) => contract.path));
    assert.equal(coveredPaths.has("/login"), true);
    assert.equal(coveredPaths.has("/remuneracao-contas"), true);
    assert.equal(coveredPaths.has("/admin/instituicoes"), true);
    assert.equal(coveredPaths.has("/admin/indices-financeiros"), true);
  });

  it("reports every available route added without a contract", () => {
    const routesWithMissingContract = [
      ...solverFinShellRoutes,
      {
        id: "dashboard",
        path: "/future-route",
        label: "Future",
        description: "Fixture",
        navigationGroup: "main",
        requiresAuthentication: true,
        requiresFinancialProfile: true,
        status: "available",
      },
    ] as const;

    const violations = validateSsrStyleContractParity(
      routesWithMissingContract,
      solverFinSsrStyleContracts,
    );

    assert.equal(violations.length, 1);
    assert.match(violations[0] ?? "", /route=\/future-route/);
    assert.match(violations[0] ?? "", /available route has no style contract/);
  });

  it("accepts a representative normal-state route with its shared and page providers", () => {
    const contract = contractFor("dashboard");
    const html = authenticatedDocument(
      `${providers.sharedShell}${dashboardPageCss}`,
      '<section class="dashboard-heading">Resumo</section>',
    );

    assert.deepEqual(validateRenderedSsrStyleDocument({ contract, html, providers }), []);
  });

  it("rejects a generic error document that retains page CSS but loses normal route HTML", () => {
    const contract = contractFor("dashboard");
    const html = authenticatedDocument(
      `${providers.sharedShell}${dashboardPageCss}`,
      '<section class="panel"><p class="error">Falha</p></section>',
    );

    const violations = validateRenderedSsrStyleDocument({ contract, html, providers });

    assert.ok(violations.some((violation) => violation.includes("provider=representative-html")));
  });

  it("rejects empty shared, page-specific, shell and conditional providers in one pass", () => {
    const base = contractFor("transactions");
    const contract = withProviders(base, ["page:transactions", "aux:recurrences-section"]);
    const html = authenticatedDocument(
      `${providers.sharedShell}${providers.statementPresentation}${transactionsPageCss}${recurrenceAuxiliaryCss}`,
      '<section class="statement-layout">Extrato fictício</section>',
    );
    const brokenHtml = removeStyleProviderFromDocument(
      removeStyleProviderFromDocument(
        removeStyleProviderFromDocument(html, providers.sharedShell),
        providers.statementPresentation,
      ),
      ".statement-layout {",
    ).replace(navigationCss, "");

    const violations = validateRenderedSsrStyleDocument({ contract, html: brokenHtml, providers });

    assert.ok(violations.some((violation) => violation.includes("provider=shared-shell")));
    assert.ok(
      violations.some((violation) => violation.includes("provider=statement-presentation")),
    );
    assert.ok(
      violations.some((violation) => violation.includes("provider=authenticated-shell-navigation")),
    );
    assert.ok(violations.some((violation) => violation.includes("provider=page:transactions")));
  });

  it("rejects empty public login CSS", () => {
    const violations = validateRenderedSsrStyleDocument({
      contract: contractFor("signIn"),
      html: publicDocument("", '<main class="login-shell">Login</main>'),
      providers,
    });

    assert.ok(violations.some((violation) => violation.includes("provider=login-public")));
  });

  it("rejects a registered auxiliary provider disconnected from final HTML", () => {
    const base = contractFor("transactions");
    const contract = withProviders(base, ["page:transactions", "aux:recurrences-section"]);
    const html = authenticatedDocument(
      `${providers.sharedShell}${providers.statementPresentation}${transactionsPageCss}`,
      '<section class="statement-layout">Extrato fictício</section>',
    );

    const violations = validateRenderedSsrStyleDocument({ contract, html, providers });

    assert.ok(
      violations.some((violation) => violation.includes("provider=aux:recurrences-section")),
    );
  });

  it("rejects missing and empty marker-backed runtime style blocks", () => {
    const base = contractFor("accountsCards");
    const target = providerFor(base, "runtime:accounts-cards-neutral");
    const contract = withProviders(base, ["page:accountsCards", target.providerId]);
    const marker = target.requiredStyleBlockMarkers?.[0] ?? assert.fail("missing marker");
    const html = authenticatedDocument(
      `${providers.sharedShell}.master-toolbar, .master-panel { display: grid; }`,
      '<section data-tab-panel="accounts">Contas</section>',
      [`<style ${marker}>.accounts-cards-tab { display: grid; }</style>`],
    );

    assert.deepEqual(validateRenderedSsrStyleDocument({ contract, html, providers }), []);

    const missingViolations = validateRenderedSsrStyleDocument({
      contract,
      html: removeStyleBlockByMarker(html, marker),
      providers,
    });
    assert.ok(
      missingViolations.some((violation) =>
        violation.includes("provider=runtime:accounts-cards-neutral"),
      ),
    );

    const emptyHtml = html.replace(
      `<style ${marker}>.accounts-cards-tab { display: grid; }</style>`,
      `<style ${marker}> </style>`,
    );
    const emptyViolations = validateRenderedSsrStyleDocument({
      contract,
      html: emptyHtml,
      providers,
    });
    assert.ok(
      emptyViolations.some((violation) =>
        violation.includes("provider=runtime:accounts-cards-neutral"),
      ),
    );
  });

  it("tracks migrated remuneration and residual disclosure styles independently", () => {
    const base = contractFor("transactions");
    const pageProvider = providerFor(base, "page:transactions");
    const disclosureProvider = providerFor(base, "runtime:account-remuneration-disclosure");
    const contract = withProviders(base, [pageProvider.providerId, disclosureProvider.providerId]);
    const pageCssFragments = pageProvider.requiredCssFragments;
    const pageCssFragment = pageCssFragments?.[0] ?? assert.fail("missing page CSS fragment");
    const disclosureMarkers = disclosureProvider.requiredStyleBlockMarkers;
    const disclosureMarker = disclosureMarkers?.[0] ?? assert.fail("missing disclosure marker");

    assert.equal(
      base.registeredStyleProviders.some(
        (provider) => provider.providerId === "runtime:account-remuneration-statement",
      ),
      false,
    );
    assert.equal(pageProvider.moduleFileName, "transactions-page-v2.js");
    assert.equal(
      disclosureProvider.moduleFileName,
      "account-remuneration-disclosure-enhancement.js",
    );
    assert.equal(disclosureMarker, "data-account-remuneration-disclosure-affordance");

    const pageCss = `${pageCssFragment} display: grid; }`;
    const html = authenticatedDocument(
      `${providers.sharedShell}${providers.statementPresentation}${pageCss}`,
      '<section data-statement-archetype="A2" class="statement-layout"><details class="account-remuneration-audit">Memória</details></section>',
      [
        `<style ${disclosureMarker}>.account-remuneration-audit summary { display: inline-flex; }</style>`,
      ],
    );

    assert.deepEqual(validateRenderedSsrStyleDocument({ contract, html, providers }), []);

    const withoutPageStyles = validateRenderedSsrStyleDocument({
      contract,
      html: removeStyleProviderFromDocument(html, pageCss),
      providers,
    });
    assert.ok(
      withoutPageStyles.some((violation) => violation.includes("provider=page:transactions")),
    );
    assert.ok(
      withoutPageStyles.every(
        (violation) => !violation.includes("provider=runtime:account-remuneration-disclosure"),
      ),
    );

    const withoutDisclosure = validateRenderedSsrStyleDocument({
      contract,
      html: removeStyleBlockByMarker(html, disclosureMarker),
      providers,
    });
    assert.ok(
      withoutDisclosure.some((violation) =>
        violation.includes("provider=runtime:account-remuneration-disclosure"),
      ),
    );
    assert.ok(
      withoutDisclosure.every((violation) => !violation.includes("provider=page:transactions")),
    );
  });

  it("rejects removal of the page provider even when an auxiliary provider remains", () => {
    const base = contractFor("transactions");
    const contract = withProviders(base, ["page:transactions", "aux:recurrences-section"]);
    const html = authenticatedDocument(
      `${providers.sharedShell}${providers.statementPresentation}${recurrenceAuxiliaryCss}`,
      '<section class="statement-layout">Extrato fictício</section>',
    );

    const violations = validateRenderedSsrStyleDocument({ contract, html, providers });

    assert.ok(violations.some((violation) => violation.includes("provider=page:transactions")));
    assert.ok(
      violations.every((violation) => !violation.includes("provider=aux:recurrences-section")),
    );
  });

  it("requires the representative renderer to activate each conditional provider", () => {
    const base = contractFor("transactions");
    const contract = withProviders(base, ["page:transactions", "aux:recurrences-section"]);
    const html = authenticatedDocument(
      `${providers.sharedShell}${providers.statementPresentation}${transactionsPageCss}${recurrenceAuxiliaryCss}`,
      "<section>Extrato sem gatilho representativo</section>",
    );

    const violations = validateRenderedSsrStyleDocument({ contract, html, providers });

    assert.ok(
      violations.some((violation) =>
        violation.includes("representative renderer did not activate conditional provider trigger"),
      ),
    );
  });

  it("accepts an explicitly shared-only authenticated route", () => {
    const dashboardContract = contractFor("dashboard");
    const sharedOnlyContract: SsrStyleRouteContract = {
      ...dashboardContract,
      pageStyleMode: "shared-only",
      registeredStyleProviders: dashboardContract.registeredStyleProviders.filter(
        (provider) => provider.kind !== "page",
      ),
    };

    assert.deepEqual(
      validateRenderedSsrStyleDocument({
        contract: sharedOnlyContract,
        html: authenticatedDocument(
          providers.sharedShell,
          '<section class="dashboard-heading">Resumo</section>',
        ),
        providers,
      }),
      [],
    );
  });
});

function contractFor(routeId: SsrStyleRouteContract["routeId"]): SsrStyleRouteContract {
  return (
    solverFinSsrStyleContracts.find((contract) => contract.routeId === routeId) ??
    assert.fail(`Missing contract for ${routeId}`)
  );
}

function providerFor(
  contract: SsrStyleRouteContract,
  providerId: SsrRegisteredStyleProviderRequirement["providerId"],
): SsrRegisteredStyleProviderRequirement {
  return (
    contract.registeredStyleProviders.find((provider) => provider.providerId === providerId) ??
    assert.fail(`Missing provider ${providerId}`)
  );
}

function withProviders(
  contract: SsrStyleRouteContract,
  providerIds: readonly SsrRegisteredStyleProviderRequirement["providerId"][],
): SsrStyleRouteContract {
  return {
    ...contract,
    registeredStyleProviders: contract.registeredStyleProviders.filter((provider) =>
      providerIds.includes(provider.providerId),
    ),
  };
}

function authenticatedDocument(
  headCss: string,
  content: string,
  extraStyles: readonly string[] = [],
): string {
  return `<!doctype html><html><head><style>${headCss}</style>${extraStyles.join("")}</head><body><style>${navigationCss}</style>${content}</body></html>`;
}

function publicDocument(headCss: string, content: string): string {
  return `<!doctype html><html><head><style>${headCss}</style></head><body>${content}</body></html>`;
}
