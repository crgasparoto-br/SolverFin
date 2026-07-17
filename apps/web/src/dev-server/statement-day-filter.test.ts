import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";

import {
  statementPresentationScript,
  statementPresentationStyles,
} from "./statement-presentation.js";

function statementDayFilterRunsBehaviorally(): void {
  const harness = createHarness("?accountId=account-1&month=2026-06&day=2026-06-15&sort=date_desc");

  assert.equal(harness.dayInput.value, "2026-06-15");
  assert.equal(harness.dayInput.min, "2026-06-01");
  assert.equal(harness.dayInput.max, "2026-06-30");
  assert.equal(harness.clearButton.hidden, false);

  harness.dayInput.value = "2026-06-30";
  harness.dayInput.dispatch("change");

  const dailySubmission = harness.form.lastSubmission();
  assert.equal(dailySubmission.get("accountId"), "account-1");
  assert.equal(dailySubmission.get("month"), "2026-06");
  assert.equal(dailySubmission.get("day"), "2026-06-30");
  assert.equal(dailySubmission.get("sort"), "date_desc");

  harness.clearButton.dispatch("click");

  const monthlySubmission = harness.form.lastSubmission();
  assert.equal(monthlySubmission.get("accountId"), "account-1");
  assert.equal(monthlySubmission.get("month"), "2026-06");
  assert.equal(monthlySubmission.get("day"), null);
  assert.equal(monthlySubmission.get("sort"), "date_desc");
  assert.equal(harness.dayInput.value, "");
  assert.equal(harness.dayInput.disabled, true);
  assert.equal(harness.clearButton.hidden, true);
}

function statementDayFilterSupportsMonthBoundaries(): void {
  const firstDay = createHarness("?month=2026-06&day=2026-06-01");
  assert.equal(firstDay.dayInput.value, "2026-06-01");
  assert.equal(firstDay.clearButton.hidden, false);

  const lastDay = createHarness("?month=2026-06&day=2026-06-30");
  assert.equal(lastDay.dayInput.value, "2026-06-30");
  assert.equal(lastDay.clearButton.hidden, false);

  const outsideMonth = createHarness("?month=2026-06&day=2026-07-01");
  assert.equal(outsideMonth.dayInput.value, "");
  assert.equal(outsideMonth.clearButton.hidden, true);
}

function statementDayFilterClearsWhenMonthChanges(): void {
  const harness = createHarness("?month=2026-06&day=2026-06-15");

  harness.monthInput.value = "2026-07";
  harness.monthInput.dispatch("change");

  assert.equal(harness.dayInput.value, "");
  assert.equal(harness.dayInput.min, "2026-07-01");
  assert.equal(harness.dayInput.max, "2026-07-31");
  assert.equal(harness.clearButton.hidden, true);
}

