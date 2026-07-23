import { icon } from "./icons.js";

const DATE_FILTER_ACTION_MARKER = 'data-inbox-date-filter-action="explicit"';

export function enhanceInboxDateFilterAction(html: string): string {
  if (
    html.includes(DATE_FILTER_ACTION_MARKER) ||
    !html.includes('id="inbox-list-layout-script"') ||
    !html.includes("</body>")
  ) {
    return html;
  }

  const applyIcon = JSON.stringify(icon("search", 13)).replace(/</g, "\\u003c");
  const styles = `<style ${DATE_FILTER_ACTION_MARKER}>
    .inbox-list-toolbar #apply-inbox-date-filters {
      align-items: center;
      cursor: pointer;
      display: inline-flex;
      gap: 5px;
      isolation: isolate;
      justify-content: center;
      min-height: 34px;
      min-width: 112px;
      pointer-events: auto !important;
      position: relative;
      touch-action: manipulation;
      white-space: nowrap;
      z-index: 4;
    }
    .inbox-list-toolbar .inbox-visible-lines {
      pointer-events: none;
    }
    @media (min-width: 1121px) {
      .line-filter-bar.inbox-list-toolbar {
        grid-template-columns: minmax(170px, .9fr) repeat(2, minmax(145px, .75fr)) minmax(190px, .9fr) auto auto minmax(115px, auto) !important;
      }
    }
  </style>`;
  const script = `<script ${DATE_FILTER_ACTION_MARKER}>
    (() => {
      const applyIcon = ${applyIcon};

      function normalizeDate(value) {
        const text = String(value || "").trim();
        const iso = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(text);
        const brazilian = /^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/.exec(text);
        return iso ? text : brazilian ? brazilian[3] + "-" + brazilian[2] + "-" + brazilian[1] : "";
      }

      function readRowDate(row) {
        const group = [...row.querySelectorAll(".row-summary > div")].find(
          (item) => item.querySelector("dt")?.textContent?.trim() === "Data",
        );
        const value = group?.querySelector("dd");
        return normalizeDate(
          value?.dataset.fullValue ||
            value?.querySelector(".row-summary-value-preview")?.textContent ||
            value?.getAttribute("title") ||
            value?.textContent ||
            "",
        );
      }

      function applyDateFilter() {
        const container = document.querySelector("#import-batch-detail .import-rows");
        if (!container) return;

        const startsOn = normalizeDate(document.getElementById("inbox-date-start")?.value);
        const endsOn = normalizeDate(document.getElementById("inbox-date-end")?.value);
        const sort = document.getElementById("inbox-date-sort")?.value === "date_asc" ? "date_asc" : "date_desc";
        const rows = [...container.querySelectorAll(":scope > .import-row")];

        rows.sort((left, right) => {
          const leftDate = readRowDate(left);
          const rightDate = readRowDate(right);
          if (!leftDate && !rightDate) return 0;
          if (!leftDate) return 1;
          if (!rightDate) return -1;
          return sort === "date_asc" ? leftDate.localeCompare(rightDate) : rightDate.localeCompare(leftDate);
        });
        rows.forEach((row) => container.appendChild(row));

        let visibleCount = 0;
        rows.forEach((row) => {
          const rowDate = readRowDate(row);
          const visible = Boolean(rowDate) && (!startsOn || rowDate >= startsOn) && (!endsOn || rowDate <= endsOn);
          row.hidden = !visible;
          if (visible) visibleCount += 1;
        });

        const url = new URL(window.location.href);
        if (startsOn) url.searchParams.set("lineStart", startsOn); else url.searchParams.delete("lineStart");
        if (endsOn) url.searchParams.set("lineEnd", endsOn); else url.searchParams.delete("lineEnd");
        if (sort !== "date_desc") url.searchParams.set("lineSort", sort); else url.searchParams.delete("lineSort");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);

        const counter = document.getElementById("inbox-visible-lines");
        if (counter) counter.textContent = rows.length ? visibleCount + " de " + rows.length + " linha(s)" : "";

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
      }

      function ensureApplyButton() {
        if (document.getElementById("apply-inbox-date-filters")) return;
        const clearButton = document.getElementById("clear-inbox-date-filters");
        if (!clearButton) return;

        const applyButton = document.createElement("button");
        applyButton.type = "button";
        applyButton.id = "apply-inbox-date-filters";
        applyButton.title = "Aplicar o período e a ordenação selecionados";
        applyButton.setAttribute("aria-label", "Aplicar filtro de datas");
        applyButton.dataset.inboxFilterClickable = "true";
        applyButton.innerHTML = applyIcon + " Aplicar filtro";
        clearButton.before(applyButton);

        applyButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          applyDateFilter();
        });

        ["inbox-date-start", "inbox-date-end"].forEach((id) => {
          document.getElementById(id)?.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            applyButton.click();
          });
        });
      }

      const observer = new MutationObserver(ensureApplyButton);
      observer.observe(document.body, { childList: true, subtree: true });
      ensureApplyButton();
    })();
  </script>`;

  return html.replace("</head>", `${styles}</head>`).replace("</body>", `${script}</body>`);
}
