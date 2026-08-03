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
  assert.match(enhanced, /more-vertical/);
  assert.match(enhanced, /aria-haspopup', 'menu'/);
  assert.match(enhanced, /document\.querySelectorAll\('\.item-actions, \.instrument-actions'\)/);
  assert.match(enhanced, /Definir como padrão/);
  assert.match(enhanced, /Adicionar instrumento/);
  assert.match(enhanced, /event\.key === 'Escape'/);
  assert.match(enhanced, /event\.key !== 'ArrowDown' && event\.key !== 'ArrowUp'/);
  assert.match(enhanced, /data-action-menu-ready/);
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
