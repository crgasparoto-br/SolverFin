import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { fixtureExpression, loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;

if (!chromePath) throw new Error("CHROME_BIN is required for transaction group validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let groupIds = [];

try {
  await setViewport(browser.cdp, 1366, 1000);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixtureIds = await evaluate(browser.cdp, fixtureExpression());
  const route = `/lancamentos?accountId=${encodeURIComponent(fixtureIds.longAccountId)}&month=2026-07`;

  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(300);
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
      const accountId = ${JSON.stringify("PLACEHOLDER_ACCOUNT_ID")}.replace("PLACEHOLDER_ACCOUNT_ID", ${JSON.stringify("PLACEHOLDER_ACCOUNT_ID")});
      const candidates = Array.from(document.querySelectorAll("[data-select-transaction]:not(:disabled)"));
      const first = candidates.find((item) => item.dataset.kind === "income" && item.dataset.status === "posted");
      const second = candidates.find((item) => item !== first && item.dataset.kind === first.dataset.kind && item.dataset.status === first.dataset.status && item.dataset.currency === first.dataset.currency);
      if (!first || !second) throw new Error("Compatible transactions were not found for the visual group fixture.");
      const third = (await request("/api/transactions", "POST", {
        accountId,
        kind: "income",
        amountMinor: 9876,
        occurredOn: "2026-07-27",
        plannedOn: "2026-07-27",
        effectiveOn: "2026-07-27",
        status: "posted",
        description: "QA terceiro membro do agrupamento",
        currency: first.dataset.currency
      })).transaction;
      const postedGroup = (await request("/api/transaction-groups", "POST", {
        memberIds: [first.value, second.value, third.id],
        description: "QA modal agrupamento efetivado",
        displayOn: "2026-07-28"
      })).group;
      const plannedOne = (await request("/api/transactions", "POST", {
        accountId,
        kind: "expense",
        amountMinor: 32100,
        occurredOn: "2026-07-29",
        plannedOn: "2026-07-29",
        effectiveOn: null,
        status: "planned",
        description: "QA grupo previsto 1",
        currency: "BRL"
      })).transaction;
      const plannedTwo = (await request("/api/transactions", "POST", {
        accountId,
        kind: "expense",
        amountMinor: 65400,
        occurredOn: "2026-07-30",
        plannedOn: "2026-07-30",
        effectiveOn: null,
        status: "planned",
        description: "QA grupo previsto 2",
        currency: "BRL"
      })).transaction;
      const plannedGroup = (await request("/api/transaction-groups", "POST", {
        memberIds: [plannedOne.id, plannedTwo.id],
        description: "QA modal agrupamento previsto",
        displayOn: "2026-07-30"
      })).group;
      return { postedGroupId: postedGroup.id, plannedGroupId: plannedGroup.id, thirdMemberId: third.id };
    })()`.replaceAll('"PLACEHOLDER_ACCOUNT_ID"', JSON.stringify(fixtureIds.longAccountId)),
  );
  groupIds = [created.postedGroupId, created.plannedGroupId];

  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(300);
  await openGroup(browser.cdp, created.postedGroupId);
  const desktop = await measureGroupModal(browser.cdp);
  assert.equal(desktop.open, true, "Posted group modal did not open.");
  assert.equal(desktop.currency, "BRL", "Currency field is not rendered in the group modal.");
  assert.equal(desktop.memberCount, 3, "Posted group modal does not show all members.");
  assert.equal(desktop.actionCount, 13, "Expected row and group actions are not available.");
  assert.equal(desktop.horizontalOverflow, false, "Group modal has horizontal overflow on desktop.");
  assert.equal(desktop.accessibleActionCount, 13, "Every group action must have an accessible name.");
  await screenshot(browser.cdp, join(outputDir, "transaction-group-modal-desktop.png"));

  const editFlow = await openMemberFlow(browser.cdp, "edit");
  assert.equal(editFlow.transactionModalOpen, true, "Edit does not reuse the transaction modal.");
  assert.equal(editFlow.groupModalOpen, false, "Group modal remained open behind the edit modal.");
  assert.equal(editFlow.method, "PATCH");
  assert.match(editFlow.path, /\/api\/transaction-groups\/.+\/members\/.+/);
  assert.equal(editFlow.mode, "edit");
  assert.equal(editFlow.title, "Editar lançamento");
  assert.ok(editFlow.description.length > 0);
  assert.equal(editFlow.contextVisible, true);
  assert.equal(editFlow.kindHidden, true);
  assert.equal(editFlow.effectiveHidden, true);
  assert.equal(editFlow.repeatHidden, true);
  assert.equal(editFlow.noteHidden, true);
  assert.equal(editFlow.statusHidden, true);
  assert.equal(editFlow.dateLabel, "Data");

  const formNetworkFailure = await evaluate(
    browser.cdp,
    `(async () => {
      const form = document.querySelector("[data-form]");
      const originalFetch = window.fetch;
      window.fetch = async () => { throw new TypeError("QA offline"); };
      form.description.value = "QA falha de rede preservada";
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const result = {
        modalOpen: document.querySelector("[data-modal]").open,
        submitDisabled: form.querySelector('[type="submit"]').disabled,
        description: form.description.value,
        message: form.querySelector(".form-status").textContent
      };
      window.fetch = originalFetch;
      return result;
    })()`,
  );
  assert.equal(formNetworkFailure.modalOpen, true, "The transaction modal closed after a network error.");
  assert.equal(formNetworkFailure.submitDisabled, false, "The submit button remained disabled after a network error.");
  assert.equal(formNetworkFailure.description, "QA falha de rede preservada");
  assert.match(formNetworkFailure.message, /Verifique sua conexão e tente novamente/);

  await evaluate(
    browser.cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      form.amountMinor.value = "123,45";
      form.plannedOn.value = "2026-07-27";
      form.description.value = "QA membro editado via modal";
      form.requestSubmit();
      return true;
    })()`,
  );
  await sleep(500);
  const editedState = await evaluate(
    browser.cdp,
    `(() => {
      const node = document.querySelector('script[data-group="${created.postedGroupId}"]');
      const group = JSON.parse(node.textContent);
      const member = group.members.find((item) => item.description === "QA membro editado via modal");
      return {
        groupModalOpen: document.querySelector("[data-group-modal]").open,
        transactionModalOpen: document.querySelector("[data-modal]").open,
        amountMinor: member && member.amountMinor,
        effectiveOn: member && member.effectiveOn,
        renderedDescription: document.querySelector("[data-group-members]").textContent.includes("QA membro editado via modal"),
        renderedTotal: document.querySelector("[data-group-effective-input]").value,
        message: document.querySelector("[data-group-action-status]").textContent
      };
    })()`,
  );
  assert.equal(editedState.groupModalOpen, true, "The grouping modal was not restored after editing.");
  assert.equal(editedState.transactionModalOpen, false);
  assert.equal(editedState.amountMinor, 12345);
  assert.equal(editedState.effectiveOn, "2026-07-27");
  assert.equal(editedState.renderedDescription, true);
  assert.match(editedState.renderedTotal, /R\$/);
  assert.match(editedState.message, /Lançamento atualizado/);

  const cloneFlow = await openMemberFlow(browser.cdp, "clone");
  assert.equal(cloneFlow.transactionModalOpen, true, "Clone does not reuse the transaction modal.");
  assert.equal(cloneFlow.groupModalOpen, false, "Group modal remained open behind the clone modal.");
  assert.equal(cloneFlow.method, "POST");
  assert.match(cloneFlow.path, /\/api\/transaction-groups\/.+\/members\/.+\/clone/);
  assert.equal(cloneFlow.mode, "clone");
  assert.equal(cloneFlow.title, "Clonar lançamento");
  assert.match(cloneFlow.description, /^Cópia de /);
  assert.equal(cloneFlow.status, "posted");
  assert.equal(cloneFlow.contextVisible, true);
  assert.equal(cloneFlow.kindHidden, true);
  assert.equal(cloneFlow.repeatHidden, true);
  assert.equal(cloneFlow.repeatDisabled, true);
  assert.equal(cloneFlow.statusHidden, true);
  assert.equal(cloneFlow.statusButtonsDisabled, true);
  await evaluate(
    browser.cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      form.repeatMode.disabled = false;
      form.repeatMode.value = "fixed";
      form.status.value = "reconciled";
      form.amountMinor.value = "234,56";
      form.plannedOn.value = "2026-07-26";
      form.description.value = "QA clone seguro do agrupamento";
      form.requestSubmit();
      return true;
    })()`,
  );
  await sleep(500);
  const clonedState = await evaluate(
    browser.cdp,
    `(async () => {
      const response = await fetch("/api/transactions?accountId=${encodeURIComponent(fixtureIds.longAccountId)}");
      const payload = await response.json();
      const matches = payload.transactions.filter((item) => item.description === "QA clone seguro do agrupamento");
      return {
        groupModalOpen: document.querySelector("[data-group-modal]").open,
        message: document.querySelector("[data-group-action-status]").textContent,
        matches: matches.map((item) => ({
          status: item.status,
          source: item.source,
          amountMinor: item.amountMinor,
          plannedOn: item.plannedOn,
          effectiveOn: item.effectiveOn || null,
          recurrenceId: item.recurrenceId || null,
          installmentId: item.installmentId || null,
          transactionGroupId: item.transactionGroupId || null
        }))
      };
    })()`,
  );
  assert.equal(clonedState.groupModalOpen, true, "The grouping modal was not restored after cloning.");
  assert.match(clonedState.message, /Lançamento clonado/);
  assert.deepEqual(clonedState.matches, [
    {
      status: "posted",
      source: "manual",
      amountMinor: 23456,
      plannedOn: "2026-07-26",
      effectiveOn: "2026-07-26",
      recurrenceId: null,
      installmentId: null,
      transactionGroupId: null,
    },
  ]);

  const groupNetworkFailure = await evaluate(
    browser.cdp,
    `(async () => {
      const originalFetch = window.fetch;
      const originalConfirm = window.confirm;
      window.fetch = async () => { throw new TypeError("QA offline"); };
      window.confirm = () => true;
      const button = document.querySelector('[data-group-action="clone"]');
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const result = {
        modalOpen: document.querySelector("[data-group-modal]").open,
        buttonDisabled: button.disabled,
        message: document.querySelector("[data-group-action-status]").textContent
      };
      window.fetch = originalFetch;
      window.confirm = originalConfirm;
      return result;
    })()`,
  );
  assert.equal(groupNetworkFailure.modalOpen, true);
  assert.equal(groupNetworkFailure.buttonDisabled, false, "The group action remained disabled after a network error.");
  assert.match(groupNetworkFailure.message, /Verifique sua conexão e tente novamente/);

  const statusTransitions = await evaluate(
    browser.cdp,
    `(async () => {
      const originalConfirm = window.confirm;
      window.confirm = () => true;
      const button = document.querySelector('[data-group-action="status"]');
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 150));
      const reconciled = {
        status: document.querySelector("[data-group-status-input]").value,
        label: button.textContent,
        modalOpen: document.querySelector("[data-group-modal]").open
      };
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 150));
      const posted = {
        status: document.querySelector("[data-group-status-input]").value,
        label: button.textContent,
        modalOpen: document.querySelector("[data-group-modal]").open
      };
      window.confirm = originalConfirm;
      return { reconciled, posted };
    })()`,
  );
  assert.deepEqual(statusTransitions.reconciled, {
    status: "Conciliado",
    label: "Desconciliar",
    modalOpen: true,
  });
  assert.deepEqual(statusTransitions.posted, {
    status: "Efetivado",
    label: "Marcar como conciliado",
    modalOpen: true,
  });

  const groupClone = await evaluate(
    browser.cdp,
    `(async () => {
      const accountId = ${JSON.stringify(fixtureIds.longAccountId)};
      async function countTransactions() {
        const response = await fetch("/api/transactions?accountId=" + encodeURIComponent(accountId));
        return (await response.json()).transactions.length;
      }
      const before = await countTransactions();
      const originalConfirm = window.confirm;
      window.confirm = () => true;
      document.querySelector('[data-group-action="clone"]').click();
      await new Promise((resolve) => setTimeout(resolve, 180));
      const after = await countTransactions();
      const result = {
        before,
        after,
        memberCount: JSON.parse(document.querySelector('script[data-group="${created.postedGroupId}"]').textContent).members.length,
        modalOpen: document.querySelector("[data-group-modal]").open,
        message: document.querySelector("[data-group-action-status]").textContent
      };
      window.confirm = originalConfirm;
      return result;
    })()`,
  );
  assert.equal(groupClone.after - groupClone.before, 3, "Group clone count differs from member count.");
  assert.equal(groupClone.memberCount, 3, "Group cloning changed the original membership.");
  assert.equal(groupClone.modalOpen, true);
  assert.match(groupClone.message, /Grupo clonado/);

  const memberDeletion = await evaluate(
    browser.cdp,
    `(async () => {
      const originalConfirm = window.confirm;
      window.confirm = () => true;
      document.querySelector('[data-member-id="${created.thirdMemberId}"][data-member-action="void"]').click();
      await new Promise((resolve) => setTimeout(resolve, 180));
      const node = document.querySelector('script[data-group="${created.postedGroupId}"]');
      const group = JSON.parse(node.textContent);
      const result = {
        modalOpen: document.querySelector("[data-group-modal]").open,
        memberCount: group.members.length,
        renderedCount: document.querySelectorAll("[data-group-member]").length,
        deletedStillPresent: group.members.some((item) => item.id === "${created.thirdMemberId}"),
        message: document.querySelector("[data-group-action-status]").textContent
      };
      window.confirm = originalConfirm;
      return result;
    })()`,
  );
  assert.equal(memberDeletion.modalOpen, true, "Deleting one of three members closed the group flow.");
  assert.equal(memberDeletion.memberCount, 2);
  assert.equal(memberDeletion.renderedCount, 2);
  assert.equal(memberDeletion.deletedStillPresent, false);
  assert.match(memberDeletion.message, /Lançamento excluído/);

  await evaluate(browser.cdp, `document.querySelector("[data-group-modal]").close()`);
  await openGroup(browser.cdp, created.plannedGroupId);
  const planned = await evaluate(
    browser.cdp,
    `(() => {
      const button = document.querySelector('[data-group-action="status"]');
      const message = document.querySelector("[data-group-action-status]");
      return { disabled: button.disabled, title: button.title, message: message.textContent };
    })()`,
  );
  assert.equal(planned.disabled, true, "Planned group reconciliation action must be disabled.");
  assert.match(planned.title, /Efetive os lançamentos previstos/);
  assert.match(planned.message, /Efetive os lançamentos previstos/);
  await evaluate(browser.cdp, `document.querySelector("[data-group-modal]").close()`);

  await setViewport(browser.cdp, 390, 900);
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await sleep(300);
  await openGroup(browser.cdp, created.postedGroupId);
  const mobile = await measureGroupModal(browser.cdp);
  assert.equal(mobile.open, true, "Posted group modal did not open on mobile.");
  assert.equal(mobile.horizontalOverflow, false, "Group modal has horizontal overflow on mobile.");
  assert.equal(mobile.insideViewport, true, "Group modal escapes the mobile viewport.");
  assert.equal(mobile.accessibleActionCount, mobile.actionCount);
  await screenshot(browser.cdp, join(outputDir, "transaction-group-modal-mobile.png"));

  await writeFile(
    join(outputDir, "transaction-group-modal.json"),
    `${JSON.stringify({
      created,
      desktop,
      editFlow,
      formNetworkFailure,
      editedState,
      cloneFlow,
      clonedState,
      groupNetworkFailure,
      statusTransitions,
      groupClone,
      memberDeletion,
      planned,
      mobile,
    }, null, 2)}\n`,
  );
} finally {
  if (groupIds.length > 0) {
    await evaluate(
      browser.cdp,
      `(async () => {
        for (const id of ${JSON.stringify(groupIds)}) {
          await fetch("/api/transaction-groups/" + encodeURIComponent(id), { method: "DELETE" });
        }
        return true;
      })()`,
    ).catch(() => undefined);
  }
  await browser.close(outputDir);
}

async function openGroup(cdp, groupId) {
  const opened = await evaluate(
    cdp,
    `(() => {
      const button = document.querySelector('[data-group-details="${groupId}"]');
      if (!button) throw new Error("Group details button not found for ${groupId}");
      button.click();
      return true;
    })()`,
  );
  assert.equal(opened, true);
  await sleep(120);
}

async function openMemberFlow(cdp, action) {
  return evaluate(
    cdp,
    `(() => {
      const button = document.querySelector('[data-group-member] [data-member-action="${action}"]');
      if (!button) throw new Error("Member action not found: ${action}");
      button.click();
      const transactionModal = document.querySelector("[data-modal]");
      const transactionForm = document.querySelector("[data-form]");
      return {
        transactionModalOpen: transactionModal.open,
        groupModalOpen: document.querySelector("[data-group-modal]").open,
        method: transactionForm.dataset.method,
        path: transactionForm.dataset.path,
        mode: transactionForm.dataset.groupMemberMode,
        title: document.querySelector("[data-modal-title]").textContent,
        description: transactionForm.description.value,
        status: transactionForm.status.value,
        contextVisible: !transactionForm.querySelector("[data-group-member-context]").hidden,
        kindHidden: transactionForm.kind.closest("label").hidden,
        effectiveHidden: transactionForm.effectiveOn.closest("label").hidden,
        repeatHidden: transactionForm.repeatMode.closest("label").hidden,
        repeatDisabled: transactionForm.repeatMode.disabled,
        noteHidden: transactionForm.note.closest("label").hidden,
        statusHidden: transactionForm.querySelector(".status-icons").hidden,
        statusButtonsDisabled: Array.from(transactionForm.querySelectorAll("[data-status-option]")).every((statusButton) => statusButton.disabled),
        dateLabel: transactionForm.plannedOn.closest("label").childNodes[0].textContent.trim()
      };
    })()`,
  );
}

async function measureGroupModal(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const modal = document.querySelector("[data-group-modal]");
      const panel = modal.querySelector(".group-modal-panel");
      const rect = panel.getBoundingClientRect();
      const actions = Array.from(modal.querySelectorAll("[data-member-action], [data-group-action]"));
      return {
        open: modal.open,
        currency: modal.querySelector("[data-group-currency-input]").value,
        memberCount: modal.querySelectorAll("[data-group-member]").length,
        actionCount: actions.length,
        accessibleActionCount: actions.filter((button) => button.getAttribute("aria-label") || button.textContent.trim()).length,
        horizontalOverflow: panel.scrollWidth > panel.clientWidth + 1,
        insideViewport: rect.left >= -1 && rect.right <= window.innerWidth + 1
      };
    })()`,
  );
}
