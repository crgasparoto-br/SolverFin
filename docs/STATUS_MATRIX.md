# Matriz de status do MVP

Esta matriz registra o estado observado em `main` para reduzir ambiguidade antes de novas implementacoes. Ela diferencia capacidade existente no dominio/API de operacao realmente acessivel na web navegavel.

## Legenda

- Feito: existe implementacao verificavel no codigo atual.
- Parcial: existe parte relevante, mas ainda falta camada, fluxo ou acao importante.
- Pendente: nao ha implementacao operacional na camada indicada.
- Bloqueado: depende de decisao, politica ou fluxo anterior.
- Precisa de ADR: depende de decisao arquitetural/produtiva formal.

## Fontes conferidas

- [`README.md`](../README.md)
- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)
- [`docs/PAYABLES_RECEIVABLES.md`](./PAYABLES_RECEIVABLES.md)
- [`prisma/schema.prisma`](../prisma/schema.prisma)
- [`apps/api/src/router.ts`](../apps/api/src/router.ts)
- [`apps/api/src/payables-receivables-router.ts`](../apps/api/src/payables-receivables-router.ts)
- [`apps/api/src/api-persistence.integration.test.ts`](../apps/api/src/api-persistence.integration.test.ts)
- [`apps/web/src/dev-server/pages.ts`](../apps/web/src/dev-server/pages.ts)
- [`apps/web/src/dev-server/routes.ts`](../apps/web/src/dev-server/routes.ts)
- [`packages/domain/src/index.ts`](../packages/domain/src/index.ts)
- [`packages/domain/src/imports.ts`](../packages/domain/src/imports.ts)
- [`packages/domain/src/deduplication.ts`](../packages/domain/src/deduplication.ts)
- [`packages/domain/src/reconciliation.ts`](../packages/domain/src/reconciliation.ts)
- [`packages/domain/src/automation-rules.ts`](../packages/domain/src/automation-rules.ts)
- [`packages/domain/src/ai-review-queue.ts`](../packages/domain/src/ai-review-queue.ts)

## Matriz por area

### Contas

- Dominio: Feito.
- Schema/migration: Feito.
- Seed: Feito.
- Repository: Feito.
- API: Feito.
- UI: Parcial.
- Testes unitarios: Parcial.
- Testes de integracao: Feito.
- Documentacao: Parcial.
- Nota: a web lista e cria contas, mas ainda nao expõe detalhe, edicao ou arquivamento.

### Categorias

- Dominio: Feito.
- Schema/migration: Feito.
- Seed: Feito.
- Repository: Feito.
- API: Feito.
- UI: Parcial.
- Testes unitarios: Parcial.
- Testes de integracao: Feito.
- Documentacao: Parcial.
- Nota: a API suporta restauracao, mas a UI ainda mostra principalmente listagem e criacao.

### Lancamentos / Extrato

- Dominio: Feito.
- Schema/migration: Feito.
- Seed: Feito.
- Repository: Feito.
- API: Feito.
- UI: Parcial.
- Testes unitarios: Parcial.
- Testes de integracao: Feito.
- Documentacao: Parcial.
- Nota: a tela atual deve permanecer como **Extrato da conta**, com resumo, agrupamento por data, chips de status e formulario "Adicionar ao extrato".

### Recorrencias

- Dominio: Feito.
- Schema/migration: Feito.
- Seed: Parcial.
- Repository: Feito.
- API: Feito.
- UI: Pendente.
- Testes unitarios: Parcial.
- Testes de integracao: Parcial.
- Documentacao: Parcial.
- Nota: existem rotas para listar, criar, atualizar, pausar, retomar, cancelar e gerar parcelas, mas nao existe rota web implementada.

### Parcelas

- Dominio: Feito.
- Schema/migration: Feito.
- Seed: Parcial.
- Repository: Parcial.
- API: Parcial.
- UI: Pendente.
- Testes unitarios: Parcial.
- Testes de integracao: Parcial.
- Documentacao: Parcial.
- Nota: parcelas aparecem como entidade persistente e como efeito da geracao de recorrencias ou compras parceladas, mas ainda nao ha tela propria nem API direta de manutencao.

### Cartoes / Faturas

