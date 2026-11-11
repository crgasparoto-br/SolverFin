import type { AccountRecord } from "./transactions-statement.js";
import {
  statementCloseProtectionScript,
  statementContinueVisibilityScript,
} from "./statement-save-flow-scripts.js";

interface Dependencies {
  resolveAccountCurrency: (account: AccountRecord | undefined) => string | undefined;
  formatAccountLabel: (account: AccountRecord | undefined) => string;
  serializeScriptJson: (value: unknown) => string;
}

export function statementClientScriptPart1(
  currency: string | undefined,
  accounts: readonly AccountRecord[],
  { resolveAccountCurrency, formatAccountLabel, serializeScriptJson }: Dependencies,
): string {
  return String.raw`<script data-statement-a2-runtime="true">
  (() => {
    const statementCurrency = ${JSON.stringify(currency ?? "")};
    const accountCurrencies = new Map(${serializeScriptJson(
      accounts.map((account) => [account.id, resolveAccountCurrency(account) ?? ""]),
    )});
    const accountLabels = new Map(${serializeScriptJson(
      accounts.map((account) => [account.id, formatAccountLabel(account)]),
    )});
    const modal = document.querySelector("[data-modal]");
    const form = document.querySelector("[data-form]");
    if (!form || !modal) return;
    const statusNode = document.createElement("p");
    statusNode.className = "form-status muted full";
    statusNode.setAttribute("aria-live", "polite");
    form.appendChild(statusNode);
    const remunerationIds = new Set();
    const unlockRemunerationFields = () => {
      form.dataset.remunerationProtected = "false";
      form.querySelectorAll("[data-remuneration-protected]").forEach((field) => {
        field.removeAttribute("data-remuneration-protected");
        field.removeAttribute("aria-disabled");
        if ("readOnly" in field) field.readOnly = false;
      });
      form.querySelector("[data-remuneration-edit-notice]")?.remove();
    };
    const protectRemunerationField = (field) => {
      if (!field) return;
      field.setAttribute("data-remuneration-protected", "true");
      field.setAttribute("aria-disabled", "true");
      field.dataset.remunerationValue = field.value;
      if ("readOnly" in field) field.readOnly = true;
    };
    const lockRemunerationFields = () => {
      unlockRemunerationFields();
      form.dataset.remunerationProtected = "true";
      const repeatMode = form.elements.repeatMode;
      if (repeatMode) repeatMode.value = "single";
      [form.elements.kind, form.elements.plannedOn, form.elements.description, repeatMode, form.querySelector("[data-edit-account-select]")].forEach(protectRemunerationField);
      const saveRow = form.querySelector(".save-row");
      if (saveRow && !form.querySelector("[data-remuneration-edit-notice]")) {
        const notice = document.createElement("p");
        notice.className = "remuneration-edit-notice";
        notice.setAttribute("data-remuneration-edit-notice", "");
        notice.textContent = "Neste lançamento, altere somente o valor creditado, a categoria, a situação e a data efetiva. Conta, tipo, competência e memória do cálculo permanecem protegidos.";
        saveRow.before(notice);
      }
    };
    form.addEventListener("mousedown", (event) => {
      const target = event.target;
      if (target?.matches?.('select[data-remuneration-protected="true"]')) event.preventDefault();
    }, true);
    form.addEventListener("keydown", (event) => {
      const target = event.target;
      if (target?.matches?.('select[data-remuneration-protected="true"]')) event.preventDefault();
    }, true);
    form.addEventListener("change", (event) => {
      const target = event.target;
      if (target?.matches?.('[data-remuneration-protected="true"]')) target.value = target.dataset.remunerationValue || target.value;
    }, true);

    const moneyToMinor = (value) => Math.round(parseFloat(String(value).replace(/\./g, "").replace(",", ".") || "0") * 100);
    const minorToMoneyInput = (amountMinor) => (amountMinor / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const money = (minor, currencyCode) => /^[A-Z]{3}$/.test(currencyCode || "") ? (Number(minor || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: currencyCode }) : "Moeda indisponível";
    const currentLocalDate = () => { const now = new Date(); return String(now.getFullYear()) + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0"); };
    const moneyInput = form.querySelector("[data-money]");
    const destinationMoneyInput = form.querySelector("[data-destination-money]");
    moneyInput?.addEventListener("input", () => { const digits = moneyInput.value.replace(/\D/g, ""); moneyInput.value = minorToMoneyInput(digits ? parseInt(digits, 10) : 0); syncEffectiveRate(); });
    destinationMoneyInput?.addEventListener("input", () => { const digits = destinationMoneyInput.value.replace(/\D/g, ""); destinationMoneyInput.value = minorToMoneyInput(digits ? parseInt(digits, 10) : 0); syncEffectiveRate(); });

    const setFieldVisible = (name, visible) => { const field = form.querySelector('[data-field="' + name + '"]'); if (field) field.hidden = !visible; };
    const syncCategoryOptions = () => {
      const select = form.querySelector("[data-category-select]"); if (!select) return;
      let selectedHidden = false;
      Array.from(select.options).forEach((option) => { if (!option.dataset.kind) return; const visible = option.dataset.kind === form.kind.value; option.hidden = !visible; if (!visible && option.selected) selectedHidden = true; });
      if (selectedHidden) select.value = "";
    };
    // Create mode submits the hidden statement account; edit mode (#473) swaps in an enabled select.
    const sourceAccountId = () => String(Array.from(form.querySelectorAll('[name="accountId"]')).find((field) => !field.disabled)?.value || "");
    const sourceCurrency = () => accountCurrencies.get(sourceAccountId()) || statementCurrency;
    const destinationCurrency = () => String(form.destinationAccountId.selectedOptions?.[0]?.dataset.currency || "");
    const isCrossCurrencyTransfer = () => form.kind.value === "transfer" && Boolean(destinationCurrency()) && destinationCurrency() !== sourceCurrency();
    const formatEffectiveRate = (sourceMinor, destinationMinor) => {
      if (!Number.isSafeInteger(sourceMinor) || !Number.isSafeInteger(destinationMinor) || sourceMinor <= 0 || destinationMinor <= 0) return "Informe os dois valores";
      const scale = 1000000n;
      const denominator = BigInt(sourceMinor);
      const rounded = (BigInt(destinationMinor) * scale + denominator / 2n) / denominator;
      const whole = rounded / scale;
      const fraction = (rounded % scale).toString().padStart(6, "0").replace(/0+$/, "");
      return fraction ? whole.toString() + "," + fraction : whole.toString();
    };
    const syncEffectiveRate = () => {
      const output = form.querySelector("[data-effective-rate]");
      const direction = form.querySelector("[data-effective-rate-direction]");
      const sourceMinor = moneyToMinor(moneyInput?.value || "0");
      const destinationMinor = moneyToMinor(destinationMoneyInput?.value || "0");
      const source = sourceCurrency();
      const destination = destinationCurrency();
      if (direction) direction.textContent = source && destination ? destination + " por " + source : "";
      if (!output) return;
      output.textContent = formatEffectiveRate(sourceMinor, destinationMinor);
    };
    const syncTransferCurrencyState = () => {
      const source = sourceCurrency();
      const destination = destinationCurrency();
      const crossCurrency = isCrossCurrencyTransfer();
      const sourceNode = form.querySelector("[data-source-currency]");
      const destinationNode = form.querySelector("[data-destination-currency]");
      if (sourceNode) sourceNode.textContent = source || "moeda indisponível";
      if (destinationNode) destinationNode.textContent = destination || "moeda destino";
      setFieldVisible("destinationAmountMinor", crossCurrency);
      setFieldVisible("effectiveRate", crossCurrency);
      if (destinationMoneyInput) destinationMoneyInput.required = crossCurrency;
      const repeatHint = form.querySelector("[data-cross-currency-repeat-hint]");
      if (repeatHint) repeatHint.hidden = !crossCurrency;
      const installmentOption = form.repeatMode.querySelector('option[value="installment"]');
      if (installmentOption) installmentOption.disabled = crossCurrency;
      const fixedOption = form.repeatMode.querySelector('[data-repeat-option="fixed"]');
      if (fixedOption) fixedOption.disabled = crossCurrency;
      if (crossCurrency && form.repeatMode.value !== "single") form.repeatMode.value = "single";
      syncEffectiveRate();
    };
    const syncTransferAccounts = () => {
      const transfer = form.kind.value === "transfer";
      const destinationSelect = form.destinationAccountId;
      const sourceId = sourceAccountId();
      const editAccountField = form.querySelector("[data-edit-account-field]");
      const editingSource = Boolean(editAccountField && !editAccountField.hidden);
      if (editAccountField?.firstChild?.nodeType === 3) editAccountField.firstChild.nodeValue = transfer ? "Conta origem" : "Conta";
      const sourceDisplay = form.querySelector("[data-source-account-display]");
      if (sourceDisplay) sourceDisplay.value = accountLabels.get(sourceId) || "Conta indisponível";
      setFieldVisible("sourceAccount", transfer && !editingSource);
      setFieldVisible("destinationAccountId", transfer);
      destinationSelect.disabled = !transfer;
      destinationSelect.required = transfer;
      Array.from(destinationSelect.options).forEach((option) => { if (option.value) option.disabled = option.value === sourceId; });
      if (!transfer) {
        destinationSelect.value = "";
        if (destinationMoneyInput) { destinationMoneyInput.value = ""; destinationMoneyInput.dataset.currency = ""; }
      }
      destinationSelect.setCustomValidity(transfer && destinationSelect.value && destinationSelect.value === sourceId ? "Escolha uma conta destino diferente da conta origem." : "");
    };
    const syncFieldVisibility = () => {
      syncTransferAccounts();
      syncTransferCurrencyState();
      const repeatMode = form.repeatMode.value;
      const usesGenericTemporalFields = repeatMode === "single" || form.dataset.method === "PATCH";
      setFieldVisible("occurredOn", usesGenericTemporalFields); form.occurredOn.required = usesGenericTemporalFields;
      ["installments", "installmentStart", "installmentValueMode"].forEach((name) => setFieldVisible(name, repeatMode === "installment"));
      ["interval", "frequency", "endOn"].forEach((name) => setFieldVisible(name, repeatMode === "fixed"));
      syncCategoryOptions();
${statementContinueVisibilityScript}
    };
    form.addEventListener("change", (event) => {
      if (event.target.name === "destinationAccountId" && destinationMoneyInput) {
        const nextCurrency = destinationCurrency();
        const previousCurrency = destinationMoneyInput.dataset.currency || "";
        if (previousCurrency && previousCurrency !== nextCurrency) destinationMoneyInput.value = "";
        destinationMoneyInput.dataset.currency = nextCurrency;
      }
      if (event.target.name === "kind" || event.target.name === "repeatMode" || event.target.name === "accountId" || event.target.name === "destinationAccountId") syncFieldVisibility();
    });

    form.querySelector("[data-transaction-cancel]")?.addEventListener("click", () => {
      if (form.dataset.submitting === "true") return;
      if (typeof modal.requestClose === "function") modal.requestClose();
      else modal.close();
    });
${statementCloseProtectionScript}
    const statusButtons = Array.from(form.querySelectorAll("[data-status-option]"));
    const statusLabel = form.querySelector("[data-status-label]");
    const setStatus = (value) => { form.status.value = value; statusButtons.forEach((button) => { const active = button.dataset.statusOption === value; button.classList.toggle("active", active); button.setAttribute("aria-checked", String(active)); if (active && statusLabel) statusLabel.textContent = button.dataset.statusLabelText; }); };
    statusButtons.forEach((button) => button.addEventListener("click", () => setStatus(button.dataset.statusOption)));

    const addMonths = (dateValue, months) => { const date = new Date(dateValue + "T00:00:00Z"); date.setUTCMonth(date.getUTCMonth() + months); return date.toISOString().slice(0, 10); };
    const shiftMonth = (monthValue, steps) => { const [year, month] = monthValue.split("-").map(Number); return new Date(Date.UTC(year, month - 1 + steps, 1)).toISOString().slice(0, 7); };
    const monthInput = document.querySelector("#filter-month");
    document.querySelectorAll("[data-month-step]").forEach((button) => button.addEventListener("click", () => { monthInput.value = shiftMonth(monthInput.value, Number(button.dataset.monthStep)); monthInput.form?.requestSubmit(); }));
    document.querySelectorAll("[data-month-current]").forEach((button) => button.addEventListener("click", () => { monthInput.value = new Date().toISOString().slice(0, 7); monthInput.form?.requestSubmit(); }));
    monthInput.addEventListener("change", () => { monthInput.form?.querySelectorAll('input[name="from"],input[name="to"]').forEach((node) => node.remove()); monthInput.form?.requestSubmit(); });
    document.querySelectorAll("[data-auto-submit]").forEach((autoForm) => autoForm.addEventListener("change", (event) => { if (event.target.name === "accountId" || event.target.name === "sort") autoForm.requestSubmit(); }));

    const accountPicker = document.querySelector("[data-account-picker]");
    if (accountPicker) {
      const trigger = accountPicker.querySelector("[data-account-trigger]"); const menu = accountPicker.querySelector("[data-account-menu]"); const input = accountPicker.querySelector("[data-account-input]");
      const close = () => { menu.hidden = true; trigger.setAttribute("aria-expanded", "false"); };
      trigger.addEventListener("click", () => { menu.hidden = !menu.hidden; trigger.setAttribute("aria-expanded", String(!menu.hidden)); });
      menu.querySelectorAll("[data-account-option]").forEach((option) => option.addEventListener("click", () => { input.value = option.dataset.accountOption; if (input.value !== "all") { const currencyField = accountPicker.querySelector("[data-auto-currency]"); if (currencyField) currencyField.disabled = true; } close(); input.dispatchEvent(new Event("change", { bubbles: true })); }));
      document.addEventListener("click", (event) => { if (!accountPicker.contains(event.target)) close(); });
      document.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
    }

    const withActiveProfile = (path) => { const profileId = new URL(location.href).searchParams.get("profileId"); if (!profileId) return path; return path + (path.includes("?") ? "&" : "?") + "profileId=" + encodeURIComponent(profileId); };
    const send = (path, method, body) => fetch(withActiveProfile(path), { method, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
    const transactionErrorMessages = {
      TRANSACTION_KIND_REQUIRED: "Informe o tipo do lançamento.",
      TRANSACTION_KIND_INVALID: "O tipo de lançamento informado não é suportado.",
      TRANSACTION_STATUS_INVALID: "A situação do lançamento informada não é suportada.",
      TRANSACTION_SOURCE_INVALID: "A origem do lançamento informada não é suportada.",
      TRANSACTION_AMOUNT_INVALID: "Informe um valor válido maior que zero.",
      TRANSACTION_DATE_REQUIRED: "Informe a data do evento.",
      TRANSACTION_EFFECTIVE_DATE_REQUIRED: "Lançamentos efetivados ou conciliados exigem data efetiva.",
      TRANSACTION_ACCOUNT_REQUIRED: "Selecione uma conta para o lançamento.",
      TRANSACTION_ACCOUNT_INVALID: "A conta selecionada não corresponde ao lançamento.",
      TRANSACTION_ACCOUNT_ARCHIVED: "A conta selecionada precisa estar ativa.",
      TRANSACTION_DESTINATION_ACCOUNT_REQUIRED: "Selecione a conta de destino da transferência.",
      TRANSACTION_DESTINATION_ACCOUNT_INVALID: "A conta de destino da transferência é inválida.",
      TRANSACTION_DESTINATION_AMOUNT_REQUIRED: "Informe o valor que será creditado na conta de destino.",
      TRANSACTION_DESTINATION_AMOUNT_INVALID: "O valor da conta de destino precisa ser maior que zero e compatível com a transferência.",
      TRANSACTION_TRANSFER_SAME_ACCOUNT: "A conta de origem e a conta de destino devem ser diferentes.",
      TRANSACTION_CURRENCY_MISMATCH: "A moeda do lançamento deve ser a mesma da conta.",
      TRANSACTION_CATEGORY_INVALID: "A categoria selecionada é inválida.",
      TRANSACTION_CATEGORY_ARCHIVED: "A categoria selecionada precisa estar ativa.",
      RECURRENCE_DESTINATION_ACCOUNT_REQUIRED: "Selecione a conta de destino da transferência recorrente.",
      RECURRENCE_DESTINATION_ACCOUNT_INVALID: "A conta de destino da recorrência é inválida.",
      RECURRENCE_TRANSFER_SAME_ACCOUNT: "A conta de origem e a conta de destino devem ser diferentes.",
      RECURRENCE_TRANSFER_CURRENCY_UNSUPPORTED: "Transferências fixas exigem contas de origem e destino na mesma moeda."
    };
    const safeMessageCodes = new Set(["INSTALLMENT_PAYLOAD_INVALID"]);
    const message = async (response) => { const body = await response.json().catch(() => ({})); if (response.ok) return "Ação concluída. Atualizando..."; const code = String((body.error && body.error.code) || ""); const safeDetail = safeMessageCodes.has(code) ? String(body?.error?.message || "") : ""; return transactionErrorMessages[code] || safeDetail || "Não foi possível concluir a ação. Revise os dados e tente novamente."; };
`;
}
