const SCRIPT_MARKER = "data-transaction-group-pending-fixes";

export function enhanceTransactionGroupPendingFixes(html: string): string {
  if (!html.includes("data-group-modal") || html.includes(SCRIPT_MARKER)) return html;

  const script = `
    <script ${SCRIPT_MARKER}>
      (function () {
        const MAX_DESCRIPTION_LENGTH = 240;
        const transactionForm = document.querySelector("[data-form]");
        const descriptionInput = transactionForm && transactionForm.querySelector('[name="description"]');

        function limitCloneDescription() {
          if (!transactionForm || !descriptionInput) return;
          descriptionInput.maxLength = MAX_DESCRIPTION_LENGTH;
          if (
            transactionForm.dataset.groupMemberMode === "clone" &&
            descriptionInput.value.length > MAX_DESCRIPTION_LENGTH
          ) {
            descriptionInput.value = descriptionInput.value.slice(0, MAX_DESCRIPTION_LENGTH);
          }
        }

        if (transactionForm && descriptionInput) {
          descriptionInput.maxLength = MAX_DESCRIPTION_LENGTH;
          const formModeObserver = new MutationObserver(limitCloneDescription);
          formModeObserver.observe(transactionForm, {
            attributes: true,
            attributeFilter: ["data-group-member-mode"]
          });
          document.addEventListener("click", function (event) {
            if (!event.target.closest('[data-group-members] [data-member-action="clone"]')) return;
            window.setTimeout(limitCloneDescription, 0);
          }, true);
        }

        function money(minor, currency) {
          return (Number(minor || 0) / 100).toLocaleString("pt-BR", {
            style: "currency",
            currency: currency || "BRL"
          });
        }

        function moneyToMinor(value) {
          const normalized = String(value || "")
            .replace(/[^0-9,.-]/g, "")
            .replace(/\\./g, "")
            .replace(",", ".");
          const parsed = Number(normalized);
          return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
        }

        function signedTotal(group) {
          const total = Math.abs(Number(group.totalAmountMinor || 0));
          return group.kind === "expense" ? -total : total;
        }

        function statusPresentation(status) {
          if (status === "reconciled") {
            return {
              label: "Conciliado",
              tone: "ok",
              icon: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            };
          }
          if (status === "planned") {
            return {
              label: "Previsto",
              tone: "planned",
              icon: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            };
          }
          return {
            label: "Efetivado não conciliado",
            tone: "posted",
            icon: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>'
          };
        }

        function updateBalance(row, deltaMinor, currency) {
          const balance = row.querySelector(".col-balance");
          if (!balance) return;
          const currentMinor = balance.dataset.balanceMinor === undefined
            ? moneyToMinor(balance.textContent)
            : Number(balance.dataset.balanceMinor);
          const nextMinor = currentMinor + deltaMinor;
          balance.dataset.balanceMinor = String(nextMinor);
          balance.textContent = money(nextMinor, currency);
          balance.classList.toggle("debit", nextMinor < 0);
        }

        function updateStatementProjection(group) {
          const row = document.querySelector('[data-group-row="' + CSS.escape(group.id) + '"]');
          if (!row) return;
          const nextAmountMinor = signedTotal(group);
          const previousAmountMinor = row.dataset.groupProjectionAmountMinor === undefined
            ? nextAmountMinor
            : Number(row.dataset.groupProjectionAmountMinor);
          const deltaMinor = nextAmountMinor - previousAmountMinor;
          row.dataset.groupProjectionAmountMinor = String(nextAmountMinor);
          row.dataset.groupProjectionStatus = group.status || "posted";

          const amount = row.querySelector(".col-amount");
          if (amount) {
            amount.textContent = money(nextAmountMinor, group.currency);
            amount.classList.toggle("debit", nextAmountMinor < 0);
            amount.classList.toggle("credit", nextAmountMinor >= 0);
          }

          const memberCount = row.querySelector(".col-description span");
          if (memberCount) memberCount.textContent = group.members.length + " lançamentos agrupados";

          const status = row.querySelector(".col-status");
          if (status) {
            const presentation = statusPresentation(group.status);
            status.className = "statement-status statement-status-" + presentation.tone + " col-status";
            status.setAttribute("aria-label", presentation.label);
            status.setAttribute("title", presentation.label);
            status.dataset.tooltip = presentation.label;
            status.innerHTML = presentation.icon;
          }

          if (deltaMinor !== 0) {
            let affectedRow = row;
            while (affectedRow) {
              if (affectedRow.matches(".statement-row.statement-body")) {
                updateBalance(affectedRow, deltaMinor, group.currency);
              }
              affectedRow = affectedRow.nextElementSibling;
            }
          }
        }

        function readGroup(node) {
          try {
            const group = JSON.parse(node.textContent || "{}");
            return group && group.id && Array.isArray(group.members) ? group : undefined;
          } catch {
            return undefined;
          }
        }

        document.querySelectorAll("script[data-group]").forEach(function (node) {
          const initialGroup = readGroup(node);
          if (!initialGroup) return;
          const row = document.querySelector('[data-group-row="' + CSS.escape(initialGroup.id) + '"]');
          if (row) {
            row.dataset.groupProjectionAmountMinor = String(signedTotal(initialGroup));
            row.dataset.groupProjectionStatus = initialGroup.status || "posted";
          }
          const observer = new MutationObserver(function () {
            const group = readGroup(node);
            if (group) updateStatementProjection(group);
          });
          observer.observe(node, { childList: true, characterData: true, subtree: true });
        });
      })();
    </script>`;

  return html.replace("</body>", `${script}</body>`);
}
