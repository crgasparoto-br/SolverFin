# API de consulta e manutencao de parcelas

## Objetivo

Este contrato adiciona uma leitura historica, atual e futura de parcelas para as telas existentes do SolverFin. Ele nao cria uma rota web dedicada de Parcelas; a web deve consumir esses dados dentro de `/lancamentos`, `/cartoes` e `/relatorios`.

A manutencao direta continua controlada pelo backend e limitada a campos seguros da transacao vinculada. O cliente nao pode alterar fatura, cartao agrupador, instrumento, valor, vencimento, tenant ou perfil financeiro por esta rota.

## Endpoints

```http
GET /api/installments
PATCH /api/installments/:installmentId
```

As rotas usam a sessao autenticada e resolvem `organizationId` e `financialProfileId` no servidor. O cliente nao deve enviar esses campos como autoridade de escopo. Quando houver mais de um perfil ativo, o filtro `profileId` segue o contrato atual de tenant.

## Filtros de consulta

Todos os filtros sao opcionais:

```text
installmentId
transactionId
accountId
recurrenceId
cardId
cardInstrumentId
invoiceId
categoryId
dueFrom
dueTo
status
profileId
```

`dueFrom` e `dueTo` usam `YYYY-MM-DD`. `status` aceita `planned`, `posted`, `reconciled`, `cancelled` ou `all`.

`accountId` filtra parcelas pela transacao vinculada a uma conta. Esse filtro deve ser usado por `/lancamentos` para consultar somente as parcelas do extrato selecionado.

Periodo invertido, data invalida ou status desconhecido retornam erro controlado `400 INSTALLMENTS_FILTER_INVALID`.

## Resposta de consulta

```json
{
  "installments": [
    {
      "id": "installment-demo",
      "financialProfileId": "profile-demo",
      "status": "planned",
      "sequenceNumber": 2,
      "totalInstallments": 6,
      "dueOn": "2026-08-05",
      "amountMinor": 12345,
      "currency": "BRL",
      "transaction": {
        "id": "transaction-demo",
        "status": "planned",
        "accountId": "account-demo",
        "categoryId": "category-demo",
        "plannedOn": "2026-08-05",
        "description": "Assinatura ficticia"
      },
      "recurrence": {
        "id": "recurrence-demo",
        "status": "active",
        "frequency": "monthly",
        "interval": 1,
        "description": "Assinatura ficticia"
      },
      "category": {
        "id": "category-demo",
        "name": "Categoria ficticia",
        "kind": "expense",
        "status": "active"
      },
      "editable": true
    }
  ]
}
```

Vinculos opcionais ausentes sao omitidos. Isso permite renderizar historico parcial sem quebrar as telas quando uma parcela antiga nao tiver categoria, fatura, cartao, instrumento ou transacao carregavel.

## Elegibilidade de manutencao

Cada item informa `editable` e, quando bloqueado, `editBlockedReason`.

Razoes iniciais:

```text
linked_transaction_missing
installment_status_locked
transaction_status_locked
invoice_linked
```

Parcelas ligadas a fatura, transacao postada/conciliada/cancelada, parcela nao planejada ou sem transacao vinculada nao devem exibir acao de edicao direta. O backend revalida a mesma elegibilidade durante o `PATCH` para cobrir mudancas de estado entre consulta e salvamento.

## PATCH /api/installments/:installmentId

Payload permitido:

```json
{
  "description": "Assinatura ficticia ajustada",
  "note": "Observacao ficticia opcional",
  "categoryId": "category-demo"
}
```

Todos os campos sao opcionais, mas o payload deve trazer pelo menos um deles. `note` pode ser `null` para limpar a observacao. Campos fora da allowlist retornam `400 INSTALLMENT_PAYLOAD_INVALID`.

A mutacao atualiza a transacao vinculada de forma atomica pelo fluxo existente de transacao, sincroniza a parcela quando necessario e grava auditoria minimizada/redigida da mutacao financeira. A resposta retorna a parcela recarregada:

```json
{
  "installment": {
    "id": "installment-demo",
    "status": "planned",
    "transaction": {
      "id": "transaction-demo",
      "description": "Assinatura ficticia ajustada",
      "categoryId": "category-demo"
    },
    "editable": true
  }
}
```

Bloqueios de elegibilidade retornam `409 INSTALLMENT_EDIT_BLOCKED`. Recurso inexistente ou fora do tenant/profile ativo retorna o comportamento padrao de recurso nao encontrado.

## Tenant e privacidade

- Listagens e mutacoes filtram apenas dados do contexto ativo.
- Acesso por `profileId` fora do escopo do usuario segue o comportamento atual de tenant.
- A resposta evita payload financeiro completo de auditoria e retorna apenas os vinculos necessarios para exibicao operacional.
- Exemplos usam dados ficticios.

## Telas consumidoras

- `/lancamentos`: listar parcelas por `accountId`, periodo e vinculo com a transacao original de conta, exibindo manutencao apenas quando `editable` for verdadeiro.
- `/cartoes`: listar historico por cartao agrupador, instrumento, fatura, periodo e compra/recorrencia quando os vinculos existirem.
- `/relatorios`: usar a mesma leitura como base para visao consolidada somente leitura.
