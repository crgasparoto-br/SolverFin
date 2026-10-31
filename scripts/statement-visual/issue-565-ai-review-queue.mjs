import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";
import {
  validateEvidenceNegativeControl,
  validateFingerprintBinding,
  validateHierarchyNegative,
  validateLongEvidence,
  validateReviewCardGridNegative,
  validateGoldenInboxControls,
} from "./issue-726-inbox-controls.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];
const captures = [];

if (!chromePath) throw new Error("CHROME_BIN is required for issue 565 visual validation.");

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let fatalError;
let fixture;
let keyboard;
let textResize;
let urlState;
let evidenceNegative;
let fingerprintChecks;
let hierarchyNegative;
let longEvidence;
const reviewCardGridNegatives = [];
const goldenScreenControls = [];

try {
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  fixture = await createFixture(browser.cdp);
  const route = `/inbox?kind=transaction_extraction&status=pending_review&confidence=all`;
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await waitForReviewCard(browser.cdp, fixture.suggestionId);
  await selectAndWaitForEvidence(browser.cdp, fixture.suggestionId);

  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1366, 768],
    [1440, 900],
    [1366, 900],
  ]) {
    await setViewport(browser.cdp, width, height);
    await sleep(220);
    const evidence = await inspectViewport(browser.cdp, fixture.suggestionId, width, height);
    const screenshotName = `issue-565-ai-review-queue-${width}x${height}.png`;
    await screenshot(browser.cdp, join(outputDir, screenshotName));
    captures.push({ ...evidence, screenshot: screenshotName });

    check(evidence.cardVisible, `Review card is not visible at ${width}px`, evidence);
    check(evidence.filtersVisible, `Review filters are not visible at ${width}px`, evidence);
    check(evidence.bodyFitsViewport, `Review queue overflows horizontally at ${width}px`, evidence);
    check(evidence.actionsFitViewport, `Review action escapes viewport at ${width}px`, evidence);
    check(
      evidence.actionsContainedInCards,
      `Review button escapes its card at ${width}px`,
      evidence,
    );
    check(
      evidence.actionsMeetMinimum,
      `Review action is smaller than 34px at ${width}px`,
      evidence,
    );
    if ((width === 390 && height === 844) || (width === 1366 && height === 768)) {
      const golden = await validateGoldenInboxControls(browser.cdp);
      goldenScreenControls.push({ viewport: `${width}x${height}`, ...golden });
      check(
        golden.complete &&
          golden.tokenMatch &&
          golden.hasNeutralLinks &&
          golden.financialDirectionColorFromTokens &&
          golden.selectedAriaPressed === "true" &&
          golden.disabledOpacity < 1 &&
          golden.focusStyleDefined &&
          golden.contrast.every((ratio) => ratio >= 4.5) &&
          golden.row.minTouchHeight &&
          golden.nav.minTouchHeight &&
          golden.trigger.minTouchHeight &&
          golden.refresh.minTouchHeight &&
          golden.menuKeyboard.opened &&
          golden.menuKeyboard.closed &&
          golden.menuKeyboard.focusRestored,
        `Golden Screen controls diverge in ${width}px Inbox`,
        golden,
      );
      const negative = await validateReviewCardGridNegative(browser.cdp, fixture.suggestionId);
      reviewCardGridNegatives.push({ viewport: `${width}x${height}`, ...negative });
      check(
        negative.baseline.contained &&
          negative.baseline.hitTarget &&
          negative.attackRejected &&
          negative.restorationPassed,
        `Legacy three-column grid escaped the review-card control at ${width}px`,
        negative,
      );
    }
    check(evidence.technicalIdHidden, `Technical suggestion id is visible at ${width}px`, evidence);
    check(evidence.selectedEvidenceReady, `Selected evidence is not ready at ${width}px`, evidence);
    check(
      evidence.decisionAfterEvidence,
      `Decision appears before evidence at ${width}px`,
      evidence,
    );
    check(
      evidence.detailActionsFitViewport,
      `Contextual decision overflows at ${width}px`,
      evidence,
    );
    check(
      evidence.secondaryBelowReview,
      `Import/secondary content precedes the review at ${width}px`,
      evidence,
    );
  }

  await setViewport(browser.cdp, 1366, 900);
  keyboard = await validateKeyboardAndFocus(browser.cdp, fixture.suggestionId);
  check(keyboard.detailsOpenedByKeyboard, "Enter did not open review details", keyboard);
  check(keyboard.detailsFocused, "Review dialog did not expose focused content", keyboard);
  check(keyboard.detailsFocusRestored, "Closing details did not restore focus", keyboard);
  check(keyboard.editOpenedByKeyboard, "Enter did not open review edit dialog", keyboard);
  check(keyboard.editControlFocused, "Editable control did not receive focus", keyboard);
  check(keyboard.editFocusRestored, "Closing edit did not restore focus", keyboard);
  evidenceNegative = await validateEvidenceNegativeControl(browser.cdp);
  check(
    evidenceNegative.hiddenEvidenceBlockedDecision,
    "Hidden evidence did not block contextual decision",
    evidenceNegative,
  );
  check(
    evidenceNegative.evidenceRestored,
    "Evidence visibility was not restored after negative control",
    evidenceNegative,
  );

  fingerprintChecks = await validateFingerprintBinding(browser.cdp);
  check(
    fingerprintChecks.every((item) => item.ok),
    "A review decision was not bound to displayed evidence",
    fingerprintChecks,
  );
  hierarchyNegative = await validateHierarchyNegative(browser.cdp);
  check(
    hierarchyNegative.baseline && hierarchyNegative.attackRejected && hierarchyNegative.restored,
    "Moving imports above review was not detected by the visual order guard",
    hierarchyNegative,
  );
  longEvidence = await validateLongEvidence(browser.cdp, outputDir);
  check(
    longEvidence.every(
      (item) => item.bodyFitsViewport && item.decisionFitsViewport && item.evidenceBeforeDecision,
    ),
    "Long evidence displaces contextual decisions at narrow viewports",
    longEvidence,
  );

  urlState = await validateFilterUrl(browser.cdp);
  check(urlState.confidencePersisted, "Confidence filter was not persisted in URL", urlState);
  check(
    urlState.profilePreserved,
    "profileId preservation contract changed unexpectedly",
    urlState,
  );
  await waitForReviewCard(browser.cdp, fixture.suggestionId);

  textResize = await validateTextResize(browser.cdp, fixture.suggestionId);
  await screenshot(browser.cdp, join(outputDir, "issue-565-ai-review-queue-text-200-percent.png"));
  check(textResize.rootFontSize >= 31.5, "Root text size did not reach 200%", textResize);
  check(textResize.cardVisible, "Review card disappeared at 200% text size", textResize);
  check(textResize.actionsVisible, "Review actions disappeared at 200% text size", textResize);
  check(
    textResize.actionsContainedInCards,
    "Review buttons overflow their cards at 200% text size",
    textResize,
  );
  check(textResize.bodyFitsViewport, "Review queue overflows at 200% text size", textResize);
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
  fixture,
  captures,
  keyboard,
  urlState,
  textResize,
  evidenceNegative,
  fingerprintChecks,
  hierarchyNegative,
  longEvidence,
  reviewCardGridNegatives,
  goldenScreenControls,
  fatalError,
  failures,
};
await writeFile(
  join(outputDir, "issue-565-ai-review-queue.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  if (fatalError?.stack) console.error(fatalError.stack);
  process.exitCode = 1;
} else {
  console.log("Issue 565 AI review queue visual validation passed.");
}

async function createFixture(cdp) {
  const result = await evaluate(
    cdp,
    `(async () => {
      const readJson = async (response) => ({
        ok: response.ok,
        status: response.status,
        body: await response.json().catch(() => ({}))
      });
      const accounts = await readJson(await fetch('/api/accounts'));
      if (!accounts.ok) return accounts;
      const account = (accounts.body.accounts || []).find((item) => item.status === 'active');
      if (!account) return { ok: false, status: 0, body: { error: 'No active account available' } };
      const suffix = Date.now().toString(36);
      const imported = await readJson(await fetch('/api/import-batches/csv', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          originalFileName: 'issue-565-review-' + suffix + '.csv',
          content: 'date,description,amount\\n2026-08-07,Revisão visual issue 565 ' + suffix + ',-37.42',
          accountId: account.id,
          consentAccepted: true
        })
      }));
      const suggestion = imported.body?.suggestions?.[0];
      return {
        ok: imported.ok && Boolean(suggestion?.id),
        status: imported.status,
        body: {
          suggestionId: suggestion?.id,
          accountId: account.id,
          description: suggestion?.explanation || 'Revisão visual issue 565'
        }
      };
    })()`,
  );

  assert.equal(
    result.ok,
    true,
    `Issue 565 visual fixture failed: ${result.status} ${JSON.stringify(result.body)}`,
  );
  return result.body;
}

async function waitForReviewCard(cdp, suggestionId, timeout = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const ready = await evaluate(
      cdp,
      `Boolean(document.querySelector('[data-review-id="${escapeJs(suggestionId)}"]'))`,
    ).catch(() => false);
    if (ready) return;
    await sleep(120);
  }
  throw new Error(`Timed out waiting for review card ${suggestionId}`);
}

