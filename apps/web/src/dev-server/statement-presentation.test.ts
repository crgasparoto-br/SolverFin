import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";

import { statementPresentationScript } from "./statement-presentation.js";

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  await assertChangedAccountAndDuplicateSubmission();
  await assertApiFailureRestoresTheForm();
  await assertTransferPayloadAndValidationError();
  await assertCreationAndRecurringEditsAreNotIntercepted();
}

async function assertChangedAccountAndDuplicateSubmission(): Promise<void> {
  const deferred = deferredResponse();
  const harness = createHarness({ fetchResponse: deferred.promise });
  harness.form.values.accountId = "account-target";

  const firstEvent = fakeSubmitEvent(harness.form);
  const firstSubmission = harness.submit(firstEvent);
  await Promise.resolve();

  const secondEvent = fakeSubmitEvent(harness.form);
  await harness.submit(secondEvent);

  assert.equal(firstEvent.prevented, true);
  assert.equal(firstEvent.stopped, true);
  assert.equal(secondEvent.prevented, true);
  assert.equal(secondEvent.stopped, true);
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.submitButton.disabled, true);
  assert.equal(harness.form.attributes.get("aria-busy"), "true");

  const request = harness.requests[0];
  assert.equal(request?.path, "/api/transactions/transaction-1");
  assert.equal(request?.init.method, "PATCH");
  const payload = JSON.parse(request?.init.body ?? "{}") as Record<string, unknown>;
  assert.equal(payload.accountId, "account-target");
  assert.equal(payload.destinationAccountId, undefined);

  deferred.resolve(successResponse());
  await firstSubmission;

  assert.equal(harness.reloadCount, 1);
  assert.equal(harness.statusNode.textContent, "Ação concluída. Atualizando...");
  assert.equal(harness.submitButton.disabled, true);
}

async function assertApiFailureRestoresTheForm(): Promise<void> {
  const harness = createHarness({
    fetchResponse: Promise.resolve(errorResponse("Conta selecionada não está ativa.")),
  });
  harness.form.values.accountId = "account-archived";
  const originalDescription = harness.form.values.description;

  const event = fakeSubmitEvent(harness.form);
  await harness.submit(event);

  assert.equal(harness.requests.length, 1);
  assert.equal(harness.submitButton.disabled, false);
  assert.equal(harness.form.attributes.get("aria-busy"), "false");
  assert.equal(harness.statusNode.textContent, "Conta selecionada não está ativa.");
  assert.equal(harness.statusNode.className, "form-status error full");
  assert.equal(harness.form.values.accountId, "account-archived");
  assert.equal(harness.form.values.description, originalDescription);
  assert.equal(harness.reloadCount, 0);
}

async function assertTransferPayloadAndValidationError(): Promise<void> {
  const harness = createHarness({
    fetchResponse: Promise.resolve(
      errorResponse("Transfer transactions require different source and destination accounts."),
    ),
  });
  harness.form.values.kind = "transfer";
  harness.form.values.accountId = "account-same";
  harness.form.values.destinationAccountId = "account-same";

  await harness.submit(fakeSubmitEvent(harness.form));

  const payload = JSON.parse(harness.requests[0]?.init.body ?? "{}") as Record<string, unknown>;
  assert.equal(payload.kind, "transfer");
  assert.equal(payload.accountId, "account-same");
  assert.equal(payload.destinationAccountId, "account-same");
  assert.match(harness.statusNode.textContent, /different source and destination/i);
  assert.equal(harness.submitButton.disabled, false);
}

async function assertCreationAndRecurringEditsAreNotIntercepted(): Promise<void> {
  const creation = createHarness({ method: "POST" });
  const creationEvent = fakeSubmitEvent(creation.form);
  await creation.submit(creationEvent);
  assert.equal(creationEvent.prevented, false);
  assert.equal(creation.requests.length, 0);

  const recurring = createHarness({ recurrenceId: "recurrence-1" });
  const recurringEvent = fakeSubmitEvent(recurring.form);
  await recurring.submit(recurringEvent);
  assert.equal(recurringEvent.prevented, false);
  assert.equal(recurring.requests.length, 0);
}

