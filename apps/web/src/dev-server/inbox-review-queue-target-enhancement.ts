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
        const reviewKinds = new Map();
        let correctionSuggestionId;
        let typedEditTrigger;

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
        async function refreshReviewKinds() {
          const queue = await api("/api/ai-review-queue?status=all&includeLowConfidence=true");
          reviewKinds.clear();
          (queue.suggestions || []).forEach((item) => reviewKinds.set(item.id, item.kind));
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
        async function resolveCategorizationTargetKind(payload) {
          const proposal = payload?.proposal || {};
          if (proposal.targetTransactionId) {
            const target = await api("/api/transactions/" + encodeURIComponent(proposal.targetTransactionId));
            return target.transaction?.kind;
          }
          if (proposal.targetEntityId) {
            const source = await api("/api/ai-review-queue/" + encodeURIComponent(proposal.targetEntityId) + "/payload");
            if (source.payload?.suggestionKind === "transaction_extraction") {
              return source.payload.proposal?.kind;
            }
          }
          return undefined;
        }
        async function openTypedCategorizationEdit(suggestionId, trigger) {
          typedEditTrigger = trigger;
          dialogBody.innerHTML = '<p class="muted" role="status">Carregando campos editáveis...</p>';
          dialog.showModal();
          try {
            const [detail, categoriesBody] = await Promise.all([
              api("/api/ai-review-queue/" + encodeURIComponent(suggestionId) + "/payload"),
              api("/api/categories?status=all")
            ]);
            const targetKind = await resolveCategorizationTargetKind(detail.payload);
            const proposal = detail.payload?.proposal || {};
            const candidates = (categoriesBody.categories || []).filter((category) =>
              category.status === "active" && (!targetKind || category.kind === targetKind)
            );
            dialogBody.innerHTML = '<form data-review-edit-form data-review-kind="categorization" data-review-id="' + escapeHtml(suggestionId) + '">' +
              '<label>Categoria<select name="proposedCategoryId" required><option value="">Selecione</option>' +
              candidates.map((category) => '<option value="' + escapeHtml(category.id) + '" ' + (proposal.proposedCategoryId === category.id ? "selected" : "") + '>' + escapeHtml(category.name) + '</option>').join("") +
              '</select></label>' +
              '<p class="form-status muted" data-edit-status aria-live="polite">A alteração será salva para nova revisão antes da decisão.</p>' +
              '<button type="submit">Salvar edição</button></form>';
            const form = dialogBody.querySelector("[data-review-edit-form]");
            const status = form.querySelector("[data-edit-status]");
            const submit = form.querySelector('button[type="submit"]');
            form.addEventListener("submit", async (event) => {
              event.preventDefault();
              submit.disabled = true;
              status.className = "form-status muted";
              status.textContent = "Salvando edição...";
              try {
                await api("/api/ai-review-queue/" + encodeURIComponent(suggestionId) + "/edit", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    expectedFingerprint: detail.payload.fingerprint,
                    payload: { proposedCategoryId: form.elements.proposedCategoryId.value }
                  })
                });
                dialog.close();
                window.location.reload();
              } catch (error) {
                status.className = "form-status error";
                status.textContent = error.message;
                submit.disabled = false;
              }
            });
            form.elements.proposedCategoryId.focus();
          } catch (error) {
            dialogBody.innerHTML = '<p class="error" role="alert">' + escapeHtml(error.message) + '</p>';
          }
        }
        async function waitForEditForm(suggestionId, timeoutMs = 2000) {
          const started = Date.now();
          while (Date.now() - started < timeoutMs) {
            const form = dialogBody.querySelector('[data-review-edit-form][data-review-id="' + CSS.escape(suggestionId) + '"]');
            if (form) return form;
            await new Promise((resolve) => window.setTimeout(resolve, 40));
          }
          return undefined;
        }
        async function bindTransferAccountGuard(suggestionId) {
          try {
            const [detail, accountsBody] = await Promise.all([
              api("/api/ai-review-queue/" + encodeURIComponent(suggestionId) + "/payload"),
              api("/api/accounts")
            ]);
            if (detail.payload?.suggestionKind !== "transaction_extraction") return;
            const form = await waitForEditForm(suggestionId);
            if (!form || form.dataset.transferAccountGuard === "true") return;
            form.dataset.transferAccountGuard = "true";
            const currency = detail.payload.proposal?.currency;
            const accounts = accountsBody.accounts || [];
            const refreshOtherAccount = () => {
              const otherSelect = form.elements.otherAccountId;
              if (!otherSelect) return;
              const selectedAccountId = form.elements.accountId.value;
              const selectedOtherId = otherSelect.value;
              const eligible = accounts.filter((account) =>
                account.status === "active" && account.id !== selectedAccountId && (!currency || account.currency === currency)
              );
              otherSelect.replaceChildren(new Option("Selecione", ""));
              eligible.forEach((account) => otherSelect.add(new Option(account.name, account.id)));
              otherSelect.value = eligible.some((account) => account.id === selectedOtherId) ? selectedOtherId : "";
            };
            form.elements.accountId.addEventListener("change", refreshOtherAccount);
            form.elements.kind.addEventListener("change", refreshOtherAccount);
            refreshOtherAccount();
          } catch {
            // O backend continua sendo a validação autoritativa se dados auxiliares falharem.
          }
        }
        function inferredReviewKind(button, suggestionId) {
          const known = reviewKinds.get(suggestionId);
          if (known) return known;
          const label = button.closest("[data-review-id]")?.querySelector(".maintenance-summary strong")?.textContent?.trim();
          return label === "Categorização" ? "categorization" : "transaction_extraction";
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

          const editButton = event.target?.closest?.("[data-review-edit]");
          const editSuggestionId = editButton?.dataset?.reviewEdit;
          if (editButton && editSuggestionId) {
            const kind = inferredReviewKind(editButton, editSuggestionId);
            if (kind === "categorization") {
              event.preventDefault();
              event.stopImmediatePropagation();
              void openTypedCategorizationEdit(editSuggestionId, editButton);
              return;
            }
            void bindTransferAccountGuard(editSuggestionId);
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
          if (typedEditTrigger?.isConnected) typedEditTrigger.focus();
          typedEditTrigger = undefined;
        });
        void refreshReviewKinds().catch(() => undefined);
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
