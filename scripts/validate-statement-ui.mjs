import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const debugPort = Number(process.env.CHROME_DEBUG_PORT ?? 9222);
const debugBaseUrl = `http://127.0.0.1:${debugPort}`;
const failures = [];
const pageEvidence = [];
const tooltipEvidence = [];

if (!chromePath) {
  throw new Error("CHROME_BIN is required for visual validation.");
}

await mkdir(outputDir, { recursive: true });
const chromeProfile = await mkdtemp(join(tmpdir(), "solverfin-visual-chrome-"));
const chromeVersion = execFileSync(chromePath, ["--version"], { encoding: "utf8" }).trim();
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${chromeProfile}`,
    "--force-device-scale-factor=1",
    "--window-size=1920,1200",
    "about:blank",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);

let chromeStderr = "";
chrome.stderr.on("data", (chunk) => {
  chromeStderr += String(chunk);
});

let client;
try {
  await waitForHttp(`${debugBaseUrl}/json/version`, 15_000);
  const target = await createTarget(`${baseUrl}/login`);
  client = await CdpClient.connect(target.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Network.enable");

  await loginAndCreateFixtures(client);
  await collectPageEvidence(client);
  await collectTooltipEvidence(client);
} finally {
  if (client) client.close();
  chrome.kill("SIGTERM");
  await rm(chromeProfile, { recursive: true, force: true });
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: chromeVersion,
  zoom: "100%",
  baseUrl,
  failures,
  pages: pageEvidence,
  tooltips: tooltipEvidence,
};

await writeFile(join(outputDir, "measurements.json"), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outputDir, "REPORT.md"), renderMarkdownReport(report));
if (chromeStderr.trim()) {
  await writeFile(join(outputDir, "chrome-stderr.log"), chromeStderr);
}

if (failures.length > 0) {
  console.error(`Visual validation found ${failures.length} failure(s).`);
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log(
    `Visual validation passed with ${pageEvidence.length} page scenarios and ${tooltipEvidence.length} tooltip scenarios.`,
  );
}

async function loginAndCreateFixtures(cdp) {
  await setViewport(cdp, 1366, 1000);
  await navigate(cdp, `${baseUrl}/login`);

  const login = await evaluate(
    cdp,
    `(async () => {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "demo@solverfin.example.invalid",
          password: "SolverFinDemo!2026"
        })
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    })()`,
  );
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  const fixtures = await evaluate(
    cdp,
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

      const longAccount = (await request("/api/accounts", "POST", {
        name: "QA Visual - Valores Extensos",
        kind: "checking",
        openingBalanceMinor: 0,
        currency: "BRL"
      })).account;
      const singleAccount = (await request("/api/accounts", "POST", {
        name: "QA Visual - Linha Unica Negativa",
        kind: "checking",
        openingBalanceMinor: 0,
        currency: "BRL"
      })).account;

      const MAX = 2147483647;
      const transactions = [
        { description: "QA 01 limite positivo", kind: "income", amountMinor: MAX, date: "2026-07-01" },
        { description: "QA 02 saldo zero", kind: "expense", amountMinor: MAX, date: "2026-07-02" },
        { description: "QA 03 saldo negativo", kind: "expense", amountMinor: MAX, date: "2026-07-03" },
        { description: "QA 04 retorno ao zero", kind: "income", amountMinor: MAX, date: "2026-07-04" },
        { description: "QA 05 valor medio", kind: "income", amountMinor: 99999999, date: "2026-07-05" },
        { description: "QA 06 despesa media", kind: "expense", amountMinor: 99999999, date: "2026-07-06" },
        { description: "QA 07 valor longo", kind: "income", amountMinor: 999999999, date: "2026-07-07" },
        { description: "QA 08 despesa longa", kind: "expense", amountMinor: 999999999, date: "2026-07-08" }
      ];

      for (let index = 0; index < 47; index += 1) {
        const day = String(9 + (index % 20)).padStart(2, "0");
        transactions.push({
          description: "QA agregado " + String(index + 1).padStart(2, "0"),
          kind: "income",
          amountMinor: MAX,
          date: "2026-07-" + day
        });
      }

      for (const item of transactions) {
        await request("/api/transactions", "POST", {
          accountId: longAccount.id,
          kind: item.kind,
          amountMinor: item.amountMinor,
          occurredOn: item.date,
          plannedOn: item.date,
          effectiveOn: item.date,
          status: "posted",
          description: item.description,
          currency: "BRL"
        });
      }

      await request("/api/transactions", "POST", {
        accountId: singleAccount.id,
        kind: "expense",
        amountMinor: MAX,
        occurredOn: "2026-07-15",
        plannedOn: "2026-07-15",
        effectiveOn: "2026-07-15",
        status: "posted",
        description: "QA unica linha negativa",
        currency: "BRL"
      });

      return { longAccountId: longAccount.id, singleAccountId: singleAccount.id };
    })()`,
  );

  globalThis.fixtureIds = fixtures;
}

