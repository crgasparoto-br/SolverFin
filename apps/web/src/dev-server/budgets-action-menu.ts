import { renderText } from "../design-system/primitives.js";
import { icon } from "./icons.js";
import type { BudgetRowViewModel } from "./budgets-view-model.js";

export function renderBudgetActionMenu(
  row: BudgetRowViewModel,
  context: "focus" | "table",
): string {
  const id = renderText(`budget-actions-${context}-${encodeURIComponent(row.id)}`);
  const path = `/api/budgets/${encodeURIComponent(row.id)}`;
  const editId = renderText(`edit-budget-dialog-${row.id}`);
  const items =
    row.source === "budget"
      ? `<button type="button" role="menuitem" class="budget-action-item" data-api-action data-api-method="GET" data-api-path="${path}/usage" title="Atualizar acompanhamento">${icon("refresh-cw", 16)}<span>Atualizar</span></button>
      <button type="button" role="menuitem" class="budget-action-item" data-sf-dialog-open="${editId}" data-open-dialog="${editId}" title="Editar orçamento">${icon("pencil", 16)}<span>Editar</span></button>
      ${row.status === "archived" ? "" : `<button type="button" role="menuitem" class="budget-action-item budget-action-danger" data-api-action data-api-method="POST" data-api-path="${path}/archive" data-api-confirm="Arquivar este orçamento?" title="Arquivar orçamento">${icon("archive", 16)}<span>Arquivar</span></button>`}`
      : row.source === "uncategorized"
        ? `<a role="menuitem" class="budget-action-item" href="/lancamentos" title="Categorizar no Extrato">${icon("tag", 16)}<span>Categorizar no Extrato</span></a>`
        : `<button type="button" role="menuitem" class="budget-action-item" data-sf-dialog-open="new-budget-dialog" data-open-dialog="new-budget-dialog" title="Novo orçamento">${icon("plus", 16)}<span>Novo orçamento</span></button>`;
  const label = renderText(row.categoryName);
  return `<div class="budget-action-menu" data-budget-action-menu data-budget-action-menu-context="${context}">
    <button type="button" class="sf-button sf-button-ghost sf-focus-ring budget-action-trigger" data-budget-menu-trigger aria-haspopup="menu" aria-controls="${id}" aria-expanded="false" aria-label="Ações de ${label}" title="Mais ações">${icon("more-vertical", 18)}</button>
    <div class="budget-action-popover" data-budget-menu-popover id="${id}" role="menu" aria-label="Ações de ${label}" hidden>${items}</div>
  </div>`;
}

export function renderBudgetActionMenuStyles(): string {
  return `
    .budget-action-menu { display: inline-flex; position: relative; }
    .budget-action-trigger { align-items: center; display: inline-flex; justify-content: center; min-height: 44px; min-width: 44px; padding: 0; }
    .budget-action-trigger[aria-expanded="true"] { background: var(--sf-color-neutral-control-hover); }
    .budget-action-popover { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: 0 14px 28px rgba(15, 23, 42, .14); display: grid; gap: 2px; padding: 6px; position: fixed; width: min(224px, calc(100vw - 16px)); z-index: 1400; }
    .budget-action-popover[hidden] { display: none; }
    .budget-action-item { align-items: center; background: transparent; border: 0; border-radius: 6px; color: var(--text); cursor: pointer; display: flex; font: inherit; font-size: .83rem; font-weight: 650; gap: 10px; min-height: 44px; padding: 8px 10px; text-align: left; text-decoration: none; width: 100%; }
    .budget-action-item:hover, .budget-action-item:focus-visible { background: var(--sf-color-neutral-control-hover); outline-offset: -2px; }
    .budget-action-danger { color: var(--sf-color-danger); }
    .budget-action-item svg { flex: none; }
    .budget-focus-head-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 4px 8px; justify-content: flex-end; }
    .budget-composition-cell { display: grid; gap: 5px; }
    @media (max-width: 560px) {
      .budget-action-popover { max-width: calc(100vw - 16px); }
      .budget-focus-head-actions { justify-content: flex-start; }
    }
  `;
}

export function renderBudgetActionMenuScriptTag(): string {
  return `<script>(function() {
    if (globalThis.__solverFinBudgetActionMenusBound) return;
    globalThis.__solverFinBudgetActionMenusBound = true;
    var openRoot = null;
    function triggerOf(root) { return root?.querySelector('[data-budget-menu-trigger]'); }
    function popoverOf(root) { return root?.querySelector('[data-budget-menu-popover]'); }
    function closeMenu(refocus) {
      if (!openRoot) return;
      var root = openRoot; openRoot = null;
      var popup = popoverOf(root), trigger = triggerOf(root);
      if (popup) popup.hidden = true;
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
      if (refocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
    }
    function position(root) {
      var trigger = triggerOf(root), popup = popoverOf(root);
      if (!trigger || !popup) return;
      var rect = trigger.getBoundingClientRect(), box = popup.getBoundingClientRect();
      var left = Math.max(8, Math.min(rect.right - box.width, innerWidth - box.width - 8));
      var top = rect.bottom + 5;
      if (top + box.height > innerHeight - 8) top = rect.top - box.height - 5;
      popup.style.left = Math.round(left) + 'px';
      popup.style.top = Math.round(Math.max(8, top)) + 'px';
    }
    document.addEventListener('click', function(event) {
      var target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      var trigger = target.closest('[data-budget-menu-trigger]');
      if (trigger) {
        var root = trigger.closest('[data-budget-action-menu]');
        if (openRoot === root) { closeMenu(true); return; }
        closeMenu(false);
        var popup = popoverOf(root);
        if (!popup) return;
        openRoot = root; popup.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        position(root);
        popup.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
        return;
      }
      var item = target.closest('[data-budget-action-menu] [role="menuitem"]');
      if (item) {
        // Keep the opener visible until the shared dialog restores focus on close.
        if (!item.hasAttribute('data-sf-dialog-open')) closeMenu(true);
        return;
      }
      if (openRoot && !openRoot.contains(target)) closeMenu(false);
    });
    document.addEventListener('keydown', function(event) {
      if (!openRoot || document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); return; }
      var items = Array.from(popoverOf(openRoot)?.querySelectorAll('[role="menuitem"]') || []);
      if (!items.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      var i = items.indexOf(document.activeElement);
      if (i === -1 && !openRoot.contains(document.activeElement)) return;
      event.preventDefault();
      if (event.key === 'Home') i = 0;
      else if (event.key === 'End') i = items.length - 1;
      else if (event.key === 'ArrowDown') i = (i + 1) % items.length;
      else i = (i + items.length - 1) % items.length;
      items[i].focus({ preventScroll: true });
    });
    document.addEventListener('focusin', function(event) {
      if (openRoot && !document.querySelector('dialog[open]') && !openRoot.contains(event.target)) closeMenu(false);
    });
    document.addEventListener('close', function(event) {
      if (openRoot && event.target instanceof HTMLDialogElement &&
          openRoot.querySelector('[data-sf-dialog-open="' + event.target.id + '"]')) closeMenu(true);
    }, true);
    window.addEventListener('resize', function() { closeMenu(false); });
    document.addEventListener('scroll', function(event) {
      if (openRoot && !popoverOf(openRoot)?.contains(event.target)) closeMenu(false);
    }, true);
  })();</script>`;
}
