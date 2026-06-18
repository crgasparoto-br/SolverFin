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
        ${renderPageHeading({
          eyebrow: "Funcionalidade em preparacao",
          title: currentLabel,
          description:
            "Esta area ja faz parte da navegacao do MVP, mas ainda nao simula operacoes financeiras.",
        })}
        <section class="panel placeholder-state">
          <h2>Proximo passo</h2>
          <p class="muted">Quando a API desta area estiver conectada, esta tela deve seguir o mesmo padrao de lista, estado vazio e formulario das telas ja navegaveis.</p>
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
          <p class="muted">Dados ficticios do banco local de desenvolvimento.</p>
        </div>
        <span class="demo-pill">Demo seguro</span>
      </section>
      <section class="summary-grid" aria-label="Indicadores principais">
        ${renderMetricCard("Disponivel estimado", summary.data.availableBalanceMinor, "Saldo das contas ativas")}
        ${renderMetricCard("Receitas do mes", summary.data.incomeMinor, "Entradas postadas no mes atual")}
        ${renderMetricCard("Despesas do mes", summary.data.expensesMinor, "Saidas postadas no mes atual")}
        ${renderMetricCard("Compromissos previstos", summary.data.plannedCommitmentsMinor, "Lancamentos planejados no mes")}
      </section>
      <section class="panel list-panel">
        <div class="section-heading">
          <div>
            <h2>Itens recentes</h2>
            <p class="muted">Valores em BRL, calculados a partir de unidades menores.</p>
          </div>
        </div>
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
              .join("") || renderEmptyState("Nenhum lancamento ainda.", "Crie lancamentos para acompanhar a rotina financeira deste perfil.")
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
      ${renderPageHeading({
        eyebrow: "Organizar base financeira",
        title: "Contas",
        description: "Cadastre contas correntes, poupanca, carteira ou investimento.",
      })}
      <section class="workspace-grid">
        <section class="panel list-panel">
          <div class="section-heading">
            <h2>Contas cadastradas</h2>
            <span>${accounts.data.accounts.length} itens</span>
          </div>
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
                .join("") || renderEmptyState("Nenhuma conta cadastrada.", "Crie a primeira conta para conectar saldos e lancamentos.")
            }
          </div>
        </section>
        <section class="panel form-panel">
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
      ${renderPageHeading({
        eyebrow: "Padronizar classificacao",
        title: "Categorias",
        description: "Classifique receitas, despesas e transferencias com consistencia.",
      })}
      <section class="workspace-grid">
        <section class="panel list-panel">
          <div class="section-heading">
            <h2>Categorias cadastradas</h2>
            <span>${categories.data.categories.length} itens</span>
          </div>
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
                .join("") || renderEmptyState("Nenhuma categoria cadastrada.", "Crie categorias para organizar receitas e despesas.")
            }
          </div>
        </section>
        <section class="panel form-panel">
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
      ${renderPageHeading({
        eyebrow: "Rotina financeira",
        title: "Lancamentos",
        description: "Receitas, despesas e transferencias do perfil ativo.",
      })}
      <section class="workspace-grid wide-form">
        <section class="panel list-panel">
          <div class="section-heading">
            <h2>Movimentacoes</h2>
            <span>${transactions.data.transactions.length} itens</span>
          </div>
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
                .join("") || renderEmptyState("Nenhum lancamento ainda.", "Registre a primeira movimentacao para atualizar o resumo.")
            }
          </div>
        </section>
        <section class="panel form-panel">
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
            <label class="full-span">Descricao<input name="description" /></label>
            <button type="submit">Criar lancamento</button>
          </form>
        </section>
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
      ${renderPageHeading({
        eyebrow: "Credito com previsibilidade",
        title: "Cartoes",
        description: "Organize cartoes de credito, dias de fechamento e vencimento.",
      })}
      <section class="workspace-grid">
        <section class="panel list-panel">
          <div class="section-heading">
            <h2>Cartoes cadastrados</h2>
            <span>${cards.data.cards.length} itens</span>
          </div>
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
                .join("") || renderEmptyState("Nenhum cartao cadastrado.", "Cadastre cartoes para acompanhar faturas e vencimentos.")
            }
          </div>
        </section>
        <section class="panel form-panel">
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
      ${renderPageHeading({
        eyebrow: "Planejamento mensal",
        title: "Orcamentos",
        description: "Acompanhe limites planejados por categoria de despesa.",
      })}
      <section class="workspace-grid">
        <section class="panel list-panel">
          <div class="section-heading">
            <h2>Limites planejados</h2>
            <span>${budgets.data.budgets.length} itens</span>
          </div>
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
                .join("") || renderEmptyState("Nenhum orcamento cadastrado.", "Crie limites mensais para acompanhar categorias de despesa.")
            }
          </div>
        </section>
        <section class="panel form-panel">
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
        <a class="button-link" href="${escapeHtml(pathname)}">Tentar novamente</a>
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
          <a class="brand" href="/dashboard" aria-label="Ir para o resumo do SolverFin">SolverFin</a>
          <nav aria-label="Menu principal">
            ${renderNavigation(input.pathname)}
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
        let status = form.querySelector("[data-form-status]");
        if (!status) {
          status = document.createElement("p");
          status.className = "form-status muted";
          status.setAttribute("data-form-status", "");
          status.setAttribute("aria-live", "polite");
          form.appendChild(status);
        }

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const payload = {};
          const submitButton = form.querySelector('button[type="submit"]');

          new FormData(form).forEach((value, key) => {
            if (value === "") return;
            const field = form.querySelector('[name="' + key + '"]');
            if (field && field.dataset.money !== undefined) {
              payload[key] = Math.round(parseFloat(String(value).replace(",", ".")) * 100);
            } else {
              payload[key] = value;
            }
          });

          if (submitButton) submitButton.disabled = true;
          status.className = "form-status muted";
          status.textContent = "Salvando...";

          const response = await fetch(form.dataset.apiPath, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            status.className = "form-status success";
            status.textContent = "Salvo. Atualizando a tela...";
            window.setTimeout(() => window.location.reload(), 450);
            return;
          }

          const body = await response.json().catch(() => ({}));
          status.className = "form-status error";
          status.textContent = (body.error && body.error.message) || "Nao foi possivel salvar.";
          if (submitButton) submitButton.disabled = false;
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

