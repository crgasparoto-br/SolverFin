import { formatDateOnly } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { privateRoutes } from "./routes.js";

interface AccountRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
}

interface CategoryRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
}

interface BankMessageInboxRecord {
  id: string;
  origin: string;
  status: string;
  maskedText: string;
  receivedAt: string;
  suggestion?: {
    id: string;
    status: string;
    confidence: number;
    explanation: string;
  };
}

export async function renderInboxPage(token: string): Promise<string> {
  const [messages, accounts, categories] = await Promise.all([
    apiGet<{ messages: BankMessageInboxRecord[] }>(token, "/api/bank-message-inbox?status=all"),
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts"),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories"),
  ]);

  if (!messages.ok) {
    return renderPage("Inbox - SolverFin", renderShell("/inbox", renderError(messages.error)));
  }

  const accountOptions = accounts.ok ? accounts.data.accounts : [];
  const categoryOptions = categories.ok ? categories.data.categories : [];

  return renderPage(
    "Inbox - SolverFin",
    renderShell(
      "/inbox",
      `
        <section class="page-heading">
          <p class="eyebrow">Mensagens bancárias</p>
          <h1>Inbox</h1>
          <p class="muted">Cole mensagens fictícias ou autorizadas para criar sugestões revisáveis. Nenhum lançamento final é criado sem confirmação.</p>
        </section>
        <section class="workspace-grid wide-form">
          <section class="panel list-panel">
            <div class="section-heading">
              <h2>Itens recebidos</h2>
              <span>${messages.data.messages.length} itens</span>
            </div>
            <div class="rows maintenance-rows">
              ${
                messages.data.messages.map(renderInboxRow).join("") ||
                renderEmptyState(
                  "Nenhuma mensagem recebida.",
                  "Cole uma mensagem autorizada para gerar uma sugestão pendente de revisão.",
                )
              }
            </div>
          </section>
          <section class="panel form-panel privacy-panel">
            <div>
              <p class="eyebrow">Nova entrada</p>
              <h2>Registrar mensagem</h2>
            </div>
            <form data-api-form data-api-path="/api/bank-message-inbox">
              <input type="hidden" name="origin" value="pasted" />
              <label class="full-span">Mensagem
                <textarea name="text" rows="8" required placeholder="Cole aqui uma mensagem fictícia ou autorizada"></textarea>
              </label>
              <label>Conta para sugestão
                <select name="accountId">
                  <option value="">Revisar depois</option>
                  ${renderAccountOptions(accountOptions)}
                </select>
              </label>
              <label>Categoria
                <select name="categoryId">
                  <option value="">Sem categoria</option>
                  ${renderCategoryOptions(categoryOptions)}
                </select>
              </label>
              <label class="consent-check full-span">
                <input name="consentAccepted" type="checkbox" value="true" required />
                Confirmo que tenho autorização para processar esta mensagem neste perfil financeiro.
              </label>
              <button type="submit">Enviar para revisão</button>
            </form>
            <p class="muted small-note">O texto bruto é descartado após a normalização. A tela mostra apenas resumo mascarado, status e explicação da sugestão.</p>
          </section>
        </section>
        ${apiFormScript()}
      `,
    ),
  );
}

function renderInboxRow(item: BankMessageInboxRecord): string {
  const suggestion = item.suggestion;
  const confidence = suggestion ? `${Math.round(suggestion.confidence * 100)}%` : "-";

  return `
    <article class="maintenance-item">
      <div class="maintenance-summary">
        <div>
          <strong>${escapeHtml(formatInboxStatus(item.status))}</strong>
          <span>${escapeHtml(formatDateTime(item.receivedAt))} - origem ${escapeHtml(formatOrigin(item.origin))} - confiança ${escapeHtml(confidence)}</span>
        </div>
      </div>
      <div class="message-preview">
        <p>${escapeHtml(item.maskedText)}</p>
      </div>
      <div class="maintenance-actions" aria-label="Ações da mensagem recebida">
        ${suggestion ? `<a class="secondary-link" href="/configuracoes">Revisar na fila de sugestões</a>` : ""}
        ${item.status === "pending_review" ? renderActionButton("Descartar mensagem", `/api/bank-message-inbox/${item.id}/discard`, "Descartar esta mensagem da inbox?") : ""}
      </div>
    </article>
  `;
}

