import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];
const scenarios = [];

if (!chromePath) throw new Error("CHROME_BIN is required for issue 553 visual validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixture = await evaluate(browser.cdp, createAccountExpression());
  const route = `/lancamentos?accountId=${encodeURIComponent(fixture.accountId)}&month=2026-08`;

  await navigate(browser.cdp, `${baseUrl}${route}`);
  await installReloadGuard();
  await openExpenseModalByKeyboard();
  const desktopForm = await fillInstallmentForm({
    amount: "120,00",
    plannedOn: "2026-08-31",
    installments: 3,
    installmentStart: 1,
    amountMode: "total",
    description: "QA parcelamento manual canonico",
    note: "Observacao preservada no retry",
  });
  check(
    desktopForm.repeatMode === "installment",
    "Desktop form did not retain installment mode",
    desktopForm,
  );
  check(await submitControlIsKeyboardReady(), "Submit control is not keyboard ready", desktopForm);

  const ambiguous = await interceptFormPost({
    action: submitForm,
    fulfill: {
      statusCode: 504,
      body: {
        error: {
          code: "GATEWAY_TIMEOUT",
          message: "Tempo limite no gateway; a operação pode ter sido concluída.",
        },
      },
    },
  });
  assertCanonicalPost(ambiguous);
  const ambiguousStatus = await waitForFormStatus("operação pode ter sido concluída");
  const preserved = await readFormState();
  check(preserved.modalOpen, "Modal closed after ambiguous response", preserved);
  check(!preserved.submitDisabled, "Submit remained disabled after ambiguous response", preserved);
  check(
    preserved.description === desktopForm.description,
    "Description was lost after timeout",
    preserved,
  );
  check(preserved.note === desktopForm.note, "Note was lost after timeout", preserved);

  const retry = await interceptFormPost({ action: submitForm });
  assertCanonicalPost(retry);
  await waitForFormStatus("Ação concluída");
  check(
    ambiguous.first.idempotencyKey === retry.first.idempotencyKey,
    "Ambiguous retry generated another idempotency key",
    { ambiguous, retry },
  );
  check(
    ambiguous.first.fingerprint === retry.first.fingerprint,
    "Ambiguous retry changed the logical payload",
    { ambiguous, retry },
  );

  const desktopRows = await readInstallments(fixture.accountId, "2026-08-01", "2026-10-31");
  check(
    desktopRows.length === 3,
    "Desktop retry created an incomplete or duplicate set",
    desktopRows,
  );
  check(
    desktopRows
      .map((item) => item.sequenceNumber)
      .sort((a, b) => a - b)
      .join(",") === "1,2,3",
    "Desktop canonical sequence is incomplete",
    desktopRows,
  );
  check(
    desktopRows.every(
      (item) => item.transaction?.description === "QA parcelamento manual canonico",
    ),
    "Description received a textual sequence suffix",
    desktopRows,
  );
  check(
    desktopRows.every((item) => item.transaction?.note === "Observacao preservada no retry"),
    "Note was not persisted separately",
    desktopRows,
  );
  const desktopScreenshot = "issue-553-manual-installments-desktop-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, desktopScreenshot));
  scenarios.push({
    route,
    viewport: "1366x768",
    state: "canonical retry reused the same key after an ambiguous 504",
    screenshot: desktopScreenshot,
    ambiguousStatus,
    ambiguous,
    retry,
    desktopRows,
  });

  await setViewport(browser.cdp, 390, 844);
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await installReloadGuard();
  await openExpenseModal();
  const mobileForm = await fillInstallmentForm({
    amount: "0,01",
    plannedOn: "2026-11-30",
    installments: 2,
    installmentStart: 1,
    amountMode: "total",
    description: "QA correcao material mobile",
    note: "Chave deve mudar apos validacao",
  });
  check(
    mobileForm.repeatMode === "installment",
    "Mobile form did not retain installment mode",
    mobileForm,
  );

  const validation = await interceptFormPost({
    action: async () => {
      await evaluate(
        browser.cdp,
        `(() => {
          const form = document.querySelector("[data-form]");
          form.requestSubmit();
          form.requestSubmit();
        })()`,
      );
    },
    observeAfterFirst: 500,
  });
  assertCanonicalPost(validation);
  await waitForFormStatus("ao menos um centavo por parcela");
  const rejected = await readFormState();
  check(validation.requests.length === 1, "Double submit issued duplicate requests", validation);
  check(rejected.modalOpen, "Modal closed after definitive validation", rejected);
  check(!rejected.submitDisabled, "Submit was not restored after definitive validation", rejected);

  await setMoney("1,00");
  const corrected = await interceptFormPost({ action: submitForm });
  assertCanonicalPost(corrected);
  await waitForFormStatus("Ação concluída");
  check(
    validation.first.idempotencyKey !== corrected.first.idempotencyKey,
    "Material correction reused the rejected idempotency key",
    { validation, corrected },
  );
  const correctedState = await readFormState();
  check(
    !correctedState.globalOverflow,
    "Installment modal overflowed horizontally on mobile",
    correctedState,
  );
  const mobileRows = await readInstallments(fixture.accountId, "2026-11-01", "2026-12-31");
  check(
    mobileRows.length === 2,
    "Corrected mobile submission did not persist two installments",
    mobileRows,
  );
  const mobileScreenshot = "issue-553-manual-installments-mobile-390x844.png";
  await screenshot(browser.cdp, join(outputDir, mobileScreenshot));
  scenarios.push({
    route,
    viewport: "390x844",
    state: "double submit blocked and key rotated after definitive validation",
    screenshot: mobileScreenshot,
    validation,
    corrected,
    mobileRows,
  });

  await setViewport(browser.cdp, 768, 1024);
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await openExpenseModal();
  const tablet = await evaluate(
    browser.cdp,
    `(() => ({
      modalOpen: document.querySelector("[data-modal]")?.open === true,
      dialogLabel: document.querySelector("[data-modal-title]")?.textContent?.trim() || "",
      liveRegion: document.querySelector("[data-form] [aria-live='polite']")?.getAttribute("aria-live") || "",
      globalOverflow: document.documentElement.scrollWidth > window.innerWidth
    }))()`,
  );
  check(tablet.modalOpen, "Tablet modal did not open", tablet);
  check(
    tablet.dialogLabel.includes("Novo lançamento"),
    "Tablet modal has no usable heading",
    tablet,
  );
  check(tablet.liveRegion === "polite", "Form feedback is not announced", tablet);
  check(!tablet.globalOverflow, "Installment modal overflowed horizontally on tablet", tablet);
  const tabletScreenshot = "issue-553-manual-installments-tablet-768x1024.png";
  await screenshot(browser.cdp, join(outputDir, tabletScreenshot));
  scenarios.push({
    route,
    viewport: "768x1024",
    state: "installment form remained usable without overflow",
    screenshot: tabletScreenshot,
    tablet,
  });
} finally {
  await browser.close(outputDir);
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  failures,
  scenarios,
};
await writeFile(
  join(outputDir, "issue-553-manual-installments.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Issue 553 manual installments visual validation passed.");
}

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

