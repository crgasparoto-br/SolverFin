export function transactionGroupInstallmentGuardScript(): string {
  return `
    (function () {
      if (window.location.pathname !== "/lancamentos") return;

      const nativeFetch = window.fetch.bind(window);
      const groupingMessage = "Parcelas devem permanecer fora de agrupamentos. Desagrupe para manter a parcela.";
      const canonicalSelectionTitle = "Disponível para ações em massa; indisponível para unificação.";
      const canonicalGroupingHelp = "Unificar lançamentos indisponível: desmarque as parcelas canônicas. Elas continuam disponíveis para conciliar, desconciliar ou excluir.";
      const ambiguousRecoveryMessage = "A resposta foi inconclusiva. Tente novamente para confirmar o parcelamento antes de alterar os dados, ou feche o formulário para cancelar esta tentativa.";
      let ambiguousInstallmentAttempt;

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

      function markCanonicalSelection(input) {
        if (!input) return;
        input.dataset.canonicalInstallment = "true";
        input.title = canonicalSelectionTitle;
        const currentLabel = input.getAttribute("aria-label") || "Selecionar lançamento";
        if (!currentLabel.includes("indisponível para unificação")) {
          input.setAttribute(
            "aria-label",
            currentLabel + " — parcela canônica, indisponível para unificação",
          );
        }
      }

      function disableLegacyGroupSelection(input) {
        if (!input) return;
        if (input.checked) {
          input.checked = false;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        input.disabled = true;
        input.title = groupingMessage;
        const currentLabel = input.getAttribute("aria-label") || "Selecionar agrupamento";
        if (!currentLabel.includes("indisponível para agrupamento")) {
          input.setAttribute("aria-label", currentLabel + " — indisponível para agrupamento");
        }
      }

      function guardCanonicalTransactionSelection() {
        document.querySelectorAll("script[data-transaction]").forEach((node) => {
          const transaction = readJsonNode(node);
          if (!transaction || !transaction.installmentId) return;
          const row = node.closest("article");
          markCanonicalSelection(row && row.querySelector("[data-select-transaction]"));
        });
      }

      function selectedCanonicalInputs() {
        return Array.from(
          document.querySelectorAll(
            '[data-select-transaction][data-canonical-installment="true"]:checked',
          ),
        );
      }

      function syncCanonicalGroupingGuard() {
        if (selectedCanonicalInputs().length === 0) return;
        const groupOpen = document.querySelector("[data-group-open]");
        if (!groupOpen) return;

        groupOpen.disabled = true;
        groupOpen.title = "Desmarque as parcelas canônicas para unificar somente lançamentos elegíveis.";
        const helpNode = document.querySelector("[data-bulk-selection-help]");
        if (helpNode && !helpNode.textContent.includes(canonicalGroupingHelp)) {
          helpNode.textContent = [canonicalGroupingHelp, helpNode.textContent]
            .filter(Boolean)
            .join(" ");
        }
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
          disableLegacyGroupSelection(
            row.querySelector("[data-select-group], [data-select-transaction], input[type=checkbox]"),
          );
        });
      }

      function readFetchDescriptor(args) {
        const input = args[0];
        const init = args[1] || {};
        const url = new URL(
          input instanceof Request ? input.url : String(input || ""),
          window.location.origin,
        );
        const method = String(
          init.method || (input instanceof Request ? input.method : "GET"),
        ).toUpperCase();
        const body = typeof init.body === "string" ? init.body : undefined;
        const { signal: _signal, ...retryableInit } = init;

        return {
          url: url.toString(),
          pathname: url.pathname,
          method,
          body,
          init: retryableInit,
        };
      }

      function isManualInstallmentPost(descriptor) {
        return descriptor.method === "POST" && descriptor.pathname === "/api/installments";
      }

      function isAmbiguousInstallmentResponse(response) {
        return (
          response.status === 0 ||
          response.status === 408 ||
          response.status === 425 ||
          response.status === 429 ||
          response.status >= 500
        );
      }

      function lockInstallmentFormForRecovery() {
        const form = document.querySelector("[data-form]");
        if (!form) return;
        form.dataset.installmentRecovery = "ambiguous";
        form.querySelectorAll("input, select, textarea, button").forEach((control) => {
          if (control.matches('button[type="submit"]')) return;
          if (control.disabled) return;
          control.disabled = true;
          control.dataset.installmentRecoveryDisabled = "true";
        });
      }

      function unlockInstallmentFormAfterRecovery() {
        const form = document.querySelector("[data-form]");
        if (!form) return;
        delete form.dataset.installmentRecovery;
        form.querySelectorAll('[data-installment-recovery-disabled="true"]').forEach((control) => {
          control.disabled = false;
          delete control.dataset.installmentRecoveryDisabled;
        });
      }

      function announceAmbiguousRecovery() {
        window.setTimeout(() => {
          const statusNode = document.querySelector("[data-form] .form-status");
          if (!statusNode) return;
          statusNode.className = "form-status error full";
          statusNode.textContent = ambiguousRecoveryMessage;
        }, 0);
      }

      function preserveAmbiguousAttempt(descriptor) {
        ambiguousInstallmentAttempt = descriptor;
        lockInstallmentFormForRecovery();
        announceAmbiguousRecovery();
      }

      function clearAmbiguousAttempt() {
        ambiguousInstallmentAttempt = undefined;
        unlockInstallmentFormAfterRecovery();
      }

      window.fetch = async (...args) => {
        let descriptor = readFetchDescriptor(args);
        let requestArgs = args;
        const manualInstallmentPost = isManualInstallmentPost(descriptor);

        if (manualInstallmentPost && ambiguousInstallmentAttempt) {
          descriptor = ambiguousInstallmentAttempt;
          requestArgs = [
            descriptor.url,
            {
              ...descriptor.init,
              method: descriptor.method,
              body: descriptor.body,
            },
          ];
        }

        let response;
        try {
          response = await nativeFetch(...requestArgs);
        } catch (error) {
          if (manualInstallmentPost) preserveAmbiguousAttempt(descriptor);
          throw error;
        }

        if (manualInstallmentPost) {
          if (isAmbiguousInstallmentResponse(response)) preserveAmbiguousAttempt(descriptor);
          else clearAmbiguousAttempt();
        }

        try {
          if (
            descriptor.method === "GET" &&
            descriptor.pathname === "/api/installments" &&
            new URL(descriptor.url).searchParams.has("accountId") &&
            response.ok
          ) {
            const body = await response.clone().json().catch(() => ({}));
            const installments = Array.isArray(body.installments) ? body.installments : [];
            window.queueMicrotask(() => decorateLegacyGroups(installments));
          }
        } catch (_error) {
          // Optional decoration and recovery guards must not break the statement.
        }
        return response;
      };

      document.addEventListener("change", (event) => {
        const target = event.target;
        if (target && target.matches && target.matches("[data-select-transaction]")) {
          window.queueMicrotask(syncCanonicalGroupingGuard);
        }
      });

      document.addEventListener(
        "click",
        (event) => {
          const target = event.target && event.target.closest ? event.target.closest("[data-group-open]") : null;
          if (!target || selectedCanonicalInputs().length === 0) return;
          syncCanonicalGroupingGuard();
          event.preventDefault();
          event.stopImmediatePropagation();
        },
        true,
      );

      document.querySelector("[data-modal]")?.addEventListener("close", clearAmbiguousAttempt);
      guardCanonicalTransactionSelection();
    })();
  `;
}
