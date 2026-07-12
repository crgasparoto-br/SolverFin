import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";

import {
  resolveStatementStatusPresentation,
  statementActionIconsController,
} from "./statement-action-icons.js";

const transferButton = fakeButton("transfer");
const expenseButton = fakeButton("expense");
const incomeButton = fakeButton("income");
const statementCurrentMonthButton = fakeButton();
const cardsCurrentMonthButton = fakeButton();
const statementMonthInput = fakeStyledNode();
const cardsMonthInput = fakeStyledNode();
const recurrenceLabel = fakeLabel();
const recurrenceSvg = fakeSvg();
const recurrenceIndicator = fakeRecurrenceIndicator(recurrenceLabel, recurrenceSvg);
const reconciledRow = fakeStatementRow({ status: "reconciled", effectiveOn: "2026-07-01" }, "R$ 10,00");
const postedRow = fakeStatementRow({ status: "posted", effectiveOn: "2026-07-02" }, "R$ 5,00");
const pendingRow = fakeStatementRow({ status: "suggested" }, "-R$ 15,00");
const plannedRow = fakeStatementRow({ status: "planned" }, "R$ 20,00");
const statementRows = [reconciledRow, postedRow, pendingRow, plannedRow];
const injectedStyles: FakeStyleElement[] = [];
const quickActionSelector =
  '.statement-heading-actions button[data-open-modal][data-quick-kind], .account-summary .quick-actions button[data-open-modal][data-quick-kind]';
const currentMonthSelector = '[data-month-current], [data-invoice-current]';
const monthInputSelector = '#filter-month, [data-invoice-month-input]';
const statementRowSelector = ".statement-row.statement-body";

const document = {
  body: {},
  head: {
    appendChild: (node: FakeStyleElement) => {
      injectedStyles.push(node);
    },
  },
  createElement: (tagName: string): FakeStyleElement => {
    assert.equal(tagName, "style");
    return { id: "", textContent: "" };
  },
  getElementById: (id: string): FakeStyleElement | null =>
    injectedStyles.find((style) => style.id === id) ?? null,
  querySelectorAll: (selector: string) => {
    if (selector === quickActionSelector) return [transferButton, expenseButton, incomeButton];
    if (selector === currentMonthSelector) {
      return [statementCurrentMonthButton, cardsCurrentMonthButton];
    }
    if (selector === monthInputSelector) return [statementMonthInput, cardsMonthInput];
    if (selector === ".recurrence-indicator") return [recurrenceIndicator];
    if (selector === statementRowSelector) return statementRows;
    return [];
  },
};

assert.deepEqual(resolveStatementStatusPresentation({ status: "reconciled" }), {
  label: "Conciliado",
  tone: "ok",
  icon: resolveStatementStatusPresentation({ status: "reconciled" }).icon,
});
assert.equal(
  resolveStatementStatusPresentation({ status: "posted", effectiveOn: "2026-07-01" }).label,
  "Efetivado não conciliado",
);
assert.equal(resolveStatementStatusPresentation({ status: "suggested" }).label, "Pendente");
assert.equal(resolveStatementStatusPresentation({ status: "planned" }).label, "Previsto");

const controller = statementActionIconsController();
assert.doesNotMatch(controller, /data-invoice-current/);
runInNewContext(controller, { document });

assert.match(transferButton.insertedHtml, /data-statement-action-icon/);
assert.match(transferButton.insertedHtml, /m17 2 4 4-4 4/);
assert.equal(transferButton.attributes.title, "Transferir entre contas");
assert.match(expenseButton.insertedHtml, /M12 5v14/);
assert.equal(expenseButton.attributes.title, "Registrar nova despesa");
assert.match(incomeButton.insertedHtml, /m5 12 7-7 7 7/);
assert.equal(incomeButton.attributes.title, "Registrar nova receita");

for (const button of [statementCurrentMonthButton, cardsCurrentMonthButton]) {
  assert.match(button.insertedHtml, /data-statement-action-icon/);
  assert.match(button.insertedHtml, /x="3" y="4"/);
  assert.equal(button.attributes.title, "Exibir o mês atual");
  assert.equal(button.attributes["aria-label"], "Exibir o mês atual");
}

assert.equal(statementMonthInput.style.fontWeight, "400");
assert.equal(cardsMonthInput.style.fontWeight, "400");
assert.equal(injectedStyles.length, 2);