async function interceptFormPost({ action, fulfill, observeAfterFirst = 0 }) {
  const requests = [];
  const operations = [];
  let resolveFirst;
  let rejectFirst;
  const firstRequest = new Promise((resolve, reject) => {
    resolveFirst = resolve;
    rejectFirst = reject;
  });
  const unsubscribe = browser.cdp.on("Fetch.requestPaused", (paused) => {
    const operation = (async () => {
      const record = readPausedRequest(paused);
      if (record.method !== "POST" || !record.pathname.startsWith("/api/")) {
        await browser.cdp.send("Fetch.continueRequest", { requestId: paused.requestId });
        return;
      }
      requests.push(record);
      if (requests.length === 1 && fulfill) {
        await browser.cdp.send("Fetch.fulfillRequest", {
          requestId: paused.requestId,
          responseCode: fulfill.statusCode,
          responseHeaders: [{ name: "content-type", value: "application/json; charset=utf-8" }],
          body: Buffer.from(JSON.stringify(fulfill.body)).toString("base64"),
        });
      } else {
        await browser.cdp.send("Fetch.continueRequest", { requestId: paused.requestId });
      }
      if (requests.length === 1) resolveFirst(record);
    })().catch(rejectFirst);
    operations.push(operation);
  });

  await browser.cdp.send("Fetch.enable", {
    patterns: [{ urlPattern: "*api/*", requestStage: "Request" }],
  });
  try {
    await action();
    const first = await Promise.race([
      firstRequest,
      sleep(10_000).then(() => {
        throw new Error("Timed out waiting for a form POST at the Chrome transport boundary");
      }),
    ]);
    if (observeAfterFirst > 0) await sleep(observeAfterFirst);
    await Promise.all(operations);
    return { first, requests };
  } finally {
    unsubscribe();
    await browser.cdp.send("Fetch.disable");
  }
}

