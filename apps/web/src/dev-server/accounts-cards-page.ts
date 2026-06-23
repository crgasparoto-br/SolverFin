import { formatMinorCurrency } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { privateRoutes } from "./routes.js";

const fallbackInstitution = { key: "", label: "Sem instituição", shortLabel: "SF" } as const;
const fallbackCardBrand = { key: "", label: "Sem bandeira", shortLabel: "--" } as const;

const institutions = [
  fallbackInstitution,
  { key: "bradesco", label: "Bradesco", shortLabel: "BR" },
  { key: "inter", label: "Inter", shortLabel: "IN" },
  { key: "c6", label: "C6 Bank", shortLabel: "C6" },
  { key: "caixa", label: "Caixa", shortLabel: "CX" },
  { key: "porto_bank", label: "Porto Bank", shortLabel: "PB" },
  { key: "solverfin_demo", label: "SolverFin Demo", shortLabel: "SF" },
] as const;

const cardBrands = [
  fallbackCardBrand,
  { key: "visa", label: "Visa", shortLabel: "VI" },
  { key: "mastercard", label: "Mastercard", shortLabel: "MC" },
  { key: "elo", label: "Elo", shortLabel: "EL" },
  { key: "solverfin_demo", label: "SolverFin Demo", shortLabel: "SF" },
] as const;

const accountCurrencies = ["BRL", "USD", "EUR"] as const;

