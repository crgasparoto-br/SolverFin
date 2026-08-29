export function renderAccountsCardsApiFormScript(): string {
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

export function renderAccountsCardsRuntimeScript(): string {
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
