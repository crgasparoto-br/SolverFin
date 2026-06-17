import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { implementedRoutes, privateRoutes } from "./routes.js";

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

export async function renderPrivatePage(pathname: string, token: string): Promise<string> {
  if (!implementedRoutes.has(pathname) || pathname === "/dashboard") {
    return renderDashboardPage(token, pathname);
  }

  if (pathname === "/contas") return renderAccountsPage(token);
  if (pathname === "/categorias") return renderCategoriesPage(token);
  if (pathname === "/lancamentos") return renderTransactionsPage(token);
  if (pathname === "/cartoes") return renderCardsPage(token);
  if (pathname === "/orcamentos") return renderBudgetsPage(token);

  return renderDashboardPage(token, pathname);
}

export async function renderDashboardPage(token: string, pathname = "/dashboard"): Promise<string> {
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

  const summary = await apiGet<FinancialSummary>(token, "/api/financial-summary");

  if (!summary.ok) {
    return renderApiErrorPage(pathname, currentLabel, summary.error);
  }

  return renderAuthenticatedPage({
    pathname,
    currentLabel,
    content: `
      <section class="dashboard-heading">
        <div>
          <p class="eyebrow">Perfil pessoal demo</p>
          <h1>Resumo financeiro</h1>
          <p class="muted">Dados reais do banco local de desenvolvimento.</p>
        </div>
        <span class="demo-pill">Demo seguro</span>
      </section>
      <section class="summary-grid" aria-label="Indicadores principais">
        ${renderMetricCard("Disponivel estimado", summary.data.availableBalanceMinor, "Saldo das contas ativas")}
        ${renderMetricCard("Receitas do mes", summary.data.incomeMinor, "Entradas postadas no mes atual")}
        ${renderMetricCard("Despesas do mes", summary.data.expensesMinor, "Saidas postadas no mes atual")}
        ${renderMetricCard("Compromissos previstos", summary.data.plannedCommitmentsMinor, "Lancamentos planejados no mes")}
      </section>
      <section class="panel">
        <h2>Itens recentes</h2>
        <p class="muted">Valores em BRL, calculados a partir de unidades menores.</p>
        <div class="rows">
          ${
            summary.data.recentItems
              .map(
                (item) => `
                <article class="row">
                  <div><strong>${escapeHtml(item.description)}</strong><span>${escapeHtml(item.kind)} - ${escapeHtml(item.status)} - ${formatDate(item.occurredOn)}</span></div>
                  <strong>${formatMoney(item.amountMinor)}</strong>
                </article>
              `,
              )
              .join("") || `<p class="muted">Nenhum lancamento ainda.</p>`
          }
        </div>
      </section>
      <section class="panel review-note">
        <h2>Pendencias de revisao</h2>
        <p class="muted">Revise qualquer previsao antes de usar como apoio para decisoes financeiras.</p>
      </section>
    `,
  });
}

export async function renderAccountsPage(token: string): Promise<string> {
  const accounts = await apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts?status=all");

  if (!accounts.ok) {
    return renderApiErrorPage("/contas", "Contas", accounts.error);
  }

  return renderAuthenticatedPage({
    pathname: "/contas",
    currentLabel: "Contas",
    content: `
      <section class="panel">
        <h1>Contas</h1>
        <p class="muted">Cadastre contas correntes, poupanca, carteira ou investimento.</p>
        <div class="rows">
          ${
            accounts.data.accounts
              .map(
                (account) => `
                <article class="row">
                  <div><strong>${escapeHtml(account.name)}</strong><span>${escapeHtml(account.kind)} - ${escapeHtml(account.status)}</span></div>
                  <strong>${formatMoney(account.openingBalanceMinor)}</strong>
                </article>
              `,
              )
              .join("") || `<p class="muted">Nenhuma conta cadastrada.</p>`
          }
        </div>
      </section>
      <section class="panel">
        <h2>Nova conta</h2>
        <form data-api-form data-api-path="/api/accounts">
          <label>Nome<input name="name" required /></label>
          <label>Tipo
            <select name="kind" required>
              <option value="checking">Conta corrente</option>
              <option value="savings">Poupanca</option>
              <option value="cash">Carteira</option>
              <option value="investment">Investimento</option>
              <option value="other">Outro</option>
            </select>
          </label>
          <label>Saldo inicial (R$)<input name="openingBalanceMinor" data-money type="text" inputmode="decimal" placeholder="0,00" /></label>
          <button type="submit">Criar conta</button>
        </form>
      </section>
      ${apiFormScript()}
    `,
  });
}

