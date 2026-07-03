# SolverFin

SolverFin e o controle financeiro inteligente da SolverIT para pessoas, familias, MEIs, profissionais autonomos e pequenos negocios.

O produto combina organizacao financeira, importacao de dados, regras deterministicas e IA explicavel para reduzir lancamentos manuais, apoiar conciliacao e transformar informacoes financeiras em decisoes claras. A automacao deve sempre preservar revisao humana, privacidade, LGPD, rastreabilidade e separacao entre contextos pessoais, profissionais e empresariais.

## Status do repositorio

O MVP core esta navegavel de ponta a ponta com persistencia real: `apps/api` roda um servidor HTTP (Node `http`, sem framework) que aplica as regras de `packages/domain` e persiste em PostgreSQL via `pg`, e `apps/web` roda um servidor SSR que consome essa API real (autenticacao, dashboard, contas, categorias, lancamentos, cartoes/faturas e orcamentos). Recorrencias/parcelas tem dominio, schema e API completos; na web nao tem rota propria, ficam embutidas nas telas de Extrato da conta e Cartoes de Credito. A rotina operacional de contas a pagar/receber tambem foi consolidada: receitas, despesas e transferencias previstas ficam no Extrato da conta, enquanto compromissos de cartao ficam em Cartoes de Credito. O modelo atual de cartoes de credito trata o cadastro principal como cartao agrupador/fatura com instrumentos internos, documentado em `docs/CARDS.md`. O dominio/API `PayableReceivable` permanece como compatibilidade legada para preservar historico e transicao tecnica segura. Parcelas historicas ainda nao possuem rota dedicada de consulta direta. Importacao, conciliacao, automacao e IA financeira ainda nao tem persistencia/API ligadas.

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
- npm 10 ou superior;
- Docker com Docker Compose v2 para o banco local.

Instalar dependencias de forma reprodutivel a partir do `package-lock.json` versionado:

```bash
npm ci
```

Executar validacao raiz:

```bash
npm run validate
```

Comandos disponiveis:

```bash
npm run dev
npm run dev:api
npm run dev:web
npm run env:check
npm run format
npm run format:check
npm run lint
npm run lint:fix
npm run typecheck
npm run test
npm run test:integration
npm run build
npm run validate
```

Para rodar o MVP navegavel localmente, com banco real:

```bash
docker compose up -d postgres
npm run db:setup
npm run dev:api    # API real em http://localhost:4000
npm run dev:web    # Web SSR em http://localhost:5173, consumindo a API real
```

Durante `npm run dev:web`, a aplicacao web compila em modo watch e o servidor local reinicia automaticamente quando os arquivos TypeScript geram uma nova saida em `apps/web/dist`. Depois de alterar uma tela, basta recarregar o navegador em `http://localhost:5173`; nao e necessario matar e subir o processo novamente.

Login demo: `demo@solverfin.example.invalid` / `SolverFinDemo!2026`.

Esse login pertence exclusivamente a autenticacao demo local. A API bloqueia essa autenticacao fora de `NODE_ENV=development`, `NODE_ENV=local` ou `NODE_ENV=test`, salvo `AUTH_ALLOW_DEMO=true` para uma demonstracao nao produtiva explicitamente autorizada. Nao use essa camada como autenticacao de producao.

`env:check`, `format`, `lint`, `typecheck`, `test` e `build` apontam para validacoes reais, incluindo o build dos pacotes de dominio/config/shared como pre-requisito (`build:packages`).

Se `npm ci` nao conseguir baixar dependencias por bloqueio de rede, registre o erro na PR. O ambiente precisa acessar o npm registry para instalar TypeScript, ESLint, Prettier, Prisma e demais dependencias travadas no lockfile.

## Testes de integracao API + PostgreSQL

A suite de integracao da API usa PostgreSQL real, aplica migrations com Prisma, reaplica o seed demo seguro e exercita as rotas persistidas com isolamento por perfil financeiro.

Antes de rodar, garanta que `.env` exista com a `DATABASE_URL` local e suba o banco:

```bash
cp .env.example .env
docker compose up -d postgres
```

Executar a suite de integracao:

```bash
npm run test:integration
```

Esse comando executa, em ordem:

```bash
npm run build:packages
npm run db:deploy
npm run db:seed
npm run test:integration --workspace @solverfin/api
```

O teste cria dados ficticios adicionais no banco configurado em `DATABASE_URL`. Use uma base local ou efemera de teste. Para recriar a base local do zero, rode `docker compose down -v` e depois repita o preparo acima.

## CI

O workflow `.github/workflows/ci.yml` roda em `pull_request` e em `push` para `main` com dois jobs isolados.

O job `Validate monorepo` continua sem depender de Docker, banco local ou secrets reais. Ele executa os checks basicos em etapas separadas para deixar claro qual comando falhou:

```bash
npm ci --no-audit --no-fund
npm run env:check
npm run prisma:validate
npm run db:seed:check
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

Para reproduzir localmente o mesmo conjunto de checks rapidos, rode:

```bash
npm ci
npm run validate
```

O job `Integration API + PostgreSQL` sobe um PostgreSQL 16 efemero no GitHub Actions com valores ficticios de teste e usa `DATABASE_URL=postgresql://solverfin:solverfin_ci_password@localhost:5432/solverfin_ci?schema=public`. Ele separa migrations, seed e testes de integracao para facilitar diagnostico:

