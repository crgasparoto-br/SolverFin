# SolverFin

SolverFin e o controle financeiro inteligente da SolverIT para pessoas, familias, MEIs, profissionais autonomos e pequenos negocios.

O produto combina organizacao financeira, importacao de dados, regras deterministicas e IA explicavel para reduzir lancamentos manuais, apoiar conciliacao e transformar informacoes financeiras em decisoes claras. A automacao deve sempre preservar revisao humana, privacidade, LGPD, rastreabilidade e separacao entre contextos pessoais, profissionais e empresariais.

## Status do repositorio

Este repositorio esta na fase de fundacao documental e bootstrap tecnico. A estrutura inicial de monorepo com npm workspaces ja esta definida, mas os apps e pacotes ainda possuem scripts placeholder ate as proximas issues de configuracao TypeScript, lint, testes, apps, Docker e CI.

## Stack inicial planejada

A stack inicial registrada em `docs/ARCHITECTURE.md` e `docs/adr/0001-stack-inicial.md` e:

- TypeScript;
- npm workspaces;
- monorepo para frontend, backend e pacotes compartilhados;
- frontend web/PWA mobile-first;
- backend API modular;
- PostgreSQL;
- Prisma para ORM e migrations;
- testes automatizados por camada;
- GitHub Actions para CI quando o bootstrap tecnico existir;
- camada propria para IA com schemas estruturados, validacao e logs seguros.

Frameworks concretos de frontend/backend, autenticacao, runtime e provedores de IA serao definidos em issues de bootstrap ou ADRs complementares.

## Comandos atuais

Requisitos locais:

- Node.js 22 ou superior;
- npm 10 ou superior.

Instalar dependencias:

```bash
npm install
```

Executar validacao raiz:

```bash
npm run validate
```

Comandos disponiveis:

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run validate
```

Nesta etapa, os comandos chamam scripts dos workspaces com placeholders controlados. As configuracoes reais de TypeScript, lint, testes e build entram nas proximas subissues de bootstrap.

## Documentos principais

Leia estes documentos antes de implementar qualquer issue:

- `docs/PRODUCT.md`: visao de produto, personas, jornadas, escopo MVP, fases e limites.
- `docs/ARCHITECTURE.md`: arquitetura inicial, stack-alvo e regras tecnicas.
- `docs/BRAND.md`: identidade visual, tom e direcao de interface.
- `docs/adr/README.md`: processo de ADRs.
- `docs/adr/0001-stack-inicial.md`: decisao inicial de stack e arquitetura.
- `AGENTS.md`: regras globais para agentes de IA.
- `.github/copilot-instructions.md`: instrucoes especificas para Copilot e agentes GitHub.

## Como trabalhar nas issues

1. Leia a issue e confirme objetivo, escopo, fora de escopo e criterios de aceite.
2. Consulte os documentos centrais e ADRs relacionados.
3. Localize arquivos existentes antes de criar novos.
4. Implemente uma mudanca pequena, rastreavel e coerente com a issue.
5. Atualize documentacao quando alterar produto, arquitetura, contrato, modelo de dados, fluxo ou decisao relevante.
6. Execute as validacoes disponiveis no repositorio e registre o resultado na PR.

## Estrutura inicial

```text
.
|-- AGENTS.md
|-- README.md
|-- package.json
|-- apps/
|   |-- api/
|   |   `-- package.json
|   `-- web/
|       `-- package.json
|-- packages/
|   |-- ai/
|   |   `-- package.json
|   |-- config/
|   |   `-- package.json
|   |-- domain/
|   |   `-- package.json
|   `-- shared/
|       `-- package.json
|-- prisma/
|   `-- README.md
|-- scripts/
|   `-- README.md
|-- docs/
|   |-- ARCHITECTURE.md
|   |-- BRAND.md
|   |-- PRODUCT.md
|   `-- adr/
|       |-- README.md
|       `-- 0001-stack-inicial.md
|-- .github/
|   |-- copilot-instructions.md
|   |-- ISSUE_TEMPLATE/
|   |   `-- ai_task.yml
|   `-- pull_request_template.md
|-- issues.md
|-- issues.json
`-- issue-bodies/
```

## Responsabilidades dos workspaces

- `apps/web`: aplicacao web/PWA mobile-first.
- `apps/api`: API backend modular.
- `packages/domain`: regras e entidades do dominio financeiro, sem acoplamento direto a UI, banco ou IA.
- `packages/shared`: tipos, utilitarios e contratos compartilhados.
- `packages/ai`: abstracoes de IA, schemas estruturados e politicas de uso seguro.
- `packages/config`: configuracoes compartilhadas de ferramentas.
- `prisma`: schema, migrations e seeds quando a persistencia for implementada.
- `scripts`: automacoes auxiliares seguras do repositorio.

## Privacidade e seguranca

SolverFin lida com dados financeiros. Nunca inclua dados reais de clientes, numeros completos de cartao ou conta, tokens, chaves, mensagens bancarias sensiveis, prints com dados privados ou fixtures que permitam identificar uma pessoa.

Exemplos devem ser ficticios, minimizados e seguros por padrao.

## Backlog inicial

O backlog planejado esta em `issues.md`, `issues.json` e `issue-bodies/`. Esses arquivos registram epicos e tarefas iniciais para orientar a evolucao do produto.
