import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const evidencePath = join(outputDir, "issue-564-category-learning.json");

if (!chromePath) throw new Error("CHROME_BIN is required for category learning validation.");

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
const evidence = {
  commit: process.env.GITHUB_SHA ?? "local",
  generatedAt: new Date().toISOString(),
  stage: "started",
};

async function saveEvidence(values = {}) {
  Object.assign(evidence, values);
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

try {
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  const fixtures = await createFixtures(browser.cdp);

  await navigate(browser.cdp, `${baseUrl}/configuracoes?section=rules`);
  await waitFor(
    browser.cdp,
    `Boolean(document.querySelector('[data-category-learning-panel]')) &&
     Boolean(document.querySelector('[data-learning-entry-id="${fixtures.ignoreEntryId}"]')) &&
     Boolean(document.querySelector('[data-learning-entry-id="${fixtures.revertEntryId}"]'))`,
  );

  const settingsBefore = await inspectSettings(browser.cdp, fixtures);
  assert.equal(settingsBefore.panelVisible, true, "Category learning panel must be visible.");
  assert.equal(settingsBefore.ignoreVisible, true, "Ignore action must be visible.");
  assert.equal(settingsBefore.revertVisible, true, "Revert action must be visible.");

  await evaluate(
    browser.cdp,
    `(() => {
      const button = document.querySelector('[data-apply-categorization]');
      if (!(button instanceof HTMLButtonElement)) throw new Error('Apply categorization button missing');
      button.click();
      return true;
    })()`,
  );
  await waitFor(
    browser.cdp,
    `document.querySelector('[data-learning-status]')?.textContent?.includes('sugestão(ões) criada(s)') === true`,
  );

  await clickLearningAction(browser.cdp, fixtures.ignoreEntryId, "ignore");
  await waitFor(
    browser.cdp,
    `document.querySelector('[data-learning-status]')?.textContent?.includes('Aprendizado ignorado.') === true`,
  );
  await clickLearningAction(browser.cdp, fixtures.revertEntryId, "revert");
  await waitFor(
    browser.cdp,
    `document.querySelector('[data-learning-status]')?.textContent?.includes('Aprendizado revertido.') === true`,
  );

  const settingsAfter = await inspectSettings(browser.cdp, fixtures);
  assert.equal(settingsAfter.ignoreStatus, "ignored", "Ignore action must persist ignored status.");
  assert.equal(
    settingsAfter.revertStatus,
    "reverted",
    "Revert action must persist reverted status.",
  );
  assert.equal(
    settingsAfter.activeButtonsForMutatedEntries,
    0,
    "Inactive learning must lose actions.",
  );
  await screenshot(
    browser.cdp,
    join(outputDir, "issue-564-category-learning-settings-desktop.png"),
  );

  await setViewport(browser.cdp, 390, 844);
  const settingsMobile = await inspectViewport(browser.cdp);
  assert.equal(
    settingsMobile.noHorizontalOverflow,
    true,
    "Learning settings must fit mobile viewport.",
  );
  await screenshot(browser.cdp, join(outputDir, "issue-564-category-learning-settings-mobile.png"));

  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/inbox`);
  await waitFor(
    browser.cdp,
    `document.body.innerText.includes('origem correção anterior') &&
     Boolean(document.querySelector('[data-correct-and-approve="${fixtures.correctionSuggestionId}"]'))`,
  );
  const inboxOrigin = await inspectInboxOrigin(browser.cdp, fixtures);
  assert.equal(
    inboxOrigin.learningOriginVisible,
    true,
    "Inbox must expose previous-correction origin.",
  );
  assert.equal(
    inboxOrigin.correctionButtonVisible,
    true,
    "Correction approval action must be visible.",
  );
  await screenshot(browser.cdp, join(outputDir, "issue-564-category-learning-inbox-desktop.png"));

  const learningCountBefore = await readLearningCount(browser.cdp);
  await setViewport(browser.cdp, 390, 844);
  await openCorrectionDialog(browser.cdp, fixtures.correctionSuggestionId, fixtures.categoryId);
  await installOneShotApprovalFailure(browser.cdp, fixtures.correctionSuggestionId);
  await submitCorrectionDialog(browser.cdp);
  await waitFor(
    browser.cdp,
    `document.querySelector('[data-category-correction-dialog] .form-status')?.textContent === 'Falha simulada issue 564'`,
  );
  const failedDialog = await inspectCorrectionDialog(browser.cdp, fixtures.categoryId);
  assert.equal(failedDialog.open, true, "Failed correction must keep dialog open.");
  assert.equal(
    failedDialog.categoryPreserved,
    true,
    "Failed correction must preserve category selection.",
  );
  assert.equal(failedDialog.submitEnabled, true, "Failed correction must re-enable submit.");
  assert.equal(failedDialog.fitsViewport, true, "Correction dialog must fit mobile viewport.");
  assert.equal(
    failedDialog.statusLive,
    true,
    "Correction error must remain in an aria-live status.",
  );
  await screenshot(
    browser.cdp,
    join(outputDir, "issue-564-category-learning-correction-failure-mobile.png"),
  );

  await restoreFetch(browser.cdp);
  await submitCorrectionDialog(browser.cdp);
  await waitFor(browser.cdp, `document.readyState === 'complete'`);
  await waitFor(
    browser.cdp,
    `!document.querySelector('[data-category-correction-dialog]') &&
     !document.querySelector('[data-correct-and-approve="${fixtures.correctionSuggestionId}"]')`,
  );
  const learningCountAfter = await readLearningCount(browser.cdp);
  assert.ok(
    learningCountAfter > learningCountBefore,
    `Successful correction must create learning (${learningCountBefore} -> ${learningCountAfter}).`,
  );

  await saveEvidence({
    stage: "passed",
    fixtures,
    settingsBefore,
    settingsAfter,
    settingsMobile,
    inboxOrigin,
    failedDialog,
    learningCountBefore,
    learningCountAfter,
  });
  console.log("Issue 564 category learning browser validation passed.");
} catch (error) {
  const failure = {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  await saveEvidence({ stage: "failed", failure });
  throw error;
} finally {
  await browser.close(outputDir);
}

async function createFixtures(cdp) {
  return evaluate(
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

      const suffix = Date.now().toString(36);
      const accountsBody = await request("/api/accounts");
      let account = accountsBody.accounts?.find((item) => item.status === "active");
      if (!account) {
        account = (await request("/api/accounts", "POST", {
          name: "QA Issue 564 - Conta visual " + suffix,
          kind: "checking",
          openingBalanceMinor: 0,
          currency: "BRL"
        })).account;
      }

      const categoriesBody = await request("/api/categories");
      let category = categoriesBody.categories?.find(
        (item) => item.status === "active" && item.kind === "expense"
      );
      if (!category) {
        category = (await request("/api/categories", "POST", {
          name: "QA Issue 564 - Categoria visual " + suffix,
          kind: "expense"
        })).category;
      }

      async function createMessage(label, amount) {
        const created = await request("/api/bank-message-inbox", "POST", {
          origin: "pasted",
          text: "Compra no cartao final 1234 em " + label + " " + suffix + " R$ " + amount + " em 05/08/2026",
          consentAccepted: true,
          accountId: account.id
        });
        const messageId = created.message?.id;
        let suggestionId = created.message?.suggestion?.id;
        if (!suggestionId && messageId) {
          const listing = await request("/api/bank-message-inbox?status=all");
          suggestionId = listing.messages?.find((item) => item.id === messageId)?.suggestion?.id;
        }
        if (!messageId || !suggestionId) throw new Error("Bank message fixture did not create a suggestion.");
        return { messageId, suggestionId };
      }

      const ignoreSource = await createMessage("Mercado aprendizado ignorar", "42,50");
      const revertSource = await createMessage("Farmacia aprendizado reverter", "38,90");
      const correctionSource = await createMessage("Livraria corrigir aprovar", "57,40");

      const ignoreEntry = await request("/api/category-learning/corrections", "POST", {
        suggestionId: ignoreSource.suggestionId,
        categoryId: category.id
      });
      const revertEntry = await request("/api/category-learning/corrections", "POST", {
        suggestionId: revertSource.suggestionId,
        categoryId: category.id
      });

      return {
        suffix,
        accountId: account.id,
        categoryId: category.id,
        ignoreEntryId: ignoreEntry.id,
        revertEntryId: revertEntry.id,
        ignoreSuggestionId: ignoreSource.suggestionId,
        correctionSuggestionId: correctionSource.suggestionId
      };
    })()`,
  );
}

