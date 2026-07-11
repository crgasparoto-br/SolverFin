# Documentacao do SolverFin

Este indice define a documentacao viva do projeto. Use estes documentos como fonte de contexto antes de implementar issues, revisar PRs ou criar novas especificacoes.

Arquivos historicos de geracao de backlog nao fazem parte da documentacao viva. Issues abertas no GitHub sao a fonte de verdade para planejamento atual.

## Leitura obrigatoria

- [`../README.md`](../README.md): visao operacional do repositorio, comandos, CI, estrutura e regras de trabalho.
- [`../AGENTS.md`](../AGENTS.md): regras globais para agentes de IA.
- [`../.github/copilot-instructions.md`](../.github/copilot-instructions.md): instrucoes especificas para Copilot e agentes GitHub.
- [`PRODUCT.md`](./PRODUCT.md): visao de produto, personas, jornadas, escopo MVP, principios e limites.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md): arquitetura atual, boundaries, stack-alvo, privacidade, CI e regras tecnicas.
- [`STATUS_MATRIX.md`](./STATUS_MATRIX.md): estado observado do MVP por area e lacunas conhecidas.
- [`adr/README.md`](./adr/README.md): processo e indice de ADRs.

## Produto, UX e identidade

- [`PRODUCT.md`](./PRODUCT.md): escopo e principios do produto.
- [`BRAND.md`](./BRAND.md): identidade, tom, experiencia e direcao visual.
- [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md): tokens, componentes e orientacoes de interface.
- [`WEB_MAINTENANCE_COVERAGE.md`](./WEB_MAINTENANCE_COVERAGE.md): cobertura esperada de manutencao web.

## Arquitetura, seguranca e operacao

- [`ARCHITECTURE.md`](./ARCHITECTURE.md): arquitetura geral e regras tecnicas.
- [`CONVENTIONS.md`](./CONVENTIONS.md): convencoes de TypeScript, organizacao, lint e formatacao.
- [`ENVIRONMENT.md`](./ENVIRONMENT.md): variaveis de ambiente, secrets e validacao segura.
- [`PRIVACY.md`](./PRIVACY.md): politica operacional de privacidade, retencao, minimizacao e mascaramento.
- [`AUTH.md`](./AUTH.md): autenticacao MVP e direcao produtiva.
- [`TENANT.md`](./TENANT.md): organizacoes, perfis financeiros e isolamento de dados.

## Dominio financeiro

- [`DOMAIN_MODEL.md`](./DOMAIN_MODEL.md): modelo conceitual e tecnico do core financeiro.
- [`CARDS.md`](./CARDS.md): cartoes agrupadores/faturas e instrumentos internos.
- [`ACCOUNT_REMUNERATION_CDI.md`](./ACCOUNT_REMUNERATION_CDI.md): remuneracao prevista de contas com CDI e base compartilhada de indices financeiros.
- [`RECURRENCES_INSTALLMENTS_WEB.md`](./RECURRENCES_INSTALLMENTS_WEB.md): recorrencias e parcelas na web.
- [`PAYABLES_RECEIVABLES.md`](./PAYABLES_RECEIVABLES.md): contrato legado consolidado de contas a pagar/receber.
- [`PAYABLES_RECEIVABLES_TRANSITION.md`](./PAYABLES_RECEIVABLES_TRANSITION.md): plano de transicao segura do legado.

## Importacao, automacao, conciliacao e IA

- [`IMPORTS.md`](./IMPORTS.md): importacao CSV/OFX e contratos iniciais.
- [`BANK_MESSAGE_INBOX.md`](./BANK_MESSAGE_INBOX.md): Inbox de mensagens bancarias e consentimento.
- [`DETERMINISTIC_DEDUP_RECONCILIATION.md`](./DETERMINISTIC_DEDUP_RECONCILIATION.md): deduplicacao e conciliacao deterministicas.
- [`AUTOMATION_RULES.md`](./AUTOMATION_RULES.md): regras automaticas configuraveis.
- [`AI_REVIEW_QUEUE.md`](./AI_REVIEW_QUEUE.md): fila de sugestoes revisaveis.
- [`ai/extraction-schema.md`](./ai/extraction-schema.md): schema de extracao de lancamentos por IA.

## ADRs

ADRs registram decisoes duradouras. Crie ou atualize ADRs quando a mudanca alterar stack, provider, integracao externa, modelo persistente ou decisao arquitetural relevante.

- [`adr/0001-stack-inicial.md`](./adr/0001-stack-inicial.md)
- [`adr/0004-autenticacao-produtiva.md`](./adr/0004-autenticacao-produtiva.md)

## Regras de manutencao documental

- Evite duplicar contratos extensos entre documentos. Quando necessario, escolha um documento dono e referencie-o nos demais.
- Documentos com sufixo `.draft` nao devem permanecer versionados depois que o conteudo estiver consolidado.
- Planos antigos de criacao de issues devem ser removidos quando as issues ja estiverem no GitHub.
- Atualize a matriz de status quando uma issue mudar o estado real de dominio, API, persistencia, UI, testes ou documentacao.
- Nao inclua dados financeiros reais, tokens, chaves, numeros completos de conta/cartao ou mensagens bancarias sensiveis em documentacao, exemplos ou screenshots.
