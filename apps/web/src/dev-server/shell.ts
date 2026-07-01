import { privateRoutes } from "./routes.js";

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
        <nav aria-label="Menu principal">${renderNavigation(input.activePathname)}</nav>
        <button class="logout" type="button" data-logout>Sair</button>
      </aside>
      <div class="main-area">
        <header class="topbar"><div><strong>${escapeHtml(input.currentLabel)}</strong><span>Usuário Demo SolverFin</span></div><button type="button" data-logout>Sair</button></header>
        <main>${input.content}</main>
      </div>
    </div>
    ${logoutScript()}
  `;
}

export function faviconLinks(): string {
  return `
    <link rel="icon" type="image/svg+xml" href="/icons/solverfin.svg" />
    <link rel="alternate icon" href="/icons/favicon.ico" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  `;
}

function renderNavigation(activePathname: string): string {
  return Array.from(privateRoutes.entries())
    .map(
      ([path, label]) =>
        `<a href="${path}" ${path === activePathname ? `aria-current="page"` : ""}>${escapeHtml(label)}</a>`,
    )
    .join("");
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
