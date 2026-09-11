# Fronteiras de UI — Contas e Cartões

Este documento registra a arquitetura atual da rota `/contas-cartoes` após a migração da issue #612 para o arquétipo A3 master-detail, a evolução da issue #654 para filtragem explícita por tipo de recurso e moeda e a issue #659 para persistência do estado dos filtros durante a navegação.

## Arquitetura da rota

O contrato público continua sendo `renderAccountsCardsPage`, mas a implementação é composta em `apps/web/src/dev-server/accounts-cards/`:

- `types.ts`: contratos de dados consumidos pela tela;
- `view-model.ts`: coleção unificada de contas/cartões, seleção do recurso, labels, busca e contexto de moeda;
- `presentation.ts`: formatação e pequenas primitivas de apresentação;
- `components.ts`: master único, filtros de tipo/moeda, detalhe contextual, instrumentos e ações;
- `dialogs.ts`: conteúdo dos fluxos de criação/edição, sempre composto pela primitive compartilhada `renderDialog`;
- `runtime.ts`: formulários, filtros combinados de busca/tipo/moeda/status, persistência dos filtros no contexto da aba, confirmação destrutiva e máscara monetária; não possui controller genérico de dialogs;
- `styles.ts`: estilos específicos do conteúdo da rota, sem duplicar a superfície modal da fundação;
- `page.ts`: fetch, estados da página, composição SSR e inclusão única do controller compartilhado de UI;
- `accounts-cards-page.ts`: facade de compatibilidade para imports existentes.

A rota usa diretamente as primitives da Fase 3B, em especial `PageContainer`, `PageHeader`, `DetailLayout`, `Dialog`, `DialogTrigger`, `EmptyState`, `Loading`, `RecoverableError` e `UnavailableState`. A abertura, fechamento por `Escape` e restauração de foco dos dialogs de criação/edição são responsabilidade de `renderSolverFinUiInteractionsScriptTag()`; a rota não implementa um controller modal concorrente.

## Composição A3 e filtros

`/contas-cartoes` não usa abas para separar contas e cartões. A coluna master apresenta uma única coleção de recursos financeiros. A seleção é endereçável por `?resource=account:<id>` ou `?resource=card:<id>` e o detalhe mantém o recurso escolhido visível sem perder o contexto da lista.

A separação operacional entre os recursos ocorre por filtros explícitos no próprio master:

- **Buscar**: nome, instituição, identificadores, bandeira e moeda;
- **Tipo**: `Todos`, `Contas` ou `Cartões`;
- **Moeda**: `Todas as moedas`, os códigos existentes na coleção atual e `Moeda indisponível` quando houver recurso sem moeda determinável;
- **Status**: `Todos`, `Ativos` ou `Inativos`.

Os quatro filtros são cumulativos. Alterar um filtro não descarta os demais, e retornar todos aos valores neutros restaura a coleção completa. Quando a combinação não encontra recursos, o estado vazio orienta a ajustar busca, tipo, moeda ou status. Os filtros usam controles nativos e permanecem operáveis por teclado.

### Persistência dos filtros

O estado corrente de **Buscar**, **Tipo**, **Moeda** e **Status** é persistido em `sessionStorage` pela chave versionada `solverfin:accounts-cards:filters:v1`. O escopo é a aba atual: o estado sobrevive a reload, seleção por `?resource=...` e navegação para outra rota do SolverFin seguida de retorno, sem transformar os filtros em preferência permanente entre sessões independentes.

Os próprios valores dos quatro controles continuam sendo a representação efetiva usada por `applyFilters()`. O estado persistido serve somente para restaurar esses controles antes da primeira aplicação dos filtros; não existe uma segunda pipeline de filtragem. Valores de `Tipo`, `Moeda` ou `Status` que não existam mais entre as opções atuais degradam para `all`; payload ausente ou inválido mantém os valores neutros. Limpar um filtro grava imediatamente seu valor neutro sem alterar os demais, e limpar todos grava o estado neutro completo.

A persistência não inclui seleção. O parâmetro `resource` continua sendo a única autoridade para o detalhe. Se o recurso indicado continuar elegível após a restauração, a seleção permanece visível; se os filtros o excluírem, a seleção visual é limpa e o detalhe neutro `Selecione um recurso` é exibido, sem selecionar silenciosamente outro item.

Se o recurso selecionado continuar elegível, seleção e detalhe são preservados. Se qualquer filtro o excluir, a seleção visível é limpa e o detalhe passa para `Selecione um recurso`; limpar os filtros depois disso não seleciona o recurso anterior nem qualquer outro automaticamente. Uma nova seleção exige ação explícita do usuário.

Para contas, o detalhe mantém instituição, tipo, moeda, agência/conta, saldo inicial e estado. Para cartões, mantém instituição, bandeira, conta de pagamento, fechamento/vencimento, moeda, limite e instrumentos internos.

A moeda nunca é inferida silenciosamente:

- conta: usa a moeda declarada no próprio cadastro;
- cartão: usa exclusivamente `Card.currency`, persistida no cartão;
- a conta de pagamento vinculada não é fallback runtime para a moeda do cartão;
- cartão legado sem `Card.currency` permanece como `Moeda indisponível` no master/filtro e deve ser corrigido pela edição do cartão, sem assumir BRL.

Limites do cartão e de seus instrumentos usam o contexto monetário de `Card.currency`. Enquanto não existir conversão cambial, o domínio mantém separadamente a regra de compatibilidade entre a moeda do cartão e a conta de pagamento vinculada.

