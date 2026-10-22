# Relatorios do SolverFin

Este documento e a fonte funcional da area **Relatorios**. Os contratos tecnicos da evolucao ficam em [`API_REPORTS.md`](./API_REPORTS.md).

## Objetivo

A area transforma dados canonicos do perfil financeiro em consultas somente leitura, respeitando tenant, historico, moedas e ausencia de dupla contagem.

## Visoes disponiveis

A rota `/relatorios` possui tres visoes:

- **Evolucao por categoria** (`view=category-evolution`), opcao inicial;
- **Parcelas consolidadas** (`view=installments`), preservada com seus filtros atuais;
- **Projecao de caixa** (`view=cash-flow`), com serie diaria canonica de 30, 60 ou 90 dias por moeda.

Links e formularios gerados pela aplicacao informam `view` explicitamente e preservam `profileId`. Links antigos sem `view` continuam abrindo parcelas quando possuem somente `month`, `status`, `cardId` ou `categoryId`. Filtros `interval`, `start`, `periods` ou `accountId` selecionam evolucao. Como `cardId` tambem pertence ao contrato legado de parcelas, o filtro por cartao da evolucao sempre e emitido com `view=category-evolution`. Misturar as duas familias sem `view` produz erro orientado ao usuario.

## Arquetipo de analise

Desde a issue #611, as visoes prontas de `/relatorios` seguem o arquetipo A5 de analise sem alterar os contratos financeiros das fontes. Cada bloco monetario apresenta, nesta ordem:

1. **Resumo** com os indicadores que ajudam a interpretar o recorte;
2. **Visualizacao** do comportamento ou distribuicao relevante;
3. **Destaques** e excecoes que merecem revisao;
4. **Detalhe** com a matriz ou tabela completa.

A moeda e boundary da composicao. Quando um recorte possui mais de uma moeda, cada codigo recebe um bloco independente antes de qualquer soma ou agrupamento. Nao existe conversao cambial implicita nem total unico entre moedas distintas.

Os filtros permanecem na URL e continuam determinando o mesmo recorte usado por resumo, visualizacao, destaques e detalhe. A composicao e SSR, reutiliza primitivas do design system e `Money`, mantem foco visivel e usa overflow controlado para tabelas largas em viewport reduzido.

## Refinamento de densidade e controles — PR #729 (22/10/2026)

A refatoracao de `/relatorios` reaproveita diretamente `renderButton` para atualizar as tres visoes, com tamanho, contraste e foco visivel da fundacao compartilhada. Os links equivalentes do seletor de intervalo recebem aparencia **neutra** (fundo claro, borda fina, texto petroleo); o intervalo ativo tem realce sutil sem se transformar em botao de confirmacao. O estado hover/focus deve ser verificado tambem contra a cascata do shell.

O cabecalho preserva o titulo unico e a indicacao discreta de somente leitura. A barra de filtros usa superficie clara, contornos finos, alturas coerentes e alinhamento compacto; em ate 760px os filtros sao reorganizados em duas colunas, com intervalo e origem em largura integral, e em ate 360px todos passam para uma coluna para evitar corte do seletor de mes. Os filtros e seus parametros GET permanecem disponiveis sem JavaScript; nenhuma selecao, permissao ou comportamento financeiro foi alterado.

Indicadores monetarios por moeda mantem a ordem **resumo → visualizacao → destaques → detalhe**, cards apenas para metricas de decisao e sem fundo primario escuro em todo o card. Receitas e despesas usam as cores semanticas do design system como reforco, mantendo sinal, texto e `Money`. A tendencia passou a usar colunas mais densas com rolagem horizontal local (teclado e touch); matrizes e tabelas preservam cabecalhos semanticos, primeira coluna fixa quando aplicavel e alinhamento numerico tabular. Nenhum total mistura moedas.

O aceite exige, **no HEAD exato da PR**, comparar capturas com a Golden Screen em 1366x768, 390x844 e 320x740: repouso/hover/foco dos controles, abas, filtros, indicadores, tendencia, BRL/USD, conteudo longo, estados vazio/erro, scroll local sem overflow global e legibilidade do detalhamento. Os cenarios Chrome existentes da #718 devem ser reutilizados; CI verde nao substitui a auditoria visual independente.

## Compactacao de grafico, destaques e matriz (22/10/2026, PR #729)

- **Resultado ao longo do tempo (evolucao por categoria):** exibe todos os pontos em grid responsivo que quebra linhas, sem barra horizontal mesmo no desktop, preservando rotulo, valor completo por `Money`, sinal e barra relativa. Em telas menores, reorganiza a quantidade de colunas conforme a largura. Somente este grafico usa `renderResultTrend(..., "Resultado por período", "grid")`; a projecao de caixa conserva o comportamento de rolagem local validado para seus pontos diarios.
- **Pontos para revisar:** melhor periodo, pior periodo e alerta passam a ocupar uma unica faixa compacta no desktop, sem bloco adicional de alerta abaixo. No mobile, os dois destaques dividem a primeira linha e o aviso fica abaixo, preservando leitura, semantica de `renderAlert` e contexto da moeda. Parcelas consolidadas reutilizam a mesma disposicao compacta.
- **Matriz por categoria:** o percentual fica **na mesma linha** do valor monetario, com fonte secundaria e separacao discreta; reduz-se o espacamento vertical das celulas e da indicacao de categoria arquivada. Todos os percentuais (inclusive `—` quando indisponiveis), valores, sinais, categorias, hierarquia expandivel, cabeçalhos e scroll local horizontal da matriz permanecem preservados. A largura maior da matriz e intencional; nao se deve truncar valores para economizar altura.
- **Prova de aceite:** no SHA atualizado da PR, o Chrome deve evidenciar ausencia de scrollbar no grafico de evolucao em 1366x768, 390x844 e 320x740, linhas consolidadas com altura controlada, agrupamento efetivo dos destaques, sem overflow global, e preservacao do scroll da matriz e do grafico de caixa. Os testes existentes da #718, e nao uma nova suite redundante, sao os donos dessas verificacoes.

## Seletor de moeda e densidade de numeros (22/10/2026, PR #729)

Na **Evolucao por categoria**, o seletor funcional **Moeda** faz parte da **mesma barra de filtros** e vem imediatamente depois de **Periodo**, antes da acao primaria **Atualizar relatorio**. Ha somente um formulario GET SSR e um botao de aplicacao para intervalo, conta/cartao, inicio, quantidade de periodos e moeda, sem exigir JavaScript. As opcoes incluem as moedas presentes no resultado, a selecao anterior (se fora do recorte) e **Todas as moedas**. A atualizacao preserva `view`, `interval`, `start`, `periods`, `profileId` e origem (`accountId` ou `cardId`) no mesmo envio. A faixa de resumo mostra a quantidade de periodos junto ao titulo `Leitura do período - BRL`, sem um cabeçalho isolado de moeda, outro formulario ou botao `Aplicar`. O filtro `currency=XXX` limita apenas a apresentacao de blocos monetarios ja retornados pela API, sem alterar calculos, converter valores ou misturar moedas. Sem parametro ou com `currency=all`, todos os blocos continuam visiveis; entrada de moeda invalida e rejeitada antes da chamada da API. Se a moeda escolhida nao possui movimentos, exibe estado vazio orientado e conserva o controle para alternar para Todas as moedas. A troca de intervalo conserva o filtro de moeda.

