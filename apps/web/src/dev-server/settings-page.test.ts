import assert from "node:assert/strict";

import {
  parseAutomationRuleAmountMinorInput,
  renderSettingsPage,
  resolveSettingsSection,
} from "./settings-page.js";

sectionResolutionIsServerSide();
amountInputConvertsDecimalsToMinorUnits();
await profilesSectionRendersAsTheDefault();
await rulesSectionRendersReadableDetails();
await rulesFailureDoesNotRenderAnEmptyState();
await accountFailureDoesNotDisableCategories();

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

      assert.equal((html.match(/<h1>/g) ?? []).length, 1);
      assert.match(html, /<h1>Configurações<\/h1>/);
      assert.match(html, /href="\/configuracoes\?section=profiles" aria-current="page"/);
      assert.match(html, /href="\/configuracoes\?section=rules"/);
      assert.match(html, />Em uso<\/span>/);
      assert.match(html, />Ativo<\/span>/);
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
              kind: "expense",
              amount: { minMinor: 1050, maxMinor: 5000 },
            },
            actions: { categoryId: "category-food", status: "posted" },
            explanation: "Compras recorrentes de mercado.",
          },
          {
            id: "rule-2",
            name: "Código futuro",
            status: "future-status",
            priority: 10,
            conditions: { kind: "future-kind" },
            actions: { status: "future-action" },
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
      assert.match(html, /Status: Realizado/);
      assert.match(html, /Não reconhecido/);
      assert.doesNotMatch(html, /future-kind/);
      assert.doesNotMatch(html, /future-action/);
      assert.doesNotMatch(html, /future-status/);
      assert.match(html, /name="amountMinMinor" type="text" inputmode="decimal"/);
      assert.match(html, /name="amountMaxMinor" type="text" inputmode="decimal"/);
      assert.doesNotMatch(html, /em centavos/);
      assert.match(html, /window\.location\.reload\(\)/);
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
