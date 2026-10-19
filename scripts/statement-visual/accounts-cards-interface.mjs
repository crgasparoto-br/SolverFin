import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const candidateSha =
  process.env.STATEMENT_VISUAL_CANDIDATE_SHA ?? process.env.GITHUB_SHA ?? "local";
const failures = [];
const scenarios = [];
const viewports = [
  { width: 1440, height: 900, suffix: "desktop-1440x900" },
  { width: 1366, height: 768, suffix: "desktop-1366x768" },
  { width: 390, height: 844, suffix: "mobile-390x844" },
  { width: 320, height: 740, suffix: "mobile-320x740" },
];

if (!chromePath) {
  throw new Error("CHROME_BIN is required for accounts/cards A3 validation.");
}
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });

try {
  await setViewport(browser.cdp, 1440, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  for (const viewport of viewports) {
    try {
      await validateViewport(browser.cdp, viewport);
    } catch (error) {
      failures.push({
        message: `Accounts/Cards A3 validation failed at ${viewport.width}x${viewport.height}`,
        details: serializeError(error),
      });
    }
  }
} finally {
  await browser.close(outputDir);
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: candidateSha,
  browser: browser.version,
  failures,
  scenarios,
};
await writeFile(
  join(outputDir, "issue-535-accounts-cards.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`- ${failure.message}: ${failure.details}`);
  }
  process.exitCode = 1;
} else {
  console.log("Accounts/Cards A3 master-detail visual validation passed.");
}

async function validateViewport(cdp, viewport) {
  await setViewport(cdp, viewport.width, viewport.height);
  await navigate(cdp, `${baseUrl}/contas-cartoes`);
  await waitForA3(cdp);

  const baseline = await inspectPage(cdp);
  assert.equal(baseline.archetype, "A3");
  assert.equal(baseline.detailLayoutVisible, true, "A3 DetailLayout is not visible.");
  assert.equal(baseline.masterVisible, true, "Master list is not visible.");
  assert.equal(baseline.listAmountsVisible, true, "Master amounts are missing.");
  assert.equal(baseline.masterTypeColumn, true, "Account subtype icon column is absent.");
  assert.equal(baseline.masterTypeFirst, true, "Type icon must be the first visible column.");
  assert.equal(baseline.masterInstitutionSecond, true, "Institution must be between type and account/card.");
  assert.equal(baseline.amountKindInline, true, "Balance/limit icon must be inline with the amount.");
  assert.equal(baseline.masterTypeTooltips, true, "Account/card type icons need accessible tooltips.");
  assert.equal(baseline.compactRowMinHeight, true, "Master rows must use compact Golden Screen density.");
  assert.equal(baseline.headerActionsHaveIcons, true, "Add-account and add-card buttons need icons.");
  assert.equal(baseline.cdiColumnPresent, true, "The dedicated CDI column is missing.");
  assert.equal(
    baseline.cdiStateConsistent,
    true,
    "CDI labels must be account-only and match the active configuration.",
  );
  assert.equal(baseline.listIsPrimary, true, "Master list should dominate the detail.");
  assert.equal(baseline.detailVisible, true, "Selected detail is not visible.");
  assert.equal(baseline.noHorizontalOverflow, true, "A3 page overflows horizontally.");
  assert.equal(baseline.hasTabs, false, "Retired tab markup is still present.");
  assert.equal(
    baseline.legacyActionMenuCount,
    0,
    "Post-processed row action menus are still present.",
  );
  assert.ok(baseline.masterItemCount > 0, "No master resources were rendered.");
  assert.equal(baseline.selectedMasterCount, 1, "Exactly one master resource must be selected.");
  assert.equal(baseline.searchVisible, true, "Master search is unavailable.");
  assert.equal(
    baseline.controlsUseGoldenPrimitives,
    true,
    "Golden Screen shared button and filter variants are missing.",
  );
  assert.deepEqual(baseline.kindOptions, ["all", "account", "card"]);
  assert.equal(baseline.currencyOptions[0], "all");
  assert.equal(baseline.currencyOptionLabels[0], "Todas as moedas");
  assert.equal(
    baseline.currencyFilterLabelFits,
    true,
    "Selected currency filter label must remain readable at every supported viewport.",
  );
  assert.ok(baseline.currencyOptions.length > 1, "Currency filter has no resource options.");
  assert.deepEqual(baseline.statusOptions, ["all", "active", "inactive"]);
  assert.equal(baseline.loadingStatePresent, true, "Route loading state is not wired.");
  assert.equal(
    baseline.institutionLogosOnMaster,
    true,
    "Institution logo/fallback missing from a master resource.",
  );
  assert.equal(
    baseline.institutionImageMatchesGolden,
    true,
    "List institution logos must match the 44px and 11px Golden Statement frame.",
  );

  const account = await selectResource(cdp, "account");
  const card = await selectResource(cdp, "card");
  assert.ok(account, "Demo data has no account master resource.");
  assert.ok(card, "Demo data has no card master resource.");

  if (account) {
    await navigate(cdp, `${baseUrl}${account.href}`);
    await waitForDetail(cdp, "account");
    const measurements = await inspectPage(cdp);
    assert.equal(measurements.selectedKind, "account");
    const accountActions = await validateGoldenActionToolbar(cdp, "account");
    scenarios.push({
      kind: "golden-detail-toolbar",
      resourceKind: "account",
      viewport: `${viewport.width}x${viewport.height}`,
      measurements: accountActions,
    });
    assert.equal(
      measurements.financialContextVisible,
      true,
      "Account financial context is not visible in the selected list row and detail.",
    );
    assert.equal(
      measurements.institutionIdentityVisible,
      true,
      "Account institution identity is hidden.",
    );
    assert.equal(
      measurements.detailImageMatchesGolden,
      true,
      "Account detail logo must match Golden Statement image geometry.",
    );
    assert.equal(measurements.selectedMasterCount, 1);
    assert.equal(
      measurements.currencyContextVisible,
      true,
      "Account currency context is ambiguous.",
    );
    scenarios.push({
      kind: "page",
      resourceKind: "account",
      viewport: `${viewport.width}x${viewport.height}`,
      measurements,
    });
  }

  if (card) {
    await navigate(cdp, `${baseUrl}${card.href}`);
    await waitForDetail(cdp, "card");
    const measurements = await inspectPage(cdp);
    assert.equal(measurements.selectedKind, "card");
    const cardActions = await validateGoldenActionToolbar(cdp, "card");
    scenarios.push({
      kind: "golden-detail-toolbar",
      resourceKind: "card",
      viewport: `${viewport.width}x${viewport.height}`,
      measurements: cardActions,
    });
    assert.equal(
      measurements.financialContextVisible,
      true,
      "Card limit context is not visible in the selected list row and detail.",
    );
    assert.equal(
      measurements.institutionIdentityVisible,
      true,
      "Card institution identity is hidden.",
    );
    assert.equal(
      measurements.detailImageMatchesGolden,
      true,
      "Card detail logo must match Golden Statement image geometry.",
    );
    assert.equal(measurements.selectedMasterCount, 1);
    assert.equal(measurements.currencyContextVisible, true, "Card currency context is ambiguous.");
    assert.equal(
      measurements.instrumentSectionVisible,
      true,
      "Card instruments are not inside the detail.",
    );
    scenarios.push({
      kind: "page",
      resourceKind: "card",
      viewport: `${viewport.width}x${viewport.height}`,
      measurements,
    });
  }

  const filter = await validateFilter(cdp);
  scenarios.push({
    kind: "filter",
    viewport: `${viewport.width}x${viewport.height}`,
    measurements: filter,
  });

  const explicitSelection = account ?? card;
  if (explicitSelection) {
    await navigate(cdp, `${baseUrl}${explicitSelection.href}`);
    await waitForDetail(cdp, account ? "account" : "card");
  }

  const dialog = await validateKeyboardDialog(cdp);
  scenarios.push({
    kind: "resource-dialog",
    viewport: `${viewport.width}x${viewport.height}`,
    measurements: dialog,
  });

  if (viewport.width === 1366) {
    const failureState = await validateSaveFailureStates(cdp);
    scenarios.push({
      kind: "save-failure",
      viewport: "1366x768",
      measurements: failureState,
    });

    const destructive = await validateConfirmationCancellation(cdp);
    scenarios.push({
      kind: "confirmation-cancel",
      viewport: "1366x768",
      measurements: destructive,
    });

    const longContent = await validateLongContent(cdp);
    scenarios.push({
      kind: "long-content",
      viewport: "1366x768",
      measurements: longContent,
    });
  }

  await screenshot(cdp, join(outputDir, `issue-612-accounts-cards-${viewport.suffix}.png`));
  if (viewport.width === 1366) {
    const cdiSettings = await validateCdiSettings(cdp);
    scenarios.push({ kind: "cdi-settings", viewport: "1366x768", measurements: cdiSettings });
    const cdiPersistence = await validateCdiRealPersistence(cdp);
    scenarios.push({ kind: "cdi-real-api", viewport: "1366x768", measurements: cdiPersistence });
    const cdi = await validateCdiSwitch(cdp);
    scenarios.push({ kind: "cdi-toggle", viewport: "1366x768", measurements: cdi });
  }
}

async function validateGoldenActionToolbar(cdp, resourceKind) {
  const snapshot = await evaluate(
    cdp,
    `(() => {
      const detail = document.querySelector('[data-resource-detail]');
      const actions = detail?.querySelector('.resource-detail-actions');
      const toolbar = actions?.querySelector('.resource-action-toolbar');
      if (!actions || !toolbar) return null;
      const bounds = (node) => {
        const box = node.getBoundingClientRect();
        return { x: box.x, right: box.right, width: box.width, height: box.height };
      };
      const buttons = Array.from(actions.querySelectorAll('button.resource-action-button'));
      const instrumentButtons = Array.from(detail.querySelectorAll('.instrument-actions button.resource-action-button'));
      const instrumentStylesConsistent = instrumentButtons.every((button) => {
        const box = button.getBoundingClientRect();
        const svg = button.querySelector('svg')?.getBoundingClientRect();
        const panel = detail.getBoundingClientRect();
        return box.width >= 43 && box.height >= 43 &&
          Math.abs(box.width - box.height) <= 1 &&
          Boolean(button.title && button.getAttribute('aria-label')) &&
          Boolean(svg && svg.width >= 16 && svg.width <= 21 && svg.height >= 16 && svg.height <= 21) &&
          box.left >= panel.left - 1 && box.right <= panel.right + 1;
      });
      return {
        instrumentActionCount: instrumentButtons.length,
        instrumentStylesConsistent,
        kinds: {
          card: Boolean(detail?.getAttribute('data-resource-detail') === 'card'),
          cdi: Boolean(actions.querySelector('.resource-account-cdi-row')),
        },
        buttonCount: buttons.length,
        allNamed: buttons.every((button) => Boolean(button.title && button.getAttribute('aria-label'))),
        allGoldenSize: buttons.every((button) => {
          const box = button.getBoundingClientRect();
          return box.width >= 43 && box.height >= 43 && Math.abs(box.width - box.height) <= 1;
        }),
        allGoldenGlyphs: buttons.every((button) => {
          const svg = button.querySelector('svg');
          if (!svg) return false;
          const box = svg.getBoundingClientRect();
          return box.width >= 16 && box.width <= 21 && box.height >= 16 && box.height <= 21;
        }),
        allWithinDetail: buttons.every((button) => {
          const box = button.getBoundingClientRect();
          const panel = detail.getBoundingClientRect();
          return box.left >= panel.left - 1 && box.right <= panel.right + 1;
        }),
        cdiSwitch: (() => {
          const el = actions.querySelector('[data-cdi-toggle]');
          if (!el) return null;
          const box = el.getBoundingClientRect();
          return { width: box.width, height: box.height, role: el.getAttribute('role') };
        })(),
        toolbar: bounds(toolbar),
        actions: bounds(actions),
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      };
    })()`,
  );
  assert.ok(snapshot, "Golden Screen maintenance toolbar is missing.");
  assert.equal(snapshot.buttonCount, 4);
  assert.equal(
    snapshot.allNamed,
    true,
    "Subscreen icon controls need accessible names and tooltips.",
  );
  assert.equal(snapshot.allGoldenSize, true, "Golden Screen controls must have 44x44px targets.");
  assert.equal(snapshot.allGoldenGlyphs, true, "Action glyphs must use the same icon scale.");
  assert.equal(
    snapshot.instrumentStylesConsistent,
    true,
    "Instrument controls must reuse the same Golden Screen dimensions and labels.",
  );
  if (resourceKind === "card") {
    assert.ok(
      snapshot.instrumentActionCount > 0,
      "Card instruments must expose canonical maintenance actions.",
    );
  } else {
    assert.equal(snapshot.instrumentActionCount, 0);
  }
  assert.equal(snapshot.allWithinDetail, true, "Subscreen controls overflow their detail panel.");
  assert.equal(snapshot.noHorizontalOverflow, true, "Toolbar introduces a horizontal overflow.");
  assert.equal(snapshot.kinds.cdi, resourceKind === "account");
  if (resourceKind === "account") {
    assert.equal(snapshot.cdiSwitch?.role, "switch");
    assert.ok(snapshot.cdiSwitch?.width >= 43 && snapshot.cdiSwitch?.height >= 24);
  }
  return snapshot;
}

async function validateCdiSettings(cdp) {
  const href = await evaluate(
    cdp,
    `(() => {
    const item = document.querySelector('[data-resource-master-item][data-kind="account"][data-currency="BRL"][data-status="active"]');
    const link = item?.querySelector('a.resource-master-link');
    return link ? new URL(link.href).pathname + new URL(link.href).search : null;
  })()`,
  );
  assert.ok(href, "Missing eligible account for CDI settings.");
  await navigate(cdp, `${baseUrl}${href}`);
  await waitForDetail(cdp, "account");
  const setup = await evaluate(
    cdp,
    `(() => {
    const trigger = document.querySelector('[data-resource-detail="account"] [data-sf-dialog-open^="account-cdi-dialog-"]');
    if (!trigger || trigger.disabled) return null;
    const accountId = trigger.closest('[data-resource-detail]')?.dataset.resourceKey?.slice(8);
    const originalFetch = window.fetch;
    window.__issue716SettingsFetch = originalFetch;
    window.__issue716SettingsProof = { calls: [], firstFails: true };
    window.fetch = async (url, options = {}) => {
      const path = String(url);
      if (path === '/api/account-remuneration/configurations' && !options.method) {
        return { ok: true, json: async () => ({
          configurations: [{ accountId, accountCurrency: 'BRL', indexKind: 'cdi', enabled: true }]
        }) };
      }
      if (path === '/api/account-remuneration/configurations/' + encodeURIComponent(accountId) && options.method === 'PUT') {
        window.__issue716SettingsProof.calls.push(JSON.parse(options.body));
        if (window.__issue716SettingsProof.firstFails) {
          window.__issue716SettingsProof.firstFails = false;
          return { ok: false, json: async () => ({ error: { message: 'Falha configurações CDI simulada' } }) };
        }
        return { ok: true, json: async () => ({ operation: { message: 'Configuração CDI salva' } }) };
      }
      return originalFetch(url, options);
    };
    trigger.focus();
    trigger.click();
    return { label: trigger.getAttribute('aria-label'), title: trigger.title };
  })()`,
  );
  assert.ok(
    setup?.label?.includes("Configurar remuneração CDI"),
    "Settings icon missing accessible name.",
  );
  await waitFor(
    cdp,
    `Boolean(document.querySelector('dialog.master-dialog[open] [data-cdi-configuration-form]'))`,
    "Settings dialog did not open.",
  );
  await evaluate(
    cdp,
    `(() => {
    const form = document.querySelector('[data-cdi-configuration-form]');
    form.querySelector('[name="remunerationPercent"]').value = '88.5';
    form.querySelector('[name="startsOn"]').value = '2026-10-14';
    form.requestSubmit();
  })()`,
  );
  await waitFor(
    cdp,
    `document.querySelector('[data-cdi-form-status]')?.textContent?.includes('Falha configurações CDI simulada')`,
    "Settings API error was not visible.",
  );
  const failed = await evaluate(
    cdp,
    `(() => {
    const form = document.querySelector('[data-cdi-configuration-form]');
    return {
      modalOpen: form.closest('dialog')?.open,
      percent: form.querySelector('[name="remunerationPercent"]').value,
      date: form.querySelector('[name="startsOn"]').value,
      retryAllowed: !form.querySelector('[type="submit"]').disabled,
    };
  })()`,
  );
  assert.deepEqual(failed, {
    modalOpen: true,
    percent: "88.5",
    date: "2026-10-14",
    retryAllowed: true,
  });
  await evaluate(cdp, "document.querySelector('[data-cdi-configuration-form]')?.requestSubmit()");
  await waitFor(
    cdp,
    `document.querySelector('[data-cdi-form-status]')?.textContent?.includes('Configuração CDI salva')`,
    "Settings successful PUT was not visible.",
  );
  const success = await evaluate(cdp, "window.__issue716SettingsProof.calls");
  assert.equal(success.length, 2);
  assert.equal(success[1].enabled, true, "Editing settings must not disable active CDI.");
  assert.equal(success[1].remunerationPercent, 88.5);
  assert.equal(success[1].startsOn, "2026-10-14");
  await sleep(450);
  return { failed, success, accessibleLabel: setup.label };
}

/**
 * Exercises the real API, session scope and database via the browser. The existing
 * mocked scenarios remain responsible for deterministic cancel/error/retry cases.
 */
async function validateCdiRealPersistence(cdp) {
  const created = await evaluate(
    cdp,
    `(async () => {
      const result = await fetch("/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "QA CDI real " + Date.now().toString(36),
          kind: "checking",
          currency: "BRL",
          openingBalanceMinor: 0,
        }),
      });
      return { status: result.status, body: await result.json() };
    })()`,
  );
  assert.equal(created.status, 201, "A real CDI test account must be created.");
  const accountId = created.body.account?.id;
  assert.ok(accountId, "The real account API did not return an id.");
  const href = `/contas-cartoes?resource=${encodeURIComponent(`account:${accountId}`)}`;
  const persisted = { accountId, activated: false, deactivated: false, cleanupStatus: null };
  try {
    await navigate(cdp, `${baseUrl}${href}`);
    await waitForDetail(cdp, "account");
    const initial = await evaluate(
      cdp,
      `document.querySelector('[data-cdi-toggle]')?.getAttribute('aria-checked')`,
    );
    assert.equal(initial, "false", "A newly created account must not start with CDI active.");

    async function toggleAndVerify(enabled) {
      await evaluate(cdp, `document.querySelector('[data-cdi-toggle]')?.click()`);
      await waitFor(
        cdp,
        `Boolean(document.querySelector('#accounts-cards-confirm-dialog[open]'))`,
        "Real CDI confirmation did not open.",
      );
      await evaluate(cdp, `document.querySelector('[data-confirm-accept]')?.click()`);
      await waitFor(
        cdp,
        `document.querySelector('[data-cdi-toggle]')?.getAttribute('aria-checked') === ${JSON.stringify(String(enabled))}`,
        "The CDI switch did not reflect the successful real API update.",
      );
      await navigate(cdp, `${baseUrl}${href}`);
      await waitForDetail(cdp, "account");
      const current = await evaluate(
        cdp,
        `(async () => {
          const response = await fetch("/api/account-remuneration/configurations");
          const body = await response.json();
          return {
            status: response.status,
            entry: body.configurations?.find((entry) => entry.accountId === ${JSON.stringify(accountId)}),
            switchState: document.querySelector('[data-cdi-toggle]')?.getAttribute('aria-checked'),
            masterState: document.querySelector('[data-resource-master-item][data-kind="account"].is-selected')?.getAttribute('data-cdi-state'),
          };
        })()`,
      );
      assert.equal(current.status, 200, "The authenticated API must permit reading CDI.");
      assert.equal(
        current.entry?.enabled,
        enabled,
        "CDI must persist across a new HTTP GET and page load.",
      );
      assert.equal(
        current.switchState,
        String(enabled),
        "The server-rendered switch must match the persisted CDI state.",
      );
      assert.equal(
        current.masterState,
        enabled ? "active" : "inactive",
        "The master list must use persisted CDI state.",
      );
    }
    await toggleAndVerify(true);
    persisted.activated = true;
    await toggleAndVerify(false);
    persisted.deactivated = true;
  } finally {
    // Isolated CI fixture; do not leave an active remuneration on a test account.
    const cleanup = await evaluate(
      cdp,
      `(async () => {
        const response = await fetch("/api/accounts/" + encodeURIComponent(${JSON.stringify(accountId)}), { method: "DELETE" });
        return { status: response.status };
      })()`,
    ).catch(() => null);
    persisted.cleanupStatus = cleanup?.status ?? null;
  }
  return persisted;
}

async function validateCdiSwitch(cdp) {
  const eligibleHref = await evaluate(
    cdp,
    `(() => {
    const item = document.querySelector('[data-resource-master-item][data-kind="account"][data-currency="BRL"][data-status="active"]');
    const link = item?.querySelector('a.resource-master-link');
    return link ? new URL(link.href).pathname + new URL(link.href).search : null;
  })()`,
  );
  assert.ok(eligibleHref, "No eligible BRL account for CDI switch validation.");
  await navigate(cdp, `${baseUrl}${eligibleHref}`);
  await waitForDetail(cdp, "account");
  const setup = await evaluate(
    cdp,
    `(() => {
    const toggle = document.querySelector('[data-resource-detail="account"] [data-cdi-toggle]');
    if (!toggle || toggle.disabled) return null;
    const accountId = toggle.dataset.accountId;
    const initiallyActive = toggle.getAttribute('aria-checked') === 'true';
    const originalFetch = window.fetch;
    window.__issue716CdiProof = { calls: [], initiallyActive, failNextPut: true };
    window.__issue716Fetch = originalFetch;
    window.fetch = async (url, options = {}) => {
      const path = String(url);
      const method = options.method || 'GET';
      if (path === '/api/account-remuneration/configurations' && method === 'GET') {
        return { ok: true, json: async () => ({ configurations: [{
          accountId, accountCurrency: 'BRL', indexKind: 'cdi', enabled: initiallyActive,
          remunerationPercent: 95, startsOn: '2026-10-01', categoryId: 'income-1'
        }] }) };
      }
      if (path === '/api/account-remuneration/configurations/' + encodeURIComponent(accountId) && method === 'PUT') {
        window.__issue716CdiProof.calls.push(JSON.parse(options.body));
        if (window.__issue716CdiProof.failNextPut) {
          window.__issue716CdiProof.failNextPut = false;
          return { ok: false, json: async () => ({ error: { message: 'Falha CDI simulada' } }) };
        }
        return { ok: true, json: async () => ({ operation: { message: 'CDI atualizado' } }) };
      }
      return originalFetch(url, options);
    };
    toggle.focus();
    toggle.click();
    return { focused: document.activeElement === toggle, label: toggle.getAttribute('aria-label') };
  })()`,
  );
  assert.ok(
    setup?.focused && setup.label?.includes("Remuneração CDI"),
    "CDI switch must be keyboard focusable and named.",
  );
  await waitFor(
    cdp,
    `Boolean(document.querySelector('#accounts-cards-confirm-dialog[open]'))`,
    "CDI confirmation did not open.",
  );
  await evaluate(cdp, `document.querySelector('[data-confirm-cancel]')?.click()`);
  await sleep(80);
  const cancelled = await evaluate(
    cdp,
    `(() => ({
    requests: window.__issue716CdiProof.calls.length,
    checked: document.querySelector('[data-cdi-toggle]')?.getAttribute('aria-checked'),
  }))()`,
  );
  assert.equal(cancelled.requests, 0, "Cancelling CDI must not write.");
  const before = await evaluate(cdp, "String(window.__issue716CdiProof.initiallyActive)");
  assert.equal(cancelled.checked, before, "Cancel must preserve state.");

  await evaluate(cdp, "document.querySelector('[data-cdi-toggle]')?.click()");
  await waitFor(
    cdp,
    `Boolean(document.querySelector('#accounts-cards-confirm-dialog[open]'))`,
    "CDI retry confirmation absent.",
  );
  await evaluate(cdp, "document.querySelector('[data-confirm-accept]')?.click()");
  await waitFor(
    cdp,
    `document.querySelector('[data-cdi-feedback]')?.textContent?.includes('Falha CDI simulada')`,
    "CDI failure was not surfaced.",
  );
  const failed = await evaluate(
    cdp,
    `(() => ({
    checked: document.querySelector('[data-cdi-toggle]')?.getAttribute('aria-checked'),
    canRetry: !document.querySelector('[data-cdi-toggle]')?.disabled,
  }))()`,
  );
  assert.equal(failed.checked, before, "Failed write must not flip CDI.");
  assert.equal(failed.canRetry, true, "Failed CDI write must allow retry.");
  await sleep(120);
  await waitFor(
    cdp,
    `!document.querySelector('#accounts-cards-confirm-dialog[open]') && !document.querySelector('[data-cdi-toggle]')?.disabled`,
    "CDI retry must wait for prior dialog close and toggle unlock.",
  );

  await evaluate(cdp, "document.querySelector('[data-cdi-toggle]')?.click()");
  await waitFor(
    cdp,
    `Boolean(document.querySelector('#accounts-cards-confirm-dialog[open]'))`,
    "CDI successful retry confirmation absent.",
  );
  await evaluate(cdp, "document.querySelector('[data-confirm-accept]')?.click()");
  await waitFor(
    cdp,
    `document.querySelector('[data-cdi-feedback]')?.textContent?.includes('CDI atualizado')`,
    "CDI successful write not surfaced.",
  );
  const success = await evaluate(
    cdp,
    `(() => ({
    checked: document.querySelector('[data-cdi-toggle]')?.getAttribute('aria-checked'),
    calls: window.__issue716CdiProof.calls,
    busy: document.querySelector('[data-cdi-toggle]')?.disabled,
  }))()`,
  );
  assert.equal(success.checked, String(before !== "true"), "Successful write must flip CDI.");
  assert.equal(
    success.calls.length,
    2,
    "Expected failed then successful PUT after cancelled attempt.",
  );
  assert.deepEqual(success.calls[1], {
    enabled: before !== "true",
    remunerationPercent: 95,
    startsOn: "2026-10-01",
    categoryId: "income-1",
  });
  assert.equal(success.busy, true, "Switch must lock until reload after successful write.");
  return { cancelled, failed, success };
}

async function inspectPage(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const visible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const goldenLogoFrame = (root) => {
        if (!root) return false;
        const frame = root.getBoundingClientRect();
        const radius = parseFloat(getComputedStyle(root).borderTopLeftRadius);
        const visibleLogo = Array.from(root.querySelectorAll('img, svg')).find(visible);
        if (!visibleLogo) return false;
        const logo = visibleLogo.getBoundingClientRect();
        const logoStyle = getComputedStyle(visibleLogo);
        return Math.abs(frame.width - 44) <= 1 &&
          Math.abs(frame.height - 44) <= 1 &&
          Math.abs(radius - 11) <= 1 &&
          logo.width > 0 && logo.height > 0 &&
          logo.width <= frame.width + 1 && logo.height <= frame.height + 1 &&
          (visibleLogo.tagName.toLowerCase() !== 'img' || logoStyle.objectFit === 'contain');
      };
      const detail = document.querySelector('[data-resource-detail]');
      const detailText = detail?.textContent || '';
      const masterItems = Array.from(document.querySelectorAll('[data-resource-master-item]'));
      return {
        archetype: document.querySelector('[data-accounts-cards-archetype]')?.getAttribute('data-accounts-cards-archetype') || '',
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        detailLayoutVisible: visible(document.querySelector('.sf-detail-layout')),
        masterVisible: visible(document.querySelector('.resource-master-panel')),
        detailVisible: visible(document.querySelector('.resource-detail-panel')),
        masterItemCount: masterItems.length,
        listAmountsVisible: masterItems.every((item) => Boolean(item.querySelector('.resource-master-amount strong'))),
        masterTypeColumn: Array.from(document.querySelectorAll('.resource-master-columns > span'))
          .map((column) => column.textContent.trim()).join('|') ===
          'Tipo|Instituição|Conta ou cartão|Moeda|Valor|CDI|Situação',
        masterTypeFirst: masterItems.every((item) => {
          const link = item.querySelector('.resource-master-link');
          const type = link?.querySelector('.resource-master-type');
          const identity = link?.querySelector('.resource-master-identity');
          if (!link || !type || !identity || link.firstElementChild !== type) return false;
          if (innerWidth <= 1099) {
            return type.getBoundingClientRect().left < identity.getBoundingClientRect().left;
          }
          return getComputedStyle(link).gridTemplateColumns.split(' ').length === 7 &&
            type.getBoundingClientRect().left < identity.getBoundingClientRect().left;
        }),
        masterInstitutionSecond: masterItems.every((item) => {
          const row = item.querySelector('.resource-master-link');
          const type = row?.querySelector('.resource-master-type');
          const institution = row?.querySelector('.resource-master-institution');
          const identity = row?.querySelector('.resource-master-identity');
          return type && institution && identity &&
            row.children[0] === type && row.children[1] === institution && row.children[2] === identity &&
            type.getBoundingClientRect().left < institution.getBoundingClientRect().left &&
            (innerWidth <= 1099 || institution.getBoundingClientRect().left < identity.getBoundingClientRect().left);
        }),
        amountKindInline: masterItems.every((item) => {
          const amount = item.querySelector('.resource-master-amount');
          const numeric = amount?.querySelector('strong');
          const kind = amount?.querySelector('.resource-master-amount-kind');
          const expectedLabel = item.getAttribute('data-kind') === 'account' ? 'Saldo inicial' : 'Limite total';
          if (!numeric || !kind) return false;
          const a = numeric.getBoundingClientRect();
          const b = kind.getBoundingClientRect();
          return kind.getAttribute('aria-label') === expectedLabel &&
            kind.getAttribute('title') === expectedLabel &&
            Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) <= 3 &&
            b.left >= a.right - 1 &&
            !amount.querySelector('small');
        }),
        masterTypeTooltips: masterItems.every((item) => {
          const badge = item.querySelector('.resource-master-type');
          return badge?.getAttribute('role') === 'img' &&
            Boolean(badge.getAttribute('aria-label')) &&
            badge.getAttribute('aria-label') === badge.getAttribute('title') &&
            Boolean(badge.querySelector('svg')) &&
            !item.querySelector('.resource-master-context');
        }),
        compactRowMinHeight: masterItems.every((item) => {
          const link = item.querySelector('.resource-master-link');
          const expected = innerWidth <= 1099 ? 76 : 54;
          return link && Math.abs(parseFloat(getComputedStyle(link).minHeight) - expected) <= 1;
        }),
        headerActionsHaveIcons: ['new-account-dialog', 'new-card-dialog'].every((id) =>
          Boolean(document.querySelector('[data-open-dialog="' + id + '"] svg.resource-header-action-icon')),
        ),
        cdiColumnPresent: Array.from(document.querySelectorAll('.resource-master-columns > span')).some((column) => column.textContent.trim() === 'CDI'),
        cdiStateConsistent: masterItems.every((item) => {
          const active = item.getAttribute('data-cdi-active') === 'true';
          const label = item.querySelector('.resource-master-cdi-column')?.textContent?.trim() || '';
          const compact = item.querySelector('.resource-master-cdi-compact')?.getAttribute('aria-label') || '';
          const state = item.getAttribute('data-cdi-state');
          if (item.getAttribute('data-kind') === 'card') {
            return state === 'not-applicable' && !active && label === '—' && compact === '';
          }
          const expected = state === 'active'
            ? 'CDI ativo'
            : state === 'inactive'
              ? 'Sem CDI ativo'
              : state === 'ineligible'
                ? 'Não elegível'
                : state === 'unavailable'
                  ? 'Não verificado'
                  : null;
          return Boolean(expected) && label === expected && compact.includes(expected) && active === (state === 'active');
        }),
        listIsPrimary: (() => {
          const master = document.querySelector('.sf-detail-layout-master')?.getBoundingClientRect();
          const secondary = document.querySelector('.sf-detail-layout-detail')?.getBoundingClientRect();
          if (!master || !secondary) return false;
          return innerWidth >= 1100
            ? master.width >= secondary.width * 1.8
            : master.top <= secondary.top && master.width <= innerWidth;
        })(),
        institutionLogosOnMaster: masterItems.every((item) => Boolean(item.querySelector('.resource-master-icon .institution-logo-img, .resource-master-icon .institution-badge-icon'))),
        institutionImageMatchesGolden: masterItems.every((item) => goldenLogoFrame(item.querySelector('.resource-master-icon'))),
        detailImageMatchesGolden: goldenLogoFrame(detail?.querySelector('.resource-detail-identity')),
        financialContextVisible: (() => {
          const selected = document.querySelector('[data-resource-master-item].is-selected');
          const rowAmount = selected?.querySelector('.resource-master-amount strong');
          const kind = detail?.getAttribute('data-resource-detail');
          const expected = kind === 'account' ? 'Saldo inicial' : kind === 'card' ? 'Limite total' : '';
          return visible(rowAmount) &&
            selected?.querySelector('.resource-master-amount')?.getAttribute('data-amount-label') === expected &&
            Boolean(detail?.textContent?.includes(expected)) &&
            visible(detail?.querySelector('.resource-detail-grid'));
        })(),
        institutionIdentityVisible: visible(document.querySelector('.resource-detail-identity .institution-logo-img, .resource-detail-identity .institution-badge-icon')),
        selectedMasterCount: document.querySelectorAll('[data-resource-master-item] [aria-current="page"]').length,
        selectedKind: detail?.getAttribute('data-resource-detail') || '',
        hasTabs: document.querySelectorAll('[data-tab-panel], [role="tab"], .sf-tabs').length > 0,
        legacyActionMenuCount: document.querySelectorAll('.action-menu-trigger, [data-legacy-item-menu]').length,
        tabArtifacts: document.querySelectorAll('[data-tab-panel], [role="tab"], .sf-tabs, .action-menu-trigger, [data-legacy-item-menu]').length,
        searchVisible: visible(document.querySelector('[data-master-search]')),
        kindOptions: Array.from(document.querySelectorAll('[data-master-kind] option')).map((option) => option.value),
        currencyOptions: Array.from(document.querySelectorAll('[data-master-currency] option')).map((option) => option.value),
        currencyOptionLabels: Array.from(
          document.querySelectorAll('[data-master-currency] option'),
        ).map((option) => option.textContent?.trim() || ''),
        currencyFilterLabelFits: (() => {
          const select = document.querySelector('[data-master-currency]');
          if (!visible(select)) return false;
          const style = getComputedStyle(select);
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) return false;
          context.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
          const label = select.selectedOptions[0]?.textContent?.trim() || '';
          return select.getBoundingClientRect().width >= context.measureText(label).width + 40;
        })(),
        statusOptions: Array.from(document.querySelectorAll('[data-master-status] option')).map((option) => option.value),
        currencyContextVisible: /Moeda\\s*(BRL|USD|EUR)\\b/i.test(detailText) || /Moeda\\s*(indisponível|não informada)/i.test(detailText),
        instrumentSectionVisible: visible(document.querySelector('.resource-instruments')),
        instrumentCount: document.querySelectorAll('[data-card-instrument]').length,
        loadingStatePresent: Boolean(document.querySelector('[data-resource-loading]')),
        controlsUseGoldenPrimitives: Boolean(
          document.querySelector('.resource-master-filters.sf-filter-bar') &&
          document.querySelector('.accounts-cards-a3-page .sf-page-header-actions .sf-button-primary') &&
          document.querySelector('.resource-detail-actions .sf-button-secondary.sf-icon-button.resource-action-button')
        ),
        directActionCount: detail ? detail.querySelectorAll('.resource-detail-actions button, .resource-detail-actions a').length : 0,
      };
    })()`,
  );
}

async function selectResource(cdp, kind) {
  return evaluate(
    cdp,
    `(() => {
      const link = Array.from(document.querySelectorAll('[data-resource-master-item] .resource-master-link')).find((candidate) => {
        const value = new URL(candidate.href).searchParams.get('resource') || '';
        return value.startsWith(${JSON.stringify(`${kind}:`)});
      });
      if (!link) return null;
      const url = new URL(link.href);
      return { href: url.pathname + url.search, label: link.textContent?.trim() || '' };
    })()`,
  );
}

async function validateFilter(cdp) {
  const state = await evaluate(
    cdp,
    `(() => {
      const input = document.querySelector('[data-master-search]');
      const kind = document.querySelector('[data-master-kind]');
      const currency = document.querySelector('[data-master-currency]');
      const status = document.querySelector('[data-master-status]');
      if (!input || !kind || !currency || !status) return { available: false };
      const items = Array.from(document.querySelectorAll('[data-resource-master-item]'));
      const empty = document.querySelector('[data-filter-empty]');

      input.value = 'consulta-sem-resultado-issue-654';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const searchHiddenCount = items.filter((item) => item.hidden).length;
      const emptyVisible = Boolean(empty && !empty.hidden);
      const selectedMasterCountAfterEmpty = document.querySelectorAll(
        '[data-resource-master-item] [aria-current="page"]',
      ).length;
      const selectedClassCountAfterEmpty = document.querySelectorAll(
        '[data-resource-master-item].is-selected',
      ).length;
      const selectedDetailAfterEmpty = document.querySelector('[data-resource-detail]');
      const neutralDetailAfterEmpty = document.querySelector('[data-filter-selection-empty]');
      const selectedDetailHiddenAfterEmpty = Boolean(
        selectedDetailAfterEmpty && selectedDetailAfterEmpty.hidden,
      );
      const neutralDetailVisibleAfterEmpty = Boolean(
        neutralDetailAfterEmpty && !neutralDetailAfterEmpty.hidden,
      );

      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      kind.value = 'account';
      kind.dispatchEvent(new Event('change', { bubbles: true }));
      const accountVisible = items.filter((item) => !item.hidden);
      const accountOnly = accountVisible.every((item) => item.dataset.kind === 'account');

      kind.value = 'all';
      kind.dispatchEvent(new Event('change', { bubbles: true }));
      const selectedCurrency = Array.from(currency.options).map((option) => option.value).find((value) => value !== 'all') || 'all';
      currency.value = selectedCurrency;
      currency.dispatchEvent(new Event('change', { bubbles: true }));
      const currencyVisible = items.filter((item) => !item.hidden);
      const currencyOnly = selectedCurrency === 'all' || currencyVisible.every((item) => item.dataset.currency === selectedCurrency);

      currency.value = 'all';
      currency.dispatchEvent(new Event('change', { bubbles: true }));
      const target = items.find((item) => item.dataset.kind === 'account') || items[0];
      const targetName = target?.querySelector('.resource-master-title strong')?.textContent?.trim().toLowerCase() || '';
      const targetKind = target?.dataset.kind || 'all';
      const targetCurrency = target?.dataset.currency || 'unavailable';
      const targetStatus = target?.dataset.status === 'active' ? 'active' : 'inactive';
      input.value = targetName;
      kind.value = targetKind;
      currency.value = targetCurrency;
      status.value = targetStatus;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      kind.dispatchEvent(new Event('change', { bubbles: true }));
      currency.dispatchEvent(new Event('change', { bubbles: true }));
      status.dispatchEvent(new Event('change', { bubbles: true }));
      const combinedVisible = items.filter((item) => !item.hidden);
      const combinedMatches = combinedVisible.every((item) => {
        const matchesName = !targetName || String(item.dataset.search || '').includes(targetName);
        const matchesKind = item.dataset.kind === targetKind;
        const matchesCurrency = item.dataset.currency === targetCurrency;
        const matchesStatus = targetStatus === 'active' ? item.dataset.status === 'active' : item.dataset.status !== 'active';
        return matchesName && matchesKind && matchesCurrency && matchesStatus;
      });

      input.value = '';
      kind.value = 'all';
      currency.value = 'all';
      status.value = 'all';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      kind.dispatchEvent(new Event('change', { bubbles: true }));
      currency.dispatchEvent(new Event('change', { bubbles: true }));
      status.dispatchEvent(new Event('change', { bubbles: true }));
      const selectedMasterCountAfterReset = document.querySelectorAll(
        '[data-resource-master-item] [aria-current="page"]',
      ).length;
      const neutralDetailAfterReset = document.querySelector('[data-filter-selection-empty]');
      const neutralDetailVisibleAfterReset = Boolean(
        neutralDetailAfterReset && !neutralDetailAfterReset.hidden,
      );

      return {
        available: true,
        searchHiddenCount,
        totalCount: items.length,
        emptyVisible,
        selectedMasterCountAfterEmpty,
        selectedClassCountAfterEmpty,
        selectedDetailHiddenAfterEmpty,
        neutralDetailVisibleAfterEmpty,
        selectedMasterCountAfterReset,
        neutralDetailVisibleAfterReset,
        accountVisibleCount: accountVisible.length,
        accountOnly,
        selectedCurrency,
        currencyVisibleCount: currencyVisible.length,
        currencyOnly,
        combinedVisibleCount: combinedVisible.length,
        combinedMatches,
      };
    })()`,
  );
  assert.equal(state.available, true);
  assert.ok(state.totalCount > 0);
  assert.equal(
    state.searchHiddenCount,
    state.totalCount,
    "Search did not filter the unified master list.",
  );
  assert.equal(state.emptyVisible, true, "Filtered empty state is not visible.");
  assert.equal(state.selectedMasterCountAfterEmpty, 0, "Filtered-out resource kept aria-current.");
  assert.equal(
    state.selectedClassCountAfterEmpty,
    0,
    "Filtered-out resource kept selected styling.",
  );
  assert.equal(
    state.selectedDetailHiddenAfterEmpty,
    true,
    "Filtered-out resource detail stayed visible.",
  );
  assert.equal(
    state.neutralDetailVisibleAfterEmpty,
    true,
    "Neutral selection detail was not shown.",
  );
  assert.equal(
    state.selectedMasterCountAfterReset,
    0,
    "Clearing filters restored a selection silently.",
  );
  assert.equal(
    state.neutralDetailVisibleAfterReset,
    true,
    "Clearing filters hid the neutral detail without an explicit selection.",
  );
  assert.ok(state.accountVisibleCount > 0, "Type filter did not keep any account visible.");
  assert.equal(state.accountOnly, true, "Type filter left non-account resources visible.");
  assert.notEqual(
    state.selectedCurrency,
    "all",
    "Currency filter has no selectable currency state.",
  );
  assert.ok(state.currencyVisibleCount > 0, "Currency filter hid every resource unexpectedly.");
  assert.equal(
    state.currencyOnly,
    true,
    "Currency filter left resources from another currency visible.",
  );
  assert.ok(state.combinedVisibleCount > 0, "Combined filters hid the target resource.");
  assert.equal(state.combinedMatches, true, "Search, type, currency and status are not combined.");
  return state;
}

async function validateKeyboardDialog(cdp) {
  const prepared = await evaluate(
    cdp,
    `(() => {
      const trigger = document.querySelector('[data-resource-detail] [data-open-dialog^="edit-account-dialog-"]');
      if (!trigger) return false;
      trigger.focus();
      return document.activeElement === trigger;
    })()`,
  );
  assert.equal(prepared, true, "No focusable direct edit action is available.");

  await pressEnter(cdp);
  await waitFor(
    cdp,
    `Boolean(document.querySelector('dialog.master-dialog[open]:not(#accounts-cards-confirm-dialog)'))`,
    "Resource dialog did not open with Enter.",
  );

  const opened = await evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector('dialog.master-dialog[open]:not(#accounts-cards-confirm-dialog)');
      const rect = dialog?.getBoundingClientRect();
      return {
        open: Boolean(dialog),
        labelled: Boolean(dialog?.getAttribute('aria-labelledby') || dialog?.getAttribute('aria-label')),
        insideViewport: Boolean(rect && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight),
        focusInside: Boolean(dialog && dialog.contains(document.activeElement)),
      };
    })()`,
  );
  assert.equal(opened.open, true);
  assert.equal(opened.labelled, true);
  assert.equal(opened.insideViewport, true, "Resource dialog exceeds the viewport.");
  assert.equal(opened.focusInside, true, "Resource dialog did not receive focus.");

  await pressEscape(cdp);
  await sleep(100);
  const closed = await evaluate(
    cdp,
    `(() => ({
      open: Boolean(document.querySelector('dialog.master-dialog[open]:not(#accounts-cards-confirm-dialog)')),
      focusRestored: document.activeElement?.matches?.('[data-resource-detail] [data-open-dialog^="edit-account-dialog-"]') === true,
    }))()`,
  );
  assert.equal(closed.open, false, "Resource dialog did not close with Escape.");
  assert.equal(closed.focusRestored, true, "Focus was not restored to the dialog trigger.");
  return { ...opened, closed };
}

