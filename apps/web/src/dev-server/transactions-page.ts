import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { icon } from "./icons.js";
import { findInstitution, renderInstitutionIcon } from "./institutions.js";
import {
  recurrencesSectionScript,
  recurrencesSectionStyles,
  renderRecurrenceActionMenuItems,
  renderRecurrenceEditModal,
  renderRecurrenceIndicator,
  type RecurrenceRecord,
} from "./recurrences-section.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { sharedShellStyles } from "./shared-styles.js";
import { renderStatementStatus } from "./statement-status.js";
import {
  buildRows,
  buildTransactionQuery,
  calculateOpeningBalance,
  filterStatementPeriodTransactions,
  isAccountStatementTransaction,
  resolveFilters,
  statementDate,
  summarize,
  type AccountRecord,
  type StatementRow,
  type StatementSummary,
  type TransactionRecord,
} from "./transactions-statement.js";

interface CategoryRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
  parentCategoryId?: string;
}

export async function renderTransactionsPage(token: string, url?: URL): Promise<string> {
  const [accountsResult, categoriesResult] = await Promise.all([
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts"),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories"),
  ]);

  if (!accountsResult.ok) return renderErrorPage(accountsResult.error);

  const accounts = accountsResult.data.accounts.filter((account) => account.status === "active");
  const categories = categoriesResult.ok ? categoriesResult.data.categories : [];
  const filters = resolveFilters(url, accounts);
  const selectedAccount = accounts.find((account) => account.id === filters.accountId);

  // Fetching recurrences first triggers the API's catch-up materialization of any due
  // installment into a real Transaction, so it must run before the transactions fetch
  // below in order for newly materialized lançamentos to show up in this same render.
  const recurrencesResult = selectedAccount
    ? await apiGet<{ recurrences: RecurrenceRecord[] }>(
        token,
        `/api/recurrences?accountId=${selectedAccount.id}&status=all`,
      )
    : { ok: true as const, data: { recurrences: [] as RecurrenceRecord[] } };
  const recurrences: RecurrenceRecord[] = recurrencesResult.ok
    ? recurrencesResult.data.recurrences
    : [];

  const transactionResult = filters.accountId
    ? await apiGet<{ transactions: TransactionRecord[] }>(
        token,
        `/api/transactions?${buildTransactionQuery(filters)}`,
      )
    : ({ ok: true, data: { transactions: [] } } as const);

  if (!transactionResult.ok) return renderErrorPage(transactionResult.error);

  const transactions = transactionResult.data.transactions.filter(isAccountStatementTransaction);
  const openingMinor = calculateOpeningBalance(transactions, selectedAccount, filters.startsOn);
  const rows = buildRows(
    filterStatementPeriodTransactions(transactions, filters),
    selectedAccount,
    openingMinor,
  );
  const summary = summarize(rows, openingMinor);

  return renderShell(
    `
      <section class="statement-heading">
        <div>
          <p class="eyebrow">Conta e movimentações</p>
          <h1>Extrato Bancário</h1>
          <p class="muted">Acompanhe lançamentos, saldo e pendências por conta e mês.</p>
        </div>
        <div class="statement-heading-actions" aria-label="Ações rápidas">
          <button type="button" data-open-modal data-quick-kind="transfer"${selectedAccount ? "" : " disabled"}>Transferir</button>
          <button type="button" data-open-modal data-quick-kind="expense"${selectedAccount ? "" : " disabled"}>Nova despesa</button>
          <button type="button" data-open-modal data-quick-kind="income"${selectedAccount ? "" : " disabled"}>Nova receita</button>
        </div>
      </section>

      <section class="panel account-filter">
        <form class="filter-form" method="get" action="/lancamentos" data-auto-submit>
          ${renderAccountPicker(accounts, selectedAccount, filters.accountId)}
          <div class="month-field">
            <label for="filter-month">Mês</label>
            <div class="month-nav">
              <button type="button" class="icon-btn" data-month-step="-1" aria-label="Mês anterior">&#8249;</button>
              <input id="filter-month" name="month" type="month" value="${escapeHtml(filters.month)}" required />
              <button type="button" class="icon-btn" data-month-step="1" aria-label="Próximo mês">&#8250;</button>
            </div>
          </div>
          <button type="button" class="ghost-btn" data-month-current>Mês atual</button>
        </form>
        ${
          selectedAccount
            ? `<p class="muted">Consulta de <strong>${formatDate(filters.startsOn)} até ${formatDate(filters.endsOn)}</strong> em <strong>${escapeHtml(selectedAccount.name)}</strong>.</p>`
            : `<p class="warning">Selecione uma conta para consultar o extrato e criar lançamentos.</p>`
        }
      </section>

      <section class="statement-layout">
        ${renderSummaryPanel(summary, selectedAccount)}
        <section class="panel statement-panel">
          <div class="statement-toolbar">
            <div>
              <p class="eyebrow">Movimentações</p>
              <h2>${selectedAccount ? `Extrato de ${escapeHtml(selectedAccount.name)}` : "Extrato"}</h2>
              <p class="muted">${formatDate(filters.startsOn)} até ${formatDate(filters.endsOn)}</p>
            </div>
            <div class="chips">
              ${chip("Pendentes", summary.pendingCount, "pending")}
              ${chip("Não conciliados", summary.unreconciledCount, "posted")}
              ${chip("Conciliados", summary.reconciledCount, "ok")}
            </div>
          </div>
          <div class="statement-table" role="table" aria-label="Extrato bancário">
            ${renderTableHeader()}
            ${
              rows.length > 0
                ? rows
                    .map((row) =>
                      renderRow(row, selectedAccount, accounts, categories, recurrences),
                    )
                    .join("")
                : emptyState(
                    selectedAccount ? "Nenhum lançamento neste mês." : "Selecione uma conta.",
                    selectedAccount
                      ? "Escolha outro mês ou crie um lançamento para acompanhar o saldo."
                      : "O extrato é sempre exibido por conta bancária.",
                  )
            }
          </div>
        </section>
      </section>
      ${renderModal(selectedAccount, accounts, categories)}
      ${renderRecurrenceEditModal(categories, "account")}
      ${clientScript()}
      ${recurrencesSectionScript()}
    `,
  );
}

