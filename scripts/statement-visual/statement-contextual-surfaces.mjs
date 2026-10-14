import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";

/** Observe supported contextual flows, without inventing a transaction-details route. */
export async function validateStatementContextualSurfaces(
  cdp,
  { baseUrl, route, outputDir, groupId },
) {
  const report = {
    subjectSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    route,
    scope: "real-application",
    status: "running",
    observations: [],
    controls: [],
  };
  const read = (expression) => evaluate(cdp, expression);
  const press = async (key, windowsVirtualKeyCode) => {
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code: key,
      windowsVirtualKeyCode,
      ...(key === "Enter" ? { text: "\r" } : {}),
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code: key,
      windowsVirtualKeyCode,
    });
  };
  const activate = async (selector) => {
    assert.equal(
      await read(`!!document.querySelector(${JSON.stringify(selector)})`),
      true,
      selector,
    );
    await read(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await press("Enter", 13);
    await sleep(100);
  };
  const measure = async (selector) =>
    read(`(() => {
      const surface = document.querySelector(${JSON.stringify(selector)});
      const box = surface?.getBoundingClientRect();
      const controls = Array.from(surface?.querySelectorAll('button,summary,input:not([type=hidden]),select,textarea') || [])
        .filter(node => node.getBoundingClientRect().width && node.getBoundingClientRect().height);
      const accountFields = Array.from(surface?.querySelectorAll('.statement-entry-account,[data-edit-account-field]') || [])
        .filter(node => node.getClientRects().length > 0);
      const editAccountSelect = surface?.querySelector('[data-edit-account-select]');
      const panel = surface?.querySelector('.modal-panel');
      return { visible: !!box?.width && !!box?.height,
        inside: !!box && box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1,
        horizontalOverflow: !!surface && surface.scrollWidth > surface.clientWidth + 1,
        documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        focusInside: !!surface?.contains(document.activeElement),
        visibleAccountFields: accountFields.length,
        selectedAccountName: editAccountSelect?.selectedOptions?.[0]?.textContent?.trim() || null,
        fullAccountName: surface?.querySelector('[data-edit-account-full-name]')?.textContent?.trim() || null,
        documentScrollLocked: getComputedStyle(document.documentElement).overflowY === 'hidden',
        dialogOverflowHidden: !!surface && getComputedStyle(surface).overflowY === 'hidden',
        panelScrollControlled: !!panel && getComputedStyle(panel).overflowY === 'auto',
        horizontalCenterDelta: box ? Math.abs(box.left - (innerWidth - box.right)) : null,
        verticalCenterDelta: box ? Math.abs(box.top - (innerHeight - box.bottom)) : null,
        unnamedButtons: controls.filter(node => node.matches('button') && !node.getAttribute('aria-label') && !node.textContent.trim()).length,
        closeButtons: controls.filter(node => node.matches('.close-form button,button[aria-label=Fechar]')).length,
        closeGlyphDuplications: controls.filter(node => node.matches('.close-form button,button[aria-label=Fechar]') && node.textContent.includes('×') &&
          Array.from(node.querySelectorAll('svg')).some(svg => svg.getBoundingClientRect().width > 0 && svg.getBoundingClientRect().height > 0)).length };

    })()`);
  const capture = async (state, width, height, selector, extra = {}) => {
    const measured = await measure(selector);
    assertContextualSurface(measured, state, selector.startsWith("dialog"));
    const file = `statement-contextual-${state}-${width}x${height}.png`;
    await screenshot(cdp, join(outputDir, file));
    const accessibilityFile = `statement-contextual-${state}-${width}x${height}-ax.json`;
    const accessibility = await cdp.send("Accessibility.getFullAXTree");
    await writeFile(
      join(outputDir, accessibilityFile),
      `${JSON.stringify({ subjectSha: report.subjectSha, route, state, viewport: { width, height }, ...accessibility }, null, 2)}\n`,
    );
    report.observations.push({
      state,
      viewport: { width, height },
      selector,
      measured,
      screenshot: file,
      accessibilityFile,
      ...extra,
    });
    // Regress a viewport-anchored overlay, then prove the original surface still passes.
    const savedStyle = await read(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      const original = node.getAttribute('style');
      node.style.setProperty('position', 'fixed', 'important');
      node.style.setProperty('left', (innerWidth - 4) + 'px', 'important');
      node.style.setProperty('right', 'auto', 'important');
      node.style.setProperty('margin', '0', 'important');
      return original;
    })()`);
    let reason;
    try {
      const wrong = await measure(selector);
      assert.throws(
        () => assertContextualSurface(wrong, state, selector.startsWith("dialog")),
        (error) => {
          reason = error.message;
          return error.code === "ERR_ASSERTION";
        },
      );
    } finally {
      await read(`(() => {
        const node = document.querySelector(${JSON.stringify(selector)});
        const original = ${JSON.stringify(savedStyle)};
        if (original === null) node.removeAttribute('style');
        else node.setAttribute('style', original);
      })()`);
    }
    assertContextualSurface(await measure(selector), state, selector.startsWith("dialog"));
    if ((state === "new" || state === "edit" || state === "clone") && width >= 1100) {
      const originalStyle = await read(`(() => {
        const node = document.querySelector(${JSON.stringify(selector)});
        const original = node.getAttribute("style");
        node.style.setProperty("inset", "auto", "important");
        node.style.setProperty("top", "50%", "important");
        node.style.setProperty("right", "16px", "important");
        node.style.setProperty("margin", "0", "important");
        node.style.setProperty("transform", "translateY(-50%)", "important");
        return original;
      })()`);
      let centerError;
      try {
        const rightAnchored = await measure(selector);
        assert.equal(
          rightAnchored.inside,
          true,
          `${state}: negative control must remain inside viewport`,
        );
        assert.throws(
          () => assertContextualSurface(rightAnchored, state, true),
          (error) => {
            centerError = error.message;
            return error.code === "ERR_ASSERTION" && /horizontal center/.test(error.message);
          },
        );
      } finally {
        await read(`(() => {
          const node = document.querySelector(${JSON.stringify(selector)});
          const original = ${JSON.stringify(originalStyle)};
          if (original === null) node.removeAttribute("style");
          else node.setAttribute("style", original);
        })()`);
      }
      assertContextualSurface(await measure(selector), state, true);
      report.controls.push({
        id: "GS-CONTEXTUAL-NC-RIGHT-ALIGNED-" + state,
        viewport: { width, height },
        mutation: "Dialog right-aligned but entirely inside the viewport",
        rejectedBecause: centerError,
        restored: "passed",
      });
    }
    report.controls.push({
      id: "GS-CONTEXTUAL-ANCHOR-" + state,
      viewport: { width, height },
      mutation: "Overlay anchored at viewport right instead of within viewport",
      rejectedBecause: reason,
      restored: "passed",
    });
  };
  try {
    for (const [width, height] of [
      [1366, 768],
      [390, 844],
      [320, 740],
    ]) {
      await setViewport(cdp, width, height);
      await navigate(cdp, `${baseUrl}${route}`);
      await activate('[data-quick-kind="expense"]');
      await capture("new", width, height, "dialog[data-modal][open]");
      await press("Escape", 27);
      assert.equal(await read("document.querySelector('dialog[data-modal]').open"), false);

      const transactionId = await read(`(() => {
        const edit = document.querySelector('.statement-body [data-edit]');
        return edit?.dataset.edit;
      })()`);
      assert.ok(transactionId, "Fixture must contain an editable transaction");
      const editSelector = `[data-edit="${transactionId}"]`;
      const actionsSelector = `${editSelector}`;
      await read(
        `document.querySelector(${JSON.stringify(actionsSelector)}).closest('details').open = true`,
      );
      await activate(editSelector);
      assert.equal(
        await read("document.querySelector('[data-modal-title]').textContent"),
        "Editar lançamento",
      );
      assert.equal(
        await read(
          "document.querySelector('dialog[data-modal] input[name=description]').value.length > 0",
        ),
        true,
      );
      await capture("edit", width, height, "dialog[data-modal][open]");
      await press("Escape", 27);

      await navigate(cdp, `${baseUrl}${route}`);
      const cloneSelector = `[data-clone="${transactionId}"]`;
      await read(`document.querySelector(${JSON.stringify(cloneSelector)}).closest('details').open = true`);
      await activate(cloneSelector);
      assert.equal(
        await read("document.querySelector('[data-modal-title]').textContent"),
        "Clonar lançamento",
      );
      await capture("clone", width, height, "dialog[data-modal][open]");
      await press("Escape", 27);

      await navigate(cdp, `${baseUrl}${route}`);
      await activate(`[data-group-details="${groupId}"]`);
      await capture("details", width, height, "dialog[data-group-modal][open]", {
        canonicalScope:
          "Group details; the product has no separate single-transaction details drawer.",
      });
      await press("Escape", 27);
      assert.equal(await read("document.querySelector('dialog[data-group-modal]').open"), false);

      await navigate(cdp, `${baseUrl}${route}`);
      const trigger = await read(`(() => {
        const button = document.querySelector(${JSON.stringify(editSelector)});
        const summary = button.closest('details').querySelector('summary');
        summary.dataset.contextualProbeTrigger = '';
        summary.scrollIntoView({block:'center'});
        return '[data-contextual-probe-trigger]';
      })()`);
      await activate(trigger);
      await capture(
        "more-actions",
        width,
        height,
        ".actions-menu[data-statement-action-menu-fixed]",
      );
      const reconciliation = `[data-edit="${transactionId}"] + [data-action][data-method="PATCH"]`;
      assert.equal(
        await read(
          `JSON.parse(document.querySelector(${JSON.stringify(reconciliation)}).dataset.payload).status`,
        ),
        "reconciled",
      );
      await activate(reconciliation);
      await sleep(600);
      const status = await read(
        `JSON.parse(document.querySelector('[data-transaction="${transactionId}"]').textContent).status`,
      );
      assert.equal(status, "reconciled", "Reconciliation must use the canonical persisted action");
      await read(`(() => {
        const button = document.querySelector(${JSON.stringify(reconciliation)});
        button.closest('details').open = true;
        button.scrollIntoView({block:'center'});
      })()`);
      await capture(
        "reconciliation",
        width,
        height,
        ".actions-menu[data-statement-action-menu-fixed]",
        {
          persistedStatus: status,
          canonicalScope:
            "Direct status action; no association/reconciliation dialog is supported.",
        },
      );
      await activate(reconciliation);
      await sleep(600);
      assert.equal(
        await read(
          `JSON.parse(document.querySelector('[data-transaction="${transactionId}"]').textContent).status`,
        ),
        "posted",
      );
      report.controls.push({
        id: "GS-CONTEXTUAL-STATUS-ROUNDTRIP",
        viewport: { width, height },
        observed: "posted -> reconciled -> posted through canonical UI actions",
      });
    }
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error.message;
    await screenshot(cdp, join(outputDir, "statement-contextual-failure.png")).catch(
      () => undefined,
    );
    throw error;
  } finally {
    await writeFile(
      join(outputDir, "statement-contextual-surfaces.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    await setViewport(cdp, 1366, 768);
    await navigate(cdp, `${baseUrl}${route}`);
  }
}

export function assertContextualSurface(measured, state, dialog) {
  assert.equal(measured.visible, true, `${state}: missing contextual surface`);
  assert.equal(measured.inside, true, `${state}: surface escapes viewport`);
  assert.equal(measured.horizontalOverflow, false, `${state}: surface overflows`);
  assert.equal(measured.documentOverflow, false, `${state}: document overflows`);
  assert.equal(measured.unnamedButtons, 0, `${state}: unnamed button`);
  if (dialog) {
    if (state === "new" || state === "edit" || state === "clone") {
      assert.equal(measured.visibleAccountFields, 1, `${state}: duplicate account fields`);
      assert.equal(measured.documentScrollLocked, true, `${state}: background remains scrollable`);
      assert.equal(measured.dialogOverflowHidden, true, `${state}: dialog has a second scrollbar`);
      assert.equal(measured.panelScrollControlled, true, `${state}: form must own scrolling`);
      if (state === "edit") {
        assert.ok(measured.selectedAccountName, "edit: missing selected account");
        assert.equal(measured.fullAccountName, measured.selectedAccountName, "edit: full account name is not readable");
      }
      assert.ok(
        measured.horizontalCenterDelta <= 40,
        `${state}: dialog is off horizontal center (${measured.horizontalCenterDelta}px)`,
      );
      assert.ok(
        measured.verticalCenterDelta <= 40,
        `${state}: dialog is off vertical center (${measured.verticalCenterDelta}px)`,
      );
    }
    assert.equal(measured.focusInside, true, `${state}: dialog does not contain focus`);
    assert.equal(measured.closeButtons, 1, `${state}: duplicate or missing close action`);
    assert.equal(
      measured.closeGlyphDuplications,
      0,
      `${state}: close glyph duplicates a visible SVG`,
    );
  }
}
