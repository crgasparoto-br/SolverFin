# Lançamentos e filtros

Este documento registra o contrato operacional atual do **Extrato da conta** (`/lancamentos`).
A tela é executável, consome a API real do SolverFin e persiste dados em PostgreSQL dentro do
contexto autenticado de organização e perfil financeiro.

## Visão operacional

O Extrato é a superfície principal para receitas, despesas, transferências e compromissos previstos
de conta corrente. A implementação atual fica principalmente em
`apps/web/src/dev-server/transactions-page.ts`, com regras de apresentação em
`apps/web/src/dev-server/transactions-statement.ts` e operações persistidas pelas rotas e
repositórios de `apps/api`.

A tela permite:

- selecionar uma conta ativa e um mês, com filtro diário opcional;
- acompanhar saldo inicial, entradas, saídas, pendências e conciliação;
- criar, editar e clonar lançamentos por modal contextual;
- conciliar, desconciliar e excluir logicamente lançamentos elegíveis;
- unificar lançamentos compatíveis e desfazer agrupamentos;
- selecionar linhas simples ou agrupadas para ações em massa;
- identificar recorrências e parcelas canônicas diretamente nas linhas operacionais.

Não existe exclusão física pelo fluxo da tela. Operações destrutivas usam cancelamento, estorno ou
exclusão lógica conforme o contrato do domínio.

## Filtros e data operacional

A consulta é sempre escopada pela conta selecionada. A visão padrão usa o mês informado no filtro;
quando o parâmetro `day` contém uma data válida pertencente ao mesmo mês, o período exibido fica
restrito a esse dia.

Para ordenar, filtrar e calcular saldos, a linha usa a data operacional na seguinte precedência:

1. `effectiveOn`;
2. `plannedOn`;
3. `occurredOn`.

Lançamentos anulados não entram nas linhas ou totais operacionais. Transferências consideram a conta
selecionada para definir o sinal da movimentação.

## Isolamento e persistência

A interface usa o proxy autenticado do servidor SSR. A API resolve sessão, organização e perfil
financeiro no servidor, e todas as consultas e mutações persistentes mantêm esse escopo. O cliente não
é autoridade para substituir `organizationId` ou `financialProfileId`.

As operações financeiras relevantes registram auditoria minimizada e redigida. Exemplos, seeds e
testes usam somente dados fictícios.

## Unificação no Extrato

A unificação é uma projeção persistente de apresentação. `TransactionGroup` guarda conta, descrição e
data de exibição; `Transaction.transactionGroupId` liga cada membro a no máximo um grupo. Valores,
datas, categorias, recorrência, parcela, importação, transferência e conciliação dos membros não são
copiados nem alterados. O total é recalculado pela soma inteira de `amountMinor`.

O primeiro corte aceita somente dois ou mais lançamentos da mesma organização, perfil, conta, moeda,
tipo (`income` ou `expense`) e status; exclui cartões, transferências, `suggested`, `voided`, itens já
agrupados e lançamentos com `installmentId`. O marcador de seleção de uma parcela canônica fica
desabilitado, e a API rejeita tentativa direta de agrupamento com
`409 TRANSACTION_GROUP_INSTALLMENT_MEMBER_INELIGIBLE`.

Alterações posteriores de conta, tipo, moeda, status ou exclusão são bloqueadas até o usuário
desagrupar. Alterações de descrição, data, categoria ou valor permanecem refletidas automaticamente
no grupo somente para membros sem vínculo canônico de parcela.

Grupos legados com menos de dois membros não geram linha consolidada: os membros voltam a ser
apresentados individualmente. Um grupo legado que contenha parcela continua visível, preserva o
indicador **Parcela X de Y** e informa que precisa ser desagrupado; ações de manutenção do grupo ou
de seus membros ficam bloqueadas para impedir alteração fora do contrato conservador da parcela.
Criação e desagrupamento são transacionais e geram auditoria redigida contendo apenas a natureza da
operação e a quantidade de membros.

As ações de administração de um agrupamento estão documentadas em
[`API_TRANSACTION_GROUP_ACTIONS.md`](./API_TRANSACTION_GROUP_ACTIONS.md).

## Seleção e ações em massa

A linha consolidada de um agrupamento participa da seleção operacional do Extrato pelo mesmo marcador
circular das linhas simples. Selecionar um grupo representa todos os seus membros; o cliente envia
apenas o `groupId`, e o servidor resolve novamente a composição persistida dentro da transação da
ação.

