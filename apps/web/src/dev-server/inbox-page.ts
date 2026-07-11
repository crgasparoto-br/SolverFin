import { formatDateOnly } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { dialogScript, sharedDialogStyles, sharedShellStyles } from "./shared-styles.js";
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

interface ReviewQueueItem {
  id: string;
  kind: string;
  status: string;
  origin: string;
  confidence: number;
  risk: string;
  explanation: string;
  maskedSummary: string;
  createdAt: string;
  provider?: string;
  model?: string;
}

export async function renderInboxPage(token: string): Promise<string> {
  const [messages, reviewQueue, accounts, categories] = await Promise.all([
    apiGet<{ messages: BankMessageInboxRecord[] }>(token, "/api/bank-message-inbox?status=all"),
    apiGet<{ suggestions: ReviewQueueItem[] }>(
      token,
      "/api/ai-review-queue?status=pending_review&includeLowConfidence=true",
    ),
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts"),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories"),
  ]);

  if (!messages.ok) {
    return renderShell(renderError(messages.error));
  }

  const accountOptions = accounts.ok ? accounts.data.accounts : [];
  const categoryOptions = categories.ok ? categories.data.categories : [];
  const suggestions = reviewQueue.ok ? reviewQueue.data.suggestions : [];

  return renderShell(
    `
        <section class="page-heading">
          <div>
            <p class="eyebrow">Mensagens e revisão</p>
            <h1>Inbox</h1>
            <p class="muted">Cole mensagens fictícias ou autorizadas, revise importações, deduplicação, conciliação e sugestões de regras automáticas antes de confirmar.</p>
          </div>
          <button type="button" data-open-dialog="new-inbox-message-dialog">Registrar mensagem</button>
        </section>
        <section class="panel list-panel">
          <div class="section-heading">
            <h2>Fila de revisão</h2>
            <span>${suggestions.length} pendentes</span>
          </div>
          <div class="rows maintenance-rows">
            ${
              suggestions.map(renderReviewSuggestionRow).join("") ||
              renderEmptyState(
                "Nenhuma sugestão pendente.",
                "Importações, mensagens, conciliações e regras automáticas aparecerão aqui antes de qualquer confirmação.",
              )
            }
          </div>
        </section>
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
        ${reviewQueue.ok ? "" : `<p class="error" role="alert">Não foi possível carregar a fila de revisão: ${escapeHtml(reviewQueue.error)}</p>`}
        ${renderNewMessageDialog(accountOptions, categoryOptions)}
        ${apiFormScript()}
        ${dialogScript()}
      `,
  );
}

function renderNewMessageDialog(accounts: AccountRecord[], categories: CategoryRecord[]): string {
  return `
    <dialog id="new-inbox-message-dialog" class="master-dialog" aria-labelledby="new-inbox-message-title">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
        <p class="eyebrow">Nova entrada</p>
        <h2 id="new-inbox-message-title">Registrar mensagem</h2>
      </div>
      <form data-api-form data-api-path="/api/bank-message-inbox" class="edit-grid">
        <input type="hidden" name="origin" value="pasted" />
        <label class="full-span">Mensagem
          <textarea name="text" rows="8" required placeholder="Cole aqui uma mensagem fictícia ou autorizada"></textarea>
        </label>
        <label>Conta para sugestão
          <select name="accountId">
            <option value="">Revisar depois</option>
            ${renderAccountOptions(accounts)}
          </select>
        </label>
        <label>Categoria
          <select name="categoryId">
            <option value="">Sem categoria</option>
            ${renderCategoryOptions(categories)}
          </select>
        </label>
        <label class="consent-check full-span">
          <input name="consentAccepted" type="checkbox" value="true" required />
          Confirmo que tenho autorização para processar esta mensagem neste perfil financeiro.
        </label>
        <button type="submit">Enviar para revisão</button>
      </form>
      <p class="muted small-note">O texto bruto é descartado após a normalização. A tela mostra apenas resumo mascarado, status e explicação da sugestão.</p>
    </dialog>
  `;
}

