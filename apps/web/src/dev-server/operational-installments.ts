export interface OperationalInstallmentRecord {
  id: string;
  sequenceNumber: number;
  totalInstallments: number;
  dueOn: string;
  amountMinor: number;
  currency: string;
  status: string;
  editable: boolean;
  editBlockedReason?: string;
  transaction?: {
    id?: string;
    description?: string;
    note?: string;
    categoryId?: string;
  };
  category?: {
    id?: string;
    name?: string;
    status?: string;
  };
}

export interface InstallmentEditableValues {
  description: string;
  note: string;
  categoryId: string;
}

const BLOCK_REASON_LABELS: Readonly<Record<string, string>> = {
  linked_transaction_missing: "O lançamento vinculado não está disponível.",
  installment_status_locked: "Esta parcela não pode mais ser alterada.",
  transaction_status_locked: "O lançamento já foi efetivado, conciliado ou cancelado.",
  invoice_linked: "Esta parcela é alterada pela compra da fatura.",
};

export function translateInstallmentBlockReason(reason: string | undefined): string {
  return reason ? (BLOCK_REASON_LABELS[reason] ?? "Esta parcela não pode ser alterada.") : "";
}

export function buildAccountInstallmentsPath(
  accountId: string,
  month: string,
  profileId?: string,
  day?: string,
): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const selectedDay = /^\d{4}-\d{2}-\d{2}$/.test(day ?? "") && day?.startsWith(`${month}-`) ? day : undefined;
  const query = new URLSearchParams({
    accountId,
    operationalFrom: selectedDay ?? `${month}-01`,
    operationalTo: selectedDay ?? `${month}-${String(lastDay).padStart(2, "0")}`,
    status: "all",
  });
  if (profileId) query.set("profileId", profileId);
  return `/api/installments?${query.toString()}`;
}

export function buildInvoiceInstallmentsPath(invoiceId: string, profileId?: string): string {
  const query = new URLSearchParams({ invoiceId, status: "all" });
  if (profileId) query.set("profileId", profileId);
  return `/api/installments?${query.toString()}`;
}

export function formatInstallmentSequence(
  sequenceNumber: number,
  totalInstallments: number,
): string {
  return `Parcela ${sequenceNumber} de ${totalInstallments > 0 ? totalInstallments : "?"}`;
}

export function buildInstallmentPatch(
  initial: InstallmentEditableValues,
  current: InstallmentEditableValues,
): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  const description = current.description.trim();
  const initialNote = initial.note.trim();
  const currentNote = current.note.trim();
  if (description !== initial.description.trim()) patch.description = description;
  if (currentNote !== initialNote) patch.note = currentNote || null;
  if (current.categoryId !== initial.categoryId) patch.categoryId = current.categoryId || null;
  return patch;
}

export interface HistoricalCategoryOption {
  value: string;
  label: string;
  disabled: boolean;
}

export function buildHistoricalCategoryOption(
  installment: OperationalInstallmentRecord,
): HistoricalCategoryOption | undefined {
  const categoryId = installment.transaction?.categoryId?.trim();
  if (!categoryId) return undefined;

  const name = installment.category?.name?.trim() || "Categoria histórica";
  const archived = installment.category?.status === "archived";

  return {
    value: categoryId,
    label: archived ? `${name} (arquivada)` : name,
    disabled: archived,
  };
}