function renderShell(pathname: string, content: string): string {
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="/dashboard" aria-label="Ir para o resumo do SolverFin">SolverFin</a>
        <nav aria-label="Menu principal">${renderNavigation(pathname)}</nav>
        <button class="logout" type="button" data-logout>Sair</button>
      </aside>
      <div class="main-area">
        <header class="topbar"><div><strong>Inbox</strong><span>Usuário Demo SolverFin</span></div><button type="button" data-logout>Sair</button></header>
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
  `;
}

function renderError(error: string): string {
  return `
    <section class="panel placeholder-state">
      <p class="eyebrow">Erro ao carregar dados</p>
      <h1>Inbox</h1>
      <p class="error" role="alert">${escapeHtml(error)}</p>
      <a class="button-link" href="/inbox">Tentar novamente</a>
    </section>
  `;
}

function renderActionButton(label: string, path: string, confirmation: string): string {
  return `<button type="button" class="secondary-button danger-action" data-api-action data-api-method="POST" data-api-path="${escapeHtml(path)}" data-api-confirm="${escapeHtml(confirmation)}">${escapeHtml(label)}</button>`;
}

function renderNavigation(activePathname: string): string {
  return Array.from(privateRoutes.entries())
    .map(
      ([path, label]) =>
        `<a href="${path}" ${path === activePathname ? `aria-current="page"` : ""}>${escapeHtml(label)}</a>`,
    )
    .join("");
}

function renderAccountOptions(accounts: AccountRecord[]): string {
  return accounts
    .map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`)
    .join("");
}

function renderCategoryOptions(categories: CategoryRecord[]): string {
  return categories
    .map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`)
    .join("");
}

function renderEmptyState(title: string, description: string): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(description)}</p></div>`;
}

function formatInboxStatus(status: string): string {
  if (status === "pending_review") return "Pendente de revisão";
  if (status === "approved") return "Aprovada";
  if (status === "edited") return "Editada";
  if (status === "rejected") return "Rejeitada";
  if (status === "discarded") return "Descartada";
  if (status === "error") return "Com erro";
  return status;
}

function formatOrigin(origin: string): string {
  return origin === "shared" ? "compartilhamento" : "texto colado";
}

function formatDateTime(value: string): string {
  return formatDateOnly(value.slice(0, 10));
}