function renderReviewSuggestionRow(item: ReviewQueueItem): string {
  const confidence = `${Math.round(item.confidence * 100)}%`;
  const reviewApiBase =
    item.kind === "deduplication" || item.kind === "reconciliation"
      ? "/api/review-suggestions"
      : "/api/ai-review-queue";

  return `
    <article class="maintenance-item">
      <div class="maintenance-summary">
        <div>
          <strong>${escapeHtml(formatSuggestionKind(item.kind))}</strong>
          <span>${escapeHtml(formatDateTime(item.createdAt))} - origem ${escapeHtml(formatOrigin(item.origin))} - confiança ${escapeHtml(confidence)}</span>
        </div>
      </div>
      <div class="message-preview">
        <p><strong>${escapeHtml(item.maskedSummary)}</strong></p>
        <p>${escapeHtml(item.explanation)}</p>
      </div>
      <div class="maintenance-actions" aria-label="Ações da sugestão ${escapeHtml(item.id)}">
        <button type="button" class="secondary-button" data-api-action data-api-method="POST" data-api-path="${escapeHtml(reviewApiBase)}/${escapeHtml(item.id)}/approve" data-api-confirm="Aprovar esta sugestão?">Aprovar</button>
        <button type="button" class="secondary-button danger-action" data-api-action data-api-method="POST" data-api-path="${escapeHtml(reviewApiBase)}/${escapeHtml(item.id)}/reject" data-api-confirm="Rejeitar esta sugestão?">Rejeitar</button>
      </div>
    </article>
  `;
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
        ${suggestion ? `<a class="secondary-link" href="#">Sugestão disponível na fila acima</a>` : ""}
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

function formatSuggestionKind(kind: string): string {
  if (kind === "transaction_extraction") return "Extração de lançamento";
  if (kind === "categorization") return "Regra automática";
  if (kind === "deduplication") return "Possível duplicidade";
  if (kind === "reconciliation") return "Conciliação sugerida";
  if (kind === "insight") return "Insight";
  return kind;
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
  if (origin === "shared") return "compartilhamento";
  if (origin === "import") return "importação";
  if (origin === "rule") return "regra";
  if (origin === "automation") return "automação";
  return "texto colado";
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
    ${sharedDialogStyles()}
    .small-note { font-size: 0.8125rem; }
    textarea { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); color: var(--text); font: inherit; font-size: 0.875rem; line-height: 1.5; min-height: 36px; padding: 8px 10px; resize: vertical; width: 100%; }
    .secondary-link { align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); color: var(--primary); cursor: pointer; display: inline-flex; font: inherit; font-size: 0.8125rem; font-weight: 600; justify-content: center; min-height: 34px; padding: 0 12px; text-decoration: none; } .secondary-link:hover { background: var(--primary-soft); border-color: #c8dde5; }
    main { display: grid; gap: 14px; margin: 0 auto; max-width: 1440px; padding: 18px 20px; width: 100%; }
    .page-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .page-heading > div { display: grid; gap: 4px; max-width: 760px; }
    .section-heading { align-items: center; display: flex; gap: 10px; justify-content: space-between; } .section-heading span { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: 0.6875rem; font-weight: 700; padding: 2px 7px; white-space: nowrap; }
    .rows, .maintenance-item, .maintenance-actions { display: grid; gap: 10px; }
    .maintenance-item { border-top: 1px solid var(--line); padding-top: 10px; } .maintenance-item:first-child { border-top: 0; padding-top: 0; }
    .maintenance-summary { align-items: start; display: flex; gap: 12px; justify-content: space-between; min-width: 0; } .maintenance-summary > div { display: grid; gap: 3px; min-width: 0; } .maintenance-summary span { color: var(--muted); font-size: 0.8125rem; line-height: 1.4; }
    .maintenance-actions, .message-preview { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: var(--radius); padding: 10px; }
    .message-preview p { color: var(--muted); font-size: 0.8125rem; line-height: 1.5; overflow-wrap: anywhere; }
    .full-span { grid-column: 1 / -1; }
    .consent-check { align-items: start; display: grid; font-size: 0.875rem; font-weight: 600; grid-template-columns: auto minmax(0, 1fr); } .consent-check input { height: 16px; min-height: 16px; margin-top: 3px; width: 16px; }
    @media (max-width: 760px) { .page-heading { align-items: stretch; display: grid; } .section-heading, .maintenance-summary { align-items: stretch; display: grid; } }
  `;
}
