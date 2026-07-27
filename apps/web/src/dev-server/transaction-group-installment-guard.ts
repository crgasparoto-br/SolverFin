export function transactionGroupInstallmentGuardScript(): string {
  return `
    (function () {
      if (window.location.pathname !== "/lancamentos") return;

      const nativeFetch = window.fetch.bind(window);
      const groupingMessage = "Parcelas devem permanecer fora de agrupamentos. Desagrupe para manter a parcela.";

      function readJsonNode(node) {
        try {
          return JSON.parse(node.textContent || "{}");
        } catch (_error) {
          return undefined;
        }
      }

      function installmentLabel(installment) {
        const total = Number(installment.totalInstallments) > 0 ? installment.totalInstallments : "?";
        return "Parcela " + installment.sequenceNumber + " de " + total;
      }

      function disableSelection(input) {
        if (!input) return;
        if (input.checked) {
          input.checked = false;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        input.disabled = true;
        input.title = groupingMessage;
        const currentLabel = input.getAttribute("aria-label") || "Selecionar lançamento";
        if (!currentLabel.includes("indisponível para agrupamento")) {
          input.setAttribute("aria-label", currentLabel + " — indisponível para agrupamento");
        }
      }

      function guardCanonicalTransactionSelection() {
        document.querySelectorAll("script[data-transaction]").forEach((node) => {
          const transaction = readJsonNode(node);
          if (!transaction || !transaction.installmentId) return;
          const row = node.closest("article");
          disableSelection(row && row.querySelector("[data-select-transaction]"));
        });
      }

      function addLegacyGroupGuidance(row) {
        const description = row && row.querySelector(".description");
        if (!description || description.querySelector("[data-installment-group-guidance]")) return;
        const groupKey = String(row.dataset.groupRow || "legacy").replace(/[^a-zA-Z0-9_-]/g, "");
        const guidance = document.createElement("span");
        guidance.dataset.installmentGroupGuidance = "";
        guidance.id = "installment-group-guidance-" + groupKey;
        guidance.className = "muted";
        guidance.textContent = groupingMessage;
        description.appendChild(guidance);

        const detailsButton = row.querySelector("[data-group-details]");
        if (detailsButton) {
          detailsButton.title = groupingMessage;
          detailsButton.setAttribute("aria-describedby", guidance.id);
        }
      }

      function decorateLegacyGroups(installments) {
        const byTransactionId = new Map();
        installments.forEach((installment) => {
          const transactionId = installment && installment.transaction && installment.transaction.id;
          if (transactionId) byTransactionId.set(transactionId, installment);
        });

        document.querySelectorAll("script[data-group]").forEach((node) => {
          const group = readJsonNode(node);
          const row = node.closest("article");
          const description = row && row.querySelector(".description strong");
          if (!group || !row || !description || !Array.isArray(group.members)) return;

          const linkedInstallments = group.members
            .map((member) => byTransactionId.get(member.id))
            .filter(Boolean);
          if (linkedInstallments.length === 0) return;

          linkedInstallments.forEach((installment) => {
            if (description.querySelector('[data-installment-badge="' + installment.id + '"]')) return;
            const label = installmentLabel(installment);
            const badge = document.createElement("span");
            badge.className = "installment-badge";
            badge.dataset.installmentBadge = installment.id;
            badge.textContent = label;
            badge.setAttribute("aria-label", label + ". " + groupingMessage);
            badge.title = groupingMessage;
            description.appendChild(badge);
          });

          addLegacyGroupGuidance(row);
          disableSelection(
            row.querySelector("[data-select-group], [data-select-transaction], input[type=checkbox]"),
          );
        });
      }

      window.fetch = async (...args) => {
        const response = await nativeFetch(...args);
        try {
          const input = args[0];
          const url = new URL(
            input instanceof Request ? input.url : String(input || ""),
            window.location.origin,
          );
          const method = String(
            (args[1] && args[1].method) || (input instanceof Request ? input.method : "GET"),
          ).toUpperCase();
          if (
            method === "GET" &&
            url.pathname === "/api/installments" &&
            url.searchParams.has("accountId") &&
            response.ok
          ) {
            const body = await response.clone().json().catch(() => ({}));
            const installments = Array.isArray(body.installments) ? body.installments : [];
            window.queueMicrotask(() => decorateLegacyGroups(installments));
          }
        } catch (_error) {
          // The grouping guard must not break the statement when optional metadata is unavailable.
        }
        return response;
      };

      guardCanonicalTransactionSelection();
    })();
  `;
}
