import { formatDateOnly } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { sharedShellStyles } from "./shared-styles.js";
import { renderAuthenticatedShellDocument } from "./shell.js";

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
    return renderShell(renderError(messages.error));
  }

  const accountOptions = accounts.ok ? accounts.data.accounts : [];
  const categoryOptions = categories.ok ? categories.data.categories : [];

  return renderShell(
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

function renderShell(content: string): string {
  return renderAuthenticatedShellDocument({
    activePathname: "/inbox",
    content,
    currentLabel: "Inbox",
    styles: baseCss(),
  });
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
    .small-note { font-size: .9rem; }
    textarea { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; color: var(--text); font: inherit; line-height: 1.45; min-height: 44px; padding: 10px 12px; resize: vertical; width: 100%; }
    .secondary-link { align-items: center; background: var(--primary-soft); border: 1px solid #d4e6ec; border-radius: 8px; color: var(--primary); cursor: pointer; display: inline-flex; font: inherit; font-weight: 800; justify-content: center; min-height: 44px; padding: 0 16px; text-decoration: none; }
    main { display: grid; gap: 20px; margin: 0 auto; max-width: 1440px; padding: 24px; width: 100%; }
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
    @media (max-width: 760px) { .form-panel form { grid-template-columns: 1fr; } .section-heading, .maintenance-summary { align-items: stretch; display: grid; } }
  `;
}
