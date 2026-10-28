// The manual create/continue flow is shared as small runtime snippets.
export const statementContinueVisibilityScript = String.raw`      const continueButton = form.querySelector("[data-statement-save-continue]");
      if (continueButton && form.dataset.installmentMode !== "true") {
        const allowed = repeatMode === "single" && form.dataset.method !== "PATCH";
        continueButton.hidden = !allowed;
        continueButton.disabled = !allowed || !accountCurrencies.get(sourceAccountId());
      }
`;
export const statementCloseProtectionScript = String.raw`    modal.addEventListener("cancel", (event) => {
      if (form.dataset.submitting === "true") event.preventDefault();
    });
    modal.querySelector(".close-form")?.addEventListener("submit", (event) => {
      if (form.dataset.submitting === "true") event.preventDefault();
    });
    modal.addEventListener("close", () => {
      if (form.dataset.savedDuringSession === "true" || form.dataset.saveAttempted === "true") {
        window.location.reload();
      }
    });
`;
export const statementAttemptKeyScript = String.raw`    const newIdempotencyKey = () => window.crypto?.randomUUID ? window.crypto.randomUUID() :
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
        const value = Math.floor(Math.random() * 16);
        return (char === "x" ? value : (value & 3) | 8).toString(16);
      });
    const attemptKeyFor = (path, body) => {
      const fingerprint = path + ":" + JSON.stringify(body);
      if (form.dataset.attemptFingerprint !== fingerprint || !form.dataset.attemptKey) {
        form.dataset.attemptFingerprint = fingerprint;
        form.dataset.attemptKey = newIdempotencyKey();
      }
      return form.dataset.attemptKey;
    };

`;
export const statementResponseConfirmationScript = String.raw`        if (response.ok) {
          form.dataset.savedDuringSession = "true";
          delete form.dataset.attemptKey;
          delete form.dataset.attemptFingerprint;
        }
`;
export const statementContinueSaveScript = String.raw`        if (response.ok) {
          if (saveAndContinue) {
            form.dataset.savedDuringSession = "true";
            form.dataset.savedCount = String(Number(form.dataset.savedCount || 0) + 1);
            const accountId = form.accountId.value;
            const currentKind = form.kind.value;
            const currentStatus = form.status.value;
            const occurredOn = form.occurredOn.value;
            const plannedOn = form.plannedOn.value;
            if (attachmentWorkspace) window.SolverFinAttachments?.resetPending(attachmentWorkspace);
            form.reset();
            form.dataset.method = "POST";
            form.dataset.path = "/api/transactions";
            form.accountId.value = accountId;
            form.kind.value = currentKind;
            form.occurredOn.value = occurredOn;
            form.plannedOn.value = plannedOn;
            const accountDisplay = form.querySelector(".statement-entry-account input");
            if (accountDisplay) accountDisplay.value = accountLabels.get(accountId) || "Conta indisponível";
            document.querySelector("[data-modal-title]").textContent = "Novo lançamento";
            setStatus(currentStatus);
            syncFieldVisibility();
            statusNode.className = "form-status success full";
            statusNode.textContent = form.dataset.savedCount + " lançamento(s) salvo(s). Informe o próximo. A lista será atualizada ao fechar.";
            form.description.focus();
          } else {
            shouldReload = true;
            setTimeout(() => location.reload(), 350);
          }
        }
`;

export const statementSubmitPreparationScript = String.raw`      const mode = form.repeatMode.value; const method = form.dataset.method || "POST";
      const saveAndContinue = method === "POST" && mode === "single" && event.submitter?.hasAttribute("data-statement-save-continue") === true;
      const submitButtons = Array.from(form.querySelectorAll('.statement-save-actions button[type="submit"]'));
      const previouslyDisabled = submitButtons.map((button) => button.disabled);
      const attachmentWorkspace = modal.querySelector("[data-attachment-workspace]"); const queuedFile = attachmentWorkspace?.querySelector('[data-attachment-form] [name="file"]')?.files?.[0];
      if (queuedFile && method === "POST" && mode !== "single") { statusNode.className = "form-status error full"; statusNode.textContent = "Para anexar arquivos, salve um lançamento único. Em parcelas ou recorrências, anexe na edição de uma ocorrência."; return; }
      form.dataset.submitting = "true"; form.setAttribute("aria-busy", "true"); submitButtons.forEach((button) => { button.disabled = true; }); statusNode.textContent = "Salvando...";
`;

export const statementTransactionPostScript = String.raw`        } else {
          const draft = payload();
          const path = form.dataset.path || "/api/transactions";
          response = await send(path, method, method === "POST" ? { ...draft, idempotencyKey: attemptKeyFor(path, draft) } : draft);
        }
`;
