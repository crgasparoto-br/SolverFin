const cardsInterfaceMarker = "data-cards-interface-enhanced";

const mobileSearchRule =
  "main[data-cards-interface-enhanced] .purchase-search input{min-height:44px}";
const correctedMobileSearchRule =
  "main[data-cards-interface-enhanced] .purchase-search input{height:44px;min-height:44px}";

const deferredModalFocus = `        root.querySelectorAll("[data-open-modal]").forEach((button) => {
          button.addEventListener("click", () =>
            requestAnimationFrame(() => {
              const dialog = root.querySelector(
                'dialog[data-modal="' + button.dataset.openModal + '"]',
              );
              dialog
                ?.querySelector(
                  "input:not([type=hidden]):not([disabled]), select:not([disabled]), button:not([disabled])",
                )
                ?.focus();
            }),
          );
        });`;

const immediateModalFocus = `        root.querySelectorAll("[data-open-modal]").forEach((button) => {
          button.addEventListener("click", () => {
            const dialog = root.querySelector(
              'dialog[data-modal="' + button.dataset.openModal + '"]',
            );
            dialog
              ?.querySelector(
                "input:not([type=hidden]):not([disabled]), select:not([disabled]), button:not([disabled])",
              )
              ?.focus();
          });
        });`;

export function finalizeCardsInterface(html: string): string {
  if (!html.includes(cardsInterfaceMarker)) return html;

  return html
    .replace(mobileSearchRule, correctedMobileSearchRule)
    .replace(deferredModalFocus, immediateModalFocus);
}
