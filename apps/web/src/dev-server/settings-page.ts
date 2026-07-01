import { apiGet } from "./api.js";
import { dialogScript, sharedDialogStyles, sharedShellStyles } from "./shared-styles.js";
import { renderAuthenticatedShellDocument } from "./shell.js";

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
        <div>
          <p class="eyebrow">Tenant operacional</p>
          <h1>Perfis financeiros</h1>
          <p class="muted">Escolha, crie ou arquive contextos como pessoal, família, MEI e negócio sem misturar dados financeiros.</p>
        </div>
        <button type="button" data-open-dialog="new-profile-dialog">Novo perfil</button>
      </section>
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
      ${renderNewProfileDialog()}
      ${profiles.data.profiles.map(renderProfileEditDialog).join("")}
      ${settingsScript()}
      ${dialogScript()}
    `,
  );
}

function renderNewProfileDialog(): string {
  return `
    <dialog id="new-profile-dialog" class="master-dialog" aria-labelledby="new-profile-title">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
        <p class="eyebrow">Novo cadastro</p>
        <h2 id="new-profile-title">Novo perfil</h2>
      </div>
      <form data-api-form data-api-path="/api/financial-profiles" class="edit-grid">
        <label>Nome<input name="name" required placeholder="Ex.: Família" /></label>
        <label>Tipo
          <select name="kind" required>
            ${renderProfileKindOptions()}
          </select>
        </label>
        <button type="submit">Criar perfil</button>
      </form>
    </dialog>
  `;
}

function renderProfileEditDialog(profile: FinancialProfileRecord): string {
  const dialogId = `edit-profile-dialog-${profile.id}`;
  const titleId = `${dialogId}-title`;

  return `
    <dialog id="${escapeHtml(dialogId)}" class="master-dialog" aria-labelledby="${escapeHtml(titleId)}">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
        <p class="eyebrow">Editar cadastro</p>
        <h2 id="${escapeHtml(titleId)}">${escapeHtml(profile.name)}</h2>
      </div>
      <form data-api-form data-api-method="PATCH" data-api-path="/api/financial-profiles/${escapeHtml(profile.id)}" class="edit-grid">
        <label>Nome<input name="name" value="${escapeHtml(profile.name)}" required /></label>
        <label>Tipo<select name="kind">${renderProfileKindOptions(profile.kind)}</select></label>
        <button type="submit">Salvar perfil</button>
      </form>
    </dialog>
  `;
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
        <div class="item-actions">
          <button type="button" class="icon-button" data-open-dialog="edit-profile-dialog-${escapeHtml(profile.id)}" aria-label="Editar perfil ${escapeHtml(profile.name)}">${renderEditIcon()}</button>
          ${
            isActive
              ? `<button type="button" class="secondary-button danger-action" data-api-action data-api-method="POST" data-api-path="/api/financial-profiles/${escapeHtml(profile.id)}/archive" data-api-confirm="Arquivar este perfil financeiro?">Arquivar perfil</button>`
              : ""
          }
        </div>
      </div>
    </article>
  `;
}

function renderEditIcon(): string {
  return `<svg class="action-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 20h4.8L19.2 9.6a2.7 2.7 0 0 0 0-3.8l-1-1a2.7 2.7 0 0 0-3.8 0L4 15.2V20zm2-2v-2l9.8-9.8c.3-.3.7-.3 1 0l1 1c.3.3.3.7 0 1L8 18H6z" fill="currentColor"/></svg>`;
}

function renderShell(currentLabel: string, content: string): string {
  return renderAuthenticatedShellDocument({
    activePathname: "/configuracoes",
    content,
    currentLabel,
    styles: baseCss(),
  });
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
    ${sharedShellStyles()}
    ${sharedDialogStyles()}
    .secondary-link { background: var(--primary-soft); border: 1px solid #d4e6ec; color: var(--primary); }
    main { display: grid; gap: 20px; margin: 0 auto; max-width: 1440px; padding: 24px; width: 100%; } .page-heading { align-items: end; display: flex; gap: 16px; justify-content: space-between; } .page-heading > div { display: grid; gap: 6px; max-width: 760px; }
    .section-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .section-heading span { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: .78rem; font-weight: 800; padding: 6px 10px; white-space: nowrap; }
    .rows { display: grid; gap: 14px; } .maintenance-item { border-top: 1px solid var(--line); display: grid; gap: 12px; padding-top: 14px; } .maintenance-item:first-child { border-top: 0; padding-top: 0; } .maintenance-summary { align-items: start; display: flex; gap: 16px; justify-content: space-between; min-width: 0; } .maintenance-summary > div { display: grid; gap: 4px; min-width: 0; } .maintenance-summary span { color: var(--muted); line-height: 1.45; }
    .maintenance-actions { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: 8px; display: grid; gap: 10px; padding: 12px; } .item-actions { display: flex; gap: 8px; justify-content: flex-end; } .profile-links { display: flex; flex-wrap: wrap; gap: 8px; }
    @media (max-width: 760px) { .page-heading { align-items: stretch; display: grid; } .maintenance-summary, .section-heading { align-items: stretch; display: grid; } }
  `;
}
