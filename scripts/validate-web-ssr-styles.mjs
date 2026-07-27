import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDist = path.join(repoRoot, "apps", "web", "dist");

const requiredModules = [
  "app-shell/routes.js",
  "dev-server.js",
  "dev-server/shell.js",
  "dev-server/shared-styles.js",
  "dev-server/statement-presentation.js",
  "dev-server/ssr-style-contract.js",
];

const missingModules = requiredModules.filter(
  (modulePath) => !existsSync(path.join(webDist, modulePath)),
);
if (missingModules.length > 0) {
  fail([
    `[SolverFin SSR style contract] route=all provider=build module=apps/web/dist: compiled modules are missing (${missingModules.join(
      ", ",
    )}); run the official web build command`,
  ]);
}

const cacheKey = `ssr-style-contract=${Date.now()}`;
const importCompiled = async (modulePath) =>
  import(`${pathToFileURL(path.join(webDist, modulePath)).href}?${cacheKey}`);

const routesModule = await importCompiled("app-shell/routes.js");
const webModule = await importCompiled("dev-server.js");
const shellModule = await importCompiled("dev-server/shell.js");
const sharedStylesModule = await importCompiled("dev-server/shared-styles.js");
const statementModule = await importCompiled("dev-server/statement-presentation.js");
const contractModule = await importCompiled("dev-server/ssr-style-contract.js");

const {
  removeStyleProviderFromDocument,
  replaceHeadStyleCss,
  solverFinSsrStyleContracts,
  validateRenderedSsrStyleDocument,
  validateSsrStyleContractParity,
} = contractModule;

const providers = {
  sharedShell: sharedStylesModule.sharedShellStyles(),
  sharedDialog: sharedStylesModule.sharedDialogStyles(),
  statementPresentation: statementModule.statementPresentationStyles(),
};

const violations = [
  ...validateSsrStyleContractParity(routesModule.solverFinShellRoutes, solverFinSsrStyleContracts),
];

validateProviderOutputs(providers, violations);

const renderers = new Map([
  ["signIn", () => webModule.renderLoginPage()],
  ["dashboard", () => webModule.renderDashboardPage("ssr-style-fixture-token")],
  [
    "transactions",
    () =>
      webModule.renderTransactionsPage(
        "ssr-style-fixture-token",
        new URL("http://solverfin.test/lancamentos?month=2026-07"),
      ),
  ],
  [
    "cards",
    () =>
      webModule.renderCardsPage(
        "ssr-style-fixture-token",
        new URL("http://solverfin.test/cartoes?month=2026-07"),
      ),
  ],
  ["accountsCards", () => webModule.renderAccountsCardsPage("ssr-style-fixture-token")],
  ["accountRemuneration", () => webModule.renderAccountRemunerationPage("ssr-style-fixture-token")],
  ["categories", () => webModule.renderCategoriesPage("ssr-style-fixture-token")],
  ["budgets", () => webModule.renderBudgetsPage("ssr-style-fixture-token")],
  ["inbox", () => webModule.renderInboxPage("ssr-style-fixture-token")],
  [
    "reports",
    () =>
      webModule.renderReportsPage(
        "ssr-style-fixture-token",
        new URL("http://solverfin.test/relatorios?month=2026-07"),
      ),
  ],
  ["settings", () => webModule.renderSettingsPage("ssr-style-fixture-token")],
  [
    "adminInstitutions",
    () =>
      webModule.renderAdminInstitutionsPage(
        "ssr-style-fixture-token",
        new URL("http://solverfin.test/admin/instituicoes"),
      ),
  ],
  [
    "adminFinancialIndexes",
    () => webModule.renderAdminFinancialIndexesPage("ssr-style-fixture-token"),
  ],
]);

