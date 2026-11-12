# Desenvolvimento local do MVP

Este guia cobre o fluxo local do MVP navegavel da issue #120.

## Requisitos

- Node.js 22 ou superior.
- npm 10 ou superior.
- Docker com Docker Compose v2 para usar PostgreSQL local.

## Setup rapido

```bash
npm install
npm run env:check
cp .env.example .env
docker compose up -d postgres
npm run db:setup
npm run dev
```

Abra `http://localhost:5173/login`.

Credenciais demo ficticias, apenas para desenvolvimento local:

- Email: `demo@solverfin.example.invalid`
- Senha: `SolverFinDemo!2026`

A sessao local expira em 60 minutos por padrao. Ajuste `AUTH_SESSION_TTL_MINUTES` no `.env` se precisar alterar esse tempo.

## Banco local

O Docker/PostgreSQL e necessario para migrations, seed demo e validacoes Prisma com banco. O dev server do MVP tambem sobe sem banco para validar login, navegacao, API minima e dashboard demonstrativo.

Portas padrao:

- Web: `5173`
- PostgreSQL: `5432`

Se a porta `5432` estiver ocupada:

1. Altere `POSTGRES_PORT` no `.env`, por exemplo `5433`.
2. Altere a porta em `DATABASE_URL` para o mesmo valor.
3. Rode novamente `docker compose up -d postgres`.

Para resetar o banco local com cuidado:

```bash
docker compose down -v
docker compose up -d postgres
npm run db:setup
```

Esse reset remove dados locais de desenvolvimento.

### Acesso ao banco via web (Adminer)

O `docker-compose.yml` inclui um servico `adminer` para inspecionar o banco local pelo navegador, sem instalar cliente Postgres.

```bash
docker compose up -d adminer
```

Acesse `http://localhost:8082` (porta configuravel via `ADMINER_PORT` no `.env`) e conecte com:

- Sistema: `PostgreSQL`
- Servidor: `postgres`
- Usuario: `solverfin`
- Senha: `solverfin_dev_password`
- Base de dados: `solverfin`

Se estiver em uma maquina remota (ex.: dev via SSH/VSCode Remote), use o port forwarding do VSCode (painel "Ports" -> Forward a Port -> `8082`) ou um tunel SSH manual (`ssh -L 8082:localhost:8082 usuario@host`) para acessar a partir do navegador local.

## Validacoes

Comandos que nao exigem banco em execucao:

```bash
npm run env:check
npm run lint
npm run typecheck
npm run test
npm run build
```

Comandos que dependem de Docker/PostgreSQL e `.env`:

```bash
npm run db:migrate
npm run db:seed
npm run db:setup
```

Validacao completa:

```bash
npm run validate
```

Smoke manual com o dev server ativo:

```bash
curl -i http://localhost:5173/health
curl -i http://localhost:5173/login
curl -i http://localhost:5173/dashboard
```

`/login` deve mostrar um formulario real. `/dashboard` sem sessao deve redirecionar para `/login`.

## Bloqueio de rede no npm

Se `npm install` falhar por bloqueio de rede, registre o erro na PR ou no log da execucao. O ambiente precisa acessar o npm registry para baixar TypeScript, ESLint, Prettier, Prisma e dependencias dos workspaces.

## Seguranca dos exemplos

Nao commite `.env`. As credenciais e dados deste guia sao ficticios, minimizados e exclusivos do ambiente local. Nao use dados reais de clientes, bancos, cartoes, contas ou mensagens financeiras em seeds, testes, logs ou documentacao.
