/// <reference lib="dom" />

import { solverFinDesignTokens } from "../design-system/tokens.js";

/** Enhance the existing form, without replacing financial fields or their listeners. */
export function installStatementMockupControls(root: HTMLElement): void {
  const document = root.ownerDocument;
  const dialog = document.querySelector<HTMLDialogElement>("dialog[data-modal]");
  const form = dialog?.querySelector<HTMLFormElement>("form[data-form]");
  const select = form?.querySelector<HTMLSelectElement>('select[name="kind"]');
  const field = select?.closest("label");
  if (!dialog || !form || !select || !field || form.dataset.mockupControls === "true") return;

  const primary = root.querySelector<HTMLButtonElement>('[data-quick-kind="expense"]');
  if (primary && !primary.hasAttribute("data-statement-new-entry")) {
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "+";
    primary.replaceChildren(icon, document.createTextNode(" Novo lan\u00e7amento"));
    primary.dataset.statementNewEntry = "";
  }

  const choices = [
    { value: "expense", label: "Despesa" },
    { value: "income", label: "Receita" },
    { value: "transfer", label: "Transfer\u00eancia" },
  ];
  // Unsupported contracts keep the native form. This is progressive enhancement.
  if (
    !choices.every(({ value }) =>
      Array.from(select.options).some((option) => option.value === value),
    )
  ) {
    return;
  }

  const group = document.createElement("div");
  group.className = "statement-entry-kinds";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", "Tipo de lan\u00e7amento");
  const buttons = choices.map(({ value, label }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.statementEntryKind = value;
    button.setAttribute("role", "radio");
    button.textContent = label;
    group.append(button);
    return button;
  });
  const sync = (): void => {
    let focusable = false;
    for (const button of buttons) {
      const option = Array.from(select.options).find(
        (item) => item.value === button.dataset.statementEntryKind,
      );
      const checked = select.value === button.dataset.statementEntryKind;
      button.disabled = select.disabled || !option || option.disabled;
      button.setAttribute("aria-checked", String(checked));
      button.tabIndex = checked && !button.disabled ? 0 : -1;
      if (button.tabIndex === 0) focusable = true;
    }
    if (!focusable) {
      const first = buttons.find((button) => !button.disabled);
      if (first) first.tabIndex = 0;
    }
  };
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const option = Array.from(select.options).find(
        (item) => item.value === button.dataset.statementEntryKind,
      );
      if (select.disabled || !option || option.disabled) return;
      if (select.value !== option.value) {
        select.value = option.value;
        // The original handler owns destination fields, recurrence and validation.
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      sync();
      button.focus();
    });
  }
  group.addEventListener("keydown", (event) => {
    const navigationKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!navigationKeys.includes(event.key)) return;
    const enabled = buttons.filter((button) => !button.disabled);
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0 || enabled.length === 0) return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? enabled.length - 1
          : (index + direction + enabled.length) % enabled.length;
    enabled[next]?.click();
  });

  field.before(group);
  // The same select remains the canonical FormData field; only its presentation changes.
  field.hidden = true;
  select.addEventListener("change", sync);
  select.addEventListener("invalid", () => {
    // Native constraint validation must never be trapped in a hidden control.
    field.hidden = false;
    group.hidden = true;
  });
  form.addEventListener("reset", () => queueMicrotask(sync));
  new MutationObserver(sync).observe(select, {
    attributes: true,
    attributeFilter: ["disabled"],
    subtree: true,
  });
  new MutationObserver(() => {
    sync();
    if (dialog.open && document.activeElement === select && field.hidden) {
      buttons.find((button) => button.tabIndex === 0)?.focus();
    }
  }).observe(dialog, { attributes: true, attributeFilter: ["open"] });
  // Editing and cloning can set .value without dispatching change. Observe after
  // the canonical click handlers have run, rather than assigning our own default.
  root.addEventListener("click", () => queueMicrotask(sync));

  const description = form.querySelector<HTMLInputElement>('[name="description"]')?.closest("label");
  const category = form.querySelector<HTMLSelectElement>('[name="categoryId"]')?.closest("label");
  if (description && category) category.before(description);
  if (category) category.classList.add("statement-entry-category");
  const save = form.querySelector<HTMLButtonElement>('.save-row > button[type="submit"]');
  if (save && !form.querySelector("[data-statement-entry-cancel]")) {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "ghost-btn";
    cancel.dataset.statementEntryCancel = "";
    cancel.textContent = "Cancelar";
    cancel.addEventListener("click", () => dialog.close("cancel"));
    save.before(cancel);
  }
  sync();
  form.dataset.mockupControls = "true";
}

