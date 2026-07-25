import { icon } from "./icons.js";

const statusFilterHtml = `<label class="status-filter">Status
            <select data-master-status>
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </label>`;

export function standardizeAccountsCardsPage(html: string): string {
  if (!html.includes('data-tab-panel="accounts"')) return html;

  let standardized = html
    .replace(/\s*<p class="eyebrow">Cadastros financeiros<\/p>/, "")
    .replace(
      /\s*<p class="muted">Mantenha contas, dinheiro, investimentos e cartões em um único cadastro mestre\.<\/p>/,
      "",
    )
    .replace("<h1>Contas e Cartões</h1>", "<h1>Contas e cartões</h1>")
    .replace(/\s*<button id="connections-tab"[\s\S]*?<\/button>/, "")
    .replace(/\s*<section id="connections-panel"[\s\S]*?<\/section>/, "")
    .replace(/\s*<label class="active-filter-switch"[\s\S]*?<\/label>/, "")
    .replace("Contas bancárias <span>", "Contas <span>")
    .replace("Cartões de crédito <span>", "Cartões <span>")
    .replace('class="master-toolbar"', 'class="master-toolbar accounts-cards-toolbar"')
    .replace(
      /<div class="master-actions" aria-label="Ações principais">[\s\S]*?<\/div>/,
      `<div class="master-actions" aria-label="Ação principal">
          <button type="button" data-context-action data-open-dialog="new-account-dialog" aria-label="Adicionar conta" title="Adicionar conta">${icon("plus", 14)}<span data-context-action-label>Adicionar conta</span></button>
        </div>`,
    )
    .replace(
      "if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) return;",
      "if (form.dataset.confirm) return;",
    );

  standardized = ensureStatusFilter(standardized);

  if (!standardized.includes("data-accounts-cards-standardization-styles")) {
    standardized = standardized.replace("</head>", `${standardizationStyles()}</head>`);
  }

  if (!standardized.includes("data-accounts-cards-standardization-script")) {
    standardized = standardized.replace("</body>", `${standardizationScript()}</body>`);
  }

  return standardized;
}

function ensureStatusFilter(html: string): string {
  if (html.includes("<select data-master-status>")) return html;

  return html.replace(
    /(<div class="filter-row">[\s\S]*?)(\s*<\/div>)/,
    `$1\n          ${statusFilterHtml}$2`,
  );
}

