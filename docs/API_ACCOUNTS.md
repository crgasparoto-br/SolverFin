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
inicial.

Quando a conta ja possui movimentacoes, o campo `openingBalanceMinor` e
idempotente:

- se for omitido, o saldo inicial persistido e mantido;
- se repetir exatamente o valor persistido, a atualizacao e aceita;
- se for informado com valor invalido, retorna `ACCOUNT_OPENING_BALANCE_INVALID`;
- somente uma mudanca real do valor retorna:

```text
400 ACCOUNT_OPENING_BALANCE_LOCKED
```

Uma conta com remuneracao CDI ativa deve permanecer ativa e em `BRL`. Antes de
alterar a moeda para outra divisa ou mudar o status para arquivado, a remuneracao
deve ser desativada por sua API dedicada. Caso contrario, retorna:

```text
409 ACCOUNT_REMUNERATION_MUST_BE_DISABLED
```

### POST /accounts/:accountId/archive

Arquiva a conta. Hard delete fica fora do escopo do MVP, especialmente quando
houver historico financeiro.

O arquivamento tambem retorna `409 ACCOUNT_REMUNERATION_MUST_BE_DISABLED` quando
a conta ainda possui configuracao CDI ativa.

## Erros de validacao

Erros controlados do contrato de dominio:

```text
400 ACCOUNT_NAME_REQUIRED
400 ACCOUNT_KIND_REQUIRED
400 ACCOUNT_KIND_INVALID
400 ACCOUNT_CURRENCY_INVALID
400 ACCOUNT_OPENING_BALANCE_INVALID
400 ACCOUNT_OPENING_BALANCE_LOCKED
409 ACCOUNT_REMUNERATION_MUST_BE_DISABLED
404 TENANT_RESOURCE_NOT_FOUND
403 TENANT_PAYLOAD_SCOPE_FORBIDDEN
```

Mensagens de erro devem ser claras para o usuario final e nao devem expor dados
financeiros sensiveis.

## Testes

O pacote `@solverfin/domain` e a integracao da API cobrem:

- criacao de conta;
- validacao de nome e moeda;
- listagem filtrada por tenant e status;
- edicao de conta;
- arquivamento;
- bloqueio de acesso a conta de outro tenant;
- atualizacao idempotente do saldo inicial quando ha movimentacoes;
- bloqueio de mudanca real do saldo inicial quando ha movimentacoes;
- bloqueio de moeda e arquivamento enquanto a remuneracao CDI estiver ativa.

Todos os exemplos usam dados ficticios.
