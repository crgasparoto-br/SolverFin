# Ambientes e secrets - SolverFin

Este documento define o fluxo seguro inicial para variaveis de ambiente e secrets do SolverFin.

## Principios

- Nunca commite secrets reais, tokens, chaves privadas, credenciais de banco de producao ou dados financeiros sensiveis.
- Use `.env.example` apenas com placeholders ficticios e seguros.
- Use `.env` local para valores de desenvolvimento da sua maquina.
- Configure secrets reais apenas no ambiente onde serao usados, como GitHub Actions, provedor de deploy ou gerenciador dedicado futuro.
- Erros de validacao devem citar o nome da variavel ausente ou invalida, nunca o valor recebido.

## Arquivos

- `.env.example`: contrato publico de variaveis esperadas, com valores ficticios.
- `.env`: arquivo local ignorado pelo Git. Deve ser criado a partir de `.env.example`.
- `.gitignore`: bloqueia `.env`, `.env.*`, `.envrc`, certificados e chaves locais.
- `packages/config`: centraliza o contrato TypeScript de validacao de ambiente para apps e pacotes.
- `scripts/validate-env-example.mjs`: valida se `.env.example` contem placeholders obrigatorios e nao parece conter secrets reais.

## Variaveis obrigatorias atuais

- `NODE_ENV`: obrigatoria. Exemplo seguro: `development`. Define ambiente de execucao local, teste ou producao.
- `POSTGRES_DB`: obrigatoria. Exemplo seguro: `solverfin`. Nome do banco local usado pelo Docker Compose.
- `POSTGRES_USER`: obrigatoria. Exemplo seguro: `solverfin`. Usuario local ficticio do PostgreSQL.
- `POSTGRES_PASSWORD`: obrigatoria. Exemplo seguro: `solverfin_dev_password`. Senha local ficticia do PostgreSQL.
- `POSTGRES_PORT`: obrigatoria. Exemplo seguro: `5432`. Porta publicada na maquina local.
- `DATABASE_URL`: obrigatoria. Exemplo seguro: `postgresql://solverfin:solverfin_dev_password@localhost:5432/solverfin?schema=public`. String de conexao local para Prisma/API quando existirem.

## Setup local

Crie seu ambiente local a partir do exemplo:

```bash
cp .env.example .env
```

Se a porta `5432` estiver ocupada, ajuste `POSTGRES_PORT` e a porta dentro de `DATABASE_URL` no `.env` local.

Valide o exemplo versionado:

```bash
npm run env:check
```

Valide todos os checks do repositorio:

```bash
npm run validate
```

## GitHub Actions

O CI inicial nao exige secrets. Ele roda apenas checks basicos e `npm run env:check` sobre `.env.example`.

Quando uma issue futura precisar de secrets no GitHub Actions:

1. Crie o secret em `Settings > Secrets and variables > Actions`.
2. Use nomes explicitos, por exemplo `DATABASE_URL_PREVIEW` ou `OPENAI_API_KEY_PREVIEW`.
3. Injete o secret apenas no job que precisa dele.
4. Nunca imprima secrets em logs.
5. Prefira environments protegidos para preview/producao quando houver deploy.

## Validacao em codigo

Apps e pacotes devem usar `validateRuntimeEnvironment` de `@solverfin/config` quando passarem a consumir variaveis obrigatorias.

A validacao retorna apenas variaveis aprovadas e lanca `EnvironmentValidationError` quando algo estiver ausente ou invalido. As mensagens citam nomes de variaveis, mas nao valores sensiveis.

## Fora do escopo atual

- Gerenciador externo de secrets.
- Rotacao automatica de chaves.
- Secrets de producao.
- Validacao de provedores de IA, autenticacao ou deploy, que devem ser adicionadas pelas issues especificas.
