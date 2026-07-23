import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;

if (!chromePath) throw new Error("CHROME_BIN is required for Inbox status validation.");

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let evidence;

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  const fixture = await createFixture(browser.cdp);
  const inboxUrl = `${baseUrl}/inbox?importBatchId=${encodeURIComponent(fixture.batchId)}`;

  await navigate(browser.cdp, inboxUrl);
  await waitForStatus(browser.cdp, fixture.confirmedSuggestionId, "Elegível");
  await waitForStatus(browser.cdp, fixture.rejectedSuggestionId, "Elegível");
  const actionTooltips = await readActionTooltips(browser.cdp, fixture.confirmedSuggestionId);
  assert.deepEqual(
    actionTooltips.map((item) => item.text),
    ["Corrigir linha", "Confirmar linha", "Rejeitar linha"],
  );
  assert.equal(
    actionTooltips.every((item) => item.visible),
    true,
  );
  assert.equal(
    actionTooltips.every((item) => item.dataTooltip === item.text),
    true,
  );
  assert.equal(
    actionTooltips.every((item) => item.describedBy === "inbox-action-tooltip"),
    true,
  );

  const initialLayout = await readRowLayout(browser.cdp, fixture.confirmedSuggestionId);
  assert.equal(initialLayout.selector.width, 24);
  assert.equal(initialLayout.selector.height, 24);
  assert.equal(initialLayout.selector.borderRadius, "50%");
  assert.match(initialLayout.selector.backgroundImage, /radial-gradient/);
  assert.equal(initialLayout.status.whiteSpace, "normal");
  assert.equal(initialLayout.status.clipped, false);
  assert.equal(initialLayout.account.whiteSpace, "normal");
  assert.equal(initialLayout.account.clipped, false);

  const correction = await evaluate(
    browser.cdp,
    `(async () => {
      const response = await fetch(${JSON.stringify(
        `/api/import-batches/${fixture.batchId}/suggestions/${fixture.confirmedSuggestionId}`,
      )}, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: ${JSON.stringify(`${fixture.description} corrigida`)} })
      });
      return { ok: response.ok, status: response.status, body: await response.json().catch(() => ({})) };
    })()`,
  );
  assert.equal(
    correction.ok,
    true,
    `Correction failed: ${correction.status} ${JSON.stringify(correction.body)}`,
  );

  const rejection = await evaluate(
    browser.cdp,
    `(async () => {
      const response = await fetch(${JSON.stringify(
        `/api/import-batches/${fixture.batchId}/suggestions/${fixture.rejectedSuggestionId}/reject`,
      )}, {
        method: "POST",
        headers: { "content-type": "application/json" }
      });
      return { ok: response.ok, status: response.status, body: await response.json().catch(() => ({})) };
    })()`,
  );
  assert.equal(
    rejection.ok,
    true,
    `Rejection failed: ${rejection.status} ${JSON.stringify(rejection.body)}`,
  );

  await navigate(browser.cdp, inboxUrl);
  await waitForStatus(browser.cdp, fixture.confirmedSuggestionId, "Corrigido");
  await waitForStatus(browser.cdp, fixture.rejectedSuggestionId, "Rejeitada");
  const correctedStatus = await readStatus(browser.cdp, fixture.confirmedSuggestionId);
  const rejectedStatus = await readStatus(browser.cdp, fixture.rejectedSuggestionId);
  assert.equal(rejectedStatus.color, "rgb(185, 28, 28)");
  assert.equal(rejectedStatus.backgroundColor, "rgba(0, 0, 0, 0)");

  const confirmation = await evaluate(
    browser.cdp,
    `(async () => {
      const response = await fetch(${JSON.stringify(
        `/api/import-batches/${fixture.batchId}/suggestions/${fixture.confirmedSuggestionId}/approve`,
      )}, {
        method: "POST",
        headers: { "content-type": "application/json" }
      });
      return { ok: response.ok, status: response.status, body: await response.json().catch(() => ({})) };
    })()`,
  );
  assert.equal(
    confirmation.ok,
    true,
    `Confirmation failed: ${confirmation.status} ${JSON.stringify(confirmation.body)}`,
  );

  await navigate(browser.cdp, inboxUrl);
  await waitForStatus(browser.cdp, fixture.confirmedSuggestionId, "Confirmado");
  const confirmedStatus = await readStatus(browser.cdp, fixture.confirmedSuggestionId);
  assert.equal(confirmedStatus.color, "rgb(21, 128, 61)");
  assert.equal(confirmedStatus.backgroundColor, "rgba(0, 0, 0, 0)");

  const longAccountText = await applyLongAccountContent(browser.cdp, fixture.confirmedSuggestionId);
  const confirmedLayout = await readRowLayout(browser.cdp, fixture.confirmedSuggestionId);
  assert.equal(confirmedLayout.selector.width, 24);
  assert.equal(confirmedLayout.selector.height, 24);
  assert.equal(confirmedLayout.selector.borderRadius, "50%");
  assert.match(confirmedLayout.selector.backgroundImage, /radial-gradient/);
  assert.equal(confirmedLayout.status.clipped, false);
  assert.equal(confirmedLayout.account.clipped, false);

  const screenshotName = "inbox-status-control-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, screenshotName));

  evidence = {
    generatedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? "local",
    browser: browser.version,
    batchId: fixture.batchId,
    confirmedSuggestionId: fixture.confirmedSuggestionId,
    rejectedSuggestionId: fixture.rejectedSuggestionId,
    actionTooltips,
    initialLayout,
    correctedStatus,
    rejectedStatus,
    confirmedStatus,
    confirmedLayout,
    longAccountText,
    screenshot: screenshotName,
  };
} finally {
  await browser.close(outputDir);
}

