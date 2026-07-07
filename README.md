# SolverFin

SolverFin e o controle financeiro inteligente da SolverIT para pessoas, familias, MEIs, profissionais autonomos e pequenos negocios.

O produto combina organizacao financeira, importacao de dados, regras deterministicas e IA explicavel para reduzir lancamentos manuais, apoiar conciliacao e transformar informacoes financeiras em decisoes claras. A automacao deve sempre preservar revisao humana, privacidade, LGPD, rastreabilidade e separacao entre contextos pessoais, profissionais e empresariais.

## Status do repositorio

O MVP core esta navegavel de ponta a ponta com persistencia real: `apps/api` roda um servidor HTTP em Node `http`, aplica regras de `packages/domain` e persiste em PostgreSQL via `pg`; `apps/web` roda um servidor SSR que consome a API real.

Fluxos ja ligados ao banco real incluem autenticacao demo local, dashboard, contas, categorias, lancamentos, cartoes/faturas, orcamentos, recorrencias/parcelas, importacao CSV inicial, Inbox de mensagens bancarias, fila de sugestoes revisaveis e regras automaticas.

A rotina operacional atual esta consolidada assim:

- receitas, despesas, transferencias e compromissos previstos de conta corrente ficam no **Extrato da conta** (`/lancamentos`);
- compras, faturas, fechamento e pagamento de cartao ficam em **Cartoes de Credito** (`/cartoes`);
- cartoes de credito usam o modelo de **cartao agrupador/fatura** com **instrumentos internos**, documentado em `docs/CARDS.md`;
- `PayableReceivable` permanece como dominio/API legado de compatibilidade, documentado em `docs/PAYABLES_RECEIVABLES.md` e no plano de transicao `docs/PAYABLES_RECEIVABLES_TRANSITION.md`.

Parcelas historicas ainda nao possuem manutencao direta completa. OFX, conciliacao ampla, automacoes avancadas e provedor real de IA ainda evoluem por issues dedicadas.

## Requisitos locais

- Node.js 22 ou superior;
- npm 10 ou superior;
- Docker com Docker Compose v2 para o banco local.

Instalar dependencias de forma reprodutivel:

```bash
npm ci
```

Executar validacao raiz:

```bash
npm run validate
```

Comandos principais:

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

## Rodar o MVP local

```bash
cp .env.example .env
docker compose up -d postgres
npm run db:setup
npm run dev:api    # API real em http://localhost:4000
npm run dev:web    # Web SSR em http://localhost:5173, consumindo a API real
```

Durante `npm run dev:web` e `npm run dev:api`, cada aplicacao compila em modo watch e o servidor local reinicia quando os arquivos TypeScript geram nova saida em `apps/web/dist` ou `apps/api/dist`. Depois de alterar uma tela ou rota de API, basta recarregar `http://localhost:5173`.

Login demo local:

```text
demo@solverfin.example.invalid / SolverFinDemo!2026
```

Esse login pertence exclusivamente a autenticacao demo local. A API bloqueia essa autenticacao fora de `NODE_ENV=development`, `NODE_ENV=local` ou `NODE_ENV=test`, salvo `AUTH_ALLOW_DEMO=true` para uma demonstracao nao produtiva explicitamente autorizada. Nao use essa camada como autenticacao de producao.

## Banco local com PostgreSQL

O ambiente de desenvolvimento usa `docker-compose.yml` para subir PostgreSQL com dados persistidos no volume `solverfin-postgres-data`.

