import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";

import { recurringCardScopeControllerScript } from "./recurring-card-scope-controller.js";

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  assertScopeLayoutContract();
  await assertScopeRequest("card", "current", {
    expectedPath: "/api/credit-card-accounts/card-1/purchases/purchase-1/current-only",
  });
  await assertScopeRequest("card", "current_and_future", {
    expectedPath: "/api/credit-card-accounts/card-1/purchases/purchase-1",
    expectedScope: "current_and_future",
  });
  await assertScopeRequest("account", "current", {
    expectedPath: "/api/transactions/transaction-1/current-only",
  });
  await assertScopeRequest("account", "current_and_future", {
    expectedPath: "/api/transactions/transaction-1",
    expectedApplyToFuture: true,
  });
}

function assertScopeLayoutContract(): void {
  const script = recurringCardScopeControllerScript();

  assert.match(script, /data-recurrence-scope-layout-styles/);
  assert.match(script, /width: min\(600px, calc\(100vw - 32px\)\)/);
  assert.match(script, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(script, /min-height: 104px !important/);
  assert.match(script, /recurrence-scope-option-copy/);
  assert.match(script, /recurrence-scope-option-description/);
  assert.match(script, /recurrence-scope-back/);
  assert.match(script, /@media \(max-width: 640px\)/);
  assert.match(script, /grid-template-columns: 1fr/);
  assert.match(script, /Alterar somente esta compra/);
  assert.match(script, /Alterar somente este lançamento/);
  assert.match(script, /Aplica a alteração nesta compra e também em todas as próximas compras ainda editáveis/);
  assert.match(script, /Aplica a alteração neste lançamento e também em todos os próximos lançamentos ainda editáveis/);

  assert.match(script, /dialog button, \[role="dialog"\] button, \.category-modal button/);
  assert.match(script, /data-recurrence-scope-cancel/);
  assert.match(script, /popupSaveIcon/);
  assert.match(script, /popupConfirmIcon/);
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
  const actions = {
    classList: fakeClassList(),
    querySelector: (selector: string) =>
      selector === "[data-recurrence-scope-cancel]" ? backButton : null,
  };
  const status = { className: "", textContent: "" };
  const modal = {
    dataset: { targetKind },
    contains: (node: unknown) => node === currentButton || node === futureButton,
    querySelector: (selector: string) => {
      if (selector === '[data-recurrence-scope="current"]') return currentButton;
      if (selector === '[data-recurrence-scope="current_and_future"]') return futureButton;
      if (selector === ".recurrence-scope-actions") return actions;
      if (selector === "[data-recurrence-scope-status]") return status;
      return null;
    },
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
    createElement: (tagName: string) => {
      assert.equal(tagName, "style");
      return fakeStyle();
    },
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

  const currentLabel = targetKind === "card"
    ? "Alterar somente esta compra"
    : "Alterar somente este lançamento";
  const futureLabel = targetKind === "card"
    ? "Alterar esta compra e as próximas"
    : "Alterar este lançamento e os próximos";
  assert.match(currentButton.innerHTML, new RegExp(currentLabel));
  assert.match(futureButton.innerHTML, new RegExp(futureLabel));
  assert.match(currentButton.innerHTML, /recurrence-scope-option-description/);
  assert.match(futureButton.innerHTML, /recurrence-scope-option-description/);
  assert.equal(currentButton.classList.has("recurrence-scope-option"), true);
  assert.equal(futureButton.classList.has("recurrence-scope-option"), true);
  assert.equal(backButton.classList.has("recurrence-scope-back"), true);
  assert.equal(actions.classList.has("recurrence-scope-actions-refactored"), true);
  assert.equal(currentButton.dataset.explicitEditScope, "current_only");
  assert.equal(futureButton.dataset.explicitEditScope, "current_and_future");
  assert.equal(appendedStyles.length, 1);
  assert.match(appendedStyles[0]?.textContent ?? "", /grid-template-columns: repeat\(2/);
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
  attributes: Record<string, string>;
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
      this.textContent = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    },
    textContent: "",
    classList: fakeClassList(),
    attributes: {},
    setAttribute(name: string, value: string) {
      this.attributes[name] = value;
    },
    closest: () => null,
  };
  button.closest = (selector: string) =>
    selector === "[data-explicit-edit-scope]" && button.dataset.explicitEditScope
      ? button
      : null;
  return button;
}

interface FakeStyle {
  textContent: string;
  attributes: Record<string, string>;
  setAttribute(name: string, value: string): void;
}

function fakeStyle(): FakeStyle {
  return {
    textContent: "",
    attributes: {},
    setAttribute(name: string, value: string) {
      this.attributes[name] = value;
    },
  };
}

interface FakeEvent {
  target: FakeButton;
  preventDefault(): void;
  stopImmediatePropagation(): void;
}