interface HarnessOptions {
  method?: string;
  recurrenceId?: string;
  fetchResponse?: Promise<FakeResponse>;
}

interface FakeResponse {
  ok: boolean;
  json(): Promise<Record<string, unknown>>;
}

interface RequestRecord {
  path: string;
  init: { method?: string; body?: string };
}

function createHarness(options: HarnessOptions = {}) {
  let submitListener: ((event: FakeSubmitEvent) => Promise<void>) | undefined;
  let reloadCount = 0;
  const requests: RequestRecord[] = [];
  const submitButton = { disabled: false };
  const statusNode = { className: "form-status muted full", textContent: "" };
  const submitScope = {
    addEventListener(type: string, listener: (event: FakeSubmitEvent) => Promise<void>) {
      if (type === "submit") submitListener = listener;
    },
  };
  const form = {
    dataset: {
      method: options.method ?? "PATCH",
      path: "/api/transactions/transaction-1",
      ...(options.recurrenceId ? { recurrenceId: options.recurrenceId } : {}),
    } as Record<string, string>,
    values: {
      kind: "expense",
      status: "planned",
      amountMinor: "123,45",
      plannedOn: "2026-07-20",
      effectiveOn: "",
      accountId: "account-source",
      destinationAccountId: "",
      categoryId: "category-1",
      description: "Conta de energia",
      note: "Pagamento previsto",
      recurrenceId: options.recurrenceId ?? "",
    } as Record<string, string>,
    attributes: new Map<string, string>(),
    querySelector(selector: string) {
      if (selector === 'button[type="submit"]') return submitButton;
      if (selector === '[aria-live="polite"]') return statusNode;
      return null;
    },
    getAttribute(name: string) {
      return name === "data-path" ? this.dataset.path : (this.attributes.get(name) ?? null);
    },
    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
    },
    closest(selector: string) {
      return selector === "dialog" ? submitScope : null;
    },
    checkValidity: () => true,
    reportValidity: () => undefined,
  };

  class FakeFormData {
    readonly values: Record<string, string>;

    constructor(target: typeof form) {
      this.values = target.values;
    }

    get(name: string): string {
      return this.values[name] ?? "";
    }
  }

  const document = {
    querySelector(selector: string) {
      if (selector === "[data-form]") return form;
      if (selector === '[data-recurrence-scope-modal][data-target-kind="account"]') return {};
      return null;
    },
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: () => undefined,
  };

  const script = statementPresentationScript()
    .replace(/^\s*<script>\s*/, "")
    .replace(/\s*<\/script>\s*$/, "");

  runInNewContext(script, {
    document,
    FormData: FakeFormData,
    fetch: async (path: string, init: RequestRecord["init"]) => {
      requests.push({ path, init });
      return options.fetchResponse ?? successResponse();
    },
    window: {
      addEventListener: () => undefined,
      location: {
        reload: () => {
          reloadCount += 1;
        },
      },
      setTimeout: (callback: () => void) => {
        callback();
        return 0;
      },
    },
  });

  assert.ok(submitListener);

  return {
    form,
    requests,
    statusNode,
    submitButton,
    submit: submitListener!,
    get reloadCount() {
      return reloadCount;
    },
  };
}

interface FakeSubmitEvent {
  target: unknown;
  prevented: boolean;
  stopped: boolean;
  preventDefault(): void;
  stopImmediatePropagation(): void;
}

function fakeSubmitEvent(target: unknown): FakeSubmitEvent {
  return {
    target,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopImmediatePropagation() {
      this.stopped = true;
    },
  };
}

function deferredResponse(): {
  promise: Promise<FakeResponse>;
  resolve(response: FakeResponse): void;
} {
  let resolve!: (response: FakeResponse) => void;
  const promise = new Promise<FakeResponse>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function successResponse(): FakeResponse {
  return {
    ok: true,
    json: async () => ({ transaction: { id: "transaction-1" } }),
  };
}

function errorResponse(message: string): FakeResponse {
  return { ok: false, json: async () => ({ error: { message } }) };
}