async function collectPageEvidence(cdp) {
  const longRoute = `/lancamentos?accountId=${encodeURIComponent(globalThis.fixtureIds.longAccountId)}&month=2026-07`;
  const statementWidths = [390, 768, 1366, 1920];

  for (const width of statementWidths) {
    const evidence = await capturePageScenario(cdp, {
      name: `lancamentos-${width}`,
      route: longRoute,
      width,
      height: width <= 768 ? 1100 : 1000,
    });
    validateStatementScenario(evidence, width);
  }

  const centered = await capturePageScenario(cdp, {
    name: "lancamentos-2560-centered",
    route: longRoute,
    width: 2560,
    height: 1100,
  });
  check(centered.measurements.mainWidth <= 1800.5, "Main exceeds 1800px at 2560px", centered);
  check(centered.measurements.centerDelta <= 1.5, "Main is not centered at 2560px", centered);

  for (const route of ["/dashboard", "/cartoes", "/contas"]) {
    for (const width of [390, 1366]) {
      const evidence = await capturePageScenario(cdp, {
        name: `${route.slice(1)}-${width}`,
        route,
        width,
        height: width === 390 ? 1000 : 900,
      });
      check(
        !evidence.measurements.globalOverflow,
        `${route} has global horizontal overflow at ${width}px`,
        evidence,
      );
      check(
        evidence.measurements.mainWidth > 0,
        `${route} has no measurable main area at ${width}px`,
        evidence,
      );
      check(
        evidence.measurements.outsideEssential.length === 0,
        `${route} has essential content outside the viewport at ${width}px`,
        evidence.measurements.outsideEssential,
      );
    }
  }
}

async function capturePageScenario(cdp, scenario) {
  await setViewport(cdp, scenario.width, scenario.height);
  await navigate(cdp, `${baseUrl}${scenario.route}`);
  await sleep(350);
  const measurements = await evaluate(cdp, pageMeasurementExpression());
  const filename = `${scenario.name}.png`;
  await screenshot(cdp, join(outputDir, filename));
  const evidence = { ...scenario, screenshot: filename, measurements };
  pageEvidence.push(evidence);
  return evidence;
}

function validateStatementScenario(evidence, width) {
  const { measurements } = evidence;
  check(
    !measurements.globalOverflow,
    `Statement has global horizontal overflow at ${width}px`,
    measurements,
  );
  check(
    measurements.moneyProblems.length === 0,
    `Statement has clipped or wrapped money at ${width}px`,
    measurements.moneyProblems,
  );
  check(
    measurements.overlaps.length === 0,
    `Statement has overlapping summary elements at ${width}px`,
    measurements.overlaps,
  );
  check(
    measurements.outsideEssential.length === 0,
    `Statement has essential content outside local overflow at ${width}px`,
    measurements.outsideEssential,
  );
  check(
    measurements.balanceHierarchy,
    `Primary balance hierarchy is not preserved at ${width}px`,
    measurements,
  );

  if (width <= 768) {
    check(
      measurements.layoutMode === "stacked",
      `Statement is not stacked at ${width}px`,
      measurements,
    );
  }
  if (width >= 1366) {
    check(
      measurements.layoutMode === "side-by-side",
      `Statement is not side-by-side at ${width}px`,
      measurements,
    );
  }
  if (width === 1920) {
    check(
      measurements.mainWidth >= 1680 && measurements.mainWidth <= 1800.5,
      `Main width at 1920px is outside 1680-1800px: ${measurements.mainWidth}`,
      measurements,
    );
  }
  if (width === 768 || width === 1366) {
    check(
      measurements.table.hasLocalHorizontalScroll,
      `Table has no localized horizontal scroll at ${width}px`,
      measurements.table,
    );
  }
}

