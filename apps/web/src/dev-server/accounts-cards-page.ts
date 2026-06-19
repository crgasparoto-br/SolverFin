import { formatMinorCurrency } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { privateRoutes } from "./routes.js";

const institutions = [
  { key: "", label: "Sem instituição", shortLabel: "SF" },
  { key: "bradesco", label: "Bradesco", shortLabel: "BR" },
  { key: "inter", label: "Inter", shortLabel: "IN" },
  { key: "c6", label: "C6 Bank", shortLabel: "C6" },
  { key: "caixa", label: "Caixa", shortLabel: "CX" },
  { key: "porto_bank", label: "Porto Bank", shortLabel: "PB" },
  { key: "solverfin_demo", label: "SolverFin Demo", shortLabel: "SF" },
] as const;

const cardBrands = [
  { key: "", label: "Sem bandeira", shortLabel: "--" },
  { key: "visa", label: "Visa", shortLabel: "VI" },
  { key: "mastercard", label: "Mastercard", shortLabel: "MC" },
  { key: "elo", label: "Elo", shortLabel: "EL" },
  { key: "solverfin_demo", label: "SolverFin Demo", shortLabel: "SF" },
] as const;

export async function renderAccountsCardsPage(token: string): Promise<string> {
  const [accounts, cards] = await Promise.all([
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts?status=all"),
    apiGet<{ cards: CardRecord[] }>(token, "/api/cards?status=all"),
  ]);

  if (!accounts.ok) return renderApiErrorPage("/contas-cartoes", "Contas e Cartões", accounts.error);
  if (!cards.ok) return renderApiErrorPage("/contas-cartoes", "Contas e Cartões", cards.error);

  const accountItems = accounts.data.accounts;
  const cardItems = cards.data.cards;

  return renderAuthenticatedPage({
    pathname: "/contas-cartoes",
    currentLabel: "Contas e Cartões",
    content: `
      <section class="master-heading">
        <div>
          <p class="eyebrow">Cadastros financeiros</p>
          <h1>Contas e Cartões</h1>
          <p class="muted">Mantenha contas, dinheiro, investimentos e cartões em um único cadastro mestre.</p>
        </div>
        <div class="master-actions" aria-label="Ações principais">
          <button type="button" data-open-dialog="new-account-dialog">Nova conta</button>
          <button type="button" data-open-dialog="new-card-dialog">Novo cartão</button>
        </div>
      </section>

      <section class="master-toolbar" aria-label="Filtros da lista">
        <div class="tab-list" role="tablist" aria-label="Tipo de cadastro">
          <button type="button" class="tab-button" data-tab="accounts" aria-selected="true">Contas bancárias <span>${accountItems.length}</span></button>
          <button type="button" class="tab-button" data-tab="cards" aria-selected="false">Cartões de crédito <span>${cardItems.length}</span></button>
          <button type="button" class="tab-button" data-tab="connections" aria-selected="false">Conexões</button>
        </div>
        <div class="filter-row">
          <label>Buscar<input data-master-search type="search" placeholder="Nome, instituição ou final mascarado" /></label>
          <label>Status
            <select data-master-status>
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </label>
        </div>
      </section>

      <section class="master-panel" data-tab-panel="accounts">
        <div class="section-heading">
          <div>
            <h2>Contas bancárias</h2>
            <p class="muted">Use para saldos, extrato, dinheiro, aplicações e contas de pagamento.</p>
          </div>
          <span>${countActive(accountItems)} ativas</span>
        </div>
        <div class="master-list" data-master-list>
          ${accountItems.map(renderAccountItem).join("") || renderEmptyState("Nenhuma conta cadastrada.", "Crie uma conta para iniciar saldos e lançamentos.")}
        </div>
      </section>

      <section class="master-panel" data-tab-panel="cards" hidden>
        <div class="section-heading">
          <div>
            <h2>Cartões de crédito</h2>
            <p class="muted">Cadastre dados básicos do cartão sem misturar com compras e faturas.</p>
          </div>
          <span>${countActive(cardItems)} ativos</span>
        </div>
        <div class="master-list" data-master-list>
          ${cardItems.map((card) => renderCardItem(card, accountItems)).join("") || renderEmptyState("Nenhum cartão cadastrado.", "Crie um cartão para vincular limite, vencimento e conta de pagamento.")}
        </div>
      </section>

      <section class="master-panel" data-tab-panel="connections" hidden>
        ${renderEmptyState("Conexões ficam para uma próxima etapa.", "Esta tela está preparada para receber integrações quando houver suporte, sem prometer automação bancária direta.")}
      </section>

      ${renderAccountDialog()}
      ${renderCardDialog(accountItems)}
      ${apiFormScript()}
      ${masterPageScript()}
    `,
  });
}

