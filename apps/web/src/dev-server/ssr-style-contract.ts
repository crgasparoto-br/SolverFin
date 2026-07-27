import type { ShellRoute, ShellRouteId } from "../app-shell/routes.js";

export const SSR_STYLE_CONTRACT_NAME = "SolverFin SSR style contract";

export type SsrShellKind = "public" | "authenticated";
export type SsrPageStyleMode = "page-specific" | "shared-only";
export type SsrHeadStyleProviderId =
  | "login-public"
  | "shared-shell"
  | "shared-dialog"
  | "statement-presentation";

export interface SsrStyleRouteContract {
  routeId: ShellRouteId;
  path: string;
  shell: SsrShellKind;
  moduleFileName: string;
  pageStyleMode: SsrPageStyleMode;
  requiredHeadProviders: readonly SsrHeadStyleProviderId[];
  conditionalHeadProviders: readonly SsrHeadStyleProviderId[];
  representativeContent?: string;
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
  requireConditionalProviders?: boolean;
}

export const solverFinSsrStyleContracts = [
  authenticated("dashboard", "/dashboard", "dashboard-page.js"),
  authenticated("transactions", "/lancamentos", "transactions-page.js", {
    conditionalHeadProviders: ["statement-presentation"],
    representativeContent: '<section class="statement-layout">Extrato ficticio</section>',
  }),
  authenticated("cards", "/cartoes", "cards-page.js"),
  authenticated("accountsCards", "/contas-cartoes", "accounts-cards-page.js"),
  authenticated("accountRemuneration", "/remuneracao-contas", "account-remuneration-page.js"),
  authenticated("categories", "/categorias", "categories-page.js"),
  authenticated("budgets", "/orcamentos", "pages.js", {
    requiredHeadProviders: ["shared-shell", "shared-dialog"],
  }),
  authenticated("inbox", "/inbox", "inbox-page.js", {
    requiredHeadProviders: ["shared-shell", "shared-dialog"],
  }),
  authenticated("reports", "/relatorios", "reports-page.js"),
  authenticated("settings", "/configuracoes", "settings-page.js", {
    requiredHeadProviders: ["shared-shell", "shared-dialog"],
  }),
  authenticated("adminInstitutions", "/admin/instituicoes", "admin-institutions-page.js", {
    requiredHeadProviders: ["shared-shell", "shared-dialog"],
  }),
  authenticated(
    "adminFinancialIndexes",
    "/admin/indices-financeiros",
    "admin-financial-indexes-page.js",
  ),
  {
    routeId: "signIn",
    path: "/login",
    shell: "public",
    moduleFileName: "login-page.js",
    pageStyleMode: "page-specific",
    requiredHeadProviders: ["login-public"],
    conditionalHeadProviders: [],
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

  const shouldRequireConditional =
    input.requireConditionalProviders === true ||
    (contract.representativeContent !== undefined && html.includes(contract.representativeContent));

  if (shouldRequireConditional) {
    for (const providerId of contract.conditionalHeadProviders) {
      validateProviderInFinalCss(
        contract,
        providerId,
        providerValues.get(providerId) ?? "",
        headCss,
        violations,
      );
    }
  }

  const shellNavigationCss = bodyStyleBlocks.find(
    (css) => css.includes(".sidebar > nav") && css.includes(".nav-more-toggle"),
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

  if (contract.pageStyleMode === "page-specific") {
    let pageSpecificRemainder = headCss;
    for (const providerId of contract.requiredHeadProviders) {
      if (providerId === "login-public") continue;
      pageSpecificRemainder = removeFirst(
        pageSpecificRemainder,
        providerValues.get(providerId) ?? "",
      );
    }
    if (shouldRequireConditional) {
      for (const providerId of contract.conditionalHeadProviders) {
        pageSpecificRemainder = removeFirst(
          pageSpecificRemainder,
          providerValues.get(providerId) ?? "",
        );
      }
    }
    if (pageSpecificRemainder.trim().length === 0) {
      violations.push(
        formatViolation(
          contract,
          `page:${contract.routeId}`,
          "page-specific CSS is empty or disconnected from the final composition",
        ),
      );
    }
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

function authenticated(
  routeId: Exclude<ShellRouteId, "signIn">,
  path: string,
  moduleFileName: string,
  overrides: Partial<
    Pick<
      SsrStyleRouteContract,
      "requiredHeadProviders" | "conditionalHeadProviders" | "representativeContent"
    >
  > = {},
): SsrStyleRouteContract {
  return {
    routeId,
    path,
    shell: "authenticated",
    moduleFileName,
    pageStyleMode: "page-specific",
    requiredHeadProviders: overrides.requiredHeadProviders ?? ["shared-shell"],
    conditionalHeadProviders: overrides.conditionalHeadProviders ?? [],
    ...(overrides.representativeContent !== undefined
      ? { representativeContent: overrides.representativeContent }
      : {}),
  };
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

function removeFirst(value: string, fragment: string): string {
  return fragment.length === 0 ? value : value.replace(fragment, "");
}

function formatViolation(
  contract: Pick<SsrStyleRouteContract, "path" | "moduleFileName">,
  provider: string,
  message: string,
): string {
  return `[${SSR_STYLE_CONTRACT_NAME}] route=${contract.path} provider=${provider} module=${contract.moduleFileName}: ${message}`;
}