export function statementMockupControlsRuntime(): string {
  return `<script data-statement-mockup-controls>
    (() => {
      const root = document.currentScript?.closest('[data-golden-screen="statement"]');
      if (!root) return;
      const initialize = () => (${installStatementMockupControls.toString()})(root);
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
      else initialize();
    })();
  </script>`;
}

export function statementMockupControlsStyles(): string {
  const { spacing, density, breakpoints, typography } = solverFinDesignTokens;
  const root = '[data-statement-archetype="A2"][data-golden-screen="statement"]';
  const dialog = 'body:has([data-golden-screen="statement"]) dialog[data-modal]';
  return `
    ${root} [data-statement-new-entry]{box-shadow:none;gap:${spacing[2]}}
    ${root} [data-statement-new-entry]>svg{display:none}
    ${root} [data-statement-new-entry]>[aria-hidden]{font-size:${typography.sizes.xl};line-height:1}
    ${root} .statement-query{background:var(--sf-color-surface);border:1px solid var(--sf-color-line);border-radius:var(--sf-radius-lg);padding:${spacing[3]}}
    ${root} .statement-query-heading{align-items:center;margin-bottom:${spacing[2]}}
    ${root} .filter-form{column-gap:${spacing[3]};row-gap:${spacing[2]}}
    ${root} .statement-account-heading .summary-balance p{margin:0}
    ${root} .statement-head{padding-block:${spacing[2]}}
    ${root} .statement-body{padding-block:${spacing[2]}}
    ${dialog} .statement-entry-kinds{display:grid;gap:${spacing[1]};grid-column:1/-1;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.4fr);padding:${spacing[1]};background:var(--sf-color-background);border:1px solid var(--sf-color-line);border-radius:var(--sf-radius-lg)}
    ${dialog} .statement-entry-kinds[hidden],${dialog} form[data-mockup-controls] label[hidden]{display:none!important}
    ${dialog} .statement-entry-kinds button{background:transparent;border:1px solid transparent;border-radius:var(--sf-radius-md);color:var(--sf-color-muted-text);font-size:${typography.sizes.sm};font-weight:${typography.weights.medium};line-height:${typography.lineHeights.compact};min-height:${density.interactiveTargetMin};min-width:0;padding:${spacing[2]} ${spacing[1]};overflow-wrap:anywhere}
    ${dialog} .statement-entry-kinds button[aria-checked="true"]{border-color:currentColor;font-weight:${typography.weights.bold};box-shadow:inset 0 -2px currentColor}
    ${dialog} [data-statement-entry-kind="expense"][aria-checked="true"]{background:var(--sf-color-danger-surface);color:var(--sf-color-danger)}
    ${dialog} [data-statement-entry-kind="income"][aria-checked="true"]{background:var(--sf-color-success-surface);color:var(--sf-color-success)}
    ${dialog} [data-statement-entry-kind="transfer"][aria-checked="true"]{background:var(--sf-color-primary-soft);color:var(--sf-color-primary)}
    ${dialog} form[data-mockup-controls]>.statement-entry-category{grid-column:1/-1}
    ${dialog} .save-row{flex-wrap:wrap;gap:${spacing[2]}}
    ${dialog} .save-row>:is(button,[data-statement-entry-cancel]){min-height:${density.interactiveTargetMin}}
    @media(max-width:${breakpoints.shellCompact}){
      ${root} .statement-query{padding:${spacing[2]}}
      ${root} .statement-query-heading{gap:${spacing[1]}}
      ${root} .statement-secondary-actions>summary{padding-inline:${spacing[2]}}
      ${dialog} .save-row>.status-icons{flex-basis:100%}
      ${dialog} .save-row>button{flex:1;min-width:0}
    }
  `;
}
