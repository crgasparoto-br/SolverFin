import { join } from "node:path";

import { evaluate, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";

export async function validateRecurringScopeViewport(options) {
  const { fixture, width, height, cdp, baseUrl, outputDir } = options;
  const { scenarios, check, waitForAccountLine } = options;
  await setViewport(cdp, width, height);
  const route = `/lancamentos?accountId=${encodeURIComponent(fixture.accountId)}&month=2026-07`;
  await navigate(cdp, `${baseUrl}${route}`);
  await waitForAccountLine(fixture.accountTransactionId);
  await evaluate(
    cdp,
    `document.querySelector('[data-edit="${fixture.accountTransactionId}"]').click()`,
  );
  await sleep(250);
  const opened = await evaluate(
    cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      form.querySelector("[data-installment-amount-input]").value = "987,65";
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      return Boolean(document.querySelector(".installment-scope-dialog[open]"));
    })()`,
  );
  check(opened, `Recurring scope did not open at ${width}x${height}`, { opened });
  const state = await evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector(".installment-scope-dialog[open]");
      const form = document.querySelector("[data-form]");
      const bounds = (element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      };
      const controls = Array.from(dialog.querySelectorAll("[data-scope], [data-scope-cancel]"));
      const edges = controls.map(bounds);
      return {
        dialog: bounds(dialog),
        controls: edges,
        choices: controls.filter((element) => element.dataset.scope).map((element) => element.textContent.trim()),
        focused: document.activeElement?.dataset.scope,
        saveButtons: Array.from(form.querySelectorAll('.statement-save-actions button[type="submit"]'))
          .filter((element) => !element.hidden).map((element) => element.textContent.trim()),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        viewport: { width: innerWidth, height: innerHeight },
      };
    })()`,
  );
  const inside = (rect) =>
    rect.left >= -1 &&
    rect.right <= state.viewport.width + 1 &&
    rect.top >= -1 &&
    rect.bottom <= state.viewport.height + 1;
  check(inside(state.dialog), `Scope dialog clipped at ${width}x${height}`, state);
  check(state.controls.every(inside), `Scope actions clipped at ${width}x${height}`, state);
  check(!state.horizontalOverflow, `Scope causes horizontal overflow at ${width}x${height}`, state);
  check(
    state.choices.join(",") === "Somente esta parcela,Esta e as próximas",
    "Future scope was hidden",
    state,
  );
  check(state.saveButtons.join(",") === "Salvar parcela", "Unexpected extra save action", state);
  check(state.focused === "current", "Scope dialog did not focus first option", state);

  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
  const nextFocus = await evaluate(cdp, `document.activeElement?.dataset.scope`);
  check(nextFocus === "current_and_future", "Tab did not reach future scope", { nextFocus, width });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Tab",
    code: "Tab",
    modifiers: 8,
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    modifiers: 8,
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
  const previousFocus = await evaluate(cdp, `document.activeElement?.dataset.scope`);
  check(previousFocus === "current", "Shift+Tab did not return to first scope", {
    previousFocus,
    width,
  });

  const filename = `issue-748-account-recurring-scope-${width}x${height}.png`;
  await screenshot(cdp, join(outputDir, filename));
  scenarios.push({
    route,
    viewport: `${width}x${height}`,
    state: "recurring installment scope focus and bounds",
    screenshot: filename,
    ...state,
  });

  const cancelled = await evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector(".installment-scope-dialog[open]");
      dialog?.querySelector("[data-scope-cancel]")?.click();
      return !document.querySelector(".installment-scope-dialog[open]") &&
        document.querySelector("[data-modal]").open;
    })()`,
  );
  check(cancelled, `Voltar sem salvar did not preserve parent modal at ${width}x${height}`, {
    cancelled,
  });
  await evaluate(cdp, `document.querySelector("[data-modal]").close()`);
}
