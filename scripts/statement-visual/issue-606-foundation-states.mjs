import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  renderAlert,
  renderBadge,
  renderButton,
  renderEmptyState,
  renderFilterBar,
  renderFormLayout,
  renderLoading,
  renderMetricCard,
  renderPageContainer,
  renderPageHeader,
  renderPermissionState,
  renderRecoverableError,
  renderSummaryGrid,
  renderTabs,
  renderToast,
  renderUnavailableState,
} from "../../apps/web/dist/design-system/primitives.js";
import { createSolverFinDesignSystemCss } from "../../apps/web/dist/design-system/styles.js";
import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
if (!chromePath)
  throw new Error("CHROME_BIN is required for issue 606 foundation-state validation.");

await mkdir(outputDir, { recursive: true });
const html = fixtureHtml();
const browser = await launchChrome({ baseUrl, chromePath });
const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  desktop: null,
  mobile: null,
  keyboard: null,
  screenshots: [],
};

try {
  await navigate(browser.cdp, "about:blank");
  await evaluate(
    browser.cdp,
    `(() => { document.open(); document.write(${JSON.stringify(html)}); document.close(); })()`,
  );

  await setViewport(browser.cdp, 1366, 768);
  await sleep(100);
  report.desktop = await inspectFoundation(browser.cdp);
  assertFoundation(report.desktop, 1366);
  await screenshot(browser.cdp, join(outputDir, "issue-606-foundation-states-desktop.png"));
  report.screenshots.push("issue-606-foundation-states-desktop.png");

  report.keyboard = await verifyKeyboardFocus(browser.cdp);
  assert.equal(report.keyboard.focusedId, "issue-606-retry");
  assert.equal(report.keyboard.focusVisible, true);

  await setViewport(browser.cdp, 390, 844);
  await sleep(100);
  report.mobile = await inspectFoundation(browser.cdp);
  assertFoundation(report.mobile, 390);
  assert.equal(report.mobile.summarySingleColumn, true);
  assert.equal(report.mobile.formSingleColumn, true);
  await screenshot(browser.cdp, join(outputDir, "issue-606-foundation-states-mobile.png"));
  report.screenshots.push("issue-606-foundation-states-mobile.png");

  await writeFile(
    join(outputDir, "issue-606-foundation-states.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log("Issue 606 foundation states desktop, mobile and keyboard validation passed.");
} finally {
  await browser.close(outputDir);
}

function assertFoundation(value, width) {
  assert.equal(value.viewportWidth, width);
  assert.ok(
    value.contentViewportWidth > 0 && value.contentViewportWidth <= value.viewportWidth,
    `Invalid content viewport at ${width}px`,
  );
  assert.equal(
    value.contentViewportWidth + value.verticalScrollbarWidth,
    value.viewportWidth,
    `Viewport accounting mismatch at ${width}px`,
  );
  assert.ok(
    value.verticalScrollbarWidth >= 0 && value.verticalScrollbarWidth < 40,
    `Unexpected vertical scrollbar width at ${width}px`,
  );
  assert.equal(value.documentFits, true, `Foundation states overflow at ${width}px`);
  assert.deepEqual(value.states.sort(), ["empty", "error", "loading", "permission", "unavailable"]);
  assert.equal(value.loadingBusy, "true");
  assert.equal(value.errorRole, "alert");
  assert.equal(value.tabsLabel, "Secoes da validacao");
  assert.equal(value.activeTab, "Resumo");
  assert.equal(value.hasBadge, true);
  assert.equal(value.hasAlert, true);
  assert.equal(value.hasToast, true);
  assert.ok(value.minimumInteractiveHeight >= 44, `Interactive target below 44px at ${width}px`);
}

async function inspectFoundation(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const root = document.documentElement;
      const states = Array.from(document.querySelectorAll('.sf-state-panel')).map((node) => node.dataset.state).filter(Boolean);
      const interactive = Array.from(document.querySelectorAll('button'));
      const heights = interactive.map((node) => node.getBoundingClientRect().height).filter((height) => height > 0);
      const summary = document.querySelector('.sf-summary-grid');
      const form = document.querySelector('.sf-form-layout');
      const columnCount = (element) => {
        if (!element) return 0;
        const columns = getComputedStyle(element).gridTemplateColumns.trim();
        return columns ? columns.split(/\\s+/).length : 0;
      };
      return {
        viewportWidth: window.innerWidth,
        contentViewportWidth: root.clientWidth,
        verticalScrollbarWidth: window.innerWidth - root.clientWidth,
        documentFits: root.scrollWidth <= root.clientWidth + 1,
        states,
        loadingBusy: document.querySelector('[data-state="loading"]')?.getAttribute('aria-busy') ?? null,
        errorRole: document.querySelector('[data-state="error"]')?.getAttribute('role') ?? null,
        tabsLabel: document.querySelector('.sf-tabs')?.getAttribute('aria-label') ?? null,
        activeTab: document.querySelector('.sf-tab[aria-current="page"]')?.textContent?.trim() ?? null,
        hasBadge: Boolean(document.querySelector('.sf-badge')),
        hasAlert: Boolean(document.querySelector('.sf-alert')),
        hasToast: Boolean(document.querySelector('.sf-toast')),
        minimumInteractiveHeight: heights.length ? Math.min(...heights) : 0,
        summarySingleColumn: columnCount(summary) === 1,
        formSingleColumn: columnCount(form) <= 1,
      };
    })()`,
  );
}

async function verifyKeyboardFocus(cdp) {
  await evaluate(
    cdp,
    `(() => {
      const target = document.getElementById('issue-606-retry');
      const sentinel = document.createElement('button');
      sentinel.type = 'button';
      sentinel.id = 'issue-606-sentinel';
      sentinel.setAttribute('aria-label', 'Sentinela de foco');
      sentinel.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;padding:0;border:0';
      target.before(sentinel);
      sentinel.focus();
      return true;
    })()`,
  );
  await pressTab(cdp);
  const result = await evaluate(
    cdp,
    `(() => {
      const active = document.activeElement;
      document.getElementById('issue-606-sentinel')?.remove();
      return {
        focusedId: active?.id ?? '',
        focusVisible: active instanceof HTMLElement && active.matches(':focus-visible'),
      };
    })()`,
  );
  return result;
}

async function pressTab(cdp) {
  const event = {
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  };
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...event });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
  await sleep(80);
}

function fixtureHtml() {
  const retry = renderButton({ label: "Tentar novamente", variant: "secondary" }).replace(
    "<button ",
    '<button id="issue-606-retry" ',
  );
  const statePanels = [
    renderLoading({ title: "Carregando dados", description: "Mantendo o contexto da tela." }),
    renderEmptyState({
      title: "Nenhum item neste recorte",
      description: "Ajuste os filtros para revisar outro periodo.",
    }),
    renderRecoverableError({
      title: "Nao foi possivel atualizar",
      description: "Tente novamente sem perder os filtros.",
      actionHtml: retry,
    }),
    renderUnavailableState({
      title: "Dados temporariamente indisponiveis",
      description: "As demais informacoes continuam acessiveis.",
    }),
    renderPermissionState({
      title: "Acesso nao permitido",
      description: "Escolha um contexto financeiro ao qual voce tenha acesso.",
    }),
  ].join("");

  const summary = renderSummaryGrid({
    childrenHtml:
      renderMetricCard({ label: "Itens revisados", value: "12", detail: "Exemplo ficticio" }) +
      renderMetricCard({ label: "Pendencias", value: "3", tone: "attention" }),
  });
  const filter = renderFilterBar({
    label: "Filtros da validacao",
    childrenHtml: renderButton({ label: "Aplicar filtro", variant: "secondary" }),
  });
  const tabs = renderTabs({
    label: "Secoes da validacao",
    items: [
      { label: "Resumo", href: "#resumo", active: true },
      { label: "Detalhes", href: "#detalhes" },
    ],
  });
  const form = renderFormLayout({
    fieldsHtml:
      '<label>Descricao<input class="sf-input sf-focus-ring" value="Exemplo ficticio" /></label>',
    actionsHtml: renderButton({ label: "Salvar exemplo" }),
    errorHtml: renderAlert({ tone: "negative", title: "Revise o campo destacado" }),
  });
  const content = renderPageContainer({
    childrenHtml:
      renderPageHeader({
        title: "Estados operacionais da fundacao",
        description: "Validacao em navegador real de estados, layout e foco.",
      }) +
      tabs +
      filter +
      summary +
      renderBadge({ label: "Em revisao", tone: "attention" }) +
      renderAlert({
        tone: "information",
        title: "Contexto preservado",
        description: "Os estados abaixo usam a mesma fundacao visual.",
      }) +
      statePanels +
      form +
      renderToast({
        title: "Exemplo salvo",
        description: "Feedback ficticio de sucesso.",
        tone: "positive",
      }),
  });

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}${createSolverFinDesignSystemCss()}</style></head><body class="sf-app-surface">${content}</body></html>`;
}
