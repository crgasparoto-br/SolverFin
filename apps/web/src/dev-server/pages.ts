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
          <p class="muted">Use a conta demo fictícia para acessar o dashboard navegável do MVP.</p>
          ${errorMessage ? `<p class="error" role="alert">${escapeHtml(errorMessage)}</p>` : ""}
          <form id="login-form" method="post" action="/api/session">
            <label>Email<input name="email" type="email" autocomplete="username" value="demo@solverfin.example.invalid" required /></label>
            <label>Senha<input name="password" type="password" autocomplete="current-password" placeholder="Senha demo fictícia" required /></label>
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
          eyebrow: "Funcionalidade em preparação",
          title: currentLabel,
          description:
            "Esta área já faz parte da navegação do MVP, mas ainda não simula operações financeiras.",
        })}
        <section class="panel placeholder-state">
          <h2>Próximo passo</h2>
          <p class="muted">Quando a API desta área estiver conectada, esta tela deve seguir o mesmo padrão de lista, estado vazio e formulário das telas já navegáveis.</p>
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
          <p class="muted">Dados fictícios do banco local de desenvolvimento.</p>
        </div>
        <span class="demo-pill">Demo seguro</span>
      </section>
      <section class="summary-grid" aria-label="Indicadores principais">
        ${renderMetricCard("Disponível estimado", summary.data.availableBalanceMinor, "Saldo das contas ativas")}
        ${renderMetricCard("Receitas do mês", summary.data.incomeMinor, "Entradas postadas no mês atual")}
        ${renderMetricCard("Despesas do mês", summary.data.expensesMinor, "Saídas postadas no mês atual")}
        ${renderMetricCard("Compromissos previstos", summary.data.plannedCommitmentsMinor, "Lançamentos planejados no mês")}
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
              .join("") || renderEmptyState("Nenhum lançamento ainda.", "Crie lançamentos para acompanhar a rotina financeira deste perfil.")
          }
        </div>
      </section>
      <section class="panel review-note">
        <h2>Pendências de revisão</h2>
        <p class="muted">Revise qualquer previsão antes de usar como apoio para decisões financeiras.</p>
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
        description: "Cadastre contas correntes, poupança, carteira ou investimento.",
      })}
      <section class="workspace-grid wide-form">
        <section class="panel list-panel">
          <div class="section-heading">
            <h2>Contas cadastradas</h2>
            <span>${accounts.data.accounts.length} itens</span>
          </div>
          <div class="rows maintenance-rows">
            ${
              accounts.data.accounts
                .map(renderAccountRow)
                .join("") || renderEmptyState("Nenhuma conta cadastrada.", "Crie a primeira conta para conectar saldos e lançamentos.")
            }
          </div>
        </section>
        <section class="panel form-panel">
          <h2>Nova conta</h2>
          <form data-api-form data-api-path="/api/accounts">
            <label>Nome<input name="name" required /></label>
            <label>Tipo
              <select name="kind" required>
                ${renderAccountKindOptions()}
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
        eyebrow: "Padronizar classificação",
        title: "Categorias",
        description: "Classifique receitas, despesas e transferências com consistência.",
      })}
      <section class="workspace-grid wide-form">
        <section class="panel list-panel">
          <div class="section-heading">
            <h2>Categorias cadastradas</h2>
            <span>${categories.data.categories.length} itens</span>
          </div>
          <div class="rows maintenance-rows">
            ${
              categories.data.categories
                .map(renderCategoryRow)
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
                ${renderCategoryKindOptions()}
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
    return renderApiErrorPage("/lancamentos", "Extrato da conta", transactions.error);
  }

  const transactionItems = transactions.data.transactions;
  const accountOptions = accounts.ok ? accounts.data.accounts : [];
  const categoryOptions = categories.ok ? categories.data.categories : [];
  const selectedAccount = accountOptions[0];
  const selectedAccountName = selectedAccount?.name ?? "Todas as contas";
  const statement = summarizeStatement(transactionItems, accountOptions, selectedAccount?.id);
  const groupedTransactions = groupTransactionsByDate(transactionItems);

  return renderAuthenticatedPage({
    pathname: "/lancamentos",
    currentLabel: "Extrato da conta",
    content: `
      <section class="statement-heading">
        <div>
          <p class="eyebrow">Rotina financeira</p>
          <h1>Extrato da conta</h1>
          <p class="muted">Acompanhe saldos, entradas, saídas e transferências do perfil ativo.</p>
        </div>
        <a class="button-link" href="#novo-lancamento">Novo lançamento</a>
      </section>
      <section class="statement-layout">
        <aside class="statement-sidebar" aria-label="Resumo da conta">
          <section class="panel account-period-panel">
            <div class="account-switcher">
              <div>
                <span>Conta</span>
                <strong>${escapeHtml(selectedAccountName)}</strong>
              </div>
              <span class="account-code">${escapeHtml(selectedAccount?.kind ?? "perfil")}</span>
            </div>
            <div class="period-control" aria-label="Período do extrato">
              <span aria-hidden="true">‹</span>
              <strong>Mês atual</strong>
              <span aria-hidden="true">›</span>
            </div>
          </section>
          <section class="panel statement-summary-panel">
            <div class="section-heading compact-heading">
              <h2>Situação do período</h2>
              <span>${transactionItems.length} itens</span>
            </div>
            <dl class="statement-totals">
              <div><dt>Saldo inicial</dt><dd>${formatMoney(statement.openingBalanceMinor)}</dd></div>
              <div><dt>Receitas</dt><dd class="amount-credit">${formatMoney(statement.incomeMinor)}</dd></div>
              <div><dt>Despesas</dt><dd class="amount-debit">${formatMoney(-statement.expenseMinor)}</dd></div>
              <div><dt>Transferências</dt><dd>${formatMoney(statement.transferMinor)}</dd></div>
              <div class="total-line"><dt>Saldo estimado</dt><dd class="${statement.estimatedBalanceMinor < 0 ? "amount-debit" : "amount-credit"}">${formatMoney(statement.estimatedBalanceMinor)}</dd></div>
            </dl>
            <div class="reconciliation-note">
              <span>Conciliação</span>
              <strong>${statement.confirmedCount} confirmados</strong>
              <p class="muted">${statement.pendingCount} itens ainda precisam de revisão ou confirmação.</p>
            </div>
          </section>
        </aside>
        <div class="statement-workspace">
          <section class="panel statement-panel">
            <div class="statement-toolbar">
              <div>
                <h2>Movimentações</h2>
                <p class="muted">Valores em BRL, com despesas destacadas em vermelho e entradas em verde.</p>
              </div>
              <div class="status-chips" aria-label="Filtros de status">
                ${renderStatusChip("Todos", transactionItems.length, "all")}
                ${renderStatusChip("Pendentes", statement.pendingCount, "pending")}
                ${renderStatusChip("Confirmados", statement.confirmedCount, "confirmed")}
                ${renderStatusChip("Transferências", statement.transferCount, "transfer")}
              </div>
            </div>
            <div class="statement-list">
              ${
                groupedTransactions
                  .map(
                    (group) => `
                    <section class="statement-day" aria-label="${escapeHtml(formatDate(group.date))}">
                      <header>
                        <time datetime="${escapeHtml(group.date)}">${formatDate(group.date)}</time>
                        <strong class="${group.totalMinor < 0 ? "amount-debit" : "amount-credit"}">${formatMoney(group.totalMinor)}</strong>
                      </header>
                      <div class="statement-day-rows">
                        ${group.transactions
                          .map((transaction) =>
                            renderStatementRow(transaction, selectedAccount?.id, accountOptions, categoryOptions),
                          )
                          .join("")}
                      </div>
                    </section>
                  `,
                  )
                  .join("") || renderEmptyState("Nenhuma movimentação no extrato.", "Registre a primeira movimentação para acompanhar o saldo desta conta.")
              }
            </div>
          </section>
          <section id="novo-lancamento" class="panel form-panel statement-form-panel">
            <div>
              <p class="eyebrow">Atualizar extrato</p>
              <h2>Novo lançamento</h2>
            </div>
            <form data-api-form data-api-path="/api/transactions">
              <label>Tipo
                <select name="kind" required>
                  ${renderTransactionKindOptions()}
                </select>
              </label>
              <label>Valor (R$)<input name="amountMinor" data-money type="text" inputmode="decimal" required placeholder="0,00" /></label>
              <label>Data<input name="occurredOn" type="date" required /></label>
              <label>Conta
                <select name="accountId" required>
                  ${renderAccountOptions(accountOptions)}
                </select>
              </label>
              <label>Conta de destino
                <select name="destinationAccountId">
                  <option value="">Apenas para transferências</option>
                  ${renderAccountOptions(accountOptions)}
                </select>
              </label>
              <label>Categoria
                <select name="categoryId">
                  <option value="">Sem categoria</option>
                  ${renderCategoryOptions(categoryOptions)}
                </select>
              </label>
              <label class="full-span">Descrição<input name="description" placeholder="Ex.: Energia elétrica, salário, transferência" /></label>
              <button type="submit">Adicionar ao extrato</button>
            </form>
          </section>
        </div>
      </section>
      ${apiFormScript()}
    `,
  });
}

