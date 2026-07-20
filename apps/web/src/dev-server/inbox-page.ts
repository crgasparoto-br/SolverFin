import { formatDateOnly } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { icon } from "./icons.js";
import { buildImportStatementUrl } from "./import-statement-navigation.js";
import { dialogScript, sharedDialogStyles, sharedShellStyles } from "./shared-styles.js";
import { renderAuthenticatedShellDocument } from "./shell.js";

interface AccountRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
  currency: string;
}

interface CategoryRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
}

interface FinancialProfileRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
}

interface FinancialProfilesResponse {
  activeProfileId?: string;
  profiles: FinancialProfileRecord[];
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
  const [messages, reviewQueue, accounts, categories, profiles] = await Promise.all([
    apiGet<{ messages: BankMessageInboxRecord[] }>(token, "/api/bank-message-inbox?status=all"),
    apiGet<{ suggestions: ReviewQueueItem[] }>(
      token,
      "/api/ai-review-queue?status=pending_review&includeLowConfidence=true",
    ),
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts"),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories"),
    apiGet<FinancialProfilesResponse>(token, "/api/financial-profiles"),
  ]);

  if (!messages.ok) return renderShell(renderError(messages.error));

  const accountOptions = accounts.ok
    ? accounts.data.accounts.filter((account) => account.status === "active")
    : [];
  const categoryOptions = categories.ok
    ? categories.data.categories.filter((category) => category.status === "active")
    : [];
  const suggestions = reviewQueue.ok
    ? reviewQueue.data.suggestions.filter((suggestion) => suggestion.origin !== "import")
    : [];
  const activeProfile = profiles.ok
    ? profiles.data.profiles.find((profile) => profile.id === profiles.data.activeProfileId)
    : undefined;
  const activeProfileLabel = activeProfile?.name ?? "Perfil financeiro ativo";

  return renderShell(`
    <section class="page-heading">
      <div>
        <p class="eyebrow">Entradas e revisão</p>
        <h1>Inbox</h1>
        <p class="muted">Importe extratos ou registre mensagens e confirme cada efeito financeiro antes de salvar.</p>
      </div>
      <div class="heading-actions">
        <button type="button" class="secondary-button" data-open-dialog="new-inbox-message-dialog" title="Registrar nova mensagem">${icon("send", 14)} Registrar mensagem</button>
        <button type="button" data-open-dialog="csv-import-dialog" title="Importar extrato CSV">${icon("upload", 14)} Importar extrato</button>
      </div>
    </section>

    ${renderCsvImportWorkspace()}

    <section class="panel list-panel">
      <div class="section-heading">
        <h2>Outras sugestões</h2>
        <span>${suggestions.length} pendentes</span>
      </div>
      <div class="rows maintenance-rows">
        ${
          suggestions.map(renderReviewSuggestionRow).join("") ||
          renderEmptyState(
            "Nenhuma outra sugestão pendente.",
            "Sugestões de mensagens, regras e automações aparecerão aqui antes da confirmação.",
          )
        }
      </div>
    </section>

    <section class="panel list-panel">
      <div class="section-heading">
        <h2>Mensagens recebidas</h2>
        <span>${messages.data.messages.length} itens</span>
      </div>
      <div class="rows maintenance-rows">
        ${
          messages.data.messages.map(renderInboxRow).join("") ||
          renderEmptyState(
            "Nenhuma mensagem recebida.",
            "Registre uma mensagem autorizada para gerar uma sugestão revisável.",
          )
        }
      </div>
    </section>

    ${reviewQueue.ok ? "" : `<p class="error" role="alert">Não foi possível carregar as outras sugestões: ${escapeHtml(reviewQueue.error)}</p>`}
    ${renderCsvImportDialog(accountOptions, activeProfileLabel)}
    ${renderCsvLineEditDialog()}
    ${renderNewMessageDialog(accountOptions, categoryOptions)}
    ${csvImportScript(accountOptions, categoryOptions, activeProfileLabel)}
    ${apiFormScript()}
    ${dialogScript()}
  `);
}

function renderCsvImportWorkspace(): string {
  return `
    <section class="panel import-workspace" aria-labelledby="csv-import-title">
      <div class="section-heading import-heading">
        <div>
          <h2 id="csv-import-title">Extratos CSV</h2>
          <p class="muted small-note">Pré-visualize, corrija e confirme somente as linhas desejadas.</p>
        </div>
        <div class="compact-filters" aria-label="Filtros de importação">
          <label>Status
            <select id="import-status-filter">
              <option value="all">Todos</option>
              <option value="reviewing">Em revisão</option>
              <option value="completed">Concluídos</option>
              <option value="discarded">Descartados</option>
              <option value="failed">Com falha</option>
            </select>
          </label>
          <button type="button" class="secondary-button" id="refresh-imports" title="Atualizar importações">${icon("refresh-cw", 13)} Atualizar</button>
        </div>
      </div>
      <div class="line-filter-bar" aria-label="Filtros das linhas importadas">
        <label>Linhas
          <select id="import-line-filter">
            <option value="all">Todas</option>
            <option value="eligible">Elegíveis para confirmar</option>
            <option value="candidate_pending">Com duplicidade ou conciliação pendente</option>
            <option value="approved_created">Lançamentos criados</option>
            <option value="reconciled">Conciliadas</option>
            <option value="duplicate_ignored">Ignoradas como duplicadas</option>
            <option value="rejected">Rejeitadas</option>
            <option value="problems">Problemas do arquivo</option>
          </select>
        </label>
      </div>
      <p id="import-workspace-status" class="form-status muted" role="status" aria-live="polite">Carregando importações...</p>
      <div class="import-layout">
        <div id="import-batch-list" class="import-batch-list" aria-label="Histórico de importações"></div>
        <div id="import-batch-detail" class="import-detail" aria-live="polite">
          ${renderEmptyState("Selecione uma importação.", "O lote escolhido será exibido aqui com seus problemas e linhas para revisão.")}
        </div>
      </div>
    </section>
  `;
}

