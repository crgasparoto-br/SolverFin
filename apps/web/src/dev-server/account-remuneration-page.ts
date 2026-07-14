import { apiGet } from "./api.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { sharedShellStyles } from "./shared-styles.js";

interface ConfigurationRecord {
  id: string;
  accountId: string;
  accountName: string;
  accountCurrency: string;
  enabled: boolean;
  indexKind: "cdi";
  remunerationPercent?: number;
  startsOn?: string;
  categoryId?: string;
  updatedAt: string;
}

interface CategoryRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
}

export async function renderAccountRemunerationPage(token: string): Promise<string> {
  const [configurationResult, categoryResult] = await Promise.all([
    apiGet<{ configurations: ConfigurationRecord[] }>(
      token,
      "/api/account-remuneration/configurations",
    ),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories?status=all"),
  ]);

  if (!configurationResult.ok) {
    return renderPage(renderError(configurationResult.error));
  }

  const categories = categoryResult.ok
    ? categoryResult.data.categories.filter(
        (category) => category.status === "active" && category.kind === "income",
      )
    : [];
  const configurations = configurationResult.data.configurations;

  return renderPage(`
    <section class="page-heading">
      <div>
        <p class="eyebrow">Contas remuneradas</p>
        <h1>Remuneração pelo CDI</h1>
        <p class="muted">Defina quais contas em reais geram uma receita prevista diária com base no saldo final do dia anterior.</p>
      </div>
      <a class="button-link secondary" href="/contas-cartoes">Voltar para contas</a>
    </section>

    <section class="info-panel" aria-label="Como funciona">
      <strong>Como o cálculo é feito</strong>
      <p>O SolverFin usa a taxa diária oficial do CDI, aplica o percentual configurado e cria um lançamento previsto no dia seguinte. O valor pode ser ajustado no extrato sem perder o valor originalmente calculado.</p>
    </section>

    <section class="configuration-list" aria-label="Configurações por conta">
      ${
        configurations.length > 0
          ? configurations.map((configuration) => renderConfiguration(configuration, categories)).join("")
          : renderEmptyState()
      }
    </section>
    ${script()}
  `);
}

function renderConfiguration(
  configuration: ConfigurationRecord,
  categories: CategoryRecord[],
): string {
  const supportsCdi = configuration.accountCurrency === "BRL";
  const status = configuration.enabled ? "Ativa" : "Desativada";

  return `
    <article class="configuration-card">
      <header>
        <div>
          <h2>${escapeHtml(configuration.accountName)}</h2>
          <p class="muted">${escapeHtml(configuration.accountCurrency)} · índice CDI</p>
        </div>
        <span class="status-pill ${configuration.enabled ? "active" : ""}">${status}</span>
      </header>
      ${
        supportsCdi
          ? `<form data-remuneration-form data-account-id="${escapeHtml(configuration.accountId)}">
              <label>Situação
                <select name="enabled">
                  <option value="false"${configuration.enabled ? "" : " selected"}>Desativada</option>
                  <option value="true"${configuration.enabled ? " selected" : ""}>Ativa</option>
                </select>
              </label>
              <label>Percentual de remuneração sobre o CDI
                <div class="percentage-field"><input name="remunerationPercent" type="number" min="0.0001" max="1000" step="0.0001" value="${escapeHtml(String(configuration.remunerationPercent ?? 100))}" required /><span>%</span></div>
              </label>
              <label>Data inicial
                <input name="startsOn" type="date" value="${escapeHtml(configuration.startsOn ?? today())}" required />
              </label>
              <label>Categoria de receita
                <select name="categoryId">
                  <option value="">Sem categoria padrão</option>
                  ${renderCategoryOptions(categories, configuration.categoryId)}
                </select>
              </label>
              <div class="form-actions">
                <button type="submit">Salvar configuração</button>
                <p class="form-status muted" data-form-status aria-live="polite"></p>
              </div>
            </form>`
          : `<div class="unsupported"><strong>Conta não elegível</strong><p>A remuneração pelo CDI está disponível somente para contas em BRL.</p></div>`
      }
    </article>
  `;
}

