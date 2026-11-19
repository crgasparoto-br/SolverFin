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

## Layout de aceite: mockups aprovados em 19/11/2026 — issue #811

A proposta visual aprovada na conversa, item **4. Proposta de reorganização visual**,
é a fonte vinculante para a posição, hierarquia e agrupamento dos widgets.
O layout anterior (#724) permanece registrado como histórico de Golden Screen,
mas seu par de KPIs e sua disposição de módulos **não substituem** o mockup #811.

### Desktop — distribuição obrigatória

| Ordem | Posição                                             | Conteúdo                                                                                                                                                                                                                     |
| ----- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Cabeçalho + grade de 3 colunas × 2 linhas por moeda | **Visão geral financeira**, período/mês corrente, filtro de moeda, qualidade, KPIs **Saldo das contas**, **Livre para gastar**, **Resultado do mês**, **Contas a pagar**, **Gastos nos cartões**, **Saldo mínimo projetado** |
| 2     | Faixa operacional                                   | **Próximas ações e alertas financeiros**, com links reais antes dos gráficos                                                                                                                                                 |
| 3     | Faixa larga                                         | **Fluxo de caixa projetado**, gráfico de linha diária por moeda, saldo final e déficit                                                                                                                                       |
| 4     | Duas colunas                                        | **Contas a pagar** à esquerda; **Saldo por conta corrente** à direita                                                                                                                                                        |
| 5     | Duas colunas                                        | **Gastos por cartão** à esquerda (barras comparativas); **Melhor cartão para comprar hoje** à direita (fechamento, vencimento, dias e simulação)                                                                             |
| 6     | Duas colunas                                        | **Despesas por categoria** (barras horizontais) e **Evolução financeira** (colunas mensais)                                                                                                                                  |
| 7     | Duas colunas                                        | **Últimos lançamentos** e **Insights financeiros**                                                                                                                                                                           |
| 8     | Detalhes recolhidos                                 | Indicadores adicionais, ferramentas de decisão e índice das evidências por moeda                                                                                                                                             |

### Mobile — prioridade da dobra

Na largura de 390 e 320 px somente **Saldo das contas** e **Livre para gastar**
aparecem como KPIs _antes_ das próximas ações. O primeiro título e respectivo
link de ação precisam caber completamente na dobra inicial mesmo com duas moedas.
Os outros quatro KPIs de cada moeda são exibidos **depois** das ações.
Os pares de widgets refluem para coluna única, preservando a ordem da tabela.

O filtro de moeda seleciona a apresentação por moeda sem converter valores
financeiros nem recalcular saldos no browser. A simulação do cartão é um cálculo
realizado no domínio/backend, independente do recorte temporal dos demais KPIs.

### Artefatos visuais obrigatórios

`scripts/statement-visual/issue-724-dashboard-scenarios.mjs` executa
validação em Chrome nas resoluções **1366×768, 390×844 e 320×740**.
Além da regressão histórica #724, o job publica imagens
`issue-811-approved-mockup-multi-currency-<width>.png` e
`issue-811-approved-mockup-long-content-<width>.png`
em `statement-visual-evidence-<SHA>`, incluindo relatórios de
ordem das regiões, 3 colunas de KPIs no desktop, pares de widgets,
2 KPIs iniciais por moeda no mobile, linha temporal, overflow e foco.

**Gate:** capturas, comparação humana com os mockups originais,
validação do código exato e auditoria independente são verificações
distintas. Nenhuma substitui outra. CI verde não significa fidelidade visual
sem conferência das imagens.

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

Cada moeda preserva os cinco indicadores financeiros canônicos e seus cálculos. A primeira leitura no desktop expõe seis KPIs de decisão derivados das fontes canônicas, enquanto os indicadores financeiros de receitas, despesas e compromissos permanecem acessíveis numa faixa de detalhes recolhidos; no mobile, somente saldo das contas e livre para gastar precedem a primeira ação. Todos os cinco oferecem o mesmo drilldown contextual por moeda. O índice de evidências foi movido para depois de ações, projeção, insights, ferramentas de decisão e itens recentes, evitando que cinco blocos de detalhes por moeda ocupem a dobra inicial. O link navega para o mesmo índice de evidências da própria moeda no Dashboard. Esse índice apresenta uma entrada explícita para cada conta relacionada ao bloco; contas ativas abrem o Extrato já filtrado por `accountId` e moeda, enquanto contas inativas permanecem identificadas como evidência histórica sem oferecer uma ação operacional enganosa.

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

- reflow dos seis KPIs em três colunas no desktop e dois KPIs iniciais no mobile, com os quatro restantes após ações;
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
da A-74402 reduz a densidade das linhas de saldos tanto para moeda única
quanto para BRL/USD, incluindo dados parciais e conteúdo longo nos dispositivos
estreitos. A descrição introdutória e os subtítulos dos KPIs permanecem no
DOM e disponíveis a tecnologias assistivas, embora sejam visualmente
compactados; os títulos, valores por moeda e links de evidências continuam
visíveis. O aviso de dados parciais continua visível e legível.

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

## Cockpit operacional e decisão por cartão — issue #811

A refatoração acrescenta três blocos de decisão ao cockpit, preservando
`/api/financial-summary` e a projeção em 30 dias como fontes canônicas:

1. **Melhor cartão para comprar hoje:** ordena cartões ativos com instrumentos
   ativos pelo maior prazo entre a compra e o vencimento estimado da fatura.
   Os cartões empatados recebem igual destaque, com fechamento/vencimento
   explícitos. O cálculo reutiliza `calculateInvoicePeriod`, inclusive no
   dia de fechamento. A simulação de outra data modifica somente a recomendação.
2. **Compromissos e posição:** lista contas a pagar e faturas do mês corrente,
   incluindo pendências vencidas anteriores, e mostra saldo por conta e tipo
   sem classificar investimentos como liquidez imediata.
3. **Comportamento de consumo:** gastos realizados por cartão no mês da compra,
   despesas por categoria e comparação mensal de receitas/despesas. A
   trajetória canônica diária alimenta o gráfico de caixa sem recalcular saldos.

A API dedicada é documentada em [API_DASHBOARD_OVERVIEW.md](./API_DASHBOARD_OVERVIEW.md).
Os widgets são secundários à primeira ação no mobile (requisito Golden Screen
#724) e preservam o índice de evidências original e os links de navegação
por moeda. A falha do endpoint operacional é opcional: deve mostrar
`Dados parciais`, não apagar os indicadores financeiros já confirmados.

A data civil “hoje” do recomendador reutiliza a regra de São Paulo do Extrato, mesmo quando o relógio UTC do servidor já passou da meia-noite. O resumo financeiro mantém sua data de referência UTC, exposta separadamente como `referenceDate`.

A recomendação considera somente prazo, não limite disponível ou aprovação
de compra. O vencimento previsto reflete os dias cadastrados, sem pretender
validar o processamento da administradora no dia de fechamento. O teste de
homologação deve cobrir autenticação, seletor de data, alteração do melhor
cartão, empate, fatura paga, moeda distinta, séries vazias, conteúdo extenso,
foco por teclado e telas 1366×768, 390×844 e 320×740.
