# Fronteiras de UI — Contas e Cartões

Este documento registra o recorte da issue #607 aplicado à rota `/contas-cartoes`.

## Objetivo do recorte

A rota era renderizada por `apps/web/src/dev-server/accounts-cards-page.ts`, que concentrava acesso à API, preparação de dados, HTML de componentes e dialogs, scripts de interação, estilos e tipos em um único módulo de aproximadamente 53 KB.

A migração preserva o SSR atual e o contrato público `renderAccountsCardsPage`, mas separa responsabilidades reais sob `apps/web/src/dev-server/accounts-cards/`:

- `types.ts`: contratos de dados consumidos pela tela;
- `view-model.ts`: preparação determinística de estado de apresentação, contagens, busca, identificadores e labels;
- `presentation.ts`: formatação e pequenas primitivas de apresentação;
- `components.ts`: composição das linhas/listas de contas, cartões e instrumentos;
- `dialogs.ts`: formulários e dialogs de criação/edição;
- `runtime.ts`: interação no cliente para formulários, abas, filtros, dialogs e máscara monetária;
- `styles.ts`: estilos específicos da rota;
- `page.ts`: orquestra fetch, view-model e composição SSR;
- `accounts-cards-page.ts`: facade de compatibilidade para imports existentes.

A separação não muda regras financeiras, payloads de API, rotas, textos funcionais nem o runtime SSR.

## Legado removido

`accounts-cards-page-dialog-only.ts` foi removido. O módulo criava uma segunda geração da mesma tela chamando o renderer principal e, em seguida, reescrevendo o HTML final por regex/string para mover instrumentos de cartão. Ele não fazia parte do despacho ativo de `dev-server.ts` e representava uma implementação paralela incompatível com a direção da ADR 0014.

O gate `scripts/validate-accounts-cards-ui-boundaries.mjs` protege a ausência desse renderer paralelo e a composição pelas novas fronteiras.

## Legado de transição ainda intencional

A rota continua passando, nesta ordem, pelos três pós-processadores inventariados por #604:

1. `accounts-cards-tabs` (`accounts-cards-enhancement.ts`);
2. `accounts-cards-standardization` (`accounts-cards-standardization.ts`);
3. `accounts-cards-action-menus` (`accounts-cards-action-menu-enhancement.ts`).

Eles permanecem intencionalmente porque ainda são responsáveis pelo contrato final servido e possuem critérios de retirada explícitos em `legacy-html-post-processors.ts`. A issue #607 não substitui silenciosamente esses comportamentos: a retirada deve acontecer quando cada responsabilidade for migrada para componentes/view-models estruturados com cobertura SSR, visual e de acessibilidade equivalente.

## Validação

O recorte é protegido por:

- teste focado de `view-model.ts`, incluindo contagens, busca, vínculo de conta de pagamento e mascaramento de identificadores;
- gate estrutural `npm run ui-boundaries:check`, que impede regressão para o módulo monolítico ou reintrodução do renderer paralelo;
- suite, typecheck, lint e build existentes do workspace Web;
- `legacy-html-post-processors:check` e o contrato SSR existentes, que continuam cobrindo os pós-processadores de transição.

## Referências

- issue #607;
- issue #603 — boundary de view-models;
- issue #604 — mecanismo de migração dos pós-processadores;
- `docs/adr/0014-incremental-component-ui-architecture.md`;
- `docs/ARCHITECTURE.md`.
