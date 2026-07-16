import { isPrimaryMobileRoute } from "../app-shell/navigation.js";
import {
  listNavigablePrivateShellRoutes,
  type ShellRoute,
  type ShellRouteId,
} from "../app-shell/routes.js";
import { icon } from "./icons.js";
import { recurringCardScopeControllerScript } from "./recurring-card-scope-controller.js";
import { sidebarLayoutStyles } from "./sidebar-layout.js";
import {
  statementPresentationScript,
  statementPresentationStyles,
} from "./statement-presentation.js";

export interface ShellDocumentInput {
  body: string;
  styles: string;
  title: string;
}

export interface AuthenticatedShellDocumentInput {
  activePathname: string;
  content: string;
  currentLabel: string;
  styles: string;
  showAdminNavigation?: boolean;
}

export function renderShellDocument(input: ShellDocumentInput): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="manifest" href="/manifest.webmanifest" />
    ${faviconLinks()}
    <title>${escapeHtml(input.title)}</title>
    <style>${input.styles}</style>
  </head>
  <body>${input.body}</body>
</html>`;
}

export function renderAuthenticatedShellDocument(input: AuthenticatedShellDocumentInput): string {
  const statementStyles = hasStatementPresentation(input.content)
    ? `\n${statementPresentationStyles()}`
    : "";

  return renderShellDocument({
    body: renderAuthenticatedShell(input),
    styles: `${input.styles}\n${sidebarLayoutStyles()}${statementStyles}`,
    title: `${input.currentLabel} - SolverFin`,
  });
}

export function renderAuthenticatedShell(
  input: Omit<AuthenticatedShellDocumentInput, "styles">,
): string {
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="/dashboard" aria-label="Ir para o resumo do SolverFin">
          <img src="/icons/solverfin-192.png" width="24" height="24" alt="" />SolverFin
        </a>
        <nav aria-label="Menu principal" class="sidebar-navigation${isActivePathnameSecondary(input.activePathname, input.showAdminNavigation === true) ? " nav-open" : ""}">${renderNavigation(input.activePathname, input.showAdminNavigation === true)}</nav>
        <button class="logout" type="button" data-logout title="Encerrar sessão">
          ${icon("log-out", 14)} Sair
        </button>
      </aside>
      <div class="main-area">
        <header class="topbar">
          <div>
            <strong>${escapeHtml(input.currentLabel)}</strong>
            <span data-current-user-name aria-live="polite">Usuário</span>
          </div>
          <button type="button" data-logout title="Encerrar sessão">
            ${icon("log-out", 13)} Sair
          </button>
        </header>
        <main>${input.content}</main>
      </div>
    </div>
    ${logoutScript()}
    ${navigationScript()}
    ${currentUserScript(input.activePathname)}
    ${cardPurchaseEditRouteScript()}
    ${hasStatementPresentation(input.content) ? statementPresentationScript() : ""}
    ${recurringCardScopeControllerScript()}
  `;
}

export function faviconLinks(): string {
  return `
    <link rel="icon" type="image/svg+xml" href="/icons/solverfin.svg" />
    <link rel="alternate icon" href="/icons/favicon.ico" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  `;
}

/** Map each visible route id to a Lucide icon name. */
const routeIconMap: Partial<Record<ShellRouteId, Parameters<typeof icon>[0]>> = {
  dashboard: "layout-dashboard",
  transactions: "receipt",
  cards: "credit-card",
  accountsCards: "wallet",
  categories: "tag",
  budgets: "pie-chart",
  inbox: "inbox",
  reports: "bar-chart-2",
  settings: "settings",
  adminInstitutions: "building-2",
  adminFinancialIndexes: "trending-up",
};

/** Map each navigation group to a section label. */
const groupLabelMap: Record<string, string> = {
  main: "Rotina",
  manage: "Organizar",
  review: "Revisar",
  settings: "Ajustes",
  admin: "Admin",
};

function hasStatementPresentation(content: string): boolean {
  return content.includes('class="statement-layout"');
}

function isActivePathnameSecondary(activePathname: string, includeMasterRoutes: boolean): boolean {
  const activeRoute = listNavigablePrivateShellRoutes({
    includeMaster: includeMasterRoutes,
  }).find((route) => route.path === activePathname);
  return activeRoute !== undefined && !isPrimaryMobileRoute(activeRoute);
}

function getNavigationPriority(route: ShellRoute): "primary" | "secondary" {
  return isPrimaryMobileRoute(route) ? "primary" : "secondary";
}

function getNavigationElementId(route: ShellRoute): string {
  return `nav-${getNavigationPriority(route)}-${route.id}`;
}

function renderNavigationIcon(route: ShellRoute): string {
  const routeIcon = routeIconMap[route.id];

  if (!routeIcon) {
    throw new Error(`Missing navigation icon for visible route "${route.id}".`);
  }

  return icon(routeIcon, 15);
}

