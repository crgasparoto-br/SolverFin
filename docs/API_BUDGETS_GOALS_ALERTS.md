# Orcamentos, metas e alertas basicos

Este documento descreve o contrato de dominio inicial para controle mensal por categoria, calculo de uso percentual e alertas basicos.

## Escopo entregue

- Criacao, listagem, leitura, edicao e arquivamento de orcamentos.
- Orcamento mensal por categoria de despesa e contexto financeiro.
- Calculo de uso com base em transacoes realizadas do periodo.
- Resumo para dashboard com categorias orcadas e categorias com gasto sem orcamento.
- Status basico de acompanhamento: `no_activity`, `on_track`, `approaching`, `exceeded` e `unbudgeted`.
- Auditoria redigida para criacao e atualizacao de orcamentos.

## Periodo padrao

Decisao de MVP: o periodo padrao e mes calendario.

`getMonthlyBudgetPeriod("2026-06")` retorna:

- `periodStartOn`: `2026-06-01`
- `periodEndOn`: `2026-06-30`

Tambem e possivel informar um periodo parcial explicitamente. O dominio valida que o fim seja igual ou posterior ao inicio.

## Calculo de uso

O uso considera somente transacoes:

- do mesmo tenant/contexto financeiro;
- do tipo `expense`;
- com status `posted` ou `reconciled`;
- com `occurredOn` dentro do periodo;
- vinculadas a categoria do orcamento.

Transacoes `planned`, `suggested` ou `voided` nao entram no uso realizado do MVP.

Campos principais do resumo:

- `plannedAmountMinor`: valor planejado do orcamento.
- `actualAmountMinor`: soma realizada no periodo.
- `remainingAmountMinor`: planejado menos realizado.
- `usedPercent`: percentual arredondado para duas casas decimais.
- `alertThresholdPercent`: limite de aproximacao, configuravel por orcamento.
- `status`: status de acompanhamento.

## Alertas

Decisao de MVP:

- O alerta de aproximacao e configuravel por orcamento via `alertThresholdPercent`.
- Quando nao informado, o padrao e 80%.
- A partir de 100%, ou quando o uso passa do planejado, o status e `exceeded`.
- Orcamento com valor zero e algum gasto tambem fica `exceeded`.
- Orcamento sem gasto fica `no_activity`.

## Categorias sem orcamento

`summarizeBudgetDashboard` inclui categorias com gasto realizado sem orcamento como itens `unbudgeted`.

Isso permite que dashboard e relatorios mostrem gastos sem meta sem falhar nem exigir que toda categoria tenha orcamento.

Transacoes sem categoria sao ignoradas nesse resumo porque nao ha categoria para associar a meta.

## Validacoes

- Categoria do orcamento deve existir no tenant ativo.
- Categoria deve estar ativa.
- Nesta etapa MVP, a categoria deve ser de despesa.
- Valor planejado deve ser inteiro em unidades menores e pode ser zero.
- Moeda usa formato ISO 4217.
- Limiar de alerta deve ser inteiro de 1 a 100.

## Fora de escopo

- Alertas push, e-mail ou notificacoes externas.
- Planejamento financeiro avancado.
- Recomendacao automatica por IA.
- API HTTP e persistencia/repositories reais.