async function collectTooltipEvidence(cdp) {
  const longRoute = `/lancamentos?accountId=${encodeURIComponent(globalThis.fixtureIds.longAccountId)}&month=2026-07`;
  const singleRoute = `/lancamentos?accountId=${encodeURIComponent(globalThis.fixtureIds.singleAccountId)}&month=2026-07`;

  await captureTooltipScenario(cdp, {
    name: "tooltip-first-row-hover-desktop",
    route: longRoute,
    width: 1366,
    height: 900,
    position: "first",
    activation: "hover",
  });
  await captureTooltipScenario(cdp, {
    name: "tooltip-middle-row-tab-desktop",
    route: longRoute,
    width: 1366,
    height: 900,
    position: "middle",
    activation: "tab",
  });
  await captureTooltipScenario(cdp, {
    name: "tooltip-last-row-after-scroll-desktop",
    route: longRoute,
    width: 1366,
    height: 900,
    position: "last",
    activation: "focus",
    scrollTable: true,
  });
  await captureTooltipScenario(cdp, {
    name: "tooltip-single-row-desktop",
    route: singleRoute,
    width: 1366,
    height: 900,
    position: "only",
    activation: "focus",
  });
  await captureTooltipScenario(cdp, {
    name: "tooltip-last-row-mobile",
    route: longRoute,
    width: 390,
    height: 900,
    position: "last",
    activation: "focus",
  });
}