function renderNavigation(activePathname: string, includeMasterRoutes: boolean): string {
  const routes = listNavigablePrivateShellRoutes({ includeMaster: includeMasterRoutes });
  const activeIsSecondary = isActivePathnameSecondary(activePathname, includeMasterRoutes);
  const secondaryIds = routes
    .filter((route) => getNavigationPriority(route) === "secondary")
    .map(getNavigationElementId);

  const groups: Record<string, typeof routes> = {};
  for (const route of routes) {
    const group = route.navigationGroup;
    if (!groups[group]) groups[group] = [];
    groups[group].push(route);
  }

  const groupOrder = ["main", "manage", "review", "settings", "admin"];
  let html = "";

  for (const groupKey of groupOrder) {
    const groupRoutes = groups[groupKey];
    if (!groupRoutes || groupRoutes.length === 0) continue;

    const label = groupLabelMap[groupKey];
    if (label) {
      html += `<span class="nav-section-label" data-nav-group="${groupKey}">${escapeHtml(label)}</span>`;
    }

    for (const route of groupRoutes) {
      const isActive = route.path === activePathname;
      const priority = getNavigationPriority(route);
      const routeIcon = renderNavigationIcon(route);

      html += `<a href="${route.path}" id="${getNavigationElementId(route)}" data-nav-priority="${priority}" title="${escapeHtml(route.description)}" ${isActive ? `aria-current="page"` : ""}>${routeIcon}${escapeHtml(route.label)}</a>`;
    }
  }

  html += `<button type="button" class="nav-more-toggle" data-nav-more aria-expanded="${activeIsSecondary}" aria-controls="${secondaryIds.join(" ")}">${activeIsSecondary ? "Menos" : "Mais"}</button>`;

  return html;
}

function logoutScript(): string {
  return `
    <script>
      document.querySelectorAll("[data-logout]").forEach((button) => {
        button.addEventListener("click", async () => {
          await fetch("/api/session", { method: "DELETE" });
          window.location.assign("/login");
        });
      });
    </script>
  `;
}

function navigationScript(): string {
  return `
    <script>
      document.addEventListener("click", (event) => {
        const target = event.target;
        const button = target && target.closest ? target.closest("[data-nav-more]") : null;
        if (!button) return;

        const nav = button.closest("nav");
        if (!nav) return;

        const isOpen = nav.classList.toggle("nav-open");
        button.setAttribute("aria-expanded", String(isOpen));
        button.textContent = isOpen ? "Menos" : "Mais";
      });
    </script>
  `;
}

function currentUserScript(activePathname: string): string {
  const masterRoutes = listNavigablePrivateShellRoutes({ includeMaster: true }).filter(
    (route) => route.requiresMaster === true,
  );
  const masterNavigationHtml = renderNavigation(activePathname, true);
  const masterRouteIds = masterRoutes.map(getNavigationElementId);
  const masterNavigationStartsOpen = isActivePathnameSecondary(activePathname, true);

  return `
    <script>
      (async () => {
        const userName = document.querySelector("[data-current-user-name]");
        const nav = document.querySelector('nav[aria-label="Menu principal"]');
        const masterNavigationHtml = ${serializeForInlineScript(masterNavigationHtml)};
        const masterRouteIds = ${serializeForInlineScript(masterRouteIds)};
        const masterNavigationStartsOpen = ${masterNavigationStartsOpen};

        try {
          const response = await fetch("/api/me");
          if (!response.ok) return;

          const body = await response.json();
          if (!body.user) return;

          const displayName = typeof body.user.displayName === "string" ? body.user.displayName.trim() : "";
          const email = typeof body.user.email === "string" ? body.user.email.trim() : "";
          if (userName) userName.textContent = displayName || email || "Usuário";

          if (!nav || body.user.isMaster !== true) return;

          const hasAllMasterRoutes = masterRouteIds.every((id) =>
            nav.querySelector('[id="' + id + '"]'),
          );
          if (hasAllMasterRoutes) return;

          const navigationWasOpen = nav.classList.contains("nav-open");
          nav.innerHTML = masterNavigationHtml;

          const shouldRemainOpen = navigationWasOpen || masterNavigationStartsOpen;
          nav.classList.toggle("nav-open", shouldRemainOpen);

          const toggle = nav.querySelector("[data-nav-more]");
          if (toggle) {
            toggle.setAttribute("aria-expanded", String(shouldRemainOpen));
            toggle.textContent = shouldRemainOpen ? "Menos" : "Mais";
          }
        } catch {
          // Keep the authenticated shell usable if the profile endpoint is unavailable.
        }
      })();
    </script>
  `;
}

function cardPurchaseEditRouteScript(): string {
  return `
    <script>
      (function () {
        function findPurchase(id) {
          const node = Array.from(document.querySelectorAll("[data-purchase]")).find((candidate) => candidate.dataset.purchase === id);
          if (!node) return undefined;
          try {
            return JSON.parse(node.textContent || "{}");
          } catch {
            return undefined;
          }
        }

        document.addEventListener("click", (event) => {
          const button = event.target && event.target.closest ? event.target.closest("[data-edit-purchase]") : undefined;
          if (!button) return;
          const purchase = findPurchase(button.dataset.editPurchase || "");
          if (!purchase || !purchase.cardId || !purchase.id) return;

          window.setTimeout(() => {
            const form = document.querySelector("[data-purchase-form]");
            if (!form) return;
            form.dataset.path = "/api/credit-card-accounts/" + purchase.cardId + "/purchases/" + purchase.id;
            form.dataset.method = "PATCH";

            const instrumentInput = form.querySelector('[name="cardInstrumentId"]');
            if (instrumentInput) {
              const label = instrumentInput.closest("label");
              if (label) label.hidden = false;
              if (purchase.cardInstrumentId) instrumentInput.value = purchase.cardInstrumentId;
            }
          }, 0);
        }, true);
      })();
    </script>
  `;
}

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
