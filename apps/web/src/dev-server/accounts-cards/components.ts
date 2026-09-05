import { formatMinorCurrency } from "@solverfin/shared";
import {
  renderBadge,
  renderEmptyState,
  renderUnavailableState,
} from "../../design-system/primitives.js";
import { renderInstitutionIcon } from "../institutions.js";
import {
  renderAccountEditDialog,
  renderCardEditDialog,
  renderCardInstrumentCreateDialog,
  renderCardInstrumentEditDialog,
} from "./dialogs.js";
import {
  escapeHtml,
  formatMoneyInput,
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
  normalizeCurrency,
  type ResourceMasterViewModel,
  type SelectedResourceViewModel,
} from "./view-model.js";

export function renderResourceMaster(resources: readonly ResourceMasterViewModel[]): string {
  const list =
    resources.length > 0
      ? resources.map(renderResourceMasterItem).join("")
      : renderEmptyState({
          title: "Nenhuma conta ou cartão cadastrado",
          description: "Adicione uma conta ou um cartão para iniciar o cadastro financeiro.",
        });

  return `
    <section class="resource-master-panel" aria-label="Contas e cartões">
      <div class="resource-master-summary">
        <div><strong>Recursos financeiros</strong><span>${resources.length} ${resources.length === 1 ? "cadastro" : "cadastros"}</span></div>
      </div>
      <div class="resource-master-filters" role="group" aria-label="Filtros dos recursos">
        <label>Buscar<input data-master-search type="search" placeholder="Nome, instituição, conta, bandeira ou moeda" autocomplete="off" /></label>
        <label>Status<select data-master-status><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>
      </div>
      <div class="resource-master-list" data-master-list>${list}</div>
      <div data-filter-empty hidden>${renderEmptyState({ title: "Nenhum recurso encontrado", description: "Ajuste a busca ou o filtro de status." })}</div>
    </section>`;
}

function renderResourceMasterItem(resource: ResourceMasterViewModel): string {
  const icon =
    resource.kind === "account"
      ? renderInstitutionIcon(resource.institutionKey)
      : renderCardBrandIcon(resource.brandKey ?? "");
  return `
    <article class="master-item resource-master-item${resource.isSelected ? " is-selected" : ""}" data-resource-master-item data-status="${escapeHtml(resource.status)}" data-search="${escapeHtml(resource.search)}">
      <a class="resource-master-link" href="${escapeHtml(resource.href)}"${resource.isSelected ? ' aria-current="page"' : ""}>
        <span class="resource-master-icon" aria-hidden="true">${icon}</span>
        <span class="resource-master-copy">
          <span class="resource-master-title"><strong>${escapeHtml(resource.name)}</strong>${renderBadge({ label: formatGenericStatus(resource.status), tone: resource.status === "active" ? "positive" : "neutral" })}</span>
          <span>${escapeHtml(resource.kind === "account" ? "Conta" : "Cartão")} · ${escapeHtml(resource.institutionLabel)}</span>
          <span>${escapeHtml(resource.secondaryLabel)}</span>
          <span class="resource-master-currency">${escapeHtml(resource.currencyLabel)}</span>
        </span>
      </a>
    </article>`;
}

export function renderSelectedResourceDetail(
  selected: SelectedResourceViewModel | undefined,
  accounts: AccountRecord[],
): string {
  if (!selected) {
    return `<section class="resource-detail-panel resource-detail-empty">${renderEmptyState({
      title: "Selecione um recurso",
      description: "Escolha uma conta ou cartão na lista para consultar e manter o cadastro.",
    })}</section>`;
  }

  return selected.kind === "account"
    ? renderAccountDetail(selected.account, selected.currency)
    : renderCardDetail(selected.card, accounts, selected.paymentAccount, selected.currency);
}

