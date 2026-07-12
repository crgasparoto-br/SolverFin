const LEGACY_CONTROLLER_PATTERN = /\s*<script data-invoice-month-navigation-controller>[\s\S]*?<\/script>/g;

export function restoreCardInvoiceNavigation(html: string): string {
  let nextHtml = html.replace(LEGACY_CONTROLLER_PATTERN, "");
  nextHtml = injectNavigationStyles(nextHtml);
  return injectNavigationController(nextHtml);
}

function injectNavigationStyles(html: string): string {
  if (html.includes("data-card-invoice-navigation-fix-styles")) return html;

  const styles = `
    <style data-card-invoice-navigation-fix-styles>
      .card-filter .month-nav {
        background: var(--surface);
        border: 1px solid var(--line);
      }
      .card-filter .month-nav input[data-invoice-month-input] {
        appearance: auto;
        background: var(--surface) !important;
        border: 1px solid transparent !important;
        color: var(--text);
        cursor: pointer;
        font: inherit;
        min-height: 34px;
        padding: 4px 8px;
        text-align: center;
      }
      .card-filter .month-nav input[data-invoice-month-input]:hover {
        background: #f8fafc !important;
        border-color: #e2e8f0 !important;
      }
      .card-filter .month-nav input[data-invoice-month-input]:focus-visible {
        border-color: #94a3b8 !important;
        outline: 2px solid #cbd5e1;
        outline-offset: 1px;
      }
      .card-filter .month-nav input[data-invoice-month-input]::-webkit-calendar-picker-indicator {
        cursor: pointer;
        opacity: 1;
      }
      .card-filter button[data-invoice-step],
      .card-filter button[data-invoice-current] {
        pointer-events: auto;
      }
    </style>`;

  return html.includes("</head>")
    ? html.replace("</head>", `${styles}</head>`)
    : `${styles}${html}`;
}

function injectNavigationController(html: string): string {
  if (html.includes("data-card-invoice-navigation-fix-controller")) return html;

  const script = `
    <script data-card-invoice-navigation-fix-controller>
      (() => {
        const form = document.querySelector('form.filter-form[action="/cartoes"]');
        if (!form) return;

        const monthInput = form.querySelector('[data-invoice-month-input]');
        const invoiceInput = form.querySelector('[data-invoice-input]');
        if (!(monthInput instanceof HTMLInputElement)) return;

        function localCurrentMonth() {
          const now = new Date();
          return String(now.getFullYear()) + '-' + String(now.getMonth() + 1).padStart(2, '0');
        }

        function normalizedMonth(value) {
          return /^\\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : localCurrentMonth();
        }

        function shiftMonth(value, delta) {
          const month = normalizedMonth(value);
          const year = Number(month.slice(0, 4));
          const monthIndex = Number(month.slice(5, 7)) - 1 + delta;
          const shifted = new Date(year, monthIndex, 1);
          return String(shifted.getFullYear()) + '-' + String(shifted.getMonth() + 1).padStart(2, '0');
        }

        function submitMonth(month) {
          monthInput.value = month;
          if (invoiceInput instanceof HTMLInputElement) invoiceInput.value = '';
          form.requestSubmit();
        }

        form.querySelectorAll('[data-invoice-step]').forEach((button) => {
          button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            submitMonth(shiftMonth(monthInput.value, Number(button.dataset.invoiceStep || 0)));
          });
        });

        const currentButton = form.querySelector('[data-invoice-current]');
        currentButton?.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          submitMonth(localCurrentMonth());
        });

        monthInput.addEventListener('change', () => {
          submitMonth(normalizedMonth(monthInput.value));
        });

        form.addEventListener('change', (event) => {
          const target = event.target;
          if (target instanceof HTMLInputElement && target.name === 'cardId') {
            if (invoiceInput instanceof HTMLInputElement) invoiceInput.value = '';
          }
        });
      })();
    </script>`;

  return html.includes("</body>")
    ? html.replace("</body>", `${script}</body>`)
    : `${html}${script}`;
}
