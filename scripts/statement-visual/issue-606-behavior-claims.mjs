import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, setViewport, sleep } from "./cdp.mjs";
import { fixtureExpression, loginExpression } from "./fixtures.mjs";
import { writeSemanticProof } from "./semantic-proof.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const requiredAssertions = parseRequiredAssertions();
const requestedRoute = process.env.STATEMENT_VISUAL_ROUTE ?? "";
const sourceScenario = process.env.STATEMENT_VISUAL_SOURCE_SCENARIO_ID ?? "";

if (!chromePath) throw new Error("CHROME_BIN is required for behavior-claim validation.");
if (requiredAssertions.length === 0) {
  throw new Error("Behavior-claim validation requires at least one assertion.");
}

const browser = await launchChrome({ baseUrl, chromePath });
const observations = {};
let fixtureIds;
let reportMonth;

try {
  await login(browser.cdp);
  for (const assertionName of requiredAssertions) {
    observations[assertionName] = await verifyAssertion(browser.cdp, assertionName);
  }
  await writeSemanticProof(requiredAssertions, { sourceScenario, observations });
} finally {
  await browser.close(outputDir);
}

function parseRequiredAssertions() {
  const raw = process.env.STATEMENT_VISUAL_REQUIRED_ASSERTIONS;
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
    throw new Error("STATEMENT_VISUAL_REQUIRED_ASSERTIONS must be a JSON array of strings.");
  }
  return [...new Set(parsed)].sort();
}

async function login(cdp) {
  await setViewport(cdp, 1366, 900);
  await navigate(cdp, `${baseUrl}/login`);
  const result = await evaluate(cdp, loginExpression());
  assert.equal(result.ok, true, `Demo login failed: ${result.status}`);
}

async function verifyAssertion(cdp, assertionName) {
  if (assertionName === "behavior:layout:desktop") return verifyLayout(cdp, 1366, 900, "desktop");
  if (assertionName === "behavior:layout:mobile") return verifyLayout(cdp, 390, 844, "mobile");

  if (assertionName.startsWith("behavior:component:")) {
    return verifyComponent(cdp, assertionName.slice("behavior:component:".length));
  }
  if (assertionName.startsWith("behavior:legacy:")) {
    return verifyLegacyResponsibility(cdp, assertionName.slice("behavior:legacy:".length));
  }
  throw new Error(`Unsupported behavior assertion: ${assertionName}`);
}

async function verifyLayout(cdp, width, height, label) {
  const route = await prepareRoute(cdp, width);
  await setViewport(cdp, width, height);
  await navigate(cdp, `${baseUrl}${route}`);
  await waitForRouteReady(cdp, requestedRoute);
  const result = await evaluate(
    cdp,
    `(() => {
      const root = document.documentElement;
      const main = document.querySelector('main');
      const rect = main?.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        mainPresent: Boolean(main),
        mainVisible: Boolean(rect && rect.width > 0 && rect.height > 0),
        noHorizontalOverflow: root.scrollWidth <= root.clientWidth + 1,
      };
    })()`,
  );
  assert.equal(result.viewportWidth, width, `${label} viewport identity changed.`);
  assert.equal(result.mainPresent, true, `${requestedRoute} has no main region on ${label}.`);
  assert.equal(result.mainVisible, true, `${requestedRoute} main region is not visible on ${label}.`);
  assert.equal(result.noHorizontalOverflow, true, `${requestedRoute} overflows horizontally on ${label}.`);
  return { route, width, height, ...result };
}

async function verifyComponent(cdp, component) {
  if (component === "PageContainer") return verifyPageContainer(cdp);
  if (component === "PageHeader") return verifyPageHeader(cdp);
  if (component === "DataTable") return verifyDataTable(cdp);
  if (component === "FilterBar") return verifyReportFilterBar(cdp);
  if (component === "SummaryGrid") return verifySummaryGrid(cdp);
  if (component === "DetailLayout") return verifyAccountsDetailLayout(cdp);
  if (component === "FormLayout") return verifySettingsFormLayout(cdp);
  if (component === "Dialog") return verifyDialog(cdp);
  if (component === "Drawer") return verifyNavigationDrawer(cdp);
  if (component === "Tabs") return verifyAccountsTabs(cdp);
  throw new Error(`No real-flow behavior verifier is registered for component ${component}.`);
}

async function verifyPageContainer(cdp) {
  const route = await prepareRoute(cdp, 1366);
  await setViewport(cdp, 1366, 900);
  await navigate(cdp, `${baseUrl}${route}`);
  await waitForRouteReady(cdp, requestedRoute);
  const result = await evaluate(
    cdp,
    `(() => {
      const main = document.querySelector('main');
      const rect = main?.getBoundingClientRect();
      return {
        present: Boolean(main),
        measurable: Boolean(rect && rect.width > 0 && rect.height > 0),
        insideViewport: Boolean(rect && rect.left >= -1 && rect.right <= innerWidth + 1),
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      };
    })()`,
  );
  assert.equal(result.present, true, "PageContainer claim has no main region.");
  assert.equal(result.measurable, true, "PageContainer claim has no measurable main region.");
  assert.equal(result.insideViewport, true, "PageContainer claim exceeds the viewport.");
  assert.equal(result.noHorizontalOverflow, true, "PageContainer claim leaks page overflow.");
  return { route, ...result };
}

