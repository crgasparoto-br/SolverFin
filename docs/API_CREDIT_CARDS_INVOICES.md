# Cartoes de credito e faturas

Este documento descreve o contrato de dominio inicial para cartoes de credito, compras, parcelas e pagamento de fatura.

## Status de transicao do epico #317

A migracao destrutiva da #319 introduz a estrutura persistente para o novo modelo:

- `Card` passa a representar o cartao agrupador/fatura, dono de bandeira, limite total, fechamento, vencimento e conta padrao de pagamento.
- `CardInstrument` representa os meios internos de uso do agrupador, como fisico, virtual, titular principal e adicional.
- `Transaction`, `Recurrence` e `Installment` passam a aceitar `cardInstrumentId` para preservar a origem da compra, recorrencia ou parcela.
- `Invoice.cardId` continua apontando para o agrupador, nunca para um instrumento isolado.
- O fluxo legado de vinculo manual entre cartoes separados foi aposentado como comportamento de API. Novas implementacoes devem usar instrumentos internos vinculados diretamente ao agrupador.

A #320 liga o dominio de compras ao novo modelo quando o chamador fornece contexto de instrumentos:

- compras podem receber `cardInstrumentId` explicito ou usar o instrumento ativo default do agrupador;
- compras e parcelas preservam o `cardInstrumentId` usado;
- instrumentos arquivados, inexistentes, de outro tenant ou de outro agrupador sao rejeitados;
- agrupadores sem instrumento ativo sao bloqueados para novas compras no fluxo novo;
- a fatura continua unica por agrupador e periodo, mesmo quando diferentes instrumentos fazem compras no mesmo ciclo.

A #321 adiciona o contrato de API para agrupadores e instrumentos. As rotas antigas de `/api/cards` continuam como compatibilidade temporaria para operacoes basicas de cartao, mas o caminho principal para novas telas e integracoes passa a ser `/api/credit-card-accounts` e seus instrumentos aninhados.

## Escopo entregue antes da UI nova

- Cadastro de cartao agrupador com nome, status, dia de fechamento, dia de vencimento, limite opcional, bandeira, instituicao e conta padrao de pagamento opcional.
- Cadastro e manutencao de instrumentos internos fisicos/virtuais, titular principal/adicional, default, identificador mascarado e limite individual.
- Registro de compra no cartao com criacao ou atualizacao da fatura correta.
- Suporte a compra com instrumento interno quando a camada chamadora fornece `cardInstrumentId`.
- Suporte a compra parcelada com parcelas vinculadas ao cartao, a transacao de compra e, no fluxo novo, ao instrumento usado.
- Pagamento integral da fatura com transacao de saida na conta de origem.
- Regras de tenant/contexto em cartoes, instrumentos, faturas e contas de pagamento.
- Auditoria redigida para criacao/atualizacao de cartoes, faturas e transacoes criadas pelos fluxos ja auditados.

## API de agrupadores e instrumentos

### Rotas principais

```text
GET    /api/credit-card-accounts
POST   /api/credit-card-accounts
GET    /api/credit-card-accounts/:cardId
PATCH  /api/credit-card-accounts/:cardId
POST   /api/credit-card-accounts/:cardId/archive

GET    /api/credit-card-accounts/:cardId/instruments
POST   /api/credit-card-accounts/:cardId/instruments
PATCH  /api/credit-card-accounts/:cardId/default-instrument
POST   /api/credit-card-accounts/:cardId/purchases

PATCH  /api/credit-card-instruments/:instrumentId
POST   /api/credit-card-instruments/:instrumentId/archive
```

### Criacao de agrupador

`POST /api/credit-card-accounts` cria o agrupador e seus instrumentos iniciais no mesmo contrato. O corpo deve conter os dados do agrupador e uma lista `instruments` com ao menos um instrumento ativo.

Exemplo:

```json
{
  "name": "Cartao C6",
  "institutionKey": "c6",
  "brandKey": "mastercard",
  "closingDay": 20,
  "dueDay": 10,
  "creditLimitMinor": 500000,
  "instruments": [
    {
      "type": "physical",
      "holder": "primary",
      "name": "Fisico titular",
      "maskedIdentifier": "**** 1111",
      "creditLimitMinor": 300000
    },
    {
      "type": "virtual",
      "holder": "primary",
      "name": "Virtual compras online",
      "maskedIdentifier": "**** 2222",
      "creditLimitMinor": 200000
    }
  ]
}
```

A resposta usa `creditCardAccount` e inclui o agrupador com `instruments` aninhados. A listagem retorna `creditCardAccounts` no mesmo formato hierarquico.

### Instrumentos

`POST /api/credit-card-accounts/:cardId/instruments` adiciona um instrumento ao agrupador existente. O primeiro instrumento ativo de um agrupador vira default automaticamente. Para trocar o default, use:

```json
PATCH /api/credit-card-accounts/:cardId/default-instrument
{
  "instrumentId": "..."
}
```