export async function renderCardsPage(token: string): Promise<string> {
  const [cards, accounts, categories] = await Promise.all([
    apiGet<{ cards: CardRecord[] }>(token, "/api/cards?status=all"),
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts"),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories?kind=expense"),
  ]);

  if (!cards.ok) {
    return renderApiErrorPage("/cartoes", "Cartões", cards.error);
  }

  const accountOptions = accounts.ok ? accounts.data.accounts : [];
  const categoryOptions = categories.ok ? categories.data.categories : [];

  return renderAuthenticatedPage({
    pathname: "/cartoes",
    currentLabel: "Cartões",
    content: `
      ${renderPageHeading({
        eyebrow: "Crédito com previsibilidade",
        title: "Cartões",
        description: "Organize cartões de crédito, dias de fechamento e vencimento.",
      })}
      <section class="workspace-grid wide-form">
        <section class="panel list-panel">
          <div class="section-heading">
            <h2>Cartões cadastrados</h2>
            <span>${cards.data.cards.length} itens</span>
          </div>
          <div class="rows maintenance-rows">
            ${
              cards.data.cards
                .map((card) => renderCardRow(card, accountOptions, categoryOptions))
                .join("") || renderEmptyState("Nenhum cartão cadastrado.", "Cadastre cartões para acompanhar faturas e vencimentos.")
            }
          </div>
        </section>
        <section class="panel form-panel">
          <h2>Novo cartão</h2>
          <form data-api-form data-api-path="/api/cards">
            <label>Nome<input name="name" required /></label>
            <label>Dia de fechamento<input name="closingDay" type="number" min="1" max="31" required /></label>
            <label>Dia de vencimento<input name="dueDay" type="number" min="1" max="31" required /></label>
            <label>Conta de pagamento
              <select name="paymentAccountId">
                <option value="">-</option>
                ${renderAccountOptions(accountOptions)}
              </select>
            </label>
            <button type="submit">Criar cartão</button>
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
    return renderApiErrorPage("/orcamentos", "Orçamentos", budgets.error);
  }

  const categoryOptions = categories.ok ? categories.data.categories : [];

  return renderAuthenticatedPage({
    pathname: "/orcamentos",
    currentLabel: "Orçamentos",
    content: `
      ${renderPageHeading({
        eyebrow: "Planejamento mensal",
        title: "Orçamentos",
        description: "Acompanhe limites planejados por categoria de despesa.",
      })}
      <section class="workspace-grid wide-form">
        <section class="panel list-panel">
          <div class="section-heading">
            <h2>Limites planejados</h2>
            <span>${budgets.data.budgets.length} itens</span>
          </div>
          <div class="rows maintenance-rows">
            ${
              budgets.data.budgets
                .map((budget) => renderBudgetRow(budget, categoryOptions))
                .join("") || renderEmptyState("Nenhum orçamento cadastrado.", "Crie limites mensais para acompanhar categorias de despesa.")
            }
          </div>
        </section>
        <section class="panel form-panel">
          <h2>Novo orçamento</h2>
          <form data-api-form data-api-path="/api/budgets">
            <label>Categoria
              <select name="categoryId" required>
                ${renderCategoryOptions(categoryOptions)}
              </select>
            </label>
            <label>Início do período<input name="periodStartOn" type="date" required /></label>
            <label>Fim do período<input name="periodEndOn" type="date" required /></label>
            <label>Valor planejado (R$)<input name="plannedAmountMinor" data-money type="text" inputmode="decimal" required placeholder="0,00" /></label>
            <button type="submit">Criar orçamento</button>
          </form>
        </section>
      </section>
      ${apiFormScript()}
    `,
  });
}

function renderAccountRow(account: AccountRecord): string {
  return `
    <article class="maintenance-item">
      <div class="maintenance-summary">
        <div><strong>${escapeHtml(account.name)}</strong><span>${escapeHtml(formatAccountKind(account.kind))} - ${escapeHtml(formatGenericStatus(account.status))}</span></div>
        <strong>${formatMoney(account.openingBalanceMinor)}</strong>
      </div>
      <div class="maintenance-actions" aria-label="Ações da conta ${escapeHtml(account.name)}">
        <button type="button" class="secondary-button" data-api-action data-api-method="GET" data-api-path="/api/accounts/${escapeHtml(account.id)}">Abrir detalhe</button>
        <form data-api-form data-api-method="PATCH" data-api-path="/api/accounts/${escapeHtml(account.id)}" class="inline-edit-form">
          <label>Nome<input name="name" value="${escapeHtml(account.name)}" required /></label>
          <label>Tipo<select name="kind">${renderAccountKindOptions(account.kind)}</select></label>
          <label>Saldo inicial (R$)<input name="openingBalanceMinor" data-money value="${formatMoneyInput(account.openingBalanceMinor)}" inputmode="decimal" /></label>
          <button type="submit">Salvar edição</button>
        </form>
        ${account.status === "active" ? renderActionButton("Arquivar conta", `/api/accounts/${account.id}/archive`, "Arquivar esta conta? Ela deixará de aparecer nas operações ativas.") : ""}
      </div>
    </article>
  `;
}

function renderCategoryRow(category: CategoryRecord): string {
  const isArchived = category.status === "archived";

  return `
    <article class="maintenance-item">
      <div class="maintenance-summary">
        <div><strong>${escapeHtml(category.name)}</strong><span>${escapeHtml(formatCategoryKind(category.kind))} - ${escapeHtml(formatGenericStatus(category.status))}</span></div>
      </div>
      <div class="maintenance-actions" aria-label="Ações da categoria ${escapeHtml(category.name)}">
        <button type="button" class="secondary-button" data-api-action data-api-method="GET" data-api-path="/api/categories/${escapeHtml(category.id)}">Abrir detalhe</button>
        <form data-api-form data-api-method="PATCH" data-api-path="/api/categories/${escapeHtml(category.id)}" class="inline-edit-form">
          <label>Nome<input name="name" value="${escapeHtml(category.name)}" required /></label>
          <label>Tipo<select name="kind">${renderCategoryKindOptions(category.kind)}</select></label>
          <button type="submit">Salvar edição</button>
        </form>
        ${isArchived ? renderActionButton("Restaurar categoria", `/api/categories/${category.id}/restore`) : renderActionButton("Arquivar categoria", `/api/categories/${category.id}/archive`, "Arquivar esta categoria? Novos lançamentos não devem usá-la.")}
      </div>
    </article>
  `;
}

function renderStatementRow(
  transaction: TransactionRecord,
  selectedAccountId: string | undefined,
  accounts: AccountRecord[],
  categories: CategoryRecord[],
): string {
  const amountMinor = getSignedTransactionAmount(transaction, selectedAccountId);
  const amountClass = amountMinor < 0 ? "amount-debit" : amountMinor > 0 ? "amount-credit" : "amount-neutral";
  const description = transaction.description || "(sem descrição)";

  return `
    <article class="statement-row statement-row-with-actions">
      <span class="transaction-dot transaction-dot-${escapeHtml(transaction.kind)}" aria-hidden="true"></span>
      <div class="statement-row-main">
        <strong>${escapeHtml(description)}</strong>
        <span>${escapeHtml(formatTransactionKind(transaction.kind))} - ${escapeHtml(formatTransactionStatus(transaction.status))}</span>
      </div>
      <strong class="statement-amount ${amountClass}">${formatMoney(amountMinor)}</strong>
      <div class="statement-actions" aria-label="Ações do lançamento ${escapeHtml(description)}">
        <button type="button" class="secondary-button" data-api-action data-api-method="GET" data-api-path="/api/transactions/${escapeHtml(transaction.id)}">Abrir detalhe</button>
        <form data-api-form data-api-method="PATCH" data-api-path="/api/transactions/${escapeHtml(transaction.id)}" class="inline-edit-form statement-edit-form">
          <label>Descrição<input name="description" value="${escapeHtml(description)}" /></label>
          <label>Status<select name="status">${renderTransactionStatusOptions(transaction.status)}</select></label>
          <label>Conta<select name="accountId">${renderAccountOptions(accounts, transaction.accountId)}</select></label>
          <label>Categoria<select name="categoryId"><option value="">Sem categoria</option>${renderCategoryOptions(categories, transaction.categoryId)}</select></label>
          <button type="submit">Salvar edição</button>
        </form>
        ${transaction.status === "voided" ? "" : renderActionButton("Cancelar lançamento", `/api/transactions/${transaction.id}/void`, "Cancelar ou estornar este lançamento financeiro?")}
      </div>
    </article>
  `;
}

function renderCardRow(
  card: CardRecord,
  accounts: AccountRecord[],
  categories: CategoryRecord[],
): string {
  const canMutate = card.status === "active";

  return `
    <article class="maintenance-item">
      <div class="maintenance-summary">
        <div><strong>${escapeHtml(card.name)}</strong><span>Fecha dia ${card.closingDay}, vence dia ${card.dueDay} - ${escapeHtml(formatGenericStatus(card.status))}</span></div>
      </div>
      <div class="maintenance-actions" aria-label="Ações do cartão ${escapeHtml(card.name)}">
        <button type="button" class="secondary-button" data-api-action data-api-method="GET" data-api-path="/api/cards/${escapeHtml(card.id)}">Abrir detalhe</button>
        <form data-api-form data-api-method="PATCH" data-api-path="/api/cards/${escapeHtml(card.id)}" class="inline-edit-form">
          <label>Nome<input name="name" value="${escapeHtml(card.name)}" required /></label>
          <label>Fecha dia<input name="closingDay" type="number" min="1" max="31" value="${card.closingDay}" required /></label>
          <label>Vence dia<input name="dueDay" type="number" min="1" max="31" value="${card.dueDay}" required /></label>
          <label>Conta de pagamento<select name="paymentAccountId"><option value="">-</option>${renderAccountOptions(accounts, card.paymentAccountId)}</select></label>
          <button type="submit">Salvar edição</button>
        </form>
        ${canMutate ? renderActionButton("Bloquear cartão", `/api/cards/${card.id}/block`, "Bloquear este cartão?") : ""}
        ${canMutate ? renderActionButton("Arquivar cartão", `/api/cards/${card.id}/archive`, "Arquivar este cartão?") : ""}
        ${canMutate ? renderCardPurchaseForm(card, categories) : ""}
      </div>
    </article>
  `;
}

function renderCardPurchaseForm(card: CardRecord, categories: CategoryRecord[]): string {
  return `
    <form data-api-form data-api-path="/api/cards/${escapeHtml(card.id)}/purchases" class="inline-edit-form">
      <label>Compra em<input name="occurredOn" type="date" required /></label>
      <label>Valor (R$)<input name="amountMinor" data-money inputmode="decimal" required placeholder="0,00" /></label>
      <label>Descrição<input name="description" placeholder="Compra no cartão" required /></label>
      <label>Categoria<select name="categoryId"><option value="">Sem categoria</option>${renderCategoryOptions(categories)}</select></label>
      <button type="submit">Registrar compra</button>
    </form>
  `;
}

function renderBudgetRow(budget: BudgetRecord, categories: CategoryRecord[]): string {
  const isArchived = budget.status === "archived";

  return `
    <article class="maintenance-item">
      <div class="maintenance-summary">
        <div><strong>${formatDate(budget.periodStartOn)} - ${formatDate(budget.periodEndOn)}</strong><span>${escapeHtml(formatGenericStatus(budget.status))}</span></div>
        <strong>${formatMoney(budget.plannedAmountMinor)}</strong>
      </div>
      <div class="maintenance-actions" aria-label="Ações do orçamento">
        <button type="button" class="secondary-button" data-api-action data-api-method="GET" data-api-path="/api/budgets/${escapeHtml(budget.id)}">Abrir detalhe</button>
        <button type="button" class="secondary-button" data-api-action data-api-method="GET" data-api-path="/api/budgets/${escapeHtml(budget.id)}/usage">Consultar uso</button>
        <form data-api-form data-api-method="PATCH" data-api-path="/api/budgets/${escapeHtml(budget.id)}" class="inline-edit-form">
          <label>Categoria<select name="categoryId">${renderCategoryOptions(categories, budget.categoryId)}</select></label>
          <label>Início<input name="periodStartOn" type="date" value="${escapeHtml(budget.periodStartOn)}" required /></label>
          <label>Fim<input name="periodEndOn" type="date" value="${escapeHtml(budget.periodEndOn)}" required /></label>
          <label>Valor (R$)<input name="plannedAmountMinor" data-money value="${formatMoneyInput(budget.plannedAmountMinor)}" inputmode="decimal" required /></label>
          <button type="submit">Salvar edição</button>
        </form>
        ${isArchived ? "" : renderActionButton("Arquivar orçamento", `/api/budgets/${budget.id}/archive`, "Arquivar este orçamento?")}
      </div>
    </article>
  `;
}

function renderActionButton(label: string, path: string, confirmation?: string): string {
  return `<button type="button" class="secondary-button danger-action" data-api-action data-api-method="POST" data-api-path="${escapeHtml(path)}"${confirmation ? ` data-api-confirm="${escapeHtml(confirmation)}"` : ""}>${escapeHtml(label)}</button>`;
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
          <header class="topbar"><div><strong>${escapeHtml(input.currentLabel)}</strong><span>Usuário Demo SolverFin</span></div><button type="button" data-logout>Sair</button></header>
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
      function ensureStatus(container) {
        let status = container.querySelector(":scope > [data-form-status]");
        if (!status) {
          status = document.createElement("p");
          status.className = "form-status muted";
          status.setAttribute("data-form-status", "");
          status.setAttribute("aria-live", "polite");
          container.appendChild(status);
        }
        return status;
      }

      function buildPayload(form) {
        const payload = {};
        new FormData(form).forEach((value, key) => {
          if (value === "") return;
          const field = form.querySelector('[name="' + key + '"]');
          if (field && field.dataset.money !== undefined) {
            payload[key] = Math.round(parseFloat(String(value).replace(",", ".")) * 100);
          } else if (field && field.type === "number") {
            payload[key] = Number(value);
          } else {
            payload[key] = value;
          }
        });
        return payload;
      }

      async function readApiMessage(response) {
        const body = await response.json().catch(() => ({}));
        if (response.ok) return "Ação concluída. Atualizando a tela...";
        return (body.error && body.error.message) || "Não foi possível concluir a ação.";
      }

      document.querySelectorAll("[data-api-form]").forEach((form) => {
        const status = ensureStatus(form);

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const submitButton = form.querySelector('button[type="submit"]');
          const method = form.dataset.apiMethod || "POST";
          const payload = buildPayload(form);

          if (submitButton) submitButton.disabled = true;
          status.className = "form-status muted";
          status.textContent = "Salvando...";

          const response = await fetch(form.dataset.apiPath, {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });

          status.className = response.ok ? "form-status success" : "form-status error";
          status.textContent = await readApiMessage(response);
          if (response.ok) {
            window.setTimeout(() => window.location.reload(), 450);
            return;
          }
          if (submitButton) submitButton.disabled = false;
        });
      });

      document.querySelectorAll("[data-api-action]").forEach((button) => {
        const container = button.closest(".maintenance-actions, .statement-actions") || button.parentElement;
        const status = ensureStatus(container);

        button.addEventListener("click", async () => {
          const confirmation = button.dataset.apiConfirm;
          if (confirmation && !window.confirm(confirmation)) return;
          button.disabled = true;
          status.className = "form-status muted";
          status.textContent = "Enviando...";

          const response = await fetch(button.dataset.apiPath, {
            method: button.dataset.apiMethod || "POST",
            headers: { "content-type": "application/json" },
          });

          status.className = response.ok ? "form-status success" : "form-status error";
          status.textContent = await readApiMessage(response);
          if (response.ok && button.dataset.apiMethod !== "GET") {
            window.setTimeout(() => window.location.reload(), 450);
            return;
          }
          button.disabled = false;
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

function renderStatusChip(label: string, count: number, tone: string): string {
  return `<span class="status-chip status-chip-${escapeHtml(tone)}"><strong>${count}</strong>${escapeHtml(label)}</span>`;
}

function renderEmptyState(title: string, description: string): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(description)}</p></div>`;
}

export function renderNotFoundPage(): string {
  return renderPage({
    title: "Página não encontrada - SolverFin",
    body: `<main class="placeholder-state"><p class="eyebrow">404</p><h1>Página não encontrada</h1><p class="muted">Esta rota não faz parte do MVP navegável atual.</p><a class="button-link" href="/login">Voltar para entrada</a></main>`,
  });
}

function renderAccountKindOptions(selected?: string): string {
  return [
    ["checking", "Conta corrente"],
    ["savings", "Poupança"],
    ["cash", "Carteira"],
    ["investment", "Investimento"],
    ["other", "Outro"],
  ]
    .map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`)
    .join("");
}

function renderCategoryKindOptions(selected?: string): string {
  return [
    ["income", "Receita"],
    ["expense", "Despesa"],
    ["transfer", "Transferência"],
  ]
    .map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`)
    .join("");
}

