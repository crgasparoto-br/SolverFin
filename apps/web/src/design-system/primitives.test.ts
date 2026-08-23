import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSolverFinDesignSystemCss } from "./styles.js";
import {
  createSolverFinUiInteractionsScript,
  renderAlert,
  renderBadge,
  renderButton,
  renderCard,
  renderDataTable,
  renderDetailLayout,
  renderDialog,
  renderDialogTrigger,
  renderDrawer,
  renderEmptyState,
  renderFilterBar,
  renderFormLayout,
  renderIconButton,
  renderLoading,
  renderMetricCard,
  renderPageContainer,
  renderPageHeader,
  renderPermissionState,
  renderRecoverableError,
  renderSolverFinUiInteractionsScriptTag,
  renderSummaryGrid,
  renderTabs,
  renderText,
  renderToast,
  renderUnavailableState,
} from "./primitives.js";

describe("executable UI primitives", () => {
  it(
    "escapes visible text and attributes while keeping native button semantics",
    () => {
      const button = renderButton({
        label: '<Salvar & "seguir">',
        name: 'action"name',
      });
      const icon = renderIconButton({ label: 'Editar "conta"', icon: "✎" });

      assert.match(button, /type="button"/);
      assert.match(button, /&lt;Salvar &amp; &quot;seguir&quot;&gt;/);
      assert.match(button, /name="action&quot;name"/);
      assert.match(icon, /aria-label="Editar &quot;conta&quot;"/);
      assert.match(icon, /aria-hidden="true"/);
    },
  );

  it(
    "models loading, empty, recoverable error, unavailable and permission states explicitly",
    () => {
      const states = [
        renderLoading({ title: "Carregando" }),
        renderEmptyState({ title: "Nada por aqui" }),
        renderRecoverableError({
          title: "Nao foi possivel carregar",
          actionHtml: renderButton({ label: "Tentar novamente" }),
        }),
        renderUnavailableState({ title: "Indisponivel" }),
        renderPermissionState({ title: "Sem permissao" }),
      ];

      for (const [index, state] of states.entries()) {
        assert.match(state, /class="sf-state-panel"/);
        assert.ok(
          state.length > 40,
          `state ${index} should render useful markup`,
        );
      }

      assert.match(
        states[0] ?? "",
        /data-state="loading"[^>]*aria-busy="true"/,
      );
      assert.match(states[1] ?? "", /data-state="empty"/);
      assert.match(states[2] ?? "", /data-state="error"[^>]*role="alert"/);
      assert.match(states[3] ?? "", /data-state="unavailable"/);
      assert.match(states[4] ?? "", /data-state="permission"/);
    },
  );

  it(
    "renders dialog and drawer contracts with a shared modal focus lifecycle",
    () => {
      const trigger = renderDialogTrigger({
        dialogId: "edit-account",
        label: "Editar",
      });
      const dialog = renderDialog({
        id: "edit-account",
        title: "Editar conta",
        description: "Revise os dados antes de salvar.",
        bodyHtml: renderText("Formulario"),
      });
      const drawer = renderDrawer({
        id: "details",
        title: "Detalhes",
        bodyHtml: renderText("Conteudo"),
      });
      const script = createSolverFinUiInteractionsScript();
      const scriptTag = renderSolverFinUiInteractionsScriptTag();

      assert.match(trigger, /data-sf-dialog-open="edit-account"/);
      assert.match(dialog, /<dialog class="sf-dialog"/);
      assert.match(dialog, /aria-labelledby="edit-account-title"/);
      assert.match(dialog, /data-sf-dialog-close/);
      assert.match(drawer, /<dialog class="sf-dialog sf-drawer"/);
      assert.match(script, /showModal\(\)/);
      assert.match(script, /new WeakMap\(\)/);
      assert.match(script, /opener\.focus\(\)/);
      assert.equal(scriptTag, `<script>${script}</script>`);
    },
  );

  it(
    "keeps navigation tabs keyboard-native instead of claiming a custom tab role",
    () => {
      const tabs = renderTabs({
        label: "Periodos",
        items: [
          { label: "Atual", href: "/cartoes?period=current", active: true },
          { label: "Anterior", href: "/cartoes?period=previous" },
        ],
      });

      assert.match(tabs, /<nav class="sf-tabs" aria-label="Periodos">/);
      assert.match(tabs, /aria-current="page"/);
      assert.doesNotMatch(tabs, /role="tab"/);
    },
  );

  it(
    "allows two distinct route compositions to reuse the same structural primitives",
    () => {
      const dashboard = renderPageContainer({
        childrenHtml:
          renderPageHeader({
            eyebrow: "Dashboard",
            title: "Visao financeira",
            actionsHtml: renderButton({
              label: "Atualizar",
              variant: "secondary",
            }),
          }) +
          renderSummaryGrid({
            childrenHtml:
              renderMetricCard({
                label: "Conta A",
                value: "Valor disponivel",
              }) +
              renderMetricCard({
                label: "Conta B",
                value: "Outro valor",
              }),
          }),
      });

      const statement = renderPageContainer({
        childrenHtml:
          renderPageHeader({ title: "Extrato da conta" }) +
          renderFilterBar({
            childrenHtml: renderButton({
              label: "Filtrar",
              variant: "secondary",
            }),
          }) +
          renderDataTable({
            caption: "Lancamentos",
            columns: [
              {
                id: "description",
                header: "Descricao",
                renderCell: (row: { description: string }) =>
                  renderText(row.description),
              },
              {
                id: "status",
                header: "Status",
                renderCell: (row: { description: string }) =>
                  renderBadge({
                    label: row.description,
                    tone: "information",
                  }),
              },
            ],
            rows: [{ description: "Exemplo ficticio" }],
            rowKey: (_row: { description: string }, index: number) =>
              String(index),
          }),
      });

      assert.match(dashboard, /sf-page-container/);
      assert.match(statement, /sf-page-container/);
      assert.match(dashboard, /sf-page-header/);
      assert.match(statement, /sf-page-header/);
      assert.doesNotMatch(dashboard, /dashboard-page|dashboard-layout/);
      assert.doesNotMatch(statement, /statement-page|statement-layout/);
    },
  );

  it(
    "renders cards, alerts, feedback and layout composition without financial rules",
    () => {
      const markup =
        renderCard({
          title: "Resumo",
          bodyHtml: renderAlert({
            tone: "information",
            title: "Informacao",
          }),
        }) +
        renderToast({ title: "Alteracoes salvas", tone: "positive" }) +
        renderDetailLayout({
          masterHtml: renderText("Lista"),
          detailHtml: renderText("Detalhe"),
        }) +
        renderFormLayout({
          fieldsHtml: renderText("Campos"),
          actionsHtml: renderButton({ label: "Salvar" }),
        });

      assert.match(markup, /sf-card/);
      assert.match(markup, /sf-semantic-state/);
      assert.match(markup, /sf-toast/);
      assert.match(markup, /sf-detail-layout/);
      assert.match(markup, /sf-form-layout/);
    },
  );

  it("keeps SSR output deterministic for the same input", () => {
    const props = {
      title: "Titulo longo",
      description: "Descricao longa",
      actionsHtml: renderButton({ label: "Acao" }),
    } as const;
    assert.equal(renderPageHeader(props), renderPageHeader(props));
  });

  it("rejects empty structural collections instead of emitting ambiguous markup", () => {
    assert.throws(
      () =>
        renderDataTable({
          caption: "Vazio",
          columns: [],
          rows: [],
          rowKey: () => "row",
        }),
      /at least one column/,
    );
    assert.throws(
      () => renderTabs({ label: "Abas", items: [] }),
      /at least one navigation item/,
    );
  });

  it(
    "publishes responsive, focus, overflow and component styles from the shared design system",
    () => {
      const css = createSolverFinDesignSystemCss();

      assert.match(css, /\.sf-button:focus-visible/);
      assert.match(
        css,
        /min-height:\s*var\(--sf-density-interactive-target-min\)/,
      );
      assert.match(
        css,
        /\.sf-page-header-title[^}]*overflow-wrap:\s*anywhere/s,
      );
      assert.match(css, /\.sf-table-wrap[^}]*overflow-x:\s*auto/s);
      assert.match(css, /\.sf-detail-layout[^}]*minmax\(0, 1fr\)/s);
      assert.match(css, /@media \(max-width: 47\.5rem\)/);
    },
  );
});
