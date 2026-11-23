import assert from "node:assert/strict";

import { baseCss } from "./settings-page-css.js";
import {
  parseAutomationRuleAmountMinorInput,
  renderSettingsPage,
  resolveRulesListFilter,
  resolveSettingsSection,
} from "./settings-page.js";

sectionResolutionIsServerSide();
amountInputConvertsDecimalsToMinorUnits();
ruleListFilterFallsBackToAll();
ruleSummaryKeepsSingleLayout();
settingsMobileTabsRemainDiscoverable();
await profilesSectionRendersAsTheDefault();
await rulesSectionRendersReadableDetails();
await rulesListFiltersPreserveActionsAndVisibility();
await rulesFilteredEmptyStateIsNotAnApiError();
await rulesFailureDoesNotRenderAnEmptyState();
await accountFailureDoesNotDisableCategories();
await categoryFailureDoesNotDisableAccounts();
await bothDependenciesFailIndependently();
await settingsGoldenHierarchyHasDiscriminatingNegativeControls();
await longProfileNameRemainsEscapedAndReadable();
await emptyAndErrorContextsStayDistinguishable();

function sectionResolutionIsServerSide(): void {
  assert.equal(resolveSettingsSection(new URL("https://example.test/configuracoes")), "profiles");
  assert.equal(
    resolveSettingsSection(new URL("https://example.test/configuracoes?section=profiles")),
    "profiles",
  );
  assert.equal(
    resolveSettingsSection(new URL("https://example.test/configuracoes?section=rules")),
    "rules",
  );
  assert.equal(
    resolveSettingsSection(new URL("https://example.test/configuracoes?section=unknown")),
    "profiles",
  );
}

function ruleSummaryKeepsSingleLayout(): void {
  const css = baseCss();
  assert.equal((css.match(/\.rule-summary\s*\{/g) ?? []).length, 1);
  assert.match(css, /\.rule-summary\s*\{[^}]*display:\s*grid;/);
}

function settingsMobileTabsRemainDiscoverable(): void {
  const css = baseCss();
  const mobile = css.slice(css.indexOf("@media (max-width: 430px)"));
  assert.match(
    mobile,
    /\.settings-page \.sf-tabs \{[^}]*flex-wrap: wrap;[^}]*overflow-x: visible;/,
  );
  assert.match(mobile, /\.settings-page \.sf-tab \{[^}]*flex: 1 1 auto;[^}]*min-width: 0;/);
  // A clipped, scroll-only navigation must not silently replace this reflow.
  assert.doesNotMatch(mobile, /\.settings-page \.sf-tabs \{[^}]*overflow-x: auto;/);
}

function ruleListFilterFallsBackToAll(): void {
  for (const suffix of ["", "&filter=todas", "&filter=desconhecido", "&filter=Ativas"]) {
    assert.equal(
      resolveRulesListFilter(new URL("https://example.test/configuracoes?section=rules" + suffix)),
      "todas",
    );
  }
  assert.equal(
    resolveRulesListFilter(
      new URL("https://example.test/configuracoes?section=rules&filter=ativas"),
    ),
    "ativas",
  );
  assert.equal(
    resolveRulesListFilter(
      new URL("https://example.test/configuracoes?section=rules&filter=inativas"),
    ),
    "inativas",
  );
}

function amountInputConvertsDecimalsToMinorUnits(): void {
  assert.equal(parseAutomationRuleAmountMinorInput(""), undefined);
  assert.equal(parseAutomationRuleAmountMinorInput("10"), 1000);
  assert.equal(parseAutomationRuleAmountMinorInput("10,5"), 1050);
  assert.equal(parseAutomationRuleAmountMinorInput("10,50"), 1050);
  assert.equal(parseAutomationRuleAmountMinorInput("10.50"), 1050);
  assert.equal(parseAutomationRuleAmountMinorInput("10,501"), null);
  assert.equal(parseAutomationRuleAmountMinorInput("1.000,00"), null);
  assert.equal(parseAutomationRuleAmountMinorInput("valor"), null);
}

