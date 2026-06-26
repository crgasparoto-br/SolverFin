import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { faviconLinks } from "./pages.js";
import { privateRoutes } from "./routes.js";

interface RecurrencesResponse {
  recurrences: RecurrenceRecord[];
}

interface AccountsResponse {
  accounts: AccountRecord[];
}

interface CategoriesResponse {
  categories: CategoryRecord[];
}

interface RecurrenceRecord {
  id: string;
  status: string;
  frequency: string;
  startOn: string;
  endOn?: string;
  amountMinor: number;
  currency: string;
  description: string;
  accountId: string;
  categoryId?: string;
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

export async function renderRecurrencesPage(token: string): Promise<string> {
  const [recurrences, accounts, categories] = await Promise.all([
    apiGet<RecurrencesResponse>(token, "/api/recurrences?status=all"),
    apiGet<AccountsResponse>(token, "/api/accounts"),
    apiGet<CategoriesResponse>(token, "/api/categories"),
  ]);

  if (!recurrences.ok) {
    return renderShell(
      "Recorrências",
      `
        <section class="panel placeholder-state">
          <p class="eyebrow">Erro ao carregar recorrências</p>
          <h1>Recorrências</h1>
          <p class="error" role="alert">${escapeHtml(recurrences.error)}</p>
          <a class="button-link" href="/recorrencias">Tentar novamente</a>
        </section>
      `,
    );
  }

  const accountOptions = accounts.ok ? accounts.data.accounts : [];
  const categoryOptions = categories.ok ? categories.data.categories : [];
  const summary = summarizeRecurrences(recurrences.data.recurrences);

  return renderShell(
    "Recorrências",
    `
      <section class="page-heading">
        <p class="eyebrow">Compromissos previsíveis</p>
        <h1>Recorrências e parcelas</h1>
        <p class="muted">Acompanhe contas recorrentes, mensalidades e compromissos planejados sem misturar esse fluxo com lançamentos manuais simples.</p>
      </section>
      <section class="summary-grid" aria-label="Resumo das recorrências">
        ${renderMetricCard("Ativas", summary.active, "Podem gerar novas parcelas")}
        ${renderMetricCard("Pausadas", summary.paused, "Ficam fora da rotina até serem retomadas")}
        ${renderMetricCard("Canceladas", summary.cancelled, "Mantidas apenas como histórico")}
        ${renderMetricCard("Total mensal", formatMoney(summary.monthlyAmountMinor), "Valor estimado das recorrências mensais ativas")}
      </section>
      <section class="workspace-grid wide-form">
        <section class="panel list-panel">
          <div class="section-heading">
            <div>
              <h2>Recorrências cadastradas</h2>
              <p class="muted">Gere parcelas para conferir vencimentos e status antes de revisar no extrato.</p>
            </div>
            <span>${recurrences.data.recurrences.length} itens</span>
          </div>
          <div class="rows maintenance-rows">
            ${
              recurrences.data.recurrences
                .map((recurrence) =>
                  renderRecurrenceRow(recurrence, accountOptions, categoryOptions),
                )
                .join("") ||
              renderEmptyState(
                "Nenhuma recorrência cadastrada.",
                "Crie um compromisso recorrente para acompanhar parcelas planejadas.",
              )
            }
          </div>
        </section>
        <section class="panel form-panel">
          <h2>Nova recorrência</h2>
          <form data-api-form data-api-path="/api/recurrences">
            <label>Descrição<input name="description" required placeholder="Ex.: Aluguel, internet, assinatura" /></label>
            <label>Frequência
              <select name="frequency" required>
                ${renderFrequencyOptions()}
              </select>
            </label>
            <label>Valor (R$)<input name="amountMinor" data-money type="text" inputmode="decimal" required placeholder="0,00" /></label>
            <label>Início<input name="startOn" type="date" required /></label>
            <label>Fim opcional<input name="endOn" type="date" /></label>
            <label>Conta
              <select name="accountId" required>
                ${renderAccountOptions(accountOptions)}
              </select>
            </label>
            <label>Categoria
              <select name="categoryId">
                <option value="">Sem categoria</option>
                ${renderCategoryOptions(categoryOptions)}
              </select>
            </label>
            <button type="submit">Criar recorrência</button>
          </form>
        </section>
      </section>
      ${recurrencesScript()}
    `,
  );
}

function renderRecurrenceRow(
  recurrence: RecurrenceRecord,
  accounts: AccountRecord[],
  categories: CategoryRecord[],
): string {
  const accountName =
    accounts.find((account) => account.id === recurrence.accountId)?.name ?? "Conta não localizada";
  const categoryName = recurrence.categoryId
    ? (categories.find((category) => category.id === recurrence.categoryId)?.name ??
      "Categoria não localizada")
    : "Sem categoria";
  const canPause = recurrence.status === "active";
  const canResume = recurrence.status === "paused";
  const canCancel = recurrence.status !== "cancelled" && recurrence.status !== "completed";

  return `
    <article class="maintenance-item">
      <div class="maintenance-summary">
        <div>
          <strong>${escapeHtml(recurrence.description)}</strong>
          <span>${escapeHtml(formatFrequency(recurrence.frequency))} - ${escapeHtml(formatRecurrenceStatus(recurrence.status))} - ${escapeHtml(accountName)} - ${escapeHtml(categoryName)}</span>
          <span>Desde ${formatDate(recurrence.startOn)}${recurrence.endOn ? ` até ${formatDate(recurrence.endOn)}` : ""}</span>
        </div>
        <strong>${formatMoney(recurrence.amountMinor)}</strong>
      </div>
      <div class="maintenance-actions" aria-label="Ações da recorrência ${escapeHtml(recurrence.description)}">
        <button type="button" class="secondary-button" data-api-action data-api-method="GET" data-api-path="/api/recurrences/${escapeHtml(recurrence.id)}">Abrir detalhe</button>
        <form data-api-form data-api-method="PATCH" data-api-path="/api/recurrences/${escapeHtml(recurrence.id)}" class="inline-edit-form">
          <label>Descrição<input name="description" value="${escapeHtml(recurrence.description)}" required /></label>
          <label>Frequência<select name="frequency">${renderFrequencyOptions(recurrence.frequency)}</select></label>
          <label>Valor (R$)<input name="amountMinor" data-money value="${formatMoneyInput(recurrence.amountMinor)}" inputmode="decimal" required /></label>
          <label>Início<input name="startOn" type="date" value="${escapeHtml(recurrence.startOn)}" required /></label>
          <label>Fim<input name="endOn" type="date" value="${escapeHtml(recurrence.endOn ?? "")}" /></label>
          <label>Conta<select name="accountId">${renderAccountOptions(accounts, recurrence.accountId)}</select></label>
          <label>Categoria<select name="categoryId"><option value="">Sem categoria</option>${renderCategoryOptions(categories, recurrence.categoryId)}</select></label>
          <button type="submit">Salvar recorrência</button>
        </form>
        <form data-installments-form data-api-path="/api/recurrences/${escapeHtml(recurrence.id)}/generate-installments" class="inline-edit-form">
          <label>Gerar até<input name="through" type="date" required /></label>
          <label>Limite<input name="maxOccurrences" type="number" min="1" max="60" value="12" /></label>
          <button type="submit" class="secondary-button">Gerar parcelas</button>
        </form>
        <div class="installments-panel" data-installments-target="${escapeHtml(recurrence.id)}">
          <p class="muted">As parcelas geradas nesta ação aparecem aqui para conferência.</p>
        </div>
        ${canPause ? renderActionButton("Pausar recorrência", `/api/recurrences/${recurrence.id}/pause`, "Pausar esta recorrência? Novas parcelas não devem ser geradas enquanto ela estiver pausada.") : ""}
        ${canResume ? renderActionButton("Retomar recorrência", `/api/recurrences/${recurrence.id}/resume`) : ""}
        ${canCancel ? renderActionButton("Cancelar recorrência", `/api/recurrences/${recurrence.id}/cancel`, "Cancelar esta recorrência? Ela ficará disponível apenas para consulta.") : ""}
      </div>
    </article>
  `;
}

function renderActionButton(label: string, path: string, confirmation?: string): string {
  return `<button type="button" class="secondary-button danger-action" data-api-action data-api-method="POST" data-api-path="${escapeHtml(path)}"${confirmation ? ` data-api-confirm="${escapeHtml(confirmation)}"` : ""}>${escapeHtml(label)}</button>`;
}

function recurrencesScript(): string {
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
        if (response.ok) return { message: "Ação concluída. Atualizando a tela...", body };
        return {
          message: (body.error && body.error.message) || "Não foi possível concluir a ação.",
          body
        };
      }

