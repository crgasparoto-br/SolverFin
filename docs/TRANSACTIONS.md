# Lancamentos e filtros

Este documento registra o contrato inicial da tela de lancamentos do SolverFin Web.

A implementacao atual fica em `apps/web/src/transactions/` e segue a estrategia das issues anteriores de frontend: contratos TypeScript, validacoes puras, filtros deterministas, CSS base e mocks isolados, sem escolher framework web nem consumir APIs inexistentes.

## Objetivo

Permitir que a futura tela executavel liste, filtre, cadastre, edite e arquive receitas, despesas e transferencias dentro do tenant/perfil financeiro ativo.

## Estrutura criada

- `types.ts`: contratos de lancamentos, filtros, formulario, estados, resumo e view model.
- `validation.ts`: validacoes de formulario, filtros, resumo, arquivamento logico e isolamento por contexto.
- `mock-data.ts`: dataset ficticio e isolado para desenvolvimento.
- `examples.ts`: exemplos de estados, filtros, validacoes e totais esperados.
- `styles.ts`: CSS base para resumo, filtros, lista, formulario, feedback e responsividade.
- `index.ts`: export publico do modulo.

## Dados e isolamento

O dataset mockado usa apenas valores ficticios. Ele inclui propositalmente um lancamento de outro tenant/perfil para validar que o view model filtra pelo contexto ativo antes de expor dados.

Contexto ativo do mock:

| Campo             | Valor                   |
| ----------------- | ----------------------- |
| Tenant            | `tenant-demo`           |
| Perfil financeiro | `profile-personal-demo` |
| Periodo           | Junho de 2026           |

Valores esperados do exemplo pronto:

| Indicador       | Valor em centavos |
| --------------- | ----------------: |
| Receitas        |            620000 |
| Despesas        |            157750 |
| Transferencias  |             50000 |
| Resultado       |            462250 |
| Itens filtrados |                 5 |

Lancamentos arquivados aparecem na lista quando passam no filtro, mas nao entram nos totais financeiros.

## Filtros cobertos

`applyTransactionFilters` suporta:

- periodo inicial e final;
- conta de origem ou destino;
- tipo: receita, despesa ou transferencia;
- categoria;
- status: realizado, agendado ou arquivado.

## Validacoes cobertas

- descricao obrigatoria;
- data obrigatoria em formato `AAAA-MM-DD`;
- tipo obrigatorio;
- valor inteiro em centavos e maior que zero;
- conta de origem obrigatoria;
- transferencia exige conta de destino;
- transferencia nao pode usar a mesma conta como origem e destino.

## Decisoes deste corte

- Transferencias entram no mesmo contrato de lancamentos porque a issue pede receita/despesa em uma tela principal e deixa a transferencia como pergunta aberta. O contrato mantem origem e destino explicitos, sem decidir UI final.
- Exclusao definitiva fica fora do corte. `archiveTransaction` representa exclusao logica/arquivamento.
- O modulo nao implementa API real nem persistencia; ele prepara contratos para quando a camada backend/frontend executavel existir.

## Estados da tela

`buildTransactionViewModel` suporta:

- `loading`: lancamentos em carregamento;
- `error`: falha controlada no carregamento;
- `empty`: nenhum lancamento no contexto ativo;
- `ready`: dados prontos para renderizacao;
- `success`: feedback de lancamento salvo.

## Fora deste corte

- Implementacao concreta em React, Vue, Svelte ou outro framework.
- Consumo de APIs reais.
- Persistencia de formulario.
- Importacao em massa.
- Automacao por IA dentro da tela.
- Validacao visual em navegador por screenshot.

## Validacao esperada

Enquanto nao houver app executavel, a validacao automatica esperada para este corte e:

- `format:check`;
- `lint`;
- `typecheck`;
- testes placeholders existentes;
- `build`.

Essas validacoes verificam o contrato TypeScript/CSS e a consistencia dos exemplos exportados.

Quando o app web tiver runtime, esta documentacao deve ser revisitada para incluir screenshots mobile/desktop, testes de formulario, testes de filtro em UI e validacao integrada com APIs reais.
