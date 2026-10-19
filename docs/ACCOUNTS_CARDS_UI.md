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

## Lista compacta e iconografia (PR #731)

A lista mestre usa colunas `Conta ou cartão | Tipo | Moeda | Saldo inicial / Limite | CDI | Situação`. Na coluna **Tipo**, contas exibem um ícone específico para conta corrente, poupança, dinheiro, investimento ou outros; cartões usam o ícone de cartão. O nome completo do tipo é o `title`/tooltip e o `aria-label` do ícone, sem uma terceira linha textual. A chave de tipo de conta vem do `view-model` e não é inferida do nome traduzido. Identidade institucional, busca, estado CDI e detalhes continuam disponíveis.

No desktop, cada item tem altura mínima de **56 px**, respeitando o logo institucional de 44 px da Golden Screen. No mobile, o tipo e a moeda ocupam a linha secundária compacta; o cabeçalho tabular é ocultado, mas não os dados. Conteúdo longo, tooltips, foco nos links e os controles de filtros devem continuar acessíveis. `Adicionar conta` e `Adicionar cartão` conservam seus rótulos e passam a usar os ícones `wallet` e `credit-card` existentes, sem criar botões ou fluxos novos. A validação Chrome em `accounts-cards-interface.mjs` deve comprovar esses elementos em 1440/1366/390/320 px no SHA final.

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

## Issue #716 — acabamento Golden Screen no cadastro mestre

- A rota conserva o arquétipo A3 e a seleção por `?resource=account:<id>` ou `card:<id>`; não introduz abas ou mistura contas, cartões e instrumentos. A instituição (incluindo fallback do catálogo central) passa a identificar contas **e cartões** no master e no detalhe; a bandeira permanece metadado secundário de cartão.
- O contexto financeiro dominante do detalhe é **Saldo inicial** na conta ou **Limite total** no cartão, acompanhado de moeda nativa. Não é saldo atual calculado e não soma moedas; ausência de moeda permanece declarada. Os demais atributos usam lista compacta sem cards aninhados. Ações de manutenção permanecem associadas ao recurso, e ações destrutivas continuam com confirmação.
- Os modais existentes continuam no controller `Dialog` compartilhado, centralizados, com campos essenciais rotulados, corpo rolável, botões neutros de Cancelar e confirmação primária na mesma linha, teclado/Escape e restauração de foco. Instrumentos possuem ações individuais e não migram para a lista master.
- Verificação: SSR de conta/cartão e instituição sem logo, seleção e moedas distintas, vazio, ações bloqueadas e confirmação; Chrome em 1440×900, 1366×768, 390×844 e 320×740 com detalhe e modal acessíveis sem overflow. Aprovação visual humana e auditoria independente são gates separados dos testes automáticos.

## Diretriz de hierarquia — refatoração orientada à lista (18/10/2026)

A tarefa dominante da rota `/contas-cartoes` é **localizar, comparar e selecionar contas/cartões**, não inspecionar um único detalhe. O arquétipo continua A3, mas a coleção mestre ocupa a maior parte da largura em desktop. O detalhe permanece como contexto auxiliar à direita e fica abaixo da lista em viewports menores.

A listagem mostra em cada linha o nome, a instituição com logo/fallback, o tipo, a moeda nativa, o **saldo inicial da conta** ou o **limite total do cartão** e a situação. Os valores são individuais, sem subtotal cruzando moedas; são diferenciados por rótulo para não confundir saldo atual com saldo inicial. Filtros de busca, tipo, moeda e status continuam cumulativos e com persistência por aba.

O detalhe concentra metadados, edição, operações de manutenção e instrumentos do cartão, sem resumo financeiro gigante duplicado. A seleção continua por `?resource=...`, preservando as ações, os estados de filtro/vazio, os diálogos compartilhados e a restauração de foco. Em mobile, a lista antecede o detalhe, com valores alinhados à direita e sem tabela comprimida. A verificação Chrome exige lista dominante em desktop, valores presentes em cada linha, reflow e ausência de overflow.

