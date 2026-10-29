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
    assert.ok(
      hoverTarget?.withinViewport,
      `Cancel button outside viewport at ${viewport.name}`,
    );
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
    goldenDialogs.push({
      viewport: `${viewport.width}x${viewport.height}`,
      geometry,
      fieldStates,
      modalStates,
    });
  }
  return goldenDialogs;
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
      const editTrigger = document.querySelector('[data-sf-dialog-open^="edit-budget-dialog-"]');
      editTrigger?.click();
      const edit = editTrigger && document.getElementById(editTrigger.getAttribute('data-sf-dialog-open'));
      const editOpen = edit?.open === true &&
        Boolean(edit.querySelector('form[data-api-method="PATCH"] select[name="currency"]'));
      const editCancel = edit?.querySelector('.budget-form-actions [data-sf-dialog-close]');
      const editClosedEvent = await cancelAndWait(edit, editCancel);
      const editCanceled = editClosedEvent && !edit?.open && document.activeElement === editTrigger;
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
