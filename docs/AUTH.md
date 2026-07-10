# Autenticacao e sessoes

## Objetivo

A autenticacao do SolverFin define o contrato de login, cadastro local, login OIDC/OAuth2 produtivo, logout, sessao autenticada e protecao de rotas privadas.

A ADR `docs/adr/0004-autenticacao-produtiva.md` exige que producao use um provider gerenciado compativel com OIDC/OAuth2 para identidade e uma sessao propria do SolverFin que seja persistente, revogavel e auditavel.

## Estrategia atual

O modulo `apps/api/src/auth.ts` permanece como camada pura e testavel de autenticacao para desenvolvimento e testes. Ele valida credenciais injetadas, cria sessoes locais e oferece guard para rotas privadas.

O modulo `apps/api/src/auth-service.ts` conecta essa camada ao PostgreSQL e adiciona o contrato produtivo:

- login local e login OIDC retornam um token de sessao local do SolverFin;
- somente o hash SHA-256 desse token e persistido em `ApplicationSession`;
- o token bruto nunca deve ser gravado em banco, logs, erros ou fixtures;
- sessoes possuem `createdAt`, `lastSeenAt`, `expiresAt`, `revokedAt` e `revocationReason`;
- rotas privadas validam sessao persistida quando o banco esta disponivel;
- logout revoga a sessao persistida ativa;
- revogacao em massa por usuario fica disponivel no servico de autenticacao;
- eventos de seguranca sao registrados em `SecurityAuditEvent`.

## Usuario master e Admin global

A area Admin global deve ser protegida por backend antes de listar, atualizar ou alterar recursos compartilhados entre todos os usuarios.

A definicao inicial de usuario master fica em `SOLVERFIN_MASTER_EMAILS`, com uma lista separada por virgulas. A comparacao normaliza espacos e caixa alta/baixa, ignora valores que nao sejam emails validos e falha de modo seguro quando a variavel estiver ausente ou vazia.

O helper `apps/api/src/admin-auth.ts` expoe:

- `listConfiguredMasterEmails` para ler a configuracao normalizada;
- `isMasterUser` para checagem booleana;
- `requireMasterUser` para bloquear usuario comum ou desabilitado com `AUTH_ADMIN_REQUIRED` e status HTTP 403.

Usuario com status `disabled` nunca recebe acesso Admin mesmo que o email esteja configurado como master. Essa regra nao usa ownership de organizacao ou perfil financeiro, pois o Admin global nao pertence a um perfil financeiro especifico.

## Provider produtivo

A rota `POST /api/session/oidc` recebe a resposta validada do fluxo OIDC/OAuth2 do cliente, confere `state`, valida o `idToken` contra JWKS do provider e troca a identidade externa por uma sessao local do SolverFin.

Esse fluxo nao recebe, armazena nem verifica senha produtiva. Usuarios produtivos podem ter `passwordHash` nulo porque credenciais reais ficam delegadas ao provider gerenciado.

## Recuperacao de senha

A tela de login exibe a acao **Esqueci minha senha**. O SolverFin nao cria token, endpoint, email ou armazenamento proprio para redefinicao de senha produtiva; a acao encaminha o usuario para o fluxo administrado pelo provider de identidade, conforme a ADR de autenticacao.

A URL deve ser configurada em `AUTH_PASSWORD_RESET_URL`. Apenas URLs HTTP/HTTPS sem credenciais embutidas sao aceitas. Fora dos ambientes `development`, `local` e `test`, a URL precisa usar HTTPS. Se a configuracao estiver ausente ou invalida, a acao permanece visivel e informa ao usuario que deve procurar o responsavel pelo acesso.

A URL pode incluir parametros exigidos pelo provider, como identificador do cliente ou destino de retorno, desde que o valor completo seja configurado no ambiente e nao contenha segredo.

## Sessoes persistentes

A sessao local e enviada nas rotas privadas com:

```http
Authorization: Bearer <session-token>
```

Ao criar a sessao, a API grava em `ApplicationSession`:

- `tokenHash`: hash SHA-256 do token, unico e sem o token bruto;
- `userId`: usuario autenticado;
- `createdAt`: criacao da sessao;
- `lastSeenAt`: ultima validacao bem-sucedida;
- `expiresAt`: timeout absoluto;
- `revokedAt` e `revocationReason`: revogacao explicita, expirada ou por inatividade.

