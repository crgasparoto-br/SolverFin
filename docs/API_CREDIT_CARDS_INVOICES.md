# Cartoes de credito e faturas

Este documento descreve o contrato de dominio inicial para cartoes de credito, compras, parcelas e pagamento de fatura.

## Status de transicao do epico #317

A migracao destrutiva da #319 introduz a estrutura persistente para o novo modelo:

- `Card` passa a representar o cartao agrupador/fatura, dono de bandeira, limite total, fechamento, vencimento e conta padrao de pagamento.
- `CardInstrument` representa os meios internos de uso do agrupador, como fisico, virtual, titular principal e adicional.
- `Transaction`, `Recurrence` e `Installment` passam a aceitar `cardInstrumentId` para preservar a origem da compra, recorrencia ou parcela.
- `Invoice.cardId` continua apontando para o agrupador, nunca para um instrumento isolado.
- `CardAdditionalLink` permanece temporariamente como tabela legada para manter rotas e testes antigos ate as #321, #323 e #324 substituirem o fluxo por instrumentos internos. Ela nao faz parte do schema Prisma nem do modelo principal novo.

As rotas antigas de `/api/cards` ainda existem como transicao tecnica. O comportamento principal do produto deve evoluir para cartao agrupador com instrumentos internos nas proximas subissues do epico.

## Escopo entregue antes da API nova

- Cadastro de cartao com nome, status, dia de fechamento, dia de vencimento, limite opcional, identificador mascarado legado e conta padrao de pagamento opcional.
- Registro de compra no cartao com criacao ou atualizacao da fatura correta.
- Suporte a compra parcelada com parcelas vinculadas ao cartao e a transacao de compra.
- Pagamento integral da fatura com transacao de saida na conta de origem.
- Regras de tenant/contexto em cartoes, faturas e contas de pagamento.
- Auditoria redigida para criacao/atualizacao de cartoes, faturas e transacoes criadas pelo fluxo.

## Modelo persistente alvo

### Cartao agrupador/fatura

O agrupador concentra dados do contrato e da fatura:

- nome do cartao;
- instituicao financeira;
- bandeira;
- dia de fechamento;
- dia de vencimento;
- conta padrao de pagamento;
- limite total;
- status do agrupador.

Um agrupador sem instrumentos ativos deve ficar bloqueado para novas compras quando a API nova for ligada a essa regra de dominio.

### Instrumento interno

O instrumento interno guarda os dados do meio usado na compra:

- `cardId`, apontando para o agrupador;
- tipo: `PHYSICAL` ou `VIRTUAL`;
- titularidade: `PRIMARY` ou `ADDITIONAL`;
- status: `ACTIVE` ou `ARCHIVED`;
- `isDefault`, com no maximo um instrumento ativo default por agrupador;
- nome/apelido opcional;
- identificador mascarado/final opcional;
- limite individual opcional.

A migracao cria indice parcial para impedir mais de um instrumento default ativo por agrupador. A regra de soma dos limites individuais contra o limite total do agrupador permanece no dominio/API, pois depende de agregacao entre linhas ativas.

## Regras de fechamento e vencimento

O dominio usa `closingDay` e `dueDay` do agrupador.

- Compras realizadas ate o dia de fechamento entram na fatura que fecha no mesmo mes.
- Compras realizadas apos o fechamento entram na proxima fatura.
- O periodo da fatura inicia no dia seguinte ao fechamento anterior.
- O vencimento e o primeiro `dueDay` posterior ao fechamento da fatura.
- Quando o mes nao possui o dia configurado, o calculo usa o ultimo dia valido do mes.

Exemplo com fechamento dia 20 e vencimento dia 10:

- Compra em 2026-06-15: periodo 2026-05-21 a 2026-06-20, vencimento 2026-07-10.
- Compra em 2026-06-21: periodo 2026-06-21 a 2026-07-20, vencimento 2026-08-10.

## Compras

No modelo alvo, `registerCardPurchase` deve criar uma transacao `expense` com:

