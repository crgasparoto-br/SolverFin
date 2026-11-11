import { evaluate, sleep } from "./cdp.mjs";

export function createManualInstallmentReaders(browser) {
  async function readFormState(pageScrollBaseline) {
    const pageScrollBaselineExpression =
      pageScrollBaseline === undefined ? "window.scrollY" : JSON.stringify(pageScrollBaseline);
    return evaluate(
      browser.cdp,
      `(() => {
        const form = document.querySelector("[data-form]");
        const dialog = document.querySelector("[data-modal]");
        const panel = dialog?.querySelector(".modal-panel");
        const rect = dialog?.getBoundingClientRect();
        const visibleViewportWidth = document.documentElement.clientWidth;
        const scrollable = [dialog, panel].find((node) => node && node.scrollHeight > node.clientHeight + 1);
        const scrollTopBefore = scrollable?.scrollTop || 0;
        const pageScrollBefore = ${pageScrollBaselineExpression};
        const maxScrollTop = scrollable ? scrollable.scrollHeight - scrollable.clientHeight : 0;
        if (scrollable && maxScrollTop > 0) scrollable.scrollTop = Math.min(80, maxScrollTop);
        const panelScrollStyle = panel ? getComputedStyle(panel).overflowY : "";
        const modalScrollsInternally = Boolean(
          panel &&
          ["auto", "scroll"].includes(panelScrollStyle) &&
          (panel.scrollHeight <= panel.clientHeight + 1 ||
            (scrollable && maxScrollTop > 0 && scrollable.scrollTop > scrollTopBefore)),
        );
        if (scrollable) scrollable.scrollTop = scrollTopBefore;
        return {
          modalOpen: dialog?.open === true,
          dialogLabel: dialog?.querySelector("[data-modal-title]")?.textContent?.trim() || "",
          liveRegion: form.querySelector("[aria-live='polite']")?.getAttribute("aria-live") || "",
          visibleViewportWidth,
          margins: rect
            ? {
                left: rect.left,
                right: visibleViewportWidth - rect.right,
                top: rect.top,
                bottom: window.innerHeight - rect.bottom,
              }
            : null,
          dialogSafeMargins: Boolean(
            rect &&
              rect.left >= 16 &&
              visibleViewportWidth - rect.right >= 16 &&
              rect.top >= 16 &&
              window.innerHeight - rect.bottom >= 16,
          ),
          dialogCentered: Boolean(
            rect &&
              Math.abs(rect.left + rect.width / 2 - visibleViewportWidth / 2) <= 1 &&
              Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2) <= 1,
          ),
          dialogWithinViewport: Boolean(
            rect &&
              rect.left >= -1 &&
              rect.right <= visibleViewportWidth + 1 &&
              rect.top >= -1 &&
              rect.bottom <= window.innerHeight + 1,
          ),
          modalScrollsInternally,
          pageScrollYStable: window.scrollY === pageScrollBefore,
          description: form.elements.namedItem("description").value,
          note: form.elements.namedItem("note").value,
          submitDisabled: form.querySelector("[data-statement-save-primary]")?.disabled === true,
          globalOverflow: document.documentElement.scrollWidth > visibleViewportWidth
        };
      })()`,
    );
  }
  
  async function readModalFocusContract() {
    return evaluate(
      browser.cdp,
      `(() => {
        const dialog = document.querySelector("[data-modal]");
        const active = document.activeElement;
        return {
          open: dialog?.open === true,
          focusInsideDialog: Boolean(dialog && active && dialog.contains(active)),
          activeTag: active?.tagName || "",
        };
      })()`,
    );
  }
  
  async function readModalEscapeContract() {
    return evaluate(
      browser.cdp,
      `(() => {
        const dialog = document.querySelector("[data-modal]");
        const opener = document.querySelector('[data-open-modal][data-quick-kind="expense"]');
        return {
          closed: dialog?.open === false,
          focusReturnedToOpener: document.activeElement === opener,
        };
      })()`,
    );
  }
  
  async function readInstallments(accountId, from, to) {
    return evaluate(
      browser.cdp,
      `(async () => {
        const response = await fetch(
          "/api/installments?accountId=" + encodeURIComponent(${JSON.stringify(accountId)})
            + "&operationalFrom=" + ${JSON.stringify(from)}
            + "&operationalTo=" + ${JSON.stringify(to)}
            + "&status=all"
        );
        const body = await response.json();
        if (!response.ok) throw new Error(JSON.stringify(body));
        return body.installments || [];
      })()`,
    );
  }
  
  async function pressEnter() {
    await browser.cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
      text: "\r",
      unmodifiedText: "\r",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    await browser.cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    await sleep(100);
  }
  
  async function pressEscape() {
    await browser.cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    });
    await browser.cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    });
    await sleep(100);
  }
  
  function createAccountExpression() {
    return `(async () => {
      const suffix = Date.now().toString(36);
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "QA Issue 553 " + suffix,
          kind: "checking",
          openingBalanceMinor: 0,
          currency: "BRL"
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      return { accountId: body.account.id };
    })()`;
  }

  return {
    readFormState,
    readModalFocusContract,
    readModalEscapeContract,
    readInstallments,
    pressEnter,
    pressEscape,
    createAccountExpression,
  };
}
