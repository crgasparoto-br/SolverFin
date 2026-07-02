# Matriz de status do MVP

Esta matriz registra o estado observado em `main` para reduzir ambiguidade antes de novas implementacoes. Ela diferencia capacidade existente no dominio/API de operacao realmente acessivel na web navegavel.

## Legenda

- Feito: existe implementacao verificavel no codigo atual.
- Parcial: existe parte relevante, mas ainda falta camada, fluxo ou acao importante.
- Legado: existe para compatibilidade, historico ou transicao, mas nao deve orientar novas jornadas de produto.
- Pendente: nao ha implementacao operacional na camada indicada.
- Bloqueado: depende de decisao, politica ou fluxo anterior.
- Precisa de ADR: depende de decisao arquitetural/produtiva formal.

## Fontes conferidas

- [`README.md`](../README.md)
- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)
- [`docs/PRODUCT.md`](./PRODUCT.md)
- [`docs/PAYABLES_RECEIVABLES.md`](./PAYABLES_RECEIVABLES.md)
- [`docs/API_PAYABLES_RECEIVABLES.md`](./API_PAYABLES_RECEIVABLES.md)
- [`docs/RECURRENCES_INSTALLMENTS_WEB.md`](./RECURRENCES_INSTALLMENTS_WEB.md)
- [`docs/WEB_MAINTENANCE_COVERAGE.md`](./WEB_MAINTENANCE_COVERAGE.md)
- [`prisma/schema.prisma`](../prisma/schema.prisma)
- [`apps/api/src/router.ts`](../apps/api/src/router.ts)
- [`apps/api/src/payables-receivables-router.ts`](../apps/api/src/payables-receivables-router.ts)
- [`apps/api/src/api-persistence.integration.test.ts`](../apps/api/src/api-persistence.integration.test.ts)
- [`apps/web/src/dev-server.ts`](../apps/web/src/dev-server.ts)
- [`apps/web/src/dev-server/dashboard-page.ts`](../apps/web/src/dev-server/dashboard-page.ts)
- [`apps/web/src/dev-server/payables-receivables-page.ts`](../apps/web/src/dev-server/payables-receivables-page.ts)
- [`apps/web/src/dev-server/recurrences-section.ts`](../apps/web/src/dev-server/recurrences-section.ts)
- [`apps/web/src/dev-server/routes.ts`](../apps/web/src/dev-server/routes.ts)
- [`packages/domain/src/index.ts`](../packages/domain/src/index.ts)
- [`packages/domain/src/daily-availability.ts`](../packages/domain/src/daily-availability.ts)
- [`packages/domain/src/payables-receivables.ts`](../packages/domain/src/payables-receivables.ts)
- [`packages/domain/src/imports.ts`](../packages/domain/src/imports.ts)
- [`packages/domain/src/deduplication.ts`](../packages/domain/src/deduplication.ts)
- [`packages/domain/src/reconciliation.ts`](../packages/domain/src/reconciliation.ts)
- [`packages/domain/src/automation-rules.ts`](../packages/domain/src/automation-rules.ts)
- [`packages/domain/src/ai-review-queue.ts`](../packages/domain/src/ai-review-queue.ts)

## Decisao atual sobre pagar/receber

A rotina operacional de pagar e receber nao possui mais tela propria ativa. O usuario deve criar e acompanhar compromissos em:

- **Extrato da conta** (`/lancamentos`), para receitas, despesas, transferencias e lancamentos previstos de conta corrente.
- **Cartoes de Credito** (`/cartoes`), para compras, faturas, fechamento e pagamento de cartao.

`PayableReceivable` continua existindo como dominio/API legado para preservar registros antigos, auditoria e compatibilidade durante a transicao. Leitores temporarios devem evitar dupla contagem quando houver `settlementTransactionId`, `Transaction` equivalente ou `Invoice` correspondente. A transicao tecnica segura do dominio fica para a #290.

