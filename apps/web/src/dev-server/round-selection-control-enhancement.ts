const ROUND_SELECTION_MARKER = 'data-round-selection-control="enhanced"';
const ROUND_SELECTION_CLASS = "system-round-selector";

export function enhanceRoundSelectionControls(html: string): string {
  if (html.includes(ROUND_SELECTION_MARKER) || !supportsRoundSelection(html)) return html;

  const styles = `<style ${ROUND_SELECTION_MARKER}>${roundSelectionControlStyles()}</style>`;
  const script = roundSelectionControlScript();

  return html.replace("</head>", `${styles}</head>`).replace("</body>", `${script}</body>`);
}

export function roundSelectionControlStyles(): string {
  return `
    .${ROUND_SELECTION_CLASS} {
      -webkit-appearance: none !important;
      appearance: none !important;
      background-color: transparent;
      background-image: radial-gradient(
        circle at center,
        var(--surface) 0 6px,
        #64748b 6px 8px,
        transparent 8px
      );
      border: 0;
      border-radius: 50%;
      box-shadow: none;
      cursor: pointer;
      flex: 0 0 24px !important;
      height: 24px !important;
      margin: 0;
      min-height: 24px !important;
      padding: 0;
      width: 24px !important;
    }
    .${ROUND_SELECTION_CLASS}:checked {
      background-image: radial-gradient(
        circle at center,
        var(--primary) 0 5px,
        var(--surface) 5px 7px,
        var(--primary) 7px 8px,
        transparent 8px
      );
    }
    .${ROUND_SELECTION_CLASS}:focus-visible {
      outline: 2px solid var(--cyan);
      outline-offset: 1px;
    }
    .${ROUND_SELECTION_CLASS}:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
    .statement-body:has(> .col-select .${ROUND_SELECTION_CLASS}:checked) {
      background: var(--primary-soft);
      box-shadow: inset 3px 0 0 var(--primary);
    }
    .statement-body > .col-select:has(.${ROUND_SELECTION_CLASS}) {
      align-items: center;
      display: flex;
      height: 100%;
      inset-inline-start: 2px;
      justify-content: center;
      top: 0;
      width: 28px;
    }
    .statement-body > .col-date {
      padding-inline-start: 20px;
    }
    @media (max-width: 760px) {
      .statement-row.statement-body > .col-select:has(.${ROUND_SELECTION_CLASS}) {
        flex: 0 0 24px;
        height: 24px;
        width: 24px;
      }
      .statement-row.statement-body > .col-date {
        padding-inline-start: 0;
      }
    }
    @media (forced-colors: active) {
      .${ROUND_SELECTION_CLASS} {
        background: Canvas;
        border: 2px solid ButtonText;
      }
      .${ROUND_SELECTION_CLASS}:checked {
        background: Highlight;
        box-shadow: inset 0 0 0 4px Canvas;
      }
    }
  `;
}

function supportsRoundSelection(html: string): boolean {
  return (
    html.includes("data-select-suggestion") ||
    html.includes("data-select-transaction") ||
    html.includes("<title>Inbox - SolverFin</title>") ||
    html.includes("<h1>Extrato Bancário</h1>")
  );
}

function roundSelectionControlScript(): string {
  return `
    <script data-round-selection-control-script="enhanced">
      (() => {
        const selector = 'input[type="checkbox"][data-select-suggestion], input[type="checkbox"][data-select-transaction]';
        const className = ${JSON.stringify(ROUND_SELECTION_CLASS)};

        function enhance(root) {
          if (root instanceof Element && root.matches(selector)) root.classList.add(className);
          root.querySelectorAll?.(selector).forEach((control) => control.classList.add(className));
        }

        const observer = new MutationObserver((records) => {
          records.forEach((record) => record.addedNodes.forEach((node) => {
            if (node instanceof Element) enhance(node);
          }));
        });

        enhance(document);
        observer.observe(document.body, { childList: true, subtree: true });
      })();
    </script>
  `;
}
