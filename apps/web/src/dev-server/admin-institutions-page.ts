import { apiGet } from "./api.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { sharedShellStyles } from "./shared-styles.js";

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
  const result = await apiGet<AdminInstitutionsResponse>(
    token,
    `/api/admin/institutions${query}`,
  );

  if (!result.ok) {
    return renderAuthenticatedShellDocument({
      activePathname: "/admin/instituicoes",
      currentLabel: "Admin - Instituições",
      showAdminNavigation: false,
      styles: adminPageStyles(),
      content: `
        <section class="panel admin-denied" role="alert">
          <p class="eyebrow">Acesso restrito</p>
          <h1>Admin global</h1>
          <p class="error">${escapeHtml(result.error)}</p>
          <p class="muted">A tela de instituições financeiras só fica disponível para usuários master configurados no backend.</p>
          <a class="button-link secondary-link" href="/dashboard">Voltar ao Dashboard</a>
        </section>
      `,
    });
  }

  const { institutions, summary, pagination } = result.data;
  const params = url?.searchParams ?? new URLSearchParams();

  return renderAuthenticatedShellDocument({
    activePathname: "/admin/instituicoes",
    currentLabel: "Admin - Instituições",
    showAdminNavigation: true,
    styles: adminPageStyles(),
    content: `
      <section class="admin-heading">
        <div>
          <p class="eyebrow">Admin global</p>
          <h1>Instituições financeiras</h1>
          <p class="muted">Catálogo compartilhado por todos os usuários para contas e cartões.</p>
        </div>
        <button type="button" class="button-link" data-admin-refresh data-api-path="/api/admin/institutions/refresh${escapeHtml(query)}">Atualizar bancos</button>
      </section>
      <section class="summary-grid" aria-label="Resumo do catálogo">
        ${renderSummaryCard("Instituições", summary.total, "itens encontrados")}
        ${renderSummaryCard("Ativas", summary.active, "disponíveis para seleção")}
        ${renderSummaryCard("Com logo", summary.withLogo, "assets locais ou R2")}
        ${renderSummaryCard("Fallback", summary.usingFallback, "usando iniciais acessíveis")}
      </section>
      <section class="panel filters-panel">
        <form method="get" action="/admin/instituicoes" class="filters-grid">
          <label class="wide">Busca geral<input name="q" type="search" value="${escapeHtml(params.get("q") ?? "")}" placeholder="Nome, chave interna, COMPE ou ISPB" /></label>
          <label>Status<select name="status">${renderSelectOptions([["all", "Todos"], ["active", "Ativos"], ["inactive", "Inativos"]], params.get("status") ?? "all")}</select></label>
          <label>Situação da logo<select name="logoStatus">${renderSelectOptions([["all", "Todas"], ["r2_asset", "Logo R2"], ["local_asset", "Logo local"], ["fallback", "Fallback"]], params.get("logoStatus") ?? "all")}</select></label>
          <label>Código bancário<input name="bankCode" inputmode="numeric" value="${escapeHtml(params.get("bankCode") ?? "")}" placeholder="001" /></label>
          <label>ISPB<input name="ispb" value="${escapeHtml(params.get("ispb") ?? "")}" placeholder="Busca parcial" /></label>
          <label>Tipo<select name="institutionType">${renderSelectOptions([["", "Todos"], ["bank", "Banco"], ["cooperative", "Cooperativa"], ["payment_institution", "Instituição de pagamento"], ["digital_wallet", "Carteira digital"], ["demo", "Demo"]], params.get("institutionType") ?? "")}</select></label>
          <label>Pendências<select name="missing">${renderSelectOptions([["", "Todas"], ["bankCode", "Sem código bancário"], ["ispb", "Sem ISPB"], ["logo", "Sem logo"]], params.get("missing") ?? "")}</select></label>
          <label>Ordenar<select name="sort">${renderSelectOptions([["label", "Nome"], ["key", "Chave interna"], ["bankCode", "Código bancário"], ["ispb", "ISPB"], ["status", "Status"], ["updatedAt", "Atualização"]], params.get("sort") ?? "label")}</select></label>
          <input type="hidden" name="order" value="${escapeHtml(params.get("order") ?? "asc")}" />
          <div class="filter-actions">
            <button type="submit">Aplicar filtros</button>
            <a class="button-link secondary-link" href="/admin/instituicoes">Limpar filtros</a>
          </div>
        </form>
      </section>
      <section class="panel admin-actions-panel">
        <div>
          <h2>Atualização do catálogo</h2>
          <p class="muted">A ação abaixo sincroniza os padrões sem duplicar instituições nem apagar logomarcas já enviadas.</p>
          <p class="muted">Última atualização nesta tela: ${escapeHtml(summary.updatedAt ?? "ainda não executada")}</p>
        </div>
        <p class="form-status muted" data-admin-refresh-status aria-live="polite">Pronto para verificar o catálogo global.</p>
      </section>
      <section class="panel list-panel">
        <div class="section-heading">
          <div>
            <h2>Catálogo global</h2>
            <p class="muted">Código bancário oficial, chave interna, status e situação visual de cada instituição.</p>
          </div>
          <span>${pagination?.total ?? institutions.length} itens</span>
        </div>
        <div class="admin-institution-list">
          ${institutions.map((institution) => renderInstitutionRow(institution, query)).join("") || renderEmptyState()}
        </div>
      </section>
      ${adminRefreshScript()}
      ${adminLogoUploadScript()}
      ${adminStatusScript()}
    `,
  });
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