function renderTransactionKindOptions(selected?: string): string {
  return [
    ["expense", "Despesa"],
    ["income", "Receita"],
    ["transfer", "Transferência"],
  ]
    .map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`)
    .join("");
}

function renderTransactionStatusOptions(selected?: string): string {
  return [
    ["planned", "Agendado"],
    ["posted", "Confirmado"],
    ["reconciled", "Conciliado"],
    ["suggested", "Pendente"],
  ]
    .map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`)
    .join("");
}

function renderAccountOptions(accounts: AccountRecord[], selected?: string): string {
  return accounts
    .map(
      (account) =>
        `<option value="${escapeHtml(account.id)}"${selected === account.id ? " selected" : ""}>${escapeHtml(account.name)}</option>`,
    )
    .join("");
}

function renderCategoryOptions(categories: CategoryRecord[], selected?: string): string {
  return categories
    .map(
      (category) =>
        `<option value="${escapeHtml(category.id)}"${selected === category.id ? " selected" : ""}>${escapeHtml(category.name)}</option>`,
    )
    .join("");
}

function formatMoney(amountMinor: number): string {
  return formatMinorCurrency(amountMinor);
}

function formatMoneyInput(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2).replace(".", ",");
}

function formatDate(date: string): string {
  return formatDateOnly(date);
}