      function formatMoney(amountMinor) {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amountMinor / 100);
      }

      function renderInstallments(installments) {
        if (!installments || installments.length === 0) {
          return '<p class="muted">Nenhuma nova parcela foi gerada para esse período.</p>';
        }
        return '<div class="installment-rows">' + installments.map((installment) => (
          '<article class="installment-row">' +
            '<div><strong>Parcela ' + installment.sequenceNumber + ' de ' + installment.totalInstallments + '</strong>' +
            '<span>Vence em ' + installment.dueOn + ' - ' + installment.status + '</span></div>' +
            '<strong>' + formatMoney(installment.amountMinor) + '</strong>' +
          '</article>'
        )).join("") + '</div>';
      }

      document.querySelectorAll("[data-api-form]").forEach((form) => {
        const status = ensureStatus(form);
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const submitButton = form.querySelector('button[type="submit"]');
          if (submitButton) submitButton.disabled = true;
          status.className = "form-status muted";
          status.textContent = "Salvando...";
          const response = await fetch(form.dataset.apiPath, {
            method: form.dataset.apiMethod || "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(buildPayload(form)),
          });
          const result = await readApiMessage(response);
          status.className = response.ok ? "form-status success" : "form-status error";
          status.textContent = result.message;
          if (response.ok) {
            window.setTimeout(() => window.location.reload(), 450);
            return;
          }
          if (submitButton) submitButton.disabled = false;
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
          const result = await readApiMessage(response);
          status.className = response.ok ? "form-status success" : "form-status error";
          status.textContent = result.message;
          if (response.ok && button.dataset.apiMethod !== "GET") {
            window.setTimeout(() => window.location.reload(), 450);
            return;
          }
          button.disabled = false;
        });
      });

      document.querySelectorAll("[data-installments-form]").forEach((form) => {
        const status = ensureStatus(form);
        const panel = form.parentElement.querySelector("[data-installments-target]");
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const submitButton = form.querySelector('button[type="submit"]');
          if (submitButton) submitButton.disabled = true;
          status.className = "form-status muted";
          status.textContent = "Gerando parcelas...";
          const response = await fetch(form.dataset.apiPath, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(buildPayload(form)),
          });
          const result = await readApiMessage(response);
          status.className = response.ok ? "form-status success" : "form-status error";
          status.textContent = response.ok ? "Parcelas geradas para revisão." : result.message;
          if (response.ok && panel) {
            panel.innerHTML = renderInstallments(result.body.installments || []);
          }
          if (submitButton) submitButton.disabled = false;
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
    ${faviconLinks()}
    <title>${escapeHtml(currentLabel)} - SolverFin</title>
    <style>${baseCss()}</style>
  </head>
  <body>
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="/dashboard" aria-label="Ir para o resumo do SolverFin"><img src="/icons/solverfin-192.png" width="28" height="28" alt="" />SolverFin</a>
        <nav aria-label="Menu principal">${renderNavigation("/recorrencias")}</nav>
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

function renderFrequencyOptions(selected?: string): string {
  return [
    ["daily", "Diária"],
    ["weekly", "Semanal"],
    ["monthly", "Mensal"],
    ["yearly", "Anual"],
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

function summarizeRecurrences(recurrences: RecurrenceRecord[]): {
  active: number;
  paused: number;
  cancelled: number;
  monthlyAmountMinor: number;
} {
  return recurrences.reduce(
    (summary, recurrence) => {
      if (recurrence.status === "active") {
        summary.active += 1;
        if (recurrence.frequency === "monthly") {
          summary.monthlyAmountMinor += recurrence.amountMinor;
        }
      }
      if (recurrence.status === "paused") summary.paused += 1;
      if (recurrence.status === "cancelled") summary.cancelled += 1;
      return summary;
    },
    { active: 0, paused: 0, cancelled: 0, monthlyAmountMinor: 0 },
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

function formatFrequency(frequency: string): string {
  if (frequency === "daily") return "Diária";
  if (frequency === "weekly") return "Semanal";
  if (frequency === "monthly") return "Mensal";
  if (frequency === "yearly") return "Anual";
  return frequency;
}

function formatRecurrenceStatus(status: string): string {
  if (status === "active") return "Ativa";
  if (status === "paused") return "Pausada";
  if (status === "cancelled") return "Cancelada";
  if (status === "completed") return "Concluída";
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
    h1, h2, p { margin: 0; } h1 { font-size: clamp(1.6rem, 4vw, 2rem); line-height: 1.15; } h2 { font-size: 1rem; line-height: 1.3; } a { color: inherit; }
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
    .brand { align-items: center; display: inline-flex; font-size: 1.2rem; font-weight: 900; gap: 10px; min-height: 44px; text-decoration: none; } .brand img { border-radius: 6px; display: block; } nav { display: grid; gap: 6px; } nav a { border-radius: 8px; color: rgba(255,255,255,.82); font-weight: 800; min-height: 40px; padding: 10px 12px; text-decoration: none; } nav a:hover, nav a[aria-current="page"] { background: rgba(34,211,238,.18); color: white; }
    .logout { background: rgba(255,255,255,.12); margin-top: auto; } .main-area { min-width: 0; } .topbar { align-items: center; background: rgba(255,255,255,.92); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; min-height: 64px; padding: 0 24px; position: sticky; top: 0; z-index: 5; } .topbar div { display: grid; gap: 2px; } .topbar span { color: var(--muted); font-size: .875rem; }
    main { display: grid; gap: 20px; margin: 0 auto; max-width: 1440px; padding: 24px; width: 100%; } .page-heading { align-items: start; display: grid; max-width: 760px; }
    .summary-grid { display: grid; gap: 14px; grid-template-columns: repeat(4, minmax(0, 1fr)); } .metric-card { display: grid; gap: 8px; min-width: 0; } .metric-card span { color: var(--muted); font-size: .78rem; font-weight: 800; text-transform: uppercase; } .metric-card strong { color: var(--primary); font-size: 1.5rem; line-height: 1.2; overflow-wrap: anywhere; } .metric-card p { color: var(--muted); line-height: 1.45; }
    .workspace-grid { align-items: start; display: grid; gap: 18px; grid-template-columns: minmax(0, .95fr) minmax(22rem, .6fr); }
    .section-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .section-heading > div { display: grid; gap: 4px; min-width: 0; } .section-heading span { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: .78rem; font-weight: 800; padding: 6px 10px; white-space: nowrap; }
    .rows { display: grid; gap: 10px; } .maintenance-rows { gap: 14px; } .maintenance-item { border-top: 1px solid var(--line); display: grid; gap: 12px; padding-top: 14px; } .maintenance-item:first-child { border-top: 0; padding-top: 0; } .maintenance-summary { align-items: start; display: flex; gap: 16px; justify-content: space-between; min-width: 0; } .maintenance-summary > div { display: grid; gap: 4px; min-width: 0; } .maintenance-summary span { color: var(--muted); line-height: 1.45; } .maintenance-summary > strong { text-align: right; white-space: nowrap; }
    .maintenance-actions { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: 8px; display: grid; gap: 10px; padding: 12px; }
    .inline-edit-form { align-items: end; display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); } .inline-edit-form button, .inline-edit-form .form-status { grid-column: 1 / -1; }
    .empty-state, .installments-panel { background: var(--bg); border: 1px dashed var(--line); border-radius: 8px; display: grid; gap: 6px; padding: 16px; }
    .installment-rows { display: grid; gap: 8px; } .installment-row { align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; display: flex; gap: 12px; justify-content: space-between; padding: 10px 12px; } .installment-row div { display: grid; gap: 4px; min-width: 0; } .installment-row span { color: var(--muted); } .installment-row > strong { white-space: nowrap; }
    .form-panel form { grid-template-columns: repeat(2, minmax(0, 1fr)); } .form-panel button { grid-column: 1 / -1; }
    @media (max-width: 1024px) { .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .workspace-grid { grid-template-columns: 1fr; } }
    @media (max-width: 760px) { .app-shell { grid-template-columns: 1fr; } .sidebar { gap: 12px; padding: 12px 16px; position: sticky; top: 0; z-index: 10; } .sidebar .logout { display: none; } nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; } nav a { background: rgba(255,255,255,.1); flex: 0 0 auto; min-height: 44px; white-space: nowrap; } .topbar { min-height: 56px; padding: 0 16px; position: static; } .topbar button { display: none; } main { padding: 18px 16px 28px; } .summary-grid, .form-panel form, .inline-edit-form { grid-template-columns: 1fr; } .section-heading, .maintenance-summary, .installment-row { align-items: stretch; display: grid; } .maintenance-summary > strong, .installment-row > strong { text-align: left; white-space: normal; } }
  `;
}
