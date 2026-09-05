import { icon } from "../icons.js";
import {
  escapeHtml,
  formatMoneyInput,
  renderAccountKindOptions,
  renderAccountOptions,
  renderCardBrandOptions,
  renderCurrencyOptions,
  renderInstitutionOptions,
  renderInstrumentHolderOptions,
  renderInstrumentTypeOptions,
  renderLegacyAccountIdentifier,
} from "./presentation.js";
import type { AccountRecord, CardInstrumentRecord, CreditCardAccountRecord } from "./types.js";
import {
  countActive,
  formatGenericStatus,
  formatInstrumentHolder,
  formatInstrumentType,
} from "./view-model.js";

export function renderAccountEditDialog(account: AccountRecord, dialogId: string): string {
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
        <label>Saldo inicial<input name="openingBalanceMinor" data-money value="${formatMoneyInput(account.openingBalanceMinor ?? 0)}" inputmode="decimal" /></label>
        <label>Agência<input name="agencyIdentifier" value="${escapeHtml(account.agencyIdentifier ?? "")}" autocomplete="off" /></label>
        <label>Conta<input name="accountIdentifier" value="${escapeHtml(account.accountIdentifier ?? "")}" autocomplete="off" /></label>
        ${renderLegacyAccountIdentifier(account)}
        <button type="submit" title="Salvar alterações da conta">${icon("save", 14)} Salvar conta</button>
      </form>
    </dialog>
  `;
}

export function renderCardEditDialog(
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
        <label>Limite total (moeda da conta de pagamento)<input name="creditLimitMinor" data-money value="${formatMoneyInput(card.creditLimitMinor ?? 0)}" inputmode="decimal" /></label>
        <label>Conta de pagamento<select name="paymentAccountId"><option value="">Sem vínculo</option>${renderAccountOptions(accounts, card.paymentAccountId)}</select></label>
        <button type="submit" title="Salvar alterações do cartão">${icon("save", 14)} Salvar cartão</button>
      </form>
      ${renderCardInlineInstrumentForms(card)}
    </dialog>
  `;
}

function renderCardInlineInstrumentForms(card: CreditCardAccountRecord): string {
  const activeCount = countActive(card.instruments);

  if (card.instruments.length === 0) {
    return `
      <section class="dialog-subsection" aria-label="Instrumentos de ${escapeHtml(card.name)}">
        <div class="dialog-subsection-heading">
          <div>
            <p class="eyebrow">Instrumentos do cartão</p>
            <h3>Dados dos instrumentos</h3>
          </div>
        </div>
        <p class="muted">Nenhum instrumento cadastrado neste cartão.</p>
      </section>
    `;
  }

  return `
    <section class="dialog-subsection" aria-label="Instrumentos de ${escapeHtml(card.name)}">
      <div class="dialog-subsection-heading">
        <div>
          <p class="eyebrow">Instrumentos do cartão</p>
          <h3>Dados dos instrumentos</h3>
        </div>
        <span>${activeCount} ${activeCount === 1 ? "ativo" : "ativos"}</span>
      </div>
      <div class="dialog-instrument-forms">
        ${card.instruments.map(renderCardInlineInstrumentForm).join("")}
      </div>
    </section>
  `;
}

function renderCardInlineInstrumentForm(instrument: CardInstrumentRecord): string {
  const title =
    instrument.name?.trim() ||
    `${formatInstrumentType(instrument.type)} ${formatInstrumentHolder(instrument.holder).toLowerCase()}`;

  return `
    <form data-api-form data-api-method="PATCH" data-api-path="/api/credit-card-instruments/${escapeHtml(instrument.id)}" class="edit-grid instrument-edit-form">
      <div class="instrument-edit-heading">
        <strong>${escapeHtml(title)}</strong>
        <div class="instrument-tags">
          ${instrument.isDefault ? `<span class="instrument-pill">Default</span>` : ""}
          <span class="instrument-pill ${instrument.status === "archived" ? "is-archived" : ""}">${escapeHtml(formatGenericStatus(instrument.status))}</span>
        </div>
      </div>
      <label>Tipo<select name="type" required>${renderInstrumentTypeOptions(instrument.type)}</select></label>
      <label>Titularidade<select name="holder" required>${renderInstrumentHolderOptions(instrument.holder)}</select></label>
      <label>Nome do instrumento<input name="name" value="${escapeHtml(instrument.name ?? "")}" /></label>
      <label>Final mascarado<input name="maskedIdentifier" value="${escapeHtml(instrument.maskedIdentifier ?? "")}" /></label>
      <label>Limite do instrumento (moeda da conta de pagamento)<input name="creditLimitMinor" data-money value="${instrument.creditLimitMinor !== undefined ? formatMoneyInput(instrument.creditLimitMinor) : ""}" inputmode="decimal" /></label>
      <button type="submit" title="Salvar alterações do instrumento">${icon("save", 14)} Salvar instrumento</button>
    </form>
  `;
}