const monthTypographyStyle = injectedStyles.find(
  (style) => style.id === "solverfin-month-typography",
);
assert.ok(monthTypographyStyle);
assert.match(monthTypographyStyle.textContent, /\.month-current/);
assert.match(monthTypographyStyle.textContent, /::-webkit-datetime-edit/);
assert.match(monthTypographyStyle.textContent, /::-webkit-datetime-edit-month-field/);
assert.match(monthTypographyStyle.textContent, /::-webkit-datetime-edit-year-field/);
assert.match(monthTypographyStyle.textContent, /font-weight: 400 !important/);

const statementPresentationStyle = injectedStyles.find(
  (style) => style.id === "solverfin-statement-presentation",
);
assert.ok(statementPresentationStyle);
assert.match(statementPresentationStyle.textContent, /max-width: 1800px !important/);
assert.match(statementPresentationStyle.textContent, /minmax\(280px, 320px\)/);
assert.match(statementPresentationStyle.textContent, /white-space: nowrap/);
assert.match(statementPresentationStyle.textContent, /font-variant-numeric: tabular-nums/);
assert.match(statementPresentationStyle.textContent, /\.statement-status:hover::after/);
assert.match(statementPresentationStyle.textContent, /@media \(max-width: 1180px\)/);

runInNewContext(controller, { document });
assert.equal(injectedStyles.length, 2);

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

assertStatementStatus(reconciledRow.status, "ok", "Conciliado");
assertStatementStatus(postedRow.status, "posted", "Efetivado não conciliado");
assertStatementStatus(pendingRow.status, "pending", "Pendente");
assertStatementStatus(plannedRow.status, "planned", "Previsto");
assert.match(pendingRow.balance.className, /\bdebit\b/);
assert.doesNotMatch(plannedRow.balance.className, /\bdebit\b/);

function assertStatementStatus(
  status: FakeStatusNode,
  tone: string,
  label: string,
): void {
  assert.equal(status.className, `statement-status statement-status-${tone} col-status`);
  assert.match(status.innerHTML, /<svg/);
  assert.equal(status.attributes.role, "img");
  assert.equal(status.attributes.tabindex, "0");
  assert.equal(status.attributes["aria-label"], label);
  assert.equal(status.attributes.title, label);
  assert.equal(status.attributes["data-tooltip"], label);
  assert.equal(status.dataset.statementStatusIcon, "true");
  assert.doesNotMatch(status.innerHTML, new RegExp(label));
}

interface FakeButton {
  dataset: Record<string, string>;
  insertedHtml: string;
  attributes: Record<string, string>;
  querySelector(selector: string): object | null;
  insertAdjacentHTML(position: string, html: string): void;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

function fakeButton(kind?: string): FakeButton {
  let insertedHtml = "";
  const attributes: Record<string, string> = {};
  return {
    dataset: kind ? { quickKind: kind } : {},
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

interface FakeStyledNode {
  style: Record<string, string>;
}

function fakeStyledNode(): FakeStyledNode {
  return { style: {} };
}

interface FakeStyleElement {
  id: string;
  textContent: string;
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

interface FakeStatusNode {
  dataset: Record<string, string>;
  className: string;
  innerHTML: string;
  attributes: Record<string, string>;
  setAttribute(name: string, value: string): void;
}

interface FakeTransactionNode {
  textContent: string;
}

interface FakeBalanceNode {
  textContent: string;
  className: string;
}

interface FakeStatementRow {
  status: FakeStatusNode;
  transaction: FakeTransactionNode;
  balance: FakeBalanceNode;
  querySelector(selector: string): FakeStatusNode | FakeTransactionNode | FakeBalanceNode | null;
}

function fakeStatementRow(
  transaction: { status: string; effectiveOn?: string },
  balanceText: string,
): FakeStatementRow {
  const attributes: Record<string, string> = {};
  const status: FakeStatusNode = {
    dataset: {},
    className: "chip col-status",
    innerHTML: "Texto anterior",
    attributes,
    setAttribute: (name: string, value: string) => {
      attributes[name] = value;
    },
  };
  const transactionNode: FakeTransactionNode = { textContent: JSON.stringify(transaction) };
  const balance: FakeBalanceNode = {
    textContent: balanceText,
    className: "col-balance",
  };

  return {
    status,
    transaction: transactionNode,
    balance,
    querySelector: (selector: string) => {
      if (selector === ".col-status") return status;
      if (selector === "[data-transaction]") return transactionNode;
      if (selector === ".col-balance") return balance;
      return null;
    },
  };
}
