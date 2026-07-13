interface PurchaseBlock {
  content: string;
  amountMinor: number;
  instrumentId: string;
}

interface InstrumentPurchaseGroup {
  instrumentId: string;
  label: string;
  purchases: PurchaseBlock[];
  totalMinor: number;
}

const UNASSIGNED_INSTRUMENT_ID = "__unassigned__";

export function enhanceCardInstrumentSubtotals(html: string): string {
  if (html.includes("data-instrument-purchase-group")) return html;

  const listMarker = '<div class="purchase-list" aria-label="Compras da fatura">';
  const listStart = html.indexOf(listMarker);
  if (listStart < 0) return html;
  const listEnd = findElementEnd(html, listStart, "div");
  if (listEnd < 0) return html;

  const listHtml = html.slice(listStart, listEnd);
  const purchaseElements = collectElements(listHtml, '<article class="purchase-row"', "article");
  if (purchaseElements.length === 0) return html;

  const instrumentLabels = readInstrumentLabels(html);
  const groups = buildInstrumentPurchaseGroups(purchaseElements, instrumentLabels);
  if (groups.length === 0) return html;

  const openingTagEnd = html.indexOf(">", listStart);
  const closingTagStart = html.lastIndexOf("</div>", listEnd);
  if (openingTagEnd < 0 || closingTagStart < 0) return html;

  const groupedRows = groups.map(renderInstrumentPurchaseGroup).join("");
  let nextHtml =
    html.slice(0, openingTagEnd + 1) + groupedRows + html.slice(closingTagStart);
  nextHtml = injectInstrumentSummaryBreakdown(nextHtml, groups);
  return injectInstrumentAssets(nextHtml);
}

function readInstrumentLabels(html: string): Map<string, string> {
  const labels = new Map<string, string>();
  const selectMatch = /<select name="cardInstrumentId"[^>]*>([\s\S]*?)<\/select>/.exec(html);
  if (!selectMatch?.[1]) return labels;

  for (const option of selectMatch[1].matchAll(/<option value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/g)) {
    const instrumentId = decodeHtml(option[1] ?? "").trim();
    const label = stripHtml(decodeHtml(option[2] ?? "")).trim();
    if (instrumentId && label && label !== "Nenhum instrumento ativo") {
      labels.set(instrumentId, label);
    }
  }

  return labels;
}

function buildInstrumentPurchaseGroups(
  purchaseElements: Array<{ content: string }>,
  instrumentLabels: Map<string, string>,
): InstrumentPurchaseGroup[] {
  const order: string[] = [];
  const groups = new Map<string, InstrumentPurchaseGroup>();

  purchaseElements.forEach((element) => {
    const record = parseEmbeddedPurchase(element.content);
    const instrumentId = stringValue(record?.cardInstrumentId) || UNASSIGNED_INSTRUMENT_ID;
    const amountMinor = numberValue(record?.amountMinor);
    let group = groups.get(instrumentId);

    if (!group) {
      group = {
        instrumentId,
        label: resolveInstrumentLabel(instrumentId, instrumentLabels),
        purchases: [],
        totalMinor: 0,
      };
      groups.set(instrumentId, group);
      order.push(instrumentId);
    }

    group.purchases.push({ content: element.content, amountMinor, instrumentId });
    group.totalMinor += amountMinor;
  });

  return order.map((instrumentId) => groups.get(instrumentId)).filter(isDefined);
}

function resolveInstrumentLabel(instrumentId: string, labels: Map<string, string>): string {
  if (instrumentId === UNASSIGNED_INSTRUMENT_ID) return "Sem instrumento identificado";
  return labels.get(instrumentId) ?? "Instrumento arquivado";
}

function renderInstrumentPurchaseGroup(group: InstrumentPurchaseGroup): string {
  const purchaseCountLabel =
    group.purchases.length === 1 ? "1 compra" : `${group.purchases.length} compras`;
  const instrumentAttribute =
    group.instrumentId === UNASSIGNED_INSTRUMENT_ID
      ? ""
      : ` data-instrument-id="${escapeHtml(group.instrumentId)}"`;

  return `
    <details class="purchase-group instrument-purchase-group" data-instrument-purchase-group${instrumentAttribute} open>
      <summary class="purchase-group-summary">
        <span class="purchase-group-name" data-instrument-label>${escapeHtml(group.label)}</span>
        <span class="muted">${purchaseCountLabel}</span>
        <strong class="debit">${formatMoney(-group.totalMinor)}</strong>
      </summary>
      <div class="purchase-group-rows">
        ${group.purchases.map((purchase) => purchase.content).join("\n")}
      </div>
    </details>`;
}

function injectInstrumentSummaryBreakdown(
  html: string,
  groups: InstrumentPurchaseGroup[],
): string {
  const heading = "<h2>Totais por cartão (R$)</h2>";
  const headingIndex = html.indexOf(heading);
  if (headingIndex < 0) return html;

  const sectionStart = html.lastIndexOf('<section class="summary-block">', headingIndex);
  if (sectionStart < 0) return html;
  const sectionEnd = findElementEnd(html, sectionStart, "section");
  if (sectionEnd < 0) return html;

  const sectionHtml = html.slice(sectionStart, sectionEnd);
  const listStartRelative = sectionHtml.indexOf('<dl class="summary-list">');
  if (listStartRelative < 0) return html;
  const listStart = sectionStart + listStartRelative;
  const listEnd = findElementEnd(html, listStart, "dl");
  if (listEnd < 0) return html;

  const existingList = html.slice(listStart, listEnd);
  const cardLabel = /<dt>([\s\S]*?)<\/dt>/.exec(existingList)?.[1] ?? "Cartão";
  const totalMinor = groups.reduce((sum, group) => sum + group.totalMinor, 0);
  const instrumentRows = groups.map(renderInstrumentSummaryRow).join("");
  const list = `<dl class="summary-list instrument-summary-list">
          ${instrumentRows}
          <div class="summary-row summary-row-strong instrument-card-total"><dt>${cardLabel} · Total</dt><dd class="debit">${formatMoney(-totalMinor)}</dd></div>
        </dl>`;

  return html.slice(0, listStart) + list + html.slice(listEnd);
}

