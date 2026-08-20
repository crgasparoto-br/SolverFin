import { once } from "node:events";
import { existsSync } from "node:fs";
import { request } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDist = path.join(repoRoot, "apps", "web", "dist");

const requiredModules = [
  "app-shell/routes.js",
  "dev-server.js",
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
const sharedStylesModule = await importCompiled("dev-server/shared-styles.js");
const statementModule = await importCompiled("dev-server/statement-presentation.js");
const contractModule = await importCompiled("dev-server/ssr-style-contract.js");

const {
  removeStyleBlockByMarker,
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

if (typeof webModule.createSolverFinWebServer !== "function") {
  violations.push(
    "[SolverFin SSR style contract] route=all provider=runtime-server module=apps/web/dist/dev-server.js: createSolverFinWebServer() is unavailable",
  );
  fail(violations);
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => fixtureApiResponse(input);

const server = webModule.createSolverFinWebServer();
const renderedDocuments = new Map();

try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  if (!address || typeof address === "string") {
    violations.push(
      "[SolverFin SSR style contract] route=all provider=runtime-server module=apps/web/dist/dev-server.js: server did not expose a TCP address",
    );
  } else {
    for (const contract of solverFinSsrStyleContracts) {
      try {
        const response = await requestRenderedRoute(
          address.port,
          representativePath(contract.path),
          contract.shell === "authenticated",
        );

        if (response.statusCode !== 200) {
          violations.push(
            `[SolverFin SSR style contract] route=${contract.path} provider=runtime-dispatch module=${contract.moduleFileName}: actual SSR route returned status ${response.statusCode}${response.location ? ` and location ${response.location}` : ""}`,
          );
          continue;
        }

        renderedDocuments.set(contract.routeId, response.body);
        violations.push(
          ...validateRenderedSsrStyleDocument({ contract, html: response.body, providers }).map(
            (violation) => `${violation} [actual HTTP renderer]`,
          ),
        );
      } catch (error) {
        violations.push(
          `[SolverFin SSR style contract] route=${contract.path} provider=runtime-server module=${contract.moduleFileName}: HTTP renderer failed (${formatError(
            error,
          )})`,
        );
      }
    }
  }
} finally {
  if (server.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
  globalThis.fetch = originalFetch;
}

runNegativeControls({
  providers,
  renderedDocuments,
  solverFinSsrStyleContracts,
  validateRenderedSsrStyleDocument,
  violations,
});

if (violations.length > 0) fail(violations);

console.log(
  `[SolverFin SSR style contract] validated ${solverFinSsrStyleContracts.length} available routes through the actual HTTP server, representative normal-state HTML, all registered providers, runtime post-processing and negative controls`,
);

function representativePath(pathname) {
  if (pathname === "/lancamentos" || pathname === "/cartoes" || pathname === "/relatorios") {
    return `${pathname}?month=2026-07`;
  }
  return pathname;
}

function requestRenderedRoute(port, requestPath, authenticated) {
  return new Promise((resolve, reject) => {
    const headers = authenticated
      ? { cookie: "sf_session_token=ssr-style-fixture-token" }
      : undefined;
    const clientRequest = request(
      {
        host: "127.0.0.1",
        port,
        path: requestPath,
        method: "GET",
        headers,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            location: response.headers.location,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    clientRequest.on("error", reject);
    clientRequest.end();
  });
}

function fixtureApiResponse(input) {
  const requestUrl =
    typeof input === "string" || input instanceof URL ? String(input) : String(input.url);
  const { pathname } = new URL(requestUrl);
  const payloads = new Map([
    [
      "/api/financial-summary",
      {
        currencyBlocks: [],
        recentItems: [],
      },
    ],
    [
      "/api/transactions",
      {
        transactions: [
          {
            id: "ssr-style-remuneration-transaction",
            description: "Remuneração CDI fictícia",
            kind: "income",
            status: "posted",
            source: "account_remuneration",
            amountMinor: 123,
            currency: "BRL",
            occurredOn: "2026-07-16",
            plannedOn: "2026-07-16",
            effectiveOn: "2026-07-16",
            accountId: "ssr-style-account",
            categoryId: "ssr-style-income-category",
            accountRemuneration: {
              indexKind: "cdi",
              competenceOn: "2026-07-15",
              processedOn: "2026-07-16T00:00:00.000Z",
              balanceBaseMinor: 100000,
              dailyRatePercent: 0.05,
              remunerationPercent: 100,
              appliedDailyRatePercent: 0.05,
              originalAmountMinor: 123,
              manuallyAdjusted: false,
            },
          },
        ],
      },
    ],
    ["/api/transaction-groups", { groups: [] }],
    ["/api/bank-message-inbox", { messages: [] }],
    ["/api/ai-review-queue", { suggestions: [] }],
    ["/api/invoices", { invoices: [] }],
    [
      "/api/accounts",
      {
        accounts: [
          {
            id: "ssr-style-account",
            name: "Conta fictícia do contrato SSR",
            kind: "checking",
            status: "active",
            openingBalanceMinor: 100000,
          },
        ],
      },
    ],
    [
      "/api/categories",
      {
        categories: [
          {
            id: "ssr-style-income-category",
            name: "Rendimentos fictícios",
            kind: "income",
            status: "active",
          },
        ],
      },
    ],
    ["/api/budgets", { budgets: [] }],
    ["/api/cards", { cards: [] }],
    ["/api/credit-card-accounts", { creditCardAccounts: [] }],
    ["/api/recurrences", { recurrences: [] }],
    ["/api/installments", { installments: [] }],
    ["/api/account-remuneration/configurations", { configurations: [] }],
    ["/api/financial-profiles", { profiles: [] }],
    ["/api/automation-rules", { rules: [] }],
    [
      "/api/admin/institutions",
      {
        institutions: [],
        summary: { total: 0, active: 0, withLogo: 0, usingFallback: 0, updatedAt: null },
        pagination: { page: 1, pageSize: 25, total: 0 },
      },
    ],
    [
      "/api/admin/financial-indexes/status",
      {
        status: {
          latestCdiRate: null,
          latestImport: null,
          latestProcessing: null,
          activeConfigurations: 0,
          pendingCompetences: 0,
          configurationsWithoutRates: 0,
          pendingConfigurations: 0,
        },
      },
    ],
  ]);
  const body = payloads.get(pathname);

  return new Response(
    JSON.stringify(
      body ?? {
        error: {
          code: "SSR_STYLE_FIXTURE",
          message: `Fixture SSR ausente para ${pathname}.`,
        },
      },
    ),
    {
      status: body ? 200 : 503,
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );
}

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
  solverFinSsrStyleContracts: contracts,
  validateRenderedSsrStyleDocument: validateDocument,
  violations: target,
}) {
  for (const contract of contracts) {
    const html = documents.get(contract.routeId);
    if (!html) continue;

    for (const fragment of contract.representativeHtmlFragments) {
      expectViolation(
        validateDocument({
          contract,
          html: removeAllOccurrences(html, fragment),
          providers: providerCss,
        }),
        "provider=representative-html",
        `representative HTML ${contract.path} ${fragment}`,
        target,
      );
    }

    for (const provider of contract.registeredStyleProviders) {
      for (const fragment of provider.requiredCssFragments ?? []) {
        expectViolation(
          validateDocument({
            contract,
            html: removeStyleProviderFromDocument(html, fragment),
            providers: providerCss,
          }),
          `provider=${provider.providerId}`,
          `CSS provider ${provider.providerId} on ${contract.path}`,
          target,
        );
      }

      for (const marker of provider.requiredStyleBlockMarkers ?? []) {
        expectViolation(
          validateDocument({
            contract,
            html: removeStyleBlockByMarker(html, marker),
            providers: providerCss,
          }),
          `provider=${provider.providerId}`,
          `style block provider ${provider.providerId} on ${contract.path}`,
          target,
        );

        expectViolation(
          validateDocument({
            contract,
            html: emptyStyleBlockByMarker(html, marker),
            providers: providerCss,
          }),
          `provider=${provider.providerId}`,
          `empty style block provider ${provider.providerId} on ${contract.path}`,
          target,
        );
      }
    }
  }

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

    const sharedOnlyContract = {
      ...dashboardContract,
      pageStyleMode: "shared-only",
      registeredStyleProviders: dashboardContract.registeredStyleProviders.filter(
        (provider) => provider.kind !== "page",
      ),
    };
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

    const withoutNavigation = removeStyleBlockContaining(dashboardHtml, ".sidebar > nav");
    expectViolation(
      validateDocument({
        contract: dashboardContract,
        html: withoutNavigation,
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
      "shared dialog provider disconnection",
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

  for (const contract of contracts.filter(
    (candidate) => candidate.conditionalHeadProviders.length > 0,
  )) {
    const html = documents.get(contract.routeId);
    if (!html) continue;

    for (const conditional of contract.conditionalHeadProviders) {
      expectViolation(
        validateDocument({
          contract,
          html: removeStyleProviderFromDocument(html, providerCss.statementPresentation),
          providers: providerCss,
        }),
        `provider=${conditional.providerId}`,
        `conditional style disconnection on ${contract.path}`,
        target,
      );

      expectViolation(
        validateDocument({
          contract,
          html: removeAllOccurrences(html, conditional.triggerHtmlFragment),
          providers: providerCss,
        }),
        "representative renderer did not activate conditional provider trigger",
        `conditional trigger missing on ${contract.path}`,
        target,
      );
    }
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

function removeAllOccurrences(value, fragment) {
  return fragment.length === 0 ? value : value.split(fragment).join("");
}

function emptyStyleBlockByMarker(html, marker) {
  return html.replace(/<style\b([^>]*)>[\s\S]*?<\/style>/gi, (styleBlock, attributes) => {
    if (!String(attributes).includes(marker)) return styleBlock;
    return `<style${attributes}>   </style>`;
  });
}

function removeStyleBlockContaining(html, cssFragment) {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (styleBlock) =>
    styleBlock.includes(cssFragment) ? "" : styleBlock,
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
