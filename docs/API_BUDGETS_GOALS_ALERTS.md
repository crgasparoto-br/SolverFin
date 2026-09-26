# Orcamentos, metas e alertas basicos

Este documento descreve o contrato de dominio e API para acompanhamento de orcamentos por categoria, periodo e moeda.

## Escopo entregue

- Criacao, listagem, leitura, edicao e arquivamento de orcamentos.
- Orcamento por categoria de despesa e contexto financeiro.
- Acompanhamento separado de valor planejado, realizado, comprometido, projetado e disponivel.
- Resumo operacional com categorias orcadas, categorias identificadas sem orcamento e bucket analitico **Sem categoria**.
- Persistencia real e rotas HTTP para os fluxos de orcamento existentes.
- Auditoria redigida para criacao e atualizacao de orcamentos.
- Separacao multi-moedas sem conversao implicita.

## Periodo padrao

A criacao por mes usa mes calendario.

`getMonthlyBudgetPeriod("2026-06")` retorna:

- `periodStartOn: 2026-06-01`
- `periodEndOn: 2026-06-30`

Tambem e possivel informar periodo parcial explicitamente. O fim deve ser igual ou posterior ao inicio.

## Contrato de consumo orcamentario

Para uma combinacao **categoria + periodo + moeda** com orcamento ativo:

```text
planned   = valor configurado do orcamento
realized  = despesas economicas confirmadas no periodo
committed = despesas futuras deterministicas conhecidas, ainda nao realizadas
projected = realized + committed
available = planned - projected
overBudget = max(0, -available)
```

A API preserva os nomes legados `actualAmountMinor` e `remainingAmountMinor` por compatibilidade:

- `actualAmountMinor` e igual a `realizedAmountMinor`;
- `remainingAmountMinor` continua significando `planned - realized`;
- para decisao futura, use `availableAmountMinor`, que considera `committed`.

Nenhuma dessas formulas e recalculada na interface.

### Realizado

O realizado inclui somente `Transaction`:

- do mesmo tenant e perfil financeiro;
- do tipo `expense`;
- com status `posted` ou `reconciled`;
- com `occurredOn` dentro do periodo exato do orcamento;
- com a mesma categoria;
- com a mesma moeda nativa.

`planned`, `suggested`, `pending_review`, `duplicate` e `voided` nao entram no realizado.

### Comprometido

O comprometido usa a semantica temporal de `plannedOn` e reutiliza a agenda canonica de compromissos futuros da #616.

Duas fontes economicas sao consideradas sem dupla contagem:

1. `Transaction expense/planned` ainda sem `effectiveOn`, inclusive compra de cartao categorizada vinculada a fatura;
2. compromissos canonicos nao materializados de recorrencia e legado elegivel, depois da deduplicacao da agenda #616.

A composicao orcamentaria nao usa:

- `Invoice` como categoria;
- pagamento/forecast de fatura como segunda despesa;
- transferencias internas, same-currency ou cross-currency;
- receitas;
- conversao cambial.

Quando uma ocorrencia deixa de ser futura e passa a `posted` ou `reconciled`, ela deixa de compor `committed`. Se `plannedOn` e `occurredOn` estiverem em periodos diferentes, o valor sai do periodo planejado e aparece como realizado apenas no periodo ocorrido.

## Contrato de resposta

`GET /api/budgets/:budgetId/usage` retorna um item `source=budget` com:

- `budgetId`, `categoryId`, periodo e `currency`;
- `plannedAmountMinor`;
- `actualAmountMinor` e `realizedAmountMinor`;
- `committedAmountMinor`;
- `projectedAmountMinor`;
- `remainingAmountMinor` para compatibilidade;
- `availableAmountMinor`;
- `overBudgetAmountMinor`;
- `usedPercent`, `alertThresholdPercent` e o status historico existente;
- `realizedItems[]` e `committedItems[]` para composicao/drilldown.

`availableAmountMinor` pode ser negativo. `overBudgetAmountMinor` so e calculado quando existe um `plannedAmountMinor` real.

### Resumo operacional por periodo

`GET /api/budgets/dashboard?periodStartOn=YYYY-MM-DD&periodEndOn=YYYY-MM-DD` expoe o resumo operacional para o perfil financeiro ativo.

