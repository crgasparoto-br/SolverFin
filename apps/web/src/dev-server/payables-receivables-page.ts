import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { privateRoutes } from "./routes.js";

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
        <p class="eyebrow">Rotina mensal</p>
        <h1>Contas a pagar e receber</h1>
        <p class="muted">Acompanhe vencimentos, registre recebimentos e conclua pagamentos sem excluir o histórico financeiro.</p>
      </section>
      <section class="summary-grid" aria-label="Resumo de contas a pagar e receber">
        ${renderMetricCard("Pendentes", summary.pendingCount, "Aguardam pagamento ou recebimento")}
        ${renderMetricCard("A pagar", formatMoney(summary.pendingPayableMinor), "Saídas pendentes")}
        ${renderMetricCard("A receber", formatMoney(summary.pendingReceivableMinor), "Entradas pendentes")}
        ${renderMetricCard("Concluídas", summary.settledCount, "Já geraram ou associaram lançamento")}
      </section>
      <section class="workspace-grid wide-form">
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
        <section class="panel form-panel">
          <h2>Nova conta</h2>
          <form data-api-form data-api-path="/api/payables-receivables">
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
                ${renderAccountOptions(accountOptions)}
              </select>
            </label>
            <label>Categoria
              <select name="categoryId">
                <option value="">Sem categoria</option>
                ${renderCategoryOptions(categoryOptions)}
              </select>
            </label>
            <button type="submit">Criar conta</button>
          </form>
        </section>
      </section>
      ${payablesReceivablesScript()}
    `,
  );
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
              <form data-api-form data-api-method="PATCH" data-api-path="/api/payables-receivables/${escapeHtml(item.id)}" class="inline-edit-form">
                <label>Tipo<select name="kind">${renderKindOptions(item.kind)}</select></label>
                <label>Descrição<input name="description" value="${escapeHtml(item.description)}" required /></label>
                <label>Valor (R$)<input name="amountMinor" data-money value="${formatMoneyInput(item.amountMinor)}" inputmode="decimal" required /></label>
                <label>Vencimento<input name="dueOn" type="date" value="${escapeHtml(item.dueOn)}" required /></label>
                <label>Conta<select name="accountId"><option value="">Sem conta definida</option>${renderAccountOptions(accounts, item.accountId)}</select></label>
                <label>Categoria<select name="categoryId"><option value="">Sem categoria</option>${renderCategoryOptions(categories, item.categoryId)}</select></label>
                <button type="submit">Salvar edição</button>
              </form>
              <form data-settle-form data-api-path="/api/payables-receivables/${escapeHtml(item.id)}/settle" class="inline-edit-form">
                <label>Data da conclusão<input name="settledOn" type="date" value="${escapeHtml(item.dueOn)}" required /></label>
                <label>Conta<select name="accountId" required>${renderAccountOptions(accounts, item.accountId)}</select></label>
                <label>Categoria<select name="categoryId"><option value="">Sem categoria</option>${renderCategoryOptions(categories, item.categoryId)}</select></label>
                <label>Descrição do lançamento<input name="description" value="${escapeHtml(item.description)}" /></label>
                <button type="submit" class="secondary-button">Concluir ${item.kind === "payable" ? "pagamento" : "recebimento"}</button>
              </form>
              ${renderActionButton("Cancelar conta", `/api/payables-receivables/${item.id}/cancel`, "Cancelar esta conta? Ela deixará de aparecer como pendente, mas continuará no histórico.")}
            `
            : renderReadonlyNote(item)
        }
      </div>
    </article>
  `;
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
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <title>${escapeHtml(currentLabel)} - SolverFin</title>
    <style>${baseCss()}</style>
  </head>
  <body>
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="/dashboard" aria-label="Ir para o resumo do SolverFin">SolverFin</a>
        <nav aria-label="Menu principal">${renderNavigation("/pagar-receber")}</nav>
        <button class="logout" type="button" data-logout>Sair</button>
      </aside>
      <div class="main-area">
        <header class="topbar"><div><strong>${escapeHtml(currentLabel)}</strong><span>Usuário Demo SolverFin</span></div><button type="button" data-logout>Sair</button></header>
        <main>${content}</main>
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
  </body>
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

function renderMetricCard(title: string, value: string | number, subtitle: string): string {
  return `<article class="metric-card"><span>${escapeHtml(title)}</span><strong>${escapeHtml(String(value))}</strong><p>${escapeHtml(subtitle)}</p></article>`;
}

function renderKindOptions(selected?: string): string {
  return [
    ["payable", "Conta a pagar"],
    ["receivable", "Conta a receber"],
  ]
    .map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`)
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
    :root { color-scheme: light; --bg: #f8fafc; --surface: #ffffff; --surface-soft: #eef5f8; --text: #0f172a; --muted: #475569; --line: #cbd5e1; --primary: #0f3d4c; --primary-soft: #e8f3f6; --cyan: #0891b2; --success: #166534; --success-bg: #dcfce7; --danger: #dc2626; --danger-bg: #fee2e2; --warning: #b45309; --warning-bg: #fef3c7; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    h1, h2, h3, p { margin: 0; } h1 { font-size: clamp(1.6rem, 4vw, 2rem); line-height: 1.15; } h2 { font-size: 1rem; line-height: 1.3; } h3 { font-size: .95rem; } a { color: inherit; }
    button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid rgba(34, 211, 238, .55); outline-offset: 2px; }
    .panel, .metric-card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
    .panel { display: grid; gap: 16px; min-width: 0; }
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
    main { display: grid; gap: 20px; margin: 0 auto; max-width: 1180px; padding: 24px; width: 100%; } .page-heading { align-items: start; display: grid; max-width: 760px; }
    .summary-grid { display: grid; gap: 14px; grid-template-columns: repeat(4, minmax(0, 1fr)); } .metric-card { display: grid; gap: 8px; min-width: 0; } .metric-card span { color: var(--muted); font-size: .78rem; font-weight: 800; text-transform: uppercase; } .metric-card strong { color: var(--primary); font-size: 1.5rem; line-height: 1.2; overflow-wrap: anywhere; } .metric-card p { color: var(--muted); line-height: 1.45; }
    .workspace-grid { align-items: start; display: grid; gap: 18px; grid-template-columns: minmax(0, .95fr) minmax(22rem, .6fr); }
    .section-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .section-heading > div { display: grid; gap: 4px; min-width: 0; } .section-heading span, .status-heading span { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: .78rem; font-weight: 800; padding: 6px 10px; white-space: nowrap; }
    .status-section { border-top: 1px solid var(--line); display: grid; gap: 12px; padding-top: 14px; } .status-section:first-of-type { border-top: 0; padding-top: 0; } .status-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
    .rows { display: grid; gap: 10px; } .maintenance-rows { gap: 14px; } .maintenance-item { border-top: 1px solid var(--line); display: grid; gap: 12px; padding-top: 14px; } .maintenance-item:first-child { border-top: 0; padding-top: 0; } .maintenance-summary { align-items: start; display: flex; gap: 16px; justify-content: space-between; min-width: 0; } .maintenance-summary > div { display: grid; gap: 4px; min-width: 0; } .maintenance-summary span { color: var(--muted); line-height: 1.45; } .maintenance-summary > strong { text-align: right; white-space: nowrap; }
    .maintenance-actions { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: 8px; display: grid; gap: 10px; padding: 12px; }
    .inline-edit-form { align-items: end; display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); } .inline-edit-form button, .inline-edit-form .form-status { grid-column: 1 / -1; }
    .empty-state { background: var(--bg); border: 1px dashed var(--line); border-radius: 8px; display: grid; gap: 6px; padding: 16px; }
    .form-panel form { grid-template-columns: repeat(2, minmax(0, 1fr)); } .form-panel button { grid-column: 1 / -1; }
    .amount-credit { color: var(--success); } .amount-debit { color: var(--danger); }
    @media (max-width: 1024px) { .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .workspace-grid { grid-template-columns: 1fr; } }
    @media (max-width: 760px) { .app-shell { grid-template-columns: 1fr; } .sidebar { gap: 12px; padding: 12px 16px; position: sticky; top: 0; z-index: 10; } .sidebar .logout { display: none; } nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; } nav a { background: rgba(255,255,255,.1); flex: 0 0 auto; min-height: 44px; white-space: nowrap; } .topbar { min-height: 56px; padding: 0 16px; position: static; } .topbar button { display: none; } main { padding: 18px 16px 28px; } .summary-grid, .form-panel form, .inline-edit-form { grid-template-columns: 1fr; } .section-heading, .maintenance-summary { align-items: stretch; display: grid; } .maintenance-summary > strong { text-align: left; white-space: normal; } }
  `;
}
