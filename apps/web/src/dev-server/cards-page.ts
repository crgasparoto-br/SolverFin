import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { privateRoutes } from "./routes.js";

export async function renderCardsPage(token: string): Promise<string> {
  const [cards, invoices, accounts, categories] = await Promise.all([
    apiGet<{ cards: CardRecord[] }>(token, "/api/cards?status=all"),
    apiGet<{ invoices: InvoiceRecord[] }>(token, "/api/invoices?status=all"),
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts"),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories?kind=expense"),
  ]);

  if (!cards.ok) return renderApiErrorPage("/cartoes", "Cartões", cards.error);
  if (!invoices.ok) return renderApiErrorPage("/cartoes", "Cartões", invoices.error);

  const accountOptions = accounts.ok ? accounts.data.accounts : [];
  const categoryOptions = categories.ok ? categories.data.categories : [];
  const cardNames = new Map(cards.data.cards.map((card) => [card.id, card.name]));

  return renderAuthenticatedPage({
    pathname: "/cartoes",
    currentLabel: "Cartões",
    content: `
      ${renderPageHeading({
        eyebrow: "Crédito com previsibilidade",
        title: "Cartões e faturas",
        description: "Organize cartões, registre compras e acompanhe faturas do perfil ativo.",
      })}
      <section class="workspace-grid wide-form">
        <div class="stacked-panels">
          <section class="panel list-panel">
            <div class="section-heading">
              <h2>Cartões cadastrados</h2>
              <span>${cards.data.cards.length} itens</span>
            </div>
            <div class="rows maintenance-rows">
              ${cards.data.cards
                .map((card) => renderCardRow(card, accountOptions, categoryOptions))
                .join("") ||
              renderEmptyState(
                "Nenhum cartão cadastrado.",
                "Cadastre cartões para acompanhar faturas e vencimentos.",
              )}
            </div>
          </section>
          <section class="panel list-panel">
            <div class="section-heading">
              <div>
                <h2>Faturas</h2>
                <p class="muted">Consulte detalhes e pague faturas usando uma conta ativa.</p>
              </div>
              <span>${invoices.data.invoices.length} itens</span>
            </div>
            <div class="rows maintenance-rows">
              ${invoices.data.invoices
                .map((invoice) => renderInvoiceRow(invoice, cardNames, accountOptions))
                .join("") ||
              renderEmptyState(
                "Nenhuma fatura encontrada.",
                "Registre compras no cartão para gerar faturas automaticamente.",
              )}
            </div>
          </section>
        </div>
        <section class="panel form-panel">
          <h2>Novo cartão</h2>
          <form data-api-form data-api-path="/api/cards">
            <label>Nome<input name="name" required /></label>
            <label>Dia de fechamento<input name="closingDay" type="number" min="1" max="31" required /></label>
            <label>Dia de vencimento<input name="dueDay" type="number" min="1" max="31" required /></label>
            <label>Conta de pagamento<select name="paymentAccountId"><option value="">-</option>${renderAccountOptions(accountOptions)}</select></label>
            <button type="submit">Criar cartão</button>
          </form>
        </section>
      </section>
      ${apiFormScript()}
    `,
  });
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

function renderInvoiceRow(
  invoice: InvoiceRecord,
  cardNames: ReadonlyMap<string, string>,
  accounts: AccountRecord[],
): string {
  const canPay = invoice.status !== "paid" && invoice.status !== "cancelled";
  const cardName = cardNames.get(invoice.cardId) ?? "Cartão não encontrado";

  return `
    <article class="maintenance-item">
      <div class="maintenance-summary">
        <div>
          <strong>${escapeHtml(cardName)} - vencimento ${formatDate(invoice.dueOn)}</strong>
          <span>${formatDate(invoice.periodStartOn)} a ${formatDate(invoice.periodEndOn)} - ${escapeHtml(formatGenericStatus(invoice.status))}</span>
        </div>
        <strong>${formatMoney(invoice.totalAmountMinor)}</strong>
      </div>
      <div class="maintenance-actions" aria-label="Ações da fatura ${escapeHtml(invoice.id)}">
        <button type="button" class="secondary-button" data-api-action data-api-method="GET" data-api-path="/api/invoices/${escapeHtml(invoice.id)}">Abrir detalhe da fatura</button>
        ${canPay ? renderInvoicePaymentForm(invoice, accounts) : ""}
      </div>
    </article>
  `;
}

