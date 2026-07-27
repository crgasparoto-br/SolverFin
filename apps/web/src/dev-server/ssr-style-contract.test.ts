import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { solverFinShellRoutes } from "../app-shell/routes.js";
import {
  removeStyleProviderFromDocument,
  solverFinSsrStyleContracts,
  validateRenderedSsrStyleDocument,
  validateSsrStyleContractParity,
  type SsrStyleRouteContract,
} from "./ssr-style-contract.js";

const providers = {
  sharedShell: ":root { --primary: #0f3d4c; }",
  sharedDialog: "dialog { display: grid; }",
  statementPresentation: ".statement-layout { min-width: 0; }",
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

const transactionsPageCss = ".statement-layout { display: grid; }";
const recurrenceAuxiliaryCss = ".recurrence-indicator { display: inline-flex; }";

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

  it("rejects empty shared, page-specific, shell and conditional providers in one pass", () => {
    const contract = contractFor("transactions");
    const html = authenticatedDocument(
      `${providers.sharedShell}${providers.statementPresentation}${transactionsPageCss}${recurrenceAuxiliaryCss}`,
      '<section class="statement-layout">Extrato ficticio</section>',
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
      html: publicDocument(""),
      providers,
    });

    assert.ok(violations.some((violation) => violation.includes("provider=login-public")));
  });

  it("rejects a registered auxiliary provider disconnected from final HTML", () => {
    const contract = contractFor("transactions");
    const html = authenticatedDocument(
      `${providers.sharedShell}${providers.statementPresentation}${transactionsPageCss}`,
      '<section class="statement-layout">Extrato ficticio</section>',
    );

    const violations = validateRenderedSsrStyleDocument({ contract, html, providers });

    assert.ok(
      violations.some((violation) => violation.includes("provider=aux:recurrences-section")),
    );
  });

  it("rejects removal of the page provider even when an auxiliary provider remains", () => {
    const contract = contractFor("transactions");
    const html = authenticatedDocument(
      `${providers.sharedShell}${providers.statementPresentation}${recurrenceAuxiliaryCss}`,
      '<section class="statement-layout">Extrato ficticio</section>',
    );

    const violations = validateRenderedSsrStyleDocument({ contract, html, providers });

    assert.ok(violations.some((violation) => violation.includes("provider=page:transactions")));
    assert.ok(
      violations.every((violation) => !violation.includes("provider=aux:recurrences-section")),
    );
  });

  it("requires the representative renderer to activate each conditional provider", () => {
    const contract = contractFor("transactions");
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
        html: authenticatedDocument(providers.sharedShell, "<section>Resumo</section>"),
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

function authenticatedDocument(headCss: string, content: string): string {
  return `<!doctype html><html><head><style>${headCss}</style></head><body><style>${navigationCss}</style>${content}</body></html>`;
}

function publicDocument(headCss: string): string {
  return `<!doctype html><html><head><style>${headCss}</style></head><body>Login</body></html>`;
}
