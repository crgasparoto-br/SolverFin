import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, setViewport, sleep } from "./cdp.mjs";
import { fixtureExpression, loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;

if (!chromePath) {
  throw new Error("CHROME_BIN is required for issue 530 keyboard validation.");
}

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let groupId;

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixtureIds = await evaluate(browser.cdp, fixtureExpression());
  const route =
    `/lancamentos?accountId=${encodeURIComponent(fixtureIds.longAccountId)}` + "&month=2026-07";

  await navigate(browser.cdp, `${baseUrl}${route}`);
  const created = await evaluate(
    browser.cdp,
    `(async () => {
      async function request(path, method, body) {
        const response = await fetch(path, {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(method + " " + path + " failed: " + JSON.stringify(payload));
        return payload;
      }
      const accountId = ${JSON.stringify(fixtureIds.longAccountId)};
      const members = [];
      for (const [index, amountMinor] of [7300, 9100].entries()) {
        members.push((await request("/api/transactions", "POST", {
          accountId,
          kind: "income",
          amountMinor,
          occurredOn: "2026-07-" + String(26 + index).padStart(2, "0"),
          plannedOn: "2026-07-" + String(26 + index).padStart(2, "0"),
          effectiveOn: "2026-07-" + String(26 + index).padStart(2, "0"),
          status: "posted",
          description: "QA issue 530 teclado membro " + (index + 1),
          currency: "BRL"
        })).transaction);
      }
      const group = (await request("/api/transaction-groups", "POST", {
        memberIds: members.map((member) => member.id),
        description: "QA issue 530 teclado",
        displayOn: "2026-07-27"
      })).group;
      return { groupId: group.id };
    })()`,
  );
  groupId = created.groupId;

  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(180);

  const prepared = await evaluate(
    browser.cdp,
    `(() => {
      const group = document.querySelector('[data-selection-entity="group"][value="${created.groupId}"]');
      const button = document.querySelector('[data-bulk-selection-action="reconcile"]');
      if (!group || !button) throw new Error('Issue 530 keyboard controls were not found.');
      group.checked = true;
      group.dispatchEvent(new Event('change', { bubbles: true }));
      window.confirm = () => true;
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        if (String(input).includes('/api/transactions/bulk-actions')) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return originalFetch(input, init);
      };
      window.__issue530NativeClick = false;
      button.addEventListener('click', () => { window.__issue530NativeClick = true; }, { once: true });
      button.focus();
      return {
        focused: document.activeElement === button,
        disabled: button.disabled,
        accessibleText: button.textContent.trim()
      };
    })()`,
  );
  assert.equal(prepared.focused, true);
  assert.equal(prepared.disabled, false);
  assert.match(prepared.accessibleText, /Marcar como conciliado/);

  const loaded = browser.cdp.once("Page.loadEventFired", 20_000);
  await browser.cdp.send("Page.bringToFront");
  const key = {
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  };
  await browser.cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    text: "\r",
    unmodifiedText: "\r",
    ...key,
  });
  await browser.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
  await sleep(60);

  const activation = await evaluate(
    browser.cdp,
    `(() => {
      const bar = document.querySelector('[data-selection-bar]');
      return {
        clickObserved: window.__issue530NativeClick === true,
        ariaBusy: bar.getAttribute('aria-busy'),
        status: bar.querySelector('[data-bulk-selection-status]').textContent.trim(),
        actionsDisabled: Array.from(bar.querySelectorAll('[data-bulk-selection-action]')).every((button) => button.disabled)
      };
    })()`,
  );
  assert.equal(activation.clickObserved, true, "Enter did not produce the native button click.");
  assert.equal(activation.ariaBusy, "true");
  assert.equal(activation.status, "Processando...");
  assert.equal(activation.actionsDisabled, true);

  await loaded;
  await sleep(140);
  const persisted = await evaluate(
    browser.cdp,
    `(() => {
      const row = document.querySelector('[data-group-row="${created.groupId}"]');
      return {
        groupPresent: Boolean(row),
        status: row?.querySelector('.grouped-status > .statement-status:not(.transaction-group-state)')?.getAttribute('aria-label') || ''
      };
    })()`,
  );
  assert.equal(persisted.groupPresent, true);
  assert.equal(persisted.status, "Conciliado");

  await writeFile(
    join(outputDir, "issue-530-keyboard-activation.json"),
    `${JSON.stringify({ prepared, activation, persisted }, null, 2)}\n`,
  );
} finally {
  if (groupId) {
    await evaluate(
      browser.cdp,
      `fetch("/api/transaction-groups/" + encodeURIComponent(${JSON.stringify(groupId)}), { method: "DELETE" })`,
    ).catch(() => undefined);
  }
  await browser.close(outputDir);
}
