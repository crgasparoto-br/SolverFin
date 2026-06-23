import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { privateRoutes } from "./routes.js";

interface InvoiceOperation {
  invoice: InvoiceRecord;
  summary: InvoiceSummaryRecord;
  purchases: CardPurchaseRecord[];
  summaryError?: string;
  purchasesError?: string;
}

export async function renderCardsPage(token: string): Promise<string> {
  const [cards, invoices, accounts, categories] = await Promise.all([
    apiGet<{ cards: CardRecord[] }>(token, "/api/cards?status=all"),
    apiGet<{ invoices: InvoiceRecord[] }>(token, "/api/invoices?status=all"),
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts"),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories?kind=expense"),
  ]);

  if (!cards.ok) return renderApiErrorPage("/cartoes", "Cartões", cards.error);
  if (!invoices.ok) return renderApiErrorPage("/cartoes", "Cartões", invoices.error);

  const cardItems = cards.data.cards;
  const invoiceItems = invoices.data.invoices;
  const accountOptions = accounts.ok ? accounts.data.accounts : [];
  const categoryOptions = categories.ok ? categories.data.categories : [];
  const invoiceOperations = await loadInvoiceOperations(token, invoiceItems);
  const selectedCardId = cardItems.find((card) => card.status === "active")?.id ?? cardItems[0]?.id;

  return renderAuthenticatedPage({
    pathname: "/cartoes",
    currentLabel: "Cartões",
    content: `
      <section class="cards-heading">
        <div>
          <p class="eyebrow">Rotina de cartões</p>
          <h1>Faturas e compras</h1>
          <p class="muted">Acompanhe a fatura por cartão, registre compras e faça a baixa usando uma conta vinculada.</p>
        </div>
        <a class="button-link" href="#nova-compra">Nova compra</a>
      </section>

      <section class="cards-workspace" aria-label="Operação de faturas de cartão">
        <aside class="card-selector" aria-label="Selecionar cartão">
          <div class="section-heading compact-heading">
            <h2>Cartões</h2>
            <span>${cardItems.length} itens</span>
          </div>
          <div class="card-tabs" role="tablist" aria-label="Cartões cadastrados">
            ${
              cardItems
                .map((card) =>
                  renderCardSelector(card, invoiceOperations, selectedCardId === card.id),
                )
                .join("") ||
              renderEmptyState(
                "Nenhum cartão cadastrado.",
                "Use Contas e Cartões para cadastrar cartões antes de operar faturas.",
              )
            }
          </div>
        </aside>

        <div class="invoice-area">
          ${
            cardItems
              .map((card) =>
                renderCardOperationSection({
                  card,
                  invoices: invoiceOperations.filter(
                    (operation) => operation.invoice.cardId === card.id,
                  ),
                  accounts: accountOptions,
                  categories: categoryOptions,
                  isSelected: selectedCardId === card.id,
                }),
              )
              .join("") ||
            renderEmptyState(
              "Sem cartões para operar.",
              "O cadastro de cartões fica em Contas e Cartões para manter esta tela focada na rotina.",
            )
          }
        </div>
      </section>

      ${apiFormScript()}
      ${cardsPageScript()}
    `,
  });
}

async function loadInvoiceOperations(
  token: string,
  invoices: InvoiceRecord[],
): Promise<InvoiceOperation[]> {
  return Promise.all(
    invoices.map(async (invoice) => {
      const [summary, purchases] = await Promise.all([
        apiGet<{ summary: InvoiceSummaryRecord }>(token, `/api/invoices/${invoice.id}/summary`),
        apiGet<{ purchases: CardPurchaseRecord[] }>(token, `/api/invoices/${invoice.id}/purchases`),
      ]);

      return {
        invoice,
        summary: summary.ok ? summary.data.summary : fallbackSummary(invoice),
        purchases: purchases.ok ? purchases.data.purchases : [],
        ...(summary.ok ? {} : { summaryError: summary.error }),
        ...(purchases.ok ? {} : { purchasesError: purchases.error }),
      };
    }),
  );
}

