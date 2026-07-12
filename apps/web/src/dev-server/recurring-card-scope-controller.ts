import { popupActionIconsController } from "./popup-action-icons.js";
import { statementActionIconsController } from "./statement-action-icons.js";

const RECURRENCE_SCOPE_LAYOUT_CSS = `
  [data-recurrence-scope-modal] .recurrence-scope-panel {
    box-sizing: border-box;
    gap: 18px;
    max-width: 600px;
    width: min(600px, calc(100vw - 32px));
  }

  [data-recurrence-scope-modal] .recurrence-scope-panel > div:first-of-type {
    display: grid;
    gap: 5px;
    padding-right: 34px;
  }

  [data-recurrence-scope-modal] .recurrence-scope-panel > div:first-of-type .muted {
    line-height: 1.45;
    max-width: 48rem;
  }

  [data-recurrence-scope-modal] .recurrence-scope-actions {
    align-items: stretch;
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  [data-recurrence-scope-modal] .recurrence-scope-option {
    align-items: start;
    background: var(--surface, #fff) !important;
    border: 1px solid var(--line, #cbd5e1) !important;
    border-radius: var(--radius, 8px);
    color: var(--text, #0f172a) !important;
    display: grid;
    gap: 10px;
    grid-template-columns: auto minmax(0, 1fr);
    min-height: 104px !important;
    padding: 14px 16px !important;
    text-align: left !important;
    width: 100%;
  }

  [data-recurrence-scope-modal] .recurrence-scope-option:hover,
  [data-recurrence-scope-modal] .recurrence-scope-option:focus-visible {
    background: var(--primary-soft, #eff6ff) !important;
    border-color: #94a3b8 !important;
    box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.16);
  }

  [data-recurrence-scope-modal] .recurrence-scope-option > svg {
    color: var(--primary, #0369a1);
    height: 20px;
    margin: 2px 0 0 !important;
    width: 20px;
  }

  [data-recurrence-scope-modal] .recurrence-scope-option-copy {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  [data-recurrence-scope-modal] .recurrence-scope-option-title {
    font-size: 0.875rem;
    font-weight: 700;
    line-height: 1.3;
  }

  [data-recurrence-scope-modal] .recurrence-scope-option-description {
    color: var(--muted, #64748b);
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.45;
  }

  [data-recurrence-scope-modal] .recurrence-scope-back {
    grid-column: 1 / -1;
    justify-self: center;
    min-height: 34px !important;
    min-width: 180px;
    padding: 0 14px !important;
    text-align: center !important;
    width: auto !important;
  }

  [data-recurrence-scope-modal] [data-recurrence-scope-status] {
    min-height: 1.25rem;
  }

  @media (max-width: 640px) {
    [data-recurrence-scope-modal] .recurrence-scope-panel {
      gap: 14px;
      width: min(100%, calc(100vw - 20px));
    }

    [data-recurrence-scope-modal] .recurrence-scope-actions {
      grid-template-columns: 1fr;
    }

    [data-recurrence-scope-modal] .recurrence-scope-option {
      min-height: 88px !important;
      padding: 12px 14px !important;
    }

    [data-recurrence-scope-modal] .recurrence-scope-back {
      grid-column: 1;
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
        const actions = modal.querySelector(".recurrence-scope-actions");
        const backButton = actions && actions.querySelector
          ? actions.querySelector("[data-recurrence-scope-cancel]")
          : null;
        const status = modal.querySelector("[data-recurrence-scope-status]");
        let busy = false;

        const scopeLayoutCss = ${JSON.stringify(RECURRENCE_SCOPE_LAYOUT_CSS)};
        const currentLabel = isCard
          ? "Alterar somente esta compra"
          : "Alterar somente este lançamento";
        const futureLabel = isCard
          ? "Alterar esta compra e as próximas"
          : "Alterar este lançamento e os próximos";
        const currentDescription = isCard
          ? "Aplica a alteração apenas nesta compra e mantém as demais compras da recorrência como estão."
          : "Aplica a alteração apenas neste lançamento e mantém os demais lançamentos da recorrência como estão.";
        const futureDescription = isCard
          ? "Aplica a alteração nesta compra e também em todas as próximas compras ainda editáveis."
          : "Aplica a alteração neste lançamento e também em todos os próximos lançamentos ainda editáveis.";

        const editOneIcon = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v4m0 4h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        const editAllIcon = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M17 3l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 12a9 9 0 0 1 9-9h9M7 21l-4-4 4-4M21 12a9 9 0 0 1-9 9H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

        function ensureScopeLayoutStyles() {
          if (!document.head || typeof document.createElement !== "function") return;
          if (
            typeof document.querySelector === "function" &&
            document.querySelector("[data-recurrence-scope-layout-styles]")
          ) {
            return;
          }
          const style = document.createElement("style");
          style.setAttribute("data-recurrence-scope-layout-styles", "");
          style.textContent = scopeLayoutCss;
          document.head.appendChild(style);
        }

        function scopeChoiceMarkup(icon, label, description) {
          return icon +
            '<span class="recurrence-scope-option-copy">' +
              '<span class="recurrence-scope-option-title">' + label + '</span>' +
              '<span class="recurrence-scope-option-description">' + description + '</span>' +
            '</span>';
        }

        function decorateScopeButton(button, icon, label, description, scope) {
          if (!button) return;
          button.innerHTML = scopeChoiceMarkup(icon, label, description);
          button.dataset.explicitEditScope = scope;
          if (button.classList && typeof button.classList.add === "function") {
            button.classList.add("recurrence-scope-option");
          }
          if (typeof button.setAttribute === "function") {
            button.setAttribute("aria-label", label + ". " + description);
          }
        }

        ensureScopeLayoutStyles();
        if (actions && actions.classList && typeof actions.classList.add === "function") {
          actions.classList.add("recurrence-scope-actions-refactored");
        }
        if (backButton && backButton.classList && typeof backButton.classList.add === "function") {
          backButton.classList.add("recurrence-scope-back");
        }
        decorateScopeButton(
          currentButton,
          editOneIcon,
          currentLabel,
          currentDescription,
          "current_only",
        );
        decorateScopeButton(
          futureButton,
          editAllIcon,
          futureLabel,
          futureDescription,
          "current_and_future",
        );

        function moneyToMinor(value) {
          const normalized = String(value).replace(/\\./g, "").replace(",", ".");
          return Math.round(parseFloat(normalized || "0") * 100);
        }

        function setBusy(nextBusy) {
          busy = nextBusy;
          [currentButton, futureButton].forEach((button) => {
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
          const requestPath = scope === "current_only" ? path + "/current-only" : path;
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
