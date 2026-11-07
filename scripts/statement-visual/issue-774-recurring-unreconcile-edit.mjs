import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, navigate, screenshot, sleep } from "./cdp.mjs";

/** Exercise the real bank-statement modal, not only an API or mock controller. */
export async function validateUnreconciledRecurringAccountEdit(context) {
  return validateRecurringAccountEdit(context, "posted");
}

export async function validatePlannedRecurringAccountEdit(context) {
  return validateRecurringAccountEdit(context, "planned");
}

async function validateRecurringAccountEdit({ cdp, baseUrl, outputDir }, initialStatus) {
  const isPlanned = initialStatus === "planned";
  const fixture = await evaluate(
    cdp,
    `(async () => {
      async function request(path, method = "GET", payload) {
        const response = await fetch(path, {
          method,
          headers: payload === undefined ? undefined : { "content-type": "application/json" },
          body: payload === undefined ? undefined : JSON.stringify(payload),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(method + " " + path + ": " + response.status + " " + JSON.stringify(body));
        return body;
      }
      const suffix = Date.now().toString(36);
      const today = new Date();
      const occurrenceDate = (monthOffset) => new Date(Date.UTC(
        today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 8,
      )).toISOString().slice(0, 10);
      const startOn = occurrenceDate(-1);
      const selectedOn = occurrenceDate(0);
      const editedOn = new Date(Date.UTC(
        today.getUTCFullYear(), today.getUTCMonth(), 9,
      )).toISOString().slice(0, 10);
      const through = occurrenceDate(1);
      const source = (await request("/api/accounts", "POST", {
        name: "QA #774 origem " + suffix, kind: "checking", currency: "BRL", openingBalanceMinor: 0,
      })).account;
      const destination = (await request("/api/accounts", "POST", {
        name: "QA #774 destino " + suffix, kind: "checking", currency: "BRL", openingBalanceMinor: 0,
      })).account;
      const category = (await request("/api/categories", "POST", {
        name: "QA #774 categoria " + suffix, kind: "expense",
      })).category;
      const recurrence = (await request("/api/recurrences", "POST", {
        kind: "expense", frequency: "monthly", startOn, endOn: through,
        accountId: source.id, categoryId: category.id, amountMinor: 3500,
        description: "QA #774 recorrência " + suffix,
      })).recurrence;
      await request("/api/recurrences/" + recurrence.id + "/generate-installments", "POST", {
        through, maxOccurrences: 3,
      });
      const installments = (await request("/api/installments?recurrenceId=" + recurrence.id + "&status=all")).installments;
      const selected = installments.find((item) => item.dueOn === selectedOn && item.transaction?.id);
      if (!selected) throw new Error("Selected recurrence occurrence was not materialized");
      if (!${isPlanned}) {
        await request("/api/transactions/" + selected.transaction.id, "PATCH", { status: "reconciled" });
      } else if (selected.transaction.status !== "planned") {
        throw new Error("Expected a planned account occurrence for the planned editing scenario");
      }
      return {
        editedOn,
        sourceId: source.id, destinationId: destination.id, categoryId: category.id,
        month: selectedOn.slice(0, 7), recurrenceId: recurrence.id, transactionId: selected.transaction.id,
        siblingIds: installments.filter((item) => item.id !== selected.id).map((item) => item.transaction?.id),
      };
    })()`,
  );
  const route = `/lancamentos?accountId=${encodeURIComponent(fixture.sourceId)}&month=${fixture.month}`;
  const editSelector = `[data-edit="${fixture.transactionId}"]`;

  // Before unreconciliation, the restricted editor remains the only entry point.
  await navigate(cdp, `${baseUrl}${route}`);
  const reconciledState = isPlanned ? { notApplicable: true } : await evaluate(
    cdp,
    `(async () => {
      for (let i = 0; i < 50; i++) {
        const edit = document.querySelector(${JSON.stringify(editSelector)});
        if (edit?.dataset.installmentEdit) return { restricted: true, title: edit.title };
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return { restricted: false };
    })()`,
  );
  if (!isPlanned) assert.equal(reconciledState.restricted, true, "Reconciled recurrence must remain restricted");

  const unreconcile = isPlanned ? null : await evaluate(
    cdp,
    `(async () => {
      const response = await fetch(${JSON.stringify(`/api/transactions/${fixture.transactionId}`)}, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "posted" }),
      });
      return { status: response.status, body: await response.json() };
    })()`,
  );
  if (!isPlanned) assert.equal(unreconcile.status, 200, "The reconciliation must be undone before editing");

  await navigate(cdp, `${baseUrl}${route}`);
  const editState = await evaluate(
    cdp,
    `(async () => {
      for (let i = 0; i < 50; i++) {
        const edit = document.querySelector(${JSON.stringify(editSelector)});
        if (edit && edit.title === "Editar lançamento recorrente") {
          return { restricted: !!edit.dataset.installmentEdit, title: edit.title };
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return { missing: true };
    })()`,
  );
  assert.deepEqual(editState, { restricted: false, title: "Editar lançamento recorrente" });

  await evaluate(cdp, `document.querySelector(${JSON.stringify(editSelector)}).click()`);
  await sleep(220);
  const description = `QA #774 edição após desconciliar ${Date.now().toString(36)}`;
  const modalState = await evaluate(
    cdp,
    `(() => {
      const modal = document.querySelector("dialog[data-modal]");
      const form = modal?.querySelector("[data-form]");
      const account = form?.querySelector("[data-edit-account-select]");
      const category = form?.querySelector('[name="categoryId"]');
      return {
        open: modal?.open, title: document.querySelector("[data-modal-title]")?.textContent,
        method: form?.dataset.method, recurrenceId: form?.dataset.recurrenceId,
        accountEnabled: account?.disabled === false, sourceAccount: account?.value,
        categoryValue: category?.value,
      };
    })()`,
  );
  assert.equal(modalState.open, true, "The transaction editor must open after unreconciliation");
  assert.equal(modalState.title, "Editar lançamento");
  assert.equal(modalState.method, "PATCH");
  assert.equal(modalState.recurrenceId, fixture.recurrenceId);
  assert.equal(modalState.accountEnabled, true);
  assert.equal(modalState.sourceAccount, fixture.sourceId);
  assert.equal(modalState.categoryValue, fixture.categoryId);

  const prepared = await evaluate(
    cdp,
    `(() => {
      const form = document.querySelector("dialog[data-modal] [data-form]");
      const account = form.querySelector("[data-edit-account-select]");
      account.value = ${JSON.stringify(fixture.destinationId)};
      account.dispatchEvent(new Event("change", { bubbles: true }));
      form.querySelector('[name="categoryId"]').value = "";
      form.querySelector('[name="description"]').value = ${JSON.stringify(description)};
      form.querySelector('[name="amountMinor"]').value = "54,32";
      if (${isPlanned}) {
        form.querySelector('[name="occurredOn"]').value = ${JSON.stringify(fixture.editedOn)};
        form.querySelector('[name="plannedOn"]').value = ${JSON.stringify(fixture.editedOn)};
      }
      return { valid: form.checkValidity(), account: account.value,
        category: form.querySelector('[name="categoryId"]').value };
    })()`,
  );
  assert.deepEqual(prepared, {
    valid: true,
    account: fixture.destinationId,
    category: "",
  });
  const screenshotName = isPlanned
    ? "issue-774-planned-account-edit-dialog.png"
    : "issue-774-after-unreconcile-edit-dialog.png";
  await screenshot(cdp, join(outputDir, screenshotName));

  const submitted = await evaluate(
    cdp,
    `(async () => {
      const originalFetch = window.fetch;
      const originalSetTimeout = window.setTimeout;
      window.__issue774Patch = [];
      window.fetch = async (input, init) => {
        const response = await originalFetch(input, init);
        if (String(input).endsWith("/current-only") && init?.method === "PATCH") {
          window.__issue774Patch.push({ path: String(input), status: response.status,
            payload: JSON.parse(init.body || "{}") });
        }
        return response;
      };
      window.setTimeout = (callback, delay, ...args) => {
        if (String(callback).includes("location.reload")) return 0;
        return originalSetTimeout(callback, delay, ...args);
      };
      const form = document.querySelector("dialog[data-modal] [data-form]");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      const scopeModal = document.querySelector("[data-recurrence-scope-modal]");
      for (let i = 0; i < 30 && !scopeModal?.open; i++) {
        await new Promise((resolve) => originalSetTimeout(resolve, 100));
      }
      const scopeOpened = scopeModal?.open === true;
      if (scopeOpened) scopeModal.querySelector('[data-recurrence-scope="current"]').click();
      for (let i = 0; i < 60 && window.__issue774Patch.length < 1; i++) {
        await new Promise((resolve) => originalSetTimeout(resolve, 100));
      }
      const patches = window.__issue774Patch;
      window.fetch = originalFetch;
      window.setTimeout = originalSetTimeout;
      delete window.__issue774Patch;
      return { scopeOpened, patches };
    })()`,
  );
  assert.equal(submitted.scopeOpened, true, "Recurrence scope dialog must open");
  assert.equal(submitted.patches.length, 1, "Only one current-only request may be submitted");
  const patch = submitted.patches[0];
  assert.equal(patch.path, `/api/transactions/${fixture.transactionId}/current-only`);
  assert.equal(patch.status, 200, "A deconciliated recurring occurrence must be editable");
  assert.equal(patch.payload.accountId, fixture.destinationId);
  assert.equal(patch.payload.categoryId, null);
  assert.equal(patch.payload.description, description);
  assert.equal(patch.payload.amountMinor, 5432);
  if (isPlanned) {
    assert.equal(patch.payload.plannedOn, fixture.editedOn);
    assert.equal(patch.payload.occurredOn, fixture.editedOn);
    assert.equal(patch.payload.status, "planned", "Current-only edit must not bypass status transitions");
  }

  const persisted = await evaluate(
    cdp,
    `(async () => {
      const request = async (url) => (await (await fetch(url)).json());
      const selected = await request(${JSON.stringify(`/api/transactions/${fixture.transactionId}`)});
      const recurrence = await request(${JSON.stringify(`/api/recurrences/${fixture.recurrenceId}`)});
      const installments = await request(${JSON.stringify(`/api/installments?recurrenceId=${fixture.recurrenceId}&status=all`)});
      return { transaction: selected.transaction, recurrence: recurrence.recurrence,
        selectedInstallment: installments.installments.find(
          (item) => item.transaction?.id === ${JSON.stringify(fixture.transactionId)},
        ),
        siblingTransactions: installments.installments.filter(
          (item) => item.transaction?.id !== ${JSON.stringify(fixture.transactionId)},
        ).map((item) => item.transaction),
      };
    })()`,
  );
  assert.equal(persisted.transaction.status, initialStatus);
  if (isPlanned) {
    assert.equal(String(persisted.transaction.plannedOn).slice(0, 10), fixture.editedOn);
    assert.equal(String(persisted.transaction.occurredOn).slice(0, 10), fixture.editedOn);
    assert.equal(String(persisted.selectedInstallment.dueOn).slice(0, 10), fixture.editedOn);
    assert.equal(persisted.selectedInstallment.amountMinor, 5432);
  }
  assert.equal(persisted.transaction.accountId, fixture.destinationId);
  assert.equal(persisted.transaction.categoryId ?? null, null);
  assert.equal(persisted.transaction.amountMinor, 5432);
  assert.equal(persisted.transaction.description, description);
  assert.equal(persisted.recurrence.accountId, fixture.sourceId);
  assert.equal(persisted.recurrence.categoryId, fixture.categoryId);
  assert.equal(persisted.recurrence.amountMinor, 3500);
  assert.equal(persisted.siblingTransactions.length, 2);
  assert.ok(
    persisted.siblingTransactions.every(
      (item) =>
        item.accountId === fixture.sourceId &&
        item.categoryId === fixture.categoryId &&
        item.amountMinor === 3500,
    ),
  );

  await writeFile(
    join(outputDir, isPlanned
      ? "issue-774-planned-account-edit.json"
      : "issue-774-recurring-unreconcile-edit.json"),
    `${JSON.stringify(
      {
        subjectSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        route,
        scenario: isPlanned
          ? "planned -> current-only UI edit -> persisted readback"
          : "reconciled -> posted -> current-only UI edit -> persisted readback",
        reconciledState,
        editState,
        modalState,
        prepared,
        patch,
        persisted,
        screenshot: screenshotName,
        result: "passed",
      },
      null,
      2,
    )}\n`,
  );
  console.log(`[issue-774] Real Chrome ${initialStatus} current-only edit passed`);
}
