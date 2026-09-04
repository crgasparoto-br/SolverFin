export function renderAccountsCardsApiFormScript(): string {
  return `
    <script>
      (() => {
        const confirmationDialog = document.querySelector("#accounts-cards-confirm-dialog");
        const confirmationMessage = confirmationDialog && confirmationDialog.querySelector("[data-confirm-message]");
        const confirmationAccept = confirmationDialog && confirmationDialog.querySelector("[data-confirm-accept]");
        const confirmationCancel = confirmationDialog && confirmationDialog.querySelector("[data-confirm-cancel]");
        const loadingState = document.querySelector("[data-resource-loading]");

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
            const sendEmptyValue = key === "agencyIdentifier" || key === "accountIdentifier";
            if (value === "" && !sendEmptyValue) return;
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
            const instrument = { type: payload.instrumentType || "physical", holder: payload.instrumentHolder || "primary" };
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

        function requestConfirmation(message) {
          if (!message || !confirmationDialog || !confirmationAccept || !confirmationCancel) return Promise.resolve(true);
          confirmationMessage.textContent = message;
          return new Promise((resolve) => {
            let settled = false;
            const finish = (value) => {
              if (settled) return;
              settled = true;
              confirmationAccept.removeEventListener("click", accept);
              confirmationCancel.removeEventListener("click", cancel);
              confirmationDialog.removeEventListener("cancel", onCancel);
              if (confirmationDialog.open && typeof confirmationDialog.close === "function") confirmationDialog.close();
              resolve(value);
            };
            const accept = () => finish(true);
            const cancel = () => finish(false);
            const onCancel = (event) => { event.preventDefault(); finish(false); };
            confirmationAccept.addEventListener("click", accept);
            confirmationCancel.addEventListener("click", cancel);
            confirmationDialog.addEventListener("cancel", onCancel);
            if (typeof confirmationDialog.showModal === "function") confirmationDialog.showModal();
            else confirmationDialog.setAttribute("open", "");
            confirmationCancel.focus();
          });
        }

        document.querySelectorAll("[data-api-form]").forEach((form) => {
          const status = ensureStatus(form);
          form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!(await requestConfirmation(form.dataset.confirm || ""))) return;
            const submitButton = form.querySelector('button[type="submit"]');
            const method = form.dataset.apiMethod || "POST";
            const payload = buildPayload(form);
            if (submitButton) submitButton.disabled = true;
            if (loadingState) loadingState.hidden = false;
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
              window.setTimeout(() => window.location.reload(), 350);
              return;
            }
            if (loadingState) loadingState.hidden = true;
            if (submitButton) submitButton.disabled = false;
          });
        });
      })();
    </script>`;
}

export function renderAccountsCardsRuntimeScript(): string {
  return `
    <script>
      (() => {
        const searchInput = document.querySelector("[data-master-search]");
        const statusSelect = document.querySelector("[data-master-status]");
        const dialogTriggers = new WeakMap();

        function maskMoneyValue(raw) {
          const digits = String(raw || "").replace(/\\D/g, "").replace(/^0+(?=\\d)/, "");
          if (digits.length === 0) return "";
          const padded = digits.padStart(3, "0");
          const cents = padded.slice(-2);
          const intPart = padded.slice(0, -2).replace(/^0+(?=\\d)/, "") || "0";
          return intPart.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ".") + "," + cents;
        }

        document.querySelectorAll("[data-money]").forEach((input) => {
          if (input.value) input.value = maskMoneyValue(input.value);
          input.addEventListener("input", () => { input.value = maskMoneyValue(input.value); });
        });

        function applyFilters() {
          const term = String(searchInput && searchInput.value || "").trim().toLowerCase();
          const status = String(statusSelect && statusSelect.value || "all");
          let visibleItems = 0;
          const items = Array.from(document.querySelectorAll("[data-resource-master-item]"));
          items.forEach((item) => {
            const itemStatus = item.dataset.status;
            const matchesSearch = !term || String(item.dataset.search || "").includes(term);
            const matchesStatus = status === "all" || (status === "active" ? itemStatus === "active" : itemStatus !== "active");
            item.hidden = !(matchesSearch && matchesStatus);
            if (!item.hidden) visibleItems += 1;
          });
          const empty = document.querySelector("[data-filter-empty]");
          if (empty) empty.hidden = visibleItems > 0 || items.length === 0;
        }

        [searchInput, statusSelect].forEach((control) => control && control.addEventListener("input", applyFilters));
        statusSelect && statusSelect.addEventListener("change", applyFilters);

        document.querySelectorAll("[data-open-dialog]").forEach((button) => {
          button.addEventListener("click", () => {
            const dialog = document.getElementById(button.dataset.openDialog || "");
            if (!dialog) return;
            dialogTriggers.set(dialog, button);
            if (typeof dialog.showModal === "function") dialog.showModal();
            else dialog.setAttribute("open", "");
            const firstField = dialog.querySelector("input, select, textarea, button");
            firstField && firstField.focus();
          });
        });

        document.querySelectorAll(".dialog-close-form").forEach((form) => {
          form.addEventListener("submit", (event) => {
            event.preventDefault();
            const dialog = form.closest("dialog");
            if (!dialog) return;
            if (typeof dialog.close === "function") dialog.close();
            else dialog.removeAttribute("open");
          });
        });

        document.querySelectorAll("dialog.master-dialog").forEach((dialog) => {
          dialog.addEventListener("close", () => {
            const trigger = dialogTriggers.get(dialog);
            if (trigger && trigger.isConnected) window.setTimeout(() => trigger.focus(), 0);
          });
        });

        applyFilters();
      })();
    </script>`;
}
