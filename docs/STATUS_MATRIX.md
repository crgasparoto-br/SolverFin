# Matriz de status do MVP

Esta matriz registra o estado observado no candidato atual para reduzir ambiguidade antes de novas implementacoes. Ela diferencia capacidade existente no dominio/API de operacao realmente acessivel na web navegavel.

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
- `docs/AI_SUGGESTION_PAYLOADS.md`
- `docs/FINANCIAL_INSIGHTS.md`
- `docs/ai/category-learning.md`
- `docs/ai/extraction-schema.md`
- `docs/ai/providers.md`
- `docs/adr/0010-openai-provider-inicial.md`
- `docs/ENVIRONMENT.md`
- `docs/BANK_MESSAGE_INBOX.md`
- `docs/AUTOMATION_RULES.md`
- `docs/PAYABLES_RECEIVABLES.md`
- `docs/API_PAYABLES_RECEIVABLES.md`
- `docs/WEB_MAINTENANCE_COVERAGE.md`
- `docs/API_CARD_PURCHASE_INVOICE_PERIOD_MOVE.md`
- `docs/API_REPORTS.md`
- PRs relacionadas ao estado atual: #190, #191, #192, #194, #197, #198, #302, #304, #338, #411, #412, #414, #531, a entrega da issue #548, a PR #570 para a issue #561, a entrega da issue #562, a PR #572 para a issue #563, a entrega da issue #564, a entrega da issue #565, a entrega da issue #566 e o candidato da issue #567.

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
- Repository/API/UI: Feito para criação manual canônica, identificação nas listas operacionais e manutenção conservadora de parcelas de conta.
- Testes: contrato web, fronteira pública, concorrência com PostgreSQL e validação visual dedicada fazem parte do fluxo atual.
- Documentacao: Feito para o fluxo atual.
- Nota: parcelas canônicas aparecem incorporadas às linhas de `/lancamentos` e `/cartoes` como `Parcela X de Y`, sem painel ou rota próprios. O modo manual `Repeticao = Parcelado` do Extrato envia uma única criação para `POST /api/installments`, persiste `Installment` e `Transaction.installmentId` de forma atômica e idempotente, preserva descrição e observação separadas e aplica imediatamente o indicador e a manutenção conservadora entregue pela #539. O Extrato permite alterar somente descrição, observação e categoria quando a parcela está elegível e preserva as ações operacionais de conciliar, desconciliar e excluir logicamente; Cartões mantém a compra como único ponto de manutenção operacional. O enriquecimento do Extrato acompanha a data operacional exibida, inclusive quando ela diverge de `dueOn`. `/relatorios` continua somente leitura.

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
- Schema/migration: Feito; o schema de importacao permanece e a issue #564 adiciona persistencia tenant-scoped para aprendizado de categoria.
- Repository/API: Feito para CSV e OFX persistidos, revisaveis, conectados a categorizacao inteligente, integrados à fila unificada e comparados pelo detector determinístico generalizado sem contornar o fluxo canônico de importação.
- UI: Feito para preview, criacao, historico misto, revisao por lote e participação de extrações/candidaturas na fila unificada da Inbox.
- Testes: unitarios de parser e contrato web; integracao PostgreSQL para persistencia, concorrencia, isolamento, idempotencia, ciclo de revisao, privacidade, aprendizado de categoria e ausência de sentinelas em logs; a issue #565 acrescenta contrato da fila e efeitos tipados e a #566 cobre as quatro origens no mesmo scanner.
- Documentacao: Feito em `docs/IMPORTS.md`, `docs/DETERMINISTIC_DEDUP_RECONCILIATION.md`, `docs/AI_REVIEW_QUEUE.md` e `docs/ai/category-learning.md`.
- Nota: CSV e OFX possuem preview sem persistencia, historico, correcao por linha, aprovacao individual/em conjunto, rejeicao, descarte logico e criacao atomica de lancamentos. A fila unificada usa `expectedFingerprint`; edição da origem ou mudança do alvo torna candidaturas antigas obsoletas. O arquivo bruto nunca e persistido, logado ou auditado.

### Inbox de mensagens bancarias

- Dominio/API/persistencia: Feito para regras deterministicas, extracao assistida por provider configurado, categorizacao inteligente posterior e participação no detector determinístico generalizado.
- UI: Feito para entrada autorizada, fila unificada de revisao, filtros por tipo/estado/confiança, origem da extracao/categorizacao, baixa confianca, diagnosticos, edição tipada e recuperação de falha temporaria.
- Testes: unitarios do parser e do consumidor, contrato web e integracao PostgreSQL para consentimento, privacidade, isolamento, concorrencia, idempotencia, aprendizado e retry; a issue #565 acrescenta versão otimista e efeitos por tipo e a #566 valida a mesma detecção usada por importações e IA.
- Documentacao: Feito em `docs/BANK_MESSAGE_INBOX.md`, `docs/DETERMINISTIC_DEDUP_RECONCILIATION.md`, `docs/AI_REVIEW_QUEUE.md`, `docs/ai/category-learning.md`, `docs/ai/extraction-schema.md` e `docs/ai/providers.md`.
- Nota: `/inbox` tenta regras deterministicas antes do provider para extracao. Depois da criação da `transaction_extraction`, regra e provider entram no mesmo scanner por payload/fingerprint, sem reter texto bruto e sem algoritmo específico por origem.

