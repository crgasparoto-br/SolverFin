import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

import { apiGet, type ApiFailure, type ApiSuccess } from "./api.js";
import { icon } from "./icons.js";
import { implementedRoutes, privateRoutes } from "./routes.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { dialogScript, sharedDialogStyles, sharedShellStyles } from "./shared-styles.js";

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

  const [summary, pendingItems, pendingReview, openInvoices] = await Promise.all([
    apiGet<FinancialSummary>(token, "/api/financial-summary"),
    apiGet<{ payablesReceivables: PendingPayableReceivable[] }>(
      token,
      "/api/payables-receivables?status=pending",
    ),
    apiGet<{ messages: unknown[] }>(token, "/api/bank-message-inbox?status=pending_review"),
    apiGet<{ invoices: OpenInvoice[] }>(token, "/api/invoices?status=open"),
  ]);

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
        </div>
        <span class="demo-pill">Demo seguro</span>
      </section>
      <section class="summary-grid" aria-label="Indicadores principais">
        ${renderMetricCard("Disponível estimado", summary.data.availableBalanceMinor, "Saldo das contas ativas")}
        ${renderMetricCard("Receitas do mês", summary.data.incomeMinor, "Entradas postadas no mês atual")}
        ${renderMetricCard("Despesas do mês", summary.data.expensesMinor, "Saídas postadas no mês atual")}
        ${renderMetricCard("Compromissos previstos", summary.data.plannedCommitmentsMinor, "Lançamentos planejados no mês")}
      </section>
      <section class="panel next-actions" aria-label="Próximas ações">
        <div class="section-heading">
          <h2>Próximas ações</h2>
        </div>
        ${renderNextActions(pendingItems, pendingReview, openInvoices)}
        <div class="quick-links" aria-label="Atalhos da rotina">
          <a class="button-link secondary-link" href="/lancamentos" title="Ver extrato de lançamentos">${icon("receipt", 14)} Extrato</a>
          <a class="button-link secondary-link" href="/cartoes" title="Gerenciar cartões de crédito">${icon("credit-card", 14)} Cartões</a>
          <a class="button-link secondary-link" href="/pagar-receber" title="Contas a pagar e a receber">${icon("dollar-sign", 14)} Pagar e receber</a>
          <a class="button-link secondary-link" href="/inbox" title="Inbox e revisão de lançamentos">${icon("inbox", 14)} Inbox</a>
        </div>
      </section>
      <section class="panel list-panel">
        <div class="section-heading">
          <h2>Itens recentes</h2>
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
    `,
  });
}

interface PendingPayableReceivable {
  kind: string;
  dueOn: string;
}

interface OpenInvoice {
  dueOn: string;
}

function renderNextActions(
  pendingItems:
    | ApiSuccess<{ payablesReceivables: PendingPayableReceivable[] }>
    | ApiFailure,
  pendingReview: ApiSuccess<{ messages: unknown[] }> | ApiFailure,
  openInvoices: ApiSuccess<{ invoices: OpenInvoice[] }> | ApiFailure,
): string {
  const payables = pendingItems.ok ? pendingItems.data.payablesReceivables : [];
  const reviewCount = pendingReview.ok ? pendingReview.data.messages.length : 0;
  const invoices = openInvoices.ok ? openInvoices.data.invoices : [];

  const actions = [
    payables.length > 0
      ? renderNextActionRow(
          `${payables.length} conta${payables.length === 1 ? "" : "s"} a pagar ou receber pendente${payables.length === 1 ? "" : "s"}`,
          `Próximo vencimento em ${formatDate(nearestDueDate(payables.map((item) => item.dueOn)))}.`,
          "/pagar-receber",
          "Ver pagar e receber",
        )
      : "",
    reviewCount > 0
      ? renderNextActionRow(
          `${reviewCount} ite${reviewCount === 1 ? "m" : "ns"} aguardando revisão na inbox`,
          "Confirme ou ajuste as sugestões antes de usá-las como lançamento.",
          "/inbox",
          "Abrir inbox",
        )
      : "",
    invoices.length > 0
      ? renderNextActionRow(
          `${invoices.length} fatura${invoices.length === 1 ? "" : "s"} de cartão em aberto`,
          `Próximo vencimento em ${formatDate(nearestDueDate(invoices.map((item) => item.dueOn)))}.`,
          "/cartoes",
          "Ver cartões",
        )
      : "",
  ].filter((row) => row !== "");

  if (actions.length === 0) {
    return renderEmptyState(
      "Nenhuma pendência agora.",
      "Contas, faturas e itens de revisão pendentes aparecerão aqui.",
    );
  }

  return `<div class="rows next-action-rows">${actions.join("")}</div>`;
}

function renderNextActionRow(
  title: string,
  description: string,
  href: string,
  linkLabel: string,
): string {
  return `
    <article class="row next-action-row">
      <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div>
      <a class="button-link secondary-link" href="${href}">${escapeHtml(linkLabel)}</a>
    </article>
  `;
}

function nearestDueDate(dates: string[]): string {
  return dates.slice().sort((left, right) => left.localeCompare(right))[0] ?? "";
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

  const categoryItems = categories.data.categories;

  return renderAuthenticatedPage({
    pathname: "/categorias",
    currentLabel: "Categorias",
    content: `
      ${renderPageHeading({
        eyebrow: "Padronizar classificação",
        title: "Categorias",
        description: "Organize receitas e despesas em categorias principais e detalhadas.",
      })}
      <section class="workspace-grid wide-form">
        <section class="panel list-panel">
          <div class="section-heading">
            <div>
              <h2>Categorias por hierarquia</h2>
              <p class="muted">Categorias arquivadas permanecem visíveis aqui para preservar histórico.</p>
            </div>
            <span>${categoryItems.length} itens</span>
          </div>
          <div class="category-tree-list">
            ${renderCategoryTree(categoryItems)}
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
            <label class="full-span">Categoria superior
              <select name="parentCategoryId">
                <option value="">Categoria principal</option>
                ${renderCategoryParentOptions(categoryItems)}
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
      <section class="budgets-heading">
        <div>
          <p class="eyebrow">Planejamento mensal</p>
          <h1>Orçamentos</h1>
          <p class="muted">Acompanhe limites planejados por categoria de despesa.</p>
        </div>
        <button type="button" data-open-dialog="new-budget-dialog" title="Criar novo orçamento de categoria">${icon("plus", 14)} Novo orçamento</button>
      </section>
      <section class="panel list-panel">
        <div class="section-heading">
          <h2>Limites planejados</h2>
          <span>${budgets.data.budgets.length} itens</span>
        </div>
        <div class="rows maintenance-rows">
          ${
            budgets.data.budgets
              .map((budget) => renderBudgetRow(budget))
              .join("") || renderEmptyState("Nenhum orçamento cadastrado.", "Crie limites mensais para acompanhar categorias de despesa.")
          }
        </div>
      </section>
      ${renderNewBudgetDialog(categoryOptions)}
      ${budgets.data.budgets.map((budget) => renderBudgetEditDialog(budget, categoryOptions)).join("")}
      ${apiFormScript()}
      ${dialogScript()}
    `,
  });
}

function renderNewBudgetDialog(categories: CategoryRecord[]): string {
  return `
    <dialog id="new-budget-dialog" class="master-dialog" aria-labelledby="new-budget-title">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
        <p class="eyebrow">Novo cadastro</p>
        <h2 id="new-budget-title">Novo orçamento</h2>
      </div>
      <form data-api-form data-api-path="/api/budgets" class="edit-grid">
        <label>Categoria
          <select name="categoryId" required>
            ${renderCategoryOptions(categories)}
          </select>
        </label>
        <label>Início do período<input name="periodStartOn" type="date" required /></label>
        <label>Fim do período<input name="periodEndOn" type="date" required /></label>
        <label>Valor planejado (R$)<input name="plannedAmountMinor" data-money type="text" inputmode="decimal" required placeholder="0,00" /></label>
        <button type="submit">Criar orçamento</button>
      </form>
    </dialog>
  `;
}

function renderBudgetEditDialog(budget: BudgetRecord, categories: CategoryRecord[]): string {
  const dialogId = `edit-budget-dialog-${budget.id}`;
  const titleId = `${dialogId}-title`;

  return `
    <dialog id="${escapeHtml(dialogId)}" class="master-dialog" aria-labelledby="${escapeHtml(titleId)}">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
        <p class="eyebrow">Editar cadastro</p>
        <h2 id="${escapeHtml(titleId)}">${formatDate(budget.periodStartOn)} - ${formatDate(budget.periodEndOn)}</h2>
      </div>
      <form data-api-form data-api-method="PATCH" data-api-path="/api/budgets/${escapeHtml(budget.id)}" class="edit-grid">
        <label>Categoria<select name="categoryId">${renderCategoryOptions(categories, budget.categoryId)}</select></label>
        <label>Início<input name="periodStartOn" type="date" value="${escapeHtml(budget.periodStartOn)}" required /></label>
        <label>Fim<input name="periodEndOn" type="date" value="${escapeHtml(budget.periodEndOn)}" required /></label>
        <label>Valor (R$)<input name="plannedAmountMinor" data-money value="${formatMoneyInput(budget.plannedAmountMinor)}" inputmode="decimal" required /></label>
        <button type="submit">Salvar edição</button>
      </form>
    </dialog>
  `;
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

function renderCategoryTree(categories: CategoryRecord[]): string {
  const visibleKinds = ["expense", "income", "transfer"];
  const content = visibleKinds
    .map((kind) => {
      const categoriesForKind = categories.filter((category) => category.kind === kind);
      const rootCategories = categoriesForKind.filter((category) => !category.parentCategoryId);

      if (categoriesForKind.length === 0) {
        return "";
      }

      return `
        <section class="category-kind-group" aria-label="${escapeHtml(formatCategoryKind(kind))}">
          <header><h3>${escapeHtml(formatCategoryKind(kind))}</h3><span>${categoriesForKind.length} categorias</span></header>
          <div class="category-tree-nodes">
            ${
              rootCategories
                .map((category) => renderCategoryTreeNode(category, categories))
                .join("") || renderEmptyState("Nenhuma categoria principal.", "Crie uma categoria sem superior para começar este grupo.")
            }
          </div>
        </section>
      `;
    })
    .join("");

  return content || renderEmptyState("Nenhuma categoria cadastrada.", "Crie categorias para organizar receitas e despesas.");
}

function renderCategoryTreeNode(category: CategoryRecord, categories: CategoryRecord[]): string {
  const children = categories
    .filter((candidate) => candidate.parentCategoryId === category.id)
    .sort((left, right) => left.name.localeCompare(right.name));
  const isArchived = category.status === "archived";

  return `
    <article class="category-tree-node ${category.parentCategoryId ? "category-tree-child" : ""}">
      <div class="maintenance-summary">
        <div>
          <strong>${escapeHtml(category.name)}</strong>
          <span>${category.parentCategoryId ? "Categoria detalhada" : "Categoria principal"} - ${escapeHtml(formatGenericStatus(category.status))}</span>
        </div>
        <span class="category-path">${escapeHtml(getCategoryDisplayName(category, categories))}</span>
      </div>
      <div class="maintenance-actions" aria-label="Ações da categoria ${escapeHtml(category.name)}">
        <button type="button" class="secondary-button" data-api-action data-api-method="GET" data-api-path="/api/categories/${escapeHtml(category.id)}">Abrir detalhe</button>
        <form data-api-form data-api-method="PATCH" data-api-path="/api/categories/${escapeHtml(category.id)}" class="inline-edit-form">
          <label>Nome<input name="name" value="${escapeHtml(category.name)}" required /></label>
          <label>Tipo<select name="kind">${renderCategoryKindOptions(category.kind)}</select></label>
          <label>Categoria superior<select name="parentCategoryId"><option value="">Categoria principal</option>${renderCategoryParentOptions(categories, category)}</select></label>
          <button type="submit">Salvar edição</button>
        </form>
        ${isArchived ? renderActionButton("Restaurar categoria", `/api/categories/${category.id}/restore`) : renderActionButton("Arquivar categoria", `/api/categories/${category.id}/archive`, "Arquivar esta categoria? Novos lançamentos não devem usá-la.")}
      </div>
      ${children.length > 0 ? `<div class="category-tree-children">${children.map((child) => renderCategoryTreeNode(child, categories)).join("")}</div>` : ""}
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

