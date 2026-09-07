import assert from "node:assert/strict";

import { renderAccountsCardsApiFormScript } from "./runtime.js";

await transportFailureRestoresRecoverableFormState();

async function transportFailureRestoresRecoverableFormState(): Promise<void> {
  const status = {
    className: "form-status muted",
    textContent: "",
    setAttribute() {},
  };
  const submitButton = { disabled: false };
  const loadingState = { hidden: true };
  let submitHandler:
    | ((event: { preventDefault(): void }) => Promise<void>)
    | undefined;

  const form = {
    dataset: {
      apiPath: "/api/accounts/account-test",
      apiMethod: "PATCH",
      confirm: "",
    },
    querySelector(selector: string) {
      if (selector === ":scope > [data-form-status]") return status;
      if (selector === 'button[type="submit"]') return submitButton;
      return null;
    },
    addEventListener(
      type: string,
      listener: (event: { preventDefault(): void }) => Promise<void>,
    ) {
      if (type === "submit") submitHandler = listener;
    },
    appendChild() {},
  };

  const document = {
    activeElement: null,
    querySelector(selector: string) {
      if (selector === "#accounts-cards-confirm-dialog") return null;
      if (selector === "[data-resource-loading]") return loadingState;
      return null;
    },
    querySelectorAll(selector: string) {
      return selector === "[data-api-form]" ? [form] : [];
    },
    createElement() {
      return status;
    },
  };

  class FakeFormData {
    forEach(): void {}
  }
  class FakeHTMLElement {}

  let rejectFetch: ((reason?: unknown) => void) | undefined;
  const fetch = () =>
    new Promise<Response>((_resolve, reject) => {
      rejectFetch = reject;
    });
  const window = {
    location: { reload() {} },
    setTimeout,
  };

  const script = renderAccountsCardsApiFormScript()
    .replace(/^\s*<script>\s*/, "")
    .replace(/\s*<\/script>\s*$/, "");
  const execute = new Function(
    "document",
    "FormData",
    "fetch",
    "window",
    "HTMLElement",
    script,
  );
  execute(document, FakeFormData, fetch, window, FakeHTMLElement);

  assert.ok(submitHandler, "The API form submit listener was not registered.");
  const submission = submitHandler({ preventDefault() {} });
  await Promise.resolve();

  assert.equal(
    loadingState.hidden,
    false,
    "Loading should be visible while the request is pending.",
  );
  assert.equal(
    submitButton.disabled,
    true,
    "Submit should be disabled while the request is pending.",
  );
  assert.match(status.textContent, /Salvando/i);

  assert.ok(rejectFetch, "The transport rejection hook was not captured.");
  rejectFetch(new TypeError("Failed to fetch"));
  await submission;

  assert.equal(
    loadingState.hidden,
    true,
    "Loading must be hidden after a transport failure.",
  );
  assert.equal(
    submitButton.disabled,
    false,
    "Submit must be re-enabled after a transport failure.",
  );
  assert.match(status.className, /error/);
  assert.match(status.textContent, /Verifique sua conexão e tente novamente/i);
}
