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

## Gate de qualidade visual

O gate visual nao serve apenas para provar que a tela renderiza, responde ao viewport e preserva comportamento. Para mudancas de interface, a evidencia final tambem deve sustentar o **contrato de qualidade visual** de `docs/DESIGN_SYSTEM.md`.

Quando a mudanca alterar layout, hierarquia, densidade, iconografia, filtros, listas, formularios, master-detail ou composicao de informacao financeira, a revisao deve considerar explicitamente:

- qual informacao e acao dominam a primeira leitura;
- se valores e estados decisivos possuem maior peso que metadados;
- se existe excesso de cards, bordas, badges, caixas aninhadas ou controles concorrentes;
- se filtros secundarios ocupam espaco permanente sem necessidade;
- se iconografia e acoes seguem a linguagem compartilhada;
- se desktop e mobile mantem hierarquia e acabamento equivalentes;
- se a tela se integra visualmente com telas da mesma familia;
- quando houver Golden Screen indicada, se o candidato atinge nivel equivalente de acabamento, densidade, tipografia, espacamento e hierarquia.

A revisao deve falhar quando a tela estiver funcional e responsiva, mas ainda apresentar aparencia de CRUD administrativo, formulario bruto ou composicao visual sem hierarquia clara. Screenshot isolado nao aprova qualidade; a evidencia precisa registrar rota, estado, viewport e observacao que sustente os criterios avaliados.

### Centralizacao dos formularios de lancamentos

No `/lancamentos`, validar no Chrome autenticado o mesmo dialog em `POST` (novo e
clonar) e `PATCH` (editar): as margens horizontais devem ser equivalentes (considerando
scrollbar), o dialog deve ficar centralizado verticalmente, inteiramente contido
na viewport, sem ancoragem a direita, com rolagem apenas em seu conteudo quando
necessario. Exercitar desktop 1366x768 e mobile 390x844/320x740, verificando
foco, Escape, navegacao por teclado e retorno ao acionador. Um painel lateral a
direita e regressao, mesmo que a geometria do mockup antigo o represente. A
cobertura automatizada de geometria nao substitui revisao visual independente.

### Refinamento do diálogo e identificação da conta

No diálogo do Extrato, o cadastro e a clonagem mostram somente a conta de origem em
leitura, com nome completo quebrável mesmo em 320 px e sem input de leitura
truncado. A edição mostra somente o seletor de conta editável, com o nome completo
disponível em texto quebrável. Uma transferência não pode apresentar campos de
origem duplicados durante a alternância entre POST e PATCH. O Chrome deve rejeitar
duas identificações de conta simultaneamente e nomes selecionados ilegíveis.

Enquanto o diálogo estiver aberto, a rolagem do documento deve ficar bloqueada;
somente o conteúdo do diálogo pode rolar. Capturar criação, clonagem e edição nos
três viewports e aplicar controles negativos de centralização, incluindo uma
ancoragem à direita ainda inteiramente contida na viewport.

## Portao discriminante da Issue #715 — Cartoes

A propagacao visual da Golden Screen na rota `/cartoes` tem escopo proprio, diferente da aprovacao do Extrato. Capturas geradas antes do commit material desta entrega nao certificam a mudanca.

- **Hierarquia da fatura:** fatura aberta com conta de pagamento na moeda correta; valor e moeda visiveis, liquidacao como unica acao primaria; fechamento e compra sem competir.
- **Filtros progressivos:** ordenacao padrao e alterada; controles secundarios recolhidos por padrao, estado ativo exposto e selecao preservada.
- **Compras longas:** descricoes extensas e parcelas em moedas explicitas; texto e valores nao cortados e totais separados por moeda.
- **Busca sem resultado:** estado vazio orienta a ajustar os filtros sem omitir o contexto da fatura.
- **Formulario:** abrir, percorrer e fechar modal de compra no teclado; dialog identificado, foco visivel, scroll interno, Escape e retorno do foco.
- **Controle negativo:** mutar para truncamento ou destacar simultaneamente compra e fechamento deve gerar falha estrutural ou rejeicao visual documentada.

Inspecionar os estados em 1366x768, 390x844 e, nas divergencias de reflow, 320x740. Registrar em cada linha viewport, artefato, assertion, SHA exato e parecer de avaliador independente. A ausencia de capturas ou parecer deixa o gate de aceite aberto, mesmo se Repository CI e o workflow Chrome terminarem com sucesso.

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

O mapeamento de fluxo real permanece no mesmo registro canonico de cobertura para evitar uma segunda fonte de verdade. Os controles negativos exercitam fixture de primitive, fixture de estado, registro de rota sem navegador real e mutacoes que preservam metadata mas retiram a capability observavel.

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
| Cartoes filtros, modal, ordenacao, subtotais, resumo e finalizer                             | `issue-606-semantic-interactions.mjs`                                  |
| Cartoes vazio por filtro                                                                     | `issue-606-cards-execution.mjs`                                        |
| Cartoes em 1366x768, conteudo longo e teclado                                                | `cards-interface-adversarial.mjs`                                      |
| Contas e Cartoes desktop/mobile, tabs, menus e modais                                        | `accounts-cards-interface.mjs` + adaptador de claims                   |
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

