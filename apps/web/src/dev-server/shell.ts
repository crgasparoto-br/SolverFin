import { isPrimaryMobileRoute } from "../app-shell/navigation.js";
import { listPrivateShellRoutes } from "../app-shell/routes.js";

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
    styles: input.styles,
    title: `${input.currentLabel} - SolverFin`,
  });
}

export function renderAuthenticatedShell(
  input: Omit<AuthenticatedShellDocumentInput, "styles">,
): string {
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="/dashboard" aria-label="Ir para o resumo do SolverFin"><img src="/icons/solverfin-192.png" width="28" height="28" alt="" />SolverFin</a>
        <nav aria-label="Menu principal" class="${isActivePathnameSecondary(input.activePathname, input.showAdminNavigation === true) ? "nav-open" : ""}">${renderNavigation(input.activePathname, input.showAdminNavigation === true)}</nav>
        <button class="logout" type="button" data-logout>Sair</button>
      </aside>
      <div class="main-area">
        <header class="topbar"><div><strong>${escapeHtml(input.currentLabel)}</strong><span>Usuário Demo SolverFin</span></div><button type="button" data-logout>Sair</button></header>
        <main>${input.content}</main>
      </div>
    </div>
    ${logoutScript()}
    ${navigationScript()}
    ${masterNavigationScript()}
    ${cardPurchaseEditRouteScript()}
  `;
}

export function faviconLinks(): string {
  return `
    <link rel="icon" type="image/svg+xml" href="/icons/solverfin.svg" />
    <link rel="alternate icon" href="/icons/favicon.ico" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  `;
}

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

  const links = routes
    .map((route) => {
      const isActive = route.path === activePathname;
      const priority = isPrimaryMobileRoute(route) ? "primary" : "secondary";
      const id = priority === "secondary" ? ` id="nav-secondary-${route.id}"` : "";

      return `<a href="${route.path}"${id} data-nav-priority="${priority}" ${isActive ? `aria-current="page"` : ""}>${escapeHtml(route.label)}</a>`;
    })
    .join("");

  return `
    ${links}
    <button type="button" class="nav-more-toggle" data-nav-more aria-expanded="${activeIsSecondary}" aria-controls="${secondaryIds.join(" ")}">${activeIsSecondary ? "Menos rotas" : "Mais rotas"}</button>
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
          button.textContent = isOpen ? "Menos rotas" : "Mais rotas";
        });
      });
    </script>
  `;
}

function masterNavigationScript(): string {
  return `
    <script>
      (async () => {
        const nav = document.querySelector('nav[aria-label="Menu principal"]');
        if (!nav || nav.querySelector('a[href="/admin/instituicoes"]')) return;

        try {
          const response = await fetch("/api/me");
          if (!response.ok) return;

          const body = await response.json();
          if (!body.user || body.user.isMaster !== true) return;

          const link = document.createElement("a");
          link.href = "/admin/instituicoes";
          link.id = "nav-secondary-adminInstitutions";
          link.dataset.navPriority = "secondary";
          link.textContent = ["Admin", "Instituições"].join(" - ");

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
          // Keep regular navigation usable if the profile endpoint is unavailable.
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