function readPausedRequest(paused) {
  const url = new URL(paused.request.url);
  const payload = paused.request.postData ? JSON.parse(paused.request.postData) : {};
  const { idempotencyKey, ...businessPayload } = payload;
  return {
    method: paused.request.method,
    pathname: url.pathname,
    search: url.search,
    idempotencyKey,
    fingerprint: JSON.stringify(businessPayload),
    payload,
  };
}

function assertCanonicalPost(transport) {
  assert.equal(transport.requests.length >= 1, true, JSON.stringify(transport));
  assert.equal(transport.first.method, "POST", JSON.stringify(transport));
  assert.equal(transport.first.pathname, "/api/installments", JSON.stringify(transport));
}

async function openExpenseModalByKeyboard() {
  const focused = await evaluate(
    browser.cdp,
    `(() => {
      const button = document.querySelector('[data-open-modal][data-quick-kind="expense"]');
      button?.focus();
      return document.activeElement === button && button?.disabled !== true;
    })()`,
  );
  assert.equal(focused, true, "Expense shortcut is not keyboard ready");
  await pressEnter();
  await waitForModal();
}

async function openExpenseModal() {
  await evaluate(
    browser.cdp,
    `document.querySelector('[data-open-modal][data-quick-kind="expense"]').click()`,
  );
  await waitForModal();
}

async function waitForModal() {
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

async function fillInstallmentForm({
  amount,
  plannedOn,
  installments,
  installmentStart,
  amountMode,
  description,
  note,
}) {
  return evaluate(
    browser.cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      const control = (name) => form.elements.namedItem(name);
      control("kind").value = "expense";
      control("repeatMode").value = "installment";
      control("repeatMode").dispatchEvent(new Event("change", { bubbles: true }));
      control("amountMinor").value = ${JSON.stringify(amount)};
      control("plannedOn").value = ${JSON.stringify(plannedOn)};
      control("effectiveOn").value = "";
      control("installments").value = ${JSON.stringify(String(installments))};
      control("installments").dispatchEvent(new Event("input", { bubbles: true }));
      control("installmentStart").value = ${JSON.stringify(String(installmentStart))};
      control("installmentValueMode").value = ${JSON.stringify(amountMode)};
      control("description").value = ${JSON.stringify(description)};
      control("note").value = ${JSON.stringify(note)};
      control("status").value = "planned";
      return {
        repeatMode: control("repeatMode").value,
        description: control("description").value,
        note: control("note").value,
      };
    })()`,
  );
}

async function submitControlIsKeyboardReady() {
  return evaluate(
    browser.cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      const submit = form.querySelector('button[type="submit"]');
      submit.focus();
      return (
        document.activeElement === submit &&
        submit.tagName === "BUTTON" &&
        submit.type === "submit" &&
        submit.disabled === false &&
        submit.tabIndex >= 0 &&
        submit.form === form
      );
    })()`,
  );
}

async function submitForm() {
  await evaluate(browser.cdp, `document.querySelector("[data-form]").requestSubmit()`);
}

async function setMoney(amount) {
  await evaluate(
    browser.cdp,
    `document.querySelector('[data-form] [name="amountMinor"]').value = ${JSON.stringify(amount)}`,
  );
}

async function waitForFormStatus(expectedText) {
  return evaluate(
    browser.cdp,
    `(async () => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const node = document.querySelector("[data-form] .form-status");
        const text = node?.textContent || "";
        if (text.includes(${JSON.stringify(expectedText)})) {
          return { text, className: node.className };
        }
        await new Promise((resolve) => setTimeout(resolve, 75));
      }
      throw new Error("Timed out waiting for form status: " + ${JSON.stringify(expectedText)});
    })()`,
  );
}

async function readFormState() {
  return evaluate(
    browser.cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      return {
        modalOpen: document.querySelector("[data-modal]")?.open === true,
        description: form.elements.namedItem("description").value,
        note: form.elements.namedItem("note").value,
        submitDisabled: form.querySelector('button[type="submit"]')?.disabled === true,
        globalOverflow: document.documentElement.scrollWidth > window.innerWidth
      };
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

async function pressEnter() {
  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    text: "\r",
    unmodifiedText: "\r",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await sleep(100);
}

function createAccountExpression() {
  return `(async () => {
    const suffix = Date.now().toString(36);
    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "QA Issue 553 " + suffix,
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

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}
