import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import pg from "pg";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const { Client } = pg;
const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const databaseUrl = process.env.DATABASE_URL;
const evidencePath = join(outputDir, "issue-490-account-remuneration.json");

if (!chromePath) throw new Error("CHROME_BIN is required for visual validation.");
if (!databaseUrl) throw new Error("DATABASE_URL is required for visual validation.");

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
const database = new Client({ connectionString: databaseUrl });
const evidence = {
  commit: process.env.GITHUB_SHA ?? "local",
  generatedAt: new Date().toISOString(),
  stage: "started",
};

async function saveEvidence(values = {}) {
  Object.assign(evidence, values);
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

try {
  await database.connect();
  await setViewport(browser.cdp, 1366, 1000);
  await navigate(browser.cdp, `${baseUrl}/login`);

  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  const fixture = await evaluate(
    browser.cdp,
    `(async () => {
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
        name: "QA Issue 490 - CDI " + suffix,
        kind: "checking",
        openingBalanceMinor: 1000000,
        currency: "BRL"
      })).account;
      const categories = (await request("/api/categories")).categories || [];
      const incomeCategory = categories.find((category) => category.kind === "income");

      async function createTransaction(description, amountMinor, plannedOn) {
        return (await request("/api/transactions", "POST", {
          accountId: account.id,
          kind: "income",
          status: "planned",
          amountMinor,
          occurredOn: plannedOn,
          plannedOn,
          description,
          currency: "BRL",
          ...(incomeCategory ? { categoryId: incomeCategory.id } : {})
        })).transaction;
      }

      const common = await createTransaction("QA lançamento comum", 1000, "2026-07-13");
      const first = await createTransaction("QA remuneração CDI 1", 525, "2026-07-15");
      const adjusted = await createTransaction("QA remuneração CDI 2", 700, "2026-07-16");

      return {
        accountId: account.id,
        commonId: common.id,
        firstId: first.id,
        adjustedId: adjusted.id
      };
    })()`,
  );

  await persistRemunerationMetadata(database, fixture.firstId, {
    competenceOn: "2026-07-14",
    originalAmountMinor: 525,
    manuallyAdjusted: false,
  });
  await persistRemunerationMetadata(database, fixture.adjustedId, {
    competenceOn: "2026-07-15",
    originalAmountMinor: 525,
    manuallyAdjusted: true,
  });

  const route = `/lancamentos?accountId=${encodeURIComponent(fixture.accountId)}&month=2026-07`;
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(400);

  const initialDesktop = await evaluate(
    browser.cdp,
    statementStateExpression(fixture, "desktop-initial"),
  );
  assert.equal(initialDesktop.remunerationCount, 2);
  assert.equal(initialDesktop.first.title, "Remuneração CDI");
  assert.equal(initialDesktop.first.summary, "Competência 14/07/2026 · 100% do CDI");
  assert.equal(initialDesktop.first.detailsOpen, false);
  assert.equal(initialDesktop.adjusted.detailsOpen, false);
  assert.equal(initialDesktop.first.actionsOpen, false);
  assert.equal(initialDesktop.first.containsLongDescription, false);
  assert.equal(initialDesktop.first.hasCloneAction, false);
  assert.ok(
    initialDesktop.first.height <= initialDesktop.common.height + 48,
    `Collapsed remuneration row is too tall: ${initialDesktop.first.height}px versus ${initialDesktop.common.height}px`,
  );
  assert.ok(
    initialDesktop.first.height / initialDesktop.common.height <= 1.9,
    `Collapsed remuneration row ratio is too large: ${initialDesktop.first.height / initialDesktop.common.height}`,
  );
  await screenshot(browser.cdp, join(outputDir, "issue-490-cdi-collapsed-desktop.png"));

  await focusSummary(browser.cdp, fixture.firstId);
  await pressEnter(browser.cdp);
  await sleep(120);
  const firstExpanded = await evaluate(
    browser.cdp,
    statementStateExpression(fixture, "desktop-first-expanded"),
  );
  assert.equal(firstExpanded.first.detailsOpen, true);
  assert.equal(firstExpanded.adjusted.detailsOpen, false);
  assert.equal(firstExpanded.first.actionsOpen, false);
  assert.equal(firstExpanded.first.detailLabels.includes("Saldo-base"), true);
  assert.equal(firstExpanded.first.detailLabels.includes("CDI diário"), true);
  assert.equal(firstExpanded.first.detailLabels.includes("Percentual aplicado"), true);
  assert.equal(firstExpanded.first.detailLabels.includes("Valor original"), true);
  assert.equal(firstExpanded.first.adjustmentVisible, false);
  await screenshot(browser.cdp, join(outputDir, "issue-490-cdi-expanded-desktop.png"));

  const menusTogether = await evaluate(
    browser.cdp,
    `(() => {
      const row = document.querySelector('script[data-transaction="${fixture.firstId}"]')?.closest(".statement-row.statement-body");
      const actions = row?.querySelector("details.actions");
      actions?.querySelector("summary")?.click();
      return {
        calculationOpen: Boolean(row?.querySelector("details.account-remuneration-audit")?.open),
        actionsOpen: Boolean(actions?.open)
      };
    })()`,
  );
  assert.equal(menusTogether.calculationOpen, true);
  assert.equal(menusTogether.actionsOpen, true);

  await focusSummary(browser.cdp, fixture.firstId);
  await pressEnter(browser.cdp);
  await sleep(120);
  const firstCollapsed = await evaluate(
    browser.cdp,
    statementStateExpression(fixture, "desktop-first-collapsed"),
  );
  assert.equal(firstCollapsed.first.detailsOpen, false);
  assert.equal(firstCollapsed.adjusted.detailsOpen, false);
  assert.equal(firstCollapsed.first.actionsOpen, true);

  await evaluate(
    browser.cdp,
    `document.querySelector('script[data-transaction="${fixture.firstId}"]')?.closest(".statement-row.statement-body")?.querySelector("details.actions > summary")?.click()`,
  );
  await focusSummary(browser.cdp, fixture.adjustedId);
  await pressEnter(browser.cdp);
  await sleep(120);
  const adjustedExpanded = await evaluate(
    browser.cdp,
    statementStateExpression(fixture, "desktop-adjusted-expanded"),
  );
  assert.equal(adjustedExpanded.first.detailsOpen, false);
  assert.equal(adjustedExpanded.adjusted.detailsOpen, true);
  assert.equal(adjustedExpanded.adjusted.adjustmentVisible, true);
  assert.match(adjustedExpanded.adjusted.detailText, /Ajustado manualmente/);
  assert.match(adjustedExpanded.adjusted.detailText, /R\$\s*5,25/);

  await setViewport(browser.cdp, 390, 1000);
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(350);
  const mobileCollapsed = await evaluate(
    browser.cdp,
    statementStateExpression(fixture, "mobile-collapsed"),
  );
  assert.equal(mobileCollapsed.globalOverflow, false);
  assert.equal(mobileCollapsed.first.detailsOpen, false);
  assert.equal(mobileCollapsed.first.rowOverflow, false);
  await screenshot(browser.cdp, join(outputDir, "issue-490-cdi-collapsed-mobile.png"));

  await focusSummary(browser.cdp, fixture.firstId);
  await pressEnter(browser.cdp);
  await sleep(120);
  const mobileExpanded = await evaluate(
    browser.cdp,
    statementStateExpression(fixture, "mobile-expanded"),
  );
  assert.equal(mobileExpanded.globalOverflow, false);
  assert.equal(mobileExpanded.first.detailsOpen, true);
  assert.equal(mobileExpanded.first.rowOverflow, false);
  assert.equal(mobileExpanded.first.hasInternalTable, false);
  assert.equal(mobileExpanded.first.detailOverflow, false);
  assert.ok(
    mobileExpanded.first.detailGridColumns >= 1 && mobileExpanded.first.detailGridColumns <= 2,
    `Unexpected mobile detail grid: ${mobileExpanded.first.detailGridColumns} columns`,
  );
  await screenshot(browser.cdp, join(outputDir, "issue-490-cdi-expanded-mobile.png"));

  await saveEvidence({
    stage: "completed",
    fixture,
    route,
    initialDesktop,
    firstExpanded,
    menusTogether,
    firstCollapsed,
    adjustedExpanded,
    mobileCollapsed,
    mobileExpanded,
    screenshots: [
      "issue-490-cdi-collapsed-desktop.png",
      "issue-490-cdi-expanded-desktop.png",
      "issue-490-cdi-collapsed-mobile.png",
      "issue-490-cdi-expanded-mobile.png",
    ],
  });
} catch (error) {
  await saveEvidence({
    stage: "failed",
    failure: {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    },
  });
  throw error;
} finally {
  await database.end().catch(() => undefined);
  await browser.close(outputDir);
}

async function persistRemunerationMetadata(client, transactionId, options) {
  const transactionResult = await client.query(
    `select "organizationId", "financialProfileId", "accountId"
       from "Transaction"
      where "id" = $1`,
    [transactionId],
  );
  const transaction = transactionResult.rows[0];
  if (!transaction?.accountId) throw new Error(`Transaction ${transactionId} has no account scope.`);

  const rateId = randomUUID();
  const rateResult = await client.query(
    `insert into "FinancialIndexRate"
       ("id", "kind", "referenceOn", "dailyRatePercent", "dailyFactor", "source", "status", "importedAt", "createdAt", "updatedAt")
     values ($1, 'CDI', $2::date, 0.052531, 1.00052531, 'QA_ISSUE_490', 'CONFIRMED', current_timestamp, current_timestamp, current_timestamp)
     on conflict ("kind", "referenceOn") do update set
       "dailyRatePercent" = excluded."dailyRatePercent",
       "dailyFactor" = excluded."dailyFactor",
       "source" = excluded."source",
       "status" = excluded."status",
       "updatedAt" = current_timestamp
     returning "id"`,
    [rateId, options.competenceOn],
  );
  const persistedRateId = rateResult.rows[0]?.id;
  if (!persistedRateId) throw new Error(`Financial rate was not persisted for ${options.competenceOn}.`);

  const technicalDescription =
    `Rendimento previsto — 100% do CDI · competência ${options.competenceOn} · ` +
    "saldo-base R$ 10.000,00 · CDI 0,052531% · valor original R$ 5,25";
  await client.query(
    `update "Transaction"
        set "source" = 'ACCOUNT_REMUNERATION',
            "description" = $2,
            "updatedAt" = current_timestamp
      where "id" = $1`,
    [transactionId, technicalDescription],
  );

  await client.query(
    `insert into "AccountRemuneration"
       ("id", "organizationId", "financialProfileId", "accountId", "financialIndexRateId", "transactionId",
        "indexKind", "competenceOn", "processedOn", "status", "balanceBaseMinor", "dailyRatePercent",
        "remunerationPercent", "appliedDailyRatePercent", "originalAmountMinor", "manuallyAdjusted",
        "adjustedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, 'CDI', $7::date, '2026-07-16'::date, 'CREATED', 1000000,
             0.052531, 100, 0.052531, $8, $9, $10, current_timestamp, current_timestamp)`,
    [
      randomUUID(),
      transaction.organizationId,
      transaction.financialProfileId,
      transaction.accountId,
      persistedRateId,
      transactionId,
      options.competenceOn,
      options.originalAmountMinor,
      options.manuallyAdjusted,
      options.manuallyAdjusted ? new Date("2026-07-16T12:00:00.000Z") : null,
    ],
  );
}

function statementStateExpression(fixture, stage) {
  return `(() => {
    function state(transactionId) {
      const row = document.querySelector('script[data-transaction="' + transactionId + '"]')?.closest(".statement-row.statement-body");
      if (!row) throw new Error("Statement row was not found for " + transactionId);
      const description = row.querySelector(".description");
      const title = description?.querySelector(":scope > strong");
      const details = description?.querySelector("details.account-remuneration-audit");
      const content = details?.querySelector(".account-remuneration-audit-content");
      const grid = content?.querySelector("dl");
      const gridColumns = grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length : 0;
      const detailItems = Array.from(content?.querySelectorAll("dl > div") || []);
      const directTitle = title
        ? Array.from(title.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent || "").join("").trim()
        : "";
      return {
        title: directTitle,
        summary: (description?.querySelector(".account-remuneration-summary")?.textContent || "").replace(/\\s+/g, " ").trim(),
        height: row.getBoundingClientRect().height,
        detailsOpen: Boolean(details?.open),
        actionsOpen: Boolean(row.querySelector("details.actions")?.open),
        containsLongDescription: /saldo-base|valor original|CDI 0,052531%/.test(directTitle),
        hasCloneAction: Boolean(row.querySelector("[data-clone]")),
        adjustmentVisible: Boolean(content?.querySelector(".account-remuneration-adjustment.adjusted")),
        detailLabels: Array.from(content?.querySelectorAll("dt") || []).map((item) => (item.textContent || "").trim()),
        detailText: (content?.textContent || "").replace(/\\s+/g, " ").trim(),
        hasInternalTable: Boolean(content?.querySelector("table")),
        rowOverflow: row.scrollWidth > row.clientWidth + 1,
        detailOverflow: detailItems.some((item) => item.scrollWidth > item.clientWidth + 1),
        detailGridColumns: gridColumns
      };
    }

    const commonRow = document.querySelector('script[data-transaction="${fixture.commonId}"]')?.closest(".statement-row.statement-body");
    if (!commonRow) throw new Error("Common statement row was not found");
    return {
      stage: ${JSON.stringify(stage)},
      globalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      remunerationCount: document.querySelectorAll(".statement-row.account-remuneration-row").length,
      common: { height: commonRow.getBoundingClientRect().height },
      first: state("${fixture.firstId}"),
      adjusted: state("${fixture.adjustedId}")
    };
  })()`;
}

async function focusSummary(cdp, transactionId) {
  const focused = await evaluate(
    cdp,
    `(() => {
      const summary = document.querySelector('script[data-transaction="${transactionId}"]')?.closest(".statement-row.statement-body")?.querySelector("details.account-remuneration-audit > summary");
      if (!summary) throw new Error("Calculation summary was not found");
      summary.focus();
      return document.activeElement === summary;
    })()`,
  );
  assert.equal(focused, true, "Calculation summary could not receive keyboard focus.");
}

async function pressEnter(cdp) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
}
