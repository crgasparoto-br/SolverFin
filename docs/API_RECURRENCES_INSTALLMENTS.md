# API de recorrencias e parcelamentos

## Objetivo

Este contrato descreve a API inicial para contas recorrentes, assinaturas e compras parceladas do SolverFin. Como o framework HTTP ainda nao foi escolhido por ADR, a regra executavel fica no servico de dominio `packages/domain/src/recurrences.ts`.

A futura API HTTP deve chamar esse contrato para gerar previsoes sem duplicar, pausar ou cancelar recorrencias e manter tenant/contexto consistente.

## Modelo

Recorrencia representa uma regra de geracao futura com:

- `id`;
- `organizationId`;
- `financialProfileId`;
- `status`;
- `kind` (`income` ou `expense`);
- `frequency`;
- `startOn`;
- `endOn` opcional;
- `amountMinor`;
- `currency`;
- `description`;
- `accountId` opcional;
- `cardId` opcional;
- `categoryId` opcional.

Uma recorrencia pertence a exatamente um destino: `accountId` (lancamento fixo de conta) ou `cardId` (compra fixa/assinatura no cartao), nunca os dois nem nenhum. `createRecurrence`/`updateRecurrence` rejeitam com `RECURRENCE_TARGET_REQUIRED` quando faltam os dois e `RECURRENCE_TARGET_CONFLICT` quando ambos sao informados.

Recorrencia vinculada a `cardId` tem `kind` sempre forcado para `expense` (compra de cartao nunca e receita). Recorrencia vinculada a `accountId` exige `kind` explicito no payload — sem ele, `createRecurrence`/`updateRecurrence` rejeitam com `RECURRENCE_KIND_REQUIRED`. Quando uma `categoryId` e informada, a categoria precisa ter o mesmo `kind` da recorrencia, senao a operacao rejeita com `RECURRENCE_CATEGORY_KIND_MISMATCH`.

Parcela representa uma previsao gerada ou uma compra parcelada com:

- `id`;
- `organizationId`;
- `financialProfileId`;
- `status`;
- `sequenceNumber`;
- `totalInstallments`;
- `dueOn`;
- `amountMinor`;
- `currency`;
- `recurrenceId` opcional;
- `cardId` opcional.

## Frequencias e status

Frequencias aceitas:

```text
daily
weekly
monthly
yearly
```

Status de recorrencia:

```text
active
paused
cancelled
completed
```

Status de parcela:

```text
planned
posted
reconciled
cancelled
```

## Tenant

Toda operacao deve receber um `TenantContext` resolvido no servidor.

O cliente nao deve escolher `organizationId` ou `financialProfileId` para criar recorrencias. O servidor aplica o contexto ativo com `applyTenantScope`.

Leitura, edicao, pausa ou cancelamento de recorrencia de outro tenant devem retornar:

```text
404 TENANT_RESOURCE_NOT_FOUND
```

Listagens filtram silenciosamente apenas itens do tenant ativo.

## Endpoints HTTP pretendidos

Quando a API HTTP existir, os endpoints devem seguir este comportamento:

```http
GET /recurrences
GET /recurrences/:recurrenceId
POST /recurrences
PATCH /recurrences/:recurrenceId
POST /recurrences/:recurrenceId/pause
POST /recurrences/:recurrenceId/resume
POST /recurrences/:recurrenceId/cancel
POST /recurrences/:recurrenceId/generate-installments
POST /installment-schedules
POST /installments/cancel-future
```

### POST /recurrences

Payload:

```json
{
  "frequency": "monthly",
  "startOn": "2026-06-10",
  "endOn": "2026-12-10",
  "amountMinor": 4990,
  "description": "Assinatura ficticia",
  "kind": "expense",
  "accountId": "account-demo",
  "categoryId": "category-demo"
}
```

Padroes:

- `status`: `active`;
- `currency`: moeda da conta, ou `BRL` quando a moeda nao for informada em contratos auxiliares.

### Geracao sem duplicidade

`generateRecurrenceInstallments` gera apenas parcelas planejadas que ainda nao existem para a combinacao `recurrenceId + sequenceNumber`. A partir de cada parcela, tambem monta a `Transaction` correspondente (`kind` da recorrencia, `status: planned`, `source: recurrence`, `recurrenceId`/`installmentId` preenchidos) — gerar parcelas materializa lancamentos reais, visiveis no extrato/fatura, e nao so um registro de controle.

Reexecutar a geracao com a mesma janela nao deve duplicar parcelas ja existentes.

Por padrao, recorrencias sem `endOn` geram no maximo 36 ocorrencias por chamada. O chamador pode informar `maxOccurrences` menor ou maior quando houver uma politica operacional explicita.

