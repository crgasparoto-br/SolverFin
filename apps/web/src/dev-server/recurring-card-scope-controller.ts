export function recurringCardScopeControllerScript(): string {
  return `
    <script>
      (function () {
        const modal = document.querySelector('[data-recurrence-scope-modal][data-target-kind="card"]');
        if (!modal) return;

        const currentButton = modal.querySelector('[data-recurrence-scope="current"]');
        const futureButton = modal.querySelector('[data-recurrence-scope="current_and_future"]');
        const status = modal.querySelector('[data-recurrence-scope-status]');
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

        document.addEventListener("click", async (event) => {
          const button = event.target && event.target.closest
            ? event.target.closest("[data-explicit-edit-scope]")
            : null;
          if (!button || !modal.contains(button)) return;

          const form = document.querySelector("[data-purchase-form]");
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

          setBusy(true);
          setStatus("Salvando...", "muted");

          const payload = {
            amountMinor: moneyToMinor(data.get("amountMinor")),
            occurredOn: String(data.get("occurredOn") || ""),
            description: String(data.get("description") || ""),
            categoryId: String(data.get("categoryId") || "") || null,
            editScope: button.dataset.explicitEditScope,
          };
          const cardInstrumentId = String(data.get("cardInstrumentId") || "");
          if (cardInstrumentId) payload.cardInstrumentId = cardInstrumentId;

          try {
            const response = await fetch(path, {
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