async function verifyPageHeader(cdp) {
  const route = await prepareRoute(cdp, 1366);
  await setViewport(cdp, 1366, 900);
  await navigate(cdp, `${baseUrl}${route}`);
  await waitForRouteReady(cdp, requestedRoute);
  const result = await evaluate(
    cdp,
    `(() => {
      const headings = Array.from(document.querySelectorAll('main h1')).filter((heading) => {
        const rect = heading.getBoundingClientRect();
        const style = getComputedStyle(heading);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      return { count: headings.length, text: headings.map((heading) => heading.textContent?.trim() || '') };
    })()`,
  );
  assert.equal(result.count, 1, `PageHeader claim expected one visible h1, found ${result.count}.`);
  assert.ok(result.text[0], "PageHeader claim has an empty h1.");
  return { route, ...result };
}

async function verifyDataTable(cdp) {
  const route = await prepareRoute(cdp, 1366);
  await setViewport(cdp, 1366, 900);
  await navigate(cdp, `${baseUrl}${route}`);
  await waitForRouteReady(cdp, requestedRoute);
  const result = await evaluate(
    cdp,
    `(() => {
      const candidates = Array.from(document.querySelectorAll('table, [role="table"], .statement-table, .purchase-list'));
      const visible = candidates.filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      return {
        visibleCollections: visible.length,
        hasRows: visible.some((element) => element.querySelector('tr, [role="row"], .statement-row, [data-purchase-item]')),
      };
    })()`,
  );
  assert.ok(result.visibleCollections > 0, "DataTable claim has no visible semantic collection.");
  assert.equal(result.hasRows, true, "DataTable claim has no rendered rows.");
  return { route, ...result };
}

async function verifyReportFilterBar(cdp) {
  await openReadyReports(cdp, 1366, 900);
  const result = await evaluate(
    cdp,
    `(() => {
      const form = document.querySelector('.evolution-filters');
      const controls = Array.from(form?.querySelectorAll('input, select, button') || []);
      const rect = form?.getBoundingClientRect();
      return {
        present: Boolean(form),
        visible: Boolean(rect && rect.width > 0 && rect.height > 0),
        controlCount: controls.length,
        namedControls: controls.filter((control) => control.getAttribute('name') || control.getAttribute('aria-label') || control.textContent?.trim()).length,
      };
    })()`,
  );
  assert.equal(result.present, true, "FilterBar claim has no report filter form.");
  assert.equal(result.visible, true, "FilterBar claim is not visible.");
  assert.ok(result.controlCount >= 3, "FilterBar claim exposes too few controls.");
  assert.equal(result.namedControls, result.controlCount, "FilterBar claim contains an unnamed control.");
  return result;
}

async function verifySummaryGrid(cdp) {
  if (requestedRoute === "/cartoes") {
    await setViewport(cdp, 1366, 900);
    await navigate(cdp, `${baseUrl}/cartoes?month=2026-06`);
    await waitFor(cdp, `Boolean(document.querySelector('.invoice-overview'))`, "Cards summary grid did not render.");
    const result = await evaluate(
      cdp,
      `(() => {
        const summary = document.querySelector('.invoice-overview');
        const rect = summary?.getBoundingClientRect();
        const values = summary?.querySelectorAll('strong, dd, [data-value]') || [];
        return {
          present: Boolean(summary),
          visible: Boolean(rect && rect.width > 0 && rect.height > 0),
          valueCount: values.length,
          text: summary?.textContent?.trim() || '',
        };
      })()`,
    );
    assert.equal(result.present, true, "SummaryGrid claim has no invoice overview.");
    assert.equal(result.visible, true, "SummaryGrid claim invoice overview is not visible.");
    assert.ok(result.valueCount >= 2, "SummaryGrid claim exposes too few summary values.");
    assert.ok(result.text.length >= 12, "SummaryGrid claim has no meaningful summary text.");
    return result;
  }

  await openReadyReports(cdp, 1366, 900);
  const result = await evaluate(
    cdp,
    `(() => {
      const selectors = ['.report-summary', '.summary-grid', '.summary-block', '[data-report-summary]', '.report-kpis'];
      const candidates = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
      const visible = candidates.find((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      const fallback = document.querySelector('[data-report-state="ready"]')?.parentElement;
      const target = visible || fallback;
      const text = target?.textContent?.trim() || '';
      return {
        explicitSummary: Boolean(visible),
        hasReadySurface: Boolean(target),
        meaningfulText: text.length >= 12,
        metricLikeCount: target?.querySelectorAll('strong, dd, [data-value], .metric-value').length || 0,
      };
    })()`,
  );
  assert.equal(result.hasReadySurface, true, "SummaryGrid claim has no ready report summary surface.");
  assert.equal(result.meaningfulText, true, "SummaryGrid claim has no meaningful summary content.");
  assert.ok(result.metricLikeCount >= 1, "SummaryGrid claim has no metric-like values.");
  return result;
}

