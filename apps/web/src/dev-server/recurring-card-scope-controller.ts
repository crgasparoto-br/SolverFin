export function recurringCardScopeControllerScript(): string {
  return `
    <script>
      (function () {
        const modal = document.querySelector("[data-recurrence-scope-modal]");
        if (!modal) return;

        const targetKind = modal.dataset.targetKind || "account";
        const currentButton = modal.querySelector('[data-recurrence-scope="current"]');
        const futureButton = modal.querySelector('[data-recurrence-scope="current_and_future"]');
        const status = modal.querySelector("[data-recurrence-scope-status]");
        let busy = false;

        if (currentButton) {
          currentButton.textContent = "Alterar somente este lançamento";
          currentButton.dataset.explicitEditScope = "current_only";
        }
        if (futureButton) {
          futureButton.textContent = "Alterar este lançamento e os próximos";
          futureButton.dataset.explicitEditScope = "current_and_future";
        }

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
