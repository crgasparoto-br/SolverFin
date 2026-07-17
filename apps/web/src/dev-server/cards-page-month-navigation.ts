import { apiGet } from "./api.js";
import { renderCardsPage } from "./cards-page.js";

interface InvoiceRecord {
  id: string;
  cardId: string;
  periodStartOn: string;
  periodEndOn: string;
}

interface CardPurchaseRecord {
  amountMinor: number;
  occurredOn: string;
  status: string;
}

interface HtmlElementRange {
  start: number;
  end: number;
  content: string;
}

interface PurchaseFilterState {
  search: string;
  reconciliations: Array<"unreconciled" | "reconciled">;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DEFAULT_RECONCILIATIONS = ["unreconciled", "reconciled"] as const;

export async function renderCardsPageWithMonthNavigation(token: string, url: URL): Promise<string> {
  const requestedMonth = normalizeInvoiceMonth(url.searchParams.get("month"));
  const requestedCardId = url.searchParams.get("cardId") ?? undefined;
  const requestedDay = normalizeDateOnly(url.searchParams.get("day"));
  const invoicesResult = await apiGet<{ invoices: InvoiceRecord[] }>(
    token,
    "/api/invoices?status=all",
  );
  const invoices = invoicesResult.ok ? invoicesResult.data.invoices : [];
  const renderUrl = new URL(url);

  if (requestedMonth && requestedCardId) {
    const invoice = findInvoiceForMonth(invoices, requestedCardId, requestedMonth);
    if (invoice) renderUrl.searchParams.set("invoiceId", invoice.id);
    else renderUrl.searchParams.delete("invoiceId");
  }

  let html = await renderCardsPage(token, renderUrl);
  const selectedCardId = requestedCardId ?? readInputValue(html, "data-card-input");
  let selectedInvoiceId = readInputValue(html, "data-invoice-input");
  let invoiceExistsForMonth = false;

  if (requestedMonth && selectedCardId) {
    const invoice = findInvoiceForMonth(invoices, selectedCardId, requestedMonth);
    invoiceExistsForMonth = invoice !== undefined;
    if (invoice && invoice.id !== selectedInvoiceId) {
      const retryUrl = new URL(url);
      retryUrl.searchParams.set("cardId", selectedCardId);
      retryUrl.searchParams.set("invoiceId", invoice.id);
      html = await renderCardsPage(token, retryUrl);
      selectedInvoiceId = invoice.id;
    }
  }

  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId);
  const selectedMonth =
    requestedMonth ?? monthFromInvoiceOptions(html, selectedInvoiceId) ?? currentMonth();
  const selectedDay = resolveInvoiceDay(requestedDay, selectedInvoice);
  const purchaseFilterState = resolvePurchaseFilterState(url);

  html = replaceMonthNavigation(html, url, selectedCardId, selectedMonth);
  html = upsertDayFilter(html, url, selectedCardId, selectedInvoice, selectedMonth, selectedDay);
  html = upsertCurrentMonthLink(html, url, selectedCardId);
  html = upsertPurchaseFilterState(html, purchaseFilterState);

  if (requestedMonth && selectedCardId && !invoiceExistsForMonth) {
    html = renderMissingInvoiceMonth(html, requestedMonth);
  } else if (selectedDay) {
    html = filterInvoicePurchasesByDay(html, selectedDay);
  }

  html = injectStyles(html);
  html = injectController(html);

  return html;
}

