import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const warningText = "Confira o Extrato antes de tentar novamente para evitar duplicidade";
const recurrenceStartDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const recurrenceMonth = recurrenceStartDate.slice(0, 7);

if (!chromePath) {
  throw new Error("CHROME_BIN is required for issue 553 non-idempotent ambiguity validation.");
}

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
const evidence = { scenarios: [] };

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixture = await evaluate(browser.cdp, createAccountExpression());

  const transactionRoute = `/lancamentos?accountId=${encodeURIComponent(fixture.accountId)}&month=2026-09`;
  await navigate(browser.cdp, `${baseUrl}${transactionRoute}`);
  await openExpenseModal();
  await fillForm({
    repeatMode: "single",
    amount: "42,00",
    plannedOn: "2026-09-10",
    description: "QA lançamento simples resposta ambígua",
  });

  const transaction = await maskCommittedResponseAsTimeout({
    pathname: "/api/transactions",
    action: submitForm,
  });
  await waitForFormStatus(warningText);
  const transactionState = await readRecoveryState();
  assert.equal(transactionState.nonIdempotentRecovery, "ambiguous");
  assert.equal(transactionState.installmentRecovery, "");
  assert.equal(transactionState.submitDisabled, true);
  assert.match(transactionState.statusText, /evitar duplicidade/);
  await assertNoSecondPost("/api/transactions", submitForm);

  const transactions = await readTransactions(fixture.accountId);
  const matchingTransactions = transactions.filter(
    (item) => item.description === "QA lançamento simples resposta ambígua",
  );
  assert.equal(matchingTransactions.length, 1, JSON.stringify(matchingTransactions));

  const transactionScreenshot = "issue-553-non-idempotent-transaction-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, transactionScreenshot));
  evidence.scenarios.push({
    kind: "transaction",
    route: transactionRoute,
    committedStatus: transaction.backendStatus,
    request: transaction.request,
    recoveryState: transactionState,
    persistedIds: matchingTransactions.map((item) => item.id),
    screenshot: transactionScreenshot,
  });

  const recurrenceRoute = `/lancamentos?accountId=${encodeURIComponent(fixture.accountId)}&month=${recurrenceMonth}`;
  await navigate(browser.cdp, `${baseUrl}${recurrenceRoute}`);
  await openExpenseModal();
  await fillForm({
    repeatMode: "fixed",
    amount: "55,00",
    plannedOn: recurrenceStartDate,
    description: "QA recorrência resposta ambígua",
  });

  const recurrence = await maskCommittedResponseAsTimeout({
    pathname: "/api/recurrences",
    action: submitForm,
  });
  await waitForFormStatus(warningText);
  const recurrenceState = await readRecoveryState();
  assert.equal(recurrenceState.nonIdempotentRecovery, "ambiguous");
  assert.equal(recurrenceState.installmentRecovery, "");
  assert.equal(recurrenceState.submitDisabled, true);
  assert.match(recurrenceState.statusText, /evitar duplicidade/);
  await assertNoSecondPost("/api/recurrences", submitForm);

  const recurrences = await readRecurrences(fixture.accountId);
  const matchingRecurrences = recurrences.filter(
    (item) => item.description === "QA recorrência resposta ambígua",
  );
  assert.equal(matchingRecurrences.length, 1, JSON.stringify(matchingRecurrences));

  const recurrenceScreenshot = "issue-553-non-idempotent-recurrence-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, recurrenceScreenshot));
  evidence.scenarios.push({
    kind: "recurrence",
    route: recurrenceRoute,
    committedStatus: recurrence.backendStatus,
    request: recurrence.request,
    recoveryState: recurrenceState,
    persistedIds: matchingRecurrences.map((item) => item.id),
    screenshot: recurrenceScreenshot,
  });
} finally {
  await browser.close(outputDir);
}

await writeFile(
  join(outputDir, "issue-553-non-idempotent-ambiguity.json"),
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

console.log("Issue 553 non-idempotent ambiguity validation passed.");

async function maskCommittedResponseAsTimeout({ pathname, action }) {
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
      if (request.pathname !== pathname || request.method !== "POST") {
        await browser.cdp.send("Fetch.continueRequest", { requestId: paused.requestId });
        return;
      }

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
        `Expected committed backend response for ${pathname}, received ${backendStatus}: ${backendBody}`,
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
    patterns: [{ urlPattern: `*${pathname}*`, requestStage: "Request" }],
  });
  try {
    await action();
    const result = await Promise.race([
      masked,
      sleep(10_000).then(() => {
        throw new Error(`Timed out while masking committed response for ${pathname}`);
      }),
    ]);
    await Promise.all(operations);
    return result;
  } finally {
    unsubscribe();
    await browser.cdp.send("Fetch.disable");
  }
}

async function assertNoSecondPost(pathname, action) {
  await browser.cdp.send("Network.enable");
  let matchingRequests = 0;
  const unsubscribe = browser.cdp.on("Network.requestWillBeSent", (event) => {
    const url = new URL(event.request.url);
    if (event.request.method === "POST" && url.pathname === pathname) {
      matchingRequests += 1;
    }
  });
  try {
    await action();
    await sleep(750);
  } finally {
    unsubscribe();
  }
  assert.equal(
    matchingRequests,
    0,
    `Ambiguous non-idempotent ${pathname} submission allowed another POST`,
  );
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

function readPausedRequest(paused) {
  const url = new URL(paused.request.url);
  return {
    method: paused.request.method,
    pathname: url.pathname,
    search: url.search,
    body: paused.request.postData || "",
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

async function fillForm({ repeatMode, amount, plannedOn, description }) {
  await evaluate(
    browser.cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      const control = (name) => form.elements.namedItem(name);
      control("kind").value = "expense";
      control("repeatMode").value = ${JSON.stringify(repeatMode)};
      control("repeatMode").dispatchEvent(new Event("change", { bubbles: true }));
      control("amountMinor").value = ${JSON.stringify(amount)};
      control("occurredOn").value = ${JSON.stringify(plannedOn)};
      control("plannedOn").value = ${JSON.stringify(plannedOn)};
      control("effectiveOn").value = "";
      control("description").value = ${JSON.stringify(description)};
      control("note").value = "Controle de resposta ambígua sem idempotência";
      control("status").value = "planned";
      if (${JSON.stringify(repeatMode)} === "fixed") {
        control("frequency").value = "monthly";
        control("interval").value = "1";
        control("endOn").value = "";
      }
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
        nonIdempotentRecovery: form.dataset.nonIdempotentRecovery || "",
        installmentRecovery: form.dataset.installmentRecovery || "",
        submitDisabled: form.querySelector('button[type="submit"]')?.disabled === true,
        statusText: form.querySelector(".form-status")?.textContent || "",
      };
    })()`,
  );
}

async function readTransactions(accountId) {
  return evaluate(
    browser.cdp,
    `(async () => {
      const response = await fetch(
        "/api/transactions?accountId=" + encodeURIComponent(${JSON.stringify(accountId)}) + "&status=all"
      );
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      return body.transactions || [];
    })()`,
  );
}

async function readRecurrences(accountId) {
  return evaluate(
    browser.cdp,
    `(async () => {
      const response = await fetch(
        "/api/recurrences?accountId=" + encodeURIComponent(${JSON.stringify(accountId)}) + "&status=all"
      );
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      return body.recurrences || [];
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
        name: "QA Issue 553 non-idempotent " + suffix,
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
