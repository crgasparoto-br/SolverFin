import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;

if (!chromePath) throw new Error("CHROME_BIN is required for issue 553 recovery validation.");
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
  await installReloadGuard();
  await openExpenseModal();
  await fillInstallmentForm();

  const committedButMasked = await maskCommittedResponseAsTimeout(submitForm);
  assert.equal(committedButMasked.request.pathname, "/api/installments");
  assert.equal(committedButMasked.backendStatus, 201);
  await waitForFormStatus("A resposta foi inconclusiva");

  const ambiguousState = await readRecoveryState();
  assert.equal(ambiguousState.modalOpen, true);
  assert.equal(ambiguousState.recoveryState, "ambiguous");
  assert.equal(ambiguousState.amountDisabled, true);
  assert.equal(ambiguousState.descriptionDisabled, true);
  assert.equal(ambiguousState.submitDisabled, false);

  const screenshotName = "issue-553-ambiguous-recovery-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, screenshotName));

  await tamperDisabledFieldsProgrammatically();
  const retry = await observeInstallmentRequest(submitForm);
  await waitForFormStatus("Ação concluída");

  assert.equal(retry.pathname, committedButMasked.request.pathname);
  assert.equal(retry.search, committedButMasked.request.search);
  assert.equal(retry.idempotencyKey, committedButMasked.request.idempotencyKey);
  assert.equal(retry.body, committedButMasked.request.body);

  const rows = await readInstallments(fixture.accountId, "2026-08-01", "2026-10-31");
  assert.equal(rows.length, 3, JSON.stringify(rows));
  assert.deepEqual(
    rows.map((item) => item.sequenceNumber).sort((a, b) => a - b),
    [1, 2, 3],
  );
  assert.equal(
    rows.every((item) => item.transaction?.description === "QA recuperação ambígua"),
    true,
  );
  assert.equal(
    rows.every((item) => item.amountMinor === 4000),
    true,
  );

  evidence.route = route;
  evidence.viewport = "1366x768";
  evidence.screenshot = screenshotName;
  evidence.committedButMasked = committedButMasked;
  evidence.ambiguousState = ambiguousState;
  evidence.retry = retry;
  evidence.rows = rows;
} finally {
  await browser.close(outputDir);
}

await writeFile(
  join(outputDir, "issue-553-ambiguous-recovery.json"),
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
console.log("Issue 553 ambiguous recovery validation passed.");

async function installReloadGuard() {
  await evaluate(
    browser.cdp,
    `(() => {
      const nativeSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = function (callback, delay, ...args) {
        if (typeof callback === "function" && String(callback).includes("window.location.reload")) return 0;
        return nativeSetTimeout(callback, delay, ...args);
      };
    })()`,
  );
}

async function maskCommittedResponseAsTimeout(action) {
  const cookieHeader = await readBrowserCookieHeader();
  let resolveMasked;
  let rejectMasked;
  const masked = new Promise((resolve, reject) => {
    resolveMasked = resolve;
    rejectMasked = reject;
  });
  const operations = [];
  const unsubscribe = browser.cdp.on("Fetch.requestPaused", (paused) => {
    const operation = (async () => {
      const request = readPausedRequest(paused);
      const headers = buildBackendReplayHeaders(paused.request.headers, cookieHeader);
      const backendResponse = await fetch(paused.request.url, {
        method: paused.request.method,
        headers,
        body: paused.request.postData,
        redirect: "manual",
      });
      const backendStatus = backendResponse.status;
      const backendBody = await backendResponse.text();
      assert.equal(
        backendStatus,
        201,
        `Expected committed backend response, received ${backendStatus}: ${backendBody}`,
      );

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
      resolveMasked({ request, backendStatus });
    })().catch(rejectMasked);
    operations.push(operation);
  });

  await browser.cdp.send("Fetch.enable", {
    patterns: [{ urlPattern: "*api/installments*", requestStage: "Request" }],
  });
  try {
    await action();
    const result = await Promise.race([
      masked,
      sleep(10_000).then(() => {
        throw new Error("Timed out while masking the committed installment response");
      }),
    ]);
    await Promise.all(operations);
    return result;
  } finally {
    unsubscribe();
    await browser.cdp.send("Fetch.disable");
  }
}

async function readBrowserCookieHeader() {
  const result = await browser.cdp.send("Network.getCookies", { urls: [baseUrl] });
  return result.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function buildBackendReplayHeaders(requestHeaders, cookieHeader) {
  const headers = new Headers();
  for (const name of ["accept", "authorization", "content-type", "referer", "x-correlation-id"]) {
    const value = requestHeaders[name] ?? requestHeaders[name.toUpperCase()];
    if (typeof value === "string" && value) headers.set(name, value);
  }
  headers.set("origin", new URL(baseUrl).origin);
  if (cookieHeader) headers.set("cookie", cookieHeader);
  return headers;
}

async function observeInstallmentRequest(action) {
  let resolveRequest;
  let rejectRequest;
  const observed = new Promise((resolve, reject) => {
    resolveRequest = resolve;
    rejectRequest = reject;
  });
  const operations = [];
  const unsubscribe = browser.cdp.on("Fetch.requestPaused", (paused) => {
    const operation = (async () => {
      const record = readPausedRequest(paused);
      await browser.cdp.send("Fetch.continueRequest", { requestId: paused.requestId });
      resolveRequest(record);
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
        throw new Error("Timed out waiting for the recovery request");
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
  const body = paused.request.postData || "";
  const payload = body ? JSON.parse(body) : {};
  return {
    method: paused.request.method,
    pathname: url.pathname,
    search: url.search,
    idempotencyKey: payload.idempotencyKey,
    body,
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
      control("description").value = "QA recuperação ambígua";
      control("note").value = "Recuperar antes de editar";
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

async function readRecoveryState() {
  return evaluate(
    browser.cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      return {
        modalOpen: document.querySelector("[data-modal]")?.open === true,
        recoveryState: form.dataset.installmentRecovery || "",
        amountDisabled: form.elements.namedItem("amountMinor").disabled === true,
        descriptionDisabled: form.elements.namedItem("description").disabled === true,
        submitDisabled: form.querySelector('button[type="submit"]')?.disabled === true,
        statusText: form.querySelector(".form-status")?.textContent || "",
      };
    })()`,
  );
}

async function tamperDisabledFieldsProgrammatically() {
  await evaluate(
    browser.cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      form.elements.namedItem("amountMinor").value = "999,99";
      form.elements.namedItem("description").value = "TENTATIVA DE ALTERAÇÃO";
    })()`,
  );
}

async function readInstallments(accountId, from, to) {
  return evaluate(
    browser.cdp,
    `(async () => {
      const response = await fetch(
        "/api/installments?accountId=" + encodeURIComponent(${JSON.stringify(accountId)})
          + "&operationalFrom=" + ${JSON.stringify(from)}
          + "&operationalTo=" + ${JSON.stringify(to)}
          + "&status=all"
      );
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      return body.installments || [];
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
        name: "QA Issue 553 recovery " + suffix,
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
