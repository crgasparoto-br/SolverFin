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

- `/api/financial-summary`: blocos financeiros por moeda e itens recentes;
- `/api/bank-message-inbox?status=pending_review`: quantidade de itens aguardando revisão;
- `/api/invoices?status=open`: faturas em aberto.

A rota não baixa indiscriminadamente `/api/transactions?status=all` para recompor indicadores que já existem no `financial-summary`.

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

Cada moeda tem cinco indicadores principais. Os links levam ao Extrato com recortes que reproduzem a evidência correspondente:

- Disponível estimado: `currency=<MOEDA>`;
- Variação líquida do mês: `currency=<MOEDA>&evidence=posted`;
- Receitas do mês: `currency=<MOEDA>&kind=income&evidence=posted`;
- Despesas do mês: `currency=<MOEDA>&kind=expense&evidence=posted`;
- Compromissos previstos: `currency=<MOEDA>&kind=expense&evidence=planned`.

A variação líquida é calculada no contrato agregado do backend como receitas postadas/reconciliadas menos despesas postadas/reconciliadas da mesma moeda e do mesmo mês. O frontend apenas apresenta `netVariationMinor`; ele não reconstitui nem inventa a regra financeira.

O Extrato interpreta `kind` somente para `income` e `expense`, e `evidence` somente para `posted` e `planned`. Valores não suportados são ignorados em vez de receber significado implícito. `posted` reproduz o recorte mensal do resumo para status `posted`/`reconciled` pela data `occurredOn` e exclui pagamentos de fatura; quando `kind` não é informado, o recorte preserva receitas e despesas para explicar a variação. `planned` reproduz compromissos `planned`/`suggested` pela data `plannedOn`, sem `effectiveOn`.

A resolução por `currency` continua escolhendo somente uma conta na moeda solicitada. Se não existir conta compatível, não há fallback silencioso para outra moeda.

## Estados

O view-model do Dashboard mantém estados explícitos:

- `loading`: estado tipado disponível antes da resolução das fontes;
- `error`: resumo financeiro obrigatório indisponível;
- `empty`: sem evidência financeira para o perfil;
- `success`: cockpit renderizado, com qualidade `complete` ou `partial` conforme as fontes operacionais opcionais.

Estados vazios também são reutilizados dentro de seções, como ações pendentes e itens recentes.

## Orçamento, projeções e insights

Os módulos de decisão são apenas pontos de navegação para capacidades existentes. O Dashboard não fabrica valores de orçamento, projeção 30/60/90 ou insights financeiros no frontend. Novos números devem vir de contratos determinísticos próprios antes de serem exibidos no cockpit.

O módulo de insights navega pela rota canônica `/assistente`.

## Responsividade e acessibilidade

A composição preserva:

- reflow da grade de indicadores nos breakpoints do cockpit;
- navegação nativa por links para moedas e drilldowns;
- foco visível nos links de evidência;
- estados com semântica e `aria-live` fornecidos pelas primitives compartilhadas;
- validação real em desktop e mobile;
- validação por teclado no Chrome: o gate envia `Tab`, confirma que o primeiro KPI recebe foco e verifica a presença de outline visível.

## Validação

As regressões da rota cobrem, entre outros pontos:

- valores multi-moedas sem mistura;
- variação líquida determinística por moeda;
- uso das primitives da Fase 3B na marcação SSR;
- ausência de carga indiscriminada de todos os lançamentos;
- drilldowns distintos para variação, receita, despesa e compromisso;
- seleção da conta pela moeda pedida;
- filtragem de evidência postada/reconciliada versus planejada/sugerida;
- estado `loading` tipado, vazio, erro e dados parciais;
- rota canônica do Assistente Financeiro;
- reflow, teclado e foco visível;
- validação visual real da rota no workflow `Statement visual validation`.
