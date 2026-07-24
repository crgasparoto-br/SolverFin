# Matriz de status do MVP

Esta matriz registra o estado observado em `main` para reduzir ambiguidade antes de novas implementacoes. Ela diferencia capacidade existente no dominio/API de operacao realmente acessivel na web navegavel.

## Legenda

- Feito: existe implementacao verificavel no codigo atual.
- Parcial: existe parte relevante, mas ainda falta camada, fluxo ou acao importante.
- Legado: existe para compatibilidade, historico ou transicao, mas nao deve orientar novas jornadas de produto.
- Pendente: nao ha implementacao operacional na camada indicada.
- Bloqueado: depende de decisao, politica ou fluxo anterior.
- Precisa de ADR: depende de decisao arquitetural/produtiva formal.

## Fontes conferidas nesta revisao

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/PRODUCT.md`
- `docs/CARDS.md`
- `docs/TRANSACTIONS.md`
- `docs/API_TRANSACTION_GROUP_ACTIONS.md`
- `docs/API_TRANSACTION_BULK_ACTIONS.md`
- `docs/IMPORTS.md`
- `docs/DETERMINISTIC_DEDUP_RECONCILIATION.md`
- `docs/AI_REVIEW_QUEUE.md`
- `docs/BANK_MESSAGE_INBOX.md`
- `docs/AUTOMATION_RULES.md`
- `docs/PAYABLES_RECEIVABLES.md`
- `docs/API_PAYABLES_RECEIVABLES.md`
- `docs/WEB_MAINTENANCE_COVERAGE.md`
- `docs/API_CARD_PURCHASE_INVOICE_PERIOD_MOVE.md`
- PRs relacionadas ao estado atual: #190, #191, #192, #194, #197, #198, #302, #304, #338, #411, #412, #414 e #531.

## Decisao atual sobre pagar/receber

A rotina operacional de pagar e receber nao possui mais tela propria ativa. O usuario deve criar e acompanhar compromissos em:

- **Extrato da conta** (`/lancamentos`), para receitas, despesas, transferencias e lancamentos previstos de conta corrente.
- **Cartoes de Credito** (`/cartoes`), para compras, faturas, fechamento e pagamento de cartao.

`PayableReceivable` continua existindo como dominio/API legado para preservar registros antigos, auditoria e compatibilidade durante a transicao. A issue #290 registrou o plano de transicao segura; nenhuma remocao fisica desse dominio deve ocorrer sem migration/script idempotente e validacao explicita.

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
- UI: Feito para o fluxo atual.
- Testes: integracao e validacao visual feitas; unitarios parciais.
- Documentacao: Feito para o fluxo atual.
- Nota: web preserva Extrato da conta com resumo, agrupamento por data, criacao, detalhe via acao, edicao e cancelamento/estorno. Linhas simples e agrupadas participam da selecao operacional; a barra combinada permite conciliar, desconciliar e excluir logicamente em massa, com expansao dos grupos, deduplicacao, isolamento por perfil e atomicidade no servidor. Tambem e a tela ativa para compromissos previstos de conta corrente.
- Decisao: os chips **Pendentes**, **Nao conciliados** e **Conciliados** sao indicadores de resumo; nao sao filtros interativos no estado atual.

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
- Nota: parcelas aparecem no fluxo de geracao de recorrencias, podem ser consultadas por API, aparecem em `/cartoes` no recorte da fatura e tambem em `/relatorios` como consolidado somente leitura. Ainda nao ha manutencao direta de parcelas ja geradas.

### Cartoes / Faturas

- Dominio/API/persistencia: Feito.
- UI: Feito para o fluxo atual, incluindo acao visual para mover compra entre faturas/periodos quando a fatura e editavel.
- Testes: integracao feita; unitarios parciais; web parcial para a acao de movimentacao.
- Documentacao: Feito para o modelo atual de cartao agrupador em `docs/CARDS.md` e para o contrato de movimentacao em `docs/API_CARD_PURCHASE_INVOICE_PERIOD_MOVE.md`.
- Nota: cadastro/manutencao do cartao agrupador fica em Contas e Cartoes; `/cartoes` cobre compra, fatura, conciliacao, fechamento e pagamento, e e a tela ativa para compromissos de cartao. O backend possui contrato para mover compra entre faturas/periodos e a UI expoe a acao apenas para compras editaveis, solicitando o periodo destino `AAAA-MM` sem calcular `invoiceId` no frontend.

### Orcamentos

- Dominio/API/persistencia: Feito.
- UI: Parcial.
- Testes: Parcial.
- Documentacao: Parcial.
- Nota: web lista, cria, abre detalhe via acao, edita, consulta uso e arquiva; ainda nao ha tela dedicada de detalhe/uso.

### Contas a pagar/receber

- Dominio/schema/repository/API: Legado.
- Seed: sem criacao de registros novos no seed demo atual.
- UI: Legado/retirada da jornada ativa.
- Testes: integracao feita; unitarios parciais.
- Documentacao: Legado.
- Nota: `PayableReceivable` e mantido para compatibilidade e historico. `/pagar-receber` nao deve ser tratado como tela operacional ativa nem aparecer em navegacao, Dashboard ou novas jornadas de produto.

### Importacao CSV/OFX

- Dominio: Feito.
- Schema/migration: Parcial.
- Repository/API: Feito para CSV persistido e revisável.
- UI: Pendente para preview e aceite/rejeicao amigavel.
- Testes: Parcial.
- Documentacao: Parcial/Atualizada em `docs/IMPORTS.md`.
- Nota: CSV possui preview sem persistência, mapeamento, histórico, correção por linha, aprovação individual/em conjunto, rejeição, descarte lógico e criação atômica de lançamentos na Inbox. O arquivo bruto não é persistido. OFX segue somente no domínio/parser.

### Inbox de mensagens bancarias

- Dominio/API/persistencia: Parcial/Feito para fluxo inicial.
- UI: Parcial/Feito para tela inicial e fila de revisao integrada.
- Testes: Parcial.
- Documentacao: Feito em `docs/BANK_MESSAGE_INBOX.md`.
- Nota: `/inbox` permite colar mensagem, confirmar consentimento, selecionar conta/categoria opcionais, gerar sugestao revisavel e revisar sugestoes pendentes. O texto bruto e descartado apos normalizacao, hash e mascaramento.

### Deduplicacao

- Dominio: Feito.
- Schema/repository/API: Feito para fluxo determinístico em lotes CSV.
- UI: Parcial/Feito para revisao operacional via Inbox.
- Testes: Parcial.
- Documentacao: Feito em `docs/DETERMINISTIC_DEDUP_RECONCILIATION.md`.
- Nota: a varredura cria candidaturas idempotentes com vínculo estruturado. A Inbox permite aprovar/rejeitar; duplicidade rejeita a linha de origem e conciliação atualiza o lançamento alvo e resolve a origem atomicamente.

### Conciliacao

- Dominio: Feito.
- Schema/repository/API: Parcial/Feito para conciliacao deterministica inicial via sugestoes revisaveis.
- UI: Parcial/Feito para revisao operacional via Inbox; indicadores existem no extrato.
- Testes: Parcial.
- Documentacao: Feito em `docs/DETERMINISTIC_DEDUP_RECONCILIATION.md`.
- Nota: aprovacao de sugestao `reconciliation` pela Inbox usa o endpoint deterministico, marca o lancamento alvo como `reconciled`, preenche `reconciledAt`/`aiSuggestionId` e registra auditoria minima.

### Regras automaticas

- Dominio: Feito.
- Schema/repository/API/UI: Parcial/Feito para primeiro fluxo operacional revisavel.
- Testes: Parcial.
- Documentacao: Parcial/Atualizada em `docs/AUTOMATION_RULES.md`.
- Nota: `AutomationRule` persiste regras por perfil financeiro; `/api/automation-rules` lista/cria/atualiza/inativa/aplica regras. `Configurações` permite criar, listar, inativar e executar regras. A aplicacao gera sugestoes `categorization` revisaveis com `provider: solverfin-automation`, sem efeito financeiro irreversivel automatico.

### IA / sugestoes revisaveis

- Dominio: Feito.
- Schema/migration: Parcial.
- Repository/API: Parcial/Feito para fila de revisao.
- UI: Parcial/Feito para revisao operacional na Inbox.
- Testes: Parcial.
- Documentacao: Feito em `docs/AI_REVIEW_QUEUE.md`.
- Nota: `/api/ai-review-queue` lista sugestoes e permite aprovar, editar ou rejeitar. A Inbox permite aprovar/rejeitar sugestoes pendentes. Aprovacao com efeito financeiro automatico existe apenas para `transaction_extraction` com dados suficientes. Ainda nao ha chamada a provedor real de IA, payload estruturado completo em coluna propria nem assistente financeiro conversacional.

### Perfis financeiros / tenant operacional

- Dominio/API/UI: Parcial/Feito para gestao inicial de perfis financeiros.
- Documentacao: Parcial/Atualizada em `docs/TENANT.md`.
- Nota: existe tela `/configuracoes` para listar, criar, editar e arquivar perfis financeiros, com links para operar telas financeiras com `profileId` explicito. Ainda falta, se necessario, seletor global persistido em toda a aplicacao e evolucao multiusuario mais ampla.

### Autenticacao produtiva

- Decisao arquitetural: Feito; ADR 0004 aceita.
- Implementacao de provider/sessao produtiva: Pendente.
- Nota: a decisao define provider gerenciado OIDC/OAuth2, credenciais delegadas e sessao propria persistente/revogavel no SolverFin. A escolha concreta do fornecedor e a implementacao ficam para issues tecnicas derivadas.

### Relatorios

- UI: Parcial/Feito para a primeira visao de parcelas consolidadas.
- API/dominio especifico: Parcial; a tela usa `/api/installments` com filtros por periodo, cartao, categoria e status.
- Nota: `/relatorios` substitui o placeholder por uma consulta somente leitura de parcelas com indicadores de abertas/planejadas, postadas/fechadas, vencidas, futuras e total mensal, alem de agrupamentos por mes, cartao e categoria. Ainda faltam relatorios financeiros mais amplos para Dashboard, Extrato, Orcamentos, importacao e sugestoes revisaveis.

### Configuracoes

- UI: Parcial/Feito para estado inicial, perfis financeiros e regras automaticas.
- Nota: `/configuracoes` cobre gestao inicial de perfis financeiros e regras automaticas. Pode evoluir para preferencias, privacidade, consentimentos, automacoes avancadas e parametros de IA.

## Operacoes visiveis na UI

### Contas (`/contas`)

- Listar: Sim.
- Visualizar detalhe: Sim, por acao que consulta a API; nao ha tela dedicada.
- Criar: Sim.
- Editar: Sim.
- Arquivar/inativar: Sim.
- Restaurar/reativar: Nao aplicavel no contrato atual da UI.
- Excluir: Nao.
- Lacuna restante: tela dedicada de detalhe e restauracao, se o contrato evoluir nessa direcao.

### Categorias (`/categorias`)

- Listar: Sim.
- Visualizar detalhe: Sim, por acao que consulta a API; nao ha tela dedicada.
- Criar: Sim.
- Editar: Sim.
- Arquivar/inativar: Sim.
- Restaurar/reativar: Sim.
- Excluir: Nao.
- Lacuna restante: tela dedicada de detalhe.

### Extrato da conta (`/lancamentos`)

- Listar: Sim, agrupado por data.
- Visualizar detalhe: Sim, por acao que consulta a API; nao ha tela dedicada.
- Criar: Sim, por formulario/modal de novo lancamento ou compromisso previsto.
- Editar: Sim.
- Cancelar/estornar: Sim.
- Selecionar linhas simples e agrupadas: Sim, inclusive em uma selecao combinada.
- Conciliar/desconciliar em massa: Sim, para lancamentos efetivados ou conciliados elegiveis.
- Excluir logicamente em massa: Sim, para selecao simples, agrupada ou combinada.
- Excluir fisicamente: Nao.
- Decisao: chips de status sao indicadores de resumo, nao filtros interativos.

### Recorrencias e parcelas

- Recorrencias: aparecem nas listas normais de `/lancamentos` e `/cartoes`, sem rota propria.
- Criar recorrencia: Sim, pela repeticao "Fixo" no modal de novo lancamento ou nova compra.
- Editar/pausar/retomar/cancelar: Sim, pelo menu do lancamento/compra recorrente.
- Gerar parcelas: Sim, automaticamente no catch-up e manualmente pelo modal de edicao.
- Consultar parcelas na fatura: Sim, em `/cartoes`, no recorte do cartao/fatura selecionados.
- Consultar parcelas consolidadas: Sim, em `/relatorios`, com filtros por mes, cartao, categoria e status.
- Manutencao direta de parcelas geradas: Nao.
- Lacuna restante: manutencao direta controlada de parcelas ja geradas, quando o contrato permitir.

### Cartoes de Credito (`/cartoes`)

- Selecionar cartao agrupador: Sim.
- Selecionar fatura: Sim.
- Resumo da fatura: Sim.
- Registrar compra: Sim.
- Editar compra: Sim.
- Mover compra entre faturas/periodos: Sim, por acao visual que solicita `AAAA-MM` e chama o endpoint dedicado sem enviar `invoiceId`.
- Filtrar compras: Sim.
- Fechar fatura: Sim.
- Pagar fatura: Sim.
- Cadastro, edicao, bloqueio e arquivamento de cartao agrupador/instrumentos: Sim, em `/contas-cartoes`.
- Excluir: Nao.

### Orcamentos (`/orcamentos`)

- Listar: Sim.
- Visualizar detalhe/uso: Sim, por acao que consulta a API; nao ha tela dedicada.
- Criar: Sim.
- Editar: Sim.
- Arquivar/inativar: Sim.
- Excluir: Nao.
- Lacuna restante: tela dedicada de detalhe/uso.

### Relatorios (`/relatorios`)

- Consultar parcelas por periodo: Sim.
- Filtrar por cartao, categoria e status: Sim, conforme filtros aceitos pela API de parcelas.
- Ver indicadores consolidados: Sim, para abertas/planejadas, postadas/fechadas, vencidas, futuras e total mensal.
