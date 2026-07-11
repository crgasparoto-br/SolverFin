import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { dialogScript, sharedDialogStyles, sharedShellStyles } from "./shared-styles.js";
import { renderAuthenticatedShellDocument } from "./shell.js";

interface PayablesReceivablesResponse {
  payablesReceivables: PayableReceivableRecord[];
}

interface AccountsResponse {
  accounts: AccountRecord[];
}

interface CategoriesResponse {
  categories: CategoryRecord[];
}

interface PayableReceivableRecord {
  id: string;
  kind: string;
  status: string;
  amountMinor: number;
  currency: string;
  dueOn: string;
  description: string;
  accountId?: string;
  categoryId?: string;
  settlementTransactionId?: string;
  settledAt?: string;
  cancelledAt?: string;
}

interface AccountRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
}

interface CategoryRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
}

export async function renderPayablesReceivablesPage(token: string): Promise<string> {
  const [items, accounts, categories] = await Promise.all([
    apiGet<PayablesReceivablesResponse>(token, "/api/payables-receivables?status=all"),
    apiGet<AccountsResponse>(token, "/api/accounts"),
    apiGet<CategoriesResponse>(token, "/api/categories"),
  ]);

  if (!items.ok) {
    return renderShell(
      "Pagar e receber",
      `
        <section class="panel placeholder-state">
          <p class="eyebrow">Erro ao carregar contas</p>
          <h1>Pagar e receber</h1>
          <p class="error" role="alert">${escapeHtml(items.error)}</p>
          <a class="button-link" href="/pagar-receber">Tentar novamente</a>
        </section>
      `,
    );
  }

  const accountOptions = accounts.ok ? accounts.data.accounts : [];
  const categoryOptions = categories.ok ? categories.data.categories : [];
  const summary = summarizeItems(items.data.payablesReceivables);

  return renderShell(
    "Pagar e receber",
    `
      <section class="page-heading">
        <div>
          <p class="eyebrow">Rotina mensal</p>
          <h1>Contas a pagar e receber</h1>
          <p class="muted">Acompanhe vencimentos, registre recebimentos e conclua pagamentos sem excluir o histórico financeiro.</p>
        </div>
        <button type="button" data-open-dialog="new-payable-receivable-dialog">Nova conta</button>
      </section>
      <section class="summary-grid" aria-label="Resumo de contas a pagar e receber">
        ${renderMetricCard("Pendentes", summary.pendingCount, "Aguardam pagamento ou recebimento")}
        ${renderMetricCard("A pagar", formatMoney(summary.pendingPayableMinor), "Saídas pendentes")}
        ${renderMetricCard("A receber", formatMoney(summary.pendingReceivableMinor), "Entradas pendentes")}
        ${renderMetricCard("Concluídas", summary.settledCount, "Já geraram ou associaram lançamento")}
      </section>
      <section class="panel list-panel">
        <div class="section-heading">
          <div>
            <h2>Compromissos cadastrados</h2>
            <p class="muted">Pendentes podem ser editados, concluídos ou cancelados. Itens concluídos e cancelados ficam apenas para consulta.</p>
          </div>
          <span>${items.data.payablesReceivables.length} itens</span>
        </div>
        ${renderStatusSection("Pendentes", items.data.payablesReceivables, "pending", accountOptions, categoryOptions)}
        ${renderStatusSection("Concluídas", items.data.payablesReceivables, "settled", accountOptions, categoryOptions)}
        ${renderStatusSection("Canceladas", items.data.payablesReceivables, "cancelled", accountOptions, categoryOptions)}
      </section>
      ${renderNewItemDialog(accountOptions, categoryOptions)}
      ${payablesReceivablesScript()}
      ${dialogScript()}
    `,
  );
}

function renderNewItemDialog(accounts: AccountRecord[], categories: CategoryRecord[]): string {
  return `
    <dialog id="new-payable-receivable-dialog" class="master-dialog" aria-labelledby="new-payable-receivable-title">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
        <p class="eyebrow">Novo cadastro</p>
        <h2 id="new-payable-receivable-title">Nova conta</h2>
      </div>
      <form data-api-form data-api-path="/api/payables-receivables" class="edit-grid">
        <label>Tipo
          <select name="kind" required>
            ${renderKindOptions()}
          </select>
        </label>
        <label>Descrição<input name="description" required placeholder="Ex.: Fornecedor, aluguel, cliente" /></label>
        <label>Valor (R$)<input name="amountMinor" data-money type="text" inputmode="decimal" required placeholder="0,00" /></label>
        <label>Vencimento<input name="dueOn" type="date" required /></label>
        <label>Conta
          <select name="accountId">
            <option value="">Sem conta definida</option>
            ${renderAccountOptions(accounts)}
          </select>
        </label>
        <label>Categoria
          <select name="categoryId">
            <option value="">Sem categoria</option>
            ${renderCategoryOptions(categories)}
          </select>
        </label>
        <button type="submit">Criar conta</button>
      </form>
    </dialog>
  `;
}