async function inspectViewport(cdp, suggestionId, width, height) {
  return evaluate(
    cdp,
    `(() => {
      const card = document.querySelector('[data-review-id="${escapeJs(suggestionId)}"]');
      const visible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const buttons = card ? [...card.querySelectorAll('button')].filter(visible) : [];
      const reviewCards = [...document.querySelectorAll('.inbox-review-queue .review-card')];
      const actionsContainedInCards = reviewCards.length > 0 && reviewCards.every((row) => {
        const rowRect = row.getBoundingClientRect();
        return [...row.querySelectorAll('[data-review-select]')].every((action) => {
          const actionRect = action.getBoundingClientRect();
          return actionRect.width >= 44 && actionRect.height >= 44 &&
            actionRect.left >= rowRect.left - 1 && actionRect.right <= rowRect.right + 1;
        });
      });
      const selected = document.getElementById('inbox-review-selected');
      const evidence = selected?.querySelector('[data-review-evidence="ready"]');
      const decision = selected?.querySelector('[data-review-approve]');
      const decisionButtons = selected ? [...selected.querySelectorAll('.review-decision-actions button')].filter(visible) : [];
      const reviewLayout = document.querySelector('.inbox-review-cockpit .sf-detail-layout');
      const secondary = document.querySelector('.inbox-review-secondary');
      const filters = [...document.querySelectorAll('[data-review-filter]')].filter(visible);
      return {
        viewport: ${JSON.stringify(`${width}x${height}`)},
        cardVisible: visible(card),
        filtersVisible: filters.length === 3,
        bodyFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        actionsFitViewport: buttons.length > 0 && buttons.every((button) => {
          const rect = button.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= window.innerWidth;
        }),
        actionsContainedInCards,
        actionsMeetMinimum: buttons.length > 0 && buttons.every((button) => button.getBoundingClientRect().height >= 34),
        technicalIdHidden: !document.body.innerText.includes(${JSON.stringify(suggestionId)}),
        selectedEvidenceReady: selected?.dataset.reviewEvidenceState === 'ready' && visible(evidence),
        decisionAfterEvidence: Boolean(evidence && decision && (evidence.compareDocumentPosition(decision) & Node.DOCUMENT_POSITION_FOLLOWING)),
        detailActionsFitViewport: decisionButtons.length > 0 && decisionButtons.every((button) => { const rect = button.getBoundingClientRect(); return rect.left >= 0 && rect.right <= window.innerWidth && rect.height >= 34; }),
        secondaryBelowReview: Boolean(reviewLayout && secondary) && secondary.getBoundingClientRect().top >= reviewLayout.getBoundingClientRect().bottom,
        buttonLabels: buttons.map((button) => (button.textContent || '').trim()),
        filterValues: filters.map((filter) => filter.value),
        cardRect: card ? (() => {
          const rect = card.getBoundingClientRect();
          return { left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), height: Math.round(rect.height) };
        })() : null
      };
    })()`,
  );
}

