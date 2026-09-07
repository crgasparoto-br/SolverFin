# Pós-processadores HTML legados do SSR

## Objetivo

Este documento governa a retirada incremental dos adapters que recebem HTML já renderizado e o transformam por string/regex no despacho central de `apps/web/src/dev-server.ts`.

A fonte canônica executável é `apps/web/src/dev-server/legacy-html-post-processors.ts`. O código tipado define IDs, rota, ordem, dono, classificação, critério de substituição e fallback/acessibilidade de cada etapa.

Funções internas de renderização que geram strings HTML continuam sendo renderers; elas não passam a ser classificadas como pós-processadores apenas por trabalharem com strings.

## Regra de transição

Novas features não devem introduzir pós-processadores de HTML final como mecanismo padrão de extensão. Nova semântica deve existir antes do render, preferencialmente em ViewModel/schema ou em props/slots de componentes/layouts.

Um adapter legado pode permanecer apenas enquanto tiver ID, rota, ordem, dono, responsabilidade, caminho de migração, critério de substituição e fallback/acessibilidade explícitos no inventário canônico.

`LEGACY_HTML_POST_PROCESSOR_BUDGET` é monotônico e acompanha exatamente a quantidade de entradas residuais. A Issue #609 reduziu o orçamento para **9**, a Issue #610 para **5** e a Issue #612 reduz o orçamento para **2** ao retirar os três adapters de `/contas-cartoes`.

## Classificações

- `component-props-slots`: a responsabilidade deve ser absorvida pelo renderer/componente estrutural.
- `view-model-schema`: ordenação, agregação, payload ou contexto devem ser resolvidos antes do render.
- `temporary-processor`: compatibilidade transitória enquanto a substituição estrutural final ainda precisa preservar comportamento já entregue.

## Inventário residual

| Rota           | Ordem | Dono             | ID                                | Responsabilidade                                                                                                                     | Migração                |
| -------------- | ----: | ---------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `/categorias`  |     1 | `web-categories` | `categories-icons-tooltips`       | Decorar categorias com ícones e tooltips.                                                                                            | `component-props-slots` |
| `/lancamentos` |     1 | `web-statement`  | `account-remuneration-disclosure` | Preservar temporariamente seleção em massa, agrupamentos e disclosure de remuneração enquanto o último runtime é extraído do legado. | `temporary-processor`   |

Os critérios completos de substituição e os fallbacks ficam no inventário TypeScript para que testes e revisão trabalhem sobre a mesma fonte.

## Contas e Cartões A3 sem pós-processamento final

A Issue #612 migra `/contas-cartoes` para composição A3 direta sobre as primitives da Fase 3B. O renderer passa a emitir:

`coleção unificada de contas/cartões → recurso selecionado → detalhe contextual`

Antes ou durante a composição estruturada são resolvidos:

- seleção do recurso por `?resource=`;
- busca e filtro de status do master;
- instituição, tipo/bandeira, estado e identificadores;
- moeda da conta ou moeda da conta de pagamento do cartão;
- estado explícito `Moeda indisponível` quando a moeda não puder ser determinada;
- instrumentos dentro do detalhe do cartão;
- ações primárias/secundárias, dialogs e confirmação destrutiva.

Por isso, `/contas-cartoes` é renderizada diretamente pelo dispatcher e não deve voltar a usar `applyLegacyHtmlPostProcessorPipeline()`. Saíram do inventário:

- `accounts-cards-tabs`;
- `accounts-cards-standardization`;
- `accounts-cards-action-menus`.

Os arquivos históricos desses adapters podem permanecer temporariamente como referência/depreciação, mas não fazem parte do fluxo servido. A cobertura visual de aposentadoria continua obrigatória para provar que suas responsabilidades equivalentes não foram perdidas.

## Cartões A3 sem pós-processamento final

A Issue #610 migrou `/cartoes` para `cards-page-v2.ts` e para o arquétipo A3. O renderer emite diretamente a hierarquia `cartão → fatura → compras`, incluindo seleção, filtros, ordenação, agrupamento, subtotais, moeda e liquidação.

`/cartoes` também não deve voltar ao pipeline. Os adapters históricos `card-list-sorting`, `card-instrument-subtotals`, `cards-interface` e `cards-interface-finalizer` permanecem apenas como referência/depreciação e com evidence de aposentadoria no gate visual.

## Extrato A2 e adapter residual

A Issue #609 migrou `/lancamentos` para `transactions-page-v2.ts` e para a composição A2 de `statement-list-archetype.ts`. `statement-list-sorting` e `statement-insight-context` saíram do pipeline.

O adapter residual `account-remuneration-disclosure` permanece temporariamente porque também carrega runtime já entregue de seleção em massa e administração avançada de agrupamentos. Seu critério de retirada é mover essas responsabilidades para contratos estruturados sem perda de teclado, foco, labels ou operações existentes.

## Ordem do pipeline

`applyLegacyHtmlPostProcessorPipeline()` valida a sequência recebida contra o inventário antes de executar qualquer transformação. Uma etapa faltante, extra ou fora de ordem falha antes de modificar o HTML.

O fluxo normal das rotas ainda inventariadas permanece:

1. o renderer produz o HTML base;
2. adapters residuais são aplicados na ordem canônica;
3. `sendHtml()` executa a finalização comum do documento.

Rotas sem entradas no inventário, como `/cartoes` e `/contas-cartoes`, não devem criar pipeline vazio para manter a forma antiga.

## Guardrail de CI

`legacy-html-post-processors:check`, executado por `npm test`, falha quando inventário, orçamento, despacho, ordem ou bindings deixam de representar o pipeline real. O teste canônico exige budget **2** e garante que `/cartoes` e `/contas-cartoes` permaneçam fora do inventário.

Nas superfícies cobertas, adicionar pós-processamento textual fora do pipeline deixa de ser uma extensão silenciosa: qualquer exceção exige alterar inventário/orçamento e o contrato estrutural de forma auditável.

## Critério de remoção por cluster

Uma etapa pode sair do inventário quando, na mesma mudança:

1. sua semântica é calculada antes do render ou renderizada diretamente por componente/layout;
2. testes da rota cobrem o comportamento final equivalente, incluindo fallback relevante;
3. acessibilidade e responsividade continuam cobertas quando aplicáveis;
4. o adapter deixa de ser importado e chamado pelo roteador;
5. `LEGACY_HTML_POST_PROCESSOR_BUDGET` é reduzido;
6. este documento é atualizado;
7. se o adapter fornecia CSS/runtime registrado no contrato SSR, `apps/web/src/dev-server/ssr-style-contract.ts` é atualizado na mesma mudança;
8. `legacyProcessorRetirementCoverage` continua vinculando a responsabilidade histórica a evidência Chrome final.

## Relação com a arquitetura

Este contrato materializa a direção da ADR 0014 e de `docs/APP_SHELL.md`: HTML final não é uma API de extensão para features novas. O pipeline existe apenas como ponte de compatibilidade mensurável até que cada responsabilidade migre para composição estruturada.