### Deduplicacao

- Dominio: Feito.
- Schema/repository/API: Feito para qualquer `transaction_extraction` estruturada pendente de CSV, OFX, mensagem bancária ou IA, com payload `deduplication` V1 no envelope canonico.
- UI: Feito para revisão pela fila unificada da Inbox, sem edição arbitrária de payload.
- Testes: unitarios e integracao PostgreSQL para fingerprint, legado, obsolescencia, decisão atomica, varredura concorrente, isolamento e transferência rígida.
- Documentacao: Feito em `docs/DETERMINISTIC_DEDUP_RECONCILIATION.md`, `docs/AI_REVIEW_QUEUE.md`, `docs/BANK_MESSAGE_INBOX.md` e `docs/IMPORTS.md`.
- Nota: a varredura generalizada cria candidaturas idempotentes com vinculo estruturado à origem e ao alvo. Aprovar duplicidade rejeita a origem, expira irmãs e não cria nem atualiza `Transaction`; alvo ou origem alterados bloqueiam a decisão obsoleta.

### Conciliacao

- Dominio: Feito.
- Schema/repository/API: Feito para conciliação determinística generalizada e payload `reconciliation` V1 no envelope canonico.
- UI: Feito para revisão pela fila unificada da Inbox; indicadores continuam no Extrato.
- Testes: unitarios e integracao PostgreSQL para fingerprint, legado, obsolescencia, concorrencia, isolamento, rollback e regra de transferência.
- Documentacao: Feito em `docs/DETERMINISTIC_DEDUP_RECONCILIATION.md`, `docs/AI_REVIEW_QUEUE.md`, `docs/BANK_MESSAGE_INBOX.md` e `docs/IMPORTS.md`.
- Nota: a aprovação revalida origem/fingerprint e a versão do alvo, marca o lançamento como `reconciled`, resolve a origem, expira irmãs, atualiza lote quando houver e registra auditoria na mesma transação compartilhada.

### Regras automaticas

- Dominio: Feito.
- Schema/repository/API/UI: Feito para fluxo operacional revisavel, com sugestao `categorization` V1 tipada e precedencia sobre aprendizado, historico e IA.
- Testes: unitarios e integracao do produtor estruturado; a issue #564 acrescenta cobertura de precedencia e conflitos de aprendizado e a #565 cobre edição/decisão da candidatura pela fila geral.
- Documentacao: Feito em `docs/AUTOMATION_RULES.md`, `docs/AI_REVIEW_QUEUE.md` e `docs/ai/category-learning.md`.
- Nota: `AutomationRule` persiste regras por perfil financeiro; `/api/automation-rules` lista/cria/atualiza/inativa/aplica regras. `Configuracoes` administra regras e a Inbox revisa a candidatura gerada, sem duplicar o motor de automação.

### IA / sugestoes revisaveis

- Dominio: Feito para a uniao discriminada e versionada de `transaction_extraction`, `categorization`, `deduplication`, `reconciliation` e `insight`, incluindo `insight` V2 com evidências numéricas, limitações e navegação.
- Schema/migration: Feito com payload JSON canonico, validacao estrita no dominio e PostgreSQL, fingerprint, migracao conservadora de variantes legadas compativeis, persistencia de aprendizado de categoria e validação específica do payload `insight` V2.
- Provider real e executor seguro: Feito para infraestrutura substituivel em `@solverfin/ai`, com `OpenAiProvider`, configuracao ambiental, provider desativado por padrao, consentimento revalidado, timeout, retry tipado, health check local e logs redigidos. Para insights, provider é opcional e restrito à narrativa; os números são calculados antes da chamada externa.
- Repository/API: Feito para leitura tipada, projeção escopada/redigida, decisão transacional comum, `expectedFingerprint`, edição permitida por tipo, efeitos tipados, idempotência, isolamento por organização/perfil/moeda, auditoria correlacionada, detector determinístico generalizado para extrações e geração determinística/idempotente de insights com `financial-insights-v2` e fingerprint do snapshot.
- UI: Feito para fila unificada na Inbox com filtros `kind/status/confidence/profileId`, detalhe tipado, edição de `transaction_extraction`/`categorization`, aprovação/rejeição, baixa confiança, conflito de versão, carregamento, vazio, erro e retry; insights V2 exibem evidências verificáveis, limitações e navegação para a área financeira relacionada.
- Fluxos de produto com provider real: Feito para extracao da Inbox de mensagens bancarias e para categorizacao de qualquer origem que produza `transaction_extraction` estruturada. Deduplicação/conciliação também são independentes da origem após a estruturação. O assistente conversacional permanece fora deste recorte. `insight` possui geração proativa determinística, persistida e revisável; provider opcional permanece apenas narrativo.
- Testes: unitarios dos schemas, normalizadores, precedencia e consumidor da Inbox; integração PostgreSQL para migration, legado, imutabilidade, concorrencia, isolamento, privacidade, idempotencia, aprendizado e retry; a issue #565 acrescenta integração de categorização/versionamento/insight, a #566 acrescenta origens CSV/OFX/mensagem/IA, alvo obsoleto, transferência rígida e rollback e a #567 cobre limiares numéricos, falsos positivos, multimoeda, pendências, payload V2, persistência idempotente, provider indisponível e renderização web.
- Documentacao: Feito em `docs/AI_SUGGESTION_PAYLOADS.md`, `docs/AI_REVIEW_QUEUE.md`, `docs/FINANCIAL_INSIGHTS.md`, `docs/AUTOMATION_RULES.md`, `docs/DETERMINISTIC_DEDUP_RECONCILIATION.md`, `docs/BANK_MESSAGE_INBOX.md`, `docs/IMPORTS.md`, `docs/ai/assistant-and-insights.md`, `docs/ai/category-learning.md`, `docs/ai/extraction-schema.md`, `docs/ai/providers.md`, `docs/ENVIRONMENT.md` e ADR 0010.
- Nota: `/api/ai-review-queue` lista sugestoes, atualiza candidaturas determinísticas e insights financeiros vigentes para o perfil ativo, retorna detalhe tipado e permite aprovar, editar ou rejeitar conforme o tipo. A mesma decisão repetida converge para o recurso resolvido quando idempotente; versão obsoleta, origem descartada ou alvo inválido falha antes de qualquer efeito parcial. `explanation` continua apenas apresentacional.