export function renderCardInstrumentCreateDialog(
  card: CreditCardAccountRecord,
  dialogId: string,
): string {
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
        <label>Limite do instrumento (moeda da conta de pagamento)<input name="creditLimitMinor" data-money inputmode="decimal" placeholder="0,00" /></label>
        <button type="submit" title="Criar novo instrumento">${icon("save", 14)} Criar instrumento</button>
      </form>
    </dialog>
  `;
}

export function renderCardInstrumentEditDialog(instrument: CardInstrumentRecord): string {
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
        <label>Limite do instrumento (moeda da conta de pagamento)<input name="creditLimitMinor" data-money value="${instrument.creditLimitMinor !== undefined ? formatMoneyInput(instrument.creditLimitMinor) : ""}" inputmode="decimal" /></label>
        <button type="submit" title="Salvar alterações do instrumento">${icon("save", 14)} Salvar instrumento</button>
      </form>
    </dialog>
  `;
}

export function renderAccountDialog(): string {
  return `
    <dialog id="new-account-dialog" class="master-dialog" aria-labelledby="new-account-title">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading"><p class="eyebrow">Novo cadastro</p><h2 id="new-account-title">Nova conta</h2></div>
      <form data-api-form data-api-path="/api/accounts" class="edit-grid">
        <label>Nome<input name="name" required /></label>
        <label>Tipo<select name="kind" required>${renderAccountKindOptions()}</select></label>
        <label>Instituição<select name="institutionKey">${renderInstitutionOptions()}</select></label>
        <label>Moeda<select name="currency">${renderCurrencyOptions()}</select></label>
        <label>Saldo inicial<input name="openingBalanceMinor" data-money inputmode="decimal" placeholder="0,00" /></label>
        <label>Agência<input name="agencyIdentifier" placeholder="Ex.: 0001" autocomplete="off" /></label>
        <label>Conta<input name="accountIdentifier" placeholder="Ex.: 12345-6" autocomplete="off" /></label>
        <button type="submit" title="Salvar nova conta">${icon("save", 14)} Criar conta</button>
      </form>
    </dialog>
  `;
}

export function renderCardDialog(accounts: AccountRecord[]): string {
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
        <label>Limite total (moeda da conta de pagamento)<input name="creditLimitMinor" data-money inputmode="decimal" placeholder="0,00" /></label>
        <label>Conta de pagamento<select name="paymentAccountId"><option value="">Sem vínculo</option>${renderAccountOptions(accounts)}</select></label>
        <label>Tipo do instrumento<select name="instrumentType" required><option value="physical">Físico</option><option value="virtual">Virtual</option></select></label>
        <label>Titularidade<select name="instrumentHolder" required><option value="primary">Titular principal</option><option value="additional">Adicional</option></select></label>
        <label>Nome do instrumento<input name="instrumentName" placeholder="Físico titular" /></label>
        <label>Final mascarado<input name="instrumentMaskedIdentifier" placeholder="**** 1234" /></label>
        <label>Limite do instrumento (moeda da conta de pagamento)<input name="instrumentCreditLimitMinor" data-money inputmode="decimal" placeholder="0,00" /></label>
        <button type="submit" title="Salvar novo cartão">${icon("save", 14)} Criar cartão</button>
      </form>
    </dialog>
  `;
}
