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
- `amountMinor` e `currency`, sempre referentes ao leg de origem;
- `destinationAmountMinor` e `destinationCurrency` para transferencias, referentes ao leg nativo de destino;
- `occurredOn`;
- `plannedOn`;
- `effectiveOn` opcional conforme estado;
- `description`;
- `accountId`;
- `destinationAccountId` para transferencias;
- `categoryId` opcional;
- `transferGroupId` para rastrear as pontas de transferencia;
- `reconciledAt` e `voidedAt` quando aplicavel;
- `createdAt` e `updatedAt`;
- `createdByUserId` e `updatedByUserId`.

A semantica canonica e a precedencia por consumidor estao em [`TRANSACTION_DATES.md`](./TRANSACTION_DATES.md). `occurredOn`, `plannedOn` e `effectiveOn` nao sao aliases intercambiaveis.

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

## Invariante de moeda entre lançamento e contas

`Transaction.currency` representa a moeda nativa do valor persistido e deve ser semanticamente compatível com as contas que recebem seu efeito financeiro.

- criação e edição exigem que `Transaction.currency` seja igual a `Account.currency` da conta de origem;
- `amountMinor`/`currency` nunca mudam de significado: representam o valor nativo debitado da origem;
- para transferencia na mesma moeda, o servidor mantém `destinationAmountMinor = amountMinor` e `destinationCurrency = currency`;
- para transferencia entre moedas diferentes, `destinationAmountMinor` é obrigatório, positivo e representa o valor nativo creditado no destino;
- `destinationCurrency` é derivada pelo servidor da `Account.currency` da conta de destino e não é uma moeda livre enviada pelo cliente;
- trocar a conta de origem para outra moeda só é permitido quando `currency` é alterada coerentemente na mesma mutação;
- trocar a conta de destino para outra moeda exige um valor destino compatível; o valor anterior não é reinterpretado em outra moeda;
- nenhuma dessas validações faz conversão cambial, reaproveita paridade ou reconstrói um dos valores nativos por taxa.

Uma relação incompatível na fronteira canônica retorna erro controlado antes da persistência. Como defesa em profundidade, o PostgreSQL também valida cada leg contra a moeda da respectiva conta, deriva `destinationCurrency` do destino e exige `destinationAmountMinor` quando as moedas diferem. Assim, produtores especializados que persistem lançamentos diretamente não conseguem introduzir estado monetariamente ambíguo.

## Transferências originadas por importação

Uma linha CSV revisada como transferência preserva a conta de referência e a direção original. A camada de importação deriva `accountId` e `destinationAccountId`, valida as duas contas no mesmo tenant, perfil e moeda e cria somente uma transação canônica. A segunda ponta pode vincular sua sugestão à transação existente; essa conciliação não altera a proveniência original (`aiSuggestionId` e `importBatchId`) nem cria movimentos adicionais.

Filtros por conta devem considerar tanto `accountId` quanto `destinationAccountId`. Dashboard, relatórios e orçamento contabilizam apenas `income` e `expense`; uma transferência não aumenta receitas, despesas ou resultado e aparece com sinais opostos nos extratos das duas contas.

O contrato agregado de leitura que transforma essas transacoes em periodos, moedas e hierarquia de categorias esta em [`API_REPORTS.md`](./API_REPORTS.md).

## Movimentos financeiros

O contrato de dominio retorna movimentos derivados para que a camada de
persistencia ou saldo aplique o efeito correto:

```text
income   -> credit na conta de origem
expense  -> debit na conta de origem
transfer -> debit na conta origem e credit na conta destino
```

