# Issue #414 - Ajustes de UI em Cartões e Extrato

Este documento registra os ajustes solicitados após a finalização das telas de Extrato da conta e Cartões de Crédito.

## Cartões de Crédito (`/cartoes`)

### Campo Instrumento na edição de compra

Na tela de edição de compra do cartão, o campo **Instrumento** deve exibir somente a identificação do instrumento.

Comportamento esperado:

- manter o instrumento já selecionado ao editar a compra;
- manter nome/tipo/titular e identificador mascarado quando existirem;
- remover qualquer informação de limite do texto da opção;
- não alterar o cálculo, resumo ou cards de limite da fatura.

O ponto atual a ajustar é `formatInstrumentLabel` em `apps/web/src/dev-server/cards-page.ts`, que ainda concatena `limite ...` ao label do instrumento.

### Edição de compra recorrente

Ao salvar uma compra/lancamento recorrente editado em `/cartoes`, o sistema deve perguntar o escopo da alteração antes de enviar a mudança.

Comportamento esperado:

- perguntar se a alteração vale apenas para o lançamento atual ou para a recorrência/lançamentos futuros;
- se o usuário escolher somente o lançamento atual, salvar pela rota de edição da compra;
- se escolher recorrência/futuros, salvar pela rota de recorrência com `editScope` adequado;
- preservar `cardInstrumentId`, categoria, descrição, valor e data conforme permitido pelo contrato atual.

## Extrato da conta (`/lancamentos`)

### Ações rápidas no cabeçalho

Na tela de Extrato da conta, os botões de ação rápida devem ficar no topo da tela, no mesmo padrão visual do botão **Nova compra** da tela de Cartões de Crédito.

Comportamento esperado:

- mover/subir as ações rápidas para o cabeçalho `.statement-heading`;
- manter o botão desabilitado quando não houver conta selecionada;
- preservar os atalhos de tipo (`data-quick-kind`) já existentes;
- não alterar a lógica do modal ou dos filtros de conta/mês.

## Critérios de aceite

- [ ] O select de instrumento em `/cartoes` não exibe texto de limite em criação ou edição.
- [ ] A edição de compra recorrente pergunta o escopo da alteração antes de salvar.
- [ ] Escolher alteração somente do lançamento atual mantém o fluxo de edição da compra.
- [ ] Escolher alteração da recorrência/futuros usa a rota de recorrência com escopo adequado.
- [ ] Os botões de ação rápida do Extrato ficam no cabeçalho, visualmente equivalentes ao botão **Nova compra** de `/cartoes`.
- [ ] Os botões continuam respeitando conta selecionada e `data-quick-kind`.

## Validação sugerida

Executar os testes web relevantes e, quando possível, validação geral do projeto.
