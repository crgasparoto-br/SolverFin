import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  evaluate,
  launchChrome,
  navigate,
  screenshot,
  setViewport,
  sleep,
} from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir =
  process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];
const screenshots = [];
const scenarios = [];
let browserVersion = "unknown";

if (!chromePath)
  throw new Error(
    "CHROME_BIN is required for reports installments validation.",
  );
await mkdir(outputDir, { recursive: true });

let browser;
try {
  browser = await launchChrome({ baseUrl, chromePath });
  browserVersion = browser.version;
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(
    login.ok,
    true,
    `Demo login failed: ${login.status} ${login.body}`,
  );

  const fixture = await evaluate(browser.cdp, fixtureExpression());
  await validateDesktop(browser.cdp, fixture);
  await validateMobile(browser.cdp, fixture);
} catch (error) {
  failures.push({
    message: "Reports installments visual validation crashed",
    details: serializeError(error),
  });
} finally {
  if (browser) await browser.close(outputDir);
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browserVersion,
  failures,
  screenshots,
  scenarios,
};
await writeFile(
  join(outputDir, "reports-installments-regression.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  join(outputDir, "REPORTS-INSTALLMENTS-REGRESSION.md"),
  renderMarkdown(report),
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log(
    "Reports installments desktop and mobile regression validation passed.",
  );
}

async function validateDesktop(cdp, fixture) {
  await setViewport(cdp, 1366, 768);
  const route = `/relatorios?view=installments&month=${fixture.month}`;
  await navigateWithRetry(
    cdp,
    `${baseUrl}${route}`,
    "reports installments desktop",
  );
  await waitForState(cdp, "ready");
  const measurements = await evaluate(cdp, measurementExpression());
  const filename = "reports-installments-desktop-1366x768.png";
  await screenshot(cdp, join(outputDir, filename));
  screenshots.push(filename);

  check(
    measurements.metricLabels.join("|") ===
      "Abertas/planejadas|Postadas/fechadas|Vencidas|Futuras|Total mensal",
    "Installment metrics were not fully preserved",
    measurements,
  );
  check(
    measurements.metricCount === 5,
    "Installment summary does not have five metrics",
    measurements,
  );
  check(
    measurements.aggregateKinds.join("|") === "month|card|category",
    "Installment aggregate families were not fully preserved",
    measurements,
  );
  check(
    measurements.groupHeadings.join("|") ===
      "Comprometimento por mês|Por cartão|Por categoria",
    "Installment aggregate headings are incomplete",
    measurements,
  );
  check(
    measurements.installmentRows >= 3,
    "Installment detail list is incomplete",
    measurements,
  );
  check(
    measurements.hasCardName,
    "Card grouping did not render the seeded card",
    measurements,
  );
  check(
    measurements.hasFirstCategory,
    "First category grouping is missing",
    measurements,
  );
  check(
    measurements.hasSecondCategory,
    "Second category grouping is missing",
    measurements,
  );
  check(
    measurements.explicitView === "installments",
    "Installment form lost explicit view",
    measurements,
  );
  check(
    measurements.summaryColumns === 5,
    "Desktop installment metrics are not in five columns",
    measurements,
  );
  check(
    measurements.reportColumns === 3,
    "Desktop installment groupings are not in three columns",
    measurements,
  );
  check(
    measurements.pageFitsViewport,
    "Installment desktop page leaks horizontal overflow",
    measurements,
  );

  scenarios.push({
    route,
    viewport: "1366x768",
    state: "ready",
    screenshot: filename,
    measurements,
  });
}

async function validateMobile(cdp, fixture) {
  await setViewport(cdp, 390, 844);
  const route = `/relatorios?view=installments&month=${fixture.month}`;
  await navigateWithRetry(
    cdp,
    `${baseUrl}${route}`,
    "reports installments mobile",
  );
  await waitForState(cdp, "ready");
  const measurements = await evaluate(cdp, measurementExpression());
  const filename = "reports-installments-mobile-390x844.png";
  await screenshot(cdp, join(outputDir, filename));
  screenshots.push(filename);

  check(
    measurements.viewportWidth === 390,
    "Installment mobile viewport is not 390px",
    measurements,
  );
  check(
    measurements.summaryColumns === 1,
    "Installment metrics are not stacked on mobile",
    measurements,
  );
  check(
    measurements.reportColumns === 1,
    "Installment groupings are not stacked on mobile",
    measurements,
  );
  check(
    measurements.tableScrollable,
    "Installment detail table is not horizontally scrollable",
    measurements,
  );
  check(
    measurements.pageFitsViewport,
    "Installment mobile page leaks horizontal overflow",
    measurements,
  );

  scenarios.push({
    route,
    viewport: "390x844",
    state: "ready",
    screenshot: filename,
    measurements,
  });
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

    const now = new Date();
    const year = now.getUTCFullYear();
    const monthNumber = now.getUTCMonth() + 1;
    const month = String(year).padStart(4, "0") + "-" + String(monthNumber).padStart(2, "0");
    const firstOn = month + "-01";
    const middleOn = month + "-15";
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const lastOn = month + "-" + String(lastDay).padStart(2, "0");
    const suffix = Date.now().toString(36);

    const account = (await request("/api/accounts", "POST", {
      name: "QA relatorio parcelas conta " + suffix,
      kind: "checking",
      openingBalanceMinor: 0,
      currency: "BRL"
    })).account;
    const firstCategory = (await request("/api/categories", "POST", {
      name: "QA Moradia " + suffix,
      kind: "expense"
    })).category;
    const secondCategory = (await request("/api/categories", "POST", {
      name: "QA Tecnologia " + suffix,
      kind: "expense"
    })).category;

    async function createAccountInstallment(date, amountMinor, description, categoryId) {
      const recurrence = (await request("/api/recurrences", "POST", {
        frequency: "monthly",
        startOn: date,
        endOn: date,
        amountMinor,
        description,
        kind: "expense",
        accountId: account.id,
        categoryId
      })).recurrence;
      await request("/api/recurrences/" + recurrence.id + "/generate-installments", "POST", {
        through: date,
        maxOccurrences: 1
      });
      const installments = (await request(
        "/api/installments?recurrenceId=" + recurrence.id + "&status=all"
      )).installments;
      return installments[0];
    }

    const postedInstallment = await createAccountInstallment(
      firstOn,
      15000,
      "QA parcela postada " + suffix,
      firstCategory.id
    );
    const plannedInstallment = await createAccountInstallment(
      lastOn,
      5000,
      "QA parcela planejada " + suffix,
      secondCategory.id
    );
    if (postedInstallment?.transaction?.id) {
      await request("/api/transactions/" + postedInstallment.transaction.id, "PATCH", {
        status: "reconciled"
      });
    }

    const card = (await request("/api/credit-card-accounts", "POST", {
      name: "QA Cartao relatorio " + suffix,
      closingDay: 20,
      dueDay: 10,
      creditLimitMinor: 100000,
      instruments: [{
        type: "physical",
        holder: "primary",
        name: "Fisico QA relatorio",
        maskedIdentifier: "**** 0542"
      }]
    })).creditCardAccount;
    const instrument = card.instruments[0];
    const cardRecurrence = (await request("/api/recurrences", "POST", {
      frequency: "monthly",
      startOn: middleOn,
      endOn: middleOn,
      amountMinor: 7000,
      description: "QA parcela cartao " + suffix,
      cardId: card.id,
      cardInstrumentId: instrument.id,
      categoryId: secondCategory.id
    })).recurrence;
    await request("/api/recurrences/" + cardRecurrence.id + "/generate-installments", "POST", {
      through: middleOn,
      maxOccurrences: 1
    });
    const cardInstallments = (await request(
      "/api/installments?recurrenceId=" + cardRecurrence.id + "&status=all"
    )).installments;

    if (
      !postedInstallment?.transaction?.id ||
      !plannedInstallment?.transaction?.id ||
      !cardInstallments[0]?.transaction?.id
    ) {
      throw new Error("Reports installment fixture did not create three linked installments");
    }

    return {
      month,
      cardName: card.name,
      firstCategory: firstCategory.name,
      secondCategory: secondCategory.name
    };
  })()`;
}

function measurementExpression() {
  return `(() => {
    const summary = document.querySelector('.summary-grid');
    const reportGrid = document.querySelector('.report-grid');
    const installmentTable = document.querySelector('.installment-table');
    const text = document.body.textContent || '';
    const fixture = ${JSON.stringify({ marker: true })};
    void fixture;
    return {
      state: document.querySelector('[data-report-state]')?.getAttribute('data-report-state') || '',
      viewportWidth: window.innerWidth,
      metricCount: document.querySelectorAll('.summary-grid .metric-card').length,
      metricLabels: Array.from(document.querySelectorAll('.summary-grid .metric-card > span')).map((item) => item.textContent.trim()),
      aggregateKinds: Array.from(document.querySelectorAll('[data-aggregate-kind]')).map((item) => item.getAttribute('data-aggregate-kind')),
      groupHeadings: Array.from(document.querySelectorAll('.report-grid h2')).map((item) => item.textContent.trim()),
      installmentRows: document.querySelectorAll('.installment-table-row').length,
      hasCardName: text.includes(${JSON.stringify("QA Cartao relatorio")}),
      hasFirstCategory: text.includes(${JSON.stringify("QA Moradia")}),
      hasSecondCategory: text.includes(${JSON.stringify("QA Tecnologia")}),
      explicitView: document.querySelector('input[name="view"]')?.value || '',
      summaryColumns: summary ? getComputedStyle(summary).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      reportColumns: reportGrid ? getComputedStyle(reportGrid).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      tableScrollable: Boolean(installmentTable && installmentTable.scrollWidth > installmentTable.clientWidth + 1),
      pageFitsViewport: document.documentElement.scrollWidth <= window.innerWidth + 1
    };
  })()`;
}

async function waitForState(cdp, expected) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(
      cdp,
      `document.querySelector('[data-report-state]')?.getAttribute('data-report-state') || ''`,
    );
    if (state === expected) return;
    await sleep(100);
  }
  throw new Error(`Reports installments state ${expected} did not render.`);
}

async function navigateWithRetry(cdp, url, label) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await navigate(cdp, url);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      console.warn(
        `Navigation to ${label} failed on attempt ${attempt}; retrying.`,
      );
      await sleep(400 * attempt);
    }
  }
}

function check(condition, message, details) {
  if (!condition) failures.push({ message, details });
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? "",
    };
  }
  return { name: "UnknownError", message: String(error), stack: "" };
}

function renderMarkdown(value) {
  return `# Reports installments regression visual validation\n\n- Commit: \`${value.commit}\`\n- Browser: ${value.browser}\n- Failures: ${value.failures.length}\n- Screenshots: ${value.screenshots.join(", ")}\n`;
}
