import { icon } from "./icons.js";

interface PurchaseSummary {
  reconciled: number;
  total: number;
  unreconciled: number;
}

const pageTitle = "<title>Cart\u00f5es de Cr\u00e9dito - SolverFin</title>";
const enhancementMarker = "data-cards-interface-enhanced";

export function enhanceCardsInterface(html: string): string {
  if (!html.includes(pageTitle)) return html;
  if (html.includes(enhancementMarker)) return html;

  const summary = readPurchaseSummary(html);
  let enhanced = html.replace("<main>", `<main ${enhancementMarker}>`);

  enhanced = enhanceHeading(enhanced);
  enhanced = enhanceFilterPanel(enhanced);
  enhanced = enhanceInvoiceSummary(enhanced);
  enhanced = enhancePurchaseWorkspace(enhanced, summary);
  enhanced = enhanceDialogs(enhanced);
  enhanced = injectStyles(enhanced);
  enhanced = injectController(enhanced);

  return enhanced;
}

function readPurchaseSummary(html: string): PurchaseSummary {
  const statuses = Array.from(
    html.matchAll(/data-reconciliation="(reconciled|unreconciled)"/g),
  ).map((match) => match[1]);
  const reconciled = statuses.filter((status) => status === "reconciled").length;
  const unreconciled = statuses.filter((status) => status === "unreconciled").length;
  return { reconciled, total: statuses.length, unreconciled };
}

function enhanceHeading(html: string): string {
  return html
    .replace(
      '<section class="cards-heading">',
      '<section class="cards-heading cards-hero" aria-labelledby="cards-page-title">',
    )
    .replace(
      '<p class="eyebrow">Rotina de cart\u00f5es</p>',
      '<p class="eyebrow">Gest\u00e3o da fatura</p>',
    )
    .replace(
      '<h1>Cart\u00f5es de Cr\u00e9dito</h1>',
      '<h1 id="cards-page-title">Cart\u00f5es de Cr\u00e9dito</h1>',
    )
    .replace(
      "Acompanhe a fatura do cart\u00e3o, registre compras e fa\u00e7a a baixa do pagamento.",
      "Acompanhe gastos, limites e pagamentos em uma \u00fanica vis\u00e3o.",
    )
    .replace(
      'title="Registrar nova compra no cart\u00e3o"',
      'title="Registrar compra no cart\u00e3o" aria-label="Registrar compra no cart\u00e3o"',
    );
}

function enhanceFilterPanel(html: string): string {
  return html.replace(
    '<section class="panel card-filter">',
    '<section class="panel card-filter" aria-label="Selecionar cart\u00e3o e per\u00edodo da fatura">',
  );
}

