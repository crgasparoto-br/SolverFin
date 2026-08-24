import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  renderButton,
  renderCard,
  renderDataTable,
  renderDetailLayout,
  renderDialog,
  renderDialogTrigger,
  renderDrawer,
  renderMetricCard,
  renderPageContainer,
  createSolverFinUiInteractionsScript,
  renderPageHeader,
  renderSolverFinUiInteractionsScriptTag,
  renderSummaryGrid,
  renderText,
} from "../../apps/web/dist/design-system/primitives.js";
import { createSolverFinDesignSystemCss } from "../../apps/web/dist/design-system/styles.js";
import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];
const scenarios = [];

if (!chromePath) throw new Error("CHROME_BIN is required for issue 601 UI primitive validation.");

await mkdir(outputDir, { recursive: true });
const html = buildFixtureHtml();
const fixturePath = join(outputDir, "issue-601-ui-primitives-fixture.html");
await writeFile(fixturePath, html);
const browser = await launchChrome({ baseUrl, chromePath });
let fatalError;

try {
  await setViewport(browser.cdp, 1280, 900);
  await navigate(browser.cdp, "about:blank");
  await evaluate(browser.cdp, `(() => { document.open(); document.write(${JSON.stringify(html)}); document.close(); return document.readyState; })()`);
  await evaluate(browser.cdp, createSolverFinUiInteractionsScript());
  await sleep(120);

  const desktop = await inspectLayout(browser.cdp);
  const desktopScreenshot = "issue-601-ui-primitives-desktop.png";
  await screenshot(browser.cdp, join(outputDir, desktopScreenshot));
  desktop.screenshot = desktopScreenshot;

  check(desktop.documentFitsViewport, "Desktop fixture overflows the document horizontally.", desktop);
  check(desktop.pageContainerFitsViewport, "PageContainer exceeds the desktop viewport.", desktop);
  check(desktop.headerTitleWraps, "Long PageHeader content did not wrap in the browser.", desktop);

  await exerciseModal("dialog-trigger", "sample-dialog", "dialog");
  await exerciseModal("drawer-trigger", "sample-drawer", "drawer", "dialog-trigger");

  await setViewport(browser.cdp, 360, 800);
  await sleep(120);
  const mobile = await inspectLayout(browser.cdp);
  const mobileScreenshot = "issue-601-ui-primitives-mobile.png";
  await screenshot(browser.cdp, join(outputDir, mobileScreenshot));
  mobile.screenshot = mobileScreenshot;

  check(mobile.documentFitsViewport, "Mobile fixture introduces horizontal document overflow.", mobile);
  check(mobile.pageContainerFitsViewport, "PageContainer exceeds the reduced viewport.", mobile);
  check(mobile.detailLayoutSingleColumn, "DetailLayout did not reflow to one column on mobile.", mobile);
  check(mobile.headerTitleWraps, "Long PageHeader content did not wrap on mobile.", mobile);
  check(mobile.tableWrapFitsViewport, "DataTable wrapper exceeds the reduced viewport.", mobile);
  check(mobile.tableScrollable, "DataTable fixture did not produce intrinsic overflow to exercise the wrapper.", mobile);
  check(mobile.tableOverflowIsContained, "DataTable overflow is not contained by its wrapper.", mobile);

  scenarios.push({
    id: "responsive-layout",
    route: "standalone issue-601 primitive fixture",
    data: "long unbroken title and eight-column table",
    viewports: ["1280x900", "360x800"],
    desktop,
    mobile,
  });
} catch (error) {
  fatalError = {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  failures.push({ message: fatalError.message, details: fatalError });
} finally {
  await browser.close(outputDir);
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  requirements: [
    "interactive components provide adequate keyboard and focus behavior",
    "layout supports long content and reduced viewport",
  ],
  scenarios,
  fatalError,
  failures,
};
await writeFile(
  join(outputDir, "issue-601-ui-primitives.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  if (fatalError?.stack) console.error(fatalError.stack);
  process.exitCode = 1;
} else {
  console.log("Issue 601 UI primitives browser validation passed.");
}


async function exerciseModal(triggerId, modalId, kind, previousTriggerId) {
  await evaluate(
    browser.cdp,
    previousTriggerId
      ? `(() => {
          const previous = document.getElementById(${JSON.stringify(previousTriggerId)});
          if (!(previous instanceof HTMLElement)) return false;
          previous.focus();
          return document.activeElement === previous;
        })()`
      : `(() => {
          const active = document.activeElement;
          if (active instanceof HTMLElement) active.blur();
          return true;
        })()`,
  );
  await pressKey("Tab");
  const focused = await activeElementSnapshot();
  check(focused.id === triggerId, `${kind} trigger was not reachable as the next keyboard target.`, focused);
  check(focused.focusVisible, `${kind} trigger did not expose a browser focus-visible state.`, focused);
  check(focused.boxShadow !== "none", `${kind} trigger did not render the shared focus ring.`, focused);

  await pressKey("Enter");
  const opened = await evaluate(
    browser.cdp,
    `(() => {
      const modal = document.getElementById(${JSON.stringify(modalId)});
      return modal instanceof HTMLDialogElement && modal.open;
    })()`,
  );
  check(opened === true, `${kind} did not open from keyboard activation.`, { opened });

  const modalScreenshot = `issue-601-ui-primitives-${kind}-open.png`;
  await screenshot(browser.cdp, join(outputDir, modalScreenshot));

  await pressKey("Escape");
  const closedState = await evaluate(
    browser.cdp,
    `(() => {
      const modal = document.getElementById(${JSON.stringify(modalId)});
      const trigger = document.getElementById(${JSON.stringify(triggerId)});
      return {
        closed: modal instanceof HTMLDialogElement && !modal.open,
        focusRestored: document.activeElement === trigger,
        activeId: document.activeElement?.id ?? ""
      };
    })()`,
  );
  check(closedState.closed, `${kind} did not close with Escape.`, closedState);
  check(closedState.focusRestored, `${kind} did not restore focus to its opener.`, closedState);

  scenarios.push({
    id: `${kind}-keyboard-focus ,
    route: "standalone issue-601 primitive fixture",
    viewport: "1280x900",
    interaction: ["Tab", "Enter", "Escape"],
    focused,
    opened,
    closedState,
    screenshot: modalScreenshot,
  });
}

async function activeElementSnapshot() {
  return evaluate(
    browser.cdp,
    `(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return { id: "", focusVisible: false, boxShadow: "" };
      return {
        id: active.id,
        focusVisible: active.matches(":focus-visible"),
        boxShadow: getComputedStyle(active).boxShadow,
      };
    })()`,
  );
}

async function inspectLayout(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const root = document.querySelector(".sf-page-container");
      const title = document.querySelector(".sf-page-header-title");
      const detail = document.querySelector(".sf-detail-layout");
      const tableWrap = document.querySelector(".sf-table-wrap");
      const table = document.querySelector(".sf-table");
      const rectFits = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= viewportWidth + 1;
      };
      const titleRange = title ? document.createRange() : null;
      if (titleRange && title) titleRange.selectNodeContents(title);
      const titleLineCount = titleRange ? titleRange.getClientRects().length : 0;
      const detailColumns = detail ? getComputedStyle(detail).gridTemplateColumns.trim() : "";
      const tableWrapStyle = tableWrap ? getComputedStyle(tableWrap) : null;
      return {
        viewportWidth,
        documentWidth: document.documentElement.scrollWidth,
        documentFitsViewport: document.documentElement.scrollWidth <= viewportWidth + 1,
        pageContainerFitsViewport: rectFits(root),
        headerTitleLineCount: titleLineCount,
        headerTitleWraps: titleLineCount > 1,
        detailLayoutColumns: detailColumns,
        detailLayoutSingleColumn: detailColumns.length > 0 && detailColumns.split(/\\s+/).length === 1,
        tableWrapFitsViewport: rectFits(tableWrap),
        tableOverflowX: tableWrapStyle?.overflowX ?? "",
        tableClientWidth: tableWrap?.clientWidth ?? 0,
        tableScrollWidth: tableWrap?.scrollWidth ?? 0,
        tableWidth: table?.getBoundingClientRect().width ?? 0,
        tableScrollable: Boolean(tableWrap && tableWrap.scrollWidth > tableWrap.clientWidth + 1),
        tableOverflowIsContained: Boolean(
          tableWrap &&
          tableWrapStyle &&
          ["auto", "scroll"].includes(tableWrapStyle.overflowX) &&
          rectFits(tableWrap) &&
          document.documentElement.scrollWidth <= viewportWidth + 1
        ),
      };
    })()`,
  );
}

async function pressKey(key) {
  const code = key;
  const keyCode = key === "Tab" ? 9 : key === "Enter" ? 13 : key === "Escape" ? 27 : 0;
  const common = {
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  };
  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    ...common,
  });
  if (key === "Enter") {
    await browser.cdp.send("Input.dispatchKeyEvent", {
      type: "char",
      ...common,
      text: "\r",
      unmodifiedText: "\r",
    });
  }
  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    ...common,
  });
  await sleep(100);
}

