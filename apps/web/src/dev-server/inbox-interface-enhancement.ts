import { icon } from "./icons.js";

const ORIGINAL_PAGE_DESCRIPTION =
  "Importe extratos ou registre mensagens e confirme cada efeito financeiro antes de salvar.";
const ENHANCED_PAGE_DESCRIPTION =
  "Revise importações e sugestões antes que elas se transformem em lançamentos.";

export function enhanceInboxInterface(html: string): string {
  if (html.includes('data-inbox-interface="enhanced"')) {
    return html;
  }

  const suggestionCount = readCount(
    html,
    /<h2>Outras sugestões<\/h2>\s*<span>(\d+) pendentes<\/span>/,
  );
  const messageCount = readCount(
    html,
    /<h2>Mensagens recebidas<\/h2>\s*<span>(\d+) itens<\/span>/,
  );

  let enhanced = addMainClass(html, "inbox-page");
  enhanced = enhanced.replace(ORIGINAL_PAGE_DESCRIPTION, ENHANCED_PAGE_DESCRIPTION);
  enhanced = enhanced.replace(
    '<section class="panel import-workspace"',
    `${renderSectionNavigation(suggestionCount, messageCount)}\n<section id="inbox-imports" class="panel import-workspace"`,
  );
  enhanced = replaceOccurrence(
    enhanced,
    '<section class="panel list-panel">',
    '<section id="inbox-suggestions" class="panel list-panel inbox-secondary-panel">',
  );
  enhanced = replaceOccurrence(
    enhanced,
    '<section class="panel list-panel">',
    '<section id="inbox-messages" class="panel list-panel inbox-secondary-panel">',
  );

  return enhanced.replace("</head>", `<style>${inboxInterfaceStyles()}</style></head>`);
}

