# Pós-processadores HTML legados do SSR

## Objetivo

Este documento governa a retirada incremental dos adapters que recebem HTML já renderizado e o transformam por string/regex no despacho central de `apps/web/src/dev-server.ts`.

A fonte canônica executável é `apps/web/src/dev-server/legacy-html-post-processors.ts`. O código tipado define IDs, rota, ordem, dono, classificação, critério de substituição e fallback/acessibilidade de cada etapa.

Funções internas de renderização que geram strings HTML continuam sendo renderers; elas não passam a ser classificadas como pós-processadores apenas por trabalharem com strings.

## Regra de transição

Novas features não devem introduzir pós-processadores de HTML final como mecanismo padrão de extensão. Nova semântica deve existir antes do render, preferencialmente em ViewModel/schema ou em props/slots de componentes/layouts.

Um adapter legado pode permanecer apenas enquanto tiver ID, rota, ordem, dono, responsabilidade, caminho de migração, critério de substituição e fallback/acessibilidade explícitos no inventário canônico.

`LEGACY_HTML_POST_PROCESSOR_BUDGET` é monotônico e acompanha exatamente a quantidade de entradas residuais. Na migração da Issue #609, o orçamento passa a **9**: `statement-list-sorting` e `statement-insight-context` saem do pipeline de `/lancamentos` porque ordenação, busca e contexto de insight passaram a ser resolvidos antes do render pelo renderer A2.

## Classificações

- `component-props-slots`: a responsabilidade deve ser absorvida pelo renderer/componente estrutural.
- `view-model-schema`: ordenação, agregação, payload ou contexto devem ser resolvidos antes do render.
- `temporary-processor`: compatibilidade transitória enquanto a substituição estrutural final ainda precisa preservar comportamento já entregue.

## Inventário residual

| Rota              | Ordem | Dono                 | ID                                | Responsabilidade                                             | Migração                |
| ----------------- | ----: | -------------------- | --------------------------------- | ------------------------------------------------------------ | ----------------------- |
| `/contas-cartoes` |     1 | `web-accounts-cards` | `accounts-cards-tabs`             | Completar filtros, estilos e runtime das abas após o render. | `component-props-slots` |
| `/contas-cartoes` |     2 | `web-accounts-cards` | `accounts-cards-standardization`  | Normalizar markup/classes da master.                         | `component-props-slots` |
| `/contas-cartoes` |     3 | `web-accounts-cards` | `accounts-cards-action-menus`     | Montar menus de ações, estilos e runtime.                    | `component-props-slots` |
| `/categorias`     |     1 | `web-categories`     | `categories-icons-tooltips`       | Decorar categorias com ícones e tooltips.                    | `component-props-slots` |
| `/cartoes`        |     1 | `web-cards`          | `card-list-sorting`               | Reordenar a lista de cartões.                                | `view-model-schema`     |
| `/cartoes`        |     2 | `web-cards`          | `card-instrument-subtotals`       | Inserir subtotais por instrumento.                           | `view-model-schema`     |
| `/cartoes`        |     3 | `web-cards`          | `cards-interface`                 | Completar estrutura/runtime da interface.                    | `component-props-slots` |
| `/cartoes`        |     4 | `web-cards`          | `cards-interface-finalizer`       | Aplicar ajustes finais dependentes do markup.                | `component-props-slots` |
| `/lancamentos`    |     1 | `web-statement`      | `account-remuneration-disclosure` | Preservar temporariamente seleção em massa, agrupamentos e disclosure de remuneração enquanto o último runtime é extraído do legado. | `temporary-processor` |

Os critérios completos de substituição e os fallbacks ficam no inventário TypeScript para que testes e revisão trabalhem sobre a mesma fonte.

## Extrato A2 e adapter residual

A Issue #609 migra `/lancamentos` para `transactions-page-v2.ts` e para a composição A2 de `statement-list-archetype.ts`. A rota agora calcula antes do render:

- busca textual;
- ordenação por data, valor ou descrição;
- contexto de insight por categoria/estabelecimento;
- agrupamento visual por data operacional;
- contexto explícito de conta, período e moeda.

Por isso, `statement-list-sorting` e `statement-insight-context` não podem voltar ao pipeline da rota.

O único adapter ainda permitido em `/lancamentos` é `account-remuneration-disclosure`. Apesar do nome histórico, ele permanece temporariamente porque também carrega o runtime já entregue de seleção em massa e administração avançada de agrupamentos. Seu critério de retirada é mover seleção em massa, edição de agrupamentos e disclosure de remuneração para contratos estruturados do renderer A2 sem perda de teclado, foco, labels ou operações existentes.

## Ordem do pipeline

`applyLegacyHtmlPostProcessorPipeline()` valida a sequência recebida contra o inventário antes de executar qualquer transformação. Uma etapa faltante, extra ou fora de ordem falha antes de modificar o HTML.

O fluxo normal permanece:

1. o renderer produz o HTML base da rota;
2. adapters residuais inventariados são aplicados na ordem canônica;
3. `sendHtml()` executa a finalização comum do documento.

Rotas que já não possuem entradas no inventário não devem criar um pipeline vazio apenas para manter a forma antiga.

## Guardrail de CI

O script `legacy-html-post-processors:check`, executado por `npm test`, combina os passes estruturais e lexicais do repositório. O gate falha quando inventário, orçamento, despacho, ordem ou bindings deixam de representar o pipeline real.

Nas superfícies cobertas, adicionar pós-processamento textual fora do pipeline deixa de ser uma extensão silenciosa: qualquer exceção exige alterar inventário/orçamento e o contrato estrutural de forma auditável.

## Critério de remoção por cluster

Uma etapa pode sair do inventário quando, na mesma mudança:

1. sua semântica é calculada antes do render ou renderizada diretamente por componente/layout;
2. testes da rota cobrem o comportamento final equivalente, incluindo fallback relevante;
3. acessibilidade e responsividade continuam cobertas quando aplicáveis;
4. o adapter deixa de ser importado e chamado pelo roteador;
5. `LEGACY_HTML_POST_PROCESSOR_BUDGET` é reduzido;
6. este documento é atualizado para refletir o legado restante;
7. se o adapter fornecia CSS/runtime registrado no contrato SSR, `apps/web/src/dev-server/ssr-style-contract.ts` é atualizado na mesma mudança.

## Relação com a arquitetura

Este contrato materializa a direção da ADR 0014 e de `docs/APP_SHELL.md`: HTML final não é uma API de extensão para features novas. O pipeline existe apenas como ponte de compatibilidade mensurável até que cada responsabilidade migre para composição estruturada.