export async function renderAccountsCardsPage(token: string): Promise<string> {
  const [accounts, cards, cardAdditionalLinks] = await Promise.all([
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts?status=all"),
    apiGet<{ cards: CardRecord[] }>(token, "/api/cards?status=all"),
    apiGet<{ links: CardAdditionalLinkRecord[] }>(token, "/api/card-additional-links"),
  ]);

  if (!accounts.ok)
    return renderApiErrorPage("/contas-cartoes", "Contas e Cartões", accounts.error);
  if (!cards.ok) return renderApiErrorPage("/contas-cartoes", "Contas e Cartões", cards.error);

  const accountItems = accounts.data.accounts;
  const cardItems = cards.data.cards;
  const links = cardAdditionalLinks.ok ? cardAdditionalLinks.data.links : [];
  const additionalCardIds = new Set(
    links.filter((link) => link.cardId !== link.groupCardId).map((link) => link.cardId),
  );
  const mainCardItems = cardItems.filter((card) => !additionalCardIds.has(card.id));
  const additionalCardItems = cardItems.filter((card) => additionalCardIds.has(card.id));

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
          <button type="button" data-open-dialog="new-account-dialog">Adicionar conta</button>
          <button type="button" data-open-dialog="new-card-dialog">Adicionar cartão</button>
        </div>
      </section>

      <section class="master-toolbar" aria-label="Filtros da lista">
        <div class="tab-list" role="tablist" aria-label="Tipo de cadastro">
          <button id="accounts-tab" type="button" role="tab" class="tab-button" data-tab="accounts" aria-controls="accounts-panel" aria-selected="true">Contas bancárias <span>${accountItems.length}</span></button>
          <button id="cards-tab" type="button" role="tab" class="tab-button" data-tab="cards" aria-controls="cards-panel" aria-selected="false">Cartões de crédito <span>${mainCardItems.length}</span></button>
          <button id="connections-tab" type="button" role="tab" class="tab-button" data-tab="connections" aria-controls="connections-panel" aria-selected="false">Conexões</button>
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

      <section id="accounts-panel" class="master-panel" data-tab-panel="accounts" role="tabpanel" aria-labelledby="accounts-tab">
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
        ${renderFilterEmptyState("Nenhuma conta encontrada.")}
      </section>

      <section id="cards-panel" class="master-panel" data-tab-panel="cards" role="tabpanel" aria-labelledby="cards-tab" hidden>
        <div class="section-heading">
          <div>
            <h2>Cartões de crédito</h2>
            <p class="muted">Cadastre dados básicos do cartão sem misturar com compras e faturas.</p>
          </div>
          <span>${countActive(mainCardItems)} ativos</span>
        </div>
        <div class="master-list" data-master-list>
          ${mainCardItems.map((card) => renderCardItem(card, accountItems)).join("") || renderEmptyState("Nenhum cartão cadastrado.", "Crie um cartão para vincular limite, vencimento e conta de pagamento.")}
        </div>
        ${renderFilterEmptyState("Nenhum cartão encontrado.")}
      </section>
      ${additionalCardItems.map((card) => renderCardEditDialog(card, accountItems, `edit-card-dialog-${card.id}`)).join("")}

      <section id="connections-panel" class="master-panel" data-tab-panel="connections" role="tabpanel" aria-labelledby="connections-tab" hidden>
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
  const search = [
    account.name,
    institution.label,
    account.maskedIdentifier ?? "",
    account.kind,
    account.status,
  ]
    .join(" ")
    .toLowerCase();
  const editDialogId = `edit-account-dialog-${account.id}`;
  const isArchived = account.status === "archived";

  return `
    <article class="master-item" data-master-item data-status="${escapeHtml(account.status)}" data-search="${escapeHtml(search)}">
      <div class="identity-mark" aria-hidden="true">${renderInstitutionIcon(institution.key)}</div>
      <div class="item-main">
        <div class="item-title-row">
          <strong>${escapeHtml(account.name)}</strong>
          <span class="status-pill">${escapeHtml(formatGenericStatus(account.status))}</span>
        </div>
        <p>${escapeHtml(formatAccountKind(account.kind))} · ${escapeHtml(institution.label)} · ${escapeHtml(account.currency ?? "BRL")}${account.maskedIdentifier ? ` · ${escapeHtml(account.maskedIdentifier)}` : ""}</p>
      </div>
      <div class="amount-stack"><span>Saldo inicial</span><strong>${formatMoney(account.openingBalanceMinor ?? 0)}</strong></div>
      <div class="item-actions" aria-label="Ações de ${escapeHtml(account.name)}">
        <button type="button" class="icon-button" data-open-dialog="${escapeHtml(editDialogId)}" aria-label="Editar cadastro de ${escapeHtml(account.name)}">${renderEditIcon()}</button>
        <form data-api-form data-api-path="/api/accounts/${escapeHtml(account.id)}/archive" data-confirm="Inativar ${escapeHtml(account.name)}? Esta conta deixará de aparecer nas operações ativas." class="inline-action-form">
          <button type="submit" class="icon-button danger-icon-button" aria-label="Inativar ${escapeHtml(account.name)}"${isArchived ? " disabled" : ""}>${renderArchiveIcon()}</button>
        </form>
      </div>
      ${renderAccountEditDialog(account, editDialogId)}
    </article>
  `;
}

function renderCardItem(card: CardRecord, accounts: AccountRecord[]): string {
  const institution = findInstitution(card.institutionKey);
  const brand = findCardBrand(card.brandKey);
  const paymentAccount = accounts.find((account) => account.id === card.paymentAccountId);
  const search = [
    card.name,
    institution.label,
    brand.label,
    card.maskedIdentifier ?? "",
    card.status,
  ]
    .join(" ")
    .toLowerCase();
  const editDialogId = `edit-card-dialog-${card.id}`;
  const isArchived = card.status === "archived";

  return `
    <article class="master-item" data-master-item data-status="${escapeHtml(card.status)}" data-search="${escapeHtml(search)}">
      <div class="identity-mark card-mark" aria-hidden="true">${renderCardBrandIcon(brand.key)}</div>
      <div class="item-main">
        <div class="item-title-row">
          <strong>${escapeHtml(card.name)}</strong>
          <span class="status-pill">${escapeHtml(formatGenericStatus(card.status))}</span>
        </div>
        <p>${escapeHtml(institution.label)} · ${escapeHtml(brand.label)} · fecha ${card.closingDay}, vence ${card.dueDay}${card.maskedIdentifier ? ` · ${escapeHtml(card.maskedIdentifier)}` : ""}</p>
        <p class="muted">Conta de pagamento: ${escapeHtml(paymentAccount?.name ?? "não vinculada")}</p>
      </div>
      <div class="amount-stack"><span>Limite</span><strong>${formatMoney(card.creditLimitMinor ?? 0)}</strong></div>
      <div class="item-actions" aria-label="Ações de ${escapeHtml(card.name)}">
        <button type="button" class="icon-button" data-open-dialog="${escapeHtml(editDialogId)}" aria-label="Editar cadastro de ${escapeHtml(card.name)}">${renderEditIcon()}</button>
        <form data-api-form data-api-path="/api/cards/${escapeHtml(card.id)}/archive" data-confirm="Inativar ${escapeHtml(card.name)}? Este cartão deixará de aparecer nas operações ativas." class="inline-action-form">
          <button type="submit" class="icon-button danger-icon-button" aria-label="Inativar ${escapeHtml(card.name)}"${isArchived ? " disabled" : ""}>${renderArchiveIcon()}</button>
        </form>
      </div>
      ${renderCardEditDialog(card, accounts, editDialogId)}
    </article>
  `;
}