## Status por area

### Contas

- Dominio/API/persistencia: Feito.
- UI: Parcial.
- Testes: integracao feita; unitarios parciais.
- Documentacao: Parcial.
- Nota: web lista, cria, abre detalhe via acao, edita e arquiva; ainda nao ha tela dedicada de detalhe.

### Categorias

- Dominio/API/persistencia: Feito.
- UI: Parcial.
- Testes: integracao feita; unitarios parciais.
- Documentacao: Parcial.
- Nota: web lista, cria, abre detalhe via acao, edita, arquiva e restaura; ainda nao ha tela dedicada de detalhe.

### Lancamentos / Extrato da conta

- Dominio/API/persistencia: Feito.
- UI: Parcial.
- Testes: integracao feita; unitarios parciais.
- Documentacao: Parcial.
- Nota: web preserva Extrato da conta com resumo, agrupamento por data, criacao, detalhe via acao, edicao e cancelamento/estorno. Tambem e a tela ativa para compromissos previstos de conta corrente.

### Recorrencias

- Dominio/API/persistencia: Feito.
- UI: Feito para o fluxo atual.
- Testes: web parcial; integracao parcial.
- Documentacao: Feito.
- Nota: nao ha rota propria nem bloco separado. Cada lancamento recorrente aparece na lista normal de `/lancamentos` ou `/cartoes`, com indicador visual e acoes no proprio menu do lancamento.

### Parcelas

- Dominio/schema: Feito.
- Repository/API/UI: Parcial.
- Testes: Parcial.
- Documentacao: Parcial.
- Nota: parcelas aparecem no fluxo de geracao de recorrencias; ainda nao ha rota dedicada para reler historico nem manutencao direta.

### Cartoes / Faturas

- Dominio/API/persistencia: Feito.
- UI: Feito.
- Testes: integracao feita; unitarios parciais.
- Documentacao: Parcial.
- Nota: cadastro/manutencao do cartao fica em Contas e Cartoes; `/cartoes` cobre compra, fatura, conciliacao, fechamento e pagamento, e e a tela ativa para compromissos de cartao.

### Orcamentos

- Dominio/API/persistencia: Feito.
- UI: Parcial.
- Testes: Parcial.
- Documentacao: Parcial.
- Nota: web lista, cria, abre detalhe via acao, edita, consulta uso e arquiva; ainda nao ha tela dedicada de detalhe.

### Contas a pagar/receber

- Dominio/schema/repository/API: Legado.
- Seed: Parcial.
- UI: Legado/retirada da jornada ativa.
- Testes: integracao feita; unitarios parciais.
- Documentacao: Legado.
- Nota: `PayableReceivable` e mantido para compatibilidade e historico. `/pagar-receber` nao deve ser tratado como tela operacional ativa nem aparecer em navegacao, Dashboard ou novas jornadas de produto.

### Importacao CSV/OFX

- Dominio: Feito.
- Schema/migration: Parcial.
- Repository/API/UI: Pendente.
- Testes: Parcial.
- Documentacao: Parcial.
- Nota: dominio faz preview, hash, sugestoes e problemas; falta lote persistido operacional, repository, API e UI.

### Deduplicacao

- Dominio: Feito.
- Schema/repository/API/UI: Pendente.
- Testes: Parcial.
- Documentacao: Parcial.
- Nota: existem regras deterministicas no dominio, mas ainda nao ha fluxo persistido de revisao.

### Conciliacao

- Dominio: Feito.
- Schema/UI: Parcial.
- Repository/API: Pendente.
- Testes: Parcial.
- Documentacao: Parcial.
- Nota: a UI tem indicadores de status no extrato, mas nao executa conciliacao operacional.

### Regras automaticas

- Dominio: Feito.
- Schema/repository/API/UI: Pendente.
- Testes: Parcial.
- Documentacao: Parcial.
- Nota: existem regras aplicaveis no dominio, mas ainda nao ha cadastro, persistencia nem fila operacional.

