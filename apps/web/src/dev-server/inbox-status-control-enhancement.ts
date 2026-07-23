export type InboxControlledStatus = "corrected" | "confirmed" | undefined;

export interface InboxStatusRecord {
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

const STATUS_CONTROL_MARKER = 'data-inbox-status-control="enhanced"';
const STATUS_CONTROL_SCRIPT_MARKER = 'data-inbox-status-control-script="enhanced"';
const CORRECTED_FILTER_MARKER = 'data-inbox-corrected-filter="enhanced"';

export function resolveInboxControlledStatus(item: InboxStatusRecord): InboxControlledStatus {
  if (item.status === "approved") return "confirmed";

  const wasEdited =
    item.status === "edited" ||
    (item.status === "pending_review" &&
      Boolean(item.createdAt) &&
      Boolean(item.updatedAt) &&
      item.createdAt !== item.updatedAt);

  return wasEdited ? "corrected" : undefined;
}

export function enhanceInboxStatusControl(html: string): string {
  if (html.includes(STATUS_CONTROL_MARKER)) return html;

  const resolver = resolveInboxControlledStatus.toString();
  const headScript = `<script ${STATUS_CONTROL_MARKER}>${inboxStatusCaptureScript(resolver)}</script>`;
  const correctedFilterStyles = `<style ${CORRECTED_FILTER_MARKER}>
    .inbox-page .import-row.inbox-corrected-filter-hidden {
      display: none !important;
    }
  </style>`;
  const bodyScript = `<script ${STATUS_CONTROL_SCRIPT_MARKER}>${inboxStatusPresentationScript()}</script>`;

  return html
    .replace("</head>", `${headScript}${correctedFilterStyles}</head>`)
    .replace("</body>", `${bodyScript}</body>`);
}

function inboxStatusCaptureScript(resolver: string): string {
  return `(() => {
    const resolveInboxControlledStatus = ${resolver};
    const originalFetch = window.fetch.bind(window);

    function isImportBatchDetailRequest(input, init) {
      const requestUrl = typeof input === "string" ? input : input?.url;
      const method = String(init?.method || input?.method || "GET").toUpperCase();
      if (!requestUrl || method !== "GET") return false;

      try {
        const url = new URL(requestUrl, window.location.origin);
        return /^\\/api\\/import-batches\\/[^/]+$/.test(url.pathname);
      } catch {
        return false;
      }
    }

    function publishStatuses(detail) {
      const statuses = {};
      for (const item of detail?.suggestions || []) {
        const controlledStatus = resolveInboxControlledStatus(item);
        if (controlledStatus) statuses[item.id] = controlledStatus;
      }
      window.__solverFinInboxControlledStatuses = statuses;
      window.dispatchEvent(new CustomEvent("solverfin:inbox-statuses-updated"));
    }

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.ok && isImportBatchDetailRequest(args[0], args[1])) {
        response.clone().json().then(publishStatuses).catch(() => undefined);
      }
      return response;
    };
  })();`;
}

function inboxStatusPresentationScript(): string {
  return `(() => {
    const labels = { corrected: "Corrigido", confirmed: "Confirmado" };
    const correctedFilterAttribute = "data-inbox-controlled-filter";
    const correctedFilterValue = "corrected";

    function ensureCorrectedFilterOption() {
      const filter = document.getElementById("import-line-filter");
      if (!(filter instanceof HTMLSelectElement)) return;
      if (filter.querySelector('option[' + correctedFilterAttribute + '="' + correctedFilterValue + '"]')) return;

      const option = document.createElement("option");
      option.value = "all";
      option.textContent = "Corrigidos";
      option.setAttribute(correctedFilterAttribute, correctedFilterValue);

      const eligibleOption = filter.querySelector('option[value="eligible"]');
      if (eligibleOption) eligibleOption.after(option);
      else filter.append(option);
    }

    function correctedFilterIsActive() {
      const filter = document.getElementById("import-line-filter");
      return (
        filter instanceof HTMLSelectElement &&
        filter.selectedOptions[0]?.getAttribute(correctedFilterAttribute) === correctedFilterValue
      );
    }

    function restoreCheckbox(checkbox) {
      if (checkbox?.dataset.inboxCorrectedFilterDisabled !== "true") return;
      checkbox.disabled = false;
      delete checkbox.dataset.inboxCorrectedFilterDisabled;
    }

    function applyCorrectedFilter() {
      const rows = [...document.querySelectorAll(".inbox-page .import-row[data-suggestion-id]")];
      const emptyState = document.getElementById("inbox-corrected-filter-empty");
      const active = correctedFilterIsActive();

      if (!active) {
        rows.forEach((row) => {
          row.classList.remove("inbox-corrected-filter-hidden");
          restoreCheckbox(row.querySelector("[data-select-suggestion]"));
        });
        emptyState?.remove();
        return;
      }

      let visibleCorrected = 0;
      for (const row of rows) {
        const corrected = row.getAttribute("data-controlled-status") === correctedFilterValue;
        row.classList.toggle("inbox-corrected-filter-hidden", !corrected);

        const checkbox = row.querySelector("[data-select-suggestion]");
        if (!corrected && checkbox && !checkbox.disabled) {
          checkbox.disabled = true;
          checkbox.dataset.inboxCorrectedFilterDisabled = "true";
        } else if (corrected) {
          restoreCheckbox(checkbox);
          if (!row.hidden) visibleCorrected += 1;
        }
      }

      const container = document.querySelector("#import-batch-detail .import-rows");
      if (container && rows.length > 0 && visibleCorrected === 0) {
        if (!emptyState) {
          container.insertAdjacentHTML(
            "beforeend",
            '<div class="empty-state inbox-list-empty" id="inbox-corrected-filter-empty"><strong>Nenhum registro corrigido neste filtro.</strong><p class="muted">Altere o período ou selecione outro filtro para consultar o lote.</p></div>',
          );
        }
      } else {
        emptyState?.remove();
      }

      const counter = document.getElementById("inbox-visible-lines");
      if (counter) counter.textContent = rows.length ? visibleCorrected + " de " + rows.length + " linha(s)" : "";
    }

    function applyControlledStatuses() {
      const statuses = window.__solverFinInboxControlledStatuses || {};
      document.querySelectorAll(".inbox-page .import-row[data-suggestion-id]").forEach((row) => {
        const suggestionId = row.getAttribute("data-suggestion-id");
        const status = suggestionId ? statuses[suggestionId] : undefined;
        const pill = row.querySelector(".import-table-status, .row-heading .status-pill");
        if (!pill) return;

        const fallbackStatus = pill.textContent?.trim() === "Lançamento criado" ? "confirmed" : undefined;
        const controlledStatus = status || fallbackStatus;
        if (!controlledStatus) return;

        const label = labels[controlledStatus];
        if (pill.textContent?.trim() !== label) pill.textContent = label;
        pill.setAttribute("data-controlled-status", controlledStatus);
        row.setAttribute("data-controlled-status", controlledStatus);
      });
      applyCorrectedFilter();
    }

    ensureCorrectedFilterOption();
    document.getElementById("import-line-filter")?.addEventListener("change", applyControlledStatuses);
    window.addEventListener("solverfin:inbox-statuses-updated", applyControlledStatuses);
    const detail = document.getElementById("import-batch-detail");
    if (detail) new MutationObserver(applyControlledStatuses).observe(detail, { childList: true, subtree: true });
    applyControlledStatuses();
  })();`;
}
