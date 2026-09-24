# API de compromissos financeiros futuros

`GET /api/future-commitments` e a consulta canonica da agenda financeira futura do SolverFin.
Ela separa a identidade logica do compromisso de seus efeitos monetarios e aplica a precedencia
definida pela issue #616 antes de devolver qualquer item ao consumidor.

## Filtros

- `from=YYYY-MM-DD`: inicio inclusivo do periodo canonico;
- `to=YYYY-MM-DD`: fim inclusivo do periodo canonico;
- `currency=BRL`: opcional; filtra os efeitos monetarios pela moeda solicitada.

`from` e `to` sao obrigatorios. O periodo usa a data canonica da fonte:

- `Transaction.plannedOn` para compromissos de conta;
- `Invoice.dueOn` para obrigacoes de cartao;
- a data calculada da ocorrencia para projecao de recorrencia;
- `PayableReceivable.dueOn` somente no fallback legado.

A API exige sessao valida e herda o `TenantContext` resolvido no servidor. Organizacao e perfil
financeiro nao sao aceitos do cliente como substitutos do contexto autenticado.

## Forma da resposta

Cada item de `commitments` possui:

- `id`: identidade deterministica da representacao canonica;
- `plannedOn`;
- `description`;
- `source`: origem e identificadores suficientes para drilldown;
- `monetaryEffects[]`: efeitos assinados, cada um com valor, moeda, papel e vinculo de conta/cartao
  quando existente;
- `replacementKey` quando uma projecao recorrente pode ser substituida por sua ocorrencia
  materializada.

Valores negativos representam saida de caixa; valores positivos representam entrada.

Uma transferencia planejada de 538,32 BRL para 100,00 USD possui uma unica identidade de compromisso
e dois efeitos:

```json
{
  "id": "transaction:<id>",
  "monetaryEffects": [
    { "role": "source_account", "amountMinor": -53832, "currency": "BRL" },
    { "role": "destination_account", "amountMinor": 10000, "currency": "USD" }
  ]
}
```

Com `currency=BRL`, a mesma identidade permanece na resposta e somente o efeito BRL e projetado.
Com `currency=USD`, a identidade continua a mesma e somente o efeito USD e retornado. A API nunca
reconstroi o segundo leg por taxa cambial.

## Precedencia e deduplicacao

A agenda aplica estas regras antes da resposta:

1. `Transaction` com status `planned` e a instancia canonica de compromisso de conta.
2. `Invoice` aberta, fechada ainda nao paga ou vencida e a obrigacao canonica de caixa do cartao.
   Transacoes ligadas a uma fatura nao viram outro compromisso top-level.
3. `Recurrence` ativa de conta pode produzir projecoes derivadas. `Installment` e
   `Transaction` materializadas para a mesma recorrencia/data bloqueiam a projecao correspondente.
4. `PayableReceivable` pendente participa somente como fallback legado. A classificacao de
   equivalencia reutiliza o plano canonico de transicao existente; esta API nao cria uma segunda
   heuristica por valor/data.
5. Dois compromissos canonicos distintos nunca sao colapsados apenas porque possuem o mesmo valor e a
   mesma data.

Parcelas manuais e recorrencias materializadas ja produzem `Transaction`; parcelas de cartao
pertencem a `Invoice`. Por isso `Installment` atua na agenda como proveniencia/marcador de
materializacao, e nao como uma obrigacao top-level concorrente.

Recorrencias de cartao nao sao projetadas diretamente pela agenda: o vencimento de caixa canonico
nasce da `Invoice`. Quando a compra recorrente e materializada, a fatura resultante passa a
representar o compromisso.

## Lifecycle

- editar data, conta ou valor de uma `Transaction` planejada altera a consulta seguinte sem manter
  uma copia anterior;
- efetivar, reconciliar ou anular remove a `Transaction` da agenda futura;
- os dois efeitos de uma transferencia cross-currency sao sempre produzidos pela mesma
  `Transaction`; estado persistido sem o leg de destino exigido falha fechado;
- materializar uma recorrencia substitui a projecao pela ocorrencia real por
  `replacementKey=recurrence:<id>:<plannedOn>`;
- cancelar/pausar a regra impede novas projecoes conforme o status da recorrencia.

## Consumidores

Esta consulta e a fronteira backend para Dashboard e para as evolucoes #617 e #619. Consumidores
podem agregar efeitos somente dentro da mesma moeda. Eles nao devem concatenar novamente
`Transaction`, `Invoice`, `Recurrence`, `Installment` e `PayableReceivable`.

A API nao usa provider de IA, cotacao cambial ou deduplicacao heuristica por valor/data.