function renderTableHeader(): string {
  return `
    <div class="statement-row statement-head" role="row">
      <span class="col-date">Data</span><span class="col-description">Histórico</span><span class="col-category">Categoria</span><span class="col-kind">Tipo</span>
      <span class="col-status">Situação</span><span class="col-amount">Valor</span><span class="col-balance">Saldo</span><span class="col-actions">Ações</span>
    </div>
  `;
}

function renderRow(
  row: StatementRow,
  selectedAccount: AccountRecord | undefined,
  accounts: AccountRecord[],
  categories: CategoryRecord[],
  recurrences: RecurrenceRecord[],
): string {
  const { transaction } = row;
  const categoryName = transaction.categoryId
    ? (categories.find((category) => category.id === transaction.categoryId)?.name ??
      "Categoria não localizada")
    : "Sem categoria";
  const nextStatus = transaction.status === "reconciled" ? "posted" : "reconciled";
  const date = statementDate(transaction);
  const recurrence = transaction.recurrenceId
    ? recurrences.find((candidate) => candidate.id === transaction.recurrenceId)
    : undefined;

  return `
    <article class="statement-row statement-body" role="row">
      <time class="col-date" datetime="${escapeHtml(date)}">${formatDate(date)}</time>
      <div class="description col-description">
        <strong>${escapeHtml(transaction.description || "(sem descrição)")}${recurrence ? renderRecurrenceIndicator() : ""}</strong>
        ${renderTransferNote(transaction, selectedAccount, accounts)}
      </div>
      <span class="col-category">${escapeHtml(categoryName)}</span>
      <span class="col-kind">${escapeHtml(formatKind(transaction.kind))}</span>
      ${renderStatementStatus(transaction)}
      <strong class="col-amount ${row.amountMinor < 0 ? "debit" : "credit"}">${formatMoney(row.amountMinor)}</strong>
      <strong class="col-balance${row.balanceAfterMinor < 0 ? " debit" : ""}" data-balance-minor="${row.balanceAfterMinor}">${formatMoney(row.balanceAfterMinor)}</strong>
      <details class="actions col-actions">
        <summary aria-label="Ações do lançamento ${escapeHtml(transaction.description || "sem descrição")}">${renderDotsIcon()}</summary>
        <div class="actions-menu" role="menu">
          <button type="button" class="actions-item" data-edit="${escapeHtml(transaction.id)}">${renderEditIcon()}<span>Editar</span></button>
          <button type="button" class="actions-item" data-action data-method="PATCH" data-path="/api/transactions/${escapeHtml(transaction.id)}" data-payload='${escapeHtml(JSON.stringify({ status: nextStatus }))}'>${renderReconcileIcon(transaction.status === "reconciled")}<span>${transaction.status === "reconciled" ? "Desconciliar" : "Marcar como conciliado"}</span></button>
          <button type="button" class="actions-item" data-clone="${escapeHtml(transaction.id)}">${renderCloneIcon()}<span>Clonar</span></button>
          <hr class="actions-divider" />
          <button type="button" class="actions-item danger" data-action data-method="POST" data-path="/api/transactions/${escapeHtml(transaction.id)}/void" data-confirm="${escapeHtml(transaction.status === "reconciled" ? "Este lançamento já está conciliado. Excluir mesmo assim?" : "Excluir este lançamento?")}">${renderTrashIcon()}<span>Excluir</span></button>
          ${recurrence ? renderRecurrenceActionMenuItems(recurrence) : ""}
        </div>
      </details>
      <script type="application/json" data-transaction="${escapeHtml(transaction.id)}">${serializeScriptJson(transaction)}</script>
    </article>
  `;
}

function renderTransferNote(
  transaction: TransactionRecord,
  selectedAccount: AccountRecord | undefined,
  accounts: AccountRecord[],
): string {
  if (transaction.kind !== "transfer") return "";
  const origin = accounts.find((account) => account.id === transaction.accountId)?.name;
  const destination = accounts.find(
    (account) => account.id === transaction.destinationAccountId,
  )?.name;
  const text =
    selectedAccount?.id === transaction.destinationAccountId
      ? `Recebida de ${origin ?? "outra conta"}`
      : `Enviada para ${destination ?? "outra conta"}`;

  return `<span>${escapeHtml(text)}</span>`;
}

