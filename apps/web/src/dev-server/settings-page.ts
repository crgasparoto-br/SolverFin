import { apiGet } from "./api.js";
import { icon } from "./icons.js";
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
    <section class="page-heading settings-heading">
      <div>
        <p class="eyebrow">Preferências financeiras</p>
        <h1>Configurações</h1>
        <p class="muted">Organize seus perfis financeiros e as regras que geram sugestões para revisão.</p>
      </div>
    </section>
    ${renderSettingsNavigation(section)}
    ${selectedSection}
    ${settingsScript()}
    ${dialogScript()}
  `;
}

function renderSettingsNavigation(section: SettingsSection): string {
  return `
    <nav class="settings-sections" aria-label="Seções de Configurações">
      <a class="settings-section-link" href="${SETTINGS_PATH}?section=profiles"${section === "profiles" ? ' aria-current="page"' : ""}>Perfis financeiros</a>
      <a class="settings-section-link" href="${SETTINGS_PATH}?section=rules"${section === "rules" ? ' aria-current="page"' : ""}>Regras automáticas</a>
    </nav>
  `;
}

function renderProfilesSection(
  profiles: { ok: true; data: FinancialProfilesResponse } | { ok: false; error: string },
): string {
  if (!profiles.ok) {
    return `
      <section class="panel settings-section-panel" aria-labelledby="profiles-section-title">
        <div class="page-heading secondary-heading">
          <div>
            <h2 id="profiles-section-title">Perfis financeiros</h2>
            <p class="muted">Separe contextos como pessoal, família, MEI e negócio.</p>
          </div>
        </div>
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
    <section class="panel settings-section-panel" aria-labelledby="profiles-section-title">
      <div class="page-heading secondary-heading">
        <div>
          <h2 id="profiles-section-title">Perfis financeiros</h2>
          <p class="muted">Separe contextos como pessoal, família, MEI e negócio.</p>
        </div>
        <button type="button" data-open-dialog="new-profile-dialog" title="Criar novo perfil financeiro">${icon("plus", 14)} Novo perfil</button>
      </div>
      <div class="section-heading">
        <h3>Perfis disponíveis</h3>
        <span>${profiles.data.profiles.length} itens</span>
      </div>
      <div class="rows maintenance-rows">
        ${
          profileRows ||
          renderEmptyState(
            "Nenhum perfil financeiro.",
            "Crie seu primeiro perfil para começar a organizar os dados financeiros.",
            `<button type="button" data-open-dialog="new-profile-dialog">${icon("plus", 14)} Criar primeiro perfil</button>`,
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
    <section class="panel settings-section-panel" aria-labelledby="rules-section-title">
      <div class="page-heading secondary-heading">
        <div>
          <h2 id="rules-section-title">Regras automáticas</h2>
          <p class="muted">Regras geram sugestões revisáveis e nunca confirmam um lançamento final sem sua aprovação.</p>
        </div>
        <div class="heading-actions">
          <button type="button" data-open-dialog="new-automation-rule-dialog" title="Criar nova regra automática">${icon("plus", 14)} Nova regra</button>
          <button type="button" class="secondary-button" data-api-action data-api-method="POST" data-api-path="/api/automation-rules/apply" data-api-confirm="Executar regras sobre sugestões pendentes?" title="Aplicar regras sobre sugestões pendentes"${rules.ok ? "" : ' disabled aria-disabled="true"'}>${icon("play", 14)} Aplicar regras</button>
        </div>
      </div>
      <p class="priority-help">Números maiores são aplicados primeiro; em empate, vence a regra criada antes.</p>
      <div class="section-heading">
        <h3>Regras configuradas</h3>
        ${rules.ok ? `<span>${automationRules.length} itens</span>` : ""}
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
                  "Crie uma regra para sugerir categoria, conta ou status a partir de descrições, tipos e valores.",
                )
              }
            </div>`
          : renderLoadError(
              "Não foi possível carregar as regras automáticas.",
              rules.error,
              `${SETTINGS_PATH}?section=rules`,
            )
      }
    </section>
    ${renderNewAutomationRuleDialog(accounts, categories)}
  `;
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
        <button type="submit" title="Salvar novo perfil">${icon("save", 14)} Criar perfil</button>
      </form>
    </dialog>
  `;
}

function renderNewAutomationRuleDialog(
  accounts: DependencyState<AccountRecord>,
  categories: DependencyState<CategoryRecord>,
): string {
  return `
    <dialog id="new-automation-rule-dialog" class="master-dialog" aria-labelledby="new-automation-rule-title">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
        <p class="eyebrow">Nova automação</p>
        <h2 id="new-automation-rule-title">Nova regra automática</h2>
      </div>
      <form data-api-form data-api-path="/api/automation-rules" class="edit-grid" novalidate>
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
        <button type="submit" title="Salvar nova regra automática">${icon("save", 14)} Criar regra</button>
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
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
        <p class="eyebrow">Editar cadastro</p>
        <h2 id="${escapeHtml(titleId)}">${escapeHtml(profile.name)}</h2>
      </div>
      <form data-api-form data-api-method="PATCH" data-api-path="/api/financial-profiles/${escapeHtml(profile.id)}" class="edit-grid">
        <label>Nome<input name="name" value="${escapeHtml(profile.name)}" required /></label>
        <label>Tipo<select name="kind">${renderProfileKindOptions(profile.kind)}</select></label>
        <button type="submit" title="Salvar alterações do perfil">${icon("save", 14)} Salvar perfil</button>
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
    <article class="maintenance-item profile-item">
      <div class="maintenance-summary">
        <div>
          <div class="item-title-line">
            <strong>${escapeHtml(profile.name)}</strong>
            ${isSelected ? '<span class="status-badge status-in-use">Em uso</span>' : ""}
            ${renderProfileStatusBadge(profile.status)}
          </div>
          <span>${escapeHtml(formatProfileKind(profile.kind))}</span>
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
              ? `<button type="button" class="secondary-button danger-action" data-api-action data-api-method="POST" data-api-path="/api/financial-profiles/${escapeHtml(profile.id)}/archive" data-api-confirm="Arquivar este perfil financeiro?" title="Arquivar este perfil">${icon("archive", 13)} Arquivar perfil</button>`
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
        <span class="priority-badge" aria-label="Prioridade ${escapeHtml(String(rule.priority))}">Prioridade ${escapeHtml(String(rule.priority))}</span>
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
      <div class="item-actions rule-actions">
        ${
          isActive
            ? `<button type="button" class="secondary-button danger-action" data-api-action data-api-method="POST" data-api-path="/api/automation-rules/${escapeHtml(rule.id)}/archive" data-api-confirm="Inativar esta regra automática?" title="Inativar esta regra automática">${icon("archive", 13)} Inativar regra</button>`
            : ""
        }
      </div>
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

      async function readApiMessage(response) {
        const body = await response.json().catch(() => ({}));
        if (response.ok) return "Ação concluída. Atualizando a tela...";
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
          if (button.disabled) return;
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
    .secondary-link { background: var(--surface); border: 1px solid var(--line); color: var(--primary); } .secondary-link:hover { background: var(--primary-soft); border-color: #c8dde5; }
    main { display: grid; gap: 14px; margin: 0 auto; max-width: 1440px; padding: 18px 20px; width: 100%; } .page-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; min-width: 0; } .page-heading > div { display: grid; gap: 4px; max-width: 780px; min-width: 0; }
    .settings-heading { padding-bottom: 2px; } .secondary-heading { margin-top: 0; }
    .settings-sections { border-bottom: 1px solid var(--line); display: flex; gap: 4px; overflow-x: auto; scrollbar-width: thin; }
    .settings-section-link { border-bottom: 3px solid transparent; color: var(--muted); font-weight: 700; padding: 10px 12px 8px; text-decoration: none; white-space: nowrap; }
    .settings-section-link:hover, .settings-section-link:focus-visible { background: var(--surface-soft); color: var(--primary); }
    .settings-section-link[aria-current="page"] { border-bottom-color: var(--primary); color: var(--primary); }
    .settings-section-panel { display: grid; gap: 14px; min-width: 0; }
    .heading-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
    .priority-help { background: var(--surface-soft); border-left: 3px solid var(--primary); border-radius: 0 var(--radius) var(--radius) 0; color: var(--muted); margin: 0; padding: 8px 10px; }
    .section-heading { align-items: center; display: flex; gap: 10px; justify-content: space-between; } .section-heading h3 { font-size: 0.9375rem; margin: 0; } .section-heading span { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: 0.6875rem; font-weight: 700; padding: 2px 7px; white-space: nowrap; }
    .rows { display: grid; gap: 10px; } .maintenance-item { border-top: 1px solid var(--line); display: grid; gap: 10px; min-width: 0; padding-top: 10px; } .maintenance-item:first-child { border-top: 0; padding-top: 0; } .maintenance-summary { align-items: start; display: flex; gap: 12px; justify-content: space-between; min-width: 0; } .maintenance-summary > div { display: grid; gap: 3px; min-width: 0; } .maintenance-summary span { color: var(--muted); font-size: 0.8125rem; line-height: 1.4; }
    .item-title-line { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; } .item-title-line strong { overflow-wrap: anywhere; }
    .status-badge, .priority-badge { border: 1px solid var(--line); border-radius: 999px; display: inline-flex; font-size: 0.6875rem; font-weight: 700; line-height: 1; padding: 4px 7px; white-space: nowrap; }
    .status-active { background: #dcfce7; border-color: #bbf7d0; color: #166534; } .status-archived { background: var(--surface-soft); color: var(--muted); } .status-in-use { background: var(--primary-soft); border-color: #c8dde5; color: var(--primary); } .status-neutral { background: #fef3c7; border-color: #fde68a; color: #92400e; }
    .maintenance-actions { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: var(--radius); display: grid; gap: 8px; min-width: 0; padding: 10px; } .item-actions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; } .profile-links { display: flex; flex-wrap: wrap; gap: 6px; }
    .rule-summary { align-items: center; display: flex; gap: 10px; justify-content: space-between; min-width: 0; } .priority-badge { background: var(--surface-soft); color: var(--primary); }
    .rule-detail-grid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); min-width: 0; }
    .rule-detail { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: var(--radius); min-width: 0; padding: 10px; } .rule-detail h3 { font-size: 0.8125rem; margin: 0 0 6px; } .rule-detail ul { display: grid; gap: 4px; margin: 0; padding-left: 18px; } .rule-detail li { overflow-wrap: anywhere; }
    .rule-explanation { margin: 0; overflow-wrap: anywhere; } .rule-actions { border-top: 1px solid var(--line); padding-top: 8px; }
    .field-error { color: var(--danger); display: block; font-size: 0.75rem; margin-top: 4px; } .field-error[hidden] { display: none; } .field-warning { color: #92400e; display: block; font-size: 0.75rem; line-height: 1.4; margin-top: 4px; } .field-warning a { color: inherit; font-weight: 700; }
    .load-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: var(--radius); display: grid; gap: 8px; padding: 12px; } .load-error p { color: var(--danger); margin: 0; overflow-wrap: anywhere; } .load-error .button-link { justify-self: start; }
    .empty-state { display: grid; gap: 8px; justify-items: start; }
    .full-span { grid-column: 1 / -1; }
    @media (max-width: 760px) { main { padding: 16px; } .page-heading { align-items: stretch; display: grid; } .heading-actions { justify-content: stretch; } .heading-actions > * { flex: 1 1 auto; } .maintenance-summary, .section-heading, .rule-summary { align-items: stretch; display: grid; } .rule-detail-grid { grid-template-columns: 1fr; } .item-actions { justify-content: stretch; } .item-actions > * { flex: 1 1 auto; } }
    @media (max-width: 430px) { .settings-section-link { flex: 1 0 auto; text-align: center; } .profile-links { display: grid; grid-template-columns: 1fr; } .profile-links .button-link { justify-content: center; } }
  `;
}
