import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import pg from "pg";

import {
  evaluate,
  launchChrome,
  navigate,
  screenshot,
  setViewport,
  sleep,
} from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const { Client } = pg;
const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const databaseUrl = process.env.DATABASE_URL;
const evidencePath = join(outputDir, "issue-563-bank-message-ai-inbox.json");

if (!chromePath) throw new Error("CHROME_BIN is required for Inbox AI validation.");
if (!databaseUrl) throw new Error("DATABASE_URL is required for Inbox AI validation.");

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
const database = new Client({ connectionString: databaseUrl });
const evidence = {
  commit: process.env.GITHUB_SHA ?? "local",
  generatedAt: new Date().toISOString(),
  stage: "started",
};
let fixtureIds = [];
let databaseConnected = false;

async function saveEvidence(values = {}) {
  Object.assign(evidence, values);
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

try {
  await database.connect();
  databaseConnected = true;
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);

  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  const fixtures = await createFixtures(browser.cdp);
  fixtureIds = [fixtures.deterministicId, fixtures.temporaryId];
  await persistTemporaryFailure(database, fixtures.temporaryId);

  await navigate(browser.cdp, `${baseUrl}/inbox`);
  await waitFor(
    browser.cdp,
    `document.querySelectorAll("[data-extraction-status]").length >= 2 && Boolean(document.querySelector("[data-retry-bank-message]"))`,
  );

  const desktop = await inspectInboxState(browser.cdp, 1366, 900);
  assertInboxState(desktop, "desktop");
  await screenshot(
    browser.cdp,
    join(outputDir, "issue-563-bank-message-ai-inbox-desktop.png"),
  );

  const openedDesktop = await openRetryDialog(browser.cdp);
  assertRetryDialog(openedDesktop, "desktop");
  await screenshot(
    browser.cdp,
    join(outputDir, "issue-563-bank-message-ai-retry-desktop.png"),
  );

  await closeRetryDialog(browser.cdp);
  const mobile = await inspectInboxState(browser.cdp, 390, 844);
  assertInboxState(mobile, "mobile");
  await screenshot(
    browser.cdp,
    join(outputDir, "issue-563-bank-message-ai-inbox-mobile.png"),
  );

  const openedMobile = await openRetryDialog(browser.cdp);
  assertRetryDialog(openedMobile, "mobile");
  assert.equal(openedMobile.dialogFitsViewport, true, "Retry dialog must fit the mobile viewport.");
  await screenshot(
    browser.cdp,
    join(outputDir, "issue-563-bank-message-ai-retry-mobile.png"),
  );

  await saveEvidence({
    stage: "passed",
    fixtureIds,
    desktop,
    openedDesktop,
    mobile,
    openedMobile,
  });
  console.log("Bank message AI Inbox Chrome validation passed.");
} catch (error) {
  const failure = {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  await saveEvidence({ stage: "failed", fixtureIds, failure });
  throw error;
} finally {
  if (databaseConnected) {
    await removeFixtures(database, fixtureIds).catch(() => undefined);
    await database.end().catch(() => undefined);
  }
  await browser.close(outputDir);
}

async function createFixtures(cdp) {
  const result = await evaluate(
    cdp,
    `(async () => {
      async function request(path, body) {
        const response = await fetch(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error("POST " + path + " failed with " + response.status + ": " + JSON.stringify(payload));
        }
        return payload;
      }

      const suffix = Date.now().toString(36);
      const deterministic = await request("/api/bank-message-inbox", {
        origin: "pasted",
        text: suffix + " Compra no cartao final 1234 em Mercado Chrome R$ 42,50 em 05/08/2026",
        consentAccepted: true
      });
      const temporary = await request("/api/bank-message-inbox", {
        origin: "shared",
        text: suffix + " aviso bancario fora dos formatos conhecidos em 05/08/2026",
        consentAccepted: true
      });

      return {
        deterministicId: deterministic.message.id,
        temporaryId: temporary.message.id
      };
    })()`,
  );

  assert.equal(typeof result.deterministicId, "string");
  assert.equal(typeof result.temporaryId, "string");
  return result;
}

async function persistTemporaryFailure(databaseClient, importBatchId) {
  const diagnostic = [
    {
      code: "BANK_MESSAGE_AI_FAILED",
      message:
        "A IA está temporariamente indisponível. Envie novamente a mesma mensagem para tentar de novo.",
      source: "ai",
      state: "temporarily_unavailable",
      retryable: true,
      reviewReasons: [
        "AI_PROVIDER_TIMEOUT: indisponibilidade fictícia para validação visual.",
      ],
    },
  ];
  const result = await databaseClient.query(
    `update "ImportBatch"
     set "status" = 'FAILED', "problems" = $2::jsonb,
         "completedAt" = now(), "updatedAt" = now()
     where "id" = $1`,
    [importBatchId, JSON.stringify(diagnostic)],
  );
  assert.equal(result.rowCount, 1, "Temporary failure fixture must update one Inbox batch.");
}

async function inspectInboxState(cdp, width, height) {
  await setViewport(cdp, width, height);
  await evaluate(cdp, `(() => { window.scrollTo(0, document.body.scrollHeight); return true; })()`);
  await sleep(250);

  return evaluate(
    cdp,
    `(() => {
      const section = [...document.querySelectorAll("section.panel.list-panel")].find(
        (candidate) => candidate.querySelector("h2")?.textContent?.trim() === "Mensagens recebidas"
      );
      const rows = section ? [...section.querySelectorAll("article.maintenance-item")] : [];
      const deterministic = rows.find((row) =>
        (row.textContent || "").includes("Regra determinística")
      );
      const temporary = rows.find((row) =>
        (row.textContent || "").includes("IA temporariamente indisponível")
      );
      const retry = temporary?.querySelector("[data-retry-bank-message]");
      retry?.focus();
      const retryRect = retry?.getBoundingClientRect();
      const retryStyle = retry ? getComputedStyle(retry) : undefined;
      return {
        viewport: window.innerWidth + "x" + window.innerHeight,
        bodyFitsViewport:
          document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        deterministicVisible: Boolean(
          deterministic &&
            (deterministic.textContent || "").includes("Pronta para revisão")
        ),
        temporaryVisible: Boolean(
          temporary &&
            (temporary.textContent || "").includes("Assistida por IA") &&
            (temporary.textContent || "").includes("IA temporariamente indisponível")
        ),
        reasonsVisible: Boolean(
          temporary?.querySelector("[data-extraction-reasons] summary")?.textContent?.includes(
            "Motivos para revisão"
          )
        ),
        retryVisible: Boolean(retry && retryRect && retryRect.width > 0 && retryRect.height >= 34),
        retryFitsViewport: Boolean(
          retryRect && retryRect.left >= 0 && retryRect.right <= window.innerWidth
        ),
        retryFocused: document.activeElement === retry,
        retryFocusVisible: Boolean(
          retryStyle &&
            (retryStyle.outlineStyle !== "none" || retryStyle.boxShadow !== "none")
        ),
        retryLabel: retry?.getAttribute("aria-label") || "",
      };
    })()`,
  );
}

function assertInboxState(state, viewport) {
  assert.equal(state.bodyFitsViewport, true, `Inbox must fit the ${viewport} viewport.`);
  assert.equal(
    state.deterministicVisible,
    true,
    `Deterministic extraction state must be visible on ${viewport}.`,
  );
  assert.equal(
    state.temporaryVisible,
    true,
    `Temporary AI state must be visible on ${viewport}.`,
  );
  assert.equal(state.reasonsVisible, true, `Review reasons must be available on ${viewport}.`);
  assert.equal(state.retryVisible, true, `Retry action must be visible on ${viewport}.`);
  assert.equal(state.retryFitsViewport, true, `Retry action must fit on ${viewport}.`);
  assert.equal(state.retryFocused, true, `Retry action must accept focus on ${viewport}.`);
  assert.equal(
    state.retryFocusVisible,
    true,
    `Retry action must expose visible focus on ${viewport}.`,
  );
  assert.equal(
    state.retryLabel,
    "Tentar novamente a extração desta mensagem bancária",
  );
}

async function openRetryDialog(cdp) {
  const clicked = await evaluate(
    cdp,
    `(() => {
      const button = document.querySelector("[data-retry-bank-message]");
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  assert.equal(clicked, true, "Retry action must be clickable.");
  await waitFor(
    cdp,
    `Boolean(document.querySelector("#new-inbox-message-dialog")?.open)`,
  );

  return evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector("#new-inbox-message-dialog");
      const textarea = dialog?.querySelector('textarea[name="text"]');
      const origin = dialog?.querySelector('input[name="origin"]');
      const consent = dialog?.querySelector('input[name="consentAccepted"]');
      const status = dialog?.querySelector("[data-bank-message-retry-status]");
      const rect = dialog?.getBoundingClientRect();
      return {
        open: Boolean(dialog?.open),
        textareaEmpty: textarea?.value === "",
        textareaFocused: document.activeElement === textarea,
        origin: origin?.value || "",
        consentChecked: Boolean(consent?.checked),
        privacyNotice: status?.textContent?.trim() || "",
        statusRole: status?.getAttribute("role") || "",
        statusLive: status?.getAttribute("aria-live") || "",
        dialogFitsViewport: Boolean(
          rect && rect.left >= 0 && rect.right <= window.innerWidth && rect.width <= window.innerWidth
        ),
      };
    })()`,
  );
}

function assertRetryDialog(state, viewport) {
  assert.equal(state.open, true, `Retry dialog must open on ${viewport}.`);
  assert.equal(state.textareaEmpty, true, `Retry textarea must remain empty on ${viewport}.`);
  assert.equal(
    state.textareaFocused,
    true,
    `Retry textarea must receive focus on ${viewport}.`,
  );
  assert.equal(state.origin, "shared", `Retry must preserve shared origin on ${viewport}.`);
  assert.equal(
    state.consentChecked,
    false,
    `Retry must require fresh consent on ${viewport}.`,
  );
  assert.match(state.privacyNotice, /texto original não foi armazenado/i);
  assert.equal(state.statusRole, "status");
  assert.equal(state.statusLive, "polite");
}

async function closeRetryDialog(cdp) {
  await evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector("#new-inbox-message-dialog");
      if (dialog?.open) dialog.close();
      return true;
    })()`,
  );
}

async function waitFor(cdp, expression, timeoutMs = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(cdp, `Boolean(${expression})`)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function removeFixtures(databaseClient, ids) {
  if (ids.length === 0) return;
  await databaseClient.query(
    `delete from "AiSuggestion" where "sourceEntityId" = any($1::uuid[])`,
    [ids],
  );
  await databaseClient.query(`delete from "ImportBatch" where "id" = any($1::uuid[])`, [ids]);
}
