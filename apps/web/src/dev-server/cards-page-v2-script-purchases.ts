// Client-side fragments compose one script and share its lexical scope.
// Keep the content in a template literal so escapes match the rendered runtime.
export function cardsPagePurchaseActionsScript(): string {
  return `      document.querySelectorAll("[data-purchase]").forEach((node) => {
        const purchase = JSON.parse(node.textContent || "{}");
        const cloneButton = document.querySelector('[data-clone-purchase="' + purchase.id + '"]');
        cloneButton?.addEventListener("click", () => {
          if (cloneButton.disabled || !purchaseForm) return;
          resetPurchaseForm();
          purchaseForm.querySelector('[name="amountMinor"]').value = minorToMoney(purchase.amountMinor);
          // Locked historical invoices must remain immutable, but cloning creates a new
          // purchase. Suggest today's editable date instead of the closed period.
          purchaseForm.querySelector('[name="occurredOn"]').value =
            cloneButton.dataset.cloneSourceLocked === "true" ? localToday() : purchase.occurredOn;
          purchaseForm.querySelector('[name="description"]').value = purchase.description || "";
          purchaseForm.querySelector('[name="categoryId"]').value = purchase.categoryId || "";
          if (purchase.cardInstrumentId) purchaseForm.querySelector('[name="cardInstrumentId"]').value = purchase.cardInstrumentId;
          document.querySelector("[data-purchase-modal-title]").textContent = "Clonar compra";
          const description = document.querySelector("[data-purchase-modal-description]");
          if (description) description.textContent = "Confira os dados e registre uma nova compra única. Parcelas e recorrências não serão copiadas.";
          lastDialogTrigger = cloneButton;
          document.querySelector('dialog[data-modal="purchase"]')?.showModal();
        });

        const installmentEditButton = document.querySelector('[data-edit-installment-amount="' + purchase.id + '"]');
        installmentEditButton?.addEventListener("click", () => {
          if (installmentEditButton.disabled || !installmentDialog || !installmentAmountForm ||
              !purchase.installmentId || !purchase.invoiceId) return;
          installmentAmountForm.dataset.invoiceId = purchase.invoiceId;
          installmentAmountForm.dataset.installmentId = purchase.installmentId;
          installmentAmountForm.dataset.pendingPurchasePayload = "";
          installmentAmountForm.dataset.pendingPurchasePath = "";
          installmentAmountForm.querySelector('[name="amountMinor"]').value = minorToMoney(purchase.amountMinor);
          installmentDialog.querySelector("[data-installment-purchase-name]").textContent = purchase.description;
          installmentAmountForm.querySelector("[data-installment-scope-description]").textContent =
            "Aplicar o novo valor somente nesta parcela ou também nas próximas elegíveis?";
          installmentAmountForm.querySelector("[data-installment-amount-status]").textContent = "";
          lastDialogTrigger = installmentEditButton;
          installmentDialog.showModal();
        });
        const deleteButton = document.querySelector('[data-delete-purchase="' + purchase.id + '"]');
        deleteButton?.addEventListener("click", async () => {
          if (deleteButton.disabled) return;
          if (!window.confirm("Excluir permanentemente o lançamento " + purchase.description + "? O total da fatura será recalculado. Esta ação não pode ser desfeita.")) return;
          deleteButton.disabled = true;
          try {
            const response = await fetch("/api/credit-card-accounts/" + encodeURIComponent(purchase.cardId) + "/purchases/" + encodeURIComponent(purchase.id), { method: "DELETE" });
            if (!response.ok) {
              const body = await response.json().catch(() => ({}));
              window.alert(body?.error?.message || "Não foi possível excluir este lançamento.");
              deleteButton.disabled = false;
              return;
            }
            window.location.reload();
          } catch {
            window.alert("Falha de conexão ao excluir lançamento.");
            deleteButton.disabled = false;
          }
        });
        const reverseButton = document.querySelector('[data-reverse-purchase="' + purchase.id + '"]');
        reverseButton?.addEventListener("click", async () => {
          if (reverseButton.disabled || !purchase.invoiceId || purchase.amountMinor <= 0) return;
          reverseButton.disabled = true;
          try {
            const response = await fetch("/api/credit-card-accounts/" + encodeURIComponent(purchase.cardId) + "/purchases/" + encodeURIComponent(purchase.id) + "/reverse", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ invoiceId: purchase.invoiceId, ...(purchase.installmentId ? { installmentId: purchase.installmentId } : {}) }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
              window.alert(result?.error?.message || "Não foi possível estornar o lançamento.");
              reverseButton.disabled = false;
              return;
            }
            const reversal = result.reversal;
            const editor = document.querySelector("[data-reversal-edit-form]");
            if (!reversal?.transactionId || !editor) {
              window.location.reload();
              return;
            }
            editor.dataset.path = "/api/credit-card-accounts/" + encodeURIComponent(purchase.cardId) + "/reversals/" + encodeURIComponent(reversal.transactionId);
            editor.querySelector('[name="description"]').value = "Estorno: " + purchase.description;
            editor.querySelector('[name="amountMinor"]').value = minorToMoney(Math.abs(reversal.amountMinor));
            editor.querySelector('[name="occurredOn"]').value = purchase.occurredOn;
            if (purchase.cardInstrumentId) editor.querySelector('[name="cardInstrumentId"]').value = purchase.cardInstrumentId;
            editor.querySelector("[data-reversal-edit-status]").textContent = "";
            document.querySelector('dialog[data-modal="reversal-edit"]')?.showModal();
          } catch {
            window.alert("Falha de conexão ao registrar o estorno.");
            reverseButton.disabled = false;
          }
        });
        const button = document.querySelector('[data-edit-purchase="' + purchase.id + '"]');
        if (!button || button.disabled || !purchaseForm) return;
        button.addEventListener("click", () => {
          purchaseForm.reset();
          purchaseForm.dataset.path = "/api/credit-card-accounts/" + purchase.cardId + "/purchases/" + purchase.id;
          purchaseForm.dataset.method = "PATCH";
          document.querySelector('dialog[data-modal="purchase"]')?.setAttribute("data-editing", "true");
          purchaseForm.dataset.currentPurchaseId = purchase.id;
          purchaseForm.dataset.recurrenceId = purchase.recurrenceId || "";
          const isInstallmentPurchase = !purchase.recurrenceId && Number.isInteger(purchase.installmentSequenceNumber) && Number.isInteger(purchase.totalInstallments) && purchase.totalInstallments > 1;
          purchaseForm.dataset.installmentPurchase = isInstallmentPurchase ? "true" : "false";
          purchaseForm.dataset.installmentId = isInstallmentPurchase ? (purchase.installmentId || "") : "";
          purchaseForm.dataset.invoiceId = isInstallmentPurchase ? (purchase.invoiceId || "") : "";
          purchaseForm.dataset.originalInstallmentAmount = isInstallmentPurchase ? String(purchase.amountMinor) : "";
          purchaseForm.querySelector('[name="currentPurchaseId"]').value = purchase.id;
          purchaseForm.querySelector('[name="recurrenceId"]').value = purchase.recurrenceId || "";
          purchaseForm.querySelector('[name="amountMinor"]').value = minorToMoney(isInstallmentPurchase ? (purchase.purchaseTotalAmountMinor ?? purchase.amountMinor) : purchase.amountMinor);
          purchaseForm.querySelector('[name="amountMinor"]').readOnly = isInstallmentPurchase;
          purchaseForm.querySelector('[name="occurredOn"]').readOnly = isInstallmentPurchase;
          purchaseForm.querySelector('[name="occurredOn"]').value = purchase.occurredOn;
          purchaseForm.querySelector('[name="description"]').value = purchase.description || "";
          purchaseForm.querySelector('[name="categoryId"]').value = purchase.categoryId || "";
          if (purchase.cardInstrumentId) purchaseForm.querySelector('[name="cardInstrumentId"]').value = purchase.cardInstrumentId;
          const currencyField = purchaseForm.querySelector('[name="currency"]');
          if (currencyField) {
            currencyField.value = purchase.currency || currencyField.value;
            currencyField.disabled = true;
          }
          if (repeatMode?.closest("label")) repeatMode.closest("label").hidden = !isInstallmentPurchase;
          const scheduleSection = purchaseForm.querySelector('[data-purchase-section="schedule"]');
          if (scheduleSection) scheduleSection.hidden = true;
          setField("recurrenceDateHint", Boolean(purchase.recurrenceId));
          if (isInstallmentPurchase) {
            repeatMode.value = "installment";
            repeatMode.disabled = true;
            purchaseForm.querySelector('[name="amountMinor"]').readOnly = true;
            purchaseForm.querySelector('[name="occurredOn"]').readOnly = true;
            purchaseForm.querySelector('[name="totalInstallments"]').value = purchase.totalInstallments;
            purchaseForm.querySelector('[name="totalInstallments"]').readOnly = true;
            purchaseForm.querySelector('[name="installmentStart"]').value = purchase.installmentStart || 1;
            purchaseForm.querySelector('[name="installmentStart"]').readOnly = true;
            purchaseForm.querySelector('[name="installmentAmountMinor"]').value = minorToMoney(purchase.amountMinor);
          }
          syncRepeatFields();
          if (isInstallmentPurchase) {
            setField("installmentValueMode", false);
            // Keep the occurrence amount editable in the purchase form.
            setField("installmentAmountMinor", true);
            setField("installmentContext", true);
            const context = purchaseForm.querySelector('[data-purchase-field="installmentContext"]');
            if (context) context.textContent = "Parcela " + purchase.installmentSequenceNumber + " de " + purchase.totalInstallments + ". Ao salvar o valor, escolha quais parcelas serão alteradas.";
            const amountLabel = purchaseForm.querySelector("[data-purchase-amount-label]");
            const amountCurrency = purchaseForm.querySelector('[name="currency"]')?.value || "";
            if (amountLabel) amountLabel.textContent = "Valor total da compra" + (amountCurrency ? " (" + amountCurrency + ")" : "");
          } else {
            setField("installmentAmountMinor", false);
            setField("installmentContext", false);
          }
          document.querySelector("[data-purchase-modal-title]").textContent = "Editar compra";
          const purchaseDescription = document.querySelector("[data-purchase-modal-description]");
          if (purchaseDescription) purchaseDescription.textContent = isInstallmentPurchase
            ? "Atualize os dados e o valor da parcela. Ao salvar, escolha o alcance da alteração."
            : "Atualize os dados da compra e salve as alterações.";
          lastDialogTrigger = button;
          document.querySelector('dialog[data-modal="purchase"]')?.showModal();
        });
      });

`;
}
