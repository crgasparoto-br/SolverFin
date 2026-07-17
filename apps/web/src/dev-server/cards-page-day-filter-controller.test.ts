import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";

import { invoiceMonthNavigationControllerScript } from "./cards-page-month-navigation.js";

interface FakeEvent {
  target: FakeElement;
  defaultPrevented: boolean;
  preventDefault(): void;
}

type FakeListener = (event: FakeEvent) => void;

class FakeElement {
  name = "";
  value = "";
  min = "";
  max = "";
  disabled = false;

  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, FakeListener[]>();

  constructor(readonly tagName: string) {}

  addEventListener(type: string, listener: FakeListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatch(type: string): FakeEvent {
    const event = fakeEvent(this);
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return event;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class FakeInput extends FakeElement {
  constructor(name: string, value: string) {
    super("input");
    this.name = name;
    this.value = value;
  }
}

class FakeForm extends FakeElement {
  readonly submissions: URLSearchParams[] = [];
  private readonly captureChangeListeners: FakeListener[] = [];
  private readonly bubbleChangeListeners: FakeListener[] = [];
  private readonly submitListeners: FakeListener[] = [];

  constructor(
    readonly monthInput: FakeInput,
    readonly invoiceInput: FakeInput,
    readonly dayInput: FakeInput,
    readonly searchStateInput: FakeInput,
    readonly reconciliationStateInput: FakeInput,
    readonly cardInput: FakeInput,
    readonly clearDayLink: FakeElement,
  ) {
    super("form");
  }

  override addEventListener(
    type: string,
    listener: FakeListener,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (type === "change") {
      const capture = options === true || (typeof options === "object" && options.capture === true);
      if (capture) this.captureChangeListeners.push(listener);
      else this.bubbleChangeListeners.push(listener);
      return;
    }
    if (type === "submit") {
      this.submitListeners.push(listener);
      return;
    }
    super.addEventListener(type, listener);
  }

  querySelector(selector: string): FakeElement | null {
    if (selector === "[data-invoice-month-input]") return this.monthInput;
    if (selector === "[data-invoice-input]") return this.invoiceInput;
    if (selector === "[data-card-day-input]") return this.dayInput;
    if (selector === "[data-clear-card-day]") return this.clearDayLink;
    if (selector === "[data-purchase-search-state]") return this.searchStateInput;
    if (selector === "[data-purchase-reconciliation-state]") {
      return this.reconciliationStateInput;
    }
    return null;
  }

  dispatchChange(target: FakeElement): void {
    const event = fakeEvent(target);
    for (const listener of this.captureChangeListeners) listener(event);
    for (const listener of this.bubbleChangeListeners) listener(event);
  }

  requestSubmit(): void {
    const event = fakeEvent(this);
    for (const listener of this.submitListeners) listener(event);
    const parameters = new URLSearchParams();
    for (const control of this.controls()) {
      if (!control.name || control.disabled) continue;
      parameters.append(control.name, control.value);
    }
    this.submissions.push(parameters);
  }

  lastSubmission(): URLSearchParams {
    const submission = this.submissions.at(-1);
    assert.ok(submission);
    return submission;
  }

  private controls(): FakeInput[] {
    return [
      this.cardInput,
      this.monthInput,
      this.invoiceInput,
      this.dayInput,
      this.searchStateInput,
      this.reconciliationStateInput,
    ];
  }
}

class FakeDocument {
  constructor(
    readonly form: FakeForm,
    readonly searchInput: FakeInput,
    readonly toggles: FakeElement[],
    readonly links: FakeElement[],
  ) {}

  querySelector(selector: string): FakeElement | null {
    if (selector === 'form.filter-form[action="/cartoes"]') return this.form;
    if (selector === "[data-purchase-search]") return this.searchInput;
    return null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector === "[data-reconciliation-toggle]") return this.toggles;
    if (selector === ".month-nav-link,[data-invoice-current],[data-clear-card-day]") {
      return this.links;
    }
    return [];
  }
}

function fakeEvent(target: FakeElement): FakeEvent {
  return {
    target,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

function link(href: string): FakeElement {
  const element = new FakeElement("a");
  element.setAttribute("href", href);
  return element;
}

const cardInput = new FakeInput("cardId", "card-1");
const monthInput = new FakeInput("month", "2028-01");
const invoiceInput = new FakeInput("invoiceId", "invoice-1");
const dayInput = new FakeInput("day", "2028-01-10");
dayInput.min = "2028-01-01";
dayInput.max = "2028-01-31";
const searchStateInput = new FakeInput("search", "");
searchStateInput.disabled = true;
const reconciliationStateInput = new FakeInput("reconciliation", "unreconciled,reconciled");
reconciliationStateInput.disabled = true;
const searchInput = new FakeInput("", "");
const unreconciledToggle = new FakeElement("button");
unreconciledToggle.setAttribute("data-reconciliation-toggle", "unreconciled");
unreconciledToggle.setAttribute("aria-pressed", "true");
const reconciledToggle = new FakeElement("button");
reconciledToggle.setAttribute("data-reconciliation-toggle", "reconciled");
reconciledToggle.setAttribute("aria-pressed", "true");
const clearDayLink = link("/cartoes?cardId=card-1&month=2028-01&day=2028-01-10&sort=amount_desc");
const previousLink = link("/cartoes?cardId=card-1&month=2027-12&sort=amount_desc");
const currentLink = link("/cartoes?cardId=card-1&month=2028-01&sort=amount_desc");
const form = new FakeForm(
  monthInput,
  invoiceInput,
  dayInput,
  searchStateInput,
  reconciliationStateInput,
  cardInput,
  clearDayLink,
);
const document = new FakeDocument(
  form,
  searchInput,
  [unreconciledToggle, reconciledToggle],
  [clearDayLink, previousLink, currentLink],
);

form.addEventListener("change", (event) => {
  if (event.target.name !== "cardId") return;
  invoiceInput.value = "";
  form.requestSubmit();
});
reconciledToggle.addEventListener("click", () => {
  const active = reconciledToggle.getAttribute("aria-pressed") === "true";
  reconciledToggle.setAttribute("aria-pressed", String(!active));
});

const script = invoiceMonthNavigationControllerScript()
  .replace(/^\s*<script[^>]*>\s*/, "")
  .replace(/\s*<\/script>\s*$/, "");
runInNewContext(script, {
  Array,
  HTMLInputElement: FakeInput,
  URL,
  document,
  window: { location: { origin: "http://localhost" } },
});

form.dispatchChange(cardInput);
const cardSubmission = form.lastSubmission();
assert.equal(cardSubmission.get("cardId"), "card-1");
assert.equal(cardSubmission.get("invoiceId"), "");
assert.equal(cardSubmission.get("day"), null);
assert.equal(dayInput.value, "");
assert.equal(dayInput.disabled, true);

searchInput.value = "mercado";
searchInput.dispatch("input");
assert.equal(searchStateInput.value, "mercado");
assert.equal(searchStateInput.disabled, false);
assert.match(previousLink.getAttribute("href") ?? "", /search=mercado/);

reconciledToggle.dispatch("click");
assert.equal(reconciliationStateInput.value, "unreconciled");
assert.equal(reconciliationStateInput.disabled, false);
assert.match(previousLink.getAttribute("href") ?? "", /reconciliation=unreconciled/);

dayInput.value = "2028-01-10";
dayInput.disabled = false;
const clearEvent = clearDayLink.dispatch("click");
assert.equal(clearEvent.defaultPrevented, true);
const fullInvoiceSubmission = form.lastSubmission();
assert.equal(fullInvoiceSubmission.get("day"), null);
assert.equal(fullInvoiceSubmission.get("search"), "mercado");
assert.equal(fullInvoiceSubmission.get("reconciliation"), "unreconciled");
