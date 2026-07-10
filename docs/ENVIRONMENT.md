# Ambientes e secrets - SolverFin

Este documento define o fluxo seguro inicial para variaveis de ambiente e secrets do SolverFin.

## Principios

- Nunca commite secrets reais, tokens, chaves privadas, credenciais de banco de producao ou dados financeiros sensiveis.
- Use `.env.example` apenas com placeholders ficticios e seguros.
- Use `.env` local para valores de desenvolvimento da sua maquina.
- Configure secrets reais apenas no ambiente onde serao usados, como GitHub Actions, provedor de deploy ou gerenciador dedicado futuro.
- Erros de validacao devem citar o nome da variavel ausente ou invalida, nunca o valor recebido.

## Privacidade de dados financeiros

A politica inicial de consentimento, retencao, minimizacao e mascaramento fica em `docs/PRIVACY.md`.

Ela deve ser usada como contrato para importacao, inbox de mensagens bancarias, deduplicacao, conciliacao, automacoes e IA financeira.

Regras praticas para ambientes:

- `.env.example`, logs de CI e exemplos versionados nao podem conter dados financeiros reais ou mensagens bancarias reais.
- Secrets de provedores de IA, identidade, banco ou storage devem existir apenas no ambiente que precisa deles.
- Respostas brutas de provedores externos nao devem ser copiadas para logs, fixtures ou documentacao.
- Quando uma validacao falhar, a mensagem deve citar nomes de variaveis ou codigos de erro, nunca valores sensiveis recebidos.

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
- `AUTH_PASSWORD_RESET_URL`: obrigatoria no contrato versionado e recomendada em todos os ambientes com usuarios reais. Define a pagina de recuperacao de conta do provider gerenciado. Use HTTPS fora de ambiente local e nao inclua tokens ou credenciais na URL.

## Autenticacao produtiva

A ADR `docs/adr/0004-autenticacao-produtiva.md` define que producao deve usar
provider gerenciado compativel com OIDC/OAuth2, com credenciais delegadas e
sessao propria persistente no SolverFin.

Variaveis atualmente usadas pelo contrato de autenticacao:

- `OIDC_ISSUER_URL`: URL do issuer confiavel.
- `OIDC_AUDIENCE`: identificador esperado pela API nos tokens emitidos.
- `OIDC_JWKS_URI`: endpoint HTTPS das chaves publicas do provider.
- `AUTH_PASSWORD_RESET_URL`: pagina publica do provider para recuperar conta ou redefinir senha.
- `AUTH_SESSION_TTL_MINUTES`: timeout absoluto da sessao local.
- `AUTH_SESSION_IDLE_TIMEOUT_MINUTES`: timeout por inatividade.
- `AUTH_ALLOW_DEMO`: opt-in para demonstracao nao produtiva fora de ambiente local/teste.

Configuracoes adicionais podem ser necessarias quando o cliente OIDC completo for integrado:

- `AUTH_PROVIDER_CLIENT_ID`: identificador publico da aplicacao no provider.
- `AUTH_PROVIDER_CLIENT_SECRET`: segredo do cliente quando o fluxo escolhido exigir segredo no backend.
- `AUTH_PROVIDER_REDIRECT_URI`: callback autorizado para o ambiente.
- `AUTH_SESSION_SECRET`: segredo usado para assinatura/derivacao operacional de sessao, quando aplicavel.

Essas variaveis devem usar placeholders ficticios em exemplos versionados e
secrets reais apenas nos ambientes que precisam deles. O processo produtivo deve
falhar cedo se variaveis obrigatorias do provider estiverem ausentes ou
incoerentes.

A URL de recuperacao e configuracao publica, nao um secret. Mesmo assim, deve ser tratada como entrada nao confiavel: o web server aceita apenas HTTP/HTTPS, rejeita credenciais embutidas e exige HTTPS fora de `development`, `local` e `test`.

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

A validacao especifica da URL de recuperacao fica no web server porque ela controla a renderizacao de um link externo e precisa manter um fallback seguro quando a configuracao estiver ausente ou invalida.

## Fora do escopo atual

- Gerenciador externo de secrets.
- Rotacao automatica de chaves.
- Secrets de producao.
- Validacao completa de provedores de IA ou deploy, que deve ser adicionada pelas issues especificas.
