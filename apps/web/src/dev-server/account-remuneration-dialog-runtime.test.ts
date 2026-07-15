import assert from "node:assert/strict";
import vm from "node:vm";

import { enhanceAccountsCardsTabs } from "./accounts-cards-enhancement.js";

void main();

async function main(): Promise<void> {
  const html = enhanceAccountsCardsTabs(
    '<!doctype html><html><head></head><body><section data-tab-panel="accounts"></section></body></html>',
  );
  const script = extractEnhancementScript(html);
  const harness = createHarness();
  const configurationsByAccount = new Map<string, unknown>();
  const context: Record<string, unknown> = {
    document: harness.document,
    escapeHtml: (value: unknown) => String(value ?? ""),
    renderCategoryOptions: () => '<option value="income-1">Receitas</option>',
    today: () => "2026-07-15",
    remunerationEndpoint: "/api/account-remuneration/configurations",
    configurationsByAccount,
    readResponse: async (response: FakeResponse) => {
      const body = await response.json();
      const parsed = body as { error?: { message?: string } };
      return {
        body,
        message:
          parsed.error?.message ?? "Não foi possível concluir a operação.",
      };
    },
    renderAccount: () => {
      harness.renderCount += 1;
    },
    fetch: async (input: unknown, init?: Record<string, unknown>) => {
      harness.requests.push({ input: String(input), init });
      return (
        harness.responses.shift() ??
        fakeResponse(false, {
          error: { message: "Resposta de teste ausente." },
        })
      );
    },
    console,
  };

  vm.runInNewContext(
    [
      extractSegment(
        script,
        "function readRemunerationPayload",
        "async function saveConfiguration",
      ),
      extractSegment(
        script,
        "async function saveConfiguration",
        "async function loadAccountRemuneration",
      ),
      extractSegment(script, "function createDialog", "function openDialog"),
      extractSegment(script, "function openDialog", "function renderAccount"),
      "globalThis.runtime = { createDialog, openDialog };",
    ].join("\n"),
    context,
  );

  const runtime = context.runtime as {
    createDialog: (
      model: FakeModel,
      configuration?: Record<string, unknown>,
    ) => FakeDialog;
    openDialog: (model: FakeModel, dialog: FakeDialog) => void;
  };
  const model = createModel();
  const dialog = runtime.createDialog(model);

  assert.equal(
    dialog.attributes.get("aria-labelledby"),
    "account-remuneration-dialog-account-1-title",
  );
  assert.match(html, /Remuneração pelo CDI —/);
  assert.match(html, /MutationObserver/);

  runtime.openDialog(model, dialog);
  assert.equal(dialog.open, true);
  assert.equal(dialog.form.elements.enabled.focused, true);

  dialog.form.elements.enabled.value = "true";
  dialog.form.elements.remunerationPercent.value = "112.5";
  dialog.form.elements.startsOn.value = "2026-07-20";
  dialog.form.elements.categoryId.value = "income-1";
  harness.responses.push(
    fakeResponse(false, {
      error: { message: "Percentual recusado pela API." },
    }),
  );
  dialog.form.submit();
  await flushAsyncWork();

  assert.equal(dialog.open, true);
  assert.equal(dialog.form.status.textContent, "Percentual recusado pela API.");
  assert.equal(dialog.form.elements.remunerationPercent.value, "112.5");
  assert.equal(dialog.form.elements.startsOn.value, "2026-07-20");
  assert.deepEqual(JSON.parse(String(harness.requests.at(-1)?.init?.body)), {
    enabled: true,
    remunerationPercent: 112.5,
    startsOn: "2026-07-20",
    categoryId: "income-1",
  });

  harness.responses.push(
    fakeResponse(true, {
      configuration: {
        accountId: "account-1",
        enabled: true,
        remunerationPercent: 112.5,
        startsOn: "2026-07-20",
        categoryId: "income-1",
      },
    }),
  );
  dialog.form.submit();
  await flushAsyncWork();

  assert.equal(dialog.open, false);
  assert.equal(model.action.focused, true);
  assert.equal(harness.renderCount, 1);
  assert.equal(configurationsByAccount.has("account-1"), true);

  const cancelModel = createModel();
  const cancelDialog = runtime.createDialog(cancelModel);
  runtime.openDialog(cancelModel, cancelDialog);
  cancelDialog.cancel.click();
  assert.equal(cancelDialog.open, false);
  assert.equal(cancelModel.action.focused, true);

  const escapeModel = createModel();
  const escapeDialog = runtime.createDialog(escapeModel);
  runtime.openDialog(escapeModel, escapeDialog);
  escapeDialog.pressEscape();
  assert.equal(escapeDialog.open, false);
  assert.equal(escapeModel.action.focused, true);
}

interface FakeResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

