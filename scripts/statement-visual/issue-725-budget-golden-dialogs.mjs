import assert from "node:assert/strict";
import { join } from "node:path";

import { evaluate, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";

export async function checkBudgetGoldenDialogs(cdp, baseUrl, outputDir) {
  const goldenDialogs = [];
  for (const viewport of [
    { width: 1366, height: 768, name: "desktop" },
    { width: 390, height: 844, name: "mobile" },
    { width: 320, height: 740, name: "compact-mobile" },
  ]) {
    await setViewport(cdp, viewport.width, viewport.height);
    await navigate(cdp, `${baseUrl}/orcamentos?currency=USD&status=active`);
    await sleep(200);
    const geometry = await evaluate(
      cdp,
      `(() => {
      const trigger = document.querySelector('[data-sf-dialog-open="new-budget-dialog"]');
      trigger?.click();
      const dialog = document.getElementById('new-budget-dialog');
      const panel = dialog?.querySelector('.sf-dialog-panel');
      const cancel = dialog?.querySelector('.budget-form-actions [data-sf-dialog-close]');
      const confirm = dialog?.querySelector('.budget-form-actions button[type="submit"]');
      cancel?.scrollIntoView({ block: 'nearest' });
      const rect = dialog?.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const expectedNeutral = getComputedStyle(document.querySelector('.sf-filter-bar')).backgroundColor;
      const primary = getComputedStyle(document.querySelector('.budget-primary-action')).backgroundColor;
      const cancelRect = cancel?.getBoundingClientRect();
      return {
        open: dialog?.open === true,
        centered: rect && Math.abs(rect.left - (viewportWidth - rect.right)) <= 18,
        contained: rect && rect.left >= -1 && rect.right <= viewportWidth + 2 && rect.top >= -1 && rect.bottom <= innerHeight + 2,
        scrollablePanel: Boolean(panel && getComputedStyle(panel).overflowY !== 'hidden'),
        cancelNeutral: Boolean(cancel && cancel.classList.contains('sf-button-secondary') && getComputedStyle(cancel).backgroundColor === expectedNeutral),
        confirmPrimary: Boolean(confirm && confirm.classList.contains('sf-button-primary') && getComputedStyle(confirm).backgroundColor === primary),
        cancelRect: cancelRect && { x: cancelRect.x, y: cancelRect.y, width: cancelRect.width, height: cancelRect.height },
      };
    })()`,
    );
    for (const check of [
      "open",
      "centered",
      "contained",
      "scrollablePanel",
      "cancelNeutral",
      "confirmPrimary",
    ]) {
      assert.equal(
        geometry[check],
        true,
        `Golden Screen modal ${check} failed at ${viewport.name}`,
      );
    }
    assert.ok(geometry.cancelRect?.width >= 44 && geometry.cancelRect?.height >= 40);
    const createActions = await checkBudgetActionReadability(cdp, "new-budget-dialog", viewport);
    const fieldStates = await evaluate(
      cdp,
      `(() => {
        const dialog = document.getElementById('new-budget-dialog');
        const form = dialog.querySelector('form');
        const category = form.elements.namedItem('categoryId');
        const currency = form.elements.namedItem('currency');
        const amount = form.elements.namedItem('plannedAmountMinor');
        const prefix = form.querySelector('[data-budget-currency-symbol]');
        const currencies = Array.from(currency?.options ?? []).map((item) => item.value);
        const emptyCategoryRejected = category.value === '' && category.validity.valueMissing;
        const categoryOption = Array.from(category.options).find((item) => item.value && !item.disabled);
        if (categoryOption) category.value = categoryOption.value;
        const chosenCategoryValid = Boolean(categoryOption && category.validity.valid);
        const defaultBRL = currency.value === 'BRL' && prefix?.textContent === 'R$';
        currency.value = 'USD';
        currency.dispatchEvent(new Event('change', { bubbles: true }));
        const switchedToUSD = currency.value === 'USD' && prefix?.textContent?.includes('$');
        amount.value = '123456';
        amount.dispatchEvent(new Event('input', { bubbles: true }));
        const typedMoneyFormatted = amount.value === '1.234,56';
        currency.value = 'EUR';
        currency.dispatchEvent(new Event('change', { bubbles: true }));
        const switchedToEUR = currency.value === 'EUR' && prefix?.textContent?.includes('€');
        amount.value = '-100';
        amount.dispatchEvent(new Event('input', { bubbles: true }));
        const invalidNegativeRejected = amount.validity.customError;
        amount.value = '1.234,56';
        amount.dispatchEvent(new Event('input', { bubbles: true }));
        const validMoneyRestored = amount.value === '1.234,56' && amount.validity.valid;
        const rect = amount.getBoundingClientRect();
        const panelRect = dialog.getBoundingClientRect();
        const fieldContained = rect.left >= panelRect.left - 2 && rect.right <= panelRect.right + 2;
        return { defaultBRL, currencies, emptyCategoryRejected, chosenCategoryValid,
          switchedToUSD, typedMoneyFormatted, switchedToEUR, invalidNegativeRejected,
          validMoneyRestored, fieldContained };
      })()`,
    );
    assert.deepEqual(fieldStates.currencies, ["BRL", "USD", "EUR"]);
    for (const key of [
      "defaultBRL",
      "emptyCategoryRejected",
      "chosenCategoryValid",
      "switchedToUSD",
      "typedMoneyFormatted",
      "switchedToEUR",
      "invalidNegativeRejected",
      "validMoneyRestored",
      "fieldContained",
    ]) {
      assert.equal(fieldStates[key], true, `Budget form ${key} failed at ${viewport.name}`);
    }
    await screenshot(cdp, join(outputDir, `issue-725-budget-create-dialog-${viewport.name}.png`));
    const hoverTarget = await evaluate(
      cdp,
      `(() => {
        const cancel = document.querySelector('#new-budget-dialog .budget-form-actions [data-sf-dialog-close]');
        if (!cancel) return null;
        cancel.scrollIntoView({ block: 'center', inline: 'nearest' });
        const rect = cancel.getBoundingClientRect();
        return {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
          withinViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        };
      })()`,
    );
    assert.ok(hoverTarget?.withinViewport, `Cancel button outside viewport at ${viewport.name}`);
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: hoverTarget.x,
      y: hoverTarget.y,
    });
    await sleep(160);
    const modalStates = await evaluate(
      cdp,
      `(async () => {
      const dialog = document.getElementById('new-budget-dialog');
      const trigger = document.querySelector('[data-sf-dialog-open="new-budget-dialog"]');
      const cancel = dialog.querySelector('.budget-form-actions [data-sf-dialog-close]');
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'var(--sf-color-neutral-control-hover)';
      document.body.append(probe);
      const expectedHover = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const hoverNeutral = cancel.matches(':hover') && getComputedStyle(cancel).backgroundColor === expectedHover;
      cancel.disabled = true;
      const disabledReducedOpacity = Number(getComputedStyle(cancel).opacity) < 1;
      cancel.disabled = false;
      const closed = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 1200);
        dialog.addEventListener('close', () => {
          clearTimeout(timeout);
          resolve(true);
        }, { once: true });
      });
      cancel.click();
      const closeEventObserved = await closed;
      return { hoverNeutral, disabledReducedOpacity, canceled: closeEventObserved && !dialog.open, focusRestored: document.activeElement === trigger };
    })()`,
    );
    assert.deepEqual(
      modalStates,
      {
        hoverNeutral: true,
        disabledReducedOpacity: true,
        canceled: true,
        focusRestored: true,
      },
      `Golden Screen modal state failed at ${viewport.name}`,
    );

    const menuEvidence = await evaluate(
      cdp,
      `(() => {
        const budget = Array.from(document.querySelectorAll('.budget-focus [data-budget-action-menu]'))
          .find((root) => root.querySelector('[data-sf-dialog-open^="edit-budget-dialog-"]'));
        const trigger = budget?.querySelector('[data-budget-menu-trigger]');
        trigger?.scrollIntoView({ block: 'center', inline: 'nearest' });
        trigger?.click();
        const popup = budget?.querySelector('[data-budget-menu-popover]');
        const box = popup?.getBoundingClientRect();
        return {
          opened: popup?.hidden === false && trigger?.getAttribute('aria-expanded') === 'true',
          contained: Boolean(box && box.left >= 0 && box.right <= innerWidth + 1 &&
            box.top >= 0 && box.bottom <= innerHeight + 1),
          labels: Array.from(popup?.querySelectorAll('[role="menuitem"]') ?? []).map((item) => item.textContent.trim()),
          icons: Array.from(popup?.querySelectorAll('[role="menuitem"]') ?? [])
            .every((item) => Boolean(item.querySelector('svg[aria-hidden="true"]'))),
        };
      })()`,
    );
    assert.equal(menuEvidence.opened, true, `Budget menu did not open at ${viewport.name}`);
    assert.equal(menuEvidence.contained, true, `Budget menu overflow at ${viewport.name}`);
    assert.deepEqual(menuEvidence.labels, ["Atualizar", "Editar", "Arquivar"]);
    assert.equal(menuEvidence.icons, true, `Budget menu icons missing at ${viewport.name}`);
    await screenshot(cdp, join(outputDir, `issue-725-budget-actions-${viewport.name}.png`));
    const keyboardReady = await evaluate(
      cdp,
      `(() => {
        const root = Array.from(document.querySelectorAll(".budget-focus [data-budget-action-menu]"))
          .find((candidate) => candidate.querySelector('[data-sf-dialog-open^="edit-budget-dialog-"]'));
        const trigger = root?.querySelector("[data-budget-menu-trigger]");
        const popup = root?.querySelector("[data-budget-menu-popover]");
        if (!trigger || !popup) return { opened: false, firstFocused: false };
        if (!popup.hidden) trigger.click();
        trigger.click();
        const first = popup.querySelector('[role="menuitem"]');
        return { opened: !popup.hidden, firstFocused: document.activeElement === first };
      })()`,
    );
    assert.deepEqual(
      keyboardReady,
      { opened: true, firstFocused: true },
      `Budget menu keyboard initialization failed at ${viewport.name}`,
    );
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "ArrowDown",
      code: "ArrowDown",
      windowsVirtualKeyCode: 40,
    });
    const arrow = await evaluate(cdp, `document.activeElement?.textContent?.trim() === 'Editar'`);
    assert.equal(arrow, true, `Budget menu arrow navigation failed at ${viewport.name}`);
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
    const escape = await evaluate(
      cdp,
      `(() => {
        const budget = document.querySelector('.budget-focus [data-budget-menu-trigger][aria-expanded="false"]');
        return Boolean(budget && document.activeElement === budget &&
          budget.closest('[data-budget-action-menu]').querySelector('[data-budget-menu-popover]').hidden);
      })()`,
    );
    assert.equal(escape, true, `Budget menu Escape/focus restoration failed at ${viewport.name}`);

    const editDialogId = await evaluate(
      cdp,
      `(() => {
        const menu = Array.from(document.querySelectorAll('.budget-focus [data-budget-action-menu]'))
          .find((root) => root.querySelector('[data-sf-dialog-open^="edit-budget-dialog-"]'));
        const trigger = menu?.querySelector('[data-budget-menu-trigger]');
        trigger?.click();
        const edit = menu?.querySelector('[data-sf-dialog-open^="edit-budget-dialog-"]');
        edit?.click();
        return edit?.getAttribute('data-sf-dialog-open') ?? null;
      })()`,
    );
    assert.ok(editDialogId, `Budget edit dialog missing at ${viewport.name}`);
    const editActions = await checkBudgetActionReadability(cdp, editDialogId, viewport);
    await screenshot(cdp, join(outputDir, `issue-725-budget-edit-dialog-${viewport.name}.png`));
    const editCanceled = await evaluate(
      cdp,
      `(() => {
        const dialog = document.getElementById(${JSON.stringify(editDialogId)});
        const cancel = dialog?.querySelector('.budget-form-actions [data-sf-dialog-close]');
        cancel?.click();
        return Boolean(dialog && !dialog.open);
      })()`,
    );
    assert.equal(editCanceled, true, `Budget edit cancel failed at ${viewport.name}`);

    goldenDialogs.push({
      viewport: `${viewport.width}x${viewport.height}`,
      geometry,
      createActions,
      editActions,
      fieldStates,
      modalStates,
      menuEvidence,
    });
  }
  return goldenDialogs;
}