const rendererIds = [...renderers.keys()].sort();
const contractIds = solverFinSsrStyleContracts.map((contract) => contract.routeId).sort();
if (JSON.stringify(rendererIds) !== JSON.stringify(contractIds)) {
  violations.push(
    `[SolverFin SSR style contract] route=all provider=renderer-registry module=scripts/validate-web-ssr-styles.mjs: renderer registry differs from the canonical style contract (renderers=${rendererIds.join(
      ",",
    )}; contracts=${contractIds.join(",")})`,
  );
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async () =>
  new Response(
    JSON.stringify({
      error: {
        code: "SSR_STYLE_FIXTURE",
        message: "Fixture SSR sem dependencia de API.",
      },
    }),
    {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );

const renderedDocuments = new Map();
try {
  for (const contract of solverFinSsrStyleContracts) {
    const renderer = renderers.get(contract.routeId);
    if (!renderer) continue;

    try {
      const html = await renderer();
      renderedDocuments.set(contract.routeId, html);
      violations.push(
        ...validateRenderedSsrStyleDocument({ contract, html, providers }).map(
          (violation) => `${violation} [actual renderer]`,
        ),
      );
    } catch (error) {
      violations.push(
        `[SolverFin SSR style contract] route=${contract.path} provider=renderer module=${contract.moduleFileName}: renderer failed (${formatError(
          error,
        )})`,
      );
    }
  }
} finally {
  globalThis.fetch = originalFetch;
}

runNegativeControls({
  providers,
  renderedDocuments,
  shellModule,
  solverFinSsrStyleContracts,
  validateRenderedSsrStyleDocument,
  violations,
});

if (violations.length > 0) fail(violations);

console.log(
  `[SolverFin SSR style contract] validated ${solverFinSsrStyleContracts.length} available routes, all registered providers, actual SSR HTML and negative controls`,
);

function validateProviderOutputs(providerCss, target) {
  for (const [providerName, css] of Object.entries(providerCss)) {
    if (typeof css !== "string" || css.trim().length === 0) {
      target.push(
        `[SolverFin SSR style contract] route=all provider=${providerName} module=provider: provider returned empty CSS`,
      );
    }
  }
}

function runNegativeControls({
  providers: providerCss,
  renderedDocuments: documents,
  shellModule: shell,
  solverFinSsrStyleContracts: contracts,
  validateRenderedSsrStyleDocument: validateDocument,
  violations: target,
}) {
  const dashboardContract = contracts.find((contract) => contract.routeId === "dashboard");
  const dashboardHtml = documents.get("dashboard");
  if (dashboardContract && dashboardHtml) {
    expectViolation(
      validateDocument({
        contract: dashboardContract,
        html: removeStyleProviderFromDocument(dashboardHtml, providerCss.sharedShell),
        providers: providerCss,
      }),
      "provider=shared-shell",
      "shared style disconnection",
      target,
    );

    const sharedOnlyContract = { ...dashboardContract, pageStyleMode: "shared-only" };
    const sharedOnlyHtml = replaceHeadStyleCss(dashboardHtml, providerCss.sharedShell);
    const sharedOnlyViolations = validateDocument({
      contract: sharedOnlyContract,
      html: sharedOnlyHtml,
      providers: providerCss,
    });
    if (sharedOnlyViolations.length > 0) {
      target.push(
        `[SolverFin SSR style contract] route=${sharedOnlyContract.path} provider=shared-only module=${sharedOnlyContract.moduleFileName}: explicit shared-only route was rejected (${sharedOnlyViolations.join(
          " | ",
        )})`,
      );
    }

    expectViolation(
      validateDocument({
        contract: dashboardContract,
        html: replaceHeadStyleCss(dashboardHtml, providerCss.sharedShell),
        providers: providerCss,
      }),
      `provider=page:${dashboardContract.routeId}`,
      "page-specific empty CSS",
      target,
    );

    const withoutBodyStyles = dashboardHtml.replace(
      /<body\b([^>]*)>[\s\S]*?<style\b[^>]*>[\s\S]*?<\/style>/i,
      "<body$1>",
    );
    expectViolation(
      validateDocument({
        contract: dashboardContract,
        html: withoutBodyStyles,
        providers: providerCss,
      }),
      "provider=authenticated-shell-navigation",
      "shell navigation disconnection",
      target,
    );
  }

  const dialogContract = contracts.find((contract) =>
    contract.requiredHeadProviders.includes("shared-dialog"),
  );
  const dialogHtml = dialogContract ? documents.get(dialogContract.routeId) : undefined;
  if (dialogContract && dialogHtml) {
    expectViolation(
      validateDocument({
        contract: dialogContract,
        html: removeStyleProviderFromDocument(dialogHtml, providerCss.sharedDialog),
        providers: providerCss,
      }),
      "provider=shared-dialog",
      "auxiliary style disconnection",
      target,
    );
  }

  const loginContract = contracts.find((contract) => contract.routeId === "signIn");
  const loginHtml = documents.get("signIn");
  if (loginContract && loginHtml) {
    expectViolation(
      validateDocument({
        contract: loginContract,
        html: replaceHeadStyleCss(loginHtml, ""),
        providers: providerCss,
      }),
      "provider=login-public",
      "empty login CSS",
      target,
    );
  }

  const conditionalContract = contracts.find(
    (contract) => contract.conditionalHeadProviders.length > 0 && contract.representativeContent,
  );
  if (conditionalContract) {
    const fixtureHtml = shell.renderAuthenticatedShellDocument({
      activePathname: conditionalContract.path,
      content: conditionalContract.representativeContent,
      currentLabel: "Contrato SSR",
      styles: `${providerCss.sharedShell}\n.ssr-style-contract-fixture { display: block; }`,
    });
    const fixtureViolations = validateDocument({
      contract: conditionalContract,
      html: fixtureHtml,
      providers: providerCss,
      requireConditionalProviders: true,
    });
    if (fixtureViolations.length > 0) {
      target.push(...fixtureViolations.map((violation) => `${violation} [conditional fixture]`));
    }

    expectViolation(
      validateDocument({
        contract: conditionalContract,
        html: removeStyleProviderFromDocument(fixtureHtml, providerCss.statementPresentation),
        providers: providerCss,
        requireConditionalProviders: true,
      }),
      "provider=statement-presentation",
      "conditional style disconnection",
      target,
    );
  }

  const missingContractRoutes = [
    ...routesModule.solverFinShellRoutes,
    {
      id: "futureAvailableRoute",
      path: "/future-available-route",
      label: "Future",
      description: "Fixture",
      navigationGroup: "main",
      requiresAuthentication: true,
      requiresFinancialProfile: true,
      status: "available",
    },
  ];
  expectViolation(
    validateSsrStyleContractParity(missingContractRoutes, contracts),
    "available route has no style contract",
    "canonical route without contract",
    target,
  );
}

function expectViolation(actualViolations, expectedFragment, controlName, target) {
  if (!actualViolations.some((violation) => violation.includes(expectedFragment))) {
    target.push(
      `[SolverFin SSR style contract] route=negative-control provider=${controlName} module=scripts/validate-web-ssr-styles.mjs: validator did not reject the intentionally broken composition; observed=${actualViolations.join(
        " | ",
      )}`,
    );
  }
}

function formatError(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function fail(items) {
  console.error(`[SolverFin SSR style contract] failed with ${items.length} violation(s):`);
  for (const item of items) console.error(`- ${item}`);
  process.exit(1);
}