A API HTTP chama essa geracao em dois momentos automaticos, sem exigir acao do usuario:

- ao criar a recorrencia (`POST /api/recurrences`), materializando imediatamente qualquer vencimento `dueOn <= hoje` (cobre inclusive `startOn` retroativo);
- a cada `GET /api/recurrences` filtrado por `accountId` ou `cardId` (exatamente o que as telas de Extrato e Cartoes chamam), fazendo catch-up de vencimentos pendentes ate hoje antes de listar.

Para recorrencias vinculadas a `cardId`, a materializacao reusa o fluxo de compra de cartao (`registerCardPurchaseForContext`) para que cada ocorrencia resolva a `Invoice` certa, da mesma forma que qualquer outra compra no cartao. Como esse fluxo nao conhece recorrencias, o repository faz um `update` de acompanhamento logo depois para preencher `recurrenceId`/`installmentId` na `Transaction` resultante — a web depende desses dois campos para mostrar o indicador de recorrencia e as acoes de pausar/retomar/cancelar/editar direto na linha do lancamento.

### Datas inexistentes no mes

Recorrencia mensal iniciada em um dia inexistente em meses posteriores deve usar o ultimo dia valido do mes.

Exemplo:

```text
2026-01-31 -> 2026-02-28 -> 2026-03-31
```

### Edicao

Edicao da recorrencia altera a regra para novas geracoes e parcelas futuras ainda nao baixadas.

Parcelas ja `posted` ou `reconciled` nao devem ser alteradas automaticamente por edicao da regra. Ajustes historicos devem ser operacoes explicitas em issues futuras.

### Pausa e cancelamento

- `paused`: interrompe novas geracoes enquanto pausada.
- `cancelled`: encerra a regra e tambem impede novas geracoes.
- `cancelFutureInstallments`: cancela apenas parcelas futuras com status `planned`; parcelas `posted` ou `reconciled` permanecem inalteradas.

### Compras parceladas

`generateInstallmentSchedule` cria uma sequencia mensal fixa para compras parceladas.

Payload conceitual:

```json
{
  "firstDueOn": "2026-06-30",
  "totalInstallments": 3,
  "amountMinor": 3333,
  "currency": "BRL",
  "cardId": "card-demo"
}
```

Cada parcela recebe `sequenceNumber` de 1 ate `totalInstallments`.

## Erros de validacao

Erros controlados do contrato de dominio:

```text
400 RECURRENCE_FREQUENCY_REQUIRED
400 RECURRENCE_FREQUENCY_INVALID
400 RECURRENCE_STATUS_INVALID
400 RECURRENCE_KIND_REQUIRED
400 RECURRENCE_KIND_INVALID
400 RECURRENCE_AMOUNT_INVALID
400 RECURRENCE_DATE_REQUIRED
400 RECURRENCE_END_BEFORE_START
400 RECURRENCE_DESCRIPTION_REQUIRED
400 RECURRENCE_ACCOUNT_REQUIRED
400 RECURRENCE_ACCOUNT_INVALID
400 RECURRENCE_ACCOUNT_ARCHIVED
400 RECURRENCE_TARGET_REQUIRED
400 RECURRENCE_TARGET_CONFLICT
400 RECURRENCE_CARD_INVALID
400 RECURRENCE_CARD_NOT_ACTIVE
400 RECURRENCE_CATEGORY_INVALID
400 RECURRENCE_CATEGORY_ARCHIVED
400 RECURRENCE_CATEGORY_KIND_MISMATCH
400 RECURRENCE_GENERATION_WINDOW_INVALID
400 INSTALLMENT_TOTAL_INVALID
400 INSTALLMENT_SEQUENCE_INVALID
400 INSTALLMENT_STATUS_INVALID
404 TENANT_RESOURCE_NOT_FOUND
403 TENANT_PAYLOAD_SCOPE_FORBIDDEN
```

## Auditoria

Criacao, edicao, pausa, retomada e cancelamento retornam `AuditLogEntryDraft` redigido para a entidade `recurrence`.

O contrato nao grava payload financeiro completo em logs; apenas marca campos como adicionados, alterados ou removidos.

## Testes

O pacote `@solverfin/domain` cobre:

- criacao de recorrencia;
- conta arquivada;
- geracao mensal sem duplicar;
- data mensal inexistente;
- pausa e cancelamento;
- edicao de regra futura;
- compra parcelada fixa;
- cancelamento apenas de parcelas futuras planejadas;
- isolamento por tenant.

Todos os exemplos usam dados ficticios.
