import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

export type ListSort =
  | "date_asc"
  | "date_desc"
  | "amount_desc"
  | "amount_asc"
  | "description_asc"
  | "description_desc";

interface SortableBlock {
  content: string;
  date: string;
  amountMinor: number;
  description: string;
  originalIndex: number;
}

const SUPPORTED_SORTS = new Set<ListSort>([
  "date_asc",
  "date_desc",
  "amount_desc",
  "amount_asc",
  "description_asc",
  "description_desc",
]);

export function enhanceStatementListSorting(html: string, url: URL): string {
  const sort = resolveListSort(url.searchParams.get("sort"), "date_asc");
  let nextHtml = injectSortControl(html, "/lancamentos", sort);
  nextHtml = sortStatementRows(nextHtml, sort);
  nextHtml = injectSortAssets(nextHtml);
  return injectAccountRemunerationStatementAssets(compactAccountRemunerationRows(nextHtml));
}

export function enhanceCardListSorting(html: string, url: URL): string {
  const sort = resolveListSort(url.searchParams.get("sort"), "date_desc");
  let nextHtml = injectSortControl(html, "/cartoes", sort);
  nextHtml = sortCardPurchaseRows(nextHtml, sort);
  return injectSortAssets(nextHtml);
}

export function resolveListSort(value: string | null | undefined, fallback: ListSort): ListSort {
  return SUPPORTED_SORTS.has(value as ListSort) ? (value as ListSort) : fallback;
}

function injectSortControl(html: string, action: string, sort: ListSort): string {
  if (html.includes(`data-list-sort-for="${action}"`)) return html;

  const formMarker = `<form class="filter-form" method="get" action="${action}"`;
  const formStart = html.indexOf(formMarker);
  const formEnd = formStart >= 0 ? html.indexOf("</form>", formStart) : -1;
  if (formEnd < 0) return html;

  const control = `
          <label class="sort-field" data-list-sort-for="${action}">
            Ordenar
            <select name="sort" data-list-sort>
              ${renderSortOption("date_asc", "Data: mais antigos", sort)}
              ${renderSortOption("date_desc", "Data: mais recentes", sort)}
              ${renderSortOption("amount_desc", "Maior valor", sort)}
              ${renderSortOption("amount_asc", "Menor valor", sort)}
              ${renderSortOption("description_asc", "Descrição: A–Z", sort)}
              ${renderSortOption("description_desc", "Descrição: Z–A", sort)}
            </select>
          </label>`;

  return html.slice(0, formEnd) + control + html.slice(formEnd);
}

function renderSortOption(value: ListSort, label: string, selected: ListSort): string {
  return `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`;
}

function sortStatementRows(html: string, sort: ListSort): string {
  const marker = '<div class="statement-table" role="table" aria-label="Extrato bancário">';
  const start = html.indexOf(marker);
  if (start < 0) return html;
  const end = findElementEnd(html, start, "div");
  if (end < 0) return html;

  const section = html.slice(start, end);
  const sortedSection = sortBlocks(
    section,
    '<article class="statement-row statement-body',
    "article",
    sort,
  );
  return html.slice(0, start) + sortedSection + html.slice(end);
}

function sortCardPurchaseRows(html: string, sort: ListSort): string {
  const groupMarker = '<div class="purchase-group-rows">';
  const groups = collectElements(html, groupMarker, "div");

  if (groups.length > 0) {
    let nextHtml = html;
    for (const group of [...groups].reverse()) {
      const sortedGroup = sortBlocks(
        group.content,
        '<article class="purchase-row"',
        "article",
        sort,
      );
      nextHtml = nextHtml.slice(0, group.start) + sortedGroup + nextHtml.slice(group.end);
    }
    return nextHtml;
  }

  const listMarker = '<div class="purchase-list" aria-label="Compras da fatura">';
  const listStart = html.indexOf(listMarker);
  if (listStart < 0) return html;
  const listEnd = findElementEnd(html, listStart, "div");
  if (listEnd < 0) return html;

  const list = html.slice(listStart, listEnd);
  const sortedList = sortBlocks(list, '<article class="purchase-row"', "article", sort);
  return html.slice(0, listStart) + sortedList + html.slice(listEnd);
}

