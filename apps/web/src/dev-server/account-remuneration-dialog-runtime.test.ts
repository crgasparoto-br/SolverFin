import assert from "node:assert/strict";
import vm from "node:vm";

import { enhanceAccountsCardsTabs } from "./accounts-cards-enhancement.js";

void main();

async function main(): Promise<void> {
  const html = enhanceAccountsCardsTabs(
    '<!doctype html><html><head></head><body><section data-tab-panel="accounts"></section></body></html>',
  );
  const script = extractEnhancementScript(html);
  const harness = new FakeHarness();
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
        message: parsed.error?.message ?? "Não foi possível concluir a operação.",
      };
    },
    renderAccount: () => {
      harness.renderCount += 1;
    },
    fetch: async (input: unknown, init?: Record<string, unknown>) => {
      harness.requests.push({ input: String(input), init });
      return (
        harness.responses.shift() ??
        fakeResponse(false, { error: { message: "Resposta de teste ausente." } })
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
    createDialog: (model: FakeModel, configuration?: Record<string, unknown>) => FakeDialog;
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
    fakeResponse(false, { error: { message: "Percentual recusado pela API." } }),
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

interface FakeRequest {
  input: string;
  init: Record<string, unknown> | undefined;
}

interface FakeModel {
  accountId: string;
  name: string;
  action: FakeControl;
  article: { appendChild(dialog: FakeDialog): void };
}

class FakeHarness {
  readonly requests: FakeRequest[] = [];
  readonly responses: FakeResponse[] = [];
  renderCount = 0;
  readonly document = {
    createElement: (tagName: string): FakeDialog => {
      assert.equal(tagName, "dialog");
      return new FakeDialog();
    },
  };
}

class FakeControl {
  disabled = false;
  focused = false;

  constructor(public value: string) {}

  focus(): void {
    this.focused = true;
  }
}

class FakeCancelButton {
  private clickListener: (() => void) | undefined;

  addEventListener(type: string, listener: () => void): void {
    if (type === "click") this.clickListener = listener;
  }

  click(): void {
    this.clickListener?.();
  }
}

class FakeForm {
  readonly elements = {
    enabled: new FakeControl("false"),
    remunerationPercent: new FakeControl("100"),
    startsOn: new FakeControl("2026-07-15"),
    categoryId: new FakeControl(""),
  };
  readonly status = { className: "", textContent: "" };
  readonly submitButton = { disabled: false };
  private submitListener: ((event: { preventDefault(): void }) => void) | undefined;

  reportValidity(): boolean {
    return true;
  }

  querySelector(selector: string): unknown {
    if (selector === 'button[type="submit"]') return this.submitButton;
    if (selector === "[data-account-remuneration-status]") return this.status;
    return null;
  }

  addEventListener(type: string, listener: (event: { preventDefault(): void }) => void): void {
    if (type === "submit") this.submitListener = listener;
  }

  submit(): void {
    this.submitListener?.({ preventDefault(): void {} });
  }
}

class FakeDialog {
  id = "";
  className = "";
  innerHTML = "";
  open = false;
  readonly attributes = new Map<string, string>();
  readonly form = new FakeForm();
  readonly cancel = new FakeCancelButton();
  private readonly closeListeners: Array<() => void> = [];

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  querySelector(selector: string): unknown {
    if (selector === "[data-account-remuneration-form]") return this.form;
    if (selector === "[data-account-remuneration-cancel]") return this.cancel;
    if (selector === "select, input, button") return this.form.elements.enabled;
    return null;
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === "close") this.closeListeners.push(listener);
  }

  showModal(): void {
    this.open = true;
  }

  close(): void {
    this.open = false;
    this.closeListeners.forEach((listener) => listener());
  }

  pressEscape(): void {
    this.close();
  }
}

function createModel(): FakeModel {
  const action = new FakeControl("");
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
  const match = /<script data-accounts-cards-direct-enhancement>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match?.[1], "script de remuneração não encontrado");
  return match[1];
}

function extractSegment(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `segmento ${startMarker} não encontrado`);
  return source.slice(start, end);
}

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