function renderCsvImportDialog(accounts: AccountRecord[], activeProfileLabel: string): string {
  return `
    <dialog id="csv-import-dialog" class="master-dialog import-dialog" aria-labelledby="csv-import-dialog-title">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
        <p class="eyebrow">Novo extrato</p>
        <h2 id="csv-import-dialog-title">Importar CSV</h2>
      </div>
      <p class="profile-context"><strong>Perfil:</strong> ${escapeHtml(activeProfileLabel)}</p>
      <form id="csv-import-form" class="edit-grid">
        <label class="full-span">Arquivo CSV
          <input id="csv-import-file" name="file" type="file" accept=".csv,text/csv,text/plain" required />
        </label>
        <label>Conta
          <select id="csv-import-account" name="accountId" required>
            <option value="">Selecione</option>
            ${renderAccountOptions(accounts)}
          </select>
        </label>
        <label>Separador
          <select id="csv-import-delimiter" name="csvDelimiter">
            <option value="">Detectar automaticamente</option>
            <option value=",">Vírgula (,)</option>
            <option value=";">Ponto e vírgula (;)</option>
          </select>
        </label>
        <fieldset id="csv-mapping-fields" class="mapping-fields full-span" hidden>
          <legend>Mapeamento de colunas</legend>
          <div class="edit-grid">
            <label>Data<select name="mappingDate"></select></label>
            <label>Descrição<select name="mappingDescription"></select></label>
            <label>Valor<select name="mappingAmount"></select></label>
            <label>Tipo<select name="mappingKind"></select></label>
            <label>ID externo<select name="mappingExternalId"></select></label>
          </div>
        </fieldset>
        <label class="consent-check full-span">
          <input id="csv-import-consent" name="consentAccepted" type="checkbox" value="true" required />
          Confirmo que tenho direito de usar estes dados, autorizo o processamento no perfil informado e sei que cada linha será revisada antes de criar lançamentos.
        </label>
        <div class="dialog-actions full-span">
          <button type="button" class="secondary-button" id="preview-csv-import">Pré-visualizar</button>
          <button type="submit" id="create-csv-import" disabled>Iniciar revisão</button>
        </div>
      </form>
      <div id="csv-preview-result" class="csv-preview-result" aria-live="polite"></div>
      <p id="csv-import-status" class="form-status muted" role="status" aria-live="polite"></p>
      <p class="muted small-note">O arquivo bruto é usado apenas para gerar o preview e as linhas estruturadas; seu conteúdo não fica disponível no histórico.</p>
    </dialog>
  `;
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
          <select name="accountId"><option value="">Revisar depois</option>${renderAccountOptions(accounts)}</select>
        </label>
        <label>Categoria
          <select name="categoryId"><option value="">Sem categoria</option>${renderCategoryOptions(categories)}</select>
        </label>
        <label class="consent-check full-span">
          <input name="consentAccepted" type="checkbox" value="true" required />
          Confirmo que tenho autorização para processar esta mensagem neste perfil financeiro.
        </label>
        <button type="submit" title="Enviar mensagem para revisão">${icon("send", 14)} Enviar para revisão</button>
      </form>
      <p class="muted small-note">O texto bruto é descartado após a normalização.</p>
    </dialog>
  `;
}

function renderCsvLineEditDialog(): string {
  return `
    <dialog id="csv-line-edit-dialog" class="master-dialog line-edit-dialog" aria-labelledby="csv-line-edit-title">
      <div class="dialog-heading">
        <p class="eyebrow">Revisão da importação</p>
        <h2 id="csv-line-edit-title">Corrigir linha</h2>
      </div>
      <form id="csv-line-edit-form" class="edit-grid">
        <label>Data<input name="occurredOn" type="date" required /></label>
        <label>Tipo<select name="kind"><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
        <label>Valor<input name="amount" inputmode="decimal" required /></label>
        <label class="description-field">Descrição<input name="description" required /></label>
        <label>Conta<select name="accountId" required></select></label>
        <label>Categoria<select name="categoryId"></select></label>
        <p id="csv-line-edit-status" class="form-status muted full-span" role="status" aria-live="polite"></p>
        <div class="dialog-actions full-span">
          <button type="button" class="secondary-button" id="cancel-csv-line-edit">Cancelar</button>
          <button type="submit" id="save-csv-line-edit">Salvar correção</button>
        </div>
      </form>
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
      <div class="maintenance-summary"><div>
        <strong>${escapeHtml(formatSuggestionKind(item.kind))}</strong>
        <span>${escapeHtml(formatDateTime(item.createdAt))} - origem ${escapeHtml(formatOrigin(item.origin))} - confiança ${escapeHtml(confidence)}</span>
      </div></div>
      <div class="message-preview"><p><strong>${escapeHtml(item.maskedSummary)}</strong></p><p>${escapeHtml(item.explanation)}</p></div>
      <div class="maintenance-actions" aria-label="Ações da sugestão ${escapeHtml(item.id)}">
        <button type="button" class="secondary-button" data-api-action data-api-method="POST" data-api-path="${escapeHtml(reviewApiBase)}/${escapeHtml(item.id)}/approve" data-api-confirm="Aprovar esta sugestão?">${icon("check", 13)} Aprovar</button>
        <button type="button" class="secondary-button danger-action" data-api-action data-api-method="POST" data-api-path="${escapeHtml(reviewApiBase)}/${escapeHtml(item.id)}/reject" data-api-confirm="Rejeitar esta sugestão?">${icon("x", 13)} Rejeitar</button>
      </div>
    </article>
  `;
}

function renderInboxRow(item: BankMessageInboxRecord): string {
  const confidence = item.suggestion ? `${Math.round(item.suggestion.confidence * 100)}%` : "-";
  return `
    <article class="maintenance-item">
      <div class="maintenance-summary"><div>
        <strong>${escapeHtml(formatInboxStatus(item.status))}</strong>
        <span>${escapeHtml(formatDateTime(item.receivedAt))} - origem ${escapeHtml(formatOrigin(item.origin))} - confiança ${escapeHtml(confidence)}</span>
      </div></div>
      <div class="message-preview"><p>${escapeHtml(item.maskedText)}</p></div>
      <div class="maintenance-actions" aria-label="Ações da mensagem recebida">
        ${item.suggestion ? `<span class="muted small-note">Sugestão disponível na fila acima.</span>` : ""}
        ${item.status === "pending_review" ? renderActionButton("Descartar mensagem", `/api/bank-message-inbox/${item.id}/discard`, "Descartar esta mensagem da inbox?") : ""}
      </div>
    </article>
  `;
}

function csvImportScript(
  accounts: AccountRecord[],
  categories: CategoryRecord[],
  activeProfileLabel: string,
): string {
  const accountJson = JSON.stringify(accounts).replace(/</g, "\\u003c");
  const categoryJson = JSON.stringify(categories).replace(/</g, "\\u003c");
  const profileJson = JSON.stringify(activeProfileLabel).replace(/</g, "\\u003c");
  const statementUrlBuilder = buildImportStatementUrl.toString();
  return `
    <script>
      (() => {
        const accounts = ${accountJson};
        const categories = ${categoryJson};
        const activeProfileLabel = ${profileJson};
        const buildImportStatementUrl = ${statementUrlBuilder};
        const accountById = new Map(accounts.map((account) => [account.id, account]));
        const categoryById = new Map(categories.map((category) => [category.id, category]));
        const batchList = document.getElementById("import-batch-list");
        const detail = document.getElementById("import-batch-detail");
        const workspaceStatus = document.getElementById("import-workspace-status");
        const batchFilter = document.getElementById("import-status-filter");
        const lineFilter = document.getElementById("import-line-filter");
        const form = document.getElementById("csv-import-form");
        const previewStatus = document.getElementById("csv-import-status");
        const previewResult = document.getElementById("csv-preview-result");
        const mappingFields = document.getElementById("csv-mapping-fields");
        const createButton = document.getElementById("create-csv-import");
        const lineEditDialog = document.getElementById("csv-line-edit-dialog");
        const lineEditForm = document.getElementById("csv-line-edit-form");
        const lineEditStatus = document.getElementById("csv-line-edit-status");
        const MAX_CSV_BYTES = 5 * 1024 * 1024;
        const state = {
          batches: [],
          detail: null,
          preview: null,
          fileName: "",
          selected: new Set(),
          requestInFlight: false,
          editingSuggestionId: null,
          lineEditTrigger: null
        };

        function escapeHtml(value) {
          return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }
        function formatMoney(minor, currency) {
          return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format((Number(minor) || 0) / 100);
        }
        function formatDate(value) {
          if (!value) return "—";
          const date = new Date(String(value).slice(0, 10) + "T12:00:00Z");
          return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
        }
        function formatStatus(status) {
          const labels = { reviewing: "Em revisão", completed: "Concluído", failed: "Com falha", discarded: "Descartado", pending_review: "Pendente", approved: "Aprovada", rejected: "Rejeitada", expired: "Expirada" };
          return labels[status] || status;
        }
        function setStatus(element, message, kind) {
          if (!element) return;
          element.textContent = message;
          element.className = "form-status " + (kind || "muted");
        }
        function updateUrl(importBatchId) {
          const url = new URL(window.location.href);
          if (importBatchId) url.searchParams.set("importBatchId", importBatchId);
          else url.searchParams.delete("importBatchId");
          window.history.replaceState({}, "", url.pathname + url.search + url.hash);
        }
        function initialBatchId() {
          return new URL(window.location.href).searchParams.get("importBatchId");
        }
        async function api(path, options) {
          const controller = new AbortController();
          const timeout = window.setTimeout(() => controller.abort(), 15000);
          try {
            const response = await fetch(path, { ...(options || {}), signal: controller.signal });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
              const error = new Error((body.error && body.error.message) || "Não foi possível concluir a ação.");
              error.code = body.error && body.error.code;
              error.details = body.details;
              throw error;
            }
            return body;
          } catch (error) {
            if (error && error.name === "AbortError") throw new Error("A solicitação demorou demais. O estado será atualizado antes de permitir nova tentativa.");
            throw error;
          } finally {
            window.clearTimeout(timeout);
          }
        }
        function batchMatches(batch) {
          return batchFilter.value === "all" || batch.status === batchFilter.value;
        }
        function renderBatchList() {
          const visible = state.batches.filter(batchMatches);
          batchList.innerHTML = visible.length ? visible.map((batch) => {
            const selected = state.detail && state.detail.importBatch.id === batch.id ? " selected" : "";
            return '<button type="button" class="batch-item' + selected + '" data-batch-id="' + escapeHtml(batch.id) + '">' +
              '<strong>' + escapeHtml(batch.originalFileName || "Importação CSV") + '</strong>' +
              '<span>' + escapeHtml(formatStatus(batch.status)) + ' · ' + escapeHtml(String(batch.validRows || 0)) + ' linha(s) válidas</span>' +
              '<span>Recebido em ' + formatDate(batch.receivedAt) + '</span></button>';
          }).join("") : '<div class="empty-state"><strong>Nenhuma importação neste filtro.</strong><p class="muted">Altere o status ou importe um novo extrato.</p></div>';
          batchList.querySelectorAll("[data-batch-id]").forEach((button) => button.addEventListener("click", () => loadDetail(button.dataset.batchId, true)));
        }
        async function loadBatches(preferredId) {
          setStatus(workspaceStatus, "Carregando importações...", "muted");
          try {
            const result = await api("/api/import-batches?sourceKind=csv&status=all");
            state.batches = result.importBatches || [];
            renderBatchList();
            const requestedId = preferredId || initialBatchId();
            const targetId = requestedId && state.batches.some((batch) => batch.id === requestedId) ? requestedId : undefined;
            if (targetId) await loadDetail(targetId, false);
            else if (requestedId) {
              updateUrl(undefined);
              setStatus(workspaceStatus, "A importação informada não está disponível neste perfil.", "warning");
            } else setStatus(workspaceStatus, state.batches.length ? "Selecione uma importação para revisar." : "Nenhuma importação encontrada.", "muted");
          } catch (error) { setStatus(workspaceStatus, error.message, "error"); }
        }
        function pendingCandidates(item) {
          return (item.candidates || []).filter((candidate) => candidate.status === "pending_review");
        }
        function approvedCandidate(item, kind) {
          return (item.candidates || []).find((candidate) => candidate.kind === kind && candidate.status === "approved");
        }
        function rowState(item, batch) {
          if (approvedCandidate(item, "deduplication")) return "duplicate_ignored";
          if (approvedCandidate(item, "reconciliation") || (item.transaction && item.transaction.status === "reconciled")) return "reconciled";
          if (item.status === "approved" && item.transaction) return "approved_created";
          if (item.status === "rejected") return "rejected";
          if (item.status === "pending_review" && pendingCandidates(item).length) return "candidate_pending";
          const payload = item.payload || {};
          const account = accountById.get(payload.accountId);
          const category = payload.categoryId ? categoryById.get(payload.categoryId) : undefined;
          const referencesValid = account && account.status === "active" && (!payload.currency || account.currency === payload.currency) && (!category || (category.status === "active" && category.kind === payload.kind));
          if (batch.status === "reviewing" && item.status === "pending_review" && referencesValid && Number.isInteger(payload.amountMinor) && payload.amountMinor > 0 && payload.description && payload.occurredOn) return "eligible";
          return "pending_invalid";
        }
        function stateLabel(value) {
          const labels = { eligible: "Elegível", candidate_pending: "Decisão pendente", approved_created: "Lançamento criado", reconciled: "Conciliada com lançamento existente", duplicate_ignored: "Ignorada como duplicada", rejected: "Rejeitada", pending_invalid: "Precisa de correção" };
          return labels[value] || value;
        }
        function visibleSuggestions(detailValue) {
          if (lineFilter.value === "problems") return [];
          return detailValue.suggestions.filter((item) => lineFilter.value === "all" || rowState(item, detailValue.importBatch) === lineFilter.value);
        }
        function renderProblems(problems, expanded) {
          if (!problems || !problems.length) return "";
          return '<details class="problem-list" ' + (expanded ? "open" : "") + '><summary>' + escapeHtml(String(problems.length)) + ' problema(s) no arquivo</summary>' + problems.map((problem) =>
            '<p data-problem-row="' + escapeHtml(problem.rowNumber) + '"><strong>Linha ' + escapeHtml(problem.rowNumber) + ' · ' + escapeHtml(problem.code) + ':</strong> ' + escapeHtml(problem.message) + '</p>'
          ).join("") + '<p class="muted"><strong>Corrija o arquivo e faça uma nova importação.</strong></p></details>';
        }
        function accountName(id) { return accountById.get(id)?.name || "Conta não disponível"; }
        function categoryOptions(payload) {
          return '<option value="">Sem categoria</option>' + categories.filter((category) => category.status === "active" && category.kind === payload.kind).map((category) =>
            '<option value="' + escapeHtml(category.id) + '" ' + (payload.categoryId === category.id ? "selected" : "") + '>' + escapeHtml(category.name) + '</option>'
          ).join("");
        }
        function accountOptions(payload) {
          return accounts.filter((account) => account.status === "active" && (!payload.currency || account.currency === payload.currency)).map((account) =>
            '<option value="' + escapeHtml(account.id) + '" ' + (payload.accountId === account.id ? "selected" : "") + '>' + escapeHtml(account.name) + '</option>'
          ).join("");
        }
        function renderCandidate(candidate, readOnly) {
          const actions = candidate.status === "pending_review" && !readOnly ? '<div class="inline-actions"><button type="button" data-candidate-action="approve" data-candidate-id="' + escapeHtml(candidate.id) + '">Confirmar</button><button type="button" class="secondary-button" data-candidate-action="reject" data-candidate-id="' + escapeHtml(candidate.id) + '">Ignorar candidato</button></div>' : '<span class="status-pill">' + escapeHtml(formatStatus(candidate.status)) + '</span>';
          return '<div class="candidate-card"><div><strong>' + escapeHtml(candidate.kind === "deduplication" ? "Possível duplicidade" : "Possível conciliação") + '</strong><p>' + escapeHtml(candidate.explanation) + '</p></div>' + actions + '</div>';
        }
        function renderRow(item, batch) {
          const payload = item.payload || {};
          const currentState = rowState(item, batch);
          const hasStructuredPayload = Boolean(item.payload);
          const readOnly =
            batch.status !== "reviewing" ||
            item.status !== "pending_review" ||
            !hasStructuredPayload;
          const selectable = currentState === "eligible";
          const checked = state.selected.has(item.id) ? " checked" : "";
          const lineActions = readOnly ? "" : '<div class="inline-actions"><button type="button" class="secondary-button" data-line-action="edit">Corrigir linha</button><button type="button" data-line-action="approve" ' + (selectable ? "" : "disabled") + '>Confirmar linha</button><button type="button" class="secondary-button danger-action" data-line-action="reject">Rejeitar</button></div>';
          const legacyNotice = hasStructuredPayload ? "" : '<p class="warning" role="status">Esta linha legada não possui dados estruturados para revisão. Corrija o arquivo e faça uma nova importação.</p>';
          const transactionLink = item.transaction ? '<a class="button-link secondary-button" href="' + escapeHtml(buildImportStatementUrl(item)) + '">Ver no Extrato</a>' : "";
          return '<article class="import-row" data-suggestion-id="' + escapeHtml(item.id) + '" data-row-state="' + escapeHtml(currentState) + '">' +
            '<input type="checkbox" data-select-suggestion value="' + escapeHtml(item.id) + '" aria-label="Selecionar linha ' + escapeHtml(payload.sourceRowNumber || "sem dados estruturados") + '" ' + (selectable ? "" : "disabled") + checked + ' />' +
            '<div class="row-editor"><div class="row-heading"><strong>Linha ' + escapeHtml(payload.sourceRowNumber || "—") + '</strong><span class="status-pill">' + escapeHtml(stateLabel(currentState)) + '</span></div>' +
            '<dl class="row-summary"><div><dt>Data</dt><dd>' + formatDate(payload.occurredOn) + '</dd></div><div><dt>Tipo</dt><dd>' + escapeHtml(payload.kind === "income" ? "Receita" : "Despesa") + '</dd></div><div><dt>Valor</dt><dd>' + escapeHtml(formatMoney(payload.amountMinor, payload.currency)) + '</dd></div><div><dt>Descrição</dt><dd>' + escapeHtml(payload.description || "Dados legados indisponíveis") + '</dd></div><div><dt>Conta</dt><dd>' + escapeHtml(accountName(payload.accountId)) + '</dd></div></dl>' +
            legacyNotice + lineActions + transactionLink + '</div>' +
            ((item.candidates || []).length ? '<div class="candidate-list">' + item.candidates.map((candidate) => renderCandidate(candidate, batch.status !== "reviewing")).join("") + '</div>' : "") + '</article>';
        }
        function statementUrl(value) {
          const suggestion = value.suggestions.find((item) => item.transaction || item.payload?.occurredOn);
          return buildImportStatementUrl(suggestion, value.importBatch.defaultAccountId || "");
        }
        function detailSummary(value) {
          const suggestions = value.suggestions || [];
          const states = suggestions.map((item) => rowState(item, value.importBatch));
          return {
            valid: suggestions.filter((item) => Boolean(item.payload)).length,
            pending: suggestions.filter((item) => item.status === "pending_review").length,
            blocked: states.filter((stateValue) => stateValue === "candidate_pending").length,
            approved: states.filter((stateValue) => stateValue === "approved_created").length,
            reconciled: states.filter((stateValue) => stateValue === "reconciled").length,
            duplicates: states.filter((stateValue) => stateValue === "duplicate_ignored").length,
            rejected: states.filter((stateValue) => stateValue === "rejected").length,
            transactions: suggestions.filter((item) => item.transaction).length,
            problems: (value.problems || []).length
          };
        }
        function renderDetail(value) {
          const batch = value.importBatch;
          const summary = detailSummary(value);
          const visible = visibleSuggestions(value);
          const readOnly = batch.status !== "reviewing";
          if (readOnly) state.selected.clear();
          const selectedEligible = value.suggestions.filter((item) => state.selected.has(item.id) && rowState(item, batch) === "eligible");
          const headerActions = readOnly ? (batch.status === "completed" ? '<a class="button-link" href="' + escapeHtml(statementUrl(value)) + '">Ver no Extrato</a>' : "") : '<button type="button" class="secondary-button" id="detect-import-duplicates">Verificar duplicidades</button><button type="button" class="secondary-button danger-action" id="discard-import">Descartar lote</button>';
          detail.innerHTML = '<div class="detail-heading" id="import-detail-heading" tabindex="-1"><div><p class="eyebrow">' + escapeHtml(activeProfileLabel) + '</p><h3>' + escapeHtml(batch.originalFileName || "Importação CSV") + '</h3><p class="muted">Conta: ' + escapeHtml(accountName(batch.defaultAccountId)) + ' · Recebido em ' + formatDate(batch.receivedAt) + '</p></div><div class="inline-actions"><span class="status-pill">' + escapeHtml(formatStatus(batch.status)) + '</span>' + headerActions + '</div></div>' +
            '<div class="import-summary" aria-label="Resumo do lote"><span>Válidas <strong>' + summary.valid + '</strong></span><span>Pendentes <strong>' + summary.pending + '</strong></span><span>Bloqueadas <strong>' + summary.blocked + '</strong></span><span>Aprovadas <strong>' + summary.approved + '</strong></span><span>Conciliadas <strong>' + summary.reconciled + '</strong></span><span>Ignoradas como duplicadas <strong>' + summary.duplicates + '</strong></span><span>Rejeitadas <strong>' + summary.rejected + '</strong></span><span>Lançamentos vinculados <strong>' + summary.transactions + '</strong></span><span>Problemas <strong>' + summary.problems + '</strong></span></div>' +
            renderProblems(value.problems || [], lineFilter.value === "problems") +
            (readOnly ? '<p class="readonly-notice">Este lote está finalizado e disponível somente para consulta.</p>' : '<div class="bulk-actions"><label><input type="checkbox" id="select-all-import-lines" /> Selecionar elegíveis</label><div><span id="selection-summary">' + selectedEligible.length + ' selecionada(s)</span> <button type="button" id="approve-selected-import-lines" ' + (selectedEligible.length ? "" : "disabled") + '>Confirmar selecionadas</button></div></div>') +
            '<p id="import-detail-status" class="form-status muted" role="status" aria-live="polite"></p>' +
            '<div class="import-rows">' + (lineFilter.value === "problems" ? (value.problems.length ? "" : '<div class="empty-state"><strong>Sem problemas no arquivo.</strong></div>') : (visible.map((item) => renderRow(item, batch)).join("") || '<div class="empty-state"><strong>Nenhuma linha neste filtro.</strong><p class="muted">Escolha outro filtro para consultar o lote.</p></div>')) + '</div>';
          wireDetailActions(batch.id);
          renderBatchList();
        }
        async function loadDetail(batchId, updateHistory) {
          setStatus(workspaceStatus, "Carregando detalhe...", "muted");
          try {
            const value = await api("/api/import-batches/" + encodeURIComponent(batchId));
            state.detail = value;
            state.selected = new Set([...state.selected].filter((id) => value.suggestions.some((item) => item.id === id && rowState(item, value.importBatch) === "eligible")));
            if (updateHistory) updateUrl(batchId);
            renderDetail(value);
            setStatus(workspaceStatus, "Detalhe atualizado.", "success");
            if (updateHistory || initialBatchId() === batchId) document.getElementById("import-detail-heading")?.focus();
          } catch (error) {
            state.detail = null;
            detail.innerHTML = '<div class="empty-state"><strong>Não foi possível abrir esta importação.</strong><p class="error" role="alert">' + escapeHtml(error.message) + '</p></div>';
            setStatus(workspaceStatus, error.message, "error");
          }
        }
        function readRowPayload(formElement) {
          const values = new FormData(formElement);
          const amountText = String(values.get("amount") || "").trim();
          const normalized = amountText.includes(",") ? amountText.replace(/\\./g, "").replace(",", ".") : amountText;
          const amount = Number(normalized);
          return {
            occurredOn: String(values.get("occurredOn") || ""),
            kind: String(values.get("kind") || "expense"),
            amountMinor: Math.round(amount * 100),
            description: String(values.get("description") || ""),
            accountId: String(values.get("accountId") || ""),
            categoryId: values.get("categoryId") ? String(values.get("categoryId")) : null
          };
        }
        function openLineEditDialog(item, trigger) {
          const payload = item.payload || {};
          state.editingSuggestionId = item.id;
          state.lineEditTrigger = trigger;
          lineEditForm.elements.occurredOn.value = payload.occurredOn || "";
          lineEditForm.elements.kind.value = payload.kind || "expense";
          lineEditForm.elements.amount.value = (Number(payload.amountMinor || 0) / 100).toFixed(2).replace(".", ",");
          lineEditForm.elements.description.value = payload.description || "";
          lineEditForm.elements.accountId.innerHTML = accountOptions(payload);
          lineEditForm.elements.accountId.value = payload.accountId || "";
          lineEditForm.elements.categoryId.innerHTML = categoryOptions(payload);
          lineEditForm.elements.categoryId.value = payload.categoryId || "";
          setStatus(lineEditStatus, "Revise os campos e salve para executar uma nova análise de duplicidade.", "muted");
          lineEditDialog.showModal();
          lineEditForm.elements.occurredOn.focus();
        }
        function closeLineEditDialog() {
          if (lineEditDialog.open) lineEditDialog.close();
        }
        function restoreLineEditFocus() {
          const trigger = state.lineEditTrigger;
          state.editingSuggestionId = null;
          state.lineEditTrigger = null;
          if (trigger?.isConnected) trigger.focus();
        }
        async function saveLineEditDialog(event) {
          event.preventDefault();
          if (state.requestInFlight || !state.detail || !state.editingSuggestionId) return;
          if (!lineEditForm.reportValidity()) return;
          const batchId = state.detail.importBatch.id;
          const suggestionId = state.editingSuggestionId;
          state.requestInFlight = true;
          lineEditForm.querySelector('button[type="submit"]').disabled = true;
          setStatus(lineEditStatus, "Salvando correção e analisando novamente...", "muted");
          try {
            await api("/api/import-batches/" + batchId + "/suggestions/" + suggestionId, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(readRowPayload(lineEditForm))
            });
            state.selected.delete(suggestionId);
            closeLineEditDialog();
            await loadDetail(batchId, false);
            setStatus(document.getElementById("import-detail-status"), "Correção salva e análise determinística atualizada.", "success");
          } catch (error) {
            setStatus(lineEditStatus, error.message, "error");
          } finally {
            state.requestInFlight = false;
            lineEditForm.querySelector('button[type="submit"]').disabled = false;
            refreshSelection();
          }
        }
        function selectedTotals() {
          if (!state.detail) return { count: 0, income: 0, expense: 0 };
          return state.detail.suggestions.reduce((totals, item) => {
            if (!state.selected.has(item.id) || rowState(item, state.detail.importBatch) !== "eligible") return totals;
            totals.count += 1;
            if (item.payload.kind === "income") totals.income += item.payload.amountMinor;
            else totals.expense += item.payload.amountMinor;
            return totals;
          }, { count: 0, income: 0, expense: 0 });
        }
        function refreshSelection() {
          if (!state.detail) return;
          const eligible = state.detail.suggestions.filter((item) => rowState(item, state.detail.importBatch) === "eligible");
          detail.querySelectorAll("[data-select-suggestion]").forEach((box) => { box.checked = state.selected.has(box.value); });
          const totals = selectedTotals();
          const button = document.getElementById("approve-selected-import-lines");
          if (button) button.disabled = totals.count === 0 || state.requestInFlight;
          const summary = document.getElementById("selection-summary");
          if (summary) summary.textContent = totals.count + " selecionada(s) · Receitas " + formatMoney(totals.income, "BRL") + " · Despesas " + formatMoney(totals.expense, "BRL");
          const selectAll = document.getElementById("select-all-import-lines");
          if (selectAll) {
            selectAll.checked = eligible.length > 0 && eligible.every((item) => state.selected.has(item.id));
            selectAll.indeterminate = eligible.some((item) => state.selected.has(item.id)) && !selectAll.checked;
          }
        }
        async function recoverAfterFailure(batchId, message) {
          await loadDetail(batchId, false);
          setStatus(document.getElementById("import-detail-status"), message + " O lote foi atualizado para evitar repetição indevida.", "error");
        }
        function wireDetailActions(batchId) {
          const detailStatus = document.getElementById("import-detail-status");
          detail.querySelectorAll("[data-select-suggestion]").forEach((box) => box.addEventListener("change", () => {
            if (box.checked) state.selected.add(box.value); else state.selected.delete(box.value);
            refreshSelection();
          }));
          const selectAll = document.getElementById("select-all-import-lines");
          if (selectAll) selectAll.addEventListener("change", () => {
            state.detail.suggestions.filter((item) => rowState(item, state.detail.importBatch) === "eligible").forEach((item) => selectAll.checked ? state.selected.add(item.id) : state.selected.delete(item.id));
            refreshSelection();
          });
          detail.querySelectorAll("[data-suggestion-id]").forEach((article) => {
            const suggestionId = article.dataset.suggestionId;
            const item = state.detail?.suggestions.find((candidate) => candidate.id === suggestionId);
            article.querySelectorAll("[data-line-action]").forEach((button) => button.addEventListener("click", async () => {
              if (state.requestInFlight || !item) return;
              const action = button.dataset.lineAction;
              if (action === "edit") {
                openLineEditDialog(item, button);
                return;
              }
              if (action === "reject" && !window.confirm("Rejeitar esta linha? Nenhum lançamento será criado.")) return;
              state.requestInFlight = true; button.disabled = true;
              setStatus(detailStatus, action === "approve" ? "Analisando e confirmando linha..." : "Rejeitando linha...", "muted");
              try {
                await api("/api/import-batches/" + batchId + "/suggestions/" + suggestionId + "/" + action, { method: "POST", headers: { "content-type": "application/json" } });
                state.selected.delete(suggestionId);
                await loadDetail(batchId, false);
              } catch (error) {
                const message = error.code === "IMPORT_REVIEW_CANDIDATE_PENDING" ? "A linha possui possível duplicidade ou conciliação. Resolva os candidatos antes de criar um novo lançamento." : error.message;
                await recoverAfterFailure(batchId, message);
              } finally { state.requestInFlight = false; refreshSelection(); }
            }));
          });
          detail.querySelectorAll("[data-candidate-action]").forEach((button) => button.addEventListener("click", async () => {
            if (state.requestInFlight) return;
            const action = button.dataset.candidateAction;
            const question = action === "approve" ? "Aplicar esta decisão ao lançamento existente?" : "Ignorar este candidato e manter a linha para revisão?";
            if (!window.confirm(question)) return;
            state.requestInFlight = true; button.disabled = true;
            setStatus(detailStatus, "Registrando decisão...", "muted");
            try {
              await api("/api/review-suggestions/" + button.dataset.candidateId + "/" + action, { method: "POST", headers: { "content-type": "application/json" } });
              await loadDetail(batchId, false);
            } catch (error) { await recoverAfterFailure(batchId, error.message); }
            finally { state.requestInFlight = false; refreshSelection(); }
          }));
          const selectedButton = document.getElementById("approve-selected-import-lines");
          if (selectedButton) selectedButton.addEventListener("click", async () => {
            if (state.requestInFlight) return;
            const totals = selectedTotals();
            if (!totals.count) return;
            const confirmation = "Confirmar " + totals.count + " linha(s)?\\nReceitas: " + formatMoney(totals.income, "BRL") + "\\nDespesas: " + formatMoney(totals.expense, "BRL") + "\\nCada linha será validada e processada separadamente.";
            if (!window.confirm(confirmation)) return;
            state.requestInFlight = true; selectedButton.disabled = true;
            setStatus(detailStatus, "Confirmando linhas selecionadas...", "muted");
            try {
              const result = await api("/api/import-batches/" + batchId + "/approve-selected", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ suggestionIds: [...state.selected] }) });
              state.selected.clear();
              await loadDetail(batchId, false);
              const summary = result.summary || {};
              setStatus(document.getElementById("import-detail-status"), (summary.approved || 0) + " linha(s) confirmada(s); " + (summary.failed || 0) + " precisam de revisão.", summary.failed ? "warning" : "success");
            } catch (error) { await recoverAfterFailure(batchId, error.message); }
            finally { state.requestInFlight = false; refreshSelection(); }
          });
          const detect = document.getElementById("detect-import-duplicates");
          if (detect) detect.addEventListener("click", async () => {
            if (state.requestInFlight) return;
            state.requestInFlight = true; detect.disabled = true;
            setStatus(detailStatus, "Buscando duplicidades e conciliações...", "muted");
            try { await api("/api/import-batches/" + batchId + "/detect-duplicates", { method: "POST", headers: { "content-type": "application/json" } }); await loadDetail(batchId, false); }
            catch (error) { await recoverAfterFailure(batchId, error.message); }
            finally { state.requestInFlight = false; }
          });
          const discard = document.getElementById("discard-import");
          if (discard) discard.addEventListener("click", async () => {
            if (state.requestInFlight || !window.confirm("Descartar este lote? Linhas pendentes serão encerradas e o histórico será mantido.")) return;
            state.requestInFlight = true; discard.disabled = true;
            try { await api("/api/import-batches/" + batchId + "/discard", { method: "POST", headers: { "content-type": "application/json" } }); state.selected.clear(); await loadBatches(batchId); }
            catch (error) { await recoverAfterFailure(batchId, error.message); }
            finally { state.requestInFlight = false; }
          });
          refreshSelection();
        }
        function currentMapping() {
          const mapping = {};
          [["date", "mappingDate"], ["description", "mappingDescription"], ["amount", "mappingAmount"], ["kind", "mappingKind"], ["externalId", "mappingExternalId"]].forEach(([key, name]) => {
            const value = form.elements[name] && form.elements[name].value;
            if (value) mapping[key] = value;
          });
          return mapping;
        }
        function fillMapping(headers, mapping) {
          mappingFields.hidden = false;
          ["mappingDate", "mappingDescription", "mappingAmount", "mappingKind", "mappingExternalId"].forEach((name) => {
            const select = form.elements[name];
            select.innerHTML = '<option value="">Não mapear</option>' + headers.map((header) => '<option value="' + escapeHtml(header) + '">' + escapeHtml(header) + '</option>').join("");
          });
          const byField = { date: "mappingDate", description: "mappingDescription", amount: "mappingAmount", kind: "mappingKind", externalId: "mappingExternalId" };
          Object.keys(byField).forEach((field) => { if (mapping && mapping[field]) form.elements[byField[field]].value = mapping[field]; });
        }
        function renderPreview(preview) {
          const csv = preview.csv || {};
          if (csv.headers && csv.headers.length) fillMapping(csv.headers, csv.mapping || {});
          const problems = preview.problems || [];
          const sampleRows = csv.sampleRows || [];
          const sampleHeader = '<thead><tr><th>Linha</th><th>Data</th><th>Descrição</th><th>Tipo</th><th>Valor</th></tr></thead>';
          const sampleBody = sampleRows.map((row) => '<tr><td>' + escapeHtml(row.sourceRowNumber) + '</td><td>' + formatDate(row.occurredOn) + '</td><td>' + escapeHtml(row.description) + '</td><td>' + escapeHtml(row.kind === "income" ? "Receita" : "Despesa") + '</td><td>' + escapeHtml(formatMoney(row.amountMinor, row.currency)) + '</td></tr>').join("");
          previewResult.innerHTML = '<div class="preview-summary"><strong>' + escapeHtml(formatStatus(preview.state)) + '</strong><span>' + escapeHtml(String(preview.batch.validRows || 0)) + ' válidas · ' + escapeHtml(String(preview.batch.problemRows || 0)) + ' com problema</span></div>' +
            (sampleRows.length ? '<div class="preview-table-wrap"><table>' + sampleHeader + '<tbody>' + sampleBody + '</tbody></table></div>' : "") + renderProblems(problems, true);
          createButton.disabled = preview.state !== "ready" || !form.elements.accountId.value || !form.elements.consentAccepted.checked;
        }
        async function readSelectedFile() {
          const file = document.getElementById("csv-import-file").files[0];
          if (!file) throw new Error("Selecione um arquivo CSV.");
          if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Selecione um arquivo com extensão .csv.");
          if (file.size === 0) throw new Error("O arquivo está vazio.");
          if (file.size > MAX_CSV_BYTES) throw new Error("O arquivo excede o limite de 5 MB.");
          return { content: await file.text(), fileName: file.name };
        }
        async function previewCsv() {
          if (state.requestInFlight) return;
          if (!form.elements.accountId.value) { setStatus(previewStatus, "Selecione uma conta ativa.", "error"); return; }
          if (!form.elements.consentAccepted.checked) { setStatus(previewStatus, "Confirme a autorização e a ciência da revisão antes do processamento.", "error"); return; }
          state.requestInFlight = true; createButton.disabled = true;
          setStatus(previewStatus, "Lendo e validando o arquivo...", "muted");
          let fileData;
          try {
            fileData = await readSelectedFile();
            state.fileName = fileData.fileName;
            state.preview = await api("/api/import-batches/csv/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ originalFileName: fileData.fileName, content: fileData.content, accountId: form.elements.accountId.value, consentAccepted: true, csvDelimiter: form.elements.csvDelimiter.value || undefined, csvMapping: currentMapping() }) });
            renderPreview(state.preview);
            setStatus(previewStatus, state.preview.state === "ready" ? "Preview pronto. Nenhum lançamento foi criado." : "Ajuste o mapeamento ou o separador e visualize novamente.", state.preview.state === "ready" ? "success" : "warning");
          } catch (error) { state.preview = null; previewResult.innerHTML = ""; setStatus(previewStatus, error.message, "error"); }
          finally { if (fileData) fileData.content = ""; state.requestInFlight = false; }
        }
        document.getElementById("preview-csv-import").addEventListener("click", previewCsv);
        form.addEventListener("change", () => { state.preview = null; createButton.disabled = true; });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (state.requestInFlight) return;
          if (!state.preview || state.preview.state !== "ready") { await previewCsv(); return; }
          state.requestInFlight = true; createButton.disabled = true;
          setStatus(previewStatus, "Criando lote para revisão...", "muted");
          let fileData;
          try {
            fileData = await readSelectedFile();
            const result = await api("/api/import-batches/csv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ originalFileName: fileData.fileName, content: fileData.content, accountId: form.elements.accountId.value, consentAccepted: true, csvDelimiter: form.elements.csvDelimiter.value || undefined, csvMapping: currentMapping() }) });
            document.getElementById("csv-import-dialog").close();
            form.reset(); state.preview = null; state.fileName = ""; previewResult.innerHTML = ""; mappingFields.hidden = true;
            await loadBatches(result.importBatch.id);
            updateUrl(result.importBatch.id);
            setStatus(workspaceStatus, result.duplicateBatch ? "Este arquivo já existia. O lote original e sua conta foram abertos." : "Lote criado. Revise as linhas antes de confirmar.", "success");
          } catch (error) { setStatus(previewStatus, error.message, "error"); createButton.disabled = false; }
          finally { if (fileData) fileData.content = ""; state.requestInFlight = false; }
        });
        lineEditForm.addEventListener("submit", saveLineEditDialog);
        document.getElementById("cancel-csv-line-edit").addEventListener("click", closeLineEditDialog);
        lineEditForm.elements.kind.addEventListener("change", () => {
          const current = state.detail?.suggestions.find((item) => item.id === state.editingSuggestionId);
          const payload = { ...(current?.payload || {}), kind: lineEditForm.elements.kind.value, categoryId: lineEditForm.elements.categoryId.value || undefined };
          lineEditForm.elements.categoryId.innerHTML = categoryOptions(payload);
          if (payload.categoryId) lineEditForm.elements.categoryId.value = payload.categoryId;
        });
        lineEditDialog.addEventListener("close", restoreLineEditFocus);
        batchFilter.addEventListener("change", renderBatchList);
        lineFilter.addEventListener("change", () => { if (state.detail) renderDetail(state.detail); });
        document.getElementById("refresh-imports").addEventListener("click", () => loadBatches(state.detail?.importBatch.id));
        loadBatches();
      })();
    </script>
  `;
}

function apiFormScript(): string {
  return `
    <script>
      (() => {
        function ensureStatus(container) {
          let status = container.querySelector(":scope > [data-form-status]");
          if (!status) {
            status = document.createElement("p"); status.className = "form-status muted";
            status.setAttribute("data-form-status", ""); status.setAttribute("aria-live", "polite"); container.appendChild(status);
          }
          return status;
        }
        function buildPayload(form) {
          const payload = {}; new FormData(form).forEach((value, key) => { if (value !== "") payload[key] = value; }); return payload;
        }
        async function readApiMessage(response) {
          const body = await response.json().catch(() => ({}));
          return response.ok ? "Ação concluída. Atualizando a tela..." : ((body.error && body.error.message) || "Não foi possível concluir a ação.");
        }
        document.querySelectorAll("[data-api-form]").forEach((form) => {
          const status = ensureStatus(form);
          form.addEventListener("submit", async (event) => {
            event.preventDefault(); const submitButton = form.querySelector('button[type="submit"]'); if (submitButton) submitButton.disabled = true;
            status.className = "form-status muted"; status.textContent = "Salvando...";
            const response = await fetch(form.dataset.apiPath, { method: form.dataset.apiMethod || "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(buildPayload(form)) });
            status.className = response.ok ? "form-status success" : "form-status error"; status.textContent = await readApiMessage(response);
            if (response.ok) { window.setTimeout(() => window.location.reload(), 450); return; } if (submitButton) submitButton.disabled = false;
          });
        });
        document.querySelectorAll("[data-api-action]").forEach((button) => {
          const status = ensureStatus(button.closest(".maintenance-actions") || button.parentElement);
          button.addEventListener("click", async () => {
            const confirmation = button.dataset.apiConfirm; if (confirmation && !window.confirm(confirmation)) return;
            button.disabled = true; status.className = "form-status muted"; status.textContent = "Enviando...";
            const response = await fetch(button.dataset.apiPath, { method: button.dataset.apiMethod || "POST", headers: { "content-type": "application/json" } });
            status.className = response.ok ? "form-status success" : "form-status error"; status.textContent = await readApiMessage(response);
            if (response.ok) { window.setTimeout(() => window.location.reload(), 450); return; } button.disabled = false;
          });
        });
      })();
    </script>
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
  return `<section class="panel placeholder-state"><p class="eyebrow">Erro ao carregar dados</p><h1>Inbox</h1><p class="error" role="alert">${escapeHtml(error)}</p><a class="button-link" href="/inbox">Tentar novamente</a></section>`;
}

function renderActionButton(label: string, path: string, confirmation: string): string {
  return `<button type="button" class="secondary-button danger-action" data-api-action data-api-method="POST" data-api-path="${escapeHtml(path)}" data-api-confirm="${escapeHtml(confirmation)}">${icon("trash-2", 13)} ${escapeHtml(label)}</button>`;
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
    textarea, input[type="file"] { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); color: var(--text); font: inherit; font-size: 0.875rem; line-height: 1.5; padding: 8px 10px; width: 100%; }
    textarea { min-height: 36px; resize: vertical; }
    main { display: grid; gap: 14px; margin: 0 auto; max-width: 1500px; padding: 18px 20px; width: 100%; }
    .page-heading, .section-heading, .detail-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
    .page-heading > div:first-child { display: grid; gap: 4px; max-width: 760px; }
    .heading-actions, .inline-actions, .dialog-actions, .compact-filters, .bulk-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; }
    .section-heading > span, .status-pill { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: 0.6875rem; font-weight: 700; padding: 2px 7px; white-space: nowrap; }
    .rows, .maintenance-item, .maintenance-actions, .import-rows, .candidate-list { display: grid; gap: 10px; }
    .maintenance-item { border-top: 1px solid var(--line); padding-top: 10px; } .maintenance-item:first-child { border-top: 0; padding-top: 0; }
    .maintenance-summary > div { display: grid; gap: 3px; } .maintenance-summary span, .row-summary { color: var(--muted); font-size: 0.8125rem; line-height: 1.4; }
    .maintenance-actions, .message-preview { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: var(--radius); padding: 10px; }
    .message-preview p { color: var(--muted); font-size: 0.8125rem; line-height: 1.5; overflow-wrap: anywhere; }
    .full-span { grid-column: 1 / -1; }
    .consent-check { align-items: start; display: grid; font-size: 0.875rem; font-weight: 600; grid-template-columns: auto minmax(0, 1fr); } .consent-check input { height: 16px; min-height: 16px; margin-top: 3px; width: 16px; }
    .import-heading > div:first-child { display: grid; gap: 3px; }
    .compact-filters label { align-items: center; display: flex; font-size: 0.75rem; gap: 6px; }
    .compact-filters select { min-width: 140px; }
    .line-filter-bar { align-items: center; display: flex; justify-content: flex-end; margin-bottom: 8px; }
    .line-filter-bar label { align-items: center; display: flex; font-size: 0.75rem; gap: 6px; }
    .line-filter-bar select { min-width: min(360px, 75vw); }
    .profile-context, .readonly-notice { background: var(--surface-soft); border: 1px solid var(--line); border-radius: var(--radius); font-size: 0.8125rem; padding: 8px 10px; }
    .import-summary { display: grid; gap: 7px; grid-template-columns: repeat(5, minmax(105px, 1fr)); margin-bottom: 10px; }
    .import-summary span { background: var(--surface-soft); border: 1px solid var(--line); border-radius: var(--radius); font-size: 0.75rem; padding: 7px 8px; }
    .import-layout { display: grid; gap: 14px; grid-template-columns: minmax(220px, 0.28fr) minmax(0, 1fr); }
    .import-batch-list { align-content: start; display: grid; gap: 7px; max-height: 760px; overflow: auto; }
    .batch-item { align-items: start; background: var(--surface); border: 1px solid var(--line); color: var(--text); display: grid; gap: 3px; justify-items: start; min-height: 54px; padding: 9px 10px; text-align: left; width: 100%; }
    .batch-item span { color: var(--muted); font-size: 0.75rem; } .batch-item.selected { background: var(--primary-soft); border-color: var(--primary); }
    .import-detail { min-width: 0; }
    .detail-heading { align-items: flex-start; border-bottom: 1px solid var(--line); margin-bottom: 10px; padding-bottom: 10px; }
    .detail-heading > div:first-child { display: grid; gap: 3px; }
    .problem-list { background: #fff9e8; border: 1px solid #ead69b; border-radius: var(--radius); margin-bottom: 10px; padding: 9px 10px; }
    .problem-list summary { cursor: pointer; font-weight: 700; } .problem-list p { font-size: 0.8125rem; margin-top: 6px; }
    .bulk-actions { background: var(--surface-soft); border: 1px solid var(--line); border-radius: var(--radius); justify-content: space-between; margin-bottom: 10px; padding: 8px 10px; }
    .import-row { align-items: start; border: 1px solid var(--line); border-radius: var(--radius); display: grid; gap: 9px; grid-template-columns: auto minmax(0, 1fr); padding: 10px; }
    .row-editor { display: grid; gap: 9px; min-width: 0; } .row-heading { align-items: center; display: flex; gap: 8px; justify-content: space-between; }
    .row-summary { display: grid; gap: 8px; grid-template-columns: repeat(5, minmax(100px, 1fr)); margin: 0; }
    .row-summary div { background: var(--surface-soft); border-radius: var(--radius); min-width: 0; padding: 7px 8px; }
    .row-summary dt { color: var(--muted); font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; }
    .row-summary dd { color: var(--text); font-size: 0.8125rem; margin: 2px 0 0; overflow-wrap: anywhere; }
    .line-edit-dialog { width: min(720px, calc(100vw - 24px)); }
    .row-fields { display: grid; gap: 8px; grid-template-columns: repeat(6, minmax(105px, 1fr)); }
    .row-fields label { font-size: 0.75rem; } .row-fields .description-field { grid-column: span 2; }
    .candidate-list { grid-column: 2; }
    .candidate-card { align-items: center; background: #f6fbfd; border: 1px solid #cfe3eb; border-radius: var(--radius); display: flex; gap: 10px; justify-content: space-between; padding: 8px 10px; }
    .candidate-card p { color: var(--muted); font-size: 0.75rem; margin-top: 3px; }
    .mapping-fields { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px; }
    .mapping-fields legend { font-size: 0.8125rem; font-weight: 700; padding: 0 5px; }
    .import-dialog { width: min(920px, calc(100vw - 24px)); }
    .csv-preview-result { display: grid; gap: 8px; margin-top: 10px; }
    .preview-summary { align-items: center; background: var(--surface-soft); border-radius: var(--radius); display: flex; gap: 10px; justify-content: space-between; padding: 8px 10px; }
    .preview-table-wrap { max-height: 230px; overflow: auto; } .preview-table-wrap table { border-collapse: collapse; font-size: 0.75rem; width: 100%; } .preview-table-wrap th, .preview-table-wrap td { border: 1px solid var(--line); padding: 6px; text-align: left; }
    .warning { color: #8a5a00; }
    @media (max-width: 1100px) { .row-fields { grid-template-columns: repeat(3, minmax(120px, 1fr)); } .row-summary { grid-template-columns: repeat(3, minmax(120px, 1fr)); } }
    @media (max-width: 800px) { .page-heading, .section-heading, .detail-heading { align-items: stretch; display: grid; } .import-summary { grid-template-columns: repeat(2, minmax(120px, 1fr)); } .import-layout { grid-template-columns: 1fr; } .import-batch-list { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); max-height: none; } .row-fields { grid-template-columns: 1fr 1fr; } .row-summary { grid-template-columns: 1fr 1fr; } .row-fields .description-field { grid-column: 1 / -1; } .candidate-card { align-items: stretch; display: grid; } }
    @media (max-width: 520px) { .import-summary, .row-fields, .row-summary { grid-template-columns: 1fr; } .line-filter-bar { justify-content: stretch; } .line-filter-bar label { min-width: 0; width: 100%; } .line-filter-bar select { min-width: 0; width: 100%; } .row-fields .description-field { grid-column: auto; } .import-row { grid-template-columns: 1fr; } .candidate-list { grid-column: 1; } }
  `;
}