### IA / sugestoes revisaveis

- Dominio: Feito.
- Schema/migration: Parcial.
- Repository/API/UI: Pendente.
- Testes: Parcial.
- Documentacao: Parcial.
- Nota: `AiSuggestion` existe no schema e ha fila de revisao no dominio, mas faltam repository, API e UI.

## Operacoes visiveis na UI

### Contas (`/contas`)

- Listar: Sim, em cards/linhas.
- Visualizar detalhe: Sim, por acao que consulta a API e mostra feedback; nao ha tela dedicada.
- Criar: Sim, formulario "Nova conta".
- Editar: Sim, formulario inline.
- Arquivar/inativar: Sim, para conta ativa.
- Restaurar/reativar: Nao aplicavel no contrato atual da UI.
- Excluir: Nao.
- Lacuna restante: tela dedicada de detalhe e restauracao, se o contrato evoluir nessa direcao.

### Categorias (`/categorias`)

- Listar: Sim, em cards/linhas.
- Visualizar detalhe: Sim, por acao que consulta a API e mostra feedback; nao ha tela dedicada.
- Criar: Sim, formulario "Nova categoria".
- Editar: Sim, formulario inline.
- Arquivar/inativar: Sim, para categoria ativa.
- Restaurar/reativar: Sim, para categoria arquivada.
- Excluir: Nao.
- Lacuna restante: tela dedicada de detalhe.

### Extrato da conta (`/lancamentos`)

- Listar: Sim, agrupado por data.
- Visualizar detalhe: Sim, por acao que consulta a API e mostra feedback; nao ha tela dedicada.
- Criar: Sim, formulario "Novo lancamento" / "Adicionar ao extrato".
- Criar compromisso futuro: Sim, como lancamento planejado ou sugerido, com data prevista.
- Editar: Sim, formulario inline.
- Cancelar/estornar: Sim, para lancamento nao cancelado.
- Excluir: Nao.
- Acoes especificas: chips de status visiveis, ainda como indicadores.
- Lacuna restante: confirmar se chips de status viram filtros interativos em iteracao futura.

### Recorrencias

Sem rota propria e sem secao separada: cada lancamento gerado por uma recorrencia aparece como uma linha normal na lista de Movimentacoes (Extrato) ou Compras (Cartoes), com um indicador visual de recorrencia e acoes extras no mesmo menu de qualquer outro lancamento.

- Listar: Sim, casando `recurrenceId` dos lancamentos com dados de `GET /api/recurrences`.
- Visualizar detalhe: Sim, via modal de edicao aberto pela acao "Editar recorrencia".
- Criar: Sim, via repeticao "Fixo" no modal de novo lancamento ou nova compra.
- Editar: Sim, em modal compartilhado entre Extrato e Cartoes.
- Pausar, retomar e cancelar: Sim, pelo menu do lancamento.
- Gerar parcelas: Automatico no catch-up e manual pelo modal de edicao.
- Lacuna restante: nao ha rota dedicada para reler historico de parcelas ja geradas.

### Cartoes de Credito (`/cartoes`)

- Selecionar cartao: Sim, por seletor com indicador de cartao adicional/virtual vinculado.
- Selecionar fatura: Sim, por navegacao de periodo.
- Resumo da fatura: Sim, com fatura atual, detalhamento, totais por cartao da familia e limite total consolidado.
- Registrar compra: Sim, em modal.
- Editar compra: Sim, em modal.
- Filtrar compras: Sim, por busca e por conciliado/nao conciliado.
- Fechar fatura: Sim, para fatura aberta.
- Pagar fatura: Sim, em modal, para fatura nao paga/cancelada.
- Cadastro, edicao, bloqueio e arquivamento de cartao: ficam em Contas e Cartoes (`/contas-cartoes`).
- Excluir: Nao.
- Lacuna restante: nao ha como mover uma compra para outra fatura/periodo pela UI.

