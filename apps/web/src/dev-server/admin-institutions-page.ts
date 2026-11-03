import {
  renderPageContainer,
  renderPageHeader,
  renderPermissionState,
  renderRecoverableError,
} from "../design-system/primitives.js";
import { apiGet } from "./api.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { dialogScript } from "./shared-styles.js";
import { adminPageStyles } from "./admin-institutions-styles.js";
import { getSecondaryRoutePageViewModel } from "./secondary-routes-view-model.js";

const adminInstitutionsPageModel = getSecondaryRoutePageViewModel("adminInstitutions");

interface AdminInstitutionView {
  key: string;
  label: string;
  description: string;
  fallbackLabel: string;
  status: string;
  financialInstitutionCode: string;
  bankCode?: string;
  ispb?: string;
  institutionType?: string;
  logoAssetPath?: string;
  logoObjectKey?: string;
  logoUploadedAt?: string;
  logoStatus: "local_asset" | "r2_asset" | "fallback";
}

interface AdminInstitutionsResponse {
  institutions: AdminInstitutionView[];
  summary: {
    total: number;
    active: number;
    withLogo: number;
    usingFallback: number;
    updatedAt: string | null;
  };
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export async function renderAdminInstitutionsPage(token: string, url?: URL): Promise<string> {
  const query = url ? buildAdminApiQuery(url.searchParams) : "";
  const result = await apiGet<AdminInstitutionsResponse>(token, `/api/admin/institutions${query}`);

  if (!result.ok) {
    const isMasterDenied = result.status === 403;
    const params = url?.searchParams ?? new URLSearchParams();
    const content = isMasterDenied
      ? renderPermissionState({
          title: "Acesso restrito",
          description: `${result.error} A tela de instituições financeiras só fica disponível para usuários master configurados no backend.`,
          actionHtml: '<a class="button-link secondary-link" href="/dashboard">Voltar ao Dashboard</a>',
        })
      : `${renderPageHeader({
          eyebrow: adminInstitutionsPageModel.eyebrow,
          title: adminInstitutionsPageModel.title,
          description: adminInstitutionsPageModel.description,
        })}${renderRecoverableError({
          title: "Não foi possível carregar o catálogo de instituições",
          description: result.error,
          actionHtml: `<a class="button-link" href="/admin/instituicoes${escapeHtml(query)}">Tentar novamente</a>`,
        })}${renderInstitutionFilters(params)}`;

    return renderAuthenticatedShellDocument({
      activePathname: "/admin/instituicoes",
      currentLabel: "Admin - Instituições",
      showAdminNavigation: false,
      styles: adminPageStyles(),
      content: renderPageContainer({
        className: "secondary-route-page admin-institutions-page",
        childrenHtml: `<div data-secondary-route-foundation="${adminInstitutionsPageModel.id}" data-route-archetype="${adminInstitutionsPageModel.archetype}" data-route-audience="${adminInstitutionsPageModel.audience}" data-operational-mode="${adminInstitutionsPageModel.operationalMode}">${content}</div>`,
      }),
    });
  }

  const { institutions, summary, pagination } = result.data;
  const params = url?.searchParams ?? new URLSearchParams();
  const hasAppliedFilters = hasAnyInstitutionFilter(params);

  return renderAuthenticatedShellDocument({
    activePathname: "/admin/instituicoes",
    currentLabel: "Admin - Instituições",
    showAdminNavigation: true,
    styles: adminPageStyles(),
    content: renderPageContainer({
      className: "secondary-route-page admin-institutions-page",
      childrenHtml: `<div data-secondary-route-foundation="${adminInstitutionsPageModel.id}" data-route-archetype="${adminInstitutionsPageModel.archetype}" data-route-audience="${adminInstitutionsPageModel.audience}" data-operational-mode="${adminInstitutionsPageModel.operationalMode}">
      ${renderPageHeader({
        eyebrow: adminInstitutionsPageModel.eyebrow,
        title: adminInstitutionsPageModel.title,
        description: adminInstitutionsPageModel.description,
        actionsHtml: `<button type="button" class="button-link" data-admin-refresh data-api-path="/api/admin/institutions/refresh" data-api-query="${escapeHtml(query)}">Atualizar bancos</button>`,
      })}
      ${renderInstitutionFilters(params)}
      <section class="panel list-panel" aria-labelledby="admin-catalog-heading">
        <div class="section-heading">
          <div>
            <h2 id="admin-catalog-heading">Catálogo global</h2>
            <p class="muted">Selecione a logomarca para enviar ou substituir a imagem de cada instituição.</p>
          </div>
          <span>${pagination?.total ?? institutions.length} itens</span>
        </div>
        <div class="catalog-summary" aria-label="Resumo do catálogo">
          <span class="admin-summary-item"><strong>${summary.total}</strong> instituições</span>
          <span class="admin-summary-item"><strong>${summary.active}</strong> ativas</span>
          <span class="admin-summary-item"><strong>${summary.withLogo}</strong> com logo</span>
          <span class="admin-summary-item"><strong>${summary.usingFallback}</strong> com fallback</span>
        </div>
        <div class="catalog-refresh-meta">
          <span class="muted">Atualizado: ${escapeHtml(summary.updatedAt ?? "ainda não executado")}</span>
          <p class="form-status muted" data-admin-refresh-status aria-live="polite">Pronto para atualizar o catálogo global.</p>
        </div>
        <div class="admin-institution-list">
          ${institutions.map((institution) => renderInstitutionRow(institution, query)).join("") || renderEmptyState(hasAppliedFilters)}
        </div>
      </section>
      ${institutions.map((institution) => renderLogoUploadDialog(institution, query)).join("")}
      ${adminRefreshScript()}
      ${dialogScript()}
      ${adminLogoUploadScript()}
      ${adminStatusScript()}
      </div>`,
    }),
  });
}

function renderInstitutionFilters(params: URLSearchParams): string {
  const advancedFilterCount = countAdvancedFilters(params);
  return `
<section class="panel filters-panel" aria-labelledby="institution-filters-heading">
        <h2 id="institution-filters-heading">Buscar no catálogo</h2>
        <form method="get" action="/admin/instituicoes" class="admin-filter-form">
          <div class="filters-grid">
            <label class="wide">Busca geral<input name="q" type="search" value="${escapeHtml(params.get("q") ?? "")}" placeholder="Nome, chave, COMPE ou ISPB" /></label>
            <label>Status<select name="status">${renderSelectOptions(
              [
                ["all", "Todos"],
                ["active", "Ativos"],
                ["inactive", "Inativos"],
              ],
              params.get("status") ?? "all",
            )}</select></label>
            <label>Ordenar<select name="sort">${renderSelectOptions(
              [
                ["label", "Nome"],
                ["key", "Chave interna"],
                ["bankCode", "Código bancário"],
                ["ispb", "ISPB"],
                ["status", "Status"],
                ["updatedAt", "Atualização"],
              ],
              params.get("sort") ?? "label",
            )}</select></label>
          </div>
          <details class="admin-advanced-filters" data-advanced-filters>
            <summary>Filtros avançados${advancedFilterCount ? ` <span class="advanced-count" aria-label="${advancedFilterCount} filtros avançados ativos">${advancedFilterCount} ativos</span>` : ""}</summary>
            <div class="advanced-filters-grid">
              <label>Situação da logo<select name="logoStatus">${renderSelectOptions(
                [
                  ["all", "Todas"],
                  ["r2_asset", "Logo R2"],
                  ["local_asset", "Logo local"],
                  ["fallback", "Fallback"],
                ],
                params.get("logoStatus") ?? "all",
              )}</select></label>
              <label>Código bancário<input name="bankCode" inputmode="numeric" value="${escapeHtml(params.get("bankCode") ?? "")}" placeholder="001" /></label>
              <label>ISPB<input name="ispb" value="${escapeHtml(params.get("ispb") ?? "")}" placeholder="Busca parcial" /></label>
              <label>Tipo<select name="institutionType">${renderSelectOptions(
                [
                  ["", "Todos"],
                  ["bank", "Banco"],
                  ["cooperative", "Cooperativa"],
                  ["payment_institution", "Instituição de pagamento"],
                  ["digital_wallet", "Carteira digital"],
                  ["demo", "Demo"],
                ],
                params.get("institutionType") ?? "",
              )}</select></label>
              <label>Pendências<select name="missing">${renderSelectOptions(
                [
                  ["", "Todas"],
                  ["bankCode", "Sem código bancário"],
                  ["ispb", "Sem ISPB"],
                  ["logo", "Sem logo"],
                ],
                params.get("missing") ?? "",
              )}</select></label>
            </div>
          </details>
          ${renderActiveAdvancedFilters(params)}
          <input type="hidden" name="order" value="${escapeHtml(params.get("order") ?? "asc")}" />
          ${params.get("pageSize") ? `<input type="hidden" name="pageSize" value="${escapeHtml(params.get("pageSize") ?? "")}" />` : ""}
          <div class="filter-actions">
            <button type="submit">Aplicar filtros</button>
            <a class="button-link secondary-link" href="/admin/instituicoes">Limpar filtros</a>
          </div>
        </form>
      </section>
  `;
}

function buildAdminApiQuery(params: URLSearchParams): string {
  const allowed = new URLSearchParams();

  for (const key of [
    "q",
    "status",
    "logoStatus",
    "bankCode",
    "ispb",
    "institutionType",
    "missing",
    "page",
    "pageSize",
    "sort",
    "order",
  ]) {
    const value = params.get(key)?.trim();

    if (value) allowed.set(key, value);
  }

  const query = allowed.toString();

  return query ? `?${query}` : "";
}

function countAdvancedFilters(params: URLSearchParams): number {
  return ["logoStatus", "bankCode", "ispb", "institutionType", "missing"].filter((key) => {
    const value = params.get(key)?.trim();
    return Boolean(value && value !== "all");
  }).length;
}

function hasAnyInstitutionFilter(params: URLSearchParams): boolean {
  return ["q", "status", "logoStatus", "bankCode", "ispb", "institutionType", "missing"].some(
    (key) => {
      const value = params.get(key)?.trim();
      return Boolean(value && value !== "all");
    },
  );
}

function renderActiveAdvancedFilters(params: URLSearchParams): string {
  const definitions: Array<[string, string]> = [
    ["logoStatus", "Logo"],
    ["bankCode", "Código"],
    ["ispb", "ISPB"],
    ["institutionType", "Tipo"],
    ["missing", "Pendências"],
  ];
  const active = definitions.flatMap(([key, label]) => {
    const value = params.get(key)?.trim();
    return value && value !== "all" ? [{ key, label, value }] : [];
  });

  if (!active.length) return "";
  return `<div class="active-filter-list" aria-label="Filtros avançados aplicados">
    <span class="active-filter-caption">Filtros ativos:</span>
    ${active
      .map(({ key, label, value }) => {
        const next = new URLSearchParams(params);
        next.delete(key);
        next.delete("page");
        const title = `${label}: ${formatAdvancedFilterValue(key, value)}`;
        return `<a class="active-filter-chip" href="${escapeHtml(`/admin/instituicoes${buildAdminApiQuery(next)}`)}" aria-label="Remover filtro ${escapeHtml(title)}">${escapeHtml(title)} <span aria-hidden="true">×</span></a>`;
      })
      .join("")}
  </div>`;
}

function formatAdvancedFilterValue(key: string, value: string): string {
  const labels: Record<string, Record<string, string>> = {
    logoStatus: { r2_asset: "Logo R2", local_asset: "Logo local", fallback: "Fallback" },
    institutionType: {
      bank: "Banco",
      cooperative: "Cooperativa",
      payment_institution: "Instituição de pagamento",
      digital_wallet: "Carteira digital",
      demo: "Demo",
    },
    missing: { bankCode: "Sem código bancário", ispb: "Sem ISPB", logo: "Sem logo" },
  };
  return labels[key]?.[value] ?? value;
}

function renderInstitutionRow(institution: AdminInstitutionView, query: string): string {
  const statusAction = institution.status === "active" ? "INACTIVE" : "ACTIVE";
  const statusLabel = institution.status === "active" ? "Desativar" : "Ativar";
  const dialogId = logoDialogId(institution);
  const logoActionLabel = institution.logoAssetPath
    ? `Substituir logomarca de ${institution.label}`
    : `Enviar logomarca de ${institution.label}`;

  return `
    <article class="admin-institution-row">
      <button type="button" class="institution-logo-trigger" data-open-dialog="${dialogId}" aria-label="${escapeHtml(logoActionLabel)}" title="${escapeHtml(logoActionLabel)}">
        ${renderLogoPreview(institution)}
        <span class="logo-upload-hint" aria-hidden="true">Upload</span>
      </button>
      <div class="institution-main">
        <div class="institution-title-line">
          <strong>${escapeHtml(institution.label)}</strong>
          <span class="status-pill ${institution.status === "active" ? "status-pill-active" : ""}">${escapeHtml(formatStatus(institution.status))}</span>
        </div>
        <span>${escapeHtml(institution.description)}</span>
        <code>chave: ${escapeHtml(institution.key)}</code>
      </div>
      <dl class="institution-meta">
        <div><dt>Código</dt><dd>${escapeHtml(institution.bankCode ?? "não informado")}</dd></div>
        <div><dt>ISPB</dt><dd>${escapeHtml(institution.ispb ?? "não informado")}</dd></div>
        <div><dt>Tipo</dt><dd>${escapeHtml(formatInstitutionType(institution.institutionType))}</dd></div>
        <div><dt>Logo</dt><dd>${escapeHtml(formatLogoStatus(institution.logoStatus))}</dd></div>
        <div><dt>ID técnico</dt><dd>${escapeHtml(institution.financialInstitutionCode)}</dd></div>
      </dl>
      <div class="institution-actions">
        <form class="status-form" data-status-form data-api-path="/api/admin/institutions/${escapeHtml(encodeURIComponent(institution.key))}/status${escapeHtml(query)}" data-next-status="${statusAction}">
          <button type="submit" class="secondary-button">${statusLabel}</button>
        </form>
      </div>
    </article>
  `;
}

function renderLogoUploadDialog(institution: AdminInstitutionView, query: string): string {
  const dialogId = logoDialogId(institution);

  return `
    <dialog class="master-dialog logo-upload-dialog" id="${dialogId}" aria-labelledby="${dialogId}-title">
      <form method="dialog" class="dialog-close-form">
        <button type="submit" class="secondary-button">Fechar</button>
      </form>
      <div class="logo-dialog-layout">
        <div class="logo-dialog-preview" aria-hidden="true">
          ${renderLogoPreview(institution)}
        </div>
        <div class="dialog-heading">
          <p class="eyebrow">Logomarca</p>
          <h2 id="${dialogId}-title">${escapeHtml(institution.label)}</h2>
          <p class="muted">Envie PNG, JPG ou WebP para substituir a imagem usada no catálogo.</p>
        </div>
      </div>
      <form class="logo-upload-form" data-logo-upload-form data-api-path="/api/admin/institutions/${escapeHtml(encodeURIComponent(institution.key))}/logo${escapeHtml(query)}">
        <label class="logo-upload-control">Arquivo da logomarca
          <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required />
        </label>
        <button type="submit">${institution.logoAssetPath ? "Substituir logomarca" : "Enviar logomarca"}</button>
        <p class="form-status muted" data-logo-upload-status aria-live="polite">A imagem será aplicada após o envio.</p>
      </form>
    </dialog>
  `;
}

function renderLogoPreview(institution: AdminInstitutionView): string {
  if (institution.logoAssetPath) {
    return `<img src="${escapeHtml(institution.logoAssetPath)}" alt="Logo ${escapeHtml(institution.label)}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false" /><span hidden>${escapeHtml(institution.fallbackLabel)}</span>`;
  }

  return `<span>${escapeHtml(institution.fallbackLabel)}</span>`;
}

function renderSelectOptions(options: Array<[string, string]>, selected: string): string {
  return options
    .map(
      ([value, label]) =>
        `<option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>${escapeHtml(label)}</option>`,
    )
    .join("");
}

function renderEmptyState(filtered: boolean): string {
  return filtered
    ? `<div class="empty-state"><strong>Nenhum resultado para os filtros aplicados.</strong><p class="muted">Ajuste os filtros ou use Limpar filtros para voltar à lista completa.</p></div>`
    : `<div class="empty-state"><strong>Nenhuma instituição cadastrada.</strong><p class="muted">Use Atualizar bancos para sincronizar o catálogo.</p></div>`;
}

function logoDialogId(institution: AdminInstitutionView): string {
  return `logo-upload-${encodeURIComponent(institution.key)
    .replace(/%/g, "-")
    .replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

function formatStatus(status: string): string {
  if (status === "active") return "Ativo";
  if (status === "inactive") return "Inativo";
  return status;
}

function formatLogoStatus(status: AdminInstitutionView["logoStatus"]): string {
  if (status === "r2_asset") return "Logo R2";
  if (status === "local_asset") return "Logo local";
  return "Fallback por iniciais";
}

function formatInstitutionType(type: string | undefined): string {
  if (type === "bank") return "Banco";
  if (type === "cooperative") return "Cooperativa";
  if (type === "payment_institution") return "Instituição de pagamento";
  if (type === "digital_wallet") return "Carteira digital";
  if (type === "demo") return "Demo";
  return type ?? "não informado";
}

function adminRefreshScript(): string {
  return `
    <script>
      document.querySelectorAll("[data-admin-refresh]").forEach((button) => {
        const status = document.querySelector("[data-admin-refresh-status]");
        button.addEventListener("click", async () => {
          button.disabled = true;
          if (status) {
            status.className = "form-status muted";
            status.textContent = "Atualizando catálogo...";
          }

          const refreshPath = button.dataset.apiPath + (button.dataset.apiQuery || "");
          let succeeded = false;
          try {
            const response = await fetch(refreshPath, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ source: "admin" }),
            });
            const body = await response.json().catch(() => ({}));

            if (status) {
              status.className = response.ok ? "form-status success" : "form-status error";
              status.textContent = response.ok
                ? ((body.operation && body.operation.message) || "Catálogo atualizado.")
                : ((body.error && body.error.message) || "Não foi possível atualizar o catálogo.");
            }

            if (response.ok) {
              succeeded = true;
              window.setTimeout(() => window.location.reload(), 700);
            }
          } catch {
            if (status) {
              status.className = "form-status error";
              status.textContent = "Não foi possível conectar com a API. Tente novamente.";
            }
          } finally {
            if (!succeeded) button.disabled = false;
          }
        });
      });
    </script>
  `;
}

function adminLogoUploadScript(): string {
  return `
    <script>
      function readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
          reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
          reader.readAsDataURL(file);
        });
      }

      document.querySelectorAll("[data-logo-upload-form]").forEach((form) => {
        const input = form.querySelector('input[type="file"]');
        const button = form.querySelector('button[type="submit"]');
        const status = form.querySelector("[data-logo-upload-status]");
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const file = input && input.files ? input.files[0] : undefined;

          if (!file) {
            if (status) {
              status.className = "form-status error";
              status.textContent = "Selecione uma imagem antes de enviar.";
            }
            return;
          }

          if (button) button.disabled = true;
          if (status) {
            status.className = "form-status muted";
            status.textContent = "Enviando logomarca...";
          }

          try {
            const contentBase64 = await readFileAsBase64(file);
            const response = await fetch(form.dataset.apiPath, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ fileName: file.name, mimeType: file.type, contentBase64 }),
            });
            const body = await response.json().catch(() => ({}));

            if (status) {
              status.className = response.ok ? "form-status success" : "form-status error";
              status.textContent = response.ok
                ? ((body.operation && body.operation.message) || "Logomarca enviada.")
                : ((body.error && body.error.message) || "Não foi possível enviar a logomarca.");
            }

            if (response.ok) {
              window.setTimeout(() => window.location.reload(), 700);
              return;
            }
          } catch {
            if (status) {
              status.className = "form-status error";
              status.textContent = "Não foi possível conectar com a API. Tente novamente.";
            }
          }

          if (button) button.disabled = false;
        });
      });
    </script>
  `;
}

function adminStatusScript(): string {
  return `
    <script>
      document.querySelectorAll("[data-status-form]").forEach((form) => {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const button = form.querySelector('button[type="submit"]');
          if (button) button.disabled = true;
          let succeeded = false;
          try {
            const response = await fetch(form.dataset.apiPath, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ status: form.dataset.nextStatus }),
            });

            if (response.ok) {
              succeeded = true;
              window.setTimeout(() => window.location.reload(), 450);
              return;
            }

            const body = await response.json().catch(() => ({}));
            window.alert((body.error && body.error.message) || "Não foi possível alterar o status.");
          } catch {
            window.alert("Não foi possível conectar com a API. Tente novamente.");
          } finally {
            if (!succeeded && button) button.disabled = false;
          }
        });
      });
    </script>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
