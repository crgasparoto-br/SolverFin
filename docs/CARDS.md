# Cartoes agrupadores e instrumentos

Este documento consolida o modelo atual de cartoes de credito do SolverFin para orientar produto, implementacao, testes e revisao de PRs.

## Conceitos

### Cartao agrupador/fatura

O cartao agrupador representa o contrato do cartao e e o dono da fatura. Exemplo: `Cartao C6`.

Dados que pertencem ao agrupador:

- nome do cartao;
- instituicao financeira;
- bandeira;
- dia de fechamento;
- dia de vencimento;
- conta padrao de pagamento;
- limite total.

A fatura deve ser resolvida sempre pelo agrupador e pelo periodo. Ela nunca deve ser calculada por instrumento isolado.

### Instrumento interno

O instrumento interno representa o meio usado em uma compra dentro do agrupador. Exemplos:

- fisico do titular principal;
- virtual do titular principal;
- fisico adicional;
- virtual adicional.

Dados que pertencem ao instrumento:

- tipo: `physical` ou `virtual`;
- titularidade: `primary` ou `additional`;
- nome/apelido opcional;
- identificador mascarado ou final do meio de uso;
- limite individual opcional;
- status;
- marcador de default.

O identificador mascarado nao pertence ao agrupador. Ele deve ficar no instrumento usado na compra.

## Regras de disponibilidade

Um agrupador precisa de pelo menos um instrumento ativo para ficar disponivel em novos lancamentos.

Quando um agrupador fica sem instrumentos ativos:

- ele deve ser tratado como bloqueado/inativo para novas compras;
- compras futuras ja existentes continuam visiveis para acompanhamento;
- instrumentos arquivados podem continuar visiveis enquanto forem relevantes para consulta;
- a tela deve explicar que nao ha instrumento ativo para novos lancamentos.

Criar um novo instrumento ativo em um agrupador bloqueado deve ser o caminho principal para voltar a usar esse agrupador.

## Instrumento default

Cada agrupador pode ter no maximo um instrumento default ativo.

Regras esperadas:

- o primeiro instrumento ativo de um agrupador vira default automaticamente;
- definir um novo default remove o default anterior do mesmo agrupador;
- instrumentos arquivados, inexistentes ou de outro agrupador nao podem virar default;
- ao arquivar o default, o proximo instrumento ativo deve ser promovido;
- se nao houver outro instrumento ativo, o agrupador fica bloqueado/inativo para novos lancamentos.

O default e apenas uma sugestao para novos lancamentos. Ele nao altera compras, parcelas ou recorrencias ja criadas.

## Compras, faturas e rastreabilidade

Compras feitas em instrumentos diferentes do mesmo agrupador devem compor uma unica fatura do agrupador.

A compra deve manter referencia ao instrumento usado para que telas, faturas e relatorios consigam mostrar a origem. Exemplos:

- `Cartao C6 / Fisico titular`;
- `Cartao C6 / Virtual adicional`.

Parcelas devem preservar a origem da compra. A fatura consolida os valores por agrupador e periodo, mas cada item deve continuar rastreavel pelo instrumento.

## Recorrencias

Recorrencias de cartao devem preservar o instrumento escolhido no momento da criacao.

Mudancas futuras no instrumento default nao alteram recorrencias existentes. O default vigente deve apenas pre-preencher novas compras ou novas recorrencias.

## Limites

A bandeira e o limite total pertencem ao agrupador.

Instrumentos podem ter limite individual opcional. Quando houver limites individuais ativos, a soma desses limites nao deve ultrapassar o limite total do agrupador.

## Edicao de compra de cartao

A edicao de uma compra na tela `Cartoes` usa diretamente `PATCH /api/credit-card-accounts/:cardId/purchases/:transactionId`. A tela nao depende de nenhuma rota generica de transacao nem de um override de outro modulo para corrigir rota, metodo ou payload.

No modo de edicao:

- o seletor de instrumento permanece visivel e editavel;
- o modo de repeticao fica oculto, pois repeticao so se aplica a criacao de compra.

Compras de faturas `closed`, `paid` ou `cancelled` tem a acao de edicao desabilitada na tela e sao rejeitadas pela API com o codigo `CARD_PURCHASE_INVOICE_LOCKED` (HTTP 409) caso a chamada ocorra mesmo assim. O bloqueio ocorre antes de qualquer alteracao em `Transaction`, `Installment`, `Invoice` ou auditoria.

A `Installment` tecnica vinculada a uma compra recorrente materializada (mesma `Transaction` que ja aparece como compra operacional com indicador de recorrencia) nao e exibida em nenhuma area da tela `Cartoes`; ela e filtrada da secao de historico de parcelas.

## Movimentacao de compra entre faturas/periodos

A movimentacao de uma compra para outro periodo de fatura usa o contrato dedicado:

```text
POST /api/credit-card-accounts/:cardId/purchases/:transactionId/move-invoice-period
```

Payload:

```json
{
  "invoicePeriod": "2026-08"
}
```

`invoicePeriod` representa o mes de fechamento da fatura (`AAAA-MM`). A API calcula o periodo real pelo mesmo dominio usado no registro normal de compras, considerando `closingDay` e `dueDay` do cartao agrupador. O cliente nao envia `invoiceId` de destino.

Comportamento:

- valida tenant, perfil financeiro, cartao, compra e fatura de origem;
- rejeita periodo invalido com `CARD_PURCHASE_INVOICE_PERIOD_INVALID`;
- rejeita movimentacao para o mesmo periodo com `CARD_PURCHASE_INVOICE_PERIOD_UNCHANGED`;
- rejeita origem travada com `CARD_PURCHASE_INVOICE_LOCKED`;
- rejeita destino travado com `CARD_PURCHASE_DESTINATION_INVOICE_LOCKED`;
- resolve ou cria fatura destino aberta para o periodo calculado;
- move somente a compra/ocorrencia selecionada;
- preserva `cardId`, `cardInstrumentId`, categoria, descricao, valor, moeda, status, recorrencia e demais vinculos da compra;
- ajusta os totais da fatura de origem e da fatura destino na mesma transacao;
- registra auditoria redigida da operacao.

