# Validacao visual por fluxo e componente

Este documento define o contrato operacional do gate visual do SolverFin durante a migracao incremental da interface descrita na ADR 0014. Ele complementa `docs/RUNBOOK.md`, `docs/DESIGN_SYSTEM.md`, `docs/UI_PRIMITIVES.md` e `docs/SCREEN_ARCHETYPES.md`.

## Fonte executavel

- `scripts/statement-visual/coverage-contract.mjs`: registro canonico dos modulos Chrome, classes de cobertura, rotas-piloto, mapeamento de componentes estruturais para fluxos reais e guards de retirada do legado.
- `scripts/statement-visual/issue-606-remediation-contract.mjs`: acrescenta as evidencias de rota exigidas pela #606, enriquece os registros com componentes/responsabilidades/assertions, gera assertions comportamentais para cada claim e decompoe cenarios compostos em execucoes de um unico registro de cobertura.
- `scripts/statement-visual/semantic-proof.mjs`: contrato de prova semantica que vincula a identidade da unidade executada às assertions realmente observadas.
- `scripts/statement-visual/issue-606-semantic-interactions.mjs`: executor focado das interacoes compostas de maior risco (foco/overflow e filtros/modal); nos fluxos focais de extrato, cartoes e relatorios, grava tambem a evidencia comportamental discriminante produzida pelo mesmo Chrome que executou o cenario.
- `scripts/statement-visual/issue-606-behavior-claims.mjs`: adaptador de evidencia que consome somente artefatos exact-SHA produzidos pelos cenarios Chrome e converte essas observacoes em assertions de `components`, `legacyProcessorIds` e `desktop-mobile`, sem abrir um segundo navegador nem mutar fixtures compartilhadas.
- `scripts/validate-statement-visual-coverage.mjs`: valida o contrato antes de abrir o navegador e executa mutation controls que preservam metadata enquanto retiram a capability observavel.
- `scripts/statement-visual/coverage-contract.test.mjs`: controles negativos e mutation tests do proprio gate.
- `scripts/run-statement-visual-validation.mjs`: executa cada unidade de cobertura em processo isolado, valida a prova primaria, executa o adaptador de evidencia comportamental quando houver claims, combina as provas e agrega o resultado.
- `.github/workflows/statement-visual-validation.yml`: ambiente oficial com Chrome e PostgreSQL efemero.

Um novo cenario visual deve entrar no registro canonico. Nao adicione uma segunda lista de scripts diretamente no workflow. Se um modulo canonico declarar mais de um registro de cobertura, ele precisa de decomposicao explicita para execucoes focadas; o gate falha fechado quando nao existe esse mapeamento.

## Unidade de cobertura

Cada evidencia representativa declara, no minimo:

- rota ou superficie de componente;
- arquetipo quando aplicavel;
- audiencia;
- estado;
- layout/viewport class;
- interacao principal;
- perfil de dados ficticios;
- componentes estruturais exercitados quando o objetivo for a fundacao;
- `requiredAssertions` para toda semantica que precisa ser observada, inclusive claims gerados de componentes, responsabilidades legadas e composicao desktop/mobile;
- `legacyProcessorIds` quando um fluxo e creditado como substituto de uma responsabilidade legada.

O fingerprint ignora o nome do arquivo e o ID do teste. Ele e derivado de `route + audience + state + layout + interaction + dataProfile`. Dois registros semanticamente equivalentes produzem o mesmo fingerprint e fazem o gate falhar. Diferencas de modulo ou nome nao justificam screenshots duplicados.

A unidade executavel e ainda mais estrita: cada processo Chrome do runner corresponde a exatamente um registro de cobertura. `route`, `state`, `layout` e `interaction` usados no log, no indice e no artefato sao derivados desse mesmo registro. Um cenario composto nao pode usar o primeiro item da lista como rotulo de uma falha ocorrida em outro estado.

### Prova semantica de interacao e comportamento

Metadata nao e evidencia por si so. O contrato gera assertions comportamentais com os prefixos `behavior:component:`, `behavior:legacy:` e `behavior:layout:` para claims que precisam ser observados em fluxo real. O runner executa a unidade primaria e, quando existem esses claims, executa tambem `issue-606-behavior-claims.mjs` como adaptador de artefatos exact-SHA. Esse adaptador nao abre outro Chrome: ele somente aceita observacoes geradas pelo cenario que acabou de passar e a unidade so passa quando a combinacao das provas observa todas as assertions exigidas.

O runner rejeita a unidade quando:

- a prova nao existe ou esta em versao invalida;
- `scenario/sourceScenario/route/state` da prova divergem da unidade corrente;
- alguma assertion obrigatoria nao foi observada;
- um componente continua declarado mas sua verificacao comportamental deixa de passar;
- uma responsabilidade legada continua mapeada mas o comportamento equivalente deixa de ser observado;
- um claim `desktop-mobile` de componente/legado nao comprova as duas classes de viewport.

