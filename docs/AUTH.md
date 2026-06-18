# Autenticacao inicial

## Objetivo

A autenticacao inicial do SolverFin define um contrato simples e testavel para
login, cadastro local, logout, sessao autenticada e protecao de rotas privadas.

A estrategia produtiva definitiva esta aceita na ADR
`docs/adr/0004-autenticacao-produtiva.md`: producao deve usar provider
gerenciado compativel com OIDC/OAuth2, credenciais delegadas ao provider e
sessao propria persistente, revogavel e auditavel no SolverFin.

## Estrategia atual

O modulo `apps/api/src/auth.ts` implementa uma camada pura de autenticacao para a
API:

- recebe usuarios e hashes por injecao;
- permite registrar credenciais carregadas do banco durante o login;
- recebe verificador de senha por injecao;
- recebe gerador de id de sessao por injecao;
- usa armazenamento de sessao em memoria por padrao para desenvolvimento e
  testes;
- expoe guard para rotas privadas;
- expoe autenticacao opcional para rotas publicas;
- retorna erros controlados sem vazar detalhes sensiveis.

O modulo `apps/api/src/auth-service.ts` conecta essa camada ao PostgreSQL para o
MVP local. A rota publica `POST /api/users` cria um usuario ativo, uma
organizacao e um perfil financeiro pessoal padrao em uma transacao. A rota
`POST /api/session` primeiro tenta o usuario demo em memoria e, quando as
credenciais nao batem, consulta o usuario persistido no banco pelo email.

Essa abordagem existe para desenvolvimento local e validacao do MVP. Ela nao e o
modelo produtivo aceito. Em producao, o SolverFin nao deve armazenar senha nem
hash de senha produtivo; deve mapear um usuario local ao `subject` externo do
provider e criar sessao propria da aplicacao apos validar a identidade externa.

## Fronteira da autenticacao demo

O modulo `apps/api/src/auth-service.ts` registra um usuario demo com senha
ficticia, hash SHA-256 simples e sessoes em memoria. Essa configuracao existe
exclusivamente para desenvolvimento local, testes automatizados e demonstracoes
nao produtivas explicitamente autorizadas.

A API bloqueia a autenticacao demo fora de ambientes locais por padrao. O servico
so carrega quando `NODE_ENV` e `development`, `local` ou `test`. Em qualquer
outro ambiente, como `production`, `staging` ou `preview`, o processo falha cedo
a menos que `AUTH_ALLOW_DEMO=true` tenha sido configurado de forma deliberada
para uma demonstracao nao produtiva e sem dados reais.

`AUTH_ALLOW_DEMO=true` nao torna essa camada adequada para producao. Ela apenas
remove o bloqueio operacional para um ambiente controlado e temporario.

## Contrato produtivo aceito

A implementacao produtiva deve seguir estes principios:

- credenciais de usuarios reais ficam delegadas ao provider gerenciado;
- o SolverFin valida tokens/assertions do provider antes de criar sessao local;
- o usuario local e vinculado ao identificador externo do provider;
- organizacao e perfil financeiro continuam sendo resolvidos no banco do
  SolverFin;
- sessoes da aplicacao devem ser persistentes, revogaveis e auditaveis;
- tokens de sessao devem ser opacos e armazenados como hash no banco;
- logout deve revogar a sessao ativa;
- eventos de seguranca devem ser auditados sem registrar senha, token bruto ou
  resposta sensivel do provider;
- erros de autenticacao devem permanecer genericos e seguros.

## Variaveis locais

`.env.example` inclui:

```env
AUTH_SESSION_TTL_MINUTES=60
AUTH_ALLOW_DEMO=false
```

`AUTH_SESSION_TTL_MINUTES` e opcional. Quando ausente, o contrato de ambiente usa
60 minutos. Ela nao e segredo e deve conter apenas um inteiro positivo.

`AUTH_ALLOW_DEMO` tambem nao e segredo. Mantenha `false` em desenvolvimento local
padrao. Use `true` apenas quando uma demonstracao nao produtiva precisar carregar
a autenticacao demo fora de `development`, `local` ou `test`.

Variaveis produtivas do provider, como issuer, client id, client secret, JWKS,
redirect URI e segredo de sessao, devem ser adicionadas pela issue de
implementacao e configuradas apenas nos ambientes que precisarem delas.

## Cadastro

No MVP local, o cadastro recebe nome, email e senha. A senha precisa ter pelo
menos 8 caracteres. Quando o email ja existe, a API retorna erro controlado sem
expor hashes, dados internos ou detalhes do banco:

```text
AUTH_USER_ALREADY_EXISTS
```

Ao cadastrar com sucesso, a API cria a sessao e retorna o mesmo contrato do
login, permitindo que a web direcione a pessoa para o dashboard imediatamente.

Em producao, cadastro, confirmacao de email e recuperacao de conta devem ser
executados pelo provider gerenciado ou por fluxo aprovado que delegue
credenciais ao provider.

## Login

O login local recebe email e senha. Credenciais invalidas retornam erro
generico:

```text
AUTH_INVALID_CREDENTIALS
```

O sistema nao deve revelar se o email existe, se a senha falhou ou qualquer
detalhe interno do provedor.

Usuarios desabilitados retornam:

```text
AUTH_USER_DISABLED
```

Em producao, login deve validar identidade externa e criar uma sessao propria do
SolverFin apenas depois dessa validacao.

## Logout

O logout remove a sessao do armazenamento configurado. Depois disso, qualquer
rota privada usando a mesma sessao deve retornar:

```text
AUTH_SESSION_INVALID
```

Em producao, logout deve revogar a sessao persistente ativa e, quando o provider
suportar, tambem acionar o encerramento federado ou orientar a UI conforme o
fluxo escolhido.

## Rotas privadas

Rotas privadas devem chamar `requireAuthenticatedRequest` com o header
`Authorization`.

Formato aceito no MVP local:

```http
Authorization: Bearer <session-id>
```

Quando a sessao estiver ausente, invalida ou expirada, a rota deve falhar com
erro controlado.

## Rotas publicas

Rotas publicas podem chamar `getOptionalAuthenticatedRequest`. Sem sessao, o
retorno e `undefined`; com sessao valida, o retorno e o usuario autenticado.

## Sessao expirada

Sessao expirada retorna:

```text
AUTH_SESSION_EXPIRED
```

A sessao expirada e removida do armazenamento em memoria.

Em producao, sessoes devem ter timeout absoluto, timeout por inatividade,
renovacao controlada e revogacao explicita.

## Limitacoes conhecidas

- O hash SHA-256 simples permanece adequado apenas ao MVP local.
- As sessoes atuais continuam em memoria; reiniciar a API encerra sessoes
  abertas, mas o usuario cadastrado permanece no banco e pode entrar novamente.
- MFA, recuperacao de senha, confirmacao de email e protecoes contra abuso ficam
  sob responsabilidade do provider produtivo definido pela ADR 0004.
- Auditoria produtiva de eventos de seguranca ainda precisa ser implementada.

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
- bloqueio da autenticacao demo fora de ambiente local/teste sem opt-in explicito.

Todos os testes usam usuarios ficticios e nao dependem de segredos reais.
