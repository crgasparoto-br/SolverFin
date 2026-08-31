# Lançamentos e filtros

Este documento registra o contrato operacional atual do **Extrato da conta** (`/lancamentos`).
A tela é executável, consome a API real do SolverFin e persiste dados em PostgreSQL dentro do
contexto autenticado de organização e perfil financeiro.

## Visão operacional

O Extrato é a superfície principal para receitas, despesas, transferências e compromissos previstos
de conta corrente. A composição atual usa `apps/web/src/dev-server/transactions-page-v2.ts` como
renderer da rota e `apps/web/src/dev-server/statement-list-archetype.ts` como arquétipo **A2 —
listagem/extrato**. As regras financeiras e temporais continuam concentradas em
`apps/web/src/dev-server/transactions-statement.ts`; operações persistidas continuam nas rotas e
repositórios de `apps/api`.

A tela permite:

- selecionar uma conta ativa e um mês;
- reconhecer sem ambiguidade a conta, o período e a moeda do contexto atual;
- buscar por descrição/categoria e ordenar por data, valor ou descrição antes do render;
- acompanhar saldo inicial, entradas, saídas, pendências e conciliação;
- criar, editar e clonar lançamentos por modal contextual;
- conciliar, desconciliar e excluir logicamente lançamentos elegíveis;
- unificar lançamentos compatíveis e desfazer agrupamentos;
- selecionar linhas simples ou agrupadas para ações em massa;
- identificar recorrências e parcelas canônicas diretamente nas linhas operacionais.

Não existe exclusão física pelo fluxo da tela. Operações destrutivas usam cancelamento, estorno ou
exclusão lógica conforme o contrato do domínio.

## Arquétipo A2, conta e moeda

`/lancamentos` não depende mais de pós-processamento de HTML para ordenar a lista nem para aplicar
filtros originados de insights. O renderer prepara o ViewModel e entrega ao A2, nesta ordem:

1. cabeçalho e ações rápidas;
2. contexto explícito da conta, moeda e período;
3. filtros compactos, busca e ordenação;
4. resumo financeiro da conta;
5. lista operacional agrupada temporalmente quando a ordenação é por data;
6. detalhe e ações contextuais sem abandonar a lista.

A moeda é parte do contexto financeiro da conta e das linhas. Uma moeda válida é um código ISO de
três letras normalizado em maiúsculas. O renderer usa a moeda da transação/grupo quando disponível e,
para uma linha da conta atual, a moeda explícita da própria conta como contexto. Quando a API não
fornece uma moeda válida, a interface mostra **Moeda indisponível** e desabilita operações que
precisam desse contexto, em vez de inventar BRL no formatter.

Remuneração de conta continua sendo um domínio exclusivamente BRL conforme seu contrato próprio; por
isso a memória de cálculo dessa feature usa BRL de forma explícita, não como fallback genérico do
Extrato.

## Filtros, insight e data operacional

A consulta é sempre escopada pela conta selecionada. A visão padrão usa o mês informado no filtro;
quando o parâmetro `day` contém uma data válida pertencente ao mesmo mês, o período exibido fica
restrito a esse dia conforme `transactions-statement.ts`.

O formulário do A2 aceita:

- `accountId` e `month` como contexto principal;
- `q` para busca textual local ao ViewModel;
- `sort` com `date_asc`, `date_desc`, `amount_desc`, `amount_asc`, `description_asc` e
  `description_desc`;
- parâmetros de contexto já existentes, como `profileId`, `currency`, `kind`, `evidence`, `day`,
  `categoryId` e `merchantKey`, preservados durante a navegação.

`categoryId` e `merchantKey`, quando recebidos de um insight, filtram as linhas antes do render. O
resumo da conta permanece completo e a tela exibe um aviso contextual de que o filtro do insight está
ativo. Grupos consolidados não são apresentados como correspondência de insight porque o filtro deve
continuar verificável contra lançamentos individuais.

Para ordenar, filtrar, agrupar visualmente e calcular saldos, a linha usa a data operacional na
seguinte precedência:

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
agrupados e lançamentos com `installmentId`. A parcela canônica continua selecionável para ações
operacionais em massa, mas sua presença na seleção desabilita somente **Unificar lançamentos**. A API
rejeita tentativa direta de agrupamento com
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
contagem. Um agrupamento selecionado impede nova unificação, pois grupos não podem ser aninhados. Uma
parcela canônica selecionada também impede somente a unificação, sem bloquear conciliação,
desconciliação ou exclusão lógica quando os estados forem elegíveis. Agrupamentos legados com parcela
canônica não participam da seleção até serem desagrupados.

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

## Adapter operacional residual

O A2 já substitui `statement-list-sorting` e `statement-insight-context`. A rota mantém temporariamente
somente o adapter inventariado `account-remuneration-disclosure`, porque o módulo histórico também
preserva runtime já entregue de seleção em massa e administração avançada de agrupamentos. Esse
adapter não é autorização para novas features por transformação de HTML.

O critério de retirada está em [`LEGACY_HTML_POST_PROCESSORS.md`](./LEGACY_HTML_POST_PROCESSORS.md):
seleção em massa, edição de agrupamentos e disclosure de remuneração devem ser emitidos diretamente
pela composição A2 com equivalência de teclado, foco, labels e operações antes da remoção definitiva.

## Recorrências

Recorrências não possuem tela ou bloco separado. Cada ocorrência materializada aparece como uma linha
normal do Extrato, preservando o indicador e as ações da recorrência no próprio menu. Criação, edição
de escopo, pausa, retomada, cancelamento e materialização antecipada seguem
[`RECURRENCES_INSTALLMENTS_WEB.md`](./RECURRENCES_INSTALLMENTS_WEB.md).

## Parcelas canônicas

O modo manual **Repetição = Parcelado** envia uma única criação canônica para a API. O backend cria
as `Installment` e as `Transaction` vinculadas de forma atômica, preserva descrição e observação
separadas, aplica a âncora mensal da data original e devolve os mesmos identificadores em replay
idempotente. As ocorrências materializadas aparecem no Extrato como lançamentos normais, mantendo os
contratos de elegibilidade de manutenção e agrupamento definidos em [`API_INSTALLMENTS.md`](./API_INSTALLMENTS.md).

## Estados, responsividade e acessibilidade

A tela possui estados de erro e vazio contextualizados, feedback de salvamento e controles
desabilitados quando conta ou moeda não permitem concluir a operação. Cabeçalho, filtros, contexto,
lista e modais mantêm rótulos acessíveis e navegação por teclado.

Em desktop, o resumo e a lista formam o layout A2. Em larguras menores, o resumo deixa de ser sticky,
os filtros passam a grade reduzida e cada linha operacional prioriza data, histórico, status, valor,
moeda/contexto e ação sem exigir largura fixa de desktop.

As validações visuais permanentes do repositório devem cobrir o Extrato em desktop e mobile,
incluindo `1366x768` e `390x844`, além dos fluxos específicos de agrupamento, ações em massa,
recorrências e parcelas canônicas.

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
