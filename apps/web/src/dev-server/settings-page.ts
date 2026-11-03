import {
  renderPageContainer,
  renderPageHeader,
  renderSolverFinUiInteractionsScriptTag,
  renderTabs,
} from "../design-system/primitives.js";
import { apiGet } from "./api.js";
import { icon } from "./icons.js";
import { sharedDialogStyles, sharedShellStyles } from "./shared-styles.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { getSecondaryRoutePageViewModel } from "./secondary-routes-view-model.js";

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
    merchantIncludes?: string;
    kind?: string;
    accountId?: string;
    cardId?: string;
    amount?: { equalsMinor?: number; minMinor?: number; maxMinor?: number };
  };
  actions: {
    categoryId?: string;
    accountId?: string;
    cardId?: string;
    tagIds?: readonly string[];
    status?: string;
  };
  explanation?: string;
}

type SettingsSection = "profiles" | "rules";
type DependencyState<T> = { ok: true; items: T[] } | { ok: false; error: string };

const SETTINGS_PATH = "/configuracoes";
const settingsPageModel = getSecondaryRoutePageViewModel("settings");
const AMOUNT_INPUT_PATTERN = /^\d+(?:[.,]\d{1,2})?$/;

export async function renderSettingsPage(
  token: string,
  url: URL = new URL("https://solverfin.invalid/configuracoes"),
): Promise<string> {
  const section = resolveSettingsSection(url);

  if (section === "rules") {
    const [rules, accounts, categories] = await Promise.all([
      apiGet<{ rules: AutomationRuleRecord[] }>(token, "/api/automation-rules?status=all"),
      apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts"),
      apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories"),
    ]);

    return renderShell(
      "Configurações",
      renderSettingsDocument(
        section,
        renderRulesSection(
          rules,
          accounts.ok
            ? { ok: true, items: accounts.data.accounts }
            : { ok: false, error: accounts.error },
          categories.ok
            ? { ok: true, items: categories.data.categories }
            : { ok: false, error: categories.error },
        ),
      ),
    );
  }

  const profiles = await apiGet<FinancialProfilesResponse>(token, "/api/financial-profiles");

  return renderShell(
    "Configurações",
    renderSettingsDocument(section, renderProfilesSection(profiles)),
  );
}

export function resolveSettingsSection(url: URL): SettingsSection {
  return url.searchParams.get("section") === "rules" ? "rules" : "profiles";
}