function renderAccountEditDialog(account: AccountRecord, dialogId: string): string {
  const titleId = `${dialogId}-title`;

  return `
    <dialog id="${escapeHtml(dialogId)}" class="master-dialog" aria-labelledby="${escapeHtml(titleId)}">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
        <p class="eyebrow">Editar cadastro</p>
        <h2 id="${escapeHtml(titleId)}">${escapeHtml(account.name)}</h2>
      </div>
      <form data-api-form data-api-method="PATCH" data-api-path="/api/accounts/${escapeHtml(account.id)}" class="edit-grid">
        <label>Nome<input name="name" value="${escapeHtml(account.name)}" required /></label>
        <label>Tipo<select name="kind">${renderAccountKindOptions(account.kind)}</select></label>
        <label>Instituição<select name="institutionKey">${renderInstitutionOptions(account.institutionKey)}</select></label>
        <label>Moeda<select name="currency">${renderCurrencyOptions(account.currency)}</select></label>
        <label>Saldo inicial (R$)<input name="openingBalanceMinor" data-money value="${formatMoneyInput(account.openingBalanceMinor ?? 0)}" inputmode="decimal" /></label>
        <label>Nº Conta<input name="maskedIdentifier" value="${escapeHtml(account.maskedIdentifier ?? "")}" /></label>
        <button type="submit">Salvar conta</button>
      </form>
    </dialog>
  `;
}

function renderCardEditDialog(
  card: CardRecord,
  accounts: AccountRecord[],
  dialogId: string,
): string {
  const titleId = `${dialogId}-title`;

  return `
    <dialog id="${escapeHtml(dialogId)}" class="master-dialog" aria-labelledby="${escapeHtml(titleId)}">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
        <p class="eyebrow">Editar cadastro</p>
        <h2 id="${escapeHtml(titleId)}">${escapeHtml(card.name)}</h2>
      </div>
      <form data-api-form data-api-method="PATCH" data-api-path="/api/cards/${escapeHtml(card.id)}" class="edit-grid">
        <label>Nome<input name="name" value="${escapeHtml(card.name)}" required /></label>
        <label>Instituição<select name="institutionKey">${renderInstitutionOptions(card.institutionKey)}</select></label>
        <label>Bandeira<select name="brandKey">${renderCardBrandOptions(card.brandKey)}</select></label>
        <label>Fecha dia<input name="closingDay" type="number" min="1" max="31" value="${card.closingDay}" required /></label>
        <label>Vence dia<input name="dueDay" type="number" min="1" max="31" value="${card.dueDay}" required /></label>
        <label>Limite (R$)<input name="creditLimitMinor" data-money value="${formatMoneyInput(card.creditLimitMinor ?? 0)}" inputmode="decimal" /></label>
        <label>Conta de pagamento<select name="paymentAccountId"><option value="">Não vinculada</option>${renderAccountOptions(accounts, card.paymentAccountId)}</select></label>
        <label>Final do Cartão<input name="maskedIdentifier" value="${escapeHtml(card.maskedIdentifier ?? "")}" placeholder="Ex.: final 9876" /></label>
        <button type="submit">Salvar cartão</button>
      </form>
    </dialog>
  `;
}

