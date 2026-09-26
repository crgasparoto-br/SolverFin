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
  throw new Error("CHROME_BIN is required for issue 677 transfer source/destination validation.");
}

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixture = await evaluate(browser.cdp, fixtureExpression());
  const month = new Date().toISOString().slice(0, 7);
  const sourceRoute = `/lancamentos?accountId=${encodeURIComponent(fixture.sourceId)}&month=${month}`;

  await navigate(browser.cdp, `${baseUrl}${sourceRoute}`);
  await openTransferModal();
  const created = await readTransferState();
  check(created.open, "Transfer modal did not open", created);
  check(created.sourceVisible, "Conta origem is not visible for a transfer", created);
  check(created.destinationVisible, "Conta destino is not visible for a transfer", created);
  check(created.sourceLabel === "Conta origem", "Source label is not explicit", created);
  check(created.destinationLabel === "Conta destino", "Destination label is not explicit", created);
  check(
    created.sourceValue === `${fixture.sourceName} · BRL`,
    "Source does not show the statement account name and currency",
    created,
  );
  check(created.sourceReadOnly, "Source account is editable on creation", created);
  check(!created.sourceSubmitted, "Read-only source display is submitted", created);
  check(created.enabledSourceFields === 1, "More than one source field is enabled", created);
  check(
    created.submittedSourceId === fixture.sourceId,
    "Hidden source is not the statement",
    created,
  );
  check(!created.editableSourceSelect, "Creation exposes an editable source selector", created);
  check(created.sourceOptionDisabled, "Source account remains selectable as destination", created);
  check(created.destinationOptionLabel.endsWith("· BRL"), "Destination lacks currency", created);
  check(created.sameRow, "Source and destination are not paired on desktop", created);
  check(created.equalControlHeights, "Source and destination controls differ in height", created);
  check(created.unbrokenCurrencyLabels, "Currency label wraps apart from its text", created);
  check(
    created.fixedEnabled,
    "Fixed repetition is unavailable for same-currency transfer",
    created,
  );
  check(!created.globalOverflow, "Transfer modal overflows desktop viewport", created);

  const desktopScreenshot = "issue-677-transfer-source-destination-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, desktopScreenshot));
  scenarios.push({
    route: sourceRoute,
    viewport: "1366x768",
    state: "transfer creation with read-only source and selectable destination",
    screenshot: desktopScreenshot,
    details: created,
  });

  const sameAccount = await submitWithSameAccount(fixture.sourceId);
  check(!sameAccount.valid, "Source equal to destination passes validation", sameAccount);
  check(
    sameAccount.message === "Escolha uma conta destino diferente da conta origem.",
    "Same-account validation message is unclear",
    sameAccount,
  );
  check(sameAccount.requests === 0, "Same-account transfer reached the API", sameAccount);

  const kindSwitch = await switchKindRoundTrip(fixture.destinationId);
  check(kindSwitch.hiddenOnExpense, "Destination stays visible for expense", kindSwitch);
  check(
    !kindSwitch.submittedOnExpense,
    "Expense payload carries a residual destination",
    kindSwitch,
  );
  check(
    kindSwitch.destinationAfterReturn === "",
    "Destination survived the type switch",
    kindSwitch,
  );
  check(
    kindSwitch.sourceAfterReturn === `${fixture.sourceName} · BRL`,
    "Source changed after returning to transfer",
    kindSwitch,
  );

  const crossCurrency = await selectDestination(fixture.usdId);
  check(crossCurrency.destinationAmountVisible, "USD destination value is hidden", crossCurrency);
  check(crossCurrency.fixedDisabled, "Fixed repetition enabled for cross-currency", crossCurrency);
  check(crossCurrency.repeatMode === "single", "Cross-currency is not single", crossCurrency);
  check(crossCurrency.unbrokenCurrencyLabels, "Cross-currency labels wrap", crossCurrency);
  const crossScreenshot = "issue-677-transfer-cross-currency-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, crossScreenshot));
  scenarios.push({
    route: sourceRoute,
    viewport: "1366x768",
    state: "cross-currency destination keeps single occurrence and native values",
    screenshot: crossScreenshot,
    details: crossCurrency,
  });

  const single = await submitTransfer(fixture, "single");
  check(single.status === 201, "Same-currency transfer was not created", single);
  check(single.requestBody?.accountId === fixture.sourceId, "accountId is not the source", single);
  check(
    single.requestBody?.destinationAccountId === fixture.destinationId,
    "destinationAccountId is not the chosen destination",
    single,
  );
  check(single.persisted?.kind === "transfer", "Persisted row is not a transfer", single);

  await navigate(browser.cdp, `${baseUrl}${sourceRoute}`);
  await openTransferModal();
  const fixed = await submitTransfer(fixture, "fixed");
  check(fixed.status === 201, "Fixed same-currency transfer was not created", fixed);
  check(fixed.requestPath === "/api/recurrences", "Fixed transfer did not use recurrences", fixed);
  check(
    fixed.requestBody?.destinationAccountId === fixture.destinationId,
    "Recurrence payload lost the destination",
    fixed,
  );
  check(
    fixed.persisted?.kind === "transfer" &&
      fixed.persisted?.accountId === fixture.sourceId &&
      fixed.persisted?.destinationAccountId === fixture.destinationId &&
      Boolean(fixed.persisted?.recurrenceId),
    "First fixed occurrence is not a real transfer on the statement",
    fixed,
  );

  const destinationRoute = `/lancamentos?accountId=${encodeURIComponent(fixture.destinationId)}&month=${month}`;
  await navigate(browser.cdp, `${baseUrl}${destinationRoute}`);
  const edit = await openEdit(single.responseBody?.transaction?.id);
  check(edit.open, "Edit modal did not open from the destination statement", edit);
  check(edit.editSourceLabel === "Conta origem", "Edit source label is not explicit", edit);
  check(edit.editSourceValue === fixture.sourceId, "Edit inherited the statement filter", edit);
  check(!edit.readOnlySourceVisible, "Duplicate source shown during edit", edit);
  check(edit.destinationValue === fixture.destinationId, "Persisted destination not loaded", edit);
  check(edit.destinationVisible, "Destination is hidden during transfer edit", edit);
  const editScreenshot = "issue-677-transfer-edit-from-destination-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, editScreenshot));
  scenarios.push({
    route: destinationRoute,
    viewport: "1366x768",
    state: "transfer edit opened from the destination statement shows persisted source",
    screenshot: editScreenshot,
    details: edit,
  });

  await setViewport(browser.cdp, 390, 844);
  await navigate(browser.cdp, `${baseUrl}${sourceRoute}`);
  await openTransferModal();
  await selectDestination(fixture.destinationId);
  await sleep(100);
  const mobile = await readTransferState();
  check(mobile.sourceVisible && mobile.destinationVisible, "Mobile hides an account leg", mobile);
  check(mobile.stacked, "Mobile does not stack source and destination", mobile);
  check(mobile.unbrokenCurrencyLabels, "Mobile currency labels wrap", mobile);
  check(!mobile.globalOverflow, "Transfer modal overflows mobile viewport", mobile);
  const mobileScreenshot = "issue-677-transfer-source-destination-390x844.png";
  await screenshot(browser.cdp, join(outputDir, mobileScreenshot));
  scenarios.push({
    route: sourceRoute,
    viewport: "390x844",
    state: "transfer modal stacked on mobile",
    screenshot: mobileScreenshot,
    details: mobile,
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
  join(outputDir, "issue-677-transfer-source-destination.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Issue 677 transfer source/destination visual validation passed.");
}

async function openTransferModal() {
  await evaluate(
    browser.cdp,
    `(() => {
      const open = Array.from(document.querySelectorAll("[data-open-modal]")).find((button) => !button.disabled);
      if (!open) throw new Error("No enabled transaction modal trigger found");
      open.click();
      const form = document.querySelector("[data-form]");
      form.kind.value = "transfer";
      form.kind.dispatchEvent(new Event("change", { bubbles: true }));
    })()`,
  );
  await sleep(100);
}

async function readTransferState() {
  return evaluate(
    browser.cdp,
    `(() => {
      const dialog = document.querySelector("[data-modal]");
      const form = document.querySelector("[data-form]");
      const sourceField = form.querySelector('[data-field="sourceAccount"]');
      const destinationField = form.querySelector('[data-field="destinationAccountId"]');
      const sourceInput = form.querySelector("[data-source-account-display]");
      const destinationSelect = form.destinationAccountId;
      const accountFields = Array.from(form.querySelectorAll('[name="accountId"]'));
      const enabledSources = accountFields.filter((field) => !field.disabled);
      const submittedSource = enabledSources[0]?.value || "";
      const sourceOption = Array.from(destinationSelect.options).find((option) => option.value === submittedSource);
      const destinationOption = Array.from(destinationSelect.options).find((option) => option.value && option.value !== submittedSource);
      const sourceRect = sourceInput.getBoundingClientRect();
      const destinationRect = destinationSelect.getBoundingClientRect();
      const visibleLabels = Array.from(form.querySelectorAll(".field-label")).filter((node) => !node.closest("[hidden]"));
      const singleLine = (node) => node.getBoundingClientRect().height <= parseFloat(getComputedStyle(node).lineHeight || "0") * 1.5;
      const fixedOption = form.repeatMode.querySelector('[data-repeat-option="fixed"]');
      return {
        open: Boolean(dialog?.open),
        sourceVisible: !sourceField.hidden && sourceRect.width > 0,
        destinationVisible: !destinationField.hidden && destinationRect.width > 0,
        sourceLabel: sourceField.querySelector(".field-label")?.textContent?.trim() || "",
        destinationLabel: destinationField.querySelector(".field-label")?.textContent?.trim() || "",
        sourceValue: sourceInput.value,
        sourceReadOnly: sourceInput.readOnly && sourceInput.getAttribute("aria-readonly") === "true",
        sourceSubmitted: new FormData(form).getAll("accountId").length !== 1 || Boolean(sourceInput.name),
        enabledSourceFields: enabledSources.length,
        submittedSourceId: submittedSource,
        editableSourceSelect: enabledSources.some((field) => field.tagName === "SELECT"),
        sourceOptionDisabled: Boolean(sourceOption?.disabled),
        destinationOptionLabel: destinationOption?.textContent?.trim() || "",
        sameRow: Math.abs(sourceRect.top - destinationRect.top) < 2,
        stacked: destinationRect.top >= sourceRect.bottom,
        equalControlHeights: Math.abs(sourceRect.height - destinationRect.height) < 2,
        unbrokenCurrencyLabels: visibleLabels.length > 0 && visibleLabels.every(singleLine),
        fixedEnabled: Boolean(fixedOption && !fixedOption.disabled),
        globalOverflow: dialog.scrollWidth > dialog.clientWidth || document.documentElement.scrollWidth > window.innerWidth
      };
    })()`,
  );
}

async function submitWithSameAccount(sourceId) {
  return evaluate(
    browser.cdp,
    `(async () => {
      const form = document.querySelector("[data-form]");
      const nativeFetch = window.fetch.bind(window);
      let requests = 0;
      window.fetch = async (...args) => { requests += 1; return nativeFetch(...args); };
      form.amountMinor.value = "1000";
      form.description.value = "QA 677 mesma conta";
      form.destinationAccountId.value = ${JSON.stringify(sourceId)};
      form.destinationAccountId.dispatchEvent(new Event("change", { bubbles: true }));
      const valid = form.checkValidity();
      const message = form.destinationAccountId.validationMessage;
      form.querySelector('[type="submit"]').click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      window.fetch = nativeFetch;
      return { valid, message, requests };
    })()`,
  );
}

async function switchKindRoundTrip(destinationId) {
  return evaluate(
    browser.cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      form.destinationAccountId.value = ${JSON.stringify(destinationId)};
      form.destinationAccountId.dispatchEvent(new Event("change", { bubbles: true }));
      form.kind.value = "expense";
      form.kind.dispatchEvent(new Event("change", { bubbles: true }));
      const hiddenOnExpense = form.querySelector('[data-field="destinationAccountId"]').hidden && form.querySelector('[data-field="sourceAccount"]').hidden;
      const submittedOnExpense = new FormData(form).has("destinationAccountId");
      form.kind.value = "transfer";
      form.kind.dispatchEvent(new Event("change", { bubbles: true }));
      return {
        hiddenOnExpense,
        submittedOnExpense,
        destinationAfterReturn: form.destinationAccountId.value,
        sourceAfterReturn: form.querySelector("[data-source-account-display]").value
      };
    })()`,
  );
}

async function selectDestination(destinationId) {
  return evaluate(
    browser.cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      form.destinationAccountId.value = ${JSON.stringify(destinationId)};
      form.destinationAccountId.dispatchEvent(new Event("change", { bubbles: true }));
      const fixedOption = form.repeatMode.querySelector('[data-repeat-option="fixed"]');
      const visibleLabels = Array.from(form.querySelectorAll(".field-label")).filter((node) => !node.closest("[hidden]"));
      const singleLine = (node) => node.getBoundingClientRect().height <= parseFloat(getComputedStyle(node).lineHeight || "0") * 1.5;
      return {
        destinationAmountVisible: !form.querySelector('[data-field="destinationAmountMinor"]').hidden,
        fixedDisabled: Boolean(fixedOption?.disabled),
        repeatMode: form.repeatMode.value,
        unbrokenCurrencyLabels: visibleLabels.length > 0 && visibleLabels.every(singleLine)
      };
    })()`,
  );
}

