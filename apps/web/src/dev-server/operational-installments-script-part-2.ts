/** Preserves the ordered raw client-side installment controller fragment. */
export function operationalControllerScriptPart2(): string {
  return `              : "Editar compra da fatura";
          }
        });
      }

      function createDetails(form) {
        let details = form.querySelector("[data-installment-details]");
        if (details) return details;
        details = document.createElement("section");
        details.className = "installment-details";
        details.dataset.installmentDetails = "";
        details.setAttribute("aria-label", "Detalhes da parcela");
        details.innerHTML = '<dl>'
          + '<div><dt>Parcela</dt><dd data-installment-sequence></dd></div>'
          + '<div><dt>Vencimento</dt><dd data-installment-due></dd></div>'
          + '<div><dt>Situação</dt><dd data-installment-status></dd></div>'
          + '<div data-installment-amount-readonly><dt>Valor</dt><dd data-installment-amount></dd></div>'
          + '</dl><label class="installment-amount-editor" data-installment-amount-editor hidden>Valor desta parcela <span data-installment-amount-currency></span>'
          + '<input type="text" name="adjustedInstallmentAmount" data-installment-amount-input inputmode="decimal" autocomplete="off" aria-label="Novo valor desta parcela">'
          + '<span class="installment-amount-hint">Informe o novo valor e escolha se deve valer somente para esta parcela ou também para as próximas.</span></label>'
          + '<p data-installment-reason hidden></p>';
        const saveRow = form.querySelector(".save-row");
        form.insertBefore(details, saveRow || form.firstChild);
        return details;
      }

      function createStatus(form) {
        let status = form.querySelector("[data-installment-status-message]");
        if (status) return status;
        status = document.createElement("p");
        status.className = "installment-form-status";
        status.dataset.installmentStatusMessage = "";
        status.setAttribute("aria-live", "polite");
        const saveRow = form.querySelector(".save-row");
        form.insertBefore(status, saveRow || null);
        return status;
      }

      function rememberAndSet(node, property, value) {
        if (!node) return;
        const key = "installmentOriginal" + property[0].toUpperCase() + property.slice(1);
        if (!(key in node.dataset)) node.dataset[key] = String(Boolean(node[property]));
        node[property] = value;
      }

      function restoreRestrictedForm() {
        const form = document.querySelector("[data-form]");
        if (!form || !form.dataset.installmentMode) return;
        form.querySelectorAll("[data-installment-historical-category]").forEach((node) => node.remove());
        form.querySelectorAll("[data-installment-managed]").forEach((node) => {
          if ("installmentOriginalHidden" in node.dataset) node.hidden = node.dataset.installmentOriginalHidden === "true";
          if ("installmentOriginalDisabled" in node.dataset) node.disabled = node.dataset.installmentOriginalDisabled === "true";
          delete node.dataset.installmentOriginalHidden;
          delete node.dataset.installmentOriginalDisabled;
          delete node.dataset.installmentManaged;
        });
        form.querySelector("[data-installment-details]")?.remove();
        form.querySelector("[data-installment-status-message]")?.remove();
        form.querySelector("[data-installment-reload]")?.remove();
        const saveButton = form.querySelector('[data-statement-save-primary]');
        if (saveButton && form.dataset.installmentOriginalSaveLabel) saveButton.textContent = form.dataset.installmentOriginalSaveLabel;
        delete form.dataset.installmentOriginalSaveLabel;
        delete form.dataset.installmentMode;
        delete form.dataset.installmentId;
        delete form.dataset.installmentInitial;
        const modalTitle = document.querySelector("[data-modal-title]");
        if (modalTitle && modalTitle.dataset.installmentOriginalTitle) {
          modalTitle.textContent = modalTitle.dataset.installmentOriginalTitle;
          delete modalTitle.dataset.installmentOriginalTitle;
        }
      }

      function ensureHistoricalCategoryOption(select, installment) {
        const categoryId = String(installment.transaction?.categoryId || "").trim();
        if (!categoryId || Array.from(select.options || []).some((option) => option.value === categoryId)) return;
        const categoryName = String(installment.category?.name || "Categoria histórica").trim();
        const archived = installment.category?.status === "archived";
        const option = document.createElement("option");
        option.value = categoryId;
        option.textContent = archived ? categoryName + " (arquivada)" : categoryName;
        option.disabled = archived;
        option.dataset.installmentHistoricalCategory = "";
        select.appendChild(option);
      }

      function restrictForm(form, installment) {
        restoreRestrictedForm();
        const editable = installment.editable === true;
        const amountEditable = installment.amountEditable === true;
        const anyEditable = editable || amountEditable;
        form.dataset.installmentMode = "true";
        form.dataset.installmentId = installment.id;
        const initial = {
          description: String(installment.transaction?.description || ""),
          note: String(installment.transaction?.note || ""),
          categoryId: String(installment.transaction?.categoryId || ""),
        };
        form.dataset.installmentInitial = JSON.stringify(initial);

        const allowedNames = new Set(["description", "note", "categoryId"]);
        form.querySelectorAll("input, select, textarea, button").forEach((control) => {
          if (control.type === "submit" || control.closest(".close-form")) return;
          const allowed = allowedNames.has(control.name);
          control.dataset.installmentManaged = "";
          rememberAndSet(control, "disabled", !allowed || !editable);
          const label = control.closest("label");
          if (label) {
            label.dataset.installmentManaged = "";
            rememberAndSet(label, "hidden", !allowed);
          }
        });
        form.querySelectorAll(".status-icons, [data-field], .statement-entry-advanced").forEach((node) => {
          node.dataset.installmentManaged = "";
          rememberAndSet(node, "hidden", true);
        });

        form.description.value = initial.description;
        form.note.value = initial.note;
        ensureHistoricalCategoryOption(form.categoryId, installment);
        form.categoryId.value = initial.categoryId;

        const details = createDetails(form);
        details.querySelector("[data-installment-sequence]").textContent = installmentLabel(installment).replace(/^Parcela /, "");
        details.querySelector("[data-installment-due]").textContent = formatDate(installment.dueOn);
        details.querySelector("[data-installment-status]").textContent = statusLabel(installment.status);
        details.querySelector("[data-installment-amount]").textContent = formatMoney(installment.amountMinor, installment.currency);
        details.querySelector("[data-installment-amount-readonly]").hidden = amountEditable;
        const amountEditor = details.querySelector("[data-installment-amount-editor]");
        amountEditor.hidden = !amountEditable;
        details.querySelector("[data-installment-amount-currency]").textContent = "(" + String(installment.currency || "moeda indisponível") + ")";
        const amountInput = details.querySelector("[data-installment-amount-input]");
        amountInput.value = (Number(installment.amountMinor || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        amountInput.required = amountEditable;
        const reason = details.querySelector("[data-installment-reason]");
        const reasonText = blockReason(installment.editBlockedReason);
        reason.hidden = anyEditable || !reasonText;
        reason.textContent = reasonText;

        const status = createStatus(form);
        status.textContent = editable ? "Atualize os dados e/ou o valor desta parcela." : amountEditable ? "Ajuste somente o valor desta parcela, sem redistribuir as demais, ou escolha Esta e as próximas ao salvar; a situação permanece efetivada." : reasonText;
        status.className = anyEditable ? "installment-form-status" : "installment-form-status error";

        const modalTitle = document.querySelector("[data-modal-title]");
        if (modalTitle) {
          if (!modalTitle.dataset.installmentOriginalTitle) modalTitle.dataset.installmentOriginalTitle = modalTitle.textContent || "Lançamento";
          modalTitle.textContent = editable ? "Editar parcela" : amountEditable ? "Ajustar valor da parcela" : "Detalhes da parcela";
        }
        // Editing an installment never exposes the create-only submit.
        const continueButton = form.querySelector("[data-statement-save-continue]");
        if (continueButton) {
          continueButton.dataset.installmentManaged = "";
          rememberAndSet(continueButton, "hidden", true);
          rememberAndSet(continueButton, "disabled", true);
        }
        const saveButton = form.querySelector('[data-statement-save-primary]');
        if (saveButton) {
          if (!form.dataset.installmentOriginalSaveLabel) form.dataset.installmentOriginalSaveLabel = saveButton.textContent || "Salvar lançamento";
          saveButton.dataset.installmentManaged = "";
          rememberAndSet(saveButton, "hidden", !anyEditable);
          rememberAndSet(saveButton, "disabled", !anyEditable);
          saveButton.textContent = "Salvar parcela";
        }
      }

      function chooseInstallmentScope(installment) {
        return new Promise((resolve) => {
          const dialog = document.createElement("dialog");
          dialog.className = "installment-scope-dialog";
          dialog.setAttribute("aria-labelledby", "installment-scope-title");
          // Finite plans rely on their sequence range. Recurrences have no fixed
          // final sequence: the API can change the rule and later planned items.
          const isRecurring = Boolean(installment.recurrenceId);
          const hasFuture = isRecurring
            ? installment.recurrence?.status !== "cancelled"
            : Number(installment.totalInstallments) > Number(installment.sequenceNumber);
          dialog.innerHTML = '<section class="installment-scope-panel">' +
            '<h3 id="installment-scope-title">Onde aplicar o novo valor?</h3>' +
            '<p>Escolha quais parcelas receberão o valor informado.</p>' +
            '<button type="button" class="installment-scope-option" data-button-variant="neutral" data-scope="current">Somente esta parcela</button>' +
            (hasFuture ? '<button type="button" class="installment-scope-option" data-button-variant="neutral" data-scope="current_and_future">Esta e as próximas</button>' : '') +
            '<p class="installment-scope-note">As anteriores e as conciliadas ou canceladas serão preservadas.</p>' +
            '<button type="button" class="ghost-btn installment-scope-cancel" data-scope-cancel>Voltar sem salvar</button>' +
            '</section>';
          let choice;
          dialog.addEventListener("close", () => {
            dialog.remove();
            resolve(choice);
          }, { once: true });
          dialog.addEventListener("click", (event) => {
            const target = event.target.closest("[data-scope], [data-scope-cancel]");
            if (!target) return;
            choice = target.dataset.scope;
            dialog.close();
          });
          document.body.append(dialog);
          dialog.showModal();
          dialog.querySelector("[data-scope='current']")?.focus();
        });
      }

      function parseInstallmentAmount(value) {
        const normalized = String(value || "").trim().split(".").join("");
        if (!/^[0-9]+(,[0-9]{1,2})?$/.test(normalized)) return undefined;
        const parts = normalized.split(",");
        const cents = Number(parts[0]) * 100 + Number((parts[1] || "").padEnd(2, "0"));
        return Number.isSafeInteger(cents) && cents > 0 ? cents : undefined;
      }

      function patchFromForm(form) {
        const initial = JSON.parse(form.dataset.installmentInitial || "{}");
`;
}
