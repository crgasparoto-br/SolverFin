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

interface AccountRecord {
  id: string;
  name: string;
}

interface CategoryRecord {
  id: string;
  name: string;
  kind: string;
}

interface AutomationRuleRecord {
  id: string;
  name: string;
  status: string;
  priority: number;
  conditions: {
    descriptionIncludes?: string;
    kind?: string;
    accountId?: string;
    amount?: { equalsMinor?: number; minMinor?: number; maxMinor?: number };
  };
  actions: {
    categoryId?: string;
    accountId?: string;
    status?: string;
  };
  explanation?: string;
}

export async function renderSettingsPage(token: string): Promise<string> {
  const [profiles, rules, accounts, categories] = await Promise.all([
    apiGet<FinancialProfilesResponse>(token, "/api/financial-profiles"),
    apiGet<{ rules: AutomationRuleRecord[] }>(token, "/api/automation-rules?status=all"),
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts"),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories"),
  ]);

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

  const accountOptions = accounts.ok ? accounts.data.accounts : [];
  const categoryOptions = categories.ok ? categories.data.categories : [];
  const automationRules = rules.ok ? rules.data.rules : [];

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
      <section class="page-heading secondary-heading">
        <div>
          <p class="eyebrow">Automação revisável</p>
          <h1>Regras automáticas</h1>
          <p class="muted">Cadastre regras determinísticas para gerar sugestões revisáveis. Nenhuma regra confirma lançamento final sem aprovação humana.</p>
        </div>
        <div class="heading-actions">
          <button type="button" data-open-dialog="new-automation-rule-dialog">Nova regra</button>
          <button type="button" class="secondary-button" data-api-action data-api-method="POST" data-api-path="/api/automation-rules/apply" data-api-confirm="Executar regras sobre sugestões pendentes?">Aplicar regras</button>
        </div>
      </section>
      <section class="panel list-panel">
        <div class="section-heading">
          <h2>Regras configuradas</h2>
          <span>${automationRules.length} itens</span>
        </div>
        ${rules.ok ? "" : `<p class="error" role="alert">Não foi possível carregar regras: ${escapeHtml(rules.error)}</p>`}
        <div class="rows maintenance-rows">
          ${
            automationRules.map(renderAutomationRuleRow).join("") ||
            renderEmptyState(
              "Nenhuma regra automática.",
              "Crie uma regra para sugerir categoria, conta ou status a partir de descrições, tipos e valores.",
            )
          }
        </div>
      </section>
      ${renderNewProfileDialog()}
      ${profiles.data.profiles.map(renderProfileEditDialog).join("")}
      ${renderNewAutomationRuleDialog(accountOptions, categoryOptions)}
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

