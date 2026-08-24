import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createSolverFinUiInteractionsScript,
  renderDataTable,
  renderDetailLayout,
  renderDialog,
  renderDialogTrigger,
  renderDrawer,
  renderPageContainer,
  renderPageHeader,
  renderText,
} from "../../apps/web/dist/design-system/primitives.js";
import { createSolverFinDesignSystemCss } from "../../apps/web/dist/design-system/styles.js";
import {
  evaluate,
  launchChrome,
  navigate,
  screenshot,
  setViewport,
  sleep,
} from "./cdp.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir =
  process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
if (!chromePath)
  throw new Error("CHROME_BIN is required for issue 601 UI primitive validation.");

await mkdir(outputDir, { recursive: true });
const html = fixtureHtml();
await writeFile(
  join(outputDir, "issue-601-ui-primitives-fixture.html"),
  html,
);
const browser = await launchChrome({ baseUrl, chromePath });
const evidence = {
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
};

try {
  await setViewport(browser.cdp, 1280, 900);
  await navigate(browser.cdp, "about:blank");
  await evaluate(
    browser.cdp,
    `(() => { document.open(); document.write(${JSON.stringify(html)}); document.close(); })()`,
  );
  await evaluate(browser.cdp, createSolverFinUiInteractionsScript());
  await sleep(100);

  evidence.desktop = await inspectLayout();
  await screenshot(
    browser.cdp,
    join(outputDir, "issue-601-ui-primitives-desktop.png"),
  );
  assert.equal(evidence.desktop.documentFits, true);
  assert.equal(evidence.desktop.containerFits, true);
  assert.equal(evidence.desktop.titleWraps, true);

  evidence.dialog = await exerciseModal(
    "sample-dialog-trigger",
    "sample-dialog",
    "dialog",
  );
  evidence.drawer = await exerciseModal(
    "sample-drawer-trigger",
    "sample-drawer",
    "drawer",
    "sample-dialog-trigger",
  );

  await setViewport(browser.cdp, 360, 800);
  await sleep(100);
  evidence.mobile = await inspectLayout();
  await screenshot(
    browser.cdp,
    join(outputDir, "issue-601-ui-primitives-mobile.png"),
  );
  assert.equal(evidence.mobile.documentFits, true);
  assert.equal(evidence.mobile.containerFits, true);
  assert.equal(evidence.mobile.detailSingleColumn, true);
  assert.equal(evidence.mobile.titleWraps, true);
  assert.equal(evidence.mobile.tableFits, true);
  assert.equal(evidence.mobile.tableScrollable, true);
  assert.equal(evidence.mobile.tableOverflowContained, true);

  await writeFile(
    join(outputDir, "issue-601-ui-primitives.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  console.log("Issue 601 UI primitives browser validation passed.");
} finally {
  await browser.close(outputDir);
}

async function exerciseModal(triggerId, modalId, kind, previousTriggerId) {
  await evaluate(
    browser.cdp,
    previousTriggerId
      ? `document.getElementById(${JSON.stringify(previousTriggerId)}).focus()`
      : `document.activeElement instanceof HTMLElement && document.activeElement.blur()`,
  );
  await pressKey("Tab");
  const focused = await evaluate(
    browser.cdp,
    `(() => {
    const el = document.activeElement;
    return { id: el?.id ?? "", focusVisible: el instanceof HTMLElement && el.matches(":focus-visible"), boxShadow: el instanceof HTMLElement ? getComputedStyle(el).boxShadow : "" };
  })()`,
  );
  assert.equal(focused.id, triggerId);
  assert.equal(focused.focusVisible, true);
  assert.notEqual(focused.boxShadow, "none");

  await pressKey("Enter");
  const opened = await evaluate(
    browser.cdp,
    `document.getElementById(${JSON.stringify(modalId)}).open === true`,
  );
  assert.equal(opened, true);
  await screenshot(
    browser.cdp,
    join(outputDir, `issue-601-ui-primitives-${kind}-open.png`),
  );

  await pressKey("Escape");
  const closed = await evaluate(
    browser.cdp,
    `(() => {
    const modal = document.getElementById(${JSON.stringify(modalId)});
    const trigger = document.getElementById(${JSON.stringify(triggerId)});
    return { closed: modal.open === false, focusRestored: document.activeElement === trigger };
  })()`,
  );
  assert.equal(closed.closed, true);
  assert.equal(closed.focusRestored, true);
  return { focused, opened, closed };
}

async function inspectLayout() {
  return evaluate(
    browser.cdp,
    `(() => {
    const vw = document.documentElement.clientWidth;
    const root = document.querySelector(".sf-page-container");
    const title = document.querySelector(".sf-page-header-title");
    const detail = document.querySelector(".sf-detail-layout");
    const wrap = document.querySelector(".sf-table-wrap");
    const fits = (el) => { const r = el?.getBoundingClientRect(); return Boolean(r && r.left >= -1 && r.right <= vw + 1); };
    const range = document.createRange();
    if (title) range.selectNodeContents(title);
    const columns = detail ? getComputedStyle(detail).gridTemplateColumns.trim() : "";
    const overflowX = wrap ? getComputedStyle(wrap).overflowX : "";
    return {
      viewportWidth: vw,
      documentFits: document.documentElement.scrollWidth <= vw + 1,
      containerFits: fits(root),
      titleLines: title ? range.getClientRects().length : 0,
      titleWraps: Boolean(title && range.getClientRects().length > 1),
      detailColumns: columns,
      detailSingleColumn: columns.length > 0 && columns.split(/\\s+/).length === 1,
      tableFits: fits(wrap),
      tableScrollable: Boolean(wrap && wrap.scrollWidth > wrap.clientWidth + 1),
      tableOverflowContained: Boolean(wrap && ["auto", "scroll"].includes(overflowX) && fits(wrap) && document.documentElement.scrollWidth <= vw + 1),
    };
  })()`,
  );
}

async function pressKey(key) {
  const keyCode = key === "Tab" ? 9 : key === "Enter" ? 13 : 27;
  const common = {
    key,
    code: key,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  };
  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    ...common,
  });
  if (key === "Enter")
    await browser.cdp.send("Input.dispatchKeyEvent", {
      type: "char",
      ...common,
      text: "\r",
      unmodifiedText: "\r",
    });
  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    ...common,
  });
  await sleep(80);
}

