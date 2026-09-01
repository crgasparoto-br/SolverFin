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

if (!chromePath) throw new Error("CHROME_BIN is required for issue 539 visual validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixture = await evaluate(browser.cdp, fixtureExpression());

  await validateAccountDesktop(fixture);
  await validateAccountMobile(fixture);
  await validateBlockedAccountDesktop(fixture);
  await validateConflictAccountDesktop(fixture);
  await validateCardDesktop(fixture);
  await validateCardMobile(fixture);
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
  join(outputDir, "issue-539-operational-installments.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Issue 539 operational installments visual validation passed.");
}

async function validateAccountDesktop(fixture) {
  await setViewport(browser.cdp, 1366, 768);
  const route = `/lancamentos?accountId=${encodeURIComponent(fixture.accountId)}&month=2026-07`;
  await navigate(browser.cdp, `${baseUrl}${route}`);
  const line = await waitForAccountLine(fixture.accountTransactionId);
  check(line.badge === fixture.accountBadge, "Account installment badge is missing", line);
  check(line.hasRecurrenceIndicator, "Recurrence indicator was not preserved", line);
  check(line.editable, "Installment edit action did not become available", line);

  await evaluate(
    browser.cdp,
    `document.querySelector('[data-edit="${fixture.accountTransactionId}"]').click()`,
  );
  await sleep(250);
  const modal = await readAccountModal(fixture.archivedCategoryId);
  check(modal.open, "Restricted installment modal did not open", modal);
  check(modal.title === "Editar parcela", "Restricted modal title is incorrect", modal);
  check(
    modal.categoryValue === fixture.archivedCategoryId,
    "Archived category was not preserved",
    modal,
  );
  check(modal.categoryLabel.includes("arquivada"), "Archived category is not identified", modal);
  check(modal.categoryOptionDisabled, "Archived historical option should be read-only", modal);
  check(
    modal.visibleEditableNames.join(",") === "categoryId,description,note",
    "Restricted modal exposes fields outside the allowlist",
    modal,
  );
  check(modal.focusName === "description", "Initial focus did not move to description", modal);

  const filename = "issue-539-account-installment-desktop-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, filename));
  scenarios.push({
    route,
    viewport: "1366x768",
    state: "editable archived category",
    screenshot: filename,
    modal,
  });

  const newDescription = `QA issue 539 ajustada ${Date.now().toString(36)}`;
  const saveResult = await evaluate(
    browser.cdp,
    `(async () => {
      const form = document.querySelector("[data-form]");
      const nativeFetch = window.fetch.bind(window);
      const nativeSetTimeout = window.setTimeout.bind(window);
      let patchResult;
      window.fetch = async (...args) => {
        const response = await nativeFetch(...args);
        const path = String(args[0] || "");
        const method = String(args[1]?.method || "GET").toUpperCase();
        if (path.includes("/api/installments/") && method === "PATCH") {
          patchResult = { status: response.status, body: await response.clone().json().catch(() => ({})) };
        }
        return response;
      };
      window.setTimeout = (callback, delay, ...args) => {
        if (delay === 450 && String(callback).includes("location.reload")) return 0;
        return nativeSetTimeout(callback, delay, ...args);
      };
      form.description.value = ${JSON.stringify(newDescription)};
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      for (let attempt = 0; attempt < 50 && !patchResult; attempt += 1) {
        await new Promise((resolve) => nativeSetTimeout(resolve, 100));
      }
      window.fetch = nativeFetch;
      window.setTimeout = nativeSetTimeout;
      return {
        patchResult,
        statusText: form.querySelector("[data-installment-status-message]")?.textContent || ""
      };
    })()`,
  );
  check(
    saveResult.patchResult?.status === 200,
    "Installment form did not persist through PATCH",
    saveResult,
  );
  const persisted = await evaluate(
    browser.cdp,
    `fetch("/api/installments?installmentId=${fixture.accountInstallmentId}&status=all")
      .then((response) => response.json())
      .then((body) => body.installments[0])`,
  );
  check(
    persisted.transaction.description === newDescription,
    "Description was not persisted",
    persisted,
  );
  check(
    persisted.transaction.categoryId === fixture.archivedCategoryId,
    "Editing description removed the archived category",
    persisted,
  );

  const genericGuard = await evaluate(
    browser.cdp,
    `(async () => {
      const response = await fetch("/api/transactions/${fixture.accountTransactionId}", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountMinor: 1 })
      });
      return { status: response.status, body: await response.json() };
    })()`,
  );
  check(
    genericGuard.status === 409,
    "Generic transaction endpoint bypassed installment rules",
    genericGuard,
  );
  check(
    genericGuard.body?.error?.code === "INSTALLMENT_DIRECT_UPDATE_REQUIRED",
    "Generic endpoint returned the wrong guard code",
    genericGuard,
  );
}

