import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderAdminInstitutionsPage } from "./admin-institutions-page.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const pageSource = readFileSync(
  path.join(repoRoot, "apps", "web", "src", "dev-server", "admin-institutions-page.ts"),
  "utf8",
);

const institution = {
  key: "banco-demo",
  label: "Instituição fictícia com identificação longa para teste de reflow",
  description: "Instituição financeira fictícia",
  fallbackLabel: "IF",
  status: "active",
  financialInstitutionCode: "DEMO-001",
  logoStatus: "fallback",
};
const populated = {
  institutions: [institution],
  summary: { total: 1, active: 1, withLogo: 0, usingFallback: 1, updatedAt: null },
};

adminInstitutionsPageUsesBackendOnlyUpload();
adminInstitutionsPageKeepsLogoFallbackAndAccessiblePreview();
adminInstitutionsPageKeepsRefreshIdempotentAction();
adminInstitutionsPageAllowsFilterActionsToWrapWithoutHorizontalOverflow();
await adminInstitutionsPagePrioritizesCatalogAndCollapsesAdvancedFilters();
await adminInstitutionsPagePreservesSelectedFiltersAndLinksWithoutJavaScript();
await adminInstitutionsPageDistinguishesEmptyCatalogFromNoResults();
await adminInstitutionsPageRetainsMasterAccessFailure();