function renderAccountItem(account: AccountRecord): string {
  const institution = findInstitution(account.institutionKey);
  const search = [account.name, institution.label, account.maskedIdentifier ?? "", account.kind, account.status]
    .join(" ")
    .toLowerCase();

  return `
    <article class="master-item" data-master-item data-status="${escapeHtml(account.status)}" data-search="${escapeHtml(search)}">
      <div class="identity-mark" aria-hidden="true">${escapeHtml(institution.shortLabel)}</div>
      <div class="item-main">
        <div class="item-title-row">
          <strong>${escapeHtml(account.name)}</strong>
          <span class="status-pill">${escapeHtml(formatGenericStatus(account.status))}</span>
        </div>
        <p>${escapeHtml(formatAccountKind(account.kind))} · ${escapeHtml(institution.label)} · ${escapeHtml(account.currency ?? "BRL")}${account.maskedIdentifier ? ` · ${escapeHtml(account.maskedIdentifier)}` : ""}</p>
      </div>
      <strong class="amount-text">${formatMoney(account.openingBalanceMinor ?? 0)}</strong>
      <details class="edit-panel">
        <summary>Editar cadastro</summary>
        <form data-api-form data-api-method="PATCH" data-api-path="/api/accounts/${escapeHtml(account.id)}" class="edit-grid">
          <label>Nome<input name="name" value="${escapeHtml(account.name)}" required /></label>
          <label>Tipo<select name="kind">${renderAccountKindOptions(account.kind)}</select></label>
          <label>Instituição<select name="institutionKey">${renderInstitutionOptions(account.institutionKey)}</select></label>
          <label>Moeda<input name="currency" value="${escapeHtml(account.currency ?? "BRL")}" maxlength="3" /></label>
          <label>Saldo inicial (R$)<input name="openingBalanceMinor" data-money value="${formatMoneyInput(account.openingBalanceMinor ?? 0)}" inputmode="decimal" /></label>
          <label>Identificador mascarado<input name="maskedIdentifier" value="${escapeHtml(account.maskedIdentifier ?? "")}" placeholder="Ex.: final 1234" /></label>
          <label>Status<select name="status">${renderAccountStatusOptions(account.status)}</select></label>
          <button type="submit">Salvar conta</button>
        </form>
      </details>
    </article>
  `;
}

