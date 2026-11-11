export function inboxReviewQueueScriptPartOne(): string {
  return `
    <script data-ai-review-queue-enhanced>
      (() => {
        const section = Array.from(document.querySelectorAll("section.panel.list-panel")).find((candidate) =>
          candidate.querySelector("h2")?.textContent?.trim() === "Outras sugestões"
        );
        if (!section) return;

        const rows = section.querySelector(".rows");
        const count = section.querySelector(".section-heading > span");
        const heading = section.querySelector(".section-heading");
        const dialog = document.getElementById("ai-review-dialog");
        const dialogBody = document.getElementById("ai-review-dialog-body");
        const selected = document.getElementById("inbox-review-selected");
        let selectionGeneration = 0;
        const state = { items: [], accounts: [], categories: [], details: new Map(), trigger: null, selectedId: null };
        const currentUrl = new URL(window.location.href);

        const filterBar = document.createElement("div");
        filterBar.className = "review-filter-bar";
        filterBar.setAttribute("aria-label", "Filtros da fila de revisão");
        filterBar.innerHTML =
          '<label>Tipo<select data-review-filter="kind">' +
            '<option value="all">Todos</option><option value="transaction_extraction">Lançamentos</option>' +
            '<option value="categorization">Categorização</option><option value="deduplication">Duplicidade</option>' +
            '<option value="reconciliation">Conciliação</option><option value="insight">Insights</option></select></label>' +
          '<label>Status<select data-review-filter="status">' +
            '<option value="pending_review">Pendentes</option><option value="approved">Aprovadas</option>' +
            '<option value="rejected">Rejeitadas</option><option value="edited">Editadas</option>' +
            '<option value="expired">Expiradas</option><option value="resolved">Resolvidas</option><option value="all">Todos</option></select></label>' +
          '<label>Confiança<select data-review-filter="confidence">' +
            '<option value="all">Todas</option><option value="low">Baixa confiança</option>' +
            '<option value="normal">Normal</option></select></label>' +
          '<button type="button" class="secondary-button" data-button-variant="neutral" data-review-refresh title="Atualizar fila">Atualizar</button>';
        heading?.insertAdjacentElement("afterend", filterBar);

        const kindFilter = filterBar.querySelector('[data-review-filter="kind"]');
        const statusFilter = filterBar.querySelector('[data-review-filter="status"]');
        const confidenceFilter = filterBar.querySelector('[data-review-filter="confidence"]');
        kindFilter.value = currentUrl.searchParams.get("kind") || "all";
        statusFilter.value = currentUrl.searchParams.get("status") || "pending_review";
        confidenceFilter.value = currentUrl.searchParams.get("confidence") || "all";

        function escapeHtml(value) {
          return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }
        function appendProfile(path) {
          const profileId = new URL(window.location.href).searchParams.get("profileId");
          if (!profileId) return path;
          const url = new URL(path, window.location.origin);
          url.searchParams.set("profileId", profileId);
          return url.pathname + url.search;
        }
        function formatKind(kind) {
          const labels = {
            transaction_extraction: "Extração de lançamento",
            categorization: "Categorização",
            deduplication: "Possível duplicidade",
            reconciliation: "Conciliação sugerida",
            insight: "Insight"
          };
          return labels[kind] || kind;
        }
        function formatOrigin(origin) {
          const labels = { ai: "IA", provider: "IA", import: "importação", rule: "regra", automation: "automação", system: "sistema" };
          return labels[origin] || origin || "sistema";
        }
        function formatStatus(status) {
          const labels = { pending_review: "Pendente", approved: "Aprovada", edited: "Editada", rejected: "Rejeitada", expired: "Expirada", resolved: "Resolvida" };
          return labels[status] || status;
        }
        function formatTarget(kind) {
          const labels = { transaction: "Lançamento", import_suggestion: "Lançamento em revisão", category: "Categoria", account: "Conta", card: "Cartão", financial_profile: "Perfil financeiro", period: "Período" };
          return labels[kind] || "Item financeiro";
        }
        function formatDate(value) {
          if (!value) return "—";
          const date = new Date(String(value).slice(0, 10) + "T12:00:00Z");
          return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
        }
        function formatMoney(minor, currency) {
          if (typeof currency !== "string" || !currency.trim()) return "Moeda indisponível";
          try {
            return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(minor || 0) / 100);
          } catch {
            return "Moeda indisponível";
          }
        }
        function categoryName(id) {
          if (!id) return "Sem categoria";
          return state.categories.find((category) => category.id === id)?.name || "Categoria indisponível";
        }
        function accountName(id) {
          if (!id) return "Conta não definida";
          return state.accounts.find((account) => account.id === id)?.name || "Conta indisponível";
        }
        function isTemporaryUnavailable(error) {
          const statusCode = Number(error?.statusCode || 0);
          const code = String(error?.code || "").toUpperCase();
          return [408, 425, 429, 502, 503, 504].includes(statusCode) ||
            /(?:TEMPORAR|TIMEOUT|RATE_LIMIT|UNAVAILABLE|OVERLOADED)/.test(code);
        }
        function unavailableMessage() {
          return "Fila temporariamente indisponível. Tente novamente em instantes.";
        }
        function errorMessage(error) {
          return isTemporaryUnavailable(error) ? unavailableMessage() : error.message;
        }
        async function api(path, options) {
          const response = await fetch(appendProfile(path), options);
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            const error = new Error(body?.error?.message || "Não foi possível concluir a ação.");
            error.code = body?.error?.code;
            error.statusCode = response.status;
            throw error;
          }
          return body;
        }
        function syncUrl() {
          const url = new URL(window.location.href);
          const values = [
            ["kind", kindFilter.value, "all"],
            ["status", statusFilter.value, "pending_review"],
            ["confidence", confidenceFilter.value, "all"]
          ];
          values.forEach(([key, value, defaultValue]) => {
            if (value === defaultValue) url.searchParams.delete(key);
            else url.searchParams.set(key, value);
          });
          window.history.replaceState({}, "", url.pathname + url.search + url.hash);
        }
        function isSnoozed(item) {
          return Boolean(item.snoozedUntil) && new Date(item.snoozedUntil).getTime() > Date.now();
        }
        function matches(item) {
          if (kindFilter.value !== "all" && item.kind !== kindFilter.value) return false;
          if (statusFilter.value !== "all" && item.status !== statusFilter.value) return false;
          if (statusFilter.value === "pending_review" && isSnoozed(item)) return false;
          if (confidenceFilter.value === "low" && item.risk !== "low_confidence") return false;
          if (confidenceFilter.value === "normal" && item.risk === "low_confidence") return false;
          return true;
        }
        function queueStatus(message, kind, retry) {
          let status = section.querySelector("[data-review-queue-status]");
          if (!status) {
            status = document.createElement("div");
            status.setAttribute("data-review-queue-status", "");
            status.setAttribute("aria-live", "polite");
            filterBar.insertAdjacentElement("afterend", status);
          }
          const urgent = kind === "error" || kind === "unavailable";
          status.setAttribute("role", urgent ? "alert" : "status");
          status.className = "review-queue-status " + (kind || "muted");
          status.innerHTML = '<span>' + escapeHtml(message) + '</span>' + (retry ? ' <button type="button" class="secondary-button" data-review-retry>Tentar novamente</button>' : "");
          status.querySelector("[data-review-retry]")?.addEventListener("click", loadQueue);
        }
        function render() {
          const visible = state.items.filter(matches);
          if (count) count.textContent = visible.length + " item(ns)";
          if (!rows) return;
          if (!visible.length) {
            state.selectedId = null;
            rows.innerHTML = '<div class="empty-state"><strong>Nenhuma sugestão neste filtro.</strong><p class="muted">Altere os filtros ou atualize a fila.</p></div>';
            renderSelected();
            return;
          }
          if (!visible.some((item) => item.id === state.selectedId)) state.selectedId = visible[0].id;
          rows.innerHTML = visible.map((item) => {
            const chosen = item.id === state.selectedId;
            const low = item.risk === "low_confidence" ? '<span class="sf-badge review-risk" data-tone="attention">Baixa confiança</span>' : "";
            return '<article class="maintenance-item review-card' + (chosen ? ' selected' : '') + '" data-review-id="' + escapeHtml(item.id) + '" data-review-kind="' + escapeHtml(item.kind) + '">' +
              '<div class="maintenance-summary"><div><strong>' + escapeHtml(formatKind(item.kind)) + '</strong>' +
              '<span>' + escapeHtml(formatStatus(item.status)) + ' · origem ' + escapeHtml(formatOrigin(item.origin)) + ' · confiança ' + escapeHtml(Math.round(Number(item.confidence) * 100)) + '%</span></div>' + low + '</div>' +
              '<p class="review-card-summary">' + escapeHtml(item.maskedSummary) + '</p>' +
              '<button type="button" class="secondary-button" data-button-variant="neutral" data-review-select="' + escapeHtml(item.id) + '" aria-controls="inbox-review-selected" aria-pressed="' + chosen + '">' + (chosen ? "Em revisão" : "Revisar") + '</button>' +
              '</article>';
          }).join("");
          bindRows();
          renderSelected();
        }
        function selectItem(id) {
          if (!state.items.some((item) => item.id === id) || id === state.selectedId) return;
          state.selectedId = id;
          rows.querySelectorAll("[data-review-select]").forEach((button) => {
            const chosen = button.dataset.reviewSelect === id;
            button.setAttribute("aria-pressed", String(chosen));
            button.textContent = chosen ? "Em revisão" : "Revisar";
            button.closest(".review-card")?.classList.toggle("selected", chosen);
          });
          renderSelected();
          if (window.matchMedia("(max-width: 900px)").matches) {
            document.getElementById("inbox-review-detail-title")?.scrollIntoView({ block: "start", behavior: "auto" });
          }
        }
        async function loadQueue() {
          queueStatus("Carregando sugestões...", "muted", false);
          try {
            const [queue, accounts, categories] = await Promise.all([
              api("/api/ai-review-queue?status=all&includeLowConfidence=true"),
              api("/api/accounts").catch(() => ({ accounts: [] })),
              api("/api/categories?status=all").catch(() => ({ categories: [] }))
            ]);
            state.items = queue.suggestions || [];
            state.accounts = accounts.accounts || [];
            state.categories = categories.categories || [];
            state.details.clear();
            render();
            queueStatus("Fila atualizada.", "muted", false);
          } catch (error) {
            const unavailable = isTemporaryUnavailable(error);
            queueStatus(errorMessage(error), unavailable ? "unavailable" : "error", true);
            invalidateSelection("A fila não pôde ser atualizada. Recarregue-a antes de tomar qualquer decisão.");
          }
        }
        async function detailFor(id, force) {
          if (!force && state.details.has(id)) return state.details.get(id);
          const detail = await api("/api/ai-review-queue/" + encodeURIComponent(id) + "/payload");
          state.details.set(id, detail);
          return detail;
        }
        function detailHtml(detail) {
          const payload = detail.payload || {};
          const proposal = payload.proposal || {};
          const reasons = (payload.reasons || []).map((reason) => '<li>' + escapeHtml(reason) + '</li>').join("");
          let body = '<dl class="review-detail-grid"><div><dt>Tipo</dt><dd>' + escapeHtml(formatKind(payload.suggestionKind)) + '</dd></div>' +
            '<div><dt>Alvo</dt><dd>' + escapeHtml(formatTarget(payload.target?.entityKind)) + '</dd></div>' +
            '<div><dt>Confiança</dt><dd>' + escapeHtml(Math.round(Number(payload.confidence || 0) * 100)) + '%</dd></div></dl>';
          if (payload.suggestionKind === "transaction_extraction") {
            body += '<dl class="review-detail-grid"><div><dt>Data</dt><dd>' + escapeHtml(formatDate(proposal.occurredOn)) + '</dd></div>' +
              '<div><dt>Valor</dt><dd class="review-money-value">' + escapeHtml(formatMoney(proposal.amountMinor, proposal.currency)) + '</dd></div>' +
              '<div><dt>Conta</dt><dd>' + escapeHtml(accountName(proposal.accountId)) + '</dd></div>' +
              '<div><dt>Categoria</dt><dd>' + escapeHtml(categoryName(proposal.categoryId)) + '</dd></div></dl>' +
              '<p><strong>' + escapeHtml(proposal.description || "Sem descrição") + '</strong></p>';
          } else if (payload.suggestionKind === "categorization") {
            body += '<p><strong>Categoria proposta:</strong> ' + escapeHtml(categoryName(proposal.proposedCategoryId)) + '</p>';
          } else if (payload.suggestionKind === "deduplication" || payload.suggestionKind === "reconciliation") {
            body += (proposal.conflicts || []).length
              ? '<div class="review-warning"><strong>Conflitos</strong><ul>' + proposal.conflicts.map((item) => '<li>' + escapeHtml(item) + '</li>').join("") + '</ul></div>'
              : '<p class="muted">Nenhum conflito estrutural informado.</p>';
          } else if (payload.suggestionKind === "insight") {
            if (typeof window.__solverfinInboxRenderInsight !== "function") {
              throw new Error("Evidência do insight indisponível para revisão.");
            }
            body += window.__solverfinInboxRenderInsight(payload);
          }
          if (reasons) body += '<details><summary>Por que esta sugestão?</summary><ul>' + reasons + '</ul></details>';
          return body;
        }
        function reviewedEvidenceIsVisible(id) {
          if (!selected || state.selectedId !== id || selected.dataset.reviewSelectedId !== id || selected.dataset.reviewEvidenceState !== "ready" || !selected.dataset.reviewFingerprint) return false;
          const evidence = selected.querySelector('[data-review-evidence="ready"]'); if (!evidence || !evidence.isConnected || evidence.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
          if (evidence.checkVisibility && !evidence.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
          for (let node = evidence; node; node = node.parentElement) {
            const css = window.getComputedStyle(node), rect = node.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0 || css.display === "none" || css.visibility !== "visible" ||
              Number(css.opacity) <= 0.01 || css.contentVisibility === "hidden" || css.clipPath !== "none" ||
              css.maskImage !== "none" || css.webkitMaskImage !== "none") return false;
          }
          return true;
        }
        // The category-learning dialog shares the selected evidence guard, never owns an alternate approval path.
        window.__solverfinInboxReviewGuard = reviewedEvidenceIsVisible;
        window.__solverfinInboxInvalidateReview = (id, message) => {
          if (state.selectedId === id) invalidateSelection(message);
        };
        function invalidateSelection(message) {
          selectionGeneration += 1;
          if (!selected) return;
          delete selected.dataset.reviewSelectedId;
          delete selected.dataset.reviewFingerprint;
`;
}
