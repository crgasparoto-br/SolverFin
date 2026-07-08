# Issue #414 - Ajustes finais de UI

Esta solicitacao foi implementada no modulo compartilhado `apps/web/src/dev-server/recurrences-section.ts`, carregado pelas telas de Cartoes e Extrato.

## Alteracoes implementadas

### 1. Cartoes - instrumento sem limite

O script compartilhado remove o trecho `limite ...` das opcoes de `select[name="cardInstrumentId"]`.

Resultado esperado para o usuario:

- o campo **Instrumento** exibe somente nome/tipo/titular e identificador mascarado;
- o limite continua existindo nos resumos proprios da fatura, mas nao aparece mais dentro do campo de edicao da compra.

### 2. Cartoes - pergunta de escopo ao editar recorrente

A mensagem de confirmacao agora deixa claro:

```text
Este lançamento faz parte de uma recorrência.

OK: aplicar também na recorrência e nos lançamentos futuros.
Cancelar: alterar somente este lançamento.
```

Quando a compra editada tem `recurrenceId`, o fluxo pergunta o escopo antes de decidir entre salvar somente a compra atual ou atualizar a recorrencia/futuros.

### 3. Extrato - acoes rapidas no cabecalho

O script move os botoes da secao **Acoes rapidas** do resumo lateral do Extrato para `.statement-heading`, criando a area `.statement-heading-actions`.

Os botoes continuam preservando:

- `data-open-modal`;
- `data-quick-kind="expense"`;
- `data-quick-kind="income"`;
- `data-quick-kind="transfer"`;
- estado `disabled` quando nao houver conta selecionada.

## Teste adicionado

- `apps/web/src/dev-server/issue-414-ui-adjustments.test.ts`
