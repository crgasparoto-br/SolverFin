# ADR 0016 - Vinculo canonico entre compra parcelada, parcelas e faturas

- Status: Aceito
- Data: 2026-09-10
- Issue: #662

## Contexto

Uma compra parcelada de cartao representa um unico fato economico, mas gera ocorrencias financeiras em faturas diferentes. Antes desta decisao, `Transaction` guardava o valor total da compra e `Installment` guardava os valores das parcelas, porem a persistencia nao mantinha em cada parcela um vinculo duravel tanto com a compra quanto com a fatura da ocorrencia. Parte das leituras dependia da relacao inversa `Transaction.installmentId`, adequada para ocorrencias materializadas de recorrencia, mas insuficiente para uma compra unica com varias parcelas.

Essa ambiguidade permitia confundir tres valores diferentes: total da compra, valor da parcela na fatura e total agregado da fatura. Tambem tornava inseguras edicoes que pudessem alterar apenas parte do parcelamento.

## Decisao

Para compras parceladas de cartao, `Installment` passa a persistir dois vinculos canonicos opcionais:

- `transactionId`: identifica a unica `Transaction` que representa o fato economico da compra;
- `invoiceId`: identifica a fatura/periodo em que aquela ocorrencia deve ser cobrada.

Os campos permanecem opcionais para preservar os modelos existentes de recorrencia e parcelamento manual. A leitura aceita o vinculo legado somente como compatibilidade; novos parcelamentos de cartao devem usar o vinculo canonico.

A criacao continua atomica. A `Transaction` guarda o **valor total da compra**. Cada `Installment.amountMinor` guarda o **valor daquela parcela**, e cada `Invoice.totalAmountMinor` agrega somente as ocorrencias pertencentes a sua fatura. O arredondamento de centavos segue o dominio existente: o total e dividido deterministicamente e os centavos excedentes ficam nas primeiras parcelas.

Quando a interface usa **Valor total da compra**, o valor informado ja e o total canonico. Quando usa explicitamente **Valor da parcela**, o cliente converte para o total canonico antes do registro. O modo padrao para uma nova compra parcelada e **Valor total da compra**.

## Persistencia e compatibilidade

A migracao da #662 adiciona os dois campos e seus indices tenant-scoped. O backfill de dados legados ocorre apenas quando uma relacao `Transaction.installmentId` ja persistida identifica uma unica transacao para a parcela. Nao e permitido inferir relacao por valor, descricao, data ou combinacao heuristica desses campos.

Durante a gravacao de uma nova compra parcelada, o banco captura a identidade da `Transaction` de compra inserida na mesma transacao e completa o vinculo das parcelas antes da persistencia. O `invoiceId` e resolvido entre as faturas da mesma organizacao, perfil e cartao pela data de vencimento calculada para a parcela; a insercao falha se nao houver exatamente uma fatura correspondente. Isso impede persistencia parcial ou associacao silenciosa a um periodo ambiguo.

## Leitura e projecao

`GET /api/installments` resolve a transacao por `Installment.transactionId` e a fatura por `Installment.invoiceId`, mantendo o caminho legado apenas como fallback. A consulta e unica e nao introduz N+1.

Na lista de compras de uma fatura, uma compra parcelada e projetada pela ocorrencia daquela fatura:

- valor principal: `Installment.amountMinor`;
- contexto: `Parcela X de Y`;
- valor total da compra: `Transaction.amountMinor`, quando util como informacao secundaria;
- descricao, categoria e instrumento: compra canonica.

Nao e criada linha tecnica separada para `Installment` na tela `Cartoes`.

## Edicao

Para uma compra parcelada, sao editaveis somente descricao, categoria e instrumento. Valor, data, quantidade de parcelas, parcela inicial e distribuicao financeira permanecem imutaveis nesta entrega.

A troca de instrumento atualiza a `Transaction` e todas as `Installment` canonicas da compra na mesma transacao de banco. Se qualquer fatura vinculada estiver `CLOSED`, `PAID` ou `CANCELLED`, toda a edicao e rejeitada antes de qualquer mutacao.

Mover individualmente uma compra parcelada para outra fatura tambem e rejeitado com `CARD_PURCHASE_INSTALLMENT_STRUCTURE_LOCKED`. Alterar o periodo de uma unica ocorrencia mudaria a distribuicao do parcelamento sem um contrato de reparcelamento. Um futuro fluxo de reparcelamento exige decisao e contrato proprios.

## Consequencias

- total da compra, valor da parcela e total da fatura passam a ter fontes de verdade distintas e verificaveis;
- consultas de fatura deixam de usar o total da compra como valor da ocorrencia parcelada;
- edicoes parciais perigosas falham de forma explicita;
- dados legados ambiguos permanecem sem backfill automatico e precisam de saneamento dirigido;
- fluxos simples e recorrentes continuam usando seus contratos existentes.
