# Relatorios iniciais e orcamento mensal

Este documento registra o escopo entregue para a issue #44: uma base de frontend para relatorios simples, verificaveis e coerentes com lancamentos, dashboard e orcamento mensal.

## Objetivo

A tela de relatorios deve ajudar a pessoa usuaria a entender rapidamente o periodo financeiro atual por tres perspectivas:

- gastos por categoria;
- previsto versus realizado para categorias com orcamento;
- evolucao mensal de receitas, despesas e saldo.

## Contratos adicionados

O modulo `apps/web/src/reports/` expõe:

- `ReportDataSet`, com contexto financeiro, periodo, filtros, lancamentos e orcamentos;
- `BudgetTarget`, para metas por categoria e periodo;
- `CategorySpendingReport`, para realizado, previsto, restante, percentuais e estado da categoria;
- `MonthlyEvolutionReport`, para acompanhar receitas, despesas e resultado por mes;
- `ReportsViewModel`, com estados `loading`, `empty`, `error` e `ready`.

## Regras de calculo

- Apenas dados do `tenantId` e `financialProfileId` do contexto sao considerados.
- Lancamentos arquivados nao entram nos totais.
- Transferencias aparecem na contagem filtrada, mas nao aumentam receitas nem despesas.
- O relatorio por categoria considera apenas despesas do periodo.
- Categorias com orcamento e sem gasto aparecem como `no-activity`.
- Categorias com gasto e sem orcamento aparecem como `unplanned`.
- Categorias acima do previsto aparecem como `over-budget`.
- Percentuais sao arredondados para duas casas decimais.

## Estados previstos

- `loading`: relatorios em carregamento.
- `error`: falha controlada ao carregar dados.
- `empty`: periodo sem lancamentos nem orcamentos.
- `ready`: relatorios calculados e prontos para exibicao.

## Dataset ficticio

`reportsMockDataSet` usa apenas dados demonstrativos. Ele inclui:

- tres meses de lancamentos para validar evolucao mensal;
- orcamentos de junho por categoria;
- uma categoria acima do previsto;
- uma categoria sem atividade;
- um lancamento arquivado ignorado nos totais;
- registros de outro contexto para validar isolamento.

Totais esperados principais:

- receitas do periodo: `620000` centavos;
- despesas do periodo: `337750` centavos;
- resultado do periodo: `282250` centavos;
- previsto no orcamento: `380000` centavos;
- restante previsto: `42250` centavos;
- percentual usado: `88.88`;
- categorias no relatorio: `4`;
- meses na evolucao: `3`.

## Limites desta entrega

Como ainda nao existe app web executavel nem framework de UI definido, esta entrega fornece contratos, calculos, exemplos, CSS base e documentacao. A tela renderizada, graficos reais, validacao visual mobile/desktop e testes de interacao devem ser adicionados quando o runtime de frontend estiver definido.

Exportacao PDF/CSV, BI avancado, relatorios fiscais/contabeis e insights de IA permanecem fora do escopo desta issue.
