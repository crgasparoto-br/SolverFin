import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { buildSolverFinWebManifest } from "./pwa/manifest.js";

type RouteKind = "login" | "dashboard" | "placeholder" | "not-found";

interface DemoSession {
  id: string;
  expiresAt: number;
}

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 5173);
const manifest = buildSolverFinWebManifest();
const sessions = new Map<string, DemoSession>();
const sessionCookieName = "sf_demo_session";
const demoPasswordHash = "c3fe12298b006ad7e54d9dac3006a98f406506a78e3100ca831c0f96c43f5b60";
const privateRoutes = new Map<string, string>([
  ["/dashboard", "Dashboard"],
  ["/lancamentos", "Lancamentos"],
  ["/contas", "Contas"],
  ["/categorias", "Categorias"],
  ["/inbox", "Inbox"],
  ["/relatorios", "Relatorios"],
  ["/configuracoes", "Configuracoes"],
]);

const demoSummary = {
  profileName: "Pessoal Demo",
  availableBalanceMinor: 631150,
  incomeMinor: 520000,
  expensesMinor: 8650,
  plannedCommitmentsMinor: 4200,
  recentItems: [
    ["Receita mensal ficticia", "Receita", 520000, "2026-06-05"],
    ["Compra de mercado ficticia", "Despesa", -8650, "2026-06-07"],
    ["Transporte previsto ficticio", "Previsto", -4200, "2026-06-18"],
  ] as const,
};

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

if (process.argv[1]?.endsWith("dev-server.js") === true) {
  server.listen(port, host, () => {
    console.log(
      `SolverFin web dev server running at http://${host === "0.0.0.0" ? "localhost" : host}:${port}`,
    );
  });
}

export function resolveRoute(
  pathname: string,
  hasSession: boolean,
): { statusCode: number; kind: RouteKind; location?: string } {
  if (pathname === "/") {
    return {
      statusCode: 302,
      kind: hasSession ? "dashboard" : "login",
      location: hasSession ? "/dashboard" : "/login",
    };
  }

  if (pathname === "/login") {
    return hasSession
      ? { statusCode: 302, kind: "dashboard", location: "/dashboard" }
      : { statusCode: 200, kind: "login" };
  }

  if (privateRoutes.has(pathname)) {
    return hasSession
      ? { statusCode: 200, kind: pathname === "/dashboard" ? "dashboard" : "placeholder" }
      : { statusCode: 302, kind: "login", location: "/login" };
  }

  return { statusCode: 404, kind: "not-found" };
}

export function renderLoginPage(errorMessage?: string): string {
  return renderPage({
    title: "Entrar no SolverFin",
    body: `
      <main class="login-shell">
        <section class="panel" aria-labelledby="login-title">
          <p class="eyebrow">Ambiente local de desenvolvimento</p>
          <h1 id="login-title">Entrar no SolverFin</h1>
          <p class="muted">Use a conta demo ficticia para acessar o dashboard navegavel do MVP.</p>
          ${errorMessage ? `<p class="error" role="alert">${escapeHtml(errorMessage)}</p>` : ""}
          <form id="login-form" method="post" action="/api/session">
            <label>Email<input name="email" type="email" autocomplete="username" value="demo@solverfin.example.invalid" required /></label>
            <label>Senha<input name="password" type="password" autocomplete="current-password" placeholder="Senha demo ficticia" required /></label>
            <button type="submit">Entrar</button>
          </form>
        </section>
      </main>
      <script>
        document.querySelector("#login-form").addEventListener("submit", async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const response = await fetch("/api/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: form.email.value, password: form.password.value })
          });
          window.location.assign(response.ok ? "/dashboard" : "/login?erro=credenciais");
        });
      </script>
    `,
  });
}

