export type InboxControlledStatus = "corrected" | "confirmed" | undefined;

export interface InboxStatusRecord {
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

const STATUS_CONTROL_MARKER = 'data-inbox-status-control="enhanced"';
const STATUS_CONTROL_SCRIPT_MARKER = 'data-inbox-status-control-script="enhanced"';

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
  const bodyScript = `<script ${STATUS_CONTROL_SCRIPT_MARKER}>${inboxStatusPresentationScript()}</script>`;

  return html.replace("</head>", `${headScript}</head>`).replace("</body>", `${bodyScript}</body>`);
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
    }

    window.addEventListener("solverfin:inbox-statuses-updated", applyControlledStatuses);
    const detail = document.getElementById("import-batch-detail");
    if (detail) new MutationObserver(applyControlledStatuses).observe(detail, { childList: true, subtree: true });
    applyControlledStatuses();
  })();`;
}