```bash
docker compose up -d postgres
docker compose ps
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

## Testes de integracao API + PostgreSQL

A suite de integracao da API usa PostgreSQL real, aplica migrations com Prisma, reaplica o seed demo seguro e exercita rotas persistidas com isolamento por perfil financeiro.

```bash
cp .env.example .env
docker compose up -d postgres
npm run test:integration
```

Esse comando executa, em ordem:

```bash
npm run build:packages
npm run db:deploy
npm run db:seed
npm run test:integration --workspace @solverfin/api
```

O teste cria dados ficticios adicionais no banco configurado em `DATABASE_URL`. Use uma base local ou efemera de teste.

## CI

O workflow `.github/workflows/ci.yml` roda em `pull_request` e em `push` para `main` com dois jobs isolados.

### Validate monorepo

Nao depende de Docker, banco local ou secrets reais:

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

Para reproduzir localmente:

```bash
npm ci
npm run validate
```

### Integration API + PostgreSQL

Sobe PostgreSQL 16 efemero no GitHub Actions com valores ficticios de teste e executa:

```bash
npm ci --no-audit --no-fund
npm run prisma:generate
npm run build:packages
npm run db:deploy
npm run db:seed
npm run test:integration --workspace @solverfin/api
```

## Ambientes e secrets

O contrato de variaveis e a politica de secrets ficam em `docs/ENVIRONMENT.md`.

Regras principais:

- nunca commite secrets reais, tokens, chaves privadas ou credenciais de producao;
- use `.env.example` apenas com placeholders ficticios e seguros;
- crie `.env` local a partir de `.env.example`;
- configure secrets reais apenas no ambiente que precisa deles;
- erros de ambiente devem citar o nome da variavel ausente ou invalida, nunca o valor recebido.

Validar `.env.example`:

```bash
npm run env:check
```

Apps e pacotes devem usar `validateRuntimeEnvironment` de `@solverfin/config` quando passarem a consumir variaveis obrigatorias em runtime.

## Documentacao viva

Use `docs/README.md` como indice principal da documentacao do projeto.

Documentos obrigatorios antes de implementar issues:

- `AGENTS.md`: regras globais para agentes de IA.
- `.github/copilot-instructions.md`: instrucoes especificas para Copilot e agentes GitHub.
- `docs/PRODUCT.md`: visao de produto, personas, jornadas, escopo MVP, fases e limites.
- `docs/ARCHITECTURE.md`: arquitetura atual, stack-alvo e regras tecnicas.
- `docs/STATUS_MATRIX.md`: estado observado do MVP por area.
- `docs/adr/README.md`: processo de ADRs e indice de decisoes.

Contratos especificos devem ser consultados quando a issue tocar o respectivo dominio, por exemplo cartoes (`docs/CARDS.md`), autenticacao (`docs/AUTH.md`), tenant (`docs/TENANT.md`), privacidade (`docs/PRIVACY.md`), importacao (`docs/IMPORTS.md`), Inbox (`docs/BANK_MESSAGE_INBOX.md`), regras automaticas (`docs/AUTOMATION_RULES.md`), conciliacao (`docs/DETERMINISTIC_DEDUP_RECONCILIATION.md`) e sugestoes revisaveis (`docs/AI_REVIEW_QUEUE.md`).

Arquivos historicos usados apenas para criar o backlog inicial nao fazem parte da documentacao viva. Issues abertas no GitHub sao a fonte de verdade para planejamento atual.

## Como trabalhar nas issues

1. Leia a issue e confirme objetivo, escopo, fora de escopo e criterios de aceite.
2. Consulte os documentos centrais e ADRs relacionados.
3. Localize arquivos existentes antes de criar novos.
4. Implemente uma mudanca pequena, rastreavel e coerente com a issue.
5. Atualize documentacao quando alterar produto, arquitetura, contrato, modelo de dados, fluxo ou decisao relevante.
6. Execute as validacoes disponiveis no repositorio e registre o resultado na PR.

## Estrutura do repositorio

```text
.
|-- AGENTS.md
|-- README.md
|-- .env.example
|-- docker-compose.yml
|-- package.json
|-- apps/
|   |-- api/
|   `-- web/
|-- packages/
|   |-- ai/
|   |-- config/
|   |-- domain/
|   `-- shared/
|-- prisma/
|-- scripts/
|-- docs/
|   |-- README.md
|   |-- ARCHITECTURE.md
|   |-- PRODUCT.md
|   |-- STATUS_MATRIX.md
|   |-- CARDS.md
|   |-- ENVIRONMENT.md
|   `-- adr/
`-- .github/
```

## Responsabilidades dos workspaces

- `apps/web`: aplicacao web/PWA mobile-first.
- `apps/api`: API backend modular.
- `packages/domain`: regras e entidades do dominio financeiro, sem acoplamento direto a UI, banco ou IA.
- `packages/shared`: tipos, utilitarios e contratos compartilhados.
- `packages/ai`: abstracoes de IA, schemas estruturados e politicas de uso seguro.
- `packages/config`: configuracoes compartilhadas e contratos de ambiente.
- `prisma`: schema, migrations e seeds da persistencia.
- `scripts`: automacoes auxiliares seguras do repositorio.

## Privacidade e seguranca

SolverFin lida com dados financeiros. Nunca inclua dados reais de clientes, numeros completos de cartao ou conta, tokens, chaves, mensagens bancarias sensiveis, prints com dados privados ou fixtures que permitam identificar uma pessoa.

Exemplos devem ser ficticios, minimizados e seguros por padrao.