async function selectAndWaitForEvidence(cdp, suggestionId, timeout = 12_000) {
  await evaluate(
    cdp,
    `document.querySelector('[data-review-id="${escapeJs(suggestionId)}"] [data-review-select]')?.click()`,
  );
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const ready = await evaluate(
      cdp,
      `(() => {
      const row = document.querySelector('[data-review-id="${escapeJs(suggestionId)}"] [data-review-select]');
      return row?.getAttribute('aria-pressed') === 'true' &&
        document.getElementById('inbox-review-selected')?.dataset.reviewEvidenceState === 'ready';
    })()`,
    ).catch(() => false);
    if (ready) return;
    await sleep(120);
  }
  throw new Error("Selected review evidence did not become available.");
}

async function validateKeyboardAndFocus(cdp, suggestionId) {
  await evaluate(
    cdp,
    `(() => {
      const button = document.querySelector('#inbox-review-selected [data-review-details]');
      if (!button) throw new Error('Details button not found');
      button.dataset.issue565Trigger = 'details';
      button.focus();
      return document.activeElement === button;
    })()`,
  );
  await pressKey(cdp, "Enter", "Enter", 13);
  await waitForDialog(cdp);
  const detailsOpenedByKeyboard = await evaluate(
    cdp,
    `document.getElementById('ai-review-dialog')?.open === true`,
  );
  const detailsFocused = await evaluate(
    cdp,
    `document.activeElement?.closest?.('#ai-review-dialog') !== null`,
  );
  await pressKey(cdp, "Escape", "Escape", 27);
  await sleep(120);
  const detailsFocusRestored = await evaluate(
    cdp,
    `document.activeElement?.dataset?.issue565Trigger === 'details'`,
  );

  await evaluate(
    cdp,
    `(() => {
      const button = document.querySelector('#inbox-review-selected [data-review-edit]');
      if (!button) throw new Error('Edit button not found');
      button.dataset.issue565Trigger = 'edit';
      button.focus();
      return document.activeElement === button;
    })()`,
  );
  await pressKey(cdp, "Enter", "Enter", 13);
  await waitForDialog(cdp, true);
  const editOpenedByKeyboard = await evaluate(
    cdp,
    `Boolean(document.querySelector('#ai-review-dialog[open] [data-review-edit-form]'))`,
  );
  const editControlFocused = await evaluate(
    cdp,
    `Boolean(document.activeElement?.closest?.('[data-review-edit-form]'))`,
  );
  await pressKey(cdp, "Escape", "Escape", 27);
  await sleep(120);
  const editFocusRestored = await evaluate(
    cdp,
    `document.activeElement?.dataset?.issue565Trigger === 'edit'`,
  );

  return {
    detailsOpenedByKeyboard,
    detailsFocused,
    detailsFocusRestored,
    editOpenedByKeyboard,
    editControlFocused,
    editFocusRestored,
  };
}

