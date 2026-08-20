# Inventario de agregacao multi-moedas

Este documento registra o recorte executado pela issue #595 para aplicar a ADR 0013 aos servicos financeiros que calculam ou expõem totais. A regra comum e simples: sem conversao cambial explicita, valores de moedas diferentes permanecem separados.

## Contrato comum

- A moeda e obtida do registro financeiro ou de filtro financeiro explicito, nunca de formatter de interface.
- Agregacoes multi-moedas usam `currencyBlocks` quando o contrato retorna um conjunto de totais por moeda.
- `currencyBlocks` e ordenado pelo codigo ISO 4217.
- Contratos que ja retornam itens independentes com `currency` podem preservar a forma, desde que nunca somem moedas diferentes.
- Compatibilidade escalar so e permitida quando existe exatamente uma moeda conhecida e os valores sao copiados do bloco dessa moeda.
- Sem dados nao se inventa BRL nem um total monetario sintetico.
- Conversao, taxa de cambio e moeda de referencia nao fazem parte da agregacao implementada pela #595; o contrato para uma consolidacao futura e definido pela #596 em [`CURRENCY_CONVERSION_CONTRACT.md`](./CURRENCY_CONVERSION_CONTRACT.md).

## Inventario

| Area                          | Contrato observado                                                                   | Estado apos #595                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resumo financeiro / Dashboard | `GET /api/financial-summary`                                                         | Migrado para `currencyBlocks`; itens recentes carregam `currency`; escalares legados so existem em resposta mono-moeda.                                                                                                     |
| Relatorios                    | `GET /api/reports/category-evolution`                                                | Ja estava aderente: `currencyBlocks` ordenados e totais por moeda.                                                                                                                                                          |
| Orcamentos                    | `summarizeBudgetUsageForContext`, `summarizeBudgetUsage`, `summarizeBudgetDashboard` | Uso filtra a moeda do orcamento; dashboard de dominio separa a mesma categoria por moeda; itens sem orcamento preservam moeda nativa.                                                                                       |
| Insights                      | `generateFinancialInsights` e scanner da API                                         | Scanner continua executando uma moeda por vez. O calculo generico nao possui fallback BRL: usa moeda explicita, infere somente quando os dados escopados possuem uma unica moeda ou falha quando a moeda e ambigua/ausente. |
| Assistente financeiro         | `financial-assistant-data`                                                           | Ja estava aderente: lista moedas nativas, exige clarificacao quando ha mais de uma e filtra todas as consultas agregadas pela moeda resolvida.                                                                              |
| Lancamentos                   | `/api/transactions` e `Transaction`                                                  | Nao expoe total agregado transversal; cada lancamento possui `currency`. Consumidores nao devem somar moedas no cliente.                                                                                                    |

## Resumo financeiro

A forma canonica e:

```json
{
  "currencyBlocks": [
    {
      "currency": "BRL",
      "availableBalanceMinor": 10000,
      "incomeMinor": 3000,
      "expensesMinor": 1000,
      "plannedCommitmentsMinor": 500
    },
    {
      "currency": "USD",
      "availableBalanceMinor": 20000,
      "incomeMinor": 4000,
      "expensesMinor": 2000,
      "plannedCommitmentsMinor": 700
    }
  ]
}
```

O Dashboard apresenta uma secao por bloco e passa `currency` explicitamente ao formatter. Ele nao recalcula nem consolida valores.

## Contrato para consolidacao futura

A #596 adiciona um contrato compartilhado de dominio, mas nao ativa conversao nos endpoints atuais.

- a moeda de referencia e uma preferencia eventual do perfil financeiro e nao possui fallback universal;
- o valor nativo permanece sempre preservado;
- conversoes validas carregam origem, destino, taxa decimal, data/instante e fonte da cotacao;
- cotacao `stale` e explicitamente estimada;
- referencia nao configurada, cotacao ausente, expirada ou provider indisponivel produzem `status: "unavailable"` com valor convertido `null`;
- consumidores atuais continuam usando `currencyBlocks` ate que uma issue futura introduza provider e caso de uso produtivo de consolidacao.

O contrato executavel esta em `@solverfin/domain/currency-conversion` e sua especificacao em [`CURRENCY_CONVERSION_CONTRACT.md`](./CURRENCY_CONVERSION_CONTRACT.md). A decisao arquitetural complementar esta na ADR 0015.

## Controles negativos obrigatorios

A cobertura automatizada da issue #595 prova que:

- BRL e USD no mesmo perfil produzem valores numericos independentes no resumo;
- o total de um orcamento BRL ignora despesa USD da mesma categoria e periodo;
- categorias sem orcamento em BRL e USD viram itens independentes;
- insights com dados de uma unica moeda podem obter essa moeda dos dados sem assumir BRL;
- insights com dados mistos exigem moeda explicita;
- o Dashboard preserva secoes de moeda distintas e identifica a moeda dos itens recentes.

A cobertura da #596 acrescenta controles para garantir que:

- ausencia de moeda de referencia nao assume BRL;
- valor nativo e conversao permanecem estados distintos;
- conversao exige metadados de cotacao coerentes com o par de moedas;
- cotacao stale e marcada como estimativa;
- indisponibilidade nao sintetiza valor convertido.

Consulte tambem [`CURRENCY_CONVERSION_CONTRACT.md`](./CURRENCY_CONVERSION_CONTRACT.md), [`API_FINANCIAL_SUMMARY.md`](./API_FINANCIAL_SUMMARY.md), [`API_REPORTS.md`](./API_REPORTS.md), [`API_BUDGETS_GOALS_ALERTS.md`](./API_BUDGETS_GOALS_ALERTS.md), [`FINANCIAL_INSIGHTS.md`](./FINANCIAL_INSIGHTS.md), [`FINANCIAL_ASSISTANT.md`](./FINANCIAL_ASSISTANT.md), [`adr/0013-multi-currency-financial-aggregation.md`](./adr/0013-multi-currency-financial-aggregation.md) e [`adr/0015-reference-currency-and-fx-conversion-contract.md`](./adr/0015-reference-currency-and-fx-conversion-contract.md).