async function clickLearningAction(cdp, entryId, action) {
  await evaluate(
    cdp,
    `(() => {
      window.confirm = () => true;
      const button = document.querySelector('[data-learning-entry-id="${entryId}"][data-learning-action="${action}"]');
      if (!(button instanceof HTMLButtonElement)) throw new Error('Learning action ${action} missing');
      button.click();
      return true;
    })()`,
  );
}

async function inspectSettings(cdp, fixtures) {
  return evaluate(
    cdp,
    `(async () => {
      const entriesBody = await fetch("/api/category-learning?status=all").then((response) => response.json());
      const entries = Array.isArray(entriesBody.entries) ? entriesBody.entries : [];
      const ignoreEntry = entries.find((item) => item.id === ${JSON.stringify(fixtures.ignoreEntryId)});
      const revertEntry = entries.find((item) => item.id === ${JSON.stringify(fixtures.revertEntryId)});
      return {
        panelVisible: Boolean(document.querySelector('[data-category-learning-panel]')),
        ignoreVisible: Boolean(document.querySelector('[data-learning-entry-id="${fixtures.ignoreEntryId}"][data-learning-action="ignore"]')),
        revertVisible: Boolean(document.querySelector('[data-learning-entry-id="${fixtures.revertEntryId}"][data-learning-action="revert"]')),
        ignoreStatus: ignoreEntry?.status,
        revertStatus: revertEntry?.status,
        activeButtonsForMutatedEntries: document.querySelectorAll(
          '[data-learning-entry-id="${fixtures.ignoreEntryId}"], [data-learning-entry-id="${fixtures.revertEntryId}"]'
        ).length
      };
    })()`,
  );
}