function getSignedTransactionAmount(
  transaction: TransactionRecord,
  selectedAccountId: string | undefined,
): number {
  if (transaction.kind === "income") return transaction.amountMinor;
  if (transaction.kind === "expense") return -transaction.amountMinor;

  if (transaction.kind === "transfer") {
    if (selectedAccountId && transaction.destinationAccountId === selectedAccountId) {
      return transaction.amountMinor;
    }

    if (selectedAccountId && transaction.accountId === selectedAccountId) {
      return -transaction.amountMinor;
    }
  }

  return 0;
}

function summarizeStatement(
  transactions: TransactionRecord[],
  accounts: AccountRecord[],
  selectedAccountId: string | undefined,
): StatementSummary {
  const openingBalanceMinor = selectedAccountId
    ? (accounts.find((account) => account.id === selectedAccountId)?.openingBalanceMinor ?? 0)
    : accounts.reduce((total, account) => total + account.openingBalanceMinor, 0);

  return transactions.reduce<StatementSummary>(
    (summary, transaction) => {
      const signedAmountMinor = getSignedTransactionAmount(transaction, selectedAccountId);

      if (transaction.kind === "income") summary.incomeMinor += transaction.amountMinor;
      if (transaction.kind === "expense") summary.expenseMinor += transaction.amountMinor;
      if (transaction.kind === "transfer") {
        summary.transferMinor += signedAmountMinor;
        summary.transferCount += 1;
      }

      if (transaction.status === "posted" || transaction.status === "reconciled") {
        summary.confirmedCount += 1;
      } else {
        summary.pendingCount += 1;
      }

      summary.estimatedBalanceMinor += signedAmountMinor;
      return summary;
    },
    {
      openingBalanceMinor,
      incomeMinor: 0,
      expenseMinor: 0,
      transferMinor: 0,
      estimatedBalanceMinor: openingBalanceMinor,
      confirmedCount: 0,
      pendingCount: 0,
      transferCount: 0,
    },
  );
}