function renderStatusSection(
  title: string,
  items: PayableReceivableRecord[],
  status: string,
  accounts: AccountRecord[],
  categories: CategoryRecord[],
): string {
  const rows = items.filter((item) => item.status === status);

  return `
    <section class="status-section" aria-label="${escapeHtml(title)}">
      <div class="status-heading">
        <h3>${escapeHtml(title)}</h3>
        <span>${rows.length}</span>
      </div>
      <div class="rows maintenance-rows">
        ${
          rows.map((item) => renderItemRow(item, accounts, categories)).join("") ||
          renderEmptyState(
            `Nenhuma conta ${formatStatusForEmpty(status)}.`,
            "Quando houver itens neste status, eles aparecerão aqui.",
          )
        }
      </div>
    </section>
  `;
}

function renderItemRow(
  item: PayableReceivableRecord,
  accounts: AccountRecord[],
  categories: CategoryRecord[],
): string {
  const accountName = item.accountId
    ? (accounts.find((account) => account.id === item.accountId)?.name ?? "Conta não localizada")
    : "Sem conta";
  const categoryName = item.categoryId
    ? (categories.find((category) => category.id === item.categoryId)?.name ??
      "Categoria não localizada")
    : "Sem categoria";
  const isPending = item.status === "pending";

  return `
    <article class="maintenance-item">
      <div class="maintenance-summary">
        <div>
          <strong>${escapeHtml(item.description)}</strong>
          <span>${escapeHtml(formatKind(item.kind))} - ${escapeHtml(formatStatus(item.status))} - vence em ${formatDate(item.dueOn)}</span>
          <span>${escapeHtml(accountName)} - ${escapeHtml(categoryName)}</span>
        </div>
        <strong class="${item.kind === "payable" ? "amount-debit" : "amount-credit"}">${formatMoney(item.amountMinor)}</strong>
      </div>
      <div class="maintenance-actions" aria-label="Ações da conta ${escapeHtml(item.description)}">
        <button type="button" class="secondary-button" data-api-action data-api-method="GET" data-api-path="/api/payables-receivables/${escapeHtml(item.id)}">Abrir detalhe</button>
        ${
          isPending
            ? `
              <button type="button" class="icon-button" data-open-dialog="edit-payable-receivable-dialog-${escapeHtml(item.id)}" aria-label="Editar conta ${escapeHtml(item.description)}">${renderEditIcon()}</button>
              <button type="button" class="secondary-button" data-open-dialog="settle-payable-receivable-dialog-${escapeHtml(item.id)}">Concluir ${item.kind === "payable" ? "pagamento" : "recebimento"}</button>
              ${renderActionButton("Cancelar conta", `/api/payables-receivables/${item.id}/cancel`, "Cancelar esta conta? Ela deixará de aparecer como pendente, mas continuará no histórico.")}
            `
            : renderReadonlyNote(item)
        }
      </div>
      ${isPending ? renderEditDialog(item, accounts, categories) : ""}
      ${isPending ? renderSettleDialog(item, accounts, categories) : ""}
    </article>
  `;
}

function renderEditDialog(
  item: PayableReceivableRecord,
  accounts: AccountRecord[],
  categories: CategoryRecord[],
): string {
  const dialogId = `edit-payable-receivable-dialog-${item.id}`;
  const titleId = `${dialogId}-title`;

  return `
    <dialog id="${escapeHtml(dialogId)}" class="master-dialog" aria-labelledby="${escapeHtml(titleId)}">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
        <p class="eyebrow">Editar cadastro</p>
        <h2 id="${escapeHtml(titleId)}">${escapeHtml(item.description)}</h2>
      </div>
      <form data-api-form data-api-method="PATCH" data-api-path="/api/payables-receivables/${escapeHtml(item.id)}" class="edit-grid">
        <label>Tipo<select name="kind">${renderKindOptions(item.kind)}</select></label>
        <label>Descrição<input name="description" value="${escapeHtml(item.description)}" required /></label>
        <label>Valor (R$)<input name="amountMinor" data-money value="${formatMoneyInput(item.amountMinor)}" inputmode="decimal" required /></label>
        <label>Vencimento<input name="dueOn" type="date" value="${escapeHtml(item.dueOn)}" required /></label>
        <label>Conta<select name="accountId"><option value="">Sem conta definida</option>${renderAccountOptions(accounts, item.accountId)}</select></label>
        <label>Categoria<select name="categoryId"><option value="">Sem categoria</option>${renderCategoryOptions(categories, item.categoryId)}</select></label>
        <button type="submit">Salvar edição</button>
      </form>
    </dialog>
  `;
}

