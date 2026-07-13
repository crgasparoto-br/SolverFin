import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  evaluate,
  launchChrome,
  navigate,
  screenshot,
  setViewport,
  sleep,
} from "./cdp.mjs";
import { fixtureExpression, loginExpression } from "./fixtures.mjs";
import {
  pageMeasurementExpression,
  renderReport,
  tooltipMeasurementExpression,
} from "./measurements.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];
const pages = [];
const tooltips = [];

if (!chromePath) throw new Error("CHROME_BIN is required for visual validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });

try {
  await setViewport(browser.cdp, 1366, 1000);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixtureIds = await evaluate(browser.cdp, fixtureExpression());

  const longRoute = `/lancamentos?accountId=${encodeURIComponent(fixtureIds.longAccountId)}&month=2026-07`;
  const singleRoute = `/lancamentos?accountId=${encodeURIComponent(fixtureIds.singleAccountId)}&month=2026-07`;

  for (const width of [390, 768, 1366, 1920]) {
    const evidence = await capturePage({
      name: `lancamentos-${width}`,
      route: longRoute,
      width,
      height: width <= 768 ? 1100 : 1000,
    });
    validateStatement(evidence, width);
  }

  const centered = await capturePage({
    name: "lancamentos-2560-centered",
    route: longRoute,
    width: 2560,
    height: 1100,
  });
  check(centered.measurements.mainWidth <= 1800.5, "Main exceeds 1800px at 2560px", centered);
  check(centered.measurements.centerDelta <= 1.5, "Main is not centered at 2560px", centered);

  for (const route of ["/dashboard", "/cartoes", "/contas"]) {
    for (const width of [390, 1366]) {
      const evidence = await capturePage({
        name: `${route.slice(1)}-${width}`,
        route,
        width,
        height: width === 390 ? 1000 : 900,
      });
      check(!evidence.measurements.globalOverflow, `${route} has global overflow at ${width}px`, evidence);
      check(evidence.measurements.mainWidth > 0, `${route} has no measurable main at ${width}px`, evidence);
      check(
        evidence.measurements.outsideEssential.length === 0,
        `${route} has essential content outside the viewport at ${width}px`,
        evidence.measurements.outsideEssential,
      );
    }
  }

  await captureTooltip({
    name: "tooltip-first-row-hover-desktop",
    route: longRoute,
    width: 1366,
    height: 900,
    position: "first",
    activation: "hover",
  });
  await captureTooltip({
    name: "tooltip-middle-row-tab-desktop",
    route: longRoute,
    width: 1366,
    height: 900,
    position: "middle",
    activation: "tab",
  });
  await captureTooltip({
    name: "tooltip-last-row-after-scroll-desktop",
    route: longRoute,
    width: 1366,
    height: 900,
    position: "last",
    activation: "focus",
    scrollTable: true,
  });
  await captureTooltip({
    name: "tooltip-single-row-desktop",
    route: singleRoute,
    width: 1366,
    height: 900,
    position: "only",
    activation: "focus",
  });
  await captureTooltip({
    name: "tooltip-last-row-mobile",
    route: longRoute,
    width: 390,
    height: 900,
    position: "last",
    activation: "focus",
  });
} finally {
  await browser.close(outputDir);
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  zoom: "100%",
  failures,
  pages,
  tooltips,
};
await writeFile(join(outputDir, "measurements.json"), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outputDir, "REPORT.md"), renderReport(report));

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log(`Visual validation passed: ${pages.length} pages and ${tooltips.length} tooltips.`);
}

async function capturePage(scenario) {
  await setViewport(browser.cdp, scenario.width, scenario.height);
  await navigate(browser.cdp, `${baseUrl}${scenario.route}`);
  await sleep(300);
  const measurements = await evaluate(browser.cdp, pageMeasurementExpression());
  const filename = `${scenario.name}.png`;
  await screenshot(browser.cdp, join(outputDir, filename));
  const evidence = { ...scenario, screenshot: filename, measurements };
  pages.push(evidence);
  return evidence;
}