function groupTransactionsByDate(transactions: TransactionRecord[]): StatementDayGroup[] {
  const groups = new Map<string, TransactionRecord[]>();

  transactions
    .slice()
    .sort((left, right) => left.occurredOn.localeCompare(right.occurredOn))
    .forEach((transaction) => {
      const current = groups.get(transaction.occurredOn) ?? [];
      current.push(transaction);
      groups.set(transaction.occurredOn, current);
    });

  return Array.from(groups.entries()).map(([date, dayTransactions]) => ({
    date,
    transactions: dayTransactions,
    totalMinor: dayTransactions.reduce(
      (total, transaction) => total + getSignedTransactionAmount(transaction, undefined),
      0,
    ),
  }));
}

function formatAccountKind(kind: string): string {
  if (kind === "checking") return "Conta corrente";
  if (kind === "savings") return "Poupança";
  if (kind === "cash") return "Carteira";
  if (kind === "investment") return "Investimento";
  return kind;
}

function formatCategoryKind(kind: string): string {
  if (kind === "income") return "Receita";
  if (kind === "expense") return "Despesa";
  if (kind === "transfer") return "Transferência";
  return kind;
}

function formatTransactionKind(kind: string): string {
  if (kind === "income") return "Receita";
  if (kind === "expense") return "Despesa";
  if (kind === "transfer") return "Transferência";
  return kind;
}