function renderCardItem(card: CardRecord, accounts: AccountRecord[]): string {
  const institution = findInstitution(card.institutionKey);
  const brand = findCardBrand(card.brandKey);
  const paymentAccount = accounts.find((account) => account.id === card.paymentAccountId);
  const search = [card.name, institution.label, brand.label, card.maskedIdentifier ?? "", card.status]
    .join(" ")
    .toLowerCase();

  return `
    <article class="master-item" data-master-item data-status="${escapeHtml(card.status)}" data-search="${escapeHtml(search)}">
      <div class="identity-mark card-mark" aria-hidden="true">${escapeHtml(brand.shortLabel)}</div>
      <div class="item-main">
        <div class="item-title-row">
          <strong>${escapeHtml(card.name)}</strong>
          <span class="status-pill">${escapeHtml(formatGenericStatus(card.status))}</span>
        </div>
        <p>${escapeHtml(institution.label)} · ${escapeHtml(brand.label)} · fecha ${card.closingDay}, vence ${card.dueDay}${card.maskedIdentifier ? ` · ${escapeHtml(card.maskedIdentifier)}` : ""}</p>
        <p class="muted">Conta de pagamento: ${escapeHtml(paymentAccount?.name ?? "não vinculada")}</p>
      </div>
      <strong class="amount-text">${formatMoney(card.creditLimitMinor ?? 0)}</strong>
      <details class="edit-panel">
        <summary>Editar cadastro</summary>
        <form data-api-form data-api-method="PATCH" data-api-path="/api/cards/${escapeHtml(card.id)}" class="edit-grid">
          <label>Nome<input name="name" value="${escapeHtml(card.name)}" required /></label>
          <label>Instituição<select name="institutionKey">${renderInstitutionOptions(card.institutionKey)}</select></label>
          <label>Bandeira<select name="brandKey">${renderCardBrandOptions(card.brandKey)}</select></label>
          <label>Fecha dia<input name="closingDay" type="number" min="1" max="31" value="${card.closingDay}" required /></label>
          <label>Vence dia<input name="dueDay" type="number" min="1" max="31" value="${card.dueDay}" required /></label>
          <label>Limite (R$)<input name="creditLimitMinor" data-money value="${formatMoneyInput(card.creditLimitMinor ?? 0)}" inputmode="decimal" /></label>
          <label>Conta de pagamento<select name="paymentAccountId"><option value="">Não vinculada</option>${renderAccountOptions(accounts, card.paymentAccountId)}</select></label>
          <label>Identificador mascarado<input name="maskedIdentifier" value="${escapeHtml(card.maskedIdentifier ?? "")}" placeholder="Ex.: final 9876" /></label>
          <label>Status<select name="status">${renderCardStatusOptions(card.status)}</select></label>
          <button type="submit">Salvar cartão</button>
        </form>
      </details>
    </article>
  `;
}

function renderAccountDialog(): string {
  return `
    <dialog id="new-account-dialog" class="master-dialog" aria-labelledby="new-account-title">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div>
        <p class="eyebrow">Novo cadastro</p>
        <h2 id="new-account-title">Nova conta</h2>
      </div>
      <form data-api-form data-api-path="/api/accounts" class="edit-grid">
        <label>Nome<input name="name" required /></label>
        <label>Tipo<select name="kind" required>${renderAccountKindOptions()}</select></label>
        <label>Instituição<select name="institutionKey">${renderInstitutionOptions()}</select></label>
        <label>Moeda<input name="currency" value="BRL" maxlength="3" /></label>
        <label>Saldo inicial (R$)<input name="openingBalanceMinor" data-money inputmode="decimal" placeholder="0,00" /></label>
        <label>Identificador mascarado<input name="maskedIdentifier" placeholder="Ex.: final 1234" /></label>
        <button type="submit">Criar conta</button>
      </form>
    </dialog>
  `;
}

