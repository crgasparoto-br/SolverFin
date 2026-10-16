import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";
import { validateCardsPage } from "./cards-interface-measurements.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];

if (!chromePath) throw new Error("CHROME_BIN is required for cards visual validation.");
await mkdir(outputDir, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: "unknown",
  failures,
  desktop: undefined,
  filteredEmpty: undefined,
  desktopModal: undefined,
  mobile: undefined,
  mobileModal: undefined,
  compactMobile: undefined,
  compactMobileModal: undefined,
  longContentCompactMobile: undefined,
  longContentDesktop: undefined,
  longContentMobile: undefined,
  filteredEmptyMobile: undefined,
  filteredEmptyCompactMobile: undefined,
  screenshots: [],
};

const validatePage = (cdp, viewportKind, captureName = viewportKind) =>
  validateCardsPage(cdp, viewportKind, captureName, {
    check,
    outputDir,
    validateFirstFoldNegativeControl,
  });

await runViewportSession("desktop", 1366, 768, async (cdp) => {
  report.desktop = await validatePage(cdp, "desktop");
  report.screenshots.push("cards-desktop.png");
  report.filteredEmpty = await validateFilteredEmpty(cdp, "desktop");
  report.screenshots.push("cards-empty-desktop.png");
  report.longContentDesktop = await validateLongDescription(cdp, "desktop");
  report.screenshots.push("cards-long-desktop.png");
  report.desktopModal = await validateModal(cdp, "desktop");
  report.screenshots.push("cards-modal-desktop.png");
});

await runViewportSession("mobile", 390, 844, async (cdp) => {
  report.mobile = await validatePage(cdp, "mobile");
  report.screenshots.push("cards-mobile.png");
  report.longContentMobile = await validateLongDescription(cdp, "mobile");
  report.screenshots.push("cards-long-mobile.png");
  report.filteredEmptyMobile = await validateFilteredEmpty(cdp, "mobile");
  report.screenshots.push("cards-empty-mobile.png");
  report.mobileModal = await validateModal(cdp, "mobile");
  report.screenshots.push("cards-modal-mobile.png");
});

await runViewportSession("compact-mobile", 320, 740, async (cdp) => {
  report.compactMobile = await validatePage(cdp, "mobile", "compact-mobile");
  report.screenshots.push("cards-compact-mobile.png");
  report.longContentCompactMobile = await validateLongDescription(cdp, "compact-mobile");
  report.screenshots.push("cards-long-compact-mobile.png");
  report.filteredEmptyCompactMobile = await validateFilteredEmpty(cdp, "compact-mobile");
  report.screenshots.push("cards-empty-compact-mobile.png");
  report.compactMobileModal = await validateModal(cdp, "mobile", "compact-mobile");
  report.screenshots.push("cards-modal-compact-mobile.png");
});

await writeFile(join(outputDir, "cards-interface.json"), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outputDir, "CARDS-INTERFACE.md"), renderReport(report));

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Cards A3 desktop, filtered-empty, modal and mobile validation passed.");
}

async function runViewportSession(label, width, height, validate) {
  let browser;
  try {
    browser = await launchChrome({ baseUrl, chromePath });
    report.browser = browser.version;
    await setViewport(browser.cdp, width, height);
    await navigateWithRetry(browser.cdp, `${baseUrl}/login`, "login");
    const login = await evaluate(browser.cdp, loginExpression());
    assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
    await openCards(browser.cdp);
    await validate(browser.cdp);
  } catch (error) {
    const details = serializeError(error);
    failures.push({ message: `Cards ${label} validation crashed`, details });
    console.error(`Cards ${label} validation crashed:`, details);
  } finally {
    if (browser) await browser.close(outputDir);
    await sleep(200);
  }
}

async function openCards(cdp) {
  await navigateWithRetry(cdp, `${baseUrl}/cartoes?month=2026-06`, "cards A3");
  await waitFor(cdp, '[data-cards-archetype="A3"]');
  await waitFor(cdp, "[data-purchase-item]");
}