function renderAccountDetail(account: AccountRecord, currency: string | undefined): string {
  const viewModel = buildAccountItemViewModel(account);
  const money = formatAmountWithCurrency(account.openingBalanceMinor ?? 0, currency);
  return `
    <section class="resource-detail-panel" data-resource-detail="account" data-resource-key="account:${escapeHtml(account.id)}">
      <header class="resource-detail-heading">
        <div class="resource-detail-identity">${renderInstitutionIcon(viewModel.institutionKey)}</div>
        <div><span class="resource-kicker">Conta</span><h2>${escapeHtml(account.name)}</h2><p>${escapeHtml(viewModel.institutionLabel)} · ${escapeHtml(formatAccountKind(account.kind))}</p></div>
        ${renderBadge({ label: formatGenericStatus(account.status), tone: account.status === "active" ? "positive" : "neutral" })}
      </header>
      <div class="resource-detail-grid">
        ${detailField("Instituição", viewModel.institutionLabel)}
        ${detailField("Tipo", formatAccountKind(account.kind))}
        ${detailField("Moeda", currency ?? "Moeda não informada", !currency)}
        ${detailField("Agência / conta", viewModel.bankIdentifier ?? "Não informado")}
        ${detailField("Saldo inicial", money, !currency)}
        ${detailField("Estado", formatGenericStatus(account.status))}
      </div>
      <div class="resource-detail-actions" aria-label="Ações de ${escapeHtml(account.name)}">
        <button type="button" class="resource-primary-action" data-open-dialog="${escapeHtml(viewModel.editDialogId)}">${renderEditIcon()} Editar conta</button>
        <a class="button-link secondary" href="/remuneracao-contas">Remuneração CDI</a>
        <form data-api-form data-api-path="/api/accounts/${escapeHtml(account.id)}/archive" data-confirm="Inativar ${escapeHtml(account.name)}? Esta conta deixará de aparecer nas operações ativas." class="inline-action-form">
          <button type="submit" class="secondary-button"${viewModel.isArchived ? " disabled" : ""}>${renderArchiveIcon()} Arquivar</button>
        </form>
        <form data-api-form data-api-method="DELETE" data-api-path="/api/accounts/${escapeHtml(account.id)}" data-confirm="Excluir ${escapeHtml(account.name)}? Só é possível excluir contas sem vínculos financeiros." class="inline-action-form">
          <button type="submit" class="danger-button">${renderTrashIcon()} Excluir</button>
        </form>
      </div>
    </section>
    ${renderAccountEditDialog(account, viewModel.editDialogId)}`;
}

function renderCardDetail(
  card: CreditCardAccountRecord,
  accounts: AccountRecord[],
  paymentAccount: AccountRecord | undefined,
  currency: string | undefined,
): string {
  const viewModel = buildCardItemViewModel(card, accounts);
  const limit = formatAmountWithCurrency(card.creditLimitMinor ?? 0, currency);
  const currencyState = currency
    ? detailField("Moeda", currency)
    : `<div class="resource-detail-field is-unavailable">${renderUnavailableState({ title: "Moeda indisponível", description: "Vincule uma conta de pagamento com moeda informada para definir o contexto monetário deste cartão." })}</div>`;

  return `
    <section class="resource-detail-panel" data-resource-detail="card" data-resource-key="card:${escapeHtml(card.id)}">
      <header class="resource-detail-heading">
        <div class="resource-detail-identity card-mark" aria-hidden="true">${renderCardBrandIcon(viewModel.brandKey)}</div>
        <div><span class="resource-kicker">Cartão</span><h2>${escapeHtml(card.name)}</h2><p>${escapeHtml(viewModel.institutionLabel)} · ${escapeHtml(viewModel.brandLabel)}</p></div>
        ${renderBadge({ label: formatGenericStatus(card.status), tone: card.status === "active" ? "positive" : "neutral" })}
      </header>
      <div class="resource-detail-grid">
        ${detailField("Instituição", viewModel.institutionLabel)}
        ${detailField("Bandeira", viewModel.brandLabel)}
        ${currencyState}
        ${detailField("Conta de pagamento", paymentAccount?.name ?? "Não vinculada", !paymentAccount)}
        ${detailField("Fechamento / vencimento", `Dia ${card.closingDay} / dia ${card.dueDay}`)}
        ${detailField("Limite total", limit, !currency)}
      </div>
      <section class="resource-instruments" aria-labelledby="resource-instruments-title-${escapeHtml(card.id)}">
        <div class="resource-subheading"><div><span class="resource-kicker">Instrumentos</span><h3 id="resource-instruments-title-${escapeHtml(card.id)}">Instrumentos do cartão</h3></div><span>${viewModel.activeInstrumentCount} ativos</span></div>
        ${renderCardInstrumentList(card, currency)}
      </section>
      <div class="resource-detail-actions" aria-label="Ações de ${escapeHtml(card.name)}">
        <button type="button" class="resource-primary-action" data-open-dialog="${escapeHtml(viewModel.editDialogId)}">${renderEditIcon()} Editar cartão</button>
        <button type="button" class="secondary-button" data-open-dialog="${escapeHtml(viewModel.newInstrumentDialogId)}"${viewModel.isArchived ? " disabled" : ""}>${renderAddIcon()} Adicionar instrumento</button>
        <form data-api-form data-api-path="/api/credit-card-accounts/${escapeHtml(card.id)}/archive" data-confirm="Inativar ${escapeHtml(card.name)}? Este cartão deixará de aparecer nas operações ativas." class="inline-action-form">
          <button type="submit" class="secondary-button"${viewModel.isArchived ? " disabled" : ""}>${renderArchiveIcon()} Arquivar</button>
        </form>
        <form data-api-form data-api-method="DELETE" data-api-path="/api/credit-card-accounts/${escapeHtml(card.id)}" data-confirm="Excluir ${escapeHtml(card.name)}? Só é possível excluir cartões sem vínculos financeiros." class="inline-action-form">
          <button type="submit" class="danger-button">${renderTrashIcon()} Excluir</button>
        </form>
      </div>
      ${renderCardEditDialog(card, accounts, viewModel.editDialogId)}
      ${renderCardInstrumentCreateDialog(card, viewModel.newInstrumentDialogId)}
      ${card.instruments.map(renderCardInstrumentEditDialog).join("")}
    </section>`;
}