function renderSettleDialog(
  item: PayableReceivableRecord,
  accounts: AccountRecord[],
  categories: CategoryRecord[],
): string {
  const dialogId = `settle-payable-receivable-dialog-${item.id}`;
  const titleId = `${dialogId}-title`;
  const actionLabel = item.kind === "payable" ? "pagamento" : "recebimento";

  return `
    <dialog id="${escapeHtml(dialogId)}" class="master-dialog" aria-labelledby="${escapeHtml(titleId)}">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
        <p class="eyebrow">Concluir ${actionLabel}</p>
        <h2 id="${escapeHtml(titleId)}">${escapeHtml(item.description)}</h2>
      </div>
      <form data-settle-form data-api-path="/api/payables-receivables/${escapeHtml(item.id)}/settle" class="edit-grid">
        <label>Data da conclusão<input name="settledOn" type="date" value="${escapeHtml(item.dueOn)}" required /></label>
        <label>Conta<select name="accountId" required>${renderAccountOptions(accounts, item.accountId)}</select></label>
        <label>Categoria<select name="categoryId"><option value="">Sem categoria</option>${renderCategoryOptions(categories, item.categoryId)}</select></label>
        <label>Descrição do lançamento<input name="description" value="${escapeHtml(item.description)}" /></label>
        <button type="submit" class="secondary-button">Concluir ${actionLabel}</button>
      </form>
    </dialog>
  `;
}

function renderEditIcon(): string {
  return `<svg class="action-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 20h4.8L19.2 9.6a2.7 2.7 0 0 0 0-3.8l-1-1a2.7 2.7 0 0 0-3.8 0L4 15.2V20zm2-2v-2l9.8-9.8c.3-.3.7-.3 1 0l1 1c.3.3.3.7 0 1L8 18H6z" fill="currentColor"/></svg>`;
}

function renderReadonlyNote(item: PayableReceivableRecord): string {
  if (item.status === "settled") {
    return `<p class="muted">Conta concluída${item.settledAt ? ` em ${formatDateTime(item.settledAt)}` : ""}. Não há edição para itens já concluídos.</p>`;
  }

  if (item.status === "cancelled") {
    return `<p class="muted">Conta cancelada${item.cancelledAt ? ` em ${formatDateTime(item.cancelledAt)}` : ""}. Não há restauração neste contrato.</p>`;
  }

  return "";
}

function renderActionButton(label: string, path: string, confirmation: string): string {
  return `<button type="button" class="secondary-button danger-action" data-api-action data-api-method="POST" data-api-path="${escapeHtml(path)}" data-api-confirm="${escapeHtml(confirmation)}">${escapeHtml(label)}</button>`;
}

