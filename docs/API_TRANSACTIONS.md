# API de lancamentos financeiros

## Agrupamentos de apresentacao

`TransactionGroup` consolida visualmente lancamentos no Extrato sem criar movimento financeiro.
Os membros continuam sendo a fonte de saldo, Dashboard, relatorios e orcamento.

- `POST /api/transaction-groups`: recebe `memberIds` (minimo 2), `description` (1-240) e `displayOn` (`YYYY-MM-DD`).
- `GET /api/transaction-groups?accountId=...&startsOn=...&endsOn=...`: lista projecoes pela data de exibicao.
- `GET /api/transaction-groups/:groupId`: retorna grupo e todos os membros originais.
- `DELETE /api/transaction-groups/:groupId`: remove somente o agrupamento.

Os contratos sao autenticados e isolados por organizacao e perfil financeiro. Recursos de outro
contexto retornam `404 TENANT_RESOURCE_NOT_FOUND`. Erros especificos distinguem selecao
insuficiente, incompatibilidade, inelegibilidade, associacao existente e conflito concorrente.

## Objetivo

Este contrato descreve a API inicial de lancamentos financeiros do SolverFin.
Como o framework HTTP ainda nao foi escolhido por ADR, a regra executavel fica
no servico de dominio `packages/domain/src/transactions.ts`.

Lancamentos sao o fluxo central para receitas, despesas e transferencias. Eles
alimentam saldo, dashboard, relatorios, orcamentos, conciliacao, importacao e
auditoria.

## Modelo

Campos principais de lancamento:

- `id`;
- `organizationId`;
- `financialProfileId`;
- `kind`;
- `status`;
- `source`;
- `amountMinor`;
- `currency`;
- `occurredOn`;
- `description`;
- `accountId`;
- `destinationAccountId` para transferencias;
- `categoryId` opcional;
- `transferGroupId` para rastrear as pontas de transferencia;
- `reconciledAt` e `voidedAt` quando aplicavel;
- `createdAt` e `updatedAt`;
- `createdByUserId` e `updatedByUserId`.

Tipos aceitos:

```text
income
expense
transfer
```

Status aceitos:

```text
planned
posted
reconciled
suggested
voided
```

Fontes aceitas:

```text
manual
recurrence
installment
import
ai_suggestion
account_remuneration
```

Lançamentos com fonte `account_remuneration` podem incluir o objeto opcional
`accountRemuneration`, com competência, memória do cálculo original e estado do ajuste manual. O
contrato detalhado está em [`API_ACCOUNT_REMUNERATION.md`](./API_ACCOUNT_REMUNERATION.md).

## Tenant

Toda operacao deve receber um `TenantContext` resolvido no servidor.

Leitura, edicao, exclusao logica ou listagem de lancamento de outro tenant devem
retornar:

```text
404 TENANT_RESOURCE_NOT_FOUND
```

Payload tentando trocar `organizationId` ou `financialProfileId` deve retornar:

```text
403 TENANT_PAYLOAD_SCOPE_FORBIDDEN
```

## Transferências originadas por importação

Uma linha CSV revisada como transferência preserva a conta de referência e a direção original. A camada de importação deriva `accountId` e `destinationAccountId`, valida as duas contas no mesmo tenant, perfil e moeda e cria somente uma transação canônica. A segunda ponta pode vincular sua sugestão à transação existente; essa conciliação não altera a proveniência original (`aiSuggestionId` e `importBatchId`) nem cria movimentos adicionais.

Filtros por conta devem considerar tanto `accountId` quanto `destinationAccountId`. Dashboard, relatórios e orçamento contabilizam apenas `income` e `expense`; uma transferência não aumenta receitas, despesas ou resultado e aparece com sinais opostos nos extratos das duas contas.

## Movimentos financeiros

O contrato de dominio retorna movimentos derivados para que a camada de
persistencia ou saldo aplique o efeito correto:

```text
income   -> credit na conta de origem
expense  -> debit na conta de origem
transfer -> debit na conta origem e credit na conta destino
```