function renderCardDialog(accounts: AccountRecord[]): string {
  return `
    <dialog id="new-card-dialog" class="master-dialog" aria-labelledby="new-card-title">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div>
        <p class="eyebrow">Novo cadastro</p>
        <h2 id="new-card-title">Novo cartão</h2>
      </div>
      <form data-api-form data-api-path="/api/cards" class="edit-grid">
        <label>Nome<input name="name" required /></label>
        <label>Instituição<select name="institutionKey">${renderInstitutionOptions()}</select></label>
        <label>Bandeira<select name="brandKey">${renderCardBrandOptions()}</select></label>
        <label>Fecha dia<input name="closingDay" type="number" min="1" max="31" required /></label>
        <label>Vence dia<input name="dueDay" type="number" min="1" max="31" required /></label>
        <label>Limite (R$)<input name="creditLimitMinor" data-money inputmode="decimal" placeholder="0,00" /></label>
        <label>Conta de pagamento<select name="paymentAccountId"><option value="">Não vinculada</option>${renderAccountOptions(accounts)}</select></label>
        <label>Identificador mascarado<input name="maskedIdentifier" placeholder="Ex.: final 9876" /></label>
        <button type="submit">Criar cartão</button>
      </form>
    </dialog>
  `;
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
      <section class="master-panel placeholder-state">
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
    </script>
  `;
}

function masterPageScript(): string {
  return `
    <script>
      const searchInput = document.querySelector("[data-master-search]");
      const statusSelect = document.querySelector("[data-master-status]");
      const panels = Array.from(document.querySelectorAll("[data-tab-panel]"));
      const tabButtons = Array.from(document.querySelectorAll("[data-tab]"));

      function applyFilters() {
        const term = String(searchInput && searchInput.value || "").trim().toLowerCase();
        const status = String(statusSelect && statusSelect.value || "all");
        const visiblePanel = panels.find((panel) => !panel.hidden);
        if (!visiblePanel) return;

        visiblePanel.querySelectorAll("[data-master-item]").forEach((item) => {
          const itemStatus = item.dataset.status;
          const matchesSearch = !term || item.dataset.search.includes(term);
          const matchesStatus = status === "all" || (status === "active" ? itemStatus === "active" : itemStatus !== "active");
          item.hidden = !(matchesSearch && matchesStatus);
        });
      }

      tabButtons.forEach((button) => {
        button.addEventListener("click", () => {
          const tab = button.dataset.tab;
          tabButtons.forEach((candidate) => candidate.setAttribute("aria-selected", String(candidate === button)));
          panels.forEach((panel) => { panel.hidden = panel.dataset.tabPanel !== tab; });
          applyFilters();
        });
      });

      [searchInput, statusSelect].forEach((control) => control && control.addEventListener("input", applyFilters));

      document.querySelectorAll("[data-open-dialog]").forEach((button) => {
        button.addEventListener("click", () => {
          const dialog = document.getElementById(button.dataset.openDialog);
          if (dialog && typeof dialog.showModal === "function") dialog.showModal();
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

function renderEmptyState(title: string, description: string): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(description)}</p></div>`;
}

function renderInstitutionOptions(selected?: string): string {
  return institutions
    .map((item) => `<option value="${escapeHtml(item.key)}"${selected === item.key ? " selected" : ""}>${escapeHtml(item.label)}</option>`)
    .join("");
}

function renderCardBrandOptions(selected?: string): string {
  return cardBrands
    .map((item) => `<option value="${escapeHtml(item.key)}"${selected === item.key ? " selected" : ""}>${escapeHtml(item.label)}</option>`)
    .join("");
}

function renderAccountKindOptions(selected?: string): string {
  return [
    ["checking", "Conta corrente"],
    ["savings", "Poupança"],
    ["cash", "Dinheiro"],
    ["investment", "Aplicação/investimento"],
    ["other", "Outros"],
  ]
    .map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`)
    .join("");
}

function renderAccountStatusOptions(selected?: string): string {
  return [
    ["active", "Ativa"],
    ["archived", "Arquivada"],
  ]
    .map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`)
    .join("");
}

function renderCardStatusOptions(selected?: string): string {
  return [
    ["active", "Ativo"],
    ["blocked", "Bloqueado"],
    ["archived", "Arquivado"],
  ]
    .map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`)
    .join("");
}

function renderAccountOptions(accounts: AccountRecord[], selected?: string): string {
  return accounts
    .map((account) => `<option value="${escapeHtml(account.id)}"${selected === account.id ? " selected" : ""}>${escapeHtml(account.name)}</option>`)
    .join("");
}

function findInstitution(key: string | undefined) {
  return institutions.find((item) => item.key === key) ?? institutions[0];
}

function findCardBrand(key: string | undefined) {
  return cardBrands.find((item) => item.key === key) ?? cardBrands[0];
}

function countActive(items: Array<{ status: string }>): number {
  return items.filter((item) => item.status === "active").length;
}

function formatMoney(amountMinor: number): string {
  return formatMinorCurrency(amountMinor);
}

function formatMoneyInput(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2).replace(".", ",");
}

