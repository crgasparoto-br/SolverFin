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
  commit: process.env.GITHUB_SHA ?? "local",
  route: "/dashboard",
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
    if (state === "error") {
      assert.equal(measurements.hasError, true, "Error panel was not rendered");
      assert.equal(measurements.currencyCount, 0, "Error state leaked totals");
    } else {
      assert.equal(measurements.hasNextActions, true, "Next actions missing");
      assert.equal(measurements.primaryCount, state.startsWith("multi-currency") ? 4 : 2);
      assert.equal(
        measurements.supportingAfterActions,
        true,
        "Secondary indicators precede next action",
      );
      assert.equal(measurements.amountsSeparatedByCurrency, true, "Mixed currencies in a summary");
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
        state + " action is below first fold at " + width,
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
        recentItems:
          variant === "long-content"
            ? [
                {
                  description: "QA " + "Descrição extensa de compromisso financeiro ".repeat(8),
                  kind: "expense",
                  amountMinor: 2500,
                  currency: "BRL",
                  occurredOn: "2026-07-12",
                  status: "posted",
                },
              ]
            : [],
      });
    }
    if (path === "/api/cash-flow-projection") {
      return response({
        referenceDate: "2026-07-01",
        horizonDays: 30,
        from: "2026-07-02",
        to: "2026-07-31",
        currencyBlocks: (variant.startsWith("multi-currency") ? ["BRL", "USD"] : ["BRL"]).map(
          (currency) => ({ currency, closingBalanceMinor: 10200 }),
        ),
        ...(variant === "multi-currency"
          ? {
              freeToSpend: {
                referenceDate: "2026-07-01",
                horizonDays: 30,
                currencyBlocks: ["BRL", "USD"].map((currency) => ({
                  currency,
                  status: "available",
                  minimumProjectedBalanceMinor: 10000,
                  minimumBalanceOn: "2026-07-10",
                  freeToSpendMinor: 9000,
                  projectedDeficitMinor: 0,
                })),
              },
            }
          : {}),
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
  const supporting = document.querySelector(".dashboard-supporting-section");
  return {
    viewportWidth: innerWidth,
    documentUrl: location.href,
    noHorizontalOverflow: root.scrollWidth <= root.clientWidth + 1,
    mainPresent: Boolean(document.querySelector("main")),
    hasError: document.body.textContent.includes("Não foi possível carregar o Dashboard"),
    hasPartial: Boolean(document.querySelector('[data-quality="partial"]')),
    currencyCount: summaries.length,
    currencies: summaries.map((section) => section.id.replace("currency-", "")),
    primaryCount: document.querySelectorAll(".currency-summary .dashboard-metric").length,
    hasNextActions: Boolean(action),
    actionVisibleInFirstViewport: Boolean(
      action?.querySelector("h2")?.getBoundingClientRect().bottom <= innerHeight,
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
    ].every((value) => {
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
function intrusivePanelProbe() {
  const action = document.querySelector(".next-actions");
  const title = action?.querySelector("h2");
  if (!action || !title)
    return { actionVisibleAfterIntrusion: true, actionVisibleAfterRemoval: false };
  const panel = document.createElement("aside");
  panel.style.height = "600px";
  panel.setAttribute("aria-label", "Controle negativo de painel secundário intrusivo");
  action.parentElement.insertBefore(panel, action);
  const actionVisibleAfterIntrusion = title.getBoundingClientRect().bottom <= innerHeight;
  panel.remove();
  const actionVisibleAfterRemoval = title.getBoundingClientRect().bottom <= innerHeight;
  return { actionVisibleAfterIntrusion, actionVisibleAfterRemoval };
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