function sortBlocks(fragment: string, marker: string, tagName: string, sort: ListSort): string {
  const elements = collectElements(fragment, marker, tagName);
  if (elements.length < 2) return fragment;

  const sortable = elements.map((element, index) => parseSortableBlock(element.content, index));
  sortable.sort((left, right) => compareSortableBlocks(left, right, sort));

  const first = elements[0];
  const last = elements[elements.length - 1];
  if (!first || !last) return fragment;

  return (
    fragment.slice(0, first.start) +
    sortable.map((item) => item.content).join("\n") +
    fragment.slice(last.end)
  );
}

function parseSortableBlock(content: string, originalIndex: number): SortableBlock {
  const record = parseEmbeddedRecord(content);
  const date =
    stringValue(record?.effectiveOn) ||
    stringValue(record?.plannedOn) ||
    stringValue(record?.occurredOn);
  const amountMinor = Math.abs(numberValue(record?.amountMinor));
  const description = stringValue(record?.description).trim();

  return {
    content,
    date,
    amountMinor,
    description,
    originalIndex,
  };
}

function parseEmbeddedRecord(content: string): Record<string, unknown> | undefined {
  const match =
    /<script type="application\/json" data-(?:transaction|purchase)="[^"]*">([\s\S]*?)<\/script>/.exec(
      content,
    );
  if (!match?.[1]) return undefined;

  try {
    return JSON.parse(decodeHtml(match[1])) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function compareSortableBlocks(left: SortableBlock, right: SortableBlock, sort: ListSort): number {
  let comparison = 0;

  if (sort === "date_asc") comparison = left.date.localeCompare(right.date);
  if (sort === "date_desc") comparison = right.date.localeCompare(left.date);
  if (sort === "amount_desc") comparison = right.amountMinor - left.amountMinor;
  if (sort === "amount_asc") comparison = left.amountMinor - right.amountMinor;
  if (sort === "description_asc") {
    comparison = left.description.localeCompare(right.description, "pt-BR", {
      sensitivity: "base",
    });
  }
  if (sort === "description_desc") {
    comparison = right.description.localeCompare(left.description, "pt-BR", {
      sensitivity: "base",
    });
  }

  if (comparison !== 0) return comparison;
  return left.originalIndex - right.originalIndex;
}

function collectElements(
  html: string,
  marker: string,
  tagName: string,
): Array<{ start: number; end: number; content: string }> {
  const elements: Array<{ start: number; end: number; content: string }> = [];
  let cursor = 0;

  while (cursor < html.length) {
    const start = html.indexOf(marker, cursor);
    if (start < 0) break;
    const end = findElementEnd(html, start, tagName);
    if (end < 0) break;
    elements.push({ start, end, content: html.slice(start, end) });
    cursor = end;
  }

  return elements;
}

function findElementEnd(html: string, start: number, tagName: string): number {
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(html))) {
    if (match.index < start) continue;
    if (match[0].startsWith("</")) depth -= 1;
    else if (!match[0].endsWith("/>")) depth += 1;
    if (depth === 0) return tagPattern.lastIndex;
  }

  return -1;
}

