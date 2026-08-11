import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];
const captures = [];

if (!chromePath) throw new Error("CHROME_BIN is required for issue 567 visual validation.");

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let fatalError;
let fixture;
let navigation;

try {
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  fixture = await createFixture(browser.cdp);
  const route = `/inbox?kind=insight&status=pending_review&confidence=all`;
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await waitForStructuredInsight(browser.cdp, fixture.suggestionId);

  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1366, 900],
  ]) {
    await setViewport(browser.cdp, width, height);
    await scrollInsightIntoView(browser.cdp, fixture.suggestionId);
    await sleep(220);
    const evidence = await inspectInsight(browser.cdp, fixture.suggestionId, width, height);
    const screenshotName = `issue-567-financial-insights-${width}x${height}.png`;
    await screenshot(browser.cdp, join(outputDir, screenshotName));
    captures.push({ ...evidence, screenshot: screenshotName });

    check(evidence.cardVisible, `Insight card is not visible in the viewport at ${width}px`, evidence);
    check(
      evidence.structuredPayloadVisible,
      `Structured insight content is not visible in the viewport at ${width}px`,
      evidence,
    );
    check(
      evidence.cardFitsHorizontally,
      `Insight card exceeds the horizontal viewport at ${width}px`,
      evidence,
    );
    check(evidence.bodyFitsViewport, `Insight card overflows horizontally at ${width}px`, evidence);
    check(evidence.hasEvidenceSection, `Evidence section is missing at ${width}px`, evidence);
    check(evidence.hasIncome, `Income evidence is missing at ${width}px`, evidence);
    check(evidence.hasExpense, `Expense evidence is missing at ${width}px`, evidence);
    check(evidence.hasBalance, `Balance evidence is missing at ${width}px`, evidence);
    check(evidence.hasLimitations, `Limitations are missing at ${width}px`, evidence);
    check(evidence.navigationRendered, `Financial navigation is missing at ${width}px`, evidence);
    check(
      evidence.internalFingerprintHidden,
      `Internal fingerprint is visible at ${width}px`,
      evidence,
    );
  }

  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await waitForStructuredInsight(browser.cdp, fixture.suggestionId);
  await scrollInsightIntoView(browser.cdp, fixture.suggestionId);
  navigation = await exerciseNavigation(browser.cdp, fixture.suggestionId);
  const expectedMonth = fixture.periodStartOn.slice(0, 7);
  check(
    navigation.linkHref === `/lancamentos?month=${expectedMonth}`,
    "Insight navigation does not preserve the insight period in /lancamentos",
    navigation,
  );
  check(
    navigation.pathname === "/lancamentos",
    "Insight navigation did not open /lancamentos",
    navigation,
  );
  check(
    navigation.month === expectedMonth,
    "Insight navigation did not preserve the expected month query",
    navigation,
  );
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
  navigation,
  fatalError,
  failures,
};
await writeFile(
  join(outputDir, "issue-567-financial-insights.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  if (fatalError?.stack) console.error(fatalError.stack);
  process.exitCode = 1;
} else {
  console.log("Issue 567 financial insights visual validation passed.");
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

      const now = new Date();
      const day = Math.max(1, Math.min(now.getUTCDate(), 5));
      const currentDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
      const previousDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day));
      const dateOnly = (value) => value.toISOString().slice(0, 10);
      const suffix = Date.now().toString(36);
      const createTransaction = async (kind, amountMinor, occurredOn, description) =>
        readJson(await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind, amountMinor, occurredOn, accountId: account.id, description })
        }));

      const income = await createTransaction('income', 32100, dateOnly(currentDate), 'Issue 567 receita visual ' + suffix);
      if (!income.ok) return income;
      const currentExpense = await createTransaction('expense', 12300, dateOnly(currentDate), 'Issue 567 despesa visual ' + suffix);
      if (!currentExpense.ok) return currentExpense;
      const previousExpense = await createTransaction('expense', 8200, dateOnly(previousDate), 'Issue 567 despesa anterior visual ' + suffix);
      if (!previousExpense.ok) return previousExpense;

      const queue = await readJson(await fetch('/api/ai-review-queue?kind=insight&status=pending_review&includeLowConfidence=true'));
      if (!queue.ok) return queue;
      for (const suggestion of queue.body.suggestions || []) {
        const detail = await readJson(await fetch('/api/ai-review-queue/' + encodeURIComponent(suggestion.id) + '/payload'));
        const proposal = detail.body?.payload?.proposal;
        if (detail.ok && proposal?.insightKind === 'monthly_summary') {
          return {
            ok: true,
            status: 200,
            body: {
              suggestionId: suggestion.id,
              currency: proposal.currency,
              periodStartOn: proposal.periodStartOn,
              evidenceLabels: (proposal.evidence || []).map((item) => item.label),
              limitations: proposal.limitations || [],
              navigation: proposal.navigation
            }
          };
        }
      }
      return { ok: false, status: 0, body: { error: 'No monthly_summary V2 insight found' } };
    })()`,
  );

  assert.equal(
    result.ok,
    true,
    `Issue 567 visual fixture failed: ${result.status} ${JSON.stringify(result.body)}`,
  );
  return result.body;
}

async function waitForStructuredInsight(cdp, suggestionId, timeout = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const ready = await evaluate(
      cdp,
      `(() => {
        const card = document.querySelector('[data-review-id="${suggestionId}"]');
        return Boolean(card?.querySelector('[data-ai-structured-payload="true"]'));
      })()`,
    ).catch(() => false);
    if (ready) return;
    await sleep(120);
  }
  throw new Error(`Timed out waiting for issue 567 insight ${suggestionId}`);
}

async function scrollInsightIntoView(cdp, suggestionId) {
  const scrolled = await evaluate(
    cdp,
    `(() => {
      const card = document.querySelector('[data-review-id="${suggestionId}"]');
      if (!card) return false;
      card.scrollIntoView({ block: 'center', inline: 'nearest' });
      return true;
    })()`,
  );
  assert.equal(scrolled, true, `Insight card ${suggestionId} was not found for visual capture.`);
}

async function inspectInsight(cdp, suggestionId, width, height) {
  return evaluate(
    cdp,
    `(() => {
      const card = document.querySelector('[data-review-id="${suggestionId}"]');
      const structured = card?.querySelector('[data-ai-structured-payload="true"]');
      const text = (card?.innerText || '');
      const navigation = card?.querySelector('[data-insight-navigation="true"]');
      const layoutVisible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const inViewport = (element) => {
        if (!layoutVisible(element)) return false;
        const rect = element.getBoundingClientRect();
        return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
      };
      const cardRect = card?.getBoundingClientRect();
      return {
        viewport: ${JSON.stringify(`${width}x${height}`)},
        cardVisible: inViewport(card),
        structuredPayloadVisible: inViewport(structured),
        cardFitsHorizontally: Boolean(cardRect && cardRect.left >= 0 && cardRect.right <= window.innerWidth),
        cardBounds: cardRect
          ? { top: cardRect.top, right: cardRect.right, bottom: cardRect.bottom, left: cardRect.left, width: cardRect.width, height: cardRect.height }
          : undefined,
        bodyFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        hasEvidenceSection: text.includes('Evidências verificáveis'),
        hasIncome: text.includes('receitas:'),
        hasExpense: text.includes('despesas:'),
        hasBalance: text.includes('saldo:'),
        hasLimitations: text.includes('Limitações'),
        navigationRendered: layoutVisible(navigation) && (navigation.getAttribute('href') || '').startsWith('/lancamentos?month='),
        internalFingerprintHidden: !text.includes('financial-insights-v2') && !text.includes('sha256-'),
        excerpt: text.slice(0, 800)
      };
    })()`,
  );
}

async function exerciseNavigation(cdp, suggestionId) {
  const linkHref = await evaluate(
    cdp,
    `(() => {
      const card = document.querySelector('[data-review-id="${suggestionId}"]');
      const link = card?.querySelector('[data-insight-navigation="true"]');
      if (!link) throw new Error('Insight navigation link not found');
      const href = link.getAttribute('href');
      link.click();
      return href;
    })()`,
  );
  await sleep(300);
  const location = await evaluate(
    cdp,
    `({
      pathname: window.location.pathname,
      search: window.location.search,
      month: new URLSearchParams(window.location.search).get('month')
    })`,
  );
  return { linkHref, ...location };
}

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}