async function captureTooltipScenario(cdp, scenario) {
  await setViewport(cdp, scenario.width, scenario.height);
  await navigate(cdp, `${baseUrl}${scenario.route}`);
  await sleep(300);

  const preparation = await evaluate(
    cdp,
    `(() => {
      const triggers = Array.from(document.querySelectorAll(".statement-status[data-tooltip]"));
      if (triggers.length === 0) throw new Error("No statement status triggers found");
      const position = ${JSON.stringify(scenario.position)};
      const index = position === "first" ? 0 : position === "middle" ? Math.floor(triggers.length / 2) : triggers.length - 1;
      const trigger = triggers[index];
      trigger.dataset.visualTarget = "true";
      trigger.scrollIntoView({ block: "center", inline: "center" });
      const table = trigger.closest(".statement-table");
      if (${scenario.scrollTable === true}) table.scrollLeft = table.scrollWidth;
      return { count: triggers.length, index, tableScrollLeft: table ? table.scrollLeft : 0 };
    })()`,
  );

  if (scenario.activation === "hover") {
    await evaluate(
      cdp,
      `(() => {
        const trigger = document.querySelector('[data-visual-target="true"]');
        trigger.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
        return true;
      })()`,
    );
  } else if (scenario.activation === "tab") {
    await evaluate(
      cdp,
      `(() => {
        const target = document.querySelector('[data-visual-target="true"]');
        const focusable = Array.from(document.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hidden && element.getClientRects().length > 0);
        const index = focusable.indexOf(target);
        if (index < 1) throw new Error("No previous focusable element for Tab scenario");
        focusable[index - 1].focus();
        return { previousTag: document.activeElement.tagName, targetIndex: index };
      })()`,
    );
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      nativeVirtualKeyCode: 9,
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      nativeVirtualKeyCode: 9,
    });
  } else {
    await evaluate(
      cdp,
      `(() => {
        document.querySelector('[data-visual-target="true"]').focus();
        return true;
      })()`,
    );
  }

  await sleep(180);
  const measurements = await evaluate(
    cdp,
    `(() => {
      const trigger = document.querySelector('[data-visual-target="true"]');
      const tooltip = document.querySelector("#statement-status-tooltip");
      const rect = tooltip ? tooltip.getBoundingClientRect() : null;
      const table = trigger.closest(".statement-table");
      return {
        activeIsTarget: document.activeElement === trigger,
        ariaLabel: trigger.getAttribute("aria-label"),
        describedBy: trigger.getAttribute("aria-describedby"),
        tooltipExists: Boolean(tooltip),
        tooltipVisible: Boolean(tooltip && !tooltip.hidden && getComputedStyle(tooltip).display !== "none"),
        tooltipParentIsBody: Boolean(tooltip && tooltip.parentElement === document.body),
        tooltipRect: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
        insideViewport: Boolean(rect && rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight),
        tableScrollLeft: table ? table.scrollLeft : 0,
        tableScrollWidth: table ? table.scrollWidth : 0,
        tableClientWidth: table ? table.clientWidth : 0,
        triggerRect: (() => {
          const value = trigger.getBoundingClientRect();
          return { left: value.left, right: value.right, top: value.top, bottom: value.bottom };
        })()
      };
    })()`,
  );

  const filename = `${scenario.name}.png`;
  await screenshot(cdp, join(outputDir, filename));
  const evidence = { ...scenario, screenshot: filename, preparation, measurements };
  tooltipEvidence.push(evidence);

  check(
    measurements.tooltipExists,
    `${scenario.name}: tooltip element was not created`,
    measurements,
  );
  check(
    measurements.tooltipVisible,
    `${scenario.name}: tooltip is not visible`,
    measurements,
  );
  check(
    measurements.tooltipParentIsBody,
    `${scenario.name}: tooltip is not appended to body`,
    measurements,
  );
  check(
    measurements.insideViewport,
    `${scenario.name}: tooltip is clipped by the viewport`,
    measurements,
  );
  check(Boolean(measurements.ariaLabel), `${scenario.name}: accessible name is missing`, measurements);
  check(
    Boolean(measurements.describedBy),
    `${scenario.name}: aria-describedby is missing`,
    measurements,
  );
  if (scenario.activation === "tab") {
    check(
      measurements.activeIsTarget,
      `${scenario.name}: Tab did not focus the status indicator`,
      measurements,
    );
  }
  if (scenario.scrollTable === true) {
    check(
      measurements.tableScrollLeft > 0,
      `${scenario.name}: table was not horizontally scrolled`,
      measurements,
    );
  }
}

