# Relatorios do SolverFin

Este documento e a fonte funcional da area **Relatorios**. Os contratos tecnicos da evolucao ficam em [`API_REPORTS.md`](./API_REPORTS.md).

## Objetivo

A area transforma dados canonicos do perfil financeiro em consultas somente leitura, respeitando tenant, historico, moedas e ausencia de dupla contagem.

## Visoes disponiveis

A rota `/relatorios` possui duas visoes:

- **Evolucao por categoria** (`view=category-evolution`), opcao inicial;
- **Parcelas consolidadas** (`view=installments`), preservada com seus filtros atuais.

Links e formularios gerados pela aplicacao informam `view` explicitamente e preservam `profileId`. Links antigos sem `view` continuam abrindo parcelas quando possuem somente `month`, `status`, `cardId` ou `categoryId`. Filtros `interval`, `start`, `periods` ou `accountId` selecionam evolucao. Misturar as duas familias sem `view` produz erro orientado ao usuario.

## Evolucao por categoria

**Status:** disponivel desde a issue #542 e ampliada pela issue #546.

A visao apresenta uma matriz hierarquica por moeda, com coluna de descricao, colunas de periodo, **Media** e **Total**. A ordem e:

1. Receitas;
2. arvore de categorias de receita;
3. Despesas;
4. arvore de categorias de despesa;
5. Resultado.

### Intervalos e conta

- `monthly`: inicio `AAAA-MM`, 1 a 24 meses, padrao 12;
- `annual`: inicio `AAAA`, 1 a 10 anos, padrao 3;
- `rolling-year`: inicio `AAAA-MM`, 1 a 10 periodos consecutivos de 12 meses, padrao 3.

Quando o inicio esta ausente, a ultima coluna termina no mes ou ano UTC corrente. Periodos sem movimento permanecem na matriz. Parametros presentes e invalidos nunca sao corrigidos silenciosamente.

O campo **Conta** lista, na ordem retornada por `/api/accounts`, somente contas ativas do perfil autorizado. A primeira opcao e **Todas as contas**:

- **Todas as contas** remove `accountId` da consulta enviada a API e preserva o resultado geral anterior, inclusive movimentos elegiveis sem conta;
- uma conta selecionada grava `accountId=<uuid>` e inclui apenas movimentos vinculados diretamente a ela;
- alterar intervalo, inicio ou quantidade preserva a conta;
- trocar `profileId` remove o filtro de conta antes da navegacao, evitando transportar uma conta entre perfis;
- se nao houver conta ativa, apenas **Todas as contas** permanece disponivel;
- falha ao carregar contas produz `api-error`; a tela nao substitui silenciosamente uma selecao por **Todas as contas**.

O formulario funciona sem JavaScript. Ao recarregar com outro intervalo, o servidor apresenta o formato e os limites correspondentes. Quando um valor invalido e enviado, o estado de erro preserva literalmente o valor para que a pessoa possa identifica-lo e corrigi-lo.

### Fonte financeira

A evolucao usa `Transaction.occurredOn` e inclui somente `income|expense` com `posted|reconciled`.

Nao entram transferencias nem estados `planned`, `suggested` ou `voided`. `TransactionGroup`, `Installment`, `Invoice`, `Recurrence` e outros vinculos nao sao somados como movimentos adicionais. A API agrega no servidor e nao envia historico bruto ao frontend.

Moedas diferentes geram blocos independentes, sem conversao ou soma entre codigos. Quando a API nao retorna bloco monetario porque o recorte nao possui movimentos, a matriz vazia apresenta zeros neutros e nao fabrica simbolo ou codigo de moeda.

### Hierarquia recolhivel

- a categoria principal consolida seus valores diretos e descendentes;
- filhos consolidam a propria subarvore;
- profundidade nao e limitada a dois niveis;
- a taxonomia atual e aplicada ao historico;
- categoria arquivada com movimento permanece visivel;
- lancamentos nao classificados aparecem em **Sem categoria**;
- nos totalmente zerados sao ocultados;
- irmaos sao ordenados por magnitude total e depois por nome `pt-BR`.

Categorias com filhos apresentam um botao acessivel de recolher/expandir com `aria-expanded` e `aria-controls`. Categorias folha e as linhas **Receitas**, **Despesas** e **Resultado** nao apresentam esse controle.

