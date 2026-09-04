# Relatorios do SolverFin

Este documento e a fonte funcional da area **Relatorios**. Os contratos tecnicos da evolucao ficam em [`API_REPORTS.md`](./API_REPORTS.md).

## Objetivo

A area transforma dados canonicos do perfil financeiro em consultas somente leitura, respeitando tenant, historico, moedas e ausencia de dupla contagem.

## Visoes disponiveis

A rota `/relatorios` possui duas visoes:

- **Evolucao por categoria** (`view=category-evolution`), opcao inicial;
- **Parcelas consolidadas** (`view=installments`), preservada com seus filtros atuais.

Links e formularios gerados pela aplicacao informam `view` explicitamente e preservam `profileId`. Links antigos sem `view` continuam abrindo parcelas quando possuem somente `month`, `status`, `cardId` ou `categoryId`. Filtros `interval`, `start`, `periods` ou `accountId` selecionam evolucao. Como `cardId` tambem pertence ao contrato legado de parcelas, o filtro por cartao da evolucao sempre e emitido com `view=category-evolution`. Misturar as duas familias sem `view` produz erro orientado ao usuario.

## Arquetipo de analise

Desde a issue #611, as visoes prontas de `/relatorios` seguem o arquetipo A5 de analise sem alterar os contratos financeiros das fontes. Cada bloco monetario apresenta, nesta ordem:

1. **Resumo** com os indicadores que ajudam a interpretar o recorte;
2. **Visualizacao** do comportamento ou distribuicao relevante;
3. **Destaques** e excecoes que merecem revisao;
4. **Detalhe** com a matriz ou tabela completa.

A moeda e boundary da composicao. Quando um recorte possui mais de uma moeda, cada codigo recebe um bloco independente antes de qualquer soma ou agrupamento. Nao existe conversao cambial implicita nem total unico entre moedas distintas.

Os filtros permanecem na URL e continuam determinando o mesmo recorte usado por resumo, visualizacao, destaques e detalhe. A composicao e SSR, reutiliza primitivas do design system e `Money`, mantem foco visivel e usa overflow controlado para tabelas largas em viewport reduzido.

## Evolucao por categoria

**Status:** disponivel desde a issue #542, ampliada pelas issues #546 e #611.

A visao apresenta primeiro resumo, tendencia do resultado e destaques do recorte. A matriz hierarquica por moeda permanece como detalhe completo, com coluna de descricao, colunas de periodo, **Media** e **Total**. A ordem dentro da matriz e:

1. Receitas;
2. arvore de categorias de receita;
3. Despesas;
4. arvore de categorias de despesa;
5. Resultado.

### Intervalos e origem financeira

- `monthly`: inicio `AAAA-MM`, 1 a 24 meses, padrao 12;
- `annual`: inicio `AAAA`, 1 a 10 anos, padrao 3;
- `rolling-year`: inicio `AAAA-MM`, 1 a 10 periodos consecutivos de 12 meses, padrao 3.

Quando o inicio esta ausente, a ultima coluna termina no mes ou ano UTC corrente. Periodos sem movimento permanecem na matriz. Parametros presentes e invalidos nunca sao corrigidos silenciosamente.

O campo **Conta ou cartao** usa um unico seletor com dois grupos:

- **Contas**: contas ativas do perfil, na ordem de `/api/accounts`;
- **Cartoes de credito**: cartoes agrupadores `active` ou `blocked`, na ordem de `/api/credit-card-accounts`.

A primeira opcao e **Todas as contas e cartoes**:

- remove simultaneamente `accountId` e `cardId` e preserva o resultado geral anterior, inclusive movimentos elegiveis sem esses vinculos;
- uma conta selecionada emite somente `accountId=<uuid>` e inclui movimentos cujo `Transaction.accountId` corresponda exatamente a ela;
- um cartao selecionado emite somente `cardId=<uuid>` e inclui compras de todos os instrumentos fisicos, virtuais, principais e adicionais do agrupador;
- instrumentos internos nao aparecem como opcoes separadas;
- cartao bloqueado continua selecionavel para consulta do historico;
- alterar intervalo, inicio ou quantidade preserva a origem selecionada;
- trocar `profileId` remove os dois identificadores antes da navegacao;
- se nao houver origem consultavel, permanece apenas **Todas as contas e cartoes**;
- se contas ou cartoes falharem ao carregar, a pagina exibe `api-error`, sem lista parcial nem troca silenciosa da selecao.