interface FakeControl {
  value: string;
  disabled?: boolean;
  focused?: boolean;
  focus(): void;
}

interface FakeModel {
  accountId: string;
  name: string;
  action: FakeControl;
  article: { appendChild(dialog: FakeDialog): void };
}

interface FakeDialog {
  id: string;
  className: string;
  innerHTML: string;
  open: boolean;
  attributes: Map<string, string>;
  form: FakeForm;
  cancel: FakeCancelButton;
  setAttribute(name: string, value: string): void;
  querySelector(selector: string): unknown;
  addEventListener(type: string, listener: () => void): void;
  showModal(): void;
  close(): void;
  pressEscape(): void;
}

interface FakeCancelButton {
  addEventListener(type: string, listener: () => void): void;
  click(): void;
}

interface FakeForm {
  elements: Record<string, FakeControl>;
  status: { className: string; textContent: string };
  submitButton: { disabled: boolean };
  reportValidity(): boolean;
  querySelector(selector: string): unknown;
  addEventListener(
    type: string,
    listener: (event: { preventDefault(): void }) => void,
  ): void;
  submit(): void;
}

function createHarness(): {
  document: { createElement(tagName: string): FakeDialog };
  requests: Array<{ input: string; init?: Record<string, unknown> }>;
  responses: FakeResponse[];
  renderCount: number;
} {
  const harness = {
    requests: [] as Array<{ input: string; init?: Record<string, unknown> }>,
    responses: [] as FakeResponse[],
    renderCount: 0,
    document: {
      createElement(tagName: string): FakeDialog {
        assert.equal(tagName, "dialog");
        return createDialogElement();
      },
    },
  };
  return harness;
}

function createDialogElement(): FakeDialog {
  const closeListeners: Array<() => void> = [];
  const form = createForm();
  let cancelListener: (() => void) | undefined;
  const dialog = {
    id: "",
    className: "",
    innerHTML: "",
    open: false,
    attributes: new Map<string, string>(),
    form,
    cancel: {
      addEventListener(type: string, listener: () => void): void {
        if (type === "click") cancelListener = listener;
      },
      click(): void {
        cancelListener?.();
      },
    },
    setAttribute(name: string, value: string): void {
      dialog.attributes.set(name, value);
    },
    querySelector(selector: string): unknown {
      if (selector === "[data-account-remuneration-form]") return form;
      if (selector === "[data-account-remuneration-cancel]")
        return dialog.cancel;
      if (selector === "select, input, button") return form.elements.enabled;
      return null;
    },
    addEventListener(type: string, listener: () => void): void {
      if (type === "close") closeListeners.push(listener);
    },
    showModal(): void {
      dialog.open = true;
    },
    close(): void {
      dialog.open = false;
      closeListeners.forEach((listener) => listener());
    },
    pressEscape(): void {
      dialog.close();
    },
  } satisfies FakeDialog;

  return dialog;
}

function createForm(): FakeForm {
  let submitListener: ((event: { preventDefault(): void }) => void) | undefined;
  const control = (value: string): FakeControl => ({
    value,
    focus(): void {
      this.focused = true;
    },
  });
  const form = {
    elements: {
      enabled: control("false"),
      remunerationPercent: control("100"),
      startsOn: control("2026-07-15"),
      categoryId: control(""),
    },
    status: { className: "", textContent: "" },
    submitButton: { disabled: false },
    reportValidity: () => true,
    querySelector(selector: string): unknown {
      if (selector === 'button[type="submit"]') return form.submitButton;
      if (selector === "[data-account-remuneration-status]") return form.status;
      return null;
    },
    addEventListener(
      type: string,
      listener: (event: { preventDefault(): void }) => void,
    ): void {
      if (type === "submit") submitListener = listener;
    },
    submit(): void {
      submitListener?.({ preventDefault(): void {} });
    },
  } satisfies FakeForm;

  return form;
}

function createModel(): FakeModel {
  const action: FakeControl = {
    value: "",
    focused: false,
    focus(): void {
      this.focused = true;
    },
  };
  return {
    accountId: "account-1",
    name: "Conta principal",
    action,
    article: { appendChild(): void {} },
  };
}

function fakeResponse(ok: boolean, body: unknown): FakeResponse {
  return { ok, json: async () => body };
}

function extractEnhancementScript(html: string): string {
  const match =
    /<script data-accounts-cards-direct-enhancement>([\s\S]*?)<\/script>/.exec(
      html,
    );
  assert.ok(match?.[1], "script de remuneração não encontrado");
  return match[1];
}

function extractSegment(
  source: string,
  startMarker: string,
  endMarker: string,
): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(
    start >= 0 && end > start,
    `segmento ${startMarker} não encontrado`,
  );
  return source.slice(start, end);
}

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
