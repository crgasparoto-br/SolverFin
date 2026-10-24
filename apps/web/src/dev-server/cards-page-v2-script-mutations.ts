// Client-side fragments compose one script and share its lexical scope.
// Keep the content in a template literal so escapes match the rendered runtime.
export function cardsPageMutationScript(): string {
  return `      const request = (path, method, body) => fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseMessage = async (response) => {
        const body = await response.json().catch(() => ({}));
        return response.ok ? "Ação concluída. Atualizando..." : (body?.error?.message || "Não foi possível concluir a ação.");
      };

      installmentAmountForm?.querySelectorAll("[data-installment-scope]").forEach((button) => button.addEventListener("click", async () => {
        const valueField = installmentAmountForm.querySelector('[name="amountMinor"]');
        const status = installmentAmountForm.querySelector("[data-installment-amount-status]");
        const amountMinor = moneyToMinor(valueField.value);
        if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
          status.textContent = "Informe um valor positivo para a parcela.";
          status.className = "form-status error";
          valueField.focus();
          return;
        }
        const invoiceId = installmentAmountForm.dataset.invoiceId;
        const installmentId = installmentAmountForm.dataset.installmentId;
        if (!invoiceId || !installmentId) return;
        const buttons = installmentAmountForm.querySelectorAll("[data-installment-scope]");
        buttons.forEach((item) => { item.disabled = true; });
        status.textContent = "Atualizando valor...";
        status.className = "form-status";
        try {
          const response = await request(
            "/api/invoices/" + encodeURIComponent(invoiceId) + "/installments/" + encodeURIComponent(installmentId) + "/amount",
            "PATCH",
            { amountMinor, scope: button.dataset.installmentScope },
          );
          const result = await response.json().catch(() => ({}));
          status.textContent = response.ok
            ? "Valor atualizado. " + (result.updatedCount || 0) + " parcela(s) alterada(s)." +
              (result.skippedCount ? " " + result.skippedCount + " parcela(s) bloqueada(s) preservada(s)." : "")
            : (result.error?.message || "Não foi possível atualizar a parcela.");
          status.className = response.ok ? "form-status success" : "form-status error";
          if (response.ok && installmentAmountForm.dataset.pendingPurchasePayload) {
            const metadataResponse = await request(installmentAmountForm.dataset.pendingPurchasePath, "PATCH", JSON.parse(installmentAmountForm.dataset.pendingPurchasePayload));
            if (!metadataResponse.ok) {
              status.textContent = "Valor atualizado, mas outros dados não foram salvos: " + await responseMessage(metadataResponse);
              status.className = "form-status error";
              return;
            }
          }
          if (response.ok) window.setTimeout(() => window.location.reload(), 350);
          else buttons.forEach((item) => { item.disabled = false; });
        } catch {
          status.textContent = "Falha de conexão. Tente novamente.";
          status.className = "form-status error";
          buttons.forEach((item) => { item.disabled = false; });
        }
      }));

      document.querySelector("[data-reversal-edit-form]")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const status = form.querySelector("[data-reversal-edit-status]");
        status.textContent = "Salvando estorno...";
        try {
          const data = new FormData(form);
          const response = await fetch(form.dataset.path, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              description: String(data.get("description") || ""),
              amountMinor: moneyToMinor(data.get("amountMinor")),
              occurredOn: String(data.get("occurredOn") || ""),
              cardInstrumentId: String(data.get("cardInstrumentId") || ""),
            }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) {
            status.textContent = result?.error?.message || "Não foi possível salvar o estorno.";
            status.className = "form-status error";
            return;
          }
          window.location.reload();
        } catch {
          status.textContent = "Falha de conexão ao salvar o estorno.";
          status.className = "form-status error";
        }
      });

      purchaseForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!purchaseForm.checkValidity()) {
          purchaseForm.reportValidity();
          return;
        }
        if (purchaseForm.dataset.submitting === "true") return;
        const saveAndContinue = event.submitter?.hasAttribute("data-save-continue") === true;
        const data = new FormData(purchaseForm);
        const method = purchaseForm.dataset.method || "POST";
        const mode = method === "POST" ? String(data.get("repeatMode") || "single") : "single";
        const path = purchaseForm.dataset.path || "";
        const status = purchaseForm.querySelector("[data-form-status]");
        const currency = String(data.get("currency") || purchaseForm.querySelector('[name="currency"]')?.value || "").trim().toUpperCase();
        if (method === "POST" && !/^[A-Z]{3}$/.test(currency)) {
          status.textContent = "Defina a moeda padrão do cartão em Contas e Cartões antes de salvar a compra.";
          status.className = "form-status error full";
          return;
        }
        const editingInstallment = method === "PATCH" && purchaseForm.dataset.installmentPurchase === "true";
        const payload = { description: String(data.get("description") || "") };
        if (!editingInstallment) {
          payload.amountMinor = moneyToMinor(data.get("amountMinor"));
          payload.occurredOn = String(data.get("occurredOn") || "");
        }
        const categoryId = String(data.get("categoryId") || "");
        const cardInstrumentId = String(data.get("cardInstrumentId") || "");
        if (categoryId) payload.categoryId = categoryId;
        if (cardInstrumentId) payload.cardInstrumentId = cardInstrumentId;
        if (method === "POST") payload.currency = currency;
        if (editingInstallment) {
          const nextAmount = moneyToMinor(data.get("installmentAmountMinor"));
          if (!Number.isSafeInteger(nextAmount) || nextAmount <= 0) {
            status.textContent = "Informe um valor positivo para a parcela.";
            status.className = "form-status error full";
            return;
          }
          if (nextAmount !== Number(purchaseForm.dataset.originalInstallmentAmount)) {
            if (!installmentAmountForm || !installmentDialog || !purchaseForm.dataset.invoiceId || !purchaseForm.dataset.installmentId) {
              status.textContent = "Não foi possível identificar esta parcela.";
              status.className = "form-status error full";
              return;
            }
            installmentAmountForm.dataset.invoiceId = purchaseForm.dataset.invoiceId;
            installmentAmountForm.dataset.installmentId = purchaseForm.dataset.installmentId;
            installmentAmountForm.dataset.pendingPurchasePath = path;
            installmentAmountForm.dataset.pendingPurchasePayload = JSON.stringify(payload);
            installmentAmountForm.querySelector('[name="amountMinor"]').value = minorToMoney(nextAmount);
            installmentDialog.querySelector("[data-installment-purchase-name]").textContent = payload.description;
            installmentAmountForm.querySelector("[data-installment-scope-description]").textContent = "Aplicar o novo valor somente nesta parcela ou também nas próximas elegíveis?";
            installmentAmountForm.querySelector("[data-installment-amount-status]").textContent = "";
            purchaseForm.closest("dialog")?.close();
            installmentDialog.showModal();
            return;
          }
        }
        // One save operation at a time. A second click before the first response
        // must not create an additional financial transaction.
        const submitButtons = Array.from(purchaseForm.querySelectorAll('button[type="submit"]'));
        const previouslyDisabled = submitButtons.map((button) => button.disabled);
        purchaseForm.dataset.submitting = "true";
        submitButtons.forEach((button) => { button.disabled = true; });
        status.textContent = "Salvando...";
        let keepPendingUntilReload = false;
        try {
          let response;
          if (mode === "fixed") {
            const cardId = /credit-card-accounts\\/([^/]+)/.exec(path)?.[1] || "";
            const endOn = String(data.get("endOn") || "");
            response = await request("/api/recurrences", "POST", {
              frequency: String(data.get("frequency") || "monthly"),
              interval: Math.max(1, Number(data.get("interval") || 1)),
              startOn: payload.occurredOn,
              ...(endOn ? { endOn } : {}),
              amountMinor: payload.amountMinor,
              currency,
              description: payload.description,
              cardId,
              ...(cardInstrumentId ? { cardInstrumentId } : {}),
              ...(categoryId ? { categoryId } : {}),
            });
          } else if (mode === "installment") {
            const totalInstallments = Math.max(2, Number(data.get("totalInstallments") || 2));
            const installmentStart = Math.min(
              Math.max(1, Number(data.get("installmentStart") || 1)),
              totalInstallments,
            );
            const amountMinor =
              String(data.get("installmentValueMode")) === "per_installment"
                ? payload.amountMinor * totalInstallments
                : payload.amountMinor;
            response = await request(path, "POST", {
              ...payload,
              amountMinor,
              currency,
              totalInstallments,
              installmentStart,
            });
          } else {
            response = await request(path, method, payload);
          }
          const savedResponse = await response.json().catch(() => ({}));
          if (!response.ok) {
            status.textContent = savedResponse?.error?.message || "Não foi possível gravar a compra.";
            status.className = "form-status error full";
            return;
          }
          status.textContent = "Compra registrada com sucesso.";
          status.className = "form-status success full";
          if (saveAndContinue && method === "POST") {
            purchaseForm.dataset.savedDuringSession = "true";
            purchaseForm.dataset.savedCount = String(Number(purchaseForm.dataset.savedCount || 0) + 1);
            const retainedInstrument = String(data.get("cardInstrumentId") || "");
            const retainedCurrency = currency;
            const retainedDate = String(data.get("occurredOn") || "");
            purchaseForm.reset();
            purchaseForm.querySelector('[name="currency"]').value = retainedCurrency;
            purchaseForm.querySelector('[name="occurredOn"]').value = retainedDate;
            if (retainedInstrument) purchaseForm.querySelector('[name="cardInstrumentId"]').value = retainedInstrument;
            if (repeatMode) repeatMode.value = "single";
            syncRepeatFields();
            purchaseForm.querySelector('[name="description"]')?.focus();
            status.textContent = purchaseForm.dataset.savedCount + " compra(s) registrada(s). Informe a próxima compra. A lista será atualizada ao fechar.";
            status.className = "form-status success full";
          } else if (response.ok) {
            keepPendingUntilReload = true;
            window.setTimeout(() => window.location.reload(), 350);
          }
        } catch {
          status.textContent = "Falha de conexão ao salvar a compra. Tente novamente.";
          status.className = "form-status error full";
        } finally {
          if (!keepPendingUntilReload) {
            purchaseForm.dataset.submitting = "false";
            submitButtons.forEach((button, index) => {
              button.disabled = previouslyDisabled[index];
            });
          }
        }
      });

`;
}
