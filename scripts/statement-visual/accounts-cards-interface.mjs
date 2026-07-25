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
const viewports = [
  { width: 1440, height: 900, suffix: "desktop-1440x900" },
  { width: 1366, height: 768, suffix: "desktop-1366x768" },
  { width: 390, height: 844, suffix: "mobile-390x844" },
];

if (!chromePath) throw new Error("CHROME_BIN is required for accounts and cards validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });

try {
  await browser.cdp.send("Accessibility.enable");
  await setViewport(browser.cdp, 1440, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  await verifyKeyboardTabsAndFilterPersistence(browser.cdp);

  for (const viewport of viewports) {
    await setViewport(browser.cdp, viewport.width, viewport.height);
    await navigate(browser.cdp, `${baseUrl}/contas-cartoes`);
    await sleep(500);
    await captureState(
      browser.cdp,
      "accounts",
      viewport.width,
      viewport.height,
      `issue-535-accounts-${viewport.suffix}.png`,
    );
    await activateCards(browser.cdp);
    await captureState(
      browser.cdp,
      "cards",
      viewport.width,
      viewport.height,
      `issue-535-cards-${viewport.suffix}.png`,
    );
    await captureInstrumentModal(
      browser.cdp,
      viewport.width,
      viewport.height,
      `issue-535-instruments-modal-${viewport.suffix}.png`,
    );
    await captureCardCreateModal(
      browser.cdp,
      viewport.width,
      viewport.height,
      `issue-535-card-create-modal-${viewport.suffix}.png`,
    );

    if (viewport.width === 1366) await verifyConfirmationCancellation(browser.cdp);
  }
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
  join(outputDir, "issue-535-accounts-cards.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Issue 535 accounts and cards visual validation passed.");
}

async function captureState(cdp, expectedTab, width, height, filename) {
  if (expectedTab === "accounts") {
    await navigate(cdp, `${baseUrl}/contas-cartoes`);
    await sleep(500);
  }
  const measurements = await evaluate(cdp, pageStateExpression());
  const accessibility = await accessibilitySummary(cdp);
  await screenshot(cdp, join(outputDir, filename));
  scenarios.push({
    kind: "page",
    expectedTab,
    viewport: `${width}x${height}`,
    filename,
    measurements,
    accessibility,
  });

  check(
    measurements.selectedTab === expectedTab,
    `Issue 535 did not select ${expectedTab}`,
    measurements,
  );
  check(
    measurements.contextActionCount === 1,
    "Issue 535 must expose one primary action",
    measurements,
  );
  check(
    measurements.contextActionLabel ===
      (expectedTab === "cards" ? "Adicionar cartão" : "Adicionar conta"),
    `Issue 535 primary action does not match ${expectedTab}`,
    measurements,
  );
  check(
    measurements.searchPlaceholder ===
      (expectedTab === "cards"
        ? "Buscar por nome, instituição, bandeira ou final"
        : "Buscar por nome, instituição ou conta"),
    `Issue 535 search placeholder does not match ${expectedTab}`,
    measurements,
  );
  check(
    !measurements.hasConnectionsTab,
    "Issue 535 still exposes the Connections tab",
    measurements,
  );
  check(
    JSON.stringify(measurements.statusOptions) === JSON.stringify(["all", "active", "inactive"]),
    "Issue 535 status filter is incomplete",
    measurements,
  );
  check(
    !measurements.globalOverflow,
    `Issue 535 overflows horizontally at ${width}px`,
    measurements,
  );
  check(
    measurements.minimumActionTarget >= 40,
    "Issue 535 has visible row actions smaller than 40px",
    measurements,
  );
  check(
    measurements.itemFooterCount === measurements.itemCount,
    "Issue 535 rows were not normalized into a comparable footer",
    measurements,
  );
  check(
    measurements.tooltipVisibleOnFocus,
    "Issue 535 tooltip is not exposed when an icon action receives focus",
    measurements,
  );
  check(
    accessibility.tabCount >= 2,
    "Issue 535 accessibility tree has no tab semantics",
    accessibility,
  );

  if (expectedTab === "accounts") {
    check(measurements.cdiActionCount > 0, "Issue 535 exposes no CDI actions", measurements);
    check(measurements.cdiActionsIconOnly, "Issue 535 CDI actions still render text", measurements);
    check(
      measurements.enabledCdiLabelsValid,
      "Issue 535 enabled CDI actions lack Ativar/Configurar accessible labels",
      measurements,
    );
  }

  if (expectedTab === "cards") {
    check(
      measurements.inlineInstrumentListCount === 0,
      "Issue 535 still renders instruments inside card rows",
      measurements,
    );
    check(
      measurements.instrumentDisclosureCount === 0,
      "Issue 535 still renders inline instrument disclosures",
      measurements,
    );
    check(
      measurements.viewInstrumentActionCount === measurements.cardRowCount,
      "Issue 535 does not expose one Ver instrumentos action per card",
      measurements,
    );
    check(
      measurements.dedicatedInstrumentDialogCount === measurements.cardRowCount,
      "Issue 535 does not expose one dedicated instrument dialog per card",
      measurements,
    );
  }
}

async function activateCards(cdp) {
  await evaluate(cdp, `document.querySelector('#cards-tab')?.click()`);
  await sleep(180);
}

async function captureInstrumentModal(cdp, width, height, filename) {
  const opened = await evaluate(
    cdp,
    `(() => {
      const trigger = document.querySelector('[data-tab-panel="cards"] .card-account-item [data-view-instruments]');
      if (!trigger) return false;
      trigger.click();
      return true;
    })()`,
  );
  check(opened, "Issue 535 has no Ver instrumentos trigger", { width, height });
  if (!opened) return;
  await sleep(180);

  const createFormState = await evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector('dialog[data-card-instruments-dedicated-dialog][open]');
      const button = dialog?.querySelector('[data-toggle-instrument-create]:not([disabled])');
      if (!button) return { available: false };
      button.click();
      const formId = button.dataset.toggleInstrumentCreate;
      const form = formId ? document.getElementById(formId) : null;
      return {
        available: true,
        visible: Boolean(form && !form.hidden),
        focusedInsideForm: Boolean(form && form.contains(document.activeElement)),
      };
    })()`,
  );
  await sleep(80);
  const measurements = await evaluate(cdp, instrumentModalStateExpression());
  const accessibility = await accessibilitySummary(cdp);
  await screenshot(cdp, join(outputDir, filename));
  scenarios.push({
    kind: "instrument-modal",
    viewport: `${width}x${height}`,
    filename,
    measurements,
    createFormState,
    accessibility,
  });

  check(measurements.open, "Issue 535 instrument modal did not open", measurements);
  check(
    measurements.insideViewport,
    `Issue 535 instrument modal exceeds ${width}x${height}`,
    measurements,
  );
  check(
    measurements.title === "Instrumentos do cartão",
    "Issue 535 instrument modal has an unexpected title",
    measurements,
  );
  check(
    measurements.identifiesCard,
    "Issue 535 instrument modal does not identify the card",
    measurements,
  );
  check(
    measurements.hasInstrumentListOrEmptyState,
    "Issue 535 instrument modal has neither a list nor an empty state",
    measurements,
  );
  check(
    measurements.hasAddInstrumentAction,
    "Issue 535 instrument modal has no Add instrument action",
    measurements,
  );
  check(
    measurements.minimumInstrumentActionTarget >= 40,
    "Issue 535 instrument actions are smaller than 40px",
    measurements,
  );
  check(
    !measurements.hasUnmaskedLongNumber,
    "Issue 535 instrument modal exposes an unmasked long number",
    measurements,
  );
  check(
    accessibility.dialogCount >= 1,
    "Issue 535 instrument modal is absent from the accessibility tree",
    accessibility,
  );
  if (createFormState.available) {
    check(
      createFormState.visible,
      "Issue 535 Add instrument action did not reveal the form",
      createFormState,
    );
    check(
      createFormState.focusedInsideForm,
      "Issue 535 Add instrument action did not move focus into the form",
      createFormState,
    );
  }

  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  await sleep(100);
  const closeState = await evaluate(
    cdp,
    `(() => ({
      open: Boolean(document.querySelector('dialog[data-card-instruments-dedicated-dialog][open]')),
      focusRestored: document.activeElement?.matches?.('[data-view-instruments]') === true,
    }))()`,
  );
  check(!closeState.open, "Issue 535 instrument modal did not close with Escape", closeState);
  check(
    closeState.focusRestored,
    "Issue 535 did not restore focus after closing instruments",
    closeState,
  );
}

async function captureCardCreateModal(cdp, width, height, filename) {
  await evaluate(cdp, `document.querySelector('[data-context-action]')?.click()`);
  await sleep(180);
  const measurements = await evaluate(cdp, cardCreateModalStateExpression());
  await screenshot(cdp, join(outputDir, filename));
  scenarios.push({
    kind: "card-create-modal",
    viewport: `${width}x${height}`,
    filename,
    measurements,
  });

  check(measurements.open, "Issue 535 card creation modal did not open", measurements);
  check(
    measurements.insideViewport,
    `Issue 535 card creation modal exceeds ${width}x${height}`,
    measurements,
  );
  check(
    measurements.hasCloseButton,
    "Issue 535 card modal has no accessible close action",
    measurements,
  );
  check(measurements.hasCancelButton, "Issue 535 card modal has no Cancel action", measurements);
  check(
    measurements.hasSinglePrimaryAction,
    "Issue 535 card modal primary action is ambiguous",
    measurements,
  );
  check(
    JSON.stringify(measurements.groupLabels) ===
      JSON.stringify([
        "Identificação do cartão",
        "Datas e limite",
        "Conta de pagamento",
        "Instrumento inicial",
      ]),
    "Issue 535 card creation form is not grouped as specified",
    measurements,
  );

  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  await sleep(100);
  const focusRestored = await evaluate(
    cdp,
    `document.activeElement?.matches?.('[data-context-action]') === true`,
  );
  check(focusRestored, "Issue 535 did not restore focus after closing card creation", {
    width,
    height,
  });
}

async function verifyKeyboardTabsAndFilterPersistence(cdp) {
  await navigate(cdp, `${baseUrl}/contas-cartoes`);
  await sleep(500);
  const result = await evaluate(
    cdp,
    `(() => {
      const accounts = document.querySelector('#accounts-tab');
      const cards = document.querySelector('#cards-tab');
      const search = document.querySelector('[data-master-search]');
      const status = document.querySelector('[data-master-status]');
      accounts?.focus();
      accounts?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      const arrowSelectedCards = cards?.getAttribute('aria-selected') === 'true' && document.activeElement === cards;
      search.value = 'teste preservado';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      status.value = 'inactive';
      status.dispatchEvent(new Event('change', { bubbles: true }));
      cards?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      const homeSelectedAccounts = accounts?.getAttribute('aria-selected') === 'true' && document.activeElement === accounts;
      const preserved = search.value === 'teste preservado' && status.value === 'inactive';
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      status.value = 'all';
      status.dispatchEvent(new Event('change', { bubbles: true }));
      return { arrowSelectedCards, homeSelectedAccounts, preserved };
    })()`,
  );
  scenarios.push({ kind: "keyboard-and-filter", viewport: "1440x900", result });
  check(result.arrowSelectedCards, "Issue 535 ArrowRight tab navigation failed", result);
  check(result.homeSelectedAccounts, "Issue 535 Home tab navigation failed", result);
  check(result.preserved, "Issue 535 filters were not preserved between tabs", result);
}

async function verifyConfirmationCancellation(cdp) {
  await activateCards(cdp);
  const opened = await evaluate(
    cdp,
    `(() => {
      const instrumentsTrigger = document.querySelector('[data-tab-panel="cards"]:not([hidden]) [data-view-instruments]');
      if (!instrumentsTrigger) return false;
      instrumentsTrigger.click();
      const instrumentsDialog = document.querySelector('dialog[data-card-instruments-dedicated-dialog][open]');
      const forms = instrumentsDialog ? Array.from(instrumentsDialog.querySelectorAll('form[data-confirm]')) : [];
      const form = forms.find((candidate) => {
        const candidateTrigger = candidate.querySelector('button[type="submit"]:not([disabled])');
        const rect = candidateTrigger?.getBoundingClientRect();
        return Boolean(rect && rect.width > 0 && rect.height > 0);
      });
      const trigger = form?.querySelector('button[type="submit"]:not([disabled])');
      if (!form || !trigger) return false;
      window.__issue535OriginalFetch = window.fetch;
      window.__issue535FetchCount = 0;
      window.fetch = (...args) => {
        window.__issue535FetchCount += 1;
        return window.__issue535OriginalFetch(...args);
      };
      form.requestSubmit(trigger);
      return true;
    })()`,
  );
  if (!opened) {
    check(false, "Issue 535 has no destructive action available for confirmation validation", {});
    return;
  }
  await sleep(120);
  const openState = await evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector('dialog.confirm-dialog[open]');
      return {
        open: Boolean(dialog),
        title: dialog?.querySelector('[data-confirm-title]')?.textContent?.trim() || '',
        action: dialog?.querySelector('[data-confirm-submit]')?.textContent?.trim() || '',
      };
    })()`,
  );
  await evaluate(
    cdp,
    `document.querySelector('dialog.confirm-dialog[open] [data-confirm-cancel]')?.click()`,
  );
  await sleep(100);
  const cancelState = await evaluate(
    cdp,
    `(() => {
      const result = {
        requestCount: window.__issue535FetchCount,
        open: Boolean(document.querySelector('dialog.confirm-dialog[open]')),
        focusRestored: document.activeElement?.closest?.('form[data-confirm]') !== null,
      };
      if (window.__issue535OriginalFetch) window.fetch = window.__issue535OriginalFetch;
      delete window.__issue535OriginalFetch;
      delete window.__issue535FetchCount;
      return result;
    })()`,
  );
  scenarios.push({ kind: "confirmation-cancel", viewport: "1366x768", openState, cancelState });
  check(openState.open, "Issue 535 confirmation modal did not open", openState);
  check(
    openState.title.startsWith("Arquivar ") || openState.title.startsWith("Excluir "),
    "Issue 535 confirmation title is not direct",
    openState,
  );
  check(
    openState.action === "Arquivar" || openState.action === "Excluir",
    "Issue 535 confirmation final action is not explicit",
    openState,
  );
  check(cancelState.requestCount === 0, "Issue 535 Cancel sent an API request", cancelState);
  check(!cancelState.open, "Issue 535 confirmation stayed open after Cancel", cancelState);
  check(cancelState.focusRestored, "Issue 535 confirmation did not restore focus", cancelState);
}