function renderCategoryOptions(categories: CategoryRecord[], selected?: string): string {
  return categories
    .map(
      (category) =>
        `<option value="${escapeHtml(category.id)}"${category.id === selected ? " selected" : ""}>${escapeHtml(category.name)}</option>`,
    )
    .join("");
}

function renderEmptyState(): string {
  return `
    <div class="empty-state">
      <strong>Nenhuma conta ativa encontrada.</strong>
      <p>Cadastre uma conta em reais para configurar a remuneração pelo CDI.</p>
      <a class="button-link" href="/contas-cartoes">Cadastrar conta</a>
    </div>
  `;
}

function renderError(error: string): string {
  return `
    <section class="error-state">
      <p class="eyebrow">Não foi possível carregar</p>
      <h1>Remuneração pelo CDI</h1>
      <p class="error" role="alert">${escapeHtml(error)}</p>
      <a class="button-link" href="/remuneracao-contas">Tentar novamente</a>
    </section>
  `;
}

function renderPage(content: string): string {
  return renderAuthenticatedShellDocument({
    activePathname: "/remuneracao-contas",
    currentLabel: "Remuneração pelo CDI",
    content,
    styles: css(),
  });
}

function script(): string {
  return `
    <script>
      document.querySelectorAll("[data-remuneration-form]").forEach((form) => {
        const status = form.querySelector("[data-form-status]");
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const data = new FormData(form);
          status.className = "form-status muted";
          status.textContent = "Salvando...";
          const response = await fetch(
            "/api/account-remuneration/configurations/" + encodeURIComponent(form.dataset.accountId),
            {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                enabled: data.get("enabled") === "true",
                remunerationPercent: Number(data.get("remunerationPercent")),
                startsOn: String(data.get("startsOn") || ""),
                categoryId: String(data.get("categoryId") || "") || undefined
              })
            }
          );
          const body = await response.json().catch(() => ({}));
          status.className = response.ok ? "form-status success" : "form-status error";
          status.textContent = response.ok
            ? ((body.operation && body.operation.message) || "Configuração salva.")
            : ((body.error && body.error.message) || "Não foi possível salvar a configuração.");
          if (response.ok) window.setTimeout(() => window.location.reload(), 500);
        });
      });
    </script>
  `;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function css(): string {
  return `
    ${sharedShellStyles()}
    main { display: grid; gap: 14px; margin: 0 auto; max-width: 1180px; padding: 18px 20px; width: 100%; }
    .page-heading { align-items: center; display: flex; gap: 16px; justify-content: space-between; }
    .page-heading > div { display: grid; gap: 4px; max-width: 760px; }
    .info-panel, .configuration-card, .empty-state, .error-state { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
    .info-panel { display: grid; gap: 5px; padding: 14px; }
    .info-panel p { color: var(--muted); font-size: 0.875rem; line-height: 1.5; }
    .configuration-list { display: grid; gap: 12px; }
    .configuration-card { display: grid; gap: 14px; padding: 14px; }
    .configuration-card header { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
    .configuration-card header > div { display: grid; gap: 3px; }
    .configuration-card h2 { font-size: 1rem; }
    .status-pill { background: var(--surface-soft); border-radius: 999px; color: var(--muted); font-size: 0.75rem; font-weight: 700; padding: 4px 9px; }
    .status-pill.active { background: var(--success-bg); color: var(--success); }
    form { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .percentage-field { align-items: center; display: grid; gap: 6px; grid-template-columns: minmax(0, 1fr) auto; }
    .percentage-field span { color: var(--muted); font-weight: 700; }
    .form-actions { align-items: center; display: flex; gap: 10px; grid-column: 1 / -1; }
    .form-status { font-size: 0.8125rem; }
    .unsupported { background: var(--warning-bg); border: 1px solid #fde68a; border-radius: var(--radius); color: var(--warning); display: grid; gap: 4px; padding: 12px; }
    .unsupported p { font-size: 0.8125rem; }
    .empty-state, .error-state { display: grid; gap: 8px; justify-items: start; padding: 18px; }
    @media (max-width: 720px) { .page-heading, form { display: grid; grid-template-columns: 1fr; } .form-actions { grid-column: auto; align-items: stretch; display: grid; } }
  `;
}
