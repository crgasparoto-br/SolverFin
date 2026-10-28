# Dashboard financeiro

Este documento registra o contrato executável atual do Dashboard do SolverFin Web em `/dashboard`.

A implementação SSR fica em `apps/web/src/dev-server/dashboard-page.ts` e `apps/web/src/dev-server/dashboard-presenter.ts`. O Dashboard usa a fundação de interface da Fase 3B (`apps/web/src/design-system/`) para estados, cabeçalho, contêiner, grid de resumo e cards de métricas, mantendo o view-model como fronteira entre contratos financeiros e renderização.

## Objetivo

O Dashboard funciona como cockpit financeiro orientado à decisão. Ele deve responder rapidamente:

- como está a posição financeira atual;
- quanto está livre para gastar hoje sem tornar negativa a trajetória determinística dos próximos 30 dias;
- se existe déficit projetado e em qual ponto da trajetória ocorre o menor saldo;
- o que mudou no mês, por meio da variação líquida postada por moeda;
- quais entradas e despesas postadas ou reconciliadas pertencem ao período;
- quais compromissos estão previstos;
- quais pendências operacionais exigem ação;
- quais módulos de planejamento, projeção e insights podem ser abertos para aprofundamento.

Nenhum total combina moedas diferentes. Cada bloco de indicadores preserva a moeda de origem e valores monetários continuam representados pelo contrato `Money` (`amountMinor + currency`).

## Fontes de dados

O Dashboard consome contratos agregados e operacionais específicos:

