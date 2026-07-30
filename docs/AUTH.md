# Autenticação e sessões

## Contrato produtivo

Produção, staging com dados reais e preview público usam **Amazon Cognito User Pools**, plano Essentials, na região `sa-east-1`, conforme a ADR 0004. O SolverFin usa endpoints OIDC/OAuth2 padrão e não depende de SDK proprietário no domínio.

A jornada produtiva é:

1. `GET /api/auth/oidc/start?returnTo=/dashboard` valida um destino interno, gera `state`, `nonce` e PKCE `S256`, persiste a tentativa antes do redirect e encaminha ao login gerenciado do Cognito.
2. `GET /api/auth/oidc/callback` reivindica a tentativa com transição atômica `PENDING -> PROCESSING`, troca o código somente no backend, valida assinatura RS256, issuer, audience, expiração e nonce e vincula a identidade externa ao usuário local.
3. O backend cria uma sessão opaca própria, persiste somente o hash SHA-256 e envia o token bruto apenas no cookie HttpOnly.
4. `GET /api/me` e as rotas privadas validam a sessão persistida.
5. `POST /api/session/renew` gira atomicamente o token sem ampliar `expiresAt`.
6. `DELETE /api/session` revoga de forma idempotente e limpa o cookie.

O callback nunca devolve código, tokens do Cognito, `code_verifier`, token local, segredo ou claims sensíveis ao frontend, à URL pós-callback, a logs ou a erros públicos.

## Correlação OIDC

`OidcLoginAttempt` é a fonte de verdade compartilhada entre instâncias. Armazena hashes de `state` e `nonce`, `code_verifier` cifrado com AES-256-GCM, issuer, `returnTo`, versão, expiração e estado terminal.

Estados válidos:

- `PENDING`;
- `PROCESSING`;
- `CONSUMED`;
- `CANCELLED`;
- `EXPIRED`;
- `FAILED`.

Somente uma chamada pode reivindicar uma tentativa pendente. Repetição, replay, expiração, estado desconhecido e concorrência são rejeitados sem criar sessão. Cancelamento do provider termina a tentativa sem revelar detalhes internos.

## Cookie da sessão

Em produção, o cookie é:

```text
__Host-solverfin_session=<opaque>; Path=/; HttpOnly; Secure; SameSite=Lax
```

Em ambiente local/teste, o nome é `solverfin_session` e `Secure` é omitido para permitir HTTP local. Não há atributo `Domain`. `Max-Age` e `Expires` nunca ultrapassam o timeout absoluto persistido.

Múltiplos cookies são enviados como headers `Set-Cookie` separados. A aplicação web encaminha o cookie ao backend; ela não grava token produtivo em `localStorage`, `sessionStorage`, IndexedDB, HTML ou JSON.

## Persistência, rotação e revogação

`ApplicationSession` contém `tokenHash`, `transport`, `createdAt`, `lastSeenAt`, `expiresAt`, `revokedAt` e `revocationReason`. O token bruto existe somente no cookie e na memória da requisição.

A renovação substitui o hash por escrita condicional. Duas renovações concorrentes com o mesmo token antigo resultam em no máximo uma vencedora. A rotação mantém o mesmo `expiresAt` absoluto.

Logout revoga somente uma sessão ainda ativa e sempre limpa o cookie. A migration de rollout marca sessões legadas ativas com `auth_transport_migration`, exigindo novo login.

## CSRF e origem

Toda operação mutável autenticada por cookie exige `Origin` exatamente igual a `APP_ORIGIN`. Origem ausente ou diferente é rejeitada. A exceção `AUTH_ALLOW_MISSING_ORIGIN=true` existe apenas para adaptadores locais/testes deliberados.

`SameSite=Lax` é defesa complementar e não substitui a validação de origem.

## Contratos locais e legados

Os contratos abaixo existem somente em `development`, `local`, `test` ou demonstração não produtiva explicitamente autorizada por `AUTH_ALLOW_DEMO=true`:

- `POST /api/session`;
- `POST /api/users`;
- `POST /api/session/oidc` com `idToken` fornecido pelo cliente;
- autenticação `Authorization: Bearer`.

Fora desses ambientes, eles falham de modo seguro. Produção nunca recorre à sessão em memória quando a sessão persistida estiver ausente ou indisponível.

## Identidade e tenant

O vínculo canônico é `externalAuthProvider + externalAuthSubject`. A primeira autenticação válida pode vincular um usuário local sem provider ou criar `User`, `Organization` e `FinancialProfile` pessoal de forma idempotente. Credenciais, confirmação de email, recuperação e autenticação forte permanecem sob responsabilidade do Cognito.

## Auditoria

`SecurityAuditEvent` registra eventos operacionais sem material sensível, incluindo criação/consumo/falha/cancelamento de tentativa OIDC, login, rotação, logout, revogação, sessão inválida/expirada, bloqueio de fluxo local e origem rejeitada.

## Configuração

Variáveis produtivas:

```env
APP_ORIGIN=https://app.solverfin.example
OIDC_ISSUER_URL=https://cognito-idp.sa-east-1.amazonaws.com/<user-pool-id>
OIDC_CLIENT_ID=<app-client-id>
OIDC_AUTHORIZATION_URL=https://<dominio-cognito>/oauth2/authorize
OIDC_TOKEN_URL=https://<dominio-cognito>/oauth2/token
OIDC_JWKS_URI=https://cognito-idp.sa-east-1.amazonaws.com/<user-pool-id>/.well-known/jwks.json
OIDC_REDIRECT_URI=https://<app>/api/auth/oidc/callback
OIDC_LOGOUT_URL=https://<dominio-cognito>/logout
OIDC_RECOVERY_URL=https://<dominio-cognito>/forgotPassword
OIDC_ATTEMPT_ENCRYPTION_KEY=<32-bytes-em-base64>
OIDC_ATTEMPT_TTL_MINUTES=10
AUTH_SESSION_TTL_MINUTES=60
AUTH_SESSION_IDLE_TIMEOUT_MINUTES=30
```

`OIDC_AUDIENCE` permanece apenas como alias de transição e deve coincidir com `OIDC_CLIENT_ID`. O app client usa Authorization Code Grant, PKCE `S256`, scopes mínimos `openid email profile` e não precisa de client secret para o cliente público usado pelo browser. SMS não é o mecanismo padrão; preferir email, passkeys ou aplicativo autenticador conforme a configuração disponível.

Todos os valores reais ficam em secrets por ambiente. Ausência ou incoerência de configuração produtiva impede a inicialização/autenticação produtiva.

## Testes e validação

A cobertura inclui cookie produtivo/local, ausência de `Domain`, origem exata, `returnTo` interno, PKCE, hashes de state/nonce, nonce do ID token, bloqueio dos contratos legados, rotação atômica, revogação idempotente, estados/replay da tentativa, UI produtiva sem senha local e integração PostgreSQL. O gate agregado é `npm run validate`, seguido de `npm run test:integration`.