function formatTransactionStatus(status: string): string {
  if (status === "planned") return "Agendado";
  if (status === "posted") return "Confirmado";
  if (status === "reconciled") return "Conciliado";
  if (status === "suggested") return "Pendente";
  if (status === "voided") return "Cancelado";
  return status;
}

function formatGenericStatus(status: string): string {
  if (status === "active") return "Ativo";
  if (status === "archived") return "Arquivado";
  if (status === "blocked") return "Bloqueado";
  if (status === "pending") return "Pendente";
  if (status === "cancelled") return "Cancelado";
  if (status === "closed") return "Fechado";
  return status;
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
  id: string;
  description: string;
  kind: string;
  status: string;
  amountMinor: number;
  occurredOn: string;
  accountId?: string;
  destinationAccountId?: string;
  categoryId?: string;
}

interface StatementSummary {
  openingBalanceMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  transferMinor: number;
  estimatedBalanceMinor: number;
  confirmedCount: number;
  pendingCount: number;
  transferCount: number;
}

interface StatementDayGroup {
  date: string;
  transactions: TransactionRecord[];
  totalMinor: number;
}

interface CardRecord {
  id: string;
  name: string;
  status: string;
  closingDay: number;
  dueDay: number;
  paymentAccountId?: string;
}

interface BudgetRecord {
  id: string;
  status: string;
  categoryId: string;
  periodStartOn: string;
  periodEndOn: string;
  plannedAmountMinor: number;
}