- `cardId` do agrupador, para resolver a fatura;
- `cardInstrumentId` do instrumento usado, para rastreabilidade e exibicao;
- `invoiceId` da fatura do periodo.

A fatura e resolvida por `cardId + periodStartOn + periodEndOn`:

- se nao existir, uma fatura `open` e criada;
- se existir e estiver `open`, o total e incrementado;
- faturas `closed`, `paid`, `overdue` ou `cancelled` nao recebem novas compras.

Compras parceladas criam parcelas planejadas. O valor total e dividido entre as parcelas, com centavos excedentes aplicados nas primeiras parcelas. Cada parcela deve preservar o `cardInstrumentId` escolhido na compra original.

`installmentStart` permite registrar uma compra que ja esta em andamento. Informando `totalInstallments` e `installmentStart`, somente as parcelas de `installmentStart` ate o total sao criadas, e a fatura atual recebe a parcela `installmentStart`.

## Compra fixa/recorrente

Uma compra recorrente no cartao usa o mesmo recurso de `Recurrence` ja usado para lancamentos fixos de conta.

No modelo alvo, a recorrencia de cartao deve guardar:

- `cardId` do agrupador;
- `cardInstrumentId` escolhido no momento da criacao.

Mudancas futuras no instrumento default apenas preenchem novas criacoes. Elas nao alteram recorrencias existentes.

## Pagamento de fatura

`payInvoice` cria uma transacao `expense` na conta de pagamento e marca a fatura como `paid`.

Decisao de MVP:

- pagamento parcial ou maior que o total da fatura e rejeitado;
- o pagamento deve ser exatamente igual ao total atual da fatura;
- suporte a pagamento parcial depende de campo persistente de valor pago/saldo em aberto e fica para evolucao futura.

## Previsao de pagamento da fatura

Quando o agrupador tem `paymentAccountId` configurado e a conta esta `active`, a compra tambem gera ou atualiza uma `Transaction` de previsao:

- `kind: "expense"`, `status: "planned"`, `source: "manual"`, sem `effectiveOn`.
- `accountId` = conta de pagamento do agrupador.
- `cardId` = agrupador da fatura.
- `invoiceId` referencia a fatura correspondente.
- `amountMinor` e `plannedOn` acompanham `totalAmountMinor` e `dueOn` da fatura.
- Ao pagar a fatura (`payInvoice`), a previsao correspondente e marcada como `voided`.

## Privacidade de dados de cartao

O identificador do meio de uso deve ficar no instrumento interno e deve ser sempre mascarado. Valores que contenham 13 ou mais digitos sao rejeitados no dominio para evitar armazenamento acidental de numero completo de cartao.

Fixtures e exemplos usam apenas dados ficticios e mascarados.

## Erros principais

- `CARD_IDENTIFIER_UNSAFE`: identificador legado do cartao aparenta conter numero completo de cartao.
- `CARD_INSTRUMENT_IDENTIFIER_UNSAFE`: identificador do instrumento aparenta conter numero completo de cartao.
- `CARD_INSTRUMENT_LIMIT_EXCEEDS_CARD_LIMIT`: soma de limites individuais ativos excede o limite total do agrupador.
- `CARD_NOT_ACTIVE`: cartao arquivado ou bloqueado nao pode receber compra.
- `CARD_INVOICE_NOT_OPEN`: fatura nao esta aberta para novas compras.
- `CARD_INVOICE_PAYMENT_AMOUNT_INVALID`: pagamento nao corresponde ao total da fatura.
- `CARD_PAYMENT_ACCOUNT_ARCHIVED`: conta de pagamento nao esta ativa.

## Fora de escopo desta transicao

- Integracao com operadora de cartao.
- Juros, rotativo e parcelamento da propria fatura.
- Pagamentos parciais.
- Endpoints definitivos de agrupador e instrumentos, previstos na #321.
- Ajuste completo de UI e fluxo de compras/faturas, previstos nas #322 e #323.