function renderInvoicePaymentForm(invoice: InvoiceRecord, accounts: AccountRecord[]): string {
  return `
    <form data-api-form data-api-path="/api/invoices/${escapeHtml(invoice.id)}/pay" data-api-confirm="Registrar o pagamento desta fatura?" class="inline-edit-form">
      <label>Conta de pagamento<select name="paymentAccountId" required>${renderAccountOptions(accounts)}</select></label>
      <label>Pago em<input name="paidOn" type="date" required /></label>
      <label>Valor pago (R$)<input name="amountMinor" data-money inputmode="decimal" value="${formatMoneyInput(invoice.totalAmountMinor)}" required /></label>
      <label>Descrição<input name="description" value="Pagamento da fatura ${formatDate(invoice.periodEndOn)}" /></label>
      <button type="submit">Pagar fatura</button>
    </form>
  `;
}

function renderActionButton(label: string, path: string, confirmation?: string): string {
  return `<button type="button" class="secondary-button danger-action" data-api-action data-api-method="POST" data-api-path="${escapeHtml(path)}"${confirmation ? ` data-api-confirm="${escapeHtml(confirmation)}"` : ""}>${escapeHtml(label)}</button>`;
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
    .map(([path, label]) => `<a href="${path}" ${path === activePathname ? `aria-current="page"` : ""}>${escapeHtml(label)}</a>`)
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

function renderEmptyState(title: string, description: string): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(description)}</p></div>`;
}

function renderAccountOptions(accounts: AccountRecord[], selected?: string): string {
  return accounts
    .map((account) => `<option value="${escapeHtml(account.id)}"${selected === account.id ? " selected" : ""}>${escapeHtml(account.name)}</option>`)
    .join("");
}

function renderCategoryOptions(categories: CategoryRecord[], selected?: string): string {
  return categories
    .map((category) => `<option value="${escapeHtml(category.id)}"${selected === category.id ? " selected" : ""}>${escapeHtml(category.name)}</option>`)
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

function formatGenericStatus(status: string): string {
  if (status === "active") return "Ativo";
  if (status === "archived") return "Arquivado";
  if (status === "blocked") return "Bloqueado";
  if (status === "open") return "Aberta";
  if (status === "closed") return "Fechada";
  if (status === "paid") return "Paga";
  if (status === "overdue") return "Vencida";
  if (status === "cancelled") return "Cancelada";
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
  paymentAccountId?: string;
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

function baseCss(): string {
  return `
    :root { color-scheme: light; --bg: #f8fafc; --surface: #ffffff; --surface-soft: #eef5f8; --text: #0f172a; --muted: #475569; --line: #cbd5e1; --primary: #0f3d4c; --primary-soft: #e8f3f6; --cyan: #0891b2; --success: #166534; --success-bg: #dcfce7; --danger: #dc2626; --danger-bg: #fee2e2; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    h1, h2, p { margin: 0; } h1 { font-size: clamp(1.6rem, 4vw, 2rem); line-height: 1.15; } h2 { font-size: 1rem; line-height: 1.3; } a { color: inherit; }
    button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid rgba(34, 211, 238, .55); outline-offset: 2px; }
    .panel, .placeholder-state { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
    .panel { display: grid; gap: 16px; min-width: 0; }
    .eyebrow { color: var(--cyan); font-size: .78rem; font-weight: 800; letter-spacing: 0; text-transform: uppercase; } .muted { color: var(--muted); line-height: 1.5; }
    form, label { display: grid; gap: 10px; } label { color: var(--text); font-weight: 700; } input, select { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; color: var(--text); font: inherit; min-height: 44px; padding: 0 12px; width: 100%; }
    button, .button-link { align-items: center; background: var(--primary); border: 0; border-radius: 8px; color: white; cursor: pointer; display: inline-flex; font: inherit; font-weight: 800; justify-content: center; min-height: 44px; padding: 0 16px; text-decoration: none; }
    button:disabled { cursor: not-allowed; opacity: .58; } .secondary-button { background: var(--primary-soft); border: 1px solid #d4e6ec; color: var(--primary); } .danger-action { background: var(--danger-bg); border-color: #fecaca; color: var(--danger); }
    .error { background: var(--danger-bg); border: 1px solid #fecaca; border-radius: 8px; color: var(--danger); padding: 10px 12px; } .success { background: var(--success-bg); border: 1px solid #bbf7d0; border-radius: 8px; color: var(--success); padding: 10px 12px; } .form-status { grid-column: 1 / -1; }
    .app-shell { display: grid; grid-template-columns: 248px minmax(0, 1fr); min-height: 100vh; } .sidebar { background: var(--primary); color: white; display: flex; flex-direction: column; gap: 22px; padding: 22px; }
    .brand { align-items: center; display: inline-flex; font-size: 1.2rem; font-weight: 900; min-height: 44px; text-decoration: none; } nav { display: grid; gap: 6px; } nav a { border-radius: 8px; color: rgba(255,255,255,.82); font-weight: 800; min-height: 40px; padding: 10px 12px; text-decoration: none; } nav a:hover, nav a[aria-current="page"] { background: rgba(34,211,238,.18); color: white; }
    .logout { background: rgba(255,255,255,.12); margin-top: auto; } .main-area { min-width: 0; } .topbar { align-items: center; background: rgba(255,255,255,.92); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; min-height: 64px; padding: 0 24px; position: sticky; top: 0; z-index: 5; } .topbar div { display: grid; gap: 2px; } .topbar span { color: var(--muted); font-size: .875rem; }
    main { display: grid; gap: 20px; margin: 0 auto; max-width: 1180px; padding: 24px; width: 100%; } .page-heading { align-items: start; display: grid; gap: 6px; max-width: 760px; }
    .workspace-grid { align-items: start; display: grid; gap: 18px; grid-template-columns: minmax(0, .95fr) minmax(22rem, .6fr); } .stacked-panels { display: grid; gap: 18px; min-width: 0; }
    .section-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .section-heading span { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: .78rem; font-weight: 800; padding: 6px 10px; white-space: nowrap; }
    .rows { display: grid; gap: 10px; } .maintenance-rows { gap: 14px; } .maintenance-item { border-top: 1px solid var(--line); display: grid; gap: 12px; padding-top: 14px; } .maintenance-item:first-child { border-top: 0; padding-top: 0; } .maintenance-summary { align-items: start; display: flex; gap: 16px; justify-content: space-between; min-width: 0; } .maintenance-summary > div { display: grid; gap: 4px; min-width: 0; } .maintenance-summary span { color: var(--muted); line-height: 1.45; } .maintenance-summary > strong { text-align: right; white-space: nowrap; }
    .maintenance-actions { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: 8px; display: grid; gap: 10px; padding: 12px; } .inline-edit-form { align-items: end; display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); } .inline-edit-form button, .inline-edit-form .form-status { grid-column: 1 / -1; }
    .empty-state { background: var(--bg); border: 1px dashed var(--line); border-radius: 8px; display: grid; gap: 6px; padding: 16px; } .form-panel form { grid-template-columns: repeat(2, minmax(0, 1fr)); } .form-panel button { grid-column: 1 / -1; }
    @media (max-width: 1024px) { .workspace-grid { grid-template-columns: 1fr; } }
    @media (max-width: 760px) { .app-shell { grid-template-columns: 1fr; } .sidebar { gap: 12px; padding: 12px 16px; position: sticky; top: 0; z-index: 10; } .sidebar .logout { display: none; } nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; } nav a { background: rgba(255,255,255,.1); flex: 0 0 auto; min-height: 44px; white-space: nowrap; } .topbar { min-height: 56px; padding: 0 16px; position: static; } .topbar button { display: none; } main { padding: 18px 16px 28px; } .form-panel form, .inline-edit-form { grid-template-columns: 1fr; } .section-heading, .maintenance-summary { align-items: stretch; display: grid; } .maintenance-summary > strong { text-align: left; white-space: normal; } }
  `;
}