function renderSummaryCard(title: string, value: number, subtitle: string): string {
  return `<article class="metric-card"><span>${escapeHtml(title)}</span><strong>${value}</strong><p>${escapeHtml(subtitle)}</p></article>`;
}

function renderInstitutionRow(institution: AdminInstitutionView, query: string): string {
  const statusAction = institution.status === "active" ? "INACTIVE" : "ACTIVE";
  const statusLabel = institution.status === "active" ? "Desativar" : "Ativar";

  return `
    <article class="admin-institution-row">
      <div class="institution-logo-preview">
        ${renderLogoPreview(institution)}
      </div>
      <div class="institution-main">
        <strong>${escapeHtml(institution.label)}</strong>
        <span>${escapeHtml(institution.description)}</span>
        <code>chave interna: ${escapeHtml(institution.key)}</code>
      </div>
      <dl class="institution-meta">
        <div><dt>Status</dt><dd>${escapeHtml(formatStatus(institution.status))}</dd></div>
        <div><dt>Código</dt><dd>${escapeHtml(institution.bankCode ?? "não informado")}</dd></div>
        <div><dt>Logo</dt><dd>${escapeHtml(formatLogoStatus(institution.logoStatus))}</dd></div>
        <div><dt>ISPB</dt><dd>${escapeHtml(institution.ispb ?? "não informado")}</dd></div>
        <div><dt>Tipo</dt><dd>${escapeHtml(formatInstitutionType(institution.institutionType))}</dd></div>
        <div><dt>Identificador técnico</dt><dd>${escapeHtml(institution.financialInstitutionCode)}</dd></div>
      </dl>
      <div class="institution-actions">
        <form class="status-form" data-status-form data-api-path="/api/admin/institutions/${escapeHtml(encodeURIComponent(institution.key))}/status${escapeHtml(query)}" data-next-status="${statusAction}">
          <button type="submit" class="secondary-button">${statusLabel}</button>
        </form>
        <form class="logo-upload-form" data-logo-upload-form data-api-path="/api/admin/institutions/${escapeHtml(encodeURIComponent(institution.key))}/logo${escapeHtml(query)}">
          <label class="logo-upload-control">Arquivo
            <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required />
          </label>
          <button type="submit" class="secondary-button">${institution.logoAssetPath ? "Substituir logomarca" : "Enviar logomarca"}</button>
          <p class="form-status muted" data-logo-upload-status aria-live="polite">PNG, JPG ou WebP até o limite configurado.</p>
        </form>
      </div>
    </article>
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

function renderEmptyState(): string {
  return `<div class="empty-state"><strong>Nenhuma instituição encontrada.</strong><p class="muted">Ajuste os filtros ou use Limpar filtros para voltar à lista completa.</p></div>`;
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

          const response = await fetch(button.dataset.apiPath, {
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
            window.setTimeout(() => window.location.reload(), 700);
            return;
          }

          button.disabled = false;
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
          const response = await fetch(form.dataset.apiPath, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: form.dataset.nextStatus }),
          });

          if (response.ok) {
            window.setTimeout(() => window.location.reload(), 450);
            return;
          }

          if (button) button.disabled = false;
          const body = await response.json().catch(() => ({}));
          window.alert((body.error && body.error.message) || "Não foi possível alterar o status.");
        });
      });
    </script>
  `;
}