A seleção pode combinar lançamentos simples e agrupados. A barra informa quantidade de itens,
quantidade real de lançamentos representados quando forem diferentes e total financeiro sem dupla
contagem. Um agrupamento selecionado impede nova unificação, pois grupos não podem ser aninhados.
Agrupamentos legados com parcela canônica não participam da seleção até serem desagrupados.

As ações em massa disponíveis são:

- marcar lançamentos efetivados como conciliados;
- desmarcar a conciliação de lançamentos conciliados;
- excluir logicamente os lançamentos selecionados e remover somente os agrupamentos selecionados.

O servidor deduplica IDs, rejeita alteração direta de membro agrupado sem o respectivo grupo, respeita
organização e perfil financeiro, executa a operação de forma atômica e registra apenas metadados
redigidos de auditoria. Conciliação e desconciliação preservam o grupo; exclusão lógica remove os
grupos selecionados sem criar nova movimentação financeira.

O contrato completo do endpoint, estados elegíveis, respostas e regras de rollback está em
[`API_TRANSACTION_BULK_ACTIONS.md`](./API_TRANSACTION_BULK_ACTIONS.md).

## Recorrências

Recorrências não possuem tela ou bloco separado. Cada ocorrência materializada aparece como uma linha
normal do Extrato, preservando o indicador e as ações da recorrência no próprio menu. Criação, edição
de escopo, pausa, retomada, cancelamento e materialização antecipada seguem
[`RECURRENCES_INSTALLMENTS_WEB.md`](./RECURRENCES_INSTALLMENTS_WEB.md).

## Identificação e manutenção de parcelas canônicas

O Extrato consulta as parcelas canônicas pela conta e pelo período operacional selecionados e associa
cada item exclusivamente pela transação vinculada. A leitura complementar usa `effectiveOn`,
`plannedOn`, `occurredOn` e `dueOn` como fallback para identificar a parcela no mesmo período exibido
pela linha. O indicador **Parcela X de Y** não transforma descrições como `1/6` em parcela canônica.

A consulta de parcelas é única por renderização e degradável. Falha temporária não impede o
carregamento da lista principal, mas mantém a edição indisponível até que a elegibilidade possa ser
confirmada. O contrato completo está em [`API_INSTALLMENTS.md`](./API_INSTALLMENTS.md).

A edição direta usa o modal de lançamento em modo restrito. Somente `description`, `note` e
`categoryId` podem ser enviados ao contrato de parcelas, e `categoryId: null` remove a categoria após
escolha explícita de **Sem categoria**. Categoria arquivada vinculada ao lançamento permanece
selecionada como referência histórica.

Mudanças de valor, datas, conta, tipo, situação, repetição ou redistribuição permanecem fora desse
fluxo. O endpoint genérico de transações rejeita atualizações de dados de registros com
`installmentId`, exceto o payload exclusivo de situação usado pela ação operacional de conciliar ou
desconciliar. Quando esse payload foi construído a partir de um snapshot anterior, a persistência
preserva `description`, `note` e `categoryId` já confirmados por uma edição concorrente da parcela, sem
restaurar silenciosamente os valores antigos.

A exclusão lógica individual ou em massa continua permitida como transição operacional. Nesse caso, a
`Transaction` passa para `voided`, a `Installment` permanece consultável para histórico e a manutenção
direta fica bloqueada com `transaction_status_locked`. Essa regra não autoriza exclusão física nem
transforma o `PATCH` de parcela em rota de mudança de situação.

O contrato de agrupamento também não pode ser usado como caminho alternativo: parcelas não entram em
novos grupos, e grupos legados precisam ser desagrupados antes da manutenção.

O modo manual **Repetição = Parcelado** ainda cria transações independentes e não cria registros
`Installment`; por isso esses lançamentos não recebem o indicador nem a manutenção conservadora de
parcelas canônicas.

## Estados, responsividade e acessibilidade

A tela possui estados de erro e vazio contextualizados, feedback de salvamento e controles
desabilitados quando a operação não é elegível. Os modais mantêm título e rótulos acessíveis, foco
inicial coerente, navegação por teclado e fechamento por `Escape`.

As validações visuais permanentes do repositório cobrem o Extrato em desktop e mobile, incluindo
`1366x768` e `390x844`, além dos fluxos específicos de agrupamento, ações em massa, recorrências e
parcelas canônicas.

## Validação

As alterações desta área devem usar os comandos oficiais do repositório:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:integration
```

Mudanças visuais ou de interação também devem executar o workflow de validação real em Chrome e
preservar os artefatos aplicáveis ao cenário alterado.
