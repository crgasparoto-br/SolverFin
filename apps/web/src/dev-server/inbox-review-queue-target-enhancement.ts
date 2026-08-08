const TARGET_ENHANCEMENT_MARKER = "data-ai-review-target-enhanced";

export function enhanceInboxReviewQueueTargets(html: string): string {
  if (!html.includes("data-ai-review-queue-enhanced")) return html;
  if (html.includes(TARGET_ENHANCEMENT_MARKER)) return html;

  const script = `
    <script ${TARGET_ENHANCEMENT_MARKER}>
      (() => {
        const dialog = document.getElementById("ai-review-dialog");
        const dialogBody = document.getElementById("ai-review-dialog-body");
        if (!dialog || !dialogBody) return;
        let correctionSuggestionId;

        function appendProfile(path) {
          const profileId = new URL(window.location.href).searchParams.get("profileId");
          if (!profileId) return path;
          const url = new URL(path, window.location.origin);
          url.searchParams.set("profileId", profileId);
          return url.pathname + url.search;
        }
        async function api(path, options) {
          const response = await fetch(appendProfile(path), options);
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            const error = new Error(body?.error?.message || "Não foi possível concluir a ação.");
            error.code = body?.error?.code;
            throw error;
          }
          return body;
        }
        function escapeHtml(value) {
          return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }
        function formatDate(value) {
          if (!value) return "—";
          const date = new Date(String(value).slice(0, 10) + "T12:00:00Z");
          return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
        }
        function formatMoney(minor, currency) {
          return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(Number(minor || 0) / 100);
        }
        function renderTargetSummary(transaction) {
          const description = String(transaction.description || "Lançamento sem descrição").trim();
          const occurredOn = transaction.occurredOn || transaction.effectiveOn || transaction.plannedOn;
          return '<section class="review-target-summary" data-review-target-summary>' +
            '<strong>Lançamento alvo</strong>' +
            '<p>' + escapeHtml(description) + '</p>' +
            '<span>' + escapeHtml(formatDate(occurredOn)) + ' · ' + escapeHtml(formatMoney(transaction.amountMinor, transaction.currency)) + '</span>' +
            '</section>';
        }
        async function appendTargetSummary(suggestionId) {
          const detail = await api("/api/ai-review-queue/" + encodeURIComponent(suggestionId) + "/payload");
          const payload = detail.payload || {};
          if (payload.suggestionKind !== "deduplication" && payload.suggestionKind !== "reconciliation") return;
          const targetTransactionId = payload.proposal?.targetTransactionId;
          if (!targetTransactionId) return;
          const target = await api("/api/transactions/" + encodeURIComponent(targetTransactionId));
          if (dialog.dataset.reviewTargetRequest !== suggestionId || dialog.open !== true) return;
          dialogBody.querySelector("[data-review-target-summary]")?.remove();
          dialogBody.insertAdjacentHTML("beforeend", renderTargetSummary(target.transaction || {}));
        }
        async function postVersionedDecision(suggestionId, action, extraBody) {
          const detail = await api("/api/ai-review-queue/" + encodeURIComponent(suggestionId) + "/payload");
          return api("/api/ai-review-queue/" + encodeURIComponent(suggestionId) + "/" + action, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ expectedFingerprint: detail.payload.fingerprint, ...(extraBody || {}) })
          });
        }
        async function handleLegacyReviewAction(button, suggestionId, action) {
          const confirmation = button.dataset.apiConfirm;
          if (confirmation && !window.confirm(confirmation)) return;
          const container = button.closest(".maintenance-actions") || button.parentElement;
          const status = container?.querySelector("[data-form-status]");
          button.disabled = true;
          if (status) { status.className = "form-status muted"; status.textContent = "Validando versão atual..."; }
          try {
            await postVersionedDecision(suggestionId, action);
            if (status) { status.className = "form-status success"; status.textContent = "Ação concluída. Atualizando a tela..."; }
            window.setTimeout(() => window.location.reload(), 120);
          } catch (error) {
            if (status) { status.className = "form-status error"; status.textContent = error.message; }
            button.disabled = false;
          }
        }
        async function handleCorrectionSubmit(form, suggestionId) {
          const select = form.querySelector("select");
          const submit = form.querySelector('button[type="submit"]');
          const status = form.querySelector(".form-status");
          if (!select || !submit) return;
          submit.disabled = true;
          if (status) status.textContent = "Validando versão atual...";
          try {
            await postVersionedDecision(suggestionId, "approve", {
              payloadOverride: { categoryId: select.value }
            });
            form.closest("dialog")?.close();
            window.location.reload();
          } catch (error) {
            if (status) status.textContent = error.message;
            submit.disabled = false;
          }
        }
        document.addEventListener("click", (event) => {
          const correctionButton = event.target?.closest?.("[data-correct-and-approve]");
          if (correctionButton?.dataset?.correctAndApprove) {
            correctionSuggestionId = correctionButton.dataset.correctAndApprove;
          }

          const legacyButton = event.target?.closest?.('[data-api-action][data-api-path^="/api/ai-review-queue/"]');
          const match = legacyButton?.dataset?.apiPath?.match(/^\\/api\\/ai-review-queue\\/([0-9a-f-]+)\\/(approve|reject)$/i);
          if (legacyButton && match) {
            event.preventDefault();
            event.stopImmediatePropagation();
            void handleLegacyReviewAction(legacyButton, match[1], match[2]);
            return;
          }

          const detailsButton = event.target?.closest?.("[data-review-details]");
          const suggestionId = detailsButton?.dataset?.reviewDetails;
          if (!suggestionId) return;
          dialog.dataset.reviewTargetRequest = suggestionId;
          void appendTargetSummary(suggestionId).catch(() => undefined);
        }, true);
        document.addEventListener("submit", (event) => {
          const form = event.target;
          if (!(form instanceof HTMLFormElement)) return;
          if (!form.closest("[data-category-correction-dialog]") || form.classList.contains("dialog-close-form")) return;
          if (!correctionSuggestionId) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          void handleCorrectionSubmit(form, correctionSuggestionId);
        }, true);
        dialog.addEventListener("close", () => {
          delete dialog.dataset.reviewTargetRequest;
        });
      })();
    </script>`;

  const css = `
      .review-target-summary { background: var(--surface-soft); border-radius: var(--radius); display: grid; gap: 4px; padding: 10px; }
      .review-target-summary p { margin: 0; }
      .review-target-summary span { color: var(--muted); font-size: 0.8125rem; }
    `;

  let enhanced = html.replace("</style>", `${css}</style>`);
  enhanced = enhanced.replace("</body>", `${script}\n</body>`);
  return enhanced;
}