function renderInstrumentSummaryRow(group: InstrumentPurchaseGroup): string {
  const instrumentAttribute =
    group.instrumentId === UNASSIGNED_INSTRUMENT_ID
      ? ""
      : ` data-instrument-id="${escapeHtml(group.instrumentId)}"`;
  return `<div class="summary-row instrument-summary-row"${instrumentAttribute}><dt data-instrument-label>${escapeHtml(group.label)}</dt><dd class="debit">${formatMoney(-group.totalMinor)}</dd></div>`;
}

function injectInstrumentAssets(html: string): string {
  let nextHtml = html;

  if (!nextHtml.includes("data-card-instrument-subtotals-styles")) {
    const styles = `
      <style data-card-instrument-subtotals-styles>
        .instrument-purchase-group{border-top:1px solid var(--line)}
        .instrument-purchase-group:first-child{border-top:0}
        .instrument-purchase-group .purchase-group-summary{background:#f8fafc;border-radius:var(--radius);margin:6px 0 0;padding:9px 10px}
        .instrument-purchase-group .purchase-group-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .instrument-summary-list{gap:5px}
        .instrument-summary-row{padding-left:10px}
        .instrument-summary-row dt{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .instrument-summary-row dt::before{color:var(--muted);content:"↳";margin-right:5px}
        .instrument-card-total{border-top:1px solid var(--line);margin-top:3px;padding-top:6px}
        @media(max-width:760px){.instrument-purchase-group .purchase-group-summary{align-items:flex-start;display:grid;grid-template-columns:minmax(0,1fr) auto}.instrument-purchase-group .purchase-group-summary::before{grid-row:1 / span 2}.instrument-purchase-group .purchase-group-summary .muted{grid-column:2}.instrument-purchase-group .purchase-group-summary strong{grid-column:2}}
      </style>`;
    nextHtml = nextHtml.replace("</head>", `${styles}</head>`);
  }

  if (!nextHtml.includes("data-card-instrument-subtotals-controller")) {
    const script = `
      <script data-card-instrument-subtotals-controller>
        (() => {
          const list = document.querySelector('.purchase-list[aria-label="Compras da fatura"]');
          if (!list || !list.querySelector("[data-instrument-purchase-group]")) return;

          function updateGroupVisibility() {
            list.querySelectorAll("[data-instrument-purchase-group]").forEach((group) => {
              const rows = Array.from(group.querySelectorAll("[data-purchase-item]"));
              const visible = rows.some((row) => !row.hidden);
              if (group.hidden !== !visible) group.hidden = !visible;
            });
          }

          const observer = new MutationObserver(updateGroupVisibility);
          observer.observe(list, { attributes: true, attributeFilter: ["hidden"], subtree: true });
          updateGroupVisibility();

          const selectedCardId = document.querySelector("[data-card-input]")?.value;
          if (!selectedCardId) return;

          fetch("/api/credit-card-accounts/" + encodeURIComponent(selectedCardId) + "/instruments")
            .then((response) => (response.ok ? response.json() : undefined))
            .then((body) => {
              const instruments = Array.isArray(body && body.instruments) ? body.instruments : [];
              const labels = new Map(instruments.map((instrument) => {
                const type = instrument.type === "physical" ? "Físico" : instrument.type === "virtual" ? "Virtual" : instrument.type;
                const holder = instrument.holder === "primary" ? "Titular principal" : instrument.holder === "additional" ? "Adicional" : instrument.holder;
                const title = String(instrument.name || "").trim() || type + " - " + holder;
                const identifier = instrument.maskedIdentifier ? " · " + instrument.maskedIdentifier : "";
                const archived = instrument.status === "archived" ? " · Arquivado" : "";
                return [String(instrument.id), title + identifier + archived];
              }));

              document.querySelectorAll("[data-instrument-id]").forEach((container) => {
                const label = labels.get(container.dataset.instrumentId || "");
                const target = container.querySelector("[data-instrument-label]");
                if (label && target) target.textContent = label;
              });
            })
            .catch(() => undefined);
        })();
      </script>`;
    nextHtml = nextHtml.replace("</body>", `${script}</body>`);
  }

  return nextHtml;
}

function parseEmbeddedPurchase(content: string): Record<string, unknown> | undefined {
  const match = /<script type="application\/json" data-purchase="[^"]*">([\s\S]*?)<\/script>/.exec(
    content,
  );
  if (!match?.[1]) return undefined;

  try {
    return JSON.parse(decodeHtml(match[1])) as Record<string, unknown>;
  } catch {
    return undefined;
  }
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

function formatMoney(amountMinor: number): string {
  const formatted = (Math.abs(amountMinor) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amountMinor < 0 ? "-" : ""}R$ ${formatted}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "");
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

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
