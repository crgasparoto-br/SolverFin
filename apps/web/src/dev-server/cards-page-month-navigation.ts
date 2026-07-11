import { apiGet } from "./api.js";
import { renderCardsPage } from "./cards-page.js";

interface InvoiceRecord {
  id: string;
  cardId: string;
  periodEndOn: string;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function renderCardsPageWithMonthNavigation(
  token: string,
  url: URL,
): Promise<string> {
  const requestedMonth = normalizeInvoiceMonth(url.searchParams.get("month"));
  const requestedCardId = url.searchParams.get("cardId") ?? undefined;
  const invoicesResult = requestedMonth
    ? await apiGet<{ invoices: InvoiceRecord[] }>(token, "/api/invoices?status=all")
    : undefined;
  const invoices = invoicesResult?.ok ? invoicesResult.data.invoices : [];
  const renderUrl = new URL(url);

  if (requestedMonth && requestedCardId) {
    const requestedInvoice = findInvoiceForMonth(invoices, requestedCardId, requestedMonth);
    if (requestedInvoice) renderUrl.searchParams.set("invoiceId", requestedInvoice.id);
    else renderUrl.searchParams.delete("invoiceId");
  }

  let html = await renderCardsPage(token, renderUrl);
  const selectedCardId = requestedCardId ?? readInputValue(html, "data-card-input");
  let selectedInvoiceId = readInputValue(html, "data-invoice-input");
  let selectedMonth = requestedMonth;
  let invoiceExistsForMonth = false;

  if (requestedMonth && selectedCardId) {
    const requestedInvoice = findInvoiceForMonth(invoices, selectedCardId, requestedMonth);
    invoiceExistsForMonth = requestedInvoice !== undefined;

    if (requestedInvoice && requestedInvoice.id !== selectedInvoiceId) {
      const retryUrl = new URL(url);
      retryUrl.searchParams.set("cardId", selectedCardId);
      retryUrl.searchParams.set("invoiceId", requestedInvoice.id);
      html = await renderCardsPage(token, retryUrl);
      selectedInvoiceId = requestedInvoice.id;
    }
  }

  if (!selectedMonth) {
    selectedMonth = monthFromInvoiceOptions(html, selectedInvoiceId) ?? currentMonth();
  }

  html = upsertInvoiceMonthInput(html, selectedMonth);
  html = replaceInvoicePeriodLabel(html, selectedMonth);
  html = injectInvoiceMonthNavigationScript(html);

  if (requestedMonth && selectedCardId && !invoiceExistsForMonth) {
    html = renderMissingInvoiceMonth(html, requestedMonth);
  }

  return html;
}

export function shiftInvoiceMonth(month: string, delta: number): string {
  const normalized = normalizeInvoiceMonth(month) ?? currentMonth();
  const year = Number(normalized.slice(0, 4));
  const monthIndex = Number(normalized.slice(5, 7)) - 1 + delta;
  return new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 7);
}

export function formatInvoiceMonth(month: string): string {
  const normalized = normalizeInvoiceMonth(month) ?? currentMonth();
  const year = Number(normalized.slice(0, 4));
  const monthIndex = Number(normalized.slice(5, 7)) - 1;
  const label = new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function normalizeInvoiceMonth(value: string | null | undefined): string | undefined {
  return MONTH_PATTERN.test(value ?? "") ? (value ?? undefined) : undefined;
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
  return new Date().toISOString().slice(0, 7);
}

function readInputValue(html: string, marker: string): string | undefined {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return undefined;
  const inputStart = html.lastIndexOf("<input", markerIndex);
  const inputEnd = html.indexOf(">", markerIndex);
  if (inputStart < 0 || inputEnd < 0) return undefined;
  return /\bvalue="([^"]*)"/.exec(html.slice(inputStart, inputEnd + 1))?.[1];
}

