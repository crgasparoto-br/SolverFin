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
  });

  it("is idempotent when the same HTML is enhanced twice", () => {
    const once = enhanceInboxReviewQueue(BASE_HTML);
    const twice = enhanceInboxReviewQueue(once);
    assert.equal(twice, once);
  });
});
