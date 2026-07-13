import { isPrimaryMobileRoute } from "../app-shell/navigation.js";
import { listPrivateShellRoutes, type ShellRouteId } from "../app-shell/routes.js";
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
  return renderShellDocument({
    body: renderAuthenticatedShell(input),
    styles: `${input.styles}\n${statementPresentationStyles()}`,
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
    ${currentUserScript()}
    ${cardPurchaseEditRouteScript()}
    ${statementPresentationScript()}
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

/** Map each route id to a Lucide icon name */
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
};

/** Map each navigation group to a section label */
const groupLabelMap: Record<string, string> = {
  main: "Rotina",
  manage: "Organizar",
  review: "Revisar",
  settings: "Ajustes",
  admin: "Admin",
};

function isActivePathnameSecondary(activePathname: string, includeMasterRoutes: boolean): boolean {
  const activeRoute = listPrivateShellRoutes({ includeMaster: includeMasterRoutes }).find(
    (route) => route.path === activePathname,
  );
  return activeRoute !== undefined && !isPrimaryMobileRoute(activeRoute);
}

function renderNavigation(activePathname: string, includeMasterRoutes: boolean): string {
  const routes = listPrivateShellRoutes({ includeMaster: includeMasterRoutes });
  const activeIsSecondary = isActivePathnameSecondary(activePathname, includeMasterRoutes);
  const secondaryIds = routes
    .filter((route) => !isPrimaryMobileRoute(route))
    .map((route) => `nav-secondary-${route.id}`);

  // Group routes by navigationGroup to render section labels
  const groups: Record<string, typeof routes> = {};
  for (const route of routes) {
    const g = route.navigationGroup;
    if (!groups[g]) groups[g] = [];
    groups[g].push(route);
  }

  const groupOrder = ["main", "manage", "review", "settings", "admin"];
  let html = "";

  for (const groupKey of groupOrder) {
    const groupRoutes = groups[groupKey];
    if (!groupRoutes || groupRoutes.length === 0) continue;

    const label = groupLabelMap[groupKey];
    if (label) {
      html += `<span class="nav-section-label">${escapeHtml(label)}</span>`;
    }

    for (const route of groupRoutes) {
      const isActive = route.path === activePathname;
      const priority = isPrimaryMobileRoute(route) ? "primary" : "secondary";
      const id = priority === "secondary" ? ` id="nav-secondary-${route.id}"` : "";
      const routeIcon = routeIconMap[route.id];
      const iconHtml = routeIcon ? icon(routeIcon, 15) : "";

      html += `<a href="${route.path}"${id} data-nav-priority="${priority}" title="${escapeHtml(route.description)}" ${isActive ? `aria-current="page"` : ""}>${iconHtml}${escapeHtml(route.label)}</a>`;
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

function currentUserScript(): string {
  return `
    <script>
      (async () => {
        const userName = document.querySelector("[data-current-user-name]");
        const nav = document.querySelector('nav[aria-label="Menu principal"]');

        try {
          const response = await fetch("/api/me");
          if (!response.ok) return;

          const body = await response.json();
          if (!body.user) return;

          const displayName = typeof body.user.displayName === "string" ? body.user.displayName.trim() : "";
          const email = typeof body.user.email === "string" ? body.user.email.trim() : "";
          if (userName) userName.textContent = displayName || email || "Usuário";

          if (!nav || body.user.isMaster !== true || nav.querySelector('a[href="/admin/instituicoes"]')) return;

          const link = document.createElement("a");
          link.href = "/admin/instituicoes";
          link.id = "nav-secondary-adminInstitutions";
          link.dataset.navPriority = "secondary";
          link.title = "Gerenciar instituições financeiras";
          link.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg> Admin - Instituições';

          const toggle = nav.querySelector("[data-nav-more]");
          nav.insertBefore(link, toggle);

          if (toggle) {
            const controls = new Set(
              (toggle.getAttribute("aria-controls") || "").split(/\\s+/).filter(Boolean),
            );
            controls.add(link.id);
            toggle.setAttribute("aria-controls", Array.from(controls).join(" "));
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