async function verifyAccountsDetailLayout(cdp) {
  await openAccountsCards(cdp, 1366, 900);
  const result = await evaluate(
    cdp,
    `(() => {
      const panel = document.querySelector('[data-tab-panel]:not([hidden])');
      const items = Array.from(panel?.querySelectorAll('.account-item, .card-account-item, [data-account-item], [data-card-item]') || []);
      const actions = panel?.querySelector('[data-context-action], .item-actions');
      const rect = panel?.getBoundingClientRect();
      return {
        panelPresent: Boolean(panel),
        panelVisible: Boolean(rect && rect.width > 0 && rect.height > 0),
        itemCount: items.length,
        hasContextAction: Boolean(actions),
      };
    })()`,
  );
  assert.equal(result.panelPresent, true, "DetailLayout claim has no active detail panel.");
  assert.equal(result.panelVisible, true, "DetailLayout claim panel is not visible.");
  assert.ok(result.itemCount > 0, "DetailLayout claim has no master/detail items.");
  assert.equal(result.hasContextAction, true, "DetailLayout claim lost contextual actions.");
  return result;
}

async function verifySettingsFormLayout(cdp) {
  await setViewport(cdp, 1366, 900);
  await navigate(cdp, `${baseUrl}/configuracoes?section=rules`);
  await waitFor(cdp, `Boolean(document.querySelector('main form'))`, "Settings form did not render.");
  const result = await evaluate(
    cdp,
    `(() => {
      const forms = Array.from(document.querySelectorAll('main form')).filter((form) => form.querySelector('input, select, textarea'));
      const form = forms.find((candidate) => candidate.getClientRects().length > 0) || forms[0];
      const controls = Array.from(form?.querySelectorAll('input, select, textarea') || []);
      const action = form?.querySelector('button[type="submit"], button:not([type]), .sf-button');
      return { formCount: forms.length, controlCount: controls.length, hasAction: Boolean(action) };
    })()`,
  );
  assert.ok(result.formCount > 0, "FormLayout claim has no form.");
  assert.ok(result.controlCount >= 2, "FormLayout claim has too few fields.");
  assert.equal(result.hasAction, true, "FormLayout claim has no form action.");
  return result;
}

