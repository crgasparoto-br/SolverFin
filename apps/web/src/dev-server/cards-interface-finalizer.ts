const cardsInterfaceMarker = "data-cards-interface-enhanced";
const finalizerMarker = "data-cards-interface-finalized";

export function finalizeCardsInterface(html: string): string {
  if (!html.includes(cardsInterfaceMarker)) return html;
  if (html.includes(finalizerMarker)) return html;

  const finalizer = `
    <style ${finalizerMarker}>
      @media(max-width:760px){
        main[data-cards-interface-enhanced] .purchase-search input{
          height:44px;
          min-height:44px;
        }
      }
    </style>
    <script data-cards-interface-finalizer>
      (() => {
        const root = document.querySelector("main[data-cards-interface-enhanced]");
        if (!root) return;

        root.querySelectorAll("[data-open-modal]").forEach((button) => {
          button.addEventListener("click", () => {
            const dialog = root.querySelector(
              'dialog[data-modal="' + button.dataset.openModal + '"]',
            );
            dialog
              ?.querySelector(
                "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])",
              )
              ?.focus();
          });
        });
      })();
    </script>`;

  return html.replace("</body>", `${finalizer}</body>`);
}
