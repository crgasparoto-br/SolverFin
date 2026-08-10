import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];

if (!chromePath) throw new Error("CHROME_BIN is required for issue 565 state validation.");

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let fatalError;
let fixture;
let evidence;

try {
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  fixture = await createFixture(browser.cdp);
  await navigate(browser.cdp, `${baseUrl}/inbox?status=pending_review&confidence=all`);
  await waitForReviewCard(browser.cdp, fixture.suggestionId);
  await installHarness(browser.cdp, fixture.suggestionId);

  evidence = await validateStates(browser.cdp, fixture.suggestionId);
  check(evidence.kinds.cardCount === 5, "The five review kinds were not rendered", evidence.kinds);
  check(
    evidence.kinds.allKindsVisible,
    "One or more review kind labels are missing",
    evidence.kinds,
  );
  check(
    evidence.kinds.editOnlyOnSupportedKinds,
    "Edit action is exposed on an unsupported kind",
    evidence.kinds,
  );
  check(
    evidence.kinds.lowConfidenceVisible,
    "Low-confidence state was not rendered",
    evidence.kinds,
  );
  check(evidence.loading.visible, "Loading state was not rendered", evidence.loading);
  check(evidence.empty.visible, "Empty state was not rendered", evidence.empty);
  check(evidence.error.visible, "Generic error state was not rendered", evidence.error);
  check(evidence.error.retryVisible, "Generic error state does not expose retry", evidence.error);
  check(
    evidence.unavailable.visible,
    "Temporary-unavailability state was not rendered",
    evidence.unavailable,
  );
  check(
    evidence.unavailable.distinctFromError,
    "Temporary unavailability is not distinct from generic error",
    evidence.unavailable,
  );
  check(
    evidence.unavailable.retryVisible,
    "Temporary unavailability does not expose retry",
    evidence.unavailable,
  );
  check(evidence.retry.recovered, "Retry did not recover the queue", evidence.retry);
  check(evidence.conflict.visible, "Version conflict state was not rendered", evidence.conflict);
  check(
    evidence.conflict.actionReenabled,
    "Conflict left the decision action disabled",
    evidence.conflict,
  );
} catch (error) {
  fatalError = {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  failures.push({ message: fatalError.message, details: fatalError });
} finally {
  await restoreHarness(browser.cdp).catch(() => undefined);
  await browser.close(outputDir);
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  fixture,
  evidence,
  fatalError,
  failures,
};
await writeFile(
  join(outputDir, "issue-565-ai-review-queue-states.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  if (fatalError?.stack) console.error(fatalError.stack);
  process.exitCode = 1;
} else {
  console.log("Issue 565 AI review queue discriminant states validation passed.");
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
          originalFileName: 'issue-565-states-' + suffix + '.csv',
          content: 'date,description,amount\\n2026-08-08,Estados issue 565 ' + suffix + ',-23.45',
          accountId: account.id,
          consentAccepted: true
        })
      }));
      const suggestion = imported.body?.suggestions?.[0];
      return {
        ok: imported.ok && Boolean(suggestion?.id),
        status: imported.status,
        body: { suggestionId: suggestion?.id }
      };
    })()`,
  );
  assert.equal(result.ok, true, `Issue 565 state fixture failed: ${JSON.stringify(result)}`);
  return result.body;
}

async function installHarness(cdp, suggestionId) {
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
            return responseFor({ error: {
              code: 'AI_REVIEW_TEST_FAILURE',
              message: 'Falha persistente de teste.'
            } }, 500);
          }
          if (mode === 'unavailable') {
            return responseFor({ error: {
              code: 'AI_PROVIDER_UNAVAILABLE',
              message: 'Provider indisponível.'
            } }, 503);
          }
          if (mode === 'kinds') {
            const definitions = [
              ['transaction_extraction', 'Extração de lançamento', 'import', 'normal'],
              ['categorization', 'Categorização', 'rule', 'low_confidence'],
              ['deduplication', 'Possível duplicidade', 'system', 'normal'],
              ['reconciliation', 'Conciliação sugerida', 'system', 'normal'],
              ['insight', 'Insight', 'ai', 'normal']
            ];
            const suggestions = definitions.map(([kind, label, origin, risk], index) => ({
              ...item,
              id: item.id.slice(0, -1) + String(index + 1),
              kind,
              origin,
              risk,
              confidence: risk === 'low_confidence' ? 0.41 : 0.88,
              maskedSummary: label + ' para validação visual',
              explanation: 'Estado discriminante fictício da issue 565.'
            }));
            return responseFor({ suggestions });
          }
          return responseFor({ suggestions: [item] });
        }
        if (mode === 'conflict' && method === 'POST' && url.endsWith('/approve')) {
          return responseFor({ error: {
            code: 'AI_SUGGESTION_PAYLOAD_CONFLICT',
            message: 'Versão alterada.'
          } }, 409);
        }
        return originalFetch(input, options);
      };
      return { ok: true };
    })()`,
  );
  assert.equal(installed.ok, true, installed.message || "Could not install state harness.");
}

