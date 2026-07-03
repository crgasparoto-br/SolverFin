import { renderAccountsCardsPage as renderBaseAccountsCardsPage } from "./accounts-cards-page.js";

interface InstrumentCreateDialog {
  cardId: string;
  dialogHtml: string;
  formHtml: string;
}

export async function renderAccountsCardsPage(token: string): Promise<string> {
  const html = await renderBaseAccountsCardsPage(token);

  return keepCardInstrumentsInsideEditDialog(html);
}

function keepCardInstrumentsInsideEditDialog(html: string): string {
  const createDialogs = collectCreateInstrumentDialogs(html);
  let nextHtml = html;

  createDialogs.forEach((dialog) => {
    nextHtml = nextHtml.replace(dialog.dialogHtml, "");
  });

  nextHtml = nextHtml.replace(
    "Cadastre o cartão agrupador e acompanhe os instrumentos internos usados nas compras.",
    "Cadastre o cartão agrupador e gerencie seus instrumentos pelo pop-up de edição.",
  );
  nextHtml = removeNestedDivByClass(nextHtml, "instrument-list");
  nextHtml = nextHtml.replace(/\n\s*<p class="instrument-warning"[\s\S]*?<\/p>/g, "");
  nextHtml = removeStandaloneNewInstrumentButtons(nextHtml);
  nextHtml = removeInstrumentEditDialogs(nextHtml);

  createDialogs.forEach((dialog) => {
    nextHtml = insertInlineCreateInstrumentForm(nextHtml, dialog);
  });

  return installInlineCreateInstrumentScript(nextHtml);
}

function collectCreateInstrumentDialogs(html: string): InstrumentCreateDialog[] {
  const dialogPattern =
    /\n\s*<dialog id="new-card-instrument-dialog-([^"]+)" class="master-dialog" aria-labelledby="[^"]+">[\s\S]*?<\/dialog>/g;
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

function removeStandaloneNewInstrumentButtons(html: string): string {
  return html.replace(
    /\n\s*<button type="button" class="icon-button" data-open-dialog="new-card-instrument-dialog-[^"]+" aria-label="Adicionar instrumento em [^"]+"(?: disabled)?>[\s\S]*?<\/button>/g,
    "",
  );
}

function removeInstrumentEditDialogs(html: string): string {
  return html.replace(
    /\n\s*<dialog id="edit-card-instrument-dialog-[^"]+" class="master-dialog" aria-labelledby="[^"]+">[\s\S]*?<\/dialog>/g,
    "",
  );
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
