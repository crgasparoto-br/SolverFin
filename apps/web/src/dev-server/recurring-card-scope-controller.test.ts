import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";

import { recurringCardScopeControllerScript } from "./recurring-card-scope-controller.js";

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  assertCompactLayoutContract();
  assertAccountEditContract();
  await assertScopeRequest("card", "current", {
    expectedPath: "/api/credit-card-accounts/card-1/purchases/purchase-1/current-only",
  });
  await assertScopeRequest("card", "current_and_future", {
    expectedPath: "/api/credit-card-accounts/card-1/purchases/purchase-1",
    expectedScope: "current_and_future",
  });
  await assertScopeRequest("account", "current", {
    expectedPath: "/api/transactions/transaction-1",
  });
  await assertScopeRequest("account", "current_and_future", {
    expectedPath: "/api/transactions/transaction-1",
    expectedApplyToFuture: true,
  });
}

function assertCompactLayoutContract(): void {
  const script = recurringCardScopeControllerScript();

  assert.match(script, /max-width: 460px/);
  assert.match(script, /min-height: 44px/);
  assert.match(script, /recurrence-scope-choice/);
  assert.match(script, /recurrence-scope-back/);
  assert.match(script, /Somente esta compra/);
  assert.match(script, /Esta compra e as próximas/);
  assert.match(script, /Somente este lançamento/);
  assert.match(script, /Este lançamento e os próximos/);
  assert.match(script, /cancelButtons/);
  assert.match(script, /if \(busy\) event\.preventDefault\(\)/);
  assert.doesNotMatch(script, /max-width: 600px/);
  assert.doesNotMatch(script, /min-height: 104px/);
  assert.doesNotMatch(script, /recurrence-scope-option-description/);
  assert.doesNotMatch(script, /grid-template-columns: repeat\(2/);
}

function assertAccountEditContract(): void {
  const script = recurringCardScopeControllerScript();

  assert.match(script, /data-edit-account-field/);
  assert.match(script, /data-edit-account-select/);
  assert.match(script, /transaction\.accountId \|\| createAccountId/);
  assert.match(script, /accountField\.hidden = !editing/);
  assert.match(script, /accountSelect\.disabled = !editing/);
  assert.match(script, /accountInput\.disabled = editing/);
  assert.match(script, /Revise a conta usada neste lançamento\./);
  assert.match(script, /A conta vem do filtro principal\./);
  assert.match(
    script,
    /const requestPath = isCard && scope === "current_only" \? path \+ "\/current-only" : path/,
  );
}

async function assertScopeRequest(
  targetKind: "card" | "account",
  buttonKind: "current" | "current_and_future",
  expected: {
    expectedPath: string;
    expectedScope?: string;
    expectedApplyToFuture?: boolean;
  },
): Promise<void> {
  const requests: Array<{ path: string; init: { body?: string } }> = [];
  let clickListener: ((event: FakeEvent) => Promise<void>) | undefined;

  const currentButton = fakeButton();
  const futureButton = fakeButton();
  const backButton = fakeButton();
  const status = { className: "", textContent: "" };
  const modal = {
    dataset: { targetKind },
    contains: (node: unknown) => node === currentButton || node === futureButton,
    querySelector: (selector: string) => {
      if (selector === '[data-recurrence-scope="current"]') return currentButton;
      if (selector === '[data-recurrence-scope="current_and_future"]') return futureButton;
      if (selector === ".recurrence-scope-actions [data-recurrence-scope-cancel]")
        return backButton;
      if (selector === "[data-recurrence-scope-status]") return status;
      return null;
    },
    querySelectorAll: (selector: string) =>
      selector === "[data-recurrence-scope-cancel]" ? [backButton] : [],
    addEventListener: () => undefined,
  };
  const form = {
    dataset: {
      method: "PATCH",
      path:
        targetKind === "card"
          ? "/api/credit-card-accounts/card-1/purchases/purchase-1"
          : "/api/transactions/transaction-1",
      recurrenceId: "recurrence-1",
    },
    getAttribute: () => "",
    checkValidity: () => true,
    reportValidity: () => undefined,
  };

  class FakeFormData {
    get(name: string): string {
      const values: Record<string, string> = {
        amountMinor: "12,34",
        occurredOn: "2026-07-10",
        plannedOn: "2026-07-10",
        effectiveOn: "",
        description: "Assinatura",
        note: "Observação",
        kind: "expense",
        status: "planned",
        accountId: "account-1",
        destinationAccountId: "",
        categoryId: "category-1",
        cardInstrumentId: "instrument-1",
        recurrenceId: "recurrence-1",
      };
      return values[name] ?? "";
    }
  }

  const appendedStyles: FakeStyle[] = [];
  const document = {
    head: {
      appendChild: (style: FakeStyle) => appendedStyles.push(style),
    },
    createElement: () => fakeStyle(),
    querySelector: (selector: string) => {
      if (selector === "[data-recurrence-scope-layout-styles]") return null;
      if (selector === "[data-recurrence-scope-modal]") return modal;
      if (selector === "[data-purchase-form]" && targetKind === "card") return form;
      if (selector === "[data-form]" && targetKind === "account") return form;
      return null;
    },
    addEventListener: (type: string, listener: (event: FakeEvent) => Promise<void>) => {
      if (type === "click") clickListener = listener;
    },
  };

  const script = recurringCardScopeControllerScript()
    .replace(/^\s*<script>\s*/, "")
    .replace(/\s*<\/script>\s*$/, "");

  runInNewContext(script, {
    document,
    fetch: async (path: string, init: { body?: string }) => {
      requests.push({ path, init });
      return { ok: true, json: async () => ({ skippedCount: 0 }) };
    },
    FormData: FakeFormData,
    window: { location: { reload: () => undefined }, setTimeout: () => 0 },
  });

  const currentLabel = targetKind === "card" ? "Somente esta compra" : "Somente este lançamento";
  const futureLabel =
    targetKind === "card" ? "Esta compra e as próximas" : "Este lançamento e os próximos";
  assert.equal(currentButton.textContent, currentLabel);
  assert.equal(futureButton.textContent, futureLabel);
  assert.equal(currentButton.classList.has("recurrence-scope-choice"), true);
  assert.equal(futureButton.classList.has("recurrence-scope-choice"), true);
  assert.equal(backButton.classList.has("recurrence-scope-back"), true);
  assert.equal(currentButton.dataset.explicitEditScope, "current_only");
  assert.equal(futureButton.dataset.explicitEditScope, "current_and_future");
  assert.equal(appendedStyles.length, 1);
  assert.ok(clickListener);

  let prevented = false;
  let propagationStopped = false;
  const target = buttonKind === "current" ? currentButton : futureButton;
  await clickListener!({
    target,
    preventDefault: () => {
      prevented = true;
    },
    stopImmediatePropagation: () => {
      propagationStopped = true;
    },
  });

  assert.equal(prevented, true);
  assert.equal(propagationStopped, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.path, expected.expectedPath);
  const payload = JSON.parse(requests[0]?.init.body ?? "{}") as Record<string, unknown>;
  assert.equal(payload.editScope, expected.expectedScope);
  assert.equal(payload.applyToFuturePlanned, expected.expectedApplyToFuture);
  if (targetKind === "account") assert.equal(payload.accountId, "account-1");
  assert.equal(currentButton.disabled, true);
  assert.equal(futureButton.disabled, true);
  assert.equal(backButton.disabled, true);
}

interface FakeClassList {
  add(...classNames: string[]): void;
  has(className: string): boolean;
}

function fakeClassList(): FakeClassList {
  const values = new Set<string>();
  return {
    add: (...classNames: string[]) => classNames.forEach((className) => values.add(className)),
    has: (className: string) => values.has(className),
  };
}

interface FakeButton {
  dataset: Record<string, string>;
  disabled: boolean;
  innerHTML: string;
  textContent: string;
  classList: FakeClassList;
  setAttribute(name: string, value: string): void;
  closest(selector: string): FakeButton | null;
}

function fakeButton(): FakeButton {
  let html = "";
  const button: FakeButton = {
    dataset: {},
    disabled: false,
    get innerHTML() {
      return html;
    },
    set innerHTML(value: string) {
      html = value;
      this.textContent = value
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    },
    textContent: "",
    classList: fakeClassList(),
    setAttribute: () => undefined,
    closest: () => null,
  };
  button.closest = (selector: string) =>
    selector === "[data-explicit-edit-scope]" && button.dataset.explicitEditScope ? button : null;
  return button;
}

interface FakeStyle {
  textContent: string;
  setAttribute(name: string, value: string): void;
}

function fakeStyle(): FakeStyle {
  return {
    textContent: "",
    setAttribute: () => undefined,
  };
}

interface FakeEvent {
  target: FakeButton;
  preventDefault(): void;
  stopImmediatePropagation(): void;
}