Os titulos de resumo, visualizacao, destaques e detalhe identificam cada moeda explicitamente, como **Leitura do período - BRL**, **Resultado ao longo do tempo - BRL**, **Pontos para revisar - BRL** e **Matriz por categoria - BRL**. Nao existe mais o `BRL` isolado entre filtros e resumo. O sufixo redundante de codigo de moeda fica oculto **em todos os valores do bloco**, incluindo cards, grafico, destaques e matriz, mantendo `Money`, o simbolo local (`R# Relatorios do SolverFin

Este documento e a fonte funcional da area **Relatorios**. Os contratos tecnicos da evolucao ficam em [`API_REPORTS.md`](./API_REPORTS.md).

## Objetivo

A area transforma dados canonicos do perfil financeiro em consultas somente leitura, respeitando tenant, historico, moedas e ausencia de dupla contagem.

## Visoes disponiveis

A rota `/relatorios` possui tres visoes:

- **Evolucao por categoria** (`view=category-evolution`), opcao inicial;
- **Parcelas consolidadas** (`view=installments`), preservada com seus filtros atuais;
- **Projecao de caixa** (`view=cash-flow`), com serie diaria canonica de 30, 60 ou 90 dias por moeda.

Links e formularios gerados pela aplicacao informam `view` explicitamente e preservam `profileId`. Links antigos sem `view` continuam abrindo parcelas quando possuem somente `month`, `status`, `cardId` ou `categoryId`. Filtros `interval`, `start`, `periods` ou `accountId` selecionam evolucao. Como `cardId` tambem pertence ao contrato legado de parcelas, o filtro por cartao da evolucao sempre e emitido com `view=category-evolution`. Misturar as duas familias sem `view` produz erro orientado ao usuario.

## Arquetipo de analise

Desde a issue #611, as visoes prontas de `/relatorios` seguem o arquetipo A5 de analise sem alterar os contratos financeiros das fontes. Cada bloco monetario apresenta, nesta ordem:

1. **Resumo** com os indicadores que ajudam a interpretar o recorte;
2. **Visualizacao** do comportamento ou distribuicao relevante;
3. **Destaques** e excecoes que merecem revisao;
4. **Detalhe** com a matriz ou tabela completa.

A moeda e boundary da composicao. Quando um recorte possui mais de uma moeda, cada codigo recebe um bloco independente antes de qualquer soma ou agrupamento. Nao existe conversao cambial implicita nem total unico entre moedas distintas.

Os filtros permanecem na URL e continuam determinando o mesmo recorte usado por resumo, visualizacao, destaques e detalhe. A composicao e SSR, reutiliza primitivas do design system e `Money`, mantem foco visivel e usa overflow controlado para tabelas largas em viewport reduzido.

## Refinamento de densidade e controles — PR #729 (22/10/2026)

A refatoracao de `/relatorios` reaproveita diretamente `renderButton` para atualizar as tres visoes, com tamanho, contraste e foco visivel da fundacao compartilhada. Os links equivalentes do seletor de intervalo recebem aparencia **neutra** (fundo claro, borda fina, texto petroleo); o intervalo ativo tem realce sutil sem se transformar em botao de confirmacao. O estado hover/focus deve ser verificado tambem contra a cascata do shell.

O cabecalho preserva o titulo unico e a indicacao discreta de somente leitura. A barra de filtros usa superficie clara, contornos finos, alturas coerentes e alinhamento compacto; em ate 760px os filtros sao reorganizados em duas colunas, com intervalo e origem em largura integral, e em ate 360px todos passam para uma coluna para evitar corte do seletor de mes. Os filtros e seus parametros GET permanecem disponiveis sem JavaScript; nenhuma selecao, permissao ou comportamento financeiro foi alterado.

Indicadores monetarios por moeda mantem a ordem **resumo → visualizacao → destaques → detalhe**, cards apenas para metricas de decisao e sem fundo primario escuro em todo o card. Receitas e despesas usam as cores semanticas do design system como reforco, mantendo sinal, texto e `Money`. A tendencia passou a usar colunas mais densas com rolagem horizontal local (teclado e touch); matrizes e tabelas preservam cabecalhos semanticos, primeira coluna fixa quando aplicavel e alinhamento numerico tabular. Nenhum total mistura moedas.

O aceite exige, **no HEAD exato da PR**, comparar capturas com a Golden Screen em 1366x768, 390x844 e 320x740: repouso/hover/foco dos controles, abas, filtros, indicadores, tendencia, BRL/USD, conteudo longo, estados vazio/erro, scroll local sem overflow global e legibilidade do detalhamento. Os cenarios Chrome existentes da #718 devem ser reutilizados; CI verde nao substitui a auditoria visual independente.

## Compactacao de grafico, destaques e matriz (22/10/2026, PR #729)

- **Resultado ao longo do tempo (evolucao por categoria):** exibe todos os pontos em grid responsivo que quebra linhas, sem barra horizontal mesmo no desktop, preservando rotulo, valor completo por `Money`, sinal e barra relativa. Em telas menores, reorganiza a quantidade de colunas conforme a largura. Somente este grafico usa `renderResultTrend(..., "Resultado por período", "grid")`; a projecao de caixa conserva o comportamento de rolagem local validado para seus pontos diarios.
- **Pontos para revisar:** melhor periodo, pior periodo e alerta passam a ocupar uma unica faixa compacta no desktop, sem bloco adicional de alerta abaixo. No mobile, os dois destaques dividem a primeira linha e o aviso fica abaixo, preservando leitura, semantica de `renderAlert` e contexto da moeda. Parcelas consolidadas reutilizam a mesma disposicao compacta.
- **Matriz por categoria:** o percentual fica **na mesma linha** do valor monetario, com fonte secundaria e separacao discreta; reduz-se o espacamento vertical das celulas e da indicacao de categoria arquivada. Todos os percentuais (inclusive `—` quando indisponiveis), valores, sinais, categorias, hierarquia expandivel, cabeçalhos e scroll local horizontal da matriz permanecem preservados. A largura maior da matriz e intencional; nao se deve truncar valores para economizar altura.
- **Prova de aceite:** no SHA atualizado da PR, o Chrome deve evidenciar ausencia de scrollbar no grafico de evolucao em 1366x768, 390x844 e 320x740, linhas consolidadas com altura controlada, agrupamento efetivo dos destaques, sem overflow global, e preservacao do scroll da matriz e do grafico de caixa. Os testes existentes da #718, e nao uma nova suite redundante, sao os donos dessas verificacoes.

## Seletor de moeda e densidade de numeros (22/10/2026, PR #729)

Na **Evolucao por categoria**, o seletor funcional **Moeda** faz parte da **mesma barra de filtros** e vem imediatamente depois de **Periodo**, antes da acao primaria **Atualizar relatorio**. Ha somente um formulario GET SSR e um botao de aplicacao para intervalo, conta/cartao, inicio, quantidade de periodos e moeda, sem exigir JavaScript. As opcoes incluem as moedas presentes no resultado, a selecao anterior (se fora do recorte) e **Todas as moedas**. A atualizacao preserva `view`, `interval`, `start`, `periods`, `profileId` e origem (`accountId` ou `cardId`) no mesmo envio. A faixa de resumo mostra a quantidade de periodos junto ao titulo `Leitura do período - BRL`, sem um cabeçalho isolado de moeda, outro formulario ou botao `Aplicar`. O filtro `currency=XXX` limita apenas a apresentacao de blocos monetarios ja retornados pela API, sem alterar calculos, converter valores ou misturar moedas. Sem parametro ou com `currency=all`, todos os blocos continuam visiveis; entrada de moeda invalida e rejeitada antes da chamada da API. Se a moeda escolhida nao possui movimentos, exibe estado vazio orientado e conserva o controle para alternar para Todas as moedas. A troca de intervalo conserva o filtro de moeda.

/`US# Relatorios do SolverFin

Este documento e a fonte funcional da area **Relatorios**. Os contratos tecnicos da evolucao ficam em [`API_REPORTS.md`](./API_REPORTS.md).

## Objetivo

A area transforma dados canonicos do perfil financeiro em consultas somente leitura, respeitando tenant, historico, moedas e ausencia de dupla contagem.

## Visoes disponiveis

A rota `/relatorios` possui tres visoes:

- **Evolucao por categoria** (`view=category-evolution`), opcao inicial;
- **Parcelas consolidadas** (`view=installments`), preservada com seus filtros atuais;
- **Projecao de caixa** (`view=cash-flow`), com serie diaria canonica de 30, 60 ou 90 dias por moeda.

Links e formularios gerados pela aplicacao informam `view` explicitamente e preservam `profileId`. Links antigos sem `view` continuam abrindo parcelas quando possuem somente `month`, `status`, `cardId` ou `categoryId`. Filtros `interval`, `start`, `periods` ou `accountId` selecionam evolucao. Como `cardId` tambem pertence ao contrato legado de parcelas, o filtro por cartao da evolucao sempre e emitido com `view=category-evolution`. Misturar as duas familias sem `view` produz erro orientado ao usuario.

## Arquetipo de analise

Desde a issue #611, as visoes prontas de `/relatorios` seguem o arquetipo A5 de analise sem alterar os contratos financeiros das fontes. Cada bloco monetario apresenta, nesta ordem:

1. **Resumo** com os indicadores que ajudam a interpretar o recorte;
2. **Visualizacao** do comportamento ou distribuicao relevante;
3. **Destaques** e excecoes que merecem revisao;
4. **Detalhe** com a matriz ou tabela completa.

A moeda e boundary da composicao. Quando um recorte possui mais de uma moeda, cada codigo recebe um bloco independente antes de qualquer soma ou agrupamento. Nao existe conversao cambial implicita nem total unico entre moedas distintas.

Os filtros permanecem na URL e continuam determinando o mesmo recorte usado por resumo, visualizacao, destaques e detalhe. A composicao e SSR, reutiliza primitivas do design system e `Money`, mantem foco visivel e usa overflow controlado para tabelas largas em viewport reduzido.

## Refinamento de densidade e controles — PR #729 (22/10/2026)

A refatoracao de `/relatorios` reaproveita diretamente `renderButton` para atualizar as tres visoes, com tamanho, contraste e foco visivel da fundacao compartilhada. Os links equivalentes do seletor de intervalo recebem aparencia **neutra** (fundo claro, borda fina, texto petroleo); o intervalo ativo tem realce sutil sem se transformar em botao de confirmacao. O estado hover/focus deve ser verificado tambem contra a cascata do shell.

O cabecalho preserva o titulo unico e a indicacao discreta de somente leitura. A barra de filtros usa superficie clara, contornos finos, alturas coerentes e alinhamento compacto; em ate 760px os filtros sao reorganizados em duas colunas, com intervalo e origem em largura integral, e em ate 360px todos passam para uma coluna para evitar corte do seletor de mes. Os filtros e seus parametros GET permanecem disponiveis sem JavaScript; nenhuma selecao, permissao ou comportamento financeiro foi alterado.

Indicadores monetarios por moeda mantem a ordem **resumo → visualizacao → destaques → detalhe**, cards apenas para metricas de decisao e sem fundo primario escuro em todo o card. Receitas e despesas usam as cores semanticas do design system como reforco, mantendo sinal, texto e `Money`. A tendencia passou a usar colunas mais densas com rolagem horizontal local (teclado e touch); matrizes e tabelas preservam cabecalhos semanticos, primeira coluna fixa quando aplicavel e alinhamento numerico tabular. Nenhum total mistura moedas.

O aceite exige, **no HEAD exato da PR**, comparar capturas com a Golden Screen em 1366x768, 390x844 e 320x740: repouso/hover/foco dos controles, abas, filtros, indicadores, tendencia, BRL/USD, conteudo longo, estados vazio/erro, scroll local sem overflow global e legibilidade do detalhamento. Os cenarios Chrome existentes da #718 devem ser reutilizados; CI verde nao substitui a auditoria visual independente.

## Compactacao de grafico, destaques e matriz (22/10/2026, PR #729)

- **Resultado ao longo do tempo (evolucao por categoria):** exibe todos os pontos em grid responsivo que quebra linhas, sem barra horizontal mesmo no desktop, preservando rotulo, valor completo por `Money`, sinal e barra relativa. Em telas menores, reorganiza a quantidade de colunas conforme a largura. Somente este grafico usa `renderResultTrend(..., "Resultado por período", "grid")`; a projecao de caixa conserva o comportamento de rolagem local validado para seus pontos diarios.
- **Pontos para revisar:** melhor periodo, pior periodo e alerta passam a ocupar uma unica faixa compacta no desktop, sem bloco adicional de alerta abaixo. No mobile, os dois destaques dividem a primeira linha e o aviso fica abaixo, preservando leitura, semantica de `renderAlert` e contexto da moeda. Parcelas consolidadas reutilizam a mesma disposicao compacta.
- **Matriz por categoria:** o percentual fica **na mesma linha** do valor monetario, com fonte secundaria e separacao discreta; reduz-se o espacamento vertical das celulas e da indicacao de categoria arquivada. Todos os percentuais (inclusive `—` quando indisponiveis), valores, sinais, categorias, hierarquia expandivel, cabeçalhos e scroll local horizontal da matriz permanecem preservados. A largura maior da matriz e intencional; nao se deve truncar valores para economizar altura.
- **Prova de aceite:** no SHA atualizado da PR, o Chrome deve evidenciar ausencia de scrollbar no grafico de evolucao em 1366x768, 390x844 e 320x740, linhas consolidadas com altura controlada, agrupamento efetivo dos destaques, sem overflow global, e preservacao do scroll da matriz e do grafico de caixa. Os testes existentes da #718, e nao uma nova suite redundante, sao os donos dessas verificacoes.

## Seletor de moeda e densidade de numeros (22/10/2026, PR #729)

Na **Evolucao por categoria**, o seletor funcional **Moeda** faz parte da **mesma barra de filtros** e vem imediatamente depois de **Periodo**, antes da acao primaria **Atualizar relatorio**. Ha somente um formulario GET SSR e um botao de aplicacao para intervalo, conta/cartao, inicio, quantidade de periodos e moeda, sem exigir JavaScript. As opcoes incluem as moedas presentes no resultado, a selecao anterior (se fora do recorte) e **Todas as moedas**. A atualizacao preserva `view`, `interval`, `start`, `periods`, `profileId` e origem (`accountId` ou `cardId`) no mesmo envio. A faixa de resumo mostra a quantidade de periodos junto ao titulo `Leitura do período - BRL`, sem um cabeçalho isolado de moeda, outro formulario ou botao `Aplicar`. O filtro `currency=XXX` limita apenas a apresentacao de blocos monetarios ja retornados pela API, sem alterar calculos, converter valores ou misturar moedas. Sem parametro ou com `currency=all`, todos os blocos continuam visiveis; entrada de moeda invalida e rejeitada antes da chamada da API. Se a moeda escolhida nao possui movimentos, exibe estado vazio orientado e conserva o controle para alternar para Todas as moedas. A troca de intervalo conserva o filtro de moeda.

), `data-currency`, o sinal, o valor e a identificacao da moeda nos titulos/captions acessiveis. A fonte numerica da matriz e a fonte das descricoes tornam-se mais compactas; nomes de categorias permanecem completos em uma unica linha, com rolagem horizontal local da matriz, sem truncamento. O grafico **Resultado ao longo do tempo** usa fonte monetaria menor, preservando todos os valores e o grid sem scroll horizontal.

