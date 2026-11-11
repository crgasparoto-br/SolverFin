import { inboxReviewQueueScriptPartOne } from "./inbox-review-queue-script-part-1.js";
import { inboxReviewQueueScriptPartTwo } from "./inbox-review-queue-script-part-2.js";
import { inboxReviewQueueStyles } from "./inbox-review-queue-styles.js";

export function enhanceInboxReviewQueue(html: string): string {
  if (!html.includes("Outras sugestões")) return html;
  if (html.includes("data-ai-review-queue-enhanced")) return html;

  const dialog = `
    <dialog id="ai-review-dialog" class="master-dialog ai-review-dialog" aria-labelledby="ai-review-dialog-title">
      <div class="dialog-heading">
        <p class="eyebrow">Fila de revisão</p>
        <h2 id="ai-review-dialog-title">Revisar sugestão</h2>
      </div>
      <div id="ai-review-dialog-body" aria-live="polite"></div>
      <form method="dialog" class="dialog-actions">
        <button type="submit" class="secondary-button">Fechar</button>
      </form>
    </dialog>`;

  const script = inboxReviewQueueScriptPartOne() + inboxReviewQueueScriptPartTwo();

  let enhanced = html.replace("</main>", `${dialog}\n</main>`);
  enhanced = enhanced.replace("<main", '<main data-ai-review-queue-enhanced="true"');
  enhanced = enhanced.replace("</style>", `${inboxReviewQueueStyles()}</style>`);
  return enhanced.replace("</body>", `${script}\n</body>`);
}
