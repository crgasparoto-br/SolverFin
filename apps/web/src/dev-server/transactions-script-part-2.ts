import {
  statementAttemptKeyScript,
  statementSubmitPreparationScript,
  statementTransactionPostScript,
  statementResponseConfirmationScript,
  statementContinueSaveScript,
} from "./statement-save-flow-scripts.js";

export function statementClientScriptPart2(): string {
  return String.raw`
    const basePayload = (plannedOn, effectiveOn, amountMinor, description) => {
      const data = new FormData(form);
      const occurredOn = String(data.get("occurredOn") || "").trim();
      const status = String(data.get("status"));
      const normalizedPlannedOn = String(plannedOn || "").trim() || occurredOn;
      const explicitEffectiveOn = String(effectiveOn || "").trim(); const isCreate = (form.dataset.method || "POST") === "POST";
      const normalizedEffectiveOn = status === "posted" || status === "reconciled" ? (explicitEffectiveOn || (isCreate ? occurredOn : undefined)) : null;
      const result = { kind: String(data.get("kind")), amountMinor, occurredOn, plannedOn: normalizedPlannedOn, accountId: String(data.get("accountId")), description, status };
      if (normalizedEffectiveOn !== undefined) result.effectiveOn = normalizedEffectiveOn;
      const destinationAccountId = String(data.get("destinationAccountId") || ""); const categoryId = String(data.get("categoryId") || ""); const note = String(data.get("note") || "").trim();
      if (destinationAccountId && result.kind === "transfer") result.destinationAccountId = destinationAccountId;
      if (isCrossCurrencyTransfer()) result.destinationAmountMinor = moneyToMinor(data.get("destinationAmountMinor"));
      if (categoryId) result.categoryId = categoryId; if (note) result.note = note; return result;
    };
    const payload = () => { const data = new FormData(form); return basePayload(String(data.get("plannedOn") || ""), String(data.get("effectiveOn") || ""), moneyToMinor(data.get("amountMinor")), String(data.get("description") || "")); };
${statementAttemptKeyScript}
    document.querySelectorAll("[data-open-modal]").forEach((button) => button.addEventListener("click", () => { if (button.disabled) return; const attachmentWorkspace = modal.querySelector("[data-attachment-workspace]"); if (attachmentWorkspace) window.SolverFinAttachments?.resetPending(attachmentWorkspace); form.reset(); const continueButton = form.querySelector("[data-statement-save-continue]"); if (continueButton) continueButton.hidden = false; document.querySelector("[data-modal-title]").textContent = "Novo lançamento"; const today = currentLocalDate(); form.occurredOn.value = today; form.plannedOn.value = today; form.dataset.path = "/api/transactions"; form.dataset.method = "POST"; if (button.dataset.quickKind) form.kind.value = button.dataset.quickKind; form.querySelectorAll('.statement-save-actions button[type="submit"]').forEach((submitButton) => { submitButton.disabled = !accountCurrencies.get(sourceAccountId()); }); setStatus("posted"); syncFieldVisibility(); modal.showModal(); window.setTimeout(syncFieldVisibility, 0); }));
    document.querySelectorAll("[data-transaction]").forEach((node) => {
      const transaction = JSON.parse(node.textContent);
      if (transaction.accountRemuneration) remunerationIds.add(transaction.id);
      const hydrate = (selector, clone) => { const button = document.querySelector(selector + transaction.id + '"]'); if (!button) return; button.addEventListener("click", () => { form.reset(); form.dataset.path = clone ? "/api/transactions" : "/api/transactions/" + transaction.id; form.dataset.method = clone ? "POST" : "PATCH"; form.kind.value = transaction.kind; const rowSourceId = String(transaction.accountId || "");
      if (!rowSourceId || !accountCurrencies.get(rowSourceId)) return;
      form.accountId.value = rowSourceId;
      const accountDisplay = form.querySelector(".statement-entry-account input");
      if (accountDisplay) accountDisplay.value = accountLabels.get(rowSourceId) || "Conta indisponível";
      form.querySelectorAll('.statement-save-actions button[type="submit"]').forEach((submitButton) => { submitButton.disabled = false; });
      const continueButton = form.querySelector("[data-statement-save-continue]");
      if (continueButton) continueButton.hidden = !clone; form.amountMinor.value = minorToMoneyInput(transaction.amountMinor); form.occurredOn.value = transaction.occurredOn; form.plannedOn.value = transaction.plannedOn || transaction.occurredOn; form.effectiveOn.value = transaction.effectiveOn || ""; setStatus(transaction.status === "reconciled" ? "reconciled" : transaction.status === "posted" ? "posted" : "planned"); form.destinationAccountId.value = transaction.destinationAccountId || ""; if (destinationMoneyInput) { destinationMoneyInput.value = transaction.destinationAmountMinor ? minorToMoneyInput(transaction.destinationAmountMinor) : ""; destinationMoneyInput.dataset.currency = transaction.destinationCurrency || destinationCurrency(); } form.categoryId.value = transaction.categoryId || ""; form.description.value = clone ? "Cópia de " + transaction.description : transaction.description; const attachmentWorkspace = modal.querySelector("[data-attachment-workspace]"); if (attachmentWorkspace) { if (clone) window.SolverFinAttachments?.resetPending(attachmentWorkspace); else attachmentWorkspace.dataset.entityId = transaction.id; } document.querySelector("[data-modal-title]").textContent = clone ? "Clonar lançamento" : "Editar lançamento"; syncFieldVisibility(); modal.showModal(); window.setTimeout(syncFieldVisibility, 0); }); };
      hydrate('[data-edit="', false); hydrate('[data-clone="', true);
    });
    const positionActions = (details) => {
      const menu = details.querySelector(":scope > div");
      const summary = details.querySelector("summary");
      if (!menu || !summary) return;
      const rect = summary.getBoundingClientRect();
      menu.style.position = "fixed";
      menu.style.top = "0px";
      menu.style.left = "0px";
      const menuWidth = menu.offsetWidth;
      const menuHeight = menu.offsetHeight;
      const left = Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8);
      const fitsBelow = rect.bottom + 6 + menuHeight <= window.innerHeight - 8;
      const top = fitsBelow ? rect.bottom + 6 : Math.max(8, rect.top - menuHeight - 6);
      menu.style.left = left + "px";
      menu.style.top = top + "px";
    };
    const closeActions = () => document.querySelectorAll(".actions[open]").forEach((details) => details.removeAttribute("open"));
    document.querySelectorAll(".actions").forEach((details) => {
      const menu = details.querySelector(":scope > div");
      if (!menu) return;
      details.addEventListener("toggle", () => {
        if (!details.open) return;
        document.querySelectorAll(".actions[open]").forEach((other) => { if (other !== details) other.removeAttribute("open"); });
        positionActions(details);
      });
    });
    document.querySelectorAll(".actions-item").forEach((item) => item.addEventListener("click", closeActions));
    let actionsFrame = 0;
    const repositionActions = () => {
      if (actionsFrame) return;
      actionsFrame = window.requestAnimationFrame(() => { actionsFrame = 0; document.querySelectorAll(".actions[open]").forEach(positionActions); });
    };
    window.addEventListener("scroll", repositionActions, true);
    window.addEventListener("resize", repositionActions);
    document.addEventListener("click", (event) => {
      document.querySelectorAll(".actions[open]").forEach((details) => {
        if (!details.contains(event.target)) details.removeAttribute("open");
      });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      document.querySelectorAll(".actions[open]").forEach((details) => {
        const summary = details.querySelector("summary");
        details.removeAttribute("open");
        if (summary) summary.focus();
      });
    });
    document.addEventListener("click", (event) => {
      const target = event.target?.closest?.("[data-edit], [data-clone], [data-open-modal]");
      if (!target) return;
      const editId = target.getAttribute("data-edit");
      window.setTimeout(() => {
        if (editId && remunerationIds.has(editId)) lockRemunerationFields();
        else unlockRemunerationFields();
      }, 0);
    }, true);

    form.addEventListener("submit", async (event) => {
      event.preventDefault(); if (form.dataset.submitting === "true") return;
      if (!form.checkValidity()) { form.reportValidity(); return; }
${statementSubmitPreparationScript}
      let shouldReload = false;
      if (method === "POST" && mode === "single") form.dataset.saveAttempted = "true";
      try {
        let response;
        if (mode === "fixed" && method === "POST") {
          const item = payload(); response = await send("/api/recurrences", "POST", { frequency: form.frequency.value, interval: Math.max(1, Number(form.interval.value || 1)), startOn: item.plannedOn, endOn: form.endOn.value || undefined, amountMinor: item.amountMinor, description: item.description, kind: item.kind, accountId: item.accountId, destinationAccountId: item.destinationAccountId, categoryId: item.categoryId });
        } else if (mode === "installment" && method === "POST") {
          const data = new FormData(form); const item = payload(); const draft = { accountId: String(data.get("accountId")), destinationAccountId: String(data.get("destinationAccountId") || "") || null, categoryId: String(data.get("categoryId") || "") || null, kind: String(data.get("kind")), status: String(data.get("status")), description: String(data.get("description") || "").trim(), note: String(data.get("note") || "").trim() || null, plannedOn: item.plannedOn, effectiveOn: item.effectiveOn, amountMinor: moneyToMinor(data.get("amountMinor")), amountMode: String(data.get("installmentValueMode") || "per_installment"), totalInstallments: Math.max(2, Number(data.get("installments") || 2)), initialSequenceNumber: Math.max(1, Number(data.get("installmentStart") || 1)) }; response = await send("/api/installments", "POST", { ...draft, idempotencyKey: attemptKeyFor("/api/installments", draft) });
${statementTransactionPostScript}
        const created = response.ok && queuedFile && method === "POST" ? await response.clone().json().catch(() => ({})) : null;
${statementResponseConfirmationScript}
        statusNode.className = response.ok ? "form-status success full" : "form-status error full"; statusNode.textContent = await message(response);
        if (response.ok && queuedFile) {
          const linkedId = method === "POST" ? created?.transaction?.id : attachmentWorkspace?.dataset.entityId;
          if (!linkedId) { statusNode.className = "form-status error full"; statusNode.textContent = "Lançamento salvo, mas o identificador não foi retornado. Abra a edição para anexar o arquivo."; return; }
          if (method === "POST") {
            form.dataset.method = "PATCH"; form.dataset.path = "/api/transactions/" + encodeURIComponent(linkedId); document.querySelector("[data-modal-title]").textContent = "Editar lançamento";
          }
          try {
            await window.SolverFinAttachments.uploadPending(attachmentWorkspace, linkedId);
          } catch {
            statusNode.className = "form-status error full";
            statusNode.textContent = "Lançamento salvo, mas o anexo não foi enviado. Use Adicionar anexo para tentar novamente.";
            return;
          }
        }
${statementContinueSaveScript}
      } catch { statusNode.className = "form-status error full"; statusNode.textContent = "Não foi possível comunicar com o servidor. Verifique sua conexão e tente novamente."; }
      finally {
        delete form.dataset.submitting;
        form.removeAttribute("aria-busy");
        if (!shouldReload) submitButtons.forEach((button, index) => { button.disabled = previouslyDisabled[index]; });
      }
    });

    document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", async () => { if (button.dataset.confirm && !confirm(button.dataset.confirm)) return; const response = await send(button.dataset.path, button.dataset.method || "POST", button.dataset.payload ? JSON.parse(button.dataset.payload) : {}); if (response.ok) setTimeout(() => location.reload(), 300); }));


    // Reconcile from the status icon, with the same accessible neutral menu as Cards.
    const statementStatusControls = Array.from(document.querySelectorAll("[data-statement-status-control]"));
    const positionStatementStatus = (control) => {
      const menu = control.querySelector(".statement-status-menu");
      const summary = control.querySelector("summary");
      if (!menu || !summary) return;
      const rect = summary.getBoundingClientRect();
      menu.style.position = "fixed"; menu.style.left = "0px"; menu.style.top = "0px";
      const width = menu.offsetWidth; const height = menu.offsetHeight;
      menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + "px";
      menu.style.top = (rect.bottom + height + 6 < window.innerHeight
        ? rect.bottom + 6 : Math.max(8, rect.top - height - 6)) + "px";
    };
    const closeStatementStatuses = (except) => {
      statementStatusControls.forEach((control) => {
        if (control !== except && control.open) control.open = false;
      });
    };
    statementStatusControls.forEach((control) => control.addEventListener("toggle", () => {
      if (!control.open) return;
      closeStatementStatuses(control);
      closeActions();
      positionStatementStatus(control);
    }));
    const syncStatementMenus = () => statementStatusControls.forEach((control) => {
      if (control.open) positionStatementStatus(control);
    });
    window.addEventListener("scroll", syncStatementMenus, true);
    window.addEventListener("resize", syncStatementMenus);
    document.addEventListener("click", (event) => {
      statementStatusControls.forEach((control) => {
        if (control.open && !control.contains(event.target)) control.open = false;
      });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      statementStatusControls.forEach((control) => {
        if (!control.open) return;
        control.open = false;
        control.querySelector("summary")?.focus();
      });
    });
    document.querySelectorAll("[data-set-statement-status]").forEach((button) => {
      button.addEventListener("click", async () => {
        const control = button.closest("[data-statement-status-control]");
        const feedback = control?.querySelector(".statement-status-feedback");
        const feedbackMessage = feedback?.querySelector("[data-statement-status-feedback-message]");
        const transactionId = button.dataset.statusTransactionId;
        const nextStatus = button.dataset.setStatementStatus;
        if (!control || !feedback || !feedbackMessage || !transactionId || !["posted", "reconciled"].includes(nextStatus)) return;
        const showStatusFeedback = (text, tone) => {
          feedback.hidden = false;
          feedback.className = "statement-status-feedback" + (tone ? " " + tone : "");
          feedbackMessage.textContent = text;
          feedback.title = text;
          feedback.dataset.tooltip = text;
          positionStatementStatus(control);
        };
        const buttons = Array.from(control.querySelectorAll("[data-set-statement-status]"));
        buttons.forEach((item) => { item.disabled = true; });
        showStatusFeedback("Atualizando situação...", "");
        try {
          // PATCH is status-only: no amount, currency, account or date fields.
          const response = await send("/api/transactions/" + encodeURIComponent(transactionId), "PATCH", { status: nextStatus });
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            showStatusFeedback(body?.error?.message || "Não foi possível alterar a situação.", "error");
            buttons.forEach((item) => { item.disabled = false; });
            return;
          }
          showStatusFeedback("Situação atualizada. Atualizando extrato...", "success");
          window.setTimeout(() => location.reload(), 350);
        } catch {
          showStatusFeedback("Falha de conexão. Tente novamente.", "error");
          buttons.forEach((item) => { item.disabled = false; });
        }
      });
    });

    const groupModal = document.querySelector("[data-group-modal]"); const groupForm = document.querySelector("[data-group-form]"); const selectionBar = document.querySelector("[data-selection-bar]"); const selectable = Array.from(document.querySelectorAll("[data-select-transaction]")); const groupOpen = document.querySelector("[data-group-open]");
    const selected = () => selectable.filter((input) => input.checked);
    const compatible = (items) => items.length >= 2 && (items[0]?.dataset.kind === "income" || items[0]?.dataset.kind === "expense") && /^[A-Z]{3}$/.test(items[0]?.dataset.currency || "") && items.every((item) => item.dataset.kind === items[0].dataset.kind && item.dataset.status === items[0].dataset.status && item.dataset.currency === items[0].dataset.currency);
    const syncSelection = () => { const items = selected(); selectionBar.hidden = items.length === 0; selectionBar.querySelector("[data-selection-count]").textContent = String(items.length); selectionBar.querySelector("[data-selection-total]").textContent = money(items.reduce((sum, item) => sum + Number(item.dataset.amount), 0), items[0]?.dataset.currency || statementCurrency); groupOpen.disabled = !compatible(items); };
    selectable.forEach((input) => input.addEventListener("change", syncSelection)); document.querySelector("[data-selection-clear]")?.addEventListener("click", () => { selectable.forEach((input) => input.checked = false); syncSelection(); }); document.querySelectorAll("[data-group-close]").forEach((button) => button.addEventListener("click", () => groupModal.close()));
    const safeText = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    const memberMarkup = (item, currencyCode, original) => { const date = original ? (item.effectiveOn || item.plannedOn || item.occurredOn) : item.dataset.date; const description = original ? item.description : item.dataset.description; const category = original ? (item.categoryName || "Sem categoria") : item.dataset.category; const status = original ? item.status : item.dataset.status; const amount = original ? (item.kind === "expense" ? -1 : 1) * item.amountMinor : Number(item.dataset.amount); return "<div><span>" + [date, description, category, status].map(safeText).join(" · ") + "</span><strong>" + safeText(money(amount, currencyCode)) + "</strong></div>"; };
    groupOpen?.addEventListener("click", () => { const items = selected(); if (!compatible(items)) return; groupForm.reset(); groupForm.dataset.mode = "create"; groupForm.dataset.groupId = ""; groupForm.description.readOnly = false; groupForm.displayOn.readOnly = false; groupForm.displayOn.value = items.map((item) => item.dataset.date).sort().at(-1); groupForm.querySelector("[data-group-summary]").textContent = items[0].dataset.kind + " · " + items[0].dataset.status + " · " + items[0].dataset.currency + " · " + money(items.reduce((sum, item) => sum + Math.abs(Number(item.dataset.amount)), 0), items[0].dataset.currency); groupForm.querySelector("[data-group-members]").innerHTML = items.map((item) => memberMarkup(item, items[0].dataset.currency, false)).join(""); groupForm.querySelector('[type="submit"]').hidden = false; groupForm.querySelector("[data-group-ungroup]").hidden = true; document.querySelector("[data-group-title]").textContent = "Unificar lançamentos"; groupModal.showModal(); });
    document.querySelectorAll("[data-group]").forEach((node) => { const group = JSON.parse(node.textContent); document.querySelector('[data-group-details="' + group.id + '"]')?.addEventListener("click", () => { groupForm.reset(); groupForm.dataset.mode = "details"; groupForm.dataset.groupId = group.id; groupForm.description.value = group.description; groupForm.description.readOnly = true; groupForm.displayOn.value = group.displayOn; groupForm.displayOn.readOnly = true; groupForm.querySelector("[data-group-summary]").textContent = group.kind + " · " + group.status + " · " + group.currency + " · " + money(group.totalAmountMinor, group.currency); groupForm.querySelector("[data-group-members]").innerHTML = group.members.map((item) => memberMarkup(item, group.currency, true)).join(""); groupForm.querySelector('[type="submit"]').hidden = true; groupForm.querySelector("[data-group-ungroup]").hidden = false; document.querySelector("[data-group-title]").textContent = "Detalhes do grupo"; groupModal.showModal(); }); });
    groupForm?.addEventListener("submit", async (event) => { event.preventDefault(); const response = await send("/api/transaction-groups", "POST", { memberIds: selected().map((item) => item.value), description: groupForm.description.value, displayOn: groupForm.displayOn.value }); if (response.ok) location.reload(); else { const error = groupForm.querySelector("[data-group-error]"); error.textContent = await message(response); error.hidden = false; } });
    groupForm?.querySelector("[data-group-ungroup]")?.addEventListener("click", async () => { if (!confirm("Desagrupar estes lançamentos?")) return; const response = await send("/api/transaction-groups/" + groupForm.dataset.groupId, "DELETE", {}); if (response.ok) location.reload(); });
    syncFieldVisibility(); setStatus("posted");
  })();
  </script>`;
}