- O periodo e obrigatorio.
- `currency=XXX` e opcional.
- Sem filtro de moeda, os itens permanecem separados por moeda.
- A rota nunca converte nem soma moedas diferentes.
- Itens com orcamento usam `source=budget`.
- Categoria identificada com consumo cuja data economica nao esteja coberta por um orcamento ativo da mesma categoria e moeda usa `source=unbudgeted`.
- Consumo sem categoria usa `source=uncategorized`.

## Categorias identificadas sem orcamento

`source=unbudgeted` preserva categoria, moeda, periodo, realizado, comprometido, projetado e composicao. A cobertura e decidida por item: `occurredOn` governa o realizado e `plannedOn` governa o comprometido. Em consultas maiores que um orcamento parcial, consumos antes, depois ou em lacunas entre orcamentos permanecem `unbudgeted` em vez de desaparecer.

Nao existe orcamento implicito:

- `plannedAmountMinor = null`;
- `remainingAmountMinor = null`;
- `availableAmountMinor = null`;
- `overBudgetAmountMinor = null`;
- `usedPercent = null`;
- `alertThresholdPercent = null`.

Um item `unbudgeted` nao e equivalente a um orcamento de valor zero e nao deve ser classificado como excedido apenas por possuir consumo.

## Sem categoria

`source=uncategorized` e o bucket analitico **Sem categoria**.

Ele:

- preserva moeda e periodo;
- inclui realizado e comprometido ainda sem categoria;
- calcula apenas `projected = realized + committed`;
- nao recebe `planned=0`;
- mantem `planned`, `remaining`, `available`, `overBudget`, percentual e limiar como `null`;
- nao reduz o orcamento de outra categoria;
- expoe `realizedItems[]` e `committedItems[]` para localizar os itens e permitir categorizacao posterior.

## Fatura multicategoria

O orcamento usa as ocorrencias economicas categorizadas das compras.

Exemplo: uma fatura de 2.000 formada por Alimentacao 800, Transporte 400, Saude 500 e Sem categoria 300 distribui o consumo nesses quatro recortes. O registro `Invoice` e o pagamento da fatura nao adicionam outros 2.000 ao orcamento.

## Transferencias

Transferencias internas nao constituem consumo economico de categoria.

Isso vale para:

- transferencia na mesma moeda;
- transferencia cross-currency com dois valores nativos;
- debito da conta de origem;
- credito da conta de destino.

Nenhum leg entra em `realized` ou `committed`.

## Multi-moedas

Moeda faz parte da identidade do agregado.

- BRL e USD da mesma categoria permanecem em itens diferentes.
- Um filtro de moeda apenas restringe os itens retornados.
- Nao existe fallback de BRL nem consolidacao automatica.
- A ordenacao do dashboard e deterministica por moeda, categoria e tipo de origem.

## Interface operacional `/orcamentos`

A rota usa o arquetipo A1 e consome os valores calculados pelo backend.

A tabela apresenta, por item:

- categoria ou **Sem categoria**;
- periodo;
- moeda;
- planejado;
- realizado;
- comprometido;
- projetado;
- disponivel;
- status do realizado;
- composicao de itens para drilldown.

Para `unbudgeted`, o planejado aparece como **Sem orçamento**. Para `uncategorized`, aparece como **Sem categoria**. O disponivel e explicitamente inaplicavel quando nao existe orcamento real.

A tela nao calcula `committed`, `projected`, `available` nem `overBudget`.

## Alertas e status existente

O status historico preservado continua baseado no realizado para compatibilidade:

- `no_activity`;
- `on_track`;
- `approaching`;
- `exceeded`;
- `unbudgeted`.

A condicao futura de estouro e representada numericamente por `overBudgetAmountMinor`; ela nao reinterpreta silenciosamente o status historico.

## Validacoes

- Categoria do orcamento deve existir no tenant ativo.
- Categoria deve estar ativa e ser de despesa.
- Valor planejado deve ser inteiro em unidades menores e pode ser zero.
- Moeda usa ISO 4217.
- Limiar de alerta deve ser inteiro de 1 a 100.
- Testes de agregacao cobrem moedas distintas, periodo planejado versus ocorrido e ausencia de dupla contabilizacao de fatura/transferencia.

## Fora de escopo

- rollover automatico;
- conversao cambial automatica;
- previsao estatistica ou IA;
- inferencia automatica de categoria;
- orcamento implicito para `Sem categoria` ou `unbudgeted`;
- alertas push, e-mail ou notificacoes externas.