function enhanceInvoiceSummary(html: string): string {
  const marker = '<aside class="panel invoice-summary" aria-label="Resumo da fatura">';
  const start = html.indexOf(marker);
  if (start < 0) return html;
  const end = findElementEnd(html, start, "aside");
  if (end < 0) return html;

  const original = html.slice(start, end);
  if (!original.includes("Valor a pagar")) return html;

  const status =
    extractMatch(original, /<p class="eyebrow">Fatura ([^<]+)<\/p>/) || "Fatura";
  const amountDue = normalizeDebitDisplay(
    extractSummaryValue(original, "Valor a pagar"),
  );
  const invoiceTotal = normalizeDebitDisplay(extractSummaryValue(original, "Total"));
  const dueOn = extractSummaryValue(original, "Vencimento");
  const closingOn = extractSummaryValue(original, "Fechamento");
  const actions = extractElement(original, '<div class="invoice-actions">', "div");
  const statusPresentation = invoiceStatusPresentation(status);

  const overview = `
        <section class="invoice-overview" aria-labelledby="invoice-overview-title">
          <div class="invoice-overview-heading">
            <span class="invoice-overview-icon" aria-hidden="true">${icon("credit-card", 18)}</span>
            <div>
              <p class="eyebrow">Fatura selecionada</p>
              <h2 id="invoice-overview-title">Resumo da fatura</h2>
            </div>
            <span class="invoice-status invoice-status-${statusPresentation.tone}">${icon(statusPresentation.icon, 13)}<span>${escapeHtml(status)}</span></span>
          </div>
          <div class="invoice-amount-due">
            <span>Valor a pagar</span>
            <strong>${amountDue || "R$ 0,00"}</strong>
            ${invoiceTotal ? `<small>Total da fatura: ${invoiceTotal}</small>` : ""}
          </div>
          <dl class="invoice-key-dates">
            <div><dt>${icon("calendar", 13)} Fechamento</dt><dd>${closingOn || "-"}</dd></div>
            <div><dt>${icon("clock", 13)} Vencimento</dt><dd>${dueOn || "-"}</dd></div>
          </dl>
          ${actions}
        </section>`;

  let nextAside = actions ? original.replace(actions, "") : original;
  nextAside = nextAside.replace(/\s*<p class="eyebrow">Fatura [^<]+<\/p>/, "");
  nextAside = nextAside.replace(marker, `${marker}${overview}`);
  nextAside = nextAside
    .replace(
      '<h2>Fatura atual (R$)</h2>',
      `<h2 class="summary-block-title">${icon("receipt", 13)} Composi\u00e7\u00e3o da fatura</h2>`,
    )
    .replace(summaryRowPattern("Fechamento"), "")
    .replace(summaryRowPattern("Vencimento"), "")
    .replace(summaryRowPattern("Valor a pagar"), "")
    .replace(
      '<h2>Detalhamento</h2>',
      `<h2 class="summary-block-title">${icon("check-circle", 13)} Concilia\u00e7\u00e3o</h2>`,
    )
    .replace(
      '<h2>Totais por cart\u00e3o (R$)</h2>',
      `<h2 class="summary-block-title">${icon("layers", 13)} Compras por instrumento</h2>`,
    )
    .replace(
      '<h2>Limite (Total)</h2>',
      `<h2 class="summary-block-title">${icon("wallet", 13)} Limite do cart\u00e3o</h2>`,
    )
    .replace(
      /<section class="summary-block">/g,
      '<section class="summary-block summary-section">',
    );

  return html.slice(0, start) + nextAside + html.slice(end);
}

function summaryRowPattern(label: string): RegExp {
  return new RegExp(
    `\\s*<div class="summary-row(?: summary-row-strong)?"><dt>${escapeRegExp(label)}</dt><dd[^>]*>[\\s\\S]*?<\\/dd><\\/div>`,
  );
}

function extractSummaryValue(html: string, label: string): string {
  const pattern = new RegExp(
    `<div class="summary-row(?: summary-row-strong)?"><dt>${escapeRegExp(label)}</dt><dd[^>]*>([\\s\\S]*?)<\\/dd><\\/div>`,
  );
  return stripHtml(pattern.exec(html)?.[1] ?? "").trim();
}

function invoiceStatusPresentation(status: string): {
  icon: Parameters<typeof icon>[0];
  tone: string;
} {
  const normalized = status.toLocaleLowerCase("pt-BR");
  if (normalized.includes("paga")) return { icon: "check-circle", tone: "success" };
  if (normalized.includes("vencida") || normalized.includes("cancelada")) {
    return { icon: "alert-triangle", tone: "danger" };
  }
  if (normalized.includes("fechada")) return { icon: "lock", tone: "neutral" };
  return { icon: "clock", tone: "active" };
}

function normalizeDebitDisplay(value: string): string {
  return value.replace(/^\s*-\s*/, "");
}

function enhancePurchaseWorkspace(html: string, summary: PurchaseSummary): string {
  let enhanced = html.replace(
    '<section class="panel invoice-panel">',
    '<section class="panel invoice-panel" aria-labelledby="invoice-purchases-title">',
  );
  enhanced = enhanced.replace(
    /<h2>(Fatura de [\s\S]*?|Selecione um cart\u00e3o)<\/h2>/,
    '<h2 id="invoice-purchases-title">$1</h2>',
  );
  enhanced = enhancePurchaseSearch(enhanced);
  enhanced = enhanceReconciliationToggle(
    enhanced,
    "unreconciled",
    summary.unreconciled,
  );
  enhanced = enhanceReconciliationToggle(enhanced, "reconciled", summary.reconciled);
  enhanced = insertPurchaseResultStatus(enhanced, summary.total);
  enhanced = enhancePurchaseRows(enhanced);
  enhanced = insertPurchaseTableHeader(enhanced, summary.total);
  enhanced = insertFilteredEmptyState(enhanced);
  return enhanced;
}