async function submitTransfer(fixture, repeatMode) {
  return evaluate(
    browser.cdp,
    `(async () => {
      const form = document.querySelector("[data-form]");
      form.destinationAccountId.value = ${JSON.stringify(fixture.destinationId)};
      form.destinationAccountId.dispatchEvent(new Event("change", { bubbles: true }));
      form.repeatMode.value = ${JSON.stringify(repeatMode)};
      form.repeatMode.dispatchEvent(new Event("change", { bubbles: true }));
      form.amountMinor.value = "12345";
      form.amountMinor.dispatchEvent(new Event("input", { bubbles: true }));
      form.description.value = "QA 677 " + ${JSON.stringify(repeatMode)};
      const nativeFetch = window.fetch.bind(window);
      const nativeSetTimeout = window.setTimeout.bind(window);
      let status;
      let requestPath;
      let requestBody;
      let responseBody;
      window.fetch = async (...args) => {
        const path = String(args[0] || "").split("?")[0];
        const method = String(args[1]?.method || "GET").toUpperCase();
        const tracked = method === "POST" && (path === "/api/transactions" || path === "/api/recurrences");
        if (tracked) { requestPath = path; requestBody = JSON.parse(String(args[1]?.body || "{}")); }
        const response = await nativeFetch(...args);
        if (tracked) { status = response.status; responseBody = await response.clone().json().catch(() => ({})); }
        return response;
      };
      window.setTimeout = (callback, delay, ...args) => {
        if (delay === 350 && String(callback).includes("location.reload")) return 0;
        return nativeSetTimeout(callback, delay, ...args);
      };
      form.querySelector('[type="submit"]').click();
      for (let attempt = 0; attempt < 80 && status === undefined; attempt += 1) {
        await new Promise((resolve) => nativeSetTimeout(resolve, 100));
      }
      window.fetch = nativeFetch;
      window.setTimeout = nativeSetTimeout;
      const list = await nativeFetch("/api/transactions?accountId=" + encodeURIComponent(${JSON.stringify(fixture.sourceId)})).then((response) => response.json());
      const recurrenceId = responseBody?.recurrence?.id;
      const persisted = list.transactions?.find((transaction) =>
        recurrenceId ? transaction.recurrenceId === recurrenceId : transaction.id === responseBody?.transaction?.id,
      );
      return { status, requestPath, requestBody, responseBody, persisted };
    })()`,
  );
}