function renderModal(
  selectedAccount: AccountRecord | undefined,
  accounts: AccountRecord[],
  categories: CategoryRecord[],
): string {
  return `
    <dialog data-modal>
      <section class="modal-panel">
        <form method="dialog" class="close-form"><button type="submit">Fechar</button></form>
        <div>
          <p class="eyebrow">Lançamento da conta</p>
          <h2 data-modal-title>${selectedAccount ? `Novo lançamento em ${escapeHtml(selectedAccount.name)}` : "Selecione uma conta"}</h2>
          <p class="muted">A conta vem do filtro principal e não pode ser trocada neste modal.</p>
        </div>
        <form data-form data-path="/api/transactions">
          <input name="accountId" type="hidden" value="${escapeHtml(selectedAccount?.id ?? "")}" />
          <label>Tipo<select name="kind" required>${renderKindOptions()}</select></label>
          <label>Valor (R$)<input name="amountMinor" data-money inputmode="decimal" required placeholder="0,00" /></label>
          <label>Data prevista<input name="plannedOn" type="date" required /></label>
          <label>Data efetiva<input name="effectiveOn" type="date" /></label>
          <label>Categoria<select name="categoryId" data-category-select><option value="">Sem categoria</option>${renderCategoryOptions(categories)}</select></label>
          <label data-field="destinationAccountId">Conta destino<select name="destinationAccountId"><option value="">Apenas transferência</option>${renderAccountOptions(accounts)}</select></label>
          <label>Repetição<select name="repeatMode"><option value="single">Único</option><option value="installment">Parcelado</option><option value="fixed" data-repeat-option="fixed">Fixo</option></select></label>
          <label data-field="installments">Parcelas<input name="installments" type="number" min="2" max="60" value="2" /></label>
          <label data-field="installmentStart">Parcela inicial<input name="installmentStart" type="number" min="1" max="60" value="1" /></label>
          <label data-field="installmentValueMode">Valor informado<select name="installmentValueMode"><option value="per_installment">Valor da parcela</option><option value="total">Valor total (dividir pelas parcelas)</option></select></label>
          <label data-field="interval">A cada<input name="interval" type="number" min="1" max="60" value="1" /></label>
          <label data-field="frequency">Frequência<select name="frequency"><option value="daily">Dia(s)</option><option value="weekly">Semana(s)</option><option value="monthly" selected>Mês(es)</option><option value="yearly">Ano(s)</option></select></label>
          <label data-field="endOn">Fim opcional<input name="endOn" type="date" /></label>
          <label class="full">Descrição<input name="description" required /></label>
          <label class="full">Observação<textarea name="note" rows="3"></textarea></label>
          <label class="full">Editar repetição<select name="editScope"><option>Somente este lançamento</option><option>Este e os próximos</option><option>Toda a repetição</option></select></label>
          <input type="hidden" name="status" value="posted" />
          <div class="full save-row">
            <div class="status-icons" role="radiogroup" aria-label="Situação do lançamento">
              ${renderStatusIcon("posted", "Efetivado não conciliado", '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="2"/>')}
              ${renderStatusIcon("reconciled", "Conciliado", '<path d="M4 10l4 4 8-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>')}
              ${renderStatusIcon("planned", "Previsto/pendente", '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 6v4l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>')}
              <span class="status-label" data-status-label>Efetivado não conciliado</span>
            </div>
            <button type="submit"${selectedAccount ? "" : " disabled"}>Salvar lançamento</button>
          </div>
        </form>
      </section>
    </dialog>
  `;
}