function renderAccountDialog(): string {
  return `
    <dialog id="new-account-dialog" class="master-dialog" aria-labelledby="new-account-title">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
        <p class="eyebrow">Novo cadastro</p>
        <h2 id="new-account-title">Nova conta</h2>
      </div>
      <form data-api-form data-api-path="/api/accounts" class="edit-grid">
        <label>Nome<input name="name" required /></label>
        <label>Tipo<select name="kind" required>${renderAccountKindOptions()}</select></label>
        <label>Instituição<select name="institutionKey">${renderInstitutionOptions()}</select></label>
        <label>Moeda<select name="currency">${renderCurrencyOptions()}</select></label>
        <label>Saldo inicial (R$)<input name="openingBalanceMinor" data-money inputmode="decimal" placeholder="0,00" /></label>
        <label>Nº Conta<input name="maskedIdentifier" /></label>
        <button type="submit">Criar conta</button>
      </form>
    </dialog>
  `;
}

function renderCardDialog(accounts: AccountRecord[]): string {
  return `
    <dialog id="new-card-dialog" class="master-dialog" aria-labelledby="new-card-title">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
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
        <label>Final do Cartão<input name="maskedIdentifier" placeholder="Ex.: final 9876" /></label>
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
            payload[key] = Math.round(parseFloat(String(value).replace(/\\./g, "").replace(",", ".")) * 100);
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
          if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) return;

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
      const activeFilter = document.querySelector("[data-active-filter-input]");
      const panels = Array.from(document.querySelectorAll("[data-tab-panel]"));
      const tabButtons = Array.from(document.querySelectorAll("[data-tab]"));

      function maskMoneyValue(raw) {
        const digits = String(raw || "").replace(/\\D/g, "").replace(/^0+(?=\\d)/, "");
        if (digits.length === 0) return "";
        const padded = digits.padStart(3, "0");
        const cents = padded.slice(-2);
        const intPart = padded.slice(0, -2).replace(/^0+(?=\\d)/, "") || "0";
        const withThousands = intPart.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ".");
        return withThousands + "," + cents;
      }

      function wireMoneyInputs() {
        document.querySelectorAll("[data-money]").forEach((input) => {
          if (input.dataset.moneyMaskInstalled === "true") return;
          input.dataset.moneyMaskInstalled = "true";
          if (input.value) input.value = maskMoneyValue(input.value);
          input.addEventListener("input", () => {
            input.value = maskMoneyValue(input.value);
          });
        });
      }

      wireMoneyInputs();

      function readStatusFilter() {
        if (activeFilter) return activeFilter.checked ? "active" : "all";
        return String(statusSelect && statusSelect.value || "all");
      }

      function applyFilters() {
        const term = String(searchInput && searchInput.value || "").trim().toLowerCase();
        const status = readStatusFilter();
        const visiblePanel = panels.find((panel) => !panel.hidden);
        if (!visiblePanel) return;

        let visibleItems = 0;
        visiblePanel.querySelectorAll("[data-master-item]").forEach((item) => {
          const itemStatus = item.dataset.status;
          const matchesSearch = !term || String(item.dataset.search || "").includes(term);
          const matchesStatus = status === "all" || (status === "active" ? itemStatus === "active" : itemStatus !== "active");
          const isVisible = matchesSearch && matchesStatus;
          item.hidden = !isVisible;
          if (isVisible) visibleItems += 1;
        });

        const emptyState = visiblePanel.querySelector("[data-filter-empty]");
        if (emptyState) emptyState.hidden = visibleItems > 0 || visiblePanel.querySelectorAll("[data-master-item]").length === 0;
      }

      function activateTab(button, options) {
        const tab = button.dataset.tab;
        tabButtons.forEach((candidate) => {
          const isActive = candidate === button;
          candidate.setAttribute("aria-selected", String(isActive));
          candidate.tabIndex = isActive ? 0 : -1;
          candidate.classList.toggle("is-active", isActive);
        });
        panels.forEach((panel) => {
          const isActive = panel.dataset.tabPanel === tab;
          panel.hidden = !isActive;
          panel.setAttribute("aria-hidden", String(!isActive));
        });
        applyFilters();
        if (!options || options.focus !== false) button.focus();
      }

      function openDialog(button) {
        const dialogId = button.dataset.openDialog;
        const dialog = dialogId ? document.getElementById(dialogId) : null;
        if (!dialog) return;

        if (typeof dialog.showModal === "function") {
          if (!dialog.open) dialog.showModal();
        } else {
          dialog.setAttribute("open", "");
        }

        const firstField = dialog.querySelector("input, select, button");
        if (firstField && typeof firstField.focus === "function") firstField.focus();
      }

      function closeDialog(form) {
        const dialog = form.closest("dialog");
        if (!dialog) return;

        if (typeof dialog.close === "function") {
          dialog.close();
        } else {
          dialog.removeAttribute("open");
        }
      }

      tabButtons.forEach((button, index) => {
        button.tabIndex = button.getAttribute("aria-selected") === "true" ? 0 : -1;
        button.addEventListener("click", () => activateTab(button, { focus: false }));
        button.addEventListener("keydown", (event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
          event.preventDefault();
          const lastIndex = tabButtons.length - 1;
          const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? lastIndex : event.key === "ArrowRight" ? (index + 1) % tabButtons.length : (index - 1 + tabButtons.length) % tabButtons.length;
          activateTab(tabButtons[nextIndex]);
        });
      });

      [searchInput, statusSelect, activeFilter].forEach((control) => control && control.addEventListener("input", applyFilters));
      [statusSelect, activeFilter].forEach((control) => control && control.addEventListener("change", applyFilters));

      document.querySelectorAll("[data-open-dialog]").forEach((button) => {
        button.addEventListener("click", () => openDialog(button));
      });

      document.querySelectorAll(".dialog-close-form").forEach((form) => {
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          closeDialog(form);
        });
      });

      applyFilters();
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

function renderFilterEmptyState(title: string): string {
  return `<div class="empty-state filter-empty-state" data-filter-empty hidden><strong>${escapeHtml(title)}</strong><p class="muted">Ajuste a busca ou o filtro de status para ver outros cadastros.</p></div>`;
}

function renderInstitutionOptions(selected?: string): string {
  return institutions
    .map(
      (item) =>
        `<option value="${escapeHtml(item.key)}"${selected === item.key ? " selected" : ""}>${escapeHtml(item.label)}</option>`,
    )
    .join("");
}

function renderCardBrandOptions(selected?: string): string {
  return cardBrands
    .map(
      (item) =>
        `<option value="${escapeHtml(item.key)}"${selected === item.key ? " selected" : ""}>${escapeHtml(item.label)}</option>`,
    )
    .join("");
}

function renderCurrencyOptions(selected = "BRL"): string {
  return accountCurrencies
    .map(
      (currency) =>
        `<option value="${currency}"${selected === currency ? " selected" : ""}>${currency}</option>`,
    )
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
    .map(
      ([value, label]) =>
        `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`,
    )
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

function findInstitution(key: string | undefined) {
  return institutions.find((item) => item.key === key) ?? fallbackInstitution;
}

function findCardBrand(key: string | undefined) {
  return cardBrands.find((item) => item.key === key) ?? fallbackCardBrand;
}

function renderEditIcon(): string {
  return `<svg aria-hidden="true" class="action-icon" viewBox="0 0 24 24"><path d="M4 20h4.8L19.2 9.6a2.7 2.7 0 0 0 0-3.8l-1-1a2.7 2.7 0 0 0-3.8 0L4 15.2V20zm2-2v-2l9.8-9.8c.3-.3.7-.3 1 0l1 1c.3.3.3.7 0 1L8 18H6z" fill="currentColor"/></svg>`;
}

function renderArchiveIcon(): string {
  return `<svg aria-hidden="true" class="action-icon" viewBox="0 0 24 24"><path d="M5 5h14v4H5V5zm2 6h10v8H7v-8zm2 2v4h6v-4H9zM7 7v1h10V7H7z" fill="currentColor"/></svg>`;
}

function renderInstitutionIcon(key: string): string {
  if (key === "bradesco")
    return `<svg class="brand-icon" viewBox="0 0 44 44" role="img"><circle cx="22" cy="22" r="18" fill="#cc092f"/><path d="M14 24c2.2-6 7.9-9.6 14.8-9.6 1.5 0 2.9.2 4.2.6-2.8 1.2-4.9 3.4-6.2 6.4 3 .4 5.4 1.9 7.2 4.4-2.4-.7-4.8-.8-7-.2-1.8.5-3.4 1.6-4.7 3.2-1.7-3-4.7-4.7-8.3-4.8z" fill="#fff"/></svg>`;
  if (key === "inter")
    return `<svg class="brand-icon" viewBox="0 0 44 44" role="img"><circle cx="22" cy="22" r="18" fill="#ff7a00"/><rect x="14" y="11" width="5" height="22" rx="2.5" fill="#fff"/><path d="M22 14h4.5c4.3 0 7.5 3.2 7.5 8s-3.2 8-7.5 8H22V14zm5 11c1.6 0 2.8-1.2 2.8-3S28.6 19 27 19h-.4v6h.4z" fill="#fff"/></svg>`;
  if (key === "c6")
    return `<svg class="brand-icon" viewBox="0 0 44 44" role="img"><rect x="7" y="7" width="30" height="30" rx="9" fill="#111827"/><path d="M27 16.2c-1.3-1.2-3-1.9-5.1-1.9-4.5 0-7.8 3.3-7.8 7.7s3.3 7.7 7.8 7.7c2.2 0 4-.8 5.3-2.1l-2.7-3c-.6.7-1.5 1.1-2.6 1.1-2 0-3.3-1.5-3.3-3.7s1.3-3.7 3.3-3.7c1 0 1.8.4 2.5 1l2.6-3.1z" fill="#fff"/><circle cx="30" cy="28" r="3" fill="#22d3ee"/></svg>`;
  if (key === "caixa")
    return `<svg class="brand-icon" viewBox="0 0 44 44" role="img"><rect x="7" y="9" width="30" height="26" rx="7" fill="#005ca9"/><path d="M13 29 25.8 15h5.5L18.5 29H13z" fill="#f59e0b"/><path d="M14 15h6l6.5 7-3.1 3.4L14 15zm15.5 8.4L36 29h-6.1l-3.6-3.1 3.2-2.5z" fill="#fff"/></svg>`;
  if (key === "porto_bank")
    return `<svg class="brand-icon" viewBox="0 0 44 44" role="img"><path d="M22 6 36 12v9.5c0 8.5-5.8 13.8-14 16.5-8.2-2.7-14-8-14-16.5V12l14-6z" fill="#0b66c3"/><path d="M17 15h7.2c4.2 0 7 2.6 7 6.4s-2.8 6.4-7 6.4h-2.9V33H17V15zm6.8 8.9c1.7 0 2.8-.9 2.8-2.5s-1.1-2.5-2.8-2.5h-2.5v5h2.5z" fill="#fff"/></svg>`;
  if (key === "solverfin_demo")
    return `<svg class="brand-icon" viewBox="0 0 44 44" role="img"><rect x="7" y="7" width="30" height="30" rx="9" fill="#0f3d4c"/><path d="M14 27.5c4.1 0 4.1-11 8.2-11s4.1 11 8.8 11" fill="none" stroke="#22d3ee" stroke-width="4" stroke-linecap="round"/><circle cx="31" cy="27.5" r="3" fill="#fff"/></svg>`;
  return `<svg class="brand-icon" viewBox="0 0 44 44" role="img"><rect x="7" y="15" width="30" height="21" rx="4" fill="#0f3d4c"/><path d="M9 15 22 8l13 7H9z" fill="#22d3ee"/><path d="M14 19h4v12h-4V19zm6 0h4v12h-4V19zm6 0h4v12h-4V19z" fill="#fff"/></svg>`;
}

function renderCardBrandIcon(key: string): string {
  if (key === "visa")
    return `<svg class="brand-icon card-brand-icon" viewBox="0 0 44 44" role="img"><rect x="6" y="11" width="32" height="22" rx="6" fill="#fff"/><path d="M11 26h5.2l3.1-8h-4.2l-1.4 4.8-1.5-4.8H8l3 8zm10.2 0h4l1.4-8h-4l-1.4 8zm6.1 0h8.8l.7-3.1h-4.7l4.1-4.9h-8.4l-.7 3.1h4.1L27.3 26z" fill="#1a1f71"/><path d="M31.7 15h5.7l-1 2.5h-5.7l1-2.5z" fill="#f7b600"/></svg>`;
  if (key === "mastercard")
    return `<svg class="brand-icon card-brand-icon" viewBox="0 0 44 44" role="img"><rect x="6" y="11" width="32" height="22" rx="6" fill="#fff"/><circle cx="19" cy="22" r="8" fill="#eb001b"/><circle cx="25" cy="22" r="8" fill="#f79e1b" fill-opacity=".92"/><path d="M22 15.8a8 8 0 0 1 0 12.4 8 8 0 0 1 0-12.4z" fill="#ff5f00"/></svg>`;
  if (key === "elo")
    return `<svg class="brand-icon card-brand-icon" viewBox="0 0 44 44" role="img"><rect x="6" y="11" width="32" height="22" rx="6" fill="#fff"/><circle cx="15" cy="22" r="4" fill="#111827"/><path d="M24 16a6 6 0 1 0 5.7 7.9h-4.2a2.2 2.2 0 1 1 0-3.8h4.2A6 6 0 0 0 24 16z" fill="#111827"/><circle cx="32" cy="17" r="2.2" fill="#f59e0b"/><circle cx="34" cy="22" r="2.2" fill="#22c55e"/><circle cx="32" cy="27" r="2.2" fill="#2563eb"/></svg>`;
  if (key === "solverfin_demo")
    return `<svg class="brand-icon card-brand-icon" viewBox="0 0 44 44" role="img"><rect x="6" y="11" width="32" height="22" rx="6" fill="#0f3d4c"/><path d="M13 25c3.7 0 3.7-7 7.4-7s3.7 7 8.6 7" fill="none" stroke="#22d3ee" stroke-width="3.4" stroke-linecap="round"/><circle cx="31" cy="25" r="2.7" fill="#fff"/></svg>`;
  return `<svg class="brand-icon card-brand-icon" viewBox="0 0 44 44" role="img"><rect x="6" y="11" width="32" height="22" rx="6" fill="#fff"/><rect x="10" y="17" width="24" height="4" rx="2" fill="#0f3d4c"/><rect x="10" y="25" width="10" height="3" rx="1.5" fill="#22d3ee"/></svg>`;
}

function countActive(items: Array<{ status: string }>): number {
  return items.filter((item) => item.status === "active").length;
}

function formatMoney(amountMinor: number): string {
  return formatMinorCurrency(amountMinor);
}

function formatMoneyInput(amountMinor: number): string {
  const sign = amountMinor < 0 ? "-" : "";
  const [intPart, centsPart] = (Math.abs(amountMinor) / 100).toFixed(2).split(".") as [
    string,
    string,
  ];
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${withThousands},${centsPart}`;
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
    .replace(/"/g, "&quot;")
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

interface CardAdditionalLinkRecord {
  groupCardId: string;
  cardId: string;
  isPrimary: boolean;
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
    [hidden] { display: none !important; }
    .tab-list { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: 8px; display: flex; gap: 6px; padding: 6px; } .tab-button { background: transparent; color: var(--primary); flex: 1 1 0; gap: 8px; min-width: 0; } .tab-button[aria-selected="true"] { background: var(--surface); border: 1px solid #d4e6ec; color: var(--text); } .tab-button span, .section-heading > span, .status-pill { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: .78rem; font-weight: 800; padding: 5px 9px; white-space: nowrap; }
    .filter-row { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr) minmax(12rem, .25fr); }
    .section-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .section-heading > div { display: grid; gap: 4px; }
    .master-list { display: grid; gap: 12px; } .master-item { align-items: start; border-top: 1px solid var(--line); display: grid; gap: 14px; grid-template-columns: 44px minmax(0, 1fr) minmax(9rem, auto) auto; padding-top: 14px; } .master-item:first-child { border-top: 0; padding-top: 0; }
    .identity-mark { align-items: center; background: var(--primary-soft); border: 1px solid #d4e6ec; border-radius: 8px; color: white; display: flex; height: 44px; justify-content: center; overflow: hidden; width: 44px; } .card-mark { background: #f8fafc; }
    .brand-icon { display: block; height: 44px; width: 44px; } .card-brand-icon { filter: drop-shadow(0 1px 2px rgba(15,23,42,.14)); }
    .item-main { display: grid; gap: 5px; min-width: 0; } .item-main p { color: var(--muted); line-height: 1.45; } .item-title-row { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; } .amount-stack { display: grid; gap: 3px; justify-items: end; text-align: right; white-space: nowrap; } .amount-stack span { color: var(--muted); font-size: .76rem; font-weight: 800; text-transform: uppercase; } .amount-stack strong { color: var(--text); }
    .item-actions { display: flex; gap: 8px; justify-content: flex-end; } .inline-action-form { display: block; gap: 0; } .icon-button { background: var(--primary-soft); border: 1px solid #d4e6ec; color: var(--primary); min-height: 44px; padding: 0; width: 44px; } .danger-icon-button { background: var(--danger-bg); border-color: #fecaca; color: var(--danger); } .action-icon { display: block; height: 20px; width: 20px; }
    .edit-grid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 12px; } .edit-grid button, .edit-grid .form-status { grid-column: 1 / -1; }
    .empty-state { background: var(--bg); border: 1px dashed var(--line); border-radius: 8px; display: grid; gap: 6px; padding: 16px; }
    .filter-empty-state { margin-top: 4px; }
    .master-dialog { border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 24px 80px rgba(15,23,42,.18); max-width: 760px; padding: 20px; width: calc(100% - 32px); } .master-dialog::backdrop { background: rgba(15,23,42,.38); } .dialog-close-form { display: flex; justify-content: flex-end; margin-bottom: 12px; } .dialog-heading { display: grid; gap: 4px; }
    @media (max-width: 900px) { .edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .master-heading { align-items: stretch; display: grid; } .master-item { grid-template-columns: 44px minmax(0, 1fr) auto; } .item-actions { grid-column: 2 / -1; justify-content: flex-start; } }
    @media (max-width: 760px) { .app-shell { grid-template-columns: 1fr; } .sidebar { gap: 12px; padding: 12px 16px; position: sticky; top: 0; z-index: 10; } .sidebar .logout { display: none; } nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; } nav a { background: rgba(255,255,255,.1); flex: 0 0 auto; min-height: 44px; white-space: nowrap; } .topbar { min-height: 56px; padding: 0 16px; position: static; } .topbar button { display: none; } main { padding: 18px 16px 28px; } h1 { font-size: 1.65rem; } .tab-list, .master-actions { display: grid; } .filter-row, .edit-grid, .master-item, .section-heading { display: grid; grid-template-columns: 1fr; } .item-actions { grid-column: auto; justify-content: flex-start; } .amount-stack { justify-items: start; text-align: left; white-space: normal; } }
  `;
}