function enhancePurchaseSearch(html: string): string {
  return html.replace(
    /<input\b([^>]*\bdata-purchase-search\b[^>]*)>/,
    (_match, rawAttributes: string) => {
      let attributes = rawAttributes;
      attributes = upsertAttribute(attributes, "id", "purchase-search-input");
      attributes = upsertAttribute(
        attributes,
        "aria-label",
        "Buscar compras da fatura",
      );
      attributes = upsertAttribute(attributes, "autocomplete", "off");
      return `<label class="purchase-search" for="purchase-search-input">
                <span class="visually-hidden">Buscar compras da fatura</span>
                <span class="purchase-search-icon" aria-hidden="true">${icon("search", 15)}</span>
                <input${attributes}>
                <button type="button" class="purchase-search-clear" data-clear-purchase-search aria-label="Limpar busca" title="Limpar busca" hidden>${icon("x", 14)}</button>
              </label>`;
    },
  );
}

function enhanceReconciliationToggle(
  html: string,
  status: "reconciled" | "unreconciled",
  count: number,
): string {
  const label = status === "reconciled" ? "Conciliadas" : "N\u00e3o conciliadas";
  const iconName = status === "reconciled" ? "check-circle" : "clock";
  const title =
    status === "reconciled"
      ? "Mostrar compras conciliadas"
      : "Mostrar compras n\u00e3o conciliadas";
  const pattern = new RegExp(
    `<button([^>]*data-reconciliation-toggle="${status}"[^>]*)>[\\s\\S]*?<\\/button>`,
  );
  return html.replace(
    pattern,
    `<button$1 title="${title}">${icon(iconName, 12)}<span>${label}</span><small>${count}</small></button>`,
  );
}

function insertPurchaseResultStatus(html: string, total: number): string {
  const marker = '<div class="filter-controls">';
  const start = html.indexOf(marker);
  if (start < 0) return html;
  const end = findElementEnd(html, start, "div");
  if (end < 0) return html;
  const status = `<p class="purchase-results-status" data-purchase-results-status aria-live="polite">${formatPurchaseCount(total)}</p>`;
  return html.slice(0, end) + status + html.slice(end);
}

function enhancePurchaseRows(html: string): string {
  const elements = collectElements(html, '<article class="purchase-row"', "article");
  let enhanced = html;
  for (const element of elements.reverse()) {
    const row = enhancePurchaseRow(element.content);
    enhanced = enhanced.slice(0, element.start) + row + enhanced.slice(element.end);
  }
  return enhanced;
}

function enhancePurchaseRow(row: string): string {
  return row
    .replace(
      /<article class="([^"]*\bpurchase-row\b[^"]*)"([^>]*)>/,
      '<article class="$1"$2 role="row">',
    )
    .replace(
      /<time datetime="([^"]+)">/,
      '<time class="purchase-date" role="cell" data-label="Data" datetime="$1">',
    )
    .replace(
      '<div class="description">',
      '<div class="description purchase-description" role="cell">',
    )
    .replace(
      /<span class="chip chip-(ok|posted)">([^<]+)<\/span>/,
      (_match, tone: string, label: string) => {
        const iconName = tone === "ok" ? "check-circle" : "clock";
        const statusTone = tone === "ok" ? "ok" : "pending";
        return `<span class="purchase-status purchase-status-${statusTone}" role="cell" data-label="Situa\u00e7\u00e3o" title="${escapeHtml(label)}">${icon(iconName, 14)}<span>${escapeHtml(label)}</span></span>`;
      },
    )
    .replace(
      '<strong class="debit">',
      '<strong class="debit purchase-amount" role="cell" data-label="Valor">',
    )
    .replace(
      '<details class="actions">',
      '<details class="actions purchase-actions" role="cell" data-label="A\u00e7\u00f5es">',
    )
    .replace(
      /<summary aria-label="A\u00e7\u00f5es da compra ([^"]+)">/,
      '<summary aria-label="A\u00e7\u00f5es da compra $1" title="A\u00e7\u00f5es da compra">',
    );
}

function insertPurchaseTableHeader(html: string, total: number): string {
  const marker = '<div class="purchase-list" aria-label="Compras da fatura">';
  const start = html.indexOf(marker);
  if (start < 0) return html;
  const openingEnd = html.indexOf(">", start);
  if (openingEnd < 0) return html;

  const opening = `<div class="purchase-list" aria-label="Compras da fatura" role="table" aria-rowcount="${total}">`;
  const header = total
    ? `<div class="purchase-table-head" role="row">
              <span role="columnheader">Data</span>
              <span role="columnheader">Compra</span>
              <span role="columnheader">Situa\u00e7\u00e3o</span>
              <span role="columnheader">Valor</span>
              <span role="columnheader" class="purchase-head-actions">A\u00e7\u00f5es</span>
            </div>`
    : "";
  return html.slice(0, start) + opening + header + html.slice(openingEnd + 1);
}

