import { icon } from "./icons.js";

interface InstrumentCreateDialog {
  cardId: string;
  dialogHtml: string;
  formHtml: string;
}

interface CardInstrumentDialogSource {
  cardId: string;
  cardNameHtml: string;
  instrumentCount: number;
  isArchived: boolean;
  listHtml: string;
  warningHtml: string;
}

export function moveCardInstrumentsToDedicatedDialog(html: string): string {
  if (html.includes("data-card-instruments-dedicated-dialog")) return html;

  const createDialogs = collectCreateInstrumentDialogs(html);
  const createDialogsByCard = new Map(createDialogs.map((dialog) => [dialog.cardId, dialog]));
  const instrumentSources = collectCardInstrumentSources(html);
  let nextHtml = html;

  createDialogs.forEach((dialog) => {
    nextHtml = nextHtml.replace(dialog.dialogHtml, "");
  });

  nextHtml = nextHtml.replace(
    "Cadastre o cart\u00e3o agrupador e acompanhe os instrumentos internos usados nas compras.",
    "Cadastre o cart\u00e3o agrupador e gerencie seus instrumentos em um modal dedicado.",
  );
  nextHtml = removeInlineInstrumentSections(nextHtml);
  nextHtml = removeNestedDivByClass(nextHtml, "instrument-list");
  nextHtml = nextHtml.replace(/\s*<p class="instrument-warning"[\s\S]*?<\/p>/g, "");
  nextHtml = removeStandaloneNewInstrumentButtons(nextHtml);
  nextHtml = removeLegacyStatusFilter(nextHtml);

  instrumentSources.forEach((source) => {
    nextHtml = insertDedicatedInstrumentDialog(
      nextHtml,
      source,
      createDialogsByCard.get(source.cardId),
    );
  });

  nextHtml = installDedicatedInstrumentDialogStyles(nextHtml);

  return installDedicatedInstrumentDialogScript(nextHtml);
}

export const keepCardInstrumentsInsideEditDialog = moveCardInstrumentsToDedicatedDialog;

function removeLegacyStatusFilter(html: string): string {
  return html.replace(
    /<label>\s*Status\s*<select data-master-status>[\s\S]*?<\/select>\s*<\/label>/,
    "",
  );
}

function collectCreateInstrumentDialogs(html: string): InstrumentCreateDialog[] {
  const dialogPattern =
    /\s*<dialog id="new-card-instrument-dialog-([^"]+)" class="master-dialog" aria-labelledby="[^"]+">[\s\S]*?<\/dialog>/g;
  const createDialogs: InstrumentCreateDialog[] = [];

  for (const match of html.matchAll(dialogPattern)) {
    const dialogHtml = match[0];
    const formMatch = dialogHtml.match(
      /<form data-api-form data-api-path="\/api\/credit-card-accounts\/[^"]+\/instruments" class="edit-grid">[\s\S]*?<\/form>/,
    );

    if (!formMatch) continue;

    createDialogs.push({
      cardId: match[1] ?? "",
      dialogHtml,
      formHtml: formMatch[0],
    });
  }

  return createDialogs;
}

function collectCardInstrumentSources(html: string): CardInstrumentDialogSource[] {
  const cardArticlePattern = /<article class="master-item card-account-item"[\s\S]*?<\/article>/g;
  const sources: CardInstrumentDialogSource[] = [];

  for (const match of html.matchAll(cardArticlePattern)) {
    const articleHtml = match[0];
    const cardId = articleHtml.match(/<dialog id="edit-card-dialog-([^"]+)"/)?.[1];
    const cardNameHtml = articleHtml.match(
      /<div class="item-title-row">\s*<strong>([\s\S]*?)<\/strong>/,
    )?.[1];
    const listHtml = extractNestedDivByClass(articleHtml, "instrument-list");

    if (!cardId || !cardNameHtml || !listHtml) continue;

    const warningHtml = articleHtml.match(/<p class="instrument-warning"[\s\S]*?<\/p>/)?.[0] ?? "";
    const instrumentCount = (listHtml.match(/data-card-instrument/g) ?? []).length;

    sources.push({
      cardId,
      cardNameHtml,
      instrumentCount,
      isArchived: /data-status="archived"/.test(articleHtml),
      listHtml,
      warningHtml,
    });
  }

  return sources;
}

function removeStandaloneNewInstrumentButtons(html: string): string {
  return html.replace(
    /\s*<button\b(?=[^>]*\bclass="icon-button")(?=[^>]*\bdata-open-dialog="new-card-instrument-dialog-[^"]+")[^>]*>[\s\S]*?<\/button>/g,
    "",
  );
}

function removeInlineInstrumentSections(html: string): string {
  return html.replace(
    /\s*<section class="dialog-subsection" aria-label="Instrumentos de [^"]+">[\s\S]*?<\/section>/g,
    "",
  );
}

