# Autenticação e sessões

## Contrato produtivo

Produção, staging com dados reais e preview público usam **Amazon Cognito User Pools**, plano Essentials, na região `sa-east-1`, conforme a ADR 0004. O SolverFin usa endpoints OIDC/OAuth2 padrão e não depende de SDK proprietário no domínio.

A jornada produtiva é:

1. `GET /api/auth/oidc/start?returnTo=/dashboard` valida um destino interno, gera `state`, `nonce` e PKCE `S256`, persiste a tentativa antes do redirect e encaminha ao login gerenciado do Cognito.
2. `GET /api/auth/oidc/callback` reivindica a tentativa com transição atômica `PENDING -> PROCESSING`, troca o código somente no backend e valida assinatura RS256, issuer, audience, expiração, nonce, `token_use=id`, email presente e `email_verified=true` antes de vincular a identidade externa.
3. O backend cria uma sessão opaca própria, persiste somente o hash SHA-256 e envia o token bruto apenas no cookie HttpOnly.
4. A aplicação web confirma a sessão por `GET /api/me` antes de seguir ao `returnTo`; quando o navegador não mantém o cookie, mostra um estado controlado com instrução para habilitar cookies e reiniciar o acesso seguro.
5. `GET /api/me` e as rotas privadas validam a sessão persistida.
6. `POST /api/session/renew` gira atomicamente o token sem ampliar `expiresAt`.
7. `DELETE /api/session` revoga de forma idempotente e limpa o cookie.

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

A API executa uma limpeza no início do processo e depois periodicamente. Tentativas `PENDING` vencidas passam para `EXPIRED`; tentativas `PROCESSING` abandonadas após o prazo passam para `FAILED`. `OIDC_ATTEMPT_CLEANUP_INTERVAL_MS` permite ajustar a cadência, com mínimo efetivo de 10 segundos e padrão de 60 segundos.

## Confiança do provider

O issuer aceito deve ter o formato de User Pool do Cognito em `sa-east-1`. O JWKS é derivado exatamente do issuer e não pode apontar para outro host ou path. Authorization, token, logout e recuperação usam um único domínio gerenciado `*.auth.sa-east-1.amazoncognito.com`, com paths canônicos e sem query ou fragmento. O redirect usa exatamente a origem de `APP_ORIGIN`.

Configuração que misture issuer, JWKS, região, domínio de login ou redirect falha antes do servidor produtivo começar a atender requisições e também é revalidada quando o fluxo OIDC é iniciado.

## Cookie da sessão

Em produção, o cookie é:

```text
__Host-solverfin_session=<opaque>; Path=/; HttpOnly; Secure; SameSite=Lax
```

Em ambiente local/teste, o nome é `solverfin_session` e `Secure` é omitido para permitir HTTP local. Não há atributo `Domain`. `Max-Age` e `Expires` nunca ultrapassam o timeout absoluto persistido.

Múltiplos cookies são enviados como headers `Set-Cookie` separados. A aplicação web encaminha o cookie ao backend; ela não grava token produtivo em `localStorage`, `sessionStorage`, IndexedDB, HTML ou JSON.

Após o callback, a aplicação usa uma etapa intermediária na própria tela de login. Se o cookie estiver válido, redireciona com `303` ao `returnTo` previamente validado. Se o cookie estiver ausente ou inválido, não presume autenticação e oferece reinício explícito da jornada.

## Persistência, rotação e revogação

`ApplicationSession` contém `tokenHash`, `transport`, `createdAt`, `lastSeenAt`, `expiresAt`, `revokedAt` e `revocationReason`. O token bruto existe somente no cookie e na memória da requisição.

A renovação substitui o hash por escrita condicional. Duas renovações concorrentes com o mesmo token antigo resultam em no máximo uma vencedora. A rotação mantém o mesmo `expiresAt` absoluto.

Logout revoga somente uma sessão ainda ativa e sempre limpa o cookie. A migration de rollout marca sessões legadas ativas com `auth_transport_migration`, exigindo novo login. Alterar um usuário para `DISABLED` revoga imediatamente todas as sessões ainda ativas com motivo `user_disabled`; a validação de identidade desabilitada também força essa revogação antes de negar o login.

## CSRF e origem

Toda operação mutável autenticada por cookie exige `Origin` exatamente igual a `APP_ORIGIN`. Origem ausente ou diferente é rejeitada com `AUTH_REQUEST_ORIGIN_INVALID`. A exceção `AUTH_ALLOW_MISSING_ORIGIN=true` existe apenas para adaptadores locais/testes deliberados.

A materialização automática de recorrências em `/cartoes` e `/lancamentos` é iniciada por um `POST` same-origin do navegador. O adaptador web encaminha o cookie e o `Origin` recebido; não transforma o cookie produtivo em Bearer externo nem executa a mutação durante o `GET` da página.

`SameSite=Lax` é defesa complementar e não substitui a validação de origem.

## Contratos locais e legados

Os contratos abaixo existem somente em `development`, `local`, `test` ou demonstração não produtiva explicitamente autorizada por `AUTH_ALLOW_DEMO=true`:

- `POST /api/session`;
- `POST /api/users`;
- `POST /api/session/oidc` com `idToken` fornecido pelo cliente;
- autenticação `Authorization: Bearer`.

Fora desses ambientes, o servidor remove qualquer Bearer recebido externamente antes de chamar roteadores internos. Somente um cookie produtivo previamente validado pode ser convertido em credencial interna transitória para os roteadores legados. Produção nunca recorre à sessão em memória quando a sessão persistida estiver ausente ou indisponível.

