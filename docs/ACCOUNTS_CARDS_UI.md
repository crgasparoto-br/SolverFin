# Fronteiras de UI — Contas e Cartões

Este documento registra a arquitetura atual da rota `/contas-cartoes` após a migração da issue #612 para o arquétipo A3 master-detail.

## Arquitetura da rota

O contrato público continua sendo `renderAccountsCardsPage`, mas a implementação é composta em `apps/web/src/dev-server/accounts-cards/`:

- `types.ts`: contratos de dados consumidos pela tela;
- `view-model.ts`: coleção unificada de contas/cartões, seleção do recurso, labels, busca e contexto de moeda;
- `presentation.ts`: formatação e pequenas primitivas de apresentação;
- `components.ts`: master único, detalhe contextual, instrumentos e ações;
- `dialogs.ts`: conteúdo dos fluxos de criação/edição, sempre composto pela primitive compartilhada `renderDialog`;
- `runtime.ts`: formulários, busca/filtro, confirmação destrutiva e máscara monetária; não possui controller genérico de dialogs;
- `styles.ts`: estilos específicos do conteúdo da rota, sem duplicar a superfície modal da fundação;
- `page.ts`: fetch, estados da página, composição SSR e inclusão única do controller compartilhado de UI;
- `accounts-cards-page.ts`: facade de compatibilidade para imports existentes.

A rota usa diretamente as primitives da Fase 3B, em especial `PageContainer`, `PageHeader`, `DetailLayout`, `Dialog`, `DialogTrigger`, `EmptyState`, `Loading`, `RecoverableError` e `UnavailableState`. A abertura, fechamento por `Escape` e restauração de foco dos dialogs de criação/edição são responsabilidade de `renderSolverFinUiInteractionsScriptTag()`; a rota não implementa um controller modal concorrente.

## Composição A3

`/contas-cartoes` não usa mais abas para separar contas e cartões. A coluna master apresenta uma única coleção de recursos financeiros. A seleção é endereçável por `?resource=account:<id>` ou `?resource=card:<id>` e o detalhe mantém o recurso escolhido visível sem perder o contexto da lista.

Para contas, o detalhe mantém instituição, tipo, moeda, agência/conta, saldo inicial e estado. Para cartões, mantém instituição, bandeira, conta de pagamento, fechamento/vencimento, moeda, limite e instrumentos internos.

A moeda nunca é inferida silenciosamente:

- conta: usa a moeda declarada no próprio cadastro;
- cartão: usa a moeda da conta de pagamento vinculada;
- sem uma moeda determinável, a interface mostra `Moeda indisponível`/`moeda indisponível` em vez de assumir BRL.

Limites de cartão e instrumento seguem o mesmo contexto monetário da conta de pagamento.

## Ações e dialogs

Criação e edição permanecem no contexto da tela por dialogs. Os acionadores são produzidos por `renderDialogTrigger` e as superfícies por `renderDialog`; o comportamento genérico vem do controller compartilhado da Fase 3B. As ações primárias são diretas no detalhe.

A confirmação destrutiva também usa markup da primitive `Dialog`, embora sua decisão assíncrona (confirmar/cancelar antes do request) continue sendo orquestrada pela rota. Essa lógica é específica da operação destrutiva e não substitui nem duplica o controller genérico de abertura/fechamento dos dialogs de CRUD.

Ao abrir um dialog de criação/edição por teclado ou mouse, o foco entra no dialog e retorna ao acionador ao fechar. Cancelar uma confirmação destrutiva não dispara request e devolve o foco ao controle que a iniciou. Durante uma gravação, a rota apresenta estado de loading e mantém erro recuperável no próprio formulário em caso de falha.

Os instrumentos ficam dentro do detalhe do cartão correspondente. Cadastro, edição, definição de default e arquivamento continuam usando os endpoints existentes; a issue #612 não altera o modelo de instrumentos.

## Pós-processamento legado aposentado

A rota não passa mais por `applyLegacyHtmlPostProcessorPipeline()`. As responsabilidades dos três adapters históricos foram absorvidas pela composição estruturada:

1. `accounts-cards-tabs`: substituído pelo master unificado, seleção por recurso e filtros próprios;
2. `accounts-cards-standardization`: substituído pelo markup A3 emitido diretamente pelos componentes;
3. `accounts-cards-action-menus`: substituído pelas ações diretas, dialogs e confirmação estruturada.

Os módulos históricos podem permanecer temporariamente no repositório como referência/depreciação, mas não fazem parte do fluxo servido de `/contas-cartoes`. A evidência de aposentadoria continua no contrato visual por `legacyProcessorRetirementCoverage` para impedir perda silenciosa de responsabilidade.

## Responsividade e acessibilidade

No desktop, `DetailLayout` mantém master e detalhe lado a lado. No mobile, a composição empilha sem scroll horizontal acidental. `Dialog` usa os estilos e comportamento responsivo compartilhados da fundação; a rota mantém apenas estilos do conteúdo interno dos formulários e instrumentos.

O gate visual cobre 1440×900, 1366×768 e 390×844, incluindo conteúdo longo, busca vazia, foco/teclado, dialog e ações. O estado de perfil novo mostra `Nenhuma conta ou cartão cadastrado` no master e `Selecione um recurso` no detalhe.

## Validação

O recorte é protegido por:

- testes do renderer/view-model para seleção A3 e moeda explícita, incluindo USD e moeda indisponível;
- `ui-boundaries:check`, que exige `renderDialog`, `renderDialogTrigger` e o controller compartilhado e rejeita controller/CSS modal específico da rota;
- teste de manutenção da rota, que exige `data-sf-dialog-open`, `data-sf-dialog-close` e o script compartilhado na saída SSR;
- `legacy-html-post-processors:check`, que exige budget residual 2 e proíbe o retorno da rota ao pipeline;
- contrato SSR, que exige o marcador A3 e CSS da própria rota sem providers runtime aposentados;
- `accounts-cards-interface.mjs`, que executa o fluxo A3 real e produz evidência de `DetailLayout`, `Dialog`, desktop/mobile e responsabilidades legadas substituídas;
- `issue-606-accounts-cards-empty.mjs` para o estado vazio de perfil novo;
- suite, lint, typecheck e build do workspace Web.

## Referências

- issue #612;
- issue #607 — separação das fronteiras internas da tela;
- issue #604 — mecanismo de migração dos pós-processadores;
- `docs/UI_PRIMITIVES.md`;
- `docs/DESIGN_SYSTEM.md`;
- `docs/SCREEN_ARCHETYPES.md`;
- `docs/adr/0014-incremental-component-ui-architecture.md`;
- `docs/LEGACY_HTML_POST_PROCESSORS.md`.