### Orcamentos (`/orcamentos`)

- Listar: Sim, em cards/linhas.
- Visualizar detalhe: Sim, por acao que consulta a API e mostra feedback; nao ha tela dedicada.
- Criar: Sim, formulario "Novo orcamento".
- Editar: Sim, formulario inline.
- Arquivar/inativar: Sim, para orcamento ativo.
- Consultar uso: Sim, por acao da API.
- Excluir: Nao.
- Lacuna restante: tela dedicada de detalhe/uso.

### Contas a pagar/receber (legado; sem tela operacional ativa)

- Listar na UI ativa: Nao.
- Criar na UI ativa: Nao.
- Editar na UI ativa: Nao.
- Concluir pagamento/recebimento na UI ativa: pelo fluxo de origem, com efetivacao de lancamento no Extrato ou pagamento de fatura em Cartoes.
- API legada: Sim, enquanto a transicao tecnica nao for concluida.
- Lacuna restante: planejar na #290 migracao, compatibilidade, possivel descontinuacao e tratamento de dados historicos sem perda.

### Inbox, relatorios e configuracoes

- Inbox: rota implementada para fluxo inicial de entrada/revisao conforme arquivos dedicados.
- Configuracoes: rota implementada para estado/configuracao inicial conforme arquivo dedicado.
- Relatorios: ainda aparece como placeholder.

## Comparacao API x UI por recurso principal

### Contas

API disponivel:

- `GET /api/accounts`
- `POST /api/accounts`
- `GET /api/accounts/:accountId`
- `PATCH /api/accounts/:accountId`
- `POST /api/accounts/:accountId/archive`

UI disponivel:

- lista, cria, consulta detalhe via acao, edita e arquiva em `/contas`.

Lacuna: tela dedicada de detalhe.

### Categorias

API disponivel:

- `GET /api/categories`
- `POST /api/categories`
- `GET /api/categories/:categoryId`
- `PATCH /api/categories/:categoryId`
- `POST /api/categories/:categoryId/archive`
- `POST /api/categories/:categoryId/restore`

UI disponivel:

- lista, cria, consulta detalhe via acao, edita, arquiva e restaura em `/categorias`.

Lacuna: tela dedicada de detalhe.

### Lancamentos / Extrato da conta

API disponivel:

- `GET /api/transactions`
- `POST /api/transactions`
- `GET /api/transactions/:transactionId`
- `PATCH /api/transactions/:transactionId`
- `POST /api/transactions/:transactionId/void`

UI disponivel:

- tela `/lancamentos` como **Extrato da conta**;
- resumo lateral do periodo;
- agrupamento por data;
- chips de status visiveis;
- formulario "Adicionar ao extrato" para receitas, despesas, transferencias e compromissos previstos de conta;
- detalhe via acao, edicao e cancelamento/estorno.

Lacunas:

- tela dedicada de detalhe;
- confirmar se chips de status serao filtros interativos ou apenas indicadores.

### Recorrencias e parcelas

API disponivel:

- `GET /api/recurrences`
- `POST /api/recurrences`
- `GET /api/recurrences/:recurrenceId`
- `PATCH /api/recurrences/:recurrenceId`
- `POST /api/recurrences/:recurrenceId/pause`
- `POST /api/recurrences/:recurrenceId/resume`
- `POST /api/recurrences/:recurrenceId/cancel`
- `POST /api/recurrences/:recurrenceId/generate-installments`

UI disponivel:

- recorrencias sem rota nem bloco proprio: lancamentos recorrentes aparecem na lista normal de `/lancamentos`/`/cartoes`, com criacao via repeticao "Fixo" e manutencao pelo menu de acoes do lancamento.

Lacunas:

- consulta historica dedicada de parcelas ja geradas;
- manutencao direta de parcelas.

