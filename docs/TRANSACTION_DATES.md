# Semântica temporal de lançamentos

Este documento é o contrato canônico das datas de `Transaction`. Ele complementa [`TRANSACTIONS.md`](./TRANSACTIONS.md), [`API_TRANSACTIONS.md`](./API_TRANSACTIONS.md), [`API_INSTALLMENTS.md`](./API_INSTALLMENTS.md), [`API_REPORTS.md`](./API_REPORTS.md) e [`PAYABLES_RECEIVABLES_TRANSITION.md`](./PAYABLES_RECEIVABLES_TRANSITION.md).

A regra central é: **evento econômico, planejamento e efeito de caixa são conceitos diferentes mesmo quando, em um caso simples, usam o mesmo dia**. Consumidores não devem aplicar um `COALESCE` universal às três datas.

## Formato e determinismo

As três datas são datas civis no formato `YYYY-MM-DD`. Elas não carregam horário nem offset e não devem ser reinterpretadas em timezone do navegador para decidir o dia financeiro.

O schema persistido atual mantém `occurredOn` e `plannedOn` obrigatórios por compatibilidade e `effectiveOn` anulável. Isso não torna os campos sinônimos: quando um fluxo não possui uma data planejada distinta, `plannedOn` pode coincidir com `occurredOn`; quando ainda não houve efeito de caixa, `effectiveOn` permanece ausente.

## Definições canônicas

### `occurredOn`

Data do **evento econômico ou da origem do lançamento**.

Exemplos:

- compra registrada em 10/06: `occurredOn=2026-06-10`;
- receita reconhecida em 20/07, embora prevista para agosto: `occurredOn=2026-07-20`;
- linha importada de extrato: data financeira trazida pela origem, depois de normalizada para `YYYY-MM-DD`.

Para `posted` e `reconciled`, relatórios históricos de receita/despesa continuam usando `occurredOn` como período econômico. Alterar `plannedOn` ou `effectiveOn` não pode mover silenciosamente esse período.

Na fronteira genérica `POST /api/transactions`, `occurredOn` é obrigatório. `plannedOn` e `effectiveOn` nunca são usados como fallback para fabricar a data econômica de um novo registro. Produtores especializados que não recebem três fatos independentes devem documentar explicitamente a coincidência que produzem, como na seção **Produtores especializados** abaixo.

### `plannedOn`

Data **planejada, prevista ou de vencimento** do compromisso.

Exemplos:

- conta reconhecida em 05/07 com vencimento em 10/08: `occurredOn=2026-07-05`, `plannedOn=2026-08-10`;
- parcela com vencimento em 15/09: `plannedOn=2026-09-15`;
- `PayableReceivable.dueOn` legado é mapeado para `plannedOn` durante a transição.

Se o lançamento imediato não tem planejamento distinto, `plannedOn` pode ser igual a `occurredOn`. Uma alteração de vencimento pode atualizar `plannedOn`, mas não deve reescrever `occurredOn` por consequência.

### `effectiveOn`

Data em que o lançamento **passa a produzir efeito de caixa na conta**.

- `planned` e `suggested`: `effectiveOn` fica ausente;
- `posted` e `reconciled`: `effectiveOn` deve existir;
- criação já realizada sem data efetiva distinta: a API de domínio usa `occurredOn` como data efetiva;
- transição de um lançamento pendente para `posted`/`reconciled` sem `effectiveOn` explícito: a data civil UTC do instante da transição é registrada como `effectiveOn`;
- enviar `effectiveOn: null` explicitamente para `posted`/`reconciled` é inválido (`TRANSACTION_EFFECTIVE_DATE_REQUIRED`);
- `voided` não cria efeito de caixa por si só: anular um `planned`/`suggested` mantém `effectiveOn` ausente, enquanto anular um registro que já foi `posted`/`reconciled` preserva o `effectiveOn` histórico existente;
- um registro criado diretamente como `voided` sem `effectiveOn` explícito permanece sem data efetiva; `occurredOn` não é convertido implicitamente em data de caixa.

Mover um lançamento realizado de volta para um estado ainda não efetivo limpa `effectiveOn`, preservando `occurredOn` e `plannedOn`. A anulação é diferente: ela encerra o movimento ativo sem inventar uma efetivação que não ocorreu e sem apagar uma efetivação histórica que já ocorreu.

## Precedência por uso

