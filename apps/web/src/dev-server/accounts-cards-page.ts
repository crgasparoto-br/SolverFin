import { formatMinorCurrency } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { findInstitution, institutions, renderInstitutionIcon } from "./institutions.js";
import { sharedShellStyles } from "./shared-styles.js";
import { renderAuthenticatedShellDocument } from "./shell.js";

const fallbackCardBrand = { key: "", label: "Sem bandeira", shortLabel: "--" } as const;

const cardBrands = [
  fallbackCardBrand,
  { key: "visa", label: "Visa", shortLabel: "VI" },
  { key: "mastercard", label: "Mastercard", shortLabel: "MC" },
  { key: "elo", label: "Elo", shortLabel: "EL" },
  { key: "solverfin_demo", label: "SolverFin Demo", shortLabel: "SF" },
] as const;

const accountCurrencies = ["BRL", "USD", "EUR"] as const;

export async function renderAccountsCardsPage(token: string): Promise<string> {
  const [accounts, creditCardAccounts] = await Promise.all([
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts?status=all"),
    apiGet<{ creditCardAccounts: CreditCardAccountRecord[] }>(
      token,
      "/api/credit-card-accounts?status=all",
    ),
  ]);

  if (!accounts.ok)
    return renderApiErrorPage("/contas-cartoes", "Contas e Cartões", accounts.error);
  if (!creditCardAccounts.ok)
    return renderApiErrorPage("/contas-cartoes", "Contas e Cartões", creditCardAccounts.error);

  const accountItems = accounts.data.accounts;
  const cardItems = creditCardAccounts.data.creditCardAccounts;

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
          <button id="cards-tab" type="button" role="tab" class="tab-button" data-tab="cards" aria-controls="cards-panel" aria-selected="false">Cartões de crédito <span>${cardItems.length}</span></button>
          <button id="connections-tab" type="button" role="tab" class="tab-button" data-tab="connections" aria-controls="connections-panel" aria-selected="false">Conexões</button>
        </div>
        <div class="filter-row">
          <label>Buscar<input data-master-search type="search" placeholder="Nome, instituição, bandeira ou instrumento" /></label>
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
            <p class="muted">Cadastre o cartão agrupador e acompanhe os instrumentos internos usados nas compras.</p>
          </div>
          <span>${countActive(cardItems)} ativos</span>
        </div>
        <div class="master-list" data-master-list>
          ${cardItems.map((card) => renderCardItem(card, accountItems)).join("") || renderEmptyState("Nenhum cartão cadastrado.", "Crie um cartão agrupador com ao menos um instrumento ativo para começar.")}
        </div>
        ${renderFilterEmptyState("Nenhum cartão encontrado.")}
      </section>

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
      <div class="identity-mark">${renderInstitutionIcon(institution.key)}</div>
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

function renderCardItem(card: CreditCardAccountRecord, accounts: AccountRecord[]): string {
  const institution = findInstitution(card.institutionKey);
  const brand = findCardBrand(card.brandKey);
  const paymentAccount = accounts.find((account) => account.id === card.paymentAccountId);
  const activeInstrumentCount = card.instruments.filter(
    (instrument) => instrument.status === "active",
  ).length;
  const search = [
    card.name,
    institution.label,
    brand.label,
    card.status,
    ...card.instruments.flatMap((instrument) => [
      instrument.name ?? "",
      instrument.maskedIdentifier ?? "",
      instrument.type,
      instrument.holder,
      instrument.status,
      instrument.isDefault ? "default" : "",
    ]),
  ]
    .join(" ")
    .toLowerCase();
  const editDialogId = `edit-card-dialog-${card.id}`;
  const newInstrumentDialogId = `new-card-instrument-dialog-${card.id}`;
  const isArchived = card.status === "archived";

  return `
    <article class="master-item card-account-item" data-master-item data-status="${escapeHtml(card.status)}" data-search="${escapeHtml(search)}">
      <div class="identity-mark card-mark" aria-hidden="true">${renderCardBrandIcon(brand.key)}</div>
      <div class="item-main">
        <div class="item-title-row">
          <strong>${escapeHtml(card.name)}</strong>
          <span class="status-pill">${escapeHtml(formatGenericStatus(card.status))}</span>
        </div>
        <p>${escapeHtml(institution.label)} · ${escapeHtml(brand.label)} · fecha ${card.closingDay}, vence ${card.dueDay}</p>
        <p class="muted">Conta de pagamento: ${escapeHtml(paymentAccount?.name ?? "não vinculada")} · ${activeInstrumentCount} ${activeInstrumentCount === 1 ? "instrumento ativo" : "instrumentos ativos"}</p>
        ${renderCardInstrumentList(card)}
      </div>
      <div class="amount-stack"><span>Limite total</span><strong>${formatMoney(card.creditLimitMinor ?? 0)}</strong></div>
      <div class="item-actions" aria-label="Ações de ${escapeHtml(card.name)}">
        <button type="button" class="icon-button" data-open-dialog="${escapeHtml(editDialogId)}" aria-label="Editar cadastro de ${escapeHtml(card.name)}">${renderEditIcon()}</button>
        <button type="button" class="icon-button" data-open-dialog="${escapeHtml(newInstrumentDialogId)}" aria-label="Adicionar instrumento em ${escapeHtml(card.name)}"${isArchived ? " disabled" : ""}>${renderAddIcon()}</button>
        <form data-api-form data-api-path="/api/credit-card-accounts/${escapeHtml(card.id)}/archive" data-confirm="Inativar ${escapeHtml(card.name)}? Este cartão deixará de aparecer nas operações ativas." class="inline-action-form">
          <button type="submit" class="icon-button danger-icon-button" aria-label="Inativar ${escapeHtml(card.name)}"${isArchived ? " disabled" : ""}>${renderArchiveIcon()}</button>
        </form>
      </div>
      ${renderCardEditDialog(card, accounts, editDialogId)}
      ${renderCardInstrumentCreateDialog(card, newInstrumentDialogId)}
      ${card.instruments.map(renderCardInstrumentEditDialog).join("")}
    </article>
  `;
}

function renderCardInstrumentList(card: CreditCardAccountRecord): string {
  const hasActiveInstrument = card.instruments.some((instrument) => instrument.status === "active");
  const inactiveNotice = hasActiveInstrument
    ? ""
    : `<p class="instrument-warning" role="status">Sem instrumento ativo para novos lançamentos. Cadastre um novo instrumento para voltar a usar este cartão.</p>`;

  if (card.instruments.length === 0) {
    return `
      <div class="instrument-list is-empty" aria-label="Instrumentos de ${escapeHtml(card.name)}">
        <p class="muted">Sem instrumento ativo para novos lançamentos.</p>
        ${inactiveNotice}
      </div>
    `;
  }

  return `
    <div class="instrument-list" aria-label="Instrumentos de ${escapeHtml(card.name)}">
      ${card.instruments.map((instrument) => renderCardInstrumentItem(card, instrument)).join("")}
    </div>
    ${inactiveNotice}
  `;
}

function renderCardInstrumentItem(
  card: CreditCardAccountRecord,
  instrument: CardInstrumentRecord,
): string {
  const title =
    instrument.name?.trim() ||
    `${formatInstrumentType(instrument.type)} ${formatInstrumentHolder(instrument.holder).toLowerCase()}`;
  const isActive = instrument.status === "active";
  const escapedTitle = escapeHtml(title);
  const editDialogId = `edit-card-instrument-dialog-${instrument.id}`;
  const editAction = renderInstrumentEditAction(editDialogId, escapedTitle);
  const setDefaultAction =
    isActive && !instrument.isDefault
      ? `<form data-api-form data-api-method="PATCH" data-api-path="/api/credit-card-accounts/${escapeHtml(card.id)}/default-instrument" class="inline-action-form">
          <input type="hidden" name="instrumentId" value="${escapeHtml(instrument.id)}" />
          <button type="submit" class="icon-button" aria-label="Definir ${escapedTitle} como default">${renderDefaultIcon()}</button>
        </form>`
      : "";
  const archiveAction = isActive
    ? `<form data-api-form data-api-path="/api/credit-card-instruments/${escapeHtml(instrument.id)}/archive" data-confirm="Arquivar ${escapedTitle}? Ele continuará visível para acompanhamento, mas não poderá receber novas compras." class="inline-action-form">
        <button type="submit" class="icon-button danger-icon-button" aria-label="Arquivar ${escapedTitle}">${renderArchiveIcon()}</button>
      </form>`
    : "";

  return `
    <div class="instrument-item" data-card-instrument>
      <div>
        <strong>${escapedTitle}</strong>
        <p class="instrument-meta">${escapeHtml(formatInstrumentType(instrument.type))} · ${escapeHtml(formatInstrumentHolder(instrument.holder))}${instrument.maskedIdentifier ? ` · ${escapeHtml(instrument.maskedIdentifier)}` : ""}${instrument.creditLimitMinor !== undefined ? ` · limite ${formatMoney(instrument.creditLimitMinor)}` : ""}</p>
      </div>
      <div class="instrument-side">
        <div class="instrument-tags">
          ${instrument.isDefault ? `<span class="instrument-pill">Default</span>` : ""}
          <span class="instrument-pill ${instrument.status === "archived" ? "is-archived" : ""}">${escapeHtml(formatGenericStatus(instrument.status))}</span>
        </div>
        <div class="instrument-actions" aria-label="Ações de ${escapedTitle}">${editAction}${setDefaultAction}${archiveAction}</div>
      </div>
    </div>
  `;
}

function renderInstrumentEditAction(dialogId: string, title: string): string {
  return [
    `<button type="button" class="icon-button" data-open-dialog="${escapeHtml(dialogId)}" `,
    `aria-label="Editar instrumento ${title}">`,
    renderEditIcon(),
    `</button>`,
  ].join("");
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
  card: CreditCardAccountRecord,
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
      <form data-api-form data-api-method="PATCH" data-api-path="/api/credit-card-accounts/${escapeHtml(card.id)}" class="edit-grid">
        <label>Nome<input name="name" value="${escapeHtml(card.name)}" required /></label>
        <label>Instituição<select name="institutionKey">${renderInstitutionOptions(card.institutionKey)}</select></label>
        <label>Bandeira<select name="brandKey">${renderCardBrandOptions(card.brandKey)}</select></label>
        <label>Fecha dia<input name="closingDay" type="number" min="1" max="31" value="${card.closingDay}" required /></label>
        <label>Vence dia<input name="dueDay" type="number" min="1" max="31" value="${card.dueDay}" required /></label>
        <label>Limite total (R$)<input name="creditLimitMinor" data-money value="${formatMoneyInput(card.creditLimitMinor ?? 0)}" inputmode="decimal" /></label>
        <label>Conta de pagamento<select name="paymentAccountId"><option value="">Sem vínculo</option>${renderAccountOptions(accounts, card.paymentAccountId)}</select></label>
        <button type="submit">Salvar cartão</button>
      </form>
    </dialog>
  `;
}

function renderCardInstrumentCreateDialog(card: CreditCardAccountRecord, dialogId: string): string {
  const titleId = `${dialogId}-title`;

  return `
    <dialog id="${escapeHtml(dialogId)}" class="master-dialog" aria-labelledby="${escapeHtml(titleId)}">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
        <p class="eyebrow">Novo instrumento</p>
        <h2 id="${escapeHtml(titleId)}">${escapeHtml(card.name)}</h2>
      </div>
      <form data-api-form data-api-path="/api/credit-card-accounts/${escapeHtml(card.id)}/instruments" class="edit-grid">
        <label>Tipo<select name="type" required>${renderInstrumentTypeOptions()}</select></label>
        <label>Titularidade<select name="holder" required>${renderInstrumentHolderOptions()}</select></label>
        <label>Nome do instrumento<input name="name" placeholder="Virtual titular" /></label>
        <label>Final mascarado<input name="maskedIdentifier" placeholder="**** 1234" /></label>
        <label>Limite do instrumento (R$)<input name="creditLimitMinor" data-money inputmode="decimal" placeholder="0,00" /></label>
        <button type="submit">Criar instrumento</button>
      </form>
    </dialog>
  `;
}

function renderCardInstrumentEditDialog(instrument: CardInstrumentRecord): string {
  const dialogId = `edit-card-instrument-dialog-${instrument.id}`;
  const titleId = `${dialogId}-title`;
  const title =
    instrument.name?.trim() ||
    `${formatInstrumentType(instrument.type)} ${formatInstrumentHolder(instrument.holder).toLowerCase()}`;

  return `
    <dialog id="${escapeHtml(dialogId)}" class="master-dialog" aria-labelledby="${escapeHtml(titleId)}">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
        <p class="eyebrow">Editar instrumento</p>
        <h2 id="${escapeHtml(titleId)}">${escapeHtml(title)}</h2>
      </div>
      <form data-api-form data-api-method="PATCH" data-api-path="/api/credit-card-instruments/${escapeHtml(instrument.id)}" class="edit-grid">
        <label>Tipo<select name="type" required>${renderInstrumentTypeOptions(instrument.type)}</select></label>
        <label>Titularidade<select name="holder" required>${renderInstrumentHolderOptions(instrument.holder)}</select></label>
        <label>Nome do instrumento<input name="name" value="${escapeHtml(instrument.name ?? "")}" /></label>
        <label>Final mascarado<input name="maskedIdentifier" value="${escapeHtml(instrument.maskedIdentifier ?? "")}" /></label>
        <label>Limite do instrumento (R$)<input name="creditLimitMinor" data-money value="${instrument.creditLimitMinor !== undefined ? formatMoneyInput(instrument.creditLimitMinor) : ""}" inputmode="decimal" /></label>
        <button type="submit">Salvar instrumento</button>
      </form>
    </dialog>
  `;
}

function renderAccountDialog(): string {
  return `
    <dialog id="new-account-dialog" class="master-dialog" aria-labelledby="new-account-title">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading"><p class="eyebrow">Novo cadastro</p><h2 id="new-account-title">Nova conta</h2></div>
      <form data-api-form data-api-path="/api/accounts" class="edit-grid">
        <label>Nome<input name="name" required /></label>
        <label>Tipo<select name="kind" required>${renderAccountKindOptions()}</select></label>
        <label>Instituição<select name="institutionKey">${renderInstitutionOptions()}</select></label>
        <label>Moeda<select name="currency">${renderCurrencyOptions()}</select></label>
        <label>Saldo inicial (R$)<input name="openingBalanceMinor" data-money inputmode="decimal" placeholder="0,00" /></label>
        <label>Nº Conta<input name="maskedIdentifier" placeholder="Ag 0001 · Conta 12345" /></label>
        <button type="submit">Criar conta</button>
      </form>
    </dialog>
  `;
}

function renderCardDialog(accounts: AccountRecord[]): string {
  return `
    <dialog id="new-card-dialog" class="master-dialog" aria-labelledby="new-card-title">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading"><p class="eyebrow">Novo cadastro</p><h2 id="new-card-title">Novo cartão</h2></div>
      <form data-api-form data-api-path="/api/credit-card-accounts" data-payload-kind="credit-card-account" class="edit-grid">
        <label>Nome<input name="name" required /></label>
        <label>Instituição<select name="institutionKey">${renderInstitutionOptions()}</select></label>
        <label>Bandeira<select name="brandKey">${renderCardBrandOptions()}</select></label>
        <label>Fecha dia<input name="closingDay" type="number" min="1" max="31" required /></label>
        <label>Vence dia<input name="dueDay" type="number" min="1" max="31" required /></label>
        <label>Limite total (R$)<input name="creditLimitMinor" data-money inputmode="decimal" placeholder="0,00" /></label>
        <label>Conta de pagamento<select name="paymentAccountId"><option value="">Sem vínculo</option>${renderAccountOptions(accounts)}</select></label>
        <label>Tipo do instrumento<select name="instrumentType" required><option value="physical">Físico</option><option value="virtual">Virtual</option></select></label>
        <label>Titularidade<select name="instrumentHolder" required><option value="primary">Titular principal</option><option value="additional">Adicional</option></select></label>
        <label>Nome do instrumento<input name="instrumentName" placeholder="Físico titular" /></label>
        <label>Final mascarado<input name="instrumentMaskedIdentifier" placeholder="**** 1234" /></label>
        <label>Limite do instrumento (R$)<input name="instrumentCreditLimitMinor" data-money inputmode="decimal" placeholder="0,00" /></label>
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
  return renderAuthenticatedShellDocument({
    activePathname: input.pathname,
    content: input.content,
    currentLabel: input.currentLabel,
    styles: baseCss(),
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

        if (form.dataset.payloadKind === "credit-card-account") {
          const instrument = {
            type: payload.instrumentType || "physical",
            holder: payload.instrumentHolder || "primary",
          };
          if (payload.instrumentName !== undefined) instrument.name = payload.instrumentName;
          if (payload.instrumentMaskedIdentifier !== undefined) instrument.maskedIdentifier = payload.instrumentMaskedIdentifier;
          if (payload.instrumentCreditLimitMinor !== undefined) instrument.creditLimitMinor = payload.instrumentCreditLimitMinor;
          delete payload.instrumentType;
          delete payload.instrumentHolder;
          delete payload.instrumentName;
          delete payload.instrumentMaskedIdentifier;
          delete payload.instrumentCreditLimitMinor;
          payload.instruments = [instrument];
        }

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
          const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? lastIndex : event.key === "ArrowRight" ? (index + 1) % tabButtons.length : (index - 1 + lastIndex + 1) % tabButtons.length;
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

function renderInstrumentTypeOptions(selected = "physical"): string {
  return [
    ["physical", "Físico"],
    ["virtual", "Virtual"],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`,
    )
    .join("");
}

function renderInstrumentHolderOptions(selected = "primary"): string {
  return [
    ["primary", "Titular principal"],
    ["additional", "Adicional"],
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

function findCardBrand(key: string | undefined) {
  return cardBrands.find((item) => item.key === key) ?? fallbackCardBrand;
}

function renderEditIcon(): string {
  return `<svg aria-hidden="true" class="action-icon" viewBox="0 0 24 24"><path d="M4 20h4.8L19.2 9.6a2.7 2.7 0 0 0 0-3.8l-1-1a2.7 2.7 0 0 0-3.8 0L4 15.2V20zm2-2v-2l9.8-9.8c.3-.3.7-.3 1 0l1 1c.3.3.3.7 0 1L8 18H6z" fill="currentColor"/></svg>`;
}

function renderAddIcon(): string {
  return `<svg aria-hidden="true" class="action-icon" viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" fill="currentColor"/></svg>`;
}

function renderArchiveIcon(): string {
  return `<svg aria-hidden="true" class="action-icon" viewBox="0 0 24 24"><path d="M5 5h14v4H5V5zm2 6h10v8H7v-8zm2 2v4h6v-4H9zM7 7v1h10V7H7z" fill="currentColor"/></svg>`;
}

function renderDefaultIcon(): string {
  return `<svg aria-hidden="true" class="action-icon" viewBox="0 0 24 24"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z" fill="currentColor"/></svg>`;
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

function formatInstrumentType(type: string): string {
  if (type === "physical") return "Físico";
  if (type === "virtual") return "Virtual";
  return type;
}

function formatInstrumentHolder(holder: string): string {
  if (holder === "primary") return "Titular principal";
  if (holder === "additional") return "Adicional";
  return holder;
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

interface CreditCardAccountRecord {
  id: string;
  name: string;
  status: string;
  closingDay: number;
  dueDay: number;
  creditLimitMinor?: number;
  institutionKey?: string;
  brandKey?: string;
  paymentAccountId?: string;
  instruments: CardInstrumentRecord[];
}

interface CardInstrumentRecord {
  id: string;
  type: string;
  holder: string;
  status: string;
  isDefault: boolean;
  name?: string;
  maskedIdentifier?: string;
  creditLimitMinor?: number;
}

function baseCss(): string {
  return `
    ${sharedShellStyles()}
    main { display: grid; gap: 18px; margin: 0 auto; max-width: 1440px; padding: 24px; width: 100%; }
    .master-heading { align-items: end; display: flex; gap: 16px; justify-content: space-between; } .master-heading > div:first-child { display: grid; gap: 6px; max-width: 720px; } .master-actions { display: flex; flex-wrap: wrap; gap: 10px; }
    .master-toolbar, .master-panel { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 16px; padding: 16px; }
    [hidden] { display: none !important; }
    .tab-list { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: 8px; display: flex; gap: 6px; padding: 6px; } .tab-button { background: transparent; color: var(--primary); flex: 1 1 0; gap: 8px; min-width: 0; } .tab-button[aria-selected="true"] { background: var(--surface); border: 1px solid #d4e6ec; color: var(--text); } .tab-button span, .section-heading > span, .status-pill { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: .78rem; font-weight: 800; padding: 5px 9px; white-space: nowrap; }
    .filter-row { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr) minmax(12rem, .25fr); }
    .section-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .section-heading > div { display: grid; gap: 4px; }
    .master-list { display: grid; gap: 12px; } .master-item { align-items: start; border-top: 1px solid var(--line); display: grid; gap: 14px; grid-template-columns: 44px minmax(0, 1fr) minmax(9rem, auto) auto; padding-top: 14px; } .master-item:first-child { border-top: 0; padding-top: 0; }
    .identity-mark { align-items: center; background: var(--primary-soft); border: 1px solid #d4e6ec; border-radius: 12px; color: white; display: flex; height: 44px; justify-content: center; overflow: hidden; width: 44px; } .card-mark { background: #f8fafc; }
    .brand-icon { display: block; height: 44px; width: 44px; } .card-brand-icon { filter: drop-shadow(0 1px 2px rgba(15,23,42,.14)); }
    .brand-icon-wrap { align-items: center; background: #fff; display: flex; height: 44px; justify-content: center; width: 44px; } .institution-logo-img { background: #fff; border-radius: 10px; object-fit: contain; padding: 5px; }
    .item-main { display: grid; gap: 5px; min-width: 0; } .item-main p { color: var(--muted); line-height: 1.45; } .item-title-row { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; } .amount-stack { display: grid; gap: 3px; justify-items: end; text-align: right; white-space: nowrap; } .amount-stack span { color: var(--muted); font-size: .76rem; font-weight: 800; text-transform: uppercase; } .amount-stack strong { color: var(--text); }
    .instrument-list { border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 0; margin-top: 6px; overflow: hidden; } .instrument-list.is-empty { padding: 10px 12px; }
    .instrument-warning { background: var(--danger-bg); border: 1px solid #fecaca; border-radius: 8px; color: var(--danger); font-size: .88rem; font-weight: 700; margin-top: 8px; padding: 9px 12px; }
    .instrument-item { align-items: center; background: var(--surface-soft); border-top: 1px solid var(--line); display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr) auto; padding: 10px 12px; } .instrument-item:first-child { border-top: 0; } .instrument-meta { font-size: .88rem; }
    .instrument-side { display: grid; gap: 8px; justify-items: end; } .instrument-tags { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; } .instrument-pill { background: #e0f2fe; border-radius: 999px; color: #075985; font-size: .72rem; font-weight: 800; padding: 4px 8px; white-space: nowrap; } .instrument-pill.is-archived { background: #f1f5f9; color: #475569; }
    .instrument-actions { display: flex; gap: 6px; justify-content: flex-end; } .instrument-actions .icon-button { min-height: 36px; width: 36px; }
    .item-actions { display: flex; gap: 8px; justify-content: flex-end; } .inline-action-form { display: block; gap: 0; } .icon-button { background: var(--primary-soft); border: 1px solid #d4e6ec; color: var(--primary); min-height: 44px; padding: 0; width: 44px; } .danger-icon-button { background: var(--danger-bg); border-color: #fecaca; color: var(--danger); } .action-icon { display: block; height: 20px; width: 20px; }
    .edit-grid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 12px; } .edit-grid button, .edit-grid .form-status { grid-column: 1 / -1; }
    .filter-empty-state { margin-top: 4px; }
    .master-dialog { border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 24px 80px rgba(15,23,42,.18); max-width: 760px; padding: 20px; width: calc(100% - 32px); } .master-dialog::backdrop { background: rgba(15,23,42,.38); } .dialog-close-form { display: flex; justify-content: flex-end; margin-bottom: 12px; } .dialog-heading { display: grid; gap: 4px; }
    @media (max-width: 900px) { .edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .master-heading { align-items: stretch; display: grid; } .master-item { grid-template-columns: 44px minmax(0, 1fr) auto; } .item-actions { grid-column: 2 / -1; justify-content: flex-start; } }
    @media (max-width: 760px) { h1 { font-size: 1.65rem; } .tab-list, .master-actions { display: grid; } .filter-row, .edit-grid, .master-item, .section-heading, .instrument-item { display: grid; grid-template-columns: 1fr; } .item-actions { grid-column: auto; justify-content: flex-start; } .instrument-side { justify-items: start; } .instrument-tags, .instrument-actions { justify-content: flex-start; } .amount-stack { justify-items: start; text-align: left; white-space: normal; } }
  `;
}
