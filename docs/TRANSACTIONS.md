# Lancamentos e filtros

## Unificacao no Extrato

A unificacao e uma projecao persistente de apresentacao. `TransactionGroup` guarda conta,
descricao e data de exibicao; `Transaction.transactionGroupId` liga cada membro a no maximo um
grupo. Valores, datas, categorias, recorrencia, parcela, importacao, transferencia e conciliacao
dos membros nao sao copiados nem alterados. O total e recalculado pela soma inteira de
`amountMinor`.

O primeiro corte aceita somente dois ou mais lancamentos da mesma organizacao, perfil, conta,
moeda, tipo (`income` ou `expense`) e status; exclui cartoes, transferencias, `suggested`,
`voided` e itens ja agrupados. Alteracoes posteriores de conta, tipo, moeda, status ou exclusao
sao bloqueadas ate o usuario desagrupar. Alteracoes de descricao, data, categoria ou valor
permanecem refletidas automaticamente no grupo.

Grupos legados com menos de dois membros nao geram linha consolidada: os membros voltam a ser
apresentados individualmente. Criacao e desagrupamento sao transacionais e geram auditoria
redigida contendo apenas a natureza da operacao e a quantidade de membros.

As acoes de administracao de um agrupamento estao documentadas em
[`API_TRANSACTION_GROUP_ACTIONS.md`](./API_TRANSACTION_GROUP_ACTIONS.md).

## Selecao e acoes em massa

A linha consolidada de um agrupamento participa da selecao operacional do Extrato pelo mesmo
marcador circular das linhas simples. Selecionar um grupo representa todos os seus membros; o
cliente envia apenas o `groupId`, e o servidor resolve novamente a composicao persistida dentro
da transacao da acao.

A selecao pode combinar lancamentos simples e agrupados. A barra informa quantidade de itens,
quantidade real de lancamentos representados quando forem diferentes e total financeiro sem
dupla contagem. Um agrupamento selecionado impede nova unificacao, pois grupos nao podem ser
aninhados.

As acoes em massa disponiveis sao:

- marcar lancamentos efetivados como conciliados;
- desmarcar a conciliacao de lancamentos conciliados;
- excluir logicamente os lancamentos selecionados e remover somente os agrupamentos selecionados.

O servidor deduplica IDs, rejeita alteracao direta de membro agrupado sem o respectivo grupo,
respeita organizacao e perfil financeiro, executa a operacao de forma atomica e registra apenas
metadados redigidos de auditoria. Conciliação e desconciliação preservam o grupo; exclusao logica
remove os grupos selecionados sem criar nova movimentacao financeira.

O contrato completo do endpoint, estados elegiveis, respostas e regras de rollback esta em
[`API_TRANSACTION_BULK_ACTIONS.md`](./API_TRANSACTION_BULK_ACTIONS.md).

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
