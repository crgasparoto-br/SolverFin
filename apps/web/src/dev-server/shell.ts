import { isPrimaryMobileRoute } from "../app-shell/navigation.js";
import {
  listNavigablePrivateShellRoutes,
  type ShellRoute,
  type ShellRouteId,
} from "../app-shell/routes.js";
import { icon } from "./icons.js";
import { recurringCardScopeControllerScript } from "./recurring-card-scope-controller.js";
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
    styles: `${input.styles}${statementStyles}`,
    title: `${input.currentLabel} - SolverFin`,
  });
}

export function renderAuthenticatedShell(
  input: Omit<AuthenticatedShellDocumentInput, "styles">,
): string {
  return `
    <style>${authenticatedShellNavigationStyles()}</style>
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="/dashboard" aria-label="Ir para o resumo do SolverFin">
          <img src="/icons/solverfin-192.png" width="24" height="24" alt="" />SolverFin
        </a>
        <nav aria-label="Menu principal" class="${isActivePathnameSecondary(input.activePathname, input.showAdminNavigation === true) ? "nav-open" : ""}">${renderNavigation(input.activePathname, input.showAdminNavigation === true)}</nav>
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

/** Map each navigable private route id to a Lucide icon name. */
const routeIconMap: Record<Exclude<ShellRouteId, "accountRemuneration" | "signIn">, Parameters<typeof icon>[0]> = {
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

/** Map each navigation group to a section label */
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

function renderNavigation(activePathname: string, includeMasterRoutes: boolean): string {
  const routes = listNavigablePrivateShellRoutes({ includeMaster: includeMasterRoutes });
  const activeIsSecondary = isActivePathnameSecondary(activePathname, includeMasterRoutes);
  const secondaryIds = routes
    .filter((route) => !isPrimaryMobileRoute(route))
    .map((route) => `nav-secondary-${route.id}`);

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
      html += `<span class="nav-section-label" data-nav-group-label="${groupKey}">${escapeHtml(label)}</span>`;
    }

    for (const route of groupRoutes) {
      html += renderNavigationLink(route, activePathname);
    }
  }

  html += `<button type="button" class="nav-more-toggle" data-nav-more aria-expanded="${activeIsSecondary}" aria-controls="${secondaryIds.join(" ")}">${activeIsSecondary ? "Menos" : "Mais"}</button>`;

  return html;
}

function renderNavigationLink(route: ShellRoute, activePathname: string): string {
  const isActive = route.path === activePathname;
  const priority = isPrimaryMobileRoute(route) ? "primary" : "secondary";
  const id = priority === "secondary" ? ` id="nav-secondary-${route.id}"` : "";
  const routeIcon = getRouteIcon(route.id);

  return `<a href="${route.path}"${id} data-nav-route-id="${route.id}" data-nav-group="${route.navigationGroup}" data-nav-priority="${priority}" title="${escapeHtml(route.description)}" ${isActive ? `aria-current="page"` : ""}>${icon(routeIcon, 15)}${escapeHtml(route.label)}</a>`;
}

function getRouteIcon(routeId: ShellRouteId): Parameters<typeof icon>[0] {
  if (routeId === "accountRemuneration" || routeId === "signIn") {
    throw new Error(`Route ${routeId} is not expected in the private navigation`);
  }

  return routeIconMap[routeId];
}

function authenticatedShellNavigationStyles(): string {
  return `
    @media (min-width: 761px) {
      .sidebar { overflow: hidden; }
      .sidebar > .brand, .sidebar > .logout { flex: 0 0 auto; }
      .sidebar > nav {
        min-height: 0;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-gutter: stable;
      }
    }
    @media (max-width: 760px) {
      .sidebar { overflow-y: visible; }
      .sidebar > nav { min-height: auto; overflow-y: visible; }
    }
  `;
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
      document.querySelectorAll("[data-nav-more]").forEach((button) => {
        const nav = button.closest("nav");
        if (!nav) return;
        button.addEventListener("click", () => {
          const isOpen = nav.classList.toggle("nav-open");
          button.setAttribute("aria-expanded", String(isOpen));
          button.textContent = isOpen ? "Menos" : "Mais";
        });
      });
    </script>
  `;
}

function currentUserScript(activePathname: string): string {
  const masterRoutes = listNavigablePrivateShellRoutes({ includeMaster: true })
    .filter((route) => route.requiresMaster === true)
    .map((route) => ({
      id: route.id,
      path: route.path,
      label: route.label,
      description: route.description,
      navigationGroup: route.navigationGroup,
      priority: isPrimaryMobileRoute(route) ? "primary" : "secondary",
      iconHtml: icon(getRouteIcon(route.id), 15),
    }));

  return `
    <script>
      (async () => {
        const userName = document.querySelector("[data-current-user-name]");
        const nav = document.querySelector('nav[aria-label="Menu principal"]');
        const masterRoutes = ${JSON.stringify(masterRoutes)};
        const activePathname = ${JSON.stringify(activePathname)};

        try {
          const response = await fetch("/api/me");
          if (!response.ok) return;

          const body = await response.json();
          if (!body.user) return;

          const displayName = typeof body.user.displayName === "string" ? body.user.displayName.trim() : "";
          const email = typeof body.user.email === "string" ? body.user.email.trim() : "";
          if (userName) userName.textContent = displayName || email || "Usuário";

          if (!nav || body.user.isMaster !== true) return;

          const toggle = nav.querySelector("[data-nav-more]");
          for (const route of masterRoutes) {
            if (nav.querySelector('[data-nav-route-id="' + route.id + '"]')) continue;

            if (!nav.querySelector('[data-nav-group-label="' + route.navigationGroup + '"]')) {
              const sectionLabel = document.createElement("span");
              sectionLabel.className = "nav-section-label";
              sectionLabel.dataset.navGroupLabel = route.navigationGroup;
              sectionLabel.textContent = route.navigationGroup === "admin" ? "Admin" : route.navigationGroup;
              nav.insertBefore(sectionLabel, toggle);
            }

            const link = document.createElement("a");
            link.href = route.path;
            link.dataset.navRouteId = route.id;
            link.dataset.navGroup = route.navigationGroup;
            link.dataset.navPriority = route.priority;
            link.title = route.description;
            if (route.priority === "secondary") link.id = "nav-secondary-" + route.id;
            if (route.path === activePathname) link.setAttribute("aria-current", "page");
            link.innerHTML = route.iconHtml + route.label;
            nav.insertBefore(link, toggle);
          }

          if (toggle) {
            const secondaryIds = Array.from(nav.querySelectorAll('a[data-nav-priority="secondary"][id]'))
              .map((link) => link.id);
            toggle.setAttribute("aria-controls", secondaryIds.join(" "));
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
