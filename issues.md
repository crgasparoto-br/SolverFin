# SolverFin - Plano de issues e subissues

Este pacote organiza o backlog inicial do SolverFin para implementacao orientada por IA.

> Nota de manutencao: este backlog registra o plano inicial e pode conter termos historicos. A decisao #284 consolidou a rotina de pagar/receber em **Extrato da conta** e **Cartoes de Credito**. Para novas implementacoes, nao recrie uma tela operacional dedicada `/pagar-receber`; trate `PayableReceivable` como compatibilidade legada ate a transicao tecnica da #290.

## E01 - [EPIC] Fundacao documental e operacao por IA
Criar a base documental que permita que agentes de IA implementem o projeto com minimo retrabalho, maximo contexto e criterios claros.

- `D01` **Criar README principal orientado a produto e IA** - Criar README que explique o que e o SolverFin, como rodar, como testar e como contribuir com agentes de IA.
- `D02` **Criar docs/PRODUCT.md com visao, personas e escopo MVP** - Documentar a visao de produto para evitar que agentes implementem funcionalidades desalinhadas.
- `D03` **Criar docs/ARCHITECTURE.md e decisao inicial de stack** - Definir arquitetura inicial para orientar implementacoes por IA.
- `D04` **Criar AGENTS.md com regras globais para agentes de IA** - Criar instrucoes independentes de ferramenta para agentes como Codex, Copilot, Claude, Cursor e Gemini.
- `D05` **Criar .github/copilot-instructions.md** - Criar instrucoes especificas para GitHub Copilot e agentes no GitHub.
- `D06` **Criar templates de issue e pull request para tarefas de IA** - Padronizar entradas para que issues sejam implementaveis por IA.
- `D07` **Criar estrutura de ADRs e ADR-0001** - Registrar decisoes arquiteturais para reduzir ambiguidades em implementacoes futuras.

## E02 - [EPIC] Bootstrap tecnico do repositorio
Preparar o repositorio para desenvolvimento seguro, testavel e automatizado.

- `B01` **Inicializar monorepo e estrutura de pastas** - Criar estrutura inicial para frontend, backend, packages compartilhados e docs.
- `B02` **Configurar TypeScript, lint, formatacao e convencoes** - Configurar padroes de qualidade para evitar PRs inconsistentes gerados por IA.
- `B03` **Configurar Docker Compose para desenvolvimento local** - Permitir ambiente local reproduzivel para banco e servicos auxiliares.
- `B04` **Configurar CI inicial no GitHub Actions** - Bloquear regressao automatica em PRs de IA.
- `B05` **Configurar gerenciamento seguro de ambientes e secrets** - Padronizar variaveis de ambiente sem expor segredos.

## E03 - [EPIC] Dominio financeiro e persistencia
Modelar o nucleo financeiro do SolverFin com entidades consistentes, auditaveis e preparadas para automacao por IA.

- `F01` **Modelar entidades financeiras principais** - Definir modelo conceitual e tecnico do core financeiro.
- `F02` **Implementar schema Prisma e migrations iniciais** - Criar persistencia relacional do dominio financeiro.
- `F03` **Criar seed de categorias e dados de exemplo seguros** - Fornecer base inicial para testes e demonstracao sem dados reais.
- `F04` **Implementar auditoria de alteracoes financeiras** - Registrar mudancas criticas para rastreabilidade e confianca.

## E04 - [EPIC] Identidade, acesso e multi-tenant
Garantir login, isolamento de dados e contextos pessoal/MEI/negocio.

- `A01` **Implementar autenticacao inicial** - Permitir acesso seguro de usuarios ao SolverFin.
- `A02` **Implementar organizacoes, perfis financeiros e tenant** - Permitir separar contexto pessoal, familia, MEI e negocio.
- `A03` **Aplicar isolamento de dados e autorizacao por tenant** - Evitar vazamento de dados entre usuarios/perfis.

## E05 - [EPIC] Backend core financeiro MVP
Implementar APIs do controle financeiro essencial.

- `C01` **Implementar API de contas financeiras** - Permitir cadastro e manutencao de contas financeiras.
- `C02` **Implementar API de categorias e subcategorias** - Permitir classificar receitas e despesas.
- `C03` **Implementar API de lancamentos financeiros** - Criar o fluxo central de receitas, despesas e transferencias.
- `C04` **Implementar recorrencias e parcelamentos** - Suportar contas mensais, assinaturas e compras parceladas.
- `C05` **Implementar cartoes de credito e faturas** - Permitir controle basico de cartoes e faturas.
- `C06` **Implementar orcamentos, metas e alertas basicos** - Permitir controle mensal por categoria.
- `C07` **Implementar contrato legado de contas a pagar e a receber** - Suportar controle simples de vencimentos no backlog inicial; apos a #284, novos fluxos devem usar Extrato da conta, Cartoes de Credito, `Transaction` e `Invoice`.

## E06 - [EPIC] Frontend web/PWA MVP
Entregar interface simples, responsiva e mobile-first para uso diario.

