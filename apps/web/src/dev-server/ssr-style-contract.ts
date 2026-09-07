import type { ShellRoute, ShellRouteId } from "../app-shell/routes.js";

export const SSR_STYLE_CONTRACT_NAME = "SolverFin SSR style contract";

export type SsrShellKind = "public" | "authenticated";
export type SsrPageStyleMode = "page-specific" | "shared-only";
export type SsrHeadStyleProviderId =
  | "login-public"
  | "shared-shell"
  | "shared-dialog"
  | "statement-presentation";
export type SsrRegisteredStyleProviderId =
  | `page:${ShellRouteId}`
  | `aux:${string}`
  | `runtime:${string}`;

export interface SsrConditionalHeadProviderRequirement {
  providerId: Exclude<SsrHeadStyleProviderId, "login-public" | "shared-shell" | "shared-dialog">;
  triggerHtmlFragment: string;
}

export interface SsrRegisteredStyleProviderRequirement {
  providerId: SsrRegisteredStyleProviderId;
  kind: "page" | "auxiliary";
  moduleFileName: string;
  requiredCssFragments?: readonly string[];
  requiredStyleBlockMarkers?: readonly string[];
}

export interface SsrStyleRouteContract {
  routeId: ShellRouteId;
  path: string;
  shell: SsrShellKind;
  moduleFileName: string;
  pageStyleMode: SsrPageStyleMode;
  representativeHtmlFragments: readonly string[];
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

const recurrenceAuxiliaryProvider = cssProvider(
  "aux:recurrences-section",
  "recurrences-section.js",
  ".recurrence-indicator{",
);

const transactionRuntimeProviders = [
  markerProvider(
    "runtime:account-remuneration-disclosure",
    "account-remuneration-disclosure-enhancement.js",
    "data-account-remuneration-disclosure-affordance",
  ),
  markerProvider(
    "runtime:transaction-group-modal",
    "transaction-group-modal-enhancement.js",
    "data-transaction-group-modal-enhancement",
  ),
  markerProvider(
    "runtime:transaction-group-member-form-guard",
    "transaction-group-member-form-guard.js",
    "data-transaction-group-member-form-guard",
  ),
  markerProvider(
    "runtime:transaction-group-modal-layout",
    "transaction-group-modal-layout-enhancement.js",
    "data-transaction-group-modal-layout",
  ),
  markerProvider(
    "runtime:transaction-bulk-selection",
    "transaction-bulk-selection-enhancement.js",
    "data-transaction-bulk-selection-enhancement",
  ),
  markerProvider(
    "runtime:transaction-bulk-selection-layout",
    "transaction-bulk-selection-layout-enhancement.js",
    "data-transaction-bulk-selection-layout-enhancement",
  ),
  markerProvider(
    "runtime:round-selection",
    "round-selection-control-enhancement.js",
    'data-round-selection-control="enhanced"',
  ),
] as const;

const inboxRuntimeProviders = [
  markerProvider(
    "runtime:round-selection",
    "round-selection-control-enhancement.js",
    'data-round-selection-control="enhanced"',
  ),
  cssProvider("runtime:inbox-interface", "inbox-interface-enhancement.js", ".inbox-page {"),
  markerProvider(
    "runtime:inbox-accessibility",
    "inbox-interface-accessibility-enhancement.js",
    'data-inbox-interface-accessibility="enhanced"',
  ),
  markerProvider(
    "runtime:inbox-table-layout",
    "inbox-table-layout-enhancement.js",
    'data-inbox-table-layout="enhanced"',
  ),
  markerProvider(
    "runtime:inbox-corrected-filter",
    "inbox-status-control-enhancement.js",
    'data-inbox-corrected-filter="enhanced"',
  ),
  markerProvider(
    "runtime:inbox-status-actions",
    "inbox-status-and-actions-enhancement.js",
    'data-inbox-status-actions="enhanced"',
  ),
  markerProvider(
    "runtime:inbox-row-readability",
    "inbox-row-readability-enhancement.js",
    'data-inbox-row-readability="enhanced"',
  ),
] as const;

export const solverFinSsrStyleContracts = [
  authenticated("dashboard", "/dashboard", "dashboard-page.js", {
    representativeHtmlFragments: ['class="dashboard-heading"'],
    pageCssFragments: [".dashboard-heading {"],
  }),
  authenticated("transactions", "/lancamentos", "transactions-page-v2.js", {
    representativeHtmlFragments: ['data-statement-archetype="A2"', 'class="statement-layout"'],
    pageCssFragments: ['[data-statement-archetype="A2"] {'],
    auxiliaryStyleProviders: [recurrenceAuxiliaryProvider, ...transactionRuntimeProviders],
    conditionalHeadProviders: [
      {
        providerId: "statement-presentation",
        triggerHtmlFragment: 'class="statement-layout"',
      },
    ],
  }),
  authenticated("cards", "/cartoes", "cards-page-v2.js", {
    representativeHtmlFragments: ['data-cards-archetype="A3"', 'class="cards-layout"'],
    pageCssFragments: ['[data-cards-archetype="A3"]{'],
    auxiliaryStyleProviders: [recurrenceAuxiliaryProvider],
  }),
  authenticated("accountsCards", "/contas-cartoes", "accounts-cards-page.js", {
    representativeHtmlFragments: ['data-accounts-cards-archetype="A3"', 'class="sf-detail-layout"'],
    pageCssFragments: [".accounts-cards-a3-page .sf-detail-layout {"],
  }),
  authenticated("accountRemuneration", "/remuneracao-contas", "account-remuneration-page.js", {
    representativeHtmlFragments: ['class="configuration-list"'],
    pageCssFragments: [".configuration-card {"],
  }),
  authenticated("categories", "/categorias", "categories-page.js", {
    representativeHtmlFragments: [
      'class="categories-workspace"',
      "data-categories-design-enhanced",
    ],
    pageCssFragments: [".categories-workspace {"],
    auxiliaryStyleProviders: [
      cssProvider(
        "runtime:categories-interface",
        "categories-icons-enhancement.js",
        ".category-summary {",
      ),
    ],
  }),
  authenticated("budgets", "/orcamentos", "pages.js", {
    representativeHtmlFragments: ['class="budgets-heading"'],
    requiredHeadProviders: ["shared-shell", "shared-dialog"],
    pageCssFragments: [".budgets-heading {"],
  }),
  authenticated("assistant", "/assistente", "financial-assistant-page.js", {
    representativeHtmlFragments: ['class="assistant-layout"'],
    pageCssFragments: [".assistant-layout {"],
  }),
  authenticated("inbox", "/inbox", "inbox-page.js", {
    representativeHtmlFragments: ['class="import-layout"'],
    requiredHeadProviders: ["shared-shell", "shared-dialog"],
    pageCssFragments: [".import-layout {"],
    auxiliaryStyleProviders: inboxRuntimeProviders,
  }),
  authenticated("reports", "/relatorios", "reports-page.js", {
    representativeHtmlFragments: ['class="reports-heading"'],
    pageCssFragments: [".reports-heading {"],
  }),
  authenticated("settings", "/configuracoes", "settings-page.js", {
    representativeHtmlFragments: ['class="page-heading secondary-heading"'],
    requiredHeadProviders: ["shared-shell", "shared-dialog"],
    pageCssFragments: [".secondary-heading {"],
  }),
  authenticated("adminInstitutions", "/admin/instituicoes", "admin-institutions-page.js", {
    representativeHtmlFragments: ['class="admin-heading"'],
    requiredHeadProviders: ["shared-shell", "shared-dialog"],
    pageCssFragments: [".admin-heading {"],
  }),
  authenticated(
    "adminFinancialIndexes",
    "/admin/indices-financeiros",
    "admin-financial-indexes-page.js",
    {
      representativeHtmlFragments: ['class="operation-grid"'],
      pageCssFragments: [".operation-grid {"],
    },
  ),
  {
    routeId: "signIn",
    path: "/login",
    shell: "public",
    moduleFileName: "login-page.js",
    pageStyleMode: "page-specific",
    representativeHtmlFragments: ['class="login-shell"'],
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

    validateContractDeclarations(contract, violations);
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

  for (const fragment of contract.representativeHtmlFragments) {
    if (!html.includes(fragment)) {
      violations.push(
        formatViolation(
          contract,
          "representative-html",
          `normal representative HTML is disconnected; missing ${JSON.stringify(fragment)}`,
        ),
      );
    }
  }

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
    validateRegisteredProviderInFinalDocument(contract, provider, html, headCss, violations);
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
  return providerCss.length === 0 ? html : html.split(providerCss).join("");
}

export function removeStyleBlockByMarker(html: string, marker: string): string {
  return html.replace(/<style\b([^>]*)>[\s\S]*?<\/style>/gi, (styleBlock, attributes) =>
    String(attributes).includes(marker) ? "" : styleBlock,
  );
}

interface AuthenticatedContractOverrides {
  pageStyleMode?: SsrPageStyleMode;
  representativeHtmlFragments?: readonly string[];
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
    representativeHtmlFragments: overrides.representativeHtmlFragments ?? [],
    requiredHeadProviders: overrides.requiredHeadProviders ?? ["shared-shell"],
    conditionalHeadProviders: overrides.conditionalHeadProviders ?? [],
    registeredStyleProviders: [...pageProvider, ...(overrides.auxiliaryStyleProviders ?? [])],
  };
}

function cssProvider(
  providerId: SsrRegisteredStyleProviderId,
  moduleFileName: string,
  fragment: string,
): SsrRegisteredStyleProviderRequirement {
  return {
    providerId,
    kind: "auxiliary",
    moduleFileName,
    requiredCssFragments: [fragment],
  };
}

function markerProvider(
  providerId: SsrRegisteredStyleProviderId,
  moduleFileName: string,
  marker: string,
): SsrRegisteredStyleProviderRequirement {
  return {
    providerId,
    kind: "auxiliary",
    moduleFileName,
    requiredStyleBlockMarkers: [marker],
  };
}

function validateContractDeclarations(contract: SsrStyleRouteContract, violations: string[]): void {
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
  if (contract.representativeHtmlFragments.length === 0) {
    violations.push(
      formatViolation(
        contract,
        "representative-html",
        "route has no executable normal-state HTML fragment",
      ),
    );
  }
  for (const fragment of contract.representativeHtmlFragments) {
    if (fragment.trim().length === 0) {
      violations.push(
        formatViolation(contract, "representative-html", "route has an empty HTML fragment"),
      );
    }
  }

  const seenProviderIds = new Set<string>();
  for (const provider of contract.registeredStyleProviders) {
    if (seenProviderIds.has(provider.providerId)) {
      violations.push(
        formatViolation(contract, provider.providerId, "duplicate registered style provider"),
      );
    }
    seenProviderIds.add(provider.providerId);

    const cssFragments = provider.requiredCssFragments ?? [];
    const styleMarkers = provider.requiredStyleBlockMarkers ?? [];
    if (cssFragments.length === 0 && styleMarkers.length === 0) {
      violations.push(
        formatViolation(
          contract,
          provider.providerId,
          "registered provider has no executable CSS evidence",
        ),
      );
    }
    for (const fragment of [...cssFragments, ...styleMarkers]) {
      if (fragment.trim().length === 0) {
        violations.push(
          formatViolation(
            contract,
            provider.providerId,
            "registered provider has an empty CSS evidence fragment",
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

function validateRegisteredProviderInFinalDocument(
  contract: SsrStyleRouteContract,
  provider: SsrRegisteredStyleProviderRequirement,
  html: string,
  finalCss: string,
  violations: string[],
): void {
  const cssFragments = provider.requiredCssFragments ?? [];
  const styleMarkers = provider.requiredStyleBlockMarkers ?? [];

  for (const fragment of cssFragments) {
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

  for (const marker of styleMarkers) {
    const css = findStyleBlockCssByMarker(html, marker);
    if (css === undefined) {
      violations.push(
        formatViolation(
          contract,
          provider.providerId,
          `registered ${provider.kind} provider is disconnected from final HTML; missing style block marker ${JSON.stringify(marker)} from ${provider.moduleFileName}`,
        ),
      );
      continue;
    }
    if (css.trim().length === 0) {
      violations.push(
        formatViolation(
          contract,
          provider.providerId,
          `registered ${provider.kind} provider returned empty CSS in style block ${JSON.stringify(marker)} from ${provider.moduleFileName}`,
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

function findStyleBlockCssByMarker(html: string, marker: string): string | undefined {
  for (const match of html.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)) {
    if ((match[1] ?? "").includes(marker)) return match[2] ?? "";
  }
  return undefined;
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