function injectSortAssets(html: string): string {
  let nextHtml = html;

  if (!nextHtml.includes("data-list-sorting-styles")) {
    const styles = `
      <style data-list-sorting-styles>
        form.filter-form[action="/lancamentos"],form.filter-form[action="/cartoes"]{grid-template-columns:minmax(14rem,1.2fr) minmax(13rem,1fr) auto minmax(12rem,.8fr)}
        .sort-field{min-width:12rem}
        form.filter-form[action="/cartoes"] .month-nav input[type="month"]{background:transparent;border:0;font-weight:800;min-height:34px;padding:0 4px;text-align:center}
        button.account-select-trigger:hover:not(:disabled),button.account-select-trigger:focus-visible,button.account-select-trigger[aria-expanded="true"]{background:var(--primary-soft);border-color:#c8dde5;color:var(--text)}
        .purchase-row,.statement-row.statement-body{transition:background 120ms ease-out,border-color 120ms ease-out}
        .purchase-row:hover,.statement-row.statement-body:hover{background:#f6fafb}
        .toggle-chip:hover:not(:disabled),.toggle-chip:focus-visible{background:#f1f7f9;border-color:#a5cbd6;color:var(--primary)}
        .toggle-chip[aria-pressed="true"]:hover:not(:disabled){background:#dceef3}
        .ghost-button:hover:not(:disabled),.ghost-button:focus-visible,.recurrence-scope-actions .secondary-button:hover:not(:disabled),.recurrence-scope-actions .secondary-button:focus-visible{background:var(--primary-soft);border-color:#c8dde5;color:var(--primary)}
        .actions-item:hover:not(:disabled),.actions-item:focus-visible{background:var(--primary-soft);color:var(--text)}
        .actions-item.danger:hover:not(:disabled),.actions-item.danger:focus-visible{background:var(--danger-bg);color:var(--danger)}
        @media(max-width:900px){form.filter-form[action="/lancamentos"]{grid-template-columns:1fr}form.filter-form[action="/lancamentos"] .month-nav input[type="month"]{min-width:10rem}form.filter-form[action="/cartoes"]{grid-template-columns:1fr 1fr}.sort-field{min-width:0}}
        @media(max-width:760px){form.filter-form[action="/lancamentos"],form.filter-form[action="/cartoes"]{grid-template-columns:1fr}}
      </style>`;
    nextHtml = nextHtml.replace("</head>", `${styles}</head>`);
  }

  if (!nextHtml.includes("data-list-sorting-controller")) {
    const script = `
      <script data-list-sorting-controller>
        document.addEventListener("change", (event) => {
          const target = event.target;
          if (!target || !target.matches || !target.matches("[data-list-sort]")) return;
          if (target.form) target.form.requestSubmit();
        });
      </script>`;
    nextHtml = nextHtml.replace("</body>", `${script}</body>`);
  }

  return nextHtml;
}

interface AccountRemunerationStatementRecord {
  competenceOn: string;
  balanceBaseMinor: number;
  dailyRatePercent: number;
  remunerationPercent: number;
  originalAmountMinor: number;
  manuallyAdjusted: boolean;
}

function compactAccountRemunerationRows(html: string): string {
  const rows = collectElements(html, '<article class="statement-row statement-body', "article");
  let nextHtml = html;

  for (const row of [...rows].reverse()) {
    const record = parseEmbeddedRecord(row.content);
    const remuneration = accountRemunerationRecord(record?.accountRemuneration);
    if (!remuneration) continue;

    const compactTitle = "<strong>Remuneração CDI</strong>";
    let compactRow = row.content.replace(
      /(<div class="description col-description">\s*)<strong>[\s\S]*?<\/strong>/,
      `$1${compactTitle}`,
    );
    compactRow = compactRow.replace(
      /<section class="account-remuneration-audit"[^>]*>[\s\S]*?<\/section>/,
      renderCompactAccountRemuneration(remuneration),
    );

    nextHtml = nextHtml.slice(0, row.start) + compactRow + nextHtml.slice(row.end);
  }

  return nextHtml;
}

function accountRemunerationRecord(value: unknown): AccountRemunerationStatementRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.competenceOn !== "string" ||
    typeof record.balanceBaseMinor !== "number" ||
    typeof record.dailyRatePercent !== "number" ||
    typeof record.remunerationPercent !== "number" ||
    typeof record.originalAmountMinor !== "number" ||
    typeof record.manuallyAdjusted !== "boolean"
  ) {
    return undefined;
  }

  return {
    competenceOn: record.competenceOn,
    balanceBaseMinor: record.balanceBaseMinor,
    dailyRatePercent: record.dailyRatePercent,
    remunerationPercent: record.remunerationPercent,
    originalAmountMinor: record.originalAmountMinor,
    manuallyAdjusted: record.manuallyAdjusted,
  };
}

function renderCompactAccountRemuneration(
  remuneration: AccountRemunerationStatementRecord,
): string {
  const adjustment = remuneration.manuallyAdjusted
    ? '<span class="account-remuneration-adjustment adjusted">Ajustado manualmente</span>'
    : "";

  return `<details class="account-remuneration-audit">
<summary>Ver memória do cálculo</summary>
<div class="account-remuneration-audit-content">
  ${adjustment}
  <dl>
    <div><dt>Competência</dt><dd>${escapeHtml(formatDateOnly(remuneration.competenceOn))}</dd></div>
    <div><dt>Saldo-base</dt><dd>${escapeHtml(formatMinorCurrency(remuneration.balanceBaseMinor))}</dd></div>
    <div><dt>CDI diário</dt><dd>${escapeHtml(formatPercentage(remuneration.dailyRatePercent, 8))}</dd></div>
    <div><dt>Percentual aplicado</dt><dd>${escapeHtml(formatPercentage(remuneration.remunerationPercent, 4))}</dd></div>
    <div><dt>Valor original</dt><dd>${escapeHtml(formatMinorCurrency(remuneration.originalAmountMinor))}</dd></div>
  </dl>
</div>
        </details>
        <span class="account-remuneration-summary">Competência ${escapeHtml(formatDateOnly(remuneration.competenceOn))} · ${escapeHtml(formatPercentage(remuneration.remunerationPercent, 4))} do CDI</span>`;
}