- Dominio: Feito.
- Schema/migration: Feito.
- Seed: Feito.
- Repository: Feito.
- API: Feito.
- UI: Parcial.
- Testes unitarios: Parcial.
- Testes de integracao: Parcial.
- Documentacao: Parcial.
- Nota: a web lista e cria cartoes; faturas e acoes como bloquear, registrar compra e pagar fatura ainda nao aparecem na UI.

### Orcamentos

- Dominio: Feito.
- Schema/migration: Feito.
- Seed: Feito.
- Repository: Feito.
- API: Feito.
- UI: Parcial.
- Testes unitarios: Parcial.
- Testes de integracao: Parcial.
- Documentacao: Parcial.
- Nota: a web lista e cria orcamentos; edicao, arquivamento e consulta de uso ainda nao aparecem na UI.

### Contas a pagar/receber

- Dominio: Feito.
- Schema/migration: Feito.
- Seed: Parcial.
- Repository: Feito.
- API: Feito.
- UI: Pendente.
- Testes unitarios: Parcial.
- Testes de integracao: Feito.
- Documentacao: Feito.
- Nota: o backend esta documentado em `docs/PAYABLES_RECEIVABLES.md`; a tela web esta pendente na issue #185.

### Importacao CSV/OFX

- Dominio: Feito.
- Schema/migration: Parcial.
- Seed: Pendente.
- Repository: Pendente.
- API: Pendente.
- UI: Pendente.
- Testes unitarios: Parcial.
- Testes de integracao: Pendente.
- Documentacao: Parcial.
- Nota: o dominio faz preview, hash, sugestoes e problemas; falta lote persistido operacional, repository, API e UI.

### Deduplicacao

- Dominio: Feito.
- Schema/migration: Pendente.
- Seed: Pendente.
- Repository: Pendente.
- API: Pendente.
- UI: Pendente.
- Testes unitarios: Parcial.
- Testes de integracao: Pendente.
- Documentacao: Parcial.
- Nota: existem regras deterministicas no dominio, mas ainda nao ha fluxo persistido de revisao.

### Conciliacao

- Dominio: Feito.
- Schema/migration: Parcial.
- Seed: Pendente.
- Repository: Pendente.
- API: Pendente.
- UI: Parcial.
- Testes unitarios: Parcial.
- Testes de integracao: Pendente.
- Documentacao: Parcial.
- Nota: a UI tem indicadores de status no extrato, mas nao executa conciliacao operacional.

### Regras automaticas

- Dominio: Feito.
- Schema/migration: Pendente.
- Seed: Pendente.
- Repository: Pendente.
- API: Pendente.
- UI: Pendente.
- Testes unitarios: Parcial.
- Testes de integracao: Pendente.
- Documentacao: Parcial.
- Nota: existem regras aplicaveis no dominio, mas ainda nao ha cadastro, persistencia nem fila operacional.

### IA / sugestoes revisaveis

- Dominio: Feito.
- Schema/migration: Parcial.
- Seed: Pendente.
- Repository: Pendente.
- API: Pendente.
- UI: Pendente.
- Testes unitarios: Parcial.
- Testes de integracao: Pendente.
- Documentacao: Parcial.
- Nota: `AiSuggestion` existe no schema e ha fila de revisao no dominio, mas faltam repository, API e UI.

## Matriz de operacoes visiveis na UI

### Contas (`/contas`)

- Listar: Sim, em cards/linhas.
- Visualizar detalhe: Nao.
- Criar: Sim, formulario "Nova conta".
- Editar: Nao.
- Arquivar/inativar: Nao.
- Restaurar/reativar: Nao aplicavel.
- Cancelar/estornar: Nao aplicavel.
- Excluir: Nao.
- Acoes especificas: Nao.
- Lacuna diante da API: API ja tem detalhe, `PATCH` e `archive`; UI nao mostra botoes, links ou menu para essas acoes.

### Categorias (`/categorias`)

- Listar: Sim, em cards/linhas.
- Visualizar detalhe: Nao.
- Criar: Sim, formulario "Nova categoria".
- Editar: Nao.
- Arquivar/inativar: Nao.
- Restaurar/reativar: Nao.
- Cancelar/estornar: Nao aplicavel.
- Excluir: Nao.
- Acoes especificas: Nao.
- Lacuna diante da API: API ja tem detalhe, `PATCH`, `archive` e `restore`; UI nao expõe essas acoes.