```bash
npm ci --no-audit --no-fund
npm run prisma:generate
npm run build:packages
npm run db:deploy
npm run db:seed
npm run test:integration --workspace @solverfin/api
```

Para reproduzir localmente o job de integracao, use Docker/PostgreSQL e rode:

```bash
cp .env.example .env
docker compose up -d postgres
npm run test:integration
```

Como o `package-lock.json` esta versionado, os dois jobs usam `npm ci` para instalacao reprodutivel e habilitam cache de npm baseado nesse lockfile.

## Ambientes e secrets

O contrato de variaveis e a politica de secrets ficam em `docs/ENVIRONMENT.md`.

Regras principais:

- nunca commite secrets reais, tokens, chaves privadas ou credenciais de producao;
- use `.env.example` apenas com placeholders ficticios e seguros;
- crie `.env` local a partir de `.env.example`;
- configure secrets reais apenas no ambiente que precisa deles, como GitHub Actions, preview, producao ou gerenciador externo futuro;
- erros de ambiente devem citar o nome da variavel ausente ou invalida, nunca o valor recebido.

Validar `.env.example`:

```bash
npm run env:check
```

Apps e pacotes devem usar `validateRuntimeEnvironment` de `@solverfin/config` quando passarem a consumir variaveis obrigatorias em runtime.

## Ambiente local com PostgreSQL

O ambiente de desenvolvimento usa `docker-compose.yml` para subir um PostgreSQL com dados persistidos no volume `solverfin-postgres-data`.

Crie o arquivo local de ambiente a partir do exemplo seguro:

```bash
cp .env.example .env
```

Subir o banco:

```bash
docker compose up -d postgres
```

Verificar o estado do servico:

```bash
docker compose ps
```

Parar o banco mantendo os dados locais:

```bash
docker compose down
```

Resetar o banco local apagando o volume de desenvolvimento:

```bash
docker compose down -v
```

Atencao: o reset remove os dados locais de desenvolvimento. Use apenas quando quiser recriar o banco do zero.

A string local padrao fica documentada em `.env.example`:

```bash
DATABASE_URL=postgresql://solverfin:solverfin_dev_password@localhost:5432/solverfin?schema=public
```

A porta padrao e `5432`. Se ela estiver ocupada, altere `POSTGRES_PORT` no seu `.env`, por exemplo `POSTGRES_PORT=5433`, e ajuste a `DATABASE_URL` local para a mesma porta.

## Documentos principais

Leia estes documentos antes de implementar qualquer issue:

- `docs/PRODUCT.md`: visao de produto, personas, jornadas, escopo MVP, fases e limites.
- `docs/CARDS.md`: modelo de cartao agrupador/fatura, instrumentos internos, default, limites, rotas e cobertura esperada.
- `docs/ARCHITECTURE.md`: arquitetura inicial, stack-alvo e regras tecnicas.
- `docs/BRAND.md`: identidade visual, tom e direcao de interface.
- `docs/CONVENTIONS.md`: convencoes de TypeScript, lint, formatacao e organizacao.
- `docs/ENVIRONMENT.md`: variaveis de ambiente, secrets e validacao segura.
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
|-- .env.example
|-- docker-compose.yml
|-- package.json
|-- tsconfig.base.json
|-- eslint.config.mjs
|-- apps/
|   |-- api/
|   |   |-- package.json
|   |   |-- tsconfig.json
|   |   `-- src/
|   |       `-- index.ts
|   `-- web/
|       |-- package.json
|       |-- tsconfig.json
|       `-- src/
|           `-- index.ts
|-- packages/
|   |-- ai/
|   |   |-- package.json
|   |   |-- tsconfig.json
|   |   `-- src/index.ts
|   |-- config/
|   |   |-- package.json
|   |   |-- tsconfig.json
|   |   `-- src/
|   |       |-- env.ts
|   |       `-- index.ts
|   |-- domain/
|   |   |-- package.json
|   |   |-- tsconfig.json
|   |   `-- src/index.ts
|   `-- shared/
|       |-- package.json
|       |-- tsconfig.json
|       `-- src/index.ts
|-- prisma/
|   `-- README.md
|-- scripts/
|   |-- README.md
|   `-- validate-env-example.mjs
|-- docs/
|   |-- ARCHITECTURE.md
|   |-- BRAND.md
|   |-- CARDS.md
|   |-- CONVENTIONS.md
|   |-- ENVIRONMENT.md
|   |-- PRODUCT.md
|   `-- adr/
|       |-- README.md
|       `-- 0001-stack-inicial.md
|-- .github/
|   |-- workflows/
|   |   `-- ci.yml
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
- `packages/config`: configuracoes compartilhadas e contratos de ambiente.
- `prisma`: schema, migrations e seeds quando a persistencia for implementada.
- `scripts`: automacoes auxiliares seguras do repositorio.

## Privacidade e seguranca

SolverFin lida com dados financeiros. Nunca inclua dados reais de clientes, numeros completos de cartao ou conta, tokens, chaves, mensagens bancarias sensiveis, prints com dados privados ou fixtures que permitam identificar uma pessoa.

Exemplos devem ser ficticios, minimizados e seguros por padrao.

## Backlog inicial

O backlog planejado esta em `issues.md`, `issues.json` e `issue-bodies/`. Esses arquivos registram epicos e tarefas iniciais para orientar a evolucao do produto.