async function accessibilitySummary(cdp) {
  const tree = await cdp.send("Accessibility.getFullAXTree");
  const nodes = Array.isArray(tree.nodes) ? tree.nodes : [];
  return {
    nodeCount: nodes.length,
    tabCount: nodes.filter((node) => node.role?.value === "tab").length,
    dialogCount: nodes.filter((node) => node.role?.value === "dialog").length,
    buttonCount: nodes.filter((node) => node.role?.value === "button").length,
  };
}

function pageStateExpression() {
  return `(() => {
    const root = document.documentElement;
    const action = document.querySelector('[data-context-action]');
    const visibleActionButtons = Array.from(document.querySelectorAll('.item-actions button')).filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const actionSizes = visibleActionButtons.map((button) => {
      const rect = button.getBoundingClientRect();
      return Math.min(rect.width, rect.height);
    });
    const status = document.querySelector('[data-master-status]');
    const cardRows = Array.from(document.querySelectorAll('[data-tab-panel="cards"] > .master-list > .card-account-item, [data-tab-panel="cards"] .master-list > .card-account-item'));
    const cdiActions = Array.from(document.querySelectorAll('[data-account-remuneration-action]'));
    const enabledCdiActions = cdiActions.filter((button) => !button.disabled);
    const tooltipTarget = visibleActionButtons.find((button) => button.dataset.tooltip);
    if (tooltipTarget) tooltipTarget.focus();
    const tooltipVisibleOnFocus = !tooltipTarget || document.querySelector('.accounts-cards-tooltip')?.dataset.visible === 'true';
    return {
      selectedTab: document.querySelector('[data-tab][aria-selected="true"]')?.dataset.tab || '',
      contextActionCount: document.querySelectorAll('[data-context-action]').length,
      contextActionLabel: action?.getAttribute('aria-label') || action?.textContent?.trim() || '',
      searchPlaceholder: document.querySelector('[data-master-search]')?.getAttribute('placeholder') || '',
      hasConnectionsTab: Boolean(document.querySelector('#connections-tab')),
      statusOptions: status ? Array.from(status.options).map((option) => option.value) : [],
      globalOverflow: root.scrollWidth > root.clientWidth + 1,
      minimumActionTarget: actionSizes.length > 0 ? Math.min(...actionSizes) : 0,
      itemCount: document.querySelectorAll('[data-master-item]').length,
      itemFooterCount: document.querySelectorAll('[data-master-item] > .item-footer').length,
      cardRowCount: cardRows.length,
      inlineInstrumentListCount: document.querySelectorAll('.card-account-item > .item-main .instrument-list').length,
      instrumentDisclosureCount: document.querySelectorAll('.instrument-disclosure').length,
      viewInstrumentActionCount: document.querySelectorAll('.card-account-item > .item-footer [data-view-instruments], .card-account-item > .item-actions [data-view-instruments]').length,
      dedicatedInstrumentDialogCount: document.querySelectorAll('dialog[data-card-instruments-dedicated-dialog]').length,
      cdiActionCount: cdiActions.length,
      cdiActionsIconOnly: cdiActions.every((button) => button.textContent.trim() === '' && Boolean(button.querySelector('svg'))),
      enabledCdiLabelsValid: enabledCdiActions.every((button) => ['Ativar CDI', 'Configurar CDI'].includes(button.getAttribute('aria-label'))),
      tooltipVisibleOnFocus,
      visiblePanel: document.querySelector('[data-tab-panel]:not([hidden])')?.dataset.tabPanel || '',
    };
  })()`;
}