**Aceite:** confirmar no Chrome (1366x768, 390x844, 320x740) **um unico formulario**, moeda depois de periodo na ordem visual/DOM, botao Atualizar relatorio aplicado a todos os campos, selecao BRL, USD e Todas, o titulo da matriz, valores sem codigo redundante, texto sem sobreposicao, conteudo longo, navegacao e foco por teclado, URL/filtros preservados, estado vazio e moeda invalida. Testes SSR existentes cobrem o recorte sem somas combinadas; auditoria visual independente continua necessaria.

## Desduplicacao integral da moeda nos relatorios (22/10/2026, PR #729)

O marcador de moeda **nao fica solto** entre os filtros e a leitura financeira. Em toda composicao A5 de Evolucao por categoria e Parcelas consolidadas, o titulo de cada secao possui o sufixo `- BRL` ou `- USD`, incluindo resumo, visualizacao, destaques e detalhe. O numero de periodos foi movido para a mesma faixa do titulo do resumo, evitando uma linha de cabecalho exclusiva. Na Projecao de caixa, o titulo de resumo e as camadas de grafico e tabela tambem indicam a moeda, preservando as datas, horizonte e referencia com menor altura de composicao. Textos de apoio que apenas repetiam o codigo monetario foram abreviados.

A regra `.currency-report-list .sf-money .sf-money-currency,.cash-flow-report-list .sf-money .sf-money-currency` oculta **somente a sigla suplementar** ao lado dos valores monetarios destes relatorios. As primitivas `renderMoney` nao foram alteradas, de forma que `R# Relatorios do SolverFin

Este documento e a fonte funcional da area **Relatorios**. Os contratos tecnicos da evolucao ficam em [`API_REPORTS.md`](./API_REPORTS.md).

## Objetivo

A area transforma dados canonicos do perfil financeiro em consultas somente leitura, respeitando tenant, historico, moedas e ausencia de dupla contagem.

## Visoes disponiveis

A rota `/relatorios` possui tres visoes:

- **Evolucao por categoria** (`view=category-evolution`), opcao inicial;
- **Parcelas consolidadas** (`view=installments`), preservada com seus filtros atuais;
- **Projecao de caixa** (`view=cash-flow`), com serie diaria canonica de 30, 60 ou 90 dias por moeda.

Links e formularios gerados pela aplicacao informam `view` explicitamente e preservam `profileId`. Links antigos sem `view` continuam abrindo parcelas quando possuem somente `month`, `status`, `cardId` ou `categoryId`. Filtros `interval`, `start`, `periods` ou `accountId` selecionam evolucao. Como `cardId` tambem pertence ao contrato legado de parcelas, o filtro por cartao da evolucao sempre e emitido com `view=category-evolution`. Misturar as duas familias sem `view` produz erro orientado ao usuario.

## Arquetipo de analise

Desde a issue #611, as visoes prontas de `/relatorios` seguem o arquetipo A5 de analise sem alterar os contratos financeiros das fontes. Cada bloco monetario apresenta, nesta ordem:

1. **Resumo** com os indicadores que ajudam a interpretar o recorte;
2. **Visualizacao** do comportamento ou distribuicao relevante;
3. **Destaques** e excecoes que merecem revisao;
4. **Detalhe** com a matriz ou tabela completa.

A moeda e boundary da composicao. Quando um recorte possui mais de uma moeda, cada codigo recebe um bloco independente antes de qualquer soma ou agrupamento. Nao existe conversao cambial implicita nem total unico entre moedas distintas.

Os filtros permanecem na URL e continuam determinando o mesmo recorte usado por resumo, visualizacao, destaques e detalhe. A composicao e SSR, reutiliza primitivas do design system e `Money`, mantem foco visivel e usa overflow controlado para tabelas largas em viewport reduzido.

## Refinamento de densidade e controles — PR #729 (22/10/2026)

A refatoracao de `/relatorios` reaproveita diretamente `renderButton` para atualizar as tres visoes, com tamanho, contraste e foco visivel da fundacao compartilhada. Os links equivalentes do seletor de intervalo recebem aparencia **neutra** (fundo claro, borda fina, texto petroleo); o intervalo ativo tem realce sutil sem se transformar em botao de confirmacao. O estado hover/focus deve ser verificado tambem contra a cascata do shell.

O cabecalho preserva o titulo unico e a indicacao discreta de somente leitura. A barra de filtros usa superficie clara, contornos finos, alturas coerentes e alinhamento compacto; em ate 760px os filtros sao reorganizados em duas colunas, com intervalo e origem em largura integral, e em ate 360px todos passam para uma coluna para evitar corte do seletor de mes. Os filtros e seus parametros GET permanecem disponiveis sem JavaScript; nenhuma selecao, permissao ou comportamento financeiro foi alterado.

Indicadores monetarios por moeda mantem a ordem **resumo → visualizacao → destaques → detalhe**, cards apenas para metricas de decisao e sem fundo primario escuro em todo o card. Receitas e despesas usam as cores semanticas do design system como reforco, mantendo sinal, texto e `Money`. A tendencia passou a usar colunas mais densas com rolagem horizontal local (teclado e touch); matrizes e tabelas preservam cabecalhos semanticos, primeira coluna fixa quando aplicavel e alinhamento numerico tabular. Nenhum total mistura moedas.

O aceite exige, **no HEAD exato da PR**, comparar capturas com a Golden Screen em 1366x768, 390x844 e 320x740: repouso/hover/foco dos controles, abas, filtros, indicadores, tendencia, BRL/USD, conteudo longo, estados vazio/erro, scroll local sem overflow global e legibilidade do detalhamento. Os cenarios Chrome existentes da #718 devem ser reutilizados; CI verde nao substitui a auditoria visual independente.

## Compactacao de grafico, destaques e matriz (22/10/2026, PR #729)

- **Resultado ao longo do tempo (evolucao por categoria):** exibe todos os pontos em grid responsivo que quebra linhas, sem barra horizontal mesmo no desktop, preservando rotulo, valor completo por `Money`, sinal e barra relativa. Em telas menores, reorganiza a quantidade de colunas conforme a largura. Somente este grafico usa `renderResultTrend(..., "Resultado por período", "grid")`; a projecao de caixa conserva o comportamento de rolagem local validado para seus pontos diarios.
- **Pontos para revisar:** melhor periodo, pior periodo e alerta passam a ocupar uma unica faixa compacta no desktop, sem bloco adicional de alerta abaixo. No mobile, os dois destaques dividem a primeira linha e o aviso fica abaixo, preservando leitura, semantica de `renderAlert` e contexto da moeda. Parcelas consolidadas reutilizam a mesma disposicao compacta.
- **Matriz por categoria:** o percentual fica **na mesma linha** do valor monetario, com fonte secundaria e separacao discreta; reduz-se o espacamento vertical das celulas e da indicacao de categoria arquivada. Todos os percentuais (inclusive `—` quando indisponiveis), valores, sinais, categorias, hierarquia expandivel, cabeçalhos e scroll local horizontal da matriz permanecem preservados. A largura maior da matriz e intencional; nao se deve truncar valores para economizar altura.
- **Prova de aceite:** no SHA atualizado da PR, o Chrome deve evidenciar ausencia de scrollbar no grafico de evolucao em 1366x768, 390x844 e 320x740, linhas consolidadas com altura controlada, agrupamento efetivo dos destaques, sem overflow global, e preservacao do scroll da matriz e do grafico de caixa. Os testes existentes da #718, e nao uma nova suite redundante, sao os donos dessas verificacoes.

## Seletor de moeda e densidade de numeros (22/10/2026, PR #729)

Na **Evolucao por categoria**, o seletor funcional **Moeda** faz parte da **mesma barra de filtros** e vem imediatamente depois de **Periodo**, antes da acao primaria **Atualizar relatorio**. Ha somente um formulario GET SSR e um botao de aplicacao para intervalo, conta/cartao, inicio, quantidade de periodos e moeda, sem exigir JavaScript. As opcoes incluem as moedas presentes no resultado, a selecao anterior (se fora do recorte) e **Todas as moedas**. A atualizacao preserva `view`, `interval`, `start`, `periods`, `profileId` e origem (`accountId` ou `cardId`) no mesmo envio. A faixa de resumo mostra a quantidade de periodos junto ao titulo `Leitura do período - BRL`, sem um cabeçalho isolado de moeda, outro formulario ou botao `Aplicar`. O filtro `currency=XXX` limita apenas a apresentacao de blocos monetarios ja retornados pela API, sem alterar calculos, converter valores ou misturar moedas. Sem parametro ou com `currency=all`, todos os blocos continuam visiveis; entrada de moeda invalida e rejeitada antes da chamada da API. Se a moeda escolhida nao possui movimentos, exibe estado vazio orientado e conserva o controle para alternar para Todas as moedas. A troca de intervalo conserva o filtro de moeda.

Os titulos de resumo, visualizacao, destaques e detalhe identificam cada moeda explicitamente, como **Leitura do período - BRL**, **Resultado ao longo do tempo - BRL**, **Pontos para revisar - BRL** e **Matriz por categoria - BRL**. Nao existe mais o `BRL` isolado entre filtros e resumo. O sufixo redundante de codigo de moeda fica oculto **em todos os valores do bloco**, incluindo cards, grafico, destaques e matriz, mantendo `Money`, o simbolo local (`R# Relatorios do SolverFin