function apiFormScript(): string {
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
        const status = ensureStatus(button.closest(".maintenance-actions") || button.parentElement);
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

function renderPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <title>${escapeHtml(title)}</title>
    <style>${baseCss()}</style>
  </head>
  <body>${body}</body>
</html>`;
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
    :root { color-scheme: light; --bg: #f8fafc; --surface: #ffffff; --surface-soft: #eef5f8; --text: #0f172a; --muted: #475569; --line: #cbd5e1; --primary: #0f3d4c; --primary-soft: #e8f3f6; --cyan: #0891b2; --success: #166534; --success-bg: #dcfce7; --danger: #dc2626; --danger-bg: #fee2e2; --warning: #b45309; --warning-bg: #fef3c7; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    h1, h2, p { margin: 0; } h1 { font-size: clamp(1.6rem, 4vw, 2rem); line-height: 1.15; } h2 { font-size: 1rem; line-height: 1.3; } a { color: inherit; }
    button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 3px solid rgba(34, 211, 238, .55); outline-offset: 2px; }
    .panel, .placeholder-state { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
    .panel { display: grid; gap: 16px; min-width: 0; }
    .eyebrow { color: var(--cyan); font-size: .78rem; font-weight: 800; letter-spacing: 0; text-transform: uppercase; } .muted { color: var(--muted); line-height: 1.5; }
    .small-note { font-size: .9rem; }
    form, label { display: grid; gap: 10px; } label { color: var(--text); font-weight: 700; }
    input, select, textarea { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; color: var(--text); font: inherit; min-height: 44px; padding: 10px 12px; width: 100%; }
    textarea { line-height: 1.45; resize: vertical; }
    button, .button-link, .secondary-link { align-items: center; background: var(--primary); border: 0; border-radius: 8px; color: white; cursor: pointer; display: inline-flex; font: inherit; font-weight: 800; justify-content: center; min-height: 44px; padding: 0 16px; text-decoration: none; }
    button:disabled { cursor: not-allowed; opacity: .58; }
    .secondary-button, .secondary-link { background: var(--primary-soft); border: 1px solid #d4e6ec; color: var(--primary); }
    .danger-action { background: var(--danger-bg); border-color: #fecaca; color: var(--danger); }
    .error { background: var(--danger-bg); border: 1px solid #fecaca; border-radius: 8px; color: var(--danger); padding: 10px 12px; }
    .success { background: var(--success-bg); border: 1px solid #bbf7d0; border-radius: 8px; color: var(--success); padding: 10px 12px; }
    .form-status { grid-column: 1 / -1; }
    .app-shell { display: grid; grid-template-columns: 248px minmax(0, 1fr); min-height: 100vh; } .sidebar { background: var(--primary); color: white; display: flex; flex-direction: column; gap: 22px; padding: 22px; }
    .brand { align-items: center; display: inline-flex; font-size: 1.2rem; font-weight: 900; min-height: 44px; text-decoration: none; } nav { display: grid; gap: 6px; } nav a { border-radius: 8px; color: rgba(255,255,255,.82); font-weight: 800; min-height: 40px; padding: 10px 12px; text-decoration: none; } nav a:hover, nav a[aria-current="page"] { background: rgba(34,211,238,.18); color: white; }
    .logout { background: rgba(255,255,255,.12); margin-top: auto; } .main-area { min-width: 0; } .topbar { align-items: center; background: rgba(255,255,255,.92); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; min-height: 64px; padding: 0 24px; position: sticky; top: 0; z-index: 5; } .topbar div { display: grid; gap: 2px; } .topbar span { color: var(--muted); font-size: .875rem; }
    main { display: grid; gap: 20px; margin: 0 auto; max-width: 1180px; padding: 24px; width: 100%; }
    .page-heading { display: grid; gap: 6px; max-width: 760px; }
    .workspace-grid { align-items: start; display: grid; gap: 18px; grid-template-columns: minmax(0, .95fr) minmax(22rem, .6fr); }
    .section-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .section-heading span { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: .78rem; font-weight: 800; padding: 6px 10px; white-space: nowrap; }
    .rows, .maintenance-item, .maintenance-actions { display: grid; gap: 12px; }
    .maintenance-item { border-top: 1px solid var(--line); padding-top: 14px; } .maintenance-item:first-child { border-top: 0; padding-top: 0; }
    .maintenance-summary { align-items: start; display: flex; gap: 16px; justify-content: space-between; min-width: 0; } .maintenance-summary > div { display: grid; gap: 4px; min-width: 0; } .maintenance-summary span { color: var(--muted); line-height: 1.45; }
    .maintenance-actions, .message-preview { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: 8px; padding: 12px; }
    .message-preview p { color: var(--muted); line-height: 1.55; overflow-wrap: anywhere; }
    .empty-state { background: var(--bg); border: 1px dashed var(--line); border-radius: 8px; display: grid; gap: 6px; padding: 16px; }
    .form-panel form { grid-template-columns: repeat(2, minmax(0, 1fr)); } .full-span, .form-panel button { grid-column: 1 / -1; }
    .consent-check { align-items: start; display: grid; font-weight: 700; grid-template-columns: auto minmax(0, 1fr); } .consent-check input { height: 20px; min-height: 20px; margin-top: 2px; width: 20px; }
    @media (max-width: 1024px) { .workspace-grid { grid-template-columns: 1fr; } }
    @media (max-width: 760px) { .app-shell { grid-template-columns: 1fr; } .sidebar { gap: 12px; padding: 12px 16px; position: sticky; top: 0; z-index: 10; } .sidebar .logout { display: none; } nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; } nav a { background: rgba(255,255,255,.1); flex: 0 0 auto; min-height: 44px; white-space: nowrap; } .topbar { min-height: 56px; padding: 0 16px; position: static; } .topbar button { display: none; } main { padding: 18px 16px 28px; } .form-panel form { grid-template-columns: 1fr; } .section-heading, .maintenance-summary { align-items: stretch; display: grid; } }
  `;
}
