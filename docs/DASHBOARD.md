# Dashboard financeiro

Este documento registra o contrato executável atual do Dashboard do SolverFin Web em `/dashboard`.

A implementação SSR fica em `apps/web/src/dev-server/dashboard-page.ts` e `apps/web/src/dev-server/dashboard-presenter.ts`. O Dashboard usa a fundação de interface da Fase 3B (`apps/web/src/design-system/`) para estados, cabeçalho, contêiner, grid de resumo e cards de métricas, mantendo o view-model como fronteira entre contratos financeiros e renderização.

## Objetivo

O Dashboard funciona como cockpit financeiro orientado à decisão. Ele deve responder rapidamente:

- como está a posição financeira atual;
- o que mudou no mês, por meio da variação líquida postada por moeda;
- quais entradas e despesas postadas ou reconciliadas pertencem ao período;
- quais compromissos estão previstos;
- quais pendências operacionais exigem ação;
- quais módulos de planejamento, projeção e insights podem ser abertos para aprofundamento.

Nenhum total combina moedas diferentes. Cada bloco de indicadores preserva a moeda de origem e valores monetários continuam representados pelo contrato `Money` (`amountMinor + currency`).

## Fontes de dados

O Dashboard consome contratos agregados e operacionais específicos:

- `/api/financial-summary`: blocos financeiros por moeda, referências das contas que podem fornecer evidência e itens recentes;
- `/api/bank-message-inbox?status=pending_review`: quantidade de itens aguardando revisão;
- `/api/invoices?status=open`: faturas em aberto.

A rota não baixa indiscriminadamente `/api/transactions?status=all` para recompor indicadores que já existem no `financial-summary`. As referências de conta são metadados leves (`id`, nome e status); nenhum cálculo financeiro novo é executado no frontend.

Quando uma fonte operacional opcional falha, os indicadores financeiros continuam visíveis e a interface sinaliza `Dados parciais`. Falha do resumo financeiro obrigatório resulta em estado de erro explícito.

## Fundação da Fase 3B

A composição do Dashboard reutiliza as primitives executáveis compartilhadas:

- `renderPageContainer` para largura e gutters canônicos;
- `renderPageHeader` para hierarquia do hero;
- `renderSummaryGrid` para a grade responsiva de KPIs;
- `renderMetricCard` para apresentação dos valores;
- `renderLoading`, `renderEmptyState` e `renderRecoverableError` para estados de superfície;
- `renderCard` para módulos de decisão.

Os estilos compartilhados são fornecidos por `sharedShellStyles()`, que inclui o CSS/tokens do design system. Regras locais do Dashboard são limitadas à composição específica do cockpit, sem reconstruir as primitives compartilhadas.

## Indicadores e drilldown

Cada moeda tem cinco indicadores principais. O card navega primeiro para um índice de evidências da própria moeda no Dashboard; esse índice apresenta uma entrada explícita para cada conta contribuinte e cada entrada abre o Extrato já filtrado por `accountId` e moeda.

- Disponível estimado: somente contas ativas da moeda, com acesso ao Extrato individual de cada conta;
- Variação líquida do mês: todas as contas da moeda com `evidence=posted`;
- Receitas do mês: todas as contas da moeda com `kind=income&evidence=posted`;
- Despesas do mês: todas as contas da moeda com `kind=expense&evidence=posted`;
- Compromissos previstos: todas as contas da moeda com `kind=expense&evidence=planned`.

Contas inativas continuam disponíveis como evidência histórica para variação, receitas, despesas e compromissos, mas não participam do índice do disponível estimado. Assim, duas ou mais contas na mesma moeda nunca são reduzidas arbitrariamente à primeira conta encontrada.

A variação líquida é calculada no contrato agregado do backend como receitas postadas/reconciliadas menos despesas postadas/reconciliadas da mesma moeda e do mesmo mês. O frontend apenas apresenta `netVariationMinor`; ele não reconstitui nem inventa a regra financeira.

O Extrato interpreta `kind` somente para `income` e `expense`, e `evidence` somente para `posted` e `planned`. Valores não suportados são ignorados em vez de receber significado implícito. `posted` reproduz o recorte mensal do resumo para status `posted`/`reconciled` pela data `occurredOn` e exclui pagamentos de fatura; quando `kind` não é informado, o recorte preserva receitas e despesas para explicar a variação. `planned` reproduz compromissos `planned`/`suggested` pela data `plannedOn`, sem `effectiveOn`.

Os links produzidos pelo índice sempre carregam um `accountId` explícito pertencente à moeda do bloco. A resolução do Extrato portanto permanece por conta, sem fallback para outra moeda e sem criar um saldo agregado artificial no frontend.

## Estados

O Dashboard mantém estados explícitos e alcançáveis:

- `loading`: se as fontes ultrapassarem a janela curta de resolução SSR, a rota devolve imediatamente o estado de carregamento; a mesma promessa de carga permanece temporariamente reutilizável e a página refaz a navegação sem disparar outra coleta concorrente;
- `error`: resumo financeiro obrigatório indisponível;
- `empty`: sem evidência financeira para o perfil;
- `success`: cockpit renderizado, com qualidade `complete` ou `partial` conforme as fontes operacionais opcionais.

O cache transitório do loading existe apenas para atravessar o reload do estado de espera e possui expiração curta. Estados vazios também são reutilizados dentro de seções, como ações pendentes e itens recentes.

## Orçamento, projeções e insights

Os módulos de decisão são apenas pontos de navegação para capacidades existentes. O Dashboard não fabrica valores de orçamento, projeção 30/60/90 ou insights financeiros no frontend. Novos números devem vir de contratos determinísticos próprios antes de serem exibidos no cockpit.

O módulo de insights navega pela rota canônica `/assistente`.

## Responsividade e acessibilidade

A composição preserva:

- reflow da grade de indicadores nos breakpoints do cockpit;
- navegação nativa por links para moedas e índices de evidência;
- detalhes nativos (`details`/`summary`) para abrir as evidências de cada KPI;
- links por conta com foco visível e recorte determinístico do Extrato;
- estados com semântica e `aria-live` fornecidos pelas primitives compartilhadas;
- validação real em desktop e mobile;
- validação por teclado no Chrome: o gate envia `Tab`, confirma foco navegável e verifica a presença de outline visível.

## Validação

As regressões da rota cobrem, entre outros pontos:

- valores multi-moedas sem mistura;
- duas contas da mesma moeda preservadas no contrato e no índice de evidência;
- variação líquida determinística por moeda;
- uso das primitives da Fase 3B na marcação SSR;
- ausência de carga indiscriminada de todos os lançamentos;
- drilldowns distintos para variação, receita, despesa e compromisso;
- `accountId` explícito para cada conta de evidência;
- filtragem de evidência postada/reconciliada versus planejada/sugerida;
- estado `loading` alcançável na rota, vazio, erro e dados parciais;
- rota canônica do Assistente Financeiro;
- reflow, teclado e foco visível;
- validação visual real da rota no workflow `Statement visual validation`.