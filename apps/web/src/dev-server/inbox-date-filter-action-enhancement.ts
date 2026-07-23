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
      display: inline-flex;
      gap: 5px;
      justify-content: center;
      min-height: 34px;
      white-space: nowrap;
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

      function ensureApplyButton() {
        if (document.getElementById("apply-inbox-date-filters")) return;
        const clearButton = document.getElementById("clear-inbox-date-filters");
        if (!clearButton) return;

        const applyButton = document.createElement("button");
        applyButton.type = "button";
        applyButton.id = "apply-inbox-date-filters";
        applyButton.title = "Aplicar o período e a ordenação selecionados";
        applyButton.setAttribute("aria-label", "Aplicar filtro de datas");
        applyButton.innerHTML = applyIcon + " Aplicar filtro";
        clearButton.before(applyButton);

        applyButton.addEventListener("click", () => {
          const trigger =
            document.getElementById("inbox-date-start") ||
            document.getElementById("inbox-date-end") ||
            document.getElementById("inbox-date-sort");
          trigger?.dispatchEvent(new Event("change", { bubbles: true }));
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
