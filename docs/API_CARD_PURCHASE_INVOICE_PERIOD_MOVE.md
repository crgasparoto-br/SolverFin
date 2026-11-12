# API - mover compra de cartao entre faturas/periodos

## Endpoint

```text
POST /api/credit-card-accounts/:cardId/purchases/:transactionId/move-invoice-period
```

Move uma compra operacional de cartao para outro periodo de fatura do mesmo cartao agrupador.

## Payload

```json
{
  "invoicePeriod": "2026-08"
}
```

`invoicePeriod` usa o formato `AAAA-MM` e representa o mes de fechamento da fatura. A API calcula `periodStartOn`, `periodEndOn` e `dueOn` usando as mesmas regras de dominio aplicadas ao registro normal de compras (`closingDay` e `dueDay` do agrupador). O cliente nao envia `invoiceId` de destino.

## Resposta

```json
{
  "transaction": { "id": "...", "invoiceId": "..." },
  "originInvoice": { "invoiceId": "...", "totalExpensesMinor": 0 },
  "destinationInvoice": { "invoiceId": "...", "totalExpensesMinor": 2500 },
  "installmentScope": "selected_purchase",
  "recurrenceScope": "materialized_occurrence_only"
}
```

## Regras de seguranca e consistencia

- A compra deve pertencer ao `cardId`, organizacao e perfil financeiro ativos.
- A fatura de origem deve existir e pertencer ao mesmo cartao agrupador.
- A fatura destino e localizada ou criada por `cardId + periodStartOn + periodEndOn`.
- Faturas `closed`, `paid` e `cancelled` bloqueiam movimentacao na origem e no destino.
- A operacao ocorre dentro de uma unica transacao persistente.
- A API atualiza `Transaction.invoiceId`, realoca a data operacional para dentro do periodo destino e ajusta os totais das duas faturas.
- `cardId`, `cardInstrumentId`, categoria, descricao, valor, moeda, status e vinculos de recorrencia/parcela sao preservados.
- Quando a compra tiver `Installment` tecnica vinculada, apenas a compra/ocorrencia selecionada e movida; a parcela tecnica tem `dueOn` atualizado para o vencimento da fatura destino.
- Quando a compra vier de recorrencia materializada, somente a ocorrencia ja gerada e movida; a regra de recorrencia nao e alterada.
- A auditoria registra alteracoes de forma redigida, sem payload financeiro completo.

## Erros principais

- `CARD_PURCHASE_INVOICE_PERIOD_INVALID`: periodo ausente ou diferente de `AAAA-MM`.
- `CARD_PURCHASE_INVOICE_PERIOD_UNCHANGED`: a compra ja pertence ao periodo informado.
- `CARD_PURCHASE_INVOICE_LOCKED`: a fatura de origem esta `closed`, `paid` ou `cancelled`.
- `CARD_PURCHASE_DESTINATION_INVOICE_LOCKED`: a fatura destino esta `closed`, `paid` ou `cancelled`.
- `CARD_PURCHASE_INVOICE_INVALID`: compra/fatura nao pertence ao contexto esperado.
- `TENANT_RESOURCE_NOT_FOUND`: compra, cartao ou fatura nao existem no contexto financeiro ativo.

## UI

A UI de `/cartoes` ainda nao expoe a acao visual de mover compra. A tela deve chamar este endpoint em issue posterior, sem recalcular fatura no frontend, e so deve exibir a acao quando a fatura atual for editavel.
