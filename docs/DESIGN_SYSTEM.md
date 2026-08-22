# Design system - SolverFin Web

Este documento registra a base visual atual e a direcao de evolucao das telas web/PWA do SolverFin.

A fonte canonica dos valores semanticos do design system e `apps/web/src/design-system/tokens.ts`. `apps/web/src/design-system/styles.ts` serializa esses tokens para CSS executavel, e a aplicacao SSR materializa essa publicacao no shell por `apps/web/src/dev-server/shared-styles.ts`. O runtime atual nao depende de React, Storybook ou outro framework, e a ADR 0014 determina que a componentizacao deve evoluir sem exigir uma troca de framework.

## Direcao visual

Tese visual: uma interface financeira calma, clara e densa o suficiente para uso diario, com base em azul petroleo, verde de confirmacao e ciano para estados ativos ou inteligentes.

Principios:

- clareza antes de decoracao;
- hierarquia de decisao antes de detalhe;
- mobile-first;
- contraste forte e foco visivel;
- componentes com estados previsiveis;
- moeda explicita em qualquer componente monetario;
- exemplos sempre ficticios e sem dados financeiros reais;
- cards apenas quando criarem agrupamento semantico real, evitando grade de cards como layout padrao para qualquer informacao;
- consistencia compartilhada antes de customizacao local por rota.

## Estado atual e estado-alvo

### Estado atual

O SSR usa CSS como strings TypeScript, renderers por rota e provedores/pos-processadores registrados no contrato SSR. Esse mecanismo continua valido como baseline executavel enquanto as rotas ainda dependem dele.

A fundacao visual compartilhada, entretanto, ja possui um caminho canonico unico: valores semanticos nascem em `tokens.ts`, sao publicados como custom properties `--sf-*` por `styles.ts` e chegam ao SSR por `sharedShellStyles()`. Variaveis legadas como `--primary`, `--surface` e `--radius` permanecem apenas como aliases de compatibilidade para `--sf-*`; elas nao podem voltar a declarar valores semanticos independentes.

### Estado-alvo

A interface deve convergir para tokens, componentes executaveis, layouts reutilizaveis, view-models e arquetipos de tela. Pos-processamento de HTML por regex/string deixa de ser mecanismo normal para novas features e passa a ser legado de transicao.

A migracao e rota a rota. Nenhuma etapa pode remover cobertura SSR, acessibilidade ou validacao visual antes de existir protecao equivalente para a composicao nova.

## Tokens

`apps/web/src/design-system/tokens.ts` e a **fonte de verdade executavel** dos valores semanticos compartilhados. Ele cobre:

- cores principais, superficies, bordas, estados e interacoes alinhadas a `docs/BRAND.md`;
- escala de espacamento;
- raios contidos;
- tipografia sans-serif, tamanhos, pesos e alturas de linha;
- sombras/elevacao para superficies, foco, dialog e toast;
- tempos de movimento curtos;
- breakpoints de layout e compatibilidade do shell;
- largura maxima, gutters e grid responsivo;
- densidade, incluindo altura minima de novas primitivas interativas.

`apps/web/src/design-system/styles.ts` e a camada de publicacao. `buildSolverFinCssVariables()` serializa os valores canonicos em `--sf-*`, e `createSolverFinDesignSystemCss()` compoe as primitivas compartilhadas. Para media queries, que nao podem consumir custom properties como limite, o renderer interpola diretamente os breakpoints recebidos do mesmo objeto de tokens.

### Layout e densidade

A fundacao operacional publica:

- `contentMaxWidth`, gutters mobile/desktop e `gridGap`/`gridMinColumn` para `PageContainer` e grid responsivo;
- `interactiveTargetMin` de 44 px para novas primitivas `sf-*`;
- alturas compactas separadas para controles legados enquanto a migracao rota a rota estiver em andamento;
- padding de controles, paineis e celulas de tabela como tokens de densidade.

O alvo de 44 px e o contrato para novas primitivas interativas. Controles SSR legados que hoje usam 30-36 px mantem tokens de compatibilidade explicitos ate a migracao correspondente; nao se deve copiar essas medidas compactas para componentes novos.

### Estados semanticos

Os estados `positive`, `negative`, `neutral`, `attention` e `information` possuem foreground, surface, border e marcador canonicos. A primitiva `.sf-semantic-state` combina cor com borda lateral e marcador textual/visual distinto, portanto o significado nao depende somente de cor.

O marcador visual nao substitui texto acessivel. Consumidores devem manter rotulo ou mensagem visivel que explique o estado; iconografia/marker e cor sao reforcos de reconhecimento.

### Regra de fonte unica

Alterar um valor semantico compartilhado deve exigir uma edicao somente em `tokens.ts`. E proibido:

