# Primitivas executaveis de UI e layout

Este documento complementa `docs/DESIGN_SYSTEM.md` com o contrato executavel introduzido pela issue #601. A fundacao permanece independente de framework e compativel com o SSR Node `http` atual.

## Fonte executavel

- `apps/web/src/design-system/primitives.ts`: APIs TypeScript que renderizam markup SSR deterministico.
- `apps/web/src/design-system/styles.ts`: estilos `sf-*` derivados dos tokens canonicos de `tokens.ts`.
- `apps/web/src/design-system/primitives.test.ts`: contrato de estados, acessibilidade, reuso, responsividade e determinismo.

As receitas de `components.ts` continuam como referencia conceitual durante a transicao. Novas composicoes devem preferir as primitivas executaveis quando a responsabilidade correspondente ja existir aqui.

## UI disponivel

- `renderButton`: acao textual com variantes `primary`, `secondary`, `ghost` e `danger`, alem de `disabled` e `busy`.
- `renderIconButton`: acao somente com icone, com `aria-label` obrigatorio pela API.
- `renderCard` e `renderMetricCard`: agrupamento semantico e indicadores resumidos sem calculo financeiro.
- `renderDataTable`: dados tabulares com linhas, estado vazio, alinhamento e overflow controlado.
- `renderEmptyState`, `renderLoading`, `renderRecoverableError`, `renderUnavailableState` e `renderPermissionState`: estados operacionais explicitos.
- `renderAlert`: alerta com tons semanticos e marcador nao dependente apenas de cor.
- `renderDialog`, `renderDrawer` e `renderDialogTrigger`: superficies modais com controller compartilhado de foco.
- `renderTabs`: navegacao em abas por links nativos com `aria-current=page`.
- `renderBadge`: status compacto com tons semanticos.
- `renderToast`: feedback `status` por padrao e `alert` quando explicitamente assertivo.

`renderText` deve ser usado para escapar dados de view-model antes de inseri-los em campos `*Html` ou em callbacks como `DataTableColumn.renderCell`. Campos terminados em `Html` aceitam markup ja renderizado pelo servidor; nao devem receber entrada externa bruta.

## Layout disponivel

- `renderPageContainer`: largura maxima e gutters canonicos;
- `renderPageHeader`: titulo, contexto, descricao e acoes;
- `renderFilterBar`: agrupamento compacto de filtros;
- `renderSummaryGrid`: grid responsivo de resumos/metricas;
- `renderDetailLayout`: composicao master-detail que colapsa para uma coluna em viewport reduzida;
- `renderFormLayout`: campos, erro de submissao e acoes sem impor uma segunda tag `<form>`.

Esses layouts nao conhecem rota nem regra financeira. Dashboard, Extrato, Cartoes e demais features podem compor as mesmas APIs com seus view-models sem copiar estrutura ou CSS. A adocao efetiva das telas-piloto continua pertencendo as issues de migracao da Fase 3C (#591); a #601 entrega a fundacao reutilizavel.

## Teclado, foco e dialogos

`Button`, `IconButton` e `Tabs` usam elementos HTML nativos e o foco visivel compartilhado. `Dialog` e `Drawer` usam `<dialog>` e dependem de `renderSolverFinUiInteractionsScriptTag()` (ou o conteudo de `createSolverFinUiInteractionsScript()`) incluido uma unica vez na pagina que adotar essas primitivas. O controller:

1. abre o elemento com `HTMLDialogElement.showModal()`, mantendo o foco no contexto modal;
2. preserva o fechamento nativo por `Escape`;
3. fecha pelo controle `data-sf-dialog-close`;
4. devolve o foco ao controle que abriu o dialogo.

Nao crie um controller por rota para repetir esse comportamento.

## Responsividade e conteudo longo

A folha compartilhada usa os breakpoints canonicos de `tokens.ts` e cobre:

- gutter mobile em `PageContainer`;
- `PageHeader`, barras de acao e formularios refluindo em largura reduzida;
- `DetailLayout` mudando de duas para uma coluna;
- `Dialog`/`Drawer` ocupando a largura segura no mobile;
- `DataTable` com overflow horizontal controlado;
- `overflow-wrap: anywhere` em titulos, descricoes e celulas suscetiveis a conteudo longo;
- alvo interativo minimo vindo de `--sf-density-interactive-target-min`.

## SSR e composicao segura

As funcoes nao leem DOM, horario, locale global, rede ou estado mutavel. Para a mesma entrada, produzem a mesma string. O controller de dialogo tambem e retornado como string deterministica e so executa no navegador depois de incorporado pela tela/shell.

A camada de apresentacao nao calcula saldo, fatura, orcamento, cambio ou qualquer outra regra financeira. Valores financeiros continuam vindo de contratos/view-models deterministas, e a primitiva monetaria `Money` permanece no escopo da issue dedicada #602.

## Exemplo de composicao

```ts
const html = renderPageContainer({
  childrenHtml:
    renderPageHeader({ title: "Extrato da conta" }) +
    renderFilterBar({ childrenHtml: renderButton({ label: "Filtrar", variant: "secondary" }) }) +
    renderDataTable({
      caption: "Lancamentos",
      columns: [
        {
          id: "descricao",
          header: "Descricao",
          renderCell: (row) => renderText(row.description),
        },
      ],
      rows,
      rowKey: (row) => row.id,
    }),
});
```

O exemplo demonstra composicao, nao uma migracao da rota existente.

## Validacao

Para mudancas nessa fundacao, execute no repositorio completo:

```bash
npm run typecheck --workspace @solverfin/web
npm run test --workspace @solverfin/web
npm run validate:ssr-styles --workspace @solverfin/web
```

O `npm run validate` da raiz continua sendo o gate agregado antes da entrega.
