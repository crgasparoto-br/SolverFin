import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { enhanceInboxCategoryHierarchy } from "./inbox-category-hierarchy-enhancement.js";
import {
  inboxReviewArchetypeStyles,
  renderFinancialInsightFallback,
  renderInboxCategoriesUnavailable,
  renderInboxReviewArchetype,
} from "./inbox-review-archetype.js";
import {
  LEGACY_HTML_POST_PROCESSOR_BUDGET,
  LEGACY_HTML_POST_PROCESSOR_INVENTORY,
} from "./legacy-html-post-processors.js";

describe("Inbox review archetype", () => {
  it("composes the canonical A6 review surface directly from Phase 3B primitives", () => {
    const html = renderInboxReviewArchetype({
      messageActionHtml:
        '<button type="button" data-open-dialog="new-inbox-message-dialog">Registrar mensagem</button>',
      importActionHtml:
        '<button type="button" data-open-dialog="csv-import-dialog">Importar extrato</button>',
      suggestionsHtml:
        '<section class="panel list-panel inbox-review-group"><div class="section-heading"><h2>Outras sugestões</h2></div><div class="rows maintenance-rows"><article class="maintenance-item"><button type="button" data-api-action>Aprovar</button></article></div></section>',
      messagesHtml:
        '<section class="panel list-panel inbox-review-group"><div class="section-heading"><h2>Mensagens recebidas</h2></div></section>',
      evidenceHtml:
        '<section class="panel import-workspace inbox-review-evidence" data-inbox-review-evidence aria-labelledby="csv-import-title"><h2 id="csv-import-title">Extratos importados</h2><p id="import-workspace-status" role="status">Carregando importações...</p><div id="import-batch-detail"></div></section>',
    });

    assert.match(html, /data-inbox-review-archetype="A6"/);
    assert.match(html, /class="sf-page-header"/);
    assert.match(html, /class="sf-page-container inbox-review-cockpit"/);
    assert.match(html, /role="tablist" aria-label="Assuntos da Inbox"/);
    assert.match(html, /class="sf-detail-layout"/);
    assert.match(html, /id="inbox-panel-reviews"/);
    assert.match(html, /id="inbox-panel-imports"/);
    assert.match(html, /id="inbox-panel-messages"/);
    assert.match(html, /id="inbox-panel-insights"/);
    assert.match(html, /id="inbox-review-queue"/);
    // Keep the second heading for the legacy adapter and screen readers, not as a competing visible title.
    assert.match(html, /<h2>Outras sugestões<\/h2>/);
    assert.match(
      inboxReviewArchetypeStyles(),
      /\.inbox-review-cockpit #inbox-review-suggestions-title \{/,
    );
    assert.match(inboxReviewArchetypeStyles(), /clip-path: inset\(50%\); height: 1px;/);
    assert.match(html, /data-inbox-review-evidence/);
    assert.match(html, /Evidência e decisão/);
    assert.match(html, /Item em revisão/);
    assert.match(html, /data-open-dialog="new-inbox-message-dialog"/);
    assert.match(html, /data-open-dialog="csv-import-dialog"/);
    assert.match(html, /data-api-action/);
    assert.match(html, /data-inbox-review-runtime="true"/);
  });

  it("applies Golden Screen neutral tabs, contextual actions, focus and touch targets", () => {
    const html = renderInboxReviewArchetype({
      messageActionHtml:
        '<button type="button" data-open-dialog="new-inbox-message-dialog">Registrar</button>',
      importActionHtml:
        '<button type="button" data-open-dialog="csv-import-dialog">Importar</button>',
      suggestionsHtml: "<section>Fila</section>",
      messagesHtml: "<section>Mensagens</section>",
      evidenceHtml: "<section>Importações</section>",
    });
    const css = inboxReviewArchetypeStyles();
    assert.equal(
      (html.match(/data-inbox-tab="(?:reviews|imports|messages|insights)"/g) ?? []).length,
      4,
    );
    assert.equal((html.match(/role="tabpanel"/g) ?? []).length, 4);
    assert.equal((html.match(/class="inbox-tab-panel"/g) ?? []).length, 4);
    assert.match(html, /aria-selected="true" tabindex="0">Revisões/);
    assert.match(html, /data-inbox-tab-panel="imports" tabindex="0" hidden/);
    assert.match(html, /data-inbox-tab-panel="messages" tabindex="0" hidden/);
    assert.match(html, /data-inbox-tab-panel="insights" tabindex="0" hidden/);
    assert.match(html, /data-inbox-tab-runtime="true"/);
    assert.match(html, /event.key === "ArrowRight"/);
    assert.match(html, /event.key === "ArrowLeft"/);
    assert.match(html, /event.key === "Home"/);
    assert.match(html, /event.key === "End"/);
    assert.match(html, /window.addEventListener\("popstate", syncLocation\)/);
    assert.match(html, /window.addEventListener\("hashchange", syncLocation\)/);
    assert.match(html, /data-button-variant="neutral" role="tab"/);
    assert.match(html, /data-button-variant="neutral" type="button">Limpar/);
    assert.match(css, /--sf-color-neutral-control-hover/);
    assert.match(css, /--sf-color-neutral-control-active-hover/);
    assert.match(css, /--sf-color-primary-soft/);
    assert.match(css, /\.inbox-tab-panel\[hidden\] \{ display: none !important; \}/);
    assert.match(css, /\.inbox-tab-list\.sf-tabs \{[^}]*overflow-x: auto;/);
    assert.match(css, /\.inbox-tab-list \.inbox-tab\.sf-tab:focus-visible/);
    assert.match(css, /--sf-shadow-focus/);
    assert.match(css, /--sf-density-interactive-target-min/);
    assert.match(
      css,
      /\.ai-review-dialog :is\(select, \.secondary-button\):active:not\(:disabled\)/,
    );
    assert.match(css, /\.ai-review-dialog :is\(select, \.secondary-button\):disabled/);
    assert.match(css, /\.ai-review-dialog select option:not\(:checked\)/);
    assert.match(css, /@media \(max-width: 900px\)/);
    assert.match(css, /@media \(max-width: 600px\)/);
    assert.doesNotMatch(css, /#(?:[0-9a-fA-F]{3}){1,2}\b/);
  });

  it("keeps the direct A6 composition intact while the legacy category adapter only enriches category behavior", () => {
    const html = renderInboxReviewArchetype({
      messageActionHtml: "",
      importActionHtml: "",
      suggestionsHtml: '<section class="panel list-panel"><h2>Outras sugestões</h2></section>',
      messagesHtml: '<section class="panel list-panel"><h2>Mensagens recebidas</h2></section>',
      evidenceHtml:
        '<section class="panel import-workspace" aria-labelledby="csv-import-title"><h2 id="csv-import-title">Extratos importados</h2></section>',
    });
    const enhanced = enhanceInboxCategoryHierarchy(html, []);

    assert.match(enhanced, /data-inbox-review-archetype="A6"/);
    assert.equal((enhanced.match(/data-inbox-review-archetype/g) ?? []).length, 1);
    assert.equal((enhanced.match(/class="sf-detail-layout"/g) ?? []).length, 1);
  });

  it("preserves observable insufficient-data and degraded-category states inside A6", () => {
    const fallback = renderFinancialInsightFallback([
      {
        currency: "BRL",
        title: "Dados insuficientes",
        explanation: "Sem amostra suficiente.",
        periodStartOn: "2026-08-01",
        periodEndOn: "2026-08-31",
        limitations: ["Nenhuma conclusão financeira foi criada."],
      },
    ]);
    const unavailable = renderInboxCategoriesUnavailable("Categories unavailable");

    assert.match(fallback, /data-financial-insight-fallback="true"/);
    assert.match(fallback, /Insights financeiros aguardando dados/);
    assert.match(fallback, /BRL/);
    assert.match(fallback, /Nenhum insight artificial foi criado/);
    assert.match(unavailable, /data-inbox-categories-unavailable="true"/);
    assert.match(unavailable, /Categorias temporariamente indisponíveis/);
    assert.match(unavailable, /A Inbox continua disponível/);
  });

  it("keeps intrinsic-height containment rules and retires the replaced legacy processors", () => {
    const styles = inboxReviewArchetypeStyles();
    const activeIds = LEGACY_HTML_POST_PROCESSOR_INVENTORY.map((entry) => String(entry.id));

    assert.match(styles, /\.inbox-review-evidence \.batch-item \{[^}]*height: auto/);
    assert.match(styles, /overflow-wrap: anywhere/);
    assert.equal(LEGACY_HTML_POST_PROCESSOR_BUDGET, LEGACY_HTML_POST_PROCESSOR_INVENTORY.length);
    assert.equal(
      LEGACY_HTML_POST_PROCESSOR_INVENTORY.map((entry) => String(entry.route)).includes("/inbox"),
      false,
    );
    assert.equal(activeIds.includes("inbox-structured-payload"), false);
    assert.equal(activeIds.includes("inbox-list-layout"), false);
  });
  it("keeps reviews, imports, messages and insights strictly in their own panels", () => {
    const html = renderInboxReviewArchetype({
      messageActionHtml:
        '<button data-open-dialog="new-inbox-message-dialog">Registrar mensagem</button>',
      importActionHtml: '<button data-open-dialog="csv-import-dialog">Importar extrato</button>',
      suggestionsHtml:
        '<section><h2>Outras sugestões</h2><button data-review-select="fixture">Revisar</button></section>',
      messagesHtml: "<section data-inbox-messages>Mensagens recebidas</section>",
      insightsHtml: "<section data-inbox-insights>Insights financeiros</section>",
      evidenceHtml: "<section data-inbox-review-evidence>Importações CSV/OFX</section>",
    });
    const reviewAt = html.indexOf('id="inbox-panel-reviews"');
    const importsAt = html.indexOf('id="inbox-panel-imports"');
    const messagesAt = html.indexOf('id="inbox-panel-messages"');
    const insightsAt = html.indexOf('id="inbox-panel-insights"');
    assert.ok(
      reviewAt >= 0 && reviewAt < importsAt && importsAt < messagesAt && messagesAt < insightsAt,
    );
    assert.ok(html.indexOf('id="inbox-review-selected"') > reviewAt);
    assert.ok(html.indexOf("data-inbox-review-evidence") > importsAt);
    assert.ok(html.indexOf("data-inbox-messages") > messagesAt);
    assert.ok(html.indexOf("data-inbox-insights") > insightsAt);
    assert.ok(
      html.indexOf('data-open-dialog="csv-import-dialog"') > importsAt &&
        html.indexOf('data-open-dialog="csv-import-dialog"') < messagesAt,
    );
    assert.ok(
      html.indexOf('data-open-dialog="new-inbox-message-dialog"') > messagesAt &&
        html.indexOf('data-open-dialog="new-inbox-message-dialog"') < insightsAt,
    );
    assert.equal((html.match(/data-open-dialog="csv-import-dialog"/g) ?? []).length, 1);
    assert.equal((html.match(/data-open-dialog="new-inbox-message-dialog"/g) ?? []).length, 1);
    assert.match(html, /data-review-evidence-state="empty"/);
    assert.match(html, /aria-live="polite"/);
    assert.doesNotMatch(html.slice(reviewAt, importsAt), /data-api-path="[^"]+\/(approve|reject)"/);
    const styles = inboxReviewArchetypeStyles();
    assert.match(styles, /\.inbox-review-detail \{ background: var\(--surface\)/);
    assert.match(
      styles,
      /\.inbox-review-queue-heading, \.inbox-review-detail-heading \{ align-items: start; display: grid/,
    );
    assert.match(styles, /\.inbox-review-group \{ border: 0/);
  });

  it("supports SSR selection of the imports tab without creating two selected tabpanels", () => {
    const html = renderInboxReviewArchetype({
      initialTab: "imports",
      messageActionHtml: "",
      importActionHtml: "",
      suggestionsHtml: "<section>Fila</section>",
      messagesHtml: "<section>Mensagens</section>",
      evidenceHtml: "<section>Importações</section>",
    });
    assert.match(html, /data-inbox-tab="imports"[^>]*aria-selected="true" tabindex="0"/);
    assert.match(html, /data-inbox-tab-panel="reviews" tabindex="0" hidden/);
    assert.match(html, /data-inbox-tab-panel="imports" tabindex="0">/);
    assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
    assert.equal((html.match(/role="tabpanel"/g) ?? []).length, 4);
  });
});
