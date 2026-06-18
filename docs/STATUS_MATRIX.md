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

| Area | Dominio | Schema/migration | Seed | Repository | API | UI | Testes unitarios | Testes de integracao | Documentacao |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Contas | Feito | Feito | Feito | Feito | Feito | Parcial | Parcial | Feito | Parcial |
| Categorias | Feito | Feito | Feito | Feito | Feito | Parcial | Parcial | Feito | Parcial |
| Lancamentos / Extrato | Feito | Feito | Feito | Feito | Feito | Parcial | Parcial | Feito | Parcial |
| Recorrencias | Feito | Feito | Parcial | Feito | Feito | Pendente | Parcial | Parcial | Parcial |
| Parcelas | Feito | Feito | Parcial | Parcial | Parcial | Pendente | Parcial | Parcial | Parcial |
| Cartoes / Faturas | Feito | Feito | Feito | Feito | Feito | Parcial | Parcial | Parcial | Parcial |
| Orcamentos | Feito | Feito | Feito | Feito | Feito | Parcial | Parcial | Parcial | Parcial |
| Contas a pagar/receber | Feito | Feito | Parcial | Feito | Feito | Pendente | Parcial | Feito | Feito |
| Importacao CSV/OFX | Feito | Parcial | Pendente | Pendente | Pendente | Pendente | Parcial | Pendente | Parcial |
| Deduplicacao | Feito | Pendente | Pendente | Pendente | Pendente | Pendente | Parcial | Pendente | Parcial |
| Conciliacao | Feito | Parcial | Pendente | Pendente | Pendente | Parcial | Parcial | Pendente | Parcial |
| Regras automaticas | Feito | Pendente | Pendente | Pendente | Pendente | Pendente | Parcial | Pendente | Parcial |
| IA / sugestoes revisaveis | Feito | Parcial | Pendente | Pendente | Pendente | Pendente | Parcial | Pendente | Parcial |

### Notas da matriz por area

- Contas, categorias e lancamentos ja possuem persistencia, repository e rotas CRUD principais. A web, porem, ainda expõe principalmente listagem e criacao.
- Lancamentos devem continuar registrados como **Extrato da conta**. A tela atual mostra resumo do periodo, agrupamento por data, chips de status e formulario "Adicionar ao extrato".
- Recorrencias possuem API para listar, criar, atualizar, pausar, retomar, cancelar e gerar parcelas. Ainda nao existe rota web implementada para a operacao.
- Parcelas aparecem como entidade persistente e como efeito da geracao de recorrencias ou compras parceladas, mas ainda nao ha tela propria nem API direta de manutencao de parcelas.
- Cartoes possuem API de manutencao e acoes especificas. Faturas possuem rotas de listagem, detalhe e pagamento, mas a web atual ainda mostra apenas cadastro/listagem basica de cartoes.
- Contas a pagar/receber possuem backend persistido e documentado em `docs/PAYABLES_RECEIVABLES.md`; a UI esta pendente na issue #185.
- Importacao tem dominio para preview CSV/OFX, hash, sugestoes e problemas. Falta ligar lote persistido, repository, API e UI.
- Deduplicacao, conciliacao, regras automaticas e fila de IA existem como regras de dominio, mas ainda nao como fluxo operacional completo com persistencia/API/UI.

## Matriz de operacoes visiveis na UI

| Tela / fluxo | Listar | Detalhe | Criar | Editar | Arquivar/inativar | Restaurar/reativar | Cancelar/estornar | Excluir | Acoes especificas visiveis | Lacuna diante da API |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Contas (`/contas`) | Sim, lista em cards/linhas | Nao | Sim, formulario "Nova conta" | Nao | Nao | Nao aplicavel | Nao aplicavel | Nao | Nao | API ja tem detalhe, `PATCH` e `archive`; UI nao mostra botoes, links ou menu para essas acoes. |
| Categorias (`/categorias`) | Sim, lista em cards/linhas | Nao | Sim, formulario "Nova categoria" | Nao | Nao | Nao | Nao aplicavel | Nao | Nao | API ja tem detalhe, `PATCH`, `archive` e `restore`; UI nao expõe essas acoes. |
| Extrato da conta (`/lancamentos`) | Sim, agrupado por data | Nao | Sim, formulario "Novo lancamento" / "Adicionar ao extrato" | Nao | Nao aplicavel | Nao aplicavel | Nao | Nao | Chips de status visiveis, mas sem comportamento de filtro confirmado | API ja tem detalhe, `PATCH` e `void`; linhas do extrato nao expõem abrir detalhe, editar ou cancelar/estornar. |
| Cartoes (`/cartoes`) | Sim, lista em cards/linhas | Nao | Sim, formulario "Novo cartao" | Nao | Nao | Nao aplicavel | Nao aplicavel | Nao | Nao | API ja tem detalhe, `PATCH`, `archive`, `block`, compras, faturas e pagamento de fatura; UI nao expõe manutencao nem faturas. |
| Orcamentos (`/orcamentos`) | Sim, lista em cards/linhas | Nao | Sim, formulario "Novo orcamento" | Nao | Nao | Nao aplicavel | Nao aplicavel | Nao | Nao | API ja tem detalhe, `PATCH`, `archive` e `usage`; UI nao expõe edicao, arquivamento ou consulta de uso. |
| Contas a pagar/receber | Nao ha rota web | Nao | Nao | Nao | Nao aplicavel | Nao aplicavel | Nao | Nao | Nao | API ja tem listar, criar, detalhe, editar, concluir e cancelar; falta UI completa (#185). |
| Recorrencias / parcelas | Nao ha rota web | Nao | Nao | Nao | Nao aplicavel | Nao | Nao | Nao | Nao | API de recorrencias ja existe; falta visibilidade operacional na web (#184). |
| Inbox, relatorios e configuracoes | Placeholder | Nao | Nao | Nao | Nao | Nao | Nao | Nao | Nao | Rotas existem na navegacao, mas renderizam estado de preparacao. |

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