## Ações e dialogs

Criação e edição permanecem no contexto da tela por dialogs. Os acionadores são produzidos por `renderDialogTrigger` e as superfícies por `renderDialog`; o comportamento genérico vem do controller compartilhado da Fase 3B. As ações primárias são diretas no detalhe.

A confirmação destrutiva também usa markup da primitive `Dialog`, embora sua decisão assíncrona (confirmar/cancelar antes do request) continue sendo orquestrada pela rota. Essa lógica é específica da operação destrutiva e não substitui nem duplica o controller genérico de abertura/fechamento dos dialogs de CRUD.

Ao abrir um dialog de criação/edição por teclado ou mouse, o foco entra no dialog e retorna ao acionador ao fechar. Cancelar uma confirmação destrutiva não dispara request e devolve o foco ao controle que a iniciou. Durante uma gravação, a rota apresenta estado de loading e mantém erro recuperável no próprio formulário em caso de falha.

Os instrumentos ficam dentro do detalhe do cartão correspondente. Cadastro, edição, definição de default e arquivamento continuam usando os endpoints existentes; as issues #612, #654 e #659 não alteram o modelo de instrumentos.

## Pós-processamento legado aposentado

A rota não passa mais por `applyLegacyHtmlPostProcessorPipeline()`. As responsabilidades dos três adapters históricos foram absorvidas pela composição estruturada:

1. `accounts-cards-tabs`: substituído pelo master unificado, seleção por recurso e filtros próprios;
2. `accounts-cards-standardization`: substituído pelo markup A3 emitido diretamente pelos componentes;
3. `accounts-cards-action-menus`: substituído pelas ações diretas, dialogs e confirmação estruturada.

Os módulos históricos podem permanecer temporariamente no repositório como referência/depreciação, mas não fazem parte do fluxo servido de `/contas-cartoes`. A evidência de aposentadoria continua no contrato visual por `legacyProcessorRetirementCoverage` para impedir perda silenciosa de responsabilidade.

## Responsividade e acessibilidade

No desktop, `DetailLayout` mantém master e detalhe lado a lado. Os filtros usam busca em largura total seguida de tipo, moeda e status. Em larguras intermediárias eles refluem para duas colunas; no mobile ficam em uma coluna, sem scroll horizontal acidental. `Dialog` usa os estilos e comportamento responsivo compartilhados da fundação; a rota mantém apenas estilos do conteúdo interno dos formulários e instrumentos.

O gate visual cobre 1440×900, 1366×768 e 390×844, incluindo conteúdo longo, filtros combinados, seleção excluída por filtro, busca vazia, foco/teclado, dialog e ações. A regressão específica da issue #659 exercita desktop e mobile para seleção por `resource`, reload, saída/retorno da rota, limpeza parcial/total e degradação de valores persistidos inválidos. O estado de perfil novo mostra `Nenhuma conta ou cartão cadastrado` no master e `Selecione um recurso` no detalhe.

## Validação

O recorte é protegido por:

- testes do renderer/view-model para seleção A3 e moeda explícita, incluindo USD e `Card.currency` ausente;
- teste focado de filtros que exige metadados de tipo/moeda, labels `Todas as moedas`/`Moeda indisponível`, combinação de busca + tipo + moeda + status, persistência/restauração dos quatro controles, fallback neutro para valores obsoletos e limpeza de seleção quando o mestre selecionado é excluído;
- `ui-boundaries:check`, que exige `renderDialog`, `renderDialogTrigger` e o controller compartilhado e rejeita controller/CSS modal específico da rota;
- teste de manutenção da rota, que exige `data-sf-dialog-open`, `data-sf-dialog-close` e o script compartilhado na saída SSR;
- `legacy-html-post-processors:check`, que exige budget residual 2 e proíbe o retorno da rota ao pipeline;
- contrato SSR, que exige o marcador A3 e CSS da própria rota sem providers runtime aposentados;
- `accounts-cards-interface.mjs`, que executa o fluxo A3 real e produz evidência de `DetailLayout`, ausência de tabs, filtros de tipo/moeda combinados, limpeza do detalhe ao excluir a seleção, `Dialog`, desktop/mobile e responsabilidades legadas substituídas;
- `issue-659-accounts-cards-filter-persistence.mjs`, executado por `qa:statement-visual`, que prova em Chrome a persistência/restauração após `resource`, reload e navegação, a limpeza individual/total e o fallback neutro para estado persistido inválido em desktop e mobile;
- `issue-606-accounts-cards-empty.mjs` para o estado vazio de perfil novo;
- suite, lint, typecheck e build do workspace Web.

## Referências

- issue #659 — persistência dos filtros da coleção master durante a navegação;
- issue #655 — `Card.currency` como fonte canônica da moeda do cartão;
- issue #654 — separação por filtro de tipo e filtro de moeda;
- issue #612 — migração para A3 master-detail;
- issue #607 — separação das fronteiras internas da tela;
- issue #604 — mecanismo de migração dos pós-processadores;
- `docs/CARDS.md`;
- `docs/UI_PRIMITIVES.md`;
- `docs/DESIGN_SYSTEM.md`;
- `docs/SCREEN_ARCHETYPES.md`;
- `docs/adr/0014-incremental-component-ui-architecture.md`;
- `docs/LEGACY_HTML_POST_PROCESSORS.md`.