Este documento e a fonte funcional da area **Relatorios**. Os contratos tecnicos da evolucao ficam em [`API_REPORTS.md`](./API_REPORTS.md).

## Objetivo

A area transforma dados canonicos do perfil financeiro em consultas somente leitura, respeitando tenant, historico, moedas e ausencia de dupla contagem.

## Visoes disponiveis

A rota `/relatorios` possui tres visoes:

- **Evolucao por categoria** (`view=category-evolution`), opcao inicial;
- **Parcelas consolidadas** (`view=installments`), preservada com seus filtros atuais;
- **Projecao de caixa** (`view=cash-flow`), com serie diaria canonica de 30, 60 ou 90 dias por moeda.

Links e formularios gerados pela aplicacao informam `view` explicitamente e preservam `profileId`. Links antigos sem `view` continuam abrindo parcelas quando possuem somente `month`, `status`, `cardId` ou `categoryId`. Filtros `interval`, `start`, `periods` ou `accountId` selecionam evolucao. Como `cardId` tambem pertence ao contrato legado de parcelas, o filtro por cartao da evolucao sempre e emitido com `view=category-evolution`. Misturar as duas familias sem `view` produz erro orientado ao usuario.

## Arquetipo de analise

Desde a issue #611, as visoes prontas de `/relatorios` seguem o arquetipo A5 de analise sem alterar os contratos financeiros das fontes. Cada bloco monetario apresenta, nesta ordem:

1. **Resumo** com os indicadores que ajudam a interpretar o recorte;
2. **Visualizacao** do comportamento ou distribuicao relevante;
3. **Destaques** e excecoes que merecem revisao;
4. **Detalhe** com a matriz ou tabela completa.

A moeda e boundary da composicao. Quando um recorte possui mais de uma moeda, cada codigo recebe um bloco independente antes de qualquer soma ou agrupamento. Nao existe conversao cambial implicita nem total unico entre moedas distintas.

Os filtros permanecem na URL e continuam determinando o mesmo recorte usado por resumo, visualizacao, destaques e detalhe. A composicao e SSR, reutiliza primitivas do design system e `Money`, mantem foco visivel e usa overflow controlado para tabelas largas em viewport reduzido.

## Refinamento de densidade e controles — PR #729 (22/10/2026)

A refatoracao de `/relatorios` reaproveita diretamente `renderButton` para atualizar as tres visoes, com tamanho, contraste e foco visivel da fundacao compartilhada. Os links equivalentes do seletor de intervalo recebem aparencia **neutra** (fundo claro, borda fina, texto petroleo); o intervalo ativo tem realce sutil sem se transformar em botao de confirmacao. O estado hover/focus deve ser verificado tambem contra a cascata do shell.

O cabecalho preserva o titulo unico e a indicacao discreta de somente leitura. A barra de filtros usa superficie clara, contornos finos, alturas coerentes e alinhamento compacto; em ate 760px os filtros sao reorganizados em duas colunas, com intervalo e origem em largura integral, e em ate 360px todos passam para uma coluna para evitar corte do seletor de mes. Os filtros e seus parametros GET permanecem disponiveis sem JavaScript; nenhuma selecao, permissao ou comportamento financeiro foi alterado.

Indicadores monetarios por moeda mantem a ordem **resumo → visualizacao → destaques → detalhe**, cards apenas para metricas de decisao e sem fundo primario escuro em todo o card. Receitas e despesas usam as cores semanticas do design system como reforco, mantendo sinal, texto e `Money`. A tendencia passou a usar colunas mais densas com rolagem horizontal local (teclado e touch); matrizes e tabelas preservam cabecalhos semanticos, primeira coluna fixa quando aplicavel e alinhamento numerico tabular. Nenhum total mistura moedas.

O aceite exige, **no HEAD exato da PR**, comparar capturas com a Golden Screen em 1366x768, 390x844 e 320x740: repouso/hover/foco dos controles, abas, filtros, indicadores, tendencia, BRL/USD, conteudo longo, estados vazio/erro, scroll local sem overflow global e legibilidade do detalhamento. Os cenarios Chrome existentes da #718 devem ser reutilizados; CI verde nao substitui a auditoria visual independente.

## Compactacao de grafico, destaques e matriz (22/10/2026, PR #729)

- **Resultado ao longo do tempo (evolucao por categoria):** exibe todos os pontos em grid responsivo que quebra linhas, sem barra horizontal mesmo no desktop, preservando rotulo, valor completo por `Money`, sinal e barra relativa. Em telas menores, reorganiza a quantidade de colunas conforme a largura. Somente este grafico usa `renderResultTrend(..., "Resultado por período", "grid")`; a projecao de caixa conserva o comportamento de rolagem local validado para seus pontos diarios.
- **Pontos para revisar:** melhor periodo, pior periodo e alerta passam a ocupar uma unica faixa compacta no desktop, sem bloco adicional de alerta abaixo. No mobile, os dois destaques dividem a primeira linha e o aviso fica abaixo, preservando leitura, semantica de `renderAlert` e contexto da moeda. Parcelas consolidadas reutilizam a mesma disposicao compacta.
- **Matriz por categoria:** o percentual fica **na mesma linha** do valor monetario, com fonte secundaria e separacao discreta; reduz-se o espacamento vertical das celulas e da indicacao de categoria arquivada. Todos os percentuais (inclusive `—` quando indisponiveis), valores, sinais, categorias, hierarquia expandivel, cabeçalhos e scroll local horizontal da matriz permanecem preservados. A largura maior da matriz e intencional; nao se deve truncar valores para economizar altura.
- **Prova de aceite:** no SHA atualizado da PR, o Chrome deve evidenciar ausencia de scrollbar no grafico de evolucao em 1366x768, 390x844 e 320x740, linhas consolidadas com altura controlada, agrupamento efetivo dos destaques, sem overflow global, e preservacao do scroll da matriz e do grafico de caixa. Os testes existentes da #718, e nao uma nova suite redundante, sao os donos dessas verificacoes.

