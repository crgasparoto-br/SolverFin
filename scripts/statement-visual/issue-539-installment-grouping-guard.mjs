import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport } from "./cdp.mjs";
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
    desktop.selectionDisabled,
    "Canonical installment remained selectable for grouping",
    desktop,
  );
  check(
    desktop.selectionLabel.includes("indisponível para agrupamento"),
    "Disabled grouping selection is not explained accessibly",
    desktop,
  );
  check(
    desktop.installmentQueries === 1,
    "Grouping guard added another installments query",
    desktop,
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
  scenarios.push({
    route,
    viewport: "1366x768",
    state: "canonical installment grouping disabled",
    screenshot: desktopScreenshot,
    desktop,
    apiGuard,
  });

  await setViewport(browser.cdp, 390, 844);
  await navigate(browser.cdp, `${baseUrl}${route}`);
  const mobile = await waitForGuardedLine(fixture.installmentTransactionId);
  check(mobile.selectionDisabled, "Mobile grouping selection remained enabled", mobile);
  check(!mobile.globalOverflow, "Grouping guard caused horizontal overflow on mobile", mobile);

  const mobileScreenshot = "issue-539-installment-grouping-guard-390x844.png";
  await screenshot(browser.cdp, join(outputDir, mobileScreenshot));
  scenarios.push({
    route,
    viewport: "390x844",
    state: "canonical installment grouping disabled",
    screenshot: mobileScreenshot,
    mobile,
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
        if (row && selection && badge && selection.disabled) {
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
    const recurrence = (await request("/api/recurrences", "POST", {
      frequency: "monthly",
      startOn: "2026-07-15",
      endOn: "2026-07-15",
      amountMinor: 12345,
      description: "QA parcela fora de agrupamento",
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
    if (!installment?.transaction?.id) throw new Error("Grouping guard fixture did not create an installment");

    const ordinary = (await request("/api/transactions", "POST", {
      kind: "expense",
      status: "planned",
      amountMinor: 6789,
      occurredOn: "2026-07-15",
      plannedOn: "2026-07-15",
      accountId: account.id,
      categoryId: category.id,
      description: "QA lançamento comum para agrupamento"
    })).transaction;

    return {
      accountId: account.id,
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
