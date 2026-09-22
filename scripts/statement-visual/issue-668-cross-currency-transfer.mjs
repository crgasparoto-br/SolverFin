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

if (!chromePath) {
  throw new Error("CHROME_BIN is required for issue 668 cross-currency transfer validation.");
}

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixture = await evaluate(browser.cdp, fixtureExpression());

  const route = `/lancamentos?accountId=${encodeURIComponent(\n    fixture.sourceAccountId,\n  )}&month=2026-09`;
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await openCreateModal(fixture.usdAccountId);

  const desktop = await readCrossCurrencyState();
  check(desktop.open, "Cross-currency transfer modal did not open", desktop);
  check(desktop.sourceCurrency === "BRL", "Source currency is not BRL", desktop);
  check(desktop.destinationCurrency === "USD", "Destination currency is not USD", desktop);
  check(desktop.destinationAmountVisible, "Destination native amount is not visible", desktop);
  check(desktop.destinationAmountRequired, "Destination native amount is not required", desktop);
  check(desktop.effectiveRateVisible, "Derived effective rate is not visible", desktop);
  check(\n    desktop.effectiveRate === "0,185763",\n    "Derived effective rate is not deterministic",\n    desktop,\n  );
  check(\n    desktop.effectiveRateDirection === "USD por BRL",\n    "Effective-rate direction is ambiguous",\n    desktop,\n  );
  check(\n    desktop.repeatMode === "single",\n    "Cross-currency transfer did not force single occurrence",\n    desktop,\n  );
  check(\n    desktop.installmentDisabled,\n    "Installment option remains enabled for cross-currency transfer",\n    desktop,\n  );
  check(desktop.repeatHintVisible, "Cross-currency recurrence hint is not visible", desktop);
  check(\n    !desktop.globalOverflow,\n    "Cross-currency transfer modal overflows desktop viewport",\n    desktop,\n  );

  const desktopScreenshot = "issue-668-cross-currency-transfer-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, desktopScreenshot));
  scenarios.push({
    route,
    viewport: "1366x768",
    state: "BRL to USD native values and derived rate",
    screenshot: desktopScreenshot,
    details: desktop,
  });

  const currencyChange = await switchDestinationCurrency(fixture.eurAccountId);
  check(\n    currencyChange.destinationCurrency === "EUR",\n    "Destination currency did not switch to EUR",\n    currencyChange,\n  );
  check(\n    currencyChange.destinationAmount === "",\n    "Stale USD destination amount survived EUR destination change",\n    currencyChange,\n  );
  check(\n    currencyChange.effectiveRate === "Informe os dois valores",\n    "Rate was not invalidated after destination currency change",\n    currencyChange,\n  );

  await switchDestinationCurrency(fixture.usdAccountId);
  await fillDestinationAmount(10_000);

  await setViewport(browser.cdp, 390, 844);
  await sleep(100);
  const mobile = await readCrossCurrencyState();
  check(\n    mobile.destinationAmountVisible,\n    "Destination native amount is not visible on mobile",\n    mobile,\n  );
  check(mobile.effectiveRateVisible, "Effective rate is not visible on mobile", mobile);
  check(\n    mobile.effectiveRateDirection === "USD por BRL",\n    "Rate direction changed on mobile",\n    mobile,\n  );
  check(!mobile.globalOverflow, "Cross-currency transfer modal overflows mobile viewport", mobile);

  const mobileScreenshot = "issue-668-cross-currency-transfer-390x844.png";
  await screenshot(browser.cdp, join(outputDir, mobileScreenshot));
  scenarios.push({
    route,
    viewport: "390x844",
    state: "cross-currency modal responsive",
    screenshot: mobileScreenshot,
    details: mobile,
  });

  await setViewport(browser.cdp, 1366, 768);
  const saved = await submitTransfer(fixture);
  check(saved.status === 201, "Cross-currency transfer form did not persist successfully", saved);
  check(\n    saved.requestBody?.amountMinor === 53_832,\n    "Source native amount changed in form payload",\n    saved,\n  );
  check(\n    saved.requestBody?.destinationAmountMinor === 10_000,\n    "Destination native amount changed in form payload",\n    saved,\n  );
  check(saved.persisted?.currency === "BRL", "Persisted source currency is not BRL", saved);
  check(\n    saved.persisted?.destinationCurrency === "USD",\n    "Persisted destination currency is not USD",\n    saved,\n  );
  check(\n    saved.persisted?.amountMinor === 53_832,\n    "Persisted source native amount is incorrect",\n    saved,\n  );
  check(\n    saved.persisted?.destinationAmountMinor === 10_000,\n    "Persisted destination native amount is incorrect",\n    saved,\n  );
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
  join(outputDir, "issue-668-cross-currency-transfer.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Issue 668 cross-currency transfer visual validation passed.");
}

async function openCreateModal(destinationAccountId) {
  await evaluate(
    browser.cdp,
    `(() => {
      const open = Array.from(document.querySelectorAll("[data-open-modal]")).find((button) => !button.disabled);
      if (!open) throw new Error("No enabled transaction modal trigger found");
      open.click();
      const form = document.querySelector("[data-form]");
      form.kind.value = "transfer";
      form.kind.dispatchEvent(new Event("change", { bubbles: true }));
      form.amountMinor.value = "53832";
      form.amountMinor.dispatchEvent(new Event("input", { bubbles: true }));
      form.destinationAccountId.value = ${JSON.stringify(destinationAccountId)};
      form.destinationAccountId.dispatchEvent(new Event("change", { bubbles: true }));
      form.destinationAmountMinor.value = "10000";
      form.destinationAmountMinor.dispatchEvent(new Event("input", { bubbles: true }));
      form.description.value = "QA cross-currency 538,32 BRL para 100 USD";
    })()`,
  );
  await sleep(100);
}