async function validateAccountMobile(fixture) {
  await setViewport(browser.cdp, 390, 844);
  const route = `/lancamentos?accountId=${encodeURIComponent(fixture.accountId)}&month=2026-07`;
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await waitForAccountLine(fixture.accountTransactionId);
  await evaluate(
    browser.cdp,
    `document.querySelector('[data-edit="${fixture.accountTransactionId}"]').click()`,
  );
  await sleep(250);
  const modal = await readAccountModal(fixture.archivedCategoryId);
  check(
    !modal.globalOverflow,
    "Account installment modal causes horizontal overflow on mobile",
    modal,
  );
  check(modal.dialogWithinViewport, "Account installment modal escapes the mobile viewport", modal);

  const filename = "issue-539-account-installment-mobile-390x844.png";
  await screenshot(browser.cdp, join(outputDir, filename));
  scenarios.push({
    route,
    viewport: "390x844",
    state: "restricted modal",
    screenshot: filename,
    modal,
  });

  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
  await sleep(120);
  const closed = await evaluate(browser.cdp, `!document.querySelector("[data-modal]").open`);
  check(closed, "Escape did not close the installment modal", { closed });
}

async function validateBlockedAccountDesktop(fixture) {
  await setViewport(browser.cdp, 1366, 768);
  const accountId = encodeURIComponent(fixture.accountId);
  const route = `/lancamentos?accountId=${accountId}&month=${fixture.blockedAccountMonth}`;
  await navigate(browser.cdp, `${baseUrl}${route}`);
  const line = await waitForAccountLine(fixture.blockedAccountTransactionId);
  check(line.installmentEditable === false, "Blocked installment was presented as editable", line);

  await evaluate(
    browser.cdp,
    `document.querySelector('[data-edit="${fixture.blockedAccountTransactionId}"]').click()`,
  );
  await sleep(250);
  const modal = await readAccountModal(fixture.archivedCategoryId);
  check(modal.open, "Read-only installment modal did not open", modal);
  check(modal.title === "Detalhes da parcela", "Read-only modal title is incorrect", modal);
  check(modal.visibleEditableNames.length === 0, "Read-only modal exposes editable fields", modal);
  check(modal.saveHidden, "Read-only modal still exposes the save action", modal);
  check(
    modal.reasonText === "O lançamento já foi efetivado, conciliado ou cancelado.",
    "Read-only modal did not translate the block reason",
    modal,
  );

  const filename = "issue-539-account-installment-blocked-desktop-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, filename));
  scenarios.push({
    route,
    viewport: "1366x768",
    state: "read-only reconciled installment",
    screenshot: filename,
    modal,
  });
  await evaluate(browser.cdp, `document.querySelector("[data-modal]").close()`);
}