function buildFixtureHtml() {
  const longToken = "ThisIsAnIntentionallyLongUnbrokenTitleUsedToProveThatTheSharedPageHeaderWrapsWithoutEscapingTheViewport1234567890".repeat(3);
  const columns = Array.from({ length: 8 }, (_, index) => ({
    id: `column-${index + 1}`,
    header: `Column ${index + 1}`,
    renderCell: (row) =>
      `<span style="display:inline-block;min-width:10rem">${renderText(row[`column${index + 1}`])}</span>`,
  }));
  const row = Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => [
      `column${index + 1}`,
      `Long cell ${index + 1} content with enough text to exercise responsive table sizing`,
    ]),
  );
  const table = renderDataTable({
    caption: "Responsive primitive fixture table",
    columns,
    rows: [row],
    rowKey: () => "row-1",
  });
  const dialogTrigger = renderDialogTrigger({ dialogId: "sample-dialog", label: "Open dialog" }).replace(
    "<button ",
    '<button id="dialog-trigger" ',
  );
  const drawerTrigger = renderDialogTrigger({ dialogId: "sample-drawer", label: "Open drawer" }).replace(
    "<button ",
    '<button id="drawer-trigger" ',
  );
  const dialog = renderDialog({
    id: "sample-dialog",
    title: "Keyboard dialog",
    description: "Press Escape to close and return focus to the opening button.",
    bodyHtml: renderCard({
      title: "Dialog body",
      bodyHtml: renderText("The dialog uses the shared executable primitive."),
    }),
    actionsHtml: renderButton({ label: "Secondary action", variant: "secondary" }),
  });
  const drawer = renderDrawer({
    id: "sample-drawer",
    title: "Keyboard drawer",
    description: "The same lifecycle applies to the drawer primitive.",
    bodyHtml: renderCard({
      title: "Drawer body",
      bodyHtml: renderText("The drawer must close with Escape and restore focus."),
    }),
  });
  const content = renderPageContainer({
    childrenHtml:
      renderPageHeader({
        eyebrow: "Issue 601 browser fixture",
        title: longToken,
        description: `${longToken} ${longToken}`,
        actionsHtml: `${dialogTrigger}${drawerTrigger}`,
      }) +
      renderSummaryGrid({
        childrenHtml:
          renderMetricCard({ label: "Keyboard", value: "Dialog and Drawer" }) +
          renderMetricCard({ label: "Responsive", value: "Long content and table" }),
      }) +
      renderDetailLayout({
        masterHtml: renderCard({
          title: "Long content",
          bodyHtml: renderText(`${longToken} ${longToken}`),
        }),
        detailHtml: renderCard({ title: "DataTable", bodyHtml: table }),
      }) +
      dialog +
      drawer,
  });
  const css = createSolverFinDesignSystemCss();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Issue 601 UI primitive browser fixture</title>
<style>* { box-sizing: border-box; } body { margin: 0; } ${css}</style>
</head>
<body class="sf-app-surface">
${content}
${renderSolverFinUiInteractionsScriptTag()}
</body>
</html>`;
}

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}
