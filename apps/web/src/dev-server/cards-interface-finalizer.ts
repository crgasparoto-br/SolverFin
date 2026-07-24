const finalizerMarker = "data-cards-interface-finalizer";

export function finalizeCardsInterface(html: string): string {
  if (html.includes(finalizerMarker)) return html;

  const controller = `
    <script ${finalizerMarker}>
      (() => {
        const root = document.querySelector("main[data-cards-interface-enhanced]");
        if (!root) return;

        const search = root.querySelector("input[data-purchase-search]");
        if (search) {
          search.style.height = "44px";
          search.style.minHeight = "44px";
        }

        root.querySelectorAll("[data-open-modal]").forEach((button) => {
          button.addEventListener("click", () => {
            queueMicrotask(() => {
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
        });
      })();
    </script>`;

  return html.replace("</body>", `${controller}</body>`);
}
