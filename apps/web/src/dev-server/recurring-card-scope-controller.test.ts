import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";

import { recurringCardScopeControllerScript } from "./recurring-card-scope-controller.js";

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  await assertScopeRequest("current", "current_only");
  await assertScopeRequest("current_and_future", "current_and_future");
}

async function assertScopeRequest(
  buttonKind: "current" | "current_and_future",
  expectedScope: string,
): Promise<void> {
  const requests: Array<{ path: string; init: { body?: string } }> = [];
  let clickListener: ((event: FakeEvent) => Promise<void>) | undefined;

  const currentButton = fakeButton();
  const futureButton = fakeButton();
  const status = { className: "", textContent: "" };
  const modal = {
    contains: (node: unknown) => node === currentButton || node === futureButton,
    querySelector: (selector: string) => {
      if (selector === '[data-recurrence-scope="current"]') return currentButton;
      if (selector === '[data-recurrence-scope="current_and_future"]') return futureButton;
      if (selector === "[data-recurrence-scope-status]") return status;
      return null;
    },
  };
  const form = {
    dataset: {
      method: "PATCH",
      path: "/api/credit-card-accounts/card-1/purchases/purchase-1",
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
        description: "Assinatura",
        categoryId: "category-1",
        cardInstrumentId: "instrument-1",
        recurrenceId: "recurrence-1",
      };
      return values[name] ?? "";
    }
  }

  const document = {
    querySelector: (selector: string) => {
      if (selector === '[data-recurrence-scope-modal][data-target-kind="card"]') return modal;
      if (selector === "[data-purchase-form]") return form;
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

  assert.equal(currentButton.textContent, "Alterar somente este lançamento");
  assert.equal(futureButton.textContent, "Alterar este lançamento e os próximos");
  assert.equal(currentButton.dataset.explicitEditScope, "current_only");
  assert.equal(futureButton.dataset.explicitEditScope, "current_and_future");
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
  assert.equal(requests[0]?.path, form.dataset.path);
  const payload = JSON.parse(requests[0]?.init.body ?? "{}") as Record<string, unknown>;
  assert.equal(payload.editScope, expectedScope);
}

interface FakeButton {
  dataset: Record<string, string>;
  disabled: boolean;
  textContent: string;
  closest(selector: string): FakeButton | null;
}

function fakeButton(): FakeButton {
  const button: FakeButton = {
    dataset: {},
    disabled: false,
    textContent: "",
    closest: () => null,
  };
  button.closest = (selector: string) =>
    selector === "[data-explicit-edit-scope]" && button.dataset.explicitEditScope
      ? button
      : null;
  return button;
}

interface FakeEvent {
  target: FakeButton;
  preventDefault(): void;
  stopImmediatePropagation(): void;
}