Todas as arvores chegam expandidas no HTML SSR. O JavaScript apenas melhora a interacao:

- recolher um pai oculta toda a subarvore sem alterar os valores consolidados;
- cada ocorrencia possui estado proprio por moeda e secao;
- o estado recolhido de um descendente e preservado quando um ancestral fecha e abre novamente;
- aplicar filtros ou recarregar reinicia tudo expandido;
- o estado nao e persistido em URL, sessao ou armazenamento local;
- sem JavaScript, todas as linhas permanecem visiveis e o formulario continua funcional.

### Valores e percentuais

- receitas aparecem positivas;
- despesas sao magnitudes na API e aparecem negativas na web;
- resultado e receita menos despesa, com sinal real;
- zero e normalizado para evitar `-0`;
- media divide o total pela quantidade de periodos, incluindo colunas zeradas;
- media monetaria usa empate afastado de zero;
- denominador zero aparece como `—` na interface;
- percentuais de Media e Total usam numeradores e denominadores agregados, nao media simples das colunas.

Somente as celulas negativas da linha **Resultado**, inclusive **Media** e **Total**, usam o token semantico `--danger`. O sinal de menos permanece no texto; a cor e reforco visual, nao a unica indicacao. Zero, valores positivos e linhas de despesa nao recebem esse destaque por essa regra.

### SSR, responsividade e acessibilidade

A carga inicial renderiza diretamente `ready`, `empty`, `filter-error` ou `api-error`. A matriz usa tabela semantica, cabecalhos de coluna/linha, rotulos acessiveis de periodo e sinal textual em todos os estados, inclusive no recorte vazio. Em desktop, cabecalho e descricao permanecem fixos durante a rolagem quando suportado. Em telas menores, filtros quebram em linhas e a matriz rola horizontalmente sem cortar dados. Botoes de hierarquia operam por mouse e teclado e possuem foco visivel.

## Parcelas consolidadas

A visao permanece somente leitura e usa `GET /api/installments`. Mantem filtros por mes, status, cartao e categoria, com `profileId` encaminhado explicitamente quando presente.

Os indicadores preservados sao:

- abertas ou planejadas;
- postadas ou ligadas a faturas fechadas;
- vencidas;
- futuras;
- total mensal.

Abaixo dos indicadores, a tela preserva os agrupamentos por mes, cartao e categoria e a lista completa das parcelas consideradas. Parcelas canceladas permanecem identificaveis na lista e nao entram nos valores ativos consolidados.

## Estados

- `ready`: matriz ou parcelas renderizadas;
- `empty`: cabecalhos e linhas principais preservados, com valores neutros quando nao existir moeda no recorte e orientacao para outro periodo ou conta;
- `filter-error`: erro local antes da consulta financeira, preservando os valores enviados para correcao;
- `api-error`: falha segura ao carregar contas ou relatorio, sem sucesso parcial.

## Fora do escopo atual

Exportacao PDF/CSV/Excel, impressao formatada, graficos adicionais, comparacao com orcamento, drill-down, multiplas contas simultaneas, conversao cambial e persistencia do estado da arvore.

## Testes

A entrega cobre geracao dos tres intervalos, limites, totais, medias, percentuais, denominador zero, hierarquia multinivel, arquivadas, Sem categoria, moedas, tenant, estados SSR, preservacao de filtros invalidos e regressao integral da visao de parcelas.

A issue #546 acrescenta testes de filtro por conta, conta sem movimentos, conta arquivada/inexistente/fora do perfil, UUID invalido, contrato **Todas as contas**, seletor SSR, falha da lista de contas, controles acessiveis multinivel, independencia por bloco, preservacao do estado de descendentes e destaque de Resultado negativo. O gate visual `npm run qa:statement-visual` registra desktop e mobile para esses controles.

## Referencias

- [`API_REPORTS.md`](./API_REPORTS.md)
- [`API_TRANSACTIONS.md`](./API_TRANSACTIONS.md)
- [`API_CATEGORIES.md`](./API_CATEGORIES.md)
- [`TENANT.md`](./TENANT.md)
- [`STATUS_MATRIX.md`](./STATUS_MATRIX.md)
- [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)