export async function renderCategoriesPage(token: string): Promise<string> {
  const categories = await apiGet<{ categories: CategoryRecord[] }>(
    token,
    "/api/categories?status=all",
  );

  if (!categories.ok) {
    return renderApiErrorPage("/categorias", "Categorias", categories.error);
  }

  return renderAuthenticatedPage({
    pathname: "/categorias",
    currentLabel: "Categorias",
    content: `
      <section class="panel">
        <h1>Categorias</h1>
        <p class="muted">Classifique receitas, despesas e transferencias.</p>
        <div class="rows">
          ${
            categories.data.categories
              .map(
                (category) => `
                <article class="row">
                  <div><strong>${escapeHtml(category.name)}</strong><span>${escapeHtml(category.kind)} - ${escapeHtml(category.status)}</span></div>
                </article>
              `,
              )
              .join("") || `<p class="muted">Nenhuma categoria cadastrada.</p>`
          }
        </div>
      </section>
      <section class="panel">
        <h2>Nova categoria</h2>
        <form data-api-form data-api-path="/api/categories">
          <label>Nome<input name="name" required /></label>
          <label>Tipo
            <select name="kind" required>
              <option value="income">Receita</option>
              <option value="expense">Despesa</option>
              <option value="transfer">Transferencia</option>
            </select>
          </label>
          <button type="submit">Criar categoria</button>
        </form>
      </section>
      ${apiFormScript()}
    `,
  });
}

export async function renderTransactionsPage(token: string): Promise<string> {
  const [transactions, accounts, categories] = await Promise.all([
    apiGet<{ transactions: TransactionRecord[] }>(token, "/api/transactions?status=all"),
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts"),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories"),
  ]);

  if (!transactions.ok) {
    return renderApiErrorPage("/lancamentos", "Lancamentos", transactions.error);
  }

  const accountOptions = accounts.ok ? accounts.data.accounts : [];
  const categoryOptions = categories.ok ? categories.data.categories : [];

  return renderAuthenticatedPage({
    pathname: "/lancamentos",
    currentLabel: "Lancamentos",
    content: `
      <section class="panel">
        <h1>Lancamentos</h1>
        <p class="muted">Receitas, despesas e transferencias do perfil ativo.</p>
        <div class="rows">
          ${
            transactions.data.transactions
              .map(
                (transaction) => `
                <article class="row">
                  <div><strong>${escapeHtml(transaction.description || "(sem descricao)")}</strong><span>${escapeHtml(transaction.kind)} - ${escapeHtml(transaction.status)} - ${formatDate(transaction.occurredOn)}</span></div>
                  <strong>${formatMoney(transaction.amountMinor)}</strong>
                </article>
              `,
              )
              .join("") || `<p class="muted">Nenhum lancamento ainda.</p>`
          }
        </div>
      </section>
      <section class="panel">
        <h2>Novo lancamento</h2>
        <form data-api-form data-api-path="/api/transactions">
          <label>Tipo
            <select name="kind" required>
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
              <option value="transfer">Transferencia</option>
            </select>
          </label>
          <label>Valor (R$)<input name="amountMinor" data-money type="text" inputmode="decimal" required placeholder="0,00" /></label>
          <label>Data<input name="occurredOn" type="date" required /></label>
          <label>Conta
            <select name="accountId" required>
              ${accountOptions.map((account) => `<option value="${account.id}">${escapeHtml(account.name)}</option>`).join("")}
            </select>
          </label>
          <label>Conta de destino (transferencias)
            <select name="destinationAccountId">
              <option value="">-</option>
              ${accountOptions.map((account) => `<option value="${account.id}">${escapeHtml(account.name)}</option>`).join("")}
            </select>
          </label>
          <label>Categoria
            <select name="categoryId">
              <option value="">-</option>
              ${categoryOptions.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join("")}
            </select>
          </label>
          <label>Descricao<input name="description" /></label>
          <button type="submit">Criar lancamento</button>
        </form>
      </section>
      ${apiFormScript()}
    `,
  });
}

