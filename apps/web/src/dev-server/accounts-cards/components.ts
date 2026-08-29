import { renderInstitutionIcon } from "../institutions.js";
import {
  renderAccountEditDialog,
  renderCardEditDialog,
  renderCardInstrumentCreateDialog,
  renderCardInstrumentEditDialog,
} from "./dialogs.js";
import {
  escapeHtml,
  formatMoney,
  renderAddIcon,
  renderArchiveIcon,
  renderCardBrandIcon,
  renderDefaultIcon,
  renderEditIcon,
  renderTrashIcon,
} from "./presentation.js";
import type { AccountRecord, CardInstrumentRecord, CreditCardAccountRecord } from "./types.js";
import {
  buildAccountItemViewModel,
  buildCardItemViewModel,
  formatAccountKind,
  formatGenericStatus,
  formatInstrumentHolder,
  formatInstrumentType,
} from "./view-model.js";

export function renderAccountItem(account: AccountRecord): string {
  const viewModel = buildAccountItemViewModel(account);

  return `
    <article class="master-item" data-master-item data-status="${escapeHtml(account.status)}" data-search="${escapeHtml(viewModel.search)}">
      <div class="identity-mark">${renderInstitutionIcon(viewModel.institutionKey)}</div>
      <div class="item-main">
        <div class="item-title-row">
          <strong>${escapeHtml(account.name)}</strong>
          <span class="status-pill">${escapeHtml(formatGenericStatus(account.status))}</span>
        </div>
        <p>${escapeHtml(formatAccountKind(account.kind))} · ${escapeHtml(viewModel.institutionLabel)} · ${escapeHtml(account.currency ?? "BRL")}${viewModel.bankIdentifier ? ` · ${escapeHtml(viewModel.bankIdentifier)}` : ""}</p>
      </div>
      <div class="amount-stack"><span>Saldo inicial</span><strong>${formatMoney(account.openingBalanceMinor ?? 0)}</strong></div>
      <div class="item-actions" aria-label="Ações de ${escapeHtml(account.name)}">
        <button type="button" class="icon-button" data-open-dialog="${escapeHtml(viewModel.editDialogId)}" aria-label="Editar cadastro de ${escapeHtml(account.name)}" title="Editar conta">${renderEditIcon()}</button>
        <form data-api-form data-api-path="/api/accounts/${escapeHtml(account.id)}/archive" data-confirm="Inativar ${escapeHtml(account.name)}? Esta conta deixará de aparecer nas operações ativas." class="inline-action-form">
          <button type="submit" class="icon-button danger-icon-button" aria-label="Inativar ${escapeHtml(account.name)}" title="Arquivar conta"${viewModel.isArchived ? " disabled" : ""}>${renderArchiveIcon()}</button>
        </form>
        <form data-api-form data-api-method="DELETE" data-api-path="/api/accounts/${escapeHtml(account.id)}" data-confirm="Excluir ${escapeHtml(account.name)}? Só é possível excluir contas sem lançamentos, cartões, recorrências ou contas a pagar/receber vinculadas." class="inline-action-form">
          <button type="submit" class="icon-button danger-icon-button" aria-label="Excluir ${escapeHtml(account.name)}" title="Excluir conta">${renderTrashIcon()}</button>
        </form>
      </div>
      ${renderAccountEditDialog(account, viewModel.editDialogId)}
    </article>
  `;
}

export function renderCardItem(card: CreditCardAccountRecord, accounts: AccountRecord[]): string {
  const viewModel = buildCardItemViewModel(card, accounts);

  return `
    <article class="master-item card-account-item" data-master-item data-status="${escapeHtml(card.status)}" data-search="${escapeHtml(viewModel.search)}">
      <div class="identity-mark card-mark" aria-hidden="true">${renderCardBrandIcon(viewModel.brandKey)}</div>
      <div class="item-main">
        <div class="item-title-row">
          <strong>${escapeHtml(card.name)}</strong>
          <span class="status-pill">${escapeHtml(formatGenericStatus(card.status))}</span>
        </div>
        <p>${escapeHtml(viewModel.institutionLabel)} · ${escapeHtml(viewModel.brandLabel)} · fecha ${card.closingDay}, vence ${card.dueDay}</p>
        <p class="muted">Conta de pagamento: ${escapeHtml(viewModel.paymentAccountName)} · ${viewModel.activeInstrumentCount} ${viewModel.activeInstrumentCount === 1 ? "instrumento ativo" : "instrumentos ativos"}</p>
        ${renderCardInstrumentList(card)}
      </div>
      <div class="amount-stack"><span>Limite total</span><strong>${formatMoney(card.creditLimitMinor ?? 0)}</strong></div>
      <div class="item-actions" aria-label="Ações de ${escapeHtml(card.name)}">
        <button type="button" class="icon-button" data-open-dialog="${escapeHtml(viewModel.editDialogId)}" aria-label="Editar cadastro de ${escapeHtml(card.name)}" title="Editar cartão">${renderEditIcon()}</button>
        <button type="button" class="icon-button" data-open-dialog="${escapeHtml(viewModel.newInstrumentDialogId)}" aria-label="Adicionar instrumento em ${escapeHtml(card.name)}" title="Adicionar instrumento"${viewModel.isArchived ? " disabled" : ""}>${renderAddIcon()}</button>
        <form data-api-form data-api-path="/api/credit-card-accounts/${escapeHtml(card.id)}/archive" data-confirm="Inativar ${escapeHtml(card.name)}? Este cartão deixará de aparecer nas operações ativas." class="inline-action-form">
          <button type="submit" class="icon-button danger-icon-button" aria-label="Inativar ${escapeHtml(card.name)}" title="Arquivar cartão"${viewModel.isArchived ? " disabled" : ""}>${renderArchiveIcon()}</button>
        </form>
        <form data-api-form data-api-method="DELETE" data-api-path="/api/credit-card-accounts/${escapeHtml(card.id)}" data-confirm="Excluir ${escapeHtml(card.name)}? Só é possível excluir cartões sem compras, faturas, parcelas ou recorrências vinculadas." class="inline-action-form">
          <button type="submit" class="icon-button danger-icon-button" aria-label="Excluir ${escapeHtml(card.name)}" title="Excluir cartão">${renderTrashIcon()}</button>
        </form>
      </div>
      ${renderCardEditDialog(card, accounts, viewModel.editDialogId)}
      ${renderCardInstrumentCreateDialog(card, viewModel.newInstrumentDialogId)}
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

export function renderEmptyState(title: string, description: string): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(description)}</p></div>`;
}

export function renderFilterEmptyState(title: string): string {
  return `<div class="empty-state filter-empty-state" data-filter-empty hidden><strong>${escapeHtml(title)}</strong><p class="muted">Ajuste a busca ou o filtro de status para ver outros cadastros.</p></div>`;
}
