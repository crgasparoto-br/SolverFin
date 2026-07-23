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
  await waitForStatus(browser.cdp, fixture.suggestionId, "Elegível");
  await sleep(30);

  const correction = await evaluate(
    browser.cdp,
    `(async () => {
      const response = await fetch(${JSON.stringify(
        `/api/import-batches/${fixture.batchId}/suggestions/${fixture.suggestionId}`,
      )}, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: ${JSON.stringify(`${fixture.description} corrigida`)} })
      });
      return { ok: response.ok, status: response.status, body: await response.json().catch(() => ({})) };
    })()`,
  );
  assert.equal(correction.ok, true, `Correction failed: ${correction.status} ${JSON.stringify(correction.body)}`);

  await navigate(browser.cdp, inboxUrl);
  await waitForStatus(browser.cdp, fixture.suggestionId, "Corrigido");
  const correctedStatus = await readStatus(browser.cdp, fixture.suggestionId);

  const confirmation = await evaluate(
    browser.cdp,
    `(async () => {
      const response = await fetch(${JSON.stringify(
        `/api/import-batches/${fixture.batchId}/suggestions/${fixture.suggestionId}/approve`,
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
  await waitForStatus(browser.cdp, fixture.suggestionId, "Confirmado");
  const confirmedStatus = await readStatus(browser.cdp, fixture.suggestionId);
  const screenshotName = "inbox-status-control-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, screenshotName));

  evidence = {
    generatedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? "local",
    browser: browser.version,
    batchId: fixture.batchId,
    suggestionId: fixture.suggestionId,
    correctedStatus,
    confirmedStatus,
    screenshot: screenshotName,
  };
} finally {
  await browser.close(outputDir);
}

await writeFile(join(outputDir, "inbox-status-control.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log("Inbox corrected and confirmed status validation passed.");

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
      const created = await readJson(await fetch("/api/import-batches/csv", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          originalFileName: "inbox-status-control-" + suffix + ".csv",
          content: "date,description,amount\\n2026-07-23," + description + ",-42.50",
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
          suggestionId: created.body.suggestions[0].id,
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

async function readStatus(cdp, suggestionId) {
  return evaluate(
    cdp,
    `(() => {
      const row = document.querySelector('[data-suggestion-id="${suggestionId}"]');
      const pill = row?.querySelector('.import-table-status, .row-heading .status-pill');
      return {
        text: pill?.textContent?.trim() || "",
        controlledStatus: pill?.getAttribute('data-controlled-status') || "",
        rowControlledStatus: row?.getAttribute('data-controlled-status') || ""
      };
    })()`,
  );
}
