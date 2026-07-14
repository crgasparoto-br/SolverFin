import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";

import { recurrencesSectionScript } from "./recurrences-section.js";

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const harness = createHarness();
  const originalValues = { ...harness.form.values };

  const firstSubmit = fakeSubmitEvent(harness.form);
  await harness.submit(firstSubmit);

  assert.equal(firstSubmit.prevented, true);
  assert.equal(firstSubmit.stopped, true);
  assert.equal(harness.modal.open, true);
  assert.equal(harness.requests.length, 0);
  assert.deepEqual(harness.form.values, originalValues);
  assert.equal(harness.currentButton.focusCount, 1);

  await harness.backButton.dispatch("click", fakeEvent(harness.backButton));
  assert.equal(harness.modal.open, false);
  assert.equal(harness.requests.length, 0);
  assert.deepEqual(harness.form.values, originalValues);
  assert.equal(harness.submitButton.focusCount, 1);

  await harness.submit(fakeSubmitEvent(harness.form));
  assert.equal(harness.modal.open, true);
  await harness.closeButton.dispatch("click", fakeEvent(harness.closeButton));
  assert.equal(harness.modal.open, false);
  assert.equal(harness.requests.length, 0);
  assert.deepEqual(harness.form.values, originalValues);

  await harness.submit(fakeSubmitEvent(harness.form));
  assert.equal(harness.modal.open, true);
  const escapeEvent = fakeCancelableEvent();
  await harness.modal.dispatch("cancel", escapeEvent);
  assert.equal(escapeEvent.prevented, true);
  assert.equal(harness.modal.open, false);
  assert.equal(harness.requests.length, 0);
  assert.deepEqual(harness.form.values, originalValues);
}