async function verifyDialog(cdp) {
  if (requestedRoute === "/configuracoes") {
    await setViewport(cdp, 1366, 900);
    await navigate(cdp, `${baseUrl}/configuracoes?section=rules`);
    await waitFor(cdp, `Boolean(document.querySelector('[data-open-dialog="new-automation-rule-dialog"]'))`, "Settings dialog trigger missing.");
    await evaluate(cdp, `document.querySelector('[data-open-dialog="new-automation-rule-dialog"]')?.click()`);
  } else {
    await openAccountsCards(cdp, 1366, 900);
    await evaluate(cdp, `document.querySelector('[data-context-action]')?.click()`);
  }
  await waitFor(cdp, `Boolean(document.querySelector('dialog[open], [role="dialog"][open], [role="dialog"]:not([hidden])'))`, "Dialog did not open.");
  const result = await evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector('dialog[open], [role="dialog"][open], [role="dialog"]:not([hidden])');
      const rect = dialog?.getBoundingClientRect();
      return {
        present: Boolean(dialog),
        labelled: Boolean(dialog?.getAttribute('aria-label') || dialog?.getAttribute('aria-labelledby')),
        insideViewport: Boolean(rect && rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1),
        focusInside: Boolean(dialog && dialog.contains(document.activeElement)),
        controls: dialog?.querySelectorAll('button, input, select, textarea').length || 0,
      };
    })()`,
  );
  assert.equal(result.present, true, "Dialog claim has no opened dialog.");
  assert.equal(result.labelled, true, "Dialog claim is not labelled.");
  assert.equal(result.insideViewport, true, "Dialog claim exceeds the viewport.");
  assert.equal(result.focusInside, true, "Dialog claim did not contain focus.");
  assert.ok(result.controls > 0, "Dialog claim has no interactive controls.");
  return result;
}

async function verifyNavigationDrawer(cdp) {
  await setViewport(cdp, 390, 844);
  await navigate(cdp, `${baseUrl}/dashboard`);
  await waitFor(cdp, `Boolean(document.querySelector('.sidebar > nav [data-nav-more]'))`, "Mobile navigation disclosure missing.");
  const before = await evaluate(cdp, `document.querySelector('.sidebar > nav [data-nav-more]')?.getAttribute('aria-expanded') || ''`);
  await evaluate(cdp, `document.querySelector('.sidebar > nav [data-nav-more]')?.click()`);
  await sleep(100);
  const after = await evaluate(
    cdp,
    `(() => {
      const nav = document.querySelector('.sidebar > nav');
      const toggle = nav?.querySelector('[data-nav-more]');
      const controlled = (toggle?.getAttribute('aria-controls') || '').split(/\s+/).filter(Boolean);
      const visibleControlled = controlled.filter((id) => {
        const element = document.getElementById(id);
        return Boolean(element && getComputedStyle(element).display !== 'none' && element.getClientRects().length > 0);
      });
      return { expanded: toggle?.getAttribute('aria-expanded') || '', controlledCount: controlled.length, visibleControlled: visibleControlled.length };
    })()`,
  );
  assert.equal(before, "false", "Drawer claim did not start collapsed.");
  assert.equal(after.expanded, "true", "Drawer claim did not expand.");
  assert.ok(after.controlledCount > 0, "Drawer claim controls no secondary content.");
  assert.equal(after.visibleControlled, after.controlledCount, "Drawer claim did not reveal all controlled content.");
  return { before, after };
}

async function verifyAccountsTabs(cdp) {
  await openAccountsCards(cdp, 1366, 900);
  const result = await evaluate(
    cdp,
    `(() => {
      const accounts = document.querySelector('#accounts-tab');
      const cards = document.querySelector('#cards-tab');
      if (!accounts || !cards) return { present: false };
      cards.click();
      const cardsPanel = document.querySelector('[data-tab-panel="cards"]');
      const cardsSelected = cards.getAttribute('aria-selected') === 'true' || cards.getAttribute('aria-current') === 'page' || cards.classList.contains('active');
      const cardsVisible = Boolean(cardsPanel && !cardsPanel.hidden && cardsPanel.getClientRects().length > 0);
      accounts.click();
      const accountsPanel = document.querySelector('[data-tab-panel="accounts"]');
      const accountsVisible = Boolean(accountsPanel && !accountsPanel.hidden && accountsPanel.getClientRects().length > 0);
      return { present: true, cardsSelected, cardsVisible, accountsVisible };
    })()`,
  );
  assert.equal(result.present, true, "Tabs claim is missing accounts/cards tabs.");
  assert.equal(result.cardsSelected, true, "Tabs claim did not update selected state.");
  assert.equal(result.cardsVisible, true, "Tabs claim did not reveal cards panel.");
  assert.equal(result.accountsVisible, true, "Tabs claim did not restore accounts panel.");
  return result;
}

async function verifyLegacyResponsibility(cdp, legacyId) {
  const verifiers = {
    "accounts-cards-tabs": verifyAccountsTabs,
    "accounts-cards-standardization": verifyAccountsCardsStandardization,
    "accounts-cards-action-menus": verifyAccountsCardsActionMenus,
    "categories-icons-tooltips": verifyCategoryIconsAndTooltips,
    "card-list-sorting": verifyCardListSorting,
    "card-instrument-subtotals": verifyCardInstrumentSubtotals,
    "cards-interface": verifyCardsInterface,
    "cards-interface-finalizer": verifyCardsFinalizer,
    "statement-list-sorting": verifyStatementListSorting,
    "account-remuneration-disclosure": verifyAccountRemunerationDisclosure,
    "statement-insight-context": verifyStatementInsightContext,
    "inbox-structured-payload": verifyInboxStructuredPayload,
    "inbox-list-layout": verifyInboxListLayout,
  };
  const verifier = verifiers[legacyId];
  if (!verifier) throw new Error(`No behavior verifier is registered for legacy responsibility ${legacyId}.`);
  return verifier(cdp);
}

async function verifyAccountsCardsStandardization(cdp) {
  await openAccountsCards(cdp, 1366, 900);
  const result = await evaluate(
    cdp,
    `(() => {
      const panel = document.querySelector('[data-tab-panel="accounts"]:not([hidden])') || document.querySelector('[data-tab-panel="accounts"]');
      const items = Array.from(panel?.querySelectorAll('.account-item, [data-account-item]') || []);
      const footers = Array.from(panel?.querySelectorAll('.item-footer') || []);
      return { itemCount: items.length, footerCount: footers.length, allReadable: items.every((item) => (item.textContent || '').trim().length > 0) };
    })()`,
  );
  assert.ok(result.itemCount > 0, "Accounts standardization has no account rows.");
  assert.equal(result.footerCount, result.itemCount, "Accounts standardization lost canonical row footers.");
  assert.equal(result.allReadable, true, "Accounts standardization produced an unreadable row.");
  return result;
}

async function verifyAccountsCardsActionMenus(cdp) {
  await openAccountsCards(cdp, 1366, 900);
  const result = await evaluate(
    cdp,
    `(() => {
      const panel = document.querySelector('[data-tab-panel="accounts"]:not([hidden])') || document.querySelector('[data-tab-panel="accounts"]');
      const trigger = panel?.querySelector('.item-actions .action-menu-trigger');
      if (!trigger) return { triggerPresent: false };
      trigger.click();
      const menu = trigger.parentElement?.querySelector('.action-menu-popover');
      const items = Array.from(menu?.querySelectorAll('[role="menuitem"]') || []);
      return {
        triggerPresent: true,
        expanded: trigger.getAttribute('aria-expanded') === 'true',
        menuRole: menu?.getAttribute('role') || '',
        itemCount: items.length,
        labelledItems: items.filter((item) => item.getAttribute('aria-label') || item.textContent?.trim()).length,
      };
    })()`,
  );
  assert.equal(result.triggerPresent, true, "Accounts action-menu trigger is missing.");
  assert.equal(result.expanded, true, "Accounts action-menu did not expand.");
  assert.equal(result.menuRole, "menu", "Accounts action-menu lost menu semantics.");
  assert.ok(result.itemCount > 0, "Accounts action-menu has no items.");
  assert.equal(result.labelledItems, result.itemCount, "Accounts action-menu contains unlabeled items.");
  return result;
}

async function verifyCategoryIconsAndTooltips(cdp) {
  await setViewport(cdp, 1366, 900);
  await navigate(cdp, `${baseUrl}/categorias`);
  await waitFor(cdp, `Boolean(document.querySelector('main[data-categories-design-enhanced]'))`, "Categories enhancement did not render.");
  const result = await evaluate(
    cdp,
    `(() => {
      const chips = Array.from(document.querySelectorAll('[data-category-filter]'));
      const paths = Array.from(document.querySelectorAll('.category-path'));
      return {
        enhanced: Boolean(document.querySelector('main[data-categories-design-enhanced]')),
        chipCount: chips.length,
        chipsWithTooltip: chips.filter((chip) => (chip.getAttribute('title') || '').trim().length > 0).length,
        chipsWithIcon: chips.filter((chip) => chip.querySelector('svg')).length,
        pathCount: paths.length,
        pathsWithIcon: paths.filter((path) => path.querySelector('svg')).length,
      };
    })()`,
  );
  assert.equal(result.enhanced, true, "Categories legacy responsibility marker is missing.");
  assert.ok(result.chipCount > 0, "Categories has no filter chips to validate.");
  assert.equal(result.chipsWithTooltip, result.chipCount, "Categories filter chip lost a tooltip.");
  assert.equal(result.chipsWithIcon, result.chipCount, "Categories filter chip lost an icon.");
  assert.equal(result.pathsWithIcon, result.pathCount, "Categories path icon coverage is incomplete.");
  return result;
}

async function verifyCardListSorting(cdp) {
  await setViewport(cdp, 1366, 900);
  await navigate(cdp, `${baseUrl}/cartoes?month=2026-06&sort=amount_desc`);
  await waitFor(cdp, `Boolean(document.querySelector('[data-purchase-item]'))`, "Cards purchases did not render for sorting.");
  const result = await evaluate(
    cdp,
    `(() => {
      const parseAmount = (script) => {
        try { return Math.abs(Number(JSON.parse(script?.textContent || '{}').amountMinor || 0)); } catch { return 0; }
      };
      const groupElements = Array.from(document.querySelectorAll('[data-instrument-purchase-group] .purchase-group-rows'));
      const roots = groupElements.length > 0 ? groupElements : [document.querySelector('.purchase-list')].filter(Boolean);
      const groups = roots.map((root) => {
        const amounts = Array.from(root.querySelectorAll('script[data-purchase]')).map(parseAmount);
        return { amounts, sorted: amounts.every((value, index) => index === 0 || amounts[index - 1] >= value) };
      });
      return {
        controlValue: document.querySelector('[data-list-sort]')?.value || '',
        rowCount: groups.reduce((sum, group) => sum + group.amounts.length, 0),
        groups,
        sorted: groups.every((group) => group.sorted),
      };
    })()`,
  );
  assert.equal(result.controlValue, "amount_desc", "Card sorting control did not preserve amount_desc.");
  assert.ok(result.rowCount >= 2, "Card sorting needs at least two purchases.");
  assert.equal(result.sorted, true, `Card purchases are not sorted by amount_desc inside their groups: ${JSON.stringify(result.groups)}.`);
  return result;
}

async function verifyCardInstrumentSubtotals(cdp) {
  await setViewport(cdp, 1366, 900);
  await navigate(cdp, `${baseUrl}/cartoes?month=2026-06`);
  await waitFor(cdp, `Boolean(document.querySelector('[data-instrument-purchase-group]'))`, "Instrument purchase groups did not render.");
  const result = await evaluate(
    cdp,
    `(() => {
      const parseMoney = (value) => {
        const normalized = String(value || '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
        const amount = Number.parseFloat(normalized || '0');
        return Math.round(Math.abs(amount) * 100);
      };
      const parsePayload = (row) => {
        const script = row.querySelector('script[data-purchase]');
        try { return JSON.parse(script?.textContent || '{}'); } catch { return {}; }
      };
      const groups = Array.from(document.querySelectorAll('[data-instrument-purchase-group]')).map((group) => {
        const rows = Array.from(group.querySelectorAll('[data-purchase-item]'));
        const payloads = rows.map(parsePayload);
        const totalMinor = payloads.reduce((sum, payload) => sum + Math.abs(Number(payload.amountMinor || 0)), 0);
        const displayedMinor = parseMoney(group.querySelector(':scope > summary strong.debit, :scope > summary strong')?.textContent || '');
        const id = group.dataset.instrumentId || '';
        const consistentIds = payloads.every((payload) => id ? String(payload.cardInstrumentId || '') === id : !payload.cardInstrumentId);
        return { id, rowCount: rows.length, totalMinor, displayedMinor, consistentIds };
      });
      const summaryRows = Array.from(document.querySelectorAll('.instrument-summary-row'));
      return {
        groupCount: groups.length,
        groups,
        allTotalsMatch: groups.every((group) => group.totalMinor === group.displayedMinor),
        allIdsConsistent: groups.every((group) => group.consistentIds),
        summaryRows: summaryRows.length,
      };
    })()`,
  );
  assert.ok(result.groupCount > 0, "Instrument subtotals have no purchase groups.");
  assert.equal(result.allTotalsMatch, true, `Instrument subtotal mismatch: ${JSON.stringify(result.groups)}.`);
  assert.equal(result.allIdsConsistent, true, `Instrument grouping mismatch: ${JSON.stringify(result.groups)}.`);
  assert.ok(result.summaryRows >= result.groupCount, "Instrument summary does not cover every group.");
  return result;
}

async function verifyCardsInterface(cdp) {
  await setViewport(cdp, 1366, 900);
  await navigate(cdp, `${baseUrl}/cartoes?month=2026-06`);
  await waitFor(cdp, `Boolean(document.querySelector('main[data-cards-interface-enhanced] [data-purchase-item]'))`, "Cards enhanced interface did not render.");
  const result = await evaluate(
    cdp,
    `(() => ({
      enhanced: Boolean(document.querySelector('main[data-cards-interface-enhanced]')),
      purchaseRows: document.querySelectorAll('[data-purchase-item]').length,
      search: Boolean(document.querySelector('[data-purchase-search]')),
      reconciliationToggles: document.querySelectorAll('[data-reconciliation-toggle]').length,
      openTrigger: Boolean(document.querySelector('[data-open-modal="purchase"]')),
    }))()`,
  );
  assert.equal(result.enhanced, true, "Cards interface marker is missing.");
  assert.ok(result.purchaseRows > 0, "Cards interface has no purchase rows.");
  assert.equal(result.search, true, "Cards interface search is missing.");
  assert.ok(result.reconciliationToggles >= 2, "Cards interface reconciliation controls are incomplete.");
  assert.equal(result.openTrigger, true, "Cards interface purchase action is missing.");
  return result;
}

async function verifyCardsFinalizer(cdp) {
  await setViewport(cdp, 1366, 900);
  await navigate(cdp, `${baseUrl}/cartoes?month=2026-06`);
  await waitFor(cdp, `Boolean(document.querySelector('[data-cards-interface-finalizer]'))`, "Cards finalizer did not render.");
  const before = await evaluate(
    cdp,
    `(() => {
      const search = document.querySelector('[data-purchase-search]');
      const style = search ? getComputedStyle(search) : null;
      return { marker: Boolean(document.querySelector('[data-cards-interface-finalizer]')), minHeight: style ? Number.parseFloat(style.minHeight) : 0 };
    })()`,
  );
  assert.equal(before.marker, true, "Cards finalizer marker is missing.");
  assert.ok(before.minHeight >= 44, `Cards finalizer search target is too small: ${before.minHeight}.`);
  await evaluate(
    cdp,
    `(() => {
      const search = document.querySelector('[data-purchase-search]');
      search.value = 'behavior-claim-no-result';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
  );
  await waitFor(cdp, `document.querySelector('[data-purchase-results-status]')?.textContent?.trim().startsWith('0 ') === true`, "Cards finalizer did not update displayed count.");
  const after = await evaluate(
    cdp,
    `(() => ({
      status: document.querySelector('[data-purchase-results-status]')?.textContent?.trim() || '',
      emptyVisible: Boolean(document.querySelector('[data-purchase-filter-empty]') && !document.querySelector('[data-purchase-filter-empty]').hidden),
      clearVisible: Boolean(document.querySelector('[data-clear-purchase-search]') && !document.querySelector('[data-clear-purchase-search]').hidden),
    }))()`,
  );
  assert.match(after.status, /^0\s/, "Cards finalizer did not announce zero displayed purchases.");
  assert.equal(after.emptyVisible, true, "Cards finalizer did not reveal filtered-empty state.");
  assert.equal(after.clearVisible, true, "Cards finalizer did not reveal clear-search action.");
  return { before, after };
}

async function verifyStatementListSorting(cdp) {
  const ids = await getFixtureIds(cdp);
  const route = `/lancamentos?accountId=${encodeURIComponent(ids.longAccountId)}&month=2026-07&sort=amount_desc`;
  await setViewport(cdp, 1366, 900);
  await navigate(cdp, `${baseUrl}${route}`);
  await waitFor(cdp, `document.querySelectorAll('.statement-row.statement-body script[data-transaction]').length >= 2`, "Statement rows did not render for sorting.");
  const result = await evaluate(cdp, sortingExpression("transaction", "amount_desc"));
  assert.equal(result.controlValue, "amount_desc", "Statement sorting control did not preserve amount_desc.");
  assert.ok(result.rowCount >= 2, "Statement sorting needs at least two rows.");
  assert.equal(result.sorted, true, `Statement rows are not sorted by amount_desc: ${JSON.stringify(result.amounts)}.`);
  return { route, ...result };
}

async function verifyAccountRemunerationDisclosure(cdp) {
  const evidence = await readJsonIfExists(join(outputDir, "issue-490-account-remuneration.json"));
  const route = evidence?.route;
  const transactionId = evidence?.fixture?.firstId;
  if (!route || !transactionId) {
    throw new Error("Remuneration disclosure claim requires the primary account-remuneration evidence.");
  }
  await setViewport(cdp, 1366, 900);
  await navigate(cdp, `${baseUrl}${route}`);
  await waitFor(cdp, `Boolean(document.querySelector('script[data-transaction="${transactionId}"]')?.closest('.statement-row.statement-body')?.querySelector('details.account-remuneration-audit'))`, "Remuneration disclosure did not render.");
  const result = await evaluate(
    cdp,
    `(() => {
      const row = document.querySelector('script[data-transaction="${transactionId}"]')?.closest('.statement-row.statement-body');
      const details = row?.querySelector('details.account-remuneration-audit');
      const summary = details?.querySelector(':scope > summary');
      if (details) details.open = true;
      const labels = Array.from(details?.querySelectorAll('dt') || []).map((item) => item.textContent?.trim() || '');
      return { present: Boolean(details), summary: summary?.textContent?.trim() || '', labels, open: Boolean(details?.open) };
    })()`,
  );
  assert.equal(result.present, true, "Remuneration disclosure details are missing.");
  assert.ok(result.summary.length > 0, "Remuneration disclosure summary is empty.");
  assert.equal(result.open, true, "Remuneration disclosure did not open.");
  for (const expected of ["Saldo-base", "CDI diário", "Percentual aplicado", "Valor original"]) {
    assert.ok(result.labels.includes(expected), `Remuneration disclosure lost ${expected}.`);
  }
  return { route, transactionId, ...result };
}

async function verifyStatementInsightContext(cdp) {
  const ids = await getFixtureIds(cdp);
  const baseRoute = `/lancamentos?accountId=${encodeURIComponent(ids.longAccountId)}&month=2026-07`;
  await setViewport(cdp, 1366, 900);
  await navigate(cdp, `${baseUrl}${baseRoute}`);
  await waitFor(cdp, `Boolean(document.querySelector('.statement-row.statement-body script[data-transaction]'))`, "Statement insight fixture row missing.");
  const categoryId = await evaluate(
    cdp,
    `(() => {
      const scripts = Array.from(document.querySelectorAll('.statement-row.statement-body script[data-transaction]'));
      for (const script of scripts) {
        try {
          const payload = JSON.parse(script.textContent || '{}');
          if (payload.categoryId) return String(payload.categoryId);
        } catch {}
      }
      return '';
    })()`,
  );
  assert.ok(categoryId, "Statement insight claim found no categorized transaction.");
  const route = `${baseRoute}&categoryId=${encodeURIComponent(categoryId)}`;
  await navigate(cdp, `${baseUrl}${route}`);
  await waitFor(cdp, `Boolean(document.querySelector('[data-insight-context]'))`, "Statement insight context notice did not render.");
  const result = await evaluate(
    cdp,
    `(() => {
      const hidden = document.querySelector('input[data-insight-context-param][name="categoryId"]');
      const scripts = Array.from(document.querySelectorAll('.statement-row.statement-body script[data-transaction]'));
      const categories = scripts.map((script) => {
        try { return String(JSON.parse(script.textContent || '{}').categoryId || ''); } catch { return ''; }
      }).filter(Boolean);
      return {
        notice: document.querySelector('[data-insight-context]')?.textContent?.trim() || '',
        hiddenValue: hidden?.value || '',
        rowCount: scripts.length,
        allMatch: categories.length === scripts.length && categories.every((value) => value === ${JSON.stringify(categoryId)}),
      };
    })()`,
  );
  assert.ok(result.notice.includes("Filtro do insight ativo"), "Statement insight context notice is incomplete.");
  assert.equal(result.hiddenValue, categoryId, "Statement insight hidden context was not preserved.");
  assert.ok(result.rowCount > 0, "Statement insight context removed every matching row.");
  assert.equal(result.allMatch, true, "Statement insight context leaked a non-matching row.");
  return { route, categoryId, ...result };
}

async function verifyInboxStructuredPayload(cdp) {
  await setViewport(cdp, 1366, 900);
  await navigate(cdp, `${baseUrl}/inbox`);
  await waitFor(cdp, `Boolean(document.querySelector('[data-ai-structured-payload="true"]'))`, "Structured Inbox payload did not render after its producer scenario.", 120);
  const result = await evaluate(
    cdp,
    `(() => {
      const payloads = Array.from(document.querySelectorAll('[data-ai-structured-payload="true"]'));
      return {
        count: payloads.length,
        nonEmpty: payloads.filter((payload) => (payload.textContent || '').trim().length > 0).length,
        runtimePresent: Boolean(document.querySelector('[data-ai-structured-payload-runtime="true"]')),
      };
    })()`,
  );
  assert.ok(result.count > 0, "Inbox structured-payload responsibility has no rendered payload.");
  assert.equal(result.nonEmpty, result.count, "Inbox structured-payload responsibility rendered empty payload content.");
  assert.equal(result.runtimePresent, true, "Inbox structured-payload runtime marker is missing.");
  return result;
}

async function verifyInboxListLayout(cdp) {
  const primary = await readJsonIfExists(join(outputDir, "issue-525-inbox-interface-refinement.json"));
  const batchId = primary?.batchId;
  const route = batchId ? `/inbox?importBatchId=${encodeURIComponent(batchId)}` : "/inbox";
  const widths = [1366, 390];
  const evidence = [];
  for (const width of widths) {
    await setViewport(cdp, width, width <= 390 ? 844 : 900);
    await navigate(cdp, `${baseUrl}${route}`);
    await waitFor(cdp, `Boolean(document.querySelector('#inbox-list-layout-styles') && document.querySelector('#inbox-list-layout-script'))`, "Inbox list-layout assets did not render.");
    const result = await evaluate(
      cdp,
      `(() => {
        const root = document.documentElement;
        const layout = document.querySelector('.import-layout');
        const style = layout ? getComputedStyle(layout) : null;
        return {
          assets: Boolean(document.querySelector('#inbox-list-layout-styles') && document.querySelector('#inbox-list-layout-script')),
          layoutPresent: Boolean(layout),
          columns: style?.gridTemplateColumns || '',
          rowCount: document.querySelectorAll('.import-row').length,
          noHorizontalOverflow: root.scrollWidth <= root.clientWidth + 1,
        };
      })()`,
    );
    assert.equal(result.assets, true, "Inbox list-layout assets are missing.");
    assert.equal(result.layoutPresent, true, "Inbox list-layout container is missing.");
    assert.equal(result.noHorizontalOverflow, true, `Inbox list-layout overflows at ${width}px.`);
    if (batchId) assert.ok(result.rowCount > 0, "Inbox list-layout lost imported rows.");
    if (width <= 390) assert.ok(!result.columns.includes("250px"), "Inbox list-layout did not collapse on mobile.");
    evidence.push({ width, ...result });
  }
  return { route, batchId: batchId ?? null, evidence };
}

async function prepareRoute(cdp, width) {
  if (requestedRoute === "shell://authenticated") return "/dashboard";
  if (requestedRoute === "/lancamentos") {
    const ids = await getFixtureIds(cdp);
    return `/lancamentos?accountId=${encodeURIComponent(ids.longAccountId)}&month=2026-07`;
  }
  if (requestedRoute === "/cartoes") return "/cartoes?month=2026-06";
  if (requestedRoute === "/relatorios") {
    const month = await getReportMonth(cdp);
    return `/relatorios?view=category-evolution&interval=monthly&start=${month}&periods=${width <= 390 ? 12 : 1}`;
  }
  if (requestedRoute === "/configuracoes") return "/configuracoes?section=rules";
  return requestedRoute || "/dashboard";
}

async function openReadyReports(cdp, width, height) {
  const route = await prepareRoute(cdp, width);
  await setViewport(cdp, width, height);
  await navigate(cdp, `${baseUrl}${route}`);
  await waitFor(cdp, `document.querySelector('[data-report-state]')?.getAttribute('data-report-state') === 'ready'`, "Reports did not reach ready state.");
  return route;
}

async function openAccountsCards(cdp, width, height) {
  await setViewport(cdp, width, height);
  await navigate(cdp, `${baseUrl}/contas-cartoes`);
  await waitFor(cdp, `Boolean(document.querySelector('#accounts-tab') && document.querySelector('#cards-tab'))`, "Accounts/cards tabs did not render.");
}

async function waitForRouteReady(cdp, route) {
  if (route === "/relatorios") {
    return waitFor(cdp, `document.querySelector('[data-report-state]')?.getAttribute('data-report-state') === 'ready'`, "Reports did not reach ready state.");
  }
  if (route === "/cartoes") {
    return waitFor(cdp, `Boolean(document.querySelector('[data-purchase-item]'))`, "Cards purchases did not render.");
  }
  if (route === "/contas-cartoes") {
    return waitFor(cdp, `Boolean(document.querySelector('#accounts-tab') && document.querySelector('#cards-tab'))`, "Accounts/cards did not render.");
  }
  if (route === "/configuracoes") {
    return waitFor(cdp, `Boolean(document.querySelector('main'))`, "Settings did not render.");
  }
  if (route === "shell://authenticated") {
    return waitFor(cdp, `Boolean(document.querySelector('.sidebar > nav'))`, "Authenticated shell did not render.");
  }
  return waitFor(cdp, `Boolean(document.querySelector('main'))`, `${route} did not render a main region.`);
}

async function getFixtureIds(cdp) {
  if (!fixtureIds) fixtureIds = await evaluate(cdp, fixtureExpression());
  return fixtureIds;
}

async function getReportMonth(cdp) {
  if (!reportMonth) reportMonth = (await seedReportData(cdp)).month;
  return reportMonth;
}

async function seedReportData(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const run = async () => {
        const request = async (path, options = {}) => {
          const response = await fetch(path, {
            credentials: 'same-origin',
            ...options,
            headers: { 'content-type': 'application/json', ...(options.headers || {}) },
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(path + ' -> ' + response.status);
          return body;
        };
        const suffix = Date.now().toString(36);
        const accountsBody = await request('/api/accounts');
        let account = accountsBody.accounts?.find((item) => item.status === 'active');
        if (!account) {
          account = (await request('/api/accounts', {
            method: 'POST',
            body: JSON.stringify({ name: 'Behavior claim report ' + suffix, kind: 'checking', openingBalanceMinor: 0 }),
          })).account;
        }
        const category = (await request('/api/categories', {
          method: 'POST',
          body: JSON.stringify({ name: 'Behavior claim expense ' + suffix, kind: 'expense' }),
        })).category;
        const occurredOn = new Date().toISOString().slice(0, 10);
        await request('/api/transactions', {
          method: 'POST',
          body: JSON.stringify({
            status: 'posted', occurredOn, plannedOn: occurredOn, accountId: account.id,
            kind: 'expense', categoryId: category.id, amountMinor: 87500,
            description: 'Behavior claim expense ' + suffix,
          }),
        });
        return { month: occurredOn.slice(0, 7) };
      };
      return run();
    })()`,
  );
}

function sortingExpression(kind, expectedSort) {
  return `(() => {
    const selector = ${JSON.stringify(kind === "purchase" ? "script[data-purchase]" : "script[data-transaction]")};
    const rows = Array.from(document.querySelectorAll(selector)).map((script) => {
      try { return JSON.parse(script.textContent || '{}'); } catch { return {}; }
    });
    const amounts = rows.map((row) => Math.abs(Number(row.amountMinor || 0)));
    const sorted = amounts.every((value, index) => index === 0 || amounts[index - 1] >= value);
    return {
      controlValue: document.querySelector('[data-list-sort]')?.value || '',
      rowCount: rows.length,
      amounts,
      sorted,
      expectedSort: ${JSON.stringify(expectedSort)},
    };
  })()`;
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

async function waitFor(cdp, expression, message, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(cdp, expression).catch(() => false)) return;
    await sleep(100);
  }
  throw new Error(message);
}