function monthFromInvoiceOptions(html: string, selectedInvoiceId: string | undefined): string | undefined {
  if (!selectedInvoiceId) return undefined;
  const match = /<script type="application\/json" data-invoice-options>([\s\S]*?)<\/script>/.exec(html);
  if (!match?.[1]) return undefined;
  try {
    const options = JSON.parse(match[1]) as Array<{ id?: string; label?: string }>;
    const label = options.find((option) => option.id === selectedInvoiceId)?.label;
    return monthFromPortugueseLabel(label);
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
  const monthIndex = months.indexOf(match[1].toLocaleLowerCase("pt-BR"));
  if (monthIndex < 0) return undefined;
  return `${match[2]}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function upsertInvoiceMonthInput(html: string, month: string): string {
  const existingMarker = "data-invoice-month-input";
  if (html.includes(existingMarker)) return replaceInputValue(html, existingMarker, month);

  const formStart = html.indexOf('<form class="filter-form"');
  const formEnd = formStart >= 0 ? html.indexOf("</form>", formStart) : -1;
  if (formEnd < 0) return html;

  const input = `          <input type="hidden" name="month" value="${escapeHtml(month)}" data-invoice-month-input />\n`;
  return html.slice(0, formEnd) + input + html.slice(formEnd);
}

function replaceInvoicePeriodLabel(html: string, month: string): string {
  return html.replace(
    /(<span class="month-current" data-invoice-period-text>)[\s\S]*?(<\/span>)/,
    `$1${escapeHtml(formatInvoiceMonth(month))}$2`,
  );
}

function replaceInputValue(html: string, marker: string, value: string): string {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return html;
  const inputStart = html.lastIndexOf("<input", markerIndex);
  const inputEnd = html.indexOf(">", markerIndex);
  if (inputStart < 0 || inputEnd < 0) return html;
  const tag = html.slice(inputStart, inputEnd + 1);
  const nextTag = /\bvalue="[^"]*"/.test(tag)
    ? tag.replace(/\bvalue="[^"]*"/, `value="${escapeHtml(value)}"`)
    : tag.replace(/\s*\/>$/, ` value="${escapeHtml(value)}" />`);
  return html.slice(0, inputStart) + nextTag + html.slice(inputEnd + 1);
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
  nextHtml = replaceElement(nextHtml, '<dialog data-modal="payment">', "dialog", "");
  return nextHtml;
}

function replaceElement(
  html: string,
  startMarker: string,
  tagName: string,
  replacement: string,
): string {
  const start = html.indexOf(startMarker);
  if (start < 0) return html;
  const end = findElementEnd(html, start, tagName);
  if (end < 0) return html;
  return html.slice(0, start) + replacement + html.slice(end);
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

function injectInvoiceMonthNavigationScript(html: string): string {
  const marker = "data-invoice-month-navigation-controller";
  if (html.includes(marker)) return html;
  const script = `
    <script ${marker}>
      (function () {
        const form = document.querySelector('form.filter-form[action="/cartoes"]');
        const monthInput = form && form.querySelector("[data-invoice-month-input]");
        if (!form || !monthInput) return;

        function shiftMonth(value, delta) {
          const match = /^\\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : new Date().toISOString().slice(0, 7);
          const year = Number(match.slice(0, 4));
          const monthIndex = Number(match.slice(5, 7)) - 1 + delta;
          return new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 7);
        }

        document.addEventListener("click", (event) => {
          const button = event.target && event.target.closest
            ? event.target.closest("[data-invoice-step]")
            : null;
          if (!button || !form.contains(button)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          monthInput.value = shiftMonth(monthInput.value, Number(button.dataset.invoiceStep || 0));
          const invoiceInput = form.querySelector("[data-invoice-input]");
          if (invoiceInput) invoiceInput.value = "";
          form.requestSubmit();
        }, true);

        document.addEventListener("change", (event) => {
          const target = event.target;
          if (!target || target.name !== "cardId" || !form.contains(target)) return;
          monthInput.value = "";
          const invoiceInput = form.querySelector("[data-invoice-input]");
          if (invoiceInput) invoiceInput.value = "";
        }, true);
      })();
    </script>
  `;
  return html.replace("</body>", `${script}</body>`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
