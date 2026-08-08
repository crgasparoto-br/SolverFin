export function enhanceInboxReviewQueue(html: string): string {
  if (!html.includes("Outras sugestões")) return html;
  if (html.includes("data-ai-review-queue-enhanced")) return html;

  const dialog = `
    <dialog id="ai-review-dialog" class="master-dialog ai-review-dialog" aria-labelledby="ai-review-dialog-title">
      <div class="dialog-heading">
        <p class="eyebrow">Fila de revisão</p>
        <h2 id="ai-review-dialog-title">Revisar sugestão</h2>
      </div>
      <div id="ai-review-dialog-body" aria-live="polite"></div>
      <form method="dialog" class="dialog-actions">
        <button type="submit" class="secondary-button">Fechar</button>
      </form>
    </dialog>`;

  const script = `
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
        const state = { items: [], accounts: [], categories: [], details: new Map(), trigger: null };
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
            '<option value="expired">Expiradas</option><option value="all">Todos</option></select></label>' +
          '<label>Confiança<select data-review-filter="confidence">' +
            '<option value="all">Todas</option><option value="low">Baixa confiança</option>' +
            '<option value="normal">Normal</option></select></label>' +
          '<button type="button" class="secondary-button" data-review-refresh title="Atualizar fila">Atualizar</button>';
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
          const labels = { pending_review: "Pendente", approved: "Aprovada", edited: "Editada", rejected: "Rejeitada", expired: "Expirada" };
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
          return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(Number(minor || 0) / 100);
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
        function matches(item) {
          if (kindFilter.value !== "all" && item.kind !== kindFilter.value) return false;
          if (statusFilter.value !== "all" && item.status !== statusFilter.value) return false;
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
            rows.innerHTML = '<div class="empty-state"><strong>Nenhuma sugestão neste filtro.</strong><p class="muted">Altere os filtros ou atualize a fila.</p></div>';
            return;
          }
          rows.innerHTML = visible.map((item) => {
            const low = item.risk === "low_confidence" ? '<span class="review-risk">Baixa confiança</span>' : "";
            const pending = item.status === "pending_review";
            const edit = pending && (item.kind === "transaction_extraction" || item.kind === "categorization")
              ? '<button type="button" class="secondary-button" data-review-edit="' + escapeHtml(item.id) + '">Editar</button>'
              : "";
            const decision = pending
              ? '<button type="button" class="secondary-button" data-review-approve="' + escapeHtml(item.id) + '">Aprovar</button>' +
                '<button type="button" class="secondary-button danger-action" data-review-reject="' + escapeHtml(item.id) + '">Rejeitar</button>'
              : "";
            return '<article class="maintenance-item review-card" data-review-id="' + escapeHtml(item.id) + '">' +
              '<div class="maintenance-summary"><div><strong>' + escapeHtml(formatKind(item.kind)) + '</strong>' +
              '<span>' + escapeHtml(formatStatus(item.status)) + ' · origem ' + escapeHtml(formatOrigin(item.origin)) + ' · confiança ' + escapeHtml(Math.round(Number(item.confidence) * 100)) + '%</span></div>' + low + '</div>' +
              '<div class="message-preview"><p><strong>' + escapeHtml(item.maskedSummary) + '</strong></p><p>' + escapeHtml(item.explanation) + '</p></div>' +
              '<div class="maintenance-actions"><button type="button" class="secondary-button" data-review-details="' + escapeHtml(item.id) + '">Ver detalhes</button>' + edit + decision + '<p class="form-status muted" data-review-row-status aria-live="polite"></p></div>' +
              '</article>';
          }).join("");
          bindRows();
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
              '<div><dt>Valor</dt><dd>' + escapeHtml(formatMoney(proposal.amountMinor, proposal.currency)) + '</dd></div>' +
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
            body += '<h3>' + escapeHtml(proposal.title) + '</h3><p>' + escapeHtml(proposal.summary) + '</p>' +
              '<p class="muted">Período: ' + escapeHtml(formatDate(proposal.periodStartOn)) + ' a ' + escapeHtml(formatDate(proposal.periodEndOn)) + '</p>';
          }
          if (reasons) body += '<details><summary>Por que esta sugestão?</summary><ul>' + reasons + '</ul></details>';
          return body;
        }
        async function openDetails(id, trigger) {
          state.trigger = trigger;
          dialogBody.innerHTML = '<p class="muted" role="status">Carregando detalhes...</p>';
          dialog.showModal();
          try {
            const detail = await detailFor(id, true);
            dialogBody.innerHTML = detailHtml(detail);
          } catch (error) {
            const unavailable = isTemporaryUnavailable(error);
            dialogBody.innerHTML = '<p class="' + (unavailable ? "review-unavailable" : "error") + '" role="alert">' + escapeHtml(errorMessage(error)) + '</p>';
          }
        }
        function activeCategories(kind) {
          return state.categories.filter((category) => category.status === "active" && category.kind === kind);
        }
        function renderCategoryOptions(kind, selected) {
          return '<option value="">Selecione</option>' + activeCategories(kind).map((category) =>
            '<option value="' + escapeHtml(category.id) + '" ' + (selected === category.id ? "selected" : "") + '>' + escapeHtml(category.name) + '</option>'
          ).join("");
        }
        function renderAccountOptions(selected, currency, exclude) {
          return '<option value="">Selecione</option>' + state.accounts.filter((account) =>
            account.status === "active" && account.id !== exclude && (!currency || account.currency === currency)
          ).map((account) => '<option value="' + escapeHtml(account.id) + '" ' + (selected === account.id ? "selected" : "") + '>' + escapeHtml(account.name) + '</option>').join("");
        }
        async function openEdit(id, trigger) {
          state.trigger = trigger;
          dialogBody.innerHTML = '<p class="muted" role="status">Carregando campos editáveis...</p>';
          dialog.showModal();
          try {
            const detail = await detailFor(id, true);
            const payload = detail.payload;
            const proposal = payload.proposal || {};
            if (payload.suggestionKind === "categorization") {
              const targetKind = state.items.find((item) => item.id === id)?.maskedSummary?.toLowerCase().includes("receita") ? "income" : undefined;
              const candidates = targetKind ? activeCategories(targetKind) : state.categories.filter((category) => category.status === "active");
              dialogBody.innerHTML = '<form data-review-edit-form data-review-kind="categorization" data-review-id="' + escapeHtml(id) + '">' +
                '<label>Categoria<select name="proposedCategoryId" required><option value="">Selecione</option>' + candidates.map((category) => '<option value="' + escapeHtml(category.id) + '" ' + (proposal.proposedCategoryId === category.id ? "selected" : "") + '>' + escapeHtml(category.name) + '</option>').join("") + '</select></label>' +
                '<p class="form-status muted" data-edit-status aria-live="polite">A alteração será salva para nova revisão antes da decisão.</p>' +
                '<button type="submit">Salvar edição</button></form>';
            } else if (payload.suggestionKind === "transaction_extraction") {
              const amount = (Number(proposal.amountMinor || 0) / 100).toFixed(2).replace(".", ",");
              dialogBody.innerHTML = '<form data-review-edit-form data-review-kind="transaction_extraction" data-review-id="' + escapeHtml(id) + '" class="edit-grid">' +
                '<label>Data<input name="occurredOn" type="date" value="' + escapeHtml(proposal.occurredOn || "") + '" required></label>' +
                '<label>Tipo<select name="kind"><option value="expense">Despesa</option><option value="income">Receita</option><option value="transfer">Transferência</option></select></label>' +
                '<label>Valor<input name="amount" inputmode="decimal" value="' + escapeHtml(amount) + '" required></label>' +
                '<label class="full-span">Descrição<input name="description" value="' + escapeHtml(proposal.description || "") + '" required></label>' +
                '<label>Conta<select name="accountId" required>' + renderAccountOptions(proposal.accountId, proposal.currency) + '</select></label>' +
                '<label data-other-account>Outra conta<select name="otherAccountId">' + renderAccountOptions(proposal.otherAccountId, proposal.currency, proposal.accountId) + '</select></label>' +
                '<label>Categoria<select name="categoryId">' + renderCategoryOptions(proposal.kind, proposal.categoryId) + '</select></label>' +
                '<p class="form-status muted full-span" data-edit-status aria-live="polite">Revise os campos e salve antes de aprovar.</p>' +
                '<button type="submit" class="full-span">Salvar edição</button></form>';
              const form = dialogBody.querySelector("[data-review-edit-form]");
              form.elements.kind.value = proposal.kind;
              const refresh = () => {
                const kind = form.elements.kind.value;
                const other = form.querySelector("[data-other-account]");
                other.hidden = kind !== "transfer";
                form.elements.otherAccountId.required = kind === "transfer";
                const selectedCategory = form.elements.categoryId.value;
                form.elements.categoryId.innerHTML = renderCategoryOptions(kind, selectedCategory);
              };
              form.elements.kind.addEventListener("change", refresh);
              refresh();
            } else {
              throw new Error("Este tipo de sugestão não possui campos editáveis.");
            }
            bindEditForm(detail);
            dialogBody.querySelector("input, select, button")?.focus();
          } catch (error) {
            const unavailable = isTemporaryUnavailable(error);
            dialogBody.innerHTML = '<p class="' + (unavailable ? "review-unavailable" : "error") + '" role="alert">' + escapeHtml(errorMessage(error)) + '</p>';
          }
        }
        function parseAmountMinor(value) {
          const raw = String(value || "").trim().replace(/\\s/g, "");
          const normalized = raw.includes(",") ? raw.replace(/\\./g, "").replace(",", ".") : raw;
          const amount = Number(normalized);
          if (!Number.isFinite(amount) || amount <= 0) return undefined;
          return Math.round(amount * 100);
        }
        function bindEditForm(detail) {
          const form = dialogBody.querySelector("[data-review-edit-form]");
          if (!form) return;
          form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const status = form.querySelector("[data-edit-status]");
            const button = form.querySelector('button[type="submit"]');
            button.disabled = true;
            status.className = "form-status muted";
            status.textContent = "Salvando edição...";
            try {
              let payload;
              if (form.dataset.reviewKind === "categorization") {
                payload = { proposedCategoryId: form.elements.proposedCategoryId.value };
              } else {
                const amountMinor = parseAmountMinor(form.elements.amount.value);
                if (!amountMinor) throw new Error("Informe um valor válido.");
                payload = {
                  occurredOn: form.elements.occurredOn.value,
                  kind: form.elements.kind.value,
                  amountMinor,
                  description: form.elements.description.value,
                  accountId: form.elements.accountId.value,
                  ...(form.elements.categoryId.value ? { categoryId: form.elements.categoryId.value } : {}),
                  ...(form.elements.kind.value === "transfer" && form.elements.otherAccountId.value ? { otherAccountId: form.elements.otherAccountId.value } : {})
                };
              }
              await api("/api/ai-review-queue/" + encodeURIComponent(form.dataset.reviewId) + "/edit", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ expectedFingerprint: detail.payload.fingerprint, payload })
              });
              dialog.close();
              await loadQueue();
              queueStatus("Edição salva. Revise a versão atual antes de decidir.", "success", false);
            } catch (error) {
              const unavailable = isTemporaryUnavailable(error);
              status.className = "form-status " + (unavailable ? "unavailable" : "error");
              status.textContent = errorMessage(error);
              button.disabled = false;
            }
          });
        }
        async function decide(id, action, button) {
          const card = button.closest("[data-review-id]");
          const status = card?.querySelector("[data-review-row-status]");
          if (action === "reject" && !window.confirm("Rejeitar esta sugestão?")) return;
          if (action === "approve" && !window.confirm("Aprovar esta sugestão e aplicar o efeito indicado?")) return;
          button.disabled = true;
          if (status) { status.className = "form-status muted"; status.textContent = "Validando versão atual..."; }
          try {
            const detail = await detailFor(id, true);
            if (status) status.textContent = action === "approve" ? "Aplicando decisão..." : "Registrando rejeição...";
            await api("/api/ai-review-queue/" + encodeURIComponent(id) + "/" + action, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ expectedFingerprint: detail.payload.fingerprint })
            });
            await loadQueue();
            queueStatus(action === "approve" ? "Sugestão aprovada." : "Sugestão rejeitada.", "success", false);
          } catch (error) {
            const conflict = ["AI_SUGGESTION_PAYLOAD_CONFLICT", "AI_SUGGESTION_PAYLOAD_OBSOLETE", "AI_REVIEW_INVALID_TRANSITION", "AI_REVIEW_SOURCE_DISCARDED"].includes(error.code);
            const unavailable = isTemporaryUnavailable(error);
            if (status) {
              status.className = "form-status " + (unavailable ? "unavailable" : "error");
              status.textContent = conflict ? "Esta sugestão mudou. Atualize a fila antes de tentar novamente." : errorMessage(error);
            }
            button.disabled = false;
          }
        }
        function bindRows() {
          rows?.querySelectorAll("[data-review-details]").forEach((button) => button.addEventListener("click", () => openDetails(button.dataset.reviewDetails, button)));
          rows?.querySelectorAll("[data-review-edit]").forEach((button) => button.addEventListener("click", () => openEdit(button.dataset.reviewEdit, button)));
          rows?.querySelectorAll("[data-review-approve]").forEach((button) => button.addEventListener("click", () => decide(button.dataset.reviewApprove, "approve", button)));
          rows?.querySelectorAll("[data-review-reject]").forEach((button) => button.addEventListener("click", () => decide(button.dataset.reviewReject, "reject", button)));
        }
        [kindFilter, statusFilter, confidenceFilter].forEach((filter) => filter.addEventListener("change", () => { syncUrl(); render(); }));
        filterBar.querySelector("[data-review-refresh]").addEventListener("click", loadQueue);
        dialog.addEventListener("close", () => { state.trigger?.focus?.(); state.trigger = null; });
        loadQueue();
      })();
    </script>`;

  let enhanced = html.replace("</main>", `${dialog}\n</main>`);
  enhanced = enhanced.replace("<main", '<main data-ai-review-queue-enhanced="true"');
  enhanced = enhanced.replace(
    "</style>",
    `
      .review-filter-bar { align-items: end; display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 12px; }
      .review-filter-bar label { display: grid; font-size: 0.75rem; gap: 4px; min-width: 150px; }
      .review-queue-status { align-items: center; display: flex; flex-wrap: wrap; font-size: 0.8125rem; gap: 8px; margin: 0 0 10px; }
      .review-queue-status.error { color: var(--danger, #9f1239); }
      .review-queue-status.unavailable { background: #fff9e8; border: 1px solid #ead69b; border-radius: var(--radius); color: #7a4a00; padding: 8px 10px; }
      .review-queue-status.success { color: var(--success, #166534); }
      .form-status.unavailable, .review-unavailable { color: #7a4a00; }
      .review-card .maintenance-summary { align-items: center; display: flex; gap: 8px; justify-content: space-between; }
      .review-risk { background: #fff4d6; border: 1px solid #e7c66f; border-radius: 999px; font-size: 0.6875rem; font-weight: 700; padding: 3px 7px; }
      .ai-review-dialog { width: min(720px, calc(100vw - 24px)); }
      .ai-review-dialog #ai-review-dialog-body { display: grid; gap: 12px; max-height: min(70vh, 680px); overflow: auto; }
      .review-detail-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin: 0; }
      .review-detail-grid div { background: var(--surface-soft); border-radius: var(--radius); padding: 8px; }
      .review-detail-grid dt { color: var(--muted); font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; }
      .review-detail-grid dd { margin: 3px 0 0; overflow-wrap: anywhere; }
      .review-warning { background: #fff9e8; border: 1px solid #ead69b; border-radius: var(--radius); padding: 10px; }
      @media (max-width: 640px) {
        .review-filter-bar > * { flex: 1 1 100%; min-width: 0; width: 100%; }
        .review-card .maintenance-summary { align-items: flex-start; flex-direction: column; }
        .ai-review-dialog { margin: 12px auto; max-height: calc(100vh - 24px); }
      }
      @media (min-resolution: 1.5dppx) {
        .review-card, .review-filter-bar { min-width: 0; }
      }
    </style>`,
  );
  return enhanced.replace("</body>", `${script}\n</body>`);
}