/** A visible 44px button can still split a word across lines or clip it. */
async function checkBudgetActionReadability(cdp, dialogId, viewport) {
  const result = await evaluate(cdp, `(() => {
    const dialog = document.getElementById(${JSON.stringify(dialogId)});
    const actions = dialog?.querySelector('.budget-form-actions');
    const buttons = Array.from(actions?.querySelectorAll('button') ?? []);
    buttons[0]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    function measure() {
      return buttons.map((button) => {
        const bounds = button.getBoundingClientRect();
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
        const words = [];
        let node;
        while ((node = walker.nextNode())) {
          if (node.parentElement?.closest('svg')) continue;
          for (const match of node.textContent.matchAll(/\\p{L}+/gu)) {
            const range = document.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            const boxes = Array.from(range.getClientRects());
            words.push({
              word: match[0],
              intact: boxes.length === 1 && boxes.every((rect) =>
                rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 &&
                rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1),
            });
          }
        }
        return {
          label: button.textContent.trim(),
          readable: words.length > 0 && words.every((word) => word.intact) &&
            button.scrollWidth <= button.clientWidth + 1 && bounds.width >= 44 &&
            bounds.height >= 44 && bounds.left >= 0 && bounds.right <= innerWidth + 1 &&
            bounds.top >= 0 && bounds.bottom <= innerHeight + 1,
          words,
        };
      });
    }
    const original = measure();
    let oldLayoutRejected = null;
    if (${viewport.width === 320}) {
      const savedActions = actions.style.cssText;
      const savedButtons = buttons.map((button) => button.style.cssText);
      actions.style.flexDirection = 'row';
      actions.style.flexWrap = 'nowrap';
      buttons.forEach((button) => {
        button.style.flex = '1 1 0px';
        button.style.width = 'auto';
        button.style.minWidth = '0';
        button.style.overflowWrap = 'anywhere';
      });
      oldLayoutRejected = measure().some((button) => !button.readable);
      actions.style.cssText = savedActions;
      buttons.forEach((button, index) => { button.style.cssText = savedButtons[index]; });
    }
    return {
      dialogOpen: dialog?.open === true,
      labels: original.map((button) => button.label),
      readable: original.length === 2 && original.every((button) => button.readable),
      oldLayoutRejected,
      restoredReadable: measure().every((button) => button.readable),
      original,
    };
  })()`);
  assert.equal(result.dialogOpen, true, `Budget ${dialogId} closed at ${viewport.name}`);
  assert.deepEqual(result.labels, ["Cancelar", dialogId === "new-budget-dialog" ? "Criar orçamento" : "Salvar alterações"]);
  assert.equal(result.readable, true, `Budget ${dialogId} labels broken/clipped at ${viewport.name}: ${JSON.stringify(result.original)}`);
  if (viewport.width === 320) {
    assert.equal(result.oldLayoutRejected, true, `Budget ${dialogId} old layout escaped at ${viewport.name}`);
    assert.equal(result.restoredReadable, true, `Budget ${dialogId} layout not restored at ${viewport.name}`);
  }
  return result;
}