async function profilesSectionRendersAsTheDefault(): Promise<void> {
  await withFetch(
    {
      "/api/financial-profiles": {
        activeProfileId: "profile-personal",
        profiles: [
          { id: "profile-personal", name: "Pessoal", kind: "personal", status: "active" },
          { id: "profile-old", name: "Antigo", kind: "family", status: "archived" },
        ],
      },
    },
    async () => {
      const html = await renderSettingsPage("token", new URL("https://example.test/configuracoes"));

      assert.equal((html.match(/<h1(?:\s[^>]*)?>/g) ?? []).length, 1);
      assert.match(html, /class="sf-page-header-title">Configurações<\/h1>/);
      assert.match(html, /data-secondary-route-foundation="settings"/);
      assert.match(html, /class="sf-tabs"/);
      assert.match(html, /href="\/configuracoes\?section=profiles" aria-current="page"/);
      assert.match(html, /href="\/configuracoes\?section=rules"/);
      assert.match(html, />Em uso<\/span>/);
      assert.doesNotMatch(html, /Em uso<\/span>[\s\S]*?status-active">Ativo<\/span>/);
      assert.match(html, />Arquivado<\/span>/);
      assert.doesNotMatch(html, /Tenant operacional/);
      assert.doesNotMatch(html, /Regras configuradas/);
      assert.match(html, /\/dashboard\?profileId=profile-personal/);
      assert.match(html, /\/contas\?profileId=profile-personal/);
      assert.match(html, /\/lancamentos\?profileId=profile-personal/);
    },
  );
}

async function rulesSectionRendersReadableDetails(): Promise<void> {
  await withFetch(
    {
      "/api/automation-rules?status=all": {
        rules: [
          {
            id: "rule-1",
            name: "Mercado",
            status: "active",
            priority: 120,
            conditions: {
              descriptionIncludes: "mercado",
              merchantIncludes: "supermercado",
              kind: "expense",
              accountId: "account-1",
              cardId: "card-1",
              amount: { minMinor: 1050, maxMinor: 5000 },
            },
            actions: {
              categoryId: "category-food",
              accountId: "account-1",
              cardId: "card-1",
              tagIds: ["tag-1", "tag-2"],
              status: "reconciled",
            },
            explanation: "Compras recorrentes de mercado.",
          },
          {
            id: "rule-2",
            name: "Código futuro",
            status: "future-status",
            priority: 10,
            conditions: { kind: "future-kind" },
            actions: { categoryId: "category-missing", status: "future-action" },
          },
          {
            id: "rule-3",
            name: "Status adicionais",
            status: "inactive",
            priority: 5,
            conditions: { merchantIncludes: "loja" },
            actions: { status: "pending_review" },
          },
          {
            id: "rule-4",
            name: "Cancelamento",
            status: "active",
            priority: 4,
            conditions: { descriptionIncludes: "cancelar" },
            actions: { status: "voided" },
          },
          {
            id: "rule-5",
            name: "Duplicidade",
            status: "active",
            priority: 3,
            conditions: { descriptionIncludes: "duplicado" },
            actions: { status: "duplicate" },
          },
        ],
      },
      "/api/accounts": { accounts: [{ id: "account-1", name: "Conta principal" }] },
      "/api/categories": {
        categories: [{ id: "category-food", name: "Alimentação", kind: "expense" }],
      },
    },
    async () => {
      const html = await renderSettingsPage(
        "token",
        new URL("https://example.test/configuracoes?section=rules"),
      );

      assert.match(html, /href="\/configuracoes\?section=rules" aria-current="page"/);
      assert.doesNotMatch(html, /Perfis disponíveis/);
      assert.match(
        html,
        /Números maiores são aplicados primeiro; em empate, vence a regra criada antes\./,
      );
      assert.match(html, /Valor mínimo: 10,50/);
      assert.match(html, /Valor máximo: 50,00/);
      assert.match(html, /Tipo: Despesa/);
      assert.match(html, /Estabelecimento contém “supermercado”/);
      assert.match(html, /Conta: Conta principal/);
      assert.match(html, /Cartão específico/);
      assert.match(html, /Sugerir categoria: Alimentação/);
      assert.match(html, /Sugerir conta: Conta principal/);
      assert.match(html, /Sugerir cartão/);
      assert.match(html, /Adicionar 2 etiquetas/);
      assert.match(html, /Status: Conciliado/);
      assert.match(html, /Status: Pendente de revisão/);
      assert.match(html, /Status: Cancelado/);
      assert.match(html, /Status: Duplicado/);
      assert.match(html, /Sugerir categoria: Não reconhecido/);
      assert.match(html, /Não reconhecido/);
      assert.doesNotMatch(html, /future-kind/);
      assert.doesNotMatch(html, /future-action/);
      assert.doesNotMatch(html, /future-status/);
      assert.doesNotMatch(html, /category-missing/);
      assert.doesNotMatch(html, /<li>Conta: account-1<\/li>/);
      assert.doesNotMatch(html, /<li>Sugerir conta: account-1<\/li>/);
      assert.doesNotMatch(html, /card-1/);
      assert.doesNotMatch(html, /tag-1/);
      assert.match(html, /name="amountMinMinor" type="text" inputmode="decimal"/);
      assert.match(html, /name="amountMaxMinor" type="text" inputmode="decimal"/);
      assert.doesNotMatch(html, /em centavos/);
      assert.match(html, /window\.location\.reload\(\)/);
    },
  );
}

async function rulesListFiltersPreserveActionsAndVisibility(): Promise<void> {
  const responses = {
    "/api/automation-rules?status=all": {
      rules: [
        {
          id: "rule-active",
          name: "Mercado & Casa",
          status: "active",
          priority: 100,
          conditions: { descriptionIncludes: "mercado<script>alert(1)</script>", kind: "expense" },
          actions: { status: "suggested" },
          explanation: "Esta regra ajuda no lançamento.",
        },
        {
          id: "rule-inactive",
          name: "Regra inativa",
          status: "inactive",
          priority: 20,
          conditions: { merchantIncludes: "loja" },
          actions: { status: "planned" },
        },
        {
          id: "rule-unknown",
          name: "Estado futuro",
          status: "status_futuro",
          priority: 10,
          conditions: {},
          actions: {},
        },
      ],
    },
    "/api/accounts": { accounts: [] },
    "/api/categories": { categories: [] },
  };

  await withFetch(responses, async () => {
    for (const [filter, expected] of [
      ["todas", ["Mercado &amp; Casa", "Regra inativa", "Estado futuro"]],
      ["ativas", ["Mercado &amp; Casa"]],
      ["inativas", ["Regra inativa"]],
    ] as const) {
      const query = filter === "todas" ? "" : "&filter=" + filter;
      const html = await renderSettingsPage(
        "token",
        new URL("https://example.test/configuracoes?section=rules" + query),
      );
      const scope = html.slice(
        html.indexOf('data-settings-scope="rules"'),
        html.indexOf('<dialog id="new-automation-rule-dialog"'),
      );

      assert.match(scope, /aria-label="Filtrar regras por situação"/);
      assert.match(scope, /href="\/configuracoes\?section=rules&amp;filter=ativas"/);
      assert.match(scope, /href="\/configuracoes\?section=rules&amp;filter=inativas"/);
      assert.match(scope, /O filtro organiza apenas a lista/);
      assert.equal(
        (scope.match(/class="maintenance-item rule-item"/g) ?? []).length,
        expected.length,
      );
      const rowTitles = [
        ...scope.matchAll(/<div class="item-title-line">\s*<strong>([^<]*)<\/strong>/g),
      ].map((match) => match[1] ?? "");
      assert.deepEqual(
        rowTitles,
        expected,
        `${filter}: o filtro deve preservar a ordem e excluir regras com outro status`,
      );
      assert.match(scope, /<details class="rule-disclosure">/);
      assert.match(
        scope,
        /<summary class="rule-detail-trigger sf-focus-ring" aria-label="Ver condições e ações da regra/,
      );
      assert.match(scope, /Ver condições e ações/);
      assert.match(scope, /data-api-path="\/api\/automation-rules\/apply"/);
      assert.match(scope, /data-api-confirm="Executar regras sobre sugestões pendentes\?"/);
      assert.doesNotMatch(scope, /status_futuro|<script>alert\(1\)<\/script>/);
      assert.match(
        html,
        /<fieldset class="settings-rule-fieldset">\s*<legend>Identificação<\/legend>/,
      );
      assert.match(html, /<legend>Quando aplicar<\/legend>/);
      assert.match(html, /<legend>O que sugerir<\/legend>/);
      assert.match(html, /name="amountMinMinor" type="text" inputmode="decimal"/);
      assert.match(html, /name="actionCategoryId"/);
      if (filter === "todas") {
        assert.match(scope, /Mercado &amp; Casa[\s\S]*Regra inativa[\s\S]*Estado futuro/);
        assert.match(scope, /mercado&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
        assert.match(scope, /Prioridade 100/);
        assert.match(scope, /Explicação:<\/strong> Esta regra ajuda no lançamento/);
        assert.match(scope, /href="\/configuracoes\?section=rules" aria-current="page"/);
        assert.match(scope, /Ativas <span>1<\/span>/);
        assert.match(scope, /Inativas <span>1<\/span>/);
        assert.equal(
          (scope.match(/data-api-path="\/api\/automation-rules\/rule-active\/archive"/g) ?? [])
            .length,
          1,
        );
      } else {
        assert.match(scope, new RegExp("filter=" + filter + '" aria-current="page"'));
      }
    }

    const unknown = await renderSettingsPage(
      "token",
      new URL("https://example.test/configuracoes?section=rules&filter=qualquer"),
    );
    assert.match(unknown, /href="\/configuracoes\?section=rules" aria-current="page"/);
    assert.match(unknown, /Estado futuro/);
  });
}

async function rulesFilteredEmptyStateIsNotAnApiError(): Promise<void> {
  await withFetch(
    {
      "/api/automation-rules?status=all": {
        rules: [
          {
            id: "only-active",
            name: "Somente ativa",
            status: "active",
            priority: 3,
            conditions: {},
            actions: {},
          },
        ],
      },
      "/api/accounts": { accounts: [] },
      "/api/categories": { categories: [] },
    },
    async () => {
      const html = await renderSettingsPage(
        "token",
        new URL("https://example.test/configuracoes?section=rules&filter=inativas"),
      );
      assert.match(html, /Nenhuma regra inativa\./);
      assert.match(html, /Ver todas as regras/);
      assert.doesNotMatch(html, /Nenhuma regra automática\./);
      assert.doesNotMatch(html, /Não foi possível carregar as regras automáticas/);
      assert.match(html, /Aplicar regras<\/button>/);
    },
  );
}

async function rulesFailureDoesNotRenderAnEmptyState(): Promise<void> {
  await withFetch(
    {
      "/api/automation-rules?status=all": failure("Falha nas regras"),
      "/api/accounts": { accounts: [] },
      "/api/categories": { categories: [] },
    },
    async () => {
      const html = await renderSettingsPage(
        "token",
        new URL("https://example.test/configuracoes?section=rules"),
      );

      assert.match(html, /Não foi possível carregar as regras automáticas/);
      assert.match(html, /Aplicar regras<\/button>/);
      assert.match(html, /disabled aria-disabled="true"/);
      assert.doesNotMatch(html, /Nenhuma regra automática/);
      assert.match(html, /href="\/configuracoes\?section=rules">Tentar novamente/);
    },
  );
}

async function accountFailureDoesNotDisableCategories(): Promise<void> {
  await withFetch(
    {
      "/api/automation-rules?status=all": { rules: [] },
      "/api/accounts": failure("Falha nas contas"),
      "/api/categories": {
        categories: [{ id: "category-food", name: "Alimentação", kind: "expense" }],
      },
    },
    async () => {
      const html = await renderSettingsPage(
        "token",
        new URL("https://example.test/configuracoes?section=rules"),
      );

      assert.match(
        html,
        /<select name="actionAccountId" disabled aria-describedby="accounts-dependency-warning"><\/select>/,
      );
      assert.match(html, /Não foi possível carregar as contas/);
      assert.match(html, /<select name="actionCategoryId">[\s\S]*Alimentação/);
      assert.doesNotMatch(html, /<select name="actionCategoryId" disabled/);
    },
  );
}

async function categoryFailureDoesNotDisableAccounts(): Promise<void> {
  await withFetch(
    {
      "/api/automation-rules?status=all": { rules: [] },
      "/api/accounts": { accounts: [{ id: "account-1", name: "Conta principal" }] },
      "/api/categories": failure("Falha nas categorias"),
    },
    async () => {
      const html = await renderSettingsPage(
        "token",
        new URL("https://example.test/configuracoes?section=rules"),
      );

      assert.match(html, /<select name="actionAccountId">[\s\S]*Conta principal/);
      assert.doesNotMatch(html, /<select name="actionAccountId" disabled/);
      assert.match(
        html,
        /<select name="actionCategoryId" disabled aria-describedby="categories-dependency-warning"><\/select>/,
      );
      assert.match(html, /Não foi possível carregar as categorias/);
    },
  );
}

async function bothDependenciesFailIndependently(): Promise<void> {
  await withFetch(
    {
      "/api/automation-rules?status=all": { rules: [] },
      "/api/accounts": failure("Falha nas contas"),
      "/api/categories": failure("Falha nas categorias"),
    },
    async () => {
      const html = await renderSettingsPage(
        "token",
        new URL("https://example.test/configuracoes?section=rules"),
      );

      assert.match(html, /name="actionAccountId" disabled/);
      assert.match(html, /name="actionCategoryId" disabled/);
      assert.match(html, /Não foi possível carregar as contas/);
      assert.match(html, /Não foi possível carregar as categorias/);
      assert.match(html, /<input name="name" required/);
      assert.match(html, /name="amountMinMinor" type="text"/);
      assert.match(html, /name="amountMaxMinor" type="text"/);
    },
  );
}

async function settingsGoldenHierarchyHasDiscriminatingNegativeControls(): Promise<void> {
  await withFetch(
    {
      "/api/financial-profiles": {
        activeProfileId: "profile-a",
        profiles: [{ id: "profile-a", name: "Conta pessoal", kind: "personal", status: "active" }],
      },
      "/api/automation-rules?status=all": {
        rules: [
          {
            id: "rule-a",
            name: "Mercado",
            status: "active",
            priority: 100,
            conditions: { descriptionIncludes: "mercado" },
            actions: { status: "suggested" },
          },
        ],
      },
      "/api/accounts": { accounts: [] },
      "/api/categories": { categories: [] },
    },
    async () => {
      for (const section of ["profiles", "rules"]) {
        const html = await renderSettingsPage(
          "token",
          new URL(`https://example.test/configuracoes?section=${section}`),
        );
        const scopeStart = html.indexOf('<section class="settings-section"');
        const dialogStart = html.indexOf("<dialog id=", scopeStart);
        assert.ok(scopeStart >= 0 && dialogStart > scopeStart);
        const visible = html.slice(scopeStart, dialogStart);
        assert.equal((visible.match(/class="sf-button sf-button-primary"/g) ?? []).length, 1);
        assert.doesNotMatch(
          visible,
          /settings-section-panel|priority-badge|class="rule-detail"[^>]*style=/,
        );
        assert.match(visible, /settings-collection-heading/);
        assert.match(visible, /maintenance-rows/);
        if (section === "rules") {
          assert.match(visible, /class="settings-operation"/);
          assert.match(visible, /class="sf-button sf-button-secondary" data-api-action/);
          assert.match(visible, /data-api-path="\/api\/automation-rules\/apply"/);
          assert.match(visible, /sugestões revisáveis/);
          const competingPrimary = visible.replace(
            'class="sf-button sf-button-secondary" data-api-action',
            'class="sf-button sf-button-primary" data-api-action',
          );
          assert.equal(
            (competingPrimary.match(/class="sf-button sf-button-primary"/g) ?? []).length,
            2,
          );
          assert.notEqual(
            competingPrimary,
            visible,
            "The negative control must actually mutate the action.",
          );
        } else {
          assert.match(visible, /data-current-profile="true"/);
          assert.equal((visible.match(/>Em uso<\/span>/g) ?? []).length, 1);
          assert.doesNotMatch(visible, /class="maintenance-actions"[^>]*style=/);
          assert.match(visible, /aria-label="Arquivar perfil Conta pessoal"/);
          assert.match(visible, /data-sf-dialog-open="edit-profile-dialog-profile-a"/);
        }
        assert.match(html, /data-sf-dialog-close>Cancelar<\/button>/);
        assert.match(html, /__solverFinUiPrimitivesBound/);
        assert.match(html, /Falha de conexão\./);
      }
    },
  );
}

async function longProfileNameRemainsEscapedAndReadable(): Promise<void> {
  const name = "Perfil de uso muito longo com & caracteres <especiais> e referência internacional";
  await withFetch(
    {
      "/api/financial-profiles": {
        activeProfileId: "long-profile",
        profiles: [{ id: "long-profile", name, kind: "family", status: "active" }],
      },
    },
    async () => {
      const html = await renderSettingsPage("token", new URL("https://example.test/configuracoes"));
      assert.match(html, /Perfil de uso muito longo com &amp; caracteres &lt;especiais&gt;/);
      assert.doesNotMatch(html, /<strong>Perfil de uso muito longo com & caracteres/);
      assert.match(html, /\.item-title-line strong \{[^}]*overflow-wrap: anywhere/);
      const truncatedVariant = html.replace(
        /(\.item-title-line strong \{[^}]*?)overflow-wrap: anywhere/,
        "$1overflow: hidden; text-overflow: ellipsis",
      );
      assert.notEqual(truncatedVariant, html);
      assert.doesNotMatch(
        truncatedVariant,
        /\.item-title-line strong \{[^}]*overflow-wrap: anywhere/,
      );
    },
  );
}

async function emptyAndErrorContextsStayDistinguishable(): Promise<void> {
  await withFetch(
    {
      "/api/financial-profiles": { profiles: [] },
      "/api/automation-rules?status=all": { rules: [] },
      "/api/accounts": { accounts: [] },
      "/api/categories": { categories: [] },
    },
    async () => {
      const profiles = await renderSettingsPage(
        "token",
        new URL("https://example.test/configuracoes"),
      );
      assert.match(profiles, /Nenhum perfil financeiro/);
      assert.match(profiles, /Novo perfil/);
      assert.doesNotMatch(profiles, /Não foi possível carregar os perfis/);
      const rules = await renderSettingsPage(
        "token",
        new URL("https://example.test/configuracoes?section=rules"),
      );
      assert.match(rules, /Nenhuma regra automática/);
      assert.match(rules, /Aplicar regras/);
      assert.doesNotMatch(rules, /Não foi possível carregar as regras/);
    },
  );
}

function failure(message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
}

async function withFetch(
  responses: Record<string, unknown | Response>,
  run: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const response = responses[`${url.pathname}${url.search}`];
    if (response === undefined) throw new Error(`Unexpected fetch: ${url}`);
    if (response instanceof Response) return response.clone();
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}