await writeFile(
  join(outputDir, "inbox-status-control.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log("Inbox status, selector and readable columns validation passed.");

async function createFixture(cdp) {
  const result = await evaluate(
    cdp,
    `(async () => {
      const readJson = async (response) => ({
        ok: response.ok,
        status: response.status,
        body: await response.json().catch(() => ({}))
      });
      const accounts = await readJson(await fetch("/api/accounts"));
      if (!accounts.ok) return accounts;
      const account = (accounts.body.accounts || []).find((item) => item.status === "active");
      if (!account) return { ok: false, status: 0, body: { error: "No active account available" } };

      const suffix = Date.now().toString(36);
      const description = "Status control " + suffix;
      const rejectedDescription = "Status rejected " + suffix;
      const created = await readJson(await fetch("/api/import-batches/csv", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          originalFileName: "inbox-status-control-" + suffix + ".csv",
          content: "date,description,amount\\n2026-07-23," + description + ",-42.50\\n2026-07-24," + rejectedDescription + ",-18.75",
          accountId: account.id,
          consentAccepted: true
        })
      }));
      if (!created.ok) return created;
      return {
        ok: true,
        status: created.status,
        body: {
          batchId: created.body.importBatch.id,
          confirmedSuggestionId: created.body.suggestions[0].id,
          rejectedSuggestionId: created.body.suggestions[1].id,
          description
        }
      };
    })()`,
  );

  assert.equal(result.ok, true, `Fixture failed: ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

async function waitForStatus(cdp, suggestionId, expected, timeout = 12_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const current = await readStatus(cdp, suggestionId).catch(() => undefined);
    if (current?.text === expected) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for status ${expected} on suggestion ${suggestionId}`);
}

async function readActionTooltips(cdp, suggestionId) {
  return evaluate(
    cdp,
    `(() => {
      const row = document.querySelector('[data-suggestion-id="${suggestionId}"]');
      const controls = Array.from(row?.querySelectorAll('.row-action-cluster .compact-row-action') || []);
      return controls.map((control) => {
        control.focus();
        const tooltip = document.getElementById('inbox-action-tooltip');
        return {
          text: tooltip?.textContent?.trim() || "",
          dataTooltip: control.getAttribute('data-tooltip') || "",
          describedBy: control.getAttribute('aria-describedby') || "",
          visible: Boolean(tooltip && !tooltip.hidden)
        };
      });
    })()`,
  );
}

async function applyLongAccountContent(cdp, suggestionId) {
  return evaluate(
    cdp,
    `(() => {
      const row = document.querySelector('[data-suggestion-id="${suggestionId}"]');
      const account = row?.querySelector('.import-table-cell-account .row-summary-value-preview, .import-table-cell-account');
      if (!account) return "";
      const text = "Conta empresarial de investimentos e reservas de longo prazo";
      account.textContent = text;
      return text;
    })()`,
  );
}

async function readRowLayout(cdp, suggestionId) {
  return evaluate(
    cdp,
    `(() => {
      const row = document.querySelector('[data-suggestion-id="${suggestionId}"]');
      const selector = row?.querySelector('.import-table-select-cell input[type="checkbox"]');
      const status = row?.querySelector('.import-table-status, .row-heading .status-pill');
      const account = row?.querySelector('.import-table-cell-account .row-summary-value-preview, .import-table-cell-account');
      const measure = (node) => {
        if (!node) return { width: 0, height: 0, borderRadius: "", backgroundImage: "", whiteSpace: "", clipped: true };
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          borderRadius: style.borderRadius,
          backgroundImage: style.backgroundImage,
          whiteSpace: style.whiteSpace,
          overflowWrap: style.overflowWrap,
          clipped: node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1
        };
      };
      return {
        selector: measure(selector),
        status: measure(status),
        account: measure(account)
      };
    })()`,
  );
}

async function readStatus(cdp, suggestionId) {
  return evaluate(
    cdp,
    `(() => {
      const row = document.querySelector('[data-suggestion-id="${suggestionId}"]');
      const pill = row?.querySelector('.import-table-status, .row-heading .status-pill');
      const style = pill ? getComputedStyle(pill) : undefined;
      return {
        text: pill?.textContent?.trim() || "",
        controlledStatus: pill?.getAttribute('data-controlled-status') || "",
        rowControlledStatus: row?.getAttribute('data-controlled-status') || "",
        color: style?.color || "",
        backgroundColor: style?.backgroundColor || ""
      };
    })()`,
  );
}