`accountId` e `cardId` sao mutuamente exclusivos. A interface nao gera ambos, e a web e a API rejeitam URLs externas que contenham os dois.

O formulario funciona sem JavaScript. O valor unico `origin=account:<uuid>|card:<uuid>` produzido pelo seletor e redirecionado para a URL canonica com somente `accountId` ou `cardId`. Com JavaScript, o mesmo contrato e enviado diretamente. Quando um valor invalido e recebido, o estado de erro preserva a entrada para correcao.

### Fonte financeira

A evolucao usa `Transaction.occurredOn` e inclui somente `income|expense` com `posted|reconciled`.

Nao entram transferencias nem estados `planned`, `suggested` ou `voided`. `TransactionGroup`, `Installment`, `Invoice`, `Recurrence` e outros vinculos nao sao somados como movimentos adicionais. No recorte por cartao, o pagamento da fatura continua excluido e nao e somado novamente a compra. A API agrega no servidor e nao envia historico bruto ao frontend.

Moedas diferentes geram blocos independentes, sem conversao ou soma entre codigos. O resumo, a tendencia, os destaques e a matriz usam a mesma moeda do bloco e exibem valores monetarios por `Money`. Quando a API nao retorna bloco monetario porque o recorte nao possui movimentos, a matriz vazia apresenta zeros neutros e nao fabrica simbolo ou codigo de moeda.

### Hierarquia recolhivel

- a categoria principal consolida seus valores diretos e descendentes;
- filhos consolidam a propria subarvore;
- profundidade nao e limitada a dois niveis;
- a taxonomia atual e aplicada ao historico;
- categoria arquivada com movimento permanece visivel;
- lancamentos nao classificados aparecem em **Sem categoria**;
- nos totalmente zerados sao ocultados;
- irmaos sao ordenados por magnitude total e depois por nome `pt-BR`.

As linhas **Receitas** e **Despesas** apresentam um controle quando sua secao possui categorias. O controle oculta ou exibe toda a arvore daquela secao sem alterar os valores consolidados da linha. Categorias com filhos tambem possuem controle proprio; categorias folha, secoes vazias e **Resultado** nao possuem controle.

Todos os controles sao botoes com foco visivel, nome acessivel, `aria-expanded` e `aria-controls`. O nome da raiz identifica explicitamente a secao, como **Recolher receitas** ou **Expandir despesas**.

Todas as arvores chegam expandidas no HTML SSR. O JavaScript apenas melhora a interacao:

- recolher **Receitas** ou **Despesas** oculta a arvore completa e mantem a linha da secao visivel;
- recolher uma categoria oculta toda a subarvore sem alterar os valores consolidados;
- o estado de cada secao, categoria e bloco de moeda e independente;
- fechar e reabrir uma secao ou ancestral preserva os estados recolhidos dos descendentes;
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

A carga inicial renderiza diretamente `ready`, `empty`, `filter-error` ou `api-error`. Resumo, visualizacao e destaques precedem a matriz quando ha dados monetarios. A tendencia usa estrutura textual acessivel alem das barras de apoio visual. A matriz usa tabela semantica, cabecalhos de coluna/linha, rotulos acessiveis de periodo e sinal textual em todos os estados, inclusive no recorte vazio. Em desktop, cabecalho e descricao permanecem fixos durante a rolagem quando suportado. Em telas menores, filtros e camadas analiticas quebram em linhas e a matriz rola horizontalmente sem cortar dados. Botoes de secao e categoria operam por mouse e teclado e possuem foco visivel.

O drilldown da evolucao continua condicionado a existir um destino canonico que represente fielmente o intervalo e a origem selecionados. Nao se cria link parcial para `/lancamentos` quando a rota de destino perderia parte do recorte anual, rolling-year, conta/cartao ou outra dimensao material.

## Parcelas consolidadas

