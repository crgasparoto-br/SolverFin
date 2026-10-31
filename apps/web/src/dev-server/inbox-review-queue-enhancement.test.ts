import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { enhanceInboxReviewQueue } from "./inbox-review-queue-enhancement.js";

const BASE_HTML = `<!doctype html><html><head><style>.x{display:block}</style></head><body>
<main><section class="panel list-panel"><div class="section-heading"><h2>Outras sugestões</h2><span>1 item(ns)</span></div><div class="rows"><article>legado</article></div></section></main>
</body></html>`;

describe("Inbox unified AI review queue enhancement", () => {
  it("injects typed filters, discriminant states and version-aware decisions without exposing ids as labels", () => {
    const html = enhanceInboxReviewQueue(BASE_HTML);

    assert.match(html, /data-ai-review-queue-enhanced="true"/);
    assert.match(html, /Filtros da fila de revisão/);
    assert.match(html, /data-review-filter="kind"/);
    assert.match(html, /data-review-filter="status"/);
    assert.match(html, /data-review-filter="confidence"/);
    assert.match(html, /expectedFingerprint/);
    assert.match(html, /AI_SUGGESTION_PAYLOAD_CONFLICT/);
    assert.match(html, /Baixa confiança/);
    assert.match(html, /Carregando detalhes/);
    assert.match(html, /Nenhuma sugestão neste filtro/);
    assert.match(html, /Tentar novamente/);
    assert.match(html, /isTemporaryUnavailable/);
    assert.match(html, /statusCode = response\.status/);
    assert.match(html, /Fila temporariamente indisponível/);
    assert.match(html, /review-queue-status\.unavailable/);
    assert.match(html, /status\.setAttribute\("role", urgent \? "alert" : "status"\)/);
    assert.match(html, /dialog\.addEventListener\("close"/);
    assert.match(html, /state\.trigger\?\.focus/);
    assert.match(html, /@media \(max-width: 640px\)/);
    assert.match(html, /window\.history\.replaceState/);
    assert.match(html, /searchParams\.get\("profileId"\)/);
    // A6 cards must override the wider three-column .inbox-page .maintenance-item grid.
    assert.match(
      html,
      /\.inbox-page \.inbox-review-queue \.review-card \{\s*grid-template-columns: minmax\(0, 1fr\)/,
    );
    assert.match(html, /\.review-card > \[data-review-select\] \{ grid-column: 1;/);
    assert.match(html, /class="sf-badge review-risk" data-tone="attention"/);
    assert.match(html, /--sf-color-warning-surface/);
    assert.match(html, /data-button-variant="neutral" data-review-select/);
    assert.match(html, /data-button-variant="neutral" data-review-refresh/);
    assert.match(html, /Moeda indisponível/);
    assert.doesNotMatch(html, /currency \|\| "BRL"/);
    assert.match(html, /class="review-money-value"/);
    assert.doesNotMatch(html, /\b(?:background|border|color):\s*#[\da-fA-F]{3,8}\b/);
  });

  it("is idempotent when the same HTML is enhanced twice", () => {
    const once = enhanceInboxReviewQueue(BASE_HTML);
    const twice = enhanceInboxReviewQueue(once);
    assert.equal(twice, once);
  });
  it("shows decisions only inside selected evidence after fresh payload validation, blocking hidden and unavailable evidence", () => {
    const html = enhanceInboxReviewQueue(BASE_HTML);
    assert.match(html, /data-review-select/);
    assert.match(html, /aria-controls="inbox-review-selected"/);
    assert.match(html, /data-review-evidence="ready"/);
    assert.match(html, /selected\.dataset\.reviewEvidenceState = "loading"/);
    assert.match(html, /selected\.dataset\.reviewEvidenceState = "unavailable"/);
    assert.match(html, /detailFor\(id, true\)/);
    assert.match(html, /typeof detail\.payload\.fingerprint !== "string"/);
    assert.match(html, /style\.visibility !== "hidden"/);
    assert.match(html, /rect\.width > 0/);
    assert.match(html, /evidence\.closest\('\[hidden\], \[aria-hidden="true"\], \[inert\]'\)/);
    assert.match(html, /state\.selectedId !== id/);
    assert.match(html, /data-review-evidence-retry/);
    assert.match(html, /data-review-edit=/);
    assert.match(html, /data-review-approve=/);
    assert.match(html, /data-review-reject=/);
    assert.match(html, /expectedFingerprint: reviewedFingerprint/);
    assert.match(html, /detail\.payload\.fingerprint !== reviewedFingerprint/);
    assert.match(html, /window\.__solverfinInboxReviewGuard = reviewedEvidenceIsVisible/);
    assert.match(html, /AI_SUGGESTION_PAYLOAD_OBSOLETE/);
    assert.doesNotMatch(html, /data-api-path="[^"]+\/approve"/);
  });
});