function insertFilteredEmptyState(html: string): string {
  if (html.includes("data-purchase-filter-empty")) return html;
  const marker = '<div class="purchase-list" aria-label="Compras da fatura"';
  const start = html.indexOf(marker);
  if (start < 0) return html;
  const end = findElementEnd(html, start, "div");
  if (end < 0) return html;
  const empty = `
          <div class="purchase-filter-empty" data-purchase-filter-empty hidden>
            ${icon("search", 18)}
            <strong>Nenhuma compra encontrada</strong>
            <p class="muted">Revise a busca ou os filtros de concilia\u00e7\u00e3o.</p>
            <button type="button" class="secondary-button" data-reset-purchase-filters>Limpar busca e filtros</button>
          </div>`;
  return html.slice(0, end) + empty + html.slice(end);
}

function enhanceDialogs(html: string): string {
  let enhanced = enhanceDialog(
    html,
    "purchase",
    "purchase-modal-title",
    "Informe os dados da compra e escolha como ela deve se repetir.",
  );
  enhanced = enhanceDialog(
    enhanced,
    "payment",
    "payment-modal-title",
    "Confirme a conta, a data e o valor usado para pagar esta fatura.",
  );
  return enhanced;
}

function enhanceDialog(
  html: string,
  name: string,
  titleId: string,
  description: string,
): string {
  const marker = `<dialog data-modal="${name}">`;
  const start = html.indexOf(marker);
  if (start < 0) return html;
  const end = findElementEnd(html, start, "dialog");
  if (end < 0) return html;

  let dialog = html.slice(start, end);
  dialog = dialog.replace(
    marker,
    `<dialog data-modal="${name}" aria-labelledby="${titleId}" aria-describedby="${titleId}-description">`,
  );
  dialog = dialog.replace(
    '<form method="dialog" class="close-form"><button type="submit">Fechar</button></form>',
    `<form method="dialog" class="close-form"><button type="submit" class="modal-close" aria-label="Fechar modal" title="Fechar">${icon("x", 15)}</button></form>`,
  );
  dialog = dialog.replace(
    /<h2([^>]*)>([^<]+)<\/h2>/,
    `<h2$1 id="${titleId}">$2</h2><p id="${titleId}-description" class="modal-description muted">${description}</p>`,
  );

  return html.slice(0, start) + dialog + html.slice(end);
}