export function shiftInvoiceMonth(month: string, delta: number): string {
  const normalized = normalizeInvoiceMonth(month) ?? currentMonth();
  const year = Number(normalized.slice(0, 4));
  const monthIndex = Number(normalized.slice(5, 7)) - 1 + delta;
  const shifted = new Date(Date.UTC(year, monthIndex, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatInvoiceMonth(month: string): string {
  const normalized = normalizeInvoiceMonth(month) ?? currentMonth();
  const [year, number] = normalized.split("-").map(Number) as [number, number];
  const label = new Date(Date.UTC(year, number - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function resolveInvoiceDay(
  value: string | null | undefined,
  invoice: InvoiceRecord | undefined,
): string | undefined {
  const day = normalizeDateOnly(value);
  if (!day || !invoice) return undefined;
  return day >= invoice.periodStartOn && day <= invoice.periodEndOn ? day : undefined;
}

export function resolvePurchaseFilterState(url: URL): PurchaseFilterState {
  const search = (url.searchParams.get("search") ?? "").slice(0, 200);
  const reconciliation = url.searchParams.get("reconciliation");
  const reconciliations =
    reconciliation === null
      ? [...DEFAULT_RECONCILIATIONS]
      : reconciliation
          .split(",")
          .filter(
            (value): value is "unreconciled" | "reconciled" =>
              value === "unreconciled" || value === "reconciled",
          )
          .filter((value, index, values) => values.indexOf(value) === index);

  return { search, reconciliations };
}

function normalizeInvoiceMonth(value: string | null | undefined): string | undefined {
  return MONTH_PATTERN.test(value ?? "") ? (value ?? undefined) : undefined;
}

function normalizeDateOnly(value: string | null | undefined): string | undefined {
  if (!DATE_PATTERN.test(value ?? "")) return undefined;
  const day = value ?? "";
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day ? undefined : day;
}

function findInvoiceForMonth(
  invoices: readonly InvoiceRecord[],
  cardId: string,
  month: string,
): InvoiceRecord | undefined {
  return invoices.find(
    (invoice) => invoice.cardId === cardId && invoice.periodEndOn.slice(0, 7) === month,
  );
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function readInputValue(html: string, marker: string): string | undefined {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return undefined;
  const inputStart = html.lastIndexOf("<input", markerIndex);
  const inputEnd = html.indexOf(">", markerIndex);
  if (inputStart < 0 || inputEnd < 0) return undefined;
  return /\bvalue="([^"]*)"/.exec(html.slice(inputStart, inputEnd + 1))?.[1];
}

function monthFromInvoiceOptions(
  html: string,
  selectedInvoiceId: string | undefined,
): string | undefined {
  if (!selectedInvoiceId) return undefined;
  const match = /<script type="application\/json" data-invoice-options>([\s\S]*?)<\/script>/.exec(
    html,
  );
  if (!match?.[1]) return undefined;
  try {
    const options = JSON.parse(match[1]) as Array<{
      id?: string;
      label?: string;
    }>;
    return monthFromPortugueseLabel(
      options.find((option) => option.id === selectedInvoiceId)?.label,
    );
  } catch {
    return undefined;
  }
}

function monthFromPortugueseLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const match = /^([A-Za-zÀ-ÿ]+) de (\d{4})$/.exec(label.trim());
  if (!match?.[1] || !match[2]) return undefined;
  const months = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  const index = months.indexOf(match[1].toLocaleLowerCase("pt-BR"));
  return index < 0 ? undefined : `${match[2]}-${String(index + 1).padStart(2, "0")}`;
}

function replaceMonthNavigation(
  html: string,
  url: URL,
  cardId: string | undefined,
  month: string,
): string {
  const previousMonth = shiftInvoiceMonth(month, -1);
  const nextMonth = shiftInvoiceMonth(month, 1);
  const previousHref = buildMonthHref(url, cardId, previousMonth);
  const nextHref = buildMonthHref(url, cardId, nextMonth);
  const monthLabel = formatInvoiceMonth(month);
  const navigation = `<div class="month-nav">
              <a class="icon-btn month-nav-link" href="${escapeHtml(previousHref)}" aria-label="Fatura anterior" title="Fatura anterior">&#8249;</a>
              <input id="filter-invoice-month" type="month" name="month" value="${escapeHtml(month)}" data-invoice-month-input aria-label="Fatura ${escapeHtml(monthLabel)}" required />
              <a class="icon-btn month-nav-link" href="${escapeHtml(nextHref)}" aria-label="Próxima fatura" title="Próxima fatura">&#8250;</a>
            </div>`;

  return html.replace(/<div class="month-nav">[\s\S]*?<\/div>/, navigation);
}

function upsertDayFilter(
  html: string,
  url: URL,
  cardId: string | undefined,
  invoice: InvoiceRecord | undefined,
  month: string,
  day: string | undefined,
): string {
  let nextHtml = html
    .replace(/\s*<label\b[^>]*data-card-day-field[^>]*>[\s\S]*?<\/label>/g, "")
    .replace(/\s*<a\b[^>]*data-clear-card-day[^>]*>[\s\S]*?<\/a>/g, "");
  const marker = '<input type="hidden" name="invoiceId"';
  const index = nextHtml.indexOf(marker);
  if (index < 0) return nextHtml;

  const disabled = invoice ? "" : " disabled";
  const min = invoice?.periodStartOn ?? "";
  const max = invoice?.periodEndOn ?? "";
  const field = `          <label class="card-day-field" data-card-day-field>Dia
            <input id="filter-card-day" type="date" name="day" value="${escapeHtml(day ?? "")}" min="${escapeHtml(min)}" max="${escapeHtml(max)}" data-card-day-input aria-label="Filtrar compras por dia"${disabled} />
          </label>\n`;
  const clearHref = buildDayClearHref(url, cardId, month, invoice?.id);
  const clearLink = day
    ? `          <a class="ghost-btn card-day-clear" href="${escapeHtml(clearHref)}" data-clear-card-day role="button">Fatura completa</a>\n`
    : "";

  nextHtml = nextHtml.slice(0, index) + field + clearLink + nextHtml.slice(index);
  return nextHtml;
}

function upsertCurrentMonthLink(html: string, url: URL, cardId: string | undefined): string {
  let nextHtml = html
    .replace(/\s*<button\b[^>]*data-invoice-current[^>]*>[\s\S]*?<\/button>/g, "")
    .replace(/\s*<a\b[^>]*data-invoice-current[^>]*>[\s\S]*?<\/a>/g, "");
  const marker = '<input type="hidden" name="invoiceId"';
  const index = nextHtml.indexOf(marker);
  if (index < 0) return nextHtml;
  const href = buildMonthHref(url, cardId, currentMonth());
  const link = `          <a class="ghost-btn month-current-link" href="${escapeHtml(href)}" data-invoice-current role="button">Mês atual</a>\n`;
  nextHtml = nextHtml.slice(0, index) + link + nextHtml.slice(index);
  return nextHtml;
}

function upsertPurchaseFilterState(html: string, state: PurchaseFilterState): string {
  let nextHtml = html
    .replace(/\s*<input\b[^>]*data-purchase-search-state[^>]*\/?>(?:<\/input>)?/g, "")
    .replace(/\s*<input\b[^>]*data-purchase-reconciliation-state[^>]*\/?>(?:<\/input>)?/g, "");
  nextHtml = replaceMarkedElementAttribute(nextHtml, "data-purchase-search", "value", state.search);
  nextHtml = replaceMarkedElementAttribute(
    nextHtml,
    'data-reconciliation-toggle="unreconciled"',
    "aria-pressed",
    String(state.reconciliations.includes("unreconciled")),
  );
  nextHtml = replaceMarkedElementAttribute(
    nextHtml,
    'data-reconciliation-toggle="reconciled"',
    "aria-pressed",
    String(state.reconciliations.includes("reconciled")),
  );

  const marker = '<input type="hidden" name="invoiceId"';
  const index = nextHtml.indexOf(marker);
  if (index < 0) return nextHtml;
  const reconciliation = state.reconciliations.join(",");
  const searchDisabled = state.search ? "" : " disabled";
  const reconciliationDisabled =
    reconciliation === DEFAULT_RECONCILIATIONS.join(",") ? " disabled" : "";
  const controls = `          <input type="hidden" name="search" value="${escapeHtml(state.search)}" data-purchase-search-state${searchDisabled} />
          <input type="hidden" name="reconciliation" value="${escapeHtml(reconciliation)}" data-purchase-reconciliation-state${reconciliationDisabled} />\n`;
  return nextHtml.slice(0, index) + controls + nextHtml.slice(index);
}

function replaceMarkedElementAttribute(
  html: string,
  marker: string,
  attribute: string,
  value: string,
): string {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return html;
  const start = html.lastIndexOf("<", markerIndex);
  const end = html.indexOf(">", markerIndex);
  if (start < 0 || end < 0) return html;
  const tag = html.slice(start, end + 1);
  const pattern = new RegExp(`\\b${attribute}="[^"]*"`);
  const replacement = `${attribute}="${escapeHtml(value)}"`;
  const nextTag = pattern.test(tag)
    ? tag.replace(pattern, replacement)
    : tag.replace(/\s*\/?>(?:\s*)$/, (ending) => ` ${replacement}${ending}`);
  return html.slice(0, start) + nextTag + html.slice(end + 1);
}

function buildMonthHref(url: URL, cardId: string | undefined, month: string): string {
  const params = new URLSearchParams(url.searchParams);
  params.delete("invoiceId");
  params.delete("day");
  if (cardId) params.set("cardId", cardId);
  else params.delete("cardId");
  params.set("month", month);
  return `/cartoes?${params.toString()}`;
}

function buildDayClearHref(
  url: URL,
  cardId: string | undefined,
  month: string,
  invoiceId: string | undefined,
): string {
  const params = new URLSearchParams(url.searchParams);
  params.delete("day");
  if (cardId) params.set("cardId", cardId);
  else params.delete("cardId");
  params.set("month", month);
  if (invoiceId) params.set("invoiceId", invoiceId);
  else params.delete("invoiceId");
  return `/cartoes?${params.toString()}`;
}

function filterInvoicePurchasesByDay(html: string, day: string): string {
  const marker = '<div class="purchase-list" aria-label="Compras da fatura">';
  const start = html.indexOf(marker);
  if (start < 0) return html;
  const end = findElementEnd(html, start, "div");
  if (end < 0) return html;

  const section = html.slice(start, end);
  if (purchaseSectionHasError(section)) return html;
  const filtered = filterPurchaseSection(section, day);
  const purchases = collectPurchaseRecords(filtered);
  let nextHtml = html.slice(0, start) + filtered + html.slice(end);
  nextHtml = insertDaySummary(nextHtml, day, purchases);
  nextHtml = insertDayToolbarCopy(nextHtml, day);
  return nextHtml.replace("<h2>Detalhamento</h2>", "<h2>Detalhamento da fatura</h2>");
}

function purchaseSectionHasError(section: string): boolean {
  return /\brole="alert"/.test(section) || /class="[^"]*\berror\b[^"]*"/.test(section);
}

function filterPurchaseSection(section: string, day: string): string {
  const groups = collectElements(section, '<details class="purchase-group"', "details");
  let nextSection = section;

  if (groups.length > 0) {
    for (const group of [...groups].reverse()) {
      const filteredGroup = filterPurchaseGroup(group.content, day);
      nextSection =
        nextSection.slice(0, group.start) + filteredGroup + nextSection.slice(group.end);
    }
  } else {
    const rows = collectElements(section, '<article class="purchase-row"', "article");
    if (rows.length > 0) {
      const keptRows = rows.filter((row) => purchaseRecord(row.content)?.occurredOn === day);
      const first = rows[0];
      const last = rows.at(-1);
      if (first && last) {
        nextSection =
          section.slice(0, first.start) +
          keptRows.map((row) => row.content).join("\n") +
          section.slice(last.end);
      }
    }
  }

  return collectPurchaseRecords(nextSection).length > 0
    ? nextSection
    : `<div class="purchase-list" aria-label="Compras da fatura"><div class="empty-state"><strong>Nenhuma compra neste dia.</strong><p class="muted">Escolha outro dia ou use Fatura completa para visualizar todas as compras.</p></div></div>`;
}

function filterPurchaseGroup(group: string, day: string): string {
  const rows = collectElements(group, '<article class="purchase-row"', "article");
  const keptRows = rows.filter((row) => purchaseRecord(row.content)?.occurredOn === day);
  if (keptRows.length === 0) return "";

  const first = rows[0];
  const last = rows.at(-1);
  if (!first || !last) return group;
  const purchases = keptRows
    .map((row) => purchaseRecord(row.content))
    .filter((purchase): purchase is CardPurchaseRecord => purchase !== undefined);
  const totalMinor = purchases.reduce((sum, purchase) => sum + purchase.amountMinor, 0);
  const countLabel = purchases.length === 1 ? "1 compra" : `${purchases.length} compras`;
  let nextGroup =
    group.slice(0, first.start) +
    keptRows.map((row) => row.content).join("\n") +
    group.slice(last.end);
  nextGroup = nextGroup.replace(
    /<span class="muted">[\s\S]*?<\/span>/,
    `<span class="muted">${countLabel}</span>`,
  );
  return nextGroup.replace(
    /<strong class="debit">[\s\S]*?<\/strong>/,
    `<strong class="debit">${formatExpense(totalMinor)}</strong>`,
  );
}

function collectPurchaseRecords(html: string): CardPurchaseRecord[] {
  return collectElements(html, '<article class="purchase-row"', "article")
    .map((row) => purchaseRecord(row.content))
    .filter((purchase): purchase is CardPurchaseRecord => purchase !== undefined);
}

function purchaseRecord(row: string): CardPurchaseRecord | undefined {
  const match = /<script type="application\/json" data-purchase="[^"]*">([\s\S]*?)<\/script>/.exec(
    row,
  );
  if (!match?.[1]) return undefined;
  try {
    const value = JSON.parse(match[1]) as Partial<CardPurchaseRecord>;
    if (
      typeof value.amountMinor !== "number" ||
      typeof value.occurredOn !== "string" ||
      typeof value.status !== "string"
    ) {
      return undefined;
    }
    return {
      amountMinor: value.amountMinor,
      occurredOn: value.occurredOn,
      status: value.status,
    };
  } catch {
    return undefined;
  }
}

function insertDaySummary(
  html: string,
  day: string,
  purchases: readonly CardPurchaseRecord[],
): string {
  const asideMarker = '<aside class="panel invoice-summary" aria-label="Resumo da fatura">';
  const asideStart = html.indexOf(asideMarker);
  if (asideStart < 0) return html;
  const firstBlockStart = html.indexOf('<section class="summary-block">', asideStart);
  if (firstBlockStart < 0) return html;
  const firstBlockEnd = findElementEnd(html, firstBlockStart, "section");
  if (firstBlockEnd < 0) return html;

  const totalMinor = purchases.reduce((sum, purchase) => sum + purchase.amountMinor, 0);
  const reconciledMinor = purchases
    .filter((purchase) => purchase.status === "reconciled")
    .reduce((sum, purchase) => sum + purchase.amountMinor, 0);
  const unreconciledMinor = totalMinor - reconciledMinor;
  const daySummary = `
      <section class="summary-block card-day-summary" data-card-day-summary>
        <p class="eyebrow">Resumo do dia</p>
        <h2>${escapeHtml(formatDay(day))}</h2>
        <dl class="summary-list">
          ${summaryRow("Compras", String(purchases.length))}
          ${summaryRow("Despesas", formatExpense(totalMinor), "debit")}
          ${summaryRow("Total conciliado", formatExpense(reconciledMinor), "debit")}
          ${summaryRow("Total não conciliado", formatExpense(unreconciledMinor), "debit")}
        </dl>
      </section>`;
  return html.slice(0, firstBlockEnd) + daySummary + html.slice(firstBlockEnd);
}

function insertDayToolbarCopy(html: string, day: string): string {
  const toolbarStart = html.indexOf('<div class="invoice-toolbar">');
  if (toolbarStart < 0) return html;
  const headingEnd = html.indexOf("</h2>", toolbarStart);
  if (headingEnd < 0) return html;
  const insertionPoint = headingEnd + "</h2>".length;
  const copy = `<p class="muted" data-card-day-period>Compras de ${escapeHtml(formatDay(day))}</p>`;
  return html.slice(0, insertionPoint) + copy + html.slice(insertionPoint);
}

function summaryRow(label: string, value: string, tone?: string): string {
  return `<div class="summary-row"><dt>${escapeHtml(label)}</dt><dd${tone ? ` class="${tone}"` : ""}>${value}</dd></div>`;
}

function formatDay(day: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

function formatExpense(amountMinor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(-amountMinor / 100);
}

function injectStyles(html: string): string {
  if (html.includes("data-invoice-month-navigation-styles")) return html;
  const styles = `
    <style data-invoice-month-navigation-styles>
      .card-filter .filter-form{align-items:end;grid-template-columns:minmax(10rem,1.15fr) minmax(11rem,1fr) minmax(9rem,.8fr) max-content max-content minmax(10rem,.8fr)!important}
      .card-filter .filter-form>*{min-width:0}
      .card-filter .month-field{display:grid;gap:6px}
      .card-filter .card-day-field{display:grid;gap:6px;grid-column:3}
      .card-filter .card-day-field input{min-width:0;width:100%}
      .card-filter [data-clear-card-day]{grid-column:4;white-space:nowrap}
      .card-filter [data-invoice-current]{grid-column:5;white-space:nowrap}
      .card-filter .sort-field{grid-column:6;min-width:0}
      .card-filter .month-nav{align-items:center;background:var(--bg);border:1px solid var(--line);border-radius:var(--radius);display:grid;gap:4px;grid-template-columns:auto minmax(0,1fr) auto;padding:3px}
      .card-filter .month-nav-link{align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);color:var(--primary);display:inline-flex;justify-content:center;min-height:30px;min-width:30px;padding:0;text-decoration:none}
      .card-filter .month-nav-link:hover,.card-filter .month-nav-link:focus-visible{background:var(--primary-soft)}
      .card-filter .month-nav input[data-invoice-month-input]{background:transparent!important;border:0!important;border-radius:0;color:var(--text);font-size:.875rem;font-weight:400!important;min-height:30px;min-width:0;padding:0 2px!important;text-align:center;width:100%}
      .card-filter .month-nav input[data-invoice-month-input]:focus{border-radius:4px;outline:2px solid var(--cyan)}
      .card-filter .month-nav input[data-invoice-month-input]::-webkit-calendar-picker-indicator{cursor:pointer;display:block;opacity:1}
      .card-filter .month-current-link,.card-filter .card-day-clear{align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);color:var(--primary);display:inline-flex;justify-content:center;min-height:36px;padding:0 12px;text-decoration:none}
      .card-filter .month-current-link:hover,.card-filter .month-current-link:focus-visible,.card-filter .card-day-clear:hover,.card-filter .card-day-clear:focus-visible{background:var(--primary-soft)}
      .cards-layout,.invoice-summary,.invoice-panel,.summary-block,.summary-list,.summary-row{min-width:0}
      .summary-list{margin:0}
      .summary-row dd{margin:0;max-width:100%;overflow-x:auto;white-space:nowrap}
      .card-day-summary{background:var(--primary-soft);border:1px solid #c8dde5;border-radius:var(--radius);padding:10px}
      @media(max-width:760px){.card-filter .filter-form{grid-template-columns:1fr!important}.card-filter .card-day-field,.card-filter [data-clear-card-day],.card-filter [data-invoice-current],.card-filter .sort-field{grid-column:auto}.summary-row{display:grid;grid-template-columns:minmax(0,1fr) auto}.summary-row dt,.summary-row dd{min-width:0}}
    </style>`;
  return html.replace("</head>", `${styles}</head>`);
}

export function invoiceMonthNavigationControllerScript(): string {
  return `
    <script data-invoice-month-navigation-controller>
      (() => {
        const form = document.querySelector('form.filter-form[action="/cartoes"]');
        const monthInput = form?.querySelector('[data-invoice-month-input]');
        const invoiceInput = form?.querySelector('[data-invoice-input]');
        const dayInput = form?.querySelector('[data-card-day-input]');
        const clearDayLink = form?.querySelector('[data-clear-card-day]');
        const searchInput = document.querySelector('[data-purchase-search]');
        const searchStateInput = form?.querySelector('[data-purchase-search-state]');
        const reconciliationStateInput = form?.querySelector('[data-purchase-reconciliation-state]');
        const reconciliationToggles = Array.from(
          document.querySelectorAll('[data-reconciliation-toggle]'),
        );
        if (!form || !(monthInput instanceof HTMLInputElement)) return;

        function clearDayForSubmission() {
          if (!(dayInput instanceof HTMLInputElement)) return;
          dayInput.value = '';
          dayInput.disabled = true;
        }

        function activeReconciliations() {
          return reconciliationToggles
            .filter((toggle) => toggle.getAttribute('aria-pressed') === 'true')
            .map((toggle) => toggle.getAttribute('data-reconciliation-toggle'))
            .filter((value) => value === 'unreconciled' || value === 'reconciled');
        }

        function updateLink(link) {
          const href = link?.getAttribute?.('href');
          if (!href) return;
          const target = new URL(href, window.location.origin);
          const search = searchInput instanceof HTMLInputElement ? searchInput.value : '';
          const reconciliation = activeReconciliations().join(',');
          if (search) target.searchParams.set('search', search);
          else target.searchParams.delete('search');
          if (reconciliation === 'unreconciled,reconciled') {
            target.searchParams.delete('reconciliation');
          } else {
            target.searchParams.set('reconciliation', reconciliation);
          }
          link.setAttribute('href', target.pathname + target.search + target.hash);
        }

        function syncNavigationLinks() {
          document
            .querySelectorAll('.month-nav-link,[data-invoice-current],[data-clear-card-day]')
            .forEach(updateLink);
        }

        function syncSecondaryFilterState() {
          if (searchStateInput instanceof HTMLInputElement) {
            searchStateInput.value = searchInput instanceof HTMLInputElement ? searchInput.value : '';
            searchStateInput.disabled = !searchStateInput.value;
          }
          if (reconciliationStateInput instanceof HTMLInputElement) {
            reconciliationStateInput.value = activeReconciliations().join(',');
            reconciliationStateInput.disabled =
              reconciliationStateInput.value === 'unreconciled,reconciled';
          }
          syncNavigationLinks();
        }

        form.addEventListener(
          'change',
          (event) => {
            const target = event.target;
            if (target instanceof HTMLInputElement && target.name === 'cardId') {
              clearDayForSubmission();
            }
          },
          true,
        );

        monthInput.addEventListener('change', () => {
          if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(monthInput.value)) return;
          if (invoiceInput instanceof HTMLInputElement) invoiceInput.disabled = true;
          clearDayForSubmission();
          form.requestSubmit();
        });

        form.addEventListener('change', (event) => {
          const target = event.target;
          if (target !== dayInput || !(dayInput instanceof HTMLInputElement)) return;
          if (dayInput.value && (dayInput.value < dayInput.min || dayInput.value > dayInput.max)) {
            dayInput.value = '';
          }
          form.requestSubmit();
        });

        clearDayLink?.addEventListener('click', (event) => {
          event.preventDefault();
          clearDayForSubmission();
          syncSecondaryFilterState();
          form.requestSubmit();
        });

        if (searchInput instanceof HTMLInputElement) {
          searchInput.addEventListener('input', syncSecondaryFilterState);
        }
        reconciliationToggles.forEach((toggle) =>
          toggle.addEventListener('click', syncSecondaryFilterState),
        );

        form.addEventListener('submit', () => {
          syncSecondaryFilterState();
          if (dayInput instanceof HTMLInputElement && !dayInput.value) dayInput.disabled = true;
        });

        syncSecondaryFilterState();
      })();
    </script>`;
}

function injectController(html: string): string {
  if (html.includes("data-invoice-month-navigation-controller")) return html;
  return html.replace("</body>", `${invoiceMonthNavigationControllerScript()}</body>`);
}

function replaceInputValue(html: string, marker: string, value: string): string {
  const markerIndex = html.indexOf(marker);
  const start = markerIndex >= 0 ? html.lastIndexOf("<input", markerIndex) : -1;
  const end = markerIndex >= 0 ? html.indexOf(">", markerIndex) : -1;
  if (start < 0 || end < 0) return html;
  const tag = html.slice(start, end + 1);
  const nextTag = /\bvalue="[^"]*"/.test(tag)
    ? tag.replace(/\bvalue="[^"]*"/, `value="${escapeHtml(value)}"`)
    : tag.replace(/\s*\/>$/, ` value="${escapeHtml(value)}" />`);
  return html.slice(0, start) + nextTag + html.slice(end + 1);
}

function renderMissingInvoiceMonth(html: string, month: string): string {
  const label = formatInvoiceMonth(month);
  let nextHtml = replaceInputValue(html, "data-invoice-input", "");
  nextHtml = replaceElement(
    nextHtml,
    '<aside class="panel invoice-summary" aria-label="Resumo da fatura">',
    "aside",
    `<aside class="panel invoice-summary" aria-label="Resumo da fatura"><div class="empty-state"><strong>Nenhuma fatura em ${escapeHtml(label)}.</strong><p class="muted">Registre uma compra neste período para gerar a fatura automaticamente.</p></div></aside>`,
  );
  nextHtml = replaceElement(
    nextHtml,
    '<div class="purchase-list" aria-label="Compras da fatura">',
    "div",
    `<div class="purchase-list" aria-label="Compras da fatura"><div class="empty-state"><strong>Nenhuma compra nesta fatura.</strong><p class="muted">O mês selecionado ainda não possui uma fatura materializada.</p></div></div>`,
  );
  return replaceElement(nextHtml, '<dialog data-modal="payment">', "dialog", "");
}

function replaceElement(
  html: string,
  marker: string,
  tagName: string,
  replacement: string,
): string {
  const start = html.indexOf(marker);
  if (start < 0) return html;
  const end = findElementEnd(html, start, tagName);
  return end < 0 ? html : html.slice(0, start) + replacement + html.slice(end);
}

function collectElements(html: string, marker: string, tagName: string): HtmlElementRange[] {
  const elements: HtmlElementRange[] = [];
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
  const pattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  pattern.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    if (match[0].startsWith("</")) depth -= 1;
    else if (!match[0].endsWith("/>")) depth += 1;
    if (depth === 0) return pattern.lastIndex;
  }
  return -1;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