const OPERATIONAL_INSTALLMENTS_CSS = `
  .installment-badge {
    align-items: center;
    background: #ecfeff;
    border: 1px solid #a5f3fc;
    border-radius: 999px;
    color: #0f3d4c;
    display: inline-flex;
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1.2;
    margin-left: 7px;
    padding: 3px 7px;
    vertical-align: middle;
  }
  .installment-details {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    display: grid;
    gap: 8px;
    grid-column: 1 / -1;
    padding: 12px;
  }
  .installment-details dl { display: grid; gap: 6px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; }
  .installment-details dl > div { display: grid; gap: 2px; }
  .installment-details dt { color: #475569; font-size: 0.75rem; }
  .installment-details dd { color: #0f172a; font-size: 0.875rem; font-weight: 650; margin: 0; }
  .installment-details [data-installment-reason] { color: #92400e; margin: 0; }
  .installment-form-status { grid-column: 1 / -1; margin: 0; }
  .installment-form-status.error { color: #b91c1c; }
  .installment-form-status.success { color: #166534; }
  .installment-reload { justify-self: start; }
  @media (max-width: 560px) {
    .installment-details dl { grid-template-columns: 1fr; }
    .installment-badge { margin-left: 4px; }
  }
`;

export function operationalInstallmentsController(): string {
  return `
    (function () {
      const pathname = window.location.pathname;
      if (pathname !== "/lancamentos" && pathname !== "/cartoes") return;

      const blockReasonLabels = ${JSON.stringify(BLOCK_REASON_LABELS)};
      const css = ${JSON.stringify(OPERATIONAL_INSTALLMENTS_CSS)};
      const urlParams = new URLSearchParams(window.location.search);
      const profileId = urlParams.get("profileId") || "";
      const installmentsById = new Map();

      function ensureStyles() {
        if (document.querySelector("[data-operational-installments-styles]")) return;
        const style = document.createElement("style");
        style.setAttribute("data-operational-installments-styles", "");
        style.textContent = css;
        document.head.appendChild(style);
      }

      function apiPath(path) {
        if (!profileId) return path;
        const separator = path.includes("?") ? "&" : "?";
        return path + separator + "profileId=" + encodeURIComponent(profileId);
      }

      function readJsonNode(node) {
        try { return JSON.parse(node.textContent || "{}"); } catch (_error) { return undefined; }
      }

      function formatDate(value) {
        if (!value) return "-";
        return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value + "T00:00:00Z"));
      }

      function formatMoney(minor, currency) {
        return (Number(minor || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: currency || "BRL" });
      }

      function statusLabel(status) {
        return ({ planned: "Planejada", posted: "Efetivada", reconciled: "Conciliada", cancelled: "Cancelada" })[status] || status || "-";
      }

      function blockReason(reason) {
        return reason ? (blockReasonLabels[reason] || "Esta parcela não pode ser alterada.") : "";
      }

      function installmentLabel(installment) {
        const total = Number(installment.totalInstallments) > 0 ? installment.totalInstallments : "?";
        return "Parcela " + installment.sequenceNumber + " de " + total;
      }

      function addBadge(row, installment) {
        const description = row && row.querySelector(".description strong");
        if (!description || description.querySelector('[data-installment-badge="' + installment.id + '"]')) return;
        const badge = document.createElement("span");
        badge.className = "installment-badge";
        badge.dataset.installmentBadge = installment.id;
        badge.textContent = installmentLabel(installment);
        badge.setAttribute("aria-label", installmentLabel(installment));
        badge.title = blockReason(installment.editBlockedReason) || badge.textContent;
        description.appendChild(badge);
      }

      async function fetchInstallments(path) {
        try {
          const response = await fetch(apiPath(path), { headers: { accept: "application/json" } });
          if (!response.ok) return undefined;
          const body = await response.json();
          return Array.isArray(body.installments) ? body.installments : [];
        } catch (_error) {
          return undefined;
        }
      }

      function setAccountEditLookupState(state) {
        document.querySelectorAll("[data-edit]").forEach((button) => {
          const label = button.querySelector("span");
          if (!("installmentOriginalDisabled" in button.dataset)) {
            button.dataset.installmentOriginalDisabled = String(Boolean(button.disabled));
            button.dataset.installmentOriginalTitle = button.title || "";
            if (label) button.dataset.installmentOriginalLabel = label.textContent || "Editar";
          }

          if (state === "loading") {
            button.disabled = true;
            button.title = "Verificando se o lançamento pertence a uma parcela";
            if (label) label.textContent = "Verificando parcela";
            return;
          }

          if (state === "unavailable") {
            button.disabled = true;
            button.title = "Edição temporariamente indisponível. Recarregue a página para tentar novamente.";
            if (label) label.textContent = "Edição indisponível";
            return;
          }

          button.disabled = button.dataset.installmentOriginalDisabled === "true";
          button.title = button.dataset.installmentOriginalTitle || "";
          if (label) label.textContent = button.dataset.installmentOriginalLabel || "Editar";
          delete button.dataset.installmentOriginalDisabled;
          delete button.dataset.installmentOriginalTitle;
          delete button.dataset.installmentOriginalLabel;
        });
      }

      function findNodeByData(selector, value) {
        return Array.from(document.querySelectorAll(selector)).find((node) => node.dataset && Object.values(node.dataset).includes(value));
      }

      function accountQueryPath() {
        const accountId = document.querySelector("[data-account-input]")?.value || urlParams.get("accountId") || "";
        const month = document.querySelector("#filter-month")?.value || urlParams.get("month") || "";
        if (!accountId || !/^\\d{4}-\\d{2}$/.test(month)) return "";
        const day = urlParams.get("day") || "";
        const selectedDay = /^\\d{4}-\\d{2}-\\d{2}$/.test(day) && day.startsWith(month + "-") ? day : "";
        const parts = month.split("-").map(Number);
        const lastDay = new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate();
        const operationalFrom = selectedDay || month + "-01";
        const operationalTo = selectedDay || month + "-" + String(lastDay).padStart(2, "0");
        return "/api/installments?accountId=" + encodeURIComponent(accountId)
          + "&operationalFrom=" + operationalFrom + "&operationalTo=" + operationalTo
          + "&status=all";
      }

      async function decorateAccountInstallments() {
        const path = accountQueryPath();
        if (!path) return;
        setAccountEditLookupState("loading");
        const installments = await fetchInstallments(path);
        if (!installments) {
          setAccountEditLookupState("unavailable");
          return;
        }
        setAccountEditLookupState("ready");
        installments.forEach((installment) => {
          const transactionId = installment.transaction && installment.transaction.id;
          if (!transactionId) return;
          installmentsById.set(installment.id, installment);
          const node = findNodeByData("script[data-transaction]", transactionId);
          const row = node && node.closest("article");
          if (!row) return;
          addBadge(row, installment);
          const editButton = row.querySelector('[data-edit="' + transactionId + '"]');
          if (!editButton) return;
          editButton.dataset.installmentEdit = installment.id;
          editButton.dataset.installmentEditable = String(installment.editable === true);
          const label = editButton.querySelector("span");
          if (label) label.textContent = installment.editable ? "Editar" : "Ver detalhes";
          editButton.title = installment.editable ? "Editar parcela" : "Ver detalhes da parcela";
        });
      }

      async function decorateCardInstallments() {
        const invoiceId = document.querySelector("[data-invoice-input]")?.value || urlParams.get("invoiceId") || "";
        if (!invoiceId) return;
        const installments = await fetchInstallments("/api/installments?invoiceId=" + encodeURIComponent(invoiceId) + "&status=all");
        if (!installments) return;
        installments.forEach((installment) => {
          const transactionId = installment.transaction && installment.transaction.id;
          if (!transactionId) return;
          installmentsById.set(installment.id, installment);
          const node = findNodeByData("script[data-purchase]", transactionId);
          const row = node && node.closest("article");
          if (!row) return;
          addBadge(row, installment);
          const editButton = row.querySelector('[data-edit-purchase="' + transactionId + '"]');
          if (editButton && installment.editBlockedReason === "invoice_linked") {
            editButton.title = editButton.disabled
              ? editButton.title
              : "Editar compra da fatura";
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
          + '<div><dt>Valor</dt><dd data-installment-amount></dd></div>'
          + '</dl><p data-installment-reason hidden></p>';
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
        const saveButton = form.querySelector('.save-row button[type="submit"]');
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
        form.querySelectorAll(".status-icons, [data-field]").forEach((node) => {
          node.dataset.installmentManaged = "";
          rememberAndSet(node, "hidden", true);
        });

        form.description.value = initial.description;
        form.note.value = initial.note;
        ensureHistoricalCategoryOption(form.categoryId, installment);
        form.categoryId.value = initial.categoryId;

        const details = createDetails(form);
        details.querySelector("[data-installment-sequence]").textContent = installmentLabel(installment).replace("Parcela ", "");
        details.querySelector("[data-installment-due]").textContent = formatDate(installment.dueOn);
        details.querySelector("[data-installment-status]").textContent = statusLabel(installment.status);
        details.querySelector("[data-installment-amount]").textContent = formatMoney(installment.amountMinor, installment.currency);
        const reason = details.querySelector("[data-installment-reason]");
        const reasonText = blockReason(installment.editBlockedReason);
        reason.hidden = !reasonText;
        reason.textContent = reasonText;

        const status = createStatus(form);
        status.textContent = editable ? "Altere apenas descrição, observação ou categoria." : reasonText;
        status.className = editable ? "installment-form-status" : "installment-form-status error";

        const modalTitle = document.querySelector("[data-modal-title]");
        if (modalTitle) {
          if (!modalTitle.dataset.installmentOriginalTitle) modalTitle.dataset.installmentOriginalTitle = modalTitle.textContent || "Lançamento";
          modalTitle.textContent = editable ? "Editar parcela" : "Detalhes da parcela";
        }
        const saveButton = form.querySelector('.save-row button[type="submit"]');
        if (saveButton) {
          if (!form.dataset.installmentOriginalSaveLabel) form.dataset.installmentOriginalSaveLabel = saveButton.textContent || "Salvar lançamento";
          saveButton.dataset.installmentManaged = "";
          rememberAndSet(saveButton, "hidden", !editable);
          rememberAndSet(saveButton, "disabled", !editable);
          saveButton.textContent = "Salvar parcela";
        }
      }

      function patchFromForm(form) {
        const initial = JSON.parse(form.dataset.installmentInitial || "{}");
        const current = {
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
          modal.showModal();
          window.setTimeout(() => {
            const focusTarget = installment.editable ? form.description : modal.querySelector(".close-form button");
            focusTarget?.focus();
          }, 0);
          return;
        }
        if (target && (target.matches("[data-open-modal]") || target.matches("[data-edit], [data-clone]"))) {
          restoreRestrictedForm();
        }
      }, true);

      document.querySelector("[data-modal]")?.addEventListener("close", restoreRestrictedForm);

      document.addEventListener("submit", async (event) => {
        const form = event.target;
        if (!form || !form.matches || !form.matches("[data-form]")) return;
        const installmentId = form.dataset.installmentId;
        if (!installmentId) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const installment = installmentsById.get(installmentId);
        if (!installment || installment.editable !== true) return;
        const patch = patchFromForm(form);
        const status = createStatus(form);
        if (!Object.keys(patch).length) {
          status.textContent = "Nenhuma alteração para salvar.";
          status.className = "installment-form-status";
          return;
        }
        if (!form.description.value.trim()) {
          status.textContent = "Informe uma descrição para a parcela.";
          status.className = "installment-form-status error";
          form.description.focus();
          return;
        }
        const saveButton = form.querySelector('.save-row button[type="submit"]');
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
            status.textContent = code === "INSTALLMENT_EDIT_BLOCKED"
              ? "O estado da parcela mudou e ela não pode mais ser alterada. Seus valores foram preservados."
              : ((body.error && body.error.message) || "Não foi possível salvar a parcela.");
            status.className = "installment-form-status error";
            if (code === "INSTALLMENT_EDIT_BLOCKED" || response.status === 409) showReloadAction(form, installmentId);
            if (saveButton) saveButton.disabled = false;
            return;
          }
          status.textContent = "Parcela atualizada. Atualizando a lista...";
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