function adminPageStyles(): string {
  return `
    ${sharedShellStyles()}
    main { display: grid; gap: 20px; margin: 0 auto; max-width: 1440px; padding: 24px; width: 100%; }
    .admin-heading { align-items: end; display: flex; gap: 16px; justify-content: space-between; }
    .admin-heading > div { display: grid; gap: 6px; max-width: 760px; }
    .summary-grid { display: grid; gap: 16px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .metric-card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 8px; padding: 18px; }
    .metric-card span { color: var(--muted); font-size: 0.86rem; font-weight: 800; text-transform: uppercase; }
    .metric-card strong { color: var(--text); font-size: 1.8rem; }
    .metric-card p { color: var(--muted); margin: 0; }
    .filters-grid { display: grid; gap: 12px; grid-template-columns: minmax(220px, 1.4fr) repeat(4, minmax(150px, 1fr)); }
    .filters-grid .wide { grid-column: span 2; }
    .filter-actions { align-items: end; display: flex; gap: 10px; }
    .admin-actions-panel { align-items: start; display: flex; justify-content: space-between; }
    .admin-institution-list { display: grid; gap: 12px; }
    .admin-institution-row { align-items: center; border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 14px; grid-template-columns: 64px minmax(240px, 1fr) minmax(320px, 0.9fr) minmax(260px, auto); padding: 14px; }
    .institution-logo-preview { align-items: center; background: var(--primary-soft); border-radius: 8px; color: var(--primary); display: flex; font-weight: 900; height: 52px; justify-content: center; overflow: hidden; width: 52px; }
    .institution-logo-preview img { height: 44px; max-width: 44px; object-fit: contain; }
    .institution-main { display: grid; gap: 4px; }
    .institution-main span { color: var(--muted); }
    .institution-main code { background: var(--background); border-radius: 999px; color: var(--muted); font-size: 0.78rem; justify-self: start; padding: 4px 8px; }
    .institution-meta { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; }
    .institution-meta div { display: grid; gap: 2px; }
    .institution-meta dt { color: var(--muted); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; }
    .institution-meta dd { margin: 0; }
    .institution-actions { display: grid; gap: 10px; }
    .status-form { display: flex; justify-content: flex-start; }
    .logo-upload-form { display: grid; gap: 8px; }
    .logo-upload-control { color: var(--muted); display: grid; font-size: 0.82rem; gap: 4px; }
    .logo-upload-control input { max-width: 240px; }
    .admin-denied { max-width: 760px; }
    .form-status { margin: 0; }
    @media (max-width: 1240px) { .admin-institution-row { grid-template-columns: 52px 1fr; } .institution-meta, .institution-actions { grid-column: 1 / -1; } }
    @media (max-width: 980px) { .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .filters-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 640px) { .admin-heading, .admin-actions-panel, .filters-grid { display: grid; grid-template-columns: 1fr; } .filters-grid .wide { grid-column: auto; } .summary-grid { grid-template-columns: 1fr; } }
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
