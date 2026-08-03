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
  throw new Error("CHROME_BIN is required for issue 553 transfer visibility validation.");
}

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixture = await evaluate(browser.cdp, fixtureExpression());

  const sourceRoute = `/lancamentos?accountId=${encodeURIComponent(fixture.sourceAccountId)}&month=2026-09`;
  await navigate(browser.cdp, `${baseUrl}${sourceRoute}`);
  const sourceLine = await waitForDecoratedLine(fixture.transactionId);
  check(sourceLine.badge === fixture.badge, "Source statement badge is missing", sourceLine);
  check(sourceLine.rowCount === 1, "Source statement duplicated the transfer row", sourceLine);
  check(
    sourceLine.installmentId === fixture.installmentId,
    "Source statement resolved another installment",
    sourceLine,
  );
  const sourceScreenshot = "issue-553-transfer-source-account-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, sourceScreenshot));
  scenarios.push({
    route: sourceRoute,
    viewport: "1366x768",
    state: "source account canonical transfer installment",
    screenshot: sourceScreenshot,
    line: sourceLine,
  });

  const destinationRoute = `/lancamentos?accountId=${encodeURIComponent(fixture.destinationAccountId)}&month=2026-09`;
  await navigate(browser.cdp, `${baseUrl}${destinationRoute}`);
  const destinationLine = await waitForDecoratedLine(fixture.transactionId);
  check(
    destinationLine.badge === fixture.badge,
    "Destination statement badge is missing",
    destinationLine,
  );
  check(
    destinationLine.rowCount === 1,
    "Destination statement duplicated the transfer row",
    destinationLine,
  );
  check(
    destinationLine.installmentId === fixture.installmentId,
    "Destination statement resolved another installment",
    destinationLine,
  );
  check(
    destinationLine.installmentEditable,
    "Destination statement did not expose conservative installment editing",
    destinationLine,
  );

  await evaluate(
    browser.cdp,
    `document.querySelector('[data-edit="${fixture.transactionId}"]').click()`,
  );
  await sleep(250);
  const modal = await readModal();
  check(modal.open, "Destination installment modal did not open", modal);
  check(modal.title === "Editar parcela", "Destination modal did not use installment mode", modal);
  check(
    modal.visibleEditableNames.join(",") === "categoryId,description,note",
    "Destination modal exposed fields outside the conservative allowlist",
    modal,
  );

  const updatedDescription = `Transferencia ajustada pelo destino ${Date.now().toString(36)}`;
  const save = await saveDescription(updatedDescription, fixture.installmentId);
  check(save.patchStatus === 200, "Destination edit did not use installment PATCH", save);
  check(
    save.persistedDescription === updatedDescription,
    "Destination edit was not persisted",
    save,
  );

  const destinationScreenshot = "issue-553-transfer-destination-account-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, destinationScreenshot));
  scenarios.push({
    route: destinationRoute,
    viewport: "1366x768",
    state: "destination account badge and conservative edit",
    screenshot: destinationScreenshot,
    line: destinationLine,
    modal,
    save,
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
  join(outputDir, "issue-553-transfer-destination-visibility.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Issue 553 transfer destination visibility validation passed.");
}

async function waitForDecoratedLine(transactionId) {
  return evaluate(
    browser.cdp,
    `(async () => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const nodes = Array.from(document.querySelectorAll('script[data-transaction="${transactionId}"]'));
        const row = nodes[0]?.closest("article");
        const edit = row?.querySelector('[data-edit="${transactionId}"]');
        const badge = row?.querySelector("[data-installment-badge]");
        if (row && edit && badge && !edit.disabled) {
          return {
            badge: badge.textContent.trim(),
            rowCount: nodes.length,
            installmentId: edit.dataset.installmentEdit || "",
            installmentEditable: edit.dataset.installmentEditable === "true",
            globalOverflow: document.documentElement.scrollWidth > window.innerWidth
          };
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("Timed out waiting for transfer installment decoration");
    })()`,
  );
}

async function readModal() {
  return evaluate(
    browser.cdp,
    `(() => {
      const dialog = document.querySelector("[data-modal]");
      const form = document.querySelector("[data-form]");
      const visibleEditableNames = Array.from(form.querySelectorAll("input, select, textarea"))
        .filter((control) => {
          const label = control.closest("label");
          return label && !label.hidden && !control.disabled && control.type !== "hidden";
        })
        .map((control) => control.name)
        .sort();
      return {
        open: dialog.open,
        title: document.querySelector("[data-modal-title]")?.textContent || "",
        visibleEditableNames,
        description: form.description.value,
        globalOverflow: document.documentElement.scrollWidth > window.innerWidth
      };
    })()`,
  );
}

async function saveDescription(description, installmentId) {
  return evaluate(
    browser.cdp,
    `(async () => {
      const form = document.querySelector("[data-form]");
      const nativeFetch = window.fetch.bind(window);
      const nativeSetTimeout = window.setTimeout.bind(window);
      let patchStatus;
      window.fetch = async (...args) => {
        const response = await nativeFetch(...args);
        const path = String(args[0] || "");
        const method = String(args[1]?.method || "GET").toUpperCase();
        if (path.includes("/api/installments/") && method === "PATCH") {
          patchStatus = response.status;
        }
        return response;
      };
      window.setTimeout = (callback, delay, ...args) => {
        if (delay === 450 && String(callback).includes("location.reload")) return 0;
        return nativeSetTimeout(callback, delay, ...args);
      };
      form.description.value = ${JSON.stringify(description)};
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      for (let attempt = 0; attempt < 50 && patchStatus === undefined; attempt += 1) {
        await new Promise((resolve) => nativeSetTimeout(resolve, 100));
      }
      const persisted = await nativeFetch(
        "/api/installments?installmentId=${installmentId}&status=all",
      ).then((response) => response.json());
      window.fetch = nativeFetch;
      window.setTimeout = nativeSetTimeout;
      return {
        patchStatus,
        persistedDescription: persisted.installments[0]?.transaction?.description || "",
        statusText: form.querySelector("[data-installment-status-message]")?.textContent || ""
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
    const sourceAccount = (await request("/api/accounts", "POST", {
      name: "QA Issue 553 origem " + suffix,
      kind: "checking",
      openingBalanceMinor: 0,
      currency: "BRL"
    })).account;
    const destinationAccount = (await request("/api/accounts", "POST", {
      name: "QA Issue 553 destino " + suffix,
      kind: "checking",
      openingBalanceMinor: 0,
      currency: "BRL"
    })).account;
    const created = await request("/api/installments", "POST", {
      accountId: sourceAccount.id,
      destinationAccountId: destinationAccount.id,
      kind: "transfer",
      status: "planned",
      description: "QA transferencia parcelada entre contas",
      note: "Visibilidade canonica no destino",
      plannedOn: "2026-09-15",
      effectiveOn: null,
      amountMinor: 4200,
      amountMode: "per_installment",
      totalInstallments: 2,
      initialSequenceNumber: 1,
      idempotencyKey: crypto.randomUUID()
    });
    const installment = created.installments[0];
    if (!installment?.transaction?.id) {
      throw new Error("Issue 553 transfer fixture did not create a linked transaction");
    }
    return {
      sourceAccountId: sourceAccount.id,
      destinationAccountId: destinationAccount.id,
      installmentId: installment.id,
      transactionId: installment.transaction.id,
      badge: "Parcela " + installment.sequenceNumber + " de " + installment.totalInstallments
    };
  })()`;
}

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}
