import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { fixtureExpression, loginExpression } from "./fixtures.mjs";
import {
  assertGroupFormGeometry,
  formRowCounts,
  measureGroupFormGeometry,
} from "./form-geometry.mjs";
import { validateGoldenStatement } from "./golden-statement.mjs";
import { installLateDomFieldProbe } from "./late-dom-field-probe.mjs";
import { validateStatementRefinements } from "./statement-refinements.mjs";
import { validateStatementContextualSurfaces } from "./statement-contextual-surfaces.mjs";
import { validateStatementAlternativeStates } from "./statement-alternative-states.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const subjectSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

if (!chromePath) throw new Error("CHROME_BIN is required for transaction group layout validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
const report = { subjectSha, scope: "real-application", status: "running", controls: [] };
let groupId;

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixtureIds = await evaluate(browser.cdp, fixtureExpression());
  const route = `/lancamentos?accountId=${encodeURIComponent(fixtureIds.longAccountId)}&month=2026-07`;
  report.route = route;

  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(300);
  await validateGoldenStatement(browser.cdp, { baseUrl, route, outputDir });
  await validateStatementRefinements(browser.cdp, { baseUrl, route, outputDir });
  groupId = await evaluate(
    browser.cdp,
    `(async () => {
      const candidates = Array.from(document.querySelectorAll("[data-select-transaction]:not(:disabled)"));
      const first = candidates.find((item) => item.dataset.kind === "income" && item.dataset.status === "posted");
      if (!first) throw new Error("Compatible transactions were not found for the layout fixture.");
      const second = candidates.find((item) => item !== first && item.dataset.kind === first.dataset.kind && item.dataset.status === first.dataset.status && item.dataset.currency === first.dataset.currency);
      if (!second) throw new Error("Compatible transactions were not found for the layout fixture.");
      const response = await fetch("/api/transaction-groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          memberIds: [first.value, second.value],
          description: "QA layout amplo do agrupamento",
          displayOn: "2026-07-28"
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("Group creation failed: " + JSON.stringify(payload));
      return payload.group.id;
    })()`,
  );
  report.groupId = groupId;
  await validateStatementContextualSurfaces(browser.cdp, { baseUrl, route, outputDir, groupId });
  await validateStatementAlternativeStates(browser.cdp, { baseUrl, route, outputDir });

  for (const [width, height, name] of [
    [1366, 768, "desktop"],
    [390, 844, "mobile"],
    [320, 740, "mobileNarrow"],
  ]) {
    await setViewport(browser.cdp, width, height);
    await navigate(browser.cdp, `${baseUrl}${route}`);
    await sleep(300);
    await openGroup(browser.cdp, groupId);
    const layout = await measureLayout(browser.cdp);
    report[name] = layout;
    const desktop = width > 760;
    assert.equal(layout.open, true, "Group modal did not open.");
    if (desktop) {
      assert.ok(layout.dialogWidth >= 640, `Group modal is too narrow: ${layout.dialogWidth}px.`);
      assert.ok(layout.dialogWidth <= 780, `Group modal became too wide: ${layout.dialogWidth}px.`);
    }
    assertGroupFormGeometry(layout.formGeometry, desktop ? 2 : 1);
    assert.equal(layout.insideViewport, true, "Group modal escapes the viewport.");
    assert.equal(layout.panelHorizontalOverflow, false, "Group panel has horizontal overflow.");
    assert.equal(layout.formHorizontalOverflow, false, "Group form has horizontal overflow.");
    assert.equal(layout.membersHorizontalOverflow, false, "Group members overflow horizontally.");
    assert.equal(layout.memberCount, 2, "Group members were not rendered.");
    assert.ok(layout.membersHeight >= (desktop ? 120 : 220), "Member list is too short.");
    assert.ok(layout.minimumRowHeight >= (desktop ? 44 : 72), "Group rows collapsed.");
    assert.equal(layout.membersOverlapActions, false, "Group members overlap the actions.");
    const viewportName = desktop ? "desktop" : "mobile";
    await screenshot(
      browser.cdp,
      join(outputDir, `transaction-group-layout-${viewportName}-${width}x${height}.png`),
    );
    if (desktop) await negativeControls(browser.cdp, report.controls);
  }
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.message : String(error);
  await screenshot(browser.cdp, join(outputDir, "transaction-group-layout-failure.png"));
  throw error;
} finally {
  await writeFile(
    join(outputDir, "transaction-group-layout.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  if (groupId) {
    await evaluate(
      browser.cdp,
      `fetch("/api/transaction-groups/${encodeURIComponent(groupId)}", { method: "DELETE" })`,
    ).catch(() => undefined);
  }
  await browser.close(outputDir);
}

async function openGroup(cdp, id) {
  const opened = await evaluate(
    cdp,
    `(() => {
      const button = document.querySelector('[data-group-details="${id}"]');
      if (!button) throw new Error("Group details button not found.");
      button.click();
      return document.querySelector("[data-group-modal]").open;
    })()`,
  );
  assert.equal(opened, true);
  await sleep(180);
}

async function measureGeometry(cdp) {
  return evaluate(cdp, `(${measureGroupFormGeometry.toString()})()`);
}

async function negativeControls(cdp, controls) {
  const mutations = [
    {
      id: "GS-GROUP-NC-THREE-COLUMNS",
      css: `dialog[data-group-modal] .group-modal-panel form[data-group-form]{grid-template-columns:repeat(3,minmax(0,1fr))!important}dialog[data-group-modal] .group-modal-panel form[data-group-form]>label{grid-column:auto!important}`,
      expected: /columns/,
    },
    {
      id: "GS-GROUP-NC-MONEY-CLIPPING",
      css: `[data-group-effective-input]{width:16px!important;white-space:nowrap!important;overflow:hidden!important}`,
      expected: /Financial values/,
    },
    {
      id: "GS-GROUP-NC-LABEL-OVERFLOW",
      css: `dialog[data-group-modal] .group-modal-panel form[data-group-form]>label{width:24px!important;white-space:nowrap!important}`,
      expected: /labels/,
    },
  ];
  for (const mutation of mutations) {
    await evaluate(
      cdp,
      `(() => {const style=document.createElement('style');style.id='group-negative-control';
        style.textContent=${JSON.stringify(mutation.css)};document.head.append(style);})()`,
    );
    let observed;
    try {
      const geometry = await measureGeometry(cdp);
      assert.throws(() => assertGroupFormGeometry(geometry, 2), mutation.expected);
      observed = geometry;
    } finally {
      await evaluate(cdp, "document.getElementById('group-negative-control')?.remove()");
    }
    assertGroupFormGeometry(await measureGeometry(cdp), 2);
    controls.push({ id: mutation.id, status: "passed", observed, restored: "passed" });
  }
  await evaluate(
    cdp,
    `(() => {const input=document.querySelector('[data-group-currency-input]');
      const copy=input.closest('label').cloneNode(true);copy.id='group-negative-currency';
      document.querySelector('[data-group-form]').append(copy);})()`,
  );
  try {
    const duplicate = await measureGeometry(cdp);
    assert.throws(() => assertGroupFormGeometry(duplicate, 2), /currency/);
  } finally {
    await evaluate(cdp, "document.getElementById('group-negative-currency')?.remove()");
  }
  assertGroupFormGeometry(await measureGeometry(cdp), 2);
  controls.push({ id: "GS-GROUP-NC-DUPLICATE-CURRENCY", status: "passed", restored: "passed" });

  await evaluate(cdp, `(${installLateDomFieldProbe.toString()})()`);
  try {
    const late = await measureGeometry(cdp);
    assert.deepEqual(late.labelCollisions, [], "Late-field control must isolate column overflow.");
    assert.equal(Math.max(...formRowCounts(late.fields).map((row) => row.count)), 3);
    assert.throws(() => assertGroupFormGeometry(late, 2), /columns/);
  } finally {
    await evaluate(cdp, `document.getElementById('group-negative-late-field')?.restoreProbe()`);
  }
  assertGroupFormGeometry(await measureGeometry(cdp), 2);
  controls.push({ id: "GS-GROUP-NC-LATE-DOM-FIELD", status: "passed", restored: "passed" });
}

async function measureLayout(cdp) {
  const layout = await evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector("[data-group-modal]");
      const panel = dialog.querySelector(".group-modal-panel");
      const form = dialog.querySelector("[data-group-form]");
      const members = dialog.querySelector("[data-group-members]");
      const actions = dialog.querySelector(".group-actions");
      const rows = Array.from(members.querySelectorAll("[data-group-member]"));
      const rect = dialog.getBoundingClientRect();
      const membersRect = members.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      const rowHeights = rows.map((row) => row.getBoundingClientRect().height);
      return {
        open: dialog.open,
        dialogWidth: Math.round(rect.width),
        dialogHeight: Math.round(rect.height),
        insideViewport: rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1,
        panelHorizontalOverflow: panel.scrollWidth > panel.clientWidth + 1,
        formHorizontalOverflow: form.scrollWidth > form.clientWidth + 1,
        membersHorizontalOverflow: members.scrollWidth > members.clientWidth + 1,
        memberCount: rows.length,
        membersHeight: Math.round(membersRect.height),
        minimumRowHeight: Math.round(Math.min(...rowHeights)),
        membersOverlapActions: membersRect.bottom > actionsRect.top + 1
      };
    })()`,
  );
  layout.formGeometry = await measureGeometry(cdp);
  layout.formRows = formRowCounts(layout.formGeometry.fields);
  layout.formColumns = Math.max(...layout.formRows.map((row) => row.count));
  return layout;
}
