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
  return html.replace(/<main\b([^>]*)>/, (tag, attributes: string) => {
    const classAttribute = /\bclass=(['"])(.*?)\1/.exec(attributes);
    if (!classAttribute) {
      return `<main class="${className}"${attributes}>`;
    }

    const quote = classAttribute.at(1);
    const currentClassName = classAttribute.at(2);
    if (!quote || currentClassName === undefined) return tag;

    const classes = currentClassName.split(/\s+/).filter(Boolean);
    if (classes.includes(className)) return tag;

    const nextClassAttribute = `class=${quote}${className} ${currentClassName}${quote}`;
    return tag.replace(classAttribute[0], nextClassAttribute);
  });
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
      gap: 8px;
      max-width: 1480px;
      padding: 8px 14px 18px;
    }
    .inbox-page .page-heading {
      align-items: center;
      padding: 0;
    }
    .inbox-page .page-heading > div:first-child {
      gap: 1px;
    }
    .inbox-page .page-heading h1 {
      letter-spacing: -0.025em;
    }
    .inbox-page .page-heading .muted {
      font-size: 0.8125rem;
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
      min-height: 30px;
      padding-inline: 10px;
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
      gap: 7px;
      grid-template-columns: auto minmax(0, 1fr) auto;
      min-height: 42px;
      padding: 5px 9px;
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
      border-radius: 7px;
      color: var(--primary);
      display: inline-flex;
      height: 28px;
      justify-content: center;
      width: 28px;
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
      line-height: 1.25;
      margin-top: 0;
    }
    .inbox-attention-summary {
      align-items: center;
      color: var(--muted);
      display: flex;
      font-size: 0.75rem;
      font-weight: 700;
      gap: 6px;
      padding: 0 10px;
      white-space: nowrap;
    }
    .inbox-page .import-workspace {
      overflow: hidden;
      padding: 0;
    }
    .inbox-page .import-heading {
      border-bottom: 1px solid var(--line);
      padding: 7px 12px 6px;
    }
    .inbox-page .import-heading .small-note {
      font-size: 0.75rem;
      line-height: 1.3;
    }
    .inbox-page .compact-filters label {
      min-width: 0;
      width: auto;
    }
    .inbox-page .compact-filters select,
    .inbox-page .line-filter-bar select {
      min-height: 30px;
    }
    .inbox-page .line-filter-bar {
      background: var(--surface-soft);
      border-bottom: 1px solid var(--line);
      justify-content: flex-start;
      margin: 0;
      padding: 4px 12px;
    }
    .inbox-page .line-filter-bar label {
      min-width: min(370px, 100%);
    }
    .inbox-page .line-filter-bar select {
      flex: 1 1 auto;
      min-width: 0;
    }
    .inbox-page .import-workspace > .form-status {
      margin: 0;
      min-height: 23px;
      padding: 3px 12px 2px;
    }
    .inbox-page .import-layout {
      border-top: 1px solid var(--line);
      gap: 0;
      grid-template-columns: minmax(220px, 255px) minmax(0, 1fr);
    }
    .inbox-page .import-batch-list {
      background: var(--surface);
      border-right: 1px solid var(--line);
      gap: 0;
      max-height: min(760px, calc(100vh - 188px));
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
      gap: 1px;
      min-height: 0;
      padding: 7px 9px 7px 8px;
      transition: background 120ms ease-out, border-color 120ms ease-out;
      width: 100%;
    }
    .inbox-page .batch-item strong {
      color: var(--text);
      font-size: 0.8125rem;
      line-height: 1.25;
    }
    .inbox-page .batch-item span {
      color: var(--muted);
      font-size: 0.6875rem;
      line-height: 1.25;
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
      padding: 7px 10px 10px;
    }
    .inbox-page .detail-heading {
      gap: 8px;
      margin-bottom: 5px;
      padding-bottom: 5px;
    }
    .inbox-page .detail-heading > div:first-child {
      gap: 1px;
    }
    .inbox-page .detail-heading h3 {
      font-size: 0.8125rem;
    }
    .inbox-page .detail-heading .muted {
      font-size: 0.75rem;
      line-height: 1.3;
    }
    .inbox-page .detail-heading .inline-actions {
      gap: 6px;
      justify-content: flex-end;
    }
    .inbox-page .import-summary {
      background: transparent;
      border: 0;
      border-bottom: 1px solid var(--line);
      border-radius: 0;
      border-top: 1px solid var(--line);
      display: flex;
      flex-wrap: nowrap;
      gap: 0;
      margin-bottom: 5px;
      overflow-x: auto;
      padding: 1px 0;
      scrollbar-width: thin;
    }
    .inbox-page .import-summary span {
      background: transparent;
      border: 0;
      border-right: 1px solid var(--line);
      border-radius: 0;
      flex: 0 0 auto;
      font-size: 0.6875rem;
      line-height: 1.25;
      padding: 4px 7px;
      white-space: nowrap;
    }
    .inbox-page .import-summary span:last-child {
      border-right: 0;
    }
    .inbox-page .bulk-actions {
      align-items: center;
      border-radius: var(--radius);
      display: flex;
      flex-wrap: nowrap;
      gap: 6px 10px;
      justify-content: space-between;
      margin-bottom: 4px;
      min-height: 34px;
      padding: 3px 7px;
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
      flex: 1 1 auto;
      flex-wrap: nowrap;
      gap: 6px 8px;
      justify-content: flex-end;
      min-width: 0;
    }
    .inbox-page #selection-summary {
      color: var(--muted);
      font-size: 0.6875rem;
      line-height: 1.25;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .inbox-page #import-detail-status:empty {
      display: none;
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
      gap: 7px;
      padding: 5px 4px;
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
      margin: 6px 0 0;
      min-height: 18px;
      padding: 0;
      width: 18px;
    }
    .inbox-page .row-editor {
      align-items: center;
      display: grid;
      gap: 6px 9px;
      grid-template-columns: minmax(88px, 0.65fr) minmax(0, 3fr) auto;
    }
    .inbox-page .row-heading {
      align-items: flex-start;
      display: flex;
      flex-direction: column;
      gap: 1px;
      justify-content: center;
      min-width: 0;
    }
    .inbox-page .row-heading strong {
      font-size: 0.75rem;
      line-height: 1.2;
    }
    .inbox-page .row-heading .status-pill {
      font-size: 0.625rem;
      line-height: 1.2;
      max-width: 100%;
      overflow: hidden;
      padding: 1px 5px;
      text-overflow: ellipsis;
    }
    .inbox-page .row-summary {
      display: grid;
      gap: 4px 7px;
      grid-template-columns: minmax(0, 0.7fr) minmax(0, 0.65fr) minmax(0, 0.85fr) minmax(0, 1.7fr) minmax(0, 1.15fr);
      min-width: 0;
    }
    .inbox-page .row-summary div,
    .inbox-page .row-summary div:first-child,
    .inbox-page .row-summary div:last-child {
      background: transparent;
      border: 0;
      border-radius: 0;
      min-width: 0;
      padding: 0;
    }
    .inbox-page .row-summary dt {
      font-size: 0.5625rem;
      letter-spacing: 0.02em;
      line-height: 1.1;
    }
    .inbox-page .row-summary dd {
      font-size: 0.75rem;
      line-height: 1.2;
      margin-top: 1px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .inbox-page .row-editor > .inline-actions,
    .inbox-page .candidate-card .inline-actions {
      flex-wrap: nowrap;
      gap: 5px;
      justify-content: flex-end;
    }
    .inbox-page .row-editor > .inline-actions button {
      font-size: 0.75rem;
      min-height: 30px;
      padding-inline: 8px;
    }
    .inbox-page .row-editor > .button-link {
      font-size: 0.75rem;
      justify-self: end;
    }
    .inbox-page .candidate-list {
      gap: 5px;
      margin-top: 1px;
    }
    .inbox-page .candidate-card {
      align-items: center;
      background: #f6fbfd;
      border-color: #cfe3eb;
      border-left: 3px solid var(--cyan);
      border-radius: var(--radius);
      gap: 8px;
      padding: 6px 8px;
    }
    .inbox-page .candidate-card p {
      line-height: 1.3;
      margin-top: 1px;
    }
    .inbox-page .inbox-secondary-panel {
      padding: 10px 12px;
    }
    .inbox-page .inbox-secondary-panel .section-heading {
      border-bottom: 1px solid var(--line);
      padding-bottom: 6px;
    }
    .inbox-page .maintenance-item {
      align-items: start;
      border-top: 1px solid var(--line);
      display: grid;
      gap: 9px;
      grid-template-columns: minmax(150px, 0.65fr) minmax(240px, 1.8fr) minmax(140px, auto);
      padding: 7px 0;
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
      gap: 5px;
      justify-content: flex-end;
    }
    .inbox-page .empty-state {
      padding: 14px 10px;
    }
    @media (max-width: 1120px) {
      .inbox-section-nav {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .inbox-attention-summary {
        border-top: 1px solid var(--line);
        grid-column: 1 / -1;
        justify-content: center;
        min-height: 28px;
      }
      .inbox-page .row-editor {
        grid-template-columns: minmax(90px, 1fr) auto;
      }
      .inbox-page .row-summary {
        grid-column: 1 / -1;
        grid-row: 2;
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
        gap: 8px;
        padding: 10px 12px 16px;
      }
      .inbox-page .page-heading {
        align-items: stretch;
        display: grid;
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
        flex: 0 0 min(210px, 76vw);
      }
      .inbox-attention-summary {
        border-left: 1px solid var(--line);
        border-top: 0;
        flex: 0 0 auto;
        grid-column: auto;
        min-height: 42px;
      }
      .inbox-page .import-heading {
        align-items: stretch;
        display: grid;
      }
      .inbox-page .import-layout {
        grid-template-columns: 1fr;
      }
      .inbox-page .import-batch-list {
        border-bottom: 1px solid var(--line);
        border-right: 0;
        grid-template-columns: 1fr;
        max-height: 175px;
      }
      .inbox-page .detail-heading {
        align-items: stretch;
        display: grid;
      }
      .inbox-page .detail-heading .inline-actions {
        justify-content: flex-start;
      }
      .inbox-page .bulk-actions {
        align-items: flex-start;
        flex-wrap: wrap;
      }
      .inbox-page .bulk-actions > div {
        flex-basis: 100%;
        flex-wrap: wrap;
        justify-content: flex-start;
      }
      .inbox-page .row-editor {
        grid-template-columns: minmax(90px, 1fr) auto;
      }
      .inbox-page .row-summary {
        grid-template-columns: repeat(3, minmax(0, 1fr));
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
        padding: 8px 10px 14px;
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
        padding-left: 9px;
        padding-right: 9px;
      }
      .inbox-page .line-filter-bar label,
      .inbox-page .line-filter-bar select {
        min-width: 0;
        width: 100%;
      }
      .inbox-page .import-summary {
        display: grid;
        grid-template-columns: 1fr 1fr;
        overflow-x: visible;
      }
      .inbox-page .import-summary span {
        border-bottom: 1px solid var(--line);
        border-right: 0;
        white-space: normal;
      }
      .inbox-page .bulk-actions > label {
        min-height: 30px;
      }
      .inbox-page .bulk-actions > div {
        align-items: flex-start;
      }
      .inbox-page #selection-summary {
        flex-basis: 100%;
        white-space: normal;
      }
      .inbox-page .import-row {
        grid-template-columns: 1fr;
      }
      .inbox-page .import-row > input[type="checkbox"] {
        margin-top: 0;
      }
      .inbox-page .row-editor {
        grid-template-columns: 1fr;
      }
      .inbox-page .row-heading,
      .inbox-page .row-summary,
      .inbox-page .row-editor > .inline-actions,
      .inbox-page .row-editor > .button-link {
        grid-column: 1;
        grid-row: auto;
      }
      .inbox-page .row-heading {
        align-items: center;
        flex-direction: row;
        justify-content: space-between;
      }
      .inbox-page .row-summary {
        grid-template-columns: 1fr 1fr;
      }
      .inbox-page .row-summary div:nth-child(4),
      .inbox-page .row-summary div:nth-child(n + 5) {
        grid-column: 1 / -1;
      }
      .inbox-page .row-summary dd {
        white-space: normal;
      }
      .inbox-page .row-editor > .inline-actions,
      .inbox-page .candidate-card .inline-actions {
        flex-wrap: wrap;
        justify-content: flex-start;
      }
      .inbox-page .row-editor > .button-link {
        justify-self: start;
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
