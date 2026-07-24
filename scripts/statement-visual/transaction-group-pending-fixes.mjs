import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  evaluate,
  launchChrome,
  navigate,
  setViewport,
  sleep,
} from "./cdp.mjs";
import { fixtureExpression, loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir =
  process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;

if (!chromePath)
  throw new Error(
    "CHROME_BIN is required for transaction group pending fixes validation.",
  );
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let groupId;

try {
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(
    login.ok,
    true,
    `Demo login failed: ${login.status} ${login.body}`,
  );
  const fixtureIds = await evaluate(browser.cdp, fixtureExpression());
  const route = `/lancamentos?accountId=${encodeURIComponent(fixtureIds.longAccountId)}&month=2026-07`;

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
      const descriptions = ["X".repeat(240), "QA projeção membro 2", "QA projeção membro 3"];
      const amounts = [10000, 20000, 30000];
      const members = [];
      for (let index = 0; index < amounts.length; index += 1) {
        members.push((await request("/api/transactions", "POST", {
          accountId,
          kind: "income",
          amountMinor: amounts[index],
          occurredOn: "2026-07-" + String(26 + index).padStart(2, "0"),
          plannedOn: "2026-07-" + String(26 + index).padStart(2, "0"),
          effectiveOn: "2026-07-" + String(26 + index).padStart(2, "0"),
          status: "posted",
          description: descriptions[index],
          currency: "BRL"
        })).transaction);
      }
      const trailing = (await request("/api/transactions", "POST", {
        accountId,
        kind: "income",
        amountMinor: 4000,
        occurredOn: "2026-07-29",
        plannedOn: "2026-07-29",
        effectiveOn: "2026-07-29",
        status: "posted",
        description: "QA linha posterior ao agrupamento",
        currency: "BRL"
      })).transaction;
      const group = (await request("/api/transaction-groups", "POST", {
        memberIds: members.map((member) => member.id),
        description: "QA projeção imediata do agrupamento",
        displayOn: "2026-07-28"
      })).group;
      return { groupId: group.id, memberIds: members.map((member) => member.id), trailingId: trailing.id };
    })()`,
  );
  groupId = created.groupId;

  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(250);

  await evaluate(
    browser.cdp,
    `document.querySelector('[data-group-details="${created.groupId}"]').focus()`,
  );
  await pressKey(browser.cdp, "Enter", "Enter", 13);
  await sleep(120);
  const keyboardOpen = await evaluate(
    browser.cdp,
    `(() => {
      const modal = document.querySelector("[data-group-modal]");
      return { open: modal.open, focusInside: modal.contains(document.activeElement) };
    })()`,
  );
  assert.equal(
    keyboardOpen.open,
    true,
    "The group modal did not open with Enter.",
  );
  assert.equal(
    keyboardOpen.focusInside,
    true,
    "Focus did not move into the opened group modal.",
  );

  await pressKey(browser.cdp, "Tab", "Tab", 9);
  const tabState = await evaluate(
    browser.cdp,
    `document.querySelector("[data-group-modal]").contains(document.activeElement)`,
  );
  assert.equal(tabState, true, "Tab moved focus outside the open group modal.");

  await pressKey(browser.cdp, "Escape", "Escape", 27);
  await sleep(80);
  const keyboardClose = await evaluate(
    browser.cdp,
    `(() => ({
      open: document.querySelector("[data-group-modal]").open,
      restored: document.activeElement === document.querySelector('[data-group-details="${created.groupId}"]')
    }))()`,
  );
  assert.equal(
    keyboardClose.open,
    false,
    "Escape did not close the group modal.",
  );
  assert.equal(
    keyboardClose.restored,
    true,
    "Focus was not restored to the group details button.",
  );

  await pressKey(browser.cdp, "Enter", "Enter", 13);
  await sleep(100);
  await evaluate(
    browser.cdp,
    `document.querySelector('[data-member-id="${created.memberIds[0]}"][data-member-action="clone"]').focus()`,
  );
  await pressKey(browser.cdp, "Enter", "Enter", 13);
  await sleep(100);
  const cloneDescription = await evaluate(
    browser.cdp,
    `(() => {
      const input = document.querySelector('[data-form] [name="description"]');
      return {
        modalOpen: document.querySelector("[data-modal]").open,
        length: input.value.length,
        maxLength: input.maxLength,
        prefix: input.value.startsWith("Cópia de ")
      };
    })()`,
  );
  assert.equal(
    cloneDescription.modalOpen,
    true,
    "Clone form did not open by keyboard.",
  );
  assert.equal(cloneDescription.maxLength, 240);
  assert.equal(
    cloneDescription.length,
    240,
    "Clone description was not limited to 240 characters.",
  );
  assert.equal(cloneDescription.prefix, true);

  await pressKey(browser.cdp, "Escape", "Escape", 27);
  await sleep(100);
  assert.equal(
    await evaluate(
      browser.cdp,
      `document.querySelector("[data-group-modal]").open`,
    ),
    true,
    "Closing the clone form did not restore the group modal.",
  );

  const beforeEdit = await readProjection(browser.cdp, created.groupId);
  await evaluate(
    browser.cdp,
    `document.querySelector('[data-member-id="${created.memberIds[0]}"][data-member-action="edit"]').focus()`,
  );
  await pressKey(browser.cdp, "Enter", "Enter", 13);
  await sleep(80);
  await evaluate(
    browser.cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      form.amountMinor.value = "150,00";
      form.description.value = "QA membro alterado com projeção imediata";
      form.querySelector('[type="submit"]').focus();
      return true;
    })()`,
  );
  await pressKey(browser.cdp, "Enter", "Enter", 13);
  await sleep(450);

  const afterEdit = await readProjection(browser.cdp, created.groupId);
  assert.equal(afterEdit.groupTotalMinor, 65000);
  assert.equal(afterEdit.rowProjectionMinor, 65000);
  assert.equal(
    afterEdit.groupBalanceMinor - beforeEdit.groupBalanceMinor,
    5000,
  );
  assert.equal(
    afterEdit.followingBalanceMinor - beforeEdit.followingBalanceMinor,
    5000,
  );
  assert.match(afterEdit.amountText, /650,00/);

  await evaluate(browser.cdp, `window.confirm = () => true`);
  await evaluate(
    browser.cdp,
    `document.querySelector('[data-group-action="status"]').focus()`,
  );
  await pressKey(browser.cdp, "Enter", "Enter", 13);
  await sleep(250);
  const reconciledProjection = await readProjection(
    browser.cdp,
    created.groupId,
  );
  assert.equal(reconciledProjection.groupStatus, "reconciled");
  assert.equal(reconciledProjection.rowStatus, "Conciliado");

  const beforeDelete = reconciledProjection;
  await evaluate(
    browser.cdp,
    `document.querySelector('[data-member-id="${created.memberIds[2]}"][data-member-action="void"]').focus()`,
  );
  await pressKey(browser.cdp, "Enter", "Enter", 13);
  await sleep(250);
  const afterDelete = await readProjection(browser.cdp, created.groupId);
  assert.equal(afterDelete.memberCount, 2);
  assert.equal(afterDelete.groupTotalMinor, 35000);
  assert.equal(afterDelete.rowProjectionMinor, 35000);
  assert.equal(
    afterDelete.groupBalanceMinor - beforeDelete.groupBalanceMinor,
    -30000,
  );
  assert.equal(
    afterDelete.followingBalanceMinor - beforeDelete.followingBalanceMinor,
    -30000,
  );
  assert.match(afterDelete.memberCountText, /^2 lançamentos agrupados$/);
  assert.equal(afterDelete.rowStatus, "Conciliado");

  await pressKey(browser.cdp, "Escape", "Escape", 27);
  await sleep(80);
  const finalKeyboardState = await evaluate(
    browser.cdp,
    `(() => ({
      modalOpen: document.querySelector("[data-group-modal]").open,
      focusRestored: document.activeElement === document.querySelector('[data-group-details="${created.groupId}"]')
    }))()`,
  );
  assert.equal(finalKeyboardState.modalOpen, false);
  assert.equal(finalKeyboardState.focusRestored, true);

  await writeFile(
    join(outputDir, "transaction-group-pending-fixes.json"),
    `${JSON.stringify(
      {
        keyboardOpen,
        keyboardClose,
        cloneDescription,
        beforeEdit,
        afterEdit,
        reconciledProjection,
        afterDelete,
        finalKeyboardState,
      },
      null,
      2,
    )}\n`,
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

async function pressKey(cdp, key, code, virtualKeyCode) {
  const params = {
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
  };
  const text = key === "Enter" ? "\r" : undefined;
  await cdp.send("Input.dispatchKeyEvent", {
    type: text ? "keyDown" : "rawKeyDown",
    ...params,
    ...(text ? { text, unmodifiedText: text } : {}),
  });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...params });
}

