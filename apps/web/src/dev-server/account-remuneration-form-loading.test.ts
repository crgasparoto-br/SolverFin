import assert from "node:assert/strict";
import vm from "node:vm";

import { enhanceAccountsCardsTabs } from "./accounts-cards-enhancement.js";

void main();

async function main(): Promise<void> {
  const html = enhanceAccountsCardsTabs(`<!doctype html><html><head></head><body>
    <section data-tab-panel="accounts">
      <form class="edit-grid" data-api-path="/api/accounts/account-1" data-api-method="PUT">
        <button type="submit">Salvar</button>
      </form>
    </section>
  </body></html>`);
  const script = extractEnhancementScript(html);
  const inserted: FakeElement[] = [];
  const submitListeners: unknown[] = [];
  const submit = createFakeElement("button");
  const form = {
    dataset: { apiPath: "/api/accounts/account-1", apiMethod: "PUT" } as Record<string, string>,
    elements: {},
    querySelector(selector: string): FakeElement | null {
      if (selector === 'button[type="submit"]') return submit;
      return inserted.find((item) => item.matches(selector)) ?? null;
    },
    insertBefore(element: FakeElement): void {
      inserted.push(element);
    },
    appendChild(element: FakeElement): void {
      inserted.push(element);
    },
    addEventListener(type: string, listener: unknown): void {
      if (type === "submit") submitListeners.push(listener);
    },
  };

  const document = {
    readyState: "complete",
    querySelector(): null {
      return null;
    },
    querySelectorAll(selector: string): unknown[] {
      return selector.includes("form.edit-grid") ? [form] : [];
    },
    createElement(tagName: string): FakeElement {
      return createFakeElement(tagName);
    },
    addEventListener(): void {},
  };

  const fetchCalls: string[] = [];
  const context = {
    document,
    Event: class Event {
      constructor(
        readonly type: string,
        readonly options?: Record<string, unknown>,
      ) {}
    },
    FormData: class FormData {},
    fetch: async (input: unknown) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url.includes("account-remuneration")) {
        return fakeResponse(false, { error: { message: "temporariamente indisponível" } });
      }
      return fakeResponse(true, { categories: [] });
    },
    window: {
      localStorage: { getItem: () => null, setItem: () => undefined },
      location: { reload: () => undefined },
      setTimeout: (callback: () => void) => callback(),
    },
    console,
  };

  vm.runInNewContext(script, context);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(fetchCalls.length, 2);
  assert.equal(
    submitListeners.length,
    0,
    "a falha de carga não deve interceptar o submit da conta",
  );
  assert.equal(form.dataset.remunerationConfigurationLoaded, undefined);
  assert.equal(
    inserted.some((item) => item.attributes.has("data-account-remuneration-fields")),
    false,
  );
  const warning = inserted.find((item) =>
    item.attributes.has("data-account-remuneration-load-error"),
  );
  assert.ok(warning);
  assert.match(warning.textContent, /sem alterar a configuração de remuneração existente/);
}

interface FakeElement {
  tagName: string;
  className: string;
  textContent: string;
  innerHTML: string;
  attributes: Map<string, string>;
  dataset: Record<string, string>;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  matches(selector: string): boolean;
}

function createFakeElement(tagName: string): FakeElement {
  const attributes = new Map<string, string>();
  return {
    tagName,
    className: "",
    textContent: "",
    innerHTML: "",
    attributes,
    dataset: {},
    setAttribute(name: string, value: string): void {
      attributes.set(name, value);
    },
    removeAttribute(name: string): void {
      attributes.delete(name);
    },
    matches(selector: string): boolean {
      const match = /^\[([^\]]+)\]$/.exec(selector);
      return match?.[1] ? attributes.has(match[1]) : false;
    },
  };
}

function fakeResponse(
  ok: boolean,
  body: unknown,
): {
  ok: boolean;
  json: () => Promise<unknown>;
} {
  return { ok, json: async () => body };
}

function extractEnhancementScript(html: string): string {
  const match = /<script data-accounts-cards-direct-enhancement>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match?.[1], "script de remuneração não encontrado");
  return match[1];
}
