# Cartoes de credito e faturas

Este documento descreve o contrato de dominio inicial para cartoes de credito, compras, parcelas e pagamento de fatura.

## Escopo entregue

- Cadastro de cartao com nome, status, dia de fechamento, dia de vencimento, limite opcional, identificador mascarado e conta padrao de pagamento opcional.
- Registro de compra no cartao com criacao ou atualizacao da fatura correta.
- Suporte a compra parcelada com parcelas vinculadas ao cartao e a transacao de compra.
- Pagamento integral da fatura com transacao de saida na conta de origem.
- Regras de tenant/contexto em cartoes, faturas e contas de pagamento.
- Auditoria redigida para criacao/atualizacao de cartoes, faturas e transacoes criadas pelo fluxo.

## Regras de fechamento e vencimento

O dominio usa `closingDay` e `dueDay` do cartao.

- Compras realizadas ate o dia de fechamento entram na fatura que fecha no mesmo mes.
- Compras realizadas apos o fechamento entram na proxima fatura.
- O periodo da fatura inicia no dia seguinte ao fechamento anterior.
- O vencimento e o primeiro `dueDay` posterior ao fechamento da fatura.
- Quando o mes nao possui o dia configurado, o calculo usa o ultimo dia valido do mes.

Exemplo com fechamento dia 20 e vencimento dia 10:

- Compra em 2026-06-15: periodo 2026-05-21 a 2026-06-20, vencimento 2026-07-10.
- Compra em 2026-06-21: periodo 2026-06-21 a 2026-07-20, vencimento 2026-08-10.

## Compras

`registerCardPurchase` cria uma transacao `expense` com `cardId` e `invoiceId`.

A fatura e resolvida por `cardId + periodStartOn + periodEndOn`:

- se nao existir, uma fatura `open` e criada;
- se existir e estiver `open`, o total e incrementado;
- faturas `closed`, `paid`, `overdue` ou `cancelled` nao recebem novas compras.

Compras parceladas criam parcelas planejadas. O valor total e dividido entre as parcelas, com centavos excedentes aplicados nas primeiras parcelas.

## Pagamento de fatura

`payInvoice` cria uma transacao `expense` na conta de pagamento e marca a fatura como `paid`.

Decisao de MVP:

- pagamento parcial ou maior que o total da fatura e rejeitado;
- o pagamento deve ser exatamente igual ao total atual da fatura;
- suporte a pagamento parcial depende de campo persistente de valor pago/saldo em aberto e fica para evolucao futura.

## Privacidade de dados de cartao

O dominio aceita apenas identificador mascarado. Valores que contenham 13 ou mais digitos sao rejeitados para evitar armazenamento acidental de numero completo de cartao.

Fixtures e exemplos usam apenas dados ficticios e mascarados.

## Erros principais

- `CARD_IDENTIFIER_UNSAFE`: identificador aparenta conter numero completo de cartao.
- `CARD_NOT_ACTIVE`: cartao arquivado ou bloqueado nao pode receber compra.
- `CARD_INVOICE_NOT_OPEN`: fatura nao esta aberta para novas compras.
- `CARD_INVOICE_PAYMENT_AMOUNT_INVALID`: pagamento nao corresponde ao total da fatura.
- `CARD_PAYMENT_ACCOUNT_ARCHIVED`: conta de pagamento nao esta ativa.

## Fora de escopo

- Integracao com operadora de cartao.
- Juros, rotativo e parcelamento da propria fatura.
- Pagamentos parciais.
- Persistencia/repository e API HTTP real.