Assim, manter `interaction: "filters-modal"` sem exercitar `modal`, manter `overflow-and-focus` sem exercitar foco, manter `legacyProcessorIds: ["card-list-sorting"]` sem provar a ordenacao, ou manter `layout: "desktop-mobile"` sem provar mobile nao pode continuar verde apenas porque o processo primario terminou com exit code zero.

Os mutation controls preservam a metadata e retiram somente a assertion/prova observavel para demonstrar o fail-closed do caso que motivou a remediacao da #606.

### Componente isolado nao e fluxo real

O contrato mantem duas provas complementares e nao intercambiaveis:

1. **cobertura da fundacao em navegador real**: uma fixture `component://...` pode provar API, estados, responsividade, teclado/foco e overflow da primitive de forma isolada;
2. **cobertura estrutural em fluxo real**: componentes classificados em `criticalStructuralRealFlowComponents` precisam apontar, por `criticalStructuralRealFlowCoverage`, para pelo menos um cenario que execute uma rota real (`/...`) ou o shell autenticado (`shell://...`), declare explicitamente o componente e exija a assertion `behavior:component:<Componente>`.

`realBrowser: true` sozinho nao transforma uma fixture em fluxo real. Um registro `component://...` continua util para a fundacao, mas nunca quita o criterio de aceite "componente estrutural critico possui pelo menos um fluxo real coberto". O gate tambem rejeita um mapeamento para rota real quando o registro correspondente nao declara execucao em navegador real, remove o componente mantendo apenas o ID do cenario ou preserva o componente sem a assertion comportamental correspondente.

O mapeamento de fluxo real permanece no mesmo registro canonico de cobertura para evitar uma segunda fonte de verdade. Os controles negativos exercitam fixture de primitive, fixture de estado, registro de rota sem navegador real e mutacoes que preservam metadata mas retiram a capability observavel. A issue #612 move a prova real de `Tabs` de `/contas-cartoes` para `/cartoes`, onde a navegacao de faturas continua usando essa primitive; `/contas-cartoes` passa a provar `DetailLayout` e `Dialog` sem reintroduzir abas aposentadas.

## Evidencia por SHA

O runner grava em `artifacts/statement-visual/`:

- evidencias proprias de cada cenario, incluindo screenshots e JSON/Markdown quando o modulo as produz;
- evidencias comportamentais exact-SHA produzidas pelos cenarios focais e artefatos de cenarios existentes consumidos pelo adaptador de claims;
- `semantic-proofs/*.json` para unidades que exigem assertions semanticas, incluindo provas comportamentais separadas derivadas desses artefatos;
- `visual-gate-index.json`, com o SHA, o resultado, os fingerprints e o status consolidado da prova semantica;
- `VISUAL-GATE.md`, resumo navegavel dos cenarios executados;
- `fatal-error.log` quando houver falha agregada.

Em pull requests, o workflow faz checkout do `pull_request.head.sha`, propaga esse mesmo SHA como `STATEMENT_VISUAL_CANDIDATE_SHA` e publica `statement-visual-evidence-<sha>`. Em execucao manual, o fallback e o `github.sha` disparado. Evidencia de outro SHA nao aprova um candidato novo.

## Falhas acionaveis

O runner registra o contexto antes e depois de cada unidade de cobertura. Uma falha informa pelo menos:

`scenario`, `sourceScenario`, `route`, `state`, `layout`, `interaction` e `module`.

Falha de prova semantica acrescenta as assertions obrigatorias/observadas e o motivo da divergencia. Os modulos continuam donos das assercoes detalhadas e dos screenshots. O runner nao substitui o diagnostico local; ele garante que o primeiro erro do processo nao esconda qual classe de cobertura falhou e continua colhendo os demais bloqueadores independentes.

## Fundacao e rotas-piloto

A Fase 3B nao depende da conclusao das migracoes #608 a #614. Para toda rota-piloto, inclusive enquanto `adoption: "foundation"`, o contrato exige:

1. fluxo normal da propria rota em navegador real;
2. mobile quando a composicao muda;
3. pelo menos um estado alternativo relevante `empty/error/recoverable-error/permission/unavailable/alternate` na propria rota.

A fixture `component://foundation-states` continua obrigatoria para provar os componentes compartilhados da fundacao, mas nao substitui evidencia de estado da tela-piloto nem cobertura estrutural em fluxo real. O campo `adoption` descreve o estagio da migracao; ele nao reduz o criterio de aceite visual da rota.

Coberturas representativas atuais incluem:

