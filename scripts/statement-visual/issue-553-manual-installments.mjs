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
  const fixture = await evaluate(browser.cdp, fixtureExpression());
  const route = `/lancamentos?accountId=${encodeURIComponent(fixture.accountId)}&month=2026-08`;

  await navigate(browser.cdp, `${baseUrl}${route}`);
  await installRequestProbe();
  await openExpenseModalByKeyboard();
  await fillInstallmentForm({
    amount: "120,00",
    plannedOn: "2026-08-31",
    installments: 3,
    installmentStart: 1,
    amountMode: "total",
    description: "QA parcelamento manual canonico",
    note: "Observacao preservada no retry",
  });

  await evaluate(browser.cdp, `window.__issue553Probe.failNext = true`);
  await submitByKeyboard();
  const ambiguousFailure = await waitForFormStatus("Seus dados foram preservados");
  const preserved = await readFormState();
  check(preserved.modalOpen, "Modal closed after an ambiguous network failure", preserved);
  check(
    preserved.submitDisabled === false,
    "Submit remained disabled after network failure",
    preserved,
  );
  check(
    preserved.description === "QA parcelamento manual canonico",
    "Description was lost",
    preserved,
  );
  check(preserved.note === "Observacao preservada no retry", "Note was lost", preserved);
  check(
    preserved.calls.length === 1,
    "A single confirmation issued more than one request",
    preserved,
  );

  await submitByKeyboard();
  await waitForFormStatus("Ação concluída");
  const retry = await readFormState();
  check(retry.calls.length === 2, "Retry did not issue exactly one additional request", retry);
  check(
    retry.calls[0]?.idempotencyKey === retry.calls[1]?.idempotencyKey,
    "Ambiguous retry generated a different idempotency key",
    retry,
  );
  check(
    retry.calls[0]?.fingerprint === retry.calls[1]?.fingerprint,
    "Ambiguous retry changed the logical payload",
    retry,
  );

  const persisted = await readInstallments(fixture.accountId, "2026-08-01", "2026-10-31");
  check(
    persisted.length === 3,
    "Retry created a duplicate or incomplete installment set",
    persisted,
  );
  check(
    persisted.map((item) => item.sequenceNumber).join(",") === "1,2,3",
    "Canonical sequence is incomplete",
    persisted,
  );
  check(
    persisted.every((item) => item.transaction?.description === "QA parcelamento manual canonico"),
    "Description received a textual sequence suffix",
    persisted,
  );
  check(
    persisted.every((item) => item.transaction?.note === "Observacao preservada no retry"),
    "Note was not persisted separately",
    persisted,
  );

  const desktopScreenshot = "issue-553-manual-installments-desktop-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, desktopScreenshot));
  scenarios.push({
    route,
    viewport: "1366x768",
    state: "keyboard submission retained the key after an ambiguous failure",
    screenshot: desktopScreenshot,
    ambiguousFailure,
    preserved,
    retry,
    persisted,
  });

  await setViewport(browser.cdp, 390, 844);
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await installRequestProbe();
  await openExpenseModal();
  await fillInstallmentForm({
    amount: "0,01",
    plannedOn: "2026-11-30",
    installments: 2,
    installmentStart: 1,
    amountMode: "total",
    description: "QA correcao material mobile",
    note: "Chave deve mudar apos validacao",
  });

  await evaluate(
    browser.cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      form.requestSubmit();
      form.requestSubmit();
    })()`,
  );
  await waitForFormStatus("ao menos um centavo por parcela");
  const validationFailure = await readFormState();
  check(
    validationFailure.calls.length === 1,
    "Double submission issued duplicate requests",
    validationFailure,
  );
  check(
    validationFailure.modalOpen,
    "Modal closed after a definitive validation error",
    validationFailure,
  );
  check(
    validationFailure.submitDisabled === false,
    "Submit was not restored after validation",
    validationFailure,
  );

  await fillMoney("1,00");
  await evaluate(browser.cdp, `document.querySelector("[data-form]").requestSubmit()`);
  await waitForFormStatus("Ação concluída");
  const corrected = await readFormState();
  check(corrected.calls.length === 2, "Corrected submission did not issue one request", corrected);
  check(
    corrected.calls[0]?.idempotencyKey !== corrected.calls[1]?.idempotencyKey,
    "Material correction reused the rejected idempotency key",
    corrected,
  );
  check(
    !corrected.globalOverflow,
    "Installment modal caused horizontal overflow on mobile",
    corrected,
  );

  const correctedRows = await readInstallments(fixture.accountId, "2026-11-01", "2026-12-31");
  check(
    correctedRows.length === 2,
    "Corrected mobile submission did not persist two installments",
    correctedRows,
  );

  const mobileScreenshot = "issue-553-manual-installments-mobile-390x844.png";
  await screenshot(browser.cdp, join(outputDir, mobileScreenshot));
  scenarios.push({
    route,
    viewport: "390x844",
    state: "duplicate submit blocked and key rotated after definitive validation",
    screenshot: mobileScreenshot,
    validationFailure,
    corrected,
    correctedRows,
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
  check(!tablet.globalOverflow, "Installment modal caused horizontal overflow on tablet", tablet);
  const tabletScreenshot = "issue-553-manual-installments-tablet-768x1024.png";
  await screenshot(browser.cdp, join(outputDir, tabletScreenshot));
  scenarios.push({
    route,
    viewport: "768x1024",
    state: "installment form available without overflow and with live feedback",
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

async function installRequestProbe() {
  await evaluate(
    browser.cdp,
    `(() => {
      const nativeFetch = window.fetch.bind(window);
      const nativeSetTimeout = window.setTimeout.bind(window);
      window.__issue553Probe = { calls: [], failNext: false };
      window.setTimeout = function (callback, delay, ...args) {
        if (typeof callback === "function" && String(callback).includes("window.location.reload")) return 0;
        return nativeSetTimeout(callback, delay, ...args);
      };
      window.fetch = async function (input, init = {}) {
        const url = new URL(input instanceof Request ? input.url : String(input || ""), window.location.origin);
        const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (url.pathname === "/api/installments" && method === "POST") {
          const payload = JSON.parse(String(init.body || "{}"));
          const { idempotencyKey, ...businessPayload } = payload;
          window.__issue553Probe.calls.push({
            idempotencyKey,
            fingerprint: JSON.stringify(businessPayload),
            payload
          });
          if (window.__issue553Probe.failNext) {
            window.__issue553Probe.failNext = false;
            throw new TypeError("issue-553 simulated ambiguous network failure");
          }
        }
        return nativeFetch(input, init);
      };
    })()`,
  );
}

async function openExpenseModalByKeyboard() {
  const focusState = await evaluate(
    browser.cdp,
    `(() => {
      const button = document.querySelector('[data-open-modal][data-quick-kind="expense"]');
      button?.focus();
      return { focused: document.activeElement === button, disabled: button?.disabled === true };
    })()`,
  );
  check(
    focusState.focused && !focusState.disabled,
    "Expense shortcut is not keyboard ready",
    focusState,
  );
  await pressKey("Enter");
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
  await evaluate(
    browser.cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      form.kind.value = "expense";
      form.repeatMode.value = "installment";
      form.repeatMode.dispatchEvent(new Event("change", { bubbles: true }));
      form.amountMinor.value = ${JSON.stringify(amount)};
      form.plannedOn.value = ${JSON.stringify(plannedOn)};
      form.effectiveOn.value = "";
      form.installments.value = ${JSON.stringify(String(installments))};
      form.installments.dispatchEvent(new Event("input", { bubbles: true }));
      form.installmentStart.value = ${JSON.stringify(String(installmentStart))};
      form.installmentValueMode.value = ${JSON.stringify(amountMode)};
      form.description.value = ${JSON.stringify(description)};
      form.note.value = ${JSON.stringify(note)};
      form.status.value = "planned";
    })()`,
  );
}

