# API de contas financeiras

## Objetivo

Este contrato descreve a API inicial de contas financeiras do SolverFin. Como o
framework HTTP ainda nao foi escolhido por ADR, a regra executavel fica no
servico de dominio `packages/domain/src/accounts.ts`.

A futura API HTTP deve chamar esse contrato para manter validacao, tenant e
respostas consistentes.

## Modelo

Conta financeira representa carteira, conta corrente, poupanca, investimento ou
outro tipo simples usado pelo MVP.

Campos principais:

- `id`;
- `organizationId`;
- `financialProfileId`;
- `name`;
- `kind`;
- `status`;
- `currency`;
- `openingBalanceMinor`;
- `maskedIdentifier` opcional;
- `createdAt` e `updatedAt`;
- `createdByUserId` e `updatedByUserId`.

Tipos iniciais aceitos:

```text
checking
savings
cash
investment
other
```

Conta profissional e representada pelo perfil financeiro ativo, por exemplo um
perfil `mei` ou `business`, e nao por um tipo separado de conta nesta etapa.

## Tenant

Toda operacao deve receber um `TenantContext` resolvido no servidor.

O cliente nao deve escolher `organizationId` ou `financialProfileId` para criar
contas. O servidor aplica o contexto ativo com `applyTenantScope`.

Leitura, edicao e arquivamento de conta de outro tenant devem retornar:

```text
404 TENANT_RESOURCE_NOT_FOUND
```

## Endpoints HTTP pretendidos

Quando a API HTTP existir, os endpoints devem seguir este comportamento:

```http
GET /accounts
GET /accounts/:accountId
POST /accounts
PATCH /accounts/:accountId
POST /accounts/:accountId/archive
```

### GET /accounts

Lista contas do contexto ativo.

Filtro opcional:

```text
status=active|archived|all
```

Sem filtro, retorna apenas contas `active`.

### GET /accounts/:accountId

Retorna uma conta do contexto ativo. Conta inexistente ou de outro tenant deve
ser tratada como 404.

### POST /accounts

Payload:

```json
{
  "name": "Conta Principal",
  "kind": "checking",
  "openingBalanceMinor": 0,
  "currency": "BRL",
  "maskedIdentifier": "Final 1234"
}
```

Campos obrigatorios:

- `name`;
- `kind`.

Padroes:

- `status`: `active`;
- `currency`: `BRL`;
- `openingBalanceMinor`: `0`.

### PATCH /accounts/:accountId

Permite atualizar nome, tipo, status, moeda, identificador mascarado e saldo
inicial quando ainda nao houver movimentacoes vinculadas.

Se ja existirem lancamentos da conta, alteracao de saldo inicial deve retornar:

```text
400 ACCOUNT_OPENING_BALANCE_LOCKED
```

### POST /accounts/:accountId/archive

Arquiva a conta. Hard delete fica fora do escopo do MVP, especialmente quando
houver historico financeiro.

## Erros de validacao

Erros controlados do contrato de dominio:

```text
400 ACCOUNT_NAME_REQUIRED
400 ACCOUNT_KIND_REQUIRED
400 ACCOUNT_KIND_INVALID
400 ACCOUNT_CURRENCY_INVALID
400 ACCOUNT_OPENING_BALANCE_INVALID
400 ACCOUNT_OPENING_BALANCE_LOCKED
404 TENANT_RESOURCE_NOT_FOUND
403 TENANT_PAYLOAD_SCOPE_FORBIDDEN
```

Mensagens de erro devem ser claras para o usuario final e nao devem expor dados
financeiros sensiveis.

## Testes

O pacote `@solverfin/domain` cobre:

- criacao de conta;
- validacao de nome e moeda;
- listagem filtrada por tenant e status;
- edicao de conta;
- arquivamento;
- bloqueio de acesso a conta de outro tenant;
- bloqueio de edicao de saldo inicial quando ha movimentacoes.

Todos os exemplos usam dados ficticios.
