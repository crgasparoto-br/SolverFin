import { icon } from "./icons.js";

export type InboxDateSort = "date_asc" | "date_desc";

export function normalizeInboxDate(value: string): string | undefined {
  const trimmed = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const brazilianMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  const normalized = isoMatch
    ? `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
    : brazilianMatch
      ? `${brazilianMatch[3]}-${brazilianMatch[2]}-${brazilianMatch[1]}`
      : undefined;

  if (!normalized) return undefined;

  const date = new Date(`${normalized}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized
    ? undefined
    : normalized;
}

export function isInboxDateInRange(value: string, startsOn?: string, endsOn?: string): boolean {
  const normalized = normalizeInboxDate(value);
  const normalizedStart = startsOn ? normalizeInboxDate(startsOn) : undefined;
  const normalizedEnd = endsOn ? normalizeInboxDate(endsOn) : undefined;

  if (!normalized) return !normalizedStart && !normalizedEnd;
  if (normalizedStart && normalized < normalizedStart) return false;
  if (normalizedEnd && normalized > normalizedEnd) return false;
  return true;
}

export function compareInboxDates(left: string, right: string, sort: InboxDateSort): number {
  const normalizedLeft = normalizeInboxDate(left);
  const normalizedRight = normalizeInboxDate(right);

  if (!normalizedLeft && !normalizedRight) return 0;
  if (!normalizedLeft) return 1;
  if (!normalizedRight) return -1;

  return sort === "date_asc"
    ? normalizedLeft.localeCompare(normalizedRight)
    : normalizedRight.localeCompare(normalizedLeft);
}

export interface InboxSelectableCheckbox {
  checked: boolean;
  disabled?: boolean;
}

export function setInboxCheckboxSelection<T extends InboxSelectableCheckbox>(
  checkboxes: readonly T[],
  shouldSelect: boolean,
  onChange?: (checkbox: T) => void,
): number {
  let changed = 0;
  for (const checkbox of checkboxes) {
    if (checkbox.disabled || checkbox.checked === shouldSelect) continue;
    checkbox.checked = shouldSelect;
    changed += 1;
    onChange?.(checkbox);
  }
  return changed;
}