async function openEdit(transactionId) {
  // Row actions stay unavailable until the installment eligibility enrichment finishes.
  await evaluate(
    browser.cdp,
    `(async () => {
      const selector = '[data-edit="' + ${JSON.stringify(transactionId ?? "")} + '"]';
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const button = document.querySelector(selector);
        if (button && !button.disabled && button.getAttribute("aria-disabled") !== "true") {
          button.click();
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (document.querySelector("[data-modal]")?.open) return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("Edit action for the transfer did not open on the destination statement");
    })()`,
  );
  await sleep(150);
  return evaluate(
    browser.cdp,
    `(() => {
      const dialog = document.querySelector("[data-modal]");
      const form = document.querySelector("[data-form]");
      const editField = form.querySelector("[data-edit-account-field]");
      const editSelect = form.querySelector("[data-edit-account-select]");
      return {
        open: Boolean(dialog?.open),
        editSourceLabel: editField?.firstChild?.nodeValue?.trim() || "",
        editSourceValue: editSelect && !editSelect.disabled ? editSelect.value : "",
        readOnlySourceVisible: !form.querySelector('[data-field="sourceAccount"]').hidden,
        destinationVisible: !form.querySelector('[data-field="destinationAccountId"]').hidden,
        destinationValue: form.destinationAccountId.value
      };
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
    const create = (name, currency) => request("/api/accounts", "POST", {
      name: name + " " + suffix,
      kind: "checking",
      openingBalanceMinor: 0,
      currency
    }).then((payload) => payload.account);
    const source = await create("QA 677 Origem", "BRL");
    const destination = await create("QA 677 Destino", "BRL");
    const usd = await create("QA 677 Exterior", "USD");

    return {
      sourceId: source.id,
      sourceName: source.name,
      destinationId: destination.id,
      usdId: usd.id
    };
  })()`;
}

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}