`PATCH /api/credit-card-instruments/:instrumentId` permite editar tipo, titularidade, nome, identificador mascarado, limite individual e marcar como default com `isDefault: true`. Para arquivar, prefira `POST /api/credit-card-instruments/:instrumentId/archive`, que promove outro instrumento ativo quando existir ou bloqueia o agrupador quando o ultimo ativo for arquivado.

### Compras pelo contrato novo

`POST /api/credit-card-accounts/:cardId/purchases` registra compra no agrupador. Quando `cardInstrumentId` e informado, a API carrega os instrumentos do agrupador, aplica as validacoes do dominio e persiste a origem da compra em `Transaction.cardInstrumentId` e nas parcelas.

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

Um agrupador sem instrumentos ativos fica bloqueado para novas compras no dominio quando o fluxo novo fornece a lista de instrumentos.

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

No modelo novo, `registerCardPurchase` cria uma transacao `expense` com:

- `cardId` do agrupador, para resolver a fatura;
- `cardInstrumentId` do instrumento usado, para rastreabilidade e exibicao;
- `invoiceId` da fatura do periodo.

Enquanto a API antiga ainda esta em transicao, `cardInstrumentId` e exigido apenas quando o chamador informa contexto de instrumentos ou um instrumento explicito. Sem esse contexto, o dominio preserva compatibilidade com os fluxos que ainda nao migraram para `/api/credit-card-accounts`.

Quando `instruments` e informado:

- se `cardInstrumentId` vier no payload, ele deve apontar para instrumento ativo do mesmo agrupador e tenant;
- se `cardInstrumentId` nao vier, o dominio usa o instrumento ativo default do agrupador;
- se nao houver instrumento ativo elegivel, a compra e rejeitada;
- instrumentos arquivados nao podem receber novas compras.

A fatura e resolvida por `cardId + periodStartOn + periodEndOn`:

- se nao existir, uma fatura `open` e criada;
- se existir e estiver `open`, o total e incrementado;
- faturas `closed`, `paid`, `overdue` ou `cancelled` nao recebem novas compras.

Compras feitas por instrumentos diferentes do mesmo agrupador compartilham a mesma fatura quando pertencem ao mesmo periodo.

Compras parceladas criam parcelas planejadas. O valor total e dividido entre as parcelas, com centavos excedentes aplicados nas primeiras parcelas. Cada parcela preserva o `cardInstrumentId` escolhido na compra original quando o fluxo novo esta em uso.

`installmentStart` permite registrar uma compra que ja esta em andamento. Informando `totalInstallments` e `installmentStart`, somente as parcelas de `installmentStart` ate o total sao criadas, e a fatura atual recebe a parcela `installmentStart`.

## Compra fixa/recorrente

Uma compra recorrente no cartao usa o mesmo recurso de `Recurrence` ja usado para lancamentos fixos de conta.

No modelo alvo, a recorrencia de cartao deve guardar:

- `cardId` do agrupador;
- `cardInstrumentId` escolhido no momento da criacao.

Pelo contrato REST, `POST /api/recurrences` e `PATCH /api/recurrences/:recurrenceId` aceitam `cardInstrumentId` quando a recorrencia usa `cardId`. O instrumento informado precisa estar ativo e pertencer ao mesmo agrupador, organizacao e perfil financeiro. O campo retornado em `recurrence.cardInstrumentId` e o valor preservado para as compras geradas por `POST /api/recurrences/:recurrenceId/generate-installments`.

Exemplo:

```json
{
  "frequency": "monthly",
  "startOn": "2027-06-05",
  "amountMinor": 1234,
  "description": "Assinatura no cartao virtual",
  "cardId": "...",
  "cardInstrumentId": "..."
}
```

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
- `CARD_INSTRUMENT_REQUIRED`: compra no fluxo novo nao encontrou instrumento ativo para o agrupador.
- `CARD_INSTRUMENT_CARD_MISMATCH`: instrumento informado nao pertence ao agrupador/tenant da compra.
- `CARD_INSTRUMENT_NOT_ACTIVE`: instrumento informado esta arquivado e nao pode receber nova compra.
- `CARD_NOT_ACTIVE`: cartao arquivado ou bloqueado nao pode receber compra.
- `CARD_INVOICE_NOT_OPEN`: fatura nao esta aberta para novas compras.
- `CARD_INVOICE_PAYMENT_AMOUNT_INVALID`: pagamento nao corresponde ao total da fatura.
- `CARD_PAYMENT_ACCOUNT_ARCHIVED`: conta de pagamento nao esta ativa.
- `RECURRENCE_CARD_INSTRUMENT_INVALID`: instrumento informado na recorrencia nao esta ativo ou nao pertence ao agrupador/tenant.

## Fora de escopo desta transicao

- Integracao com operadora de cartao.
- Juros, rotativo e parcelamento da propria fatura.
- Pagamentos parciais.
- Ajuste completo de UI e fluxo de compras/faturas, previstos nas #322 e #323.
