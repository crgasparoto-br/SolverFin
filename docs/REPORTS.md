# Relatorios do SolverFin

Este documento e a fonte funcional da area **Relatorios**. Os contratos tecnicos da evolucao ficam em [`API_REPORTS.md`](./API_REPORTS.md).

## Objetivo

A area transforma dados canonicos do perfil financeiro em consultas somente leitura, respeitando tenant, historico, moedas e ausencia de dupla contagem.

## Visoes disponiveis

A rota `/relatorios` possui duas visoes:

- **Evolucao por categoria** (`view=category-evolution`), opcao inicial;
- **Parcelas consolidadas** (`view=installments`), preservada com seus filtros atuais.

Links e formularios gerados pela aplicacao informam `view` explicitamente e preservam `profileId`. Links antigos sem `view` continuam abrindo parcelas quando possuem somente `month`, `status`, `cardId` ou `categoryId`. Filtros `interval`, `start` ou `periods` selecionam evolucao. Misturar as duas familias sem `view` produz erro orientado ao usuario.

## Evolucao por categoria

**Status:** disponivel desde a issue #542.

A visao apresenta uma matriz hierarquica por moeda, com coluna de descricao, colunas de periodo, **Media** e **Total**. A ordem e:

1. Receitas;
2. arvore de categorias de receita;
3. Despesas;
4. arvore de categorias de despesa;
5. Resultado.

### Intervalos

- `monthly`: inicio `AAAA-MM`, 1 a 24 meses, padrao 12;
- `annual`: inicio `AAAA`, 1 a 10 anos, padrao 3;
- `rolling-year`: inicio `AAAA-MM`, 1 a 10 periodos consecutivos de 12 meses, padrao 3.

Quando o inicio esta ausente, a ultima coluna termina no mes ou ano UTC corrente. Periodos sem movimento permanecem na matriz. Parametros presentes e invalidos nunca sao corrigidos silenciosamente.

O formulario funciona sem JavaScript. Ao recarregar com outro intervalo, o servidor apresenta o formato e os limites correspondentes. Quando um valor invalido e enviado, o estado de erro preserva literalmente `interval`, `start` e `periods` para que a pessoa possa identificar e corrigir a entrada original.

### Fonte financeira

A evolucao usa `Transaction.occurredOn` e inclui somente `income|expense` com `posted|reconciled`.

Nao entram transferencias nem estados `planned`, `suggested` ou `voided`. `TransactionGroup`, `Installment`, `Invoice`, `Recurrence` e outros vinculos nao sao somados como movimentos adicionais. A API agrega no servidor e nao envia historico bruto ao frontend.

Moedas diferentes geram blocos independentes, sem conversao ou soma entre codigos. Quando a API nao retorna bloco monetario porque o recorte nao possui movimentos, a matriz vazia apresenta zeros neutros e nao fabrica simbolo ou codigo de moeda.

### Hierarquia

- a categoria principal consolida seus valores diretos e descendentes;
- filhos consolidam a propria subarvore;
- profundidade nao e limitada a dois niveis;
- a taxonomia atual e aplicada ao historico;
- categoria arquivada com movimento permanece visivel;
- lancamentos nao classificados aparecem em **Sem categoria**;
- nos totalmente zerados sao ocultados;
- irmaos sao ordenados por magnitude total e depois por nome `pt-BR`.

### Valores e percentuais

- receitas aparecem positivas;
- despesas sao magnitudes na API e aparecem negativas na web;
- resultado e receita menos despesa, com sinal real;
- zero e normalizado para evitar `-0`;
- media divide o total pela quantidade de periodos, incluindo colunas zeradas;
- media monetaria usa empate afastado de zero;
- denominador zero aparece como `—` na interface;
- percentuais de Media e Total usam numeradores e denominadores agregados, nao media simples das colunas.

### SSR, responsividade e acessibilidade

A carga inicial renderiza diretamente `ready`, `empty`, `filter-error` ou `api-error`. A matriz usa tabela semantica, cabecalhos de coluna/linha, rotulos acessiveis de periodo e sinal textual em todos os estados, inclusive no recorte vazio. Em desktop, cabecalho e descricao permanecem fixos durante a rolagem quando suportado. Em telas menores, filtros quebram em linhas e a matriz rola horizontalmente sem cortar dados.

## Parcelas consolidadas

A visao permanece somente leitura e usa `GET /api/installments`. Mantem filtros por mes, status, cartao e categoria, indicadores consolidados e a lista de parcelas consideradas. `profileId` e encaminhado explicitamente quando presente.

## Estados

- `ready`: matriz ou parcelas renderizadas;
- `empty`: cabecalhos e linhas principais preservados, com valores neutros quando nao existir moeda no recorte e orientacao para outro periodo;
- `filter-error`: erro local antes da consulta financeira, preservando os valores enviados para correcao;
- `api-error`: falha segura da API, sem sucesso parcial.

## Fora do escopo atual

Exportacao PDF/CSV/Excel, impressao formatada, graficos adicionais, comparacao com orcamento, drill-down, filtros avancados, conversao cambial e persistencia de preferencias fora da URL.

## Testes

A entrega cobre geracao dos tres intervalos, limites, totais, medias, percentuais, denominador zero, hierarquia multinivel, arquivadas, Sem categoria, moedas, tenant, estados SSR, preservacao de filtros invalidos e regressao da visao de parcelas. A fronteira publica da API compara perfil autorizado, inexistente, arquivado e requisicao sem autenticacao. O gate visual em Chrome visita `/relatorios` em desktop e mobile e registra os estados preenchido, vazio e de erro de filtro.

## Referencias

- [`API_REPORTS.md`](./API_REPORTS.md)
- [`API_TRANSACTIONS.md`](./API_TRANSACTIONS.md)
- [`API_CATEGORIES.md`](./API_CATEGORIES.md)
- [`TENANT.md`](./TENANT.md)
- [`STATUS_MATRIX.md`](./STATUS_MATRIX.md)
- [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)
