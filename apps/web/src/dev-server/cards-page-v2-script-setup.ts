// Client-side fragments compose one script and share its lexical scope.
// Keep the content in a template literal so escapes match the rendered runtime.
export function cardsPageSetupScript(): string {
  return `<script data-cards-a3-runtime="true">
    (() => {
      const moneyToMinor = (value) => {
        const normalized = String(value || "").replace(/\\./g, "").replace(",", ".");
        return Math.round(Number.parseFloat(normalized || "0") * 100);
      };
      const minorToMoney = (value) => (Number(value || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const localToday = () => {
        const now = new Date();
        return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
      };
      document.querySelectorAll("[data-money]").forEach((input) => input.addEventListener("input", () => {
        const digits = input.value.replace(/\\D/g, "");
        input.value = minorToMoney(digits ? Number.parseInt(digits, 10) : 0);
      }));
      document.querySelector("[data-card-select]")?.addEventListener("change", (event) => event.target.form?.requestSubmit());
      if (window.matchMedia("(max-width: 760px)").matches) {
        document.querySelectorAll(".cards-master-details,.cards-instrument-nav").forEach((details) => { details.open = false; });
      }

      let lastDialogTrigger = null;
      const closeDialog = (dialog) => {
        if (!dialog?.open) return;
        dialog.close();
        if (lastDialogTrigger && typeof lastDialogTrigger.focus === "function") lastDialogTrigger.focus();
        lastDialogTrigger = null;
      };
      const purchaseForm = document.querySelector("[data-purchase-form]");
      const repeatMode = purchaseForm?.querySelector('[name="repeatMode"]');
      const setField = (name, visible) => {
        const field = purchaseForm?.querySelector('[data-purchase-field="' + name + '"]');
        if (field) field.hidden = !visible;
      };
      const syncRepeatFields = () => {
        const mode = repeatMode?.value || "single";
        setField("totalInstallments", mode === "installment");
        setField("installmentStart", mode === "installment");
        setField("installmentValueMode", mode === "installment");
        setField("interval", mode === "fixed");
        setField("frequency", mode === "fixed");
        setField("endOn", mode === "fixed");
        const help = purchaseForm?.querySelector("[data-installment-value-help]");
        const valueMode = purchaseForm?.querySelector('[name="installmentValueMode"]')?.value;
        if (help) help.textContent = valueMode === "per_installment"
          ? "O valor informado será aplicado a cada parcela e o total da compra será calculado."
          : "O valor será dividido pelo total de parcelas.";
      };
      repeatMode?.addEventListener("change", syncRepeatFields);
      purchaseForm?.querySelector('[name="installmentValueMode"]')?.addEventListener("change", syncRepeatFields);
      document.querySelector('dialog[data-modal="purchase"]')?.addEventListener("close", () => {
        if (purchaseForm?.dataset.savedDuringSession === "true") window.location.reload();
      });
      const resetPurchaseForm = () => {
        if (!purchaseForm) return;
        purchaseForm.reset();
        purchaseForm.dataset.method = "POST";
        const defaultPath = purchaseForm.getAttribute("data-path") || "";
        purchaseForm.dataset.path = defaultPath;
        purchaseForm.dataset.currentPurchaseId = "";
        purchaseForm.dataset.recurrenceId = "";
        purchaseForm.dataset.installmentPurchase = "false";
        purchaseForm.dataset.installmentId = "";
        purchaseForm.dataset.invoiceId = "";
        purchaseForm.dataset.originalInstallmentAmount = "";
        document.querySelector('dialog[data-modal="purchase"]')?.removeAttribute("data-editing");
        setField("recurrenceDateHint", false);
        purchaseForm.querySelector('[name="currentPurchaseId"]').value = "";
        purchaseForm.querySelector('[name="recurrenceId"]').value = "";
        const occurredOnField = purchaseForm.querySelector('[name="occurredOn"]');
        if (occurredOnField) { occurredOnField.value = localToday(); occurredOnField.readOnly = false; }
        const amountField = purchaseForm.querySelector('[name="amountMinor"]');
        if (amountField) amountField.readOnly = false;
        const amountLabel = purchaseForm.querySelector("[data-purchase-amount-label]");
        const amountCurrency = purchaseForm.querySelector('[name="currency"]')?.value || "";
        if (amountLabel) amountLabel.textContent = "Valor" + (amountCurrency ? " (" + amountCurrency + ")" : "");
        ["totalInstallments", "installmentStart"].forEach((name) => {
          const field = purchaseForm.querySelector('[name="' + name + '"]');
          if (field) field.readOnly = false;
        });
        if (repeatMode) repeatMode.disabled = false;
        if (repeatMode?.closest("label")) repeatMode.closest("label").hidden = false;
        const currencyField = purchaseForm.querySelector('[name="currency"]');
        if (currencyField) currencyField.disabled = false;
        document.querySelector("[data-purchase-modal-title]").textContent = "Registrar compra";
        const purchaseDescription = document.querySelector("[data-purchase-modal-description]");
        if (purchaseDescription) purchaseDescription.textContent = "Informe valor e dados da compra. A moeda segue a configuração do cartão.";
        const scheduleSection = purchaseForm.querySelector('[data-purchase-section="schedule"]');
        if (scheduleSection) scheduleSection.hidden = false;
        setField("installmentAmountMinor", false);
        setField("installmentContext", false);
        syncRepeatFields();
      };
      document.querySelectorAll("[data-open-modal]").forEach((button) => button.addEventListener("click", () => {
        if (button.disabled) return;
        const dialog = document.querySelector('dialog[data-modal="' + button.dataset.openModal + '"]');
        if (!dialog) return;
        lastDialogTrigger = button;
        if (button.dataset.openModal === "purchase") resetPurchaseForm();
        dialog.showModal();
      }));
      document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => closeDialog(button.closest("dialog"))));
      document.querySelectorAll("dialog.cards-dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeDialog(dialog);
      }));

      const recurringScopeDialog = document.querySelector('dialog[data-modal="recurring-edit-scope"]');
      let pendingRecurringEdit = null;
      const installmentDialog = document.querySelector('dialog[data-modal="installment-value"]');
      const installmentAmountForm = installmentDialog?.querySelector("[data-installment-amount-form]");
`;
}
