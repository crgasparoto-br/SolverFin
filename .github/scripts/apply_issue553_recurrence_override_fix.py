from pathlib import Path

path = Path("apps/web/src/dev-server/recurrences-section.ts")
source = path.read_text()
start = source.index("        function setupTransactionFormOverride() {")
end = source.index("        function setupCardPurchaseFormOverride() {", start)
replacement = '''        function setupTransactionFormOverride() {
          const form = document.querySelector("[data-form]");
          if (!form || !form.repeatMode || !form.plannedOn || !form.amountMinor) return;
          const editScope = form.querySelector('[name="editScope"]');
          if (editScope && editScope.closest("label")) editScope.closest("label").hidden = true;
          const statusNode = form.querySelector('[aria-live="polite"]');
          function basePayload(plannedOn, effectiveOn, amountMinor, description, applyToFuturePlanned) {
            const data = new FormData(form);
            const note = String(data.get("note") || "");
            const result = { kind: String(data.get("kind")), amountMinor, occurredOn: effectiveOn || plannedOn, plannedOn, effectiveOn: effectiveOn || null, accountId: String(data.get("accountId")), description, status: String(data.get("status")) };
            if (note.trim() || form.dataset.currentTransactionId) result.note = note;
            if (applyToFuturePlanned) result.applyToFuturePlanned = true;
            const destinationAccountId = String(data.get("destinationAccountId") || "");
            const categoryId = String(data.get("categoryId") || "");
            if (destinationAccountId) result.destinationAccountId = destinationAccountId;
            if (categoryId) result.categoryId = categoryId;
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
          function payload(applyToFuturePlanned) {
            const data = new FormData(form);
            const dates = plannedAndEffectiveOn(0);
            return basePayload(
              dates.plannedOn,
              dates.effectiveOn,
              moneyToMinor(data.get("amountMinor")),
              String(data.get("description") || ""),
              applyToFuturePlanned,
            );
          }
          function clearCurrentTransaction() {
            delete form.dataset.currentTransactionId;
            delete form.dataset.recurrenceId;
          }
          document.querySelectorAll("[data-open-modal]").forEach((button) => button.addEventListener("click", clearCurrentTransaction));
          document.querySelectorAll("[data-transaction]").forEach((node) => {
            const transaction = JSON.parse(node.textContent);
            const editButton = document.querySelector('[data-edit="' + transaction.id + '"]');
            const cloneButton = document.querySelector('[data-clone="' + transaction.id + '"]');
            if (editButton) editButton.addEventListener("click", () => { form.dataset.currentTransactionId = transaction.id; if (transaction.recurrenceId) form.dataset.recurrenceId = transaction.recurrenceId; else delete form.dataset.recurrenceId; if (form.note) form.note.value = transaction.note || ""; });
            if (cloneButton) cloneButton.addEventListener("click", () => { clearCurrentTransaction(); if (form.note) form.note.value = ""; });
          });
          form.addEventListener("submit", async (event) => {
            const method = form.dataset.method || "POST";
            if (method !== "PATCH") return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (!form.checkValidity()) {
              form.reportValidity();
              return;
            }
            const path = form.dataset.path || "/api/transactions";
            const execute = async (scope) => {
              const response = await send(
                path,
                "PATCH",
                payload(scope === "current_and_future"),
              );
              const result = await readResponse(response);
              return {
                ok: response.ok,
                message: result.message,
                skippedCount: Number(result.body.skippedCount || 0),
              };
            };

            if (form.dataset.recurrenceId) {
              openScopeModal(form.querySelector('button[type="submit"]'), execute);
              return;
            }

            if (statusNode) statusNode.textContent = "Salvando...";
            const result = await execute("current");
            if (statusNode) statusNode.textContent = result.message;
            if (result.ok) window.setTimeout(() => window.location.reload(), 450);
          }, true);
        }

'''
source = source[:start] + replacement + source[end:]
path.write_text(source)