function standardizationStyles(): string {
  return `
    <style data-accounts-cards-standardization-styles>
      .master-heading { align-items: center; margin-bottom: 2px; }
      .master-heading > div:first-child { gap: 0; }
      .master-heading h1 { letter-spacing: -.02em; }
      .master-actions [data-context-action] { align-items: center; display: inline-flex; gap: 7px; min-height: 42px; padding-inline: 16px; }
      .accounts-cards-toolbar { align-items: end; gap: 16px; grid-template-columns: minmax(280px, .72fr) minmax(420px, 1.28fr); padding: 12px 14px; }
      .accounts-cards-toolbar .tab-list { align-self: end; min-height: 44px; }
      .accounts-cards-toolbar .tab-button { min-height: 36px; }
      .accounts-cards-toolbar .filter-row { align-items: end; grid-template-columns: minmax(0, 1fr) 150px; }
      .accounts-cards-toolbar label { gap: 6px; }
      .accounts-cards-toolbar input, .accounts-cards-toolbar select { min-height: 42px; }
      .master-panel { gap: 0; overflow: hidden; padding: 0; }
      .master-panel .section-heading { border-bottom: 1px solid var(--line); padding: 14px 16px; }
      .master-panel .section-heading p { display: none; }
      .master-list { gap: 0; }
      .master-item { border-radius: 0; border-top: 1px solid var(--line); gap: 12px; grid-template-columns: 40px minmax(0, 1fr) auto; padding: 14px 16px; transition: background 120ms ease-out; }
      .master-item:first-child { border-top: 0; padding-top: 14px; }
      .master-item:hover { background: #f8fafc; }
      .master-item:focus-within { box-shadow: inset 3px 0 0 var(--primary); }
      .identity-mark { height: 40px; width: 40px; }
      .item-main { gap: 4px; }
      .item-main > p { max-width: 76ch; }
      .item-footer { align-items: center; display: flex; gap: 14px; justify-content: flex-end; min-width: 0; }
      .item-footer .amount-stack { min-width: 110px; }
      .icon-button, .cdi-action-button { min-height: 40px !important; min-width: 40px !important; }
      .item-actions { align-items: center; }
      .item-actions .danger-icon-button:first-of-type { margin-left: 6px; }
      .instrument-disclosure { margin-top: 8px; }
      .instrument-disclosure > summary { align-items: center; border-radius: 6px; color: var(--primary); cursor: pointer; display: inline-flex; font-size: .8125rem; font-weight: 700; gap: 6px; min-height: 40px; padding: 0 6px; }
      .instrument-disclosure > summary:hover { background: var(--primary-soft); }
      .instrument-disclosure > summary:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
      .instrument-disclosure[open] > summary { margin-bottom: 6px; }
      .master-dialog { max-height: min(90vh, 760px); overflow: auto; }
      .dialog-standard-close { align-items: center; background: transparent; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); display: inline-flex; height: 40px; justify-content: center; padding: 0; position: absolute; right: 16px; top: 16px; width: 40px; }
      .dialog-standard-close:hover, .dialog-standard-close:focus-visible { background: var(--surface-soft); color: var(--text); }
      .dialog-standard-actions { align-items: center; display: flex; gap: 8px; grid-column: 1 / -1; justify-content: flex-end; margin-top: 6px; }
      .dialog-standard-actions button { width: auto; }
      .confirm-dialog { max-width: 520px; }
      .confirm-dialog p { line-height: 1.5; }
      .confirm-dialog .dialog-standard-actions { margin-top: 18px; }
      @media (max-width: 900px) {
        .accounts-cards-toolbar { grid-template-columns: 1fr; }
        .accounts-cards-toolbar .filter-row { grid-template-columns: minmax(0, 1fr) 160px; }
        .master-item { grid-template-columns: 40px minmax(0, 1fr); }
        .item-footer { grid-column: 1 / -1; justify-content: space-between; padding-left: 52px; width: 100%; }
      }
      @media (max-width: 760px) {
        main { gap: 12px; padding: 14px 16px; }
        .master-heading { align-items: stretch; }
        .master-heading h1 { font-size: 1.5rem; }
        .master-actions [data-context-action] { justify-content: center; width: 100%; }
        .accounts-cards-toolbar { gap: 10px; padding: 10px; }
        .accounts-cards-toolbar .tab-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .accounts-cards-toolbar .filter-row { grid-template-columns: 1fr; }
        .master-panel .section-heading { align-items: center; display: flex; padding: 13px 14px; }
        .master-item { gap: 10px; padding: 13px 14px; }
        .master-item:first-child { padding-top: 13px; }
        .item-footer { border-top: 1px solid var(--line); display: grid; gap: 10px; grid-template-columns: 1fr; padding-left: 0; padding-top: 10px; }
        .item-footer .amount-stack { align-items: center; display: flex; justify-content: space-between; min-width: 0; text-align: left; width: 100%; }
        .item-actions { flex-wrap: wrap; justify-content: flex-start; }
        .item-footer .cdi-action-button { width: auto; }
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
        const contextActionLabel = contextAction?.querySelector('[data-context-action-label]');
        const searchInput = document.querySelector('[data-master-search]');

        function activeTab() {
          return document.querySelector('[data-tab][aria-selected="true"]')?.dataset.tab || 'accounts';
        }

        function syncContext() {
          const cards = activeTab() === 'cards';
          const label = cards ? 'Adicionar cartão' : 'Adicionar conta';
          if (contextAction) {
            if (contextActionLabel) contextActionLabel.textContent = label;
            else contextAction.textContent = label;
            contextAction.dataset.openDialog = cards ? 'new-card-dialog' : 'new-account-dialog';
            contextAction.setAttribute('aria-label', label);
            contextAction.title = label;
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

        function standardizeRows() {
          document.querySelectorAll('[data-master-item]').forEach((item) => {
            if (item.querySelector(':scope > .item-footer')) return;
            const amount = item.querySelector(':scope > .amount-stack');
            const actions = item.querySelector(':scope > .item-actions');
            if (!amount || !actions) return;
            const footer = document.createElement('div');
            footer.className = 'item-footer';
            footer.append(amount, actions);
            item.append(footer);
          });
        }

        function restoreInstrumentRows() {
          document.querySelectorAll('.card-account-item').forEach((card) => {
            const dialogListSection = card.querySelector('.dialog-instrument-list');
            const list = dialogListSection?.querySelector('.instrument-list');
            const main = card.querySelector(':scope > .item-main');
            if (list && main && !main.querySelector(':scope > .instrument-list')) {
              main.append(list);
              dialogListSection.remove();
            }

            const editDialog = card.querySelector('dialog[id^="edit-card-dialog-"]');
            const toggle = editDialog?.querySelector('[data-toggle-instrument-create]');
            const actions = card.querySelector(':scope > .item-footer > .item-actions, :scope > .item-actions');
            if (!editDialog || !toggle || !actions || actions.querySelector('[data-add-instrument-direct]')) return;

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'icon-button';
            button.setAttribute('data-add-instrument-direct', '');
            button.setAttribute('aria-label', 'Adicionar instrumento');
            button.title = 'Adicionar instrumento';
            button.innerHTML = '<svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
            button.addEventListener('click', () => {
              lastDialogTrigger = button;
              if (typeof editDialog.showModal === 'function') {
                if (!editDialog.open) editDialog.showModal();
              } else {
                editDialog.setAttribute('open', '');
              }
              if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
              const formId = toggle.dataset.toggleInstrumentCreate;
              const form = formId ? document.getElementById(formId) : null;
              const firstField = form?.querySelector('input, select, button');
              if (firstField && typeof firstField.focus === 'function') firstField.focus();
            });

            const editAction = actions.querySelector('[data-open-dialog^="edit-card-dialog-"]');
            if (editAction?.nextSibling) actions.insertBefore(button, editAction.nextSibling);
            else actions.append(button);
          });
        }

        function collapseInstrumentLists() {
          document.querySelectorAll('.card-account-item').forEach((card, index) => {
            const list = card.querySelector(':scope > .item-main > .instrument-list');
            if (!list || list.closest('.instrument-disclosure')) return;
            const count = list.querySelectorAll('[data-card-instrument]').length;
            const details = document.createElement('details');
            details.className = 'instrument-disclosure';
            const summary = document.createElement('summary');
            const contentId = 'card-instruments-' + index;
            list.id = contentId;
            summary.setAttribute('aria-controls', contentId);
            summary.setAttribute('aria-expanded', 'false');
            const updateSummary = () => {
              summary.setAttribute('aria-expanded', String(details.open));
              summary.textContent = (details.open ? 'Ocultar instrumentos (' : 'Ver instrumentos (') + count + ')';
            };
            details.addEventListener('toggle', updateSummary);
            updateSummary();
            details.append(summary);
            list.replaceWith(details);
            details.append(list);
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
            dialog.querySelector('.dialog-close-form')?.remove();
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

        function fallbackPayload(form) {
          const payload = {};
          new FormData(form).forEach((value, key) => {
            if (value !== '') payload[key] = value;
          });
          return payload;
        }

        async function apiMessage(response) {
          if (typeof readApiMessage === 'function') return readApiMessage(response);
          const body = await response.json().catch(() => ({}));
          if (response.ok) return 'Ação concluída. Atualizando a tela...';
          return body?.error?.message || 'Não foi possível concluir a ação.';
        }

        function wireConfirmations() {
          const dialog = createConfirmDialog();
          const message = dialog.querySelector('[data-confirm-message]');
          const status = dialog.querySelector('[data-confirm-status]');
          const submit = dialog.querySelector('[data-confirm-submit]');
          const cancel = dialog.querySelector('[data-confirm-cancel]');
          let pendingForm = null;
          let pendingTrigger = null;
          let processing = false;

          cancel.addEventListener('click', () => closeDialog(dialog));
          dialog.addEventListener('cancel', (event) => {
            if (processing) event.preventDefault();
          });
          dialog.addEventListener('close', () => {
            if (processing) return;
            pendingForm = null;
            status.className = 'form-status muted';
            status.textContent = '';
            if (pendingTrigger) pendingTrigger.focus();
          });

          document.querySelectorAll('form[data-confirm]').forEach((form) => {
            form.addEventListener('submit', (event) => {
              event.preventDefault();
              event.stopImmediatePropagation();
              pendingForm = form;
              pendingTrigger = event.submitter || form.querySelector('button[type="submit"]');
              const destructive = (form.dataset.apiMethod || 'POST').toUpperCase() === 'DELETE';
              message.textContent = form.dataset.confirm || 'Confirme esta ação.';
              submit.textContent = destructive ? 'Excluir' : 'Arquivar';
              submit.disabled = false;
              cancel.disabled = false;
              status.className = 'form-status muted';
              status.textContent = '';
              if (typeof dialog.showModal === 'function') dialog.showModal();
              else dialog.setAttribute('open', '');
              submit.focus();
            }, true);
          });

          submit.addEventListener('click', async () => {
            const form = pendingForm;
            if (!form || processing) return;
            processing = true;
            submit.disabled = true;
            cancel.disabled = true;
            status.className = 'form-status muted';
            status.textContent = 'Processando...';

            let response;
            try {
              const payload = typeof buildPayload === 'function' ? buildPayload(form) : fallbackPayload(form);
              response = await fetch(form.dataset.apiPath, {
                method: form.dataset.apiMethod || 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
              });
            } catch (_error) {
              status.className = 'form-status error';
              status.textContent = 'Não foi possível concluir a ação.';
              processing = false;
              submit.disabled = false;
              cancel.disabled = false;
              return;
            }

            status.className = response.ok ? 'form-status success' : 'form-status error';
            status.textContent = await apiMessage(response);
            if (response.ok) {
              window.setTimeout(() => window.location.reload(), 450);
              return;
            }
            processing = false;
            submit.disabled = false;
            cancel.disabled = false;
          });
        }

        wireTabs();
        standardizeRows();
        restoreInstrumentRows();
        collapseInstrumentLists();
        standardizeDialogs();
        wireConfirmations();
      })();
    </script>`;
}
