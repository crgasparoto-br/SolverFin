import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { renderDashboardPage } from "../../apps/web/dist/dev-server/dashboard-page.js";
import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const state = process.env.STATEMENT_VISUAL_STATE;
const states = new Set([
  "multi-currency",
  "multi-currency-partial",
  "partial",
  "error",
  "long-content",
]);
if (!states.has(state)) throw new Error("Unknown dashboard visual state: " + state);
if (!process.env.CHROME_BIN) throw new Error("CHROME_BIN is required.");
await mkdir(outputDir, { recursive: true });

const report = {
  commit: process.env.STATEMENT_VISUAL_CANDIDATE_SHA ?? process.env.GITHUB_SHA ?? "local",
  route: "/dashboard",
  mockupReference: "Issue #811 — item 4, Proposta de reorganização visual, 19/11/2026",
  state,
  provenance:
    "real dashboard SSR renderer with controlled API responses; authenticated browser session",
  viewports: [],
  failures: [],
};
let browser;
try {
  const html = await renderScenario(state);
  report.htmlSha256 = createHash("sha256").update(html).digest("hex");
  browser = await launchChrome({ baseUrl, chromePath: process.env.CHROME_BIN });
  report.browser = browser.version;
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, baseUrl + "/login");
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, "Demo login failed");
  for (const [width, height] of [
    [1366, 768],
    [390, 844],
    [320, 740],
  ]) {
    await setViewport(browser.cdp, width, height);
    // Start from a fresh, script-free document. The live Dashboard can return a
    // loading shell whose pending 250ms retry would replace the injected SSR
    // scenario before Chrome measures it, producing false state/count failures.
    await navigate(browser.cdp, "about:blank");
    const tree = await browser.cdp.send("Page.getFrameTree");
    await browser.cdp.send("Page.setDocumentContent", { frameId: tree.frameTree.frame.id, html });
    await sleep(300);
    const measurements = await evaluate(browser.cdp, "(" + inspectDashboard.toString() + ")()");
    assert.equal(measurements.documentUrl, "about:blank", "Synthetic SSR scenario was replaced");
    assert.equal(measurements.viewportWidth, width, "Viewport identity mismatch");
    assert.equal(measurements.noHorizontalOverflow, true, state + " overflow at " + width);
    assert.equal(measurements.mainPresent, true, "Dashboard main region missing");
    if (width <= 390) {
      assert.ok(
        measurements.navigationHeight > 0 && measurements.navigationHeight <= 80,
        state + " mobile navigation stretches beyond its contents at " + width,
      );
    }
    if (state === "error") {
      assert.equal(measurements.hasError, true, "Error panel was not rendered");
      assert.equal(measurements.currencyCount, 0, "Error state leaked totals");
    } else {
      assert.equal(measurements.hasNextActions, true, "Next actions missing");
      assert.equal(measurements.primaryCount, state.startsWith("multi-currency") ? 12 : 6);
      assert.equal(
        measurements.supportingAfterActions,
        true,
        "Secondary indicators precede next action",
      );
      assert.equal(measurements.amountsSeparatedByCurrency, true, "Mixed currencies in a summary");
      assert.equal(measurements.mockupOrderValid, true, "Approved mockup region order drifted");
      assert.equal(
        measurements.operationalRowsOrdered,
        true,
        "Approved bill/card/analysis pairing drifted",
      );
      assert.equal(measurements.hasWideProjection, true, "Full-width cash-flow region missing");
      if (state !== "partial") {
        assert.equal(
          measurements.widgetRowPairing,
          true,
          "Widgets must pair on desktop and stack on mobile",
        );
        assert.equal(
          measurements.hasDashboardCharts,
          true,
          "Cash-flow and consumption charts must render",
        );
      }
      if (width <= 390) {
        assert.equal(
          measurements.visiblePrimaryCount,
          state.startsWith("multi-currency") ? 4 : 2,
          "Only balance and free-to-spend may appear before actions on mobile",
        );
      } else if (width === 1366) {
        assert.equal(measurements.desktopKpiColumns, 3, "Desktop mockup requires 3 KPI columns");
      }
      if (state.startsWith("multi-currency")) {
        assert.deepEqual(measurements.currencies, ["BRL", "USD"]);
        if (state === "multi-currency") {
          assert.equal(measurements.hasPartial, false, "Complete multi-currency state is partial");
        }
      }
      if (state === "partial" || state === "multi-currency-partial") {
        assert.equal(measurements.hasPartial, true, "Partial data warning missing");
      }
      if (state === "long-content") {
        assert.equal(measurements.longItemVisible, true, "Long content fixture missing");
      }
    }
    if (state !== "error" && width <= 390) {
      assert.equal(
        measurements.actionVisibleInFirstViewport,
        true,
        state + " first action title and link must both fit the first fold at " + width,
      );
      assert.equal(
        measurements.firstActionLinkHasDestination,
        true,
        state + " first action must link to an actionable route at " + width,
      );
      assert.equal(
        measurements.primaryValuesOnOneLine,
        true,
        state + " wraps a primary amount at " + width,
      );
      assert.equal(
        measurements.allPrimaryBeforeActions,
        true,
        state + " has a primary indicator after next action",
      );
    }
    const stem = "issue-724-dashboard-" + state + "-" + width;
    await screenshot(browser.cdp, join(outputDir, stem + ".png"));
    const item = { width, height, screenshot: stem + ".png", measurements };
    if (state === "multi-currency" || state === "long-content") {
      const mockupStem = "issue-811-approved-mockup-" + state + "-" + width;
      await screenshot(browser.cdp, join(outputDir, mockupStem + ".png"));
      item.mockupViewportScreenshot = mockupStem + ".png";
      item.fullMockupHeight = await captureApprovedMockupFullPage(
        browser.cdp, join(outputDir, mockupStem + "-full.png"), width,
      );
      item.fullMockupScreenshot = mockupStem + "-full.png";
    }
    if (state === "error" && width <= 390) {
      const negative = await evaluate(browser.cdp, "(" + navigationStretchProbe.toString() + ")()");
      assert.equal(
        negative.stretchedHeight > 80,
        true,
        "Stretched grid must fail compact navigation",
      );
      assert.equal(negative.restoredHeight <= 80, true, "Compact navigation must recover");
      item.navigationStretchProbe = negative;
    }
    if (state !== "error" && width <= 390) {
      const intrusivePanel = await evaluate(
        browser.cdp,
        "(" + intrusivePanelProbe.toString() + ")()",
      );
      assert.equal(
        intrusivePanel.actionVisibleAfterIntrusion,
        false,
        "Intrusive panel must fail first-fold gate",
      );
      assert.equal(
        intrusivePanel.actionVisibleAfterRemoval,
        true,
        "Removing panel must restore first-fold gate",
      );
      item.intrusivePanel = intrusivePanel;
    }
    if (state !== "error") {
      const actionFocused = await evaluate(browser.cdp, "(" + focusFirstAction.toString() + ")()");
      assert.equal(actionFocused, true, "First action link must accept keyboard focus");
      item.firstActionKeyboardFocused = actionFocused;
      const focused = await evaluate(browser.cdp, "(" + focusEvidence.toString() + ")()");
      assert.equal(focused, true, "Evidence link cannot receive focus");
      await browser.cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
      await browser.cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
      await sleep(150);
      const keyboard = await evaluate(browser.cdp, "(" + inspectEvidence.toString() + ")()");
      assert.equal(keyboard.open, true, "Enter did not open the linked evidence");
      item.keyboard = keyboard;
      if (state === "long-content") {
        const expanded = await evaluate(browser.cdp, "(" + expandLongEvidence.toString() + ")()");
        assert.equal(expanded, true, "Long account evidence missing");
        await screenshot(browser.cdp, join(outputDir, stem + "-expanded.png"));
        item.expandedScreenshot = stem + "-expanded.png";
      }
    }
    report.viewports.push(item);
  }
} catch (error) {
  report.failures.push({
    message: error instanceof Error ? (error.stack ?? error.message) : String(error),
  });
} finally {
  if (browser) await browser.close(outputDir);
}
await writeFile(
  join(outputDir, "issue-724-dashboard-" + state + ".json"),
  JSON.stringify(report, null, 2) + "\n",
);
if (report.failures.length > 0) {
  report.failures.forEach((x) => console.error(x.message));
  process.exitCode = 1;
} else {
  console.log("Dashboard visual state " + state + " passed in all three viewports.");
}

