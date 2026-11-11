/** Preserves the ordered raw client-side installment controller fragment. */
export function operationalControllerScriptPart3(): string {
  return `        const current = {
          description: String(form.description.value || "").trim(),
          note: String(form.note.value || ""),
          categoryId: String(form.categoryId.value || ""),
        };
        const patch = {};
        const initialNote = String(initial.note || "").trim();
        const currentNote = current.note.trim();
        if (current.description !== String(initial.description || "").trim()) patch.description = current.description;
        if (currentNote !== initialNote) patch.note = currentNote || null;
        if (current.categoryId !== String(initial.categoryId || "")) patch.categoryId = current.categoryId || null;
        const installment = installmentsById.get(form.dataset.installmentId);
        if (installment?.amountEditable === true) {
          const cents = parseInstallmentAmount(form.querySelector("[data-installment-amount-input]")?.value);
          if (cents !== undefined && cents !== installment.amountMinor) patch.amountMinor = cents;
        }
        return patch;
      }

      async function reloadInstallment(form, installmentId) {
        const status = createStatus(form);
        status.textContent = "Recarregando estado atual...";
        status.className = "installment-form-status";
        const rows = await fetchInstallments("/api/installments?installmentId=" + encodeURIComponent(installmentId) + "&status=all");
        const installment = rows[0];
        if (!installment) {
          status.textContent = "Não foi possível recarregar esta parcela.";
          status.className = "installment-form-status error";
          return;
        }
        installmentsById.set(installment.id, installment);
        restrictForm(form, installment);
      }

      function showReloadAction(form, installmentId) {
        const status = createStatus(form);
        let button = form.querySelector("[data-installment-reload]");
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.className = "ghost-btn installment-reload";
          button.dataset.installmentReload = "";
          button.textContent = "Recarregar estado atual";
          status.insertAdjacentElement("afterend", button);
          button.addEventListener("click", () => reloadInstallment(form, installmentId));
        }
      }

    function focusableInstallmentControls(modal) {
      return Array.from(
        modal.querySelectorAll(
          'button:not([disabled]), summary, [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((control) => {
        if (control.hidden || control.getAttribute("aria-hidden") === "true") return false;
        if (control.closest("[hidden], [inert], [aria-hidden='true']")) return false;
        const closedDetails = control.closest("details:not([open])");
        if (closedDetails && control !== closedDetails.querySelector(":scope > summary")) return false;
        const style = getComputedStyle(control);
        if (style.display === "none" || style.visibility !== "visible") return false;
        return control.getClientRects().length > 0;
      });
    }

    function keepInstallmentFocusInsideModal(event) {
      if (event.key !== "Tab") return;
      const modal = event.currentTarget;
      const form = modal.querySelector("[data-form]");
      if (!form?.dataset.installmentMode) return;
      const controls = focusableInstallmentControls(modal);
      if (controls.length === 0) return;
      const first = controls[0];
      // A closed attachment disclosure is the last actual Tab stop. Inputs
      // inside its collapsed content must never let focus escape the dialog.
      const attachments = modal.querySelector("[data-statement-attachments]");
      const collapsedSummary = !attachments?.open
        ? attachments?.querySelector(":scope > summary")
        : null;
      const last = collapsedSummary && controls.includes(collapsedSummary)
        ? collapsedSummary
        : controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

      document.addEventListener("click", (event) => {
        const target = event.target && event.target.closest ? event.target.closest("button") : null;
        const installmentId = target && target.dataset ? target.dataset.installmentEdit : "";
        if (installmentId) {
          event.preventDefault();
          event.stopImmediatePropagation();
          const installment = installmentsById.get(installmentId);
          const modal = document.querySelector("[data-modal]");
          const form = document.querySelector("[data-form]");
          if (!installment || !modal || !form) return;
          const details = target.closest("details");
          if (details) details.removeAttribute("open");
          restrictForm(form, installment);
          const attachments = modal.querySelector('[data-attachment-workspace][data-entity-kind="transaction"]');
          if (attachments) {
            window.SolverFinAttachments?.resetPending(attachments);
            attachments.dataset.entityId = installment.transaction?.id || "";
            window.SolverFinAttachments?.refresh(attachments);
          }
          modal.showModal();
          window.setTimeout(() => {
            const focusTarget = installment.editable ? form.description : installment.amountEditable ? form.querySelector("[data-installment-amount-input]") : modal.querySelector(".close-form button");
            focusTarget?.focus();
          }, 0);
          return;
        }
        if (target && (target.matches("[data-open-modal]") || target.matches("[data-edit], [data-clone]"))) {
          restoreRestrictedForm();
        }
      }, true);

      document.querySelector("[data-modal]")?.addEventListener("close", restoreRestrictedForm);
      document.querySelector("[data-modal]")?.addEventListener("keydown", keepInstallmentFocusInsideModal);

      document.addEventListener("submit", async (event) => {
        const form = event.target;
        if (!form || !form.matches || !form.matches("[data-form]")) return;
        const installmentId = form.dataset.installmentId;
        if (!installmentId) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const installment = installmentsById.get(installmentId);
        if (!installment || (installment.editable !== true && installment.amountEditable !== true)) return;
        const status = createStatus(form);
        const amountInput = form.querySelector("[data-installment-amount-input]");
        if (installment.amountEditable === true && parseInstallmentAmount(amountInput?.value) === undefined) {
          status.textContent = "Informe um valor positivo válido para a parcela (ex.: 100,00).";
          status.className = "installment-form-status error";
          amountInput?.focus();
          return;
        }
        const patch = patchFromForm(form);
        if (patch.amountMinor !== undefined) {
          const scope = await chooseInstallmentScope(installment);
          if (!scope) {
            status.textContent = "A alteração não foi salva.";
            status.className = "installment-form-status";
            return;
          }
          if (scope === "current_and_future" &&
              Object.keys(patch).some((field) => field !== "amountMinor")) {
            status.textContent = "Para aplicar o valor às próximas, salve primeiro as alterações de descrição, observação e categoria.";
            status.className = "installment-form-status error";
            return;
          }
          patch.scope = scope;
        }
        if (!Object.keys(patch).length) {
          status.textContent = "Nenhuma alteração para salvar.";
          status.className = "installment-form-status";
          return;
        }
        if (installment.editable === true && !form.description.value.trim()) {
          status.textContent = "Informe uma descrição para a parcela.";
          status.className = "installment-form-status error";
          form.description.focus();
          return;
        }
        const saveButton = form.querySelector('[data-statement-save-primary]');
        if (saveButton) saveButton.disabled = true;
        status.textContent = "Salvando...";
        status.className = "installment-form-status";
        try {
          const response = await fetch(apiPath("/api/installments/" + encodeURIComponent(installmentId)), {
            method: "PATCH",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(patch),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            const code = body.error && body.error.code;
            const safeMessageCodes = new Set(["INSTALLMENT_PAYLOAD_INVALID"]);
            const safeDetail = safeMessageCodes.has(code) ? String(body?.error?.message || "") : "";
            status.textContent = code === "INSTALLMENT_EDIT_BLOCKED"
              ? "O estado da parcela mudou e ela não pode mais ser alterada. Seus valores foram preservados."
              : (safeDetail || "Não foi possível salvar a parcela.");
            status.className = "installment-form-status error";
            if (code === "INSTALLMENT_EDIT_BLOCKED" || response.status === 409) showReloadAction(form, installmentId);
            if (saveButton) saveButton.disabled = false;
            return;
          }
          const count = Number(body.updatedCount || 1);
          const skipped = Number(body.skippedCount || 0);
          status.textContent = (count === 1 ? "Parcela atualizada." : count + " parcelas atualizadas.") +
            (skipped ? " " + skipped + " parcela(s) protegida(s) não foram alteradas." : "") +
            " Atualizando a lista...";
          status.className = "installment-form-status success";
          window.setTimeout(() => window.location.reload(), 450);
        } catch (_error) {
          status.textContent = "Não foi possível salvar a parcela. Tente novamente.";
          status.className = "installment-form-status error";
          if (saveButton) saveButton.disabled = false;
        }
      }, true);

      ensureStyles();
      if (pathname === "/lancamentos") void decorateAccountInstallments();
      if (pathname === "/cartoes") void decorateCardInstallments();
    })();
  `;
}
