import { icon } from "./icons.js";

const TABLE_LAYOUT_MARKER = 'data-inbox-table-layout="enhanced"';

export function enhanceInboxTableLayout(html: string): string {
  if (html.includes(TABLE_LAYOUT_MARKER)) {
    return html;
  }

  const styles = `<style ${TABLE_LAYOUT_MARKER}>${inboxTableLayoutStyles()}</style>`;
  const script = inboxTableLayoutScript();

  return html.replace("</head>", `${styles}</head>`).replace("</body>", `${script}</body>`);
}

function inboxTableLayoutScript(): string {
  const actionIcons = {
    approve: icon("check", 15),
    edit: icon("pencil", 15),
    reject: icon("x-circle", 15),
    statement: icon("receipt", 15),
  };

  return `
    <script data-inbox-table-layout-script="enhanced">
      (() => {
        const actionIcons = ${JSON.stringify(actionIcons)};
        const columns = [
          ["selection", "Sel."],
          ["status", "Status"],
          ["line", "Linha"],
          ["date", "Data"],
          ["type", "Tipo"],
          ["description", "Descrição"],
          ["amount", "Valor"],
          ["account", "Conta"],
          ["observations", "Observações"],
          ["actions", "Ações"],
        ];
        const summaryCellClasses = new Map([
          ["Data", "date"],
          ["Tipo", "type"],
          ["Descrição", "description"],
          ["Valor", "amount"],
          ["Conta de referência", "account"],
          ["Outra conta", "other-account"],
        ]);

        function createHeader() {
          const header = document.createElement("div");
          header.className = "import-table-header";
          header.dataset.inboxTableHeader = "enhanced";
          header.setAttribute("role", "row");
          header.innerHTML = columns
            .map(([key, label]) => '<span class="import-table-header-' + key + '" role="columnheader">' + label + "</span>")
            .join("");
          return header;
        }

        function createCell(className, role = "cell") {
          const cell = document.createElement("div");
          cell.className = className;
          cell.setAttribute("role", role);
          return cell;
        }

        function makeIconOnly(control, label, svg) {
          if (!control || control.dataset.compactRowAction === "enhanced") return;
          control.dataset.compactRowAction = "enhanced";
          control.classList.add("compact-row-action");
          control.setAttribute("aria-label", label);
          control.setAttribute("title", label);
          control.innerHTML = svg;
        }

        function enhanceSummaryCells(row, editor) {
          const cells = Array.from(editor.querySelectorAll(":scope > .row-summary > div"));
          let accountValue;
          let otherAccountValue;
          let otherAccountContainer;

          for (const container of cells) {
            const term = container.querySelector("dt");
            const value = container.querySelector("dd");
            if (!term || !value) continue;

            const label = term.textContent?.trim() || "";
            const key = summaryCellClasses.get(label);
            if (!key) continue;

            container.classList.add("import-table-summary-cell", "import-table-summary-" + key);
            value.classList.add("import-table-cell", "import-table-cell-" + key);
            value.setAttribute("role", "cell");
            value.dataset.columnLabel = label;

            if (key === "account") accountValue = value;
            if (key === "other-account") {
              otherAccountValue = value;
              otherAccountContainer = container;
            }
          }

          if (accountValue && otherAccountValue && otherAccountContainer) {
            const secondary = document.createElement("span");
            secondary.className = "import-table-account-secondary";
            secondary.textContent =
              "Outra conta: " +
              (otherAccountValue.dataset.fullValue || otherAccountValue.textContent?.trim() || "—");
            accountValue.append(secondary);
            otherAccountContainer.hidden = true;
          }
        }

        function enhanceRow(row) {
          if (row.dataset.inboxTableRow === "enhanced") return;
          row.dataset.inboxTableRow = "enhanced";
          row.setAttribute("role", "row");

          const checkbox = row.querySelector(":scope > input[data-select-suggestion]");
          if (checkbox) {
            const selectCell = createCell("import-table-select-cell");
            row.insertBefore(selectCell, checkbox);
            selectCell.append(checkbox);
          }

          const editor = row.querySelector(":scope > .row-editor");
          if (!editor) return;
          editor.classList.add("import-table-row-content");

          const heading = editor.querySelector(":scope > .row-heading");
          const line = heading?.querySelector("strong");
          const status = heading?.querySelector(".status-pill");
          if (line) {
            const fullLineLabel = line.textContent?.trim() || "Linha —";
            line.classList.add("import-table-line");
            line.setAttribute("role", "cell");
            line.setAttribute("aria-label", fullLineLabel);
            line.textContent = fullLineLabel.replace(/^Linha\\s+/i, "");
          }
          status?.classList.add("import-table-status");
          status?.setAttribute("role", "cell");

          enhanceSummaryCells(row, editor);

          const observations = createCell("import-table-observations");
          const legacyNotice = editor.querySelector(":scope > .warning");
          const candidateList = row.querySelector(":scope > .candidate-list");
          if (legacyNotice) observations.append(legacyNotice);
          if (candidateList) observations.append(candidateList);
          row.append(observations);

          const actionCluster = createCell("row-action-cluster");
          const lineActions = editor.querySelector(":scope > .inline-actions");
          const statementLink = editor.querySelector(":scope > .button-link");
          if (lineActions) actionCluster.append(lineActions);
          if (statementLink) actionCluster.append(statementLink);
          editor.append(actionCluster);

          makeIconOnly(
            actionCluster.querySelector('[data-line-action="edit"]'),
            "Corrigir linha",
            actionIcons.edit,
          );
          makeIconOnly(
            actionCluster.querySelector('[data-line-action="approve"]'),
            "Confirmar linha",
            actionIcons.approve,
          );
          makeIconOnly(
            actionCluster.querySelector('[data-line-action="reject"]'),
            "Rejeitar linha",
            actionIcons.reject,
          );
          makeIconOnly(statementLink, "Ver no Extrato", actionIcons.statement);
        }

        function enhanceTable() {
          document.querySelectorAll(".inbox-page .import-rows").forEach((table) => {
            const rows = Array.from(table.querySelectorAll(":scope > .import-row"));
            const currentHeader = table.querySelector(":scope > .import-table-header");

            if (!rows.length) {
              currentHeader?.remove();
              table.removeAttribute("role");
              table.removeAttribute("aria-label");
              return;
            }

            table.setAttribute("role", "table");
            table.setAttribute("aria-label", "Linhas importadas para revisão");
            if (!currentHeader) table.prepend(createHeader());
            rows.forEach(enhanceRow);
          });
        }

        const detail = document.getElementById("import-batch-detail");
        const observer = new MutationObserver(enhanceTable);
        observer.observe(detail || document.body, { childList: true, subtree: true });
        enhanceTable();
      })();
    </script>
  `;
}

