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
          processing: "Em processamento",
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

        function buildMessagesUrl() {
          const url = new URL("/api/bank-message-inbox", window.location.origin);
          url.searchParams.set("status", "all");
          const profileId = new URLSearchParams(window.location.search).get("profileId");
          if (profileId) url.searchParams.set("profileId", profileId);
          return url;
        }

        function buildRowsByMaskedText(rows) {
          const indexed = new Map();
          for (const row of rows) {
            const key = row.querySelector(".message-preview > p")?.textContent?.trim();
            if (!key) continue;
            const matches = indexed.get(key) || [];
            matches.push(row);
            indexed.set(key, matches);
          }
          return indexed;
        }

        function findUnambiguousMessageRow(rowsByMaskedText, message) {
          const key = typeof message.maskedText === "string" ? message.maskedText.trim() : "";
          if (!key) return undefined;
          const matches = rowsByMaskedText.get(key) || [];
          return matches.length === 1 ? matches[0] : undefined;
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

        function ensureRetryStatus(dialog, form) {
          const existing = dialog.querySelector("[data-bank-message-retry-status]");
          if (existing) return existing;

          const status = document.createElement("p");
          status.dataset.bankMessageRetryStatus = "";
          status.className = "form-status warning";
          status.setAttribute("role", "status");
          status.setAttribute("aria-live", "polite");
          form.insertAdjacentElement("afterend", status);
          return status;
        }

        function clearRetryStatus() {
          document
            .querySelector("#new-inbox-message-dialog [data-bank-message-retry-status]")
            ?.remove();
        }

        function openRetryDialog(message) {
          const dialog = document.getElementById("new-inbox-message-dialog");
          const form = dialog?.querySelector("[data-api-form]");
          const textarea = form?.querySelector('textarea[name="text"]');
          const origin = form?.querySelector('input[name="origin"]');
          if (!dialog || !form || !textarea || !origin || !dialog.showModal) return;

          form.reset();
          origin.value = message.origin === "shared" ? "shared" : "pasted";
          textarea.value = "";
          const status = ensureRetryStatus(dialog, form);
          status.textContent =
            "Por privacidade, o texto original não foi armazenado. Cole novamente a mesma mensagem e confirme a autorização para tentar de novo.";
          dialog.showModal();
          textarea.focus();
        }

        async function enhanceMessages() {
          const section = findMessagesSection();
          if (!section) return;

          const response = await fetch(buildMessagesUrl());
          if (!response.ok) return;
          const body = await response.json().catch(() => ({}));
          const messages = Array.isArray(body.messages) ? body.messages : [];
          const rows = Array.from(section.querySelectorAll("article.maintenance-item"));
          const rowsByMaskedText = buildRowsByMaskedText(rows);

          messages.forEach((message) => {
            if (typeof message !== "object" || message === null) return;
            const row = findUnambiguousMessageRow(rowsByMaskedText, message);
            if (!row) return;

            const summary = row.querySelector(".maintenance-summary > div");
            if (summary && !summary.querySelector("[data-extraction-status]")) {
              const status = document.createElement("span");
              status.dataset.extractionStatus = "";
              status.setAttribute("role", "status");
              const source = sourceLabels[message.extractionSource] || "Origem não identificada";
              const state = stateLabels[message.extractionState] || "Estado não identificado";
              status.textContent = "Extração: " + source + " · " + state;
              if (typeof message.diagnosticMessage === "string") {
                status.title = message.diagnosticMessage;
              }
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

        document
          .querySelectorAll('[data-open-dialog="new-inbox-message-dialog"]')
          .forEach((button) => button.addEventListener("click", clearRetryStatus, true));

        enhanceMessages().catch(() => {
          // A lista SSR continua utilizável se o enriquecimento progressivo falhar.
        });
      })();
    </script>
  `;
}