function pageMeasurementExpression() {
  return `(() => {
    const root = document.documentElement;
    const body = document.body;
    const main = document.querySelector(".main-area > main");
    const mainArea = document.querySelector(".main-area");
    const summary = document.querySelector(".account-summary");
    const statementPanel = document.querySelector(".statement-panel");
    const table = document.querySelector(".statement-table");
    const rect = (element) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    const mainRect = rect(main);
    const mainAreaRect = rect(mainArea);
    const summaryRect = rect(summary);
    const panelRect = rect(statementPanel);
    const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
    const localScrollableAncestor = (element) => {
      let candidate = element;
      while (candidate && candidate !== body) {
        const style = getComputedStyle(candidate);
        if ((style.overflowX === "auto" || style.overflowX === "scroll") && candidate.scrollWidth > candidate.clientWidth + 1) return candidate;
        candidate = candidate.parentElement;
      }
      return null;
    };

    const moneyProblems = Array.from(document.querySelectorAll(".summary-balance strong, .summary-total strong, .status-line strong, .col-amount, .col-balance")).flatMap((element) => {
      const style = getComputedStyle(element);
      const locallyScrollable = Boolean(localScrollableAncestor(element));
      const clipped = element.scrollWidth > element.clientWidth + 1 && !locallyScrollable && style.overflowX !== "auto" && style.overflowX !== "scroll";
      const wrapped = style.whiteSpace !== "nowrap";
      const silentlyHidden = style.textOverflow === "ellipsis" || style.overflowX === "hidden" || style.overflowX === "clip";
      return clipped || wrapped || silentlyHidden ? [{ text: element.textContent.trim(), clipped, wrapped, silentlyHidden, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, overflowX: style.overflowX, whiteSpace: style.whiteSpace }] : [];
    });

    const overlaps = [];
    for (const container of document.querySelectorAll(".summary-total, .status-line")) {
      const children = Array.from(container.children).filter((child) => child.getClientRects().length > 0);
      for (let leftIndex = 0; leftIndex < children.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < children.length; rightIndex += 1) {
          const leftRect = children[leftIndex].getBoundingClientRect();
          const rightRect = children[rightIndex].getBoundingClientRect();
          if (overlap(leftRect, rightRect)) overlaps.push({ container: container.className, left: children[leftIndex].textContent.trim(), right: children[rightIndex].textContent.trim() });
        }
      }
    }

    const essentialSelectors = "h1, h2, button, a, input, select, .summary-balance strong, .summary-total strong, .status-line strong, .col-amount, .col-balance";
    const outsideEssential = Array.from(document.querySelectorAll(essentialSelectors)).flatMap((element) => {
      if (element.getClientRects().length === 0) return [];
      const value = element.getBoundingClientRect();
      const outside = value.left < -1 || value.right > window.innerWidth + 1;
      if (!outside || localScrollableAncestor(element)) return [];
      return [{ selector: element.className || element.tagName, text: element.textContent.trim().slice(0, 80), left: value.left, right: value.right }];
    });

    let layoutMode = "not-applicable";
    if (summaryRect && panelRect) {
      if (Math.abs(summaryRect.top - panelRect.top) <= 8 && summaryRect.right <= panelRect.left + 1) layoutMode = "side-by-side";
      else if (summaryRect.bottom <= panelRect.top + 1) layoutMode = "stacked";
      else layoutMode = "overlap";
    }

    const primaryBalance = document.querySelector(".summary-balance strong");
    const secondaryBalance = document.querySelector(".summary-total strong");
    const primarySize = primaryBalance ? parseFloat(getComputedStyle(primaryBalance).fontSize) : 0;
    const secondarySize = secondaryBalance ? parseFloat(getComputedStyle(secondaryBalance).fontSize) : 0;

    return {
      title: document.title,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      mainWidth: mainRect ? mainRect.width : 0,
      mainLeft: mainRect ? mainRect.left : 0,
      rootScrollWidth: root.scrollWidth,
      rootClientWidth: root.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      globalOverflow: root.scrollWidth !== root.clientWidth || body.scrollWidth > root.clientWidth + 1,
      centerDelta: mainRect && mainAreaRect ? Math.abs((mainRect.left + mainRect.width / 2) - (mainAreaRect.left + mainAreaRect.width / 2)) : 0,
      layoutMode,
      summaryRect,
      panelRect,
      table: table ? {
        clientWidth: table.clientWidth,
        scrollWidth: table.scrollWidth,
        overflowX: getComputedStyle(table).overflowX,
        hasLocalHorizontalScroll: table.scrollWidth > table.clientWidth + 1 && ["auto", "scroll"].includes(getComputedStyle(table).overflowX)
      } : { clientWidth: 0, scrollWidth: 0, overflowX: "", hasLocalHorizontalScroll: false },
      moneyProblems,
      overlaps,
      outsideEssential,
      primaryBalanceFontSize: primarySize,
      secondaryBalanceFontSize: secondarySize,
      balanceHierarchy: !primaryBalance || !secondaryBalance || primarySize > secondarySize
    };
  })()`;
}

async function setViewport(cdp, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 760,
    screenWidth: width,
    screenHeight: height,
  });
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
}

async function navigate(cdp, url) {
  const loaded = cdp.waitForEvent("Page.loadEventFired", 15_000);
  await cdp.send("Page.navigate", { url });
  await loaded;
  await waitForExpression(cdp, "document.readyState === 'complete'", 10_000);
}