- repetir o mesmo hex, raio, sombra, breakpoint ou medida semantica em `shared-styles.ts` para "manter sincronizado";
- manter dois mapas de tokens independentes e confiar em convencao ou teste de igualdade;
- introduzir escala local de espacamento, tipografia ou raio em componente novo quando a escala compartilhada atende;
- publicar um novo alias legado com valor literal concorrente.

E permitido manter valores estritamente locais quando nao representam um token compartilhado (por exemplo, uma dimensao intrinseca de um asset). Quando um valor local passa a se repetir ou expressar uma regra transversal, ele deve migrar para `tokens.ts`.

## Provedores de estilos SSR atuais

A composicao SSR atual e organizada por responsabilidade:

- `shared-shell`: publicacao dos tokens canonicos, aliases de compatibilidade, reset, shell autenticado e primitivas recorrentes, fornecido por `sharedShellStyles()`;
- `shared-dialog`: estrutura compartilhada de dialogos, fornecida por `sharedDialogStyles()` quando a rota usa modal;
- `page:<routeId>`: regras especificas do renderer da rota, com fragmentos CSS discriminantes registrados no contrato;
- `aux:recurrences-section`: regras auxiliares de recorrencias, registradas separadamente do CSS principal das paginas que as consomem;
- `runtime:*`: regras adicionadas ou incorporadas pelos pos-processadores do despacho HTTP;
- `runtime:account-remuneration-statement`: estilos estruturais da remuneracao no Extrato, emitidos por `list-sorting-enhancement.ts` no bloco `data-account-remuneration-statement-styles`;
- `runtime:account-remuneration-disclosure`: affordance visual da memoria de calculo, emitida por `account-remuneration-disclosure-enhancement.ts` no bloco `data-account-remuneration-disclosure-affordance`;
- `statement-presentation`: regras condicionais para conteudo com `.statement-layout`;
- `authenticated-shell-navigation`: regras de navegacao incorporadas pelo shell autenticado;
- `login-public`: regras exclusivas do documento publico de login.

O manifesto tipado em `apps/web/src/dev-server/ssr-style-contract.ts` registra quais provedores cada rota disponivel exige. O contrato aceita uma rota sem CSS especifico apenas quando ela estiver explicitamente classificada como `shared-only`.

Os provedores runtime cobrem pos-processadores efetivamente ligados a diferentes rotas. Eles continuam sendo parte do contrato atual, mas a ADR 0014 classifica novos pos-processamentos textuais como nao preferenciais e os existentes como candidatos a retirada durante a migracao de cada rota.

O portao nao usa somente busca em arquivos nem infere CSS especifico pela simples existencia de qualquer regra remanescente. Ele requisita cada rota pelo servidor Node `http` real, exige um fragmento do HTML normal da tela, compara os resultados completos dos provedores compartilhados e condicionais, valida cada provedor de pagina, auxiliar ou runtime e remove um provedor por vez nos controles negativos.

Para provedores condicionais, o HTML servido deve produzir o fragmento registrado como gatilho. A validacao continua obrigatoria enquanto o contrato SSR for a protecao executavel da rota.

## Componentes base atuais

`components.ts` define receitas de implementacao para:

- `Button`;
- `Input`;
- `Select`;
- `Dialog`;
- `Table`;
- `Card`;
- `EmptyState`;
- `Loading`;
- `Toast`;
- `FormPattern`.

Essas receitas continuam referencia, mas a estrategia atual exige que os componentes mais recorrentes passem de receitas conceituais para primitivas executaveis reutilizadas por mais de uma rota.

## Fundacao executavel alvo

A fundacao inicial deve cobrir, conforme a necessidade das telas-piloto:

### UI

- `Button` e `IconButton`;
- `Card` e `MetricCard`;
- `Input`, `Select` e controles de formulario;
- `DataTable`/lista responsiva;
- `EmptyState`, `Loading`, `Alert` e erro recuperavel;
- `Dialog` e `Drawer`;
- `Tabs`;
- `Badge`/status;
- `Toast`;
- `Money`.

### Layout

- `PageContainer`;
- `PageHeader`;
- `FilterBar`;
- `SummaryGrid`;
- `DetailLayout`;
- `FormLayout`.

Os nomes podem mudar na implementacao, mas as responsabilidades nao devem voltar a ser duplicadas em cada renderer.

## Primitiva financeira Money

Todo componente que represente valor monetario deve receber, no minimo:

- valor em unidade segura definida pelo contrato;
- moeda explicita;
- contexto de exibicao quando houver diferenca entre valor nativo e convertido.

Regras:

