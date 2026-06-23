import { apiGet } from "./api.js";
import { privateRoutes } from "./routes.js";

interface FinancialProfilesResponse {
  activeProfileId?: string;
  profiles: FinancialProfileRecord[];
}

interface FinancialProfileRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
}

export async function renderSettingsPage(token: string): Promise<string> {
  const profiles = await apiGet<FinancialProfilesResponse>(token, "/api/financial-profiles");

  if (!profiles.ok) {
    return renderShell(
      "Configurações",
      `
        <section class="panel placeholder-state">
          <p class="eyebrow">Erro ao carregar perfis</p>
          <h1>Configurações</h1>
          <p class="error" role="alert">${escapeHtml(profiles.error)}</p>
          <a class="button-link" href="/configuracoes">Tentar novamente</a>
        </section>
      `,
    );
  }

  return renderShell(
    "Configurações",
    `
      <section class="page-heading">
        <p class="eyebrow">Tenant operacional</p>
        <h1>Perfis financeiros</h1>
        <p class="muted">Escolha, crie ou arquive contextos como pessoal, família, MEI e negócio sem misturar dados financeiros.</p>
      </section>
      <section class="workspace-grid wide-form">
        <section class="panel list-panel">
          <div class="section-heading">
            <h2>Perfis disponíveis</h2>
            <span>${profiles.data.profiles.length} itens</span>
          </div>
          <div class="rows maintenance-rows">
            ${
              profiles.data.profiles
                .map((profile) => renderProfileRow(profile, profiles.data.activeProfileId))
                .join("") ||
              renderEmptyState(
                "Nenhum perfil financeiro.",
                "Crie um perfil para começar a operar dados financeiros.",
              )
            }
          </div>
        </section>
        <section class="panel form-panel">
          <h2>Novo perfil</h2>
          <form data-api-form data-api-path="/api/financial-profiles">
            <label>Nome<input name="name" required placeholder="Ex.: Família" /></label>
            <label>Tipo
              <select name="kind" required>
                ${renderProfileKindOptions()}
              </select>
            </label>
            <button type="submit">Criar perfil</button>
          </form>
        </section>
      </section>
      ${settingsScript()}
    `,
  );
}

function renderProfileRow(
  profile: FinancialProfileRecord,
  activeProfileId: string | undefined,
): string {
  const isActive = profile.status === "active";
  const isSelected = profile.id === activeProfileId;
  const profileQuery = `profileId=${encodeURIComponent(profile.id)}`;

  return `
    <article class="maintenance-item">
      <div class="maintenance-summary">
        <div>
          <strong>${escapeHtml(profile.name)}${isSelected ? " (selecionado)" : ""}</strong>
          <span>${escapeHtml(formatProfileKind(profile.kind))} - ${escapeHtml(formatProfileStatus(profile.status))}</span>
        </div>
      </div>
      <div class="maintenance-actions" aria-label="Ações do perfil ${escapeHtml(profile.name)}">
        ${
          isActive
            ? `<div class="profile-links" aria-label="Abrir áreas com este perfil">
                <a class="button-link secondary-link" href="/dashboard?${profileQuery}">Dashboard</a>
                <a class="button-link secondary-link" href="/contas?${profileQuery}">Contas</a>
                <a class="button-link secondary-link" href="/lancamentos?${profileQuery}">Extrato</a>
              </div>`
            : ""
        }
        <form data-api-form data-api-method="PATCH" data-api-path="/api/financial-profiles/${escapeHtml(profile.id)}" class="inline-edit-form">
          <label>Nome<input name="name" value="${escapeHtml(profile.name)}" required /></label>
          <label>Tipo<select name="kind">${renderProfileKindOptions(profile.kind)}</select></label>
          <button type="submit">Salvar perfil</button>
        </form>
        ${
          isActive
            ? `<button type="button" class="secondary-button danger-action" data-api-action data-api-method="POST" data-api-path="/api/financial-profiles/${escapeHtml(profile.id)}/archive" data-api-confirm="Arquivar este perfil financeiro?">Arquivar perfil</button>`
            : ""
        }
      </div>
    </article>
  `;
}

