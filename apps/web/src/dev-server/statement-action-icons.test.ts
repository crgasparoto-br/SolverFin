import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";

import { statementActionIconsController } from "./statement-action-icons.js";

const transferButton = fakeButton("transfer");
const expenseButton = fakeButton("expense");
const incomeButton = fakeButton("income");
const recurrenceLabel = fakeLabel();
const recurrenceSvg = fakeSvg();
const recurrenceIndicator = fakeRecurrenceIndicator(recurrenceLabel, recurrenceSvg);
const quickActionSelector =
  '.statement-heading-actions button[data-open-modal][data-quick-kind], .account-summary .quick-actions button[data-open-modal][data-quick-kind]';

const document = {
  body: {},
  querySelectorAll: (selector: string) => {
    if (selector === quickActionSelector) return [transferButton, expenseButton, incomeButton];
    if (selector === ".recurrence-indicator") return [recurrenceIndicator];
    return [];
  },
};

runInNewContext(statementActionIconsController(), { document });

assert.match(transferButton.insertedHtml, /data-statement-action-icon/);
assert.match(transferButton.insertedHtml, /m17 2 4 4-4 4/);
assert.equal(transferButton.attributes.title, "Transferir entre contas");
assert.match(expenseButton.insertedHtml, /M12 5v14/);
assert.equal(expenseButton.attributes.title, "Registrar nova despesa");
assert.match(incomeButton.insertedHtml, /m5 12 7-7 7 7/);
assert.equal(incomeButton.attributes.title, "Registrar nova receita");

assert.equal(recurrenceIndicator.attributes.title, "Lançamento recorrente");
assert.equal(recurrenceIndicator.attributes["aria-label"], "Lançamento recorrente");
assert.equal(recurrenceIndicator.attributes.role, "img");
assert.equal(recurrenceIndicator.attributes.tabindex, "0");
assert.equal(recurrenceIndicator.dataset.recurrenceIconOnly, "true");
assert.equal(recurrenceIndicator.style.gap, "0");
assert.equal(recurrenceIndicator.style.padding, "3px");
assert.equal(recurrenceLabel.hidden, true);
assert.equal(recurrenceLabel.attributes["aria-hidden"], "true");
assert.equal(recurrenceSvg.attributes.width, "14");
assert.equal(recurrenceSvg.attributes.height, "14");
assert.equal(recurrenceSvg.style.width, "14px");
assert.equal(recurrenceSvg.style.height, "14px");

interface FakeButton {
  dataset: { quickKind: string };
  insertedHtml: string;
  attributes: Record<string, string>;
  querySelector(selector: string): object | null;
  insertAdjacentHTML(position: string, html: string): void;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

function fakeButton(kind: string): FakeButton {
  let insertedHtml = "";
  const attributes: Record<string, string> = {};
  return {
    dataset: { quickKind: kind },
    get insertedHtml() {
      return insertedHtml;
    },
    set insertedHtml(value: string) {
      insertedHtml = value;
    },
    attributes,
    querySelector: (selector: string) =>
      selector === "svg" && insertedHtml.includes("<svg") ? {} : null,
    insertAdjacentHTML: (_position: string, html: string) => {
      insertedHtml = html + insertedHtml;
    },
    getAttribute: (name: string) => attributes[name] ?? null,
    setAttribute: (name: string, value: string) => {
      attributes[name] = value;
    },
  };
}

interface FakeLabel {
  hidden: boolean;
  attributes: Record<string, string>;
  setAttribute(name: string, value: string): void;
}

function fakeLabel(): FakeLabel {
  const attributes: Record<string, string> = {};
  return {
    hidden: false,
    attributes,
    setAttribute: (name: string, value: string) => {
      attributes[name] = value;
    },
  };
}

interface FakeSvg {
  attributes: Record<string, string>;
  style: Record<string, string>;
  setAttribute(name: string, value: string): void;
}

function fakeSvg(): FakeSvg {
  const attributes: Record<string, string> = {};
  return {
    attributes,
    style: {},
    setAttribute: (name: string, value: string) => {
      attributes[name] = value;
    },
  };
}

interface FakeRecurrenceIndicator {
  dataset: Record<string, string>;
  style: Record<string, string>;
  attributes: Record<string, string>;
  querySelector(selector: string): FakeLabel | FakeSvg | null;
  setAttribute(name: string, value: string): void;
}

function fakeRecurrenceIndicator(
  label: FakeLabel,
  svg: FakeSvg,
): FakeRecurrenceIndicator {
  const attributes: Record<string, string> = {};
  return {
    dataset: {},
    style: {},
    attributes,
    querySelector: (selector: string) => {
      if (selector === "span") return label;
      if (selector === "svg") return svg;
      return null;
    },
    setAttribute: (name: string, value: string) => {
      attributes[name] = value;
    },
  };
}