export function renderDashboardPage(pathname = "/dashboard"): string {
  const currentLabel = privateRoutes.get(pathname) ?? "Dashboard";

  if (pathname !== "/dashboard") {
    return renderAuthenticatedPage({
      pathname,
      currentLabel,
      content: `
        <section class="panel placeholder-state">
          <p class="eyebrow">Funcionalidade em preparacao</p>
          <h1>${escapeHtml(currentLabel)}</h1>
          <p class="muted">Esta area ja faz parte da navegacao do MVP, mas ainda nao simula operacoes financeiras.</p>
        </section>
      `,
    });
  }

  return renderAuthenticatedPage({
    pathname,
    currentLabel,
    content: `
      <section class="dashboard-heading">
        <div>
          <p class="eyebrow">Perfil ativo: ${escapeHtml(demoSummary.profileName)}</p>
          <h1>Resumo financeiro inicial</h1>
          <p class="muted">Dados ficticios para validar a experiencia navegavel local.</p>
        </div>
        <span class="demo-pill">Demo seguro</span>
      </section>
      <section class="summary-grid" aria-label="Indicadores principais">
        ${renderMetricCard("Disponivel estimado", demoSummary.availableBalanceMinor, "Saldo demonstrativo do periodo")}
        ${renderMetricCard("Receitas", demoSummary.incomeMinor, "Entradas postadas no perfil demo")}
        ${renderMetricCard("Despesas", demoSummary.expensesMinor, "Saidas postadas no perfil demo")}
        ${renderMetricCard("Compromissos previstos", demoSummary.plannedCommitmentsMinor, "Lancamentos planejados")}
      </section>
      <section class="panel">
        <h2>Itens recentes</h2>
        <p class="muted">Valores em BRL, calculados a partir de unidades menores.</p>
        <div class="rows">
          ${demoSummary.recentItems
            .map(
              ([description, label, amountMinor, date]) => `
                <article class="row">
                  <div><strong>${escapeHtml(description)}</strong><span>${escapeHtml(label)} - ${formatDate(date)}</span></div>
                  <strong>${formatMoney(amountMinor)}</strong>
                </article>
              `,
            )
            .join("")}
        </div>
      </section>
      <section class="panel review-note">
        <h2>Pendencias de revisao</h2>
        <p class="muted">As sugestoes deste MVP sao demonstrativas. Revise qualquer previsao antes de usar como apoio para decisoes financeiras.</p>
      </section>
    `,
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const session = getSessionFromRequest(request);

  if (url.pathname === "/manifest.webmanifest") {
    sendJson(response, 200, manifest, "application/manifest+json; charset=utf-8");
    return;
  }

  if (url.pathname === "/health") {
    sendJson(response, 200, { status: "ok", app: "solverfin-web" });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    await handleApiRequest(request, response, url, session);
    return;
  }

  const route = resolveRoute(url.pathname, session !== undefined);

  if (route.statusCode === 302 && route.location) {
    response.writeHead(302, { location: route.location });
    response.end();
    return;
  }

  if (route.kind === "login") {
    sendHtml(response, 200, renderLoginPage(url.searchParams.has("erro") ? "Credenciais invalidas." : undefined));
    return;
  }

  if (route.kind === "dashboard" || route.kind === "placeholder") {
    sendHtml(response, 200, renderDashboardPage(url.pathname));
    return;
  }

  sendHtml(response, 404, renderNotFoundPage());
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  session: DemoSession | undefined,
): Promise<void> {
  const correlationId = resolveCorrelationId(request);

  if (request.method === "POST" && url.pathname === "/api/session") {
    const body = await readJsonBody(request);

    if (isValidLogin(body)) {
      const createdSession = createDemoSession();
      response.setHeader("set-cookie", serializeSessionCookie(createdSession));
      sendJson(response, 201, {
        user: serializeDemoUser(),
        session: { expiresAt: new Date(createdSession.expiresAt).toISOString() },
      });
      return;
    }

    sendJson(response, 401, apiError("AUTH_INVALID_CREDENTIALS", "Credenciais invalidas.", correlationId));
    return;
  }

  if (request.method === "DELETE" && url.pathname === "/api/session") {
    if (session) sessions.delete(session.id);
    response.writeHead(204, {
      "set-cookie": `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    });
    response.end();
    return;
  }

  if (!session) {
    sendJson(response, 401, apiError("AUTH_SESSION_REQUIRED", "Entre para continuar.", correlationId));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/me") {
    sendJson(response, 200, { user: serializeDemoUser() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/financial-summary") {
    sendJson(response, 200, {
      profile: { id: "33333333-3333-4333-8333-333333333331", name: demoSummary.profileName, kind: "personal" },
      currency: "BRL",
      availableBalanceMinor: demoSummary.availableBalanceMinor,
      incomeMinor: demoSummary.incomeMinor,
      expensesMinor: demoSummary.expensesMinor,
      plannedCommitmentsMinor: demoSummary.plannedCommitmentsMinor,
      recentItems: demoSummary.recentItems,
      reviewNotes: ["Dados demonstrativos do MVP local."],
      generatedAt: new Date().toISOString(),
    });
    return;
  }

  sendJson(response, 404, apiError("API_ROUTE_NOT_FOUND", "Rota de API nao encontrada.", correlationId));
}

function renderAuthenticatedPage(input: { pathname: string; currentLabel: string; content: string }): string {
  return renderPage({
    title: `${input.currentLabel} - SolverFin`,
    body: `
      <div class="app-shell">
        <aside class="sidebar">
          <a class="brand" href="/dashboard">SolverFin</a>
          <nav aria-label="Menu principal">
            ${Array.from(privateRoutes.entries())
              .map(
                ([path, label]) => `<a href="${path}" ${path === input.pathname ? `aria-current="page"` : ""}>${escapeHtml(label)}</a>`,
              )
              .join("")}
          </nav>
          <button class="logout" type="button" data-logout>Sair</button>
        </aside>
        <div class="main-area">
          <header class="topbar"><div><strong>${escapeHtml(input.currentLabel)}</strong><span>Usuario Demo SolverFin</span></div><button type="button" data-logout>Sair</button></header>
          <main>${input.content}</main>
        </div>
      </div>
      <script>
        document.querySelectorAll("[data-logout]").forEach((button) => {
          button.addEventListener("click", async () => {
            await fetch("/api/session", { method: "DELETE" });
            window.location.assign("/login");
          });
        });
      </script>
    `,
  });
}

function renderPage(input: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <title>${escapeHtml(input.title)}</title>
    <style>${baseCss()}</style>
  </head>
  <body>${input.body}</body>
</html>`;
}

function renderMetricCard(title: string, amountMinor: number, subtitle: string): string {
  return `<article class="metric-card"><span>${escapeHtml(title)}</span><strong>${formatMoney(amountMinor)}</strong><p>${escapeHtml(subtitle)}</p></article>`;
}

function renderNotFoundPage(): string {
  return renderPage({
    title: "Pagina nao encontrada - SolverFin",
    body: `<main class="placeholder-state"><p class="eyebrow">404</p><h1>Pagina nao encontrada</h1><p class="muted">Esta rota nao faz parte do MVP navegavel atual.</p><a class="button-link" href="/login">Voltar para entrada</a></main>`,
  });
}

function createDemoSession(): DemoSession {
  const session = { id: `sf_${randomUUID()}`, expiresAt: Date.now() + resolveSessionTtlMs() };
  sessions.set(session.id, session);
  return session;
}

function getSessionFromRequest(request: IncomingMessage): DemoSession | undefined {
  const sessionId = parseCookies(request.headers.cookie ?? "")[sessionCookieName];
  const session = sessionId ? sessions.get(sessionId) : undefined;

  if (!session) return undefined;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(session.id);
    return undefined;
  }

  return session;
}

function isValidLogin(body: unknown): boolean {
  if (
    typeof body !== "object" ||
    body === null ||
    !("email" in body) ||
    !("password" in body) ||
    typeof body.email !== "string" ||
    typeof body.password !== "string"
  ) {
    return false;
  }

  return (
    body.email.trim().toLowerCase() === "demo@solverfin.example.invalid" &&
    createHash("sha256").update(body.password).digest("hex") === demoPasswordHash
  );
}

function serializeDemoUser() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    email: "demo@solverfin.example.invalid",
    displayName: "Usuario Demo SolverFin",
  };
}

function serializeSessionCookie(session: DemoSession): string {
  const maxAgeSeconds = Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000));
  return `${sessionCookieName}=${session.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name) cookies[name] = valueParts.join("=");
  }

  return cookies;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return undefined;

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  contentType = "application/json; charset=utf-8",
): void {
  response.writeHead(statusCode, { "content-type": contentType });
  response.end(JSON.stringify(body, null, 2));
}

function sendHtml(response: ServerResponse, statusCode: number, html: string): void {
  response.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

function apiError(code: string, message: string, correlationId: string) {
  return { error: { code, message, correlationId } };
}

function resolveCorrelationId(request: IncomingMessage): string {
  const incoming = request.headers["x-correlation-id"];

  if (typeof incoming === "string" && /^[a-zA-Z0-9._:-]{8,120}$/.test(incoming)) {
    return incoming;
  }

  return `corr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveSessionTtlMs(): number {
  const ttlMinutes = Number(process.env.AUTH_SESSION_TTL_MINUTES ?? 60);
  return Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes * 60 * 1000 : 60 * 60 * 1000;
}

function formatMoney(amountMinor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amountMinor / 100);
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00.000Z`),
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function baseCss(): string {
  return `
    :root { color-scheme: light; --bg: #f8fafc; --surface: #ffffff; --text: #0f172a; --muted: #64748b; --line: #dbe3ee; --primary: #0f3d4c; --cyan: #0891b2; --danger: #dc2626; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    h1, h2, p { margin: 0; } h1 { font-size: 2rem; } a { color: inherit; }
    .login-shell, .placeholder-state { align-items: center; display: grid; min-height: 100vh; padding: 24px; }
    .panel, .placeholder-state, .metric-card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
    .login-shell .panel { display: grid; gap: 18px; margin: 0 auto; max-width: 460px; width: 100%; }
    .eyebrow { color: var(--cyan); font-size: .78rem; font-weight: 800; text-transform: uppercase; } .muted { color: var(--muted); }
    form, label { display: grid; gap: 10px; } label { font-weight: 700; } input { border: 1px solid var(--line); border-radius: 8px; font: inherit; min-height: 44px; padding: 0 12px; }
    button, .button-link { align-items: center; background: var(--primary); border: 0; border-radius: 8px; color: white; cursor: pointer; display: inline-flex; font: inherit; font-weight: 800; justify-content: center; min-height: 44px; padding: 0 16px; text-decoration: none; }
    .error { background: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; color: var(--danger); padding: 10px 12px; }
    .app-shell { display: grid; grid-template-columns: 248px minmax(0, 1fr); min-height: 100vh; } .sidebar { background: var(--primary); color: white; display: flex; flex-direction: column; gap: 22px; padding: 22px; }
    .brand { font-size: 1.2rem; font-weight: 900; text-decoration: none; } nav { display: grid; gap: 6px; } nav a { border-radius: 8px; color: rgba(255,255,255,.82); font-weight: 800; min-height: 40px; padding: 10px 12px; text-decoration: none; } nav a[aria-current="page"] { background: rgba(34,211,238,.18); color: white; }
    .logout { background: rgba(255,255,255,.12); margin-top: auto; } .main-area { min-width: 0; } .topbar { align-items: center; background: var(--surface); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; min-height: 64px; padding: 0 24px; } .topbar div { display: grid; gap: 2px; }
    main { display: grid; gap: 20px; padding: 24px; } .dashboard-heading { align-items: center; display: flex; gap: 16px; justify-content: space-between; } .demo-pill { background: #dcfce7; border-radius: 999px; color: #166534; font-weight: 800; padding: 8px 12px; }
    .summary-grid { display: grid; gap: 14px; grid-template-columns: repeat(4, minmax(0, 1fr)); } .metric-card { display: grid; gap: 8px; } .metric-card span { color: var(--muted); font-weight: 800; } .metric-card strong { color: var(--primary); font-size: 1.5rem; }
    .rows { display: grid; gap: 10px; margin-top: 16px; } .row { align-items: center; border-top: 1px solid var(--line); display: flex; gap: 16px; justify-content: space-between; padding-top: 10px; } .row div { display: grid; gap: 4px; } .row > strong { white-space: nowrap; }
    @media (max-width: 760px) { .app-shell { grid-template-columns: 1fr; } nav { grid-template-columns: repeat(2, minmax(0, 1fr)); } .summary-grid { grid-template-columns: 1fr; } .dashboard-heading, .topbar, .row { align-items: stretch; display: grid; } }
  `;
}
