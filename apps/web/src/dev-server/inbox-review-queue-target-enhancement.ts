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

        function appendProfile(path) {
          const profileId = new URL(window.location.href).searchParams.get("profileId");
          if (!profileId) return path;
          const url = new URL(path, window.location.origin);
          url.searchParams.set("profileId", profileId);
          return url.pathname + url.search;
        }
        async function api(path) {
          const response = await fetch(appendProfile(path));
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body?.error?.message || "Não foi possível carregar o lançamento alvo.");
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
          const status = transaction.status ? " · " + String(transaction.status) : "";
          return '<section class="review-target-summary" data-review-target-summary>' +
            '<strong>Lançamento alvo</strong>' +
            '<p>' + escapeHtml(description) + '</p>' +
            '<span>' + escapeHtml(formatDate(occurredOn)) + ' · ' + escapeHtml(formatMoney(transaction.amountMinor, transaction.currency)) + escapeHtml(status) + '</span>' +
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
        document.addEventListener("click", (event) => {
          const button = event.target?.closest?.("[data-review-details]");
          const suggestionId = button?.dataset?.reviewDetails;
          if (!suggestionId) return;
          dialog.dataset.reviewTargetRequest = suggestionId;
          void appendTargetSummary(suggestionId).catch(() => undefined);
        });
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