async function renderScenario(variant) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/api/financial-summary") {
      if (variant === "error")
        return response({ error: { message: "Falha controlada no resumo financeiro" } }, 503);
      const blocks = [currencyBlock("BRL", variant)];
      if (variant.startsWith("multi-currency")) blocks.push(currencyBlock("USD", variant));
      return response({
        currencyBlocks: blocks,
        recentItems: [
          {
            description:
              variant === "long-content"
                ? "QA " + "Descrição extensa de compromisso financeiro ".repeat(8)
                : "Compra no mercado",
            kind: "expense",
            amountMinor: 2500,
            currency: "BRL",
            occurredOn: "2026-07-12",
            status: "posted",
          },
          {
            description: "Salário",
            kind: "income",
            amountMinor: 25000,
            currency: "BRL",
            occurredOn: "2026-07-01",
            status: "posted",
          },
        ],
      });
    }
    if (path === "/api/cash-flow-projection") {
      const currencies = variant.startsWith("multi-currency") ? ["BRL", "USD"] : ["BRL"];
      return response({
        referenceDate: "2026-07-01",
        horizonDays: 30,
        from: "2026-07-02",
        to: "2026-07-31",
        currencyBlocks: currencies.map((currency) => ({
          currency,
          closingBalanceMinor: 10200,
          points: Array.from({ length: 30 }, (_, index) => ({
            date: "2026-07-" + String(index + 2).padStart(2, "0"),
            closingBalanceMinor: 17000 - index * 240 + (index % 5) * 140,
          })),
        })),
        freeToSpend: {
          referenceDate: "2026-07-01",
          horizonDays: 30,
          currencyBlocks: currencies.map((currency) => ({
            currency,
            status: "available",
            minimumProjectedBalanceMinor: 9800,
            minimumBalanceOn: "2026-07-25",
            freeToSpendMinor: 9000,
            projectedDeficitMinor: 0,
          })),
        },
      });
    }
    if (path === "/api/dashboard-overview") {
      if (variant === "partial") {
        return response({ error: { message: "Complemento temporariamente indisponível" } }, 503);
      }
      const currencies = variant.startsWith("multi-currency") ? ["BRL", "USD"] : ["BRL"];
      return response({
        referenceDate: "2026-07-01",
        purchaseToday: "2026-07-01",
        purchaseOn: "2026-07-01",
        periodStartOn: "2026-07-01",
        periodEndOn: "2026-07-31",
        accountBalances: currencies.flatMap((currency) => [
          {
            id: "visual-cash-" + currency,
            name:
              variant === "long-content"
                ? "Conta corrente com nome muito longo ".repeat(4)
                : "Conta Principal " + currency,
            kind: "checking",
            currency,
            balanceMinor: 123450,
          },
          {
            id: "visual-reserve-" + currency,
            name: "Reserva " + currency,
            kind: "investment",
            currency,
            balanceMinor: 150000,
          },
        ]),
        cardSpending: currencies.flatMap((currency) => [
          {
            id: "card-a-" + currency,
            name: "Cartão Principal " + currency,
            currency,
            spentMinor: 78000,
          },
          {
            id: "card-b-" + currency,
            name: "Cartão Reserva " + currency,
            currency,
            spentMinor: 24000,
          },
        ]),
        cardSpendingTotals: currencies.map((currency) => ({
          currency,
          amountMinor: 102000,
          count: 2,
        })),
        cardAdvice: [
          {
            id: "card-a-BRL",
            name: "Cartão Principal BRL",
            currency: "BRL",
            closingOn: "2026-07-18",
            dueOn: "2026-08-18",
            daysUntilPayment: 48,
            recommended: true,
          },
          {
            id: "card-b-BRL",
            name: "Cartão Reserva BRL",
            currency: "BRL",
            closingOn: "2026-07-10",
            dueOn: "2026-08-10",
            daysUntilPayment: 40,
            recommended: false,
          },
        ],
        payables: currencies.flatMap((currency) => [
          {
            id: "payable-" + currency,
            source: "transaction",
            description: "Conta de energia " + currency,
            currency,
            dueOn: "2026-07-04",
            amountMinor: 12000,
            overdue: false,
            accountId: "visual-cash-" + currency,
          },
          {
            id: "invoice-" + currency,
            source: "invoice",
            description: "Fatura cartão " + currency,
            currency,
            dueOn: "2026-07-18",
            amountMinor: 34000,
            overdue: false,
            cardId: "card-a-" + currency,
          },
        ]),
        payableTotals: currencies.map((currency) => ({
          currency,
          amountMinor: 46000,
          overdueMinor: 0,
          count: 2,
        })),
        categoryExpenses: currencies.flatMap((currency) =>
          ["Alimentação", "Moradia", "Transporte", "Saúde"].map((category, index) => ({
            currency,
            category,
            amountMinor: [36000, 23000, 11000, 6500][index],
          })),
        ),
        monthlyTrend: currencies.flatMap((currency) =>
          ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"].map(
            (month, index) => ({
              currency,
              month,
              incomeMinor: 120000 + index * 11500,
              expensesMinor: 80000 + (index % 3) * 8500,
            }),
          ),
        ),
      });
    }
    if (path === "/api/bank-message-inbox") {
      return variant === "partial" || variant === "multi-currency-partial"
        ? response({ error: { message: "Serviço temporariamente indisponível" } }, 503)
        : response({ messages: [] });
    }
    if (path === "/api/invoices") return response({ invoices: [] });
    if (path === "/api/financial-insights")
      return response({ state: "active", total: 0, offset: 0, limit: 2, items: [] });
    return response({ error: { message: "Fonte opcional indisponível" } }, 503);
  };
  try {
    const html = await renderDashboardPage("issue-724-visual-" + variant);
    if (!html.includes("<!doctype html>"))
      throw new Error("Renderer returned an incomplete document");
    return html;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function captureApprovedMockupFullPage(cdp, path, viewportWidth) {
  const layout = await cdp.send("Page.getLayoutMetrics");
  const bounds = layout.cssContentSize ?? layout.contentSize;
  const pageHeight = Math.ceil(bounds?.height ?? 0);
  assert.ok(
    pageHeight > 0 && pageHeight <= 16000,
    "Full Dashboard mockup must fit Chrome's 16000px screenshot safety bound",
  );
  const screenshotResult = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: viewportWidth, height: pageHeight, scale: 1 },
  });
  await writeFile(path, Buffer.from(screenshotResult.data, "base64"));
  return pageHeight;
}

