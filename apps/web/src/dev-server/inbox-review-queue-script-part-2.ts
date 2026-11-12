export function inboxReviewQueueScriptPartTwo(): string {
  return `          selected.dataset.reviewEvidenceState = "unavailable";
          selected.innerHTML = '<div class="review-selected-error"><p class="error" role="alert">' + escapeHtml(message) + '</p>' +
            '<button type="button" class="secondary-button" data-review-evidence-retry>Tentar novamente</button></div>';
          selected.querySelector("[data-review-evidence-retry]")?.addEventListener("click", () => {
            if (state.selectedId) renderSelected();
            else loadQueue();
          });
        }
        async function renderSelected() {
          const generation = ++selectionGeneration;
          if (!selected) return;
          const id = state.selectedId;
          const item = state.items.find((entry) => entry.id === id);
          if (!id || !item) {
            delete selected.dataset.reviewSelectedId;
            delete selected.dataset.reviewFingerprint;
            selected.dataset.reviewEvidenceState = "empty";
            selected.innerHTML = '<p class="muted small-note" role="status">Nenhuma sugestão selecionada. A fila pode estar vazia ou filtrada.</p>';
            return;
          }
          delete selected.dataset.reviewSelectedId;
          delete selected.dataset.reviewFingerprint;
          selected.dataset.reviewEvidenceState = "loading";
          selected.innerHTML = '<p class="muted small-note" role="status">Consultando a origem e a evidência atual da sugestão...</p>';
          try {
            const detail = await detailFor(id, true);
            if (generation !== selectionGeneration || state.selectedId !== id) return;
            if (!detail?.payload || typeof detail.payload.fingerprint !== "string" || !detail.payload.fingerprint || !detail.payload.suggestionKind) {
              throw new Error("A evidência atual não está completa. Não é possível decidir.");
            }
            const pending = item.status === "pending_review";
            const editable = pending && (item.kind === "transaction_extraction" || item.kind === "categorization");
            const buttons = '<button type="button" class="secondary-button" data-review-details="' + escapeHtml(id) + '">Ver detalhes</button>' +
              (editable ? '<button type="button" class="secondary-button" data-review-edit="' + escapeHtml(id) + '" data-review-kind="' + escapeHtml(item.kind) + '">Editar</button>' : "") +
              (pending ? '<button type="button" data-review-approve="' + escapeHtml(id) + '">Aprovar</button>' +
                '<button type="button" class="secondary-button danger-action" data-review-reject="' + escapeHtml(id) + '">Rejeitar</button>' : "");
            const confidence = Math.round(Number(item.confidence) * 100);
            const risk = item.risk === "low_confidence" ? "Baixa confiança" : item.risk === "normal" ? "Regular" : item.risk === "high" ? "Elevado" : "Não informado";
            selected.dataset.reviewSelectedId = id;
            selected.dataset.reviewFingerprint = detail.payload.fingerprint;
            selected.dataset.reviewEvidenceState = "ready";
            selected.innerHTML = '<div class="review-selected-context">' +
              '<strong>' + escapeHtml(formatKind(item.kind)) + '</strong>' +
              '<p class="review-evidence-meta">Estado: ' + escapeHtml(formatStatus(item.status)) +
              ' · Origem: ' + escapeHtml(formatOrigin(item.origin)) +
              ' · Confiança: ' + escapeHtml(confidence) + '% · Risco: ' + escapeHtml(risk) + '</p>' +
              '<p>' + escapeHtml(item.maskedSummary) + '</p>' +
              '<p class="muted small-note">' + escapeHtml(item.explanation) + '</p></div>' +
              '<section data-review-evidence="ready"' + (item.kind === "insight" ? ' data-ai-structured-payload="true"' : "") + ' aria-label="Evidência verificada da sugestão">' +
                '<h3>Origem e evidências da decisão</h3>' + detailHtml(detail) + '</section>' +
              '<div class="review-decision-actions" aria-label="Ações da sugestão selecionada">' + buttons + '</div>' +
              (pending ? '<p class="muted small-note">Confira as evidências acima. A confirmação será solicitada antes de qualquer efeito.</p>' : '<p class="muted small-note">Esta sugestão não está mais pendente e não admite nova decisão.</p>') +
              '<p class="form-status muted" data-review-row-status aria-live="polite"></p>';
            selected.querySelector("[data-review-details]")?.addEventListener("click", (event) => openDetails(id, event.currentTarget));
            selected.querySelector("[data-review-edit]")?.addEventListener("click", (event) => openEdit(id, event.currentTarget));
            selected.querySelector("[data-review-approve]")?.addEventListener("click", (event) => decide(id, "approve", event.currentTarget));
            selected.querySelector("[data-review-reject]")?.addEventListener("click", (event) => decide(id, "reject", event.currentTarget));
            window.dispatchEvent(new Event("solverfin:inbox-review-selected"));
          } catch (error) {
            if (generation !== selectionGeneration || state.selectedId !== id) return;
            invalidateSelection("Evidência indisponível ou desatualizada. Decisão bloqueada. " + errorMessage(error));
          }
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
        function requireReviewedEditEvidence(id, fingerprint, generation) {
          if (generation === selectionGeneration && reviewedEvidenceIsVisible(id) &&
            selected.dataset.reviewFingerprint === fingerprint) return;
          if (generation === selectionGeneration && state.selectedId === id) {
            invalidateSelection("A evidência mudou. Consulte a nova versão antes de editar.");
          }
          throw new Error("A evidência selecionada não está disponível ou mudou. Atualize a revisão antes de salvar.");
        }
        window.__solverfinInboxEditEvidence = Object.freeze({ capture: (id) => reviewedEvidenceIsVisible(id) ? Object.freeze({ id, fingerprint: selected.dataset.reviewFingerprint, generation: selectionGeneration }) : null,
          require: (reviewed) => requireReviewedEditEvidence(reviewed.id, reviewed.fingerprint, reviewed.generation) });
        async function openEdit(id, trigger) {
          if (!reviewedEvidenceIsVisible(id)) return;
          const reviewedFingerprint = selected.dataset.reviewFingerprint;
          const reviewedGeneration = selectionGeneration;
          state.trigger = trigger;
          dialogBody.innerHTML = '<p class="muted" role="status">Carregando campos editáveis...</p>';
          dialog.showModal();
          try {
            const detail = await detailFor(id, true);
            if (!dialog.open) return;
            requireReviewedEditEvidence(id, reviewedFingerprint, reviewedGeneration);
            if (detail?.payload?.fingerprint !== reviewedFingerprint) {
              invalidateSelection("A evidência mudou. Consulte a nova versão antes de editar.");
              throw new Error("A versão consultada não corresponde à evidência revisada.");
            }
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
            bindEditForm(detail, { id, fingerprint: reviewedFingerprint, generation: reviewedGeneration });
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
        function bindEditForm(detail, reviewed) {
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
              if (!dialog.open || !form.isConnected) throw new Error("A edição foi cancelada.");
              requireReviewedEditEvidence(reviewed.id, reviewed.fingerprint, reviewed.generation);
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
              const fresh = await detailFor(reviewed.id, true);
              if (!dialog.open || !form.isConnected) throw new Error("A edição foi cancelada.");
              requireReviewedEditEvidence(reviewed.id, reviewed.fingerprint, reviewed.generation);
              if (fresh?.payload?.fingerprint !== reviewed.fingerprint) {
                invalidateSelection("A evidência mudou. Consulte a nova versão antes de editar.");
                throw new Error("A evidência foi atualizada. Revise novamente antes de salvar.");
              }
              await api("/api/ai-review-queue/" + encodeURIComponent(reviewed.id) + "/edit", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ expectedFingerprint: reviewed.fingerprint, payload })
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
          const card = button.closest(".inbox-review-selected");
          if (card !== selected || !reviewedEvidenceIsVisible(id)) return;
          const reviewedFingerprint = selected.dataset.reviewFingerprint;
          const reviewedGeneration = selectionGeneration;
          const status = card.querySelector("[data-review-row-status]");
          if (action === "reject" && !window.confirm("Rejeitar esta sugestão?")) return;
          if (action === "approve" && !window.confirm("Aprovar esta sugestão e aplicar o efeito indicado?")) return;
          button.disabled = true;
          if (status) { status.className = "form-status muted"; status.textContent = "Validando versão atual..."; }
          let detail;
          try {
            detail = await detailFor(id, true);
            if (!detail?.payload || typeof detail.payload.fingerprint !== "string" || !detail.payload.fingerprint) {
              throw new Error("Evidência atual incompleta.");
            }
          } catch (error) {
            if (state.selectedId === id && selectionGeneration === reviewedGeneration) {
              invalidateSelection("Não foi possível validar a evidência atual. Decisão bloqueada. " + errorMessage(error));
            }
            return;
          }
          if (selectionGeneration !== reviewedGeneration || !reviewedEvidenceIsVisible(id) ||
            selected.dataset.reviewFingerprint !== reviewedFingerprint) return;
          if (detail.payload.fingerprint !== reviewedFingerprint) {
            invalidateSelection("A evidência mudou desde a revisão. Consulte a nova versão antes de confirmar.");
            return;
          }
          try {
            if (status) status.textContent = action === "approve" ? "Aplicando decisão..." : "Registrando rejeição...";
            await api("/api/ai-review-queue/" + encodeURIComponent(id) + "/" + action, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ expectedFingerprint: reviewedFingerprint })
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
          rows?.querySelectorAll("[data-review-select]").forEach((button) => button.addEventListener("click", () => selectItem(button.dataset.reviewSelect)));
        }
        [kindFilter, statusFilter, confidenceFilter].forEach((filter) => filter.addEventListener("change", () => { syncUrl(); render(); }));
        filterBar.querySelector("[data-review-refresh]").addEventListener("click", loadQueue);
        dialog.addEventListener("close", () => { state.trigger?.focus?.(); state.trigger = null; });
        loadQueue();
      })();
    </script>`;
}