function injectStyles(html: string): string {
  if (html.includes("data-cards-interface-styles")) return html;
  const styles = `
    <style data-cards-interface-styles>
      main[data-cards-interface-enhanced]{max-width:1600px;min-width:0}
      main[data-cards-interface-enhanced] .cards-hero{min-width:0}
      main[data-cards-interface-enhanced] .cards-hero h1{letter-spacing:-.015em}
      main[data-cards-interface-enhanced] .cards-layout{grid-template-columns:minmax(288px,320px) minmax(0,1fr);gap:14px}
      main[data-cards-interface-enhanced] .invoice-summary{gap:0;padding:0;overflow:hidden}
      main[data-cards-interface-enhanced] .invoice-overview{background:var(--surface-soft);border-bottom:1px solid var(--line);display:grid;gap:12px;padding:16px}
      main[data-cards-interface-enhanced] .invoice-overview-heading{align-items:center;display:grid;gap:9px;grid-template-columns:auto minmax(0,1fr) auto}
      main[data-cards-interface-enhanced] .invoice-overview-icon{align-items:center;background:var(--primary);border-radius:var(--radius);color:#fff;display:inline-flex;height:34px;justify-content:center;width:34px}
      main[data-cards-interface-enhanced] .invoice-status{align-items:center;border:1px solid currentColor;border-radius:999px;display:inline-flex;font-size:.6875rem;font-weight:700;gap:4px;padding:3px 7px;white-space:nowrap}
      main[data-cards-interface-enhanced] .invoice-status-active{background:#e0f2fe;color:#0369a1}
      main[data-cards-interface-enhanced] .invoice-status-success{background:var(--success-bg);color:var(--success)}
      main[data-cards-interface-enhanced] .invoice-status-danger{background:var(--danger-bg);color:var(--danger)}
      main[data-cards-interface-enhanced] .invoice-status-neutral{background:var(--bg);color:var(--muted)}
      main[data-cards-interface-enhanced] .invoice-amount-due{display:grid;gap:2px}
      main[data-cards-interface-enhanced] .invoice-amount-due>span{color:var(--muted);font-size:.6875rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
      main[data-cards-interface-enhanced] .invoice-amount-due strong{color:var(--danger);font-size:clamp(1.45rem,3vw,1.8rem);font-variant-numeric:tabular-nums;letter-spacing:-.025em;line-height:1.15;overflow-wrap:normal;white-space:nowrap}
      main[data-cards-interface-enhanced] .invoice-amount-due small{color:var(--muted);font-size:.75rem}
      main[data-cards-interface-enhanced] .invoice-key-dates{display:grid;gap:8px;grid-template-columns:1fr 1fr}
      main[data-cards-interface-enhanced] .invoice-key-dates>div{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);display:grid;gap:2px;min-width:0;padding:8px}
      main[data-cards-interface-enhanced] .invoice-key-dates dt{align-items:center;color:var(--muted);display:flex;font-size:.6875rem;font-weight:700;gap:4px}
      main[data-cards-interface-enhanced] .invoice-key-dates dd{font-size:.8125rem;font-weight:700;margin:0}
      main[data-cards-interface-enhanced] .invoice-overview .invoice-actions{display:flex;flex-wrap:wrap;gap:6px}
      main[data-cards-interface-enhanced] .invoice-overview .invoice-actions>button{flex:1 1 auto}
      main[data-cards-interface-enhanced] .summary-section{border-top:1px solid var(--line);gap:7px;padding:12px 16px}
      main[data-cards-interface-enhanced] .summary-section:first-of-type{border-top:0}
      main[data-cards-interface-enhanced] .summary-block-title{align-items:center;display:flex;font-size:.75rem;gap:6px}
      main[data-cards-interface-enhanced] .summary-list{gap:5px}
      main[data-cards-interface-enhanced] .summary-row{font-size:.78125rem}
      main[data-cards-interface-enhanced] .summary-row dt{font-weight:500}
      main[data-cards-interface-enhanced] .summary-row dd{font-variant-numeric:tabular-nums;overflow-wrap:normal;white-space:nowrap}
      main[data-cards-interface-enhanced] .invoice-panel{overflow:hidden}
      main[data-cards-interface-enhanced] .invoice-toolbar{align-items:start;display:grid;gap:10px;grid-template-columns:minmax(14rem,1fr) minmax(20rem,auto)}
      main[data-cards-interface-enhanced] .invoice-toolbar>.filter-controls{align-items:center;display:flex;justify-content:flex-end;min-width:0}
      main[data-cards-interface-enhanced] .purchase-search{display:block;min-width:min(18rem,100%);position:relative}
      main[data-cards-interface-enhanced] .purchase-search input{min-height:36px;padding-left:34px;padding-right:34px;width:100%}
      main[data-cards-interface-enhanced] .purchase-search-icon{color:var(--muted);left:10px;pointer-events:none;position:absolute;top:50%;transform:translateY(-50%);z-index:1}
      main[data-cards-interface-enhanced] .purchase-search-clear{background:transparent;border:0;color:var(--muted);height:28px;min-height:28px;padding:0;position:absolute;right:4px;top:4px;width:28px}
      main[data-cards-interface-enhanced] .purchase-search-clear:hover:not(:disabled){background:var(--neutral-control-hover);color:var(--primary)}
      main[data-cards-interface-enhanced] .toggle-chip{align-items:center;display:inline-flex;gap:5px}
      main[data-cards-interface-enhanced] .toggle-chip small{align-items:center;background:rgba(15,61,76,.08);border-radius:999px;display:inline-flex;font-size:.6875rem;height:18px;justify-content:center;min-width:18px;padding:0 5px}
      main[data-cards-interface-enhanced] .purchase-results-status{color:var(--muted);font-size:.75rem;grid-column:1 / -1;text-align:right}
      main[data-cards-interface-enhanced] .purchase-list{display:grid;padding:0 14px 14px}
      main[data-cards-interface-enhanced] .purchase-table-head{align-items:center;background:#f1f7fa;border-bottom:1px solid var(--line);color:var(--muted);display:grid;font-size:.6875rem;font-weight:700;gap:10px;grid-template-columns:6rem minmax(0,1fr) 7.5rem 8rem 3rem;margin:0 -14px;padding:7px 14px;text-transform:uppercase}
      main[data-cards-interface-enhanced] .purchase-table-head span:nth-child(4){text-align:right}
      main[data-cards-interface-enhanced] .purchase-head-actions{text-align:center}
      main[data-cards-interface-enhanced] .purchase-group{border-top:0}
      main[data-cards-interface-enhanced] .purchase-group+.purchase-group{border-top:1px solid var(--line)}
      main[data-cards-interface-enhanced] .purchase-group-summary{min-height:42px;padding:10px 2px}
      main[data-cards-interface-enhanced] .purchase-row{border-top:1px solid var(--line);grid-template-columns:6rem minmax(0,1fr) 7.5rem 8rem 3rem;min-height:46px;padding:8px 2px;transition:background 120ms ease-out}
      main[data-cards-interface-enhanced] .purchase-row:hover{background:var(--neutral-control-hover)}
      main[data-cards-interface-enhanced] .purchase-date{color:var(--muted);font-size:.8125rem}
      main[data-cards-interface-enhanced] .purchase-description strong{overflow-wrap:anywhere}
      main[data-cards-interface-enhanced] .purchase-status{align-items:center;border:1px solid currentColor;border-radius:999px;display:inline-flex;font-size:.6875rem;font-weight:700;gap:4px;justify-self:start;padding:3px 7px;white-space:nowrap}
      main[data-cards-interface-enhanced] .purchase-status-ok{background:var(--success-bg);color:var(--success)}
      main[data-cards-interface-enhanced] .purchase-status-pending{background:#e0f2fe;color:#0369a1}
      main[data-cards-interface-enhanced] .purchase-amount{font-variant-numeric:tabular-nums;justify-self:end;overflow-wrap:normal;white-space:nowrap}
      main[data-cards-interface-enhanced] .purchase-actions{justify-self:center}
      main[data-cards-interface-enhanced] .purchase-actions summary{height:32px;width:32px}
      main[data-cards-interface-enhanced] .purchase-filter-empty{align-items:center;background:var(--bg);border:1px dashed var(--line);border-radius:var(--radius-lg);display:grid;gap:5px;justify-items:center;margin:0 14px 14px;padding:20px;text-align:center}
      main[data-cards-interface-enhanced] .purchase-filter-empty[hidden]{display:none}
      main[data-cards-interface-enhanced] dialog{max-height:min(92dvh,760px);overflow:auto}
      main[data-cards-interface-enhanced] .modal-panel{position:relative}
      main[data-cards-interface-enhanced] .close-form{position:absolute;right:12px;top:12px;z-index:2}
      main[data-cards-interface-enhanced] .modal-close{background:var(--surface);border:1px solid var(--line);color:var(--muted);height:36px;min-height:36px;padding:0;width:36px}
      main[data-cards-interface-enhanced] .modal-close:hover:not(:disabled){background:var(--neutral-control-hover);border-color:var(--neutral-control-border-hover);color:var(--primary)}
      main[data-cards-interface-enhanced] .modal-panel>div{padding-right:42px}
      main[data-cards-interface-enhanced] .modal-description{font-size:.8125rem;margin-top:3px}
      main[data-cards-interface-enhanced] .visually-hidden{border:0!important;clip:rect(0 0 0 0)!important;height:1px!important;margin:-1px!important;overflow:hidden!important;padding:0!important;position:absolute!important;white-space:nowrap!important;width:1px!important}
      @media(max-width:1080px){main[data-cards-interface-enhanced] .cards-layout{grid-template-columns:1fr}main[data-cards-interface-enhanced] .invoice-summary{position:static}main[data-cards-interface-enhanced] .invoice-toolbar{grid-template-columns:1fr}main[data-cards-interface-enhanced] .invoice-toolbar>.filter-controls{justify-content:flex-start}main[data-cards-interface-enhanced] .purchase-results-status{text-align:left}}
      @media(max-width:760px){main[data-cards-interface-enhanced]{padding:14px 14px 26px}main[data-cards-interface-enhanced] .cards-hero{align-items:stretch;display:grid}main[data-cards-interface-enhanced] .cards-hero>button{min-height:44px;width:100%}main[data-cards-interface-enhanced] .filter-form{grid-template-columns:1fr}main[data-cards-interface-enhanced] .account-field{grid-template-columns:minmax(0,1fr) 44px}main[data-cards-interface-enhanced] .ghost-link{height:44px;width:44px}main[data-cards-interface-enhanced] .month-nav{min-height:44px}main[data-cards-interface-enhanced] .month-nav .icon-btn,main[data-cards-interface-enhanced] .month-nav-link{min-height:36px;min-width:36px}main[data-cards-interface-enhanced] .invoice-key-dates{grid-template-columns:1fr 1fr}main[data-cards-interface-enhanced] .invoice-overview .invoice-actions{display:grid}main[data-cards-interface-enhanced] .invoice-overview .invoice-actions>button{min-height:44px;width:100%}main[data-cards-interface-enhanced] .invoice-toolbar>.filter-controls{display:grid;grid-template-columns:1fr 1fr;width:100%}main[data-cards-interface-enhanced] .purchase-search{grid-column:1 / -1;min-width:0;width:100%}main[data-cards-interface-enhanced] .purchase-search input{min-height:44px}main[data-cards-interface-enhanced] .purchase-search-clear{height:36px;min-height:36px;right:4px;top:4px;width:36px}main[data-cards-interface-enhanced] .toggle-chip{justify-content:center;min-height:40px;padding-inline:8px}main[data-cards-interface-enhanced] .purchase-table-head{display:none}main[data-cards-interface-enhanced] .purchase-list{padding:0 12px 12px}main[data-cards-interface-enhanced] .purchase-group-summary{grid-template-columns:auto minmax(0,1fr) auto;padding:12px 0}main[data-cards-interface-enhanced] .purchase-group-summary::before{grid-row:1 / span 2}main[data-cards-interface-enhanced] .purchase-group-summary .muted{grid-column:2}main[data-cards-interface-enhanced] .purchase-group-summary strong{grid-column:3;grid-row:1 / span 2}main[data-cards-interface-enhanced] .purchase-row{align-items:center;background:var(--surface);grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;min-height:0;padding:12px 0}main[data-cards-interface-enhanced] .purchase-row:hover{background:var(--surface)}main[data-cards-interface-enhanced] .purchase-description{grid-column:1 / -1;grid-row:1}main[data-cards-interface-enhanced] .purchase-date,main[data-cards-interface-enhanced] .purchase-status,main[data-cards-interface-enhanced] .purchase-amount,main[data-cards-interface-enhanced] .purchase-actions{align-items:center;display:flex;gap:6px;justify-self:stretch}main[data-cards-interface-enhanced] [data-label]::before{color:var(--muted);content:attr(data-label);font-size:.6875rem;font-weight:700;min-width:3.75rem;text-transform:uppercase}main[data-cards-interface-enhanced] .purchase-date{grid-column:1}main[data-cards-interface-enhanced] .purchase-status{border:0;border-radius:0;grid-column:1;justify-content:flex-start;padding:0}main[data-cards-interface-enhanced] .purchase-amount{grid-column:2;grid-row:2;justify-content:flex-end}main[data-cards-interface-enhanced] .purchase-amount::before{display:none}main[data-cards-interface-enhanced] .purchase-actions{grid-column:2;grid-row:3;justify-content:flex-end}main[data-cards-interface-enhanced] .purchase-actions::before{display:none}main[data-cards-interface-enhanced] .purchase-actions summary{height:40px;width:40px}main[data-cards-interface-enhanced] dialog{border-radius:var(--radius-lg) var(--radius-lg) 0 0;margin:auto 0 0;max-height:92dvh;max-width:none;width:100%}main[data-cards-interface-enhanced] .modal-panel{padding:16px}main[data-cards-interface-enhanced] .modal-panel form:not(.close-form){grid-template-columns:1fr}main[data-cards-interface-enhanced] .modal-panel form:not(.close-form)>button{min-height:44px}main[data-cards-interface-enhanced] .modal-close{height:40px;min-height:40px;width:40px}}
      @media(max-width:420px){main[data-cards-interface-enhanced] .invoice-key-dates{grid-template-columns:1fr}main[data-cards-interface-enhanced] .invoice-overview-heading{grid-template-columns:auto minmax(0,1fr)}main[data-cards-interface-enhanced] .invoice-status{grid-column:1 / -1;justify-self:start;margin-left:43px}main[data-cards-interface-enhanced] .invoice-toolbar>.filter-controls{grid-template-columns:1fr}main[data-cards-interface-enhanced] .purchase-search{grid-column:1}main[data-cards-interface-enhanced] .toggle-chip{width:100%}}
    </style>`;
  return html.replace("</head>", `${styles}</head>`);
}

