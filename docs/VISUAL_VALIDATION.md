# Validacao visual por fluxo e componente

Este documento define o contrato operacional do gate visual do SolverFin durante a migracao incremental da interface descrita na ADR 0014. Ele complementa `docs/RUNBOOK.md`, `docs/DESIGN_SYSTEM.md`, `docs/UI_PRIMITIVES.md` e `docs/SCREEN_ARCHETYPES.md`.

## Fonte executavel

- `scripts/statement-visual/coverage-contract.mjs`: registro canonico dos modulos Chrome, classes de cobertura, rotas-piloto e guards de retirada do legado.
- `scripts/statement-visual/issue-606-remediation-contract.mjs`: acrescenta as evidencias de rota exigidas pela #606 e decompoe cenarios compostos em execucoes de um unico registro de cobertura.
- `scripts/validate-statement-visual-coverage.mjs`: valida o contrato antes de abrir o navegador.
- `scripts/statement-visual/coverage-contract.test.mjs`: controles negativos do proprio gate.
- `scripts/run-statement-visual-validation.mjs`: executa cada unidade de cobertura em processo isolado e agrega o resultado.
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
- componentes estruturais exercitados quando o objetivo for a fundacao.

O fingerprint ignora o nome do arquivo e o ID do teste. Ele e derivado de `route + audience + state + layout + interaction + dataProfile`. Dois registros semanticamente equivalentes produzem o mesmo fingerprint e fazem o gate falhar. Diferencas de modulo ou nome nao justificam screenshots duplicados.

A unidade executavel e ainda mais estrita: cada processo Chrome do runner corresponde a exatamente um registro de cobertura. `route`, `state`, `layout` e `interaction` usados no log, no indice e no artefato sao derivados desse mesmo registro. Um cenario composto nao pode usar o primeiro item da lista como rotulo de uma falha ocorrida em outro estado.

## Evidencia por SHA

O runner grava em `artifacts/statement-visual/`:

- evidencias proprias de cada cenario, incluindo screenshots e JSON/Markdown quando o modulo as produz;
- `visual-gate-index.json`, com o SHA, o resultado e os fingerprints cobertos;
- `VISUAL-GATE.md`, resumo navegavel dos cenarios executados;
- `fatal-error.log` quando houver falha agregada.

No GitHub Actions, o artefato continua se chamando `statement-visual-evidence-<sha>`. Evidencia de outro SHA nao aprova um candidato novo.

## Falhas acionaveis

O runner registra o contexto antes e depois de cada unidade de cobertura. Uma falha informa pelo menos:

`scenario`, `sourceScenario`, `route`, `state`, `layout`, `interaction` e `module`.

Os modulos continuam donos das assercoes detalhadas e dos screenshots. O runner nao substitui o diagnostico local; ele garante que o primeiro erro do processo nao esconda qual classe de cobertura falhou e continua colhendo os demais bloqueadores independentes.

## Fundacao e rotas-piloto

A Fase 3B nao depende da conclusao das migracoes #608 a #614. Para toda rota-piloto, inclusive enquanto `adoption: "foundation"`, o contrato exige:

1. fluxo normal da propria rota em navegador real;
2. mobile quando a composicao muda;
3. pelo menos um estado alternativo relevante `empty/error/recoverable-error/permission/unavailable/alternate` na propria rota.

A fixture `component://foundation-states` continua obrigatoria para provar os componentes compartilhados da fundacao, mas nao substitui evidencia de estado da tela-piloto. O campo `adoption` descreve o estagio da migracao; ele nao reduz o criterio de aceite visual da rota.

Coberturas representativas atuais incluem:

| Classe                                                                                       | Evidencia principal                                                                                       |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| primitives estruturais, conteudo longo, dialog/drawer, foco e overflow                       | `issue-601-ui-primitives.mjs`                                                                             |
| loading, vazio, erro recuperavel, indisponibilidade, permissao e demais primitives de estado | `issue-606-foundation-states.mjs`                                                                         |
| Dashboard e Extrato responsivos                                                              | execucoes focadas por `issue-606-core-pages-execution.mjs`                                               |
| Dashboard vazio em perfil novo                                                               | `issue-606-dashboard-empty.mjs`                                                                           |
| Cartoes normal/mobile e vazio por filtro                                                     | execucoes focadas por `issue-606-cards-execution.mjs`                                                    |
| Cartoes em 1366x768, conteudo longo e teclado                                                | `cards-interface-adversarial.mjs`                                                                         |
| Contas e Cartoes desktop/mobile, tabs, menus e modais                                        | `accounts-cards-interface.mjs`                                                                            |
| Contas e Cartoes vazio em perfil novo                                                        | `issue-606-accounts-cards-empty.mjs`                                                                      |
| Relatorios normal/mobile/vazio/erro                                                          | execucoes focadas por `issue-606-reports-execution.mjs`                                                  |
| Orcamentos normal desktop/mobile                                                             | `issue-606-budgets-pilot.mjs`                                                                             |
| Orcamentos vazio em perfil novo                                                              | `issue-606-budgets-empty.mjs`                                                                             |
| Inbox desktop/mobile e teclado                                                               | `inbox-interface-refinement.mjs` e `inbox-interface-accessibility.mjs`                                   |
| reflow/zoom a 200%                                                                           | `issue-568-financial-assistant-zoom-200-reflow.mjs`                                                      |

O objetivo nao e produzir screenshot de toda combinacao. A amostra deve mudar quando rota, estado, layout, interacao, audiencia ou perfil de dados representar risco diferente.

## Retirada de pos-processadores HTML

`legacyProcessorBaselineIds` preserva os IDs que existiam no baseline da #604. `legacyProcessorRetirementCoverage` vincula cada responsabilidade legada a pelo menos um fluxo Chrome final.

Remover um adapter do inventario de `apps/web/src/dev-server/legacy-html-post-processors.ts` nao remove esse guard. A evidencia de substituicao deve permanecer registrada. O contrato falha se:

- um adapter atual ou historico perder seu mapeamento de cobertura;
- o mapeamento apontar para um cenario inexistente;
- qualquer rota-piloto perder o seu estado alternativo proprio;
- um cenario composto novo nao declarar como cada registro sera executado isoladamente.

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