### Extrato da conta (`/lancamentos`)

- Listar: Sim, agrupado por data.
- Visualizar detalhe: Nao.
- Criar: Sim, formulario "Novo lancamento" / "Adicionar ao extrato".
- Editar: Nao.
- Arquivar/inativar: Nao aplicavel.
- Restaurar/reativar: Nao aplicavel.
- Cancelar/estornar: Nao.
- Excluir: Nao.
- Acoes especificas: chips de status visiveis, mas sem comportamento de filtro confirmado.
- Lacuna diante da API: API ja tem detalhe, `PATCH` e `void`; linhas do extrato nao expõem abrir detalhe, editar ou cancelar/estornar.

### Cartoes (`/cartoes`)

- Listar: Sim, em cards/linhas.
- Visualizar detalhe: Nao.
- Criar: Sim, formulario "Novo cartao".
- Editar: Nao.
- Arquivar/inativar: Nao.
- Restaurar/reativar: Nao aplicavel.
- Cancelar/estornar: Nao aplicavel.
- Excluir: Nao.
- Acoes especificas: Nao.
- Lacuna diante da API: API ja tem detalhe, `PATCH`, `archive`, `block`, compras, faturas e pagamento de fatura; UI nao expõe manutencao nem faturas.

### Orcamentos (`/orcamentos`)

- Listar: Sim, em cards/linhas.
- Visualizar detalhe: Nao.
- Criar: Sim, formulario "Novo orcamento".
- Editar: Nao.
- Arquivar/inativar: Nao.
- Restaurar/reativar: Nao aplicavel.
- Cancelar/estornar: Nao aplicavel.
- Excluir: Nao.
- Acoes especificas: Nao.
- Lacuna diante da API: API ja tem detalhe, `PATCH`, `archive` e `usage`; UI nao expõe edicao, arquivamento ou consulta de uso.

### Contas a pagar/receber