function clientScript(): string {
  return `
    <script>
      const modal = document.querySelector("[data-modal]");
      const form = document.querySelector("[data-form]");
      const statusNode = document.createElement("p");
      statusNode.className = "form-status muted full";
      statusNode.setAttribute("aria-live", "polite");
      form && form.appendChild(statusNode);

      function moneyToMinor(value) {
        const normalized = String(value).replace(/\\./g, "").replace(",", ".");
        return Math.round(parseFloat(normalized || "0") * 100);
      }

      function minorToMoneyInput(amountMinor) {
        return (amountMinor / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }

      const moneyInput = form && form.querySelector("[data-money]");
      moneyInput && moneyInput.addEventListener("input", () => {
        const digits = moneyInput.value.replace(/\\D/g, "");
        const cents = digits ? parseInt(digits, 10) : 0;
        moneyInput.value = minorToMoneyInput(cents);
      });

      function setFieldVisible(name, visible) {
        const field = form.querySelector('[data-field="' + name + '"]');
        if (field) field.hidden = !visible;
      }

      function syncCategoryOptions() {
        const kind = form.kind.value;
        const select = form.querySelector("[data-category-select]");
        if (!select) return;
        let selectedHidden = false;
        Array.from(select.options).forEach((option) => {
          if (!option.dataset.kind) return;
          const visible = option.dataset.kind === kind;
          option.hidden = !visible;
          if (!visible && option.selected) selectedHidden = true;
        });
        if (selectedHidden) select.value = "";
      }

      function syncFieldVisibility() {
        const kind = form.kind.value;
        const fixedOption = form.repeatMode.querySelector('[data-repeat-option="fixed"]');
        if (fixedOption) fixedOption.disabled = kind === "transfer";
        if (kind === "transfer" && form.repeatMode.value === "fixed") form.repeatMode.value = "single";
        const repeatMode = form.repeatMode.value;
        setFieldVisible("destinationAccountId", kind === "transfer");
        setFieldVisible("installments", repeatMode === "installment");
        setFieldVisible("installmentStart", repeatMode === "installment");
        setFieldVisible("installmentValueMode", repeatMode === "installment");
        setFieldVisible("interval", repeatMode === "fixed");
        setFieldVisible("frequency", repeatMode === "fixed");
        setFieldVisible("endOn", repeatMode === "fixed");
        syncCategoryOptions();
      }

      form && form.addEventListener("change", (event) => {
        if (event.target.name === "kind" || event.target.name === "repeatMode") syncFieldVisibility();
      });

      const statusButtons = form ? Array.from(form.querySelectorAll("[data-status-option]")) : [];
      const statusLabel = form && form.querySelector("[data-status-label]");

      function setStatus(value) {
        form.status.value = value;
        statusButtons.forEach((button) => {
          const active = button.dataset.statusOption === value;
          button.classList.toggle("active", active);
          if (active && statusLabel) statusLabel.textContent = button.dataset.statusLabelText;
        });
      }

      statusButtons.forEach((button) => button.addEventListener("click", () => setStatus(button.dataset.statusOption)));

      const effectiveOnInput = form && form.querySelector('[name="effectiveOn"]');
      effectiveOnInput && effectiveOnInput.addEventListener("blur", () => {
        if (!effectiveOnInput.value && form.plannedOn.value) effectiveOnInput.value = form.plannedOn.value;
      });

      const installmentsInput = form && form.querySelector('[name="installments"]');
      const installmentStartInput = form && form.querySelector('[name="installmentStart"]');
      installmentsInput && installmentsInput.addEventListener("input", () => {
        const total = Math.max(2, Number(installmentsInput.value || 2));
        installmentStartInput.max = String(total);
        if (Number(installmentStartInput.value || 1) > total) installmentStartInput.value = String(total);
      });

      function addMonths(dateValue, months) {
        const date = new Date(dateValue + "T00:00:00Z");
        date.setUTCMonth(date.getUTCMonth() + months);
        return date.toISOString().slice(0, 10);
      }

      function shiftMonth(monthValue, steps) {
        const [year, month] = monthValue.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1 + steps, 1));
        return date.toISOString().slice(0, 7);
      }

      const accountPicker = document.querySelector("[data-account-picker]");
      if (accountPicker) {
        const trigger = accountPicker.querySelector("[data-account-trigger]");
        const triggerIcon = trigger.querySelector(".account-select-icon");
        const triggerText = trigger.querySelector(".account-select-text");
        const menu = accountPicker.querySelector("[data-account-menu]");
        const input = accountPicker.querySelector("[data-account-input]");

        function closeAccountMenu() {
          menu.hidden = true;
          trigger.setAttribute("aria-expanded", "false");
        }

        trigger.addEventListener("click", () => {
          const isOpen = !menu.hidden;
          menu.hidden = isOpen;
          trigger.setAttribute("aria-expanded", String(!isOpen));
        });

        menu.querySelectorAll("[data-account-option]").forEach((option) => option.addEventListener("click", () => {
          const id = option.dataset.accountOption;
          menu.querySelectorAll("[data-account-option]").forEach((node) => node.setAttribute("aria-selected", String(node === option)));
          triggerIcon.innerHTML = option.querySelector(".account-select-icon").innerHTML;
          triggerText.textContent = option.dataset.accountName;
          closeAccountMenu();
          if (input.value !== id) {
            input.value = id;
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }));

        document.addEventListener("click", (event) => {
          if (!accountPicker.contains(event.target)) closeAccountMenu();
        });

        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape") closeAccountMenu();
        });
      }

      const monthInput = document.querySelector("#filter-month");

      document.querySelectorAll("[data-month-step]").forEach((button) => button.addEventListener("click", () => {
        monthInput.value = shiftMonth(monthInput.value, Number(button.dataset.monthStep));
        monthInput.closest("form").requestSubmit();
      }));

      document.querySelectorAll("[data-month-current]").forEach((button) => button.addEventListener("click", () => {
        monthInput.value = new Date().toISOString().slice(0, 7);
        monthInput.closest("form").requestSubmit();
      }));

      document.querySelectorAll("[data-auto-submit]").forEach((autoForm) => autoForm.addEventListener("change", (event) => {
        if (event.target.name === "accountId" || event.target.name === "month") autoForm.requestSubmit();
      }));

      function basePayload(plannedOn, effectiveOn, amountMinor, description) {
        const data = new FormData(form);
        const result = {
          kind: String(data.get("kind")),
          amountMinor,
          occurredOn: effectiveOn || plannedOn,
          plannedOn,
          effectiveOn: effectiveOn || null,
          accountId: String(data.get("accountId")),
          description,
          status: String(data.get("status"))
        };
        const destinationAccountId = String(data.get("destinationAccountId") || "");
        const categoryId = String(data.get("categoryId") || "");
        const note = String(data.get("note") || "").trim();
        if (destinationAccountId) result.destinationAccountId = destinationAccountId;
        if (categoryId) result.categoryId = categoryId;
        if (note) result.description += " - " + note;
        return result;
      }

      function plannedAndEffectiveOn(monthOffset) {
        const data = new FormData(form);
        const plannedOnRaw = String(data.get("plannedOn"));
        const plannedOn = monthOffset ? addMonths(plannedOnRaw, monthOffset) : plannedOnRaw;
        const effectiveBase = String(data.get("effectiveOn") || "") || plannedOnRaw;
        const effectiveOn = monthOffset ? addMonths(effectiveBase, monthOffset) : effectiveBase;
        return { plannedOn, effectiveOn };
      }

      function payload(index, total) {
        const data = new FormData(form);
        const { plannedOn, effectiveOn } = plannedAndEffectiveOn(index);
        const description = String(data.get("description") || "") + (total > 1 ? " " + (index + 1) + "/" + total : "");
        return basePayload(plannedOn, effectiveOn, moneyToMinor(data.get("amountMinor")), description);
      }

      function installmentAmountMinor(totalMinor, totalCount, parcelNumber) {
        const base = Math.floor(totalMinor / totalCount);
        const remainder = totalMinor - base * totalCount;
        return parcelNumber > totalCount - remainder ? base + 1 : base;
      }

      function installmentPayload(parcelNumber, totalCount, monthOffset) {
        const data = new FormData(form);
        const { plannedOn, effectiveOn } = plannedAndEffectiveOn(monthOffset);
        const enteredAmountMinor = moneyToMinor(data.get("amountMinor"));
        const valueMode = String(data.get("installmentValueMode") || "per_installment");
        const amountMinor = valueMode === "total"
          ? installmentAmountMinor(enteredAmountMinor, totalCount, parcelNumber)
          : enteredAmountMinor;
        const description = String(data.get("description") || "") + " " + parcelNumber + "/" + totalCount;
        return basePayload(plannedOn, effectiveOn, amountMinor, description);
      }

      async function send(path, method, body) {
        return fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      }

      async function message(response) {
        const body = await response.json().catch(() => ({}));
        return response.ok ? "Ação concluída. Atualizando..." : ((body.error && body.error.message) || "Não foi possível concluir a ação.");
      }

      document.querySelectorAll("[data-open-modal]").forEach((button) => button.addEventListener("click", () => {
        if (button.disabled) return;
        form.reset();
        form.dataset.path = "/api/transactions";
        form.dataset.method = "POST";
        if (button.dataset.quickKind) form.kind.value = button.dataset.quickKind;
        document.querySelector("[data-modal-title]").textContent = document.querySelector("[data-modal-title]").textContent.replace("Editar", "Novo").replace("Clonar", "Novo");
        setStatus("posted");
        syncFieldVisibility();
        modal.showModal();
      }));

      document.querySelectorAll("[data-transaction]").forEach((node) => {
        const transaction = JSON.parse(node.textContent);
        const hydrate = (selector, clone) => {
          const button = document.querySelector(selector + transaction.id + '"]');
          if (!button) return;
          button.addEventListener("click", () => {
            form.reset();
            form.dataset.path = clone ? "/api/transactions" : "/api/transactions/" + transaction.id;
            form.dataset.method = clone ? "POST" : "PATCH";
            form.kind.value = transaction.kind;
            form.amountMinor.value = minorToMoneyInput(transaction.amountMinor);
            form.plannedOn.value = transaction.plannedOn || transaction.occurredOn;
            form.effectiveOn.value = transaction.effectiveOn || "";
            setStatus(transaction.status === "reconciled" ? "reconciled" : transaction.effectiveOn ? "posted" : "planned");
            form.destinationAccountId.value = transaction.destinationAccountId || "";
            form.categoryId.value = transaction.categoryId || "";
            form.description.value = clone ? "Cópia de " + transaction.description : transaction.description;
            document.querySelector("[data-modal-title]").textContent = clone ? "Clonar lançamento" : "Editar lançamento";
            syncFieldVisibility();
            modal.showModal();
          });
        };
        hydrate('[data-edit="', false);
        hydrate('[data-clone="', true);
      });

      form && form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const mode = form.repeatMode.value;
        const method = form.dataset.method || "POST";
        let response;
        statusNode.className = "form-status muted full";
        statusNode.textContent = "Salvando...";
        if (mode === "fixed" && method === "POST") {
          const item = payload(0, 1);
          response = await send("/api/recurrences", "POST", {
            frequency: form.frequency.value,
            interval: Math.max(1, Number(form.interval.value || 1)),
            startOn: form.plannedOn.value,
            endOn: form.endOn.value || undefined,
            amountMinor: item.amountMinor,
            description: item.description,
            kind: item.kind,
            accountId: item.accountId,
            categoryId: item.categoryId
          });
        } else if (mode === "installment" && method === "POST") {
          const totalCount = Math.max(2, Number(form.installments.value || 2));
          const startParcel = Math.min(Math.max(1, Number(form.installmentStart.value || 1)), totalCount);
          const responses = [];
          let monthOffset = 0;
          for (let parcelNumber = startParcel; parcelNumber <= totalCount; parcelNumber += 1, monthOffset += 1) {
            responses.push(await send("/api/transactions", "POST", installmentPayload(parcelNumber, totalCount, monthOffset)));
          }
          response = responses.find((item) => !item.ok) || responses[responses.length - 1];
        } else {
          response = await send(form.dataset.path || "/api/transactions", method, payload(0, 1));
        }
        statusNode.className = response.ok ? "form-status success full" : "form-status error full";
        statusNode.textContent = await message(response);
        if (response.ok) window.setTimeout(() => window.location.reload(), 450);
      });

      document.querySelectorAll(".actions").forEach((details) => {
        const menu = details.querySelector(":scope > div");
        if (!menu) return;
        const closeOthers = () => document.querySelectorAll(".actions[open]").forEach((other) => {
          if (other !== details) other.removeAttribute("open");
        });
        details.addEventListener("toggle", () => {
          if (!details.open) return;
          closeOthers();
          const summary = details.querySelector("summary");
          const rect = summary.getBoundingClientRect();
          menu.style.position = "fixed";
          menu.style.top = "0px";
          menu.style.left = "0px";
          const menuWidth = menu.offsetWidth;
          const menuHeight = menu.offsetHeight;
          const left = Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8);
          const fitsBelow = rect.bottom + 6 + menuHeight <= window.innerHeight - 8;
          const top = fitsBelow ? rect.bottom + 6 : Math.max(8, rect.top - menuHeight - 6);
          menu.style.left = left + "px";
          menu.style.top = top + "px";
        });
      });

      document.addEventListener("click", (event) => {
        document.querySelectorAll(".actions[open]").forEach((details) => {
          if (!details.contains(event.target)) details.removeAttribute("open");
        });
      });

      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        document.querySelectorAll(".actions[open]").forEach((details) => {
          const summary = details.querySelector("summary");
          details.removeAttribute("open");
          if (summary) summary.focus();
        });
      });

      document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", async () => {
        if (button.dataset.confirm && !window.confirm(button.dataset.confirm)) return;
        const response = await send(button.dataset.path, button.dataset.method || "POST", button.dataset.payload ? JSON.parse(button.dataset.payload) : {});
        if (response.ok) window.setTimeout(() => window.location.reload(), 450);
      }));
    </script>
  `;
}