Lancamento `voided` nao gera movimento ativo.

## Endpoints HTTP pretendidos

Quando a API HTTP existir, os endpoints devem seguir este comportamento:

```http
GET /transactions
GET /transactions/:transactionId
POST /transactions
PATCH /transactions/:transactionId
POST /transactions/:transactionId/void
```

### GET /transactions

Lista lancamentos do contexto ativo.

Filtros opcionais:

```text
status=planned|posted|reconciled|suggested|voided|all
kind=income|expense|transfer
accountId=<id>
categoryId=<id>
occurredFrom=YYYY-MM-DD
occurredTo=YYYY-MM-DD
```

### POST /transactions

Receita:

```json
{
  "kind": "income",
  "amountMinor": 150000,
  "occurredOn": "2026-06-15",
  "accountId": "account-demo",
  "categoryId": "category-income",
  "description": "Recebimento demo"
}
```

Despesa:

```json
{
  "kind": "expense",
  "amountMinor": 4590,
  "occurredOn": "2026-06-15",
  "accountId": "account-demo",
  "categoryId": "category-expense"
}
```

Transferencia:

```json
{
  "kind": "transfer",
  "amountMinor": 20000,
  "occurredOn": "2026-06-15",
  "accountId": "account-origin",
  "destinationAccountId": "account-destination",
  "categoryId": "category-transfer"
}
```

### PATCH /transactions/:transactionId

Permite alterar tipo, status, fonte, valor, moeda, data, descricao, conta,
conta destino e categoria quando as validacoes forem atendidas.

Atualizar para `reconciled` define `reconciledAt` quando ainda nao existir.
Atualizar para `voided` define `voidedAt` quando ainda nao existir.

### POST /transactions/:transactionId/void

Executa exclusao logica do lancamento, preservando historico e auditoria.

## Validacoes

Regras principais:

- valor deve ser inteiro positivo em unidade minima da moeda;
- data do lancamento e obrigatoria;
- conta de origem deve existir no tenant ativo e estar ativa;
- categoria, quando enviada, deve existir no tenant ativo, estar ativa e ser
  compativel com o tipo do lancamento;
- transferencia exige conta origem e destino diferentes;
- apenas transferencia pode informar conta destino;
- erros nao devem revelar dados de outro tenant.

## Auditoria

Criacao, atualizacao e exclusao logica retornam `AuditLogEntryDraft` com
alteracoes redigidas. Valores, descricoes completas e payloads financeiros nao
devem ser registrados em log ou auditoria bruta.

## Erros de validacao

Erros controlados do contrato de dominio:

```text
400 TRANSACTION_KIND_REQUIRED
400 TRANSACTION_KIND_INVALID
400 TRANSACTION_STATUS_INVALID
400 TRANSACTION_SOURCE_INVALID
400 TRANSACTION_AMOUNT_INVALID
400 TRANSACTION_DATE_REQUIRED
400 TRANSACTION_ACCOUNT_REQUIRED
400 TRANSACTION_ACCOUNT_INVALID
400 TRANSACTION_ACCOUNT_ARCHIVED
400 TRANSACTION_DESTINATION_ACCOUNT_REQUIRED
400 TRANSACTION_DESTINATION_ACCOUNT_INVALID
400 TRANSACTION_TRANSFER_SAME_ACCOUNT
400 TRANSACTION_CATEGORY_INVALID
400 TRANSACTION_CATEGORY_ARCHIVED
400 CATEGORY_TRANSACTION_KIND_INVALID
404 TENANT_RESOURCE_NOT_FOUND
403 TENANT_PAYLOAD_SCOPE_FORBIDDEN
```

## Testes

O pacote `@solverfin/domain` cobre:

- criacao de receita;
- criacao de despesa;
- transferencia com movimentos coerentes;
- valor invalido;
- conta arquivada;
- transferencia para a mesma conta;
- categoria incompativel com tipo;
- listagem e edicao no tenant ativo;
- acesso indevido por outro tenant;
- exclusao logica com auditoria.

Todos os exemplos usam dados ficticios.
