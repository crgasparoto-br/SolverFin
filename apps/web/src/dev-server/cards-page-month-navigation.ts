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

  const selectedMonth =
    requestedMonth ?? monthFromInvoiceOptions(html, selectedInvoiceId) ?? currentMonth();

  html = replaceLegacyStepAttributes(html);
  html = upsertInvoiceMonthInput(html, selectedMonth);
  html = upsertCurrentMonthButton(html);
  html = injectStyles(html);
  html = injectController(html);

  if (requestedMonth && selectedCardId && !invoiceExistsForMonth) {
    html = renderMissingInvoiceMonth(html, requestedMonth);
  }

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

function monthFromInvoiceOptions(html: string, selectedInvoiceId: string | undefined): string | undefined {
  if (!selectedInvoiceId) return undefined;
  const match = /<script type="application\/json" data-invoice-options>([\s\S]*?)<\/script>/.exec(html);
  if (!match?.[1]) return undefined;
  try {
    const options = JSON.parse(match[1]) as Array<{ id?: string; label?: string }>;
    return monthFromPortugueseLabel(options.find((option) => option.id === selectedInvoiceId)?.label);
  } catch {
    return undefined;
  }
}

function monthFromPortugueseLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const match = /^([A-Za-zÀ-ÿ]+) de (\d{4})$/.exec(label.trim());
  if (!match?.[1] || !match[2]) return undefined;
  const months = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const index = months.indexOf(match[1].toLocaleLowerCase("pt-BR"));
  return index < 0 ? undefined : `${match[2]}-${String(index + 1).padStart(2, "0")}`;
}

function replaceLegacyStepAttributes(html: string): string {
  return html.replace(/data-invoice-step=/g, "data-month-step=");
}

function upsertInvoiceMonthInput(html: string, month: string): string {
  if (html.includes("data-invoice-month-input")) {
    return replaceInputValue(html, "data-invoice-month-input", month);
  }
  const input = `<input id="filter-invoice-month" type="month" name="month" value="${escapeHtml(month)}" data-invoice-month-input aria-label="Fatura ${escapeHtml(formatInvoiceMonth(month))}" required />`;
  const marker = /<span class="month-current" data-invoice-period-text>[\s\S]*?<\/span>/;
  return marker.test(html) ? html.replace(marker, input) : html;
}

function upsertCurrentMonthButton(html: string): string {
  if (html.includes("data-invoice-current")) return html;
  const marker = '<input type="hidden" name="invoiceId"';
  const index = html.indexOf(marker);
  if (index < 0) return html;
  const button = '          <button type="button" class="ghost-btn" data-invoice-current>Mês atual</button>\n';
  return html.slice(0, index) + button + html.slice(index);
}

function injectStyles(html: string): string {
  if (html.includes("data-invoice-month-navigation-styles")) return html;
  const styles = `
    <style data-invoice-month-navigation-styles>
      .card-filter .filter-form{grid-template-columns:minmax(12rem,1.2fr) minmax(13rem,1fr) auto}
      .card-filter .month-field{display:grid;gap:6px}
      .card-filter .month-nav{background:var(--surface);border:1px solid var(--line)}
      .card-filter .month-nav input[data-invoice-month-input]{appearance:auto;background:var(--surface)!important;border:1px solid transparent!important;color:var(--text);cursor:pointer;font:inherit;min-height:34px;padding:4px 8px;text-align:center}
      .card-filter .month-nav input[data-invoice-month-input]:hover{background:#f8fafc!important;border-color:#e2e8f0!important}
      .card-filter .month-nav input[data-invoice-month-input]:focus-visible{border-color:#94a3b8!important;outline:2px solid #cbd5e1;outline-offset:1px}
      .card-filter .month-nav input[data-invoice-month-input]::-webkit-calendar-picker-indicator{cursor:pointer;opacity:1}
      .card-filter button.ghost-btn[data-invoice-current]{background:var(--surface);border:1px solid var(--line);color:var(--text)}
      .card-filter button.ghost-btn[data-invoice-current]:hover{background:#f1f5f9}
      @media(max-width:760px){.card-filter .filter-form{grid-template-columns:1fr}}
    </style>`;
  return html.replace("</head>", `${styles}</head>`);
}

function injectController(html: string): string {
  if (html.includes("data-invoice-month-navigation-controller")) return html;
  const script = `
    <script data-invoice-month-navigation-controller>
      (() => {
        const form=document.querySelector('form.filter-form[action="/cartoes"]');
        const monthInput=form?.querySelector('[data-invoice-month-input]');
        const invoiceInput=form?.querySelector('[data-invoice-input]');
        if(!form||!(monthInput instanceof HTMLInputElement))return;
        const currentMonth=()=>{const now=new Date();return String(now.getFullYear())+'-'+String(now.getMonth()+1).padStart(2,'0')};
        const normalize=(value)=>/^\\d{4}-(0[1-9]|1[0-2])$/.test(value)?value:currentMonth();
        const shift=(value,delta)=>{const month=normalize(value);const date=new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1+delta,1);return String(date.getFullYear())+'-'+String(date.getMonth()+1).padStart(2,'0')};
        const submit=(month)=>{monthInput.value=month;if(invoiceInput instanceof HTMLInputElement)invoiceInput.value='';form.requestSubmit()};
        form.querySelectorAll('[data-month-step]').forEach((button)=>button.addEventListener('click',(event)=>{event.preventDefault();submit(shift(monthInput.value,Number(button.dataset.monthStep||0))) }));
        form.querySelector('[data-invoice-current]')?.addEventListener('click',(event)=>{event.preventDefault();submit(currentMonth())});
        monthInput.addEventListener('change',()=>submit(normalize(monthInput.value)));
        form.addEventListener('change',(event)=>{const target=event.target;if(target instanceof HTMLInputElement&&target.name==='cardId'&&invoiceInput instanceof HTMLInputElement)invoiceInput.value=''});
      })();
    </script>`;
  return html.replace("</body>", `${script}</body>`);
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
  nextHtml = replaceElement(nextHtml, '<aside class="panel invoice-summary" aria-label="Resumo da fatura">', "aside", `<aside class="panel invoice-summary" aria-label="Resumo da fatura"><div class="empty-state"><strong>Nenhuma fatura em ${escapeHtml(label)}.</strong><p class="muted">Registre uma compra neste período para gerar a fatura automaticamente.</p></div></aside>`);
  nextHtml = replaceElement(nextHtml, '<div class="purchase-list" aria-label="Compras da fatura">', "div", `<div class="purchase-list" aria-label="Compras da fatura"><div class="empty-state"><strong>Nenhuma compra nesta fatura.</strong><p class="muted">O mês selecionado ainda não possui uma fatura materializada.</p></div></div>`);
  return replaceElement(nextHtml, '<dialog data-modal="payment">', "dialog", "");
}

function replaceElement(html: string, marker: string, tagName: string, replacement: string): string {
  const start = html.indexOf(marker);
  if (start < 0) return html;
  const end = findElementEnd(html, start, tagName);
  return end < 0 ? html : html.slice(0, start) + replacement + html.slice(end);
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
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
