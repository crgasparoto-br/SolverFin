import { popupActionIconsController } from "./popup-action-icons.js";
import { statementActionIconsController } from "./statement-action-icons.js";

const RECURRENCE_SCOPE_COMPACT_CSS = `
  [data-recurrence-scope-modal] .recurrence-scope-panel {
    box-sizing: border-box;
    gap: 14px;
    max-width: 460px;
    padding: 18px;
    width: min(460px, calc(100vw - 24px));
  }

  [data-recurrence-scope-modal] .recurrence-scope-panel > div:first-of-type {
    display: grid;
    gap: 4px;
    padding-right: 32px;
  }

  [data-recurrence-scope-modal] .recurrence-scope-panel > div:first-of-type .muted {
    font-size: 0.8125rem;
    line-height: 1.45;
  }

  [data-recurrence-scope-modal] .recurrence-scope-actions {
    display: grid;
    gap: 8px;
  }

  [data-recurrence-scope-modal] .recurrence-scope-choice {
    align-items: center;
    display: flex;
    font-size: 0.875rem;
    font-weight: 650;
    gap: 8px;
    justify-content: flex-start;
    line-height: 1.3;
    min-height: 44px !important;
    padding: 8px 12px !important;
    text-align: left !important;
    width: 100%;
  }

  [data-recurrence-scope-modal] .recurrence-scope-choice > svg {
    flex: 0 0 auto;
    height: 16px;
    margin: 0 !important;
    width: 16px;
  }

  [data-recurrence-scope-modal] .recurrence-scope-back {
    font-size: 0.8125rem;
    justify-self: end;
    margin-top: 2px;
    min-height: 32px !important;
    padding: 0 12px !important;
    text-align: center !important;
    width: auto !important;
  }

  [data-recurrence-scope-modal] [data-recurrence-scope-status]:empty {
    display: none;
  }

  [data-edit-account-field] {
    grid-column: auto;
  }

  @media (max-width: 480px) {
    [data-recurrence-scope-modal] .recurrence-scope-panel {
      padding: 16px;
      width: min(100%, calc(100vw - 16px));
    }

    [data-recurrence-scope-modal] .recurrence-scope-back {
      justify-self: stretch;
      width: 100% !important;
    }
  }
`;

