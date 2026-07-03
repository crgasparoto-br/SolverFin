# API de consulta de parcelas

## Objetivo

Este contrato adiciona uma leitura historica, atual e futura de parcelas para as telas existentes do SolverFin. Ele nao cria uma rota web dedicada de Parcelas; a web deve consumir esses dados dentro de `/lancamentos`, `/cartoes` e, quando existir agregacao suficiente, `/relatorios`.

## Endpoint

```http
GET /api/installments
```

A rota usa a sessao autenticada e resolve `organizationId` e `financialProfileId` no servidor. O cliente nao deve enviar esses campos como autoridade de escopo. Quando houver mais de um perfil ativo, o filtro `profileId` segue o contrato atual de tenant.

## Filtros

Todos os filtros sao opcionais:

```text
transactionId
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

Periodo invertido, data invalida ou status desconhecido retornam erro controlado `400 INSTALLMENTS_FILTER_INVALID`.

## Resposta

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

Neste corte, a manutencao operacional continua sendo feita pelos fluxos existentes de transacao quando a parcela esta ligada a uma transacao planejada e sem fatura. O backend reexpoe a elegibilidade para que `/lancamentos` e `/cartoes` mostrem ou escondam acoes com base na regra do servidor.

Parcelas ligadas a fatura, transacao postada/conciliada/cancelada ou sem transacao vinculada nao devem exibir acao de edicao direta.

## Tenant e privacidade

- Listagens filtram apenas dados do contexto ativo.
- Acesso por `profileId` fora do escopo do usuario segue o comportamento atual de tenant.
- A resposta evita payload financeiro completo de auditoria e retorna apenas os vinculos necessarios para exibicao operacional.
- Exemplos usam dados ficticios.

## Telas consumidoras

- `/lancamentos`: listar parcelas ligadas ao lancamento/transacao original de conta e exibir manutencao apenas quando `editable` for verdadeiro.
- `/cartoes`: listar historico por cartao agrupador, instrumento, fatura, periodo e compra/recorrencia quando os vinculos existirem.
- `/relatorios`: usar a mesma leitura como base para visao consolidada somente leitura quando a tela deixar de ser placeholder.
