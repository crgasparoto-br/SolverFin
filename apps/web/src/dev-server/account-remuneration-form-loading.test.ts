import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { enhanceAccountsCardsTabs } from "./accounts-cards-enhancement.js";

const enhancedHtml = enhanceAccountsCardsTabs(`<!doctype html><html><head></head><body>
  <section data-tab-panel="accounts">
    <div data-master-list>
      <article data-master-item data-status="active">
        <div class="item-main"><div class="item-title-row"><strong>Conta principal</strong></div></div>
        <div class="item-actions"><button data-open-dialog="edit-account-dialog-account-1">Editar</button></div>
        <form class="edit-grid" data-api-path="/api/accounts/account-1" data-api-method="PATCH">
          <select name="currency"><option value="BRL" selected>BRL</option></select>
          <input name="openingBalanceMinor" value="10000" />
          <button type="submit">Salvar conta</button>
        </form>
      </article>
    </div>
  </section>
</body></html>`);

const script = extractEnhancementScript(enhancedHtml);

describe("account remuneration modal integration", () => {
  it("keeps CDI configuration separate from the account form", () => {
    assert.match(enhancedHtml, /data-account-remuneration-modal-styles/);
    assert.match(script, /data-account-remuneration-dialog/);
    assert.match(script, /data-account-remuneration-form/);
    assert.match(script, /Ativar CDI/);
    assert.match(script, /Configurar CDI/);
    assert.match(script, /CDI ativo/);
    assert.match(script, /Percentual de remuneração sobre o CDI/);
    assert.match(script, /O cálculo usa o saldo final do dia anterior\./);
    assert.doesNotMatch(script, /wireCombinedAccountSubmit/);
    assert.doesNotMatch(script, /data-account-remuneration-fields/);
    assert.doesNotMatch(script, /Salvando conta e remuneração/);
  });

  it("submits only the remuneration contract and keeps persisted values on disable", () => {
    const payloadFunction = extractFunction(script, "readRemunerationPayload");

    assert.match(payloadFunction, /enabled:/);
    assert.match(payloadFunction, /remunerationPercent:/);
    assert.match(payloadFunction, /startsOn/);
    assert.match(payloadFunction, /categoryId/);
    assert.doesNotMatch(payloadFunction, /openingBalanceMinor/);
    assert.doesNotMatch(payloadFunction, /institutionKey/);
    assert.doesNotMatch(payloadFunction, /currency:/);
    assert.match(script, /method: "PUT"/);
    assert.match(script, /\/api\/account-remuneration\/configurations/);
    assert.match(script, /configuration && configuration\.remunerationPercent !== undefined \? configuration\.remunerationPercent : 100/);
    assert.match(script, /configuration && configuration\.startsOn \? configuration\.startsOn : today\(\)/);
  });

  it("degrades only CDI actions when configuration loading fails", () => {
    assert.match(script, /Contas e cartões continuam disponíveis/);
    assert.match(script, /data-account-remuneration-load-error/);
    assert.match(script, /Tentar novamente/);
    assert.match(script, /data-account-remuneration-retry/);
    assert.match(script, /Disponível somente para contas em BRL/);
    assert.match(script, /Contas arquivadas não podem configurar remuneração pelo CDI/);
  });

  it("keeps the modal open and preserves entered values after API errors", () => {
    const failureStart = script.indexOf("if (!response.ok)");
    const failureReturn = script.indexOf("return;", failureStart);
    const closeAfterFailure = script.indexOf("dialog.close();", failureStart);

    assert.ok(failureStart >= 0);
    assert.ok(failureReturn > failureStart);
    assert.ok(closeAfterFailure > failureReturn);
    assert.match(script, /status\.textContent = result\.message/);
    assert.match(script, /aria-live="polite"/);
    assert.match(script, /dialog\.addEventListener\("close", \(\) => model\.action\.focus\(\)\)/);
  });
});

function extractEnhancementScript(html: string): string {
  const match = /<script data-accounts-cards-direct-enhancement>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match?.[1], "script de remuneração não encontrado");
  return match[1];
}

function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `função ${name} não encontrada`);
  const end = source.indexOf("\n          }", start);
  assert.ok(end > start, `fim da função ${name} não encontrado`);
  return source.slice(start, end + 12);
}
