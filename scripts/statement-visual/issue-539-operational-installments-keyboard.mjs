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

if (!chromePath) throw new Error("CHROME_BIN is required for issue 539 keyboard validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixture = await evaluate(browser.cdp, fixtureExpression());
  const route = `/lancamentos?accountId=${encodeURIComponent(fixture.accountId)}&month=2026-07&day=2026-07-15`;
  await navigate(browser.cdp, `${baseUrl}${route}`);
  const requestScope = await waitForInstallmentLine(fixture.transactionId);
  check(
    requestScope.installmentQuery.includes("operationalFrom=2026-07-15") &&
      requestScope.installmentQuery.includes("operationalTo=2026-07-15"),
    "Daily statement did not request the exact displayed day",
    requestScope,
  );

  await evaluate(
    browser.cdp,
    `document.querySelector('[data-edit="${fixture.transactionId}"]').click()`,
  );
  await sleep(200);

  const focusOrder = [await activeControl()];
  await pressKey("Tab", { shift: true });
  focusOrder.push(await activeControl());
  await pressKey("Tab");
  focusOrder.push(await activeControl());
  await pressKey("Tab");
  focusOrder.push(await activeControl());
  await pressKey("Tab");
  focusOrder.push(await activeControl());
  await pressKey("Tab");
  focusOrder.push(await activeControl());

  check(
    focusOrder.join(",") === "description,categoryId,description,note,Salvar parcela,Fechar",
    "Restricted installment modal has an unexpected keyboard order",
    { focusOrder },
  );

  await pressKey("Escape");
  await sleep(100);
  const closed = await evaluate(browser.cdp, `!document.querySelector("[data-modal]").open`);
  check(closed, "Escape did not close the restricted installment modal", { closed });

  const filename = "issue-539-installment-keyboard-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, filename));
  scenarios.push({ route, viewport: "1366x768", focusOrder, screenshot: filename, requestScope });
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
  join(outputDir, "issue-539-operational-installments-keyboard.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Issue 539 operational installments keyboard validation passed.");
}

async function waitForInstallmentLine(transactionId) {
  return evaluate(
    browser.cdp,
    `(async () => {
      const nativeFetch = window.fetch.bind(window);
      let installmentQuery = "";
      window.fetch = async (...args) => {
        const path = String(args[0] || "");
        if (path.startsWith("/api/installments?accountId=")) installmentQuery = path;
        return nativeFetch(...args);
      };
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const node = document.querySelector('script[data-transaction="${transactionId}"]');
        const row = node?.closest("article");
        const edit = row?.querySelector('[data-edit="${transactionId}"]');
        const badge = row?.querySelector("[data-installment-badge]");
        if (row && edit && badge && !edit.disabled) {
          window.fetch = nativeFetch;
          return { installmentQuery, badge: badge.textContent.trim() };
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      window.fetch = nativeFetch;
      throw new Error("Timed out waiting for the installment line");
    })()`,
  );
}

async function activeControl() {
  return evaluate(
    browser.cdp,
    `(() => {
      const active = document.activeElement;
      return active?.name || active?.textContent?.trim() || active?.getAttribute("aria-label") || "";
    })()`,
  );
}

async function pressKey(key, options = {}) {
  const code = key === "Tab" ? "Tab" : key === "Escape" ? "Escape" : key;
  const keyCode = key === "Tab" ? 9 : key === "Escape" ? 27 : 0;
  const modifiers = options.shift ? 8 : 0;
  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    modifiers,
  });
  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    modifiers,
  });
  await sleep(80);
}

function fixtureExpression() {
  return `(async () => {
    async function request(path, method = "GET", body) {
      const response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(method + " " + path + " failed: " + JSON.stringify(payload));
      return payload;
    }
    const suffix = Date.now().toString(36);
    const account = (await request("/api/accounts", "POST", {
      name: "QA Issue 539 teclado " + suffix,
      kind: "checking",
      openingBalanceMinor: 0,
      currency: "BRL"
    })).account;
    const category = (await request("/api/categories", "POST", {
      name: "Categoria teclado " + suffix,
      kind: "expense"
    })).category;
    const recurrence = (await request("/api/recurrences", "POST", {
      frequency: "monthly",
      startOn: "2026-07-15",
      endOn: "2026-07-15",
      amountMinor: 12345,
      description: "QA issue 539 teclado",
      kind: "expense",
      accountId: account.id,
      categoryId: category.id
    })).recurrence;
    await request("/api/recurrences/" + recurrence.id + "/generate-installments", "POST", {
      through: "2026-07-15",
      maxOccurrences: 1
    });
    const installments = (await request(
      "/api/installments?recurrenceId=" + recurrence.id + "&status=all"
    )).installments;
    const installment = installments.find((item) => item.transaction?.id);
    if (!installment?.transaction?.id) throw new Error("Keyboard fixture did not create an installment");
    return { accountId: account.id, transactionId: installment.transaction.id };
  })()`;
}

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}