function readCount(html: string, pattern: RegExp): number {
  const value = Number(pattern.exec(html)?.[1] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function addMainClass(html: string, className: string): string {
  if (html.includes(`<main class="${className}`)) {
    return html;
  }

  if (html.includes('<main class="')) {
    return html.replace('<main class="', `<main class="${className} `);
  }

  return html.replace("<main>", `<main class="${className}">`);
}

function replaceOccurrence(value: string, search: string, replacement: string): string {
  const cursor = value.indexOf(search);
  if (cursor === -1) return value;

  return `${value.slice(0, cursor)}${replacement}${value.slice(cursor + search.length)}`;
}

function renderSectionNavigation(
  suggestionCount: number,
  messageCount: number,
): string {
  const attentionCount = suggestionCount + messageCount;
  const attentionLabel =
    attentionCount === 1 ? "1 item para revisar" : `${attentionCount} itens para revisar`;

  return `
    <nav class="inbox-section-nav" aria-label="Áreas da inbox" data-inbox-interface="enhanced">
      <a class="inbox-section-link inbox-section-link-primary" href="#inbox-imports">
        <span class="inbox-section-icon" aria-hidden="true">${icon("upload", 17)}</span>
        <span><strong>Extratos</strong><small>Importar e revisar lotes</small></span>
        ${icon("chevron-right", 15)}
      </a>
      <a class="inbox-section-link" href="#inbox-suggestions">
        <span class="inbox-section-icon" aria-hidden="true">${icon("check-circle", 17)}</span>
        <span><strong>Sugestões</strong><small>${suggestionCount} pendente${suggestionCount === 1 ? "" : "s"}</small></span>
        ${icon("chevron-right", 15)}
      </a>
      <a class="inbox-section-link" href="#inbox-messages">
        <span class="inbox-section-icon" aria-hidden="true">${icon("inbox", 17)}</span>
        <span><strong>Mensagens</strong><small>${messageCount} recebida${messageCount === 1 ? "" : "s"}</small></span>
        ${icon("chevron-right", 15)}
      </a>
      <span class="inbox-attention-summary" aria-label="${attentionLabel}">
        ${icon(attentionCount > 0 ? "alert-triangle" : "check-circle", 15)}
        ${attentionLabel}
      </span>
    </nav>
  `;
}

function inboxInterfaceStyles(): string {
  return `
    .inbox-page {
      gap: 16px;
      max-width: 1480px;
      padding: 20px 24px 32px;
    }
    .inbox-page .page-heading {
      align-items: flex-start;
      padding: 2px 0 4px;
    }
    .inbox-page .page-heading h1 {
      letter-spacing: -0.025em;
    }
    .inbox-page .heading-actions,
    .inbox-page .compact-filters {
      justify-content: flex-end;
    }
    .inbox-section-nav {
      align-items: stretch;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: calc(var(--radius) + 2px);
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
      overflow: hidden;
    }
    .inbox-section-link {
      align-items: center;
      border-right: 1px solid var(--line);
      color: var(--text);
      display: grid;
      gap: 10px;
      grid-template-columns: auto minmax(0, 1fr) auto;
      min-height: 60px;
      padding: 10px 14px;
      text-decoration: none;
    }
    .inbox-section-link:hover {
      background: var(--surface-soft);
    }
    .inbox-section-link:focus-visible {
      box-shadow: inset 0 0 0 2px var(--primary);
      outline: none;
    }
    .inbox-section-link-primary {
      background: var(--primary-soft);
    }
    .inbox-section-icon {
      align-items: center;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 9px;
      color: var(--primary);
      display: inline-flex;
      height: 34px;
      justify-content: center;
      width: 34px;
    }
    .inbox-section-link strong,
    .inbox-section-link small {
      display: block;
    }
    .inbox-section-link strong {
      font-size: 0.875rem;
    }
    .inbox-section-link small {
      color: var(--muted);
      font-size: 0.75rem;
      margin-top: 2px;
    }
    .inbox-attention-summary {
      align-items: center;
      color: var(--muted);
      display: flex;
      font-size: 0.75rem;
      font-weight: 700;
      gap: 6px;
      padding: 0 14px;
      white-space: nowrap;
    }
    .inbox-page .import-workspace {
      overflow: hidden;
      padding: 0;
    }
    .inbox-page .import-heading {
      border-bottom: 1px solid var(--line);
      padding: 15px 18px 12px;
    }
    .inbox-page .line-filter-bar {
      background: var(--surface-soft);
      border-bottom: 1px solid var(--line);
      justify-content: flex-start;
      margin: 0;
      padding: 9px 18px;
    }
    .inbox-page .line-filter-bar label {
      min-width: min(420px, 100%);
    }
    .inbox-page .line-filter-bar select {
      flex: 1 1 auto;
      min-width: 0;
    }
    .inbox-page .import-workspace > .form-status {
      margin: 0;
      min-height: 32px;
      padding: 8px 18px 6px;
    }
    .inbox-page .import-layout {
      border-top: 1px solid var(--line);
      gap: 0;
      grid-template-columns: minmax(250px, 290px) minmax(0, 1fr);
    }
    .inbox-page .import-batch-list {
      background: var(--surface-soft);
      border-right: 1px solid var(--line);
      gap: 4px;
      max-height: min(760px, calc(100vh - 250px));
      padding: 10px;
      scrollbar-gutter: stable;
    }
    .inbox-page .batch-item {
      border-color: transparent;
      border-radius: 8px;
      min-height: 62px;
      padding: 10px 11px;
    }
    .inbox-page .batch-item:hover {
      border-color: var(--line);
    }
    .inbox-page .batch-item.selected {
      border-color: var(--primary);
      box-shadow: inset 3px 0 0 var(--primary);
    }
    .inbox-page .import-detail {
      padding: 14px 16px 18px;
    }
    .inbox-page .detail-heading {
      gap: 16px;
      margin-bottom: 12px;
      padding-bottom: 12px;
    }
    .inbox-page .import-summary {
      background: var(--surface-soft);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      display: flex;
      flex-wrap: wrap;
      gap: 0;
      margin-bottom: 12px;
      padding: 4px 6px;
    }
    .inbox-page .import-summary span {
      background: transparent;
      border: 0;
      border-right: 1px solid var(--line);
      border-radius: 0;
      padding: 6px 9px;
    }
    .inbox-page .import-summary span:last-child {
      border-right: 0;
    }
    .inbox-page .bulk-actions {
      border-radius: 8px;
      margin-bottom: 12px;
      padding: 9px 11px;
    }
    .inbox-page .import-rows,
    .inbox-page .maintenance-rows {
      gap: 0;
    }
    .inbox-page .import-row {
      border: 0;
      border-bottom: 1px solid var(--line);
      border-radius: 0;
      gap: 10px;
      padding: 12px 2px;
    }
    .inbox-page .import-row:first-child {
      border-top: 1px solid var(--line);
    }
    .inbox-page .row-summary {
      gap: 0;
      grid-template-columns: minmax(86px, 0.75fr) minmax(90px, 0.8fr) minmax(110px, 0.9fr) minmax(180px, 2fr) minmax(150px, 1.25fr);
    }
    .inbox-page .row-summary div {
      background: transparent;
      border-right: 1px solid var(--line);
      border-radius: 0;
      padding: 3px 10px;
    }
    .inbox-page .row-summary div:first-child {
      padding-left: 0;
    }
    .inbox-page .row-summary div:last-child {
      border-right: 0;
    }
    .inbox-page .inbox-secondary-panel {
      padding: 16px 18px;
    }
    .inbox-page .inbox-secondary-panel .section-heading {
      border-bottom: 1px solid var(--line);
      padding-bottom: 11px;
    }
    .inbox-page .maintenance-item {
      align-items: start;
      border-top: 1px solid var(--line);
      display: grid;
      gap: 14px;
      grid-template-columns: minmax(170px, 0.7fr) minmax(260px, 1.8fr) minmax(150px, auto);
      padding: 12px 0;
    }
    .inbox-page .maintenance-item:first-child {
      border-top: 0;
    }
    .inbox-page .message-preview,
    .inbox-page .maintenance-actions {
      background: transparent;
      border: 0;
      border-radius: 0;
      padding: 0;
    }
    .inbox-page .maintenance-actions {
      align-items: flex-end;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .inbox-page .empty-state {
      padding: 22px 14px;
    }
    @media (max-width: 1120px) {
      .inbox-section-nav {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .inbox-attention-summary {
        border-top: 1px solid var(--line);
        grid-column: 1 / -1;
        justify-content: center;
        min-height: 36px;
      }
      .inbox-page .row-summary {
        grid-template-columns: repeat(3, minmax(120px, 1fr));
      }
      .inbox-page .maintenance-item {
        grid-template-columns: minmax(170px, 0.7fr) minmax(260px, 1.8fr);
      }
      .inbox-page .maintenance-actions {
        align-items: center;
        flex-direction: row;
        grid-column: 1 / -1;
        justify-content: flex-end;
      }
    }
    @media (max-width: 800px) {
      .inbox-page {
        padding: 16px;
      }
      .inbox-page .heading-actions,
      .inbox-page .compact-filters {
        justify-content: flex-start;
      }
      .inbox-section-nav {
        grid-template-columns: 1fr;
      }
      .inbox-section-link {
        border-bottom: 1px solid var(--line);
        border-right: 0;
      }
      .inbox-attention-summary {
        grid-column: auto;
      }
      .inbox-page .import-layout {
        grid-template-columns: 1fr;
      }
      .inbox-page .import-batch-list {
        border-bottom: 1px solid var(--line);
        border-right: 0;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        max-height: 240px;
      }
      .inbox-page .maintenance-item {
        grid-template-columns: 1fr;
      }
      .inbox-page .maintenance-actions {
        grid-column: auto;
        justify-content: flex-start;
      }
    }
    @media (max-width: 520px) {
      .inbox-page {
        gap: 12px;
        padding: 12px;
      }
      .inbox-page .heading-actions > *,
      .inbox-page .compact-filters > *,
      .inbox-page .compact-filters label {
        width: 100%;
      }
      .inbox-page .import-heading,
      .inbox-page .line-filter-bar,
      .inbox-page .import-workspace > .form-status,
      .inbox-page .import-detail,
      .inbox-page .inbox-secondary-panel {
        padding-left: 12px;
        padding-right: 12px;
      }
      .inbox-page .import-summary {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }
      .inbox-page .import-summary span {
        border-bottom: 1px solid var(--line);
        border-right: 0;
      }
      .inbox-page .row-summary {
        grid-template-columns: 1fr;
      }
      .inbox-page .row-summary div {
        border-right: 0;
        padding: 6px 0;
      }
      .inbox-page .maintenance-actions {
        align-items: stretch;
        display: grid;
      }
      .inbox-page .maintenance-actions button {
        width: 100%;
      }
    }
  `;
}