async function validateConflictAccountDesktop(fixture) {
  await setViewport(browser.cdp, 1366, 768);
  const route = `/lancamentos?accountId=${encodeURIComponent(fixture.accountId)}&month=2026-09`;
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await waitForAccountLine(fixture.conflictAccountTransactionId);
  await evaluate(
    browser.cdp,
    `document.querySelector('[data-edit="${fixture.conflictAccountTransactionId}"]').click()`,
  );
  await sleep(250);
  const attemptedDescription = `Conflito preservado ${Date.now().toString(36)}`;
  const conflict = await evaluate(
    browser.cdp,
    `(async () => {
      const form = document.querySelector("[data-form]");
      const nativeFetch = window.fetch.bind(window);
      const nativeSetTimeout = window.setTimeout.bind(window);
      form.description.value = ${JSON.stringify(attemptedDescription)};
      const statusResponse = await nativeFetch("/api/transactions/${fixture.conflictAccountTransactionId}", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "reconciled" })
      });
      let patchResult;
      window.fetch = async (...args) => {
        const response = await nativeFetch(...args);
        const path = String(args[0] || "");
        const method = String(args[1]?.method || "GET").toUpperCase();
        if (path.includes("/api/installments/") && method === "PATCH") {
          patchResult = { status: response.status, body: await response.clone().json().catch(() => ({})) };
        }
        return response;
      };
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      for (let attempt = 0; attempt < 50 && !patchResult; attempt += 1) {
        await new Promise((resolve) => nativeSetTimeout(resolve, 100));
      }
      window.fetch = nativeFetch;
      return {
        statusUpdate: statusResponse.status,
        patchResult,
        modalOpen: document.querySelector("[data-modal]").open,
        statusText: form.querySelector("[data-installment-status-message]")?.textContent || "",
        descriptionValue: form.description.value,
        reloadVisible: Boolean(form.querySelector("[data-installment-reload]"))
      };
    })()`,
  );
  check(conflict.statusUpdate === 200, "Concurrent status transition failed", conflict);
  check(conflict.patchResult?.status === 409, "Stale installment edit was not rejected", conflict);
  check(conflict.modalOpen, "Conflict closed the installment modal", conflict);
  check(
    conflict.descriptionValue === attemptedDescription,
    "Conflict did not preserve the typed description",
    conflict,
  );
  check(conflict.reloadVisible, "Conflict did not expose the reload action", conflict);
  check(
    conflict.statusText.includes("estado da parcela mudou"),
    "Conflict message is not actionable",
    conflict,
  );

  const filename = "issue-539-account-installment-conflict-desktop-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, filename));
  scenarios.push({
    route,
    viewport: "1366x768",
    state: "stale edit conflict",
    screenshot: filename,
    conflict,
  });

  await evaluate(browser.cdp, `document.querySelector("[data-installment-reload]").click()`);
  await sleep(300);
  const reloaded = await readAccountModal(fixture.archivedCategoryId);
  check(
    reloaded.title === "Detalhes da parcela",
    "Reload did not reflect the blocked state",
    reloaded,
  );
  check(
    reloaded.visibleEditableNames.length === 0,
    "Reload kept blocked fields editable",
    reloaded,
  );
  check(
    reloaded.descriptionValue === fixture.conflictAccountOriginalDescription,
    "Reload did not restore the persisted description",
    reloaded,
  );
  await evaluate(browser.cdp, `document.querySelector("[data-modal]").close()`);
}

async function validateCardDesktop(fixture) {
  await setViewport(browser.cdp, 1366, 768);
  const route = `/cartoes?cardId=${encodeURIComponent(fixture.cardId)}&invoiceId=${encodeURIComponent(fixture.invoiceId)}`;
  await navigate(browser.cdp, `${baseUrl}${route}`);
  const line = await waitForCardLine(fixture.cardTransactionId);
  check(line.badge === fixture.cardBadge, "Card installment badge is missing", line);
  check(line.purchaseEditEnabled, "Open invoice purchase was incorrectly blocked", line);
  check(!line.hasInstallmentEdit, "Card purchase was redirected to installment PATCH", line);
  check(
    line.blockReason === "Esta parcela é alterada pela compra da fatura.",
    "Invoice-linked installment exposed the wrong block reason",
    line,
  );
  check(line.badgeTabIndex === 0, "Blocked installment badge is not keyboard focusable", line);
  check(
    line.accessibleDescription === line.blockReason,
    "Blocked installment badge is missing an accessible description",
    line,
  );

  const badgeFocus = await evaluate(
    browser.cdp,
    `(() => {
      const badge = document.querySelector('[data-installment-badge="${fixture.cardInstallmentId}"]');
      badge.focus();
      return {
        focused: document.activeElement === badge,
        tooltipVisible: getComputedStyle(badge, "::after").display !== "none"
      };
    })()`,
  );
  check(badgeFocus.focused, "Blocked installment badge did not receive focus", badgeFocus);
  check(badgeFocus.tooltipVisible, "Block reason tooltip did not open on focus", badgeFocus);

  const installmentState = await evaluate(
    browser.cdp,
    `fetch("/api/installments?installmentId=${fixture.cardInstallmentId}&status=all")
      .then((response) => response.json())
      .then((body) => body.installments[0])`,
  );
  check(
    installmentState.editBlockedReason === "invoice_linked",
    "API did not prioritize invoice_linked for the card purchase",
    installmentState,
  );

  await evaluate(
    browser.cdp,
    `document.querySelector('[data-edit-purchase="${fixture.cardTransactionId}"]').click()`,
  );
  await sleep(250);
  const purchaseModal = await evaluate(
    browser.cdp,
    `(() => {
      const dialog = document.querySelector('dialog[data-modal="purchase"]');
      return {
        open: dialog.open,
        title: document.querySelector("[data-purchase-modal-title]")?.textContent,
        method: document.querySelector("[data-purchase-form]")?.dataset.method,
        globalOverflow: document.documentElement.scrollWidth > window.innerWidth
      };
    })()`,
  );
  check(purchaseModal.open, "Card purchase modal did not open", purchaseModal);
  check(
    purchaseModal.title === "Editar compra",
    "Card still does not use purchase edit flow",
    purchaseModal,
  );
  check(
    purchaseModal.method === "PATCH",
    "Card purchase endpoint was not preserved",
    purchaseModal,
  );

  const filename = "issue-539-card-installment-desktop-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, filename));
  scenarios.push({
    route,
    viewport: "1366x768",
    state: "purchase edit",
    screenshot: filename,
    purchaseModal,
  });
}

