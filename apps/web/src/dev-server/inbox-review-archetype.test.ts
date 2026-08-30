import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { enhanceInboxReviewArchetype } from "./inbox-category-hierarchy-enhancement.js";
import {
  LEGACY_HTML_POST_PROCESSOR_BUDGET,
  LEGACY_HTML_POST_PROCESSOR_INVENTORY,
} from "./legacy-html-post-processors.js";

const inboxFixture = `<!doctype html>
<html>
  <head><style>.existing { display: block; }</style></head>
  <body>
    <main>
      <section class="page-heading">
        <div>
          <p class="eyebrow">Entradas e revisão</p>
          <h1>Inbox</h1>
          <p class="muted">Descrição legada.</p>
        </div>
        <div class="heading-actions">
          <button type="button" data-open-dialog="new-inbox-message-dialog">Registrar mensagem</button>
          <button type="button" data-open-dialog="csv-import-dialog">Importar extrato</button>
        </div>
      </section>
      <section class="panel import-workspace" aria-labelledby="csv-import-title">
        <div class="section-heading"><h2 id="csv-import-title">Extratos CSV</h2></div>
        <p id="import-workspace-status" role="status">Carregando importações...</p>
        <div id="import-batch-detail"></div>
      </section>
      <section class="panel list-panel">
        <div class="section-heading"><h2>Outras sugestões</h2><span>1 pendente</span></div>
        <div class="rows maintenance-rows"><article class="maintenance-item"><button type="button" data-api-action>Aprovar</button></article></div>
      </section>
      <section class="panel list-panel">
        <div class="section-heading"><h2>Mensagens recebidas</h2><span>1 item</span></div>
        <div class="rows maintenance-rows"><article class="maintenance-item">Mensagem mascarada</article></div>
      </section>
    </main>
  </body>
</html>`;

describe("Inbox review archetype", () => {
  it("composes the A6 review surface from Phase 3B structural primitives", () => {
    const html = enhanceInboxReviewArchetype(inboxFixture);

    assert.match(html, /data-inbox-review-archetype="A6"/);
    assert.match(html, /class="sf-page-header"/);
    assert.match(html, /class="sf-page-container inbox-review-cockpit"/);
    assert.match(html, /class="sf-filter-bar"/);
    assert.match(html, /class="sf-detail-layout"/);
    assert.match(html, /id="inbox-review-queue"/);
    assert.match(html, /data-inbox-review-evidence/);
    assert.match(html, /Evidência e decisão/);
    assert.match(html, /Item em revisão/);
    assert.match(html, /Origem, estado e confiança permanecem visíveis/);
    assert.match(html, /data-open-dialog="new-inbox-message-dialog"/);
    assert.match(html, /data-open-dialog="csv-import-dialog"/);
    assert.match(html, /data-api-action/);
    assert.match(html, /id="import-workspace-status"/);
    assert.match(html, /id="import-batch-detail"/);
    assert.doesNotMatch(html, /class="panel list-panel"/);
    assert.doesNotMatch(html, /class="panel import-workspace"/);
  });

  it("is idempotent so repeated composition does not duplicate review surfaces", () => {
    const once = enhanceInboxReviewArchetype(inboxFixture);
    const twice = enhanceInboxReviewArchetype(once);

    assert.equal(twice, once);
    assert.equal((twice.match(/data-inbox-review-archetype/g) ?? []).length, 1);
    assert.equal((twice.match(/class="sf-detail-layout"/g) ?? []).length, 1);
  });

  it("retires the Inbox textual post-processors from the active legacy budget", () => {
    assert.equal(LEGACY_HTML_POST_PROCESSOR_BUDGET, 11);
    assert.equal(
      LEGACY_HTML_POST_PROCESSOR_INVENTORY.some((entry) => entry.route === "/inbox"),
      false,
    );
    assert.equal(
      LEGACY_HTML_POST_PROCESSOR_INVENTORY.some(
        (entry) => entry.id === "inbox-structured-payload" || entry.id === "inbox-list-layout",
      ),
      false,
    );
  });
});