async function validateFirstFoldNegativeControl(cdp, viewportKind) {
  return evaluate(
    cdp,
    `(() => {
      const target = document.querySelector(
        ${JSON.stringify(viewportKind === "desktop" ? "[data-purchase-item]" : ".cards-invoice-primary > strong")}
      );
      if (!target) return { acceptedBefore: false, acceptedDuring: false, acceptedAfter: false };
      const threshold = window.innerHeight * ${viewportKind === "desktop" ? "1" : "0.75"} - ${viewportKind === "desktop" ? "15" : "0"};
      const original = target.style.transform;
      const accepted = () => target.getBoundingClientRect().top < threshold;
      const acceptedBefore = accepted();
      target.style.transform = 'translateY(' + window.innerHeight + 'px)';
      const acceptedDuring = accepted();
      target.style.transform = original;
      return { acceptedBefore, acceptedDuring, acceptedAfter: accepted(), threshold };
    })()`,
  );
}

async function validateFilteredEmpty(cdp, captureName) {
  const current = await evaluate(cdp, "window.location.href");
  const filteredUrl = new URL(current);
  filteredUrl.searchParams.set("q", "__solverfin_no_purchase_matches__");
  await navigateWithRetry(cdp, filteredUrl.toString(), "cards filtered empty");
  await waitFor(cdp, "[data-purchase-filter-empty]");

  const result = await evaluate(
    cdp,
    `(() => ({
      rowCount: document.querySelectorAll('[data-purchase-item]').length,
      emptyVisible: Boolean(document.querySelector('[data-purchase-filter-empty] .sf-state-panel[data-state="empty"]')),
      status: document.querySelector('[data-purchase-results-status]')?.textContent?.trim() || '',
      query: document.querySelector('[data-purchase-search]')?.value || '',
    }))()`,
  );
  check(result.rowCount === 0, "Filtered empty state still renders purchase rows", result);
  check(result.emptyVisible, "Filtered purchase empty state is not visible", result);
  check(result.status.startsWith("0 "), "Filtered result count is not zero", result);
  check(
    result.query === "__solverfin_no_purchase_matches__",
    "Filtered query is not preserved",
    result,
  );

  await screenshot(cdp, join(outputDir, `cards-empty-${captureName}.png`));
  await openCards(cdp);
  return result;
}

async function validateLongDescription(cdp, captureName) {
  const original = await evaluate(
    cdp,
    `(() => {
      const description = document.querySelector('[data-purchase-item] .cards-purchase-description strong');
      if (!description) return null;
      const html = description.innerHTML;
      description.textContent = 'Assinatura internacional recorrente com uma descricao operacional extensa para validar leitura integral, valor e moeda sem truncamento no extrato do cartao';
      return html;
    })()`,
  );
  assert.notEqual(original, null, "No purchase description for long-content validation");
  await sleep(80);
  const result = await evaluate(
    cdp,
    `(() => {
      const text = document.querySelector('[data-purchase-item] .cards-purchase-description strong');
      const amount = document.querySelector('[data-purchase-item] .cards-purchase-amount');
      const row = document.querySelector('[data-purchase-item]');
      const style = getComputedStyle(text);
      const descriptionRect = text.getBoundingClientRect();
      const amountRect = amount.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      return {
        viewport: window.innerWidth,
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        whiteSpace: style.whiteSpace,
        ellipsis: style.textOverflow === 'ellipsis',
        lineWrap: descriptionRect.height > (parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.35) * 1.4,
        rowInViewport: rowRect.left >= -1 && rowRect.right <= window.innerWidth + 1,
        amountVisible: amountRect.width > 0 && amountRect.right <= window.innerWidth + 1,
        currencyVisible: Boolean(amount.querySelector('.sf-money[data-currency]')),
      };
    })()`,
  );
  check(result.noHorizontalOverflow, "Long description causes horizontal overflow", result);
  check(
    result.whiteSpace !== "nowrap" && !result.ellipsis && result.lineWrap,
    "Long description is truncated",
    result,
  );
  check(
    result.rowInViewport && result.amountVisible && result.currencyVisible,
    "Long description hides actions, values or currency",
    result,
  );
  await screenshot(cdp, join(outputDir, `cards-long-${captureName}.png`));
  await evaluate(
    cdp,
    `(() => {
      const description = document.querySelector('[data-purchase-item] .cards-purchase-description strong');
      if (description) description.innerHTML = ${JSON.stringify(original)};
    })()`,
  );
  return result;
}

