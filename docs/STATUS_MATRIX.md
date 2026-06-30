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
- [`docs/RECURRENCES_INSTALLMENTS_WEB.md`](./RECURRENCES_INSTALLMENTS_WEB.md)
- [`docs/WEB_MAINTENANCE_COVERAGE.md`](./WEB_MAINTENANCE_COVERAGE.md)
- [`prisma/schema.prisma`](../prisma/schema.prisma)
- [`apps/api/src/router.ts`](../apps/api/src/router.ts)
- [`apps/api/src/payables-receivables-router.ts`](../apps/api/src/payables-receivables-router.ts)
- [`apps/api/src/api-persistence.integration.test.ts`](../apps/api/src/api-persistence.integration.test.ts)
- [`apps/web/src/dev-server.ts`](../apps/web/src/dev-server.ts)
- [`apps/web/src/dev-server/pages.ts`](../apps/web/src/dev-server/pages.ts)
- [`apps/web/src/dev-server/payables-receivables-page.ts`](../apps/web/src/dev-server/payables-receivables-page.ts)
- [`apps/web/src/dev-server/recurrences-section.ts`](../apps/web/src/dev-server/recurrences-section.ts)
- [`apps/web/src/dev-server/routes.ts`](../apps/web/src/dev-server/routes.ts)
- [`packages/domain/src/index.ts`](../packages/domain/src/index.ts)
- [`packages/domain/src/imports.ts`](../packages/domain/src/imports.ts)
- [`packages/domain/src/deduplication.ts`](../packages/domain/src/deduplication.ts)
- [`packages/domain/src/reconciliation.ts`](../packages/domain/src/reconciliation.ts)
- [`packages/domain/src/automation-rules.ts`](../packages/domain/src/automation-rules.ts)
- [`packages/domain/src/ai-review-queue.ts`](../packages/domain/src/ai-review-queue.ts)

## Matriz por area

| Area                      | Dominio | Schema/migration | Seed     | Repository | API      | UI       | Testes                              | Documentacao | Nota                                                                                                                                                                                                              |
| ------------------------- | ------- | ---------------- | -------- | ---------- | -------- | -------- | ----------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contas                    | Feito   | Feito            | Feito    | Feito      | Feito    | Parcial  | Integracao feito; unitarios parcial | Parcial      | Web lista, cria, abre detalhe via acao, edita e arquiva; ainda nao ha tela dedicada de detalhe.                                                                                                                   |
| Categorias                | Feito   | Feito            | Feito    | Feito      | Feito    | Parcial  | Integracao feito; unitarios parcial | Parcial      | Web lista, cria, abre detalhe via acao, edita, arquiva e restaura; ainda nao ha tela dedicada de detalhe.                                                                                                         |
| Lancamentos / Extrato     | Feito   | Feito            | Feito    | Feito      | Feito    | Parcial  | Integracao feito; unitarios parcial | Parcial      | Web preserva Extrato da conta com resumo, agrupamento por data, criacao, detalhe via acao, edicao e cancelamento/estorno. Chips seguem como indicadores.                                                          |
| Recorrencias              | Feito   | Feito            | Parcial  | Feito      | Feito    | Feito    | Web parcial; integracao parcial     | Feito        | Sem rota propria nem bloco separado: cada lancamento recorrente aparece na lista normal de `/lancamentos`/`/cartoes` com indicador visual e acoes (editar/pausar/retomar/cancelar) no proprio menu do lancamento. |
| Parcelas                  | Feito   | Feito            | Parcial  | Parcial    | Parcial  | Parcial  | Parcial                             | Parcial      | Parcelas aparecem no fluxo de geracao de recorrencias; ainda nao ha rota dedicada para reler historico nem manutencao direta.                                                                                     |
| Cartoes / Faturas         | Feito   | Feito            | Feito    | Feito      | Feito    | Feito    | Integracao feito; unitarios parcial | Parcial      | Cadastro/manutencao do cartao em Contas e Cartoes; `/cartoes` (Cartoes de Credito) cobre fatura, compra, conciliacao, fechamento e pagamento.                                                                     |
| Orcamentos                | Feito   | Feito            | Feito    | Feito      | Feito    | Parcial  | Parcial                             | Parcial      | Web lista, cria, abre detalhe via acao, edita, consulta uso e arquiva; ainda nao ha tela dedicada de detalhe.                                                                                                     |
| Contas a pagar/receber    | Feito   | Feito            | Parcial  | Feito      | Feito    | Feito    | Integracao feito; unitarios parcial | Feito        | `/pagar-receber` lista, cria, edita pendentes, conclui e cancela conforme contrato MVP.                                                                                                                           |
| Importacao CSV/OFX        | Feito   | Parcial          | Pendente | Pendente   | Pendente | Pendente | Parcial                             | Parcial      | Dominio faz preview, hash, sugestoes e problemas; falta lote persistido operacional, repository, API e UI.                                                                                                        |
| Deduplicacao              | Feito   | Pendente         | Pendente | Pendente   | Pendente | Pendente | Parcial                             | Parcial      | Existem regras deterministicas no dominio, mas ainda nao ha fluxo persistido de revisao.                                                                                                                          |
| Conciliacao               | Feito   | Parcial          | Pendente | Pendente   | Pendente | Parcial  | Parcial                             | Parcial      | A UI tem indicadores de status no extrato, mas nao executa conciliacao operacional.                                                                                                                               |
| Regras automaticas        | Feito   | Pendente         | Pendente | Pendente   | Pendente | Pendente | Parcial                             | Parcial      | Existem regras aplicaveis no dominio, mas ainda nao ha cadastro, persistencia nem fila operacional.                                                                                                               |
| IA / sugestoes revisaveis | Feito   | Parcial          | Pendente | Pendente   | Pendente | Pendente | Parcial                             | Parcial      | `AiSuggestion` existe no schema e ha fila de revisao no dominio, mas faltam repository, API e UI.                                                                                                                 |