export async function renderCardsPage(token: string): Promise<string> {
  const [cards, accounts] = await Promise.all([
    apiGet<{ cards: CardRecord[] }>(token, "/api/cards?status=all"),
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts"),
  ]);

  if (!cards.ok) {
    return renderApiErrorPage("/cartoes", "Cartoes", cards.error);
  }

  const accountOptions = accounts.ok ? accounts.data.accounts : [];

  return renderAuthenticatedPage({
    pathname: "/cartoes",
    currentLabel: "Cartoes",
    content: `
      <section class="panel">
        <h1>Cartoes</h1>
        <p class="muted">Cartoes de credito, dias de fechamento e vencimento.</p>
        <div class="rows">
          ${
            cards.data.cards
              .map(
                (card) => `
                <article class="row">
                  <div><strong>${escapeHtml(card.name)}</strong><span>Fecha dia ${card.closingDay}, vence dia ${card.dueDay} - ${escapeHtml(card.status)}</span></div>
                </article>
              `,
              )
              .join("") || `<p class="muted">Nenhum cartao cadastrado.</p>`
          }
        </div>
      </section>
      <section class="panel">
        <h2>Novo cartao</h2>
        <form data-api-form data-api-path="/api/cards">
          <label>Nome<input name="name" required /></label>
          <label>Dia de fechamento<input name="closingDay" type="number" min="1" max="31" required /></label>
          <label>Dia de vencimento<input name="dueDay" type="number" min="1" max="31" required /></label>
          <label>Conta de pagamento
            <select name="paymentAccountId">
              <option value="">-</option>
              ${accountOptions.map((account) => `<option value="${account.id}">${escapeHtml(account.name)}</option>`).join("")}
            </select>
          </label>
          <button type="submit">Criar cartao</button>
        </form>
      </section>
      ${apiFormScript()}
    `,
  });
}

export async function renderBudgetsPage(token: string): Promise<string> {
  const [budgets, categories] = await Promise.all([
    apiGet<{ budgets: BudgetRecord[] }>(token, "/api/budgets?status=all"),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories?kind=expense"),
  ]);

  if (!budgets.ok) {
    return renderApiErrorPage("/orcamentos", "Orcamentos", budgets.error);
  }

  const categoryOptions = categories.ok ? categories.data.categories : [];

  return renderAuthenticatedPage({
    pathname: "/orcamentos",
    currentLabel: "Orcamentos",
    content: `
      <section class="panel">
        <h1>Orcamentos</h1>
        <p class="muted">Limites mensais planejados por categoria de despesa.</p>
        <div class="rows">
          ${
            budgets.data.budgets
              .map(
                (budget) => `
                <article class="row">
                  <div><strong>${formatDate(budget.periodStartOn)} - ${formatDate(budget.periodEndOn)}</strong><span>${escapeHtml(budget.status)}</span></div>
                  <strong>${formatMoney(budget.plannedAmountMinor)}</strong>
                </article>
              `,
              )
              .join("") || `<p class="muted">Nenhum orcamento cadastrado.</p>`
          }
        </div>
      </section>
      <section class="panel">
        <h2>Novo orcamento</h2>
        <form data-api-form data-api-path="/api/budgets">
          <label>Categoria
            <select name="categoryId" required>
              ${categoryOptions.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join("")}
            </select>
          </label>
          <label>Inicio do periodo<input name="periodStartOn" type="date" required /></label>
          <label>Fim do periodo<input name="periodEndOn" type="date" required /></label>
          <label>Valor planejado (R$)<input name="plannedAmountMinor" data-money type="text" inputmode="decimal" required placeholder="0,00" /></label>
          <button type="submit">Criar orcamento</button>
        </form>
      </section>
      ${apiFormScript()}
    `,
  });
}

