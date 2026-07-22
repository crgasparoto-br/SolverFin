import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];

if (!chromePath) {
  throw new Error("CHROME_BIN is required for Inbox accessibility validation.");
}

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let report;
let fatalError;

try {
  report = await validateInboxAccessibility(browser.cdp);
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

const evidence = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  failures,
  fatalError,
  ...report,
};
await writeFile(
  join(outputDir, "issue-525-inbox-accessibility.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  if (fatalError?.stack) console.error(fatalError.stack);
  process.exitCode = 1;
} else {
  console.log("Inbox accessibility and candidate-state validation passed.");
}

async function validateInboxAccessibility(cdp) {
  await setViewport(cdp, 1366, 768);
  await navigate(cdp, `${baseUrl}/login`);
  const login = await evaluate(cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  const fixtures = await createFixtures(cdp);

  await navigate(
    cdp,
    `${baseUrl}/inbox?importBatchId=${encodeURIComponent(fixtures.simpleBatchId)}`,
  );
  await waitFor(cdp, `document.querySelectorAll('.import-row').length >= 10`);

  const desktop = await inspectOperationalViewport(cdp, {
    width: 1366,
    height: 768,
    screenshotName: "issue-525-inbox-accessibility-desktop-1366x768.png",
    verifyLabelActivation: true,
  });
  validateOperationalMetrics(desktop, { requireFiveRows: true });

  const tablet = await inspectOperationalViewport(cdp, {
    width: 768,
    height: 1024,
    screenshotName: "issue-525-inbox-accessibility-tablet-768x1024.png",
  });
  validateOperationalMetrics(tablet, { requireFiveRows: false });

  const mobile = await inspectOperationalViewport(cdp, {
    width: 390,
    height: 844,
    screenshotName: "issue-525-inbox-accessibility-mobile-390x844.png",
  });
  validateOperationalMetrics(mobile, { requireFiveRows: false });

  const candidate = await validateCandidateState(cdp, fixtures.candidateBatchId);

  return {
    simpleBatchId: fixtures.simpleBatchId,
    candidateBatchId: fixtures.candidateBatchId,
    desktop,
    tablet,
    mobile,
    candidate,
  };
}

async function createFixtures(cdp) {
  const fixture = await evaluate(
    cdp,
    `(async () => {
      const readJson = async (response) => ({
        ok: response.ok,
        status: response.status,
        body: await response.json().catch(() => ({}))
      });
      const accountsResponse = await readJson(await fetch('/api/accounts'));
      if (!accountsResponse.ok) return accountsResponse;
      const account = (accountsResponse.body.accounts || []).find((item) => item.status === 'active');
      if (!account) return { ok: false, status: 0, body: { error: 'No active account available' } };

      const suffix = Date.now().toString(36);
      const simpleRows = Array.from({ length: 10 }, (_, index) => {
        const day = String(index + 1).padStart(2, '0');
        const description = index === 3
          ? 'Descrição extensa para comprovar legibilidade operacional e manter todas as ações essenciais visíveis ' + suffix
          : 'Linha acessível ' + String(index + 1) + ' ' + suffix;
        const amount = index % 3 === 0 ? String(100 + index) + '.50' : '-' + String(20 + index) + '.75';
        return '2026-07-' + day + ',' + description + ',' + amount;
      });
      const simple = await readJson(await fetch('/api/import-batches/csv', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          originalFileName: 'issue-525-accessible-' + suffix + '.csv',
          content: ['date,description,amount', ...simpleRows].join('\\n'),
          accountId: account.id,
          consentAccepted: true
        })
      }));
      if (!simple.ok) return simple;

      const candidateDescription = 'Candidato visual extenso para validar hierarquia, associação de ações e responsividade ' + suffix;
      const transaction = await readJson(await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'expense',
          amountMinor: 4321,
          occurredOn: '2026-07-20',
          accountId: account.id,
          description: candidateDescription
        })
      }));
      if (!transaction.ok) return transaction;

      const candidateBatch = await readJson(await fetch('/api/import-batches/csv', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          originalFileName: 'issue-525-candidate-' + suffix + '.csv',
          content: 'date,description,amount\\n2026-07-20,' + candidateDescription + ',-43.21',
          accountId: account.id,
          consentAccepted: true
        })
      }));
      if (!candidateBatch.ok) return candidateBatch;

      const candidateBatchId = candidateBatch.body.importBatch.id;
      const scan = await readJson(await fetch('/api/import-batches/' + encodeURIComponent(candidateBatchId) + '/detect-duplicates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' }
      }));
      if (!scan.ok) return scan;
      const candidateCount = [
        ...(scan.body.deduplicationSuggestions || []),
        ...(scan.body.reconciliationSuggestions || [])
      ].length;
      return {
        ok: candidateCount > 0,
        status: candidateCount > 0 ? 200 : 0,
        body: {
          simpleBatchId: simple.body.importBatch.id,
          candidateBatchId,
          candidateCount
        }
      };
    })()`,
  );

  assert.equal(
    fixture.ok,
    true,
    `Issue 525 accessibility fixture failed: ${fixture.status} ${JSON.stringify(fixture.body)}`,
  );
  return fixture.body;
}

function validateOperationalMetrics(metrics, { requireFiveRows }) {
  check(metrics.bodyFitsViewport, `Inbox overflows horizontally at ${metrics.viewport}`, metrics);
  check(metrics.checkboxesMeetMinimum, `Checkbox target is smaller than 24x24 at ${metrics.viewport}`, metrics);
  check(metrics.buttonsMeetDesignSystem, `Visible action is shorter than 34px at ${metrics.viewport}`, metrics);
  check(metrics.operationalTextIsLegible, `Operational label is smaller than 11px at ${metrics.viewport}`, metrics);
  check(metrics.actionsFitViewport, `Action overflows at ${metrics.viewport}`, metrics);
  if (requireFiveRows) {
    check(
      metrics.completeRows >= 5,
      `Expected at least 5 complete rows at ${metrics.viewport}, found ${metrics.completeRows}`,
      metrics,
    );
    check(metrics.labelActivatesCheckbox, "Bulk label does not activate its checkbox", metrics);
  }
}

async function inspectOperationalViewport(
  cdp,
  { width, height, screenshotName, verifyLabelActivation = false },
) {
  await setViewport(cdp, width, height);
  await evaluate(cdp, `(() => { window.scrollTo(0, 0); return true; })()`);
  await sleep(250);

  const metrics = await evaluate(
    cdp,
    `(() => {
      const visible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const withinViewport = (element) => {
        if (!visible(element)) return false;
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
      };
      const rows = [...document.querySelectorAll('.import-row')];
      const checkboxes = [...document.querySelectorAll('.bulk-actions input[type="checkbox"], .import-row input[type="checkbox"]')].filter(visible);
      const buttons = [...document.querySelectorAll('.inbox-page button, .inbox-page .button-link')].filter(visible);
      const operationalText = [...document.querySelectorAll('.row-summary dt, .row-heading .status-pill')].filter(visible);
      const dimensions = (elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height), text: (element.textContent || '').trim() };
      });
      let labelActivatesCheckbox = null;
      if (${verifyLabelActivation ? "true" : "false"}) {
        const label = document.querySelector('.bulk-actions > label');
        const checkbox = label?.querySelector('input[type="checkbox"]');
        if (label && checkbox) {
          const before = checkbox.checked;
          label.click();
          labelActivatesCheckbox = checkbox.checked !== before;
          label.click();
        }
      }
      return {
        viewport: window.innerWidth + 'x' + window.innerHeight,
        bodyFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        completeRows: rows.filter(withinViewport).length,
        checkboxesMeetMinimum: checkboxes.length > 0 && checkboxes.every((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width >= 24 && rect.height >= 24;
        }),
        buttonsMeetDesignSystem: buttons.length > 0 && buttons.every((element) => element.getBoundingClientRect().height >= 34),
        operationalTextIsLegible: operationalText.length > 0 && operationalText.every((element) => parseFloat(getComputedStyle(element).fontSize) >= 11),
        actionsFitViewport: buttons.every((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= window.innerWidth;
        }),
        labelActivatesCheckbox,
        checkboxDimensions: dimensions(checkboxes.slice(0, 4)),
        buttonDimensions: dimensions(buttons.slice(0, 12)),
        operationalFontSizes: operationalText.slice(0, 12).map((element) => ({
          text: (element.textContent || '').trim(),
          fontSize: getComputedStyle(element).fontSize
        })),
        rowRects: rows.slice(0, 6).map((row) => {
          const rect = row.getBoundingClientRect();
          return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height) };
        })
      };
    })()`,
  );

  await screenshot(cdp, join(outputDir, screenshotName));
  return { ...metrics, screenshot: screenshotName };
}

async function validateCandidateState(cdp, batchId) {
  await setViewport(cdp, 1366, 768);
  await navigate(cdp, `${baseUrl}/inbox?importBatchId=${encodeURIComponent(batchId)}`);
  await waitFor(cdp, `Boolean(document.querySelector('.candidate-card'))`);

  const desktop = await inspectCandidateViewport(
    cdp,
    1366,
    768,
    "issue-525-inbox-candidate-desktop-1366x768.png",
  );
  validateCandidateMetrics(desktop);

  const mobile = await inspectCandidateViewport(
    cdp,
    390,
    844,
    "issue-525-inbox-candidate-mobile-390x844.png",
  );
  validateCandidateMetrics(mobile);

  return { desktop, mobile };
}

function validateCandidateMetrics(metrics) {
  check(metrics.bodyFitsViewport, `Candidate state overflows at ${metrics.viewport}`, metrics);
  check(metrics.hasPendingState, `Candidate row lacks pending state at ${metrics.viewport}`, metrics);
  check(metrics.actionsAssociated, `Candidate actions are not associated with one candidate at ${metrics.viewport}`, metrics);
  check(metrics.actionsVisible, `Candidate actions are not visible at ${metrics.viewport}`, metrics);
  check(metrics.actionsMeetDesignSystem, `Candidate action is shorter than 34px at ${metrics.viewport}`, metrics);
  check(metrics.actionsFitViewport, `Candidate action overflows at ${metrics.viewport}`, metrics);
  check(metrics.focusIsVisible, `Candidate action lacks visible keyboard focus at ${metrics.viewport}`, metrics);
  check(metrics.visuallySubordinate, `Candidate card dominates its parent row at ${metrics.viewport}`, metrics);
}

async function inspectCandidateViewport(cdp, width, height, screenshotName) {
  await setViewport(cdp, width, height);
  await evaluate(cdp, `(() => { window.scrollTo(0, 0); return true; })()`);
  await sleep(250);

  const metrics = await evaluate(
    cdp,
    `(() => {
      const card = document.querySelector('.candidate-card');
      const row = card?.closest('.import-row');
      const buttons = card ? [...card.querySelectorAll('[data-candidate-action]')] : [];
      const firstButton = buttons[0];
      firstButton?.focus();
      const cardRect = card?.getBoundingClientRect();
      const rowRect = row?.getBoundingClientRect();
      const ids = buttons.map((button) => button.getAttribute('data-candidate-id'));
      return {
        viewport: window.innerWidth + 'x' + window.innerHeight,
        bodyFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        hasPendingState: row?.getAttribute('data-row-state') === 'candidate_pending' && (row?.textContent || '').includes('Decisão pendente'),
        actionsAssociated: buttons.length === 2 && Boolean(ids[0]) && ids.every((id) => id === ids[0]),
        actionsVisible: buttons.map((button) => (button.textContent || '').trim()).includes('Confirmar') && buttons.map((button) => (button.textContent || '').trim()).includes('Ignorar candidato'),
        actionsMeetDesignSystem: buttons.length === 2 && buttons.every((button) => button.getBoundingClientRect().height >= 34),
        actionsFitViewport: buttons.every((button) => {
          const rect = button.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= window.innerWidth;
        }),
        focusIsVisible: document.activeElement === firstButton && firstButton ? getComputedStyle(firstButton).boxShadow !== 'none' : false,
        visuallySubordinate: Boolean(cardRect && rowRect && cardRect.width <= rowRect.width && cardRect.height <= 240),
        rowState: row?.getAttribute('data-row-state') || '',
        cardText: (card?.textContent || '').trim(),
        cardRect: cardRect ? { width: Math.round(cardRect.width), height: Math.round(cardRect.height) } : null,
        rowRect: rowRect ? { width: Math.round(rowRect.width), height: Math.round(rowRect.height) } : null,
        actionDimensions: buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          return { text: (button.textContent || '').trim(), width: Math.round(rect.width), height: Math.round(rect.height) };
        })
      };
    })()`,
  );

  await screenshot(cdp, join(outputDir, screenshotName));
  return { ...metrics, screenshot: screenshotName };
}

function check(condition, message, details) {
  if (!condition) failures.push({ message, details });
}

async function waitFor(cdp, expression, timeout = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await evaluate(cdp, expression)) return;
    } catch {
      // The page can briefly replace its execution context while loading.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}
