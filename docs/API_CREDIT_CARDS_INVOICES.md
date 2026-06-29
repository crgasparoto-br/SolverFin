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

## Cartao fisico + adicional/virtual = uma so fatura

Um cartao fisico e seus cartoes adicionais/virtuais (cadastrados como `Card` separados e ligados por `CardAdditionalLink`) representam, na pratica, **um unico cartao** perante o usuario: mesma fatura, mesmo vencimento, mesma previsao de pagamento. O dominio reflete isso assim:

- `CardAdditionalLink` define um grupo: toda compra em qualquer cartao do grupo informa o `groupCardId` do grupo (resolvido pelo repository a partir do `cardId` da compra) ao chamar `registerCardPurchase`.
- A fatura e arquivada sob o `groupCardId` (o cartao "ancora" do grupo), nao sob o `cardId` literal de cada compra. Por isso, compras feitas no cartao fisico e no cartao adicional do mesmo periodo caem na **mesma** fatura, e o total da fatura soma as duas.
- Cada `Transaction` de compra continua guardando o `cardId` literal do cartao usado, entao a tela ainda mostra de qual cartao (fisico ou adicional) veio cada lancamento, mesmo dentro da fatura unica.
- O limite de credito (`limitTotalMinor`/`limitUsedMinor`) continua calculado por cartao individual (`Card.creditLimitMinor` e a soma das compras daquele `cardId` especifico), pois fisico e adicional podem ter limites configurados separadamente.
- Cartao sem nenhum vinculo em `CardAdditionalLink` usa o proprio id como `groupCardId` (comportamento igual ao anterior, sem grupo).

## Compras

`registerCardPurchase` cria uma transacao `expense` com `cardId` (o cartao literal usado na compra, fisico ou adicional/virtual) e `invoiceId`.

A fatura e resolvida por `invoiceCardId + periodStartOn + periodEndOn`, onde `invoiceCardId` e o `groupCardId` do cartao (ver "Cartao fisico + adicional/virtual = uma so fatura" abaixo), caindo no proprio `cardId` quando o cartao nao pertence a um grupo:

- se nao existir, uma fatura `open` e criada;
- se existir e estiver `open`, o total e incrementado;
- faturas `closed`, `paid`, `overdue` ou `cancelled` nao recebem novas compras.

A `Transaction` da compra sempre guarda o `cardId` literal (qual cartao fisico/adicional foi usado), preservando a rastreabilidade individual mesmo quando a fatura e compartilhada pelo grupo.

Compras parceladas criam parcelas planejadas. O valor total e dividido entre as parcelas, com centavos excedentes aplicados nas primeiras parcelas.

Cada parcela e lancada na fatura do mes em que vence: a fatura da compra recebe apenas a parcela inicial, e uma fatura e criada/atualizada para cada parcela futura (`futureInvoices` no retorno de `registerCardPurchase`). A `Transaction` da compra guarda o valor total para exibicao, mas o `totalAmountMinor` de cada fatura reflete somente a parcela daquele periodo.

`installmentStart` permite registrar uma compra que ja esta em andamento (por exemplo, importacao de uma compra parcelada feita fora do sistema): informando `totalInstallments` e `installmentStart`, somente as parcelas de `installmentStart` ate o total sao criadas, e a fatura atual recebe a parcela `installmentStart`. O valor informado deve ser sempre o total original da compra (nao o valor restante), para que a divisao em parcelas permaneca consistente.

## Compra fixa/recorrente

Uma compra recorrente no cartao (assinatura, mensalidade) usa o mesmo recurso de `Recurrence` ja usado para lancamentos fixos de conta, agora aceitando `cardId` no lugar de `accountId` (os dois sao mutuamente exclusivos).

- `POST /api/recurrences` com `cardId` em vez de `accountId` cria a recorrencia vinculada ao cartao.
- `POST /api/recurrences/:id/generate-installments` gera as parcelas planejadas (`Installment` com `cardId` preenchido), do mesmo jeito que para recorrencias de conta.
- A tela Cartoes de Credito usa essa rota no modo de repeticao "Fixo" do pop-up de nova compra.

## Pagamento de fatura

`payInvoice` cria uma transacao `expense` na conta de pagamento e marca a fatura como `paid`.

Decisao de MVP:

- pagamento parcial ou maior que o total da fatura e rejeitado;
- o pagamento deve ser exatamente igual ao total atual da fatura;
- suporte a pagamento parcial depende de campo persistente de valor pago/saldo em aberto e fica para evolucao futura.

## Previsao de pagamento da fatura

Quando o cartao tem `paymentAccountId` configurado e a conta esta `active`, `registerCardPurchase` tambem gera/atualiza uma `Transaction` de previsao (`forecastTransactions` no retorno):

- `kind: "expense"`, `status: "planned"`, `source: "manual"`, sem `effectiveOn` (aparece como "Previsto" no extrato).
- `accountId` = conta de pagamento do cartao; `cardId` = `groupCardId` da fatura; `invoiceId` referencia a fatura correspondente.
- `amountMinor`/`plannedOn` acompanham o `totalAmountMinor`/`dueOn` da fatura: a cada nova compra do grupo (fisico ou adicional) que incrementa a fatura, a previsao existente e atualizada (nao duplicada).
- Como a fatura agora e unica por grupo, existe **uma so** previsao de pagamento por grupo de cartao e periodo, mesmo com compras alternando entre o cartao fisico e o adicional.
- Ao pagar a fatura (`payInvoice`), a previsao correspondente e marcada como `voided`.

## Resumo de fatura e cartoes adicionais

`GET /api/invoices/:id/summary` retorna `cardTotals`, um total por cartao para compor o resumo na tela web Cartoes de Credito.

- Quando o cartao da fatura nao tem vinculo em `CardAdditionalLink`, `cardTotals` traz apenas o proprio cartao.
- Quando o cartao pertence a um grupo (cartao principal + adicionais/virtuais cadastrados em Contas e Cartoes), `cardTotals` traz um item por cartao do grupo. Como a fatura agora e compartilhada pelo grupo, `invoiceTotalMinor` e `invoiceAmountDueMinor` sao **os mesmos para todos os cartoes do grupo** (o total/saldo da fatura unica); `limitTotalMinor`/`limitUsedMinor`/`limitAvailableMinor` continuam especificos de cada cartao, somando apenas as compras feitas naquele `cardId` literal.
- A tela soma os limites de `cardTotals` para exibir limite, uso e disponivel consolidados do grupo, mas mostra o total da fatura uma unica vez (e nao somado por cartao, pois ja e o mesmo valor compartilhado).

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