function renderShell(content: string): string {
  return renderAuthenticatedShellDocument({
    activePathname: "/lancamentos",
    content,
    currentLabel: "Extrato bancário",
    styles: css(),
  });
}

function renderErrorPage(error: string): string {
  return renderShell(
    `<section class="panel"><p class="eyebrow">Erro ao carregar dados</p><h1>Lançamentos</h1><p class="error">${escapeHtml(error)}</p><a class="button-link" href="/lancamentos">Tentar novamente</a></section>`,
  );
}

function renderStatusIcon(value: string, label: string, iconPaths: string): string {
  return `<button type="button" class="status-icon-btn" data-status-option="${value}" data-status-label-text="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">${iconPaths}</svg></button>`;
}

function renderDotsIcon(): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="5" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="19" r="1.9" fill="currentColor"/></svg>`;
}

function renderEditIcon(): string {
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 20h4.8L19.2 9.6a2.7 2.7 0 0 0 0-3.8l-1-1a2.7 2.7 0 0 0-3.8 0L4 15.2V20zm2-2v-2l9.8-9.8c.3-.3.7-.3 1 0l1 1c.3.3.3.7 0 1L8 18H6z" fill="currentColor"/></svg>`;
}

function renderCloneIcon(): string {
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
}

function renderTrashIcon(): string {
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 7h14M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M7 7l1 13a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function renderReconcileIcon(isReconciled: boolean): string {
  if (isReconciled)
    return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 14 5 10l4-4M5 10h9a5 5 0 1 1 0 10h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function renderKindOptions(): string {
  return [
    ["income", "Entrada"],
    ["expense", "Saída"],
    ["transfer", "Transferência"],
  ]
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
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

function renderAccountPicker(
  accounts: AccountRecord[],
  selectedAccount: AccountRecord | undefined,
  selectedId: string | undefined,
): string {
  const triggerIcon = selectedAccount
    ? renderInstitutionIcon(findInstitution(selectedAccount.institutionKey).key)
    : renderInstitutionIcon("");

  return `
    <div class="account-field" data-account-picker>
      <label id="account-picker-label">Conta</label>
      <div class="account-select">
        <button type="button" class="account-select-trigger" data-account-trigger aria-haspopup="listbox" aria-expanded="false" aria-labelledby="account-picker-label">
          <span class="account-select-icon">${triggerIcon}</span>
          <span class="account-select-text">${selectedAccount ? escapeHtml(selectedAccount.name) : "Selecione uma conta"}</span>
          <svg class="account-select-chevron" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <input type="hidden" name="accountId" value="${escapeHtml(selectedId ?? "")}" required data-account-input />
        <ul class="account-select-menu" role="listbox" hidden data-account-menu aria-labelledby="account-picker-label">
          ${accounts.map((account) => renderAccountOption(account, selectedId)).join("")}
        </ul>
      </div>
    </div>
  `;
}

function renderAccountOption(account: AccountRecord, selected?: string): string {
  const institution = findInstitution(account.institutionKey);

  return `
    <li role="option" tabindex="-1" data-account-option="${escapeHtml(account.id)}" data-account-name="${escapeHtml(account.name)}" aria-selected="${selected === account.id}">
      <span class="account-select-icon">${renderInstitutionIcon(institution.key)}</span>
      <span>${escapeHtml(account.name)}</span>
    </li>
  `;
}

function renderCategoryOptions(categories: CategoryRecord[], selected?: string): string {
  return buildCategoryHierarchy(categories)
    .map(({ category, depth }) => {
      const indent = depth > 0 ? "  ".repeat(depth) + "↳ " : "";
      return `<option value="${escapeHtml(category.id)}" data-kind="${escapeHtml(category.kind)}"${selected === category.id ? " selected" : ""}>${indent}${escapeHtml(category.name)}</option>`;
    })
    .join("");
}

function buildCategoryHierarchy(
  categories: CategoryRecord[],
): { category: CategoryRecord; depth: number }[] {
  const childrenByParent = new Map<string | undefined, CategoryRecord[]>();
  for (const category of categories) {
    const key = category.parentCategoryId;
    childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), category]);
  }

  const rows: { category: CategoryRecord; depth: number }[] = [];
  function walk(parentId: string | undefined, depth: number): void {
    for (const category of childrenByParent.get(parentId) ?? []) {
      rows.push({ category, depth });
      walk(category.id, depth + 1);
    }
  }
  walk(undefined, 0);

  return rows;
}