function extractNestedDivByClass(html: string, className: string): string | undefined {
  const start = html.indexOf(`<div class="${className}`);
  if (start === -1) return undefined;

  const openTagEnd = html.indexOf(">", start);
  if (openTagEnd === -1) return undefined;

  const end = findClosingDivEnd(html, openTagEnd + 1);
  if (end === -1) return undefined;

  return html.slice(start, end);
}

function removeNestedDivByClass(html: string, className: string): string {
  const openNeedle = `<div class="${className}`;
  let result = "";
  let index = 0;

  while (index < html.length) {
    const start = html.indexOf(openNeedle, index);
    if (start === -1) {
      result += html.slice(index);
      break;
    }

    result += html.slice(index, start);
    const openTagEnd = html.indexOf(">", start);
    if (openTagEnd === -1) break;

    const end = findClosingDivEnd(html, openTagEnd + 1);
    if (end === -1) break;

    index = end;
  }

  return result;
}

function findClosingDivEnd(html: string, startIndex: number): number {
  const divPattern = /<\/?div\b[^>]*>/g;
  divPattern.lastIndex = startIndex;
  let depth = 1;
  let match: RegExpExecArray | null;

  while ((match = divPattern.exec(html)) !== null) {
    const tag = match[0];
    if (tag.startsWith("</")) {
      depth -= 1;
    } else if (!tag.endsWith("/>")) {
      depth += 1;
    }

    if (depth === 0) return divPattern.lastIndex;
  }

  return -1;
}

function insertDedicatedInstrumentDialog(
  html: string,
  source: CardInstrumentDialogSource,
  createDialog: InstrumentCreateDialog | undefined,
): string {
  const editDialogNeedle = `<dialog id="edit-card-dialog-${source.cardId}"`;
  const editDialogStart = html.indexOf(editDialogNeedle);
  if (editDialogStart === -1) return html;

  const articleStart = html.lastIndexOf(
    '<article class="master-item card-account-item"',
    editDialogStart,
  );
  if (articleStart === -1) return html;

  const actionListStart = html.indexOf('<div class="item-actions"', articleStart);
  const actionListOpenEnd =
    actionListStart >= 0 && actionListStart < editDialogStart
      ? html.indexOf(">", actionListStart) + 1
      : -1;
  if (actionListOpenEnd <= 0) return html;

  const dialogId = `card-instruments-dialog-${source.cardId}`;
  const viewAction = `
        <button type="button" class="icon-button" data-open-dialog="${escapeAttribute(dialogId)}" data-view-instruments aria-label="Ver instrumentos" title="Ver instrumentos">${icon("list", 16, "action-icon")}</button>`;
  const withAction = `${html.slice(0, actionListOpenEnd)}${viewAction}${html.slice(actionListOpenEnd)}`;
  const adjustedEditDialogStart = withAction.indexOf(
    editDialogNeedle,
    editDialogStart + viewAction.length,
  );
  if (adjustedEditDialogStart === -1) return withAction;

  const dialogHtml = renderDedicatedInstrumentDialog(source, createDialog, dialogId);

  return `${withAction.slice(0, adjustedEditDialogStart)}${dialogHtml}${withAction.slice(adjustedEditDialogStart)}`;
}

function renderDedicatedInstrumentDialog(
  source: CardInstrumentDialogSource,
  createDialog: InstrumentCreateDialog | undefined,
  dialogId: string,
): string {
  const titleId = `${dialogId}-title`;
  const formId = `new-card-instrument-form-${source.cardId}`;
  const listContent = renderInstrumentListContent(source, formId, Boolean(createDialog));
  const createSection = createDialog
    ? renderDedicatedCreateInstrumentSection(createDialog, source, formId)
    : "";

  return `
      <dialog id="${escapeAttribute(dialogId)}" class="master-dialog card-instruments-dialog" aria-labelledby="${escapeAttribute(titleId)}" data-card-instruments-dedicated-dialog>
        <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
        <div class="dialog-heading card-instruments-dialog-heading">
          <div>
            <p class="eyebrow">Cart\u00e3o</p>
            <h2 id="${escapeAttribute(titleId)}">Instrumentos do cart\u00e3o</h2>
            <p class="muted">${source.cardNameHtml}</p>
          </div>
        </div>
        <section class="dialog-subsection dialog-instrument-list" aria-label="Instrumentos cadastrados no cart\u00e3o">
          ${listContent}
        </section>
        ${createSection}
        <form method="dialog" class="instrument-dialog-footer"><button type="submit" class="secondary-button">Fechar</button></form>
      </dialog>
`;
}

function renderInstrumentListContent(
  source: CardInstrumentDialogSource,
  formId: string,
  canCreate: boolean,
): string {
  if (source.instrumentCount === 0) {
    const action = canCreate
      ? `<button type="button" data-toggle-instrument-create="${escapeAttribute(formId)}" aria-expanded="false"${source.isArchived ? " disabled" : ""}>${icon("plus", 15)} Adicionar primeiro instrumento</button>`
      : "";

    return `
          <div class="instrument-empty-state" data-instrument-empty-state>
            <strong>Nenhum instrumento cadastrado.</strong>
            <p class="muted">Adicione o primeiro instrumento para voltar a usar este cart\u00e3o em novos lan\u00e7amentos.</p>
            ${action}
          </div>`;
  }

  return `${source.warningHtml}${source.listHtml}`;
}