function formatAccountKind(kind: string): string {
  if (kind === "checking") return "Conta corrente";
  if (kind === "savings") return "Poupança";
  if (kind === "cash") return "Dinheiro";
  if (kind === "investment") return "Aplicação/investimento";
  if (kind === "other") return "Outros";
  return kind;
}

function formatGenericStatus(status: string): string {
  if (status === "active") return "Ativo";
  if (status === "archived") return "Arquivado";
  if (status === "blocked") return "Bloqueado";
  return status;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface AccountRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
  openingBalanceMinor?: number;
  currency?: string;
  maskedIdentifier?: string;
  institutionKey?: string;
}

interface CardRecord {
  id: string;
  name: string;
  status: string;
  closingDay: number;
  dueDay: number;
  creditLimitMinor?: number;
  maskedIdentifier?: string;
  institutionKey?: string;
  brandKey?: string;
  paymentAccountId?: string;
}

function baseCss(): string {
  return `
    :root { color-scheme: light; --bg: #f8fafc; --surface: #ffffff; --surface-soft: #eef5f8; --text: #0f172a; --muted: #475569; --line: #cbd5e1; --primary: #0f3d4c; --primary-soft: #e8f3f6; --cyan: #0891b2; --success: #166534; --success-bg: #dcfce7; --danger: #dc2626; --danger-bg: #fee2e2; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    h1, h2, p { margin: 0; } h1 { font-size: 2rem; line-height: 1.15; } h2 { font-size: 1rem; line-height: 1.3; } a { color: inherit; }
    button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible { outline: 3px solid rgba(34, 211, 238, .55); outline-offset: 2px; }
    button, .button-link { align-items: center; background: var(--primary); border: 0; border-radius: 8px; color: white; cursor: pointer; display: inline-flex; font: inherit; font-weight: 800; justify-content: center; min-height: 44px; padding: 0 16px; text-decoration: none; }
    button:disabled { cursor: not-allowed; opacity: .58; } .secondary-button { background: var(--primary-soft); border: 1px solid #d4e6ec; color: var(--primary); }
    form, label { display: grid; gap: 10px; } label { color: var(--text); font-weight: 700; } input, select { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; color: var(--text); font: inherit; min-height: 44px; padding: 0 12px; width: 100%; }
    .eyebrow { color: var(--cyan); font-size: .78rem; font-weight: 800; letter-spacing: 0; text-transform: uppercase; } .muted { color: var(--muted); line-height: 1.5; }
    .error { background: var(--danger-bg); border: 1px solid #fecaca; border-radius: 8px; color: var(--danger); padding: 10px 12px; } .success { background: var(--success-bg); border: 1px solid #bbf7d0; border-radius: 8px; color: var(--success); padding: 10px 12px; } .form-status { grid-column: 1 / -1; }
    .app-shell { display: grid; grid-template-columns: 248px minmax(0, 1fr); min-height: 100vh; } .sidebar { background: var(--primary); color: white; display: flex; flex-direction: column; gap: 22px; padding: 22px; }
    .brand { align-items: center; display: inline-flex; font-size: 1.2rem; font-weight: 900; min-height: 44px; text-decoration: none; } nav { display: grid; gap: 6px; } nav a { border-radius: 8px; color: rgba(255,255,255,.82); font-weight: 800; min-height: 40px; padding: 10px 12px; text-decoration: none; } nav a:hover, nav a[aria-current="page"] { background: rgba(34,211,238,.18); color: white; }
    .logout { background: rgba(255,255,255,.12); margin-top: auto; } .main-area { min-width: 0; } .topbar { align-items: center; background: rgba(255,255,255,.92); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; min-height: 64px; padding: 0 24px; position: sticky; top: 0; z-index: 5; } .topbar div { display: grid; gap: 2px; } .topbar span { color: var(--muted); font-size: .875rem; }
    main { display: grid; gap: 18px; margin: 0 auto; max-width: 1180px; padding: 24px; width: 100%; }
    .master-heading { align-items: end; display: flex; gap: 16px; justify-content: space-between; } .master-heading > div:first-child { display: grid; gap: 6px; max-width: 720px; } .master-actions { display: flex; flex-wrap: wrap; gap: 10px; }
    .master-toolbar, .master-panel { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 16px; padding: 16px; }
    .tab-list { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: 8px; display: flex; gap: 6px; padding: 6px; } .tab-button { background: transparent; color: var(--primary); flex: 1 1 0; gap: 8px; min-width: 0; } .tab-button[aria-selected="true"] { background: var(--surface); border: 1px solid #d4e6ec; color: var(--text); } .tab-button span, .section-heading > span, .status-pill { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: .78rem; font-weight: 800; padding: 5px 9px; white-space: nowrap; }
    .filter-row { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr) minmax(12rem, .25fr); }
    .section-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .section-heading > div { display: grid; gap: 4px; }
    .master-list { display: grid; gap: 12px; } .master-item { align-items: start; border-top: 1px solid var(--line); display: grid; gap: 14px; grid-template-columns: 44px minmax(0, 1fr) auto; padding-top: 14px; } .master-item:first-child { border-top: 0; padding-top: 0; }
    .identity-mark { align-items: center; background: var(--primary); border-radius: 8px; color: white; display: flex; font-weight: 900; height: 44px; justify-content: center; width: 44px; } .card-mark { background: var(--cyan); }
    .item-main { display: grid; gap: 5px; min-width: 0; } .item-main p { color: var(--muted); line-height: 1.45; } .item-title-row { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; } .amount-text { text-align: right; white-space: nowrap; }
    .edit-panel { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: 8px; grid-column: 1 / -1; padding: 12px; } .edit-panel summary { cursor: pointer; font-weight: 800; min-height: 32px; } .edit-grid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 12px; } .edit-grid button, .edit-grid .form-status { grid-column: 1 / -1; }
    .empty-state { background: var(--bg); border: 1px dashed var(--line); border-radius: 8px; display: grid; gap: 6px; padding: 16px; }
    .master-dialog { border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 24px 80px rgba(15,23,42,.18); max-width: 760px; padding: 20px; width: calc(100% - 32px); } .master-dialog::backdrop { background: rgba(15,23,42,.38); } .dialog-close-form { display: flex; justify-content: flex-end; margin-bottom: 12px; }
    @media (max-width: 900px) { .edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .master-heading { align-items: stretch; display: grid; } }
    @media (max-width: 760px) { .app-shell { grid-template-columns: 1fr; } .sidebar { gap: 12px; padding: 12px 16px; position: sticky; top: 0; z-index: 10; } .sidebar .logout { display: none; } nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; } nav a { background: rgba(255,255,255,.1); flex: 0 0 auto; min-height: 44px; white-space: nowrap; } .topbar { min-height: 56px; padding: 0 16px; position: static; } .topbar button { display: none; } main { padding: 18px 16px 28px; } h1 { font-size: 1.65rem; } .tab-list, .master-actions { display: grid; } .filter-row, .edit-grid, .master-item, .section-heading { display: grid; grid-template-columns: 1fr; } .amount-text { text-align: left; white-space: normal; } }
  `;
}
