import type { ShellRoute, ShellRouteId } from "../app-shell/routes.js";

export const SSR_STYLE_CONTRACT_NAME = "SolverFin SSR style contract";

export type SsrShellKind = "public" | "authenticated";
export type SsrPageStyleMode = "page-specific" | "shared-only";
export type SsrHeadStyleProviderId =
  | "login-public"
  | "shared-shell"
  | "shared-dialog"
  | "statement-presentation";
export type SsrRegisteredStyleProviderId = `page:${ShellRouteId}` | "aux:recurrences-section";

export interface SsrConditionalHeadProviderRequirement {
  providerId: Exclude<SsrHeadStyleProviderId, "login-public" | "shared-shell" | "shared-dialog">;
  triggerHtmlFragment: string;
}

export interface SsrRegisteredStyleProviderRequirement {
  providerId: SsrRegisteredStyleProviderId;
  kind: "page" | "auxiliary";
  moduleFileName: string;
  requiredCssFragments: readonly string[];
}

export interface SsrStyleRouteContract {
  routeId: ShellRouteId;
  path: string;
  shell: SsrShellKind;
  moduleFileName: string;
  pageStyleMode: SsrPageStyleMode;
  requiredHeadProviders: readonly SsrHeadStyleProviderId[];
  conditionalHeadProviders: readonly SsrConditionalHeadProviderRequirement[];
  registeredStyleProviders: readonly SsrRegisteredStyleProviderRequirement[];
}

export interface SsrStyleProviderCss {
  sharedShell: string;
  sharedDialog: string;
  statementPresentation: string;
}

export interface RenderedSsrStyleValidationInput {
  contract: SsrStyleRouteContract;
  html: string;
  providers: SsrStyleProviderCss;
}

const recurrenceAuxiliaryProvider: SsrRegisteredStyleProviderRequirement = {
  providerId: "aux:recurrences-section",
  kind: "auxiliary",
  moduleFileName: "recurrences-section.js",
  requiredCssFragments: [".recurrence-indicator{"],
};

export const solverFinSsrStyleContracts = [
  authenticated("dashboard", "/dashboard", "dashboard-page.js", {
    pageCssFragments: [".dashboard-heading {"],
  }),
  authenticated("transactions", "/lancamentos", "transactions-page.js", {
    pageCssFragments: [".statement-layout {"],
    auxiliaryStyleProviders: [recurrenceAuxiliaryProvider],
    conditionalHeadProviders: [
      {
        providerId: "statement-presentation",
        triggerHtmlFragment: 'class="statement-layout"',
      },
    ],
  }),
  authenticated("cards", "/cartoes", "cards-page.js", {
    pageCssFragments: [".cards-layout {"],
    auxiliaryStyleProviders: [recurrenceAuxiliaryProvider],
  }),
  authenticated("accountsCards", "/contas-cartoes", "accounts-cards-page.js", {
    pageCssFragments: [".master-toolbar, .master-panel {"],
  }),
  authenticated("accountRemuneration", "/remuneracao-contas", "account-remuneration-page.js", {
    pageCssFragments: [".configuration-card {"],
  }),
  authenticated("categories", "/categorias", "categories-page.js", {
    pageCssFragments: [".categories-workspace {"],
  }),
  authenticated("budgets", "/orcamentos", "pages.js", {
    requiredHeadProviders: ["shared-shell", "shared-dialog"],
    pageCssFragments: [".budgets-heading {"],
  }),
  authenticated("inbox", "/inbox", "inbox-page.js", {
    requiredHeadProviders: ["shared-shell", "shared-dialog"],
    pageCssFragments: [".import-layout {"],
  }),
  authenticated("reports", "/relatorios", "reports-page.js", {
    pageCssFragments: [".reports-heading {"],
  }),
  authenticated("settings", "/configuracoes", "settings-page.js", {
    requiredHeadProviders: ["shared-shell", "shared-dialog"],
    pageCssFragments: [".secondary-heading {"],
  }),
  authenticated("adminInstitutions", "/admin/instituicoes", "admin-institutions-page.js", {
    requiredHeadProviders: ["shared-shell", "shared-dialog"],
    pageCssFragments: [".admin-heading {"],
  }),
  authenticated(
    "adminFinancialIndexes",
    "/admin/indices-financeiros",
    "admin-financial-indexes-page.js",
    {
      pageCssFragments: [".operation-grid {"],
    },
  ),
  {
    routeId: "signIn",
    path: "/login",
    shell: "public",
    moduleFileName: "login-page.js",
    pageStyleMode: "page-specific",
    requiredHeadProviders: ["login-public"],
    conditionalHeadProviders: [],
    registeredStyleProviders: [],
  },
] as const satisfies readonly SsrStyleRouteContract[];

