import assert from "node:assert/strict";
import { evaluate, sleep } from "./cdp.mjs";
import { createManualInstallmentReaders } from "./issue-553-manual-readers.mjs";

/** Browser controls share the same CDP identity and fixture context. */
export function createManualInstallmentActions(browser) {
  const readers = createManualInstallmentReaders(browser);
  const { pressEnter } = readers;

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
        button?.focus({ preventScroll: true });
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
        const submit = form.querySelector("[data-statement-save-primary]");
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

  return {
    installReloadGuard,
    interceptFormPost,
    readPausedRequest,
    assertCanonicalPost,
    openExpenseModalByKeyboard,
    openExpenseModal,
    waitForModal,
    fillInstallmentForm,
    submitControlIsKeyboardReady,
    submitForm,
    setMoney,
    waitForFormStatus,
    ...readers,
  };
}