function renderNewAutomationRuleDialog(
  accounts: AccountRecord[],
  categories: CategoryRecord[],
): string {
  return `
    <dialog id="new-automation-rule-dialog" class="master-dialog" aria-labelledby="new-automation-rule-title">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
        <p class="eyebrow">Nova automação</p>
        <h2 id="new-automation-rule-title">Nova regra automática</h2>
      </div>
      <form data-api-form data-api-path="/api/automation-rules" class="edit-grid">
        <label>Nome<input name="name" required placeholder="Ex.: Mercado vira Alimentação" /></label>
        <label>Prioridade<input name="priority" type="number" value="100" /></label>
        <label>Descrição contém<input name="descriptionIncludes" placeholder="Ex.: mercado" /></label>
        <label>Tipo
          <select name="kind">
            <option value="">Qualquer</option>
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
            <option value="transfer">Transferência</option>
          </select>
        </label>
        <label>Valor mínimo em centavos<input name="amountMinMinor" type="number" placeholder="Ex.: 1000" /></label>
        <label>Valor máximo em centavos<input name="amountMaxMinor" type="number" placeholder="Ex.: 50000" /></label>
        <label>Sugerir conta
          <select name="actionAccountId">
            <option value="">Não alterar</option>
            ${renderAccountOptions(accounts)}
          </select>
        </label>
        <label>Sugerir categoria
          <select name="actionCategoryId">
            <option value="">Não alterar</option>
            ${renderCategoryOptions(categories)}
          </select>
        </label>
        <label>Status sugerido
          <select name="actionStatus">
            <option value="">Não alterar</option>
            <option value="suggested">Sugerido</option>
            <option value="planned">Planejado</option>
            <option value="posted">Realizado</option>
          </select>
        </label>
        <label class="full-span">Explicação opcional<input name="explanation" placeholder="Ex.: Compras com este texto costumam ser alimentação." /></label>
        <button type="submit">Criar regra</button>
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

function renderAutomationRuleRow(rule: AutomationRuleRecord): string {
  const isActive = rule.status === "active";

  return `
    <article class="maintenance-item">
      <div class="maintenance-summary">
        <div>
          <strong>${escapeHtml(rule.name)}</strong>
          <span>${escapeHtml(formatAutomationStatus(rule.status))} - prioridade ${escapeHtml(String(rule.priority))}</span>
        </div>
      </div>
      <div class="maintenance-actions" aria-label="Regra ${escapeHtml(rule.name)}">
        <p class="muted">Quando: ${escapeHtml(describeConditions(rule.conditions))}</p>
        <p class="muted">Sugerir: ${escapeHtml(describeActions(rule.actions))}</p>
        ${rule.explanation ? `<p class="muted">${escapeHtml(rule.explanation)}</p>` : ""}
        ${
          isActive
            ? `<button type="button" class="secondary-button danger-action" data-api-action data-api-method="POST" data-api-path="/api/automation-rules/${escapeHtml(rule.id)}/archive" data-api-confirm="Inativar esta regra automática?">Inativar regra</button>`
            : ""
        }
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
        const container = button.closest(".maintenance-actions") || button.closest(".heading-actions") || button.parentElement;
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

function renderAccountOptions(accounts: AccountRecord[]): string {
  return accounts
    .map(
      (account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`,
    )
    .join("");
}

function renderCategoryOptions(categories: CategoryRecord[]): string {
  return categories
    .map(
      (category) =>
        `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`,
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

function formatAutomationStatus(status: string): string {
  if (status === "active") return "Ativa";
  if (status === "inactive") return "Inativa";
  return status;
}

function describeConditions(conditions: AutomationRuleRecord["conditions"]): string {
  const parts: string[] = [];
  if (conditions.descriptionIncludes)
    parts.push(`descrição contém "${conditions.descriptionIncludes}"`);
  if (conditions.kind) parts.push(`tipo ${conditions.kind}`);
  if (conditions.accountId) parts.push("conta específica");
  if (conditions.amount?.equalsMinor !== undefined)
    parts.push(`valor igual ${conditions.amount.equalsMinor}`);
  if (conditions.amount?.minMinor !== undefined)
    parts.push(`valor mínimo ${conditions.amount.minMinor}`);
  if (conditions.amount?.maxMinor !== undefined)
    parts.push(`valor máximo ${conditions.amount.maxMinor}`);
  return parts.join(", ") || "sem condição visível";
}

function describeActions(actions: AutomationRuleRecord["actions"]): string {
  const parts: string[] = [];
  if (actions.categoryId) parts.push("categoria");
  if (actions.accountId) parts.push("conta");
  if (actions.status) parts.push(`status ${actions.status}`);
  return parts.join(", ") || "sem ação visível";
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
    .secondary-link { background: var(--surface); border: 1px solid var(--line); color: var(--primary); } .secondary-link:hover { background: var(--primary-soft); border-color: #c8dde5; }
    main { display: grid; gap: 14px; margin: 0 auto; max-width: 1440px; padding: 18px 20px; width: 100%; } .page-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .page-heading > div { display: grid; gap: 4px; max-width: 760px; }
    .secondary-heading { margin-top: 8px; }
    .heading-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
    .section-heading { align-items: center; display: flex; gap: 10px; justify-content: space-between; } .section-heading span { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: 0.6875rem; font-weight: 700; padding: 2px 7px; white-space: nowrap; }
    .rows { display: grid; gap: 10px; } .maintenance-item { border-top: 1px solid var(--line); display: grid; gap: 10px; padding-top: 10px; } .maintenance-item:first-child { border-top: 0; padding-top: 0; } .maintenance-summary { align-items: start; display: flex; gap: 12px; justify-content: space-between; min-width: 0; } .maintenance-summary > div { display: grid; gap: 3px; min-width: 0; } .maintenance-summary span { color: var(--muted); font-size: 0.8125rem; line-height: 1.4; }
    .maintenance-actions { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: var(--radius); display: grid; gap: 8px; padding: 10px; } .item-actions { display: flex; gap: 6px; justify-content: flex-end; } .profile-links { display: flex; flex-wrap: wrap; gap: 6px; }
    .full-span { grid-column: 1 / -1; }
    @media (max-width: 760px) { .page-heading { align-items: stretch; display: grid; } .heading-actions { justify-content: stretch; } .maintenance-summary, .section-heading { align-items: stretch; display: grid; } }
  `;
}