export function validateSsrStyleContractParity(
  routes: readonly ShellRoute[],
  contracts: readonly SsrStyleRouteContract[] = solverFinSsrStyleContracts,
): string[] {
  const violations: string[] = [];
  const availableRoutes = routes.filter((route) => route.status === "available");
  const availableByPath = new Map(availableRoutes.map((route) => [route.path, route]));
  const contractByPath = new Map<string, SsrStyleRouteContract>();

  for (const contract of contracts) {
    if (contractByPath.has(contract.path)) {
      violations.push(formatViolation(contract, "coverage", "duplicate route contract"));
      continue;
    }
    contractByPath.set(contract.path, contract);

    const route = availableByPath.get(contract.path);
    if (!route) {
      violations.push(
        formatViolation(contract, "coverage", "contract does not match an available route"),
      );
      continue;
    }
    if (route.id !== contract.routeId) {
      violations.push(
        formatViolation(
          contract,
          "coverage",
          `route id mismatch: expected ${route.id}, received ${contract.routeId}`,
        ),
      );
    }

    const expectedShell: SsrShellKind = route.requiresAuthentication ? "authenticated" : "public";
    if (contract.shell !== expectedShell) {
      violations.push(
        formatViolation(
          contract,
          "coverage",
          `shell mismatch: expected ${expectedShell}, received ${contract.shell}`,
        ),
      );
    }

    validateRegisteredProviderDeclarations(contract, violations);
  }

  for (const route of availableRoutes) {
    if (!contractByPath.has(route.path)) {
      violations.push(
        `[${SSR_STYLE_CONTRACT_NAME}] route=${route.path} provider=coverage module=unknown: available route has no style contract`,
      );
    }
  }

  return violations;
}

export function validateRenderedSsrStyleDocument(input: RenderedSsrStyleValidationInput): string[] {
  const violations: string[] = [];
  const { contract, html, providers } = input;
  const headCss = extractHeadStyleCss(html);
  const bodyStyleBlocks = extractBodyStyleBlocks(html);

  if (headCss.trim().length === 0) {
    violations.push(formatViolation(contract, "head", "final head CSS is empty or disconnected"));
  }

  if (contract.shell === "public") {
    if (!contract.requiredHeadProviders.includes("login-public")) {
      violations.push(
        formatViolation(contract, "login-public", "public route is not explicitly classified"),
      );
    }
    if (headCss.trim().length === 0) {
      violations.push(formatViolation(contract, "login-public", "public CSS is empty"));
    }
    return violations;
  }

  if (!contract.requiredHeadProviders.includes("shared-shell")) {
    violations.push(
      formatViolation(contract, "shared-shell", "authenticated route omitted shared provider"),
    );
  }

  const providerValues = new Map<SsrHeadStyleProviderId, string>([
    ["shared-shell", providers.sharedShell],
    ["shared-dialog", providers.sharedDialog],
    ["statement-presentation", providers.statementPresentation],
  ]);

  for (const providerId of contract.requiredHeadProviders) {
    if (providerId === "login-public") continue;
    validateProviderInFinalCss(
      contract,
      providerId,
      providerValues.get(providerId) ?? "",
      headCss,
      violations,
    );
  }

  for (const provider of contract.registeredStyleProviders) {
    validateRegisteredProviderInFinalCss(contract, provider, headCss, violations);
  }

  for (const conditional of contract.conditionalHeadProviders) {
    if (!html.includes(conditional.triggerHtmlFragment)) {
      violations.push(
        formatViolation(
          contract,
          conditional.providerId,
          `representative renderer did not activate conditional provider trigger ${JSON.stringify(conditional.triggerHtmlFragment)}`,
        ),
      );
      continue;
    }
    validateProviderInFinalCss(
      contract,
      conditional.providerId,
      providerValues.get(conditional.providerId) ?? "",
      headCss,
      violations,
    );
  }

  const shellNavigationCss = bodyStyleBlocks.find(
    (css) =>
      css.includes(".sidebar > nav") &&
      css.includes("scrollbar-gutter: stable") &&
      css.includes("@media (max-width: 760px)"),
  );
  if (!shellNavigationCss || shellNavigationCss.trim().length === 0) {
    violations.push(
      formatViolation(
        contract,
        "authenticated-shell-navigation",
        "shell navigation CSS is empty or disconnected from the final HTML",
      ),
    );
  }

  return violations;
}

export function extractHeadStyleCss(html: string): string {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
  return extractStyleBlocks(head).join("\n");
}

export function extractBodyStyleBlocks(html: string): string[] {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";
  return extractStyleBlocks(body);
}

export function replaceHeadStyleCss(html: string, css: string): string {
  return html.replace(/(<head\b[^>]*>[\s\S]*?<style\b[^>]*>)[\s\S]*?(<\/style>)/i, `$1${css}$2`);
}

export function removeStyleProviderFromDocument(html: string, providerCss: string): string {
  return providerCss.length === 0 ? html : html.replace(providerCss, "");
}

interface AuthenticatedContractOverrides {
  pageStyleMode?: SsrPageStyleMode;
  requiredHeadProviders?: readonly SsrHeadStyleProviderId[];
  conditionalHeadProviders?: readonly SsrConditionalHeadProviderRequirement[];
  pageCssFragments?: readonly string[];
  auxiliaryStyleProviders?: readonly SsrRegisteredStyleProviderRequirement[];
}