async function fillMoney(amount) {
  await evaluate(
    browser.cdp,
    `document.querySelector('[data-form] [name="amountMinor"]').value = ${JSON.stringify(amount)}`,
  );
}

async function proveKeyboardSubmitActivation() {
  const focused = await evaluate(
    browser.cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      const submit = form.querySelector('button[type="submit"]');
      window.__issue553KeyboardSubmit = false;
      form.addEventListener(
        "submit",
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          window.__issue553KeyboardSubmit = true;
        },
        { capture: true, once: true },
      );
      submit.focus();
      return document.activeElement === submit;
    })()`,
  );
  if (!focused) return false;
  await pressKey("Enter");
  return evaluate(browser.cdp, `window.__issue553KeyboardSubmit === true`);
}

async function submitForm() {
  await evaluate(browser.cdp, `document.querySelector("[data-form]").requestSubmit()`);
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
        description: form.description.value,
        note: form.note.value,
        amount: form.amountMinor.value,
        submitDisabled: form.querySelector('button[type="submit"]')?.disabled === true,
        submitting: form.dataset.submitting || "",
        calls: window.__issue553Probe?.calls || [],
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

async function pressKey(key) {
  const keyCode = key === "Enter" ? 13 : 0;
  const text = key === "Enter" ? "\r" : "";
  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code: key,
    text,
    unmodifiedText: text,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code: key,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
  await sleep(100);
}

function fixtureExpression() {
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