function validateStatement(evidence, width) {
  const value = evidence.measurements;
  check(!value.globalOverflow, `Statement has global overflow at ${width}px`, value);
  check(value.moneyProblems.length === 0, `Statement money is clipped or wrapped at ${width}px`, value.moneyProblems);
  check(value.overlaps.length === 0, `Statement summary overlaps at ${width}px`, value.overlaps);
  check(value.outsideEssential.length === 0, `Statement content escapes local overflow at ${width}px`, value.outsideEssential);
  check(value.balanceHierarchy, `Balance hierarchy is not preserved at ${width}px`, value);
  if (width <= 768) check(value.layoutMode === "stacked", `Statement is not stacked at ${width}px`, value);
  if (width >= 1366) check(value.layoutMode === "side-by-side", `Statement is not side-by-side at ${width}px`, value);
  if (width === 1920) {
    check(value.mainWidth >= 1680 && value.mainWidth <= 1800.5, `Main width at 1920px is ${value.mainWidth}`, value);
  }
  if (width === 768 || width === 1366) {
    check(value.table.hasLocalHorizontalScroll, `Table lacks local scroll at ${width}px`, value.table);
  }
}

async function captureTooltip(scenario) {
  await setViewport(browser.cdp, scenario.width, scenario.height);
  await navigate(browser.cdp, `${baseUrl}${scenario.route}`);
  await sleep(250);
  const preparation = await evaluate(
    browser.cdp,
    `(() => {
      const triggers = Array.from(document.querySelectorAll(".statement-status[data-tooltip]"));
      if (triggers.length === 0) throw new Error("No status indicators found");
      const position = ${JSON.stringify(scenario.position)};
      const index = position === "first" ? 0 : position === "middle" ? Math.floor(triggers.length / 2) : triggers.length - 1;
      const trigger = triggers[index];
      trigger.dataset.visualTarget = "true";
      trigger.scrollIntoView({ block: "center", inline: "center" });
      const table = trigger.closest(".statement-table");
      if (${scenario.scrollTable === true}) table.scrollLeft = table.scrollWidth;
      return { count: triggers.length, index, tableScrollLeft: table ? table.scrollLeft : 0 };
    })()`,
  );

  if (scenario.activation === "hover") {
    await evaluate(browser.cdp, `document.querySelector('[data-visual-target="true"]').dispatchEvent(new MouseEvent("mouseenter"))`);
  } else if (scenario.activation === "tab") {
    await evaluate(
      browser.cdp,
      `(() => {
        const target = document.querySelector('[data-visual-target="true"]');
        const sentinel = document.createElement("button");
        sentinel.type = "button";
        sentinel.dataset.visualTabSentinel = "true";
        sentinel.setAttribute("aria-label", "Sentinela temporária da validação por Tab");
        sentinel.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;padding:0;border:0";
        target.before(sentinel);
        sentinel.focus();
        return document.activeElement === sentinel;
      })()`,
    );
    await browser.cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await browser.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await evaluate(
      browser.cdp,
      `(() => {
        const sentinel = document.querySelector('[data-visual-tab-sentinel="true"]');
        if (sentinel) sentinel.remove();
        return true;
      })()`,
    );
  } else {
    await evaluate(browser.cdp, `document.querySelector('[data-visual-target="true"]').focus()`);
  }

  await sleep(160);
  const measurements = await evaluate(browser.cdp, tooltipMeasurementExpression());
  const filename = `${scenario.name}.png`;
  await screenshot(browser.cdp, join(outputDir, filename));
  const evidence = { ...scenario, screenshot: filename, preparation, measurements };
  tooltips.push(evidence);
  check(measurements.tooltipExists, `${scenario.name}: tooltip missing`, measurements);
  check(measurements.tooltipVisible, `${scenario.name}: tooltip hidden`, measurements);
  check(measurements.tooltipParentIsBody, `${scenario.name}: tooltip is not in body`, measurements);
  check(measurements.insideViewport, `${scenario.name}: tooltip clipped`, measurements);
  check(Boolean(measurements.ariaLabel), `${scenario.name}: aria-label missing`, measurements);
  check(Boolean(measurements.describedBy), `${scenario.name}: aria-describedby missing`, measurements);
  if (scenario.activation === "tab") check(measurements.activeIsTarget, `${scenario.name}: Tab did not focus indicator`, measurements);
  if (scenario.scrollTable) check(measurements.tableScrollLeft > 0, `${scenario.name}: table did not scroll`, measurements);
}

function check(condition, message, context) {
  if (!condition) failures.push({ message, context });
}