function renderBudgetRow(budget: BudgetRecord): string {
  const isArchived = budget.status === "archived";

  return `
    <article class="maintenance-item">
      <div class="maintenance-summary">
        <div><strong>${formatDate(budget.periodStartOn)} - ${formatDate(budget.periodEndOn)}</strong><span>${escapeHtml(formatGenericStatus(budget.status))}</span></div>
        <strong>${formatMoney(budget.plannedAmountMinor)}</strong>
      </div>
      <div class="maintenance-actions" aria-label="Ações do orçamento">
        <button type="button" class="secondary-button" data-api-action data-api-method="GET" data-api-path="/api/budgets/${escapeHtml(budget.id)}" title="Ver detalhes deste orçamento">${icon("eye", 13)} Detalhe</button>
        <button type="button" class="secondary-button" data-api-action data-api-method="GET" data-api-path="/api/budgets/${escapeHtml(budget.id)}/usage" title="Ver uso do orçamento">${icon("bar-chart-2", 13)} Uso</button>
        <button type="button" class="icon-button" data-open-dialog="edit-budget-dialog-${escapeHtml(budget.id)}" title="Editar orçamento" aria-label="Editar orçamento">${icon("pencil", 14)}</button>
        ${isArchived ? "" : renderActionButton("Arquivar", `/api/budgets/${budget.id}/archive`, "Arquivar este orçamento?")}
      </div>
    </article>
  `;
}

