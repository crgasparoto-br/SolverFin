export function financialOperationRecoveryScript(): string {
  return `
    (function () {
      if (window.location.pathname !== "/lancamentos") return;

      const nativeFetch = window.fetch.bind(window);
      const ambiguousRecoveryMessage = "A resposta foi inconclusiva. Tente novamente para confirmar o parcelamento antes de alterar os dados, ou feche o formulário para cancelar esta tentativa.";
      const nonIdempotentAmbiguousMessage = "Não foi possível confirmar se a operação foi concluída. Confira o Extrato antes de tentar novamente para evitar duplicidade. Feche este formulário após a conferência.";
      let ambiguousInstallmentAttempt;
      let ambiguousStatusObserver;
      let nonIdempotentAmbiguousRequest;
      let nonIdempotentStatusObserver;

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

      function isNonIdempotentFinancialPost(descriptor) {
        return (
          descriptor.method === "POST" &&
          (descriptor.pathname === "/api/transactions" ||
            descriptor.pathname === "/api/recurrences")
        );
      }

      function isAmbiguousFinancialResponse(response) {
        return (
          response.status === 0 ||
          response.status === 408 ||
          response.status === 425 ||
          response.status === 429 ||
          response.status >= 500
        );
      }

      function modalCloseButton() {
        return document.querySelector('[data-modal] .close-form button[type="submit"]');
      }

      function keepModalCloseAvailable() {
        const closeButton = modalCloseButton();
        if (!closeButton) return;
        closeButton.disabled = false;
        closeButton.dataset.financialRecoveryCloseAvailable = "true";
      }

      function clearModalCloseMarker() {
        const closeButton = modalCloseButton();
        if (!closeButton) return;
        delete closeButton.dataset.financialRecoveryCloseAvailable;
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
        keepModalCloseAvailable();
      }

      function unlockInstallmentFormAfterRecovery() {
        const form = document.querySelector("[data-form]");
        if (!form) return;
        delete form.dataset.installmentRecovery;
        form.querySelectorAll('[data-installment-recovery-disabled="true"]').forEach((control) => {
          control.disabled = false;
          delete control.dataset.installmentRecoveryDisabled;
        });
        clearModalCloseMarker();
      }

      function enforceAmbiguousRecoveryMessage() {
        const statusNode = document.querySelector("[data-form] .form-status");
        if (!statusNode || !ambiguousInstallmentAttempt) return;
        if (statusNode.className !== "form-status error full") {
          statusNode.className = "form-status error full";
        }
        if (statusNode.textContent !== ambiguousRecoveryMessage) {
          statusNode.textContent = ambiguousRecoveryMessage;
        }
        keepModalCloseAvailable();
      }

      function observeAmbiguousRecoveryMessage() {
        ambiguousStatusObserver?.disconnect();
        const statusNode = document.querySelector("[data-form] .form-status");
        if (!statusNode) return;
        ambiguousStatusObserver = new MutationObserver(enforceAmbiguousRecoveryMessage);
        ambiguousStatusObserver.observe(statusNode, {
          attributes: true,
          attributeFilter: ["class"],
          characterData: true,
          childList: true,
          subtree: true,
        });
        enforceAmbiguousRecoveryMessage();
      }

      function preserveAmbiguousAttempt(descriptor) {
        ambiguousInstallmentAttempt = descriptor;
        lockInstallmentFormForRecovery();
        observeAmbiguousRecoveryMessage();
      }

      function clearAmbiguousAttempt() {
        ambiguousInstallmentAttempt = undefined;
        ambiguousStatusObserver?.disconnect();
        ambiguousStatusObserver = undefined;
        unlockInstallmentFormAfterRecovery();
      }

      function lockNonIdempotentFormAfterAmbiguity() {
        const form = document.querySelector("[data-form]");
        if (!form) return;
        form.dataset.nonIdempotentRecovery = "ambiguous";
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
          submitButton.disabled = true;
          submitButton.dataset.nonIdempotentRecoveryDisabled = "true";
        }
        keepModalCloseAvailable();
      }

      function unlockNonIdempotentFormAfterAmbiguity() {
        const form = document.querySelector("[data-form]");
        if (!form) return;
        delete form.dataset.nonIdempotentRecovery;
        const submitButton = form.querySelector(
          '[data-non-idempotent-recovery-disabled="true"]',
        );
        if (submitButton) {
          submitButton.disabled = false;
          delete submitButton.dataset.nonIdempotentRecoveryDisabled;
        }
        clearModalCloseMarker();
      }

      function enforceNonIdempotentAmbiguousMessage() {
        const form = document.querySelector("[data-form]");
        const statusNode = form && form.querySelector(".form-status");
        if (!form || !statusNode || !nonIdempotentAmbiguousRequest) return;
        form.dataset.nonIdempotentRecovery = "ambiguous";
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
          submitButton.disabled = true;
          submitButton.dataset.nonIdempotentRecoveryDisabled = "true";
        }
        if (statusNode.className !== "form-status error full") {
          statusNode.className = "form-status error full";
        }
        if (statusNode.textContent !== nonIdempotentAmbiguousMessage) {
          statusNode.textContent = nonIdempotentAmbiguousMessage;
        }
        keepModalCloseAvailable();
      }

      function observeNonIdempotentAmbiguousMessage() {
        nonIdempotentStatusObserver?.disconnect();
        const statusNode = document.querySelector("[data-form] .form-status");
        if (!statusNode) return;
        nonIdempotentStatusObserver = new MutationObserver(
          enforceNonIdempotentAmbiguousMessage,
        );
        nonIdempotentStatusObserver.observe(statusNode, {
          attributes: true,
          attributeFilter: ["class"],
          characterData: true,
          childList: true,
          subtree: true,
        });
        enforceNonIdempotentAmbiguousMessage();
      }

      function preserveNonIdempotentAmbiguity(descriptor) {
        nonIdempotentAmbiguousRequest = descriptor;
        lockNonIdempotentFormAfterAmbiguity();
        observeNonIdempotentAmbiguousMessage();
      }

      function clearNonIdempotentAmbiguity() {
        nonIdempotentAmbiguousRequest = undefined;
        nonIdempotentStatusObserver?.disconnect();
        nonIdempotentStatusObserver = undefined;
        unlockNonIdempotentFormAfterAmbiguity();
      }

      window.fetch = async (...args) => {
        let descriptor = readFetchDescriptor(args);
        let requestArgs = args;
        const manualInstallmentPost = isManualInstallmentPost(descriptor);
        const nonIdempotentFinancialPost = isNonIdempotentFinancialPost(descriptor);

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
          if (manualInstallmentPost) {
            preserveAmbiguousAttempt(descriptor);
            throw error;
          }
          if (nonIdempotentFinancialPost) {
            preserveNonIdempotentAmbiguity(descriptor);
            return new Response(
              JSON.stringify({
                error: {
                  code: "FINANCIAL_OPERATION_RESULT_UNKNOWN",
                  message: nonIdempotentAmbiguousMessage,
                },
              }),
              {
                status: 599,
                headers: { "content-type": "application/json; charset=utf-8" },
              },
            );
          }
          throw error;
        }

        if (manualInstallmentPost) {
          if (isAmbiguousFinancialResponse(response)) preserveAmbiguousAttempt(descriptor);
          else clearAmbiguousAttempt();
        } else if (nonIdempotentFinancialPost) {
          if (isAmbiguousFinancialResponse(response)) {
            preserveNonIdempotentAmbiguity(descriptor);
          } else {
            clearNonIdempotentAmbiguity();
          }
        }

        return response;
      };

      document.addEventListener(
        "submit",
        (event) => {
          const target = event.target;
          if (
            !target ||
            !target.matches ||
            !target.matches("[data-form]") ||
            target.dataset.nonIdempotentRecovery !== "ambiguous"
          ) {
            return;
          }
          enforceNonIdempotentAmbiguousMessage();
          event.preventDefault();
          event.stopImmediatePropagation();
        },
        true,
      );

      const modal = document.querySelector("[data-modal]");
      modal?.addEventListener("close", clearAmbiguousAttempt);
      modal?.addEventListener("close", clearNonIdempotentAmbiguity);
    })();
  `;
}
