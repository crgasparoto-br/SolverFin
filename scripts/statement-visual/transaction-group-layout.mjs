import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { fixtureExpression, loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;

if (!chromePath) throw new Error("CHROME_BIN is required for transaction group layout validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let groupId;

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixtureIds = await evaluate(browser.cdp, fixtureExpression());
  const route = `/lancamentos?accountId=${encodeURIComponent(fixtureIds.longAccountId)}&month=2026-07`;

  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(300);
  groupId = await evaluate(
    browser.cdp,
    `(async () => {
      const candidates = Array.from(document.querySelectorAll("[data-select-transaction]:not(:disabled)"));
      const first = candidates.find((item) => item.dataset.kind === "income" && item.dataset.status === "posted");
      const second = candidates.find((item) => item !== first && item.dataset.kind === first.dataset.kind && item.dataset.status === first.dataset.status && item.dataset.currency === first.dataset.currency);
      if (!first || !second) throw new Error("Compatible transactions were not found for the layout fixture.");
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

  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(300);
  await openGroup(browser.cdp, groupId);
  const desktop = await measureLayout(browser.cdp);
  assert.equal(desktop.open, true, "Group modal did not open on desktop.");
  assert.ok(desktop.dialogWidth >= 1100, `Group modal remained narrow: ${desktop.dialogWidth}px.`);
  assert.equal(desktop.insideViewport, true, "Group modal escapes the desktop viewport.");
  assert.equal(desktop.panelHorizontalOverflow, false, "Group panel has horizontal overflow.");
  assert.equal(desktop.formHorizontalOverflow, false, "Group form has horizontal overflow.");
  assert.equal(desktop.membersHorizontalOverflow, false, "Group members have horizontal overflow.");
  await screenshot(browser.cdp, join(outputDir, "transaction-group-layout-desktop-1366x768.png"));

  await setViewport(browser.cdp, 390, 844);
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(300);
  await openGroup(browser.cdp, groupId);
  const mobile = await measureLayout(browser.cdp);
  assert.equal(mobile.open, true, "Group modal did not open on mobile.");
  assert.equal(mobile.insideViewport, true, "Group modal escapes the mobile viewport.");
  assert.equal(mobile.panelHorizontalOverflow, false, "Group panel has mobile horizontal overflow.");
  assert.equal(mobile.formHorizontalOverflow, false, "Group form has mobile horizontal overflow.");
  assert.equal(mobile.membersHorizontalOverflow, false, "Group members have mobile horizontal overflow.");
  await screenshot(browser.cdp, join(outputDir, "transaction-group-layout-mobile-390x844.png"));

  await writeFile(
    join(outputDir, "transaction-group-layout.json"),
    `${JSON.stringify({ groupId, desktop, mobile }, null, 2)}\n`,
  );
} finally {
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
  await sleep(120);
}

async function measureLayout(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector("[data-group-modal]");
      const panel = dialog.querySelector(".group-modal-panel");
      const form = dialog.querySelector("[data-group-form]");
      const members = dialog.querySelector("[data-group-members]");
      const rect = dialog.getBoundingClientRect();
      return {
        open: dialog.open,
        dialogWidth: Math.round(rect.width),
        dialogHeight: Math.round(rect.height),
        insideViewport: rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1,
        panelHorizontalOverflow: panel.scrollWidth > panel.clientWidth + 1,
        formHorizontalOverflow: form.scrollWidth > form.clientWidth + 1,
        membersHorizontalOverflow: members.scrollWidth > members.clientWidth + 1
      };
    })()`,
  );
}