A precedência depende do objetivo do consumidor. Não existe uma ordem universal.

| Uso                                                     | Fonte temporal                                     | Motivo                                                                                                     |
| ------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Extrato operacional: filtro, ordenação e posição visual | `effectiveOn -> plannedOn -> occurredOn`           | prioriza caixa realizado; sem caixa, mostra o compromisso no dia planejado; `occurredOn` é fallback legado |
| Saldo efetivo do Extrato                                | somente lançamentos com `effectiveOn`              | compromisso ainda não efetivado não altera caixa realizado                                                 |
| Relatórios históricos realizados                        | `occurredOn`                                       | preserva o período do evento econômico                                                                     |
| Compromissos/projeções futuras                          | `plannedOn` enquanto `effectiveOn` estiver ausente | representa quando o compromisso é esperado                                                                 |
| Registro legado sem campos novos utilizáveis            | fallback de leitura para `occurredOn`              | compatibilidade, não fonte para novos contratos                                                            |

Quando um compromisso se torna efetivo, ele deixa de ser tratado simultaneamente como projeção futura. O mesmo `Transaction.id` representa a continuidade histórica; não se cria outro movimento apenas para trocar a fonte temporal.

## Matriz por origem e fluxo

A tabela descreve a intenção dos produtores atuais. Datas podem coincidir quando o caso não possui uma distinção real.

| Origem/fluxo                            | `occurredOn`                                                        | `plannedOn`                                                   | `effectiveOn`                                                                        |
| --------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| lançamento manual imediato              | evento informado                                                    | mesma data ou planejamento informado                          | data de caixa informada; na ausência, evento                                         |
| lançamento manual planejado             | evento/origem informado                                             | vencimento/previsão                                           | ausente até efetivação                                                               |
| recorrência materializada futura        | data de origem da ocorrência materializada                          | data calculada pela recorrência                               | ausente enquanto `planned`                                                           |
| parcela futura                          | origem da parcela materializada                                     | `Installment.dueOn`                                           | ausente enquanto `planned`                                                           |
| importação de movimento realizado       | data financeira da origem importada                                 | mesma data, salvo planejamento explícito suportado pelo fluxo | data do movimento importado                                                          |
| conciliação                             | preserva a data econômica já persistida                             | preserva o planejamento já persistido                         | data efetiva explícita da conciliação ou data da transição quando omitida            |
| anulação antes de efetivação            | preserva evento/origem                                              | preserva planejamento                                         | permanece ausente                                                                    |
| anulação depois de efetivação           | preserva evento/origem                                              | preserva planejamento                                         | preserva a data efetiva histórica anterior                                           |
| compra no cartão                        | data econômica da compra                                            | data usada pelo contrato da compra/fatura quando aplicável    | não deve ser usada para transformar pagamento de fatura em segunda despesa econômica |
| liquidação/pagamento de fatura          | data do evento do pagamento                                         | data planejada do pagamento, se houver                        | data em que o caixa da conta de pagamento é afetado                                  |
| `PayableReceivable` pendente legado     | `dueOn` apenas como fallback de compatibilidade do registro migrado | `dueOn` canônico do compromisso                               | ausente                                                                              |
| `PayableReceivable` liquidado legado    | preserva a transação de liquidação existente                        | preserva referência histórica                                 | preserva a data efetiva da transação vinculada                                       |

### Produtores especializados

Alguns produtores não recebem três fatos temporais independentes no payload e, por isso, documentam quando dois campos coincidem sem torná-los sinônimos:

- o parcelamento manual canônico de [`API_INSTALLMENTS.md`](./API_INSTALLMENTS.md) recebe `plannedOn` e `effectiveOn`, mas não recebe um `occurredOn` separado. Enquanto `planned`, o produtor usa `occurredOn=plannedOn` como origem materializada e mantém `effectiveOn` ausente; quando o conjunto já nasce `posted`/`reconciled`, usa a data efetiva derivada como `occurredOn` porque esse fluxo não recebeu outro evento econômico. Consumidores continuam escolhendo o campo pelo significado, não pela coincidência de valores;
- recorrências e parcelas futuras materializadas permanecem sem efeito de caixa enquanto planejadas. Sua efetivação posterior preserva o `occurredOn` já materializado e o `plannedOn` do compromisso, acrescentando `effectiveOn` em vez de substituir as datas anteriores;
- importadores que possuem uma data financeira de origem devem preservá-la em `occurredOn`; revisão e conciliação posteriores não podem convertê-la em vencimento ou data de caixa.