async function validateFilterUrl(cdp) {
  const before = await evaluate(cdp, `window.location.search`);
  const originalConfidence = await evaluate(
    cdp,
    `document.querySelector('[data-review-filter="confidence"]')?.value || 'all'`,
  );
  await evaluate(
    cdp,
    `(() => {
      const filter = document.querySelector('[data-review-filter="confidence"]');
      filter.value = 'low';
      filter.dispatchEvent(new Event('change', { bubbles: true }));
      return window.location.search;
    })()`,
  );
  await sleep(80);
  const after = await evaluate(cdp, `window.location.search`);
  const profileBefore = new URLSearchParams(before).get("profileId");
  const profileAfter = new URLSearchParams(after).get("profileId");
  await evaluate(
    cdp,
    `(() => {
      const filter = document.querySelector('[data-review-filter="confidence"]');
      filter.value = ${JSON.stringify(originalConfidence)};
      filter.dispatchEvent(new Event('change', { bubbles: true }));
      return window.location.search;
    })()`,
  );
  await sleep(80);
  return {
    before,
    after,
    confidencePersisted: new URLSearchParams(after).get("confidence") === "low",
    profilePreserved: profileBefore === profileAfter,
  };
}

async function validateTextResize(cdp, suggestionId) {
  await evaluate(
    cdp,
    `(() => {
      document.documentElement.dataset.issue565OriginalFontSize = document.documentElement.style.fontSize || '';
      document.documentElement.style.fontSize = '200%';
      window.scrollTo(0, 0);
      return true;
    })()`,
  );
  await sleep(220);
  const metrics = await evaluate(
    cdp,
    `(() => {
      const card = document.querySelector('[data-review-id="${escapeJs(suggestionId)}"]');
      const buttons = card ? [...card.querySelectorAll('button')] : [];
      const visible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      return {
        rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
        cardVisible: visible(card),
        actionsVisible: buttons.length > 0 && buttons.every(visible),
        actionsContainedInCards: buttons.length > 0 && buttons.every((button) => {
          const row = button.closest('.review-card');
          const rect = button.getBoundingClientRect();
          const outer = row?.getBoundingClientRect();
          return Boolean(outer) && rect.left >= outer.left - 1 && rect.right <= outer.right + 1;
        }),
        bodyFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        cardText: (card?.textContent || '').trim().slice(0, 240)
      };
    })()`,
  );
  await evaluate(
    cdp,
    `(() => {
      document.documentElement.style.fontSize = document.documentElement.dataset.issue565OriginalFontSize || '';
      delete document.documentElement.dataset.issue565OriginalFontSize;
      return true;
    })()`,
  );
  return metrics;
}

async function waitForDialog(cdp, requireForm = false, timeout = 8_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const ready = await evaluate(
      cdp,
      requireForm
        ? `Boolean(document.querySelector('#ai-review-dialog[open] [data-review-edit-form]'))`
        : `Boolean(document.querySelector('#ai-review-dialog[open] #ai-review-dialog-body'))`,
    ).catch(() => false);
    if (ready) return;
    await sleep(100);
  }
  throw new Error("Timed out waiting for AI review dialog");
}

async function pressKey(cdp, key, code, keyCode) {
  const params = {
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  };
  const keyDown =
    key === "Enter"
      ? { type: "keyDown", text: "\r", unmodifiedText: "\r", ...params }
      : { type: "rawKeyDown", ...params };
  await cdp.send("Input.dispatchKeyEvent", keyDown);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...params });
  await sleep(80);
}

function escapeJs(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function check(condition, message, details) {
  if (!condition) failures.push({ message, details });
}