### PR #720 — Conciliação pelo ícone Situação no Extrato (17/10/2026)

No Extrato (`/lancamentos`), o ícone de Situação passa a abrir o mesmo menu neutro dos Cartões. Lançamentos efetivados e independentes permitem **Marcar como conciliado** ou **Desconciliar**, usando o contrato atual `PATCH /api/transactions/:id` com envio exclusivo de `status`. A ação redundante sai do menu de três pontos; edição e exclusão permanecem.

Lançamentos previstos, sugestões, parcelas, grupos, movimentos de cartão e remuneração protegida exibem explicação, sem prometer mudanças que dependam de fluxos específicos. O menu mantém foco visível, 44 px de alvo, feedback assíncrono (inclusive erro de conexão), Escape com devolução de foco e posição visível mesmo com rolagem horizontal.

Validar em Chrome 1366×768, 390×844 e 320×740, com teclado e toque, alternância nos dois sentidos, erro HTTP e de rede, conta individual e visão consolidada. A implementação por si só não equivale à aprovação visual independente no HEAD da PR.

### PR #720 — Valor da parcela e anexo recolhível (17/10/2026)

Na tela `/lancamentos`, conferir no modal **Editar parcela** e **Ajustar valor da parcela** que `amountEditable` só aparece com estados planejado/planejado ou efetivado/efetivado não conciliados. Alterar um valor em centavos deve atualizar `Transaction` e `Installment` atomicamente, sem redistribuição para outras parcelas e sem alteração de status. Para conciliadas, canceladas e parcelas de fatura, a edição permanece bloqueada. Verificar formato BRL, validação de 0, caracteres inválidos, conflito 409 e navegação por teclado.

O bloco de anexos inicia recolhido, com `<details><summary>Anexos do lançamento</summary>`; ao expandir, mantém todos os controles de anexos e não perde arquivo selecionado. Verificar viewport desktop 1366×768, celular 390×844 e 320×740, rolagem do diálogo, foco, contraste e equivalência ao `Mais opções`. Asserções de SSR e testes sem navegador não equivalem à homologação visual.

### PR #720 — Recorrências fixas e escolha de escopo de valor (17/10/2026)

No Extrato, recorrências fixas mostram somente o indicador próprio, sem `Parcela 2 de ?` (como Sabesp, CPFL e Telefônica do print). Parcelamentos finitos continuam com `Parcela N de M` (como Teste de parcelamento). Ao alterar valor de uma parcela, validar confirmação modal antes de persistir com opções **Somente esta parcela**, **Esta e as próximas** e **Voltar sem salvar**. A segunda só aparece quando existem parcelas posteriores; Escape e Voltar não salvam. Confirmar preservação das parcelas anteriores, conciliadas e canceladas, resposta `updatedCount/skippedCount`, erro 409 para série sem origem confiável e 404 fora do perfil. Validar desktop 1366×768, mobile 390×844 e teclado/foco.

### PR #720 — Restaurar a ultima conta apos novo login (17/10/2026)

Validar no navegador real, em desktop e mobile: selecionar a conta B, sair, entrar
novamente, abrir `/lancamentos` sem `accountId` e verificar se conta B reaparece;
repetir com `Todas as contas`. Confirmar que selecao de outro usuario ou outro
perfil financeiro nao herda a conta, links com `accountId` prevalecem, conta
inexistente/arquivada nao causa loop, moeda explicita nao e sobrescrita, e
`month`/outros filtros permanecem inalterados. Verificar modo com JavaScript
ou localStorage indisponivel (GET funcional), refresh, Escape/teclado do combobox,
persistencia com selecao feita imediatamente apos login e ausencia de armazenamento
de dados financeiros/credenciais.

Os testes de runtime simulam abertura de nova sessao e perfis distintos;
a homologacao real do Chrome segue necessaria no SHA final.

### PR #720 — Validação do filtro Hoje (17/10/2026)

1. Em `/lancamentos`, partindo de um mês anterior, selecionar **Hoje**; conferir que `month` e `day` representam o dia civil atual de São Paulo, sem `from`/`to` antigos, que o período visível corresponde ao filtro efetivo e que o extrato mostra apenas movimentações do dia.
2. Confirmar casos em que `occurredOn` e `effectiveOn` ou `plannedOn` são diferentes (inclusive lançamento efetivado hoje com ocorrência futura), e verificar saldo de abertura, totais e moeda em conta individual e visão consolidada.
3. Repetir na virada de mês e no horário 21h–24h de Brasília (quando UTC já está no dia seguinte), com pesquisa, `profileId` diferente do padrão e contas distintas.
4. Verificar 7 dias/30 dias, voltar para mês anterior/atual e aplicar filtros após Hoje sem duplicar o parâmetro `day` nem gerar erro de inserção de elemento no DOM.

Exigir evidência real no Chrome em desktop e mobile no SHA final. Testes estáticos e unitários não substituem essa homologação.
