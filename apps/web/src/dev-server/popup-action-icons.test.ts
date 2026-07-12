import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";

import { popupActionIconsController } from "./popup-action-icons.js";

const closeButton = fakeButton({ text: "Fechar", formMethod: "dialog" });
const backButton = fakeButton({
  text: "Voltar para a edição",
  attributes: ["data-recurrence-scope-cancel"],
});
const saveButton = fakeButton({ text: "Salvar lançamento", type: "submit" });
const confirmButton = fakeButton({ text: "Confirmar pagamento", type: "submit" });
const existingIconButton = fakeButton({ text: "Salvar compra", type: "submit", existingSvg: true });
const outsideButton = fakeButton({ text: "Salvar fora do modal", type: "submit", popup: false });
const buttons = [
  closeButton,
  backButton,
  saveButton,
  confirmButton,
  existingIconButton,
  outsideButton,
];

const document = {
  body: {},
  querySelectorAll: (selector: string) =>
    selector === 'dialog button, [role="dialog"] button, .category-modal button' ? buttons : [],
};

runInNewContext(popupActionIconsController(), { document });

assert.match(closeButton.insertedHtml, /data-popup-action-icon/);
assert.match(closeButton.insertedHtml, /M18 6 6 18/);
assert.match(backButton.insertedHtml, /m15 18-6-6 6-6/);
assert.match(saveButton.insertedHtml, /M19 21H5/);
assert.match(confirmButton.insertedHtml, /M20 6 9 17l-5-5/);
assert.equal(existingIconButton.insertedHtml, "");
assert.equal(outsideButton.insertedHtml, "");

interface FakeButtonOptions {
  text: string;
  type?: string;
  formMethod?: string;
  attributes?: string[];
  existingSvg?: boolean;
  popup?: boolean;
}

interface FakePopupButton {
  textContent: string;
  type: string;
  form: { getAttribute(name: string): string | null } | null;
  insertedHtml: string;
  querySelector(selector: string): object | null;
  insertAdjacentHTML(position: string, html: string): void;
  closest(selector: string): object | null;
  matches(selector: string): boolean;
  getAttribute(name: string): string | null;
}

function fakeButton(options: FakeButtonOptions): FakePopupButton {
  const attributes = new Set(options.attributes ?? []);
  const form = options.formMethod
    ? {
        getAttribute: (name: string) => (name === "method" ? options.formMethod ?? null : null),
      }
    : null;
  let insertedHtml = "";

  const button: FakePopupButton = {
    textContent: options.text,
    type: options.type ?? "button",
    form,
    get insertedHtml() {
      return insertedHtml;
    },
    set insertedHtml(value: string) {
      insertedHtml = value;
    },
    querySelector: (selector: string) =>
      selector === "svg" && (options.existingSvg === true || insertedHtml.includes("<svg")) ? {} : null,
    insertAdjacentHTML: (_position: string, html: string) => {
      insertedHtml = html + insertedHtml;
    },
    closest: (selector: string) => {
      if (selector === "form") return form;
      if (selector === 'dialog, [role="dialog"], .category-modal') {
        return options.popup === false ? null : {};
      }
      return null;
    },
    matches: (selector: string) =>
      selector
        .split(",")
        .map((value) => value.trim().replace(/^\[|\]$/g, ""))
        .some((attribute) => attributes.has(attribute)),
    getAttribute: (name: string) => (name === "type" ? options.type ?? "button" : null),
  };

  return button;
}