## Seletor de moeda e densidade de numeros (22/10/2026, PR #729)

Na **Evolucao por categoria**, o seletor funcional **Moeda** faz parte da **mesma barra de filtros** e vem imediatamente depois de **Periodo**, antes da acao primaria **Atualizar relatorio**. Ha somente um formulario GET SSR e um botao de aplicacao para intervalo, conta/cartao, inicio, quantidade de periodos e moeda, sem exigir JavaScript. As opcoes incluem as moedas presentes no resultado, a selecao anterior (se fora do recorte) e **Todas as moedas**. A atualizacao preserva `view`, `interval`, `start`, `periods`, `profileId` e origem (`accountId` ou `cardId`) no mesmo envio. A faixa de resumo mostra a quantidade de periodos junto ao titulo `Leitura do período - BRL`, sem um cabeçalho isolado de moeda, outro formulario ou botao `Aplicar`. O filtro `currency=XXX` limita apenas a apresentacao de blocos monetarios ja retornados pela API, sem alterar calculos, converter valores ou misturar moedas. Sem parametro ou com `currency=all`, todos os blocos continuam visiveis; entrada de moeda invalida e rejeitada antes da chamada da API. Se a moeda escolhida nao possui movimentos, exibe estado vazio orientado e conserva o controle para alternar para Todas as moedas. A troca de intervalo conserva o filtro de moeda.

/`US# Relatorios do SolverFin

Este documento e a fonte funcional da area **Relatorios**. Os contratos tecnicos da evolucao ficam em [`API_REPORTS.md`](./API_REPORTS.md).

## Objetivo

A area transforma dados canonicos do perfil financeiro em consultas somente leitura, respeitando tenant, historico, moedas e ausencia de dupla contagem.

## Visoes disponiveis

A rota `/relatorios` possui tres visoes:

- **Evolucao por categoria** (`view=category-evolution`), opcao inicial;
- **Parcelas consolidadas** (`view=installments`), preservada com seus filtros atuais;
- **Projecao de caixa** (`view=cash-flow`), com serie diaria canonica de 30, 60 ou 90 dias por moeda.

Links e formularios gerados pela aplicacao informam `view` explicitamente e preservam `profileId`. Links antigos sem `view` continuam abrindo parcelas quando possuem somente `month`, `status`, `cardId` ou `categoryId`. Filtros `interval`, `start`, `periods` ou `accountId` selecionam evolucao. Como `cardId` tambem pertence ao contrato legado de parcelas, o filtro por cartao da evolucao sempre e emitido com `view=category-evolution`. Misturar as duas familias sem `view` produz erro orientado ao usuario.

## Arquetipo de analise

Desde a issue #611, as visoes prontas de `/relatorios` seguem o arquetipo A5 de analise sem alterar os contratos financeiros das fontes. Cada bloco monetario apresenta, nesta ordem:

1. **Resumo** com os indicadores que ajudam a interpretar o recorte;
2. **Visualizacao** do comportamento ou distribuicao relevante;
3. **Destaques** e excecoes que merecem revisao;
4. **Detalhe** com a matriz ou tabela completa.

A moeda e boundary da composicao. Quando um recorte possui mais de uma moeda, cada codigo recebe um bloco independente antes de qualquer soma ou agrupamento. Nao existe conversao cambial implicita nem total unico entre moedas distintas.

Os filtros permanecem na URL e continuam determinando o mesmo recorte usado por resumo, visualizacao, destaques e detalhe. A composicao e SSR, reutiliza primitivas do design system e `Money`, mantem foco visivel e usa overflow controlado para tabelas largas em viewport reduzido.

## Refinamento de densidade e controles — PR #729 (22/10/2026)

A refatoracao de `/relatorios` reaproveita diretamente `renderButton` para atualizar as tres visoes, com tamanho, contraste e foco visivel da fundacao compartilhada. Os links equivalentes do seletor de intervalo recebem aparencia **neutra** (fundo claro, borda fina, texto petroleo); o intervalo ativo tem realce sutil sem se transformar em botao de confirmacao. O estado hover/focus deve ser verificado tambem contra a cascata do shell.

O cabecalho preserva o titulo unico e a indicacao discreta de somente leitura. A barra de filtros usa superficie clara, contornos finos, alturas coerentes e alinhamento compacto; em ate 760px os filtros sao reorganizados em duas colunas, com intervalo e origem em largura integral, e em ate 360px todos passam para uma coluna para evitar corte do seletor de mes. Os filtros e seus parametros GET permanecem disponiveis sem JavaScript; nenhuma selecao, permissao ou comportamento financeiro foi alterado.

Indicadores monetarios por moeda mantem a ordem **resumo → visualizacao → destaques → detalhe**, cards apenas para metricas de decisao e sem fundo primario escuro em todo o card. Receitas e despesas usam as cores semanticas do design system como reforco, mantendo sinal, texto e `Money`. A tendencia passou a usar colunas mais densas com rolagem horizontal local (teclado e touch); matrizes e tabelas preservam cabecalhos semanticos, primeira coluna fixa quando aplicavel e alinhamento numerico tabular. Nenhum total mistura moedas.

O aceite exige, **no HEAD exato da PR**, comparar capturas com a Golden Screen em 1366x768, 390x844 e 320x740: repouso/hover/foco dos controles, abas, filtros, indicadores, tendencia, BRL/USD, conteudo longo, estados vazio/erro, scroll local sem overflow global e legibilidade do detalhamento. Os cenarios Chrome existentes da #718 devem ser reutilizados; CI verde nao substitui a auditoria visual independente.

## Compactacao de grafico, destaques e matriz (22/10/2026, PR #729)

- **Resultado ao longo do tempo (evolucao por categoria):** exibe todos os pontos em grid responsivo que quebra linhas, sem barra horizontal mesmo no desktop, preservando rotulo, valor completo por `Money`, sinal e barra relativa. Em telas menores, reorganiza a quantidade de colunas conforme a largura. Somente este grafico usa `renderResultTrend(..., "Resultado por período", "grid")`; a projecao de caixa conserva o comportamento de rolagem local validado para seus pontos diarios.
- **Pontos para revisar:** melhor periodo, pior periodo e alerta passam a ocupar uma unica faixa compacta no desktop, sem bloco adicional de alerta abaixo. No mobile, os dois destaques dividem a primeira linha e o aviso fica abaixo, preservando leitura, semantica de `renderAlert` e contexto da moeda. Parcelas consolidadas reutilizam a mesma disposicao compacta.
- **Matriz por categoria:** o percentual fica **na mesma linha** do valor monetario, com fonte secundaria e separacao discreta; reduz-se o espacamento vertical das celulas e da indicacao de categoria arquivada. Todos os percentuais (inclusive `—` quando indisponiveis), valores, sinais, categorias, hierarquia expandivel, cabeçalhos e scroll local horizontal da matriz permanecem preservados. A largura maior da matriz e intencional; nao se deve truncar valores para economizar altura.
- **Prova de aceite:** no SHA atualizado da PR, o Chrome deve evidenciar ausencia de scrollbar no grafico de evolucao em 1366x768, 390x844 e 320x740, linhas consolidadas com altura controlada, agrupamento efetivo dos destaques, sem overflow global, e preservacao do scroll da matriz e do grafico de caixa. Os testes existentes da #718, e nao uma nova suite redundante, sao os donos dessas verificacoes.

## Seletor de moeda e densidade de numeros (22/10/2026, PR #729)

Na **Evolucao por categoria**, o seletor funcional **Moeda** faz parte da **mesma barra de filtros** e vem imediatamente depois de **Periodo**, antes da acao primaria **Atualizar relatorio**. Ha somente um formulario GET SSR e um botao de aplicacao para intervalo, conta/cartao, inicio, quantidade de periodos e moeda, sem exigir JavaScript. As opcoes incluem as moedas presentes no resultado, a selecao anterior (se fora do recorte) e **Todas as moedas**. A atualizacao preserva `view`, `interval`, `start`, `periods`, `profileId` e origem (`accountId` ou `cardId`) no mesmo envio. A faixa de resumo mostra a quantidade de periodos junto ao titulo `Leitura do período - BRL`, sem um cabeçalho isolado de moeda, outro formulario ou botao `Aplicar`. O filtro `currency=XXX` limita apenas a apresentacao de blocos monetarios ja retornados pela API, sem alterar calculos, converter valores ou misturar moedas. Sem parametro ou com `currency=all`, todos os blocos continuam visiveis; entrada de moeda invalida e rejeitada antes da chamada da API. Se a moeda escolhida nao possui movimentos, exibe estado vazio orientado e conserva o controle para alternar para Todas as moedas. A troca de intervalo conserva o filtro de moeda.

), `data-currency`, o sinal, o valor e a identificacao da moeda nos titulos/captions acessiveis. A fonte numerica da matriz e a fonte das descricoes tornam-se mais compactas; nomes de categorias permanecem completos em uma unica linha, com rolagem horizontal local da matriz, sem truncamento. O grafico **Resultado ao longo do tempo** usa fonte monetaria menor, preservando todos os valores e o grid sem scroll horizontal.

**Aceite:** confirmar no Chrome (1366x768, 390x844, 320x740) **um unico formulario**, moeda depois de periodo na ordem visual/DOM, botao Atualizar relatorio aplicado a todos os campos, selecao BRL, USD e Todas, o titulo da matriz, valores sem codigo redundante, texto sem sobreposicao, conteudo longo, navegacao e foco por teclado, URL/filtros preservados, estado vazio e moeda invalida. Testes SSR existentes cobrem o recorte sem somas combinadas; auditoria visual independente continua necessaria.

/`US# Relatorios do SolverFin

