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

if (!chromePath) throw new Error("CHROME_BIN is required for issue 565 visual validation.");

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let fatalError;
let fixture;
let keyboard;
let textResize;
let urlState;
let discriminantStates;

try {
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  fixture = await createFixture(browser.cdp);
  const route = `/inbox?kind=transaction_extraction&status=pending_review&confidence=all`;
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await waitForReviewCard(browser.cdp, fixture.suggestionId);

  for (const [width, height] of [
    [390, 844],
    [768, 1024],
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
      evidence.actionsMeetMinimum,
      `Review action is smaller than 34px at ${width}px`,
      evidence,
    );
    check(evidence.technicalIdHidden, `Technical suggestion id is visible at ${width}px`, evidence);
  }

  await setViewport(browser.cdp, 1366, 900);
  keyboard = await validateKeyboardAndFocus(browser.cdp, fixture.suggestionId);
  check(keyboard.detailsOpenedByKeyboard, "Enter did not open review details", keyboard);
  check(keyboard.detailsFocused, "Review dialog did not expose focused content", keyboard);
  check(keyboard.detailsFocusRestored, "Closing details did not restore focus", keyboard);
  check(keyboard.editOpenedByKeyboard, "Enter did not open review edit dialog", keyboard);
  check(keyboard.editControlFocused, "Editable control did not receive focus", keyboard);
  check(keyboard.editFocusRestored, "Closing edit did not restore focus", keyboard);

  urlState = await validateFilterUrl(browser.cdp);
  check(urlState.confidencePersisted, "Confidence filter was not persisted in URL", urlState);
  check(
    urlState.profilePreserved,
    "profileId preservation contract changed unexpectedly",
    urlState,
  );
  await waitForReviewCard(browser.cdp, fixture.suggestionId);

  discriminantStates = await validateDiscriminantStates(browser.cdp, fixture.suggestionId);
  await screenshot(browser.cdp, join(outputDir, "issue-565-ai-review-queue-discriminant-final.png"));
  check(discriminantStates.kinds.cardCount === 5, "The five review kinds were not rendered", discriminantStates.kinds);
  check(discriminantStates.kinds.allKindsVisible, "One or more review kind labels are missing", discriminantStates.kinds);
  check(discriminantStates.kinds.editOnlyOnSupportedKinds, "Edit action is exposed on an unsupported kind", discriminantStates.kinds);
  check(discriminantStates.kinds.lowConfidenceVisible, "Low-confidence state was not rendered", discriminantStates.kinds);
  check(discriminantStates.loading.visible, "Loading state was not rendered", discriminantStates.loading);
  check(discriminantStates.empty.visible, "Empty state was not rendered", discriminantStates.empty);
  check(discriminantStates.error.visible, "Generic error state was not rendered", discriminantStates.error);
  check(discriminantStates.error.retryVisible, "Generic error state does not expose retry", discriminantStates.error);
  check(discriminantStates.unavailable.visible, "Temporary-unavailability state was not rendered", discriminantStates.unavailable);
  check(discriminantStates.unavailable.distinctFromError, "Temporary unavailability is not visually/semantically distinct from generic error", discriminantStates.unavailable);
  check(discriminantStates.unavailable.retryVisible, "Temporary unavailability does not expose retry", discriminantStates.unavailable);
  check(discriminantStates.retry.recovered, "Retry did not recover the queue after temporary unavailability", discriminantStates.retry);
  check(discriminantStates.conflict.visible, "Version conflict state was not rendered", discriminantStates.conflict);
  check(discriminantStates.conflict.actionReenabled, "Conflict left the decision action disabled", discriminantStates.conflict);
  await waitForReviewCard(browser.cdp, fixture.suggestionId);

  textResize = await validateTextResize(browser.cdp, fixture.suggestionId);
  await screenshot(browser.cdp, join(outputDir, "issue-565-ai-review-queue-text-200-percent.png"));
  check(textResize.rootFontSize >= 31.5, "Root text size did not reach 200%", textResize);
  check(textResize.cardVisible, "Review card disappeared at 200% text size", textResize);
  check(textResize.actionsVisible, "Review actions disappeared at 200% text size", textResize);
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
  discriminantStates,
  textResize,
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
        actionsMeetMinimum: buttons.length > 0 && buttons.every((button) => button.getBoundingClientRect().height >= 34),
        technicalIdHidden: !document.body.innerText.includes(${JSON.stringify(suggestionId)}),
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

async function validateKeyboardAndFocus(cdp, suggestionId) {
  await evaluate(
    cdp,
    `(() => {
      const button = document.querySelector('[data-review-id="${escapeJs(suggestionId)}"] [data-review-details]');
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
      const button = document.querySelector('[data-review-id="${escapeJs(suggestionId)}"] [data-review-edit]');
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

async function validateDiscriminantStates(cdp, suggestionId) {
  const installed = await evaluate(
    cdp,
    `(async () => {
      const fixtureId = ${JSON.stringify(suggestionId)};
      const originalFetch = window.fetch.bind(window);
      const response = await originalFetch('/api/ai-review-queue?status=all&includeLowConfidence=true');
      const body = await response.json();
      const baseline = (body.suggestions || []).find((item) => item.id === fixtureId);
      if (!baseline) return { ok: false, message: 'Baseline review item not found' };
      window.__issue565OriginalFetch = originalFetch;
      window.__issue565OriginalConfirm = window.confirm;
      window.__issue565BaselineReviewItem = baseline;
      window.__issue565QueueMode = 'baseline';
      const responseFor = (payload, status = 200) => new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' }
      });
      window.fetch = async (input, options) => {
        const url = typeof input === 'string' ? input : input?.url || String(input);
        const method = String(options?.method || input?.method || 'GET').toUpperCase();
        const mode = window.__issue565QueueMode;
        const item = window.__issue565BaselineReviewItem;
        if (url.includes('/api/ai-review-queue?status=all&includeLowConfidence=true')) {
          if (mode === 'loading') {
            await new Promise((resolve) => setTimeout(resolve, 600));
            return responseFor({ suggestions: [item] });
          }
          if (mode === 'empty') return responseFor({ suggestions: [] });
          if (mode === 'error') {
            return responseFor({ error: { code: 'AI_REVIEW_TEST_FAILURE', message: 'Falha persistente de teste.' } }, 500);
          }
          if (mode === 'unavailable') {
            return responseFor({ error: { code: 'AI_PROVIDER_UNAVAILABLE', message: 'Provider indisponível.' } }, 503);
          }
          if (mode === 'kinds') {
            const definitions = [
              ['transaction_extraction', 'Extração de lançamento', 'import', 'normal'],
              ['categorization', 'Categorização', 'rule', 'low_confidence'],
              ['deduplication', 'Possível duplicidade', 'system', 'normal'],
              ['reconciliation', 'Conciliação sugerida', 'system', 'normal'],
              ['insight', 'Insight', 'ai', 'normal']
            ];
            return responseFor({ suggestions: definitions.map(([kind, label, origin, risk], index) => ({
              ...item,
              id: item.id.slice(0, -1) + String(index + 1),
              kind,
              origin,
              risk,
              confidence: risk === 'low_confidence' ? 0.41 : 0.88,
              maskedSummary: label + ' para validação visual',
              explanation: 'Estado discriminante fictício da issue 565.'
            })) });
          }
          return responseFor({ suggestions: [item] });
        }
        if (mode === 'conflict' && method === 'POST' && url.endsWith('/approve')) {
          return responseFor({ error: { code: 'AI_SUGGESTION_PAYLOAD_CONFLICT', message: 'Versão alterada.' } }, 409);
        }
        return originalFetch(input, options);
      };
      return { ok: true };
    })()`,
  );
  assert.equal(installed.ok, true, installed.message || "Could not install issue 565 state harness.");

  try {
    await setQueueHarnessMode(cdp, "kinds", 180);
    const kinds = await evaluate(
      cdp,
      `(() => {
        const cards = [...document.querySelectorAll('.review-card')];
        const labels = cards.map((card) => card.querySelector('.maintenance-summary strong')?.textContent?.trim());
        return {
          cardCount: cards.length,
          labels,
          allKindsVisible: ['Extração de lançamento', 'Categorização', 'Possível duplicidade', 'Conciliação sugerida', 'Insight'].every((label) => labels.includes(label)),
          editOnlyOnSupportedKinds: cards.filter((card) => card.querySelector('[data-review-edit]')).length === 2,
          lowConfidenceVisible: cards.some((card) => card.querySelector('.review-risk')?.textContent?.includes('Baixa confiança')),
          approveCount: cards.filter((card) => card.querySelector('[data-review-approve]')).length,
          rejectCount: cards.filter((card) => card.querySelector('[data-review-reject]')).length
        };
      })()`,
    );
    await screenshot(cdp, join(outputDir, "issue-565-ai-review-queue-five-kinds.png"));

    await setQueueHarnessMode(cdp, "loading", 70);
    const loading = await inspectQueueState(cdp, "Carregando sugestões...");
    await screenshot(cdp, join(outputDir, "issue-565-ai-review-queue-loading.png"));
    await sleep(650);

    await setQueueHarnessMode(cdp, "empty", 160);
    const empty = await evaluate(
      cdp,
      `(() => ({
        visible: Boolean(document.querySelector('.empty-state')) && document.body.innerText.includes('Nenhuma sugestão neste filtro.'),
        text: document.querySelector('.empty-state')?.textContent?.trim() || ''
      }))()`,
    );
    await screenshot(cdp, join(outputDir, "issue-565-ai-review-queue-empty.png"));

    await setQueueHarnessMode(cdp, "error", 160);
    const error = await inspectQueueState(cdp, "Falha persistente de teste.");
    await screenshot(cdp, join(outputDir, "issue-565-ai-review-queue-error.png"));

    await setQueueHarnessMode(cdp, "unavailable", 160);
    const unavailable = await evaluate(
      cdp,
      `(() => {
        const status = document.querySelector('[data-review-queue-status]');
        return {
          visible: Boolean(status) && status.textContent.includes('Fila temporariamente indisponível.'),
          distinctFromError: status?.classList.contains('unavailable') === true && status?.classList.contains('error') === false && status?.getAttribute('role') === 'alert',
          retryVisible: Boolean(status?.querySelector('[data-review-retry]')),
          text: status?.textContent?.trim() || '',
          className: status?.className || '',
          role: status?.getAttribute('role') || ''
        };
      })()`,
    );
    await screenshot(cdp, join(outputDir, "issue-565-ai-review-queue-unavailable.png"));

    const retry = await evaluate(
      cdp,
      `(() => {
        window.__issue565QueueMode = 'baseline';
        const button = document.querySelector('[data-review-queue-status] [data-review-retry]');
        if (!button) return { clicked: false };
        button.click();
        return { clicked: true };
      })()`,
    );
    await sleep(180);
    retry.recovered = retry.clicked && (await evaluate(
      cdp,
      `Boolean(document.querySelector('[data-review-id="${escapeJs(suggestionId)}"]')) && document.querySelector('[data-review-queue-status]')?.textContent?.includes('Fila atualizada.') === true`,
    ));

    await setQueueHarnessMode(cdp, "baseline", 180);
    await evaluate(
      cdp,
      `(() => {
        window.__issue565QueueMode = 'conflict';
        window.confirm = () => true;
        const button = document.querySelector('[data-review-id="${escapeJs(suggestionId)}"] [data-review-approve]');
        if (!button) throw new Error('Approval button not found for conflict state');
        button.click();
        return true;
      })()`,
    );
    await sleep(260);
    const conflict = await evaluate(
      cdp,
      `(() => {
        const card = document.querySelector('[data-review-id="${escapeJs(suggestionId)}"]');
        const status = card?.querySelector('[data-review-row-status]');
        const button = card?.querySelector('[data-review-approve]');
        return {
          visible: Boolean(status) && status.textContent.includes('Esta sugestão mudou. Atualize a fila antes de tentar novamente.'),
          actionReenabled: button?.disabled === false,
          text: status?.textContent?.trim() || ''
        };
      })()`,
    );
    await screenshot(cdp, join(outputDir, "issue-565-ai-review-queue-conflict.png"));

    return { kinds, loading, empty, error, unavailable, retry, conflict };
  } finally {
    await evaluate(
      cdp,
      `(() => {
        if (window.__issue565OriginalFetch) window.fetch = window.__issue565OriginalFetch;
        if (window.__issue565OriginalConfirm) window.confirm = window.__issue565OriginalConfirm;
        delete window.__issue565OriginalFetch;
        delete window.__issue565OriginalConfirm;
        delete window.__issue565BaselineReviewItem;
        delete window.__issue565QueueMode;
        const kind = document.querySelector('[data-review-filter="kind"]');
        const status = document.querySelector('[data-review-filter="status"]');
        const confidence = document.querySelector('[data-review-filter="confidence"]');
        if (kind) kind.value = 'transaction_extraction';
        if (status) status.value = 'pending_review';
        if (confidence) confidence.value = 'all';
        document.querySelector('[data-review-refresh]')?.click();
        return true;
      })()`,
    );
    await sleep(200);
  }
}

async function setQueueHarnessMode(cdp, mode, waitMs) {
  await evaluate(
    cdp,
    `(() => {
      window.__issue565QueueMode = ${JSON.stringify(mode)};
      const kind = document.querySelector('[data-review-filter="kind"]');
      const status = document.querySelector('[data-review-filter="status"]');
      const confidence = document.querySelector('[data-review-filter="confidence"]');
      if (kind) kind.value = 'all';
      if (status) status.value = 'pending_review';
      if (confidence) confidence.value = 'all';
      document.querySelector('[data-review-refresh]')?.click();
      return true;
    })()`,
  );
  await sleep(waitMs);
}

async function inspectQueueState(cdp, expectedText) {
  return evaluate(
    cdp,
    `(() => {
      const status = document.querySelector('[data-review-queue-status]');
      return {
        visible: Boolean(status) && status.textContent.includes(${JSON.stringify(expectedText)}),
        retryVisible: Boolean(status?.querySelector('[data-review-retry]')),
        text: status?.textContent?.trim() || '',
        className: status?.className || '',
        role: status?.getAttribute('role') || ''
      };
    })()`,
  );
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
