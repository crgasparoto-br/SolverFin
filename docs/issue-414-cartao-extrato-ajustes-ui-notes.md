# Notas da análise da issue #414

Arquivos relevantes identificados:

- `apps/web/src/dev-server/cards-page.ts`
  - `formatInstrumentLabel` monta o texto do select de instrumento e inclui `limite ...`.
  - `renderPurchaseModal` usa `renderInstrumentOptions` para criação e edição de compra.
- `apps/web/src/dev-server/recurrences-section.ts`
  - `setupCardPurchaseFormOverride` intercepta edição de compra recorrente quando `form.dataset.recurrenceId` está presente.
  - O fluxo pergunta o escopo por `window.confirm` antes de decidir entre edição do item atual e atualização da recorrência.
- `apps/web/src/dev-server/transactions-page.ts`
  - `.statement-heading` é o cabeçalho do Extrato.
  - Os botões com `data-open-modal` e `data-quick-kind` devem ser movidos/subidos para este cabeçalho, seguindo o padrão da tela `/cartoes`.

Pendência de implementação real:

- aplicar alteração de código nos arquivos acima;
- adicionar/ajustar testes web de regressão.