function renderCardSelector(
  card: CardRecord,
  operations: InvoiceOperation[],
  isSelected: boolean,
): string {
  const cardInvoices = operations.filter((operation) => operation.invoice.cardId === card.id);
  const openInvoice = cardInvoices.find((operation) => operation.invoice.status === "open");
  const totalDue = cardInvoices.reduce(
    (sum, operation) => sum + operation.summary.amountDueMinor,
    0,
  );

  return `
    <button type="button" class="card-tab" data-card-tab="${escapeHtml(card.id)}" aria-selected="${isSelected ? "true" : "false"}">
      <span>
        <strong>${escapeHtml(card.name)}</strong>
        <small>${escapeHtml(formatGenericStatus(card.status))}${card.maskedIdentifier ? ` · ${escapeHtml(card.maskedIdentifier)}` : ""}</small>
      </span>
      <span class="card-tab-meta">
        <strong>${formatMoney(totalDue)}</strong>
        <small>${openInvoice ? `Vence ${formatDate(openInvoice.invoice.dueOn)}` : `${cardInvoices.length} faturas`}</small>
      </span>
    </button>
  `;
}

function renderCardOperationSection(input: {
  card: CardRecord;
  invoices: InvoiceOperation[];
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  isSelected: boolean;
}): string {
  const sortedInvoices = [...input.invoices].sort((a, b) =>
    b.invoice.periodEndOn.localeCompare(a.invoice.periodEndOn),
  );
  const selectedInvoiceId =
    sortedInvoices.find((operation) => operation.invoice.status === "open")?.invoice.id ??
    sortedInvoices[0]?.invoice.id;
  const canMutateCard = input.card.status === "active";

  return `
    <section class="card-operation" data-card-section="${escapeHtml(input.card.id)}"${input.isSelected ? "" : " hidden"}>
      <div class="operation-topline">
        <div>
          <p class="eyebrow">Cartão selecionado</p>
          <h2>${escapeHtml(input.card.name)}</h2>
          <p class="muted">Fecha dia ${input.card.closingDay}, vence dia ${input.card.dueDay}${input.card.maskedIdentifier ? ` · ${escapeHtml(input.card.maskedIdentifier)}` : ""}</p>
        </div>
        <div class="period-controls" aria-label="Navegar entre faturas">
          <button type="button" class="secondary-button icon-button" data-invoice-step="previous" title="Fatura anterior" aria-label="Fatura anterior">‹</button>
          <button type="button" class="secondary-button icon-button" data-invoice-step="next" title="Próxima fatura" aria-label="Próxima fatura">›</button>
        </div>
      </div>

      <div class="card-actions" aria-label="Ações do cartão ${escapeHtml(input.card.name)}">
        ${canMutateCard ? renderActionButton("Bloquear cartão", `/api/cards/${input.card.id}/block`, "Bloquear este cartão?") : ""}
        ${canMutateCard ? renderActionButton("Arquivar cartão", `/api/cards/${input.card.id}/archive`, "Arquivar este cartão?") : ""}
      </div>

      <h2>Faturas</h2>
      <div class="invoice-tabs" role="tablist" aria-label="Faturas do cartão">
        ${
          sortedInvoices
            .map((operation) =>
              renderInvoiceTab(operation, operation.invoice.id === selectedInvoiceId),
            )
            .join("") || `<span class="muted">Nenhuma fatura gerada para este cartão.</span>`
        }
      </div>

      ${
        sortedInvoices
          .map((operation) =>
            renderInvoiceView({
              operation,
              card: input.card,
              accounts: input.accounts,
              categories: input.categories,
              isSelected: operation.invoice.id === selectedInvoiceId,
            }),
          )
          .join("") || renderNoInvoiceState(input.card, input.categories)
      }
    </section>
  `;
}

