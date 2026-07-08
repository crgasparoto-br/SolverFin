# Issue #414 - Ajustes finais de UI

Esta solicitacao deve ser implementada diretamente nos componentes SSR de desenvolvimento.

## Alteracoes obrigatorias

### 1. Cartoes - instrumento sem limite

Arquivo: `apps/web/src/dev-server/cards-page.ts`

Remover a exibicao de limite em `formatInstrumentLabel`.

Antes, a funcao adiciona:

```ts
const limit =
  "effectiveCreditLimitMinor" in instrument && instrument.effectiveCreditLimitMinor !== undefined
    ? ` · limite ${formatMoney(instrument.effectiveCreditLimitMinor)}`
    : "";

return `${title}${identifier}${limit}`;
```

Depois, deve retornar apenas:

```ts
return `${title}${identifier}`;
```

### 2. Cartoes - pergunta de escopo ao editar recorrente

Arquivo: `apps/web/src/dev-server/recurrences-section.ts`

Garantir que a edicao de compra recorrente sempre pergunte:

- alterar somente este lancamento; ou
- alterar a recorrencia e os lancamentos futuros.

O fluxo atual usa `window.confirm`. Se mantido, a mensagem deve deixar claro:

```text
Este lançamento faz parte de uma recorrência.

OK: aplicar também na recorrência e nos lançamentos futuros.
Cancelar: alterar somente este lançamento.
```

Validar que `form.dataset.recurrenceId` seja preenchido quando a compra editada possuir `recurrenceId`.

### 3. Extrato - acoes rapidas no cabecalho

Arquivo: `apps/web/src/dev-server/transactions-page.ts`

Mover os botoes rapidos para `.statement-heading`, seguindo o padrao de `.cards-heading`.

Manter o uso de:

- `data-open-modal`;
- `data-quick-kind="expense"`;
- `data-quick-kind="income"`;
- `data-quick-kind="transfer"`;
- estado `disabled` quando nao houver conta selecionada.

## Testes esperados

- teste de renderizacao garantindo que `limite` nao aparece nas opcoes de instrumento;
- teste de compra recorrente garantindo a presenca de `recurrenceId` no JSON renderizado e confirmacao de escopo;
- teste de Extrato garantindo botoes rapidos dentro do cabecalho.