async function validateStates(cdp, suggestionId) {
  await setQueueMode(cdp, "kinds", 180);
  const kinds = await evaluate(
    cdp,
    `(() => {
      const cards = [...document.querySelectorAll('.review-card')];
      const labels = cards.map((card) =>
        card.querySelector('.maintenance-summary strong')?.textContent?.trim()
      );
      const expected = [
        'Extração de lançamento',
        'Categorização',
        'Possível duplicidade',
        'Conciliação sugerida',
        'Insight'
      ];
      return {
        cardCount: cards.length,
        allKindsVisible: expected.every((label) => labels.includes(label)),
        editOnlyOnSupportedKinds: cards.filter((card) => card.querySelector('[data-review-edit]')).length === 2,
        lowConfidenceVisible: cards.some((card) =>
          card.querySelector('.review-risk')?.textContent?.includes('Baixa confiança')
        )
      };
    })()`,
  );
  await screenshot(cdp, join(outputDir, "issue-565-ai-review-queue-five-kinds.png"));

  await setQueueMode(cdp, "loading", 70);
  const loading = await inspectQueueStatus(cdp, "Carregando sugestões...");
  await screenshot(cdp, join(outputDir, "issue-565-ai-review-queue-loading.png"));
  await sleep(650);

  await setQueueMode(cdp, "empty", 160);
  const empty = await evaluate(
    cdp,
    `(() => ({
      visible: Boolean(document.querySelector('.empty-state')) &&
        document.body.innerText.includes('Nenhuma sugestão neste filtro.')
    }))()`,
  );
  await screenshot(cdp, join(outputDir, "issue-565-ai-review-queue-empty.png"));

  await setQueueMode(cdp, "error", 160);
  const error = await inspectQueueStatus(cdp, "Falha persistente de teste.");
  await screenshot(cdp, join(outputDir, "issue-565-ai-review-queue-error.png"));

  await setQueueMode(cdp, "unavailable", 160);
  const unavailable = await evaluate(
    cdp,
    `(() => {
      const status = document.querySelector('[data-review-queue-status]');
      return {
        visible: Boolean(status) && status.textContent.includes('Fila temporariamente indisponível.'),
        distinctFromError: status?.classList.contains('unavailable') === true &&
          status?.classList.contains('error') === false && status?.getAttribute('role') === 'alert',
        retryVisible: Boolean(status?.querySelector('[data-review-retry]'))
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
  const recovered = await evaluate(
    cdp,
    `Boolean(document.querySelector('[data-review-id="${escapeJs(suggestionId)}"]')) &&
      document.querySelector('[data-review-queue-status]')?.textContent?.includes('Fila atualizada.') === true`,
  );
  retry.recovered = retry.clicked && recovered;

  await setQueueMode(cdp, "baseline", 180);
  await evaluate(
    cdp,
    `(() => {
      window.__issue565QueueMode = 'conflict';
      window.confirm = () => true;
      const button = document.querySelector(
        '[data-review-id="${escapeJs(suggestionId)}"] [data-review-approve]'
      );
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
        visible: Boolean(status) && status.textContent.includes(
          'Esta sugestão mudou. Atualize a fila antes de tentar novamente.'
        ),
        actionReenabled: button?.disabled === false
      };
    })()`,
  );
  await screenshot(cdp, join(outputDir, "issue-565-ai-review-queue-conflict.png"));

  return { kinds, loading, empty, error, unavailable, retry, conflict };
}

async function setQueueMode(cdp, mode, waitMs) {
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

async function inspectQueueStatus(cdp, expectedText) {
  return evaluate(
    cdp,
    `(() => {
      const status = document.querySelector('[data-review-queue-status]');
      return {
        visible: Boolean(status) && status.textContent.includes(${JSON.stringify(expectedText)}),
        retryVisible: Boolean(status?.querySelector('[data-review-retry]'))
      };
    })()`,
  );
}

async function restoreHarness(cdp) {
  await evaluate(
    cdp,
    `(() => {
      if (window.__issue565OriginalFetch) window.fetch = window.__issue565OriginalFetch;
      if (window.__issue565OriginalConfirm) window.confirm = window.__issue565OriginalConfirm;
      delete window.__issue565OriginalFetch;
      delete window.__issue565OriginalConfirm;
      delete window.__issue565BaselineReviewItem;
      delete window.__issue565QueueMode;
      return true;
    })()`,
  );
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

function escapeJs(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function check(condition, message, details) {
  if (!condition) failures.push({ message, details });
}
