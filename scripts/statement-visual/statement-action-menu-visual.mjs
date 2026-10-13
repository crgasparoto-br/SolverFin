import assert from "node:assert/strict";

import { evaluate, setViewport, sleep } from "./cdp.mjs";

export async function inspectStatementActionMenu(cdp) {
  await setViewport(cdp, 1024, 640);
  await evaluate(cdp, "window.scrollTo(0, document.body.scrollHeight)");
  await sleep(80);

  const before = await evaluate(
    cdp,
    `(() => {
      const details = Array.from(document.querySelectorAll('.statement-row.statement-body details.actions')).at(-1);
      const trigger = details?.querySelector('summary');
      if (!details || !trigger) return { triggerFound: false };
      const pageScrollY = window.scrollY;
      trigger.click();
      return { triggerFound: true, pageScrollY };
    })()`,
  );
  await sleep(100);
  const initialScrollY = before.pageScrollY;

  const opened = await evaluate(
    cdp,
    `(() => {
      const details = Array.from(document.querySelectorAll('.statement-row.statement-body details.actions')).at(-1);
      const trigger = details?.querySelector('summary');
      const menuId = trigger?.getAttribute('aria-controls');
      const menu = menuId ? document.getElementById(menuId) : null;
      const rect = menu?.getBoundingClientRect();
      return {
        opened: Boolean(details?.open),
        fixedLayer: Boolean(menu && menu.parentElement === document.body && menu.dataset.statementActionMenuFixed === 'true'),
        withinViewport: Boolean(rect && rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth),
        pageScrollUnchanged: ${JSON.stringify(initialScrollY)} === window.scrollY,
      };
    })()`,
  );

  await evaluate(
    cdp,
    `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`,
  );
  await sleep(80);
  const closedByEscape = await evaluate(
    cdp,
    `(() => {
      const details = Array.from(document.querySelectorAll('.statement-row.statement-body details.actions')).at(-1);
      const trigger = details?.querySelector('summary');
      return Boolean(details && !details.open && trigger?.getAttribute('aria-expanded') === 'false');
    })()`,
  );

  await evaluate(
    cdp,
    `(() => {
      const table = document.querySelector('.statement-table');
      table?.insertAdjacentHTML(
        'beforeend',
        '<section class="statement-row statement-body"><span>Menu dinâmico</span><details class="actions col-actions" data-dynamic-action-menu><summary aria-label="Ações dinâmicas">•••</summary><div class="actions-menu" role="menu"><button type="button" class="actions-item">Editar</button><button type="button" class="actions-item">Excluir</button></div></details></section>',
      );
      window.scrollTo(0, document.body.scrollHeight);
    })()`,
  );
  await sleep(100);

  const dynamicRegistered = await evaluate(
    cdp,
    `(() => {
      const details = document.querySelector('details[data-dynamic-action-menu]');
      const trigger = details?.querySelector('summary');
      const menuId = trigger?.getAttribute('aria-controls');
      const menu = menuId ? document.getElementById(menuId) : null;
      return Boolean(
        details &&
          trigger?.getAttribute('aria-expanded') === 'false' &&
          menu?.querySelector('button')?.getAttribute('role') === 'menuitem',
      );
    })()`,
  );
  await evaluate(
    cdp,
    `document.querySelector('details[data-dynamic-action-menu] summary')?.click()`,
  );
  await sleep(100);
  const dynamicOpened = await evaluate(
    cdp,
    `(() => {
      const details = document.querySelector('details[data-dynamic-action-menu]');
      const trigger = details?.querySelector('summary');
      const menuId = trigger?.getAttribute('aria-controls');
      const menu = menuId ? document.getElementById(menuId) : null;
      const rect = menu?.getBoundingClientRect();
      return {
        fixedLayer: Boolean(menu && menu.parentElement === document.body && menu.dataset.statementActionMenuFixed === 'true'),
        withinViewport: Boolean(rect && rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth),
      };
    })()`,
  );
  await evaluate(
    cdp,
    `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`,
  );
  await sleep(80);
  const dynamicClosedByEscape = await evaluate(
    cdp,
    `(() => {
      const details = document.querySelector('details[data-dynamic-action-menu]');
      const trigger = details?.querySelector('summary');
      return Boolean(details && !details.open && trigger?.getAttribute('aria-expanded') === 'false');
    })()`,
  );

  assert.deepEqual(
    {
      triggerFound: before.triggerFound,
      opened: opened.opened,
      fixedLayer: opened.fixedLayer,
      withinViewport: opened.withinViewport,
      pageScrollUnchanged: opened.pageScrollUnchanged,
      closedByEscape,
      dynamicRegistered,
      dynamicFixedLayer: dynamicOpened.fixedLayer,
      dynamicWithinViewport: dynamicOpened.withinViewport,
      dynamicClosedByEscape,
    },
    {
      triggerFound: true,
      opened: true,
      fixedLayer: true,
      withinViewport: true,
      pageScrollUnchanged: true,
      closedByEscape: true,
      dynamicRegistered: true,
      dynamicFixedLayer: true,
      dynamicWithinViewport: true,
      dynamicClosedByEscape: true,
    },
    "Statement action menu visibility contract failed.",
  );

  return {
    ...before,
    ...opened,
    closedByEscape,
    dynamicRegistered,
    dynamicFixedLayer: dynamicOpened.fixedLayer,
    dynamicWithinViewport: dynamicOpened.withinViewport,
    dynamicClosedByEscape,
  };
}
