import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import {
  assertGoldenStatement,
  goldenStatementMeasurements,
} from "./golden-statement-contract.mjs";

/** Runs in the existing authenticated Chrome workflow, with its existing fixtures. */
export async function validateGoldenStatement(cdp, { baseUrl, route, outputDir }) {
  const subjectSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const report = {
    subjectSha,
    route,
    scope: "real-application",
    checks: [],
    screenshots: [],
    status: "running",
  };
  const read = (expression) => evaluate(cdp, expression);
  const observe = async (id, width, height) => {
    await setViewport(cdp, width, height);
    await navigate(cdp, `${baseUrl}${route}`);
    await sleep(200);
    const measured = await read(goldenStatementMeasurements);
    report.checks.push({ id, status: "observed", viewport: { width, height }, measured });
    assertGoldenStatement(measured);
    if (measured.viewport.width <= 760) {
      report.checks.push({
        id: "GS-MOBILE-DENSITY-BUDGET",
        status: "passed",
        viewport: { width, height },
        observedListTop: measured.list.y,
        maxListTop: measured.viewport.height * 0.96,
        note: "The list region enters the first viewport; the first transaction itself is not required to be fully visible.",
      });
    }
    const file = `golden-statement-${id}-${width}x${height}.png`;
    await screenshot(cdp, join(outputDir, file));
    report.screenshots.push(file);
    report.checks.push({ id, status: "passed", viewport: { width, height }, measured });
  };
  const negativeControl = async (id, css) => {
    await read(`(() => { const style = document.createElement('style');
      style.dataset.goldenNegative = ''; style.textContent = ${JSON.stringify(css)};
      document.head.append(style); })()`);
    let rejected = false;
    let reason;
    try {
      assertGoldenStatement(await read(goldenStatementMeasurements));
    } catch (error) {
      if (error?.code !== "ERR_ASSERTION") throw error;
      rejected = true;
      reason = error.message;
    } finally {
      await read(`document.querySelector('style[data-golden-negative]')?.remove()`);
    }
    assert.equal(rejected, true, `${id} failed to detect the injected regression.`);
    assertGoldenStatement(await read(goldenStatementMeasurements));
    report.checks.push({
      id,
      status: "passed",
      mutation: css,
      rejectedBecause: reason,
      restored: "passed",
    });
  };
  const press = async (key, windowsVirtualKeyCode) => {
    const event = { key, code: key, windowsVirtualKeyCode };
    await cdp.send("Input.dispatchKeyEvent", {
      ...event,
      type: "keyDown",
      ...(key === "Enter" ? { text: "\r" } : {}),
    });
    await cdp.send("Input.dispatchKeyEvent", { ...event, type: "keyUp" });
  };
  const expansion = async () => {
    return read(`document.querySelector('[data-statement-options-toggle]').ariaExpanded`);
  };
  try {
    await observe("desktop", 1366, 768);
    await negativeControl(
      "GS-NC-SIDEBAR",
      ".statement-a2-workspace{grid-template-columns:260px minmax(0,1fr)!important}.statement-overview{grid-column:1!important;grid-row:1/4!important}.statement-query,.statement-layout{grid-column:2!important}",
    );
    await negativeControl(
      "GS-NC-AMOUNT",
      "[data-golden-screen] .statement-body .col-amount{font-size:12px!important;font-weight:400!important}",
    );
    await negativeControl(
      "GS-NC-DENSITY",
      "[data-golden-screen] .statement-overview{padding-bottom:400px!important}",
    );
    await negativeControl(
      "GS-NC-STATUS-COLLISION",
      "[data-golden-screen] .statement-body .statement-status{width:26px!important;height:26px!important}",
    );
    await read(`document.querySelector('[data-statement-options-toggle]').focus()`);
    await press("Enter", 13);
    assert.equal(await expansion(), "true");
    const sortVisible = await read(`(() => {
      return getComputedStyle(document.querySelector('.statement-sort-field')).display !== 'none';
    })()`);
    assert.equal(sortVisible, true);
    await press("Enter", 13);
    assert.equal(await expansion(), "false");
    report.checks.push({ id: "GS-OPTIONS-KEYBOARD", status: "passed" });

    const sortedRoute = new URL(route, baseUrl);
    sortedRoute.searchParams.set("sort", "amount_desc");
    await navigate(cdp, sortedRoute.href);
    await sleep(200);
    assert.equal(await expansion(), "true");
    await read(`document.querySelector('[data-statement-options-toggle]').click()`);
    const orderVisible = await read(`(() => {
      const summary = document.querySelector('[data-statement-order-summary]');
      const sort = document.querySelector('#statement-sort');
      return summary.textContent.includes(sort.selectedOptions[0].textContent);
    })()`);
    assert.equal(orderVisible, true);
    report.checks.push({
      id: "GS-ACTIVE-ORDER",
      status: "passed",
      observed: "Non-default order opens options and remains visible when collapsed.",
    });

    const viewports = [
      [1366, 768],
      [390, 844],
      [320, 740],
    ];
    for (const [width, height] of viewports) {
      await observe(width === 1366 ? "long-content" : "mobile", width, height);
      await read(`document.querySelector('[data-quick-kind="expense"]').click()`);
      assert.equal(await read(`document.querySelector('dialog[data-modal]').open`), true);
      await read(`(() => {
        const active = document.querySelector('dialog[data-modal] [data-statement-entry-kind][aria-checked="true"]');
        if (!active) throw new Error('Accessible entry kind control was not initialized.');
        active.focus();
      })()`);
      await press("End", 35);
      const transfer = await read(`(() => {
        const select = document.querySelector('dialog[data-modal] select[name="kind"]');
        const destination = document.querySelector('[data-field="destinationAccountId"]');
        const radio = document.querySelector('dialog[data-modal] [data-statement-entry-kind="transfer"]');
        return { kind: select.value, nativeKindVisible: select.closest("label").getBoundingClientRect().height > 0, focused: document.activeElement === radio && radio?.getAttribute('aria-checked') === 'true',
          visible: !!destination && !destination.hidden && destination.getBoundingClientRect().height > 0 };
      })()`);
      assert.equal(transfer.kind, "transfer");
      assert.equal(
        transfer.nativeKindVisible,
        false,
        "Only one entry-kind control may be visible.",
      );
      assert.equal(
        transfer.focused,
        true,
        "Entry kind must be keyboard-operable and synchronized with the canonical select.",
      );
      assert.equal(transfer.visible, true, "Transfer must invoke the existing change handler.");
      const bounds = await read(`(() => {
        const d = document.querySelector('dialog[data-modal]'); const r = d.getBoundingClientRect();
        const clippedLabels = Array.from(d.querySelectorAll('.save-row>button,.statement-entry-kinds>button')).filter(button => {
          const box = button.getBoundingClientRect();
          if (!box.width || !box.height) return false;
          const range = document.createRange(); range.selectNodeContents(button);
          return Array.from(range.getClientRects()).some(part => part.left < box.left - 1 || part.right > box.right + 1);
        }).map(button => button.textContent.trim());
        return { inside: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
          overflow: d.scrollWidth > d.clientWidth + 1, clippedLabels };
      })()`);
      report.checks.push({
        id: "GS-DIALOG-BOUNDS",
        status: "observed",
        viewport: { width, height },
        bounds,
      });
      assert.equal(bounds.inside, true);
      assert.equal(bounds.overflow, false);
      assert.deepEqual(bounds.clippedLabels, [], "Dialog action labels must remain fully visible.");
      const headerClearance = await read(`(() => {
        const dialog = document.querySelector('dialog[data-modal]');
        const close = dialog?.querySelector('.close-form button');
        const title = dialog?.querySelector('[data-modal-title]');
        const eyebrow = dialog?.querySelector('.modal-panel > div:nth-child(2) .eyebrow');
        const overlaps = (left, right) => {
          if (!left || !right) return true;
          const a = left.getBoundingClientRect();
          const b = right.getBoundingClientRect();
          return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        };
        return {
          closeTitleOverlap: overlaps(close, title),
          closeEyebrowOverlap: overlaps(close, eyebrow),
          closeText: close?.textContent.trim(),
          visibleCloseIcons: Array.from(close?.querySelectorAll('svg') || []).filter(icon => {
            const box = icon.getBoundingClientRect();
            return box.width > 0 && box.height > 0;
          }).length,
        };
      })()`);
      assert.equal(
        headerClearance.closeTitleOverlap,
        false,
        "Close action must not overlap the modal title.",
      );
      assert.equal(
        headerClearance.closeEyebrowOverlap,
        false,
        "Close action must not overlap the modal eyebrow.",
      );
      assert.equal(
        headerClearance.closeText,
        "×",
        "The close action must retain its visible glyph.",
      );
      assert.equal(
        headerClearance.visibleCloseIcons,
        0,
        "A decorative icon must not duplicate the close glyph.",
      );
      await read(`(() => {
        const close = document.querySelector('dialog[data-modal] .close-form button');
        const duplicate = close.querySelector('svg').cloneNode(true);
        duplicate.dataset.goldenDuplicateClose = '';
        duplicate.style.setProperty('display', 'inline-block', 'important');
        close.prepend(duplicate);
      })()`);
      const countCloseIcons = `Array.from(document.querySelectorAll('dialog[data-modal] .close-form button svg')).filter(icon => {
        const box = icon.getBoundingClientRect(); return box.width > 0 && box.height > 0;
      }).length`;
      try {
        const duplicated = await read(countCloseIcons);
        assert.throws(() => assert.equal(duplicated, 0), { code: "ERR_ASSERTION" });
      } finally {
        await read(`document.querySelector('[data-golden-duplicate-close]')?.remove()`);
      }
      assert.equal(await read(countCloseIcons), 0);
      report.checks.push({
        id: "GS-NC-DUPLICATE-CLOSE-SVG",
        status: "passed",
        viewport: { width, height },
        restored: "passed",
      });
      report.checks.push({
        id: "GS-DIALOG-HEADER-CLEARANCE",
        status: "passed",
        viewport: { width, height },
        observed: headerClearance,
      });
      const file = `golden-statement-transfer-${width}x${height}.png`;
      await screenshot(cdp, join(outputDir, file));
      report.screenshots.push(file);
      await press("Escape", 27);
      assert.equal(await read(`document.querySelector('dialog[data-modal]').open`), false);
      report.checks.push({
        id: "GS-TRANSFER-DIALOG",
        status: "passed",
        viewport: { width, height },
        bounds,
        transfer,
      });
    }
    const emptyRoute = new URL(route, baseUrl);
    emptyRoute.searchParams.set("q", "golden-no-matching-transaction-fixture");
    await navigate(cdp, emptyRoute.href);
    await sleep(200);
    assert.equal(await read(`!!document.querySelector('.statement-panel .empty')`), true);
    assert.equal(await read(`document.documentElement.scrollWidth <= innerWidth + 1`), true);
    report.checks.push({ id: "GS-EMPTY", status: "passed" });
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
    report.failureLayout = await read(goldenStatementMeasurements).catch(() => null);
    await screenshot(cdp, join(outputDir, "golden-statement-failure.png")).catch(() => undefined);
    throw error;
  } finally {
    await writeFile(
      join(outputDir, "golden-statement.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    await setViewport(cdp, 1366, 768);
    await navigate(cdp, `${baseUrl}${route}`);
  }
}