async function inspectViewport(cdp) {
  await sleep(150);
  return evaluate(
    cdp,
    `(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth
    }))()`,
  );
}

async function inspectInboxOrigin(cdp, fixtures) {
  return evaluate(
    cdp,
    `(async () => {
      const queue = await fetch("/api/ai-review-queue?status=pending_review&includeLowConfidence=true").then(
        (response) => response.json()
      );
      const suggestions = Array.isArray(queue.suggestions) ? queue.suggestions : [];
      const learningItem = suggestions.find((item) => item.provider === "solverfin-learning");
      const learningRow = learningItem
        ? document.querySelector('[data-review-id="' + CSS.escape(learningItem.id) + '"]')
        : undefined;
      return {
        learningCategorizationId: learningItem?.id,
        learningOriginVisible: Boolean(
          learningRow && (learningRow.textContent || '').includes('origem correção anterior')
        ),
        correctionButtonVisible: Boolean(
          document.querySelector(
            '[data-correct-and-approve="${fixtures.correctionSuggestionId}"]'
          )
        )
      };
    })()`,
  );
}

async function openCorrectionDialog(cdp, suggestionId, categoryId) {
  await evaluate(
    cdp,
    `(() => {
      const button = document.querySelector('[data-correct-and-approve="${suggestionId}"]');
      if (!(button instanceof HTMLButtonElement)) throw new Error('Correction button missing');
      button.click();
      const dialog = document.querySelector('[data-category-correction-dialog]');
      const select = dialog?.querySelector('select');
      if (!(dialog instanceof HTMLDialogElement) || !(select instanceof HTMLSelectElement)) {
        throw new Error('Correction dialog did not open');
      }
      select.value = ${JSON.stringify(categoryId)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
  );
  await waitFor(cdp, `document.querySelector('[data-category-correction-dialog]')?.open === true`);
}

async function installOneShotApprovalFailure(cdp, suggestionId) {
  await evaluate(
    cdp,
    `(() => {
      const originalFetch = window.fetch.bind(window);
      window.__issue564OriginalFetch = originalFetch;
      let failed = false;
      window.fetch = async (...args) => {
        const raw = args[0];
        const url = raw instanceof Request ? raw.url : String(raw);
        if (!failed && url.includes('/api/ai-review-queue/${suggestionId}/approve')) {
          failed = true;
          return new Response(JSON.stringify({ error: { message: 'Falha simulada issue 564' } }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }
        return originalFetch(...args);
      };
      return true;
    })()`,
  );
}

async function restoreFetch(cdp) {
  await evaluate(
    cdp,
    `(() => {
      if (typeof window.__issue564OriginalFetch === 'function') {
        window.fetch = window.__issue564OriginalFetch;
        delete window.__issue564OriginalFetch;
      }
      return true;
    })()`,
  );
}

async function submitCorrectionDialog(cdp) {
  await evaluate(
    cdp,
    `(() => {
      const form = document.querySelector('[data-category-correction-dialog] form.edit-grid');
      if (!(form instanceof HTMLFormElement)) throw new Error('Correction form missing');
      form.requestSubmit();
      return true;
    })()`,
  );
}

async function inspectCorrectionDialog(cdp, categoryId) {
  return evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector('[data-category-correction-dialog]');
      const select = dialog?.querySelector('select');
      const submit = dialog?.querySelector('button[type="submit"]');
      const status = dialog?.querySelector('.form-status');
      const rect = dialog?.getBoundingClientRect();
      return {
        open: dialog instanceof HTMLDialogElement && dialog.open,
        categoryPreserved: select instanceof HTMLSelectElement && select.value === ${JSON.stringify(categoryId)},
        submitEnabled: submit instanceof HTMLButtonElement && !submit.disabled,
        statusLive: status?.getAttribute('aria-live') === 'polite',
        fitsViewport: Boolean(
          rect && rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight
        )
      };
    })()`,
  );
}

async function readLearningCount(cdp) {
  return evaluate(
    cdp,
    `(async () => {
      const response = await fetch("/api/category-learning?status=all");
      const payload = await response.json();
      return Array.isArray(payload.entries) ? payload.entries.length : 0;
    })()`,
  );
}

async function waitFor(cdp, expression, timeoutMs = 8_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(cdp, `Boolean(${expression})`)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}