Para compras recorrentes materializadas, a movimentacao afeta apenas a ocorrencia ja gerada. A regra da recorrencia nao e alterada.

Para compras parceladas, a movimentacao desta entrega e limitada a compra/ocorrencia selecionada. Movimentar um conjunto completo de parcelas continua fora de escopo ate existir contrato especifico de lote.

## Fluxo legado

O fluxo antigo de criar cartoes separados e vincular adicionais manualmente nao e o comportamento principal.

O modelo novo nao deve depender de `CardAdditionalLink` para cadastro, compras, faturas, recorrencias, parcelas, previsoes ou exibicao principal. Se alguma rota ou tabela legada permanecer temporariamente por compatibilidade, ela deve ser documentada como legado e nao deve sustentar novos fluxos.

## Rotas principais

As rotas de UI/API devem tratar o agrupador como recurso pai e instrumentos como recursos internos.

Rotas principais ja esperadas pela tela `Contas e Cartoes`:

```text
GET  /api/credit-card-accounts?status=all
POST /api/credit-card-accounts
PATCH /api/credit-card-accounts/:cardId
POST /api/credit-card-accounts/:cardId/instruments
PATCH /api/credit-card-accounts/:cardId/default-instrument
POST /api/credit-card-accounts/:cardId/archive
POST /api/credit-card-accounts/:cardId/purchases/:transactionId/move-invoice-period
PATCH /api/credit-card-instruments/:instrumentId
POST /api/credit-card-instruments/:instrumentId/archive
```

Exemplo minimo de criacao de agrupador com instrumento inicial:

```json
{
  "name": "Cartao C6",
  "institutionKey": "c6",
  "brandKey": "mastercard",
  "closingDay": 20,
  "dueDay": 10,
  "paymentAccountId": "account-main",
  "creditLimitMinor": 500000,
  "instruments": [
    {
      "type": "physical",
      "holder": "primary",
      "name": "Fisico titular",
      "maskedIdentifier": "**** 1111",
      "creditLimitMinor": 300000
    }
  ]
}
```

Exemplo minimo de criacao de instrumento em agrupador existente:

```json
{
  "type": "virtual",
  "holder": "additional",
  "name": "Virtual adicional",
  "maskedIdentifier": "**** 2222",
  "creditLimitMinor": 100000
}
```

## Hierarquia da tela `Cartoes`

A rota `/cartoes` deve priorizar a decisao operacional sobre a fatura selecionada, sem alterar os contratos financeiros descritos neste documento.

Ordem esperada de leitura:

1. selecao do cartao e do periodo da fatura;
2. valor a pagar, estado da fatura, fechamento e vencimento;
3. acoes disponiveis para fechar ou pagar a fatura;
4. composicao, conciliacao, compras por instrumento e limite do cartao;
5. busca, filtros e lista de compras.

A lista de compras deve:

- preservar o agrupamento e os subtotais por instrumento;
- exibir cabecalho comparavel no desktop com data, compra, situacao, valor e acoes;
- manter rotulos de contexto por campo no mobile, sem depender da posicao de uma coluna;
- representar conciliacao com icone e texto acessivel, sem depender apenas de cor;
- mostrar contadores nos filtros e anunciar a quantidade de compras visiveis;
- oferecer estado vazio especifico quando busca e filtros nao retornarem resultados;
- manter identificadores de cartao sempre mascarados.

Os modais de compra e pagamento devem ter titulo e descricao acessiveis, fechamento por controle identificado, foco inicial em campo interativo e layout de coluna unica nas viewports moveis.

A validacao visual permanente usa `scripts/statement-visual/cards-interface.mjs` para os estados principal e modal em desktop e mobile, e `scripts/statement-visual/cards-interface-adversarial.mjs` para `1366x768`, arvore de acessibilidade, anuncio unico da regiao viva, agrupamentos recolhidos e fluxo completo por teclado. O workflow `Statement visual validation` deve preservar as evidencias `cards-desktop.png`, `cards-modal-desktop.png`, `cards-mobile.png`, `cards-modal-mobile.png`, `cards-compact-desktop.png`, `cards-collapsed-groups.png`, `cards-modal-compact-desktop.png`, `cards-interface.json` e `cards-interface-adversarial.json`.

## Cobertura esperada

A cobertura automatizada deve proteger pelo menos:

- criacao de agrupador com instrumento inicial;
- criacao de instrumentos fisicos e virtuais;
- titular principal e adicional como titularidade do instrumento, nao como cartao separado;
- default unico por agrupador;
- primeiro instrumento ativo virando default;
- arquivamento do default promovendo outro instrumento ativo;
- agrupador bloqueado/inativo sem instrumento ativo;
- soma de limites individuais respeitando o limite total;
- compra em instrumentos diferentes gerando uma fatura unica por agrupador;
- fatura exibindo origem por instrumento;
- parcelas e recorrencias preservando o instrumento da compra;
- recorrencias preservando o instrumento definido na criacao;
- movimentacao segura de compra para outro periodo de fatura;
- tela `Contas e Cartoes` com lista hierarquica, criacao, edicao, default, arquivamento, estado bloqueado/inativo e ausencia do fluxo legado;
- tela `Cartoes` com hierarquia da fatura, busca, filtros, lista responsiva, estados acessiveis e modais validados em desktop e mobile.