function createHarness() {
  const requests: Array<{ path: string; method: string; body: unknown }> = [];
  const currentButton = fakeButton({ recurrenceScope: "current" });
  const futureButton = fakeButton({ recurrenceScope: "current_and_future" });
  const backButton = fakeButton();
  const closeButton = fakeButton();
  const submitButton = fakeButton();
  const statusNode = { className: "muted", textContent: "" };
  const formStatusNode = { textContent: "" };
  let activeElement: FakeButton | null = null;

  for (const button of [currentButton, futureButton, backButton, closeButton, submitButton]) {
    button.onFocus = () => {
      activeElement = button;
    };
  }

  const modal = fakeModal({
    currentButton,
    futureButton,
    backButton,
    closeButton,
    statusNode,
  });

  let submitListener: ((event: FakeSubmitEvent) => Promise<void>) | undefined;
  const form = {
    dataset: {
      method: "PATCH",
      path: "/api/transactions/transaction-1",
      recurrenceId: "recurrence-1",
      currentTransactionId: "transaction-1",
    } as Record<string, string>,
    values: {
      kind: "expense",
      status: "planned",
      amountMinor: "123,45",
      plannedOn: "2028-07-10",
      effectiveOn: "",
      accountId: "account-source",
      destinationAccountId: "",
      categoryId: "category-1",
      description: "Assinatura preservada",
      note: "Observação preservada",
    } as Record<string, string>,
    repeatMode: { value: "single" },
    plannedOn: { value: "2028-07-10" },
    amountMinor: { value: "123,45" },
    frequency: { value: "monthly" },
    interval: { value: "1" },
    endOn: { value: "" },
    installments: { value: "2" },
    installmentStart: { value: "1" },
    installmentValueMode: { value: "per_installment" },
    querySelector(selector: string) {
      if (selector === '[name="editScope"]') return null;
      if (selector === '[aria-live="polite"]') return formStatusNode;
      if (selector === 'button[type="submit"]') return submitButton;
      return null;
    },
    addEventListener(type: string, listener: (event: FakeSubmitEvent) => Promise<void>): void {
      if (type === "submit") submitListener = listener;
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
    get activeElement() {
      return activeElement;
    },
    querySelector(selector: string) {
      if (selector === "[data-recurrence-scope-modal]") return modal;
      if (selector === "[data-form]") return form;
      return null;
    },
    querySelectorAll: () => [],
  };

  runInNewContext(extractTransactionScopeController(), {
    document,
    FormData: FakeFormData,
    moneyToMinor: (value: unknown) =>
      Math.round(Number(String(value).replace(/\./g, "").replace(",", ".")) * 100),
    addMonths: (value: string) => value,
    send: async (path: string, method: string, body: unknown) => {
      requests.push({ path, method, body });
      return { ok: true, json: async () => ({}) };
    },
    readResponse: async () => ({
      body: {},
      message: "Ação concluída. Atualizando...",
    }),
    window: {
      location: { reload: () => undefined },
      setTimeout: () => 0,
    },
  });

  assert.ok(submitListener);

  return {
    form,
    modal,
    currentButton,
    backButton,
    closeButton,
    submitButton,
    requests,
    submit: submitListener!,
  };
}

function extractTransactionScopeController(): string {
  const script = recurrencesSectionScript()
    .replace(/^\s*<script>\s*/, "")
    .replace(/\s*<\/script>\s*$/, "");
  const startMarker = 'const scopeModal = document.querySelector("[data-recurrence-scope-modal]");';
  const endMarker = "function setupCardPurchaseFormOverride()";
  const start = script.indexOf(startMarker);
  const end = script.indexOf(endMarker);

  assert.notEqual(start, -1, "scope controller start marker was not found");
  assert.notEqual(end, -1, "scope controller end marker was not found");
  assert.ok(end > start, "scope controller markers are out of order");

  return `${script.slice(start, end)}\nsetupTransactionFormOverride();`;
}

interface FakeEvent {
  target: unknown;
}

interface FakeSubmitEvent extends FakeEvent {
  prevented: boolean;
  stopped: boolean;
  preventDefault(): void;
  stopImmediatePropagation(): void;
}

interface FakeCancelableEvent {
  prevented: boolean;
  preventDefault(): void;
}

interface FakeButton {
  dataset: Record<string, string>;
  disabled: boolean;
  focusCount: number;
  onFocus?: () => void;
  addEventListener(type: string, listener: (event: FakeEvent) => unknown): void;
  dispatch(type: string, event: FakeEvent): Promise<void>;
  focus(): void;
}

function fakeButton(dataset: Record<string, string> = {}): FakeButton {
  const listeners = new Map<string, Array<(event: FakeEvent) => unknown>>();
  return {
    dataset,
    disabled: false,
    focusCount: 0,
    addEventListener(type, listener) {
      const registered = listeners.get(type) ?? [];
      registered.push(listener);
      listeners.set(type, registered);
    },
    async dispatch(type, event) {
      for (const listener of listeners.get(type) ?? []) {
        await listener(event);
      }
    },
    focus() {
      this.focusCount += 1;
      this.onFocus?.();
    },
  };
}

function fakeModal(input: {
  currentButton: FakeButton;
  futureButton: FakeButton;
  backButton: FakeButton;
  closeButton: FakeButton;
  statusNode: { className: string; textContent: string };
}) {
  const listeners = new Map<string, Array<(event: FakeCancelableEvent) => unknown>>();
  return {
    open: false,
    querySelector(selector: string) {
      if (selector === '[data-recurrence-scope="current"]') return input.currentButton;
      if (selector === "[data-recurrence-scope-status]") return input.statusNode;
      return null;
    },
    querySelectorAll(selector: string) {
      if (selector === "[data-recurrence-scope]") {
        return [input.currentButton, input.futureButton];
      }
      if (selector === "[data-recurrence-scope-cancel]") {
        return [input.closeButton, input.backButton];
      }
      if (selector.startsWith("button:not")) {
        return [input.closeButton, input.currentButton, input.futureButton, input.backButton];
      }
      return [];
    },
    addEventListener(type: string, listener: (event: FakeCancelableEvent) => unknown) {
      const registered = listeners.get(type) ?? [];
      registered.push(listener);
      listeners.set(type, registered);
    },
    async dispatch(type: string, event: FakeCancelableEvent) {
      for (const listener of listeners.get(type) ?? []) {
        await listener(event);
      }
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
  };
}

function fakeEvent(target: unknown): FakeEvent {
  return { target };
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

function fakeCancelableEvent(): FakeCancelableEvent {
  return {
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
}