function renderInvoiceTab(operation: InvoiceOperation, isSelected: boolean): string {
  return `
    <button type="button" class="invoice-tab" data-invoice-tab="${escapeHtml(operation.invoice.id)}" aria-selected="${isSelected ? "true" : "false"}">
      <span>${formatDate(operation.invoice.periodEndOn)}</span>
      <strong>${formatMoney(operation.summary.amountDueMinor)}</strong>
    </button>
  `;
}

function renderInvoiceView(input: {
  operation: InvoiceOperation;
  card: CardRecord;
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  isSelected: boolean;
}): string {
  const { invoice, summary, purchases } = input.operation;
  const categoryNames = new Map(input.categories.map((category) => [category.id, category.name]));
  const canClose = invoice.status === "open";
  const canPay = invoice.status !== "paid" && invoice.status !== "cancelled";

  return `
    <section class="invoice-view" data-invoice-view="${escapeHtml(invoice.id)}"${input.isSelected ? "" : " hidden"}>
      <div class="invoice-main">
        <details class="purchase-form-panel" id="nova-compra">
          <summary>Nova compra</summary>
          ${renderCardPurchaseForm(input.card, input.categories)}
        </details>

        <section class="invoice-toolbar" aria-label="Filtros de compras">
          <label>Buscar<input type="search" data-purchase-search placeholder="Descrição ou categoria" /></label>
          <label>Status
            <select data-reconciliation-filter>
              <option value="all">Todas</option>
              <option value="unreconciled">Não conciliadas</option>
              <option value="reconciled">Conciliadas</option>
            </select>
          </label>
        </section>

        <section class="purchase-list" aria-label="Compras da fatura">
          ${
            input.operation.purchasesError
              ? `<p class="error" role="alert">${escapeHtml(input.operation.purchasesError)}</p>`
              : purchases.map((purchase) => renderPurchaseRow(purchase, categoryNames)).join("") ||
                renderEmptyState(
                  "Nenhuma compra nesta fatura.",
                  "Registre uma compra para acompanhar valor, categoria e conciliação.",
                )
          }
        </section>
      </div>

      <aside class="invoice-summary" aria-label="Resumo da fatura">
        <div class="summary-title">
          <div>
            <p class="eyebrow">Fatura ${escapeHtml(formatGenericStatus(summary.status))}</p>
            <h2>${formatDate(summary.closingOn)}</h2>
            <p class="muted">Vencimento ${formatDate(summary.dueOn)}</p>
          </div>
          <strong>${formatMoney(summary.amountDueMinor)}</strong>
        </div>
        <button type="button" class="secondary-button" data-api-action data-api-method="GET" data-api-path="/api/invoices/${escapeHtml(invoice.id)}">Abrir detalhe da fatura</button>
        ${input.operation.summaryError ? `<p class="error" role="alert">${escapeHtml(input.operation.summaryError)}</p>` : ""}
        <dl class="summary-grid">
          ${renderSummaryItem("Saldo anterior", summary.previousBalanceMinor)}
          ${renderSummaryItem("Despesas", summary.totalExpensesMinor)}
          ${renderSummaryItem("Total pago", summary.totalPaidMinor)}
          ${renderSummaryItem("A pagar", summary.amountDueMinor)}
          ${renderSummaryItem("Conciliado", summary.reconciledExpensesMinor)}
          ${renderSummaryItem("Não conciliado", summary.unreconciledExpensesMinor)}
        </dl>
        ${renderLimitSummary(summary)}
        <div class="invoice-actions">
          ${canClose ? renderActionButton("Fechar fatura", `/api/invoices/${invoice.id}/close`, "Fechar esta fatura?") : ""}
          ${canPay ? renderInvoicePaymentForm(invoice, input.accounts, summary.amountDueMinor) : `<p class="muted">Pagamento indisponível para faturas ${escapeHtml(formatGenericStatus(invoice.status).toLowerCase())}.</p>`}
        </div>
      </aside>
    </section>
  `;
}