- `/api/financial-summary`: blocos financeiros por moeda, referências das contas que podem fornecer evidência e itens recentes;
- `/api/cash-flow-projection?horizonDays=30`: saldo projetado diário canônico por moeda, com data de referência e evidências dos compromissos;
- `/api/bank-message-inbox?status=pending_review`: quantidade de itens aguardando revisão;
- `/api/invoices?status=open`: faturas em aberto;
- `/api/financial-insights?state=active&limit=3`: principais insights ativos já deduplicados e ordenados pela política canônica (#621).

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

Cada moeda preserva os cinco indicadores e seus cálculos: **saldo das contas** e **variação líquida** aparecem como os dois indicadores de decisão da primeira leitura; receitas, despesas e compromissos aparecem em uma faixa compacta, sem três cards extras. Todos os cinco oferecem o mesmo drilldown contextual por moeda. O índice de evidências foi movido para depois de ações, projeção, insights, ferramentas de decisão e itens recentes, evitando que cinco blocos de detalhes por moeda ocupem a dobra inicial. O link navega para o mesmo índice de evidências da própria moeda no Dashboard. Esse índice apresenta uma entrada explícita para cada conta relacionada ao bloco; contas ativas abrem o Extrato já filtrado por `accountId` e moeda, enquanto contas inativas permanecem identificadas como evidência histórica sem oferecer uma ação operacional enganosa.

- Saldo das contas: posição atual das contas ativas da moeda, com acesso ao Extrato individual de cada conta;
- Variação líquida do mês: contas da moeda relacionadas ao agregado, com `evidence=posted` nas contas ativas;
- Receitas do mês: contas da moeda relacionadas ao agregado, com `kind=income&evidence=posted` nas contas ativas;
- Despesas do mês: contas da moeda relacionadas ao agregado, com `kind=expense&evidence=posted` nas contas ativas;
- Compromissos previstos: contas da moeda relacionadas ao agregado, com `kind=expense&evidence=planned` nas contas ativas.

Contas inativas continuam visíveis como referência histórica para variação, receitas, despesas e compromissos, mas não recebem link para um Extrato que poderia resolver para outra conta. Elas também não participam do índice do saldo atual das contas. Assim, duas ou mais contas ativas na mesma moeda nunca são reduzidas arbitrariamente à primeira conta encontrada.

A variação líquida é calculada no contrato agregado do backend como receitas postadas/reconciliadas menos despesas postadas/reconciliadas da mesma moeda e do mesmo mês. O frontend apenas apresenta `netVariationMinor`; ele não reconstitui nem inventa a regra financeira.

O Extrato interpreta `kind` somente para `income` e `expense`, e `evidence` somente para `posted` e `planned`. Valores não suportados são ignorados em vez de receber significado implícito. `posted` reproduz o recorte mensal do resumo para status `posted`/`reconciled` pela data `occurredOn` e exclui pagamentos de fatura; quando `kind` não é informado, o recorte preserva receitas e despesas para explicar a variação. `planned` reproduz compromissos `planned`/`suggested` pela data `plannedOn`, sem `effectiveOn`.

Os links operacionais produzidos pelo índice sempre carregam um `accountId` explícito pertencente à moeda do bloco. A resolução do Extrato portanto permanece por conta, sem fallback para outra moeda e sem criar um saldo agregado artificial no frontend.

## Estados

O Dashboard mantém estados explícitos e alcançáveis:

- `loading`: se as fontes ultrapassarem a janela curta de resolução SSR, a rota devolve imediatamente o estado de carregamento; a mesma promessa de carga permanece temporariamente reutilizável e a página refaz a navegação sem disparar outra coleta concorrente;
- `error`: resumo financeiro obrigatório indisponível;
- `empty`: sem evidência financeira para o perfil;
- `success`: cockpit renderizado, com qualidade `complete` ou `partial` conforme as fontes operacionais opcionais.

O cache transitório do loading existe apenas para atravessar o reload do estado de espera e possui expiração curta. Estados vazios também são reutilizados dentro de seções, como ações pendentes e itens recentes.

## Orçamento, projeções e insights

Os módulos de decisão continuam sendo pontos de navegação para capacidades existentes. Desde a issue #617, o Dashboard apresenta o saldo ao fim do horizonte de 30 dias por moeda consumindo `GET /api/cash-flow-projection`. A #618 acrescenta, no mesmo payload de 30 dias, `freeToSpend` e `projectedDeficit` derivados no domínio a partir da trajetória canônica.

A interface mantém três conceitos explícitos e separados: **saldo das contas** (posição atual), **saldo projetado no fim do horizonte** (posição no 30º dia) e **livre para gastar hoje** (menor colchão não negativo de toda a trajetória). O déficit projetado é mostrado separadamente e o ponto limitante informa a primeira data do menor saldo. O frontend não reconstrói a série, não soma compromissos, não desconta orçamento, não adiciona crédito e não converte moedas. O link de cada moeda abre a mesma série canônica em Relatórios, com evidências navegáveis.

O módulo de insights navega pela rota canônica `/assistente`.

### Principais insights (#621)

A seção **Principais insights** mostra no máximo **3 insights ativos** do perfil financeiro ativo. O limite é global ao perfil (não por moeda) e é aplicado pela API depois da deduplicação e da ordenação canônica descritas em `docs/FINANCIAL_INSIGHTS.md`; o presenter apenas mantém um corte defensivo e nunca reordena. Cada item exibe severidade, tipo, moeda, título, período, até duas evidências e o deep link para o recorte que justificou o insight. Insights resolvidos ou adiados não ocupam essas posições.

Quando existem mais itens ativos, a seção oferece **Ver todos os insights (N)** para `/inbox#financial-insights`. Falha da fila mostra estado indisponível somente na seção; os indicadores financeiros permanecem visíveis.

## Responsividade e acessibilidade

A composição preserva:

- reflow dos dois indicadores prioritários e da faixa de três indicadores secundários (colunas no desktop, linhas compactas no mobile);
- posição e próxima ação acima do horizonte e de coleções de evidências;
- navegação nativa por links para moedas e índices de evidência;
- detalhes nativos (`details`/`summary`) para abrir as evidências de cada KPI;
- links de contas ativas com foco visível e recorte determinístico do Extrato;
- identificação read-only de contas inativas sem navegação enganosa;
- estados com semântica e `aria-live` fornecidos pelas primitives compartilhadas;
- validação real em desktop e mobile;
- validação por teclado no Chrome: o gate envia `Tab`, confirma foco navegável e verifica a presença de outline visível.

## Validação

As regressões da rota cobrem, entre outros pontos:

- valores multi-moedas sem mistura;
- duas contas ativas da mesma moeda preservadas no contrato e no índice de evidência;
- contas inativas identificadas sem produzir um link operacional incorreto;
- variação líquida determinística por moeda;
- uso das primitives da Fase 3B na marcação SSR;
- ausência de carga indiscriminada de todos os lançamentos;
- drilldowns distintos para variação, receita, despesa e compromisso;
- `accountId` explícito para cada conta ativa navegável;
- filtragem de evidência postada/reconciliada versus planejada/sugerida;
- estado `loading` alcançável na rota, vazio, erro e dados parciais;
- rota canônica do Assistente Financeiro;
- reflow, teclado e foco visível;
- validação visual real da rota no workflow `Statement visual validation`.

## Refinamento Golden Screen — Issue #724

A observação inicial veio do Chrome autenticado (`Statement visual validation`, execução
[39646109390](https://github.com/crgasparoto-br/SolverFin/actions/runs/39646109390),
`issue-606-core-dashboard-1366.png`), capturado em `9af4e012c9672f828204c503d318f2fb17ee74bb`.
Na comparação com a `develop` de 23/10/2026, `dashboard-page.ts`, `dashboard-presenter.ts`
e `shared-styles.ts` preservavam os mesmos hashes. Essa captura é **baseline** e não certifica
a revisão no novo SHA.

A hierarquia SSR refinada é: contexto/qualidade dos dados, posições por moeda (saldo e
variação com ênfase), **próximas ações**, receitas/despesas/compromissos agrupados por
moeda em linhas compactas, projeção de 30 dias, insights, ferramentas de decisão,
itens recentes e índice de evidências.
O Dashboard não altera modelo, endpoints, totais ou moeda; os links para evidências continuam
com a mesma identidade `#dashboard-evidence-*` e preservam as contas ativas/inativas.

O aceite final exige Chrome autenticado em 1366×768, 390×844 e 320×740 no SHA material,
cobrindo normal, multi-moeda, vazio, dados parciais, falha do resumo e conteúdo longo;
revisão visual humana e auditoria técnica independentes não são substituídas pelo teste SSR.
O teste de hierarquia deve rejeitar um painel de decisão intrusivo colocado antes das ações.

### Remediação da auditoria #724 — primeira ação realmente utilizável

Em 320×740 e 390×844 a dobra inicial deve conter **o título e o link operacional
completo da primeira ação**, não apenas o cabeçalho de "Próximas ações". A correção
da A-74402 identifica o modo multimoeda no SSR e reduz a densidade redundante
apenas nos dispositivos estreitos. A descrição introdutória e os subtítulos dos
KPIs permanecem no DOM e disponíveis a tecnologias assistivas, embora sejam
visualmente compactados; os títulos, valores BRL/USD e links de evidências
continuam visíveis. O aviso de dados parciais continua visível e legível.

O gate Chrome mede separadamente os limites visuais do título e do link da
primeira ação, exige destino navegável e foco por teclado, além da ordem dos
indicadores e ausência de overflow. O controle negativo insere um painel de
600 px antes das ações, exige a reprovação do **link** na primeira dobra e
valida sua restauração. Mutar apenas o link para ficar abaixo da dobra, mesmo
mantendo o cabeçalho visível, também deve reprovar o adaptador de evidências.

O runner canônico valida o Dashboard autenticado nos estados normal e vazio;
os cenários SSR controlados cobrem multimoeda completa/parcial, moeda única
parcial, erro e conteúdo longo, nas três larguras de aceite. Os dados de API
desses cenários são controlados, e não constituem homologação integrada com a
API de produção. O resultado Chrome e as capturas do SHA material corrigido
precisam de auditoria técnica e visual independente antes do aceite da issue.