async function validateModal(cdp, viewportKind, captureName = viewportKind) {
  await evaluate(cdp, `document.querySelector('[data-open-modal="purchase"]')?.click()`);
  await waitFor(cdp, 'dialog[data-modal="purchase"][open]');
  const measurements = await evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector('dialog[data-modal="purchase"]');
      const close = dialog?.querySelector('[data-close-modal]');
      const form = dialog?.querySelector('form[data-purchase-form]');
      const rect = dialog?.getBoundingClientRect();
      const style = form ? getComputedStyle(form) : undefined;
      const buttons = Array.from(form?.querySelectorAll('button') || []);
      return {
        visible: Boolean(dialog?.open),
        labelled: Boolean(dialog?.getAttribute('aria-labelledby')),
        insideViewport: Boolean(rect && rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1),
        closeTarget: close?.getBoundingClientRect().height || 0,
        closeIconText: close?.textContent?.trim() || "",
        closeIconColor: close ? getComputedStyle(close).color : "",
        dialogBackground: dialog ? getComputedStyle(dialog).backgroundColor : "",
        closeIconOpacity: close ? Number(getComputedStyle(close).opacity) : 0,
        singleColumn: style?.gridTemplateColumns ? style.gridTemplateColumns.split(' ').length === 1 : false,
        minimumActionHeight: buttons.length ? Math.min(...buttons.map((button) => button.getBoundingClientRect().height)) : 0,
      };
    })()`,
  );
  check(measurements.visible, "Purchase modal did not open", measurements);
  check(measurements.labelled, "Purchase modal is not labelled", measurements);
  check(measurements.insideViewport, "Purchase modal exceeds the viewport", measurements);
  check(measurements.closeTarget >= 40, "Purchase modal close action is too small", measurements);
  check(
    measurements.closeIconText === "×" &&
      measurements.closeIconOpacity > 0 &&
      measurements.closeIconColor !== measurements.dialogBackground,
    "Purchase modal close icon is missing or visually indistinguishable",
    measurements,
  );
  // An invisible close icon must fail: restore the original DOM style.
  const negative = await evaluate(
    cdp,
    `(() => {
    const close = document.querySelector('dialog[data-modal="purchase"] [data-close-modal]');
    const original = close.style.visibility;
    close.style.visibility = 'hidden';
    const rejected = getComputedStyle(close).visibility === 'hidden';
    close.style.visibility = original;
    return { rejected, restored: getComputedStyle(close).visibility === 'visible' };
  })()`,
  );
  check(
    negative.rejected && negative.restored,
    "Close icon negative control did not reject and restore",
    negative,
  );
  if (viewportKind === "mobile") {
    check(measurements.singleColumn, "Purchase modal is not single-column on mobile", measurements);
    check(
      measurements.minimumActionHeight >= 40,
      "Purchase modal action is too small on mobile",
      measurements,
    );
  }
  await screenshot(cdp, join(outputDir, `cards-modal-${captureName}.png`));
  await evaluate(
    cdp,
    `document.querySelector('dialog[data-modal="purchase"] [data-close-modal]')?.click()`,
  );
  await sleep(80);
  return measurements;
}

async function waitFor(cdp, selector) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = await evaluate(
      cdp,
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
    );
    if (ready) return;
    await sleep(100);
  }
  throw new Error(`Cards selector did not render: ${selector}`);
}

async function navigateWithRetry(cdp, url, label) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await navigate(cdp, url);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      console.warn(`Navigation to ${label} failed on attempt ${attempt}; retrying.`);
      await sleep(350 * attempt);
    }
  }
}

function serializeError(error) {
  if (error instanceof Error)
    return { name: error.name, message: error.message, stack: error.stack ?? "" };
  return { name: "UnknownError", message: String(error), stack: "" };
}

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}

function renderReport(value) {
  const status = value.failures.length === 0 ? "APPROVED" : "FAILED";
  return `# Cards A3 interface validation\n\n- Status: **${status}**\n- Browser: ${value.browser}\n- Commit: ${value.commit}\n- Screenshots: ${value.screenshots.join(", ")}\n- Failures: ${value.failures.length}\n`;
}