function inboxTableLayoutStyles(): string {
  return `
    .inbox-page .import-rows {
      --inbox-table-columns: 34px 76px 44px 74px 76px minmax(140px, 1.55fr) 88px minmax(112px, 1fr) minmax(132px, 1.15fr) 128px;
    }
    .inbox-page .import-table-header {
      display: none;
    }
    .inbox-page .import-table-observations:empty,
    .inbox-page .row-action-cluster:empty {
      min-height: 1px;
    }
    .inbox-page .row-action-cluster {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      justify-content: flex-end;
    }
    .inbox-page .row-action-cluster > .inline-actions {
      display: contents;
    }
    .inbox-page .compact-row-action {
      align-items: center;
      display: inline-flex;
      justify-content: center;
    }
    .inbox-page .import-table-account-secondary {
      color: var(--muted);
      display: block;
      font-size: 0.6875rem;
      line-height: 1.25;
      margin-top: 2px;
    }

    @media (min-width: 1024px) {
      .inbox-page .import-rows {
        border: 1px solid var(--line);
        border-bottom: 0;
        overflow-x: auto;
        scrollbar-width: thin;
      }
      .inbox-page .import-table-header,
      .inbox-page .import-row {
        display: grid !important;
        grid-template-columns: var(--inbox-table-columns) !important;
        min-width: 850px;
      }
      .inbox-page .import-table-header {
        background: var(--surface-soft);
        border-bottom: 1px solid var(--line);
        color: var(--text);
        font-size: 0.6875rem;
        font-weight: 800;
        letter-spacing: 0.01em;
        line-height: 1.2;
        position: sticky;
        text-align: left;
        top: 0;
        z-index: 3;
      }
      .inbox-page .import-table-header > span {
        align-items: center;
        border-right: 1px solid var(--line);
        display: flex;
        min-height: 27px;
        padding: 4px 5px;
      }
      .inbox-page .import-table-header > span:last-child {
        border-right: 0;
        justify-content: center;
      }
      .inbox-page .import-table-header-amount {
        justify-content: flex-end;
        text-align: right;
      }
      .inbox-page .import-row {
        align-items: stretch;
        border-bottom: 1px solid var(--line) !important;
        gap: 0 !important;
        min-height: 36px;
        padding: 0 !important;
      }
      .inbox-page .import-row:hover {
        background: var(--surface-soft);
      }
      .inbox-page .import-row:has(.import-table-select-cell input:checked) {
        background: var(--primary-soft);
        box-shadow: inset 3px 0 0 var(--primary);
      }
      .inbox-page .import-table-select-cell,
      .inbox-page .import-table-status,
      .inbox-page .import-table-line,
      .inbox-page .import-table-cell,
      .inbox-page .import-table-observations,
      .inbox-page .row-action-cluster {
        grid-row: 1;
        border-right: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
        min-width: 0;
        padding: 4px 5px;
      }
      .inbox-page .import-table-select-cell {
        align-items: center;
        display: flex;
        grid-column: 1;
        justify-content: center;
      }
      .inbox-page .import-table-select-cell input[type="checkbox"] {
        accent-color: var(--primary);
        flex: 0 0 24px;
        height: 24px;
        margin: 0;
        min-height: 24px;
        padding: 0;
        width: 24px;
      }
      .inbox-page .import-table-row-content,
      .inbox-page .row-heading,
      .inbox-page .row-summary,
      .inbox-page .row-summary > div {
        display: contents !important;
      }
      .inbox-page .row-summary dt {
        display: none !important;
      }
      .inbox-page .import-table-summary-other-account[hidden] {
        display: none !important;
      }
      .inbox-page .import-table-status {
        align-items: center;
        align-self: stretch;
        border-radius: 0;
        display: flex;
        font-size: 0.6875rem !important;
        grid-column: 2;
        justify-content: flex-start;
        line-height: 1.2;
        max-width: none;
        overflow: visible;
        white-space: normal;
      }
      .inbox-page .import-table-line {
        align-items: center;
        display: flex;
        font-size: 0.6875rem !important;
        font-weight: 700;
        grid-column: 3;
        line-height: 1.2;
      }
      .inbox-page .import-table-cell {
        align-items: center;
        display: flex;
        font-size: 0.6875rem !important;
        line-height: 1.25;
        margin: 0 !important;
        overflow: visible !important;
        white-space: normal !important;
      }
      .inbox-page .import-table-cell-date {
        grid-column: 4;
      }
      .inbox-page .import-table-cell-type {
        grid-column: 5;
      }
      .inbox-page .import-table-cell-description {
        grid-column: 6;
      }
      .inbox-page .import-table-cell-amount {
        font-variant-numeric: tabular-nums;
        grid-column: 7;
        justify-content: flex-end;
        text-align: right;
      }
      .inbox-page .import-table-cell-account {
        align-items: flex-start;
        flex-direction: column;
        grid-column: 8;
        justify-content: center;
      }
      .inbox-page .import-table-observations {
        align-items: stretch;
        display: flex;
        flex-direction: column;
        grid-column: 9;
        justify-content: center;
      }
      .inbox-page .import-table-observations > .warning {
        font-size: 0.6875rem;
        line-height: 1.3;
        margin: 0;
      }
      .inbox-page .import-table-observations .candidate-list {
        display: grid;
        gap: 3px;
        margin: 0;
      }
      .inbox-page .import-table-observations .candidate-card {
        align-items: start;
        background: transparent;
        border: 0;
        border-left: 2px solid var(--cyan);
        border-radius: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 4px;
        padding: 2px 0 2px 6px;
      }
      .inbox-page .import-table-observations .candidate-card strong,
      .inbox-page .import-table-observations .candidate-card p {
        font-size: 0.6875rem;
        line-height: 1.3;
      }
      .inbox-page .import-table-observations .candidate-card p {
        margin: 1px 0 0;
      }
      .inbox-page .import-table-observations .candidate-card .inline-actions {
        justify-content: flex-start;
      }
      .inbox-page .import-table-observations .candidate-card button {
        min-height: 28px;
        padding: 3px 7px;
        width: auto;
      }
      .inbox-page .row-action-cluster {
        align-content: center;
        align-self: stretch;
        border-right: 0;
        flex-wrap: wrap;
        grid-column: 10;
        justify-content: center;
      }
      .inbox-page .row-action-cluster .compact-row-action {
        flex: 0 0 34px !important;
        height: 34px !important;
        min-height: 34px !important;
        min-width: 34px !important;
        padding: 0 !important;
        width: 34px !important;
      }
      .inbox-page .row-action-cluster .button-link.compact-row-action {
        border: 1px solid var(--line);
      }
      .inbox-page .import-row[data-row-state="pending_invalid"] {
        box-shadow: inset 3px 0 0 var(--warning);
      }
      .inbox-page .import-row[data-row-state="candidate_pending"] {
        box-shadow: inset 3px 0 0 var(--cyan);
      }
    }

    @media (max-width: 1023px) {
      .inbox-page .import-table-observations {
        grid-column: 2;
        margin-top: 4px;
      }
      .inbox-page .row-action-cluster {
        grid-column: 1 / -1;
      }
      .inbox-page .row-action-cluster .compact-row-action {
        min-height: 34px;
        min-width: 34px;
        padding: 0;
        width: 34px;
      }
    }

    @media (max-width: 520px) {
      .inbox-page .import-row {
        gap: 6px !important;
        grid-template-columns: 24px minmax(0, 1fr) !important;
        padding: 7px 0 !important;
      }
      .inbox-page .import-table-select-cell {
        align-items: flex-start;
        display: flex;
        grid-column: 1;
        justify-content: center;
        padding-top: 2px;
      }
      .inbox-page .import-table-select-cell input[type="checkbox"] {
        flex: 0 0 24px;
        height: 24px;
        margin: 0;
        min-height: 24px;
        padding: 0;
        width: 24px;
      }
      .inbox-page .import-table-row-content {
        display: grid !important;
        gap: 6px;
        grid-column: 2;
        grid-template-columns: minmax(0, 1fr) !important;
      }
      .inbox-page .row-heading,
      .inbox-page .row-summary,
      .inbox-page .row-action-cluster {
        grid-column: 1;
      }
      .inbox-page .row-summary {
        display: grid !important;
        gap: 6px 8px;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }
      .inbox-page .row-summary > div {
        display: block !important;
        min-width: 0;
      }
      .inbox-page .row-summary div:nth-child(4),
      .inbox-page .row-summary div:nth-child(n + 5) {
        grid-column: 1 / -1;
      }
      .inbox-page .row-summary dd {
        overflow-wrap: anywhere;
        white-space: normal !important;
      }
      .inbox-page .import-table-observations {
        grid-column: 2;
        margin-top: 0;
        min-width: 0;
      }
      .inbox-page .import-table-account-secondary {
        display: none;
      }
      .inbox-page .row-action-cluster {
        justify-content: flex-start;
        margin-top: 4px;
      }
      .inbox-page .import-table-observations .candidate-card {
        align-items: stretch;
        grid-template-columns: minmax(0, 1fr) !important;
      }
      .inbox-page .import-table-observations .candidate-card .inline-actions {
        flex-wrap: wrap;
        justify-content: flex-start;
      }
    }
  `;
}
