# Autenticacao inicial

## Objetivo

A autenticacao inicial do SolverFin define um contrato simples e testavel para
login, cadastro local, logout, sessao autenticada e protecao de rotas privadas
enquanto o framework HTTP e o provider definitivo ainda nao foram escolhidos por
ADR.

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

Essa abordagem ainda nao substitui a decisao produtiva definitiva de
autenticacao. Ela existe para permitir que o MVP local crie usuarios reais no
banco de desenvolvimento e aceite login posterior com esses usuarios.

## Fronteira da autenticacao demo

O modulo `apps/api/src/auth-service.ts` registra um usuario demo com senha
ficticia, hash SHA-256 simples e sessoes em memoria. Essa configuracao existe
exclusivamente para desenvolvimento local, testes automatizados e demonstracoes
nao produtivas explicitamente autorizadas.

A API bloqueia a autenticacao demo fora de ambientes locais por padrao. O servico
so carrega quando `NODE_ENV` e `development`, `local` ou `test`. Em qualquer
outro ambiente, como `production`, `staging` ou `preview`, o processo falha cedo
a menos que `AUTH_ALLOW_DEMO=true` tenha sido configurado de forma deliberada
para uma demonstracao nao produtiva.

`AUTH_ALLOW_DEMO=true` nao torna essa camada adequada para producao. Ela apenas
remove o bloqueio operacional para um ambiente controlado e temporario. Para uso
produtivo com usuarios reais, a decisao definitiva de autenticacao deve seguir a
ADR `docs/adr/0004-autenticacao-produtiva.md`.

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

## Cadastro

O cadastro recebe nome, email e senha. A senha precisa ter pelo menos 8
caracteres. Quando o email ja existe, a API retorna erro controlado sem expor
hashes, dados internos ou detalhes do banco:

```text
AUTH_USER_ALREADY_EXISTS
```

Ao cadastrar com sucesso, a API cria a sessao e retorna o mesmo contrato do
login, permitindo que a web direcione a pessoa para o dashboard imediatamente.

## Login

O login recebe email e senha. Credenciais invalidas retornam erro generico:

```text
AUTH_INVALID_CREDENTIALS
```

O sistema nao deve revelar se o email existe, se a senha falhou ou qualquer
detalhe interno do provedor.

Usuarios desabilitados retornam:

```text
AUTH_USER_DISABLED
```

## Logout

O logout remove a sessao do armazenamento configurado. Depois disso, qualquer
rota privada usando a mesma sessao deve retornar:

```text
AUTH_SESSION_INVALID
```

## Rotas privadas

Rotas privadas devem chamar `requireAuthenticatedRequest` com o header
`Authorization`.

Formato aceito:

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

## Limitacoes conhecidas

- O hash SHA-256 simples permanece adequado apenas ao MVP local; a estrategia
  produtiva deve usar hashing proprio para senhas ou delegar credenciais a um
  provider gerenciado.
- As sessoes continuam em memoria; reiniciar a API encerra sessoes abertas, mas
  o usuario cadastrado permanece no banco e pode entrar novamente.
- MFA, recuperacao de senha, confirmacao de email e auditoria de eventos de
  seguranca continuam fora do escopo desta etapa.

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
