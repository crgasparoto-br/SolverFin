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
- `docs/IMPORTS.md`
- `docs/DETERMINISTIC_DEDUP_RECONCILIATION.md`
- `docs/AI_REVIEW_QUEUE.md`
- `docs/BANK_MESSAGE_INBOX.md`
- `docs/AUTOMATION_RULES.md`
- `docs/PAYABLES_RECEIVABLES.md`
- `docs/API_PAYABLES_RECEIVABLES.md`
- `docs/WEB_MAINTENANCE_COVERAGE.md`
- PRs relacionadas ao estado atual: #190, #191, #192, #194, #197, #198, #302, #304 e #338.

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
- UI: Parcial.
- Testes: integracao feita; unitarios parciais.
- Documentacao: Parcial.
- Nota: web preserva Extrato da conta com resumo, agrupamento por data, criacao, detalhe via acao, edicao e cancelamento/estorno. Tambem e a tela ativa para compromissos previstos de conta corrente.
- Lacuna restante: decidir se os chips de status serao filtros interativos ou apenas indicadores.

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
- Documentacao: Feito para o modelo atual de cartao agrupador em `docs/CARDS.md`.
- Nota: cadastro/manutencao do cartao agrupador fica em Contas e Cartoes; `/cartoes` cobre compra, fatura, conciliacao, fechamento e pagamento, e e a tela ativa para compromissos de cartao.
- Lacuna restante: mover uma compra para outra fatura/periodo pela UI.

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
- Repository/API: Parcial/Feito para CSV persistido.
- UI: Pendente para preview e aceite/rejeicao amigavel.
- Testes: Parcial.
- Documentacao: Parcial/Atualizada em `docs/IMPORTS.md`.
- Nota: CSV ja possui primeiro fluxo persistido por lote, endpoints `/api/import-batches`, `/api/import-batches/csv` e consulta de lote. OFX segue no dominio/parser inicial, ainda sem persistencia/API operacional. Ainda falta tela de preview, aceite/rejeicao estruturado, politica final de retencao de arquivos brutos e criacao final de lancamentos a partir das sugestoes.

### Inbox de mensagens bancarias

- Dominio/API/persistencia: Parcial/Feito para fluxo inicial.
- UI: Parcial/Feito para tela inicial e fila de revisao integrada.
- Testes: Parcial.
- Documentacao: Feito em `docs/BANK_MESSAGE_INBOX.md`.
- Nota: `/inbox` permite colar mensagem, confirmar consentimento, selecionar conta/categoria opcionais, gerar sugestao revisavel e revisar sugestoes pendentes. O texto bruto e descartado apos normalizacao, hash e mascaramento.

### Deduplicacao

- Dominio: Feito.
- Schema/repository/API: Parcial/Feito para fluxo deterministico inicial em lotes CSV.
- UI: Parcial/Feito para revisao operacional via Inbox.
- Testes: Parcial.
- Documentacao: Feito em `docs/DETERMINISTIC_DEDUP_RECONCILIATION.md`.
- Nota: `POST /api/import-batches/:importBatchId/detect-duplicates` cria sugestoes revisaveis `deduplication`/`reconciliation` em `AiSuggestion`. A Inbox lista as sugestoes e permite aprovar/rejeitar; aprovacao de duplicidade registra revisao, sem alterar lancamentos automaticamente.

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

- UI: Pendente/placeholder.
- API/dominio especifico: Pendente para relatorios iniciais dedicados.
- Nota: o MVP ainda precisa substituir o placeholder por relatorios financeiros iniciais coerentes com Dashboard, Extrato, Cartoes, Orcamentos, importacao e sugestoes revisaveis.

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
- Excluir: Nao.
- Lacuna restante: decidir se chips de status viram filtros interativos.

### Recorrencias e parcelas

- Recorrencias: aparecem nas listas normais de `/lancamentos` e `/cartoes`, sem rota propria.
- Criar recorrencia: Sim, pela repeticao "Fixo" no modal de novo lancamento ou nova compra.
- Editar/pausar/retomar/cancelar: Sim, pelo menu do lancamento/compra recorrente.
- Gerar parcelas: Sim, automaticamente no catch-up e manualmente pelo modal de edicao.
- Lacuna restante: consulta historica dedicada e manutencao direta de parcelas ja geradas.

### Cartoes de Credito (`/cartoes`)

- Selecionar cartao agrupador: Sim.
- Selecionar fatura: Sim.
- Resumo da fatura: Sim.
- Registrar compra: Sim.
- Editar compra: Sim.
- Filtrar compras: Sim.
- Fechar fatura: Sim.
- Pagar fatura: Sim.
- Cadastro, edicao, bloqueio e arquivamento de cartao agrupador/instrumentos: Sim, em `/contas-cartoes`.
- Excluir: Nao.
- Lacuna restante: mover compra para outra fatura/periodo pela UI.

### Orcamentos (`/orcamentos`)

- Listar: Sim.
- Visualizar detalhe/uso: Sim, por acao que consulta a API; nao ha tela dedicada.
- Criar: Sim.
- Editar: Sim.
- Arquivar/inativar: Sim.
- Excluir: Nao.
- Lacuna restante: tela dedicada de detalhe/uso.

### Importacao, inbox e revisao

- CSV persistido: Sim, por API.
- OFX persistido: Nao.
- Preview/aceite amigavel de importacao na UI: Nao.
- Inbox de mensagens bancarias: Sim, fluxo inicial em `/inbox`.
- Fila de revisao por API: Sim, em `/api/ai-review-queue`.
- Fila de revisao na UI: Parcial, integrada na Inbox.
- Deduplicacao/conciliacao deterministica por API: Sim, para lote CSV.
- Revisao de deduplicacao/conciliacao na UI: Sim, via Inbox.
- Cadastro de regras automaticas pelo usuario: Sim, fluxo inicial em Configuracoes.
- Provedor real de IA: Pendente.

## Ambiguidades e encaminhamentos

- Exclusao fisica de dados financeiros nao aparece como padrao atual; a arquitetura favorece exclusao logica, arquivamento, inativacao ou cancelamento auditavel.
- Chips de status do Extrato da conta existem visualmente, mas ainda precisam ser confirmados como filtros interativos ou indicadores.
- Autenticacao produtiva tem ADR aceita, mas provider real e sessao persistente ainda precisam ser implementados.
- Gestao de perfis financeiros existe em `/configuracoes`, mas seletor global persistido e multiusuario avancado seguem fora do fluxo atual.
- A transicao de `PayableReceivable` tem plano documentado, mas o dominio/API legado permanece por compatibilidade.
- Importacao, deduplicacao, conciliacao, inbox, regras automaticas e fila revisavel ja possuem primeiras APIs/fluxos; as principais lacunas agora sao preview de importacao amigavel, OFX operacional, payload estruturado completo das sugestoes e politica operacional final de privacidade/retencao.

## Proximas implementacoes sugeridas

1. Criar UI de preview/revisao especifica para importacoes CSV antes da fila geral.
2. Evoluir payload estruturado de `AiSuggestion` para aplicar categorizacao e regras com efeito especifico apos revisao.
3. Implementar relatorios iniciais no lugar do placeholder.
4. Adicionar consulta historica dedicada de parcelas por recorrencia.
5. Evoluir telas dedicadas de detalhe/uso para contas, categorias, lancamentos, cartoes e orcamentos.
6. Implementar provider real de autenticacao produtiva e sessao persistente/revogavel.
7. Consolidar consentimentos, retencao, mascaramento e exportacao/exclusao antes de ampliar IA e importacoes com dados sensiveis.
