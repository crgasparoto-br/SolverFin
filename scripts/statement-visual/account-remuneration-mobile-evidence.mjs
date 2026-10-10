import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";
import { rectanglesOverlap } from "./rectangles-overlap.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const evidencePath = join(outputDir, "issue-490-account-remuneration.json");
const mobileScreenshotPath = join(outputDir, "issue-490-cdi-collapsed-mobile.png");
const desktopScreenshotPath = join(outputDir, "issue-490-cdi-column-isolation-1366.png");
const desktopWidths = [1280, 1366, 1440, 1920];

if (!chromePath) throw new Error("CHROME_BIN is required for visual validation.");

const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
const transactionId = evidence.fixture?.firstId;
const route = evidence.route;

if (!transactionId || !route) {
  throw new Error("Issue 490 evidence does not contain the transaction and route to review.");
}

const browser = await launchChrome({ baseUrl, chromePath });
const desktopColumnIsolation = [];

async function persistColumnDiagnostics(failure) {
  evidence.desktopColumnIsolation = desktopColumnIsolation;
  if (failure) evidence.columnIsolationFailure = failure;
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

try {
  await setViewport(browser.cdp, 1366, 1000);
  await navigate(browser.cdp, `${baseUrl}/login`);

  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  for (const width of desktopWidths) {
    await setViewport(browser.cdp, width, 1000);
    await navigate(browser.cdp, `${baseUrl}${route}`);
    await sleep(250);

    const collapsed = await evaluate(browser.cdp, desktopColumnIsolationExpression(transactionId));
    desktopColumnIsolation.push({ width, collapsed });
    await persistColumnDiagnostics();
    assert.equal(
      collapsed.overlapsCategory,
      false,
      `Collapsed CDI content overlaps the category at ${width}px: ${JSON.stringify(collapsed)}`,
    );
    await evaluate(
      browser.cdp,
      `(() => {
        const row = document.querySelector('script[data-transaction="${transactionId}"]')?.closest(".statement-row.statement-body");
        const details = row?.querySelector("details.account-remuneration-audit");
        if (!details) throw new Error("Remuneration disclosure was not found");
        details.open = true;
      })()`,
    );
    await sleep(80);

    const expanded = await evaluate(browser.cdp, desktopColumnIsolationExpression(transactionId));
    desktopColumnIsolation[desktopColumnIsolation.length - 1].expanded = expanded;
    await persistColumnDiagnostics();
    assert.equal(
      expanded.overlapsCategory,
      false,
      `Expanded CDI content overlaps the category at ${width}px: ${JSON.stringify(expanded)}`,
    );
    assert.equal(
      expanded.detailOverflow,
      false,
      `Expanded CDI details overflow their box at ${width}px: ${JSON.stringify(expanded)}`,
    );

    if (width === 1280) {
      const previousStyle = await evaluate(
        browser.cdp,
        `(() => {
          const row = document.querySelector('script[data-transaction="${transactionId}"]')?.closest(".statement-row.statement-body");
          const category = row.querySelector(".col-category");
          const rect = row.querySelector(".description > strong").getBoundingClientRect();
          const previous = category.getAttribute("style");
          category.style.cssText = "position:fixed!important;z-index:9999!important;left:" + rect.left + "px!important;top:" + rect.top + "px!important;width:100px!important;height:20px!important";
          return previous;
        })()`,
      );
      try {
        const collision = await evaluate(
          browser.cdp,
          desktopColumnIsolationExpression(transactionId),
        );
        assert.equal(
          collision.overlapsCategory,
          true,
          "Overlap probe must reject a real collision.",
        );
        evidence.categoryOverlapNegativeControl = { status: "passed", collision };
      } finally {
        await evaluate(
          browser.cdp,
          `(() => {
            const row = document.querySelector('script[data-transaction="${transactionId}"]')?.closest(".statement-row.statement-body");
            const category = row.querySelector(".col-category");
            const previous = ${JSON.stringify(previousStyle)};
            if (previous === null) category.removeAttribute("style");
            else category.setAttribute("style", previous);
          })()`,
        );
      }
      const restored = await evaluate(browser.cdp, desktopColumnIsolationExpression(transactionId));
      assert.equal(restored.overlapsCategory, false, "Category geometry must be restored.");
    }

    if (width === 1366) {
      await evaluate(
        browser.cdp,
        `(() => {
          const row = document.querySelector('script[data-transaction="${transactionId}"]')?.closest(".statement-row.statement-body");
          const details = row?.querySelector("details.account-remuneration-audit");
          if (details) details.open = false;
        })()`,
      );
      await screenshot(browser.cdp, desktopScreenshotPath);
    }
  }

  await setViewport(browser.cdp, 390, 1000);
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(350);

  await evaluate(
    browser.cdp,
    `(() => {
      const row = document.querySelector('script[data-transaction="${transactionId}"]')?.closest(".statement-row.statement-body");
      if (!row) throw new Error("Remuneration row was not found for focused mobile evidence");
      row.scrollIntoView({ block: "center", inline: "nearest" });
    })()`,
  );
  await sleep(150);

  const focusedMobile = await evaluate(
    browser.cdp,
    `(() => {
      const row = document.querySelector('script[data-transaction="${transactionId}"]')?.closest(".statement-row.statement-body");
      if (!row) throw new Error("Remuneration row was not found after scrolling");
      const details = row.querySelector("details.account-remuneration-audit");
      const summary = details?.querySelector(":scope > summary");
      const title = row.querySelector(".description > strong");
      const rowRect = row.getBoundingClientRect();
      const summaryRect = summary?.getBoundingClientRect();
      const summaryStyle = summary ? getComputedStyle(summary) : undefined;
      const markerContent = summary ? getComputedStyle(summary, "::before").content : "";
      return {
        title: (title?.textContent || "").trim(),
        detailsOpen: Boolean(details?.open),
        rowVisible: rowRect.top >= 0 && rowRect.bottom <= window.innerHeight,
        summaryVisible: Boolean(summaryRect && summaryRect.top >= 0 && summaryRect.bottom <= window.innerHeight),
        summaryFontPx: summaryStyle ? Number.parseFloat(summaryStyle.fontSize) : 0,
        markerContent,
        globalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        rowOverflow: row.scrollWidth > row.clientWidth + 1,
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight
      };
    })()`,
  );

  assert.equal(focusedMobile.title, "Remuneração CDI");
  assert.equal(focusedMobile.detailsOpen, false);
  assert.equal(focusedMobile.rowVisible, true);
  assert.equal(focusedMobile.summaryVisible, true);
  assert.equal(focusedMobile.globalOverflow, false);
  assert.equal(focusedMobile.rowOverflow, false);
  assert.ok(
    focusedMobile.summaryFontPx >= 12,
    `Disclosure text is too small: ${focusedMobile.summaryFontPx}px`,
  );
  assert.notEqual(focusedMobile.markerContent, "none");
  assert.notEqual(focusedMobile.markerContent, "normal");
  assert.notEqual(focusedMobile.markerContent, '""');

  await screenshot(browser.cdp, mobileScreenshotPath);

  evidence.focusedMobile = focusedMobile;
  evidence.desktopColumnIsolation = desktopColumnIsolation;
  evidence.reviewCorrections = {
    collapsedMobileRowVisible: true,
    disclosureIndicatorVisible: true,
    disclosureFontMinimumPx: 12,
    desktopColumnIsolationWidths: desktopWidths,
    collapsedAndExpandedCategoryOverlap: false,
  };
  evidence.screenshots = Array.from(
    new Set([
      ...(Array.isArray(evidence.screenshots) ? evidence.screenshots : []),
      "issue-490-cdi-collapsed-mobile.png",
      "issue-490-cdi-column-isolation-1366.png",
    ]),
  );
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
} catch (error) {
  await persistColumnDiagnostics({
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
  });
  throw error;
} finally {
  await browser.close(outputDir);
}

function desktopColumnIsolationExpression(id) {
  return `(() => {
    const row = document.querySelector('script[data-transaction="${id}"]')?.closest(".statement-row.statement-body");
    if (!row) throw new Error("Remuneration row was not found for desktop column validation");
    const description = row.querySelector(".description");
    const category = row.querySelector(".col-category");
    const title = description?.querySelector(":scope > strong");
    const details = description?.querySelector("details.account-remuneration-audit");
    const disclosure = details?.querySelector(":scope > summary");
    const compactSummary = description?.querySelector(".account-remuneration-summary");
    const detailContent = details?.querySelector(".account-remuneration-audit-content");
    if (!description || !category || !title || !details || !disclosure || !compactSummary) {
      throw new Error("Required CDI cells were not found for desktop column validation");
    }
    const intersects = ${rectanglesOverlap.toString()};
    function textRects(node) {
      const range = document.createRange();
      range.selectNodeContents(node);
      return Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
    }
    const categoryRect = category.getBoundingClientRect();
    const contentRects = [title, disclosure, compactSummary].flatMap(textRects);
    if (details.open && detailContent) contentRects.push(detailContent.getBoundingClientRect());
    if (!contentRects.length || categoryRect.width <= 0 || categoryRect.height <= 0) {
      throw new Error("Required CDI content must be visible for overlap validation");
    }
    const contentRight = Math.max(...contentRects.map((rect) => rect.right));
    const contentBottom = Math.max(...contentRects.map((rect) => rect.bottom));
    return {
      detailsOpen: details.open,
      categoryLeft: categoryRect.left,
      contentRight,
      separationPx: categoryRect.left - contentRight,
      verticalSeparationPx: categoryRect.top - contentBottom,
      overlapsCategory: contentRects.some((rect) => intersects(rect, categoryRect)),
      summaryOverflow: compactSummary.scrollWidth > compactSummary.clientWidth + 1,
      disclosureOverflow: disclosure.scrollWidth > disclosure.clientWidth + 1,
      detailOverflow: Boolean(detailContent && detailContent.scrollWidth > detailContent.clientWidth + 1)
    };
  })()`;
}