function renderPurchaseRow(
  purchase: CardPurchaseRecord,
  categoryNames: ReadonlyMap<string, string>,
): string {
  const categoryName = purchase.categoryId ? categoryNames.get(purchase.categoryId) : undefined;
  const reconciliation = purchase.status === "reconciled" ? "reconciled" : "unreconciled";
  const search = [purchase.description, categoryName ?? "", purchase.status]
    .join(" ")
    .toLowerCase();

  return `
    <article class="purchase-row" data-purchase-item data-reconciliation="${reconciliation}" data-search="${escapeHtml(search)}">
      <time datetime="${escapeHtml(purchase.occurredOn)}">${formatDate(purchase.occurredOn)}</time>
      <div>
        <strong>${escapeHtml(purchase.description)}</strong>
        <span>${escapeHtml(categoryName ?? "Sem categoria")} · ${escapeHtml(formatGenericStatus(purchase.status))}</span>
      </div>
      <strong>${formatMoney(purchase.amountMinor)}</strong>
      <details class="item-actions">
        <summary>Ações</summary>
        <button type="button" class="secondary-button" data-api-action data-api-method="GET" data-api-path="/api/transactions/${escapeHtml(purchase.id)}">Abrir lançamento</button>
      </details>
    </article>
  `;
}

function renderNoInvoiceState(card: CardRecord, categories: CategoryRecord[]): string {
  return `
    <section class="invoice-view">
      <div class="invoice-main">
        ${renderEmptyState(
          "Nenhuma fatura para este cartão.",
          "A primeira compra registrada gera a fatura automaticamente.",
        )}
      </div>
      <aside class="invoice-summary" id="nova-compra">
        <h2>Nova compra</h2>
        ${renderCardPurchaseForm(card, categories)}
      </aside>
    </section>
  `;
}

function renderLimitSummary(summary: InvoiceSummaryRecord): string {
  const total = summary.cardTotals[0];

  if (!total) {
    return "";
  }

  const usedPercent =
    total.limitTotalMinor > 0
      ? Math.min(100, Math.round((total.limitUsedMinor / total.limitTotalMinor) * 100))
      : 0;

  return `
    <section class="limit-box">
      <div>
        <strong>${escapeHtml(total.cardName)}</strong>
        <span>${total.maskedIdentifier ? escapeHtml(total.maskedIdentifier) : "Identificador não informado"}</span>
      </div>
      <div class="limit-meter" aria-label="${usedPercent}% do limite usado"><span style="width: ${usedPercent}%"></span></div>
      <dl class="limit-values">
        ${renderSummaryItem("Limite", total.limitTotalMinor)}
        ${renderSummaryItem("Usado", total.limitUsedMinor)}
        ${renderSummaryItem("Disponível", total.limitAvailableMinor)}
      </dl>
    </section>
  `;
}

