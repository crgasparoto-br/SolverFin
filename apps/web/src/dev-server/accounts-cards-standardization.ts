export function standardizeAccountsCardsPage(html: string): string {
  if (!html.includes('data-tab-panel="accounts"')) return html;

  let standardized = html
    .replace(/\s*<p class="eyebrow">Cadastros financeiros<\/p>/, "")
    .replace(/\s*<p class="muted">Mantenha contas, dinheiro, investimentos e cartões em um único cadastro mestre\.<\/p>/, "")
    .replace("<h1>Contas e Cartões</h1>", "<h1>Contas e cartões</h1>")
    .replace(/\s*<button id="connections-tab"[\s\S]*?<\/button>/, "")
    .replace(/\s*<section id="connections-panel"[\s\S]*?<\/section>/, "")
    .replace("Contas bancárias <span>", "Contas <span>")
    .replace("Cartões de crédito <span>", "Cartões <span>")
    .replace(
      /<div class="master-actions" aria-label="Ações principais">[\s\S]*?<\/div>/,
      `<div class="master-actions" aria-label="Ação principal">
          <button type="button" data-context-action data-open-dialog="new-account-dialog" aria-label="Adicionar conta" title="Adicionar conta">Adicionar conta</button>
        </div>`,
    );

  if (!standardized.includes("data-accounts-cards-standardization-styles")) {
    standardized = standardized.replace("</head>", `${standardizationStyles()}</head>`);
  }

  if (!standardized.includes("data-accounts-cards-standardization-script")) {
    standardized = standardized.replace("</body>", `${standardizationScript()}</body>`);
  }

  return standardized;
}

function standardizationStyles(): string {
  return `
    <style data-accounts-cards-standardization-styles>
      .master-heading { align-items: center; }
      .master-heading > div:first-child { gap: 0; }
      .master-actions [data-context-action] { min-height: 40px; }
      .master-panel .section-heading p { display: none; }
      .master-item { border-radius: 8px; padding: 10px 8px; transition: background 120ms ease-out; }
      .master-item:hover { background: #f8fafc; }
      .master-item:focus-within { box-shadow: 0 0 0 2px rgba(15, 61, 76, .18); }
      .icon-button, .cdi-action-button { min-height: 40px !important; min-width: 40px !important; }
      .item-actions { align-items: center; }
      .item-actions .danger-icon-button:first-of-type { margin-left: 6px; }
      .instrument-disclosure { margin-top: 8px; }
      .instrument-disclosure > summary { align-items: center; color: var(--primary); cursor: pointer; display: inline-flex; font-size: .8125rem; font-weight: 700; gap: 6px; min-height: 40px; padding: 0 4px; }
      .instrument-disclosure > summary:focus-visible { border-radius: 6px; outline: 2px solid var(--primary); outline-offset: 2px; }
      .instrument-disclosure[open] > summary { margin-bottom: 6px; }
      .master-dialog { max-height: min(90vh, 760px); overflow: auto; }
      .master-dialog .dialog-close-form { display: none; }
      .dialog-standard-close { align-items: center; background: transparent; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); display: inline-flex; height: 40px; justify-content: center; padding: 0; position: absolute; right: 16px; top: 16px; width: 40px; }
      .dialog-standard-actions { align-items: center; display: flex; gap: 8px; grid-column: 1 / -1; justify-content: flex-end; margin-top: 6px; }
      .dialog-standard-actions button { width: auto; }
      .confirm-dialog { max-width: 520px; }
      .confirm-dialog p { line-height: 1.5; }
      .confirm-dialog .dialog-standard-actions { margin-top: 18px; }
      @media (max-width: 760px) {
        main { padding-inline: 16px; }
        .master-heading { align-items: stretch; }
        .master-actions [data-context-action] { width: 100%; }
        .master-item { padding: 12px 8px; }
        .dialog-standard-actions { flex-direction: column-reverse; }
        .dialog-standard-actions button { width: 100%; }
      }
    </style>`;
}