function payablesReceivablesScript(): string {
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

      async function submitJsonForm(form, status, successMessage) {
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;
        status.className = "form-status muted";
        status.textContent = "Salvando...";
        const response = await fetch(form.dataset.apiPath, {
          method: form.dataset.apiMethod || "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildPayload(form)),
        });
        status.className = response.ok ? "form-status success" : "form-status error";
        status.textContent = response.ok ? successMessage : await readApiMessage(response);
        if (response.ok) {
          window.setTimeout(() => window.location.reload(), 450);
          return;
        }
        if (submitButton) submitButton.disabled = false;
      }

      document.querySelectorAll("[data-api-form]").forEach((form) => {
        const status = ensureStatus(form);
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          await submitJsonForm(form, status, "Ação concluída. Atualizando a tela...");
        });
      });

      document.querySelectorAll("[data-settle-form]").forEach((form) => {
        const status = ensureStatus(form);
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (!window.confirm("Concluir esta conta e registrar o lançamento correspondente?")) return;
          await submitJsonForm(form, status, "Conta concluída. Atualizando a tela...");
        });
      });

      document.querySelectorAll("[data-api-action]").forEach((button) => {
        const container = button.closest(".maintenance-actions") || button.parentElement;
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

function renderShell(currentLabel: string, content: string): string {
  return renderAuthenticatedShellDocument({
    activePathname: "/pagar-receber",
    content,
    currentLabel,
    styles: baseCss(),
  });
}

function renderMetricCard(title: string, value: string | number, subtitle: string): string {
  return `<article class="metric-card"><span>${escapeHtml(title)}</span><strong>${escapeHtml(String(value))}</strong><p>${escapeHtml(subtitle)}</p></article>`;
}

function renderKindOptions(selected?: string): string {
  return [
    ["payable", "Conta a pagar"],
    ["receivable", "Conta a receber"],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`,
    )
    .join("");
}

function renderAccountOptions(accounts: AccountRecord[], selected?: string): string {
  return accounts
    .filter((account) => account.status === "active" || account.id === selected)
    .map(
      (account) =>
        `<option value="${escapeHtml(account.id)}"${selected === account.id ? " selected" : ""}>${escapeHtml(account.name)}</option>`,
    )
    .join("");
}

function renderCategoryOptions(categories: CategoryRecord[], selected?: string): string {
  return categories
    .filter((category) => category.status === "active" || category.id === selected)
    .map(
      (category) =>
        `<option value="${escapeHtml(category.id)}"${selected === category.id ? " selected" : ""}>${escapeHtml(category.name)}</option>`,
    )
    .join("");
}

function renderEmptyState(title: string, description: string): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(description)}</p></div>`;
}

function summarizeItems(items: PayableReceivableRecord[]): {
  pendingCount: number;
  settledCount: number;
  pendingPayableMinor: number;
  pendingReceivableMinor: number;
} {
  return items.reduce(
    (summary, item) => {
      if (item.status === "settled") {
        summary.settledCount += 1;
      }

      if (item.status === "pending") {
        summary.pendingCount += 1;
        if (item.kind === "payable") summary.pendingPayableMinor += item.amountMinor;
        if (item.kind === "receivable") summary.pendingReceivableMinor += item.amountMinor;
      }

      return summary;
    },
    { pendingCount: 0, settledCount: 0, pendingPayableMinor: 0, pendingReceivableMinor: 0 },
  );
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

function formatDateTime(dateTime: string): string {
  return formatDateOnly(dateTime.slice(0, 10));
}

function formatKind(kind: string): string {
  if (kind === "payable") return "Conta a pagar";
  if (kind === "receivable") return "Conta a receber";
  return kind;
}

function formatStatus(status: string): string {
  if (status === "pending") return "Pendente";
  if (status === "settled") return "Concluída";
  if (status === "cancelled") return "Cancelada";
  return status;
}

function formatStatusForEmpty(status: string): string {
  if (status === "pending") return "pendente";
  if (status === "settled") return "concluída";
  if (status === "cancelled") return "cancelada";
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

function baseCss(): string {
  return `
    ${sharedShellStyles()}
    ${sharedDialogStyles()}
    main { display: grid; gap: 14px; margin: 0 auto; max-width: 1440px; padding: 18px 20px; width: 100%; } .page-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .page-heading > div { display: grid; gap: 4px; max-width: 760px; }
    .summary-grid { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); } .metric-card { display: grid; gap: 5px; min-width: 0; padding: 12px 14px; } .metric-card span { color: var(--muted); font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; } .metric-card strong { color: var(--primary); font-size: 1.25rem; font-weight: 700; line-height: 1.1; overflow-wrap: anywhere; } .metric-card p { color: var(--muted); font-size: 0.8125rem; line-height: 1.4; }
    .section-heading { align-items: center; display: flex; gap: 10px; justify-content: space-between; } .section-heading > div { display: grid; gap: 3px; min-width: 0; } .section-heading span, .status-heading span { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: 0.6875rem; font-weight: 700; padding: 2px 7px; white-space: nowrap; }
    .status-section { border-top: 1px solid var(--line); display: grid; gap: 10px; padding-top: 10px; } .status-section:first-of-type { border-top: 0; padding-top: 0; } .status-heading { align-items: center; display: flex; gap: 10px; justify-content: space-between; }
    .rows { display: grid; gap: 8px; } .maintenance-rows { gap: 10px; } .maintenance-item { border-top: 1px solid var(--line); display: grid; gap: 10px; padding-top: 10px; } .maintenance-item:first-child { border-top: 0; padding-top: 0; } .maintenance-summary { align-items: start; display: flex; gap: 12px; justify-content: space-between; min-width: 0; } .maintenance-summary > div { display: grid; gap: 3px; min-width: 0; } .maintenance-summary span { color: var(--muted); font-size: 0.8125rem; line-height: 1.4; } .maintenance-summary > strong { font-size: 0.9375rem; text-align: right; white-space: nowrap; }
    .maintenance-actions { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: var(--radius); display: flex; flex-wrap: wrap; gap: 8px; padding: 10px; }
    .amount-credit { color: var(--success); } .amount-debit { color: var(--danger); }
    @media (max-width: 1024px) { .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) { .page-heading, .summary-grid { grid-template-columns: 1fr; } .page-heading { align-items: stretch; display: grid; } .section-heading, .maintenance-summary { align-items: stretch; display: grid; } .maintenance-summary > strong { text-align: left; white-space: normal; } }
  `;
}