async function validateCardMobile(fixture) {
  await setViewport(browser.cdp, 390, 844);
  const route = `/cartoes?cardId=${encodeURIComponent(fixture.cardId)}&invoiceId=${encodeURIComponent(fixture.invoiceId)}`;
  await navigate(browser.cdp, `${baseUrl}${route}`);
  const line = await waitForCardLine(fixture.cardTransactionId);
  check(!line.globalOverflow, "Card installment row causes horizontal overflow on mobile", line);

  const filename = "issue-539-card-installment-mobile-390x844.png";
  await screenshot(browser.cdp, join(outputDir, filename));
  scenarios.push({
    route,
    viewport: "390x844",
    state: "installment badge",
    screenshot: filename,
    line,
  });
}

async function waitForAccountLine(transactionId) {
  return evaluate(
    browser.cdp,
    `(async () => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const node = document.querySelector('script[data-transaction="${transactionId}"]');
        const row = node?.closest("article");
        const edit = row?.querySelector('[data-edit="${transactionId}"]');
        const badge = row?.querySelector("[data-installment-badge]");
        if (row && edit && badge && !edit.disabled) {
          return {
            badge: badge.textContent.trim(),
            editable: Boolean(edit.dataset.installmentEdit) && !edit.disabled,
            installmentEditable: edit.dataset.installmentEditable === "true",
            hasRecurrenceIndicator: Boolean(row.querySelector(".recurrence-indicator")),
            globalOverflow: document.documentElement.scrollWidth > window.innerWidth
          };
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("Timed out waiting for account installment decoration");
    })()`,
  );
}

async function waitForCardLine(transactionId) {
  return evaluate(
    browser.cdp,
    `(async () => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const node = document.querySelector('script[data-purchase="${transactionId}"]');
        const row = node?.closest("article");
        const edit = row?.querySelector('[data-edit-purchase="${transactionId}"]');
        const badge = row?.querySelector("[data-installment-badge]");
        if (row && edit && badge) {
          const descriptionId = badge.getAttribute("aria-describedby") || "";
          return {
            badge: badge.textContent.trim(),
            purchaseEditEnabled: !edit.disabled,
            hasInstallmentEdit: Boolean(edit.dataset.installmentEdit),
            blockReason: badge.dataset.installmentBlockReason || "",
            badgeTabIndex: badge.tabIndex,
            accessibleDescription: document.getElementById(descriptionId)?.textContent || "",
            globalOverflow: document.documentElement.scrollWidth > window.innerWidth
          };
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("Timed out waiting for card installment decoration");
    })()`,
  );
}