Este documento e a fonte funcional da area **Relatorios**. Os contratos tecnicos da evolucao ficam em [`API_REPORTS.md`](./API_REPORTS.md).

## Objetivo

A area transforma dados canonicos do perfil financeiro em consultas somente leitura, respeitando tenant, historico, moedas e ausencia de dupla contagem.

## Visoes disponiveis

A rota `/relatorios` possui tres visoes:

- **Evolucao por categoria** (`view=category-evolution`), opcao inicial;
- **Parcelas consolidadas** (`view=installments`), preservada com seus filtros atuais;
- **Projecao de caixa** (`view=cash-flow`), com serie diaria canonica de 30, 60 ou 90 dias por moeda.

Links e formularios gerados pela aplicacao informam `view` explicitamente e preservam `profileId`. Links antigos sem `view` continuam abrindo parcelas quando possuem somente `month`, `status`, `cardId` ou `categoryId`. Filtros `interval`, `start`, `periods` ou `accountId` selecionam evolucao. Como `cardId` tambem pertence ao contrato legado de parcelas, o filtro por cartao da evolucao sempre e emitido com `view=category-evolution`. Misturar as duas familias sem `view` produz erro orientado ao usuario.

## Arquetipo de analise

Desde a issue #611, as visoes prontas de `/relatorios` seguem o arquetipo A5 de analise sem alterar os contratos financeiros das fontes. Cada bloco monetario apresenta, nesta ordem:

1. **Resumo** com os indicadores que ajudam a interpretar o recorte;
2. **Visualizacao** do comportamento ou distribuicao relevante;
3. **Destaques** e excecoes que merecem revisao;
4. **Detalhe** com a matriz ou tabela completa.

A moeda e boundary da composicao. Quando um recorte possui mais de uma moeda, cada codigo recebe um bloco independente antes de qualquer soma ou agrupamento. Nao existe conversao cambial implicita nem total unico entre moedas distintas.

Os filtros permanecem na URL e continuam determinando o mesmo recorte usado por resumo, visualizacao, destaques e detalhe. A composicao e SSR, reutiliza primitivas do design system e `Money`, mantem foco visivel e usa overflow controlado para tabelas largas em viewport reduzido.

## Refinamento de densidade e controles — PR #729 (22/10/2026)

A refatoracao de `/relatorios` reaproveita diretamente `renderButton` para atualizar as tres visoes, com tamanho, contraste e foco visivel da fundacao compartilhada. Os links equivalentes do seletor de intervalo recebem aparencia **neutra** (fundo claro, borda fina, texto petroleo); o intervalo ativo tem realce sutil sem se transformar em botao de confirmacao. O estado hover/focus deve ser verificado tambem contra a cascata do shell.

O cabecalho preserva o titulo unico e a indicacao discreta de somente leitura. A barra de filtros usa superficie clara, contornos finos, alturas coerentes e alinhamento compacto; em ate 760px os filtros sao reorganizados em duas colunas, com intervalo e origem em largura integral, e em ate 360px todos passam para uma coluna para evitar corte do seletor de mes. Os filtros e seus parametros GET permanecem disponiveis sem JavaScript; nenhuma selecao, permissao ou comportamento financeiro foi alterado.

Indicadores monetarios por moeda mantem a ordem **resumo → visualizacao → destaques → detalhe**, cards apenas para metricas de decisao e sem fundo primario escuro em todo o card. Receitas e despesas usam as cores semanticas do design system como reforco, mantendo sinal, texto e `Money`. A tendencia passou a usar colunas mais densas com rolagem horizontal local (teclado e touch); matrizes e tabelas preservam cabecalhos semanticos, primeira coluna fixa quando aplicavel e alinhamento numerico tabular. Nenhum total mistura moedas.

O aceite exige, **no HEAD exato da PR**, comparar capturas com a Golden Screen em 1366x768, 390x844 e 320x740: repouso/hover/foco dos controles, abas, filtros, indicadores, tendencia, BRL/USD, conteudo longo, estados vazio/erro, scroll local sem overflow global e legibilidade do detalhamento. Os cenarios Chrome existentes da #718 devem ser reutilizados; CI verde nao substitui a auditoria visual independente.

## Compactacao de grafico, destaques e matriz (22/10/2026, PR #729)

- **Resultado ao longo do tempo (evolucao por categoria):** exibe todos os pontos em grid responsivo que quebra linhas, sem barra horizontal mesmo no desktop, preservando rotulo, valor completo por `Money`, sinal e barra relativa. Em telas menores, reorganiza a quantidade de colunas conforme a largura. Somente este grafico usa `renderResultTrend(..., "Resultado por período", "grid")`; a projecao de caixa conserva o comportamento de rolagem local validado para seus pontos diarios.
- **Pontos para revisar:** melhor periodo, pior periodo e alerta passam a ocupar uma unica faixa compacta no desktop, sem bloco adicional de alerta abaixo. No mobile, os dois destaques dividem a primeira linha e o aviso fica abaixo, preservando leitura, semantica de `renderAlert` e contexto da moeda. Parcelas consolidadas reutilizam a mesma disposicao compacta.
- **Matriz por categoria:** o percentual fica **na mesma linha** do valor monetario, com fonte secundaria e separacao discreta; reduz-se o espacamento vertical das celulas e da indicacao de categoria arquivada. Todos os percentuais (inclusive `—` quando indisponiveis), valores, sinais, categorias, hierarquia expandivel, cabeçalhos e scroll local horizontal da matriz permanecem preservados. A largura maior da matriz e intencional; nao se deve truncar valores para economizar altura.
- **Prova de aceite:** no SHA atualizado da PR, o Chrome deve evidenciar ausencia de scrollbar no grafico de evolucao em 1366x768, 390x844 e 320x740, linhas consolidadas com altura controlada, agrupamento efetivo dos destaques, sem overflow global, e preservacao do scroll da matriz e do grafico de caixa. Os testes existentes da #718, e nao uma nova suite redundante, sao os donos dessas verificacoes.

## Seletor de moeda e densidade de numeros (22/10/2026, PR #729)

Na **Evolucao por categoria**, o seletor funcional **Moeda** faz parte da **mesma barra de filtros** e vem imediatamente depois de **Periodo**, antes da acao primaria **Atualizar relatorio**. Ha somente um formulario GET SSR e um botao de aplicacao para intervalo, conta/cartao, inicio, quantidade de periodos e moeda, sem exigir JavaScript. As opcoes incluem as moedas presentes no resultado, a selecao anterior (se fora do recorte) e **Todas as moedas**. A atualizacao preserva `view`, `interval`, `start`, `periods`, `profileId` e origem (`accountId` ou `cardId`) no mesmo envio. A faixa de resumo mostra a quantidade de periodos junto ao titulo `Leitura do período - BRL`, sem um cabeçalho isolado de moeda, outro formulario ou botao `Aplicar`. O filtro `currency=XXX` limita apenas a apresentacao de blocos monetarios ja retornados pela API, sem alterar calculos, converter valores ou misturar moedas. Sem parametro ou com `currency=all`, todos os blocos continuam visiveis; entrada de moeda invalida e rejeitada antes da chamada da API. Se a moeda escolhida nao possui movimentos, exibe estado vazio orientado e conserva o controle para alternar para Todas as moedas. A troca de intervalo conserva o filtro de moeda.

