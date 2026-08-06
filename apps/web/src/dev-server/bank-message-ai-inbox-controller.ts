export function bankMessageAiInboxControllerScript(): string {
  return `
    <script>
      (() => {
        const sourceLabels = {
          deterministic: "Regra determinística",
          ai: "Assistida por IA",
          none: "Revisão manual",
        };
        const stateLabels = {
          ready_for_review: "Pronta para revisão",
          low_confidence: "Baixa confiança",
          incomplete: "Extração incompleta",
          temporarily_unavailable: "IA temporariamente indisponível",
        };

        function findMessagesSection() {
          return Array.from(document.querySelectorAll("section.panel.list-panel")).find(
            (section) => section.querySelector("h2")?.textContent?.trim() === "Mensagens recebidas",
          );
        }

        function addReviewReasons(row, reasons) {
          if (!Array.isArray(reasons) || reasons.length === 0) return;
          const preview = row.querySelector(".message-preview");
          if (!preview || preview.querySelector("[data-extraction-reasons]")) return;

          const details = document.createElement("details");
          details.dataset.extractionReasons = "";
          const summary = document.createElement("summary");
          summary.textContent = "Motivos para revisão";
          details.appendChild(summary);
          const list = document.createElement("ul");
          for (const reason of reasons) {
            if (typeof reason !== "string" || !reason.trim()) continue;
            const item = document.createElement("li");
            item.textContent = reason;
            list.appendChild(item);
          }
          if (list.children.length > 0) {
            details.appendChild(list);
            preview.appendChild(details);
          }
        }

        function openRetryDialog(message) {
          const dialog = document.getElementById("new-inbox-message-dialog");
          const form = dialog?.querySelector("[data-api-form]");
          const textarea = form?.querySelector('textarea[name="text"]');
          const origin = form?.querySelector('input[name="origin"]');
          const status = form?.querySelector("[data-form-status]");
          if (!dialog || !form || !textarea || !origin || !dialog.showModal) return;

          form.reset();
          origin.value = message.origin === "shared" ? "shared" : "pasted";
          textarea.value = "";
          if (status) {
            status.className = "form-status warning";
            status.textContent =
              "Por privacidade, o texto original não foi armazenado. Cole novamente a mesma mensagem e confirme a autorização para tentar de novo.";
          }
          dialog.showModal();
          textarea.focus();
        }

        async function enhanceMessages() {
          const section = findMessagesSection();
          if (!section) return;

          const response = await fetch("/api/bank-message-inbox?status=all");
          if (!response.ok) return;
          const body = await response.json().catch(() => ({}));
          const messages = Array.isArray(body.messages) ? body.messages : [];
          const rows = Array.from(section.querySelectorAll("article.maintenance-item"));

          messages.forEach((message, index) => {
            const row = rows[index];
            if (!row || typeof message !== "object" || message === null) return;

            const summary = row.querySelector(".maintenance-summary > div");
            if (summary && !summary.querySelector("[data-extraction-status]")) {
              const status = document.createElement("span");
              status.dataset.extractionStatus = "";
              status.setAttribute("role", "status");
              const source = sourceLabels[message.extractionSource] || "Origem não identificada";
              const state = stateLabels[message.extractionState] || "Estado não identificado";
              status.textContent = "Extração: " + source + " · " + state;
              summary.appendChild(status);
            }

            addReviewReasons(row, message.reviewReasons);

            if (message.retryable !== true) return;
            const actions = row.querySelector(".maintenance-actions");
            if (!actions || actions.querySelector("[data-retry-bank-message]")) return;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "secondary-button";
            button.dataset.retryBankMessage = "";
            button.textContent = "Tentar novamente";
            button.setAttribute(
              "aria-label",
              "Tentar novamente a extração desta mensagem bancária",
            );
            button.addEventListener("click", () => openRetryDialog(message));
            actions.prepend(button);
          });
        }

        enhanceMessages().catch(() => {
          // A lista SSR continua utilizável se o enriquecimento progressivo falhar.
        });
      })();
    </script>
  `;
}
