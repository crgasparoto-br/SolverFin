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
const interactions = {};

if (!chromePath) throw new Error("CHROME_BIN is required for issue 568 visual validation.");

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let fatalError;

try {
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  await navigate(browser.cdp, `${baseUrl}/assistente`);
  await waitForAssistant(browser.cdp);

  const initial = await inspectAssistant(browser.cdp, "desktop-empty");
  check(initial.routeReady, "Assistant route did not render its operational layout.", initial);
  check(initial.readOnlyVisible, "Read-only boundary is not visible.", initial);
  check(initial.emptyStateVisible, "Initial empty state is not visible.", initial);
  check(initial.bodyFitsViewport, "Assistant overflows horizontally on desktop.", initial);
  captures.push(initial);

  interactions.promptKeyboard = await exercisePromptByKeyboard(browser.cdp);
  check(
    interactions.promptKeyboard.nativeActivationObserved,
    "Enter did not activate a suggested question button.",
    interactions.promptKeyboard,
  );
  check(
    interactions.promptKeyboard.inputFocused,
    "Keyboard prompt activation did not move focus to the composer.",
    interactions.promptKeyboard,
  );

  interactions.clarification = await submitQuestion(browser.cdp, "Resumo", {
    expectStatusIncludes: "Preciso de uma informação adicional",
  });
  check(
    interactions.clarification.questionVisible,
    "Clarification flow did not preserve the submitted question.",
    interactions.clarification,
  );
  check(
    interactions.clarification.responseVisible,
    "Clarification response is not visible in the thread.",
    interactions.clarification,
  );
  check(
    interactions.clarification.inputFocused,
    "Focus did not return to the composer after clarification.",
    interactions.clarification,
  );

  interactions.controlledError = await exerciseControlledError(browser.cdp);
  check(
    interactions.controlledError.controlledErrorVisible,
    "Injected upstream failure was not rendered as a controlled error.",
    interactions.controlledError,
  );
  check(
    interactions.controlledError.inputFocused,
    "Focus did not return to the composer after a controlled error.",
    interactions.controlledError,
  );

  interactions.clear = await clickActionAndWait(browser.cdp, "[data-assistant-clear]", () =>
    evaluate(
      browser.cdp,
      `(() => {
        const root = document.querySelector('[data-financial-assistant]');
        return Boolean(
          root &&
            !root.getAttribute('data-conversation-id') &&
            document.body.innerText.includes('Nenhuma pergunta neste contexto.'),
        );
      })()`,
    ),
  );
  check(
    interactions.clear.completed,
    "Clear action did not reset the conversation.",
    interactions.clear,
  );
  check(
    interactions.clear.inputFocused,
    "Clear action did not restore composer focus.",
    interactions.clear,
  );

  interactions.newContext = await clickActionAndWait(browser.cdp, "[data-assistant-new]", () =>
    evaluate(
      browser.cdp,
      `(() => Boolean(
        document.querySelector('[data-financial-assistant]')?.getAttribute('data-conversation-id')
      ))()`,
    ),
  );
  check(
    interactions.newContext.completed,
    "New-context action did not create an operational conversation.",
    interactions.newContext,
  );
  check(
    interactions.newContext.inputFocused,
    "New-context action did not restore composer focus.",
    interactions.newContext,
  );

  interactions.cancel = await clickActionAndWait(browser.cdp, "[data-assistant-cancel]", () =>
    evaluate(
      browser.cdp,
      `(() => document.querySelector('[data-assistant-status]')?.textContent?.includes(
        'Contexto cancelado'
      ))()`,
    ),
  );
  check(
    interactions.cancel.completed,
    "Cancel action did not reach the cancelled state.",
    interactions.cancel,
  );

  await setViewport(browser.cdp, 390, 844);
  await navigate(browser.cdp, `${baseUrl}/assistente`);
  await waitForAssistant(browser.cdp);
  await sleep(180);
  const mobile = await inspectAssistant(browser.cdp, "mobile-390x844");
  const mobileScreenshot = "issue-568-financial-assistant-mobile-390x844.png";
  await screenshot(browser.cdp, join(outputDir, mobileScreenshot));
  mobile.screenshot = mobileScreenshot;
  captures.push(mobile);
  check(mobile.bodyFitsViewport, "Assistant overflows horizontally at 390px.", mobile);
  check(mobile.composerVisible, "Composer is not visible on mobile.", mobile);
  check(mobile.actionsVisible, "Conversation actions are not visible on mobile.", mobile);
  check(
    mobile.singleColumn,
    "Assistant did not collapse to a single-column mobile layout.",
    mobile,
  );

  // A 683 CSS-pixel viewport plus 2x page scale approximates a 1366px desktop at 200% zoom
  // while still forcing responsive reflow instead of validating only a magnified screenshot.
  await setViewport(browser.cdp, 683, 900);
  await navigate(browser.cdp, `${baseUrl}/assistente`);
  await waitForAssistant(browser.cdp);
  await browser.cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await sleep(180);
  const zoomed = await inspectAssistant(browser.cdp, "zoom-200-percent");
  const zoomScreenshot = "issue-568-financial-assistant-zoom-200.png";
  await screenshot(browser.cdp, join(outputDir, zoomScreenshot));
  zoomed.screenshot = zoomScreenshot;
  captures.push(zoomed);
  check(zoomed.visualScale >= 1.9, "Chrome did not apply approximately 200% page scale.", zoomed);
  check(zoomed.composerVisible, "Composer is not visible at 200% scale.", zoomed);
  check(zoomed.statusVisible, "Conversation status is not visible at 200% scale.", zoomed);
  check(
    zoomed.bodyFitsViewport,
    "Assistant introduces horizontal document overflow at 200% scale.",
    zoomed,
  );
  await browser.cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
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
  captures,
  interactions,
  fatalError,
  failures,
};
await writeFile(
  join(outputDir, "issue-568-financial-assistant.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  if (fatalError?.stack) console.error(fatalError.stack);
  process.exitCode = 1;
} else {
  console.log("Issue 568 financial assistant visual validation passed.");
}

async function waitForAssistant(cdp, timeout = 10_000) {
  await waitFor(
    async () =>
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

async function exercisePromptByKeyboard(cdp) {
  const prepared = await evaluate(
    cdp,
    `(() => {
      const button = document.querySelector('[data-assistant-prompt]');
      const input = document.querySelector('[data-assistant-input]');
      if (!(button instanceof HTMLButtonElement) || !(input instanceof HTMLTextAreaElement)) {
        throw new Error('Assistant keyboard controls were not found.');
      }
      window.__issue568PromptClick = false;
      button.addEventListener(
        'click',
        () => { window.__issue568PromptClick = true; },
        { once: true },
      );
      button.focus();
      return { buttonFocused: document.activeElement === button, disabled: button.disabled };
    })()`,
  );
  assert.equal(prepared.buttonFocused, true);
  assert.equal(prepared.disabled, false);
  await dispatchEnter(cdp);
  await sleep(80);
  const result = await evaluate(
    cdp,
    `(() => {
      const input = document.querySelector('[data-assistant-input]');
      return {
        nativeActivationObserved: window.__issue568PromptClick === true,
        inputFocused: document.activeElement === input,
        value: input instanceof HTMLTextAreaElement ? input.value : ''
      };
    })()`,
  );
  return { ...prepared, ...result };
}

async function submitQuestion(cdp, question, options = {}) {
  await evaluate(
    cdp,
    `(() => {
      const input = document.querySelector('[data-assistant-input]');
      const submit = document.querySelector('[data-assistant-submit]');
      if (!(input instanceof HTMLTextAreaElement) || !(submit instanceof HTMLButtonElement)) {
        throw new Error('Assistant composer controls were not found.');
      }
      input.value = ${JSON.stringify(question)};
      submit.focus();
    })()`,
  );
  await dispatchEnter(cdp);
  if (options.expectStatusIncludes) {
    await waitFor(
      () =>
        evaluate(
          cdp,
          `(() => document.querySelector('[data-assistant-status]')?.textContent?.includes(${JSON.stringify(
            options.expectStatusIncludes,
          )}))()`,
        ),
      12_000,
      `assistant status containing ${options.expectStatusIncludes}`,
    );
  }
  await sleep(100);
  return evaluate(
    cdp,
    `(() => {
      const input = document.querySelector('[data-assistant-input]');
      const thread = document.querySelector('[data-assistant-thread]');
      const threadText = thread?.innerText || '';
      const response = thread?.querySelector('.assistant-message-system');
      const responseRect = response?.getBoundingClientRect();
      const responseStyle = response ? getComputedStyle(response) : null;
      return {
        questionVisible: threadText.includes(${JSON.stringify(question)}),
        responseVisible: Boolean(
          responseRect &&
            responseStyle &&
            responseRect.width > 0 &&
            responseRect.height > 0 &&
            responseStyle.display !== 'none' &&
            responseStyle.visibility !== 'hidden'
        ),
        inputFocused: document.activeElement === input,
        status: document.querySelector('[data-assistant-status]')?.textContent || '',
        excerpt: threadText.slice(0, 600)
      };
    })()`,
  );
}

async function exerciseControlledError(cdp) {
  await evaluate(
    cdp,
    `(() => {
      const originalFetch = window.fetch.bind(window);
      let injected = false;
      window.fetch = async (input, init) => {
        const target = String(input);
        if (
          !injected &&
          target.includes('/api/financial-assistant/conversations/') &&
          target.includes('/messages')
        ) {
          injected = true;
          window.fetch = originalFetch;
          return new Response(
            JSON.stringify({ error: { message: 'Falha visual controlada da issue 568.' } }),
            {
              status: 503,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
        return originalFetch(input, init);
      };
    })()`,
  );
  await evaluate(
    cdp,
    `(() => {
      const input = document.querySelector('[data-assistant-input]');
      const submit = document.querySelector('[data-assistant-submit]');
      if (!(input instanceof HTMLTextAreaElement) || !(submit instanceof HTMLButtonElement)) {
        throw new Error('Assistant form missing');
      }
      input.value = 'Resumo deste mês';
      submit.focus();
    })()`,
  );
  await dispatchEnter(cdp);
  await waitFor(
    () =>
      evaluate(
        cdp,
        `(() => document.querySelector('[data-assistant-status]')?.textContent?.includes(
          'Falha visual controlada da issue 568.'
        ))()`,
      ),
    8_000,
    "controlled assistant failure",
  );
  return evaluate(
    cdp,
    `(() => {
      const input = document.querySelector('[data-assistant-input]');
      const status = document.querySelector('[data-assistant-status]')?.textContent || '';
      return {
        controlledErrorVisible: status.includes('Falha visual controlada da issue 568.'),
        inputFocused: document.activeElement === input,
        status
      };
    })()`,
  );
}

async function clickActionAndWait(cdp, selector, condition) {
  const prepared = await evaluate(
    cdp,
    `(() => {
      const button = document.querySelector(${JSON.stringify(selector)});
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error('Assistant action not found: ${selector}');
      }
      const disabled = button.disabled;
      button.click();
      return { disabled };
    })()`,
  );
  if (prepared.disabled) return { completed: false, inputFocused: false, ...prepared };
  await waitFor(condition, 10_000, `assistant action ${selector}`);
  await sleep(100);
  const inputFocused = await evaluate(
    cdp,
    `(() => document.activeElement === document.querySelector('[data-assistant-input]'))()`,
  );
  return { completed: true, inputFocused, ...prepared };
}

async function inspectAssistant(cdp, scenario) {
  return evaluate(
    cdp,
    `(() => {
      const root = document.querySelector('[data-financial-assistant]');
      const composer = document.querySelector('[data-assistant-form]');
      const actions = document.querySelector('.assistant-context-actions');
      const thread = document.querySelector('[data-assistant-thread]');
      const status = document.querySelector('[data-assistant-status]');
      const readonly = document.querySelector('.assistant-readonly');
      const layout = document.querySelector('.assistant-layout');
      const visible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      };
      const fitsViewport = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        return rect.left >= -1 && rect.right <= viewportWidth + 1;
      };
      return {
        scenario: ${JSON.stringify(scenario)},
        routeReady: visible(root) && visible(layout),
        readOnlyVisible: visible(readonly) && readonly.textContent.includes('Somente leitura'),
        emptyStateVisible: Boolean(thread?.innerText.includes('Nenhuma pergunta neste contexto.')),
        composerVisible: visible(composer),
        actionsVisible: visible(actions),
        statusVisible: visible(status),
        bodyFitsViewport: fitsViewport(root) && fitsViewport(layout) && fitsViewport(composer),
        singleColumn: layout
          ? getComputedStyle(layout).gridTemplateColumns.trim().split(/\s+/).length === 1
          : false,
        visualScale: window.visualViewport?.scale ?? 1,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          clientWidth: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth
        }
      };
    })()`,
  );
}

async function dispatchEnter(cdp) {
  await cdp.send("Page.bringToFront");
  const key = {
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  };
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    text: "\r",
    unmodifiedText: "\r",
    ...key,
  });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
}

async function waitFor(condition, timeout, label) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await condition()) return;
    } catch {
      // Navigation and async rendering can replace the execution context briefly.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}