Lancamento `voided` nao gera movimento ativo. Se ele foi anulado antes de qualquer efeito de caixa, `effectiveOn` permanece ausente. Se foi anulado depois de `posted`/`reconciled`, a data efetiva anterior permanece apenas como historico do fato que ocorreu antes da anulacao.

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
plannedFrom=YYYY-MM-DD
plannedTo=YYYY-MM-DD
effectiveFrom=YYYY-MM-DD
effectiveTo=YYYY-MM-DD
```

### POST /transactions

`occurredOn` e obrigatorio na fronteira generica de criacao. `plannedOn` ou `effectiveOn` podem coincidir com ele quando o caso de negocio exigir, mas nunca substituem silenciosamente sua ausencia.

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

Transferencia na mesma moeda:

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

Transferencia cross-currency, caso normativo de 538,32 BRL para 100,00 USD:

```json
{
  "kind": "transfer",
  "amountMinor": 53832,
  "currency": "BRL",
  "destinationAmountMinor": 10000,
  "occurredOn": "2026-06-15",
  "accountId": "account-brl",
  "destinationAccountId": "account-usd"
}
```

A resposta preserva `currency: "BRL"`, `destinationAmountMinor: 10000` e expõe `destinationCurrency: "USD"`, derivada pelo servidor. Os dois valores pertencem à mesma identidade de `Transaction`; não são duas receitas/despesas independentes.

### PATCH /transactions/:transactionId

Permite alterar tipo, status, fonte, valor de origem, `destinationAmountMinor`, moeda, datas, descricao, conta,
conta destino e categoria quando as validacoes forem atendidas. Alterações de `currency`, `accountId`, `destinationAccountId` ou do valor destino são validadas em conjunto antes de qualquer persistência. `destinationCurrency` continua sendo derivada do cadastro da conta destino.

Quando o lançamento pertence a uma transferência fixa e a edição usa `applyToFuturePlanned: true`, o destino continua obrigatoriamente na mesma moeda da origem: um destino em outra moeda retorna `400 RECURRENCE_TRANSFER_CURRENCY_UNSUPPORTED` antes de qualquer persistência (#677). A edição somente do lançamento selecionado continua seguindo as regras cross-currency acima.

Atualizar para `reconciled` define `reconciledAt` quando ainda nao existir e exige semantica efetiva coerente.

Atualizar para `voided` define `voidedAt` quando ainda nao existir e nao cria efeito de caixa por causa da anulacao: um `planned`/`suggested` continua sem `effectiveOn`, enquanto um registro que ja possuia `effectiveOn` preserva esse valor historico. Se um `voided` sem historico efetivo for posteriormente reativado para `posted`/`reconciled` sem `effectiveOn` explicito, a data civil UTC da transicao e usada como nova data efetiva.

### POST /transactions/:transactionId/void

Executa exclusao logica do lancamento, preservando historico e auditoria. A operacao segue a mesma regra temporal da transicao para `voided`: nao fabrica `effectiveOn` para compromisso nunca efetivado e nao apaga `effectiveOn` historico de movimento anteriormente realizado.

## Validacoes

Regras principais:

- valor deve ser inteiro positivo em unidade minima da moeda;
- `occurredOn` e obrigatorio na criacao generica;
- `plannedOn` e `effectiveOn` nao sao fallback para `occurredOn`;
- `posted`/`reconciled` exigem data efetiva valida segundo o contrato temporal;
- `planned`/`suggested` permanecem sem data efetiva;
- anulacao antes da efetivacao nao pode criar `effectiveOn`;
- conta de origem deve existir no tenant ativo e estar ativa;
- moeda do lançamento deve ser igual à moeda da conta de origem;
- transferência same-currency usa o mesmo valor nas duas pontas;
- transferência cross-currency exige `destinationAmountMinor` inteiro positivo; `destinationCurrency` vem da conta destino;
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
400 TRANSACTION_EFFECTIVE_DATE_REQUIRED
400 TRANSACTION_ACCOUNT_REQUIRED
400 TRANSACTION_ACCOUNT_INVALID
400 TRANSACTION_ACCOUNT_ARCHIVED
400 TRANSACTION_DESTINATION_ACCOUNT_REQUIRED
400 TRANSACTION_DESTINATION_ACCOUNT_INVALID
400 TRANSACTION_DESTINATION_AMOUNT_REQUIRED
400 TRANSACTION_DESTINATION_AMOUNT_INVALID
400 TRANSACTION_TRANSFER_SAME_ACCOUNT
400 TRANSACTION_CURRENCY_MISMATCH
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
- rejeição de moeda divergente entre lançamento e conta de origem;
- transferência cross-currency com dois valores nativos sob uma identidade lógica;
- rejeição de cross-currency sem valor destino e preservação de transferências same-currency;
- rejeição de edição que torne `currency` e conta incompatíveis, com caso positivo de troca coerente de conta e moeda;
- valor invalido;
- conta arquivada;
- transferencia para a mesma conta;
- categoria incompativel com tipo;
- listagem e edicao no tenant ativo;
- acesso indevido por outro tenant;
- exclusao logica com auditoria;
- separacao entre evento, planejamento e efeito de caixa;
- anulacao antes/depois de efetivacao e reativacao de registro nunca efetivado.

A camada de API também possui controle integrado que tenta persistir relações monetárias incompatíveis por escrita SQL direta, criação, transferência e edição, relê o lançamento e compara o resumo financeiro antes/depois para provar ausência de efeito residual.

A camada de API tambem possui controle de fronteira para provar que `plannedOn`/`effectiveOn` nao preenchem `occurredOn` durante `POST /api/transactions`.

Todos os exemplos usam dados ficticios.

## Parcelamento manual canônico

A criação parcelada do Extrato não usa múltiplos `POST /api/transactions`. O cliente chama `POST /api/installments`, e cada transação resultante recebe `source=installment` e `installmentId`. A descrição base não recebe sufixo `N/M`; a sequência pertence ao registro `Installment`, e a observação permanece em `Transaction.note`.