function fixtureHtml() {
  const long =
    "LongUnbrokenIssue601TitleThatMustWrapWithoutHorizontalDocumentOverflow1234567890".repeat(
      6,
    );
  const columns = Array.from({ length: 8 }, (_, index) => ({
    id: `c${index}`,
    header: `Column ${index + 1}`,
    renderCell: (row) =>
      `<span style="display:inline-block;min-width:10rem">${renderText(row[`c${index}`])}</span>`,
  }));
  const row = Object.fromEntries(
    columns.map((column, index) => [
      column.id,
      `Cell ${index + 1} long content`,
    ]),
  );
  const table = renderDataTable({
    caption: "Responsive issue 601 table",
    columns,
    rows: [row],
    rowKey: () => "row",
  });
  const trigger = (id, label) =>
    renderDialogTrigger({ dialogId: id, label }).replace(
      "<button ",
      `<button id="${id}-trigger" `,
    );
  const dialog = renderDialog({
    id: "sample-dialog",
    title: "Dialog",
    bodyHtml: renderText("Dialog body"),
  });
  const drawer = renderDrawer({
    id: "sample-drawer",
    title: "Drawer",
    bodyHtml: renderText("Drawer body"),
  });
  const content = renderPageContainer({
    childrenHtml:
      renderPageHeader({
        title: long,
        actionsHtml: `${trigger("sample-dialog", "Open dialog")}${trigger("sample-drawer", "Open drawer")}`,
      }) +
      renderDetailLayout({ masterHtml: renderText("Master"), detailHtml: table }) +
      dialog +
      drawer,
  });
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}${createSolverFinDesignSystemCss()}</style></head><body class="sf-app-surface">${content}</body></html>`;
}