A visao permanece somente leitura e usa `GET /api/installments`. Mantem filtros por mes, status, cartao e categoria, com `profileId` encaminhado explicitamente quando presente.

Os indicadores preservados sao:

- abertas ou planejadas;
- postadas ou ligadas a faturas fechadas;
- vencidas;
- futuras;
- total mensal.

Desde a issue #611, as parcelas sao particionadas por `currency` antes do calculo desses indicadores e dos agrupamentos. Cada moeda recebe resumo proprio, visualizacao dos agrupamentos por mes/cartao/categoria, destaques e tabela detalhada. Parcelas canceladas permanecem identificaveis no detalhe e nao entram nos valores ativos consolidados. Todos os valores monetarios sao exibidos por `Money` com moeda explicita.

Os agrupamentos **Por cartao** e **Por categoria** preservam a identidade canonica de cada recurso e oferecem drilldown para a propria visao de parcelas. O link mantem `view=installments`, mes, status, `profileId` e o filtro irmao compativel, substituindo somente o `cardId` ou `categoryId` correspondente. Recursos homonimos permanecem separados por ID; linhas sinteticas sem ID, como **Sem cartao informado** ou **Sem categoria**, nao fabricam um destino navegavel.

## Estados

- `ready`: camadas de analise e respectivo detalhe renderizados por moeda;
- `empty`: cabecalhos e linhas principais preservados, com valores neutros quando nao existir moeda no recorte e orientacao para outro periodo, conta ou cartao;
- `filter-error`: erro local antes da consulta financeira, preservando os valores enviados para correcao;
- `api-error`: falha segura ao carregar contas, cartoes ou relatorio, sem sucesso parcial.

## Fora do escopo atual

Exportacao PDF/CSV/Excel, impressao formatada, comparacao com orcamento, drilldown da evolucao quando nao existir destino canonico fiel ao recorte, multiplas contas ou cartoes simultaneos, combinacao conta+cartao, conversao cambial e persistencia do estado da arvore.

## Testes

A entrega cobre geracao dos tres intervalos, limites, totais, medias, percentuais, denominador zero, hierarquia multinivel, arquivadas, Sem categoria, moedas, tenant, estados SSR, preservacao de filtros invalidos e regressao integral da visao de parcelas.

A issue #546 acrescenta testes para:

- conta ativa, conta sem movimentos, conta arquivada/inexistente/fora do perfil e correspondencia exata de `accountId`;
- cartao `active` ou `blocked`, cartao sem movimentos, arquivado/inexistente/fora do perfil, varios instrumentos e instrumento arquivado com historico;
- pagamento de fatura excluido do recorte por cartao e ausencia de dupla contagem;
- UUID invalido e presenca simultanea de `accountId` e `cardId`;
- contrato **Todas as contas e cartoes**;
- seletor SSR agrupado, falha de qualquer lista sem sucesso parcial e limpeza ao trocar perfil;
- controles acessiveis nas secoes e categorias, hierarquia multinivel, independencia por bloco e preservacao do estado de descendentes;
- destaque de **Resultado** negativo;
- validacao Chrome em desktop e mobile com conta e cartao.

A issue #611 acrescenta controles para:

- ordem `resumo -> visualizacao -> destaques -> detalhe` em cada bloco monetario;
- relatorio de evolucao com duas moedas e janela estendida de 24 periodos;
- separacao de parcelas BRL/USD antes de qualquer total ou agrupamento;
- uso de tabela semantica no detalhe de parcelas e preservacao da matriz semantica na evolucao;
- uso de `Money` para os valores monetarios das camadas migradas;
- drilldown canonico por cartao/categoria em parcelas, com preservacao dos filtros compativeis;
- recursos homonimos separados por ID e ausencia de link fabricado para agrupamentos sinteticos sem identidade canonica.

## Referencias

- [`API_REPORTS.md`](./API_REPORTS.md)
- [`API_TRANSACTIONS.md`](./API_TRANSACTIONS.md)
- [`API_CATEGORIES.md`](./API_CATEGORIES.md)
- [`CARDS.md`](./CARDS.md)
- [`TENANT.md`](./TENANT.md)
- [`STATUS_MATRIX.md`](./STATUS_MATRIX.md)
- [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)