### Conformidade visual obrigatória (Golden Screen)

A rota aplica o contrato global de `docs/DESIGN_SYSTEM.md`, a paleta e os estados de `apps/web/src/design-system/tokens.ts` e os controles de `docs/UI_PRIMITIVES.md`. A lista mestre mantém protagonismo; botões de edição são secundários, Cancelar é sempre neutro e Salvar/confirmação são as únicas ações primárias dos formulários. Filtros reutilizam a família de `sf-filter-bar` sem superfície aninhada. A validação Chrome confere o saldo/limite na **linha selecionada** (não o antigo resumo ampliado do detalhe). A documentação global é normativa para todas as telas, não apenas esta rota.

### Identificação de remuneração CDI ativa na lista

Na rota `/contas-cartoes`, somente contas com configuração habilitada no endpoint autenticado `GET /api/account-remuneration/configurations` recebem a indicação discreta `CDI ativo` após o tipo da conta. O vínculo é feito pelo `accountId` no perfil financeiro atual; exige `enabled: true`, `indexKind: cdi`, conta ativa e moeda BRL. Somente configurações habilitadas exibem `CDI ativo`. Com a consulta concluída, contas BRL elegíveis sem ativação exibem `Sem CDI ativo` (não se afirma que existe uma configuração `CDI inativo`); contas arquivadas ou de outras moedas exibem `Não elegível`, e cartões exibem `—` (não se aplica). Se a consulta falhar, contas elegíveis exibem `Não verificado` e um aviso de indisponibilidade, sem presumir desativação. Não há alteração das regras de remuneração, percentuais, saldos ou de agregação monetária.

### Exibição da coluna CDI

Na lista mestre, o indicador de remuneração é visível em **coluna própria `CDI` no desktop** (badge compartilhado `CDI ativo`), de modo que o usuário não precise abrir o detalhe da conta para identificá-lo. A coluna apresenta também `Sem CDI ativo` quando a consulta autenticada confirma ausência de habilitação, `Não elegível` para contas inaptas e `—` para cartões; não confundir ausência de ativação com falha de consulta, sinalizada por `Não verificado`. No mobile, o mesmo estado é condensado na linha auxiliar da identidade, preservando espaço para valor e situação. A origem continua sendo a configuração autenticada da conta, vinculada pelo ID e filtrada por elegibilidade. A alteração estará visível somente quando a versão da PR #723 for executada (não está em `develop` até o merge autorizado).

### Evidência operacional de CDI e isolamento (#716)

O gate Chrome `accounts-cards-interface.mjs` conserva cenários simulados para cancelamento, erro e retry, mas agora executa também uma alternância **real** de CDI em conta de teste ativa BRL, usando sessão autenticada e a API existente: ativação por switch, novo GET autenticado, reload SSR com coluna CDI, desativação e nova conferência de persistência. O teste registra o resultado por SHA e tenta excluir a conta auxiliar depois de deixar a configuração desativada. Isso verifica a ligação browser → API → banco, não apenas o conteúdo do request simulado.

A suíte de integração da API exercita sem token (GET/PUT = 401), seleção de perfil não autorizado (403), conta fora do escopo (404), ausência de mutação após tentativas negadas, bloqueio de moeda/arquivo com CDI ativo e persistência de parâmetros ao desativar/reativar. A verificação visual/mockada não substitui as provas de autorização da API. São exigidas evidências de execução e CI no SHA material antes de declarar a matriz aprovada.

### Controles contextuais do detalhe (#716)

A seção de ações de conta e cartão segue o padrão Golden Screen: **Editar, Arquivar, Excluir e Adicionar instrumento** (quando aplicável) usam **somente ícones compartilhados**, com `title` como tooltip nativo e `aria-label` textual, além de foco visível e alvo de toque de no mínimo 40 px. Arquivamento e exclusão continuam utilizando a confirmação compartilhada; não há alteração de permissões nem de API. Os formulários de cadastro/edição mantêm seus botões textuais de Cancelar/Salvar.

