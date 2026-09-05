# Fronteiras de UI — Contas e Cartões

Este documento registra a arquitetura atual da rota `/contas-cartoes` após a migração da issue #612 para o arquétipo A3 master-detail.

## Arquitetura da rota

O contrato público continua sendo `renderAccountsCardsPage`, mas a implementação é composta em `apps/web/src/dev-server/accounts-cards/`:

- `types.ts`: contratos de dados consumidos pela tela;
- `view-model.ts`: coleção unificada de contas/cartões, seleção do recurso, labels, busca e contexto de moeda;
- `presentation.ts`: formatação e pequenas primitivas de apresentação;
- `components.ts`: master único, detalhe contextual, instrumentos e ações;
- `dialogs.ts`: criação/edição de conta, cartão e instrumento;
- `runtime.ts`: formulários, busca/filtro, confirmação destrutiva, dialogs, foco e máscara monetária;
- `styles.ts`: estilos específicos da rota;
- `page.ts`: fetch, estados da página e composição SSR;
- `accounts-cards-page.ts`: facade de compatibilidade para imports existentes.

A rota usa diretamente as primitives da Fase 3B, em especial `PageContainer`, `PageHeader`, `DetailLayout`, `Dialog`, `EmptyState`, `Loading`, `RecoverableError` e `UnavailableState`.

## Composição A3

`/contas-cartoes` não usa mais abas para separar contas e cartões. A coluna master apresenta uma única coleção de recursos financeiros. A seleção é endereçável por `?resource=account:<id>` ou `?resource=card:<id>` e o detalhe mantém o recurso escolhido visível sem perder o contexto da lista.

Para contas, o detalhe mantém instituição, tipo, moeda, agência/conta, saldo inicial e estado. Para cartões, mantém instituição, bandeira, conta de pagamento, fechamento/vencimento, moeda, limite e instrumentos internos.

A moeda nunca é inferida silenciosamente:

- conta: usa a moeda declarada no próprio cadastro;
- cartão: usa a moeda da conta de pagamento vinculada;
- sem uma moeda determinável, a interface mostra `Moeda indisponível`/`moeda indisponível` em vez de assumir BRL.

Limites de cartão e instrumento seguem o mesmo contexto monetário da conta de pagamento.

## Ações e dialogs

Criação e edição permanecem no contexto da tela por dialogs. As ações primárias são diretas no detalhe; ações destrutivas usam o dialog de confirmação da própria rota e não `window.confirm`.

Ao abrir um dialog por teclado ou mouse, o foco entra no dialog e retorna ao acionador ao fechar. Cancelar uma confirmação destrutiva não dispara request. Durante uma gravação, a rota apresenta estado de loading e mantém erro recuperável no próprio formulário em caso de falha.

Os instrumentos ficam dentro do detalhe do cartão correspondente. Cadastro, edição, definição de default e arquivamento continuam usando os endpoints existentes; a issue #612 não altera o modelo de instrumentos.

## Pós-processamento legado aposentado

A rota não passa mais por `applyLegacyHtmlPostProcessorPipeline()`. As responsabilidades dos três adapters históricos foram absorvidas pela composição estruturada:

1. `accounts-cards-tabs`: substituído pelo master unificado, seleção por recurso e filtros próprios;
2. `accounts-cards-standardization`: substituído pelo markup A3 emitido diretamente pelos componentes;
3. `accounts-cards-action-menus`: substituído pelas ações diretas, dialogs e confirmação estruturada.

Os módulos históricos podem permanecer temporariamente no repositório como referência/depreciação, mas não fazem parte do fluxo servido de `/contas-cartoes`. A evidência de aposentadoria continua no contrato visual por `legacyProcessorRetirementCoverage` para impedir perda silenciosa de responsabilidade.

## Responsividade e acessibilidade

No desktop, `DetailLayout` mantém master e detalhe lado a lado. No mobile, a composição empilha sem scroll horizontal acidental. O gate visual cobre 1440×900, 1366×768 e 390×844, incluindo conteúdo longo, busca vazia, foco/teclado, dialog e ações.

O estado de perfil novo mostra `Nenhuma conta ou cartão cadastrado` no master e `Selecione um recurso` no detalhe.

## Validação

O recorte é protegido por:

- testes do renderer/view-model para seleção A3 e moeda explícita, incluindo USD e moeda indisponível;
- `ui-boundaries:check` para as fronteiras dos módulos;
- `legacy-html-post-processors:check`, que exige budget residual 2 e proíbe o retorno da rota ao pipeline;
- contrato SSR, que exige o marcador A3 e CSS da própria rota sem providers runtime aposentados;
- `accounts-cards-interface.mjs`, que executa o fluxo A3 real e produz evidência de `DetailLayout`, `Dialog`, desktop/mobile e responsabilidades legadas substituídas;
- `issue-606-accounts-cards-empty.mjs` para o estado vazio de perfil novo;
- suite, lint, typecheck e build do workspace Web.

## Referências

- issue #612;
- issue #607 — separação das fronteiras internas da tela;
- issue #604 — mecanismo de migração dos pós-processadores;
- `docs/DESIGN_SYSTEM.md`;
- `docs/SCREEN_ARCHETYPES.md`;
- `docs/adr/0014-incremental-component-ui-architecture.md`;
- `docs/LEGACY_HTML_POST_PROCESSORS.md`.