function renderSummaryPanel(
  summary: StatementSummary,
  selectedAccount: AccountRecord | undefined,
): string {
  return `
    <aside class="panel account-summary" aria-label="Resumo da conta">
      <div>
        <p class="eyebrow">Resumo da Conta</p>
        <h2>${escapeHtml(selectedAccount?.name ?? "Selecione uma conta")}</h2>
      </div>
      <section class="summary-balance">
        <span>Saldo atual</span>
        <strong class="${summary.effectiveBalanceMinor < 0 ? "debit" : "credit"}">${formatMoney(summary.effectiveBalanceMinor)}</strong>
        <p>Saldo efetivo com lançamentos realizados.</p>
      </section>
      <div class="summary-totals">
        ${summaryTotal("Receitas", summary.incomeMinor, "credit")}
        ${summaryTotal("Despesas", -summary.expenseMinor, "debit")}
      </div>
      <section class="status-overview" aria-label="Status dos lançamentos">
        <h3>Status</h3>
        ${statusLine("Conciliados", summary.reconciledCount, summary.reconciledMinor, "ok")}
        ${statusLine("Não conciliados", summary.unreconciledCount, summary.unreconciledMinor, "posted")}
        ${statusLine("Pendentes", summary.pendingCount, summary.pendingMinor, "pending")}
      </section>
    </aside>
  `;
}

function summaryTotal(label: string, amountMinor: number, tone: string): string {
  return `<div class="summary-total"><span>${escapeHtml(label)}</span><strong class="${tone}">${formatMoney(amountMinor)}</strong></div>`;
}

function statusLine(label: string, count: number, amountMinor: number, tone: string): string {
  return `<div class="status-line"><span class="chip chip-${tone}">${count}</span><p>${escapeHtml(label)}</p><strong>${formatMoney(amountMinor)}</strong></div>`;
}

function chip(label: string, count: number, tone: string): string {
  return `<span class="chip chip-${tone}"><strong>${count}</strong>${escapeHtml(label)}</span>`;
}

function emptyState(title: string, description: string): string {
  return `<div class="empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div>`;
}

function formatKind(kind: string): string {
  if (kind === "income") return "Entrada";
  if (kind === "expense") return "Saída";
  if (kind === "transfer") return "Transferência";
  return kind;
}

function formatMoney(amountMinor: number): string {
  return formatMinorCurrency(amountMinor);
}