function renderSummaryItem(label: string, amountMinor: number): string {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${formatMoney(amountMinor)}</dd></div>`;
}

function renderCardPurchaseForm(card: CardRecord, categories: CategoryRecord[]): string {
  return `
    <form data-api-form data-api-path="/api/cards/${escapeHtml(card.id)}/purchases" class="compact-form">
      <label>Compra em<input name="occurredOn" type="date" required /></label>
      <label>Valor (R$)<input name="amountMinor" data-money inputmode="decimal" required placeholder="0,00" /></label>
      <label>Descrição<input name="description" placeholder="Compra no cartão" required /></label>
      <label>Categoria<select name="categoryId"><option value="">Sem categoria</option>${renderCategoryOptions(categories)}</select></label>
      <button type="submit">Registrar compra</button>
    </form>
  `;
}

function renderInvoicePaymentForm(
  invoice: InvoiceRecord,
  accounts: AccountRecord[],
  amountDueMinor: number,
): string {
  return `
    <details class="payment-panel">
      <summary>Pagar fatura</summary>
      <form data-api-form data-api-path="/api/invoices/${escapeHtml(invoice.id)}/pay" data-api-confirm="Registrar o pagamento desta fatura?" class="compact-form">
        <label>Conta<select name="paymentAccountId" required>${renderAccountOptions(accounts)}</select></label>
        <label>Pago em<input name="paidOn" type="date" required /></label>
        <label>Valor pago (R$)<input name="amountMinor" data-money inputmode="decimal" value="${formatMoneyInput(amountDueMinor)}" required /></label>
        <label>Descrição<input name="description" value="Pagamento da fatura ${formatDate(invoice.periodEndOn)}" /></label>
        <button type="submit">Confirmar pagamento</button>
      </form>
    </details>
  `;
}

function renderActionButton(label: string, path: string, confirmation?: string): string {
  return `<button type="button" class="secondary-button" data-api-action data-api-method="POST" data-api-path="${escapeHtml(path)}"${confirmation ? ` data-api-confirm="${escapeHtml(confirmation)}"` : ""}>${escapeHtml(label)}</button>`;
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
          <nav aria-label="Menu principal">${renderNavigation(input.pathname)}</nav>
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
          const confirmation = form.dataset.apiConfirm;
          if (confirmation && !window.confirm(confirmation)) return;
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
        const container = button.closest(".item-actions") || button.closest(".invoice-actions") || button.parentElement;
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

function cardsPageScript(): string {
  return `
    <script>
      function setSelected(elements, selected) {
        elements.forEach((item) => item.setAttribute("aria-selected", item === selected ? "true" : "false"));
      }

      function showCard(cardId) {
        document.querySelectorAll("[data-card-section]").forEach((section) => {
          section.hidden = section.dataset.cardSection !== cardId;
        });
        setSelected(document.querySelectorAll("[data-card-tab]"), document.querySelector('[data-card-tab="' + cardId + '"]'));
      }

      function showInvoice(section, invoiceId) {
        section.querySelectorAll("[data-invoice-view]").forEach((view) => {
          view.hidden = view.dataset.invoiceView !== invoiceId;
        });
        setSelected(section.querySelectorAll("[data-invoice-tab]"), section.querySelector('[data-invoice-tab="' + invoiceId + '"]'));
      }

      document.querySelectorAll("[data-card-tab]").forEach((button) => {
        button.addEventListener("click", () => showCard(button.dataset.cardTab));
      });

      document.querySelectorAll("[data-invoice-tab]").forEach((button) => {
        button.addEventListener("click", () => showInvoice(button.closest("[data-card-section]"), button.dataset.invoiceTab));
      });

      document.querySelectorAll("[data-invoice-step]").forEach((button) => {
        button.addEventListener("click", () => {
          const section = button.closest("[data-card-section]");
          const tabs = Array.from(section.querySelectorAll("[data-invoice-tab]"));
          if (tabs.length === 0) return;
          const current = Math.max(0, tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true"));
          const delta = button.dataset.invoiceStep === "next" ? 1 : -1;
          const next = (current + delta + tabs.length) % tabs.length;
          showInvoice(section, tabs[next].dataset.invoiceTab);
        });
      });

      document.querySelectorAll("[data-invoice-view]").forEach((view) => {
        const search = view.querySelector("[data-purchase-search]");
        const filter = view.querySelector("[data-reconciliation-filter]");
        const apply = () => {
          const query = String(search.value || "").trim().toLowerCase();
          const reconciliation = filter.value;
          view.querySelectorAll("[data-purchase-item]").forEach((item) => {
            const matchesText = !query || item.dataset.search.includes(query);
            const matchesStatus = reconciliation === "all" || item.dataset.reconciliation === reconciliation;
            item.hidden = !(matchesText && matchesStatus);
          });
        };
        search.addEventListener("input", apply);
        filter.addEventListener("change", apply);
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

function renderEmptyState(title: string, description: string): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(description)}</p></div>`;
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

function fallbackSummary(invoice: InvoiceRecord): InvoiceSummaryRecord {
  return {
    invoiceId: invoice.id,
    financialProfileId: "",
    cardId: invoice.cardId,
    cardName: "Cartão",
    status: invoice.status,
    periodStartOn: invoice.periodStartOn,
    closingOn: invoice.periodEndOn,
    dueOn: invoice.dueOn,
    previousBalanceMinor: 0,
    totalExpensesMinor: invoice.totalAmountMinor,
    totalPaidMinor: invoice.status === "paid" ? invoice.totalAmountMinor : 0,
    amountDueMinor:
      invoice.status === "paid" || invoice.status === "cancelled" ? 0 : invoice.totalAmountMinor,
    reconciledExpensesMinor: 0,
    unreconciledExpensesMinor: invoice.totalAmountMinor,
    purchasesCount: 0,
    cardTotals: [],
  };
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

function formatGenericStatus(status: string): string {
  if (status === "active") return "Ativo";
  if (status === "archived") return "Arquivado";
  if (status === "blocked") return "Bloqueado";
  if (status === "open") return "Aberta";
  if (status === "closed") return "Fechada";
  if (status === "paid") return "Paga";
  if (status === "overdue") return "Vencida";
  if (status === "cancelled") return "Cancelada";
  if (status === "reconciled") return "Conciliada";
  if (status === "posted") return "Não conciliada";
  if (status === "planned") return "Planejada";
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

interface AccountRecord {
  id: string;
  name: string;
}

interface CategoryRecord {
  id: string;
  name: string;
}

interface CardRecord {
  id: string;
  name: string;
  status: string;
  closingDay: number;
  dueDay: number;
  maskedIdentifier?: string;
}

interface InvoiceRecord {
  id: string;
  cardId: string;
  status: string;
  periodStartOn: string;
  periodEndOn: string;
  dueOn: string;
  totalAmountMinor: number;
}

interface InvoiceSummaryRecord {
  invoiceId: string;
  financialProfileId: string;
  cardId: string;
  cardName: string;
  cardMaskedIdentifier?: string;
  status: string;
  periodStartOn: string;
  closingOn: string;
  dueOn: string;
  previousBalanceMinor: number;
  totalExpensesMinor: number;
  totalPaidMinor: number;
  amountDueMinor: number;
  reconciledExpensesMinor: number;
  unreconciledExpensesMinor: number;
  purchasesCount: number;
  cardTotals: InvoiceCardTotalRecord[];
}

interface InvoiceCardTotalRecord {
  cardId: string;
  cardName: string;
  maskedIdentifier?: string;
  limitTotalMinor: number;
  limitUsedMinor: number;
  limitAvailableMinor: number;
  invoiceTotalMinor: number;
  invoiceAmountDueMinor: number;
}

interface CardPurchaseRecord {
  id: string;
  financialProfileId: string;
  cardId: string;
  invoiceId?: string;
  categoryId?: string;
  occurredOn: string;
  description: string;
  amountMinor: number;
  currency: string;
  status: string;
}

function baseCss(): string {
  return `
    :root { color-scheme: light; --bg: #f8fafc; --surface: #ffffff; --surface-soft: #eef5f8; --text: #0f172a; --muted: #475569; --line: #cbd5e1; --primary: #0f3d4c; --primary-soft: #e8f3f6; --cyan: #0891b2; --success: #166534; --success-bg: #dcfce7; --danger: #dc2626; --danger-bg: #fee2e2; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    h1, h2, p, dl, dd { margin: 0; } h1 { font-size: clamp(1.6rem, 4vw, 2rem); line-height: 1.15; } h2 { font-size: 1rem; line-height: 1.3; } a { color: inherit; }
    button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible { outline: 3px solid rgba(34, 211, 238, .55); outline-offset: 2px; }
    .panel, .placeholder-state { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
    .eyebrow { color: var(--cyan); font-size: .78rem; font-weight: 800; letter-spacing: 0; text-transform: uppercase; } .muted { color: var(--muted); line-height: 1.5; }
    form, label { display: grid; gap: 8px; } label { color: var(--text); font-weight: 700; } input, select { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; color: var(--text); font: inherit; min-height: 44px; padding: 0 12px; width: 100%; }
    button, .button-link { align-items: center; background: var(--primary); border: 0; border-radius: 8px; color: white; cursor: pointer; display: inline-flex; font: inherit; font-weight: 800; justify-content: center; min-height: 44px; padding: 0 16px; text-decoration: none; }
    button:disabled { cursor: not-allowed; opacity: .58; } .secondary-button { background: var(--primary-soft); border: 1px solid #d4e6ec; color: var(--primary); } .icon-button { font-size: 1.3rem; min-width: 44px; padding: 0; }
    .error { background: var(--danger-bg); border: 1px solid #fecaca; border-radius: 8px; color: var(--danger); padding: 10px 12px; } .success { background: var(--success-bg); border: 1px solid #bbf7d0; border-radius: 8px; color: var(--success); padding: 10px 12px; } .form-status { grid-column: 1 / -1; }
    .app-shell { display: grid; grid-template-columns: 248px minmax(0, 1fr); min-height: 100vh; } .sidebar { background: var(--primary); color: white; display: flex; flex-direction: column; gap: 22px; padding: 22px; }
    .brand { align-items: center; display: inline-flex; font-size: 1.2rem; font-weight: 900; min-height: 44px; text-decoration: none; } nav { display: grid; gap: 6px; } nav a { border-radius: 8px; color: rgba(255,255,255,.82); font-weight: 800; min-height: 40px; padding: 10px 12px; text-decoration: none; } nav a:hover, nav a[aria-current="page"] { background: rgba(34,211,238,.18); color: white; }
    .logout { background: rgba(255,255,255,.12); margin-top: auto; } .main-area { min-width: 0; } .topbar { align-items: center; background: rgba(255,255,255,.92); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; min-height: 64px; padding: 0 24px; position: sticky; top: 0; z-index: 5; } .topbar div { display: grid; gap: 2px; } .topbar span { color: var(--muted); font-size: .875rem; }
    main { display: grid; gap: 20px; margin: 0 auto; max-width: 1240px; padding: 24px; width: 100%; } .cards-heading { align-items: end; display: flex; gap: 16px; justify-content: space-between; } .cards-heading > div { display: grid; gap: 6px; max-width: 760px; }
    .cards-workspace { align-items: start; display: grid; gap: 18px; grid-template-columns: 280px minmax(0, 1fr); } .card-selector, .invoice-summary { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 14px; padding: 16px; }
    .section-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .section-heading span { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: .78rem; font-weight: 800; padding: 6px 10px; white-space: nowrap; } .compact-heading h2 { font-size: .95rem; }
    .card-tabs { display: grid; gap: 10px; } .card-tab { background: transparent; border: 1px solid var(--line); color: var(--text); display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr) auto; justify-content: stretch; min-height: 76px; padding: 12px; text-align: left; } .card-tab[aria-selected="true"] { background: var(--primary-soft); border-color: #a5cbd6; } .card-tab span { display: grid; gap: 3px; min-width: 0; } .card-tab small { color: var(--muted); font-weight: 700; line-height: 1.35; } .card-tab-meta { text-align: right; }
    .invoice-area, .card-operation { display: grid; gap: 14px; min-width: 0; } .operation-topline { align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; display: flex; gap: 16px; justify-content: space-between; padding: 16px; } .operation-topline > div:first-child { display: grid; gap: 4px; } .card-actions { display: flex; gap: 8px; }
    .period-controls, .invoice-tabs { display: flex; gap: 8px; } .invoice-tabs { overflow-x: auto; padding-bottom: 2px; } .invoice-tab { background: var(--surface); border: 1px solid var(--line); color: var(--text); display: grid; gap: 2px; min-width: 128px; padding: 10px 12px; } .invoice-tab[aria-selected="true"] { background: var(--primary); color: white; } .invoice-tab[aria-selected="true"] span { color: rgba(255,255,255,.78); } .invoice-tab span { color: var(--muted); font-size: .82rem; font-weight: 800; }
    .invoice-view { align-items: start; display: grid; gap: 18px; grid-template-columns: minmax(0, 1fr) 340px; } .invoice-main { display: grid; gap: 14px; min-width: 0; } .invoice-toolbar { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr) 190px; padding: 14px; }
    .purchase-list { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 0; min-width: 0; overflow: hidden; } .purchase-row { align-items: center; border-top: 1px solid var(--line); display: grid; gap: 12px; grid-template-columns: 92px minmax(0, 1fr) auto 88px; padding: 14px; } .purchase-row:first-child { border-top: 0; } .purchase-row time, .purchase-row span { color: var(--muted); font-size: .9rem; } .purchase-row div { display: grid; gap: 4px; min-width: 0; } .purchase-row > strong { white-space: nowrap; } .item-actions summary, .payment-panel summary, .purchase-form-panel summary { color: var(--primary); cursor: pointer; font-weight: 800; }
    .invoice-summary { align-content: start; position: sticky; top: 84px; } .summary-title { align-items: start; display: flex; gap: 12px; justify-content: space-between; } .summary-title > div { display: grid; gap: 4px; } .summary-title > strong { font-size: 1.15rem; white-space: nowrap; } .summary-grid, .limit-values { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); } .summary-grid div, .limit-values div { background: var(--surface-soft); border-radius: 8px; display: grid; gap: 4px; padding: 10px; } dt { color: var(--muted); font-size: .78rem; font-weight: 800; } dd { font-weight: 900; }
    .limit-box { border-top: 1px solid var(--line); display: grid; gap: 12px; padding-top: 14px; } .limit-box > div:first-child { display: grid; gap: 4px; } .limit-box span { color: var(--muted); } .limit-meter { background: #dbeafe; border-radius: 999px; height: 10px; overflow: hidden; } .limit-meter span { background: var(--cyan); display: block; height: 100%; }
    .invoice-actions, .compact-form { display: grid; gap: 10px; } .compact-form { grid-template-columns: repeat(2, minmax(0, 1fr)); } .compact-form button, .compact-form .form-status { grid-column: 1 / -1; } .payment-panel { border-top: 1px solid var(--line); padding-top: 12px; } .purchase-form-panel { border-bottom: 1px solid var(--line); padding-bottom: 14px; }
    .empty-state { background: var(--bg); border: 1px dashed var(--line); border-radius: 8px; display: grid; gap: 6px; padding: 16px; }
    @media (max-width: 1080px) { .cards-workspace, .invoice-view { grid-template-columns: 1fr; } .invoice-summary { position: static; } .card-tabs { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) { .app-shell { grid-template-columns: 1fr; } .sidebar { gap: 12px; padding: 12px 16px; position: sticky; top: 0; z-index: 10; } .sidebar .logout { display: none; } nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; } nav a { background: rgba(255,255,255,.1); flex: 0 0 auto; min-height: 44px; white-space: nowrap; } .topbar { min-height: 56px; padding: 0 16px; position: static; } .topbar button { display: none; } main { padding: 18px 16px 28px; } .cards-heading, .operation-topline { align-items: stretch; display: grid; } .card-tabs, .invoice-toolbar, .compact-form, .summary-grid, .limit-values { grid-template-columns: 1fr; } .card-tab { grid-template-columns: 1fr; } .card-tab-meta { text-align: left; } .purchase-row { align-items: start; grid-template-columns: 1fr; } }
  `;
}