export async function checkBudgetDialogCancellation(cdp) {
  const dialogs = await evaluate(
    cdp,
    `(async () => {
      const cancelAndWait = async (dialog, button) => {
        if (!dialog || !button) return false;
        const closed = new Promise((resolve) => {
          const timeout = setTimeout(() => resolve(false), 1200);
          dialog.addEventListener('close', () => {
            clearTimeout(timeout);
            resolve(true);
          }, { once: true });
        });
        button.click();
        return await closed;
      };
      const createTrigger = document.querySelector('[data-sf-dialog-open="new-budget-dialog"]');
      createTrigger?.click();
      const create = document.querySelector('#new-budget-dialog');
      const createOpen = create?.open === true &&
        Boolean(create.querySelector('form[data-api-path="/api/budgets"]'));
      const createCancel = create?.querySelector('.budget-form-actions [data-sf-dialog-close]');
      const neutral = createCancel && getComputedStyle(createCancel);
      const surface = getComputedStyle(document.querySelector('.sf-filter-bar')).backgroundColor;
      const neutralCancel = createCancel?.classList.contains('sf-button-secondary') &&
        neutral?.backgroundColor === surface;
      const createClosedEvent = await cancelAndWait(create, createCancel);
      const createCanceled = createClosedEvent && !create?.open && document.activeElement === createTrigger;
      const editTrigger = document.querySelector('.budget-results [data-sf-dialog-open^="edit-budget-dialog-"]');
      const menuTrigger = editTrigger?.closest('[data-budget-action-menu]')?.querySelector('[data-budget-menu-trigger]');
      menuTrigger?.click();
      if (editTrigger?.closest('[data-budget-menu-popover]')?.hidden) throw new Error('Edit action is hidden');
      editTrigger?.click();
      const edit = editTrigger && document.getElementById(editTrigger.getAttribute('data-sf-dialog-open'));
      const editOpen = edit?.open === true &&
        Boolean(edit.querySelector('form[data-api-method="PATCH"] select[name="currency"]'));
      const editCancel = edit?.querySelector('.budget-form-actions [data-sf-dialog-close]');
      const editClosedEvent = await cancelAndWait(edit, editCancel);
      const editCanceled = editClosedEvent && !edit?.open && document.activeElement === menuTrigger;
      return { createOpen, editOpen, neutralCancel, createCanceled, editCanceled };
    })()`,
  );
  assert.deepEqual(dialogs, {
    createOpen: true,
    editOpen: true,
    neutralCancel: true,
    createCanceled: true,
    editCanceled: true,
  });
  return dialogs;
}