`NODE_ENV` deve existir explicitamente e usar apenas `development`, `local`, `test` ou `production`. Ausência ou valor desconhecido interrompe a inicialização; os comandos `start` das aplicações definem `NODE_ENV=production`.

As rotas locais de login e cadastro verificam a elegibilidade do ambiente antes de ler ou validar o corpo, garantindo `AUTH_LOCAL_AUTH_DISABLED` mesmo para payload malformado fora dos ambientes autorizados.

## Identidade e tenant

O vínculo canônico é `externalAuthProvider + externalAuthSubject`. A primeira autenticação válida pode vincular um usuário local sem provider ou criar `User`, `Organization` e `FinancialProfile` pessoal de forma idempotente.

A vinculação usa lock da linha do usuário, compare-and-set dos campos ainda nulos e constraints únicas. Duas identidades diferentes concorrendo pelo mesmo email produzem no máximo uma vencedora. Duas tentativas da mesma identidade retornam o mesmo usuário e não duplicam organização ou perfil. Depois de criado, o vínculo externo é imutável no banco.

O email do ID token somente participa da criação ou vinculação quando a claim `email_verified` é booleana e verdadeira. Tokens de acesso, tokens sem `token_use` e emails não verificados são rejeitados antes de qualquer mutação local.

Credenciais, confirmação de email, recuperação e autenticação forte permanecem sob responsabilidade do Cognito.

## Erros públicos

- `AUTH_RETURN_TO_INVALID`: destino pós-login externo, ambíguo ou malformado;
- `AUTH_REQUEST_ORIGIN_INVALID`: operação mutável por cookie com origem ausente ou divergente;
- `AUTH_OIDC_ATTEMPT_INVALID`: callback ausente, expirado, repetido, cancelado ou inválido;
- `AUTH_OIDC_CONFIGURATION_INVALID`: configuração produtiva incompleta ou incoerente.

Os corpos públicos permanecem genéricos e não revelam token, código, claim, email, provider ou existência de usuário.

## Auditoria

`SecurityAuditEvent` registra eventos operacionais sem material sensível, incluindo criação/consumo/falha/cancelamento de tentativa OIDC, criação de sessão, rotação, logout, revogação, sessão inválida/expirada, bloqueio de fluxo local e origem rejeitada.

A criação da sessão e os eventos `session_created` e `oidc_callback_consumed` são persistidos na mesma transação que marca a tentativa como `CONSUMED`.

## Configuração

Variáveis produtivas:

```env
NODE_ENV=production
APP_ORIGIN=https://app.solverfin.example
OIDC_ISSUER_URL=https://cognito-idp.sa-east-1.amazonaws.com/<user-pool-id>
OIDC_CLIENT_ID=<app-client-id>
OIDC_AUTHORIZATION_URL=https://<prefixo>.auth.sa-east-1.amazoncognito.com/oauth2/authorize
OIDC_TOKEN_URL=https://<prefixo>.auth.sa-east-1.amazoncognito.com/oauth2/token
OIDC_JWKS_URI=https://cognito-idp.sa-east-1.amazonaws.com/<user-pool-id>/.well-known/jwks.json
OIDC_REDIRECT_URI=https://<app>/api/auth/oidc/callback
OIDC_LOGOUT_URL=https://<prefixo>.auth.sa-east-1.amazoncognito.com/logout
OIDC_RECOVERY_URL=https://<prefixo>.auth.sa-east-1.amazoncognito.com/forgotPassword
OIDC_ATTEMPT_ENCRYPTION_KEY=<32-bytes-em-base64>
OIDC_ATTEMPT_TTL_MINUTES=10
OIDC_ATTEMPT_CLEANUP_INTERVAL_MS=60000
AUTH_SESSION_TTL_MINUTES=60
AUTH_SESSION_IDLE_TIMEOUT_MINUTES=30
```

`OIDC_AUDIENCE` permanece apenas como alias de transição e deve coincidir com `OIDC_CLIENT_ID`. O app client usa Authorization Code Grant, PKCE `S256`, scopes mínimos `openid email profile` e não precisa de client secret para o cliente público usado pelo browser. SMS não é o mecanismo padrão; preferir email, passkeys ou aplicativo autenticador conforme a configuração disponível.

Todos os valores reais ficam em secrets por ambiente. Ausência ou incoerência de configuração produtiva impede a inicialização/autenticação produtiva.

### Checklist do app client Cognito

Antes do rollout, confirme que o app client não possui client secret, que Authorization Code Grant e PKCE `S256` estão habilitados e que as URLs exatas de callback e logout de cada ambiente foram cadastradas no Cognito. O domínio gerenciado e o User Pool devem permanecer em `sa-east-1`.

## Testes e validação

A cobertura inclui cookie produtivo/local, ausência de `Domain`, origem exata, transporte de recorrência por cookie, `returnTo` interno, estado de cookie bloqueado, PKCE, hashes de state/nonce, nonce do ID token, `token_use=id`, email verificado, bloqueio dos contratos legados, ambiente de runtime explícito, bloqueio de Bearer externo, rotação atômica, revogação idempotente, revogação ao desabilitar usuário, estados/replay da tentativa, concorrência de vínculo externo, UI produtiva sem senha local e integração PostgreSQL. O gate agregado é `npm run validate`, seguido de `npm run test:integration`.
