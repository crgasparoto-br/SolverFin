# Pós-processadores HTML legados do SSR

## Objetivo

Este documento governa a retirada incremental dos adapters que recebem HTML já renderizado e o transformam por string/regex no despacho central de `apps/web/src/dev-server.ts`.

A fonte canônica executável é `apps/web/src/dev-server/legacy-html-post-processors.ts`. O inventário abaixo descreve o baseline da issue #604; o código tipado define IDs, rota, ordem, dono, classificação, critério de substituição e fallback/acessibilidade de cada etapa.

O escopo é deliberadamente o pipeline residual do roteador SSR. Funções internas de renderização que geram strings HTML continuam sendo renderers; elas não passam a ser classificadas como pós-processadores apenas por trabalharem com strings.

## Regra de transição

Novas features não devem introduzir pós-processadores de HTML final como mecanismo padrão de extensão. Nova semântica deve existir antes do render, preferencialmente em ViewModel/schema ou em props/slots de componentes/layouts.

Um adapter legado pode permanecer apenas enquanto tiver:

- ID e rota no inventário canônico;
- ordem explícita no pipeline;
- dono de domínio responsável pela migração;
- responsabilidade delimitada;
- caminho de migração;
- critério objetivo de substituição;
- contrato de fallback e acessibilidade.

Os valores de `owner` representam o domínio web responsável pelo adapter (`web-accounts-cards`, `web-categories`, `web-cards`, `web-statement` ou `web-inbox`). A retirada ou transferência de responsabilidade deve atualizar o owner no mesmo change set para que não exista legado sem responsável explícito.

`LEGACY_HTML_POST_PROCESSOR_BUDGET` começa em **13**. A expectativa é monotônica: cada migração concluída remove a etapa correspondente e reduz o orçamento. Aumentar esse número exige uma alteração explícita do contrato e não é o caminho normal para uma feature nova.

## Classificações

- `component-props-slots`: a responsabilidade deve ser absorvida pelo renderer/componente estrutural.
- `view-model-schema`: ordenação, agregação, payload ou contexto devem ser resolvidos antes do render.
- `temporary-processor`: somente compatibilidade transitória sem substituto estrutural pronto; deve continuar com ordem e critério de remoção explícitos.

## Inventário do baseline

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
| `/lancamentos`    |     1 | `web-statement`      | `statement-list-sorting`          | Reordenar linhas/apresentação do extrato.                    | `view-model-schema`     |
| `/lancamentos`    |     2 | `web-statement`      | `account-remuneration-disclosure` | Adicionar disclosure de remuneração.                         | `view-model-schema`     |
| `/lancamentos`    |     3 | `web-statement`      | `statement-insight-context`       | Acoplar contexto de insights ao extrato.                     | `view-model-schema`     |
| `/inbox`          |     1 | `web-inbox`          | `inbox-structured-payload`        | Buscar e acoplar payload estruturado aos itens.              | `view-model-schema`     |
| `/inbox`          |     2 | `web-inbox`          | `inbox-list-layout`               | Reorganizar layout/lista final.                              | `component-props-slots` |

Os critérios completos de substituição e os fallbacks ficam no inventário TypeScript para que testes e revisão trabalhem sobre a mesma fonte.

## Ordem do pipeline

`applyLegacyHtmlPostProcessorPipeline()` valida a sequência recebida contra o inventário antes de executar qualquer transformação. Uma etapa faltante, extra ou fora de ordem falha antes de modificar o HTML.

O despacho mantém a ordem observada antes da issue #604:

1. o renderer produz o HTML base da rota;
2. adapters residuais são aplicados na ordem canônica da rota;
3. `sendHtml()` continua sendo a finalização comum do documento.

A Inbox preserva a mesma regra mesmo tendo uma primeira etapa assíncrona: o payload estruturado é acoplado antes do adapter de layout.

## Guardrail de CI

`scripts/validate-legacy-html-post-processors.mjs` roda em `npm test` e verifica o despacho real de `dev-server.ts`.

O gate falha quando:

- uma entrada do inventário deixa de ter import correspondente no roteador;
- o orçamento diverge da quantidade inventariada;
- IDs, owners ou ordens deixam de ser determinísticos;
- uma rota inventariada deixa de passar por `applyLegacyHtmlPostProcessorPipeline()`;
- uma função residual inventariada deixa de ser invocada exatamente uma vez no `transform` explícito do pipeline;
- qualquer função, independentemente do nome do arquivo ou do export, consome HTML produzido por `render*`/pipeline fora de `applyLegacyHtmlPostProcessorPipeline()` e `sendHtml()`;
- o HTML base de um pipeline legado deixa de vir diretamente de um renderer;
- a lista de IDs passada ao pipeline diverge do inventário da rota.

O guardrail combina o walker estrutural principal com uma segunda passagem lexical por bindings/escopos. Em conjunto, elas cobrem declarações e expressões de função, arrow functions, métodos, construtores e accessors, inclusive closures que capturam HTML renderizado do escopo externo. A propagação acompanha identificadores, propriedades diretas ou computadas de objetos, aliases diretos ou por spread, destructuring e posições de arrays antes de avaliar chamadas, concatenações e templates. Os self-tests variam essas formas junto com `return`, loops, `replace`/`replaceAll`, nomes neutros, shadowing de parâmetro permitido e o fluxo canônico permitido.

Assim, adicionar mais pós-processamento textual deixa de ser uma extensão silenciosa: qualquer exceção exige alterar inventário/orçamento e o contrato estrutural de forma auditável.

## Critério de remoção por cluster

Uma etapa pode sair do inventário quando, na mesma mudança:

1. sua semântica é calculada antes do render ou renderizada diretamente por componente/layout;
2. testes da rota cobrem o comportamento final equivalente, incluindo o fallback relevante;
3. acessibilidade e responsividade continuam cobertas quando aplicáveis;
4. o adapter deixa de ser importado e chamado pelo roteador;
5. `LEGACY_HTML_POST_PROCESSOR_BUDGET` é reduzido;
6. este documento é atualizado para refletir o legado restante e o ownership residual;
7. se o adapter removido fornecia CSS/runtime registrado no contrato SSR, `apps/web/src/dev-server/ssr-style-contract.ts` e seus testes são atualizados na mesma mudança.

A remoção não deve criar modo SSR especial novo. O fluxo normal continua sendo o alvo de validação.

## Relação com a arquitetura

Este contrato operacional materializa a direção definida na ADR 0014 e em `docs/APP_SHELL.md`: HTML final não é uma API de extensão para features novas. O pipeline existe apenas como ponte de compatibilidade mensurável até que cada responsabilidade migre para composição estruturada.
