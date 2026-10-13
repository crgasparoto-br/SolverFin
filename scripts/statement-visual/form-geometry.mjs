import assert from "node:assert/strict";

/** Count every visible field on each row; an average hides a 3+1 layout. */
export function formRowCounts(fields, tolerance = 4) {
  const rows = [];
  const sorted = [...fields].sort((a, b) => a.top - b.top || a.left - b.left);
  for (const field of sorted) {
    assert.ok(Number.isFinite(field.top) && Number.isFinite(field.left), "Invalid field geometry.");
    const row = rows.find((candidate) => Math.abs(candidate.top - field.top) <= tolerance);
    if (row) row.fields.push(field.name);
    else rows.push({ top: field.top, fields: [field.name] });
  }
  return rows.map((row) => ({ ...row, count: row.fields.length }));
}

export function assertGroupFormGeometry(geometry, expectedColumns) {
  assert.ok(geometry.fields.length >= 6, "Group form fields were not observed.");
  const rows = formRowCounts(geometry.fields);
  const maximumColumns = Math.max(...rows.map((row) => row.count));
  assert.equal(maximumColumns, expectedColumns, "Unexpected rendered group form columns.");
  assert.deepEqual(geometry.labelOverflow, [], "Group labels escape their fields.");
  assert.deepEqual(geometry.labelCollisions, [], "Group labels overlap.");
  assert.deepEqual(geometry.moneyClipping, [], "Financial values are clipped.");
  assert.equal(geometry.currencyFields, 1, "Group currency must be displayed exactly once.");
  assert.ok(geometry.money.length >= 3, "Effective amount and member amounts must be observed.");
  return rows;
}

/** Serialized into the same authenticated Chrome that runs the real group flow. */
export function measureGroupFormGeometry() {
  const form = document.querySelector("[data-group-form]");
  const visible = (element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const hasSize = box.width > 0 && box.height > 0;
    return hasSize && style.visibility !== "hidden" && style.display !== "none";
  };
  const box = (rect) => ({
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
  });
  const labels = Array.from(form.querySelectorAll(":scope > label")).filter(visible);
  const fields = [];
  const texts = [];
  for (const [index, label] of labels.entries()) {
    const nodes = Array.from(label.childNodes).filter((node) => {
      return node.nodeType === Node.TEXT_NODE && node.textContent.trim();
    });
    const name = nodes.map((node) => node.textContent.trim()).join(" ");
    fields.push({ name, ...box(label.getBoundingClientRect()) });
    for (const node of nodes) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        texts.push({ field: index, name, ...box(rect) });
      }
    }
  }
  const labelOverflow = [];
  for (const text of texts) {
    const field = fields[text.field];
    if (text.left < field.left - 1 || text.right > field.right + 1) {
      labelOverflow.push(text.name);
    }
  }
  const labelCollisions = [];
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      const a = texts[i];
      const b = texts[j];
      const horizontal = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const vertical = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (a.field !== b.field && horizontal > 1 && vertical > 1) {
        labelCollisions.push([a.name, b.name]);
      }
    }
  }
  const canvas = document.createElement("canvas").getContext("2d");
  const moneySelector = "[data-group-effective-input], .group-member-amount";
  const monetaryElements = form.querySelectorAll(moneySelector);
  const money = [];
  for (const element of Array.from(monetaryElements).filter(visible)) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const value = element.value ?? element.textContent;
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const available = element.clientWidth - padding;
    let clipped;
    if (element instanceof HTMLInputElement) {
      canvas.font = style.font;
      clipped = canvas.measureText(value).width > available + 1;
    } else {
      const range = document.createRange();
      range.selectNodeContents(element);
      clipped = Array.from(range.getClientRects()).some((part) => {
        const outsideHorizontally = part.left < rect.left - 1 || part.right > rect.right + 1;
        return outsideHorizontally || part.bottom > rect.bottom + 1;
      });
    }
    money.push({ value, available, clipped });
  }
  return {
    fields,
    labelOverflow,
    labelCollisions,
    money,
    moneyClipping: money.filter((item) => item.clipped),
    currencyFields: fields.filter((field) => field.name === "Moeda").length,
  };
}
