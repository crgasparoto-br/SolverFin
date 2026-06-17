# ADR-0002 - Runtime web e sessao local do MVP

## Status

Aceito

## Data

2026-06-16

## Contexto

A epica #120 solicita um MVP navegavel com login, sessao, layout autenticado, dashboard financeiro inicial e preservacao de `/health` e `/manifest.webmanifest`.

O repositorio ja possui monorepo TypeScript, servidor de desenvolvimento simples em `apps/web`, base de autenticacao em `apps/api`, padrao seguro de erro e schema/seed financeiro inicial. Ainda nao ha framework frontend ou backend dedicado definido.

## Decisao

Para o MVP local, manter `apps/web` como processo unico de desenvolvimento em TypeScript/Node HTTP, com:

- roteamento explicito para `/`, `/login`, `/dashboard` e paginas internas placeholder;
- API minima no mesmo processo web para `POST /api/session`, `DELETE /api/session`, `GET /api/me` e `GET /api/financial-summary`;
- contratos logicos equivalentes e testaveis em `apps/api/src/mvp.ts`;
- sessao local em memoria, identificada por cookie `HttpOnly`, `SameSite=Lax`, com expiracao configuravel por `AUTH_SESSION_TTL_MINUTES`;
- usuario demo ficticio `demo@solverfin.example.invalid` e senha demo ficticia documentada apenas para desenvolvimento local;
- dados financeiros demonstrativos em BRL e em unidades menores.

## Consequencias

- O MVP pode ser executado com `npm run dev` na raiz sem introduzir framework novo antes da decisao definitiva.
- A sessao em memoria e suficiente para desenvolvimento local, mas nao e uma solucao de producao nem multi-processo.
- A API minima fica consumivel pelo web app e protegida por sessao, enquanto `apps/api` preserva contratos testaveis para futura separacao em processo proprio.
- Uma ADR futura deve escolher framework web/backend definitivo antes de ampliar o produto para producao, deploy ou integracoes externas.

## Alternativas consideradas

### Adotar framework web agora

Resolveria roteamento e API com mais recursos, mas anteciparia uma escolha duradoura ampla no mesmo pacote da epica MVP.

### Rodar `apps/api` como processo separado

Melhor separacao operacional, mas adicionaria orquestracao local e variaveis antes do fluxo MVP estar validado.

### Bearer token em memoria do navegador

E simples para testes, mas o cookie `HttpOnly` reduz exposicao acidental do token no frontend local.