Os titulos de resumo, visualizacao, destaques e detalhe identificam cada moeda explicitamente, como **Leitura do período - BRL**, **Resultado ao longo do tempo - BRL**, **Pontos para revisar - BRL** e **Matriz por categoria - BRL**. Nao existe mais o `BRL` isolado entre filtros e resumo. O sufixo redundante de codigo de moeda fica oculto **em todos os valores do bloco**, incluindo cards, grafico, destaques e matriz, mantendo `Money`, o simbolo local (`R# Relatorios do SolverFin

Este documento e a fonte funcional da area **Relatorios**. Os contratos tecnicos da evolucao ficam em [`API_REPORTS.md`](./API_REPORTS.md).

## Objetivo

A area transforma dados canonicos do perfil financeiro em consultas somente leitura, respeitando tenant, historico, moedas e ausencia de dupla contagem.

## Visoes disponiveis

A rota `/relatorios` possui tres visoes:

- **Evolucao por categoria** (`view=category-evolution`), opcao inicial;
- **Parcelas consolidadas** (`view=installments`), preservada com seus filtros atuais;
- **Projecao de caixa** (`view=cash-flow`), com serie diaria canonica de 30, 60 ou 90 dias por moeda.

Links e formularios gerados pela aplicacao informam `view` explicitamente e preservam `profileId`. Links antigos sem `view` continuam abrindo parcelas quando possuem somente `month`, `status`, `cardId` ou `categoryId`. Filtros `interval`, `start`, `periods` ou `accountId` selecionam evolucao. Como `cardId` tambem pertence ao contrato legado de parcelas, o filtro por cartao da evolucao sempre e emitido com `view=category-evolution`. Misturar as duas familias sem `view` produz erro orientado ao usuario.

## Arquetipo de analise

Desde a issue #611, as visoes prontas de `/relatorios` seguem o arquetipo A5 de analise sem alterar os contratos financeiros das fontes. Cada bloco monetario apresenta, nesta ordem:

1. **Resumo** com os indicadores que ajudam a interpretar o recorte;
2. **Visualizacao** do comportamento ou distribuicao relevante;
3. **Destaques** e excecoes que merecem revisao;
4. **Detalhe** com a matriz ou tabela completa.

A moeda e boundary da composicao. Quando um recorte possui mais de uma moeda, cada codigo recebe um bloco independente antes de qualquer soma ou agrupamento. Nao existe conversao cambial implicita nem total unico entre moedas distintas.

Os filtros permanecem na URL e continuam determinando o mesmo recorte usado por resumo, visualizacao, destaques e detalhe. A composicao e SSR, reutiliza primitivas do design system e `Money`, mantem foco visivel e usa overflow controlado para tabelas largas em viewport reduzido.

## Refinamento de densidade e controles — PR #729 (22/10/2026)

A refatoracao de `/relatorios` reaproveita diretamente `renderButton` para atualizar as tres visoes, com tamanho, contraste e foco visivel da fundacao compartilhada. Os links equivalentes do seletor de intervalo recebem aparencia **neutra** (fundo claro, borda fina, texto petroleo); o intervalo ativo tem realce sutil sem se transformar em botao de confirmacao. O estado hover/focus deve ser verificado tambem contra a cascata do shell.

O cabecalho preserva o titulo unico e a indicacao discreta de somente leitura. A barra de filtros usa superficie clara, contornos finos, alturas coerentes e alinhamento compacto; em ate 760px os filtros sao reorganizados em duas colunas, com intervalo e origem em largura integral, e em ate 360px todos passam para uma coluna para evitar corte do seletor de mes. Os filtros e seus parametros GET permanecem disponiveis sem JavaScript; nenhuma selecao, permissao ou comportamento financeiro foi alterado.

Indicadores monetarios por moeda mantem a ordem **resumo → visualizacao → destaques → detalhe**, cards apenas para metricas de decisao e sem fundo primario escuro em todo o card. Receitas e despesas usam as cores semanticas do design system como reforco, mantendo sinal, texto e `Money`. A tendencia passou a usar colunas mais densas com rolagem horizontal local (teclado e touch); matrizes e tabelas preservam cabecalhos semanticos, primeira coluna fixa quando aplicavel e alinhamento numerico tabular. Nenhum total mistura moedas.

O aceite exige, **no HEAD exato da PR**, comparar capturas com a Golden Screen em 1366x768, 390x844 e 320x740: repouso/hover/foco dos controles, abas, filtros, indicadores, tendencia, BRL/USD, conteudo longo, estados vazio/erro, scroll local sem overflow global e legibilidade do detalhamento. Os cenarios Chrome existentes da #718 devem ser reutilizados; CI verde nao substitui a auditoria visual independente.

## Compactacao de grafico, destaques e matriz (22/10/2026, PR #729)

- **Resultado ao longo do tempo (evolucao por categoria):** exibe todos os pontos em grid responsivo que quebra linhas, sem barra horizontal mesmo no desktop, preservando rotulo, valor completo por `Money`, sinal e barra relativa. Em telas menores, reorganiza a quantidade de colunas conforme a largura. Somente este grafico usa `renderResultTrend(..., "Resultado por período", "grid")`; a projecao de caixa conserva o comportamento de rolagem local validado para seus pontos diarios.
- **Pontos para revisar:** melhor periodo, pior periodo e alerta passam a ocupar uma unica faixa compacta no desktop, sem bloco adicional de alerta abaixo. No mobile, os dois destaques dividem a primeira linha e o aviso fica abaixo, preservando leitura, semantica de `renderAlert` e contexto da moeda. Parcelas consolidadas reutilizam a mesma disposicao compacta.
- **Matriz por categoria:** o percentual fica **na mesma linha** do valor monetario, com fonte secundaria e separacao discreta; reduz-se o espacamento vertical das celulas e da indicacao de categoria arquivada. Todos os percentuais (inclusive `—` quando indisponiveis), valores, sinais, categorias, hierarquia expandivel, cabeçalhos e scroll local horizontal da matriz permanecem preservados. A largura maior da matriz e intencional; nao se deve truncar valores para economizar altura.
- **Prova de aceite:** no SHA atualizado da PR, o Chrome deve evidenciar ausencia de scrollbar no grafico de evolucao em 1366x768, 390x844 e 320x740, linhas consolidadas com altura controlada, agrupamento efetivo dos destaques, sem overflow global, e preservacao do scroll da matriz e do grafico de caixa. Os testes existentes da #718, e nao uma nova suite redundante, sao os donos dessas verificacoes.

## Seletor de moeda e densidade de numeros (22/10/2026, PR #729)

Na **Evolucao por categoria**, o seletor funcional **Moeda** faz parte da **mesma barra de filtros** e vem imediatamente depois de **Periodo**, antes da acao primaria **Atualizar relatorio**. Ha somente um formulario GET SSR e um botao de aplicacao para intervalo, conta/cartao, inicio, quantidade de periodos e moeda, sem exigir JavaScript. As opcoes incluem as moedas presentes no resultado, a selecao anterior (se fora do recorte) e **Todas as moedas**. A atualizacao preserva `view`, `interval`, `start`, `periods`, `profileId` e origem (`accountId` ou `cardId`) no mesmo envio. A faixa de resumo mostra a quantidade de periodos junto ao titulo `Leitura do período - BRL`, sem um cabeçalho isolado de moeda, outro formulario ou botao `Aplicar`. O filtro `currency=XXX` limita apenas a apresentacao de blocos monetarios ja retornados pela API, sem alterar calculos, converter valores ou misturar moedas. Sem parametro ou com `currency=all`, todos os blocos continuam visiveis; entrada de moeda invalida e rejeitada antes da chamada da API. Se a moeda escolhida nao possui movimentos, exibe estado vazio orientado e conserva o controle para alternar para Todas as moedas. A troca de intervalo conserva o filtro de moeda.

/`US# Relatorios do SolverFin

Este documento e a fonte funcional da area **Relatorios**. Os contratos tecnicos da evolucao ficam em [`API_REPORTS.md`](./API_REPORTS.md).

## Objetivo

A area transforma dados canonicos do perfil financeiro em consultas somente leitura, respeitando tenant, historico, moedas e ausencia de dupla contagem.

## Visoes disponiveis

A rota `/relatorios` possui tres visoes:

- **Evolucao por categoria** (`view=category-evolution`), opcao inicial;
- **Parcelas consolidadas** (`view=installments`), preservada com seus filtros atuais;
- **Projecao de caixa** (`view=cash-flow`), com serie diaria canonica de 30, 60 ou 90 dias por moeda.

Links e formularios gerados pela aplicacao informam `view` explicitamente e preservam `profileId`. Links antigos sem `view` continuam abrindo parcelas quando possuem somente `month`, `status`, `cardId` ou `categoryId`. Filtros `interval`, `start`, `periods` ou `accountId` selecionam evolucao. Como `cardId` tambem pertence ao contrato legado de parcelas, o filtro por cartao da evolucao sempre e emitido com `view=category-evolution`. Misturar as duas familias sem `view` produz erro orientado ao usuario.

## Arquetipo de analise

Desde a issue #611, as visoes prontas de `/relatorios` seguem o arquetipo A5 de analise sem alterar os contratos financeiros das fontes. Cada bloco monetario apresenta, nesta ordem:

1. **Resumo** com os indicadores que ajudam a interpretar o recorte;
2. **Visualizacao** do comportamento ou distribuicao relevante;
3. **Destaques** e excecoes que merecem revisao;
4. **Detalhe** com a matriz ou tabela completa.

A moeda e boundary da composicao. Quando um recorte possui mais de uma moeda, cada codigo recebe um bloco independente antes de qualquer soma ou agrupamento. Nao existe conversao cambial implicita nem total unico entre moedas distintas.

Os filtros permanecem na URL e continuam determinando o mesmo recorte usado por resumo, visualizacao, destaques e detalhe. A composicao e SSR, reutiliza primitivas do design system e `Money`, mantem foco visivel e usa overflow controlado para tabelas largas em viewport reduzido.

## Refinamento de densidade e controles — PR #729 (22/10/2026)

A refatoracao de `/relatorios` reaproveita diretamente `renderButton` para atualizar as tres visoes, com tamanho, contraste e foco visivel da fundacao compartilhada. Os links equivalentes do seletor de intervalo recebem aparencia **neutra** (fundo claro, borda fina, texto petroleo); o intervalo ativo tem realce sutil sem se transformar em botao de confirmacao. O estado hover/focus deve ser verificado tambem contra a cascata do shell.

O cabecalho preserva o titulo unico e a indicacao discreta de somente leitura. A barra de filtros usa superficie clara, contornos finos, alturas coerentes e alinhamento compacto; em ate 760px os filtros sao reorganizados em duas colunas, com intervalo e origem em largura integral, e em ate 360px todos passam para uma coluna para evitar corte do seletor de mes. Os filtros e seus parametros GET permanecem disponiveis sem JavaScript; nenhuma selecao, permissao ou comportamento financeiro foi alterado.

Indicadores monetarios por moeda mantem a ordem **resumo → visualizacao → destaques → detalhe**, cards apenas para metricas de decisao e sem fundo primario escuro em todo o card. Receitas e despesas usam as cores semanticas do design system como reforco, mantendo sinal, texto e `Money`. A tendencia passou a usar colunas mais densas com rolagem horizontal local (teclado e touch); matrizes e tabelas preservam cabecalhos semanticos, primeira coluna fixa quando aplicavel e alinhamento numerico tabular. Nenhum total mistura moedas.

O aceite exige, **no HEAD exato da PR**, comparar capturas com a Golden Screen em 1366x768, 390x844 e 320x740: repouso/hover/foco dos controles, abas, filtros, indicadores, tendencia, BRL/USD, conteudo longo, estados vazio/erro, scroll local sem overflow global e legibilidade do detalhamento. Os cenarios Chrome existentes da #718 devem ser reutilizados; CI verde nao substitui a auditoria visual independente.

## Compactacao de grafico, destaques e matriz (22/10/2026, PR #729)

- **Resultado ao longo do tempo (evolucao por categoria):** exibe todos os pontos em grid responsivo que quebra linhas, sem barra horizontal mesmo no desktop, preservando rotulo, valor completo por `Money`, sinal e barra relativa. Em telas menores, reorganiza a quantidade de colunas conforme a largura. Somente este grafico usa `renderResultTrend(..., "Resultado por período", "grid")`; a projecao de caixa conserva o comportamento de rolagem local validado para seus pontos diarios.
- **Pontos para revisar:** melhor periodo, pior periodo e alerta passam a ocupar uma unica faixa compacta no desktop, sem bloco adicional de alerta abaixo. No mobile, os dois destaques dividem a primeira linha e o aviso fica abaixo, preservando leitura, semantica de `renderAlert` e contexto da moeda. Parcelas consolidadas reutilizam a mesma disposicao compacta.
- **Matriz por categoria:** o percentual fica **na mesma linha** do valor monetario, com fonte secundaria e separacao discreta; reduz-se o espacamento vertical das celulas e da indicacao de categoria arquivada. Todos os percentuais (inclusive `—` quando indisponiveis), valores, sinais, categorias, hierarquia expandivel, cabeçalhos e scroll local horizontal da matriz permanecem preservados. A largura maior da matriz e intencional; nao se deve truncar valores para economizar altura.
- **Prova de aceite:** no SHA atualizado da PR, o Chrome deve evidenciar ausencia de scrollbar no grafico de evolucao em 1366x768, 390x844 e 320x740, linhas consolidadas com altura controlada, agrupamento efetivo dos destaques, sem overflow global, e preservacao do scroll da matriz e do grafico de caixa. Os testes existentes da #718, e nao uma nova suite redundante, sao os donos dessas verificacoes.

## Seletor de moeda e densidade de numeros (22/10/2026, PR #729)

Na **Evolucao por categoria**, o seletor funcional **Moeda** faz parte da **mesma barra de filtros** e vem imediatamente depois de **Periodo**, antes da acao primaria **Atualizar relatorio**. Ha somente um formulario GET SSR e um botao de aplicacao para intervalo, conta/cartao, inicio, quantidade de periodos e moeda, sem exigir JavaScript. As opcoes incluem as moedas presentes no resultado, a selecao anterior (se fora do recorte) e **Todas as moedas**. A atualizacao preserva `view`, `interval`, `start`, `periods`, `profileId` e origem (`accountId` ou `cardId`) no mesmo envio. A faixa de resumo mostra a quantidade de periodos junto ao titulo `Leitura do período - BRL`, sem um cabeçalho isolado de moeda, outro formulario ou botao `Aplicar`. O filtro `currency=XXX` limita apenas a apresentacao de blocos monetarios ja retornados pela API, sem alterar calculos, converter valores ou misturar moedas. Sem parametro ou com `currency=all`, todos os blocos continuam visiveis; entrada de moeda invalida e rejeitada antes da chamada da API. Se a moeda escolhida nao possui movimentos, exibe estado vazio orientado e conserva o controle para alternar para Todas as moedas. A troca de intervalo conserva o filtro de moeda.

), `data-currency`, o sinal, o valor e a identificacao da moeda nos titulos/captions acessiveis. A fonte numerica da matriz e a fonte das descricoes tornam-se mais compactas; nomes de categorias permanecem completos em uma unica linha, com rolagem horizontal local da matriz, sem truncamento. O grafico **Resultado ao longo do tempo** usa fonte monetaria menor, preservando todos os valores e o grid sem scroll horizontal.