async function readCrossCurrencyState() {
  return evaluate(
    browser.cdp,
    `(() => {
      const dialog = document.querySelector("[data-modal]");
      const form = document.querySelector("[data-form]");
      const destinationField = form.querySelector('[data-field="destinationAmountMinor"]');
      const rateField = form.querySelector('[data-field="effectiveRate"]');
      return {
        open: Boolean(dialog?.open),
        sourceCurrency: form.querySelector("[data-source-currency]")?.textContent?.trim() || "",
        destinationCurrency: form.querySelector("[data-destination-currency]")?.textContent?.trim() || "",
        destinationAmount: form.destinationAmountMinor.value,
        destinationAmountVisible: !destinationField?.hidden,
        destinationAmountRequired: Boolean(form.destinationAmountMinor.required),
        effectiveRateVisible: !rateField?.hidden,
        effectiveRate: form.querySelector("[data-effective-rate]")?.textContent?.trim() || "",
        effectiveRateDirection: form.querySelector("[data-effective-rate-direction]")?.textContent?.trim() || "",
        repeatMode: form.repeatMode.value,
        installmentDisabled: Boolean(form.repeatMode.querySelector('option[value="installment"]')?.disabled),
        repeatHintVisible: !form.querySelector("[data-cross-currency-repeat-hint]")?.hidden,
        globalOverflow: document.documentElement.scrollWidth > window.innerWidth
      };
    })()`,
  );
}

async function switchDestinationCurrency(destinationAccountId) {
  return evaluate(
    browser.cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      form.destinationAccountId.value = ${JSON.stringify(destinationAccountId)};
      form.destinationAccountId.dispatchEvent(new Event("change", { bubbles: true }));
      return {
        destinationCurrency: form.querySelector("[data-destination-currency]")?.textContent?.trim() || "",
        destinationAmount: form.destinationAmountMinor.value,
        effectiveRate: form.querySelector("[data-effective-rate]")?.textContent?.trim() || ""
      };
    })()`,
  );
}

async function fillDestinationAmount(amountMinor) {
  await evaluate(
    browser.cdp,
    `(() => {
      const input = document.querySelector("[data-destination-money]");
      input.value = ${JSON.stringify(String(amountMinor))};
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`,
  );
}

async function submitTransfer(fixture) {
  return evaluate(
    browser.cdp,
    `(async () => {
      const form = document.querySelector("[data-form]");
      const nativeFetch = window.fetch.bind(window);
      const nativeSetTimeout = window.setTimeout.bind(window);
      let status;
      let requestBody;
      let responseBody;

      window.fetch = async (...args) => {
        const path = String(args[0] || "");
        const method = String(args[1]?.method || "GET").toUpperCase();
        if (path === "/api/transactions" && method === "POST") {
          requestBody = JSON.parse(String(args[1]?.body || "{}"));
        }
        const response = await nativeFetch(...args);
        if (path === "/api/transactions" && method === "POST") {
          status = response.status;
          responseBody = await response.clone().json().catch(() => ({}));
        }
        return response;
      };
      window.setTimeout = (callback, delay, ...args) => {
        if (delay === 350 && String(callback).includes("location.reload")) return 0;
        return nativeSetTimeout(callback, delay, ...args);
      };

      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      for (let attempt = 0; attempt < 80 && status === undefined; attempt += 1) {
        await new Promise((resolve) => nativeSetTimeout(resolve, 100));
      }

      const list = await nativeFetch("/api/transactions?accountId=" + encodeURIComponent(${JSON.stringify(fixture.sourceAccountId)}))
        .then((response) => response.json());
      const persisted = list.transactions?.find((transaction) => transaction.id === responseBody?.transaction?.id);

      window.fetch = nativeFetch;
      window.setTimeout = nativeSetTimeout;
      return { status, requestBody, responseBody, persisted };
    })()`,
  );
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
      if (!response.ok) {
        throw new Error(method + " " + path + " failed with " + response.status + ": " + JSON.stringify(payload));
      }
      return payload;
    }

    const suffix = Date.now().toString(36);
    const source = (await request("/api/accounts", "POST", {
      name: "QA Issue 668 origem BRL " + suffix,
      kind: "checking",
      openingBalanceMinor: 0,
      currency: "BRL"
    })).account;
    const usd = (await request("/api/accounts", "POST", {
      name: "QA Issue 668 destino USD " + suffix,
      kind: "checking",
      openingBalanceMinor: 0,
      currency: "USD"
    })).account;
    const eur = (await request("/api/accounts", "POST", {
      name: "QA Issue 668 destino EUR " + suffix,
      kind: "checking",
      openingBalanceMinor: 0,
      currency: "EUR"
    })).account;

    return {
      sourceAccountId: source.id,
      usdAccountId: usd.id,
      eurAccountId: eur.id
    };
  })()`;
}

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}