- Listar: Nao ha rota web.
- Visualizar detalhe: Nao.
- Criar: Nao.
- Editar: Nao.
- Arquivar/inativar: Nao aplicavel.
- Restaurar/reativar: Nao aplicavel.
- Cancelar/estornar: Nao.
- Excluir: Nao.
- Acoes especificas: Nao.
- Lacuna diante da API: API ja tem listar, criar, detalhe, editar, concluir e cancelar; falta UI completa (#185).

### Recorrencias / parcelas

- Listar: Nao ha rota web.
- Visualizar detalhe: Nao.
- Criar: Nao.
- Editar: Nao.
- Arquivar/inativar: Nao aplicavel.
- Restaurar/reativar: Nao.
- Cancelar/estornar: Nao.
- Excluir: Nao.
- Acoes especificas: Nao.
- Lacuna diante da API: API de recorrencias ja existe; falta visibilidade operacional na web (#184).

### Inbox, relatorios e configuracoes

- Listar: placeholder.
- Visualizar detalhe: Nao.
- Criar: Nao.
- Editar: Nao.
- Arquivar/inativar: Nao.
- Restaurar/reativar: Nao.
- Cancelar/estornar: Nao.
- Excluir: Nao.
- Acoes especificas: Nao.
- Lacuna diante da API: rotas existem na navegacao, mas renderizam estado de preparacao.

## Comparacao API x UI por recurso principal

### Contas

API disponivel:

- `GET /api/accounts`
- `POST /api/accounts`
- `GET /api/accounts/:accountId`
- `PATCH /api/accounts/:accountId`
- `POST /api/accounts/:accountId/archive`

UI disponivel:

- lista contas em `/contas`;
- cria conta via formulario.

Lacunas:

- abrir detalhe;
- editar conta;
- arquivar/inativar conta;
- indicar acao por linha com botao, link ou menu.

### Categorias

API disponivel:

- `GET /api/categories`
- `POST /api/categories`
- `GET /api/categories/:categoryId`
- `PATCH /api/categories/:categoryId`
- `POST /api/categories/:categoryId/archive`
- `POST /api/categories/:categoryId/restore`

UI disponivel:

- lista categorias em `/categorias`;
- cria categoria via formulario.

Lacunas:

- abrir detalhe;
- editar categoria;
- arquivar/inativar categoria;
- restaurar categoria arquivada;
- indicar acoes por linha.

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
- formulario "Adicionar ao extrato".

Lacunas:

- abrir detalhe da movimentacao;
- editar movimentacao;
- cancelar/estornar movimentacao;
- confirmar se chips de status serao filtros interativos ou apenas indicadores;
- manter o desenho de extrato ao adicionar as acoes, sem voltar para lista simples.

### Cartoes e faturas

API disponivel:

- `GET /api/cards`
- `POST /api/cards`
- `GET /api/cards/:cardId`
- `PATCH /api/cards/:cardId`
- `POST /api/cards/:cardId/archive`
- `POST /api/cards/:cardId/block`
- `POST /api/cards/:cardId/purchases`
- `GET /api/invoices`
- `GET /api/invoices/:invoiceId`
- `POST /api/invoices/:invoiceId/pay`

UI disponivel:

- lista cartoes em `/cartoes`;
- cria cartao via formulario.

Lacunas:

- editar cartao;
- arquivar/inativar cartao;
- bloquear cartao;
- registrar compra;
- listar faturas;
- pagar fatura.

### Orcamentos

API disponivel:

- `GET /api/budgets`
- `POST /api/budgets`
- `GET /api/budgets/:budgetId`
- `PATCH /api/budgets/:budgetId`
- `POST /api/budgets/:budgetId/archive`
- `GET /api/budgets/:budgetId/usage`

UI disponivel:

- lista orcamentos em `/orcamentos`;
- cria orcamento via formulario.

Lacunas:

- abrir detalhe;
- editar orcamento;
- arquivar/inativar orcamento;
- consultar uso do orcamento.

### Contas a pagar/receber

API disponivel:

- `GET /api/payables-receivables`
- `POST /api/payables-receivables`
- `GET /api/payables-receivables/:payableReceivableId`
- `PATCH /api/payables-receivables/:payableReceivableId`
- `POST /api/payables-receivables/:payableReceivableId/settle`
- `POST /api/payables-receivables/:payableReceivableId/cancel`

UI disponivel:

- nenhuma rota implementada no web atual.

Lacunas:

- listar pendentes, concluidas e canceladas;
- criar conta a pagar/receber;
- editar pendentes;
- concluir pagamento/recebimento;
- cancelar pendentes;
- confirmar acoes financeiras relevantes.

## Ambiguidades e encaminhamentos

- Exclusao fisica de dados financeiros nao aparece como padrao atual; a arquitetura favorece exclusao logica, arquivamento, inativacao ou cancelamento auditavel. A politica de retencao/mascaramento deve ser consolidada na issue #177.
- A forma visual das acoes por item, botoes diretos ou menu compacto, fica para implementacao da issue #181.
- Faturas, recorrencias e parcelas ainda precisam de decisao de UX: tela propria ou subfluxo dentro de cartoes/extrato. Isso esta coberto pelas issues #181 e #184.
- Os chips de status do Extrato da conta existem visualmente, mas ainda precisam ser confirmados como filtros interativos ou indicadores em uma proxima iteracao.
- Autenticacao produtiva segue dependente da ADR da issue #174.
- Selecao e gestao operacional de perfis financeiros segue na issue #182.
- CI com PostgreSQL real segue na issue #179.
- Importacao, deduplicacao, conciliacao e IA devem avancar em ordem que preserve revisao humana, auditoria e privacidade: #175, #176, #178 e #183.

## Proximas implementacoes sugeridas

1. #181 para completar a manutencao das telas ja navegaveis sem quebrar o desenho de Extrato da conta.
2. #185 para expor contas a pagar/receber na web consumindo o contrato backend existente.
3. #184 para dar visibilidade a recorrencias e parcelas.
4. #177 antes de ampliar importacao, inbox e IA com dados sensiveis.
5. #175, #176 e #178 para ligar importacao, deduplicacao/conciliacao e fila revisavel em fluxo operacional.