function currencyBlock(currency, variant) {
  return {
    currency,
    availableBalanceMinor: currency === "USD" ? 420050 : 123450,
    incomeMinor: 25000,
    expensesMinor: 10000,
    netVariationMinor: 15000,
    plannedCommitmentsMinor: 5000,
    accounts: [
      {
        id: "visual-" + currency.toLowerCase(),
        name:
          variant === "long-content"
            ? "Conta com nome extenso " + "para testar reflow e detalhes ".repeat(7)
            : "Conta de teste " + currency,
        status: "active",
      },
    ],
  };
}
function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
function inspectDashboard() {
  const root = document.documentElement;
  const summaries = [...document.querySelectorAll(".currency-summary")];
  const action = document.querySelector(".next-actions");
  const firstAction = action?.querySelector(".next-action-row");
  const firstActionLabel = firstAction?.querySelector("strong");
  const firstActionLink = firstAction?.querySelector("a[href]");
  const firstActionHref = firstActionLink?.getAttribute("href") ?? "";
  const firstActionDestinationValid =
    firstActionHref.startsWith("/") ||
    (firstActionHref.startsWith("#") && Boolean(document.getElementById(firstActionHref.slice(1))));
  const withinFirstFold = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top >= 0 &&
      rect.bottom <= innerHeight &&
      style.visibility === "visible" &&
      style.display !== "none"
    );
  };
  const supporting = document.querySelector(".dashboard-supporting-section");
  const region = (name) => document.querySelector('[data-dashboard-region="' + name + '"]');
  const order = [
    "overview",
    "kpis",
    "alerts",
    "cash-flow",
    "bills-and-accounts",
    "credit-cards",
    "analysis",
    "activity",
    "additional",
  ].map(region);
  const mockupOrderValid = order.every(
    (element, index) =>
      element &&
      (index === 0 ||
        Boolean(
          order[index - 1].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING,
        )),
  );
  const pairs = [
    ["dashboard-payables", "dashboard-accounts"],
    ["dashboard-credit-cards", "dashboard-best-card"],
    ["dashboard-categories", "dashboard-evolution"],
  ].map(([a, b]) => [document.getElementById(a), document.getElementById(b)]);
  const widgetRowPairing = pairs.every(([left, right]) => {
    if (!left || !right) return false;
    const a = left.getBoundingClientRect();
    const b = right.getBoundingClientRect();
    return innerWidth <= 760
      ? b.top >= a.bottom - 1
      : Math.abs(a.top - b.top) <= 2 && b.left >= a.right - 2;
  });
  const isVisible = (element) =>
    element && element.getClientRects().length > 0 && getComputedStyle(element).display !== "none";
  const dashboardKpiGrid = document.querySelector(".currency-summary .sf-summary-grid");
  const desktopKpiColumns = dashboardKpiGrid
    ? getComputedStyle(dashboardKpiGrid).gridTemplateColumns.split(" ").filter(Boolean).length
    : 0;
  return {
    viewportWidth: innerWidth,
    documentUrl: location.href,
    noHorizontalOverflow: root.scrollWidth <= root.clientWidth + 1,
    mainPresent: Boolean(document.querySelector("main")),
    navigationHeight: document.querySelector(".sidebar")?.getBoundingClientRect().height ?? null,
    hasError: document.body.textContent.includes("Não foi possível carregar o Dashboard"),
    hasPartial: Boolean(document.querySelector('[data-quality="partial"]')),
    currencyCount: summaries.length,
    currencies: summaries.map((section) => section.id.replace("currency-", "")),
    primaryCount: document.querySelectorAll(".currency-summary .dashboard-metric").length,
    visiblePrimaryCount: [
      ...document.querySelectorAll(".currency-summary .dashboard-metric"),
    ].filter(isVisible).length,
    desktopKpiColumns,
    mockupOrderValid,
    operationalRowsOrdered: Boolean(
      region("bills-and-accounts") &&
      region("credit-cards") &&
      region("analysis") &&
      region("bills-and-accounts").compareDocumentPosition(region("credit-cards")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ),
    widgetRowPairing,
    hasWideProjection: Boolean(
      region("cash-flow") &&
      getComputedStyle(
        region("cash-flow").querySelector(".cash-flow-dashboard-grid"),
      ).gridTemplateColumns.split(" ").length === 1,
    ),
    hasDashboardCharts: Boolean(
      document.querySelector(".dashboard-projection-chart polyline") &&
      document.querySelector(".dashboard-card-spend-bars") &&
      document.querySelector(".dashboard-trend-columns"),
    ),
    hasNextActions: Boolean(action),
    actionVisibleInFirstViewport:
      withinFirstFold(firstActionLabel) && withinFirstFold(firstActionLink),
    firstActionLabelVisibleInFirstViewport: withinFirstFold(firstActionLabel),
    firstActionLinkVisibleInFirstViewport: withinFirstFold(firstActionLink),
    firstActionLinkHasDestination: Boolean(
      firstActionLink && firstActionLink.tabIndex >= 0 && firstActionDestinationValid,
    ),
    allPrimaryBeforeActions: Boolean(
      action &&
      summaries.length &&
      summaries.every(
        (section) => section.getBoundingClientRect().bottom <= action.getBoundingClientRect().top,
      ),
    ),
    primaryValuesOnOneLine: [
      ...document.querySelectorAll(".currency-summary .sf-metric-card-value"),
    ]
      .filter(isVisible)
      .every((value) => {
        const range = document.createRange();
        range.selectNodeContents(value);
        return range.getClientRects().length === 1 && value.scrollWidth <= value.clientWidth + 1;
      }),
    supportingAfterActions: Boolean(
      action &&
      supporting &&
      action.compareDocumentPosition(supporting) & Node.DOCUMENT_POSITION_FOLLOWING,
    ),
    amountsSeparatedByCurrency: summaries.every((section) =>
      [...section.querySelectorAll(".sf-metric-card-value")].every(
        (value) => value.textContent.trim().length > 0,
      ),
    ),
    longItemVisible: document.body.textContent.includes(
      "Descrição extensa de compromisso financeiro",
    ),
  };
}
function navigationStretchProbe() {
  const shell = document.querySelector(".app-shell");
  const sidebar = document.querySelector(".sidebar");
  const previousRows = shell.style.gridTemplateRows;
  shell.style.gridTemplateRows = "auto auto";
  const stretchedHeight = sidebar.getBoundingClientRect().height;
  shell.style.gridTemplateRows = previousRows;
  const restoredHeight = sidebar.getBoundingClientRect().height;
  return { stretchedHeight, restoredHeight };
}
function intrusivePanelProbe() {
  const action = document.querySelector(".next-actions");
  const firstLink = action?.querySelector(".next-action-row a[href]");
  if (!action || !firstLink)
    return { actionVisibleAfterIntrusion: true, actionVisibleAfterRemoval: false };
  const linkWithinFirstFold = () => {
    const rect = firstLink.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight;
  };
  const panel = document.createElement("aside");
  panel.style.height = "600px";
  panel.setAttribute("aria-label", "Controle negativo de painel secundário intrusivo");
  action.parentElement.insertBefore(panel, action);
  const actionVisibleAfterIntrusion = linkWithinFirstFold();
  panel.remove();
  const actionVisibleAfterRemoval = linkWithinFirstFold();
  return { actionVisibleAfterIntrusion, actionVisibleAfterRemoval };
}

function focusFirstAction() {
  const link = document.querySelector(".next-actions .next-action-row a[href]");
  const href = link?.getAttribute("href") ?? "";
  if (
    !link ||
    !(href.startsWith("/") || (href.startsWith("#") && document.getElementById(href.slice(1))))
  )
    return false;
  link.focus();
  return document.activeElement === link;
}

function focusEvidence() {
  const link = document.querySelector('a[href="#dashboard-evidence-brl-available"]');
  if (!link) return false;
  link.focus();
  return document.activeElement === link;
}
function inspectEvidence() {
  const target = document.getElementById("dashboard-evidence-brl-available");
  return { open: Boolean(target && target.open), hash: location.hash };
}
function expandLongEvidence() {
  const target = document.getElementById("dashboard-evidence-brl-available");
  if (!target) return false;
  target.open = true;
  target.scrollIntoView({ block: "center" });
  return target.textContent.includes("Conta com nome extenso");
}