### Perfis financeiros / tenant operacional

- Dominio/API/UI: Parcial/Feito para gestao inicial de perfis financeiros.
- Documentacao: Parcial/Atualizada em `docs/TENANT.md`.
- Nota: existe tela `/configuracoes` para listar, criar, editar e arquivar perfis financeiros, com links para operar telas financeiras com `profileId` explicito. Ainda falta, se necessario, seletor global persistido em toda a aplicacao e evolucao multiusuario mais ampla.

### Autenticacao produtiva

- Decisao arquitetural: Feito; ADR 0004 aceita.
- Implementacao de provider/sessao produtiva: Feito no código e na migration; ativação operacional depende da criação do User Pool/app client e dos secrets de cada ambiente.
- Nota: Amazon Cognito User Pools Essentials em `sa-east-1`, Authorization Code + PKCE iniciado no backend, correlação persistente de uso único, sessão local em cookie seguro, rotação, revogação, auditoria e proteção de origem. Contratos locais/Bearer permanecem apenas para ambientes autorizados.

### Relatorios

- UI: Feito para Evolucao por categoria e Parcelas consolidadas em `/relatorios`.
- API/dominio especifico: Feito para `GET /api/reports/category-evolution`; parcelas continuam usando `/api/installments`.
- Testes: unitarios e web cobrem periodos, calculos, hierarquia, moedas, filtros, estados SSR e regressao de parcelas; integracao PostgreSQL permanece no gate geral do repositorio.
- Documentacao: Feito em `docs/REPORTS.md` e `docs/API_REPORTS.md`.
- Nota: a evolucao agrega `Transaction` realizada por `occurredOn`, tenant, categoria e moeda, sem conversao ou dupla contagem. A selecao de visao e os filtros ficam na URL, e a interface permanece somente leitura.

### Configuracoes

- UI: Parcial/Feito para estado inicial, perfis financeiros, regras automaticas e aprendizado de categoria.
- Nota: `/configuracoes?section=rules` cobre regras e aprendizados do perfil, incluindo aplicar categorizacao, ignorar e reverter sinais. Pode evoluir para preferencias, privacidade, consentimentos, automacoes avancadas e parametros de IA.

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
- Gerar parcelas: Sim, automaticamente no catch-up de recorrencias e manualmente por `Repeticao = Parcelado` no modal de novo lancamento.
- Consultar parcelas na fatura: Sim, em `/cartoes`, no recorte do cartao/fatura selecionados.
- Consultar parcelas consolidadas: Sim, em `/relatorios`, com filtros por mes, cartao, categoria e status.
- Manutencao direta de parcelas geradas: Sim, de forma conservadora no Extrato para descricao, observacao e categoria quando `editable=true`.
- Limite: quantidade, sequencia, vencimento, valor e redistribuicao nao podem ser alterados pelo `PATCH` conservador.

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

- Consultar evolucao por categoria: Sim, por intervalo mensal, anual ou anual com inicio movel.
- Consultar parcelas por periodo: Sim.
- Filtrar evolucao por inicio e quantidade de periodos: Sim.
- Filtrar parcelas por cartao, categoria e status: Sim, conforme filtros aceitos pela API de parcelas.
- Ver moedas separadas, totais, medias, percentuais e hierarquia atual: Sim.
- Ver indicadores consolidados de parcelas: Sim, para abertas/planejadas, postadas/fechadas e total mensal.