| Classe                                                                                       | Evidencia principal                                                    |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| primitives isoladas, conteudo longo, dialog/drawer, foco e overflow                          | `issue-601-ui-primitives.mjs`                                          |
| loading, vazio, erro recuperavel, indisponibilidade, permissao e demais primitives de estado | `issue-606-foundation-states.mjs`                                      |
| claims de componentes, legado e desktop/mobile em fluxos reais                               | artefatos dos cenarios + `issue-606-behavior-claims.mjs`               |
| Extrato foco + overflow, ordenacao, insight e desktop/mobile                                 | `issue-606-semantic-interactions.mjs`                                  |
| Dashboard e demais core pages responsivos                                                    | `issue-606-core-pages-execution.mjs`                                   |
| Dashboard vazio em perfil novo                                                               | `issue-606-dashboard-empty.mjs`                                        |
| Cartoes filtros, modal, ordenacao, subtotais, resumo, finalizer e Tabs de fatura              | `issue-610-cards-semantic-interactions.mjs`                             |
| Cartoes vazio por filtro                                                                     | `issue-606-cards-execution.mjs`                                        |
| Cartoes em 1366x768, conteudo longo e teclado                                                | `cards-interface-adversarial.mjs`                                      |
| Contas e Cartoes A3 desktop/mobile, master-detail, selecao, filtros, dialogs e acoes diretas  | `accounts-cards-interface.mjs` + adaptador de claims                   |
| Contas e Cartoes vazio em perfil novo                                                        | `issue-606-accounts-cards-empty.mjs`                                   |
| Relatorios foco + overflow e estrutura desktop/mobile                                        | `issue-606-semantic-interactions.mjs`                                  |
| Relatorios vazio/erro                                                                        | `issue-606-reports-execution.mjs`                                      |
| Configuracoes, formulario e dialog em fluxo real                                             | `settings-interface.mjs` + adaptador de claims                         |
| shell autenticado desktop/mobile                                                             | `sidebar-navigation.mjs` + adaptador de claims                         |
| Orcamentos normal desktop/mobile                                                             | `issue-606-budgets-pilot.mjs`                                          |
| Orcamentos vazio em perfil novo                                                              | `issue-606-budgets-empty.mjs`                                          |
| Inbox desktop/mobile e teclado                                                               | `inbox-interface-refinement.mjs` e `inbox-interface-accessibility.mjs` |
| reflow/zoom a 200%                                                                           | `issue-568-financial-assistant-zoom-200-reflow.mjs`                    |

O objetivo nao e produzir screenshot de toda combinacao. A amostra deve mudar quando rota, estado, layout, interacao, audiencia ou perfil de dados representar risco diferente.

## Retirada de pos-processadores HTML

`legacyProcessorBaselineIds` preserva os IDs que existiam no baseline da #604. `legacyProcessorRetirementCoverage` vincula cada responsabilidade legada a pelo menos um fluxo Chrome final. O registro desse fluxo precisa declarar o mesmo ID em `legacyProcessorIds` e exigir `behavior:legacy:<id>`; o adaptador comportamental somente emite essa assertion depois de validar o criterio discriminante observado e persistido pelo fluxo no SHA corrente.

Remover um adapter do inventario de `apps/web/src/dev-server/legacy-html-post-processors.ts` nao remove esse guard. A evidencia de substituicao deve permanecer registrada. O contrato falha se:

- um adapter atual ou historico perder seu mapeamento de cobertura;
- o mapeamento apontar para um cenario inexistente;
- o cenario mapeado deixar de declarar explicitamente a responsabilidade equivalente;
- a metadata da responsabilidade permanecer mas a assertion comportamental ou sua prova desaparecer;
- qualquer rota-piloto perder o seu estado alternativo proprio;
- um componente estrutural critico perder todos os seus fluxos reais observados;
- um cenario composto novo nao declarar como cada registro sera executado isoladamente.

Os mutation controls preservam `components`, `legacyProcessorIds` e `layout` enquanto removem as assertions/provas correspondentes. Isso prova que a simples existencia do ID, do cenario ou da metadata nao satisfaz equivalencia.

Esse gate complementa, e nao substitui, `legacy-html-post-processors:check` e o contrato SSR.

## Comandos

Contrato rapido, sem navegador:

```bash
npm run visual-coverage-contract:check
```

Gate Chrome completo, depois do build web e com os servidores/variaveis exigidos pelo workflow:

```bash
npm run qa:statement-visual
```

O gate agregado do repositorio continua sendo `npm run validate`. Testes de dominio/API permanecem obrigatorios para comportamento financeiro; screenshot ou assercao DOM nao substitui corretude de dominio.

## Dados e privacidade

Fixtures, nomes, valores e screenshots devem ser ficticios e minimizados. O workflow executa `assert-artifact-safety` antes de publicar a evidencia. Nao registre secrets, dados financeiros reais nem identificadores pessoais em artefatos visuais.
