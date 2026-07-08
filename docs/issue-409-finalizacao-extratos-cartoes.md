# Issue #409 - Finalizacao de Extrato da conta e Cartoes de Credito

Este documento registra as decisoes de fechamento funcional da issue #409 para reduzir ambiguidades entre as telas `/lancamentos` e `/cartoes`.

## Extrato da conta (`/lancamentos`)

Estado confirmado na implementacao atual:

- A tela usa `accountId` e `month` na query string para renderizar a conta e o mes selecionados.
- A rota `/lancamentos` materializa recorrencias ativas da conta selecionada ate o ultimo dia do mes consultado antes de renderizar a lista.
- Recorrencias aparecem como lancamentos normais na lista de **Movimentacoes**, com indicador visual e acoes no menu do proprio lancamento.
- Nao ha bloco separado de parcelas, recorrencias ou compromissos previsiveis.
- Criacao unica, parcelada e fixa/recorrente continua centralizada no modal de lancamento.
- Edicao, clone, conciliacao/desconciliacao e exclusao/estorno permanecem no menu de acoes da linha.

### Decisao sobre chips de status

Os chips **Pendentes**, **Nao conciliados** e **Conciliados** permanecem como **indicadores de resumo**, nao como filtros interativos.

Motivo:

- A tela ja possui uma tabela unica de movimentacoes que mistura saldo previsto e saldo efetivo.
- Filtrar a lista por status alteraria o contexto visual do saldo e poderia induzir leitura incorreta do extrato.
- A matriz de status deve tratar estes chips como indicadores ate existir um desenho especifico para filtros que preserve a leitura de saldo.

## Cartoes de Credito (`/cartoes`)

Estado confirmado na implementacao atual:

- O cadastro do cartao agrupador e dos instrumentos permanece em `/contas-cartoes`.
- `/cartoes` e a rotina operacional de compras, faturas, fechamento e pagamento.
- A tela seleciona cartao agrupador e fatura por estado da URL/formulario.
- Compras, parcelas e recorrencias aparecem na lista principal da fatura; nao ha bloco separado de parcelas, recorrencias ou historico tecnico.
- Compra unica, parcelada e fixa/recorrente preserva `cardInstrumentId` quando o instrumento e informado.
- Edicao de compra em fatura aberta permanece disponivel.
- Edicao de compra fica desabilitada na UI quando a fatura esta `closed`, `paid` ou `cancelled`; a API tambem rejeita edicoes desse tipo com `CARD_PURCHASE_INVOICE_LOCKED`.
- Fechamento e pagamento de fatura continuam no painel de resumo da fatura.

## Lacuna transformada em issue tecnica

A lacuna de mover compra para outra fatura/periodo **nao deve ser improvisada na UI** sem contrato backend explicito.

Foi criada a issue #410 para definir e implementar o contrato seguro antes de expor essa acao na tela. O contrato precisa tratar, de forma transacional:

- recalculo da fatura destino pelo dominio de fechamento/vencimento;
- ajuste de totais da fatura origem e destino;
- preservacao de `cardId`, `cardInstrumentId`, categoria, recorrencia e parcelas quando aplicavel;
- bloqueio quando a fatura origem ou destino estiver `closed`, `paid` ou `cancelled`;
- auditoria da movimentacao.

## Testes adicionados

Foi adicionado `apps/web/src/dev-server/issue-409-finalization.test.ts` cobrindo regressao para:

- chips de status do extrato como indicadores, sem comportamento de filtro;
- ausencia de blocos separados de parcelas/recorrencias no extrato;
- compras de cartao exibidas apenas na lista principal da fatura;
- preservacao de instrumento interno em compra de cartao;
- bloqueio de edicao de compra em fatura fechada;
- ausencia de acao de mover compra enquanto o contrato backend da issue #410 nao existir.

## Pendencias restantes

- Implementar a issue #410 antes de habilitar qualquer acao visual para mover compras entre faturas/periodos.
- Avaliar futuramente, em issue separada, se filtros de status no extrato podem ser desenhados sem prejudicar a leitura do saldo corrente e previsto.