function statementDayFilterIncludesResponsiveStyles(): void {
  const styles = statementPresentationStyles();

  assert.match(styles, /\.account-filter \.statement-day-field/);
  assert.match(styles, /grid-template-columns: minmax\(12rem, 1\.2fr\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
}

interface FakeEvent {
  target: FakeElement;
}

type FakeListener = (event: FakeEvent) => void;

class FakeElement {
  id = "";
  name = "";
  type = "";
  value = "";
  min = "";
  max = "";
  disabled = false;
  hidden = false;
  className = "";
  textContent = "";
  htmlFor = "";
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  parent?: FakeElement;

  private readonly listeners = new Map<string, FakeListener[]>();
  private readonly attributes = new Map<string, string>();

  constructor(readonly tagName: string) {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) this.addChild(node);
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.children.splice(0, this.children.length);
    this.append(...nodes);
  }

  addEventListener(type: string, listener: FakeListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatch(type: string): void {
    const event = { target: this };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  closest(selector: string): FakeElement | null {
    if (selector === "form") {
      let current: FakeElement | undefined = this;
      while (current) {
        if (current.tagName === "form") return current;
        current = current.parent;
      }
    }

    return null;
  }

  querySelector(selector: string): FakeElement | null {
    if (selector === "[data-statement-day-field]") {
      return this.find((element) => "statementDayField" in element.dataset);
    }
    if (selector === "[data-month-current]") {
      return this.find((element) => "monthCurrent" in element.dataset);
    }
    if (selector === "[data-clear-statement-day]") {
      return this.find((element) => "clearStatementDay" in element.dataset);
    }
    if (selector === "#filter-day") {
      return this.find((element) => element.id === "filter-day");
    }

    return null;
  }

  insertBefore(node: FakeElement, reference: FakeElement | null): void {
    node.parent = this;
    const referenceIndex = reference ? this.children.indexOf(reference) : -1;
    if (referenceIndex < 0) this.children.push(node);
    else this.children.splice(referenceIndex, 0, node);
  }

  contains(node: FakeElement): boolean {
    return this === node || this.children.some((child) => child.contains(node));
  }

  protected addChild(node: FakeElement): void {
    node.parent = this;
    this.children.push(node);
  }

  protected find(predicate: (element: FakeElement) => boolean): FakeElement | null {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const nested = child.find(predicate);
      if (nested) return nested;
    }

    return null;
  }
}

class FakeForm extends FakeElement {
  readonly submissions: URLSearchParams[] = [];

  constructor() {
    super("form");
  }

  requestSubmit(): void {
    this.dispatch("submit");
    const parameters = new URLSearchParams();
    for (const control of this.collectControls()) {
      if (!control.name || control.disabled) continue;
      parameters.append(control.name, control.value);
    }
    this.submissions.push(parameters);
  }

  lastSubmission(): URLSearchParams {
    const submission = this.submissions.at(-1);
    assert.ok(submission, "Expected the filter form to be submitted.");
    return submission;
  }

  private collectControls(): FakeElement[] {
    const controls: FakeElement[] = [];
    const visit = (element: FakeElement): void => {
      if (element.name) controls.push(element);
      for (const child of element.children) visit(child);
    };
    visit(this);
    return controls;
  }
}

class FakeDocument {
  private readonly listeners = new Map<string, FakeListener[]>();
  readonly heading = new FakeElement("p");

  constructor(readonly monthInput: FakeElement) {}

  querySelector(selector: string): FakeElement | null {
    if (selector === "#filter-month") return this.monthInput;
    if (selector === ".statement-heading > div > .muted") return this.heading;
    return null;
  }

  querySelectorAll(): FakeElement[] {
    return [];
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }

  createTextNode(text: string): FakeElement {
    const node = new FakeElement("#text");
    node.textContent = text;
    return node;
  }

  getElementById(): null {
    return null;
  }

  addEventListener(type: string, listener: FakeListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
}

function createHarness(search: string): {
  form: FakeForm;
  monthInput: FakeElement;
  dayInput: FakeElement;
  clearButton: FakeElement;
} {
  const form = new FakeForm();
  const accountInput = input("accountId", "account-1");
  const monthInput = input("month", "2026-06");
  monthInput.id = "filter-month";
  const sortInput = input("sort", "date_desc");
  const currentMonthButton = new FakeElement("button");
  currentMonthButton.dataset.monthCurrent = "";
  form.append(accountInput, monthInput, sortInput, currentMonthButton);

  const document = new FakeDocument(monthInput);
  const script = statementPresentationScript()
    .replace(/^\s*<script>\s*/, "")
    .replace(/\s*<\/script>\s*$/, "");

  runInNewContext(script, {
    Date,
    Intl,
    URLSearchParams,
    document,
    window: {
      location: { search },
      addEventListener: () => undefined,
    },
  });

  const dayInput = form.querySelector("#filter-day");
  const clearButton = form.querySelector("[data-clear-statement-day]");
  assert.ok(dayInput, "Expected the day input to be inserted.");
  assert.ok(clearButton, "Expected the clear-day button to be inserted.");

  return { form, monthInput, dayInput, clearButton };
}

function input(name: string, value: string): FakeElement {
  const element = new FakeElement("input");
  element.name = name;
  element.value = value;
  return element;
}

statementDayFilterRunsBehaviorally();
statementDayFilterSupportsMonthBoundaries();
statementDayFilterClearsWhenMonthChanges();
statementDayFilterIncludesResponsiveStyles();