function detailField(label: string, value: string, unavailable = false): string {
  return `<div class="resource-detail-field${unavailable ? " is-unavailable" : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function formatAmountWithCurrency(amountMinor: number, currency: string | undefined): string {
  if (!currency) return `${formatMoneyInput(amountMinor)} · moeda indisponível`;
  return formatMinorCurrency(amountMinor, { currency });
}

function renderCardInstrumentList(card: CreditCardAccountRecord, currency?: string): string {
  const hasActiveInstrument = card.instruments.some((instrument) => instrument.status === "active");
  const inactiveNotice = hasActiveInstrument
    ? ""
    : `<p class="instrument-warning" role="status">Sem instrumento ativo para novos lançamentos. Cadastre um novo instrumento para voltar a usar este cartão.</p>`;

  if (card.instruments.length === 0) {
    return `<div class="instrument-list is-empty" aria-label="Instrumentos de ${escapeHtml(card.name)}"><p class="muted">Nenhum instrumento cadastrado.</p>${inactiveNotice}</div>`;
  }

  return `<div class="instrument-list" aria-label="Instrumentos de ${escapeHtml(card.name)}">${card.instruments.map((instrument) => renderCardInstrumentItem(card, instrument, currency)).join("")}</div>${inactiveNotice}`;
}

function renderCardInstrumentItem(
  card: CreditCardAccountRecord,
  instrument: CardInstrumentRecord,
  currency?: string,
): string {
  const title =
    instrument.name?.trim() ||
    `${formatInstrumentType(instrument.type)} ${formatInstrumentHolder(instrument.holder).toLowerCase()}`;
  const isActive = instrument.status === "active";
  const escapedTitle = escapeHtml(title);
  const editDialogId = `edit-card-instrument-dialog-${instrument.id}`;
  const limit =
    instrument.creditLimitMinor === undefined
      ? ""
      : ` · limite ${formatAmountWithCurrency(instrument.creditLimitMinor, currency)}`;
  const setDefaultAction =
    isActive && !instrument.isDefault
      ? `<form data-api-form data-api-method="PATCH" data-api-path="/api/credit-card-accounts/${escapeHtml(card.id)}/default-instrument" class="inline-action-form"><input type="hidden" name="instrumentId" value="${escapeHtml(instrument.id)}" /><button type="submit" class="icon-button" aria-label="Definir ${escapedTitle} como default">${renderDefaultIcon()}</button></form>`
      : "";
  const archiveAction = isActive
    ? `<form data-api-form data-api-path="/api/credit-card-instruments/${escapeHtml(instrument.id)}/archive" data-confirm="Arquivar ${escapedTitle}? Ele continuará visível, mas não poderá receber novas compras." class="inline-action-form"><button type="submit" class="icon-button danger-icon-button" aria-label="Arquivar ${escapedTitle}">${renderArchiveIcon()}</button></form>`
    : "";

  return `<article class="instrument-item" data-card-instrument><div><strong>${escapedTitle}</strong><p class="instrument-meta">${escapeHtml(formatInstrumentType(instrument.type))} · ${escapeHtml(formatInstrumentHolder(instrument.holder))}${instrument.maskedIdentifier ? ` · ${escapeHtml(instrument.maskedIdentifier)}` : ""}${escapeHtml(limit)}</p></div><div class="instrument-side"><div class="instrument-tags">${instrument.isDefault ? '<span class="instrument-pill">Default</span>' : ""}<span class="instrument-pill ${instrument.status === "archived" ? "is-archived" : ""}">${escapeHtml(formatGenericStatus(instrument.status))}</span></div><div class="instrument-actions" aria-label="Ações de ${escapedTitle}"><button type="button" class="icon-button" data-open-dialog="${escapeHtml(editDialogId)}" aria-label="Editar instrumento ${escapedTitle}">${renderEditIcon()}</button>${setDefaultAction}${archiveAction}</div></div></article>`;
}

export function renderConfirmationDialog(): string {
  return `<dialog id="accounts-cards-confirm-dialog" class="master-dialog confirm-dialog" aria-labelledby="accounts-cards-confirm-title"><div class="dialog-heading"><p class="eyebrow">Confirmar ação</p><h2 id="accounts-cards-confirm-title">Deseja continuar?</h2><p data-confirm-message></p></div><div class="confirm-dialog-actions"><button type="button" class="secondary-button" data-confirm-cancel>Cancelar</button><button type="button" class="danger-button" data-confirm-accept>Confirmar</button></div></dialog>`;
}

// Compatibilidade temporária para testes e módulos históricos não servidos pela rota A3.
export function renderAccountItem(account: AccountRecord): string {
  const viewModel = buildAccountItemViewModel(account);
  return `<article class="master-item" data-master-item data-status="${escapeHtml(account.status)}" data-search="${escapeHtml(viewModel.search)}"><div class="identity-mark">${renderInstitutionIcon(viewModel.institutionKey)}</div><div class="item-main"><div class="item-title-row"><strong>${escapeHtml(account.name)}</strong><span class="status-pill">${escapeHtml(formatGenericStatus(account.status))}</span></div><p>${escapeHtml(formatAccountKind(account.kind))} · ${escapeHtml(viewModel.institutionLabel)} · ${escapeHtml(account.currency ?? "Moeda não informada")}${viewModel.bankIdentifier ? ` · ${escapeHtml(viewModel.bankIdentifier)}` : ""}</p></div><div class="amount-stack"><span>Saldo inicial</span><strong>${formatAmountWithCurrency(account.openingBalanceMinor ?? 0, normalizeCurrency(account.currency))}</strong></div>${renderAccountEditDialog(account, viewModel.editDialogId)}</article>`;
}

export function renderCardItem(card: CreditCardAccountRecord, accounts: AccountRecord[]): string {
  const viewModel = buildCardItemViewModel(card, accounts);
  return `<article class="master-item card-account-item" data-master-item data-status="${escapeHtml(card.status)}" data-search="${escapeHtml(viewModel.search)}"><div class="identity-mark card-mark" aria-hidden="true">${renderCardBrandIcon(viewModel.brandKey)}</div><div class="item-main"><div class="item-title-row"><strong>${escapeHtml(card.name)}</strong><span class="status-pill">${escapeHtml(formatGenericStatus(card.status))}</span></div><p>${escapeHtml(viewModel.institutionLabel)} · ${escapeHtml(viewModel.brandLabel)} · fecha ${card.closingDay}, vence ${card.dueDay}</p></div><div class="amount-stack"><span>Limite total</span><strong>${viewModel.paymentAccountCurrency ? formatAmountWithCurrency(card.creditLimitMinor ?? 0, viewModel.paymentAccountCurrency) : "Moeda indisponível"}</strong></div>${renderCardEditDialog(card, accounts, viewModel.editDialogId)}</article>`;
}

export function renderFilterEmptyState(title: string): string {
  return `<div class="empty-state filter-empty-state" data-filter-empty hidden><strong>${escapeHtml(title)}</strong><p class="muted">Ajuste a busca ou o filtro de status para ver outros cadastros.</p></div>`;
}