async function readProjection(cdp, currentGroupId) {
  return evaluate(
    cdp,
    `(() => {
      function moneyToMinor(value) {
        const normalized = String(value || "")
          .replace(/[^0-9,.-]/g, "")
          .replace(/\\./g, "")
          .replace(",", ".");
        return Math.round(Number(normalized) * 100);
      }
      const row = document.querySelector('[data-group-row="${currentGroupId}"]');
      let following = row.nextElementSibling;
      while (following && !following.matches(".statement-row.statement-body")) following = following.nextElementSibling;
      if (!following) throw new Error("A following statement row was not found for balance projection validation.");
      const group = JSON.parse(row.querySelector('script[data-group="${currentGroupId}"]').textContent);
      return {
        groupTotalMinor: group.totalAmountMinor,
        groupStatus: group.status,
        memberCount: group.members.length,
        rowProjectionMinor: Number(row.dataset.groupProjectionAmountMinor),
        rowStatus: row.querySelector(".col-status").getAttribute("aria-label"),
        amountText: row.querySelector(".col-amount").textContent,
        memberCountText: row.querySelector(".col-description span").textContent,
        groupBalanceMinor: row.querySelector(".col-balance").dataset.balanceMinor === undefined
          ? moneyToMinor(row.querySelector(".col-balance").textContent)
          : Number(row.querySelector(".col-balance").dataset.balanceMinor),
        followingBalanceMinor: following.querySelector(".col-balance").dataset.balanceMinor === undefined
          ? moneyToMinor(following.querySelector(".col-balance").textContent)
          : Number(following.querySelector(".col-balance").dataset.balanceMinor)
      };
    })()`,
  );
}
