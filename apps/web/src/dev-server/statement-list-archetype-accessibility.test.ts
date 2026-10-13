import assert from "node:assert/strict";
import test from "node:test";

import {
  renderStatementListArchetype,
  statementListArchetypeStyles,
} from "./statement-list-archetype.js";

test("statement A2 exposes active-profile runtime and keyboard listbox controls", () => {
  const html = renderStatementListArchetype({
    actionsHtml: '<button type="button">Nova receita</button>',
    filtersHtml:
      '<div data-account-picker><button type="button" data-account-trigger aria-expanded="false">Conta</button><ul data-account-menu role="listbox" hidden><li role="option" tabindex="-1" data-account-option="account-a" aria-selected="true">Conta A</li><li role="option" tabindex="-1" data-account-option="account-b" aria-selected="false">Conta B</li></ul></div>',
    contextHtml:
      '<section class="statement-context"><strong>Conta A</strong><div class="statement-context-meta"><span data-context="currency">BRL</span></div></section>',
    summaryHtml: "<aside>Resumo</aside>",
    listHtml: "<section>Movimentações</section>",
  });

  assert.match(html, /data-statement-profile-context-template/);
  assert.match(html, /data-statement-a2-context-runtime="true"/);
  assert.match(html, /Perfil: carregando/);
  assert.match(html, /\/api\/financial-profiles/);
  assert.match(html, /activeProfileId/);
  assert.match(html, /ArrowDown/);
  assert.match(html, /ArrowUp/);
  assert.match(html, /event\.key === 'Enter'/);
  assert.match(html, /event\.key === 'Escape'/);
  assert.match(html, /current\.click\(\)/);
  assert.match(statementListArchetypeStyles(), /account-select-menu li:focus-visible/);
});

test("statement A2 keeps action menus in a viewport-aware layer", () => {
  const html = renderStatementListArchetype({
    actionsHtml: '<button type="button">Nova receita</button>',
    filtersHtml: "<div>Filtros</div>",
    contextHtml: '<section class="statement-context">Conta</section>',
    summaryHtml: "<aside>Resumo</aside>",
    listHtml: `<section class="statement-row statement-body">
      <details class="actions col-actions"><summary aria-label="Ações do lançamento">•••</summary><div class="actions-menu" role="menu"><button type="button" class="actions-item">Editar</button></div></details>
    </section>`,
  });

  assert.match(html, /data-statement-action-menus-runtime="true"/);
  assert.match(html, /getBoundingClientRect\(\)/);
  assert.match(html, /const below = triggerRect\.bottom/);
  assert.match(html, /const above = triggerRect\.top/);
  assert.match(html, /document\.body\.appendChild\(state\.menu\)/);
  assert.match(html, /const actionMenuObserver = new MutationObserver/);
  assert.match(html, /actionMenuObserver\.observe\(root, \{ childList: true, subtree: true \}\)/);
  assert.match(html, /event\.key === 'Escape'/);
  assert.match(html, /focus\(\{ preventScroll: true \}\)/);
  assert.match(html, /window\.addEventListener\('scroll', schedulePosition, true\)/);
  assert.match(
    statementListArchetypeStyles(),
    /\[data-statement-action-menu-fixed\]\.actions-menu[^\n]*position: fixed !important/,
  );
  assert.match(statementListArchetypeStyles(), /max-height: calc\(100vh - 16px\)/);
});