export function enhanceInboxListLayout(html: string, url: URL): string {
  if (!html.includes('id="import-line-filter"') || !html.includes("</body>")) return html;

  const startsOn = normalizeInboxDate(url.searchParams.get("lineStart") ?? "") ?? "";
  const endsOn = normalizeInboxDate(url.searchParams.get("lineEnd") ?? "") ?? "";
  const sort: InboxDateSort =
    url.searchParams.get("lineSort") === "date_asc" ? "date_asc" : "date_desc";
  const iconMap = JSON.stringify({
    calendar: icon("calendar", 13),
    check: icon("check", 13),
    close: icon("x", 13),
    edit: icon("pencil", 13),
    eye: icon("eye", 13),
    file: icon("file-text", 13),
    receipt: icon("receipt", 13),
    refresh: icon("refresh-cw", 13),
    reject: icon("x-circle", 13),
    save: icon("save", 13),
    search: icon("search", 13),
    sort: icon("arrow-down", 13),
    trash: icon("trash-2", 13),
    upload: icon("upload", 13),
  }).replace(/</g, "\\u003c");

  const initialState = JSON.stringify({ startsOn, endsOn, sort }).replace(/</g, "\\u003c");
  const styles = `
    <style id="inbox-list-layout-styles">
      .import-workspace { gap: 10px !important; }
      .import-heading { align-items: center !important; }
      .line-filter-bar.inbox-list-toolbar { align-items: end; display: grid !important; gap: 8px !important; grid-template-columns: minmax(170px, .9fr) repeat(2, minmax(145px, .75fr)) minmax(190px, .9fr) auto minmax(115px, auto); padding: 8px 10px !important; }
      .inbox-list-toolbar label { display: grid; gap: 4px; margin: 0; }
      .inbox-list-toolbar label > span { align-items: center; color: var(--muted); display: inline-flex; font-size: .7rem; font-weight: 700; gap: 5px; letter-spacing: .02em; }
      .inbox-list-toolbar input, .inbox-list-toolbar select { min-height: 34px; }
      .inbox-visible-lines { align-self: center; color: var(--muted); font-size: .75rem; font-weight: 700; text-align: right; white-space: nowrap; }
      .import-layout { gap: 10px !important; grid-template-columns: minmax(205px, 250px) minmax(0, 1fr) !important; }
      .import-batch-list { gap: 4px !important; }
      .batch-item { border-radius: var(--radius-lg) !important; gap: 2px !important; min-height: 58px; padding: 7px 9px !important; }
      .batch-item strong { align-items: center; display: inline-flex; gap: 6px; }
      .batch-item span { font-size: .72rem !important; line-height: 1.25; }
      .import-detail { gap: 8px !important; min-width: 0; }
      .detail-heading { align-items: center !important; gap: 8px !important; padding-bottom: 7px !important; }
      .detail-heading h3 { font-size: 1rem; }
      .import-summary { gap: 4px !important; }
      .import-summary span { border-radius: 999px; font-size: .68rem !important; padding: 4px 7px !important; }
      .bulk-actions { gap: 8px !important; min-height: 38px; padding: 6px 8px !important; }
      .bulk-actions > div { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
      .import-rows { gap: 4px !important; }
      .import-row { align-items: start !important; border-radius: var(--radius-lg) !important; display: grid !important; gap: 6px !important; grid-template-columns: 26px minmax(0, 1fr) !important; padding: 6px 8px !important; }
      .import-row[hidden] { display: none !important; }
      .import-row > [data-select-suggestion] { margin-top: 5px; }
      .row-editor { display: grid; gap: 5px !important; min-width: 0; }
      .row-heading { align-items: center; display: flex; gap: 7px; justify-content: space-between; }
      .row-heading strong { font-size: .78rem; }
      .status-pill { min-height: 24px !important; padding: 3px 7px !important; }
      .row-summary { display: grid !important; gap: 4px 10px !important; grid-template-columns: minmax(90px, .65fr) minmax(72px, .55fr) minmax(100px, .7fr) minmax(170px, 1.6fr) minmax(132px, 1fr); margin: 0 !important; }
      .row-summary > div { align-content: start; display: grid !important; gap: 2px; min-width: 0; }
      .row-summary dt { color: var(--muted); font-size: .62rem !important; font-weight: 700; letter-spacing: .02em; line-height: 1.15; text-transform: uppercase; }
      .row-summary dd { font-size: .75rem !important; line-height: 1.25; margin: 0 !important; min-width: 0; overflow-wrap: anywhere; word-break: normal; }
      .row-summary > div:nth-child(1) dd, .row-summary > div:nth-child(3) dd { white-space: nowrap; }
      .inline-actions, .maintenance-actions { gap: 4px !important; }
      .inline-actions button, .inline-actions .button-link, .maintenance-actions button, .maintenance-actions .button-link { font-size: .72rem !important; min-height: 30px !important; padding: 0 8px !important; }
      .candidate-list { display: grid; gap: 4px !important; grid-column: 2; }
      .candidate-card { align-items: center !important; gap: 8px !important; padding: 6px 8px !important; }
      .candidate-card p { font-size: .72rem; margin: 2px 0 0; }
      .inbox-list-empty { grid-column: 1 / -1; margin: 4px 0 0; }
      .maintenance-rows { gap: 5px !important; }
      .maintenance-item { gap: 7px !important; padding: 8px 10px !important; }
      .maintenance-summary span, .message-preview p { font-size: .75rem !important; }
      button svg, .button-link svg, .batch-item svg, .inbox-list-toolbar svg { flex: 0 0 auto; }
      @media (max-width: 1120px) {
        .line-filter-bar.inbox-list-toolbar { grid-template-columns: repeat(3, minmax(150px, 1fr)); }
        .inbox-visible-lines { text-align: left; }
        .import-layout { grid-template-columns: 1fr !important; }
        .row-summary { grid-template-columns: repeat(3, minmax(140px, 1fr)); }
      }
      @media (max-width: 760px) {
        .line-filter-bar.inbox-list-toolbar, .import-layout { grid-template-columns: 1fr !important; }
        .inbox-visible-lines { text-align: left; }
        .row-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .detail-heading, .bulk-actions { align-items: stretch !important; display: grid !important; }
        .bulk-actions > div { justify-content: flex-start; }
      }
      @media (max-width: 480px) {
        .row-summary { grid-template-columns: 1fr; }
        .row-summary dd { white-space: normal; }
      }
    </style>`;

  const script = `
    <script id="inbox-list-layout-script">
      (() => {
        const icons = ${iconMap};
        const initial = ${initialState};
        const normalizeInboxDate = ${normalizeInboxDate.toString()};
        const isInboxDateInRange = ${isInboxDateInRange.toString()};
        const compareInboxDates = ${compareInboxDates.toString()};
        const setInboxCheckboxSelection = ${setInboxCheckboxSelection.toString()};
        let scheduled = false;

        function iconize(element, iconName, title) {
          if (!element || element.dataset.inboxIconized === "true") return;
          if (!element.querySelector("svg") && icons[iconName]) {
            element.insertAdjacentHTML("afterbegin", icons[iconName]);
          }
          element.dataset.inboxIconized = "true";
          if (title && !element.getAttribute("title")) element.setAttribute("title", title);
        }

        function ensureToolbar() {
          const lineFilter = document.getElementById("import-line-filter");
          const toolbar = lineFilter?.closest(".line-filter-bar");
          if (!toolbar || document.getElementById("inbox-date-start")) return;

          toolbar.classList.add("inbox-list-toolbar");
          toolbar.insertAdjacentHTML(
            "beforeend",
            '<label><span>' + icons.calendar + ' Data inicial</span><input id="inbox-date-start" type="date" value="' + initial.startsOn + '" /></label>' +
              '<label><span>' + icons.calendar + ' Data final</span><input id="inbox-date-end" type="date" value="' + initial.endsOn + '" /></label>' +
              '<label><span>' + icons.sort + ' Ordenar por data</span><select id="inbox-date-sort"><option value="date_desc">Mais recentes primeiro</option><option value="date_asc">Mais antigas primeiro</option></select></label>' +
              '<button type="button" class="secondary-button" id="clear-inbox-date-filters" title="Limpar período e restaurar ordenação">' + icons.close + ' Limpar período</button>' +
              '<span class="inbox-visible-lines" id="inbox-visible-lines" role="status" aria-live="polite"></span>',
          );

          document.getElementById("inbox-date-sort").value = initial.sort;
          ["inbox-date-start", "inbox-date-end", "inbox-date-sort"].forEach((id) => {
            document.getElementById(id)?.addEventListener("change", () => {
              updateUrl();
              applyListState();
            });
          });
          document.getElementById("clear-inbox-date-filters")?.addEventListener("click", () => {
            document.getElementById("inbox-date-start").value = "";
            document.getElementById("inbox-date-end").value = "";
            document.getElementById("inbox-date-sort").value = "date_desc";
            updateUrl();
            applyListState();
          });
        }

        function updateUrl() {
          const url = new URL(window.location.href);
          const startsOn = document.getElementById("inbox-date-start")?.value || "";
          const endsOn = document.getElementById("inbox-date-end")?.value || "";
          const sort = document.getElementById("inbox-date-sort")?.value || "date_desc";
          if (startsOn) url.searchParams.set("lineStart", startsOn); else url.searchParams.delete("lineStart");
          if (endsOn) url.searchParams.set("lineEnd", endsOn); else url.searchParams.delete("lineEnd");
          if (sort !== "date_desc") url.searchParams.set("lineSort", sort); else url.searchParams.delete("lineSort");
          window.history.replaceState({}, "", url.pathname + url.search + url.hash);
        }

        function readRowDate(row) {
          const entry = [...row.querySelectorAll(".row-summary > div")].find(
            (item) => item.querySelector("dt")?.textContent?.trim() === "Data",
          );
          return normalizeInboxDate(entry?.querySelector("dd")?.textContent || "");
        }

        function visibleEligibleCheckboxes() {
          return [...document.querySelectorAll(".import-row:not([hidden]) [data-select-suggestion]")].filter(
            (box) => !box.disabled,
          );
        }

        function syncSelectAll() {
          const selectAll = document.getElementById("select-all-import-lines");
          if (!selectAll) return;
          const boxes = visibleEligibleCheckboxes();
          selectAll.checked = boxes.length > 0 && boxes.every((box) => box.checked);
          selectAll.indeterminate = boxes.some((box) => box.checked) && !selectAll.checked;
          selectAll.parentElement?.setAttribute(
            "title",
            boxes.length ? "Selecionar somente as linhas elegíveis visíveis" : "Nenhuma linha elegível visível",
          );
        }

        function applyListState() {
          ensureToolbar();
          const container = document.querySelector("#import-batch-detail .import-rows");
          if (!container) {
            iconizeDynamicActions();
            return;
          }

          const startsOn = document.getElementById("inbox-date-start")?.value || "";
          const endsOn = document.getElementById("inbox-date-end")?.value || "";
          const sort = document.getElementById("inbox-date-sort")?.value === "date_asc" ? "date_asc" : "date_desc";
          const rows = [...container.querySelectorAll(":scope > .import-row")];
          const sorted = [...rows].sort((left, right) =>
            compareInboxDates(readRowDate(left) || "", readRowDate(right) || "", sort),
          );
          const orderChanged = rows.some((row, index) => row !== sorted[index]);
          if (orderChanged) sorted.forEach((row) => container.appendChild(row));

          let visibleCount = 0;
          sorted.forEach((row) => {
            const visible = isInboxDateInRange(readRowDate(row) || "", startsOn, endsOn);
            row.hidden = !visible;
            if (visible) visibleCount += 1;
            const checkbox = row.querySelector("[data-select-suggestion]");
            if (!visible && checkbox?.checked) {
              checkbox.checked = false;
              checkbox.dispatchEvent(new Event("change", { bubbles: true }));
            }
          });

          let emptyState = document.getElementById("inbox-date-empty-state");
          if (rows.length > 0 && visibleCount === 0) {
            if (!emptyState) {
              container.insertAdjacentHTML(
                "beforeend",
                '<div class="empty-state inbox-list-empty" id="inbox-date-empty-state"><strong>Nenhum lançamento no período selecionado.</strong><p class="muted">Ajuste as datas ou limpe o período para voltar a exibir as linhas.</p></div>',
              );
            }
          } else {
            emptyState?.remove();
          }

          const counter = document.getElementById("inbox-visible-lines");
          if (counter) counter.textContent = rows.length ? visibleCount + " de " + rows.length + " linha(s)" : "";
          syncSelectAll();
          iconizeDynamicActions();
        }

        function iconizeDynamicActions() {
          const mappings = [
            ["#refresh-imports", "refresh", "Atualizar importações"],
            ["#preview-csv-import", "eye", "Pré-visualizar arquivo CSV"],
            ["#create-csv-import", "upload", "Iniciar revisão do arquivo"],
            ["#cancel-csv-line-edit", "close", "Cancelar correção"],
            ["#save-csv-line-edit", "save", "Salvar correção"],
            ["#detect-import-duplicates", "search", "Verificar possíveis duplicidades"],
            ["#discard-import", "trash", "Descartar lote"],
            ["#approve-selected-import-lines", "check", "Confirmar linhas selecionadas"],
            ["[data-line-action='edit']", "edit", "Corrigir linha"],
            ["[data-line-action='approve']", "check", "Confirmar linha"],
            ["[data-line-action='reject']", "reject", "Rejeitar linha"],
            ["[data-candidate-action='approve']", "check", "Confirmar candidato"],
            ["[data-candidate-action='reject']", "close", "Ignorar candidato"],
            ["a.button-link[href*='/lancamentos']", "receipt", "Ver lançamento no Extrato"],
            [".dialog-close-form button", "close", "Fechar diálogo"],
          ];
          mappings.forEach(([selector, iconName, title]) =>
            document.querySelectorAll(selector).forEach((element) => iconize(element, iconName, title)),
          );
          document.querySelectorAll(".batch-item strong").forEach((element) => iconize(element, "file"));
        }

        function scheduleApply() {
          if (scheduled) return;
          scheduled = true;
          window.requestAnimationFrame(() => {
            scheduled = false;
            applyListState();
          });
        }

        document.addEventListener(
          "change",
          (event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement) || target.id !== "select-all-import-lines") return;
            event.stopImmediatePropagation();
            const shouldSelect = target.checked;
            setInboxCheckboxSelection(visibleEligibleCheckboxes(), shouldSelect, (box) => {
              box.dispatchEvent(new Event("change", { bubbles: true }));
            });
            syncSelectAll();
          },
          true,
        );

        document.getElementById("import-line-filter")?.addEventListener("change", scheduleApply);
        const detail = document.getElementById("import-batch-detail");
        if (detail) new MutationObserver(scheduleApply).observe(detail, { childList: true, subtree: true });
        ensureToolbar();
        applyListState();
      })();
    </script>`;

  return html.replace("</head>", `${styles}</head>`).replace("</body>", `${script}</body>`);
}