A sessao e rejeitada com erro controlado quando estiver ausente, invalida, expirada, revogada ou inativa alem do limite configurado.

## Auditoria de seguranca

Eventos de seguranca sao gravados em `SecurityAuditEvent` sem tokens, respostas sensiveis de provider ou payloads privados. Os eventos cobertos incluem:

- login bem-sucedido;
- falha de login;
- logout;
- sessao ausente, invalida, expirada, revogada ou encerrada por inatividade;
- usuario desabilitado;
- revogacao de todas as sessoes de um usuario;
- acesso negado a perfil financeiro quando chamado pelo servico de autenticacao.

Acoes administrativas globais devem reutilizar o guard master e registrar auditoria especifica quando a rota administrativa existir. Se a estrutura de auditoria nao estiver disponivel em um ambiente local, a operacao deve continuar sem expor segredos ou payloads sensiveis.

## Variaveis locais

`.env.example` inclui:

```env
AUTH_SESSION_TTL_MINUTES=60
AUTH_SESSION_IDLE_TIMEOUT_MINUTES=30
AUTH_ALLOW_DEMO=false
AUTH_PASSWORD_RESET_URL=https://identity.example.invalid/solverfin/reset-password
SOLVERFIN_MASTER_EMAILS=master@solverfin.example.invalid
OIDC_ISSUER_URL=https://identity.example.invalid/solverfin
OIDC_AUDIENCE=solverfin-api
OIDC_JWKS_URI=https://identity.example.invalid/solverfin/.well-known/jwks.json
```

`AUTH_SESSION_TTL_MINUTES` controla o timeout absoluto da sessao. Quando ausente ou invalido, o padrao e 60 minutos.

`AUTH_SESSION_IDLE_TIMEOUT_MINUTES` controla o timeout por inatividade das sessoes persistidas. Quando ausente ou invalido, o padrao e 30 minutos.

`AUTH_ALLOW_DEMO=true` deve ser usado apenas em demonstracoes nao produtivas e controladas. Ele nao torna a autenticacao demo adequada para producao.

`AUTH_PASSWORD_RESET_URL` define a pagina do provider gerenciado usada pela acao **Esqueci minha senha**. Use HTTPS em preview, staging e producao. A variavel nao e segredo, mas nao deve carregar tokens, senhas ou credenciais na URL.

`SOLVERFIN_MASTER_EMAILS` controla quem pode acessar recursos Admin globais. Em producao, configure apenas emails reais de usuarios autorizados em ambiente protegido. Variavel ausente ou vazia nao libera acesso Admin para ninguem.

## Erros controlados

Credenciais invalidas retornam erro generico:

```text
AUTH_INVALID_CREDENTIALS
```

Usuario desabilitado retorna:

```text
AUTH_USER_DISABLED
```

Sessao ausente retorna:

```text
AUTH_SESSION_REQUIRED
```

Sessao invalida ou revogada retorna:

```text
AUTH_SESSION_INVALID
```

Sessao expirada por timeout absoluto ou inatividade retorna:

```text
AUTH_SESSION_EXPIRED
```

Usuario autenticado sem permissao master para Admin global retorna:

```text
AUTH_ADMIN_REQUIRED
```

## Testes

O pacote `@solverfin/api` cobre:

- rota publica sem usuario autenticado;
- login com email normalizado;
- rota privada autenticada;
- inclusao de credenciais persistidas no servico de auth;
- logout invalidando sessao;
- credenciais invalidas;
- usuario desabilitado;
- sessao expirada;
- parsing de header `Bearer`;
- hash de token de sessao sem persistir token bruto;
- timeout por inatividade;
- bloqueio da autenticacao demo fora de ambiente local/teste sem opt-in explicito;
- configuracao OIDC produtiva para ambientes nao locais;
- validacao de JWT OIDC assinado, audience invalida, token expirado e `state` invalido;
- configuracao e guard de usuario master para Admin global, incluindo falha segura quando `SOLVERFIN_MASTER_EMAILS` esta ausente, usuario comum e usuario desabilitado.

O pacote `@solverfin/web` cobre a renderizacao da acao **Esqueci minha senha**, o escape da URL e a rejeicao de protocolo inseguro, credenciais embutidas e HTTP fora de ambiente local.

Todos os testes usam usuarios ficticios e nao dependem de segredos reais.
