import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;

if (!chromePath) throw new Error("CHROME_BIN is required for issue 553 close recovery validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
const evidence = {};

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixture = await evaluate(browser.cdp, createAccountExpression());
  const route = `/lancamentos?accountId=${encodeURIComponent(fixture.accountId)}&month=2026-08`;

  await navigate(browser.cdp, `${baseUrl}${route}`);
  await openExpenseModal();
  await fillInstallmentForm();

  const request = await fulfillInstallmentRequestAsTimeout(submitForm);
  assert.equal(request.pathname, "/api/installments");
  await waitForFormStatus("A resposta foi inconclusiva");

  const ambiguousState = await focusAndReadCloseState();
  assert.equal(ambiguousState.modalOpen, true);
  assert.equal(ambiguousState.recoveryState, "ambiguous");
  assert.equal(ambiguousState.closeDisabled, false);
  assert.equal(ambiguousState.closeFocusable, true);
  assert.equal(ambiguousState.closeFocused, true);
  assert.equal(ambiguousState.closeMarkedAvailable, true);
  assert.equal(ambiguousState.closeFormMethod, "dialog");

  const screenshotName = "issue-553-ambiguous-close-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, screenshotName));

  await clickCloseButton();
  await waitForModalClosed();
  const closedState = await readClosedState();
  assert.equal(closedState.modalOpen, false);
  assert.equal(closedState.recoveryState, "");
  assert.equal(closedState.closeMarkedAvailable, false);

  evidence.route = route;
  evidence.viewport = "1366x768";
  evidence.screenshot = screenshotName;
  evidence.request = request;
  evidence.ambiguousState = ambiguousState;
  evidence.closedState = closedState;
} finally {
  await browser.close(outputDir);
}

await writeFile(
  join(outputDir, "issue-553-ambiguous-close.json"),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      commit: process.env.GITHUB_SHA ?? "local",
      browser: browser.version,
      evidence,
    },
    null,
    2,
  )}\n`,
);
console.log("Issue 553 ambiguous close validation passed.");

async function fulfillInstallmentRequestAsTimeout(action) {
  let resolveRequest;
  let rejectRequest;
  const observed = new Promise((resolve, reject) => {
    resolveRequest = resolve;
    rejectRequest = reject;
  });
  const operations = [];
  const unsubscribe = browser.cdp.on("Fetch.requestPaused", (paused) => {
    const operation = (async () => {
      const request = readPausedRequest(paused);
      if (request.pathname !== "/api/installments") {
        await browser.cdp.send("Fetch.continueRequest", { requestId: paused.requestId });
        return;
      }
      await browser.cdp.send("Fetch.fulfillRequest", {
        requestId: paused.requestId,
        responseCode: 504,
        responsePhrase: "Gateway Timeout",
        responseHeaders: [{ name: "content-type", value: "application/json; charset=utf-8" }],
        body: Buffer.from(
          JSON.stringify({
            error: {
              code: "GATEWAY_TIMEOUT",
              message: "Tempo limite no gateway; a operação pode ter sido concluída.",
            },
          }),
        ).toString("base64"),
      });
      resolveRequest(request);
    })().catch(rejectRequest);
    operations.push(operation);
  });

  await browser.cdp.send("Fetch.enable", {
    patterns: [{ urlPattern: "*api/installments*", requestStage: "Request" }],
  });
  try {
    await action();
    const result = await Promise.race([
      observed,
      sleep(10_000).then(() => {
        throw new Error("Timed out waiting for the ambiguous close request");
      }),
    ]);
    await Promise.all(operations);
    return result;
  } finally {
    unsubscribe();
    await browser.cdp.send("Fetch.disable");
  }
}

function readPausedRequest(paused) {
  const url = new URL(paused.request.url);
  const payload = paused.request.postData ? JSON.parse(paused.request.postData) : {};
  return {
    method: paused.request.method,
    pathname: url.pathname,
    search: url.search,
    idempotencyKey: payload.idempotencyKey,
    payload,
  };
}

async function openExpenseModal() {
  await evaluate(
    browser.cdp,
    `document.querySelector('[data-open-modal][data-quick-kind="expense"]').click()`,
  );
  await evaluate(
    browser.cdp,
    `(async () => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (document.querySelector("[data-modal]")?.open) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("Timed out waiting for the transaction modal");
    })()`,
  );
}

async function fillInstallmentForm() {
  await evaluate(
    browser.cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      const control = (name) => form.elements.namedItem(name);
      control("kind").value = "expense";
      control("repeatMode").value = "installment";
      control("repeatMode").dispatchEvent(new Event("change", { bubbles: true }));
      control("amountMinor").value = "120,00";
      control("plannedOn").value = "2026-08-31";
      control("effectiveOn").value = "";
      control("installments").value = "3";
      control("installments").dispatchEvent(new Event("input", { bubbles: true }));
      control("installmentStart").value = "1";
      control("installmentValueMode").value = "total";
      control("description").value = "QA fechamento durante recuperação";
      control("note").value = "O fechamento deve permanecer disponível";
      control("status").value = "planned";
    })()`,
  );
}