function renderDedicatedCreateInstrumentSection(
  dialog: InstrumentCreateDialog,
  source: CardInstrumentDialogSource,
  formId: string,
): string {
  const formHtml = dialog.formHtml.replace(
    "<form data-api-form",
    `<form id="${escapeAttribute(formId)}" hidden data-api-form`,
  );
  const headerAction =
    source.instrumentCount > 0
      ? `<button type="button" data-toggle-instrument-create="${escapeAttribute(formId)}" aria-expanded="false"${source.isArchived ? " disabled" : ""}>${icon("plus", 15)} Adicionar instrumento</button>`
      : "";

  return `
        <section class="dialog-subsection instrument-create-section" aria-label="Adicionar instrumento ao cart\u00e3o">
          <div class="dialog-subsection-heading">
            <div>
              <p class="eyebrow">Novo instrumento</p>
              <h3>Adicionar instrumento</h3>
            </div>
            ${headerAction}
          </div>
          ${formHtml}
        </section>
`;
}

function installDedicatedInstrumentDialogStyles(html: string): string {
  const styles = `
    <style data-card-instruments-dedicated-dialog-styles>
      .card-instruments-dialog { max-width: 760px; width: min(760px, calc(100vw - 32px)); }
      .card-instruments-dialog-heading { padding-right: 52px; }
      .dialog-instrument-list .instrument-list { margin-top: 0; max-height: min(38vh, 340px); overflow: auto; overscroll-behavior: contain; }
      .dialog-instrument-list .instrument-item { background: var(--surface); padding: 8px 10px; }
      .dialog-instrument-list .instrument-side { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
      .dialog-instrument-list .instrument-tags { justify-content: flex-end; }
      .dialog-instrument-list .instrument-actions { flex: 0 0 auto; margin-left: auto; }
      .dialog-instrument-list .instrument-actions .icon-button { background: #fff; border-color: #e2e8f0; color: #64748b; }
      .dialog-instrument-list .instrument-actions .icon-button:hover:not(:disabled), .dialog-instrument-list .instrument-actions .icon-button:focus-visible { background: #f1f5f9; border-color: #cbd5e1; color: #334155; }
      .dialog-instrument-list .instrument-actions .danger-icon-button:hover:not(:disabled), .dialog-instrument-list .instrument-actions .danger-icon-button:focus-visible { background: var(--danger-bg); border-color: #fecaca; color: var(--danger); }
      .instrument-empty-state { align-items: flex-start; background: var(--surface-soft); border: 1px dashed var(--line); border-radius: var(--radius); display: flex; flex-direction: column; gap: 8px; padding: 16px; }
      .instrument-empty-state p { margin: 0; }
      .instrument-create-section[hidden] { display: none; }
      .instrument-dialog-footer { display: flex; justify-content: flex-end; padding-top: 4px; }
      @media (max-width: 760px) {
        .card-instruments-dialog { width: calc(100vw - 24px); }
        .dialog-instrument-list .instrument-side { align-items: flex-start; justify-content: flex-start; }
        .dialog-instrument-list .instrument-tags { justify-content: flex-start; }
        .dialog-instrument-list .instrument-actions { margin-left: 0; }
        .instrument-dialog-footer button { width: 100%; }
      }
    </style>`;

  if (html.includes("</head>")) return html.replace("</head>", `${styles}</head>`);

  return `${styles}${html}`;
}

function installDedicatedInstrumentDialogScript(html: string): string {
  const script = `
    <script data-card-instruments-dedicated-dialog-script>
      (() => {
        const toggles = Array.from(document.querySelectorAll("[data-toggle-instrument-create]"));

        function setFormVisibility(formId, shouldShow) {
          const form = formId ? document.getElementById(formId) : null;
          if (!form) return;
          form.hidden = !shouldShow;
          toggles
            .filter((button) => button.dataset.toggleInstrumentCreate === formId)
            .forEach((button) => button.setAttribute("aria-expanded", String(shouldShow)));

          if (shouldShow) {
            const firstField = form.querySelector("input, select, button");
            if (firstField && typeof firstField.focus === "function") firstField.focus();
          }
        }

        toggles.forEach((button) => {
          button.addEventListener("click", () => {
            const formId = button.dataset.toggleInstrumentCreate;
            const form = formId ? document.getElementById(formId) : null;
            if (!form) return;
            setFormVisibility(formId, form.hidden);
          });
        });
      })();
    </script>
`;

  if (html.includes("</body>")) return html.replace("</body>", `${script}</body>`);

  return `${html}${script}`;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
