/** Preserves the ordered raw client-side installment controller fragment. */
export function operationalControllerScriptPart1(
  BLOCK_REASON_LABELS: unknown,
  OPERATIONAL_INSTALLMENTS_CSS: string,
): string {
  return `
    (function () {
      const pathname = window.location.pathname;
      if (pathname !== "/lancamentos" && pathname !== "/cartoes") return;

      const blockReasonLabels = ${JSON.stringify(BLOCK_REASON_LABELS)};
      const css = ${JSON.stringify(OPERATIONAL_INSTALLMENTS_CSS)};
      const urlParams = new URLSearchParams(window.location.search);
      const profileId = urlParams.get("profileId") || "";
      const installmentsById = new Map();

      function ensureStyles() {
        if (document.querySelector("[data-operational-installments-styles]")) return;
        const style = document.createElement("style");
        style.setAttribute("data-operational-installments-styles", "");
        style.textContent = css;
        document.head.appendChild(style);
      }

      function apiPath(path) {
        if (!profileId) return path;
        const separator = path.includes("?") ? "&" : "?";
        return path + separator + "profileId=" + encodeURIComponent(profileId);
      }

      function readJsonNode(node) {
        try { return JSON.parse(node.textContent || "{}"); } catch (_error) { return undefined; }
      }

      function formatDate(value) {
        if (!value) return "-";
        return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value + "T00:00:00Z"));
      }

      function formatMoney(minor, currency) {
        return (Number(minor || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: currency || "BRL" });
      }

      function statusLabel(status) {
        return ({ planned: "Planejada", posted: "Efetivada", reconciled: "Conciliada", cancelled: "Cancelada" })[status] || status || "-";
      }

      function blockReason(reason) {
        return reason ? (blockReasonLabels[reason] || "Esta parcela não pode ser alterada.") : "";
      }

      function installmentLabel(installment) {
        const total = Number(installment.totalInstallments) > 0 ? installment.totalInstallments : "?";
        return "Parcela " + installment.sequenceNumber + " de " + total;
      }

      function addBadge(row, installment) {
        const description = row && row.querySelector(".description strong");
        if (!description || description.querySelector('[data-installment-badge="' + installment.id + '"]')) return;
        const label = installmentLabel(installment);
        const reasonText = installment.amountEditable ? "Valor da parcela editável. Outros dados podem estar protegidos." : blockReason(installment.editBlockedReason);
        const existingBadge = row.querySelector(".cards-purchase-description .cards-installment-label");
        const badge = existingBadge || document.createElement("span");
        badge.classList.add("installment-badge");
        badge.dataset.installmentBadge = installment.id;
        badge.textContent = label;
        badge.setAttribute("aria-label", label);
        badge.title = reasonText || label;
        if (reasonText) {
          const reasonId = "installment-block-reason-" + String(installment.id).replace(/[^a-zA-Z0-9_-]/g, "");
          const reason = document.createElement("span");
          reason.className = "installment-assistive-text";
          reason.id = reasonId;
          reason.textContent = reasonText;
          badge.tabIndex = 0;
          badge.dataset.installmentBlockReason = reasonText;
          badge.setAttribute("aria-describedby", reasonId);
          description.appendChild(reason);
        }
        if (!existingBadge) description.appendChild(badge);
      }

      async function fetchInstallments(path) {
        try {
          const response = await fetch(apiPath(path), { headers: { accept: "application/json" } });
          if (!response.ok) return undefined;
          const body = await response.json();
          return Array.isArray(body.installments) ? body.installments : [];
        } catch (_error) {
          return undefined;
        }
      }

      function setAccountEditLookupState(state) {
        document.querySelectorAll("[data-edit]").forEach((button) => {
          const label = button.querySelector("span");
          if (!("installmentOriginalDisabled" in button.dataset)) {
            button.dataset.installmentOriginalDisabled = String(Boolean(button.disabled));
            button.dataset.installmentOriginalTitle = button.title || "";
            if (label) button.dataset.installmentOriginalLabel = label.textContent || "Editar";
          }

          if (state === "loading") {
            button.disabled = true;
            button.title = "Verificando se o lançamento pertence a uma parcela";
            if (label) label.textContent = "Verificando parcela";
            return;
          }

          if (state === "unavailable") {
            button.disabled = true;
            button.title = "Edição temporariamente indisponível. Recarregue a página para tentar novamente.";
            if (label) label.textContent = "Edição indisponível";
            return;
          }

          button.disabled = button.dataset.installmentOriginalDisabled === "true";
          button.title = button.dataset.installmentOriginalTitle || "";
          if (label) label.textContent = button.dataset.installmentOriginalLabel || "Editar";
          delete button.dataset.installmentOriginalDisabled;
          delete button.dataset.installmentOriginalTitle;
          delete button.dataset.installmentOriginalLabel;
        });
      }

      function findNodeByData(selector, value) {
        return Array.from(document.querySelectorAll(selector)).find((node) => node.dataset && Object.values(node.dataset).includes(value));
      }

      function accountQueryPath() {
        const accountId = document.querySelector("[data-account-input]")?.value || urlParams.get("accountId") || "";
        const month = document.querySelector("#filter-month")?.value || urlParams.get("month") || "";
        if (!accountId || !/^\\d{4}-\\d{2}$/.test(month)) return "";
        const day = urlParams.get("day") || "";
        const selectedDay = /^\\d{4}-\\d{2}-\\d{2}$/.test(day) && day.startsWith(month + "-") ? day : "";
        const parts = month.split("-").map(Number);
        const lastDay = new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate();
        const operationalFrom = selectedDay || month + "-01";
        const operationalTo = selectedDay || month + "-" + String(lastDay).padStart(2, "0");
        return "/api/installments?" + (accountId === "all" ? "" : "accountId=" + encodeURIComponent(accountId) + "&")
          + "operationalFrom=" + operationalFrom + "&operationalTo=" + operationalTo
          + "&status=all";
      }

      async function decorateAccountInstallments() {
        const path = accountQueryPath();
        if (!path) return;
        setAccountEditLookupState("loading");
        const installments = await fetchInstallments(path);
        if (!installments) {
          setAccountEditLookupState("unavailable");
          return;
        }
        setAccountEditLookupState("ready");
        installments.forEach((installment) => {
          const transactionId = installment.transaction && installment.transaction.id;
          if (!transactionId) return;
          installmentsById.set(installment.id, installment);
          const node = findNodeByData("script[data-transaction]", transactionId);
          const row = node && node.closest("article");
          if (!row) return;
          // Recurrences use their own icon; show a parcel badge only for finite account plans.
          if (!installment.recurrenceId && Number(installment.totalInstallments) > 0) {
            addBadge(row, installment);
          }
          const editButton = row.querySelector('[data-edit="' + transactionId + '"]');
          if (!editButton) return;
          // Eligible planned and posted bank recurrences use the full
          // transaction scope modal; reconciled/card/manual installments
          // retain their restricted editor.
          const recurringAccountOccurrence = Boolean(
            installment.recurrenceId &&
            installment.transaction?.recurrenceId === installment.recurrenceId &&
            ["planned", "posted"].includes(installment.transaction?.status) &&
            ["planned", "posted"].includes(installment.status) &&
            installment.recurrence &&
            installment.recurrence.status !== "cancelled" &&
            !installment.invoice &&
            !installment.card &&
            !installment.cardInstrument &&
            !installment.transaction.cardId &&
            !installment.transaction.invoiceId
          );
          if (recurringAccountOccurrence) {
            editButton.title = "Editar lançamento recorrente";
            return;
          }
          editButton.dataset.installmentEdit = installment.id;
          editButton.dataset.installmentEditable = String(installment.editable === true || installment.amountEditable === true);
          const label = editButton.querySelector("span");
          if (label) label.textContent = installment.editable || installment.amountEditable ? "Editar" : "Ver detalhes";
          editButton.title = installment.editable || installment.amountEditable ? "Editar parcela" : "Ver detalhes da parcela";
        });
      }

      async function decorateCardInstallments() {
        const invoiceId = document.querySelector("[data-invoice-input]")?.value || urlParams.get("invoiceId") || "";
        if (!invoiceId) return;
        const installments = await fetchInstallments("/api/installments?invoiceId=" + encodeURIComponent(invoiceId) + "&status=all");
        if (!installments) return;
        installments.forEach((installment) => {
          const transactionId = installment.transaction && installment.transaction.id;
          if (!transactionId) return;
          installmentsById.set(installment.id, installment);
          const node = findNodeByData("script[data-purchase]", transactionId);
          const row = node && node.closest("article");
          if (!row) return;
          // Card recurrences already have the shared recurring icon; finite plans use one badge.
          if (!installment.recurrenceId && Number(installment.totalInstallments) > 1) {
            addBadge(row, installment);
          }
          const editButton = row.querySelector('[data-edit-purchase="' + transactionId + '"]');
          if (editButton && installment.editBlockedReason === "invoice_linked") {
            editButton.title = editButton.disabled
              ? editButton.title
`;
}