export function parseAutomationRuleAmountMinorInput(value: string): number | undefined | null {
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  if (!AMOUNT_INPUT_PATTERN.test(normalized)) return null;

  const [whole = "0", fraction = ""] = normalized.replace(",", ".").split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

function renderSettingsDocument(section: SettingsSection, selectedSection: string): string {
  return `
    ${renderPageHeader({
      eyebrow: settingsPageModel.eyebrow,
      title: settingsPageModel.title,
      description: settingsPageModel.description,
    })}
    ${renderSettingsNavigation(section)}
    ${selectedSection}
    ${settingsScript()}
    ${renderSolverFinUiInteractionsScriptTag()}
  `;
}

function renderSettingsNavigation(section: SettingsSection): string {
  return renderTabs({
    label: "Seções de Configurações",
    items: [
      {
        label: "Perfis financeiros",
        href: `${SETTINGS_PATH}?section=profiles`,
        active: section === "profiles",
      },
      {
        label: "Regras automáticas",
        href: `${SETTINGS_PATH}?section=rules`,
        active: section === "rules",
      },
    ],
  });
}

function renderProfilesSection(
  profiles: { ok: true; data: FinancialProfilesResponse } | { ok: false; error: string },
): string {
  const heading = `
    <header class="settings-section-heading">
      <div>
        <h2 id="profiles-section-title">Perfis financeiros</h2>
        <p class="muted">Separe contextos como pessoal, família, MEI e negócio.</p>
      </div>
      ${profiles.ok ? `<button type="button" class="sf-button sf-button-primary" data-open-dialog="new-profile-dialog" data-sf-dialog-open="new-profile-dialog" title="Criar novo perfil financeiro">${icon("plus", 14)} Novo perfil</button>` : ""}
    </header>
  `;

  if (!profiles.ok) {
    return `
      <section class="settings-section" data-settings-scope="profiles" aria-labelledby="profiles-section-title">
        ${heading}
        ${renderLoadError(
          "Não foi possível carregar os perfis financeiros.",
          profiles.error,
          `${SETTINGS_PATH}?section=profiles`,
        )}
      </section>
    `;
  }

  const profileRows = profiles.data.profiles
    .map((profile) => renderProfileRow(profile, profiles.data.activeProfileId))
    .join("");

  return `
    <section class="settings-section" data-settings-scope="profiles" aria-labelledby="profiles-section-title">
      ${heading}
      <div class="settings-collection-heading">
        <h3>Perfis disponíveis</h3>
        <span>${profiles.data.profiles.length} perfis</span>
      </div>
      <div class="rows maintenance-rows">
        ${
          profileRows ||
          renderEmptyState(
            "Nenhum perfil financeiro.",
            "Use Novo perfil para começar a organizar os dados financeiros.",
          )
        }
      </div>
    </section>
    ${renderNewProfileDialog()}
    ${profiles.data.profiles.map(renderProfileEditDialog).join("")}
  `;
}

function renderRulesSection(
  rules: { ok: true; data: { rules: AutomationRuleRecord[] } } | { ok: false; error: string },
  accounts: DependencyState<AccountRecord>,
  categories: DependencyState<CategoryRecord>,
): string {
  const automationRules = rules.ok ? rules.data.rules : [];

  return `
    <section class="settings-section" data-settings-scope="rules" aria-labelledby="rules-section-title">
      <header class="settings-section-heading">
        <div>
          <h2 id="rules-section-title">Regras automáticas</h2>
          <p class="muted">Configure os critérios que geram sugestões para revisão.</p>
        </div>
        <button type="button" class="sf-button sf-button-primary" data-open-dialog="new-automation-rule-dialog" data-sf-dialog-open="new-automation-rule-dialog" title="Criar nova regra automática">${icon("plus", 14)} Nova regra</button>
      </header>
      <p class="settings-priority-note">Números maiores são aplicados primeiro; em empate, vence a regra criada antes.</p>
      <div class="settings-collection-heading">
        <h3>Regras configuradas</h3>
        ${rules.ok ? `<span>${automationRules.length} regras</span>` : ""}
      </div>
      ${
        rules.ok
          ? `<div class="rows maintenance-rows">
             ${
               automationRules
                 .map((rule) => renderAutomationRuleRow(rule, accounts, categories))
                 .join("") ||
               renderEmptyState(
                 "Nenhuma regra automática.",
                 "Use Nova regra para sugerir categoria, conta ou status a partir de descrições, tipos e valores.",
               )
             }
           </div>`
          : renderLoadError(
              "Não foi possível carregar as regras automáticas.",
              rules.error,
              `${SETTINGS_PATH}?section=rules`,
            )
      }
      <section class="settings-operation" aria-labelledby="rules-apply-title">
        <div>
          <h3 id="rules-apply-title">Aplicar regras às sugestões</h3>
          <p id="rules-apply-description" class="muted">A aplicação gera sugestões revisáveis; nunca confirma lançamentos finais sem sua aprovação.</p>
        </div>
        <div class="settings-operation-actions">
          <button type="button" class="sf-button sf-button-secondary" data-api-action data-api-method="POST" data-api-path="/api/automation-rules/apply" data-api-success="Regras aplicadas. Revise as sugestões antes de confirmar." data-api-confirm="Executar regras sobre sugestões pendentes?" aria-describedby="rules-apply-description" title="Aplicar regras sobre sugestões pendentes"${rules.ok ? "" : ' disabled aria-disabled="true"'}>${icon("play", 14)} Aplicar regras</button>
        </div>
      </section>
    </section>
    ${renderNewAutomationRuleDialog(accounts, categories)}
  `;
}

function renderNewProfileDialog(): string {
  return `
    <dialog id="new-profile-dialog" class="master-dialog" aria-labelledby="new-profile-title">
            <div class="dialog-heading">
        <p class="eyebrow">Novo cadastro</p>
        <h2 id="new-profile-title">Novo perfil</h2>
      </div>
      <form data-api-form data-api-path="/api/financial-profiles" data-api-success="Perfil criado. Atualizando..." class="edit-grid">
        <label>Nome<input name="name" required autofocus placeholder="Ex.: Família" /></label>
        <label>Tipo
          <select name="kind" required>
            ${renderProfileKindOptions()}
          </select>
        </label>
        <div class="settings-dialog-actions"><button type="button" class="sf-button sf-button-secondary" data-sf-dialog-close>Cancelar</button><button type="submit" class="sf-button sf-button-primary" title="Salvar novo perfil">${icon("save", 14)} Criar perfil</button></div>
      </form>
    </dialog>
  `;
}

function renderNewAutomationRuleDialog(
  accounts: DependencyState<AccountRecord>,
  categories: DependencyState<CategoryRecord>,
): string {
  return `
    <dialog id="new-automation-rule-dialog" class="master-dialog" aria-labelledby="new-automation-rule-title" aria-describedby="new-rule-dialog-context">
            <div class="dialog-heading">
        <p class="eyebrow">Nova automação</p>
        <h2 id="new-automation-rule-title">Nova regra automática</h2>
      </div>
      <p class="settings-dialog-context" id="new-rule-dialog-context">Cada execução gera sugestões revisáveis, não confirma lançamentos.</p>
      <form data-api-form data-api-path="/api/automation-rules" data-api-success="Regra criada. Atualizando..." class="edit-grid" novalidate>
        <label>Nome<input name="name" required autofocus placeholder="Ex.: Mercado vira Alimentação" /></label>
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
        ${renderAmountField("amountMinMinor", "Valor mínimo", "amount-minor-error")}
        ${renderAmountField("amountMaxMinor", "Valor máximo", "amount-max-error")}
        ${renderAccountField(accounts)}
        ${renderCategoryField(categories)}
        <label>Status sugerido
          <select name="actionStatus">
            <option value="">Não alterar</option>
            <option value="suggested">Sugerido</option>
            <option value="planned">Planejado</option>
            <option value="posted">Realizado</option>
          </select>
        </label>
        <label class="full-span">Explicação opcional<input name="explanation" placeholder="Ex.: Compras com este texto costumam ser alimentação." /></label>
        <div class="settings-dialog-actions"><button type="button" class="sf-button sf-button-secondary" data-sf-dialog-close>Cancelar</button><button type="submit" class="sf-button sf-button-primary" title="Salvar nova regra automática">${icon("save", 14)} Criar regra</button></div>
      </form>
    </dialog>
  `;
}

function renderAmountField(name: string, label: string, errorId: string): string {
  return `
    <label>${label}
      <input name="${name}" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 10,50" data-minor-decimal aria-describedby="${errorId}" />
      <span id="${errorId}" class="field-error" data-decimal-error hidden>Informe um valor com até duas casas decimais, como 10,50.</span>
    </label>
  `;
}

function renderAccountField(accounts: DependencyState<AccountRecord>): string {
  if (!accounts.ok) {
    return `
      <label>Sugerir conta
        <select name="actionAccountId" disabled aria-describedby="accounts-dependency-warning"></select>
        <span id="accounts-dependency-warning" class="field-warning" role="alert">Não foi possível carregar as contas. <a href="${SETTINGS_PATH}?section=rules">Tentar novamente</a>.</span>
      </label>
    `;
  }

  return `
    <label>Sugerir conta
      <select name="actionAccountId">
        <option value="">Não alterar</option>
        ${renderAccountOptions(accounts.items)}
      </select>
    </label>
  `;
}

function renderCategoryField(categories: DependencyState<CategoryRecord>): string {
  if (!categories.ok) {
    return `
      <label>Sugerir categoria
        <select name="actionCategoryId" disabled aria-describedby="categories-dependency-warning"></select>
        <span id="categories-dependency-warning" class="field-warning" role="alert">Não foi possível carregar as categorias. <a href="${SETTINGS_PATH}?section=rules">Tentar novamente</a>.</span>
      </label>
    `;
  }

  return `
    <label>Sugerir categoria
      <select name="actionCategoryId">
        <option value="">Não alterar</option>
        ${renderCategoryOptions(categories.items)}
      </select>
    </label>
  `;
}

function renderProfileEditDialog(profile: FinancialProfileRecord): string {
  const dialogId = `edit-profile-dialog-${profile.id}`;
  const titleId = `${dialogId}-title`;

  return `
    <dialog id="${escapeHtml(dialogId)}" class="master-dialog" aria-labelledby="${escapeHtml(titleId)}">
            <div class="dialog-heading">
        <p class="eyebrow">Editar cadastro</p>
        <h2 id="${escapeHtml(titleId)}">${escapeHtml(profile.name)}</h2>
      </div>
      <form data-api-form data-api-method="PATCH" data-api-path="/api/financial-profiles/${escapeHtml(profile.id)}" data-api-success="Perfil atualizado. Atualizando..." class="edit-grid">
        <label>Nome<input name="name" value="${escapeHtml(profile.name)}" required autofocus /></label>
        <label>Tipo<select name="kind">${renderProfileKindOptions(profile.kind)}</select></label>
        <div class="settings-dialog-actions"><button type="button" class="sf-button sf-button-secondary" data-sf-dialog-close>Cancelar</button><button type="submit" class="sf-button sf-button-primary" title="Salvar alterações do perfil">${icon("save", 14)} Salvar perfil</button></div>
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
    <article class="maintenance-item profile-item${isSelected ? " is-current-profile" : ""}" data-current-profile="${isSelected}">
      <div class="maintenance-summary">
        <div class="profile-identity">
          <div class="item-title-line">
            <strong>${escapeHtml(profile.name)}</strong>
            ${isSelected ? '<span class="status-badge status-in-use">Em uso</span>' : ""}
            ${isSelected && isActive ? "" : renderProfileStatusBadge(profile.status)}
          </div>
          <span>${escapeHtml(formatProfileKind(profile.kind))}</span>
        </div>
      </div>
      <div class="maintenance-actions" aria-label="Ações do perfil ${escapeHtml(profile.name)}">
        ${
          isActive
            ? `<nav class="profile-links" aria-label="Abrir áreas do perfil ${escapeHtml(profile.name)}">
               <a class="button-link secondary-link" href="/dashboard?${profileQuery}">Dashboard</a>
               <a class="button-link secondary-link" href="/contas?${profileQuery}">Contas</a>
               <a class="button-link secondary-link" href="/lancamentos?${profileQuery}">Extrato</a>
             </nav>`
            : '<span class="profile-disabled-note">Perfil arquivado.</span>'
        }
        <div class="item-actions">
          <button type="button" class="icon-button" data-open-dialog="edit-profile-dialog-${escapeHtml(profile.id)}" data-sf-dialog-open="edit-profile-dialog-${escapeHtml(profile.id)}" aria-label="Editar perfil ${escapeHtml(profile.name)}" title="Editar perfil">${renderEditIcon()}</button>
          ${
            isActive
              ? `<button type="button" class="icon-button danger-icon-button" data-api-action data-api-method="POST" data-api-path="/api/financial-profiles/${escapeHtml(profile.id)}/archive" data-api-success="Perfil arquivado. Atualizando..." data-api-confirm="Arquivar este perfil financeiro?" aria-label="Arquivar perfil ${escapeHtml(profile.name)}" title="Arquivar perfil">${icon("archive", 14)}</button>`
              : ""
          }
        </div>
      </div>
    </article>
  `;
}

function renderAutomationRuleRow(
  rule: AutomationRuleRecord,
  accounts: DependencyState<AccountRecord>,
  categories: DependencyState<CategoryRecord>,
): string {
  const isActive = rule.status === "active";

  return `
    <article class="maintenance-item rule-item">
      <div class="rule-summary">
        <div class="item-title-line">
          <strong>${escapeHtml(rule.name)}</strong>
          ${renderAutomationStatusBadge(rule.status)}
        </div>
        <span class="rule-priority" aria-label="Prioridade ${escapeHtml(String(rule.priority))}">Prioridade ${escapeHtml(String(rule.priority))}</span>
      </div>
      <div class="rule-detail-grid">
        <section class="rule-detail" aria-label="Condições da regra ${escapeHtml(rule.name)}">
          <h3>Condições</h3>
          ${renderRuleList(describeConditions(rule.conditions, accounts))}
        </section>
        <section class="rule-detail" aria-label="Ações sugeridas pela regra ${escapeHtml(rule.name)}">
          <h3>Ações sugeridas</h3>
          ${renderRuleList(describeActions(rule.actions, accounts, categories))}
        </section>
      </div>
      ${rule.explanation ? `<p class="rule-explanation"><strong>Explicação:</strong> ${escapeHtml(rule.explanation)}</p>` : ""}
      ${
        isActive
          ? `<div class="item-actions rule-actions">
             <button type="button" class="icon-button danger-icon-button" data-api-action data-api-method="POST" data-api-path="/api/automation-rules/${escapeHtml(rule.id)}/archive" data-api-success="Regra inativada. Atualizando..." data-api-confirm="Inativar esta regra automática?" aria-label="Inativar regra ${escapeHtml(rule.name)}" title="Inativar regra">${icon("archive", 14)}</button>
           </div>`
          : ""
      }
    </article>
  `;
}

function renderRuleList(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderProfileStatusBadge(status: string): string {
  if (status === "active") return '<span class="status-badge status-active">Ativo</span>';
  if (status === "archived") return '<span class="status-badge status-archived">Arquivado</span>';
  return '<span class="status-badge status-neutral">Não reconhecido</span>';
}

function renderAutomationStatusBadge(status: string): string {
  if (status === "active") return '<span class="status-badge status-active">Ativa</span>';
  if (status === "inactive") return '<span class="status-badge status-archived">Inativa</span>';
  return '<span class="status-badge status-neutral">Não reconhecido</span>';
}

function renderEditIcon(): string {
  return `<svg class="action-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 20h4.8L19.2 9.6a2.7 2.7 0 0 0 0-3.8l-1-1a2.7 2.7 0 0 0-3.8 0L4 15.2V20zm2-2v-2l9.8-9.8c.3-.3.7-.3 1 0l1 1c.3.3.3.7 0 1L8 18H6z" fill="currentColor"/></svg>`;
}

function renderShell(currentLabel: string, content: string): string {
  return renderAuthenticatedShellDocument({
    activePathname: SETTINGS_PATH,
    currentLabel,
    styles: baseCss(),
    content: renderPageContainer({
      className: "secondary-route-page settings-page",
      childrenHtml: `<div data-secondary-route-foundation="${settingsPageModel.id}" data-route-archetype="${settingsPageModel.archetype}" data-route-audience="${settingsPageModel.audience}" data-operational-mode="${settingsPageModel.operationalMode}">${content}</div>`,
    }),
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

      function parseMinorDecimal(value) {
        const normalized = String(value).trim();
        if (normalized === "") return { ok: true, omitted: true };
        if (!/^\\d+(?:[.,]\\d{1,2})?$/.test(normalized)) return { ok: false };
        const parts = normalized.replace(",", ".").split(".");
        const whole = parts[0] || "0";
        const fraction = parts[1] || "";
        const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
        return Number.isSafeInteger(minor) ? { ok: true, value: minor } : { ok: false };
      }

      function validateDecimalFields(form) {
        let firstInvalid;
        form.querySelectorAll("[data-minor-decimal]").forEach((input) => {
          const result = parseMinorDecimal(input.value);
          const error = input.parentElement.querySelector("[data-decimal-error]");
          const invalid = !result.ok;
          if (invalid) input.setAttribute("aria-invalid", "true");
          else input.removeAttribute("aria-invalid");
          if (error) error.hidden = !invalid;
          if (invalid && !firstInvalid) firstInvalid = input;
        });
        if (firstInvalid) firstInvalid.focus();
        return !firstInvalid;
      }

      function buildPayload(form) {
        const payload = {};
        new FormData(form).forEach((value, key) => {
          if (value === "") return;
          const field = form.elements.namedItem(key);
          if (field && field.matches && field.matches("[data-minor-decimal]")) {
            const parsed = parseMinorDecimal(value);
            if (parsed.ok && !parsed.omitted) payload[key] = parsed.value;
            return;
          }
          payload[key] = value;
        });
        return payload;
      }

      async function readApiMessage(response, successMessage) {
        const body = await response.json().catch(() => ({}));
        if (response.ok) return successMessage || "Ação concluída. Atualizando a tela...";
        return (body.error && body.error.message) || "Não foi possível concluir a ação.";
      }

      document.querySelectorAll("[data-minor-decimal]").forEach((input) => {
        input.addEventListener("input", () => {
          input.removeAttribute("aria-invalid");
          const error = input.parentElement.querySelector("[data-decimal-error]");
          if (error) error.hidden = true;
        });
      });

      document.querySelectorAll("[data-api-form]").forEach((form) => {
        const status = ensureStatus(form);
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (!form.checkValidity()) {
            form.reportValidity();
            return;
          }
          if (!validateDecimalFields(form)) {
            status.className = "form-status error";
            status.textContent = "Revise os valores destacados antes de salvar.";
            return;
          }
          const submitButton = form.querySelector('button[type="submit"]');
          if (submitButton) submitButton.disabled = true;
          status.className = "form-status muted";
          status.textContent = "Salvando...";
          try {
            const response = await fetch(form.dataset.apiPath, {
              method: form.dataset.apiMethod || "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(buildPayload(form)),
            });
            status.className = response.ok ? "form-status success" : "form-status error";
            status.textContent = await readApiMessage(response, form.dataset.apiSuccess);
            if (response.ok) {
              window.setTimeout(() => window.location.reload(), 450);
              return;
            }
          } catch {
            status.className = "form-status error";
            status.textContent = "Falha de conexão. Revise os dados e tente novamente.";
          }
          if (submitButton) submitButton.disabled = false;
        });
      });

      document.querySelectorAll("[data-api-action]").forEach((button) => {
        const container = button.closest(".maintenance-actions") || button.closest(".settings-operation") || button.parentElement;
        const status = ensureStatus(container);
        button.addEventListener("click", async () => {
          if (button.disabled) return;
          const confirmation = button.dataset.apiConfirm;
          if (confirmation && !window.confirm(confirmation)) return;
          button.disabled = true;
          status.className = "form-status muted";
          status.textContent = "Enviando...";
          try {
            const response = await fetch(button.dataset.apiPath, {
              method: button.dataset.apiMethod || "POST",
              headers: { "content-type": "application/json" },
            });
            status.className = response.ok ? "form-status success" : "form-status error";
            status.textContent = await readApiMessage(response, button.dataset.apiSuccess);
            if (response.ok) {
              window.setTimeout(() => window.location.reload(), 450);
              return;
            }
          } catch {
            status.className = "form-status error";
            status.textContent = "Falha de conexão. Tente novamente.";
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

function renderEmptyState(title: string, description: string, action = ""): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(description)}</p>${action}</div>`;
}

function renderLoadError(title: string, detail: string, retryHref: string): string {
  return `
    <div class="load-error" role="alert">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(detail)}</p>
      <a class="button-link secondary-link" href="${escapeHtml(retryHref)}">Tentar novamente</a>
    </div>
  `;
}

function formatProfileKind(kind: string): string {
  if (kind === "personal") return "Pessoal";
  if (kind === "family") return "Família";
  if (kind === "mei") return "MEI";
  if (kind === "business") return "Negócio";
  return "Não reconhecido";
}

function formatRuleKind(kind: string): string {
  if (kind === "expense") return "Despesa";
  if (kind === "income") return "Receita";
  if (kind === "transfer") return "Transferência";
  return "Não reconhecido";
}

function formatActionStatus(status: string): string {
  if (status === "suggested") return "Sugerido";
  if (status === "planned") return "Planejado";
  if (status === "posted") return "Realizado";
  if (status === "reconciled") return "Conciliado";
  if (status === "voided") return "Cancelado";
  if (status === "pending_review") return "Pendente de revisão";
  if (status === "duplicate") return "Duplicado";
  return "Não reconhecido";
}

const MINOR_VALUE_FORMATTER = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMinorValue(value: number): string {
  return MINOR_VALUE_FORMATTER.format(value / 100);
}

function describeConditions(
  conditions: AutomationRuleRecord["conditions"],
  accounts: DependencyState<AccountRecord>,
): string[] {
  const items: string[] = [];
  if (conditions.descriptionIncludes)
    items.push(`Descrição contém “${conditions.descriptionIncludes}”`);
  if (conditions.merchantIncludes)
    items.push(`Estabelecimento contém “${conditions.merchantIncludes}”`);
  if (conditions.kind) items.push(`Tipo: ${formatRuleKind(conditions.kind)}`);
  if (conditions.accountId)
    items.push(describeEntityReference("Conta", conditions.accountId, accounts));
  if (conditions.cardId) items.push("Cartão específico");
  if (conditions.amount?.equalsMinor !== undefined)
    items.push(`Valor igual: ${formatMinorValue(conditions.amount.equalsMinor)}`);
  if (conditions.amount?.minMinor !== undefined)
    items.push(`Valor mínimo: ${formatMinorValue(conditions.amount.minMinor)}`);
  if (conditions.amount?.maxMinor !== undefined)
    items.push(`Valor máximo: ${formatMinorValue(conditions.amount.maxMinor)}`);
  return items.length > 0 ? items : ["Nenhuma condição reconhecida"];
}

function describeActions(
  actions: AutomationRuleRecord["actions"],
  accounts: DependencyState<AccountRecord>,
  categories: DependencyState<CategoryRecord>,
): string[] {
  const items: string[] = [];
  if (actions.categoryId)
    items.push(describeEntityReference("Sugerir categoria", actions.categoryId, categories));
  if (actions.accountId)
    items.push(describeEntityReference("Sugerir conta", actions.accountId, accounts));
  if (actions.cardId) items.push("Sugerir cartão");
  if (actions.tagIds && actions.tagIds.length > 0)
    items.push(
      `Adicionar ${actions.tagIds.length} ${actions.tagIds.length === 1 ? "etiqueta" : "etiquetas"}`,
    );
  if (actions.status) items.push(`Status: ${formatActionStatus(actions.status)}`);
  return items.length > 0 ? items : ["Nenhuma ação reconhecida"];
}

function describeEntityReference<T extends { id: string; name: string }>(
  label: string,
  id: string,
  dependency: DependencyState<T>,
): string {
  if (!dependency.ok) return `${label}: nome indisponível`;
  const entity = dependency.items.find((item) => item.id === id);
  return `${label}: ${entity?.name ?? "Não reconhecido"}`;
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

    .settings-page { display: grid; gap: var(--sf-space-4); grid-template-columns: minmax(0, 1fr); min-width: 0; }
    .settings-section { display: grid; gap: var(--sf-space-4); grid-template-columns: minmax(0, 1fr); min-width: 0; }
    .settings-section-heading { align-items: start; display: flex; gap: var(--sf-space-5); justify-content: space-between; min-width: 0; }
    .settings-section-heading > div { display: grid; gap: var(--sf-space-1); max-width: 780px; min-width: 0; }
    .settings-section-heading .sf-button { flex: 0 0 auto; }
    .settings-section-heading p { overflow-wrap: anywhere; }
    .settings-collection-heading { align-items: center; border-bottom: 1px solid var(--line); display: flex; gap: var(--sf-space-3); justify-content: space-between; padding-bottom: var(--sf-space-2); }
    .settings-collection-heading h3 { font-size: var(--sf-font-size-md); }
    .settings-collection-heading span, .settings-priority-note, .rule-priority { color: var(--muted); font-size: var(--sf-font-size-sm); }
    .settings-priority-note { margin: 0; }
    .maintenance-rows { display: grid; grid-template-columns: minmax(0, 1fr); }
    .maintenance-item { border-bottom: 1px solid var(--line); display: grid; gap: var(--sf-space-3); grid-template-columns: minmax(0, 1fr); min-width: 0; padding: var(--sf-space-4) 0; }
    .maintenance-item:first-child { padding-top: var(--sf-space-2); }
    .profile-item.is-current-profile { background: var(--sf-color-primary-soft); border-radius: var(--radius); padding: var(--sf-space-3); }
    .maintenance-summary { display: flex; min-width: 0; }
    .profile-identity { display: grid; gap: var(--sf-space-1); min-width: 0; }
    .profile-identity > span, .profile-disabled-note { color: var(--muted); font-size: var(--sf-font-size-sm); }
    .item-title-line { align-items: center; display: flex; flex-wrap: wrap; gap: var(--sf-space-2); min-width: 0; }
    .item-title-line strong { min-width: 0; overflow-wrap: anywhere; }
    .status-badge { border-radius: var(--sf-radius-sm); display: inline-flex; font-size: var(--sf-font-size-xs); font-weight: var(--sf-font-weight-semibold); padding: 2px var(--sf-space-2); }
    .status-active { background: var(--sf-color-success-surface); color: var(--sf-color-success); }
    .status-archived { background: var(--sf-color-surface-soft); color: var(--sf-color-muted-text); }
    .status-in-use { background: var(--sf-color-primary); color: var(--sf-color-on-primary); }
    .status-neutral { background: var(--sf-color-warning-surface); color: var(--sf-color-warning-text); }
    .maintenance-actions { align-items: center; display: flex; flex-wrap: wrap; gap: var(--sf-space-3); justify-content: space-between; min-width: 0; }
    .settings-page .sf-tabs { min-width: 0; width: 100%; }
    .settings-page .icon-button { min-height: var(--sf-density-interactive-target-min); min-width: var(--sf-density-interactive-target-min); }
    .item-actions { align-items: center; display: flex; flex: 0 0 auto; gap: var(--sf-space-2); margin-left: auto; }
    .profile-links { align-items: center; display: flex; flex-wrap: wrap; gap: var(--sf-space-1); min-width: 0; }
    .profile-links .secondary-link { background: transparent; border-color: transparent; border-radius: var(--radius); font-size: var(--sf-font-size-sm); min-height: var(--sf-density-interactive-target-min); padding: 0 var(--sf-space-3); text-decoration: underline; text-underline-offset: 3px; }
    .profile-links .secondary-link:hover, .profile-links .secondary-link:focus-visible { background: var(--sf-color-neutral-control-hover); border-color: var(--sf-color-neutral-control-border-hover); }
    .rule-summary { align-items: baseline; display: flex; flex-wrap: wrap; gap: var(--sf-space-3); justify-content: space-between; min-width: 0; }
    .rule-detail-grid { display: grid; gap: var(--sf-space-6); grid-template-columns: repeat(2, minmax(0, 1fr)); min-width: 0; }
    .rule-detail { min-width: 0; }
    .rule-detail h3 { color: var(--muted); font-size: var(--sf-font-size-sm); margin-bottom: var(--sf-space-2); }
    .rule-detail ul { display: grid; gap: var(--sf-space-1); margin: 0; padding-left: var(--sf-space-5); }
    .rule-detail li, .rule-explanation, .profile-disabled-note { overflow-wrap: anywhere; }
    .rule-explanation { color: var(--muted); font-size: var(--sf-font-size-sm); margin: 0; }
    .rule-actions { justify-content: flex-end; }
    .settings-operation { align-items: center; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: var(--sf-space-4); justify-content: space-between; padding-top: var(--sf-space-5); }
    .settings-operation > div:first-child { display: grid; flex: 1 1 300px; gap: var(--sf-space-1); min-width: 0; }
    .settings-operation p { color: var(--muted); font-size: var(--sf-font-size-sm); overflow-wrap: anywhere; }
    .settings-operation-actions { flex: 0 0 auto; }
    .settings-operation > [data-form-status] { flex-basis: 100%; }
    .settings-page .master-dialog { max-height: calc(100dvh - 32px); overflow-y: auto; }
    .settings-page .master-dialog .edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .settings-page .master-dialog .edit-grid label { min-width: 0; }
    .settings-page .master-dialog .edit-grid :is(input,select) { width: 100%; }
    .settings-dialog-context { color: var(--muted); font-size: var(--sf-font-size-sm); margin-top: var(--sf-space-2); }
    .settings-dialog-actions { align-items: center; border-top: 1px solid var(--line); display: flex; gap: var(--sf-space-2); grid-column: 1 / -1; justify-content: flex-end; padding-top: var(--sf-space-3); }
    .settings-dialog-actions .sf-button { min-width: 124px; }
    .field-error { color: var(--danger); display: block; font-size: var(--sf-font-size-xs); margin-top: var(--sf-space-1); }
    .field-error[hidden] { display: none; }
    .field-warning { color: var(--sf-color-warning-text); display: block; font-size: var(--sf-font-size-xs); line-height: 1.4; margin-top: var(--sf-space-1); }
    .field-warning a { color: inherit; text-decoration: underline; }
    .load-error { background: var(--sf-color-danger-surface); border: 1px solid var(--sf-color-danger-border); border-radius: var(--radius); display: grid; gap: var(--sf-space-2); padding: var(--sf-space-3); }
    .load-error p { color: var(--danger); overflow-wrap: anywhere; }
    .load-error .button-link { justify-self: start; }
    .empty-state { justify-items: start; }
    .full-span { grid-column: 1 / -1; }
    .form-status { font-size: var(--sf-font-size-sm); overflow-wrap: anywhere; }
    .form-status.error { color: var(--sf-color-danger); }
    .form-status.success { color: var(--sf-color-success); }
    @media (max-width: 760px) {
      /* The shared mobile shell uses a 1fr track; constrain its implicit min-content width on this route. */
      .app-shell { grid-template-columns: minmax(0, 1fr); }
      .sidebar, .main-area, .topbar { max-width: 100%; min-width: 0; }
      .topbar > div { min-width: 0; overflow-wrap: anywhere; }
      .sidebar > nav { min-width: 0; }
      .settings-section-heading { display: grid; gap: var(--sf-space-3); grid-template-columns: minmax(0, 1fr); }
      .settings-section-heading .sf-button { justify-self: start; }
      .rule-detail-grid { gap: var(--sf-space-3); grid-template-columns: 1fr; }
      .settings-operation { align-items: stretch; display: grid; grid-template-columns: minmax(0, 1fr); }
      .settings-operation-actions { justify-self: start; }
    }
    @media (max-width: 430px) {
      .settings-section-heading .sf-button { width: 100%; }
      .settings-operation-actions, .settings-operation-actions .sf-button { width: 100%; }
      .settings-page .master-dialog .edit-grid { grid-template-columns: 1fr; }
      .settings-dialog-actions .sf-button { flex: 1 1 0; min-width: 0; }
      .item-actions { margin-left: 0; }
    }
  `;
}
