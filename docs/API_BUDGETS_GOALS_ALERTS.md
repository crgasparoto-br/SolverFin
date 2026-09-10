# Orcamentos, metas e alertas basicos

Este documento descreve o contrato de dominio e API para controle mensal por categoria, calculo de uso percentual e alertas basicos.

## Escopo entregue

- Criacao, listagem, leitura, edicao e arquivamento de orcamentos.
- Orcamento mensal por categoria de despesa e contexto financeiro.
- Calculo de uso com base em transacoes realizadas do periodo e da mesma moeda do orcamento.
- Resumo para dashboard com categorias orcadas e categorias com gasto sem orcamento.
- Status basico de acompanhamento: `no_activity`, `on_track`, `approaching`, `exceeded` e `unbudgeted`.
- Persistencia real e rotas HTTP para os fluxos de orcamento existentes.
- Auditoria redigida para criacao e atualizacao de orcamentos.

## Periodo padrao

Decisao de MVP: o periodo padrao e mes calendario.

`getMonthlyBudgetPeriod("2026-06")` retorna:

- `periodStartOn`: `2026-06-01`
- `periodEndOn`: `2026-06-30`

Tambem e possivel informar um periodo parcial explicitamente. O dominio valida que o fim seja igual ou posterior ao inicio.

## Calculo de uso e moeda

O uso de um orcamento considera somente transacoes:

- do mesmo tenant/contexto financeiro;
- do tipo `expense`;
- com status `posted` ou `reconciled`;
- com `occurredOn` dentro do periodo;
- vinculadas a categoria do orcamento;
- com `currency` igual a moeda nativa do orcamento.

A consulta persistida usada por `summarizeBudgetUsageForContext` aplica tambem o filtro de moeda no SQL. O dominio repete a verificacao antes da soma, evitando que um chamador em memoria misture moedas por engano.

Transacoes `planned`, `suggested` ou `voided` nao entram no uso realizado do MVP.

Campos principais do resumo:

- `plannedAmountMinor`: valor planejado do orcamento.
- `actualAmountMinor`: soma realizada na mesma moeda.
- `remainingAmountMinor`: planejado menos realizado.
- `usedPercent`: percentual arredondado para duas casas decimais.
- `alertThresholdPercent`: limite de aproximacao, configuravel por orcamento.
- `status`: status de acompanhamento.
- `currency`: moeda explicita do calculo.

Uma categoria pode possuir dados em BRL e USD no mesmo periodo sem que esses valores sejam somados. O resumo de dashboard de dominio mantém entradas independentes por combinação `currency + categoryId` e ordena os resultados por moeda e categoria. Quando o filtro opcional de moeda e informado, ele apenas restringe a moeda nativa analisada; quando e omitido, as moedas permanecem separadas. Nao ha conversao cambial ou fallback de apresentacao dentro da agregacao.

## Alertas

Decisao de MVP:

- O alerta de aproximacao e configuravel por orcamento via `alertThresholdPercent`.
- Quando nao informado, o padrao e 80%.
- A partir de 100%, ou quando o uso passa do planejado, o status e `exceeded`.
- Orcamento com valor zero e algum gasto tambem fica `exceeded`.
- Orcamento sem gasto fica `no_activity`.

## Categorias sem orcamento

`summarizeBudgetDashboard` inclui categorias com gasto realizado sem orcamento como itens `unbudgeted`.

Cada item sem orcamento preserva a moeda da transacao que originou o total. A mesma categoria pode portanto gerar, por exemplo, um item BRL e outro USD; nenhum dos dois recebe uma moeda sintetica.

Transacoes sem categoria sao ignoradas nesse resumo porque nao ha categoria para associar a meta.

## Interface operacional `/orcamentos`

A rota `/orcamentos` usa o arquetipo A1 de acompanhamento operacional e consome os contratos acima sem recalcular valores financeiros no renderer.

- Cada orcamento identifica categoria, periodo e moeda de forma explicita.
- Valores monetarios usam a primitiva `Money` com a moeda nativa do orcamento; ausencia de moeda nunca vira BRL por fallback visual.
- `Planejado` vem do proprio `Budget`; `Realizado`, percentual e status vem de `GET /api/budgets/:budgetId/usage`.
- A resposta de uso so e apresentada quando categoria, periodo, valor planejado e moeda continuam coerentes com o orcamento exibido. Divergencia ou falha de leitura produz estado `Realizado indisponivel`, nunca `0` sintetico.
- Filtros de moeda e estado atuam apenas sobre a colecao apresentada e nao consolidam moedas.
- Criacao e edicao exigem moeda explicita e preservam periodo e categoria como parte do contexto do orcamento.
- `committed`, `projected`, `available` e demais estados da Fase 4A nao sao calculados nem simulados nesta interface enquanto o contrato da #619 nao estiver implementado.
- O Extrato atual exige contexto de conta para reproduzir um recorte. Como o uso do orcamento e agregado por categoria, periodo e moeda entre as fontes elegiveis, a interface nao fabrica um deep link parcial que descartaria esse contexto. Um drilldown so deve ser exposto quando existir rota/filtro canonico capaz de representar fielmente o mesmo recorte.

## Validacoes

- Categoria do orcamento deve existir no tenant ativo.
- Categoria deve estar ativa.
- Nesta etapa MVP, a categoria deve ser de despesa.
- Valor planejado deve ser inteiro em unidades menores e pode ser zero.
- Moeda usa formato ISO 4217.
- Limiar de alerta deve ser inteiro de 1 a 100.
- Testes de agregacao devem incluir mais de uma moeda quando houver valores da mesma categoria e periodo.

## Fora de escopo

- Conversao cambial, taxa de cambio ou consolidacao entre moedas.
- Alertas push, e-mail ou notificacoes externas.
- Planejamento financeiro avancado.
- Recomendacao automatica por IA.
