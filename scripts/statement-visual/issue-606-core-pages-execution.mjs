import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { fixtureExpression, loginExpression } from "./fixtures.mjs";
import { pageMeasurementExpression } from "./measurements.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const requestedRoute = process.env.STATEMENT_VISUAL_ROUTE;
const allowedRoutes = new Set(["/lancamentos", "/dashboard", "/cartoes", "/contas"]);

if (!chromePath) {
  throw new Error("CHROME_BIN is required for core-page visual validation.");
}
if (!requestedRoute || !allowedRoutes.has(requestedRoute)) {
  throw new Error(`Unsupported core-page coverage route: ${requestedRoute ?? "<missing>"}.`);
}
await mkdir(outputDir, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  route: requestedRoute,
  state: process.env.STATEMENT_VISUAL_STATE ?? "normal",
  browser: "unknown",
  pages: [],
  failures: [],
};

let browser;
try {
  browser = await launchChrome({ baseUrl, chromePath });
  report.browser = browser.version;
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status}`);

  let route = requestedRoute;
  let viewports = [
    [390, 1100],
    [1366, 1000],
  ];
  if (requestedRoute === "/dashboard") {
    viewports = [
      [320, 740],
      [390, 844],
      [1366, 768],
    ];
  }
  if (requestedRoute === "/lancamentos") {
    const fixtureIds = await evaluate(browser.cdp, fixtureExpression());
    route = `/lancamentos?accountId=${encodeURIComponent(fixtureIds.longAccountId)}&month=2026-07`;
    viewports = [
      [390, 1100],
      [768, 1100],
      [1366, 1000],
      [1920, 1000],
    ];
  }

  for (const [width, height] of viewports) {
    await setViewport(browser.cdp, width, height);
    await navigate(browser.cdp, `${baseUrl}${route}`);
    await sleep(300);
    const measurements = await measurePage(browser.cdp);
    const stem = slug(requestedRoute);
    const screenshotName = `issue-606-core-${stem}-${width}.png`;
    await screenshot(browser.cdp, join(outputDir, screenshotName));

    assert.equal(
      measurements.globalOverflow,
      false,
      `${requestedRoute} has global overflow at ${width}px.`,
    );
    assert.ok(measurements.mainWidth > 0, `${requestedRoute} has no measurable main region.`);
    assert.deepEqual(
      measurements.outsideEssential,
      [],
      `${requestedRoute} has essential content outside the viewport at ${width}px.`,
    );

    if (requestedRoute === "/dashboard") {
      const readingOrder = await evaluate(browser.cdp, dashboardFirstReadExpression());
      assert.equal(readingOrder.hasPrimaryMetrics, true, "Dashboard has no two primary metrics");
      assert.equal(readingOrder.hasNextActions, true, "Dashboard has no next action");
      assert.equal(readingOrder.amountsOnOneLine, true, "Primary value wraps");
      assert.equal(
        readingOrder.supportingAfterActions,
        true,
        "Secondary metrics precede next action",
      );
      if (width <= 390) {
        assert.equal(
          readingOrder.actionVisibleInFirstViewport,
          true,
          `Dashboard next action is below first fold at ${width}px`,
        );
        const negative = await evaluate(browser.cdp, dashboardIntrusivePanelProbeExpression());
        assert.equal(
          negative.actionVisibleAfterIntrusion,
          false,
          "Intrusive panel negative control must fail the first-fold gate",
        );
        assert.equal(
          negative.actionVisibleAfterRemoval,
          true,
          "Removing intrusive panel must restore the first-fold gate",
        );
      }
      measurements.dashboardFirstRead = readingOrder;
    }

    if (requestedRoute === "/lancamentos") {
      assert.deepEqual(
        measurements.moneyProblems,
        [],
        `Statement money layout failed at ${width}px.`,
      );
      assert.equal(
        measurements.balanceHierarchy,
        true,
        `Statement balance hierarchy failed at ${width}px.`,
      );
      if (width === 768 || width === 1366) {
        assert.equal(
          measurements.table.hasLocalHorizontalScroll,
          true,
          `Statement table lacks local horizontal scroll at ${width}px.`,
        );
      }
    }

    report.pages.push({
      width,
      height,
      screenshot: screenshotName,
      measurements,
    });
  }

  if (requestedRoute === "/lancamentos") {
    report.modalButtons = [];
    for (const [width, height] of [
      [320, 740],
      [390, 844],
      [1366, 768],
    ]) {
      await setViewport(browser.cdp, width, height);
      await navigate(browser.cdp, `${baseUrl}${route}`);
      await sleep(250);
      const opened = await evaluate(
        browser.cdp,
        `(() => {
          const trigger = document.querySelector('[data-open-modal][data-quick-kind="expense"]:not(:disabled)');
          trigger?.click();
          return Boolean(document.querySelector('dialog[data-modal][open]'));
        })()`,
      );
      assert.equal(opened, true, `Novo lançamento não abre em ${width}px.`);
      const buttons = await evaluate(
        browser.cdp,
        `(() => {
          const dialog = document.querySelector('dialog[data-modal][open]');
          const panel = dialog?.querySelector('.modal-panel');
          const group = dialog?.querySelector('.statement-save-actions');
          const status = dialog?.querySelector('.save-row .status-icons');
          const actions = Array.from(group?.querySelectorAll(':scope > button') ?? [])
            .filter((button) => !button.hidden);
          const last = actions.at(-1);
          last?.scrollIntoView({ block: 'nearest' });
          last?.focus();
          const bounds = (node) => node?.getBoundingClientRect();
          const outer = bounds(panel);
          const inner = bounds(group);
          const statusRect = bounds(status);
          const controls = actions.map((button) => ({
            label: button.textContent.trim(),
            rectangle: bounds(button).toJSON(),
            visible: button.getClientRects().length > 0,
          }));
          const fits = controls.every((control) =>
            control.visible && control.rectangle.width >= 44 &&
            control.rectangle.left >= outer.left - 1 &&
            control.rectangle.right <= outer.right + 1 &&
            control.rectangle.left >= inner.left - 1 &&
            control.rectangle.right <= inner.right + 1 &&
            control.rectangle.top >= outer.top - 1 &&
            control.rectangle.bottom <= outer.bottom + 1);
          const separateRows = statusRect.bottom <= controls[0].rectangle.top + 1;
          return {
            labels: controls.map((control) => control.label),
            panelWidth: outer.width,
            groupWidth: inner.width,
            layout: getComputedStyle(group).display,
            horizontalOverflow: group.scrollWidth > group.clientWidth + 1,
            fits,
            separateRows,
            focused: document.activeElement === last,
          };
        })()`,
      );
      assert.deepEqual(
        buttons.labels,
        ["Cancelar", "Salvar e continuar", "Salvar lançamento"],
        `Os três botões precisam permanecer visíveis em ${width}px.`,
      );
      assert.equal(buttons.layout, "grid", `Rodapé não usa grade em ${width}px.`);
      assert.equal(buttons.horizontalOverflow, false, `Botões transbordam em ${width}px.`);
      assert.equal(buttons.fits, true, `Botões cortados em ${width}px: ${JSON.stringify(buttons)}`);
      assert.equal(buttons.separateRows, true, `Ícones sobrepõem os botões em ${width}px.`);
      assert.equal(buttons.focused, true, `Botão Salvar lançamento não é focável em ${width}px.`);
      const screenshotName = `issue-606-statement-entry-buttons-${width}.png`;
      await screenshot(browser.cdp, join(outputDir, screenshotName));
      report.modalButtons.push({ width, height, screenshot: screenshotName, ...buttons });
    }
  }
} catch (error) {
  report.failures.push({ message: serializeError(error) });
} finally {
  if (browser) await browser.close(outputDir);
}

const artifactStem = `issue-606-core-${slug(requestedRoute)}`;
await writeFile(join(outputDir, `${artifactStem}.json`), `${JSON.stringify(report, null, 2)}\n`);
if (report.failures.length > 0) {
  for (const failure of report.failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log(`${requestedRoute} focused core-page validation passed.`);
}

async function measurePage(cdp, attempts = 5) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await evaluate(cdp, pageMeasurementExpression());
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
      await sleep(100 * (attempt + 1));
    }
  }
  throw lastError ?? new Error("Core-page measurement failed without a captured error.");
}

function dashboardFirstReadExpression() {
  return `(() => {
    const primary = document.querySelectorAll('.currency-summary .dashboard-metric');
    const action = document.querySelector('.next-actions');
    const supporting = document.querySelector('.dashboard-supporting-section');
    const headline = action?.querySelector('h2');
    return {
      hasPrimaryMetrics: primary.length >= 2,
      hasNextActions: !!action,
      amountsOnOneLine: [...document.querySelectorAll('.currency-summary .sf-metric-card-value')].every((value) => {
        const range = document.createRange();
        range.selectNodeContents(value);
        return range.getClientRects().length === 1 && value.scrollWidth <= value.clientWidth + 1;
      }),
      supportingAfterActions: !!action && !!supporting &&
        !!(action.compareDocumentPosition(supporting) & Node.DOCUMENT_POSITION_FOLLOWING),
      actionVisibleInFirstViewport: !!headline && headline.getBoundingClientRect().bottom <= innerHeight,
      headlineBottom: headline?.getBoundingClientRect().bottom ?? null,
    };
  })()`;
}

function dashboardIntrusivePanelProbeExpression() {
  return `(() => {
    const target = document.querySelector('.next-actions');
    const headline = target?.querySelector('h2');
    if (!target || !headline) return { actionVisibleAfterIntrusion: true, actionVisibleAfterRemoval: false };
    const intrusive = document.createElement('aside');
    intrusive.style.height = '600px';
    intrusive.setAttribute('aria-label', 'Painel secundário intrusivo - controle negativo');
    target.parentElement.insertBefore(intrusive, target);
    const actionVisibleAfterIntrusion = headline.getBoundingClientRect().bottom <= innerHeight;
    intrusive.remove();
    const actionVisibleAfterRemoval = headline.getBoundingClientRect().bottom <= innerHeight;
    return { actionVisibleAfterIntrusion, actionVisibleAfterRemoval };
  })()`;
}

function slug(value) {
  return value.replace(/^\/+/, "").replace(/[^a-zA-Z0-9]+/g, "-") || "root";
}

function serializeError(error) {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