function renderApiErrorPage(pathname: string, currentLabel: string, error: string): string {
  return renderAuthenticatedPage({
    pathname,
    currentLabel,
    content: `
      <section class="panel placeholder-state">
        <p class="eyebrow">Erro ao carregar dados</p>
        <h1>${escapeHtml(currentLabel)}</h1>
        <p class="error" role="alert">${escapeHtml(error)}</p>
      </section>
    `,
  });
}

function renderAuthenticatedPage(input: {
  pathname: string;
  currentLabel: string;
  content: string;
}): string {
  return renderPage({
    title: `${input.currentLabel} - SolverFin`,
    body: `
      <div class="app-shell">
        <aside class="sidebar">
          <a class="brand" href="/dashboard">SolverFin</a>
          <nav aria-label="Menu principal">
            ${Array.from(privateRoutes.entries())
              .map(
                ([path, label]) =>
                  `<a href="${path}" ${path === input.pathname ? `aria-current="page"` : ""}>${escapeHtml(label)}</a>`,
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

function apiFormScript(): string {
  return `
    <script>
      document.querySelectorAll("[data-api-form]").forEach((form) => {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const payload = {};
          new FormData(form).forEach((value, key) => {
            if (value === "") return;
            const field = form.querySelector('[name="' + key + '"]');
            if (field && field.dataset.money !== undefined) {
              payload[key] = Math.round(parseFloat(String(value).replace(",", ".")) * 100);
            } else {
              payload[key] = value;
            }
          });
          const response = await fetch(form.dataset.apiPath, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (response.ok) {
            window.location.reload();
          } else {
            const body = await response.json().catch(() => ({}));
            alert((body.error && body.error.message) || "Nao foi possivel salvar.");
          }
        });
      });
    </script>
  `;
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

export function renderNotFoundPage(): string {
  return renderPage({
    title: "Pagina nao encontrada - SolverFin",
    body: `<main class="placeholder-state"><p class="eyebrow">404</p><h1>Pagina nao encontrada</h1><p class="muted">Esta rota nao faz parte do MVP navegavel atual.</p><a class="button-link" href="/login">Voltar para entrada</a></main>`,
  });
}

function formatMoney(amountMinor: number): string {
  return formatMinorCurrency(amountMinor);
}

function formatDate(date: string): string {
  return formatDateOnly(date);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface FinancialSummaryItem {
  description: string;
  kind: string;
  amountMinor: number;
  occurredOn: string;
  status: string;
}

interface FinancialSummary {
  availableBalanceMinor: number;
  incomeMinor: number;
  expensesMinor: number;
  plannedCommitmentsMinor: number;
  recentItems: FinancialSummaryItem[];
}

interface AccountRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
  openingBalanceMinor: number;
}

interface CategoryRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
}

interface TransactionRecord {
  description: string;
  kind: string;
  status: string;
  amountMinor: number;
  occurredOn: string;
}

interface CardRecord {
  name: string;
  status: string;
  closingDay: number;
  dueDay: number;
}

interface BudgetRecord {
  status: string;
  periodStartOn: string;
  periodEndOn: string;
  plannedAmountMinor: number;
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
    form, label { display: grid; gap: 10px; } label { font-weight: 700; } input, select { border: 1px solid var(--line); border-radius: 8px; font: inherit; min-height: 44px; padding: 0 12px; }
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