Para dados legados, valores iguais entre `occurredOn` e `plannedOn` são aceitos porque migrações anteriores preencheram `plannedOn` a partir de `occurredOn`. Novas decisões de negócio, porém, devem escolher o campo pelo significado acima e não pela disponibilidade de um valor conveniente.

## Transições de estado

### `planned` ou `suggested` -> `posted`

Antes:

```json
{
  "status": "planned",
  "occurredOn": "2026-07-05",
  "plannedOn": "2026-08-10"
}
```

Depois de efetivar em 12/08:

```json
{
  "status": "posted",
  "occurredOn": "2026-07-05",
  "plannedOn": "2026-08-10",
  "effectiveOn": "2026-08-12"
}
```

O delta planejado x realizado continua auditável: 10/08 era o compromisso e 12/08 foi o efeito de caixa. O evento econômico de 05/07 não é substituído.

### `posted` -> `reconciled`

A conciliação preserva `occurredOn` e `plannedOn`. Ela pode confirmar/ajustar `effectiveOn` quando a origem fornece a data efetiva correta. Uma mudança de status isolada não autoriza copiar `plannedOn` para `occurredOn` nem `effectiveOn` para `occurredOn`.

### `planned`/`suggested` ou realizado -> `voided`

A anulação nunca cria um fato de caixa novo. Se o lançamento ainda não tinha `effectiveOn`, ele continua ausente. Se o lançamento já tinha sido efetivado, a anulação preserva o `effectiveOn` histórico existente, embora o estado `voided` deixe de produzir movimento ativo. Um `voided` sem histórico efetivo que seja posteriormente reativado para `posted`/`reconciled` recebe a data civil UTC da nova transição como `effectiveOn` quando nenhuma data efetiva explícita for enviada.

### retorno para estado não efetivo

Ao voltar para `planned` ou `suggested`, `effectiveOn` é removido. As datas econômica e planejada permanecem como histórico do mesmo lançamento.

## Contratos de leitura

### Extrato

`apps/web/src/dev-server/transactions-statement.ts` é o consumidor operacional e resolve a data na ordem:

```text
effectiveOn -> plannedOn -> occurredOn
```

A mesma ordem vale para filtro e ordenação do Extrato. O cálculo de saldo efetivo exige `effectiveOn`; portanto uma pendência pode aparecer na agenda do Extrato sem alterar o caixa realizado.

### Relatórios realizados

Relatórios históricos de receita/despesa, incluindo evolução por categoria, filtram `posted`/`reconciled` por `occurredOn`. Eles **não** usam a precedência operacional do Extrato.

Um registro com:

```text
occurredOn = 2032-01-10
plannedOn  = 2032-02-15
effectiveOn = 2032-03-20
```

aparece no Extrato operacional em março, mas pertence ao relatório econômico realizado de janeiro. Esse caso é um controle obrigatório contra a implementação proibida `COALESCE(effectiveOn, plannedOn, occurredOn)` aplicada a todos os domínios.

## Importação, conciliação e compatibilidade

- importação preserva a data financeira da origem como `occurredOn`; revisar ou conciliar não pode trocá-la silenciosamente pela data de caixa;
- uma atualização que informa apenas `plannedOn` altera planejamento, não evento econômico;
- uma atualização que informa apenas `effectiveOn` altera efeito de caixa, não evento econômico;
- o fallback legado existe para conseguir ler/transicionar registros antigos, não para criar uma segunda definição temporal em novos produtores;
- a fronteira genérica de criação não usa `plannedOn` nem `effectiveOn` como substituto para `occurredOn`; ausência do evento econômico é erro de entrada;
- migrações e backfills devem ser idempotentes e documentar explicitamente quando datas iguais são cópias de compatibilidade.

## Regras para novos consumidores

1. Declare primeiro se o consumidor trata **evento econômico**, **planejamento** ou **caixa**.
2. Use a coluna correspondente diretamente quando existir uma fonte canônica para o caso.
3. Só use fallback onde este documento o define.
4. Não crie uma função/consulta genérica de "data da transação" e a reutilize entre Extrato, relatórios e projeções.
5. Teste pelo menos um registro em que as três datas sejam diferentes; testes com datas iguais não discriminam precedência errada.
