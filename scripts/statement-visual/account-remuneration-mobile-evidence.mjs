import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  evaluate,
  launchChrome,
  navigate,
  screenshot,
  setViewport,
  sleep,
} from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir =
  process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const evidencePath = join(outputDir, "issue-490-account-remuneration.json");
const screenshotPath = join(outputDir, "issue-490-cdi-collapsed-mobile.png");

if (!chromePath)
  throw new Error("CHROME_BIN is required for visual validation.");

const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
const transactionId = evidence.fixture?.firstId;
const route = evidence.route;

if (!transactionId || !route) {
  throw new Error(
    "Issue 490 evidence does not contain the transaction and route to review.",
  );
}

const browser = await launchChrome({ baseUrl, chromePath });

try {
  await setViewport(browser.cdp, 390, 1000);
  await navigate(browser.cdp, `${baseUrl}/login`);

  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(
    login.ok,
    true,
    `Demo login failed: ${login.status} ${login.body}`,
  );

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

  await screenshot(browser.cdp, screenshotPath);

  evidence.focusedMobile = focusedMobile;
  evidence.reviewCorrections = {
    collapsedMobileRowVisible: true,
    disclosureIndicatorVisible: true,
    disclosureFontMinimumPx: 12,
  };
  evidence.screenshots = Array.from(
    new Set([
      ...(Array.isArray(evidence.screenshots) ? evidence.screenshots : []),
      "issue-490-cdi-collapsed-mobile.png",
    ]),
  );
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  await browser.close(outputDir);
}
