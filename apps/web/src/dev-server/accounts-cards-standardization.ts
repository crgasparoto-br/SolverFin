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
      .icon-button, .cdi-action-button, .instrument-actions button { align-items: center; display: inline-flex; height: 40px !important; justify-content: center; min-height: 40px !important; min-width: 40px !important; padding: 0 !important; width: 40px !important; }
      .item-actions { align-items: center; }
      .item-actions .danger-icon-button:first-of-type { margin-left: 6px; }
      .cdi-action-button .action-icon { height: 16px; width: 16px; }
      .master-dialog { max-height: min(90vh, 760px); overflow: auto; }
      .dialog-standard-close { align-items: center; background: transparent; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); display: inline-flex; height: 40px; justify-content: center; padding: 0; position: absolute; right: 16px; top: 16px; width: 40px; }
      .dialog-standard-close:hover, .dialog-standard-close:focus-visible { background: var(--surface-soft); color: var(--text); }
      .dialog-standard-actions { align-items: center; display: flex; gap: 8px; grid-column: 1 / -1; justify-content: flex-end; margin-top: 6px; }
      .dialog-standard-actions button { width: auto; }
      .confirm-dialog { max-width: 520px; }
      .confirm-dialog p { line-height: 1.5; }
      .confirm-dialog .dialog-standard-actions { margin-top: 18px; }
      .card-form-group { border: 0; display: grid; gap: 12px; grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; min-width: 0; padding: 0; }
      .card-form-group legend { color: var(--text); font-size: .875rem; font-weight: 800; grid-column: 1 / -1; margin-bottom: 2px; padding: 0; }
      .card-form-group[data-card-form-group="payment"], .card-form-group[data-card-form-group="instrument"] { border-top: 1px solid var(--line); padding-top: 14px; }
      .card-form-group [data-card-form-wide] { grid-column: 1 / -1; }
      .accounts-cards-tooltip { background: #0f172a; border-radius: 6px; color: #fff; font-size: .75rem; font-weight: 600; left: 0; max-width: min(260px, calc(100vw - 24px)); opacity: 0; padding: 6px 8px; pointer-events: none; position: fixed; top: 0; transform: translate(-50%, -100%); transition: opacity 80ms ease-out; white-space: nowrap; z-index: 10000; }
      .accounts-cards-tooltip[data-visible="true"] { opacity: 1; }
      .empty-state [data-empty-context-action] { align-items: center; display: inline-flex; gap: 7px; margin-top: 6px; }
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
        .item-footer .cdi-action-button { width: 40px !important; }
        .dialog-standard-actions { flex-direction: column-reverse; }
        .dialog-standard-actions button { width: 100%; }
        .card-form-group { grid-template-columns: 1fr; }
        .card-form-group [data-card-form-wide] { grid-column: auto; }
      }
    </style>`;
}

function standardizationScript(): string {
  const activateCdiIcon = JSON.stringify(icon("zap", 16, "action-icon"));
  const configureCdiIcon = JSON.stringify(icon("sliders", 16, "action-icon"));
  const loadingCdiIcon = JSON.stringify(icon("clock", 16, "action-icon"));
  const unavailableCdiIcon = JSON.stringify(icon("x-circle", 16, "action-icon"));
  const listIcon = JSON.stringify(icon("list", 16, "action-icon"));
  const plusIcon = JSON.stringify(icon("plus", 14, "action-icon"));
  const closeIcon = JSON.stringify(icon("x", 16, "action-icon"));

  return `
    <script data-accounts-cards-standardization-script>
      (() => {
        if (window.__solverFinAccountsCardsStandardized) return;
        window.__solverFinAccountsCardsStandardized = true;

        const cdiIcons = {
          activate: ${activateCdiIcon},
          configure: ${configureCdiIcon},
          loading: ${loadingCdiIcon},
          unavailable: ${unavailableCdiIcon}
        };
        const listIcon = ${listIcon};
        const plusIcon = ${plusIcon};
        const closeIcon = ${closeIcon};
        let lastDialogTrigger = null;
        const dialogTriggers = new WeakMap();
        const contextAction = document.querySelector('[data-context-action]');
        const contextActionLabel = contextAction?.querySelector('[data-context-action-label]');
        const searchInput = document.querySelector('[data-master-search]');

        function activeTab() {
          return document.querySelector('[data-tab][aria-selected="true"]')?.dataset.tab || 'accounts';
        }

        function rememberDialogTrigger(dialog, trigger) {
          if (!dialog || !trigger) return;
          lastDialogTrigger = trigger;
          dialogTriggers.set(dialog, trigger);
        }

        function restoreDialogFocus(dialog) {
          const trigger = dialogTriggers.get(dialog) || lastDialogTrigger;
          if (!trigger || typeof trigger.focus !== 'function') return;
          window.setTimeout(() => trigger.focus(), 0);
        }

        function openDialogFromTrigger(trigger) {
          const dialogId = trigger?.dataset.openDialog;
          const dialog = dialogId ? document.getElementById(dialogId) : null;
          if (!dialog) return;
          rememberDialogTrigger(dialog, trigger);
          if (typeof dialog.showModal === 'function') {
            if (!dialog.open) dialog.showModal();
          } else {
            dialog.setAttribute('open', '');
          }
          window.setTimeout(() => {
            const firstField = dialog.querySelector('input:not([type="hidden"]), select, button:not([disabled])');
            if (firstField && typeof firstField.focus === 'function') firstField.focus();
          }, 0);
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

        function standardizeEmptyStates() {
          document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
            if (panel.querySelectorAll('[data-master-item]').length > 0) return;
            const empty = panel.querySelector('.empty-state:not([data-filter-empty])');
            if (!empty || empty.querySelector('[data-empty-context-action]')) return;
            const cards = panel.dataset.tabPanel === 'cards';
            const label = cards ? 'Adicionar cartão' : 'Adicionar conta';
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('data-empty-context-action', '');
            button.dataset.openDialog = cards ? 'new-card-dialog' : 'new-account-dialog';
            button.setAttribute('aria-label', label);
            button.title = label;
            button.innerHTML = plusIcon + '<span>' + label + '</span>';
            button.addEventListener('click', () => openDialogFromTrigger(button));
            empty.append(button);
          });
        }

        function groupFormFields(form, definition) {
          if (!form || form.dataset.cardFormGrouped === 'true') return;
          const groups = [];
          definition.forEach((groupDefinition) => {
            const fields = groupDefinition.names
              .map((name) => form.querySelector('[name="' + name + '"]')?.closest('label'))
              .filter(Boolean);
            if (fields.length === 0) return;
            const fieldset = document.createElement('fieldset');
            fieldset.className = 'card-form-group';
            fieldset.dataset.cardFormGroup = groupDefinition.key;
            const legend = document.createElement('legend');
            legend.textContent = groupDefinition.label;
            fieldset.append(legend);
            fields.forEach((field) => {
              if (groupDefinition.wide?.includes(field.querySelector('[name]')?.name)) {
                field.setAttribute('data-card-form-wide', '');
              }
              fieldset.append(field);
            });
            groups.push(fieldset);
          });
          if (groups.length === 0) return;
          const anchor = Array.from(form.children).find((child) =>
            child.matches?.('.form-status, button[type="submit"], .dialog-standard-actions')
          );
          groups.forEach((group) => form.insertBefore(group, anchor || null));
          form.dataset.cardFormGrouped = 'true';
        }

        function standardizeCardForms() {
          groupFormFields(document.querySelector('#new-card-dialog form[data-payload-kind="credit-card-account"]'), [
            { key: 'identity', label: 'Identificação do cartão', names: ['name', 'institutionKey', 'brandKey'], wide: ['name'] },
            { key: 'dates', label: 'Datas e limite', names: ['closingDay', 'dueDay', 'creditLimitMinor'] },
            { key: 'payment', label: 'Conta de pagamento', names: ['paymentAccountId'], wide: ['paymentAccountId'] },
            { key: 'instrument', label: 'Instrumento inicial', names: ['instrumentType', 'instrumentHolder', 'instrumentName', 'instrumentMaskedIdentifier', 'instrumentCreditLimitMinor'], wide: ['instrumentName'] }
          ]);
          document.querySelectorAll('dialog[id^="edit-card-dialog-"] form[data-api-path^="/api/credit-card-accounts/"]').forEach((form) => {
            groupFormFields(form, [
              { key: 'identity', label: 'Identificação do cartão', names: ['name', 'institutionKey', 'brandKey'], wide: ['name'] },
              { key: 'dates', label: 'Datas e limite', names: ['closingDay', 'dueDay', 'creditLimitMinor'] },
              { key: 'payment', label: 'Conta de pagamento', names: ['paymentAccountId'], wide: ['paymentAccountId'] }
            ]);
          });
        }

        function cdiPresentation(label) {
          if (/^Ativar CDI/.test(label)) return { icon: cdiIcons.activate, label: 'Ativar CDI' };
          if (/^Configurar CDI/.test(label)) return { icon: cdiIcons.configure, label: 'Configurar CDI' };
          if (/Carregando CDI/.test(label)) return { icon: cdiIcons.loading, label: 'Carregando CDI...' };
          return { icon: cdiIcons.unavailable, label: label || 'CDI indisponível' };
        }

        function standardizeCdiAction(action) {
          if (!action) return;
          const visibleText = String(action.textContent || '').trim();
          const currentLabel = visibleText || action.getAttribute('aria-label') || action.title || 'CDI indisponível';
          const presentation = cdiPresentation(currentLabel);
          if (action.dataset.cdiVisualLabel === presentation.label && visibleText === '') return;
          action.classList.add('icon-button', 'cdi-action-button');
          action.setAttribute('aria-label', presentation.label);
          action.title = presentation.label;
          action.dataset.tooltip = presentation.label;
          action.dataset.cdiVisualLabel = presentation.label;
          action.innerHTML = presentation.icon;
        }

        function standardizeCdiActions() {
          document.querySelectorAll('[data-account-remuneration-action]').forEach(standardizeCdiAction);
          const observer = new MutationObserver((mutations) => {
            const actions = new Set();
            mutations.forEach((mutation) => {
              const target = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
              const action = target?.closest?.('[data-account-remuneration-action]');
              if (action) actions.add(action);
              mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                if (node.matches?.('[data-account-remuneration-action]')) actions.add(node);
                node.querySelectorAll?.('[data-account-remuneration-action]').forEach((candidate) => actions.add(candidate));
              });
            });
            actions.forEach(standardizeCdiAction);
          });
          observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        }

        function standardizeInstrumentActions() {
          document.querySelectorAll('.instrument-actions button').forEach((button) => {
            let label = button.getAttribute('aria-label') || button.title || '';
            label = label.replace(/ como default\b/i, ' como padrão');
            if (!label) return;
            button.setAttribute('aria-label', label);
            button.title = label;
            button.dataset.tooltip = label;
          });
          document.querySelectorAll('[data-view-instruments]').forEach((button) => {
            button.innerHTML = listIcon;
            button.setAttribute('aria-label', 'Ver instrumentos');
            button.title = 'Ver instrumentos';
            button.dataset.tooltip = 'Ver instrumentos';
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
            close.dataset.tooltip = 'Fechar';
            close.innerHTML = closeIcon;
            close.addEventListener('click', () => closeDialog(dialog));
            dialog.prepend(close);
            dialog.addEventListener('cancel', (event) => {
              event.preventDefault();
              closeDialog(dialog);
            });
            dialog.addEventListener('keydown', (event) => {
              if (event.key !== 'Escape') return;
              event.preventDefault();
              closeDialog(dialog);
            });
            dialog.addEventListener('close', () => restoreDialogFocus(dialog));

            const form = dialog.querySelector('form[data-api-form].edit-grid');
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
            const dialogId = trigger?.dataset.openDialog;
            const dialog = dialogId ? document.getElementById(dialogId) : null;
            if (dialog) rememberDialogTrigger(dialog, trigger);
          }, true);
        }

        function createTooltip() {
          const tooltip = document.createElement('div');
          tooltip.className = 'accounts-cards-tooltip';
          tooltip.setAttribute('role', 'tooltip');
          tooltip.dataset.visible = 'false';
          document.body.append(tooltip);
          let anchor = null;

          function show(target) {
            const label = target?.dataset.tooltip;
            if (!label) return;
            anchor = target;
            tooltip.textContent = label;
            const rect = target.getBoundingClientRect();
            tooltip.style.left = (rect.left + rect.width / 2) + 'px';
            tooltip.style.top = Math.max(12, rect.top - 8) + 'px';
            tooltip.dataset.visible = 'true';
          }

          function hide(target) {
            if (anchor !== target) return;
            anchor = null;
            tooltip.dataset.visible = 'false';
          }

          document.addEventListener('mouseover', (event) => show(event.target.closest?.('[data-tooltip]')));
          document.addEventListener('mouseout', (event) => hide(event.target.closest?.('[data-tooltip]')));
          document.addEventListener('focusin', (event) => show(event.target.closest?.('[data-tooltip]')));
          document.addEventListener('focusout', (event) => hide(event.target.closest?.('[data-tooltip]')));
        }

        function annotateIconActions() {
          document.querySelectorAll('.item-actions button, .instrument-actions button, .dialog-standard-close').forEach((button) => {
            const label = button.getAttribute('aria-label') || button.title;
            if (!label) return;
            if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', label);
            if (!button.title) button.title = label;
            button.dataset.tooltip = label;
          });
        }

        function createConfirmDialog() {
          const dialog = document.createElement('dialog');
          dialog.className = 'master-dialog confirm-dialog';
          dialog.setAttribute('aria-labelledby', 'accounts-cards-confirm-title');
          dialog.innerHTML =
            '<button type="button" class="dialog-standard-close" data-confirm-close aria-label="Fechar" title="Fechar" data-tooltip="Fechar">' + closeIcon + '</button>' +
            '<div class="dialog-heading"><h2 id="accounts-cards-confirm-title" data-confirm-title>Confirmar ação</h2></div>' +
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
          const title = dialog.querySelector('[data-confirm-title]');
          const message = dialog.querySelector('[data-confirm-message]');
          const status = dialog.querySelector('[data-confirm-status]');
          const submit = dialog.querySelector('[data-confirm-submit]');
          const cancel = dialog.querySelector('[data-confirm-cancel]');
          const close = dialog.querySelector('[data-confirm-close]');
          let pendingForm = null;
          let pendingTrigger = null;
          let processing = false;

          cancel.addEventListener('click', () => closeDialog(dialog));
          close.addEventListener('click', () => {
            if (!processing) closeDialog(dialog);
          });
          dialog.addEventListener('cancel', (event) => {
            event.preventDefault();
            if (!processing) closeDialog(dialog);
          });
          dialog.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || processing) return;
            event.preventDefault();
            closeDialog(dialog);
          });
          dialog.addEventListener('close', () => {
            if (processing) return;
            const trigger = pendingTrigger;
            pendingForm = null;
            pendingTrigger = null;
            status.className = 'form-status muted';
            status.textContent = '';
            if (trigger && typeof trigger.focus === 'function') {
              window.setTimeout(() => trigger.focus(), 0);
            }
          });

          document.querySelectorAll('form[data-confirm]').forEach((form) => {
            form.addEventListener('submit', (event) => {
              event.preventDefault();
              event.stopImmediatePropagation();
              pendingForm = form;
              pendingTrigger = event.submitter || form.querySelector('button[type="submit"]');
              lastDialogTrigger = pendingTrigger;
              const destructive = (form.dataset.apiMethod || 'POST').toUpperCase() === 'DELETE';
              const confirmation = form.dataset.confirm || 'Confirme esta ação.';
              const subject = confirmation.split('?')[0].replace(/^Inativar\\s+/i, '').replace(/^Arquivar\\s+/i, '').replace(/^Excluir\\s+/i, '').trim();
              title.textContent = (destructive ? 'Excluir' : 'Arquivar') + (subject ? ' ' + subject : ' registro');
              message.textContent = confirmation;
              submit.textContent = destructive ? 'Excluir' : 'Arquivar';
              submit.disabled = false;
              cancel.disabled = false;
              close.disabled = false;
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
            close.disabled = true;
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
              close.disabled = false;
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
            close.disabled = false;
          });
        }

        wireTabs();
        standardizeRows();
        standardizeEmptyStates();
        standardizeCardForms();
        standardizeCdiActions();
        standardizeInstrumentActions();
        standardizeDialogs();
        annotateIconActions();
        createTooltip();
        wireConfirmations();
      })();
    </script>`;
}
