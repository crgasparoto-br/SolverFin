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
        const select = document.querySelector('dialog[data-modal] select[name="kind"]');
        select.focus();
        select.value = 'transfer';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      const transfer = await read(`(() => {
        const select = document.querySelector('dialog[data-modal] select[name="kind"]');
        const destination = document.querySelector('[data-field="destinationAccountId"]');
        return { kind: select.value, focused: document.activeElement === select,
          visible: !!destination && !destination.hidden && destination.getBoundingClientRect().height > 0 };
      })()`);
      assert.equal(transfer.kind, "transfer");
      assert.equal(transfer.focused, true, "Canonical type select must remain keyboard-focusable.");
      assert.equal(transfer.visible, true, "Transfer must invoke the existing change handler.");
      const bounds = await read(`(() => {
        const d = document.querySelector('dialog[data-modal]'); const r = d.getBoundingClientRect();
        return { inside: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
          overflow: d.scrollWidth > d.clientWidth + 1 };
      })()`);
      assert.equal(bounds.inside, true);
      assert.equal(bounds.overflow, false);
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