async function readAccountModal(categoryId) {
  return evaluate(
    browser.cdp,
    `(() => {
      const dialog = document.querySelector("[data-modal]");
      const form = document.querySelector("[data-form]");
      const option = form.categoryId.querySelector('option[value="${categoryId}"]');
      const rect = dialog.getBoundingClientRect();
      const visibleEditableNames = Array.from(form.querySelectorAll("input, select, textarea"))
        .filter((control) => {
          const label = control.closest("label");
          return label && !label.hidden && !control.disabled && control.type !== "hidden";
        })
        .map((control) => control.name)
        .sort();
      return {
        open: dialog.open,
        title: document.querySelector("[data-modal-title]")?.textContent,
        categoryValue: form.categoryId.value,
        categoryLabel: option?.textContent || "",
        categoryOptionDisabled: Boolean(option?.disabled),
        visibleEditableNames,
        focusName: document.activeElement?.name || "",
        reasonText: form.querySelector("[data-installment-reason]")?.textContent || "",
        saveHidden: Boolean(form.querySelector('.save-row button[type="submit"]')?.hidden),
        descriptionValue: form.description.value,
        reloadVisible: Boolean(form.querySelector("[data-installment-reload]")),
        globalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        dialogWithinViewport: rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight
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
    const account = (await request("/api/accounts", "POST", {
      name: "QA Issue 539 - Conta " + suffix,
      kind: "checking",
      openingBalanceMinor: 0,
      currency: "BRL"
    })).account;
    const category = (await request("/api/categories", "POST", {
      name: "Categoria historica QA " + suffix,
      kind: "expense"
    })).category;
    const accountRecurrence = (await request("/api/recurrences", "POST", {
      frequency: "monthly",
      startOn: "2026-07-05",
      endOn: "2026-09-05",
      amountMinor: 12345,
      description: "QA issue 539 parcela conta",
      kind: "expense",
      accountId: account.id,
      categoryId: category.id
    })).recurrence;
    await request("/api/recurrences/" + accountRecurrence.id + "/generate-installments", "POST", {
      through: "2026-09-05",
      maxOccurrences: 3
    });
    const accountInstallments = (await request(
      "/api/installments?recurrenceId=" + accountRecurrence.id + "&status=all"
    )).installments;
    const accountInstallment = accountInstallments.find(
      (item) => item.dueOn === "2026-07-05" && item.transaction?.id,
    );
    const blockedAccountInstallment = accountInstallments.find(
      (item) => item.dueOn === "2026-08-05" && item.transaction?.id,
    );
    const conflictAccountInstallment = accountInstallments.find(
      (item) => item.dueOn === "2026-09-05" && item.transaction?.id,
    );
    let blockedAccountMonth = "";
    if (blockedAccountInstallment?.transaction?.id) {
      const reconciled = await request(
        "/api/transactions/" + blockedAccountInstallment.transaction.id,
        "PATCH",
        { status: "reconciled" },
      );
      const effectiveOn = reconciled.transaction?.effectiveOn || "";
      blockedAccountMonth = String(effectiveOn).slice(0, 7);
    }
    await request("/api/categories/" + category.id + "/archive", "POST");

    const card = (await request("/api/credit-card-accounts", "POST", {
      name: "QA Issue 539 - Cartao " + suffix,
      closingDay: 20,
      dueDay: 10,
      creditLimitMinor: 80000,
      instruments: [{
        type: "physical",
        holder: "primary",
        name: "Fisico QA",
        maskedIdentifier: "**** 5390"
      }]
    })).creditCardAccount;
    const instrument = card.instruments[0];
    const cardRecurrence = (await request("/api/recurrences", "POST", {
      frequency: "monthly",
      startOn: "2026-07-08",
      endOn: "2026-09-08",
      amountMinor: 2468,
      description: "QA issue 539 parcela cartao",
      cardId: card.id,
      cardInstrumentId: instrument.id
    })).recurrence;
    await request("/api/recurrences/" + cardRecurrence.id + "/generate-installments", "POST", {
      through: "2026-09-08",
      maxOccurrences: 3
    });
    const cardInstallments = (await request(
      "/api/installments?recurrenceId=" + cardRecurrence.id + "&status=all"
    )).installments;
    const cardInstallment = cardInstallments.find(
      (item) => item.dueOn === "2026-07-08" && item.transaction?.invoiceId,
    );

    if (
      !accountInstallment?.transaction?.id ||
      !blockedAccountInstallment?.transaction?.id ||
      !blockedAccountMonth ||
      !conflictAccountInstallment?.transaction?.id ||
      !cardInstallment?.transaction?.invoiceId
    ) {
      throw new Error("Issue 539 fixture did not create linked operational installments");
    }

    return {
      accountId: account.id,
      archivedCategoryId: category.id,
      accountInstallmentId: accountInstallment.id,
      accountTransactionId: accountInstallment.transaction.id,
      accountBadge: "Parcela " + accountInstallment.sequenceNumber + " de " + accountInstallment.totalInstallments,
      blockedAccountMonth,
      blockedAccountTransactionId: blockedAccountInstallment.transaction.id,
      conflictAccountTransactionId: conflictAccountInstallment.transaction.id,
      conflictAccountOriginalDescription: conflictAccountInstallment.transaction.description,
      cardId: card.id,
      invoiceId: cardInstallment.transaction.invoiceId,
      cardInstallmentId: cardInstallment.id,
      cardTransactionId: cardInstallment.transaction.id,
      cardBadge: "Parcela " + cardInstallment.sequenceNumber + " de " + cardInstallment.totalInstallments
    };
  })()`;
}

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}