- nao inferir BRL por ausencia de moeda;
- nao somar valores dentro do componente;
- respeitar formatacao apropriada sem perder o codigo/simbolo necessario para desambiguacao;
- quando houver conversao futura, diferenciar visualmente valor nativo e valor convertido e permitir acesso aos metadados de cambio relevantes;
- estados ausente/indisponivel nao devem virar `0` silenciosamente.

## Arquetipos de tela

A interface deve convergir para seis arquetipos:

1. cockpit/dashboard;
2. listagem/extrato;
3. master-detail;
4. cadastro/configuracao;
5. analise/relatorio;
6. revisao/inbox.

Cada arquetipo deve definir hierarquia, acao primaria, estrategia responsiva, estados e comportamento de detalhe antes de novas telas inventarem uma composicao propria.

## Hierarquia das telas-piloto

### Dashboard

Priorizar situacao atual, variacao, horizonte e acoes. Evitar que todos os indicadores tenham o mesmo peso visual. Em multi-moedas, saldos/totais devem ser separados por moeda ate existir conversao explicita.

### Extrato

Manter contexto de conta e moeda evidente, filtros compactos, busca, agrupamento temporal, acoes contextuais e detalhe sem perder a lista.

### Cartoes de Credito

Expressar a hierarquia `cartao -> fatura -> compras`, destacar fatura atual, fechamento, vencimento, limite/uso e acoes. Pagamento de fatura nao deve aparecer visualmente como segunda compra/despesa economica.

### Relatorios

Priorizar resumo/conclusao, visualizacao, destaques e por ultimo matriz/tabela detalhada. Moedas diferentes devem aparecer em blocos separados salvo consolidacao cambial explicita.

## Estados padronizados

Estados cobertos ou a cobrir na base:

- foco visivel;
- desabilitado;
- loading;
- erro de campo;
- erro de pagina/acao recuperavel;
- vazio;
- sucesso/feedback;
- indisponibilidade;
- permissao negada;
- dialog/drawer em tela pequena;
- overflow e conteudo longo;
- valor/moeda indisponivel.

Textos visiveis devem explicar o que a pessoa pode fazer, revisar ou corrigir. Evite mensagens tecnicas ou detalhes de backend.

## Convencoes de uso

- Use labels visiveis em campos; placeholder nao substitui label.
- Icon-only buttons precisam de label acessivel.
- Tabelas/listas devem ter estado vazio com orientacao de proxima acao.
- Dialogs devem prender foco quando abertos e permitir fechamento por Escape quando nao forem bloqueantes.
- Toasts confirmam resultado; erros de formulario devem aparecer perto do campo quando possivel.
- Consuma escalas compartilhadas de espacamento, tipografia, raio, elevacao, layout e densidade antes de criar uma medida local.
- Nao duplique valores de tokens ou shell completo em um renderer quando um provedor compartilhado ja existir.
- Nao crie um novo pos-processador de HTML por regex/string para resolver layout ou composicao de feature nova; prefira componente/layout/view-model.
- Ao migrar uma rota, remova ou deprecie os provedores runtime que deixaram de ser necessarios e atualize o contrato SSR na mesma mudanca.
- Ao criar uma rota `status: "available"`, mantenha cobertura SSR/visual equivalente desde a primeira entrega.
- Componentes monetarios exigem moeda explicita.
- Nao use dados reais em exemplos, screenshots, fixtures ou documentacao.

## Validacao

Durante a transicao, executar o contrato de estilos diretamente quando a rota ainda estiver coberta por ele:

```bash
npm run validate:ssr-styles --workspace @solverfin/web
```

O portao tambem faz parte de `npm run build` e `npm run validate`.

`apps/web/src/dev-server/shared-styles.test.ts` possui o controle estrutural da fonte unica: ele cria uma copia do objeto de tokens com valores de referencia alterados e exige que a saida SSR publique os novos valores sem editar `shared-styles.ts`. Esse teste deve falhar se o shell voltar a manter valor literal concorrente para o alias coberto.

Mudancas de componente ou tela devem incluir verificacao proporcional ao risco de:

- estado normal e estados alternativos relevantes;
- desktop/mobile quando houver composicao distinta;
- teclado, foco, reflow e zoom;
- conteudo longo e overflow;
- moeda correta e ausencia de total cruzado quando houver valores financeiros.

Testes de fluxo/navegador devem ganhar peso conforme as telas migram; testes que apenas confirmam transformacao textual intermediaria nao substituem evidencia do comportamento final.

## Fora deste documento

- Escolha de framework web definitivo;
- provider de cambio;
- regras financeiras de saldo/fatura/orcamento;
- layout especifico completo de cada feature.

Esses temas pertencem a ADRs, contratos de dominio e issues proprias. Consulte `docs/EVOLUTION_STRATEGY.md`, ADR 0013 e ADR 0014.