function instrumentModalStateExpression() {
  return `(() => {
    const dialog = document.querySelector('dialog[data-card-instruments-dedicated-dialog][open]');
    if (!dialog) return { open: false, insideViewport: false, title: '', identifiesCard: false, hasInstrumentListOrEmptyState: false, hasAddInstrumentAction: false, minimumInstrumentActionTarget: 0, hasUnmaskedLongNumber: false };
    const rect = dialog.getBoundingClientRect();
    const actionButtons = Array.from(dialog.querySelectorAll('.instrument-actions button')).filter((button) => {
      const buttonRect = button.getBoundingClientRect();
      return buttonRect.width > 0 && buttonRect.height > 0;
    });
    const actionSizes = actionButtons.map((button) => {
      const buttonRect = button.getBoundingClientRect();
      return Math.min(buttonRect.width, buttonRect.height);
    });
    const text = dialog.textContent || '';
    return {
      open: dialog.open === true,
      insideViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight,
      title: dialog.querySelector('h2')?.textContent?.trim() || '',
      identifiesCard: Boolean(dialog.querySelector('.card-instruments-dialog-heading .muted')?.textContent?.trim()),
      hasInstrumentListOrEmptyState: Boolean(dialog.querySelector('.instrument-list, [data-instrument-empty-state]')),
      hasAddInstrumentAction: Boolean(dialog.querySelector('[data-toggle-instrument-create]')),
      minimumInstrumentActionTarget: actionSizes.length > 0 ? Math.min(...actionSizes) : 40,
      hasUnmaskedLongNumber: /(?:\\d[ -]?){12,19}/.test(text.replace(/\\*+/g, '')),
      width: rect.width,
      height: rect.height,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  })()`;
}

function cardCreateModalStateExpression() {
  return `(() => {
    const dialog = document.querySelector('#new-card-dialog[open]');
    if (!dialog) return { open: false, insideViewport: false, hasCloseButton: false, hasCancelButton: false, hasSinglePrimaryAction: false, groupLabels: [] };
    const rect = dialog.getBoundingClientRect();
    const submitButtons = dialog.querySelectorAll('button[type="submit"]');
    return {
      open: dialog.open === true,
      insideViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight,
      hasCloseButton: Boolean(dialog.querySelector('.dialog-standard-close[aria-label="Fechar"]')),
      hasCancelButton: Array.from(dialog.querySelectorAll('button')).some((button) => button.textContent?.trim() === 'Cancelar'),
      hasSinglePrimaryAction: submitButtons.length === 1,
      groupLabels: Array.from(dialog.querySelectorAll('.card-form-group > legend')).map((legend) => legend.textContent?.trim()),
      width: rect.width,
      height: rect.height,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  })()`;
}

function check(condition, message, context) {
  if (!condition) failures.push({ message, context });
}
