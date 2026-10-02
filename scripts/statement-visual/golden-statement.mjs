import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { assertGoldenStatement, goldenStatementMeasurements } from "./golden-statement-contract.mjs";

/** Runs in the existing authenticated Chrome workflow, with its existing fixtures. */
export async function validateGoldenStatement(cdp, { baseUrl, route, outputDir }) {
  const subjectSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const report = { subjectSha, route, scope: "real-application", checks: [], screenshots: [], status: "running" };
  const observe = async (id, width, height) => {
    await setViewport(cdp, width, height);
    await navigate(cdp, `${baseUrl}${route}`);
    await sleep(200);
    const measured = await evaluate(cdp, goldenStatementMeasurements);
    assertGoldenStatement(measured);
    const file = `golden-statement-${id}-${width}x${height}.png`;
    await screenshot(cdp, join(outputDir, file));
    report.screenshots.push(file);
    report.checks.push({ id, status: "passed", viewport: { width, height }, measured });
  };
  const negativeControl = async (id, css) => {
    await evaluate(cdp, `(() => { const style = document.createElement('style');
      style.dataset.goldenNegative = ''; style.textContent = ${JSON.stringify(css)};
      document.head.append(style); })()`);
    let rejected = false;
    let reason;
    try {
      assertGoldenStatement(await evaluate(cdp, goldenStatementMeasurements));
    } catch (error) {
      if (error?.code !== "ERR_ASSERTION") throw error;
      rejected = true;
      reason = error.message;
    } finally {
      await evaluate(cdp, `document.querySelector('style[data-golden-negative]')?.remove()`);
    }
    assert.equal(rejected, true, `${id} failed to detect the injected regression.`);
    assertGoldenStatement(await evaluate(cdp, goldenStatementMeasurements));
    report.checks.push({ id, status: "passed", mutation: css, rejectedBecause: reason, restored: "passed" });
  };
  const enter = async () => {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  };
  try {
    await observe("desktop", 1366, 768);
    await negativeControl("GS-NC-SIDEBAR", '.statement-a2-workspace{grid-template-columns:260px minmax(0,1fr)!important}.statement-overview{grid-column:1!important;grid-row:1/4!important}.statement-query,.statement-layout{grid-column:2!important}');
    await negativeControl("GS-NC-AMOUNT", '[data-golden-screen] .statement-body .col-amount{font-size:12px!important;font-weight:400!important}');
    await evaluate(cdp, `document.querySelector('[data-statement-options-toggle]').focus()`);
    await enter();
    assert.equal(await evaluate(cdp, `document.querySelector('[data-statement-options-toggle]').getAttribute('aria-expanded')`), "true");
    assert.equal(await evaluate(cdp, `getComputedStyle(document.querySelector('.statement-sort-field')).display !== 'none'`), true);
    await enter();
    assert.equal(await evaluate(cdp, `document.querySelector('[data-statement-options-toggle]').getAttribute('aria-expanded')`), "false");
    report.checks.push({ id: "GS-OPTIONS-KEYBOARD", status: "passed" });

    const sortedRoute = new URL(route, baseUrl);
    sortedRoute.searchParams.set("sort", "amount_desc");
    await navigate(cdp, sortedRoute.href);
    await sleep(200);
    assert.equal(await evaluate(cdp, `document.querySelector('[data-statement-options-toggle]').getAttribute('aria-expanded')`), "true");
    await evaluate(cdp, `document.querySelector('[data-statement-options-toggle]').click()`);
    assert.equal(await evaluate(cdp, `document.querySelector('[data-statement-order-summary]').textContent.includes(document.querySelector('#statement-sort').selectedOptions[0].textContent)`), true);
    report.checks.push({ id: "GS-ACTIVE-ORDER", status: "passed", observed: "Non-default order opens options and remains visible when collapsed." });

    for (const [width, height] of [[1366, 768], [390, 844], [320, 740]]) {
      await observe(width === 1366 ? "long-content" : "mobile", width, height);
      await evaluate(cdp, `document.querySelector('[data-quick-kind="expense"]').click()`);
      assert.equal(await evaluate(cdp, `document.querySelector('dialog[data-modal]').open`), true);
      const kinds = await evaluate(cdp, `(() => {
        const dialog = document.querySelector('dialog[data-modal]');
        const select = dialog.querySelector('select[name="kind"]');
        return { options: Array.from(select.options).map(o => o.value).sort(),
          buttons: Array.from(dialog.querySelectorAll('[data-statement-kind]')).map(b => b.dataset.statementKind).sort() };
      })()`);
      assert.deepEqual(kinds.buttons, kinds.options, "Segmented type control must cover all canonical options.");
      await evaluate(cdp, `document.querySelector('[data-statement-kind="transfer"]').click()`);
      assert.equal(await evaluate(cdp, `document.querySelector('dialog[data-modal] select[name="kind"]').value`), "transfer");
      assert.equal(await evaluate(cdp, `(() => {
        const e = document.querySelector('dialog[data-modal] [data-field="destinationAccountId"]');
        return !!e && !e.hidden && e.getBoundingClientRect().height > 0;
      })()`), true, "Type control must invoke the existing transfer change handler.");
      const bounds = await evaluate(cdp, `(() => {
        const d = document.querySelector('dialog[data-modal]'); const r = d.getBoundingClientRect();
        return { inside: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
          overflow: d.scrollWidth > d.clientWidth + 1 };
      })()`);
      assert.equal(bounds.inside, true); assert.equal(bounds.overflow, false);
      const file = `golden-statement-transfer-${width}x${height}.png`;
      await screenshot(cdp, join(outputDir, file)); report.screenshots.push(file);
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      assert.equal(await evaluate(cdp, `document.querySelector('dialog[data-modal]').open`), false);
      report.checks.push({ id: "GS-TRANSFER-DIALOG", status: "passed", viewport: { width, height }, bounds });
    }
    const emptyRoute = new URL(route, baseUrl);
    emptyRoute.searchParams.set("q", "golden-no-matching-transaction-fixture");
    await navigate(cdp, emptyRoute.href); await sleep(200);
    assert.equal(await evaluate(cdp, `!!document.querySelector('.statement-panel .empty')`), true);
    assert.equal(await evaluate(cdp, `document.documentElement.scrollWidth <= innerWidth + 1`), true);
    report.checks.push({ id: "GS-EMPTY", status: "passed" });
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
    await screenshot(cdp, join(outputDir, "golden-statement-failure.png")).catch(() => undefined);
    throw error;
  } finally {
    await writeFile(join(outputDir, "golden-statement.json"), `${JSON.stringify(report, null, 2)}\n`);
    await setViewport(cdp, 1366, 768);
    await navigate(cdp, `${baseUrl}${route}`);
  }
}
