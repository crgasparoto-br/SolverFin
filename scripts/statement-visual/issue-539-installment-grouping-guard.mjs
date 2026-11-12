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

if (!chromePath) throw new Error("CHROME_BIN is required for issue 539 grouping guard validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixture = await evaluate(browser.cdp, fixtureExpression());
  const route = `/lancamentos?accountId=${encodeURIComponent(fixture.accountId)}&month=2026-07`;

  await navigate(browser.cdp, `${baseUrl}${route}`);
  const desktop = await waitForGuardedLine(fixture.installmentTransactionId);
  check(desktop.badge === fixture.badge, "Canonical installment badge is missing", desktop);
  check(
    !desktop.selectionDisabled,
    "Canonical installment is unavailable for bulk actions",
    desktop,
  );
  check(
    desktop.selectionLabel.includes("indisponível para unificação"),
    "Canonical selection does not explain the grouping restriction",
    desktop,
  );
  check(
    desktop.installmentQueries === 1,
    "Grouping guard added another installments query",
    desktop,
  );

  await selectTransactions([fixture.installmentTransactionId]);
  const unreconcileSelection = await readSelectionState(
    fixture.installmentTransactionId,
    fixture.ordinaryTransactionId,
  );
  check(
    unreconcileSelection.canonicalSelected,
    "Canonical installment was not selected",
    unreconcileSelection,
  );
  check(
    unreconcileSelection.groupingDisabled,
    "Grouping remained available with a canonical installment",
    unreconcileSelection,
  );
  check(
    unreconcileSelection.groupingTitle.includes("Desmarque as parcelas canônicas"),
    "Grouping restriction is not explained on the action",
    unreconcileSelection,
  );
  check(
    unreconcileSelection.help.includes(
      "continuam disponíveis para conciliar, desconciliar ou excluir",
    ),
    "Bulk action help does not distinguish grouping from allowed actions",
    unreconcileSelection,
  );
  check(
    !unreconcileSelection.unreconcileDisabled,
    "Unreconciliation was blocked for the canonical installment",
    unreconcileSelection,
  );
  check(
    !unreconcileSelection.voidDisabled,
    "Logical deletion was blocked for the canonical installment",
    unreconcileSelection,
  );

  const apiGuard = await evaluate(
    browser.cdp,
    `(async () => {
      const response = await fetch("/api/transaction-groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          memberIds: [${JSON.stringify(fixture.installmentTransactionId)}, ${JSON.stringify(fixture.ordinaryTransactionId)}],
          description: "Grupo inválido de parcela",
          displayOn: "2026-07-15"
        })
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    })()`,
  );
  check(apiGuard.status === 409, "Public API accepted a canonical installment group", apiGuard);
  check(
    apiGuard.body?.error?.code === "TRANSACTION_GROUP_INSTALLMENT_MEMBER_INELIGIBLE",
    "Public API returned the wrong grouping guard code",
    apiGuard,
  );

  const desktopScreenshot = "issue-539-installment-grouping-guard-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, desktopScreenshot));

  const unreconcile = await executeBulkAction({
    action: "unreconcile",
    expectedStatusText: "Conciliação desmarcada",
    installmentId: fixture.installmentId,
    transactionId: fixture.installmentTransactionId,
  });
  check(
    unreconcile.transaction?.status === "posted",
    "Canonical transaction was not posted",
    unreconcile,
  );
  check(
    unreconcile.installment?.transaction?.status === "posted",
    "Installment did not reflect unreconciliation",
    unreconcile,
  );

  await navigate(browser.cdp, `${baseUrl}${route}`);
  await waitForGuardedLine(fixture.installmentTransactionId);
  await selectTransactions([fixture.installmentTransactionId]);
  const reconcileSelection = await readSelectionState(
    fixture.installmentTransactionId,
    fixture.ordinaryTransactionId,
  );
  check(
    !reconcileSelection.reconcileDisabled,
    "Reconciliation was blocked for the canonical installment",
    reconcileSelection,
  );
  check(
    reconcileSelection.groupingDisabled,
    "Grouping became available during reconciliation selection",
    reconcileSelection,
  );

  const reconcile = await executeBulkAction({
    action: "reconcile",
    expectedStatusText: "Lançamentos conciliados",
    installmentId: fixture.installmentId,
    transactionId: fixture.installmentTransactionId,
  });
  check(
    reconcile.transaction?.status === "reconciled",
    "Canonical transaction was not reconciled",
    reconcile,
  );
  check(
    reconcile.installment?.transaction?.status === "reconciled",
    "Installment did not reflect reconciliation",
    reconcile,
  );

  scenarios.push({
    route,
    viewport: "1366x768",
    state: "canonical installment reconciled and unreconciled through bulk actions",
    screenshot: desktopScreenshot,
    desktop,
    unreconcileSelection,
    unreconcile,
    reconcileSelection,
    reconcile,
    apiGuard,
  });

  await setViewport(browser.cdp, 390, 844);
  await navigate(browser.cdp, `${baseUrl}${route}`);
  const mobile = await waitForGuardedLine(fixture.installmentTransactionId);
  check(
    !mobile.selectionDisabled,
    "Mobile canonical installment is unavailable for bulk actions",
    mobile,
  );
  check(!mobile.globalOverflow, "Grouping guard caused horizontal overflow on mobile", mobile);

  await selectTransactions([fixture.installmentTransactionId, fixture.ordinaryTransactionId]);
  const mobileSelection = await readSelectionState(
    fixture.installmentTransactionId,
    fixture.ordinaryTransactionId,
  );
  check(mobileSelection.groupingDisabled, "Mobile grouping remained available", mobileSelection);
  check(!mobileSelection.voidDisabled, "Mobile logical deletion remained blocked", mobileSelection);
  check(
    !mobileSelection.globalOverflow,
    "Bulk selection caused horizontal overflow on mobile",
    mobileSelection,
  );

  const mobileScreenshot = "issue-539-installment-grouping-guard-390x844.png";
  await screenshot(browser.cdp, join(outputDir, mobileScreenshot));

  const bulkVoid = await executeBulkAction({
    action: "void",
    expectedStatusText: "Lançamentos excluídos",
    installmentId: fixture.installmentId,
    transactionId: fixture.installmentTransactionId,
    additionalTransactionId: fixture.ordinaryTransactionId,
  });
  check(
    bulkVoid.installment?.id === fixture.installmentId,
    "Installment history was removed",
    bulkVoid,
  );
  check(
    bulkVoid.installment?.transaction?.status === "voided",
    "Canonical transaction was not voided",
    bulkVoid,
  );
  check(bulkVoid.installment?.editable === false, "Voided installment remained editable", bulkVoid);
  check(
    bulkVoid.installment?.editBlockedReason === "installment_status_locked",
    "Voided installment returned the wrong block reason",
    bulkVoid,
  );
  check(
    bulkVoid.additionalTransaction?.status === "voided",
    "Ordinary selected transaction was not voided",
    bulkVoid,
  );

  scenarios.push({
    route,
    viewport: "390x844",
    state: "canonical installment bulk logical deletion preserved history",
    screenshot: mobileScreenshot,
    mobile,
    mobileSelection,
    bulkVoid,
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
  join(outputDir, "issue-539-installment-grouping-guard.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Issue 539 installment grouping guard validation passed.");
}

async function waitForGuardedLine(transactionId) {
  return evaluate(
    browser.cdp,
    `(async () => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const node = document.querySelector('script[data-transaction="${transactionId}"]');
        const row = node?.closest("article");
        const selection = row?.querySelector("[data-select-transaction]");
        const badge = row?.querySelector("[data-installment-badge]");
        if (row && selection && badge && selection.dataset.canonicalInstallment === "true") {
          const installmentQueries = performance.getEntriesByType("resource")
            .map((entry) => new URL(entry.name, window.location.origin))
            .filter((url) => url.pathname === "/api/installments" && url.searchParams.has("accountId"))
            .length;
          return {
            badge: badge.textContent.trim(),
            selectionDisabled: selection.disabled,
            selectionLabel: selection.getAttribute("aria-label") || "",
            installmentQueries,
            globalOverflow: document.documentElement.scrollWidth > window.innerWidth
          };
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("Timed out waiting for canonical installment grouping guard");
    })()`,
  );
}

async function selectTransactions(transactionIds) {
  await evaluate(
    browser.cdp,
    `(() => {
      const ids = ${JSON.stringify(transactionIds)};
      ids.forEach((id) => {
        const input = document.querySelector('[data-select-transaction][value="' + id + '"]');
        if (!input) throw new Error("Missing selection input for " + id);
        if (!input.checked) input.click();
      });
    })()`,
  );
  await sleep(150);
}

async function readSelectionState(canonicalTransactionId, ordinaryTransactionId) {
  return evaluate(
    browser.cdp,
    `(() => {
      const canonical = document.querySelector('[data-select-transaction][value="${canonicalTransactionId}"]');
      const ordinary = document.querySelector('[data-select-transaction][value="${ordinaryTransactionId}"]');
      const groupOpen = document.querySelector("[data-group-open]");
      const reconcileButton = document.querySelector('[data-bulk-selection-action="reconcile"]');
      const unreconcileButton = document.querySelector('[data-bulk-selection-action="unreconcile"]');
      const voidButton = document.querySelector('[data-bulk-selection-action="void"]');
      return {
        canonicalSelected: canonical?.checked === true,
        ordinarySelected: ordinary?.checked === true,
        groupingDisabled: groupOpen?.disabled === true,
        groupingTitle: groupOpen?.title || "",
        help: document.querySelector("[data-bulk-selection-help]")?.textContent || "",
        reconcileDisabled: reconcileButton?.disabled !== false,
        unreconcileDisabled: unreconcileButton?.disabled !== false,
        voidDisabled: voidButton?.disabled !== false,
        selectionCount: document.querySelector("[data-selection-count]")?.textContent || "",
        globalOverflow: document.documentElement.scrollWidth > window.innerWidth
      };
    })()`,
  );
}

async function executeBulkAction({
  action,
  expectedStatusText,
  installmentId,
  transactionId,
  additionalTransactionId,
}) {
  await evaluate(
    browser.cdp,
    `(() => {
      const nativeSetTimeout = window.setTimeout.bind(window);
      window.confirm = () => true;
      window.setTimeout = function (callback, delay, ...args) {
        if (typeof callback === "function" && String(callback).includes("window.location.reload")) return 0;
        return nativeSetTimeout(callback, delay, ...args);
      };
      const button = document.querySelector('[data-bulk-selection-action="${action}"]');
      if (!button || button.disabled) throw new Error("Bulk ${action} action is unavailable");
      button.click();
    })()`,
  );

  return evaluate(
    browser.cdp,
    `(async () => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const statusText = document.querySelector("[data-bulk-selection-status]")?.textContent || "";
        if (statusText.includes(${JSON.stringify(expectedStatusText)})) {
          const installmentResponse = await fetch("/api/installments?installmentId=${installmentId}&status=all");
          const installmentBody = await installmentResponse.json();
          const transactionResponse = await fetch("/api/transactions/${transactionId}");
          const transactionBody = await transactionResponse.json();
          let additionalTransaction;
          if (${JSON.stringify(additionalTransactionId ?? "")}) {
            const additionalResponse = await fetch("/api/transactions/${additionalTransactionId ?? ""}");
            const additionalBody = await additionalResponse.json();
            additionalTransaction = additionalBody.transaction;
          }
          return {
            statusText,
            installment: installmentBody.installments?.[0],
            transaction: transactionBody.transaction,
            additionalTransaction
          };
        }
        if (statusText.includes("Não foi possível")) throw new Error(statusText);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("Timed out waiting for bulk ${action} action");
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
      if (!response.ok) throw new Error(method + " " + path + " failed: " + JSON.stringify(payload));
      return payload;
    }

    const suffix = Date.now().toString(36);
    const account = (await request("/api/accounts", "POST", {
      name: "QA guard parcela " + suffix,
      kind: "checking",
      openingBalanceMinor: 0,
      currency: "BRL"
    })).account;
    const category = (await request("/api/categories", "POST", {
      name: "Categoria guard " + suffix,
      kind: "expense"
    })).category;
    const installmentBody = await request("/api/installments", "POST", {
      accountId: account.id,
      categoryId: category.id,
      kind: "expense",
      status: "reconciled",
      description: "QA parcela fora de agrupamento",
      plannedOn: "2026-07-15",
      effectiveOn: "2026-07-15",
      amountMinor: 12345,
      amountMode: "per_installment",
      totalInstallments: 2,
      initialSequenceNumber: 2,
      idempotencyKey: crypto.randomUUID()
    });
    const installment = installmentBody.installments?.[0];
    if (!installment?.transaction?.id) throw new Error("Grouping guard fixture did not create an installment");

    const ordinary = (await request("/api/transactions", "POST", {
      kind: "expense",
      status: "posted",
      amountMinor: 6789,
      occurredOn: "2026-07-15",
      plannedOn: "2026-07-15",
      effectiveOn: "2026-07-15",
      accountId: account.id,
      categoryId: category.id,
      description: "QA lançamento comum para agrupamento"
    })).transaction;
    await request("/api/transactions/" + ordinary.id, "PATCH", {
      status: "reconciled"
    });

    return {
      accountId: account.id,
      installmentId: installment.id,
      installmentTransactionId: installment.transaction.id,
      ordinaryTransactionId: ordinary.id,
      badge: "Parcela " + installment.sequenceNumber + " de " + installment.totalInstallments
    };
  })()`;
}

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}
