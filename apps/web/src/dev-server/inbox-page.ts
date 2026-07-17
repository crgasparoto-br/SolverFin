import { formatDateOnly } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { icon } from "./icons.js";
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
    ${renderCsvImportDialog(accountOptions)}
    ${renderNewMessageDialog(accountOptions, categoryOptions)}
    ${csvImportScript(accountOptions, categoryOptions)}
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

function renderCsvImportDialog(accounts: AccountRecord[]): string {
  return `
    <dialog id="csv-import-dialog" class="master-dialog import-dialog" aria-labelledby="csv-import-dialog-title">
      <form method="dialog" class="dialog-close-form"><button type="submit" class="secondary-button">Fechar</button></form>
      <div class="dialog-heading">
        <p class="eyebrow">Novo extrato</p>
        <h2 id="csv-import-dialog-title">Importar CSV</h2>
      </div>
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
          Confirmo que tenho autorização para processar este arquivo neste perfil financeiro.
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

function csvImportScript(accounts: AccountRecord[], categories: CategoryRecord[]): string {
  const accountData = JSON.stringify(accounts.map(({ id, name }) => ({ id, name }))).replace(
    /</g,
    "\\u003c",
  );
  const categoryData = JSON.stringify(
    categories.map(({ id, name, kind }) => ({ id, name, kind })),
  ).replace(/</g, "\\u003c");

  return `
    <script>
      (() => {
        const accounts = ${accountData};
        const categories = ${categoryData};
        const state = { batches: [], detail: null, preview: null, fileContent: "", fileName: "" };
        const status = document.getElementById("import-workspace-status");
        const list = document.getElementById("import-batch-list");
        const detail = document.getElementById("import-batch-detail");
        const filter = document.getElementById("import-status-filter");
        const form = document.getElementById("csv-import-form");
        const previewStatus = document.getElementById("csv-import-status");
        const previewResult = document.getElementById("csv-preview-result");
        const mappingFields = document.getElementById("csv-mapping-fields");
        const createButton = document.getElementById("create-csv-import");

        const escapeHtml = (value) => String(value ?? "")
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        const formatMoney = (minor, currency) => new Intl.NumberFormat("pt-BR", {
          style: "currency", currency: currency || "BRL"
        }).format(Number(minor || 0) / 100);
        const formatStatus = (value) => ({
          reviewing: "Em revisão", completed: "Concluído", discarded: "Descartado",
          failed: "Com falha", received: "Recebido", parsed: "Processado",
          pending_review: "Pendente", approved: "Aprovada", rejected: "Rejeitada",
          edited: "Editada", expired: "Expirada"
        })[value] || value;
        const api = async (path, options) => {
          const response = await fetch(path, options);
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error((body.error && body.error.message) || "Não foi possível concluir a ação.");
          return body;
        };
        const setStatus = (element, message, kind) => {
          element.className = "form-status " + (kind || "muted");
          element.textContent = message;
        };
        const options = (items, selected, emptyLabel) => {
          const first = emptyLabel === undefined ? "" : '<option value="">' + escapeHtml(emptyLabel) + '</option>';
          return first + items.map((item) => '<option value="' + escapeHtml(item.id) + '"' +
            (item.id === selected ? " selected" : "") + '>' + escapeHtml(item.name) + '</option>').join("");
        };

        async function loadBatches(selectId) {
          setStatus(status, "Carregando importações...", "muted");
          try {
            const data = await api("/api/import-batches?sourceKind=csv&status=all");
            state.batches = data.importBatches || [];
            renderBatchList();
            setStatus(status, state.batches.length + " importação(ões) encontrada(s).", "success");
            const selected = selectId || (state.detail && state.detail.importBatch.id);
            if (selected) await loadDetail(selected);
          } catch (error) {
            setStatus(status, error.message, "error");
          }
        }

        function renderBatchList() {
          const statusFilter = filter.value;
          const visible = state.batches.filter((batch) => statusFilter === "all" || batch.status === statusFilter);
          if (visible.length === 0) {
            list.innerHTML = '<div class="empty-state"><strong>Nenhuma importação.</strong><p class="muted">Use “Importar extrato” para começar.</p></div>';
            return;
          }
          list.innerHTML = visible.map((batch) => {
            const selected = state.detail && state.detail.importBatch.id === batch.id;
            return '<button type="button" class="batch-item' + (selected ? " selected" : "") + '" data-batch-id="' +
              escapeHtml(batch.id) + '"><strong>' + escapeHtml(batch.originalFileName || "Extrato CSV") + '</strong><span>' +
              escapeHtml(formatStatus(batch.status)) + ' · ' + escapeHtml(String(batch.validRows || 0)) + ' linhas · ' +
              escapeHtml((batch.receivedAt || "").slice(0, 10).split("-").reverse().join("/")) + '</span></button>';
          }).join("");
          list.querySelectorAll("[data-batch-id]").forEach((button) => button.addEventListener("click", () => loadDetail(button.dataset.batchId)));
        }

        async function loadDetail(batchId) {
          detail.innerHTML = '<div class="empty-state"><strong>Carregando lote...</strong></div>';
          try {
            state.detail = await api("/api/import-batches/" + encodeURIComponent(batchId));
            renderBatchList();
            renderDetail();
          } catch (error) {
            detail.innerHTML = '<p class="error" role="alert">' + escapeHtml(error.message) + '</p>';
          }
        }

        function renderProblems(problems) {
          if (!problems || problems.length === 0) return "";
          return '<details class="problem-list"><summary>' + problems.length + ' aviso(s) do arquivo</summary>' +
            problems.map((problem) => '<p class="' + (problem.severity === "error" ? "error" : "warning") + '">' +
              (problem.rowNumber ? 'Linha ' + problem.rowNumber + ': ' : "") + escapeHtml(problem.message) + '</p>').join("") + '</details>';
        }

        function renderCandidate(candidate) {
          if (candidate.status !== "pending_review") return "";
          const label = candidate.kind === "reconciliation" ? "Conciliação sugerida" : "Possível duplicidade";
          return '<article class="candidate-card"><div><strong>' + escapeHtml(label) + '</strong><p>' +
            escapeHtml(candidate.explanation) + '</p></div><div class="inline-actions">' +
            '<button type="button" class="secondary-button" data-candidate-action="approve" data-candidate-id="' + escapeHtml(candidate.id) + '">Aplicar</button>' +
            '<button type="button" class="secondary-button danger-action" data-candidate-action="reject" data-candidate-id="' + escapeHtml(candidate.id) + '">Ignorar</button>' +
            '</div></article>';
        }

        function renderSuggestion(item, batch) {
          const payload = item.payload || {};
          const disabled = item.status !== "pending_review" || batch.status === "discarded";
          const categoryChoices = categories.filter((category) => category.kind === payload.kind);
          return '<article class="import-row" data-suggestion-id="' + escapeHtml(item.id) + '">' +
            '<div class="row-select"><input type="checkbox" data-select-suggestion value="' + escapeHtml(item.id) + '"' + (disabled ? " disabled" : "") + ' aria-label="Selecionar linha ' + escapeHtml(payload.sourceRowNumber) + '"></div>' +
            '<form class="row-editor">' +
              '<div class="row-heading"><strong>Linha ' + escapeHtml(payload.sourceRowNumber) + '</strong><span class="status-pill">' + escapeHtml(formatStatus(item.status)) + '</span></div>' +
              '<div class="row-fields">' +
                '<label>Data<input name="occurredOn" type="date" value="' + escapeHtml(payload.occurredOn) + '"' + (disabled ? " disabled" : "") + '></label>' +
                '<label>Tipo<select name="kind"' + (disabled ? " disabled" : "") + '><option value="expense"' + (payload.kind === "expense" ? " selected" : "") + '>Despesa</option><option value="income"' + (payload.kind === "income" ? " selected" : "") + '>Receita</option></select></label>' +
                '<label>Valor<input name="amount" inputmode="decimal" value="' + escapeHtml((Number(payload.amountMinor || 0) / 100).toFixed(2).replace(".", ",")) + '"' + (disabled ? " disabled" : "") + '></label>' +
                '<label class="description-field">Descrição<input name="description" maxlength="240" value="' + escapeHtml(payload.description) + '"' + (disabled ? " disabled" : "") + '></label>' +
                '<label>Conta<select name="accountId"' + (disabled ? " disabled" : "") + '>' + options(accounts, payload.accountId, "Selecione") + '</select></label>' +
                '<label>Categoria<select name="categoryId"' + (disabled ? " disabled" : "") + '>' + options(categoryChoices, payload.categoryId, "Sem categoria") + '</select></label>' +
              '</div>' +
              '<p class="row-summary">' + escapeHtml(formatMoney(payload.amountMinor, payload.currency)) + ' · ' + escapeHtml(item.explanation) + '</p>' +
              (disabled ? "" : '<div class="inline-actions"><button type="submit" class="secondary-button">Salvar correção</button><button type="button" data-line-action="approve">Confirmar</button><button type="button" class="secondary-button danger-action" data-line-action="reject">Rejeitar</button></div>') +
            '</form>' +
            '<div class="candidate-list">' + (item.candidates || []).map(renderCandidate).join("") + '</div>' +
          '</article>';
        }

        function renderDetail() {
          const data = state.detail;
          if (!data) return;
          const batch = data.importBatch;
          const pending = (data.suggestions || []).filter((item) => item.status === "pending_review").length;
          detail.innerHTML = '<div class="detail-heading"><div><p class="eyebrow">' + escapeHtml(formatStatus(batch.status)) + '</p><h3>' +
            escapeHtml(batch.originalFileName || "Extrato CSV") + '</h3><p class="muted">' + escapeHtml(String(batch.totalRows || 0)) +
            ' linhas · ' + escapeHtml(String(batch.problemRows || 0)) + ' com problema · ' + escapeHtml(String(pending)) + ' pendentes</p></div>' +
            (batch.status === "discarded" ? "" : '<div class="inline-actions"><button type="button" class="secondary-button" id="detect-import-duplicates">Buscar duplicidades</button><button type="button" class="secondary-button danger-action" id="discard-import">Descartar lote</button></div>') + '</div>' +
            renderProblems(data.problems) +
            (batch.status === "discarded" ? '<p class="warning">Este lote foi descartado e permanece somente para histórico e auditoria.</p>' : "") +
            '<div class="bulk-actions"><label><input type="checkbox" id="select-all-import-lines"> Selecionar pendentes</label><button type="button" id="approve-selected-import-lines" disabled>Confirmar selecionadas</button></div>' +
            '<div class="import-rows">' + ((data.suggestions || []).map((item) => renderSuggestion(item, batch)).join("") || '<div class="empty-state"><strong>Nenhuma linha disponível.</strong></div>') + '</div>' +
            '<p class="form-status muted" id="import-detail-status" role="status" aria-live="polite"></p>';
          wireDetailActions(batch.id);
        }

        function readRowPayload(formElement) {
          const values = new FormData(formElement);
          const amount = Number(String(values.get("amount") || "").replace(/\\./g, "").replace(",", "."));
          return {
            occurredOn: String(values.get("occurredOn") || ""),
            kind: String(values.get("kind") || "expense"),
            amountMinor: Math.round(amount * 100),
            description: String(values.get("description") || ""),
            accountId: String(values.get("accountId") || ""),
            categoryId: values.get("categoryId") ? String(values.get("categoryId")) : null
          };
        }

        function wireDetailActions(batchId) {
          const detailStatus = document.getElementById("import-detail-status");
          const selectedButton = document.getElementById("approve-selected-import-lines");
          const checkboxes = Array.from(detail.querySelectorAll("[data-select-suggestion]"));
          const refreshSelection = () => { if (selectedButton) selectedButton.disabled = !checkboxes.some((box) => box.checked); };
          checkboxes.forEach((box) => box.addEventListener("change", refreshSelection));
          const selectAll = document.getElementById("select-all-import-lines");
          if (selectAll) selectAll.addEventListener("change", () => { checkboxes.forEach((box) => { if (!box.disabled) box.checked = selectAll.checked; }); refreshSelection(); });

          detail.querySelectorAll(".row-editor").forEach((rowForm) => {
            const article = rowForm.closest("[data-suggestion-id]");
            const suggestionId = article.dataset.suggestionId;
            rowForm.addEventListener("submit", async (event) => {
              event.preventDefault();
              setStatus(detailStatus, "Salvando correção...", "muted");
              try {
                await api("/api/import-batches/" + batchId + "/suggestions/" + suggestionId, {
                  method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(readRowPayload(rowForm))
                });
                setStatus(detailStatus, "Correção salva. Candidaturas antigas foram invalidadas.", "success");
                await loadDetail(batchId);
              } catch (error) { setStatus(detailStatus, error.message, "error"); }
            });
            rowForm.querySelectorAll("[data-line-action]").forEach((button) => button.addEventListener("click", async () => {
              const action = button.dataset.lineAction;
              if (action === "reject" && !window.confirm("Rejeitar esta linha?")) return;
              setStatus(detailStatus, action === "approve" ? "Confirmando linha..." : "Rejeitando linha...", "muted");
              try {
                await api("/api/import-batches/" + batchId + "/suggestions/" + suggestionId + "/" + action, { method: "POST", headers: { "content-type": "application/json" } });
                await loadDetail(batchId);
              } catch (error) { setStatus(detailStatus, error.message, "error"); }
            }));
          });

          detail.querySelectorAll("[data-candidate-action]").forEach((button) => button.addEventListener("click", async () => {
            const action = button.dataset.candidateAction;
            if (!window.confirm(action === "approve" ? "Aplicar esta decisão ao lançamento?" : "Ignorar esta candidatura?")) return;
            setStatus(detailStatus, "Registrando decisão...", "muted");
            try {
              await api("/api/review-suggestions/" + button.dataset.candidateId + "/" + action, { method: "POST", headers: { "content-type": "application/json" } });
              await loadDetail(batchId);
            } catch (error) { setStatus(detailStatus, error.message, "error"); }
          }));

          if (selectedButton) selectedButton.addEventListener("click", async () => {
            const suggestionIds = checkboxes.filter((box) => box.checked).map((box) => box.value);
            if (suggestionIds.length === 0) return;
            setStatus(detailStatus, "Confirmando linhas selecionadas...", "muted");
            try {
              const result = await api("/api/import-batches/" + batchId + "/approve-selected", {
                method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ suggestionIds })
              });
              const failures = result.failures || [];
              setStatus(detailStatus, failures.length ? failures.length + " linha(s) precisam de correção." : "Linhas confirmadas.", failures.length ? "warning" : "success");
              await loadDetail(batchId);
            } catch (error) { setStatus(detailStatus, error.message, "error"); }
          });

          const detect = document.getElementById("detect-import-duplicates");
          if (detect) detect.addEventListener("click", async () => {
            setStatus(detailStatus, "Buscando duplicidades e conciliações...", "muted");
            try {
              await api("/api/import-batches/" + batchId + "/detect-duplicates", { method: "POST", headers: { "content-type": "application/json" } });
              await loadDetail(batchId);
            } catch (error) { setStatus(detailStatus, error.message, "error"); }
          });
          const discard = document.getElementById("discard-import");
          if (discard) discard.addEventListener("click", async () => {
            if (!window.confirm("Descartar este lote? As linhas pendentes serão encerradas, mas o histórico será mantido.")) return;
            setStatus(detailStatus, "Descartando lote...", "muted");
            try {
              await api("/api/import-batches/" + batchId + "/discard", { method: "POST", headers: { "content-type": "application/json" } });
              await loadBatches(batchId);
            } catch (error) { setStatus(detailStatus, error.message, "error"); }
          });
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
          previewResult.innerHTML = '<div class="preview-summary"><strong>' + escapeHtml(formatStatus(preview.state)) + '</strong><span>' +
            escapeHtml(String(preview.batch.validRows || 0)) + ' válidas · ' + escapeHtml(String(preview.batch.problemRows || 0)) + ' com problema</span></div>' +
            (sampleRows.length ? '<div class="preview-table-wrap"><table><thead><tr>' + (csv.headers || []).map((header) => '<th>' + escapeHtml(header) + '</th>').join("") + '</tr></thead><tbody>' +
              sampleRows.map((row) => '<tr>' + (csv.headers || []).map((header) => '<td>' + escapeHtml(row[header]) + '</td>').join("") + '</tr>').join("") + '</tbody></table></div>' : "") +
            renderProblems(problems);
          createButton.disabled = preview.state !== "ready" || !form.elements.accountId.value || !form.elements.consentAccepted.checked;
        }

        async function readSelectedFile() {
          const file = document.getElementById("csv-import-file").files[0];
          if (!file) throw new Error("Selecione um arquivo CSV.");
          state.fileContent = await file.text();
          state.fileName = file.name;
        }

        async function previewCsv() {
          setStatus(previewStatus, "Lendo e validando o arquivo...", "muted");
          createButton.disabled = true;
          try {
            await readSelectedFile();
            const body = {
              originalFileName: state.fileName,
              content: state.fileContent,
              accountId: form.elements.accountId.value || undefined,
              csvDelimiter: form.elements.csvDelimiter.value || undefined,
              csvMapping: currentMapping()
            };
            state.preview = await api("/api/import-batches/csv/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
            renderPreview(state.preview);
            setStatus(previewStatus, state.preview.state === "ready" ? "Preview pronto para revisão." : "Ajuste o mapeamento ou o separador e visualize novamente.", state.preview.state === "ready" ? "success" : "warning");
          } catch (error) {
            state.preview = null;
            previewResult.innerHTML = "";
            setStatus(previewStatus, error.message, "error");
          }
        }

        document.getElementById("preview-csv-import").addEventListener("click", previewCsv);
        form.addEventListener("change", () => { createButton.disabled = true; });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (!state.preview || state.preview.state !== "ready") return previewCsv();
          setStatus(previewStatus, "Criando lote para revisão...", "muted");
          createButton.disabled = true;
          try {
            const result = await api("/api/import-batches/csv", {
              method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
                originalFileName: state.fileName, content: state.fileContent,
                accountId: form.elements.accountId.value, consentAccepted: form.elements.consentAccepted.checked,
                csvDelimiter: form.elements.csvDelimiter.value || undefined, csvMapping: currentMapping()
              })
            });
            setStatus(previewStatus, result.duplicateBatch ? "Este lote já existia; o histórico foi aberto." : "Lote criado. Revise as linhas antes de confirmar.", "success");
            document.getElementById("csv-import-dialog").close();
            form.reset(); state.preview = null; state.fileContent = ""; previewResult.innerHTML = ""; mappingFields.hidden = true;
            await loadBatches(result.importBatch.id);
          } catch (error) { setStatus(previewStatus, error.message, "error"); createButton.disabled = false; }
        });

        filter.addEventListener("change", renderBatchList);
        document.getElementById("refresh-imports").addEventListener("click", () => loadBatches());
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
    @media (max-width: 1100px) { .row-fields { grid-template-columns: repeat(3, minmax(120px, 1fr)); } }
    @media (max-width: 800px) { .page-heading, .section-heading, .detail-heading { align-items: stretch; display: grid; } .import-layout { grid-template-columns: 1fr; } .import-batch-list { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); max-height: none; } .row-fields { grid-template-columns: 1fr 1fr; } .row-fields .description-field { grid-column: 1 / -1; } .candidate-card { align-items: stretch; display: grid; } }
    @media (max-width: 520px) { .row-fields { grid-template-columns: 1fr; } .row-fields .description-field { grid-column: auto; } .import-row { grid-template-columns: 1fr; } .candidate-list { grid-column: 1; } }
  `;
}