## Matriz de operacoes visiveis na UI

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
- Editar: Sim, formulario inline.
- Cancelar/estornar: Sim, para lancamento nao cancelado.
- Excluir: Nao.
- Acoes especificas: chips de status visiveis, ainda como indicadores.
- Lacuna restante: confirmar se chips de status viram filtros interativos em iteracao futura.

### Recorrencias (sem tela nem bloco propio; embutidas na lista de `/lancamentos` e `/cartoes`)

Sem rota propria e sem secao separada: cada lancamento gerado por uma recorrencia aparece como uma linha normal na lista de Movimentacoes (Extrato) ou Compras (Cartoes), com um indicador visual de recorrencia e acoes extras (Editar/Pausar/Retomar/Cancelar recorrencia) no mesmo menu "..." que qualquer outro lancamento ja tem.

- Listar: Sim — os dados da recorrencia (status, frequencia etc.) sao buscados via `GET /api/recurrences?accountId=...`/`?cardId=...&status=all` e casados com o `recurrenceId` de cada lancamento da lista.
- Visualizar detalhe: Sim, via modal de edicao aberto pela acao "Editar recorrencia" no menu do lancamento.
- Criar: Sim, via repeticao "Fixo" no modal de novo lancamento (Extrato) ou nova compra (Cartoes); nao ha formulario de criacao avulso. A criacao ja materializa imediatamente o primeiro vencimento como lancamento real (`Transaction`), que aparece na propria lista de Movimentacoes/Compras sem nenhuma acao extra.
- Editar: Sim, modal compartilhado entre Extrato e Cartoes (com campo "Tipo" para recorrencias de conta), aberto pelo menu do lancamento.
- Pausar: Sim, quando ativa, pelo menu do lancamento.
- Retomar: Sim, quando pausada, pelo menu do lancamento.
- Cancelar: Sim, quando ainda nao cancelada ou concluida, pelo menu do lancamento.
- Gerar parcelas: Automatico a cada acesso a tela (catch-up de vencimentos ate hoje) e tambem manual, com formulario de periodo e limite dentro do modal de edicao, para adiantar vencimentos futuros.
- Parcelas: Cada parcela gerada materializa uma `Transaction` real (nao so um registro de controle), visivel direto na lista; sem listagem dedicada de historico de parcelas.
- Lacuna restante: nao ha rota dedicada para reler historico de parcelas ja geradas.

