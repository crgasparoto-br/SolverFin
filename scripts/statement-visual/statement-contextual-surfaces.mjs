import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { assertContextualSurface } from "./statement-contextual-assertions.mjs";

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
      const footerCancel = surface?.querySelector('[data-transaction-cancel]');
      const footerSave = surface?.querySelector('.statement-save-actions > button[type="submit"]');
      const panelBox = panel?.getBoundingClientRect();
      const panelStyle = panel ? getComputedStyle(panel) : null;
      const panelContentLeft = panelBox && panelStyle
        ? panelBox.left + parseFloat(panelStyle.paddingLeft) : null;
      const panelContentRight = panelBox && panelStyle
        ? panelBox.right - parseFloat(panelStyle.paddingRight) : null;
      const footerButtonFits = (button) => {
        if (!button || panelContentLeft === null || panelContentRight === null) return false;
        const bounds = button.getBoundingClientRect();
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();
        while (textNode) {
          if (textNode.textContent.trim()) {
            const textRange = document.createRange();
            textRange.selectNodeContents(textNode);
            for (const rect of textRange.getClientRects()) {
              if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) return false;
            }
          }
          textNode = walker.nextNode();
        }
        return bounds.width > 0 && bounds.height > 0 &&
          bounds.left >= panelContentLeft - 1 && bounds.right <= panelContentRight + 1 &&
          button.scrollWidth <= button.clientWidth + 1;
      };
      const statusOptions = [...(surface?.querySelectorAll('.status-icon-btn[data-status-option]') || [])];
      const statusText = surface?.querySelector('.status-icons [data-status-label]');
      return { visible: !!box?.width && !!box?.height,
        inside: !!box && box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1,
        horizontalOverflow: !!surface && surface.scrollWidth > surface.clientWidth + 1,
        documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        focusInside: !!surface?.contains(document.activeElement),
        visibleAccountFields: accountFields.length,
        selectedAccountName: editAccountSelect?.selectedOptions?.[0]?.textContent?.trim() || null,
        fullAccountName: surface?.querySelector('[data-edit-account-full-name]')?.textContent?.trim() || null,
        readOnlyOriginalName: surface?.querySelector('.statement-entry-account input')?.value?.trim() || null,
        readOnlyVisibleName: surface?.querySelector('[data-account-readonly-full-name]')?.textContent?.trim() || null,
        readOnlyInputHidden: !!surface?.querySelector('.statement-entry-account input')?.hidden,
        documentScrollLocked: getComputedStyle(document.documentElement).overflowY === 'hidden',
        dialogOverflowHidden: !!surface && getComputedStyle(surface).overflowY === 'hidden',
        panelScrollControlled: !!panel && getComputedStyle(panel).overflowY === 'auto',
        footerActionRowDelta: footerCancel && footerSave
          ? Math.abs(footerCancel.getBoundingClientRect().top - footerSave.getBoundingClientRect().top)
          : null,
        footerActionsContained: footerButtonFits(footerCancel) && footerButtonFits(footerSave),
        footerActionHeights: {
          cancel: footerCancel?.getBoundingClientRect().height ?? null,
          save: footerSave?.getBoundingClientRect().height ?? null,
        },
        tooltipStatusCount: statusOptions.filter(node => node.title && node.title === node.getAttribute('aria-label')).length,
        statusLabelVisuallyHidden: !!statusText && statusText.getBoundingClientRect().width <= 1,
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
    if (state === "new" || state === "edit" || state === "clone") {
      const originalStyle = await read(`(() => {
        const node = document.querySelector(${JSON.stringify(selector)});
        const original = node.getAttribute("style");
        node.style.setProperty("inset", "auto", "important");
        node.style.setProperty("top", "50%", "important");
        node.style.setProperty("right", "16px", "important");
        // Keep the mobile negative case inside the viewport while making its offset measurable.
        if (innerWidth < 1100) {
          node.style.setProperty("width", "65vw", "important");
        }
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
      const originalCancelStyle = await read(`(() => {
        const button = document.querySelector(${JSON.stringify(selector)}).querySelector('[data-transaction-cancel]');
        const original = button.getAttribute('style');
        button.style.setProperty('transform', 'translateX(-120px)', 'important');
        return original;
      })()`);
      let footerError;
      try {
        const clipped = await measure(selector);
        assert.throws(
          () => assertContextualSurface(clipped, state, true),
          (error) => {
            footerError = error.message;
            return error.code === "ERR_ASSERTION" && /footer actions/.test(error.message);
          },
        );
      } finally {
        await read(`(() => {
          const button = document.querySelector(${JSON.stringify(selector)}).querySelector('[data-transaction-cancel]');
          const original = ${JSON.stringify(originalCancelStyle)};
          if (original === null) button.removeAttribute('style');
          else button.setAttribute('style', original);
        })()`);
      }
      assertContextualSurface(await measure(selector), state, true);
      report.controls.push({
        id: "GS-CONTEXTUAL-NC-FOOTER-CLIPPED-" + state,
        viewport: { width, height },
        mutation: "Cancel button shifted outside the dialog content box without changing the row",
        rejectedBecause: footerError,
        restored: "passed",
      });
      for (const action of ["cancel", "save"]) {
        const buttonSelector =
          action === "cancel"
            ? "[data-transaction-cancel]"
            : '.statement-save-actions > button[type="submit"]';
        const originalTouchStyle = await read(`(() => {
          const button = document.querySelector(${JSON.stringify(selector)}).querySelector(${JSON.stringify(buttonSelector)});
          const original = button.getAttribute("style");
          button.style.setProperty("min-height", "0px", "important");
          button.style.setProperty("height", "32px", "important");
          button.style.setProperty("max-height", "32px", "important");
          return original;
        })()`);
        let touchError;
        try {
          const tooSmall = await measure(selector);
          assert.equal(
            tooSmall.footerActionsContained,
            true,
            "Touch-height negative case must remain contained",
          );
          assert.ok(
            tooSmall.footerActionHeights[action] < 44,
            "Touch-height mutation must reduce the target",
          );
          assert.throws(
            () => assertContextualSurface(tooSmall, state, true),
            (error) => {
              touchError = error.message;
              return (
                error.code === "ERR_ASSERTION" &&
                /footer touch target/.test(error.message)
              );
            },
          );
        } finally {
          await read(`(() => {
            const button = document.querySelector(${JSON.stringify(selector)}).querySelector(${JSON.stringify(buttonSelector)});
            const original = ${JSON.stringify(originalTouchStyle)};
            if (original === null) button.removeAttribute("style");
            else button.setAttribute("style", original);
          })()`);
        }
        assertContextualSurface(await measure(selector), state, true);
        report.controls.push({
          id: `GS-CONTEXTUAL-NC-FOOTER-TOUCH-${action.toUpperCase()}-${state}`,
          viewport: { width, height },
          mutation: `Footer ${action} touch target reduced to 32px without clipping or changing the action row`,
          rejectedBecause: touchError,
          restored: "passed",
        });
      }
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

      // The consolidated row action must open an editable form, not merely
      // render the menu item. Check the correct source account and save state.
      if (width === 1366) {
        const sourceAccountId = new URL(route, baseUrl).searchParams.get("accountId");
        const sourceCurrency = await read(`(() => {
          const accountId = new URL(location.href).searchParams.get("accountId");
          return [...document.querySelectorAll("[data-account-option]")].find(
            (option) => option.dataset.accountOption === accountId,
          )?.dataset.accountCurrency || "";
        })()`);
        assert.ok(sourceAccountId, "Individual route must select a source account");
        assert.match(sourceCurrency, /^[A-Z]{3}$/, "Source account must have a currency");
        const statementMonth = new URL(route, baseUrl).searchParams.get("month") || "2026-10";
        const allAccountsRoute = `/lancamentos?accountId=all&currency=${encodeURIComponent(sourceCurrency)}&month=${encodeURIComponent(statementMonth)}`;
        await navigate(cdp, `${baseUrl}${allAccountsRoute}`);
        const allEdit = `[data-edit="${transactionId}"]`;
        assert.equal(await read(`!!document.querySelector(${JSON.stringify(allEdit)})`), true);
        await read(
          `document.querySelector(${JSON.stringify(allEdit)}).closest("details").open = true`,
        );
        await activate(allEdit);
        const modalState = await read(`(() => {
          const modal = document.querySelector("dialog[data-modal]");
          const form = modal?.querySelector("[data-form]");
          const effectiveAccount = [...(form?.querySelectorAll('[name="accountId"]') || [])].find(
            (field) => !field.disabled,
          );
          return {
            open: Boolean(modal?.open),
            method: form?.dataset.method,
            accountId: effectiveAccount?.value,
            accountDisplay: form?.querySelector("[data-edit-account-full-name]")?.textContent?.trim()
              || form?.querySelector(".statement-entry-account input")?.value,
            sourceCurrency: form?.querySelector("[data-source-currency]")?.textContent?.trim(),
            saveDisabled: form?.querySelector('.save-row [type="submit"]')?.disabled,
          };
        })()`);
        assert.equal(modalState.open, true, "Consolidated Edit must open the modal");
        assert.equal(modalState.method, "PATCH");
        assert.equal(
          modalState.accountId,
          sourceAccountId,
          "Edit must use the real source account",
        );
        assert.ok(modalState.accountDisplay && !modalState.accountDisplay.includes("indisponível"));
        assert.equal(modalState.sourceCurrency, sourceCurrency);
        assert.equal(modalState.saveDisabled, false, "Edit must enable Save in consolidated mode");
        report.observations.push({
          state: "consolidated-edit",
          viewport: { width, height },
          route: allAccountsRoute,
          accountId: sourceAccountId,
          sourceCurrency,
          modalState,
        });
        await screenshot(
          cdp,
          join(outputDir, "statement-contextual-consolidated-edit-1366x768.png"),
        );
        await press("Escape", 27);

        await navigate(cdp, `${baseUrl}${allAccountsRoute}`);
        const allClone = `[data-clone="${transactionId}"]`;
        assert.equal(await read(`!!document.querySelector(${JSON.stringify(allClone)})`), true);
        await read(
          `document.querySelector(${JSON.stringify(allClone)}).closest("details").open = true`,
        );
        await activate(allClone);
        const cloneState = await read(`(() => {
          const modal = document.querySelector("dialog[data-modal]");
          const form = modal?.querySelector("[data-form]");
          const effectiveAccount = [...(form?.querySelectorAll('[name="accountId"]') || [])].find(
            (field) => !field.disabled,
          );
          return {
            open: Boolean(modal?.open),
            title: document.querySelector("[data-modal-title]")?.textContent,
            method: form?.dataset.method,
            accountId: effectiveAccount?.value,
            saveDisabled: form?.querySelector('.save-row [type="submit"]')?.disabled,
          };
        })()`);
        assert.equal(cloneState.open, true, "Consolidated Clone must open the modal");
        assert.equal(cloneState.title, "Clonar lançamento");
        assert.equal(cloneState.method, "POST");
        assert.equal(
          cloneState.accountId,
          sourceAccountId,
          "Clone must retain the real source account",
        );
        assert.equal(cloneState.saveDisabled, false, "Clone must enable Save in consolidated mode");
        report.observations.push({
          state: "consolidated-clone",
          viewport: { width, height },
          route: allAccountsRoute,
          accountId: sourceAccountId,
          cloneState,
        });
        await screenshot(
          cdp,
          join(outputDir, "statement-contextual-consolidated-clone-1366x768.png"),
        );
        await press("Escape", 27);
      }

      await navigate(cdp, `${baseUrl}${route}`);
      const cloneSelector = `[data-clone="${transactionId}"]`;
      await read(
        `document.querySelector(${JSON.stringify(cloneSelector)}).closest('details').open = true`,
      );
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
    // Fail closed if one of the mobile or desktop alignment probes is silently skipped.
    const expectedRightAlignmentControls = [
      "GS-CONTEXTUAL-NC-RIGHT-ALIGNED-new@1366x768",
      "GS-CONTEXTUAL-NC-RIGHT-ALIGNED-new@390x844",
      "GS-CONTEXTUAL-NC-RIGHT-ALIGNED-new@320x740",
      "GS-CONTEXTUAL-NC-RIGHT-ALIGNED-edit@1366x768",
      "GS-CONTEXTUAL-NC-RIGHT-ALIGNED-edit@390x844",
      "GS-CONTEXTUAL-NC-RIGHT-ALIGNED-edit@320x740",
      "GS-CONTEXTUAL-NC-RIGHT-ALIGNED-clone@1366x768",
      "GS-CONTEXTUAL-NC-RIGHT-ALIGNED-clone@390x844",
      "GS-CONTEXTUAL-NC-RIGHT-ALIGNED-clone@320x740",
    ].sort();
    const observedRightAlignmentControls = report.controls
      .filter(({ id }) => id.startsWith("GS-CONTEXTUAL-NC-RIGHT-ALIGNED-"))
      .map(({ id, viewport }) => `${id}@${viewport.width}x${viewport.height}`)
      .sort();
    assert.deepEqual(
      observedRightAlignmentControls,
      expectedRightAlignmentControls,
      "Each new/edit/clone alignment regression must be exercised at all three viewports",
    );
    const expectedFooterControls = [
      "GS-CONTEXTUAL-NC-FOOTER-CLIPPED-new@1366x768",
      "GS-CONTEXTUAL-NC-FOOTER-CLIPPED-new@390x844",
      "GS-CONTEXTUAL-NC-FOOTER-CLIPPED-new@320x740",
      "GS-CONTEXTUAL-NC-FOOTER-CLIPPED-edit@1366x768",
      "GS-CONTEXTUAL-NC-FOOTER-CLIPPED-edit@390x844",
      "GS-CONTEXTUAL-NC-FOOTER-CLIPPED-edit@320x740",
      "GS-CONTEXTUAL-NC-FOOTER-CLIPPED-clone@1366x768",
      "GS-CONTEXTUAL-NC-FOOTER-CLIPPED-clone@390x844",
      "GS-CONTEXTUAL-NC-FOOTER-CLIPPED-clone@320x740",
    ].sort();
    const observedFooterControls = report.controls
      .filter(({ id }) => id.startsWith("GS-CONTEXTUAL-NC-FOOTER-CLIPPED-"))
      .map(({ id, viewport }) => `${id}@${viewport.width}x${viewport.height}`)
      .sort();
    assert.deepEqual(
      observedFooterControls,
      expectedFooterControls,
      "Each new/edit/clone footer clipping regression must run at all three viewports",
    );
    const expectedFooterTouchControls = [];
    for (const state of ["new", "edit", "clone"]) {
      for (const viewport of ["1366x768", "390x844", "320x740"]) {
        for (const action of ["CANCEL", "SAVE"]) {
          expectedFooterTouchControls.push(
            `GS-CONTEXTUAL-NC-FOOTER-TOUCH-${action}-${state}@${viewport}`,
          );
        }
      }
    }
    expectedFooterTouchControls.sort();
    const observedFooterTouchControls = report.controls
      .filter(({ id }) => id.startsWith("GS-CONTEXTUAL-NC-FOOTER-TOUCH-"))
      .map(({ id, viewport }) => `${id}@${viewport.width}x${viewport.height}`)
      .sort();
    assert.deepEqual(
      observedFooterTouchControls,
      expectedFooterTouchControls,
      "Each footer touch target must reject the too-small mutation in new/edit/clone at all viewports",
    );
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

export { assertContextualSurface } from "./statement-contextual-assertions.mjs";