function formatDate(value: string): string {
  return formatDateOnly(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serializeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function css(): string {
  return `
    ${sharedShellStyles()}
    main { display: grid; gap: 14px; margin: 0 auto; min-width: 0; padding: 18px 20px; width: 100%; }
    [hidden] { display: none !important; }
    .warning { color: var(--warning); font-weight: 600; }
    .account-filter { background: var(--surface); color: var(--text); }
    .account-filter .muted { margin-top: 8px; }
    .filter-form { align-items: end; display: grid; gap: 10px; grid-template-columns: minmax(12rem, 1.2fr) minmax(13rem, 1fr) auto; }
    .month-field, .account-field { display: grid; gap: 6px; }
    .account-select { position: relative; }
    .account-select-trigger { align-items: center; background: var(--surface); border: 1px solid var(--line); color: var(--text); display: flex; gap: 8px; justify-content: flex-start; min-height: 36px; padding: 0 10px; text-align: left; width: 100%; }
    .account-select-trigger:hover { background: var(--primary-soft); }
    .account-select-icon { align-items: center; display: inline-flex; flex-shrink: 0; height: 20px; width: 20px; }
    .account-select-icon .brand-icon, .account-select-icon .brand-icon-wrap { display: block; height: 20px; width: 20px; }
    .account-select-icon .brand-logo-img { background: #fff; border-radius: 50%; object-fit: contain; padding: 2px; }
    .account-select-text { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .account-select-chevron { color: var(--muted); flex-shrink: 0; }
    .account-select-menu { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: 0 12px 32px rgba(15,23,42,.14); left: 0; list-style: none; margin: 4px 0 0; max-height: 260px; overflow-y: auto; padding: 4px; position: absolute; right: 0; top: 100%; z-index: 20; }
    .account-select-menu li { align-items: center; border-radius: var(--radius); cursor: pointer; display: flex; font-size: 0.875rem; font-weight: 600; gap: 8px; padding: 7px 8px; }
    .account-select-menu li:hover, .account-select-menu li[aria-selected=true] { background: var(--primary-soft); }
    .account-select-menu li .brand-icon, .account-select-menu li .brand-icon-wrap { display: block; height: 20px; width: 20px; }
    .month-nav { align-items: center; background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius); display: grid; gap: 4px; grid-template-columns: auto minmax(0,1fr) auto; padding: 3px; }
    .month-nav input { border: 0; background: transparent; min-height: 30px; text-align: center; font-size: 0.875rem; }
    .month-nav input:focus { outline: 2px solid var(--cyan); border-radius: 4px; }
    .icon-btn { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); color: var(--primary); min-height: 30px; min-width: 30px; padding: 0; }
    .icon-btn:hover { background: var(--primary-soft); }
    .ghost-btn { background: var(--surface); border: 1px solid var(--line); color: var(--primary); }
    .ghost-btn:hover { background: var(--primary-soft); }
    .statement-layout { align-items: start; display: grid; gap: 12px; grid-template-columns: minmax(260px, 320px) minmax(0,1fr); }
    .account-summary { display: grid; gap: 12px; position: sticky; top: 68px; }
    .account-summary h2 { font-size: 0.9375rem; }
    .summary-balance { background: var(--primary-soft); border: 1px solid #d4e6ec; border-radius: var(--radius); display: grid; gap: 4px; padding: 12px; }
    .summary-balance span, .summary-total span { color: var(--muted); font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; }
    .summary-balance strong, .summary-total strong, .status-line strong, .col-amount, .col-balance { font-variant-numeric: tabular-nums; overflow-wrap: normal; white-space: nowrap; word-break: normal; }
    .summary-balance strong { font-size: 1.125rem; }
    .summary-balance p { color: var(--muted); font-size: 0.8125rem; }
    .summary-totals { display: grid; gap: 8px; grid-template-columns: 1fr 1fr; }
    .summary-total { border: 1px solid var(--line); border-radius: var(--radius); display: grid; gap: 3px; min-width: 0; padding: 10px; }
    .summary-total strong { font-size: 0.8125rem; }
    .status-overview { border-top: 1px solid var(--line); display: grid; gap: 8px; padding-top: 12px; }
    .status-overview h3 { font-size: 0.8125rem; }
    .status-line { align-items: center; display: grid; gap: 6px; grid-template-columns: auto minmax(0,1fr) auto; }
    .status-line p { color: var(--muted); font-size: 0.8125rem; font-weight: 600; }
    .status-line strong { font-size: 0.8125rem; }
    .statement-panel { padding: 0; overflow: hidden; }
    .statement-toolbar { align-items: center; border-bottom: 1px solid var(--line); display: flex; gap: 12px; justify-content: space-between; padding: 12px 14px; }
    .statement-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
    .statement-heading-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { align-items: center; background: var(--primary-soft); border: 1px solid #d4e6ec; border-radius: 999px; color: var(--primary); display: inline-flex; gap: 5px; font-size: 0.75rem; font-weight: 700; padding: 3px 9px; white-space: nowrap; }
    .chip-pending { background: var(--warning-bg); border-color: #fde68a; color: var(--warning); }
    .chip-ok { background: var(--success-bg); border-color: #bbf7d0; color: var(--success); }
    .chip-posted { background: #e0f2fe; border-color: #bae6fd; color: #0369a1; }
    .statement-table { display: grid; max-width: 100%; overflow-x: auto; }
    .statement-row { align-items: center; border-bottom: 1px solid var(--line); display: grid; gap: 8px; grid-template-columns: 6rem minmax(8rem,1.3fr) minmax(7rem,0.9fr) 7rem 4.5rem 8rem 8rem 3rem; padding: 8px 12px; }
    .statement-head { background: #f1f7fa; color: var(--muted); font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; }
    .statement-head .col-amount, .statement-head .col-balance, .col-amount, .col-balance { text-align: right; }
    .description { display: grid; gap: 2px; }
    .description span { color: var(--muted); font-size: 0.8125rem; }
    .credit { color: var(--success) !important; }
    .debit { color: var(--danger) !important; }
    .statement-status { align-items: center; border: 1px solid currentColor; border-radius: 999px; cursor: default; display: inline-flex; height: 26px; justify-content: center; justify-self: start; padding: 0; position: relative; width: 26px; }
    .statement-status svg { flex-shrink: 0; height: 15px; width: 15px; }
    .statement-status::after { background: var(--text); border-radius: 4px; color: var(--surface); content: attr(data-tooltip); font-size: 0.75rem; font-weight: 600; left: 50%; opacity: 0; padding: 5px 7px; pointer-events: none; position: absolute; top: calc(100% + 6px); transform: translate(-50%, -2px); transition: opacity .15s ease, transform .15s ease; visibility: hidden; white-space: nowrap; z-index: 60; }
    .statement-status:hover::after, .statement-status:focus::after { opacity: 1; transform: translate(-50%, 0); visibility: visible; }
    .statement-status:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
    .statement-status-ok { background: var(--success-bg); color: var(--success); }
    .statement-status-posted { background: #e0f2fe; color: #0369a1; }
    .statement-status-pending { background: var(--warning-bg); color: var(--warning); }
    .statement-status-planned { background: var(--primary-soft); color: var(--primary); }
    .actions { position: relative; }
    .actions summary { align-items: center; background: var(--primary-soft); border: 1px solid #d4e6ec; border-radius: 999px; color: var(--primary); cursor: pointer; display: inline-flex; height: 28px; justify-content: center; list-style: none; width: 28px; }
    .actions summary::-webkit-details-marker { display: none; }
    .actions summary:hover { background: #d4e6ec; }
    .actions-menu { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: 0 12px 32px rgba(15,23,42,.14); display: grid; gap: 2px; max-width: 220px; padding: 4px; position: absolute; right: 0; top: 34px; width: max-content; z-index: 50; }
    .actions-item { align-items: center; background: transparent; border: 0; border-radius: var(--radius); color: var(--text); display: flex; font-size: 0.8125rem; font-weight: 600; gap: 8px; justify-content: flex-start; min-height: 32px; padding: 0 8px; text-align: left; white-space: nowrap; }
    .actions-item:hover { background: var(--primary-soft); }
    .actions-item svg { flex-shrink: 0; }
    .actions-item.danger { color: var(--danger); }
    .actions-item.danger:hover { background: var(--danger-bg); }
    .actions-divider { border: 0; border-top: 1px solid var(--line); margin: 3px 2px; }
    .empty { background: var(--bg); border: 1px dashed var(--line); border-radius: var(--radius-lg); display: grid; gap: 4px; margin: 14px; padding: 14px; }
    dialog { border: 0; border-radius: var(--radius-lg); box-shadow: 0 24px 80px rgba(15,23,42,.24); max-width: min(860px, calc(100vw - 32px)); padding: 0; width: 100%; }
    dialog::backdrop { background: rgba(6,25,35,.48); }
    .modal-panel { display: grid; gap: 14px; padding: 18px; }
    .close-form { display: flex; justify-content: flex-end; }
    .modal-panel form[data-form] { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0,1fr)); }
    .full, .modal-panel button[type=submit], .modal-panel form[data-form] p { grid-column: 1 / -1; }
    .save-row { align-items: center; display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; }
    .status-icons { align-items: center; display: flex; gap: 6px; }
    .status-icon-btn { align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 999px; color: var(--muted); display: inline-flex; height: 32px; justify-content: center; min-height: 0; padding: 0; width: 32px; }
    .status-icon-btn:hover { background: var(--primary-soft); }
    .status-icon-btn[data-status-option=posted].active { background: #e0f2fe; border-color: #bae6fd; color: #0369a1; }
    .status-icon-btn[data-status-option=reconciled].active { background: var(--success-bg); border-color: #bbf7d0; color: var(--success); }
    .status-icon-btn[data-status-option=planned].active { background: var(--warning-bg); border-color: #fde68a; color: var(--warning); }
    .status-label { color: var(--muted); font-size: 0.75rem; font-weight: 600; }
    .error-page { min-height: 100vh; place-content: center; }
    @media (max-width: 1279px) { .statement-layout { grid-template-columns: 1fr; } .account-summary { position: static; } }
    @media (max-width: 1024px) { .filter-form { grid-template-columns: repeat(2, minmax(0,1fr)); } .modal-panel form[data-form] { grid-template-columns: repeat(2, minmax(0,1fr)); } }
    @media (max-width: 760px) { main { padding: 14px 14px 24px; } .filter-form, .modal-panel form[data-form], .summary-totals { grid-template-columns: 1fr; } .statement-heading, .statement-toolbar { align-items: stretch; display: grid; } .statement-heading-actions { justify-content: stretch; } .statement-heading-actions button { flex: 1 1 auto; } .save-row { align-items: stretch; flex-direction: column; } .statement-table { overflow-x: visible; } .statement-head { display: none; } .statement-row.statement-body { align-items: center; display: flex; flex-wrap: wrap; gap: 5px 8px; padding: 10px; } .statement-row.statement-body .col-date { color: var(--muted); flex: 0 0 auto; font-size: 0.75rem; order: 1; } .statement-row.statement-body .col-actions { margin-left: auto; order: 2; } .statement-row.statement-body .col-description { flex: 1 1 100%; order: 3; } .statement-row.statement-body .col-category, .statement-row.statement-body .col-kind { color: var(--muted); font-size: 0.75rem; order: 4; } .statement-row.statement-body .col-status { order: 5; } .statement-row.statement-body .col-amount { font-size: 0.9375rem; margin-left: auto; order: 6; } .statement-row.statement-body .col-balance { color: var(--muted); font-size: 0.75rem; order: 7; } }
    ${recurrencesSectionStyles()}
  `;
}
