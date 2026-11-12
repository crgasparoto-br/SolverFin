import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;

if (!chromePath) {
  throw new Error("CHROME_BIN is required for issue 568 in-flight cancellation validation.");
}

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let result;
let fatalError;

try {
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  await navigate(browser.cdp, `${baseUrl}/assistente`);
  await waitForAssistant(browser.cdp);
  await ensureConversation(browser.cdp);
  await installInFlightMessageControl(browser.cdp);
  await submitHeldMessage(browser.cdp);

  await waitFor(
    () =>
      evaluate(browser.cdp, `(() => window.__issue568CancelInflight?.messagePending === true)()`),
    5_000,
    "held financial assistant message request",
  );

  const beforeCancel = await evaluate(
    browser.cdp,
    `(() => ({
      ariaBusy: document.querySelector('[data-financial-assistant]')?.getAttribute('aria-busy'),
      cancelDisabled: document.querySelector('[data-assistant-cancel]')?.disabled ?? true,
      conversationId: document.querySelector('[data-financial-assistant]')?.getAttribute('data-conversation-id') || ''
    }))()`,
  );
  assert.equal(beforeCancel.ariaBusy, "true");
  assert.equal(beforeCancel.cancelDisabled, false);
  assert.ok(beforeCancel.conversationId);

  await evaluate(
    browser.cdp,
    `(() => {
      const button = document.querySelector('[data-assistant-cancel]');
      if (!(button instanceof HTMLButtonElement)) throw new Error('Cancel button not found.');
      button.click();
    })()`,
  );

  await waitFor(
    () =>
      evaluate(browser.cdp, `(() => window.__issue568CancelInflight?.cancelObserved === true)()`),
    5_000,
    "cancel request while message request is pending",
  );
  await waitFor(
    () =>
      evaluate(
        browser.cdp,
        `(() => document.querySelector('[data-assistant-status]')?.textContent?.includes('Contexto cancelado'))()`,
      ),
    5_000,
    "cancelled assistant context",
  );
  await sleep(100);

  result = await evaluate(
    browser.cdp,
    `(() => ({
      ...window.__issue568CancelInflight,
      status: document.querySelector('[data-assistant-status]')?.textContent || '',
      ariaBusy: document.querySelector('[data-financial-assistant]')?.getAttribute('aria-busy'),
      cancelDisabled: document.querySelector('[data-assistant-cancel]')?.disabled ?? false
    }))()`,
  );
  assert.equal(result.cancelWhileMessagePending, true);
  assert.equal(result.messageReleasedByCancel, true);
  assert.match(result.status, /Contexto cancelado/);
  assert.equal(result.cancelDisabled, true);
} catch (error) {
  fatalError = {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
} finally {
  await browser.close(outputDir);
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  result,
  fatalError,
};
await writeFile(
  join(outputDir, "issue-568-financial-assistant-cancel-inflight.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (fatalError) {
  console.error(fatalError.stack ?? fatalError.message);
  process.exitCode = 1;
} else {
  console.log("Issue 568 in-flight cancellation validation passed.");
}

async function waitForAssistant(cdp, timeout = 10_000) {
  await waitFor(
    () =>
      evaluate(
        cdp,
        `(() => Boolean(
          document.querySelector('[data-financial-assistant]') &&
          document.querySelector('[data-assistant-input]')
        ))()`,
      ),
    timeout,
    "financial assistant layout",
  );
}

async function ensureConversation(cdp) {
  const existing = await evaluate(
    cdp,
    `(() => document.querySelector('[data-financial-assistant]')?.getAttribute('data-conversation-id') || '')()`,
  );
  if (!existing) {
    await evaluate(
      cdp,
      `(() => {
        const button = document.querySelector('[data-assistant-new]');
        if (!(button instanceof HTMLButtonElement)) throw new Error('New-context button not found.');
        button.click();
      })()`,
    );
    await waitFor(
      () =>
        evaluate(
          cdp,
          `(() => Boolean(document.querySelector('[data-financial-assistant]')?.getAttribute('data-conversation-id')))()`,
        ),
      5_000,
      "new assistant conversation",
    );
  }
  await waitFor(
    () =>
      evaluate(
        cdp,
        `(() => {
          const root = document.querySelector('[data-financial-assistant]');
          const submit = document.querySelector('[data-assistant-submit]');
          return Boolean(
            root &&
            root.getAttribute('aria-busy') !== 'true' &&
            submit instanceof HTMLButtonElement &&
            !submit.disabled
          );
        })()`,
      ),
    5_000,
    "assistant composer ready",
  );
  return evaluate(
    cdp,
    `(() => document.querySelector('[data-financial-assistant]')?.getAttribute('data-conversation-id') || '')()`,
  );
}

async function installInFlightMessageControl(cdp) {
  await evaluate(
    cdp,
    `(() => {
      const originalFetch = window.fetch.bind(window);
      const state = {
        messagePending: false,
        cancelObserved: false,
        cancelWhileMessagePending: false,
        messageReleasedByCancel: false,
        releaseMessage: null
      };
      window.__issue568CancelInflight = state;
      window.fetch = async (input, init) => {
        const target = String(input);
        if (
          target.includes('/api/financial-assistant/conversations/') &&
          target.includes('/messages') &&
          String(init?.method || 'GET').toUpperCase() === 'POST' &&
          !state.messagePending
        ) {
          state.messagePending = true;
          return new Promise((resolve) => {
            state.releaseMessage = resolve;
          });
        }
        if (
          target.includes('/api/financial-assistant/conversations/') &&
          target.includes('/cancel') &&
          String(init?.method || 'GET').toUpperCase() === 'POST'
        ) {
          state.cancelObserved = true;
          state.cancelWhileMessagePending = state.messagePending;
          const response = await originalFetch(input, init);
          const payload = await response.clone().json();
          if (state.releaseMessage) {
            state.messagePending = false;
            state.messageReleasedByCancel = true;
            state.releaseMessage(
              new Response(JSON.stringify(payload), {
                status: response.status,
                headers: { 'content-type': 'application/json' }
              }),
            );
            state.releaseMessage = null;
          }
          return response;
        }
        return originalFetch(input, init);
      };
    })()`,
  );
}

async function submitHeldMessage(cdp) {
  await evaluate(
    cdp,
    `(() => {
      const input = document.querySelector('[data-assistant-input]');
      const form = document.querySelector('[data-assistant-form]');
      if (!(input instanceof HTMLTextAreaElement) || !(form instanceof HTMLFormElement)) {
        throw new Error('Assistant composer not found.');
      }
      input.value = 'Qual meu saldo projetado este mes?';
      form.requestSubmit();
    })()`,
  );
}

async function waitFor(condition, timeout, label) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await condition()) return;
    } catch {
      // Rendering can replace the execution context briefly.
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