function baseCss(): string {
  return `
    :root { color-scheme: light; --bg: #f8fafc; --surface: #ffffff; --surface-soft: #eef5f8; --text: #0f172a; --muted: #475569; --line: #cbd5e1; --primary: #0f3d4c; --primary-soft: #e8f3f6; --cyan: #0891b2; --success: #166534; --success-bg: #dcfce7; --danger: #dc2626; --danger-bg: #fee2e2; --warning: #b45309; --warning-bg: #fef3c7; }
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
    .secondary-button { background: var(--primary-soft); border: 1px solid #d4e6ec; color: var(--primary); }
    .danger-action { background: var(--danger-bg); border-color: #fecaca; color: var(--danger); }
    .error { background: var(--danger-bg); border: 1px solid #fecaca; border-radius: 8px; color: var(--danger); padding: 10px 12px; }
    .success { background: var(--success-bg); border: 1px solid #bbf7d0; border-radius: 8px; color: var(--success); padding: 10px 12px; }
    .form-status { grid-column: 1 / -1; }
    .app-shell { display: grid; grid-template-columns: 248px minmax(0, 1fr); min-height: 100vh; } .sidebar { background: var(--primary); color: white; display: flex; flex-direction: column; gap: 22px; padding: 22px; }
    .brand { align-items: center; display: inline-flex; font-size: 1.2rem; font-weight: 900; min-height: 44px; text-decoration: none; } nav { display: grid; gap: 6px; } nav a { border-radius: 8px; color: rgba(255,255,255,.82); font-weight: 800; min-height: 40px; padding: 10px 12px; text-decoration: none; } nav a:hover, nav a[aria-current="page"] { background: rgba(34,211,238,.18); color: white; }
    .logout { background: rgba(255,255,255,.12); margin-top: auto; } .main-area { min-width: 0; } .topbar { align-items: center; background: rgba(255,255,255,.92); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; min-height: 64px; padding: 0 24px; position: sticky; top: 0; z-index: 5; } .topbar div { display: grid; gap: 2px; } .topbar span { color: var(--muted); font-size: .875rem; }
    main { display: grid; gap: 20px; margin: 0 auto; max-width: 1180px; padding: 24px; width: 100%; } .dashboard-heading, .page-heading, .statement-heading { align-items: end; display: flex; gap: 16px; justify-content: space-between; } .page-heading { align-items: start; display: grid; max-width: 760px; } .statement-heading { align-items: center; } .statement-heading > div { display: grid; gap: 6px; max-width: 760px; }
    .demo-pill { background: var(--success-bg); border-radius: 999px; color: var(--success); font-weight: 800; padding: 8px 12px; white-space: nowrap; }
    .summary-grid { display: grid; gap: 14px; grid-template-columns: repeat(4, minmax(0, 1fr)); } .metric-card { display: grid; gap: 8px; min-width: 0; } .metric-card span { color: var(--muted); font-size: .78rem; font-weight: 800; text-transform: uppercase; } .metric-card strong { color: var(--primary); font-size: 1.5rem; line-height: 1.2; overflow-wrap: anywhere; } .metric-card p { color: var(--muted); line-height: 1.45; }
    .workspace-grid { align-items: start; display: grid; gap: 18px; grid-template-columns: minmax(0, 1fr) minmax(19rem, .45fr); } .workspace-grid.wide-form { grid-template-columns: minmax(0, .95fr) minmax(22rem, .6fr); }
    .statement-layout { align-items: start; display: grid; gap: 18px; grid-template-columns: minmax(17rem, .42fr) minmax(0, 1fr); } .statement-sidebar, .statement-workspace { display: grid; gap: 18px; min-width: 0; }
    .account-period-panel { background: var(--primary); border-color: rgba(15, 61, 76, .3); color: white; } .account-switcher, .period-control { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .account-switcher div { display: grid; gap: 4px; min-width: 0; } .account-switcher span, .period-control span { color: rgba(255,255,255,.68); font-weight: 800; } .account-switcher strong { overflow-wrap: anywhere; } .account-code { background: rgba(255,255,255,.12); border-radius: 999px; padding: 6px 10px; white-space: nowrap; } .period-control { border-top: 1px solid rgba(255,255,255,.18); padding-top: 14px; }
    .statement-summary-panel { align-content: start; } .compact-heading { align-items: start; } .statement-totals { display: grid; gap: 10px; margin: 0; } .statement-totals div { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .statement-totals dt { color: var(--muted); } .statement-totals dd { font-weight: 900; margin: 0; text-align: right; } .statement-totals .total-line { border-top: 1px solid var(--line); padding-top: 12px; }
    .reconciliation-note { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: 8px; display: grid; gap: 6px; padding: 12px; } .reconciliation-note span { color: var(--cyan); font-size: .76rem; font-weight: 900; text-transform: uppercase; }
    .statement-panel { padding: 0; overflow: hidden; } .statement-toolbar { align-items: start; border-bottom: 1px solid var(--line); display: flex; gap: 16px; justify-content: space-between; padding: 18px; } .statement-toolbar > div:first-child { display: grid; gap: 4px; min-width: 0; }
    .status-chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; } .status-chip { align-items: center; background: var(--primary-soft); border: 1px solid #d4e6ec; border-radius: 999px; color: var(--primary); display: inline-flex; gap: 6px; font-size: .8rem; font-weight: 800; min-height: 32px; padding: 6px 10px; white-space: nowrap; } .status-chip strong { color: inherit; }
    .status-chip-pending { background: var(--warning-bg); border-color: #fde68a; color: var(--warning); } .status-chip-confirmed { background: var(--success-bg); border-color: #bbf7d0; color: var(--success); } .status-chip-transfer { background: #e0f2fe; border-color: #bae6fd; color: #0369a1; }
    .statement-list { display: grid; } .statement-day { display: grid; } .statement-day header { align-items: center; background: #f1f7fa; border-bottom: 1px solid var(--line); display: flex; gap: 12px; justify-content: space-between; min-height: 44px; padding: 0 18px; } .statement-day time { color: var(--primary); font-weight: 900; } .statement-day-rows { display: grid; }
    .statement-row { align-items: start; border-bottom: 1px solid var(--line); display: grid; gap: 12px; grid-template-columns: auto minmax(0, 1fr) auto; min-width: 0; padding: 13px 18px; } .statement-row-main { display: grid; gap: 4px; min-width: 0; } .statement-row-main strong { overflow-wrap: anywhere; } .statement-row-main span { color: var(--muted); font-size: .88rem; line-height: 1.35; } .statement-amount { text-align: right; white-space: nowrap; }
    .statement-row-with-actions { grid-template-columns: auto minmax(0, 1fr) auto; } .statement-actions { border-top: 1px solid var(--line); display: grid; gap: 10px; grid-column: 2 / -1; padding-top: 10px; }
    .transaction-dot { border-radius: 999px; height: 10px; margin-top: 6px; width: 10px; } .transaction-dot-income { background: var(--success); } .transaction-dot-expense { background: var(--danger); } .transaction-dot-transfer { background: var(--cyan); }
    .amount-credit { color: var(--success); } .amount-debit { color: var(--danger); } .amount-neutral { color: var(--muted); }
    .statement-form-panel form { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .section-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .section-heading span { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: .78rem; font-weight: 800; padding: 6px 10px; white-space: nowrap; }
    .rows { display: grid; gap: 10px; } .row { align-items: center; border-top: 1px solid var(--line); display: flex; gap: 16px; justify-content: space-between; min-width: 0; padding-top: 10px; } .row:first-child { border-top: 0; padding-top: 0; } .row div { display: grid; gap: 4px; min-width: 0; } .row span { color: var(--muted); line-height: 1.45; } .row strong { overflow-wrap: anywhere; } .row > strong { text-align: right; white-space: nowrap; }
    .maintenance-rows { gap: 14px; } .maintenance-item { border-top: 1px solid var(--line); display: grid; gap: 12px; padding-top: 14px; } .maintenance-item:first-child { border-top: 0; padding-top: 0; } .maintenance-summary { align-items: start; display: flex; gap: 16px; justify-content: space-between; min-width: 0; } .maintenance-summary > div { display: grid; gap: 4px; min-width: 0; } .maintenance-summary span { color: var(--muted); line-height: 1.45; } .maintenance-summary > strong { text-align: right; white-space: nowrap; }
    .maintenance-actions { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: 8px; display: grid; gap: 10px; padding: 12px; }
    .inline-edit-form { align-items: end; display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); } .inline-edit-form button, .inline-edit-form .form-status { grid-column: 1 / -1; } .statement-edit-form { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .empty-state { background: var(--bg); border: 1px dashed var(--line); border-radius: 8px; display: grid; gap: 6px; padding: 16px; }
    .form-panel form { grid-template-columns: 1fr; } .wide-form .form-panel form { grid-template-columns: repeat(2, minmax(0, 1fr)); } .wide-form .form-panel button, .wide-form .full-span, .statement-form-panel button, .statement-form-panel .full-span { grid-column: 1 / -1; }
    .review-note { background: #f0fdf4; border-color: #bbf7d0; }
    @media (max-width: 1024px) { .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .workspace-grid, .workspace-grid.wide-form, .statement-layout { grid-template-columns: 1fr; } .wide-form .form-panel form, .statement-form-panel form, .statement-edit-form { grid-template-columns: repeat(2, minmax(0, 1fr)); } .statement-sidebar { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) { .app-shell { grid-template-columns: 1fr; } .sidebar { gap: 12px; padding: 12px 16px; position: sticky; top: 0; z-index: 10; } .sidebar .logout { display: none; } nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; } nav a { background: rgba(255,255,255,.1); flex: 0 0 auto; min-height: 44px; white-space: nowrap; } .topbar { min-height: 56px; padding: 0 16px; position: static; } .topbar button { display: none; } main { padding: 18px 16px 28px; } .summary-grid, .wide-form .form-panel form, .statement-form-panel form, .statement-sidebar, .inline-edit-form, .statement-edit-form { grid-template-columns: 1fr; } .dashboard-heading, .row, .section-heading, .statement-heading, .statement-toolbar, .maintenance-summary { align-items: stretch; display: grid; } .statement-heading .button-link { width: 100%; } .status-chips { justify-content: flex-start; } .statement-row, .statement-row-with-actions { grid-template-columns: auto minmax(0, 1fr); } .statement-amount { grid-column: 2; text-align: left; white-space: normal; } .statement-actions { grid-column: 1 / -1; } .row > strong, .maintenance-summary > strong { text-align: left; white-space: normal; } }
  `;
}
