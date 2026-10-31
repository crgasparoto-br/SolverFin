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
      actionsHtml:
        '<button type="button" data-open-dialog="new-inbox-message-dialog">Registrar mensagem</button><button type="button" data-open-dialog="csv-import-dialog">Importar extrato</button>',
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
    assert.match(html, /class="sf-filter-bar"/);
    assert.match(html, /class="sf-detail-layout"/);
    assert.match(html, /class="inbox-section-nav"/);
    assert.match(html, /id="inbox-review-queue"/);
    assert.match(html, /data-inbox-review-evidence/);
    assert.match(html, /Evidência e decisão/);
    assert.match(html, /Item em revisão/);
    assert.match(html, /data-open-dialog="new-inbox-message-dialog"/);
    assert.match(html, /data-open-dialog="csv-import-dialog"/);
    assert.match(html, /data-api-action/);
    assert.match(html, /data-inbox-review-runtime="true"/);
  });

  it("applies Golden Screen neutral navigation, accessible actions, modal menu states and touch targets", () => {
    const html = renderInboxReviewArchetype({
      actionsHtml: '<button type="button" data-open-dialog="csv-import-dialog">Importar</button>',
      suggestionsHtml: "<section>Fila</section>",
      messagesHtml: "<section>Mensagens</section>",
      evidenceHtml: "<section>Importações</section>",
    });
    const css = inboxReviewArchetypeStyles();
    assert.equal(
      (html.match(/class="sf-button sf-button-secondary sf-focus-ring inbox-review-nav"/g) ?? [])
        .length,
      3,
    );
    assert.match(
      html,
      /class="inbox-new-entry-trigger sf-focus-ring" aria-label="Adicionar entrada à Inbox"/,
    );
    assert.match(html, /event.key !== "Escape"/);
    assert.match(html, /entryTrigger\?\.focus\(\)/);
    assert.match(html, /data-button-variant="neutral" type="button">Limpar/);
    assert.match(css, /--sf-color-neutral-control-hover/);
    assert.match(css, /--sf-shadow-focus/);
    assert.match(css, /--sf-density-interactive-target-min/);
    assert.match(css, /\.inbox-section-nav \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;/);
    assert.match(css, /\.inbox-review-nav \{[^}]*flex: 0 0 auto;[^}]*white-space: nowrap;/);
    assert.match(
      css,
      /@media \(max-width: 900px\) \{[\s\S]*?\.inbox-review-cockpit \.sf-filter-bar \{ display: grid; grid-template-columns: minmax\(0, 1fr\); \}/,
    );
    assert.match(css, /\.inbox-new-entry-actions \{[^}]*width: min\(100%, 240px\)/);
    assert.doesNotMatch(css, /#(?:[0-9a-fA-F]{3}){1,2}\b/);
  });

  it("keeps the direct A6 composition intact while the legacy category adapter only enriches category behavior", () => {
    const html = renderInboxReviewArchetype({
      actionsHtml: "",
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
  it("separates the review decision from secondary messages, insights and CSV/OFX imports", () => {
    const html = renderInboxReviewArchetype({
      actionsHtml: '<button data-open-dialog="csv-import-dialog">Importar extrato</button>',
      suggestionsHtml:
        '<section><h2>Outras sugestões</h2><button data-review-select="fixture">Revisar</button></section>',
      messagesHtml: "<section data-inbox-messages>Mensagens recebidas</section>",
      insightsHtml: "<section data-inbox-insights>Insights financeiros</section>",
      evidenceHtml: "<section data-inbox-review-evidence>Importações CSV/OFX</section>",
    });
    const queueAt = html.indexOf('id="inbox-review-queue"');
    const selectedAt = html.indexOf('id="inbox-review-selected"');
    const secondaryAt = html.indexOf('id="inbox-review-secondary"');
    assert.ok(queueAt >= 0 && queueAt < selectedAt && selectedAt < secondaryAt);
    assert.ok(html.indexOf("data-inbox-messages") > secondaryAt);
    assert.ok(html.indexOf("data-inbox-insights") > secondaryAt);
    assert.ok(html.indexOf("data-inbox-review-evidence") > secondaryAt);
    assert.match(html, /data-review-evidence-state="empty"/);
    assert.match(html, /Adicionar entrada/);
    assert.match(html, /aria-live="polite"/);
    assert.doesNotMatch(html.slice(0, secondaryAt), /data-api-path="[^"]+\/(approve|reject)"/);
    const styles = inboxReviewArchetypeStyles();
    assert.match(styles, /\.inbox-review-detail \{ background: var\(--surface\)/);
    assert.match(
      styles,
      /\.inbox-review-queue-heading, \.inbox-review-detail-heading \{ align-items: start; display: grid/,
    );
    assert.match(styles, /\.inbox-review-group \{ border: 0/);
    assert.match(styles, /@media \(max-width: 900px\)/);
    assert.match(styles, /@media \(max-width: 600px\)/);
  });
});
