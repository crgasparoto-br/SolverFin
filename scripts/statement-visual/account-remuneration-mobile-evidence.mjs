import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

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

try {
  await setViewport(browser.cdp, 1366, 1000);
  await navigate(browser.cdp, `${baseUrl}/login`);

  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  const desktopColumnIsolation = [];

  for (const width of desktopWidths) {
    await setViewport(browser.cdp, width, 1000);
    await navigate(browser.cdp, `${baseUrl}${route}`);
    await sleep(250);

    const collapsed = await evaluate(browser.cdp, desktopColumnIsolationExpression(transactionId));
    assert.equal(
      collapsed.overlapsCategory,
      false,
      `Collapsed CDI content overlaps the category at ${width}px: ${JSON.stringify(collapsed)}`,
    );
    assert.equal(
      collapsed.summaryOverflow,
      false,
      `Collapsed CDI summary overflows its own box at ${width}px: ${JSON.stringify(collapsed)}`,
    );
    assert.equal(
      collapsed.disclosureOverflow,
      false,
      `Collapsed CDI disclosure overflows its own box at ${width}px: ${JSON.stringify(collapsed)}`,
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

    desktopColumnIsolation.push({ width, collapsed, expanded });

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
    const categoryRect = category.getBoundingClientRect();
    const measured = [title, disclosure, compactSummary, ...(details.open && detailContent ? [detailContent] : [])];
    const contentRight = Math.max(...measured.map((node) => node.getBoundingClientRect().right));
    return {
      detailsOpen: details.open,
      categoryLeft: categoryRect.left,
      contentRight,
      separationPx: categoryRect.left - contentRight,
      overlapsCategory: contentRight > categoryRect.left + 0.5,
      summaryOverflow: compactSummary.scrollWidth > compactSummary.clientWidth + 1,
      disclosureOverflow: disclosure.scrollWidth > disclosure.clientWidth + 1,
      detailOverflow: Boolean(detailContent && detailContent.scrollWidth > detailContent.clientWidth + 1)
    };
  })()`;
}
