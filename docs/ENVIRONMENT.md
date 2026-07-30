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
- `packages/config`: centraliza contratos tipados de ambiente que validam conjuntos completos de variaveis consumidas por apps e pacotes.
- `packages/shared/src/runtime-environment.ts`: aplica o guard minimo de `NODE_ENV` nos entrypoints sem introduzir dependencia circular entre apps.
- `scripts/validate-env-example.mjs`: valida se `.env.example` contem placeholders obrigatorios, nao parece conter secrets reais e preserva as relacoes confiaveis entre issuer, JWKS e dominio de login.

## Variaveis obrigatorias atuais

- `NODE_ENV`: obrigatoria e explicita. Valores aceitos: `development`, `local`, `test` ou `production`; ausencia ou valor desconhecido impede a inicializacao dos entrypoints.
- `APP_ORIGIN`: obrigatoria para autenticação por cookie. Em ambientes web deve conter somente a origem exata, sem path, query ou fragmento.
- `POSTGRES_DB`: obrigatoria. Exemplo seguro: `solverfin`. Nome do banco local usado pelo Docker Compose.
- `POSTGRES_USER`: obrigatoria. Exemplo seguro: `solverfin`. Usuario local ficticio do PostgreSQL.
- `POSTGRES_PASSWORD`: obrigatoria. Exemplo seguro: `solverfin_dev_password`. Senha local ficticia do PostgreSQL.
- `POSTGRES_PORT`: obrigatoria. Exemplo seguro: `5432`. Porta publicada na maquina local.
- `DATABASE_URL`: obrigatoria. Exemplo seguro: `postgresql://solverfin:solverfin_dev_password@localhost:5432/solverfin?schema=public`. String de conexao local para Prisma/API quando existirem.
- `AUTH_PASSWORD_RESET_URL`: obrigatoria no contrato versionado e recomendada em todos os ambientes com usuarios reais. Define a pagina de recuperacao de conta do provider gerenciado. Use HTTPS fora de ambiente local e nao inclua tokens ou credenciais na URL.

## Autenticacao produtiva

Produção usa Amazon Cognito User Pools Essentials em `sa-east-1`. O contrato completo está em `docs/AUTH.md` e exige `APP_ORIGIN`, issuer, client ID, endpoints de autorização/token, JWKS, redirect URI e chave base64 de 32 bytes para cifrar o `code_verifier`. URLs públicas de logout e recuperação também são versionadas por ambiente.

`OIDC_ISSUER_URL` deve apontar diretamente para um User Pool em `cognito-idp.sa-east-1.amazonaws.com`. `OIDC_JWKS_URI` deve ser derivado exatamente desse issuer. Os endpoints de autorização, token, logout e recuperação usam o mesmo domínio gerenciado `*.auth.sa-east-1.amazoncognito.com` e os paths canônicos documentados. Misturar hosts, regiões, paths ou um JWKS externo impede a inicialização produtiva.

`OIDC_ATTEMPT_ENCRYPTION_KEY` é secret e não pode aparecer em logs. `OIDC_CLIENT_ID` é público; `OIDC_AUDIENCE` é apenas alias transitório. `AUTH_ALLOW_DEMO` e `AUTH_ALLOW_MISSING_ORIGIN` devem permanecer falsos em produção.

`OIDC_ATTEMPT_TTL_MINUTES` define a validade da correlação. `OIDC_ATTEMPT_CLEANUP_INTERVAL_MS` define a frequência do job interno que encerra tentativas vencidas; o padrão é 60000 ms e valores menores que 10000 ms não são aceitos como cadência efetiva.

O User Pool/app client deve habilitar Authorization Code Grant, PKCE `S256`, scopes `openid email profile` e exatamente o callback de `OIDC_REDIRECT_URI`. Recursos do pool ficam em `sa-east-1`. Não usar SMS como mecanismo padrão de MFA/recuperação.

A API falha fechada quando a configuração produtiva, o banco ou a sessão persistida estiverem indisponíveis. Tokens de provider e sessão não são secrets de configuração e jamais devem ser copiados para variáveis, logs ou documentação.

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

Entry points executaveis usam `assertExplicitRuntimeEnvironment` de `@solverfin/shared` para impedir que `NODE_ENV` ausente ou desconhecido seja interpretado como ambiente local. Esse guard valida somente a identidade basica do ambiente e falha antes de o servidor começar a atender requisicoes.

Apps e pacotes que consomem conjuntos tipados de variaveis continuam usando `validateRuntimeEnvironment` de `@solverfin/config`. Essa validacao retorna apenas variaveis aprovadas e lanca `EnvironmentValidationError` quando algo estiver ausente ou invalido. As mensagens citam nomes de variaveis, mas nao valores sensiveis.

A API executa ainda uma validação específica do Cognito na inicialização produtiva e em cada início do fluxo OIDC. A validação específica da URL de recuperação no web server continua responsável pela renderização segura do link externo.

## Fora do escopo atual

- Gerenciador externo de secrets.
- Rotacao automatica de chaves.
- Secrets de producao.
- Validacao completa de provedores de IA ou deploy, que deve ser adicionada pelas issues especificas.