function authenticated(
  routeId: Exclude<ShellRouteId, "signIn">,
  path: string,
  moduleFileName: string,
  overrides: AuthenticatedContractOverrides = {},
): SsrStyleRouteContract {
  const pageStyleMode = overrides.pageStyleMode ?? "page-specific";
  const pageProvider: SsrRegisteredStyleProviderRequirement[] =
    pageStyleMode === "page-specific"
      ? [
          {
            providerId: `page:${routeId}`,
            kind: "page",
            moduleFileName,
            requiredCssFragments: overrides.pageCssFragments ?? [],
          },
        ]
      : [];

  return {
    routeId,
    path,
    shell: "authenticated",
    moduleFileName,
    pageStyleMode,
    requiredHeadProviders: overrides.requiredHeadProviders ?? ["shared-shell"],
    conditionalHeadProviders: overrides.conditionalHeadProviders ?? [],
    registeredStyleProviders: [...pageProvider, ...(overrides.auxiliaryStyleProviders ?? [])],
  };
}

function validateRegisteredProviderDeclarations(
  contract: SsrStyleRouteContract,
  violations: string[],
): void {
  const pageProviders = contract.registeredStyleProviders.filter(
    (provider) => provider.kind === "page",
  );
  if (contract.shell === "authenticated" && contract.pageStyleMode === "page-specific") {
    if (pageProviders.length !== 1) {
      violations.push(
        formatViolation(
          contract,
          `page:${contract.routeId}`,
          `page-specific route must register exactly one page provider; received ${pageProviders.length}`,
        ),
      );
    }
  }
  if (contract.pageStyleMode === "shared-only" && pageProviders.length > 0) {
    violations.push(
      formatViolation(
        contract,
        "shared-only",
        "shared-only route must not register a page provider",
      ),
    );
  }

  const seenProviderIds = new Set<string>();
  for (const provider of contract.registeredStyleProviders) {
    if (seenProviderIds.has(provider.providerId)) {
      violations.push(
        formatViolation(contract, provider.providerId, "duplicate registered style provider"),
      );
    }
    seenProviderIds.add(provider.providerId);
    if (provider.requiredCssFragments.length === 0) {
      violations.push(
        formatViolation(
          contract,
          provider.providerId,
          "registered provider has no executable CSS fragments",
        ),
      );
    }
    for (const fragment of provider.requiredCssFragments) {
      if (fragment.trim().length === 0) {
        violations.push(
          formatViolation(
            contract,
            provider.providerId,
            "registered provider has an empty CSS fragment",
          ),
        );
      }
    }
  }

  for (const conditional of contract.conditionalHeadProviders) {
    if (conditional.triggerHtmlFragment.trim().length === 0) {
      violations.push(
        formatViolation(
          contract,
          conditional.providerId,
          "conditional provider has an empty HTML trigger",
        ),
      );
    }
  }
}

function validateRegisteredProviderInFinalCss(
  contract: SsrStyleRouteContract,
  provider: SsrRegisteredStyleProviderRequirement,
  finalCss: string,
  violations: string[],
): void {
  if (provider.requiredCssFragments.length === 0) {
    violations.push(
      formatViolation(
        contract,
        provider.providerId,
        "registered provider has no executable CSS fragments",
      ),
    );
    return;
  }

  for (const fragment of provider.requiredCssFragments) {
    if (fragment.trim().length === 0) {
      violations.push(
        formatViolation(contract, provider.providerId, "registered provider returned empty CSS"),
      );
      continue;
    }
    if (!finalCss.includes(fragment)) {
      violations.push(
        formatViolation(
          contract,
          provider.providerId,
          `registered ${provider.kind} provider is disconnected from final HTML; missing CSS fragment ${JSON.stringify(fragment)} from ${provider.moduleFileName}`,
        ),
      );
    }
  }
}

function validateProviderInFinalCss(
  contract: SsrStyleRouteContract,
  providerId: SsrHeadStyleProviderId,
  providerCss: string,
  finalCss: string,
  violations: string[],
): void {
  if (providerCss.trim().length === 0) {
    violations.push(formatViolation(contract, providerId, "provider returned empty CSS"));
    return;
  }
  if (!finalCss.includes(providerCss)) {
    violations.push(
      formatViolation(contract, providerId, "provider is disconnected from final HTML"),
    );
  }
}

function extractStyleBlocks(fragment: string): string[] {
  return Array.from(
    fragment.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi),
    (match) => match[1] ?? "",
  );
}

function formatViolation(
  contract: Pick<SsrStyleRouteContract, "path" | "moduleFileName">,
  provider: string,
  message: string,
): string {
  return `[${SSR_STYLE_CONTRACT_NAME}] route=${contract.path} provider=${provider} module=${contract.moduleFileName}: ${message}`;
}