Na conta selecionada, o antigo link **Remuneração CDI** foi substituído pelo controle compacto **CDI** de função `switch` com `aria-checked` e rótulo de estado. Somente contas **ativas em BRL** com consulta de configurações disponível permitem alternar o flag. Contas arquivadas, outras moedas ou erro na consulta apresentam flag desabilitado e o motivo explícito. O cartão não apresenta esse controle.

Ao acionar o switch, o navegador consulta novamente `GET /api/account-remuneration/configurations` para evitar gravar sobre um estado SSR defasado. Na ativação, a confirmação informa o percentual e a data inicial: usa os valores armazenados quando disponíveis ou, para conta sem configuração, **100% e a data local corrente**, conforme padrão existente na tela de remuneração. Na desativação, os mesmos campos e a categoria existentes são reenviados para preservação. Somente após confirmação, envia `PUT /api/account-remuneration/configurations/:accountId` e atualiza o estado ao receber resposta positiva. Cancelamento não envia PUT; falha ou perda de conectividade mantém o estado anterior, exibe erro em `aria-live` e permite repetir. Uma gravação confirmada recarrega a tela para atualizar também o indicador de CDI na lista mestre.

A edição de percentual, data e categoria é acessada pelo **ícone de configurações CDI** (tooltip e nome acessível) ao lado do flag, que abre o modal compartilhado centrado na própria rota `/contas-cartoes`. A rota histórica `/remuneracao-contas` permanece redirecionada e não deve ser usada como entrada operacional. O modal grava esses parâmetros via PUT preservando o estado habilitado atual da conta, sem alterar o flag; mantém dados digitados e o foco durante erro de API. **O switch não edita esses parâmetros implicitamente.** Os testes `golden-716.test.ts` e o cenário Chrome `accounts-cards-interface.mjs` cobrem elegibilidade, acessibilidade, cancelamento, erro recuperável e persistência simulada sem mutar o banco de demonstração.

### Acabamento Golden Screen de ações das subtelas (18/10/2026, PR #723)

Ação contextual não é um texto disfarçado nem um ícone estreito: os detalhes de **contas e cartões** reutilizam os botões `sf-button`, `sf-button-secondary`, `sf-icon-button` e `sf-focus-ring` e suas variáveis `--sf-*`, com alvo de **44 × 44 px**, ícones de **18 × 18 px**, raio e borda neutros, respiro consistente e tooltips e nomes acessíveis. Os estados de repouso, hover, foco por teclado e desabilitado seguem o contrato do Extrato aprovado; `Excluir` recebe apenas a variante semântica de perigo. Ações críticas mantêm o diálogo de confirmação.

No detalhe da **conta**, a remuneração CDI e seu ícone de configuração dividem uma linha com controles proporcionais. Uma segunda barra agrupa **Editar | Arquivar | Excluir** com separador visual discreto antes da manutenção sensível. No detalhe do **cartão**, a barra de mesmo padrão reúne **Editar | Adicionar instrumento | Arquivar | Excluir**, com o mesmo separador. No bloco de **instrumentos do cartão**, as ações **Editar instrumento**, **Definir como padrão** (quando aplicável) e **Arquivar instrumento** também reutilizam a mesma primitiva, dimensões e estados, sem criar uma segunda paleta ou estilo local. Em mobile, as barras fazem reflow sem botões espremidos, largura integral artificial ou overflow. O CDI mantém `role="switch"`, `aria-checked` e aviso `aria-live`, sem alterar a API nem os critérios financeiros.

Critério bloqueante: o teste Chrome `accounts-cards-interface.mjs` inspeciona **tamanhos computados**, ícones, nomes e limites do painel em 1440×900, 1366×768, 390×844 e 320×740, para os detalhes de conta e cartão; o teste SSR `golden-716.test.ts` impede a volta de classes locais incompatíveis com a Golden Screen. Testes visuais devem rodar no SHA exato da PR; não confundir CI verde com aprovação independente.