function renderShell(currentLabel: string, content: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <title>${escapeHtml(currentLabel)} - SolverFin</title>
    <style>${baseCss()}</style>
  </head>
  <body>
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="/dashboard" aria-label="Ir para o resumo do SolverFin">SolverFin</a>
        <nav aria-label="Menu principal">${renderNavigation("/configuracoes")}</nav>
        <button class="logout" type="button" data-logout>Sair</button>
      </aside>
      <div class="main-area">
        <header class="topbar"><div><strong>${escapeHtml(currentLabel)}</strong><span>Usuário Demo SolverFin</span></div><button type="button" data-logout>Sair</button></header>
        <main>${content}</main>
      </div>
    </div>
    <script>
      document.querySelectorAll("[data-logout]").forEach((button) => {
        button.addEventListener("click", async () => {
          await fetch("/api/session", { method: "DELETE" });
          window.location.assign("/login");
        });
      });
    </script>
  </body>
</html>`;
}

function settingsScript(): string {
  return `
    <script>
      function ensureStatus(container) {
        let status = container.querySelector(":scope > [data-form-status]");
        if (!status) {
          status = document.createElement("p");
          status.className = "form-status muted";
          status.setAttribute("data-form-status", "");
          status.setAttribute("aria-live", "polite");
          container.appendChild(status);
        }
        return status;
      }

      function buildPayload(form) {
        const payload = {};
        new FormData(form).forEach((value, key) => {
          if (value === "") return;
          payload[key] = value;
        });
        return payload;
      }

      async function readApiMessage(response) {
        const body = await response.json().catch(() => ({}));
        if (response.ok) return "Ação concluída. Atualizando a tela...";
        return (body.error && body.error.message) || "Não foi possível concluir a ação.";
      }

      document.querySelectorAll("[data-api-form]").forEach((form) => {
        const status = ensureStatus(form);
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const submitButton = form.querySelector('button[type="submit"]');
          if (submitButton) submitButton.disabled = true;
          status.className = "form-status muted";
          status.textContent = "Salvando...";
          const response = await fetch(form.dataset.apiPath, {
            method: form.dataset.apiMethod || "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(buildPayload(form)),
          });
          status.className = response.ok ? "form-status success" : "form-status error";
          status.textContent = await readApiMessage(response);
          if (response.ok) {
            window.setTimeout(() => window.location.reload(), 450);
            return;
          }
          if (submitButton) submitButton.disabled = false;
        });
      });

      document.querySelectorAll("[data-api-action]").forEach((button) => {
        const container = button.closest(".maintenance-actions") || button.parentElement;
        const status = ensureStatus(container);
        button.addEventListener("click", async () => {
          const confirmation = button.dataset.apiConfirm;
          if (confirmation && !window.confirm(confirmation)) return;
          button.disabled = true;
          status.className = "form-status muted";
          status.textContent = "Enviando...";
          const response = await fetch(button.dataset.apiPath, {
            method: button.dataset.apiMethod || "POST",
            headers: { "content-type": "application/json" },
          });
          status.className = response.ok ? "form-status success" : "form-status error";
          status.textContent = await readApiMessage(response);
          if (response.ok) {
            window.setTimeout(() => window.location.reload(), 450);
            return;
          }
          button.disabled = false;
        });
      });
    </script>
  `;
}

function renderNavigation(activePathname: string): string {
  return Array.from(privateRoutes.entries())
    .map(
      ([path, label]) =>
        `<a href="${path}" ${path === activePathname ? `aria-current="page"` : ""}>${escapeHtml(label)}</a>`,
    )
    .join("");
}

function renderProfileKindOptions(selected?: string): string {
  return [
    ["personal", "Pessoal"],
    ["family", "Família"],
    ["mei", "MEI"],
    ["business", "Negócio"],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`,
    )
    .join("");
}