async function validateSaveFailureStates(cdp) {
  await evaluate(
    cdp,
    `document.querySelector('[data-resource-detail] [data-open-dialog^="edit-account-dialog-"]')?.click()`,
  );
  await waitFor(
    cdp,
    `Boolean(document.querySelector('dialog.master-dialog[open]:not(#accounts-cards-confirm-dialog)'))`,
    "Edit dialog did not reopen.",
  );

  const prepared = await evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector('dialog.master-dialog[open]:not(#accounts-cards-confirm-dialog)');
      const form = dialog?.querySelector('form[data-api-form]');
      if (!form || !form.checkValidity()) return false;
      window.__issue612OriginalFetch = window.fetch;
      window.__issue612ResolveFetch = null;
      window.fetch = () => new Promise((resolve) => { window.__issue612ResolveFetch = resolve; });
      form.requestSubmit();
      return true;
    })()`,
  );
  assert.equal(prepared, true, "Could not prepare a valid save form for loading/error coverage.");
  await sleep(80);

  const loading = await evaluate(
    cdp,
    `(() => ({
      visible: Boolean(document.querySelector('[data-resource-loading]') && !document.querySelector('[data-resource-loading]').hidden),
      status: document.querySelector('dialog.master-dialog[open] [data-form-status]')?.textContent?.trim() || '',
    }))()`,
  );
  assert.equal(loading.visible, true, "Loading state did not become visible during save.");
  assert.match(loading.status, /Salvando/i);

  await evaluate(
    cdp,
    `(() => {
      window.__issue612ResolveFetch?.(new Response(JSON.stringify({ error: { message: 'Falha simulada de validação' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }));
    })()`,
  );
  await sleep(120);
  const failed = await evaluate(
    cdp,
    `(() => {
      const status = document.querySelector('dialog.master-dialog[open] [data-form-status]');
      const result = {
        loadingHidden: Boolean(document.querySelector('[data-resource-loading]')?.hidden),
        status: status?.textContent?.trim() || '',
        statusClass: status?.className || '',
      };
      if (window.__issue612OriginalFetch) window.fetch = window.__issue612OriginalFetch;
      delete window.__issue612OriginalFetch;
      delete window.__issue612ResolveFetch;
      return result;
    })()`,
  );
  assert.equal(failed.loadingHidden, true, "Loading state remained visible after save failure.");
  assert.match(failed.status, /Falha simulada/i);
  assert.match(failed.statusClass, /error/);

  await pressEscape(cdp);
  await sleep(80);
  return { loading, failed };
}

async function validateConfirmationCancellation(cdp) {
  const prepared = await evaluate(
    cdp,
    `(() => {
      const form = document.querySelector('[data-resource-detail] form[data-confirm]');
      if (!form) return false;
      window.__issue612OriginalFetch = window.fetch;
      window.__issue612FetchCount = 0;
      window.fetch = (...args) => {
        window.__issue612FetchCount += 1;
        return window.__issue612OriginalFetch(...args);
      };
      form.requestSubmit();
      return true;
    })()`,
  );
  assert.equal(prepared, true, "No destructive action requiring confirmation was found.");
  await waitFor(
    cdp,
    `Boolean(document.querySelector('#accounts-cards-confirm-dialog[open]'))`,
    "Confirmation dialog did not open.",
  );
  await evaluate(cdp, `document.querySelector('[data-confirm-cancel]')?.click()`);
  await sleep(80);
  const result = await evaluate(
    cdp,
    `(() => {
      const value = {
        open: Boolean(document.querySelector('#accounts-cards-confirm-dialog[open]')),
        requestCount: Number(window.__issue612FetchCount || 0),
      };
      if (window.__issue612OriginalFetch) window.fetch = window.__issue612OriginalFetch;
      delete window.__issue612OriginalFetch;
      delete window.__issue612FetchCount;
      return value;
    })()`,
  );
  assert.equal(result.open, false, "Confirmation dialog did not close after cancellation.");
  assert.equal(result.requestCount, 0, "Cancelled destructive action still called the API.");
  return { ...result, cancelledWithoutRequest: true };
}

async function validateLongContent(cdp) {
  const original = await evaluate(
    cdp,
    `(() => {
      const title = document.querySelector('[data-resource-detail] h2');
      const masterTitle = document.querySelector('[data-resource-master-item] .resource-master-title strong');
      const values = { title: title?.textContent || '', masterTitle: masterTitle?.textContent || '' };
      const long = 'Recurso financeiro internacional com identificação deliberadamente extensa para validar reflow sem perda de ações ou contexto monetário';
      if (title) title.textContent = long;
      if (masterTitle) masterTitle.textContent = long;
      return values;
    })()`,
  );
  await sleep(80);
  const result = await evaluate(
    cdp,
    `(() => ({
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      detailVisible: Boolean(document.querySelector('[data-resource-detail]')?.getClientRects().length),
      actionsVisible: Boolean(document.querySelector('.resource-detail-actions')?.getClientRects().length),
    }))()`,
  );
  assert.equal(result.noHorizontalOverflow, true, "Long content creates horizontal overflow.");
  assert.equal(result.detailVisible, true);
  assert.equal(result.actionsVisible, true, "Long content hides maintenance actions.");
  await evaluate(
    cdp,
    `((values) => {
      const title = document.querySelector('[data-resource-detail] h2');
      const masterTitle = document.querySelector('[data-resource-master-item] .resource-master-title strong');
      if (title) title.textContent = values.title;
      if (masterTitle) masterTitle.textContent = values.masterTitle;
    })(${JSON.stringify(original)})`,
  );
  return result;
}

async function waitForA3(cdp) {
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-accounts-cards-archetype="A3"]') && document.querySelector('[data-resource-master-item]'))`,
    "Accounts/Cards A3 did not render master resources.",
  );
}

async function waitForDetail(cdp, kind) {
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-resource-detail="${kind}"]'))`,
    `Accounts/Cards did not render ${kind} detail.`,
  );
}

async function waitFor(cdp, expression, message) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(cdp, expression)) return;
    await sleep(100);
  }
  throw new Error(message);
}

async function pressEscape(cdp) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
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
    type: "char",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
    text: "\r",
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
}

function serializeError(error) {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