### Cartoes de Credito (`/cartoes`)

- Selecionar cartao: Sim, por seletor com indicador de cartao adicional/virtual vinculado.
- Selecionar fatura: Sim, por navegacao de periodo (fatura anterior/proxima).
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

### Contas a pagar/receber (`/pagar-receber`)

- Listar: Sim, agrupado por pendentes, concluidas e canceladas.
- Visualizar detalhe: Sim, por acao que consulta a API e mostra feedback; nao ha tela dedicada.
- Criar: Sim.
- Editar: Sim, apenas pendentes.
- Concluir pagamento/recebimento: Sim, com confirmacao e geracao/associacao de lancamento conforme backend.
- Cancelar: Sim, apenas pendentes.
- Arquivar/restaurar/excluir: Nao aplicavel ao contrato MVP atual.
- Lacuna restante: detalhes dedicados e eventual evolucao de manutencao direta se o contrato mudar.

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

Lacunas:

- tela dedicada de detalhe.

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

Lacunas:

- tela dedicada de detalhe.

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
- formulario "Adicionar ao extrato";
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

- recorrencias sem rota nem bloco propio: lancamentos recorrentes aparecem na lista normal de `/lancamentos`/`/cartoes`, com criacao via repeticao "Fixo" e edicao/pausa/retomada/cancelamento/geracao de parcelas pelo menu de acoes do lancamento.

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
- seleciona cartao/fatura, mostra resumo consolidado por familia de cartao, registra/edita compra, filtra, fecha fatura e paga fatura em `/cartoes` (Cartoes de Credito).

Lacunas:

- mover compra para outra fatura/periodo pela UI.

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

Lacunas:

- tela dedicada de detalhe/uso.

### Contas a pagar/receber

API disponivel:

- `GET /api/payables-receivables`
- `POST /api/payables-receivables`
- `GET /api/payables-receivables/:payableReceivableId`
- `PATCH /api/payables-receivables/:payableReceivableId`
- `POST /api/payables-receivables/:payableReceivableId/settle`
- `POST /api/payables-receivables/:payableReceivableId/cancel`

UI disponivel:

- rota `/pagar-receber` com resumo, listagem por status, criacao, edicao de pendentes, conclusao e cancelamento.

Lacunas:

- tela dedicada de detalhe;
- manutencao direta para estados futuros se o contrato evoluir.

## Ambiguidades e encaminhamentos

- Exclusao fisica de dados financeiros nao aparece como padrao atual; a arquitetura favorece exclusao logica, arquivamento, inativacao ou cancelamento auditavel. A politica de retencao/mascaramento deve ser consolidada na issue #177.
- Faturas ainda precisam de decisao de UX: tela propria ou subfluxo dentro de cartoes.
- Os chips de status do Extrato da conta existem visualmente, mas ainda precisam ser confirmados como filtros interativos ou indicadores em uma proxima iteracao.
- Autenticacao produtiva segue dependente da ADR da issue #174.
- Selecao e gestao operacional de perfis financeiros segue na issue #182.
- Importacao, deduplicacao, conciliacao e IA devem avancar em ordem que preserve revisao humana, auditoria e privacidade: #175, #176, #178 e #183.

## Proximas implementacoes sugeridas

1. Expor faturas na UI de cartoes, incluindo listagem e pagamento.
2. Adicionar consulta historica dedicada de parcelas por recorrencia.
3. Evoluir telas dedicadas de detalhe para contas, categorias, lancamentos, cartoes, orcamentos e contas a pagar/receber.
4. Consolidar politica de retencao/mascaramento antes de ampliar importacao, inbox e IA com dados sensiveis.
5. Ligar importacao, deduplicacao/conciliacao e fila revisavel em fluxo operacional.