async function submitForm() {
  await evaluate(browser.cdp, `document.querySelector("[data-form]").requestSubmit()`);
}

async function waitForFormStatus(expectedText) {
  return evaluate(
    browser.cdp,
    `(async () => {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const node = document.querySelector("[data-form] .form-status");
        const text = node?.textContent || "";
        if (text.includes(${JSON.stringify(expectedText)})) return text;
        await new Promise((resolve) => setTimeout(resolve, 75));
      }
      throw new Error("Timed out waiting for form status: " + ${JSON.stringify(expectedText)});
    })()`,
  );
}

async function focusAndReadCloseState() {
  return evaluate(
    browser.cdp,
    `(() => {
      const modal = document.querySelector("[data-modal]");
      const form = document.querySelector("[data-form]");
      const closeForm = modal?.querySelector(".close-form");
      const closeButton = closeForm?.querySelector('button[type="submit"]');
      closeButton?.focus();
      return {
        modalOpen: modal?.open === true,
        recoveryState: form?.dataset.installmentRecovery || "",
        closeDisabled: closeButton?.disabled === true,
        closeFocusable: Boolean(closeButton && closeButton.tabIndex >= 0),
        closeFocused: document.activeElement === closeButton,
        closeMarkedAvailable: closeButton?.dataset.financialRecoveryCloseAvailable === "true",
        closeFormMethod: closeForm?.method || "",
      };
    })()`,
  );
}

async function clickCloseButton() {
  await evaluate(
    browser.cdp,
    `document.querySelector('[data-modal] .close-form button[type="submit"]').click()`,
  );
}

async function waitForModalClosed() {
  await evaluate(
    browser.cdp,
    `(async () => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const modal = document.querySelector("[data-modal]");
        const form = document.querySelector("[data-form]");
        const closeButton = modal?.querySelector('.close-form button[type="submit"]');
        const closed = modal?.open !== true;
        const recoveryCleared = !form?.dataset.installmentRecovery;
        const closeMarkerCleared =
          closeButton?.dataset.financialRecoveryCloseAvailable !== "true";
        if (closed && recoveryCleared && closeMarkerCleared) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("Timed out waiting for the transaction modal recovery cleanup");
    })()`,
  );
}

async function readClosedState() {
  return evaluate(
    browser.cdp,
    `(() => {
      const modal = document.querySelector("[data-modal]");
      const form = document.querySelector("[data-form]");
      const closeButton = modal?.querySelector('.close-form button[type="submit"]');
      return {
        modalOpen: modal?.open === true,
        recoveryState: form?.dataset.installmentRecovery || "",
        closeMarkedAvailable: closeButton?.dataset.financialRecoveryCloseAvailable === "true",
      };
    })()`,
  );
}

function createAccountExpression() {
  return `(async () => {
    const suffix = Date.now().toString(36);
    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "QA Issue 553 ambiguous close " + suffix,
        kind: "checking",
        openingBalanceMinor: 0,
        currency: "BRL"
      })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(body));
    return { accountId: body.account.id };
  })()`;
}