### Cartoes e faturas

API disponivel:

- `GET /api/cards`
- `POST /api/cards`
- `GET /api/cards/:cardId`
- `PATCH /api/cards/:cardId`
- `POST /api/cards/:cardId/archive`
- `POST /api/cards/:cardId/block`
- `POST /api/cards/:cardId/purchases`
- `GET /api/card-additional-links`
- `POST /api/card-additional-links`
- `PATCH /api/card-additional-links/:groupCardId/primary`
- `GET /api/invoices`
- `GET /api/invoices/:invoiceId`
- `GET /api/invoices/:invoiceId/summary`
- `POST /api/invoices/:invoiceId/close`
- `POST /api/invoices/:invoiceId/pay`

UI disponivel:

- cadastra, edita, bloqueia e arquiva cartao em `/contas-cartoes`;
- seleciona cartao/fatura, mostra resumo consolidado por familia de cartao, registra/edita compra, filtra, fecha fatura e paga fatura em `/cartoes`.

Lacuna: mover compra para outra fatura/periodo pela UI.

### Orcamentos

API disponivel:

- `GET /api/budgets`
- `POST /api/budgets`
- `GET /api/budgets/:budgetId`
- `PATCH /api/budgets/:budgetId`
- `POST /api/budgets/:budgetId/archive`
- `GET /api/budgets/:budgetId/usage`

UI disponivel:

- lista, cria, consulta detalhe/uso via acao, edita e arquiva em `/orcamentos`.

Lacuna: tela dedicada de detalhe/uso.

### Contas a pagar/receber legado

API disponivel temporariamente:

- `GET /api/payables-receivables`
- `POST /api/payables-receivables`
- `GET /api/payables-receivables/:payableReceivableId`
- `PATCH /api/payables-receivables/:payableReceivableId`
- `POST /api/payables-receivables/:payableReceivableId/settle`
- `POST /api/payables-receivables/:payableReceivableId/cancel`

UI disponivel:

- sem tela operacional ativa para novos fluxos;
- `/lancamentos` cobre receitas, despesas, transferencias e lancamentos previstos de conta;
- `/cartoes` cobre compras, faturas, fechamento e pagamento de cartao;
- componentes internos remanescentes de `/pagar-receber` devem ser tratados como legado, sem links novos de navegacao ou Dashboard.

Lacuna: plano da #290 para migracao/compatibilidade do dominio, endpoints, testes e dados antigos.

## Ambiguidades e encaminhamentos

- Exclusao fisica de dados financeiros nao aparece como padrao atual; a arquitetura favorece exclusao logica, arquivamento, inativacao ou cancelamento auditavel. A politica de retencao/mascaramento deve ser consolidada na issue #177.
- Os chips de status do Extrato da conta existem visualmente, mas ainda precisam ser confirmados como filtros interativos ou indicadores em uma proxima iteracao.
- Autenticacao produtiva segue dependente da ADR da issue #174.
- Selecao e gestao operacional de perfis financeiros segue na issue #182.
- Importacao, deduplicacao, conciliacao e IA devem avancar em ordem que preserve revisao humana, auditoria e privacidade: #175, #176, #178 e #183.
- A remocao tecnica de `PayableReceivable` nao deve ocorrer antes de plano explicito de migracao/compatibilidade, previsto na #290.

## Proximas implementacoes sugeridas

1. Planejar na #290 a transicao tecnica segura de `PayableReceivable` sem perda de dados.
2. Adicionar consulta historica dedicada de parcelas por recorrencia.
3. Evoluir telas dedicadas de detalhe para contas, categorias, lancamentos, cartoes e orcamentos.
4. Consolidar politica de retencao/mascaramento antes de ampliar importacao, inbox e IA com dados sensiveis.
5. Ligar importacao, deduplicacao/conciliacao e fila revisavel em fluxo operacional.