- `W01` **Criar design system inicial e componentes base** - Padronizar UI para acelerar implementacao por IA.
- `W02` **Implementar shell da aplicacao e navegacao** - Criar base de navegacao web/PWA.
- `W03` **Implementar dashboard financeiro inicial** - Mostrar visao rapida da saude financeira.
- `W04` **Implementar telas de contas, cartoes e categorias** - Permitir configuracao financeira inicial pelo usuario.
- `W05` **Implementar telas de lancamentos e filtros** - Permitir uso diario do controle financeiro.
- `W06` **Implementar relatorios iniciais e orcamento mensal** - Fornecer analise visual basica.

## E07 - [EPIC] Importacao, automacao e conciliacao
Reduzir lancamentos manuais por importacoes, regras, deteccao de duplicidade e conciliacao.

- `I01` **Implementar importacao CSV e OFX inicial** - Permitir importar extratos sem integracao bancaria direta no MVP.
- `I02` **Implementar inbox de mensagens bancarias coladas ou compartilhadas** - Criar entrada manual/semi-automatica para mensagens de bancos e cartoes.
- `I03` **Implementar motor de deduplicacao de transacoes** - Evitar lancamentos duplicados vindos de multiplas fontes.
- `I04` **Implementar conciliacao entre previsto, importado e realizado** - Automatizar fechamento de contas previstas com transacoes reais.
- `I05` **Implementar regras automaticas configuraveis** - Permitir automacoes deterministicas antes de chamar IA.
- `I06` **Criar estudo tecnico de Open Finance via parceiro** - Avaliar caminho regulatorio e tecnico para Open Finance sem comprometer MVP.

## E08 - [EPIC] IA financeira aplicada
Criar camada de IA explicavel para extrair, classificar, conciliar e responder perguntas financeiras.

- `AI01` **Criar abstracao de provedores de IA e politicas de uso** - Permitir trocar provedor/modelo sem acoplar dominio financeiro.
- `AI02` **Definir schemas estruturados para extracao de lancamentos** - Garantir respostas parseaveis e auditaveis da IA.
- `AI03` **Implementar parser de mensagens bancarias com IA e fallback por regras** - Transformar textos de notificacoes/SMS/e-mail em sugestoes de lancamento.
- `AI04` **Implementar categorizacao inteligente e aprendizado por correcao** - Melhorar classificacao conforme historico do usuario.
- `AI05` **Implementar fila de revisao de sugestoes da IA** - Dar controle ao usuario antes da automacao total.
- `AI06` **Implementar assistente financeiro de perguntas e respostas** - Permitir perguntas em linguagem natural sobre dados financeiros do usuario.
- `AI07` **Implementar insights, anomalias e resumo mensal** - Gerar alertas e analises acionaveis.

## E09 - [EPIC] Experiencia mobile e captura de mensagens
Preparar canais moveis para captura de lancamentos com minima friccao.

- `M01` **Garantir experiencia PWA mobile-first** - Permitir uso confortavel no celular mesmo antes de app nativo.
- `M02` **Implementar Web Share Target ou fluxo equivalente de compartilhamento** - Receber textos/comprovantes compartilhados para o SolverFin.
- `M03` **Prototipar captura Android de notificacoes bancarias com consentimento** - Avaliar diferencial de captura automatica de notificacoes no Android.

## E10 - [EPIC] Seguranca, LGPD e privacidade financeira
Incorporar privacidade como requisito central do produto financeiro.

- `S01` **Implementar modelo de consentimento e preferencias de privacidade** - Registrar consentimentos para importacoes, IA e processamento de mensagens.
- `S02` **Aplicar mascaramento de dados financeiros sensiveis** - Reduzir exposicao de dados como conta, cartao, identificadores e mensagens brutas.
- `S03` **Criar politica de retencao, exportacao e exclusao de dados** - Documentar direitos do usuario e operacao de dados.
- `S04` **Implementar exclusao logica e trilha de auditoria segura** - Evitar perda acidental e preservar rastreabilidade.

## E11 - [EPIC] Qualidade, observabilidade e operacao
Garantir manutencao, confiabilidade, monitoramento e evolucao segura.

- `Q01` **Configurar estrategia de testes unitarios, integracao e e2e** - Definir piramide de testes para agentes trabalharem com seguranca.
- `Q02` **Implementar observabilidade basica e tratamento de erros** - Facilitar diagnostico por humanos e IA.
- `Q03` **Implementar checks de acessibilidade e performance inicial** - Garantir qualidade minima da experiencia.
- `Q04` **Criar playbook de troubleshooting para agentes de IA** - Ajudar agentes a corrigirem falhas comuns de build, teste e ambiente.

## E12 - [EPIC] Integracoes SolverIT e plano profissional/MEI
Conectar SolverFin ao ecossistema SolverIT: Agenda Profissional, Limite MEI e exportacoes para contador.

- `G01` **Definir contrato de integracao com Agenda Profissional** - Planejar como atendimentos/servicos geram lancamentos previstos ou receitas no Extrato da conta.
- `G02` **Definir contrato de integracao com Limite MEI** - Planejar como receitas do SolverFin alimentam controle do limite MEI.
- `G03` **Implementar exportacao para contador e relatorios MEI** - Gerar saidas uteis para usuario profissional.
