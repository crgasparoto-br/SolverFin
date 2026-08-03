import assert from "node:assert/strict";

import { enhanceAccountsCardsActionMenus } from "./accounts-cards-action-menu-enhancement.js";

accountsCardsPageReceivesAccessibleActionMenus();
unrelatedPageIsNotChanged();

function accountsCardsPageReceivesAccessibleActionMenus(): void {
  const original = `<!doctype html><html><head></head><body>
    <section data-tab-panel="accounts">
      <article data-master-item>
        <div class="item-actions" aria-label="Ações de Conta principal">
          <button type="button" class="icon-button" data-open-dialog="edit-account-dialog-1" aria-label="Editar cadastro de Conta principal"><svg></svg></button>
          <form data-api-form data-api-path="/api/accounts/1/archive"><button type="submit" class="icon-button danger-icon-button"><svg></svg></button></form>
        </div>
      </article>
    </section>
  </body></html>`;

  const enhanced = enhanceAccountsCardsActionMenus(original);
  const enhancedAgain = enhanceAccountsCardsActionMenus(enhanced);

  assert.match(enhanced, /data-accounts-cards-action-menu-styles/);
  assert.match(enhanced, /data-accounts-cards-action-menu-script/);
  assert.match(enhanced, /action-menu-trigger/);
  assert.match(enhanced, /aria-haspopup', 'menu'/);
  assert.match(enhanced, /document\.querySelectorAll\('\.item-actions, \.instrument-actions'\)/);
  assert.match(enhanced, /Definir como padrão/);
  assert.match(enhanced, /Adicionar instrumento/);
  assert.match(enhanced, /event\.key === 'Escape'/);
  assert.match(enhanced, /event\.stopPropagation\(\)/);
  assert.match(enhanced, /document\.addEventListener\(\s*'keyup'/);
  assert.match(enhanced, /capture: true, once: true/);
  assert.match(enhanced, /event\.key !== 'ArrowDown' && event\.key !== 'ArrowUp'/);
  assert.match(enhanced, /data-action-menu-ready/);
  assert.match(enhanced, /position: fixed/);
  assert.match(enhanced, /\.action-menu-popover \.action-menu-item/);
  assert.match(enhanced, /const actionIcons = new WeakMap\(\)/);
  assert.match(enhanced, /content: attr\(data-action-menu-label\)/);
  assert.match(enhanced, /button\.dataset\.actionMenuLabel = label/);
  assert.match(enhanced, /function focusTrigger\(state\)/);
  assert.match(enhanced, /focus\(\{ preventScroll: true \}\)/);
  assert.match(enhanced, /window\.requestAnimationFrame\(\(\) =>/);
  assert.match(enhanced, /function positionMenu\(state\)/);
  assert.match(enhanced, /new MutationObserver\(scheduleActionMenuRefresh\)/);
  assert.match(enhanced, /document\.addEventListener\('DOMContentLoaded', startActionMenus/);
  assert.match(enhanced, /dialog\.addEventListener\('close'/);
  assert.match(enhanced, /window\.setTimeout\(\(\) => focusTrigger\(state\), 0\)/);
  assert.match(enhanced, /form && form\.dataset\.confirm/);
  assert.match(enhanced, /restoreFocus: !dialog/);
  assert.match(enhanced, /classList\.add\('is-danger', 'danger-menu-item'\)/);
  assert.match(enhanced, /form\.setAttribute\('role', 'none'\)/);
  assert.match(enhanced, /window\.addEventListener\('scroll'/);
  assert.equal(
    enhancedAgain.match(/data-accounts-cards-action-menu-styles/g)?.length,
    1,
    "os estilos devem ser injetados uma única vez",
  );
  assert.equal(
    enhancedAgain.match(/data-accounts-cards-action-menu-script/g)?.length,
    1,
    "o script deve ser injetado uma única vez",
  );
}

function unrelatedPageIsNotChanged(): void {
  const html = "<!doctype html><html><head></head><body><main>Outra tela</main></body></html>";
  assert.equal(enhanceAccountsCardsActionMenus(html), html);
}
