import { renderAccountsCardsPage as renderBaseAccountsCardsPage } from "./accounts-cards-page.js";

interface InstrumentCreateDialog {
  cardId: string;
  dialogHtml: string;
  formHtml: string;
}

interface CardInstrumentList {
  cardId: string;
  listHtml: string;
}

export async function renderAccountsCardsPage(token: string): Promise<string> {
  const html = await renderBaseAccountsCardsPage(token);

  return keepCardInstrumentsInsideEditDialog(html);
}

export function keepCardInstrumentsInsideEditDialog(html: string): string {
  if (html.includes("data-card-instruments-dialog-list")) return html;

  const createDialogs = collectCreateInstrumentDialogs(html);
  const instrumentLists = collectCardInstrumentLists(html);
  let nextHtml = html;

  createDialogs.forEach((dialog) => {
    nextHtml = nextHtml.replace(dialog.dialogHtml, "");
  });

  nextHtml = nextHtml.replace(
    "Cadastre o cartão agrupador e acompanhe os instrumentos internos usados nas compras.",
    "Cadastre o cartão agrupador e gerencie seus instrumentos pelo pop-up de edição.",
  );
  nextHtml = removeInlineInstrumentSections(nextHtml);
  nextHtml = removeNestedDivByClass(nextHtml, "instrument-list");
  nextHtml = nextHtml.replace(/\s*<p class="instrument-warning"[\s\S]*?<\/p>/g, "");
  nextHtml = removeStandaloneNewInstrumentButtons(nextHtml);
  nextHtml = removeLegacyStatusFilter(nextHtml);

  instrumentLists.forEach((instrumentList) => {
    nextHtml = insertDialogInstrumentList(nextHtml, instrumentList);
  });

  createDialogs.forEach((dialog) => {
    nextHtml = insertInlineCreateInstrumentForm(nextHtml, dialog);
  });

  nextHtml = installDialogInstrumentListStyles(nextHtml);

  return installInlineCreateInstrumentScript(nextHtml);
}

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

function collectCardInstrumentLists(html: string): CardInstrumentList[] {
  const cardArticlePattern = /<article class="master-item card-account-item"[\s\S]*?<\/article>/g;
  const instrumentLists: CardInstrumentList[] = [];

  for (const match of html.matchAll(cardArticlePattern)) {
    const articleHtml = match[0];
    const cardId = articleHtml.match(/<dialog id="edit-card-dialog-([^"]+)"/)?.[1];
    const listHtml = extractNestedDivByClass(articleHtml, "instrument-list");

    if (!cardId || !listHtml) continue;
    instrumentLists.push({ cardId, listHtml });
  }

  return instrumentLists;
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

function insertDialogInstrumentList(html: string, instrumentList: CardInstrumentList): string {
  const editDialogNeedle = `<dialog id="edit-card-dialog-${instrumentList.cardId}"`;
  const dialogStart = html.indexOf(editDialogNeedle);
  if (dialogStart === -1) return html;

  const dialogEnd = html.indexOf("</dialog>", dialogStart);
  if (dialogEnd === -1) return html;

  const listSection = renderDialogInstrumentListSection(instrumentList);

  return `${html.slice(0, dialogEnd)}${listSection}${html.slice(dialogEnd)}`;
}

function renderDialogInstrumentListSection(instrumentList: CardInstrumentList): string {
  return `
      <section class="dialog-subsection dialog-instrument-list" aria-label="Instrumentos cadastrados no cartão">
        <div class="dialog-subsection-heading">
          <div>
            <p class="eyebrow">Instrumentos do cartão</p>
            <h3>Lista de instrumentos</h3>
          </div>
        </div>
        ${instrumentList.listHtml}
      </section>
`;
}

function insertInlineCreateInstrumentForm(html: string, dialog: InstrumentCreateDialog): string {
  const editDialogNeedle = `<dialog id="edit-card-dialog-${dialog.cardId}"`;
  const dialogStart = html.indexOf(editDialogNeedle);
  if (dialogStart === -1) return html;

  const dialogEnd = html.indexOf("</dialog>", dialogStart);
  if (dialogEnd === -1) return html;

  const createSection = renderInlineCreateInstrumentSection(dialog);

  return `${html.slice(0, dialogEnd)}${createSection}${html.slice(dialogEnd)}`;
}

function renderInlineCreateInstrumentSection(dialog: InstrumentCreateDialog): string {
  const formId = `new-card-instrument-form-${dialog.cardId}`;
  const formHtml = dialog.formHtml.replace(
    "<form data-api-form",
    `<form id="${escapeAttribute(formId)}" hidden data-api-form`,
  );

  return `
      <section class="dialog-subsection" aria-label="Novo instrumento do cartão">
        <div class="dialog-subsection-heading">
          <div>
            <p class="eyebrow">Novo instrumento</p>
            <h3>Adicionar instrumento</h3>
          </div>
          <button type="button" class="secondary-button" data-toggle-instrument-create="${escapeAttribute(formId)}" aria-expanded="false">Novo instrumento</button>
        </div>
        ${formHtml}
      </section>
`;
}

function installDialogInstrumentListStyles(html: string): string {
  const styles = `
    <style data-card-instruments-dialog-list>
      .dialog-instrument-list .instrument-list { margin-top: 0; max-height: min(38vh, 340px); overflow: auto; }
      .dialog-instrument-list .instrument-item { background: var(--surface); padding: 8px 10px; }
      .dialog-instrument-list .instrument-side { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
      .dialog-instrument-list .instrument-tags { justify-content: flex-end; }
      .dialog-instrument-list .instrument-actions { flex: 0 0 auto; margin-left: auto; }
      .dialog-instrument-list .instrument-actions .icon-button { background: #fff; border-color: #e2e8f0; color: #64748b; }
      .dialog-instrument-list .instrument-actions .icon-button:hover:not(:disabled), .dialog-instrument-list .instrument-actions .icon-button:focus-visible { background: #f1f5f9; border-color: #cbd5e1; color: #334155; }
      .dialog-instrument-list .instrument-actions .danger-icon-button:hover:not(:disabled), .dialog-instrument-list .instrument-actions .danger-icon-button:focus-visible { background: var(--danger-bg); border-color: #fecaca; color: var(--danger); }
      @media (max-width: 760px) {
        .dialog-instrument-list .instrument-side { align-items: flex-start; justify-content: flex-start; }
        .dialog-instrument-list .instrument-tags { justify-content: flex-start; }
        .dialog-instrument-list .instrument-actions { margin-left: 0; }
      }
    </style>`;

  if (html.includes("</head>")) return html.replace("</head>", `${styles}</head>`);

  return `${styles}${html}`;
}

function installInlineCreateInstrumentScript(html: string): string {
  const script = `
    <script>
      document.querySelectorAll("[data-toggle-instrument-create]").forEach((button) => {
        button.addEventListener("click", () => {
          const formId = button.dataset.toggleInstrumentCreate;
          const form = formId ? document.getElementById(formId) : null;
          if (!form) return;

          const shouldShow = form.hidden;
          form.hidden = !shouldShow;
          button.setAttribute("aria-expanded", String(shouldShow));

          if (shouldShow) {
            const firstField = form.querySelector("input, select, button");
            if (firstField && typeof firstField.focus === "function") firstField.focus();
          }
        });
      });
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
