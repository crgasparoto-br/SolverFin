import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];

if (!chromePath) throw new Error("CHROME_BIN is required for Inbox list layout validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let report;
let fatalError;

try {
  report = await validateInboxListLayout(browser.cdp);
} catch (error) {
  fatalError = {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  failures.push({ message: fatalError.message, details: fatalError });
} finally {
  await browser.close(outputDir);
}

await writeFile(
  join(outputDir, "issue-522-inbox-list-layout.json"),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      commit: process.env.GITHUB_SHA ?? "local",
      browser: browser.version,
      failures,
      fatalError,
      ...report,
    },
    null,
    2,
  )}\n`,
);

if (failures.length) {
  failures.forEach((failure) => console.error(`- ${failure.message}`));
  if (fatalError?.stack) console.error(fatalError.stack);
  process.exitCode = 1;
} else {
  console.log("Inbox list layout validation passed.");
}

async function validateInboxListLayout(cdp) {
  await setViewport(cdp, 1280, 900);
  await navigate(cdp, `${baseUrl}/login`);
  const login = await evaluate(cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  const fixture = await evaluate(
    cdp,
    `(() => fetch('/api/accounts')
      .then(async (response) => ({ ok: response.ok, status: response.status, body: await response.json() }))
      .then(async (accountsResponse) => {
        if (!accountsResponse.ok) return accountsResponse;
        const account = (accountsResponse.body.accounts || []).find((item) => item.status === 'active');
        if (!account) return { ok: false, status: 0, body: { error: 'No active account available' } };
        const suffix = Date.now().toString(36);
        const content = [
          'date,description,amount',
          '2026-07-10,Linha rejeitada ' + suffix + ',-11.01',
          '2026-07-15,Descrição longa preservada integralmente ' + suffix + ',-22.02',
          '2026-07-20,Linha mais recente visível ' + suffix + ',-33.03'
        ].join('\\n');
        const createResponse = await fetch('/api/import-batches/csv', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            originalFileName: 'issue-522-' + suffix + '.csv',
            content,
            accountId: account.id,
            consentAccepted: true
          })
        });
        const body = await createResponse.json();
        if (!createResponse.ok) return { ok: false, status: createResponse.status, body };
        const detailResponse = await fetch('/api/import-batches/' + body.importBatch.id);
        const detail = await detailResponse.json();
        if (!detailResponse.ok) return { ok: false, status: detailResponse.status, body: detail };
        const rejected = (detail.suggestions || []).find((item) => item.payload?.occurredOn === '2026-07-10');
        if (!rejected) return { ok: false, status: 0, body: { error: 'Fixture row not found' } };
        const rejectResponse = await fetch('/api/import-batches/' + body.importBatch.id + '/suggestions/' + rejected.id + '/reject', {
          method: 'POST',
          headers: { 'content-type': 'application/json' }
        });
        return {
          ok: rejectResponse.ok,
          status: rejectResponse.status,
          body: await rejectResponse.json().catch(() => ({})),
          batchId: body.importBatch.id,
          suffix
        };
      }))()`,
  );
  assert.equal(
    fixture.ok,
    true,
    `Fixture failed: ${fixture.status} ${JSON.stringify(fixture.body)}`,
  );

  await navigate(cdp, `${baseUrl}/inbox?importBatchId=${encodeURIComponent(fixture.batchId)}`);
  await waitFor(
    cdp,
    `document.querySelectorAll('#import-batch-detail .import-row').length === 3 && Boolean(document.getElementById('inbox-date-start'))`,
  );

  const initial = await evaluate(
    cdp,
    `(() => ({
      bodyFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      controlsPresent: ['inbox-date-start', 'inbox-date-end', 'inbox-date-sort'].every((id) => Boolean(document.getElementById(id))),
      closeButtonsHaveIcons: [...document.querySelectorAll('.dialog-close-form button')].every((button) => Boolean(button.querySelector('svg')) && Boolean(button.title))
    }))()`,
  );
  check(initial.bodyFitsViewport, "Inbox overflows the desktop viewport", initial);
  check(initial.controlsPresent, "Date controls are missing", initial);
  check(
    initial.closeButtonsHaveIcons,
    "Dialog close buttons are missing icons or tooltips",
    initial,
  );

  await evaluate(
    cdp,
    `(() => {
      const start = document.getElementById('inbox-date-start');
      const end = document.getElementById('inbox-date-end');
      start.value = '2026-07-15';
      end.value = '2026-07-20';
      start.dispatchEvent(new Event('change', { bubbles: true }));
      end.dispatchEvent(new Event('change', { bubbles: true }));
    })()`,
  );
  await sleep(150);

  const filtered = await readListState(cdp);
  check(
    JSON.stringify(filtered.visibleDates) === JSON.stringify(["20/07/2026", "15/07/2026"]),
    "Date filtering or descending ordering is incorrect",
    filtered,
  );
  check(filtered.hiddenCount === 1, "The period should hide exactly one row", filtered);
  check(filtered.counter.includes("2 de 3"), "The visible row counter is incorrect", filtered);

  const bulk = await evaluate(
    cdp,
    `(() => {
      const master = document.getElementById('select-all-import-lines');
      master.click();
      const rows = [...document.querySelectorAll('#import-batch-detail .import-row')];
      const eligible = (row) => {
        const box = row.querySelector('[data-select-suggestion]');
        return box && !box.disabled;
      };
      return {
        visibleEligible: rows.filter((row) => !row.hidden && eligible(row)).length,
        visibleChecked: rows.filter((row) => !row.hidden && eligible(row) && row.querySelector('[data-select-suggestion]').checked).length,
        hiddenChecked: rows.some((row) => row.hidden && row.querySelector('[data-select-suggestion]')?.checked),
        summary: document.getElementById('selection-summary')?.textContent || '',
        masterChecked: master.checked,
        masterIndeterminate: master.indeterminate
      };
    })()`,
  );
  check(
    bulk.visibleEligible === 2 && bulk.visibleChecked === 2,
    "Bulk selection did not select all visible eligible rows",
    bulk,
  );
  check(!bulk.hiddenChecked, "Bulk selection included a hidden row", bulk);
  check(bulk.summary.includes("2 selecionada(s)"), "Selection summary is incorrect", bulk);
  check(
    bulk.masterChecked && !bulk.masterIndeterminate,
    "Master checkbox state is incorrect",
    bulk,
  );

  await evaluate(
    cdp,
    `(() => {
      const sort = document.getElementById('inbox-date-sort');
      sort.value = 'date_asc';
      sort.dispatchEvent(new Event('change', { bubbles: true }));
    })()`,
  );
  await sleep(100);
  const ascending = await readListState(cdp);
  check(
    JSON.stringify(ascending.visibleDates) === JSON.stringify(["15/07/2026", "20/07/2026"]),
    "Ascending ordering is incorrect",
    ascending,
  );

  await evaluate(
    cdp,
    `(() => {
      const filter = document.getElementById('import-line-filter');
      filter.value = 'rejected';
      filter.dispatchEvent(new Event('change', { bubbles: true }));
    })()`,
  );
  await waitFor(cdp, `document.querySelectorAll('#import-batch-detail .import-row').length === 1`);
  await sleep(100);
  const combined = await readListState(cdp);
  check(combined.visibleDates.length === 0, "Date and state filters did not combine", combined);
  check(combined.emptyVisible, "Combined filters did not display an empty state", combined);
  check(
    combined.selectionSummary.includes("0 selecionada(s)"),
    "Changing state filter retained invisible selections",
    combined,
  );
  check(
    combined.approveDisabled,
    "Bulk confirmation stayed enabled for invisible selections",
    combined,
  );
  check(
    !combined.masterChecked,
    "Master checkbox stayed selected after changing state filter",
    combined,
  );

  await evaluate(
    cdp,
    `(() => {
      const filter = document.getElementById('import-line-filter');
      filter.value = 'all';
      filter.dispatchEvent(new Event('change', { bubbles: true }));
    })()`,
  );
  await waitFor(cdp, `document.querySelectorAll('#import-batch-detail .import-row').length === 3`);
  await sleep(100);

  const longText = await evaluate(
    cdp,
    `(() => {
    const expectedDescription = 'Descrição longa preservada integralmente ${fixture.suffix}';
    const row = [...document.querySelectorAll('#import-batch-detail .import-row')].find((item) => item.textContent.includes(expectedDescription));
    if (!row) return { found: false, expectedDescription };
    const fields = [...row.querySelectorAll('.row-summary > div')];
    const descriptionEntry = fields.find((entry) => entry.querySelector('dt')?.textContent?.trim() === 'Descrição');
    const accountEntry = fields.find((entry) => entry.querySelector('dt')?.textContent?.trim() === 'Conta de referência');
    const dateEntry = fields.find((entry) => entry.querySelector('dt')?.textContent?.trim() === 'Data');
    const amountEntry = fields.find((entry) => entry.querySelector('dt')?.textContent?.trim() === 'Valor');
    const description = descriptionEntry?.querySelector('dd');
    const account = accountEntry?.querySelector('dd');
    const date = dateEntry?.querySelector('dd');
    const amount = amountEntry?.querySelector('dd');
    if (!description || !account || !accountEntry || !date || !amount) return { found: false, expectedDescription };
    const descriptionStyle = getComputedStyle(description);
    const accountStyle = getComputedStyle(account);
    const accountEntryStyle = getComputedStyle(accountEntry);
    const dateStyle = getComputedStyle(date);
    const amountStyle = getComputedStyle(amount);
    const accountRect = account.getBoundingClientRect();
    const accountEntryRect = accountEntry.getBoundingClientRect();
    return {
      found: true,
      expectedDescription,
      text: description.textContent || '',
      overflow: descriptionStyle.overflow,
      overflowWrap: descriptionStyle.overflowWrap,
      descriptionWidth: description.getBoundingClientRect().width,
      accountText: account.textContent || '',
      accountFieldDisplay: accountEntryStyle.display,
      accountValueWidth: accountRect.width,
      accountFieldWidth: accountEntryRect.width,
      accountValueHeight: accountRect.height,
      accountLineHeight: Number.parseFloat(accountStyle.lineHeight) || 0,
      dateText: date.textContent?.trim() || '',
      dateValueHeight: date.getBoundingClientRect().height,
      dateLineHeight: Number.parseFloat(dateStyle.lineHeight) || 0,
      amountText: amount.textContent?.trim() || '',
      amountValueHeight: amount.getBoundingClientRect().height,
      amountLineHeight: Number.parseFloat(amountStyle.lineHeight) || 0
    };
  })()`,
  );
  check(longText.found, "The exact long-description row was not found", longText);
  check(
    longText.text === longText.expectedDescription,
    "The exact long description is not available",
    longText,
  );
  check(longText.overflow !== "hidden", "The description remains truncated", longText);
  check(longText.overflowWrap === "anywhere", "The description does not wrap", longText);
  check(
    longText.descriptionWidth >= 150,
    "The description has insufficient readable width",
    longText,
  );
  check(longText.accountText.length > 0, "The reference account is not available", longText);
  check(
    longText.accountFieldDisplay === "grid",
    "The reference account field is not vertically organized",
    longText,
  );
  check(longText.accountValueWidth >= 120, "The reference account value is too narrow", longText);
  check(
    longText.accountValueWidth >= longText.accountFieldWidth * 0.8,
    "The reference account value does not use the field width",
    longText,
  );
  check(
    !longText.accountLineHeight || longText.accountValueHeight <= longText.accountLineHeight * 3.5,
    "The reference account breaks into too many lines",
    longText,
  );
  check(longText.dateText === "15/07/2026", "The expected date is not available", longText);
  check(
    !longText.dateLineHeight || longText.dateValueHeight <= longText.dateLineHeight * 1.5,
    "The date breaks into more than one line",
    longText,
  );
  check(longText.amountText.length > 0, "The amount is not available", longText);
  check(
    !longText.amountLineHeight || longText.amountValueHeight <= longText.amountLineHeight * 1.5,
    "The amount breaks into more than one line",
    longText,
  );

  const responsive = {};
  for (const [label, width] of [
    ["tablet", 900],
    ["mobile", 390],
  ]) {
    await setViewport(cdp, width, 900);
    await sleep(100);
    responsive[label] = await evaluate(
      cdp,
      `(() => {
      const row = document.querySelector('#import-batch-detail .import-row:not([hidden])');
      const accountEntry = [...row.querySelectorAll('.row-summary > div')].find((entry) => entry.querySelector('dt')?.textContent?.trim() === 'Conta de referência');
      const account = accountEntry?.querySelector('dd');
      const accountRect = account?.getBoundingClientRect();
      const accountEntryRect = accountEntry?.getBoundingClientRect();
      return {
        bodyFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        accountFieldDisplay: accountEntry ? getComputedStyle(accountEntry).display : '',
        accountValueWidth: accountRect?.width || 0,
        accountFieldWidth: accountEntryRect?.width || 0
      };
    })()`,
    );
    check(
      responsive[label].bodyFitsViewport,
      `Inbox overflows the ${label} viewport`,
      responsive[label],
    );
    check(
      responsive[label].accountFieldDisplay === "grid",
      `Reference account layout is inconsistent on ${label}`,
      responsive[label],
    );
    check(
      responsive[label].accountValueWidth >= responsive[label].accountFieldWidth * 0.8,
      `Reference account value is cramped on ${label}`,
      responsive[label],
    );
  }

  await setViewport(cdp, 1280, 900);
  await sleep(100);
  await screenshot(cdp, join(outputDir, "issue-522-inbox-list-layout.png"));
  return {
    fixture: { batchId: fixture.batchId },
    initial,
    filtered,
    bulk,
    ascending,
    combined,
    longText,
    responsive,
  };
}

async function readListState(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const rows = [...document.querySelectorAll('#import-batch-detail .import-row')];
      const dateOf = (row) => [...row.querySelectorAll('.row-summary > div')].find((entry) => entry.querySelector('dt')?.textContent?.trim() === 'Data')?.querySelector('dd')?.textContent?.trim() || '';
      return {
        visibleDates: rows.filter((row) => !row.hidden).map(dateOf),
        hiddenCount: rows.filter((row) => row.hidden).length,
        counter: document.getElementById('inbox-visible-lines')?.textContent || '',
        emptyVisible: Boolean(document.getElementById('inbox-date-empty-state')),
        selectionSummary: document.getElementById('selection-summary')?.textContent || '',
        approveDisabled: document.getElementById('approve-selected-import-lines')?.disabled ?? true,
        masterChecked: document.getElementById('select-all-import-lines')?.checked ?? false
      };
    })()`,
  );
}

async function waitFor(cdp, expression, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(cdp, expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

function check(condition, message, details) {
  if (!condition) failures.push({ message, details });
}
