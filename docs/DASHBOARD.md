# Dashboard financeiro inicial

Este documento registra o contrato inicial do dashboard operacional do SolverFin Web.

A implementacao atual fica em `apps/web/src/dashboard/` e segue a estrategia das issues anteriores de frontend: contratos TypeScript, calculos puros, CSS base e mocks isolados, sem escolher framework web nem consumir APIs inexistentes.

## Objetivo

Exibir uma primeira visao de saldos, receitas, despesas, resultado do periodo, vencimentos proximos, gastos por categoria, fluxo mensal e disponibilidade financeira diaria quando houver contrato estruturado para isso.

## Estrutura criada

- `types.ts`: contratos de dados, estado e view model do dashboard.
- `calculations.ts`: calculos deterministas de totais, categorias, fluxo mensal, disponibilidade e filtro por tenant/perfil.
- `mock-data.ts`: dataset ficticio e isolado para desenvolvimento.
- `examples.ts`: exemplos de loading, erro, vazio e pronto, com totais esperados.
- `styles.ts`: CSS base para cards, disponibilidade, listas, estado central e responsividade.
- `index.ts`: export publico do modulo.

## Dados e isolamento

O dataset mockado usa apenas valores ficticios. Ele inclui propositalmente um lancamento de outro tenant/perfil para validar que os calculos filtram pelo contexto ativo antes de montar o resumo.

Contexto ativo do mock:

| Campo | Valor |
| --- | --- |
| Tenant | `tenant-demo` |
| Perfil financeiro | `profile-personal-demo` |
| Periodo | Junho de 2026 |

Valores esperados do exemplo pronto:

| Indicador | Valor em centavos |
| --- | ---: |
| Saldo | 582250 |
| Receitas | 700000 |
| Despesas | 357750 |
| Resultado | 342250 |
| Disponivel hoje | 14320 |

O percentual de despesas esperado e `51.11`.

## Estados do dashboard

`buildDashboardViewModel` suporta:

- `loading`: resumo ainda em carregamento;
- `error`: falha controlada no carregamento;
- `empty`: usuario sem lancamentos ou vencimentos no contexto;
- `ready`: dados prontos para renderizacao.

## Disponibilidade financeira diaria

A UI nao calcula disponibilidade diretamente. Ela apenas exibe o resultado quando `dailyAvailability` e fornecido por um contrato estruturado.

Quando o servico ainda nao existe, o card retorna estado `pending` com uma mensagem explicita. Quando o servico informa baixa confianca, o card mostra descricao orientada a revisao das premissas.

Essa decisao preserva o sequenciamento do epic #72: premissas, recorrencias estatisticas e calculo de disponibilidade devem ser definidos nas subissues proprias antes de virarem regra definitiva de UI.

## Fora deste corte

- Implementacao concreta em React, Vue, Svelte ou outro framework.
- Consumo de APIs reais.
- Graficos complexos ou biblioteca de charts.
- Calculo definitivo de disponibilidade financeira.
- Testes visuais em navegador.
- Evidencia visual por screenshot.

## Validacao esperada

Enquanto nao houver app executavel, a validacao automatica esperada para este corte e:

- `format:check`;
- `lint`;
- `typecheck`;
- testes placeholders existentes;
- `build`.

Quando o app web tiver runtime, esta documentacao deve ser revisitada para incluir screenshots mobile/desktop, testes dos componentes reais e validacao de rota protegida integrada ao shell.
