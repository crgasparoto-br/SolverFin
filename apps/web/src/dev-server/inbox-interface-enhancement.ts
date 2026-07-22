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
  const messageCount = readCount(html, /<h2>Mensagens recebidas<\/h2>\s*<span>(\d+) itens<\/span>/);

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

function renderSectionNavigation(suggestionCount: number, messageCount: number): string {
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
      gap: 12px;
      max-width: 1480px;
      padding: 14px 18px 24px;
    }
    .inbox-page .page-heading {
      align-items: flex-start;
      padding: 0;
    }
    .inbox-page .page-heading h1 {
      letter-spacing: -0.025em;
    }
    .inbox-page .heading-actions,
    .inbox-page .compact-filters {
      justify-content: flex-end;
    }
    .inbox-page .heading-actions button,
    .inbox-page .compact-filters button,
    .inbox-page .detail-heading .inline-actions button,
    .inbox-page .detail-heading .inline-actions .button-link,
    .inbox-page .row-editor > .inline-actions button,
    .inbox-page .row-editor > .button-link,
    .inbox-page .candidate-card .inline-actions button,
    .inbox-page .maintenance-actions button,
    .inbox-page .maintenance-actions .button-link,
    .inbox-page .bulk-actions button {
      flex: 0 0 auto;
      min-height: 32px;
      width: auto;
    }
    .inbox-section-nav {
      align-items: stretch;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
      overflow: hidden;
    }
    .inbox-section-link {
      align-items: center;
      border-right: 1px solid var(--line);
      color: var(--text);
      display: grid;
      gap: 8px;
      grid-template-columns: auto minmax(0, 1fr) auto;
      min-height: 50px;
      padding: 7px 10px;
      text-decoration: none;
    }
    .inbox-section-link:hover {
      background: var(--surface-soft);
      color: var(--text);
    }
    .inbox-section-link-primary,
    .inbox-section-link-primary:hover {
      background: var(--primary-soft);
      box-shadow: inset 0 -3px 0 var(--primary);
    }
    .inbox-section-link:focus-visible {
      border-radius: 0;
      box-shadow: inset 0 0 0 2px var(--cyan);
      outline: none;
      position: relative;
      z-index: 1;
    }
    .inbox-section-icon {
      align-items: center;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      color: var(--primary);
      display: inline-flex;
      height: 30px;
      justify-content: center;
      width: 30px;
    }
    .inbox-section-link strong,
    .inbox-section-link small {
      display: block;
    }
    .inbox-section-link strong {
      font-size: 0.8125rem;
    }
    .inbox-section-link small {
      color: var(--muted);
      font-size: 0.6875rem;
      margin-top: 1px;
    }
    .inbox-attention-summary {
      align-items: center;
      color: var(--muted);
      display: flex;
      font-size: 0.75rem;
      font-weight: 700;
      gap: 6px;
      padding: 0 12px;
      white-space: nowrap;
    }
    .inbox-page .import-workspace {
      overflow: hidden;
      padding: 0;
    }
    .inbox-page .import-heading {
      border-bottom: 1px solid var(--line);
      padding: 10px 14px 8px;
    }
    .inbox-page .compact-filters label {
      min-width: 0;
      width: auto;
    }
    .inbox-page .line-filter-bar {
      background: var(--surface-soft);
      border-bottom: 1px solid var(--line);
      justify-content: flex-start;
      margin: 0;
      padding: 7px 14px;
    }
    .inbox-page .line-filter-bar label {
      min-width: min(390px, 100%);
    }
    .inbox-page .line-filter-bar select {
      flex: 1 1 auto;
      min-width: 0;
    }
    .inbox-page .import-workspace > .form-status {
      margin: 0;
      min-height: 26px;
      padding: 5px 14px 4px;
    }
    .inbox-page .import-layout {
      border-top: 1px solid var(--line);
      gap: 0;
      grid-template-columns: minmax(230px, 270px) minmax(0, 1fr);
    }
    .inbox-page .import-batch-list {
      background: var(--surface);
      border-right: 1px solid var(--line);
      gap: 0;
      max-height: min(760px, calc(100vh - 220px));
      padding: 0;
      scrollbar-gutter: stable;
    }
    .inbox-page .batch-item {
      background: transparent;
      border: 0;
      border-bottom: 1px solid var(--line);
      border-left: 3px solid transparent;
      border-radius: 0;
      color: var(--text);
      gap: 2px;
      min-height: 0;
      padding: 8px 10px 8px 9px;
      transition: background 120ms ease-out, border-color 120ms ease-out;
      width: 100%;
    }
    .inbox-page .batch-item strong {
      color: var(--text);
    }
    .inbox-page .batch-item span {
      color: var(--muted);
    }
    .inbox-page .batch-item:hover:not(:disabled) {
      background: var(--surface-soft);
      color: var(--text);
    }
    .inbox-page .batch-item.selected,
    .inbox-page .batch-item.selected:hover:not(:disabled) {
      background: var(--primary-soft);
      border-left-color: var(--primary);
      box-shadow: none;
      color: var(--text);
    }
    .inbox-page .batch-item:focus-visible {
      border-radius: 0;
      box-shadow: inset 0 0 0 2px var(--cyan);
      outline: 2px solid transparent;
      outline-offset: -2px;
      position: relative;
      z-index: 1;
    }
    .inbox-page .batch-item.selected:focus-visible {
      box-shadow: inset 3px 0 0 var(--primary), inset 0 0 0 2px var(--cyan);
    }
    .inbox-page .import-detail {
      padding: 10px 12px 14px;
    }
    .inbox-page .detail-heading {
      gap: 10px;
      margin-bottom: 8px;
      padding-bottom: 8px;
    }
    .inbox-page .detail-heading .inline-actions {
      justify-content: flex-end;
    }
    .inbox-page .import-summary {
      background: transparent;
      border: 0;
      border-bottom: 1px solid var(--line);
      border-radius: 0;
      border-top: 1px solid var(--line);
      display: flex;
      flex-wrap: wrap;
      gap: 0;
      margin-bottom: 8px;
      padding: 2px 0;
    }
    .inbox-page .import-summary span {
      background: transparent;
      border: 0;
      border-right: 1px solid var(--line);
      border-radius: 0;
      padding: 4px 8px;
    }
    .inbox-page .import-summary span:last-child {
      border-right: 0;
    }
    .inbox-page .bulk-actions {
      align-items: center;
      border-radius: var(--radius);
      display: flex;
      flex-wrap: wrap;
      gap: 6px 10px;
      justify-content: space-between;
      margin-bottom: 8px;
      min-height: 40px;
      padding: 6px 8px;
    }
    .inbox-page .bulk-actions > label {
      align-items: center;
      display: inline-flex;
      flex: 0 0 auto;
      gap: 6px;
      width: auto;
    }
    .inbox-page .bulk-actions > label input[type="checkbox"] {
      accent-color: var(--primary);
      flex: 0 0 18px;
      height: 18px;
      margin: 0;
      min-height: 18px;
      padding: 0;
      width: 18px;
    }
    .inbox-page .bulk-actions > div {
      align-items: center;
      display: flex;
      flex: 1 1 360px;
      flex-wrap: wrap;
      gap: 6px 8px;
      justify-content: flex-end;
      min-width: 0;
    }
    .inbox-page #selection-summary {
      color: var(--muted);
      font-size: 0.75rem;
      line-height: 1.35;
    }
    .inbox-page .import-rows,
    .inbox-page .maintenance-rows {
      gap: 0;
    }
    .inbox-page .import-rows {
      border-top: 1px solid var(--line);
    }
    .inbox-page .import-row {
      background: transparent;
      border: 0;
      border-bottom: 1px solid var(--line);
      border-radius: 0;
      gap: 8px;
      padding: 8px 6px;
      transition: background 120ms ease-out;
    }
    .inbox-page .import-row:hover {
      background: var(--surface-soft);
    }
    .inbox-page .import-row[data-row-state="pending_invalid"] {
      box-shadow: inset 3px 0 0 var(--warning);
    }
    .inbox-page .import-row[data-row-state="candidate_pending"] {
      box-shadow: inset 3px 0 0 var(--cyan);
    }
    .inbox-page .import-row > input[type="checkbox"] {
      accent-color: var(--primary);
      height: 18px;
      margin: 3px 0 0;
      min-height: 18px;
      padding: 0;
      width: 18px;
    }
    .inbox-page .row-editor {
      gap: 6px;
    }
    .inbox-page .row-heading {
      min-height: 24px;
    }
    .inbox-page .row-summary {
      gap: 5px 14px;
      grid-template-columns: minmax(72px, 0.65fr) minmax(78px, 0.65fr) minmax(105px, 0.8fr) minmax(210px, 2.2fr) minmax(145px, 1.25fr);
    }
    .inbox-page .row-summary div,
    .inbox-page .row-summary div:first-child,
    .inbox-page .row-summary div:last-child {
      background: transparent;
      border: 0;
      border-radius: 0;
      padding: 0;
    }
    .inbox-page .row-summary dt {
      font-size: 0.625rem;
      letter-spacing: 0.02em;
    }
    .inbox-page .row-summary dd {
      margin-top: 1px;
    }
    .inbox-page .row-editor > .inline-actions,
    .inbox-page .candidate-card .inline-actions {
      gap: 6px;
      justify-content: flex-end;
    }
    .inbox-page .candidate-list {
      gap: 6px;
      margin-top: 1px;
    }
    .inbox-page .candidate-card {
      align-items: center;
      background: #f6fbfd;
      border-color: #cfe3eb;
      border-left: 3px solid var(--cyan);
      border-radius: var(--radius);
      gap: 8px;
      padding: 7px 9px;
    }
    .inbox-page .candidate-card p {
      line-height: 1.35;
      margin-top: 2px;
    }
    .inbox-page .inbox-secondary-panel {
      padding: 12px 14px;
    }
    .inbox-page .inbox-secondary-panel .section-heading {
      border-bottom: 1px solid var(--line);
      padding-bottom: 8px;
    }
    .inbox-page .maintenance-item {
      align-items: start;
      border-top: 1px solid var(--line);
      display: grid;
      gap: 10px;
      grid-template-columns: minmax(150px, 0.65fr) minmax(240px, 1.8fr) minmax(140px, auto);
      padding: 9px 0;
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
      align-items: center;
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: flex-end;
    }
    .inbox-page .empty-state {
      padding: 16px 12px;
    }
    @media (max-width: 1120px) {
      .inbox-section-nav {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .inbox-attention-summary {
        border-top: 1px solid var(--line);
        grid-column: 1 / -1;
        justify-content: center;
        min-height: 32px;
      }
      .inbox-page .row-summary {
        grid-template-columns: repeat(3, minmax(120px, 1fr));
      }
      .inbox-page .maintenance-item {
        grid-template-columns: minmax(150px, 0.65fr) minmax(240px, 1.8fr);
      }
      .inbox-page .maintenance-actions {
        grid-column: 1 / -1;
      }
    }
    @media (max-width: 800px) {
      .inbox-page {
        gap: 10px;
        padding: 12px;
      }
      .inbox-page .heading-actions,
      .inbox-page .compact-filters {
        justify-content: flex-start;
      }
      .inbox-section-nav {
        display: flex;
        overflow-x: auto;
        overscroll-behavior-inline: contain;
        scrollbar-width: thin;
      }
      .inbox-section-link {
        border-bottom: 0;
        flex: 0 0 min(220px, 78vw);
      }
      .inbox-attention-summary {
        border-left: 1px solid var(--line);
        border-top: 0;
        flex: 0 0 auto;
        grid-column: auto;
        min-height: 50px;
      }
      .inbox-page .import-layout {
        grid-template-columns: 1fr;
      }
      .inbox-page .import-batch-list {
        border-bottom: 1px solid var(--line);
        border-right: 0;
        grid-template-columns: 1fr;
        max-height: 190px;
      }
      .inbox-page .detail-heading {
        align-items: stretch;
        display: grid;
      }
      .inbox-page .detail-heading .inline-actions {
        justify-content: flex-start;
      }
      .inbox-page .bulk-actions > div {
        flex-basis: 100%;
        justify-content: flex-start;
      }
      .inbox-page .row-summary {
        grid-template-columns: repeat(3, minmax(110px, 1fr));
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
        padding: 10px;
      }
      .inbox-page .heading-actions,
      .inbox-page .compact-filters {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
      }
      .inbox-page .heading-actions > *,
      .inbox-page .compact-filters > *,
      .inbox-page .compact-filters label {
        width: auto;
      }
      .inbox-page .import-heading,
      .inbox-page .line-filter-bar,
      .inbox-page .import-workspace > .form-status,
      .inbox-page .import-detail,
      .inbox-page .inbox-secondary-panel {
        padding-left: 10px;
        padding-right: 10px;
      }
      .inbox-page .line-filter-bar label,
      .inbox-page .line-filter-bar select {
        min-width: 0;
        width: 100%;
      }
      .inbox-page .import-summary {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }
      .inbox-page .import-summary span {
        border-bottom: 1px solid var(--line);
        border-right: 0;
      }
      .inbox-page .bulk-actions {
        align-items: flex-start;
      }
      .inbox-page .bulk-actions > label {
        min-height: 32px;
      }
      .inbox-page .bulk-actions > div {
        align-items: flex-start;
      }
      .inbox-page .row-summary {
        grid-template-columns: 1fr 1fr;
      }
      .inbox-page .row-summary div:nth-child(4),
      .inbox-page .row-summary div:nth-child(n + 5) {
        grid-column: 1 / -1;
      }
      .inbox-page .row-editor > .inline-actions,
      .inbox-page .candidate-card .inline-actions {
        justify-content: flex-start;
      }
      .inbox-page .candidate-card {
        align-items: stretch;
        display: grid;
      }
      .inbox-page .maintenance-actions {
        align-items: center;
        display: flex;
      }
    }
  `;
}