function injectController(html: string): string {
  if (html.includes("data-cards-interface-controller")) return html;
  const controller = `
    <script data-cards-interface-controller>
      (() => {
        const root = document.querySelector("main[data-cards-interface-enhanced]");
        if (!root) return;
        const list = root.querySelector('.purchase-list[aria-label="Compras da fatura"]');
        const rows = Array.from(root.querySelectorAll("[data-purchase-item]"));
        const search = root.querySelector("[data-purchase-search]");
        const clear = root.querySelector("[data-clear-purchase-search]");
        const toggles = Array.from(root.querySelectorAll("[data-reconciliation-toggle]"));
        const status = root.querySelector("[data-purchase-results-status]");
        const empty = root.querySelector("[data-purchase-filter-empty]");
        const reset = root.querySelector("[data-reset-purchase-filters]");

        function updateResults() {
          const visible = rows.filter((row) => !row.hidden && !row.closest("[data-instrument-purchase-group]")?.hidden).length;
          if (status) status.textContent = visible + (visible === 1 ? " compra exibida" : " compras exibidas");
          if (empty) empty.hidden = rows.length === 0 || visible > 0;
          if (clear) clear.hidden = !String(search?.value || "").trim();
          if (list) list.setAttribute("aria-rowcount", String(visible));
        }

        search?.addEventListener("input", () => requestAnimationFrame(updateResults));
        toggles.forEach((toggle) => toggle.addEventListener("click", () => requestAnimationFrame(updateResults)));
        clear?.addEventListener("click", () => {
          if (!search) return;
          search.value = "";
          search.dispatchEvent(new Event("input", { bubbles: true }));
          search.focus();
        });
        reset?.addEventListener("click", () => {
          if (search) {
            search.value = "";
            search.dispatchEvent(new Event("input", { bubbles: true }));
          }
          toggles.forEach((toggle) => {
            if (toggle.getAttribute("aria-pressed") !== "true") toggle.click();
          });
        });

        if (list) {
          const observer = new MutationObserver(() => requestAnimationFrame(updateResults));
          observer.observe(list, {
            attributes: true,
            attributeFilter: ["hidden"],
            subtree: true,
          });
        }

        root.querySelectorAll("[data-open-modal]").forEach((button) => {
          button.addEventListener("click", () =>
            requestAnimationFrame(() => {
              const dialog = root.querySelector(
                'dialog[data-modal="' + button.dataset.openModal + '"]',
              );
              dialog
                ?.querySelector(
                  "input:not([type=hidden]):not([disabled]), select:not([disabled]), button:not([disabled])",
                )
                ?.focus();
            }),
          );
        });

        updateResults();
      })();
    </script>`;
  return html.replace("</body>", `${controller}</body>`);
}

function upsertAttribute(attributes: string, name: string, value: string): string {
  const pattern = new RegExp(`\\s${escapeRegExp(name)}="[^"]*"`);
  if (pattern.test(attributes)) {
    return attributes.replace(pattern, ` ${name}="${value}"`);
  }
  return `${attributes} ${name}="${value}"`;
}

function extractElement(html: string, marker: string, tagName: string): string {
  const start = html.indexOf(marker);
  if (start < 0) return "";
  const end = findElementEnd(html, start, tagName);
  return end < 0 ? "" : html.slice(start, end);
}

function collectElements(
  html: string,
  marker: string,
  tagName: string,
): Array<{ content: string; end: number; start: number }> {
  const elements: Array<{ content: string; end: number; start: number }> = [];
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf(marker, cursor);
    if (start < 0) break;
    const end = findElementEnd(html, start, tagName);
    if (end < 0) break;
    elements.push({ content: html.slice(start, end), end, start });
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

function extractMatch(html: string, pattern: RegExp): string {
  return stripHtml(pattern.exec(html)?.[1] ?? "").trim();
}

function formatPurchaseCount(count: number): string {
  return `${count} ${count === 1 ? "compra exibida" : "compras exibidas"}`;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