export function recurringCardScopeControllerScript(): string {
  return `
    <script>
      ${popupActionIconsController()}
      ${statementActionIconsController()}
      (function () {
        const modal = document.querySelector("[data-recurrence-scope-modal]");
        if (!modal) return;

        const targetKind = modal.dataset.targetKind || "account";
        const isCard = targetKind === "card";
        const currentButton = modal.querySelector('[data-recurrence-scope="current"]');
        const futureButton = modal.querySelector('[data-recurrence-scope="current_and_future"]');
        const cancelButtons = Array.from(modal.querySelectorAll("[data-recurrence-scope-cancel]"));
        const backButton = modal.querySelector('.recurrence-scope-actions [data-recurrence-scope-cancel]');
        const status = modal.querySelector("[data-recurrence-scope-status]");
        let busy = false;

        const scopeLayoutCss = ${JSON.stringify(RECURRENCE_SCOPE_COMPACT_CSS)};
        const currentLabel = isCard ? "Somente esta compra" : "Somente este lançamento";
        const futureLabel = isCard ? "Esta compra e as próximas" : "Este lançamento e os próximos";
        const editOneIcon = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v4m0 4h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        const editAllIcon = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M17 3l4 4-4 4M3 12a9 9 0 0 1 9-9h9M7 21l-4-4 4-4M21 12a9 9 0 0 1-9 9H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

        function ensureScopeLayoutStyles() {
          if (!document.head || typeof document.createElement !== "function") return;
          if (document.querySelector("[data-recurrence-scope-layout-styles]")) return;
          const style = document.createElement("style");
          style.setAttribute("data-recurrence-scope-layout-styles", "");
          style.textContent = scopeLayoutCss;
          document.head.appendChild(style);
        }

        function prepareScopeButton(button, icon, label, scope) {
          if (!button) return;
          button.innerHTML = icon + '<span>' + label + '</span>';
          button.dataset.explicitEditScope = scope;
          button.classList?.add("recurrence-scope-choice");
          button.setAttribute?.("aria-label", label);
        }

        function setupAccountEditField() {
          if (isCard) return;
          const form = document.querySelector("[data-form]");
          if (!form || typeof form.querySelector !== "function") return;

          const accountInput = form.querySelector('input[name="accountId"]');
          const destinationSelect = form.querySelector('select[name="destinationAccountId"]');
          const firstField = form.querySelector("label");
          if (!accountInput || !destinationSelect || !firstField || form.querySelector("[data-edit-account-field]")) return;

          const accountField = document.createElement("label");
          accountField.hidden = true;
          accountField.setAttribute("data-edit-account-field", "");
          accountField.textContent = "Conta";

          const accountSelect = document.createElement("select");
          accountSelect.name = "accountId";
          accountSelect.required = true;
          accountSelect.disabled = true;
          accountSelect.setAttribute("data-edit-account-select", "");

          Array.from(destinationSelect.options || []).forEach((option) => {
            if (!option.value) return;
            const accountOption = document.createElement("option");
            accountOption.value = option.value;
            accountOption.textContent = option.textContent || option.value;
            accountSelect.appendChild(accountOption);
          });

          accountField.appendChild(accountSelect);
          form.insertBefore(accountField, firstField);

          const createAccountId = accountInput.value;
          const formDialog = typeof form.closest === "function" ? form.closest("dialog") : null;
          const guidance = formDialog && typeof formDialog.querySelector === "function"
            ? formDialog.querySelector(".modal-panel > div .muted")
            : null;

          function setAccountMode(transaction) {
            const editing = Boolean(transaction);
            accountField.hidden = !editing;
            accountSelect.disabled = !editing;
            accountInput.disabled = editing;

            if (editing) {
              accountSelect.value = transaction.accountId || createAccountId;
              if (guidance) guidance.textContent = "Revise a conta usada neste lançamento.";
              return;
            }

            accountInput.value = createAccountId;
            accountSelect.value = createAccountId;
            if (guidance) guidance.textContent = "A conta vem do filtro principal.";
          }

          document.querySelectorAll("[data-open-modal]").forEach((button) => {
            button.addEventListener("click", () => setAccountMode(null));
          });

          document.querySelectorAll("[data-transaction]").forEach((node) => {
            const transaction = JSON.parse(node.textContent || "{}");
            const editButton = document.querySelector('[data-edit="' + transaction.id + '"]');
            const cloneButton = document.querySelector('[data-clone="' + transaction.id + '"]');
            editButton?.addEventListener("click", () => setAccountMode(transaction));
            cloneButton?.addEventListener("click", () => setAccountMode(null));
          });

          setAccountMode(null);
        }

        ensureScopeLayoutStyles();
        prepareScopeButton(currentButton, editOneIcon, currentLabel, "current_only");
        prepareScopeButton(futureButton, editAllIcon, futureLabel, "current_and_future");
        backButton?.classList?.add("recurrence-scope-back");
        setupAccountEditField();

        function moneyToMinor(value) {
          const normalized = String(value).replace(/\\./g, "").replace(",", ".");
          return Math.round(parseFloat(normalized || "0") * 100);
        }

        function setBusy(nextBusy) {
          busy = nextBusy;
          [currentButton, futureButton, ...cancelButtons].forEach((button) => {
            if (button) button.disabled = nextBusy;
          });
        }

        function setStatus(message, className) {
          if (!status) return;
          status.textContent = message;
          status.className = className;
        }

        function cardPayload(data, scope) {
          const payload = {
            amountMinor: moneyToMinor(data.get("amountMinor")),
            occurredOn: String(data.get("occurredOn") || ""),
            description: String(data.get("description") || ""),
            categoryId: String(data.get("categoryId") || "") || null,
          };
          const cardInstrumentId = String(data.get("cardInstrumentId") || "");
          if (cardInstrumentId) payload.cardInstrumentId = cardInstrumentId;
          if (scope === "current_and_future") payload.editScope = "current_and_future";
          return payload;
        }

        function accountPayload(data, scope) {
          const plannedOn = String(data.get("plannedOn") || "");
          const effectiveOn = String(data.get("effectiveOn") || "");
          const payload = {
            kind: String(data.get("kind") || ""),
            status: String(data.get("status") || ""),
            amountMinor: moneyToMinor(data.get("amountMinor")),
            occurredOn: effectiveOn || plannedOn,
            plannedOn,
            effectiveOn: effectiveOn || null,
            accountId: String(data.get("accountId") || ""),
            description: String(data.get("description") || ""),
            note: String(data.get("note") || "") || null,
          };
          const destinationAccountId = String(data.get("destinationAccountId") || "");
          const categoryId = String(data.get("categoryId") || "");
          if (destinationAccountId) payload.destinationAccountId = destinationAccountId;
          if (categoryId) payload.categoryId = categoryId;
          if (scope === "current_and_future") payload.applyToFuturePlanned = true;
          return payload;
        }

        modal.addEventListener("cancel", (event) => {
          if (busy) event.preventDefault();
        }, true);

        document.addEventListener("click", async (event) => {
          const button = event.target && event.target.closest
            ? event.target.closest("[data-explicit-edit-scope]")
            : null;
          if (!button || !modal.contains(button)) return;

          const form = document.querySelector(targetKind === "card" ? "[data-purchase-form]" : "[data-form]");
          if (!form) return;

          const data = new FormData(form);
          const recurrenceId = form.dataset.recurrenceId || String(data.get("recurrenceId") || "");
          const path = form.dataset.path || form.getAttribute("data-path") || "";
          const method = form.dataset.method || "POST";
          if (method !== "PATCH" || !recurrenceId || !path) return;

          event.preventDefault();
          event.stopImmediatePropagation();
          if (busy) return;

          if (!form.checkValidity()) {
            form.reportValidity();
            return;
          }

          const scope = button.dataset.explicitEditScope;
          const requestPath = isCard && scope === "current_only" ? path + "/current-only" : path;
          const payload = targetKind === "card" ? cardPayload(data, scope) : accountPayload(data, scope);

          setBusy(true);
          setStatus("Salvando...", "muted");

          try {
            const response = await fetch(requestPath, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            });
            const body = await response.json().catch(() => ({}));

            if (!response.ok) {
              setStatus(
                (body.error && body.error.message) || "Não foi possível concluir a alteração.",
                "error",
              );
              setBusy(false);
              return;
            }

            const skippedCount = Number(body.skippedCount || 0);
            setStatus(
              skippedCount > 0
                ? "Alteração salva. Algumas ocorrências futuras não foram alteradas por estarem bloqueadas ou conciliadas."
                : "Ação concluída. Atualizando...",
              "success",
            );
            window.setTimeout(() => window.location.reload(), skippedCount > 0 ? 1200 : 450);
          } catch (_error) {
            setStatus("Não foi possível concluir a alteração. Tente novamente.", "error");
            setBusy(false);
          }
        }, true);
      })();
    </script>
  `;
}