function formatPercentage(value: number, maximumFractionDigits: number): string {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits }).format(value)}%`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function injectAccountRemunerationStatementAssets(html: string): string {
  let nextHtml = html;

  if (!nextHtml.includes("data-account-remuneration-statement-styles")) {
    const styles = `
      <style data-account-remuneration-statement-styles>
        .statement-row.account-remuneration-row{border-left:3px solid var(--primary)}
        .account-remuneration-badge{background:var(--primary-soft);border-radius:999px;color:var(--primary);display:inline-flex;font-size:.6875rem;font-weight:800;margin-left:6px;padding:2px 7px;vertical-align:middle}
        .account-remuneration-audit{background:var(--surface-soft);border:1px solid var(--line);border-radius:var(--radius);display:grid;gap:7px;margin-top:5px;padding:8px}
        .account-remuneration-audit-heading{align-items:center;display:flex;flex-wrap:wrap;gap:6px;justify-content:space-between}
        .account-remuneration-audit-heading>strong{font-size:.75rem}
        .account-remuneration-adjustment{border-radius:999px;font-size:.6875rem;font-weight:800;padding:2px 7px}
        .account-remuneration-adjustment.original{background:var(--primary-soft);color:var(--primary)}
        .account-remuneration-adjustment.adjusted{background:var(--warning-bg);color:var(--warning)}
        .account-remuneration-audit dl{display:grid;gap:5px;grid-template-columns:repeat(5,minmax(0,1fr));margin:0}
        .account-remuneration-audit dl div{display:grid;gap:1px;min-width:0}
        .account-remuneration-audit dt{color:var(--muted);font-size:.625rem;font-weight:700;text-transform:uppercase}
        .account-remuneration-audit dd{font-size:.6875rem;font-weight:700;margin:0;overflow-wrap:anywhere}
        [data-remuneration-protected="true"]{background:var(--surface-soft);cursor:not-allowed}
        .remuneration-edit-notice{background:var(--primary-soft);border:1px solid #c8dde5;border-radius:var(--radius);color:var(--text);font-size:.8125rem;grid-column:1 / -1;line-height:1.45;padding:10px}
        .statement-row.account-remuneration-row .col-description{min-width:15rem}
        .statement-row.account-remuneration-row .description{display:block}
        .statement-row.account-remuneration-row .description>strong{display:inline}
        .account-remuneration-summary{color:var(--muted);display:block;font-size:.75rem;line-height:1.35}
        .account-remuneration-audit{background:transparent;border:0;display:inline-block;gap:0;margin:0 0 0 6px;padding:0;vertical-align:baseline}
        .account-remuneration-audit[open]{display:block;margin-left:0}
        .account-remuneration-audit summary{align-items:center;color:var(--primary);cursor:pointer;display:inline-flex;font-size:.6875rem;font-weight:700;gap:2px;line-height:1.2;list-style:none;padding:0;white-space:nowrap}
        .account-remuneration-audit summary::-webkit-details-marker{display:none}
        .account-remuneration-audit summary::after{display:none}
        .account-remuneration-audit-content{background:var(--surface-soft);border:1px solid var(--line);border-radius:var(--radius);display:grid;gap:7px;margin-top:4px;padding:8px}
        .account-remuneration-audit-content .account-remuneration-adjustment{background:var(--warning-bg);color:var(--warning);justify-self:start}
        .account-remuneration-audit-content dl{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr));margin:0}
        .account-remuneration-audit-content dd{font-size:.75rem}
        @media(max-width:760px){.account-remuneration-audit-content dl{grid-template-columns:repeat(2,minmax(0,1fr))}}
      </style>`;
    nextHtml = nextHtml.replace("</head>", `${styles}</head>`);
  }

  if (!nextHtml.includes("data-account-remuneration-statement-controller")) {
    const script = `
      <script data-account-remuneration-statement-controller>
        (() => {
          const remunerationIds = new Set();
          const form = document.querySelector("[data-form]");

          function readRecord(node) {
            try { return JSON.parse(node.textContent || "{}"); } catch (_error) { return {}; }
          }

          function unlockProtectedFields() {
            if (!form) return;
            form.dataset.remunerationProtected = "false";
            form.querySelectorAll("[data-remuneration-protected]").forEach((field) => {
              field.removeAttribute("data-remuneration-protected");
              field.removeAttribute("aria-disabled");
              if ("readOnly" in field) field.readOnly = false;
            });
            const notice = form.querySelector("[data-remuneration-edit-notice]");
            if (notice) notice.remove();
          }

          function protectField(field) {
            if (!field) return;
            field.setAttribute("data-remuneration-protected", "true");
            field.setAttribute("aria-disabled", "true");
            field.dataset.remunerationValue = field.value;
            if ("readOnly" in field) field.readOnly = true;
          }

          function lockRemunerationFields() {
            if (!form) return;
            unlockProtectedFields();
            form.dataset.remunerationProtected = "true";
            const repeatMode = form.elements.repeatMode;
            if (repeatMode) repeatMode.value = "single";
            [form.elements.kind, form.elements.plannedOn, form.elements.description, repeatMode].forEach(protectField);
            const saveRow = form.querySelector(".save-row");
            if (saveRow && !form.querySelector("[data-remuneration-edit-notice]")) {
              const notice = document.createElement("p");
              notice.className = "remuneration-edit-notice";
              notice.setAttribute("data-remuneration-edit-notice", "");
              notice.textContent = "Neste lançamento, altere somente o valor creditado, a categoria, a situação e a data efetiva. Conta, tipo, competência e memória do cálculo permanecem protegidos.";
              saveRow.before(notice);
            }
          }

          if (form) {
            form.addEventListener("mousedown", (event) => {
              const target = event.target;
              if (target && target.matches && target.matches('select[data-remuneration-protected="true"]')) event.preventDefault();
            }, true);
            form.addEventListener("keydown", (event) => {
              const target = event.target;
              if (target && target.matches && target.matches('select[data-remuneration-protected="true"]')) event.preventDefault();
            }, true);
            form.addEventListener("change", (event) => {
              const target = event.target;
              if (target && target.matches && target.matches('[data-remuneration-protected="true"]')) {
                target.value = target.dataset.remunerationValue || target.value;
              }
            }, true);
          }

          document.querySelectorAll("script[data-transaction]").forEach((node) => {
            const transaction = readRecord(node);
            if (transaction.source !== "account_remuneration") return;
            remunerationIds.add(transaction.id);
            const row = node.closest(".statement-row.statement-body");
            if (!row) return;
            row.classList.add("account-remuneration-row");
            const description = row.querySelector(".description strong");
            if (description && !description.querySelector(".account-remuneration-badge") && !row.querySelector(".account-remuneration-summary")) {
              const badge = document.createElement("span");
              badge.className = "account-remuneration-badge";
              badge.textContent = "Remuneração CDI";
              description.appendChild(badge);
              const details = document.createElement("small");
              details.className = "account-remuneration-details";
              details.textContent = "A descrição preserva competência, saldo-base, taxa CDI, percentual aplicado e valor originalmente calculado.";
              description.parentElement && description.parentElement.appendChild(details);
            }
            const clone = row.querySelector('[data-clone="' + transaction.id + '"]');
            if (clone) clone.remove();
          });

          document.addEventListener("click", (event) => {
            const target = event.target && event.target.closest ? event.target.closest("[data-edit], [data-open-modal]") : null;
            if (!target) return;
            const transactionId = target.getAttribute("data-edit");
            if (transactionId && remunerationIds.has(transactionId)) {
              window.setTimeout(lockRemunerationFields, 0);
            } else {
              unlockProtectedFields();
            }
          }, true);
        })();
      </script>`;
    nextHtml = nextHtml.replace("</body>", `${script}</body>`);
  }

  return nextHtml;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
