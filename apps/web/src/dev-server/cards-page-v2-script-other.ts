// Client-side fragments compose one script and share its lexical scope.
// Keep the content in a template literal so escapes match the rendered runtime.
export function cardsPageRemainingActionsScript(): string {
  return `      document.querySelector("[data-payment-form]")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }
        const data = new FormData(form);
        const status = form.querySelector("[data-form-status]");
        status.textContent = "Liquidando...";
        const response = await request(form.dataset.path, "POST", {
          paymentAccountId: String(data.get("paymentAccountId") || ""),
          paidOn: String(data.get("paidOn") || ""),
          amountMinor: moneyToMinor(data.get("amountMinor")),
          description: String(data.get("description") || ""),
        });
        status.textContent = await responseMessage(response);
        status.className = response.ok ? "form-status success full" : "form-status error full";
        if (response.ok) window.setTimeout(() => window.location.reload(), 350);
      });

      // Status-only reconciliation follows the Golden Screen. For finite installments,
      // use the occurrence-specific route so sibling invoices are unaffected.
      document.querySelectorAll("[data-set-purchase-status]").forEach((button) => {
        button.addEventListener("click", async () => {
          const control = button.closest("[data-purchase-status-control]");
          const feedback = control?.querySelector(".cards-purchase-status-feedback");
          const message = feedback?.querySelector("[data-cards-status-feedback-message]");
          const targetStatus = button.dataset.setPurchaseStatus;
          const purchaseId = button.dataset.statusPurchaseId;
          const cardId = button.dataset.statusCardId;
          if (!control || !feedback || !message || !purchaseId || !cardId ||
              !["posted", "reconciled"].includes(targetStatus)) return;
          const showFeedback = (text, tone) => {
            feedback.hidden = false;
            feedback.className = "cards-purchase-status-feedback" + (tone ? " " + tone : "");
            message.textContent = text;
            feedback.title = text;
            feedback.dataset.tooltip = text;
          };
          const buttons = Array.from(control.querySelectorAll("[data-set-purchase-status]"));
          buttons.forEach((item) => { item.disabled = true; });
          showFeedback("Atualizando situação...", "");
          try {
            const installmentId = button.dataset.statusInstallmentId;
            const invoiceId = button.dataset.statusInvoiceId;
            const path = installmentId && invoiceId
              ? "/api/invoices/" + encodeURIComponent(invoiceId) +
                "/installments/" + encodeURIComponent(installmentId) + "/reconciliation"
              : "/api/credit-card-accounts/" + encodeURIComponent(cardId) +
                "/purchases/" + encodeURIComponent(purchaseId);
            const response = await request(path, "PATCH", { status: targetStatus });
            if (!response.ok) {
              showFeedback(await responseMessage(response), "error");
              buttons.forEach((item) => { item.disabled = false; });
              return;
            }
            showFeedback("Situação atualizada. Atualizando fatura...", "success");
            window.setTimeout(() => window.location.reload(), 350);
          } catch {
            showFeedback("Falha de conexão. Tente novamente.", "error");
            buttons.forEach((item) => { item.disabled = false; });
          }
        });
      });
      document.querySelectorAll("[data-purchase-status-control]").forEach((control) => {
        control.addEventListener("toggle", () => {
          if (!control.open) return;
          document.querySelectorAll("[data-purchase-status-control]").forEach((other) => {
            if (other !== control) other.open = false;
          });
        });
      });

      document.querySelectorAll("[data-api-path]").forEach((button) => button.addEventListener("click", async () => {
        if (button.dataset.confirm && !window.confirm(button.dataset.confirm)) return;
        button.disabled = true;
        const response = await request(button.dataset.apiPath, button.dataset.apiMethod || "POST", {});
        if (!response.ok) {
          window.alert(await responseMessage(response));
          button.disabled = false;
          return;
        }
        window.setTimeout(() => window.location.reload(), 350);
      }));
      document.addEventListener("click", (event) => {
        document.querySelectorAll(".cards-purchase-actions[open],.cards-purchase-status-control[open]").forEach((details) => {
          if (!details.contains(event.target)) details.removeAttribute("open");
        });
      });
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        document.querySelectorAll(".cards-purchase-actions[open],.cards-purchase-status-control[open]").forEach((details) => {
          const summary = details.querySelector("summary");
          details.removeAttribute("open");
          summary?.focus();
        });
      });
      syncRepeatFields();
    })();
  </script>`;
}
