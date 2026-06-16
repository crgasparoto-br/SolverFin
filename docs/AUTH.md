# Autenticacao inicial

## Objetivo

A autenticacao inicial do SolverFin define um contrato simples e testavel para
login, logout, sessao autenticada e protecao de rotas privadas enquanto o
framework HTTP e o provider definitivo ainda nao foram escolhidos por ADR.

## Estrategia atual

O modulo `apps/api/src/auth.ts` implementa uma camada pura de autenticacao para a
API:

- recebe usuarios e hashes por injecao;
- recebe verificador de senha por injecao;
- recebe gerador de id de sessao por injecao;
- usa armazenamento de sessao em memoria por padrao para desenvolvimento e
  testes;
- expoe guard para rotas privadas;
- expoe autenticacao opcional para rotas publicas;
- retorna erros controlados sem vazar detalhes sensiveis.

Essa abordagem evita escolher provider externo, biblioteca gerenciada ou
framework HTTP antes da decisao tecnica formal. Quando a API real existir, a
camada pode ser conectada a banco, cookies seguros, headers ou provider externo.

## Variaveis locais

`.env.example` inclui:

```env
AUTH_SESSION_TTL_MINUTES=60
```

A variavel e opcional. Quando ausente, o contrato de ambiente usa 60 minutos.
Ela nao e segredo e deve conter apenas um inteiro positivo.

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

## Testes

O pacote `@solverfin/api` cobre:

- rota publica sem usuario autenticado;
- login com email normalizado;
- rota privada autenticada;
- logout invalidando sessao;
- credenciais invalidas;
- usuario desabilitado;
- sessao expirada;
- parsing de header `Bearer`.

Todos os testes usam usuarios ficticios e nao dependem de segredos reais.
