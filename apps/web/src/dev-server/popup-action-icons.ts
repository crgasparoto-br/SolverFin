import { icon } from "./icons.js";

/**
 * Returns the client-side controller that normalizes action icons inside dialogs.
 * The controller is intentionally scoped to popup roots and preserves buttons that
 * already render their own SVG icon.
 */
export function popupActionIconsController(): string {
  return `
    (function () {
      const popupButtonSelector = 'dialog button, [role="dialog"] button, .category-modal button';
      const popupCloseIcon = ${JSON.stringify(icon("x", 13))};
      const popupBackIcon = ${JSON.stringify(icon("chevron-left", 13))};
      const popupSaveIcon = ${JSON.stringify(icon("save", 13))};
      const popupConfirmIcon = ${JSON.stringify(icon("check", 13))};

      function iconMarkup(svg) {
        return String(svg || "").replace(
          "<svg",
          '<svg data-popup-action-icon style="display:inline-block;flex-shrink:0;margin-right:4px;vertical-align:middle"',
        );
      }

      function prependPopupIcon(button, svg) {
        if (!button || typeof button.querySelector !== "function") return;
        if (button.querySelector("svg")) return;
        if (typeof button.insertAdjacentHTML !== "function") return;
        button.insertAdjacentHTML("afterbegin", iconMarkup(svg));
      }

      function decoratePopupButton(button) {
        if (!button || typeof button.closest !== "function") return;
        if (!button.closest('dialog, [role="dialog"], .category-modal')) return;
        if (typeof button.querySelector === "function" && button.querySelector("svg")) return;

        const text = String(button.textContent || "").trim().toLocaleLowerCase("pt-BR");
        const form = button.form || (typeof button.closest === "function" ? button.closest("form") : null);
        const formMethod = form && typeof form.getAttribute === "function"
          ? String(form.getAttribute("method") || "").toLowerCase()
          : "";
        const explicitClose = typeof button.matches === "function" && button.matches(
          "[data-close-category-modal], [data-recurrence-scope-cancel]",
        );
        const isBack = text.startsWith("voltar");
        const isClose =
          formMethod === "dialog" ||
          explicitClose ||
          text === "fechar" ||
          text === "cancelar" ||
          text.startsWith("fechar ") ||
          text.startsWith("cancelar ");

        if (isBack) {
          prependPopupIcon(button, popupBackIcon);
          return;
        }

        if (isClose) {
          prependPopupIcon(button, popupCloseIcon);
          return;
        }

        const buttonType = String(
          button.type ||
            (typeof button.getAttribute === "function" ? button.getAttribute("type") || "" : ""),
        ).toLowerCase();
        if (buttonType !== "submit") return;

        const isConfirmation = /confirmar|aprovar|aplicar|concluir|continuar|pagar/.test(text);
        prependPopupIcon(button, isConfirmation ? popupConfirmIcon : popupSaveIcon);
      }

      function decoratePopupButtons(root) {
        if (!root || typeof root.querySelectorAll !== "function") return;
        root.querySelectorAll(popupButtonSelector).forEach(decoratePopupButton);
      }

      if (typeof document.querySelectorAll === "function") {
        decoratePopupButtons(document);

        if (typeof MutationObserver !== "undefined" && document.body) {
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              const targetButton = mutation.target && typeof mutation.target.closest === "function"
                ? mutation.target.closest("button")
                : null;
              if (targetButton) decoratePopupButton(targetButton);

              mutation.addedNodes.forEach((node) => {
                if (!node || typeof node !== "object") return;
                if (typeof node.matches === "function" && node.matches("button")) {
                  decoratePopupButton(node);
                }
                decoratePopupButtons(node);
              });
            });
          });
          observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        }
      }
    })();
  `;
}