**Aceite:** confirmar no Chrome (1366x768, 390x844, 320x740) **um unico formulario**, moeda depois de periodo na ordem visual/DOM, botao Atualizar relatorio aplicado a todos os campos, selecao BRL, USD e Todas, o titulo da matriz, valores sem codigo redundante, texto sem sobreposicao, conteudo longo, navegacao e foco por teclado, URL/filtros preservados, estado vazio e moeda invalida. Testes SSR existentes cobrem o recorte sem somas combinadas; auditoria visual independente continua necessaria.

, sinal, precisao, dados `data-currency` e possivel contexto de conversao continuam preservados. Valores nao sao agregados entre moedas diferentes. Textos de acessibilidade, identificadores e captions continuam com a moeda explicita.

Os testes SSR existentes verificam titulos e ausencia do cabecalho redundante; o Chrome da issue #718 valida, por BRL e USD e por camada, a moeda nos titulos, a ausencia da sigla repetida e a consistencia semantica de cada `Money`, em 1366x768, 390x844 e 320x740. A aprovacao visual e a auditoria independente continuam exigidas apos CI verde.

## Propagacao visual Golden Screen (#718)

A rota adota o nivel de acabamento da Golden Screen do Extrato, **sem copiar o arquetipo de listagem**. O arquetipo A5 continua sendo a referencia: contexto de visao e filtros no topo, indicador decisivo por moeda, visualizacao, destaques e detalhe. Navegacao entre visoes usa abas discretas; controles mantem altura e foco padronizados. Nos blocos multi-moedas, cada secao apresenta o codigo BRL/USD em seu titulo (sem cabeçalho avulso) e os valores mantem `Money` com `data-currency`, mas sem repetir o codigo textual ao lado do numero; o destaque do resultado e do total mensal nunca une BRL e USD.

A evolucao por categoria oferece barras de tendencia com rolagem local por teclado e rotulos/valores textuais acessiveis. A arvore e a matriz permanecem semanticamente tabulares, com cabecalhos e valores completos em scroll local; nomes extensos podem quebrar linha. As distribuicoes de parcelas preservam os links canonicos, mas evitam cards e bordas aninhadas. A projecao de caixa apresenta, entre resumo e tabela, uma **amostra visual** dos saldos diarios canonicos (ate aproximadamente oito datas, incluindo a ultima): nenhuma interpolacao, soma, nova formula financeira ou supressao da serie completa. A tabela continua mostrando todas as datas e evidencias. Os valores monetários no gráfico usam largura mínima legível e quebra controlada; a validação Chrome rejeita texto de um período que invada a coluna vizinha, com controle negativo executado.

Falha de consulta exibe um link de tentativa novamente para a propria URL, preservando parametros sem exibir resultados parciais. Erro de filtro continua permitindo correcao no formulario SSR. Tabelas largas e graficos utilizam overflow horizontal local com foco visivel em desktop/mobile. A superfície de blocos monetários não permite que a largura intrínseca dos gráficos escape para a viewport; cada gráfico e matriz mantém seu próprio scroll acessível.

O cenário Chrome #718 agora fotografa separadamente as três camadas (resumo, visualização e detalhe) **de cada bloco BRL e USD**, rolando até o conteúdo antes da captura em cada viewport. Os metadados das 18 capturas comprovam visibilidade na viewport, contexto da moeda, existência do conteúdo financeiro e presença dos arquivos no relatório do run; não se aceita apenas uma fotografia da primeira dobra com filtros.

O aceite ampliado da #718 também exercita a **projeção de caixa real** (`view=cash-flow`) em 1366×768, 390×844 e 320×740, com capturas independentes de resumo, visualização e detalhe de BRL e USD, validação de moeda por `Money`, tabela diária e rolagem local. Os estados `empty`, `filter-error` e `api-error` são capturados em 390×844 e 320×740; a prova semântica exige visibilidade, ausência de resultado financeiro parcial, filtros inválidos identificáveis e link de tentativa novamente preservando a URL. Essas verificações pertencem ao mesmo cenário Chrome exact-SHA e falham se qualquer cobertura/captura faltar.

A aceitacao visual exige comparar capturas Chrome autenticadas e a arvore acessivel nos viewports desktop, 390px e 320px no SHA material desta PR, incluindo BRL/USD, recorte vazio, erro, tabela longa e controle negativo de truncamento. O cenário dedicado `reports-718-visual-acceptance` reutiliza `scripts/statement-visual/reports-category-evolution.mjs` por um módulo de entrada separado no workflow agregado, além dos controles legados de responsividade. Testes automatizados e CI verde sao requisitos distintos da aprovacao independente.

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

## Projecao de caixa

A visao `view=cash-flow` consome diretamente `GET /api/cash-flow-projection`. Os filtros sao `referenceDate=AAAA-MM-DD` e `horizonDays=30|60|90`; quando a data nao e informada, a web resolve sua referencia injetada para montar uma URL explicita da API.

Cada moeda recebe bloco independente com saldo inicial, saldo no fim do horizonte e tabela diaria continua. A interface apresenta `netMovementMinor`, `closingBalanceMinor` e `movements` devolvidos pelo backend sem recalcular saldos, preencher lacunas ou somar moedas.

As evidencias preservam o `commitmentId` canonico. Movimentos com conta vinculada podem abrir o Extrato planejado da respectiva conta e moeda; faturas abrem Cartoes. Uma transferencia cross-currency portanto aparece nas duas series nativas com o mesmo compromisso logico, sem conversao implicita.

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
