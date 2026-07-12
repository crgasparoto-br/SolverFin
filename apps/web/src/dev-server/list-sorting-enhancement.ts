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
  return injectSortAssets(nextHtml);
}

export function enhanceCardListSorting(html: string, url: URL): string {
  const sort = resolveListSort(url.searchParams.get("sort"), "date_desc");
  let nextHtml = injectSortControl(html, "/cartoes", sort);
  nextHtml = sortCardPurchaseRows(nextHtml, sort);
  return injectSortAssets(nextHtml);
}

export function resolveListSort(
  value: string | null | undefined,
  fallback: ListSort,
): ListSort {
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
    '<article class="statement-row statement-body"',
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

function sortBlocks(
  fragment: string,
  marker: string,
  tagName: string,
  sort: ListSort,
): string {
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
  const match = /<script type="application\/json" data-(?:transaction|purchase)="[^"]*">([\s\S]*?)<\/script>/.exec(
    content,
  );
  if (!match?.[1]) return undefined;

  try {
    return JSON.parse(decodeHtml(match[1])) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function compareSortableBlocks(
  left: SortableBlock,
  right: SortableBlock,
  sort: ListSort,
): number {
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
        @media(max-width:900px){form.filter-form[action="/lancamentos"],form.filter-form[action="/cartoes"]{grid-template-columns:1fr 1fr}.sort-field{min-width:0}}
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