function renderNavigation(activePathname: string): string {
  return Array.from(privateRoutes.entries())
    .map(
      ([path, label]) =>
        `<a href="${path}" ${path === activePathname ? `aria-current="page"` : ""}>${escapeHtml(label)}</a>`,
    )
    .join("");
}

function renderPageHeading(input: { eyebrow: string; title: string; description: string }): string {
  return `
    <section class="page-heading">
      <p class="eyebrow">${escapeHtml(input.eyebrow)}</p>
      <h1>${escapeHtml(input.title)}</h1>
      <p class="muted">${escapeHtml(input.description)}</p>
    </section>
  `;
}

function renderMetricCard(title: string, amountMinor: number, subtitle: string): string {
  return `<article class="metric-card"><span>${escapeHtml(title)}</span><strong>${formatMoney(amountMinor)}</strong><p>${escapeHtml(subtitle)}</p></article>`;
}

function renderEmptyState(title: string, description: string): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(description)}</p></div>`;
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
    :root { color-scheme: light; --bg: #f8fafc; --surface: #ffffff; --text: #0f172a; --muted: #475569; --line: #cbd5e1; --primary: #0f3d4c; --primary-soft: #e8f3f6; --cyan: #0891b2; --success: #166534; --success-bg: #dcfce7; --danger: #dc2626; --danger-bg: #fee2e2; --warning-bg: #fef3c7; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    h1, h2, p { margin: 0; } h1 { font-size: clamp(1.6rem, 4vw, 2rem); line-height: 1.15; } h2 { font-size: 1rem; line-height: 1.3; } a { color: inherit; }
    button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid rgba(34, 211, 238, .55); outline-offset: 2px; }
    .login-shell, .placeholder-state { align-items: center; display: grid; min-height: 100vh; padding: 24px; }
    .panel, .placeholder-state, .metric-card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
    .panel { display: grid; gap: 16px; min-width: 0; }
    .login-shell .panel { gap: 18px; margin: 0 auto; max-width: 460px; width: 100%; }
    .eyebrow { color: var(--cyan); font-size: .78rem; font-weight: 800; letter-spacing: 0; text-transform: uppercase; } .muted { color: var(--muted); line-height: 1.5; }
    form, label { display: grid; gap: 10px; } label { color: var(--text); font-weight: 700; } input, select { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; color: var(--text); font: inherit; min-height: 44px; padding: 0 12px; width: 100%; }
    button, .button-link { align-items: center; background: var(--primary); border: 0; border-radius: 8px; color: white; cursor: pointer; display: inline-flex; font: inherit; font-weight: 800; justify-content: center; min-height: 44px; padding: 0 16px; text-decoration: none; }
    button:disabled { cursor: not-allowed; opacity: .58; }
    .error { background: var(--danger-bg); border: 1px solid #fecaca; border-radius: 8px; color: var(--danger); padding: 10px 12px; }
    .success { background: var(--success-bg); border: 1px solid #bbf7d0; border-radius: 8px; color: var(--success); padding: 10px 12px; }
    .form-status { grid-column: 1 / -1; }
    .app-shell { display: grid; grid-template-columns: 248px minmax(0, 1fr); min-height: 100vh; } .sidebar { background: var(--primary); color: white; display: flex; flex-direction: column; gap: 22px; padding: 22px; }
    .brand { align-items: center; display: inline-flex; font-size: 1.2rem; font-weight: 900; min-height: 44px; text-decoration: none; } nav { display: grid; gap: 6px; } nav a { border-radius: 8px; color: rgba(255,255,255,.82); font-weight: 800; min-height: 40px; padding: 10px 12px; text-decoration: none; } nav a:hover, nav a[aria-current="page"] { background: rgba(34,211,238,.18); color: white; }
    .logout { background: rgba(255,255,255,.12); margin-top: auto; } .main-area { min-width: 0; } .topbar { align-items: center; background: rgba(255,255,255,.92); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; min-height: 64px; padding: 0 24px; position: sticky; top: 0; z-index: 5; } .topbar div { display: grid; gap: 2px; } .topbar span { color: var(--muted); font-size: .875rem; }
    main { display: grid; gap: 20px; margin: 0 auto; max-width: 1180px; padding: 24px; width: 100%; } .dashboard-heading, .page-heading { align-items: end; display: flex; gap: 16px; justify-content: space-between; } .page-heading { align-items: start; display: grid; max-width: 760px; } .demo-pill { background: var(--success-bg); border-radius: 999px; color: var(--success); font-weight: 800; padding: 8px 12px; white-space: nowrap; }
    .summary-grid { display: grid; gap: 14px; grid-template-columns: repeat(4, minmax(0, 1fr)); } .metric-card { display: grid; gap: 8px; min-width: 0; } .metric-card span { color: var(--muted); font-size: .78rem; font-weight: 800; text-transform: uppercase; } .metric-card strong { color: var(--primary); font-size: 1.5rem; line-height: 1.2; overflow-wrap: anywhere; } .metric-card p { color: var(--muted); line-height: 1.45; }
    .workspace-grid { align-items: start; display: grid; gap: 18px; grid-template-columns: minmax(0, 1fr) minmax(19rem, .45fr); } .workspace-grid.wide-form { grid-template-columns: minmax(0, .95fr) minmax(22rem, .6fr); }
    .section-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .section-heading span { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: .78rem; font-weight: 800; padding: 6px 10px; white-space: nowrap; }
    .rows { display: grid; gap: 10px; } .row { align-items: center; border-top: 1px solid var(--line); display: flex; gap: 16px; justify-content: space-between; min-width: 0; padding-top: 10px; } .row:first-child { border-top: 0; padding-top: 0; } .row div { display: grid; gap: 4px; min-width: 0; } .row span { color: var(--muted); line-height: 1.45; } .row strong { overflow-wrap: anywhere; } .row > strong { text-align: right; white-space: nowrap; }
    .empty-state { background: var(--bg); border: 1px dashed var(--line); border-radius: 8px; display: grid; gap: 6px; padding: 16px; }
    .form-panel form { grid-template-columns: 1fr; } .wide-form .form-panel form { grid-template-columns: repeat(2, minmax(0, 1fr)); } .wide-form .form-panel button, .wide-form .full-span { grid-column: 1 / -1; }
    .review-note { background: #f0fdf4; border-color: #bbf7d0; }
    @media (max-width: 1024px) { .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .workspace-grid, .workspace-grid.wide-form { grid-template-columns: 1fr; } .wide-form .form-panel form { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) { .app-shell { grid-template-columns: 1fr; } .sidebar { gap: 12px; padding: 12px 16px; position: sticky; top: 0; z-index: 10; } .sidebar .logout { display: none; } nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; } nav a { background: rgba(255,255,255,.1); flex: 0 0 auto; min-height: 44px; white-space: nowrap; } .topbar { min-height: 56px; padding: 0 16px; position: static; } .topbar button { display: none; } main { padding: 18px 16px 28px; } .summary-grid, .wide-form .form-panel form { grid-template-columns: 1fr; } .dashboard-heading, .row, .section-heading { align-items: stretch; display: grid; } .row > strong { text-align: left; white-space: normal; } }
  `;
}
