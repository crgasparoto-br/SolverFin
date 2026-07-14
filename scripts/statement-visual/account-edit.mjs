import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { accountEditFixtureExpression, loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const diagnosticPath = join(outputDir, "issue-473-diagnostic.json");

if (!chromePath) throw new Error("CHROME_BIN is required for visual validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
const diagnostic = {
  commit: process.env.GITHUB_SHA ?? "local",
  generatedAt: new Date().toISOString(),
  stage: "browser-launched",
};
let evidence;

async function saveDiagnostic(values = {}) {
  Object.assign(diagnostic, values);
  await writeFile(diagnosticPath, `${JSON.stringify(diagnostic, null, 2)}\n`);
}

try {
  await setViewport(browser.cdp, 1366, 1000);
  await navigate(browser.cdp, `${baseUrl}/login`);
  await saveDiagnostic({ stage: "login-page-loaded" });

  const login = await evaluate(browser.cdp, loginExpression());
  await saveDiagnostic({ login, stage: "login-finished" });
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  const fixtureIds = await evaluate(browser.cdp, accountEditFixtureExpression());
  await saveDiagnostic({ fixtureIds, stage: "fixture-created" });
  const sourceRoute = `/lancamentos?accountId=${encodeURIComponent(fixtureIds.sourceAccountId)}&month=2026-07`;

  await navigate(browser.cdp, `${baseUrl}${sourceRoute}`);
  await sleep(350);
  await saveDiagnostic({ sourceRoute, stage: "source-statement-loaded" });

  const modalState = await evaluate(
    browser.cdp,
    `(() => {
      const editButton = document.querySelector('[data-edit="${fixtureIds.transactionId}"]');
      if (!editButton) throw new Error("Edit button for the issue #473 fixture was not found");
      editButton.click();
      const dialog = document.querySelector("[data-modal]");
      const form = document.querySelector("[data-form]");
      const field = document.querySelector("[data-edit-account-field]");
      const select = document.querySelector("[data-edit-account-select]");
      const hiddenInput = form && form.querySelector('input[name="accountId"]');
      const targetOption = select && Array.from(select.options).find((option) => option.value === "${fixtureIds.targetAccountId}");
      return {
        dialogOpen: Boolean(dialog && dialog.open),
        fieldVisible: Boolean(field && !field.hidden),
        selectEnabled: Boolean(select && !select.disabled),
        selectedAccountId: select ? select.value : "",
        targetOptionAvailable: Boolean(targetOption),
        hiddenInputDisabled: Boolean(hiddenInput && hiddenInput.disabled),
        guidance: dialog ? dialog.querySelector(".modal-panel > div .muted")?.textContent || "" : "",
        availableAccountIds: select ? Array.from(select.options).map((option) => option.value) : []
      };
    })()`,
  );
  await saveDiagnostic({ modalState, stage: "modal-state-captured" });

  assert.equal(modalState.dialogOpen, true);
  assert.equal(modalState.fieldVisible, true);
  assert.equal(modalState.selectEnabled, true);
  assert.equal(modalState.selectedAccountId, fixtureIds.sourceAccountId);
  assert.equal(modalState.targetOptionAvailable, true);
  assert.equal(modalState.hiddenInputDisabled, true);
  assert.match(modalState.guidance, /Revise a conta usada neste lançamento/);

  await screenshot(browser.cdp, join(outputDir, "issue-473-edit-account-before-save.png"));
  await saveDiagnostic({ stage: "before-save-screenshot-created" });

  const submitted = await evaluate(
    browser.cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      const select = document.querySelector("[data-edit-account-select]");
      const submitButton = form && form.querySelector('button[type="submit"]');
      if (!form || !select || !submitButton) throw new Error("Account edit form is incomplete");
      select.value = "${fixtureIds.targetAccountId}";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      form.requestSubmit();
      return { selectedAccountId: select.value, submitDisabled: submitButton.disabled };
    })()`,
  );
  await saveDiagnostic({ submitted, stage: "form-submitted" });

  assert.equal(submitted.selectedAccountId, fixtureIds.targetAccountId);
  assert.equal(submitted.submitDisabled, true);
  await sleep(1100);

  const persistence = await evaluate(
    browser.cdp,
    `(async () => {
      async function list(accountId) {
        const response = await fetch("/api/transactions?status=all&accountId=" + encodeURIComponent(accountId) + "&plannedTo=2026-07-31");
        const body = await response.json();
        if (!response.ok) throw new Error(JSON.stringify(body));
        return body.transactions || [];
      }
      const source = await list("${fixtureIds.sourceAccountId}");
      const target = await list("${fixtureIds.targetAccountId}");
      return {
        remainsInSource: source.some((item) => item.id === "${fixtureIds.transactionId}"),
        targetTransaction: target.find((item) => item.id === "${fixtureIds.transactionId}") || null
      };
    })()`,
  );
  await saveDiagnostic({ persistence, stage: "persistence-checked" });

  assert.equal(persistence.remainsInSource, false);
  assert.equal(persistence.targetTransaction?.accountId, fixtureIds.targetAccountId);

  const targetRoute = `/lancamentos?accountId=${encodeURIComponent(fixtureIds.targetAccountId)}&month=2026-07`;
  await navigate(browser.cdp, `${baseUrl}${targetRoute}`);
  await sleep(350);
  const visibleInTarget = await evaluate(
    browser.cdp,
    `Boolean(document.querySelector('[data-edit="${fixtureIds.transactionId}"]'))`,
  );
  await saveDiagnostic({ targetRoute, visibleInTarget, stage: "target-statement-checked" });
  assert.equal(visibleInTarget, true);
  await screenshot(browser.cdp, join(outputDir, "issue-473-edit-account-after-save.png"));

  evidence = {
    commit: process.env.GITHUB_SHA ?? "local",
    generatedAt: new Date().toISOString(),
    modalState,
    submitted,
    persistence,
    visibleInTarget,
    screenshots: [
      "issue-473-edit-account-before-save.png",
      "issue-473-edit-account-after-save.png",
    ],
  };
  await saveDiagnostic({ stage: "completed" });
} catch (error) {
  await saveDiagnostic({
    stage: "failed",
    failure: {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    },
  });
  throw error;
} finally {
  await browser.close(outputDir);
}

await writeFile(
  join(outputDir, "issue-473-account-edit.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
await writeFile(
  join(outputDir, "ISSUE-473.md"),
  `# Evidência visual e funcional da issue #473

- Commit: \`${evidence.commit}\`
- Modal aberto com campo Conta: **sim**
- Conta atual carregada do lançamento: **sim**
- Outra conta ativa disponível: **sim**
- Botão de salvar bloqueado durante o envio: **sim**
- Lançamento removido da conta anterior: **sim**
- Lançamento persistido e exibido na nova conta: **sim**

## Screenshots

- Antes do salvamento: \`issue-473-edit-account-before-save.png\`
- Depois do salvamento na nova conta: \`issue-473-edit-account-after-save.png\`
`,
);

console.log("Issue #473 account edit validation passed.");