function renderEmptyState(title: string, description: string): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(description)}</p></div>`;
}

function formatProfileKind(kind: string): string {
  if (kind === "personal") return "Pessoal";
  if (kind === "family") return "Família";
  if (kind === "mei") return "MEI";
  if (kind === "business") return "Negócio";
  return kind;
}

function formatProfileStatus(status: string): string {
  if (status === "active") return "Ativo";
  if (status === "archived") return "Arquivado";
  return status;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function baseCss(): string {
  return `
    :root { color-scheme: light; --bg: #f8fafc; --surface: #ffffff; --surface-soft: #eef5f8; --text: #0f172a; --muted: #475569; --line: #cbd5e1; --primary: #0f3d4c; --primary-soft: #e8f3f6; --cyan: #0891b2; --success: #166534; --success-bg: #dcfce7; --danger: #dc2626; --danger-bg: #fee2e2; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    h1, h2, p { margin: 0; } h1 { font-size: clamp(1.6rem, 4vw, 2rem); line-height: 1.15; } h2 { font-size: 1rem; line-height: 1.3; } a { color: inherit; }
    button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid rgba(34, 211, 238, .55); outline-offset: 2px; }
    .panel, .placeholder-state { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
    .panel { display: grid; gap: 16px; min-width: 0; }
    .eyebrow { color: var(--cyan); font-size: .78rem; font-weight: 800; letter-spacing: 0; text-transform: uppercase; } .muted { color: var(--muted); line-height: 1.5; }
    form, label { display: grid; gap: 10px; } label { color: var(--text); font-weight: 700; } input, select { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; color: var(--text); font: inherit; min-height: 44px; padding: 0 12px; width: 100%; }
    button, .button-link { align-items: center; background: var(--primary); border: 0; border-radius: 8px; color: white; cursor: pointer; display: inline-flex; font: inherit; font-weight: 800; justify-content: center; min-height: 44px; padding: 0 16px; text-decoration: none; }
    button:disabled { cursor: not-allowed; opacity: .58; } .secondary-button, .secondary-link { background: var(--primary-soft); border: 1px solid #d4e6ec; color: var(--primary); } .danger-action { background: var(--danger-bg); border-color: #fecaca; color: var(--danger); }
    .error { background: var(--danger-bg); border: 1px solid #fecaca; border-radius: 8px; color: var(--danger); padding: 10px 12px; } .success { background: var(--success-bg); border: 1px solid #bbf7d0; border-radius: 8px; color: var(--success); padding: 10px 12px; } .form-status { grid-column: 1 / -1; }
    .app-shell { display: grid; grid-template-columns: 248px minmax(0, 1fr); min-height: 100vh; } .sidebar { background: var(--primary); color: white; display: flex; flex-direction: column; gap: 22px; padding: 22px; }
    .brand { align-items: center; display: inline-flex; font-size: 1.2rem; font-weight: 900; min-height: 44px; text-decoration: none; } nav { display: grid; gap: 6px; } nav a { border-radius: 8px; color: rgba(255,255,255,.82); font-weight: 800; min-height: 40px; padding: 10px 12px; text-decoration: none; } nav a:hover, nav a[aria-current="page"] { background: rgba(34,211,238,.18); color: white; }
    .logout { background: rgba(255,255,255,.12); margin-top: auto; } .main-area { min-width: 0; } .topbar { align-items: center; background: rgba(255,255,255,.92); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; min-height: 64px; padding: 0 24px; position: sticky; top: 0; z-index: 5; } .topbar div { display: grid; gap: 2px; } .topbar span { color: var(--muted); font-size: .875rem; }
    main { display: grid; gap: 20px; margin: 0 auto; max-width: 1180px; padding: 24px; width: 100%; } .page-heading { align-items: start; display: grid; max-width: 760px; gap: 6px; }
    .workspace-grid { align-items: start; display: grid; gap: 18px; grid-template-columns: minmax(0, 1fr) minmax(22rem, .6fr); } .section-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .section-heading span { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: .78rem; font-weight: 800; padding: 6px 10px; white-space: nowrap; }
    .rows { display: grid; gap: 14px; } .maintenance-item { border-top: 1px solid var(--line); display: grid; gap: 12px; padding-top: 14px; } .maintenance-item:first-child { border-top: 0; padding-top: 0; } .maintenance-summary { align-items: start; display: flex; gap: 16px; justify-content: space-between; min-width: 0; } .maintenance-summary > div { display: grid; gap: 4px; min-width: 0; } .maintenance-summary span { color: var(--muted); line-height: 1.45; }
    .maintenance-actions { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: 8px; display: grid; gap: 10px; padding: 12px; } .inline-edit-form { align-items: end; display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); } .inline-edit-form button, .inline-edit-form .form-status { grid-column: 1 / -1; } .profile-links { display: flex; flex-wrap: wrap; gap: 8px; }
    .empty-state { background: var(--bg); border: 1px dashed var(--line); border-radius: 8px; display: grid; gap: 6px; padding: 16px; }
    @media (max-width: 1024px) { .workspace-grid { grid-template-columns: 1fr; } }
    @media (max-width: 760px) { .app-shell { grid-template-columns: 1fr; } .sidebar { gap: 12px; padding: 12px 16px; position: sticky; top: 0; z-index: 10; } .sidebar .logout { display: none; } nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; } nav a { background: rgba(255,255,255,.1); flex: 0 0 auto; min-height: 44px; white-space: nowrap; } .topbar { min-height: 56px; padding: 0 16px; position: static; } .topbar button { display: none; } main { padding: 18px 16px 28px; } .inline-edit-form { grid-template-columns: 1fr; } .maintenance-summary, .section-heading { align-items: stretch; display: grid; } }
  `;
}