async function screenshot(cdp, path) {
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path, Buffer.from(result.data, "base64"));
}

async function evaluate(cdp, expression) {
  const response = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  }
  return response.result.value;
}

async function waitForExpression(cdp, expression, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(cdp, expression)) return;
    } catch {
      // Execution contexts can be replaced briefly during navigation.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function createTarget(url) {
  const response = await fetch(`${debugBaseUrl}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
  });
  if (!response.ok) throw new Error(`Could not create Chrome target: ${response.status}`);
  return response.json();
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Chrome may still be starting.
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function check(condition, message, context) {
  if (condition) return;
  failures.push({ message, context });
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function renderMarkdownReport(report) {
  const pageRows = report.pages
    .map(
      (item) =>
        `| ${item.name} | ${item.measurements.viewportWidth} | ${item.measurements.mainWidth.toFixed(1)} | ${item.measurements.rootScrollWidth}/${item.measurements.rootClientWidth}/${item.measurements.bodyScrollWidth} | ${item.measurements.layoutMode} | ${item.measurements.table.hasLocalHorizontalScroll ? "sim" : "nao"} | ${item.screenshot} |`,
    )
    .join("\n");
  const tooltipRows = report.tooltips
    .map(
      (item) =>
        `| ${item.name} | ${item.activation} | ${item.measurements.tooltipVisible ? "sim" : "nao"} | ${item.measurements.insideViewport ? "sim" : "nao"} | ${item.measurements.activeIsTarget ? "sim" : "nao"} | ${item.measurements.tableScrollLeft.toFixed(0)} | ${item.screenshot} |`,
    )
    .join("\n");
  const failureSection =
    report.failures.length === 0
      ? "Nenhuma falha detectada."
      : report.failures.map((failure) => `- ${failure.message}`).join("\n");

  return `# Evidencia visual das issues #470, #471 e #472

- Commit: \`${report.commit}\`
- Navegador: ${report.browser}
- Zoom: ${report.zoom}
- Gerado em: ${report.generatedAt}
- Dados: exclusivamente ficticios em PostgreSQL efemero

## Matriz de paginas

| Cenario | Viewport | Main (px) | root scroll/client/body | Layout | Scroll local | Screenshot |
|---|---:|---:|---|---|---|---|
${pageRows}

## Tooltips

| Cenario | Ativacao | Visivel | Dentro da viewport | Foco no alvo | Scroll tabela | Screenshot |
|---|---|---|---|---|---:|---|
${tooltipRows}

## Resultado

${failureSection}
`;
}

class CdpClient {
  static async connect(url) {
    if (typeof globalThis.WebSocket !== "function") {
      throw new Error("Node.js with global WebSocket support is required.");
    }
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timed out connecting to Chrome DevTools")),
        10_000,
      );
      socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.addEventListener("error", (event) => {
        clearTimeout(timeout);
        reject(event.error ?? new Error("Chrome DevTools WebSocket failed"));
      });
    });
    return new CdpClient(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => this.onMessage(String(event.data)));
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 20_000);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(payload);
    });
  }

  waitForEvent(method, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const listeners = this.listeners.get(method) ?? [];
        this.listeners.set(
          method,
          listeners.filter((candidate) => candidate.resolve !== resolve),
        );
        reject(new Error(`CDP event timed out: ${method}`));
      }, timeoutMs);
      const listeners = this.listeners.get(method) ?? [];
      listeners.push({ resolve, reject, timeout });
      this.listeners.set(method, listeners);
    });
  }

  close() {
    this.socket.close();
  }

  onMessage(raw) {
    const message = JSON.parse(raw);
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? {});
      return;
    }

    const listeners = this.listeners.get(message.method) ?? [];
    if (listeners.length === 0) return;
    const [listener, ...remaining] = listeners;
    clearTimeout(listener.timeout);
    this.listeners.set(message.method, remaining);
    listener.resolve(message.params ?? {});
  }
}