function renderEditIcon(): string {
  return `<svg class="action-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 20h4.8L19.2 9.6a2.7 2.7 0 0 0 0-3.8l-1-1a2.7 2.7 0 0 0-3.8 0L4 15.2V20zm2-2v-2l9.8-9.8c.3-.3.7-.3 1 0l1 1c.3.3.3.7 0 1L8 18H6z" fill="currentColor"/></svg>`;
}

function renderActionButton(label: string, path: string, confirmation?: string): string {
  const isArchive = path.includes("/archive");
  const iconHtml = isArchive ? icon("archive", 13) + " " : "";
  const titleAttr = confirmation ? ` title="${escapeHtml(confirmation)}"` : "";
  return `<button type="button" class="secondary-button danger-action" data-api-action data-api-method="POST" data-api-path="${escapeHtml(path)}"${confirmation ? ` data-api-confirm="${escapeHtml(confirmation)}"` : ""}${titleAttr}>${iconHtml}${escapeHtml(label)}</button>`;
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
  return renderAuthenticatedShellDocument({
    activePathname: input.pathname,
    content: input.content,
    currentLabel: input.currentLabel,
    styles: baseCss(),
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
          if (value === "") {
            if (key === "parentCategoryId") payload[key] = null;
            return;
          }
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
    ${faviconLinks()}
    <title>${escapeHtml(input.title)}</title>
    <style>${baseCss()}</style>
  </head>
  <body>${input.body}</body>
</html>`;
}

export function faviconLinks(): string {
  return `<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />`;
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

function renderCategoryParentOptions(
  categories: CategoryRecord[],
  currentCategory?: CategoryRecord,
): string {
  return categories
    .filter((category) => category.id !== currentCategory?.id)
    .sort((left, right) => getCategoryDisplayName(left, categories).localeCompare(getCategoryDisplayName(right, categories)))
    .map((category) => {
      const selected = currentCategory?.parentCategoryId === category.id ? " selected" : "";
      const archived = category.status === "archived" ? " - arquivada" : "";
      return `<option value="${escapeHtml(category.id)}"${selected}>${escapeHtml(formatCategoryKind(category.kind))} - ${escapeHtml(getCategoryDisplayName(category, categories))}${archived}</option>`;
    })
    .join("");
}

function renderCategoryOptions(categories: CategoryRecord[], selected?: string): string {
  return categories
    .slice()
    .sort((left, right) => getCategoryDisplayName(left, categories).localeCompare(getCategoryDisplayName(right, categories)))
    .map(
      (category) =>
        `<option value="${escapeHtml(category.id)}"${selected === category.id ? " selected" : ""}>${escapeHtml(getCategoryDisplayName(category, categories))}</option>`,
    )
    .join("");
}

function getCategoryDisplayName(category: CategoryRecord, categories: readonly CategoryRecord[]): string {
  const path = [category.name];
  const visitedCategoryIds = new Set<string>([category.id]);
  let parentCategoryId = category.parentCategoryId;

  while (parentCategoryId) {
    if (visitedCategoryIds.has(parentCategoryId)) {
      break;
    }

    const parentCategory = categories.find((candidate) => candidate.id === parentCategoryId);

    if (!parentCategory) {
      break;
    }

    path.unshift(parentCategory.name);
    visitedCategoryIds.add(parentCategory.id);
    parentCategoryId = parentCategory.parentCategoryId;
  }

  return path.join(" > ");
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
  parentCategoryId?: string;
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
    ${sharedShellStyles()}
    ${sharedDialogStyles()}
    .login-shell, .placeholder-state { align-items: center; display: grid; min-height: 100vh; padding: 24px; }
    .placeholder-state { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
    .login-shell .panel { gap: 18px; margin: 0 auto; max-width: 460px; width: 100%; }
    main { display: grid; gap: 14px; margin: 0 auto; max-width: 1440px; padding: 18px 20px; width: 100%; } .dashboard-heading, .page-heading, .statement-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .page-heading { align-items: start; display: grid; max-width: 760px; } .statement-heading { align-items: center; } .statement-heading > div { display: grid; gap: 4px; max-width: 760px; }
    .budgets-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .budgets-heading > div { display: grid; gap: 4px; max-width: 760px; }
    .item-actions { display: flex; gap: 6px; justify-content: flex-end; }
    .demo-pill { background: var(--success-bg); border-radius: 999px; color: var(--success); font-size: 0.75rem; font-weight: 700; padding: 3px 10px; white-space: nowrap; }
    .secondary-link { background: var(--primary-soft); border: 1px solid #d4e6ec; color: var(--primary); }
    .next-actions { gap: 10px; } .next-action-rows { gap: 8px; } .next-action-row { gap: 10px; }
    .quick-links { display: flex; flex-wrap: wrap; gap: 6px; }
    .summary-grid { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); } .metric-card { display: grid; gap: 5px; min-width: 0; } .metric-card span { color: var(--muted); font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; } .metric-card strong { color: var(--primary); font-size: 1.25rem; font-weight: 700; line-height: 1.1; overflow-wrap: anywhere; } .metric-card p { color: var(--muted); font-size: 0.8125rem; line-height: 1.4; }
    .workspace-grid { align-items: start; display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr) minmax(17rem, .45fr); } .workspace-grid.wide-form { grid-template-columns: minmax(0, .95fr) minmax(20rem, .6fr); }
    .statement-layout { align-items: start; display: grid; gap: 14px; grid-template-columns: minmax(15rem, .42fr) minmax(0, 1fr); } .statement-sidebar, .statement-workspace { display: grid; gap: 14px; min-width: 0; }
    .account-period-panel { background: var(--primary); border-color: rgba(15, 61, 76, .3); color: white; } .account-switcher, .period-control { align-items: center; display: flex; gap: 10px; justify-content: space-between; } .account-switcher div { display: grid; gap: 3px; min-width: 0; } .account-switcher span, .period-control span { color: rgba(255,255,255,.68); font-size: 0.75rem; font-weight: 700; } .account-switcher strong { font-size: 0.875rem; overflow-wrap: anywhere; } .account-code { background: rgba(255,255,255,.12); border-radius: 999px; font-size: 0.75rem; padding: 3px 8px; white-space: nowrap; } .period-control { border-top: 1px solid rgba(255,255,255,.18); padding-top: 10px; }
    .statement-summary-panel { align-content: start; } .compact-heading { align-items: start; } .statement-totals { display: grid; gap: 10px; margin: 0; } .statement-totals div { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .statement-totals dt { color: var(--muted); } .statement-totals dd { font-weight: 900; margin: 0; text-align: right; } .statement-totals .total-line { border-top: 1px solid var(--line); padding-top: 12px; }
    .reconciliation-note { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: 8px; display: grid; gap: 6px; padding: 12px; } .reconciliation-note span { color: var(--cyan); font-size: .76rem; font-weight: 900; text-transform: uppercase; }
    .statement-panel { padding: 0; overflow: hidden; } .statement-toolbar { align-items: center; border-bottom: 1px solid var(--line); display: flex; gap: 12px; justify-content: space-between; padding: 12px 14px; } .statement-toolbar > div:first-child { display: grid; gap: 3px; min-width: 0; }
    .status-chips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; } .status-chip { align-items: center; background: var(--primary-soft); border: 1px solid #d4e6ec; border-radius: 999px; color: var(--primary); display: inline-flex; gap: 5px; font-size: 0.75rem; font-weight: 700; min-height: 26px; padding: 2px 8px; white-space: nowrap; } .status-chip strong { color: inherit; }
    .status-chip-pending { background: var(--warning-bg); border-color: #fde68a; color: var(--warning); } .status-chip-confirmed { background: var(--success-bg); border-color: #bbf7d0; color: var(--success); } .status-chip-transfer { background: #e0f2fe; border-color: #bae6fd; color: #0369a1; }
    .statement-list { display: grid; } .statement-day { display: grid; } .statement-day header { align-items: center; background: #f1f7fa; border-bottom: 1px solid var(--line); display: flex; gap: 10px; justify-content: space-between; min-height: 34px; padding: 0 14px; } .statement-day time { color: var(--primary); font-size: 0.8125rem; font-weight: 700; } .statement-day-rows { display: grid; }
    .statement-row { align-items: start; border-bottom: 1px solid var(--line); display: grid; gap: 10px; grid-template-columns: auto minmax(0, 1fr) auto; min-width: 0; padding: 9px 14px; } .statement-row-main { display: grid; gap: 3px; min-width: 0; } .statement-row-main strong { font-size: 0.875rem; overflow-wrap: anywhere; } .statement-row-main span { color: var(--muted); font-size: 0.8125rem; line-height: 1.35; } .statement-amount { font-size: 0.875rem; text-align: right; white-space: nowrap; }
    .statement-row-with-actions { grid-template-columns: auto minmax(0, 1fr) auto; } .statement-actions { border-top: 1px solid var(--line); display: grid; gap: 10px; grid-column: 2 / -1; padding-top: 10px; }
    .transaction-dot { border-radius: 999px; height: 10px; margin-top: 6px; width: 10px; } .transaction-dot-income { background: var(--success); } .transaction-dot-expense { background: var(--danger); } .transaction-dot-transfer { background: var(--cyan); }
    .amount-credit { color: var(--success); } .amount-debit { color: var(--danger); } .amount-neutral { color: var(--muted); }
    .statement-form-panel form { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .section-heading { align-items: center; display: flex; gap: 10px; justify-content: space-between; } .section-heading span { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: 0.6875rem; font-weight: 700; padding: 2px 8px; white-space: nowrap; }
    .rows { display: grid; gap: 8px; } .row { align-items: center; border-top: 1px solid var(--line); display: flex; gap: 12px; justify-content: space-between; min-width: 0; padding-top: 8px; } .row:first-child { border-top: 0; padding-top: 0; } .row div { display: grid; gap: 3px; min-width: 0; } .row span { color: var(--muted); font-size: 0.8125rem; line-height: 1.4; } .row strong { font-size: 0.875rem; overflow-wrap: anywhere; } .row > strong { text-align: right; white-space: nowrap; }
    .maintenance-rows { gap: 10px; } .maintenance-item, .category-tree-node { border-top: 1px solid var(--line); display: grid; gap: 10px; padding-top: 10px; } .maintenance-item:first-child, .category-tree-node:first-child { border-top: 0; padding-top: 0; } .maintenance-summary { align-items: start; display: flex; gap: 12px; justify-content: space-between; min-width: 0; } .maintenance-summary > div { display: grid; gap: 3px; min-width: 0; } .maintenance-summary span { color: var(--muted); font-size: 0.8125rem; line-height: 1.4; } .maintenance-summary > strong { font-size: 0.9375rem; text-align: right; white-space: nowrap; }
    .maintenance-actions { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: var(--radius); display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; }
    .category-tree-list { display: grid; gap: 14px; } .category-kind-group { display: grid; gap: 10px; } .category-kind-group header { align-items: center; display: flex; gap: 10px; justify-content: space-between; } .category-kind-group header span, .category-path { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: 0.6875rem; font-weight: 700; max-width: 100%; overflow-wrap: anywhere; padding: 2px 8px; } .category-tree-nodes, .category-tree-children { display: grid; gap: 10px; } .category-tree-children { border-left: 2px solid var(--line); margin-left: 10px; padding-left: 12px; } .category-tree-child { border-top-style: dashed; }
    .inline-edit-form { align-items: end; display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); } .inline-edit-form button, .inline-edit-form .form-status { grid-column: 1 / -1; } .statement-edit-form { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .empty-state { background: var(--bg); border: 1px dashed var(--line); border-radius: 8px; display: grid; gap: 6px; padding: 16px; }
    .form-panel form { grid-template-columns: 1fr; } .wide-form .form-panel form { grid-template-columns: repeat(2, minmax(0, 1fr)); } .wide-form .form-panel button, .wide-form .full-span, .statement-form-panel button, .statement-form-panel .full-span { grid-column: 1 / -1; }
    .review-note { background: #f0fdf4; border-color: #bbf7d0; }
    @media (max-width: 1024px) { .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .workspace-grid, .workspace-grid.wide-form, .statement-layout { grid-template-columns: 1fr; } .wide-form .form-panel form, .statement-form-panel form, .statement-edit-form { grid-template-columns: repeat(2, minmax(0, 1fr)); } .statement-sidebar { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) { main { padding: 14px 14px 24px; } .summary-grid, .wide-form .form-panel form, .statement-form-panel form, .statement-sidebar, .inline-edit-form, .statement-edit-form { grid-template-columns: 1fr; } .dashboard-heading, .row, .section-heading, .statement-heading, .statement-toolbar, .maintenance-summary, .budgets-heading { align-items: stretch; display: grid; } .statement-heading .button-link { width: 100%; } .status-chips { justify-content: flex-start; } .statement-row, .statement-row-with-actions { grid-template-columns: auto minmax(0, 1fr); } .statement-amount { grid-column: 2; text-align: left; white-space: normal; } .statement-actions { grid-column: 1 / -1; } .row > strong, .maintenance-summary > strong { text-align: left; white-space: normal; } .category-kind-group header { align-items: stretch; display: grid; } }
  `;
}