function adminInstitutionsPageUsesBackendOnlyUpload(): void {
  assert.match(
    pageSource,
    /\/api\/admin\/institutions\/\$\{escapeHtml\(encodeURIComponent\(institution\.key\)\)\}\/logo/,
  );
  assert.match(pageSource, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(
    pageSource,
    /JSON\.stringify\(\{ fileName: file\.name, mimeType: file\.type, contentBase64 \}\)/,
  );
  assert.doesNotMatch(pageSource, /R2_SECRET_ACCESS_KEY/);
  assert.doesNotMatch(pageSource, /R2_ACCESS_KEY_ID/);
  assert.doesNotMatch(pageSource, /cloudflarestorage\.com/);
}

function adminInstitutionsPageKeepsLogoFallbackAndAccessiblePreview(): void {
  assert.match(pageSource, /alt="Logo \$\{escapeHtml\(institution\.label\)\}"/);
  assert.match(pageSource, /onerror="this\.hidden=true;this\.nextElementSibling\.hidden=false"/);
  assert.match(pageSource, /<span hidden>\$\{escapeHtml\(institution\.fallbackLabel\)\}<\/span>/);
  assert.match(pageSource, /return `<span>\$\{escapeHtml\(institution\.fallbackLabel\)\}<\/span>`/);
  assert.match(pageSource, /formatLogoStatus\(institution\.logoStatus\)/);
}

function adminInstitutionsPageKeepsRefreshIdempotentAction(): void {
  assert.match(pageSource, /data-admin-refresh/);
  assert.match(pageSource, /data-api-path="\/api\/admin\/institutions\/refresh"/);
  assert.match(pageSource, /Atualizando catálogo/);
  assert.match(pageSource, /Catálogo atualizado\./);
}

function adminInstitutionsPageAllowsFilterActionsToWrapWithoutHorizontalOverflow(): void {
  assert.match(
    pageSource,
    /\.filter-actions \{ align-items: center; display: flex; flex-wrap: wrap; gap: 10px; min-width: 0; \}/,
  );
  assert.match(pageSource, /\.institution-title-line strong \{ font-size: 0\.92rem; overflow-wrap: anywhere; \}/);
  assert.match(pageSource, /\.institution-meta \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
}

async function adminInstitutionsPagePrioritizesCatalogAndCollapsesAdvancedFilters(): Promise<void> {
  const html = await renderWithApi(populated);
  const filters = html.indexOf('class="panel filters-panel"');
  const catalog = html.indexOf('class="panel list-panel"');
  const firstRow = html.indexOf('class="admin-institution-row"');

  assert.ok(filters >= 0 && filters < catalog && catalog < firstRow);
  assert.doesNotMatch(html, /class="sf-metric-card"/);
  assert.doesNotMatch(html, /class="panel admin-actions-panel"/);
  assert.match(html, /<details class="admin-advanced-filters" data-advanced-filters>\s*<summary>/);
  assert.doesNotMatch(html, /<details class="admin-advanced-filters"[^>]*\sopen/);
  assert.equal((html.match(/class="admin-summary-item"/g) ?? []).length, 4);
  assert.match(html, /<strong>1<\/strong> instituições/);
  assert.match(html, /aria-label="Enviar logomarca de Instituição fictícia/);
  assert.match(html, /<span class="status-pill status-pill-active">Ativo<\/span>/);

  const primary = html.split('<div class="filters-grid">')[1].split("</div>")[0];
  const advanced = html.split('<div class="advanced-filters-grid">')[1].split("</div>")[0];
  for (const name of ["q", "status", "sort"]) {
    assert.match(primary, new RegExp('name="' + name + '"'));
    assert.doesNotMatch(advanced, new RegExp('name="' + name + '"'));
  }
  for (const name of ["logoStatus", "bankCode", "ispb", "institutionType", "missing"]) {
    assert.match(advanced, new RegExp('name="' + name + '"'));
    assert.doesNotMatch(primary, new RegExp('name="' + name + '"'));
  }
}

async function adminInstitutionsPagePreservesSelectedFiltersAndLinksWithoutJavaScript(): Promise<void> {
  const url = new URL(
    "http://localhost/admin/instituicoes?q=teste&status=inactive&sort=bankCode&order=desc&logoStatus=fallback&bankCode=001&ispb=123&institutionType=bank&missing=logo&pageSize=10",
  );
  const html = await renderWithApi(populated, url);

  assert.match(html, /name="q" type="search" value="teste"/);
  assert.match(html, /<option value="inactive" selected>Inativos<\/option>/);
  assert.match(html, /<option value="bankCode" selected>Código bancário<\/option>/);
  assert.match(html, /<option value="fallback" selected>Fallback<\/option>/);
  assert.match(html, /name="order" value="desc"/);
  assert.match(html, /name="pageSize" value="10"/);
  assert.match(html, /<span class="advanced-count" aria-label="5 filtros avançados ativos">5 ativos<\/span>/);
  assert.equal((html.match(/class="active-filter-chip"/g) ?? []).length, 5);
  assert.match(html, /aria-label="Remover filtro Logo: Fallback"/);
  assert.match(html, /href="\/admin\/instituicoes\?q=teste&amp;status=inactive/);
  assert.match(html, /<form method="get" action="\/admin\/instituicoes"/);
  assert.match(html, /href="\/admin\/instituicoes">Limpar filtros<\/a>/);

  const unsafe = await renderWithApi(populated, new URL("http://localhost/admin/instituicoes?q=%3Cscript%3E"));
  assert.match(unsafe, /value="&lt;script&gt;"/);
  assert.doesNotMatch(unsafe, /value="<script>"/);
}

async function adminInstitutionsPageDistinguishesEmptyCatalogFromNoResults(): Promise<void> {
  const empty = {
    institutions: [],
    summary: { total: 0, active: 0, withLogo: 0, usingFallback: 0, updatedAt: null },
  };
  const noData = await renderWithApi(empty);
  const noMatch = await renderWithApi(empty, new URL("http://localhost/admin/instituicoes?q=ausente"));

  assert.match(noData, /Nenhuma instituição cadastrada/);
  assert.doesNotMatch(noData, /Nenhum resultado para os filtros aplicados/);
  assert.match(noMatch, /Nenhum resultado para os filtros aplicados/);
  assert.doesNotMatch(noMatch, /Nenhuma instituição cadastrada/);
}

async function adminInstitutionsPageRetainsMasterAccessFailure(): Promise<void> {
  const html = await renderWithApi(
    { error: { message: "Permissão master necessária." } },
    undefined,
    403,
  );
  assert.match(html, /Acesso restrito/);
  assert.match(html, /Permissão master necessária/);
  assert.doesNotMatch(html, /Catálogo global/);
}

async function renderWithApi(body: unknown, url?: URL, status = 200): Promise<string> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  try {
    return await renderAdminInstitutionsPage("fake-session", url);
  } finally {
    globalThis.fetch = originalFetch;
  }
}
