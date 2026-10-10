import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import * as mockupComposition from "./mockup-composition-contract.mjs";

const { assertMockupComposition, measureMockupComposition } = mockupComposition;

/** Shares the authenticated browser and fixtures with the canonical group-layout scenario. */
export async function validateStatementRefinements(cdp, { baseUrl, route, outputDir }) {
  const report = {
    subjectSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    scope: "real-application",
    route,
    status: "running",
    observations: [],
    controls: [],
  };
  const read = (expression) => evaluate(cdp, expression);
  const press = async (key, code) => {
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code: key,
      windowsVirtualKeyCode: code,
      ...(key === "Enter" ? { text: "\r" } : {}),
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code: key,
      windowsVirtualKeyCode: code,
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
      await sleep(200);
      const geometry = await read(`(${measureStatementRefinements.toString()})()`);
      const composition = await read(`(${measureMockupComposition.toString()})()`);
      report.observations.push({ width, height, geometry, composition });
      assertStatementRefinements(geometry, width <= 760);
      assertMockupComposition(composition);
      await screenshot(cdp, join(outputDir, `statement-refinement-top-${width}x${height}.png`));

      await read("document.querySelector('.statement-secondary-actions>summary').focus()");
      await press("Enter", 13);
      assert.equal(await read("document.querySelector('.statement-secondary-actions').open"), true);
      const secondary = await read(`(() => {
        const menu = document.querySelector('.statement-secondary-actions');
        return Array.from(menu.querySelectorAll('button[data-quick-kind]')).map(button => ({
          kind: button.dataset.quickKind, visible: button.getBoundingClientRect().height > 0
        }));
      })()`);
      assert.deepEqual(secondary.map((action) => action.kind).sort(), ["income", "transfer"]);
      assert.ok(secondary.every((action) => action.visible));
      await press("Escape", 27);
      const menuClosed = await read("document.querySelector('.statement-secondary-actions').open");
      assert.equal(menuClosed, false);
      assert.equal(
        await read("document.activeElement.matches('.statement-secondary-actions>summary')"),
        true,
      );
      await press("Enter", 13);
      const transferSelector = ".statement-secondary-actions [data-quick-kind=transfer]";
      await read(`document.querySelector("${transferSelector}").focus()`);
      await press("Enter", 13);
      assert.equal(await read("document.querySelector('dialog[data-modal]').open"), true);
      assert.equal(
        await read("document.querySelector('dialog[data-modal] select[name=kind]').value"),
        "transfer",
      );
      await press("Escape", 27);
      assert.equal(await read("document.querySelector('dialog[data-modal]').open"), false);
      // Native dialog close is queued; focus restoration belongs to its close event.
      await sleep(50);
      assert.equal(
        await read("document.activeElement.matches('.statement-secondary-actions>summary')"),
        true,
      );
      report.controls.push({ id: "GS-MOCKUP-ACTIONS-KEYBOARD", width, status: "passed" });

      await read("document.querySelector('.statement-status-details>summary').focus()");
      await press("Enter", 13);
      const expanded = await read(`(${measureStatementRefinements.toString()})()`);
      assert.equal(expanded.summaryOpen, true, "Status summary must open from the keyboard.");
      assert.equal(expanded.statusVisible, true, "Expanded status values must be visible.");
      assert.deepEqual(
        expanded.essentialText,
        geometry.essentialText,
        "Disclosure changed financial context.",
      );
      assert.equal(expanded.statusText, geometry.statusText, "Disclosure lost status information.");
      await read("document.querySelector('.statement-status-details>summary').click()");
      report.controls.push({ id: "GS-MOBILE-STATUS-KEYBOARD", width, status: "passed" });
      await read("document.querySelector('.statement-body').scrollIntoView({block:'center'})");
      await screenshot(cdp, join(outputDir, `statement-refinement-rows-${width}x${height}.png`));

      if (width > 760) {
        await read(`(() => {const heading=document.querySelector('.statement-account-heading');
          heading.dataset.savedStyle=heading.getAttribute('style')||'';
          heading.style.setProperty('grid-template-columns','1fr','important');})()`);
        try {
          const stacked = await read(`(${measureMockupComposition.toString()})()`);
          assert.throws(
            () => assertMockupComposition(stacked),
            /side by side|horizontal|period navigation/,
          );
        } finally {
          await read(`(() => {const heading=document.querySelector('.statement-account-heading');
            heading.setAttribute('style',heading.dataset.savedStyle);delete heading.dataset.savedStyle;})()`);
        }
        assertMockupComposition(await read(`(${measureMockupComposition.toString()})()`));
        report.controls.push({ id: "GS-MOCKUP-NC-HEADER", status: "passed", restored: "passed" });
        continue;
      }

      await read(`
        (() => {const style=document.createElement('style');style.id='statement-refinement-negative';
        style.textContent='[data-golden-screen] .statement-body .statement-row-metadata,[data-golden-screen] .statement-body .statement-row-footer{display:contents!important}';document.head.append(style);})()`);
      try {
        const regressed = await read(`(${measureStatementRefinements.toString()})()`);
        assert.throws(() => assertStatementRefinements(regressed, true), /metadata/);
      } finally {
        await read("document.getElementById('statement-refinement-negative')?.remove()");
      }
      assertStatementRefinements(await read(`(${measureStatementRefinements.toString()})()`), true);
      report.controls.push({
        id: "GS-MOBILE-NC-METADATA",
        width,
        status: "passed",
        restored: "passed",
      });
    }

    await read("document.querySelector('[data-quick-kind=\"expense\"]').click()");
    const measureTitle = `(() => {
      const dialog=document.querySelector('dialog[data-modal]');
      const header=dialog.querySelector('.modal-panel>div:nth-child(2)');
      const title=dialog.querySelector('[data-modal-title]');
      return {open:dialog.open,titleWidth:title.getBoundingClientRect().width,headerWidth:header.getBoundingClientRect().width};
    })()`;
    const assertTitle = (geometry) => {
      assert.equal(geometry.open, true);
      const usesHeader = geometry.titleWidth >= geometry.headerWidth - 4;
      assert.ok(usesHeader, "Dialog title must use its header width.");
    };
    const title = await read(measureTitle);
    assertTitle(title);
    await screenshot(cdp, join(outputDir, "statement-refinement-dialog-title-320x740.png"));
    await read(`
      (() => {const h=document.querySelector('dialog[data-modal] .modal-panel>div:nth-child(2)');h.dataset.savedStyle=h.getAttribute('style')||'';h.style.setProperty('padding-right','104px','important');})()
    `);
    try {
      const narrow = await read(measureTitle);
      assert.throws(() => assertTitle(narrow), /header width/);
    } finally {
      await read(`
        (() => {const h=document.querySelector('dialog[data-modal] .modal-panel>div:nth-child(2)');h.setAttribute('style',h.dataset.savedStyle);delete h.dataset.savedStyle;})()
      `);
    }
    assertTitle(await read(measureTitle));
    report.controls.push({
      id: "GS-DIALOG-NC-TITLE-WIDTH",
      status: "passed",
      title,
      restored: "passed",
    });

    const measureCloseAffordance = `(() => {
      const dialog = document.querySelector('dialog[data-modal]');
      const visibleButtons = Array.from(dialog.querySelectorAll('.close-form button')).filter(
        (button) => {
          const box = button.getBoundingClientRect();
          const style = getComputedStyle(button);
          return (
            box.width > 0 &&
            box.height > 0 &&
            style.visibility !== 'hidden' &&
            style.display !== 'none'
          );
        },
      );
      const button = visibleButtons[0];
      if (!button) {
        return { buttonCount: 0, glyphSources: 0, text: '', before: '', after: '' };
      }
      const style = getComputedStyle(button);
      const pseudoVisible = (content) =>
        Boolean(content && content !== 'none' && content !== 'normal' && content !== '""');
      const before = getComputedStyle(button, '::before').content;
      const after = getComputedStyle(button, '::after').content;
      const textVisible = parseFloat(style.fontSize) > 0 && button.textContent.trim().length > 0;
      return {
        buttonCount: visibleButtons.length,
        glyphSources:
          Number(textVisible) + Number(pseudoVisible(before)) + Number(pseudoVisible(after)),
        text: button.textContent.trim(),
        before,
        after,
      };
    })()`;
    const assertCloseAffordance = (state) => {
      assert.equal(state.buttonCount, 1, "Drawer must expose exactly one visible close control.");
      assert.equal(
        state.glyphSources,
        1,
        "Drawer close control must render exactly one visible glyph.",
      );
      assert.equal(
        state.text,
        "×",
        "Drawer close control must use the canonical single close glyph.",
      );
    };
    const closeAffordance = await read(measureCloseAffordance);
    assertCloseAffordance(closeAffordance);
    await read(`
      (() => {
        const style = document.createElement('style');
        style.id = 'statement-close-negative';
        style.textContent = 'dialog[data-modal] .close-form button::after{content:"×"!important}';
        document.head.append(style);
      })()
    `);
    try {
      const duplicatedClose = await read(measureCloseAffordance);
      assert.throws(() => assertCloseAffordance(duplicatedClose), /exactly one visible glyph/);
    } finally {
      await read("document.getElementById('statement-close-negative')?.remove()");
    }
    assertCloseAffordance(await read(measureCloseAffordance));
    report.controls.push({
      id: "GS-DIALOG-SINGLE-CLOSE-AFFORDANCE",
      status: "passed",
      closeAffordance,
      restored: "passed",
    });
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
    await screenshot(cdp, join(outputDir, "statement-refinement-failure.png"));
    throw error;
  } finally {
    await writeFile(
      join(outputDir, "statement-refinements.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    await setViewport(cdp, 1366, 768);
    await navigate(cdp, `${baseUrl}${route}`);
  }
}

function assertStatementRefinements(geometry, mobile) {
  assert.equal(geometry.overflow, false, "Statement refinement must not overflow the page.");
  assert.ok(geometry.rowCount > 0, "Statement rows must be observed.");
  assert.equal(geometry.summaryOpen, false, "Status details must start collapsed.");
  assert.equal(geometry.firstAction, "expense", "The primary action must lead the keyboard order.");
  assert.ok(
    geometry.essentialText.every((text) => text.trim()),
    "Financial context is missing.",
  );
  for (const secondary of geometry.actions.filter((action) => action.kind !== "expense")) {
    const primary = geometry.actions.find((action) => action.kind === "expense");
    assert.notEqual(
      primary.background,
      secondary.background,
      "Secondary action competes with primary.",
    );
  }
  if (mobile) {
    assert.equal(geometry.metadataLayout, "flex", "Mobile metadata must share a compact line.");
    assert.equal(geometry.footerLayout, "flex", "Mobile date/balance must share a compact line.");
  }
}

function measureStatementRefinements() {
  const row = document.querySelector(".statement-body");
  const details = document.querySelector(".statement-status-details");
  const rect = (element) => {
    const bounds = element.getBoundingClientRect();
    return { top: bounds.top + scrollY, height: bounds.height, width: bounds.width };
  };
  const essential = [
    document.querySelector(".statement-context-copy strong"),
    document.querySelector('.statement-context-pill[data-context="currency"]'),
    document.querySelector(".month-nav input"),
    document.querySelector(".summary-balance"),
    row?.querySelector(".col-description"),
    row?.querySelector(".col-date"),
    row?.querySelector(".col-amount"),
    row?.querySelector(".col-balance"),
  ];
  const statusHeight = details?.querySelector(".status-line")?.getBoundingClientRect().height ?? 0;
  const buttons = Array.from(document.querySelectorAll(".statement-heading-actions button"));
  const actions = buttons.map((button) => ({
    kind: button.dataset.quickKind,
    background: getComputedStyle(button).backgroundColor,
  }));
  return {
    rowCount: document.querySelectorAll(".statement-body").length,
    row: rect(row),
    list: rect(document.querySelector(".statement-panel")),
    overview: rect(document.querySelector(".statement-overview")),
    summaryOpen: details?.open,
    statusText: details?.querySelector(".statement-status-content")?.textContent,
    statusVisible: !!details?.open && statusHeight > 0,
    firstAction: document.querySelector(".statement-heading-actions button")?.dataset.quickKind,
    actions,
    metadataLayout: getComputedStyle(row.querySelector(".statement-row-metadata")).display,
    footerLayout: getComputedStyle(row.querySelector(".statement-row-footer")).display,
    essentialText: essential.map((element) => element?.value ?? element?.textContent ?? ""),
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
  };
}