function standardizationScript(): string {
  return `
    <script data-accounts-cards-standardization-script>
      (() => {
        if (window.__solverFinAccountsCardsStandardized) return;
        window.__solverFinAccountsCardsStandardized = true;

        let lastDialogTrigger = null;
        const contextAction = document.querySelector('[data-context-action]');
        const searchInput = document.querySelector('[data-master-search]');

        function activeTab() {
          return document.querySelector('[data-tab][aria-selected="true"]')?.dataset.tab || 'accounts';
        }

        function syncContext() {
          const cards = activeTab() === 'cards';
          if (contextAction) {
            contextAction.textContent = cards ? 'Adicionar cartão' : 'Adicionar conta';
            contextAction.dataset.openDialog = cards ? 'new-card-dialog' : 'new-account-dialog';
            contextAction.setAttribute('aria-label', cards ? 'Adicionar cartão' : 'Adicionar conta');
            contextAction.title = cards ? 'Adicionar cartão' : 'Adicionar conta';
          }
          if (searchInput) {
            searchInput.placeholder = cards
              ? 'Buscar por nome, instituição, bandeira ou final'
              : 'Buscar por nome, instituição ou conta';
          }
        }

        function wireTabs() {
          document.querySelectorAll('[data-tab]').forEach((tab) => {
            tab.addEventListener('click', () => window.setTimeout(syncContext, 0));
            tab.addEventListener('keydown', () => window.setTimeout(syncContext, 0));
          });
          syncContext();
        }

        function collapseInstrumentLists() {
          document.querySelectorAll('.card-account-item').forEach((card) => {
            const list = card.querySelector('.instrument-list');
            if (!list || list.closest('.instrument-disclosure')) return;
            const count = list.querySelectorAll('[data-card-instrument]').length;
            const details = document.createElement('details');
            details.className = 'instrument-disclosure';
            const summary = document.createElement('summary');
            summary.textContent = 'Ver instrumentos (' + count + ')';
            details.append(summary);
            list.replaceWith(details);
            details.append(list);
            const warning = card.querySelector('.instrument-warning');
            if (warning) details.append(warning);
          });
        }

        function closeDialog(dialog) {
          if (!dialog) return;
          if (typeof dialog.close === 'function') dialog.close();
          else dialog.removeAttribute('open');
        }

        function standardizeDialogs() {
          document.querySelectorAll('dialog.master-dialog').forEach((dialog) => {
            if (dialog.dataset.standardized === 'true') return;
            dialog.dataset.standardized = 'true';
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'dialog-standard-close';
            close.setAttribute('aria-label', 'Fechar');
            close.title = 'Fechar';
            close.textContent = '×';
            close.addEventListener('click', () => closeDialog(dialog));
            dialog.prepend(close);
            dialog.addEventListener('close', () => {
              if (lastDialogTrigger && typeof lastDialogTrigger.focus === 'function') lastDialogTrigger.focus();
            });

            const form = dialog.querySelector('form[data-api-form]');
            const submit = form?.querySelector('button[type="submit"]');
            if (form && submit && !form.querySelector('.dialog-standard-actions')) {
              const actions = document.createElement('div');
              actions.className = 'dialog-standard-actions';
              const cancel = document.createElement('button');
              cancel.type = 'button';
              cancel.className = 'secondary-button';
              cancel.textContent = 'Cancelar';
              cancel.addEventListener('click', () => closeDialog(dialog));
              submit.replaceWith(actions);
              actions.append(cancel, submit);
            }
          });

          document.addEventListener('click', (event) => {
            const trigger = event.target.closest('[data-open-dialog]');
            if (trigger) lastDialogTrigger = trigger;
          }, true);
        }

        function createConfirmDialog() {
          const dialog = document.createElement('dialog');
          dialog.className = 'master-dialog confirm-dialog';
          dialog.setAttribute('aria-labelledby', 'accounts-cards-confirm-title');
          dialog.innerHTML =
            '<div class="dialog-heading"><h2 id="accounts-cards-confirm-title">Confirmar ação</h2></div>' +
            '<p data-confirm-message></p>' +
            '<p class="form-status muted" data-confirm-status aria-live="polite"></p>' +
            '<div class="dialog-standard-actions"><button type="button" class="secondary-button" data-confirm-cancel>Cancelar</button><button type="button" data-confirm-submit>Confirmar</button></div>';
          document.body.append(dialog);
          return dialog;
        }

        function wireConfirmations() {
          const dialog = createConfirmDialog();
          const message = dialog.querySelector('[data-confirm-message]');
          const status = dialog.querySelector('[data-confirm-status]');
          const submit = dialog.querySelector('[data-confirm-submit]');
          let pendingForm = null;
          let pendingTrigger = null;

          dialog.querySelector('[data-confirm-cancel]').addEventListener('click', () => closeDialog(dialog));
          dialog.addEventListener('close', () => {
            pendingForm = null;
            status.textContent = '';
            if (pendingTrigger) pendingTrigger.focus();
          });

          document.querySelectorAll('form[data-confirm]').forEach((form) => {
            form.addEventListener('submit', (event) => {
              if (form.dataset.confirmApproved === 'true') {
                delete form.dataset.confirmApproved;
                return;
              }
              event.preventDefault();
              event.stopImmediatePropagation();
              pendingForm = form;
              pendingTrigger = event.submitter || form.querySelector('button[type="submit"]');
              const destructive = (form.dataset.apiMethod || 'POST').toUpperCase() === 'DELETE';
              message.textContent = form.dataset.confirm || 'Confirme esta ação.';
              submit.textContent = destructive ? 'Excluir' : 'Arquivar';
              status.textContent = '';
              if (typeof dialog.showModal === 'function') dialog.showModal();
              else dialog.setAttribute('open', '');
              submit.focus();
            }, true);
          });

          submit.addEventListener('click', () => {
            if (!pendingForm) return;
            pendingForm.dataset.confirmApproved = 'true';
            closeDialog(dialog);
            pendingForm.requestSubmit();
          });
        }

        wireTabs();
        collapseInstrumentLists();
        standardizeDialogs();
        wireConfirmations();
      })();
    </script>`;
}
